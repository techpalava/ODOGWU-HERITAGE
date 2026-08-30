import { Layers3, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  Fabric,
  FabricAllocationState,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "../types";
import { getGarmentTypeStepLabel } from "./GarmentTypeStep";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import {
  AssignedFabricPreview,
} from "./AssignedFabricPreview";
import { FutureFabricCatalogueCard } from "./FutureFabricCatalogueCard";
import { Step1FabricAssignmentDialog } from "./Step1FabricAssignmentDialog";
import { PartialFabricCapacityAssignmentDialog } from "./PartialFabricCapacityAssignmentDialog";
import {
  RemoveFabricAssignmentDialog,
  type RemoveFabricAssignmentTarget,
} from "./RemoveFabricAssignmentDialog";
import { getFabricAvailabilityMessage } from "../utils/fabricCatalogueAvailability";
import { resolveFabricAllocationMaterialPricing } from "../utils/fabricAllocationPricing";
import {
  canCreatePhysicalFabricAllocation,
  getFutureCompatiblePartialFabricAllocations,
  getFuturePartialFabricAllocationSummaries,
  getFuturePartialFabricAllocationCompatibleTargets,
  getFuturePartialFabricAssignmentTargetPresentations,
  hasAvoidablePartialFabricAllocation,
  getFutureFabricAssignmentTargets,
  getFutureFabricStep1AssignmentTargets,
  getFutureUnassignedFabricTargets,
  adaptUntargetedStep1CatalogueCardPresentation,
  assignFutureFabricToGarment,
  formatFabricQuantityLimitChangeCopy,
  formatFabricQuantityLimitReachedCopy,
  formatFabricQuantityOverAllocatedCopy,
  formatRequiredFabricQuantitySentence,
  getFutureFabricCatalogueCancelTargets,
  isPhysicalFabricQuantityOverAllocated,
  resolveFutureFabricCatalogueCardPresentation,
  type FutureFabricAssignmentResult,
  type FutureFabricBulkAssignmentResult,
  type FutureFabricCatalogueCancellationResult,
  type FutureFabricCatalogueCardPresentation,
  type FutureFabricStageCompletion,
} from "../utils/designStudioFutureFabricStage";
import { resolveStep2PostAssignmentDestination } from "../utils/step2PostAssignmentDestination";
import {
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  createStep1FabricAssignmentDisplaySnapshot,
  evaluateStep1FabricAssignmentSelection,
  getUnassignedStep1FabricAssignmentCandidates,
  resolveStep1AssignmentDialogFabric,
  resolveStep1FabricCatalogueCardPresentation,
  shouldOpenStep1FabricGroupingDialog,
  type PendingStep1FabricAssignment,
} from "../utils/step1FabricAssignmentPopup";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

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
};

