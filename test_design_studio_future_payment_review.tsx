import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import type {
  FutureOrderCandidateBuildResult,
  FutureOrderCandidateV1,
} from "./src/utils/futureOrderCandidate";
import {
  FUTURE_ORDER_NOT_SUBMITTED_MESSAGE,
  FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
  FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE,
  getFuturePaymentReviewContentBlockers,
  getFuturePaymentReviewContentStatusLabel,
  getFuturePaymentReviewEditStage,
  getFuturePaymentReviewGarments,
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewPricingRows,
  isFuturePaymentReviewStageUnlocked,
} from "./src/utils/designStudioFuturePaymentReview";
import { createEmptyFutureMeasurementState, MEASUREMENT_METHOD_LABELS } from "./src/utils/measurementBlueprint";
import { projectOccurrenceDisplayLabels } from "./src/utils/occurrenceDisplayLabel";
import { createWearerProfile } from "./src/utils/wearerOrder";
import { createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";

const measurementState = {
  ...createEmptyFutureMeasurementState("low_risk", "inch"),
  entered: {
    shared: {
      height: { valueCm: 177.8, provenance: "customer_entered" as const },
    },
    byGarmentKey: {
      "base:shirt": {
        chest: { valueCm: 101.6, provenance: "customer_entered" as const },
      },
    },
  },
  derived: {
    shared: {},
    byGarmentKey: {
      "base:kaftan": {
        garment_length: {
          valueCm: 137.16,
          provenance: "system_derived" as const,
        },
      },
    },
  },
  blueprintVersion: "measurement-blueprint-v1",
  formulaVersion: "low-risk-formula-v1",
  inputFingerprint: "measurement_safe_fixture",
  calculationStatus: "complete" as const,
  diagnostics: [],
};

const shippingState = {
  ...createEmptyFutureShippingState(),
  fulfilmentMethod: "destination_delivery" as const,
  customerInformation: {
    fullName: "Ada Heritage",
    phone: "+31 6 1234 5678",
    email: "ada@example.com",
    deliveryAddress: {
      addressLine1: "1 Heritage Way",
      addressLine2: "Suite 4",
      city: "Eindhoven",
      postalCode: "5611 AA",
      countryCode: "NL",
    },
    comment: "Please call before delivery.",
  },
  destinationZoneId: "EUROPE" as const,
  destinationZoneSource: "iso_resolved" as const,
  quoteReference: {
    tariffVersion: "future-shipping-v1",
    ruleId: "europe-2kg",
    ruleFingerprint: "safe-rule-fingerprint",
    inputFingerprint: "safe-input-fingerprint",
    garmentCount: 3,
    weightKg: 2,
    weightTier: "0_2" as const,
    destinationZoneId: "EUROPE" as const,
    quoteRequired: false,
  },
};

const candidate: FutureOrderCandidateV1 = {
  schemaVersion: 1,
  journey: { mode: "future_nine_stage", schemaVersion: 1 },
  authorityVersions: {
    customDetailsSchemaVersion: 1,
    measurementSchemaVersion: 1,
    measurementBlueprintVersion: "measurement-blueprint-v1",
    measurementFormulaVersion: "low-risk-formula-v1",
    shippingSchemaVersion: 1,
    shippingTariffVersion: "future-shipping-v1",
    shippingRuleFingerprint: "safe-rule-fingerprint",
    shippingInputFingerprint: "safe-input-fingerprint",
  },
  source: {
    kind: "catalog",
    sourceKey: "catalog:heritage-complete",
    styleId: "heritage-complete",
  },
  design: {
    styleId: "heritage-complete",
    name: "Heritage Complete Look",
    image: null,
    demographic: "family",
    compositionLabel: "Shirt, Long shirt and Agbada",
    resolutionStatus: "selected",
    compatibilityStatus: "compatible",
    compatibilityCode: "STYLE_COMPATIBLE",
    compatibilityMessage: "This style matches the selected garments.",
  },
  garments: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt",
      label: "Shirt",
      role: "main",
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [
        { garmentKey: "base:shirt", garmentType: "shirt", label: "Shirt" },
      ],
      construction: [
        {
          componentKey: "shirt_construction",
          selectionGroup: "shirt_construction",
          optionId: "shirt-standard-short",
          label: "Standard Length Shirt, Short Sleeve",
          priceCents: 10000,
        },
      ],
      constructionTotalCents: 10000,
    },
    {
      garmentKey: "base:kaftan",
      garmentType: "kaftan",
      label: "Long shirt",
      role: "main",
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [
        { garmentKey: "base:kaftan", garmentType: "kaftan", label: "Long shirt" },
      ],
      construction: [
        {
          componentKey: "kaftan_construction",
          selectionGroup: "kaftan_construction",
          optionId: "kaftan-standard",
          label: "Standard Long shirt",
          priceCents: 10000,
        },
      ],
      constructionTotalCents: 10000,
    },
    {
      garmentKey: "base:agbada",
      garmentType: "agbada",
      label: "Agbada",
      role: "main",
      demographic: "male",
      fabricUnits: 2,
      physicalComponents: [
        { garmentKey: "base:agbada:top", garmentType: "shirt", label: "Inner Top" },
        { garmentKey: "base:agbada:trouser", garmentType: "trouser", label: "Trouser" },
        { garmentKey: "base:agbada:robe", garmentType: "agbada", label: "Outer Robe" },
      ],
      construction: [
        {
          componentKey: "agbada_construction",
          selectionGroup: "agbada_construction",
          optionId: "agbada-complete",
          label: "Complete Agbada Construction",
          priceCents: 10000,
        },
      ],
      constructionTotalCents: 10000,
    },
  ],
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricId: "fabric-hi",
      fabricCode: "FAB-HI",
      fabricName: "HiTarget Royal Heritage Pattern With A Long Name",
      availability: "available",
      capacityUnits: 2,
      materialPriceCents: 1000,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "BASE_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "main",
        },
        {
          garmentKey: "base:kaftan",
          code: "BASE_KAFTAN",
          garmentType: "kaftan",
          fabricUnits: 1,
          sourceRole: "main",
        },
      ],
    },
    {
      allocationId: "allocation-2",
      fabricId: "fabric-lace",
      fabricCode: "FAB-LACE",
      fabricName: "Ceremonial Lace",
      availability: "available",
      capacityUnits: 2,
      materialPriceCents: 1000,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: [
        {
          garmentKey: "base:agbada",
          code: "BASE_AGBADA",
          garmentType: "agbada",
          fabricUnits: 2,
          sourceRole: "main",
        },
      ],
    },
  ],
  customDetails: [
    {
      occurrenceKey: "base:shirt:name_monogram:name-monogram",
      garmentKey: "base:shirt",
      garmentLabel: "Shirt",
      selectionGroup: "name_monogram",
      selectionGroupTitle: "Name Monogram",
      optionId: "name-monogram",
      optionLabel: "Name Monogram",
      priceStatus: "exact",
      priceCents: 1200,
      personalizedText: "A. Heritage - left cuff",
      snapshot: null,
    },
    {
      occurrenceKey: "base:kaftan:name_monogram:name-monogram",
      garmentKey: "base:kaftan",
      garmentLabel: "Long shirt",
      selectionGroup: "name_monogram",
      selectionGroupTitle: "Name Monogram",
      optionId: "name-monogram",
      optionLabel: "Name Monogram",
      priceStatus: "exact",
      priceCents: 1200,
      personalizedText: "K. Heritage - chest",
      snapshot: null,
    },
  ],
  aiTryOn: {
    status: "skipped",
    reviewStatus: "skipped",
    verifiedPrivateResultReference: null,
  },
  measurements: measurementState,
  shipping: {
    state: shippingState,
    status: "quote_ready",
    customerInformationComplete: true,
    formInputsComplete: true,
    formComplete: true,
    quoteReady: true,
    quoteRequired: false,
    destinationLabel: "Europe",
    parcelWeightKg: 2,
    weightTier: "0_2",
    additionalDeliveryFeeCents: 2660,
    rateVersion: "step8-delivery-v1",
  },
  pricing: {
    schemaVersion: 2,
    model: "all_inclusive_garment_construction",
    status: "exact",
    garmentConstructionSubtotalCents: 30000,
    customDetailsCents: 2400,
    selectedDesignTotalCents: 32400,
    postEindhovenAdjustmentCents: 2660,
    exactTotalCents: 35060,
    components: {
      fabric: { status: "included_in_garment_construction", amountCents: null },
      sewing: { status: "included_in_garment_construction", amountCents: null },
      tax: { status: "included_in_garment_construction", amountCents: null },
      lagosToEindhovenShipping: {
        status: "included_in_garment_construction",
        amountCents: null,
      },
      customDetails: { status: "separately_charged", amountCents: 2400 },
      postEindhovenDelivery: {
        status: "separately_charged",
        amountCents: 2660,
      },
    },
  },
  contentStatus: "reviewable",
  paymentStatus: "payment_provider_unavailable",
  blockers: [
    {
      code: "PAYMENT_PROVIDER_UNAVAILABLE",
      stage: "payment",
      message: FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
    },
  ],
};

