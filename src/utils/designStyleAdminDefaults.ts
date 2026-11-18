import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig.js";
import type {
  BusinessSettings,
  CustomDetailGarmentGroup,
  CustomDetailSelectionGroup,
} from "../types.js";
import { customerCatalogueLabel } from "./customerCatalogueLabel.js";
import {
  createDefaultDesignStyleAuthorityMetadata,
  type DesignStyleAdminProjection,
} from "./designStyleAuthority.js";
import { formatCustomerVisibleKaftanText } from "./optionalShortsPresentation.js";

export const DEFAULT_ADMIN_STYLE_GENDER = "male" as const;
export const DEFAULT_ADMIN_STYLE_OUTFIT_TYPE = "Senator Set" as const;
export const DEFAULT_ADMIN_STYLE_COMPOSITION = "Shirt Only" as const;
export const DEFAULT_ADMIN_STYLE_FABRIC_CATEGORY = "HiTarget Ankara" as const;

export const DEFAULT_ADMIN_STYLE_SUPPORTED_GARMENT_GROUPS: readonly CustomDetailGarmentGroup[] =
  ["shirt", "neck"];

export const DEFAULT_ADMIN_STYLE_REQUIRED_SELECTION_GROUPS: readonly CustomDetailSelectionGroup[] =
  ["shirt_construction", "shirt_pockets", "neck_design"];

export interface DesignStyleGenderOption {
  readonly value: "male" | "female" | "unisex" | "couple" | "family";
  readonly label: string;
}

const KNOWN_STYLE_GENDERS = new Set<DesignStyleGenderOption["value"]>([
  "male",
  "female",
  "unisex",
  "couple",
  "family",
]);

/**
 * Initializes a new Admin Design Style draft using the standardized Shirt / Long Shirt
 * catalogue defaults while keeping wearer flagging and optional paid extras disabled.
 */
export const createDefaultDesignStyleDraft = (
  id: string,
  displayOrder: number,
): DesignStyleAdminProjection => ({
  id,
  name: "",
  description: "",
  image: "",
  gender: DEFAULT_ADMIN_STYLE_GENDER,
  outfitType: DEFAULT_ADMIN_STYLE_OUTFIT_TYPE,
  garmentComposition: DEFAULT_ADMIN_STYLE_COMPOSITION,
  fabricCategory: DEFAULT_ADMIN_STYLE_FABRIC_CATEGORY,
  options: [],
  designCategories: [],
  detectedColors: { main: "", secondary: "" },
  constructionDetails: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("kaftan"),
  ],
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: [...DEFAULT_ADMIN_STYLE_SUPPORTED_GARMENT_GROUPS],
    requiredSelectionGroups: [...DEFAULT_ADMIN_STYLE_REQUIRED_SELECTION_GROUPS],
    enabled: true,
  },
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: false,
    hasMonogramTrimming: false,
    hasLining: false,
    hasNet: false,
  },
  monogramCuffEligible: false,
  embroideryProminence: "standard",
  defaultGarmentDetails: {},
  showsWearer: false,
  designStyleAuthority: {
    ...createDefaultDesignStyleAuthorityMetadata(displayOrder),
    referenceComposition: {
      status: "known",
      garmentTypes: ["shirt"],
    },
  },
});

/**
 * Parses comma-separated style tags/categories and normalizes legacy wording.
 */
export const parseDesignStyleCommaList = (raw: string): string[] =>
  raw
    .split(",")
    .map((entry) => formatCustomerVisibleKaftanText(entry.trim()))
    .filter(Boolean);

/**
 * Builds deduplicated customer-safe select options preserving any saved custom value.
 */
export const buildNormalizedStyleSelectOptions = ({
  configured,
  fallback,
  currentValue,
}: {
  readonly configured?: readonly string[];
  readonly fallback: readonly string[];
  readonly currentValue?: string;
}): string[] => {
  const base = configured && configured.length > 0 ? configured : fallback;
  const normalized = [
    ...base,
    ...(currentValue?.trim() ? [currentValue] : []),
  ]
    .map((item) => customerCatalogueLabel(item))
    .filter(Boolean);
  return [...new Set(normalized)];
};

export const resolveOutfitTypeOptions = (
  businessSettings: Pick<BusinessSettings, "outfitTypes">,
  fallbackOutfitTypes: NonNullable<BusinessSettings["outfitTypes"]>,
  currentValue?: string,
): string[] => {
  const source =
    businessSettings.outfitTypes && businessSettings.outfitTypes.length > 0
      ? businessSettings.outfitTypes
      : fallbackOutfitTypes;
  const enabledNames = source
    .filter((entry) => entry.enabled !== false)
    .map((entry) => entry.name);
  return buildNormalizedStyleSelectOptions({
    configured: enabledNames,
    fallback: fallbackOutfitTypes.map((entry) => entry.name),
    currentValue,
  });
};

export const resolveDesignStyleGenderOptions = (
  referenceGenders: readonly { readonly value: string; readonly label: string }[],
): DesignStyleGenderOption[] => {
  const byValue = new Map<DesignStyleGenderOption["value"], string>();
  for (const option of referenceGenders) {
    if (KNOWN_STYLE_GENDERS.has(option.value as DesignStyleGenderOption["value"])) {
      byValue.set(
        option.value as DesignStyleGenderOption["value"],
        option.label,
      );
    }
  }
  if (!byValue.has("couple")) {
    byValue.set("couple", "Couple Collection");
  }
  return Array.from(byValue.entries()).map(([value, label]) => ({
    value,
    label,
  }));
};
