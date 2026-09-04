import assert from "node:assert/strict";
import type {
  FutureOrderCandidateOccurrenceStyleSnapshotV2,
  FutureOrderCandidateV2,
} from "./src/utils/futureOrderCandidate";
import {
  createFutureOrderCartItemV2,
  createFutureOrderMasterOrderV2,
  parseFutureOrderCartItemV2,
  parseFutureOrderMasterOrderV2,
  serializeFutureOrderCartItemV2,
  serializeFutureOrderMasterOrderV2,
} from "./src/utils/futureOrderV2Storage";

const catalogue = (
  garmentKey: string,
  occurrenceToken: string,
  label: string,
  styleId: string,
  name: string,
): FutureOrderCandidateOccurrenceStyleSnapshotV2 => ({
  occurrence: { garmentKey, occurrenceToken, label, garmentType: "shirt" },
  assignmentRevision: 1,
  sourceKind: "catalogue",
  sourceKey: `catalog:${styleId}`,
  catalogue: {
    styleId,
    name,
    image: `safe-${styleId}-preview`,
    publicRevision: 3,
    eligibilityRevision: 4,
    eligibilityFingerprint: `eligibility-${styleId}`,
    adaptabilityConfirmationFingerprint: null,
  },
  uploaded: null,
});

const uploaded = (
  garmentKey: string,
  occurrenceToken: string,
  label: string,
  uploadedSourceRef: string,
): FutureOrderCandidateOccurrenceStyleSnapshotV2 => ({
  occurrence: { garmentKey, occurrenceToken, label, garmentType: "skirt" },
  assignmentRevision: 2,
  sourceKind: "uploaded",
  sourceKey: `uploaded:${uploadedSourceRef}`,
  catalogue: null,
  uploaded: {
    uploadedSourceRef,
    displayLabel: "Uploaded X",
    previewReference: "safe-upload-preview",
  },
});

const candidate = (
  occurrenceStyleSnapshots: readonly FutureOrderCandidateOccurrenceStyleSnapshotV2[],
): FutureOrderCandidateV2 => ({
  schemaVersion: 2,
  journey: { mode: "future_nine_stage", schemaVersion: 1 },
  authorityVersions: {
    customDetailsSchemaVersion: 1,
    measurementSchemaVersion: 1,
    measurementBlueprintVersion: "measurement-v1",
    measurementFormulaVersion: "formula-v1",
    shippingSchemaVersion: 1,
    shippingTariffVersion: "tariff-v1",
    shippingRuleFingerprint: "shipping-rule-v1",
    shippingInputFingerprint: "shipping-input-v1",
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
      construction: [{ componentKey: "shirt:cut", selectionGroup: "shirt_cut", optionId: "standard", label: "Standard", priceCents: 6500 }],
      constructionTotalCents: 6500,
    },
  ],
  fabricAllocations: [{
    allocationId: "fabric-allocation-1",
    fabricId: "fabric-1",
    fabricCode: "FAB-1",
    fabricName: "Royal Blue",
    availability: "available",
    capacityUnits: 1,
    materialPriceCents: 3200,
    pricingTreatment: "included_in_garment_construction",
    garmentAssignments: [{ garmentKey: "base:shirt", code: "BASE_SHIRT", garmentType: "shirt", fabricUnits: 1, sourceRole: "main" }],
  }],
  customDetails: [{
    occurrenceKey: "base:shirt",
    garmentKey: "base:shirt",
    garmentLabel: "Shirt",
    selectionGroup: "shirt_pockets",
    selectionGroupTitle: "Pockets",
    optionId: "none",
    optionLabel: "No pockets",
    priceStatus: "exact",
    priceCents: 0,
    personalizedText: null,
    snapshot: { label: "No pockets", description: "", garmentGroup: "shirt", informational: false, requiresEvaluation: false },
  }],
  aiTryOn: { status: "skipped", reviewStatus: "skipped", verifiedPrivateResultReference: null },
  measurements: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    enteredByRoute: {
      low_risk: { shared: {}, byGarmentKey: {} },
      medium_risk: { shared: {}, byGarmentKey: {} },
      high_risk: { shared: {}, byGarmentKey: {} },
    },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-v1",
    formulaVersion: "formula-v1",
    inputFingerprint: "measurement-input-v1",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
    invalidInputKeysByRoute: { low_risk: [], medium_risk: [], high_risk: [] },
  },
  shipping: {
    state: {
      schemaVersion: 1,
      fulfilmentMethod: "destination_delivery",
      destinationSelectionMode: "supported_country",
      otherDestinationCountry: null,
      destinationZoneId: "EUROPE",
      destinationZoneSource: "iso_resolved",
      quoteReference: null,
      customerInformation: {
        fullName: "Ada Lovelace",
        email: "ada@example.test",
        phone: "+31 6 1234 5678",
        deliveryAddress: { addressLine1: "1 Heritage Way", addressLine2: "", city: "Paris", postalCode: "75001", countryCode: "FR" },
        comment: "",
      },
    },
    status: "quote_ready",
    customerInformationComplete: true,
    formInputsComplete: true,
    formComplete: true,
    quoteReady: true,
    quoteRequired: false,
    destinationLabel: "Paris",
    parcelWeightKg: 0.5,
    weightTier: "0_2",
    additionalDeliveryFeeCents: 1900,
    rateVersion: "tariff-v1",
  },
  pricing: {
    schemaVersion: 2,
    model: "all_inclusive_garment_construction",
    status: "exact",
    garmentConstructionSubtotalCents: 6500,
    customDetailsCents: 0,
    selectedDesignTotalCents: 6500,
    postEindhovenAdjustmentCents: 1900,
    exactTotalCents: 8400,
    components: {
      fabric: { status: "included_in_garment_construction", amountCents: null },
      sewing: { status: "included_in_garment_construction", amountCents: null },
      tax: { status: "included_in_garment_construction", amountCents: null },
      lagosToEindhovenShipping: { status: "included_in_garment_construction", amountCents: null },
      customDetails: { status: "separately_charged", amountCents: 0 },
      postEindhovenDelivery: { status: "separately_charged", amountCents: 1900 },
    },
  },
  contentStatus: "reviewable",
  paymentStatus: "payment_provider_unavailable",
  blockers: [{ code: "PAYMENT_PROVIDER_UNAVAILABLE", stage: "payment", message: "Online payment is not available yet." }],
  occurrenceStyleSnapshots,
});

