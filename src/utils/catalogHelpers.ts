import {
  CustomDetailGarmentContext,
  CustomDetailGarmentGroup,
  CustomDetailDesignContext,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  CustomDetailSelectionSnapshot,
  DesignSelections,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  StyleCategory,
  UploadedDesignCustomDetailContext,
} from "../types";
import {
  ADDITIONAL_CLOTHES_COST_OPTION_ORDER,
  ADDITIONAL_CLOTHES_COST_SECTION_RANK,
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS,
  CUSTOM_DETAIL_OPTION_ORDER,
  CUSTOM_DETAIL_SELECTION_GROUP_ORDER,
  SEED_CUSTOM_DETAIL_CATALOG,
  type AdditionalClothesCostSection,
  type StandardCustomDetailSelectionGroup,
  type CustomDetailParentSectionId,
  CUSTOM_DETAIL_PARENT_SECTION_ORDER,
  CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION,
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
  CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION,
  DRESS_LINING_OPTION_ID,
} from "../config/GarmentDetailsConfig";
import {
  FABRIC_GARMENT_CAPACITY_UNITS,
  getCustomDetailGroupsForFabricComposition,
  getCustomDetailGroupsForFabricGarmentType,
  getStyleBaseCustomDetailGroups,
} from "../config/StyleFabricCapacityConfig";
import {
  getCanonicalShortsPriceCents,
  resolveGarmentPolicyDemographic,
} from "../config/AdditionalGarmentPolicy";

const VALID_GARMENT_GROUPS = new Set<CustomDetailGarmentGroup>([
  "shirt",
  "dress",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
  "skirt",
  "personalized",
]);

const VALID_SELECTION_GROUPS = new Set<CustomDetailSelectionGroup>(
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS,
);

export const CLOTHING_PRICE_SELECTION_GROUPS: readonly CustomDetailSelectionGroup[] = [
  "shirt_construction",
  "dress_construction",
  "standard_shorts_fastening",
  "bum_shorts_fastening",
  "trouser_fastening",
  "skirt_length",
];

const CLOTHING_PRICE_SELECTION_GROUP_SET =
  new Set<CustomDetailSelectionGroup>(CLOTHING_PRICE_SELECTION_GROUPS);

export const isClothingPriceSelectionGroup = (
  group: CustomDetailSelectionGroup,
): boolean => CLOTHING_PRICE_SELECTION_GROUP_SET.has(group);

const UNKNOWN_OPTION_ORDER_BASE = 10_000;

const getStableContentHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getOptionBusinessOrder = (
  optionId: string,
  displayOrder = 0,
): number =>
  CUSTOM_DETAIL_OPTION_ORDER[optionId] ??
  ADDITIONAL_CLOTHES_COST_OPTION_ORDER[optionId] ??
  UNKNOWN_OPTION_ORDER_BASE +
    (Number.isFinite(displayOrder) ? Math.max(0, displayOrder) : 0);

const getConfiguredDisplayOrder = (
  displayOrder: number | undefined,
): number | null =>
  Number.isFinite(displayOrder) && Number(displayOrder) >= 0
    ? Number(displayOrder)
    : null;

export const isAdditionalClothesCostSection = (
  group: CustomDetailSelectionGroup,
): group is AdditionalClothesCostSection =>
  Object.prototype.hasOwnProperty.call(
    ADDITIONAL_CLOTHES_COST_SECTION_RANK,
    group,
  );

const getSelectionGroupBusinessOrder = (
  group: CustomDetailSelectionGroup,
): number =>
  isAdditionalClothesCostSection(group)
    ? 1_000 + ADDITIONAL_CLOTHES_COST_SECTION_RANK[group]
    : CUSTOM_DETAIL_SELECTION_GROUP_ORDER[
        group as StandardCustomDetailSelectionGroup
      ];

const getOptionContentOrder = (
  option: Pick<
    CustomDetailOption,
    "label" | "description" | "priceCents" | "eligibleDemographics"
  >,
): number =>
  getStableContentHash(
    JSON.stringify([
      option.label,
      option.description,
      option.priceCents,
      [...option.eligibleDemographics].sort(),
    ]),
  );

export const sortCustomDetailOptions = (
  options: readonly CustomDetailOption[],
): CustomDetailOption[] =>
  [...options].sort((left, right) => {
    const groupOrder =
      getSelectionGroupBusinessOrder(left.selectionGroup) -
      getSelectionGroupBusinessOrder(right.selectionGroup);
    if (groupOrder !== 0) return groupOrder;

    const leftDisplayOrder = getConfiguredDisplayOrder(left.displayOrder);
    const rightDisplayOrder = getConfiguredDisplayOrder(right.displayOrder);
    if (
      leftDisplayOrder !== null &&
      rightDisplayOrder !== null &&
      leftDisplayOrder !== rightDisplayOrder
    ) {
      return leftDisplayOrder - rightDisplayOrder;
    }
    if (leftDisplayOrder !== null && rightDisplayOrder === null) return -1;
    if (leftDisplayOrder === null && rightDisplayOrder !== null) return 1;

    // Canonical ID order remains a deterministic legacy fallback for records
    // whose configured display order is missing or tied.
    const fallbackOrder =
      getOptionBusinessOrder(left.id, left.displayOrder) -
      getOptionBusinessOrder(right.id, right.displayOrder);
    if (fallbackOrder !== 0) return fallbackOrder;

    return getOptionContentOrder(left) - getOptionContentOrder(right);
  });

export const sortAdditionalClothesCostSections = <
  T extends AdditionalClothesCostSection,
>(
  sections: readonly T[],
): T[] =>
  [...sections].sort(
    (left, right) =>
      ADDITIONAL_CLOTHES_COST_SECTION_RANK[left] -
      ADDITIONAL_CLOTHES_COST_SECTION_RANK[right],
  );

const VALID_DEMOGRAPHICS = new Set(["male", "female", "unisex"]);
const VALID_FABRIC_GARMENT_TYPES = new Set(
  Object.keys(FABRIC_GARMENT_CAPACITY_UNITS),
);

