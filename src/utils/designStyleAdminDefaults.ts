import { createStyleBaseGarmentSpec, STYLE_BASE_GARMENT_TYPES } from "../config/StyleFabricCapacityConfig.js";
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
  type DesignStyleReferenceComposition,
} from "./designStyleAuthority.js";
import { formatCustomerVisibleKaftanText } from "./optionalShortsPresentation.js";

/**
 * Returns the unified garment types for a design style being edited.
 * Prefers `designStyleAuthority.referenceComposition.garmentTypes` when status is "known" and non-empty;
 * otherwise falls back to `fabricCapacityComposition.map(spec => spec.garmentType)` deduplicated
 * in canonical `STYLE_BASE_GARMENT_TYPES` order.
 */
export const getUnifiedStyleGarmentTypes = (
  style: Pick<
    DesignStyleAdminProjection,
    "fabricCapacityComposition" | "designStyleAuthority"
  >,
): readonly CanonicalPhysicalGarmentType[] => {
  const authority = style.designStyleAuthority;
  if (
    authority?.referenceComposition?.status === "known" &&
    authority.referenceComposition.garmentTypes.length > 0
  ) {
    const knownSet = new Set<CanonicalPhysicalGarmentType>(
      authority.referenceComposition.garmentTypes,
    );
    return STYLE_BASE_GARMENT_TYPES.filter(
      (gt): gt is CanonicalPhysicalGarmentType =>
        gt !== "other" && knownSet.has(gt),
    );
  }
  const composition = style.fabricCapacityComposition ?? [];
  const garmentTypesSet = new Set<CanonicalPhysicalGarmentType>(
    composition
      .map((spec) => spec.garmentType)
      .filter(
        (gt): gt is CanonicalPhysicalGarmentType => gt !== "other",
      ),
  );
  return STYLE_BASE_GARMENT_TYPES.filter(
    (gt): gt is CanonicalPhysicalGarmentType =>
      gt !== "other" && garmentTypesSet.has(gt),
  );
};

/**
 * Synchronizes BOTH `fabricCapacityComposition` and `designStyleAuthority.referenceComposition`
 * from a canonical list of garment types (or the style's unified garment types when omitted).
 * Used when toggling garments and on legacy style save so untouched legacy styles never desync.
 */
export const syncUnifiedStyleGarmentComposition = (
  style: DesignStyleAdminProjection,
  garmentTypesInput?: readonly CanonicalPhysicalGarmentType[],
): DesignStyleAdminProjection => {
  const rawGarmentTypes = garmentTypesInput ?? getUnifiedStyleGarmentTypes(style);
  const selectedSet = new Set<CanonicalPhysicalGarmentType>(rawGarmentTypes);
  const nextGarmentTypes = STYLE_BASE_GARMENT_TYPES.filter(
    (gt): gt is CanonicalPhysicalGarmentType =>
      gt !== "other" && selectedSet.has(gt),
  );

  const nextFabricCapacityComposition = nextGarmentTypes.map(
    createStyleBaseGarmentSpec,
  );

  const nextReferenceComposition: DesignStyleReferenceComposition =
    nextGarmentTypes.length > 0
      ? { status: "known", garmentTypes: nextGarmentTypes }
      : { status: "legacy_unresolved", garmentTypes: [] };

  return {
    ...style,
    fabricCapacityComposition: nextFabricCapacityComposition,
    designStyleAuthority: {
      ...style.designStyleAuthority,
      referenceComposition: nextReferenceComposition,
    },
  };
};

/**
 * Toggles a garment type in the unified garment list, updating BOTH
 * `fabricCapacityComposition` and `designStyleAuthority.referenceComposition` in lockstep.
 * Returns the updated style object (shallow clone with updated fields).
 */
export const toggleUnifiedStyleGarmentType = (
  style: DesignStyleAdminProjection,
  garmentType: CanonicalPhysicalGarmentType,
): DesignStyleAdminProjection => {
  const currentUnified = getUnifiedStyleGarmentTypes(style);
  const isCurrentlySelected = currentUnified.includes(garmentType);
  const nextGarmentTypes = isCurrentlySelected
    ? currentUnified.filter((gt) => gt !== garmentType)
    : [...currentUnified, garmentType];

  return syncUnifiedStyleGarmentComposition(style, nextGarmentTypes);
};

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

