import type { FabricGarmentType } from "../src/types.js";
import { normalizeCustomDetailCatalog } from "../src/utils/catalogHelpers.js";
import type {
  FutureOrderCandidateV2,
} from "../src/utils/futureOrderCandidate.js";
import { individualLagosToEindhovenChargeCents } from "../src/utils/individualInboundShippingDisplay.js";
import { quoteFutureOrderPayableTotal } from "../src/utils/futureOrderPayableTotal.js";
import { resolveGarmentConstructionPricing } from "../src/utils/garmentConstructionPricing.js";
import type { CanonicalOrderIdentity } from "../src/utils/orderContextIdentity.js";
import {
  createFutureOrderCartItemV2,
  createFutureOrderMasterOrderV2,
  type FutureOrderMasterOrderV2,
} from "../src/utils/futureOrderV2Storage.js";

const catalogueStyle = (garmentKey: string, token: string, label: string) => ({
  occurrence: { garmentKey, occurrenceToken: token, label, garmentType: "shirt" },
  assignmentRevision: 2,
  sourceKind: "catalogue" as const,
  sourceKey: `catalogue:${garmentKey}`,
  catalogue: {
    styleId: `style-${garmentKey}`,
    name: `${label} Historical Style`,
    image: `https://example.test/${garmentKey}.jpg`,
    publicRevision: 4,
    eligibilityRevision: 7,
    eligibilityFingerprint: `eligibility-${garmentKey}`,
    adaptabilityConfirmationFingerprint: null,
  },
  uploaded: null,
});

const uploadedStyle = (garmentKey: string, token: string, label: string) => ({
  occurrence: { garmentKey, occurrenceToken: token, label, garmentType: "shirt" },
  assignmentRevision: 3,
  sourceKind: "uploaded" as const,
  sourceKey: "uploaded:shared-source",
  catalogue: null,
  uploaded: {
    uploadedSourceRef: "shared-uploaded-source-ref",
    displayLabel: "Shared Uploaded Design",
    previewReference: "opaque-preview-ref",
  },
});

const createCandidate = (
  styleName = "Shirt Historical Style",
  orderIdentity: CanonicalOrderIdentity = { orderType: "Individual" },
): FutureOrderCandidateV2 => {
  const styles = [
    catalogueStyle("base:shirt", "token-shirt-1", "Shirt"),
    uploadedStyle("additional:shirt:1", "token-shirt-2", "Shirt 2"),
    uploadedStyle("additional:shirt:2", "token-shirt-3", "Shirt 3"),
  ];
  styles[0]!.catalogue!.name = styleName;
  const garmentCount = 3;
  const lagosChargeCents = individualLagosToEindhovenChargeCents({
    orderType: orderIdentity.orderType,
    physicalGarmentCount: garmentCount,
  });
  return {
    schemaVersion: 2,
    orderIdentity,
    journey: { mode: "future_nine_stage", schemaVersion: 1 },
    authorityVersions: {
      customDetailsSchemaVersion: 1,
      measurementSchemaVersion: 1,
      measurementBlueprintVersion: "measurement-blueprint-v1",
      measurementFormulaVersion: "low-risk-formula-v1",
      shippingSchemaVersion: 1,
      shippingTariffVersion: "future-shipping-v1",
      shippingRuleFingerprint: "shipping-rule-fingerprint",
      shippingInputFingerprint: "shipping-input-fingerprint",
    },
    garments: ["base:shirt", "additional:shirt:1", "additional:shirt:2"].map(
      (garmentKey, index) => ({
        garmentKey,
        garmentType: "shirt",
        label: index === 0 ? "Shirt" : `Shirt ${index + 1}`,
        role: index === 0 ? ("main" as const) : ("additional" as const),
        demographic: "male",
        fabricUnits: 1,
        physicalComponents: [
          {
            garmentKey,
            garmentType: "shirt",
            label: index === 0 ? "Shirt" : `Shirt ${index + 1}`,
          },
        ],
        construction: [],
        constructionTotalCents: 10000,
      }),
    ),
    fabricAllocations: [],
    customDetails: [],
    aiTryOn: {
      status: "skipped",
      reviewStatus: "skipped",
      verifiedPrivateResultReference: null,
    },
    measurements: {
      schemaVersion: 1,
      route: "low_risk",
      unit: "inch",
      entered: { shared: {}, byGarmentKey: {} },
      derived: { shared: {}, byGarmentKey: {} },
      blueprintVersion: "measurement-blueprint-v1",
      formulaVersion: "low-risk-formula-v1",
      inputFingerprint: "measurement-input-fingerprint",
      calculationStatus: "complete",
      diagnostics: [],
      invalidInputKeys: [],
    },
    shipping: {
      state: {
        schemaVersion: 1,
        fulfilmentMethod: "eindhoven_pickup",
        destinationSelectionMode: null,
        otherDestinationCountry: "",
        pickupLocation: "Eindhoven",
        customerInformation: {
          fullName: "Ada Lovelace",
          phone: "+31 6 12345678",
          email: "ada@example.test",
          deliveryAddress: {
            addressLine1: "Historical Lane 1",
            city: "Eindhoven",
            postalCode: "5611 AA",
            country: "Netherlands",
            countryCode: "NL",
          },
          comment: "Preserve this immutable presentation.",
        },
        destinationZoneId: null,
        destinationZoneSource: null,
        quoteReference: null,
      },
      status: "quote_ready",
      customerInformationComplete: true,
      formInputsComplete: true,
      formComplete: true,
      quoteReady: true,
      quoteRequired: false,
      destinationLabel: "Eindhoven",
      parcelWeightKg: 3,
      weightTier: "2_5",
      additionalDeliveryFeeCents: 0,
      rateVersion: "future-shipping-v1",
    },
    pricing: {
      schemaVersion: 2,
      model: "all_inclusive_garment_construction",
      status: "exact",
      garmentConstructionSubtotalCents: 30000,
      customDetailsCents: 0,
      selectedDesignTotalCents: 30000,
      postEindhovenAdjustmentCents: 0,
      exactTotalCents: 30000 + (lagosChargeCents ?? 0),
      components: {
        fabric: {
          status: "included_in_garment_construction",
          amountCents: null,
        },
        sewing: {
          status: "included_in_garment_construction",
          amountCents: null,
        },
        tax: {
          status: "included_in_garment_construction",
          amountCents: null,
        },
        lagosToEindhovenShipping:
          lagosChargeCents === null
            ? {
                status: "included_in_garment_construction",
                amountCents: null,
              }
            : {
                status: "separately_charged",
                amountCents: lagosChargeCents,
              },
        customDetails: { status: "separately_charged", amountCents: 0 },
        postEindhovenDelivery: {
          status: "separately_charged",
          amountCents: 0,
        },
      },
    },
    contentStatus: "reviewable",
    paymentStatus: "payment_provider_unavailable",
    blockers: [],
    occurrenceStyleSnapshots: styles,
  } as FutureOrderCandidateV2;
};

