import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createFutureOrderV2PersistenceClient,
  FutureOrderV2PersistenceClientError,
} from "./src/services/futureOrderV2Persistence";
import { createPrivateBatchAccessSession } from "./src/services/privateBatchAccessSession";
import {
  createPrivateBatchAuthCoordinator,
  type PrivateBatchTokenUser,
} from "./src/services/privateBatchAuthCoordinator";
import {
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { createFutureOrderV2PersistenceHandler } from "./src/server/futureOrderV2PersistenceHttp";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import type { CustomGroup } from "./src/types";
import {
  createPersistedFutureOrderV2,
  parsePersistedFutureOrderV2,
  type FutureOrderV2PersistenceAdapter,
  type FutureOrderV2PersistenceTransaction,
  type PersistedFutureOrderV2,
} from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const OWNER_UID = "future-order-owner";
const OTHER_UID = "another-future-order-owner";
const NOW = new Date("2026-09-05T10:00:00.000Z");

class MemoryAdapter implements FutureOrderV2PersistenceAdapter {
  readonly values = new Map<string, unknown>();
  readonly pricingAuthorities = new Map<string, unknown>();
  readonly creates: string[] = [];

  constructor(
    private readonly privateBatchAuthorizer?: NonNullable<
      FutureOrderV2PersistenceTransaction["assertGroupOrderIdentity"]
    >,
  ) {}

  async runTransaction<T>(
    operation: (transaction: FutureOrderV2PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const pending = new Map<string, PersistedFutureOrderV2>();
    const pendingPricingAuthorities = new Map<string, unknown>();
    const transaction: FutureOrderV2PersistenceTransaction = {
      get: async (orderId) => this.values.get(orderId) ?? null,
      create: (orderId, value) => {
        if (this.values.has(orderId) || pending.has(orderId)) {
          throw new Error("create-only collision");
        }
        pending.set(orderId, structuredClone(value));
      },
      getPricingAuthority: async (orderId) =>
        this.pricingAuthorities.get(orderId) ?? null,
      createPricingAuthority: (orderId, value) => {
        if (this.pricingAuthorities.has(orderId) || pendingPricingAuthorities.has(orderId)) {
          throw new Error("pricing-authority collision");
        }
        pendingPricingAuthorities.set(orderId, structuredClone(value));
      },
    };
    if (this.privateBatchAuthorizer) {
      transaction.assertGroupOrderIdentity = this.privateBatchAuthorizer;
    }
    const result = await operation(transaction);
    pending.forEach((value, orderId) => {
      this.values.set(orderId, value);
      this.creates.push(orderId);
    });
    pendingPricingAuthorities.forEach((value, orderId) => {
      this.pricingAuthorities.set(orderId, value);
    });
    return result;
  }
}

const persist = (
  adapter: FutureOrderV2PersistenceAdapter,
  orderId: string,
  styleName?: string,
) =>
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture(orderId, styleName),
      customerOwnerUid: OWNER_UID,
    },
    adapter,
    now: () => NOW,
  });

const adapter = new MemoryAdapter();
const created = await persist(adapter, "server-order-1");
assert.equal(created.status, "created");
assert.equal(created.status === "created" && created.value.ownerUid, OWNER_UID);
assert.equal(
  created.status === "created" && created.value.customer.fullName,
  "Ada Lovelace",
);
assert.equal(adapter.creates.length, 1);
const original = structuredClone(adapter.values.get("server-order-1"));

const sidecarAdapter = new MemoryAdapter();
const sidecarOrder = createFutureOrderV2Fixture("server-order-with-sidecar");
const sidecarCreated = await persistFutureOrderV2ForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  request: {
    masterOrder: sidecarOrder,
    customerOwnerUid: OWNER_UID,
    pricingAuthorityInput: { schemaVersion: 1, orderLevelPricing: null },
  },
  adapter: sidecarAdapter,
  now: () => NOW,
});
assert.equal(sidecarCreated.status, "created");
assert.equal(sidecarAdapter.values.has(sidecarOrder.orderId), true);
assert.equal(sidecarAdapter.pricingAuthorities.has(sidecarOrder.orderId), true);