const reviewableResult: FutureOrderCandidateBuildResult = {
  status: "reviewable",
  paymentStatus: "payment_provider_unavailable",
  candidate,
  blockers: candidate.blockers,
};

assert.equal(isFuturePaymentReviewStageUnlocked(reviewableResult), true);
assert.deepEqual(getFuturePaymentReviewContentBlockers(reviewableResult), []);
assert.equal(getFuturePaymentReviewContentStatusLabel(candidate), "Ready to review");
assert.equal(getFuturePaymentReviewGarments(candidate).length, 3);
assert.equal(getFuturePaymentReviewGarments(candidate)[0].customDetails.length, 1);
assert.equal(getFuturePaymentReviewGarments(candidate)[1].customDetails.length, 1);
const pricingRows = getFuturePaymentReviewPricingRows(candidate.pricing);
assert.deepEqual(
  pricingRows.map((row) => [row.id, row.label, row.amountCents, row.presentation]),
  [
    ["garment_construction", "Garment Construction Subtotal", 30000, "amount"],
    ["included_components", FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE, null, "supporting_note"],
    ["custom_details", "Custom Details Subtotal", 2400, "amount"],
    ["post_eindhoven", "Shipping", 2660, "amount"],
  ],
  "the presentation helper preserves every authoritative monetary value",
);
const pickupPricingRows = getFuturePaymentReviewPricingRows({
  ...candidate.pricing,
  postEindhovenAdjustmentCents: 0,
});
assert.equal(
  pickupPricingRows.some((row) => row.id === "post_eindhoven"),
  false,
  "pickup does not render a misleading €0 shipping row",
);
const pendingShippingRows = getFuturePaymentReviewPricingRows({
  ...candidate.pricing,
  postEindhovenAdjustmentCents: null,
});
assert.deepEqual(
  pendingShippingRows.find((row) => row.id === "post_eindhoven"),
  {
    id: "post_eindhoven",
    label: "Shipping",
    amountCents: null,
    presentation: "amount",
  },
  "pending shipping remains pending rather than becoming €0",
);

