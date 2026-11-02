import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AI_TRY_ON_ORDER_IMAGE_RETENTION_DAYS } from "../utils/aiTryOnOrderImageCopy.js";
import type { AiTryOnPreviewBucket, AiTryOnPreviewStore } from "./aiTryOnPreviewStore.js";

/**
 * The AI preview saved with a paid order (60 days after payment).
 *
 * - Before payment, the browser tells the server which of its session's
 *   stored previews are current for the order (`aiTryOnOrderSelections`).
 *   Only previews of the caller's own session, with the same design
 *   fingerprint, are accepted; out-of-date ones are never sent.
 * - When the payment is recorded, the selected previews are copied (before
 *   the session's previews are deleted) to
 *   `ai-try-on-order-images/<orderId>/<wearer>.<ext>` in the try-on bucket,
 *   and `aiTryOnOrderImages/<orderId>` records them. Idempotent: a repeat
 *   payment event finds the record and copies nothing.
 * - Deleted on request (My Orders, admin, cancellation or refund); the
 *   bucket lifecycle rule (61 days) and the record's `expiresAt` are the
 *   backstops.
 * Both collections are server-only (Firestore rules deny every client).
 */
export const AI_TRY_ON_ORDER_SELECTION_COLLECTION = "aiTryOnOrderSelections";
export const AI_TRY_ON_ORDER_IMAGE_COLLECTION = "aiTryOnOrderImages";
export const AI_TRY_ON_ORDER_IMAGE_STORAGE_PREFIX = "ai-try-on-order-images";
export const AI_TRY_ON_ORDER_IMAGE_RETENTION_MS = AI_TRY_ON_ORDER_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const AI_TRY_ON_ORDER_SELECTION_LIMIT = 20;
const ORDERS_COLLECTION = "orders";

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const WEARER_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const PREVIEW_ID_PATTERN = /^tryon-[0-9a-f-]{36}$/;
const FINGERPRINT_PATTERN = /^tryon-v1-[0-9a-f]{16}$/;
const LABEL_MAX = 80;

export interface AiTryOnOrderSelectionInput {
  readonly wearerKey: string;
  readonly previewId: string;
  readonly inputFingerprint: string;
  readonly label: string;
}

export interface AiTryOnOrderSelection {
  readonly wearerKey: string;
  readonly previewId: string;
  readonly label: string;
  readonly onModel: boolean;
}

export interface AiTryOnOrderImage {
  readonly wearerKey: string;
  readonly label: string;
  readonly onModel: boolean;
  readonly path: string;
  readonly mimeType: string;
  readonly bytes: number;
}

export interface AiTryOnOrderImageRecord {
  readonly orderId: string;
  readonly ownerUid: string;
  readonly status: "saved" | "deleted";
  readonly images: readonly AiTryOnOrderImage[];
  readonly createdAt: Date;
  /** Firestore TTL field; the files also go at 61 days (bucket lifecycle). */
  readonly expiresAt: Date;
  readonly deletedAt?: Date;
  readonly deletedReason?: AiTryOnOrderImageDeleteReason;
}

export type AiTryOnOrderImageDeleteReason = "customer" | "admin" | "cancelled" | "refunded";

export const isAiTryOnOrderId = (value: unknown): value is string =>
  typeof value === "string" && ORDER_ID_PATTERN.test(value);

/** Strict parse of the browser's selection list; null when malformed. */
export const parseAiTryOnOrderSelectionInput = (
  value: unknown,
): AiTryOnOrderSelectionInput[] | null => {
  if (!Array.isArray(value) || value.length > AI_TRY_ON_ORDER_SELECTION_LIMIT) return null;
  const parsed: AiTryOnOrderSelectionInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const { wearerKey, previewId, inputFingerprint, label } = entry as Record<string, unknown>;
    if (
      typeof wearerKey !== "string" ||
      !WEARER_KEY_PATTERN.test(wearerKey) ||
      typeof previewId !== "string" ||
      !PREVIEW_ID_PATTERN.test(previewId) ||
      typeof inputFingerprint !== "string" ||
      !FINGERPRINT_PATTERN.test(inputFingerprint) ||
      typeof label !== "string"
    ) {
      return null;
    }
    if (parsed.some((item) => item.wearerKey === wearerKey)) return null;
    parsed.push({ wearerKey, previewId, inputFingerprint, label: label.trim().slice(0, LABEL_MAX) });
  }
  return parsed;
};

