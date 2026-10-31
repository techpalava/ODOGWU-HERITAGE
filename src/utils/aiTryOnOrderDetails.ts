import { SEED_CUSTOM_DETAIL_CATALOG } from "../config/GarmentDetailsConfig.js";
import { STEP_1_GARMENT_DISPLAY_LABELS } from "./garmentConstructionPricing.js";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  DecorativeFeature,
  Fabric,
  FabricAllocation,
  GarmentConstructionPricingResolution,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MonogramPlacement,
  WearerOrderStateV2,
} from "../types.js";

/**
 * Structured, visible-only order details for the AI Try-on prompt.
 *
 * The browser builds this from data the Design Studio already holds and
 * sends ids/enums only. The server re-validates it and renders the text
 * (src/server/aiTryOnPrompt.ts), so no free text from the browser reaches
 * the prompt except a short sanitized fabric colour/category.
 *
 * Never included: prices, delivery/pickup, names, contact details, internal
 * ids, monogram letters, and invisible details (lining, net, informational
 * "no additional cost" rows, personalized-evaluation requests).
 * Missing data is omitted, never invented.
 */

export type AiTryOnDecoration = "embroidery" | "decorative_trimming";

export interface AiTryOnOrderGarment {
  readonly garmentType: CanonicalPhysicalGarmentType;
  /** Visible catalogue option ids (construction, neckline, pockets, ...). Sorted. */
  readonly optionIds: readonly string[];
  readonly decorations: readonly AiTryOnDecoration[];
  /** Present only when Name Monogram is selected with a placement. */
  readonly monogramPlacement?: MonogramPlacement;
}

export interface AiTryOnOrderFabric {
  readonly colour?: string;
  readonly colourHex?: string;
  readonly category?: string;
}

export interface AiTryOnOrderDetails {
  readonly garments: readonly AiTryOnOrderGarment[];
  /** The swatch fabric. Rendered in fabric mode only. */
  readonly fabric?: AiTryOnOrderFabric;
}

export const AI_TRY_ON_ORDER_DETAILS_MAX_GARMENTS = 4;

/** Selection groups that change what the garment looks like on the body. */
const VISIBLE_GROUP_FIELDS: Partial<Record<CustomDetailSelectionGroup, string>> = {
  shirt_construction: "Length and sleeves",
  dress_construction: "Length and sleeves",
  skirt_length: "Length",
  neck_design: "Neckline and collar",
  shirt_pockets: "Pockets",
  dress_pockets: "Pockets",
  skirt_pockets: "Pockets",
  trouser_pockets: "Pockets",
  standard_shorts_pockets: "Pockets",
  bum_shorts_pockets: "Pockets",
  trouser_fastening: "Waistband",
  standard_shorts_fastening: "Waistband",
  bum_shorts_fastening: "Waistband",
  dress_additional: "Accessories",
  standard_shorts_additional: "Extras",
};
/** Field order inside one garment. */
export const AI_TRY_ON_ORDER_FIELD_ORDER = [
  "Length and sleeves",
  "Length",
  "Neckline and collar",
  "Pockets",
  "Waistband",
  "Extras",
  "Accessories",
] as const;

/** Invisible or non-visual catalogue rows. */
const INVISIBLE_OPTION_PATTERN = /lining|(^|_)net($|_)|no_cost|evaluation/i;

export interface AiTryOnVisibleOption {
  readonly field: string;
  readonly label: string;
}

/**
 * optionId → visible label, from the seed catalogue. Admin overrides only
 * change price/active state for the same id, not what the option looks like.
 */
export const AI_TRY_ON_VISIBLE_OPTIONS: ReadonlyMap<string, AiTryOnVisibleOption> = new Map(
  SEED_CUSTOM_DETAIL_CATALOG.filter(
    (option) =>
      VISIBLE_GROUP_FIELDS[option.selectionGroup] !== undefined &&
      !option.informational &&
      !INVISIBLE_OPTION_PATTERN.test(option.id) &&
      !/lining|\bnet\b/i.test(option.label),
  ).map((option) => [
    option.id,
    { field: VISIBLE_GROUP_FIELDS[option.selectionGroup]!, label: option.label.trim() },
  ]),
);

export const AI_TRY_ON_GARMENT_LABELS: Readonly<Record<CanonicalPhysicalGarmentType, string>> =
  STEP_1_GARMENT_DISPLAY_LABELS;

