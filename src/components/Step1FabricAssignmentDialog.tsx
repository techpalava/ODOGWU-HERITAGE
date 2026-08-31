import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Fabric } from "../types";
import { getGarmentTypeStepLabel } from "./GarmentTypeStep";
import { AssignedFabricPreview } from "./AssignedFabricPreview";
import { getFabricAvailabilityMessage } from "../utils/fabricCatalogueAvailability";
import { getFabricStockPresentation } from "../utils/fabricStockPresentation";
import {
  STEP1_FABRIC_ASSIGNMENT_DESCRIPTION,
  STEP1_FABRIC_ASSIGNMENT_TITLE,
  STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE,
  STEP1_FABRIC_GROUP_ASSIGN_BUTTON_LABEL,
  STEP1_FINAL_RESIDUAL_CAPACITY_MESSAGE,
  STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE,
  STEP1_USE_FOR_ALL_LABEL,
  formatStep1FabricCapacityProgress,
  type Step1FabricAssignmentCandidate,
  type Step1FabricAssignmentFailure,
} from "../utils/step1FabricAssignmentPopup";

const getCapacityGuidanceTone = (
  selectedCapacityUnits: number,
  maxCapacityUnits: number,
  groupingCapacityStatus: string | null,
): { container: string; headline: string; guidance: string } => {
  if (groupingCapacityStatus === STEP1_FINAL_RESIDUAL_CAPACITY_MESSAGE) {
    return {
      container: "border-heritage-green/25 bg-heritage-green/5",
      headline: "text-heritage-green",
      guidance: "text-heritage-green/80",
    };
  }
  if (
    selectedCapacityUnits >= maxCapacityUnits ||
    groupingCapacityStatus === STEP1_FABRIC_CAPACITY_COMPLETE_MESSAGE
  ) {
    return {
      container: "border-heritage-green/25 bg-heritage-green/5",
      headline: "text-heritage-green",
      guidance: "text-heritage-green/80",
    };
  }
  if (groupingCapacityStatus === STEP1_SELECT_MORE_GARMENT_CAPACITY_MESSAGE) {
    return {
      container: "border-heritage-gold/35 bg-heritage-gold/10",
      headline: "text-heritage-green",
      guidance: "text-heritage-ink/75",
    };
  }
  return {
    container: "border-heritage-gold/25 bg-heritage-cream/40",
    headline: "text-heritage-green",
    guidance: "text-heritage-ink/70",
  };
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

const getCandidateLabel = (candidate: Step1FabricAssignmentCandidate): string =>
  candidate.garmentType === "other"
    ? "Other Garment"
    : getGarmentTypeStepLabel(candidate.garmentType);

export const Step1FabricAssignmentDialog = ({
  displayFabric,
  currentFabric,
  candidates,
  selectedGarmentKeys,
  selectedCount,
  selectedCapacityUnits,
  maxCapacityUnits,
  canAssignSelected,
  canUseForAll,
  groupingCapacityStatus,
  selectedCapacityMessage,
  remainingCapacityMessage,
  candidateMessages = {},
  selectedFailure = null,
  remainingFailure = null,
  errorMessage,
  onToggleGarmentKey,
  onAssignSelected,
  onUseForAll,
  onCancel,
}: {
  displayFabric: Fabric;
  currentFabric: Fabric | null;
  candidates: readonly Step1FabricAssignmentCandidate[];
  selectedGarmentKeys: readonly string[];
  selectedCount: number;
  selectedCapacityUnits: number;
  maxCapacityUnits: number;
  canAssignSelected: boolean;
  canUseForAll: boolean;
  groupingCapacityStatus: string | null;
  selectedCapacityMessage: string | null;
  remainingCapacityMessage: string | null;
  candidateMessages?: Record<string, string | null>;
  selectedFailure?: Step1FabricAssignmentFailure | null;
  remainingFailure?: Step1FabricAssignmentFailure | null;
  errorMessage: string | null;
  onToggleGarmentKey: (garmentKey: string, checked: boolean) => void;
  onAssignSelected: () => void;
  onUseForAll: () => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const selectedCapacityId = useId();
  const remainingCapacityId = useId();
  const groupingCapacityId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const initialFocusRef = useRef<HTMLButtonElement | null>(null);
  const registerControl = (element: HTMLElement | null) => {
    void element;
  };
  const fabric = displayFabric;
  const availabilityMessage = currentFabric
    ? getFabricAvailabilityMessage(currentFabric)
    : null;
  const stockPresentation = currentFabric
    ? getFabricStockPresentation(currentFabric)
    : null;

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

  const getRowWarningId = (garmentKey: string) =>
    `step1-fabric-assignment-${garmentKey}-warning`;
  const assignDescribedBy = [
    selectedCount === 0 ? descriptionId : null,
    groupingCapacityStatus ? groupingCapacityId : null,
    selectedCapacityMessage ? selectedCapacityId : null,
    selectedFailure ? getRowWarningId(selectedFailure.garmentKey) : null,
    errorMessage ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const useForAllDescribedBy = [
    remainingCapacityMessage ? remainingCapacityId : null,
    remainingFailure ? getRowWarningId(remainingFailure.garmentKey) : null,
    errorMessage ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const capacityTone = getCapacityGuidanceTone(
    selectedCapacityUnits,
    maxCapacityUnits,
    groupingCapacityStatus,
  );

  const dialog = (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="step1-fabric-assignment-dialog"
        data-step1-fabric-assignment-code={fabric.code}
        className="flex max-h-[90vh] w-full max-w-lg min-w-0 scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-xl"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/20 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words font-serif text-xl font-bold text-heritage-green sm:text-2xl"
            >
              {STEP1_FABRIC_ASSIGNMENT_TITLE}
            </h2>
            <p
              id={descriptionId}
              className="mt-2 text-sm leading-relaxed text-heritage-ink/70"
            >
              {STEP1_FABRIC_ASSIGNMENT_DESCRIPTION}
            </p>
          </div>
          <button
            ref={initialFocusRef}
            type="button"
            onClick={onCancel}
            aria-label="Close fabric assignment"
            data-step1-fabric-assignment-close="true"
            data-step1-fabric-assignment-control="true"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {errorMessage ? (
            <p
              id={errorId}
              role="alert"
              aria-live="assertive"
              data-testid="step1-fabric-assignment-error"
              className="mb-4 break-words rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800"
            >
              {errorMessage}
            </p>
          ) : null}

          <div
            data-testid="step1-fabric-assignment-capacity-guidance"
            className={`mb-4 rounded-2xl border px-3 py-3 ${capacityTone.container}`}
          >
            <p
              role="status"
              data-testid="step1-fabric-assignment-capacity-progress"
              className={`text-sm font-semibold ${capacityTone.headline}`}
            >
              {formatStep1FabricCapacityProgress(
                selectedCapacityUnits,
                maxCapacityUnits,
              )}
            </p>
            {groupingCapacityStatus ? (
              <p
                id={groupingCapacityId}
                role="status"
                data-testid="step1-fabric-assignment-grouping-capacity"
                className={`mt-1 text-sm leading-relaxed ${capacityTone.guidance}`}
              >
                {groupingCapacityStatus}
              </p>
            ) : null}
          </div>

          <div
            className="flex min-w-0 flex-col gap-3 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/30 p-3 sm:flex-row sm:items-center"
            data-testid="step1-fabric-assignment-header"
          >
            <AssignedFabricPreview
              fabric={fabric}
              garmentKey="step1-assignment-header"
              garmentLabel="selected fabric"
              fabricCode={fabric.code}
            />
            <div className="min-w-0">
              <p className="break-words font-serif text-base font-bold text-heritage-green">
                {fabric.name}
              </p>
              <p className="mt-1 break-words font-mono text-xs text-heritage-ink/60">
                {fabric.code}
              </p>
              {stockPresentation?.visible && (
                <p className="mt-1 text-xs font-semibold text-heritage-green">
                  {stockPresentation.label}
                </p>
              )}
              {availabilityMessage && availabilityMessage !== errorMessage && (
                <p className="mt-1 text-xs font-semibold text-red-700">
                  {availabilityMessage}
                </p>
              )}
            </div>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">
              Unassigned garments for {fabric.name}
            </legend>
            {candidates.map((candidate) => {
              const garmentLabel = getCandidateLabel(candidate);
              const checkboxId = `step1-fabric-assignment-${candidate.garmentKey}`;
              const warningId = getRowWarningId(candidate.garmentKey);
              const checked = selectedGarmentKeys.includes(candidate.garmentKey);
              const rowWarning =
                candidateMessages[candidate.garmentKey] ??
                candidate.disabledReason;
              return (
                <label
                  key={candidate.garmentKey}
                  htmlFor={checkboxId}
                  data-step1-fabric-assignment-row={candidate.garmentKey}
                  className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-heritage-gold/25 bg-heritage-cream/25 px-3 py-2 ${
                    candidate.individuallyAssignable
                      ? "text-heritage-green"
                      : "cursor-not-allowed opacity-60"
                  }`}
                >
                  <input
                    id={checkboxId}
                    type="checkbox"
                    data-step1-fabric-assignment-checkbox={candidate.garmentKey}
                    data-step1-fabric-assignment-control="true"
                    ref={registerControl}
                    checked={checked}
                    disabled={!candidate.individuallyAssignable}
                    aria-describedby={rowWarning ? warningId : undefined}
                    aria-invalid={rowWarning ? true : undefined}
                    onChange={(event) =>
                      onToggleGarmentKey(
                        candidate.garmentKey,
                        event.currentTarget.checked,
                      )
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-heritage-green"
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold">
                      {garmentLabel}
                    </span>
                    <span className="mt-0.5 block break-words text-xs font-medium text-heritage-ink/65">
                      {candidate.capacityUsageCopy}
                    </span>
                    {rowWarning ? (
                      <span
                        id={warningId}
                        role="alert"
                        data-testid={`step1-fabric-assignment-row-warning-${candidate.garmentKey}`}
                        data-step1-fabric-assignment-row-warning={
                          candidate.garmentKey
                        }
                        className="mt-1 block break-words text-xs font-semibold text-red-700"
                      >
                        {rowWarning}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {remainingCapacityMessage ? (
            <p
              id={remainingCapacityId}
              role="status"
              data-testid="step1-fabric-assignment-remaining-capacity"
              className="mt-3 text-sm font-semibold text-red-700"
            >
              {remainingCapacityMessage}
            </p>
          ) : null}
          {selectedCapacityMessage ? (
            <p
              id={selectedCapacityId}
              role="status"
              data-testid="step1-fabric-assignment-selected-capacity"
              className="mt-3 text-sm font-semibold text-red-700"
            >
              {selectedCapacityMessage}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onUseForAll}
            disabled={!canUseForAll}
            aria-disabled={!canUseForAll}
            aria-describedby={useForAllDescribedBy || undefined}
            title={
              canUseForAll
                ? undefined
                : remainingCapacityMessage ||
                  remainingFailure?.message ||
                  undefined
            }
            data-testid="step1-fabric-assignment-use-for-all"
            data-step1-fabric-assignment-control="true"
            ref={registerControl}
            className="mt-4 min-h-11 w-full rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {STEP1_USE_FOR_ALL_LABEL}
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-heritage-gold/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <button
            type="button"
            onClick={onCancel}
            data-testid="step1-fabric-assignment-cancel"
            data-step1-fabric-assignment-control="true"
            ref={registerControl}
            className="min-h-11 rounded-xl border border-heritage-green/30 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAssignSelected}
            disabled={!canAssignSelected}
            aria-disabled={!canAssignSelected}
            aria-describedby={assignDescribedBy || undefined}
            title={
              canAssignSelected
                ? undefined
                : selectedCapacityMessage ||
                  selectedFailure?.message ||
                  "Select at least one garment."
            }
            data-testid="step1-fabric-assignment-confirm"
            data-step1-fabric-assignment-control="true"
            ref={registerControl}
            className="min-h-11 min-w-0 break-words rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {STEP1_FABRIC_GROUP_ASSIGN_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }
  return createPortal(dialog, document.body);
};
