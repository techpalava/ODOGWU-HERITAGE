import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { presentFutureOrderV2History } from "./src/utils/futureOrderV2History";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const masterOrder = createFutureOrderV2Fixture(
  "future-history-presentation",
  "Classic Senator at Submission",
);
const persisted = createPersistedFutureOrderV2({
  masterOrder,
  owner: { uid: "history-owner", isAnonymous: false },
  customerOwnerUid: "history-owner",
  persistedAt: "2026-09-05T12:00:00.000Z",
});
assert.equal(persisted.status, "valid");
if (persisted.status !== "valid") throw new Error("Expected persisted V2 fixture.");

const presentation = presentFutureOrderV2History({
  id: masterOrder.orderId,
  ...persisted.value,
});
assert.equal(presentation.status, "valid");
if (presentation.status !== "valid") throw new Error("Expected V2 history presentation.");
assert.equal(presentation.value.orderId, masterOrder.orderId);
assert.deepEqual(
  presentation.value.occurrences.map((occurrence) => [
    occurrence.garmentLabel,
    occurrence.style.kind === "catalogue"
      ? occurrence.style.name
      : occurrence.style.displayLabel,
  ]),
  [
    ["Shirt", "Classic Senator at Submission"],
    ["Shirt 2", "Shared Uploaded Design"],
    ["Shirt 3", "Shared Uploaded Design"],
  ],
);
assert.equal(presentation.value.occurrences[0]?.style.kind, "catalogue");
assert.equal(
  presentation.value.occurrences[0]?.style.kind === "catalogue" &&
    presentation.value.occurrences[0].style.image,
  "https://example.test/base:shirt.jpg",
);
assert.equal(presentation.value.occurrences[1]?.style.kind, "uploaded");
assert.equal(
  presentation.value.occurrences[1]?.style.kind === "uploaded" &&
    presentation.value.occurrences[1].style.uploadedSourceRef,
  "shared-uploaded-source-ref",
);

const malformed = presentFutureOrderV2History({
  ...persisted.value,
  masterOrder: { ...persisted.value.masterOrder, orderId: "different-order" },
});
assert.equal(malformed.status, "invalid_history");
assert.equal(presentFutureOrderV2History({ id: "legacy" }).status, "not_v2");
assert.deepEqual(presentation.value.monogramLines, []);

const monogramDetail = {
  occurrenceKey: "base:shirt:decorative:Name Monogram",
  garmentKey: "base:shirt",
  garmentLabel: "Shirt",
  selectionGroup: "order_optional_detail",
  selectionGroupTitle: "Monogram and Embroidery",
  optionId: "Name Monogram",
  optionLabel: "Name Monogram",
  priceStatus: "exact" as const,
  priceCents: 1200,
  personalizedText: "ADEBAYO",
  monogramPlacementLabel: "Left Chest",
  snapshot: null,
};
const withMonogram = {
  ...persisted.value,
  masterOrder: {
    ...persisted.value.masterOrder,
    cartItem: {
      ...persisted.value.masterOrder.cartItem,
      candidate: {
        ...persisted.value.masterOrder.cartItem.candidate,
        customDetails: [
          ...persisted.value.masterOrder.cartItem.candidate.customDetails,
          monogramDetail,
        ],
      },
    },
  },
};
const monogramPresentation = presentFutureOrderV2History({
  id: masterOrder.orderId,
  ...withMonogram,
});
assert.equal(monogramPresentation.status, "valid");
if (monogramPresentation.status !== "valid") {
  throw new Error("Expected the monogram history presentation.");
}
assert.deepEqual(monogramPresentation.value.monogramLines, [
  {
    garmentKey: "base:shirt",
    garmentLabel: "Shirt",
    text: "ADEBAYO",
    placementLabel: "Left Chest",
  },
]);

const adminSource = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.match(adminSource, /presentFutureOrderV2History/);
assert.match(adminSource, /data-future-order-v2-occurrences/);
assert.match(adminSource, /data-admin-v2-monogram-name/);
assert.match(adminSource, /Submitted V2 snapshot/);
assert.match(adminSource, /Read-only/);

console.log("PASS: Task 5F-F V2 Admin history presentation");
