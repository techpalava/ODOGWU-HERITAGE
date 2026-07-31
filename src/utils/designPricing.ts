import type {
  BusinessSettings,
  CartItem,
  CustomDetailOption,
  DesignSelections,
  Fabric,
  StyleCategory,
} from "../types";
import {
  calculateGarmentDetailsPrice,
} from "./decorativePricing";
import {
  getFabricSewingCost,
  resolveFabricPrice,
} from "./fabricPricing";
import { roundMoney } from "./money";

export const CHECKOUT_DESIGN_PRICING_VERSION =
  "2026-07-30-design-checkout-v1";

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

  return Object.values(details.customDetails || {}).reduce(
    (total, optionId) =>
      total + (optionId ? optionCosts[optionId] || 0 : 0),
    0,
  );
};

export interface AuthoritativeDesignPricing {
  fabricPrice: number;
  fabricSewingCost: number;
  constructionSewingCost: number;
  customDetailsPrice: number;
  monogramPrice: number;
  traditionalAccessoriesPrice: number;
  garmentSubtotal: number;
}

export const calculateAuthoritativeDesignPricing = (
  item: CartItem,
  fabric: Fabric,
  style: StyleCategory,
  catalog: CustomDetailOption[],
  businessSettings: BusinessSettings,
): AuthoritativeDesignPricing | null => {
  const resolvedFabricPrice = resolveFabricPrice(fabric);
  if (resolvedFabricPrice === null) return null;

  const fabricSewingCost = getFabricSewingCost(fabric);
  const constructionSewingCost = getConstructionSewingCost(item.design);
  const detailPricing = calculateGarmentDetailsPrice(
    item.design,
    style,
    catalog,
  );
  const traditionalAccessoriesPrice = detailPricing.accessories.reduce(
    (total, accessory) => total + accessory.price,
    0,
  );
  let customDetailsPrice = detailPricing.total;
  if (item.design.additionalCap) {
    customDetailsPrice +=
      businessSettings.pricingSettings.standardAccessoryCharge;
  }
  if (item.design.hasLining) {
    customDetailsPrice += 10;
  }

  return {
    fabricPrice: resolvedFabricPrice,
    fabricSewingCost,
    constructionSewingCost,
    customDetailsPrice: roundMoney(customDetailsPrice),
    monogramPrice: roundMoney(detailPricing.monogramPrice),
    traditionalAccessoriesPrice: roundMoney(
      traditionalAccessoriesPrice,
    ),
    garmentSubtotal: roundMoney(
      resolvedFabricPrice +
        fabricSewingCost +
        constructionSewingCost +
        customDetailsPrice,
    ),
  };
};
