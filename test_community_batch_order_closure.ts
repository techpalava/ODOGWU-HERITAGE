import assert from "node:assert/strict";
import type { Batch } from "./src/types";
import {
  COMMUNITY_BATCH_CLOSED_MESSAGE,
  communityBatchClosureForIdentity,
  communityBatchFromRecord,
  isCommunityBatchClosedForOrders,
  requestFutureOrderCartAdmission,
  resolveCommunityBatchClosureStatus,
} from "./src/utils/communityBatchOrderClosure";
import { readFileSync } from "node:fs";
import { getRetainedCommunityBatchEligibilityBlocker } from "./src/utils/futureOrderCandidate";
import { handleFutureOrderV2StripePayment } from "./src/server/futureOrderV2StripePayment";
import {
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { handleFutureOrderV2PayPalCreateOrder } from "./src/server/futureOrderV2PayPalPayment";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import {
  createPersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
} from "./src/utils/futureOrderV2PersistenceContract";
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

// Admin "Keep open after end date (ongoing)" toggle (keepOpenAfterEndDate).
// Default stays closed (#785); the toggle overrides only the date check.
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: false },
    NOW,
  ),
  true,
  "Toggle off: Avatars past its end date stays closed.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true },
    NOW,
  ),
  false,
  "Toggle on, no Open until date: Avatars stays open past its end date.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, ongoingUntil: "2026-10-31" },
    NOW,
  ),
  false,
  "Toggle on with a future Open until date: open.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, ongoingUntil: "2026-10-16" },
    NOW,
  ),
  true,
  "Toggle on with a passed Open until date: closed.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, ongoingUntil: "2026-10-17" },
    new Date("2026-10-17T23:59:59.000+01:00"),
  ),
  false,
  "Open until closes at the same end-of-day +01:00 cutoff as endDate.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, ongoingUntil: "2026-10-17" },
    new Date("2026-10-18T00:00:00.000+01:00"),
  ),
  true,
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, allowOrders: false },
    NOW,
  ),
  true,
  "allowOrders=false closes a batch even with the toggle on.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    {
      ...avatarsPastDeadline,
      keepOpenAfterEndDate: true,
      targetGarments: 72,
      currentGarments: 72,
    },
    NOW,
  ),
  true,
  "Full capacity closes a batch even with the toggle on.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, status: "PRODUCTION_STARTED" },
    NOW,
  ),
  true,
  "Production statuses close a batch even with the toggle on.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    { ...avatarsPastDeadline, keepOpenAfterEndDate: true, status: "CLOSED" },
    NOW,
  ),
  true,
  "A manual CLOSED status closes a batch even with the toggle on.",
);
assert.equal(
  isCommunityBatchClosedForOrders(
    {
      ...avatarsPastDeadline,
      isAutoScheduled: true,
      keepOpenAfterEndDate: true,
    },
    NOW,
  ),
  false,
  "The toggle works for AUTO batches too.",
);
// The server reads the same fields from the Firestore record.
const parsedOngoing = communityBatchFromRecord("batch-6", {
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  status: "OPEN",
  allowOrders: true,
  isAutoScheduled: false,
  isActive: true,
  targetGarments: 72,
  currentGarments: 1,
  keepOpenAfterEndDate: true,
  ongoingUntil: "2026-10-31",
});
assert.equal(parsedOngoing?.keepOpenAfterEndDate, true);
assert.equal(parsedOngoing?.ongoingUntil, "2026-10-31");
assert.equal(isCommunityBatchClosedForOrders(parsedOngoing, NOW), false);
assert.equal(
  communityBatchFromRecord("batch-6", { endDate: "2026-09-30", keepOpenAfterEndDate: "yes" })
    ?.keepOpenAfterEndDate,
  undefined,
  "Only a boolean true turns the toggle on.",
);

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

// Server gate honours the keep-open toggle on the live record.
const ongoingCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Community", batchId: "batch-6" }),
  ongoingCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => ({ ...closedRecord, keepOpenAfterEndDate: true }),
  },
);
assert.equal(ongoingCart.state.status, 200, "a kept-open batch admits cart items");

