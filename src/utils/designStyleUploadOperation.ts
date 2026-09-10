import {
  assignUploadedDesignStyleToGarmentOccurrence,
  type GarmentDesignStyleAssignmentMutationResult,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type UploadedDesignStyleAssignmentInput,
} from "./garmentScopedDesignStyleAssignment";
import type { PhysicalGarmentOccurrence } from "./designSourceState";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./physicalGarmentOccurrenceIdentity";

export type DesignStyleUploadOperationKind = "assign" | "replace";

export interface DesignStyleUploadOperationTicket {
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly expectedLedgerRevision: number;
  readonly operationGeneration: number;
  readonly operationKind: DesignStyleUploadOperationKind;
}

interface CurrentDesignStyleUploadOperation {
  readonly occurrenceToken: string;
  readonly operationGeneration: number;
}

export interface DesignStyleUploadOperationState {
  readonly nextOperationGeneration: number;
  readonly currentOperationByGarmentKey: Readonly<
    Record<string, CurrentDesignStyleUploadOperation>
  >;
}

export type DesignStyleUploadOperationRejectionReason =
  | "stale-ledger-revision"
  | "stale-occurrence-token"
  | "stale-operation-generation"
  | "missing-occurrence"
  | "wrong-target"
  | "invalid-operation-kind";

export type DesignStyleUploadOperationFailureReason =
  | "upload-preparation-failed"
  | "preview-failed"
  | "source-validation-failed"
  | "external-operation-failed";

export type BeginDesignStyleUploadOperationResult =
  | {
      readonly status: "begun";
      readonly ticket: DesignStyleUploadOperationTicket;
      readonly state: DesignStyleUploadOperationState;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    }
  | {
      readonly status: "rejected";
      readonly reason: DesignStyleUploadOperationRejectionReason;
      readonly state: DesignStyleUploadOperationState;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    };

export type ValidateDesignStyleUploadOperationResult =
  | { readonly status: "accepted" }
  | {
      readonly status: "rejected";
      readonly reason: DesignStyleUploadOperationRejectionReason;
    };

export type ApplyDesignStyleUploadOperationResult =
  | {
      readonly status: "accepted";
      readonly state: DesignStyleUploadOperationState;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
      readonly assignmentResult: GarmentDesignStyleAssignmentMutationResult;
    }
  | {
      readonly status: "rejected";
      readonly reason: DesignStyleUploadOperationRejectionReason;
      readonly state: DesignStyleUploadOperationState;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    };

export interface FailDesignStyleUploadOperationResult {
  readonly status: "failed";
  readonly reason: DesignStyleUploadOperationFailureReason;
  readonly state: DesignStyleUploadOperationState;
  readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
}

const freezeCurrentOperations = (
  operations: Record<string, CurrentDesignStyleUploadOperation>,
): Readonly<Record<string, CurrentDesignStyleUploadOperation>> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(operations).map(([garmentKey, operation]) => [
        garmentKey,
        Object.freeze({ ...operation }),
      ]),
    ),
  );

const createState = (
  nextOperationGeneration: number,
  currentOperationByGarmentKey: Record<
    string,
    CurrentDesignStyleUploadOperation
  >,
): DesignStyleUploadOperationState =>
  Object.freeze({
    nextOperationGeneration,
    currentOperationByGarmentKey: freezeCurrentOperations(
      currentOperationByGarmentKey,
    ),
  });

export const createDesignStyleUploadOperationState =
  (): DesignStyleUploadOperationState => createState(1, {});

const isOperationKind = (
  value: unknown,
): value is DesignStyleUploadOperationKind =>
  value === "assign" || value === "replace";

const occurrenceTokenFor = (
  occurrence: PhysicalGarmentOccurrence,
): string | null =>
  Number.isSafeInteger(occurrence.occurrenceGeneration) &&
  Number(occurrence.occurrenceGeneration) > 0
    ? createPhysicalGarmentOccurrenceIdentityToken({
        garmentKey: occurrence.garmentKey,
        generation: occurrence.occurrenceGeneration!,
      })
    : null;

const findExactOccurrence = ({
  activeOccurrences,
  garmentKey,
}: {
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  garmentKey: string;
}): PhysicalGarmentOccurrence | null => {
  const matches = activeOccurrences.filter(
    (occurrence) => occurrence.garmentKey === garmentKey,
  );
  return matches.length === 1 ? matches[0] : null;
};

