import assert from "node:assert/strict";
import type { CanonicalPhysicalGarmentType } from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  assignUploadedDesignStyleToGarmentOccurrence,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import {
  beginDesignStyleUploadForActiveOccurrence,
  applyDesignStyleUploadForActiveOccurrence,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleUploadOperationState,
  failDesignStyleUploadOperation,
  type DesignStyleUploadOperationState,
  type DesignStyleUploadOperationTicket,
} from "./src/utils/designStyleUploadOperation";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  createUploadedDesignOperationCoordinator,
  runUploadedDesignOperation,
} from "./src/utils/uploadedDesignStep1";
import {
  competingDesignStyleUploadRejectionUi,
  FUTURE_DESIGN_STYLE_UPLOAD_BUSY_MESSAGE,
  FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE,
  isStaleUploadedDesignOperationResult,
  shouldAcceptInFlightDesignStyleUploadSuccess,
  shouldRejectCompetingDesignStyleUpload,
  shouldReleaseUploadedDesignOperationBusy,
  shouldRetireDesignStyleUploadTicketUi,
} from "./src/utils/designStyleUploadSingleFlight";

const occurrence = (
  garmentKey: string,
  garmentType: CanonicalPhysicalGarmentType,
  occurrenceGeneration: number,
): PhysicalGarmentOccurrence => ({
  garmentKey,
  garmentType,
  occurrenceGeneration,
  sourceRole: "main",
  fabricUnits: 1,
});

const targetFor = (
  value: PhysicalGarmentOccurrence,
): GarmentDesignStyleAssignmentTarget => ({
  garmentKey: value.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: value.garmentKey,
    generation: value.occurrenceGeneration!,
  }),
});

const uploadedSource = (suffix: string) => ({
  sourceKey: `uploaded:source-${suffix}`,
  uploadedSourceRef: `private-upload-reference-${suffix}`,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

type UploadUiEntry = {
  garmentKey: string;
  occurrenceToken: string;
  operationGeneration: number;
  status: "pending" | "success" | "error";
  message?: string;
};

type ParentBoundary = {
  coordinator: ReturnType<typeof createUploadedDesignOperationCoordinator>;
  pendingRef: { current: boolean };
  generationRef: { current: number | null };
  ticketState: DesignStyleUploadOperationState;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  tickets: DesignStyleUploadOperationTicket[];
  ui: Record<string, UploadUiEntry>;
  feedbackTarget: GarmentDesignStyleAssignmentTarget | null;
  identityKey: string;
  identityGeneration: number;
  runtimeGeneration: number;
  stepIsActive: boolean;
  occurrenceTargets: GarmentDesignStyleAssignmentTarget[];
  sourcesByUploadedSourceRef: Record<
    string,
    ReturnType<typeof uploadedSource>
  >;
};

const createBoundary = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
): ParentBoundary => ({
  coordinator: createUploadedDesignOperationCoordinator(),
  pendingRef: { current: false },
  generationRef: { current: null },
  ticketState: createDesignStyleUploadOperationState(),
  ledger,
  tickets: [],
  ui: {},
  feedbackTarget: null,
  identityKey: "guest-draft-1",
  identityGeneration: 1,
  runtimeGeneration: 1,
  stepIsActive: true,
  occurrenceTargets: [],
  sourcesByUploadedSourceRef: {},
});

const uploadedRefOf = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  garmentKey: string,
): string | undefined => {
  const assignment = ledger.assignmentsByGarmentKey[garmentKey];
  return assignment?.sourceKind === "uploaded"
    ? assignment.uploadedSourceRef
    : undefined;
};

const pendingTargetOf = (
  boundary: ParentBoundary,
): GarmentDesignStyleAssignmentTarget | null => {
  const pending = Object.values(boundary.ui).find(
    (entry) => entry.status === "pending",
  );
  return pending
    ? {
        garmentKey: pending.garmentKey,
        occurrenceToken: pending.occurrenceToken,
      }
    : null;
};

