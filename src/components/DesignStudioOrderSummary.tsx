import { useEffect, useId, useRef, type KeyboardEvent, type Ref } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import type { DesignStudioStageId } from "../types";
import type {
  LiveOrderSummarySection,
  LiveOrderSummaryView,
} from "../utils/designStudioLiveOrderSummary";

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

const isPendingLine = (label: string): boolean =>
  label === "Not selected yet" ||
  label === "Not completed yet" ||
  label === "Pending" ||
  label.includes("remaining") ||
  label.includes("Incomplete");

const SummarySections = ({
  view,
  headingId,
  unlockedStages,
  currentStageId,
  onEditStage,
}: {
  view: LiveOrderSummaryView;
  headingId: string;
  unlockedStages: ReadonlySet<DesignStudioStageId>;
  currentStageId: DesignStudioStageId | null;
  onEditStage?: (stage: DesignStudioStageId) => void;
}) => (
  <div className="min-w-0">
    <h2
      id={headingId}
      className="font-serif text-xl font-bold text-heritage-green"
    >
      Your Order Summary
    </h2>
    <div className="mt-4 space-y-4">
      {view.sections.map((section) => (
        <SummarySection
          key={section.id}
          section={section}
          canEdit={Boolean(
            section.editStage &&
              unlockedStages.has(section.editStage) &&
              section.editStage !== currentStageId &&
              onEditStage,
          )}
          onEdit={
            section.editStage && onEditStage
              ? () => onEditStage(section.editStage as DesignStudioStageId)
              : undefined
          }
        />
      ))}
    </div>
    <div
      className="mt-5 border-t border-heritage-gold/30 pt-4"
      data-testid="live-order-summary-total"
      data-total-status={view.totalStatus}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
        {view.totalLabel}
      </p>
      <p
        className="mt-1 break-words font-serif text-2xl font-bold text-heritage-green"
        data-testid="live-order-summary-total-value"
      >
        {view.totalValueLabel}
      </p>
      {view.quoteRequired ? (
        <p className="mt-2 text-xs leading-relaxed text-heritage-ink/65">
          A custom shipping quote is required before the final payable total
          can be confirmed.
        </p>
      ) : null}
    </div>
  </div>
);

const SummarySection = ({
  section,
  canEdit,
  onEdit,
}: {
  section: LiveOrderSummarySection;
  canEdit: boolean;
  onEdit?: () => void;
}) => (
  <section
    data-testid={`live-order-summary-section-${section.id}`}
    className="min-w-0"
  >
    <div className="flex min-w-0 items-start justify-between gap-2">
      <h3 className="min-w-0 break-words text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
        {section.title}
      </h3>
      {canEdit && onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${section.title}`}
          data-testid={`live-order-summary-edit-${section.id}`}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <Pencil aria-hidden="true" size={11} />
          Edit
        </button>
      ) : null}
    </div>
    <ul className="mt-2 space-y-1.5">
      {section.lines.map((line) => {
        const pending = isPendingLine(line.label) || isPendingLine(line.detail || "");
        return (
          <li
            key={line.id}
            data-line-id={line.id}
            className="flex min-w-0 items-start justify-between gap-2 text-sm"
          >
            <div className="min-w-0">
              <p
                className={`break-words font-semibold ${
                  pending ? "text-heritage-ink/45" : "text-heritage-ink"
                }`}
              >
                {line.label}
              </p>
              {line.detail ? (
                <p
                  className={`mt-0.5 break-words text-xs ${
                    pending ? "text-heritage-ink/40" : "text-heritage-ink/65"
                  }`}
                >
                  {line.detail}
                </p>
              ) : null}
            </div>
            {line.amountLabel ? (
              <span className="shrink-0 font-mono text-xs font-bold text-heritage-green">
                {line.amountLabel}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  </section>
);

export const DesignStudioOrderSummary = ({
  view,
  variant,
  unlockedStages,
  currentStageId = null,
  onEditStage,
  onClose,
}: {
  view: LiveOrderSummaryView;
  variant: "sidebar" | "drawer";
  unlockedStages: ReadonlySet<DesignStudioStageId>;
  currentStageId?: DesignStudioStageId | null;
  onEditStage?: (stage: DesignStudioStageId) => void;
  onClose?: () => void;
}) => {
  const headingId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (variant !== "drawer") return;
    if (typeof document === "undefined" || !document.body?.style) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus?.({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [variant]);

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
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

  const body = (
    <SummarySections
      view={view}
      headingId={headingId}
      unlockedStages={unlockedStages}
      currentStageId={currentStageId}
      onEditStage={onEditStage}
    />
  );

  if (variant === "sidebar") {
    return (
      <aside
        aria-labelledby={headingId}
        data-testid="live-order-summary-sidebar"
        className="min-w-0 rounded-2xl border border-heritage-gold/25 bg-white p-4 shadow-sm sm:p-5"
      >
        {body}
      </aside>
    );
  }

  const dialog = (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        data-testid="live-order-summary-drawer"
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4">
          <p id={descriptionId} className="sr-only">
            Review the current order selections and total. Close to return to
            the current Design Studio step.
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close order summary"
            data-testid="live-order-summary-drawer-close"
            className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div
          data-testid="live-order-summary-drawer-scroll"
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4"
        >
          {body}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" && document.body
    ? createPortal(dialog, document.body)
    : dialog;
};

export const DesignStudioOrderSummaryTrigger = ({
  totalLabel = "Your Order Summary",
  totalValueLabel,
  onOpen,
  openButtonRef,
}: {
  totalLabel?: string;
  totalValueLabel: string;
  onOpen: () => void;
  openButtonRef?: Ref<HTMLButtonElement>;
}) => (
  <div
    data-testid="live-order-summary-trigger"
    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-heritage-gold/25 bg-white px-4 py-3 shadow-sm"
  >
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
        Your Order Summary
      </p>
      <p
        className="mt-1 text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55"
        data-testid="live-order-summary-trigger-label"
      >
        {totalLabel}
      </p>
      <p
        className="mt-0.5 truncate font-serif text-lg font-bold text-heritage-green"
        data-testid="live-order-summary-trigger-total"
      >
        {totalValueLabel}
      </p>
    </div>
    <button
      ref={openButtonRef}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      data-testid="live-order-summary-view-order"
      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
    >
      View Order
    </button>
  </div>
);
