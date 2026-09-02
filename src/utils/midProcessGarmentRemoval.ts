import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import type {
  AdditionalGarmentConstructionStateV1,
  AiTryOnWorkflowStateV1,
  CustomDetailOption,
  DesignSource,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  FutureMeasurementEnteredBagV1,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  FutureShippingStateV1,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
  StyleCategory,
  UploadedDesignSource,
} from "../types";
import { removeAdditionalGarmentConstruction } from "./additionalGarmentConstructionState";
import {
  createAiTryOnVisualInputFingerprint,
  reconcileAiTryOnWorkflow,
  type AiTryOnReconciliationPolicy,
} from "./aiTryOnWorkflow";
import {
  isValidUploadedDesignSource,
  resolveActiveDesignSource,
  resolveAuthoritativePhysicalOrder,
  type AuthoritativePhysicalOrderDiagnostic,
  type PhysicalGarmentOccurrence,
} from "./designSourceState";
import { removeGarmentScopedCustomDetailInputs } from "./garmentScopedCustomDetailInputsState";
import { removeGarmentScopedCustomDetails } from "./garmentScopedCustomDetailsState";
import {
  getGarmentTypeSelectedDemographics,
  reconcileGarmentTypeStepSelection,
} from "./garmentTypeStepState";
import {
  isCanonicalPhysicalGarmentType,
} from "./garmentConstructionPricing";
import {
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
} from "./measurementBlueprint";
import {
  getUploadedDesignAdditionalGarmentTypes,
} from "./uploadedDesignStep1";
import {
  reconcileGarmentTypeSelectionOccurrenceIdentities,
  reconcilePhysicalGarmentOccurrenceIdentityState,
} from "./physicalGarmentOccurrenceIdentity";

const MEASUREMENT_ROUTES: readonly MeasurementRiskRoute[] = [
  "low_risk",
  "medium_risk",
  "high_risk",
];

export interface FutureGarmentRemovalPendingOperations {
  protectedSourceMutationPending: boolean;
  pickerGarmentKey: string | null;
  additionalFabricTransactionGarmentKey: string | null;
  uploadOperationGeneration: number | null;
}

export interface FuturePhysicalGarmentRemovalState {
  garmentTypeSelection: GarmentTypeStepSelection;
  designSource: DesignSource | null;
  confirmedDesignSourceKey: string | null;
  uploadedCompositionMirror: readonly FabricCapacityGarmentSpec[];
  uploadedAdditionalGarmentTypes: readonly FabricGarmentType[];
  additionalGarmentConstructionState: AdditionalGarmentConstructionStateV1;
  fabricAllocationState: FabricAllocationState;
  garmentScopedCustomDetails: GarmentScopedCustomDetailsStateV1;
  garmentScopedCustomDetailInputs: GarmentScopedCustomDetailInputsV1;
  measurementState: FutureMeasurementStateV1;
  aiTryOnWorkflowState: AiTryOnWorkflowStateV1;
  shippingState: FutureShippingStateV1;
}

export interface RemoveFuturePhysicalGarmentOccurrenceInput
  extends FuturePhysicalGarmentRemovalState {
  targetGarmentKey: string;
  expectedAuthoritySignature: string;
  selectedStyle?: StyleCategory | null;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  aiTryOnPolicy: AiTryOnReconciliationPolicy;
  pendingOperations: FutureGarmentRemovalPendingOperations;
}

export type FuturePhysicalGarmentRemovalBlockerCode =
  | "AUTHORITATIVE_ORDER_INVALID"
  | "UPLOAD_SOURCE_NOT_CONFIRMED"
  | "UPLOAD_COMPOSITION_MIRROR_MISMATCH"
  | "UPLOAD_ADDITIONAL_TYPES_MIRROR_MISMATCH"
  | "TARGET_GARMENT_NOT_FOUND"
  | "TARGET_GARMENT_AMBIGUOUS"
  | "TARGET_MEMBERSHIP_INVALID"
  | "PROTECTED_SOURCE_MUTATION_PENDING"
  | "LAST_GARMENT_REMOVAL_FORBIDDEN"
  | "DEPENDENT_ADDITIONAL_GARMENT_PRESENT"
  | "POST_REMOVAL_AUTHORITY_INVALID";

