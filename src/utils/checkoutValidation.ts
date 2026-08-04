import type {
  Batch,
  BusinessSettings,
  CartItem,
  CartPricingReview,
  CustomDetailOption,
  Fabric,
  StyleCategory,
} from "../types";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";
import {
  filterDesignSelectionsForCustomDetails,
  getMissingCustomDetailGroup,
  isAmbiguousLowerGarment,
  getSelectedGarmentCode,
} from "./catalogHelpers";
import { filterDesignSelectionsForDecorativeFeatures } from "./decorativePricing";
import {
  calculateAuthoritativeDesignPricing,
  CHECKOUT_DESIGN_PRICING_VERSION,
} from "./designPricing";
import { roundMoney } from "./money";
import {
  calculateCartPricing,
  getCartItemGarmentSubtotal,
  getStoredShippingCost,
  migrateLegacyCartShippingItems,
} from "./shippingPricing";

export interface CheckoutRevalidationContext {
  fabrics: Fabric[];
  styles: StyleCategory[];
  batches: Batch[];
  customDetailCatalog: CustomDetailOption[];
  businessSettings: BusinessSettings;
  depositRatio: number;
}

export interface CheckoutRevalidationResult {
  items: CartItem[];
  blockers: string[];
  canProceed: boolean;
  changed: boolean;
  rerouteItemIds: string[];
  pricing: ReturnType<typeof calculateCartPricing>;
}

