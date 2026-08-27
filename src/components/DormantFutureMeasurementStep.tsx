import { LockKeyhole, Ruler, ShieldAlert } from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  FutureMeasurementStateV1,
  MeasurementRiskRoute,
} from "../types";
import {
  fromCanonicalCentimetres,
  getResolvedMeasurementValue,
  isFutureSummaryUnlockedByMeasurements,
  isSelectedMeasurementRiskRoute,
  MEASUREMENT_RISK_ROUTE_LABELS,
  MEASUREMENT_RISK_SELECTION_NOTICE,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  roundMeasurementDisplayValue,
  setFutureMeasurementInput,
  setFutureMeasurementUnit,
  type MeasurementRequirementPlan,
  type PlannedMeasurementRequirement,
} from "../utils/measurementBlueprint";

interface DormantFutureMeasurementStepProps {
  plan: MeasurementRequirementPlan;
  state: FutureMeasurementStateV1;
  onChange: (state: FutureMeasurementStateV1) => void;
  onRouteChange: (route: MeasurementRiskRoute) => void;
  onBack: () => void;
  onContinue: () => void;
}

const ROUTES: ReadonlyArray<{
  id: MeasurementRiskRoute;
  title: string;
  description: string;
}> = [
  {
    id: "low_risk",
    title: MEASUREMENT_RISK_ROUTE_LABELS.low_risk,
    description: "Enter the complete measurements required for your selected garments.",
  },
  {
    id: "medium_risk",
    title: MEASUREMENT_RISK_ROUTE_LABELS.medium_risk,
    description: "Enter the required measurements. Optional values are calculated from height where available.",
  },
  {
    id: "high_risk",
    title: MEASUREMENT_RISK_ROUTE_LABELS.high_risk,
    description: "Enter the required measurements. Optional values are calculated from height where available.",
  },
];

const CALCULATED_PENDING_MESSAGE =
  "Complete the required measurements to calculate this value.";
const CALCULATED_FROM_HEIGHT_LABEL = "Calculated from height";
const RANGE_RECHECK_MESSAGE = "Please recheck this measurement.";

const formatGarmentLabel = (garmentType?: string, garmentKey?: string): string => {
  const base = (garmentType || "Garment")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const occurrence = garmentKey?.match(/:(\d+)$/)?.[1];
  return occurrence ? `${base} ${occurrence}` : base;
};

const getBlockerMessage = (
  diagnostic: FutureMeasurementStateV1["diagnostics"][number],
): string => {
  switch (diagnostic.code) {
    case "applicability_unresolved":
      return "A measurement choice still needs confirmation from the selected construction details.";
    case "calculation_basis_unresolved":
      return "The required height basis is not yet available for one selected garment.";
    case "required_measurement_missing":
      return "Complete every required measurement shown below.";
    case "invalid_measurement_value":
      return "Correct the highlighted measurement before continuing.";
    default:
      return "Review the measurements shown below before this step can be completed.";
  }
};

const getStatusLabel = (
  route: MeasurementRiskRoute,
  selectedRoute: FutureMeasurementStateV1["route"],
  status: FutureMeasurementStateV1["calculationStatus"],
): string | null => {
  if (route !== selectedRoute) return null;
  switch (status) {
    case "complete":
      return "Complete";
    case "incomplete":
      return "Incomplete";
    case "invalid":
      return "Needs correction";
    case "calculation_formula_pending":
      return "Calculation pending";
    case "profile_mapping_pending":
      return "Setup pending";
    default:
      return "Selected";
  }
};

const groupGarmentRequirements = (
  requirements: PlannedMeasurementRequirement[],
): Array<[string, PlannedMeasurementRequirement[]]> =>
  Array.from(
    requirements.reduce((sections, requirement) => {
      const garmentKey = requirement.garmentKey || "unknown";
      const current = sections.get(garmentKey) || [];
      current.push(requirement);
      sections.set(garmentKey, current);
      return sections;
    }, new Map<string, PlannedMeasurementRequirement[]>()),
  ).sort(([left], [right]) => left.localeCompare(right));