const reviewMarkup = renderToStaticMarkup(
  <DormantFuturePaymentReviewStep
    result={reviewableResult}
    onBack={() => undefined}
    onEditStage={() => undefined}
  />,
);
for (const expected of [
  "Order Review &amp; Payment",
  "1 Design",
  "Heritage Complete Look",
  "Shirt",
  "Long shirt",
  "Agbada",
  "Inner Top",
  "Trouser",
  "Outer Robe",
  "A. Heritage - left cuff",
  "K. Heritage - chest",
  "Personalized requirement",
  "Status: Ready to review",
  "Shared measurements",
  "Chest",
  "Garment Length",
  "Deliver to an Address",
  "Ada Heritage",
  "1 Heritage Way",
  "Skipped",
  FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
  FUTURE_ORDER_NOT_SUBMITTED_MESSAGE,
  "Payment integration pending",
]) {
  assert.ok(reviewMarkup.includes(expected), `Missing review text: ${expected}`);
}
assert.equal((reviewMarkup.match(/Fabric Selection/g) || []).length, 2);
assert.ok(reviewMarkup.includes("HiTarget Royal Heritage Pattern With A Long Name"));
assert.ok(reviewMarkup.includes("Ceremonial Lace"));
assert.ok(reviewMarkup.includes("Assigned to: Shirt, Long shirt"));
assert.ok(reviewMarkup.includes("Assigned to: Agbada"));
assert.equal((reviewMarkup.match(/>Included</g) || []).length, 2);
assert.equal(reviewMarkup.includes("Material price"), false);
assert.equal(reviewMarkup.includes("€10.00"), false);
assert.equal((reviewMarkup.match(/data-pricing-row="included_components"/g) || []).length, 1);
const priceBreakdownMarkup = reviewMarkup.slice(
  reviewMarkup.indexOf("Price breakdown"),
  reviewMarkup.indexOf(FUTURE_PAYMENT_UNAVAILABLE_MESSAGE),
);
assert.ok(priceBreakdownMarkup.includes(FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE));
assert.equal(priceBreakdownMarkup.includes("Included in Garment Construction"), false);
assert.equal((priceBreakdownMarkup.match(/>Included</g) || []).length, 0);
assert.ok(
  priceBreakdownMarkup.indexOf("Garment Construction Subtotal") <
    priceBreakdownMarkup.indexOf(FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE) &&
    priceBreakdownMarkup.indexOf(FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE) <
      priceBreakdownMarkup.indexOf("Custom Details Subtotal"),
  "the included note immediately follows the construction subtotal",
);
assert.equal((priceBreakdownMarkup.match(/€300\.00/g) || []).length, 1);
assert.equal((priceBreakdownMarkup.match(/€24\.00/g) || []).length, 1);
assert.equal((priceBreakdownMarkup.match(/€26\.60/g) || []).length, 1);
assert.equal((priceBreakdownMarkup.match(/€350\.60/g) || []).length, 1);
assert.equal((priceBreakdownMarkup.match(/data-pricing-final-total/g) || []).length, 1);
assert.equal((priceBreakdownMarkup.match(/>Total</g) || []).length, 1);
assert.ok(priceBreakdownMarkup.indexOf("Shipping") < priceBreakdownMarkup.indexOf(">Total"));
assert.ok(reviewMarkup.includes("disabled=\"\""));
assert.ok(
  reviewMarkup.includes(
    'aria-describedby="future-payment-unavailable-title future-payment-pending-explanation"',
  ),
);
for (const forbidden of [
  "card number",
  "expiry",
  "CVC",
  "test card",
  "Authorize payment",
  "payment token",
  "job ID",
  "provider payload",
  "provider response",
  "processing reference",
  "raw image",
]) {
  assert.equal(reviewMarkup.toLowerCase().includes(forbidden.toLowerCase()), false);
}

