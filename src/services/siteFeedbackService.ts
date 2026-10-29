import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase.js";
import { ensureCustomerUploadIdentity } from "./customerDesignUploadIdentity.js";
import {
  SITE_FEEDBACK_COLLECTION,
  buildSiteFeedbackCreatePayload,
  buildSiteFeedbackPhotoPath,
  type SiteFeedbackContext,
  type SiteFeedbackPhotoRecord,
  type SiteFeedbackValidation,
} from "../utils/siteFeedback.js";
import {
  prepareSiteFeedbackPhoto,
  type PreparedSiteFeedbackPhoto,
} from "../utils/siteFeedbackPhoto.js";

export interface SiteFeedbackSubmitDeps {
  newFeedbackId(): string;
  /** Firebase uid for the photo folder (anonymous for guests). */
  ensureUploadUid(): Promise<string>;
  preparePhoto(file: File): Promise<PreparedSiteFeedbackPhoto>;
  uploadPhoto(path: string, photo: PreparedSiteFeedbackPhoto): Promise<void>;
  /** The caller's uid for the `uid` field: signed-in (non-anonymous) users only. */
  signedInUid(): string | null;
  writeFeedback(feedbackId: string, data: Record<string, unknown>): Promise<void>;
}

const firebaseDeps: SiteFeedbackSubmitDeps = {
  newFeedbackId: () => doc(collection(db, SITE_FEEDBACK_COLLECTION)).id,
  ensureUploadUid: async () => (await ensureCustomerUploadIdentity()).uid,
  preparePhoto: prepareSiteFeedbackPhoto,
  uploadPhoto: async (path, photo) => {
    await uploadBytes(ref(storage, path), photo.blob, { contentType: photo.contentType });
  },
  signedInUid: () => {
    const firebaseUser = auth.currentUser;
    return firebaseUser && !firebaseUser.isAnonymous ? firebaseUser.uid : null;
  },
  writeFeedback: async (feedbackId, data) => {
    await setDoc(doc(db, SITE_FEEDBACK_COLLECTION, feedbackId), {
      ...data,
      createdAt: serverTimestamp(),
    });
  },
};

/**
 * Create-only write; firestore.rules forbids client reads, edits and deletes.
 * With a photo, the photo is uploaded first (guests get the same anonymous
 * upload identity as design uploads), then the document points at it.
 */
export async function submitSiteFeedback(
  value: Extract<SiteFeedbackValidation, { ok: true }>["value"],
  context: SiteFeedbackContext,
  photoFile: File | null = null,
  deps: SiteFeedbackSubmitDeps = firebaseDeps,
): Promise<string> {
  const feedbackId = deps.newFeedbackId();
  let photo: SiteFeedbackPhotoRecord | null = null;
  if (photoFile) {
    const uploadUid = await deps.ensureUploadUid();
    const prepared = await deps.preparePhoto(photoFile);
    const path = buildSiteFeedbackPhotoPath(uploadUid, feedbackId, prepared.contentType);
    await deps.uploadPhoto(path, prepared);
    photo = { path, contentType: prepared.contentType, sizeBytes: prepared.blob.size };
  }
  // The rules accept only the caller's own Firebase uid (or none).
  const { createdAt: _createdAt, ...data } = buildSiteFeedbackCreatePayload(
    value,
    { ...context, uid: deps.signedInUid() },
    null,
    photo,
  );
  await deps.writeFeedback(feedbackId, data);
  return feedbackId;
}
