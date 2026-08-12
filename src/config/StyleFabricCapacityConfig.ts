import type {
  CustomDetailGarmentGroup,
  DesignSelections,
  FabricCapacityGarmentSpec,
  FabricGarmentInputAssignment,
  FabricGarmentType,
  FabricUnitCount,
  StyleCategory,
} from "../types";

const DEFAULT_CUSTOM_DETAILS_BY_GARMENT_TYPE: Readonly<
  Partial<Record<FabricGarmentType, NonNullable<DesignSelections["customDetails"]>>>
> = {
  shirt: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
  },
  trouser: {
    trouser_fastening: "trouser_rope",
    trouser_pockets: "trouser_pocket_none",
  },
  skirt: {
    skirt_length: "skirt_std",
    skirt_pockets: "skirt_pocket_none",
  },
  standard_shorts: {
    standard_shorts_fastening: "shorts_std_rope",
    standard_shorts_pockets: "shorts_std_pocket_none",
  },
  bum_shorts: {
    bum_shorts_fastening: "bum_rope",
    bum_shorts_pockets: "bum_pocket_none",
  },
  dress: {
    dress_construction: "dress_std_short",
    dress_pockets: "dress_pocket_0",
    neck_design: "neck_no_round",
  },
  kaftan: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
  },
  full_length_gown: {
    dress_construction: "dress_long_short",
    dress_pockets: "dress_pocket_0",
    neck_design: "neck_no_round",
  },
  agbada: {
    shirt_construction: "shirt_std_short",
    shirt_pockets: "shirt_pocket_0",
    neck_design: "neck_no_round",
    trouser_fastening: "trouser_rope",
    trouser_pockets: "trouser_pocket_none",
  },
};

export const FABRIC_GARMENT_CAPACITY_UNITS: Readonly<
  Record<FabricGarmentType, FabricUnitCount>
> = {
  shirt: 1,
  trouser: 1,
  skirt: 1,
  standard_shorts: 1,
  bum_shorts: 1,
  dress: 1,
  kaftan: 2,
  full_length_gown: 2,
  agbada: 2,
  other: 1,
};

export const STYLE_BASE_GARMENT_TYPES: readonly FabricGarmentType[] = [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
];

export const createStyleBaseGarmentSpec = (
  garmentType: FabricGarmentType,
): FabricCapacityGarmentSpec => ({
  key: `base:${garmentType}`,
  garmentType,
  fabricUnits: FABRIC_GARMENT_CAPACITY_UNITS[garmentType],
});

const createLegacyComposition = (
  garmentTypes: readonly FabricGarmentType[],
): FabricCapacityGarmentSpec[] =>
  garmentTypes.map((garmentType) => createStyleBaseGarmentSpec(garmentType));

// Existing Firestore records predate structured capacity metadata. Stable IDs,
// rather than labels or images, provide a deterministic compatibility bridge.
export const LEGACY_STYLE_BASE_GARMENT_COMPOSITIONS: Readonly<
  Record<string, readonly FabricCapacityGarmentSpec[]>
> = {
  "casual-native-1": createLegacyComposition(["shirt", "trouser"]),
  "classic-ankara-kaftan-set-traditional-embellished-boubou-1":
    createLegacyComposition(["kaftan", "dress"]),
  "classic-v-neck-maxi-dress-1": createLegacyComposition([
    "full_length_gown",
  ]),
  "classic-v-neck-maxi-dress-2": createLegacyComposition([
    "full_length_gown",
  ]),
  "contemporary-ankara-1": createLegacyComposition(["shirt", "trouser"]),
  "floral-senator-shirt-contemporary-shift-dress-1":
    createLegacyComposition(["shirt", "dress"]),
  "royal-senator-1": createLegacyComposition(["shirt", "trouser"]),
  "royal-senator-2": createLegacyComposition(["shirt", "trouser"]),
};

const cloneComposition = (
  composition: readonly FabricCapacityGarmentSpec[],
): FabricCapacityGarmentSpec[] => composition.map((spec) => ({ ...spec }));

export const applyLegacyStyleFabricCapacityConfig = <
  T extends Pick<StyleCategory, "id" | "fabricCapacityComposition">,
>(
  style: T,
): T => {
  if ((style.fabricCapacityComposition || []).length > 0) return style;
  const legacyComposition = LEGACY_STYLE_BASE_GARMENT_COMPOSITIONS[style.id];
  if (!legacyComposition) return style;
  return {
    ...style,
    fabricCapacityComposition: cloneComposition(legacyComposition),
  };
};