const MeasurementField = ({
  requirement,
  state,
  onChange,
  rangeRecheck,
}: {
  requirement: PlannedMeasurementRequirement;
  state: FutureMeasurementStateV1;
  onChange: (state: FutureMeasurementStateV1) => void;
  rangeRecheck: boolean;
}) => {
  const stored = getResolvedMeasurementValue(state, requirement);
  const displayValue = stored
    ? roundMeasurementDisplayValue(
        fromCanonicalCentimetres(stored.valueCm, state.unit),
      )
    : "";
  const inputId = `measurement-${requirement.key.replace(/[^a-z0-9_-]/gi, "-")}`;
  const hasInvalidValue = state.invalidInputKeys.includes(requirement.key);
  const errorId = `${inputId}-error`;
  const calculated = requirement.inputSource === "calculated_average_factor";
  const optionalManual = requirement.inputSource === "optional_manual";
  const badge = stored?.provenance === "customer_entered"
    ? "Customer measurement"
    : calculated
    ? CALCULATED_FROM_HEIGHT_LABEL
    : optionalManual
      ? "Optional"
      : "Required";

  return (
    <label
      htmlFor={calculated ? undefined : inputId}
      data-measurement-field={requirement.measurementId}
      data-measurement-source={requirement.inputSource}
      data-measurement-calculated={calculated ? "true" : "false"}
      className={`block min-w-0 rounded-xl border p-4 transition ${
        hasInvalidValue
          ? "border-red-400/70 bg-red-50/40"
          : calculated
            ? "border-heritage-green/10 bg-heritage-cream/35"
            : stored
              ? "border-heritage-green/30 bg-heritage-green/[0.03]"
              : "border-heritage-green/15 bg-heritage-cream/20"
      }`}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-sm font-bold text-heritage-green">
          {requirement.definition.customerLabel}
        </span>
        <span className="rounded-full border border-heritage-gold/25 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
          {badge}
        </span>
      </span>
      {requirement.definition.instructions && (
        <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/60">
          {requirement.definition.instructions}
        </span>
      )}
      {requirement.averageFactor === null && requirement.section === "required" && (
        <span className="mt-2 block text-xs font-semibold text-heritage-ink/65">
          Enter this measurement directly.
        </span>
      )}
      {calculated ? (
        <span className="relative mt-3 block">
          <span
            className="flex min-h-11 w-full min-w-0 items-center rounded-xl border border-heritage-green/15 bg-heritage-cream/50 px-3 pr-14 text-sm text-heritage-ink"
            data-measurement-calculated-value={stored ? String(displayValue) : "pending"}
          >
            {stored ? displayValue : CALCULATED_PENDING_MESSAGE}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-heritage-ink/50">
            {state.unit === "inch" ? "in" : "cm"}
          </span>
        </span>
      ) : (
        <span className="relative mt-3 block">
          <input
            id={inputId}
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            aria-invalid={hasInvalidValue || undefined}
            aria-describedby={hasInvalidValue ? errorId : undefined}
            value={displayValue}
            onChange={(event) => {
              const raw = event.target.value;
              onChange(setFutureMeasurementInput({
                state,
                requirement,
                displayValue: raw === "" ? null : Number(raw),
              }));
            }}
            className="min-h-11 w-full min-w-0 rounded-xl border border-heritage-green/20 bg-white px-3 pr-14 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-heritage-ink/50">
            {state.unit === "inch" ? "in" : "cm"}
          </span>
        </span>
      )}
      {hasInvalidValue && (
        <span id={errorId} className="mt-2 block text-xs font-semibold text-red-700">
          Enter a positive measurement value.
        </span>
      )}
      {rangeRecheck && !hasInvalidValue && (
        <span className="mt-2 block text-xs font-semibold text-heritage-gold">
          {RANGE_RECHECK_MESSAGE}
        </span>
      )}
      {stored && !hasInvalidValue && !calculated && !rangeRecheck && (
        <span className="mt-2 block text-xs font-semibold text-heritage-green/75">
          Saved
        </span>
      )}
    </label>
  );
};

