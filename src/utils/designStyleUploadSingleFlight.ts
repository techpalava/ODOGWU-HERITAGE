import type { DesignStyleUploadOperationTicket } from "./designStyleUploadOperation";
import type { GarmentDesignStyleAssignmentTarget } from "./garmentScopedDesignStyleAssignment";
import type { UploadedDesignOperationResult } from "./uploadedDesignStep1";

export const FUTURE_DESIGN_STYLE_UPLOAD_BUSY_MESSAGE =
  "Another design is still being prepared. Wait until it finishes, then try this garment again.";

export const FUTURE_DESIGN_STYLE_UPLOAD_STALE_MESSAGE =
  "The previous upload is no longer in progress. Your previous selection is unchanged. Try again.";

export const shouldRejectCompetingDesignStyleUpload = ({
  coordinatorHasActiveOperation,
  localPending,
}: {
  coordinatorHasActiveOperation: boolean;
  localPending: boolean;
}): boolean => coordinatorHasActiveOperation || localPending;

export type CompetingDesignStyleUploadRejectionUi =
  | { readonly action: "ignore" }
  | { readonly action: "surface-error"; readonly message: string };

export const competingDesignStyleUploadRejectionUi = ({
  initiatingTarget,
  pendingTarget,
}: {
  initiatingTarget: GarmentDesignStyleAssignmentTarget;
  pendingTarget: GarmentDesignStyleAssignmentTarget | null;
}): CompetingDesignStyleUploadRejectionUi => {
  if (
    pendingTarget &&
    pendingTarget.garmentKey === initiatingTarget.garmentKey &&
    pendingTarget.occurrenceToken === initiatingTarget.occurrenceToken
  ) {
    return { action: "ignore" };
  }
  return {
    action: "surface-error",
    message: FUTURE_DESIGN_STYLE_UPLOAD_BUSY_MESSAGE,
  };
};

export const isStaleUploadedDesignOperationResult = <T,>(
  result: UploadedDesignOperationResult<T>,
): boolean => result.status === "stale";

export const shouldRetireDesignStyleUploadTicketUi = ({
  ticket,
  currentUi,
}: {
  ticket: DesignStyleUploadOperationTicket;
  currentUi:
    | {
        readonly occurrenceToken: string;
        readonly operationGeneration: number;
      }
    | null
    | undefined;
}): boolean =>
  Boolean(
    currentUi &&
      currentUi.occurrenceToken === ticket.occurrenceToken &&
      currentUi.operationGeneration === ticket.operationGeneration,
  );

export const shouldReleaseUploadedDesignOperationBusy = ({
  startedGeneration,
  currentGeneration,
}: {
  startedGeneration: number | null;
  currentGeneration: number | null;
}): boolean =>
  startedGeneration != null && startedGeneration === currentGeneration;

/**
 * In-flight per-garment upload success is still current when draft identity,
 * step, and the frozen ticket target remain. Hydration republish
 * (`runtimeGeneration`) is not a ticket/ledger/occurrence safety check.
 */
export const shouldAcceptInFlightDesignStyleUploadSuccess = ({
  capturedIdentityKey,
  capturedIdentityGeneration,
  latestIdentityKey,
  latestIdentityGeneration,
  latestStepIsActive,
  ticketTargetStillCurrent,
}: {
  capturedIdentityKey: string;
  capturedIdentityGeneration: number;
  latestIdentityKey: string | null | undefined;
  latestIdentityGeneration: number | null | undefined;
  latestStepIsActive: boolean | null | undefined;
  ticketTargetStillCurrent: boolean;
}): boolean =>
  Boolean(
    latestIdentityKey &&
      latestIdentityKey === capturedIdentityKey &&
      latestIdentityGeneration === capturedIdentityGeneration &&
      latestStepIsActive &&
      ticketTargetStillCurrent,
  );