const repeatedCandidate = candidate([
  catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
  catalogue("additional:shirt:1", "physical-occurrence-v1:2:additional:shirt:1", "Shirt 2", "style-b", "Modern Senator"),
  catalogue("additional:shirt:2", "physical-occurrence-v1:3:additional:shirt:2", "Shirt 3", "style-a", "Classic Senator"),
]);

const cartResult = createFutureOrderCartItemV2({
  candidate: repeatedCandidate,
  metadata: { cartItemId: "cart-v2-001" },
});
assert.equal(cartResult.status, "valid");
if (cartResult.status !== "valid") throw new Error("Expected Cart V2");
const cart = cartResult.value;
assert.equal(cart.schemaVersion, 2);
assert.equal(cart.cartItemId, "cart-v2-001");
assert.deepEqual(cart.candidate, repeatedCandidate);
assert.deepEqual(
  cart.candidate.occurrenceStyleSnapshots.map((row) => row.occurrence.label),
  ["Shirt", "Shirt 2", "Shirt 3"],
);

const orderResult = createFutureOrderMasterOrderV2({
  cartItem: cart,
  metadata: { orderId: "order-v2-001" },
});
assert.equal(orderResult.status, "valid");
if (orderResult.status !== "valid") throw new Error("Expected MasterOrder V2");
const order = orderResult.value;
assert.equal(order.schemaVersion, 2);
assert.equal(order.orderId, "order-v2-001");
assert.deepEqual(order.cartItem, cart);
assert.deepEqual(order.cartItem.candidate.pricing, repeatedCandidate.pricing);
assert.deepEqual(order.cartItem.candidate.shipping, repeatedCandidate.shipping);
assert.deepEqual(order.cartItem.candidate.measurements, repeatedCandidate.measurements);
assert.deepEqual(order.cartItem.candidate.fabricAllocations, repeatedCandidate.fabricAllocations);
assert.deepEqual(order.cartItem.candidate.customDetails, repeatedCandidate.customDetails);

const cartJson = serializeFutureOrderCartItemV2(cart);
assert.equal(cartJson.status, "valid");
assert.equal(parseFutureOrderCartItemV2(cartJson.value).status, "valid");
const orderJson = serializeFutureOrderMasterOrderV2(order);
assert.equal(orderJson.status, "valid");
assert.deepEqual(parseFutureOrderMasterOrderV2(orderJson.value), {
  status: "valid",
  value: order,
  blockers: [],
});

