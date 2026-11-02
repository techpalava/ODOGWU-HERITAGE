import type {
  FutureMeasurementEnteredBagV1,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
} from "../types.js";

/**
 * Tier-1 measurement fit hints for AI Try-on.
 *
 * A short list of centimetre values the prompt uses to judge proportions,
 * garment length and drape. Values come only from the customer's own
 * Measurement step (entered first, then the step's own calculation). Nothing
 * is invented: a missing measurement is simply left out, and an empty list
 * means the prompt has no fit block.
 *
 * Shared by the browser (fingerprint + request) and the server (re-validated
 * before it reaches the prompt).
 */

export const AI_TRY_ON_FIT_HINT_IDS = [
  "total_height",
  "shoulder_length",
  "chest_bust_circumference",
  "belly_circumference",
  "shirt_length_standard",
  "shirt_length_long",
  "dress_length_standard",
  "dress_length_long",
  "sleeve_length_sleeveless",
  "sleeve_length_short",
  "sleeve_length_mid",
  "sleeve_length_long",
] as const;

export type AiTryOnFitHintId = (typeof AI_TRY_ON_FIT_HINT_IDS)[number];

export interface AiTryOnFitHint {
  readonly id: AiTryOnFitHintId;
  /** Centimetres, rounded to 0.5 cm. */
  readonly valueCm: number;
}

/** Locked cap: at most 8 fields reach the prompt. */
export const AI_TRY_ON_FIT_HINT_MAX_FIELDS = 8;

/** Body measurements, in prompt order. */
const BODY_IDS: readonly AiTryOnFitHintId[] = [
  "total_height",
  "shoulder_length",
  "chest_bust_circumference",
  "belly_circumference",
];
/** Garment-length preferences. One of each group is used at most. */
const LENGTH_GROUPS: readonly (readonly AiTryOnFitHintId[])[] = [
  ["shirt_length_standard", "shirt_length_long"],
  ["dress_length_standard", "dress_length_long"],
  [
    "sleeve_length_long",
    "sleeve_length_mid",
    "sleeve_length_short",
    "sleeve_length_sleeveless",
  ],
];
/** Laid-flat sample widths are garment widths, not body circumferences. */
const SAMPLE_CLOTH_EXCLUDED_IDS = new Set<AiTryOnFitHintId>([
  "chest_bust_circumference",
  "belly_circumference",
]);

/** Plausible human ranges in cm. Anything outside is dropped, never clamped. */
const PLAUSIBLE_RANGE_CM: Readonly<Record<AiTryOnFitHintId, readonly [number, number]>> = {
  total_height: [80, 230],
  shoulder_length: [20, 70],
  chest_bust_circumference: [50, 200],
  belly_circumference: [40, 220],
  shirt_length_standard: [30, 150],
  shirt_length_long: [30, 170],
  dress_length_standard: [40, 180],
  dress_length_long: [40, 200],
  sleeve_length_sleeveless: [1, 40],
  sleeve_length_short: [5, 50],
  sleeve_length_mid: [10, 70],
  sleeve_length_long: [20, 100],
};

export const AI_TRY_ON_FIT_HINT_LABELS: Readonly<Record<AiTryOnFitHintId, string>> = {
  total_height: "Height",
  shoulder_length: "Shoulder width",
  chest_bust_circumference: "Chest/bust around",
  belly_circumference: "Belly around",
  shirt_length_standard: "Shirt length (standard)",
  shirt_length_long: "Shirt length (long)",
  dress_length_standard: "Dress length (standard)",
  dress_length_long: "Dress length (long)",
  sleeve_length_sleeveless: "Sleeveless finish length",
  sleeve_length_short: "Short sleeve length",
  sleeve_length_mid: "Mid sleeve length",
  sleeve_length_long: "Long sleeve length",
};

const FIT_HINT_ID_SET = new Set<string>(AI_TRY_ON_FIT_HINT_IDS);

