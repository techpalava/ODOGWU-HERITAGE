/**
 * Shared contract for `POST /api/client-image-error` (fabric photo load
 * failures). The browser builds this body; the server validates it again and
 * only writes a structured line to the Vercel logs. Nothing is stored.
 */

export const CLIENT_IMAGE_ERROR_ENDPOINT = "/api/client-image-error";

/** vercel.json rewrites the endpoint onto api/health.ts with this marker (12-function cap). */
export const CLIENT_IMAGE_ERROR_ROUTE = "client-image-error" as const;

/** Hard cap on the request body, in bytes. */
export const CLIENT_IMAGE_ERROR_MAX_BODY_BYTES = 2048;

export const CLIENT_IMAGE_ERROR_SURFACES = [
  "fabric-card",
  "fabric-preview",
  "summary-fabric",
] as const;
export type ClientImageErrorSurface = (typeof CLIENT_IMAGE_ERROR_SURFACES)[number];

export const CLIENT_IMAGE_ERROR_SOURCES = ["optimized", "original"] as const;
export type ClientImageErrorSource = (typeof CLIENT_IMAGE_ERROR_SOURCES)[number];

/** Values of `navigator.connection.effectiveType`. */
export const CLIENT_IMAGE_ERROR_CONNECTION_TYPES = ["slow-2g", "2g", "3g", "4g"] as const;
export type ClientImageErrorConnectionType =
  (typeof CLIENT_IMAGE_ERROR_CONNECTION_TYPES)[number];

export interface ClientImageErrorReport {
  /** Fabric code, e.g. "ODG-012". */
  fabricCode: string;
  /** Host of the URL that failed last, e.g. "firebasestorage.googleapis.com" or the site host. */
  imageHost: string;
  /** Number of failed loads so far for this image (all sources). */
  attempts: number;
  /** True when every retry failed and the colour block is showing. */
  finalFailure: boolean;
  surface: ClientImageErrorSurface;
  /** Which URL failed last: the resized `/_vercel/image` one or the original. */
  source: ClientImageErrorSource;
  online: boolean;
  effectiveType?: ClientImageErrorConnectionType | null;
  userAgent?: string;
}

export const CLIENT_IMAGE_ERROR_FIELD_LIMITS = {
  fabricCodeMaxLength: 40,
  imageHostMaxLength: 253,
  userAgentMaxLength: 300,
  maxAttempts: 100,
} as const;

export const CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/;
export const CLIENT_IMAGE_ERROR_HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::\d{1,5})?$/;