const handleParentUpload = async ({
  boundary,
  activeOccurrences,
  target,
  validate,
  execute,
}: {
  boundary: ParentBoundary;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  target: GarmentDesignStyleAssignmentTarget;
  validate: () => Promise<void>;
  execute: () => Promise<ReturnType<typeof uploadedSource>>;
}): Promise<
  | { status: "rejected-busy" }
  | { status: "rejected-begin"; reason: string }
  | Awaited<ReturnType<typeof runUploadedDesignOperation<ReturnType<typeof uploadedSource>>>>
> => {
  boundary.occurrenceTargets = activeOccurrences.map(targetFor);
  const captured = {
    identityKey: boundary.identityKey,
    identityGeneration: boundary.identityGeneration,
  };
  if (
    shouldRejectCompetingDesignStyleUpload({
      coordinatorHasActiveOperation: boundary.coordinator.hasActiveOperation(),
      localPending: boundary.pendingRef.current,
    })
  ) {
    const decision = competingDesignStyleUploadRejectionUi({
      initiatingTarget: target,
      pendingTarget: pendingTargetOf(boundary),
    });
    const existing = boundary.ui[target.garmentKey];
    if (decision.action === "surface-error" && existing?.status !== "pending") {
      boundary.ui[target.garmentKey] = {
        garmentKey: target.garmentKey,
        occurrenceToken: target.occurrenceToken,
        operationGeneration: existing?.occurrenceToken === target.occurrenceToken
          ? existing.operationGeneration
          : 0,
        status: "error",
        message: decision.message,
      };
    }
    return { status: "rejected-busy" };
  }

  boundary.pendingRef.current = true;
  const existingAssignment =
    boundary.ledger.assignmentsByGarmentKey[target.garmentKey];
  const started = beginDesignStyleUploadForActiveOccurrence({
    state: boundary.ticketState,
    ledger: boundary.ledger,
    activeOccurrences,
    activeTarget: target,
    operationKind: existingAssignment ? "replace" : "assign",
  });
  if (started.status === "rejected") {
    boundary.pendingRef.current = false;
    return { status: "rejected-begin", reason: started.reason };
  }
  boundary.ticketState = started.state;
  boundary.tickets.push(started.ticket);
  boundary.ui[target.garmentKey] = {
    garmentKey: started.ticket.garmentKey,
    occurrenceToken: started.ticket.occurrenceToken,
    operationGeneration: started.ticket.operationGeneration,
    status: "pending",
  };

  let begunGeneration: number | null = null;
  const outcome = await runUploadedDesignOperation({
    coordinator: boundary.coordinator,
    kind: "upload",
    onBegin: (operation) => {
      begunGeneration = operation.generation;
      boundary.generationRef.current = operation.generation;
      boundary.pendingRef.current = true;
    },
    validate,
    execute,
    onSuccess: (source) => {
      const ticketTarget = {
        garmentKey: started.ticket.garmentKey,
        occurrenceToken: started.ticket.occurrenceToken,
      };
      const ticketTargetStillCurrent = boundary.occurrenceTargets.some(
        (candidate) =>
          candidate.garmentKey === ticketTarget.garmentKey &&
          candidate.occurrenceToken === ticketTarget.occurrenceToken,
      );
      const acceptInFlight = shouldAcceptInFlightDesignStyleUploadSuccess({
        capturedIdentityKey: captured.identityKey,
        capturedIdentityGeneration: captured.identityGeneration,
        latestIdentityKey: boundary.identityKey,
        latestIdentityGeneration: boundary.identityGeneration,
        latestStepIsActive: boundary.stepIsActive,
        ticketTargetStillCurrent,
      });
      if (!acceptInFlight) {
        const failed = failDesignStyleUploadOperation({
          state: boundary.ticketState,
          ticket: started.ticket,
          ledger: boundary.ledger,
          reason: "external-operation-failed",
        });
        boundary.ticketState = failed.state;
        boundary.ui[target.garmentKey] = {
          ...boundary.ui[target.garmentKey],
          status: "error",
          message: FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE,
        };
        return;
      }
      const applied = applyDesignStyleUploadForActiveOccurrence({
        state: boundary.ticketState,
        ticket: started.ticket,
        ledger: boundary.ledger,
        activeOccurrences,
        activeTarget: ticketTarget,
        operationKind: started.ticket.operationKind,
        source,
      });
      if (applied.status !== "accepted") {
        const failed = failDesignStyleUploadOperation({
          state: boundary.ticketState,
          ticket: started.ticket,
          ledger: boundary.ledger,
          reason: "external-operation-failed",
        });
        boundary.ticketState = failed.state;
        boundary.ui[target.garmentKey] = {
          ...boundary.ui[target.garmentKey],
          status: "error",
          message: FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE,
        };
        return;
      }
      boundary.ticketState = applied.state;
      if (applied.assignmentResult.status !== "applied") {
        boundary.ui[target.garmentKey] = {
          ...boundary.ui[target.garmentKey],
          status: "error",
          message:
            "The uploaded design could not be assigned safely. Your previous selection is unchanged. Try again.",
        };
        return;
      }
      boundary.ledger = applied.ledger;
      boundary.feedbackTarget = target;
      boundary.sourcesByUploadedSourceRef[source.uploadedSourceRef] = source;
      boundary.ui[target.garmentKey] = {
        ...boundary.ui[target.garmentKey],
        status: "success",
      };
    },
    onError: () => {
      const failed = failDesignStyleUploadOperation({
        state: boundary.ticketState,
        ticket: started.ticket,
        ledger: boundary.ledger,
        reason: "upload-preparation-failed",
      });
      boundary.ticketState = failed.state;
      if (
        shouldRetireDesignStyleUploadTicketUi({
          ticket: started.ticket,
          currentUi: boundary.ui[target.garmentKey],
        })
      ) {
        boundary.ui[target.garmentKey] = {
          ...boundary.ui[target.garmentKey],
          status: "error",
          message: "The design could not be prepared. Your previous selection is unchanged. Try again.",
        };
      }
    },
    onFinish: (operation) => {
      if (
        shouldReleaseUploadedDesignOperationBusy({
          startedGeneration: operation.generation,
          currentGeneration: boundary.generationRef.current,
        })
      ) {
        boundary.pendingRef.current = false;
      }
    },
  });

  if (isStaleUploadedDesignOperationResult(outcome)) {
    const failed = failDesignStyleUploadOperation({
      state: boundary.ticketState,
      ticket: started.ticket,
      ledger: boundary.ledger,
      reason: "external-operation-failed",
    });
    boundary.ticketState = failed.state;
    if (
      shouldRetireDesignStyleUploadTicketUi({
        ticket: started.ticket,
        currentUi: boundary.ui[started.ticket.garmentKey],
      })
    ) {
      boundary.ui[started.ticket.garmentKey] = {
        ...boundary.ui[started.ticket.garmentKey],
        status: "error",
        message: FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE,
      };
    }
    if (
      shouldReleaseUploadedDesignOperationBusy({
        startedGeneration: begunGeneration,
        currentGeneration: boundary.generationRef.current,
      })
    ) {
      boundary.pendingRef.current = false;
    }
  }

  return outcome;
};

