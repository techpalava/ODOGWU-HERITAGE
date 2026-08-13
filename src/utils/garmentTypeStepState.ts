import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentType,
  GarmentConstructionPriceComponent,
  GarmentConstructionPricingFailureCode,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  GuestDesignDraft,
} from "../types";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  resolveGarmentConstructionPricing,
} from "./garmentConstructionPricing";
import { isClothingPriceSelectionGroup } from "./catalogHelpers";

const CANONICAL_GARMENT_TYPE_SET = new Set<FabricGarmentType>(
  CANONICAL_PHYSICAL_GARMENT_TYPES,
);
const DEMOGRAPHIC_SET = new Set<CustomDetailDemographic>([
  "male",
  "female",
  "unisex",
]);
const FAILURE_CODE_SET = new Set<GarmentConstructionPricingFailureCode>([
  "unsupported_garment",
  "missing_construction_configuration",
  "missing_catalog_option",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeGarmentTypes = (
  value: unknown,
): CanonicalPhysicalGarmentType[] => {
  const supplied = new Set(
    Array.isArray(value)
      ? value.filter(
          (entry): entry is CanonicalPhysicalGarmentType =>
            typeof entry === "string" &&
            CANONICAL_GARMENT_TYPE_SET.has(entry as FabricGarmentType),
        )
      : [],
  );
  return CANONICAL_PHYSICAL_GARMENT_TYPES.filter((garmentType) =>
    supplied.has(garmentType),
  );
};

const normalizeDemographic = (
  value: unknown,
): CustomDetailDemographic | null =>
  typeof value === "string" &&
  DEMOGRAPHIC_SET.has(value as CustomDetailDemographic)
    ? (value as CustomDetailDemographic)
    : null;

const clonePersistedComponent = (
  value: unknown,
  garmentType: CanonicalPhysicalGarmentType,
): GarmentConstructionPriceComponent | null => {
  if (!isRecord(value)) return null;
  if (
    typeof value.componentKey !== "string" ||
    !value.componentKey.startsWith(`${garmentType}:`) ||
    typeof value.optionId !== "string" ||
    typeof value.selectionGroup !== "string" ||
    !Number.isFinite(value.priceCents) ||
    !Number.isFinite(value.price)
  ) {
    return null;
  }
  return {
    componentKey: value.componentKey,
    optionId: value.optionId,
    selectionGroup: value.selectionGroup as CustomDetailSelectionGroup,
    priceCents: Number(value.priceCents),
    price: Number(value.price),
  };
};

const clonePersistedResolution = (
  value: unknown,
  garmentType: CanonicalPhysicalGarmentType,
): GarmentConstructionPricingResolution | null => {
  if (!isRecord(value) || value.garmentType !== garmentType) return null;
  if (value.status === "resolved" && Array.isArray(value.components)) {
    const components = value.components.map((component) =>
      clonePersistedComponent(component, garmentType),
    );
    if (
      components.length === 0 ||
      components.some((component) => component === null) ||
      !Number.isFinite(value.totalPriceCents) ||
      !Number.isFinite(value.totalPrice)
    ) {
      return null;
    }
    return {
      status: "resolved",
      garmentType,
      components: components as GarmentConstructionPriceComponent[],
      totalPriceCents: Number(value.totalPriceCents),
      totalPrice: Number(value.totalPrice),
    };
  }
  if (
    value.status === "unresolved" &&
    typeof value.code === "string" &&
    FAILURE_CODE_SET.has(value.code as GarmentConstructionPricingFailureCode)
  ) {
    return {
      status: "unresolved",
      garmentType,
      code: value.code as GarmentConstructionPricingFailureCode,
      ...(typeof value.selectionGroup === "string"
        ? { selectionGroup: value.selectionGroup as CustomDetailSelectionGroup }
        : {}),
      ...(typeof value.expectedOptionId === "string"
        ? { expectedOptionId: value.expectedOptionId }
        : {}),
    };
  }
  return null;
};

export const normalizePersistedGarmentTypeStepSelection = (
  value: unknown,
): GarmentTypeStepSelection => {
  const candidate = isRecord(value) ? value : {};
  const garmentTypes = normalizeGarmentTypes(candidate.garmentTypes);
  const persistedConstruction = isRecord(candidate.constructionByGarment)
    ? candidate.constructionByGarment
    : {};
  const constructionByGarment: GarmentTypeStepSelection["constructionByGarment"] = {};

  garmentTypes.forEach((garmentType) => {
    const resolution = clonePersistedResolution(
      persistedConstruction[garmentType],
      garmentType,
    );
    if (resolution) constructionByGarment[garmentType] = resolution;
  });

  return {
    garmentTypes,
    demographic: normalizeDemographic(candidate.demographic),
    constructionByGarment,
  };
};

const resolvePersistedConstructionFromCurrentCatalog = (
  previous: GarmentConstructionPricingResolution | undefined,
  canonicalDefault: GarmentConstructionPricingResolution,
  normalizedCustomDetailCatalog: readonly CustomDetailOption[],
): GarmentConstructionPricingResolution | null => {
  if (
    previous?.status !== "resolved" ||
    canonicalDefault.status !== "resolved" ||
    previous.components.length !== canonicalDefault.components.length
  ) {
    return null;
  }

  const components = previous.components.flatMap((component, index) => {
    const expected = canonicalDefault.components[index];
    if (component.selectionGroup !== expected.selectionGroup) return [];
    const option = normalizedCustomDetailCatalog.find(
      (candidate) => candidate.id === component.optionId,
    );
    if (
      !option?.active ||
      option.selectionGroup !== component.selectionGroup ||
      !isClothingPriceSelectionGroup(option.selectionGroup) ||
      option.informational ||
      option.requiresEvaluation ||
      !Number.isFinite(option.priceCents) ||
      option.priceCents <= 0
    ) {
      return [];
    }
    return [
      {
        componentKey: component.componentKey,
        optionId: option.id,
        selectionGroup: option.selectionGroup,
        priceCents: option.priceCents,
        price: option.priceCents / 100,
      },
    ];
  });
  if (components.length !== previous.components.length) return null;

  const totalPriceCents = components.reduce(
    (total, component) => total + component.priceCents,
    0,
  );
  return {
    status: "resolved",
    garmentType: canonicalDefault.garmentType,
    components,
    totalPriceCents,
    totalPrice: totalPriceCents / 100,
  };
};

export interface GarmentTypeStepPriceChange {
  garmentType: CanonicalPhysicalGarmentType;
  previousTotalPriceCents: number;
  currentTotalPriceCents: number;
}

export interface GarmentTypeStepReconciliationResult {
  selection: GarmentTypeStepSelection;
  priceChanges: GarmentTypeStepPriceChange[];
  unresolvedGarmentTypes: CanonicalPhysicalGarmentType[];
}

export interface ReconcileGarmentTypeStepSelectionInput {
  selectedGarmentTypes?: unknown;
  selectedDemographic?: unknown;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  persistedSelection?: unknown;
}

export const reconcileGarmentTypeStepSelection = ({
  selectedGarmentTypes,
  selectedDemographic,
  normalizedCustomDetailCatalog,
  persistedSelection,
}: ReconcileGarmentTypeStepSelectionInput): GarmentTypeStepReconciliationResult => {
  const previous = normalizePersistedGarmentTypeStepSelection(persistedSelection);
  const garmentTypes =
    selectedGarmentTypes === undefined
      ? previous.garmentTypes
      : normalizeGarmentTypes(selectedGarmentTypes);
  const demographic =
    selectedDemographic === undefined
      ? previous.demographic
      : normalizeDemographic(selectedDemographic);
  const constructionByGarment: GarmentTypeStepSelection["constructionByGarment"] = {};
  const priceChanges: GarmentTypeStepPriceChange[] = [];
  const unresolvedGarmentTypes: CanonicalPhysicalGarmentType[] = [];

  garmentTypes.forEach((garmentType) => {
    const canonicalDefault = resolveGarmentConstructionPricing(
      garmentType,
      normalizedCustomDetailCatalog,
    );
    const saved = previous.constructionByGarment[garmentType];
    const current =
      resolvePersistedConstructionFromCurrentCatalog(
        saved,
        canonicalDefault,
        normalizedCustomDetailCatalog,
      ) || canonicalDefault;

    // Saved option identities survive only while the current catalog still
    // accepts them. Current catalog prices always replace persisted prices.
    constructionByGarment[garmentType] = current;

    if (current.status === "unresolved") {
      unresolvedGarmentTypes.push(garmentType);
    }
    if (
      saved?.status === "resolved" &&
      current.status === "resolved" &&
      saved.totalPriceCents !== current.totalPriceCents
    ) {
      priceChanges.push({
        garmentType,
        previousTotalPriceCents: saved.totalPriceCents,
        currentTotalPriceCents: current.totalPriceCents,
      });
    }
  });

  return {
    selection: { garmentTypes, demographic, constructionByGarment },
    priceChanges,
    unresolvedGarmentTypes,
  };
};

export const reconcileGuestDesignDraftGarmentTypeSelection = <
  T extends GuestDesignDraft,
>(
  draft: T,
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[],
): T => {
  if (draft.garmentTypeSelection === undefined) return draft;
  const normalized = normalizePersistedGarmentTypeStepSelection(
    draft.garmentTypeSelection,
  );
  return {
    ...draft,
    garmentTypeSelection: normalizedCustomDetailCatalog
      ? reconcileGarmentTypeStepSelection({
          persistedSelection: normalized,
          normalizedCustomDetailCatalog,
        }).selection
      : normalized,
  } as T;
};

export interface GarmentTypeStepControlledState {
  selectedGarmentTypes: CanonicalPhysicalGarmentType[];
  selectedDemographic: CustomDetailDemographic | null;
  constructionDefaults: GarmentConstructionPricingResolution[];
}

export const getGarmentTypeStepControlledState = (
  selection: GarmentTypeStepSelection,
): GarmentTypeStepControlledState => ({
  selectedGarmentTypes: [...selection.garmentTypes],
  selectedDemographic: selection.demographic,
  constructionDefaults: selection.garmentTypes.flatMap((garmentType) => {
    const resolution = selection.constructionByGarment[garmentType];
    return resolution ? [resolution] : [];
  }),
});

export type GarmentTypeStepSelectionAction =
  | { type: "set_garment_types"; garmentTypes: unknown }
  | { type: "set_demographic"; demographic: unknown };

export const reduceGarmentTypeStepSelection = (
  selection: GarmentTypeStepSelection,
  action: GarmentTypeStepSelectionAction,
  normalizedCustomDetailCatalog: readonly CustomDetailOption[],
): GarmentTypeStepReconciliationResult =>
  reconcileGarmentTypeStepSelection({
    persistedSelection: selection,
    normalizedCustomDetailCatalog,
    ...(action.type === "set_garment_types"
      ? { selectedGarmentTypes: action.garmentTypes }
      : { selectedDemographic: action.demographic }),
  });