export const beginDesignStyleUploadOperation = ({
  state,
  ledger,
  activeOccurrences,
  target,
  operationKind,
}: {
  state: DesignStyleUploadOperationState;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  operationKind: DesignStyleUploadOperationKind;
}): BeginDesignStyleUploadOperationResult => {
  if (!isOperationKind(operationKind)) {
    return {
      status: "rejected",
      reason: "invalid-operation-kind",
      state,
      ledger,
    };
  }
  const occurrence = findExactOccurrence({
    activeOccurrences,
    garmentKey: target.garmentKey,
  });
  if (!occurrence) {
    return { status: "rejected", reason: "missing-occurrence", state, ledger };
  }
  const occurrenceToken = occurrenceTokenFor(occurrence);
  if (!occurrenceToken || occurrenceToken !== target.occurrenceToken) {
    return {
      status: "rejected",
      reason: "stale-occurrence-token",
      state,
      ledger,
    };
  }
  const existingAssignment = ledger.assignmentsByGarmentKey[target.garmentKey];
  if (
    (operationKind === "assign" && existingAssignment) ||
    (operationKind === "replace" && !existingAssignment)
  ) {
    return {
      status: "rejected",
      reason: "invalid-operation-kind",
      state,
      ledger,
    };
  }
  if (!Number.isSafeInteger(state.nextOperationGeneration)) {
    return {
      status: "rejected",
      reason: "stale-operation-generation",
      state,
      ledger,
    };
  }

  const operationGeneration = state.nextOperationGeneration;
  const ticket = Object.freeze({
    garmentKey: target.garmentKey,
    occurrenceToken: target.occurrenceToken,
    expectedLedgerRevision: ledger.revision,
    operationGeneration,
    operationKind,
  });
  const nextState = createState(operationGeneration + 1, {
    ...state.currentOperationByGarmentKey,
    [target.garmentKey]: { occurrenceToken, operationGeneration },
  });
  return { status: "begun", ticket, state: nextState, ledger };
};

export const validateDesignStyleUploadOperationCallback = ({
  state,
  ticket,
  ledger,
  activeOccurrences,
  callbackTarget,
  callbackOperationKind,
}: {
  state: DesignStyleUploadOperationState;
  ticket: DesignStyleUploadOperationTicket;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  callbackTarget: GarmentDesignStyleAssignmentTarget;
  callbackOperationKind: DesignStyleUploadOperationKind;
}): ValidateDesignStyleUploadOperationResult => {
  if (
    !isOperationKind(callbackOperationKind) ||
    callbackOperationKind !== ticket.operationKind
  ) {
    return { status: "rejected", reason: "invalid-operation-kind" };
  }
  if (
    callbackTarget.garmentKey !== ticket.garmentKey ||
    callbackTarget.occurrenceToken !== ticket.occurrenceToken
  ) {
    return { status: "rejected", reason: "wrong-target" };
  }
  const occurrence = findExactOccurrence({
    activeOccurrences,
    garmentKey: ticket.garmentKey,
  });
  if (!occurrence) {
    return { status: "rejected", reason: "missing-occurrence" };
  }
  const currentOccurrenceToken = occurrenceTokenFor(occurrence);
  if (
    !currentOccurrenceToken ||
    currentOccurrenceToken !== ticket.occurrenceToken
  ) {
    return { status: "rejected", reason: "stale-occurrence-token" };
  }
  if (ledger.revision !== ticket.expectedLedgerRevision) {
    return { status: "rejected", reason: "stale-ledger-revision" };
  }
  const currentOperation =
    state.currentOperationByGarmentKey[ticket.garmentKey];
  if (
    !currentOperation ||
    currentOperation.occurrenceToken !== ticket.occurrenceToken ||
    currentOperation.operationGeneration !== ticket.operationGeneration
  ) {
    return { status: "rejected", reason: "stale-operation-generation" };
  }
  return { status: "accepted" };
};

const finishDesignStyleUploadOperation = ({
  state,
  ticket,
}: {
  state: DesignStyleUploadOperationState;
  ticket: DesignStyleUploadOperationTicket;
}): DesignStyleUploadOperationState => {
  const current = state.currentOperationByGarmentKey[ticket.garmentKey];
  if (
    !current ||
    current.occurrenceToken !== ticket.occurrenceToken ||
    current.operationGeneration !== ticket.operationGeneration
  ) {
    return state;
  }
  const {
    [ticket.garmentKey]: _finished,
    ...currentOperationByGarmentKey
  } = state.currentOperationByGarmentKey;
  return createState(state.nextOperationGeneration, currentOperationByGarmentKey);
};

export const applyDesignStyleUploadOperation = ({
  state,
  ticket,
  ledger,
  activeOccurrences,
  callbackTarget,
  callbackOperationKind,
  source,
}: {
  state: DesignStyleUploadOperationState;
  ticket: DesignStyleUploadOperationTicket;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  callbackTarget: GarmentDesignStyleAssignmentTarget;
  callbackOperationKind: DesignStyleUploadOperationKind;
  source: UploadedDesignStyleAssignmentInput;
}): ApplyDesignStyleUploadOperationResult => {
  const validation = validateDesignStyleUploadOperationCallback({
    state,
    ticket,
    ledger,
    activeOccurrences,
    callbackTarget,
    callbackOperationKind,
  });
  if (validation.status === "rejected") {
    return { ...validation, state, ledger };
  }
  const assignmentResult = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ticket.expectedLedgerRevision,
    activeOccurrences,
    target: {
      garmentKey: ticket.garmentKey,
      occurrenceToken: ticket.occurrenceToken,
    },
    source,
  });
  return {
    status: "accepted",
    state: finishDesignStyleUploadOperation({ state, ticket }),
    ledger: assignmentResult.ledger,
    assignmentResult,
  };
};

export const failDesignStyleUploadOperation = ({
  state,
  ticket,
  ledger,
  reason,
}: {
  state: DesignStyleUploadOperationState;
  ticket: DesignStyleUploadOperationTicket;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  reason: DesignStyleUploadOperationFailureReason;
}): FailDesignStyleUploadOperationResult => ({
  status: "failed",
  reason,
  state: finishDesignStyleUploadOperation({ state, ticket }),
  ledger,
});
