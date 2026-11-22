import type {
  CanonicalPhysicalGarmentType,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentType,
  GarmentConstructionPriceComponent,
  GarmentConstructionPricingResolution,
} from "../types.js";
export type {
  GarmentConstructionPriceComponent,
  GarmentConstructionPricingFailureCode,
  GarmentConstructionPricingResolution,
  ResolvedGarmentConstructionPricing,
  UnresolvedGarmentConstructionPricing,
} from "../types.js";
import {
  STYLE_BASE_GARMENT_TYPES,
  createStyleBaseGarmentSpec,
  getDefaultGarmentDetailsForSpec,
} from "../config/StyleFabricCapacityConfig.js";
import {
  isClothingPriceSelectionGroup,
  sortCustomDetailOptions,
} from "./catalogHelpers.js";
import {
  DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
  DRESS_LONG_LENGTH_MID_SLEEVE_OPTION_ID,
  DRESS_STANDARD_LONG_SLEEVE_OPTION_ID,
  DRESS_STANDARD_MID_SLEEVE_OPTION_ID,
  SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
  SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID,
  resolveLegacySleeveConstructionOptionId,
} from "./sleeveConstruction.js";

export const CANONICAL_PHYSICAL_GARMENT_TYPES: readonly CanonicalPhysicalGarmentType[] = [
  ...STYLE_BASE_GARMENT_TYPES,
] as CanonicalPhysicalGarmentType[];

/** Customer-selectable Step 1 garment keys. Agbada remains canonical/internal only. */
export type CustomerSelectableGarmentType = Exclude<
  CanonicalPhysicalGarmentType,
  "agbada"
>;

/**
 * Authoritative customer-facing garment picker list for Design Studio.
 * Agbada remains canonical/internal but is hidden from NEW customer selection.
 * Excludes `other` (not a customer base garment card).
 */
export const CUSTOMER_SELECTABLE_GARMENT_TYPES: readonly CanonicalPhysicalGarmentType[] =
  CANONICAL_PHYSICAL_GARMENT_TYPES.filter(
    (garmentType) => garmentType !== "agbada",
  );

const customerSelectableGarmentTypeRank = (
  garmentType: FabricGarmentType,
): number => {
  const index = CUSTOMER_SELECTABLE_GARMENT_TYPES.indexOf(
    garmentType as CanonicalPhysicalGarmentType,
  );
  return index === -1 ? CUSTOMER_SELECTABLE_GARMENT_TYPES.length : index;
};

/**
 * Stable order for customer garment rows such as Step 5 assign lists.
 * Rank comes from CUSTOMER_SELECTABLE_GARMENT_TYPES. Repeated instances of
 * one type keep the order they already had. Types outside that list stay
 * at the end.
 */
export const orderByCustomerSelectableGarmentType = <T>(
  items: readonly T[],
  garmentTypeOf: (item: T) => FabricGarmentType,
): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byType =
        customerSelectableGarmentTypeRank(garmentTypeOf(left.item)) -
        customerSelectableGarmentTypeRank(garmentTypeOf(right.item));
      return byType || left.index - right.index;
    })
    .map(({ item }) => item);

/** Approved Step 1 display order; canonical selection ordering remains unchanged. */
export const STEP_1_SELECTABLE_GARMENT_TYPES: readonly CanonicalPhysicalGarmentType[] = [
  "shirt",
  "kaftan",
  "dress",
  "full_length_gown",
  "standard_shorts",
  "bum_shorts",
  "trouser",
  "skirt",
  "long_skirt",
];

const step1GarmentDisplayRank = (garmentType: FabricGarmentType): number => {
  const index = STEP_1_SELECTABLE_GARMENT_TYPES.indexOf(
    garmentType as CanonicalPhysicalGarmentType,
  );
  return index === -1 ? STEP_1_SELECTABLE_GARMENT_TYPES.length : index;
};

/**
 * Stable order matching the Step 1 Garment Type cards.
 * Rank comes from STEP_1_SELECTABLE_GARMENT_TYPES, the same list those cards
 * render. The Add Additional Garment buttons use this so their order stays
 * tied to that screen. Repeated instances of one type keep the order they
 * already had. Types outside that list stay at the end.
 */
