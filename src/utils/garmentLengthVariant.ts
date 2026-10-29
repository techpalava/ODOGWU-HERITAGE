import type {
  CanonicalPhysicalGarmentType,
  CustomDetailSelectionGroup,
  FabricGarmentType,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
} from "../types.js";

/**
 * Standard and Long garments of one family (Standard Shirt / Long Shirt, Standard Dress /
 * Long Dress, Standard Skirt / Long Skirt). In Step 4 each garment offers the Main Garment
 * options of both lengths; the chosen option decides which garment type the order holds.
 *
 * A garment keeps its key (`base:shirt`, `additional:skirt:1`) for life, so everything stored
 * against that key (custom details, measurements, design style, fabric assignment, links to a
 * main garment) stays attached. The key's type is the type the customer picked (the Step 1
 * card or the added garment); the physical type is the one the chosen length resolves to.
 */
export type GarmentLength = "standard" | "long";

export interface GarmentLengthFamily {
  readonly id: "shirt" | "dress" | "skirt";
  readonly selectionGroup: CustomDetailSelectionGroup;
  readonly standard: CanonicalPhysicalGarmentType;
  readonly long: CanonicalPhysicalGarmentType;
  readonly standardOptionPrefix: string;
  readonly longOptionPrefix: string;
}

export const GARMENT_LENGTH_FAMILIES: readonly GarmentLengthFamily[] = [
  {
    id: "shirt",
    selectionGroup: "shirt_construction",
    standard: "shirt",
    long: "kaftan",
    standardOptionPrefix: "shirt_std_",
    longOptionPrefix: "shirt_long_",
  },
  {
    id: "dress",
    selectionGroup: "dress_construction",
    standard: "dress",
    long: "full_length_gown",
    standardOptionPrefix: "dress_std_",
    longOptionPrefix: "dress_long_",
  },
  {
    id: "skirt",
    selectionGroup: "skirt_length",
    standard: "skirt",
    long: "long_skirt",
    standardOptionPrefix: "skirt_std",
    longOptionPrefix: "skirt_long",
  },
];

export const getGarmentLengthFamily = (
  garmentType: FabricGarmentType | null | undefined,
): GarmentLengthFamily | null =>
  GARMENT_LENGTH_FAMILIES.find(
    (family) => family.standard === garmentType || family.long === garmentType,
  ) || null;

export const getGarmentLengthFamilyForSelectionGroup = (
  selectionGroup: CustomDetailSelectionGroup,
): GarmentLengthFamily | null =>
  GARMENT_LENGTH_FAMILIES.find(
    (family) => family.selectionGroup === selectionGroup,
  ) || null;

export const getGarmentLength = (
  garmentType: FabricGarmentType | null | undefined,
): GarmentLength | null => {
  const family = getGarmentLengthFamily(garmentType);
  if (!family) return null;
  return family.long === garmentType ? "long" : "standard";
};

export const getGarmentTypeForLength = (
  garmentType: CanonicalPhysicalGarmentType,
  length: GarmentLength,
): CanonicalPhysicalGarmentType => {
  const family = getGarmentLengthFamily(garmentType);
  if (!family) return garmentType;
  return length === "long" ? family.long : family.standard;
};

/** Both lengths of the family, or just the type itself outside a family. */
export const getLengthVariantGarmentTypes = (
  garmentType: FabricGarmentType,
): readonly FabricGarmentType[] => {
  const family = getGarmentLengthFamily(garmentType);
  return family ? [family.standard, family.long] : [garmentType];
};

export const areLengthVariantsOfSameGarment = (
  left: FabricGarmentType | null | undefined,
  right: FabricGarmentType | null | undefined,
): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;
  const family = getGarmentLengthFamily(left);
  return Boolean(family && getGarmentLengthFamily(right)?.id === family.id);
};

export const getOptionGarmentLength = (
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): GarmentLength | null => {
  const family = getGarmentLengthFamilyForSelectionGroup(selectionGroup);
  if (!family) return null;
  if (optionId.startsWith(family.longOptionPrefix)) return "long";
  if (optionId.startsWith(family.standardOptionPrefix)) return "standard";
  return null;
};

