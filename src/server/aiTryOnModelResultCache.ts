import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  AI_TRY_ON_MODEL_PROMPT_VERSION,
  type AiTryOnInlineImage,
  type AiTryOnMode,
} from "../utils/aiTryOnGatewayContract.js";
import {
  orderDetailsFingerprintIdentity,
  type AiTryOnOrderDetails,
} from "../utils/aiTryOnOrderDetails.js";

/**
 * Shared cache of default-model try-on results ("Try it on a model").
 *
 * A model-mode result shows one of our fictional studio models in a
 * catalogue garment, so it holds no personal data and is reused across
 * customers: the same model + garment picture + fabric picture + visible
 * order details + model prompt version always gives the same key, and a
 * hit is served without using a try or calling Gemini.
 *
 * - Key: sha256 of a stable description of exactly what Gemini receives:
 *   model id and picture bytes, mode, garment and fabric picture bytes, the
 *   order details identity and AI_TRY_ON_MODEL_PROMPT_VERSION. Picture
 *   bytes (not URLs) are hashed, so a rotated download token still hits and
 *   a replaced picture misses. No fit hints, session, account or IP.
 * - Bytes: Storage `ai-try-on-model-results/<key>.webp` in the dedicated
 *   private bucket (`AI_TRY_ON_STORAGE_BUCKET`), Admin SDK only, no
 *   download token, `customTime` set to the last use.
 * - Record: Firestore `aiTryOnModelResults/<key>` with `lastUsedAt` and
 *   `expiresAt` = last use + 90 days. Both are bumped on every reuse.
 * - Deleted 90 days after the LAST use. Expired records are never served
 *   and are deleted lazily; at go-live, a Firestore TTL policy on
 *   `aiTryOnModelResults.expiresAt` and a Storage lifecycle rule
 *   (Delete, daysSinceCustomTime >= 90, prefix `ai-try-on-model-results/`)
 *   are the backstop.
 * - Not deleted at payment and not by "Delete my preview": those only
 *   touch the customer's own per-wearer copy in aiTryOnPreviews.
 */
export const AI_TRY_ON_MODEL_RESULT_COLLECTION = "aiTryOnModelResults";
export const AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX = "ai-try-on-model-results";
export const AI_TRY_ON_MODEL_RESULT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const CACHE_KEY_SCHEMA = "ai-try-on-model-result-v1";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const imageHash = (image: AiTryOnInlineImage) => sha256(Buffer.from(image.data, "base64"));

export const createAiTryOnModelResultKey = ({
  modelId,
  modelImage,
  mode,
  garmentImage,
  fabricImage,
  orderDetails,
}: {
  modelId: string;
  modelImage: AiTryOnInlineImage;
  mode: AiTryOnMode;
  garmentImage: AiTryOnInlineImage;
  fabricImage: AiTryOnInlineImage | null;
  orderDetails: AiTryOnOrderDetails | null;
}): string =>
  sha256(
    JSON.stringify([
      CACHE_KEY_SCHEMA,
      AI_TRY_ON_MODEL_PROMPT_VERSION,
      modelId,
      imageHash(modelImage),
      mode,
      imageHash(garmentImage),
      fabricImage ? imageHash(fabricImage) : null,
      // Sorted, ids-only identity (same as the browser fingerprint uses).
      JSON.stringify(orderDetailsFingerprintIdentity(orderDetails) ?? null),
    ]),
  );

export const aiTryOnModelResultStoragePath = (key: string): string =>
  `${AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX}/${key}.webp`;

export interface AiTryOnModelResultBucket {
  file(path: string): {
    save(data: Buffer, options: { resumable: boolean; contentType: string; metadata: Record<string, unknown> }): Promise<unknown>;
    download(): Promise<[Buffer]>;
    delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
    setMetadata(metadata: Record<string, unknown>): Promise<unknown>;
  };
}

interface ModelResultDoc {
  modelId: string;
  mode: AiTryOnMode;
  promptVersion: string;
  mimeType: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface AiTryOnModelResultCache {
  /** A live saved result (and bumps its last use), or null. Never throws. */
  reuse(key: string): Promise<{ mimeType: string; data: string } | null>;
  save(key: string, input: { modelId: string; mode: AiTryOnMode; image: { mimeType: string; data: string } }): Promise<void>;
}

const readMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === "function" ? Number(toMillis.call(value)) : null;
};

export const createAiTryOnModelResultCache = (
  db: Firestore,
  bucket: AiTryOnModelResultBucket,
  { now = Date.now }: { now?: () => number } = {},
): AiTryOnModelResultCache => {
  const docRef = (key: string) => db.collection(AI_TRY_ON_MODEL_RESULT_COLLECTION).doc(key);
  const drop = async (key: string) => {
    await bucket.file(aiTryOnModelResultStoragePath(key)).delete({ ignoreNotFound: true }).catch(() => undefined);
    await docRef(key).delete().catch(() => undefined);
  };
  return {
    async reuse(key) {
      try {
        const snapshot = await docRef(key).get();
        if (!snapshot.exists) return null;
        const doc = snapshot.data() as ModelResultDoc;
        const expiresAt = readMillis(doc.expiresAt);
        if (expiresAt === null || expiresAt <= now()) {
          await drop(key);
          return null;
        }
        const file = bucket.file(aiTryOnModelResultStoragePath(key));
        let bytes: Buffer;
        try {
          [bytes] = await file.download();
        } catch {
          // The record outlived its file: forget it so the next try regenerates.
          await drop(key);
          return null;
        }
        const usedAt = new Date(now());
        // Bumping the last use must never block serving the hit.
        await Promise.all([
          docRef(key)
            .set(
              { ...doc, lastUsedAt: usedAt, expiresAt: new Date(usedAt.getTime() + AI_TRY_ON_MODEL_RESULT_RETENTION_MS) },
            )
            .catch(() => undefined),
          file.setMetadata({ customTime: usedAt.toISOString() }).catch(() => undefined),
        ]);
        return { mimeType: doc.mimeType, data: bytes.toString("base64") };
      } catch {
        return null;
      }
    },
    async save(key, { modelId, mode, image }) {
      const createdAt = new Date(now());
      const file = bucket.file(aiTryOnModelResultStoragePath(key));
      try {
        await file.save(Buffer.from(image.data, "base64"), {
          resumable: false,
          contentType: image.mimeType,
          // No firebaseStorageDownloadTokens: there is no public download URL.
          metadata: { cacheControl: "private, no-store", customTime: createdAt.toISOString() },
        });
        const doc: ModelResultDoc = {
          modelId,
          mode,
          promptVersion: AI_TRY_ON_MODEL_PROMPT_VERSION,
          mimeType: image.mimeType,
          createdAt,
          lastUsedAt: createdAt,
          expiresAt: new Date(createdAt.getTime() + AI_TRY_ON_MODEL_RESULT_RETENTION_MS),
        };
        await docRef(key).set(doc);
      } catch (error) {
        await drop(key);
        throw error;
      }
    },
  };
};