export const orderByStep1GarmentDisplayOrder = <T>(
  items: readonly T[],
  garmentTypeOf: (item: T) => FabricGarmentType,
): T[] =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const byType =
        step1GarmentDisplayRank(garmentTypeOf(left.item)) -
        step1GarmentDisplayRank(garmentTypeOf(right.item));
      return byType || left.index - right.index;
    })
    .map(({ item }) => item);

/**
 * The Step 1 catalogue owns the customer-facing name of a physical garment.
 * Stable garment IDs intentionally remain separate from this presentation data.
 */
export const STEP_1_GARMENT_DISPLAY_LABELS: Readonly<
  Record<CanonicalPhysicalGarmentType, string>
> = {
  shirt: "Standard Shirt",
  trouser: "Trouser",
  skirt: "Standard Skirt",
  long_skirt: "Long Skirt",
  standard_shorts: "Standard Knicker Shorts",
  bum_shorts: "Standard Bum Shorts",
  dress: "Standard Dress",
  kaftan: "Long Shirt",
  full_length_gown: "Long Dress",
  agbada: "Long Shirt (Agbada)",
};

/**
 * Approved plain description for Standard Knicker Shorts.
 * Other garments have no approved description and must not gain one here.
 */
export const KNICKER_PLAIN_DESCRIPTION =
  "Knicker: native-style shorts that end at or just below the knee.";

/** @deprecated Use KNICKER_PLAIN_DESCRIPTION. */
export const NIKKA_PLAIN_DESCRIPTION = KNICKER_PLAIN_DESCRIPTION;

const STEP_1_GARMENT_PLAIN_DESCRIPTIONS: Partial<
  Record<CanonicalPhysicalGarmentType, string>
> = {
  standard_shorts: KNICKER_PLAIN_DESCRIPTION,
};

export const getStep1GarmentPlainDescription = (
  garmentType: FabricGarmentType,
): string | null =>
  garmentType === "other"
    ? null
    : (STEP_1_GARMENT_PLAIN_DESCRIPTIONS[garmentType] ?? null);

export const getStep1GarmentDisplayLabel = (
  garmentType: FabricGarmentType,
): string =>
  garmentType === "other"
    ? "Other Garment"
    : STEP_1_GARMENT_DISPLAY_LABELS[garmentType];

const CUSTOMER_SELECTABLE_GARMENT_TYPE_SET = new Set<CanonicalPhysicalGarmentType>(
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
);

export const getCustomerSelectableGarmentTypes = (
  selectedGarmentTypes: readonly FabricGarmentType[],
): CanonicalPhysicalGarmentType[] =>
  CUSTOMER_SELECTABLE_GARMENT_TYPES.filter((garmentType) =>
    selectedGarmentTypes.includes(garmentType),
  );

export const getStep1SelectableGarmentTypes = getCustomerSelectableGarmentTypes;

export const isCustomerSelectableGarmentType = (
  garmentType: FabricGarmentType,
): garmentType is CanonicalPhysicalGarmentType =>
  CUSTOMER_SELECTABLE_GARMENT_TYPE_SET.has(
    garmentType as CanonicalPhysicalGarmentType,
  );

export const isStep1SelectableGarmentType = isCustomerSelectableGarmentType;

const CANONICAL_PHYSICAL_GARMENT_TYPE_SET = new Set<FabricGarmentType>(
  CANONICAL_PHYSICAL_GARMENT_TYPES,
);

export const isCanonicalPhysicalGarmentType = (
  garmentType: FabricGarmentType,
): garmentType is CanonicalPhysicalGarmentType =>
  CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(garmentType);

const isValidConstructionOption = (
  option: CustomDetailOption,
  selectionGroup: CustomDetailSelectionGroup,
): boolean =>
  option.active &&
  option.selectionGroup === selectionGroup &&
  isClothingPriceSelectionGroup(option.selectionGroup) &&
  !option.informational &&
  !option.requiresEvaluation &&
  Number.isFinite(option.priceCents) &&
  option.priceCents > 0;

/**
 * Resolves Step 1 base garment construction from the normalized Admin catalog.
 * Demographic applicability is deliberately ignored here; later Custom Details
 * continue to apply their existing demographic rules.
 */
