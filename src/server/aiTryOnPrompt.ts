import {
  AI_TRY_ON_FIT_HINT_IDS,
  AI_TRY_ON_FIT_HINT_LABELS,
  AI_TRY_ON_FIT_HINT_MAX_FIELDS,
  type AiTryOnFitHint,
} from "../utils/aiTryOnFitHints.js";
import {
  AI_TRY_ON_PROMPT_VERSION,
  type AiTryOnMode,
} from "../utils/aiTryOnGatewayContract.js";
import {
  AI_TRY_ON_GARMENT_LABELS,
  AI_TRY_ON_MONOGRAM_PLACEMENT_LABELS,
  AI_TRY_ON_ORDER_FIELD_ORDER,
  AI_TRY_ON_VISIBLE_OPTIONS,
  type AiTryOnOrderDetails,
} from "../utils/aiTryOnOrderDetails.js";

/**
 * Server-only prompt text for AI Try-on (gemini-2.5-flash-image).
 *
 * Deterministic: the same mode and fit hints always give the same bytes.
 * Versioned: any wording change must bump AI_TRY_ON_PROMPT_VERSION, which is
 * folded into the browser's Try-on fingerprint so older results go stale.
 * The snapshot test in test_ai_try_on_prompt.ts pins the exact text.
 *
 * Garment mode and fabric mode are separate prompts. A fabric swatch is only
 * ever described in fabric mode.
 */
export { AI_TRY_ON_PROMPT_VERSION };

const KEEP_PERSON =
  "Keep the person exactly as in image 1: identity, face, hair, skin tone, body shape, pose, hands and background.";

const REALISM =
  "Make it look real: natural drape, folds and fit on this body, with lighting and shadows that match image 1.";

const NOISE =
  "app or website interface, buttons, screens, text, logos, watermarks, mannequins, hangers, and any other person or model.";
const GARMENT_IGNORE_NOISE = `Ignore everything that is not the person or the garment: ${NOISE}`;
const FABRIC_IGNORE_NOISE = `Ignore everything that is not the person, the garment or the fabric: ${NOISE}`;

const OUTPUT =
  "Output one photorealistic photo of this one person only, full body in frame when image 1 shows it; never crop a visible head or feet. No text, labels, numbers, logos, watermarks or borders anywhere in the image.";

/**
 * v3 (live smoke test, 31 Oct 2026): with only the customer and a catalogue
 * photo of a real model, Gemini returned the catalogue photo itself (the
 * model's face, body and background) and copied the whole outfit, trousers
 * included, for a shirt-only order. v3 names the model as a stand-in to
 * ignore, limits the copy to the ordered garments, keeps the customer's
 * other clothing, and ends with an identity check. Paired with the image
 * labels below.
 */
const GARMENT_MODE_LINES: readonly string[] = [
  "Virtual try-on photo edit.",
  "Image 1: the customer. Image 2: a garment reference photo.",
  "Edit image 1 so the customer wears the ordered garment from image 2.",
  "The person in image 2 is only a stand-in model. Never use their face, body, pose or background, and never return image 2.",
  KEEP_PERSON,
  "Copy only the ordered garment, not other clothing in image 2 such as trousers with a shirt.",
  "Replace only the clothing it covers; keep the customer's other clothing and shoes from image 1.",
  "Copy the garment faithfully: construction, cut, length, neckline, sleeves, colour, pattern, embroidery and trims. Do not redesign it.",
  REALISM,
  GARMENT_IGNORE_NOISE,
  OUTPUT,
  "Check: the face, body and background must be the customer's from image 1, not the model's.",
];

const FABRIC_MODE_LINES: readonly string[] = [
  "Virtual try-on photo edit with a fabric change.",
  "Image 1: the customer. Image 2: the garment design. Image 3: the fabric swatch.",
  "Edit image 1 so the person wears the garment from image 2, made from the fabric in image 3.",
  KEEP_PERSON,
  "Replace only the clothing the garment covers.",
  "From image 2 take only the construction: cut, length, neckline, sleeves, seams, embroidery and trim placement. Ignore its original fabric colour and print.",
  "From image 3 take only the fabric: colour, pattern, texture and sheen. The swatch is a close-up, so scale the pattern to real size on the body and keep it continuous across seams.",
  "Use only what is in image 3. Do not invent or add prints, motifs or colours.",
  REALISM,
  FABRIC_IGNORE_NOISE,
  OUTPUT,
];

const FIT_ORDER = new Map<string, number>(
  AI_TRY_ON_FIT_HINT_IDS.map((id, index) => [id, index]),
);

/**
 * Short centimetre fit block. Empty hints → no block at all.
 * Lines follow the canonical hint order, so input order never changes bytes.
 */
