import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Pencil,
} from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type React from "react";
import { SELECTED_DESIGN_PRICE_SUPPORTING_TEXT } from "../utils/designPriceBreakdownPresentation";
import type { FutureDesignStudioSummary } from "../utils/designStudioFutureSummary";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

interface DormantFutureSummaryStepProps {
  summary: FutureDesignStudioSummary;
  onBack: () => void;
  onEditGarments: () => void;
  onEditFabrics: () => void;
  onEditDesignStyle: () => void;
  onEditCustomDetails: () => void;
  onEditAiTryOn: () => void;
  onEditMeasurements: () => void;
  canContinueToShipping: boolean;
  onContinueToShipping: () => void;
}

const money = (value: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${value.toFixed(2)}`;

const EditButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-heritage-green/20 px-3 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:w-auto"
  >
    <Pencil aria-hidden="true" size={13} />
    {label}
  </button>
);

const Section = ({
  title,
  description,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  description?: string;
  editLabel: string;
  onEdit: () => void;
  children: React.ReactNode;
}) => (
  <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h3 className="font-serif text-lg font-bold text-heritage-green">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
            {description}
          </p>
        )}
      </div>
      <EditButton label={editLabel} onClick={onEdit} />
    </div>
    <div className="mt-4 min-w-0">{children}</div>
  </section>
);

export const DormantFutureSummaryStep = ({
  summary,
  onBack,
  onEditGarments,
  onEditFabrics,
  onEditDesignStyle,
  onEditCustomDetails,
  onEditAiTryOn,
  onEditMeasurements,
  canContinueToShipping,
  onContinueToShipping,
}: DormantFutureSummaryStepProps) => {
  const isReady = summary.status === "ready";
  const firstBlocker = summary.blockers[0] || null;
  const blockerEditAction = firstBlocker
    ? {
        garments: { label: "Edit Garments", onClick: onEditGarments },
        fabrics: { label: "Edit Fabrics", onClick: onEditFabrics },
        design_style: { label: "Edit Design Style", onClick: onEditDesignStyle },
        custom_details: { label: "Edit Custom Details", onClick: onEditCustomDetails },
        ai_try_on: { label: "Edit AI Try-on", onClick: onEditAiTryOn },
        measurements: { label: "Edit Measurements", onClick: onEditMeasurements },
        pricing: { label: "Edit Custom Details", onClick: onEditCustomDetails },
      }[firstBlocker.section]
    : null;
  const statusTitle = isReady
    ? "Your design summary is ready"
    : summary.status === "pricing_pending"
      ? "Price evaluation required"
      : summary.status === "measurement_calculation_pending"
        ? "Measurement calculation pending"
        : summary.status === "profile_mapping_pending"
          ? "Measurement setup pending"
          : "Review needed";
  const statusDescription = isReady
    ? "Review your selections below. You can return to any completed step to make changes."
    : summary.status === "pricing_pending"
      ? "One or more personalised requirements must be evaluated before an exact total can be confirmed."
      : firstBlocker?.message || "Review the first incomplete selection before continuing.";
  const knownConfirmedPrice =
    summary.pricingSummary.garmentConstructionSubtotal === null
      ? null
      : summary.pricingSummary.garmentConstructionSubtotal +
        summary.pricingSummary.customDetailsExactSubtotal;

  return (
    <section
      aria-labelledby="future-summary-title"
      data-stage-id="summary"
      data-summary-status={summary.status}
      className="mx-auto max-w-6xl space-y-5 font-sans"
    >
      <header className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Measurement"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 7 of 9
        </p>
        <h2
          id="future-summary-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Summary
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Review the choices from Garment Type through Measurements before
          Shipping becomes available.
        </p>
      </header>

      <div
        role="status"
        aria-live="polite"
        className={`rounded-2xl border p-4 sm:p-5 ${
          isReady
            ? "border-heritage-green/20 bg-heritage-green/5"
            : "border-heritage-gold/35 bg-heritage-gold/8"
        }`}
      >
        <div className="flex min-w-0 items-start gap-3">
          {isReady ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-green"
              size={19}
            />
          ) : (
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-heritage-gold"
              size={19}
            />
          )}
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-heritage-green">
              {statusTitle}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
              {statusDescription}
            </p>
            {firstBlocker && !isReady && blockerEditAction && (
              <div className="mt-3">
                <EditButton
                  label={blockerEditAction.label}
                  onClick={blockerEditAction.onClick}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <Section
        title="Garments"
        description="Each garment keeps its own construction and fabric requirements."
        editLabel="Edit Garments"
        onEdit={onEditGarments}
      >
        <div className="space-y-3">
          {summary.garmentSummary.map((garment) => (
            <article
              key={garment.garmentKey}
              className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-4"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h4 className="min-w-0 break-words font-bold text-heritage-green">
                  {garment.label}
                </h4>
                <span className="rounded-full border border-heritage-gold/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-heritage-gold">
                  {garment.role}
                </span>
              </div>
              <p className="mt-1 text-xs capitalize text-heritage-ink/60">
                {garment.demographic || "Demographic pending"} | {garment.fabricUnits} fabric capacity unit{garment.fabricUnits === 1 ? "" : "s"}
              </p>
              {garment.physicalComponents.length > 1 && (
                <p className="mt-2 text-xs text-heritage-ink/70">
                  Components: {garment.physicalComponents.map((component) => component.label).join(", ")}
                </p>
              )}
              <ul className="mt-3 space-y-1 text-sm text-heritage-ink/75">
                {garment.construction.map((component) => (
                  <li
                    key={component.componentKey}
                    className="flex min-w-0 flex-wrap justify-between gap-2"
                  >
                    <span className="min-w-0 break-words">{component.label}</span>
                    <span className="shrink-0 font-mono font-bold text-heritage-green">
                      {money(component.priceCents / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Fabrics"
        description="Each fabric selection is shown once for its assigned garments."
        editLabel="Edit Fabrics"
        onEdit={onEditFabrics}
      >
        <div className="space-y-3">
          {summary.fabricSummary.map((allocation, index) => (
            <article
              key={allocation.allocationId}
              className="min-w-0 rounded-xl border border-heritage-green/12 bg-heritage-cream/20 p-4"
            >
              <div className="flex min-w-0 flex-wrap justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                    Fabric Selection {index + 1}
                  </p>
                  <h4 className="mt-1 break-words font-bold text-heritage-green">
                    {allocation.fabricName}
                  </h4>
                  <p
                    title={allocation.fabricCode}
                    className="mt-1 break-words font-mono text-xs text-heritage-ink/60"
                  >
                    {allocation.fabricCode}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="block font-mono font-bold text-heritage-green">
                    {allocation.materialPrice === null
                      ? "Price unavailable"
                      : "Included"}
                  </span>
                  <span
                    className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      allocation.availability === "available"
                        ? "bg-heritage-green/10 text-heritage-green"
                        : "bg-heritage-gold/15 text-heritage-ink/70"
                    }`}
                  >
                    {allocation.availability === "available"
                      ? "Available"
                      : allocation.availability === "unavailable"
                        ? "Unavailable"
                        : "Needs review"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs text-heritage-ink/65">
                {allocation.garments.map((garment) => garment.label).join(", ")} | {allocation.capacityUnits} capacity unit{allocation.capacityUnits === 1 ? "" : "s"}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Design Style"
        description="Your selected style remains separate from garment and fabric pricing."
        editLabel="Edit Design Style"
        onEdit={onEditDesignStyle}
      >
        {summary.designStyleSummary ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
            <div className="aspect-[4/5] overflow-hidden rounded-xl bg-heritage-cream/35">
              {summary.designStyleSummary.image ? (
                <>
                  <img
                    src={summary.designStyleSummary.image}
                    alt={`${summary.designStyleSummary.name} design`}
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.classList.add("hidden");
                      event.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <span className="hidden h-full items-center justify-center p-2 text-center text-[10px] text-heritage-ink/45">
                    Image unavailable
                  </span>
                </>
              ) : (
                <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-heritage-ink/45">
                  Image unavailable
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="break-words font-bold text-heritage-green">
                {summary.designStyleSummary.name}
              </h4>
              <p className="mt-1 break-words text-sm text-heritage-ink/70">
                {summary.designStyleSummary.compositionLabel}
              </p>
              <p className="mt-1 text-xs capitalize text-heritage-ink/55">
                {summary.designStyleSummary.demographic}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-heritage-ink/65">Design Style needs review.</p>
        )}
      </Section>

      <Section
        title="Custom Details"
        description="Selections remain grouped with the garment they apply to."
        editLabel="Edit Custom Details"
        onEdit={onEditCustomDetails}
      >
        {summary.customDetailsSummary.length === 0 ? (
          <p className="text-sm text-heritage-ink/65">No optional Custom Details selected.</p>
        ) : (
          <div className="space-y-4">
            {summary.customDetailsSummary.map((garment) => (
              <article key={garment.garmentKey} className="min-w-0">
                <h4 className="font-bold text-heritage-green">{garment.garmentLabel}</h4>
                <ul className="mt-2 divide-y divide-heritage-green/10 rounded-xl border border-heritage-green/12">
                  {garment.occurrences.map((occurrence) => (
                    <li key={occurrence.occurrenceKey} className="min-w-0 p-3">
                      <div className="flex min-w-0 flex-wrap justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                            {occurrence.selectionGroupTitle}
                          </p>
                          <p className="mt-1 break-words text-sm text-heritage-ink/80">
                            {occurrence.optionLabel}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-bold text-heritage-green">
                          {occurrence.priceStatus === "evaluation_required"
                            ? "Price requires evaluation"
                            : occurrence.priceCents === null
                              ? "Price unavailable"
                              : occurrence.priceCents === 0
                                ? "Included"
                                : money(occurrence.priceCents / 100)}
                        </span>
                      </div>
                      {occurrence.personalizedText && (
                        <p className="mt-2 break-words rounded-lg bg-heritage-cream/45 px-3 py-2 text-xs leading-relaxed text-heritage-ink/70">
                          {occurrence.personalizedText}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </Section>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Section
          title="AI Try-on"
          description="Your private try-on status is shown without exposing any image or provider details."
          editLabel="Edit AI Try-on"
          onEdit={onEditAiTryOn}
        >
          <p className="text-sm font-semibold text-heritage-green">
            {summary.aiTryOnSummary.label}
          </p>
        </Section>
        <Section
          title="Measurements"
          description="Measurements are displayed using the unit selected in Step 6."
          editLabel="Edit Measurements"
          onEdit={onEditMeasurements}
        >
          <p className="text-sm font-semibold text-heritage-green">
            {summary.measurementSummary.routeLabel}
          </p>
          <p className="mt-1 text-xs text-heritage-ink/60">
            Display unit: {summary.measurementSummary.unit === "inch" ? "Inches" : "Centimetres"}
          </p>
          {summary.measurementSummary.shared.length > 0 && (
            <div className="mt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                Shared body measurements
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-heritage-ink/75">
                {summary.measurementSummary.shared.map((measurement) => (
                  <li key={measurement.requirementKey} className="flex min-w-0 justify-between gap-3">
                    <span className="min-w-0 break-words">{measurement.label}</span>
                    <span className="shrink-0 font-mono">{measurement.formattedValue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.measurementSummary.byGarment.map((garment) => (
            <div key={garment.garmentKey} className="mt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                {garment.garmentLabel}
              </h4>
              <ul className="mt-2 space-y-1 text-sm text-heritage-ink/75">
                {garment.values.map((measurement) => (
                  <li key={measurement.requirementKey} className="flex min-w-0 justify-between gap-3">
                    <span className="min-w-0 break-words">{measurement.label}</span>
                    <span className="shrink-0 font-mono">{measurement.formattedValue}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      </div>

      <section className="rounded-2xl border border-heritage-gold/30 bg-heritage-green p-5 text-white shadow-sm sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-heritage-gold">
          Garment Construction Subtotal
        </p>
        <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-xl font-bold sm:text-2xl">
              {summary.pricingSummary.garmentConstructionSubtotal === null
                ? "Price unavailable"
                : money(summary.pricingSummary.garmentConstructionSubtotal)}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/75">
              {SELECTED_DESIGN_PRICE_SUPPORTING_TEXT}
            </p>
            {summary.pricingSummary.status === "pending" && knownConfirmedPrice !== null && (
              <p className="mt-3 text-xs leading-relaxed text-white/75">
                Known priced selections: {money(knownConfirmedPrice)}. This is not a final total.
              </p>
            )}
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/65">Custom Details</dt>
            <dd className="text-right font-mono">
              {summary.pricingSummary.status === "pending"
                ? "Evaluation required"
                : money(summary.pricingSummary.customDetailsExactSubtotal)}
            </dd>
            <dt className="text-white/65">Selected Design Total</dt>
            <dd className="text-right font-mono font-bold">
              {summary.pricingSummary.status === "exact" &&
              summary.pricingSummary.selectedDesignPrice
                ? money(summary.pricingSummary.selectedDesignPrice.selectedDesignPrice)
                : "Pending"}
            </dd>
          </dl>
        </div>
      </section>

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DesignStudioBackButton
            destination="Measurement"
            onClick={onBack}
            className="w-full sm:w-auto"
          />
          <div className="min-w-0 sm:text-right">
            <p id="summary-shipping-lock-reason" className="mb-2 text-xs leading-relaxed text-heritage-ink/60">
              {canContinueToShipping
                ? "Your Summary is ready. Continue to choose collection or post-Eindhoven delivery."
                : "Shipping becomes available when this Summary is fully ready."}
            </p>
            <button
              type="button"
              onClick={onContinueToShipping}
              disabled={!canContinueToShipping}
              aria-describedby="summary-shipping-lock-reason"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 sm:w-auto"
            >
              {canContinueToShipping ? (
                <ArrowRight aria-hidden="true" size={14} />
              ) : (
                <LockKeyhole aria-hidden="true" size={14} />
              )}
              Continue to Shipping
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
};
