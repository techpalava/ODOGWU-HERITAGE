import type {
  DesignStudioStageId,
  FabricAllocationState,
  FabricGarmentAssignment,
  GarmentTypeStepSelection,
} from "../types";
import type { PhysicalGarmentOccurrence } from "./designSourceState";
import {
  getFutureFabricAssignmentTargetsFromAuthority,
  getFutureUnassignedFabricTargets,
} from "./designStudioFutureFabricStage";

/** Auto-dismiss window for Contextual Re-entry Guidance banners. */
export const CONTEXTUAL_REENTRY_AUTO_DISMISS_MS = 6000;

export type ContextualReentryCause =
  | "new_items"
  | "changed_items"
  | "mixed";

export interface ContextualReentryAffectedItem {
  readonly id: string;
  readonly label: string;
}

/**
 * Transient, consume-once explanation for why a previously visited dependent
 * step needs attention after an upstream change. Not persisted to drafts.
 */
export interface ContextualReentryGuidance {
  readonly destinationStageId: DesignStudioStageId;
  readonly cause: ContextualReentryCause;
  readonly affectedItems: readonly ContextualReentryAffectedItem[];
  readonly message: string;
  /** First garment card to scroll/flash; null when guidance is copy-only. */
  readonly focusGarmentKey: string | null;
}

/**
 * Session snapshot of Fabric coverage when the customer last left Fabric (or
 * after guidance was consumed). `null` means Fabric has not been left this
 * session, so ordinary first entry / post-refresh revisits stay silent.
 */
export interface FabricReentryBaseline {
  readonly assignedSignaturesByKey: ReadonlyMap<string, string>;
  readonly knownUnassignedKeys: ReadonlySet<string>;
}

export const getFabricRequirementSignature = (
  assignment: Pick<
    FabricGarmentAssignment,
    "garmentKey" | "garmentType" | "fabricUnits"
  >,
): string =>
  `${assignment.garmentKey}|${assignment.garmentType}|${assignment.fabricUnits}`;

const formatGarmentList = (labels: readonly string[]): string => {
  if (labels.length <= 1) return labels[0] || "the selected garment";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

export const formatFabricContextualReentryMessage = ({
  cause,
  labels,
}: {
  cause: ContextualReentryCause;
  labels: readonly string[];
}): string => {
  const list = formatGarmentList(labels);
  if (cause === "new_items") {
    return labels.length <= 1
      ? `You added ${list}. It still needs a Fabric assignment.`
      : `You added garments that still need Fabric: ${list}.`;
  }
  if (cause === "changed_items") {
    return labels.length <= 1
      ? `You changed ${list}. Choose a Fabric for it again.`
      : `You changed garments that need Fabric again: ${list}.`;
  }
  return `Some garments need Fabric attention: ${list}.`;
};

export const captureFabricReentryBaseline = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): FabricReentryBaseline => {
  const required = getFutureFabricAssignmentTargetsFromAuthority({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  });
  const assignedSignaturesByKey = new Map<string, string>();
  for (const allocation of fabricAllocationState.fabricAllocations) {
    for (const assignment of allocation.garmentAssignments) {
      assignedSignaturesByKey.set(
        assignment.garmentKey,
        getFabricRequirementSignature(assignment),
      );
    }
  }
  const knownUnassignedKeys = new Set<string>();
  for (const { assignment } of required) {
    if (!assignedSignaturesByKey.has(assignment.garmentKey)) {
      knownUnassignedKeys.add(assignment.garmentKey);
    }
  }
  return { assignedSignaturesByKey, knownUnassignedKeys };
};

export const detectFabricContextualReentryGuidance = ({
  baseline,
  fabricHistoricallyVisited,
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
  labelForGarmentKey,
}: {
  baseline: FabricReentryBaseline | null;
  fabricHistoricallyVisited: boolean;
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  labelForGarmentKey: (garmentKey: string, garmentType: string) => string;
}): ContextualReentryGuidance | null => {
  if (!baseline || !fabricHistoricallyVisited) {
    return null;
  }

  const unassigned = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  });
  if (unassigned.length === 0) {
    return null;
  }

  const newItems: ContextualReentryAffectedItem[] = [];
  const changedItems: ContextualReentryAffectedItem[] = [];

  for (const { assignment } of unassigned) {
    const label = labelForGarmentKey(
      assignment.garmentKey,
      assignment.garmentType,
    );
    const item = { id: assignment.garmentKey, label };
    if (baseline.assignedSignaturesByKey.has(assignment.garmentKey)) {
      changedItems.push(item);
      continue;
    }
    if (!baseline.knownUnassignedKeys.has(assignment.garmentKey)) {
      newItems.push(item);
    }
  }

  if (newItems.length === 0 && changedItems.length === 0) {
    return null;
  }

  const cause: ContextualReentryCause =
    newItems.length > 0 && changedItems.length > 0
      ? "mixed"
      : changedItems.length > 0
        ? "changed_items"
        : "new_items";
  const affectedItems =
    cause === "mixed"
      ? [...newItems, ...changedItems]
      : cause === "changed_items"
        ? changedItems
        : newItems;

  return {
    destinationStageId: "fabric",
    cause,
    affectedItems,
    message: formatFabricContextualReentryMessage({
      cause,
      labels: affectedItems.map((item) => item.label),
    }),
    focusGarmentKey: affectedItems[0]?.id ?? null,
  };
};

/** First unassigned Fabric garment key, if any. */
export const getFirstUnassignedFabricGarmentKey = ({
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
}): string | null =>
  getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  })[0]?.assignment.garmentKey ?? null;
