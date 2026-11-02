import type { AiTryOnImageMimeType, AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract.js";

/**
 * Server-side loading of the garment and fabric reference pictures (Step 6).
 *
 * The browser sends only the catalogue picture URL. The server reads the
 * picture itself, so the Storage bucket's CORS setting no longer matters
 * (it only allows the production origin). To prevent SSRF, only two sources
 * are accepted:
 * - our own Firebase Storage bucket, public storefront prefixes only
 *   (`styles/`, `fabrics/`, `designs/`), read through the Admin SDK (no
 *   HTTP request at all);
 * - `https://images.unsplash.com/` (seed catalogue pictures), fetched with a
 *   timeout, no redirects and a size cap.
 * Anything else is refused before a try is used.
 */
export const AI_TRY_ON_REFERENCE_MAX_BYTES = 7 * 1024 * 1024;
export const AI_TRY_ON_REFERENCE_PUBLIC_PREFIXES = ["styles/", "fabrics/", "designs/"] as const;
const UNSPLASH_HOST = "images.unsplash.com";
const FETCH_TIMEOUT_MS = 10_000;

export interface AiTryOnReferenceBucket {
  readonly name: string;
  file(path: string): { download(): Promise<[Buffer]> };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class AiTryOnReferenceImageError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AiTryOnReferenceImageError";
  }
}

export const sniffAiTryOnImageMime = (bytes: Buffer): AiTryOnImageMimeType | null => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

/** Object path in our bucket for a Firebase/GCS URL, or null. */
export const parseOwnBucketObjectPath = (url: URL, bucketName: string): string | null => {
  let objectPath: string | null = null;
  if (url.hostname === "firebasestorage.googleapis.com") {
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (match && match[1] === bucketName) objectPath = decodeURIComponent(match[2]);
  } else if (url.hostname === "storage.googleapis.com") {
    const prefix = `/${bucketName}/`;
    if (url.pathname.startsWith(prefix)) {
      objectPath = decodeURIComponent(url.pathname.slice(prefix.length));
    }
  }
  if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) return null;
  return AI_TRY_ON_REFERENCE_PUBLIC_PREFIXES.some((prefix) => objectPath!.startsWith(prefix))
    ? objectPath
    : null;
};

const toInline = (bytes: Buffer): AiTryOnInlineImage => {
  if (bytes.length === 0 || bytes.length > AI_TRY_ON_REFERENCE_MAX_BYTES) {
    throw new AiTryOnReferenceImageError("reference_size");
  }
  const mimeType = sniffAiTryOnImageMime(bytes);
  if (!mimeType) throw new AiTryOnReferenceImageError("reference_type");
  return { mimeType, data: bytes.toString("base64") };
};

export const loadAiTryOnReferenceImageOnServer = async (
  rawUrl: string,
  {
    bucket,
    fetchImpl = (input, init) => fetch(input, init),
  }: { bucket: AiTryOnReferenceBucket | null; fetchImpl?: FetchLike },
): Promise<AiTryOnInlineImage> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AiTryOnReferenceImageError("reference_url");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new AiTryOnReferenceImageError("reference_url");
  }
  const objectPath = bucket ? parseOwnBucketObjectPath(url, bucket.name) : null;
  if (bucket && objectPath) {
    let bytes: Buffer;
    try {
      [bytes] = await bucket.file(objectPath).download();
    } catch {
      throw new AiTryOnReferenceImageError("reference_missing");
    }
    return toInline(bytes);
  }
  if (url.hostname !== UNSPLASH_HOST) throw new AiTryOnReferenceImageError("reference_host");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url.toString(), {
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "image/jpeg,image/png,image/webp" },
    });
    if (!response.ok) throw new AiTryOnReferenceImageError("reference_missing");
    const declared = Number(response.headers.get("content-length") || "0");
    if (declared > AI_TRY_ON_REFERENCE_MAX_BYTES) throw new AiTryOnReferenceImageError("reference_size");
    return toInline(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    if (error instanceof AiTryOnReferenceImageError) throw error;
    throw new AiTryOnReferenceImageError("reference_fetch");
  } finally {
    clearTimeout(timer);
  }
};