const normalizeFabricCapacityGarmentSpec = (
  candidate: unknown,
  fallback?: FabricCapacityGarmentSpec,
): FabricCapacityGarmentSpec | undefined => {
  if (!candidate || typeof candidate !== "object") {
    return fallback ? { ...fallback } : undefined;
  }

  const value = candidate as Partial<FabricCapacityGarmentSpec>;
  if (
    typeof value.key !== "string" ||
    !value.key.trim() ||
    typeof value.garmentType !== "string" ||
    !VALID_FABRIC_GARMENT_TYPES.has(value.garmentType) ||
    (value.fabricUnits !== 1 && value.fabricUnits !== 2) ||
    (value.lowerGarmentType !== undefined &&
      value.lowerGarmentType !== "trousers" &&
      value.lowerGarmentType !== "skirt")
  ) {
    return fallback ? { ...fallback } : undefined;
  }

  return {
    key: value.key.trim(),
    garmentType: value.garmentType as FabricCapacityGarmentSpec["garmentType"],
    fabricUnits: value.fabricUnits,
    ...(value.lowerGarmentType
      ? { lowerGarmentType: value.lowerGarmentType }
      : {}),
  };
};

const normalizeCatalogOption = (
  candidate: unknown,
  fallback?: CustomDetailOption,
): CustomDetailOption | null => {
  if (!candidate || typeof candidate !== "object") return fallback || null;

  const saved = candidate as Partial<CustomDetailOption>;
  const merged = { ...(fallback || {}), ...saved } as Partial<CustomDetailOption>;
  const demographics = Array.isArray(merged.eligibleDemographics)
    ? merged.eligibleDemographics.filter((item) =>
        VALID_DEMOGRAPHICS.has(item),
      )
    : [];

  if (
    typeof merged.id !== "string" ||
    !merged.id.trim() ||
    typeof merged.label !== "string" ||
    !merged.label.trim() ||
    typeof merged.description !== "string" ||
    !VALID_GARMENT_GROUPS.has(
      merged.garmentGroup as CustomDetailGarmentGroup,
    ) ||
    !VALID_SELECTION_GROUPS.has(
      merged.selectionGroup as CustomDetailSelectionGroup,
    )
  ) {
    return fallback || null;
  }

  const fallbackDemographics = fallback?.eligibleDemographics || [];
  const configuredPriceCents = Number(merged.priceCents);
  const canonicalShortsPriceCents = getCanonicalShortsPriceCents(merged.id);
  const displayOrder = Number(merged.displayOrder);
  const fabricCapacityGarmentSpec = normalizeFabricCapacityGarmentSpec(
    merged.fabricCapacityGarmentSpec,
    fallback?.fabricCapacityGarmentSpec,
  );

  return {
    id: merged.id.trim(),
    label: merged.label.trim(),
    description: merged.description.trim(),
    garmentGroup: merged.garmentGroup as CustomDetailGarmentGroup,
    selectionGroup: merged.selectionGroup as CustomDetailSelectionGroup,
    priceCents:
      canonicalShortsPriceCents ??
      (Number.isFinite(configuredPriceCents) && configuredPriceCents >= 0
        ? Math.round(configuredPriceCents)
        : fallback?.priceCents || 0),
    eligibleDemographics:
      demographics.length > 0 ? demographics : fallbackDemographics,
    displayOrder: Number.isFinite(displayOrder)
      ? displayOrder
      : fallback?.displayOrder || 0,
    required:
      typeof merged.required === "boolean"
        ? merged.required
        : fallback?.required || false,
    active:
      typeof merged.active === "boolean"
        ? merged.active
        : fallback?.active ?? true,
    allowMultiple:
      typeof merged.allowMultiple === "boolean"
        ? merged.allowMultiple
        : fallback?.allowMultiple || false,
    informational:
      typeof merged.informational === "boolean"
        ? merged.informational
        : fallback?.informational || false,
    requiresEvaluation:
      typeof merged.requiresEvaluation === "boolean"
        ? merged.requiresEvaluation
        : fallback?.requiresEvaluation || false,
    ...(fabricCapacityGarmentSpec ? { fabricCapacityGarmentSpec } : {}),
    createdAt:
      typeof merged.createdAt === "string"
        ? merged.createdAt
        : fallback?.createdAt || new Date().toISOString(),
    updatedAt:
      typeof merged.updatedAt === "string"
        ? merged.updatedAt
        : fallback?.updatedAt || new Date().toISOString(),
  };
};

export const normalizeCustomDetailCatalog = (
  catalog: unknown,
): CustomDetailOption[] => {
  const savedOptions = Array.isArray(catalog) ? catalog : [];
  const savedById = new Map<string, unknown>();

  for (const option of savedOptions) {
    if (
      option &&
      typeof option === "object" &&
      typeof (option as { id?: unknown }).id === "string"
    ) {
      savedById.set((option as { id: string }).id, option);
    }
  }

  const canonicalIds = new Set(
    SEED_CUSTOM_DETAIL_CATALOG.map((option) => option.id),
  );
  const canonical = SEED_CUSTOM_DETAIL_CATALOG.map((seed) =>
    normalizeCatalogOption(savedById.get(seed.id), seed),
  ).filter((option): option is CustomDetailOption => option !== null);
  const validCustomOptions = savedOptions
    .filter(
      (option) =>
        option &&
        typeof option === "object" &&
        typeof (option as { id?: unknown }).id === "string" &&
        !canonicalIds.has((option as { id: string }).id),
    )
    .map((option) => normalizeCatalogOption(option))
    .filter((option): option is CustomDetailOption => option !== null);

  return [...canonical, ...validCustomOptions];
};

const MALE_GROUPS: CustomDetailGarmentGroup[] = [
  "shirt",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
];

const FEMALE_GROUPS: CustomDetailGarmentGroup[] = [
  "dress",
  "neck",
  "bum_shorts",
  "skirt",
];

const uniqueGarmentGroups = (
  groups: CustomDetailGarmentGroup[],
): CustomDetailGarmentGroup[] => [...new Set(groups)];

const isUploadedDesignCustomDetailContext = (
  design: CustomDetailDesignContext,
): design is UploadedDesignCustomDetailContext =>
  "kind" in design && design.kind === "uploaded";

const getCatalogStyle = (
  design: CustomDetailDesignContext,
): StyleCategory | null =>
  isUploadedDesignCustomDetailContext(design) ? null : design;

export const getStyleDemographic = resolveGarmentPolicyDemographic;

