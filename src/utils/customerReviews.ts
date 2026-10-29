import type { CustomerReview } from "../types";
import {
  NATIONALITY_CODE_PATTERN,
  isNationalityCode,
  nationalityLabel,
} from "./nationalityOptions";

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
  "nationality",
  "secondNationality",
  "body",
  "rating",
  "status",
  "featured",
  "displayOrder",
  "createdAt",
  "createdByUid",
  "photoPath",
  "photoContentType",
  "photoSizeBytes",
  "photoConsent",
  "photoStatus",
] as const;

// --- Optional "wearing it" photo ------------------------------------------

export const CUSTOMER_REVIEW_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type CustomerReviewPhotoType = (typeof CUSTOMER_REVIEW_PHOTO_TYPES)[number];

export const CUSTOMER_REVIEW_PHOTO_LIMITS = {
  /** Largest file a customer may pick, before on-device compression. */
  maxBytes: 5 * 1024 * 1024,
  /** Longest side after compression. */
  maxDimension: 1600,
} as const;

/** Private upload folder; storage.rules lets only admins read it. */
export const CUSTOMER_REVIEW_PHOTO_ROOT = "customer-review-photos";

export const CUSTOMER_REVIEW_PHOTO_CONSENT_LABEL =
  "I agree ODOGWU may show this photo publicly with my review.";

export interface CustomerReviewPhotoRecord {
  path: string;
  contentType: CustomerReviewPhotoType;
  sizeBytes: number;
}

export function isCustomerReviewPhotoType(
  value: unknown,
): value is CustomerReviewPhotoType {
  return (
    typeof value === "string" &&
    (CUSTOMER_REVIEW_PHOTO_TYPES as readonly string[]).includes(value)
  );
}

/** Checks a picked file before compression; returns an error message or null. */
export function validateCustomerReviewPhotoFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!isCustomerReviewPhotoType(file.type)) {
    return "Please choose a JPEG, PNG or WebP photo.";
  }
  if (file.size > CUSTOMER_REVIEW_PHOTO_LIMITS.maxBytes) {
    return "That photo is larger than 5 MB. Please choose a smaller one.";
  }
  if (file.size <= 0) {
    return "That photo looks empty. Please choose another one.";
  }
  return null;
}

/** Consent is required only when a photo is attached. */
export function validateCustomerReviewPhotoConsent(
  hasPhoto: boolean,
  consent: boolean,
): string | null {
  return hasPhoto && !consent
    ? "Please tick the box to agree we may show your photo, or remove the photo."
    : null;
}

export function customerReviewPhotoExtension(
  contentType: CustomerReviewPhotoType,
): "jpg" | "png" | "webp" {
  return contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/png"
      ? "png"
      : "webp";
}

/** customer-review-photos/{uid}/{reviewId}/photo.{ext}; mirrors storage.rules. */
export function buildCustomerReviewPhotoPath(
  uid: string,
  reviewId: string,
  contentType: CustomerReviewPhotoType,
): string {
  return `${CUSTOMER_REVIEW_PHOTO_ROOT}/${uid}/${reviewId}/photo.${customerReviewPhotoExtension(contentType)}`;
}

/** Public copy written when an admin approves the photo. */
export function buildApprovedCustomerReviewPhotoPath(reviewId: string): string {
  return `communityPhotos/reviews/${reviewId}.webp`;
}

/** Fields a guest create adds for a photo; it always starts "pending". */
export function buildCustomerReviewPhotoFields(photo: CustomerReviewPhotoRecord) {
  return {
    photoPath: photo.path,
    photoContentType: photo.contentType,
    photoSizeBytes: photo.sizeBytes,
    photoConsent: true as const,
    photoStatus: "pending" as const,
  };
}

/** Reads the optional photo fields; older reviews carry none. */
export function normalizeReviewPhoto(
  raw: Record<string, unknown>,
): Partial<
  Pick<
    CustomerReview,
    | "photoPath"
    | "photoContentType"
    | "photoSizeBytes"
    | "photoConsent"
    | "photoStatus"
    | "photoUrl"
  >
> {
  if (typeof raw.photoPath !== "string" || !raw.photoPath) return {};
  const status =
    raw.photoStatus === "approved" || raw.photoStatus === "pending"
      ? raw.photoStatus
      : undefined;
  const url =
    typeof raw.photoUrl === "string" && raw.photoUrl ? raw.photoUrl : undefined;
  return {
    photoPath: raw.photoPath,
    ...(isCustomerReviewPhotoType(raw.photoContentType)
      ? { photoContentType: raw.photoContentType }
      : {}),
    ...(typeof raw.photoSizeBytes === "number" && Number.isFinite(raw.photoSizeBytes)
      ? { photoSizeBytes: raw.photoSizeBytes }
      : {}),
    photoConsent: raw.photoConsent === true,
    ...(status ? { photoStatus: status } : {}),
    ...(url ? { photoUrl: url } : {}),
  };
}

