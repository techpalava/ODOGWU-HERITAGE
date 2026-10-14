import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );

export const IndividualOrderStartDialog = ({
  unfinishedOrderLabel,
  canResume,
  busy,
  onResume,
  onStartNew,
  onCancel,
}: {
  unfinishedOrderLabel: string;
  canResume: boolean;
  busy: boolean;
  onResume: () => void;
  onStartNew: () => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const resumeRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.getElementById("root") as
      | (HTMLElement & { inert?: boolean })
      | null;
    const previousOverflow = document.body.style.overflow;
    const previousRootInert = root?.inert;
    const previousRootAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    document.body.style.overflow = "hidden";
    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    (canResume ? resumeRef.current : cancelRef.current)?.focus({
      preventScroll: true,
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!root) return;
      root.inert = previousRootInert ?? false;
      if (previousRootAriaHidden === null) root.removeAttribute("aria-hidden");
      else root.setAttribute("aria-hidden", previousRootAriaHidden);
    };
  }, [canResume]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-individual-order-start-backdrop="true"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel starting a new Individual Order"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className="relative z-[101] flex max-h-[min(92dvh,42rem)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl outline-none sm:rounded-3xl"
        data-individual-order-start-dialog="true"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Unfinished order
            </p>
            <h2
              id={titleId}
              className="mt-1 break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              Start a new Individual Order?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onCancel();
            }}
            disabled={busy}
            aria-label="Cancel starting a new Individual Order"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/70 p-4">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={20}
            />
            <p
              id={descriptionId}
              className="min-w-0 break-words text-sm leading-relaxed text-heritage-ink/85"
            >
              You already have an unfinished order: {unfinishedOrderLabel}. Starting
              a new Individual Order begins at Step 1 and replaces that draft only
              after you confirm. Resume keeps the saved order. Cancel leaves it
              unchanged.
            </p>
          </div>
          {!canResume && (
            <p className="mt-4 break-words text-sm leading-relaxed text-heritage-ink/70">
              This saved order cannot be reopened from here. You can still start a
              new Individual Order, which replaces it, or cancel to leave it unchanged.
            </p>
          )}
        </div>
        <footer className="grid min-w-0 grid-cols-1 gap-3 border-t border-heritage-gold/20 bg-white px-4 py-4 sm:px-6">
          {canResume && (
            <button
              ref={resumeRef}
              type="button"
              onClick={() => {
                if (!busy) onResume();
              }}
              disabled={busy}
              data-individual-order-resume="true"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Resume unfinished order
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!busy) onStartNew();
            }}
            disabled={busy}
            data-individual-order-start-fresh="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-gold px-4 text-sm font-bold text-heritage-forest transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Start new Individual Order
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              if (!busy) onCancel();
            }}
            disabled={busy}
            data-individual-order-cancel="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/20 px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
