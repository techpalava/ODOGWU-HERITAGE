import { useState, type ChangeEvent, type ReactNode } from "react";
import { AlertCircle, Check, CheckCircle2, ImageOff, Layers3, UsersRound, X } from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  CustomDetailDemographic,
  CustomDetailOption,
  FabricGarmentAssignment,
  FabricGarmentType,
} from "../types";
import {
  createStyleBaseGarmentSpec,
  formatCustomerFacingFabricCapacityAmount,
  formatGarmentFabricCapacityUsage,
} from "../config/StyleFabricCapacityConfig";
import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAssignments,
} from "../engine/FabricCapacityEngine";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  STEP_1_SELECTABLE_GARMENT_TYPES,
  getStep1SelectableGarmentTypes,
  type GarmentConstructionPricingResolution,
  resolveGarmentConstructionPricing,
} from "../utils/garmentConstructionPricing";
import {
  STEP1_GARMENT_REFERENCE_DISCLAIMER,
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
  isStep1GarmentReferenceType,
} from "../utils/step1GarmentReferenceImages";
import { formatRequiredFabricQuantitySentence } from "../utils/designStudioFutureFabricStage";

const DEMOGRAPHIC_OPTIONS: ReadonlyArray<{
  value: CustomDetailDemographic;
  label: string;
  description: string;
}> = [
  { value: "male", label: "Male", description: "Menswear or boyswear." },
  { value: "female", label: "Female", description: "Womenswear or girlswear." },
  {
    value: "unisex",
    label: "Unisex / Family",
    description: "Matching, couple, or family order.",
  },
];

const GARMENT_TYPE_STEP_LABELS: Record<
  Exclude<FabricGarmentType, "other">,
  string
> = {
  shirt: "Standard Shirt",
  trouser: "Trouser",
  skirt: "Standard Skirt",
  standard_shorts: "Standard Shorts (Nikka)",
  bum_shorts: "Bum Shorts",
  dress: "Standard Dress",
  kaftan: "Long Shirt (Kaftan)",
  full_length_gown: "Long Dress (Gown)",
  agbada: "Long Shirt (Agbada)",
};

export const getGarmentTypeStepLabel = (
  garmentType: Exclude<FabricGarmentType, "other">,
): string => GARMENT_TYPE_STEP_LABELS[garmentType];

const FIRST_VISIBLE_REFERENCE_IMAGE_COUNT = 3;

/** Half-height Step 1 reference frame (~50% shorter than the prior square crop). */
export const STEP1_GARMENT_REFERENCE_FRAME_CLASS =
  "relative aspect-[2/1] w-full overflow-hidden rounded-t-2xl bg-[#f4eee6]";

export const STEP1_GARMENT_SELECT_ATTENTION_CLASS =
  "motion-safe:animate-step1-select-attention motion-reduce:animate-none";

export const STEP1_GARMENT_SELECT_BUTTON_BASE_CLASS =
  "mt-2.5 inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl px-2 text-[11px] font-bold uppercase tracking-wider transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-green focus-visible:ring-offset-2 active:scale-[0.97]";

export const Step1GarmentReferencePhoto = ({
  src,
  alt,
  eager = false,
}: {
  src: string | null;
  alt: string;
  eager?: boolean;
}) => {
  const [failed, setFailed] = useState(!src);

  return (
    <div
      className={STEP1_GARMENT_REFERENCE_FRAME_CLASS}
      data-testid="step1-garment-reference-frame"
    >
      {failed || !src ? (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center"
          data-testid="step1-garment-reference-fallback"
        >
          <ImageOff
            aria-hidden="true"
            size={16}
            className="text-heritage-ink/35"
          />
          <span className="text-[10px] leading-snug text-heritage-ink/55">
            Reference image unavailable
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          width={720}
          height={900}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain object-center"
          data-testid="step1-garment-reference-image"
        />
      )}
    </div>
  );
};

export interface GarmentTypeStepCategoryPresentation {
  garmentType: FabricGarmentType;
  label: string;
  fabricUnits: 1 | 2;
  fabricCapacityUsage: string;
  selected: boolean;
  constructionPricing: GarmentConstructionPricingResolution | null;
}

