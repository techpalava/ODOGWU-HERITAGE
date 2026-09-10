import assert from "node:assert/strict";
import {
  createFutureOrderV2HistoryClient,
} from "./src/services/futureOrderV2History";
import {
  lookupFutureOrderV2UploadedSourceHistory,
  type FutureOrderV2HistoryAdapter,
} from "./src/server/futureOrderV2History";
import { createFutureOrderV2HistoryHandler } from "./src/server/futureOrderV2HistoryHttp";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const OWNER_UID = "history-owner";
const OTHER_UID = "other-owner";
const sourceRef = "shared-uploaded-source-ref";

const record = (orderId: string, ownerUid = OWNER_UID) => {
  const created = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: ownerUid, isAnonymous: false },
    customerOwnerUid: ownerUid,
    persistedAt: "2026-09-05T12:00:00.000Z",
  });
  assert.equal(created.status, "valid");
  if (created.status !== "valid") throw new Error("Expected persisted V2 fixture.");
  return created.value;
};

class OwnerHistory implements FutureOrderV2HistoryAdapter {
  requestedOwners: string[] = [];
  constructor(private readonly recordsByOwner: Readonly<Record<string, readonly unknown[]>>) {}
  async listCompleteOwnerHistory(ownerUid: string): Promise<readonly unknown[]> {
    this.requestedOwners.push(ownerUid);
    return this.recordsByOwner[ownerUid] || [];
  }
}

const ownerRecords = [record("history-one"), record("history-two")];
const adapter = new OwnerHistory({ [OWNER_UID]: ownerRecords, [OTHER_UID]: [record("other-history", OTHER_UID)] });
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: sourceRef, adapter,
  }),
  "referenced",
);
assert.equal(adapter.requestedOwners[0], OWNER_UID);
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: "absent-source", adapter,
  }),
  "not_referenced",
);
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: sourceRef,
    adapter: new OwnerHistory({ [OWNER_UID]: [{ schemaVersion: 2, recordType: "future_order_v2" }] }),
  }),
  "unknown",
);
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: sourceRef,
    adapter: new OwnerHistory({ [OWNER_UID]: [{ id: "legacy-order" }] }),
  }),
  "unknown",
);
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: sourceRef,
    adapter: new OwnerHistory({}),
  }),
  "not_referenced",
);
assert.equal(
  await lookupFutureOrderV2UploadedSourceHistory({
    identity: { uid: OWNER_UID, isAnonymous: false }, uploadedSourceRef: sourceRef,
    adapter: { async listCompleteOwnerHistory() { throw new Error("query unavailable"); } },
  }),
  "unknown",
);

type ResponseState = { status: number; headers: Record<string, string>; body: unknown };
const response = () => {
  const state: ResponseState = { status: 200, headers: {}, body: undefined };
  const value: HttpResponse = {
    status(code) { state.status = code; return value; },
    setHeader(name, content) { state.headers[name.toLowerCase()] = content; return value; },
    json(body) { state.body = body; return body; },
  };
  return { state, value };
};
const request = (authorization?: string): HttpRequest => ({
  method: "POST", headers: authorization ? { authorization } : {}, body: { uploadedSourceRef: sourceRef },
});
const handler = createFutureOrderV2HistoryHandler({
  getServices: () => ({
    auth: { async verifyIdToken(token) {
      if (token === "anonymous") return { uid: OWNER_UID, firebase: { sign_in_provider: "anonymous" } };
      return { uid: OWNER_UID, firebase: { sign_in_provider: "password" } };
    } },
    db: null,
  }),
  createAdapter: () => adapter,
});
const missingToken = response();
await handler(request(), missingToken.value);
assert.equal(missingToken.state.status, 401);
const anonymous = response();
await handler(request("Bearer anonymous"), anonymous.value);
assert.equal(anonymous.state.status, 403);
const isolated = response();
await handler(request("Bearer valid"), isolated.value);
assert.deepEqual(isolated.state.body, { status: "referenced" });
assert.equal(JSON.stringify(isolated.state.body).includes(OTHER_UID), false);

const unavailableClient = createFutureOrderV2HistoryClient({
  getCurrentUser: () => ({ isAnonymous: false, getIdToken: async () => "token" }),
  fetch: async () => { throw new Error("transport unavailable"); },
});
assert.equal(await unavailableClient.getSafetyStatus(sourceRef), "unknown");
const referencedClient = createFutureOrderV2HistoryClient({
  getCurrentUser: () => ({ isAnonymous: false, getIdToken: async () => "token" }),
  fetch: async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ status: "referenced" }) }),
});
assert.equal(await referencedClient.getSafetyStatus(sourceRef), "retain");

console.log("PASS: Task 5F-F2 authorized V2 order history lookup");