interface DormantFutureFabricStepProps {
  fabrics: Fabric[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  completion: FutureFabricStageCompletion;
  requiredFabricQuantity: number;
  selectedFabricQuantity: number;
  constructionPrice: number;
  onAssignFabricToGarment: (
    fabric: Fabric,
    garmentKey: string,
  ) => FabricAllocationState | void;
  onRemoveFabricFromGarment: (
    garmentKey: string,
  ) => FutureFabricCatalogueCancellationResult | void;
  onUseSameFabricForGarment: (garmentKey: string) => void;
  onAssignSameFabricProduct: (
    fabricCode: string,
    garmentKeys: string[],
  ) => FutureFabricBulkAssignmentResult | void;
  onAssignGarmentToExistingAllocation: (
    garmentKey: string,
    allocationId: string,
  ) => FutureFabricAssignmentResult | void;
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
  orderSummary?: ReactNode;
}

const OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE =
  "Finish assigning fabric to the pending additional garment before removing fabric from another additional garment.";

const STEP2_FABRIC_CAPACITY_INTRO =
  "One Fabric makes two standard garments. A Long Dress (Gown) uses one full Fabric. We'll group your garments so you use the correct number of Fabrics.";

const UNASSIGNED_FABRIC_NO_CAPACITY_MESSAGE =
  "No selected Fabric has capacity for this garment. Change a Fabric assignment or remove a Fabric selection.";

const getFutureGarmentLabel = (garmentType: FabricGarmentType): string =>
  garmentType === "other"
    ? "Other Garment"
    : getGarmentTypeStepLabel(garmentType);

const formatGarmentList = (labels: string[]): string => {
  if (labels.length <= 1) return labels[0] || "the selected garment";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

const formatFabricSelectionProgress = (
  selectedFabricQuantity: number,
  requiredFabricQuantity: number,
): string =>
  `Fabrics Selected: ${selectedFabricQuantity}/${requiredFabricQuantity}`;

const formatGarmentAssignmentProgress = (
  assignedGarmentCount: number,
  requiredGarmentCount: number,
): string =>
  `Garments assigned: ${assignedGarmentCount}/${requiredGarmentCount}`;

const labelOwnedFabricCancelTargets = (
  garmentKeys: readonly string[],
  getGarmentType: (garmentKey: string) => FabricGarmentType | null,
): RemoveFabricAssignmentTarget[] => {
  const items = garmentKeys.map((garmentKey) => {
    const garmentType = getGarmentType(garmentKey);
    return {
      garmentKey,
      baseLabel: garmentType ? getFutureGarmentLabel(garmentType) : garmentKey,
    };
  });
  const counts = new Map<string, number>();
  items.forEach((item) => {
    counts.set(item.baseLabel, (counts.get(item.baseLabel) || 0) + 1);
  });
  const seen = new Map<string, number>();
  return items.map((item) => {
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
const STEP2_NEXT_UNASSIGNED_HIGHLIGHT_CLASS =
  "ring-2 ring-heritage-gold motion-safe:animate-step2-next-unassigned motion-reduce:animate-none";

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
  requiredFabricQuantity,
  selectedFabricQuantity,
  constructionPrice,
  onAssignFabricToGarment,
  onRemoveFabricFromGarment,
  onUseSameFabricForGarment,
  onAssignSameFabricProduct,
  onAssignGarmentToExistingAllocation,
  onBack,
  onContinue,
  onUseSameFabric,
  onChooseAnotherFabric,
  onCancelPendingFabric,
  orderSummary = null,
}: DormantFutureFabricStepProps) => {
  void onUseSameFabricForGarment;
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);
  const [catalogueTargetGarmentKey, setCatalogueTargetGarmentKey] = useState<
    string | null
  >(null);
  const [assignmentAnnouncement, setAssignmentAnnouncement] = useState("");
  const [visibleActionError, setVisibleActionError] = useState<string | null>(
    null,
  );
  const [pendingStep1FabricAssignment, setPendingStep1FabricAssignment] =
    useState<PendingStep1FabricAssignment | null>(null);
  const [pendingPartialFabricAssignment, setPendingPartialFabricAssignment] =
    useState<{ garmentKey: string } | null>(null);
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
  const fabricRemovalTriggerRef = useRef<HTMLElement | null>(null);
  const catalogueDialogRef = useRef<HTMLDivElement>(null);
  const catalogueSectionRef = useRef<HTMLDivElement>(null);
  const catalogueScrollAnchorRef = useRef<HTMLDivElement>(null);
  const catalogueTriggerRef = useRef<HTMLElement | null>(null);
  const catalogueFocusGarmentKeyRef = useRef<string | null>(null);
  const catalogueFocusRequestRef = useRef(0);
  const postAssignmentFocusRequestRef = useRef(0);
  const garmentActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const garmentCardRefs = useRef(new Map<string, HTMLElement>());
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
  const targets = getFutureFabricAssignmentTargets(garmentTypeSelection);
  const activeCatalogueTarget = catalogueTargetGarmentKey
    ? targets.find(
        ({ assignment }) =>
          assignment.garmentKey === catalogueTargetGarmentKey,
      )
    : null;
  useEffect(() => {
    if (catalogueTargetGarmentKey && !activeCatalogueTarget) {
      setCatalogueTargetGarmentKey(null);
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
    },
    [],
  );
  const unassignedTargets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
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
  const unassignedStep1Targets = getUnassignedStep1FabricAssignmentCandidates({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const isPendingAdditionalCatalogueTarget = Boolean(
    pendingAdditionalAssignment &&
      (!catalogueTargetGarmentKey ||
        catalogueTargetGarmentKey === pendingAdditionalAssignment.garmentKey),
  );
  const isStep1CatalogueMode =
    !isChangeFabricTarget && !isPendingAdditionalCatalogueTarget;
  const isOverAllocated = isPhysicalFabricQuantityOverAllocated({
    selectedFabricQuantity,
    requiredFabricQuantity,
  });
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
      }).filter((entry) => entry.compatibleGarmentKeys.length > 0),
    [garmentTypeSelection, fabricAllocationState],
  );
  const showAvoidablePartialGuidance =
    !isOverAllocated &&
    hasAvoidablePartialFabricAllocation({
      garmentTypeSelection,
      fabricAllocationState,
    });
  const avoidablePartialGuidanceCopy =
    compatiblePartialTargets.length > 1 ||
    compatiblePartialTargets.some(
      (entry) => entry.compatibleGarmentKeys.length > 1,
    )
      ? "Complete your selected Fabrics by assigning the remaining garments to available Fabric capacity."
      : "Complete your selected Fabric by assigning the remaining garment to it.";
  const fabricSlotsAvailable = canCreatePhysicalFabricAllocation({
    state: fabricAllocationState,
    garmentTypeSelection,
  });
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
    });
    if (compatibleAllocations.length > 0) {
      return "assign_to_fabric";
    }
    return "blocked";
  };
  const fabricNameByCode = useMemo(
    () => new Map(fabrics.map((fabric) => [fabric.code, fabric.name])),
    [fabrics],
  );
  const partialAssignmentPresentations = pendingPartialFabricAssignment
    ? getFuturePartialFabricAssignmentTargetPresentations({
        garmentTypeSelection,
        fabricAllocationState,
        garmentKey: pendingPartialFabricAssignment.garmentKey,
      })
    : [];
  const showAllocationLimitCopy =
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
  const uniqueBlockers = Array.from(
    new Set(
      completion.blockers.map((blocker) =>
        blocker.code === "FABRIC_QUANTITY_OVER_ALLOCATED"
          ? formatFabricQuantityOverAllocatedCopy(
              selectedFabricQuantity,
              requiredFabricQuantity,
            )
          : blockerMessages[blocker.code],
      ),
    ),
  );
  const shouldDockContinueAction =
    completion.isComplete && !isCatalogueOpen && !pendingStep1FabricAssignment;

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
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    restoreCatalogueFocus();
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

  const completeCatalogueAssignment = (garmentKey: string) => {
    catalogueFocusRequestRef.current += 1;
    catalogueTriggerRef.current = null;
    catalogueFocusGarmentKeyRef.current = null;
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
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

  const applyCommittedStep1FabricAssignment = ({
    fabricCode,
    fabricName,
    assignedGarmentKeys,
    keepDialogOnBlock,
  }: {
    fabricCode: string;
    fabricName: string;
    assignedGarmentKeys: string[];
    keepDialogOnBlock: boolean;
  }) => {
    const parentResult = onAssignSameFabricProduct(
      fabricCode,
      assignedGarmentKeys,
    );
    if (parentResult && parentResult.status === "blocked") {
      reportBlockedStep1FabricAssignment(
        "That fabric could not be assigned. No garments were changed.",
        keepDialogOnBlock,
      );
      return;
    }
    const assignedKeys =
      parentResult && parentResult.status === "assigned"
        ? parentResult.assignedGarmentKeys
        : assignedGarmentKeys;
    finalizeSuccessfulStep1FabricAssignment(fabricName, assignedKeys);
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
    const result = commitStep1FabricAssignment({
      state: fabricAllocationState,
      garmentTypeSelection,
      fabrics,
      fabricCode: pendingStep1FabricAssignment.fabricCode,
      selectedGarmentKeys: pendingStep1FabricAssignment.selectedGarmentKeys,
      mode,
    });
    if (result.status === "blocked") {
      reportBlockedStep1FabricAssignment(result.error, true);
      return;
    }
    applyCommittedStep1FabricAssignment({
      fabricCode: pendingStep1FabricAssignment.fabricCode,
      fabricName,
      assignedGarmentKeys: result.assignedGarmentKeys,
      keepDialogOnBlock: true,
    });
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
    const result = commitStep1FabricAssignment({
      state: fabricAllocationState,
      garmentTypeSelection,
      fabrics,
      fabricCode: fabric.code,
      selectedGarmentKeys: [garmentKey],
      mode: "selected",
    });
    if (result.status === "blocked") {
      reportBlockedStep1FabricAssignment(result.error, false);
      return;
    }
    applyCommittedStep1FabricAssignment({
      fabricCode: fabric.code,
      fabricName: fabric.name,
      assignedGarmentKeys: result.assignedGarmentKeys,
      keepDialogOnBlock: false,
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
    originatingGarmentKey: string | null = catalogueTargetGarmentKey,
  ) => {
    const presentation = resolveStep1FabricCatalogueCardPresentation({
      fabricCode: fabric.code,
      garmentTypeSelection,
      fabricAllocationState,
      availabilityMessage: getFabricAvailabilityMessage(fabric),
    });
    if (presentation.action === "none") {
      return;
    }
    const candidates = buildStep1FabricAssignmentCandidates({
      garmentTypeSelection,
      fabricAllocationState,
      fabricCode: fabric.code,
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
    const preselectedGarmentKeys =
      originatingGarmentKey &&
      candidates.some(
        (candidate) => candidate.garmentKey === originatingGarmentKey,
      )
        ? [originatingGarmentKey]
        : candidates.length === 1
          ? [candidates[0]!.garmentKey]
          : [];
    setPendingStep1FabricAssignment({
      fabricCode: fabric.code,
      selectedGarmentKeys: preselectedGarmentKeys,
      displayFabric: createStep1FabricAssignmentDisplaySnapshot(fabric),
    });
  };

  const openCatalogue = (
    trigger: HTMLElement,
    garmentKey: string | null = null,
    openDialog = false,
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    postAssignmentFocusRequestRef.current += 1;
    catalogueTriggerRef.current = trigger;
    catalogueFocusGarmentKeyRef.current = garmentKey;
    const request = ++catalogueFocusRequestRef.current;
    setVisibleActionError(null);
    setCatalogueTargetGarmentKey(garmentKey);
    setIsCatalogueOpen(openDialog);
    if (openDialog || typeof window === "undefined") {
      return;
    }
    const scrollToCatalogueHeader = () => {
      if (request !== catalogueFocusRequestRef.current) return;
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

  const assignSelectedFabric = (fabric: Fabric, garmentKey: string) => {
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
      state: fabricAllocationState,
      garmentTypeSelection,
      garmentKey,
      fabricCode: fabric.code,
    });
    if (preview.status === "blocked") {
      const blockedMessage =
        preview.reason === "FABRIC_QUANTITY_LIMIT_REACHED"
          ? formatFabricQuantityLimitChangeCopy(requiredFabricQuantity)
          : "That fabric could not be assigned to this garment.";
      setVisibleActionError(blockedMessage);
      setAssignmentAnnouncement(blockedMessage);
      pendingAssignmentAnnouncementRef.current = null;
      return;
    }
    const nextState = onAssignFabricToGarment(fabric, garmentKey);
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
  };

  const handleFabricSelection = (
    fabric: Fabric,
    trigger?: HTMLElement,
  ) => {
    setVisibleActionError(null);
    if (
      catalogueTargetGarmentKey &&
      activeCatalogueTarget &&
      assignmentByGarmentKey.has(catalogueTargetGarmentKey)
    ) {
      assignSelectedFabric(fabric, activeCatalogueTarget.assignment.garmentKey);
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
        })
      : null;
    const useStep1CardPresentation = Boolean(
      step1Presentation &&
        (step1Presentation.action !== "none" ||
          step1Presentation.status === "ALL GARMENTS HAVE FABRIC" ||
          step1Presentation.status === "UNAVAILABLE" ||
          unassignedStep1Targets.length > 0),
    );
    const cardPresentation: FutureFabricCatalogueCardPresentation =
      step1Presentation && useStep1CardPresentation
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
          });
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
    );
    const singleCancelLabel =
      labeledCancelTargets.length === 1 ? labeledCancelTargets[0]!.label : "";
    const targetGarmentLabel =
      cardPresentation.action === "cancel"
        ? singleCancelLabel || undefined
        : currentTarget
          ? getFutureGarmentLabel(currentTarget.assignment.garmentType)
          : undefined;
    const handleCatalogueRemove = (event?: { currentTarget: HTMLElement }) => {
      if (
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
        describedBy="future-fabric-catalogue-help future-fabric-assignment-status"
        onAction={(event) => {
          handleFabricSelection(fabric, event?.currentTarget);
        }}
        onRemove={handleCatalogueRemove}
      />
    );
  };

  return (
    <section
      aria-labelledby="future-fabric-step-title"
      className="space-y-6 pb-28 font-sans sm:pb-32"
      data-stage-id="fabric"
      data-stage-complete={completion.isComplete}
      data-bottom-action-reserved="true"
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] lg:gap-6">
        <div className="min-w-0 space-y-6">
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Garment Type"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 2 of 9
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
          </div>
          <div
            aria-live="polite"
            data-fabric-progress="true"
            className="flex min-w-0 max-w-full shrink-0 items-start gap-3 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 px-4 py-2 text-xs font-bold text-heritage-green"
          >
            <Layers3
              aria-hidden="true"
              data-fabric-progress-icon="true"
              size={20}
              className="mt-0.5 shrink-0 text-heritage-gold"
            />
            <div className="min-w-0 flex-1">
              <p data-fabric-selection-progress="true" className="break-words">
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
          </div>
        </div>

        {showAvoidablePartialGuidance ? (
          <p
            data-avoidable-partial-guidance="true"
            className="mt-4 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/35 px-4 py-3 text-sm leading-relaxed text-heritage-ink/75"
          >
            {avoidablePartialGuidanceCopy}
          </p>
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
                className={`flex min-w-0 scroll-mt-28 flex-col rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-4 ${
                  postAssignmentHighlight?.garmentKey === assignment.garmentKey
                    ? postAssignmentHighlight.kind === "assigned"
                      ? STEP2_ASSIGNED_HIGHLIGHT_CLASS
                      : STEP2_NEXT_UNASSIGNED_HIGHLIGHT_CLASS
                    : ""
                }`}
                data-garment-key={assignment.garmentKey}
                data-assignment-status={assigned ? "assigned" : "unassigned"}
                data-post-assignment-highlight={
                  postAssignmentHighlight?.garmentKey === assignment.garmentKey
                    ? postAssignmentHighlight.kind
                    : undefined
                }
              >
                <div
                  className={
                    assigned
                      ? "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start"
                      : "min-w-0"
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <p className="min-w-0 break-words text-sm font-bold text-heritage-green">
                          {garmentLabel}
                        </p>
                        <span className="shrink-0 rounded-full border border-heritage-gold/30 bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-heritage-green">
                          {assigned ? "Assigned" : "Needs fabric"}
                        </span>
                      </div>
                      {assigned && (
                        <button
                          type="button"
                          title="Remove Fabric"
                          aria-label={`Remove fabric from ${garmentLabel}`}
                          onClick={() =>
                            removeAssignedFabric(
                              assignment.garmentKey,
                              garmentLabel,
                              fabric?.name ?? "Selected fabric",
                            )
                          }
                          className="ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg font-semibold leading-none text-heritage-ink/55 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                        >
                          <X aria-hidden="true" size={16} />
                          <span className="sr-only">Remove Fabric</span>
                        </button>
                      )}
                    </div>
                    {assigned && fabric ? (
                      <>
                        <p className="mt-1 break-words text-xs leading-relaxed text-heritage-ink/70">
                          {fabric.name} ({fabric.code})
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-heritage-gold">
                          Fabric Selection {selectionNumber}
                        </p>
                        {allocationCapacity ? (
                          <p
                            className="mt-1 text-[10px] font-bold uppercase tracking-wide text-heritage-gold"
                            data-fabric-allocation-capacity="true"
                          >
                            Capacity:{" "}
                            {allocationCapacity.usedUnits}/
                            {allocationCapacity.usedUnits +
                              allocationCapacity.remainingUnits}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-heritage-ink/60">
                        Fabric not assigned
                      </p>
                    )}
                    {unassignedFabricAction === "blocked" ? (
                      <p
                        className="mt-2 text-xs font-semibold text-red-700"
                        data-unassigned-fabric-blocked="true"
                      >
                        {UNASSIGNED_FABRIC_NO_CAPACITY_MESSAGE}
                      </p>
                    ) : null}
                    {fabricStatus && (
                      <p className="mt-2 text-xs font-semibold text-red-700">
                        {fabricStatus}
                      </p>
                    )}
                  </div>
                  {assigned ? (
                    <AssignedFabricPreview
                      fabric={fabric}
                      garmentKey={assignment.garmentKey}
                      garmentLabel={garmentLabel}
                      fabricCode={assigned.allocation.fabricCode}
                    />
                  ) : null}
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
                      openCatalogue(event.currentTarget, assignment.garmentKey);
                    }}
                    aria-label={`Change fabric for ${garmentLabel}`}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start"
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
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:self-start"
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
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start"
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
          className="mt-8 border-t border-heritage-gold/20 pt-6"
          tabIndex={-1}
        >
          <div
            ref={catalogueScrollAnchorRef}
            data-catalogue-scroll-anchor="true"
            className="mb-4 scroll-mt-24"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Fabric Catalogue
            </p>
            <h3
              ref={catalogueHeadingRef}
              aria-live="polite"
              tabIndex={-1}
              className="mt-1 font-serif text-xl font-bold text-heritage-green"
            >
              {activeCatalogueTarget
                ? `Choosing fabric for: ${getFutureGarmentLabel(
                    activeCatalogueTarget.assignment.garmentType,
                  )}`
                : "Available Fabrics"}
            </h3>
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
            >
              {isOverAllocated
                ? formatFabricQuantityOverAllocatedCopy(
                    selectedFabricQuantity,
                    requiredFabricQuantity,
                  )
                : showAllocationLimitCopy
                  ? formatFabricQuantityLimitReachedCopy(requiredFabricQuantity)
                  : activeCatalogueTarget && isChangeFabricTarget
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
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleFabrics.map((fabric) => renderCatalogueCard(fabric))}
          </div>
          {catalogueTargetGarmentKey && (
            <div className="mt-5">
              <button
                type="button"
                onClick={closeCatalogueForCancellation}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {uniqueBlockers.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
          data-fabric-needs-attention="true"
          data-fabric-quantity-over-allocated={
            isOverAllocated ? "true" : undefined
          }
        >
          <p className="text-sm font-bold text-heritage-green">Fabric needs attention</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">
            {uniqueBlockers.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {fabricAllocationState.pendingFabricGarment &&
        !fabricAllocationState.awaitingFabricForPendingGarment && (
          <div
            role="dialog"
            aria-labelledby="future-fabric-limit-title"
            className="rounded-2xl border border-heritage-gold/40 bg-heritage-cream/40 p-5 shadow-sm"
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

        </div>
        <div className="mt-6 min-w-0 lg:mt-0">
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
              Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.
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
        </div>
      </div>

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
          selectedCapacityMessage={
            step1AssignmentEvaluation.selectedCapacityMessage
          }
          remainingCapacityMessage={
            step1AssignmentEvaluation.remainingCapacityMessage
          }
          candidateMessages={step1AssignmentEvaluation.candidateMessages}
          selectedFailure={step1AssignmentEvaluation.selectedFailure}
          remainingFailure={step1AssignmentEvaluation.remainingFailure}
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
          targets={partialAssignmentPresentations}
          onConfirm={commitPartialFabricAssignment}
          onCancel={cancelPartialFabricAssignment}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DesignStudioBackButton destination="Garment Type" onClick={onBack} />
        {shouldDockContinueAction && (
          <div
            data-testid="future-fabric-continue-action"
            data-docked="true"
            className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
          >
            <div className="mx-auto flex w-full max-w-4xl justify-end rounded-2xl border border-heritage-gold/30 bg-white/95 p-3 shadow-[0_14px_30px_rgba(19,33,29,0.18)] backdrop-blur-sm sm:px-4 sm:py-3.5">
              <button
                type="button"
                onClick={onContinue}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
              >
                Continue to Design Style
              </button>
            </div>
          </div>
        )}
      </div>

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

            <div className="grid min-w-0 grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleFabrics.map((fabric) => renderCatalogueCard(fabric))}
            </div>
          </div>
          </div>,
          document.body,
        )}
    </section>
  );
};
