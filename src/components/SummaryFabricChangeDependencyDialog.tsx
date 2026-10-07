import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export const SummaryFabricChangeDependencyDialog = ({
  garmentLabel,
  onCancelChange,
  onChooseNewDesignStyle,
}: {
  garmentLabel: string;
  onCancelChange: () => void;
  onChooseNewDesignStyle: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

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
    cancelButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (root) {
        root.inert = previousRootInert;
        if (previousRootAriaHidden === null) {
          root.removeAttribute("aria-hidden");
        } else {
          root.setAttribute("aria-hidden", previousRootAriaHidden);
        }
      }
    };
  }, []);

  useLayoutEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelChange();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );
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
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancelChange]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-summary-fabric-change-dialog-backdrop="true"
    >
      <button
        type="button"
        aria-label="Cancel fabric change"
        tabIndex={-1}
        onClick={onCancelChange}
        className="absolute inset-0 cursor-default"
        data-summary-fabric-change-backdrop-cancel="true"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-[101] flex max-h-[min(92dvh,42rem)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl outline-none sm:rounded-3xl"
        data-summary-fabric-change-dialog="true"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Change fabric
            </p>
            <h2
              id={titleId}
              className="mt-1 break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              Changing the fabric may require a new design style.
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancelChange}
            aria-label="Cancel fabric change"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={20}
            />
            <p
              id={descriptionId}
              className="min-w-0 break-words text-sm leading-relaxed text-heritage-ink/80"
            >
              Your current design style for {garmentLabel} may not remain valid
              for a different fabric. Continue to choose fabric again, then pick
              a new design style if needed.
            </p>
          </div>
        </div>

        <footer className="grid min-w-0 grid-cols-1 gap-3 border-t border-heritage-gold/20 bg-white px-4 py-4 sm:grid-cols-2 sm:px-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancelChange}
            data-summary-fabric-change-cancel="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Cancel Change
          </button>
          <button
            type="button"
            onClick={onChooseNewDesignStyle}
            data-summary-fabric-change-proceed="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green bg-heritage-green px-4 text-sm font-bold text-white transition hover:bg-heritage-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Choose New Design Style
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
