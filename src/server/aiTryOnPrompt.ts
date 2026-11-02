import {
  AI_TRY_ON_FIT_HINT_IDS,
  AI_TRY_ON_FIT_HINT_LABELS,
  AI_TRY_ON_FIT_HINT_MAX_FIELDS,
  type AiTryOnFitHint,
} from "../utils/aiTryOnFitHints.js";
import {
  AI_TRY_ON_MODEL_PROMPT_VERSION,
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
export { AI_TRY_ON_MODEL_PROMPT_VERSION, AI_TRY_ON_PROMPT_VERSION };

const KEEP_PERSON =
  "Keep the person exactly as in image 1: identity, face, hair, skin tone, body shape, pose, hands and background.";

const REALISM =
  "Make it look real: natural drape, folds and fit on this body, with lighting and shadows that match image 1.";

const NOISE =
  "app or website interface, buttons, screens, text, logos, watermarks, mannequins, hangers, and any other person or model.";
const GARMENT_IGNORE_NOISE = `Ignore everything that is not the person or the garment: ${NOISE}`;
const FABRIC_IGNORE_NOISE = `Ignore everything that is not the person, the garment or the fabric: ${NOISE}`;

/**
 * v4 (live smoke test, 2 Nov 2026): fabric mode sent the catalogue colour
 * and category as text ("Brown (#724137), Lace") and told Gemini to follow
 * order details over the pictures, so a royal-blue wax print came back
 * brown. The swatch picture now always decides the fabric, and the fabric's
 * text labels no longer reach the prompt. Order details decide style only.
 */
const FABRIC_FROM_SWATCH =
  "From image 3 take only the fabric: colour, pattern, motif scale, texture and sheen. Image 3 always decides these; nothing in image 2 or in this text overrides it. The swatch is a close-up, so scale the pattern to real size on the body and keep it continuous across seams.";

const STAND_IN =
  "The person in image 2 is only a stand-in model. Never use their face, body, pose or background, and never return image 2.";

const IDENTITY_CHECK =
  "Check: the face, body and background must be the customer's from image 1, not the model's.";

const SWATCH_TEXT =
  "Ignore any labels, tags, stickers, codes or text printed on the swatch in image 3, and never put them in the image.";

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
  STAND_IN,
  KEEP_PERSON,
  "Copy only the ordered garment, not other clothing in image 2 such as trousers with a shirt.",
  "Replace only the clothing it covers; keep the customer's other clothing and shoes from image 1.",
  "Copy the garment faithfully: construction, cut, length, neckline, sleeves, colour, pattern, embroidery and trims. Do not redesign it.",
  REALISM,
  GARMENT_IGNORE_NOISE,
  OUTPUT,
  IDENTITY_CHECK,
];

/**
 * v5 (live retest, 2 Nov 2026): with the swatch-wins rule alone, Gemini
 * returned the garment photo's stand-in model (face, pose, background)
 * dressed in the right fabric, and copied the swatch's product code into the
 * corner. Fabric mode now gets garment mode's v3 protections (stand-in line,
 * image labels, closing identity check) plus SWATCH_TEXT.
 */