let incompleteAdapterCreates = 0;
const incompleteAdapter: FutureOrderV2PersistenceAdapter = {
  runTransaction: async (operation) =>
    operation({
      get: async () => null,
      create: () => {
        incompleteAdapterCreates += 1;
      },
    }),
};
await assert.rejects(
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture("server-order-sidecar-unavailable"),
      customerOwnerUid: OWNER_UID,
      pricingAuthorityInput: { schemaVersion: 1, orderLevelPricing: null },
    },
    adapter: incompleteAdapter,
    now: () => NOW,
  }),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError &&
    error.code === "PRICING_AUTHORITY_UNAVAILABLE",
);
assert.equal(incompleteAdapterCreates, 0, "order creation cannot proceed without its sidecar");

const identitylessNewOrder = structuredClone(
  createFutureOrderV2Fixture("identityless-new-order"),
);
Reflect.deleteProperty(identitylessNewOrder.cartItem.candidate, "orderIdentity");
const identitylessNewResult = await persistFutureOrderV2ForVerifiedIdentity({
  identity: { uid: OWNER_UID, isAnonymous: false },
  request: {
    masterOrder: identitylessNewOrder,
    customerOwnerUid: OWNER_UID,
  },
  adapter: new MemoryAdapter(),
  now: () => NOW,
});
assert.deepEqual(identitylessNewResult, {
  status: "invalid",
  code: "ORDER_IDENTITY_REQUIRED",
  message: "A canonical order identity is required for new V2 persistence.",
});

const historicalEnvelope = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture("historical-identityless-order"),
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: NOW.toISOString(),
});
assert.equal(historicalEnvelope.status, "valid");
if (historicalEnvelope.status !== "valid") throw new Error("Expected historical V2 fixture");
const identitylessHistoricalEnvelope = structuredClone(historicalEnvelope.value);
Reflect.deleteProperty(
  identitylessHistoricalEnvelope.masterOrder.cartItem.candidate,
  "orderIdentity",
);
assert.equal(
  parsePersistedFutureOrderV2(
    identitylessHistoricalEnvelope,
    "historical-identityless-order",
  ).status,
  "valid",
);

const identical = await persist(adapter, "server-order-1");
assert.equal(identical.status, "already_persisted");
assert.equal(adapter.creates.length, 1);
assert.deepEqual(adapter.values.get("server-order-1"), original);

const privateMemberIdentity = {
  orderType: "Group Member" as const,
  batchId: "private_batch_123456",
};
const privateMemberOrder = createFutureOrderV2Fixture(
  "private-member-order",
  undefined,
  privateMemberIdentity,
);
assert.deepEqual(
  privateMemberOrder.cartItem.candidate.orderIdentity,
  privateMemberIdentity,
);
await assert.rejects(
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: { masterOrder: privateMemberOrder, customerOwnerUid: OWNER_UID },
    adapter: new MemoryAdapter(),
    now: () => NOW,
  }),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError &&
    error.code === "PRIVATE_BATCH_UNAVAILABLE",
);

const privateAuthorizations: Array<{ orderType: string; batchId: string; uid: string }> = [];
const authorizedPrivateAdapter = new MemoryAdapter(async (identity, uid) => {
  privateAuthorizations.push({ ...identity, uid });
});
for (const [orderId, orderIdentity] of [
  ["private-member-authorized", privateMemberIdentity],
  [
    "private-organizer-authorized",
    { orderType: "Group Organizer" as const, batchId: "private_batch_123456" },
  ],
] as const) {
  const result = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture(orderId, undefined, orderIdentity),
      customerOwnerUid: OWNER_UID,
    },
    adapter: authorizedPrivateAdapter,
    now: () => NOW,
  });
  assert.equal(result.status, "created");
}
assert.deepEqual(privateAuthorizations, [
  { orderType: "Group Member", batchId: "private_batch_123456", uid: OWNER_UID },
  { orderType: "Group Organizer", batchId: "private_batch_123456", uid: OWNER_UID },
]);

