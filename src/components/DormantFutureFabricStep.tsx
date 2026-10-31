import {
  DesignStudioStepFooter,
  DesignStudioStepLayout,
  DesignStudioStepMain,
  DesignStudioStepSidebar,
} from "./DesignStudioStepLayout";
import { CheckCircle2, Circle, Layers3, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  Fabric,
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "../types";
import { getGarmentTypeStepLabel } from "./GarmentTypeStep";
import { formatDesignStudioStepCounter } from "../utils/designSourceJourney";
import { garmentConstructionInclusionNote } from "../utils/designPriceBreakdownPresentation";
import type { PhysicalGarmentOccurrence } from "../utils/designSourceState";
import { DesignStudioStepActions } from "./DesignStudioBackButton";
import {
  DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS,
  DesignStudioStepGuide,
} from "./DesignStudioStepGuide";
import {
  FABRIC_GUIDE_TITLE,
  buildFabricGuideFlow,
  formatFabricGuideCurrentStepAnnouncement,
  type FabricGuideStep,
  type FabricGuideTarget,
} from "../utils/fabricStepGuideFlow";
import { useReportDesignStudioBlockingOverlay } from "./designStudioBlockingOverlay";
import {
  AssignedFabricPreview,
  GARMENT_CARD_FABRIC_PHOTO_CLASSNAME,
} from "./AssignedFabricPreview";
import { FabricPieceUsageMarker } from "./FabricPieceUsageMarker";
import { FutureFabricCatalogueCard } from "./FutureFabricCatalogueCard";
import { FabricSelectionSummaryRow } from "./FabricSelectionSummaryRow";
import {
  buildFabricSelectionSummaryItems,
  formatFabricSelectionNumbersBadge,
  getFabricSelectionNumbersUsingFabric,
  type FabricSelectionSummaryItem,
} from "../utils/fabricSelectionSummaryRow";
import { FabricCatalogueNotice } from "./FabricCatalogueNotice";
import {
  resolveFabricCatalogueNotice,
  type FabricCatalogueLoadState,
} from "../utils/fabricCatalogueNotice";
import { Step1FabricAssignmentDialog } from "./Step1FabricAssignmentDialog";
import { ChangeFabricAllocationDialog } from "./ChangeFabricAllocationDialog";
import { PartialFabricCapacityAssignmentDialog } from "./PartialFabricCapacityAssignmentDialog";
import {
  RemoveFabricAssignmentDialog,
  type RemoveFabricAssignmentTarget,
} from "./RemoveFabricAssignmentDialog";
import { getFabricAvailabilityMessage } from "../utils/fabricCatalogueAvailability";
import { resolveFabricAllocationMaterialPricing } from "../utils/fabricAllocationPricing";
import {
  getFutureCompatiblePartialFabricAllocations,
  getFuturePartialFabricAllocationSummaries,
  getFuturePartialFabricAllocationCompatibleTargets,
  getFuturePartialFabricAssignmentTargetPresentations,
  hasAvoidablePartialFabricAllocation,
  getFutureFabricAssignmentTargetsFromAuthority,
  getFutureFabricStep1AssignmentTargets,
  getFutureUnassignedFabricTargets,
  adaptUntargetedStep1CatalogueCardPresentation,
  assignFutureFabricToGarment,
  detachFutureGarmentFromSharedPiece,
  pairLoneFutureGarmentWithExistingPiece,
  removeFutureFabricAssignment,
  changeFutureFabricAllocationProduct,
  formatFabricQuantityLimitChangeCopy,
  formatFabricQuantityLimitReachedCopy,
  formatFabricQuantityMoveCopy,
  formatFabricQuantityOverAllocatedCopy,
  formatFabricQuantityStrandedCopy,
  getFabricQuantityFitBlockedCopyForGarment,
  formatFutureFabricStockOverAllocatedBlockerMessage,
  getFabricQuantityOverAllocationRepair,
  formatRequiredFabricQuantitySentence,
  getFutureFabricAllocationGroupChangePresentation,
  getFutureFabricAllocationAssignmentSignature,
  getFutureFabricCatalogueCancelTargets,
  getFutureReusableHalfCapacityGarmentKeys,
  hasFutureReusableHalfCapacityForFabric,
  canCreatePhysicalFabricAllocation,
  getMaxPhysicalFabricAllocationCount,
  resolveFutureFabricCatalogueCardPresentation,
  resolveFutureFabricChangeCatalogueCardPresentation,
  type FutureFabricAssignmentResult,
  type FutureFabricAssignmentBlockReason,
  type ChangeFutureFabricAllocationExpectation,
  type FutureFabricGarmentAssignmentOptions,
  type FutureFabricPiecePlacement,
  getFutureFabricAutoPairings,
  formatFabricAutoPairToastCopy,
  type FutureFabricBulkAssignmentResult,
  type FutureFabricCatalogueCancellationResult,
  type FutureFabricCatalogueCardPresentation,
  type FutureFabricStageCompletion,
  type HydratedOrphanFabricAssignmentRepairResult,
  type HydratedOrphanFabricAssignmentRepairTarget,
  type MoveFutureGarmentToFabricAllocationResult,
} from "../utils/designStudioFutureFabricStage";
import { resolveStep2PostAssignmentDestination } from "../utils/step2PostAssignmentDestination";
import {
  FABRIC_SELECTION_CHANGING_SCROLL_MARGIN_CLASS,
  getFabricSelectionBadgeClass,
  getFabricSelectionCardClass,
  getFirstChangingGarmentKey,
  resolveFabricSelectionCardHighlight,
  resolveFabricSelectionScrollMarginTopPx,
} from "../utils/fabricSelectionHighlight";
import { projectOccurrenceDisplayLabels } from "../utils/occurrenceDisplayLabel";
import {
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  createStep1FabricAssignmentDisplaySnapshot,
  evaluateStep1FabricAssignmentSelection,
  getUnassignedStep1FabricAssignmentCandidates,
  projectPendingStep1FabricStockPresentation,
  resolveStep1AssignmentDialogFabric,
  resolveStep1FabricCatalogueCardPresentation,
  shouldOpenStep1FabricGroupingDialog,
  type PendingStep1FabricAssignment,
} from "../utils/step1FabricAssignmentPopup";
import {
  getFabricNewAllocationStockConstraintMessage,
  getOrderAwareFabricStockPresentation,
  formatFabricStockExhaustedCopy,
} from "../utils/fabricStockAvailability";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  CONTEXTUAL_REENTRY_AUTO_DISMISS_MS,
  type ContextualReentryGuidance,
} from "../utils/designStudioContextualReentryGuidance";

export { isUsableFabricColorHex } from "./AssignedFabricPreview";

const blockerMessages: Record<
  FutureFabricStageCompletion["blockers"][number]["code"],
  string
> = {
  GARMENT_TYPE_INCOMPLETE: "Complete Garment Type before assigning fabric.",
  GARMENT_ASSIGNMENT_REQUIRED: "Choose a fabric for every selected garment.",
  PENDING_GARMENT_ASSIGNMENT: "Finish the pending fabric assignment before continuing.",
  FABRIC_NOT_FOUND: "A previously selected fabric is no longer in the catalogue. Choose another fabric.",
  FABRIC_UNAVAILABLE: "A selected fabric is currently unavailable. Choose another fabric.",
  FABRIC_PRICE_UNAVAILABLE: "A selected fabric needs a current catalogue price before this step can continue.",
  INVALID_ALLOCATION_CAPACITY: "One fabric assignment exceeds the permitted fabric capacity. Review the allocation.",
  MALFORMED_ASSIGNMENT: "One garment assignment needs review before this step can continue.",
  FABRIC_QUANTITY_OVER_ALLOCATED:
    "Your saved Fabric selections use more fabrics than this order requires. Remove or change Fabric assignments until the required number remains.",
  FABRIC_QUANTITY_STRANDED:
    "A garment needs a whole fabric, but the space left on your chosen fabrics is split into halves. Move a garment to free a whole fabric.",
  FABRIC_STOCK_OVER_ALLOCATED:
    "One or more Fabric selections exceed available stock. Remove or change a Fabric Selection.",
  RAW_FABRIC_INTEGRITY_BLOCKED:
    "Saved Fabric assignments conflict with the current order. Review duplicate or invalid garment assignments before continuing.",
};

interface DormantFutureFabricStepProps {
  fabrics: Fabric[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  completion: FutureFabricStageCompletion;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  orphanRepairTargets?: readonly HydratedOrphanFabricAssignmentRepairTarget[];
  requiredFabricQuantity: number;
  selectedFabricQuantity: number;
  constructionPrice: number;
  orderType?: string | null;
  onAssignFabricToGarment: (
    fabric: Fabric,
    garmentKey: string,
    placement?: FutureFabricPiecePlacement,
    options?: FutureFabricGarmentAssignmentOptions,
  ) => FabricAllocationState | void;
  onChangeFabricAllocationProduct: (
    allocationId: string,
    fabricCode: string,
    expectation?: ChangeFutureFabricAllocationExpectation,
  ) => FutureFabricAssignmentResult | void;
  onRemoveFabricFromGarment: (
    garmentKey: string,
  ) => FutureFabricCatalogueCancellationResult | void;
  onRepairInvalidFabricAssignment?: (
    target: HydratedOrphanFabricAssignmentRepairTarget,
  ) => HydratedOrphanFabricAssignmentRepairResult;
  onUseSameFabricForGarment: (garmentKey: string) => void;
  onAssignSameFabricProduct: (
    fabricCode: string,
    garmentKeys: string[],
    placement?: FutureFabricPiecePlacement,
  ) => FutureFabricBulkAssignmentResult | void;
  onAssignGarmentToExistingAllocation: (
    garmentKey: string,
    allocationId: string,
  ) => FutureFabricAssignmentResult | void;
  /**
   * Shown as a short toast after a garment pairs automatically onto an
   * existing piece, e.g. "Paired Long Dress with Selection 3 — no extra
   * fabric used".
   */
  onAutoPairNotice?: (message: string) => void;
  /**
   * One-tap repair when the order holds more Fabrics than it needs: move a
   * garment that sits alone on a Fabric onto another selected Fabric.
   */
  onMoveGarmentToFabricAllocation?: (
    garmentKey: string,
    allocationId: string,
  ) => MoveFutureGarmentToFabricAllocationResult | void;
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
  orderSummary?: ReactNode;
  contextualReentryGuidance?: ContextualReentryGuidance | null;
  onDismissContextualReentryGuidance?: () => void;
  unassignedFocusRequestId?: number | null;
  unassignedFocusGarmentKey?: string | null;
  onUnassignedFocusHandled?: (requestId: number) => void;
  fabricsCatalogueState?: FabricCatalogueLoadState;
  onRetryFabricCatalogue?: () => void;
}

const OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE =
  "Finish assigning fabric to the pending additional garment before removing fabric from another additional garment.";

const STEP2_FABRIC_CAPACITY_INTRO =
  "One Fabric can make up to two standard garments. A Long Dress uses one full Fabric. Your order uses only the number of Fabrics it needs, so garments share a Fabric where they can.";

const UNASSIGNED_FABRIC_NO_CAPACITY_MESSAGE =
  "No selected Fabric has capacity for this garment. Change a Fabric assignment or remove a Fabric selection.";

/** One unbreakable part of the "Fabric Selection N · Capacity: x/2" line; its "·" is drawn before it. */
const GARMENT_CARD_SELECTION_PART_CLASSNAME =
  "relative whitespace-nowrap pl-3 before:absolute before:left-[4px] before:content-['·']";

const getFutureGarmentLabel = (garmentType: FabricGarmentType): string =>
  garmentType === "other"
    ? "Other Garment"
    : getGarmentTypeStepLabel(garmentType);

/**
 * Change Fabric hint when a garment card's piece is shared: only that
 * garment changes ("Only Long Shirt will change. Trouser keeps Classic Ivory
 * Shield.").
 */
export const formatChangeOneGarmentCopy = ({
  garmentKey,
  garmentKeys,
  garmentLabels,
  fabricName,
}: {
  garmentKey: string;
  garmentKeys: readonly string[];
  garmentLabels: readonly string[];
  fabricName: string;
}): string => {
  const index = garmentKeys.indexOf(garmentKey);
  const changing = garmentLabels[index] ?? "this garment";
  const others = garmentLabels.filter((_, otherIndex) => otherIndex !== index);
  if (others.length === 0) return `Only ${changing} will change.`;
  return `Only ${changing} will change. ${formatGarmentList([...others])} ${
    others.length === 1 ? "keeps" : "keep"
  } ${fabricName}.`;
};

export const FABRIC_CHANGE_SWAP_FREE_COPY =
  "Swapping keeps the same number of fabrics, so you can pick any available print.";

const formatGarmentList = (labels: string[]): string => {
  if (labels.length <= 1) return labels[0] || "the selected garment";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

const getOrphanRepairTargetKey = (
  target: HydratedOrphanFabricAssignmentRepairTarget,
): string =>
  `${target.allocationId}:${target.garmentKey}:${target.assignmentSignature}`;

export const formatFabricSelectionProgress = (
  selectedFabricQuantity: number,
  requiredFabricQuantity: number,
): string =>
  selectedFabricQuantity > requiredFabricQuantity
    ? `Fabrics chosen: ${selectedFabricQuantity} (${requiredFabricQuantity} needed)`
    : `Fabrics chosen: ${selectedFabricQuantity} of ${requiredFabricQuantity} needed`;

export const formatGarmentAssignmentProgress = (
  assignedGarmentCount: number,
  requiredGarmentCount: number,
): string =>
  `Garments with fabric: ${assignedGarmentCount} of ${requiredGarmentCount}`;

export const FABRIC_PROGRESS_COMPLETE_HEADING = "All garments have fabric";

/** "1 fabric covers your 2 garments." / "2 fabrics cover your 3 garments." */
export const formatFabricProgressCompleteSummary = (
  fabricQuantity: number,
  garmentCount: number,
): string =>
  `${fabricQuantity} ${fabricQuantity === 1 ? "fabric covers" : "fabrics cover"} your ${garmentCount} ${
    garmentCount === 1 ? "garment" : "garments"
  }.`;

const labelOwnedFabricCancelTargets = (
  garmentKeys: readonly string[],
  getGarmentType: (garmentKey: string) => FabricGarmentType | null,
  occurrenceLabelByKey?: ReadonlyMap<string, string>,
): RemoveFabricAssignmentTarget[] => {
  // Prefer the order-wide occurrence label ("Standard Shirt 2") shared with the
  // Order Summary; fall back to within-list numbering for unknown keys.
  const items = garmentKeys.map((garmentKey) => {
    const occurrenceLabel = occurrenceLabelByKey?.get(garmentKey) ?? null;
    const garmentType = getGarmentType(garmentKey);
    return {
      garmentKey,
      occurrenceLabel,
      baseLabel: garmentType ? getFutureGarmentLabel(garmentType) : garmentKey,
    };
  });
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (item.occurrenceLabel) return;
    counts.set(item.baseLabel, (counts.get(item.baseLabel) || 0) + 1);
  });
  const seen = new Map<string, number>();
  return items.map((item) => {
    if (item.occurrenceLabel) {
      return { garmentKey: item.garmentKey, label: item.occurrenceLabel };
    }
    const prior = seen.get(item.baseLabel) || 0;
    seen.set(item.baseLabel, prior + 1);
    return {
      garmentKey: item.garmentKey,
      label:
        (counts.get(item.baseLabel) || 0) > 1
          ? `${item.baseLabel} ${prior + 1}`
          : item.baseLabel,
    };
  });
};

const getElementAttribute = (element: HTMLElement, name: string): string | null =>
  typeof element.getAttribute === "function" ? element.getAttribute(name) : null;

const hasElementAttribute = (element: HTMLElement, name: string): boolean =>
  typeof element.hasAttribute === "function"
    ? element.hasAttribute(name)
    : getElementAttribute(element, name) !== null;

const hasHiddenAncestor = (element: HTMLElement): boolean => {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      hasElementAttribute(current, "hidden") ||
      getElementAttribute(current, "aria-hidden") === "true" ||
      hasElementAttribute(current, "inert") ||
      Boolean((current as HTMLElement & { inert?: boolean }).inert)
    ) {
      return true;
    }

    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      try {
        const style = window.getComputedStyle(current);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse"
        ) {
          return true;
        }
      } catch {
        // Partial DOM implementations may not support computed styles.
      }
    }

    current = current.parentElement;
  }

  return false;
};

const isFocusEligible = (element: HTMLElement | null): element is HTMLElement => {
  if (!element) return false;
  if (typeof HTMLElement !== "undefined" && !(element instanceof HTMLElement)) {
    return false;
  }
  if (!element.isConnected) return false;
  if (
    Boolean((element as HTMLElement & { disabled?: boolean }).disabled) ||
    hasElementAttribute(element, "disabled") ||
    getElementAttribute(element, "aria-disabled") === "true" ||
    hasHiddenAncestor(element)
  ) {
    return false;
  }

  const tagName = element.tagName?.toUpperCase();
  const inputType =
    tagName === "INPUT"
      ? (element as HTMLInputElement).type?.toLowerCase()
      : null;
  if (inputType === "hidden") return false;

  const naturallyFocusable =
    tagName === "BUTTON" ||
    (tagName === "A" && hasElementAttribute(element, "href")) ||
    (tagName === "INPUT" && inputType !== "hidden") ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA" ||
    Boolean(element.isContentEditable);
  const tabIndex = typeof element.tabIndex === "number" ? element.tabIndex : null;
  const explicitlyFocusable =
    hasElementAttribute(element, "tabindex") && tabIndex !== null && tabIndex >= -1;

  return naturallyFocusable || explicitlyFocusable;
};

