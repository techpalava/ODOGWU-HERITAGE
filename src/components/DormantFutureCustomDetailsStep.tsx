import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE } from "../config/GarmentDetailsConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  CustomDetailOption,
  CustomDetailSelectionGroup,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
} from "../types";
import type {
  GarmentScopedCustomDetailsCompletionResult,
  GarmentScopedCustomDetailsPricingResult,
  GarmentScopedCustomDetailsReconciliationResult,
} from "../utils/garmentScopedCustomDetailsDomain";
import {
  getGarmentScopedCustomDetailSelection,
} from "../utils/garmentScopedCustomDetailsState";
import {
  GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH,
  getGarmentScopedCustomDetailText,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  validateGarmentScopedCustomDetailText,
} from "../utils/garmentScopedCustomDetailInputsState";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import { isFutureCustomDetailsContentReady } from "../utils/aiTryOnWorkflow";

interface DormantFutureCustomDetailsStepProps {
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  personalizedInputs: GarmentScopedCustomDetailInputsV1;
  completion: GarmentScopedCustomDetailsCompletionResult;
  pricing: GarmentScopedCustomDetailsPricingResult;
  constructionSubtotal: number;
  fabricSubtotal: number | null;
  onSingleSelect: (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
  ) => void;
  onToggleMultiSelect: (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
  ) => void;
  onPersonalizedTextChange: (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
    text: string,
  ) => void;
  onBack: () => void;
  onContinue: () => void;
}

const getSubjectLabel = (
  subject: GarmentScopedCustomDetailsReconciliationResult["subjects"][number],
): string => {
  const garmentLabel = getFabricGarmentLabel(subject.garmentType);
  return subject.parentGarmentType === subject.garmentType
    ? garmentLabel
    : `${getFabricGarmentLabel(subject.parentGarmentType)} ${garmentLabel}`;
};

const isSelected = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): boolean => {
  const selection = getGarmentScopedCustomDetailSelection(
    state,
    garmentKey,
    selectionGroup,
  );
  return Array.isArray(selection)
    ? selection.includes(optionId)
    : selection === optionId;
};

const getOptionPriceLabel = (option: CustomDetailOption): string =>
  option.requiresEvaluation
    ? "Price requires evaluation."
    : `${PRICING_CURRENCY_SYMBOL}${(option.priceCents / 100).toFixed(2)}`;

const getIdentityKey = (
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): string => `${garmentKey}\u0000${selectionGroup}\u0000${optionId}`;