const roundHalfCm = (value: number) => Math.round(value * 2) / 2;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isPlausible = (id: AiTryOnFitHintId, valueCm: unknown): valueCm is number => {
  if (typeof valueCm !== "number" || !Number.isFinite(valueCm)) return false;
  const [min, max] = PLAUSIBLE_RANGE_CM[id];
  return valueCm >= min && valueCm <= max;
};

const readValue = (
  bag: Record<string, FutureMeasurementValueV1> | undefined,
  id: AiTryOnFitHintId,
): number | null => {
  const value = bag?.[id];
  return isRecord(value) && isPlausible(id, value.valueCm) ? value.valueCm : null;
};

const lookup = (
  bags: readonly (FutureMeasurementEnteredBagV1 | undefined)[],
  garmentKeys: readonly string[],
  id: AiTryOnFitHintId,
): number | null => {
  for (const bag of bags) {
    if (!bag) continue;
    const shared = readValue(bag.shared, id);
    if (shared !== null) return shared;
    for (const garmentKey of garmentKeys) {
      const scoped = readValue(bag.byGarmentKey?.[garmentKey], id);
      if (scoped !== null) return scoped;
    }
  }
  return null;
};

/**
 * Builds Tier-1 fit hints from the Measurement step state.
 * Returns [] when no measurement method is selected, the state is invalid,
 * or no Tier-1 value exists. Customer-entered values win over the step's own
 * calculated values. `garmentKeys` sets lookup order for garment-scoped values.
 */
export const buildAiTryOnFitHints = ({
  measurement,
  garmentKeys = [],
}: {
  measurement: FutureMeasurementStateV1 | null | undefined;
  garmentKeys?: readonly string[];
}): AiTryOnFitHint[] => {
  if (!measurement || !isRecord(measurement) || !measurement.route) return [];
  if (measurement.calculationStatus === "invalid") return [];
  const invalidKeys = new Set(measurement.invalidInputKeys || []);
  const sampleCloth = measurement.route === "sample_cloth";
  const keys = garmentKeys.length
    ? garmentKeys
    : Object.keys(measurement.entered?.byGarmentKey || {}).sort();
  const bags = [measurement.entered, measurement.derived];
  const hints: AiTryOnFitHint[] = [];
  const push = (id: AiTryOnFitHintId) => {
    if (hints.length >= AI_TRY_ON_FIT_HINT_MAX_FIELDS) return false;
    if (invalidKeys.has(id)) return false;
    if (sampleCloth && SAMPLE_CLOTH_EXCLUDED_IDS.has(id)) return false;
    const valueCm = lookup(bags, keys, id);
    if (valueCm === null) return false;
    hints.push({ id, valueCm: roundHalfCm(valueCm) });
    return true;
  };
  BODY_IDS.forEach(push);
  for (const group of LENGTH_GROUPS) {
    for (const id of group) {
      if (push(id)) break;
    }
  }
  return hints;
};

/**
 * Server-side boundary parse. Drops unknown ids, duplicates and implausible
 * values; never fills gaps. Returns null when the payload is not a list.
 */
export const normalizeAiTryOnFitHints = (
  value: unknown,
): AiTryOnFitHint[] | null => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > AI_TRY_ON_FIT_HINT_IDS.length) return null;
  const seen = new Set<string>();
  const hints: AiTryOnFitHint[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string") return null;
    if (!FIT_HINT_ID_SET.has(entry.id) || seen.has(entry.id)) return null;
    const id = entry.id as AiTryOnFitHintId;
    if (!isPlausible(id, entry.valueCm)) return null;
    seen.add(id);
    hints.push({ id, valueCm: roundHalfCm(entry.valueCm) });
  }
  return hints.slice(0, AI_TRY_ON_FIT_HINT_MAX_FIELDS);
};

/** Stable identity for the Try-on fingerprint. */
export const fitHintsFingerprintIdentity = (
  hints: readonly AiTryOnFitHint[] | null | undefined,
): Array<{ id: string; valueCm: number }> | null =>
  hints && hints.length
    ? [...hints]
        .map((hint) => ({ id: hint.id, valueCm: roundHalfCm(hint.valueCm) }))
        .sort((left, right) => left.id.localeCompare(right.id))
    : null;