export interface FuturePhysicalGarmentRemovalInvalidations {
  pickerGarmentKey: string | null;
  additionalFabricTransactionGarmentKey: string | null;
  pendingFabricGarmentCleared: boolean;
  invalidateUploadOperationGeneration: boolean;
  uploadOperationGeneration: number | null;
}

export type FuturePhysicalGarmentRemovalResult =
  | {
      status: "removed";
      state: FuturePhysicalGarmentRemovalState;
      removedOccurrence: PhysicalGarmentOccurrence;
      survivorOccurrences: readonly PhysicalGarmentOccurrence[];
      previousAuthoritySignature: string;
      authoritySignature: string;
      suggestedSurvivingGarmentKey: string | null;
      invalidations: FuturePhysicalGarmentRemovalInvalidations;
    }
  | {
      status: "blocked";
      code: FuturePhysicalGarmentRemovalBlockerCode;
      state: FuturePhysicalGarmentRemovalState;
      authoritySignature: string | null;
      diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
      dependentGarmentKeys: readonly string[];
    }
  | {
      status: "stale_authority";
      code: "AUTHORITY_SIGNATURE_MISMATCH";
      state: FuturePhysicalGarmentRemovalState;
      expectedAuthoritySignature: string;
      authoritySignature: string;
    };

type ResolvedRemovalAuthority = {
  status: "resolved";
  sourceKind: "catalogue" | "uploaded";
  sourceKey: string | null;
  activeSource: DesignSource | null;
  effectiveGarmentTypeSelection: GarmentTypeStepSelection;
  physicalOccurrences: readonly PhysicalGarmentOccurrence[];
  signature: string;
};

type BlockedRemovalAuthority = {
  status: "blocked";
  code: "AUTHORITATIVE_ORDER_INVALID" | "UPLOAD_SOURCE_NOT_CONFIRMED";
  diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
};

export type FuturePhysicalGarmentRemovalAuthority =
  | ResolvedRemovalAuthority
  | BlockedRemovalAuthority;

const cloneCapacitySpec = (
  spec: FabricCapacityGarmentSpec,
): FabricCapacityGarmentSpec => ({
  key: spec.key,
  garmentType: spec.garmentType,
  fabricUnits: spec.fabricUnits,
  ...(spec.lowerGarmentType
    ? { lowerGarmentType: spec.lowerGarmentType }
    : {}),
});

const getInputState = (
  input: RemoveFuturePhysicalGarmentOccurrenceInput,
): FuturePhysicalGarmentRemovalState => ({
  garmentTypeSelection: input.garmentTypeSelection,
  designSource: input.designSource,
  confirmedDesignSourceKey: input.confirmedDesignSourceKey,
  uploadedCompositionMirror: input.uploadedCompositionMirror,
  uploadedAdditionalGarmentTypes: input.uploadedAdditionalGarmentTypes,
  additionalGarmentConstructionState:
    input.additionalGarmentConstructionState,
  fabricAllocationState: input.fabricAllocationState,
  garmentScopedCustomDetails: input.garmentScopedCustomDetails,
  garmentScopedCustomDetailInputs: input.garmentScopedCustomDetailInputs,
  measurementState: input.measurementState,
  aiTryOnWorkflowState: input.aiTryOnWorkflowState,
  shippingState: input.shippingState,
});

export const createFuturePhysicalOrderAuthoritySignature = ({
  sourceKind,
  sourceKey,
  physicalOccurrences,
}: {
  sourceKind: "catalogue" | "uploaded";
  sourceKey: string | null;
  physicalOccurrences: readonly PhysicalGarmentOccurrence[];
}): string =>
  JSON.stringify({
    schemaVersion: 2,
    sourceKind,
    sourceKey,
    physicalOccurrences: physicalOccurrences.map((occurrence) => ({
      garmentKey: occurrence.garmentKey,
      occurrenceGeneration: occurrence.occurrenceGeneration ?? null,
      garmentType: occurrence.garmentType,
      sourceRole: occurrence.sourceRole,
      fabricUnits: occurrence.fabricUnits,
    })),
  });