const evaluationCandidate: FutureOrderCandidateV1 = {
  ...candidate,
  customDetails: [
    ...candidate.customDetails,
    {
      occurrenceKey: "base:agbada:personalized:personalized-evaluation",
      garmentKey: "base:agbada",
      garmentLabel: "Agbada",
      selectionGroup: "personalized_additional",
      selectionGroupTitle: "Personalized requirement",
      optionId: "personalized-evaluation",
      optionLabel: "Personalized requirement",
      priceStatus: "evaluation_required",
      priceCents: null,
      personalizedText: "Hand-finished ceremonial motif",
      snapshot: null,
    },
  ],
  pricing: {
    ...candidate.pricing,
    status: "pending",
    customDetailsCents: null,
    selectedDesignTotalCents: null,
    exactTotalCents: null,
    components: {
      ...candidate.pricing.components,
      customDetails: { status: "pricing_pending", amountCents: null },
    },
  },
  contentStatus: "blocked",
  blockers: [
    {
      code: "CUSTOM_DETAILS_EVALUATION_REQUIRED",
      stage: "custom_details",
      message: "A personalized requirement needs price evaluation.",
      garmentKey: "base:agbada",
    },
    candidate.blockers[0],
  ],
};
const blockedResult: FutureOrderCandidateBuildResult = {
  status: "blocked",
  paymentStatus: "payment_provider_unavailable",
  candidate: evaluationCandidate,
  blockers: evaluationCandidate.blockers,
};
assert.equal(isFuturePaymentReviewStageUnlocked(blockedResult), false);
assert.equal(getFuturePaymentReviewContentStatusLabel(evaluationCandidate), "Needs attention");
assert.equal(getFuturePaymentReviewContentBlockers(blockedResult).length, 1);
assert.equal(
  getFuturePaymentReviewEditStage(evaluationCandidate.blockers[0]),
  "custom_details",
);
const blockedMarkup = renderToStaticMarkup(
  <DormantFuturePaymentReviewStep
    result={blockedResult}
    onBack={() => undefined}
    onEditStage={() => undefined}
  />,
);
assert.ok(blockedMarkup.includes("Your order needs attention"));
assert.ok(blockedMarkup.includes("Price requires evaluation."));
assert.ok(blockedMarkup.includes("Edit Custom Details"));
assert.equal(blockedMarkup.includes("€350.60"), false);
assert.ok(blockedMarkup.includes("Available after all prices are confirmed"));

const componentSource = readFileSync(
  "src/components/DormantFuturePaymentReviewStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const shippingSource = readFileSync(
  "src/components/DormantFutureShippingStep.tsx",
  "utf8",
);
const appSource = readFileSync("src/App.tsx", "utf8");

