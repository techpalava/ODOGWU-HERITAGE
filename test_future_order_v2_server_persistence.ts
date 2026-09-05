import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createFutureOrderV2PersistenceClient,
  FutureOrderV2PersistenceClientError,
} from "./src/services/futureOrderV2Persistence";
import {
  FutureOrderV2ServerError,
  persistFutureOrderV2ForVerifiedIdentity,
} from "./src/server/futureOrderV2Persistence";
import { createFutureOrderV2PersistenceHandler } from "./src/server/futureOrderV2PersistenceHttp";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import {
  createPersistedFutureOrderV2,
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
  readonly creates: string[] = [];

  async runTransaction<T>(
    operation: (transaction: FutureOrderV2PersistenceTransaction) => Promise<T>,
  ): Promise<T> {
    const pending = new Map<string, PersistedFutureOrderV2>();
    const result = await operation({
      get: async (orderId) => this.values.get(orderId) ?? null,
      create: (orderId, value) => {
        if (this.values.has(orderId) || pending.has(orderId)) {
          throw new Error("create-only collision");
        }
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

const identical = await persist(adapter, "server-order-1");
assert.equal(identical.status, "already_persisted");
assert.equal(adapter.creates.length, 1);
assert.deepEqual(adapter.values.get("server-order-1"), original);

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