export const resolveFuturePhysicalGarmentRemovalAuthority = ({
  garmentTypeSelection,
  designSource,
  selectedStyle,
  confirmedDesignSourceKey,
  normalizedCustomDetailCatalog,
  fabricAllocationState,
  additionalGarmentConstructionState,
}: Pick<
  RemoveFuturePhysicalGarmentOccurrenceInput,
  | "garmentTypeSelection"
  | "designSource"
  | "selectedStyle"
  | "confirmedDesignSourceKey"
  | "normalizedCustomDetailCatalog"
  | "fabricAllocationState"
  | "additionalGarmentConstructionState"
>): FuturePhysicalGarmentRemovalAuthority => {
  const activeSource = resolveActiveDesignSource(designSource, selectedStyle);
  if (
    activeSource?.kind === "uploaded" &&
    (confirmedDesignSourceKey !== activeSource.sourceKey ||
      !isValidUploadedDesignSource(activeSource))
  ) {
    return {
      status: "blocked",
      code: "UPLOAD_SOURCE_NOT_CONFIRMED",
      diagnostics: [
        {
          code: "upload_not_confirmed",
          message: "The uploaded design source is not confirmed.",
        },
      ],
    };
  }

  const resolution = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection,
    designSource,
    selectedStyle,
    confirmedDesignSourceKey,
    normalizedCustomDetailCatalog,
    fabricAllocationState,
    additionalGarmentConstructionState,
  });
  if (resolution.status === "blocked") {
    return {
      status: "blocked",
      code: "AUTHORITATIVE_ORDER_INVALID",
      diagnostics: resolution.diagnostics,
    };
  }
  const sourceKey = activeSource?.sourceKey || null;
  return {
    status: "resolved",
    sourceKind: resolution.sourceKind,
    sourceKey,
    activeSource,
    effectiveGarmentTypeSelection:
      resolution.effectiveGarmentTypeSelection,
    physicalOccurrences: resolution.physicalOccurrences,
    signature: createFuturePhysicalOrderAuthoritySignature({
      sourceKind: resolution.sourceKind,
      sourceKey,
      physicalOccurrences: resolution.physicalOccurrences,
    }),
  };
};

const block = ({
  input,
  code,
  authoritySignature,
  diagnostics = [],
  dependentGarmentKeys = [],
}: {
  input: RemoveFuturePhysicalGarmentOccurrenceInput;
  code: FuturePhysicalGarmentRemovalBlockerCode;
  authoritySignature: string | null;
  diagnostics?: readonly AuthoritativePhysicalOrderDiagnostic[];
  dependentGarmentKeys?: readonly string[];
}): FuturePhysicalGarmentRemovalResult => ({
  status: "blocked",
  code,
  state: getInputState(input),
  authoritySignature,
  diagnostics,
  dependentGarmentKeys,
});

const hasSameComposition = (
  left: readonly FabricCapacityGarmentSpec[],
  right: readonly FabricCapacityGarmentSpec[],
): boolean =>
  JSON.stringify(left.map(cloneCapacitySpec)) ===
  JSON.stringify(right.map(cloneCapacitySpec));

const getExpectedUploadedAdditionalTypes = ({
  garmentTypeSelection,
  composition,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  composition: readonly FabricCapacityGarmentSpec[];
}): FabricGarmentType[] =>
  getUploadedDesignAdditionalGarmentTypes({
    step1GarmentTypes: garmentTypeSelection.garmentTypes,
    composition,
  });

const hasSameGarmentTypes = (
  left: readonly FabricGarmentType[],
  right: readonly FabricGarmentType[],
): boolean =>
  left.length === right.length &&
  left.every((garmentType, index) => garmentType === right[index]);

const getAllFabricAssignments = (
  state: FabricAllocationState,
): FabricGarmentAssignment[] => {
  const committed = state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  );
  return state.pendingFabricGarment
    ? [...committed, state.pendingFabricGarment]
    : committed;
};

const cloneMeasurementValue = (
  value: FutureMeasurementValueV1,
): FutureMeasurementValueV1 => ({
  ...value,
  ...(value.calculation
    ? { calculation: { ...value.calculation } }
    : {}),
});