export const AI_TRY_ON_MONOGRAM_PLACEMENT_LABELS: Readonly<Record<MonogramPlacement, string>> = {
  left_chest: "left chest",
  right_chest: "right chest",
  cuff: "sleeve cuff",
  neckline: "neckline",
  upper_back: "upper back",
  hem: "hem",
};

const DECORATION_BY_FEATURE: Partial<Record<DecorativeFeature, AiTryOnDecoration>> = {
  Embroidery: "embroidery",
  "Monogram Trimming": "decorative_trimming",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const COLOUR_PATTERN = /^[A-Za-z][A-Za-z '&/-]{0,39}$/;
const CATEGORY_PATTERN = /^[A-Za-z][A-Za-z '&/()-]{0,39}$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

const cleanText = (value: unknown, pattern: RegExp): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  return pattern.test(text) ? text : undefined;
};

const normalizeFabric = (value: unknown): AiTryOnOrderFabric | undefined => {
  if (!isRecord(value)) return undefined;
  const colour = cleanText(value.colour, COLOUR_PATTERN);
  const colourHex =
    typeof value.colourHex === "string" && HEX_PATTERN.test(value.colourHex)
      ? value.colourHex.toUpperCase()
      : undefined;
  const category = cleanText(value.category, CATEGORY_PATTERN);
  if (!colour && !colourHex && !category) return undefined;
  return {
    ...(colour ? { colour } : {}),
    ...(colourHex ? { colourHex } : {}),
    ...(category ? { category } : {}),
  };
};

const GARMENT_TYPES = new Set(Object.keys(STEP_1_GARMENT_DISPLAY_LABELS));
const PLACEMENTS = new Set(Object.keys(AI_TRY_ON_MONOGRAM_PLACEMENT_LABELS));
const DECORATIONS = new Set<AiTryOnDecoration>(["embroidery", "decorative_trimming"]);

const sortedUnique = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)].sort();

const isEmpty = (details: AiTryOnOrderDetails) =>
  details.garments.length === 0 && !details.fabric;

/** Browser builder input: only data Design Studio already holds. */
export interface AiTryOnOrderDetailsSource {
  /** Physical garments in order (garmentKey + type). */
  readonly occurrences: readonly { garmentKey: string; garmentType: CanonicalPhysicalGarmentType }[];
  readonly garmentTypeSelection?: GarmentTypeStepSelection | null;
  readonly additionalGarmentConstructions?: Record<string, GarmentConstructionPricingResolution> | null;
  readonly garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1 | null;
  readonly decorativeFeaturesByGarmentKey?: Record<string, readonly DecorativeFeature[]> | null;
  readonly monogramPlacementByGarmentKey?: Record<string, MonogramPlacement> | null;
  readonly fabricAllocations?: readonly FabricAllocation[] | null;
  readonly fabrics?: readonly Fabric[] | null;
  /** Fabric of the swatch sent in fabric mode. Defaults to the first garment's fabric. */
  readonly swatchFabricCode?: string | null;
}

export const buildAiTryOnOrderDetails = (
  source: AiTryOnOrderDetailsSource,
): AiTryOnOrderDetails | null => {
  const garments: AiTryOnOrderGarment[] = [];
  for (const occurrence of source.occurrences.slice(0, AI_TRY_ON_ORDER_DETAILS_MAX_GARMENTS)) {
    if (!GARMENT_TYPES.has(occurrence.garmentType)) continue;
    const optionIds: string[] = [];
    const construction =
      source.additionalGarmentConstructions?.[occurrence.garmentKey] ||
      source.garmentTypeSelection?.constructionByGarment?.[occurrence.garmentType];
    if (construction?.status === "resolved") {
      construction.components.forEach((component) => optionIds.push(component.optionId));
    }
    const selections =
      source.garmentScopedCustomDetails?.selectionsByGarmentKey?.[occurrence.garmentKey] || {};
    Object.values(selections).forEach((selection) => {
      (Array.isArray(selection) ? selection : [selection]).forEach((optionId) => {
        if (typeof optionId === "string") optionIds.push(optionId);
      });
    });
    const features = source.decorativeFeaturesByGarmentKey?.[occurrence.garmentKey] || [];
    const decorations = sortedUnique(
      features
        .map((feature) => DECORATION_BY_FEATURE[feature])
        .filter((decoration): decoration is AiTryOnDecoration => Boolean(decoration)),
    );
    const placement = source.monogramPlacementByGarmentKey?.[occurrence.garmentKey];
    garments.push({
      garmentType: occurrence.garmentType,
      optionIds: sortedUnique(optionIds.filter((id) => AI_TRY_ON_VISIBLE_OPTIONS.has(id))),
      decorations,
      ...(features.includes("Name Monogram") && placement && PLACEMENTS.has(placement)
        ? { monogramPlacement: placement }
        : {}),
    });
  }

  const swatchCode =
    source.swatchFabricCode ||
    source.fabricAllocations?.find((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === source.occurrences[0]?.garmentKey,
      ),
    )?.fabricCode;
  const fabricRecord = swatchCode
    ? source.fabrics?.find((fabric) => fabric?.code === swatchCode)
    : undefined;
  const fabric = fabricRecord
    ? normalizeFabric({
        colour: fabricRecord.color,
        colourHex: fabricRecord.colorHex,
        category: fabricRecord.category,
      })
    : undefined;

  const details: AiTryOnOrderDetails = { garments, ...(fabric ? { fabric } : {}) };
  return isEmpty(details) ? null : details;
};

