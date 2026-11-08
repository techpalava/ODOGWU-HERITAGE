import type { AiTryOnInlineImage } from "../utils/aiTryOnGatewayContract.js";

/**
 * Server-side picture preparation before Gemini (prompt v6 / model v4).
 *
 * Fabric swatch: keep only the central 60% of its width and height (a 20%
 * margin is dropped on every side). Catalogue swatch photos carry product
 * codes and selvedge text at the edges and corners; Gemini copied the
 * ODG-007 corner code "K253403" into previews even when told to ignore it
 * (live retest, 2 Nov 2026). The centre still holds many pattern repeats.
 *
 * Customer photo (photo flow only): Gemini answers 1:1 unless asked, which
 * cut a 2:3 full-body customer off at the knees. The nearest aspect ratio
 * Gemini supports is requested instead. Model mode keeps its fixed 3:4.
 *
 * sharp is loaded lazily, as in aiTryOnPreviewImage.ts.
 */
export const AI_TRY_ON_SWATCH_CROP_FRACTION = 0.6;
export const AI_TRY_ON_SWATCH_JPEG_QUALITY = 90;

/** gemini-2.5-flash-image imageConfig.aspectRatio values. */
export const AI_TRY_ON_GEMINI_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;
export type AiTryOnGeminiAspectRatio = (typeof AI_TRY_ON_GEMINI_ASPECT_RATIOS)[number];

type SharpModule = typeof import("sharp").default;
let sharpModule: Promise<SharpModule> | null = null;
const loadSharp = () => {
  sharpModule ??= import("sharp").then((module) => module.default);
  return sharpModule;
};

/** Nearest supported ratio, compared on a log scale so 2:1 and 1:2 are equally far from 1:1. */
export const nearestAiTryOnAspectRatio = (width: number, height: number): AiTryOnGeminiAspectRatio | null => {
  if (!(width > 0) || !(height > 0)) return null;
  const target = Math.log(width / height);
  let best: AiTryOnGeminiAspectRatio = "1:1";
  let bestDistance = Infinity;
  for (const ratio of AI_TRY_ON_GEMINI_ASPECT_RATIOS) {
    const [w, h] = ratio.split(":").map(Number);
    const distance = Math.abs(Math.log(w / h) - target);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
};

export type CropAiTryOnFabricSwatch = (image: AiTryOnInlineImage) => Promise<AiTryOnInlineImage>;

export const cropAiTryOnFabricSwatch: CropAiTryOnFabricSwatch = async (image) => {
  const sharp = await loadSharp();
  const oriented = await sharp(Buffer.from(image.data, "base64"), { failOn: "error" })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = oriented.info;
  const cropWidth = Math.max(1, Math.round(width * AI_TRY_ON_SWATCH_CROP_FRACTION));
  const cropHeight = Math.max(1, Math.round(height * AI_TRY_ON_SWATCH_CROP_FRACTION));
  const data = await sharp(oriented.data)
    .extract({
      left: Math.floor((width - cropWidth) / 2),
      top: Math.floor((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: AI_TRY_ON_SWATCH_JPEG_QUALITY })
    .toBuffer();
  return { mimeType: "image/jpeg", data: data.toString("base64") };
};

export type ReadAiTryOnPhotoAspectRatio = (
  image: AiTryOnInlineImage,
) => Promise<AiTryOnGeminiAspectRatio | null>;

/** Upright width/height of the photo (EXIF orientation applied). */
export const readAiTryOnPhotoAspectRatio: ReadAiTryOnPhotoAspectRatio = async (image) => {
  const sharp = await loadSharp();
  const meta = await sharp(Buffer.from(image.data, "base64")).metadata();
  if (!meta.width || !meta.height) return null;
  const turned = (meta.orientation ?? 1) >= 5;
  return nearestAiTryOnAspectRatio(turned ? meta.height : meta.width, turned ? meta.width : meta.height);
};
