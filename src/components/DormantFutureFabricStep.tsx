import { Check, Layers3, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Fabric,
  FabricAllocationState,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "../types";
import { getGarmentTypeStepLabel } from "./GarmentTypeStep";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import { resolveFabricAllocationMaterialPricing } from "../utils/fabricAllocationPricing";
import { resolveFabricPrice } from "../utils/fabricPricing";
import { getFabricStockPresentation } from "../utils/fabricStockPresentation";
import {
  getFutureFabricAssignmentTargets,
  getFutureFabricBulkChoiceCandidates,
  getFutureFabricStep1AssignmentTargets,
  getFutureUnassignedFabricTargets,
  resolveFutureFabricCatalogueCardPresentation,
  type FutureFabricBulkAssignmentResult,
  type FutureFabricCatalogueCancellationResult,
  type FutureFabricStageCompletion,
} from "../utils/designStudioFutureFabricStage";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

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
}

interface FabricBulkChoicePrompt {
  fabricCode: string;
  fabricName: string;
  sourceGarmentKey: string;
  assignmentGeneration: number;
  phase: "ask" | "choose";
}

const OTHER_ADDITIONAL_GARMENT_PENDING_MESSAGE =
  "Finish assigning fabric to the pending additional garment before removing fabric from another additional garment.";

