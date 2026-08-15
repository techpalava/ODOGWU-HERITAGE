import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  DecorativeFeature,
  DesignSelections,
  FabricGarmentAssignment,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
  MonogramPlacement,
  StyleCategory,
} from "../types";
import type { TraditionalAccessory } from "../utils/decorativePricing";
import {
  DECORATIVE_FEATURE_DESCRIPTIONS,
  DECORATIVE_FEATURE_OPTIONS,
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
  getApplicableDecorativeFeatures,
  getAvailableMonogramPlacements,
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
} from "../utils/decorativePricing";
import { CANONICAL_PHYSICAL_GARMENT_TYPES } from "../utils/garmentConstructionPricing";
import type {
  GarmentScopedCustomDetailsCompletionResult,
  GarmentScopedCustomDetailsPricingResult,
  GarmentScopedCustomDetailsReconciliationResult,
} from "../utils/garmentScopedCustomDetailsDomain";
import { getGarmentScopedCustomDetailSelection } from "../utils/garmentScopedCustomDetailsState";
import {
  GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH,
  getGarmentScopedCustomDetailText,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  validateGarmentScopedCustomDetailText,
} from "../utils/garmentScopedCustomDetailInputsState";
import type {
  FutureCustomDetailsCatalogueGroup,
  FutureCustomDetailsCatalogueOccurrence,
  FutureCustomDetailsCatalogueProjection,
} from "../utils/futureCustomDetailsCatalogue";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import { isFutureCustomDetailsContentReady } from "../utils/aiTryOnWorkflow";

