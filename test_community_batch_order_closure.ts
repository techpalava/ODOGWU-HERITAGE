import assert from "node:assert/strict";
import type { Batch } from "./src/types";
import {
  COMMUNITY_BATCH_CLOSED_MESSAGE,
  communityBatchClosureForIdentity,
  communityBatchFromRecord,
  isCommunityBatchClosedForOrders,
  requestFutureOrderCartAdmission,
} from "./src/utils/communityBatchOrderClosure";
import { getRetainedCommunityBatchEligibilityBlocker } from "./src/utils/futureOrderCandidate";
import { handleFutureOrderV2StripePayment } from "./src/server/futureOrderV2StripePayment";
import {
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { handleFutureOrderV2PayPalCreateOrder } from "./src/server/futureOrderV2PayPalPayment";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import type { FutureOrderV2PersistenceAdapter } from "./src/utils/futureOrderV2PersistenceContract";
import { createCatalogueAuthoritativeFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const NOW = new Date("2026-10-17T18:00:00.000Z");

const batch = (overrides: Partial<Batch> = {}): Batch => ({
  id: "batch-6",
  batchNumber: 6,
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-12-31",
  duration: "Open",
  targetGarments: 72,
  currentGarments: 0,
  currentOrders: 0,
  currentCustomers: 0,
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: true,
  isActive: true,
  visibility: "PUBLIC",
  ...overrides,
});

const avatarsPastDeadline = batch({
  endDate: "2026-09-30",
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: false,
  isActive: true,
});

assert.equal(
  isCommunityBatchClosedForOrders(avatarsPastDeadline, NOW),
  true,
  "A passed registration date closes Avatars even while status stays OPEN.",
);
assert.equal(
  isCommunityBatchClosedForOrders(batch(), NOW),
  false,
  "An open community batch inside its registration window still accepts orders.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    batch({ status: "CLOSED", allowOrders: false, isAutoScheduled: false }),
    NOW,
  ),
  true,
);
assert.equal(
  communityBatchClosureForIdentity({ orderType: "Individual" }, [avatarsPastDeadline], NOW)
    .closed,
  false,
  "Individual orders are not community-batch closures.",
);
assert.equal(
  communityBatchClosureForIdentity(
    { orderType: "Community", batchId: "batch-6" },
    [avatarsPastDeadline],
    NOW,
  ).closed,
  true,
);

const blocker = getRetainedCommunityBatchEligibilityBlocker(
  { orderType: "Community", batchId: "batch-6" },
  [avatarsPastDeadline],
);
assert.equal(blocker?.code, "RETAINED_COMMUNITY_BATCH_INELIGIBLE");
assert.equal(blocker?.message, COMMUNITY_BATCH_CLOSED_MESSAGE);

const parsed = communityBatchFromRecord("batch-6", {
  name: "Avatars",
  endDate: "2026-09-30",
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: false,
  isActive: true,
  targetGarments: 72,
  currentGarments: 1,
});
assert.equal(isCommunityBatchClosedForOrders(parsed, NOW), true);

function createResponse() {
  const state: { status: number; body: unknown } = { status: 200, body: undefined };
  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader() {
      return response;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { response, state };
}

const closedRecord = {
  id: "batch-6",
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: false,
  isActive: true,
  targetGarments: 72,
  currentGarments: 0,
  visibility: "PUBLIC",
};
const openRecord = { ...closedRecord, endDate: "2026-12-31", isAutoScheduled: true };

const cartRequest = (orderIdentity: unknown): HttpRequest => ({
  method: "POST",
  headers: {},
  body: { action: "add-to-cart", orderIdentity },
});

const closedCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Community", batchId: "batch-6" }),
  closedCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => closedRecord,
    createPaymentIntent: async () => {
      throw new Error("A closed batch must not create a PaymentIntent.");
    },
  },
);
assert.equal(closedCart.state.status, 409);
assert.equal(
  (closedCart.state.body as { code?: string; error?: string }).code,
  "COMMUNITY_BATCH_CLOSED",
);
assert.equal(
  (closedCart.state.body as { error?: string }).error,
  COMMUNITY_BATCH_CLOSED_MESSAGE,
);

const openCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Community", batchId: "batch-6" }),
  openCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => openRecord,
  },
);
assert.equal(openCart.state.status, 200);
assert.equal((openCart.state.body as { accepted?: boolean }).accepted, true);

const individualCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Individual" }),
  individualCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => {
      throw new Error("Individual cart admission must not read a community batch.");
    },
  },
);
assert.equal(individualCart.state.status, 200);

const unavailableCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Community", batchId: "batch-6" }),
  unavailableCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => {
      throw new Error("firestore down");
    },
  },
);
assert.equal(unavailableCart.state.status, 503);

const admission = await requestFutureOrderCartAdmission(
  { orderType: "Community", batchId: "batch-6" },
  async () =>
    new Response(JSON.stringify({ error: COMMUNITY_BATCH_CLOSED_MESSAGE, code: "COMMUNITY_BATCH_CLOSED" }), {
      status: 409,
    }),
);
assert.equal(admission.accepted, false);
assert.equal(admission.message, COMMUNITY_BATCH_CLOSED_MESSAGE);

const adapter: FutureOrderV2PersistenceAdapter = {
  async runTransaction(operation) {
    return operation({
      get: async () => null,
      create: () => undefined,
    });
  },
};

const closedSave = await persistFutureOrderV2ForVerifiedIdentity({
  identity: { uid: "owner-1", isAnonymous: false },
  request: {
    masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
      "closed-community-order",
      undefined,
      { orderType: "Community", batchId: "batch-6" },
    ),
    customerOwnerUid: "owner-1",
  },
  adapter,
  now: () => NOW,
  readCommunityBatch: async () => closedRecord,
});
assert.equal(closedSave.status, "invalid");
if (closedSave.status === "invalid") {
  assert.equal(closedSave.code, "COMMUNITY_BATCH_CLOSED");
  assert.equal(closedSave.message, COMMUNITY_BATCH_CLOSED_MESSAGE);
}

const openSave = await persistFutureOrderV2ForVerifiedIdentity({
  identity: { uid: "owner-1", isAnonymous: false },
  request: {
    masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
      "open-community-order",
      undefined,
      { orderType: "Community", batchId: "batch-6" },
    ),
    customerOwnerUid: "owner-1",
  },
  adapter,
  now: () => NOW,
  readCommunityBatch: async () => openRecord,
});
assert.equal(openSave.status, "created");

const missingReader = await persistFutureOrderV2ForVerifiedIdentity({
  identity: { uid: "owner-1", isAnonymous: false },
  request: {
    masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
      "unconfirmed-community-order",
      undefined,
      { orderType: "Community", batchId: "batch-6" },
    ),
    customerOwnerUid: "owner-1",
  },
  adapter,
  now: () => NOW,
});
assert.equal(missingReader.status, "invalid");

let paypalCreated = false;
const paypalClosed = createResponse();
await handleFutureOrderV2PayPalCreateOrder(
  {
    method: "POST",
    headers: {},
    body: {
      orderId: "closed-community-order",
      paymentReference: "future-v2-payment-closed-community-order",
      masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
        "closed-community-order",
        undefined,
        { orderType: "Community", batchId: "batch-6" },
      ),
    },
  },
  paypalClosed.response,
  {
    now: () => NOW,
    readClientId: () => "sandbox-client",
    readClientSecret: () => "sandbox-secret",
    readEnv: () => "sandbox",
    readCommunityBatch: async () => closedRecord,
    createPayPalOrder: async () => {
      paypalCreated = true;
      return { id: "PAYPALORDER1" };
    },
  },
);
assert.equal(paypalClosed.state.status, 409);
assert.equal(paypalCreated, false);

await assert.rejects(
  () =>
    persistFutureOrderV2ForVerifiedIdentity({
      identity: { uid: "owner-1", isAnonymous: false },
      request: {
        masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
          "unavailable-community-order",
          undefined,
          { orderType: "Community", batchId: "batch-6" },
        ),
        customerOwnerUid: "owner-1",
      },
      adapter,
      now: () => NOW,
      readCommunityBatch: async () => {
        throw new Error("firestore down");
      },
    }),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError &&
    error.code === "COMMUNITY_BATCH_UNAVAILABLE",
);

console.log("PASS: closed community batches are rejected for cart, checkout, and save");