// PUBLIC personalized records retain the same Organizer/Member identity
// shape. The server contract still resolves their canonical group ID, but it
// must not require the PRIVATE membership model merely because of the role.
const publicGroupAuthorizations: Array<{ orderType: string; batchId: string; uid: string }> = [];
const publicGroupAdapter = new MemoryAdapter(async (identity, uid) => {
  publicGroupAuthorizations.push({ ...identity, uid });
});
for (const orderIdentity of [
  { orderType: "Group Organizer" as const, batchId: "public_batch_1234567" },
  { orderType: "Group Member" as const, batchId: "public_batch_1234567" },
]) {
  const result = await persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture(
        `public-${orderIdentity.orderType.replace(" ", "-")}`,
        undefined,
        orderIdentity,
      ),
      customerOwnerUid: OWNER_UID,
    },
    adapter: publicGroupAdapter,
    now: () => NOW,
  });
  assert.equal(result.status, "created");
}
assert.deepEqual(publicGroupAuthorizations, [
  { orderType: "Group Organizer", batchId: "public_batch_1234567", uid: OWNER_UID },
  { orderType: "Group Member", batchId: "public_batch_1234567", uid: OWNER_UID },
]);

const conflict = await persist(
  adapter,
  "server-order-1",
  "Conflicting immutable style",
);
assert.deepEqual(conflict, {
  status: "conflict",
  code: "ORDER_ID_PAYLOAD_CONFLICT",
});
assert.equal(adapter.creates.length, 1);
assert.deepEqual(adapter.values.get("server-order-1"), original);

const malformedAdapter = new MemoryAdapter();
malformedAdapter.values.set("malformed-order", {
  ownerUid: OWNER_UID,
  schemaVersion: 1,
});
assert.deepEqual(await persist(malformedAdapter, "malformed-order"), {
  status: "conflict",
  code: "EXISTING_ORDER_V2_INVALID",
});
assert.equal(malformedAdapter.creates.length, 0);

const foreignAdapter = new MemoryAdapter();
foreignAdapter.values.set("foreign-order", {
  ownerUid: OTHER_UID,
  privateCustomerData: "must-not-leak",
});
await assert.rejects(
  persist(foreignAdapter, "foreign-order"),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError &&
    error.code === "ORDER_ID_UNAVAILABLE" &&
    !error.message.includes(OTHER_UID),
);
assert.equal(foreignAdapter.creates.length, 0);

await assert.rejects(
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: true },
    request: {
      masterOrder: createFutureOrderV2Fixture("anonymous-order"),
      customerOwnerUid: OWNER_UID,
    },
    adapter,
  }),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError &&
    error.code === "ANONYMOUS_NOT_ALLOWED",
);
await assert.rejects(
  persistFutureOrderV2ForVerifiedIdentity({
    identity: { uid: OWNER_UID, isAnonymous: false },
    request: {
      masterOrder: createFutureOrderV2Fixture("spoofed-order"),
      customerOwnerUid: OTHER_UID,
    },
    adapter,
  }),
  (error: unknown) =>
    error instanceof FutureOrderV2ServerError && error.code === "OWNER_MISMATCH",
);

type ResponseState = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};

