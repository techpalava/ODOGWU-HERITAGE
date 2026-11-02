import type { AiTryOnGeminiAspectRatio } from "./aiTryOnImagePrep.js";
import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract.js";

/**
 * Server-only Gemini image call for AI Try-on.
 *
 * The model is locked to gemini-2.5-flash-image (Xavier, Step 2 trial).
 * gemini-2.0-flash-preview-image-generation returns 404 and must not be used.
 * GEMINI_API_KEY is read from the server environment only. It is never
 * logged, returned, or sent to the browser.
 */
export const AI_TRY_ON_GEMINI_MODEL = "gemini-2.5-flash-image" as const;

const PLACEHOLDER_KEYS = new Set(["", "MY_GEMINI_API_KEY"]);

export const readGeminiApiKey = (
  environment: Record<string, string | undefined> = process.env,
): string | null => {
  const value = environment.GEMINI_API_KEY?.trim() || "";
  return PLACEHOLDER_KEYS.has(value) ? null : value;
};

/** Gemini request shape this module sends. Kept minimal for test doubles. */
export interface AiTryOnGeminiRequest {
  model: typeof AI_TRY_ON_GEMINI_MODEL;
  contents: Array<{
    role: "user";
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }>;
  config: {
    responseModalities: string[];
    abortSignal?: AbortSignal;
    /** Model mode only: keep the studio model's 3:4 full-body frame. */
    imageConfig?: { aspectRatio: AiTryOnGeminiAspectRatio };
  };
}

export interface AiTryOnGeminiResponseLike {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
}

export type AiTryOnGenerateContent = (
  request: AiTryOnGeminiRequest,
) => Promise<AiTryOnGeminiResponseLike>;

/** Lazily builds the real client so a missing key never crashes the function. */
export const createGeminiGenerateContent = (apiKey: string): AiTryOnGenerateContent => {
  let clientPromise: Promise<{ models: { generateContent(request: unknown): Promise<unknown> } }> | null = null;
  return async (request) => {
    clientPromise ||= import("@google/genai").then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey, vertexai: false }),
    );
    const client = await clientPromise;
    return (await client.models.generateContent(request)) as AiTryOnGeminiResponseLike;
  };
};

export type AiTryOnGeminiOutcome =
  | { ok: true; image: { mimeType: string; data: string }; attempts?: number }
  | {
      ok: false;
      /** Gemini calls made (2 after a capacity retry). */
      attempts?: number;
      /** `rejected`: safety/no-image answer. `failed`: transport or provider error. */
      kind: "rejected" | "failed";
      retryable: boolean;
      /** Short, key-free reason for server logs. */
      reason: string;
    };

const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /([?&]key=)[^&\s]+/gi,
  /[A-Za-z0-9+/]{80,}={0,2}/g,
];

export const redactGeminiText = (value: unknown, secret?: string | null): string => {
  let text =
    value instanceof Error ? value.message || value.name : String(value ?? "");
  if (secret) text = text.split(secret).join("[redacted]");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
};

const statusOf = (error: unknown): number | null => {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : null;
};

/**
 * Capacity retry (approved by Xavier, 2 Nov 2026, after a live 503 "This
 * model is currently experiencing high demand"). Only HTTP 503 / UNAVAILABLE
 * / overloaded / high demand is retried, once, after 2-4 s, and only when at
 * least 40 s of the Gemini budget would remain. 429 RESOURCE_EXHAUSTED is
 * NOT retried: on the Gemini API it usually means the key's quota or rate
 * limit, which a retry seconds later does not fix and may burn further.
 * The retry happens inside one runAiTryOnGemini call, so the handler
 * reserves the try once and refunds it once, and the IP and global
 * counters count it once.
 */
export const AI_TRY_ON_GEMINI_RETRY_BACKOFF_MS = 2_000;
export const AI_TRY_ON_GEMINI_RETRY_JITTER_MS = 2_000;
export const AI_TRY_ON_GEMINI_RETRY_MIN_REMAINING_MS = 40_000;

const CAPACITY_TEXT = /\b(UNAVAILABLE|overloaded|high demand)\b/i;

export const isGeminiCapacityError = (error: unknown, status = statusOf(error)): boolean => {
  if (status === 503) return true;
  if (status !== null) return false;
  return CAPACITY_TEXT.test(redactGeminiText(error));
};

