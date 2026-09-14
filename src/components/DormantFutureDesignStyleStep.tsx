import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, LockKeyhole, Plus, X } from "lucide-react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  designStyleStepTargetsEqual,
  type DesignStyleStepCatalogMutationRequest,
  type DesignStyleStepCatalogueEntry,
  type DesignStyleStepClearMutationRequest,
  type DesignStyleStepOccurrencePresentation,
  type DesignStyleStepRuntimeStatus,
} from "../utils/designStyleStepRuntime";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import type {
  CanonicalPhysicalGarmentType,
  GarmentConstructionPricingResolution,
  StyleCategory,
} from "../types";
import {
  getGarmentTypeStepLabel,
  Step1GarmentReferencePhoto,
} from "./GarmentTypeStep";
import {
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
  isStep1GarmentReferenceType,
} from "../utils/step1GarmentReferenceImages";
import { DesignStudioBackButton } from "./DesignStudioBackButton";

interface DormantFutureDesignStyleStepProps {
  occurrences: readonly DesignStyleStepOccurrencePresentation[];
  activeOccurrenceTarget: DesignStyleStepOccurrencePresentation["target"] | null;
  catalogueEntries: readonly DesignStyleStepCatalogueEntry[];
  clearRequest: DesignStyleStepClearMutationRequest | null;
  clearRequests?: readonly DesignStyleStepClearMutationRequest[];
  runtimeStatus: DesignStyleStepRuntimeStatus;
  completedCount: number;
  totalCount: number;
  exactSetComplete: boolean;
  reviewMessage: string | null;
  mutationError: string | null;
  /** An authenticated draft read failed before V2 hydration could begin. */
  draftHydrationFailed?: boolean;
  uploadState?: {
    readonly status: "idle" | "pending" | "success" | "error";
    readonly message?: string;
    readonly previewUrl?: string | null;
  };
  /** Private uploaded-image previews keyed by exact physical occurrence token. */
  selectedDesignPreviewByOccurrenceToken?: Readonly<Record<string, string>>;
  stagePrice: number | null;
  isCatalogueLoading?: boolean;
  stylesLoadState?: "loading" | "ready" | "error";
  additionalGarmentOptions?: readonly {
    readonly garmentType: CanonicalPhysicalGarmentType;
    readonly construction: GarmentConstructionPricingResolution;
  }[];
  reuseFabricPending?: boolean;
  reuseAddedOccurrence?: {
    readonly garmentKey: string;
    readonly styleId: string;
  } | null;
  /** Set only by a completed intentional Design Style assignment. */
  assignmentFeedback?: {
    readonly target: DesignStyleStepOccurrencePresentation["target"];
    readonly eventId: number;
  } | null;
  onAssignmentFeedbackHandled?: (eventId: number) => void;
  onSelectOccurrence: (
    target: DesignStyleStepOccurrencePresentation["target"],
  ) => void;
  onAssignCatalogueStyle: (
    requests: readonly DesignStyleStepCatalogMutationRequest[],
  ) => void;
  onClearAssignment: (request: DesignStyleStepClearMutationRequest) => void;
  onClearAllAssignments?: () => void;
  onSelectUploadFile?: (
    target: DesignStyleStepOccurrencePresentation["target"],
    file: File,
  ) => void;
  onAddAdditionalGarment?: (
    garmentType: CanonicalPhysicalGarmentType,
    triggerElement: HTMLElement,
    context: { readonly origin: "design_style_reuse"; readonly styleId: string },
  ) => void;
  onReuseAddedOccurrenceHandled?: (garmentKey: string) => void;
  onBack: () => void;
  onReturnToGarmentType: () => void;
  onContinue: () => void;
}

const formatDisplayStyleLabel = (style: StyleCategory): string => {
  return String(style.name ?? "").trim();
};

