import type { CustomerReview } from "../types";

export const CUSTOMER_REVIEWS_COLLECTION = "customer_reviews";
export const CUSTOMER_REVIEW_FEATURED_CAP = 3;
export const CUSTOMER_REVIEW_SLIDER_SIZE = 3;

export const CUSTOMER_REVIEW_LIMITS = {
  authorNameMin: 2,
  authorNameMax: 60,
  locationMax: 80,
  bodyMin: 10,
  bodyMax: 1000,
} as const;

/** Every field a guest create may carry. Mirrors firestore.rules. */
export const CUSTOMER_REVIEW_CREATE_KEYS = [
  "authorName",
  "location",
  "body",
  "rating",
  "status",
  "featured",
  "displayOrder",
  "createdAt",
  "createdByUid",
] as const;

export type CustomerReviewRating = CustomerReview["rating"];

export interface CustomerReviewInput {
  authorName: string;
  location?: string;
  body: string;
  rating: number;
}

export type CustomerReviewValidation =
  | {
      ok: true;
      value: {
        authorName: string;
        location?: string;
        body: string;
        rating: CustomerReviewRating;
      };
    }
  | { ok: false; error: string };

export const SEED_CUSTOMER_REVIEWS: CustomerReview[] = [
  {
    id: "seed-review-1",
    authorName: "Chiamaka N.",
    location: "Eindhoven",
    body: "Wearing my outfit to a family wedding felt like carrying a piece of home with me. The embroidery is careful and the fabric feels rich.",
    rating: 5,
    status: "published",
    featured: true,
    displayOrder: 1,
    createdAt: "2026-10-01T09:00:00.000Z",
    createdByUid: null,
  },
  {
    id: "seed-review-2",
    authorName: "Tunde A.",
    location: "Veldhoven",
    body: "The atelier took time to get the details right, from the collar to the length of the sleeves. It fits the way traditional clothing should.",
    rating: 5,
    status: "published",
    featured: true,
    displayOrder: 2,
    createdAt: "2026-10-01T09:00:00.000Z",
    createdByUid: null,
  },
  {
    id: "seed-review-3",
    authorName: "Ngozi E.",
    location: "Netherlands",
    body: "Choosing my own fabric and style made the whole order feel personal. It is a lovely way to celebrate our heritage far from Lagos.",
    rating: 4,
    status: "published",
    featured: true,
    displayOrder: 3,
    createdAt: "2026-10-01T09:00:00.000Z",
    createdByUid: null,
  },
];

/** Coerces any value into a whole-star rating between 1 and 5. */
export function clampRating(value: unknown): CustomerReviewRating {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(5, Math.max(1, Math.round(numeric))) as CustomerReviewRating;
}

