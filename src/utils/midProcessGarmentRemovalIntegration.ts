import type {
  AiTryOnWorkflowStateV1,
  DesignSelections,
  DesignSource,
  DesignStudioStageId,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  FutureMeasurementStateV1,
  FutureShippingStateV1,
  GarmentTypeStepSelection,
} from "../types";
import type { AdditionalGarmentFabricTransaction } from "./additionalGarmentFabricPicker";
import { resolveAuthoritativePrimaryFabricCode } from "./additionalGarmentFabricPicker";
import {
  createEmptyAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
} from "./additionalGarmentConstructionState";
import { removeGarmentScopedCustomDetailInputs } from "./garmentScopedCustomDetailInputsState";
import { removeGarmentScopedCustomDetails } from "./garmentScopedCustomDetailsState";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import {
  removeFuturePhysicalGarmentOccurrence,
  type FuturePhysicalGarmentRemovalResult,
  type RemoveFuturePhysicalGarmentOccurrenceInput,
} from "./midProcessGarmentRemoval";

export interface FuturePhysicalGarmentRemovalCommit {
  garmentTypeSelection: GarmentTypeStepSelection;
  designSource: DesignSource | null;
  confirmedDesignSourceKey: string | null;
  uploadedCompositionMirror: readonly FabricCapacityGarmentSpec[];
  uploadedAdditionalGarmentTypes: readonly FabricGarmentType[];
  fabricAllocationState: FabricAllocationState;
  designSelections: DesignSelections;
  measurementState: FutureMeasurementStateV1;
  aiTryOnWorkflowState: AiTryOnWorkflowStateV1;
  shippingState: FutureShippingStateV1;
  selectedFabricCode: string | null;
  priceActivatedFabricCode: string | null;
}

export type PreparedFuturePhysicalGarmentRemoval =
  | {
      status: "removed";
      result: Extract<FuturePhysicalGarmentRemovalResult, { status: "removed" }>;
      commit: FuturePhysicalGarmentRemovalCommit;
    }
  | {
      status: "blocked" | "stale_authority";
      result: Exclude<FuturePhysicalGarmentRemovalResult, { status: "removed" }>;
      commit: null;
    };

export const prepareFuturePhysicalGarmentRemovalTransaction = ({
  input,
  currentDesignSelections,
  currentPriceActivatedFabricCode,
}: {
  input: RemoveFuturePhysicalGarmentOccurrenceInput;
  currentDesignSelections: DesignSelections;
  currentPriceActivatedFabricCode: string | null;
}): PreparedFuturePhysicalGarmentRemoval => {
  const result = removeFuturePhysicalGarmentOccurrence(input);
  if (result.status !== "removed") {
    return { status: result.status, result, commit: null };
  }

  const selectedFabricCode = resolveAuthoritativePrimaryFabricCode(
    result.state.fabricAllocationState,
  );
  return {
    status: "removed",
    result,
    commit: {
      garmentTypeSelection: result.state.garmentTypeSelection,
      designSource: result.state.designSource,
      confirmedDesignSourceKey: result.state.confirmedDesignSourceKey,
      uploadedCompositionMirror: result.state.uploadedCompositionMirror,
      uploadedAdditionalGarmentTypes:
        result.state.uploadedAdditionalGarmentTypes,
      fabricAllocationState: result.state.fabricAllocationState,
      designSelections: {
        ...currentDesignSelections,
        additionalGarmentConstructions:
          result.state.additionalGarmentConstructionState,
        garmentScopedCustomDetails:
          result.state.garmentScopedCustomDetails,
        garmentScopedCustomDetailInputs:
          result.state.garmentScopedCustomDetailInputs,
      },
      measurementState: result.state.measurementState,
      aiTryOnWorkflowState: result.state.aiTryOnWorkflowState,
      shippingState: result.state.shippingState,
      selectedFabricCode,
      priceActivatedFabricCode:
        currentPriceActivatedFabricCode === selectedFabricCode
          ? currentPriceActivatedFabricCode
          : null,
    },
  };
};

export interface FuturePhysicalGarmentRemovalCommitWriters {
  setGarmentTypeSelection: (value: GarmentTypeStepSelection) => void;
  setDesignSource: (value: DesignSource | null) => void;
  setConfirmedDesignSourceKey: (value: string | null) => void;
  setUploadedCompositionMirror: (
    value: readonly FabricCapacityGarmentSpec[],
  ) => void;
  setUploadedAdditionalGarmentTypes: (
    value: readonly FabricGarmentType[],
  ) => void;
  setFabricAllocationState: (value: FabricAllocationState) => void;
  setDesignSelections: (value: DesignSelections) => void;
  setMeasurementState: (value: FutureMeasurementStateV1) => void;
  setAiTryOnWorkflowState: (value: AiTryOnWorkflowStateV1) => void;
  setShippingState: (value: FutureShippingStateV1) => void;
  setSelectedFabricCode: (value: string | null) => void;
  setPriceActivatedFabricCode: (value: string | null) => void;
}

/**
 * Applies the already calculated aggregate result. React batches these direct
 * writes when the caller invokes this from one synchronous event.
 */