const shirt = occurrence("base:shirt:1", "shirt", 1);
const skirt = occurrence("base:skirt:1", "skirt", 2);
const shirtTwo = occurrence("base:shirt:2", "shirt", 3);
const shirtTarget = targetFor(shirt);
const skirtTarget = targetFor(skirt);
const shirtTwoTarget = targetFor(shirtTwo);
const twoGarments = [shirt, skirt];
const repeatedShirts = [shirt, shirtTwo];

{
  const coordinator = createUploadedDesignOperationCoordinator();
  assert.equal(coordinator.hasActiveOperation(), false);
  const operation = coordinator.begin("upload");
  assert.equal(coordinator.hasActiveOperation(), true);
  assert.equal(coordinator.finish(operation), true);
  assert.equal(coordinator.hasActiveOperation(), false);
}

{
  const coordinator = createUploadedDesignOperationCoordinator();
  coordinator.begin("upload");
  assert.equal(
    shouldRejectCompetingDesignStyleUpload({
      coordinatorHasActiveOperation: coordinator.hasActiveOperation(),
      localPending: false,
    }),
    true,
  );
  assert.equal(
    shouldRejectCompetingDesignStyleUpload({
      coordinatorHasActiveOperation: false,
      localPending: true,
    }),
    true,
  );
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  await Promise.resolve();
  assert.equal(boundary.coordinator.hasActiveOperation(), true);
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");

  const second = await handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: skirtTarget,
    validate: async () => undefined,
    execute: async () => uploadedSource("b"),
  });
  assert.equal(second.status, "rejected-busy");
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  assert.equal(boundary.ui[skirt.garmentKey]?.status, "error");
  assert.equal(
    boundary.ui[skirt.garmentKey]?.message,
    FUTURE_DESIGN_STYLE_UPLOAD_BUSY_MESSAGE,
  );
  assert.equal(boundary.feedbackTarget, null);
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    undefined,
  );
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[skirt.garmentKey],
    undefined,
  );

  firstExecute.resolve(uploadedSource("a"));
  const firstOutcome = await first;
  assert.equal(firstOutcome.status, "succeeded");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "success");
  assert.equal(boundary.pendingRef.current, false);
  assert.equal(boundary.coordinator.hasActiveOperation(), false);
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  const second = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: skirtTarget,
    validate: async () => undefined,
    execute: async () => uploadedSource("rapid-b"),
  });
  const secondOutcome = await second;
  assert.equal(secondOutcome.status, "rejected-busy");
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  assert.equal(
    boundary.ticketState.currentOperationByGarmentKey[skirt.garmentKey],
    undefined,
  );
  firstExecute.resolve(uploadedSource("rapid-a"));
  await first;
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  const second = await handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: async () => uploadedSource("same-card-b"),
  });
  assert.equal(second.status, "rejected-busy");
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  assert.notEqual(boundary.ui[shirt.garmentKey]?.message, FUTURE_DESIGN_STYLE_UPLOAD_BUSY_MESSAGE);
  firstExecute.resolve(uploadedSource("same-card-a"));
  await first;
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: repeatedShirts,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  await Promise.resolve();
  const second = await handleParentUpload({
    boundary,
    activeOccurrences: repeatedShirts,
    target: shirtTwoTarget,
    validate: async () => undefined,
    execute: async () => uploadedSource("shirt-2"),
  });
  assert.equal(second.status, "rejected-busy");
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.tickets[0].occurrenceToken, shirtTarget.occurrenceToken);
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  assert.equal(boundary.ui[shirtTwo.garmentKey]?.status, "error");
  firstExecute.resolve(uploadedSource("shirt-1"));
  await first;
}