const createResponse = () => {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const response: HttpResponse = {
    status(code) {
      state.status = code;
      return response;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
      return response;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { response, state };
};

const httpAdapter = new MemoryAdapter();
const handler = createFutureOrderV2PersistenceHandler({
  getServices: () => ({
    auth: {
      async verifyIdToken(token) {
        if (token === "invalid-token") throw new Error("expired token detail");
        if (token === "anonymous-token") {
          return {
            uid: OWNER_UID,
            firebase: { sign_in_provider: "anonymous" },
          };
        }
        if (token === "malformed-identity") return { uid: OWNER_UID };
        return {
          uid: OWNER_UID,
          firebase: { sign_in_provider: "password" },
        };
      },
    },
    db: null,
  }),
  createAdapter: () => httpAdapter,
  now: () => NOW,
  log: () => undefined,
});

const request = (
  authorization?: string,
  body: unknown = {
    masterOrder: createFutureOrderV2Fixture("http-order"),
    customerOwnerUid: OWNER_UID,
  },
  method = "POST",
): HttpRequest => ({
  method,
  headers: authorization ? { authorization } : {},
  body,
});

const methodNotAllowed = createResponse();
await handler(request(undefined, undefined, "GET"), methodNotAllowed.response);
assert.equal(methodNotAllowed.state.status, 405);
assert.equal(methodNotAllowed.state.headers.allow, "POST");

for (const authorization of [undefined, "Basic token", "Bearer ", "Bearer a b"]) {
  const response = createResponse();
  await handler(request(authorization), response.response);
  assert.equal(response.state.status, 401);
  assert.deepEqual(response.state.body, {
    error: "Firebase authentication is required.",
    code: "AUTH_REQUIRED",
  });
}

const invalidToken = createResponse();
await handler(request("Bearer invalid-token"), invalidToken.response);
assert.equal(invalidToken.state.status, 401);
assert.equal(JSON.stringify(invalidToken.state.body).includes("expired"), false);

const anonymousToken = createResponse();
await handler(request("Bearer anonymous-token"), anonymousToken.response);
assert.equal(anonymousToken.state.status, 403);
assert.deepEqual(anonymousToken.state.body, {
  error: "Anonymous accounts cannot persist historical orders.",
  code: "ANONYMOUS_NOT_ALLOWED",
});

const malformedIdentity = createResponse();
await handler(request("Bearer malformed-identity"), malformedIdentity.response);
assert.equal(malformedIdentity.state.status, 401);

const malformedBody = createResponse();
await handler(
  request("Bearer valid-token", {
    masterOrder: createFutureOrderV2Fixture("http-order"),
    customerOwnerUid: OWNER_UID,
    isAnonymous: false,
  }),
  malformedBody.response,
);
assert.equal(malformedBody.state.status, 400);

const spoofedOwner = createResponse();
await handler(
  request("Bearer valid-token", {
    masterOrder: createFutureOrderV2Fixture("spoofed-http-order"),
    customerOwnerUid: OTHER_UID,
  }),
  spoofedOwner.response,
);
assert.equal(spoofedOwner.state.status, 403);
assert.deepEqual(spoofedOwner.state.body, {
  error: "The authenticated owner does not match this order request.",
  code: "OWNER_MISMATCH",
});

const httpCreated = createResponse();
await handler(request("Bearer valid-token"), httpCreated.response);
assert.equal(httpCreated.state.status, 201);
assert.equal((httpCreated.state.body as { status: string }).status, "created");

const httpIdentical = createResponse();
await handler(request("Bearer valid-token"), httpIdentical.response);
assert.equal(httpIdentical.state.status, 200);
assert.equal(
  (httpIdentical.state.body as { status: string }).status,
  "already_persisted",
);

const httpConflict = createResponse();
await handler(
  request("Bearer valid-token", {
    masterOrder: createFutureOrderV2Fixture(
      "http-order",
      "HTTP conflicting immutable style",
    ),
    customerOwnerUid: OWNER_UID,
  }),
  httpConflict.response,
);
assert.equal(httpConflict.state.status, 409);
assert.deepEqual(httpConflict.state.body, {
  status: "conflict",
  code: "ORDER_ID_PAYLOAD_CONFLICT",
});

const foreignEnvelope = createPersistedFutureOrderV2({
  masterOrder: createFutureOrderV2Fixture("http-foreign-order"),
  owner: { uid: OTHER_UID, isAnonymous: false },
  customerOwnerUid: OTHER_UID,
  persistedAt: NOW.toISOString(),
});
assert.equal(foreignEnvelope.status, "valid");
if (foreignEnvelope.status !== "valid") throw new Error("Expected foreign fixture");
httpAdapter.values.set("http-foreign-order", foreignEnvelope.value);
const foreignCollision = createResponse();
await handler(
  request("Bearer valid-token", {
    masterOrder: createFutureOrderV2Fixture("http-foreign-order"),
    customerOwnerUid: OWNER_UID,
  }),
  foreignCollision.response,
);
assert.equal(foreignCollision.state.status, 409);
assert.deepEqual(foreignCollision.state.body, {
  status: "conflict",
  code: "ORDER_ID_UNAVAILABLE",
});
assert.equal(JSON.stringify(foreignCollision.state.body).includes(OTHER_UID), false);

const rawFailureHandler = createFutureOrderV2PersistenceHandler({
  getServices: () => ({
    auth: {
      verifyIdToken: async () => ({
        uid: OWNER_UID,
        firebase: { sign_in_provider: "password" },
      }),
    },
    db: null,
  }),
  createAdapter: () => ({
    runTransaction: async () => {
      throw new Error("sensitive Admin transport detail");
    },
  }),
  log: () => undefined,
});
const rawFailure = createResponse();
await rawFailureHandler(
  request("Bearer valid-token", {
    masterOrder: createFutureOrderV2Fixture("raw-failure-order"),
    customerOwnerUid: OWNER_UID,
  }),
  rawFailure.response,
);
assert.equal(rawFailure.state.status, 503);
assert.equal(JSON.stringify(rawFailure.state.body).includes("sensitive"), false);

let tokenForceRefresh: boolean | undefined;
let capturedPath = "";
let capturedInit: RequestInit | undefined;
const clientOrder = createFutureOrderV2Fixture("client-order");
const clientEnvelope = createPersistedFutureOrderV2({
  masterOrder: clientOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: NOW.toISOString(),
});
assert.equal(clientEnvelope.status, "valid");
if (clientEnvelope.status !== "valid") throw new Error("Expected client fixture");
const client = createFutureOrderV2PersistenceClient({
  getCurrentUser: () => ({
    uid: OWNER_UID,
    isAnonymous: false,
    async getIdToken(forceRefresh) {
      tokenForceRefresh = forceRefresh;
      return "fresh-client-token";
    },
  }),
  async fetch(path, init) {
    capturedPath = path;
    capturedInit = init;
    return {
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ status: "created", value: clientEnvelope.value }),
    };
  },
});
assert.equal(
  (await client.persist({ masterOrder: clientOrder, customerOwnerUid: OWNER_UID }))
    .status,
  "created",
);
assert.equal(tokenForceRefresh, true);
assert.equal(capturedPath, "/api/orders/persist-future-order-v2");
assert.equal(
  (capturedInit?.headers as Record<string, string>).Authorization,
  "Bearer fresh-client-token",
);
const capturedBody = JSON.parse(String(capturedInit?.body)) as Record<
  string,
  unknown
