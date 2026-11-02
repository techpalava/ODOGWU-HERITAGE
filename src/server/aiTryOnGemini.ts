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
  | { ok: true; image: { mimeType: string; data: string } }
  | {
      ok: false;
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

export const runAiTryOnGemini = async ({
  generateContent,
  prompt,
  images,
  imageLabels = null,
  timeoutMs = 50_000,
  secret,
}: {
  generateContent: AiTryOnGenerateContent;
  prompt: string;
  /** Ordered as described by the prompt: person, garment, then fabric swatch. */
  images: readonly AiTryOnInlineImage[];
  /** Optional text label sent before each image (garment mode, prompt v3). */
  imageLabels?: readonly string[] | null;
  timeoutMs?: number;
  secret?: string | null;
}): Promise<AiTryOnGeminiOutcome> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      config: { responseModalities: ["TEXT", "IMAGE"], abortSignal: controller.signal },
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
      reason: aborted
        ? "timeout"
        : `provider_error${status ? ` status=${status}` : ""} ${redactGeminiText(error, secret)}`.trim(),
    };
  } finally {
    clearTimeout(timer);
  }
};