export const resolveGarmentConstructionPricing = (
  garmentType: FabricGarmentType,
  normalizedCatalog: readonly CustomDetailOption[],
): GarmentConstructionPricingResolution => {
  if (!CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(garmentType)) {
    return {
      status: "unresolved",
      garmentType,
      code: "unsupported_garment",
    };
  }
  const canonicalGarmentType = garmentType as CanonicalPhysicalGarmentType;

  const configuredDetails = getDefaultGarmentDetailsForSpec(
    createStyleBaseGarmentSpec(canonicalGarmentType),
  );
  const constructionComponents = Object.entries(configuredDetails || {}).filter(
    ([selectionGroup]) =>
      isClothingPriceSelectionGroup(
        selectionGroup as CustomDetailSelectionGroup,
      ),
  ) as Array<[CustomDetailSelectionGroup, string | string[]]>;

  if (constructionComponents.length === 0) {
    return {
      status: "unresolved",
      garmentType,
      code: "missing_construction_configuration",
    };
  }

  const resolvedComponents: GarmentConstructionPriceComponent[] = [];
  for (const [selectionGroup, configuredSelection] of constructionComponents) {
    const configuredOptionId = Array.isArray(configuredSelection)
      ? configuredSelection[0]
      : configuredSelection;
    const candidates = sortCustomDetailOptions(
      normalizedCatalog.filter((option) =>
        isValidConstructionOption(option, selectionGroup),
      ),
    );
    // Each Step 1 garment carries its own ordered construction defaults. The
    // first configured value is authoritative; never substitute a generic
    // selection-group default from a different garment profile.
    const option = candidates.find((candidate) => candidate.id === configuredOptionId);

    if (!option) {
      return {
        status: "unresolved",
        garmentType,
        code: "missing_catalog_option",
        selectionGroup,
        expectedOptionId: configuredOptionId,
      };
    }

    resolvedComponents.push({
      componentKey: `${canonicalGarmentType}:${selectionGroup}:${option.id}`,
      optionId: option.id,
      selectionGroup,
      priceCents: option.priceCents,
      price: option.priceCents / 100,
    });
  }

  const totalPriceCents = resolvedComponents.reduce(
    (total, component) => total + component.priceCents,
    0,
  );

  return {
    status: "resolved",
    garmentType: canonicalGarmentType,
    components: resolvedComponents,
    totalPriceCents,
    totalPrice: totalPriceCents / 100,
  };
};

export type Step1GarmentCardPresetId =
  | "shirt_short_sleeve"
  | "shirt_long_sleeve"
  | "kaftan_short_sleeve"
  | "kaftan_long_sleeve"
  | "dress_sleeveless_or_short"
  | "dress_mid_or_long"
  | "full_length_gown_sleeveless_or_short"
  | "full_length_gown_mid_or_long"
  | "skirt"
  | "long_skirt"
  | "trouser"
  | "standard_shorts"
  | "bum_shorts";

export interface Step1GarmentCardPreset {
  readonly id: Step1GarmentCardPresetId;
  readonly garmentType: CustomerSelectableGarmentType;
  readonly label: string;
  readonly selectionGroup: CustomDetailSelectionGroup;
  readonly optionId: string;
  /**
   * Allowed Step 4 construction option IDs for base Step 1 occurrences.
   * - Single-element array (shirts, skirts): construction is locked in Step 1 and hidden in Step 4.
   * - Two-element array (dresses): Step 4 narrows to these same-price sleeve choices.
   * - Null (trouser, standard_shorts, bum_shorts): fastening remains editable in Step 4.
   */
  readonly step4AllowedOptionIds: readonly string[] | null;
  readonly referenceImageVariant: "primary" | "secondary";
}

/**
 * Canonical 13-card Step 1 preset registry.
 * Prices are never hardcoded here — every card resolves its price dynamically
 * from the normalized Admin CustomDetailOption catalogue.
 */
