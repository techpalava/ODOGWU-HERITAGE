import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract.js";
import {
  AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR,
  type AiTryOnDefaultModel,
} from "../utils/aiTryOnDefaultModels.js";
import { AiTryOnReferenceImageError, sniffAiTryOnImageMime } from "./aiTryOnReferenceImages.js";

/**
 * Reads a default model's picture from the deployed files, never over HTTP
 * (Preview deployments sit behind Vercel protection, and a fetch to our own
 * origin would be a needless SSRF surface). vercel.json bundles
 * public/ai-try-on-models/** into the AI Try-on function; locally the
 * same path is read from the repo. Files are tiny, so they are cached for
 * the life of the instance.
 */
export type LoadAiTryOnDefaultModelImage = (model: AiTryOnDefaultModel) => Promise<AiTryOnInlineImage>;

const cache = new Map<string, Promise<AiTryOnInlineImage>>();

export const aiTryOnDefaultModelImagePath = (model: AiTryOnDefaultModel, root = process.cwd()): string =>
  path.join(root, "public", AI_TRY_ON_DEFAULT_MODEL_PUBLIC_DIR, `${model.id}.webp`);

export const loadAiTryOnDefaultModelImage: LoadAiTryOnDefaultModelImage = (model) => {
  let pending = cache.get(model.id);
  if (!pending) {
    pending = readFile(aiTryOnDefaultModelImagePath(model))
      .then((bytes) => {
        const mimeType = sniffAiTryOnImageMime(bytes);
        if (mimeType !== "image/webp") throw new AiTryOnReferenceImageError("model_type");
        return { mimeType, data: bytes.toString("base64") } satisfies AiTryOnInlineImage;
      })
      .catch((error: unknown) => {
        cache.delete(model.id);
        throw error instanceof AiTryOnReferenceImageError
          ? error
          : new AiTryOnReferenceImageError("model_missing");
      });
    cache.set(model.id, pending);
  }
  return pending;
};
