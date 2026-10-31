import type { AiTryOnImageMimeType } from "../utils/aiTryOnGatewayContract.js";

/**
 * Re-encodes Gemini's preview (usually a ~1-2 MB PNG) to a compact WebP
 * before it is stored or returned (Step 7, low storage pressure):
 * long edge at most 1024 px (never enlarged), quality 80, metadata
 * stripped. The same compact bytes are stored and sent to the browser, so
 * there is exactly one copy and no thumbnail.
 *
 * sharp is loaded lazily, so routes that share this Vercel function and
 * never make a preview don't pay its load time on a cold start.
 */
export const AI_TRY_ON_PREVIEW_MAX_EDGE_PX = 1024;
export const AI_TRY_ON_PREVIEW_WEBP_QUALITY = 80;

export interface CompactAiTryOnPreview {
  readonly mimeType: AiTryOnImageMimeType;
  readonly data: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
}

export type CompactAiTryOnPreviewImage = (image: {
  mimeType: string;
  data: string;
}) => Promise<CompactAiTryOnPreview>;

type SharpModule = typeof import("sharp");
let sharpModule: Promise<SharpModule> | null = null;
const loadSharp = () => {
  sharpModule ??= import("sharp").then(
    (module) =>
      (module as unknown as { default?: SharpModule }).default ?? (module as unknown as SharpModule),
  );
  return sharpModule;
};

export const compactAiTryOnPreviewImage: CompactAiTryOnPreviewImage = async (image) => {
  const sharp = await loadSharp();
  const { data, info } = await sharp(Buffer.from(image.data, "base64"), {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: AI_TRY_ON_PREVIEW_MAX_EDGE_PX,
      height: AI_TRY_ON_PREVIEW_MAX_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: AI_TRY_ON_PREVIEW_WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  return {
    mimeType: "image/webp",
    data: data.toString("base64"),
    bytes: data.length,
    width: info.width,
    height: info.height,
  };
};
