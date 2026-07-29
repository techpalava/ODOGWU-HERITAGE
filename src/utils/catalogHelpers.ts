import {
  CustomDetailGarmentGroup,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  CustomDetailSelectionSnapshot,
  DesignSelections,
  StyleCategory,
} from "../types";

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
    if (has("trouser", "pant", "2 piece", "two piece")) {
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
  if (config) {
    return config.enabled ? [...new Set(config.supportedGarmentGroups)] : [];
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
  const representedGenders =
    config?.representedGenders?.length
      ? config.representedGenders
      : style.gender === "male"
        ? ["male"]
        : style.gender === "female"
          ? ["female"]
          : ["male", "female"];

  return catalog
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
): CustomDetailSelectionSnapshot[] =>
  Object.values(selections.customDetails || {}).flatMap((optionId) => {
    const option = catalog.find((candidate) => candidate.id === optionId);
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
