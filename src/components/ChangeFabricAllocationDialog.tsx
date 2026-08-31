import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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

export const ChangeFabricAllocationDialog = ({
  fabricSelectionNumber,
  currentFabricName,
  nextFabricName,
  garmentLabels,
  isSharedGroup,
  onConfirm,
  onCancel,
}: {
  fabricSelectionNumber: number;
  currentFabricName: string;
  nextFabricName: string;
  garmentLabels: readonly string[];
  isSharedGroup: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

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
    confirmRef.current?.focus?.();
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
        data-testid="change-fabric-allocation-dialog"
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              Change Fabric for this group?
            </h2>
            <p
              id={descriptionId}
              className="mt-2 break-words text-sm leading-relaxed text-heritage-ink/70"
            >
              {isSharedGroup
                ? "This changes the Fabric for every garment listed below because they share one physical Fabric."
                : "This changes the Fabric for the selected garment assignment."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel fabric change"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green transition hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="min-w-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
            Fabric Selection {fabricSelectionNumber}
          </p>
          <dl className="grid min-w-0 gap-3 text-sm">
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-heritage-ink/55">
                Current Fabric
              </dt>
              <dd className="mt-1 break-words font-semibold text-heritage-green">
                {currentFabricName}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-heritage-ink/55">
                New Fabric
              </dt>
              <dd className="mt-1 break-words font-semibold text-heritage-green">
                {nextFabricName}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-heritage-ink/55">
                Garments
              </dt>
              <dd className="mt-1">
                <ul className="list-disc space-y-1 break-words pl-5 text-heritage-ink/80">
                  {garmentLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>
        <footer className="flex min-w-0 flex-col gap-3 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:px-5">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            data-change-fabric-confirm="true"
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Change Fabric
          </button>
          <button
            type="button"
            onClick={onCancel}
            data-change-fabric-cancel="true"
            className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Cancel
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }
  return createPortal(dialog, document.body);
};