/**
 * Built-in outfit types shared by Menswear and Womenswear. Saved Firestore
 * settings created before they became shared may still carry a single-gender
 * value ("male" / "female"); mergeOutfitTypesWithDefaults upgrades those to
 * "unisex" (keeping every other field, including an explicit enabled: false).
 */
export const SHARED_BUILT_IN_OUTFIT_TYPE_IDS: readonly string[] = [
  "senator-set",
  "standard-shirt",
  "standard-dress",
];

const SINGLE_GENDER_OUTFIT_VALUES = new Set(["male", "female"]);

const upgradeSharedBuiltInOutfitType = <
  T extends NonNullable<BusinessSettings["outfitTypes"]>[number],
>(
  entry: T,
): T => {
  const idKey = entry.id?.trim().toLowerCase();
  if (!idKey || !SHARED_BUILT_IN_OUTFIT_TYPE_IDS.includes(idKey)) return entry;
  const gender =
    typeof entry.gender === "string" ? entry.gender.trim().toLowerCase() : "";
  if (!SINGLE_GENDER_OUTFIT_VALUES.has(gender)) return entry;
  return { ...entry, gender: "unisex" } as T;
};

/**
 * Merges saved businessSettings.outfitTypes with built-in enabled defaults so
 * newly added outfit types appear in existing Firestore environments without
 * resurrecting entries explicitly disabled in saved settings. Shared built-in
 * types (Senator Set, Standard Shirt, Standard Dress) saved with a
 * single-gender value are upgraded to "unisex".
 */
export const mergeOutfitTypesWithDefaults = (
  configured: BusinessSettings["outfitTypes"] | undefined,
  fallback: NonNullable<BusinessSettings["outfitTypes"]>,
): NonNullable<BusinessSettings["outfitTypes"]> => {
  if (!configured || configured.length === 0) {
    return [...fallback];
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const entry of configured) {
    const idKey = entry.id?.trim().toLowerCase();
    if (idKey) seenIds.add(idKey);
    const nameKey = customerCatalogueLabel(entry.name).toLowerCase();
    if (nameKey) seenNames.add(nameKey);
  }
  const merged = configured.map(upgradeSharedBuiltInOutfitType);
  for (const entry of fallback) {
    if (entry.enabled === false) continue;
    const idKey = entry.id?.trim().toLowerCase();
    const nameKey = customerCatalogueLabel(entry.name).toLowerCase();
    if ((idKey && seenIds.has(idKey)) || (nameKey && seenNames.has(nameKey))) {
      continue;
    }
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.add(nameKey);
    merged.push(entry);
  }
  return merged;
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

  const KNOWN_GENDERS = new Set(["male", "female", "unisex", "couple", "family"]);
  const genderOf = (entry: (typeof enabledEntries)[number]): string => {
    const gender =
      typeof entry.gender === "string" ? entry.gender.trim().toLowerCase() : "";
    return KNOWN_GENDERS.has(gender) ? gender : "other";
  };
  // Entries keep the global displayOrder/alphabetical sort inside every
  // bucket, so a shared "unisex" type sits at the same relative position in
  // Menswear and Womenswear.
  const namesFor = (genders: readonly string[]): string[] =>
    enabledEntries
      .filter((entry) => genders.includes(genderOf(entry)))
      .map((entry) => entry.normalizedName);

  // Case-insensitive de-duplication is scoped to each optgroup: a shared
  // ("unisex") type is offered under BOTH Menswear and Womenswear, but no
  // label repeats inside a single optgroup. `offered` tracks every label
  // already shown so "Other / Saved" only lists genuinely missing values.
  const offered = new Set<string>();
  const dedupeWithinGroup = (names: readonly string[]): string[] => {
    const seenInGroup = new Set<string>();
    const result: string[] = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (seenInGroup.has(lower)) continue;
      seenInGroup.add(lower);
      result.push(name);
    }
    for (const name of result) offered.add(name.toLowerCase());
    return result;
  };

  const buckets: GroupedOutfitTypeOption[] = [];

  const menswearOptions = dedupeWithinGroup(namesFor(["male", "unisex"]));
  if (menswearOptions.length > 0) {
    buckets.push({ label: "Menswear", options: menswearOptions });
  }

  const womenswearOptions = dedupeWithinGroup(namesFor(["female", "unisex"]));
  if (womenswearOptions.length > 0) {
    buckets.push({ label: "Womenswear", options: womenswearOptions });
  }

  const coupleFamilyOptions = dedupeWithinGroup(namesFor(["couple", "family"]));
  if (coupleFamilyOptions.length > 0) {
    buckets.push({ label: "Couple & Family", options: coupleFamilyOptions });
  }

  // "Other / Saved" keeps enabled entries with an unknown/missing gender plus
  // the currently saved value (e.g. a legacy or disabled type such as
  // "Agbada") when it is not already offered in an earlier bucket.
  const normalizedCurrent = currentValue?.trim()
    ? customerCatalogueLabel(currentValue.trim())
    : "";
  const otherSavedOptions = dedupeWithinGroup(
    [
      ...namesFor(["other"]),
      ...(normalizedCurrent ? [normalizedCurrent] : []),
    ].filter((name) => !offered.has(name.toLowerCase())),
  );
  if (otherSavedOptions.length > 0) {
    buckets.push({ label: "Other / Saved", options: otherSavedOptions });
  }

  const genderToBucket: Record<string, string> = {
    male: "Menswear",
    unisex: "Menswear",
    female: "Womenswear",
    couple: "Couple & Family",
    family: "Couple & Family",
  };
  const normalizedGender = selectedGender?.trim().toLowerCase();
  const preferredBucketLabel = normalizedGender
    ? genderToBucket[normalizedGender]
    : "Menswear";

  const preferredIndex = preferredBucketLabel
    ? buckets.findIndex((b) => b.label === preferredBucketLabel)
    : -1;
  if (preferredIndex > 0) {
    const [preferred] = buckets.splice(preferredIndex, 1);
    buckets.unshift(preferred);
  }

  return buckets;
};

