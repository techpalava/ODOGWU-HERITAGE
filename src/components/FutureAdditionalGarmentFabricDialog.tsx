import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "../types";
import type { PhysicalGarmentOccurrence } from "../utils/designSourceState";
import { getCustomDetailsGarmentLabel } from "../utils/optionalShortsPresentation";
import {
  getFutureCompatiblePartialFabricAllocations,
  resolveFutureFabricCatalogueCardPresentation,
} from "../utils/designStudioFutureFabricStage";
import {
  getFabricNewAllocationStockConstraintMessage,
  getOrderAwareFabricStockPresentation,
} from "../utils/fabricStockAvailability";
import type { AdditionalGarmentFabricTransaction } from "../utils/additionalGarmentFabricPicker";
import { getFabricAvailabilityMessage } from "../utils/fabricCatalogueAvailability";
import { FutureFabricCatalogueCard } from "./FutureFabricCatalogueCard";

type ReusableFabricAllocationOption = {
  allocationId: string;
  selectionLabel: string;
  availabilityLabel: string;
};

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true",
  );

export const FutureAdditionalGarmentFabricDialog = ({
  transaction,
  fabrics,
  garmentTypeSelection,
  fabricAllocationState,
  requiredPhysicalOccurrences,
  errorMessage,
  onSelectFabric,
  onSelectExistingAllocation,
  onCancel,
}: {
  transaction: AdditionalGarmentFabricTransaction;
  fabrics: readonly Fabric[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  errorMessage: string | null;
  onSelectFabric: (fabricCode: string) => void;
  onSelectExistingAllocation: (allocationId: string) => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const garmentLabel = getCustomDetailsGarmentLabel(transaction.garmentType);
  const { visibleFabricByCode, duplicateFabricCodes } = useMemo(() => {
    const nextVisibleFabricByCode = new Map<string, Fabric>();
    const nextDuplicateFabricCodes = new Set<string>();
    fabrics
      .filter((fabric) => fabric.stockStatus !== "HIDDEN")
      .forEach((fabric) => {
        if (nextVisibleFabricByCode.has(fabric.code)) {
          nextDuplicateFabricCodes.add(fabric.code);
          return;
        }
        nextVisibleFabricByCode.set(fabric.code, fabric);
      });
    return {
      visibleFabricByCode: nextVisibleFabricByCode,
      duplicateFabricCodes: nextDuplicateFabricCodes,
    };
  }, [fabrics]);
  const reusableAllocationOptionsByFabricCode = useMemo(() => {
    const optionsByFabricCode = new Map<
      string,
      ReusableFabricAllocationOption[]
    >();
    getFutureCompatiblePartialFabricAllocations({
      garmentTypeSelection,
      fabricAllocationState,
      garmentKey: transaction.garmentKey,
      requiredPhysicalOccurrences,
    }).forEach((allocation) => {
      const fabric = visibleFabricByCode.get(allocation.fabricCode);
      if (
        !fabric ||
        duplicateFabricCodes.has(allocation.fabricCode) ||
        getFabricAvailabilityMessage(fabric)
      ) {
        return;
      }
      const selectionIndex = fabricAllocationState.fabricAllocations.findIndex(
        (candidate) => candidate.allocationId === allocation.allocationId,
      );
      if (selectionIndex < 0) return;
      const options = optionsByFabricCode.get(allocation.fabricCode) || [];
      options.push({
        allocationId: allocation.allocationId,
        selectionLabel: `Fabric Selection ${selectionIndex + 1}`,
        availabilityLabel: `${allocation.remainingUnits}/2 Available`,
      });
      optionsByFabricCode.set(allocation.fabricCode, options);
    });
    return optionsByFabricCode;
  }, [
    duplicateFabricCodes,
    fabricAllocationState,
    garmentTypeSelection,
    requiredPhysicalOccurrences,
    transaction.garmentKey,
    visibleFabricByCode,
  ]);
  const visibleFabrics = useMemo(
    () =>
      Array.from(visibleFabricByCode.values())
        .sort((left, right) => {
          const leftReusable = reusableAllocationOptionsByFabricCode.has(left.code);
          const rightReusable = reusableAllocationOptionsByFabricCode.has(right.code);
          if (leftReusable !== rightReusable) return leftReusable ? -1 : 1;
          return left.name.localeCompare(right.name);
        }),
    [reusableAllocationOptionsByFabricCode, visibleFabricByCode],
  );
  const isFinishing =
    transaction.phase === "assigning" ||
    transaction.phase === "awaiting_commit";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (isFinishing) return;
    const node = initialFocusRef.current || dialogRef.current;
    node?.focus?.({ preventScroll: true });
  }, [transaction.phase, isFinishing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isFinishing) return;
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFinishing, onCancel]);

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-heritage-ink/45 p-0 sm:items-center sm:p-4"
      data-additional-garment-fabric-dialog="true"
      data-dialog-phase={isFinishing ? transaction.phase : "catalogue"}
      data-dialog-origin={transaction.origin}
      data-target-garment-key={transaction.garmentKey}
    >
      <div
        role="presentation"
        className="absolute inset-0"
        onClick={isFinishing ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-[81] flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl outline-none sm:max-h-[85vh] sm:rounded-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-heritage-gold/20 bg-white px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Optional Extra Garment
            </p>
            <h2
              id={titleId}
              className="mt-1 font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              {isFinishing
                ? `Finishing ${garmentLabel} setup`
                : `Choose fabric for ${garmentLabel}`}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {isFinishing
                ? "Finishing garment setup…"
                : `Select one fabric for this ${garmentLabel} only. Other garments keep their current fabric.`}
            </p>
          </div>
          {!isFinishing && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close fabric picker"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {errorMessage && (
            <div
              role="alert"
              data-additional-garment-fabric-error="true"
              className="mb-4 rounded-2xl border border-red-300/50 bg-red-50/80 p-3"
            >
              <p className="text-sm font-bold text-red-800">Fabric action blocked</p>
              <p className="mt-1 text-sm text-red-900/85">{errorMessage}</p>
            </div>
          )}

          {isFinishing ? (
            <p
              role="status"
              aria-live="polite"
              data-additional-garment-fabric-finishing="true"
              className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/40 p-4 text-sm font-semibold text-heritage-green"
            >
              Finishing garment setup…
            </p>
          ) : (
            <div className="space-y-4">
              <p id={helpId} className="sr-only">
                Choose a fabric card to assign it to {garmentLabel}.
              </p>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleFabrics.map((fabric) => {
                  const reusableAllocationOptions =
                    reusableAllocationOptionsByFabricCode.get(fabric.code);
                  const presentation = resolveFutureFabricCatalogueCardPresentation({
                    fabricCode: fabric.code,
                    garmentTypeSelection,
                    fabricAllocationState,
                    currentTargetGarmentKey: transaction.garmentKey,
                    fabrics,
                    requiredPhysicalOccurrences,
                  });
                  // A Fabric already offering "In Your Order" reuse options can
                  // still serve this garment, so it must not also claim that
                  // no stock is available.
                  const stockConstraintMessage =
                    getFabricNewAllocationStockConstraintMessage(
                      fabric,
                      fabricAllocationState,
                      Boolean(reusableAllocationOptions?.length),
                    );
                  return (
                    <FutureFabricCatalogueCard
                      key={fabric.code}
                      fabric={fabric}
                      presentation={{
                        ...presentation,
                        action: "select",
                        cancelGarmentKey: null,
                        cancelGarmentKeys: [],
                      }}
                      targetGarmentLabel={garmentLabel}
                      stockBadgeIdPrefix="step4-fabric-stock"
                      stockPresentation={getOrderAwareFabricStockPresentation(
                        fabric,
                        fabricAllocationState,
                        {
                          hasCompatibleReusableHalfCapacity:
                            Boolean(reusableAllocationOptions?.length),
                        },
                      )}
                      stockConstraintMessage={stockConstraintMessage}
                      describedBy={helpId}
                      actionLabel="Select This Fabric"
                      onAction={() => onSelectFabric(fabric.code)}
                      orderAllocationOptions={reusableAllocationOptions?.map(
                        (option) => ({
                          ...option,
                          onSelect: () => onSelectExistingAllocation(option.allocationId),
                        }),
                      )}
                    />
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  ref={initialFocusRef}
                  type="button"
                  onClick={onCancel}
                  data-fabric-dialog-action="cancel"
                  className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold uppercase tracking-wider text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  {transaction.origin === "change_existing"
                    ? "Keep Current Fabric"
                    : transaction.origin === "repair_missing"
                      ? "Cancel"
                      : "Cancel Adding Garment"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
};
