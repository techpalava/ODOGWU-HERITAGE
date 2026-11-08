import { useEffect, useRef } from "react";
import {
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION,
  getDesignStudioStepCounter,
} from "../utils/designSourceJourney";

export const DESIGN_STUDIO_STEPS = DESIGN_STUDIO_TEN_STAGE_FOUNDATION.map(
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

/**
 * Same cutoff as Tailwind `max-sm` / `sm` (40rem). Phones use the compact
 * stepper; 640px and up keep the grid.
 */
const MOBILE_STEP_NAV_QUERY = "(width < 40rem)";

const alignMobileCurrentStep = (
  scroller: HTMLElement,
  current: HTMLElement,
) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }
  if (!window.matchMedia(MOBILE_STEP_NAV_QUERY).matches) return;
  if (
    typeof scroller.getBoundingClientRect !== "function" ||
    typeof current.getBoundingClientRect !== "function" ||
    typeof scroller.scrollTo !== "function"
  ) {
    return;
  }
  const containerRect = scroller.getBoundingClientRect();
  const chipRect = current.getBoundingClientRect();
  if (containerRect.width <= 0 || chipRect.width <= 0) return;
  const delta =
    chipRect.left -
    containerRect.left -
    (containerRect.width - chipRect.width) / 2;
  if (Math.abs(delta) < 1) return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  scroller.scrollTo({
    left: scroller.scrollLeft + delta,
    behavior: reduceMotion ? "auto" : "smooth",
  });
};