export const aiTryOnOrderImagePath = (orderId: string, wearerKey: string, mimeType: string): string => {
  const wearer = createHash("sha256").update(wearerKey).digest("hex").slice(0, 32);
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "webp";
  return `${AI_TRY_ON_ORDER_IMAGE_STORAGE_PREFIX}/${orderId}/${wearer}.${extension}`;
};

export type SaveAiTryOnOrderSelectionResult =
  | "saved"
  | "cleared"
  | "order_not_found"
  | "preview_not_found"
  | "already_saved";

/**
 * Records which of the caller's previews go with the order. The order must
 * belong to the caller; every preview must be in the caller's session with
 * the same design fingerprint.
 */
export const saveAiTryOnOrderSelection = async ({
  db,
  store,
  sessionId,
  uid,
  orderId,
  selections,
  now = Date.now,
}: {
  db: Firestore;
  store: AiTryOnPreviewStore;
  sessionId: string;
  uid: string;
  orderId: string;
  selections: readonly AiTryOnOrderSelectionInput[];
  now?: () => number;
}): Promise<SaveAiTryOnOrderSelectionResult> => {
  const order = await db.collection(ORDERS_COLLECTION).doc(orderId).get();
  if (!order.exists || (order.data() as { ownerUid?: unknown } | undefined)?.ownerUid !== uid) {
    return "order_not_found";
  }
  const saved = await db.collection(AI_TRY_ON_ORDER_IMAGE_COLLECTION).doc(orderId).get();
  if (saved.exists) return "already_saved";
  const selectionRef = db.collection(AI_TRY_ON_ORDER_SELECTION_COLLECTION).doc(orderId);
  if (selections.length === 0) {
    await selectionRef.delete();
    return "cleared";
  }
  const stored = await store.list(sessionId);
  const accepted: AiTryOnOrderSelection[] = [];
  for (const selection of selections) {
    const preview = stored.find(
      (entry) =>
        entry.previewId === selection.previewId &&
        entry.wearerKey === selection.wearerKey &&
        entry.inputFingerprint === selection.inputFingerprint,
    );
    if (!preview) return "preview_not_found";
    accepted.push({
      wearerKey: selection.wearerKey,
      previewId: selection.previewId,
      label: selection.label,
      onModel: Boolean(preview.modelId),
    });
  }
  await selectionRef.set({
    orderId,
    ownerUid: uid,
    selections: accepted,
    updatedAt: new Date(now()),
    // Unpaid orders' selections go with the previews (30 days).
    expiresAt: new Date(now() + 30 * 24 * 60 * 60 * 1000),
  });
  return "saved";
};

export type CopyAiTryOnOrderImagesResult = "copied" | "already_copied" | "no_selection" | "nothing_copied";

/**
 * At payment, before the session's previews are deleted: copies the
 * selected previews into the order's folder and records them. Idempotent.
 */