const inferGarmentGroupsFromText = (
  style: StyleCategory,
  values: Array<string | undefined>,
): CustomDetailGarmentGroup[] => {
  const { isMale, isFemale, isUnisex, explicitlyBoth } =
    getStyleDemographic(style);
  const supportsMale = isMale || isUnisex || explicitlyBoth;
  const supportsFemale = isFemale || isUnisex || explicitlyBoth;
  const source = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const groups = new Set<CustomDetailGarmentGroup>();
  const withoutShortSleeves = source.replace(
    /\bshort(?:\s*|-)?sleeves?\b/g,
    "",
  );
  const withoutShortPants = withoutShortSleeves.replace(
    /\bleg\s+pants?\s*\(\s*shorts?\s*\)/g,
    "",
  );
  const hasFemaleKaftan =
    (isFemale && !explicitlyBoth && /\bkaftans?\b/.test(source)) ||
    /\b(?:female|woman|women|lady|ladies)\s+kaftans?\b/.test(source);
  const hasShirt =
    /\b(shirts?|blouses?)\b/.test(source) ||
    (supportsMale && /\b(senator|agbada|kaftans?|tunics?)\b/.test(source)) ||
    /\btops?\s*(?:\+|and\b|with\b|only\b)/.test(source) ||
    /\b(?:male|female|men'?s|women'?s)\s+tops?\b/.test(source);
  const hasDress =
    /\b(dress(?:es)?|gowns?|boubou|bubu)\b/.test(source) ||
    hasFemaleKaftan;
  const hasBumShorts =
    /\bbum(?:\s+leg)?\s+shorts?\b|\bleg\s+shorts?\s*\(\s*bum\s*\)/.test(
      withoutShortSleeves,
    );
  const hasStandardShorts =
    !hasBumShorts &&
    /\bnikka\b|\bstandard(?:\s+leg)?\s+shorts?\b|\bshorts?\s+only\b|\bleg\s+pants?\s*\(\s*shorts?\s*\)|\bshirts?\s*\+\s*(?:leg\s+pants?\s*)?\(?\s*shorts?\s*\)?/.test(
      withoutShortSleeves,
    );
  const hasTrouser =
    /\btrousers?\b|\bleg\s+pants?\b|\bpants?\s+only\b/.test(
      withoutShortPants,
    );
  const hasSkirt = /\bskirts?|wrapper\b/.test(source);

  if ((supportsMale || supportsFemale) && hasShirt) {
    groups.add("shirt");
    groups.add("neck");
  }

  if (supportsMale) {
    if (hasStandardShorts) groups.add("standard_shorts");
    if (hasBumShorts) groups.add("bum_shorts");
  }

  if (supportsFemale) {
    if (hasDress) {
      groups.add("dress");
      groups.add("neck");
    }
    if (hasSkirt) groups.add("skirt");
    if (hasBumShorts) groups.add("bum_shorts");
    if (hasStandardShorts) groups.add("standard_shorts");
  }

  if ((supportsMale || supportsFemale) && hasTrouser) {
    groups.add("trousers");
  }

  if (supportsMale && /\b(senator|agbada)\b/.test(source)) {
    groups.add("shirt");
    groups.add("neck");
    groups.add("trousers");
  }

  return [...groups];
};

const getConfiguredGarmentGroups = (
  style: StyleCategory,
): CustomDetailGarmentGroup[] => {
  const baseGarmentGroups = getStyleBaseCustomDetailGroups(style);
  if (baseGarmentGroups.length > 0) return baseGarmentGroups;

  return uniqueGarmentGroups(
    (style.customDetailConfig?.supportedGarmentGroups || []).filter((group) =>
      VALID_GARMENT_GROUPS.has(group),
    ),
  );
};

const inferStyleCompositionGroups = (
  style: StyleCategory,
): CustomDetailGarmentGroup[] => {
  const compositionValues = [
    ...(style.garmentCompositionList || []),
    style.garmentComposition,
    style.outfitType,
  ];
  const groups = inferGarmentGroupsFromText(style, compositionValues);
  const source = compositionValues.filter(Boolean).join(" ").toLowerCase();
  const { isMale, explicitlyBoth } = getStyleDemographic(style);
  const isMultiPiece = /\b(2|3|two|three)[ -]?piece\b/.test(source);
  const explicitlySingle = /\bonly\b/.test(source);

  if (
    isMale &&
    !explicitlyBoth &&
    isMultiPiece &&
    !explicitlySingle &&
    !groups.some((group) =>
      ["trousers", "standard_shorts", "bum_shorts"].includes(group),
    )
  ) {
    groups.push("shirt", "neck", "trousers");
  }

  return uniqueGarmentGroups(groups);
};

export const getSelectedGarmentCode = (
  garment: CustomDetailGarmentContext,
): string => {
  const directCode = String(garment.code || "").trim().toUpperCase();
  if (directCode) return directCode;

  return (
    String(garment.type || "")
      .toUpperCase()
      .match(/\b(?:G\d+(?:\.\d+)?|L\d+(?:\.\d+)?)\b/)?.[0] || ""
  );
};

export const isAmbiguousLowerGarment = (code?: string): boolean => {
  if (!code) return false;
  return /^(?:L6|L7|L8(?:\.\d+)?|L9(?:\.\d+)?)$/.test(code);
};

const getSelectedGarmentGender = (
  garment?: CustomDetailGarmentContext | null,
): "male" | "female" | null => {
  if (!garment) return null;
  const code = getSelectedGarmentCode(garment);
  if (code.startsWith("G")) return "male";
  if (code.startsWith("L")) return "female";

  const source = `${garment.type || ""} ${garment.composition || ""}`
    .trim()
    .toLowerCase();
  if (/\b(male|man|men|guy|guys)\b/.test(source)) return "male";
  if (/\b(female|woman|women|lady|ladies)\b/.test(source)) {
    return "female";
  }
  return null;
};

const getSelectedGarmentLowerGroups = (
  style: StyleCategory,
  garment: CustomDetailGarmentContext,
): CustomDetailGarmentGroup[] => {
  const code = getSelectedGarmentCode(garment);
  const isL8L9 = /^L(?:8|9)(?:\.\d+)?$/.test(code);
  const isL6L7 = /^L[67]$/.test(code);

  let lowerGroups: CustomDetailGarmentGroup[] = [];

  if (isL8L9 || isL6L7) {
    lowerGroups = ["trousers", "skirt"];
  } else {
    lowerGroups = inferGarmentGroupsFromText(style, [
      garment.composition,
      garment.type,
    ]).filter((group) =>
      ["standard_shorts", "bum_shorts", "trousers", "skirt"].includes(group),
    );
  }

  const isAmbiguousLower = lowerGroups.includes("trousers") && lowerGroups.includes("skirt");
  if (isAmbiguousLower) {
    if (garment.lowerGarmentType === "trousers") {
      return ["trousers"];
    }
    if (garment.lowerGarmentType === "skirt") {
      return ["skirt"];
    }
    return [];
  }

  if (lowerGroups.length <= 1) return lowerGroups;

  const configuredLowerGroups = getConfiguredGarmentGroups(style).filter(
    (group) => lowerGroups.includes(group),
  );
  if (configuredLowerGroups.length > 0) return configuredLowerGroups;

  const compositionLowerGroups = inferStyleCompositionGroups(style).filter(
    (group) => lowerGroups.includes(group),
  );
  return compositionLowerGroups.length > 0
    ? compositionLowerGroups
    : lowerGroups;
};