const ongoingEndedCart = createResponse();
await handleFutureOrderV2StripePayment(
  cartRequest({ orderType: "Community", batchId: "batch-6" }),
  ongoingEndedCart.response,
  {
    now: () => NOW,
    readCommunityBatch: async () => ({
      ...closedRecord,
      keepOpenAfterEndDate: true,
      ongoingUntil: "2026-10-01",
    }),
  },
);
assert.equal(ongoingEndedCart.state.status, 409, "a passed Open until date closes the cart");

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
const paypalClosedOrder = createPersistedFutureOrderV2({
  masterOrder: createCatalogueAuthoritativeFutureOrderV2Fixture(
    "closed-community-order",
    undefined,
    { orderType: "Community", batchId: "batch-6" },
  ),
  owner: { uid: "owner-1", isAnonymous: false },
  customerOwnerUid: "owner-1",
  persistedAt: "2026-10-17T17:00:00.000Z",
});
if (paypalClosedOrder.status !== "valid") throw new Error("Expected persisted order.");
await handleFutureOrderV2PayPalCreateOrder(
  {
    method: "POST",
    headers: { authorization: "Bearer owner-token" },
    body: {
      orderId: "closed-community-order",
      paymentReference: "future-v2-payment-closed-community-order",
    },
  },
  paypalClosed.response,
  {
    now: () => NOW,
    readClientId: () => "sandbox-client",
    readClientSecret: () => "sandbox-secret",
    readEnv: () => "sandbox",
    getServices: () => ({
      auth: {
        async verifyIdToken() {
          return { uid: "owner-1", firebase: { sign_in_provider: "password" } };
        },
      },
      db: {},
    }),
    createStore: () => ({
      async readOrder() {
        return paypalClosedOrder.value;
      },
      async runTransaction(operation) {
        return operation({
          async getPayment() {
            return null;
          },
          createPayment() {
            throw new Error("create-order must not write payments");
          },
        });
      },
    }),
    readCommunityBatch: async () => closedRecord,
    createPayPalOrder: async () => {
      paypalCreated = true;
      return { id: "PAYPALORDER1" };
    },
  },
);
assert.equal(paypalClosed.state.status, 409);
assert.equal(
  (paypalClosed.state.body as { code?: string }).code,
  "COMMUNITY_BATCH_CLOSED",
);
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

// Closure status waits for the batch list: unknown/loading is never "closed".
{
  const community = { orderType: "Community" as const, batchId: "batch-6" };
  assert.equal(resolveCommunityBatchClosureStatus({ orderType: "Individual" }, [], false, NOW), "not_applicable");
  assert.equal(resolveCommunityBatchClosureStatus(community, [], false, NOW), "loading");
  assert.equal(resolveCommunityBatchClosureStatus(community, [batch()], false, NOW), "loading");
  assert.equal(resolveCommunityBatchClosureStatus(community, [batch()], true, NOW), "open");
  assert.equal(
    resolveCommunityBatchClosureStatus(community, [avatarsPastDeadline], true, NOW),
    "closed",
  );
  // The loaded list is the whole batches collection, so a missing batch is closed.
  assert.equal(resolveCommunityBatchClosureStatus(community, [batch({ id: "batch-8" })], true, NOW), "closed");

  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.equal(studioSource.includes("(storeBatches || []).length > 0 &&"), false);
  assert.match(studioSource, /resolveCommunityBatchClosureStatus\(\s*futureOrderIdentity,\s*storeBatches \|\| \[\],\s*hasLoadedStoreBatches,/);
  // The load-time toast is judged from the live batch, not the reloaded draft context.
  assert.match(studioSource, /resolveCommunityBatchClosureStatus\(\s*\{ orderType: "Community", batchId: effectiveOrderContext\.batchId \}/);
  const cartSource = readFileSync("src/components/FutureOrderV2CartPayPanel.tsx", "utf8");
  assert.equal(cartSource.includes("batches.length > 0 &&"), false);
  assert.match(cartSource, /disabled=\{communityBatchClosed \|\| communityBatchChecking \|\| paying \|\| !stripeReady\}/);
}

console.log("PASS: closed community batches are rejected for cart, checkout, and save");
