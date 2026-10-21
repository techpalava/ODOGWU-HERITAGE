/**
 * Step 2 Fabric Guide flow.
 *
 * Pure projection of the Fabric step's existing completion authority into an
 * ordered list of the things still needed before "Continue to Design Style"
 * unlocks. It never decides completion itself: `isComplete` comes from the
 * canonical Fabric stage completion, and when it is true the flow is hidden.
 */

export type FabricGuideStepKind =
  | "garment_type"
  | "repair_assignment"
  | "finish_pending"
  | "replace_fabric"
  | "fix_quantity"
  | "choose_fabric"
  | "assign_garment"
  | "review";

export type FabricGuideStepStatus = "done" | "current" | "upcoming";

/**
 * Where the step's link scrolls/focuses and where the gold beam lands while
 * the step is current.
 */
export type FabricGuideTarget =
  | { type: "catalogue" }
  | { type: "garment_action"; garmentKey: string }
  | { type: "garment_card"; garmentKey: string }
  | { type: "garment_remove"; garmentKey: string }
  /** The Guide's own one-tap "Move" button for an over-allocated order. */
  | { type: "quantity_move"; garmentKey: string }
  | { type: "pending_panel" }
  | { type: "orphan_repair"; repairKey: string }
  | { type: "none" };

export interface FabricGuideStep {
  id: string;
  kind: FabricGuideStepKind;
  label: string;
  /** Merged "Fabric needs attention" message(s) for this step. */
  messages: string[];
  status: FabricGuideStepStatus;
  target: FabricGuideTarget;
}

export interface FabricGuideGarmentInput {
  garmentKey: string;
  label: string;
  assigned: boolean;
  /** Fabric code assigned to this garment, if any. */
  fabricCode?: string | null;
  allocationId?: string | null;
  /** Action available on the garment card when unassigned. */
  action?: "add_fabric" | "assign_to_fabric" | "blocked" | null;
}

export interface FabricGuideBlockerInput {
  code: string;
  message: string;
  garmentKey?: string;
  allocationId?: string;
  fabricCode?: string;
}

export interface FabricGuideFlowInput {
  /** Canonical Fabric stage completion. When true the Guide is hidden. */
  isComplete: boolean;
  garments: readonly FabricGuideGarmentInput[];
  blockers: readonly FabricGuideBlockerInput[];
  selectedFabricQuantity: number;
  /** Allocation ids in Fabric Selection order. */
  allocationOrder?: readonly string[];
  orphanRepairKeys?: readonly string[];
  /** "Fabric Selection Limit" panel is showing (pending garment, not awaiting). */
  pendingPanelVisible?: boolean;
  /** A pending garment is waiting for a Fabric from the catalogue. */
  awaitingFabricGarmentKey?: string | null;
  /** Garment the inline catalogue is currently choosing for. */
  catalogueTargetGarmentKey?: string | null;
  /** Merged avoidable-partial guidance copy, shown on the current assign step. */
  avoidablePartialGuidance?: string | null;
  noCapacityMessage?: string;
  /**
   * One-move repair for FABRIC_QUANTITY_OVER_ALLOCATED or
   * FABRIC_QUANTITY_STRANDED: a garment that sits alone on a Fabric and fits
   * on another selected Fabric. When present the
   * fix step explains the move and the beam lands on its Move button.
   */
  quantityRepair?: { garmentKey: string; message: string } | null;
}

export interface FabricGuideFlow {
  visible: boolean;
  steps: FabricGuideStep[];
  currentStep: FabricGuideStep | null;
  doneCount: number;
}

const unique = (values: string[]): string[] => Array.from(new Set(values));

const firstGarmentForFabric = (
  garments: readonly FabricGuideGarmentInput[],
  blocker: FabricGuideBlockerInput,
): FabricGuideGarmentInput | undefined =>
  garments.find(
    (garment) =>
      garment.assigned &&
      ((blocker.allocationId && garment.allocationId === blocker.allocationId) ||
        (!blocker.allocationId &&
          blocker.fabricCode &&
          garment.fabricCode === blocker.fabricCode)),
  );

