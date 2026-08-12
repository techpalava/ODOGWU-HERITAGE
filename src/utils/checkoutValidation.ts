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
  calculateSelectedDesignPrice,
  calculateDesignPricing,
  CHECKOUT_DESIGN_PRICING_VERSION,
} from "./designPricing";
import {
  getFabricAllocationPricingErrorMessage,
  resolveCartItemFabricAllocationPricing,
  type ResolvedFabricAllocationPricing,
} from "./fabricAllocationPricing";
import { roundMoney } from "./money";
import {
  calculateCartPricing,
  getCartItemGarmentSubtotal,
  getStoredShippingCost,
  migrateLegacyCartShippingItems,
} from "./shippingPricing";
import {
  getCartDesignLabel,
  inspectCartDesignDomain,
  UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER,
} from "./cartDesignDomain";
import { getCartItemConfigurationHash } from "../services/guestOrderSessionService";
import type { PreparedUploadedDesignReference } from "./uploadedDesignCheckoutPreparation";
import { getStyleBaseFabricCapacityComposition } from "../config/StyleFabricCapacityConfig";
import { isAdditionalGarmentAllowed } from "./additionalGarmentDomain";

export interface CheckoutRevalidationContext {
  fabrics: Fabric[];
  styles: StyleCategory[];
  batches: Batch[];
  customDetailCatalog: CustomDetailOption[];
  businessSettings: BusinessSettings;
  depositRatio: number;
  /** Only the checkout coordinator may use this while it is about to transfer. */
  allowPendingUploadedDesignTransfer?: boolean;
  /** Exact immutable references returned by the trusted transfer endpoint. */
  preparedUploadedDesignReferences?: Readonly<
    Record<string, PreparedUploadedDesignReference>
  >;
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
  materialPricing: ResolvedFabricAllocationPricing,
  style: StyleCategory,
  catalog: CustomDetailOption[],
  businessSettings: BusinessSettings,
): string => {
  const materialSources = materialPricing.allocationLines.map((line) => ({
    fabricCode: line.fabricCode,
    category: line.fabric.category,
    materialPrice: line.materialPrice,
    stockStatus: line.fabric.stockStatus,
  }));
  const source = JSON.stringify({
    version: CHECKOUT_DESIGN_PRICING_VERSION,
    itemId: item.id,
    batchType: item.batchType,
    materialSourceType: materialPricing.source,
    materialSources,
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
    vatTaxPercentage:
      businessSettings.pricingSettings.vatTaxPercentage,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `PRICE-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const getUploadedSourceFingerprint = (
  item: CartItem,
  materialPricing: ResolvedFabricAllocationPricing,
  catalog: CustomDetailOption[],
  businessSettings: BusinessSettings,
): string => {
  const source = inspectCartDesignDomain(item).source;
  const materialSources = materialPricing.allocationLines.map((line) => ({
    allocationId: line.allocationId,
    fabricCode: line.fabricCode,
    materialPrice: line.materialPrice,
    stockStatus: line.fabric.stockStatus,
  }));
  const input = JSON.stringify({
    version: CHECKOUT_DESIGN_PRICING_VERSION,
    itemId: item.id,
    batchType: item.batchType,
    source,
    materialSources,
    design: item.design,
    catalog: catalog.map((option) => ({
      id: option.id,
      priceCents: option.priceCents,
      active: option.active,
    })),
    standardAccessoryCharge:
      businessSettings.pricingSettings.standardAccessoryCharge,
    vatTaxPercentage:
      businessSettings.pricingSettings.vatTaxPercentage,
  });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `UPLOADED-PRICE-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    const designInspection = inspectCartDesignDomain(item);
    if (designInspection.status === "invalid") {
      blockers.push(...designInspection.reasons);
      return item;
    }
    const designSource = designInspection.source;
    const isUploadedDesign = designSource?.kind === "uploaded";
    const designLabel = getCartDesignLabel(item);

    if (!isUploadedDesign && !item.style) {
      blockers.push("Catalog design details are missing.");
      return item;
    }
    const style = isUploadedDesign
      ? null
      : context.styles.find((candidate) => candidate.id === item.style?.id);
    if (!isUploadedDesign && !style) {
      blockers.push(`${designLabel} is no longer available.`);
      return item;
    }
    const designContext = isUploadedDesign ? designSource : style;
    const baseGarmentComposition = isUploadedDesign
      ? designSource.fabricCapacityComposition
      : getStyleBaseFabricCapacityComposition(style);
    const persistedAdditionalAssignments = (item.fabricAllocations || [])
      .flatMap((allocation) => allocation.garmentAssignments)
      .filter((assignment) => assignment.sourceRole === "additional");
    const invalidAdditionalAssignments = persistedAdditionalAssignments.filter(
      (assignment) =>
        assignment.dependencyStatus === "orphaned" ||
        !isAdditionalGarmentAllowed(
          assignment.garmentType,
          baseGarmentComposition,
          designContext,
        ),
    );
    if (invalidAdditionalAssignments.length > 0) {
      blockers.push("An Additional garment configuration needs review.");
    }
    const activeAdditionalGarmentTypes = persistedAdditionalAssignments
      .filter(
        (assignment) =>
          assignment.dependencyStatus !== "orphaned" &&
          !invalidAdditionalAssignments.includes(assignment),
      )
      .map((assignment) => assignment.garmentType);

    const garmentCode = getSelectedGarmentCode(item.garment);
    const enrichedGarment = item.garment
      ? { ...item.garment, lowerGarmentType: item.design.lowerGarmentType }
      : { lowerGarmentType: item.design.lowerGarmentType };

    const isGarmentTypeUnresolved = isAmbiguousLowerGarment(garmentCode) && !item.design.lowerGarmentType;

    const applicableDesign = filterDesignSelectionsForDecorativeFeatures(
      filterDesignSelectionsForCustomDetails(
        designContext,
        item.design,
        context.customDetailCatalog,
        enrichedGarment,
        activeAdditionalGarmentTypes,
      ),
      style,
      enrichedGarment,
    );
    const pricingItem =
      applicableDesign === item.design
        ? item
        : { ...item, design: applicableDesign };

    const missingCustomDetail = getMissingCustomDetailGroup(
      designContext,
      applicableDesign,
      context.customDetailCatalog,
      enrichedGarment,
      activeAdditionalGarmentTypes,
    );

    if (missingCustomDetail) {
      blockers.push(
        `${designLabel} requires a ${missingCustomDetail.replace(/_/g, " ")} selection.`,
      );
    } else if (isGarmentTypeUnresolved) {
      blockers.push(`${designLabel} requires a Garment Type selection.`);
    }
    if (!hasRequiredMeasurements(item)) {
      blockers.push(`${designLabel} requires complete measurements.`);
    }
    if (!item.deliverySelection) {
      blockers.push("Review shipping details");
    }
    if (!item.batchType) {
      blockers.push(`${designLabel} requires a valid order route.`);
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
      blockers.push(`${designLabel} requires a valid batch identifier.`);
    }

    const materialPricing = resolveCartItemFabricAllocationPricing(
      pricingItem,
      context.fabrics,
    );
    if (materialPricing.status === "unresolved") {
      const message = getFabricAllocationPricingErrorMessage(materialPricing);
      if (message) {
        blockers.push(message);
      }
      return item;
    }
    const hasUnavailableFabric = materialPricing.allocationLines.some(
      (line) =>
        line.fabric.stockStatus === "OUT_OF_STOCK" ||
        line.fabric.stockStatus === "HIDDEN",
    );
    if (hasUnavailableFabric) {
      materialPricing.allocationLines.forEach((line) => {
        if (
          line.fabric.stockStatus === "OUT_OF_STOCK" ||
          line.fabric.stockStatus === "HIDDEN"
        ) {
          blockers.push(`${line.fabric.name} is currently unavailable.`);
        }
      });
    }

    const allocationAssignments = materialPricing.allocationLines.flatMap(
      (line) =>
        (pricingItem.fabricAllocations || [])
          .find((allocation) => allocation.allocationId === line.allocationId)
          ?.garmentAssignments || [],
    );
    const authoritativePricing = calculateDesignPricing({
      route: pricingItem.batchType,
      design: pricingItem.design,
      materialPricing,
      style,
      designContext,
      baseGarmentComposition,
      additionalGarments: allocationAssignments.filter(
        (assignment) => assignment.sourceRole === "additional",
      ),
      garment: pricingItem.garment,
      catalog: context.customDetailCatalog,
      businessSettings: context.businessSettings,
    });
    if (!authoritativePricing) {
      blockers.push(
        `Pricing is not configured for ${materialPricing.baseFabric.name}.`,
      );
      return style ? { ...item, style } : item;
    }
    if (authoritativePricing.baseGarmentPricingStatus === "unresolved") {
      blockers.push("Pricing review required for this design.");
      return style ? { ...item, style } : item;
    }
    if (authoritativePricing.additionalGarmentPricingStatus === "unresolved") {
      blockers.push("An Additional garment configuration needs review.");
      return style ? { ...item, style } : item;
    }

    const inboundShipping = getStoredShippingCost(item.garment);
    const selectedDesignPricing = calculateSelectedDesignPrice({
      preTaxDesignSubtotal: authoritativePricing.garmentSubtotal,
      taxPercentage:
        context.businessSettings.pricingSettings.vatTaxPercentage,
      lagosToEindhovenShipping: inboundShipping,
    });
    const currentGarmentSubtotal =
      selectedDesignPricing.taxInclusiveDesignSubtotal;

    // The upload snapshot is useful only to tell a customer the price changed.
    // Fresh structured pricing above remains the sole pricing authority.
    const previousGarmentSubtotal = isUploadedDesign
      ? item.cartDesignPricingSnapshot?.garmentSubtotal ??
        getCartItemGarmentSubtotal(item)
      : getCartItemGarmentSubtotal(item);
    const sourceFingerprint = isUploadedDesign
      ? getUploadedSourceFingerprint(
          pricingItem,
          materialPricing,
          context.customDetailCatalog,
          context.businessSettings,
        )
      : getStableSourceFingerprint(
          pricingItem,
          materialPricing,
          style!,
          context.customDetailCatalog,
          context.businessSettings,
        );
    const configurationHashChanged = Boolean(
      isUploadedDesign &&
        item.configurationHash &&
        item.configurationHash !== getCartItemConfigurationHash(item),
    );
    if (configurationHashChanged) {
      blockers.push("Design configuration needs review.");
    }
    const amountChanged =
      Math.abs(
        currentGarmentSubtotal -
          previousGarmentSubtotal,
      ) >= 0.005;
    const existingConfirmationStillPending =
      item.pricingReview?.status === "CONFIRMATION_REQUIRED" &&
      item.pricingReview.sourceFingerprint === sourceFingerprint &&
      Math.abs(
        item.pricingReview.updatedGarmentSubtotal -
          currentGarmentSubtotal,
      ) < 0.005;
    const pricingStatus =
      amountChanged || existingConfirmationStillPending
        ? "CONFIRMATION_REQUIRED"
        : "CURRENT";
    if (pricingStatus === "CONFIRMATION_REQUIRED") {
      blockers.push("Confirm the updated garment price before payment.");
    }

    const canPreservePricingReview =
      item.pricingReview?.sourceFingerprint === sourceFingerprint &&
      item.pricingReview.status === pricingStatus &&
      Math.abs(
        item.pricingReview.updatedGarmentSubtotal -
          currentGarmentSubtotal,
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
          updatedGarmentSubtotal: currentGarmentSubtotal,
          confirmedAt:
            pricingStatus === "CURRENT"
              ? item.pricingReview?.confirmedAt
              : undefined,
        };
    const updatedItem: CartItem = {
      ...pricingItem,
      fabric:
        materialPricing.source === "legacy"
          ? materialPricing.baseFabric
          : item.fabric,
      ...(style ? { style } : {}),
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
        preTaxDesignSubtotal:
          selectedDesignPricing.preTaxDesignSubtotal,
        taxPercentage: selectedDesignPricing.taxPercentage,
        taxAmount: selectedDesignPricing.taxAmount,
        taxInclusiveDesignSubtotal:
          selectedDesignPricing.taxInclusiveDesignSubtotal,
        selectedDesignPrice:
          selectedDesignPricing.selectedDesignPrice ?? undefined,
        totalPrice: roundMoney(
          currentGarmentSubtotal + inboundShipping,
        ),
        checkoutTotal: roundMoney(
          currentGarmentSubtotal + inboundShipping,
        ),
      },
      pricingReview,
    };
    const preparedReference = context.preparedUploadedDesignReferences?.[item.id];
    const hasMatchingPreparedReference = Boolean(
      isUploadedDesign &&
        preparedReference &&
        preparedReference.sourceKey === designSource.sourceKey &&
        preparedReference.designReferenceId ===
          designSource.uploadReference.designReferenceId,
    );
    if (
      isUploadedDesign &&
      !configurationHashChanged &&
      !hasUnavailableFabric &&
      !context.allowPendingUploadedDesignTransfer &&
      !hasMatchingPreparedReference
    ) {
      // Structural/pricing checks intentionally complete before this 8I-C boundary.
      blockers.push(UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER);
    }
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
