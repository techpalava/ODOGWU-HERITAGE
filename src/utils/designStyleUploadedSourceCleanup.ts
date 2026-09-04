import {
  getPersistedDesignStyleEnvelopeFingerprint,
  proveUploadedSourceAbsentFromPersistedDesignStyle,
  type DesignStylePersistenceAcknowledgement,
} from "./designStyleDraftPersistence";
import type { PhysicalGarmentOccurrence } from "./designSourceState";
import {
  buildUploadedSourceReferenceIndex,
  evaluateUploadedSourceDeletionEligibility,
  type UploadedSourceDeletionProof,
} from "./designStyleUploadedSourceLifecycle";
import type { GarmentScopedDesignStyleAssignmentLedgerV2 } from "./garmentScopedDesignStyleAssignment";

export interface UploadedSourceCleanupCandidate {
  readonly sourceRef: string;
  readonly reason: "detach" | "replacement";
  readonly draftIdentity: string;
  readonly expectedLedgerRevision: number;
  readonly expectedFingerprint: string;
  readonly expectedSaveGeneration: number;
  readonly expectedIdentityGeneration: number;
  /** Transient copy of the exact post-mutation ledger whose persistence is required. */
  readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
}

export type UploadedSourceCleanupResult =
  | { readonly status: "deleted"; readonly sourceRef: string }
  | { readonly status: "retained-source-still-present"; readonly sourceRef: string }
  | { readonly status: "retained-persistence-unproven"; readonly sourceRef: string }
  | { readonly status: "retained-stale-persistence-proof"; readonly sourceRef: string }
  | { readonly status: "retained-referenced"; readonly sourceRef: string }
  | { readonly status: "retained-history-unknown"; readonly sourceRef: string }
  | { readonly status: "retained-ownership-unresolved"; readonly sourceRef: string }
  | { readonly status: "retained-lifecycle-incomplete"; readonly sourceRef: string }
  | { readonly status: "deletion-failed"; readonly sourceRef: string; readonly error: unknown };

export const createUploadedSourceCleanupCandidate = ({
  sourceRef,
  reason,
  draftIdentity,
  expectedSaveGeneration,
  expectedIdentityGeneration,
  ledger,
}: {
  sourceRef: string;
  reason: "detach" | "replacement";
  draftIdentity: string;
  expectedSaveGeneration: number;
  expectedIdentityGeneration: number;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
}): UploadedSourceCleanupCandidate | null => {
  const expectedFingerprint = getPersistedDesignStyleEnvelopeFingerprint({
    schemaVersion: 2,
    ledger,
  });
  if (!expectedFingerprint || !sourceRef || !draftIdentity) return null;
  return {
    sourceRef,
    reason,
    draftIdentity,
    expectedLedgerRevision: ledger.revision,
    expectedFingerprint,
    expectedSaveGeneration,
    expectedIdentityGeneration,
    ledger,
  };
};

const retentionForProof = (
  status: ReturnType<typeof proveUploadedSourceAbsentFromPersistedDesignStyle>["status"],
  sourceRef: string,
): UploadedSourceCleanupResult => {
  if (status === "source-still-present") {
    return { status: "retained-source-still-present", sourceRef };
  }
  if (status === "stale-acknowledgement" || status === "generation-mismatch") {
    return { status: "retained-stale-persistence-proof", sourceRef };
  }
  return { status: "retained-persistence-unproven", sourceRef };
};

export const coordinateUploadedSourceCleanup = async ({
  candidate,
  acknowledgement,
  currentSaveGeneration,
  currentIdentityGeneration,
  activeOccurrences,
  lifecycleProof,
  deleteCanonicalSource,
}: {
  candidate: UploadedSourceCleanupCandidate;
  acknowledgement: DesignStylePersistenceAcknowledgement | null;
  currentSaveGeneration: number;
  currentIdentityGeneration: number;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  lifecycleProof: UploadedSourceDeletionProof;
  deleteCanonicalSource: () => Promise<void>;
}): Promise<UploadedSourceCleanupResult> => {
  const persistence = proveUploadedSourceAbsentFromPersistedDesignStyle({
    acknowledgement,
    expectedDraftIdentity: candidate.draftIdentity,
    expectedLedgerRevision: candidate.expectedLedgerRevision,
    expectedFingerprint: candidate.expectedFingerprint,
    expectedSaveGeneration: candidate.expectedSaveGeneration,
    expectedIdentityGeneration: candidate.expectedIdentityGeneration,
    currentSaveGeneration,
    currentIdentityGeneration,
    uploadedSourceRef: candidate.sourceRef,
  });
  if (persistence.status !== "proven-absent") {
    return retentionForProof(persistence.status, candidate.sourceRef);
  }

  const index = buildUploadedSourceReferenceIndex({
    ledger: candidate.ledger,
    activeOccurrences,
  });
  const lifecycle = evaluateUploadedSourceDeletionEligibility({
    index,
    sourceRef: candidate.sourceRef,
    proof: lifecycleProof,
  });
  if (lifecycle.status === "retain") {
    if (lifecycle.reasons.includes("ACTIVE_OCCURRENCE_REFERENCE")) {
      return { status: "retained-referenced", sourceRef: candidate.sourceRef };
    }
    if (lifecycle.reasons.includes("HISTORY_SAFETY_UNKNOWN")) {
      return { status: "retained-history-unknown", sourceRef: candidate.sourceRef };
    }
    if (
      lifecycle.reasons.includes("OWNERSHIP_UNRESOLVED") ||
      lifecycle.reasons.includes("OWNERSHIP_TRANSFER_UNRESOLVED")
    ) {
      return {
        status: "retained-ownership-unresolved",
        sourceRef: candidate.sourceRef,
      };
    }
    return {
      status: "retained-lifecycle-incomplete",
      sourceRef: candidate.sourceRef,
    };
  }
  try {
    await deleteCanonicalSource();
    return { status: "deleted", sourceRef: candidate.sourceRef };
  } catch (error) {
    return { status: "deletion-failed", sourceRef: candidate.sourceRef, error };
  }
};