const inferSelectedGarmentGroups = (
  style: StyleCategory,
  garment?: CustomDetailGarmentContext | null,
): CustomDetailGarmentGroup[] => {
  if (!garment) return [];
  const code = getSelectedGarmentCode(garment);
  if (code === "EXACT" || code === "AUTO") return [];

  if (/^G[12]$/.test(code)) return ["shirt", "neck"];
  if (code === "G3") return ["standard_shorts"];
  if (code === "G4") return ["trousers"];
  if (/^G[56]\.1$/.test(code)) {
    return ["shirt", "neck", "standard_shorts"];
  }
  if (/^G[56]\.2$/.test(code)) {
    return ["shirt", "neck", "trousers"];
  }
  if (/^L[1-4]$/.test(code)) return ["dress", "neck"];
  if (/^L[67]$/.test(code)) {
    return uniqueGarmentGroups(
      getSelectedGarmentLowerGroups(style, garment),
    );
  }
  if (/^L(?:8|9)(?:\.\d+)?$/.test(code)) {
    return uniqueGarmentGroups([
      "dress",
      "neck",
      ...getSelectedGarmentLowerGroups(style, garment),
    ]);
  }

  return inferGarmentGroupsFromText(style, [
    garment.composition,
    garment.type,
  ]);
};

const getLegacyGarmentGroupResolution = (
  style: StyleCategory,
): {
  groups: CustomDetailGarmentGroup[];
  usedDemographicDefault: boolean;
} => {
  const { isFemale, explicitlyBoth } = getStyleDemographic(style);
  const groups = inferGarmentGroupsFromText(style, [
    style.name,
    style.description,
    ...(style.options || []),
    ...(style.designCategories || []),
  ]);

  if (groups.length === 0) {
    const defaults: CustomDetailGarmentGroup[] = explicitlyBoth
      ? ["shirt", "dress", "neck"]
      : isFemale
        ? ["dress", "neck"]
        : ["shirt", "neck", "trousers"];
    return { groups: defaults, usedDemographicDefault: true };
  }

  return {
    groups: uniqueGarmentGroups(groups),
    usedDemographicDefault: false,
  };
};

export const inferLegacyGarmentGroups = (
  style: StyleCategory,
): CustomDetailGarmentGroup[] =>
  getLegacyGarmentGroupResolution(style).groups;

export type CustomDetailGroupResolutionSource =
  | "selected_garment"
  | "configured"
  | "composition"
  | "legacy_inference"
  | "legacy_demographic_default"
  | "disabled"
  | "none";

export interface CustomDetailGroupResolution {
  groups: CustomDetailGarmentGroup[];
  source: CustomDetailGroupResolutionSource;
}

export const getSupportedCustomDetailGroupResolution = (
  design: CustomDetailDesignContext | null,
  garment?: CustomDetailGarmentContext | null,
): CustomDetailGroupResolution => {
  if (!design) return { groups: [], source: "none" };
  if (isUploadedDesignCustomDetailContext(design)) {
    return {
      groups: getCustomDetailGroupsForFabricComposition(
        design.fabricCapacityComposition,
      ),
      source: "composition",
    };
  }

  const style = design;
  const config = style.customDetailConfig;
  if (config?.enabled === false) return { groups: [], source: "disabled" };

  const selectedGarmentGroups = inferSelectedGarmentGroups(style, garment);
  const code = garment ? getSelectedGarmentCode(garment) : "";
  const hasSpecificCode = code && code !== "EXACT" && code !== "AUTO";

  if (hasSpecificCode || selectedGarmentGroups.length > 0) {
    return { groups: selectedGarmentGroups, source: "selected_garment" };
  }

  const configuredGroups = getConfiguredGarmentGroups(style);
  if (configuredGroups.length > 0) {
    return { groups: configuredGroups, source: "configured" };
  }

  const compositionGroups = inferStyleCompositionGroups(style);
  if (compositionGroups.length > 0) {
    return { groups: compositionGroups, source: "composition" };
  }

  const legacy = getLegacyGarmentGroupResolution(style);
  return {
    groups: legacy.groups,
    source: legacy.usedDemographicDefault
      ? "legacy_demographic_default"
      : "legacy_inference",
  };
};

export const getSupportedCustomDetailGroups = (
  design: CustomDetailDesignContext | null,
  garment?: CustomDetailGarmentContext | null,
): CustomDetailGarmentGroup[] =>
  getSupportedCustomDetailGroupResolution(design, garment).groups;

export const isLiningEligibleForStyle = (
  design: CustomDetailDesignContext | null,
  garmentCode?: string,
): boolean => {
  if (!design) return false;

  const { isFemale, isUnisex, explicitlyBoth } = getStyleDemographic(design);
  if (!isFemale && !isUnisex && !explicitlyBoth) return false;

  if (garmentCode && garmentCode !== "EXACT") {
    return getSupportedCustomDetailGroups(design, { code: garmentCode }).includes("dress");
  }

  return getSupportedCustomDetailGroups(design).includes("dress");
};

const getPhysicalGarmentOptionIds = (
  selections: DesignSelections | undefined,
): string[] => {
  if (!selections) return [];
  return [
    ...new Set(
      Object.values(selections.customDetails || {}).flatMap((selection) =>
        (Array.isArray(selection) ? selection : [selection]).filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        ),
      ),
    ),
  ];
};

export const getSelectedCustomDetailPhysicalGarmentOptions = (
  selections: DesignSelections | undefined,
  catalog: CustomDetailOption[],
): CustomDetailOption[] => {
  const selectedIds = new Set(getPhysicalGarmentOptionIds(selections));
  if (selectedIds.size === 0) return [];
  return normalizeCustomDetailCatalog(catalog).filter(
    (option) =>
      selectedIds.has(option.id) && Boolean(option.fabricCapacityGarmentSpec),
  );
};

