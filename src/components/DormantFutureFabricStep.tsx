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
import {
  getFutureFabricAssignmentTargets,
  getFutureFabricCapacityOffer,
  getFutureUnassignedFabricTargets,
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
  onAssignFabricToGarment: (fabric: Fabric, garmentKey: string) => void;
  onRemoveFabricFromGarment: (garmentKey: string) => void;
  onUseSameFabricForGarment: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
}

interface FabricCapacityOfferSnapshot {
  allocationId: string;
  fabricCode: string;
  targetGarmentKey: string;
  assignmentGeneration: number;
}

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
  onBack,
  onContinue,
  onUseSameFabric,
  onChooseAnotherFabric,
  onCancelPendingFabric,
}: DormantFutureFabricStepProps) => {
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);
  const [catalogueTargetGarmentKey, setCatalogueTargetGarmentKey] = useState<
    string | null
  >(null);
  const [assignmentAnnouncement, setAssignmentAnnouncement] = useState("");
  const [capacityOfferSnapshot, setCapacityOfferSnapshot] =
    useState<FabricCapacityOfferSnapshot | null>(null);
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
  const pendingAssignmentAnnouncementRef = useRef<{
    fabricCode: string;
    fabricName: string;
    targetGarmentKey: string;
    assignmentGeneration: number;
    before: Map<string, string>;
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
  const currentCapacityOffer = capacityOfferSnapshot
    ? getFutureFabricCapacityOffer({
        garmentTypeSelection,
        fabricAllocationState,
      })
    : null;
  const capacityOffer =
    capacityOfferSnapshot &&
    capacityOfferSnapshot.assignmentGeneration ===
      assignmentGenerationRef.current &&
    currentCapacityOffer?.allocationId === capacityOfferSnapshot.allocationId &&
    currentCapacityOffer.fabricCode === capacityOfferSnapshot.fabricCode &&
    currentCapacityOffer.target.assignment.garmentKey ===
      capacityOfferSnapshot.targetGarmentKey
      ? currentCapacityOffer
      : null;
  const capacityOfferFabric = capacityOffer
    ? fabrics.find((fabric) => fabric.code === capacityOffer.fabricCode)
    : null;
  const capacityOfferIsValid = Boolean(
    capacityOfferFabric && !getFabricAvailabilityMessage(capacityOfferFabric),
  );
  useEffect(() => {
    if (
      capacityOfferSnapshot &&
      (!capacityOffer || !capacityOfferIsValid)
    ) {
      setCapacityOfferSnapshot(null);
    }
  }, [capacityOffer, capacityOfferIsValid, capacityOfferSnapshot]);
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
  useEffect(() => {
    const pendingAnnouncement = pendingAssignmentAnnouncementRef.current;
    if (!pendingAnnouncement) return;
    if (
      pendingAnnouncement.assignmentGeneration !==
      assignmentGenerationRef.current
    ) {
      pendingAssignmentAnnouncementRef.current = null;
      return;
    }

    const changedTargets = targets
      .filter(({ assignment }) => {
        const previousFabricCode = pendingAnnouncement.before.get(
          assignment.garmentKey,
        );
        const nextAssignment = assignmentByGarmentKey.get(assignment.garmentKey);
        return (
          nextAssignment?.allocation.fabricCode === pendingAnnouncement.fabricCode &&
          previousFabricCode !== pendingAnnouncement.fabricCode
        );
      });

    if (
      !changedTargets.some(
        ({ assignment }) =>
          assignment.garmentKey === pendingAnnouncement.targetGarmentKey,
      )
    ) {
      return;
    }

    const changedGarmentLabels = changedTargets.map(({ assignment }) =>
      getFutureGarmentLabel(assignment.garmentType),
    );

    if (changedGarmentLabels.length === 0) return;

    setAssignmentAnnouncement(
      `${pendingAnnouncement.fabricName} assigned to ${formatGarmentList(
        changedGarmentLabels,
      )}.`,
    );
    const assignedTarget = assignmentByGarmentKey.get(
      pendingAnnouncement.targetGarmentKey,
    );
    const nextCapacityOffer = getFutureFabricCapacityOffer({
      garmentTypeSelection,
      fabricAllocationState,
    });
    setCapacityOfferSnapshot(
      nextCapacityOffer &&
        assignedTarget?.allocation.allocationId ===
          nextCapacityOffer.allocationId &&
        nextCapacityOffer.fabricCode === pendingAnnouncement.fabricCode
        ? {
            allocationId: nextCapacityOffer.allocationId,
            fabricCode: nextCapacityOffer.fabricCode,
            targetGarmentKey:
              nextCapacityOffer.target.assignment.garmentKey,
            assignmentGeneration: pendingAnnouncement.assignmentGeneration,
          }
        : null,
    );
    pendingAssignmentAnnouncementRef.current = null;
  }, [
    assignmentByGarmentKey,
    fabricAllocationState,
    garmentTypeSelection,
    targets,
  ]);
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
  const shouldDockContinueAction = completion.isComplete && !isCatalogueOpen;

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

  const openCatalogue = (
    trigger: HTMLElement,
    garmentKey: string | null = null,
    openDialog = false,
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    setCapacityOfferSnapshot(null);
    postAssignmentFocusRequestRef.current += 1;
    catalogueTriggerRef.current = trigger;
    catalogueFocusGarmentKeyRef.current = garmentKey;
    catalogueFocusRequestRef.current += 1;
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
    setCapacityOfferSnapshot(null);
    pendingAssignmentAnnouncementRef.current = {
      fabricCode: fabric.code,
      fabricName: fabric.name,
      targetGarmentKey: garmentKey,
      assignmentGeneration,
      before: new Map(
        Array.from(assignmentByGarmentKey.entries()).map(
          ([assignmentKey, { allocation }]) => [
            assignmentKey,
            allocation.fabricCode,
          ],
        ),
      ),
    };
    setAssignmentAnnouncement("");
    onAssignFabricToGarment(fabric, garmentKey);
    completeCatalogueAssignment(garmentKey);
  };

  const handleFabricSelection = (fabric: Fabric) => {
    const target = catalogueTargetGarmentKey
      ? activeCatalogueTarget
      : unassignedTargets[0] ?? null;
    if (!target) {
      setAssignmentAnnouncement("All selected garments already have fabric assignments.");
      return;
    }
    assignSelectedFabric(fabric, target.assignment.garmentKey);
  };

  const removeAssignedFabric = (
    garmentKey: string,
    garmentLabel: string,
    fabricName: string,
  ) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    setCapacityOfferSnapshot(null);
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    catalogueFocusRequestRef.current += 1;
    catalogueTriggerRef.current = null;
    catalogueFocusGarmentKeyRef.current = null;
    const request = ++removalRequestRef.current;
    removalVerificationRequestRef.current = null;
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
    onRemoveFabricFromGarment(garmentKey);
  };

  const handleUseSameFabricForGarment = (garmentKey: string) => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    setCapacityOfferSnapshot(null);
    onUseSameFabricForGarment(garmentKey);
  };

  const handleUseSameFabricAgain = () => {
    assignmentGenerationRef.current += 1;
    pendingAssignmentAnnouncementRef.current = null;
    setCapacityOfferSnapshot(null);
    onUseSameFabric();
  };

  const renderCatalogueCard = (fabric: Fabric) => {
    const availabilityMessage = getFabricAvailabilityMessage(fabric);
    const currentTarget =
      activeCatalogueTarget || unassignedTargets[0] || null;
    const assignedToCurrentTarget = Boolean(
      currentTarget &&
        fabricAllocationState.fabricAllocations.some(
          (allocation) =>
            allocation.fabricCode === fabric.code &&
            allocation.garmentAssignments.some(
              (assignment) =>
                assignment.garmentKey === currentTarget.assignment.garmentKey,
            ),
        ),
    );
    const assignedElsewhere = fabricAllocationState.fabricAllocations.some(
      (allocation) =>
        allocation.fabricCode === fabric.code &&
        allocation.garmentAssignments.length > 0,
    );
    const cardStatus = assignedToCurrentTarget
      ? "ASSIGNED"
      : assignedElsewhere
        ? "IN USE"
        : "SELECT";
    return (
      <article
        key={fabric.code}
        className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm"
      >
        <div className="aspect-[4/3] overflow-hidden bg-heritage-cream/40">
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
            disabled={
              Boolean(availabilityMessage) ||
              cardStatus === "ASSIGNED" ||
              Boolean(
                fabricAllocationState.pendingFabricGarment &&
                  !fabricAllocationState.awaitingFabricForPendingGarment,
              )
            }
            onClick={() => handleFabricSelection(fabric)}
            data-fabric-card="true"
            data-fabric-code={fabric.code}
            data-fabric-status={cardStatus}
            aria-label={`${cardStatus} ${fabric.name}${
              currentTarget
                ? ` for ${getFutureGarmentLabel(currentTarget.assignment.garmentType)}`
                : ""
            }`}
            aria-describedby="future-fabric-catalogue-help future-fabric-assignment-status"
            className={`mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
              "bg-heritage-green text-white hover:bg-heritage-forest"
            }`}
          >
            {!availabilityMessage && cardStatus === "SELECT" && (
              <Check aria-hidden="true" size={14} />
            )}
            {availabilityMessage ? "Unavailable" : cardStatus}
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
          <p
            aria-live="polite"
            className="shrink-0 rounded-full border border-heritage-gold/30 bg-heritage-cream/35 px-4 py-2 text-xs font-bold text-heritage-green"
          >
            Fabrics selected: {selectedFabricQuantity} / {requiredFabricQuantity}
          </p>
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
                  onClick={(event) =>
                    openCatalogue(event.currentTarget, assignment.garmentKey)
                  }
                  disabled={Boolean(fabricAllocationState.pendingFabricGarment)}
                  aria-label={`${assigned ? "Change" : "Add"} fabric for ${garmentLabel}`}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-[10px] font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:self-start"
                >
                  {assigned ? "Change Fabric" : "Add Fabric"}
                </button>
              </article>
            );
          })}
        </div>

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
                onClick={onCancelPendingFabric}
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

      {capacityOffer &&
        capacityOfferIsValid &&
        capacityOfferSnapshot && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-40 rounded-2xl border border-heritage-gold/40 bg-white p-4 shadow-xl sm:left-auto sm:max-w-md"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif text-base font-bold text-heritage-green">
                Your fabric can carry one more garment. (Optional)
              </p>
              <p className="mt-1 text-xs text-heritage-ink/65">
                Next: {getFutureGarmentLabel(capacityOffer.target.assignment.garmentType)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCapacityOfferSnapshot(null)}
              aria-label="Dismiss fabric capacity suggestion"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                handleUseSameFabricForGarment(
                  capacityOffer.target.assignment.garmentKey,
                );
              }}
              className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Use Same Fabric
            </button>
            <button
              type="button"
              onClick={(event) => {
                assignmentGenerationRef.current += 1;
                pendingAssignmentAnnouncementRef.current = null;
                setCapacityOfferSnapshot(null);
                onChooseAnotherFabric();
                openCatalogue(
                  event.currentTarget,
                  capacityOffer.target.assignment.garmentKey,
                );
              }}
              className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Select Different Fabric
            </button>
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
