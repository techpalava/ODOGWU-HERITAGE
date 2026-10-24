import { CheckCircle2, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { handleSavedOrderDialogKeyDown, useReturnFocusOnClose } from "./savedOrderDialogKeyboard";
import { SAVED_STUDIO_ORDER_CONFIRMATION_MESSAGE } from "../utils/savedStudioOrderModel";
import type { SaveOrderFocusTarget } from "./SaveOrderActionContext";

const restoreFocus = (focus: SaveOrderFocusTarget | null) => {
  if (typeof window !== "undefined" && focus) {
    window.scrollTo({ top: focus.scrollY, behavior: "auto" });
  }
  focus?.element?.focus({ preventScroll: true });
};

export const SavedOrderConfirmationDialog = ({
  open,
  busy = false,
  restoreFocusTo,
  onContinue,
  onStartNewOrder,
}: {
  open: boolean;
  busy?: boolean;
  restoreFocusTo: SaveOrderFocusTarget | null;
  onContinue: () => void;
  onStartNewOrder: () => void;
}) => {
  const titleId = useId();
  const continueRef = useRef<HTMLButtonElement | null>(null);

  useReturnFocusOnClose(open);
  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    continueRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const handleContinue = () => {
    onContinue();
    restoreFocus(restoreFocusTo);
  };

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-testid="saved-order-confirmation"
      onKeyDown={(event) =>
        handleSavedOrderDialogKeyDown(event, {
          onEscape: handleContinue,
          escapeDisabled: busy,
        })
      }
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Continue"
        className="absolute inset-0 cursor-default"
        onClick={handleContinue}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[101] w-full min-w-0 max-w-lg overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-green"
              size={22}
            />
            <h2
              id={titleId}
              className="font-serif text-xl font-bold text-heritage-green"
            >
              {SAVED_STUDIO_ORDER_CONFIRMATION_MESSAGE}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Continue"
            onClick={handleContinue}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <footer className="grid grid-cols-1 gap-3 px-4 py-4 sm:px-6">
          <button
            ref={continueRef}
            type="button"
            data-testid="saved-order-confirmation-continue"
            disabled={busy}
            onClick={handleContinue}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-4 text-sm font-bold text-white"
          >
            Continue
          </button>
          <button
            type="button"
            data-testid="saved-order-confirmation-start-new"
            disabled={busy}
            onClick={onStartNewOrder}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green"
          >
            Start a new order
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
