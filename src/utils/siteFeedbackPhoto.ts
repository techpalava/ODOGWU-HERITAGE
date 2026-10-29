import {
  SITE_FEEDBACK_LIMITS,
  isSiteFeedbackPhotoType,
  type SiteFeedbackPhotoType,
} from "./siteFeedback.js";

export interface PreparedSiteFeedbackPhoto {
  blob: Blob;
  contentType: SiteFeedbackPhotoType;
}

/** Longest side capped at `maxDimension`, aspect ratio kept. */
export function fitSiteFeedbackPhoto(
  width: number,
  height: number,
  maxDimension: number = SITE_FEEDBACK_LIMITS.photoMaxDimension,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Shrinks a picked photo on the device before upload: longest side at most
 * 1600 px, re-encoded as WebP (JPEG where the browser cannot encode WebP).
 * Keeps the original file when it is already small and cannot be decoded or
 * re-encoding would make it bigger.
 */
export async function prepareSiteFeedbackPhoto(
  file: File,
): Promise<PreparedSiteFeedbackPhoto> {
  if (!isSiteFeedbackPhotoType(file.type)) {
    throw new Error("Unsupported photo type");
  }
  const original: PreparedSiteFeedbackPhoto = { blob: file, contentType: file.type };
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return original;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original;
  }
  try {
    const size = fitSiteFeedbackPhoto(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    let blob = await canvasToBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
    }
    if (!blob || !isSiteFeedbackPhotoType(blob.type)) return original;
    const resized = size.width !== bitmap.width || size.height !== bitmap.height;
    if (!resized && blob.size >= file.size) return original;
    return { blob, contentType: blob.type };
  } finally {
    bitmap.close();
  }
}
