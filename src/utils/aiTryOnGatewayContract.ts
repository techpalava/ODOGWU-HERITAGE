import type { AiTryOnFitHint } from "./aiTryOnFitHints.js";
import type { AiTryOnOrderDetails } from "./aiTryOnOrderDetails.js";

/**
 * Shared contract for the AI Try-on gateway.
 *
 * `GET  /api/ai-try-on` → availability.
 * `POST /api/ai-try-on` → one server-side Gemini generation.
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
 */
export const AI_TRY_ON_PROMPT_VERSION = "tryon-prompt-v3" as const;

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
  readonly personImage: AiTryOnInlineImage;
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
  | "AUTH_REQUIRED";

/** A stored preview of this session's order (Step 6). */
export interface AiTryOnStoredPreviewSummary {
  readonly previewId: string;
  readonly wearerKey: string;
  readonly inputFingerprint: string;
  readonly expiresAt: string;
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
