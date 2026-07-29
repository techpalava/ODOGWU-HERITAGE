import {
  CustomDetailGarmentGroup,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  CustomDetailSelectionSnapshot,
  DesignSelections,
  StyleCategory,
} from "../types";
import { SEED_CUSTOM_DETAIL_CATALOG } from "../config/GarmentDetailsConfig";

const VALID_GARMENT_GROUPS = new Set<CustomDetailGarmentGroup>([
  "shirt",
  "dress",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
  "skirt",
]);

const VALID_SELECTION_GROUPS = new Set<CustomDetailSelectionGroup>([
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "skirt_length",
  "skirt_pockets",
]);

const VALID_DEMOGRAPHICS = new Set(["male", "female", "unisex"]);

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
  const priceCents = Number(merged.priceCents);
  const displayOrder = Number(merged.displayOrder);

  return {
    id: merged.id.trim(),
    label: merged.label.trim(),
    description: merged.description.trim(),
    garmentGroup: merged.garmentGroup as CustomDetailGarmentGroup,
    selectionGroup: merged.selectionGroup as CustomDetailSelectionGroup,
    priceCents:
      Number.isFinite(priceCents) && priceCents >= 0
        ? Math.round(priceCents)
        : fallback?.priceCents || 0,
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

const inferLegacyGarmentGroups = (
  style: StyleCategory,
): CustomDetailGarmentGroup[] => {
  const demographic = style.targetDemographic || style.gender;
  const isMale = demographic === "male";
  const isFemale = demographic === "female";
  const isBoth =
    demographic === "unisex" ||
    demographic === "family" ||
    demographic === "couple" ||
    style.featuresMaleAndFemale;
  const source =
    `${style.name || ""} ${style.garmentComposition || ""}`.toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => source.includes(term));
  const groups = new Set<CustomDetailGarmentGroup>();

  if (isMale || isBoth) {
    if (has("shirt", "top", "senator", "agbada")) {
      groups.add("shirt");
      groups.add("neck");
    }
    if (
      has(
        "trouser",
        "pant",
        "2 piece",
        "2-piece",
        "two piece",
        "two-piece",
      )
    ) {
      groups.add("trousers");
    }
    if (has("short", "nikka") && !has("bum")) groups.add("standard_shorts");
    if (has("bum")) groups.add("bum_shorts");
  }

  if (isFemale || isBoth) {
    if (has("dress", "gown", "boubou", "bubu")) {
      groups.add("dress");
      groups.add("neck");
    }
    if (has("skirt", "wrapper")) groups.add("skirt");
    if (has("bum")) groups.add("bum_shorts");
  }

  if (groups.size === 0) {
    const defaults = isMale ? ["shirt", "neck"] : isFemale ? ["dress", "neck"] : [];
    defaults.forEach((group) => groups.add(group as CustomDetailGarmentGroup));
  }

  return [...groups];
};

export const getSupportedCustomDetailGroups = (
  style: StyleCategory | null,
): CustomDetailGarmentGroup[] => {
  if (!style) return [];
  const config = style.customDetailConfig;
  if (config?.enabled === false) return [];

  const configuredGroups = (config?.supportedGarmentGroups || []).filter(
    (group) => VALID_GARMENT_GROUPS.has(group),
  );
  if (configuredGroups.length > 0) {
    return [...new Set(configuredGroups)];
  }

  return inferLegacyGarmentGroups(style);
};

export const getApplicableCustomDetailGroups = (
  style: StyleCategory | null,
  catalog: CustomDetailOption[],
): CustomDetailOption[] => {
  if (!style) return [];
  const supportedGroups = getSupportedCustomDetailGroups(style);
  const config = style.customDetailConfig;
  const demographic = style.targetDemographic || style.gender;
  const representedGenders =
    config?.representedGenders?.length
      ? config.representedGenders
      : demographic === "male"
        ? ["male"]
        : demographic === "female"
          ? ["female"]
          : ["male", "female"];

  return normalizeCustomDetailCatalog(catalog)
    .filter(
      (option) =>
        option.active &&
        supportedGroups.includes(option.garmentGroup) &&
        option.eligibleDemographics.some(
          (demographic) =>
            demographic === "unisex" ||
            representedGenders.includes(demographic as "male" | "female"),
        ),
    )
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        a.label.localeCompare(b.label),
    );
};

export const groupApplicableCustomDetails = (
  style: StyleCategory | null,
  catalog: CustomDetailOption[],
): Array<{
  id: CustomDetailSelectionGroup;
  garmentGroup: CustomDetailGarmentGroup;
  options: CustomDetailOption[];
}> => {
  const grouped = new Map<
    CustomDetailSelectionGroup,
    {
      id: CustomDetailSelectionGroup;
      garmentGroup: CustomDetailGarmentGroup;
      options: CustomDetailOption[];
    }
  >();

  for (const option of getApplicableCustomDetailGroups(style, catalog)) {
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

  return [...grouped.values()];
};

export const getRequiredCustomDetailGroups = (
  style: StyleCategory | null,
  catalog: CustomDetailOption[],
): CustomDetailSelectionGroup[] => {
  if (!style) return [];
  const applicable = groupApplicableCustomDetails(style, catalog);
  const applicableIds = new Set(applicable.map((group) => group.id));
  const configured = style.customDetailConfig?.requiredSelectionGroups || [];

  if (configured.length > 0) {
    return configured.filter((group) => applicableIds.has(group));
  }

  return applicable
    .filter((group) => group.options.some((option) => option.required))
    .map((group) => group.id);
};

export const getMissingCustomDetailGroup = (
  style: StyleCategory | null,
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): CustomDetailSelectionGroup | null =>
  getRequiredCustomDetailGroups(style, catalog).find(
    (group) => !selections.customDetails?.[group],
  ) || null;

export const getCustomDetailSnapshots = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
): CustomDetailSelectionSnapshot[] => {
  const effectiveCatalog = normalizeCustomDetailCatalog(catalog);

  return Object.values(selections.customDetails || {}).flatMap((optionId) => {
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
      },
    ];
  });
};

export const getCustomDetailsBreakdown = (
  selections: DesignSelections,
  catalog: CustomDetailOption[],
) => {
  const snapshots =
    selections.customDetailSnapshots?.length
      ? selections.customDetailSnapshots
      : getCustomDetailSnapshots(selections, catalog);

  return snapshots.map((option) => ({
    label: option.label,
    value: "",
    price: option.priceCents / 100,
    originalId: option.optionId,
  }));
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
