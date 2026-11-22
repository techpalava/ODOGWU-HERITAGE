import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );

export const GalleryLookReplaceDialog = ({
  lookTitle,
  busy,
  onReplace,
  onKeep,
}: {
  lookTitle: string;
  busy: boolean;
  onReplace: () => void;
  onKeep: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const replaceRef = useRef<HTMLButtonElement | null>(null);

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
    replaceRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!root) return;
      root.inert = previousRootInert ?? false;
      if (previousRootAriaHidden === null) root.removeAttribute("aria-hidden");
      else root.setAttribute("aria-hidden", previousRootAriaHidden);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onKeep();
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
  }, [busy, onKeep]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-gallery-look-replace-backdrop="true"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Keep my order"
        disabled={busy}
        onClick={() => {
          if (!busy) onKeep();
        }}
        className="absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative z-[1] flex max-h-[90vh] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6">
          <h2
            id={titleId}
            className="mt-1 break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
          >
            Replace your current order with this look?
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!busy) onKeep();
            }}
            disabled={busy}
            aria-label="Keep my order"
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
              {lookTitle} will replace your unfinished order. Keep my order
              leaves that order unchanged.
            </p>
          </div>
        </div>
        <footer className="grid min-w-0 grid-cols-1 gap-3 border-t border-heritage-gold/20 bg-white px-4 py-4 sm:px-6">
          <button
            ref={replaceRef}
            type="button"
            onClick={() => {
              if (!busy) onReplace();
            }}
            disabled={busy}
            data-gallery-look-replace="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-gold px-4 text-sm font-bold text-heritage-forest transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => {
              if (!busy) onKeep();
            }}
            disabled={busy}
            data-gallery-look-keep="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Keep my order
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