export const STEP_1_GARMENT_CARD_PRESETS: readonly Step1GarmentCardPreset[] = [
  {
    id: "shirt_short_sleeve",
    garmentType: "shirt",
    label: "Standard Shirt — Short Sleeve",
    selectionGroup: "shirt_construction",
    optionId: "shirt_std_short",
    step4AllowedOptionIds: ["shirt_std_short"],
    referenceImageVariant: "primary",
  },
  {
    id: "shirt_long_sleeve",
    garmentType: "shirt",
    label: "Standard Shirt — Long Sleeve",
    selectionGroup: "shirt_construction",
    optionId: SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID,
    step4AllowedOptionIds: [SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID],
    referenceImageVariant: "secondary",
  },
  {
    id: "kaftan_short_sleeve",
    garmentType: "kaftan",
    label: "Long Shirt — Short Sleeve",
    selectionGroup: "shirt_construction",
    optionId: "shirt_long_short",
    step4AllowedOptionIds: ["shirt_long_short"],
    referenceImageVariant: "primary",
  },
  {
    id: "kaftan_long_sleeve",
    garmentType: "kaftan",
    label: "Long Shirt — Long Sleeve",
    selectionGroup: "shirt_construction",
    optionId: SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
    step4AllowedOptionIds: [SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID],
    referenceImageVariant: "secondary",
  },
  {
    id: "dress_sleeveless_or_short",
    garmentType: "dress",
    label: "Standard Dress — Sleeveless / Short Sleeve",
    selectionGroup: "dress_construction",
    optionId: "dress_std_sleeveless",
    step4AllowedOptionIds: ["dress_std_sleeveless", "dress_std_short"],
    referenceImageVariant: "primary",
  },
  {
    id: "dress_mid_or_long",
    garmentType: "dress",
    label: "Standard Dress — Mid / Long Sleeve",
    selectionGroup: "dress_construction",
    optionId: DRESS_STANDARD_LONG_SLEEVE_OPTION_ID,
    step4AllowedOptionIds: [
      DRESS_STANDARD_MID_SLEEVE_OPTION_ID,
      DRESS_STANDARD_LONG_SLEEVE_OPTION_ID,
    ],
    referenceImageVariant: "secondary",
  },
  {
    id: "full_length_gown_sleeveless_or_short",
    garmentType: "full_length_gown",
    label: "Long Dress — Sleeveless / Short Sleeve",
    selectionGroup: "dress_construction",
    optionId: "dress_long_sleeveless",
    step4AllowedOptionIds: ["dress_long_sleeveless", "dress_long_short"],
    referenceImageVariant: "primary",
  },
  {
    id: "full_length_gown_mid_or_long",
    garmentType: "full_length_gown",
    label: "Long Dress — Mid / Long Sleeve",
    selectionGroup: "dress_construction",
    optionId: DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
    step4AllowedOptionIds: [
      DRESS_LONG_LENGTH_MID_SLEEVE_OPTION_ID,
      DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
    ],
    referenceImageVariant: "secondary",
  },
  {
    id: "skirt",
    garmentType: "skirt",
    label: "Standard Skirt",
    selectionGroup: "skirt_length",
    optionId: "skirt_std",
    step4AllowedOptionIds: ["skirt_std"],
    referenceImageVariant: "primary",
  },
  {
    id: "long_skirt",
    garmentType: "long_skirt",
    label: "Long Skirt",
    selectionGroup: "skirt_length",
    optionId: "skirt_long",
    step4AllowedOptionIds: ["skirt_long"],
    referenceImageVariant: "primary",
  },
  {
    id: "trouser",
    garmentType: "trouser",
    label: "Trouser",
    selectionGroup: "trouser_fastening",
    optionId: "trouser_rope",
    step4AllowedOptionIds: null,
    referenceImageVariant: "primary",
  },
  {
    id: "standard_shorts",
    garmentType: "standard_shorts",
    label: "Standard Knicker Shorts",
    selectionGroup: "standard_shorts_fastening",
    optionId: "shorts_std_rope",
    step4AllowedOptionIds: null,
    referenceImageVariant: "primary",
  },
  {
    id: "bum_shorts",
    garmentType: "bum_shorts",
    label: "Standard Bum Shorts",
    selectionGroup: "bum_shorts_fastening",
    optionId: "bum_rope",
    step4AllowedOptionIds: null,
    referenceImageVariant: "primary",
  },
];

