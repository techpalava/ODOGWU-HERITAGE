import type {
  BusinessSettings,
  CartItem,
  CustomDetailDesignContext,
  CustomDetailGarmentContext,
  CustomDetailOption,
  DesignSelections,
  Fabric,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  GarmentConstructionSelectionMode,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";
import {
  calculateCustomDetailsPriceBreakdown,
  filterDesignSelectionsForCustomDetails,
  getSelectedCustomDetailOptionIds,
  hasSelectedCustomDetailOption,
} from "./catalogHelpers";
import { DRESS_LINING_OPTION_ID } from "../config/GarmentDetailsConfig";
import {
  calculateGarmentDetailsPrice,
} from "./decorativePricing";
import type { PricedSelection } from "./decorativePricing";
import { roundMoney } from "./money";
import {
  resolveLegacyFabricMaterialPricing,
  type ResolvedFabricAllocationPricing,
} from "./fabricAllocationPricing";
import { getDefaultGarmentDetailsForSpec } from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { resolveAdditionalGarmentPriceRows } from "./additionalGarmentDomain";
import {
  LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE,
  resolveLockedGarmentConstructionBridge,
} from "./garmentConstructionCustomDetails";

export const CHECKOUT_DESIGN_PRICING_VERSION =
  "2026-08-12-design-checkout-v3";

export type SelectedDesignPriceStatus = "READY" | "INBOUND_SHIPPING_PENDING";

export interface LegacySelectedDesignPriceBreakdown {
  pricingModel: "legacy_additive";
  status: SelectedDesignPriceStatus;
  preTaxDesignSubtotal: number;
  taxPercentage: number;
  taxAmount: number;
  taxInclusiveDesignSubtotal: number;
  lagosToEindhovenShipping: number | null;
  selectedDesignPrice: number | null;
  eindhovenToDestinationShipping: number | null;
  finalOrderSubtotal: number | null;
}

export const ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS =
  "INCLUDED_IN_GARMENT_CONSTRUCTION" as const;

export interface AllInclusiveSelectedDesignPriceBreakdown {
  pricingModel: "all_inclusive_garment_construction";
  status: "READY" | "INVALID";
  garmentConstructionSubtotal: number | null;
  customDetailsSubtotal: number | null;
  selectedDesignPrice: number | null;
  includedComponents: Readonly<{
    fabric: typeof ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS;
    sewing: typeof ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS;
    tax: typeof ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS;
    lagosToEindhovenShipping: typeof ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS;
  }>;
  eindhovenToDestinationShipping: number | null;
  finalOrderSubtotal: number | null;
}

export type SelectedDesignPriceBreakdown =
  | LegacySelectedDesignPriceBreakdown
  | AllInclusiveSelectedDesignPriceBreakdown;

export const sanitizeTaxPercentage = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

const sanitizeMoneyInput = (value: number): number =>
  Number.isFinite(value) ? roundMoney(Math.max(0, value)) : 0;

/**
 * Legacy additive pricing keeps tax and inbound shipping explicit. New
 * garment-construction pricing uses the all-inclusive input below instead.
 * Final-mile delivery remains separate in both models.
 */
interface LegacySelectedDesignPriceInput {
  pricingModel?: "legacy_additive";
  preTaxDesignSubtotal: number;
  taxPercentage: number;
  lagosToEindhovenShipping: number | null;
  eindhovenToDestinationShipping?: number | null;
}

interface AllInclusiveSelectedDesignPriceInput {
  pricingModel: "all_inclusive_garment_construction";
  garmentConstructionSubtotal: number;
  customDetailsSubtotal: number;
  eindhovenToDestinationShipping?: number | null;
}

export function calculateSelectedDesignPrice(
  input: AllInclusiveSelectedDesignPriceInput,
): AllInclusiveSelectedDesignPriceBreakdown;
export function calculateSelectedDesignPrice(
  input: LegacySelectedDesignPriceInput,
): LegacySelectedDesignPriceBreakdown;
export function calculateSelectedDesignPrice(
  input: LegacySelectedDesignPriceInput | AllInclusiveSelectedDesignPriceInput,
): SelectedDesignPriceBreakdown;
export function calculateSelectedDesignPrice(
  input: LegacySelectedDesignPriceInput | AllInclusiveSelectedDesignPriceInput,
): SelectedDesignPriceBreakdown {
  if (input.pricingModel === "all_inclusive_garment_construction") {
    const garmentConstructionSubtotal =
      Number.isFinite(input.garmentConstructionSubtotal) &&
      input.garmentConstructionSubtotal >= 0
        ? roundMoney(input.garmentConstructionSubtotal)
        : null;
    const customDetailsSubtotal =
      Number.isFinite(input.customDetailsSubtotal) &&
      input.customDetailsSubtotal >= 0
        ? roundMoney(input.customDetailsSubtotal)
        : null;
    const finalMileShipping =
      typeof input.eindhovenToDestinationShipping === "number" &&
      Number.isFinite(input.eindhovenToDestinationShipping) &&
      input.eindhovenToDestinationShipping >= 0
        ? roundMoney(input.eindhovenToDestinationShipping)
        : null;
    const selectedDesignPrice =
      garmentConstructionSubtotal === null || customDetailsSubtotal === null
        ? null
        : roundMoney(garmentConstructionSubtotal + customDetailsSubtotal);
    return {
      pricingModel: "all_inclusive_garment_construction",
      status: selectedDesignPrice === null ? "INVALID" : "READY",
      garmentConstructionSubtotal,
      customDetailsSubtotal,
      selectedDesignPrice,
      includedComponents: {
        fabric: ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS,
        sewing: ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS,
        tax: ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS,
        lagosToEindhovenShipping:
          ALL_INCLUSIVE_CONSTRUCTION_COMPONENT_STATUS,
      },
      eindhovenToDestinationShipping: finalMileShipping,
      finalOrderSubtotal:
        selectedDesignPrice === null || finalMileShipping === null
          ? null
          : roundMoney(selectedDesignPrice + finalMileShipping),
    };
  }

  const {
    preTaxDesignSubtotal,
    taxPercentage,
    lagosToEindhovenShipping,
    eindhovenToDestinationShipping = null,
  } = input;
  const sanitizedPreTaxSubtotal = sanitizeMoneyInput(preTaxDesignSubtotal);
  const sanitizedTaxPercentage = sanitizeTaxPercentage(taxPercentage);
  const taxAmount = roundMoney(
    sanitizedPreTaxSubtotal * sanitizedTaxPercentage / 100,
  );
  const taxInclusiveDesignSubtotal = roundMoney(
    sanitizedPreTaxSubtotal + taxAmount,
  );
  const inboundShipping =
    typeof lagosToEindhovenShipping === "number" &&
    Number.isFinite(lagosToEindhovenShipping) &&
    lagosToEindhovenShipping >= 0
      ? roundMoney(lagosToEindhovenShipping)
      : null;
  const finalMileShipping =
    typeof eindhovenToDestinationShipping === "number" &&
    Number.isFinite(eindhovenToDestinationShipping) &&
    eindhovenToDestinationShipping >= 0
      ? roundMoney(eindhovenToDestinationShipping)
      : null;
  const selectedDesignPrice =
    inboundShipping === null
      ? null
      : roundMoney(taxInclusiveDesignSubtotal + inboundShipping);

  return {
    pricingModel: "legacy_additive",
    status:
      selectedDesignPrice === null ? "INBOUND_SHIPPING_PENDING" : "READY",
    preTaxDesignSubtotal: sanitizedPreTaxSubtotal,
    taxPercentage: sanitizedTaxPercentage,
    taxAmount,
    taxInclusiveDesignSubtotal,
    lagosToEindhovenShipping: inboundShipping,
    selectedDesignPrice,
    eindhovenToDestinationShipping: finalMileShipping,
    finalOrderSubtotal:
      selectedDesignPrice !== null && finalMileShipping !== null
        ? roundMoney(selectedDesignPrice + finalMileShipping)
        : null,
  };
}

export const CONSTRUCTION_SEWING_COST_MAP = {
  default: 4.06,
  shirt: {
    standard_shortSleeve: 4.06,
    standard_longSleeve: 4.38,
    long_shortSleeve: 4.69,
    long_longSleeve: 5,
  },
  dress: {
    standard_sleeveless: 5,
    standard_shortSleeve: 5.31,
    standard_longSleeve: 5.83,
    long_sleeveless: 5.63,
    long_shortSleeve: 5.94,
    long_longSleeve: 6.25,
  },
  trouser: {
    rope: 5.63,
    elastic: 5.94,
    belt: 6.25,
  },
  shorts: {
    rope: 5,
    elastic: 5.31,
    belt: 5.83,
  },
  skirt: {
    standard: 5.31,
    long: 5.94,
  },
} as const;

export const getConstructionSewingCost = (
  details: DesignSelections,
): number => {
  const optionCosts: Record<string, number> = {
    shirt_std_short:
      CONSTRUCTION_SEWING_COST_MAP.shirt.standard_shortSleeve,
    shirt_std_midlong:
      CONSTRUCTION_SEWING_COST_MAP.shirt.standard_longSleeve,
    shirt_long_short:
      CONSTRUCTION_SEWING_COST_MAP.shirt.long_shortSleeve,
    shirt_long_midlong:
      CONSTRUCTION_SEWING_COST_MAP.shirt.long_longSleeve,
    dress_std_sleeveless:
      CONSTRUCTION_SEWING_COST_MAP.dress.standard_sleeveless,
    dress_std_short:
      CONSTRUCTION_SEWING_COST_MAP.dress.standard_shortSleeve,
    dress_std_midlong:
      CONSTRUCTION_SEWING_COST_MAP.dress.standard_longSleeve,
    dress_long_sleeveless:
      CONSTRUCTION_SEWING_COST_MAP.dress.long_sleeveless,
    dress_long_short:
      CONSTRUCTION_SEWING_COST_MAP.dress.long_shortSleeve,
    dress_long_midlong:
      CONSTRUCTION_SEWING_COST_MAP.dress.long_longSleeve,
    shorts_std_rope: CONSTRUCTION_SEWING_COST_MAP.shorts.rope,
    shorts_std_elastic: CONSTRUCTION_SEWING_COST_MAP.shorts.elastic,
    shorts_std_belt: CONSTRUCTION_SEWING_COST_MAP.shorts.belt,
    bum_rope: CONSTRUCTION_SEWING_COST_MAP.shorts.rope,
    bum_elastic: CONSTRUCTION_SEWING_COST_MAP.shorts.elastic,
    bum_belt: CONSTRUCTION_SEWING_COST_MAP.shorts.belt,
    trouser_rope: CONSTRUCTION_SEWING_COST_MAP.trouser.rope,
    trouser_elastic: CONSTRUCTION_SEWING_COST_MAP.trouser.elastic,
    trouser_belt: CONSTRUCTION_SEWING_COST_MAP.trouser.belt,
    skirt_std: CONSTRUCTION_SEWING_COST_MAP.skirt.standard,
    skirt_long: CONSTRUCTION_SEWING_COST_MAP.skirt.long,
  };

  return getSelectedCustomDetailOptionIds(details).reduce(
    (total, optionId) =>
      total + (optionId ? optionCosts[optionId] || 0 : 0),
    0,
  );
};

const getConstructionSewingCostForOptionIds = (
  optionIds: readonly string[],
): number =>
  optionIds.reduce(
    (total, optionId) =>
      total +
      getConstructionSewingCost({
        customDetails: { shirt_construction: optionId },
      }),
    0,
  );

export interface AuthoritativeDesignPricing {
  pricingModel: "legacy_additive" | "all_inclusive_garment_construction";
  baseGarmentPricingStatus: "resolved" | "unresolved";
  unresolvedBaseGarmentTypes: FabricGarmentType[];
  baseGarmentPriceRows: CustomerDesignBaseGarmentPriceRow[];
  additionalGarmentPricingStatus: "resolved" | "unresolved";
  unresolvedAdditionalGarmentIds: string[];
  additionalGarmentPriceRows: CustomerDesignAdditionalGarmentPriceRow[];
  clothingPrice: number;
  garmentConstructionSubtotal: number;
  includesFabricAndSewing: boolean;
  fabricAllocationCount: number;
  totalFabricMaterialPrice: number;
  additionalFabricPrice: number;
  includedFabricPrice: number;
  includedSewingCost: number;
  fabricPrice: number;
  fabricSewingCost: number;
  constructionSewingCost: number;
  constructionUpgradesPrice: number;
  customDetailsPrice: number;
  monogramPrice: number;
  traditionalAccessoriesPrice: number;
  decorativeFeatures: PricedSelection[];
  traditionalAccessories: PricedSelection[];
  garmentSubtotal: number;
}

export type DesignPricingRoute = NonNullable<CartItem["batchType"]>;

export const isBatchPricingRoute = (
  route: CartItem["batchType"],
): boolean =>
  route === "community" || route === "personalized" || route === "actual";

export interface DesignPricingInput {
  route: CartItem["batchType"];
  design: DesignSelections;
  fabric?: Fabric | null;
  materialPricing?: ResolvedFabricAllocationPricing;
  allowUnresolvedMaterialPricing?: boolean;
  style?: StyleCategory | null;
  designContext?: CustomDetailDesignContext | null;
  baseGarmentComposition?: readonly FabricCapacityGarmentSpec[];
  additionalGarments?: readonly FabricGarmentAssignment[];
  garment?: CustomDetailGarmentContext | null;
  catalog: CustomDetailOption[];
  businessSettings: BusinessSettings;
  garmentConstructionSelectionMode?: GarmentConstructionSelectionMode;
  garmentTypeSelection?: GarmentTypeStepSelection;
}

/** Explanatory rows that reconcile exactly to the structured clothing price. */
export interface CustomerDesignBaseGarmentPriceRow {
  garmentKey: string;
  garmentType: FabricGarmentType;
  label: string;
  price: number;
}

export interface CustomerDesignAdditionalGarmentPriceRow {
  assignmentId: string;
  garmentType: FabricGarmentType;
  label: string;
  price: number;
}

export interface StructuredBaseGarmentPricingResolution {
  status: "resolved" | "unresolved";
  defaultSelections: DesignSelections;
  unresolvedGarmentTypes: FabricGarmentType[];
}

/**
 * Structured design sources price the physical garments the capacity domain
 * already defines. Fabric units remain capacity only, never a price multiplier.
 */
export const resolveStructuredBaseGarmentPricing = (
  composition: readonly FabricCapacityGarmentSpec[],
): StructuredBaseGarmentPricingResolution => {
  const unresolvedGarmentTypes: FabricGarmentType[] = [];
  const defaultSelections = composition.reduce<DesignSelections>(
    (resolved, garmentSpec) => {
      const garmentDefaults = getDefaultGarmentDetailsForSpec(garmentSpec);
      if (!garmentDefaults) {
        unresolvedGarmentTypes.push(garmentSpec.garmentType);
        return resolved;
      }
      return {
        ...resolved,
        customDetails: {
          ...(resolved.customDetails || {}),
          ...garmentDefaults,
        },
      };
    },
    { customDetails: {} },
  );

  return {
    status: unresolvedGarmentTypes.length === 0 ? "resolved" : "unresolved",
    defaultSelections,
    unresolvedGarmentTypes: [...new Set(unresolvedGarmentTypes)],
  };
};

const resolveStructuredBaseGarmentPriceRows = (
  composition: readonly FabricCapacityGarmentSpec[],
  design: DesignSelections,
  catalog: CustomDetailOption[],
): CustomerDesignBaseGarmentPriceRow[] =>
  composition.flatMap((garmentSpec) => {
    const defaultDetails = getDefaultGarmentDetailsForSpec(garmentSpec);
    if (!defaultDetails) return [];

    const customDetails = Object.fromEntries(
      Object.entries(defaultDetails).map(([groupId, defaultOptionId]) => [
        groupId,
        design.customDetails?.[groupId] ?? defaultOptionId,
      ]),
    );
    const price = calculateCustomDetailsPriceBreakdown(
      { customDetails },
      catalog,
    ).clothingPrice;

    return [
      {
        garmentKey: garmentSpec.key,
        garmentType: garmentSpec.garmentType,
        label: getFabricGarmentLabel(garmentSpec.garmentType),
        price: roundMoney(price),
      },
    ];
  });

export const calculateDesignPricing = ({
  route,
  design,
  fabric,
  materialPricing,
  allowUnresolvedMaterialPricing = false,
  style,
  designContext,
  baseGarmentComposition,
  additionalGarments = [],
  garment,
  catalog,
  businessSettings,
  garmentConstructionSelectionMode,
  garmentTypeSelection,
  }: DesignPricingInput): AuthoritativeDesignPricing | null => {
const resolvedMaterialPricing =
  materialPricing ??
  (fabric ? resolveLegacyFabricMaterialPricing(fabric) : null);

const hasResolvedMaterialPricing =
  resolvedMaterialPricing?.status === "resolved";

if (!hasResolvedMaterialPricing && !allowUnresolvedMaterialPricing) {
  return null;
}

  const constructionBridge = resolveLockedGarmentConstructionBridge({
    mode: garmentConstructionSelectionMode,
    garmentTypeSelection,
    catalog,
    selections: design,
  });
  const isLockedConstructionMode =
    constructionBridge.mode !== LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE;
  const structuredBaseGarmentPricing =
    !isLockedConstructionMode && baseGarmentComposition
    ? resolveStructuredBaseGarmentPricing(baseGarmentComposition)
    : null;
  const designWithStructuredDefaults = structuredBaseGarmentPricing
    ? {
        ...design,
        customDetails: {
          ...(structuredBaseGarmentPricing.defaultSelections.customDetails || {}),
          ...(design.customDetails || {}),
        },
      }
    : constructionBridge.cleanedSelections;
  const pricingDesignContext = designContext ?? style ?? null;
  const enrichedGarment = garment
    ? { ...garment, lowerGarmentType: design.lowerGarmentType }
    : { lowerGarmentType: design.lowerGarmentType };

  const applicableDesign = filterDesignSelectionsForCustomDetails(
    pricingDesignContext,
    designWithStructuredDefaults,
    catalog,
    enrichedGarment,
    additionalGarments
      .filter(
        (assignment) =>
          assignment.sourceRole === "additional" &&
          assignment.dependencyStatus !== "orphaned",
      )
      .map((assignment) => assignment.garmentType),
  );
  const rawFabricSewingCost = hasResolvedMaterialPricing
    ? resolvedMaterialPricing.baseFabricSewingCost
    : 0;
  const lockedConstructionOptionIds = isLockedConstructionMode
    ? constructionBridge.readOnlyConstructionRows.flatMap((row) =>
        row.components.map((component) => component.optionId),
      )
    : [];
  const rawConstructionSewingCost =
    (pricingDesignContext ? getConstructionSewingCost(applicableDesign) : 0) +
    getConstructionSewingCostForOptionIds(lockedConstructionOptionIds);
  const detailPricing = calculateGarmentDetailsPrice(
    applicableDesign,
    style,
    catalog,
    enrichedGarment,
  );
  const catalogPricing = calculateCustomDetailsPriceBreakdown(
    applicableDesign,
    catalog,
  );
  const traditionalAccessoriesPrice = detailPricing.accessories.reduce(
    (total, accessory) => total + accessory.price,
    0,
  );
  let constructionUpgradesPrice = catalogPricing.constructionUpgradesPrice;
  if (applicableDesign.additionalCap) {
    constructionUpgradesPrice +=
      businessSettings.pricingSettings.standardAccessoryCharge;
  }
  if (
    applicableDesign.hasLining &&
    !hasSelectedCustomDetailOption(
      applicableDesign,
      DRESS_LINING_OPTION_ID,
    )
  ) {
    constructionUpgradesPrice += 10;
  }

  const candidateBaseGarmentPriceRows = isLockedConstructionMode
    ? constructionBridge.readOnlyConstructionRows.map((row, index) => ({
        garmentKey: `garment-type:${row.garmentType}:${index + 1}`,
        garmentType: row.garmentType,
        label: row.garmentLabel,
        price: roundMoney(row.price),
      }))
    : structuredBaseGarmentPricing
      ? resolveStructuredBaseGarmentPriceRows(
        baseGarmentComposition || [],
        applicableDesign,
        catalog,
      )
      : [];
  const candidateBaseClothingPrice = roundMoney(
    candidateBaseGarmentPriceRows.reduce((total, row) => total + row.price, 0),
  );
  const hasDemographicPolicyAdditionalGarment = additionalGarments.some(
    (assignment) =>
      assignment.sourceRole === "additional" &&
      assignment.eligibilityRule === "demographic_policy",
  );
  const baseGarmentPriceRows = isLockedConstructionMode
    ? candidateBaseGarmentPriceRows
    : candidateBaseGarmentPriceRows.length > 0 &&
    (candidateBaseClothingPrice === roundMoney(catalogPricing.clothingPrice) ||
      hasDemographicPolicyAdditionalGarment)
      ? candidateBaseGarmentPriceRows
      : [];
  const baseClothingPrice = roundMoney(
    baseGarmentPriceRows.length > 0
      ? candidateBaseClothingPrice
      : isLockedConstructionMode
        ? candidateBaseClothingPrice
        : catalogPricing.clothingPrice,
  );
  const resolvedAdditionalGarmentPricing = resolveAdditionalGarmentPriceRows({
    additionalAssignments: additionalGarments,
    mainGarmentPriceRows: baseGarmentPriceRows,
    designSelections: applicableDesign,
  });
  const additionalGarmentPriceRows =
    resolvedAdditionalGarmentPricing.unresolvedAssignmentIds.length === 0
      ? resolvedAdditionalGarmentPricing.rows
      : [];
  const clothingPrice = roundMoney(
    baseClothingPrice +
      additionalGarmentPriceRows.reduce((total, row) => total + row.price, 0),
  );
  const monogramPrice = roundMoney(detailPricing.monogramPrice);
  const roundedAccessoriesPrice = roundMoney(traditionalAccessoriesPrice);
  constructionUpgradesPrice = roundMoney(constructionUpgradesPrice);
  const customDetailsPrice = roundMoney(
    constructionUpgradesPrice + monogramPrice + roundedAccessoriesPrice,
  );
  const usesAllInclusiveConstruction = isLockedConstructionMode;
  const includesFabricAndSewing =
    usesAllInclusiveConstruction || isBatchPricingRoute(route);
  const fabricPrice = !hasResolvedMaterialPricing
    ? 0
    : usesAllInclusiveConstruction
      ? 0
      : includesFabricAndSewing
      ? resolvedMaterialPricing.additionalMaterialPrice
      : resolvedMaterialPricing.totalMaterialPrice;
  const fabricSewingCost = includesFabricAndSewing
    ? 0
    : rawFabricSewingCost;
  const constructionSewingCost = includesFabricAndSewing
    ? 0
    : rawConstructionSewingCost;

  return {
    pricingModel: usesAllInclusiveConstruction
      ? "all_inclusive_garment_construction"
      : "legacy_additive",
    baseGarmentPricingStatus: isLockedConstructionMode
      ? constructionBridge.unresolvedGarmentTypes.length === 0
        ? "resolved"
        : "unresolved"
      : structuredBaseGarmentPricing?.status || "resolved",
    unresolvedBaseGarmentTypes: isLockedConstructionMode
      ? constructionBridge.unresolvedGarmentTypes
      : structuredBaseGarmentPricing?.unresolvedGarmentTypes || [],
    baseGarmentPriceRows,
    additionalGarmentPricingStatus:
      resolvedAdditionalGarmentPricing.unresolvedAssignmentIds.length === 0
        ? "resolved"
        : "unresolved",
    unresolvedAdditionalGarmentIds:
      resolvedAdditionalGarmentPricing.unresolvedAssignmentIds,
    additionalGarmentPriceRows,
    clothingPrice,
    garmentConstructionSubtotal: clothingPrice,
    includesFabricAndSewing,
    fabricAllocationCount: hasResolvedMaterialPricing
      ? resolvedMaterialPricing.allocationCount
      : 0,
    totalFabricMaterialPrice: roundMoney(
      hasResolvedMaterialPricing
        ? resolvedMaterialPricing.totalMaterialPrice
        : 0,
    ),
    additionalFabricPrice: roundMoney(
      hasResolvedMaterialPricing
        ? resolvedMaterialPricing.additionalMaterialPrice
        : 0,
    ),
    includedFabricPrice: includesFabricAndSewing
      ? roundMoney(
          hasResolvedMaterialPricing
            ? usesAllInclusiveConstruction
              ? resolvedMaterialPricing.totalMaterialPrice
              : resolvedMaterialPricing.baseMaterialPrice
            : 0,
        )
      : 0,
    includedSewingCost: includesFabricAndSewing
      ? roundMoney(rawFabricSewingCost + rawConstructionSewingCost)
      : 0,
    fabricPrice: roundMoney(fabricPrice),
    fabricSewingCost: roundMoney(fabricSewingCost),
    constructionSewingCost: roundMoney(constructionSewingCost),
    constructionUpgradesPrice,
    customDetailsPrice,
    monogramPrice,
    traditionalAccessoriesPrice: roundedAccessoriesPrice,
    decorativeFeatures: detailPricing.decorativeFeatures,
    traditionalAccessories: detailPricing.accessories,
    garmentSubtotal: roundMoney(
      clothingPrice +
        fabricPrice +
        fabricSewingCost +
        constructionSewingCost +
        customDetailsPrice,
    ),
  };
};

export const calculateAuthoritativeDesignPricing = (
  item: CartItem,
  materialPricingOrFabric: ResolvedFabricAllocationPricing | Fabric,
  style: StyleCategory,
  catalog: CustomDetailOption[],
  businessSettings: BusinessSettings,
): AuthoritativeDesignPricing | null => {
  const materialPricing =
    "status" in materialPricingOrFabric
      ? materialPricingOrFabric
      : undefined;
  const fallbackFabric =
    "status" in materialPricingOrFabric
      ? materialPricingOrFabric.baseFabric
      : materialPricingOrFabric;
  return calculateDesignPricing({
    route: item.batchType,
    design: item.design,
    fabric: fallbackFabric,
    materialPricing,
    style,
    garment: item.garment,
    catalog,
    businessSettings,
  });
};
