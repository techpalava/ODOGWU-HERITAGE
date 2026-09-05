import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createFutureOrderV2Repository,
  createPersistedFutureOrderV2,
  parsePersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
  type FutureOrderV2PersistenceTransaction,
  type PersistedFutureOrderV2,
} from "./src/utils/futureOrderV2PersistenceContract";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";
import {
  createFutureOrderCartItemV2,
  createFutureOrderMasterOrderV2,
  type FutureOrderMasterOrderV2,
} from "./src/utils/futureOrderV2Storage";

const OWNER_UID = "owner-u1";
const PERSISTED_AT = new Date("2026-09-04T08:00:00.000Z");

const contractSource = readFileSync(
  "src/utils/futureOrderV2PersistenceContract.ts",
  "utf8",
);
assert.doesNotMatch(contractSource, /from ["']firebase\//);
assert.doesNotMatch(contractSource, /from ["']react["']/);
assert.doesNotMatch(contractSource, /\bdocument\.|\bwindow\./);

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

const candidate = (styleName = "Shirt Historical Style"): FutureOrderCandidateV2 => {
  const styles = [
    catalogueStyle("base:shirt", "token-shirt-1", "Shirt"),
    uploadedStyle("additional:shirt:1", "token-shirt-2", "Shirt 2"),
    uploadedStyle("additional:shirt:2", "token-shirt-3", "Shirt 3"),
  ];
  styles[0]!.catalogue!.name = styleName;
  return {
    schemaVersion: 2,
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
    garments: ["base:shirt", "additional:shirt:1", "additional:shirt:2"].map((garmentKey, index) => ({
      garmentKey,
      garmentType: "shirt",
      label: index === 0 ? "Shirt" : `Shirt ${index + 1}`,
      role: index === 0 ? "main" as const : "additional" as const,
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [{ garmentKey, garmentType: "shirt", label: index === 0 ? "Shirt" : `Shirt ${index + 1}` }],
      construction: [],
      constructionTotalCents: 10000,
    })),
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
      exactTotalCents: 30000,
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
    occurrenceStyleSnapshots: styles,
  } as FutureOrderCandidateV2;
};

const masterOrder = (orderId: string, styleName?: string): FutureOrderMasterOrderV2 => {
  const cart = createFutureOrderCartItemV2({
    candidate: candidate(styleName),
    metadata: { cartItemId: `cart-${orderId}` },
  });
  assert.equal(cart.status, "valid");
  if (cart.status !== "valid") throw new Error("Expected Cart V2");
  const order = createFutureOrderMasterOrderV2({
    cartItem: cart.value,
    metadata: { orderId },
  });
  assert.equal(order.status, "valid");
  if (order.status !== "valid") throw new Error("Expected MasterOrder V2");
  return order.value;
};

class MemoryAdapter implements FutureOrderV2PersistenceAdapter {
  readonly values = new Map<string, PersistedFutureOrderV2>();
  readonly creates: string[] = [];

  async runTransaction<T>(
    operation: (transaction: FutureOrderV2PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const pending = new Map<string, PersistedFutureOrderV2>();
    const result = await operation({
      get: async (orderId) => this.values.get(orderId) || null,
      create: (orderId, value) => {
        assert.equal(this.values.has(orderId), false, "create must follow an absent read");
        pending.set(orderId, structuredClone(value));
      },
    });
    pending.forEach((value, orderId) => {
      this.values.set(orderId, value);
      this.creates.push(orderId);
    });
    return result;
  }
}

const firstMasterOrder = masterOrder("future-order-001");
const envelope = createPersistedFutureOrderV2({
  masterOrder: firstMasterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: PERSISTED_AT.toISOString(),
});
assert.equal(envelope.status, "valid");
if (envelope.status !== "valid") throw new Error("Expected persisted V2 envelope");
assert.equal(envelope.value.ownerUid, OWNER_UID);
assert.equal(envelope.value.customer.ownerUid, OWNER_UID);
assert.equal(envelope.value.customer.fullName, "Ada Lovelace");
assert.deepEqual(envelope.value.masterOrder, firstMasterOrder);
assert.equal(JSON.stringify(envelope.value).includes("selectedStyleId"), false);
assert.equal(JSON.stringify(envelope.value).includes("storagePath"), false);

const roundTrip = parsePersistedFutureOrderV2(
  JSON.parse(JSON.stringify(envelope.value)),
  firstMasterOrder.orderId,
);
assert.equal(roundTrip.status, "valid");
assert.deepEqual(roundTrip.status === "valid" && roundTrip.value, envelope.value);
assert.deepEqual(
  envelope.value.masterOrder.cartItem.candidate.occurrenceStyleSnapshots.map((style) => style.sourceKind),
  ["catalogue", "uploaded", "uploaded"],
);
assert.deepEqual(
  envelope.value.masterOrder.cartItem.candidate.occurrenceStyleSnapshots.slice(1).map((style) => style.uploaded?.uploadedSourceRef),
  ["shared-uploaded-source-ref", "shared-uploaded-source-ref"],
);
assert.equal(
  envelope.value.masterOrder.cartItem.candidate.occurrenceStyleSnapshots[0]?.catalogue?.name,
  "Shirt Historical Style",
);

assert.equal(createPersistedFutureOrderV2({
  masterOrder: firstMasterOrder,
  owner: { uid: OWNER_UID, isAnonymous: true },
  customerOwnerUid: OWNER_UID,
}).status, "invalid");
assert.equal(createPersistedFutureOrderV2({
  masterOrder: firstMasterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: "owner-u2",
}).status, "invalid");

const privateMaster = structuredClone(firstMasterOrder) as FutureOrderMasterOrderV2 & { storagePath: string };
privateMaster.storagePath = "customer-design-drafts/private/original.jpg";
const privateResult = createPersistedFutureOrderV2({
  masterOrder: privateMaster,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
});
assert.equal(privateResult.status, "invalid");
assert.equal(privateResult.status === "invalid" && privateResult.code, "FORBIDDEN_PERSISTED_ORDER_V2_FIELD");

// Validate each trust boundary independently, including values under unknown keys.
for (const transientUrl of [
  "blob:https://example.test/transient-preview",
  "blob:null/abc123",
  "  BLOB:https://example.test/transient-preview  ",
]) {
  for (const location of ["uploaded-preview", "unexpected-nested-property"]) {
    const injectTransientUrl = (order: FutureOrderMasterOrderV2) => {
      if (location === "uploaded-preview") {
        Object.assign(order.cartItem.candidate.occurrenceStyleSnapshots[1]!.uploaded!, {
          previewReference: transientUrl,
        });
      } else {
        Object.assign(order.cartItem.candidate, {
          unexpectedPresentation: { references: [{ value: transientUrl }] },
        });
      }
    };
    const transientOrder = structuredClone(firstMasterOrder);
    injectTransientUrl(transientOrder);
    const creation = createPersistedFutureOrderV2({
      masterOrder: transientOrder,
      owner: { uid: OWNER_UID, isAnonymous: false },
      customerOwnerUid: OWNER_UID,
    });
    assert.equal(creation.status, "invalid", `Creation must reject ${location}: ${transientUrl}`);
    assert.equal(creation.status === "invalid" && creation.code, "FORBIDDEN_PERSISTED_ORDER_V2_FIELD");

    const injectedEnvelope = structuredClone(envelope.value);
    injectTransientUrl(injectedEnvelope.masterOrder);
    const parsed = parsePersistedFutureOrderV2(
      JSON.parse(JSON.stringify(injectedEnvelope)),
      firstMasterOrder.orderId,
    );
    assert.equal(parsed.status, "invalid", `Parsing must reject ${location}: ${transientUrl}`);
    assert.equal(parsed.status === "invalid" && parsed.code, "FORBIDDEN_PERSISTED_ORDER_V2_FIELD");
  }
}

// Existing opaque preview references and HTTPS catalogue images survive unchanged.
assert.equal(roundTrip.status, "valid");
if (roundTrip.status !== "valid") throw new Error("Expected durable references");
assert.equal(
  roundTrip.value.masterOrder.cartItem.candidate.occurrenceStyleSnapshots[1]?.uploaded?.previewReference,
  "opaque-preview-ref",
);
assert.equal(
  roundTrip.value.masterOrder.cartItem.candidate.occurrenceStyleSnapshots[0]?.catalogue?.image,
  "https://example.test/base:shirt.jpg",
);

const mismatch = structuredClone(envelope.value) as PersistedFutureOrderV2;
(mismatch.masterOrder as { orderId: string }).orderId = "another-order-id";
assert.equal(parsePersistedFutureOrderV2(mismatch, firstMasterOrder.orderId).status, "invalid");
const ownerMismatch = structuredClone(envelope.value) as PersistedFutureOrderV2;
(ownerMismatch.customer as { ownerUid: string }).ownerUid = "owner-u2";
assert.equal(parsePersistedFutureOrderV2(ownerMismatch).status, "invalid");
assert.equal(parsePersistedFutureOrderV2({ schemaVersion: 2, orderId: "legacy-looking" }).status, "invalid");

const adapter = new MemoryAdapter();
const repository = createFutureOrderV2Repository(adapter, () => PERSISTED_AT);
const created = await repository.persist({
  masterOrder: firstMasterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
});
assert.equal(created.status, "created");
assert.deepEqual(adapter.creates, ["future-order-001"]);
const original = structuredClone(adapter.values.get("future-order-001"));

const identicalRetry = await repository.persist({
  masterOrder: firstMasterOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
});
assert.equal(identicalRetry.status, "already_persisted");
assert.deepEqual(adapter.creates, ["future-order-001"]);
assert.deepEqual(adapter.values.get("future-order-001"), original);

const conflictingRetry = await repository.persist({
  masterOrder: masterOrder("future-order-001", "Conflicting Style"),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
});
assert.deepEqual(conflictingRetry, { status: "conflict", code: "ORDER_ID_PAYLOAD_CONFLICT" });
assert.deepEqual(adapter.values.get("future-order-001"), original);

const second = await repository.persist({
  masterOrder: masterOrder("future-order-002"),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
});
assert.equal(second.status, "created");
assert.deepEqual(adapter.creates, ["future-order-001", "future-order-002"]);

const storageSource = readFileSync("src/services/storageService.ts", "utf8");
const legacySaveOrder = storageSource.slice(
  storageSource.indexOf("saveOrder: async"),
  storageSource.indexOf("subscribeToCustomerOrders"),
);
assert.match(legacySaveOrder, /order\.shipment\?\.trackingId/);
assert.match(legacySaveOrder, /setDoc\([\s\S]*?\{ merge: true \}/);
assert.match(legacySaveOrder, /ownerUid: order\.ownerUid \|\| firebaseUser\.uid/);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.equal(studioSource.includes("persistFutureOrderV2"), false);
assert.ok(studioSource.includes("createFutureOrderV2PaymentReviewHandoff"));
const paymentReviewSource = readFileSync("src/utils/designStudioFuturePaymentReview.ts", "utf8");
assert.ok(paymentReviewSource.includes("FUTURE_ORDER_V2_PERSISTENCE_PENDING"));

console.log("PASS: future order V2 persistence, ownership, and idempotency authority");