export const getSelectedCustomDetailPhysicalGarmentGroups = (
  selections: DesignSelections | undefined,
  catalog: CustomDetailOption[],
): CustomDetailGarmentGroup[] =>
  uniqueGarmentGroups(
    getSelectedCustomDetailPhysicalGarmentOptions(selections, catalog).flatMap(
      (option) =>
        getCustomDetailGroupsForFabricGarmentType(
          option.fabricCapacityGarmentSpec!.garmentType,
        ),
    ),
  );

export const clearCustomDetailPhysicalGarmentSelections = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): DesignSelections => {
  const physicalOptionIds = new Set(
    normalizeCustomDetailCatalog(catalog)
      .filter((option) => Boolean(option.fabricCapacityGarmentSpec))
      .map((option) => option.id),
  );
  if (physicalOptionIds.size === 0) return selections;

  const nextCustomDetails: NonNullable<DesignSelections["customDetails"]> = {};
  for (const [rawGroup, rawSelection] of Object.entries(
    selections.customDetails || {},
  )) {
    const remainingIds = (Array.isArray(rawSelection)
      ? rawSelection
      : [rawSelection]
    ).filter(
      (optionId): optionId is string =>
        typeof optionId === "string" && !physicalOptionIds.has(optionId),
    );
    if (remainingIds.length === 0) continue;
    nextCustomDetails[rawGroup as CustomDetailSelectionGroup] = Array.isArray(
      rawSelection,
    )
      ? remainingIds
      : remainingIds[0];
  }

  const nextSnapshots = selections.customDetailSnapshots?.filter(
    (snapshot) => !physicalOptionIds.has(snapshot.optionId),
  );
  return {
    ...selections,
    customDetails: nextCustomDetails,
    ...(selections.customDetailSnapshots
      ? { customDetailSnapshots: nextSnapshots }
      : {}),
  };
};

export const getApplicableCustomDetailGroups = (
  design: CustomDetailDesignContext | null,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  selections?: DesignSelections,
  additionalGarmentTypes: readonly FabricGarmentType[] = [],
): CustomDetailOption[] => {
  if (!design) return [];
  const supportedGroups = uniqueGarmentGroups([
    ...getSupportedCustomDetailGroups(design, garment),
    ...getSelectedCustomDetailPhysicalGarmentGroups(selections, catalog),
    ...additionalGarmentTypes.flatMap((garmentType) =>
      getCustomDetailGroupsForFabricGarmentType(garmentType),
    ),
  ]);
  const style = getCatalogStyle(design);
  const config = style?.customDetailConfig;
  const { isMale, isFemale } = getStyleDemographic(design);
  const selectedGarmentGender = getSelectedGarmentGender(garment);
  const configuredGenders = (config?.representedGenders || [])
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is "male" | "female" =>
      value === "male" || value === "female",
    );
  const representedGenders: Array<"male" | "female"> =
    selectedGarmentGender
      ? [selectedGarmentGender]
      : configuredGenders.length > 0
      ? configuredGenders
      : isMale
        ? ["male"]
        : isFemale
          ? ["female"]
          : ["male", "female"];
  const isEligible = (option: CustomDetailOption) =>
    (option.garmentGroup === "personalized"
      ? supportedGroups.length > 0
      : supportedGroups.includes(option.garmentGroup)) &&
    option.eligibleDemographics.some(
      (demographic) =>
        demographic === "unisex" ||
        representedGenders.includes(demographic as "male" | "female"),
    );
  const normalizedCatalog = normalizeCustomDetailCatalog(catalog);
  const activeOptions = normalizedCatalog.filter(
    (option) => option.active && isEligible(option),
  );
  const groupsWithActiveOptions = new Set(
    activeOptions.map((option) => option.garmentGroup),
  );
  const missingGroups = supportedGroups.filter(
    (group) => !groupsWithActiveOptions.has(group),
  );
  const canonicalRecovery = SEED_CUSTOM_DETAIL_CATALOG.filter(
    (option) =>
      option.active &&
      missingGroups.includes(option.garmentGroup) &&
      isEligible(option),
  );
  const recoveredById = new Map(
    [...activeOptions, ...canonicalRecovery].map((option) => [
      option.id,
      option,
    ]),
  );

  return sortCustomDetailOptions([...recoveredById.values()]);
};

export interface ApplicableCustomDetailGroup {
  id: CustomDetailSelectionGroup;
  garmentGroup: CustomDetailGarmentGroup;
  options: CustomDetailOption[];
}

export const sortApplicableCustomDetailGroups = (
  groups: readonly ApplicableCustomDetailGroup[],
): ApplicableCustomDetailGroup[] =>
  [...groups]
    .map((group) => ({
      ...group,
      options: sortCustomDetailOptions(group.options),
    }))
    .sort(
      (left, right) =>
        getSelectionGroupBusinessOrder(left.id) -
        getSelectionGroupBusinessOrder(right.id),
    );

export const groupApplicableCustomDetails = (
  design: CustomDetailDesignContext | null,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  selections?: DesignSelections,
  additionalGarmentTypes: readonly FabricGarmentType[] = [],
): ApplicableCustomDetailGroup[] => {
  const grouped = new Map<
    CustomDetailSelectionGroup,
    {
      id: CustomDetailSelectionGroup;
      garmentGroup: CustomDetailGarmentGroup;
      options: CustomDetailOption[];
    }
  >();

  for (const option of getApplicableCustomDetailGroups(
    design,
    catalog,
    garment,
    selections,
    additionalGarmentTypes,
  )) {
    const existing = grouped.get(option.selectionGroup);
    if (existing) {
      existing.options.push(option);
    } else {
      grouped.set(option.selectionGroup, {
        id: option.selectionGroup,
        garmentGroup: option.garmentGroup,
        options: [option],
      });
    }
  }

  return sortApplicableCustomDetailGroups([...grouped.values()]);
};