{
  const assigned = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    expectedLedgerRevision: 0,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    source: uploadedSource("kept-a"),
  });
  assert.equal(assigned.status, "applied");
  const boundary = createBoundary(assigned.ledger);
  const previousShirt =
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey];
  const result = await handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: skirtTarget,
    validate: async () => {
      throw new Error("UNSUPPORTED_FILE_TYPE");
    },
    execute: async () => uploadedSource("invalid-b"),
  });
  assert.equal(result.status, "failed");
  assert.equal(boundary.tickets.length, 1);
  assert.equal(boundary.tickets[0].occurrenceToken, skirtTarget.occurrenceToken);
  assert.equal(boundary.ui[skirt.garmentKey]?.status, "error");
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    previousShirt,
  );
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[skirt.garmentKey],
    undefined,
  );
  assert.equal(boundary.pendingRef.current, false);
  assert.equal(boundary.coordinator.hasActiveOperation(), false);
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  await Promise.resolve();
  const ticketA = boundary.tickets[0];
  const begunB = beginDesignStyleUploadForActiveOccurrence({
    state: boundary.ticketState,
    ledger: boundary.ledger,
    activeOccurrences: twoGarments,
    activeTarget: skirtTarget,
    operationKind: "assign",
  });
  assert.equal(begunB.status, "begun");
  if (begunB.status !== "begun") throw new Error("NEWER_TICKET_NOT_BEGUN");
  boundary.ticketState = begunB.state;
  boundary.tickets.push(begunB.ticket);
  boundary.ui[skirt.garmentKey] = {
    garmentKey: begunB.ticket.garmentKey,
    occurrenceToken: begunB.ticket.occurrenceToken,
    operationGeneration: begunB.ticket.operationGeneration,
    status: "pending",
  };
  boundary.coordinator.begin("upload");
  firstExecute.resolve(uploadedSource("stale-a"));
  const firstOutcome = await first;
  assert.equal(firstOutcome.status, "stale");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "error");
  assert.match(
    String(boundary.ui[shirt.garmentKey]?.message),
    /no longer in progress|unchanged/i,
  );
  assert.equal(boundary.ui[skirt.garmentKey]?.status, "pending");
  assert.equal(
    boundary.ticketState.currentOperationByGarmentKey[shirt.garmentKey],
    undefined,
  );
  assert.deepEqual(
    boundary.ticketState.currentOperationByGarmentKey[skirt.garmentKey],
    {
      occurrenceToken: begunB.ticket.occurrenceToken,
      operationGeneration: begunB.ticket.operationGeneration,
    },
  );
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    undefined,
  );
  assert.notEqual(ticketA.operationGeneration, begunB.ticket.operationGeneration);
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  await Promise.resolve();
  const ticketA = boundary.tickets[0];
  const begunB = beginDesignStyleUploadForActiveOccurrence({
    state: boundary.ticketState,
    ledger: boundary.ledger,
    activeOccurrences: twoGarments,
    activeTarget: shirtTarget,
    operationKind: "assign",
  });
  assert.equal(begunB.status, "begun");
  if (begunB.status !== "begun") throw new Error("SAME_GARMENT_NEWER_TICKET_NOT_BEGUN");
  boundary.ticketState = begunB.state;
  boundary.tickets.push(begunB.ticket);
  boundary.ui[shirt.garmentKey] = {
    garmentKey: begunB.ticket.garmentKey,
    occurrenceToken: begunB.ticket.occurrenceToken,
    operationGeneration: begunB.ticket.operationGeneration,
    status: "pending",
  };
  boundary.coordinator.begin("upload");
  firstExecute.resolve(uploadedSource("old-cleanup"));
  const firstOutcome = await first;
  assert.equal(firstOutcome.status, "stale");
  assert.equal(
    shouldRetireDesignStyleUploadTicketUi({
      ticket: ticketA,
      currentUi: boundary.ui[shirt.garmentKey],
    }),
    false,
  );
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  assert.equal(
    boundary.ui[shirt.garmentKey]?.operationGeneration,
    begunB.ticket.operationGeneration,
  );
  assert.deepEqual(
    boundary.ticketState.currentOperationByGarmentKey[shirt.garmentKey],
    {
      occurrenceToken: begunB.ticket.occurrenceToken,
      operationGeneration: begunB.ticket.operationGeneration,
    },
  );
}

