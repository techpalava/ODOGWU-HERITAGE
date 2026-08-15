import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentAssignment,
  GarmentConstructionPricingResolution,
} from "../types";
import {
  isCanonicalPhysicalGarmentType,
  resolveGarmentConstructionPricing,
} from "./garmentConstructionPricing";
import {
  reconcileGarmentConstructionResolution,
  selectGarmentConstructionOption,
} from "./garmentTypeStepState";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const createEmptyAdditionalGarmentConstructionState =
  (): AdditionalGarmentConstructionStateV1 => ({
    schemaVersion: 1,
    byGarmentKey: {},
  });

export interface AdditionalGarmentConstructionReconciliation {
  state: AdditionalGarmentConstructionStateV1;
  unresolvedGarmentKeys: string[];
  removedGarmentKeys: string[];
  stateChanged: boolean;
}

export const reconcileAdditionalGarmentConstructionState = ({
  existingState,
  assignments,
  normalizedCustomDetailCatalog,
}: {
  existingState: unknown;
  assignments: readonly FabricGarmentAssignment[];
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): AdditionalGarmentConstructionReconciliation => {
  const existing =
    isRecord(existingState) &&
    existingState.schemaVersion === 1 &&
    isRecord(existingState.byGarmentKey)
      ? existingState.byGarmentKey
      : {};
  const state = createEmptyAdditionalGarmentConstructionState();
  const unresolvedGarmentKeys: string[] = [];
  const activeKeys = new Set<string>();

  assignments.forEach((assignment) => {
    if (
      assignment.sourceRole !== "additional" ||
      assignment.dependencyStatus === "orphaned" ||
      !isCanonicalPhysicalGarmentType(assignment.garmentType)
    ) {
      return;
    }
    activeKeys.add(assignment.garmentKey);
    const canonicalDefault = resolveGarmentConstructionPricing(
      assignment.garmentType,
      normalizedCustomDetailCatalog,
    );
    const previous = existing[
      assignment.garmentKey
    ] as GarmentConstructionPricingResolution | undefined;
    const resolution =
      reconcileGarmentConstructionResolution(
        previous,
        canonicalDefault,
        normalizedCustomDetailCatalog,
      ) || canonicalDefault;
    state.byGarmentKey[assignment.garmentKey] = resolution;
    if (resolution.status !== "resolved") {
      unresolvedGarmentKeys.push(assignment.garmentKey);
    }
  });

  const removedGarmentKeys = Object.keys(existing).filter(
    (garmentKey) => !activeKeys.has(garmentKey),
  );
  return {
    state,
    unresolvedGarmentKeys,
    removedGarmentKeys,
    stateChanged:
      JSON.stringify(existingState) !== JSON.stringify(state),
  };
};

export const selectAdditionalGarmentConstructionOption = ({
  state,
  garmentKey,
  selectionGroup,
  optionId,
  normalizedCustomDetailCatalog,
}: {
  state: AdditionalGarmentConstructionStateV1;
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): AdditionalGarmentConstructionStateV1 => {
  const current = state.byGarmentKey[garmentKey];
  if (!current) return state;
  const selection = selectGarmentConstructionOption({
    resolution: current,
    selectionGroup,
    optionId,
    normalizedCustomDetailCatalog,
  });
  if (selection.status !== "selected") return state;
  return {
    schemaVersion: 1,
    byGarmentKey: {
      ...state.byGarmentKey,
      [garmentKey]: selection.resolution,
    },
  };
};

export const removeAdditionalGarmentConstruction = (
  state: AdditionalGarmentConstructionStateV1,
  garmentKey: string,
): AdditionalGarmentConstructionStateV1 => {
  const { [garmentKey]: _removed, ...byGarmentKey } = state.byGarmentKey;
  return { schemaVersion: 1, byGarmentKey };
};
