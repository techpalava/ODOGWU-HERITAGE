import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";
import {
  createFutureOrderV2PaymentReviewHandoff,
  FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE,
  getFuturePaymentReviewContentBlockers,
  isFuturePaymentReviewStageUnlocked,
} from "./src/utils/designStudioFuturePaymentReview";

const candidate = {
  schemaVersion: 2,
  journey: { mode: "future_nine_stage", schemaVersion: 1 },
  authorityVersions: {
    customDetailsSchemaVersion: 1,
    measurementSchemaVersion: 1,
    measurementBlueprintVersion: "measurement-blueprint-v1",
    measurementFormulaVersion: "low-risk-formula-v1",
    shippingSchemaVersion: 1,
    shippingTariffVersion: "future-shipping-v1",
    shippingRuleFingerprint: "rule-fingerprint",
    shippingInputFingerprint: "shipping-fingerprint",
  },
  garments: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt",
      label: "Shirt",
      role: "main",
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [{ garmentKey: "base:shirt", garmentType: "shirt", label: "Shirt" }],
      construction: [],
      constructionTotalCents: 10000,
    },
  ],
  fabricAllocations: [],
  customDetails: [],
  aiTryOn: { status: "skipped", reviewStatus: "skipped", verifiedPrivateResultReference: null },
  measurements: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: "low-risk-formula-v1",
    inputFingerprint: "measurement-fingerprint",
    calculationStatus: "complete",
    diagnostics: [],
  },
  shipping: {
    state: { schemaVersion: 1, fulfilmentMethod: "eindhoven_pickup", customerInformation: null },
    status: "quote_ready",
    customerInformationComplete: true,
    formInputsComplete: true,
    formComplete: true,
    quoteReady: true,
    quoteRequired: false,
    destinationLabel: "Eindhoven",
    parcelWeightKg: 1,
    weightTier: "0_2",
    additionalDeliveryFeeCents: 0,
    rateVersion: "future-shipping-v1",
  },
  pricing: {
    schemaVersion: 2,
    model: "all_inclusive_garment_construction",
    status: "exact",
    garmentConstructionSubtotalCents: 10000,
    customDetailsCents: 0,
    selectedDesignTotalCents: 10000,
    postEindhovenAdjustmentCents: 0,
    exactTotalCents: 10000,
    components: {
      fabric: { status: "included_in_garment_construction", amountCents: null },
      sewing: { status: "included_in_garment_construction", amountCents: null },
      tax: { status: "included_in_garment_construction", amountCents: null },
      lagosToEindhovenShipping: { status: "included_in_garment_construction", amountCents: null },
      customDetails: { status: "separately_charged", amountCents: 0 },
      postEindhovenDelivery: { status: "separately_charged", amountCents: 0 },
    },
  },
  contentStatus: "reviewable",
  paymentStatus: "payment_provider_unavailable",
  blockers: [],
  occurrenceStyleSnapshots: [
    {
      occurrence: { garmentKey: "base:shirt", occurrenceToken: "shirt-1", label: "Shirt", garmentType: "shirt" },
      assignmentRevision: 2,
      sourceKind: "catalogue",
      sourceKey: "catalog-style:classic",
      catalogue: { styleId: "classic", name: "Classic Senator", image: null, publicRevision: 4, eligibilityRevision: 7, eligibilityFingerprint: "classic-fingerprint", adaptabilityConfirmationFingerprint: null },
      uploaded: null,
    },
    {
      occurrence: { garmentKey: "base:skirt", occurrenceToken: "skirt-1", label: "Skirt", garmentType: "skirt" },
      assignmentRevision: 3,
      sourceKind: "catalogue",
      sourceKey: "catalog-style:modern",
      catalogue: { styleId: "modern", name: "Modern Senator", image: null, publicRevision: 5, eligibilityRevision: 8, eligibilityFingerprint: "modern-fingerprint", adaptabilityConfirmationFingerprint: null },
      uploaded: null,
    },
    {
      occurrence: { garmentKey: "additional:shirt:1", occurrenceToken: "shirt-2", label: "Shirt 2", garmentType: "shirt" },
      assignmentRevision: 4,
      sourceKind: "uploaded",
      sourceKey: "uploaded:upload-x",
      catalogue: null,
      uploaded: { uploadedSourceRef: "upload-x", displayLabel: "Uploaded X", previewReference: "upload-x" },
    },
  ],
} as FutureOrderCandidateV2;

const handoff = createFutureOrderV2PaymentReviewHandoff(candidate);
assert.equal(handoff.candidate, candidate, "the exact V2 Candidate is handed to review");
assert.equal(isFuturePaymentReviewStageUnlocked(handoff), true);
assert.deepEqual(getFuturePaymentReviewContentBlockers(handoff), []);
assert.equal(JSON.stringify(candidate).includes("selectedStyleId"), false);
assert.equal("source" in candidate, false);
assert.equal("design" in candidate, false);

const markup = renderToStaticMarkup(
  <DormantFuturePaymentReviewStep
    result={handoff}
    onBack={() => undefined}
    onEditStage={() => undefined}
  />,
);
for (const expected of [
  "Classic Senator",
  "Modern Senator",
  "Uploaded X",
  "Shirt 2",
  FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE,
  "Payment integration pending",
]) {
  assert.ok(markup.includes(expected), `Missing V2 review text: ${expected}`);
}
assert.equal((markup.match(/data-occurrence-style-snapshot/g) || []).length, 3);
assert.ok(markup.includes('disabled=""'));

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const paymentReviewHandlerSource = studioSource.slice(
  studioSource.indexOf("const handleOpenDormantPaymentReviewStage"),
  studioSource.indexOf("const handleLiveOrderSummaryEdit"),
);
for (const forbidden of [
  "createFutureOrderCartItemV2",
  "createFutureOrderMasterOrderV2",
  "StorageService.saveOrder",
  "GuestOrderSessionService.save",
]) {
  assert.equal(paymentReviewHandlerSource.includes(forbidden), false, `Unexpected live side effect: ${forbidden}`);
}
assert.ok(studioSource.includes("buildFutureOrderCandidateV2({"));
assert.ok(studioSource.includes("currentFutureDesignStyleDraftHydration?.result.ledger"));

console.log("PASS: future order V2 payment review handoff");
