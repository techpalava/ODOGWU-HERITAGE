import type { GarmentScopedDesignStyleAssignmentLedgerV2 } from "./garmentScopedDesignStyleAssignment";
import type {
  DesignStyleStepCatalogMutationRequest,
  DesignStyleStepBatchMutationResult,
} from "./designStyleStepRuntime";

/**
 * Presentation-only: identify the latest exact occurrence whose catalogue
 * assignment actually changed in an already-authoritative successful batch.
 * This intentionally reads the published result; it never alters the ledger.
 */
export const resolveLatestSuccessfulDesignStyleFeedbackTarget = ({
  result,
  requests,
  previousLedger,
}: {
  result: DesignStyleStepBatchMutationResult;
  requests: readonly DesignStyleStepCatalogMutationRequest[];
  previousLedger: GarmentScopedDesignStyleAssignmentLedgerV2;
}): DesignStyleStepCatalogMutationRequest["target"] | null => {
  if (result.status !== "applied") return null;

  for (const request of [...requests].reverse()) {
    const previous = previousLedger.assignmentsByGarmentKey[
      request.target.garmentKey
    ];
    const assigned = result.ledger.assignmentsByGarmentKey[
      request.target.garmentKey
    ];
    const nowUsesRequestedStyle =
      assigned?.sourceKind === "catalog" &&
      assigned.catalogStyleId === request.styleId &&
      assigned.occurrenceToken === request.target.occurrenceToken;
    const alreadyUsedRequestedStyle =
      previous?.sourceKind === "catalog" &&
      previous.catalogStyleId === request.styleId &&
      previous.occurrenceToken === request.target.occurrenceToken;

    if (nowUsesRequestedStyle && !alreadyUsedRequestedStyle) {
      return request.target;
    }
  }

  return null;
};
