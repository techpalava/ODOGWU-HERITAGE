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
  onUseSameFabricForGarment: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onCancelPendingFabric: () => void;
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

export const DormantFutureFabricStep = ({
  fabrics,
  garmentTypeSelection,
  fabricAllocationState,
  completion,
  requiredFabricQuantity,
  selectedFabricQuantity,
  constructionPrice,
  onAssignFabricToGarment,
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
  const [selectedCatalogueFabric, setSelectedCatalogueFabric] =
    useState<Fabric | null>(null);
  const [dismissedCapacityOffer, setDismissedCapacityOffer] = useState<
    string | null
  >(null);
  const catalogueDialogRef = useRef<HTMLDivElement>(null);
  const catalogueTriggerRef = useRef<HTMLElement | null>(null);

  const visibleFabrics = fabrics.filter(
    (fabric) => fabric.stockStatus !== "HIDDEN",
  );
  const pricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  const targets = getFutureFabricAssignmentTargets(garmentTypeSelection);
  const unassignedTargets = getFutureUnassignedFabricTargets({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const capacityOffer = getFutureFabricCapacityOffer({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const capacityOfferKey = capacityOffer
    ? `${capacityOffer.allocationId}:${capacityOffer.target.assignment.garmentKey}`
    : null;
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
  const uniqueBlockers = Array.from(
    new Set(
      completion.blockers.map((blocker) => blockerMessages[blocker.code]),
    ),
  );

  const closeCatalogue = () => {
    setIsCatalogueOpen(false);
    setCatalogueTargetGarmentKey(null);
    setSelectedCatalogueFabric(null);
    window.requestAnimationFrame(() => catalogueTriggerRef.current?.focus());
  };

  const openCatalogue = (
    trigger: HTMLElement,
    garmentKey: string | null = null,
  ) => {
    catalogueTriggerRef.current = trigger;
    setCatalogueTargetGarmentKey(garmentKey);
    setSelectedCatalogueFabric(null);
    setIsCatalogueOpen(true);
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
        closeCatalogue();
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
    onAssignFabricToGarment(fabric, garmentKey);
    closeCatalogue();
  };

  const handleFabricSelection = (fabric: Fabric) => {
    if (catalogueTargetGarmentKey) {
      assignSelectedFabric(fabric, catalogueTargetGarmentKey);
      return;
    }
    setSelectedCatalogueFabric(fabric);
  };

  return (
    <section
      aria-labelledby="future-fabric-step-title"
      className="space-y-6 font-sans"
      data-stage-id="fabric"
      data-stage-complete={completion.isComplete}
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
                  <p className="break-words text-sm font-bold text-heritage-green">
                    {garmentLabel}
                  </p>
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

        {unassignedTargets.length > 0 && (
          <button
            type="button"
            onClick={(event) => openCatalogue(event.currentTarget)}
            disabled={Boolean(fabricAllocationState.pendingFabricGarment)}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            Select Fabric
          </button>
        )}
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
                onClick={onUseSameFabric}
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
        {pricing.status === "resolved" && (
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
            {pricing.allocationLines.map((line, index) => (
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
        )}
      </aside>

      {capacityOffer && dismissedCapacityOffer !== capacityOfferKey && (
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
              onClick={() => setDismissedCapacityOffer(capacityOfferKey)}
              aria-label="Dismiss fabric capacity suggestion"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() =>
                onUseSameFabricForGarment(
                  capacityOffer.target.assignment.garmentKey,
                )
              }
              className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Use Same Fabric
            </button>
            <button
              type="button"
              onClick={(event) =>
                openCatalogue(
                  event.currentTarget,
                  capacityOffer.target.assignment.garmentKey,
                )
              }
              className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Select Different Fabric
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DesignStudioBackButton destination="Garment Type" onClick={onBack} />
        <button
          type="button"
          onClick={onContinue}
          disabled={!completion.isComplete}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue to Design Style
        </button>
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
                  {selectedCatalogueFabric ? "For which garment?" : "Select a fabric"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeCatalogue}
                aria-label="Close fabric catalogue"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-heritage-green/25 px-3 text-xs font-bold uppercase text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" size={17} />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            {selectedCatalogueFabric ? (
              <div className="py-6">
                <p className="max-w-2xl break-words text-sm text-heritage-ink/70">
                  Assign {selectedCatalogueFabric.name} ({selectedCatalogueFabric.code})
                  to one of the garments still waiting for fabric.
                </p>
                <div
                  role="group"
                  aria-label="For which garment?"
                  className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {unassignedTargets.map(({ assignment }) => {
                    const label = getFutureGarmentLabel(assignment.garmentType);
                    return (
                      <button
                        key={assignment.garmentKey}
                        type="button"
                        onClick={() =>
                          assignSelectedFabric(
                            selectedCatalogueFabric,
                            assignment.garmentKey,
                          )
                        }
                        className="min-h-11 min-w-0 rounded-xl border-2 border-heritage-green/20 bg-white p-4 text-left text-sm font-bold text-heritage-green transition hover:border-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                      >
                        <span className="break-words">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCatalogueFabric(null)}
                  className="mt-5 min-h-11 rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
                >
                  Choose a different fabric
                </button>
              </div>
            ) : (
              <div className="grid min-w-0 grid-cols-1 gap-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleFabrics.map((fabric) => {
                  const availabilityMessage = getFabricAvailabilityMessage(fabric);
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
                          disabled={Boolean(availabilityMessage)}
                          onClick={() => handleFabricSelection(fabric)}
                          className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {!availabilityMessage && <Check aria-hidden="true" size={14} />}
                          {availabilityMessage ? "Unavailable" : "Select"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          </div>,
          document.body,
        )}
    </section>
  );
};