const STEP_1_GARMENT_CARD_PRESET_BY_ID = new Map<
  Step1GarmentCardPresetId,
  Step1GarmentCardPreset
>(STEP_1_GARMENT_CARD_PRESETS.map((preset) => [preset.id, preset]));

export const getStep1GarmentCardPresetById = (
  presetId: string,
): Step1GarmentCardPreset | null =>
  STEP_1_GARMENT_CARD_PRESET_BY_ID.get(presetId as Step1GarmentCardPresetId) ??
  null;

/**
 * Resolves exact garment construction pricing for an explicit optionId from the
 * normalized Admin catalogue without hardcoding prices or double-adding components.
 */
export const resolveGarmentConstructionPricingForOptionId = (
  garmentType: FabricGarmentType,
  optionId: string,
  normalizedCatalog: readonly CustomDetailOption[],
): GarmentConstructionPricingResolution => {
  if (!CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(garmentType)) {
    return {
      status: "unresolved",
      garmentType,
      code: "unsupported_garment",
    };
  }
  const canonicalGarmentType = garmentType as CanonicalPhysicalGarmentType;
  const configuredDetails = getDefaultGarmentDetailsForSpec(
    createStyleBaseGarmentSpec(canonicalGarmentType),
  );
  const constructionComponents = Object.entries(configuredDetails || {}).filter(
    ([selectionGroup]) =>
      isClothingPriceSelectionGroup(
        selectionGroup as CustomDetailSelectionGroup,
      ),
  ) as Array<[CustomDetailSelectionGroup, string | string[]]>;

  if (constructionComponents.length === 0) {
    return {
      status: "unresolved",
      garmentType,
      code: "missing_construction_configuration",
    };
  }

  const normalizedOptionId = resolveLegacySleeveConstructionOptionId(
    optionId,
    canonicalGarmentType,
  );
  const explicitCatalogOption = normalizedCatalog.find(
    (candidate) => candidate.id === normalizedOptionId,
  );
  const targetSelectionGroup =
    constructionComponents.length === 1
      ? constructionComponents[0][0]
      : explicitCatalogOption &&
          constructionComponents.some(
            ([selectionGroup]) =>
              selectionGroup === explicitCatalogOption.selectionGroup,
          )
        ? explicitCatalogOption.selectionGroup
        : constructionComponents[0][0];

  const resolvedComponents: GarmentConstructionPriceComponent[] = [];
  for (const [selectionGroup, configuredSelection] of constructionComponents) {
    const expectedOptionId =
      selectionGroup === targetSelectionGroup
        ? normalizedOptionId
        : Array.isArray(configuredSelection)
          ? configuredSelection[0]
          : configuredSelection;
    const candidates = sortCustomDetailOptions(
      normalizedCatalog.filter((option) =>
        isValidConstructionOption(option, selectionGroup),
      ),
    );
    const option = candidates.find(
      (candidate) => candidate.id === expectedOptionId,
    );
    if (!option) {
      return {
        status: "unresolved",
        garmentType,
        code: "missing_catalog_option",
        selectionGroup,
        expectedOptionId,
      };
    }
    resolvedComponents.push({
      componentKey: `${canonicalGarmentType}:${selectionGroup}:${option.id}`,
      optionId: option.id,
      selectionGroup,
      priceCents: option.priceCents,
      price: option.priceCents / 100,
    });
  }

  const totalPriceCents = resolvedComponents.reduce(
    (total, component) => total + component.priceCents,
    0,
  );

  return {
    status: "resolved",
    garmentType: canonicalGarmentType,
    components: resolvedComponents,
    totalPriceCents,
    totalPrice: totalPriceCents / 100,
  };
};

const extractOptionIdForSelectionGroup = (
  resolutionOrOptionId:
    | GarmentConstructionPricingResolution
    | string
    | null
    | undefined,
  selectionGroup: CustomDetailSelectionGroup,
): string | null => {
  if (typeof resolutionOrOptionId === "string") {
    return resolutionOrOptionId.trim() || null;
  }
  if (!resolutionOrOptionId) return null;
  if (resolutionOrOptionId.status === "resolved") {
    return (
      resolutionOrOptionId.components.find(
        (component) => component.selectionGroup === selectionGroup,
      )?.optionId ?? null
    );
  }
  return resolutionOrOptionId.expectedOptionId ?? null;
};

