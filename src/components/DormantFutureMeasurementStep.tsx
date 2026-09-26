import { useState } from "react";
import { LockKeyhole, Ruler, ShieldAlert } from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import { DRESS_CONDITIONAL_MEASUREMENT_IDS } from "../config/MeasurementBlueprintConfig";
import type {
  FabricGarmentType,
  FutureMeasurementStateV1,
  MeasurementMethodId,
  MeasurementRiskRoute,
} from "../types";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import { projectOccurrenceDisplayLabels } from "../utils/occurrenceDisplayLabel";
import {
  collectRequiredAlternativeGroups,
  countRemainingCustomerRequiredMeasurementUnits,
  countRequiredMeasurementUnits,
  countSatisfiedRequiredMeasurementUnits,
  CRITICAL_RISK_AVAILABLE_COPY,
  CRITICAL_RISK_UNAVAILABLE_COPY,
  criticalRiskUnavailableCopy,
  FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE,
  fromCanonicalCentimetres,
  getRequiredAlternativeGroupId,
  getResolvedMeasurementValue,
  getSampleClothCustomerLabel,
  getSampleClothFieldInstruction,
  getSampleClothProductionEquivalentCm,
  isFutureSummaryUnlockedByMeasurements,
  isSampleClothMeasurementMethod,
  isSelectedMeasurementMethod,
  isSelectedMeasurementRiskRoute,
  MEASUREMENT_RISK_ROUTE_LABELS,
  MEASUREMENT_RISK_SELECTION_NOTICE,
  MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION,
  MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE,
  MEASUREMENT_SAMPLE_CLOTH_LABEL,
  MEASUREMENT_SAMPLE_CLOTH_METHOD,
  MEASUREMENT_SAMPLE_CLOTH_REQUIRED_DESCRIPTION,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  roundMeasurementDisplayValue,
  setFutureMeasurementInput,
  setFutureMeasurementUnit,
  type MeasurementPhysicalGarment,
  type MeasurementRequirementPlan,
  type PlannedMeasurementRequirement,
} from "../utils/measurementBlueprint";

interface DormantFutureMeasurementStepProps {
  plan: MeasurementRequirementPlan;
  state: FutureMeasurementStateV1;
  physicalGarments?: readonly MeasurementPhysicalGarment[];
  hydrationInvalid?: boolean;
  orderMeasurementsComplete?: boolean;
  onChange: (state: FutureMeasurementStateV1) => void;
  onRouteChange: (route: MeasurementMethodId) => void;
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
  {
    id: "critical_risk",
    title: MEASUREMENT_RISK_ROUTE_LABELS.critical_risk,
    description: CRITICAL_RISK_AVAILABLE_COPY,
  },
];

const CALCULATED_FROM_HEIGHT_LABEL = "Calculated from height";
const CALCULATED_FROM_HEIGHT_DESCRIPTION =
  "These values fill in from Total Height once the required measurements are complete.";
const IF_APPLICABLE_LABEL = "If applicable";
const RANGE_RECHECK_MESSAGE = "Please recheck this measurement.";
const DRESS_CONDITIONAL_MEASUREMENT_ID_SET = new Set<string>(
  DRESS_CONDITIONAL_MEASUREMENT_IDS,
);

type MeasurementSectionKind = "required" | "calculated" | "optional";

const fallbackGarmentLabel = (garmentType?: string): string => {
  if (!garmentType) return "Garment";
  if (garmentType === "other") return getStep1GarmentDisplayLabel(garmentType);
  const known = garmentType as FabricGarmentType;
  return getStep1GarmentDisplayLabel(known) || garmentType;
};

const formatGarmentLabel = (
  labels: ReadonlyMap<string, { conciseLabel: string }>,
  garmentType?: string,
  garmentKey?: string,
): string => {
  if (garmentKey) {
    const concise = labels.get(garmentKey)?.conciseLabel;
    if (concise) return concise;
  }
  return fallbackGarmentLabel(garmentType);
};