const CANONICAL_DEFAULT_OUTFIT_TYPE_BY_GENDER: Record<string, string> = {
  male: DEFAULT_ADMIN_STYLE_OUTFIT_TYPE,
  unisex: DEFAULT_ADMIN_STYLE_OUTFIT_TYPE,
  female: "Long Dress",
  couple: "Couple Collection",
  family: "Family Collection",
};

const OUTFIT_TYPE_GENDER_GROUPS: Record<string, readonly string[]> = {
  male: ["male", "unisex"],
  unisex: ["unisex", "male"],
  female: ["female", "unisex"],
  couple: ["couple", "family"],
  family: ["family", "couple"],
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

  const genderLower = gender?.trim().toLowerCase() || DEFAULT_ADMIN_STYLE_GENDER;
  const canonicalDefault =
    CANONICAL_DEFAULT_OUTFIT_TYPE_BY_GENDER[genderLower] ??
    DEFAULT_ADMIN_STYLE_OUTFIT_TYPE;

  const canonicalMatch = enabledEntries.find(
    (entry) =>
      entry.normalizedName.toLowerCase() === canonicalDefault.toLowerCase(),
  );
  if (canonicalMatch) {
    return canonicalDefault;
  }

  const genderGroup =
    OUTFIT_TYPE_GENDER_GROUPS[genderLower] ?? OUTFIT_TYPE_GENDER_GROUPS.male;
  const firstInGroup = enabledEntries.find(
    (entry) =>
      typeof entry.gender === "string" &&
      genderGroup.includes(entry.gender.trim().toLowerCase()),
  );
  return firstInGroup?.normalizedName ?? canonicalDefault;
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

/**
 * Derives represented custom-detail genders from the top-level Collection Audience.
 */
export const deriveRepresentedGendersFromStyleAudience = (
  gender?: string,
): Array<"male" | "female"> => {
  if (gender === "male") return ["male"];
  if (gender === "female") return ["female"];
  return ["male", "female"];
};

/**
 * Mirrors advisory "Originally designed for" metadata from selected garment specs.
 */
export const syncReferenceCompositionFromGarmentSpecs = (
  specs?: readonly FabricCapacityGarmentSpec[],
): DesignStyleReferenceComposition => {
  const garmentTypes = Array.isArray(specs)
    ? ([
        ...new Set(
          specs
            .map((spec) => spec?.garmentType)
            .filter(
              (g): g is CanonicalPhysicalGarmentType =>
                typeof g === "string" && g.length > 0,
            ),
        ),
      ] as CanonicalPhysicalGarmentType[])
    : [];
  return garmentTypes.length > 0
    ? { status: "known", garmentTypes }
    : { status: "legacy_unresolved", garmentTypes: [] };
};
