import { useLayoutEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keyboard handling for the Save Order dialogs: Escape runs the dialog's
 * Cancel/Close action, and Tab / Shift+Tab cycle inside the dialog. Attach to
 * the dialog's root element (focus starts inside it and the trap keeps it
 * there, so the root always receives the key events).
 */
export const handleSavedOrderDialogKeyDown = (
  event: ReactKeyboardEvent<HTMLElement>,
  { onEscape, escapeDisabled = false }: { onEscape: () => void; escapeDisabled?: boolean },
) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (!escapeDisabled) onEscape();
    return;
  }
  if (event.key !== "Tab") return;
  const root = event.currentTarget;
  if (!root || typeof root.querySelectorAll !== "function") return;
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.tabIndex !== -1);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = typeof document === "undefined" ? null : document.activeElement;
  const inside = active instanceof HTMLElement && focusable.includes(active);
  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    event.preventDefault();
    first.focus();
  }
};

/**
 * Remembers what had focus when the dialog opened and puts focus back there
 * when it closes (if that element is still on the page).
 */
export const useReturnFocusOnClose = (open: boolean, enabled = true) => {
  useLayoutEffect(() => {
    if (!open || !enabled || typeof document === "undefined") return;
    const opener =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    return () => {
      if (!opener || !opener.isConnected) return;
      const active = document.activeElement;
      // Respect a deliberate focus move made by whoever closed the dialog.
      if (active && active !== document.body && active.isConnected) return;
      opener.focus({ preventScroll: true });
    };
  }, [open, enabled]);
};