const getBlockerMessage = (
  diagnostic: FutureMeasurementStateV1["diagnostics"][number],
): string => {
  switch (diagnostic.code) {
    case "applicability_unresolved":
      return "A measurement choice still needs confirmation from the selected construction details.";
    case "calculation_basis_unresolved":
      return "The required height basis is not yet available for one selected garment.";
    case "calculation_configuration_pending":
      return CRITICAL_RISK_UNAVAILABLE_COPY;
    case "required_measurement_missing":
      return "Complete every required measurement shown below.";
    case "invalid_measurement_value":
      return "Correct the highlighted measurement before continuing.";
    default:
      return "Review the measurements shown below before this step can be completed.";
  }
};

const getStatusLabel = (
  route: MeasurementMethodId,
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
  const oneOfAlternative = Boolean(getRequiredAlternativeGroupId(requirement));
  const ifApplicable = DRESS_CONDITIONAL_MEASUREMENT_ID_SET.has(
    requirement.measurementId,
  );
  const badge = stored?.provenance === "customer_entered"
    ? "Customer measurement"
    : calculated
    ? CALCULATED_FROM_HEIGHT_LABEL
    : optionalManual
      ? ifApplicable
        ? IF_APPLICABLE_LABEL
        : "Optional"
      : oneOfAlternative
        ? "One required"
        : "Required";
  const sampleGeometry = requirement.sampleGeometry;
  const fieldLabel = sampleGeometry
    ? getSampleClothCustomerLabel(
        requirement.measurementId,
        requirement.definition.customerLabel,
      )
    : requirement.definition.customerLabel;
  const fieldInstruction = sampleGeometry
    ? getSampleClothFieldInstruction(sampleGeometry)
    : requirement.definition.instructions;
  const convertedDisplay = sampleGeometry === "laid_flat_half_width" && stored
    ? roundMeasurementDisplayValue(
        fromCanonicalCentimetres(
          getSampleClothProductionEquivalentCm(stored.valueCm),
          state.unit,
        ),
      )
    : null;

  return (
    <label
      htmlFor={calculated ? undefined : inputId}
      data-measurement-field={requirement.measurementId}
      data-measurement-source={requirement.inputSource}
      data-measurement-calculated={calculated ? "true" : "false"}
      data-sample-geometry={sampleGeometry || undefined}
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
          {fieldLabel}
        </span>
        <span
          data-measurement-badge={badge}
          className="rounded-full border border-heritage-gold/25 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold"
        >
          {badge}
        </span>
      </span>
      {fieldInstruction && (
        <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/60">
          {fieldInstruction}
        </span>
      )}
      {calculated ? (
        <span className="relative mt-3 block">
          <span
            className="flex min-h-11 w-full min-w-0 items-center rounded-xl border border-heritage-green/15 bg-heritage-cream/50 px-3 pr-14 text-sm text-heritage-ink"
            data-measurement-calculated-value={stored ? String(displayValue) : "pending"}
          >
            {stored ? displayValue : null}
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
      {convertedDisplay != null && !hasInvalidValue && (
        <span
          data-sample-converted="true"
          data-sample-converted-value={String(convertedDisplay)}
          className="mt-2 block text-xs font-semibold text-heritage-green/80"
        >
          Production equivalent {convertedDisplay} {state.unit === "inch" ? "in" : "cm"}
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
  sampleMode,
  occurrenceLabels,
}: {
  title: string;
  description: string;
  requirements: PlannedMeasurementRequirement[];
  state: FutureMeasurementStateV1;
  onChange: (state: FutureMeasurementStateV1) => void;
  section: MeasurementSectionKind;
  sampleMode: boolean;
  occurrenceLabels: ReadonlyMap<string, { conciseLabel: string }>;
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
  const completedCount = countSatisfiedRequiredMeasurementUnits({
    requirements,
    entered: state.entered,
    invalidInputKeys: state.invalidInputKeys,
  });
  const requiredCount = countRequiredMeasurementUnits(requirements);

  const renderFields = (fields: PlannedMeasurementRequirement[]) =>
    fields.map((requirement) => (
      <MeasurementField
        key={requirement.key}
        requirement={requirement}
        state={state}
        onChange={onChange}
        rangeRecheck={state.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "measurement_range_recheck" &&
            diagnostic.measurementId === requirement.measurementId &&
            (requirement.scope === "shared" || diagnostic.garmentKey === requirement.garmentKey),
        )}
      />
    ));

  return (
    <section
      data-measurement-section={section}
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
        section === "required"
          ? "border-heritage-gold/20 bg-white"
          : "border-heritage-green/15 bg-heritage-cream/25"
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
            {section === "calculated" && (
              <span className="rounded-full border border-heritage-green/20 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-ink/60">
                {CALCULATED_FROM_HEIGHT_LABEL}
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
            {sampleMode ? "Shared sample measurements" : "Shared Body Measurements"}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/65">
            {sampleMode
              ? "Shared sample measurements are entered once and used for all applicable garments."
              : "Shared body measurements are entered once and used for all applicable garments."}
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {renderFields(sharedRequirements)}
          </div>
        </div>
      )}
      {garmentRequirementSections.map(([garmentKey, garmentRequirements]) => {
        const individualRequirements = garmentRequirements.filter(
          (requirement) => !getRequiredAlternativeGroupId(requirement),
        );
        const alternativeGroups = collectRequiredAlternativeGroups(garmentRequirements);
        return (
        <div key={garmentKey} className="mt-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="font-serif text-base font-bold text-heritage-green">
              {formatGarmentLabel(occurrenceLabels, garmentRequirements[0]?.garmentType, garmentKey)} Measurements
            </h4>
            <span className="rounded-full border border-heritage-gold/25 bg-heritage-cream/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
              Garment specific
            </span>
          </div>
          {individualRequirements.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {renderFields(individualRequirements)}
            </div>
          )}
          {[...alternativeGroups.entries()].map(([groupId, members]) => (
            <div
              key={groupId}
              data-measurement-alternative-group={members[0]?.alternativeGroup}
              className="mt-4 rounded-xl border border-heritage-gold/20 bg-heritage-cream/20 p-4"
            >
              <h5 className="text-xs font-bold uppercase tracking-wider text-heritage-green">
                Sleeve Length
              </h5>
              <p className="mt-1 text-sm leading-relaxed text-heritage-ink/65">
                Enter the length that matches the sleeve.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {renderFields(members)}
              </div>
            </div>
          ))}
        </div>
        );
      })}
    </section>
  );
};

export const DormantFutureMeasurementStep = ({
  plan,
  state,
  physicalGarments = [],
  hydrationInvalid = false,
  orderMeasurementsComplete,
  onChange,
  onRouteChange,
  onBack,
  onContinue,
}: DormantFutureMeasurementStepProps) => {
  const occurrenceLabels = projectOccurrenceDisplayLabels(physicalGarments);
  const [pickedGarmentKey, setPickedGarmentKey] = useState<string | null>(null);
  const resolvedState = reconcileFutureMeasurementState({ state, plan });
  const selectedMethod = isSelectedMeasurementMethod(resolvedState.route)
    ? resolvedState.route
    : null;
  const selectedRoute = isSelectedMeasurementRiskRoute(resolvedState.route)
    ? resolvedState.route
    : null;
  const sampleSelected = isSampleClothMeasurementMethod(selectedMethod);
  const presentationRequirements = projectMeasurementRequirementsForPresentation({
    requirements: plan.requirements,
    state: resolvedState,
  });
  const requiredRequirements = selectedMethod
    ? presentationRequirements.filter((requirement) => requirement.section === "required")
    : [];
  const calculatedRequirements = selectedMethod
    ? presentationRequirements.filter(
        (requirement) => requirement.inputSource === "calculated_average_factor",
      )
    : [];
  const optionalRequirements = selectedMethod
    ? presentationRequirements.filter(
        (requirement) => requirement.inputSource === "optional_manual",
      )
    : [];
  const requiredUnitCount = countRequiredMeasurementUnits(requiredRequirements);
  const completedManualInputCount = countSatisfiedRequiredMeasurementUnits({
    requirements: requiredRequirements,
    entered: resolvedState.entered,
    invalidInputKeys: resolvedState.invalidInputKeys,
  });
  const remainingManualInputCount = countRemainingCustomerRequiredMeasurementUnits({
    plan,
    state: resolvedState,
  });
  const criticalRiskSupported = plan.criticalRiskSupported;
  const criticalRiskUnavailable = selectedRoute === "critical_risk" && !criticalRiskSupported;
  const criticalRiskBlockingLabels = (plan.criticalRiskBlockingGarmentKeys || []).map(
    (garmentKey) => {
      const garmentType = physicalGarments.find(
        (garment) => garment.garmentKey === garmentKey,
      )?.garmentType;
      return formatGarmentLabel(occurrenceLabels, garmentType, garmentKey);
    },
  );
  const criticalRiskBlockMessage = criticalRiskUnavailableCopy(criticalRiskBlockingLabels);
  const unsupportedGarments = selectedMethod
    ? resolvedState.diagnostics.filter(
        (diagnostic) => diagnostic.code === "measurement_profile_unmapped",
      )
    : [];
  const measurableGarmentKeys = new Set(
    presentationRequirements.map((requirement) => requirement.garmentKey),
  );
  const plannedGarmentKeys = new Set(
    [
      ...measurableGarmentKeys,
      ...resolvedState.diagnostics.map((diagnostic) => diagnostic.garmentKey),
    ].filter((garmentKey): garmentKey is string => Boolean(garmentKey)),
  );
  const measurementGarments = physicalGarments.filter((garment) =>
    plannedGarmentKeys.has(garment.garmentKey),
  );
  const firstMeasurableGarmentKey =
    measurementGarments.find((garment) => measurableGarmentKeys.has(garment.garmentKey))
      ?.garmentKey ??
    measurementGarments[0]?.garmentKey ??
    null;
  const selectedGarmentKey = measurementGarments.some(
    (garment) => garment.garmentKey === pickedGarmentKey,
  )
    ? pickedGarmentKey
    : firstMeasurableGarmentKey;
  const selectedGarmentPending = Boolean(selectedGarmentKey) && (
    unsupportedGarments.some((diagnostic) => diagnostic.garmentKey === selectedGarmentKey) ||
    !measurableGarmentKeys.has(selectedGarmentKey)
  );
  const visibleRequirements = selectedGarmentKey
    ? presentationRequirements.filter(
        (requirement) => requirement.garmentKey === selectedGarmentKey,
      )
    : presentationRequirements;
  const visibleRequiredRequirements = visibleRequirements.filter(
    (requirement) => requirement.section === "required",
  );
  const visibleCalculatedRequirements = visibleRequirements.filter(
    (requirement) => requirement.inputSource === "calculated_average_factor",
  );
  const visibleOptionalRequirements = visibleRequirements.filter(
    (requirement) => requirement.inputSource === "optional_manual",
  );
  const selectedGarmentLabel = formatGarmentLabel(
    occurrenceLabels,
    physicalGarments.find((garment) => garment.garmentKey === selectedGarmentKey)?.garmentType,
    selectedGarmentKey || undefined,
  );
  const blockerMessages = selectedMethod
    ? [...new Set(
        resolvedState.diagnostics
          .filter((diagnostic) =>
            diagnostic.code !== "measurement_profile_unmapped" &&
            diagnostic.code !== "measurement_range_recheck" &&
            (diagnostic.code !== "calculation_configuration_pending" || criticalRiskUnavailable)
          )
          .map(getBlockerMessage),
      )]
    : [];
  const routeSaveMessage = !selectedMethod
    ? MEASUREMENT_RISK_SELECTION_NOTICE
    : criticalRiskUnavailable
      ? criticalRiskBlockMessage
    : resolvedState.calculationStatus === "complete"
      ? "All required measurements are saved."
      : `${remainingManualInputCount} required measurement${remainingManualInputCount === 1 ? " remains" : "s remain"}.`;
  const routeStatusLabel = sampleSelected
    ? MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE
    : selectedMethod
      ? getStatusLabel(
          selectedMethod,
          selectedMethod,
          resolvedState.calculationStatus,
        )
      : null;
  const sampleStatus = getStatusLabel(
    MEASUREMENT_SAMPLE_CLOTH_METHOD,
    selectedMethod,
    resolvedState.calculationStatus,
  );
  const canContinueToSummary =
    !hydrationInvalid &&
    (orderMeasurementsComplete !== undefined
      ? orderMeasurementsComplete
      : isFutureSummaryUnlockedByMeasurements(resolvedState));

  return (
    <section
      aria-labelledby="future-measurement-title"
      data-stage-id="measurement"
      data-measurement-status={hydrationInvalid ? "invalid" : resolvedState.calculationStatus}
      data-measurement-hydration={hydrationInvalid ? "invalid" : "ok"}
      data-measurement-risk-selected={selectedRoute || "none"}
      data-measurement-method-selected={selectedMethod || "none"}
      data-critical-risk-supported={criticalRiskSupported ? "true" : "false"}
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

      <section
        className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6"
        data-measurement-option-section="risk"
      >
        <header data-measurement-risk-heading="true">
          <h3
            data-measurement-option-heading="body"
            className="font-serif text-lg font-bold text-heritage-green"
          >
            Body Measurements
          </h3>
          <p
            data-measurement-option-subtitle="risk"
            className="mt-1 text-sm leading-relaxed text-heritage-ink/65"
          >
            Measurement by Risk Level
          </p>
        </header>
        <fieldset data-measurement-risk-selector="true" className="mt-4">
          <legend className="sr-only">Body Measurements</legend>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {ROUTES.map((route) => {
              const selected = selectedRoute === route.id;
              const unavailable = route.id === "critical_risk" && !criticalRiskSupported;
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
                  data-measurement-risk-disabled={unavailable ? "true" : "false"}
                  className={`flex min-w-0 gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                    unavailable ? "cursor-not-allowed lg:col-span-3" : "cursor-pointer"
                  } ${
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
                    disabled={hydrationInvalid || (unavailable && !selected)}
                    onChange={() => {
                      if (hydrationInvalid || unavailable) return;
                      onRouteChange(route.id);
                    }}
                    className="mt-1 size-4 shrink-0 accent-heritage-green disabled:cursor-not-allowed"
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
                    <span className={`mt-1 block break-words leading-relaxed ${unavailable ? "text-sm text-heritage-ink" : "text-xs text-heritage-ink/65"}`}>
                      {unavailable && criticalRiskBlockingLabels.length > 0 ? (
                        <>
                          Critical Risk is unavailable because{" "}
                          <strong className="font-semibold text-heritage-green">
                            {criticalRiskBlockingLabels.length === 1
                              ? criticalRiskBlockingLabels[0]
                              : criticalRiskBlockingLabels.length === 2
                                ? `${criticalRiskBlockingLabels[0]} and ${criticalRiskBlockingLabels[1]}`
                                : `${criticalRiskBlockingLabels.slice(0, -1).join(", ")}, and ${criticalRiskBlockingLabels[criticalRiskBlockingLabels.length - 1]}`}
                          </strong>{" "}
                          still {criticalRiskBlockingLabels.length === 1 ? "needs" : "need"} measurements that cannot be calculated from height.
                        </>
                      ) : unavailable ? (
                        criticalRiskBlockMessage
                      ) : (
                        route.description
                      )}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section
        className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6"
        data-measurement-option-section="sample_cloth"
      >
        <fieldset data-measurement-sample-selector="true">
          <legend className="font-serif text-lg font-bold text-heritage-green">
            {MEASUREMENT_SAMPLE_CLOTH_LABEL}
          </legend>
          <p className="mt-2 text-sm leading-relaxed text-heritage-ink/70">
            {MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION}
          </p>
          <div className="mt-4">
            <label
              data-measurement-sample-option={MEASUREMENT_SAMPLE_CLOTH_METHOD}
              data-measurement-sample-selected={sampleSelected ? "true" : "false"}
              className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                sampleSelected
                  ? "border-heritage-gold bg-heritage-gold/10 shadow-sm ring-1 ring-heritage-gold/40"
                  : "border-heritage-green/15 hover:border-heritage-gold/45"
              }`}
            >
              <input
                type="radio"
                name="future-measurement-route"
                value={MEASUREMENT_SAMPLE_CLOTH_METHOD}
                checked={sampleSelected}
                disabled={hydrationInvalid}
                onChange={() => {
                  if (hydrationInvalid) return;
                  onRouteChange(MEASUREMENT_SAMPLE_CLOTH_METHOD);
                }}
                className="mt-1 size-4 shrink-0 accent-heritage-green"
              />
              <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words text-sm font-semibold text-heritage-green">
                    {MEASUREMENT_SAMPLE_CLOTH_LABEL}
                  </span>
                  {sampleStatus && (
                    <span className="rounded-full border border-heritage-gold/30 bg-white px-2 py-0.5 text-[10px] font-semibold tracking-wide text-heritage-ink/70">
                      {sampleStatus}
                    </span>
                  )}
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      </section>

      {hydrationInvalid && (
        <section
          role="alert"
          data-measurement-hydration-error="true"
          className="rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4"
        >
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-gold" />
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-heritage-green">Measurement review needed</h3>
              <p className="mt-2 text-sm text-heritage-ink/70">
                {FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE}
              </p>
            </div>
          </div>
        </section>
      )}

      {selectedMethod && !hydrationInvalid && (
        <>
      <section
        aria-live="polite"
        data-measurement-form={selectedMethod}
        className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/35 p-4 sm:p-5"
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
              {sampleSelected ? MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE : "Current route status"}
            </p>
            <h3 className="mt-1 font-serif text-lg font-bold text-heritage-green">
              {routeStatusLabel}
            </h3>
            <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
              {routeSaveMessage}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-heritage-green/15 bg-white px-3 py-2 text-xs font-semibold text-heritage-green">
            {completedManualInputCount} / {requiredUnitCount} saved
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

      {measurementGarments.length > 1 && (
        <section className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-serif text-lg font-bold text-heritage-green">
            Choose a garment
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-heritage-ink/65">
            Add the measurements for one garment at a time. Shared body measurements stay saved when you switch.
          </p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Choose a garment to measure">
            {measurementGarments.map((garment) => {
              const label = formatGarmentLabel(
                occurrenceLabels,
                garment.garmentType,
                garment.garmentKey,
              );
              const pending = !measurableGarmentKeys.has(garment.garmentKey);
              const selected = garment.garmentKey === selectedGarmentKey;
              return (
                <button
                  key={garment.garmentKey}
                  type="button"
                  aria-pressed={selected}
                  data-measurement-garment={garment.garmentKey}
                  data-measurement-garment-pending={pending ? "true" : "false"}
                  onClick={() => setPickedGarmentKey(garment.garmentKey)}
                  className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${
                    selected
                      ? "border-heritage-green bg-heritage-green text-white"
                      : "border-heritage-green/20 bg-white text-heritage-green hover:border-heritage-gold/45"
                  }`}
                >
                  <span className="break-words">{label}</span>
                  {pending && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      selected ? "bg-white/15 text-white" : "bg-heritage-gold/15 text-heritage-gold"
                    }`}>
                      Setup pending
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {selectedGarmentPending && (
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
              <p className="mt-2 inline-flex rounded-full border border-heritage-gold/25 bg-white px-2.5 py-1 text-xs font-semibold text-heritage-green">
                {selectedGarmentLabel}
              </p>
            </div>
          </div>
        </section>
      )}

      {blockerMessages.length > 0 && !selectedGarmentPending && (
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

      {!selectedGarmentPending && visibleRequiredRequirements.length > 0 && (
      <MeasurementSection
        title="Required Measurements"
        description={
          sampleSelected
            ? MEASUREMENT_SAMPLE_CLOTH_REQUIRED_DESCRIPTION
            : selectedRoute === "low_risk"
            ? "Enter each of these measurements. They are not calculated from height."
            : "Enter these measurements. The remaining values for this garment are calculated from Total Height."
        }
        requirements={visibleRequiredRequirements}
        state={resolvedState}
        onChange={onChange}
        section="required"
        sampleMode={sampleSelected}
        occurrenceLabels={occurrenceLabels}
      />
      )}

      {!selectedGarmentPending && visibleCalculatedRequirements.length > 0 && !sampleSelected && (
        <MeasurementSection
          title={CALCULATED_FROM_HEIGHT_LABEL}
          description={CALCULATED_FROM_HEIGHT_DESCRIPTION}
          requirements={visibleCalculatedRequirements}
          state={resolvedState}
          onChange={onChange}
          section="calculated"
          sampleMode={false}
          occurrenceLabels={occurrenceLabels}
        />
      )}

      {!selectedGarmentPending && visibleOptionalRequirements.length > 0 && (
        <MeasurementSection
          title="Optional Measurements"
          description="Add any of these if you want. They are not required."
          requirements={visibleOptionalRequirements}
          state={resolvedState}
          onChange={onChange}
          section="optional"
          sampleMode={sampleSelected}
          occurrenceLabels={occurrenceLabels}
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
