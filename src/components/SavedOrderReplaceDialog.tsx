import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export const SavedOrderReplaceDialog = ({
  open,
  busy = false,
  unfinishedOrderLabel,
  onSaveCurrentFirst,
  onReplace,
  onCancel,
}: {
  open: boolean;
  busy?: boolean;
  unfinishedOrderLabel: string;
  onSaveCurrentFirst: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const saveFirstRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    saveFirstRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-testid="saved-order-replace-dialog"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cancel"
        className="absolute inset-0 cursor-default"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-[101] w-full min-w-0 max-w-xl overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Unfinished order
            </p>
            <h2
              id={titleId}
              className="mt-1 font-serif text-xl font-bold text-heritage-green"
            >
              Continue this saved order?
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cancel"
            disabled={busy}
            onClick={() => {
              if (!busy) onCancel();
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="px-4 py-5 sm:px-6">
          <div className="flex items-start gap-3 rounded-2xl border border-heritage-gold/30 bg-heritage-cream/70 p-4">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={20}
            />
            <p
              id={descriptionId}
              className="text-sm leading-relaxed text-heritage-ink/85"
            >
              You already have an unfinished order: {unfinishedOrderLabel}. Save
              it first, replace it with this saved order, or cancel.
            </p>
          </div>
        </div>
        <footer className="grid grid-cols-1 gap-3 border-t border-heritage-gold/20 px-4 py-4 sm:px-6">
          <button
            ref={saveFirstRef}
            type="button"
            data-testid="saved-order-replace-save-current"
            disabled={busy}
            onClick={onSaveCurrentFirst}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-sm font-bold text-white"
          >
            Save current order first
          </button>
          <button
            type="button"
            data-testid="saved-order-replace-current"
            disabled={busy}
            onClick={onReplace}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green"
          >
            Replace current order
          </button>
          <button
            type="button"
            data-testid="saved-order-replace-cancel"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-heritage-green/20 px-4 text-sm font-bold text-heritage-green"
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
