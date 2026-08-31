import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FuturePartialFabricAssignmentTargetPresentation } from "../utils/designStudioFutureFabricStage";

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

export const PartialFabricCapacityAssignmentDialog = ({
  garmentLabel,
  fabricNameByCode,
  targets,
  onConfirm,
  onCancel,
}: {
  garmentLabel: string;
  fabricNameByCode: ReadonlyMap<string, string>;
  targets: readonly FuturePartialFabricAssignmentTargetPresentation[];
  onConfirm: (allocationId: string) => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const singleTarget = targets.length === 1 ? targets[0]! : null;
  const singleFabricName =
    singleTarget &&
    (fabricNameByCode.get(singleTarget.fabricCode) || singleTarget.fabricCode);

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
        data-testid="partial-fabric-capacity-assignment-dialog"
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              {singleTarget ? "Complete Fabric Assignment" : `Assign ${garmentLabel} to a Selected Fabric`}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {singleTarget
                ? `Add ${garmentLabel} to an existing Fabric selection with available capacity.`
                : `Choose which selected Fabric should receive ${garmentLabel}.`}
            </p>
          </div>
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onCancel}
            aria-label="Close fabric assignment"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {singleTarget ? (
            <div className="space-y-3 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 p-4">
              <p className="break-words font-serif text-base font-bold text-heritage-green">
                {singleFabricName}
              </p>
              <p className="text-sm text-heritage-ink/75">
                <span className="font-semibold text-heritage-green">
                  Currently assigned:
                </span>{" "}
                {singleTarget.assignedGarmentLabels.join(", ")}
              </p>
              <p className="text-sm text-heritage-ink/75">
                <span className="font-semibold text-heritage-green">Add:</span>{" "}
                {singleTarget.addGarmentLabel}
              </p>
              <p
                className="text-sm font-semibold text-heritage-green"
                data-partial-capacity-progress="true"
              >
                Capacity: {singleTarget.usedUnits}/{singleTarget.usedUnits + singleTarget.remainingUnits} → {singleTarget.projectedUsedUnits}/{singleTarget.usedUnits + singleTarget.remainingUnits}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {targets.map((target) => {
                const fabricName =
                  fabricNameByCode.get(target.fabricCode) || target.fabricCode;
                return (
                  <div
                    key={target.allocationId}
                    className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 p-4"
                    data-partial-allocation-id={target.allocationId}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
                      Fabric Selection {target.fabricSelectionNumber}
                    </p>
                    <p className="mt-1 break-words font-serif text-base font-bold text-heritage-green">
                      {fabricName}
                    </p>
                    <p className="mt-2 text-sm text-heritage-ink/75">
                      Currently: {target.assignedGarmentLabels.join(", ")}
                    </p>
                    <p
                      className="mt-2 text-sm font-semibold text-heritage-green"
                      data-partial-capacity-progress="true"
                    >
                      Capacity: {target.usedUnits}/{target.usedUnits + target.remainingUnits} → {target.projectedUsedUnits}/{target.usedUnits + target.remainingUnits}
                    </p>
                    <button
                      type="button"
                      onClick={() => onConfirm(target.allocationId)}
                      data-testid={`partial-fabric-capacity-select-${target.allocationId}`}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      Select
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {singleTarget ? (
          <div className="flex min-w-0 flex-col gap-3 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <button
              type="button"
              onClick={onCancel}
              data-testid="partial-fabric-capacity-cancel"
              className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(singleTarget.allocationId)}
              data-testid="partial-fabric-capacity-confirm"
              className="min-h-11 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Assign
            </button>
          </div>
        ) : (
          <div className="border-t border-heritage-gold/20 px-4 py-4 sm:px-5">
            <button
              type="button"
              onClick={onCancel}
              data-testid="partial-fabric-capacity-cancel"
              className="min-h-11 w-full rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }
  return createPortal(dialog, document.body);
};
