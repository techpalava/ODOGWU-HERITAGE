import { ArrowLeft, LockKeyhole, Ruler, ShieldAlert } from "lucide-react";
import type {
  FutureMeasurementStateV1,
  MeasurementRiskRoute,
  MeasurementUnit,
} from "../types";
import {
  fromCanonicalCentimetres,
  reconcileFutureMeasurementState,
  roundMeasurementDisplayValue,
  setFutureMeasurementInput,
  setFutureMeasurementUnit,
  type MeasurementRequirementPlan,
} from "../utils/measurementBlueprint";

interface DormantFutureMeasurementStepProps {
  plan: MeasurementRequirementPlan;
  state: FutureMeasurementStateV1;
  onChange: (state: FutureMeasurementStateV1) => void;
  onRouteChange: (route: MeasurementRiskRoute) => void;
  onBack: () => void;
}

const ROUTES: ReadonlyArray<{
  id: MeasurementRiskRoute;
  title: string;
  description: string;
}> = [
  {
    id: "low_risk",
    title: "Low Risk — Complete Measurement Set",
    description: "Enter the complete direct measurement set from the approved garment profile.",
  },
  {
    id: "medium_risk",
    title: "Mid Risk — Minimum Measurement Set",
    description: "Uses fewer direct inputs and will require an approved calculation formula.",
  },
  {
    id: "high_risk",
    title: "High Risk — Minimal Measurement Set",
    description: "Uses the workbook's smallest marked set and requires approved calculations.",
  },
];

const getBlockerMessage = (
  diagnostic: FutureMeasurementStateV1["diagnostics"][number],
): string => {
  switch (diagnostic.code) {
    case "measurement_profile_unmapped":
      return "An authoritative measurement profile is not yet available for one selected garment.";
    case "applicability_unresolved":
      return "A measurement choice cannot be resolved from the selected construction details yet.";
    case "calculation_configuration_pending":
      return "Automatic measurement calculations are awaiting an approved formula.";
    case "required_measurement_missing":
      return "Complete every required measurement shown below.";
    default:
      return "Measurement details need review before this step can be completed.";
  }
};

export const DormantFutureMeasurementStep = ({
  plan,
  state,
  onChange,
  onRouteChange,
  onBack,
}: DormantFutureMeasurementStepProps) => {
  const resolvedState = reconcileFutureMeasurementState({ state, plan });
  const directRequirements = plan.requirements.filter(
    (requirement) => requirement.directInput,
  );
  const blockerMessages = [...new Set(resolvedState.diagnostics.map(getBlockerMessage))];

  const handleUnitChange = (unit: MeasurementUnit) => {
    onChange(setFutureMeasurementUnit(resolvedState, unit));
  };

  return (
    <section
      aria-labelledby="future-measurement-title"
      data-stage-id="measurement"
      data-measurement-status={resolvedState.calculationStatus}
      className="space-y-5 font-sans"
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to AI Try-on
        </button>
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
          Enter measurements for the garments in this design. Values are stored
          in a canonical unit so switching between inches and centimetres keeps
          the same physical measurement.
        </p>
      </div>

      <div className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
        <fieldset>
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Measurement route
          </legend>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {ROUTES.map((route) => (
              <label
                key={route.id}
                className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                  state.route === route.id
                    ? "border-heritage-gold bg-heritage-gold/8"
                    : "border-heritage-green/15 hover:border-heritage-gold/45"
                }`}
              >
                <input
                  type="radio"
                  name="future-measurement-route"
                  value={route.id}
                  checked={state.route === route.id}
                  onChange={() => onRouteChange(route.id)}
                  className="mt-1 size-4 shrink-0 accent-heritage-green"
                />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-bold text-heritage-green">
                    {route.title}
                  </span>
                  <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">
                    {route.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-xs font-bold uppercase tracking-wider text-heritage-green">
            Measurement unit
          </legend>
          <div className="mt-3 inline-flex rounded-xl border border-heritage-green/20 bg-heritage-cream/30 p-1">
            {(["inch", "cm"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={state.unit === unit}
                onClick={() => handleUnitChange(unit)}
                className={`min-h-11 rounded-lg px-5 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
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
      </div>

      {blockerMessages.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4"
        >
          <div className="flex min-w-0 items-start gap-3">
            <ShieldAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-heritage-gold" />
            <div className="min-w-0">
              <h3 className="font-serif font-bold text-heritage-green">Measurement review needed</h3>
              <ul className="mt-2 space-y-1 text-sm text-heritage-ink/70">
                {blockerMessages.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <Ruler aria-hidden="true" className="shrink-0 text-heritage-gold" size={20} />
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-heritage-green">Required direct measurements</h3>
            <p className="text-xs text-heritage-ink/60">
              {directRequirements.length} field{directRequirements.length === 1 ? "" : "s"} for the selected garments.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {directRequirements.map((requirement) => {
            const stored = requirement.scope === "shared"
              ? resolvedState.entered.shared[requirement.measurementId]
              : resolvedState.entered.byGarmentKey[requirement.garmentKey || ""]?.[requirement.measurementId];
            const displayValue = stored
              ? roundMeasurementDisplayValue(
                  fromCanonicalCentimetres(stored.valueCm, resolvedState.unit),
                )
              : "";
            const inputId = `measurement-${requirement.key.replace(/[^a-z0-9_-]/gi, "-")}`;
            return (
              <label
                key={requirement.key}
                htmlFor={inputId}
                className="min-w-0 rounded-xl border border-heritage-green/15 bg-heritage-cream/20 p-4"
              >
                <span className="block break-words text-sm font-bold text-heritage-green">
                  {requirement.definition.customerLabel}
                </span>
                {requirement.scope === "garment" && (
                  <span className="mt-1 block break-words text-[10px] font-semibold uppercase tracking-wider text-heritage-gold">
                    {requirement.garmentType?.replaceAll("_", " ")} · {requirement.garmentKey}
                  </span>
                )}
                {requirement.definition.instructions && (
                  <span className="mt-1 block text-xs leading-relaxed text-heritage-ink/60">
                    {requirement.definition.instructions}
                  </span>
                )}
                <span className="relative mt-3 block">
                  <input
                    id={inputId}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={displayValue}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const next = raw === "" ? null : Number(raw);
                      onChange(setFutureMeasurementInput({
                        state: resolvedState,
                        requirement,
                        displayValue: next,
                      }));
                    }}
                    className="min-h-11 w-full rounded-xl border border-heritage-green/20 bg-white px-3 pr-12 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-heritage-ink/50">
                    {resolvedState.unit === "inch" ? "in" : "cm"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={14} />
          Back to AI Try-on
        </button>
        <button
          type="button"
          disabled
          aria-label="Continue to Summary is locked"
          className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-heritage-green/35 px-5 text-xs font-bold uppercase tracking-wider text-white"
        >
          <LockKeyhole aria-hidden="true" size={14} />
          Summary is locked
        </button>
      </div>
    </section>
  );
};
