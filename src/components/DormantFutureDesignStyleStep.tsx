import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LockKeyhole, X } from "lucide-react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { getFutureDesignStyleCompositionLabel } from "../utils/designStudioFutureDesignStyle";
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
  uploadState?: {
    readonly status: "idle" | "pending" | "success" | "error";
    readonly message?: string;
    readonly previewUrl?: string | null;
  };
  stagePrice: number | null;
  isCatalogueLoading?: boolean;
  stylesLoadState?: "loading" | "ready" | "error";
  onSelectOccurrence: (
    target: DesignStyleStepOccurrencePresentation["target"],
  ) => void;
  onAssignCatalogueStyle: (
    requests: readonly DesignStyleStepCatalogMutationRequest[],
  ) => void;
  onClearAssignment: (request: DesignStyleStepClearMutationRequest) => void;
  onSelectUploadFile?: (
    target: DesignStyleStepOccurrencePresentation["target"],
    file: File,
  ) => void;
  onBack: () => void;
  onReturnToGarmentType: () => void;
  onContinue: () => void;
}

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
  uploadState = { status: "idle" },
  stagePrice,
  isCatalogueLoading = false,
  stylesLoadState = "ready",
  onSelectOccurrence,
  onAssignCatalogueStyle,
  onClearAssignment,
  onSelectUploadFile,
  onBack,
  onReturnToGarmentType,
  onContinue,
}: DormantFutureDesignStyleStepProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogInitialFocusRef = useRef<HTMLButtonElement | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);
  const allDesignsRef = useRef<HTMLDivElement | null>(null);
  const [pendingEntry, setPendingEntry] =
    useState<DesignStyleStepCatalogueEntry | null>(null);
  const [selectedOccurrenceTokens, setSelectedOccurrenceTokens] = useState<
    ReadonlySet<string>
  >(new Set());
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const uploadInputId = useId();
  const catalogueReady = stylesLoadState === "ready";
  const mutationsEnabled =
    catalogueReady && (runtimeStatus === "ready" || runtimeStatus === "review");
  const activeOccurrence =
    occurrences.find((occurrence) =>
      designStyleStepTargetsEqual(occurrence.target, activeOccurrenceTarget),
    ) || null;
  const firstIncompleteOccurrence = occurrences.find(
    (occurrence) => occurrence.status !== "complete",
  );
  const showCatalogue =
    occurrences.length > 0 &&
    runtimeStatus !== "blocked" &&
    runtimeStatus !== "hydrating" &&
    catalogueReady;

  const selectedOccurrences = useMemo(
    () =>
      occurrences.filter((occurrence) =>
        selectedOccurrenceTokens.has(occurrence.target.occurrenceToken),
      ),
    [occurrences, selectedOccurrenceTokens],
  );
  const replacementOccurrences = useMemo(
    () =>
      pendingEntry
        ? selectedOccurrences.filter((occurrence) => {
            const assignment = occurrence.assignment;
            return Boolean(
              assignment &&
                !(
                  assignment.sourceKind === "catalog" &&
                  assignment.catalogStyleId === pendingEntry.style.id
                ),
            );
          })
        : [],
    [pendingEntry, selectedOccurrences],
  );
  const mismatchOccurrences = useMemo(() => {
    if (!pendingEntry || pendingEntry.referenceGarmentTypes.length === 0) return [];
    const referenceTypes = new Set(pendingEntry.referenceGarmentTypes);
    return selectedOccurrences.filter(
      (occurrence) => !referenceTypes.has(occurrence.garmentType),
    );
  }, [pendingEntry, selectedOccurrences]);

  const closeDialog = () => {
    setPendingEntry(null);
    setSelectedOccurrenceTokens(new Set());
    dialogTriggerRef.current?.focus?.();
  };

  const openDialog = (
    entry: DesignStyleStepCatalogueEntry,
    trigger: HTMLButtonElement,
  ) => {
    if (!mutationsEnabled) return;
    dialogTriggerRef.current = trigger;
    setPendingEntry(entry);
    setSelectedOccurrenceTokens(
      new Set(
        occurrences
          .filter(
            (occurrence) =>
              occurrence.assignment?.sourceKind === "catalog" &&
              occurrence.assignment.catalogStyleId === entry.style.id,
          )
          .map((occurrence) => occurrence.target.occurrenceToken),
      ),
    );
  };

  const applyMapping = () => {
    if (!pendingEntry || selectedOccurrences.length === 0) return;
    const requests = selectedOccurrences.flatMap((occurrence) => {
      const request =
        pendingEntry.requestsByOccurrenceToken[
          occurrence.target.occurrenceToken
        ];
      return request ? [request] : [];
    });
    if (requests.length !== selectedOccurrences.length) return;
    setPendingEntry(null);
    setSelectedOccurrenceTokens(new Set());
    onAssignCatalogueStyle(requests);
    dialogTriggerRef.current?.focus?.();
  };

  useEffect(() => {
    if (!pendingEntry) return;
    if (typeof document === "undefined" || !document.body?.style) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [pendingEntry]);

  useEffect(() => {
    if (!pendingEntry) return;
    (dialogInitialFocusRef.current || dialogRef.current)?.focus?.();
  }, [pendingEntry]);

  useEffect(() => {
    if (!pendingEntry) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
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
  }, [pendingEntry]);

  useEffect(() => {
    if (
      pendingEntry &&
      !catalogueEntries.some((entry) => entry.style.id === pendingEntry.style.id)
    ) {
      setPendingEntry(null);
      setSelectedOccurrenceTokens(new Set());
    }
  }, [catalogueEntries, pendingEntry]);

  const renderUploadControl = (replacement: boolean) => {
    if (!activeOccurrence || !onSelectUploadFile || !mutationsEnabled) return null;
    const actionLabel = replacement
      ? `Replace uploaded design for ${activeOccurrence.label}`
      : `Upload a design for ${activeOccurrence.label}`;
    return (
      <div className="mt-4 rounded-xl border border-dashed border-heritage-gold/35 bg-white p-4">
        <p className="text-sm font-bold text-heritage-green">{actionLabel}</p>
        <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
          Choose a JPEG, PNG, or WebP image. Your current design and preview
          stay in place until the new upload succeeds.
        </p>
        {uploadState.status !== "pending" && (
          <input
            id={uploadInputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={actionLabel}
            aria-describedby={`${uploadInputId}-status`}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              event.currentTarget.value = "";
              if (file) onSelectUploadFile(activeOccurrence.target, file);
            }}
            className="mt-3 block min-h-11 w-full min-w-0 rounded-xl border border-heritage-green/20 bg-white px-3 py-2 text-xs text-heritage-ink file:mr-3 file:rounded-lg file:border-0 file:bg-heritage-green file:px-3 file:py-2 file:text-xs file:font-bold file:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          />
        )}
        <div id={`${uploadInputId}-status`} className="mt-2" aria-live="polite">
          {uploadState.status === "pending" && (
            <p role="status" className="text-xs font-semibold text-heritage-green">
              Preparing your uploaded design for {activeOccurrence.label}...
            </p>
          )}
          {uploadState.status === "error" && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {uploadState.message ||
                "The design could not be prepared. Your previous selection is unchanged. Try again."}
            </p>
          )}
        </div>
      </div>
    );
  };

  const mappingDialog = pendingEntry ? (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/45 p-3 sm:items-center sm:p-6"
      onClick={closeDialog}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        tabIndex={-1}
        data-testid="design-garment-mapping-dialog"
        data-pending-style={pendingEntry.style.name}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={dialogTitleId} className="font-serif text-xl font-bold text-heritage-green sm:text-2xl">Apply Design Style</h2>
            <p className="mt-1 break-words font-serif text-lg font-semibold text-heritage-green">{pendingEntry.style.name}</p>
            <p id={dialogDescriptionId} className="mt-2 text-sm leading-relaxed text-heritage-ink/70">Choose every exact garment occurrence that should use this design.</p>
          </div>
          <button ref={dialogInitialFocusRef} type="button" onClick={closeDialog} aria-label="Close garment mapping dialog" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          {pendingEntry.style.image && <img src={pendingEntry.style.image} alt={`${pendingEntry.style.name} design reference`} className="mb-4 max-h-56 w-full rounded-2xl bg-heritage-cream/35 object-contain" />}
          <p className="text-xs leading-relaxed text-heritage-ink/70"><span className="font-bold text-heritage-green">Reference outfit:</span> {getFutureDesignStyleCompositionLabel(pendingEntry.style)}</p>
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-bold text-heritage-green">Which of your garments should use this design?</legend>
            {occurrences.map((occurrence) => {
              const token = occurrence.target.occurrenceToken;
              const checked = selectedOccurrenceTokens.has(token);
              const alreadyUsing = occurrence.assignment?.sourceKind === "catalog" && occurrence.assignment.catalogStyleId === pendingEntry.style.id;
              return (
                <label key={token} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-heritage-green/15 px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-heritage-gold">
                  <input type="checkbox" checked={checked} onChange={() => setSelectedOccurrenceTokens((current) => { const next = new Set(current); if (next.has(token)) next.delete(token); else next.add(token); return next; })} className="mt-0.5 size-4 shrink-0 accent-heritage-green" />
                  <span className="min-w-0 break-words">
                    <span className="font-bold text-heritage-green">{occurrence.label}</span>
                    {alreadyUsing && <span className="ml-2 text-xs font-semibold text-heritage-ink/60">Already using this design</span>}
                    {!alreadyUsing && occurrence.assignmentLabel && <span className="mt-0.5 block text-xs text-heritage-ink/60">Current: {occurrence.assignmentLabel}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {replacementOccurrences.length > 0 && <div role="status" className="mt-4 space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{replacementOccurrences.map((occurrence) => <p key={occurrence.target.occurrenceToken}>{occurrence.label} currently uses {occurrence.assignmentLabel}. Applying {pendingEntry.style.name} will replace it for {occurrence.label}.</p>)}</div>}
          {mismatchOccurrences.length > 0 && <div role="status" data-testid="reference-composition-warning" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">This reference design features {pendingEntry.referenceGarmentTypes.map(getFabricGarmentLabel).join(" + ")}. {mismatchOccurrences.map((occurrence) => occurrence.label).join(" + ")} {mismatchOccurrences.length === 1 ? "is" : "are"} not part of the reference outfit, so the design may need to be adapted. You can still apply it.</div>}
        </div>
        <footer className="flex flex-col gap-2 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" onClick={closeDialog} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Cancel</button>
          <button type="button" onClick={applyMapping} disabled={selectedOccurrences.length === 0} data-testid="apply-design-mapping" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Apply Design</button>
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section aria-labelledby="future-design-style-title" data-stage-id="design_style" data-stage-complete={exactSetComplete} className={`min-w-0 space-y-6 font-sans [overflow-wrap:anywhere] ${exactSetComplete ? "pb-28 sm:pb-32" : ""}`}>
        <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
          <DesignStudioBackButton destination="Fabric" onClick={onBack} className="mb-5" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Step 3 of 9</p>
          <h2 id="future-design-style-title" className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl">Design Style</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">Choose a design reference for your garments. Your garments and Fabric selections remain unchanged.</p>
          <div aria-live="polite" data-testid="step3-assignment-progress" className="mt-5 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 px-4 py-3"><p className="font-serif text-base font-bold text-heritage-green">{completedCount} of {totalCount} garment{totalCount === 1 ? " has" : "s have"} a design</p></div>
          {reviewMessage && <div role="alert" data-testid="step3-migration-review" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Review your Design Style choices</p><p className="mt-1 text-xs leading-relaxed">{reviewMessage}</p></div>}
          {mutationError && <div role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{mutationError}</div>}
          {runtimeStatus === "hydrating" && <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">Restoring your Design Style choices...</div>}
          {runtimeStatus === "blocked" && <div role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900">Your saved Design Style choices cannot be changed safely here. Nothing has been overwritten.</div>}
          {(isCatalogueLoading || runtimeStatus === "loading") && <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">Loading catalogue designs. Your saved assignments are preserved.</div>}
          {runtimeStatus === "error" && <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">The Design Style catalogue is temporarily unavailable. Your saved assignments are preserved.</div>}

          {occurrences.length > 0 && (
            <section aria-labelledby="current-design-mappings-title" className="mt-7">
              <h3 id="current-design-mappings-title" className="font-serif text-xl font-bold text-heritage-green">Your Garments / Current Design Mappings</h3>
              <div role="list" className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                {occurrences.map((occurrence) => {
                  const active = designStyleStepTargetsEqual(occurrence.target, activeOccurrenceTarget);
                  return (
                    <article key={occurrence.target.occurrenceToken} role="listitem" data-occurrence-label={occurrence.label} className={`min-w-0 rounded-2xl border p-4 ${active ? "border-heritage-gold bg-heritage-cream/25" : "border-heritage-green/15 bg-white"}`}>
                      <p className="font-serif text-lg font-bold text-heritage-green">{occurrence.label}</p>
                      <p className="mt-1 break-words text-sm text-heritage-ink/70">Design: <span className="font-bold text-heritage-green">{occurrence.assignmentLabel || "No design selected"}</span></p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-heritage-ink/50">{OCCURRENCE_STATUS_LABEL[occurrence.status]}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => { onSelectOccurrence(occurrence.target); allDesignsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-3 text-xs font-bold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">{occurrence.assignment ? "Change / Choose Design" : "Choose Design"}</button>
                        {active && occurrence.assignment && clearRequest && <button type="button" onClick={() => onClearAssignment(clearRequest)} aria-label={occurrence.assignment.sourceKind === "uploaded" ? `Remove uploaded design from ${occurrence.label}` : `Clear design for ${occurrence.label}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">{occurrence.assignment.sourceKind === "uploaded" ? `Remove uploaded design from ${occurrence.label}` : "Clear"}</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {showCatalogue && catalogueEntries.length === 0 && <div role="status" data-testid="step3-zero-selectable" className="mt-7 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"><p className="font-bold text-heritage-green">No published Design Styles are currently available.</p><button type="button" onClick={onReturnToGarmentType} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green">Return to Garment Type</button></div>}

          {showCatalogue && catalogueEntries.length > 0 && (
            <section ref={allDesignsRef} data-testid="step3-all-designs" className="mt-8 min-w-0 scroll-mt-24">
              <h3 className="font-serif text-xl font-bold text-heritage-green">All Designs</h3>
              <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">Every published design is available as a visual reference for any of your garments.</p>
              <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {catalogueEntries.map((entry) => (
                  <article key={entry.style.id} data-style-card="true" data-style-name={entry.style.name} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm">
                    <div className="relative aspect-[4/5] overflow-hidden bg-heritage-cream/35">
                      {entry.style.image ? <img src={entry.style.image} alt={`${entry.style.name} design`} loading="lazy" className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">Image unavailable</div>}
                      {entry.selectedOccurrenceLabels.length > 0 && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-heritage-gold px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"><Check aria-hidden="true" size={14} />Used for {entry.selectedOccurrenceLabels.length}</span>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col p-4">
                      <h4 className="break-words font-serif text-base font-bold text-heritage-green">{entry.style.name}</h4>
                      <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/75"><span className="font-semibold text-heritage-green">Reference outfit:</span> {getFutureDesignStyleCompositionLabel(entry.style)}</p>
                      {entry.selectedOccurrenceLabels.length > 0 && <p className="mt-2 break-words text-xs text-heritage-ink/60">Applied to {entry.selectedOccurrenceLabels.join(", ")}</p>}
                      {entry.style.description && <p className="mt-3 break-words text-xs leading-relaxed text-heritage-ink/65">{entry.style.description}</p>}
                      <button type="button" disabled={!mutationsEnabled} onClick={(event) => openDialog(entry, event.currentTarget)} aria-label={`Use This Design ${entry.style.name}`} className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-heritage-ink/45">Use This Design</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeOccurrence && (
            <section aria-labelledby="upload-own-design-title" className="mt-8 rounded-2xl border border-heritage-green/15 bg-heritage-green/5 p-4">
              <h3 id="upload-own-design-title" className="font-serif text-xl font-bold text-heritage-green">Upload Your Own Design</h3>
              <p className="mt-1 text-xs text-heritage-ink/65">Upload for the currently active garment: <span className="font-bold text-heritage-green">{activeOccurrence.label}</span>.</p>
              {activeOccurrence.assignment?.sourceKind === "uploaded" && uploadState.previewUrl && <img src={uploadState.previewUrl} alt={`Uploaded design preview for ${activeOccurrence.label}`} className="mt-3 max-h-72 w-full rounded-xl border border-heritage-gold/20 bg-white object-contain" />}
              {activeOccurrence.assignment?.sourceKind === "uploaded" && <p className="mt-3 text-xs leading-relaxed text-heritage-ink/65">Removing this assignment keeps the uploaded source available for any other garment that uses it.</p>}
              {renderUploadControl(activeOccurrence.assignment?.sourceKind === "uploaded")}
            </section>
          )}
        </div>

        <aside className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm"><div className="flex min-w-0 flex-wrap items-start justify-between gap-3 text-sm"><span className="min-w-0 text-heritage-ink/70">Garment Construction Subtotal</span><span className="shrink-0 font-mono font-bold text-heritage-green">{stagePrice === null ? "Pending" : `${PRICING_CURRENCY_SYMBOL}${stagePrice.toFixed(2)}`}</span></div><p className="mt-2 text-[11px] leading-relaxed text-heritage-ink/55">Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing. Design Style does not add another charge.</p></aside>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <DesignStudioBackButton destination="Fabric" onClick={onBack} />
          <div className="min-w-0">
            {!exactSetComplete && firstIncompleteOccurrence && <p role="status" className="mb-2 max-w-sm text-xs font-semibold text-amber-800">Choose a design reference for {firstIncompleteOccurrence.label} to continue.</p>}
            <div data-testid="future-design-style-continue-action" data-docked={exactSetComplete} className={exactSetComplete ? "fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3" : ""}><div className={exactSetComplete ? "mx-auto flex w-full max-w-4xl justify-end rounded-2xl border border-heritage-gold/30 bg-white/95 p-3 shadow-[0_14px_30px_rgba(19,33,29,0.18)] backdrop-blur-sm" : ""}><button type="button" onClick={onContinue} disabled={!exactSetComplete} aria-label="Continue to Custom Details" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 ${exactSetComplete ? "w-full sm:w-auto" : ""}`}><LockKeyhole aria-hidden="true" size={14} />Continue to Custom Details</button></div></div>
          </div>
        </div>
      </section>
      {mappingDialog ? (typeof document !== "undefined" && document.body ? createPortal(mappingDialog, document.body) : mappingDialog) : null}
    </>
  );
};
