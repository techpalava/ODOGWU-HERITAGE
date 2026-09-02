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
import { normalizePhysicalGarmentOccurrenceIdentityState } from "./physicalGarmentOccurrenceIdentity";
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
const DEMOGRAPHIC_ORDER: readonly CustomDetailDemographic[] = [
  "male",
  "female",
  "unisex",
];
export const GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION = 1 as const;
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

const normalizeVersionedDemographics = (value: unknown) => {
  if (!isRecord(value) || value.schemaVersion !== GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION) {
    return null;
  }
  if (
    !Array.isArray(value.demographics) ||
    value.demographics.some(
      (entry) =>
        typeof entry !== "string" ||
        !DEMOGRAPHIC_SET.has(entry as CustomDetailDemographic),
    )
  ) {
    return [];
  }
  const selected = new Set(
    value.demographics as CustomDetailDemographic[],
  );
  return DEMOGRAPHIC_ORDER.filter((demographic) => selected.has(demographic));
};

export const getGarmentTypeSelectedDemographics = (
  selection: Pick<GarmentTypeStepSelection, "audienceSelection" | "demographic">,
): CustomDetailDemographic[] => {
  const versioned = normalizeVersionedDemographics(selection.audienceSelection);
  if (selection.audienceSelection !== undefined) return versioned || [];
  const legacy = normalizeDemographic(selection.demographic);
  return legacy ? [legacy] : [];
};

export const getGarmentTypeCompatibilityDemographic = (
  demographics: readonly CustomDetailDemographic[],
): CustomDetailDemographic | null => {
  const normalized = normalizeVersionedDemographics({
    schemaVersion: GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
    demographics,
  });
  if (!normalized || normalized.length === 0) return null;
  return normalized.length === 1 ? normalized[0] : "unisex";
};

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

  const versionedDemographics = normalizeVersionedDemographics(
    candidate.audienceSelection,
  );
  const legacyDemographic = normalizeDemographic(candidate.demographic);
  const demographics =
    candidate.audienceSelection !== undefined
      ? versionedDemographics || []
      : legacyDemographic
        ? [legacyDemographic]
        : [];
  const physicalOccurrenceIdentityState =
    normalizePhysicalGarmentOccurrenceIdentityState(
      candidate.physicalOccurrenceIdentityState,
    );

  return {
    garmentTypes,
    audienceSelection: {
      schemaVersion: GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
      demographics,
    },
    ...(physicalOccurrenceIdentityState
      ? { physicalOccurrenceIdentityState }
      : {}),
    demographic: getGarmentTypeCompatibilityDemographic(demographics),
    constructionByGarment,
  };
};

export const reconcileGarmentConstructionResolution = (
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
  selectedDemographics?: unknown;
  selectedDemographic?: unknown;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  persistedSelection?: unknown;
}

export const reconcileGarmentTypeStepSelection = ({
  selectedGarmentTypes,
  selectedDemographics,
  selectedDemographic,
  normalizedCustomDetailCatalog,
  persistedSelection,
}: ReconcileGarmentTypeStepSelectionInput): GarmentTypeStepReconciliationResult => {
  const previous = normalizePersistedGarmentTypeStepSelection(persistedSelection);
  const garmentTypes =
    selectedGarmentTypes === undefined
      ? previous.garmentTypes
      : normalizeGarmentTypes(selectedGarmentTypes);
  const demographics =
    selectedDemographics !== undefined
      ? normalizeVersionedDemographics({
          schemaVersion: GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
          demographics: selectedDemographics,
        }) || []
      : selectedDemographic !== undefined
        ? (() => {
            const normalized = normalizeDemographic(selectedDemographic);
            return normalized ? [normalized] : [];
          })()
        : getGarmentTypeSelectedDemographics(previous);
  const demographic = getGarmentTypeCompatibilityDemographic(demographics);
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
      reconcileGarmentConstructionResolution(
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
    selection: {
      garmentTypes,
      audienceSelection: {
        schemaVersion: GARMENT_TYPE_AUDIENCE_SCHEMA_VERSION,
        demographics,
      },
      ...(previous.physicalOccurrenceIdentityState
        ? {
            physicalOccurrenceIdentityState:
              previous.physicalOccurrenceIdentityState,
          }
        : {}),
      demographic,
      constructionByGarment,
    },
    priceChanges,
    unresolvedGarmentTypes,
  };
};

export type GarmentConstructionOptionSelectionResult =
  | {
      status: "selected";
      resolution: GarmentConstructionPricingResolution;
    }
  | {
      status: "blocked";
      reason:
        | "CONSTRUCTION_UNRESOLVED"
        | "GROUP_NOT_OWNED"
        | "OPTION_NOT_AVAILABLE";
      resolution: GarmentConstructionPricingResolution;
    };

export const selectGarmentConstructionOption = ({
  resolution,
  selectionGroup,
  optionId,
  normalizedCustomDetailCatalog,
}: {
  resolution: GarmentConstructionPricingResolution;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): GarmentConstructionOptionSelectionResult => {
  if (resolution.status !== "resolved") {
    return {
      status: "blocked",
      reason: "CONSTRUCTION_UNRESOLVED",
      resolution,
    };
  }
  const componentIndex = resolution.components.findIndex(
    (component) => component.selectionGroup === selectionGroup,
  );
  if (componentIndex < 0) {
    return { status: "blocked", reason: "GROUP_NOT_OWNED", resolution };
  }
  const option = normalizedCustomDetailCatalog.find(
    (candidate) =>
      candidate.id === optionId &&
      candidate.selectionGroup === selectionGroup &&
      candidate.active &&
      isClothingPriceSelectionGroup(candidate.selectionGroup) &&
      !candidate.informational &&
      !candidate.requiresEvaluation &&
      Number.isFinite(candidate.priceCents) &&
      candidate.priceCents > 0,
  );
  if (!option) {
    return { status: "blocked", reason: "OPTION_NOT_AVAILABLE", resolution };
  }
  const components = resolution.components.map((component, index) =>
    index === componentIndex
      ? {
          componentKey: `${resolution.garmentType}:${selectionGroup}:${option.id}`,
          optionId: option.id,
          selectionGroup,
          priceCents: option.priceCents,
          price: option.priceCents / 100,
        }
      : { ...component },
  );
  const totalPriceCents = components.reduce(
    (total, component) => total + component.priceCents,
    0,
  );
  return {
    status: "selected",
    resolution: {
      status: "resolved",
      garmentType: resolution.garmentType,
      components,
      totalPriceCents,
      totalPrice: totalPriceCents / 100,
    },
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
  selectedDemographics: CustomDetailDemographic[];
  selectedDemographic: CustomDetailDemographic | null;
  constructionDefaults: GarmentConstructionPricingResolution[];
}

export const getGarmentTypeStepControlledState = (
  selection: GarmentTypeStepSelection,
): GarmentTypeStepControlledState => ({
  selectedGarmentTypes: [...selection.garmentTypes],
  selectedDemographics: getGarmentTypeSelectedDemographics(selection),
  selectedDemographic: selection.demographic,
  constructionDefaults: selection.garmentTypes.flatMap((garmentType) => {
    const resolution = selection.constructionByGarment[garmentType];
    return resolution ? [resolution] : [];
  }),
});

export type GarmentTypeStepSelectionAction =
  | { type: "set_garment_types"; garmentTypes: unknown }
  | { type: "set_demographics"; demographics: unknown }
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
      : action.type === "set_demographics"
        ? { selectedDemographics: action.demographics }
        : { selectedDemographic: action.demographic }),
  });