/**
 * Gemini request limit. The AI Try-on function's maxDuration is 130 s
 * (vercel.json; Hobby with Fluid Compute allows up to 300 s). Outside
 * Gemini the handler spends ~2-2.5 s (session, rate limits, reference
 * fetches, swatch crop, re-encode, Storage/Firestore writes), so 120 s
 * leaves a 10 s margin. History: 50 s, then 55 s; live fabric-mode runs on
 * 2 Nov 2026 took 31-34 s but two timed out at 50 s and 55 s.
 */
export const AI_TRY_ON_GEMINI_TIMEOUT_MS = 120_000;

export const runAiTryOnGemini = async ({
  generateContent,
  prompt,
  images,
  imageLabels = null,
  aspectRatio = null,
  timeoutMs = AI_TRY_ON_GEMINI_TIMEOUT_MS,
  secret,
  now = Date.now,
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
}: {
  generateContent: AiTryOnGenerateContent;
  prompt: string;
  /** Ordered as described by the prompt: person, garment, then fabric swatch. */
  images: readonly AiTryOnInlineImage[];
  /** Optional text label sent before each image (garment mode, prompt v3). */
  imageLabels?: readonly string[] | null;
  /**
   * Model mode: output aspect ratio. Without it Gemini answers 1:1 and crops
   * a 3:4 full-body model at the shins (live check, 2 Nov 2026). Since
   * prompt v6 the photo flow sends the nearest ratio of the customer photo.
   */
  aspectRatio?: AiTryOnGeminiAspectRatio | null;
  timeoutMs?: number;
  secret?: string | null;
  /** Test seams for the capacity retry (real clock, timer and jitter by default). */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}): Promise<AiTryOnGeminiOutcome> => {
  // One budget for both attempts: the abort timer covers the whole call.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();
  const attempt = async (): Promise<AiTryOnGeminiOutcome & { capacity?: boolean }> => {
    try {
      const response = await generateContent({
        model: AI_TRY_ON_GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...images.flatMap((image, index) => {
                const label = imageLabels?.[index];
                const imagePart = { inlineData: { mimeType: image.mimeType, data: image.data } };
                return label ? [{ text: label }, imagePart] : [imagePart];
              }),
            ],
          },
        ],
        // Same modalities as the Step 2 trial that succeeded.
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          abortSignal: controller.signal,
          ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
        },
      });
      const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
      const parts = candidates.flatMap((candidate) =>
        Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [],
      );
      const imagePart = parts.find(
        (part) =>
          typeof part?.inlineData?.data === "string" &&
          part.inlineData.data.length > 0 &&
          /^image\/(png|jpeg|webp)$/.test(part.inlineData.mimeType || "image/png"),
      );
      if (imagePart?.inlineData?.data) {
        return {
          ok: true,
          image: {
            mimeType: imagePart.inlineData.mimeType || "image/png",
            data: imagePart.inlineData.data,
          },
        };
      }
      const finish = candidates[0]?.finishReason || "";
      const block = response?.promptFeedback?.blockReason || "";
      return {
        ok: false,
        kind: "rejected",
        retryable: !block,
        reason: `no_image${finish ? ` finish=${finish}` : ""}${block ? ` block=${block}` : ""}`,
      };
    } catch (error) {
      const status = statusOf(error);
      const aborted = controller.signal.aborted;
      return {
        ok: false,
        kind: "failed",
        retryable: aborted || status === null || status === 429 || status >= 500,
        capacity: !aborted && isGeminiCapacityError(error, status),
        reason: aborted
          ? "timeout"
          : `provider_error${status ? ` status=${status}` : ""} ${redactGeminiText(error, secret)}`.trim(),
      };
    }
  };
  const done = (outcome: AiTryOnGeminiOutcome & { capacity?: boolean }, attempts: number): AiTryOnGeminiOutcome => {
    const { capacity: _capacity, ...rest } = outcome;
    return { ...rest, attempts } as AiTryOnGeminiOutcome;
  };
  try {
    const first = await attempt();
    if (first.ok || !first.capacity) return done(first, 1);
    const backoffMs =
      AI_TRY_ON_GEMINI_RETRY_BACKOFF_MS + Math.floor(random() * AI_TRY_ON_GEMINI_RETRY_JITTER_MS);
    const remainingMs = timeoutMs - (now() - startedAt) - backoffMs;
    if (remainingMs < AI_TRY_ON_GEMINI_RETRY_MIN_REMAINING_MS) return done(first, 1);
    await sleep(backoffMs);
    if (controller.signal.aborted) return done(first, 1);
    return done(await attempt(), 2);
  } finally {
    clearTimeout(timer);
  }
};