const didFocusElement = (element: HTMLElement): boolean => {
  if (typeof document === "undefined" || !("activeElement" in document)) {
    return true;
  }
  return document.activeElement === element;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STEP2_ASSIGNED_HIGHLIGHT_CLASS =
  "ring-2 ring-heritage-green motion-safe:animate-step2-assignment-success motion-reduce:animate-none";
// The next unassigned garment no longer gets its own gold ring flash: the
// Fabric Guide's gold beam already sits on that garment's next action while
// Continue is locked, so there is one clear cue instead of two.
const STEP2_NEXT_UNASSIGNED_HIGHLIGHT_CLASS = "";

const focusElementSafely = (element: HTMLElement): boolean => {
  if (!isFocusEligible(element)) return false;

  try {
    element.focus({ preventScroll: true });
  } catch {
    try {
      element.focus();
    } catch {
      return false;
    }
  }

  if (didFocusElement(element)) return true;

  try {
    element.focus();
  } catch {
    return false;
  }
  return didFocusElement(element);
};

export const DormantFutureFabricStep = ({
  fabrics,
  garmentTypeSelection,
  fabricAllocationState,
  completion,
  requiredPhysicalOccurrences,
  orphanRepairTargets = [],
  requiredFabricQuantity,
  selectedFabricQuantity,
  constructionPrice,
  orderType = null,
  onAssignFabricToGarment,
  onChangeFabricAllocationProduct,
  onRemoveFabricFromGarment,
  onRepairInvalidFabricAssignment,
  onUseSameFabricForGarment,
  onAssignSameFabricProduct,
  onAssignGarmentToExistingAllocation,
  onAutoPairNotice,
  onMoveGarmentToFabricAllocation,
  onBack,
  onContinue,
  onUseSameFabric,
  onChooseAnotherFabric,
  onCancelPendingFabric,
  orderSummary = null,
  contextualReentryGuidance = null,
  onDismissContextualReentryGuidance,
  unassignedFocusRequestId = null,
  unassignedFocusGarmentKey = null,
  onUnassignedFocusHandled,
  fabricsCatalogueState = "ready",
  onRetryFabricCatalogue,
}: DormantFutureFabricStepProps) => {
  void onUseSameFabricForGarment;
  const lastHandledUnassignedFocusRequestIdRef = useRef<number | null>(null);
  const fabricGuideIdPrefix = `future-fabric-guide-${useId().replace(/:/g, "")}`;
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);
  const [catalogueTargetGarmentKey, setCatalogueTargetGarmentKey] = useState<
    string | null
  >(null);
  const [isChangingFabricSelection, setIsChangingFabricSelection] =
    useState(false);
  /** True when Change Fabric was opened from a Fabric Selection summary chip. */
  const [isChangeFromSummary, setIsChangeFromSummary] = useState(false);
  const [assignmentAnnouncement, setAssignmentAnnouncement] = useState("");
  const [visibleActionError, setVisibleActionError] = useState<string | null>(
    null,
  );
  const [pendingOrphanRepair, setPendingOrphanRepair] =
    useState<HydratedOrphanFabricAssignmentRepairTarget | null>(null);
  const [orphanRepairError, setOrphanRepairError] = useState<string | null>(null);
  const [orphanRepairAnnouncement, setOrphanRepairAnnouncement] = useState("");
  const [focusAfterOrphanRepair, setFocusAfterOrphanRepair] = useState(false);
  const [pendingStep1FabricAssignment, setPendingStep1FabricAssignment] =
    useState<PendingStep1FabricAssignment | null>(null);
  const [pendingPartialFabricAssignment, setPendingPartialFabricAssignment] =
    useState<{ garmentKey: string } | null>(null);
  const [pendingChangeFabricAllocation, setPendingChangeFabricAllocation] =
    useState<{
      allocationId: string;
      nextFabricCode: string;
      nextFabricName: string;
      expectedCurrentFabricCode: string;
      expectedAssignmentSignature: string;
    } | null>(null);
  const [step1AssignmentError, setStep1AssignmentError] = useState<string | null>(
    null,
  );
  const [pendingRemovalRequest, setPendingRemovalRequest] = useState<number | null>(
    null,
  );
  const [pendingFabricRemoval, setPendingFabricRemoval] = useState<{
    fabric: Fabric;
    targets: RemoveFabricAssignmentTarget[];
  } | null>(null);
  useReportDesignStudioBlockingOverlay(
    "fabric-step",
    isCatalogueOpen ||
      pendingOrphanRepair !== null ||
      pendingStep1FabricAssignment !== null ||
      pendingPartialFabricAssignment !== null ||
      pendingChangeFabricAllocation !== null ||
      pendingFabricRemoval !== null,
  );
  const fabricRemovalTriggerRef = useRef<HTMLElement | null>(null);
  const orphanRepairTriggerRef = useRef<HTMLElement | null>(null);
  const orphanRepairDialogRef = useRef<HTMLDivElement | null>(null);
  const orphanRepairInitialFocusRef = useRef<HTMLButtonElement | null>(null);
  const orphanRepairHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const orphanRepairStatusRef = useRef<HTMLParagraphElement | null>(null);
  const orphanRepairActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const completedOrphanRepairTargetKeyRef = useRef<string | null>(null);
  const orphanRepairTitleId = useId();
  const orphanRepairDescriptionId = useId();
  const catalogueDialogRef = useRef<HTMLDivElement>(null);
  const catalogueSectionRef = useRef<HTMLDivElement>(null);
  const catalogueScrollAnchorRef = useRef<HTMLDivElement>(null);
  const summaryRowAnchorRef = useRef<HTMLDivElement>(null);
  const changeOpenedFromSummaryRef = useRef(false);
  const catalogueTriggerRef = useRef<HTMLElement | null>(null);
  const catalogueFocusGarmentKeyRef = useRef<string | null>(null);
  const catalogueFocusRequestRef = useRef(0);
  const postAssignmentFocusRequestRef = useRef(0);
  const garmentActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const garmentCardRefs = useRef(new Map<string, HTMLElement>());
  const garmentRemoveRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingPanelActionRef = useRef<HTMLButtonElement>(null);
  const quantityMoveActionRef = useRef<HTMLButtonElement>(null);
  const pendingPostAssignmentNavRef = useRef<{
    assignedGarmentKeys: string[];
    destinationGarmentKey: string;
    destinationKind: "assigned" | "next_unassigned";
  } | null>(null);
  const [postAssignmentHighlight, setPostAssignmentHighlight] = useState<{
    garmentKey: string;
    kind: "assigned" | "next_unassigned";
  } | null>(null);
  const [postAssignmentNavEpoch, setPostAssignmentNavEpoch] = useState(0);
  const catalogueHeadingRef = useRef<HTMLHeadingElement>(null);
  const changeFabricConfirmationTriggerRef = useRef<HTMLElement | null>(null);
  const changeFabricOpenerRef = useRef<HTMLElement | null>(null);
  const step1AssignmentTriggerRef = useRef<HTMLElement | null>(null);
  const step1AssignmentScrollYRef = useRef<number | null>(null);
  const pendingAssignmentAnnouncementRef = useRef<{
    fabricCode: string;
    fabricName: string;
    targetGarmentKey: string;
    assignmentGeneration: number;
  } | null>(null);
  const assignmentGenerationRef = useRef(0);
  const pendingRemovalAnnouncementRef = useRef<{
    request: number;
    garmentKey: string;
    garmentLabel: string;
    fabricName: string;
  } | null>(null);
  const removalRequestRef = useRef(0);
  const removalVerificationRequestRef = useRef<number | null>(null);
  const pendingRemovalScrollYRef = useRef<number | null>(null);

  const visibleFabrics = fabrics.filter(
    (fabric) => fabric.stockStatus !== "HIDDEN",
  );
  const pricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  const targets = getFutureFabricAssignmentTargetsFromAuthority({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  });
  // Order-wide customer labels ("Standard Shirt", "Standard Shirt 2") from the
  // same shared authority the Order Summary uses, walked in roster order.
  const occurrenceRoster = targets.map(({ assignment }) => ({
    garmentKey: assignment.garmentKey,
    garmentType: assignment.garmentType,
  }));
  const occurrenceRosterSignature = occurrenceRoster
    .map((entry) => `${entry.garmentKey}:${entry.garmentType}`)
    .join("|");
  const occurrenceConciseLabels = useMemo<ReadonlyMap<string, string>>(
    () =>
      new Map(
        [...projectOccurrenceDisplayLabels(occurrenceRoster)].map(
          ([garmentKey, labels]) => [garmentKey, labels.conciseLabel],
        ),
      ),
    // The roster signature is the stable identity; `occurrenceRoster` itself is
    // rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [occurrenceRosterSignature],
  );
  const activeCatalogueTarget = catalogueTargetGarmentKey
    ? targets.find(
        ({ assignment }) =>
          assignment.garmentKey === catalogueTargetGarmentKey,
      )
    : null;
  useEffect(() => {
    if (catalogueTargetGarmentKey && !activeCatalogueTarget) {
      setCatalogueTargetGarmentKey(null);
      setIsChangingFabricSelection(false);
    }
  }, [activeCatalogueTarget, catalogueTargetGarmentKey]);
  useEffect(
    () => () => {
      catalogueFocusRequestRef.current += 1;
      postAssignmentFocusRequestRef.current += 1;
      catalogueTriggerRef.current = null;
      catalogueFocusGarmentKeyRef.current = null;
      catalogueDialogRef.current = null;
      catalogueSectionRef.current = null;
      catalogueScrollAnchorRef.current = null;
      catalogueHeadingRef.current = null;
      garmentActionRefs.current.clear();
      garmentCardRefs.current.clear();
      pendingPostAssignmentNavRef.current = null;
      assignmentGenerationRef.current += 1;
      pendingAssignmentAnnouncementRef.current = null;
      pendingRemovalAnnouncementRef.current = null;
      removalVerificationRequestRef.current = null;
      pendingRemovalScrollYRef.current = null;
      orphanRepairTriggerRef.current = null;
      orphanRepairDialogRef.current = null;
      orphanRepairInitialFocusRef.current = null;
      orphanRepairHeadingRef.current = null;
      orphanRepairStatusRef.current = null;
      orphanRepairActionRefs.current.clear();
      completedOrphanRepairTargetKeyRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!contextualReentryGuidance || !onDismissContextualReentryGuidance) {
      return;
    }
    const timer = window.setTimeout(() => {
      onDismissContextualReentryGuidance();
    }, CONTEXTUAL_REENTRY_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [contextualReentryGuidance, onDismissContextualReentryGuidance]);
  const unassignedTargets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  });
  const assignmentByGarmentKey = useMemo(
    () =>
      new Map(
        fabricAllocationState.fabricAllocations.flatMap((allocation) =>
          allocation.garmentAssignments.map((assignment) => [
            assignment.garmentKey,
            { assignment, allocation },
          ]),
        ),
      ),
    [fabricAllocationState.fabricAllocations],
  );
  const pendingAdditionalAssignment =
    fabricAllocationState.awaitingFabricForPendingGarment
      ? fabricAllocationState.pendingFabricGarment
      : null;
  const isChangeFabricTarget = Boolean(
    catalogueTargetGarmentKey &&
      assignmentByGarmentKey.has(catalogueTargetGarmentKey),
  );
  const changeFabricAssignmentTarget = catalogueTargetGarmentKey
    ? assignmentByGarmentKey.get(catalogueTargetGarmentKey) ?? null
    : null;
  const changeFabricPresentation = useMemo(() => {
    if (!isChangingFabricSelection || !changeFabricAssignmentTarget) {
      return null;
    }
    return getFutureFabricAllocationGroupChangePresentation({
      state: fabricAllocationState,
      allocationId: changeFabricAssignmentTarget.allocation.allocationId,
      garmentTypeSelection,
      fabrics,
      garmentLabelByKey: occurrenceConciseLabels,
    });
  }, [
    isChangingFabricSelection,
    changeFabricAssignmentTarget,
    fabricAllocationState,
    fabrics,
    garmentTypeSelection,
    occurrenceConciseLabels,
  ]);
  const changingSelectionNumber =
    changeFabricPresentation?.fabricSelectionNumber ?? null;
  // Change Fabric opened from a garment card changes only that garment.
  const changingGarmentKey =
    changeFabricPresentation && !isChangeFromSummary && changeFabricAssignmentTarget
      ? changeFabricAssignmentTarget.assignment.garmentKey
      : null;
  // Garment-card Change names the garment in the catalogue heading.
  const changingGarmentLabel =
    changingGarmentKey && changeFabricPresentation
      ? changeFabricPresentation.garmentLabels[
          changeFabricPresentation.garmentKeys.indexOf(changingGarmentKey)
        ] ?? null
      : null;
  const changeHeadingTarget = changeFabricPresentation
    ? changingGarmentLabel ??
      `Selection ${changeFabricPresentation.fabricSelectionNumber}`
    : "";
  const changingGarmentOnlyCopy =
    changingGarmentKey && changeFabricPresentation?.isSharedGroup
      ? formatChangeOneGarmentCopy({
          garmentKey: changingGarmentKey,
          garmentKeys: changeFabricPresentation.garmentKeys,
          garmentLabels: changeFabricPresentation.garmentLabels,
          fabricName: changeFabricPresentation.fabricName,
        })
      : null;
  const changingFabric = changeFabricPresentation
    ? fabrics.find(
        (candidate) => candidate.code === changeFabricPresentation.fabricCode,
      ) ?? null
    : null;
  const fabricSelectionSummaryItems = useMemo(
    () =>
      buildFabricSelectionSummaryItems({
        fabricAllocationState,
        garmentTypeSelection,
        fabrics,
        garmentLabelByKey: occurrenceConciseLabels,
      }),
    [fabricAllocationState, garmentTypeSelection, fabrics, occurrenceConciseLabels],
  );
  const changingAllocationId =
    changeFabricPresentation?.allocationId ?? null;
  const firstChangingGarmentKey = changeFabricPresentation
    ? getFirstChangingGarmentKey(
        targets.map(({ assignment }) => assignment.garmentKey),
        changeFabricPresentation.garmentKeys,
      )
    : null;
  const pendingChangeFabricPresentation = useMemo(() => {
    if (!pendingChangeFabricAllocation) {
      return null;
    }
    return getFutureFabricAllocationGroupChangePresentation({
      state: fabricAllocationState,
      allocationId: pendingChangeFabricAllocation.allocationId,
      garmentTypeSelection,
      fabrics,
      garmentLabelByKey: occurrenceConciseLabels,
    });
  }, [
    pendingChangeFabricAllocation,
    fabricAllocationState,
    garmentTypeSelection,
    fabrics,
    occurrenceConciseLabels,
  ]);
  const unassignedStep1Targets = getUnassignedStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const isPendingAdditionalCatalogueTarget = Boolean(
    pendingAdditionalAssignment &&
      (!catalogueTargetGarmentKey ||
        catalogueTargetGarmentKey === pendingAdditionalAssignment.garmentKey),
  );
  // A targeted Additional occurrence is repaired one occurrence at a time.
  // It must never fall through to the Step 1 bulk catalogue, whose candidate
  // set deliberately excludes later additional occurrences.
  const isTargetedAdditionalCatalogueTarget = Boolean(
    activeCatalogueTarget?.assignment.sourceRole === "additional",
  );
  const isStep1CatalogueMode =
    !isChangeFabricTarget &&
    !isPendingAdditionalCatalogueTarget &&
    !isTargetedAdditionalCatalogueTarget;
  // One fabric piece per garment is the limit; Fabrics Needed is only the
  // recommendation, so holding more pieces than Fabrics Needed is fine.
  const maxFabricPieces = getMaxPhysicalFabricAllocationCount({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
  });
  const maxFabricPiecesWithPending = getMaxPhysicalFabricAllocationCount({
    garmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences,
    countPendingGarmentForCapacity: true,
  });
  const isOverAllocated = completion.blockers.some(
    (blocker) => blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED",
  );
  // Every garment has fabric and the order is within one piece per garment.
  const fabricProgressComplete =
    completion.requiredGarmentCount > 0 &&
    completion.assignedGarmentCount === completion.requiredGarmentCount &&
    !isOverAllocated;
  const partialAllocationSummaryById = useMemo(
    () =>
      new Map(
        getFuturePartialFabricAllocationSummaries({
          fabricAllocationState,
        }).map((summary) => [summary.allocationId, summary]),
      ),
    [fabricAllocationState],
  );
  const compatiblePartialTargets = useMemo(
    () =>
      getFuturePartialFabricAllocationCompatibleTargets({
        garmentTypeSelection,
        fabricAllocationState,
        requiredPhysicalOccurrences,
      }).filter((entry) => entry.compatibleGarmentKeys.length > 0),
    [garmentTypeSelection, fabricAllocationState, requiredPhysicalOccurrences],
  );
  const showAvoidablePartialGuidance =
    !isOverAllocated &&
    hasAvoidablePartialFabricAllocation({
      garmentTypeSelection,
      fabricAllocationState,
      requiredPhysicalOccurrences,
    });
  const avoidablePartialGuidanceCopy =
    compatiblePartialTargets.length > 1 ||
    compatiblePartialTargets.some(
      (entry) => entry.compatibleGarmentKeys.length > 1,
    )
      ? "Complete your selected Fabrics by assigning the remaining garments to available Fabric capacity."
      : "Complete your selected Fabric by assigning the remaining garment to it.";
  const fabricSlotsAvailable = selectedFabricQuantity < requiredFabricQuantity;
  const resolveUnassignedGarmentFabricAction = (
    garmentKey: string,
  ): "add_fabric" | "assign_to_fabric" | "blocked" => {
    if (fabricSlotsAvailable) {
      return "add_fabric";
    }
    const compatibleAllocations = getFutureCompatiblePartialFabricAllocations({
      garmentTypeSelection,
      fabricAllocationState,
      garmentKey,
      requiredPhysicalOccurrences,
    });
    if (compatibleAllocations.length > 0) {
      return "assign_to_fabric";
    }
    // At Fabrics Needed with no piece it can pair on, the garment may still
    // take its own new piece (one piece per garment).
    if (
      canCreatePhysicalFabricAllocation({
        state: fabricAllocationState,
        garmentTypeSelection,
        requiredPhysicalOccurrences,
      })
    ) {
      return "add_fabric";
    }
    return "blocked";
  };
  const fabricNameByCode = useMemo(
    () => new Map(fabrics.map((fabric) => [fabric.code, fabric.name])),
    [fabrics],
  );
  const fabricByCode = useMemo(
    () => new Map(fabrics.map((fabric) => [fabric.code, fabric])),
    [fabrics],
  );
  const orphanRepairAllocationNumberById = useMemo(() => {
    const allocationIds = [
      ...new Set(orphanRepairTargets.map((target) => target.allocationId)),
    ];
    return new Map(
      allocationIds.map((allocationId, index) => [allocationId, index + 1]),
    );
  }, [orphanRepairTargets]);
  const partialAssignmentPresentations = pendingPartialFabricAssignment
    ? getFuturePartialFabricAssignmentTargetPresentations({
        garmentTypeSelection,
        fabricAllocationState,
        garmentKey: pendingPartialFabricAssignment.garmentKey,
        requiredPhysicalOccurrences,
      })
    : [];
  // Neutral note once the order has its Fabrics Needed and garments remain:
  // other prints stay selectable. Not shown while changing a selection's
  // fabric, which swaps the print on an existing piece.
  const showAllocationLimitCopy =
    !isChangeFabricTarget &&
    !isOverAllocated &&
    selectedFabricQuantity >= requiredFabricQuantity &&
    requiredFabricQuantity > 0 &&
    (unassignedStep1Targets.length > 0 ||
      unassignedTargets.length > 0 ||
      Boolean(pendingAdditionalAssignment));
  const step1AssignmentCandidates = pendingStep1FabricAssignment
    ? buildStep1FabricAssignmentCandidates({
        garmentTypeSelection,
        fabricAllocationState,
        fabricCode: pendingStep1FabricAssignment.fabricCode,
        fabrics,
      })
    : [];
  const step1AssignmentDialogFabric = pendingStep1FabricAssignment
    ? resolveStep1AssignmentDialogFabric({
        fabrics,
        fabricCode: pendingStep1FabricAssignment.fabricCode,
        displaySnapshot: pendingStep1FabricAssignment.displayFabric,
      })
    : null;
  const step1AssignmentEvaluation = pendingStep1FabricAssignment
    ? evaluateStep1FabricAssignmentSelection({
        candidates: step1AssignmentCandidates,
        selectedGarmentKeys: pendingStep1FabricAssignment.selectedGarmentKeys,
        garmentTypeSelection,
        fabricAllocationState,
        fabricCode: pendingStep1FabricAssignment.fabricCode,
        fabrics,
      })
    : null;
  const pendingStep1StockPresentation =
    pendingStep1FabricAssignment && step1AssignmentDialogFabric
      ? projectPendingStep1FabricStockPresentation({
          fabric: step1AssignmentDialogFabric.currentFabric || {
            code: pendingStep1FabricAssignment.displayFabric.fabricCode,
            stockStatus: pendingStep1FabricAssignment.displayFabric.stockStatus,
            stock: pendingStep1FabricAssignment.displayFabric.stock,
          },
          fabricAllocationState,
          selectedGarmentKeys: pendingStep1FabricAssignment.selectedGarmentKeys,
          garmentTypeSelection,
          fabrics,
        })
      : null;
  useEffect(() => {
    const pendingRemoval = pendingRemovalAnnouncementRef.current;
    if (!pendingRemoval) {
      return;
    }

    if (pendingRemoval.request !== removalRequestRef.current) {
      pendingRemovalAnnouncementRef.current = null;
      pendingRemovalScrollYRef.current = null;
      setPendingRemovalRequest(null);
      return;
    }

    if (assignmentByGarmentKey.has(pendingRemoval.garmentKey)) {
      if (removalVerificationRequestRef.current !== pendingRemoval.request) {
        removalVerificationRequestRef.current = pendingRemoval.request;
        const verifyNoOp = () => {
          removalVerificationRequestRef.current = null;
          const latestRemoval = pendingRemovalAnnouncementRef.current;
          if (
            !latestRemoval ||
            latestRemoval.request !== pendingRemoval.request
          ) {
            return;
          }
          if (assignmentByGarmentKey.has(latestRemoval.garmentKey)) {
            pendingRemovalAnnouncementRef.current = null;
            pendingRemovalScrollYRef.current = null;
            setPendingRemovalRequest(null);
            postAssignmentFocusRequestRef.current += 1;
          }
        };
        if (
          typeof window !== "undefined" &&
          typeof window.requestAnimationFrame === "function"
        ) {
          window.requestAnimationFrame(verifyNoOp);
        } else {
          verifyNoOp();
        }
      }
      return;
    }

    setVisibleActionError(null);
    setAssignmentAnnouncement(
      `${pendingRemoval.fabricName} removed from ${pendingRemoval.garmentLabel}.`,
    );
    pendingRemovalAnnouncementRef.current = null;
    removalVerificationRequestRef.current = null;
    setPendingRemovalRequest(null);
    const scrollY = pendingRemovalScrollYRef.current;
    pendingRemovalScrollYRef.current = null;
    focusPostAssignmentDestination(pendingRemoval.garmentKey, scrollY);
  }, [
    assignmentByGarmentKey,
    fabricAllocationState.fabricAllocations,
    pendingRemovalRequest,
  ]);
  const showContinueAction =
    completion.isComplete && !isCatalogueOpen && !pendingStep1FabricAssignment;
  const labelForQuantityGarmentKey = (garmentKey: string): string => {
    const concise = occurrenceConciseLabels.get(garmentKey);
    if (concise) return concise;
    const target = targets.find(
      ({ assignment }) => assignment.garmentKey === garmentKey,
    );
    return target ? getFutureGarmentLabel(target.assignment.garmentType) : "A garment";
  };
  const quantityStrandedBlockers = completion.blockers.filter(
    (blocker) => blocker.code === "FABRIC_QUANTITY_STRANDED",
  );
  const isQuantityStranded = quantityStrandedBlockers.length > 0;
  const quantityStrandedGarmentLabels = quantityStrandedBlockers
    .map((blocker) => blocker.garmentKey)
    .filter((garmentKey): garmentKey is string => Boolean(garmentKey))
    .map(labelForQuantityGarmentKey);
  const formatBlockerMessage = (
    blocker: FutureFabricStageCompletion["blockers"][number],
  ): string =>
    blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED"
      ? formatFabricQuantityOverAllocatedCopy(
          selectedFabricQuantity,
          maxFabricPieces,
        )
      : blocker.code === "FABRIC_QUANTITY_STRANDED"
        ? formatFabricQuantityStrandedCopy(
            quantityStrandedGarmentLabels,
            requiredFabricQuantity,
          )
      : blocker.code === "FABRIC_STOCK_OVER_ALLOCATED"
        ? formatFutureFabricStockOverAllocatedBlockerMessage(
            fabrics,
            fabricAllocationState,
            blocker.fabricCode,
          )
        : blockerMessages[blocker.code];
  const quantityRepair =
    (isOverAllocated || isQuantityStranded) && onMoveGarmentToFabricAllocation
      ? getFabricQuantityOverAllocationRepair({
          state: fabricAllocationState,
          garmentTypeSelection,
          requiredPhysicalOccurrences,
        })
      : null;
  const quantityRepairGarmentLabel = quantityRepair
    ? occurrenceConciseLabels.get(quantityRepair.garmentKey) ??
      (() => {
          const assignment = fabricAllocationState.fabricAllocations
            .flatMap((allocation) => allocation.garmentAssignments)
            .find((candidate) => candidate.garmentKey === quantityRepair.garmentKey);
          return assignment
            ? getFutureGarmentLabel(assignment.garmentType)
            : "This garment";
        })()
    : null;
  const quantityRepairFabricName = quantityRepair
    ? fabrics.find((fabric) => fabric.code === quantityRepair.toFabricCode)?.name ??
      quantityRepair.toFabricCode
    : null;
  // One merged Guide: the old "Fabric needs attention" messages, the
  // avoidable-partial hint and the next-garment cue are steps in this flow.
  // It is hidden whenever the canonical completion says Continue can unlock.
  const fabricGuideGarments = targets.map(({ assignment }) => {
    const assigned = assignmentByGarmentKey.get(assignment.garmentKey);
    return {
      garmentKey: assignment.garmentKey,
      label:
        occurrenceConciseLabels.get(assignment.garmentKey) ??
        getFutureGarmentLabel(assignment.garmentType),
      assigned: Boolean(assigned),
      fabricCode: assigned?.allocation.fabricCode ?? null,
      allocationId: assigned?.allocation.allocationId ?? null,
      action: assigned
        ? null
        : resolveUnassignedGarmentFabricAction(assignment.garmentKey),
    };
  });
  const fabricGuideGarmentLabels = new Map(
    fabricGuideGarments.map((garment) => [garment.garmentKey, garment.label]),
  );
  const fabricGuideFlow = buildFabricGuideFlow({
    isComplete: completion.isComplete,
    garments: fabricGuideGarments,
    blockers: completion.blockers.map((blocker) => ({
      code: blocker.code,
      message: formatBlockerMessage(blocker),
      garmentKey: blocker.garmentKey,
      allocationId: blocker.allocationId,
      fabricCode: blocker.fabricCode,
    })),
    selectedFabricQuantity,
    allocationOrder: fabricAllocationState.fabricAllocations.map(
      (allocation) => allocation.allocationId,
    ),
    orphanRepairKeys: orphanRepairTargets.map(getOrphanRepairTargetKey),
    pendingPanelVisible: Boolean(
      fabricAllocationState.pendingFabricGarment &&
        !fabricAllocationState.awaitingFabricForPendingGarment,
    ),
    awaitingFabricGarmentKey: pendingAdditionalAssignment?.garmentKey ?? null,
    catalogueTargetGarmentKey,
    avoidablePartialGuidance: showAvoidablePartialGuidance
      ? avoidablePartialGuidanceCopy
      : null,
    noCapacityMessage: UNASSIGNED_FABRIC_NO_CAPACITY_MESSAGE,
    quantityRepair:
      quantityRepair && quantityRepairGarmentLabel && quantityRepairFabricName
        ? {
            garmentKey: quantityRepair.garmentKey,
            message: formatFabricQuantityMoveCopy({
              garmentLabel: quantityRepairGarmentLabel,
              toSelectionNumber: quantityRepair.toSelectionNumber,
              toFabricName: quantityRepairFabricName,
              sameFabric: quantityRepair.sameFabric,
              requiredFabricQuantity: maxFabricPieces,
              makesRoomForLabels:
                quantityRepair.kind === "stranded"
                  ? quantityRepair.strandedGarmentKeys.map(
                      labelForQuantityGarmentKey,
                    )
                  : undefined,
            }),
          }
        : null,
  });
  const fabricGuideBeamTarget: FabricGuideTarget | null =
    fabricGuideFlow.visible && fabricGuideFlow.currentStep
      ? fabricGuideFlow.currentStep.target
      : null;
  const isFabricGuideBeamOn = (
    type: FabricGuideTarget["type"],
    key?: string,
  ): boolean => {
    const target = fabricGuideBeamTarget;
    if (!target || target.type !== type) return false;
    if (
      target.type === "garment_action" ||
      target.type === "garment_card" ||
      target.type === "garment_remove" ||
      target.type === "quantity_move"
    ) {
      return target.garmentKey === key;
    }
    if (target.type === "orphan_repair") return target.repairKey === key;
    return true;
  };
  const fabricGuideBeamClass = (
    type: FabricGuideTarget["type"],
    key?: string,
  ): string =>
    isFabricGuideBeamOn(type, key) ? DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS : "";
  const catalogueNotice = resolveFabricCatalogueNotice({
    loadState: fabricsCatalogueState,
    visibleCount: visibleFabrics.length,
  });
  const catalogueNoticeReplacesGrid =
    catalogueNotice === "loading" ||
    catalogueNotice === "empty" ||
    (catalogueNotice === "error" && visibleFabrics.length === 0);

  const scrollToFabricCatalogue = () => {
    const anchor = catalogueScrollAnchorRef.current;
    if (anchor && typeof anchor.scrollIntoView === "function") {
      anchor.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    }
    if (catalogueHeadingRef.current) {
      focusElementSafely(catalogueHeadingRef.current);
    }
  };

  const scrollToChangingFabricSelection = (garmentKey: string | null) => {
    if (!garmentKey) return;
    const card = garmentCardRefs.current.get(garmentKey);
    if (!card || typeof card.scrollIntoView !== "function") return;
    let headerHeight = 80;
    if (typeof document !== "undefined" && typeof document.querySelector === "function") {
      const header = document.querySelector("header");
      if (header && typeof header.getBoundingClientRect === "function") {
        headerHeight = header.getBoundingClientRect().height || headerHeight;
      }
    }
    const marginTop = resolveFabricSelectionScrollMarginTopPx(headerHeight);
    if (card.style) {
      card.style.scrollMarginTop = `${marginTop}px`;
    }
    card.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  };

  const renderVisibleCatalogue = (gridClassName: string) => (
    <>
      {catalogueNotice === "error" && visibleFabrics.length > 0 ? (
        <div className="mb-4">
          <FabricCatalogueNotice
            kind="error"
            onRetry={onRetryFabricCatalogue}
          />
        </div>
      ) : null}
      <div className={gridClassName}>
        {catalogueNoticeReplacesGrid && catalogueNotice ? (
          <FabricCatalogueNotice
            kind={catalogueNotice}
            onRetry={onRetryFabricCatalogue}
          />
        ) : (
          visibleFabrics.map((fabric) => renderCatalogueCard(fabric))
        )}
      </div>
    </>
  );

  const restoreCatalogueFocus = () => {
    const request = ++catalogueFocusRequestRef.current;
    const clearRestorationState = () => {
      catalogueTriggerRef.current = null;
      catalogueFocusGarmentKeyRef.current = null;
    };
    const restore = () => {
      if (request !== catalogueFocusRequestRef.current) return;

      const candidates = [
        catalogueTriggerRef.current,
        catalogueFocusGarmentKeyRef.current
          ? garmentActionRefs.current.get(catalogueFocusGarmentKeyRef.current)
          : null,
        catalogueHeadingRef.current,
        catalogueSectionRef.current,
      ];

      for (const candidate of candidates) {
        if (candidate && focusElementSafely(candidate)) {
          clearRestorationState();
          return;
        }
      }

      clearRestorationState();
    };

    if (typeof window === "undefined") {
      clearRestorationState();
      return;
    }
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restore);
    } else {
      restore();
    }
  };

  const closeCatalogueForCancellation = () => {
    postAssignmentFocusRequestRef.current += 1;
    setPendingChangeFabricAllocation(null);
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    setIsChangingFabricSelection(false);
    restoreCatalogueFocus();
  };

  /**
   * "Cancel change" keeps the page where the customer started: back on the
   * Fabric Selection summary row (summary-row changes) or on the trigger that
   * opened Change Fabric. Runs after focus restoration so nothing else (layout
   * collapse, scroll FABs) leaves the page parked at the bottom.
   */
  const cancelFabricChangeKeepingPlace = () => {
    const fromSummary = changeOpenedFromSummaryRef.current;
    const trigger = catalogueTriggerRef.current;
    const startScrollY =
      typeof window !== "undefined" && typeof window.scrollY === "number"
        ? window.scrollY
        : null;
    changeOpenedFromSummaryRef.current = false;
    closeCatalogueForCancellation();
    if (typeof window === "undefined") return;
    const request = catalogueFocusRequestRef.current;
    const settle = () => {
      if (request !== catalogueFocusRequestRef.current) return;
      const target = fromSummary
        ? summaryRowAnchorRef.current
        : trigger && trigger.isConnected !== false
          ? trigger
          : null;
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({
          behavior: "auto",
          block: fromSummary ? "start" : "nearest",
        });
        return;
      }
      if (startScrollY !== null && typeof window.scrollTo === "function") {
        window.scrollTo({ top: startScrollY, behavior: "auto" });
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.requestAnimationFrame(settle));
    } else {
      settle();
    }
  };

  const focusPostAssignmentDestination = (
    garmentKey: string,
    restoreScrollY: number | null = null,
  ) => {
    const request = ++postAssignmentFocusRequestRef.current;
    const focus = () => {
      if (request !== postAssignmentFocusRequestRef.current) return;

      const garmentAction = garmentActionRefs.current.get(garmentKey);
      const focused =
        (garmentAction && focusElementSafely(garmentAction)) ||
        // The garment can disappear while the parent reconciles an assignment;
        // keep focus in the mounted Step 2 surface without invoking cancellation fallback.
        focusElementSafely(catalogueSectionRef.current);
      if (
        focused &&
        restoreScrollY !== null &&
        typeof window !== "undefined" &&
        typeof window.scrollTo === "function"
      ) {
        window.scrollTo({ top: restoreScrollY, behavior: "auto" });
      }
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focus);
    } else {
      focus();
    }
  };

  const navigateToStep2PostAssignmentDestination = (
    garmentKey: string,
    kind: "assigned" | "next_unassigned",
  ) => {
    const request = ++postAssignmentFocusRequestRef.current;
    setPostAssignmentHighlight({ garmentKey, kind });
    const focus = () => {
      if (request !== postAssignmentFocusRequestRef.current) return;
      const card = garmentCardRefs.current.get(garmentKey);
      if (card && typeof card.scrollIntoView === "function") {
        card.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
      }
      const garmentAction = garmentActionRefs.current.get(garmentKey);
      if (garmentAction) {
        focusElementSafely(garmentAction);
      }
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(focus);
    } else {
      focus();
    }
  };

  useEffect(() => {
    if (
      unassignedFocusRequestId == null ||
      !unassignedFocusGarmentKey ||
      lastHandledUnassignedFocusRequestIdRef.current === unassignedFocusRequestId
    ) {
      return;
    }
    lastHandledUnassignedFocusRequestIdRef.current = unassignedFocusRequestId;
    navigateToStep2PostAssignmentDestination(
      unassignedFocusGarmentKey,
      "next_unassigned",
    );
    onUnassignedFocusHandled?.(unassignedFocusRequestId);
  }, [
    unassignedFocusRequestId,
    unassignedFocusGarmentKey,
    onUnassignedFocusHandled,
  ]);

  const completeCatalogueAssignment = (garmentKey: string) => {
    catalogueFocusRequestRef.current += 1;
    catalogueTriggerRef.current = null;
    catalogueFocusGarmentKeyRef.current = null;
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    setIsChangingFabricSelection(false);
    focusPostAssignmentDestination(garmentKey);
  };

  const restoreStep1AssignmentFocus = () => {
    const trigger = step1AssignmentTriggerRef.current;
    const restoreScrollY = step1AssignmentScrollYRef.current;
    step1AssignmentTriggerRef.current = null;
    step1AssignmentScrollYRef.current = null;
    const restoreScroll = () => {
      if (
        restoreScrollY !== null &&
        typeof window !== "undefined" &&
        typeof window.scrollTo === "function"
      ) {
        window.scrollTo({ top: restoreScrollY, behavior: "auto" });
      }
    };
    try {
      if (trigger && focusElementSafely(trigger)) {
        restoreScroll();
        return;
      }
    } catch {
      // The original card may have disappeared with the Fabric.
    }
    try {
      if (focusElementSafely(catalogueHeadingRef.current)) {
        restoreScroll();
        return;
      }
    } catch {
      // Heading may be unmounted during catalogue transitions.
    }
    try {
      focusElementSafely(catalogueSectionRef.current);
    } catch {
      // Nearest Step 2 fallback must never throw.
    }
    restoreScroll();
  };

  const closeStep1FabricAssignment = () => {
    setPendingStep1FabricAssignment(null);
    setStep1AssignmentError(null);
  };

  const restoreFabricRemovalFocus = () => {
    const trigger = fabricRemovalTriggerRef.current;
    fabricRemovalTriggerRef.current = null;
    try {
      if (trigger && focusElementSafely(trigger)) return;
    } catch {
      // The original card control may have been replaced after removal.
    }
  };

  const closeFabricRemovalChooser = (restoreFocus: boolean) => {
    setPendingFabricRemoval(null);
    if (restoreFocus) {
      restoreFabricRemovalFocus();
      return;
    }
    fabricRemovalTriggerRef.current = null;
  };

  const restoreOrphanRepairTriggerFocus = () => {
    const trigger = orphanRepairTriggerRef.current;
    orphanRepairTriggerRef.current = null;
    const restore = () => {
      if (trigger) focusElementSafely(trigger);
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(restore);
      return;
    }
    restore();
  };

  const closeOrphanRepairDialog = (restoreFocus: boolean) => {
    setPendingOrphanRepair(null);
    if (restoreFocus) {
      restoreOrphanRepairTriggerFocus();
      return;
    }
    orphanRepairTriggerRef.current = null;
  };

  const openOrphanRepairDialog = (
    target: HydratedOrphanFabricAssignmentRepairTarget,
    trigger: HTMLElement,
  ) => {
    orphanRepairTriggerRef.current = trigger;
    setOrphanRepairError(null);
    setPendingOrphanRepair(target);
  };

  const confirmOrphanRepair = () => {
    if (!pendingOrphanRepair || !onRepairInvalidFabricAssignment) return;
    const result = onRepairInvalidFabricAssignment(pendingOrphanRepair);
    if (result.status !== "removed") {
      completedOrphanRepairTargetKeyRef.current = null;
      setOrphanRepairError(
        "This saved Fabric assignment changed before it could be removed. Review the current repair items and try again.",
      );
      setOrphanRepairAnnouncement(
        "The invalid Fabric assignment was not removed because the saved assignment changed.",
      );
      closeOrphanRepairDialog(false);
      setFocusAfterOrphanRepair(true);
      return;
    }

    const fabricName =
      fabrics.find((fabric) => fabric.code === pendingOrphanRepair.fabricCode)
        ?.name ?? pendingOrphanRepair.fabricCode;
    setOrphanRepairError(null);
    completedOrphanRepairTargetKeyRef.current =
      getOrphanRepairTargetKey(pendingOrphanRepair);
    setOrphanRepairAnnouncement(
      `Invalid saved assignment for ${fabricName} removed.`,
    );
    closeOrphanRepairDialog(false);
    setFocusAfterOrphanRepair(true);
  };

  useEffect(() => {
    if (!pendingOrphanRepair) return;
    const dialog = orphanRepairDialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body?.style?.overflow;
    if (document.body?.style) document.body.style.overflow = "hidden";
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    (orphanRepairInitialFocusRef.current || dialog).focus?.();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOrphanRepairDialog(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      if (document.body?.style && previousOverflow !== undefined) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [pendingOrphanRepair]);

  useEffect(() => {
    if (!focusAfterOrphanRepair) return;
    const completedTargetKey = completedOrphanRepairTargetKeyRef.current;
    if (
      completedTargetKey &&
      orphanRepairTargets.some(
        (target) => getOrphanRepairTargetKey(target) === completedTargetKey,
      )
    ) {
      return;
    }
    setFocusAfterOrphanRepair(false);
    completedOrphanRepairTargetKeyRef.current = null;
    const focus = () => {
      const nextTarget = orphanRepairTargets[0];
      const nextAction = nextTarget
        ? orphanRepairActionRefs.current.get(getOrphanRepairTargetKey(nextTarget))
        : null;
      if (nextAction && focusElementSafely(nextAction)) return;
      if (focusElementSafely(orphanRepairStatusRef.current)) return;
      focusElementSafely(orphanRepairHeadingRef.current);
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(focus);
      return;
    }
    focus();
  }, [focusAfterOrphanRepair, orphanRepairTargets]);

  const cancelStep1FabricAssignment = () => {
    pendingPostAssignmentNavRef.current = null;
    postAssignmentFocusRequestRef.current += 1;
    closeStep1FabricAssignment();
    restoreStep1AssignmentFocus();
  };

  const announceAssignedGarments = (
    fabricName: string,
    garmentKeys: string[],
    nextUnassignedLabel: string | null = null,
  ) => {
    const labels = garmentKeys
      .map((garmentKey) => {
        const target = targets.find(
          ({ assignment }) => assignment.garmentKey === garmentKey,
        );
        return target
          ? getFutureGarmentLabel(target.assignment.garmentType)
          : null;
      })
      .filter((label): label is string => Boolean(label));
    if (labels.length > 0) {
      const assignedCopy = `${fabricName} assigned to ${formatGarmentList(labels)}.`;
      setVisibleActionError(null);
      setAssignmentAnnouncement(
        nextUnassignedLabel
          ? `${assignedCopy} Next: ${nextUnassignedLabel} needs fabric.`
          : assignedCopy,
      );
    }
  };

  const reportBlockedStep1FabricAssignment = (
    error: string,
    keepDialog: boolean,
  ) => {
    pendingPostAssignmentNavRef.current = null;
    if (keepDialog) {
      setStep1AssignmentError(error);
    } else {
      setVisibleActionError(error);
    }
    setAssignmentAnnouncement(error);
  };

  const finalizeSuccessfulStep1FabricAssignment = (
    fabricName: string,
    assignedKeys: string[],
  ) => {
    const canonicalGarmentKeys = getFutureFabricStep1AssignmentTargets(
      garmentTypeSelection,
    ).map(({ assignment }) => assignment.garmentKey);
    const assignedNow = new Set([
      ...assignmentByGarmentKey.keys(),
      ...assignedKeys,
    ]);
    const remainingUnassignedGarmentKeys = canonicalGarmentKeys.filter(
      (garmentKey) => !assignedNow.has(garmentKey),
    );
    const destination = resolveStep2PostAssignmentDestination({
      assignedGarmentKeys: assignedKeys,
      canonicalGarmentKeys,
      remainingUnassignedGarmentKeys,
    });
    const nextTarget =
      destination?.kind === "next_unassigned"
        ? targets.find(
            ({ assignment }) => assignment.garmentKey === destination.garmentKey,
          )
        : null;
    const nextUnassignedLabel = nextTarget
      ? getFutureGarmentLabel(nextTarget.assignment.garmentType)
      : null;
    step1AssignmentTriggerRef.current = null;
    step1AssignmentScrollYRef.current = null;
    catalogueFocusRequestRef.current += 1;
    catalogueTriggerRef.current = null;
    catalogueFocusGarmentKeyRef.current = null;
    setCatalogueTargetGarmentKey(null);
    setIsChangingFabricSelection(false);
    setIsCatalogueOpen(false);
    pendingPostAssignmentNavRef.current = destination
      ? {
          assignedGarmentKeys: assignedKeys,
          destinationGarmentKey: destination.garmentKey,
          destinationKind: destination.kind,
        }
      : null;
    closeStep1FabricAssignment();
    announceAssignedGarments(fabricName, assignedKeys, nextUnassignedLabel);
    setPostAssignmentNavEpoch((current) => current + 1);
  };

  /**
   * Runs `run("auto")`: a garment pairs automatically onto an existing piece
   * of the same print that has room (no pair-or-new-piece question).
   * `run` returns the resulting state; when any garment joined a piece that
   * already existed in `beforeState`, a short toast names only those
   * garments and the piece's Selection number after any renumbering. The
   * customer can split a paired garment off later with Change Fabric.
   */
  const runWithAutoPairing = (
    fabric: Fabric,
    garmentKeys: readonly string[],
    run: (placement: FutureFabricPiecePlacement) => FabricAllocationState | null,
    beforeState: FabricAllocationState = fabricAllocationState,
  ) => {
    const afterState = run("auto");
    if (!afterState) return;
    const pairings = getFutureFabricAutoPairings({
      before: beforeState,
      after: afterState,
      fabricCode: fabric.code,
      garmentKeys,
    });
    if (pairings.length === 0) return;
    const labelFor = (garmentKey: string) => {
      const target = targets.find(
        ({ assignment }) => assignment.garmentKey === garmentKey,
      );
      const pendingType =
        fabricAllocationState.pendingFabricGarment?.garmentKey === garmentKey
          ? fabricAllocationState.pendingFabricGarment.garmentType
          : null;
      return target
        ? occurrenceConciseLabels.get(garmentKey) ||
            getFutureGarmentLabel(target.assignment.garmentType)
        : pendingType
          ? getFutureGarmentLabel(pendingType)
          : "this garment";
    };
    const message = formatFabricAutoPairToastCopy(
      pairings.map((pairing) => ({
        garmentLabels: pairing.garmentKeys.map(labelFor),
        selectionNumber: pairing.selectionNumber,
      })),
      formatGarmentList,
    );
    if (message) onAutoPairNotice?.(message);
  };

  const applyCommittedStep1FabricAssignment = ({
    fabricCode,
    fabricName,
    assignedGarmentKeys,
    keepDialogOnBlock,
    placement = "auto",
  }: {
    fabricCode: string;
    fabricName: string;
    assignedGarmentKeys: string[];
    keepDialogOnBlock: boolean;
    placement?: FutureFabricPiecePlacement;
  }) => {
    const parentResult = onAssignSameFabricProduct(
      fabricCode,
      assignedGarmentKeys,
      placement,
    );
    if (parentResult && parentResult.status === "blocked") {
      reportBlockedStep1FabricAssignment(
        "That fabric could not be assigned. No garments were changed.",
        keepDialogOnBlock,
      );
      return null;
    }
    const assignedKeys =
      parentResult && parentResult.status === "assigned"
        ? parentResult.assignedGarmentKeys
        : assignedGarmentKeys;
    finalizeSuccessfulStep1FabricAssignment(fabricName, assignedKeys);
    return parentResult && parentResult.status === "assigned"
      ? parentResult.state
      : null;
  };

  const commitPendingStep1FabricAssignment = (
    mode: "selected" | "all_remaining",
  ) => {
    if (!pendingStep1FabricAssignment) return;
    if (step1AssignmentDialogFabric?.unavailableError) {
      reportBlockedStep1FabricAssignment(
        step1AssignmentDialogFabric.unavailableError,
        true,
      );
      return;
    }
    const fabricName =
      step1AssignmentDialogFabric?.currentFabric?.name ||
      pendingStep1FabricAssignment.displayFabric.fabricName ||
      pendingStep1FabricAssignment.fabricCode;
    const fabricCode = pendingStep1FabricAssignment.fabricCode;
    const selectedGarmentKeys = pendingStep1FabricAssignment.selectedGarmentKeys;
    const commit = (placement: FutureFabricPiecePlacement) =>
      commitStep1FabricAssignment({
        state: fabricAllocationState,
        garmentTypeSelection,
        fabrics,
        fabricCode,
        selectedGarmentKeys,
        mode,
        placement,
      });
    const result = commit("auto");
    if (result.status === "blocked") {
      reportBlockedStep1FabricAssignment(result.error, true);
      return;
    }
    const placementFabric =
      step1AssignmentDialogFabric?.currentFabric ||
      fabrics.find((candidate) => candidate.code === fabricCode);
    const apply = (placement: FutureFabricPiecePlacement) => {
      const placed = placement === "auto" ? result : commit(placement);
      if (placed.status === "blocked") {
        reportBlockedStep1FabricAssignment(placed.error, true);
        return null;
      }
      return applyCommittedStep1FabricAssignment({
        fabricCode,
        fabricName,
        assignedGarmentKeys: placed.assignedGarmentKeys,
        keepDialogOnBlock: true,
        placement,
      });
    };
    if (!placementFabric) {
      apply("auto");
      return;
    }
    runWithAutoPairing(placementFabric, result.assignedGarmentKeys, apply);
  };

  const restorePartialFabricAssignmentFocus = (garmentKey: string) => {
    const restore = () => {
      const element = garmentActionRefs.current.get(garmentKey);
      if (element) focusElementSafely(element);
    };
    if (typeof window === "undefined") return;
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restore);
    } else {
      restore();
    }
  };

  const commitPartialFabricAssignment = (allocationId: string) => {
    if (!pendingPartialFabricAssignment) return;
    const { garmentKey } = pendingPartialFabricAssignment;
    const allocation = fabricAllocationState.fabricAllocations.find(
      (candidate) => candidate.allocationId === allocationId,
    );
    const fabricName =
      fabrics.find((candidate) => candidate.code === allocation?.fabricCode)
        ?.name || "Selected fabric";
    const result = onAssignGarmentToExistingAllocation(
      garmentKey,
      allocationId,
    );
    if (!result) {
      setVisibleActionError("That fabric assignment could not be completed.");
      setAssignmentAnnouncement("That fabric assignment could not be completed.");
      return;
    }
    if (result.status === "blocked") {
      const blockedMessage =
        result.reason === "GARMENT_ALREADY_ASSIGNED"
          ? "That garment is already assigned to a Fabric."
          : result.reason === "INVALID_CAPACITY"
            ? "That garment could not be assigned to the selected Fabric capacity."
            : "That fabric assignment could not be completed.";
      setVisibleActionError(blockedMessage);
      setAssignmentAnnouncement(blockedMessage);
      setPendingPartialFabricAssignment(null);
      restorePartialFabricAssignmentFocus(garmentKey);
      return;
    }
    setPendingPartialFabricAssignment(null);
    setVisibleActionError(null);
    finalizeSuccessfulStep1FabricAssignment(fabricName, [garmentKey]);
  };

  const openPartialFabricAssignment = (garmentKey: string) => {
    setVisibleActionError(null);
    closeStep1FabricAssignment();
    setPendingPartialFabricAssignment({ garmentKey });
  };

  // "Use different fabric" on the single-target Add to this fabric? popup:
  // assign nothing and open the catalogue targeted at the garment, exactly as
  // the garment card's Add Fabric button does.
  const useDifferentFabricForPartialAssignment = () => {
    const garmentKey = pendingPartialFabricAssignment?.garmentKey;
    setPendingPartialFabricAssignment(null);
    if (!garmentKey) return;
    if (
      fabricAllocationState.pendingFabricGarment?.garmentKey === garmentKey &&
      !fabricAllocationState.awaitingFabricForPendingGarment
    ) {
      onChooseAnotherFabric();
    }
    const trigger =
      garmentActionRefs.current.get(garmentKey) ??
      (typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (trigger) {
      openCatalogue(trigger, garmentKey);
    }
  };

  const cancelPartialFabricAssignment = () => {
    const garmentKey = pendingPartialFabricAssignment?.garmentKey;
    setPendingPartialFabricAssignment(null);
    if (garmentKey) {
      restorePartialFabricAssignmentFocus(garmentKey);
    }
  };

  const assignSingleEligibleStep1FabricCandidate = (
    fabric: Fabric,
    garmentKey: string,
  ) => {
    const unavailable = getFabricAvailabilityMessage(fabric);
    if (unavailable) {
      reportBlockedStep1FabricAssignment(unavailable, false);
      return;
    }
    const commit = (placement: FutureFabricPiecePlacement) =>
      commitStep1FabricAssignment({
        state: fabricAllocationState,
        garmentTypeSelection,
        fabrics,
        fabricCode: fabric.code,
        selectedGarmentKeys: [garmentKey],
        mode: "selected",
        placement,
      });
    const result = commit("auto");
    if (result.status === "blocked") {
      reportBlockedStep1FabricAssignment(result.error, false);
      return;
    }
    runWithAutoPairing(fabric, result.assignedGarmentKeys, (placement) => {
      const placed = placement === "auto" ? result : commit(placement);
      if (placed.status === "blocked") {
        reportBlockedStep1FabricAssignment(placed.error, false);
        return null;
      }
      return applyCommittedStep1FabricAssignment({
        fabricCode: fabric.code,
        fabricName: fabric.name,
        assignedGarmentKeys: placed.assignedGarmentKeys,
        keepDialogOnBlock: false,
        placement,
      });
    });
  };

  useEffect(() => {
    const pending = pendingPostAssignmentNavRef.current;
    if (!pending) return;
    const observed = pending.assignedGarmentKeys.every((garmentKey) =>
      assignmentByGarmentKey.has(garmentKey),
    );
    if (!observed) return;
    pendingPostAssignmentNavRef.current = null;
    navigateToStep2PostAssignmentDestination(
      pending.destinationGarmentKey,
      pending.destinationKind,
    );
  }, [assignmentByGarmentKey, fabricAllocationState.fabricAllocations, postAssignmentNavEpoch]);

  useEffect(() => {
    if (!postAssignmentHighlight) return;
    if (typeof window === "undefined" || typeof window.setTimeout !== "function") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setPostAssignmentHighlight((current) =>
        current &&
        current.garmentKey === postAssignmentHighlight.garmentKey &&
        current.kind === postAssignmentHighlight.kind
          ? null
          : current,
      );
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [postAssignmentHighlight]);

  const openStep1FabricAssignment = (
    fabric: Fabric,
    trigger?: HTMLElement,
  ) => {
    const presentation = resolveStep1FabricCatalogueCardPresentation({
      fabricCode: fabric.code,
      garmentTypeSelection,
      fabricAllocationState,
      availabilityMessage: getFabricAvailabilityMessage(fabric),
      fabrics,
    });
    if (presentation.action === "none") {
      return;
    }
    const candidates = buildStep1FabricAssignmentCandidates({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode: fabric.code,
      fabrics,
    });
    if (candidates.length === 0) {
      setAssignmentAnnouncement(
        "All selected garments already have fabric assignments.",
      );
      return;
    }
    if (
      !shouldOpenStep1FabricGroupingDialog({
        candidates,
        action: presentation.action,
        garmentTypeSelection,
        fabricAllocationState,
      })
    ) {
      const candidate = candidates[0];
      if (!candidate) {
        setAssignmentAnnouncement(
          "All selected garments already have fabric assignments.",
        );
        return;
      }
      assignSingleEligibleStep1FabricCandidate(fabric, candidate.garmentKey);
      return;
    }
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    step1AssignmentTriggerRef.current = trigger || null;
    step1AssignmentScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY : null;
    setVisibleActionError(null);
    setStep1AssignmentError(null);
    closeFabricRemovalChooser(false);
    setPendingStep1FabricAssignment({
      fabricCode: fabric.code,
      selectedGarmentKeys: [],
      displayFabric: createStep1FabricAssignmentDisplaySnapshot(fabric),
    });
  };

  const openCatalogue = (
    trigger: HTMLElement,
    garmentKey: string | null = null,
    openDialog = false,
    changingFabric = false,
    scrollTarget: "catalogue" | "selection_cards" = "catalogue",
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    postAssignmentFocusRequestRef.current += 1;
    catalogueTriggerRef.current = trigger;
    catalogueFocusGarmentKeyRef.current = garmentKey;
    changeOpenedFromSummaryRef.current =
      changingFabric && scrollTarget === "selection_cards";
    const request = ++catalogueFocusRequestRef.current;
    setVisibleActionError(null);
    setCatalogueTargetGarmentKey(garmentKey);
    setIsChangingFabricSelection(changingFabric);
    setIsChangeFromSummary(changingFabric && scrollTarget === "selection_cards");
    setIsCatalogueOpen(openDialog);
    if (openDialog || typeof window === "undefined") {
      return;
    }
    const scrollToCatalogueHeader = () => {
      if (request !== catalogueFocusRequestRef.current) return;
      if (scrollTarget === "selection_cards") {
        // Summary row: bring the selection's garment cards into view and
        // keep focus on the pressed summary button.
        scrollToChangingFabricSelection(garmentKey);
        return;
      }
      const anchor = catalogueScrollAnchorRef.current;
      if (anchor && typeof anchor.scrollIntoView === "function") {
        anchor.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
      if (catalogueHeadingRef.current) {
        focusElementSafely(catalogueHeadingRef.current);
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(scrollToCatalogueHeader);
    } else {
      scrollToCatalogueHeader();
    }
  };

  useEffect(() => {
    if (!isCatalogueOpen) return;
    const dialog = catalogueDialogRef.current;
    if (!dialog) return;
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCatalogueForCancellation();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => dialog.removeEventListener("keydown", handleKeyDown);
  }, [isCatalogueOpen]);

  const formatChangeFabricAllocationBlockedMessage = (
    reason: FutureFabricAssignmentBlockReason,
  ): string => {
    if (reason === "FABRIC_STOCK_EXHAUSTED") {
      return formatFabricStockExhaustedCopy();
    }
    if (reason === "ALLOCATION_NOT_FOUND") {
      return "This Fabric selection is no longer available to change.";
    }
    if (reason === "ALLOCATION_CHANGED") {
      return "This Fabric selection changed. Reopen Change Fabric to continue.";
    }
    return "That Fabric could not be applied to this Fabric selection.";
  };

  const restoreChangeFabricConfirmationFocus = () => {
    const confirmationTrigger = changeFabricConfirmationTriggerRef.current;
    const opener = changeFabricOpenerRef.current;
    changeFabricConfirmationTriggerRef.current = null;
    const restore = () => {
      if (confirmationTrigger && focusElementSafely(confirmationTrigger)) {
        return;
      }
      if (opener && focusElementSafely(opener)) {
        return;
      }
      if (catalogueTargetGarmentKey) {
        const garmentAction = garmentActionRefs.current.get(
          catalogueTargetGarmentKey,
        );
        if (garmentAction && focusElementSafely(garmentAction)) {
          return;
        }
      }
      focusElementSafely(catalogueHeadingRef.current);
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(restore);
    } else {
      restore();
    }
  };

  const cancelChangeFabricAllocation = () => {
    setPendingChangeFabricAllocation(null);
    restoreChangeFabricConfirmationFocus();
  };

  useEffect(() => {
    if (!pendingChangeFabricAllocation) {
      return;
    }
    const allocation = fabricAllocationState.fabricAllocations.find(
      (candidate) =>
        candidate.allocationId === pendingChangeFabricAllocation.allocationId,
    );
    if (!allocation || allocation.garmentAssignments.length === 0) {
      cancelChangeFabricAllocation();
      setVisibleActionError(
        "This Fabric selection is no longer available to change.",
      );
      setAssignmentAnnouncement(
        "This Fabric selection is no longer available to change.",
      );
      return;
    }
    if (
      allocation.fabricCode !==
        pendingChangeFabricAllocation.expectedCurrentFabricCode ||
      getFutureFabricAllocationAssignmentSignature(allocation) !==
        pendingChangeFabricAllocation.expectedAssignmentSignature
    ) {
      cancelChangeFabricAllocation();
      setVisibleActionError(
        "This Fabric selection changed. Reopen Change Fabric to continue.",
      );
      setAssignmentAnnouncement(
        "This Fabric selection changed. Reopen Change Fabric to continue.",
      );
    }
  }, [fabricAllocationState, pendingChangeFabricAllocation]);

  const commitChangeFabricAllocation = (
    allocationId: string,
    fabric: Fabric,
    focusGarmentKey: string,
    expectation?: ChangeFutureFabricAllocationExpectation,
  ) => {
    const result = onChangeFabricAllocationProduct(
      allocationId,
      fabric.code,
      expectation,
    );
    if (!result) {
      setVisibleActionError(
        "That Fabric could not be applied to this Fabric selection.",
      );
      setAssignmentAnnouncement(
        "That Fabric could not be applied to this Fabric selection.",
      );
      return false;
    }
    if (result.status === "blocked") {
      if (
        result.reason === "ALLOCATION_CHANGED" ||
        result.reason === "ALLOCATION_NOT_FOUND"
      ) {
        cancelChangeFabricAllocation();
      }
      const blockedMessage = formatChangeFabricAllocationBlockedMessage(
        result.reason,
      );
      setVisibleActionError(blockedMessage);
      setAssignmentAnnouncement(blockedMessage);
      return false;
    }
    setVisibleActionError(null);
    changeFabricConfirmationTriggerRef.current = null;
    setPendingChangeFabricAllocation(null);
    const presentation = getFutureFabricAllocationGroupChangePresentation({
      state: result.state,
      allocationId,
      garmentTypeSelection,
      fabrics,
      garmentLabelByKey: occurrenceConciseLabels,
    });
    setAssignmentAnnouncement(
      presentation
        ? `${fabric.name} now applies to ${formatGarmentList(
            [...presentation.garmentLabels],
          )} in Fabric Selection ${presentation.fabricSelectionNumber}.`
        : `${fabric.name} updated for this Fabric selection.`,
    );
    completeCatalogueAssignment(focusGarmentKey);
    return true;
  };

  const assignSelectedFabric = (
    fabric: Fabric,
    garmentKey: string,
    confirmationTrigger?: HTMLElement | null,
  ) => {
    if (isChangeFabricTarget && changeFabricAssignmentTarget) {
      const allocationId = changeFabricAssignmentTarget.allocation.allocationId;
      const allocation = changeFabricAssignmentTarget.allocation;
      if (changeFabricAssignmentTarget.allocation.fabricCode === fabric.code) {
        completeCatalogueAssignment(garmentKey);
        return;
      }
      if (changingGarmentKey === garmentKey) {
        const detachedState = detachFutureGarmentFromSharedPiece({
          state: fabricAllocationState,
          garmentKey,
          fabricCode: fabric.code,
        });
        if (detachedState) {
          assignGarmentToFabricCard(fabric, garmentKey, detachedState, {
            detachFromSharedPiece: true,
          });
          return;
        }
      }
      const presentation =
        changeFabricPresentation ||
        getFutureFabricAllocationGroupChangePresentation({
          state: fabricAllocationState,
          allocationId,
          garmentTypeSelection,
          fabrics,
          garmentLabelByKey: occurrenceConciseLabels,
        });
      if (presentation?.isSharedGroup) {
        changeFabricOpenerRef.current = catalogueTriggerRef.current;
        changeFabricConfirmationTriggerRef.current = confirmationTrigger ?? null;
        setPendingChangeFabricAllocation({
          allocationId,
          nextFabricCode: fabric.code,
          nextFabricName: fabric.name,
          expectedCurrentFabricCode: allocation.fabricCode,
          expectedAssignmentSignature:
            getFutureFabricAllocationAssignmentSignature(allocation),
        });
        return;
      }
      if (
        changingGarmentKey === garmentKey &&
        pairLoneFutureGarmentWithExistingPiece({
          state: fabricAllocationState,
          garmentTypeSelection,
          garmentKey,
          fabricCode: fabric.code,
          fabrics,
          requiredPhysicalOccurrences,
        })
      ) {
        // Alone on its piece and the new print has a piece with room: pair
        // automatically. It moves onto that piece and its old piece is freed.
        runWithAutoPairing(
          fabric,
          [garmentKey],
          () =>
            finishSelectedFabricAssignment(fabric, garmentKey, "auto", {
              pairLoneGarment: true,
            }),
          removeFutureFabricAssignment({
            state: fabricAllocationState,
            garmentKey,
          }),
        );
        return;
      }
      commitChangeFabricAllocation(allocationId, fabric, garmentKey);
      return;
    }

    assignGarmentToFabricCard(fabric, garmentKey, fabricAllocationState);
  };

  /**
   * Assign one garment to a catalogue print. `baseState` is the state the
   * garment is placed from: the live state, or (Change Fabric on a garment
   * card whose piece is shared) the state with the garment taken off its
   * shared piece.
   */
  const assignGarmentToFabricCard = (
    fabric: Fabric,
    garmentKey: string,
    baseState: FabricAllocationState,
    options?: FutureFabricGarmentAssignmentOptions,
  ) => {
    const assignmentGeneration = ++assignmentGenerationRef.current;
    pendingAssignmentAnnouncementRef.current = {
      fabricCode: fabric.code,
      fabricName: fabric.name,
      targetGarmentKey: garmentKey,
      assignmentGeneration,
    };
    setVisibleActionError(null);
    setAssignmentAnnouncement("");
    const preview = assignFutureFabricToGarment({
      state: baseState,
      garmentTypeSelection,
      garmentKey,
      fabricCode: fabric.code,
      fabrics,
      requiredPhysicalOccurrences,
    });
    if (preview.status === "blocked") {
      const blockedMessage =
        preview.reason === "FABRIC_QUANTITY_LIMIT_REACHED"
          ? getFabricQuantityFitBlockedCopyForGarment({
              state: baseState,
              garmentTypeSelection,
              garmentKey,
              fabricCode: fabric.code,
              fabrics,
              requiredPhysicalOccurrences,
            }) ?? formatFabricQuantityLimitChangeCopy(maxFabricPiecesWithPending)
          : preview.reason === "FABRIC_STOCK_EXHAUSTED"
            ? formatFabricStockExhaustedCopy()
            : "That fabric could not be assigned to this garment.";
      setVisibleActionError(blockedMessage);
      setAssignmentAnnouncement(blockedMessage);
      pendingAssignmentAnnouncementRef.current = null;
      return;
    }
    runWithAutoPairing(
      fabric,
      [garmentKey],
      (placement) =>
        finishSelectedFabricAssignment(fabric, garmentKey, placement, options),
      baseState,
    );
  };

  const finishSelectedFabricAssignment = (
    fabric: Fabric,
    garmentKey: string,
    placement: FutureFabricPiecePlacement,
    options?: FutureFabricGarmentAssignmentOptions,
  ) => {
    const nextState = onAssignFabricToGarment(
      fabric,
      garmentKey,
      placement,
      options,
    );
    if (nextState && Array.isArray(nextState.fabricAllocations)) {
      const assigned = nextState.fabricAllocations.some((allocation) =>
        allocation.garmentAssignments.some(
          (assignment) => assignment.garmentKey === garmentKey,
        ),
      );
      if (assigned) {
        setVisibleActionError(null);
        const assignedTarget = targets.find(
          ({ assignment }) => assignment.garmentKey === garmentKey,
        );
        if (assignedTarget) {
          setAssignmentAnnouncement(
            `${fabric.name} assigned to ${getFutureGarmentLabel(
              assignedTarget.assignment.garmentType,
            )}.`,
          );
        }
      }
    }
    pendingAssignmentAnnouncementRef.current = null;
    completeCatalogueAssignment(garmentKey);
    return nextState && Array.isArray(nextState.fabricAllocations)
      ? nextState
      : null;
  };

  const handleFabricSelection = (
    fabric: Fabric,
    trigger?: HTMLElement,
  ) => {
    setVisibleActionError(null);
    if (
      catalogueTargetGarmentKey &&
      changeFabricAssignmentTarget &&
      assignmentByGarmentKey.has(catalogueTargetGarmentKey)
    ) {
      assignSelectedFabric(
        fabric,
        changeFabricAssignmentTarget.assignment.garmentKey,
        trigger,
      );
      return;
    }
    if (
      pendingAdditionalAssignment &&
      (!catalogueTargetGarmentKey ||
        catalogueTargetGarmentKey === pendingAdditionalAssignment.garmentKey)
    ) {
      assignSelectedFabric(fabric, pendingAdditionalAssignment.garmentKey);
      return;
    }
    if (isStep1CatalogueMode) {
      openStep1FabricAssignment(fabric, trigger);
      return;
    }
    const targetGarmentKey =
      (catalogueTargetGarmentKey && activeCatalogueTarget
        ? activeCatalogueTarget.assignment.garmentKey
        : null) ||
      unassignedTargets[0]?.assignment.garmentKey ||
      null;
    if (!targetGarmentKey) {
      setAssignmentAnnouncement(
        "All selected garments already have fabric assignments.",
      );
      return;
    }
    assignSelectedFabric(fabric, targetGarmentKey);
  };

  const removeAssignedFabric = (
    garmentKey: string,
    garmentLabel: string,
    fabricName: string,
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    closeStep1FabricAssignment();
    setPendingFabricRemoval(null);
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    setIsChangingFabricSelection(false);
    catalogueFocusRequestRef.current += 1;
    catalogueTriggerRef.current = null;
    catalogueFocusGarmentKeyRef.current = null;
    const currentAssignment = assignmentByGarmentKey.get(garmentKey);
    const hasAssignment = Boolean(currentAssignment);
    if (!hasAssignment) {
      pendingRemovalAnnouncementRef.current = null;
      pendingRemovalScrollYRef.current = null;
      setPendingRemovalRequest(null);
      postAssignmentFocusRequestRef.current += 1;
      setAssignmentAnnouncement("");
      onRemoveFabricFromGarment(garmentKey);
      return;
    }
    const result = onRemoveFabricFromGarment(garmentKey);
    if (result && result.status === "blocked") {
      pendingRemovalAnnouncementRef.current = null;
      pendingRemovalScrollYRef.current = null;
      setPendingRemovalRequest(null);
      postAssignmentFocusRequestRef.current += 1;
      setAssignmentAnnouncement(
        result.reason === "OTHER_ADDITIONAL_GARMENT_PENDING"
          ? OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE
          : "Could not remove this fabric assignment.",
      );
      setVisibleActionError(
        result.reason === "OTHER_ADDITIONAL_GARMENT_PENDING"
          ? OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE
          : "Could not remove this fabric assignment.",
      );
      return;
    }
    setVisibleActionError(null);
    const request = ++removalRequestRef.current;
    removalVerificationRequestRef.current = null;
    pendingRemovalAnnouncementRef.current = {
      request,
      garmentKey,
      garmentLabel,
      fabricName:
        fabrics.find(
          (fabric) => fabric.code === currentAssignment?.allocation.fabricCode,
        )?.name ?? fabricName,
    };
    setPendingRemovalRequest(request);
    pendingRemovalScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY : null;
    setAssignmentAnnouncement("");
  };

  const handleUseSameFabricAgain = () => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    setVisibleActionError(null);
    onUseSameFabric();
  };

  const openChangeFromSummary = (
    item: FabricSelectionSummaryItem,
    trigger: HTMLElement,
  ) => {
    const garmentKey = getFirstChangingGarmentKey(
      targets.map(({ assignment }) => assignment.garmentKey),
      item.garmentKeys,
    );
    if (!garmentKey) return;
    openCatalogue(trigger, garmentKey, false, true, "selection_cards");
  };

  const renderCatalogueCard = (fabric: Fabric) => {
    const pendingTargetAssignment = pendingAdditionalAssignment;
    const currentTarget =
      activeCatalogueTarget ||
      (pendingTargetAssignment
        ? { assignment: pendingTargetAssignment }
        : null) ||
      unassignedTargets[0] ||
      null;
    const step1Presentation = isStep1CatalogueMode
      ? resolveStep1FabricCatalogueCardPresentation({
          fabricCode: fabric.code,
          garmentTypeSelection,
          fabricAllocationState,
          availabilityMessage: getFabricAvailabilityMessage(fabric),
          fabrics,
        })
      : null;
    const useStep1CardPresentation = Boolean(
      step1Presentation &&
        (step1Presentation.action !== "none" ||
          step1Presentation.status === "ALL GARMENTS HAVE FABRIC" ||
          step1Presentation.status === "UNAVAILABLE" ||
          unassignedStep1Targets.length > 0),
    );
    // Change Fabric targets a whole Fabric Selection (allocation). Its cards
    // must not reuse the single-garment assign presentation: fabrics used by
    // other selections stay pickable (USE AGAIN) and never expose the X that
    // would remove another selection's fabric.
    const changeCardPresentation =
      isChangeFabricTarget && changeFabricAssignmentTarget
        ? resolveFutureFabricChangeCatalogueCardPresentation({
            fabricCode: fabric.code,
            fabricAllocationState,
            allocationId: changeFabricAssignmentTarget.allocation.allocationId,
            fabrics,
            targetGarmentKey: changeFabricAssignmentTarget.assignment.garmentKey,
            garmentOnly: changingGarmentKey
              ? {
                  garmentKey: changingGarmentKey,
                  garmentTypeSelection,
                  requiredPhysicalOccurrences,
                }
              : null,
          })
        : null;
    const cardPresentation: FutureFabricCatalogueCardPresentation =
      changeCardPresentation
        ? {
            status: changeCardPresentation.status,
            action: changeCardPresentation.action,
            cancelGarmentKey: changeCardPresentation.cancelGarmentKey,
            cancelGarmentKeys: changeCardPresentation.cancelGarmentKeys,
          }
        : step1Presentation && useStep1CardPresentation
        ? adaptUntargetedStep1CatalogueCardPresentation({
            step1Status: step1Presentation.status,
            step1Action: step1Presentation.action,
            cancelGarmentKeys: getFutureFabricCatalogueCancelTargets({
              fabricCode: fabric.code,
              garmentTypeSelection,
              fabricAllocationState,
              currentTargetGarmentKey: null,
            }),
          })
        : resolveFutureFabricCatalogueCardPresentation({
            fabricCode: fabric.code,
            garmentTypeSelection,
            fabricAllocationState,
            currentTargetGarmentKey: currentTarget?.assignment.garmentKey ?? null,
            fabrics,
            requiredPhysicalOccurrences,
          });
    // The garments this card may serve: every remaining Step 1 garment in the
    // untargeted catalogue, otherwise the single focused/pending target. Reuse
    // of leftover half capacity is allowed when ANY of them fits, matching the
    // allocator that already appends to a partial allocation before opening a
    // new one. This never changes allocation arithmetic.
    const relevantReuseTargets: ReadonlyArray<{
      assignment: Pick<FabricGarmentAssignment, "garmentKey" | "garmentType">;
    }> =
      step1Presentation && useStep1CardPresentation && !activeCatalogueTarget
        ? unassignedStep1Targets
        : currentTarget
          ? [currentTarget]
          : [];
    const reusableHalfCapacityGarmentKeys = getFutureReusableHalfCapacityGarmentKeys({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode: fabric.code,
      garmentKeys: relevantReuseTargets.map(
        (target) => target.assignment.garmentKey,
      ),
      requiredPhysicalOccurrences,
    });
    const allowExistingPartialReuse = reusableHalfCapacityGarmentKeys.length > 0;
    const hasReusableHalfCapacity = hasFutureReusableHalfCapacityForFabric({
      fabricAllocationState,
      fabricCode: fabric.code,
    });
    const changeAllocationId =
      isChangeFabricTarget && changeFabricAssignmentTarget
        ? changeFabricAssignmentTarget.allocation.allocationId
        : null;
    const stockConstraintMessage =
      changingGarmentKey && changeCardPresentation
        ? // One-garment change: the card's own preview (pair or new piece).
          changeCardPresentation.blockedReason === "FABRIC_STOCK_EXHAUSTED"
          ? formatFabricStockExhaustedCopy()
          : changeCardPresentation.blockedReason === "FABRIC_UNAVAILABLE"
            ? getFabricAvailabilityMessage(fabric)
            : null
        : changeAllocationId
      ? (() => {
          const preview = changeFutureFabricAllocationProduct({
            state: fabricAllocationState,
            allocationId: changeAllocationId,
            nextFabricCode: fabric.code,
            fabrics,
          });
          if (
            preview.status === "blocked" &&
            preview.reason === "FABRIC_STOCK_EXHAUSTED"
          ) {
            return formatFabricStockExhaustedCopy();
          }
          if (
            preview.status === "blocked" &&
            preview.reason === "FABRIC_UNAVAILABLE"
          ) {
            return getFabricAvailabilityMessage(fabric);
          }
          return null;
        })()
      : getFabricNewAllocationStockConstraintMessage(
          fabric,
          fabricAllocationState,
          allowExistingPartialReuse,
          {
            halfCapacityBlockedGarmentLabels:
              hasReusableHalfCapacity && relevantReuseTargets.length > 0
                ? relevantReuseTargets.map((target) =>
                    getFutureGarmentLabel(target.assignment.garmentType),
                  )
                : undefined,
          },
        );
    const cancelGarmentKeys =
      cardPresentation.cancelGarmentKeys ??
      (cardPresentation.cancelGarmentKey
        ? [cardPresentation.cancelGarmentKey]
        : []);
    const labeledCancelTargets = labelOwnedFabricCancelTargets(
      cancelGarmentKeys,
      (garmentKey) =>
        assignmentByGarmentKey.get(garmentKey)?.assignment.garmentType ||
        (pendingTargetAssignment?.garmentKey === garmentKey
          ? pendingTargetAssignment.garmentType
          : null) ||
        targets.find((target) => target.assignment.garmentKey === garmentKey)
          ?.assignment.garmentType ||
        null,
      occurrenceConciseLabels,
    );
    const singleCancelLabel =
      labeledCancelTargets.length === 1 ? labeledCancelTargets[0]!.label : "";
    const changeSelectionNumber =
      changeCardPresentation && changeFabricAssignmentTarget
        ? fabricAllocationState.fabricAllocations.findIndex(
            (allocation) =>
              allocation.allocationId ===
              changeFabricAssignmentTarget.allocation.allocationId,
          ) + 1
        : 0;
    const targetGarmentLabel =
      changeCardPresentation && changeSelectionNumber > 0
        ? `Fabric Selection ${changeSelectionNumber}`
        : cardPresentation.action === "cancel"
        ? singleCancelLabel || undefined
        : currentTarget
          ? getFutureGarmentLabel(currentTarget.assignment.garmentType)
          : undefined;
    const handleCatalogueRemove = (event?: { currentTarget: HTMLElement }) => {
      if (
        (changeCardPresentation &&
          (changeCardPresentation.changeMode !== "change-assigned" ||
            cancelGarmentKeys.some(
              (garmentKey) =>
                garmentKey !==
                changeFabricAssignmentTarget?.assignment.garmentKey,
            ))) ||
        cancelGarmentKeys.length === 0 ||
        getFabricAvailabilityMessage(fabric)
      ) {
        return;
      }
      if (cancelGarmentKeys.length === 1) {
        removeAssignedFabric(
          cancelGarmentKeys[0]!,
          singleCancelLabel || "the selected garment",
          fabric.name,
        );
        return;
      }
      closeStep1FabricAssignment();
      fabricRemovalTriggerRef.current = event?.currentTarget || null;
      setPendingFabricRemoval({
        fabric,
        targets: labeledCancelTargets,
      });
    };

    return (
      <FutureFabricCatalogueCard
        key={fabric.code}
        fabric={fabric}
        presentation={cardPresentation}
        targetGarmentLabel={targetGarmentLabel}
        removeTargetGarmentLabel={singleCancelLabel || undefined}
        stockBadgeIdPrefix="future-fabric-stock"
        stockPresentation={
          pendingStep1FabricAssignment?.fabricCode === fabric.code
            ? projectPendingStep1FabricStockPresentation({
                fabric,
                fabricAllocationState,
                selectedGarmentKeys:
                  pendingStep1FabricAssignment.selectedGarmentKeys,
                garmentTypeSelection,
                fabrics,
              })
            : getOrderAwareFabricStockPresentation(fabric, fabricAllocationState, {
                hasCompatibleReusableHalfCapacity:
                  hasReusableHalfCapacity || allowExistingPartialReuse,
              })
        }
        stockConstraintMessage={
          changeCardPresentation?.changeMode === "change-blocked" &&
          !getFabricAvailabilityMessage(fabric)
            ? null
            : stockConstraintMessage
        }
        describedBy="future-fabric-catalogue-help future-fabric-assignment-status"
        onAction={(event) => {
          handleFabricSelection(fabric, event?.currentTarget);
        }}
        statusLabel={
          changeCardPresentation?.changeMode === "change-assigned"
            ? "ASSIGNED"
            : undefined
        }
        usedBySelectionsLabel={
          changeCardPresentation?.status === "USE AGAIN" &&
          changeFabricAssignmentTarget
            ? formatFabricSelectionNumbersBadge(
                getFabricSelectionNumbersUsingFabric({
                  fabricAllocationState,
                  fabricCode: fabric.code,
                  excludeAllocationId:
                    changeFabricAssignmentTarget.allocation.allocationId,
                }),
              ) || undefined
            : undefined
        }
        disabledActionMessage={
          changeCardPresentation?.changeMode === "change-blocked" &&
          !getFabricAvailabilityMessage(fabric)
            ? stockConstraintMessage || "This Fabric is unavailable."
            : undefined
        }
        onRemove={handleCatalogueRemove}
        dataAttributes={
          changeCardPresentation
            ? {
                "data-fabric-change-card": changeCardPresentation.changeMode,
                "data-fabric-change-selection":
                  changeSelectionNumber > 0
                    ? String(changeSelectionNumber)
                    : undefined,
              }
            : undefined
        }
      />
    );
  };

  const focusFabricGuideTarget = (target: FabricGuideTarget) => {
    if (target.type === "catalogue") {
      scrollToFabricCatalogue();
      return;
    }
    let scrollElement: HTMLElement | null | undefined = null;
    let focusElement: HTMLElement | null | undefined = null;
    if (target.type === "garment_action") {
      scrollElement = garmentCardRefs.current.get(target.garmentKey);
      focusElement = garmentActionRefs.current.get(target.garmentKey);
    } else if (target.type === "garment_card") {
      scrollElement = garmentCardRefs.current.get(target.garmentKey);
      focusElement = garmentActionRefs.current.get(target.garmentKey);
    } else if (target.type === "garment_remove") {
      scrollElement = garmentCardRefs.current.get(target.garmentKey);
      focusElement = garmentRemoveRefs.current.get(target.garmentKey);
    } else if (target.type === "quantity_move") {
      focusElement = quantityMoveActionRef.current;
      scrollElement = focusElement;
    } else if (target.type === "pending_panel") {
      focusElement = pendingPanelActionRef.current;
      scrollElement = focusElement;
    } else if (target.type === "orphan_repair") {
      focusElement = orphanRepairActionRefs.current.get(target.repairKey);
      scrollElement = focusElement;
    }
    if (scrollElement && typeof scrollElement.scrollIntoView === "function") {
      scrollElement.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    }
    if (focusElement) {
      focusElementSafely(focusElement);
    }
  };

  const handleQuantityRepairMove = () => {
    if (!quantityRepair || !onMoveGarmentToFabricAllocation) return;
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    const result = onMoveGarmentToFabricAllocation(
      quantityRepair.garmentKey,
      quantityRepair.toAllocationId,
    );
    if (result && result.status !== "moved") {
      const message = "That garment could not be moved. Remove or change a Fabric assignment instead.";
      setVisibleActionError(message);
      setAssignmentAnnouncement(message);
      return;
    }
    setVisibleActionError(null);
    setAssignmentAnnouncement(
      `${quantityRepairGarmentLabel ?? "Garment"} moved to Fabric Selection ${quantityRepair.toSelectionNumber}.`,
    );
  };

  const fabricGuideTitleId = `${fabricGuideIdPrefix}-title`;
  const renderFabricGuideMessage = (
    message: string,
    options: { stepId?: string; garmentLabel?: string } = {},
  ) => (
    <span
      key={options.stepId ? `${options.stepId}:${message}` : message}
      data-fabric-guide-message="true"
      data-fabric-guide-message-step={options.stepId}
      data-avoidable-partial-guidance={
        message === avoidablePartialGuidanceCopy &&
        showAvoidablePartialGuidance
          ? "true"
          : undefined
      }
      className="block break-words text-pretty text-[11px] leading-relaxed text-heritage-ink/85"
    >
      {options.garmentLabel ? (
        <span className="font-semibold text-heritage-ink">{`${options.garmentLabel}: `}</span>
      ) : null}
      {message}
    </span>
  );
  const renderFabricGuideStep = (step: FabricGuideStep, index: number) => {
    const isCurrent = step.status === "current";
    const isDone = step.status === "done";
    const statusText = isDone ? "Done" : isCurrent ? "Current step" : "Still to do";
    return (
      <li
        key={step.id}
        data-fabric-guide-step={step.id}
        data-fabric-guide-step-kind={step.kind}
        data-fabric-guide-step-status={step.status}
        aria-current={isCurrent ? "step" : undefined}
        className={`flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 ${
          isCurrent ? "bg-white/90 ring-1 ring-heritage-gold/60" : ""
        }`}
      >
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {isDone ? (
            <CheckCircle2 size={16} className="text-emerald-700" />
          ) : isCurrent ? (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-heritage-gold text-[9px] font-bold text-white">
              {index + 1}
            </span>
          ) : (
            <Circle size={16} className="text-heritage-ink/35" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="sr-only">{`${statusText}, step ${index + 1}: `}</span>
          {step.target.type !== "none" ? (
            <button
              type="button"
              data-fabric-guide-link={step.id}
              onClick={() => focusFabricGuideTarget(step.target)}
              className={`min-h-6 max-w-full break-words text-left underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                isDone
                  ? "font-medium text-heritage-ink/75 decoration-heritage-ink/35"
                  : isCurrent
                    ? "font-bold text-heritage-green decoration-heritage-gold"
                    : "font-semibold text-heritage-green decoration-heritage-gold/50"
              }`}
            >
              {step.label}
            </button>
          ) : (
            <span
              className={`break-words ${
                isCurrent ? "font-bold text-heritage-green" : "font-semibold text-heritage-ink/85"
              }`}
            >
              {step.label}
            </span>
          )}
          {step.messages.length > 0 && !isDone ? (
            <span className="mt-0.5 block space-y-0.5">
              {step.messages.map((message) => renderFabricGuideMessage(message))}
            </span>
          ) : null}
          {step.kind === "fix_quantity" &&
          step.target.type === "quantity_move" &&
          !isDone &&
          quantityRepair &&
          quantityRepairGarmentLabel ? (
            <button
              ref={quantityMoveActionRef}
              type="button"
              data-testid="fabric-guide-quantity-move"
              data-fabric-guide-beam={
                isFabricGuideBeamOn("quantity_move", quantityRepair.garmentKey)
                  ? "true"
                  : undefined
              }
              onClick={handleQuantityRepairMove}
              className={`mt-1.5 inline-flex min-h-11 max-w-full items-center justify-center rounded-lg border border-heritage-green bg-heritage-green px-3 text-center text-[10px] font-bold uppercase tracking-wide text-white transition hover:bg-white hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${fabricGuideBeamClass(
                "quantity_move",
                quantityRepair.garmentKey,
              )}`}
            >
              {`Move ${quantityRepairGarmentLabel} to Fabric Selection ${quantityRepair.toSelectionNumber}`}
            </button>
          ) : null}
        </span>
      </li>
    );
  };
  // Choose-a-fabric and every per-garment assign step share ONE highlighted
  // card. The heading shows the group's current step; garments are compact
  // chips on one wrapping line. Each chip keeps its step's data attributes,
  // label (as aria-label) and target, so counts and links are unchanged.
  const isFabricGuideGroupStep = (step: FabricGuideStep) =>
    step.kind === "choose_fabric" || step.kind === "assign_garment";
  const fabricGuideGarmentLabelForStep = (step: FabricGuideStep): string =>
    fabricGuideGarmentLabels.get(step.id.slice("assign_garment:".length)) ?? step.label;
  const renderFabricGuideChooseAssignGroup = () => {
    const allSteps = fabricGuideFlow.steps;
    const groupSteps = allSteps.filter(isFabricGuideGroupStep);
    const chooseStep = groupSteps.find((step) => step.kind === "choose_fabric");
    const assignSteps = groupSteps.filter((step) => step.kind === "assign_garment");
    const focusStep =
      groupSteps.find((step) => step.status === "current") ??
      groupSteps.find((step) => step.status !== "done") ??
      null;
    const groupStatus = groupSteps.some((step) => step.status === "current")
      ? "current"
      : groupSteps.every((step) => step.status === "done")
        ? "done"
        : "upcoming";
    const headingStep = focusStep ?? chooseStep ?? groupSteps[0]!;
    const headingIndex = allSteps.indexOf(headingStep);
    const chooseInHeading = Boolean(chooseStep && headingStep === chooseStep);
    const headingIsCurrent = headingStep.status === "current";
    const headingIsDone = headingStep.status === "done";
    const headingStatusText = headingIsDone
      ? "Done"
      : headingIsCurrent
        ? "Current step"
        : "Still to do";
    const headingLinkClass = `min-h-6 max-w-full break-words text-left underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
      headingIsDone
        ? "font-medium text-heritage-ink/75 decoration-heritage-ink/35"
        : headingIsCurrent
          ? "font-bold text-heritage-green decoration-heritage-gold"
          : "font-semibold text-heritage-green decoration-heritage-gold/50"
    }`;
    const headingContent = (
      <>
        <span className="sr-only">{`${headingStatusText}, step ${headingIndex + 1}: `}</span>
        {headingStep.target.type !== "none" ? (
          <button
            type="button"
            {...(chooseInHeading
              ? { "data-fabric-guide-link": headingStep.id }
              : { "data-fabric-guide-heading-link": headingStep.id })}
            onClick={() => focusFabricGuideTarget(headingStep.target)}
            className={headingLinkClass}
          >
            {headingStep.label}
          </button>
        ) : (
          <span
            className={`break-words ${
              headingIsCurrent ? "font-bold text-heritage-green" : "font-semibold text-heritage-ink/85"
            }`}
          >
            {headingStep.label}
          </span>
        )}
      </>
    );
    const chipClass = (status: FabricGuideStep["status"]) =>
      `inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-left text-[11px] leading-tight break-words transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
        status === "done"
          ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-700 focus-visible:ring-heritage-gold"
          : status === "current"
            ? "border-heritage-gold bg-heritage-gold font-bold text-heritage-green shadow-sm focus-visible:ring-heritage-green"
            : "border-heritage-gold bg-white font-semibold text-heritage-green shadow-sm hover:bg-heritage-cream focus-visible:ring-heritage-gold"
      }`;
    const renderChip = (
      step: FabricGuideStep,
      visibleLabel: string,
      ariaLabel: string,
      options: { tickText?: boolean } = {},
    ) => {
      const isChipDone = step.status === "done";
      const isChipCurrent = step.status === "current";
      const chipProps = {
        "data-fabric-guide-step": step.id,
        "data-fabric-guide-step-kind": step.kind,
        "data-fabric-guide-step-status": step.status,
        "data-fabric-guide-chip": "true",
        "aria-current": isChipCurrent ? ("step" as const) : undefined,
        "aria-label": ariaLabel,
        // "Fabric chosen" is plain tick text (no pill) so it never reads as a
        // garment chip.
        className: options.tickText
          ? "inline-flex min-h-8 items-center gap-1 rounded px-0.5 text-left text-[11px] font-medium leading-tight text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-1"
          : chipClass(step.status),
      };
      const chipBody = (
        <>
          {isChipDone ? (
            <CheckCircle2
              size={12}
              aria-hidden="true"
              data-fabric-guide-chip-tick="true"
              className="shrink-0 text-emerald-700"
            />
          ) : null}
          <span className="min-w-0 break-words">{visibleLabel}</span>
        </>
      );
      return (
        <li
          key={step.id}
          className={options.tickText ? "flex max-w-full shrink-0 items-center whitespace-nowrap" : "max-w-full"}
        >
          {step.target.type !== "none" ? (
            <button
              type="button"
              {...chipProps}
              data-fabric-guide-link={step.id}
              onClick={() => focusFabricGuideTarget(step.target)}
            >
              {chipBody}
            </button>
          ) : (
            <span {...chipProps}>{chipBody}</span>
          )}
          {options.tickText ? (
            <span
              aria-hidden="true"
              data-fabric-guide-chip-divider="true"
              className="ml-2 mr-1 h-5 w-px shrink-0 bg-heritage-gold/40"
            />
          ) : null}
        </li>
      );
    };
    const messageSteps = groupSteps.filter(
      (step) => step.status !== "done" && step.messages.length > 0,
    );
    const orderedMessageSteps = [
      ...messageSteps.filter((step) => step === headingStep),
      ...messageSteps.filter((step) => step !== headingStep),
    ];
    return (
      <li
        key="fabric-guide-choose-assign"
        data-fabric-guide-group="choose_assign"
        data-fabric-guide-group-status={groupStatus}
        data-fabric-guide-group-current={headingStep.id}
        className={`flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 ${
          groupStatus === "current" ? "bg-white/90 ring-1 ring-heritage-gold/60" : ""
        }`}
      >
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          {groupStatus === "done" ? (
            <CheckCircle2 size={16} className="text-emerald-700" />
          ) : headingIsCurrent ? (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-heritage-gold text-[9px] font-bold text-white">
              {headingIndex + 1}
            </span>
          ) : (
            <Circle size={16} className="text-heritage-ink/35" />
          )}
        </span>
        <div
          className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4"
          data-fabric-guide-group-layout="two-column"
        >
          <div className="min-w-0 sm:min-w-[13rem] sm:flex-1" data-fabric-guide-group-main="true">
            {chooseInHeading && chooseStep ? (
              <span
                className="block"
                data-fabric-guide-step={chooseStep.id}
                data-fabric-guide-step-kind={chooseStep.kind}
                data-fabric-guide-step-status={chooseStep.status}
                aria-current={chooseStep.status === "current" ? "step" : undefined}
              >
                {headingContent}
              </span>
            ) : (
              <span className="block" data-fabric-guide-group-heading={headingStep.id}>
                {headingContent}
              </span>
            )}
            {orderedMessageSteps.length > 0 ? (
              <span className="mt-0.5 block space-y-0.5">
                {orderedMessageSteps.flatMap((step) =>
                  step.messages.map((message) =>
                    renderFabricGuideMessage(message, {
                      stepId: step.id,
                      garmentLabel:
                        step !== headingStep && step.kind === "assign_garment"
                          ? fabricGuideGarmentLabelForStep(step)
                          : undefined,
                    }),
                  ),
                )}
              </span>
            ) : null}
          </div>
          {assignSteps.length > 0 ? (
            <div
              className="mt-1 flex min-w-0 flex-wrap items-start gap-1 sm:mt-0 sm:flex-initial sm:flex-nowrap sm:justify-end"
              data-fabric-guide-group-chips="true"
            >
              {chooseInHeading && chooseStep && chooseStep.status !== "done" ? (
                <span
                  className="inline-flex min-h-8 shrink-0 items-center text-[11px] font-semibold text-heritage-ink/85"
                  data-fabric-guide-chips-label="true"
                >
                  Then assign:
                </span>
              ) : null}
              <ul
                className="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:justify-start sm:gap-1"
                aria-label="Garments to assign fabric to"
              >
                {chooseStep && !chooseInHeading
                  ? renderChip(chooseStep, "Fabric chosen", `${chooseStep.label}: done`, {
                      tickText: true,
                    })
                  : null}
                {assignSteps.map((step) =>
                  renderChip(step, fabricGuideGarmentLabelForStep(step), step.label),
                )}
              </ul>
            </div>
          ) : null}
        </div>
      </li>
    );
  };
  const renderFabricGuideSteps = () => {
    let groupRendered = false;
    return fabricGuideFlow.steps.flatMap((step, index) => {
      if (!isFabricGuideGroupStep(step)) return [renderFabricGuideStep(step, index)];
      if (groupRendered) return [];
      groupRendered = true;
      return [renderFabricGuideChooseAssignGroup()];
    });
  };
  const renderFabricGuide = () => (
    <DesignStudioStepGuide
      id={fabricGuideIdPrefix}
      density="compact"
      titleId={fabricGuideTitleId}
      title={FABRIC_GUIDE_TITLE}
      data-testid="fabric-guide-flow"
      data-fabric-guide="true"
      data-fabric-guide-current={fabricGuideFlow.currentStep?.id}
      data-fabric-quantity-over-allocated={isOverAllocated ? "true" : undefined}
      data-fabric-quantity-stranded={isQuantityStranded ? "true" : undefined}
    >
      <p className="sr-only" aria-live="polite" data-fabric-guide-announcement="true">
        {formatFabricGuideCurrentStepAnnouncement(fabricGuideFlow)}
      </p>
      <p className="mt-0.5 text-[11px] text-heritage-ink/85">
        {`${fabricGuideFlow.doneCount} of ${fabricGuideFlow.steps.length} done. Follow the gold highlight to your next step.`}
      </p>
      <ol className="mt-1.5 space-y-1" aria-labelledby={fabricGuideTitleId}>
        {renderFabricGuideSteps()}
      </ol>
    </DesignStudioStepGuide>
  );

  return (
    <section
      aria-labelledby="future-fabric-step-title"
      className="space-y-6 font-sans"
      data-stage-id="fabric"
      data-stage-complete={completion.isComplete}
    >
      <DesignStudioStepLayout>
        <DesignStudioStepMain className="space-y-6">
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioStepActions
          slot="header"
          backDestination="Garment Type"
          onBack={onBack}
          className="mb-5"
          note={fabricGuideFlow.visible ? renderFabricGuide() : null}
          forward={showContinueAction ? {
            destination: "Design Style",
            onClick: onContinue,
            ariaLabel: "Continue to Design Style",
          } : undefined}
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          {formatDesignStudioStepCounter("fabric")}
        </p>
        <div className="mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2
              id="future-fabric-step-title"
              className="font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
            >
              Fabric
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
              {STEP2_FABRIC_CAPACITY_INTRO}
            </p>
            <button
              type="button"
              data-testid="future-fabric-catalogue-jump"
              onClick={scrollToFabricCatalogue}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-heritage-green underline decoration-heritage-gold underline-offset-4 transition hover:text-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Browse the fabric catalogue
            </button>
          </div>
          <div
            aria-live="polite"
            data-fabric-progress="true"
            data-fabric-progress-state={fabricProgressComplete ? "complete" : "in_progress"}
            className={`flex min-w-0 max-w-full shrink-0 items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-bold text-heritage-green ${
              fabricProgressComplete
                ? "border-emerald-200 bg-emerald-50"
                : "border-heritage-gold/30 bg-heritage-cream/35"
            }`}
          >
            {fabricProgressComplete ? (
              <CheckCircle2
                aria-hidden="true"
                data-fabric-progress-icon="true"
                size={20}
                className="mt-0.5 shrink-0 text-emerald-700"
              />
            ) : (
              <Layers3
                aria-hidden="true"
                data-fabric-progress-icon="true"
                size={20}
                className="mt-0.5 shrink-0 text-heritage-gold"
              />
            )}
            {fabricProgressComplete ? (
              <div className="min-w-0 flex-1">
                <p data-fabric-progress-complete-heading="true" className="break-words text-sm">
                  {FABRIC_PROGRESS_COMPLETE_HEADING}
                </p>
                <p
                  data-fabric-progress-complete-summary="true"
                  className="mt-1 break-words text-[11px] font-normal leading-relaxed text-heritage-ink/70"
                >
                  {formatFabricProgressCompleteSummary(
                    selectedFabricQuantity,
                    completion.requiredGarmentCount,
                  )}
                </p>
              </div>
            ) : (
            <div className="min-w-0 flex-1">
              <p
                data-fabric-selection-progress="true"
                data-fabric-chosen-over-needed={
                  selectedFabricQuantity > requiredFabricQuantity ? "true" : undefined
                }
                className="break-words"
              >
                {formatFabricSelectionProgress(
                  selectedFabricQuantity,
                  requiredFabricQuantity,
                )}
              </p>
              <p data-garment-assignment-progress="true" className="mt-1 break-words">
                {formatGarmentAssignmentProgress(
                  completion.assignedGarmentCount,
                  completion.requiredGarmentCount,
                )}
              </p>
              {completion.requiredGarmentCount > 0 && (
                <p
                  data-fabric-planning-sentence="true"
                  className="mt-2 break-words text-[11px] font-normal leading-relaxed text-heritage-ink/65"
                >
                  {formatRequiredFabricQuantitySentence(
                    requiredFabricQuantity,
                    completion.requiredGarmentCount,
                  )}
                </p>
              )}
            </div>
            )}
          </div>
        </div>

        {contextualReentryGuidance ? (
          <div
            role="status"
            aria-live="polite"
            data-contextual-reentry-guidance="fabric"
            data-contextual-reentry-cause={contextualReentryGuidance.cause}
            className="mt-4 flex items-start gap-3 rounded-xl border border-heritage-gold/40 bg-heritage-cream/50 px-4 py-3 text-sm leading-relaxed text-heritage-ink"
          >
            <p className="min-w-0 flex-1 font-semibold text-heritage-green">
              {contextualReentryGuidance.message}
            </p>
            {onDismissContextualReentryGuidance ? (
              <button
                type="button"
                onClick={onDismissContextualReentryGuidance}
                aria-label="Dismiss re-entry guidance"
                data-contextual-reentry-dismiss="true"
                className="shrink-0 rounded-lg p-1 text-heritage-ink/60 transition hover:bg-heritage-green/10 hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" size={16} />
              </button>
            ) : null}
          </div>
        ) : null}

        {orphanRepairAnnouncement ? (
          <p
            ref={orphanRepairStatusRef}
            role="status"
            aria-live="polite"
            tabIndex={-1}
            data-fabric-integrity-repair-status="true"
            className="mt-4 rounded-xl border border-heritage-green/20 bg-heritage-green/5 px-4 py-3 text-sm font-semibold leading-relaxed text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            {orphanRepairAnnouncement}
          </p>
        ) : null}

        {orphanRepairError ? (
          <div
            role="alert"
            data-fabric-integrity-repair-error="true"
            className="mt-4 rounded-xl border border-red-300/60 bg-red-50/70 px-4 py-3 text-sm leading-relaxed text-red-900"
          >
            {orphanRepairError}
          </div>
        ) : null}

        {orphanRepairTargets.length > 0 ? (
          <section
            aria-labelledby="future-fabric-integrity-repair-title"
            data-fabric-integrity-repair-panel="true"
            className="mt-5 rounded-2xl border border-heritage-gold/40 bg-heritage-cream/40 p-4 sm:p-5"
          >
            <h3
              ref={orphanRepairHeadingRef}
              id="future-fabric-integrity-repair-title"
              tabIndex={-1}
              className="break-words font-serif text-lg font-bold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Saved Fabric assignment needs repair
            </h3>
            <p className="mt-2 max-w-3xl break-words text-sm leading-relaxed text-heritage-ink/70">
              A saved Fabric assignment points to a garment that is no longer part
              of this order. Remove the invalid assignment to continue. Valid
              garment assignments will remain unchanged.
            </p>
            <ul className="mt-4 space-y-3">
              {orphanRepairTargets.map((target) => {
                const targetKey = getOrphanRepairTargetKey(target);
                const fabric = fabrics.find(
                  (candidate) => candidate.code === target.fabricCode,
                );
                const garmentLabel = getFutureGarmentLabel(target.garmentType);
                const allocationNumber =
                  orphanRepairAllocationNumberById.get(target.allocationId);
                return (
                  <li
                    key={targetKey}
                    data-fabric-integrity-repair-item="true"
                    data-repair-allocation-id={target.allocationId}
                    data-repair-garment-key={target.garmentKey}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-heritage-gold/25 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-bold text-heritage-green">
                        {fabric?.name ?? "Saved Fabric"}
                      </p>
                      <p className="mt-1 break-words font-mono text-[11px] text-heritage-ink/60">
                        {target.fabricCode}
                      </p>
                      <p className="mt-2 break-words text-xs leading-relaxed text-heritage-ink/70">
                        Invalid saved assignment for {garmentLabel}
                        {allocationNumber
                          ? ` · Fabric Selection ${allocationNumber}`
                          : ""}
                      </p>
                    </div>
                    <button
                      ref={(element) => {
                        if (element) {
                          orphanRepairActionRefs.current.set(targetKey, element);
                        } else {
                          orphanRepairActionRefs.current.delete(targetKey);
                        }
                      }}
                      type="button"
                      onClick={(event) =>
                        openOrphanRepairDialog(target, event.currentTarget)
                      }
                      disabled={!onRepairInvalidFabricAssignment}
                      aria-label={`Remove invalid Fabric assignment for ${garmentLabel}`}
                      data-remove-invalid-fabric-assignment="true"
                      data-fabric-guide-beam={
                        isFabricGuideBeamOn("orphan_repair", targetKey) ? "true" : undefined
                      }
                      className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-xs font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto ${fabricGuideBeamClass(
                        "orphan_repair",
                        targetKey,
                      )}`}
                    >
                      Remove Invalid Assignment
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          {targets.map(({ assignment }) => {
            const assigned = assignmentByGarmentKey.get(assignment.garmentKey);
            const fabric = assigned
              ? fabrics.find(
                  (candidate) => candidate.code === assigned.allocation.fabricCode,
                )
              : null;
            const fabricStatus = fabric
              ? getFabricAvailabilityMessage(fabric)
              : assigned
                ? "This fabric is no longer in the catalogue."
                : null;
            const garmentLabel = getFutureGarmentLabel(assignment.garmentType);
            const selectionNumber = assigned
              ? fabricAllocationState.fabricAllocations.findIndex(
                  (allocation) =>
                    allocation.allocationId === assigned.allocation.allocationId,
                ) + 1
              : null;
            const allocationCapacity = assigned
              ? partialAllocationSummaryById.get(assigned.allocation.allocationId)
              : null;
            const unassignedFabricAction = assigned
              ? null
              : resolveUnassignedGarmentFabricAction(assignment.garmentKey);
            const selectionHighlight = changingGarmentKey
              ? assignment.garmentKey === changingGarmentKey
                ? "changing"
                : "dimmed"
              : resolveFabricSelectionCardHighlight({
                  isChangingFabric: isChangingFabricSelection,
                  changingSelectionNumber,
                  cardSelectionNumber: selectionNumber,
                });
            const selectionHighlightClass =
              getFabricSelectionCardClass(selectionHighlight);
            return (
              <article
                key={assignment.garmentKey}
                ref={(element) => {
                  if (element) {
                    garmentCardRefs.current.set(assignment.garmentKey, element);
                  } else {
                    garmentCardRefs.current.delete(assignment.garmentKey);
                  }
                }}
                data-fabric-guide-beam={
                  isFabricGuideBeamOn("garment_card", assignment.garmentKey)
                    ? "true"
                    : undefined
                }
                className={`relative flex min-w-0 flex-col rounded-xl border bg-heritage-cream/25 p-4 transition-opacity ${
                  selectionHighlight === "changing"
                    ? `border-heritage-gold ${FABRIC_SELECTION_CHANGING_SCROLL_MARGIN_CLASS}`
                    : "scroll-mt-28 border-heritage-gold/20"
                } ${fabricGuideBeamClass(
                  "garment_card",
                  assignment.garmentKey,
                )} ${selectionHighlightClass} ${
                  selectionHighlight === "idle" &&
                  postAssignmentHighlight?.garmentKey === assignment.garmentKey
                    ? postAssignmentHighlight.kind === "assigned"
                      ? STEP2_ASSIGNED_HIGHLIGHT_CLASS
                      : STEP2_NEXT_UNASSIGNED_HIGHLIGHT_CLASS
                    : ""
                }`}
                data-garment-key={assignment.garmentKey}
                data-assignment-status={assigned ? "assigned" : "unassigned"}
                data-fabric-selection-highlight={selectionHighlight}
                data-fabric-selection-number={
                  selectionNumber != null ? String(selectionNumber) : undefined
                }
                data-fabric-selection-highlight-anchor={
                  selectionHighlight === "changing" &&
                  assignment.garmentKey === firstChangingGarmentKey
                    ? "true"
                    : undefined
                }
                data-post-assignment-highlight={
                  postAssignmentHighlight?.garmentKey === assignment.garmentKey
                    ? postAssignmentHighlight.kind
                    : undefined
                }
              >
                {/* Same layout for every card: square photo on the left, details
                    beside it, content grows so the action button pins to the bottom. */}
                <div
                  className="flex min-w-0 flex-1 flex-row items-start gap-3"
                  data-garment-card-layout="photo-left"
                >
                  {assigned ? (
                    <AssignedFabricPreview
                      fabric={fabric}
                      garmentKey={assignment.garmentKey}
                      garmentLabel={garmentLabel}
                      fabricCode={assigned.allocation.fabricCode}
                      className={GARMENT_CARD_FABRIC_PHOTO_CLASSNAME}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      data-unassigned-fabric-placeholder="true"
                      className={`${GARMENT_CARD_FABRIC_PHOTO_CLASSNAME} flex items-center justify-center border-dashed`}
                    >
                      <Layers3 size={22} className="text-heritage-gold/60" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1 self-stretch">
                    <div
                      className="flex min-w-0 items-start gap-2"
                      data-garment-card-title-row="true"
                    >
                      {selectionNumber != null ? (
                        <span
                          data-fabric-selection-badge="true"
                          role="img"
                          aria-label={`Fabric Selection ${selectionNumber}`}
                          className={`pointer-events-none shrink-0 ${getFabricSelectionBadgeClass(
                            selectionNumber,
                          )}`}
                        >
                          {selectionNumber}
                        </span>
                      ) : null}
                      <p className="min-w-0 flex-1 break-words pt-0.5 text-sm font-bold leading-snug text-heritage-green">
                        {garmentLabel}
                      </p>
                      {assigned && (
                        <button
                          type="button"
                          title="Remove Fabric"
                          aria-label={`Remove fabric from ${garmentLabel}`}
                          ref={(element) => {
                            if (element) {
                              garmentRemoveRefs.current.set(assignment.garmentKey, element);
                            } else {
                              garmentRemoveRefs.current.delete(assignment.garmentKey);
                            }
                          }}
                          data-fabric-guide-beam={
                            isFabricGuideBeamOn("garment_remove", assignment.garmentKey)
                              ? "true"
                              : undefined
                          }
                          onClick={() =>
                            removeAssignedFabric(
                              assignment.garmentKey,
                              garmentLabel,
                              fabric?.name ?? "Selected fabric",
                            )
                          }
                          className={`-my-2.5 -mr-2 ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold leading-none text-heritage-ink/55 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${fabricGuideBeamClass(
                            "garment_remove",
                            assignment.garmentKey,
                          )}`}
                        >
                          <X aria-hidden="true" size={16} />
                          <span className="sr-only">Remove Fabric</span>
                        </button>
                      )}
                    </div>
                    {assigned && fabric ? (
                      <>
                        <p
                          className="break-words text-xs leading-relaxed text-heritage-ink/70"
                          data-garment-card-fabric-line="true"
                        >
                          {fabric.name}{" "}
                          <span className="whitespace-nowrap text-heritage-ink/45">
                            {fabric.code}
                          </span>
                        </p>
                        {/* Each part is unbreakable; the "·" before a part is CSS and
                            sits in the clipped gutter when that part starts a new line,
                            so a wrapped line never ends or starts with a dot. */}
                        <div
                          className="overflow-hidden"
                          data-garment-card-selection-line="true"
                        >
                          <p className="-ml-3 flex flex-wrap text-[10px] font-bold uppercase tracking-wide text-heritage-gold">
                            <span className={GARMENT_CARD_SELECTION_PART_CLASSNAME}>
                              Fabric Selection {selectionNumber}
                            </span>
                            {allocationCapacity ? (
                              <span className="contents" data-fabric-allocation-capacity="true">
                                <span className={GARMENT_CARD_SELECTION_PART_CLASSNAME}>
                                  <span className="sr-only"> · </span>
                                  Capacity: {allocationCapacity.usedUnits}/
                                  {allocationCapacity.usedUnits +
                                    allocationCapacity.remainingUnits}
                                </span>
                                {allocationCapacity.remainingUnits > 0 ? (
                                  <span className={GARMENT_CARD_SELECTION_PART_CLASSNAME}>
                                    <span className="sr-only"> · </span>
                                    {allocationCapacity.remainingUnits}/2 available
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-heritage-ink/60">
                        Fabric not assigned
                      </p>
                    )}
                    {unassignedFabricAction === "blocked" ? (
                      <p
                        className="text-xs font-semibold text-red-700"
                        data-unassigned-fabric-blocked="true"
                      >
                        {UNASSIGNED_FABRIC_NO_CAPACITY_MESSAGE}
                      </p>
                    ) : null}
                    {fabricStatus && (
                      <p className="text-xs font-semibold text-red-700">
                        {fabricStatus}
                      </p>
                    )}
                    <div
                      className="mt-auto flex min-w-0 flex-nowrap items-center justify-between gap-2 pt-1"
                      data-garment-card-status-row="true"
                    >
                      {assigned ? (
                        <FabricPieceUsageMarker fabricUnits={assignment.fabricUnits} />
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        {selectionHighlight === "changing" ? (
                          <span
                            data-fabric-selection-changing-tag="true"
                            className="shrink-0 whitespace-nowrap rounded-full border border-heritage-gold bg-heritage-gold/15 px-2 py-1 text-[9px] font-bold uppercase leading-none tracking-wide text-heritage-gold"
                          >
                            Changing
                          </span>
                        ) : null}
                        <span
                          data-garment-fabric-badge="true"
                          className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-bold uppercase leading-none tracking-wide ${
                            assigned
                              ? "border-heritage-green/25 bg-heritage-green/5 text-heritage-green"
                              : "border-heritage-gold/30 bg-white text-heritage-green"
                          }`}
                        >
                          {assigned ? "Assigned" : "Needs fabric"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                {assigned ? (
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) {
                        garmentActionRefs.current.set(assignment.garmentKey, element);
                      } else {
                        garmentActionRefs.current.delete(assignment.garmentKey);
                      }
                    }}
                    onClick={(event) => {
                      if (
                        fabricAllocationState.pendingFabricGarment?.garmentKey ===
                          assignment.garmentKey &&
                        !fabricAllocationState.awaitingFabricForPendingGarment
                      ) {
                        onChooseAnotherFabric();
                      }
                      openCatalogue(
                        event.currentTarget,
                        assignment.garmentKey,
                        false,
                        true,
                      );
                    }}
                    aria-label={`Change fabric for ${garmentLabel}`}
                    data-fabric-guide-beam={
                      isFabricGuideBeamOn("garment_action", assignment.garmentKey)
                        ? "true"
                        : undefined
                    }
                    className={`${fabricGuideBeamClass(
                      "garment_action",
                      assignment.garmentKey,
                    )} mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green bg-heritage-green px-3 text-[10px] font-bold uppercase tracking-wide text-white transition hover:border-heritage-green hover:bg-white hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start`}
                  >
                    Change Fabric
                  </button>
                ) : unassignedFabricAction === "assign_to_fabric" ? (
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) {
                        garmentActionRefs.current.set(assignment.garmentKey, element);
                      } else {
                        garmentActionRefs.current.delete(assignment.garmentKey);
                      }
                    }}
                    onClick={() =>
                      openPartialFabricAssignment(assignment.garmentKey)
                    }
                    data-testid={`assign-to-fabric-${assignment.garmentKey}`}
                    aria-label={`Assign fabric for ${garmentLabel}`}
                    data-fabric-guide-beam={
                      isFabricGuideBeamOn("garment_action", assignment.garmentKey)
                        ? "true"
                        : undefined
                    }
                    className={`${fabricGuideBeamClass(
                      "garment_action",
                      assignment.garmentKey,
                    )} mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green bg-heritage-green px-3 text-[10px] font-bold uppercase tracking-wide text-white transition hover:border-heritage-green hover:bg-white hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:self-start`}
                  >
                    Assign to Fabric
                  </button>
                ) : unassignedFabricAction === "add_fabric" ? (
                  <button
                    type="button"
                    ref={(element) => {
                      if (element) {
                        garmentActionRefs.current.set(assignment.garmentKey, element);
                      } else {
                        garmentActionRefs.current.delete(assignment.garmentKey);
                      }
                    }}
                    onClick={(event) => {
                      if (
                        fabricAllocationState.pendingFabricGarment?.garmentKey ===
                          assignment.garmentKey &&
                        !fabricAllocationState.awaitingFabricForPendingGarment
                      ) {
                        onChooseAnotherFabric();
                      }
                      openCatalogue(event.currentTarget, assignment.garmentKey);
                    }}
                    aria-label={`Add fabric for ${garmentLabel}`}
                    data-fabric-guide-beam={
                      isFabricGuideBeamOn("garment_action", assignment.garmentKey)
                        ? "true"
                        : undefined
                    }
                    className={`${fabricGuideBeamClass(
                      "garment_action",
                      assignment.garmentKey,
                    )} mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green bg-heritage-green px-3 text-[10px] font-bold uppercase tracking-wide text-white transition hover:border-heritage-green hover:bg-white hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start`}
                  >
                    Add Fabric
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>

        {visibleActionError && (
          <div
            role="alert"
            data-fabric-visible-action-error="true"
            className="mt-5 rounded-2xl border border-red-300/50 bg-red-50/70 p-4"
          >
            <p className="text-sm font-bold text-red-800">Fabric action blocked</p>
            <p className="mt-1 text-sm leading-relaxed text-red-900/85">
              {visibleActionError}
            </p>
          </div>
        )}

        <div
          ref={catalogueSectionRef}
          data-testid="future-fabric-inline-catalogue"
          data-catalogue-dialog-open={isCatalogueOpen}
          data-fabric-catalogue-state={fabricsCatalogueState}
          className="mt-8 border-t border-heritage-gold/20 pt-6"
          tabIndex={-1}
        >
          <div
            ref={catalogueScrollAnchorRef}
            data-catalogue-scroll-anchor="true"
            data-fabric-guide-beam={isFabricGuideBeamOn("catalogue") ? "true" : undefined}
            className={`mb-4 scroll-mt-24 ${
              isFabricGuideBeamOn("catalogue")
                ? `rounded-xl py-2 pl-3 pr-2 ${DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS}`
                : ""
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Fabric Catalogue
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
            <h3
              ref={catalogueHeadingRef}
              aria-live="polite"
              tabIndex={-1}
              className="min-w-0 font-serif text-xl font-bold text-heritage-green"
            >
              {changeFabricPresentation ? (
                <button
                  type="button"
                  data-testid="fabric-selection-change-heading"
                  aria-label={`Choose a new fabric for ${changeHeadingTarget}. Jump to highlighted garment cards.`}
                  onClick={() =>
                    scrollToChangingFabricSelection(firstChangingGarmentKey)
                  }
                  className="inline-flex max-w-full items-center gap-3 rounded-lg text-left font-serif text-xl font-bold text-heritage-green transition hover:text-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                >
                  <span
                    data-fabric-selection-heading-thumb="true"
                    className="inline-flex shrink-0"
                    aria-hidden="true"
                  >
                    <AssignedFabricPreview
                      fabric={changingFabric}
                      garmentKey="fabric-selection-change-heading"
                      garmentLabel={`Fabric Selection ${changeFabricPresentation.fabricSelectionNumber}`}
                      fabricCode={changeFabricPresentation.fabricCode}
                      size="thumb"
                      className="h-8 w-8 overflow-hidden rounded-full border border-heritage-gold/40 bg-heritage-cream/40"
                      imageAlt=""
                    />
                  </span>
                  <span>
                    {`Choose a new fabric for ${changeHeadingTarget}`}
                  </span>
                </button>
              ) : activeCatalogueTarget ? (
                `Choosing fabric for: ${getFutureGarmentLabel(
                  activeCatalogueTarget.assignment.garmentType,
                )}`
              ) : (
                "Available Fabrics"
              )}
            </h3>
            {changeFabricPresentation ? (
              // Compact Cancel change beside the heading so mobile customers
              // don't have to scroll past the whole catalogue. Own line and
              // left-aligned on mobile, clear of the right-side floating buttons.
              <div className="w-full sm:w-auto" data-fabric-change-cancel-near-heading="true">
                <button
                  type="button"
                  onClick={cancelFabricChangeKeepingPlace}
                  data-testid="fabric-change-cancel-heading"
                  aria-label={`Cancel change for Fabric Selection ${changeFabricPresentation.fabricSelectionNumber}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 border-heritage-green bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                >
                  <X aria-hidden="true" size={13} />
                  Cancel change
                </button>
              </div>
            ) : null}
            </div>
            <p
              id="future-fabric-catalogue-help"
              className="mt-2 max-w-2xl break-words text-xs leading-relaxed text-heritage-ink/65"
              aria-live="polite"
              data-fabric-quantity-limit-message={
                showAllocationLimitCopy ? "true" : undefined
              }
              data-fabric-quantity-over-allocated={
                isOverAllocated ? "true" : undefined
              }
              data-fabric-change-swap-free={
                changeFabricPresentation &&
                !isOverAllocated &&
                !changingGarmentOnlyCopy
                  ? "true"
                  : undefined
              }
              data-fabric-change-garment-only={
                changingGarmentOnlyCopy && !isOverAllocated && !showAllocationLimitCopy
                  ? "true"
                  : undefined
              }
            >
              {isOverAllocated
                ? formatFabricQuantityOverAllocatedCopy(
                    selectedFabricQuantity,
                    maxFabricPieces,
                  )
                : showAllocationLimitCopy
                  ? formatFabricQuantityLimitReachedCopy(requiredFabricQuantity)
                  : changingGarmentOnlyCopy
                    ? changingGarmentOnlyCopy
                  : changeFabricPresentation?.isSharedGroup
                    ? `This Fabric is shared by ${formatGarmentList([
                        ...changeFabricPresentation.garmentLabels,
                      ])}. Changing it will update both garments. ${FABRIC_CHANGE_SWAP_FREE_COPY}`
                    : changeFabricPresentation
                      ? `Select a replacement Fabric for Fabric Selection ${changeFabricPresentation.fabricSelectionNumber}. ${FABRIC_CHANGE_SWAP_FREE_COPY}`
                      : activeCatalogueTarget
                        ? `Select a fabric card to assign it to ${getFutureGarmentLabel(
                            activeCatalogueTarget.assignment.garmentType,
                          )}.`
                        : unassignedStep1Targets.length === 1
                          ? `Select a fabric card to assign it to ${getFutureGarmentLabel(
                              unassignedStep1Targets[0]!.assignment.garmentType,
                            )}.`
                          : unassignedStep1Targets.length > 1
                            ? "Select a fabric card to choose which garments should use this Fabric."
                            : "All selected garments have fabric assignments."}
            </p>
            <p
              id="future-fabric-assignment-status"
              aria-live="polite"
              className="sr-only"
            >
              {assignmentAnnouncement}
            </p>
          </div>
          <div
            ref={summaryRowAnchorRef}
            data-fabric-selection-summary-anchor="true"
            className="scroll-mt-28"
          >
            <FabricSelectionSummaryRow
              items={fabricSelectionSummaryItems}
              changingAllocationId={changingAllocationId}
              onSelectSelection={(item, event) =>
                openChangeFromSummary(item, event.currentTarget)
              }
            />
          </div>
          {renderVisibleCatalogue(
            "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          )}
          {catalogueTargetGarmentKey && (
            <div
              className={
                changeFabricPresentation
                  ? "mt-5 pr-16 pb-[env(safe-area-inset-bottom,0px)] sm:pr-0"
                  : "mt-5"
              }
            >
              <button
                type="button"
                onClick={
                  changeFabricPresentation
                    ? cancelFabricChangeKeepingPlace
                    : closeCatalogueForCancellation
                }
                data-testid={
                  changeFabricPresentation ? "fabric-change-cancel" : undefined
                }
                aria-label={
                  changeFabricPresentation
                    ? `Cancel change for Fabric Selection ${changeFabricPresentation.fabricSelectionNumber}`
                    : undefined
                }
                className={
                  changeFabricPresentation
                    ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-heritage-green bg-white px-5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
                    : "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
                }
              >
                {changeFabricPresentation ? (
                  <>
                    <X aria-hidden="true" size={14} />
                    Cancel change
                  </>
                ) : (
                  "Cancel"
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {fabricAllocationState.pendingFabricGarment &&
        !fabricAllocationState.awaitingFabricForPendingGarment && (
          <div
            role="dialog"
            aria-labelledby="future-fabric-limit-title"
            data-fabric-guide-beam={isFabricGuideBeamOn("pending_panel") ? "true" : undefined}
            className={`rounded-2xl border border-heritage-gold/40 bg-heritage-cream/40 p-5 shadow-sm ${fabricGuideBeamClass(
              "pending_panel",
            )}`}
          >
            <h3
              id="future-fabric-limit-title"
              className="font-serif text-lg font-bold text-heritage-green"
            >
              Fabric Selection Limit
            </h3>
            <p className="mt-2 text-sm text-heritage-ink/70">
              {getFutureGarmentLabel(
                fabricAllocationState.pendingFabricGarment.garmentType,
              )} needs another fabric allocation.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                ref={pendingPanelActionRef}
                type="button"
                onClick={handleUseSameFabricAgain}
                className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Use Same Fabric Again
              </button>
              <button
                type="button"
                onClick={(event) => {
                  onChooseAnotherFabric();
                  openCatalogue(
                    event.currentTarget,
                    fabricAllocationState.pendingFabricGarment?.garmentKey || null,
                    true,
                  );
                }}
                className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Choose Another Fabric
              </button>
              <button
                type="button"
                onClick={() => {
                  setVisibleActionError(null);
                  onCancelPendingFabric();
                }}
                className="min-h-11 rounded-xl px-4 text-xs font-bold uppercase tracking-wider text-heritage-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        </DesignStudioStepMain>
        <DesignStudioStepSidebar>
      {orderSummary ? (
        orderSummary
      ) : (
      <aside className="rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-heritage-green">
          <Layers3 aria-hidden="true" size={18} />
          <h3 className="font-serif text-lg font-bold">Fabric Summary</h3>
        </div>
        <p className="mt-2 text-xs text-heritage-ink/65">
          {completion.assignedGarmentCount} of {completion.requiredGarmentCount}{" "}
          garments assigned across {completion.fabricQuantity} fabric selection
          {completion.fabricQuantity === 1 ? "" : "s"}.
        </p>
        <div className="mt-4 space-y-2 border-t border-heritage-gold/15 pt-4 text-sm">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <span className="min-w-0 break-words text-heritage-ink/70">
                Garment Construction Subtotal
              </span>
              <span className="shrink-0 self-end font-mono font-bold text-heritage-green sm:self-auto">
                {PRICING_CURRENCY_SYMBOL}{constructionPrice.toFixed(2)}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-heritage-ink/60">
              {garmentConstructionInclusionNote(orderType)}
            </p>
            {pricing.status === "resolved" && pricing.allocationLines.map((line, index) => (
              <div
                key={line.allocationId}
                className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 break-words text-heritage-ink/70">
                  Fabric Selection {index + 1}: {line.fabric.name}
                </span>
                <span className="shrink-0 self-end font-mono font-bold text-heritage-green sm:self-auto">
                  Included
                </span>
              </div>
            ))}
          </div>
      </aside>
      )}
        </DesignStudioStepSidebar>
        <DesignStudioStepFooter>
      <div
        className="space-y-4"
        data-testid={showContinueAction ? "future-fabric-continue-action" : undefined}
      >
        <DesignStudioStepActions
          slot="footer"
          backDestination="Garment Type"
          onBack={onBack}
          forward={showContinueAction ? {
            destination: "Design Style",
            onClick: onContinue,
            ariaLabel: "Continue to Design Style",
          } : undefined}
        />
      </div>
        </DesignStudioStepFooter>
      </DesignStudioStepLayout>

      {pendingStep1FabricAssignment &&
        step1AssignmentDialogFabric &&
        step1AssignmentEvaluation && (
        <Step1FabricAssignmentDialog
          displayFabric={step1AssignmentDialogFabric.displayFabric}
          currentFabric={step1AssignmentDialogFabric.currentFabric}
          candidates={step1AssignmentCandidates}
          selectedGarmentKeys={pendingStep1FabricAssignment.selectedGarmentKeys}
          selectedCount={step1AssignmentEvaluation.selectedCount}
          selectedCapacityUnits={step1AssignmentEvaluation.selectedCapacityUnits}
          capacityUnitsInUse={step1AssignmentEvaluation.capacityUnitsInUse}
          maxCapacityUnits={step1AssignmentEvaluation.maxCapacityUnits}
          canAssignSelected={
            !step1AssignmentDialogFabric.unavailableError &&
            step1AssignmentEvaluation.canAssignSelected
          }
          canUseForAll={
            !step1AssignmentDialogFabric.unavailableError &&
            step1AssignmentEvaluation.canUseForAll
          }
          groupingCapacityStatus={
            step1AssignmentEvaluation.groupingCapacityStatus
          }
          fabricLevelError={step1AssignmentEvaluation.fabricLevelError}
          selectedCapacityMessage={
            step1AssignmentEvaluation.selectedCapacityMessage
          }
          remainingCapacityMessage={
            step1AssignmentEvaluation.remainingCapacityMessage
          }
          remainingCapacityNote={step1AssignmentEvaluation.remainingCapacityNote}
          candidateEnabled={step1AssignmentEvaluation.candidateEnabled}
          candidateMessages={step1AssignmentEvaluation.candidateMessages}
          selectedFailure={step1AssignmentEvaluation.selectedFailure}
          remainingFailure={step1AssignmentEvaluation.remainingFailure}
          stockPresentation={pendingStep1StockPresentation}
          errorMessage={
            step1AssignmentDialogFabric.unavailableError || step1AssignmentError
          }
          onToggleGarmentKey={(garmentKey, checked) => {
            setStep1AssignmentError(null);
            setPendingStep1FabricAssignment((current) => {
              if (!current) return current;
              const selectedGarmentKeys = checked
                ? [...current.selectedGarmentKeys, garmentKey]
                : current.selectedGarmentKeys.filter((key) => key !== garmentKey);
              return { ...current, selectedGarmentKeys };
            });
          }}
          onAssignSelected={() => commitPendingStep1FabricAssignment("selected")}
          onUseForAll={() => commitPendingStep1FabricAssignment("all_remaining")}
          onCancel={cancelStep1FabricAssignment}
        />
      )}

      {pendingChangeFabricAllocation && pendingChangeFabricPresentation ? (
        <ChangeFabricAllocationDialog
          fabricSelectionNumber={
            pendingChangeFabricPresentation.fabricSelectionNumber
          }
          currentFabricName={pendingChangeFabricPresentation.fabricName}
          nextFabricName={pendingChangeFabricAllocation.nextFabricName}
          garmentLabels={pendingChangeFabricPresentation.garmentLabels}
          isSharedGroup={pendingChangeFabricPresentation.isSharedGroup}
          onConfirm={() => {
            const fabric = fabrics.find(
              (candidate) =>
                candidate.code === pendingChangeFabricAllocation.nextFabricCode,
            );
            if (!fabric) {
              cancelChangeFabricAllocation();
              setVisibleActionError("That Fabric is no longer available.");
              setAssignmentAnnouncement("That Fabric is no longer available.");
              return;
            }
            const focusGarmentKey =
              catalogueTargetGarmentKey ||
              pendingChangeFabricPresentation.garmentKeys[0] ||
              "";
            commitChangeFabricAllocation(
              pendingChangeFabricAllocation.allocationId,
              fabric,
              focusGarmentKey,
              {
                expectedCurrentFabricCode:
                  pendingChangeFabricAllocation.expectedCurrentFabricCode,
                expectedAssignmentSignature:
                  pendingChangeFabricAllocation.expectedAssignmentSignature,
              },
            );
          }}
          onCancel={cancelChangeFabricAllocation}
        />
      ) : null}

      {pendingPartialFabricAssignment &&
      partialAssignmentPresentations.length > 0 ? (
        <PartialFabricCapacityAssignmentDialog
          garmentLabel={
            targets.find(
              ({ assignment }) =>
                assignment.garmentKey ===
                pendingPartialFabricAssignment.garmentKey,
            )
              ? getFutureGarmentLabel(
                  targets.find(
                    ({ assignment }) =>
                      assignment.garmentKey ===
                      pendingPartialFabricAssignment.garmentKey,
                  )!.assignment.garmentType,
                )
              : pendingPartialFabricAssignment.garmentKey
          }
          fabricNameByCode={fabricNameByCode}
          fabricByCode={fabricByCode}
          targets={partialAssignmentPresentations}
          onConfirm={commitPartialFabricAssignment}
          onCancel={cancelPartialFabricAssignment}
          onUseDifferentFabric={useDifferentFabricForPartialAssignment}
        />
      ) : null}

      {pendingFabricRemoval ? (
        <RemoveFabricAssignmentDialog
          fabric={pendingFabricRemoval.fabric}
          targets={pendingFabricRemoval.targets}
          onRemoveGarmentKey={(garmentKey) => {
            const target = pendingFabricRemoval.targets.find(
              (candidate) => candidate.garmentKey === garmentKey,
            );
            removeAssignedFabric(
              garmentKey,
              target?.label || "the selected garment",
              pendingFabricRemoval.fabric.name,
            );
            restoreFabricRemovalFocus();
          }}
          onCancel={() => closeFabricRemovalChooser(true)}
        />
      ) : null}

      {pendingOrphanRepair &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
            <div
              ref={orphanRepairDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={orphanRepairTitleId}
              aria-describedby={orphanRepairDescriptionId}
              tabIndex={-1}
              data-testid="invalid-fabric-assignment-repair-dialog"
              data-repair-allocation-id={pendingOrphanRepair.allocationId}
              data-repair-garment-key={pendingOrphanRepair.garmentKey}
              className="w-full max-w-lg min-w-0 rounded-3xl border border-heritage-gold/40 bg-white p-5 shadow-xl sm:p-6"
            >
              <h2
                id={orphanRepairTitleId}
                className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
              >
                Remove invalid Fabric assignment?
              </h2>
              <p
                id={orphanRepairDescriptionId}
                className="mt-3 break-words text-sm leading-relaxed text-heritage-ink/70"
              >
                This removes the saved Fabric assignment only. It will not add or
                remove garments from your order.
              </p>
              <div className="mt-5 flex min-w-0 flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  ref={orphanRepairInitialFocusRef}
                  type="button"
                  onClick={() => closeOrphanRepairDialog(true)}
                  data-invalid-fabric-repair-cancel="true"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-cream/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmOrphanRepair}
                  data-invalid-fabric-repair-confirm="true"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-red-700 px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 sm:w-auto"
                >
                  Remove Assignment
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {isCatalogueOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={catalogueDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="future-fabric-catalogue-title"
            className="fixed inset-0 z-[9999] overflow-y-auto overflow-x-hidden bg-heritage-cream p-4 sm:p-6"
          >
          <div className="mx-auto min-w-0 max-w-7xl">
            <div className="sticky top-0 z-10 flex min-w-0 items-start justify-between gap-4 border-b border-heritage-gold/20 bg-heritage-cream py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
                  Fabric Catalogue
                </p>
                <h2
                  id="future-fabric-catalogue-title"
                  className="mt-1 break-words font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
                >
                  {activeCatalogueTarget
                    ? `Choose a fabric for ${getFutureGarmentLabel(
                        activeCatalogueTarget.assignment.garmentType,
                      )}`
                    : "Select a fabric"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCatalogueForCancellation}
                aria-label="Close fabric catalogue"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-heritage-green/25 px-3 text-xs font-bold uppercase text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" size={17} />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            {renderVisibleCatalogue(
              "grid min-w-0 grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            )}
          </div>
          </div>,
          document.body,
        )}
    </section>
  );
};
