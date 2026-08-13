const FUTURE_JOURNEY_STEPS = [
  { id: "garment_type", label: "Garment Type" },
  { id: "fabric", label: "Fabric" },
  { id: "design_style", label: "Design Style" },
  { id: "custom_details", label: "Custom Details" },
  { id: "ai_try_on", label: "AI Try-on" },
  { id: "measurement", label: "Measurement" },
  { id: "summary", label: "Summary" },
  { id: "shipping", label: "Shipping" },
  { id: "payment", label: "Payment" },
] as const;

export type DormantFutureJourneyStageId =
  (typeof FUTURE_JOURNEY_STEPS)[number]["id"];

interface DormantFutureJourneyStepperProps {
  currentStageId:
    | "garment_type"
    | "fabric"
    | "design_style"
    | "custom_details";
  canEnterFabric: boolean;
  canEnterDesignStyle: boolean;
  canEnterCustomDetails: boolean;
  onSelectGarmentType: () => void;
  onSelectFabric: () => void;
  onSelectDesignStyle: () => void;
  onSelectCustomDetails: () => void;
}

export const DormantFutureJourneyStepper = ({
  currentStageId,
  canEnterFabric,
  canEnterDesignStyle,
  canEnterCustomDetails,
  onSelectGarmentType,
  onSelectFabric,
  onSelectDesignStyle,
  onSelectCustomDetails,
}: DormantFutureJourneyStepperProps) => (
  <nav
    aria-label="Future Design Studio steps"
    className="rounded-2xl border border-heritage-gold/20 bg-white p-3 shadow-sm sm:p-4"
  >
    <ol className="grid min-w-0 grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
      {FUTURE_JOURNEY_STEPS.map((step, index) => {
        const isCurrent = currentStageId === step.id;
        const isCompleted =
          (step.id === "garment_type" && currentStageId !== "garment_type") ||
          (step.id === "fabric" &&
            (currentStageId === "design_style" ||
              currentStageId === "custom_details")) ||
          (step.id === "design_style" && currentStageId === "custom_details");
        const isAvailable =
          step.id === "garment_type" ||
          (step.id === "fabric" && canEnterFabric) ||
          (step.id === "design_style" && canEnterDesignStyle) ||
          (step.id === "custom_details" && canEnterCustomDetails);
        const onClick =
          step.id === "garment_type"
            ? onSelectGarmentType
            : step.id === "fabric"
              ? onSelectFabric
              : step.id === "design_style"
                ? onSelectDesignStyle
                : step.id === "custom_details"
                  ? onSelectCustomDetails
                  : undefined;
        const state = isCurrent ? "current" : isCompleted ? "completed" : isAvailable ? "available" : "locked";

        return (
          <li key={step.id} className="min-w-0">
            <button
              type="button"
              onClick={onClick}
              disabled={!isAvailable || isCurrent}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={!isAvailable || isCurrent}
              aria-label={`Step ${index + 1}: ${step.label}, ${state}`}
              data-step-state={state}
              className={`flex min-h-11 w-full min-w-0 flex-col items-start justify-center rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                isCurrent
                  ? "cursor-default bg-heritage-gold/10 text-heritage-gold ring-1 ring-heritage-gold/35"
                  : isCompleted || isAvailable
                    ? "cursor-pointer text-heritage-green hover:bg-heritage-cream/55 hover:text-heritage-gold"
                    : "cursor-not-allowed text-heritage-ink/35"
              } disabled:cursor-not-allowed`}
            >
              <span className="font-mono text-[11px] font-bold leading-none" aria-hidden="true">
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
                    : isAvailable
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

export { FUTURE_JOURNEY_STEPS };