export const buildAiTryOnFitBlock = (
  hints: readonly AiTryOnFitHint[] | null | undefined,
): string => {
  const usable = [...(hints || [])]
    .filter((hint) => FIT_ORDER.has(hint.id))
    .sort((left, right) => FIT_ORDER.get(left.id)! - FIT_ORDER.get(right.id)!)
    .slice(0, AI_TRY_ON_FIT_HINT_MAX_FIELDS);
  if (usable.length === 0) return "";
  return [
    "Fit guide in cm, for garment length, sleeve length and ease only. Never show these numbers, and never reshape the person's body to match them:",
    ...usable.map((hint) => `- ${AI_TRY_ON_FIT_HINT_LABELS[hint.id]}: ${hint.valueCm}`),
  ].join("\n");
};

/** Hard cap on the order-details block, header included. */
export const AI_TRY_ON_ORDER_DETAILS_MAX_LINES = 18;

const FIELD_RANK = new Map<string, number>(
  AI_TRY_ON_ORDER_FIELD_ORDER.map((field, index) => [field, index]),
);

/**
 * Compact order-details block, rendered only from validated ids. The fabric
 * line appears in fabric mode only (garment mode copies image 2's fabric).
 * Monograms are described as a mark; the customer's letters never reach the
 * prompt. Empty details → no block at all.
 */
export const buildAiTryOnOrderDetailsBlock = ({
  mode,
  orderDetails,
}: {
  mode: AiTryOnMode;
  orderDetails?: AiTryOnOrderDetails | null;
}): string => {
  if (!orderDetails) return "";
  const lines: string[] = [];
  const fabric = mode === "fabric" ? orderDetails.fabric : undefined;
  if (fabric) {
    const colour = [fabric.colour, fabric.colourHex ? `(${fabric.colourHex})` : ""]
      .filter(Boolean)
      .join(" ");
    lines.push(`Fabric, as in image 3: ${[colour, fabric.category].filter(Boolean).join(", ")}`);
  }
  const numbered = orderDetails.garments.length > 1;
  orderDetails.garments.forEach((garment, index) => {
    lines.push(
      `Garment${numbered ? ` ${index + 1}` : ""}: ${AI_TRY_ON_GARMENT_LABELS[garment.garmentType]}`,
    );
    const byField = new Map<string, string[]>();
    for (const optionId of garment.optionIds) {
      const option = AI_TRY_ON_VISIBLE_OPTIONS.get(optionId);
      if (!option) continue;
      byField.set(option.field, [...(byField.get(option.field) || []), option.label]);
    }
    [...byField.entries()]
      .sort(([left], [right]) => (FIELD_RANK.get(left) ?? 99) - (FIELD_RANK.get(right) ?? 99))
      .forEach(([field, labels]) => lines.push(`- ${field}: ${labels.join("; ")}`));
    if (garment.decorations.includes("embroidery")) {
      lines.push("- Embroidery: as on the garment in image 2");
    }
    if (garment.decorations.includes("decorative_trimming")) {
      lines.push("- Trimming: decorative trim as on the garment in image 2");
    }
    if (garment.monogramPlacement) {
      lines.push(
        `- Monogram: one small embroidered mark on the ${AI_TRY_ON_MONOGRAM_PLACEMENT_LABELS[garment.monogramPlacement]}, with no letters or readable text`,
      );
    }
  });
  if (lines.length === 0) return "";
  return [
    "Order details. Show these on the garment; where they differ from image 2, follow these. Never write any of it on the image:",
    ...lines,
  ]
    .slice(0, AI_TRY_ON_ORDER_DETAILS_MAX_LINES)
    .join("\n");
};

/**
 * Garment mode only: a short text label sent right before each image, so
 * Gemini cannot mix up the customer and the catalogue model. Fabric mode
 * keeps its v2 layout (prompt, then images) and gets null.
 */
export const buildAiTryOnImageLabels = (mode: AiTryOnMode): readonly string[] | null =>
  mode === "garment"
    ? [
        "Image 1, the customer to edit:",
        "Image 2, garment reference only. The person wearing it is a stand-in model; do not use them:",
      ]
    : null;

export const buildAiTryOnPrompt = ({
  mode,
  fitHints,
  orderDetails,
}: {
  mode: AiTryOnMode;
  fitHints?: readonly AiTryOnFitHint[] | null;
  orderDetails?: AiTryOnOrderDetails | null;
}): string => {
  const lines = mode === "fabric" ? FABRIC_MODE_LINES : GARMENT_MODE_LINES;
  return [
    lines.join("\n"),
    buildAiTryOnOrderDetailsBlock({ mode, orderDetails }),
    buildAiTryOnFitBlock(fitHints),
  ]
    .filter(Boolean)
    .join("\n\n");
};
