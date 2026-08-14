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
  getFuturePaymentReviewContentBlockers,
  getFuturePaymentReviewEditStage,
  getFuturePaymentReviewGarments,
  getFuturePaymentReviewPricingRows,
  isFuturePaymentReviewStageUnlocked,
} from "./src/utils/designStudioFuturePaymentReview";
import { createEmptyFutureMeasurementState } from "./src/utils/measurementBlueprint";
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
  destinationZoneSource: "customer_provisional" as const,
  quoteReference: {
    tariffVersion: "future-shipping-v1",
    ruleId: "europe-2kg",
    ruleFingerprint: "safe-rule-fingerprint",
    inputFingerprint: "safe-input-fingerprint",
    garmentCount: 3,
    weightKg: 2,
    destinationZoneId: "EUROPE" as const,
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
    compositionLabel: "Shirt, Kaftan and Agbada",
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
      label: "Kaftan",
      role: "main",
      demographic: "male",
      fabricUnits: 2,
      physicalComponents: [
        { garmentKey: "base:kaftan", garmentType: "kaftan", label: "Kaftan" },
      ],
      construction: [
        {
          componentKey: "kaftan_construction",
          selectionGroup: "kaftan_construction",
          optionId: "kaftan-standard",
          label: "Standard Kaftan",
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
          fabricUnits: 2,
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
      garmentLabel: "Kaftan",
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
    formComplete: true,
    quoteReady: true,
    destinationLabel: "Other Europe",
    parcelWeightKg: 2,
  },
  pricing: {
    status: "exact",
    constructionAndSewingCents: 30000,
    fabricMaterialCents: 2000,
    customDetailsCents: 2400,
    preTaxDesignSubtotalCents: 34400,
    taxPercentage: 7.5,
    taxCents: 2580,
    lagosToEindhovenShippingCents: 13125,
    selectedDesignTotalCents: 50105,
    postEindhovenAdjustmentCents: 2660,
    exactTotalCents: 52765,
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
assert.equal(getFuturePaymentReviewGarments(candidate).length, 3);
assert.equal(getFuturePaymentReviewGarments(candidate)[0].customDetails.length, 1);
assert.equal(getFuturePaymentReviewGarments(candidate)[1].customDetails.length, 1);
assert.equal(
  getFuturePaymentReviewPricingRows(candidate.pricing).filter(
    (row) => row.id === "lagos_to_eindhoven",
  ).length,
  1,
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
  "Kaftan",
  "Agbada",
  "Inner Top",
  "Trouser",
  "Outer Robe",
  "A. Heritage - left cuff",
  "K. Heritage - chest",
  "Shared measurements",
  "Chest",
  "Garment Length",
  "Delivery to destination",
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
assert.equal((reviewMarkup.match(/data-pricing-row="lagos_to_eindhoven"/g) || []).length, 1);
assert.equal((reviewMarkup.match(/€131\.25/g) || []).length, 1);
assert.equal((reviewMarkup.match(/€26\.60/g) || []).length, 1);
assert.equal((reviewMarkup.match(/€527\.65/g) || []).length, 1);
assert.ok(reviewMarkup.includes("disabled=\"\""));
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
    preTaxDesignSubtotalCents: null,
    taxCents: null,
    selectedDesignTotalCents: null,
    exactTotalCents: null,
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
assert.equal(blockedMarkup.includes("€527.65"), false);
assert.ok(blockedMarkup.includes("Available after all prices are confirmed"));

const componentSource = readFileSync(
  "src/components/DormantFuturePaymentReviewStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const stepperSource = readFileSync(
  "src/components/DormantFutureJourneyStepper.tsx",
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
assert.ok(studioSource.includes("buildFutureOrderCandidate({"));
assert.ok(studioSource.includes("isFuturePaymentReviewStageUnlocked"));
assert.ok(studioSource.includes('futureStageId === "payment"'));
assert.ok(studioSource.includes('onBack={() => setFutureStageId("shipping")}'));
assert.ok(stepperSource.includes("canEnterPayment"));
assert.ok(stepperSource.includes("onSelectPayment"));
assert.ok(shippingSource.includes("canContinueToReview"));
assert.equal(appSource.includes('journeyMode="future_nine_stage"'), false);

console.log("PASS: dormant future payment review stage");
