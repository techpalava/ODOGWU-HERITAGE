import { getAdminServices } from "./firebaseAdmin.js";

/**
 * Where AI Try-on keeps its private files (`ai-try-on-previews/` and
 * `ai-try-on-model-results/`): a dedicated server-only bucket named by
 * `AI_TRY_ON_STORAGE_BUCKET` (soft delete off, so a delete is final).
 *
 * - Not a Firebase-registered bucket: only the Admin SDK reaches it, and
 *   previews are served inline to their owner by `/api/ai-try-on`.
 * - Unset or invalid name: the project's default bucket is used, so local,
 *   dev and older Preview deploys keep working. Outside production this is
 *   logged once per process.
 * - Production (`VERCEL_ENV=production`) without a valid name: AI Try-on
 *   reports itself unavailable (see `isAiTryOnEnabled`), so production never
 *   stores new previews in the default bucket.
 * - Catalogue, garment and fabric pictures are NOT affected: they stay in
 *   the default bucket and are read from there.
 */
export const AI_TRY_ON_STORAGE_BUCKET_ENV = "AI_TRY_ON_STORAGE_BUCKET";
/** Cloud Storage bucket names without dots (dotted names need domain verification). */
export const AI_TRY_ON_STORAGE_BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/;

type Environment = Record<string, string | undefined>;

/** The configured dedicated bucket name, or null when unset or invalid. */
export const readAiTryOnStorageBucketName = (environment: Environment = process.env): string | null => {
  const name = environment[AI_TRY_ON_STORAGE_BUCKET_ENV]?.trim() ?? "";
  return AI_TRY_ON_STORAGE_BUCKET_NAME_PATTERN.test(name) ? name : null;
};

/** False only in production without a valid dedicated bucket name. */
export const isAiTryOnStorageReady = (environment: Environment = process.env): boolean =>
  environment.VERCEL_ENV?.trim() !== "production" || readAiTryOnStorageBucketName(environment) !== null;

export interface AiTryOnStorageLike<Bucket> {
  bucket(name?: string): Bucket;
}

let loggedDefaultBucketFallback = false;

/** Test hook: forget that the fallback line was already logged. */
export const resetAiTryOnStorageBucketLogForTests = () => {
  loggedDefaultBucketFallback = false;
};

/**
 * The bucket for AI Try-on previews and shared model results: the dedicated
 * one when configured, otherwise the default bucket.
 */
export const aiTryOnStorageBucket = <Bucket = ReturnType<ReturnType<typeof getAdminServices>["storage"]["bucket"]>>({
  environment = process.env,
  storage = getAdminServices().storage as unknown as AiTryOnStorageLike<Bucket>,
  log = (line: string) => console.info(line),
}: {
  environment?: Environment;
  storage?: AiTryOnStorageLike<Bucket>;
  log?: (line: string) => void;
} = {}): Bucket => {
  const name = readAiTryOnStorageBucketName(environment);
  if (name) return storage.bucket(name);
  if (!loggedDefaultBucketFallback) {
    loggedDefaultBucketFallback = true;
    log(`AI Try-on storage: using the default bucket (${AI_TRY_ON_STORAGE_BUCKET_ENV} not set)`);
  }
  return storage.bucket();
};