export const getStyleBaseFabricCapacityComposition = (
  style: StyleCategory | null | undefined,
): FabricCapacityGarmentSpec[] =>
  style?.fabricCapacityComposition?.map((spec) => ({ ...spec })) || [];

export const getStyleBaseFabricGarmentSelections = (
  style: StyleCategory | null | undefined,
): FabricGarmentInputAssignment[] =>
  getFabricGarmentSelectionsForComposition(
    getStyleBaseFabricCapacityComposition(style),
  );

export const getFabricGarmentSelectionsForComposition = (
  composition: readonly FabricCapacityGarmentSpec[],
): FabricGarmentInputAssignment[] =>
  composition.map((garmentSpec) => ({
    code: `STYLE_BASE_${garmentSpec.garmentType.toUpperCase()}`,
    garmentSpec: { ...garmentSpec },
    lowerGarmentType: garmentSpec.lowerGarmentType,
    sourceRole: "main",
  }));

export const getDefaultGarmentDetailsForComposition = (
  composition: readonly FabricCapacityGarmentSpec[],
): DesignSelections | undefined => {
  const customDetails = composition.reduce(
    (resolvedDetails, garmentSpec) => ({
      ...resolvedDetails,
      ...(DEFAULT_CUSTOM_DETAILS_BY_GARMENT_TYPE[garmentSpec.garmentType] || {}),
    }),
    {} as NonNullable<DesignSelections["customDetails"]>,
  );

  return Object.keys(customDetails).length > 0 ? { customDetails } : undefined;
};

export const getDefaultGarmentDetailsForSpec = (
  garmentSpec: FabricCapacityGarmentSpec,
): NonNullable<DesignSelections["customDetails"]> | null => {
  const details = DEFAULT_CUSTOM_DETAILS_BY_GARMENT_TYPE[garmentSpec.garmentType];
  return details ? { ...details } : null;
};

export const getConfiguredStyleDefaultGarmentDetails = (
  style: StyleCategory | null | undefined,
): DesignSelections | undefined => {
  if (style?.defaultGarmentDetails) {
    return {
      ...style.defaultGarmentDetails,
      customDetails: { ...(style.defaultGarmentDetails.customDetails || {}) },
    };
  }

  return getDefaultGarmentDetailsForComposition(
    getStyleBaseFabricCapacityComposition(style),
  );
};

export const getStyleBaseFabricCapacitySignature = (
  style: StyleCategory | null | undefined,
): string =>
  getFabricCapacityCompositionSignature(
    getStyleBaseFabricCapacityComposition(style),
  );

export const getFabricCapacityCompositionSignature = (
  composition: readonly FabricCapacityGarmentSpec[],
): string =>
  composition
    .map(
      (spec) =>
        `${spec.key}:${spec.garmentType}:${spec.fabricUnits}:${spec.lowerGarmentType || ""}`,
    )
    .join(",");

const BASE_CUSTOM_DETAIL_GROUPS: Readonly<
  Record<FabricGarmentType, readonly CustomDetailGarmentGroup[]>
> = {
  shirt: ["shirt", "neck"],
  trouser: ["trousers"],
  skirt: ["skirt"],
  standard_shorts: ["standard_shorts"],
  bum_shorts: ["bum_shorts"],
  dress: ["dress", "neck"],
  kaftan: ["shirt", "neck"],
  full_length_gown: ["dress", "neck"],
  agbada: ["shirt", "neck", "trousers"],
  other: [],
};

export const getCustomDetailGroupsForFabricGarmentType = (
  garmentType: FabricGarmentType,
): CustomDetailGarmentGroup[] => [...BASE_CUSTOM_DETAIL_GROUPS[garmentType]];

export const getStyleBaseCustomDetailGroups = (
  style: StyleCategory | null | undefined,
): CustomDetailGarmentGroup[] => [
  ...new Set(
    getStyleBaseFabricCapacityComposition(style).flatMap((spec) =>
      getCustomDetailGroupsForFabricGarmentType(spec.garmentType),
    ),
  ),
];

export const getCustomDetailGroupsForFabricComposition = (
  composition: readonly FabricCapacityGarmentSpec[],
): CustomDetailGarmentGroup[] => [
  ...new Set(
    composition.flatMap((spec) =>
      getCustomDetailGroupsForFabricGarmentType(spec.garmentType),
    ),
  ),
];
