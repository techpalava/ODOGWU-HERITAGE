import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { handleSavedOrderDialogKeyDown, useReturnFocusOnClose } from "./savedOrderDialogKeyboard";
import {
  SAVED_STUDIO_ORDER_CAP_MESSAGE,
  SAVED_STUDIO_ORDER_DASHBOARD_HASH,
} from "../utils/savedStudioOrderModel";

export const SavedOrderCapDialog = ({
  open,
  onClose,
  onOpenDashboard,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDashboard: () => void;
}) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useReturnFocusOnClose(open);
  useLayoutEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-testid="saved-order-cap-dialog"
      onKeyDown={(event) =>
        handleSavedOrderDialogKeyDown(event, { onEscape: onClose })
      }
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] w-full min-w-0 max-w-lg overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={22}
            />
            <h2
              id={titleId}
              className="font-serif text-xl font-bold text-heritage-green"
            >
              {SAVED_STUDIO_ORDER_CAP_MESSAGE}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="px-4 py-4 sm:px-6">
          <a
            href={`#${SAVED_STUDIO_ORDER_DASHBOARD_HASH}`}
            data-testid="saved-order-cap-dashboard-link"
            className="text-sm font-bold text-heritage-green underline underline-offset-4"
            onClick={(event) => {
              event.preventDefault();
              onOpenDashboard();
            }}
          >
            Open Saved Orders in your dashboard
          </a>
        </div>
        <footer className="px-4 py-4 sm:px-6">
          <button
            ref={closeRef}
            type="button"
            data-testid="saved-order-cap-close"
            onClick={onClose}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/20 px-4 text-sm font-bold text-heritage-green"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
