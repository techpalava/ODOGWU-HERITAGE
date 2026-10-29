import { collection, deleteField, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase.js";
import { ensureCustomerUploadIdentity } from "./customerDesignUploadIdentity.js";
import type { CustomerReview } from "../types.js";
import {
  CUSTOMER_REVIEWS_COLLECTION,
  buildApprovedCustomerReviewPhotoPath,
  buildCustomerReviewCreatePayload,
  buildCustomerReviewPhotoFields,
  buildCustomerReviewPhotoPath,
  type CustomerReviewValidation,
} from "../utils/customerReviews.js";
import type { PreparedCustomerReviewPhoto } from "../utils/customerReviewPhoto.js";

export type CustomerReviewPhotoSubmitStage = "identity" | "upload" | "write";

/** Tells the form which step failed so it can offer the right next action. */
export class CustomerReviewPhotoSubmitError extends Error {
  readonly stage: CustomerReviewPhotoSubmitStage;
  readonly cause: unknown;
  constructor(stage: CustomerReviewPhotoSubmitStage, cause: unknown) {
    super(`Customer review photo submit failed at ${stage}`);
    this.name = "CustomerReviewPhotoSubmitError";
    this.stage = stage;
    this.cause = cause;
  }
}

export interface CustomerReviewPhotoSubmitDeps {
  newReviewId(): string;
  /** Firebase uid for the photo folder (anonymous sign-in for guests). */
  ensureUploadUid(): Promise<string>;
  uploadPhoto(path: string, photo: PreparedCustomerReviewPhoto): Promise<void>;
  writeReview(reviewId: string, data: Record<string, unknown>): Promise<void>;
}

const firebaseSubmitDeps: CustomerReviewPhotoSubmitDeps = {
  newReviewId: () => doc(collection(db, CUSTOMER_REVIEWS_COLLECTION)).id,
  ensureUploadUid: async () => (await ensureCustomerUploadIdentity()).uid,
  uploadPhoto: async (path, photo) => {
    await uploadBytes(ref(storage, path), photo.blob, { contentType: photo.contentType });
  },
  writeReview: async (reviewId, data) => {
    await setDoc(doc(db, CUSTOMER_REVIEWS_COLLECTION, reviewId), {
      ...data,
      createdAt: serverTimestamp(),
    });
  },
};

/**
 * Publishes a review with a "wearing it" photo. Only the already-compressed
 * photo is accepted (see prepareCustomerReviewPhoto). The photo is uploaded
 * first to customer-review-photos/{uid}/{reviewId}/photo.{ext}, then the
 * review is written with photoStatus "pending". If the review write fails,
 * the client does not try to delete the uploaded file: storage.rules makes
 * delete admin-only, so the leftover file is removed by an admin or a later
 * clean-up job. Every attempt uses a fresh review id, so a retry never
 * collides with an earlier upload.
 */
export async function submitCustomerReviewWithPhoto(
  value: Extract<CustomerReviewValidation, { ok: true }>["value"],
  photo: PreparedCustomerReviewPhoto,
  deps: CustomerReviewPhotoSubmitDeps = firebaseSubmitDeps,
): Promise<string> {
  const reviewId = deps.newReviewId();
  let uid: string;
  try {
    uid = await deps.ensureUploadUid();
  } catch (error) {
    throw new CustomerReviewPhotoSubmitError("identity", error);
  }
  const path = buildCustomerReviewPhotoPath(uid, reviewId, photo.contentType);
  try {
    await deps.uploadPhoto(path, photo);
  } catch (error) {
    throw new CustomerReviewPhotoSubmitError("upload", error);
  }
  // firestore.rules: the photo folder must belong to the creator uid.
  const { createdAt: _createdAt, ...base } = buildCustomerReviewCreatePayload(value, uid, null);
  const data = {
    ...base,
    ...buildCustomerReviewPhotoFields({
      path,
      contentType: photo.contentType,
      sizeBytes: photo.blob.size,
    }),
  };
  try {
    await deps.writeReview(reviewId, data);
  } catch (error) {
    // No client delete: storage.rules allows delete for admins only, so the
    // orphaned upload is left for admin / scheduled clean-up.
    throw new CustomerReviewPhotoSubmitError("write", error);
  }
  return reviewId;
}

// --- Admin moderation ---------------------------------------------------------

export interface CustomerReviewPhotoAdminDeps {
  downloadUrl(path: string): Promise<string>;
  readPhoto(path: string): Promise<Blob>;
  uploadPublicPhoto(path: string, blob: Blob, contentType: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  updateReview(reviewId: string, patch: Record<string, unknown>): Promise<void>;
  /** Firestore sentinel that removes a field. */
  removeField(): unknown;
}

export const firebaseAdminPhotoDeps: CustomerReviewPhotoAdminDeps = {
  downloadUrl: (path) => getDownloadURL(ref(storage, path)),
  readPhoto: (path) => getBlob(ref(storage, path)),
  uploadPublicPhoto: async (path, blob, contentType) => {
    await uploadBytes(ref(storage, path), blob, { contentType });
  },
  deleteFile: async (path) => {
    await deleteObject(ref(storage, path));
  },
  updateReview: async (reviewId, patch) => {
    await updateDoc(doc(db, CUSTOMER_REVIEWS_COLLECTION, reviewId), patch);
  },
  removeField: () => deleteField(),
};

const isNotFound = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "storage/object-not-found");

async function deleteIfPresent(deps: CustomerReviewPhotoAdminDeps, path: string) {
  try {
    await deps.deleteFile(path);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

/** Admin: a short-lived link to the private, pending photo for the thumbnail. */
export function resolveReviewPhotoUrl(
  path: string,
  deps: CustomerReviewPhotoAdminDeps = firebaseAdminPhotoDeps,
): Promise<string> {
  return deps.downloadUrl(path);
}

/**
 * Admin: copies the private photo to communityPhotos/reviews/{reviewId}.webp
 * (public read), then marks it approved with that copy's URL.
 */
export async function approveReviewPhoto(
  review: Pick<CustomerReview, "id" | "photoPath" | "photoContentType">,
  deps: CustomerReviewPhotoAdminDeps = firebaseAdminPhotoDeps,
): Promise<string> {
  if (!review.photoPath) throw new Error("This review has no photo.");
  const blob = await deps.readPhoto(review.photoPath);
  const publicPath = buildApprovedCustomerReviewPhotoPath(review.id);
  const contentType = review.photoContentType || blob.type || "image/webp";
  await deps.uploadPublicPhoto(publicPath, blob, contentType);
  const photoUrl = await deps.downloadUrl(publicPath);
  await deps.updateReview(review.id, { photoStatus: "approved", photoUrl });
  return photoUrl;
}

const PHOTO_FIELDS = [
  "photoPath",
  "photoContentType",
  "photoSizeBytes",
  "photoConsent",
  "photoStatus",
  "photoUrl",
] as const;

/** Admin: deletes the uploaded file and any public copy, then clears the fields. */
export async function rejectReviewPhoto(
  review: Pick<CustomerReview, "id" | "photoPath">,
  deps: CustomerReviewPhotoAdminDeps = firebaseAdminPhotoDeps,
): Promise<void> {
  await deleteReviewPhotoFiles(review, deps);
  await deps.updateReview(
    review.id,
    Object.fromEntries(PHOTO_FIELDS.map((field) => [field, deps.removeField()])),
  );
}

/** Removes a review's photo files (private upload and public copy). */
export async function deleteReviewPhotoFiles(
  review: Pick<CustomerReview, "id" | "photoPath">,
  deps: CustomerReviewPhotoAdminDeps = firebaseAdminPhotoDeps,
): Promise<void> {
  if (review.photoPath) await deleteIfPresent(deps, review.photoPath);
  await deleteIfPresent(deps, buildApprovedCustomerReviewPhotoPath(review.id));
}