export const DormantFutureCustomDetailsStep = ({
  reconciliation,
  personalizedInputs,
  completion,
  pricing,
  constructionSubtotal,
  fabricSubtotal,
  onSingleSelect,
  onToggleMultiSelect,
  onPersonalizedTextChange,
  onBack,
  onContinue,
}: DormantFutureCustomDetailsStepProps) => {
  const [overLimitText, setOverLimitText] = useState<Record<string, string>>(
    {},
  );
  const selectedPersonalizedIdentities = useMemo(
    () =>
      reconciliation.subjects.flatMap((subject) => {
        const group = reconciliation.applicabilityByGarmentKey
          .get(subject.garmentKey)
          ?.groups.find(
            (candidate) =>
              candidate.selectionGroup ===
              PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
          );
        return group?.options.some(
          (option) =>
            option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID &&
            isSelected(
              reconciliation.state,
              subject.garmentKey,
              group.selectionGroup,
              option.id,
            ),
        )
          ? [
              getIdentityKey(
                subject.garmentKey,
                PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
                PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
              ),
            ]
          : [];
      }),
    [reconciliation],
  );
  const selectedPersonalizedSignature = selectedPersonalizedIdentities.join(",");

  useEffect(() => {
    const retained = new Set(selectedPersonalizedIdentities);
    setOverLimitText((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => retained.has(key)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [selectedPersonalizedSignature, selectedPersonalizedIdentities]);

  const customDetailsSubtotal =
    pricing.status === "exact"
      ? pricing.subtotal
      : pricing.exactSubtotalCents / 100;
  const estimatedTotal =
    fabricSubtotal === null || pricing.status !== "exact"
      ? null
      : constructionSubtotal + fabricSubtotal + customDetailsSubtotal;
  const subjectLabelByGarmentKey = new Map(
    reconciliation.subjects.map((subject) => [
      subject.garmentKey,
      getSubjectLabel(subject),
    ]),
  );
  const canContinue = isFutureCustomDetailsContentReady(completion);

  return (
    <section
      aria-labelledby="future-custom-details-title"
      data-stage-id="custom_details"
      data-stage-complete={canContinue}
      className="space-y-6 font-sans"
    >
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Design Style
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 4 of 9
        </p>
        <h2
          id="future-custom-details-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Custom Details
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Select the finishing details for each garment. Base garment construction
          was selected in Garment Type and is already included in your price.
        </p>
      </div>

      {completion.blockers.length > 0 && (
        <div
          role="alert"
          className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4"
        >
          <p className="text-sm font-bold text-heritage-green">
            Custom Details need attention
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">
            {Array.from(new Set(completion.blockers.map((blocker) => blocker.message))).map(
              (message) => (
                <li key={message}>{message}</li>
              ),
            )}
          </ul>
        </div>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-5">
        {reconciliation.subjects.map((subject) => {
          const applicability = reconciliation.applicabilityByGarmentKey.get(
            subject.garmentKey,
          );
          const subjectNeedsAttention = completion.blockers.some(
            (blocker) => blocker.garmentKey === subject.garmentKey,
          );
          return (
            <article
              key={subject.garmentKey}
              className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5"
            >
              <header className="flex min-w-0 flex-col gap-2 border-b border-heritage-gold/15 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-words font-serif text-lg font-bold text-heritage-green">
                    {getSubjectLabel(subject)}
                  </h3>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-heritage-ink/60">
                    Base garment construction was selected in Garment Type and is already included in your price.
                  </p>
                </div>
                <span
                  className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${
                    subjectNeedsAttention
                      ? "border-heritage-gold/35 bg-heritage-cream/70 text-heritage-gold"
                      : "border-heritage-green/20 bg-heritage-green/5 text-heritage-green"
                  }`}
                >
                  {subjectNeedsAttention ? "Needs attention" : "Ready"}
                </span>
              </header>
              <div className="mt-4 space-y-5">
                {applicability?.groups.map((group) => {
                  const groupId = `future-custom-detail-${subject.garmentKey}-${group.selectionGroup}`;
                  const groupBlocker = completion.blockers.find(
                    (blocker) =>
                      blocker.garmentKey === subject.garmentKey &&
                      blocker.selectionGroup === group.selectionGroup,
                  );
                  return (
                    <fieldset key={group.selectionGroup} className="min-w-0">
                      <legend className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold text-heritage-green">
                        <span className="min-w-0 break-words">
                          {CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[group.selectionGroup]}
                        </span>
                        <span className="rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">
                          {group.required ? "Required" : "Optional"}
                        </span>
                      </legend>
                      <p className="mt-1 text-[11px] text-heritage-ink/55">
                        {group.allowMultiple
                          ? "Choose all that apply."
                          : "Choose one option."}
                      </p>
                      {groupBlocker && (
                        <p id={`${groupId}-error`} className="mt-1 text-xs text-red-700">
                          {groupBlocker.message}
                        </p>
                      )}
                      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                        {group.options.map((option) => {
                          const optionId = `${groupId}-${option.id}`;
                          const checked = isSelected(
                            reconciliation.state,
                            subject.garmentKey,
                            group.selectionGroup,
                            option.id,
                          );
                          const isPersonalizedRequirement =
                            group.selectionGroup ===
                              PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
                            option.id ===
                              PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;
                          const identity = getIdentityKey(
                            subject.garmentKey,
                            group.selectionGroup,
                            option.id,
                          );
                          const persistedText = getGarmentScopedCustomDetailText(
                            personalizedInputs,
                            subject.garmentKey,
                            group.selectionGroup,
                            option.id,
                          );
                          const text = overLimitText[identity] ?? persistedText ?? "";
                          const textValidation = validateGarmentScopedCustomDetailText(text);
                          const textError =
                            isPersonalizedRequirement && checked
                              ? textValidation.status === "too_long"
                                ? `Use ${GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()} characters or fewer.`
                                : textValidation.status === "empty"
                                  ? "Describe your personalized requirement before continuing."
                                  : undefined
                              : undefined;
                          return (
                            <div key={option.id} className="min-w-0">
                              <label
                                htmlFor={optionId}
                                className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                                  checked
                                    ? "border-heritage-gold bg-heritage-gold/10"
                                    : "border-heritage-green/15 hover:border-heritage-gold/45"
                                }`}
                              >
                                <input
                                  id={optionId}
                                  type={group.allowMultiple ? "checkbox" : "radio"}
                                  name={group.allowMultiple ? undefined : groupId}
                                  checked={checked}
                                  onChange={() =>
                                    group.allowMultiple
                                      ? onToggleMultiSelect(
                                          subject.garmentKey,
                                          group.selectionGroup,
                                          option.id,
                                        )
                                      : onSingleSelect(
                                          subject.garmentKey,
                                          group.selectionGroup,
                                          option.id,
                                        )
                                  }
                                  aria-describedby={
                                    textError ? `${optionId}-text-error` : undefined
                                  }
                                  className="mt-0.5 size-4 shrink-0 accent-heritage-green"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                    <span className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">
                                      {option.label}
                                    </span>
                                    <span className="shrink-0 rounded-md bg-heritage-cream/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-heritage-gold">
                                      {getOptionPriceLabel(option)}
                                    </span>
                                  </span>
                                  {option.description && (
                                    <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">
                                      {option.description}
                                    </span>
                                  )}
                                  {option.requiresEvaluation && (
                                    <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-heritage-ink/50">
                                      Confirmed after tailoring review
                                    </span>
                                  )}
                                </span>
                              </label>
                              {isPersonalizedRequirement && checked && (
                                <div className="mt-2">
                                  <label
                                    htmlFor={`${optionId}-text`}
                                    className="text-xs font-bold text-heritage-green"
                                  >
                                    Describe your personalized requirement
                                  </label>
                                  <p id={`${optionId}-text-help`} className="mt-1 text-[11px] text-heritage-ink/60">
                                    Provide the details our tailoring team should evaluate.
                                  </p>
                                  <textarea
                                    id={`${optionId}-text`}
                                    value={text}
                                    onChange={(event) => {
                                      const nextText = event.target.value;
                                      const nextValidation = validateGarmentScopedCustomDetailText(nextText);
                                      if (nextValidation.status === "too_long") {
                                        setOverLimitText((current) => ({
                                          ...current,
                                          [identity]: nextText,
                                        }));
                                        return;
                                      }
                                      setOverLimitText((current) => {
                                        const { [identity]: _removed, ...rest } = current;
                                        return rest;
                                      });
                                      onPersonalizedTextChange(
                                        subject.garmentKey,
                                        group.selectionGroup,
                                        option.id,
                                        nextText,
                                      );
                                    }}
                                    aria-describedby={`${optionId}-text-help${textError ? ` ${optionId}-text-error` : ""}`}
                                    aria-invalid={Boolean(textError)}
                                    className="mt-2 min-h-28 w-full rounded-xl border border-heritage-green/20 bg-white p-3 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30"
                                  />
                                  <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
                                    <span id={`${optionId}-text-error`} className="text-red-700">
                                      {textError}
                                    </span>
                                    <span className="shrink-0 text-heritage-ink/55">
                                      {text.length}/{GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
                {(!applicability || applicability.groups.length === 0) && (
                  <p className="text-sm text-heritage-ink/60">
                    No editable Custom Details apply to this garment.
                  </p>
                )}
              </div>
            </article>
          );
          })}
        </div>

        <aside className="mt-5 min-w-0 rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:mt-0">
          <h3 className="font-serif text-lg font-bold text-heritage-green">
            Future Price Summary
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
            Updates from your eligible Custom Details appear here.
          </p>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words text-heritage-ink/70">Base garment construction</span>
              <span className="shrink-0 font-mono font-bold text-heritage-green">
                {PRICING_CURRENCY_SYMBOL}{constructionSubtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words text-heritage-ink/70">Fabric subtotal</span>
              <span className="shrink-0 font-mono font-bold text-heritage-green">
                {fabricSubtotal === null
                  ? "Pending"
                  : `${PRICING_CURRENCY_SYMBOL}${fabricSubtotal.toFixed(2)}`}
              </span>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 break-words text-heritage-ink/70">Custom Details subtotal</span>
              <span className="shrink-0 font-mono font-bold text-heritage-green">
                {PRICING_CURRENCY_SYMBOL}{customDetailsSubtotal.toFixed(2)}
              </span>
            </div>
            {pricing.lines.length > 0 && (
              <div className="space-y-2 border-t border-heritage-gold/15 pt-3">
                {pricing.lines.map((line) => (
                  <div
                    key={line.occurrenceKey}
                    className="flex min-w-0 items-start justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 break-words leading-relaxed text-heritage-ink/60">
                      {subjectLabelByGarmentKey.get(line.garmentKey) || "Garment"}: {line.label}
                    </span>
                    <span className="shrink-0 font-mono text-heritage-green">
                      {line.status === "evaluation_required"
                        ? "Evaluation"
                        : line.status === "exact" && line.lineTotalCents !== undefined
                          ? `${PRICING_CURRENCY_SYMBOL}${(line.lineTotalCents / 100).toFixed(2)}`
                          : "Review"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pricing.status === "pending" && (
              <p className="rounded-lg bg-heritage-cream/50 p-2 text-xs leading-relaxed text-heritage-ink/70">
                A personalized requirement needs price evaluation before an exact total is available.
              </p>
            )}
            {pricing.status === "invalid" && (
              <p className="rounded-lg bg-red-50 p-2 text-xs leading-relaxed text-red-700">
                A saved Custom Details price needs review.
              </p>
            )}
            <div className="flex min-w-0 items-start justify-between gap-3 border-t border-heritage-gold/15 pt-3 font-bold text-heritage-green">
              <span className="min-w-0 break-words">Estimated total so far</span>
              <span className="shrink-0 font-mono">
                {estimatedTotal === null
                  ? "Pending"
                  : `${PRICING_CURRENCY_SYMBOL}${estimatedTotal.toFixed(2)}`}
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={15} />
          Back to Design Style
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          aria-label={
            canContinue
              ? "Continue to AI Try-on"
              : "Continue to AI Try-on is locked until Custom Details are complete"
          }
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue to AI Try-on
          <ArrowRight aria-hidden="true" size={14} />
        </button>
      </div>
    </section>
  );
};