export const copyAiTryOnOrderImagesForPaidOrder = async ({
  db,
  store,
  bucket,
  sessionId,
  orderId,
  ownerUid,
  now = Date.now,
}: {
  db: Firestore;
  store: AiTryOnPreviewStore;
  bucket: AiTryOnPreviewBucket;
  sessionId: string;
  orderId: string;
  ownerUid: string;
  now?: () => number;
}): Promise<{ result: CopyAiTryOnOrderImagesResult; images: number }> => {
  if (!isAiTryOnOrderId(orderId)) return { result: "no_selection", images: 0 };
  const recordRef = db.collection(AI_TRY_ON_ORDER_IMAGE_COLLECTION).doc(orderId);
  if ((await recordRef.get()).exists) return { result: "already_copied", images: 0 };
  const selectionRef = db.collection(AI_TRY_ON_ORDER_SELECTION_COLLECTION).doc(orderId);
  const selectionDoc = await selectionRef.get();
  const selection = selectionDoc.exists
    ? (selectionDoc.data() as { ownerUid?: unknown; selections?: unknown })
    : null;
  if (!selection || selection.ownerUid !== ownerUid || !Array.isArray(selection.selections)) {
    return { result: "no_selection", images: 0 };
  }
  const images: AiTryOnOrderImage[] = [];
  for (const entry of selection.selections as AiTryOnOrderSelection[]) {
    const preview = await store.read(sessionId, entry.previewId);
    if (!preview || preview.summary.wearerKey !== entry.wearerKey) continue;
    const bytes = Buffer.from(preview.data, "base64");
    const path = aiTryOnOrderImagePath(orderId, entry.wearerKey, preview.mimeType);
    await bucket.file(path).save(bytes, {
      resumable: false,
      contentType: preview.mimeType,
      // No download token: the image is read only through the order route.
      metadata: { cacheControl: "private, no-store" },
    });
    images.push({
      wearerKey: entry.wearerKey,
      label: entry.label,
      onModel: entry.onModel,
      path,
      mimeType: preview.mimeType,
      bytes: bytes.length,
    });
  }
  if (images.length === 0) {
    await selectionRef.delete().catch(() => undefined);
    return { result: "nothing_copied", images: 0 };
  }
  const createdAt = new Date(now());
  const record: AiTryOnOrderImageRecord = {
    orderId,
    ownerUid,
    status: "saved",
    images,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + AI_TRY_ON_ORDER_IMAGE_RETENTION_MS),
  };
  await recordRef.set(record);
  await selectionRef.delete().catch(() => undefined);
  return { result: "copied", images: images.length };
};

/** Reads the record (null when none). Callers check who may see it. */
export const readAiTryOnOrderImageRecord = async (
  db: Firestore,
  orderId: string,
): Promise<AiTryOnOrderImageRecord | null> => {
  if (!isAiTryOnOrderId(orderId)) return null;
  const doc = await db.collection(AI_TRY_ON_ORDER_IMAGE_COLLECTION).doc(orderId).get();
  return doc.exists ? (doc.data() as AiTryOnOrderImageRecord) : null;
};

/**
 * Deletes the order's saved previews (files first, then the record is
 * marked deleted so the order views can say so). Safe to repeat.
 */
export const deleteAiTryOnOrderImages = async ({
  db,
  bucket,
  orderId,
  reason,
  now = Date.now,
}: {
  db: Firestore;
  bucket: AiTryOnPreviewBucket;
  orderId: string;
  reason: AiTryOnOrderImageDeleteReason;
  now?: () => number;
}): Promise<number> => {
  if (!isAiTryOnOrderId(orderId)) return 0;
  await db.collection(AI_TRY_ON_ORDER_SELECTION_COLLECTION).doc(orderId).delete().catch(() => undefined);
  const recordRef = db.collection(AI_TRY_ON_ORDER_IMAGE_COLLECTION).doc(orderId);
  const doc = await recordRef.get();
  if (!doc.exists) return 0;
  const record = doc.data() as AiTryOnOrderImageRecord;
  const images = Array.isArray(record.images) ? record.images : [];
  for (const image of images) {
    await bucket.file(image.path).delete({ ignoreNotFound: true });
  }
  if (record.status !== "deleted" || images.length > 0) {
    await recordRef.set({
      ...record,
      status: "deleted",
      images: [],
      deletedAt: new Date(now()),
      deletedReason: record.deletedReason ?? reason,
    });
  }
  return images.length;
};