/**
 * Order details for one wearer of a multi-wearer order (Step 5 "Who's this
 * for?" picker): only the garments assigned to that wearer, and the fabric
 * of that wearer's first garment unless a swatch code is given. Unknown
 * wearer → null (never falls back to the whole order).
 */
export const buildAiTryOnOrderDetailsForWearer = ({
  wearerOrder,
  wearerId,
  ...source
}: AiTryOnOrderDetailsSource & {
  wearerOrder: WearerOrderStateV2 | null | undefined;
  wearerId: string;
}): AiTryOnOrderDetails | null => {
  if (!wearerOrder?.wearers?.some((wearer) => wearer.wearerId === wearerId)) return null;
  const assignment = wearerOrder.assignmentByGarmentKey || {};
  const occurrences = source.occurrences.filter(
    (occurrence) => assignment[occurrence.garmentKey] === wearerId,
  );
  if (occurrences.length === 0) return null;
  return buildAiTryOnOrderDetails({ ...source, occurrences });
};

/**
 * Server boundary parse. Unknown option ids and fields are dropped (never
 * guessed); a malformed shape returns null (400).
 */
export const normalizeAiTryOnOrderDetails = (
  value: unknown,
): AiTryOnOrderDetails | null | "invalid" => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.garments)) return "invalid";
  if (value.garments.length > AI_TRY_ON_ORDER_DETAILS_MAX_GARMENTS) return "invalid";
  const garments: AiTryOnOrderGarment[] = [];
  for (const entry of value.garments) {
    if (!isRecord(entry) || typeof entry.garmentType !== "string") return "invalid";
    if (!GARMENT_TYPES.has(entry.garmentType)) return "invalid";
    if (entry.optionIds !== undefined && !Array.isArray(entry.optionIds)) return "invalid";
    if (entry.decorations !== undefined && !Array.isArray(entry.decorations)) return "invalid";
    const optionIds = ((entry.optionIds as unknown[]) || []).filter(
      (id): id is string => typeof id === "string" && AI_TRY_ON_VISIBLE_OPTIONS.has(id),
    );
    const decorations = ((entry.decorations as unknown[]) || []).filter(
      (decoration): decoration is AiTryOnDecoration =>
        typeof decoration === "string" && DECORATIONS.has(decoration as AiTryOnDecoration),
    );
    const placement =
      typeof entry.monogramPlacement === "string" && PLACEMENTS.has(entry.monogramPlacement)
        ? (entry.monogramPlacement as MonogramPlacement)
        : undefined;
    garments.push({
      garmentType: entry.garmentType as CanonicalPhysicalGarmentType,
      optionIds: sortedUnique(optionIds.slice(0, 20)),
      decorations: sortedUnique(decorations),
      ...(placement ? { monogramPlacement: placement } : {}),
    });
  }
  const fabric = normalizeFabric(value.fabric);
  const details: AiTryOnOrderDetails = { garments, ...(fabric ? { fabric } : {}) };
  return isEmpty(details) ? null : details;
};

/** Stable identity for the Try-on fingerprint. */
export const orderDetailsFingerprintIdentity = (
  details: AiTryOnOrderDetails | null | undefined,
): unknown =>
  details && !isEmpty(details)
    ? {
        garments: details.garments.map((garment) => ({
          garmentType: garment.garmentType,
          optionIds: sortedUnique(garment.optionIds),
          decorations: sortedUnique(garment.decorations),
          monogramPlacement: garment.monogramPlacement || null,
        })),
        fabric: details.fabric
          ? {
              colour: details.fabric.colour || null,
              colourHex: details.fabric.colourHex || null,
              category: details.fabric.category || null,
            }
          : null,
      }
    : null;