export const getRequiredCustomDetailGroups = (
  design: CustomDetailDesignContext | null,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  selections?: DesignSelections,
  additionalGarmentTypes: readonly FabricGarmentType[] = [],
): CustomDetailSelectionGroup[] => {
  if (!design) return [];
  const applicable = groupApplicableCustomDetails(
    design,
    catalog,
    garment,
    selections,
    additionalGarmentTypes,
  );
  const applicableIds = new Set(applicable.map((group) => group.id));
  const configured = getCatalogStyle(design)?.customDetailConfig
    ?.requiredSelectionGroups || [];

  if (configured.length > 0) {
    const selectedPhysicalGarmentGroups = new Set(
      [
        ...getSelectedCustomDetailPhysicalGarmentGroups(selections, catalog),
        ...additionalGarmentTypes.flatMap((garmentType) =>
          getCustomDetailGroupsForFabricGarmentType(garmentType),
        ),
      ],
    );
    const requiredIds = new Set<CustomDetailSelectionGroup>([
      ...configured.filter((group) => applicableIds.has(group)),
      ...applicable
        .filter(
          (group) =>
            selectedPhysicalGarmentGroups.has(group.garmentGroup) &&
            group.options.some((option) => option.required),
        )
        .map((group) => group.id),
    ]);
    return applicable
      .map((group) => group.id)
      .filter((groupId) => requiredIds.has(groupId));
  }

  return applicable
    .filter((group) => group.options.some((option) => option.required))
    .map((group) => group.id);
};

export const getCustomDetailSelectionOptionIds = (
  selection: string | string[] | undefined,
): string[] => {
  const values = Array.isArray(selection) ? selection : [selection];
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0,
  ))];
};

export const getSelectedCustomDetailOptionIds = (
  selections: DesignSelections,
): string[] => {
  const hasLiveSelections = Object.prototype.hasOwnProperty.call(
    selections,
    "customDetails",
  );
  const optionIds = hasLiveSelections
    ? Object.values(selections.customDetails || {}).flatMap(
        getCustomDetailSelectionOptionIds,
      )
    : (selections.customDetailSnapshots || []).map(
        (snapshot) => snapshot.optionId,
      );

  return [...new Set(optionIds)];
};

const stripObsoleteCustomDetailNotes = (
  selections: DesignSelections,
): DesignSelections => {
  const legacySelections = selections as DesignSelections & {
    customDetailNotes?: unknown;
  };
  if (
    !Object.prototype.hasOwnProperty.call(
      legacySelections,
      "customDetailNotes",
    )
  ) {
    return selections;
  }

  const sanitizedSelections = { ...legacySelections };
  delete sanitizedSelections.customDetailNotes;
  return sanitizedSelections;
};

const stripObsoleteSnapshotNote = (
  snapshot: CustomDetailSelectionSnapshot,
): CustomDetailSelectionSnapshot => {
  const legacySnapshot = snapshot as CustomDetailSelectionSnapshot & {
    note?: unknown;
  };
  if (!Object.prototype.hasOwnProperty.call(legacySnapshot, "note")) {
    return snapshot;
  }

  const sanitizedSnapshot = { ...legacySnapshot };
  delete sanitizedSnapshot.note;
  return sanitizedSnapshot;
};

export const hasSelectedCustomDetailOption = (
  selections: DesignSelections,
  optionId: string,
): boolean => getSelectedCustomDetailOptionIds(selections).includes(optionId);

export const getMissingCustomDetailGroup = (
  design: CustomDetailDesignContext | null,
  selections: DesignSelections,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  additionalGarmentTypes: readonly FabricGarmentType[] = [],
): CustomDetailSelectionGroup | null =>
  getRequiredCustomDetailGroups(
    design,
    catalog,
    garment,
    selections,
    additionalGarmentTypes,
  ).find(
    (group) =>
      getCustomDetailSelectionOptionIds(
        selections.customDetails?.[group],
      ).length === 0,
  ) || null;

export const getSelectableCustomDetailOptions = (
  catalog: CustomDetailOption[],
): CustomDetailOption[] => {
  const normalizedCatalog = normalizeCustomDetailCatalog(catalog);
  const activeOptions = normalizedCatalog.filter((option) => option.active);
  return sortCustomDetailOptions(activeOptions);
};

export const getSelectableCustomDetailGroups = (
  catalog: CustomDetailOption[],
): ApplicableCustomDetailGroup[] => {
  const grouped = new Map<
    CustomDetailSelectionGroup,
    {
      id: CustomDetailSelectionGroup;
      garmentGroup: CustomDetailGarmentGroup;
      options: CustomDetailOption[];
    }
  >();

  for (const option of getSelectableCustomDetailOptions(catalog)) {
    const existing = grouped.get(option.selectionGroup);
    if (existing) {
      existing.options.push(option);
    } else {
      grouped.set(option.selectionGroup, {
        id: option.selectionGroup,
        garmentGroup: option.garmentGroup,
        options: [option],
      });
    }
  }

  return sortApplicableCustomDetailGroups([...grouped.values()]);
};

export const filterDesignSelectionsForCustomDetails = (
  design: CustomDetailDesignContext | null,
  selections: DesignSelections,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  additionalGarmentTypes: readonly FabricGarmentType[] = [],
): DesignSelections => {
  const sanitizedSelections = stripObsoleteCustomDetailNotes(selections);
  if (!design) return sanitizedSelections;

  const selectableGroups = groupApplicableCustomDetails(
    design,
    catalog,
    garment,
    sanitizedSelections,
    additionalGarmentTypes,
  );
  const selectableGroupsById = new Map(
    selectableGroups.map((group) => [group.id, group]),
  );
  const isSelectableSelection = (
    group: CustomDetailSelectionGroup,
    optionId: string,
  ): boolean =>
    selectableGroupsById
      .get(group)
      ?.options.some((option) => option.id === optionId) === true;
  const hasLiveSelections = Object.prototype.hasOwnProperty.call(
    sanitizedSelections,
    "customDetails",
  );
  const currentCustomDetails = sanitizedSelections.customDetails || {};
  const nextCustomDetails: NonNullable<DesignSelections["customDetails"]> = {};

  for (const [rawGroup, rawSelection] of Object.entries(
    currentCustomDetails,
  )) {
    const group = rawGroup as CustomDetailSelectionGroup;
    const selectableGroup = selectableGroupsById.get(group);
    if (!selectableGroup) continue;

    const selectedIds = new Set(
      getCustomDetailSelectionOptionIds(rawSelection),
    );
    const selectableSelectedIds = selectableGroup.options
      .map((option) => option.id)
      .filter((optionId) => selectedIds.has(optionId));
    if (selectableSelectedIds.length === 0) continue;

    const allowsMultiple = selectableGroup.options.some(
      (option) => option.allowMultiple,
    );
    nextCustomDetails[group] =
      allowsMultiple && Array.isArray(rawSelection)
        ? selectableSelectedIds
        : selectableSelectedIds[0];
  }

  const areSelectionValuesEqual = (
    left: string | string[] | undefined,
    right: string | string[] | undefined,
  ): boolean => {
    if (Array.isArray(left) || Array.isArray(right)) {
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((value, index) => value === right[index])
      );
    }
    return left === right;
  };
  const currentCustomDetailKeys = Object.keys(currentCustomDetails);
  const customDetailsChanged =
    hasLiveSelections &&
    (currentCustomDetailKeys.length !== Object.keys(nextCustomDetails).length ||
      currentCustomDetailKeys.some(
        (group) =>
          !areSelectionValuesEqual(
            nextCustomDetails[group as CustomDetailSelectionGroup],
            currentCustomDetails[group as CustomDetailSelectionGroup],
          ),
      ));
  const nextSnapshots = sanitizedSelections.customDetailSnapshots
    ? sortCustomDetailSelectionSnapshots(
        sanitizedSelections.customDetailSnapshots.filter((snapshot) =>
          isSelectableSelection(snapshot.selectionGroup, snapshot.optionId),
        ),
      )
    : undefined;
  const snapshotsChanged =
    Boolean(sanitizedSelections.customDetailSnapshots) &&
    (nextSnapshots?.length !== sanitizedSelections.customDetailSnapshots?.length ||
      nextSnapshots.some(
        (snapshot, index) =>
          snapshot !== sanitizedSelections.customDetailSnapshots?.[index],
      ));

  if (
    sanitizedSelections === selections &&
    !customDetailsChanged &&
    !snapshotsChanged
  ) {
    return selections;
  }

  return {
    ...sanitizedSelections,
    ...(hasLiveSelections ? { customDetails: nextCustomDetails } : {}),
    ...(sanitizedSelections.customDetailSnapshots
      ? { customDetailSnapshots: nextSnapshots }
      : {}),
  };
};

