import {
  CUSTOMER_REVIEW_PHOTO_LIMITS,
  validateCustomerReviewPhotoFile,
  type CustomerReviewPhotoType,
} from "./customerReviews.js";
import { fitSiteFeedbackPhoto } from "./siteFeedbackPhoto.js";

export interface PreparedCustomerReviewPhoto {
  blob: Blob;
  contentType: Extract<CustomerReviewPhotoType, "image/webp" | "image/jpeg">;
}

export type CustomerReviewPhotoErrorCode = "invalid-file" | "compression-failed";

export class CustomerReviewPhotoError extends Error {
  readonly code: CustomerReviewPhotoErrorCode;
  constructor(code: CustomerReviewPhotoErrorCode, message: string) {
    super(message);
    this.name = "CustomerReviewPhotoError";
    this.code = code;
  }
}

export const CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR =
  "We could not process this photo on your device. Please try a different photo, or submit without one.";

interface DecodedImage {
  width: number;
  height: number;
  close?: () => void;
}

interface EncodingCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): { drawImage(image: never, x: number, y: number, w: number, h: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void;
}

/** Browser hooks, injectable for tests. */
export interface CustomerReviewPhotoEncoder {
  decode(file: Blob): Promise<DecodedImage>;
  createCanvas(): EncodingCanvas;
}

const browserEncoder = (): CustomerReviewPhotoEncoder | null => {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return null;
  }
  return {
    decode: (file) => createImageBitmap(file),
    createCanvas: () => document.createElement("canvas") as unknown as EncodingCanvas,
  };
};

const toBlob = (canvas: EncodingCanvas, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });

/**
 * Same sizing and encoding as the site-feedback photo (longest side 1600 px,
 * WebP 0.82, JPEG 0.85 where WebP cannot be encoded), but STRICT: the photo
 * is always redrawn on a canvas, which drops EXIF/GPS data. If the device
 * cannot decode or re-encode it, the photo is rejected; the original file is
 * never returned, so it can never be uploaded.
 */
export async function prepareCustomerReviewPhoto(
  file: Blob & { type: string; size: number },
  encoder: CustomerReviewPhotoEncoder | null = browserEncoder(),
): Promise<PreparedCustomerReviewPhoto> {
  const invalid = validateCustomerReviewPhotoFile(file);
  if (invalid) throw new CustomerReviewPhotoError("invalid-file", invalid);
  const fail = () =>
    new CustomerReviewPhotoError("compression-failed", CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR);
  if (!encoder) throw fail();

  let image: DecodedImage;
  try {
    image = await encoder.decode(file);
  } catch {
    throw fail();
  }
  try {
    if (!image.width || !image.height) throw fail();
    const size = fitSiteFeedbackPhoto(
      image.width,
      image.height,
      CUSTOMER_REVIEW_PHOTO_LIMITS.maxDimension,
    );
    const canvas = encoder.createCanvas();
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw fail();
    context.drawImage(image as never, 0, 0, size.width, size.height);
    let blob = await toBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg", 0.85);
    }
    if (
      !blob ||
      (blob.type !== "image/webp" && blob.type !== "image/jpeg") ||
      blob.size <= 0 ||
      blob.size > CUSTOMER_REVIEW_PHOTO_LIMITS.maxBytes ||
      blob === file
    ) {
      throw fail();
    }
    return { blob, contentType: blob.type as PreparedCustomerReviewPhoto["contentType"] };
  } catch (error) {
    if (error instanceof CustomerReviewPhotoError) throw error;
    throw fail();
  } finally {
    image.close?.();
  }
}