const mutableCandidate = candidate([
  catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
]);
const isolatedCart = createFutureOrderCartItemV2({
  candidate: mutableCandidate,
  metadata: { cartItemId: "cart-isolated" },
});
assert.equal(isolatedCart.status, "valid");
if (isolatedCart.status !== "valid") throw new Error("Expected isolated Cart V2");
(mutableCandidate.garments[0] as { label: string }).label = "Mutated garment";
(mutableCandidate.occurrenceStyleSnapshots[0]!.catalogue as { name: string }).name = "Renamed today";
assert.equal(isolatedCart.value.candidate.garments[0]?.label, "Shirt");
assert.equal(isolatedCart.value.candidate.occurrenceStyleSnapshots[0]?.catalogue?.name, "Classic Senator");
const isolatedOrder = createFutureOrderMasterOrderV2({
  cartItem: JSON.parse(JSON.stringify(isolatedCart.value)),
  metadata: { orderId: "order-isolated" },
});
assert.equal(isolatedOrder.status, "valid");
if (isolatedOrder.status !== "valid") throw new Error("Expected isolated MasterOrder V2");
const mutableCartSource = JSON.parse(JSON.stringify(isolatedCart.value));
const isolatedOrderFromMutableCart = createFutureOrderMasterOrderV2({
  cartItem: mutableCartSource,
  metadata: { orderId: "order-isolated-mutable" },
});
assert.equal(isolatedOrderFromMutableCart.status, "valid");
if (isolatedOrderFromMutableCart.status !== "valid") throw new Error("Expected mutable Cart isolation");
mutableCartSource.candidate.shipping.state.customerInformation.fullName = "Mutated customer";
assert.equal(
  (isolatedOrderFromMutableCart.value.cartItem.candidate.shipping.state.customerInformation as { fullName: string }).fullName,
  "Ada Lovelace",
);
assert.equal(Object.isFrozen(isolatedOrder.value.cartItem.candidate.occurrenceStyleSnapshots), true);

const sameStyle = createFutureOrderCartItemV2({
  candidate: candidate([
    catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
    catalogue("base:skirt", "physical-occurrence-v1:2:base:skirt", "Skirt", "style-a", "Classic Senator"),
  ]),
  metadata: { cartItemId: "cart-same-style" },
});
assert.equal(sameStyle.status, "valid");
assert.equal(sameStyle.status === "valid" && sameStyle.value.candidate.occurrenceStyleSnapshots.length, 2);

const mixedSources = createFutureOrderCartItemV2({
  candidate: candidate([
    catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
    uploaded("base:skirt", "physical-occurrence-v1:2:base:skirt", "Skirt", "uploaded-x"),
  ]),
  metadata: { cartItemId: "cart-mixed" },
});
assert.equal(mixedSources.status, "valid");
assert.deepEqual(
  mixedSources.status === "valid" && mixedSources.value.candidate.occurrenceStyleSnapshots.map((row) => row.sourceKind),
  ["catalogue", "uploaded"],
);

const sharedUploaded = createFutureOrderCartItemV2({
  candidate: candidate([
    uploaded("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "uploaded-x"),
    uploaded("base:skirt", "physical-occurrence-v1:2:base:skirt", "Skirt", "uploaded-x"),
  ]),
  metadata: { cartItemId: "cart-shared-upload" },
});
assert.equal(sharedUploaded.status, "valid");
assert.deepEqual(
  sharedUploaded.status === "valid" && sharedUploaded.value.candidate.occurrenceStyleSnapshots.map((row) => row.uploaded?.uploadedSourceRef),
  ["uploaded-x", "uploaded-x"],
);

assert.equal(createFutureOrderCartItemV2({ candidate: repeatedCandidate, metadata: { cartItemId: "" } }).status, "invalid");
assert.equal(createFutureOrderMasterOrderV2({ cartItem: cart, metadata: { orderId: "" } }).status, "invalid");
const metadataCannotOverride = createFutureOrderCartItemV2({
  candidate: repeatedCandidate,
  metadata: { cartItemId: "cart-no-override", candidate: "ignored" } as { cartItemId: string },
});
assert.equal(metadataCannotOverride.status, "valid");
assert.deepEqual(
  metadataCannotOverride.status === "valid" && metadataCannotOverride.value.candidate,
  repeatedCandidate,
);

const malformedExplicitV2 = { ...cart, candidate: { ...cart.candidate, occurrenceStyleSnapshots: undefined } };
const malformedResult = parseFutureOrderCartItemV2(malformedExplicitV2);
assert.equal(malformedResult.status, "invalid");
assert.equal(malformedResult.blockers[0]?.code, "MALFORMED_CANDIDATE_V2");
const duplicateIdentity = candidate([
  catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
  catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt 2", "style-b", "Modern Senator"),
]);
assert.equal(createFutureOrderCartItemV2({ candidate: duplicateIdentity, metadata: { cartItemId: "duplicate" } }).status, "invalid");
const impossibleMixed = candidate([{
  ...catalogue("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "style-a", "Classic Senator"),
  uploaded: { uploadedSourceRef: "uploaded-x", displayLabel: "Uploaded X", previewReference: null },
}]);
assert.equal(createFutureOrderCartItemV2({ candidate: impossibleMixed, metadata: { cartItemId: "mixed" } }).status, "invalid");
const privateUploadField = candidate([{
  ...uploaded("base:shirt", "physical-occurrence-v1:1:base:shirt", "Shirt", "uploaded-x"),
  uploaded: { uploadedSourceRef: "uploaded-x", displayLabel: "Uploaded X", previewReference: null, storagePath: "private/path" } as never,
}]);
assert.equal(createFutureOrderCartItemV2({ candidate: privateUploadField, metadata: { cartItemId: "private" } }).status, "invalid");

console.log("PASS: Future Candidate V2 cart and MasterOrder storage contracts");
