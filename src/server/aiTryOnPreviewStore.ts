import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { hashAiTryOnOrderKey } from "./aiTryOnUsageLimits.js";

/**
 * Private storage for generated AI Try-on previews (Step 6).
 *
 * - The customer's photo is NEVER stored here (or anywhere): only Gemini's
 *   output image is saved.
 * - Image bytes: Firebase Storage `ai-try-on-previews/<orderHash>/<id>.<ext>`,
 *   written by the Admin SDK with no download token, so there is no public
 *   URL. Client Storage rules deny the whole prefix (also for admins).
 * - Metadata: Firestore `aiTryOnPreviews/<sha256(order, wearer)>`, one doc
 *   per wearer per order (a new preview replaces the old one). Client rules
 *   deny the collection; only this server reads it.
 * - Owner access is by the order key only (the server compares hashes).
 * - Kept for up to 30 days (`expiresAt`), or until the order is placed (the
 *   browser deletes all previews for its order key when the draft is
 *   retired), or until the customer deletes it. Expired previews are never
 *   served and are deleted lazily; a Firestore TTL policy on
 *   `aiTryOnPreviews.expiresAt` and a Storage lifecycle rule on the prefix
 *   are the backstop (see the Step 6 PR).
 */
export const AI_TRY_ON_PREVIEW_COLLECTION = "aiTryOnPreviews";
export const AI_TRY_ON_PREVIEW_STORAGE_PREFIX = "ai-try-on-previews";
export const AI_TRY_ON_PREVIEW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface StoredAiTryOnPreviewSummary {
  readonly previewId: string;
  readonly wearerKey: string;
  readonly inputFingerprint: string;
  readonly expiresAt: string;
}

export interface AiTryOnPreviewStore {
  save(input: {
    orderKey: string;
    wearerKey: string;
    previewId: string;
    inputFingerprint: string;
    promptVersion: string;
    image: { mimeType: string; data: string };
  }): Promise<StoredAiTryOnPreviewSummary>;
  list(orderKey: string): Promise<StoredAiTryOnPreviewSummary[]>;
  read(
    orderKey: string,
    previewId: string,
  ): Promise<{ mimeType: string; data: string; summary: StoredAiTryOnPreviewSummary } | null>;
  /** Deletes one preview, or every preview of the order when previewId is null. */
  remove(orderKey: string, previewId: string | null): Promise<number>;
}

/** Minimal Admin Storage surface (injectable for tests). */
export interface AiTryOnPreviewBucket {
  file(path: string): {
    save(data: Buffer, options: { resumable: boolean; contentType: string; metadata: Record<string, unknown> }): Promise<unknown>;
    download(): Promise<[Buffer]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
  };
}

interface PreviewDoc {
  orderDocId: string;
  wearerKey: string;
  previewId: string;
  inputFingerprint: string;
  promptVersion: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
  createdAt: Date;
  expiresAt: Date;
}

const readMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === "function" ? Number(toMillis.call(value)) : null;
};

export const aiTryOnPreviewDocId = (orderKey: string, wearerKey: string): string =>
  createHash("sha256").update(`ai-try-on-preview\u0000${orderKey}\u0000${wearerKey}`).digest("hex");

export const createAiTryOnPreviewId = (): string => `tryon-${randomUUID()}`;

export const createAiTryOnPreviewStore = (
  db: Firestore,
  bucket: AiTryOnPreviewBucket,
  { now = Date.now }: { now?: () => number } = {},
): AiTryOnPreviewStore => {
  const collection = () => db.collection(AI_TRY_ON_PREVIEW_COLLECTION);
  const summarize = (doc: PreviewDoc): StoredAiTryOnPreviewSummary => ({
    previewId: doc.previewId,
    wearerKey: doc.wearerKey,
    inputFingerprint: doc.inputFingerprint,
    expiresAt: new Date(readMillis(doc.expiresAt) ?? 0).toISOString(),
  });
  const isLive = (doc: PreviewDoc) => {
    const expiresAt = readMillis(doc.expiresAt);
    return expiresAt !== null && expiresAt > now();
  };
  const deleteDoc = async (id: string, doc: PreviewDoc) => {
    await bucket.file(doc.storagePath).delete({ ignoreNotFound: true });
    await collection().doc(id).delete();
  };
  const orderDocs = async (orderKey: string) => {
    const orderDocId = `order-${hashAiTryOnOrderKey(orderKey)}`;
    const snapshot = await collection().where("orderDocId", "==", orderDocId).get();
    return snapshot.docs
      .map((entry) => ({ id: entry.id, doc: entry.data() as PreviewDoc }))
      .filter((entry) => entry.doc.orderDocId === orderDocId);
  };

  return {
    async save({ orderKey, wearerKey, previewId, inputFingerprint, promptVersion, image }) {
      const orderDocId = `order-${hashAiTryOnOrderKey(orderKey)}`;
      const id = aiTryOnPreviewDocId(orderKey, wearerKey);
      const extension = EXTENSIONS[image.mimeType] || "png";
      const storagePath = `${AI_TRY_ON_PREVIEW_STORAGE_PREFIX}/${orderDocId}/${previewId}.${extension}`;
      const bytes = Buffer.from(image.data, "base64");
      const createdAt = new Date(now());
      const doc: PreviewDoc = {
        orderDocId,
        wearerKey,
        previewId,
        inputFingerprint,
        promptVersion,
        storagePath,
        mimeType: image.mimeType,
        bytes: bytes.length,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + AI_TRY_ON_PREVIEW_RETENTION_MS),
      };
      const ref = collection().doc(id);
      const previous = await ref.get();
      await bucket.file(storagePath).save(bytes, {
        resumable: false,
        contentType: image.mimeType,
        // No firebaseStorageDownloadTokens: there is no public download URL.
        metadata: { cacheControl: "private, no-store", metadata: { kind: "ai-try-on-preview" } },
      });
      await ref.set(doc);
      const old = previous.exists ? (previous.data() as PreviewDoc) : null;
      if (old && old.storagePath && old.storagePath !== storagePath) {
        // The wearer's earlier preview is replaced, never kept alongside.
        await bucket.file(old.storagePath).delete({ ignoreNotFound: true }).catch(() => undefined);
      }
      return summarize(doc);
    },
    async list(orderKey) {
      const entries = await orderDocs(orderKey);
      const live: StoredAiTryOnPreviewSummary[] = [];
      for (const entry of entries) {
        if (isLive(entry.doc)) live.push(summarize(entry.doc));
        else await deleteDoc(entry.id, entry.doc).catch(() => undefined);
      }
      return live.sort((left, right) => left.wearerKey.localeCompare(right.wearerKey));
    },
    async read(orderKey, previewId) {
      const entry = (await orderDocs(orderKey)).find((item) => item.doc.previewId === previewId);
      if (!entry) return null;
      if (!isLive(entry.doc)) {
        await deleteDoc(entry.id, entry.doc).catch(() => undefined);
        return null;
      }
      const [bytes] = await bucket.file(entry.doc.storagePath).download();
      return { mimeType: entry.doc.mimeType, data: bytes.toString("base64"), summary: summarize(entry.doc) };
    },
    async remove(orderKey, previewId) {
      const entries = (await orderDocs(orderKey)).filter(
        (entry) => previewId === null || entry.doc.previewId === previewId,
      );
      for (const entry of entries) await deleteDoc(entry.id, entry.doc);
      return entries.length;
    },
  };
};