/**
 * The physical garment type a construction describes. A garment of a length family follows the
 * length of its chosen Main Garment option; anything else keeps `garmentType`.
 */
export const resolveConstructionPhysicalGarmentType = (
  garmentType: CanonicalPhysicalGarmentType,
  construction: GarmentConstructionPricingResolution | null | undefined,
): CanonicalPhysicalGarmentType => {
  const family = getGarmentLengthFamily(garmentType);
  if (!family || construction?.status !== "resolved") return garmentType;
  const component = construction.components.find(
    (candidate) => candidate.selectionGroup === family.selectionGroup,
  );
  const length = component
    ? getOptionGarmentLength(family.selectionGroup, component.optionId)
    : null;
  return length ? getGarmentTypeForLength(garmentType, length) : garmentType;
};

/** `base:shirt` -> `shirt`. The type of a main garment key is the Step 1 card. */
export const parseBaseGarmentTypeFromKey = (
  garmentKey: string,
): CanonicalPhysicalGarmentType | null => {
  const match = garmentKey.match(/^base:([a-z_]+)$/);
  return match ? (match[1] as CanonicalPhysicalGarmentType) : null;
};

/** `additional:skirt:2` -> `skirt`. The type the added garment was added as. */
export const parseAdditionalGarmentKeyType = (
  garmentKey: string,
): CanonicalPhysicalGarmentType | null => {
  const match = garmentKey.match(/^additional:([a-z_]+):[1-9][0-9]*$/);
  return match ? (match[1] as CanonicalPhysicalGarmentType) : null;
};

/** The type a garment key was created as (Step 1 card or added garment type). */
export const getOriginalGarmentTypeFromKey = (
  garmentKey: string,
): CanonicalPhysicalGarmentType | null =>
  parseBaseGarmentTypeFromKey(garmentKey) ??
  parseAdditionalGarmentKeyType(garmentKey);

/**
 * Main garment construction for a key. Constructions of main garments are stored under the
 * Step 1 card type, which a length switch never changes.
 */
export const getBaseGarmentConstruction = (
  selection: Pick<GarmentTypeStepSelection, "constructionByGarment">,
  garmentKeyOrType: string,
): GarmentConstructionPricingResolution | undefined => {
  const garmentType =
    parseBaseGarmentTypeFromKey(garmentKeyOrType) ??
    (garmentKeyOrType as CanonicalPhysicalGarmentType);
  return selection.constructionByGarment[garmentType];
};

/** Physical type of a main garment chosen in Step 1 as `stepOneType`. */
export const resolveBasePhysicalGarmentType = (
  selection: Pick<GarmentTypeStepSelection, "constructionByGarment">,
  stepOneType: CanonicalPhysicalGarmentType,
): CanonicalPhysicalGarmentType =>
  resolveConstructionPhysicalGarmentType(
    stepOneType,
    selection.constructionByGarment[stepOneType],
  );

/**
 * Step 1 card label note for a card whose garment now has the other length.
 * Null when the garment still has the card's length.
 */
export const getStep1LengthSwitchNote = (
  selection: Pick<GarmentTypeStepSelection, "constructionByGarment">,
  stepOneType: CanonicalPhysicalGarmentType,
): string | null => {
  const physical = resolveBasePhysicalGarmentType(selection, stepOneType);
  if (physical === stepOneType) return null;
  return getGarmentLength(physical) === "long"
    ? "Switched to Long Length in Step 4"
    : "Switched to Standard Length in Step 4";
};

/**
 * `additional:<type>:<n>` whose `<type>` is `garmentType` or its other length (an added garment
 * that Step 4 switched to the other length keeps its key).
 */
export const isAdditionalKeyOfGarmentLengthVariant = (
  garmentKey: string,
  garmentType: FabricGarmentType,
): boolean => {
  const keyType = parseAdditionalGarmentKeyType(garmentKey);
  return Boolean(keyType && areLengthVariantsOfSameGarment(keyType, garmentType));
};
