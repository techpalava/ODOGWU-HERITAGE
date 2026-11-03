import type {
  CanonicalPhysicalGarmentType,
  CustomDetailGarmentContext,
  CustomDetailGarmentGroup,
  CustomDetailOption,
  DecorativeFeature,
  DesignSelections,
  FabricGarmentType,
  MonogramPlacement,
  StyleCategory,
} from "../types.js";
import { validateMonogramText } from "./monogramText.js";
import { DRESS_LINING_OPTION_ID } from "../config/GarmentDetailsConfig.js";
import { CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT } from "../config/CustomDetailPhysicalComponentConfig.js";
import {
  calculateCustomDetailsPrice,
  getCustomDetailsBreakdown,
  getSelectedCustomDetailOptionIds,
  getSupportedCustomDetailGroupResolution,
} from "./catalogHelpers.js";
import { isCanonicalPhysicalGarmentType } from "./garmentConstructionPricing.js";
import { getOriginalGarmentTypeFromKey } from "./garmentLengthVariant.js";
import { PRICING_CURRENCY_SYMBOL } from "./money.js";

export const DECORATIVE_FEATURE_OPTIONS: readonly DecorativeFeature[] = [
  "Name Monogram",
  "Embroidery",
  "Monogram Trimming",
];

export const STYLE_REQUIRED_DECORATIVE_FEATURES: readonly DecorativeFeature[] = [
  "Lining",
  "Net",
];

const PRICED_DECORATIVE_FEATURES: readonly DecorativeFeature[] = [
  ...DECORATIVE_FEATURE_OPTIONS,
  ...STYLE_REQUIRED_DECORATIVE_FEATURES,
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
  Lining:
    "Lining is included with this design. It keeps the garment firm and prevents sheerness.",
  Net:
    "Net is included with this design. It adds structure and shape.",
};

export const DECORATIVE_FEATURE_PRICE_CENTS: Readonly<
  Record<DecorativeFeature, number>
