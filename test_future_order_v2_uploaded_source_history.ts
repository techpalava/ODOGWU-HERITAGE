import assert from "node:assert/strict";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { inspectFutureOrderV2UploadedSourceHistory } from "./src/utils/futureOrderV2History";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const createRecord = (orderId: string) => {
  const result = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: "history-owner", isAnonymous: false },
    customerOwnerUid: "history-owner",
    persistedAt: "2026-09-05T12:00:00.000Z",
  });
  assert.equal(result.status, "valid");
  if (result.status !== "valid") throw new Error("Expected persisted V2 fixture.");
  return result.value;
};

const first = createRecord("future-history-reference-one");
const second = createRecord("future-history-reference-two");
const referenced = inspectFutureOrderV2UploadedSourceHistory({
  records: [{ id: first.orderId, ...first }, second, { id: "legacy-order" }],
  uploadedSourceRef: "shared-uploaded-source-ref",
});
assert.equal(referenced.status, "referenced");
if (referenced.status !== "referenced") throw new Error("Expected historical references.");
assert.equal(referenced.references.length, 4);
assert.deepEqual(
  referenced.references.map((reference) => reference.orderId),
  [first.orderId, first.orderId, second.orderId, second.orderId],
);
assert.ok(referenced.references.every((reference) => reference.style.kind === "uploaded"));

assert.deepEqual(
  inspectFutureOrderV2UploadedSourceHistory({
    records: [first, second],
    uploadedSourceRef: "unreferenced-uploaded-source",
  }),
  { status: "not_referenced", uploadedSourceRef: "unreferenced-uploaded-source" },
);
assert.equal(
  inspectFutureOrderV2UploadedSourceHistory({
    records: [{ schemaVersion: 2, recordType: "future_order_v2" }],
    uploadedSourceRef: "shared-uploaded-source-ref",
  }).status,
  "invalid_history",
);
assert.equal(
  inspectFutureOrderV2UploadedSourceHistory({
    records: [first],
    uploadedSourceRef: "not/a-canonical-reference",
  }).status,
  "invalid_history",
);

console.log("PASS: Task 5F-F V2 uploaded source historical reference authority");
