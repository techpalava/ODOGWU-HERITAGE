import type {
  CustomDetailGarmentContext,
  CustomDetailOption,
  DecorativeFeature,
  DesignSelections,
  MonogramPlacement,
  StyleCategory,
} from "../types";
import {
  calculateCustomDetailsPrice,
  getSelectedCustomDetailOptionIds,
  getSupportedCustomDetailGroupResolution,
} from "./catalogHelpers";

export const DECORATIVE_FEATURE_OPTIONS: readonly DecorativeFeature[] = [
  "Name Monogram",
  "Embroidery",
  "Monogram Trimming",
];

export const DECORATIVE_FEATURE_DESCRIPTIONS: Readonly<
  Record<DecorativeFeature, string>
> = {
  "Name Monogram":
    "Add your name to an eligible upper-body garment. Left Chest is the recommended placement.",
  Embroidery:
    "Additional decorative patterns on your clothing, depending on the selected design.",
  "Monogram Trimming":
    "Additional decorative trimming or patterned finishing, depending on the selected design.",
};

export const DECORATIVE_FEATURE_PRICE_CENTS: Readonly<
  Record<DecorativeFeature, number>
> = {
  "Name Monogram": 1200,
  Embroidery: 1200,
  "Monogram Trimming": 1200,
};

export interface MonogramPlacementOption {
  value: MonogramPlacement;
  label: string;
}

export const DEFAULT_MONOGRAM_PLACEMENT: MonogramPlacement = "left_chest";

export const MONOGRAM_PLACEMENT_OPTIONS: readonly MonogramPlacementOption[] = [
  { value: "left_chest", label: "Left Chest" },
  { value: "right_chest", label: "Right Chest" },
  { value: "cuff", label: "Cuff" },
  { value: "neckline", label: "Neckline" },
  { value: "upper_back", label: "Upper Back" },
  { value: "hem", label: "Hem" },
];

const CUFF_ELIGIBLE_CONSTRUCTION_OPTION_IDS = new Set([
  "shirt_std_midlong",
  "shirt_long_midlong",
  "dress_std_midlong",
  "dress_long_midlong",
]);


const UPPER_BODY_CONSTRUCTION_OPTION_IDS = new Set([
  "shirt_std_short",
  "shirt_std_midlong",
  "shirt_long_short",
  "shirt_long_midlong",
  "dress_std_sleeveless",
  "dress_std_short",
  "dress_std_midlong",
  "dress_long_sleeveless",
  "dress_long_short",
  "dress_long_midlong",
]);

export const TRADITIONAL_ACCESSORY_OPTIONS = [
  "Traditional Hat",
  "Traditional Bead",
  "Traditional Stick",
] as const;

export type TraditionalAccessory =
  (typeof TRADITIONAL_ACCESSORY_OPTIONS)[number];

export const TRADITIONAL_ACCESSORY_DESCRIPTIONS: Readonly<
  Record<TraditionalAccessory, string>
> = {
  "Traditional Hat":
    "Complete the look of a traditional Nigerian chief or nobleman.",
  "Traditional Bead":
    "Complete the look of a traditional Nigerian chief or nobleman.",
  "Traditional Stick":
    "Complete the look of a traditional Nigerian chief or nobleman.",
};

export const sortDecorativeFeatures = (
  features: readonly DecorativeFeature[],
): DecorativeFeature[] => {
  const selected = new Set(features);
  return DECORATIVE_FEATURE_OPTIONS.filter((feature) =>
    selected.has(feature),
  );
};

export const sortTraditionalAccessories = (
  accessories: readonly string[],
): TraditionalAccessory[] => {
  const selected = new Set(accessories);
  return TRADITIONAL_ACCESSORY_OPTIONS.filter((accessory) =>
    selected.has(accessory),
  );
};

export const isNameMonogramApplicable = (
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): boolean => {
  const resolution = getSupportedCustomDetailGroupResolution(
    style || null,
    garment,
  );

  if (
    resolution.source === "none" ||
    resolution.source === "disabled" ||
    resolution.source === "legacy_demographic_default"
  ) {
    return false;
  }

  return resolution.groups.some(
    (group) => group === "shirt" || group === "dress",
  );
};

export const getApplicableDecorativeFeatures = (
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): DecorativeFeature[] =>
  DECORATIVE_FEATURE_OPTIONS.filter(
    (feature) =>
      feature !== "Name Monogram" ||
      isNameMonogramApplicable(style, garment),
  );