export function isValidRating(value: unknown): value is CustomerReviewRating {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

export function reviewTimestampMillis(createdAt: unknown): number {
  if (typeof createdAt === "number") return createdAt;
  if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (createdAt && typeof createdAt === "object") {
    const candidate = createdAt as {
      toMillis?: () => number;
      seconds?: number;
    };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    if (typeof candidate.seconds === "number") return candidate.seconds * 1000;
  }
  return 0;
}

/** Turns a raw Firestore document into a display-safe CustomerReview. */
export function normalizeCustomerReview(
  id: string,
  raw: Record<string, unknown>,
): CustomerReview {
  const millis = reviewTimestampMillis(raw.createdAt);
  const location =
    typeof raw.location === "string" && raw.location.trim()
      ? raw.location.trim()
      : undefined;
  return {
    id,
    authorName: typeof raw.authorName === "string" ? raw.authorName : "",
    ...(location ? { location } : {}),
    body: typeof raw.body === "string" ? raw.body : "",
    rating: clampRating(raw.rating),
    status: raw.status === "published" ? "published" : "hidden",
    featured: raw.featured === true,
    displayOrder:
      typeof raw.displayOrder === "number" && Number.isFinite(raw.displayOrder)
        ? raw.displayOrder
        : 0,
    createdAt: millis > 0 ? new Date(millis).toISOString() : "",
    createdByUid:
      typeof raw.createdByUid === "string" ? raw.createdByUid : null,
  };
}

export function filterPublishedReviews(
  reviews: readonly CustomerReview[],
): CustomerReview[] {
  return reviews.filter((review) => review.status === "published");
}

export function sortReviewsNewestFirst(
  reviews: readonly CustomerReview[],
): CustomerReview[] {
  return [...reviews].sort(
    (a, b) =>
      reviewTimestampMillis(b.createdAt) - reviewTimestampMillis(a.createdAt),
  );
}

/**
 * Homepage slider: featured published reviews by displayOrder first, then
 * the newest published reviews fill any remaining slots.
 */
export function selectSliderReviews(
  reviews: readonly CustomerReview[],
  size: number = CUSTOMER_REVIEW_SLIDER_SIZE,
): CustomerReview[] {
  const published = filterPublishedReviews(reviews);
  const featured = published
    .filter((review) => review.featured)
    .sort(
      (a, b) =>
        a.displayOrder - b.displayOrder ||
        reviewTimestampMillis(b.createdAt) - reviewTimestampMillis(a.createdAt),
    )
    .slice(0, CUSTOMER_REVIEW_FEATURED_CAP);
  const featuredIds = new Set(featured.map((review) => review.id));
  const newest = sortReviewsNewestFirst(
    published.filter((review) => !featuredIds.has(review.id)),
  );
  return [...featured, ...newest].slice(0, size);
}

export function countFeaturedReviews(
  reviews: readonly CustomerReview[],
): number {
  return reviews.filter((review) => review.featured).length;
}

/** Whether `reviewId` may be marked featured without passing the cap. */
export function canFeatureReview(
  reviews: readonly CustomerReview[],
  reviewId: string,
): boolean {
  const others = reviews.filter(
    (review) => review.featured && review.id !== reviewId,
  ).length;
  return others < CUSTOMER_REVIEW_FEATURED_CAP;
}

export function validateCustomerReviewInput(
  input: CustomerReviewInput,
): CustomerReviewValidation {
  const authorName = (input.authorName ?? "").trim();
  const location = (input.location ?? "").trim();
  const body = (input.body ?? "").trim();
  const limits = CUSTOMER_REVIEW_LIMITS;

  if (authorName.length < limits.authorNameMin) {
    return { ok: false, error: "Please enter your name." };
  }
  if (authorName.length > limits.authorNameMax) {
    return {
      ok: false,
      error: `Please keep your name under ${limits.authorNameMax} characters.`,
    };
  }
  if (location.length > limits.locationMax) {
    return {
      ok: false,
      error: `Please keep your location under ${limits.locationMax} characters.`,
    };
  }
  if (!isValidRating(input.rating)) {
    return { ok: false, error: "Please choose a star rating." };
  }
  if (body.length < limits.bodyMin) {
    return {
      ok: false,
      error: `Please write at least ${limits.bodyMin} characters.`,
    };
  }
  if (body.length > limits.bodyMax) {
    return {
      ok: false,
      error: `Please keep your review under ${limits.bodyMax} characters.`,
    };
  }
  return {
    ok: true,
    value: {
      authorName,
      ...(location ? { location } : {}),
      body,
      rating: input.rating,
    },
  };
}

/** The exact document shape a guest create writes; firestore.rules checks it. */
export function buildCustomerReviewCreatePayload<TTimestamp>(
  value: Extract<CustomerReviewValidation, { ok: true }>["value"],
  createdByUid: string | null,
  createdAt: TTimestamp,
) {
  return {
    authorName: value.authorName,
    ...(value.location ? { location: value.location } : {}),
    body: value.body,
    rating: value.rating,
    status: "published" as const,
    featured: false,
    displayOrder: 0,
    createdAt,
    createdByUid,
  };
}