>;
assert.deepEqual(Object.keys(capturedBody).sort(), [
  "customerOwnerUid",
  "masterOrder",
]);
assert.equal("isAnonymous" in capturedBody, false);
assert.equal("uid" in capturedBody, false);

const invalidClient = createFutureOrderV2PersistenceClient({
  getCurrentUser: () => ({
    uid: OWNER_UID,
    isAnonymous: false,
    getIdToken: async () => "token",
  }),
  fetch: async () => ({
    ok: true,
    status: 201,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      status: "created",
      value: { ...clientEnvelope.value, unexpected: true },
    }),
  }),
});
await assert.rejects(
  invalidClient.persist({ masterOrder: clientOrder, customerOwnerUid: OWNER_UID }),
  (error: unknown) =>
    error instanceof FutureOrderV2PersistenceClientError &&
    error.code === "INVALID_RESPONSE",
);

const rejectedClient = createFutureOrderV2PersistenceClient({
  getCurrentUser: () => ({
    uid: OWNER_UID,
    isAnonymous: false,
    getIdToken: async () => "expired-token",
  }),
  fetch: async () => ({
    ok: false,
    status: 401,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      error: "Firebase authentication could not be verified.",
      code: "AUTH_REQUIRED",
    }),
  }),
});
await assert.rejects(
  rejectedClient.persist({ masterOrder: clientOrder, customerOwnerUid: OWNER_UID }),
  (error: unknown) =>
    error instanceof FutureOrderV2PersistenceClientError &&
    error.code === "AUTH_REQUIRED",
);

