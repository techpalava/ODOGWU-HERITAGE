import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CustomerReview } from "./src/types";
import {
  CUSTOMER_REVIEW_CREATE_KEYS,
  CUSTOMER_REVIEW_FEATURED_CAP,
  SEED_CUSTOMER_REVIEWS,
  buildCustomerReviewCreatePayload,
  canFeatureReview,
  clampRating,
  filterPublishedReviews,
  isValidRating,
  normalizeCustomerReview,
  selectSliderReviews,
  validateCustomerReviewInput,
} from "./src/utils/customerReviews";

function review(
  id: string,
  overrides: Partial<CustomerReview> = {},
): CustomerReview {
  return {
    id,
    authorName: `Author ${id}`,
    body: "A lovely heritage outfit, beautifully made.",
    rating: 5,
    status: "published",
    featured: false,
    displayOrder: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdByUid: null,
    ...overrides,
  };
}

// Rating clamp
assert.equal(clampRating(0), 1);
assert.equal(clampRating(-3), 1);
assert.equal(clampRating(9), 5);
assert.equal(clampRating(3.4), 3);
assert.equal(clampRating(4.6), 5);
assert.equal(clampRating("4"), 4);
assert.equal(clampRating(Number.NaN), 1);
assert.equal(clampRating(undefined), 1);
assert.equal(isValidRating(3), true);
assert.equal(isValidRating(0), false);
assert.equal(isValidRating(6), false);
assert.equal(isValidRating(3.5), false);
assert.equal(isValidRating("3"), false);
assert.equal(normalizeCustomerReview("x", { rating: 12 }).rating, 5);
assert.equal(normalizeCustomerReview("x", { rating: -1 }).rating, 1);
assert.equal(normalizeCustomerReview("x", { status: "weird" }).status, "hidden");
assert.equal(
  normalizeCustomerReview("x", { createdAt: { toMillis: () => 0 } }).createdAt,
  "",
);
assert.equal(
  normalizeCustomerReview("x", { createdAt: { seconds: 1_790_000_000 } })
    .createdAt,
  new Date(1_790_000_000_000).toISOString(),
);

// Published filter
const mixed = [
  review("a"),
  review("b", { status: "hidden" }),
  review("c"),
];
assert.deepEqual(
  filterPublishedReviews(mixed).map((r) => r.id),
  ["a", "c"],
);

// Featured cap
const threeFeatured = [
  review("f1", { featured: true }),
  review("f2", { featured: true }),
  review("f3", { featured: true, status: "hidden" }),
  review("n1"),
];
assert.equal(CUSTOMER_REVIEW_FEATURED_CAP, 3);
assert.equal(canFeatureReview(threeFeatured, "n1"), false);
assert.equal(canFeatureReview(threeFeatured, "f1"), true, "already featured");
assert.equal(canFeatureReview(threeFeatured.slice(0, 2), "n1"), true);

// Slider selection
const pool = [
  review("old", { createdAt: "2026-01-01T00:00:00.000Z" }),
  review("new", { createdAt: "2026-09-01T00:00:00.000Z" }),
  review("mid", { createdAt: "2026-05-01T00:00:00.000Z" }),
  review("hidden-new", {
    status: "hidden",
    createdAt: "2026-10-05T00:00:00.000Z",
  }),
];
assert.deepEqual(
  selectSliderReviews(pool).map((r) => r.id),
  ["new", "mid", "old"],
  "no featured: newest published first",
);
assert.deepEqual(
  selectSliderReviews([
    ...pool,
    review("feat-2", { featured: true, displayOrder: 2 }),
    review("feat-1", { featured: true, displayOrder: 1 }),
    review("feat-hidden", { featured: true, status: "hidden", displayOrder: 0 }),
  ]).map((r) => r.id),
  ["feat-1", "feat-2", "new"],
  "featured by displayOrder, then newest fills",
);
assert.deepEqual(
  selectSliderReviews([
    review("f4", { featured: true, displayOrder: 4 }),
    review("f3", { featured: true, displayOrder: 3 }),
    review("f2", { featured: true, displayOrder: 2 }),
    review("f1", { featured: true, displayOrder: 1 }),
  ]).map((r) => r.id),
  ["f1", "f2", "f3"],
);
assert.deepEqual(selectSliderReviews([]), []);

// Seeds
assert.equal(SEED_CUSTOMER_REVIEWS.length, 3);
for (const seed of SEED_CUSTOMER_REVIEWS) {
  assert.equal(seed.status, "published");
  assert.equal(seed.featured, true);
  assert.ok(seed.rating >= 4 && seed.rating <= 5);
}

// Form validation and create payload
assert.equal(
  validateCustomerReviewInput({ authorName: " ", body: "x".repeat(20), rating: 5 })
    .ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "short", rating: 5 }).ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "x".repeat(1001), rating: 5 })
    .ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "x".repeat(20), rating: 0 })
    .ok,
  false,
);
const valid = validateCustomerReviewInput({
  authorName: "  Ada O. ",
  location: "   ",
  body: "  Beautiful agbada, perfect fit.  ",
  rating: 4,
});
assert.ok(valid.ok);
if (valid.ok) {
  assert.deepEqual(valid.value, {
    authorName: "Ada O.",
    body: "Beautiful agbada, perfect fit.",
    rating: 4,
  });
  const payload = buildCustomerReviewCreatePayload(valid.value, null, "ts");
  assert.equal(payload.status, "published");
  assert.equal(payload.featured, false);
  assert.equal(payload.displayOrder, 0);
  assert.equal("location" in payload, false);
  for (const key of Object.keys(payload)) {
    assert.ok(
      (CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes(key),
      `unexpected create key ${key}`,
    );
  }
}

// The client create allowlist must match the rules allowlist exactly.
const rules = readFileSync("firestore.rules", "utf8");
const hasOnly = rules.match(
  /function hasValidCustomerReviewCreate\(data\) \{[\s\S]*?data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/,
);
assert.ok(hasOnly, "customer review create rule must use hasOnly");
const ruleKeys = hasOnly[1]
  .split(",")
  .map((key) => key.trim().replace(/"/g, ""))
  .filter(Boolean)
  .sort();
assert.deepEqual(ruleKeys, [...CUSTOMER_REVIEW_CREATE_KEYS].sort());

console.log("PASS: customer reviews helpers");
