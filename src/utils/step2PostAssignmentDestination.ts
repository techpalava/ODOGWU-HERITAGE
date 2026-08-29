export type Step2PostAssignmentDestinationKind =
  | "assigned"
  | "next_unassigned";

export interface Step2PostAssignmentDestination {
  garmentKey: string;
  kind: Step2PostAssignmentDestinationKind;
}

/**
 * Deterministic Step 2 destination after a successful Step 1 bulk Fabric
 * assignment. Uses exact garmentKeys in canonical target order.
 *
 * 1 assigned → that assigned card
 * 2+ assigned and unassigned remain → first remaining canonical unassigned
 * 2+ assigned and none remain → last newly assigned key
 */
export const resolveStep2PostAssignmentDestination = ({
  assignedGarmentKeys,
  canonicalGarmentKeys,
  remainingUnassignedGarmentKeys,
}: {
  assignedGarmentKeys: readonly string[];
  canonicalGarmentKeys: readonly string[];
  remainingUnassignedGarmentKeys: readonly string[];
}): Step2PostAssignmentDestination | null => {
  const canonicalSet = new Set(canonicalGarmentKeys);
  const assigned = assignedGarmentKeys.filter((garmentKey) =>
    canonicalSet.has(garmentKey),
  );
  if (assigned.length === 0) {
    return null;
  }

  if (assigned.length === 1) {
    return { garmentKey: assigned[0], kind: "assigned" };
  }

  const remainingSet = new Set(remainingUnassignedGarmentKeys);
  const nextUnassigned = canonicalGarmentKeys.find((garmentKey) =>
    remainingSet.has(garmentKey),
  );
  if (nextUnassigned) {
    return { garmentKey: nextUnassigned, kind: "next_unassigned" };
  }

  return {
    garmentKey: assigned[assigned.length - 1],
    kind: "assigned",
  };
};