/**
 * Maps any persisted/active construction resolution or optionId (including legacy
 * combined dress sleeve IDs) back to its exact active Step 1 card preset.
 */
export const findStep1CardPresetForResolution = (
  garmentType: FabricGarmentType,
  resolutionOrOptionId?:
    | GarmentConstructionPricingResolution
    | string
    | null,
): Step1GarmentCardPreset | null => {
  const presetsForType = STEP_1_GARMENT_CARD_PRESETS.filter(
    (preset) => preset.garmentType === garmentType,
  );
  if (presetsForType.length === 0) return null;
  if (presetsForType.length === 1) return presetsForType[0];

  const primaryGroup = presetsForType[0].selectionGroup;
  const rawOptionId = extractOptionIdForSelectionGroup(
    resolutionOrOptionId,
    primaryGroup,
  );
  if (!rawOptionId) return presetsForType[0];

  const normalizedOptionId = resolveLegacySleeveConstructionOptionId(
    rawOptionId,
    `${garmentType} ${primaryGroup}`,
  );

  const exactMatch = presetsForType.find(
    (preset) =>
      preset.optionId === normalizedOptionId ||
      preset.step4AllowedOptionIds?.includes(normalizedOptionId) === true,
  );
  if (exactMatch) return exactMatch;

  // Legacy length-switched drafts (e.g. Standard Shirt card switched to Long Shirt
  // Long Sleeve in Step 4) still hydrate to the matching sleeve tier on their card.
  if (
    primaryGroup === "shirt_construction" &&
    normalizedOptionId.endsWith("_midlong")
  ) {
    return presetsForType[1];
  }
  if (
    primaryGroup === "dress_construction" &&
    (normalizedOptionId.endsWith("_mid") ||
      normalizedOptionId.endsWith("_long") ||
      normalizedOptionId.endsWith("_midlong"))
  ) {
    return presetsForType[1];
  }
  return presetsForType[0];
};

/**
 * Returns the allowed Step 4 construction option IDs for a base Step 1 garment.
 * - Single ID (shirts, skirts): construction is locked in Step 1 and hidden in Step 4.
 * - Two IDs (dresses): Step 4 narrows to the two same-price sleeve choices for the tier.
 * - Null (trouser, shorts, agbada): Step 4 keeps the fastening/construction group editable.
 */
export const getAllowedStep4ConstructionOptionIdsForBaseGarment = (
  garmentType: FabricGarmentType,
  step1Resolution?: GarmentConstructionPricingResolution | string | null,
): readonly string[] | null => {
  const presetsForType = STEP_1_GARMENT_CARD_PRESETS.filter(
    (preset) => preset.garmentType === garmentType,
  );
  if (presetsForType.length === 0) return null;

  // Preserve legacy saved drafts where a base dress already holds the other length's
  // sleeve option by matching across all presets in the same selectionGroup first.
  const selectionGroup = presetsForType[0].selectionGroup;
  const rawOptionId = extractOptionIdForSelectionGroup(
    step1Resolution,
    selectionGroup,
  );
  if (rawOptionId) {
    const normalizedOptionId = resolveLegacySleeveConstructionOptionId(
      rawOptionId,
      `${garmentType} ${selectionGroup}`,
    );
    const matchedPreset = STEP_1_GARMENT_CARD_PRESETS.find(
      (preset) =>
        preset.selectionGroup === selectionGroup &&
        (preset.optionId === normalizedOptionId ||
          preset.step4AllowedOptionIds?.includes(normalizedOptionId) === true),
    );
    if (matchedPreset) return matchedPreset.step4AllowedOptionIds;
  }

  const preset = findStep1CardPresetForResolution(garmentType, step1Resolution);
  return preset?.step4AllowedOptionIds ?? null;
};

export const isBaseGarmentConstructionLockedInStep4 = (
  garmentType: FabricGarmentType,
  step1Resolution?: GarmentConstructionPricingResolution | string | null,
): boolean => {
  const allowed = getAllowedStep4ConstructionOptionIdsForBaseGarment(
    garmentType,
    step1Resolution,
  );
  return allowed !== null && allowed.length === 1;
};