const getStableSourceFingerprint = (
  item: CartItem,
  fabric: Fabric,
  style: StyleCategory,
  catalog: CustomDetailOption[],
  businessSettings: BusinessSettings,
): string => {
  const source = JSON.stringify({
    version: CHECKOUT_DESIGN_PRICING_VERSION,
    itemId: item.id,
    batchType: item.batchType,
    fabric: {
      code: fabric.code,
      category: fabric.category,
      price: fabric.price,
      stockStatus: fabric.stockStatus,
    },
    style: {
      id: style.id,
      constructionDetails: style.constructionDetails,
      includedDesignFeatures: style.includedDesignFeatures,
    },
    design: item.design,
    catalog: catalog.map((option) => ({
      id: option.id,
      priceCents: option.priceCents,
      active: option.active,
    })),
    standardAccessoryCharge:
      businessSettings.pricingSettings.standardAccessoryCharge,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `PRICE-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const hasRequiredMeasurements = (item: CartItem): boolean =>
  [
    item.measurements.neck,
    item.measurements.shoulder,
    item.measurements.chest,
    item.measurements.waist,
    item.measurements.hip,
  ].every((value) => typeof value === "number" && value > 0);

const findCurrentBatch = (
  item: CartItem,
  batches: Batch[],
): Batch | undefined => {
  const identifiers = new Set(
    [
      item.batchId,
      item.garment.batchShipping?.batchId,
      item.batchName,
      item.garment.batchShipping?.batchName,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLocaleLowerCase("en")),
  );
  return batches.find(
    (batch) =>
      identifiers.has(batch.id.trim().toLocaleLowerCase("en")) ||
      identifiers.has(batch.name.trim().toLocaleLowerCase("en")),
  );
};

export const confirmCartPricingUpdates = (
  items: CartItem[],
  confirmedAt = new Date().toISOString(),
): CartItem[] =>
  items.map((item) =>
    item.pricingReview?.status === "CONFIRMATION_REQUIRED"
      ? {
          ...item,
          pricingReview: {
            ...item.pricingReview,
            status: "CURRENT" as const,
            confirmedAt,
            previousGarmentSubtotal:
              item.pricingReview.updatedGarmentSubtotal,
          },
        }
      : item,
  );

export const rerouteCartItemToIndividual = (
  items: CartItem[],
  itemId: string,
): CartItem[] =>
  migrateLegacyCartShippingItems(
    items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            batchType: "alone" as const,
            batchId: undefined,
            batchName: "Individual Order (No Batch)",
            customGroupCode: undefined,
            shippingSnapshot: undefined,
            garment: {
              ...item.garment,
              batchShipping: undefined,
              individualShipping: undefined,
            },
          }
        : item,
    ),
  ).items;

export const revalidateCartForCheckout = (
  cartItems: CartItem[],
  context: CheckoutRevalidationContext,
  repricedAt = new Date().toISOString(),
): CheckoutRevalidationResult => {
  const blockers: string[] = [];
  const rerouteItemIds: string[] = [];
  let changed = false;

  const repricedItems = cartItems.map((item): CartItem => {
    const fabric = context.fabrics.find(
      (candidate) => candidate.code === item.fabric.code,
    );
    if (!fabric) {
      blockers.push(`${item.fabric.name} is no longer available.`);
      return item;
    }
    if (
      fabric.stockStatus === "OUT_OF_STOCK" ||
      fabric.stockStatus === "HIDDEN"
    ) {
      blockers.push(`${fabric.name} is currently unavailable.`);
    }

    const style = context.styles.find(
      (candidate) => candidate.id === item.style.id,
    );
    if (!style) {
      blockers.push(`${item.style.name} is no longer available.`);
      return { ...item, fabric };
    }

    const garmentCode = getSelectedGarmentCode(item.garment);
    const enrichedGarment = item.garment
      ? { ...item.garment, lowerGarmentType: item.design.lowerGarmentType }
      : { lowerGarmentType: item.design.lowerGarmentType };

    const isGarmentTypeUnresolved = isAmbiguousLowerGarment(garmentCode) && !item.design.lowerGarmentType;

    const applicableDesign = filterDesignSelectionsForDecorativeFeatures(
      filterDesignSelectionsForCustomDetails(
        style,
        item.design,
        context.customDetailCatalog,
        enrichedGarment,
      ),
      style,
      enrichedGarment,
    );
    const pricingItem =
      applicableDesign === item.design
        ? item
        : { ...item, design: applicableDesign };

    const missingCustomDetail = getMissingCustomDetailGroup(
      style,
      applicableDesign,
      context.customDetailCatalog,
      enrichedGarment,
    );

    if (missingCustomDetail) {
      blockers.push(
        `${style.name} requires a ${missingCustomDetail.replace(/_/g, " ")} selection.`,
      );
    } else if (isGarmentTypeUnresolved) {
      blockers.push(`${style.name} requires a Garment Type selection.`);
    }
    if (!hasRequiredMeasurements(item)) {
      blockers.push(`${style.name} requires complete measurements.`);
    }
    if (!item.deliverySelection) {
      blockers.push("Review shipping details");
    }
    if (!item.batchType) {
      blockers.push(`${style.name} requires a valid order route.`);
    }

    if (item.batchType === "community") {
      const batch = findCurrentBatch(item, context.batches);
      const eligibility = BatchBusinessRules.canAcceptOrders(batch);
      if (!batch || !eligibility.canAcceptOrders) {
        const routingDecision = OrderRoutingEngine.evaluateOrder(
          {
            orderType: "Community",
            batchId: item.batchId,
            batchName: item.batchName,
          },
          context.batches,
        );
        if (
          routingDecision.availableActionTypes.includes(
            "INDIVIDUAL_ORDER",
          )
        ) {
          rerouteItemIds.push(item.id);
        }
        blockers.push(
          `${item.batchName || "The selected community batch"} is no longer joinable. Continue this design as an individual order or choose another available route.`,
        );
      }
    }
    if (
      (item.batchType === "personalized" ||
        item.batchType === "actual") &&
      !item.batchId &&
      !item.customGroupCode
    ) {
      blockers.push(`${style.name} requires a valid batch identifier.`);
    }

    const authoritativePricing = calculateAuthoritativeDesignPricing(
      pricingItem,
      fabric,
      style,
      context.customDetailCatalog,
      context.businessSettings,
    );
    if (!authoritativePricing) {
      blockers.push(`Pricing is not configured for ${fabric.name}.`);
      return { ...item, fabric, style };
    }

    const previousGarmentSubtotal = getCartItemGarmentSubtotal(item);
    const sourceFingerprint = getStableSourceFingerprint(
      pricingItem,
      fabric,
      style,
      context.customDetailCatalog,
      context.businessSettings,
    );
    const amountChanged =
      Math.abs(
        authoritativePricing.garmentSubtotal -
          previousGarmentSubtotal,
      ) >= 0.005;
    const existingConfirmationStillPending =
      item.pricingReview?.status === "CONFIRMATION_REQUIRED" &&
      item.pricingReview.sourceFingerprint === sourceFingerprint &&
      Math.abs(
        item.pricingReview.updatedGarmentSubtotal -
          authoritativePricing.garmentSubtotal,
      ) < 0.005;
    const pricingStatus =
      amountChanged || existingConfirmationStillPending
        ? "CONFIRMATION_REQUIRED"
        : "CURRENT";
    if (pricingStatus === "CONFIRMATION_REQUIRED") {
      blockers.push("Confirm the updated garment price before payment.");
    }

    const inboundShipping = getStoredShippingCost(item.garment);
    const canPreservePricingReview =
      item.pricingReview?.sourceFingerprint === sourceFingerprint &&
      item.pricingReview.status === pricingStatus &&
      Math.abs(
        item.pricingReview.updatedGarmentSubtotal -
          authoritativePricing.garmentSubtotal,
      ) < 0.005;
    const pricingReview: CartPricingReview = canPreservePricingReview
      ? item.pricingReview
      : {
          pricingVersion: CHECKOUT_DESIGN_PRICING_VERSION,
          repricedAt,
          sourceFingerprint,
          status: pricingStatus,
          previousGarmentSubtotal:
            existingConfirmationStillPending && item.pricingReview
              ? item.pricingReview.previousGarmentSubtotal
              : previousGarmentSubtotal,
          updatedGarmentSubtotal:
            authoritativePricing.garmentSubtotal,
          confirmedAt:
            pricingStatus === "CURRENT"
              ? item.pricingReview?.confirmedAt
              : undefined,
        };
    const updatedItem: CartItem = {
      ...pricingItem,
      fabric,
      style,
      garment: {
        ...item.garment,
        clothingPrice: authoritativePricing.clothingPrice,
        includesFabricAndSewing:
          authoritativePricing.includesFabricAndSewing,
        includedFabricPrice: authoritativePricing.includedFabricPrice,
        includedSewingCost: authoritativePricing.includedSewingCost,
        fabricPrice: authoritativePricing.fabricPrice,
        fabricSewingCost: authoritativePricing.fabricSewingCost,
        constructionSewingCost:
          authoritativePricing.constructionSewingCost,
        constructionUpgradesPrice:
          authoritativePricing.constructionUpgradesPrice,
        customDetailsPrice: authoritativePricing.customDetailsPrice,
        monogramPrice: authoritativePricing.monogramPrice,
        traditionalAccessoriesPrice:
          authoritativePricing.traditionalAccessoriesPrice,
        totalPrice: roundMoney(
          authoritativePricing.garmentSubtotal + inboundShipping,
        ),
        checkoutTotal: roundMoney(
          authoritativePricing.garmentSubtotal + inboundShipping,
        ),
      },
      pricingReview,
    };
    if (JSON.stringify(updatedItem) !== JSON.stringify(item)) {
      changed = true;
    }
    return updatedItem;
  });

  const migratedItems = migrateLegacyCartShippingItems(
    repricedItems,
    repricedAt,
  ).items;
  if (JSON.stringify(migratedItems) !== JSON.stringify(repricedItems)) {
    changed = true;
  }
  const pricing = calculateCartPricing(
    migratedItems,
    context.depositRatio,
  );
  blockers.push(...pricing.blockingReasons);
  const uniqueBlockers = [...new Set(blockers)];

  return {
    items: migratedItems,
    blockers: uniqueBlockers,
    canProceed: uniqueBlockers.length === 0 && pricing.canCheckout,
    changed,
    rerouteItemIds: [...new Set(rerouteItemIds)],
    pricing,
  };
};