> = {
  "Name Monogram": 1200,
  Embroidery: 1200,
  "Monogram Trimming": 1200,
  Lining: 1000,
  Net: 1000,
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

const UPPER_BODY_MONOGRAM_GROUPS = new Set<CustomDetailGarmentGroup>([
  "shirt",
  "dress",
  "neck",
]);
const LOWER_BODY_MONOGRAM_GROUPS = new Set<CustomDetailGarmentGroup>([
  "trousers",
  "skirt",
  "standard_shorts",
  "bum_shorts",
]);
/** Placements that sit on a torso. Hem is shared; cuff is a sleeve, added separately. */
const UPPER_BODY_MONOGRAM_PLACEMENTS = [
  "left_chest",
  "right_chest",
  "neckline",
  "upper_back",
  "hem",
] as const satisfies readonly MonogramPlacement[];
/** The catalogue has no waist or pocket monogram. Hem is the lower-body placement. */
const LOWER_BODY_MONOGRAM_PLACEMENTS = [
  "hem",
] as const satisfies readonly MonogramPlacement[];

const monogramGroupsForGarmentType = (
  garmentType: FabricGarmentType | null | undefined,
): readonly CustomDetailGarmentGroup[] | null => {
  if (!garmentType || !isCanonicalPhysicalGarmentType(garmentType)) return null;
  return CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT[garmentType].flatMap(
    (component) => component.garmentGroups,
  );
};

const isLowerBodyOnlyMonogramGroup = (
  groups: readonly string[],
): boolean =>
  groups.some((group) =>
    LOWER_BODY_MONOGRAM_GROUPS.has(group as CustomDetailGarmentGroup),
  ) &&
  !groups.some((group) =>
    UPPER_BODY_MONOGRAM_GROUPS.has(group as CustomDetailGarmentGroup),
  );

const canonicalGarmentTypeFromContext = (
  garment?: CustomDetailGarmentContext | null,
): CanonicalPhysicalGarmentType | null => {
  const token = garment?.type;
  return token && isCanonicalPhysicalGarmentType(token as FabricGarmentType)
    ? (token as CanonicalPhysicalGarmentType)
    : null;
};

const monogramGroupsForContext = (
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): readonly string[] => {
  const fromType = monogramGroupsForGarmentType(
    canonicalGarmentTypeFromContext(garment),
  );
  if (fromType) return fromType;
  return getSupportedCustomDetailGroupResolution(style || null, garment).groups;
};

/** Step 1 garment groups decide the placements. Lower-body garments get Hem only. */
export const getDefaultMonogramPlacementForGarmentType = (
  garmentType: FabricGarmentType | null | undefined,
): MonogramPlacement => {
  const groups = monogramGroupsForGarmentType(garmentType);
  return groups && isLowerBodyOnlyMonogramGroup(groups)
    ? "hem"
    : DEFAULT_MONOGRAM_PLACEMENT;
};

export const getMonogramPlacementsForGarmentType = (
  garmentType: FabricGarmentType | null | undefined,
  cuffEligible = false,
): MonogramPlacement[] => {
  const groups = monogramGroupsForGarmentType(garmentType);
  if (groups && isLowerBodyOnlyMonogramGroup(groups)) {
    return [...LOWER_BODY_MONOGRAM_PLACEMENTS];
  }
  const placements: MonogramPlacement[] = [...UPPER_BODY_MONOGRAM_PLACEMENTS];
  if (cuffEligible) placements.splice(2, 0, "cuff");
  return placements;
};

export const resolveMonogramPlacementForGarmentType = (
  garmentType: FabricGarmentType | null | undefined,
  placement: MonogramPlacement | null | undefined,
  cuffEligible = false,
): MonogramPlacement => {
  const allowed = getMonogramPlacementsForGarmentType(garmentType, cuffEligible);
  if (placement && allowed.includes(placement)) return placement;
  return getDefaultMonogramPlacementForGarmentType(garmentType);
};

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
  return PRICED_DECORATIVE_FEATURES.filter((feature) =>
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

/**
 * Step 5 customer choices are intentionally independent of a Design Style's
 * decorative applicability metadata. That metadata still governs existing
 * style-included behavior and monogram-placement eligibility elsewhere.
 */
export const getCustomerSelectableDecorativeFeatures = (): DecorativeFeature[] =>
  [...DECORATIVE_FEATURE_OPTIONS];

const constructionAllowsMonogramCuff = (
  selections: DesignSelections,
  style?: StyleCategory | null,
): boolean => {
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

export const isMonogramCuffEligible = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): boolean => {
  if (!isNameMonogramApplicable(style, garment)) return false;
  return constructionAllowsMonogramCuff(selections, style);
};

export const getAvailableMonogramPlacements = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): MonogramPlacementOption[] => {
  const groups = monogramGroupsForContext(style, garment);
  const lowerOnly = groups.length > 0 && isLowerBodyOnlyMonogramGroup(groups);
  const upper = groups.some((group) =>
    UPPER_BODY_MONOGRAM_GROUPS.has(group as CustomDetailGarmentGroup),
  );
  if (lowerOnly || upper || canonicalGarmentTypeFromContext(garment)) {
    const cuffEligible =
      upper && constructionAllowsMonogramCuff(selections, style);
    const allowed = new Set(
      lowerOnly
        ? LOWER_BODY_MONOGRAM_PLACEMENTS
        : getMonogramPlacementsForGarmentType(
            canonicalGarmentTypeFromContext(garment) ?? "shirt",
            cuffEligible,
          ),
    );
    if (!lowerOnly && cuffEligible) allowed.add("cuff");
    return MONOGRAM_PLACEMENT_OPTIONS.filter((option) =>
      allowed.has(option.value),
    );
  }
  if (!isNameMonogramApplicable(style, garment)) return [];
  const cuffEligible = isMonogramCuffEligible(selections, style, garment);
  return MONOGRAM_PLACEMENT_OPTIONS.filter(
    (option) => option.value !== "cuff" || cuffEligible,
  );
};

const defaultMonogramPlacementForContext = (
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): MonogramPlacement => {
  const canonical = canonicalGarmentTypeFromContext(garment);
  if (canonical) return getDefaultMonogramPlacementForGarmentType(canonical);
  const groups = monogramGroupsForContext(style, garment);
  return isLowerBodyOnlyMonogramGroup(groups)
    ? "hem"
    : DEFAULT_MONOGRAM_PLACEMENT;
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
  | "hasMonogramTrimming"
  | "hasLining"
  | "hasNet";

const STYLE_FLAG_WITHOUT_DEFAULT_DETAILS = new Set<DecorativeFeatureFlag>([
  "hasLining",
  "hasNet",
]);

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
  if (STYLE_FLAG_WITHOUT_DEFAULT_DETAILS.has(key)) {
    return Object.prototype.hasOwnProperty.call(style, key)
      ? style[key] === true
      : undefined;
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
  Lining: "hasLining",
  Net: "hasNet",
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
  if (getExplicitFeatureValue(style, "hasLining") === true) {
    features.add("Lining");
  }
  if (getExplicitFeatureValue(style, "hasNet") === true) {
    features.add("Net");
  }

  return sortDecorativeFeatures([...features]);
};

const LINING_CATALOG_OPTION_IDS = new Set<string>([
  DRESS_LINING_OPTION_ID,
  "skirt_additional_lining",
]);

const NET_CATALOG_OPTION_IDS = new Set<string>([
  "dress_additional_net",
  "skirt_additional_net",
]);

export const getStyleIncludedCatalogOverlapPrice = (
  selections: DesignSelections,
  catalog: readonly CustomDetailOption[],
  included: readonly DecorativeFeature[],
): number => {
  const suppressed = new Set<string>();
  if (included.includes("Lining")) {
    for (const optionId of LINING_CATALOG_OPTION_IDS) suppressed.add(optionId);
  }
  if (included.includes("Net")) {
    for (const optionId of NET_CATALOG_OPTION_IDS) suppressed.add(optionId);
  }
  if (suppressed.size === 0) return 0;
  return getCustomDetailsBreakdown(selections, [...catalog])
    .filter((item) => suppressed.has(item.originalId))
    .reduce((total, item) => total + item.price, 0);
};

export const filterDesignSelectionsForDecorativeFeatures = (
  selections: DesignSelections,
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): DesignSelections => {
  const customerSelectableFeatures = new Set(
    getCustomerSelectableDecorativeFeatures(),
  );
  const applicableFeatures = new Set(
    getApplicableDecorativeFeatures(style, garment),
  );
  const nextFeatures = sortDecorativeFeatures(
    [
      ...(selections.decorativeFeatures || []),
      ...(selections.hasMonogram === true ? ["Name Monogram" as const] : []),
    ].filter((feature) => customerSelectableFeatures.has(feature)),
  );
  const legacyFeature = DECORATIVE_FEATURE_OPTIONS.includes(
    selections.embroideryDesign as DecorativeFeature,
  )
    ? (selections.embroideryDesign as DecorativeFeature)
    : null;
  const validLegacyFeature =
    legacyFeature && customerSelectableFeatures.has(legacyFeature)
      ? legacyFeature
      : null;
  const nameMonogramSelected =
    nextFeatures.includes("Name Monogram") ||
      validLegacyFeature === "Name Monogram" ||
      selections.hasMonogram === true ||
      (applicableFeatures.has("Name Monogram") &&
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
    hasMonogram: customerSelectableFeatures.has("Name Monogram")
      ? selections.hasMonogram
      : undefined,
    monogramPlacement: nameMonogramSelected
      ? placementIsValid
        ? selections.monogramPlacement
        : defaultMonogramPlacementForContext(style, garment)
      : undefined,
    monogramText: nameMonogramSelected ? selections.monogramText : undefined,
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
  /** Set when this surcharge is charged for a specific parent garment occurrence. */
  garmentKey?: string;
  /** Always 1 for per-garment decorative feature lines. */
  quantity?: number;
}

export const hasGarmentScopedDecorativeFeatureSelections = (
  selections: DesignSelections | null | undefined,
): boolean =>
  Boolean(
    selections?.decorativeFeaturesByGarmentKey &&
      Object.keys(selections.decorativeFeaturesByGarmentKey).length > 0,
  );

export const getDecorativeFeaturesForGarment = (
  selections: DesignSelections | null | undefined,
  garmentKey: string,
): DecorativeFeature[] => {
  if (!selections) return [];
  if (hasGarmentScopedDecorativeFeatureSelections(selections)) {
    return sortDecorativeFeatures(
      selections.decorativeFeaturesByGarmentKey?.[garmentKey] || [],
    );
  }
  return sortDecorativeFeatures(selections.decorativeFeatures || []);
};

export const getMonogramPlacementForGarment = (
  selections: DesignSelections | null | undefined,
  garmentKey: string,
): MonogramPlacement | undefined => {
  if (!selections) return undefined;
  const stored = hasGarmentScopedDecorativeFeatureSelections(selections)
    ? selections.monogramPlacementByGarmentKey?.[garmentKey]
    : selections.monogramPlacement;
  if (!stored) return undefined;
  return resolveMonogramPlacementForGarmentType(
    getOriginalGarmentTypeFromKey(garmentKey),
    stored,
  );
};

export const getMonogramTextForGarment = (
  selections: DesignSelections | null | undefined,
  garmentKey: string,
): string | undefined => {
  if (!selections) return undefined;
  if (hasGarmentScopedDecorativeFeatureSelections(selections)) {
    return selections.monogramTextByGarmentKey?.[garmentKey];
  }
  if (garmentKey === "order") return selections.monogramText;
  return selections.monogramTextByGarmentKey?.[garmentKey] || selections.monogramText;
};

const firstMonogramText = (
  textByGarmentKey: Readonly<Record<string, string | undefined>>,
): string | undefined =>
  Object.keys(textByGarmentKey)
    .sort((left, right) => left.localeCompare(right))
    .map((garmentKey) => textByGarmentKey[garmentKey])
    .find((text) => typeof text === "string" && text.length > 0);

export const areAssignedMonogramNamesComplete = (
  selections: DesignSelections | null | undefined,
): boolean => {
  if (!selections) return true;
  const garmentKeys = getGarmentKeysForDecorativeFeature(
    selections,
    "Name Monogram",
  ).filter((garmentKey) => garmentKey !== "order");
  if (garmentKeys.length === 0) {
    const legacySelected = (selections.decorativeFeatures || []).includes(
      "Name Monogram",
    );
    if (!legacySelected) return true;
    return validateMonogramText(selections.monogramText).status === "valid";
  }
  return garmentKeys.every(
    (garmentKey) =>
      validateMonogramText(getMonogramTextForGarment(selections, garmentKey))
        .status === "valid",
  );
};

export const enumerateGarmentScopedDecorativeFeatureSelections = (
  selections: DesignSelections | null | undefined,
): readonly {
  garmentKey: string;
  feature: DecorativeFeature;
  placement?: MonogramPlacement;
}[] => {
  if (!selections || !hasGarmentScopedDecorativeFeatureSelections(selections)) {
    return (selections?.decorativeFeatures || []).map((feature) => ({
      garmentKey: "order",
      feature,
      placement:
        feature === "Name Monogram" ? selections?.monogramPlacement : undefined,
    }));
  }
  const rows: {
    garmentKey: string;
    feature: DecorativeFeature;
    placement?: MonogramPlacement;
  }[] = [];
  Object.entries(selections.decorativeFeaturesByGarmentKey || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([garmentKey, features]) => {
      sortDecorativeFeatures(features).forEach((feature) => {
        rows.push({
          garmentKey,
          feature,
          placement:
            feature === "Name Monogram"
              ? selections.monogramPlacementByGarmentKey?.[garmentKey]
              : undefined,
        });
      });
    });
  return rows;
};

const syncLegacyDecorativeFeatureMirror = (
  byGarmentKey: Readonly<Record<string, readonly DecorativeFeature[]>>,
  placementByGarmentKey: Readonly<Record<string, MonogramPlacement | undefined>>,
  textByGarmentKey: Readonly<Record<string, string | undefined>>,
): Pick<DesignSelections, "decorativeFeatures" | "monogramPlacement" | "monogramText"> => {
  const union = sortDecorativeFeatures(
    Object.values(byGarmentKey).flatMap((features) => [...features]),
  );
  const placement =
    Object.values(placementByGarmentKey).find(
      (value): value is MonogramPlacement => Boolean(value),
    ) || undefined;
  const text = firstMonogramText(textByGarmentKey);
  return {
    decorativeFeatures: union,
    monogramPlacement: union.includes("Name Monogram") ? placement : undefined,
    monogramText: union.includes("Name Monogram") ? text : undefined,
  };
};

export const expandLegacyDecorativeFeaturesOntoGarments = (
  selections: DesignSelections,
  activeParentGarmentKeys: readonly string[],
): DesignSelections => {
  if (
    hasGarmentScopedDecorativeFeatureSelections(selections) ||
    activeParentGarmentKeys.length === 0
  ) {
    return selections;
  }
  const legacyFeatures = sortDecorativeFeatures(
    selections.decorativeFeatures || [],
  );
  if (legacyFeatures.length === 0) return selections;
  const decorativeFeaturesByGarmentKey = Object.fromEntries(
    activeParentGarmentKeys.map((garmentKey) => [
      garmentKey,
      [...legacyFeatures],
    ]),
  );
  const monogramPlacementByGarmentKey =
    legacyFeatures.includes("Name Monogram") && selections.monogramPlacement
      ? Object.fromEntries(
          activeParentGarmentKeys.map((garmentKey) => [
            garmentKey,
            selections.monogramPlacement as MonogramPlacement,
          ]),
        )
      : {};
  const monogramTextByGarmentKey =
    legacyFeatures.includes("Name Monogram") && selections.monogramText
      ? Object.fromEntries(
          activeParentGarmentKeys.map((garmentKey) => [
            garmentKey,
            selections.monogramText,
          ]),
        )
      : { ...(selections.monogramTextByGarmentKey || {}) };
  return {
    ...selections,
    decorativeFeaturesByGarmentKey,
    monogramPlacementByGarmentKey,
    monogramTextByGarmentKey,
    ...syncLegacyDecorativeFeatureMirror(
      decorativeFeaturesByGarmentKey,
      monogramPlacementByGarmentKey,
      monogramTextByGarmentKey,
    ),
  };
};

export const setDecorativeFeaturesForGarment = (
  selections: DesignSelections,
  garmentKey: string,
  features: readonly DecorativeFeature[],
): DesignSelections => {
  const nextFeatures = sortDecorativeFeatures(features);
  const decorativeFeaturesByGarmentKey = {
    ...(selections.decorativeFeaturesByGarmentKey || {}),
  };
  const monogramPlacementByGarmentKey = {
    ...(selections.monogramPlacementByGarmentKey || {}),
  };
  const monogramTextByGarmentKey = {
    ...(selections.monogramTextByGarmentKey || {}),
  };
  if (nextFeatures.length === 0) {
    delete decorativeFeaturesByGarmentKey[garmentKey];
    delete monogramPlacementByGarmentKey[garmentKey];
    delete monogramTextByGarmentKey[garmentKey];
  } else {
    decorativeFeaturesByGarmentKey[garmentKey] = nextFeatures;
    if (!nextFeatures.includes("Name Monogram")) {
      delete monogramPlacementByGarmentKey[garmentKey];
      delete monogramTextByGarmentKey[garmentKey];
    } else if (!monogramPlacementByGarmentKey[garmentKey]) {
      monogramPlacementByGarmentKey[garmentKey] =
        getDefaultMonogramPlacementForGarmentType(
          getOriginalGarmentTypeFromKey(garmentKey),
        );
    }
  }
  return {
    ...selections,
    decorativeFeaturesByGarmentKey,
    monogramPlacementByGarmentKey,
    monogramTextByGarmentKey,
    ...syncLegacyDecorativeFeatureMirror(
      decorativeFeaturesByGarmentKey,
      monogramPlacementByGarmentKey,
      monogramTextByGarmentKey,
    ),
  };
};

export const toggleDecorativeFeatureForGarment = (
  selections: DesignSelections,
  garmentKey: string,
  feature: DecorativeFeature,
): DesignSelections => {
  const current = new Set(getDecorativeFeaturesForGarment(selections, garmentKey));
  if (current.has(feature)) current.delete(feature);
  else current.add(feature);
  return setDecorativeFeaturesForGarment(selections, garmentKey, [...current]);
};

export const clearDecorativeFeaturesForGarment = (
  selections: DesignSelections,
  garmentKey: string,
): DesignSelections =>
  setDecorativeFeaturesForGarment(selections, garmentKey, []);

export const getGarmentKeysForDecorativeFeature = (
  selections: DesignSelections | null | undefined,
  feature: DecorativeFeature,
): string[] => {
  if (!selections) return [];
  if (hasGarmentScopedDecorativeFeatureSelections(selections)) {
    return Object.entries(selections.decorativeFeaturesByGarmentKey || {})
      .filter(([, features]) => features.includes(feature))
      .map(([garmentKey]) => garmentKey)
      .sort((left, right) => left.localeCompare(right));
  }
  return (selections.decorativeFeatures || []).includes(feature)
    ? ["order"]
    : [];
};

export const setDecorativeFeatureGarmentAssignment = (
  selections: DesignSelections,
  feature: DecorativeFeature,
  garmentKey: string,
  assigned: boolean,
): DesignSelections => {
  const current = new Set(getDecorativeFeaturesForGarment(selections, garmentKey));
  if (assigned) current.add(feature);
  else current.delete(feature);
  return setDecorativeFeaturesForGarment(selections, garmentKey, [...current]);
};

export const clearDecorativeFeatureAcrossGarments = (
  selections: DesignSelections,
  feature: DecorativeFeature,
): DesignSelections => {
  if (!hasGarmentScopedDecorativeFeatureSelections(selections)) {
    const remaining = sortDecorativeFeatures(
      (selections.decorativeFeatures || []).filter((entry) => entry !== feature),
    );
    return {
      ...selections,
      decorativeFeatures: remaining,
      monogramPlacement:
        feature === "Name Monogram" || !remaining.includes("Name Monogram")
          ? undefined
          : selections.monogramPlacement,
      monogramText:
        feature === "Name Monogram" || !remaining.includes("Name Monogram")
          ? undefined
          : selections.monogramText,
      decorativeFeaturesByGarmentKey: {},
      monogramPlacementByGarmentKey: {},
      monogramTextByGarmentKey: {},
    };
  }
  let next = selections;
  getGarmentKeysForDecorativeFeature(selections, feature).forEach((garmentKey) => {
    next = setDecorativeFeatureGarmentAssignment(
      next,
      feature,
      garmentKey,
      false,
    );
  });
  return next;
};

export const clearAllDecorativeFeatures = (
  selections: DesignSelections,
): DesignSelections => ({
  ...selections,
  decorativeFeatures: [],
  monogramPlacement: undefined,
  monogramText: undefined,
  decorativeFeaturesByGarmentKey: {},
  monogramPlacementByGarmentKey: {},
  monogramTextByGarmentKey: {},
});

export const formatDecorativeFeatureQuantityPriceLabel = (
  unitPrice: number,
  quantity: number,
): string => {
  if (quantity <= 0) {
    return `+${PRICING_CURRENCY_SYMBOL}${unitPrice.toFixed(2)} per garment`;
  }
  return `${quantity} × ${PRICING_CURRENCY_SYMBOL}${unitPrice.toFixed(2)}`;
};

export const setMonogramPlacementForGarment = (
  selections: DesignSelections,
  garmentKey: string,
  placement: MonogramPlacement,
): DesignSelections => {
  const features = getDecorativeFeaturesForGarment(selections, garmentKey);
  if (!features.includes("Name Monogram")) return selections;
  const decorativeFeaturesByGarmentKey = {
    ...(selections.decorativeFeaturesByGarmentKey || {
      [garmentKey]: features,
    }),
    [garmentKey]: features,
  };
  const monogramPlacementByGarmentKey = {
    ...(selections.monogramPlacementByGarmentKey || {}),
    [garmentKey]: placement,
  };
  return {
    ...selections,
    decorativeFeaturesByGarmentKey,
    monogramPlacementByGarmentKey,
    ...syncLegacyDecorativeFeatureMirror(
      decorativeFeaturesByGarmentKey,
      monogramPlacementByGarmentKey,
      selections.monogramTextByGarmentKey || {},
    ),
  };
};

export const setMonogramTextForGarment = (
  selections: DesignSelections,
  garmentKey: string,
  text: unknown,
): DesignSelections => {
  const features = getDecorativeFeaturesForGarment(selections, garmentKey);
  if (!features.includes("Name Monogram")) return selections;
  const decorativeFeaturesByGarmentKey = {
    ...(selections.decorativeFeaturesByGarmentKey || {
      [garmentKey]: features,
    }),
    [garmentKey]: features,
  };
  const monogramPlacementByGarmentKey = {
    ...(selections.monogramPlacementByGarmentKey || {}),
  };
  if (!monogramPlacementByGarmentKey[garmentKey]) {
    monogramPlacementByGarmentKey[garmentKey] =
      getDefaultMonogramPlacementForGarmentType(
        getOriginalGarmentTypeFromKey(garmentKey),
      );
  }
  const monogramTextByGarmentKey = {
    ...(selections.monogramTextByGarmentKey || {}),
  };
  const validation = validateMonogramText(text);
  if (validation.status === "valid") {
    monogramTextByGarmentKey[garmentKey] = validation.text;
  } else {
    delete monogramTextByGarmentKey[garmentKey];
  }
  return {
    ...selections,
    decorativeFeaturesByGarmentKey,
    monogramPlacementByGarmentKey,
    monogramTextByGarmentKey,
    ...syncLegacyDecorativeFeatureMirror(
      decorativeFeaturesByGarmentKey,
      monogramPlacementByGarmentKey,
      monogramTextByGarmentKey,
    ),
  };
};

export const prefillMonogramTextForGarment = (
  selections: DesignSelections,
  garmentKey: string,
  orderedGarmentKeys: readonly string[],
): DesignSelections => {
  if (
    validateMonogramText(getMonogramTextForGarment(selections, garmentKey))
      .status === "valid"
  ) {
    return selections;
  }
  const source = orderedGarmentKeys.find((key) => {
    if (key === garmentKey) return false;
    return (
      validateMonogramText(getMonogramTextForGarment(selections, key)).status ===
      "valid"
    );
  });
  if (!source) return selections;
  return setMonogramTextForGarment(
    selections,
    garmentKey,
    getMonogramTextForGarment(selections, source) || "",
  );
};

export const formatCartMonogramLines = (
  selections: DesignSelections | null | undefined,
): string[] => {
  if (!selections) return [];
  return enumerateGarmentScopedDecorativeFeatureSelections(selections).flatMap(
    (row) => {
      if (row.feature !== "Name Monogram") return [];
      const text = getMonogramTextForGarment(selections, row.garmentKey);
      const placement = getMonogramPlacementLabel(row.placement);
      const line = [text, placement].filter(Boolean).join(" · ");
      return line ? [line] : [];
    },
  );
};

export const getCustomerSelectableDecorativeFeaturesForGarment = (
  style?: StyleCategory | null,
  garment?: CustomDetailGarmentContext | null,
): DecorativeFeature[] =>
  getCustomerSelectableDecorativeFeatures().filter(
    (feature) =>
      feature !== "Name Monogram" || isNameMonogramApplicable(style, garment),
  );

export const formatDecorativeFeatureUnitPriceLabel = (
  unitPrice: number,
): string => `1 × ${PRICING_CURRENCY_SYMBOL}${unitPrice.toFixed(2)}`;

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
  const usesGarmentScopedSelections =
    hasGarmentScopedDecorativeFeatureSelections(details);
  const detailsForApplicability = usesGarmentScopedSelections
    ? {
        ...details,
        // Style-included / placement filters still run on a flat view; customer
        // charges are summed from the by-garment map below.
        decorativeFeatures: [],
        monogramPlacement: undefined,
      }
    : details;
  const applicableDetails = filterDesignSelectionsForDecorativeFeatures(
    detailsForApplicability,
    decorativeFeatureStyle,
    garment,
  );
  const applicableFeatures = new Set(
    getApplicableDecorativeFeatures(decorativeFeatureStyle, garment),
  );
  const includedFeatureList = getIncludedDecorativeFeatures(
    decorativeFeatureStyle,
  ).filter((feature) => {
    if (feature === "Lining" || feature === "Net") return true;
    if (selectedFeatureContext) return false;
    return applicableFeatures.has(feature);
  });
  const includedFeatures = new Set(includedFeatureList);
  const selectedFeatures = new Set<DecorativeFeature>(
    usesGarmentScopedSelections
      ? []
      : applicableDetails.decorativeFeatures || [],
  );

  if (
    !usesGarmentScopedSelections &&
    applicableDetails.embroideryDesign &&
    DECORATIVE_FEATURE_OPTIONS.includes(
      applicableDetails.embroideryDesign as DecorativeFeature,
    )
  ) {
    selectedFeatures.add(
      applicableDetails.embroideryDesign as DecorativeFeature,
    );
  }

  const includedPricedFeatures = sortDecorativeFeatures([
    ...includedFeatures,
  ]).map((feature) => ({
    label: feature,
    price: getDecorativeFeaturePrice(style, feature),
    includedByStyle: true as const,
  }));
  const customerPricedFeatures: PricedSelection[] = usesGarmentScopedSelections
    ? enumerateGarmentScopedDecorativeFeatureSelections(details)
        .filter(
          ({ feature }) =>
            getCustomerSelectableDecorativeFeatures().includes(feature) &&
            !includedFeatures.has(feature),
        )
        .map(({ garmentKey, feature }) => ({
          label: feature,
          price: getDecorativeFeaturePrice(style, feature),
          includedByStyle: false,
          garmentKey,
          quantity: 1 as const,
        }))
    : sortDecorativeFeatures(
        [...selectedFeatures].filter((feature) => !includedFeatures.has(feature)),
      ).map((feature) => ({
        label: feature,
        price: getDecorativeFeaturePrice(style, feature),
        includedByStyle: false,
      }));
  // Style-included features remain a single order-level charge. Customer
  // garment-scoped lines are additive across garments.
  const decorativeFeatures = [
    ...includedPricedFeatures,
    ...customerPricedFeatures,
  ];
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
  const includedCatalogOverlap = getStyleIncludedCatalogOverlapPrice(
    applicableDetails,
    catalog,
    includedFeatureList,
  );

  return {
    total:
      calculateCustomDetailsPrice(applicableDetails, catalog) -
      includedCatalogOverlap +
      monogramPrice +
      accessoryPrice,
    monogramPrice,
    decorativeFeatures,
    accessories,
  };
};
