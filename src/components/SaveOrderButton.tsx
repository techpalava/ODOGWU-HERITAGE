import { Bookmark } from "lucide-react";
import {
  useSaveOrderAction,
  type SaveOrderFocusTarget,
} from "./SaveOrderActionContext";

const saveOrderStepRowClass =
  "inline-flex min-h-12 max-w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-bold leading-tight sm:gap-2 sm:px-3 sm:text-xs [overflow-wrap:normal] [word-break:normal] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 group border-2 border-heritage-green/75 bg-white text-heritage-ink shadow-sm enabled:hover:border-heritage-green enabled:hover:bg-heritage-green enabled:hover:text-white focus-visible:border-heritage-green focus-visible:bg-heritage-green focus-visible:text-white disabled:cursor-not-allowed disabled:border-heritage-ink/20 disabled:bg-heritage-cream/50 disabled:text-heritage-ink/45 disabled:shadow-none min-w-0 flex-1 basis-0 sm:max-w-xs";

const captureFocus = (): SaveOrderFocusTarget => ({
  element:
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  scrollY: typeof window === "undefined" ? 0 : Math.round(window.scrollY),
});

export const SaveOrderButton = ({
  className = "",
  variant = "step-row",
}: {
  className?: string;
  variant?: "step-row" | "payment-panel";
}) => {
  const action = useSaveOrderAction();
  if (!action) return null;
  const { disabled, disabledReason, busy, onSave } = action;
  const label = busy ? "Saving…" : "Save Order";
  const describedBy = disabled && disabledReason ? "save-order-disabled-reason" : undefined;

  if (variant === "payment-panel") {
    return (
      <button
        type="button"
        data-testid="save-order-button"
        data-studio-nav="save-order"
        disabled={disabled || busy}
        aria-label={disabledReason || label}
        aria-describedby={describedBy}
        title={disabledReason || undefined}
        onClick={() => onSave(captureFocus())}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-heritage-gold/50 bg-heritage-forest px-5 py-2 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-gold hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 focus-visible:ring-offset-heritage-green disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${className}`}
      >
        <Bookmark aria-hidden="true" size={14} />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="save-order-button"
      data-studio-nav="save-order"
      disabled={disabled || busy}
      aria-label={disabledReason || "Save Order"}
      aria-describedby={describedBy}
      title={disabledReason || undefined}
      onClick={() => onSave(captureFocus())}
      className={`${saveOrderStepRowClass} ${className}`}
    >
      <Bookmark aria-hidden="true" size={16} className="shrink-0" />
      <span
        data-studio-nav-label="stack"
        className="flex min-w-0 flex-1 flex-col items-center justify-center text-center leading-none"
      >
        <span className="max-w-full truncate uppercase tracking-wide">{label}</span>
      </span>
    </button>
  );
};

export const SaveOrderDisabledReason = () => {
  const action = useSaveOrderAction();
  if (!action?.disabled || !action.disabledReason) return null;
  return (
    <p
      id="save-order-disabled-reason"
      data-testid="save-order-disabled-reason"
      className="text-[11px] font-medium text-heritage-ink/70"
    >
      {action.disabledReason}
    </p>
  );
};
