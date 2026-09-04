import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, LockKeyhole, X } from "lucide-react";
import type { StyleCategory } from "../types";
import {
  FUTURE_DESIGN_STYLE_TIER_BADGE,
  getFutureDesignStyleCompositionLabel,
  type FutureDesignStyleMatchPresentation,
  type FutureDesignStyleMatchTier,
} from "../utils/designStudioFutureDesignStyle";
import {
  designStyleStepTargetsEqual,
  type DesignStyleStepCatalogMutationRequest,
  type DesignStyleStepCatalogueEntry,
  type DesignStyleStepClearMutationRequest,
  type DesignStyleStepOccurrencePresentation,
  type DesignStyleStepRuntimeStatus,
} from "../utils/designStyleStepRuntime";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import { DesignStudioBackButton } from "./DesignStudioBackButton";

interface DormantFutureDesignStyleStepProps {
  occurrences: readonly DesignStyleStepOccurrencePresentation[];
  activeOccurrenceTarget: DesignStyleStepOccurrencePresentation["target"] | null;
  catalogueEntries: readonly DesignStyleStepCatalogueEntry[];
  clearRequest: DesignStyleStepClearMutationRequest | null;
  runtimeStatus: DesignStyleStepRuntimeStatus;
  completedCount: number;
  totalCount: number;
  exactSetComplete: boolean;
  reviewMessage: string | null;
  mutationError: string | null;
  stagePrice: number | null;
  isCatalogueLoading?: boolean;
  stylesLoadState?: "loading" | "ready" | "error";
  onSelectOccurrence: (
    target: DesignStyleStepOccurrencePresentation["target"],
  ) => void;
  onAssignCatalogueStyle: (
    request: DesignStyleStepCatalogMutationRequest,
  ) => void;
  onClearAssignment: (request: DesignStyleStepClearMutationRequest) => void;
  onBack: () => void;
  onReturnToGarmentType: () => void;
  onContinue: () => void;
}

type CatalogueBrowseFilter =
  | "all_designs"
  | "exact_match"
  | "adaptable"
  | "male"
  | "female"
  | "unisex";

const CATALOGUE_FILTERS: ReadonlyArray<{
  id: CatalogueBrowseFilter;
  label: string;
}> = [
  { id: "all_designs", label: "All Designs" },
  { id: "exact_match", label: "Best Matches" },
  { id: "adaptable", label: "Can Be Adapted" },
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "unisex", label: "Unisex / Family" },
];

const OCCURRENCE_STATUS_LABEL: Record<
  DesignStyleStepOccurrencePresentation["status"],
  string
> = {
  complete: "Complete",
  incomplete: "Incomplete",
  awaiting_validation: "Awaiting validation",
  needs_review: "Needs review",
  unavailable: "Unavailable",
  upload_pending: "Upload pending",
};

const getStyleBrowseAudience = (
  style: StyleCategory,
): "male" | "female" | "unisex" => {
  const declared = String(style.targetDemographic || style.gender || "")
    .trim()
    .toLowerCase();
  if (declared === "male") return "male";
  if (declared === "female") return "female";
  return "unisex";
};

const styleMatchesBrowseFilter = (
  style: StyleCategory,
  presentation: FutureDesignStyleMatchPresentation,
  filter: CatalogueBrowseFilter,
): boolean => {
  if (filter === "all_designs") return true;
  if (filter === "exact_match") return presentation.tier === "exact_match";
  if (filter === "adaptable") return presentation.tier === "adaptable";
  return getStyleBrowseAudience(style) === filter;
};