export const isMonogramCuffEligible = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): boolean => {
  if (!isNameMonogramApplicable(style, garment)) return false;

  const selectedOptionIds = getSelectedCustomDetailOptionIds(selections);
  const selectedConstructionIds = selectedOptionIds.filter((optionId) =>
    UPPER_BODY_CONSTRUCTION_OPTION_IDS.has(optionId),
  );
  if (selectedConstructionIds.length > 0) {
    return selectedConstructionIds.some((optionId) =>
      CUFF_ELIGIBLE_CONSTRUCTION_OPTION_IDS.has(optionId),
    );
  }

  return style?.monogramCuffEligible === true;
};

export const getAvailableMonogramPlacements = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): MonogramPlacementOption[] => {
  if (!isNameMonogramApplicable(style, garment)) return [];
  const cuffEligible = isMonogramCuffEligible(selections, style, garment);
  return MONOGRAM_PLACEMENT_OPTIONS.filter(
    (option) => option.value !== "cuff" || cuffEligible,
  );
};

export const getMonogramPlacementLabel = (
  placement?: MonogramPlacement,
): string | null =>
  MONOGRAM_PLACEMENT_OPTIONS.find((option) => option.value === placement)
    ?.label || null;

export const hasHeavyEmbroideryMetadata = (
  style?: StyleCategory | null,
): boolean => style?.embroideryProminence === "heavy";

const DEFAULT_ACCESSORY_PRICE = 12;

type DecorativeFeatureFlag =
  | "hasMonogram"
  | "hasEmbroidery"
  | "hasMonogramTrimming";

const getExplicitFeatureValue = (
  style: StyleCategory,
  key: DecorativeFeatureFlag,
): boolean | undefined => {
  if (
    style.includedDesignFeatures &&
    Object.prototype.hasOwnProperty.call(style.includedDesignFeatures, key)
  ) {
    return style.includedDesignFeatures[key] === true;
  }
  if (Object.prototype.hasOwnProperty.call(style, key)) {
    return style[key] === true;
  }
  if (
    style.defaultGarmentDetails &&
    Object.prototype.hasOwnProperty.call(style.defaultGarmentDetails, key)
  ) {
    return style.defaultGarmentDetails[key] === true;
  }
  return undefined;
};

const featureFlagByLabel: Record<
  DecorativeFeature,
  DecorativeFeatureFlag
> = {
  "Name Monogram": "hasMonogram",
  Embroidery: "hasEmbroidery",
  "Monogram Trimming": "hasMonogramTrimming",
};

export const getIncludedDecorativeFeatures = (
  style?: StyleCategory | null,
): DecorativeFeature[] => {
  if (!style) return [];

  const features = new Set<DecorativeFeature>();
  const legacySelection = style.defaultGarmentDetails?.embroideryDesign;
  if (
    legacySelection &&
    DECORATIVE_FEATURE_OPTIONS.includes(
      legacySelection as DecorativeFeature,
    ) &&
    getExplicitFeatureValue(
      style,
      featureFlagByLabel[legacySelection as DecorativeFeature],
    ) !== false
  ) {
    features.add(legacySelection as DecorativeFeature);
  }

  if (getExplicitFeatureValue(style, "hasMonogram") === true) {
    features.add("Name Monogram");
  }
  if (getExplicitFeatureValue(style, "hasEmbroidery") === true) {
    features.add("Embroidery");
  }
  if (getExplicitFeatureValue(style, "hasMonogramTrimming") === true) {
    features.add("Monogram Trimming");
  }

  return sortDecorativeFeatures([...features]);
};

export const filterDesignSelectionsForDecorativeFeatures = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): DesignSelections => {
  const applicableFeatures = new Set(
    getApplicableDecorativeFeatures(style, garment),
  );
  const nextFeatures = sortDecorativeFeatures(
    [
      ...(selections.decorativeFeatures || []),
      ...(selections.hasMonogram === true ? ["Name Monogram" as const] : []),
    ].filter((feature) => applicableFeatures.has(feature)),
  );
  const legacyFeature = DECORATIVE_FEATURE_OPTIONS.includes(
    selections.embroideryDesign as DecorativeFeature,
  )
    ? (selections.embroideryDesign as DecorativeFeature)
    : null;
  const validLegacyFeature =
    legacyFeature && applicableFeatures.has(legacyFeature)
      ? legacyFeature
      : null;
  const nameMonogramSelected =
    applicableFeatures.has("Name Monogram") &&
    (nextFeatures.includes("Name Monogram") ||
      validLegacyFeature === "Name Monogram" ||
      selections.hasMonogram === true ||
      getIncludedDecorativeFeatures(style).includes("Name Monogram"));
  const availablePlacements = getAvailableMonogramPlacements(
    selections,
    style,
    garment,
  );
  const placementIsValid = availablePlacements.some(
    (option) => option.value === selections.monogramPlacement,
  );

  return {
    ...selections,
    decorativeFeatures: nextFeatures,
    embroideryDesign:
      legacyFeature && !validLegacyFeature
        ? undefined
        : selections.embroideryDesign,
    hasMonogram: applicableFeatures.has("Name Monogram")
      ? selections.hasMonogram
      : undefined,
    monogramPlacement: nameMonogramSelected
      ? placementIsValid
        ? selections.monogramPlacement
        : DEFAULT_MONOGRAM_PLACEMENT
      : undefined,
  };
};

