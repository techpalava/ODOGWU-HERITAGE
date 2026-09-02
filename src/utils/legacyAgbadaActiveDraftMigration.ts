import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import type {
  AiTryOnWorkflowStateV1,
  FutureMeasurementEnteredBagV1,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GuestDesignDraft,
  MeasurementRiskRoute,
} from "../types";
import { normalizeAiTryOnWorkflowState } from "./aiTryOnWorkflow";
import {
  isValidUploadedDesignDraftSource,
  parseAdditionalGarmentTypeFromKey,
} from "./designSourceState";
import { inspectDraftFabricAllocations } from "./fabricAllocationPersistence";
import { removeGarmentScopedCustomDetailInputs } from "./garmentScopedCustomDetailInputsState";
import { removeGarmentScopedCustomDetails } from "./garmentScopedCustomDetailsState";

export const LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION = 1 as const;

export interface LegacyAgbadaActiveDraftMigrationResult {
  migrationVersion: typeof LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION;
  changed: boolean;
  removedGarmentKeys: string[];
  draft: GuestDesignDraft;
}

const MEASUREMENT_ROUTES: readonly MeasurementRiskRoute[] = [
  "low_risk",
  "medium_risk",
  "high_risk",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isAgbadaAdditionalKey = (garmentKey: string): boolean =>
  parseAdditionalGarmentTypeFromKey(garmentKey) === "agbada";

const cloneMeasurementValue = (
  value: FutureMeasurementValueV1,
): FutureMeasurementValueV1 => ({
  ...value,
  ...(value.calculation
    ? { calculation: { ...value.calculation } }
    : {}),
});

const removeGarmentsFromEnteredBag = (
  bag: FutureMeasurementEnteredBagV1,
  removedKeys: ReadonlySet<string>,
): FutureMeasurementEnteredBagV1 => ({
  shared: Object.fromEntries(
    Object.entries(bag.shared)
      .filter(([, value]) => {
        const garmentKey = value.calculation?.garmentKey;
        return !garmentKey || !removedKeys.has(garmentKey);
      })
      .map(([measurementId, value]) => [
        measurementId,
        cloneMeasurementValue(value),
      ]),
  ),
  byGarmentKey: Object.fromEntries(
    Object.entries(bag.byGarmentKey)
      .filter(([garmentKey]) => !removedKeys.has(garmentKey))
      .map(([garmentKey, values]) => [
        garmentKey,
        Object.fromEntries(
          Object.entries(values)
            .filter(([, value]) => {
              const calculationGarmentKey = value.calculation?.garmentKey;
              return (
                !calculationGarmentKey ||
                !removedKeys.has(calculationGarmentKey)
              );
            })
            .map(([measurementId, value]) => [
              measurementId,
              cloneMeasurementValue(value),
            ]),
        ),
      ]),
  ),
});

const invalidMeasurementKeyBelongsToRemovedGarment = (
  invalidKey: string,
  removedKeys: ReadonlySet<string>,
): boolean =>
  [...removedKeys].some(
    (garmentKey) =>
      invalidKey === garmentKey ||
      invalidKey.startsWith(`${garmentKey}:`) ||
      MEASUREMENT_ROUTES.some((route) =>
        invalidKey.startsWith(`${route}:${garmentKey}:`),
      ),
  );

const removeGarmentsFromMeasurementState = (
  state: FutureMeasurementStateV1,
  removedKeys: ReadonlySet<string>,
): FutureMeasurementStateV1 => {
  const enteredByRoute = state.enteredByRoute
    ? Object.fromEntries(
        MEASUREMENT_ROUTES.map((route) => [
          route,
          removeGarmentsFromEnteredBag(
            state.enteredByRoute![route],
            removedKeys,
          ),
        ]),
      ) as FutureMeasurementStateV1["enteredByRoute"]
    : undefined;
  const invalidInputKeysByRoute = state.invalidInputKeysByRoute
    ? Object.fromEntries(
        MEASUREMENT_ROUTES.map((route) => [
          route,
          state.invalidInputKeysByRoute![route].filter(
            (invalidKey) =>
              !invalidMeasurementKeyBelongsToRemovedGarment(
                invalidKey,
                removedKeys,
              ),
          ),
        ]),
      ) as FutureMeasurementStateV1["invalidInputKeysByRoute"]
    : undefined;

  return {
    ...state,
    entered: removeGarmentsFromEnteredBag(state.entered, removedKeys),
    ...(enteredByRoute ? { enteredByRoute } : {}),
    ...(state.unassignedEntered
      ? {
          unassignedEntered: removeGarmentsFromEnteredBag(
            state.unassignedEntered,
            removedKeys,
          ),
        }
      : {}),
    derived: removeGarmentsFromEnteredBag(state.derived, removedKeys),
    inputFingerprint: "",
    calculationStatus: "incomplete",
    diagnostics: state.diagnostics.filter(
      (diagnostic) =>
        !diagnostic.garmentKey || !removedKeys.has(diagnostic.garmentKey),
    ),
    invalidInputKeys: state.invalidInputKeys.filter(
      (invalidKey) =>
        !invalidMeasurementKeyBelongsToRemovedGarment(
          invalidKey,
          removedKeys,
        ),
    ),
    ...(invalidInputKeysByRoute ? { invalidInputKeysByRoute } : {}),
  };
};

const invalidateAiTryOnForCompositionChange = (
  state: GuestDesignDraft["aiTryOnWorkflow"],
): AiTryOnWorkflowStateV1 | undefined => {
  const normalized = normalizeAiTryOnWorkflowState(state);
  if (!normalized || normalized.status === "skipped") return normalized || undefined;
  if (
    normalized.status === "completed" ||
    normalized.status === "processing" ||
    normalized.status === "stale" ||
    normalized.inputFingerprint
  ) {
    return {
      schemaVersion: 1,
      status: "stale",
      inputFingerprint: normalized.inputFingerprint,
    };
  }
  return normalized;
};

const invalidatePricingSnapshot = (
  pricing: GuestDesignDraft["pricingBreakdown"],
): GuestDesignDraft["pricingBreakdown"] => {
  const next = { ...pricing };
  delete next.garmentConstructionSubtotal;
  delete next.clothingPrice;
  delete next.fabricPrice;
  delete next.fabricSewingCost;
  delete next.constructionSewingCost;
  delete next.constructionUpgradesPrice;
  delete next.preTaxDesignSubtotal;
  delete next.taxPercentage;
  delete next.taxAmount;
  delete next.taxInclusiveDesignSubtotal;
  delete next.lagosToEindhovenShipping;
  delete next.total;
  next.selectedDesignPrice = null;
  next.eindhovenToDestinationShipping = null;
  return next;
};

const selectedLegacyGarmentIsAgbada = (
  selectedGarment: GuestDesignDraft["selectedGarment"],
): boolean => {
  if (!selectedGarment) return false;
  return [selectedGarment.type, selectedGarment.code]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.trim().toLowerCase() === "agbada");
};

