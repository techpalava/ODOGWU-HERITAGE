import type { ChangeEvent, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Layers3, UsersRound } from "lucide-react";
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
  const presentation = getGarmentTypeStepPresentation({
    selectedGarmentTypes,
    normalizedCustomDetailCatalog,
  });
  const hasUnresolvedConstructionPricing = presentation.constructionPricing.some(
    (resolution) => resolution.status === "unresolved",
  );
  const garmentCount = presentation.garmentCount;
  const fabricQuantity = presentation.fabricQuantity;

  const handleGarmentChange = (
    garmentType: FabricGarmentType,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextGarmentTypes = updateGarmentTypeSelection(
      presentation.selectedGarmentTypes,
      garmentType,
      event.currentTarget.checked,
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
              You need {fabricQuantity} {fabricQuantity === 1 ? "fabric" : "fabrics"} for your {garmentCount} {garmentCount === 1 ? "garment" : "garments"}.
            </p>
            <p className="mt-2 break-words text-xs font-semibold text-heritage-green">
              Fabrics selected: {selectedFabricQuantity} / {fabricQuantity}
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
            Step 3 later requires a matching Design Style catalogue entry for catalogue designs.
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
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 lg:col-span-full">
            {presentation.categories.map((category) => {
              const price = category.constructionPricing;
              const isResolved = price?.status === "resolved";
              const inputId = `${idPrefix}-${category.garmentType}`;
              return (
                <label
                  key={category.garmentType}
                  htmlFor={inputId}
                  className={`flex min-h-[84px] min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
                    category.selected
                      ? "border-heritage-gold bg-heritage-cream/55 shadow-sm"
                      : "border-heritage-gold/20 bg-white hover:border-heritage-gold/60"
                  } ${
                    category.selected && !isResolved
                      ? "border-amber-500 bg-amber-50"
                      : ""
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={category.selected}
                    onChange={(event) => handleGarmentChange(category.garmentType, event)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-heritage-green"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 break-words font-bold text-heritage-green">
                        {category.label}
                      </span>
                      {isResolved && (
                        <span className="shrink-0 font-mono text-sm font-bold text-heritage-green">
                          {formatGarmentTypeStepEuro(price.totalPrice)}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block break-words text-[11px] leading-relaxed text-heritage-ink/60">
                      {category.fabricCapacityUsage}
                    </span>
                    {category.selected && !isResolved && (
                      <span className="mt-2 flex min-w-0 items-start gap-1.5 text-[11px] font-semibold text-amber-800">
                        <AlertCircle aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          Construction pricing needs review.
                        </span>
                      </span>
                    )}
                  </span>
                </label>
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
