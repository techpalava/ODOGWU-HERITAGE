import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import type { CanonicalPhysicalGarmentType, StyleCategory } from "../types";
import type { DesignStyleStepCatalogueEntry } from "../utils/designStyleStepRuntime";
import { getCustomDetailsGarmentLabel } from "../utils/optionalShortsPresentation";

const formatDisplayStyleLabel = (style: StyleCategory): string => {
  return String(style.name ?? "").trim() || "Design Style";
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

export const FutureAdditionalGarmentDesignStyleDialog = ({
  garmentType,
  garmentKey,
  catalogueEntries,
  assigning = false,
  errorMessage = null,
  onSelectStyle,
  onCancel,
}: {
  garmentType: CanonicalPhysicalGarmentType;
  garmentKey: string;
  catalogueEntries: readonly DesignStyleStepCatalogueEntry[];
  assigning?: boolean;
  errorMessage?: string | null;
  onSelectStyle: (entry: DesignStyleStepCatalogueEntry) => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const [pendingAdaptation, setPendingAdaptation] =
    useState<DesignStyleStepCatalogueEntry | null>(null);
  const garmentLabel = getCustomDetailsGarmentLabel(garmentType);
  const selectableEntries = catalogueEntries.filter(
    (entry) => entry.presentation.selectable !== false,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (assigning) return;
    const node = initialFocusRef.current || dialogRef.current;
    node?.focus?.({ preventScroll: true });
  }, [assigning]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (assigning) return;
        if (pendingAdaptation) {
          event.preventDefault();
          setPendingAdaptation(null);
          return;
        }
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = getFocusableElements(dialogRef.current);
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assigning, onCancel, pendingAdaptation]);

  const chooseEntry = (entry: DesignStyleStepCatalogueEntry) => {
    if (assigning) return;
    if (entry.adaptationCopy) {
      setPendingAdaptation(entry);
      return;
    }
    onSelectStyle(entry);
  };

  const confirmAdaptation = () => {
    if (!pendingAdaptation || assigning) return;
    const entry = pendingAdaptation;
    setPendingAdaptation(null);
    onSelectStyle(entry);
  };

  const dialog = (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      data-additional-garment-design-style-dialog="true"
      data-garment-key={garmentKey}
    >
      <div
        role="presentation"
        className="absolute inset-0 bg-black/55"
        onClick={assigning ? undefined : onCancel}
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
              {assigning
                ? `Saving design for ${garmentLabel}`
                : `Choose Design Style for ${garmentLabel}`}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {assigning
                ? "Saving this garment’s design style…"
                : `Select one design style for this ${garmentLabel} only. Other garments keep their current design.`}
            </p>
          </div>
          {!assigning && (
            <button
              ref={initialFocusRef}
              type="button"
              onClick={onCancel}
              aria-label="Close design style picker"
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
              data-additional-garment-design-style-error="true"
              className="mb-4 rounded-2xl border border-red-300/50 bg-red-50/80 p-3"
            >
              <p className="text-sm font-bold text-red-800">
                Design style action blocked
              </p>
              <p className="mt-1 text-sm text-red-900/85">{errorMessage}</p>
            </div>
          )}

          {assigning ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/40 p-4 text-sm font-semibold text-heritage-green"
            >
              Saving design style…
            </p>
          ) : selectableEntries.length === 0 ? (
            <div
              role="status"
              data-testid="additional-garment-design-style-empty"
              className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
            >
              <p className="font-bold text-heritage-green">
                No published Design Styles are currently available for this
                garment.
              </p>
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green"
              >
                Return to Personalized Additions
              </button>
            </div>
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selectableEntries.map((entry) => {
                const displayStyleName = formatDisplayStyleLabel(entry.style);
                const requestForGarment =
                  Object.values(entry.requestsByOccurrenceToken).find(
                    (request) => request.target.garmentKey === garmentKey,
                  ) || entry.request;
                return (
                  <article
                    key={entry.style.id}
                    data-testid="additional-garment-design-style-card"
                    data-style-id={entry.style.id}
                    data-garment-key={requestForGarment.target.garmentKey}
                    className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-heritage-cream/35">
                      {entry.style.image ? (
                        <img
                          src={entry.style.image}
                          alt={`${displayStyleName} design`}
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-3 text-center text-xs text-heritage-ink/55">
                          Image unavailable
                        </div>
                      )}
                      {entry.selected && (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-heritage-gold px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                          <Check aria-hidden="true" size={14} />
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                      <h3 className="break-words font-serif text-base font-bold leading-snug text-heritage-green line-clamp-2">
                        {displayStyleName}
                      </h3>
                      {entry.presentation.customerReason && (
                        <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">
                          {entry.presentation.customerReason}
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={assigning}
                        onClick={() => chooseEntry(entry)}
                        className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Use This Design
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {pendingAdaptation && (
          <div
            className="absolute inset-0 z-[82] flex items-center justify-center bg-black/45 p-4"
            data-testid="additional-garment-design-style-adapt-confirm"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="additional-garment-adapt-title"
              className="w-full max-w-md rounded-2xl border border-heritage-gold/30 bg-white p-5 shadow-2xl"
            >
              <h3
                id="additional-garment-adapt-title"
                className="font-serif text-lg font-bold text-heritage-green"
              >
                {pendingAdaptation.adaptationCopy?.title ||
                  "Adapt this design?"}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-heritage-ink/70">
                {pendingAdaptation.adaptationCopy?.body ||
                  `This design can be adapted for ${garmentLabel}.`}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPendingAdaptation(null)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-sm font-bold text-heritage-green"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAdaptation}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-sm font-bold text-white"
                >
                  Adapt and use
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
