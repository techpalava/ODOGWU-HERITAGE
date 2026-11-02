import {
  AI_TRY_ON_MAX_IMAGE_BYTES,
  AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES,
  type AiTryOnInlineImage,
} from "./aiTryOnGatewayContract.js";

/**
 * Browser-side photo handling for AI Try-on (Step 5).
 *
 * The customer photo is checked for type and size, then always redrawn on a
 * canvas (which drops EXIF/GPS data) and re-encoded as a JPEG small enough
 * for the gateway. The original file is never sent. Garment and fabric
 * reference pictures go through the same encoder.
 *
 * Nothing here persists anything: the result lives only in memory.
 */

export const AI_TRY_ON_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AI_TRY_ON_PHOTO_ACCEPT = AI_TRY_ON_PHOTO_TYPES.join(",");
/** Largest original file we try to read on the device. */
export const AI_TRY_ON_PHOTO_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Longest side sent to the gateway. */
export const AI_TRY_ON_PHOTO_MAX_DIMENSION = 1024;

export const AI_TRY_ON_PHOTO_TYPE_ERROR = "Please choose a JPEG, PNG or WebP photo.";
export const AI_TRY_ON_PHOTO_SIZE_ERROR = "This photo is too large. Please choose one under 15 MB.";
export const AI_TRY_ON_PHOTO_PROCESSING_ERROR =
  "We couldn't read this photo on your device. Please try a different photo.";

export const validateAiTryOnPhotoFile = (
  file: { type: string; size: number } | null | undefined,
): string | null => {
  if (!file) return AI_TRY_ON_PHOTO_TYPE_ERROR;
  if (!(AI_TRY_ON_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return AI_TRY_ON_PHOTO_TYPE_ERROR;
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return AI_TRY_ON_PHOTO_TYPE_ERROR;
  if (file.size > AI_TRY_ON_PHOTO_MAX_FILE_BYTES) return AI_TRY_ON_PHOTO_SIZE_ERROR;
  return null;
};

export const fitAiTryOnImage = (
  width: number,
  height: number,
  maxDimension = AI_TRY_ON_PHOTO_MAX_DIMENSION,
): { width: number; height: number } => {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

interface DecodedImage {
  width: number;
  height: number;
  close?: () => void;
}

interface EncodingContext {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: never, x: number, y: number, w: number, h: number): void;
}

interface EncodingCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): EncodingContext | null;
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void;
}

/** Browser hooks, injectable for tests. */
export interface AiTryOnImageEncoder {
  decode(blob: Blob): Promise<DecodedImage>;
  createCanvas(): EncodingCanvas;
}

const browserEncoder = (): AiTryOnImageEncoder | null => {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return null;
  }
  return {
    decode: (blob) => createImageBitmap(blob),
    createCanvas: () => document.createElement("canvas") as unknown as EncodingCanvas,
  };
};

const toBlob = (canvas: EncodingCanvas, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });

export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

export class AiTryOnPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiTryOnPhotoError";
  }
}

/** Redraws and re-encodes one image as a JPEG within the gateway limit. */
export async function prepareAiTryOnInlineImage(
  blob: Blob,
  encoder: AiTryOnImageEncoder | null = browserEncoder(),
): Promise<AiTryOnInlineImage> {
  const fail = () => new AiTryOnPhotoError(AI_TRY_ON_PHOTO_PROCESSING_ERROR);
  if (!encoder) throw fail();
  let image: DecodedImage;
  try {
    image = await encoder.decode(blob);
  } catch {
    throw fail();
  }
  try {
    if (!image.width || !image.height) throw fail();
    const size = fitAiTryOnImage(image.width, image.height);
    const canvas = encoder.createCanvas();
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw fail();
    // White under transparent PNG/WebP areas, since JPEG has no alpha.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image as never, 0, 0, size.width, size.height);
    for (const quality of [0.86, 0.72, 0.6]) {
      const encoded = await toBlob(canvas, quality);
      if (!encoded || encoded.type !== "image/jpeg" || encoded.size <= 0) break;
      if (encoded.size <= AI_TRY_ON_MAX_IMAGE_BYTES) {
        return { mimeType: "image/jpeg", data: await blobToBase64(encoded) };
      }
    }
    throw fail();
  } catch (error) {
    if (error instanceof AiTryOnPhotoError) throw error;
    throw fail();
  } finally {
    image.close?.();
  }
}

/** Customer photo: validate first, then re-encode. */
export async function prepareAiTryOnPersonPhoto(
  file: Blob & { type: string; size: number },
  encoder?: AiTryOnImageEncoder | null,
): Promise<AiTryOnInlineImage> {
  const invalid = validateAiTryOnPhotoFile(file);
  if (invalid) throw new AiTryOnPhotoError(invalid);
  return prepareAiTryOnInlineImage(file, encoder);
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Garment or fabric picture from the catalogue, re-encoded the same way. */
export async function loadAiTryOnReferenceImage(
  url: string,
  {
    fetchImpl = (input, init) => fetch(input, init),
    encoder,
  }: { fetchImpl?: FetchLike; encoder?: AiTryOnImageEncoder | null } = {},
): Promise<AiTryOnInlineImage> {
  const response = await fetchImpl(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new AiTryOnPhotoError(AI_TRY_ON_PHOTO_PROCESSING_ERROR);
  return prepareAiTryOnInlineImage(await response.blob(), encoder);
}

/** Decoded byte size of base64 data (for the total-size check). */
export const inlineImageBytes = (image: AiTryOnInlineImage): number => {
  const padding = image.data.endsWith("==") ? 2 : image.data.endsWith("=") ? 1 : 0;
  return Math.floor((image.data.length * 3) / 4) - padding;
};

export const fitsAiTryOnTotalLimit = (images: readonly AiTryOnInlineImage[]): boolean =>
  images.reduce((total, image) => total + inlineImageBytes(image), 0) <=
  AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES;
