import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Fabric } from "../types";
import {
  REMOVE_FABRIC_ASSIGNMENT_DESCRIPTION,
  REMOVE_FABRIC_ASSIGNMENT_TITLE,
} from "../utils/designStudioFutureFabricStage";

export interface RemoveFabricAssignmentTarget {
  garmentKey: string;
  label: string;
}

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

export const RemoveFabricAssignmentDialog = ({
  fabric,
  targets,
  onRemoveGarmentKey,
  onCancel,
}: {
  fabric: Fabric;
  targets: readonly RemoveFabricAssignmentTarget[];
  onRemoveGarmentKey: (garmentKey: string) => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body?.style) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    const node = initialFocusRef.current || dialog;
    node?.focus?.();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
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
  }, [onCancel]);

  const dialog = (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="remove-fabric-assignment-dialog"
        data-remove-fabric-assignment-code={fabric.code}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              {REMOVE_FABRIC_ASSIGNMENT_TITLE}
            </h2>
            <p className="mt-2 break-words font-serif text-sm font-semibold text-heritage-green">
              {fabric.name}
            </p>
            <p className="mt-1 break-words font-mono text-[10px] text-heritage-ink/55">
              {fabric.code}
            </p>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {REMOVE_FABRIC_ASSIGNMENT_DESCRIPTION}
            </p>
          </div>
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onCancel}
            aria-label="Close remove fabric assignment"
            data-remove-fabric-assignment-close="true"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          <ul className="space-y-2">
            {targets.map((target) => (
              <li
                key={target.garmentKey}
                className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-heritage-gold/20 bg-heritage-cream/25 px-3 py-3"
                data-remove-fabric-assignment-row={target.garmentKey}
              >
                <span className="min-w-0 break-words text-sm font-semibold text-heritage-ink">
                  {target.label}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveGarmentKey(target.garmentKey)}
                  aria-label={`Remove ${target.label}`}
                  data-remove-fabric-assignment-garment-key={target.garmentKey}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-xs font-bold uppercase tracking-wider text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-heritage-gold/20 px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            data-remove-fabric-assignment-cancel="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
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
