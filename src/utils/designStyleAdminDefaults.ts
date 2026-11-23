import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig.js";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine.js";
import type {
  BusinessSettings,
  CanonicalPhysicalGarmentType,
  CustomDetailGarmentGroup,
  CustomDetailSelectionGroup,
  FabricCapacityGarmentSpec,
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

export const ADAPTABLE_DESIGN_STYLE_GARMENT_TYPES: readonly CanonicalPhysicalGarmentType[] =
  [
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

export const deriveFeaturesMaleAndFemale = (
  representedGenders?: readonly string[],
): boolean =>
  Array.isArray(representedGenders) &&
  representedGenders.includes("male") &&
  representedGenders.includes("female");

export const formatDerivedGarmentCompositionLabel = (
  fabricCapacityComposition?: readonly FabricCapacityGarmentSpec[],
  fallbackComposition?: string,
): string => {
  if (
    Array.isArray(fabricCapacityComposition) &&
    fabricCapacityComposition.length > 0
  ) {
    const labels = [
      ...new Set(
        fabricCapacityComposition
          .filter((spec) => spec && typeof spec.garmentType === "string")
          .map((spec) =>
            formatCustomerVisibleKaftanText(
              getFabricGarmentLabel(spec.garmentType),
            ),
          )
          .filter(Boolean),
      ),
    ];
    if (labels.length > 0) {
      return labels.join(" + ");
    }
  }
  return customerCatalogueLabel(
    fallbackComposition?.trim() || DEFAULT_ADMIN_STYLE_COMPOSITION,
  );
};

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
  styleApplicability: { mode: "exact_only" },
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

export interface GroupedOutfitTypeOption {
  readonly label: string;
  readonly options: readonly string[];
}

export interface ResolveGroupedOutfitTypeOptionsParams {
  readonly businessSettings: Pick<BusinessSettings, "outfitTypes">;
  readonly fallbackOutfitTypes: NonNullable<BusinessSettings["outfitTypes"]>;
  readonly selectedGender?: string;
  readonly currentValue?: string;
}

export const resolveGroupedOutfitTypeOptions = ({
  businessSettings,
  fallbackOutfitTypes,
  selectedGender,
  currentValue,
}: ResolveGroupedOutfitTypeOptionsParams): readonly GroupedOutfitTypeOption[] => {
  const source =
    businessSettings.outfitTypes && businessSettings.outfitTypes.length > 0
      ? businessSettings.outfitTypes
      : fallbackOutfitTypes;

  const enabledEntries = source
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      ...entry,
      normalizedName: customerCatalogueLabel(entry.name),
    }))
    .filter((entry) => entry.normalizedName);

  enabledEntries.sort((a, b) => {
    const orderDiff = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return a.normalizedName.localeCompare(b.normalizedName);
  });

  const groups: Record<string, string[]> = {
    male: [],
    female: [],
    family: [],
    couple: [],
    unisex: [],
    other: [],
  };

  for (const entry of enabledEntries) {
    const gender = entry.gender ?? "other";
    if (groups[gender]) {
      groups[gender].push(entry.normalizedName);
    } else {
      groups.other.push(entry.normalizedName);
    }
  }

  for (const key of Object.keys(groups)) {
    const seen = new Set<string>();
    groups[key] = groups[key].filter((name) => {
      const lower = name.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }

  const buckets: GroupedOutfitTypeOption[] = [];

  const menswearOptions = [...groups.male, ...groups.unisex];
  if (menswearOptions.length > 0) {
    buckets.push({ label: "Menswear", options: menswearOptions });
  }

  if (groups.female.length > 0) {
    buckets.push({ label: "Womenswear", options: groups.female });
  }

  const coupleFamilyOptions = [...groups.couple, ...groups.family];
  if (coupleFamilyOptions.length > 0) {
    buckets.push({ label: "Couple & Family", options: coupleFamilyOptions });
  }

  const allEnabledNames = new Set(
    enabledEntries.map((e) => e.normalizedName.toLowerCase())
  );
  const otherSavedOptions: string[] = [];
  if (currentValue?.trim()) {
    const normalizedCurrent = customerCatalogueLabel(currentValue.trim());
    if (normalizedCurrent && !allEnabledNames.has(normalizedCurrent.toLowerCase())) {
      otherSavedOptions.push(normalizedCurrent);
    }
  }
  for (const name of groups.other) {
    if (!allEnabledNames.has(name.toLowerCase())) {
      otherSavedOptions.push(name);
    }
  }
  const otherSeen = new Set<string>();
  const dedupedOther = otherSavedOptions.filter((name) => {
    const lower = name.toLowerCase();
    if (otherSeen.has(lower)) return false;
    otherSeen.add(lower);
    return true;
  });
  if (dedupedOther.length > 0) {
    buckets.push({ label: "Other / Saved", options: dedupedOther });
  }

  const genderToBucket: Record<string, string> = {
    male: "Menswear",
    unisex: "Menswear",
    female: "Womenswear",
    couple: "Couple & Family",
    family: "Couple & Family",
  };
  const preferredBucketLabel = selectedGender
    ? genderToBucket[selectedGender]
    : "Menswear";

  const preferredIndex = buckets.findIndex((b) => b.label === preferredBucketLabel);
  if (preferredIndex > 0) {
    const [preferred] = buckets.splice(preferredIndex, 1);
    buckets.unshift(preferred);
  }

  return buckets;
};

export const getDefaultOutfitTypeForGender = (
  gender: string | undefined,
  businessSettings: Pick<BusinessSettings, "outfitTypes">,
  fallbackOutfitTypes: NonNullable<BusinessSettings["outfitTypes"]>,
): string => {
  const source =
    businessSettings.outfitTypes && businessSettings.outfitTypes.length > 0
      ? businessSettings.outfitTypes
      : fallbackOutfitTypes;

  const enabledEntries = source
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      ...entry,
      normalizedName: customerCatalogueLabel(entry.name),
    }))
    .filter((entry) => entry.normalizedName);

  enabledEntries.sort((a, b) => {
    const orderDiff = (a.displayOrder ?? 999) - (b.displayOrder ?? 999);
    if (orderDiff !== 0) return orderDiff;
    return a.normalizedName.localeCompare(b.normalizedName);
  });

  const genderLower = (gender ?? "male").toLowerCase();

  if (genderLower === "female") {
    const femaleEntry = enabledEntries.find((e) => e.gender === "female");
    return femaleEntry?.normalizedName ?? "Long Dress";
  }
  if (genderLower === "couple" || genderLower === "family") {
    // Both couple and family map to "family" gender in outfitTypes
    const familyEntry = enabledEntries.find((e) => e.gender === "family");
    return familyEntry?.normalizedName ?? (genderLower === "couple" ? "Couple Collection" : "Family Collection");
  }
  const maleEntry = enabledEntries.find((e) => e.gender === "male");
  return maleEntry?.normalizedName ?? DEFAULT_ADMIN_STYLE_OUTFIT_TYPE;
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