export interface GarmentTypeStepPresentation {
  categories: GarmentTypeStepCategoryPresentation[];
  selectedGarmentTypes: FabricGarmentType[];
  constructionPricing: GarmentConstructionPricingResolution[];
  constructionSubtotalCents: number;
  garmentCount: number;
  capacityUnits: number;
  customerFacingCapacityAmount: string;
  fabricQuantity: number;
  requiresMultipleFabricAllocations: boolean;
}

export interface GarmentTypeStepProps {
  selectedGarmentTypes: readonly FabricGarmentType[];
  selectedDemographics: readonly CustomDetailDemographic[];
  selectedFabricQuantity?: number;
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
  onGarmentTypesChange: (garmentTypes: FabricGarmentType[]) => void;
  onDemographicsChange: (demographics: CustomDetailDemographic[]) => void;
  onConstructionDefaultsChange: (
    resolutions: GarmentConstructionPricingResolution[],
  ) => void;
  statusMessage?: string | null;
  catalogueCoverageMessage?: {
    headline: string;
    detail: string;
  } | null;
  orderSummary?: ReactNode;
  idPrefix?: string;
}

export const formatGarmentTypeStepEuro = (price: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${price.toFixed(2)}`;

export const updateGarmentTypeSelection = (
  current: readonly FabricGarmentType[],
  garmentType: FabricGarmentType,
  selected: boolean,
): FabricGarmentType[] => {
  const currentSet = new Set(current);
  if (selected) currentSet.add(garmentType);
  else currentSet.delete(garmentType);

  return CANONICAL_PHYSICAL_GARMENT_TYPES.filter((type) =>
    currentSet.has(type),
  );
};

export const updateGarmentTypeDemographics = (
  current: readonly CustomDetailDemographic[],
  demographic: CustomDetailDemographic,
  selected: boolean,
): CustomDetailDemographic[] => {
  const currentSet = new Set(current);
  if (selected) currentSet.add(demographic);
  else currentSet.delete(demographic);
  return DEMOGRAPHIC_OPTIONS.map((option) => option.value).filter((value) =>
    currentSet.has(value),
  );
};

const getAssignmentsForGarments = (
  garmentTypes: readonly FabricGarmentType[],
): FabricGarmentAssignment[] =>
  garmentTypes.flatMap((garmentType) => {
    const resolution = FabricCapacityEngine.resolveGarmentAssignment({
      code: `GARMENT_TYPE_${garmentType.toUpperCase()}`,
      garmentSpec: createStyleBaseGarmentSpec(garmentType),
    });
    return resolution.status === "resolved" ? resolution.assignments : [];
  });

export const getGarmentTypeStepPresentation = ({
  selectedGarmentTypes,
  normalizedCustomDetailCatalog,
}: Pick<
  GarmentTypeStepProps,
  "selectedGarmentTypes" | "normalizedCustomDetailCatalog"
>): GarmentTypeStepPresentation => {
  const selectedSet = new Set(selectedGarmentTypes);
  const canonicalSelection = CANONICAL_PHYSICAL_GARMENT_TYPES.filter((type) =>
    selectedSet.has(type),
  );
  const constructionPricing = canonicalSelection.map((garmentType) =>
    resolveGarmentConstructionPricing(garmentType, normalizedCustomDetailCatalog),
  );
  const step1SelectableSelection = getStep1SelectableGarmentTypes(
    canonicalSelection,
  );
  const quantitySummary = getCustomerFacingFabricQuantityForAssignments(
    getAssignmentsForGarments(step1SelectableSelection),
  );

  return {
    categories: STEP_1_SELECTABLE_GARMENT_TYPES.map((garmentType) => {
      const fabricUnits = createStyleBaseGarmentSpec(garmentType).fabricUnits;
      return {
        garmentType,
        label: getGarmentTypeStepLabel(garmentType),
        fabricUnits,
        fabricCapacityUsage: formatGarmentFabricCapacityUsage(fabricUnits),
        selected: selectedSet.has(garmentType),
        constructionPricing:
          constructionPricing.find(
            (resolution) => resolution.garmentType === garmentType,
          ) || null,
      };
    }),
    selectedGarmentTypes: canonicalSelection,
    constructionPricing,
    constructionSubtotalCents: constructionPricing.reduce(
      (total, resolution) =>
        resolution.status === "resolved"
          ? total + resolution.totalPriceCents
          : total,
      0,
    ),
    garmentCount: quantitySummary.garmentCount,
    capacityUnits: quantitySummary.capacityUnits,
    customerFacingCapacityAmount: formatCustomerFacingFabricCapacityAmount(
      quantitySummary.capacityUnits,
    ),
    fabricQuantity: quantitySummary.fabricQuantity,
    requiresMultipleFabricAllocations: quantitySummary.fabricQuantity > 1,
  };
};

export const GarmentTypeStep = ({
  selectedGarmentTypes,
  selectedDemographics,
  selectedFabricQuantity = 0,
  normalizedCustomDetailCatalog,
  onGarmentTypesChange,
  onDemographicsChange,
  onConstructionDefaultsChange,
  statusMessage = null,
  catalogueCoverageMessage = null,
  orderSummary = null,
  idPrefix = "garment-type-step",
}: GarmentTypeStepProps) => {
  void selectedFabricQuantity;
  const presentation = getGarmentTypeStepPresentation({
    selectedGarmentTypes,
    normalizedCustomDetailCatalog,
  });
  const hasUnresolvedConstructionPricing = presentation.constructionPricing.some(
    (resolution) => resolution.status === "unresolved",
  );
  const garmentCount = presentation.garmentCount;
  const fabricQuantity = presentation.fabricQuantity;

  const toggleGarment = (garmentType: FabricGarmentType) => {
    const nextGarmentTypes = updateGarmentTypeSelection(
      presentation.selectedGarmentTypes,
      garmentType,
      !presentation.selectedGarmentTypes.includes(garmentType),
    );
    const nextPresentation = getGarmentTypeStepPresentation({
      selectedGarmentTypes: nextGarmentTypes,
      normalizedCustomDetailCatalog,
    });
    onGarmentTypesChange(nextGarmentTypes);
    onConstructionDefaultsChange(nextPresentation.constructionPricing);
  };

  const handleDemographicChange = (
    demographic: CustomDetailDemographic,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    onDemographicsChange(
      updateGarmentTypeDemographics(
        selectedDemographics,
        demographic,
        event.currentTarget.checked,
      ),
    );
  };

  const fabricQuantitySummary = (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-gold/20 bg-heritage-cream/35 p-3 sm:p-4">
      <Layers3 aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-heritage-gold" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-bold text-heritage-green">
          {garmentCount > 0
            ? `${fabricQuantity} ${fabricQuantity === 1 ? "fabric" : "fabrics"} · ${garmentCount} ${garmentCount === 1 ? "garment" : "garments"}`
            : "Select garment types to see fabric quantities."}
        </p>
        {garmentCount > 0 && (
          <>
            <p className="mt-1 break-words text-xs leading-relaxed text-heritage-ink/65">
              {formatRequiredFabricQuantitySentence(fabricQuantity, garmentCount)}
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <section
      aria-labelledby={`${idPrefix}-title`}
      className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-12"
    >
      <div className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7 lg:col-span-8">
        <DesignStudioBackButton disabled className="mb-5" />
        <div className="border-b border-heritage-gold/15 pb-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
            Step 1 of 9
          </p>
          <h2
            id={`${idPrefix}-title`}
            className="mt-1 font-serif text-3xl font-bold text-heritage-green"
          >
            What garment type do you want to order?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-heritage-ink/70">
            Select every physical garment included in this order, then choose who it is for.
            Step 3 will show all catalogue designs and highlight which ones best match or can be adapted to your order.
          </p>
        </div>

        {catalogueCoverageMessage && (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            <p className="font-bold">{catalogueCoverageMessage.headline}</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-950/80">
              {catalogueCoverageMessage.detail}
            </p>
          </div>
        )}

        <fieldset className="mt-6 min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-x-6 lg:gap-y-1">
          <legend className="font-serif text-lg font-bold text-heritage-green lg:col-start-1 lg:row-start-1">
            Garment Type
          </legend>
          <p className="mt-1 text-xs text-heritage-ink/60 lg:col-start-1 lg:row-start-2 lg:mt-1">
            Choose one or more garments. Construction pricing is selected from the current catalogue.
          </p>
          <div className="mt-4 w-full shrink-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mt-0 lg:max-w-xs lg:justify-self-end xl:max-w-xs">
            {fabricQuantitySummary}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-heritage-ink/55 lg:col-span-full">
            {STEP1_GARMENT_REFERENCE_DISCLAIMER}
          </p>
          <div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 max-[340px]:grid-cols-1 xl:grid-cols-3 lg:col-span-full">
            {presentation.categories.map((category, index) => {
              const price = category.constructionPricing;
              const isResolved = price?.status === "resolved";
              const buttonId = `${idPrefix}-${category.garmentType}`;
              const referenceImage = isStep1GarmentReferenceType(
                category.garmentType,
              )
                ? getStep1GarmentReferenceImage(category.garmentType)
                : null;
              const referenceAlt = getStep1GarmentReferenceAlt(category.label);
              return (
                <article
                  key={category.garmentType}
                  data-testid={`step1-garment-card-${category.garmentType}`}
                  className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border ${
                    category.selected
                      ? "border-heritage-green shadow-sm ring-2 ring-heritage-green/25"
                      : "border-heritage-gold/20 bg-white"
                  } ${
                    category.selected && !isResolved
                      ? "border-amber-500 ring-amber-400/40"
                      : ""
                  }`}
                >
                  <Step1GarmentReferencePhoto
                    src={referenceImage?.src ?? null}
                    alt={referenceAlt}
                    eager={index < FIRST_VISIBLE_REFERENCE_IMAGE_COUNT}
                  />
                  <div
                    className={`flex min-w-0 flex-1 flex-col p-2.5 sm:p-3 ${
                      category.selected && !isResolved
                        ? "bg-amber-50"
                        : category.selected
                          ? "bg-heritage-cream/55"
                          : "bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">
                        {category.label}
                      </h3>
                      {isResolved && (
                        <p className="shrink-0 font-mono text-sm font-bold text-heritage-green">
                          {formatGarmentTypeStepEuro(price.totalPrice)}
                        </p>
                      )}
                    </div>
                    <p className="mt-1 break-words text-[11px] leading-relaxed text-heritage-ink/60">
                      {category.fabricCapacityUsage}
                    </p>
                    {category.selected && !isResolved && (
                      <p className="mt-2 flex min-w-0 items-start gap-1.5 text-[11px] font-semibold text-amber-800">
                        <AlertCircle aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          Construction pricing needs review.
                        </span>
                      </p>
                    )}
                    <button
                      id={buttonId}
                      type="button"
                      aria-pressed={category.selected}
                      aria-label={
                        category.selected
                          ? `Deselect ${category.label}`
                          : `Select ${category.label}`
                      }
                      data-testid={`step1-garment-select-${category.garmentType}`}
                      onClick={() => toggleGarment(category.garmentType)}
                      className={`${STEP1_GARMENT_SELECT_BUTTON_BASE_CLASS} ${
                        category.selected
                          ? "group justify-between gap-0 bg-heritage-green px-0 text-heritage-cream hover:bg-heritage-forest"
                          : `${STEP1_GARMENT_SELECT_ATTENTION_CLASS} border border-heritage-green bg-heritage-cream text-heritage-green hover:animate-none hover:-translate-y-0.5 hover:border-heritage-forest hover:bg-white hover:shadow-md`
                      }`}
                    >
                      {category.selected ? (
                        <>
                          <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2">
                            <Check aria-hidden="true" size={14} />
                            SELECTED
                          </span>
                          <span
                            aria-hidden="true"
                            data-step1-deselect-cue="true"
                            className="inline-flex size-11 shrink-0 items-center justify-center border-l border-white/20 text-heritage-cream/90 group-hover:text-red-200"
                          >
                            <X size={16} />
                          </span>
                        </>
                      ) : (
                        "SELECT"
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-7 min-w-0 border-t border-heritage-gold/15 pt-6">
          <legend className="font-serif text-lg font-bold text-heritage-green">
            Who is this design for?
          </legend>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {DEMOGRAPHIC_OPTIONS.map((option) => {
              const inputId = `${idPrefix}-demographic-${option.value}`;
              const selected = selectedDemographics.includes(option.value);
              return (
                <label
                  key={option.value}
                  htmlFor={inputId}
                  className={`flex min-h-[72px] min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                    selected
                      ? "border-heritage-gold bg-heritage-cream/55"
                      : "border-heritage-gold/20 bg-white hover:border-heritage-gold/60"
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    value={option.value}
                    checked={selected}
                    onChange={(event) =>
                      handleDemographicChange(option.value, event)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-heritage-green"
                  />
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-heritage-green">
                      {option.label}
                    </span>
                    <span className="mt-1 block break-words text-[11px] leading-relaxed text-heritage-ink/60">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="min-w-0 lg:col-span-4">
        {orderSummary ? (
          orderSummary
        ) : (
        <aside className="min-w-0" aria-label="Order Summary">
        <div className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex min-w-0 items-center gap-2 border-b border-gray-100 pb-3">
            <UsersRound aria-hidden="true" size={18} className="shrink-0 text-heritage-gold" />
            <h3 className="min-w-0 break-words font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">
              Order Summary
            </h3>
          </div>

          <div className="mt-4 min-w-0 space-y-3 text-sm">
            {presentation.constructionPricing.length === 0 ? (
              <p className="rounded-xl border border-dashed border-heritage-gold/30 bg-heritage-cream/25 p-3 text-xs leading-relaxed text-heritage-ink/60">
                Select garment types to view their construction pricing.
              </p>
            ) : (
              presentation.constructionPricing.map((pricing) => {
                  return (
                    <div
                      key={pricing.garmentType}
                      className="flex min-w-0 flex-wrap items-start justify-between gap-3 text-heritage-ink/70"
                    >
                      <span className="min-w-0 break-words">
                        {getGarmentTypeStepLabel(
                          pricing.garmentType as Exclude<
                            FabricGarmentType,
                            "other"
                          >,
                        )}
                      </span>
                      {pricing?.status === "resolved" ? (
                        <span className="shrink-0 font-mono font-bold text-heritage-green">
                          {formatGarmentTypeStepEuro(pricing.totalPrice)}
                        </span>
                      ) : (
                        <span className="flex min-w-0 items-center gap-1 text-xs font-semibold text-amber-800">
                          <AlertCircle aria-hidden="true" size={13} className="shrink-0" />
                          <span className="break-words">Pricing review required</span>
                        </span>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          <div className="mt-5 border-t border-heritage-gold/20 pt-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 font-serif text-base font-bold text-heritage-green">
              <span className="min-w-0 break-words">Garment Construction Subtotal</span>
              <span className="shrink-0 font-mono">
                {presentation.constructionSubtotalCents > 0
                  ? formatGarmentTypeStepEuro(
                      presentation.constructionSubtotalCents / 100,
                    )
                  : hasUnresolvedConstructionPricing
                    ? "Pricing review required"
                    : formatGarmentTypeStepEuro(0)}
              </span>
            </div>
            <p className="mt-3 break-words text-[11px] leading-relaxed text-heritage-ink/60">
              Fabric, tax, shipping, and other selected options will be added in later steps.
            </p>
          </div>

          {hasUnresolvedConstructionPricing && (
            <div className="mt-4 flex min-w-0 items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                One or more garment construction prices need administrator review before this order can continue.
              </span>
            </div>
          )}

          {statusMessage && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-heritage-gold/25 bg-heritage-cream/35 p-3 text-xs leading-relaxed text-heritage-ink/70"
            >
              {statusMessage}
            </div>
          )}

          {presentation.constructionPricing.length > 0 &&
            presentation.constructionPricing.every(
              (resolution) => resolution.status === "resolved",
            ) && (
              <div className="mt-4 flex min-w-0 items-center gap-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 aria-hidden="true" size={16} className="shrink-0" />
                <span className="min-w-0 break-words">Construction prices are ready.</span>
              </div>
            )}
        </div>
        </aside>
        )}
      </div>
    </section>
  );
};
