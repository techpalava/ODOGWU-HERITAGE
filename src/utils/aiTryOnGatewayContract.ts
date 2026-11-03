import type { AiTryOnFitHint } from "./aiTryOnFitHints.js";
import type { AiTryOnOrderDetails } from "./aiTryOnOrderDetails.js";

/**
 * Shared contract for the AI Try-on gateway.
 *
 * `GET  /api/ai-try-on` → availability.
 * `POST /api/ai-try-on` → one server-side Gemini generation.
 * `DELETE /api/ai-try-on?busyJobId=…&wearerKey=…` → give up a busy job
 *   (refunds its held try once).
 *
 * On Vercel the path is rewritten onto
 * api/design-studio/transfer-uploaded-design-draft.ts (`?route=ai-try-on`)
 * because the project is at the 12-function Hobby cap.
 */
export const AI_TRY_ON_ROUTE = "ai-try-on" as const;
export const AI_TRY_ON_ENDPOINT = "/api/ai-try-on" as const;

/**
 * Two separate prompt modes. They are never mixed:
 * - `garment`: clean person photo + garment image.
 * - `fabric`: clean person photo + garment image + fabric swatch.
 */
export type AiTryOnMode = "garment" | "fabric";

/**
 * Version of the server prompt text (src/server/aiTryOnPrompt.ts).
 * Bump on any wording change. Folded into the Try-on fingerprint so a result
 * made with older wording turns stale. v1 was the Step 3 trial wording.
 * v3: garment mode treats the catalogue model as a stand-in and copies only
 * the ordered garment (fabric-mode text unchanged).
 * v4: fabric mode lets the swatch (image 3) always decide the fabric; the
 * catalogue colour/category text is no longer sent, and order details
 * decide style only.
 * v5: fabric mode also gets the v3 stand-in line, image labels and identity
 * check, and ignores any text printed on the swatch.
 * v6: the server sends a central crop of the swatch and asks Gemini for the
 * customer photo's nearest aspect ratio (request change, same wording).
 * v7: photo mode keeps image 1 for identity and pose only, makes the named
 * garment type mandatory (a Standard Dress must not become a Long Shirt,
 * tunic or senator style), copies construction only from image 2, locks
 * fabric mode to the swatch, and replaces clothing the ordered garment
 * covers so a full outfit already in the photo cannot fight the order.
 */
export const AI_TRY_ON_PROMPT_VERSION = "tryon-prompt-v7" as const;

/**
 * Version of the model-mode prompt text (default try-on models). Separate
 * from AI_TRY_ON_PROMPT_VERSION so the photo flow's fingerprints never turn
 * stale because of model-mode wording. Folded into the shared model-result
 * cache key: bump on any model-mode wording change.
 * v2: same swatch-wins fabric rule as photo prompt v4.
 * v3: fabric mode ignores any text printed on the swatch (as photo v5).
 * v4: the swatch is sent as a central crop (as photo v6). The cache key
 * hashes the cropped bytes too; the bump makes the change explicit.
 */
export const AI_TRY_ON_MODEL_PROMPT_VERSION = "tryon-model-prompt-v4" as const;

/**
 * Mode choice (Xavier): fabric mode when the garment has an assigned fabric
 * swatch image, garment mode otherwise.
 */
export const chooseAiTryOnMode = ({
  hasFabricSwatch,
}: {
  hasFabricSwatch: boolean;
}): AiTryOnMode => (hasFabricSwatch ? "fabric" : "garment");

export type AiTryOnImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface AiTryOnInlineImage {
  readonly mimeType: AiTryOnImageMimeType;
  /** Base64 bytes without a `data:` prefix. */
  readonly data: string;
}

export interface AiTryOnGenerationRequest {
  readonly mode: AiTryOnMode;
  /** Workflow fingerprint (`tryon-v1-…`) this generation belongs to. */
  readonly inputFingerprint: string;
  /** The customer's photo. Exactly one of personImage / defaultModelId. */
  readonly personImage?: AiTryOnInlineImage;
  /**
   * Model mode: one of AI_TRY_ON_DEFAULT_MODELS. The server loads the
   * picture itself; garment and fabric must be catalogue URLs, and no fit
   * hints are sent (they describe the customer, not the model).
   */
  readonly defaultModelId?: string;
  /** Garment picture: inline, or (Step 6) a catalogue URL the server loads. */
  readonly garmentImage?: AiTryOnInlineImage;
  readonly garmentImageUrl?: string;
  /** Required in `fabric` mode (inline or URL), refused in `garment` mode. */
  readonly fabricSwatchImage?: AiTryOnInlineImage;
  readonly fabricSwatchImageUrl?: string;
  /** Wearer the preview belongs to (one stored preview per wearer). */
  readonly wearerKey?: string;
  readonly fitHints?: readonly AiTryOnFitHint[];
  /** Visible order details (ids/enums only); rendered server-side. */
  readonly orderDetails?: AiTryOnOrderDetails | null;
  /**
   * Retry of a busy (over-capacity) try: the id from the PROVIDER_BUSY
   * answer. The held try is reused, so nothing is charged again.
   */
  readonly busyJobId?: string;
}