export const createFutureOrderV2Fixture = (
  orderId: string,
  styleName?: string,
  orderIdentity?: CanonicalOrderIdentity,
): FutureOrderMasterOrderV2 => {
  const cart = createFutureOrderCartItemV2({
    candidate: createCandidate(styleName, orderIdentity),
    metadata: { cartItemId: `cart-${orderId}` },
  });
  if (cart.status !== "valid") throw new Error("Expected a valid Cart V2 fixture.");
  const order = createFutureOrderMasterOrderV2({
    cartItem: cart.value,
    metadata: { orderId },
  });
  if (order.status !== "valid") {
    throw new Error("Expected a valid MasterOrder V2 fixture.");
  }
  return order.value;
};

/**
 * Same fixture shape as `createFutureOrderV2Fixture`, with construction and
 * the payable ledger replaced by the seed catalogue and Step 8 quote.
 */
interface CatalogueFixtureCandidate {
  garments: Array<{
    garmentType: string;
    construction: Array<{
      componentKey: string;
      selectionGroup: string;
      optionId: string;
      label: string;
      priceCents: number;
    }>;
    constructionTotalCents: number | null;
  }>;
  pricing: {
    garmentConstructionSubtotalCents: number | null;
    customDetailsCents: number | null;
    selectedDesignTotalCents: number | null;
    postEindhovenAdjustmentCents: number | null;
    exactTotalCents: number | null;
    components: {
      customDetails: { amountCents: number | null };
      postEindhovenDelivery: { amountCents: number | null };
      lagosToEindhovenShipping: {
        status: "included_in_garment_construction" | "separately_charged";
        amountCents: number | null;
      };
    };
  };
  shipping: { additionalDeliveryFeeCents: number | null };
}

export const createCatalogueAuthoritativeFutureOrderV2Fixture = (
  orderId: string,
  styleName?: string,
  orderIdentity?: CanonicalOrderIdentity,
): FutureOrderMasterOrderV2 => {
  const order = structuredClone(
    createFutureOrderV2Fixture(orderId, styleName, orderIdentity),
  );
  const catalog = normalizeCustomDetailCatalog([]);
  const candidate = order.cartItem.candidate as unknown as CatalogueFixtureCandidate;
  for (const garment of candidate.garments) {
    const resolution = resolveGarmentConstructionPricing(
      garment.garmentType as FabricGarmentType,
      catalog,
    );
    if (resolution.status !== "resolved") {
      throw new Error(
        `Catalogue construction is unresolved for ${garment.garmentType}.`,
      );
    }
    garment.construction = resolution.components.map((component) => ({
      componentKey: component.componentKey,
      selectionGroup: component.selectionGroup,
      optionId: component.optionId,
      label:
        catalog.find((option) => option.id === component.optionId)?.label ||
        component.optionId,
      priceCents: component.priceCents,
    }));
    garment.constructionTotalCents = resolution.totalPriceCents;
  }
  const quoted = quoteFutureOrderPayableTotal(order.cartItem.candidate);
  if (!quoted) {
    throw new Error("The catalogue fixture could not be quoted.");
  }
  const pricing = candidate.pricing;
  pricing.garmentConstructionSubtotalCents = quoted.garmentConstructionSubtotalCents;
  pricing.customDetailsCents = quoted.customDetailsCents;
  pricing.selectedDesignTotalCents = quoted.selectedDesignTotalCents;
  pricing.postEindhovenAdjustmentCents = quoted.postEindhovenAdjustmentCents;
  pricing.exactTotalCents = quoted.exactTotalCents;
  pricing.components.customDetails.amountCents = quoted.customDetailsCents;
  pricing.components.postEindhovenDelivery.amountCents =
    quoted.postEindhovenAdjustmentCents;
  pricing.components.lagosToEindhovenShipping =
    quoted.lagosToEindhovenShippingCents === null
      ? {
          status: "included_in_garment_construction",
          amountCents: null,
        }
      : {
          status: "separately_charged",
          amountCents: quoted.lagosToEindhovenShippingCents,
        };
  candidate.shipping.additionalDeliveryFeeCents =
    quoted.postEindhovenAdjustmentCents;
  return order as FutureOrderMasterOrderV2;
};