const removeGarmentFromEnteredBag = (
  bag: FutureMeasurementEnteredBagV1,
  garmentKey: string,
): FutureMeasurementEnteredBagV1 => ({
  shared: Object.fromEntries(
    Object.entries(bag.shared)
      .filter(([, value]) => value.calculation?.garmentKey !== garmentKey)
      .map(([measurementId, value]) => [
        measurementId,
        cloneMeasurementValue(value),
      ]),
  ),
  byGarmentKey: Object.fromEntries(
    Object.entries(bag.byGarmentKey)
      .filter(([candidateGarmentKey]) => candidateGarmentKey !== garmentKey)
      .map(([candidateGarmentKey, values]) => [
        candidateGarmentKey,
        Object.fromEntries(
          Object.entries(values)
            .filter(([, value]) =>
              value.calculation?.garmentKey !== garmentKey,
            )
            .map(([measurementId, value]) => [
              measurementId,
              cloneMeasurementValue(value),
            ]),
        ),
      ]),
  ),
});

const invalidMeasurementKeyBelongsToGarment = (
  invalidKey: string,
  garmentKey: string,
): boolean =>
  MEASUREMENT_ROUTES.some((route) =>
    invalidKey.startsWith(`${route}:${garmentKey}:`),
  );

const removeGarmentFromMeasurementState = ({
  state,
  garmentKey,
}: {
  state: FutureMeasurementStateV1;
  garmentKey: string;
}): FutureMeasurementStateV1 => {
  const enteredByRoute = state.enteredByRoute
    ? Object.fromEntries(
        MEASUREMENT_ROUTES.map((route) => [
          route,
          removeGarmentFromEnteredBag(state.enteredByRoute![route], garmentKey),
        ]),
      ) as FutureMeasurementStateV1["enteredByRoute"]
    : undefined;
  const invalidInputKeysByRoute = state.invalidInputKeysByRoute
    ? Object.fromEntries(
        MEASUREMENT_ROUTES.map((route) => [
          route,
          state.invalidInputKeysByRoute![route].filter(
            (invalidKey) =>
              !invalidMeasurementKeyBelongsToGarment(
                invalidKey,
                garmentKey,
              ),
          ),
        ]),
      ) as FutureMeasurementStateV1["invalidInputKeysByRoute"]
    : undefined;

  return {
    ...state,
    entered: removeGarmentFromEnteredBag(state.entered, garmentKey),
    ...(enteredByRoute ? { enteredByRoute } : {}),
    ...(state.unassignedEntered
      ? {
          unassignedEntered: removeGarmentFromEnteredBag(
            state.unassignedEntered,
            garmentKey,
          ),
        }
      : {}),
    derived: removeGarmentFromEnteredBag(state.derived, garmentKey),
    diagnostics: state.diagnostics.filter(
      (diagnostic) => diagnostic.garmentKey !== garmentKey,
    ),
    invalidInputKeys: state.invalidInputKeys.filter(
      (invalidKey) =>
        !invalidMeasurementKeyBelongsToGarment(invalidKey, garmentKey),
    ),
    ...(invalidInputKeysByRoute ? { invalidInputKeysByRoute } : {}),
  };
};

const clearShippingQuote = (
  state: FutureShippingStateV1,
): FutureShippingStateV1 => ({
  ...state,
  customerInformation: {
    ...state.customerInformation,
    deliveryAddress: {
      ...state.customerInformation.deliveryAddress,
    },
  },
  quoteReference: null,
});

const removeStep1GarmentType = ({
  state,
  garmentType,
  normalizedCustomDetailCatalog,
}: {
  state: GarmentTypeStepSelection;
  garmentType: FabricGarmentType;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: state.garmentTypes.filter(
      (candidate) => candidate !== garmentType,
    ),
    selectedDemographics: getGarmentTypeSelectedDemographics(state),
    normalizedCustomDetailCatalog,
    persistedSelection: state,
  }).selection;

const getSuggestedSurvivorKey = (
  current: readonly PhysicalGarmentOccurrence[],
  targetIndex: number,
): string | null =>
  current[targetIndex + 1]?.garmentKey ||
  current[targetIndex - 1]?.garmentKey ||
  null;