{
  const boundary = createBoundary(
    createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  );
  const firstExecute = deferred<ReturnType<typeof uploadedSource>>();
  const first = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => firstExecute.promise,
  });
  await Promise.resolve();
  const steal = boundary.coordinator.begin("upload");
  firstExecute.resolve(uploadedSource("terminated-a"));
  const terminated = await first;
  assert.equal(terminated.status, "stale");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "error");
  assert.equal(boundary.pendingRef.current, false);
  assert.equal(boundary.coordinator.hasActiveOperation(), true);
  assert.equal(boundary.coordinator.finish(steal), true);
  assert.equal(boundary.coordinator.hasActiveOperation(), false);

  const retry = await handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: async () => uploadedSource("retry-a"),
  });
  assert.equal(retry.status, "succeeded");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "success");
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey]?.sourceKind,
    "uploaded",
  );
  assert.equal(boundary.pendingRef.current, false);
  assert.equal(boundary.feedbackTarget?.occurrenceToken, shirtTarget.occurrenceToken);
}

{
  const currentAuthority = {
    capturedIdentityKey: "guest-draft-1",
    capturedIdentityGeneration: 1,
    latestIdentityKey: "guest-draft-1",
    latestIdentityGeneration: 1,
    latestStepIsActive: true,
    ticketTargetStillCurrent: true,
  };
  assert.equal(
    shouldAcceptInFlightDesignStyleUploadSuccess(currentAuthority),
    true,
  );
  assert.equal(
    shouldAcceptInFlightDesignStyleUploadSuccess({
      ...currentAuthority,
      latestIdentityGeneration: 2,
    }),
    false,
  );
  assert.equal(
    shouldAcceptInFlightDesignStyleUploadSuccess({
      ...currentAuthority,
      latestIdentityKey: "other-draft",
    }),
    false,
  );
  assert.equal(
    shouldAcceptInFlightDesignStyleUploadSuccess({
      ...currentAuthority,
      latestStepIsActive: false,
    }),
    false,
  );
  assert.equal(
    shouldAcceptInFlightDesignStyleUploadSuccess({
      ...currentAuthority,
      ticketTargetStillCurrent: false,
    }),
    false,
  );
}