// The client persistence boundary itself must reject a stale PRIVATE
// capability after getIdToken resolves. No protected HTTP request is sent.
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};
const privateClientOrder = createFutureOrderV2Fixture(
  "private-client-continuity",
  undefined,
  { orderType: "Group Organizer", batchId: "private_batch_123456" },
);
const privateClientEnvelope = createPersistedFutureOrderV2({
  masterOrder: privateClientOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: NOW.toISOString(),
});
assert.equal(privateClientEnvelope.status, "valid");
if (privateClientEnvelope.status !== "valid") {
  throw new Error("Expected private client fixture");
}
const discoveryGroup = (ownerUid: string): CustomGroup => ({
  batchId: "private_batch_123456",
  ownerUid,
  organizerId: ownerUid,
  organizer: ownerUid,
  batchName: "Private continuity test",
  occasion: "Test",
  description: "Test",
  country: "NL",
  city: "Eindhoven",
  preferredDeliveryMonth: "August",
  expectedParticipants: 1,
  maxParticipants: 2,
  visibility: "PRIVATE",
  currentMembers: 1,
  closingDate: "2099-01-01",
  deliveryWindow: "Later",
  status: "OPEN",
});

// A forced refresh has two valid forms: Firebase can emit a token event, or
// it can return the same token with no event. Both must await the exact new
// discovery lifecycle; denial and auth supersession fail before HTTP.
type RefreshScenario =
  | "token-event"
  | "unchanged-token"
  | "denied"
  | "logout"
  | "uid-switch";
for (const refreshScenario of [
  "token-event",
  "unchanged-token",
  "denied",
  "logout",
  "uid-switch",
] as const satisfies readonly RefreshScenario[]) {
  const accessSession = createPrivateBatchAccessSession(80);
  let currentClientIdentity: (PrivateBatchTokenUser & {
    getIdToken(forceRefresh?: boolean): Promise<string>;
  }) | null;
  const coordinator = createPrivateBatchAuthCoordinator({
    getTarget: () => ({ setIdentity: () => undefined }),
    getCurrentUser: () => currentClientIdentity,
    accessSession,
  });
  const ownerIdentity: PrivateBatchTokenUser & {
    getIdToken(forceRefresh?: boolean): Promise<string>;
  } = {
    uid: OWNER_UID,
    isAnonymous: false,
    getIdTokenResult: async () => ({ claims: { admin: false } }),
    getIdToken: async () => {
      if (refreshScenario === "token-event") {
        coordinator.synchronize(ownerIdentity);
      }
      return "post-refresh-token";
    },
  };
  currentClientIdentity = ownerIdentity;
  coordinator.synchronize(ownerIdentity);
  const initialLifecycle = accessSession.getCurrentLifecycle();
  assert.ok(initialLifecycle, "Initial coordinator synchronization starts discovery.");
  let sourceDiscoveryLifecycleId = initialLifecycle.discoveryLifecycleId;
  accessSession.publishDiscovery({
    discoveryLifecycleId: initialLifecycle.discoveryLifecycleId,
    uid: OWNER_UID,
    groups: [discoveryGroup(OWNER_UID)],
    accessById: { private_batch_123456: "owner" },
    ready: true,
  });
  let requests = 0;
  const refreshClient = createFutureOrderV2PersistenceClient({
    getCurrentUser: () => currentClientIdentity,
    fetch: async () => {
      requests += 1;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "created", value: privateClientEnvelope.value }),
      };
    },
  });
  const pending = refreshClient.persist({
    masterOrder: privateClientOrder,
    customerOwnerUid: OWNER_UID,
    resolvePersonalizedGroupAuthority: () => ({
      status: "FINAL_PRIVATE" as const,
      visibility: "PRIVATE" as const,
      discoveryLifecycleId: sourceDiscoveryLifecycleId,
    }),
    privateBatchCapabilityFactory: {
      captureDiscoveryAnchor: accessSession.getDiscoveryAnchor,
      ensurePostRefreshCapability: async (request) => {
        const lifecycle = coordinator.ensureFreshPrivateDiscoveryForCurrentSession({
          uid: request.uid,
          anchor: request.anchor,
        });
        if (!lifecycle) return undefined;
        const established = await accessSession.awaitPrivateBatchAccess({
          uid: request.uid,
          orderType: request.identity.orderType,
          batchId: request.identity.batchId,
          discoveryLifecycleId: lifecycle.discoveryLifecycleId,
        });
        return established.status === "AUTHORIZED"
          ? {
              generation: established.accessGeneration,
              discoveryLifecycleId: established.discoveryLifecycleId,
              uid: established.uid,
              orderType: established.orderType,
              batchId: established.batchId,
              isCurrent: () =>
                accessSession.getCurrentLifecycle()?.discoveryLifecycleId ===
                  established.discoveryLifecycleId &&
                accessSession.getGeneration() === established.accessGeneration,
            }
          : undefined;
      },
    },
  });
  await Promise.resolve();
  assert.equal(requests, 0, "No request may precede the renewed discovery result.");
  if (refreshScenario === "token-event" || refreshScenario === "unchanged-token") {
    const refreshedLifecycle = accessSession.getCurrentLifecycle();
    assert.ok(refreshedLifecycle, "Refresh must own an active discovery lifecycle.");
    assert.notEqual(
      refreshedLifecycle.discoveryLifecycleId,
      initialLifecycle.discoveryLifecycleId,
      "A post-refresh request never reuses the prior discovery lifecycle.",
    );
    sourceDiscoveryLifecycleId = refreshedLifecycle.discoveryLifecycleId;
    accessSession.publishDiscovery({
      discoveryLifecycleId: refreshedLifecycle.discoveryLifecycleId,
      uid: OWNER_UID,
      groups: [discoveryGroup(OWNER_UID)],
      accessById: { private_batch_123456: "owner" },
      ready: true,
    });
    assert.equal((await pending).status, "created");
    assert.equal(requests, 1);
  } else {
    if (refreshScenario === "denied") {
      const refreshedLifecycle = accessSession.getCurrentLifecycle();
      assert.ok(refreshedLifecycle, "Denied refresh still completes a fresh lifecycle.");
      accessSession.publishDiscovery({
        discoveryLifecycleId: refreshedLifecycle.discoveryLifecycleId,
        uid: OWNER_UID,
        groups: [discoveryGroup(OWNER_UID)],
        accessById: {},
        ready: true,
      });
    } else if (refreshScenario === "logout") {
      currentClientIdentity = null;
      coordinator.synchronize(null);
    } else {
      currentClientIdentity = {
        uid: OTHER_UID,
        isAnonymous: false,
        getIdTokenResult: async () => ({ claims: { admin: false } }),
        getIdToken: async () => "other-token",
      };
      coordinator.synchronize(currentClientIdentity);
    }
    await assert.rejects(
      pending,
      (error: unknown) =>
        error instanceof FutureOrderV2PersistenceClientError &&
        error.code ===
          (refreshScenario === "logout" || refreshScenario === "uid-switch"
            ? "AUTH_REQUIRED"
            : "PRIVATE_BATCH_UNAUTHORIZED"),
      refreshScenario,
    );
    assert.equal(requests, 0, `${refreshScenario} must fail before HTTP.`);
  }
}