export const removeFuturePhysicalGarmentOccurrence = (
  input: RemoveFuturePhysicalGarmentOccurrenceInput,
): FuturePhysicalGarmentRemovalResult => {
  const authority = resolveFuturePhysicalGarmentRemovalAuthority(input);
  if (authority.status === "blocked") {
    return block({
      input,
      code: authority.code,
      authoritySignature: null,
      diagnostics: authority.diagnostics,
    });
  }
  if (input.expectedAuthoritySignature !== authority.signature) {
    return {
      status: "stale_authority",
      code: "AUTHORITY_SIGNATURE_MISMATCH",
      state: getInputState(input),
      expectedAuthoritySignature: input.expectedAuthoritySignature,
      authoritySignature: authority.signature,
    };
  }

  const targetMatches = authority.physicalOccurrences.filter(
    (occurrence) => occurrence.garmentKey === input.targetGarmentKey,
  );
  if (targetMatches.length === 0) {
    return block({
      input,
      code: "TARGET_GARMENT_NOT_FOUND",
      authoritySignature: authority.signature,
    });
  }
  if (targetMatches.length !== 1) {
    return block({
      input,
      code: "TARGET_GARMENT_AMBIGUOUS",
      authoritySignature: authority.signature,
    });
  }
  const target = targetMatches[0];
  if (!isCanonicalPhysicalGarmentType(target.garmentType)) {
    return block({
      input,
      code: "TARGET_MEMBERSHIP_INVALID",
      authoritySignature: authority.signature,
    });
  }
  if (input.pendingOperations.protectedSourceMutationPending) {
    return block({
      input,
      code: "PROTECTED_SOURCE_MUTATION_PENDING",
      authoritySignature: authority.signature,
    });
  }
  if (authority.physicalOccurrences.length === 1) {
    return block({
      input,
      code: "LAST_GARMENT_REMOVAL_FORBIDDEN",
      authoritySignature: authority.signature,
    });
  }

  const survivorKeys = new Set(
    authority.physicalOccurrences
      .filter((occurrence) => occurrence.garmentKey !== target.garmentKey)
      .map((occurrence) => occurrence.garmentKey),
  );
  const dependentGarmentKeys = getAllFabricAssignments(
    input.fabricAllocationState,
  )
    .filter(
      (assignment) =>
        assignment.garmentKey !== target.garmentKey &&
        assignment.sourceRole === "additional" &&
        assignment.mainGarmentKey === target.garmentKey &&
        (survivorKeys.has(assignment.garmentKey) ||
          input.fabricAllocationState.pendingFabricGarment?.garmentKey ===
            assignment.garmentKey),
    )
    .map((assignment) => assignment.garmentKey)
    .filter((garmentKey, index, all) => all.indexOf(garmentKey) === index)
    .sort();
  if (dependentGarmentKeys.length > 0) {
    return block({
      input,
      code: "DEPENDENT_ADDITIONAL_GARMENT_PRESENT",
      authoritySignature: authority.signature,
      dependentGarmentKeys,
    });
  }

  const additionalMembership = Object.prototype.hasOwnProperty.call(
    input.additionalGarmentConstructionState.byGarmentKey,
    target.garmentKey,
  );
  const uploadedSource =
    authority.activeSource?.kind === "uploaded"
      ? authority.activeSource
      : null;
  const uploadedMembershipCount = uploadedSource
    ? uploadedSource.fabricCapacityComposition.filter(
        (spec) => spec.key === target.garmentKey,
      ).length
    : 0;
  const catalogueMembershipCount =
    authority.sourceKind === "catalogue"
      ? input.garmentTypeSelection.garmentTypes.filter(
          (garmentType) =>
            createStyleBaseGarmentSpec(garmentType).key === target.garmentKey,
        ).length
      : 0;
  const membershipCount =
    Number(additionalMembership) +
    uploadedMembershipCount +
    catalogueMembershipCount;
  if (membershipCount !== 1) {
    return block({
      input,
      code: "TARGET_MEMBERSHIP_INVALID",
      authoritySignature: authority.signature,
    });
  }

  if (uploadedSource) {
    if (
      !hasSameComposition(
        uploadedSource.fabricCapacityComposition,
        input.uploadedCompositionMirror,
      )
    ) {
      return block({
        input,
        code: "UPLOAD_COMPOSITION_MIRROR_MISMATCH",
        authoritySignature: authority.signature,
      });
    }
    const expectedAdditionalTypes = getExpectedUploadedAdditionalTypes({
      garmentTypeSelection: input.garmentTypeSelection,
      composition: uploadedSource.fabricCapacityComposition,
    });
    if (
      !hasSameGarmentTypes(
        expectedAdditionalTypes,
        input.uploadedAdditionalGarmentTypes,
      )
    ) {
      return block({
        input,
        code: "UPLOAD_ADDITIONAL_TYPES_MIRROR_MISMATCH",
        authoritySignature: authority.signature,
      });
    }
  }

  let nextGarmentTypeSelection = input.garmentTypeSelection;
  let nextDesignSource = input.designSource;
  let nextUploadedCompositionMirror = input.uploadedCompositionMirror.map(
    cloneCapacitySpec,
  );
  let nextUploadedAdditionalGarmentTypes = [
    ...input.uploadedAdditionalGarmentTypes,
  ];
  let nextAdditionalGarmentConstructionState =
    input.additionalGarmentConstructionState;

  if (additionalMembership) {
    nextAdditionalGarmentConstructionState =
      removeAdditionalGarmentConstruction(
        input.additionalGarmentConstructionState,
        target.garmentKey,
      );
  } else if (uploadedSource) {
    if (
      input.garmentTypeSelection.garmentTypes.includes(target.garmentType)
    ) {
      nextGarmentTypeSelection = removeStep1GarmentType({
        state: input.garmentTypeSelection,
        garmentType: target.garmentType,
        normalizedCustomDetailCatalog: input.normalizedCustomDetailCatalog,
      });
    }
    const nextComposition = uploadedSource.fabricCapacityComposition
      .filter((spec) => spec.key !== target.garmentKey)
      .map(cloneCapacitySpec);
    const nextUploadedSource: UploadedDesignSource = {
      ...uploadedSource,
      uploadReference: { ...uploadedSource.uploadReference },
      fabricCapacityComposition: nextComposition,
    };
    nextDesignSource = nextUploadedSource;
    nextUploadedCompositionMirror = input.uploadedCompositionMirror
      .filter((spec) => spec.key !== target.garmentKey)
      .map(cloneCapacitySpec);
    nextUploadedAdditionalGarmentTypes =
      getExpectedUploadedAdditionalTypes({
        garmentTypeSelection: nextGarmentTypeSelection,
        composition: nextComposition,
      });
  } else {
    nextGarmentTypeSelection = removeStep1GarmentType({
      state: input.garmentTypeSelection,
      garmentType: target.garmentType,
      normalizedCustomDetailCatalog: input.normalizedCustomDetailCatalog,
    });
  }

  const currentOccurrenceIdentityState =
    reconcilePhysicalGarmentOccurrenceIdentityState({
      state: input.garmentTypeSelection.physicalOccurrenceIdentityState,
      activeGarmentKeys: authority.physicalOccurrences.map(
        (occurrence) => occurrence.garmentKey,
      ),
    });
  nextGarmentTypeSelection =
    reconcileGarmentTypeSelectionOccurrenceIdentities({
      selection: {
        ...nextGarmentTypeSelection,
        physicalOccurrenceIdentityState: currentOccurrenceIdentityState,
      },
      activeGarmentKeys: authority.physicalOccurrences
        .filter((occurrence) => occurrence.garmentKey !== target.garmentKey)
        .map((occurrence) => occurrence.garmentKey),
    });

  const nextFabricAllocationState =
    FabricAllocationStateEngine.prunePhysicalGarmentAssignments(
      input.fabricAllocationState,
      [target.garmentKey],
    );
  const nextGarmentScopedCustomDetails =
    removeGarmentScopedCustomDetails(
      input.garmentScopedCustomDetails,
      target.garmentKey,
    );
  const nextGarmentScopedCustomDetailInputs =
    removeGarmentScopedCustomDetailInputs(
      input.garmentScopedCustomDetailInputs,
      target.garmentKey,
    );

  const nextAuthority = resolveFuturePhysicalGarmentRemovalAuthority({
    garmentTypeSelection: nextGarmentTypeSelection,
    designSource: nextDesignSource,
    selectedStyle: input.selectedStyle,
    confirmedDesignSourceKey: input.confirmedDesignSourceKey,
    normalizedCustomDetailCatalog: input.normalizedCustomDetailCatalog,
    fabricAllocationState: nextFabricAllocationState,
    additionalGarmentConstructionState:
      nextAdditionalGarmentConstructionState,
  });
  if (nextAuthority.status === "blocked") {
    return block({
      input,
      code: "POST_REMOVAL_AUTHORITY_INVALID",
      authoritySignature: authority.signature,
      diagnostics: nextAuthority.diagnostics,
    });
  }

  const measurementPlan = planMeasurementRequirements({
    route: input.measurementState.route,
    garmentTypeSelection: nextAuthority.effectiveGarmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({
      garmentTypeSelection: nextAuthority.effectiveGarmentTypeSelection,
      physicalOccurrences: nextAuthority.physicalOccurrences,
    }),
    garmentScopedCustomDetails: nextGarmentScopedCustomDetails,
    additionalGarmentConstructions:
      nextAdditionalGarmentConstructionState,
  });
  const nextMeasurementState = reconcileFutureMeasurementState({
    state: removeGarmentFromMeasurementState({
      state: input.measurementState,
      garmentKey: target.garmentKey,
    }),
    plan: measurementPlan,
  });
  const nextAiInputFingerprint = nextAuthority.activeSource
    ? createAiTryOnVisualInputFingerprint({
        garmentTypeSelection:
          nextAuthority.effectiveGarmentTypeSelection,
        fabricAllocations: nextFabricAllocationState.fabricAllocations,
        selectedStyleId: nextAuthority.activeSource.sourceKey,
        garmentScopedCustomDetails: nextGarmentScopedCustomDetails,
        physicalOccurrences: nextAuthority.physicalOccurrences,
      })
    : null;
  const nextAiTryOnWorkflowState = reconcileAiTryOnWorkflow({
    state: input.aiTryOnWorkflowState,
    currentInputFingerprint: nextAiInputFingerprint,
    policy: input.aiTryOnPolicy,
  });
  const nextShippingState = clearShippingQuote(input.shippingState);
  const targetIndex = authority.physicalOccurrences.findIndex(
    (occurrence) => occurrence.garmentKey === target.garmentKey,
  );

  return {
    status: "removed",
    state: {
      garmentTypeSelection: nextGarmentTypeSelection,
      designSource: nextDesignSource,
      confirmedDesignSourceKey: input.confirmedDesignSourceKey,
      uploadedCompositionMirror: nextUploadedCompositionMirror,
      uploadedAdditionalGarmentTypes:
        nextUploadedAdditionalGarmentTypes,
      additionalGarmentConstructionState:
        nextAdditionalGarmentConstructionState,
      fabricAllocationState: nextFabricAllocationState,
      garmentScopedCustomDetails: nextGarmentScopedCustomDetails,
      garmentScopedCustomDetailInputs:
        nextGarmentScopedCustomDetailInputs,
      measurementState: nextMeasurementState,
      aiTryOnWorkflowState: nextAiTryOnWorkflowState,
      shippingState: nextShippingState,
    },
    removedOccurrence: { ...target },
    survivorOccurrences: nextAuthority.physicalOccurrences.map(
      (occurrence) => ({ ...occurrence }),
    ),
    previousAuthoritySignature: authority.signature,
    authoritySignature: nextAuthority.signature,
    suggestedSurvivingGarmentKey: getSuggestedSurvivorKey(
      authority.physicalOccurrences,
      targetIndex,
    ),
    invalidations: {
      pickerGarmentKey:
        input.pendingOperations.pickerGarmentKey === target.garmentKey
          ? target.garmentKey
          : null,
      additionalFabricTransactionGarmentKey:
        input.pendingOperations.additionalFabricTransactionGarmentKey ===
        target.garmentKey
          ? target.garmentKey
          : null,
      pendingFabricGarmentCleared:
        input.fabricAllocationState.pendingFabricGarment?.garmentKey ===
        target.garmentKey,
      invalidateUploadOperationGeneration:
        authority.sourceKind === "uploaded" &&
        input.pendingOperations.uploadOperationGeneration !== null,
      uploadOperationGeneration:
        input.pendingOperations.uploadOperationGeneration,
    },
  };
};