const getFabricAvailabilityMessage = (fabric: Fabric): string | null => {
  if (fabric.stockStatus === "OUT_OF_STOCK") {
    return "Currently out of stock.";
  }
  if (fabric.stockStatus === "HIDDEN") {
    return "This fabric is no longer available.";
  }
  if (resolveFabricPrice(fabric) === null) {
    return "Price needs catalogue review before selection.";
  }
  return null;
};

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
  const [bulkChoicePrompt, setBulkChoicePrompt] =
    useState<FabricBulkChoicePrompt | null>(null);
  const [bulkChoiceSelectedKeys, setBulkChoiceSelectedKeys] = useState<
    string[]
  >([]);
  const [bulkChoiceStatusMessage, setBulkChoiceStatusMessage] = useState("");
  const [pendingRemovalRequest, setPendingRemovalRequest] = useState<number | null>(
    null,
  );
  const catalogueDialogRef = useRef<HTMLDivElement>(null);
  const catalogueSectionRef = useRef<HTMLDivElement>(null);
  const catalogueTriggerRef = useRef<HTMLElement | null>(null);
  const catalogueFocusGarmentKeyRef = useRef<string | null>(null);
  const catalogueFocusRequestRef = useRef(0);
  const postAssignmentFocusRequestRef = useRef(0);
  const garmentActionRefs = useRef(new Map<string, HTMLButtonElement>());
  const catalogueHeadingRef = useRef<HTMLHeadingElement>(null);
  const bulkChoiceDialogRef = useRef<HTMLDivElement>(null);
  const bulkChoiceTriggerRef = useRef<HTMLElement | null>(null);
  const registerBulkChoiceControl = (element: HTMLElement | null) => {
    void element;
  };
  const bulkChoiceAnsweredRef = useRef(false);
  const pendingAssignmentAnnouncementRef = useRef<{
    fabricCode: string;
    fabricName: string;
    targetGarmentKey: string;
    assignmentGeneration: number;
    wasEligibleFirstStep1Assignment: boolean;
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
  const bulkChoiceCandidates = bulkChoicePrompt
    ? getFutureFabricBulkChoiceCandidates({
        garmentTypeSelection,
        fabricAllocationState,
        excludeGarmentKey: bulkChoicePrompt.sourceGarmentKey,
      })
    : [];
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
  const hasRequiredFabricAssignment = targets.some(({ assignment }) =>
    assignmentByGarmentKey.has(assignment.garmentKey),
  );
  const getCommittedFabricCode = (
    state: FabricAllocationState,
    garmentKey: string,
  ): string | null =>
    state.fabricAllocations.find((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === garmentKey,
      ),
    )?.fabricCode ?? null;
  const settleBulkChoiceFromCommittedState = (
    committedState: FabricAllocationState,
    intent: NonNullable<typeof pendingAssignmentAnnouncementRef.current>,
    options: { clearOnMiss: boolean },
  ): boolean => {
    if (intent.assignmentGeneration !== assignmentGenerationRef.current) {
      pendingAssignmentAnnouncementRef.current = null;
      return false;
    }
    const assignedCode = getCommittedFabricCode(
      committedState,
      intent.targetGarmentKey,
    );
    if (assignedCode !== intent.fabricCode) {
      if (options.clearOnMiss) {
        pendingAssignmentAnnouncementRef.current = null;
        setBulkChoicePrompt((current) =>
          current?.assignmentGeneration === intent.assignmentGeneration
            ? null
            : current,
        );
      }
      return false;
    }
    const remainingCandidates = getFutureFabricBulkChoiceCandidates({
      garmentTypeSelection,
      fabricAllocationState: committedState,
      excludeGarmentKey: intent.targetGarmentKey,
    });
    const step1Targets = getFutureFabricStep1AssignmentTargets(
      garmentTypeSelection,
    );
    let openedBulkChoice = false;
    if (
      intent.wasEligibleFirstStep1Assignment &&
      !bulkChoiceAnsweredRef.current &&
      step1Targets.length > 1 &&
      remainingCandidates.length > 0
    ) {
      postAssignmentFocusRequestRef.current += 1;
      setBulkChoicePrompt({
        fabricCode: intent.fabricCode,
        fabricName: intent.fabricName,
        sourceGarmentKey: intent.targetGarmentKey,
        assignmentGeneration: intent.assignmentGeneration,
        phase: "ask",
      });
      setBulkChoiceSelectedKeys([]);
      setBulkChoiceStatusMessage("");
      openedBulkChoice = true;
    }
    const assignedTarget = targets.find(
      ({ assignment }) => assignment.garmentKey === intent.targetGarmentKey,
    );
    if (assignedTarget) {
      setVisibleActionError(null);
      setAssignmentAnnouncement(
        `${intent.fabricName} assigned to ${getFutureGarmentLabel(
          assignedTarget.assignment.garmentType,
        )}.`,
      );
    }
    pendingAssignmentAnnouncementRef.current = null;
    return openedBulkChoice;
  };
  useEffect(() => {
    if (!hasRequiredFabricAssignment) {
      bulkChoiceAnsweredRef.current = false;
    }
  }, [hasRequiredFabricAssignment]);
  useEffect(() => {
    const pendingAnnouncement = pendingAssignmentAnnouncementRef.current;
    if (!pendingAnnouncement) return;
    settleBulkChoiceFromCommittedState(
      fabricAllocationState,
      pendingAnnouncement,
      { clearOnMiss: false },
    );
  }, [assignmentByGarmentKey, fabricAllocationState, garmentTypeSelection]);
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
    completion.isComplete && !isCatalogueOpen && !bulkChoicePrompt;

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

  const closeBulkChoicePrompt = (answered: boolean) => {
    if (answered) {
      bulkChoiceAnsweredRef.current = true;
    }
    setBulkChoicePrompt(null);
    setBulkChoiceSelectedKeys([]);
    setBulkChoiceStatusMessage("");
  };

  const restoreBulkChoiceFocus = () => {
    const trigger = bulkChoiceTriggerRef.current;
    bulkChoiceTriggerRef.current = null;
    if (trigger && focusElementSafely(trigger)) return;
    const sourceKey = bulkChoicePrompt?.sourceGarmentKey;
    if (sourceKey) {
      const garmentAction = garmentActionRefs.current.get(sourceKey);
      if (garmentAction && focusElementSafely(garmentAction)) return;
    }
    focusElementSafely(catalogueSectionRef.current);
  };

  const dismissBulkChoiceIndividually = () => {
    closeBulkChoicePrompt(true);
    restoreBulkChoiceFocus();
  };

  const applyBulkChoiceToGarments = (garmentKeys: string[]) => {
    if (!bulkChoicePrompt) return;
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    const fabricName = bulkChoicePrompt.fabricName;
    const result = onAssignSameFabricProduct(
      bulkChoicePrompt.fabricCode,
      garmentKeys,
    );
    if (!result || result.status === "blocked") {
      const failedKey =
        result && result.status === "blocked" ? result.failedGarmentKey : undefined;
      const failedTarget = failedKey
        ? targets.find(({ assignment }) => assignment.garmentKey === failedKey)
        : null;
      const failedLabel = failedTarget
        ? getFutureGarmentLabel(failedTarget.assignment.garmentType)
        : "one of the selected garments";
      const message = `Could not assign ${fabricName} to ${failedLabel}. No garments were changed.`;
      setBulkChoiceStatusMessage(message);
      setAssignmentAnnouncement(message);
      return;
    }
    closeBulkChoicePrompt(true);
    restoreBulkChoiceFocus();
    const labels = result.assignedGarmentKeys
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

  useEffect(() => {
    if (!bulkChoicePrompt) return;
    const dialog = bulkChoiceDialogRef.current;
    if (!dialog) return;
    const getFocusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
    getFocusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissBulkChoiceIndividually();
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
  }, [bulkChoicePrompt]);

  const assignSelectedFabric = (fabric: Fabric, garmentKey: string) => {
    const assignmentGeneration = ++assignmentGenerationRef.current;
    const step1Targets = getFutureFabricStep1AssignmentTargets(
      garmentTypeSelection,
    );
    const wasEligibleFirstStep1Assignment =
      !bulkChoiceAnsweredRef.current &&
      step1Targets.length > 1 &&
      !step1Targets.some(({ assignment }) =>
        assignmentByGarmentKey.has(assignment.garmentKey),
      );
    pendingAssignmentAnnouncementRef.current = {
      fabricCode: fabric.code,
      fabricName: fabric.name,
      targetGarmentKey: garmentKey,
      assignmentGeneration,
      wasEligibleFirstStep1Assignment,
    };
    setVisibleActionError(null);
    setAssignmentAnnouncement("");
    bulkChoiceTriggerRef.current =
      garmentActionRefs.current.get(garmentKey) || catalogueTriggerRef.current;
    const nextState = onAssignFabricToGarment(fabric, garmentKey);
    const intent = pendingAssignmentAnnouncementRef.current;
    const openedBulkChoice =
      nextState && intent && Array.isArray(nextState.fabricAllocations)
        ? settleBulkChoiceFromCommittedState(nextState, intent, {
            clearOnMiss: true,
          })
        : false;
    if (openedBulkChoice) {
      catalogueFocusRequestRef.current += 1;
      catalogueTriggerRef.current = null;
      catalogueFocusGarmentKeyRef.current = null;
      setIsCatalogueOpen(false);
      setCatalogueTargetGarmentKey(null);
      return;
    }
    completeCatalogueAssignment(garmentKey);
  };

  const handleFabricSelection = (fabric: Fabric) => {
    setVisibleActionError(null);
    const pendingAssignment =
      fabricAllocationState.awaitingFabricForPendingGarment
        ? fabricAllocationState.pendingFabricGarment
        : null;
    const targetGarmentKey =
      (catalogueTargetGarmentKey && activeCatalogueTarget
        ? activeCatalogueTarget.assignment.garmentKey
        : null) ||
      pendingAssignment?.garmentKey ||
      unassignedTargets[0]?.assignment.garmentKey ||
      null;
    if (!targetGarmentKey) {
      setAssignmentAnnouncement("All selected garments already have fabric assignments.");
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
    setBulkChoicePrompt(null);
    setBulkChoiceSelectedKeys([]);
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
    const availabilityMessage = getFabricAvailabilityMessage(fabric);
    const pendingTargetAssignment =
      fabricAllocationState.awaitingFabricForPendingGarment
        ? fabricAllocationState.pendingFabricGarment
        : null;
    const currentTarget =
      activeCatalogueTarget ||
      (pendingTargetAssignment
        ? { assignment: pendingTargetAssignment }
        : null) ||
      unassignedTargets[0] ||
      null;
    const cardPresentation = resolveFutureFabricCatalogueCardPresentation({
      fabricCode: fabric.code,
      garmentTypeSelection,
      fabricAllocationState,
      currentTargetGarmentKey: currentTarget?.assignment.garmentKey ?? null,
    });
    const cardStatus = cardPresentation.status;
    const isCancelAction =
      !availabilityMessage && cardPresentation.action === "cancel";
    const cancelAssignment = cardPresentation.cancelGarmentKey
      ? assignmentByGarmentKey.get(cardPresentation.cancelGarmentKey)
          ?.assignment ||
        (pendingTargetAssignment?.garmentKey ===
        cardPresentation.cancelGarmentKey
          ? pendingTargetAssignment
          : null)
      : null;
    const cancelGarmentLabel = cancelAssignment
      ? getFutureGarmentLabel(cancelAssignment.garmentType)
      : "";
    const cancelAccessibleName = cancelGarmentLabel
      ? `Cancel ${fabric.name} fabric assignment for ${cancelGarmentLabel}`
      : `Cancel ${fabric.name} fabric assignment`;
    const stockPresentation = getFabricStockPresentation(fabric);
    const stockBadgeId = `future-fabric-stock-${fabric.code}`;
    const stockBadgeClassName =
      stockPresentation.visible && stockPresentation.tone === "low_stock"
        ? "border-amber-200 bg-amber-700 text-white"
        : stockPresentation.visible && stockPresentation.tone === "out_of_stock"
          ? "border-red-200 bg-red-700 text-white"
          : "border-heritage-gold/30 bg-heritage-green text-white";
    return (
      <article
        key={fabric.code}
        className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-heritage-cream/40">
          {fabric.image ? (
            <img
              src={fabric.image}
              alt={`${fabric.name} fabric swatch`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ backgroundColor: fabric.colorHex }}
              aria-label={`${fabric.color} fabric color`}
            />
          )}
          {stockPresentation.visible && (
            <span
              id={stockBadgeId}
              data-fabric-stock-badge="true"
              data-fabric-stock-code={fabric.code}
              data-fabric-stock-status={stockPresentation.status}
              data-fabric-stock-label={stockPresentation.label}
              className={`pointer-events-none absolute top-2 right-2 z-10 max-w-[calc(100%-1rem)] rounded-full border px-2 py-1 text-[10px] font-bold leading-tight shadow-sm ${stockBadgeClassName}`}
            >
              {stockPresentation.label}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <h3 className="break-words font-serif text-base font-bold text-heritage-green">
            {fabric.name}
          </h3>
          <p className="mt-1 break-words font-mono text-[10px] text-heritage-ink/55">
            {fabric.code}
          </p>
          {availabilityMessage && (
            <p className="mt-2 text-xs font-semibold text-red-700">
              {availabilityMessage}
            </p>
          )}
          <button
            type="button"
            disabled={Boolean(availabilityMessage)}
            onClick={() => {
              if (isCancelAction && cardPresentation.cancelGarmentKey) {
                removeAssignedFabric(
                  cardPresentation.cancelGarmentKey,
                  cancelGarmentLabel || "the selected garment",
                  fabric.name,
                );
                return;
              }
              handleFabricSelection(fabric);
            }}
            data-fabric-card="true"
            data-fabric-code={fabric.code}
            data-fabric-status={cardStatus}
            data-fabric-action={cardPresentation.action}
            data-fabric-idle-label={isCancelAction ? "IN USE" : undefined}
            data-fabric-active-label={isCancelAction ? "CANCEL" : undefined}
            data-fabric-cancel-garment-key={
              cardPresentation.cancelGarmentKey ?? undefined
            }
            aria-label={
              isCancelAction
                ? cancelAccessibleName
                : `${cardStatus} ${fabric.name}${
                    currentTarget
                      ? ` for ${getFutureGarmentLabel(currentTarget.assignment.garmentType)}`
                      : ""
                  }`
            }
            aria-describedby={`future-fabric-catalogue-help future-fabric-assignment-status ${stockBadgeId}`}
            className={`group mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              isCancelAction
                ? "bg-heritage-green text-white hover:bg-red-700 hover:text-white focus-visible:bg-red-700"
                : "bg-heritage-green text-white hover:bg-heritage-forest"
            }`}
          >
            {availabilityMessage ? (
              "Unavailable"
            ) : isCancelAction ? (
              <span className="grid w-full place-items-center">
                <span className="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">
                  IN USE
                </span>
                <span className="col-start-1 row-start-1 invisible text-white group-hover:visible group-focus-visible:visible">
                  CANCEL
                </span>
              </span>
            ) : (
              <>
                {cardStatus === "SELECT" && (
                  <Check aria-hidden="true" size={14} />
                )}
                {cardStatus}
              </>
            )}
          </button>
        </div>
      </article>
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
                <div className="min-w-0">
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
              {activeCatalogueTarget
                ? `Select a fabric card to assign it to ${getFutureGarmentLabel(
                    activeCatalogueTarget.assignment.garmentType,
                  )}.`
                : unassignedTargets[0]
                  ? `Select a fabric card to assign it to the next garment: ${getFutureGarmentLabel(
                      unassignedTargets[0].assignment.garmentType,
                    )}.`
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

      {bulkChoicePrompt && (
          <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
            <div
              ref={bulkChoiceDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="future-fabric-bulk-choice-title"
              data-testid="future-fabric-bulk-choice"
              data-bulk-choice-phase={bulkChoicePrompt.phase}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-heritage-gold/40 bg-white p-5 shadow-xl sm:p-6"
            >
              {bulkChoiceStatusMessage ? (
                <p
                  role="alert"
                  data-testid="future-fabric-bulk-choice-status"
                  className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
                >
                  {bulkChoiceStatusMessage}
                </p>
              ) : null}
              {bulkChoicePrompt.phase === "ask" ? (
                <>
                  <h3
                    id="future-fabric-bulk-choice-title"
                    className="font-serif text-xl font-bold text-heritage-green"
                  >
                    Use this fabric for your other garments?
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-heritage-ink/70">
                    You selected {bulkChoicePrompt.fabricName}. Would you like
                    to use this same fabric for all remaining garments?
                  </p>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      ref={registerBulkChoiceControl}
                      data-bulk-choice-control="true"
                      onClick={() =>
                        applyBulkChoiceToGarments(
                          bulkChoiceCandidates.map(
                            ({ assignment }) => assignment.garmentKey,
                          ),
                        )
                      }
                      className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      YES — Use for All
                    </button>
                    <button
                      type="button"
                      ref={registerBulkChoiceControl}
                      data-bulk-choice-control="true"
                      onClick={() => {
                        setBulkChoiceSelectedKeys([]);
                        setBulkChoicePrompt((current) =>
                          current ? { ...current, phase: "choose" } : current,
                        );
                      }}
                      className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      NO — Choose Garments
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3
                    id="future-fabric-bulk-choice-title"
                    className="font-serif text-xl font-bold text-heritage-green"
                  >
                    Which other garments should use this fabric?
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-heritage-ink/70">
                    Select one or more remaining garments to use{" "}
                    {bulkChoicePrompt.fabricName}.
                  </p>
                  <fieldset className="mt-4 space-y-2">
                    <legend className="sr-only">
                      Remaining garments for {bulkChoicePrompt.fabricName}
                    </legend>
                    {bulkChoiceCandidates.map(({ assignment }) => {
                      const garmentLabel = getFutureGarmentLabel(
                        assignment.garmentType,
                      );
                      const checkboxId = `future-fabric-bulk-${assignment.garmentKey}`;
                      return (
                        <label
                          key={assignment.garmentKey}
                          htmlFor={checkboxId}
                          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-heritage-gold/25 bg-heritage-cream/25 px-3 py-2 text-sm font-semibold text-heritage-green"
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            ref={registerBulkChoiceControl}
                            data-bulk-choice-control="true"
                            checked={bulkChoiceSelectedKeys.includes(
                              assignment.garmentKey,
                            )}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              setBulkChoiceSelectedKeys((current) =>
                                checked
                                  ? [...current, assignment.garmentKey]
                                  : current.filter(
                                      (key) => key !== assignment.garmentKey,
                                    ),
                              );
                            }}
                            className="h-4 w-4 accent-heritage-green"
                          />
                          {garmentLabel}
                        </label>
                      );
                    })}
                  </fieldset>
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      ref={registerBulkChoiceControl}
                      data-bulk-choice-control="true"
                      disabled={bulkChoiceSelectedKeys.length === 0}
                      onClick={() =>
                        applyBulkChoiceToGarments(bulkChoiceSelectedKeys)
                      }
                      className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Apply Fabric to Selected
                    </button>
                    <button
                      type="button"
                      ref={registerBulkChoiceControl}
                      data-bulk-choice-control="true"
                      onClick={dismissBulkChoiceIndividually}
                      className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      Choose Fabrics Individually
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
      )}

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