const formatReferenceGarmentTypes = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
): string => garmentTypes.map(getFabricGarmentLabel).join(", ");

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
  clearRequests = [],
  runtimeStatus,
  completedCount,
  totalCount,
  exactSetComplete,
  reviewMessage,
  mutationError,
  draftHydrationFailed = false,
  uploadState = { status: "idle" },
  selectedDesignPreviewByOccurrenceToken = {},
  stagePrice,
  isCatalogueLoading = false,
  stylesLoadState = "ready",
  additionalGarmentOptions = [],
  reuseFabricPending = false,
  reuseAddedOccurrence = null,
  assignmentFeedback = null,
  onAssignmentFeedbackHandled,
  onSelectOccurrence,
  onAssignCatalogueStyle,
  onClearAssignment,
  onClearAllAssignments,
  onSelectUploadFile,
  onAddAdditionalGarment,
  onReuseAddedOccurrenceHandled,
  onBack,
  onReturnToGarmentType,
  onContinue,
}: DormantFutureDesignStyleStepProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const dialogInitialFocusRef = useRef<HTMLButtonElement | null>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const detailsDialogRef = useRef<HTMLDivElement | null>(null);
  const detailsCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const allDesignsRef = useRef<HTMLDivElement | null>(null);
  const garmentCardRefs = useRef(new Map<string, HTMLElement>());
  const assignmentFeedbackFrameRef = useRef<number | null>(null);
  const assignmentFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const handledAssignmentFeedbackIdRef = useRef<number | null>(null);
  const mappingScrollTopRef = useRef(0);
  const hasSeenReuseFabricRef = useRef(false);
  const handledReuseAddedOccurrenceRef = useRef<string | null>(null);
  const [pendingEntry, setPendingEntry] =
    useState<DesignStyleStepCatalogueEntry | null>(null);
  const [detailsEntry, setDetailsEntry] =
    useState<DesignStyleStepCatalogueEntry | null>(null);
  const [selectedOccurrenceTokens, setSelectedOccurrenceTokens] = useState<
    ReadonlySet<string>
  >(new Set());
  const [dialogView, setDialogView] = useState<"mapping" | "add_garment">(
    "mapping",
  );
  const [highlightedOccurrenceToken, setHighlightedOccurrenceToken] = useState<
    string | null
  >(null);
  const [highlightPrefersReducedMotion, setHighlightPrefersReducedMotion] =
    useState(false);
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
  const highlightedOccurrence =
    occurrences.find(
      (occurrence) =>
        occurrence.target.occurrenceToken === highlightedOccurrenceToken,
    ) || null;

  useEffect(() => {
    if (
      !assignmentFeedback ||
      handledAssignmentFeedbackIdRef.current === assignmentFeedback.eventId
    ) {
      return;
    }
    const token = assignmentFeedback.target.occurrenceToken;
    const card = garmentCardRefs.current.get(token);
    if (!card) return;

    if (assignmentFeedbackFrameRef.current !== null) {
      if (typeof window !== "undefined") {
        window.cancelAnimationFrame?.(assignmentFeedbackFrameRef.current);
      }
      assignmentFeedbackFrameRef.current = null;
    }
    if (assignmentFeedbackTimerRef.current !== null) {
      clearTimeout(assignmentFeedbackTimerRef.current);
      assignmentFeedbackTimerRef.current = null;
    }

    handledAssignmentFeedbackIdRef.current = assignmentFeedback.eventId;
    setHighlightedOccurrenceToken(token);
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setHighlightPrefersReducedMotion(prefersReducedMotion);
    const revealCard = () => {
      card.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      card.focus({ preventScroll: true });
      assignmentFeedbackFrameRef.current = null;
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      assignmentFeedbackFrameRef.current = window.requestAnimationFrame(revealCard);
    } else {
      revealCard();
    }
    assignmentFeedbackTimerRef.current = setTimeout(() => {
      assignmentFeedbackTimerRef.current = null;
      setHighlightedOccurrenceToken((current) =>
        current === token ? null : current,
      );
    }, 800);
    onAssignmentFeedbackHandled?.(assignmentFeedback.eventId);
  }, [assignmentFeedback, onAssignmentFeedbackHandled]);

  useEffect(
    () => () => {
      if (
        assignmentFeedbackFrameRef.current !== null &&
        typeof window !== "undefined"
      ) {
        window.cancelAnimationFrame?.(assignmentFeedbackFrameRef.current);
      }
      if (assignmentFeedbackTimerRef.current !== null) {
        clearTimeout(assignmentFeedbackTimerRef.current);
      }
    },
    [],
  );

  const selectedOccurrences = useMemo(
    () =>
      occurrences.filter((occurrence) =>
        selectedOccurrenceTokens.has(occurrence.target.occurrenceToken),
      ),
    [occurrences, selectedOccurrenceTokens],
  );
  const currentStyleOccurrenceTokens = useMemo(
    () =>
      new Set(
        pendingEntry
          ? occurrences
              .filter(
                (occurrence) =>
                  occurrence.assignment?.sourceKind === "catalog" &&
                  occurrence.assignment.catalogStyleId === pendingEntry.style.id,
              )
              .map((occurrence) => occurrence.target.occurrenceToken)
          : [],
      ),
    [occurrences, pendingEntry],
  );
  const selectionMatchesCurrentStyle =
    selectedOccurrenceTokens.size === currentStyleOccurrenceTokens.size &&
    [...selectedOccurrenceTokens].every((token) =>
      currentStyleOccurrenceTokens.has(token),
    );
  const mismatchOccurrences = useMemo(() => {
    if (!pendingEntry || pendingEntry.referenceGarmentTypes.length === 0) return [];
    const referenceTypes = new Set(pendingEntry.referenceGarmentTypes);
    return selectedOccurrences.filter(
      (occurrence) => !referenceTypes.has(occurrence.garmentType),
    );
  }, [pendingEntry, selectedOccurrences]);
  const allCurrentOccurrencesUsePendingEntry = Boolean(
    pendingEntry &&
      occurrences.length > 0 &&
      occurrences.every(
        (occurrence) =>
          occurrence.assignment?.sourceKind === "catalog" &&
          occurrence.assignment.catalogStyleId === pendingEntry.style.id,
      ),
  );
  const canApplyMapping =
    !selectionMatchesCurrentStyle &&
    selectedOccurrences.length > 0 &&
    selectedOccurrences.every(
      (occurrence) =>
        Boolean(
          pendingEntry?.requestsByOccurrenceToken[
            occurrence.target.occurrenceToken
          ],
        ),
    );
  const applyMappingLabel = selectionMatchesCurrentStyle
    ? "No changes"
    : `Apply to ${selectedOccurrences.length} ${
        selectedOccurrences.length === 1 ? "garment" : "garments"
      }`;

  const restoreMappingScroll = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      if (dialogContentRef.current) {
        dialogContentRef.current.scrollTop = mappingScrollTopRef.current;
      }
    });
  };

  const returnToMappingDialog = () => {
    setDialogView("mapping");
    restoreMappingScroll();
  };

  const closeDialog = () => {
    setPendingEntry(null);
    setSelectedOccurrenceTokens(new Set());
    setDialogView("mapping");
    mappingScrollTopRef.current = 0;
    dialogTriggerRef.current?.focus?.();
  };

  const openDialog = (
    entry: DesignStyleStepCatalogueEntry,
    trigger: HTMLElement,
  ) => {
    if (!mutationsEnabled) return;
    dialogTriggerRef.current = trigger;
    setPendingEntry(entry);
    setDialogView("mapping");
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

  const closeDetails = () => {
    setDetailsEntry(null);
    detailsTriggerRef.current?.focus?.();
  };

  const openDetails = (
    entry: DesignStyleStepCatalogueEntry,
    trigger: HTMLElement,
  ) => {
    detailsTriggerRef.current = trigger;
    setDetailsEntry(entry);
  };

  const chooseStyleFromDetails = () => {
    if (!detailsEntry || !mutationsEnabled) return;
    const trigger = detailsTriggerRef.current;
    if (!trigger) return;
    const entry = detailsEntry;
    setDetailsEntry(null);
    openDialog(entry, trigger);
  };

  const applyMapping = () => {
    if (!pendingEntry || !canApplyMapping) return;
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
    if (!detailsEntry) return;
    if (typeof document === "undefined" || !document.body?.style) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailsEntry]);

  useEffect(() => {
    if (!pendingEntry) return;
    (dialogInitialFocusRef.current || dialogRef.current)?.focus?.();
  }, [pendingEntry]);

  useEffect(() => {
    if (!detailsEntry) return;
    (detailsCloseRef.current || detailsDialogRef.current)?.focus?.();
  }, [detailsEntry]);

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
    if (!detailsEntry) return;
    const dialog = detailsDialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDetails();
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
  }, [detailsEntry]);

  useEffect(() => {
    if (!pendingEntry) return;
    const currentEntry = catalogueEntries.find(
      (entry) => entry.style.id === pendingEntry.style.id,
    );
    if (!currentEntry) {
      setPendingEntry(null);
      setSelectedOccurrenceTokens(new Set());
      return;
    }
    if (currentEntry !== pendingEntry) setPendingEntry(currentEntry);
  }, [catalogueEntries, pendingEntry]);

  useEffect(() => {
    if (reuseFabricPending) {
      hasSeenReuseFabricRef.current = true;
      return;
    }
    if (!hasSeenReuseFabricRef.current) return;
    hasSeenReuseFabricRef.current = false;
    returnToMappingDialog();
  }, [reuseFabricPending]);

  useEffect(() => {
    if (!reuseAddedOccurrence) {
      handledReuseAddedOccurrenceRef.current = null;
      return;
    }
    if (
      !pendingEntry ||
      reuseAddedOccurrence.styleId !== pendingEntry.style.id
    ) {
      return;
    }
    const addedOccurrence = occurrences.find(
      (occurrence) =>
        occurrence.target.garmentKey === reuseAddedOccurrence.garmentKey,
    );
    if (!addedOccurrence) return;
    const handledKey = `${reuseAddedOccurrence.styleId}:${reuseAddedOccurrence.garmentKey}`;
    if (handledReuseAddedOccurrenceRef.current === handledKey) return;
    handledReuseAddedOccurrenceRef.current = handledKey;
    setSelectedOccurrenceTokens((current) => {
      if (current.has(addedOccurrence.target.occurrenceToken)) return current;
      const next = new Set(current);
      next.add(addedOccurrence.target.occurrenceToken);
      return next;
    });
    setDialogView("mapping");
    restoreMappingScroll();
    onReuseAddedOccurrenceHandled?.(reuseAddedOccurrence.garmentKey);
  }, [
    occurrences,
    onReuseAddedOccurrenceHandled,
    pendingEntry,
    reuseAddedOccurrence,
  ]);

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

  const pendingDisplayStyleName = pendingEntry
    ? formatDisplayStyleLabel(pendingEntry.style)
    : null;

  const mappingDialog = pendingEntry ? (
    <div
      className={`fixed inset-0 ${reuseFabricPending ? "z-[70]" : "z-[10000]"} flex items-end justify-center bg-heritage-ink/45 p-3 sm:items-center sm:p-6`}
      onClick={closeDialog}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={reuseFabricPending || undefined}
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        tabIndex={-1}
        data-testid="design-garment-mapping-dialog"
        data-pending-style={pendingDisplayStyleName || ""}
        data-dialog-view={dialogView}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={dialogTitleId} className="font-serif text-xl font-bold text-heritage-green sm:text-2xl">{dialogView === "add_garment" ? "Add a garment" : "Apply Design Style"}</h2>
            {dialogView === "mapping" ? <><p className="mt-1 break-words font-serif text-lg font-semibold text-heritage-green">{pendingDisplayStyleName}</p><p id={dialogDescriptionId} className="mt-2 text-sm leading-relaxed text-heritage-ink/70">Choose the garments you want to use this design on.</p></> : <p id={dialogDescriptionId} className="mt-2 text-sm leading-relaxed text-heritage-ink/70">Choose a garment type to add. Fabric will be selected for the new occurrence before you apply this design.</p>}
          </div>
          <button ref={dialogInitialFocusRef} type="button" onClick={closeDialog} aria-label="Close garment mapping dialog" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><X aria-hidden="true" size={18} /></button>
        </header>
        <div ref={dialogContentRef} className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          {dialogView === "mapping" ? <>
          {pendingEntry.style.image && pendingDisplayStyleName && <img src={pendingEntry.style.image} alt={`${pendingDisplayStyleName} design reference`} className="mb-4 max-h-56 w-full rounded-2xl bg-heritage-cream/35 object-contain" />}
          {pendingEntry.referenceGarmentTypes.length > 0 && <p className="text-xs leading-relaxed text-heritage-ink/70"><span className="font-bold text-heritage-green">Originally designed for:</span> {formatReferenceGarmentTypes(pendingEntry.referenceGarmentTypes)}</p>}
          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-bold text-heritage-green">Choose garments</legend>
            {occurrences.map((occurrence) => {
              const token = occurrence.target.occurrenceToken;
              const checked = selectedOccurrenceTokens.has(token);
              const alreadyUsing = occurrence.assignment?.sourceKind === "catalog" && occurrence.assignment.catalogStyleId === pendingEntry.style.id;
              const willReplace = checked && Boolean(occurrence.assignment && !alreadyUsing);
              return (
                <label key={token} data-occurrence-token={token} className={`flex min-w-0 items-start gap-3 rounded-xl border border-heritage-green/15 px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-heritage-gold ${alreadyUsing ? "cursor-default bg-heritage-cream/20" : "cursor-pointer"}`}>
                  <input type="checkbox" checked={checked} disabled={alreadyUsing} onChange={() => { if (alreadyUsing) return; setSelectedOccurrenceTokens((current) => { const next = new Set(current); if (next.has(token)) next.delete(token); else next.add(token); return next; }); }} className="mt-0.5 size-4 shrink-0 accent-heritage-green disabled:cursor-default disabled:opacity-70" />
                  <span className="min-w-0 break-words">
                    <span className="font-bold text-heritage-green">{occurrence.label}</span>
                    {alreadyUsing && <span className="mt-0.5 block text-xs font-semibold text-heritage-ink/60">Using this design</span>}
                    {!alreadyUsing && occurrence.assignmentLabel && <span className="mt-0.5 block text-xs text-heritage-ink/60">Current design: {occurrence.assignmentLabel}</span>}
                    {willReplace && <span role="status" data-testid="design-style-replacement-warning" data-occurrence-token={token} className="mt-2 block rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs leading-relaxed text-amber-900">This garment currently uses {occurrence.assignmentLabel}. Applying {pendingDisplayStyleName} will replace it.</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {allCurrentOccurrencesUsePendingEntry && onAddAdditionalGarment && additionalGarmentOptions.length > 0 && <section className="mt-4 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4" data-testid="design-reuse-add-another-garment"><p className="font-serif text-base font-bold text-heritage-green">Want to use this design for another garment?</p><button type="button" onClick={() => { mappingScrollTopRef.current = dialogContentRef.current?.scrollTop || 0; setDialogView("add_garment"); }} aria-label="Add another garment to use this design" className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/30 bg-white px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><Plus aria-hidden="true" size={15} />Add Another Garment</button></section>}
          {mismatchOccurrences.length > 0 && <div role="status" data-testid="reference-composition-warning" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">This design was originally created for {pendingEntry.referenceGarmentTypes.map(getFabricGarmentLabel).join(" + ")}. It may need adaptation for {mismatchOccurrences.map((occurrence) => occurrence.label).join(" + ")}, but you can still apply it.</div>}
          </> : <section data-testid="design-reuse-add-garment-options"><p className="text-xs leading-relaxed text-heritage-ink/70">These are the same customer-selectable Step 1 garment types. A new exact physical occurrence is created only after its Fabric selection is confirmed.</p><div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 max-[340px]:grid-cols-1 sm:grid-cols-3">{additionalGarmentOptions.map(({ garmentType, construction }, index) => { const label = getGarmentTypeStepLabel(garmentType); const isReady = construction.status === "resolved"; const referenceImage = isStep1GarmentReferenceType(garmentType) ? getStep1GarmentReferenceImage(garmentType) : null; return <article key={garmentType} data-testid={`design-reuse-add-garment-card-${garmentType}`} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-heritage-gold/20 bg-white"><Step1GarmentReferencePhoto src={referenceImage?.src || null} alt={getStep1GarmentReferenceAlt(label)} eager={index < 3} /><div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-3"><div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1"><h3 className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">{label}</h3><p className="shrink-0 font-mono text-sm font-bold text-heritage-green">{isReady ? `${PRICING_CURRENCY_SYMBOL}${construction.totalPrice.toFixed(2)}` : "Pending"}</p></div><button type="button" disabled={!isReady || reuseFabricPending} aria-label={`Add ${label} to use this design`} onClick={(event) => onAddAdditionalGarment?.(garmentType, event.currentTarget, { origin: "design_style_reuse", styleId: pendingEntry.style.id })} className="mt-2.5 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-heritage-green bg-heritage-cream px-2 text-[11px] font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"><Plus aria-hidden="true" size={14} />Add</button>{!isReady && <p className="mt-2 text-[11px] font-semibold text-amber-800">Construction pricing needs review.</p>}</div></article>; })}</div></section>}
        </div>
        <footer className="flex flex-col gap-2 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" onClick={closeDialog} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Cancel</button>
          {dialogView === "add_garment" ? <button type="button" onClick={returnToMappingDialog} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Back to Design</button> : <button type="button" onClick={applyMapping} disabled={!canApplyMapping} data-testid="apply-design-mapping" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">{applyMappingLabel}</button>}
        </footer>
      </div>
    </div>
  ) : null;

  const detailsDialog = detailsEntry ? (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/45 p-3 sm:items-center sm:p-6" onClick={closeDetails}>
      <div ref={detailsDialogRef} role="dialog" aria-modal="true" aria-labelledby="design-style-details-title" tabIndex={-1} data-testid="design-style-details-dialog" onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl">
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Design style details</p>
            <h2 id="design-style-details-title" className="mt-1 break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl">{formatDisplayStyleLabel(detailsEntry.style)}</h2>
          </div>
          <button ref={detailsCloseRef} type="button" onClick={closeDetails} aria-label="Close Design Style details" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
          {detailsEntry.style.image && <img src={detailsEntry.style.image} alt={`${formatDisplayStyleLabel(detailsEntry.style)} design`} className="max-h-80 w-full rounded-2xl bg-heritage-cream/35 object-contain" referrerPolicy="no-referrer" />}
          {detailsEntry.style.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-heritage-ink/75">{detailsEntry.style.description}</p>}
          {detailsEntry.referenceGarmentTypes.length > 0 && <p className="mt-4 rounded-xl bg-heritage-cream/45 px-3 py-2 text-xs leading-relaxed text-heritage-ink/70"><span className="font-bold text-heritage-green">Originally designed for:</span> {formatReferenceGarmentTypes(detailsEntry.referenceGarmentTypes)}</p>}
        </div>
        <footer className="flex flex-col gap-2 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
          <button type="button" onClick={closeDetails} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Close</button>
          <button type="button" disabled={!mutationsEnabled} onClick={chooseStyleFromDetails} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Choose this style</button>
        </footer>
      </div>
    </div>
  ) : null;

  return (
    <>
      <section aria-labelledby="future-design-style-title" data-stage-id="design_style" data-stage-complete={exactSetComplete} className={`min-w-0 space-y-6 font-sans [overflow-wrap:anywhere] ${exactSetComplete ? "pb-28 sm:pb-32" : ""}`}>
        <p className="sr-only" aria-live="polite">
          {highlightedOccurrence
            ? `Design assigned to ${highlightedOccurrence.label}.`
            : ""}
        </p>
        <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
          <DesignStudioBackButton destination="Fabric" onClick={onBack} className="mb-5" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Step 3 of 9</p>
          <h2 id="future-design-style-title" className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl">Design Style</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">Choose a design reference for your garments. Your garments and Fabric selections remain unchanged.</p>
          <div aria-live="polite" data-testid="step3-assignment-progress" className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-heritage-gold/25 bg-heritage-cream/30 px-3 py-1.5 text-xs font-bold text-heritage-green">{exactSetComplete && <Check aria-hidden="true" size={14} />}<span>{completedCount} of {totalCount} garment{totalCount === 1 ? "" : "s"} assigned</span></div>
          {reviewMessage && <div role="alert" data-testid="step3-migration-review" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Review your Design Style choices</p><p className="mt-1 text-xs leading-relaxed">{reviewMessage}</p></div>}
          {mutationError && <div role="alert" className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{mutationError}</div>}
          {runtimeStatus === "hydrating" && !draftHydrationFailed && <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">Restoring your Design Style choices...</div>}
          {draftHydrationFailed && <div role="alert" data-testid="step3-draft-hydration-failed" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">We could not restore your saved Design Style choices. Reload and try again; your saved draft was not replaced.</div>}
          {runtimeStatus === "blocked" && <div role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900">Your saved Design Style choices cannot be changed safely here. Nothing has been overwritten.</div>}
          {(isCatalogueLoading || runtimeStatus === "loading") && <div role="status" className="mt-5 rounded-2xl border border-dashed border-heritage-gold/30 p-5 text-sm text-heritage-ink/70">Loading catalogue designs. Your saved assignments are preserved.</div>}
          {runtimeStatus === "error" && <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">The Design Style catalogue is temporarily unavailable. Your saved assignments are preserved.</div>}

          {occurrences.length > 0 && (
            <section aria-labelledby="current-design-mappings-title" className="mt-5">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h3 id="current-design-mappings-title" className="font-serif text-lg font-bold text-heritage-green">Your Garments</h3>
                {occurrences.some((occurrence) => occurrence.assignment) && onClearAllAssignments && <button type="button" onClick={onClearAllAssignments} disabled={!mutationsEnabled} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Clear All</button>}
              </div>
              <div role="list" className="mt-2 divide-y divide-heritage-green/10 overflow-hidden rounded-xl border border-heritage-green/15 bg-white">
                {occurrences.map((occurrence) => {
                  const isAssignmentFeedbackTarget =
                    highlightedOccurrenceToken ===
                    occurrence.target.occurrenceToken;
                  const occurrenceClearRequest = clearRequests.find((request) => designStyleStepTargetsEqual(request.target, occurrence.target)) || (designStyleStepTargetsEqual(occurrence.target, activeOccurrenceTarget) ? clearRequest : null);
                  const selectedDesignImage =
                    occurrence.assignmentImage ||
                    selectedDesignPreviewByOccurrenceToken[
                      occurrence.target.occurrenceToken
                    ] ||
                    null;
                  return (
                    <article
                      key={occurrence.target.occurrenceToken}
                      ref={(element) => {
                        const token = occurrence.target.occurrenceToken;
                        if (element) garmentCardRefs.current.set(token, element);
                        else garmentCardRefs.current.delete(token);
                      }}
                      role="listitem"
                      tabIndex={isAssignmentFeedbackTarget ? -1 : undefined}
                      data-occurrence-label={occurrence.label}
                      data-occurrence-token={occurrence.target.occurrenceToken}
                      data-design-assignment-feedback={
                        isAssignmentFeedbackTarget ? "true" : undefined
                      }
                      className={`flex min-w-0 flex-col gap-2 border-l-2 px-3 py-2.5 ${
                        highlightPrefersReducedMotion
                          ? ""
                          : "transition-[background-color,border-color,box-shadow] duration-200"
                      } sm:flex-row sm:items-center sm:gap-4 ${
                        isAssignmentFeedbackTarget
                          ? "border-l-heritage-gold bg-heritage-cream/30 ring-2 ring-inset ring-heritage-gold/70"
                          : "border-transparent bg-white"
                      }`}
                    >
                      {occurrence.assignment && selectedDesignImage ? <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-heritage-gold/20 bg-heritage-cream/35 sm:h-20 sm:w-20" data-selected-design-preview="true"><img src={selectedDesignImage} alt={`${occurrence.assignmentLabel || "Selected"} design for ${occurrence.label}`} className="h-full w-full object-contain" referrerPolicy="no-referrer" /></div> : null}
                      <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(6rem,0.35fr)_minmax(0,1fr)] sm:items-baseline sm:gap-x-4">
                        <p className="font-serif text-sm font-bold text-heritage-green">{occurrence.label}</p>
                        <p className="break-words text-xs leading-relaxed text-heritage-ink/70"><span className="font-semibold text-heritage-green">{occurrence.assignmentLabel || "No design selected"}</span></p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 sm:self-center">
                        <button type="button" onClick={() => { onSelectOccurrence(occurrence.target); allDesignsRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-heritage-green/25 px-3 text-xs font-bold text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">{occurrence.assignment ? "Change" : "Choose Design"}</button>
                        {occurrence.assignment && occurrenceClearRequest && <button type="button" onClick={() => onClearAssignment(occurrenceClearRequest)} aria-label={occurrence.assignment.sourceKind === "uploaded" ? `Remove uploaded design from ${occurrence.label}` : `Clear design for ${occurrence.label}`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">{occurrence.assignment.sourceKind === "uploaded" ? `Remove uploaded design from ${occurrence.label}` : "Clear"}</button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {showCatalogue && catalogueEntries.length === 0 && <div role="status" data-testid="step3-zero-selectable" className="mt-7 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"><p className="font-bold text-heritage-green">No published Design Styles are currently available.</p><button type="button" onClick={onReturnToGarmentType} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green">Return to Garment Type</button></div>}

          {activeOccurrence && (
            <section aria-labelledby="upload-own-design-title" data-testid="step3-upload-own-design" className="mt-7 rounded-2xl border border-heritage-green/15 bg-heritage-green/5 p-4 sm:p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Option 1</p>
              <h3 id="upload-own-design-title" className="mt-1 font-serif text-xl font-bold text-heritage-green">Upload your own design</h3>
              <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">Already have a design in mind? Upload your image and use it for your selected garments.</p>
              <p className="mt-3 text-xs text-heritage-ink/65">Currently choosing for: <span className="font-bold text-heritage-green">{activeOccurrence.label}</span>.</p>
              {activeOccurrence.assignment?.sourceKind === "uploaded" && uploadState.previewUrl && <img src={uploadState.previewUrl} alt={`Uploaded design preview for ${activeOccurrence.label}`} className="mt-3 max-h-72 w-full rounded-xl border border-heritage-gold/20 bg-white object-contain" />}
              {activeOccurrence.assignment?.sourceKind === "uploaded" && <p className="mt-3 text-xs leading-relaxed text-heritage-ink/65">Removing this assignment keeps the uploaded source available for any other garment that uses it.</p>}
              {renderUploadControl(activeOccurrence.assignment?.sourceKind === "uploaded")}
            </section>
          )}

          {showCatalogue && catalogueEntries.length > 0 && (
            <section ref={allDesignsRef} data-testid="step3-all-designs" className="mt-8 min-w-0 scroll-mt-24">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Option 2</p>
              <h3 className="mt-1 font-serif text-xl font-bold text-heritage-green">Choose design styles you like</h3>
              <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">Browse our design styles and choose the ones you want to use for your garments.</p>
              <div className="mt-4 grid min-w-0 grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {catalogueEntries.map((entry) => {
                  const displayStyleName = formatDisplayStyleLabel(entry.style);
                  return (
                   <article key={entry.style.id} data-style-card="true" data-style-name={entry.style.name} className="relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-heritage-gold/60 hover:shadow-md">
                    <button type="button" disabled={!mutationsEnabled} onClick={(event) => openDialog(entry, event.currentTarget)} aria-label={`Select ${displayStyleName}`} className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-heritage-gold disabled:cursor-not-allowed" />
                    <div className="pointer-events-none relative z-[1] aspect-[4/3] overflow-hidden bg-heritage-cream/35">
                      {entry.style.image ? <img src={entry.style.image} alt={`${displayStyleName} design`} loading="lazy" className="h-full w-full object-contain" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center px-4 text-center text-xs text-heritage-ink/45">Image unavailable</div>}
                      {entry.selectedOccurrenceLabels.length > 0 && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-heritage-gold px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm"><Check aria-hidden="true" size={14} />IN USE</span>}
                    </div>
                     <div data-testid="design-style-card-content" className="pointer-events-none relative z-[1] flex min-w-0 flex-1 flex-col p-3 sm:p-4">
                       <div data-testid="design-style-card-title-zone" className="min-h-[2.75rem]">
                         <h4 className="break-words font-serif text-base font-bold leading-snug text-heritage-green line-clamp-2">{displayStyleName}</h4>
                       </div>
                       <div className="mt-1 min-h-4">
                         {entry.selectedOccurrenceLabels.length > 0 && <p title={`Applied to ${entry.selectedOccurrenceLabels.join(", ")}`} className="break-words text-[11px] leading-4 text-heritage-ink/60 line-clamp-1">Applied to {entry.selectedOccurrenceLabels.join(", ")}</p>}
                       </div>
                       <div data-testid="design-style-card-description-zone" className="mt-2 min-h-[2.5rem]">
                         {entry.style.description && <p data-testid="design-style-description-preview" className="break-words text-xs leading-relaxed text-heritage-ink/65 line-clamp-2">{entry.style.description}</p>}
                       </div>
                       <button type="button" onClick={(event) => { event.stopPropagation?.(); openDetails(entry, event.currentTarget); }} aria-label={`Read more about ${displayStyleName}`} className="pointer-events-auto relative z-[2] mt-2 inline-flex w-fit min-h-9 items-center text-xs font-bold text-heritage-green underline decoration-heritage-gold/70 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Read more</button>
                       <div data-testid="design-style-card-cta-zone" className="pointer-events-auto relative z-[2] mt-auto pt-3">
                         <button type="button" disabled={!mutationsEnabled} onClick={(event) => { event.stopPropagation?.(); openDialog(entry, event.currentTarget); }} aria-label={`${entry.selectedOccurrenceLabels.length > 0 ? "Use Again" : "Use This Design"} ${displayStyleName}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-heritage-ink/45">{entry.selectedOccurrenceLabels.length > 0 ? "Use Again" : "Use This Design"}</button>
                       </div>
                     </div>
                  </article>
                );})}
              </div>
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
      {detailsDialog ? (typeof document !== "undefined" && document.body ? createPortal(detailsDialog, document.body) : detailsDialog) : null}
    </>
  );
};