const MeasurementSection = ({
  title,
  description,
  requirements,
  state,
  onChange,
  section,
}: {
  title: string;
  description: string;
  requirements: PlannedMeasurementRequirement[];
  state: FutureMeasurementStateV1;
  onChange: (state: FutureMeasurementStateV1) => void;
  section: "required" | "optional";
}) => {
  const sharedRequirements = requirements.filter(
    (requirement) =>
      requirement.scope === "shared" &&
      requirement.inputSource !== "calculated_average_factor",
  );
  const garmentRequirementSections = groupGarmentRequirements(
    requirements.filter(
      (requirement) =>
        requirement.scope === "garment" ||
        requirement.inputSource === "calculated_average_factor",
    ),
  );
  const completedCount = requirements.filter((requirement) => {
    if (requirement.inputSource === "calculated_average_factor") return false;
    const value = getResolvedMeasurementValue(state, requirement);
    return Boolean(value && Number.isFinite(value.valueCm) && value.valueCm > 0);
  }).length;
  const requiredCount = requirements.filter((requirement) => requirement.directInput).length;

  return (
    <section
      data-measurement-section={section}
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
        section === "optional"
          ? "border-heritage-green/15 bg-heritage-cream/25"
          : "border-heritage-gold/20 bg-white"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Ruler aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={20} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="font-serif text-lg font-bold text-heritage-green">{title}</h3>
            {section === "required" && requiredCount > 0 && (
              <span className="rounded-full border border-heritage-gold/25 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                {completedCount} of {requiredCount} complete
              </span>
            )}
            {section === "optional" && (
              <span className="rounded-full border border-heritage-green/20 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-ink/60">
                Optional
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/65">{description}</p>
        </div>
      </div>
      {sharedRequirements.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-heritage-green">
            Shared Body Measurements
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/65">
            Shared body measurements are entered once and used for all applicable garments.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {sharedRequirements.map((requirement) => (
              <MeasurementField
                key={requirement.key}
                requirement={requirement}
                state={state}
                onChange={onChange}
                rangeRecheck={state.diagnostics.some(
                  (diagnostic) =>
                    diagnostic.code === "measurement_range_recheck" &&
                    diagnostic.measurementId === requirement.measurementId,
                )}
              />
            ))}
          </div>
        </div>
      )}
      {garmentRequirementSections.map(([garmentKey, garmentRequirements]) => (
        <div key={garmentKey} className="mt-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="font-serif text-base font-bold text-heritage-green">
              {formatGarmentLabel(garmentRequirements[0]?.garmentType, garmentKey)} Measurements
            </h4>
            <span className="rounded-full border border-heritage-gold/25 bg-heritage-cream/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
              Garment specific
            </span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {garmentRequirements.map((requirement) => (
              <MeasurementField
                key={requirement.key}
                requirement={requirement}
                state={state}
                onChange={onChange}
                rangeRecheck={state.diagnostics.some(
                  (diagnostic) =>
                    diagnostic.code === "measurement_range_recheck" &&
                    diagnostic.measurementId === requirement.measurementId &&
                    diagnostic.garmentKey === requirement.garmentKey,
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

export const DormantFutureMeasurementStep = ({
  plan,
  state,
  onChange,
  onRouteChange,
  onBack,
  onContinue,
}: DormantFutureMeasurementStepProps) => {
  const resolvedState = reconcileFutureMeasurementState({ state, plan });
  const selectedRoute = isSelectedMeasurementRiskRoute(resolvedState.route)
    ? resolvedState.route
    : null;
  const presentationRequirements = projectMeasurementRequirementsForPresentation({
    requirements: plan.requirements,
    state: resolvedState,
  });
  const requiredRequirements = selectedRoute
    ? presentationRequirements.filter((requirement) => requirement.section === "required")
    : [];
  const optionalRequirements = selectedRoute
    ? presentationRequirements.filter((requirement) => requirement.section === "optional")
    : [];
  const completedManualInputCount = requiredRequirements.filter((requirement) => {
    const value = getResolvedMeasurementValue(resolvedState, requirement);
    return Boolean(value && Number.isFinite(value.valueCm) && value.valueCm > 0);
  }).length;
  const remainingManualInputCount = Math.max(
    0,
    requiredRequirements.length - completedManualInputCount,
  );
  const unsupportedGarments = selectedRoute
    ? resolvedState.diagnostics.filter(
        (diagnostic) => diagnostic.code === "measurement_profile_unmapped",
      )
    : [];
  const blockerMessages = selectedRoute
    ? [...new Set(
        resolvedState.diagnostics
          .filter((diagnostic) =>
            diagnostic.code !== "measurement_profile_unmapped" &&
            diagnostic.code !== "calculation_configuration_pending" &&
            diagnostic.code !== "measurement_range_recheck"
          )
          .map(getBlockerMessage),
      )]
    : [];
  const routeSaveMessage = !selectedRoute
    ? MEASUREMENT_RISK_SELECTION_NOTICE
    : resolvedState.calculationStatus === "complete"
      ? "All required measurements are saved."
      : `${remainingManualInputCount} required measurement${remainingManualInputCount === 1 ? " remains" : "s remain"}.`;
  const routeStatusLabel = selectedRoute
    ? getStatusLabel(
        selectedRoute,
        selectedRoute,
        resolvedState.calculationStatus,
      )
    : null;
  const canContinueToSummary = isFutureSummaryUnlockedByMeasurements(resolvedState);

  return (
    <section
      aria-labelledby="future-measurement-title"
      data-stage-id="measurement"
      data-measurement-status={resolvedState.calculationStatus}
      data-measurement-risk-selected={selectedRoute || "none"}
      className="space-y-5 font-sans"
    >
      <header className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="AI Try-on"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 6 of 9
        </p>
        <h2
          id="future-measurement-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Dimension / Measurement
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Add the measurements needed for your selected garments. Your values stay
          consistent when you switch between inches and centimetres.
        </p>
      </header>

      <section className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
        <fieldset data-measurement-risk-selector="true">
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Choose one measurement risk level
          </legend>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {ROUTES.map((route) => {
              const selected = selectedRoute === route.id;
              const status = getStatusLabel(
                route.id,
                selectedRoute,
                resolvedState.calculationStatus,
              );
              return (
                <label
                  key={route.id}
                  data-measurement-risk-option={route.id}
                  data-measurement-risk-selected={selected ? "true" : "false"}
                  className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                    selected
                      ? "border-heritage-gold bg-heritage-gold/10 shadow-sm ring-1 ring-heritage-gold/40"
                      : "border-heritage-green/15 hover:border-heritage-gold/45"
                  }`}
                >
                  <input
                    type="radio"
                    name="future-measurement-route"
                    value={route.id}
                    checked={selected}
                    onChange={() => onRouteChange(route.id)}
                    className="mt-1 size-4 shrink-0 accent-heritage-green"
                  />
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="break-words text-sm font-semibold text-heritage-green">
                        {route.title}
                      </span>
                      {status && (
                        <span className="rounded-full border border-heritage-gold/30 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-heritage-ink/70">
                          {status}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">
                      {route.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      {selectedRoute && (
        <>
      <section
        aria-live="polite"
        data-measurement-form={selectedRoute}
        className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/35 p-4 sm:p-5"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
              Current route status
            </p>
            <h3 className="mt-1 font-serif text-lg font-bold text-heritage-green">
              {routeStatusLabel}
            </h3>
            <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
              {routeSaveMessage}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-heritage-green/15 bg-white px-3 py-2 text-xs font-semibold text-heritage-green">
            {completedManualInputCount} / {requiredRequirements.length} saved
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wider text-heritage-green">
            Measurement unit
          </legend>
          <div className="mt-3 inline-flex max-w-full rounded-xl border border-heritage-green/20 bg-heritage-cream/30 p-1">
            {(["inch", "cm"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={state.unit === unit}
                onClick={() => onChange(setFutureMeasurementUnit(resolvedState, unit))}
                className={`min-h-11 rounded-lg px-4 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold sm:px-5 ${
                  state.unit === unit
                    ? "bg-heritage-green text-white shadow-sm"
                    : "text-heritage-green hover:bg-white"
                }`}
              >
                {unit === "inch" ? "Inches" : "Centimetres"}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      {unsupportedGarments.length > 0 && (
        <section className="rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert aria-hidden="true" size={19} className="mt-0.5 shrink-0 text-heritage-gold" />
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-bold text-heritage-green">
                Measurement setup pending
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
                The measurement setup for this garment is awaiting confirmation. You can continue reviewing measurements for your other garments.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Garments awaiting measurement setup">
                {unsupportedGarments.map((diagnostic) => (
                  <li
                    key={diagnostic.garmentKey}
                    className="rounded-full border border-heritage-gold/25 bg-white px-2.5 py-1 text-xs font-semibold text-heritage-green"
                  >
                    {formatGarmentLabel(diagnostic.garmentType, diagnostic.garmentKey)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {blockerMessages.length > 0 && (
        <section className="rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-gold" />
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-heritage-green">Measurement review needed</h3>
              <ul className="mt-2 space-y-1 text-sm text-heritage-ink/70">
                {blockerMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      <MeasurementSection
        title="Required Measurements"
        description={
          selectedRoute === "low_risk"
            ? "All applicable measurements for this garment are entered manually."
            : "Enter only the required measurements for this option."
        }
        requirements={requiredRequirements}
        state={resolvedState}
        onChange={onChange}
        section="required"
      />

      {optionalRequirements.length > 0 && (
        <MeasurementSection
          title="Optional Measurements"
          description="Calculated from height after the required measurements are complete. Fields without a factor stay optional and can be entered manually."
          requirements={optionalRequirements}
          state={resolvedState}
          onChange={onChange}
          section="optional"
        />
      )}
        </>
      )}

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DesignStudioBackButton
            destination="AI Try-on"
            onClick={onBack}
            className="w-full sm:w-auto"
          />
          <div className="min-w-0 sm:text-right">
            <p
              id="measurement-risk-selection-notice"
              data-measurement-risk-notice="true"
              className="mb-2 text-xs leading-relaxed text-heritage-ink/60"
            >
              {MEASUREMENT_RISK_SELECTION_NOTICE}
            </p>
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinueToSummary}
              aria-describedby="measurement-risk-selection-notice"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 sm:w-auto"
            >
              {!canContinueToSummary && <LockKeyhole aria-hidden="true" size={14} />}
              Continue to Summary
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
};