export const filterDesignSelectionsForActivePhysicalGarments = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
  activeGarmentTypes: readonly FabricGarmentType[],
): DesignSelections => {
  const activeGarmentGroups = new Set(
    activeGarmentTypes.flatMap((garmentType) =>
      getCustomDetailGroupsForFabricGarmentType(garmentType),
    ),
  );
  const normalizedCatalog = normalizeCustomDetailCatalog(catalog);
  const groupGarmentType = new Map(
    normalizedCatalog.map((option) => [
      option.selectionGroup,
      option.garmentGroup,
    ]),
  );
  const currentDetails = selections.customDetails || {};
  const nextDetails = Object.fromEntries(
    Object.entries(currentDetails).filter(([group]) => {
      const garmentGroup = groupGarmentType.get(
        group as CustomDetailSelectionGroup,
      );
      return (
        !garmentGroup ||
        garmentGroup === "personalized" ||
        activeGarmentGroups.has(garmentGroup)
      );
    }),
  ) as NonNullable<DesignSelections["customDetails"]>;
  const allowedOptionIds = new Set(
    Object.values(nextDetails).flatMap(getCustomDetailSelectionOptionIds),
  );
  const nextSnapshots = selections.customDetailSnapshots?.filter((snapshot) =>
    allowedOptionIds.has(snapshot.optionId),
  );
  const changed =
    Object.keys(nextDetails).length !== Object.keys(currentDetails).length ||
    (selections.customDetailSnapshots?.length || 0) !==
      (nextSnapshots?.length || 0);

  return changed
    ? {
        ...selections,
        customDetails: nextDetails,
        ...(selections.customDetailSnapshots
          ? { customDetailSnapshots: nextSnapshots }
          : {}),
      }
    : selections;
};

export const getCustomDetailSnapshots = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): CustomDetailSelectionSnapshot[] => {
  const effectiveCatalog = normalizeCustomDetailCatalog(catalog);

  return sortCustomDetailSelectionSnapshots(
    getSelectedCustomDetailOptionIds(selections).flatMap((optionId) => {
      const option = effectiveCatalog.find(
        (candidate) => candidate.id === optionId,
      );
      if (!option) return [];
      return [
        {
          optionId: option.id,
          label: option.label,
          description: option.description,
          garmentGroup: option.garmentGroup,
          selectionGroup: option.selectionGroup,
          priceCents: option.priceCents,
          informational: option.informational,
          requiresEvaluation: option.requiresEvaluation,
        },
      ];
    }),
  );
};

export const sortCustomDetailSelectionSnapshots = (
  snapshots: readonly CustomDetailSelectionSnapshot[],
): CustomDetailSelectionSnapshot[] =>
  snapshots.map(stripObsoleteSnapshotNote).sort((left, right) => {
    const groupOrder =
      getSelectionGroupBusinessOrder(left.selectionGroup) -
      getSelectionGroupBusinessOrder(right.selectionGroup);
    if (groupOrder !== 0) return groupOrder;

    const optionOrder =
      getOptionBusinessOrder(left.optionId) -
      getOptionBusinessOrder(right.optionId);
    if (optionOrder !== 0) return optionOrder;

    return (
      getStableContentHash(
        JSON.stringify([left.label, left.description, left.priceCents]),
      ) -
      getStableContentHash(
        JSON.stringify([right.label, right.description, right.priceCents]),
      )
    );
  });

export const getSelectedCustomDetailSnapshots = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): CustomDetailSelectionSnapshot[] => {
  const hasLiveSelections = Object.prototype.hasOwnProperty.call(
    selections,
    "customDetails",
  );

  const snapshots = hasLiveSelections
    ? getCustomDetailSnapshots(selections, catalog)
    : selections.customDetailSnapshots?.length
      ? sortCustomDetailSelectionSnapshots(
          selections.customDetailSnapshots,
        )
      : [];

  return sortCustomDetailSelectionSnapshots([
    ...new Map(
      snapshots.map((snapshot) => [snapshot.optionId, snapshot]),
    ).values(),
  ]);
};

export interface CustomDetailsPriceBreakdown {
  clothingPrice: number;
  constructionUpgradesPrice: number;
  total: number;
}

export const calculateCustomDetailsPriceBreakdown = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): CustomDetailsPriceBreakdown => {
  const totals = getSelectedCustomDetailSnapshots(selections, catalog).reduce(
    (current, option) => {
      const key = isClothingPriceSelectionGroup(option.selectionGroup)
        ? "clothingPriceCents"
        : "constructionUpgradesPriceCents";
      current[key] += Math.max(0, Math.round(option.priceCents));
      return current;
    },
    { clothingPriceCents: 0, constructionUpgradesPriceCents: 0 },
  );

  return {
    clothingPrice: totals.clothingPriceCents / 100,
    constructionUpgradesPrice:
      totals.constructionUpgradesPriceCents / 100,
    total:
      (totals.clothingPriceCents +
        totals.constructionUpgradesPriceCents) /
      100,
  };
};