interface DormantFutureCustomDetailsStepProps {
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  catalogue: FutureCustomDetailsCatalogueProjection;
  personalizedInputs: GarmentScopedCustomDetailInputsV1;
  completion: GarmentScopedCustomDetailsCompletionResult;
  pricing: GarmentScopedCustomDetailsPricingResult;
  orderLevelCustomDetailsPrice: number;
  constructionSubtotal: number;
  designSelections: DesignSelections;
  selectedStyle: StyleCategory | null;
  additionalGarments: readonly FabricGarmentAssignment[];
  onSingleSelect: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onClearSelection: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup) => void;
  onConstructionSelect: (parentGarmentKey: string, garmentType: CanonicalPhysicalGarmentType, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onToggleMultiSelect: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onPersonalizedTextChange: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string, text: string) => void;
  onDecorativeFeatureToggle: (feature: DecorativeFeature) => void;
  onClearDecorativeFeatures: () => void;
  onMonogramPlacementChange: (placement: MonogramPlacement) => void;
  onAccessoryToggle: (accessory: TraditionalAccessory) => void;
  onClearAccessories: () => void;
  onAddAdditionalGarment: (garmentType: CanonicalPhysicalGarmentType) => void;
  onRemoveAdditionalGarment: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const money = (amount: number): string => `${PRICING_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

const getSubjectLabel = (
  subject: GarmentScopedCustomDetailsReconciliationResult["subjects"][number],
): string => {
  const garmentLabel = getFabricGarmentLabel(subject.garmentType);
  return subject.parentGarmentType === subject.garmentType
    ? garmentLabel
    : `${getFabricGarmentLabel(subject.parentGarmentType)} ${garmentLabel}`;
};

const getSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
) => getGarmentScopedCustomDetailSelection(state, garmentKey, selectionGroup);

const isSelected = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): boolean => {
  const selection = getSelection(state, garmentKey, selectionGroup);
  return Array.isArray(selection) ? selection.includes(optionId) : selection === optionId;
};

const hasSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
): boolean => {
  const selection = getSelection(state, garmentKey, selectionGroup);
  return Array.isArray(selection) ? selection.length > 0 : Boolean(selection);
};

const getOptionPriceLabel = (option: CustomDetailOption, isConstruction: boolean): string =>
  option.requiresEvaluation
    ? "Price requires evaluation."
    : isConstruction
      ? money(option.priceCents / 100)
      : option.priceCents === 0
        ? "No additional cost"
        : `+${money(option.priceCents / 100)}`;

const getIdentityKey = (
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): string => `${garmentKey}\u0000${selectionGroup}\u0000${optionId}`;

const getSelectedConstructionId = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  selectionGroup: CustomDetailSelectionGroup,
): string | null =>
  occurrence.construction?.status === "resolved"
    ? occurrence.construction.components.find(
        (component) => component.selectionGroup === selectionGroup,
      )?.optionId || null
    : null;

export const DormantFutureCustomDetailsStep = ({
  reconciliation,
  catalogue,
  personalizedInputs,
  completion,
  pricing,
  orderLevelCustomDetailsPrice,
  constructionSubtotal,
  designSelections,
  selectedStyle,
  additionalGarments,
  onSingleSelect,
  onClearSelection,
  onConstructionSelect,
  onToggleMultiSelect,
  onPersonalizedTextChange,
  onDecorativeFeatureToggle,
  onClearDecorativeFeatures,
  onMonogramPlacementChange,
  onAccessoryToggle,
  onClearAccessories,
  onAddAdditionalGarment,
  onRemoveAdditionalGarment,
  onBack,
  onContinue,
}: DormantFutureCustomDetailsStepProps) => {
  const [overLimitText, setOverLimitText] = useState<Record<string, string>>({});
  const selectedPersonalizedIdentities = useMemo(
    () => reconciliation.subjects.flatMap((subject) => {
      const group = reconciliation.applicabilityByGarmentKey
        .get(subject.garmentKey)
        ?.groups.find((candidate) => candidate.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP);
      return group?.options.some((option) =>
        option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID &&
        isSelected(reconciliation.state, subject.garmentKey, group.selectionGroup, option.id),
      )
        ? [getIdentityKey(subject.garmentKey, PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP, PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID)]
        : [];
    }),
    [reconciliation],
  );
  const selectedPersonalizedSignature = selectedPersonalizedIdentities.join(",");

  useEffect(() => {
    const retained = new Set(selectedPersonalizedIdentities);
    setOverLimitText((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => retained.has(key)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [selectedPersonalizedSignature, selectedPersonalizedIdentities]);

  const customDetailsSubtotal =
    (pricing.status === "exact" ? pricing.subtotal : pricing.exactSubtotalCents / 100) +
    orderLevelCustomDetailsPrice;
  const estimatedTotal = pricing.status === "exact" ? constructionSubtotal + customDetailsSubtotal : null;
  const subjectLabelByGarmentKey = new Map(
    reconciliation.subjects.map((subject) => [subject.garmentKey, getSubjectLabel(subject)]),
  );
  const canContinue = isFutureCustomDetailsContentReady(completion);
  const selectedDecorativeFeatures = new Set(designSelections.decorativeFeatures || []);
  const applicableDecorativeFeatures = new Set(getApplicableDecorativeFeatures(selectedStyle));
  const availableMonogramPlacements = getAvailableMonogramPlacements(designSelections, selectedStyle);
  const selectedAccessories = new Set(designSelections.accessories || []);

  const renderOptions = (
    group: FutureCustomDetailsCatalogueGroup,
    occurrence: FutureCustomDetailsCatalogueOccurrence | null,
  ) => {
    const inactive = occurrence === null;
    const garmentKey = occurrence?.subject.garmentKey || `inactive:${group.selectionGroup}`;
    const groupId = `future-custom-detail-${garmentKey}-${group.selectionGroup}`;
    const groupBlocker = occurrence
      ? completion.blockers.find((blocker) =>
          blocker.garmentKey === occurrence.subject.garmentKey && blocker.selectionGroup === group.selectionGroup,
        )
      : undefined;
    const selectedConstructionId = occurrence && group.isConstruction
      ? getSelectedConstructionId(occurrence, group.selectionGroup)
      : null;
    const noneSelected = inactive || (!group.isConstruction && occurrence !== null && !hasSelection(
      reconciliation.state,
      occurrence.subject.garmentKey,
      group.selectionGroup,
    ));

    return (
      <div className="min-w-0 space-y-3">
        {!group.isConstruction && (
          <label className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border p-3 text-left ${noneSelected ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"} ${inactive ? "cursor-not-allowed opacity-65" : "cursor-pointer"}`}>
            <input
              type="radio"
              name={`${groupId}-none`}
              checked={noneSelected}
              disabled={inactive}
              onChange={() => occurrence && onClearSelection(occurrence.subject.garmentKey, group.selectionGroup)}
              className="size-4 shrink-0 accent-heritage-green"
            />
            <span className="text-sm font-bold text-heritage-green">None</span>
          </label>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
          {group.options.map((option) => {
            const optionId = `${groupId}-${option.id}`;
            const checked = Boolean(occurrence && (
              group.isConstruction
                ? selectedConstructionId === option.id
                : isSelected(reconciliation.state, occurrence.subject.garmentKey, group.selectionGroup, option.id)
            ));
            const isPersonalizedRequirement =
              group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
              option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;
            const identity = getIdentityKey(garmentKey, group.selectionGroup, option.id);
            const persistedText = occurrence
              ? getGarmentScopedCustomDetailText(personalizedInputs, occurrence.subject.garmentKey, group.selectionGroup, option.id)
              : undefined;
            const text = overLimitText[identity] ?? persistedText ?? "";
            const textValidation = validateGarmentScopedCustomDetailText(text);
            const textError = isPersonalizedRequirement && checked
              ? textValidation.status === "too_long"
                ? `Use ${GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()} characters or fewer.`
                : textValidation.status === "empty"
                  ? "Describe your personalized requirement before continuing."
                  : undefined
              : undefined;
            return (
              <div key={option.id} className="min-w-0">
                <label htmlFor={optionId} className={`flex min-h-12 min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${checked ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"} ${inactive ? "cursor-not-allowed opacity-65" : "cursor-pointer hover:border-heritage-gold/45"}`}>
                  <input
                    id={optionId}
                    type={group.allowMultiple ? "checkbox" : "radio"}
                    name={group.allowMultiple ? undefined : groupId}
                    checked={checked}
                    disabled={inactive}
                    onChange={() => {
                      if (!occurrence) return;
                      if (group.isConstruction) {
                        onConstructionSelect(occurrence.subject.parentGarmentKey, occurrence.subject.parentGarmentType, group.selectionGroup, option.id);
                      } else if (group.allowMultiple) {
                        onToggleMultiSelect(occurrence.subject.garmentKey, group.selectionGroup, option.id);
                      } else {
                        onSingleSelect(occurrence.subject.garmentKey, group.selectionGroup, option.id);
                      }
                    }}
                    aria-describedby={textError ? `${optionId}-text-error` : undefined}
                    className="mt-0.5 size-4 shrink-0 accent-heritage-green"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">{option.label}</span>
                      <span className="shrink-0 rounded-md bg-heritage-cream/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-heritage-gold">{getOptionPriceLabel(option, group.isConstruction)}</span>
                    </span>
                    {option.description && <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{option.description}</span>}
                    {option.requiresEvaluation && <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-heritage-ink/50">Confirmed after tailoring review</span>}
                  </span>
                </label>
                {isPersonalizedRequirement && checked && occurrence && (
                  <div className="mt-2">
                    <label htmlFor={`${optionId}-text`} className="text-xs font-bold text-heritage-green">Describe your personalized requirement</label>
                    <textarea
                      id={`${optionId}-text`}
                      value={text}
                      onChange={(event) => {
                        const nextText = event.target.value;
                        if (validateGarmentScopedCustomDetailText(nextText).status === "too_long") {
                          setOverLimitText((current) => ({ ...current, [identity]: nextText }));
                          return;
                        }
                        setOverLimitText((current) => {
                          const { [identity]: _removed, ...rest } = current;
                          return rest;
                        });
                        onPersonalizedTextChange(occurrence.subject.garmentKey, group.selectionGroup, option.id, nextText);
                      }}
                      aria-invalid={Boolean(textError)}
                      aria-describedby={textError ? `${optionId}-text-error` : undefined}
                      className="mt-2 min-h-28 w-full rounded-xl border border-heritage-green/20 bg-white p-3 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30"
                    />
                    <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
                      <span id={`${optionId}-text-error`} className="text-red-700">{textError}</span>
                      <span className="shrink-0 text-heritage-ink/55">{text.length}/{GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {group.options.length === 0 && <p className="text-xs text-heritage-ink/60">No current catalogue options are available.</p>}
        {groupBlocker && <p className="text-xs text-red-700">{groupBlocker.message}</p>}
      </div>
    );
  };

  const renderCatalogueGroup = (group: FutureCustomDetailsCatalogueGroup) => (
    <section key={group.selectionGroup} data-custom-detail-group={group.selectionGroup} data-active-occurrences={group.occurrences.length} className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex min-w-0 flex-col gap-2 border-b border-heritage-gold/15 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-serif text-lg font-bold text-heritage-green">{group.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
            {group.occurrences.length > 0
              ? group.isConstruction
                ? "Choose one all-inclusive construction alternative for each included garment."
                : "Optional choices are priced only for included garment occurrences."
              : "Not currently included. Add this garment below to enable its choices."}
          </p>
        </div>
        <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide ${group.occurrences.length > 0 ? "border-heritage-green/20 bg-heritage-green/5 text-heritage-green" : "border-heritage-ink/15 bg-heritage-cream/40 text-heritage-ink/60"}`}>
          {group.occurrences.length > 0 ? "Included" : "Not currently included"}
        </span>
      </header>
      <div className="mt-4 space-y-5">
        {group.occurrences.length > 0
          ? group.occurrences.map((occurrence) => {
              const needsAttention = completion.blockers.some((blocker) => blocker.garmentKey === occurrence.subject.garmentKey);
              const pricingPending = occurrence.construction?.status !== "resolved";
              return (
                <fieldset key={occurrence.subject.garmentKey} className="min-w-0">
                  <legend className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold text-heritage-green">
                    <span className="min-w-0 break-words">{getSubjectLabel(occurrence.subject)}</span>
                    <span className="rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">
                      {pricingPending ? "Pricing pending" : needsAttention ? "Incomplete" : occurrence.role === "additional" ? "Added garment" : "Included in your selected design"}
                    </span>
                  </legend>
                  <div className="mt-3">{renderOptions(group, occurrence)}</div>
                </fieldset>
              );
            })
          : renderOptions(group, null)}
      </div>
    </section>
  );

  return (
    <section aria-labelledby="future-custom-details-title" data-stage-id="custom_details" data-stage-complete={canContinue} className="space-y-6 font-sans">
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <button type="button" onClick={onBack} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-heritage-green/20 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><ArrowLeft aria-hidden="true" size={15} /> Back to Design Style</button>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Step 4 of 9</p>
        <h2 id="future-custom-details-title" className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl">Custom Details</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">Review the complete construction catalogue. Base garment construction was selected in Garment Type and is already included in your price. Only garments marked as included or added contribute to your order and price.</p>
      </div>

      {completion.blockers.length > 0 && (
        <div role="alert" className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4">
          <p className="text-sm font-bold text-heritage-green">Custom Details need attention</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">{Array.from(new Set(completion.blockers.map((blocker) => blocker.message))).map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] xl:items-start xl:gap-6">
        <div className="min-w-0 space-y-5">
          {catalogue.coreGroups.map(renderCatalogueGroup)}

          <section data-custom-detail-section="additional-clothes-costs" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-serif text-lg font-bold text-heritage-green">Additional Clothes Costs</h3>
            <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">Optional enhancements apply only to included garment occurrences.</p>
            <div className="mt-5 space-y-6">
              {catalogue.additionalCostGroups.map((group) => (
                <fieldset key={group.selectionGroup} className="min-w-0 border-t border-heritage-gold/15 pt-4 first:border-0 first:pt-0">
                  <legend className="font-serif text-base font-bold text-heritage-green">{group.title}</legend>
                  <p className="mt-1 text-xs text-heritage-ink/60">{group.occurrences.length > 0 ? "Available for your included garments." : "Not currently included."}</p>
                  <div className="mt-3 space-y-4">
                    {group.occurrences.length > 0
                      ? group.occurrences.map((occurrence) => <div key={occurrence.subject.garmentKey} className="min-w-0"><p className="mb-2 break-words text-xs font-bold text-heritage-green">{getSubjectLabel(occurrence.subject)}</p>{renderOptions(group, occurrence)}</div>)
                      : renderOptions(group, null)}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>

          {renderCatalogueGroup(catalogue.personalizedGroup)}

          <section data-custom-detail-section="monogram-embroidery" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-serif text-lg font-bold text-heritage-green">Monogram and Embroidery Design</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional. Select None to remove all monogram and embroidery choices.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 ${selectedDecorativeFeatures.size === 0 ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"}`}><input type="radio" name="future-decorative-none" checked={selectedDecorativeFeatures.size === 0} onChange={onClearDecorativeFeatures} className="size-4 accent-heritage-green" /><span className="text-sm font-bold text-heritage-green">None</span></label>
              {DECORATIVE_FEATURE_OPTIONS.map((feature) => {
                const available = applicableDecorativeFeatures.has(feature);
                return <label key={feature} className={`flex min-h-12 min-w-0 items-start gap-3 rounded-xl border p-3 ${selectedDecorativeFeatures.has(feature) ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"} ${available ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}><input type="checkbox" checked={selectedDecorativeFeatures.has(feature)} disabled={!available} onChange={() => onDecorativeFeatureToggle(feature)} className="mt-0.5 size-4 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><span className="break-words text-sm font-bold text-heritage-green">{feature}</span><span className="shrink-0 font-mono text-[11px] font-bold text-heritage-gold">+{money(getDecorativeFeaturePrice(selectedStyle, feature))}</span></span><span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">{available ? DECORATIVE_FEATURE_DESCRIPTIONS[feature] : "Not available for the current design."}</span></span></label>;
              })}
            </div>
            {selectedDecorativeFeatures.has("Name Monogram") && availableMonogramPlacements.length > 0 && (
              <fieldset className="mt-4"><legend className="text-xs font-bold text-heritage-green">Monogram placement</legend><div className="mt-2 flex flex-wrap gap-2">{availableMonogramPlacements.map((placement) => <label key={placement.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-heritage-green/15 px-3 text-xs text-heritage-green focus-within:ring-2 focus-within:ring-heritage-gold"><input type="radio" name="future-monogram-placement" checked={designSelections.monogramPlacement === placement.value} onChange={() => onMonogramPlacementChange(placement.value)} className="size-4 accent-heritage-green" />{placement.label}</label>)}</div></fieldset>
            )}
          </section>

          <section data-custom-detail-section="accessories" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="font-serif text-lg font-bold text-heritage-green">Select Accessories - Optional</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional accessories remain separate from garment construction.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 ${selectedAccessories.size === 0 ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"}`}><input type="radio" name="future-accessories-none" checked={selectedAccessories.size === 0} onChange={onClearAccessories} className="size-4 accent-heritage-green" /><span className="text-sm font-bold text-heritage-green">None</span></label>
              {TRADITIONAL_ACCESSORY_OPTIONS.map((accessory) => <label key={accessory} className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedAccessories.has(accessory) ? "border-heritage-gold bg-heritage-gold/10" : "border-heritage-green/15"}`}><input type="checkbox" checked={selectedAccessories.has(accessory)} onChange={() => onAccessoryToggle(accessory)} className="mt-0.5 size-4 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><span className="break-words text-sm font-bold text-heritage-green">{accessory}</span><span className="shrink-0 font-mono text-[11px] font-bold text-heritage-gold">+{money(getTraditionalAccessoryPrice(selectedStyle, accessory))}</span></span><span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">{TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]}</span></span></label>)}
            </div>
          </section>

          <section data-custom-detail-section="add-additional-garment" className="min-w-0 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/25 p-4 shadow-sm sm:p-5">
            <h3 className="font-serif text-lg font-bold text-heritage-green">Add Additional Garment</h3>
            <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">Add a physical garment occurrence. Its default construction and fabric requirements will be resolved through the same order workflow.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CANONICAL_PHYSICAL_GARMENT_TYPES.map((garmentType) => <button key={garmentType} type="button" onClick={() => onAddAdditionalGarment(garmentType)} className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-heritage-green/20 bg-white px-3 text-xs font-bold text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><Plus aria-hidden="true" size={15} className="shrink-0" /><span className="min-w-0 break-words">{getFabricGarmentLabel(garmentType)}</span></button>)}
            </div>
            {additionalGarments.length > 0 && <div className="mt-5 space-y-2 border-t border-heritage-gold/20 pt-4">{additionalGarments.map((garment) => <div key={garment.garmentKey} className="flex min-w-0 flex-col gap-2 rounded-xl border border-heritage-green/15 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0 break-words text-sm font-bold text-heritage-green">{getFabricGarmentLabel(garment.garmentType)} <span className="text-[10px] uppercase text-heritage-gold">Added garment</span></span><button type="button" onClick={() => onRemoveAdditionalGarment(garment.garmentKey)} aria-label={`Remove added ${getFabricGarmentLabel(garment.garmentType)}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"><Trash2 aria-hidden="true" size={15} /> Remove</button></div>)}</div>}
          </section>
        </div>

        <aside className="mt-5 min-w-0 rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm xl:sticky xl:top-4 xl:mt-0">
          <h3 className="font-serif text-lg font-bold text-heritage-green">Live Price Summary</h3>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">Only active garment occurrences and selected optional details are priced.</p>
          <div className="mt-4 space-y-2.5 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-words text-heritage-ink/70">Garment Construction Subtotal</span><span className="shrink-0 font-mono font-bold text-heritage-green">{money(constructionSubtotal)}</span></div>
            <p className="text-xs leading-relaxed text-heritage-ink/60">Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.</p>
            <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-words text-heritage-ink/70">Custom Details subtotal</span><span className="shrink-0 font-mono font-bold text-heritage-green">{money(customDetailsSubtotal)}</span></div>
            {pricing.lines.length > 0 && <div className="space-y-2 border-t border-heritage-gold/15 pt-3">{pricing.lines.map((line) => <div key={line.occurrenceKey} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words leading-relaxed text-heritage-ink/60">{subjectLabelByGarmentKey.get(line.garmentKey) || "Garment"}: {line.label}</span><span className="shrink-0 font-mono text-heritage-green">{line.status === "evaluation_required" ? "Evaluation" : line.status === "exact" && line.lineTotalCents !== undefined ? money(line.lineTotalCents / 100) : "Review"}</span></div>)}</div>}
            {[...(designSelections.decorativeFeatures || []), ...(designSelections.accessories || [])].length > 0 && <div className="space-y-2 border-t border-heritage-gold/15 pt-3">{(designSelections.decorativeFeatures || []).map((feature) => <div key={feature} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-heritage-ink/60">{feature}</span><span className="shrink-0 font-mono text-heritage-green">{money(getDecorativeFeaturePrice(selectedStyle, feature))}</span></div>)}{(designSelections.accessories || []).map((accessory) => <div key={accessory} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-heritage-ink/60">{accessory}</span><span className="shrink-0 font-mono text-heritage-green">{money(getTraditionalAccessoryPrice(selectedStyle, accessory as TraditionalAccessory))}</span></div>)}</div>}
            {pricing.status === "pending" && <p className="rounded-lg bg-heritage-cream/50 p-2 text-xs leading-relaxed text-heritage-ink/70">A personalized requirement needs price evaluation before an exact total is available.</p>}
            {pricing.status === "invalid" && <p className="rounded-lg bg-red-50 p-2 text-xs leading-relaxed text-red-700">A saved Custom Details price needs review.</p>}
            <div className="flex min-w-0 items-start justify-between gap-3 border-t border-heritage-gold/15 pt-3 font-bold text-heritage-green"><span className="min-w-0 break-words">Estimated total so far</span><span className="shrink-0 font-mono">{estimatedTotal === null ? "Pending" : money(estimatedTotal)}</span></div>
          </div>
        </aside>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-5 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><ArrowLeft aria-hidden="true" size={15} /> Back to Design Style</button>
        <button type="button" onClick={onContinue} disabled={!canContinue} aria-label={canContinue ? "Continue to AI Try-on" : "Continue to AI Try-on is locked until Custom Details are complete"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Continue to AI Try-on <ArrowRight aria-hidden="true" size={14} /></button>
      </div>
    </section>
  );
};