/**
 * Removes the retired Agbada choice only from active, editable draft authority.
 * Carts, orders, and canonical historical decoding never call this migration.
 */
export const migrateLegacyAgbadaActiveDraft = (
  draft: GuestDesignDraft,
): LegacyAgbadaActiveDraftMigrationResult => {
  const baseAgbadaKey = createStyleBaseGarmentSpec("agbada").key;
  const step1HasAgbada = Boolean(
    draft.garmentTypeSelection?.garmentTypes.includes("agbada"),
  );
  const uploadedSource = isValidUploadedDesignDraftSource(draft.designSource)
    ? draft.designSource
    : null;
  const uploadedAgbadaKeys = uploadedSource
    ? uploadedSource.fabricCapacityComposition
        .filter((spec) => spec.garmentType === "agbada")
        .map((spec) => spec.key)
    : [];
  const additionalState =
    draft.designSelections.additionalGarmentConstructions;
  const additionalAgbadaKeys =
    additionalState?.schemaVersion === 1 &&
    isRecord(additionalState.byGarmentKey)
      ? Object.entries(additionalState.byGarmentKey)
          .filter(
            ([garmentKey, resolution]) =>
              isAgbadaAdditionalKey(garmentKey) ||
              (isRecord(resolution) && resolution.garmentType === "agbada"),
          )
          .map(([garmentKey]) => garmentKey)
      : [];

  if (
    !step1HasAgbada &&
    uploadedAgbadaKeys.length === 0 &&
    additionalAgbadaKeys.length === 0
  ) {
    return {
      migrationVersion: LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION,
      changed: false,
      removedGarmentKeys: [],
      draft,
    };
  }

  const removedKeys = new Set<string>([
    baseAgbadaKey,
    ...uploadedAgbadaKeys,
    ...additionalAgbadaKeys,
  ]);
  const allocationInspection = inspectDraftFabricAllocations(draft);
  if (allocationInspection.status === "valid") {
    allocationInspection.fabricAllocations.forEach((allocation) => {
      allocation.garmentAssignments.forEach((assignment) => {
        if (
          assignment.garmentType === "agbada" ||
          assignment.garmentSpec?.garmentType === "agbada" ||
          isAgbadaAdditionalKey(assignment.garmentKey)
        ) {
          removedKeys.add(assignment.garmentKey);
        }
      });
    });
  }

  const nextGarmentTypeSelection = draft.garmentTypeSelection
    ? {
        ...draft.garmentTypeSelection,
        garmentTypes: draft.garmentTypeSelection.garmentTypes.filter(
          (garmentType) => garmentType !== "agbada",
        ),
        constructionByGarment: Object.fromEntries(
          Object.entries(
            draft.garmentTypeSelection.constructionByGarment,
          ).filter(([garmentType]) => garmentType !== "agbada"),
        ),
      }
    : undefined;
  const nextDesignSource = uploadedSource
    ? {
        ...uploadedSource,
        uploadReference: { ...uploadedSource.uploadReference },
        fabricCapacityComposition: uploadedSource.fabricCapacityComposition
          .filter((spec) => spec.garmentType !== "agbada")
          .map((spec) => ({ ...spec })),
      }
    : draft.designSource;
  const nextAdditionalState = additionalState
    ? {
        schemaVersion: 1 as const,
        byGarmentKey: Object.fromEntries(
          Object.entries(additionalState.byGarmentKey).filter(
            ([garmentKey]) => !removedKeys.has(garmentKey),
          ),
        ),
      }
    : undefined;

  let nextScopedDetails =
    draft.designSelections.garmentScopedCustomDetails;
  let nextScopedInputs =
    draft.designSelections.garmentScopedCustomDetailInputs;
  [...removedKeys].forEach((garmentKey) => {
    if (nextScopedDetails) {
      nextScopedDetails = removeGarmentScopedCustomDetails(
        nextScopedDetails,
        garmentKey,
      );
    }
    if (nextScopedInputs) {
      nextScopedInputs = removeGarmentScopedCustomDetailInputs(
        nextScopedInputs,
        garmentKey,
      );
    }
  });

  const nextDesignSelections = {
    ...draft.designSelections,
    ...(nextAdditionalState
      ? { additionalGarmentConstructions: nextAdditionalState }
      : {}),
    ...(nextScopedDetails
      ? { garmentScopedCustomDetails: nextScopedDetails }
      : {}),
    ...(nextScopedInputs
      ? { garmentScopedCustomDetailInputs: nextScopedInputs }
      : {}),
  };

  let nextFabricAllocations = draft.fabricAllocations;
  let nextPrimaryFabricCode: string | null = null;
  if (allocationInspection.status === "valid") {
    const prunedFabricState =
      FabricAllocationStateEngine.prunePhysicalGarmentAssignments(
        {
          fabricAllocations: allocationInspection.fabricAllocations,
          activeAllocationId:
            allocationInspection.fabricAllocations[0]?.allocationId || null,
          pendingFabricGarment: null,
          awaitingFabricForPendingGarment: false,
        },
        [...removedKeys],
      );
    nextFabricAllocations = prunedFabricState.fabricAllocations;
    nextPrimaryFabricCode =
      prunedFabricState.fabricAllocations[0]?.fabricCode || null;
  }

  const survivorKeys = new Set<string>();
  if (isValidUploadedDesignDraftSource(nextDesignSource)) {
    nextDesignSource.fabricCapacityComposition.forEach((spec) =>
      survivorKeys.add(spec.key),
    );
  } else {
    nextGarmentTypeSelection?.garmentTypes.forEach((garmentType) =>
      survivorKeys.add(createStyleBaseGarmentSpec(garmentType).key),
    );
  }
  Object.keys(nextAdditionalState?.byGarmentKey || {}).forEach((garmentKey) =>
    survivorKeys.add(garmentKey),
  );
  const hasSurvivors = survivorKeys.size > 0;
  const clearCatalogueSource =
    !hasSurvivors && nextDesignSource?.kind !== "uploaded";
  const nextAiTryOnWorkflow = invalidateAiTryOnForCompositionChange(
    draft.aiTryOnWorkflow,
  );

  const migratedDraft: GuestDesignDraft = {
    ...draft,
    ...(nextGarmentTypeSelection
      ? { garmentTypeSelection: nextGarmentTypeSelection }
      : {}),
    currentStageId: hasSurvivors
      ? draft.currentStageId
      : "garment_type",
    currentStep: hasSurvivors ? draft.currentStep : 1,
    selectedFabricCode:
      allocationInspection.status === "valid"
        ? nextPrimaryFabricCode
        : hasSurvivors
          ? draft.selectedFabricCode
          : null,
    selectedStyleId: clearCatalogueSource ? null : draft.selectedStyleId,
    designSource: clearCatalogueSource ? null : nextDesignSource,
    confirmedStyleId: clearCatalogueSource
      ? null
      : draft.confirmedStyleId,
    confirmedDesignSourceKey: clearCatalogueSource
      ? null
      : draft.confirmedDesignSourceKey,
    priceActivatedFabricCode:
      allocationInspection.status === "valid"
        ? nextPrimaryFabricCode
        : null,
    selectedGarment:
      !hasSurvivors || selectedLegacyGarmentIsAgbada(draft.selectedGarment)
        ? null
        : draft.selectedGarment,
    designSelections: nextDesignSelections,
    ...(draft.futureMeasurementState
      ? {
          futureMeasurementState: removeGarmentsFromMeasurementState(
            draft.futureMeasurementState,
            removedKeys,
          ),
        }
      : {}),
    ...(draft.futureShippingState
      ? {
          futureShippingState: {
            ...draft.futureShippingState,
            customerInformation: {
              ...draft.futureShippingState.customerInformation,
              deliveryAddress: {
                ...draft.futureShippingState.customerInformation.deliveryAddress,
              },
            },
            quoteReference: null,
          },
        }
      : {}),
    garmentPieceCount: survivorKeys.size,
    pricingBreakdown: invalidatePricingSnapshot(draft.pricingBreakdown),
    shippingSnapshot: {},
    ...(allocationInspection.status === "valid"
      ? { fabricAllocations: nextFabricAllocations }
      : {}),
  };
  if (nextAiTryOnWorkflow) {
    migratedDraft.aiTryOnWorkflow = nextAiTryOnWorkflow;
  } else {
    delete migratedDraft.aiTryOnWorkflow;
  }

  return {
    migrationVersion: LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION,
    changed: true,
    removedGarmentKeys: [...removedKeys].sort(),
    draft: migratedDraft,
  };
};
