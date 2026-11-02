import {
  AI_TRY_ON_FIT_HINT_LABELS,
  AI_TRY_ON_FIT_HINT_MAX_FIELDS,
  type AiTryOnFitHint,
} from "../utils/aiTryOnFitHints.js";
import type { AiTryOnMode } from "../utils/aiTryOnGatewayContract.js";

/**
 * Server-only prompt text for AI Try-on. Garment mode and fabric mode are
 * separate prompts; a fabric swatch is only ever described in fabric mode.
 * Step 3 keeps the wording close to the Step 2 trial. Prompt polish is Step 4.
 */

const SHARED_RULES = [
  "Keep the person's identity, face, skin tone, body proportions, pose, and background.",
  "Do not add text, numbers, measurements, labels, logos, watermarks, user-interface elements, or extra people.",
  "Return one photorealistic image.",
];

const GARMENT_MODE_LINES = [
  "Virtual clothing try-on.",
  "The first image is a photo of a person.",
  "The second image is the garment design to try on.",
  "Edit the person photo so that person is wearing the garment from the second image.",
  "Keep the garment's colour, pattern, embroidery, cut, and silhouette.",
];

const FABRIC_MODE_LINES = [
  "Virtual clothing try-on with a fabric change.",
  "The first image is a photo of a person.",
  "The second image is the garment design: use it only for cut, silhouette, neckline, sleeves, and embroidery placement.",
  "The third image is a fabric swatch: use it only for the garment's colour, pattern, and texture.",
  "Edit the person photo so that person is wearing the garment from the second image, made in the fabric from the third image.",
  "Scale the fabric pattern realistically to the garment.",
];

/**
 * Short centimetre fit block. Empty hints → no block at all.
 * The numbers guide proportions only and must never appear in the image.
 */
export const buildAiTryOnFitBlock = (
  hints: readonly AiTryOnFitHint[] | null | undefined,
): string => {
  const usable = (hints || []).slice(0, AI_TRY_ON_FIT_HINT_MAX_FIELDS);
  if (usable.length === 0) return "";
  return [
    "Fit guidance from the customer's measurements (cm). Use it only to judge garment length, sleeve length, and how the garment drapes on this body. Never write these numbers or any text on the image.",
    ...usable.map((hint) => `- ${AI_TRY_ON_FIT_HINT_LABELS[hint.id]}: ${hint.valueCm} cm`),
  ].join("\n");
};

export const buildAiTryOnPrompt = ({
  mode,
  fitHints,
}: {
  mode: AiTryOnMode;
  fitHints?: readonly AiTryOnFitHint[] | null;
}): string => {
  const lines = mode === "fabric" ? FABRIC_MODE_LINES : GARMENT_MODE_LINES;
  const fitBlock = buildAiTryOnFitBlock(fitHints);
  return [lines.join(" "), SHARED_RULES.join(" "), fitBlock]
    .filter(Boolean)
    .join("\n\n");
};