// Group Organizer/Member is not itself a privacy flag. A terminal PUBLIC
// authority keeps normal persistence without a private capability, while a
// terminal missing authority fails before a network request.
const publicClientOrder = createFutureOrderV2Fixture(
  "public-client-continuity",
  undefined,
  { orderType: "Group Member", batchId: "public_batch_1234567" },
);
const publicClientEnvelope = createPersistedFutureOrderV2({
  masterOrder: publicClientOrder,
  owner: { uid: OWNER_UID, isAnonymous: false },
  customerOwnerUid: OWNER_UID,
  persistedAt: NOW.toISOString(),
});
assert.equal(publicClientEnvelope.status, "valid");
if (publicClientEnvelope.status !== "valid") throw new Error("Expected public client fixture");
let publicClientRequests = 0;
const visibilityClient = createFutureOrderV2PersistenceClient({
  getCurrentUser: () => ({
    uid: OWNER_UID,
    isAnonymous: false,
    getIdToken: async () => "public-token",
  }),
  fetch: async () => {
    publicClientRequests += 1;
    return {
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ status: "created", value: publicClientEnvelope.value }),
    };
  },
});
assert.equal(
  (await visibilityClient.persist({
    masterOrder: publicClientOrder,
    customerOwnerUid: OWNER_UID,
    privateBatchCapabilityFactory: {
      captureDiscoveryAnchor: () => ({
        authSessionId: 1,
        discoveryLifecycleId: 1,
        uid: OWNER_UID,
      }),
      ensurePostRefreshCapability: async () => undefined,
    },
    resolvePersonalizedGroupAuthority: () => ({
      status: "FINAL_PUBLIC" as const,
      visibility: "PUBLIC" as const,
      discoveryLifecycleId: 2,
    }),
  })).status,
  "created",
);
assert.equal(publicClientRequests, 1, "PUBLIC group persistence must not require private access.");
await assert.rejects(
  visibilityClient.persist({
    masterOrder: publicClientOrder,
    customerOwnerUid: OWNER_UID,
    privateBatchCapabilityFactory: {
      captureDiscoveryAnchor: () => ({
        authSessionId: 1,
        discoveryLifecycleId: 1,
        uid: OWNER_UID,
      }),
      ensurePostRefreshCapability: async () => undefined,
    },
    resolvePersonalizedGroupAuthority: () => ({
      status: "FINAL_MISSING" as const,
      discoveryLifecycleId: 2,
    }),
  }),
  (error: unknown) =>
    error instanceof FutureOrderV2PersistenceClientError &&
    error.code === "PRIVATE_BATCH_UNAUTHORIZED",
);
assert.equal(publicClientRequests, 1, "UNKNOWN group visibility must fail before HTTP.");

