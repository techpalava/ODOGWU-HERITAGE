import assert from "node:assert/strict";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import {
  dropMatchingFutureOrderV2CartItems,
  isReviewableFutureOrderV2CandidateForCart,
  mergeFutureOrderV2CartBags,
  parkReviewableFutureOrderV2Candidate,
  sanitizeFutureOrderV2CartItems,
} from "./src/utils/futureOrderV2CartBag";
import { getFutureOrderV2CandidateFingerprint } from "./src/utils/futureOrderV2Preparation";

const candidate = createFutureOrderV2Fixture("cart-bag").cartItem.candidate;
assert.equal(isReviewableFutureOrderV2CandidateForCart(candidate), true);

const parked = parkReviewableFutureOrderV2Candidate({
  candidate,
  items: [],
  createCartItemId: () => "future-cart-parked-1",
});
assert.equal(parked.status, "added");
if (parked.status !== "added") throw new Error("Expected add.");
assert.equal(parked.cartItemId, "future-cart-parked-1");
assert.equal(parked.items.length, 1);
assert.equal(parked.items[0]?.candidate.contentStatus, "reviewable");

const duplicate = parkReviewableFutureOrderV2Candidate({
  candidate,
  items: parked.items,
  createCartItemId: () => "future-cart-parked-2",
});
assert.equal(duplicate.status, "already_present");
if (duplicate.status !== "already_present") {
  throw new Error("Expected duplicate park to keep the first cart item.");
}
assert.equal(duplicate.cartItemId, "future-cart-parked-1");
assert.equal(duplicate.items.length, 1);

const blocked = parkReviewableFutureOrderV2Candidate({
  candidate: { ...candidate, contentStatus: "blocked" },
  items: [],
});
assert.equal(blocked.status, "blocked");
if (blocked.status !== "blocked") throw new Error("Expected blocked park.");
assert.equal(blocked.reason, "not_reviewable");
assert.equal(blocked.items.length, 0);

const sanitized = sanitizeFutureOrderV2CartItems([
  parked.items[0],
  { schemaVersion: 1, cartItemId: "bad" },
  null,
]);
assert.equal(sanitized.length, 1);
assert.equal(sanitized[0]?.cartItemId, "future-cart-parked-1");

const other = createFutureOrderV2Fixture(
  "cart-bag-other",
  "Royal Senator",
).cartItem.candidate;
const guestPark = parkReviewableFutureOrderV2Candidate({
  candidate: other,
  items: [],
  createCartItemId: () => "future-cart-guest",
});
assert.equal(guestPark.status, "added");
if (guestPark.status !== "added") throw new Error("Expected guest add.");

const merged = mergeFutureOrderV2CartBags({
  accountItems: parked.items,
  guestItems: [...parked.items, ...guestPark.items],
});
assert.equal(merged.items.length, 2);
assert.equal(merged.addedItemCount, 1);
assert.equal(
  getFutureOrderV2CandidateFingerprint(merged.items[0]!.candidate),
  getFutureOrderV2CandidateFingerprint(candidate),
);

const droppedPaid = dropMatchingFutureOrderV2CartItems({
  items: merged.items,
  candidate,
});
assert.equal(droppedPaid.length, 1);
assert.equal(droppedPaid[0]?.cartItemId, "future-cart-guest");

const droppedById = dropMatchingFutureOrderV2CartItems({
  items: merged.items,
  cartItemId: "future-cart-guest",
});
assert.equal(droppedById.length, 1);
assert.equal(droppedById[0]?.cartItemId, "future-cart-parked-1");

console.log("test_future_order_v2_cart_bag: ok");