const tierBadgeClass = (tier: FutureDesignStyleMatchTier, selected: boolean) => {
  if (selected) {
    return "border-heritage-gold/40 bg-heritage-gold/15 text-heritage-green";
  }
  if (tier === "exact_match") {
    return "border-heritage-green/20 bg-heritage-green/5 text-heritage-green";
  }
  return "border-heritage-gold/30 bg-heritage-gold/10 text-heritage-green";
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

export const DormantFutureDesignStyleStep = ({
  occurrences,
  activeOccurrenceTarget,
  catalogueEntries,
  clearRequest,
  runtimeStatus,
  completedCount,
  totalCount,
  exactSetComplete,
  reviewMessage,
  mutationError,
  stagePrice,
  isCatalogueLoading = false,
  stylesLoadState = "ready",
  onSelectOccurrence,
  onAssignCatalogueStyle,
  onClearAssignment,
  onBack,
  onReturnToGarmentType,
  onContinue,
}: DormantFutureDesignStyleStepProps) => {
  const adaptationDialogRef = useRef<HTMLDivElement | null>(null);
  const adaptationInitialFocusRef = useRef<HTMLButtonElement | null>(null);
  const adaptationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [exploreFilter, setExploreFilter] =
    useState<CatalogueBrowseFilter>("all_designs");
  const [pendingAdaptableEntry, setPendingAdaptableEntry] =
    useState<DesignStyleStepCatalogueEntry | null>(null);
  const adaptationTitleId = useId();
  const adaptationDescriptionId = useId();
  const catalogueReady = stylesLoadState === "ready";
  const mutationsEnabled =
    catalogueReady &&
    (runtimeStatus === "ready" || runtimeStatus === "review");
  const activeOccurrenceIndex = occurrences.findIndex((occurrence) =>
    designStyleStepTargetsEqual(occurrence.target, activeOccurrenceTarget),
  );
  const activeOccurrence =
    activeOccurrenceIndex >= 0 ? occurrences[activeOccurrenceIndex] : null;
  const exactStyles = catalogueEntries.filter(
    ({ presentation }) => presentation.tier === "exact_match",
  );
  const exploredStyles = catalogueEntries.filter(({ style, presentation }) =>
    styleMatchesBrowseFilter(style, presentation, exploreFilter),
  );

  const closeAdaptationDialog = () => {
    setPendingAdaptableEntry(null);
    adaptationTriggerRef.current?.focus?.();
  };

  const confirmAdaptation = () => {
    const request = pendingAdaptableEntry?.request || null;
    setPendingAdaptableEntry(null);
    if (request) onAssignCatalogueStyle(request);
    adaptationTriggerRef.current?.focus?.();
  };

  const handleStyleAction = (
    entry: DesignStyleStepCatalogueEntry,
    trigger: HTMLButtonElement,
  ) => {
    if (!mutationsEnabled) return;
    if (entry.presentation.requiresAdaptationConfirmation && !entry.selected) {
      adaptationTriggerRef.current = trigger;
      setPendingAdaptableEntry(entry);
      return;
    }
    onAssignCatalogueStyle(entry.request);
  };

  useEffect(() => {
    if (!pendingAdaptableEntry) return;
    if (typeof document === "undefined" || !document.body?.style) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingAdaptableEntry]);

  useEffect(() => {
    if (!pendingAdaptableEntry) return;
    (adaptationInitialFocusRef.current || adaptationDialogRef.current)?.focus?.();
  }, [pendingAdaptableEntry]);

  useEffect(() => {
    if (!pendingAdaptableEntry) return;
    const dialog = adaptationDialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAdaptationDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialog);
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
  }, [pendingAdaptableEntry]);

  useEffect(() => {
    if (!pendingAdaptableEntry) return;
    const stillCurrent = catalogueEntries.some(
      (entry) =>
        entry.style.id === pendingAdaptableEntry.style.id &&
        entry.request.runtimeGeneration ===
          pendingAdaptableEntry.request.runtimeGeneration &&
        designStyleStepTargetsEqual(
          entry.request.target,
          pendingAdaptableEntry.request.target,
        ),
    );
    if (!stillCurrent) setPendingAdaptableEntry(null);
  }, [catalogueEntries, pendingAdaptableEntry]);

  const renderStyleCard = (entry: DesignStyleStepCatalogueEntry) => {
    const { style, presentation, selected } = entry;
    const originalLabel =
      presentation.originalCompositionLabel ||
      getFutureDesignStyleCompositionLabel(style);
    const actionLabel = selected
      ? "Selected"
      : presentation.tier === "adaptable"
        ? "Use This Design"
        : "Select Design";
    return (
      <article
        key={style.id}
        data-style-card="true"
        data-style-name={style.name}
        data-style-tier={presentation.tier}
        data-style-selected={selected ? "true" : "false"}
        className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 bg-white shadow-sm ${
          selected ? "border-heritage-gold" : "border-gray-200"
        }`}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-heritage-cream/35">
          {style.image ? (
            <>
              <img
                src={style.image}
                alt={`${style.name} design`}
                loading="lazy"
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.classList.add("hidden");
                  event.currentTarget.nextElementSibling?.classList.remove(
                    "hidden",
                  );
                }}
              />
              <div className="hidden h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">
                Image unavailable
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">
              Image unavailable
            </div>
          )}
          {selected && (
            <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-heritage-gold px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              <Check aria-hidden="true" size={15} strokeWidth={3} />
              Selected
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 break-words font-serif text-base font-bold text-heritage-green">
              {style.name}
            </h3>
            <span
              className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${tierBadgeClass(
                presentation.tier,
                selected,
              )}`}
            >
              {FUTURE_DESIGN_STYLE_TIER_BADGE[presentation.tier]}
            </span>
          </div>
          <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/75">
            <span className="font-semibold text-heritage-green">
              Originally shown as:
            </span>{" "}
            {originalLabel}
          </p>
          {presentation.tier === "adaptable" && (
            <p className="mt-2 text-[11px] leading-relaxed text-heritage-ink/65">
              This design can be adapted for this garment.
            </p>
          )}
          <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/65">
            {style.description}
          </p>
          <button
            type="button"
            disabled={!mutationsEnabled}
            onClick={(event) => handleStyleAction(entry, event.currentTarget)}
            aria-label={`${actionLabel} ${style.name} for ${activeOccurrence?.label || "current garment"}`}
            aria-pressed={selected}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-heritage-ink/45"
          >
            {actionLabel}
          </button>
        </div>
      </article>
    );
  };

  const showCatalogue =
    activeOccurrence &&
    runtimeStatus !== "blocked" &&
    runtimeStatus !== "hydrating" &&
    catalogueReady;

  const adaptationDialog = pendingAdaptableEntry?.adaptationCopy ? (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6"
      onClick={closeAdaptationDialog}
    >
      <div
        ref={adaptationDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={adaptationTitleId}
        aria-describedby={adaptationDescriptionId}
        tabIndex={-1}
        data-testid="adapt-design-confirmation"
        data-pending-adaptable-style={pendingAdaptableEntry.style.name}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id={adaptationTitleId}
              className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              {pendingAdaptableEntry.adaptationCopy.title}
            </h2>
            <p className="mt-2 break-words font-serif text-sm font-semibold text-heritage-green">
              {pendingAdaptableEntry.style.name} for {activeOccurrence?.label}
            </p>
            <p
              id={adaptationDescriptionId}
              className="mt-2 break-words text-sm leading-relaxed text-heritage-ink/70"
            >
              {pendingAdaptableEntry.adaptationCopy.body}
            </p>
          </div>
          <button
            ref={adaptationInitialFocusRef}
            type="button"
            onClick={closeAdaptationDialog}
            aria-label="Close adapt design confirmation"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={closeAdaptationDialog}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmAdaptation}
            data-adapt-confirm="true"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Use This Design
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section
        aria-labelledby="future-design-style-title"
        data-stage-id="design_style"
        data-stage-complete={exactSetComplete}
        className={`space-y-6 font-sans ${
          exactSetComplete ? "pb-28 sm:pb-32" : ""
        }`}
      >
        <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
          <DesignStudioBackButton
            destination="Fabric"
            onClick={onBack}
            className="mb-5"
          />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
            Step 3 of 9
          </p>
          <h2
            id="future-design-style-title"
            className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
          >
            Design Style
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
            Choose a design for each garment. Your garments and Fabric
            selections remain unchanged.
          </p>

          <div
            aria-live="polite"
            data-testid="step3-assignment-progress"
            className="mt-5 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 px-4 py-3"
          >
            <p className="font-serif text-base font-bold text-heritage-green">
              {completedCount} of {totalCount} garment
              {totalCount === 1 ? " has" : "s have"} a design
            </p>
          </div>

          {reviewMessage && (
            <div
              role="alert"
              data-testid="step3-migration-review"
              className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-bold">Review your Design Style choices</p>
              <p className="mt-1 text-xs leading-relaxed">{reviewMessage}</p>
            </div>
          )}

          {mutationError && (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
            >
              {mutationError}
            </div>
          )}

          {runtimeStatus === "hydrating" && (
            <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">
              Restoring your Design Style choices...
            </div>
          )}
          {runtimeStatus === "blocked" && (
            <div role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900">
              Your saved Design Style choices cannot be changed safely here.
              Nothing has been overwritten.
            </div>
          )}
          {(isCatalogueLoading || runtimeStatus === "loading") && (
            <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">
              Loading catalogue designs. Your saved assignments are preserved.
            </div>
          )}
          {runtimeStatus === "error" && (
            <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
              The Design Style catalogue is temporarily unavailable. Your saved
              assignments are preserved.
            </div>
          )}

          {occurrences.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
                Garments
              </p>
              <div
                role="group"
                aria-label="Garments requiring a Design Style"
                className="mt-3 flex min-w-0 flex-wrap gap-2"
              >
                {occurrences.map((occurrence) => {
                  const active = designStyleStepTargetsEqual(
                    occurrence.target,
                    activeOccurrenceTarget,
                  );
                  return (
                    <button
                      key={occurrence.target.occurrenceToken}
                      type="button"
                      aria-current={active ? "true" : undefined}
                      aria-label={`${occurrence.label}: ${OCCURRENCE_STATUS_LABEL[occurrence.status]}`}
                      onClick={() => onSelectOccurrence(occurrence.target)}
                      className={`min-h-11 min-w-0 rounded-xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                        active
                          ? "border-heritage-green bg-heritage-green text-white"
                          : "border-heritage-green/20 bg-white text-heritage-green"
                      }`}
                    >
                      <span className="block break-words text-xs font-bold">
                        {occurrence.label}
                      </span>
                      <span className={`mt-0.5 block text-[10px] ${active ? "text-white/80" : "text-heritage-ink/60"}`}>
                        {OCCURRENCE_STATUS_LABEL[occurrence.status]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeOccurrence && (
            <section
              aria-labelledby="step3-active-garment-title"
              className="mt-6 min-w-0 rounded-2xl border border-heritage-green/15 bg-heritage-green/5 p-4"
            >
              <h3
                id="step3-active-garment-title"
                className="break-words font-serif text-xl font-bold text-heritage-green"
              >
                Choose a design for {activeOccurrence.label}
              </h3>
              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-heritage-ink/65">
                    Current assignment: {" "}
                  </span>
                  <span className="break-words font-bold text-heritage-green">
                    {activeOccurrence.assignmentLabel || "No design selected"}
                  </span>
                  <span className="ml-2 rounded-full border border-heritage-gold/25 bg-white px-2 py-1 text-[9px] font-bold uppercase text-heritage-green">
                    {OCCURRENCE_STATUS_LABEL[activeOccurrence.status]}
                  </span>
                </div>
                {activeOccurrence.assignment?.sourceKind === "catalog" && (
                  <button
                    type="button"
                    disabled={!mutationsEnabled || !clearRequest}
                    onClick={() => clearRequest && onClearAssignment(clearRequest)}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-white px-4 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Clear design
                  </button>
                )}
              </div>
              {activeOccurrence.assignment?.sourceKind === "uploaded" && (
                <p className="mt-3 text-xs leading-relaxed text-heritage-ink/65">
                  This existing uploaded design assignment is shown read-only.
                  Upload changes remain managed by the secure upload workflow.
                </p>
              )}
            </section>
          )}

          {showCatalogue && catalogueEntries.length === 0 && (
            <div
              role="status"
              data-testid="step3-zero-selectable"
              className="mt-6 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
            >
              <p className="font-bold text-heritage-green">
                No designs can currently be selected for this garment.
              </p>
              <button
                type="button"
                onClick={onReturnToGarmentType}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Return to Garment Type
              </button>
            </div>
          )}

          {showCatalogue && catalogueEntries.length > 0 && (
            <div className="mt-7 space-y-8">
              <section data-testid="step3-best-matches" className="min-w-0">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
                  Best Matches for {activeOccurrence.label}
                </h3>
                {exactStyles.length > 0 ? (
                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {exactStyles.map(renderStyleCard)}
                  </div>
                ) : (
                  <p className="mt-3 rounded-xl border border-heritage-gold/20 bg-heritage-cream/35 px-3 py-2 text-xs text-heritage-ink/70">
                    No exact catalogue matches yet. Explore adaptable designs below.
                  </p>
                )}
              </section>
              <section data-testid="step3-explore-all" className="min-w-0">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
                  Explore Eligible Designs
                </h3>
                <div role="group" aria-label="Catalogue design filters" className="mt-3 flex min-w-0 flex-wrap gap-2">
                  {CATALOGUE_FILTERS.map((filter) => {
                    const pressed = exploreFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        data-catalogue-filter={filter.id}
                        aria-pressed={pressed}
                        onClick={() => setExploreFilter(filter.id)}
                        className={`inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl border px-3 text-[11px] font-bold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                          pressed
                            ? "border-heritage-green bg-heritage-green text-white"
                            : "border-heritage-green/20 bg-white text-heritage-green"
                        }`}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>
                {exploredStyles.length > 0 ? (
                  <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {exploredStyles.map(renderStyleCard)}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-heritage-ink/65">
                    No eligible designs match this filter.
                  </p>
                )}
              </section>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
            <span className="min-w-0 text-heritage-ink/70">
              Garment Construction Subtotal
            </span>
            <span className="shrink-0 font-mono font-bold text-heritage-green">
              {stagePrice === null
                ? "Pending"
                : `${PRICING_CURRENCY_SYMBOL}${stagePrice.toFixed(2)}`}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-heritage-ink/55">
            Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing. Design
            Style does not add another charge.
          </p>
        </aside>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DesignStudioBackButton destination="Fabric" onClick={onBack} />
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={activeOccurrenceIndex <= 0}
              onClick={() =>
                activeOccurrenceIndex > 0 &&
                onSelectOccurrence(occurrences[activeOccurrenceIndex - 1].target)
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" size={15} />
              Previous garment
            </button>
            <button
              type="button"
              disabled={
                activeOccurrenceIndex < 0 ||
                activeOccurrenceIndex >= occurrences.length - 1
              }
              onClick={() =>
                activeOccurrenceIndex >= 0 &&
                activeOccurrenceIndex < occurrences.length - 1 &&
                onSelectOccurrence(occurrences[activeOccurrenceIndex + 1].target)
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next garment
              <ChevronRight aria-hidden="true" size={15} />
            </button>
          </div>
          <div
            data-testid="future-design-style-continue-action"
            data-docked={exactSetComplete}
            className={
              exactSetComplete
                ? "fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
                : ""
            }
          >
            <div
              className={
                exactSetComplete
                  ? "mx-auto flex w-full max-w-4xl justify-end rounded-2xl border border-heritage-gold/30 bg-white/95 p-3 shadow-[0_14px_30px_rgba(19,33,29,0.18)] backdrop-blur-sm"
                  : ""
              }
            >
              <button
                type="button"
                onClick={onContinue}
                disabled={!exactSetComplete}
                aria-label="Continue to Custom Details"
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 ${
                  exactSetComplete ? "w-full sm:w-auto" : ""
                }`}
              >
                <LockKeyhole aria-hidden="true" size={14} />
                Continue to Custom Details
              </button>
            </div>
          </div>
        </div>
      </section>
      {adaptationDialog
        ? typeof document !== "undefined" && document.body
          ? createPortal(adaptationDialog, document.body)
          : adaptationDialog
        : null}
    </>
  );
};