// The post-refresh descriptor also remains a continuation guard after each
// later network boundary: receiving a response or parsing its JSON cannot
// publish a result from a revoked PRIVATE session.
for (const boundary of ["response", "json"] as const) {
  let capabilityCurrent = true;
  const responseGate = deferred<{
    ok: boolean;
    status: number;
    headers: Headers;
    json(): Promise<unknown>;
  }>();
  const jsonGate = deferred<unknown>();
  const jsonStarted = deferred<void>();
  const fetchStarted = deferred<void>();
  let requests = 0;
  const boundaryClient = createFutureOrderV2PersistenceClient({
    getCurrentUser: () => ({
      uid: OWNER_UID,
      isAnonymous: false,
      getIdToken: async () => "post-refresh-token",
    }),
    fetch: async () => {
      requests += 1;
      fetchStarted.resolve();
      if (boundary === "response") return responseGate.promise;
      return {
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          jsonStarted.resolve();
          return jsonGate.promise;
        },
      };
    },
  });
  const pending = boundaryClient.persist({
    masterOrder: privateClientOrder,
    customerOwnerUid: OWNER_UID,
    resolvePersonalizedGroupAuthority: () => ({
      status: "FINAL_PRIVATE" as const,
      visibility: "PRIVATE" as const,
      discoveryLifecycleId: 2,
    }),
    privateBatchCapabilityFactory: {
      captureDiscoveryAnchor: () => ({
        authSessionId: 1,
        discoveryLifecycleId: 1,
        uid: OWNER_UID,
      }),
      ensurePostRefreshCapability: async () => ({
        generation: 200,
        discoveryLifecycleId: 2,
        uid: OWNER_UID,
        orderType: "Group Organizer",
        batchId: "private_batch_123456",
        isCurrent: () => capabilityCurrent,
      }),
    },
  });
  if (boundary === "response") {
    await fetchStarted.promise;
    capabilityCurrent = false;
    responseGate.resolve({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ status: "created", value: privateClientEnvelope.value }),
    });
  } else {
    await jsonStarted.promise;
    capabilityCurrent = false;
    jsonGate.resolve({ status: "created", value: privateClientEnvelope.value });
  }
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof FutureOrderV2PersistenceClientError &&
      error.code === "PRIVATE_BATCH_UNAUTHORIZED",
    `${boundary} boundary`,
  );
  assert.equal(requests, 1, `${boundary} test must reach its later boundary.`);
}

const clientSource = readFileSync(
  "src/services/futureOrderV2Persistence.ts",
  "utf8",
);
assert.doesNotMatch(clientSource, /firebase\/firestore|runTransaction|\bdoc\(/);
assert.match(clientSource, /getIdToken\(true\)/);
assert.match(clientSource, /persist-future-order-v2/);

console.log(
  "PASS: future order V2 server authority, HTTP boundary, and client transport",
);
