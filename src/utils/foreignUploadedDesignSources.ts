import type { GuestDesignDraft } from "../types";
import {
  DESIGN_STYLE_DRAFT_FIELD,
  inspectPersistedDesignStyleDraft,
  serializePersistedDesignStyleDraftEnvelope,
} from "./designStyleDraftPersistence";
import { isValidUploadedDesignDraftSource } from "./designSourceState";
import type { GarmentDesignStyleAssignmentV2 } from "./garmentScopedDesignStyleAssignment";
import {
  inspectUploadedDesignSourceRegistry,
  pruneUploadedDesignSourceRegistry,
  UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD,
} from "./uploadedDesignSourceRegistry";

export interface ForeignUploadedDesignSourceRemoval {
  readonly draft: GuestDesignDraft;
  readonly removedGarmentKeys: readonly string[];
  readonly removedUploadedSourceRefs: readonly string[];
}

const unchanged = (draft: GuestDesignDraft): ForeignUploadedDesignSourceRemoval => ({
  draft,
  removedGarmentKeys: [],
  removedUploadedSourceRefs: [],
});

/**
 * Removes uploaded design sources owned by another Firebase uid, together with
 * the Step 3 assignments that use them. Everything else in the draft is kept.
 */
export const removeForeignUploadedDesignSources = (
  draft: GuestDesignDraft,
  ownerUid: string,
): ForeignUploadedDesignSourceRemoval => {
  const envelopeParse = inspectPersistedDesignStyleDraft(draft);
  if (envelopeParse.status === "malformed" || envelopeParse.status === "unsupported") {
    return unchanged(draft);
  }
  const registryParse = inspectUploadedDesignSourceRegistry(draft);
  if (registryParse.status === "malformed") return unchanged(draft);

  const foreignRefs = new Set<string>();
  if (registryParse.status === "valid") {
    for (const [uploadedSourceRef, source] of Object.entries(
      registryParse.registry.sourcesByUploadedSourceRef,
    )) {
      if (source.uploadReference.ownerUid !== ownerUid) {
        foreignRefs.add(uploadedSourceRef);
      }
    }
  }
  const scalarSource = isValidUploadedDesignDraftSource(draft.designSource)
    ? draft.designSource
    : null;
  const scalarForeign = Boolean(
    scalarSource && scalarSource.uploadReference.ownerUid !== ownerUid,
  );
  if (scalarSource && scalarForeign) {
    foreignRefs.add(scalarSource.uploadReference.designReferenceId);
  }
  if (foreignRefs.size === 0 && !draft.uploadedDesignOwnershipTransition) {
    return unchanged(draft);
  }

  const removedGarmentKeys: string[] = [];
  let next: GuestDesignDraft = { ...draft };

  if (envelopeParse.status === "valid") {
    const { ledger, migration } = envelopeParse.envelope;
    const keptAssignments: Record<string, GarmentDesignStyleAssignmentV2> = {};
    for (const [garmentKey, assignment] of Object.entries(
      ledger.assignmentsByGarmentKey,
    )) {
      if (
        assignment.sourceKind === "uploaded" &&
        foreignRefs.has(assignment.uploadedSourceRef)
      ) {
        removedGarmentKeys.push(garmentKey);
      } else {
        keptAssignments[garmentKey] = assignment;
      }
    }
    const dropMigration =
      migration?.sourceKind === "uploaded" &&
      foreignRefs.has(migration.uploadedSourceRef);
    if (removedGarmentKeys.length > 0 || dropMigration) {
      const envelope = serializePersistedDesignStyleDraftEnvelope({
        schemaVersion: envelopeParse.envelope.schemaVersion,
        ledger: {
          ...ledger,
          revision: ledger.revision + 1,
          assignmentsByGarmentKey: keptAssignments,
        },
        ...(migration && !dropMigration ? { migration } : {}),
      });
      if (!envelope) return unchanged(draft);
      next = { ...next, [DESIGN_STYLE_DRAFT_FIELD]: envelope };
    }
  }

  if (registryParse.status === "valid") {
    const keptRefs = Object.keys(
      registryParse.registry.sourcesByUploadedSourceRef,
    ).filter((uploadedSourceRef) => !foreignRefs.has(uploadedSourceRef));
    next = {
      ...next,
      [UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD]: pruneUploadedDesignSourceRegistry(
        registryParse.registry,
        keptRefs,
      ),
    };
  }

  if (scalarSource && scalarForeign) {
    next = {
      ...next,
      designSource: null,
      ...(draft.confirmedDesignSourceKey === scalarSource.sourceKey
        ? { confirmedDesignSourceKey: null }
        : {}),
    };
  }

  if (next.uploadedDesignOwnershipTransition) {
    const {
      uploadedDesignOwnershipTransition: _discardedTransition,
      ...withoutTransition
    } = next;
    next = withoutTransition;
  }

  return {
    draft: next,
    removedGarmentKeys: removedGarmentKeys.sort((left, right) =>
      left.localeCompare(right),
    ),
    removedUploadedSourceRefs: [...foreignRefs].sort((left, right) =>
      left.localeCompare(right),
    ),
  };
};