{
  const assignedSkirt = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    expectedLedgerRevision: 0,
    activeOccurrences: twoGarments,
    target: skirtTarget,
    source: uploadedSource("b"),
  });
  assert.equal(assignedSkirt.status, "applied");
  const boundary = createBoundary(assignedSkirt.ledger);
  boundary.sourcesByUploadedSourceRef["private-upload-reference-b"] =
    uploadedSource("b");
  const capturedRuntimeGeneration = boundary.runtimeGeneration;
  const shirtExecute = deferred<ReturnType<typeof uploadedSource>>();
  const shirtUpload = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => shirtExecute.promise,
  });
  await Promise.resolve();
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "pending");
  boundary.runtimeGeneration += 1;
  assert.notEqual(boundary.runtimeGeneration, capturedRuntimeGeneration);
  shirtExecute.resolve(uploadedSource("a"));
  const shirtOutcome = await shirtUpload;
  assert.equal(shirtOutcome.status, "succeeded");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "success");
  assert.equal(
    uploadedRefOf(boundary.ledger, shirt.garmentKey),
    "private-upload-reference-a",
  );
  assert.equal(
    uploadedRefOf(boundary.ledger, skirt.garmentKey),
    "private-upload-reference-b",
  );
  assert.deepEqual(Object.keys(boundary.sourcesByUploadedSourceRef).sort(), [
    "private-upload-reference-a",
    "private-upload-reference-b",
  ]);
  assert.equal(boundary.feedbackTarget?.occurrenceToken, shirtTarget.occurrenceToken);
}

{
  const assignedSkirt = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
    expectedLedgerRevision: 0,
    activeOccurrences: twoGarments,
    target: skirtTarget,
    source: uploadedSource("kept-b"),
  });
  assert.equal(assignedSkirt.status, "applied");
  const boundary = createBoundary(assignedSkirt.ledger);
  const shirtExecute = deferred<ReturnType<typeof uploadedSource>>();
  const shirtUpload = handleParentUpload({
    boundary,
    activeOccurrences: twoGarments,
    target: shirtTarget,
    validate: async () => undefined,
    execute: () => shirtExecute.promise,
  });
  await Promise.resolve();
  boundary.identityGeneration += 1;
  shirtExecute.resolve(uploadedSource("lost-a"));
  const shirtOutcome = await shirtUpload;
  assert.equal(shirtOutcome.status, "succeeded");
  assert.equal(boundary.ui[shirt.garmentKey]?.status, "error");
  assert.equal(
    boundary.ui[shirt.garmentKey]?.message,
    FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE,
  );
  assert.equal(
    boundary.ledger.assignmentsByGarmentKey[shirt.garmentKey],
    undefined,
  );
  assert.equal(
    uploadedRefOf(boundary.ledger, skirt.garmentKey),
    "private-upload-reference-kept-b",
  );
}

console.log(
  "PASS: parent-boundary single-flight Design Style upload reject, stale retirement, retry, generation guard",
);