const FABRIC_MODE_LINES: readonly string[] = [
  "Virtual try-on photo edit with a fabric change.",
  "Image 1: the customer. Image 2: the garment design. Image 3: the fabric swatch.",
  "Edit image 1 so the person wears the garment from image 2, made from the fabric in image 3.",
  STAND_IN,
  KEEP_PERSON,
  "Replace only the clothing the garment covers.",
  "From image 2 take only the construction: cut, length, neckline, sleeves, seams, embroidery and trim placement. Ignore its original fabric colour and print.",
  FABRIC_FROM_SWATCH,
  "Use only what is in image 3. Do not invent or add prints, motifs or colours.",
  SWATCH_TEXT,
  REALISM,
  FABRIC_IGNORE_NOISE,
  OUTPUT,
  IDENTITY_CHECK,
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
 * line appears in fabric mode only (garment mode copies image 2's fabric)
 * and only points at image 3: no colour or category text (v4).
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
  // v4: the catalogue colour and category stay out of the prompt. Image 3
  // alone decides the fabric; text labels can be wrong and must never win.
  if (mode === "fabric" && orderDetails.fabric) {
    lines.push("Fabric: exactly as in image 3");
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
    mode === "fabric"
      ? "Order details, for the garment style only. Show these on the garment; where they differ from image 2, follow these. They never change the fabric from image 3. Never write any of it on the image:"
      : "Order details. Show these on the garment; where they differ from image 2, follow these. Never write any of it on the image:",
    ...lines,
  ]
    .slice(0, AI_TRY_ON_ORDER_DETAILS_MAX_LINES)
    .join("\n");
};

/**
 * A short text label sent right before each image, so Gemini cannot mix up
 * the customer and the catalogue model. Garment mode since v3, fabric mode
 * since v5.
 */
export const buildAiTryOnImageLabels = (mode: AiTryOnMode): readonly string[] =>
  mode === "fabric"
    ? [
        "Image 1, the customer to edit:",
        "Image 2, garment reference only. The person wearing it is a stand-in model; do not use them:",
        "Image 3, fabric swatch, for colour and pattern only:",
      ]
    : [
        "Image 1, the customer to edit:",
        "Image 2, garment reference only. The person wearing it is a stand-in model; do not use them:",
      ];

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

// ------------------------------------------------------------ model mode

/**
 * Model mode ("No photo? Try it on a model"): image 1 is one of our default
 * studio models instead of the customer. Both garment and fabric mode reuse
 * the v3 garment-mode protections: the person in the garment reference is a
 * stand-in who must never replace our studio model, only the ordered
 * garment is copied, the studio model keeps their other clothing and shoes,
 * and the prompt ends with an identity check. Every image gets a label.
 * No fit block: fit hints describe the customer, not the model. Versioned
 * by AI_TRY_ON_MODEL_PROMPT_VERSION (pinned in test_ai_try_on_default_models).
 */
const KEEP_MODEL =
  "Keep the studio model exactly as in image 1: identity, face, hair, skin tone, body shape, pose, hands and background.";
const MODEL_STAND_IN =
  "Any person in image 2 is only a stand-in. Never use their face, body, pose or background, and never return image 2.";
const MODEL_OUTPUT =
  "Output one photorealistic full-body photo of the studio model from image 1 only, head to feet in frame. No text, labels, numbers, logos, watermarks or borders anywhere in the image.";
const MODEL_CHECK =
  "Check: the face, body, skin tone and background must be the studio model's from image 1, not the stand-in's.";

const MODEL_GARMENT_MODE_LINES: readonly string[] = [
  "Virtual try-on photo edit on a studio model.",
  "Image 1: our studio model. Image 2: a garment reference photo.",
  "Edit image 1 so the studio model wears the ordered garment from image 2.",
  MODEL_STAND_IN,
  KEEP_MODEL,
  "Copy only the ordered garment, not other clothing in image 2 such as trousers with a shirt.",
  "Replace only the clothing it covers; keep the studio model's other clothing and shoes from image 1.",
  "Copy the garment faithfully: construction, cut, length, neckline, sleeves, colour, pattern, embroidery and trims. Do not redesign it.",
  REALISM,
  `Ignore everything that is not the studio model or the garment: ${NOISE}`,
  MODEL_OUTPUT,
  MODEL_CHECK,
];

const MODEL_FABRIC_MODE_LINES: readonly string[] = [
  "Virtual try-on photo edit on a studio model, with a fabric change.",
  "Image 1: our studio model. Image 2: the garment design. Image 3: the fabric swatch.",
  "Edit image 1 so the studio model wears the ordered garment from image 2, made from the fabric in image 3.",
  MODEL_STAND_IN,
  KEEP_MODEL,
  "Copy only the ordered garment, not other clothing in image 2 such as trousers with a shirt.",
  "Replace only the clothing it covers; keep the studio model's other clothing and shoes from image 1.",
  "From image 2 take only the construction: cut, length, neckline, sleeves, seams, embroidery and trim placement. Ignore its original fabric colour and print.",
  FABRIC_FROM_SWATCH,
  "Use only what is in image 3. Do not invent or add prints, motifs or colours.",
  SWATCH_TEXT,
  REALISM,
  `Ignore everything that is not the studio model, the garment or the fabric: ${NOISE}`,
  MODEL_OUTPUT,
  MODEL_CHECK,
];

export const buildAiTryOnModelImageLabels = (mode: AiTryOnMode): readonly string[] =>
  mode === "fabric"
    ? [
        "Image 1, the studio model to dress:",
        "Image 2, garment design reference only. Any person wearing it is a stand-in; do not use them:",
        "Image 3, fabric swatch for the garment:",
      ]
    : [
        "Image 1, the studio model to dress:",
        "Image 2, garment reference only. Any person wearing it is a stand-in; do not use them:",
      ];

export const buildAiTryOnModelPrompt = ({
  mode,
  orderDetails,
}: {
  mode: AiTryOnMode;
  orderDetails?: AiTryOnOrderDetails | null;
}): string =>
  [
    (mode === "fabric" ? MODEL_FABRIC_MODE_LINES : MODEL_GARMENT_MODE_LINES).join("\n"),
    buildAiTryOnOrderDetailsBlock({ mode, orderDetails }),
  ]
    .filter(Boolean)
    .join("\n\n");
