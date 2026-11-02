import type { AiTryOnFitHint } from "./aiTryOnFitHints.js";

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

export type AiTryOnImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface AiTryOnInlineImage {
  readonly mimeType: AiTryOnImageMimeType;
  /** Base64 bytes without a `data:` prefix. */
  readonly data: string;
}

export interface AiTryOnGenerationRequest {
  readonly mode: AiTryOnMode;
  /** Opaque draft/order identity used for the per-order try limit. */
  readonly orderKey: string;
  /** Workflow fingerprint (`tryon-v1-…`) this generation belongs to. */
  readonly inputFingerprint: string;
  readonly personImage: AiTryOnInlineImage;
  readonly garmentImage: AiTryOnInlineImage;
  /** Required in `fabric` mode, refused in `garment` mode. */
  readonly fabricSwatchImage?: AiTryOnInlineImage;
  readonly fitHints?: readonly AiTryOnFitHint[];
}

export type AiTryOnErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "ORDER_TRY_LIMIT_REACHED"
  | "GLOBAL_LIMIT_REACHED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_FAILED";

export type AiTryOnAvailabilityResponse =
  | { readonly status: "available"; readonly triesPerOrder: number }
  | { readonly status: "unavailable"; readonly code: "NOT_CONFIGURED" | "GLOBAL_LIMIT_REACHED" };

export interface AiTryOnGenerationSuccess {
  readonly status: "completed";
  readonly inputFingerprint: string;
  readonly resultReference: {
    readonly kind: "verified_private_try_on_result";
    readonly assetId: string;
    readonly ownerBindingId: string;
  };
  /** Returned inline only. Not stored by Step 3. */
  readonly image: { readonly mimeType: string; readonly data: string };
  readonly orderTriesRemaining: number;
}

export interface AiTryOnErrorResponse {
  readonly error: string;
  readonly code: AiTryOnErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;
}

/** Locked limits (Xavier). */
export const AI_TRY_ON_GLOBAL_GENERATION_CAP = 1000;
export const AI_TRY_ON_TRIES_PER_ORDER = 5;

/** Each decoded image stays small enough for Vercel's 4.5 MB request body. */
export const AI_TRY_ON_MAX_IMAGE_BYTES = 1_400_000;
export const AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES = 3_000_000;