for (const forbiddenSource of [
  "useAppStore",
  "CartItem",
  "MasterOrder",
  "addToCart",
  "createOrder",
  "processPayment",
  "CustomerDesignUploadService",
]) {
  assert.equal(componentSource.includes(forbiddenSource), false);
}
assert.ok(studioSource.includes("buildFutureOrderCandidateV2({"));
assert.ok(studioSource.includes("currentFutureDesignStyleDraftHydration?.result.ledger"));
assert.ok(studioSource.includes("createFutureOrderV2PaymentReviewHandoff(result.candidate)"));
assert.equal(studioSource.includes("createFutureOrderCartItemV2"), false);
assert.equal(studioSource.includes("createFutureOrderMasterOrderV2"), false);
assert.equal(studioSource.includes("StorageService.saveOrder"), false);
assert.ok(studioSource.includes("isFuturePaymentReviewStageUnlocked"));
assert.ok(studioSource.includes('futureStageId === "payment"'));
const paymentReviewStageSource = studioSource.slice(
  studioSource.indexOf('futureStageId === "payment"'),
);
assert.ok(paymentReviewStageSource.includes("<DormantFuturePaymentReviewStep"));
assert.ok(
  paymentReviewStageSource.includes(
    'onBack={() => navigateToFutureStage("shipping")}',
  ),
);
assert.ok(
  paymentReviewStageSource.includes(
    "onEditStage={(stage) => navigateToFutureStage(stage)}",
  ),
);
const adaSampleGroups = getFuturePaymentReviewMeasurementGroups({
  measurements: {
    schemaVersion: 2,
    wearers: [
      createWearerProfile({
        wearerId: "wearer-you",
        displayName: "You",
        fitContext: "male",
        presentationOrder: 0,
        measurement: createEmptyFutureMeasurementState("low_risk", "inch"),
      }),
      createWearerProfile({
        wearerId: "wearer-ada",
        displayName: "Ada",
        fitContext: "female",
        presentationOrder: 1,
        measurement: {
          ...createEmptyFutureMeasurementState("sample_cloth", "inch"),
          entered: {
            shared: {
              height: { valueCm: 160, provenance: "customer_entered" },
            },
            byGarmentKey: {},
          },
        },
      }),
    ],
    assignmentByGarmentKey: {},
  },
  garments: [],
});
const adaSampleTitle = adaSampleGroups.find((group) => group.title.startsWith("Ada"))?.title;
assert.equal(adaSampleTitle, `Ada — ${MEASUREMENT_METHOD_LABELS.sample_cloth}`);
assert.equal(adaSampleGroups.some((group) => group.title.includes("sample_cloth")), false);

const repeatedOccurrenceLabels = projectOccurrenceDisplayLabels([
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
]);
const repeatedPaymentCandidate: FutureOrderCandidateV1 = {
  ...candidate,
  garments: [
    {
      ...candidate.garments[0],
      garmentKey: "base:shirt",
      garmentType: "shirt",
      label: repeatedOccurrenceLabels.get("base:shirt")?.conciseLabel || "",
    },
    {
      ...candidate.garments[0],
      garmentKey: "additional:shirt:1",
      garmentType: "shirt",
      label: repeatedOccurrenceLabels.get("additional:shirt:1")?.conciseLabel || "",
    },
  ],
  fabricAllocations: [
    {
      ...candidate.fabricAllocations[0],
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "BASE_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "main",
        },
        {
          garmentKey: "additional:shirt:1",
          code: "ADDITIONAL_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "additional",
        },
      ],
    },
  ],
};
const repeatedPaymentMarkup = renderToStaticMarkup(
  <DormantFuturePaymentReviewStep
    result={{
      ...reviewableResult,
      candidate: repeatedPaymentCandidate,
    }}
    onBack={() => undefined}
    onEditStage={() => undefined}
  />,
);
assert.ok(repeatedPaymentMarkup.includes("Standard Shirt"));
assert.ok(repeatedPaymentMarkup.includes("Standard Shirt 2"));
assert.ok(repeatedPaymentMarkup.includes("Assigned to: Standard Shirt, Standard Shirt 2"));
assert.equal(repeatedPaymentMarkup.includes("Standard Shirt 1"), false);
assert.ok(reviewMarkup.includes("Shirt"));
assert.ok(reviewMarkup.includes("Long shirt"));

assert.ok(stepperSource.includes("canEnterPayment"));
assert.ok(stepperSource.includes("onSelectPayment"));
assert.ok(shippingSource.includes("canContinueToReview"));
assert.equal(appSource.includes('journeyMode="future_nine_stage"'), false);

console.log("PASS: dormant future payment review stage");
