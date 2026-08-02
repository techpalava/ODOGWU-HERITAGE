import type {
  CustomDetailOption,
  DecorativeFeature,
  DesignSelections,
  StyleCategory,
} from "../types";
import { calculateCustomDetailsPrice } from "./catalogHelpers";

export const DECORATIVE_FEATURE_OPTIONS: readonly DecorativeFeature[] = [
  "Name Monogram",
  "Embroidery",
  "Monogram Trimming",
];

export const DECORATIVE_FEATURE_DESCRIPTIONS: Readonly<
  Record<DecorativeFeature, string>
> = {
  "Name Monogram":
    "Add your name to your shirt on the left chest pocket area.",
  Embroidery:
    "Additional special patterns based on the selected clothing design.",
  "Monogram Trimming":
    "Additional special trim patterns based on the selected clothing design.",
};

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

const DEFAULT_DECORATIVE_PRICE = 12;
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

export const calculateGarmentDetailsPrice = (
  details: DesignSelections,
  style?: StyleCategory | null,
  catalog: CustomDetailOption[] = [],
): GarmentDetailsPrice => {
  const includedFeatures = new Set(getIncludedDecorativeFeatures(style));
  const selectedFeatures = new Set<DecorativeFeature>(
    details.decorativeFeatures || [],
  );

  if (
    details.embroideryDesign &&
    DECORATIVE_FEATURE_OPTIONS.includes(
      details.embroideryDesign as DecorativeFeature,
    )
  ) {
    selectedFeatures.add(details.embroideryDesign as DecorativeFeature);
  }

  const allFeatures = new Set<DecorativeFeature>([
    ...includedFeatures,
    ...selectedFeatures,
  ]);
  const decorativeFeatures = sortDecorativeFeatures([...allFeatures]).map((feature) => ({
    label: feature,
    price: getOverridePrice(
      style,
      "embroideryDesign",
      feature,
      DEFAULT_DECORATIVE_PRICE,
    ),
    includedByStyle: includedFeatures.has(feature),
  }));
  const accessories = sortTraditionalAccessories(
    details.accessories || [],
  ).map((accessory) => ({
    label: accessory,
    price: getOverridePrice(
      style,
      "accessories",
      accessory,
      DEFAULT_ACCESSORY_PRICE,
    ),
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
      calculateCustomDetailsPrice(details, catalog) +
      monogramPrice +
      accessoryPrice,
    monogramPrice,
    decorativeFeatures,
    accessories,
  };
};