export const applyFuturePhysicalGarmentRemovalCommit = (
  commit: FuturePhysicalGarmentRemovalCommit,
  writers: FuturePhysicalGarmentRemovalCommitWriters,
): void => {
  writers.setGarmentTypeSelection(commit.garmentTypeSelection);
  writers.setDesignSource(commit.designSource);
  writers.setConfirmedDesignSourceKey(commit.confirmedDesignSourceKey);
  writers.setUploadedCompositionMirror(commit.uploadedCompositionMirror);
  writers.setUploadedAdditionalGarmentTypes(
    commit.uploadedAdditionalGarmentTypes,
  );
  writers.setFabricAllocationState(commit.fabricAllocationState);
  writers.setDesignSelections(commit.designSelections);
  writers.setMeasurementState(commit.measurementState);
  writers.setAiTryOnWorkflowState(commit.aiTryOnWorkflowState);
  writers.setShippingState(commit.shippingState);
  writers.setSelectedFabricCode(commit.selectedFabricCode);
  writers.setPriceActivatedFabricCode(commit.priceActivatedFabricCode);
};

export interface RemovalStageRetentionLease {
  kind: "garment_removal";
  retainedStage: "summary" | "payment";
  previousAuthoritySignature: string;
  postRemovalAuthoritySignature: string;
  removedGarmentKey: string;
  removalGeneration: number;
  sessionIdentityKey: string;
}

export const createRemovalStageRetentionLease = ({
  result,
  originStage,
  removalGeneration,
  sessionIdentityKey,
}: {
  result: Extract<FuturePhysicalGarmentRemovalResult, { status: "removed" }>;
  originStage: DesignStudioStageId;
  removalGeneration: number;
  sessionIdentityKey: string;
}): RemovalStageRetentionLease | null => {
  if (originStage !== "summary" && originStage !== "payment") return null;
  return {
    kind: "garment_removal",
    retainedStage: originStage,
    previousAuthoritySignature: result.previousAuthoritySignature,
    postRemovalAuthoritySignature: result.authoritySignature,
    removedGarmentKey: result.removedOccurrence.garmentKey,
    removalGeneration,
    sessionIdentityKey,
  };
};

export const isRemovalStageRetentionLeaseActive = ({
  lease,
  currentStageId,
  liveAuthoritySignature,
  removalGeneration,
  sessionIdentityKey,
}: {
  lease: RemovalStageRetentionLease | null;
  currentStageId: DesignStudioStageId;
  liveAuthoritySignature: string | null;
  removalGeneration: number;
  sessionIdentityKey: string;
}): boolean =>
  Boolean(
    lease &&
      lease.retainedStage === currentStageId &&
      lease.postRemovalAuthoritySignature === liveAuthoritySignature &&
      lease.removalGeneration === removalGeneration &&
      lease.sessionIdentityKey === sessionIdentityKey,
  );

export const isCurrentAdditionalGarmentFabricOperation = ({
  currentTransaction,
  expectedTransactionId,
  expectedGarmentKey,
}: {
  currentTransaction: AdditionalGarmentFabricTransaction | null;
  expectedTransactionId: number;
  expectedGarmentKey: string;
}): boolean =>
  Boolean(
    currentTransaction &&
      currentTransaction.transactionId === expectedTransactionId &&
      currentTransaction.garmentKey === expectedGarmentKey,
  );

export interface PendingAdditionalGarmentCancellationCommit {
  fabricAllocationState: FabricAllocationState;
  designSelections: DesignSelections;
}

/**
 * Cancels a provisional addition that has not entered physical authority yet.
 * Committed occurrences must use removeFuturePhysicalGarmentOccurrence instead.
 */
export const preparePendingAdditionalGarmentCancellationCommit = ({
  garmentKey,
  fabricAllocationState,
  designSelections,
}: {
  garmentKey: string;
  fabricAllocationState: FabricAllocationState;
  designSelections: DesignSelections;
}): PendingAdditionalGarmentCancellationCommit => ({
  fabricAllocationState:
    FabricAllocationStateEngine.prunePhysicalGarmentAssignments(
      fabricAllocationState,
      [garmentKey],
    ),
  designSelections: {
    ...designSelections,
    additionalGarmentConstructions: removeAdditionalGarmentConstruction(
      designSelections.additionalGarmentConstructions ||
        createEmptyAdditionalGarmentConstructionState(),
      garmentKey,
    ),
    garmentScopedCustomDetails: removeGarmentScopedCustomDetails(
      designSelections.garmentScopedCustomDetails || {
        schemaVersion: 1,
        selectionsByGarmentKey: {},
        snapshotsByGarmentKey: {},
      },
      garmentKey,
    ),
    garmentScopedCustomDetailInputs: removeGarmentScopedCustomDetailInputs(
      designSelections.garmentScopedCustomDetailInputs || {
        schemaVersion: 1,
        textByGarmentKey: {},
      },
      garmentKey,
    ),
  },
});

export interface FutureGarmentRemovalTransientPlan {
  clearAdditionalFabricTransaction: boolean;
  nextCustomDetailsFocusGarmentKey: string | null;
  invalidateUploadedOperation: boolean;
}

export const projectFutureGarmentRemovalTransientPlan = ({
  result,
  currentAdditionalFabricTransaction,
  currentCustomDetailsFocusGarmentKey,
}: {
  result: Extract<FuturePhysicalGarmentRemovalResult, { status: "removed" }>;
  currentAdditionalFabricTransaction: AdditionalGarmentFabricTransaction | null;
  currentCustomDetailsFocusGarmentKey: string | null;
}): FutureGarmentRemovalTransientPlan => ({
  clearAdditionalFabricTransaction:
    currentAdditionalFabricTransaction?.garmentKey ===
    result.removedOccurrence.garmentKey,
  nextCustomDetailsFocusGarmentKey:
    currentCustomDetailsFocusGarmentKey === result.removedOccurrence.garmentKey
      ? result.suggestedSurvivingGarmentKey
      : currentCustomDetailsFocusGarmentKey,
  invalidateUploadedOperation:
    result.invalidations.invalidateUploadOperationGeneration,
});
