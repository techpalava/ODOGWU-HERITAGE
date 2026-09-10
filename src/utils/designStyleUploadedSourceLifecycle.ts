import type { PhysicalGarmentOccurrence } from "./designSourceState";
import {
  reconcileGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./garmentScopedDesignStyleAssignment";

export type UploadedSourceReferenceClassification =
  | "unreferenced"
  | "single-reference"
  | "multi-reference";

export interface UploadedSourceOccurrenceReference
  extends GarmentDesignStyleAssignmentTarget {}

export interface UploadedSourceReferenceEntry {
  /** The opaque Task 5A assignment identity. It must not be derived from metadata. */
  readonly sourceRef: string;
  readonly references: readonly UploadedSourceOccurrenceReference[];
  readonly referenceCount: number;
  readonly classification: Exclude<
    UploadedSourceReferenceClassification,
    "unreferenced"
  >;
}

export interface ExcludedUploadedSourceAssignment {
  readonly sourceRef: string;
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly reason: "ORPHANED" | "STALE_OCCURRENCE_TOKEN";
}

export type UploadedSourceReferenceIndexResult =
  | {
      readonly status: "ready";
      readonly entriesBySourceRef: Readonly<
        Record<string, UploadedSourceReferenceEntry>
      >;
      readonly excludedAssignments: readonly ExcludedUploadedSourceAssignment[];
    }
  | {
      readonly status: "blocked";
      readonly reason: "INVALID_LEDGER" | "INVALID_OCCURRENCE_AUTHORITY";
    };

const classifyReferenceCount = (
  referenceCount: number,
): UploadedSourceReferenceClassification =>
  referenceCount === 0
    ? "unreferenced"
    : referenceCount === 1
      ? "single-reference"
      : "multi-reference";

/**
 * Counts only uploaded assignments that still match the exact active Task 5A
 * occurrence identity. Equal metadata never joins two canonical sources.
 */
export const buildUploadedSourceReferenceIndex = ({
  ledger,
  activeOccurrences,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
}): UploadedSourceReferenceIndexResult => {
  const reconciliation = reconcileGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences,
  });
  if (reconciliation.status === "blocked") {
    return { status: "blocked", reason: reconciliation.reason };
  }

  const referencesBySourceRef = new Map<
    string,
    UploadedSourceOccurrenceReference[]
  >();
  Object.values(reconciliation.ledger.assignmentsByGarmentKey).forEach(
    (assignment) => {
      if (assignment.sourceKind !== "uploaded") return;
      const references =
        referencesBySourceRef.get(assignment.uploadedSourceRef) ?? [];
      references.push({
        garmentKey: assignment.garmentKey,
        occurrenceToken: assignment.occurrenceToken,
      });
      referencesBySourceRef.set(assignment.uploadedSourceRef, references);
    },
  );

  const entriesBySourceRef = Object.fromEntries(
    [...referencesBySourceRef.entries()].map(([sourceRef, references]) => [
      sourceRef,
      {
        sourceRef,
        references,
        referenceCount: references.length,
        classification: classifyReferenceCount(
          references.length,
        ) as UploadedSourceReferenceEntry["classification"],
      },
    ]),
  );
  const excludedAssignments = reconciliation.removed.flatMap((removed) =>
    removed.assignment.sourceKind === "uploaded"
      ? [
          {
            sourceRef: removed.assignment.uploadedSourceRef,
            garmentKey: removed.assignment.garmentKey,
            occurrenceToken: removed.assignment.occurrenceToken,
            reason: removed.reason,
          },
        ]
      : [],
  );

  return { status: "ready", entriesBySourceRef, excludedAssignments };
};

export const getUploadedSourceReferenceState = ({
  index,
  sourceRef,
}: {
  index: UploadedSourceReferenceIndexResult;
  sourceRef: string;
}):
  | {
      readonly status: "ready";
      readonly sourceRef: string;
      readonly references: readonly UploadedSourceOccurrenceReference[];
      readonly referenceCount: number;
      readonly classification: UploadedSourceReferenceClassification;
    }
  | { readonly status: "blocked"; readonly reason: "REFERENCE_AUTHORITY_INCOMPLETE" } => {
  if (index.status === "blocked") {
    return { status: "blocked", reason: "REFERENCE_AUTHORITY_INCOMPLETE" };
  }
  const entry = index.entriesBySourceRef[sourceRef];
  return {
    status: "ready",
    sourceRef,
    references: entry?.references ?? [],
    referenceCount: entry?.referenceCount ?? 0,
    classification: entry?.classification ?? "unreferenced",
  };
};

export type UploadedSourceDetachProjection =
  | {
      readonly status: "detachable";
      readonly sourceRef: string;
      readonly referenceCountBefore: number;
      readonly referenceCountAfter: number;
      readonly classificationAfter: UploadedSourceReferenceClassification;
      /** Detaching never authorizes physical deletion. */
      readonly physicalDeletionAuthorized: false;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "REFERENCE_AUTHORITY_INCOMPLETE"
        | "OCCURRENCE_REFERENCE_NOT_FOUND";
    };

