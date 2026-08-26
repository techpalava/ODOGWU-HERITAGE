import { useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "../types";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  resolveFutureFabricCatalogueCardPresentation,
} from "../utils/designStudioFutureFabricStage";
import type { AdditionalGarmentFabricTransaction } from "../utils/additionalGarmentFabricPicker";
import {
  resolveCurrentCatalogueFabricForAssignment,
} from "../utils/additionalGarmentFabricPicker";
import { FutureFabricCatalogueCard } from "./FutureFabricCatalogueCard";
import { AssignedFabricPreview } from "./AssignedFabricPreview";

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
  activeFabric,
  activeFabricSelectionIndex,
  activeFabricResolution,
  activeFabricCode = null,
  errorMessage,
  onUseSameFabric,
  onChooseAnotherFabric,
  onBackToChoice,
  onSelectFabric,
  onCancel,
}: {
  transaction: AdditionalGarmentFabricTransaction;
  fabrics: readonly Fabric[];
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricAllocationState: FabricAllocationState;
  activeFabric: Fabric | null;
  activeFabricSelectionIndex: number | null;
  activeFabricResolution: ReturnType<
    typeof resolveCurrentCatalogueFabricForAssignment
  >;
  activeFabricCode?: string | null;
  errorMessage: string | null;
  onUseSameFabric: () => void;
  onChooseAnotherFabric: () => void;
  onBackToChoice: () => void;
  onSelectFabric: (fabricCode: string) => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const garmentLabel = getFabricGarmentLabel(transaction.garmentType);
  const visibleFabrics = useMemo(
    () => fabrics.filter((fabric) => fabric.stockStatus !== "HIDDEN"),
    [fabrics],
  );
  const liveResolution = resolveCurrentCatalogueFabricForAssignment({
    fabrics,
    fabricCode:
      activeFabricCode ||
      (activeFabricResolution.status === "resolved"
        ? activeFabricResolution.fabric.code
        : activeFabric?.code || ""),
  });
  const sameFabricAvailable = liveResolution.status === "resolved";
  const sameFabricUnavailableReason =
    liveResolution.status === "blocked"
      ? liveResolution.reason
      : "No active fabric is available to reuse.";
  const previewFabric =
    liveResolution.status === "resolved"
      ? liveResolution.fabric
      : activeFabric;
  const hasActiveFabricContext = Boolean(
    activeFabricCode || previewFabric || activeFabric,
  );
  const canOfferSameFabricChoice =
    transaction.origin === "new_addition" && hasActiveFabricContext;
  const isFinishing =
    transaction.phase === "assigning" ||
    transaction.phase === "awaiting_commit";
  const showChoicePhase =
    transaction.phase === "choice" &&
    canOfferSameFabricChoice &&
    !isFinishing;

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
  }, [transaction.phase, showChoicePhase, isFinishing]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isFinishing) return;
        if (transaction.phase === "catalogue" && canOfferSameFabricChoice) {
          onBackToChoice();
          return;
        }
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
  }, [
    canOfferSameFabricChoice,
    isFinishing,
    onBackToChoice,
    onCancel,
    transaction.phase,
  ]);

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-heritage-ink/45 p-0 sm:items-center sm:p-4"
      data-additional-garment-fabric-dialog="true"
      data-dialog-phase={
        isFinishing
          ? transaction.phase
          : showChoicePhase
            ? "choice"
            : "catalogue"
      }
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
                : showChoicePhase
                  ? `Choose fabric for ${garmentLabel}`
                  : `Choose another fabric for ${garmentLabel}`}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {isFinishing
                ? "Finishing garment setup…"
                : showChoicePhase
                  ? `You’re adding ${garmentLabel}. Use the same fabric again or choose another fabric.`
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
          ) : showChoicePhase ? (
            <div className="space-y-4">
              {previewFabric ? (
                <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 p-3 sm:flex-row sm:items-center">
                  <AssignedFabricPreview
                    fabric={previewFabric}
                    garmentKey={transaction.garmentKey}
                    garmentLabel={garmentLabel}
                    fabricCode={previewFabric.code}
                  />
                  <div className="min-w-0">
                    <p className="font-serif text-base font-bold text-heritage-green">
                      {previewFabric.name}
                    </p>
                    <p className="mt-1 font-mono text-xs text-heritage-ink/60">
                      {previewFabric.code}
                    </p>
                    {activeFabricSelectionIndex !== null && (
                      <p className="mt-1 text-xs font-semibold text-heritage-gold">
                        Fabric Selection {activeFabricSelectionIndex}
                      </p>
                    )}
                  </div>
                </div>
              ) : activeFabricCode ? (
                <div className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 p-3">
                  <p className="font-mono text-xs text-heritage-ink/60">
                    {activeFabricCode}
                  </p>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  ref={initialFocusRef}
                  type="button"
                  onClick={onUseSameFabric}
                  data-fabric-dialog-action="use-same"
                  disabled={!sameFabricAvailable}
                  aria-disabled={!sameFabricAvailable}
                  title={
                    sameFabricAvailable
                      ? undefined
                      : sameFabricUnavailableReason || undefined
                  }
                  className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Use Same Fabric Again
                </button>
                <button
                  type="button"
                  onClick={onChooseAnotherFabric}
                  data-fabric-dialog-action="choose-another"
                  className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                >
                  Choose Another Fabric
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  data-fabric-dialog-action="cancel"
                  className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold uppercase tracking-wider text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  {transaction.origin === "change_existing"
                    ? "Keep Current Fabric"
                    : "Cancel Adding Garment"}
                </button>
              </div>
              {!sameFabricAvailable && sameFabricUnavailableReason && (
                <p
                  role="status"
                  data-same-fabric-unavailable-reason="true"
                  className="text-sm font-semibold text-red-700"
                >
                  {sameFabricUnavailableReason}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p id={helpId} className="sr-only">
                Choose a fabric card to assign it to {garmentLabel}.
              </p>
              {!sameFabricAvailable &&
                transaction.origin === "new_addition" &&
                hasActiveFabricContext && (
                  <p
                    role="status"
                    data-same-fabric-unavailable-reason="true"
                    className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm font-semibold text-amber-900"
                  >
                    {sameFabricUnavailableReason} Choose another fabric below.
                  </p>
                )}
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleFabrics.map((fabric) => {
                  const presentation = resolveFutureFabricCatalogueCardPresentation({
                    fabricCode: fabric.code,
                    garmentTypeSelection,
                    fabricAllocationState,
                    currentTargetGarmentKey: transaction.garmentKey,
                  });
                  return (
                    <FutureFabricCatalogueCard
                      key={fabric.code}
                      fabric={fabric}
                      presentation={{
                        ...presentation,
                        action: "select",
                        cancelGarmentKey: null,
                      }}
                      targetGarmentLabel={garmentLabel}
                      stockBadgeIdPrefix="step4-fabric-stock"
                      describedBy={helpId}
                      onAction={() => onSelectFabric(fabric.code)}
                    />
                  );
                })}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                {canOfferSameFabricChoice && sameFabricAvailable && (
                  <button
                    ref={initialFocusRef}
                    type="button"
                    onClick={onBackToChoice}
                    data-fabric-dialog-action="back-to-choice"
                    className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                  >
                    Back to Fabric Choice
                  </button>
                )}
                <button
                  ref={
                    canOfferSameFabricChoice && sameFabricAvailable
                      ? undefined
                      : initialFocusRef
                  }
                  type="button"
                  onClick={onCancel}
                  data-fabric-dialog-action="cancel"
                  className="min-h-11 rounded-xl border border-red-200 px-4 text-xs font-bold uppercase tracking-wider text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  {transaction.origin === "change_existing"
                    ? "Keep Current Fabric"
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
