import { DESIGN_STUDIO_NINE_STAGE_FOUNDATION } from "../utils/designSourceJourney";

export const DESIGN_STUDIO_STEPS = DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map(
  ({ id, title }) => ({ id, label: title }),
);

export type DesignStudioJourneyStageId =
  (typeof DESIGN_STUDIO_STEPS)[number]["id"];

export type DesignStudioJourneyStepState =
  | "current"
  | "completed"
  | "available"
  | "locked";

export const getDesignStudioJourneyStepState = ({
  stepIndex,
  currentStageIndex,
  isUnlocked,
}: {
  stepIndex: number;
  currentStageIndex: number;
  isUnlocked: boolean;
}): DesignStudioJourneyStepState =>
  stepIndex === currentStageIndex
    ? "current"
    : stepIndex < currentStageIndex && isUnlocked
      ? "completed"
      : isUnlocked
        ? "available"
        : "locked";

interface DesignStudioJourneyStepperProps {
  currentStageId: DesignStudioJourneyStageId;
  highestUnlockedStageIndex: number;
  canEnterFabric: boolean;
  canEnterDesignStyle: boolean;
  canEnterCustomDetails: boolean;
  canEnterTryOn: boolean;
  canEnterMeasurement: boolean;
  canEnterSummary: boolean;
  canEnterShipping: boolean;
  canEnterPayment: boolean;
  onSelectGarmentType: () => void;
  onSelectFabric: () => void;
  onSelectDesignStyle: () => void;
  onSelectCustomDetails: () => void;
  onSelectTryOn: () => void;
  onSelectMeasurement: () => void;
  onSelectSummary: () => void;
  onSelectShipping: () => void;
  onSelectPayment: () => void;
}

export const DesignStudioJourneyStepper = ({
  currentStageId,
  highestUnlockedStageIndex,
  canEnterFabric,
  canEnterDesignStyle,
  canEnterCustomDetails,
  canEnterTryOn,
  canEnterMeasurement,
  canEnterSummary,
  canEnterShipping,
  canEnterPayment,
  onSelectGarmentType,
  onSelectFabric,
  onSelectDesignStyle,
  onSelectCustomDetails,
  onSelectTryOn,
  onSelectMeasurement,
  onSelectSummary,
  onSelectShipping,
  onSelectPayment,
}: DesignStudioJourneyStepperProps) => (
  <nav
    aria-label="Design Studio steps"
    className="rounded-2xl border border-heritage-gold/20 bg-white p-3 shadow-sm sm:p-4"
  >
    <ol className="grid min-w-0 grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
      {DESIGN_STUDIO_STEPS.map((step, index) => {
        const isCurrent = currentStageId === step.id;
        const currentStageIndex = DESIGN_STUDIO_STEPS.findIndex(
          (candidate) => candidate.id === currentStageId,
        );
        const historicallyUnlocked = index <= highestUnlockedStageIndex;
        const currentlyEnterable =
          step.id === "garment_type" ||
          (step.id === "fabric" && canEnterFabric) ||
          (step.id === "design_style" && canEnterDesignStyle) ||
          (step.id === "custom_details" && canEnterCustomDetails) ||
          (step.id === "try_on" && canEnterTryOn) ||
          (step.id === "measurement" && canEnterMeasurement) ||
          (step.id === "summary" && canEnterSummary) ||
          (step.id === "shipping" && canEnterShipping) ||
          (step.id === "payment" && canEnterPayment);
        // Previously unlocked steps remain clickable even if transiently incomplete.
        const isUnlocked = historicallyUnlocked || currentlyEnterable;
        const isClickable = isUnlocked && !isCurrent;
        const onClick =
          step.id === "garment_type"
            ? onSelectGarmentType
            : step.id === "fabric"
              ? onSelectFabric
              : step.id === "design_style"
                ? onSelectDesignStyle
                : step.id === "custom_details"
                  ? onSelectCustomDetails
                  : step.id === "try_on"
                    ? onSelectTryOn
                    : step.id === "measurement"
                      ? onSelectMeasurement
                      : step.id === "summary"
                        ? onSelectSummary
                        : step.id === "shipping"
                          ? onSelectShipping
                          : onSelectPayment;
        const state = getDesignStudioJourneyStepState({
          stepIndex: index,
          currentStageIndex,
          isUnlocked,
        });
        const isCompleted = state === "completed";

        return (
          <li key={step.id} className="min-w-0">
            <button
              type="button"
              onClick={isClickable ? onClick : undefined}
              disabled={!isClickable}
              tabIndex={isClickable ? 0 : -1}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={!isClickable}
              aria-label={`Step ${index + 1}: ${step.label}, ${state}`}
              data-stage-id={step.id}
              data-stage-unlocked={isUnlocked ? "true" : "false"}
              data-stage-current={isCurrent ? "true" : "false"}
              data-stage-clickable={isClickable ? "true" : "false"}
              data-step-state={state}
              className={`flex min-h-11 w-full min-w-0 flex-col items-start justify-center rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                isCurrent
                  ? "cursor-default bg-heritage-gold/10 text-heritage-gold ring-1 ring-heritage-gold/35"
                  : isCompleted
                    ? "cursor-pointer bg-heritage-green/10 text-heritage-green ring-1 ring-heritage-green/20 hover:bg-heritage-green hover:text-white"
                    : isUnlocked
                      ? "cursor-pointer border border-heritage-green/25 bg-white text-heritage-ink hover:border-heritage-gold hover:bg-heritage-cream/55"
                      : "cursor-not-allowed bg-heritage-cream/35 text-heritage-ink/35"
              } disabled:cursor-not-allowed`}
            >
              <span
                className="font-mono text-[11px] font-bold leading-none"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="mt-1 min-w-0 break-words text-[9px] font-semibold leading-tight">
                {step.label}
              </span>
              <span className="sr-only">
                {isCurrent
                  ? "Current step"
                  : isCompleted
                    ? "Completed step; activate to return"
                    : isUnlocked
                      ? "Available step"
                      : "Locked until the preceding stages are available"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  </nav>
);