export const buildFabricGuideFlow = (
  input: FabricGuideFlowInput,
): FabricGuideFlow => {
  if (input.isComplete) {
    return { visible: false, steps: [], currentStep: null, doneCount: 0 };
  }

  const garments = input.garments;
  const blockers = input.blockers;
  const steps: Omit<FabricGuideStep, "status">[] = [];
  const blockedOnly: Omit<FabricGuideStep, "status">[] = [];
  const consumed = new Set<FabricGuideBlockerInput>();
  const take = (predicate: (blocker: FabricGuideBlockerInput) => boolean) => {
    const matched = blockers.filter(
      (blocker) => !consumed.has(blocker) && predicate(blocker),
    );
    matched.forEach((blocker) => consumed.add(blocker));
    return matched;
  };

  // 1. Garment Type must be complete before anything else on this step.
  const garmentTypeBlockers = take((b) => b.code === "GARMENT_TYPE_INCOMPLETE");
  if (garmentTypeBlockers.length > 0) {
    blockedOnly.push({
      id: "garment_type",
      kind: "garment_type",
      label: "Finish choosing your garments first",
      messages: unique(garmentTypeBlockers.map((b) => b.message)),
      target: { type: "none" },
    });
  }

  // 2. Saved assignments that point at garments no longer in the order.
  const integrityBlockers = take(
    (b) =>
      b.code === "RAW_FABRIC_INTEGRITY_BLOCKED" ||
      (b.code === "MALFORMED_ASSIGNMENT" &&
        (input.orphanRepairKeys?.length ?? 0) > 0),
  );
  if ((input.orphanRepairKeys?.length ?? 0) > 0 || integrityBlockers.length > 0) {
    const repairKey = input.orphanRepairKeys?.[0];
    const garmentKey = integrityBlockers.find((b) => b.garmentKey)?.garmentKey;
    blockedOnly.push({
      id: "repair_assignment",
      kind: "repair_assignment",
      label: "Remove the invalid saved Fabric assignment",
      messages: unique(integrityBlockers.map((b) => b.message)),
      target: repairKey
        ? { type: "orphan_repair", repairKey }
        : garmentKey && garments.some((g) => g.garmentKey === garmentKey)
          ? { type: "garment_card", garmentKey }
          : { type: "none" },
    });
  }

  // 3. A pending assignment (Fabric Selection Limit or awaiting a Fabric).
  const pendingBlockers = take((b) => b.code === "PENDING_GARMENT_ASSIGNMENT");
  if (
    pendingBlockers.length > 0 ||
    input.pendingPanelVisible ||
    input.awaitingFabricGarmentKey
  ) {
    const awaitingLabel = input.awaitingFabricGarmentKey
      ? garments.find((g) => g.garmentKey === input.awaitingFabricGarmentKey)?.label
      : undefined;
    blockedOnly.push({
      id: "finish_pending",
      kind: "finish_pending",
      label: awaitingLabel
        ? `Finish choosing a fabric for ${awaitingLabel}`
        : "Finish the pending fabric assignment",
      messages: unique(pendingBlockers.map((b) => b.message)),
      target: input.pendingPanelVisible
        ? { type: "pending_panel" }
        : { type: "catalogue" },
    });
  }

  // 4. Fabrics that are missing, unavailable, unpriced or over stock.
  const replaceCodes = new Set([
    "FABRIC_NOT_FOUND",
    "FABRIC_UNAVAILABLE",
    "FABRIC_PRICE_UNAVAILABLE",
    "FABRIC_STOCK_OVER_ALLOCATED",
    "INVALID_ALLOCATION_CAPACITY",
  ]);
  const replaceBlockers = take((b) => replaceCodes.has(b.code));
  const replaceGroups = new Map<string, FabricGuideBlockerInput[]>();
  for (const blocker of replaceBlockers) {
    const garment = firstGarmentForFabric(garments, blocker);
    const key = garment?.garmentKey ?? `code:${blocker.code}`;
    replaceGroups.set(key, [...(replaceGroups.get(key) ?? []), blocker]);
  }
  for (const [key, group] of replaceGroups) {
    const garment = garments.find((g) => g.garmentKey === key);
    blockedOnly.push({
      id: `replace_fabric:${key}`,
      kind: "replace_fabric",
      label: garment
        ? `Change the fabric for ${garment.label}`
        : "Change a Fabric Selection",
      messages: unique(group.map((b) => b.message)),
      target: garment
        ? { type: "garment_action", garmentKey: garment.garmentKey }
        : { type: "catalogue" },
    });
  }

  // 5. More Fabrics than the order needs. Usually the order shrank after
  // Fabrics were chosen and two garments now sit alone on separate Fabrics.
  // Also: Fabrics saved equal Fabrics needed, but the space left is split
  // into halves so a waiting Long Dress (or Agbada) cannot get a whole Fabric.
  const quantityBlockers = take(
    (b) =>
      b.code === "FABRIC_QUANTITY_OVER_ALLOCATED" ||
      b.code === "FABRIC_QUANTITY_STRANDED",
  );
  if (quantityBlockers.length > 0) {
    const repair = input.quantityRepair;
    const repairGarment = repair
      ? garments.find((g) => g.assigned && g.garmentKey === repair.garmentKey)
      : undefined;
    let target: FabricGuideTarget = { type: "none" };
    if (repair && repairGarment) {
      target = { type: "quantity_move", garmentKey: repairGarment.garmentKey };
    } else {
      // Removing a garment only lowers the count when it empties its Fabric,
      // so point at a garment on the least-used Fabric (latest on ties), never
      // at one that shares a full Fabric.
      const order = input.allocationOrder ?? [];
      const sizeOf = (allocationId: string | null | undefined) =>
        garments.filter((g) => g.assigned && g.allocationId === allocationId).length;
      const orderIndex = (allocationId: string | null | undefined) =>
        allocationId ? order.indexOf(allocationId) : -1;
      const candidates = garments.filter((g) => g.assigned);
      const removeGarment = [...candidates].sort(
        (left, right) =>
          sizeOf(left.allocationId) - sizeOf(right.allocationId) ||
          orderIndex(right.allocationId) - orderIndex(left.allocationId),
      )[0];
      if (removeGarment) {
        target = { type: "garment_remove", garmentKey: removeGarment.garmentKey };
      }
    }
    const strandedOnly = quantityBlockers.every(
      (b) => b.code === "FABRIC_QUANTITY_STRANDED",
    );
    const strandedGarment = strandedOnly
      ? garments.find((g) => g.garmentKey === quantityBlockers[0]?.garmentKey)
      : undefined;
    blockedOnly.push({
      id: "fix_quantity",
      kind: "fix_quantity",
      label: strandedGarment
        ? `Make room for ${strandedGarment.label}`
        : "Fix your fabric quantity",
      messages: unique([
        ...quantityBlockers.map((b) => b.message),
        ...(repair && repairGarment ? [repair.message] : []),
      ]),
      target,
    });
  }

  // 6. Choose a first Fabric, then give every garment a Fabric.
  const assignBlockers = take((b) => b.code === "GARMENT_ASSIGNMENT_REQUIRED");
  const assignMessage = assignBlockers[0]?.message;
  if (garments.length > 0) {
    steps.push({
      id: "choose_fabric",
      kind: "choose_fabric",
      label: "Choose a fabric from the catalogue",
      messages: [],
      target: { type: "catalogue" },
    });
  }
  for (const garment of garments) {
    const blocked = !garment.assigned && garment.action === "blocked";
    steps.push({
      id: `assign_garment:${garment.garmentKey}`,
      kind: "assign_garment",
      label: garment.assigned
        ? `${garment.label} has fabric`
        : `Assign fabric to ${garment.label}`,
      messages:
        blocked && input.noCapacityMessage ? [input.noCapacityMessage] : [],
      target: garment.assigned
        ? { type: "garment_card", garmentKey: garment.garmentKey }
        : input.catalogueTargetGarmentKey === garment.garmentKey
          ? { type: "catalogue" }
          : blocked
            ? { type: "garment_card", garmentKey: garment.garmentKey }
            : { type: "garment_action", garmentKey: garment.garmentKey },
    });
  }

  // 7. Anything else the completion authority reports.
  const rest = take(() => true);
  if (rest.length > 0) {
    const garmentKey = rest.find(
      (b) => b.garmentKey && garments.some((g) => g.garmentKey === b.garmentKey),
    )?.garmentKey;
    blockedOnly.push({
      id: "review",
      kind: "review",
      label: "Review your fabric assignments",
      messages: unique(rest.map((b) => b.message)),
      target: garmentKey ? { type: "garment_card", garmentKey } : { type: "none" },
    });
  }

  // Blocking fixes come before the normal choose/assign flow.
  const ordered = [...blockedOnly, ...steps];
  let currentIndex = -1;
  const isDone = (step: Omit<FabricGuideStep, "status">): boolean => {
    if (step.kind === "choose_fabric") return input.selectedFabricQuantity > 0;
    if (step.kind === "assign_garment") {
      const key = step.id.slice("assign_garment:".length);
      return Boolean(garments.find((g) => g.garmentKey === key)?.assigned);
    }
    return false;
  };
  const withStatus: FabricGuideStep[] = ordered.map((step, index) => {
    const done = isDone(step);
    if (!done && currentIndex === -1) currentIndex = index;
    return {
      ...step,
      status: done ? "done" : currentIndex === index ? "current" : "upcoming",
    };
  });

  // Merge the generic "choose a fabric for every garment" alert and the
  // avoidable-partial hint into the step the customer is on.
  const current = currentIndex >= 0 ? withStatus[currentIndex]! : null;
  if (current && (current.kind === "assign_garment" || current.kind === "choose_fabric")) {
    if (input.avoidablePartialGuidance && current.kind === "assign_garment") {
      current.messages = unique([...current.messages, input.avoidablePartialGuidance]);
    }
    if (assignMessage) {
      current.messages = unique([...current.messages, assignMessage]);
    }
  } else if (assignMessage) {
    const firstAssign = withStatus.find(
      (step) => step.kind === "assign_garment" && step.status !== "done",
    );
    if (firstAssign) firstAssign.messages = unique([...firstAssign.messages, assignMessage]);
  }

  return {
    visible: withStatus.length > 0,
    steps: withStatus,
    currentStep: current,
    doneCount: withStatus.filter((step) => step.status === "done").length,
  };
};

export const FABRIC_GUIDE_TITLE = "Still needed before Design Style";

export const formatFabricGuideCurrentStepAnnouncement = (
  flow: FabricGuideFlow,
): string =>
  flow.currentStep
    ? `Step ${flow.steps.indexOf(flow.currentStep) + 1} of ${flow.steps.length}: ${flow.currentStep.label}.`
    : "";