/** Public surfaces show a photo only after an admin approved it. */
export function approvedReviewPhotoUrl(
  review: Pick<CustomerReview, "photoStatus" | "photoUrl">,
): string | null {
  return review.photoStatus === "approved" && review.photoUrl
    ? review.photoUrl
    : null;
}

export function hasPendingReviewPhoto(
  review: Pick<CustomerReview, "photoStatus" | "photoPath">,
): boolean {
  return review.photoStatus === "pending" && Boolean(review.photoPath);
}

export function filterReviewsWithPendingPhotos(
  reviews: readonly CustomerReview[],
): CustomerReview[] {
  return reviews.filter(hasPendingReviewPhoto);
}

export type CustomerReviewRating = CustomerReview["rating"];

export interface CustomerReviewInput {
  authorName: string;
  location?: string;
  /** ISO code from NATIONALITY_OPTIONS; "" means "Prefer not to say". */
  nationality?: string;
  secondNationality?: string;
  body: string;
  rating: number;
}

export type CustomerReviewValidation =
  | {
      ok: true;
      value: {
        authorName: string;
        location?: string;
        nationality?: string;
        secondNationality?: string;
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
    rating: 5,
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

/** Trims and upper-cases a nationality value; anything else becomes "". */
export function normalizeNationalityCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Reads the optional nationality pair from a stored document. Older reviews
 * carry neither field. A second nationality is kept only beside a valid,
 * different first one.
 */
export function normalizeReviewNationalities(raw: Record<string, unknown>): {
  nationality?: string;
  secondNationality?: string;
} {
  const first = normalizeNationalityCode(raw.nationality);
  if (!NATIONALITY_CODE_PATTERN.test(first)) return {};
  const second = normalizeNationalityCode(raw.secondNationality);
  return NATIONALITY_CODE_PATTERN.test(second) && second !== first
    ? { nationality: first, secondNationality: second }
    : { nationality: first };
}

/** Country names for display, e.g. "Nigeria / United Kingdom"; "" when unset. */
export function formatReviewNationalities(
  review: Pick<CustomerReview, "nationality" | "secondNationality">,
): string {
  if (!review.nationality) return "";
  return [review.nationality, review.secondNationality]
    .filter((code): code is string => Boolean(code))
    .map((code) => nationalityLabel(code))
    .join(" / ");
}

/** Location then nationalities, e.g. "Lagos · Nigeria / United Kingdom". */
export function formatReviewOrigin(
  review: Pick<CustomerReview, "location" | "nationality" | "secondNationality">,
): string {
  return [review.location?.trim(), formatReviewNationalities(review)]
    .filter(Boolean)
    .join(" · ");
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
    ...normalizeReviewNationalities(raw),
    ...normalizeReviewPhoto(raw),
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

/**
 * Display-only fallback: once Firestore has loaded and holds no published
 * reviews, show the three starter reviews. This never writes to Firestore;
 * admins persist the seeds with "Add starter reviews".
 */
/** How long the Reviews page waits for live reviews before showing starters. */
export const REVIEWS_LOADING_TIMEOUT_MS = 6000;

export function resolvePublishedReviewsForDisplay(
  published: readonly CustomerReview[],
  hasLoaded: boolean,
): CustomerReview[] {
  const visible = filterPublishedReviews(published);
  return hasLoaded && visible.length === 0 ? SEED_CUSTOMER_REVIEWS : visible;
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
  const nationality = normalizeNationalityCode(input.nationality);
  const secondNationality = normalizeNationalityCode(input.secondNationality);
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
  if (nationality && !isNationalityCode(nationality)) {
    return { ok: false, error: "Please choose a nationality from the list." };
  }
  if (secondNationality) {
    if (!nationality) {
      return {
        ok: false,
        error: "Please choose your first nationality before adding a second.",
      };
    }
    if (!isNationalityCode(secondNationality)) {
      return {
        ok: false,
        error: "Please choose a second nationality from the list.",
      };
    }
    if (secondNationality === nationality) {
      return {
        ok: false,
        error: "Your second nationality must be different from the first.",
      };
    }
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
      ...(nationality ? { nationality } : {}),
      ...(secondNationality ? { secondNationality } : {}),
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
    ...(value.nationality ? { nationality: value.nationality } : {}),
    ...(value.nationality && value.secondNationality
      ? { secondNationality: value.secondNationality }
      : {}),
    body: value.body,
    rating: value.rating,
    status: "published" as const,
    featured: false,
    displayOrder: 0,
    createdAt,
    createdByUid,
  };
}