export type AiTryOnErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "ORDER_TRY_LIMIT_REACHED"
  | "ACCOUNT_TRY_LIMIT_REACHED"
  | "GLOBAL_LIMIT_REACHED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_FAILED"
  | "REFERENCE_IMAGE_UNAVAILABLE"
  | "PREVIEW_NOT_FOUND"
  /** Step 7: no open server session for this caller (call `?action=session`). */
  | "SESSION_REQUIRED"
  /** Step 7: a Firebase ID token was sent but could not be verified. */
  | "AUTH_REQUIRED"
  /**
   * Gemini is over capacity. With `busyJobId`: the try is held, send the
   * same request again with that id. Without: the last retry failed too and
   * the try was refunded.
   */
  | "PROVIDER_BUSY"
  /** A busy retry whose session has closed (order placed or cleared). */
  | "SESSION_CLOSED"
  /** A busy retry whose job no longer exists (finished, refunded or another design). */
  | "BUSY_JOB_GONE"
  /** A new request while this wearer's busy retry is running. */
  | "BUSY_JOB_ACTIVE";

/** A stored preview of this session's order (Step 6). */
export interface AiTryOnStoredPreviewSummary {
  readonly previewId: string;
  readonly wearerKey: string;
  readonly inputFingerprint: string;
  readonly expiresAt: string;
  /** Set when the preview shows a default model rather than the customer. */
  readonly modelId?: string;
}

export type AiTryOnAvailabilityResponse =
  | {
      readonly status: "available";
      readonly triesPerOrder: number;
      /** Present on `POST ?action=session` (Step 7). */
      readonly orderTriesRemaining?: number;
      /** Signed-in customers only: tries left in the account's 30-day window. */
      readonly accountTriesRemaining?: number;
      /** Live stored previews of the session (`POST ?action=session`). */
      readonly previews?: readonly AiTryOnStoredPreviewSummary[];
      /**
       * Guests only: the server-issued session token to send back in the
       * `X-AI-Try-On-Session` header. Signed-in customers get null; their
       * session is found from the Firebase ID token.
       */
      readonly sessionToken?: string | null;
    }
  | {
      readonly status: "unavailable";
      readonly code: "NOT_CONFIGURED" | "GLOBAL_LIMIT_REACHED" | "RATE_LIMITED" | "AUTH_REQUIRED";
    };

/** Step 7: header carrying a guest's server-issued session token. */
export const AI_TRY_ON_SESSION_HEADER_NAME = "X-AI-Try-On-Session";

export interface AiTryOnGenerationSuccess {
  readonly status: "completed";
  readonly inputFingerprint: string;
  readonly resultReference: {
    readonly kind: "verified_private_try_on_result";
    readonly assetId: string;
    readonly ownerBindingId: string;
  };
  /** Returned inline; also stored privately when `previewStored` is true. */
  readonly image: { readonly mimeType: string; readonly data: string };
  readonly previewStored: boolean;
  readonly previewExpiresAt?: string;
  readonly orderTriesRemaining: number;
  /** Signed-in customers only. */
  readonly accountTriesRemaining?: number;
  /** Prompt wording the image was made with. */
  readonly promptVersion: string;
  /** Model mode only: the default model shown. */
  readonly modelId?: string;
  /**
   * Model mode only: true when a saved result was reused. A reused result
   * never uses a try and never calls Gemini.
   */
  readonly cacheHit?: boolean;
}

export interface AiTryOnErrorResponse {
  readonly error: string;
  readonly code: AiTryOnErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
  /** Tries left for the order after a refunded (uncounted) failure. */
  readonly orderTriesRemaining?: number;
  /** Signed-in customers only: account tries left after a refunded failure. */
  readonly accountTriesRemaining?: number;
  /** PROVIDER_BUSY only: the held job to retry with. */
  readonly busyJobId?: string;
}

/** Locked limits (Xavier). */
export const AI_TRY_ON_GLOBAL_GENERATION_CAP = 1000;
export const AI_TRY_ON_TRIES_PER_ORDER = 5;
/** Signed-in accounts: at most 15 previews in any rolling 30 days, across orders. */
export const AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW = 15;
export const AI_TRY_ON_ACCOUNT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Each decoded image stays small enough for Vercel's 4.5 MB request body. */
export const AI_TRY_ON_MAX_IMAGE_BYTES = 1_400_000;
export const AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES = 3_000_000;
