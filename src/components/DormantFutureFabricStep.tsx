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
import {
  RemoveFabricAssignmentDialog,
  type RemoveFabricAssignmentTarget,
} from "./RemoveFabricAssignmentDialog";
import { resolveFabricAllocationMaterialPricing } from "../utils/fabricAllocationPricing";
import { getFabricAvailabilityMessage } from "../utils/fabricCatalogueAvailability";
import {
  getFutureFabricAssignmentTargets,
  getFutureUnassignedFabricTargets,
  resolveFutureFabricCatalogueCardPresentation,
  type FutureFabricBulkAssignmentResult,
  type FutureFabricCatalogueCancellationResult,
  type FutureFabricCatalogueCardPresentation,
  type FutureFabricStageCompletion,
} from "../utils/designStudioFutureFabricStage";
import {
  buildStep1FabricAssignmentCandidates,
  commitStep1FabricAssignment,
  createStep1FabricAssignmentDisplaySnapshot,
  evaluateStep1FabricAssignmentSelection,
  getUnassignedStep1FabricAssignmentCandidates,
  resolveStep1AssignmentDialogFabric,
  resolveStep1FabricCatalogueCardPresentation,
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
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
  orderSummary?: ReactNode;
}

const OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE =
  "Finish assigning fabric to the pending additional garment before removing fabric from another additional garment.";

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
  `Fabric selections: ${selectedFabricQuantity} of ${requiredFabricQuantity} needed`;

