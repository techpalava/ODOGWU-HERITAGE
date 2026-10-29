import assert from "node:assert/strict";
import {
  createPrivateBatch,
  type PrivateBatchCreationRecord,
} from "./src/services/privateBatchService";

/**
 * Regression: Create Private Batch UI marks Description optional and the
 * service writes "". Firestore rules must allow empty description
 * (hasOptionalPrivateBatchText); whitespace-only stays rejected.
 * Needle: data-private-batch-create-empty-description-ok="v1"
 */
const writes: PrivateBatchCreationRecord[] = [];

const created = await createPrivateBatch({
  input: {
    batchName: "QA Empty Description Batch",
    occasion: "Family reunion",
    description: undefined,
    country: "Netherlands",
    city: "Amsterdam",
    preferredDeliveryMonth: "2027-02",
    expectedParticipants: 10,
    maxParticipants: 300,
    organizerName: "Organizer A",
    closingDate: "2027-01-20",
    deliveryWindow: "2027-02",
    status: "OPEN",
  },
  limits: { minParticipantsRequired: 10, maxParticipantsAllowed: 300 },
  dependencies: {
    getAuthenticatedUid: () => "owner-a",
    createCanonicalGroupId: () => "private_empty_desc_create_01",
    write: async (_id, record) => {
      writes.push(record);
    },
    serverTimestamp: () => "server-time",
  },
});

assert.equal(writes.length, 1);
assert.equal(writes[0]?.description, "");
assert.equal(created.groupId, "private_empty_desc_create_01");
assert.equal(created.orderContext.batchVisibility, "PRIVATE");
assert.equal(created.orderContext.batchName, "QA Empty Description Batch");

console.log("test_private_batch_create_empty_description: ok");