interface DesignStudioJourneyStepperProps {
  currentStageId: DesignStudioJourneyStageId;
  highestUnlockedStageIndex: number;
  canEnterFabric: boolean;
  canEnterDesignStyle: boolean;
  canEnterCustomDetails: boolean;
  canEnterPersonalizedAdditions?: boolean;
  canEnterTryOn: boolean;
  canEnterMeasurement: boolean;
  canEnterSummary: boolean;
  canEnterShipping: boolean;
  canEnterPayment: boolean;
  onSelectGarmentType: () => void;
  onSelectFabric: () => void;
  onSelectDesignStyle: () => void;
  onSelectCustomDetails: () => void;
  onSelectPersonalizedAdditions?: () => void;
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
  canEnterPersonalizedAdditions = false,
  canEnterTryOn,
  canEnterMeasurement,
  canEnterSummary,
  canEnterShipping,
  canEnterPayment,
  onSelectGarmentType,
  onSelectFabric,
  onSelectDesignStyle,
  onSelectCustomDetails,
  onSelectPersonalizedAdditions = () => {},
  onSelectTryOn,
  onSelectMeasurement,
  onSelectSummary,
  onSelectShipping,
  onSelectPayment,
}: DesignStudioJourneyStepperProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentStepRef = useRef<HTMLButtonElement>(null);
  const currentStageIndex = DESIGN_STUDIO_STEPS.findIndex(
    (candidate) => candidate.id === currentStageId,
  );
  const currentStep =
    DESIGN_STUDIO_STEPS[currentStageIndex] ?? DESIGN_STUDIO_STEPS[0];
  const currentCounter = getDesignStudioStepCounter(currentStep.id);
  const progressPercent =
    (currentCounter.step / currentCounter.total) * 100;

  useEffect(() => {
    const scroller = scrollerRef.current;
    const current = currentStepRef.current;
    if (!scroller || !current || typeof window === "undefined") return;

    let frame = 0;
    let cancelled = false;
    const align = () => {
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => {
        if (!cancelled) alignMobileCurrentStep(scroller, current);
      });
    };
    align();
    window.addEventListener("resize", align);
    const fontsReady =
      typeof document !== "undefined" ? document.fonts?.ready : undefined;
    void fontsReady?.then(() => {
      if (!cancelled) alignMobileCurrentStep(scroller, current);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", align);
    };
  }, [currentStageId]);

  return (
    <nav
      aria-label="Design Studio steps"
      className="rounded-2xl border border-heritage-gold/20 bg-white p-3 shadow-sm sm:p-4"
    >
      <div className="mb-2 px-1.5 sm:hidden" data-mobile-step-summary="true">
        <p className="text-left text-[11px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
          {currentCounter.label}
        </p>
        <p className="mt-1 text-left font-serif text-lg font-bold leading-tight text-heritage-green">
          {currentStep.label}
        </p>
        <div
          className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-heritage-green/15"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-heritage-gold motion-safe:transition-[width] motion-safe:duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
      {/* relative keeps each step's screen-reader text inside this scroller,
          so a chip that sits off to the side cannot widen the page. */}
      <div
        ref={scrollerRef}
        className="relative min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain px-1.5 py-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:p-0 sm:[scrollbar-width:auto]"
      >
      <ol className="flex w-max min-w-full items-center gap-2 sm:grid sm:w-full sm:min-w-0 sm:grid-cols-5 sm:items-stretch sm:gap-1.5 lg:grid-cols-10">
        {DESIGN_STUDIO_STEPS.map((step, index) => {
          const isCurrent = currentStageId === step.id;
          const historicallyUnlocked = index <= highestUnlockedStageIndex;
          const currentlyEnterable =
            step.id === "garment_type" ||
            (step.id === "fabric" && canEnterFabric) ||
            (step.id === "design_style" && canEnterDesignStyle) ||
            (step.id === "custom_details" && canEnterCustomDetails) ||
            (step.id === "personalized_additions" && canEnterPersonalizedAdditions) ||
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
                    : step.id === "personalized_additions"
                      ? onSelectPersonalizedAdditions
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
          const stepCounter = getDesignStudioStepCounter(step.id);
          const shortLabel =
            DESIGN_STUDIO_TEN_STAGE_FOUNDATION[index]?.shortLabel ?? step.label;

          return (
            <li key={step.id} className="min-w-0 max-sm:w-auto max-sm:shrink-0">
              <button
                ref={isCurrent ? currentStepRef : undefined}
                type="button"
                onClick={isClickable ? onClick : undefined}
                disabled={!isClickable}
                tabIndex={isClickable ? 0 : -1}
                aria-current={isCurrent ? "step" : undefined}
                aria-disabled={!isClickable}
                aria-label={`Step ${stepCounter.step}: ${step.label}, ${state}`}
                data-step-counter={stepCounter.label}
                data-stage-id={step.id}
                data-stage-unlocked={isUnlocked ? "true" : "false"}
                data-stage-current={isCurrent ? "true" : "false"}
                data-stage-clickable={isClickable ? "true" : "false"}
                data-step-state={state}
                className={`flex min-h-11 w-full min-w-0 flex-col items-start justify-center rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 max-sm:w-auto max-sm:shrink-0 max-sm:flex-row max-sm:items-center max-sm:justify-center max-sm:gap-1.5 max-sm:rounded-full max-sm:px-3 max-sm:py-2 max-sm:text-center ${
                  isCurrent
                    ? "cursor-default bg-heritage-gold text-heritage-forest ring-2 ring-heritage-gold/80 shadow-sm"
                    : isCompleted
                      ? "cursor-pointer bg-heritage-green/10 text-heritage-green ring-1 ring-heritage-green/20 hover:bg-heritage-green hover:text-white"
                      : isUnlocked
                        ? "cursor-pointer border border-heritage-green/25 bg-white text-heritage-ink hover:border-heritage-gold hover:bg-heritage-cream/55"
                        : "cursor-not-allowed bg-heritage-cream/35 text-heritage-ink/35 max-sm:border max-sm:border-heritage-ink/20 max-sm:bg-heritage-cream max-sm:text-heritage-ink/75"
                } disabled:cursor-not-allowed`}
              >
                <span
                  className="font-mono text-[11px] font-bold leading-none max-sm:text-[13px] max-sm:tabular-nums"
                  aria-hidden="true"
                >
                  {stepCounter.step}
                </span>
                <span className="mt-1 min-w-0 break-words text-[9px] font-semibold leading-tight max-sm:hidden">
                  {step.label}
                </span>
                <span className="whitespace-nowrap text-[13px] font-semibold leading-none sm:hidden">
                  {shortLabel}
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
      </div>
    </nav>
  );
};