export const hasMonogram = (style?: StyleCategory | null): boolean =>
  getIncludedDecorativeFeatures(style).includes("Name Monogram");

export const hasEmbroidery = (style?: StyleCategory | null): boolean =>
  getIncludedDecorativeFeatures(style).includes("Embroidery");

export const hasMonogramTrimming = (
  style?: StyleCategory | null,
): boolean =>
  getIncludedDecorativeFeatures(style).includes("Monogram Trimming");

const getOverridePrice = (
  style: StyleCategory | null | undefined,
  type: "embroideryDesign" | "accessories",
  code: string,
  fallback: number,
): number => {
  const override = style?.constructionDetails?.find(
    (detail) => detail.type === type && detail.code === code,
  )?.price;
  const numericOverride = Number(override);

  return override !== undefined &&
    Number.isFinite(numericOverride) &&
    numericOverride >= 0
    ? numericOverride
    : fallback;
};

export const getDecorativeFeaturePrice = (
  style: StyleCategory | null | undefined,
  feature: DecorativeFeature,
): number =>
  getOverridePrice(
    style,
    "embroideryDesign",
    feature,
    DECORATIVE_FEATURE_PRICE_CENTS[feature] / 100,
  );

export const getTraditionalAccessoryPrice = (
  style: StyleCategory | null | undefined,
  accessory: TraditionalAccessory,
): number => getOverridePrice(
  style,
  "accessories",
  accessory,
  DEFAULT_ACCESSORY_PRICE,
);

export interface PricedSelection {
  label: string;
  price: number;
  includedByStyle: boolean;
}

export interface GarmentDetailsPrice {
  total: number;
  monogramPrice: number;
  decorativeFeatures: PricedSelection[];
  accessories: PricedSelection[];
}

export interface SelectedDecorativeFeaturePricingContext {
  /**
   * A narrow style context used only to decide whether an explicitly selected
   * decorative feature applies. Price overrides and accessories still use the
   * pricing style argument.
   */
  applicabilityStyle: StyleCategory | null;
}

export const calculateGarmentDetailsPrice = (
  details: DesignSelections,
  style?: StyleCategory | null,
  catalog: CustomDetailOption[] = [],
  garment?: CustomDetailGarmentContext | null,
  selectedFeatureContext?: SelectedDecorativeFeaturePricingContext,
): GarmentDetailsPrice => {
  const decorativeFeatureStyle = selectedFeatureContext
    ? selectedFeatureContext.applicabilityStyle
    : style;
  const applicableDetails = filterDesignSelectionsForDecorativeFeatures(
    details,
    decorativeFeatureStyle,
    garment,
  );
  const applicableFeatures = new Set(
    getApplicableDecorativeFeatures(decorativeFeatureStyle, garment),
  );
  const includedFeatures = new Set(
    selectedFeatureContext
      ? []
      : getIncludedDecorativeFeatures(decorativeFeatureStyle).filter(
          (feature) => applicableFeatures.has(feature),
        ),
  );
  const selectedFeatures = new Set<DecorativeFeature>(
    applicableDetails.decorativeFeatures || [],
  );

  if (
    applicableDetails.embroideryDesign &&
    DECORATIVE_FEATURE_OPTIONS.includes(
      applicableDetails.embroideryDesign as DecorativeFeature,
    )
  ) {
    selectedFeatures.add(
      applicableDetails.embroideryDesign as DecorativeFeature,
    );
  }

  const allFeatures = new Set<DecorativeFeature>([
    ...includedFeatures,
    ...selectedFeatures,
  ]);
  const decorativeFeatures = sortDecorativeFeatures([...allFeatures]).map((feature) => ({
    label: feature,
    price: getDecorativeFeaturePrice(style, feature),
    includedByStyle: includedFeatures.has(feature),
  }));
  const accessories = sortTraditionalAccessories(
    applicableDetails.accessories || [],
  ).map((accessory) => ({
    label: accessory,
    price: getTraditionalAccessoryPrice(style, accessory),
    includedByStyle: false,
  }));
  const monogramPrice = decorativeFeatures.reduce(
    (total, feature) => total + feature.price,
    0,
  );
  const accessoryPrice = accessories.reduce(
    (total, accessory) => total + accessory.price,
    0,
  );

  return {
    total:
      calculateCustomDetailsPrice(applicableDetails, catalog) +
      monogramPrice +
      accessoryPrice,
    monogramPrice,
    decorativeFeatures,
    accessories,
  };
};