export const getCustomDetailsBreakdown = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
) => {
  return getSelectedCustomDetailSnapshots(selections, catalog).map((option) => ({
    label: option.label,
    value: "",
    price: option.priceCents / 100,
    originalId: option.optionId,
    selectionGroup: option.selectionGroup,
    garmentGroup: option.garmentGroup,
    informational: option.informational || false,
    requiresEvaluation: option.requiresEvaluation || false,
  }));
};

const toCustomerFacingSectionTitle = (rawTitle: string): string =>
  rawTitle
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase());

export const getCustomDetailSelectionGroupCustomerTitle = (
  group: CustomDetailSelectionGroup,
): string => {
  if (isAdditionalClothesCostSection(group)) {
    return CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[group];
  }

  const parentId = CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION[
    group as StandardCustomDetailSelectionGroup
  ];
  if (!parentId) {
    return CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[group] || group;
  }

  return toCustomerFacingSectionTitle(
    CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION[parentId].title,
  );
};

export const calculateCustomDetailsPrice = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): number =>
  getCustomDetailsBreakdown(selections, catalog).reduce(
    (total, item) => total + item.price,
    0,
  );

export const isMaleCustomDetailGroup = (
  group: CustomDetailGarmentGroup,
): boolean => MALE_GROUPS.includes(group);

export const isFemaleCustomDetailGroup = (
  group: CustomDetailGarmentGroup,
): boolean => FEMALE_GROUPS.includes(group);

export interface ParentCustomDetailSection {
  id: CustomDetailParentSectionId;
  title: string;
  groups: ApplicableCustomDetailGroup[];
}

export const groupCustomDetailGroupsByParentSection = (
  groups: ApplicableCustomDetailGroup[],
): ParentCustomDetailSection[] => {
  const parentMap = new Map<CustomDetailParentSectionId, ApplicableCustomDetailGroup[]>();

  for (const group of groups) {
    const parentId = CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION[
      group.id as StandardCustomDetailSelectionGroup
    ];
    if (parentId) {
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, []);
      }
      parentMap.get(parentId)!.push(group);
    }
  }

  const result: ParentCustomDetailSection[] = [];
  for (const parentId of CUSTOM_DETAIL_PARENT_SECTION_ORDER) {
    const sectionGroups = parentMap.get(parentId);
    if (sectionGroups && sectionGroups.length > 0) {
      result.push({
        id: parentId,
        title: CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION[parentId].title,
        groups: sectionGroups,
      });
    }
  }

  return result;
};

export const canClearCustomDetailSelectionGroup = (
  selections: DesignSelections,
  groupId: CustomDetailSelectionGroup,
  design: CustomDetailDesignContext | null,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
): boolean => {
  if (!design) return false;

  const effectiveCatalog = normalizeCustomDetailCatalog(catalog);

  // 1. A required group cannot be cleared.
  const enrichedGarment = garment
    ? { ...garment, lowerGarmentType: selections.lowerGarmentType }
    : { lowerGarmentType: selections.lowerGarmentType };
  const requiredGroups = getRequiredCustomDetailGroups(
    design,
    effectiveCatalog,
    enrichedGarment,
    selections,
  );
  if (requiredGroups.includes(groupId)) {
    return false;
  }

  // 2. Must contain at least one selected, active, genuine customer-selectable option.
  const customDetails = selections.customDetails || {};
  const selectedOptionIds = getCustomDetailSelectionOptionIds(customDetails[groupId]);
  if (selectedOptionIds.length === 0 && !(groupId === "dress_additional" && selections.hasLining)) {
    return false;
  }

  // Find all active, non-informational options for this group in the effective catalog
  const selectableOptions = effectiveCatalog.filter(
    (opt) => opt.selectionGroup === groupId && opt.active && !opt.informational
  );
  const selectableOptionIds = new Set(selectableOptions.map((opt) => opt.id));

  // Legacy lining option is special case - check if L5 is selectable in the catalog
  const isLiningSelectable = selectableOptionIds.has(DRESS_LINING_OPTION_ID);

  // Check if any of the selected option IDs are actually selectable and active
  const hasGenuineSelection = selectedOptionIds.some((id) => selectableOptionIds.has(id)) ||
    (groupId === "dress_additional" && selections.hasLining && isLiningSelectable);

  return hasGenuineSelection;
};

export const clearCustomDetailSelectionGroup = (
  selections: DesignSelections,
  groupId: CustomDetailSelectionGroup,
  design: CustomDetailDesignContext | null,
  catalog: CustomDetailOption[],
  garment?: CustomDetailGarmentContext | null,
  allowRequiredClear = false,
): DesignSelections => {
  const effectiveCatalog = normalizeCustomDetailCatalog(catalog);

  // 1. Confirm the group is not required.
  // If a direct attempt is made to clear a required group, the helper should return the original selections object unchanged.
  const enrichedGarment = garment
    ? { ...garment, lowerGarmentType: selections.lowerGarmentType }
    : { lowerGarmentType: selections.lowerGarmentType };
  const requiredGroups = getRequiredCustomDetailGroups(
    design,
    effectiveCatalog,
    enrichedGarment,
    selections,
  );
  if (!allowRequiredClear && requiredGroups.includes(groupId)) {
    return selections;
  }

  // 2. Clone the current customDetails object and delete the group key.
  const nextCustomDetails = selections.customDetails
    ? { ...selections.customDetails }
    : {};
  delete nextCustomDetails[groupId];

  // 3. Clone and filter snapshots (do not mutate the original snapshot array).
  const nextSnapshots = selections.customDetailSnapshots
    ? selections.customDetailSnapshots.filter(
        (snapshot) => snapshot.selectionGroup !== groupId,
      )
    : undefined;

  // 4. Synchronize Dress Lining legacy state
  // Check if the cleared group contains DRESS_LINING_OPTION_ID (which is in dress_additional)
  const isDressLiningCleared = groupId === "dress_additional";

  let updatedSelections: DesignSelections = {
    ...selections,
    customDetails: nextCustomDetails,
    ...(selections.customDetailSnapshots ? { customDetailSnapshots: nextSnapshots } : {}),
    ...(isDressLiningCleared ? { hasLining: false } : {}),
  };

  // Run through the authoritative custom details sanitation pipeline
  updatedSelections = filterDesignSelectionsForCustomDetails(
    design,
    updatedSelections,
    effectiveCatalog,
    garment,
  );

  return updatedSelections;
};
