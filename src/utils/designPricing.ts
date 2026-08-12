import type {
  BusinessSettings,
  CartItem,
  CustomDetailGarmentContext,
  CustomDetailOption,
  DesignSelections,
  Fabric,
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

export const CHECKOUT_DESIGN_PRICING_VERSION =
  "2026-08-01-design-checkout-v2";

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

export interface AuthoritativeDesignPricing {
  clothingPrice: number;
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
  style?: StyleCategory | null;
  garment?: CustomDetailGarmentContext | null;
  catalog: CustomDetailOption[];
  businessSettings: BusinessSettings;
}

export const calculateDesignPricing = ({
  route,
  design,
  fabric,
  materialPricing,
  style,
  garment,
  catalog,
  businessSettings,
  }: DesignPricingInput): AuthoritativeDesignPricing | null => {
const resolvedMaterialPricing =
  materialPricing ??
  (fabric ? resolveLegacyFabricMaterialPricing(fabric) : null);

if (!resolvedMaterialPricing || resolvedMaterialPricing.status !== "resolved") {
  return null;
}

  const enrichedGarment = garment
    ? { ...garment, lowerGarmentType: design.lowerGarmentType }
    : { lowerGarmentType: design.lowerGarmentType };

  const applicableDesign = filterDesignSelectionsForCustomDetails(
    style || null,
    design,
    catalog,
    enrichedGarment,
  );
  const rawFabricSewingCost = resolvedMaterialPricing.baseFabricSewingCost;
  const rawConstructionSewingCost = style
    ? getConstructionSewingCost(applicableDesign)
    : 0;
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

  const clothingPrice = roundMoney(catalogPricing.clothingPrice);
  const monogramPrice = roundMoney(detailPricing.monogramPrice);
  const roundedAccessoriesPrice = roundMoney(traditionalAccessoriesPrice);
  constructionUpgradesPrice = roundMoney(constructionUpgradesPrice);
  const customDetailsPrice = roundMoney(
    constructionUpgradesPrice + monogramPrice + roundedAccessoriesPrice,
  );
  const includesFabricAndSewing = isBatchPricingRoute(route);
  const fabricPrice = includesFabricAndSewing
    ? resolvedMaterialPricing.additionalMaterialPrice
    : resolvedMaterialPricing.totalMaterialPrice;
  const fabricSewingCost = includesFabricAndSewing
    ? 0
    : rawFabricSewingCost;
  const constructionSewingCost = includesFabricAndSewing
    ? 0
    : rawConstructionSewingCost;

  return {
    clothingPrice,
    includesFabricAndSewing,
    fabricAllocationCount: resolvedMaterialPricing.allocationCount,
    totalFabricMaterialPrice: roundMoney(
      resolvedMaterialPricing.totalMaterialPrice,
    ),
    additionalFabricPrice: roundMoney(
      resolvedMaterialPricing.additionalMaterialPrice,
    ),
    includedFabricPrice: includesFabricAndSewing
      ? roundMoney(resolvedMaterialPricing.baseMaterialPrice)
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