const formatGarmentAssignmentProgress = (
  assignedGarmentCount: number,
  requiredGarmentCount: number,
): string =>
  `Garments assigned: ${assignedGarmentCount} of ${requiredGarmentCount}`;

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
  const catalogueTriggerRef = useRef<HTMLElement | null>(null);
  const catalogueFocusGarmentKeyRef = useRef<string | null>(null);
  const catalogueFocusRequestRef = useRef(0);
  const postAssignmentFocusRequestRef = useRef(0);
  const garmentActionRefs = useRef(new Map<string, HTMLButtonElement>());
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
      catalogueHeadingRef.current = null;
      garmentActionRefs.current.clear();
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
      completion.blockers.map((blocker) => blockerMessages[blocker.code]),
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
    closeStep1FabricAssignment();
    restoreStep1AssignmentFocus();
  };

  const announceAssignedGarments = (fabricName: string, garmentKeys: string[]) => {
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
      setVisibleActionError(null);
      setAssignmentAnnouncement(
        `${fabricName} assigned to ${formatGarmentList(labels)}.`,
      );
    }
  };

  const commitPendingStep1FabricAssignment = (
    mode: "selected" | "all_remaining",
  ) => {
    if (!pendingStep1FabricAssignment) return;
    if (step1AssignmentDialogFabric?.unavailableError) {
      setStep1AssignmentError(step1AssignmentDialogFabric.unavailableError);
      setAssignmentAnnouncement(step1AssignmentDialogFabric.unavailableError);
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
      setStep1AssignmentError(result.error);
      setAssignmentAnnouncement(result.error);
      return;
    }
    const parentResult = onAssignSameFabricProduct(
      pendingStep1FabricAssignment.fabricCode,
      result.assignedGarmentKeys,
    );
    if (parentResult && parentResult.status === "blocked") {
      setStep1AssignmentError(
        "That fabric could not be assigned. No garments were changed.",
      );
      setAssignmentAnnouncement(
        "That fabric could not be assigned. No garments were changed.",
      );
      return;
    }
    closeStep1FabricAssignment();
    restoreStep1AssignmentFocus();
    const assignedKeys =
      parentResult && parentResult.status === "assigned"
        ? parentResult.assignedGarmentKeys
        : result.assignedGarmentKeys;
    announceAssignedGarments(fabricName, assignedKeys);
  };

  const openStep1FabricAssignment = (
    fabric: Fabric,
    trigger?: HTMLElement,
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
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    postAssignmentFocusRequestRef.current += 1;
    catalogueTriggerRef.current = trigger;
    catalogueFocusGarmentKeyRef.current = garmentKey;
    catalogueFocusRequestRef.current += 1;
    setVisibleActionError(null);
    setCatalogueTargetGarmentKey(garmentKey);
    setIsCatalogueOpen(openDialog);
    if (!openDialog && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const catalogue = catalogueSectionRef.current;
        catalogue?.scrollIntoView({ behavior: "smooth", block: "start" });
        catalogue
          ?.querySelector<HTMLElement>("[data-fabric-card]")
          ?.focus();
      });
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
        ? {
            status:
              step1Presentation.status === "UNAVAILABLE"
                ? "SELECT"
                : step1Presentation.status,
            action:
              step1Presentation.action === "none"
                ? "none"
                : step1Presentation.action === "use_again"
                  ? "use_again"
                  : "select",
            cancelGarmentKey: null,
            cancelGarmentKeys: [],
          }
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

    return (
      <FutureFabricCatalogueCard
        key={fabric.code}
        fabric={fabric}
        presentation={cardPresentation}
        targetGarmentLabel={targetGarmentLabel}
        stockBadgeIdPrefix="future-fabric-stock"
        describedBy="future-fabric-catalogue-help future-fabric-assignment-status"
        onAction={(event) => {
          if (
            cardPresentation.action === "cancel" &&
            cancelGarmentKeys.length > 0 &&
            !getFabricAvailabilityMessage(fabric)
          ) {
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
            return;
          }
          handleFabricSelection(fabric, event?.currentTarget);
        }}
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
              Assign fabric to every garment selected in Step 1. Garments may
              share a fabric while the existing two-unit capacity rule allows it.
            </p>
          </div>
          <div
            aria-live="polite"
            data-fabric-progress="true"
            className="min-w-0 max-w-full shrink-0 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 px-4 py-2 text-xs font-bold text-heritage-green"
          >
            <p data-fabric-selection-progress="true">
              {formatFabricSelectionProgress(
                selectedFabricQuantity,
                requiredFabricQuantity,
              )}
            </p>
            <p data-garment-assignment-progress="true" className="mt-1">
              {formatGarmentAssignmentProgress(
                completion.assignedGarmentCount,
                completion.requiredGarmentCount,
              )}
            </p>
          </div>
        </div>

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
            return (
              <article
                key={assignment.garmentKey}
                className="flex min-w-0 flex-col rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-4"
                data-garment-key={assignment.garmentKey}
                data-assignment-status={assigned ? "assigned" : "unassigned"}
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
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-heritage-ink/60">
                        Fabric not assigned
                      </p>
                    )}
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
                  aria-label={`${assigned ? "Change" : "Add"} fabric for ${garmentLabel}`}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start"
                >
                  {assigned ? "Change Fabric" : "Add Fabric"}
                </button>
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
          className="mt-8 scroll-mt-6 border-t border-heritage-gold/20 pt-6"
          tabIndex={-1}
        >
          <div className="mb-4">
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
              className="mt-2 max-w-2xl text-xs leading-relaxed text-heritage-ink/65"
              aria-live="polite"
            >
              {activeCatalogueTarget && isChangeFabricTarget
                ? `Select a fabric card to assign it to ${getFutureGarmentLabel(
                    activeCatalogueTarget.assignment.garmentType,
                  )}.`
                : unassignedStep1Targets.length > 0
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

      {pendingStep1FabricAssignment &&
        step1AssignmentDialogFabric &&
        step1AssignmentEvaluation && (
        <Step1FabricAssignmentDialog
          displayFabric={step1AssignmentDialogFabric.displayFabric}
          currentFabric={step1AssignmentDialogFabric.currentFabric}
          candidates={step1AssignmentCandidates}
          selectedGarmentKeys={pendingStep1FabricAssignment.selectedGarmentKeys}
          selectedCount={step1AssignmentEvaluation.selectedCount}
          canAssignSelected={
            !step1AssignmentDialogFabric.unavailableError &&
            step1AssignmentEvaluation.canAssignSelected
          }
          canUseForAll={
            !step1AssignmentDialogFabric.unavailableError &&
            step1AssignmentEvaluation.canUseForAll
          }
          selectedCapacityMessage={
            step1AssignmentEvaluation.selectedCapacityMessage
          }
          remainingCapacityMessage={
            step1AssignmentEvaluation.remainingCapacityMessage
          }
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