export const projectUploadedSourceOccurrenceDetach = ({
  index,
  sourceRef,
  target,
}: {
  index: UploadedSourceReferenceIndexResult;
  sourceRef: string;
  target: GarmentDesignStyleAssignmentTarget;
}): UploadedSourceDetachProjection => {
  const state = getUploadedSourceReferenceState({ index, sourceRef });
  if (state.status === "blocked") {
    return { status: "rejected", reason: state.reason };
  }
  const exactReferenceExists = state.references.some(
    (reference) =>
      reference.garmentKey === target.garmentKey &&
      reference.occurrenceToken === target.occurrenceToken,
  );
  if (!exactReferenceExists) {
    return { status: "rejected", reason: "OCCURRENCE_REFERENCE_NOT_FOUND" };
  }
  const referenceCountAfter = state.referenceCount - 1;
  return {
    status: "detachable",
    sourceRef,
    referenceCountBefore: state.referenceCount,
    referenceCountAfter,
    classificationAfter: classifyReferenceCount(referenceCountAfter),
    physicalDeletionAuthorized: false,
  };
};

export interface UploadedSourceDeletionProof {
  readonly referenceAuthorityStatus?: "complete" | "incomplete";
  readonly currentDraftReferenceStatus?:
    | "not-referenced"
    | "referenced"
    | "unknown";
  readonly ownershipStatus?: "settled" | "unresolved" | "unknown";
  readonly ownershipTransferStatus?: "settled" | "pending" | "unknown";
  readonly confirmationStatus?: "settled" | "unresolved" | "unknown";
  readonly historySafetyStatus?: "safe-to-delete" | "retain" | "unknown";
}

export type UploadedSourceRetentionReason =
  | "ACTIVE_OCCURRENCE_REFERENCE"
  | "REFERENCE_AUTHORITY_INCOMPLETE"
  | "CURRENT_DRAFT_REFERENCE"
  | "CURRENT_DRAFT_AUTHORITY_INCOMPLETE"
  | "OWNERSHIP_UNRESOLVED"
  | "OWNERSHIP_TRANSFER_UNRESOLVED"
  | "CONFIRMATION_UNRESOLVED"
  | "HISTORY_REQUIRES_RETENTION"
  | "HISTORY_SAFETY_UNKNOWN";

export type UploadedSourceDeletionEligibility =
  | {
      readonly status: "retain";
      readonly sourceRef: string;
      readonly referenceCount: number | null;
      readonly reasons: readonly UploadedSourceRetentionReason[];
      readonly deletionEligible: false;
    }
  | {
      readonly status: "eligible-for-deletion";
      readonly sourceRef: string;
      readonly referenceCount: 0;
      readonly reasons: readonly [];
      readonly deletionEligible: true;
    };

/** Deletion is eligible only when every independent authority is explicit. */
export const evaluateUploadedSourceDeletionEligibility = ({
  index,
  sourceRef,
  proof,
}: {
  index: UploadedSourceReferenceIndexResult;
  sourceRef: string;
  proof: UploadedSourceDeletionProof;
}): UploadedSourceDeletionEligibility => {
  const referenceState = getUploadedSourceReferenceState({ index, sourceRef });
  if (referenceState.status === "blocked") {
    return {
      status: "retain",
      sourceRef,
      referenceCount: null,
      reasons: ["REFERENCE_AUTHORITY_INCOMPLETE"],
      deletionEligible: false,
    };
  }

  const reasons: UploadedSourceRetentionReason[] = [];
  if (referenceState.referenceCount > 0) {
    reasons.push("ACTIVE_OCCURRENCE_REFERENCE");
  }
  if (proof.referenceAuthorityStatus !== "complete") {
    reasons.push("REFERENCE_AUTHORITY_INCOMPLETE");
  }
  if (proof.currentDraftReferenceStatus === "referenced") {
    reasons.push("CURRENT_DRAFT_REFERENCE");
  } else if (proof.currentDraftReferenceStatus !== "not-referenced") {
    reasons.push("CURRENT_DRAFT_AUTHORITY_INCOMPLETE");
  }
  if (proof.ownershipStatus !== "settled") {
    reasons.push("OWNERSHIP_UNRESOLVED");
  }
  if (proof.ownershipTransferStatus !== "settled") {
    reasons.push("OWNERSHIP_TRANSFER_UNRESOLVED");
  }
  if (proof.confirmationStatus !== "settled") {
    reasons.push("CONFIRMATION_UNRESOLVED");
  }
  if (proof.historySafetyStatus === "retain") {
    reasons.push("HISTORY_REQUIRES_RETENTION");
  } else if (proof.historySafetyStatus !== "safe-to-delete") {
    reasons.push("HISTORY_SAFETY_UNKNOWN");
  }

  if (reasons.length > 0) {
    return {
      status: "retain",
      sourceRef,
      referenceCount: referenceState.referenceCount,
      reasons,
      deletionEligible: false,
    };
  }
  return {
    status: "eligible-for-deletion",
    sourceRef,
    referenceCount: 0,
    reasons: [],
    deletionEligible: true,
  };
};

export type UploadedDesignArtifactLifecycleKind =
  | "canonical-source"
  | "abandoned-precanonical-artifact";

export const getUploadedDesignArtifactCleanupScope = (
  kind: UploadedDesignArtifactLifecycleKind,
): "canonical-source-lifecycle" | "temporary-artifact-cleanup-only" =>
  kind === "canonical-source"
    ? "canonical-source-lifecycle"
    : "temporary-artifact-cleanup-only";
