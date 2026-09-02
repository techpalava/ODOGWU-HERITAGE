import { AlertTriangle, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { CanonicalPhysicalGarmentType } from "../types";
import type { PhysicalGarmentOccurrence } from "../utils/designSourceState";

export interface FutureGarmentRemovalTarget {
  garmentKey: string;
  occurrenceLabel: string;
  roleLabel: string;
  presentationOrdinal: number;
  canRequestRemoval: boolean;
  disabledReason: string | null;
  accessibleName: string;
}

export const projectFutureGarmentRemovalTargets = ({
  occurrences,
  provisionalGarmentKey,
}: {
  occurrences: readonly PhysicalGarmentOccurrence[];
  provisionalGarmentKey: string | null;
}): FutureGarmentRemovalTarget[] => {
  const committed = occurrences.filter(
    (occurrence) => occurrence.garmentKey !== provisionalGarmentKey,
  );
  const totalByType = new Map<CanonicalPhysicalGarmentType, number>();
  const roleTotalByType = new Map<string, number>();
  committed.forEach((occurrence) => {
    totalByType.set(
      occurrence.garmentType,
      (totalByType.get(occurrence.garmentType) || 0) + 1,
    );
    const roleIdentity = `${occurrence.garmentType}:${occurrence.sourceRole}`;
    roleTotalByType.set(
      roleIdentity,
      (roleTotalByType.get(roleIdentity) || 0) + 1,
    );
  });
  const seenByType = new Map<CanonicalPhysicalGarmentType, number>();
  const seenByRole = new Map<string, number>();
  const canRequestRemoval = committed.length > 1;

  return committed.map((occurrence) => {
    const presentationOrdinal =
      (seenByType.get(occurrence.garmentType) || 0) + 1;
    seenByType.set(occurrence.garmentType, presentationOrdinal);
    const roleIdentity = `${occurrence.garmentType}:${occurrence.sourceRole}`;
    const roleOrdinal = (seenByRole.get(roleIdentity) || 0) + 1;
    seenByRole.set(roleIdentity, roleOrdinal);
    const roleTotal = roleTotalByType.get(roleIdentity) || 1;
    const roleBase =
      occurrence.sourceRole === "main" ? "base garment" : "additional garment";
    const roleLabel =
      roleTotal > 1 ||
      (occurrence.sourceRole === "additional" &&
        (totalByType.get(occurrence.garmentType) || 0) > 1)
        ? `${roleBase} ${roleOrdinal}`
        : roleBase;
    const occurrenceLabel = getFabricGarmentLabel(occurrence.garmentType);
    return {
      garmentKey: occurrence.garmentKey,
      occurrenceLabel,
      roleLabel,
      presentationOrdinal,
      canRequestRemoval,
      disabledReason: canRequestRemoval
        ? null
        : "At least one garment must remain in your order.",
      accessibleName: `Remove ${occurrenceLabel}, ${roleLabel}`,
    };
  });
};

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

export const FutureGarmentRemovalConfirmationDialog = ({
  target,
  confirming,
  terminalError,
  onCancel,
  onConfirm,
}: {
  target: FutureGarmentRemovalTarget;
  confirming: boolean;
  terminalError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const keepButtonRef = useRef<HTMLButtonElement | null>(null);

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
    keepButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (!root) return;
      root.inert = previousRootInert ?? false;
      if (previousRootAriaHidden === null) {
        root.removeAttribute("aria-hidden");
      } else {
        root.setAttribute("aria-hidden", previousRootAriaHidden);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!confirming) onCancel();
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
  }, [confirming, onCancel]);

  const dialog = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-heritage-ink/50 p-0 sm:items-center sm:p-4"
      data-future-garment-removal-dialog-backdrop="true"
    >
      <button
        type="button"
        aria-label="Keep garment and close confirmation"
        tabIndex={-1}
        disabled={confirming}
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
        data-future-garment-removal-backdrop-cancel="true"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${terminalError ? ` ${errorId}` : ""}`}
        aria-busy={confirming || undefined}
        tabIndex={-1}
        className="relative z-[101] flex max-h-[min(92dvh,42rem)] w-full min-w-0 max-w-xl flex-col overflow-hidden rounded-t-3xl border border-heritage-gold/30 bg-white shadow-2xl outline-none sm:rounded-3xl"
        data-future-garment-removal-dialog="true"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
              Remove garment
            </p>
            <h2
              id={titleId}
              className="mt-1 break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              Remove {target.occurrenceLabel}?
            </h2>
            <p className="mt-1 break-words text-xs font-semibold capitalize text-heritage-ink/55">
              {target.roleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            aria-label={`Keep ${target.occurrenceLabel} and close confirmation`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/65 p-4">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-red-700"
              size={20}
            />
            <p
              id={descriptionId}
              className="min-w-0 break-words text-sm leading-relaxed text-red-950/85"
            >
              This removes only this garment from your order. Its saved Fabric
              assignment, Custom Details and measurements will also be removed.
              Your other garments will remain. You can add this garment again
              later, but its saved details will not be restored.
            </p>
          </div>
          {terminalError && (
            <div
              id={errorId}
              role="alert"
              data-future-garment-removal-error="true"
              className="mt-4 rounded-2xl border border-red-300/70 bg-red-50 p-4 text-sm font-semibold leading-relaxed text-red-900"
            >
              {terminalError}
            </div>
          )}
        </div>

        <footer className="grid min-w-0 grid-cols-1 gap-3 border-t border-heritage-gold/20 bg-white px-4 py-4 sm:grid-cols-2 sm:px-6">
          <button
            ref={keepButtonRef}
            type="button"
            onClick={onCancel}
            disabled={confirming}
            data-future-garment-removal-keep="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Keep Garment
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming || Boolean(terminalError)}
            data-future-garment-removal-confirm="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-red-700 bg-red-700 px-4 text-sm font-bold text-white transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {confirming ? "Removing Garment..." : "Remove Garment"}
          </button>
        </footer>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
};
