import {
  STEP8_COUNTRY_ZONE_INDEX,
  STEP8_FAKE_COUNTRY_CODE_SENTINELS,
  formatStep8CountryLabel,
} from "../config/Step8AdditionalDeliveryConfig.js";

/**
 * Site feedback: pure helpers shared by the floating Feedback button, its
 * Firestore write, and test_site_feedback.tsx. Field names and limits mirror
 * `hasValidSiteFeedbackCreate` in firestore.rules.
 */

export const SITE_FEEDBACK_COLLECTION = "site_feedback";

/** v2 adds the optional nationality and photo fields. The rules accept 1 and 2. */
export const SITE_FEEDBACK_SCHEMA_VERSION = 2 as const;

/** Storage prefix for feedback photos: site-feedback/{authUid}/{feedbackId}/photo.{ext}. */
export const SITE_FEEDBACK_PHOTO_PREFIX = "site-feedback";

export const SITE_FEEDBACK_TYPES = ["bug", "idea", "other"] as const;
export type SiteFeedbackType = (typeof SITE_FEEDBACK_TYPES)[number];

export const SITE_FEEDBACK_TYPE_LABELS: Record<SiteFeedbackType, string> = {
  bug: "Bug",
  idea: "Idea",
  other: "Other",
};

export const SITE_FEEDBACK_LIMITS = {
  messageMin: 5,
  messageMax: 2000,
  emailMax: 254,
  pageMax: 500,
  tabMax: 64,
  studioStepMax: 64,
  userAgentMax: 512,
  viewportMax: 32,
  /** As picked by the visitor, before the on-device shrink. Matches storage.rules. */
  photoMaxBytes: 5 * 1024 * 1024,
  /** Longest side after the on-device shrink. */
  photoMaxDimension: 1600,
} as const;

export const SITE_FEEDBACK_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type SiteFeedbackPhotoType = (typeof SITE_FEEDBACK_PHOTO_TYPES)[number];

const SITE_FEEDBACK_PHOTO_EXTENSIONS: Record<SiteFeedbackPhotoType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isSiteFeedbackPhotoType(value: unknown): value is SiteFeedbackPhotoType {
  return (
    typeof value === "string" &&
    (SITE_FEEDBACK_PHOTO_TYPES as readonly string[]).includes(value)
  );
}

export interface SiteFeedbackNationalityOption {
  code: string;
  label: string;
}

/** Every ISO country from the Step 8 country list, by English name. */
export const SITE_FEEDBACK_NATIONALITY_OPTIONS: readonly SiteFeedbackNationalityOption[] =
  Object.freeze(
    [...STEP8_COUNTRY_ZONE_INDEX.keys()]
      .filter((code) => /^[A-Z]{2}$/.test(code) && !STEP8_FAKE_COUNTRY_CODE_SENTINELS.has(code))
      .map((code) => ({ code, label: formatStep8CountryLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label, "en")),
  );

const NATIONALITY_CODES = new Set(SITE_FEEDBACK_NATIONALITY_OPTIONS.map((o) => o.code));

export function isSiteFeedbackNationality(value: unknown): value is string {
  return typeof value === "string" && NATIONALITY_CODES.has(value);
}

export function siteFeedbackNationalityLabel(code: string | null | undefined): string {
  if (!code) return "";
  return formatStep8CountryLabel(code);
}

/** Fields every create must carry (`hasAll` in firestore.rules; the v1 form sends exactly these). */
export const SITE_FEEDBACK_REQUIRED_KEYS = [
  "schemaVersion",
  "status",
  "type",
  "message",
  "email",
  "page",
  "tab",
  "studioStep",
  "userAgent",
  "viewport",
  "uid",
  "createdAt",
] as const;

/** v2 fields. Optional for the rules so the v1 form keeps working. */
export const SITE_FEEDBACK_OPTIONAL_KEYS = [
  "nationality",
  "photoPath",
  "photoContentType",
  "photoSizeBytes",
] as const;

/** Every field a client create may carry (`hasOnly` in firestore.rules). */
export const SITE_FEEDBACK_CREATE_KEYS = [
  ...SITE_FEEDBACK_REQUIRED_KEYS,
  ...SITE_FEEDBACK_OPTIONAL_KEYS,
] as const;

/** Client-side spam guard: at most 3 sends per 10 minutes, 20 s apart. */
export const SITE_FEEDBACK_RATE_LIMIT = {
  storageKey: "odogwu_site_feedback_sends_v1",
  windowMs: 10 * 60 * 1000,
  maxInWindow: 3,
  minGapMs: 20 * 1000,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SiteFeedbackInput {
  type: string;
  message: string;
  email?: string;
  /** ISO country code, or empty for "Prefer not to say". */
  nationality?: string;
}

export type SiteFeedbackValidation =
  | {
      ok: true;
      value: {
        type: SiteFeedbackType;
        message: string;
        email: string | null;
        nationality?: string | null;
      };
    }
  | { ok: false; field: "type" | "message" | "email" | "nationality"; error: string };

export function isSiteFeedbackType(value: unknown): value is SiteFeedbackType {
  return (
    typeof value === "string" &&
    (SITE_FEEDBACK_TYPES as readonly string[]).includes(value)
  );
}

export function validateSiteFeedback(
  input: SiteFeedbackInput,
): SiteFeedbackValidation {
  if (!isSiteFeedbackType(input.type)) {
    return { ok: false, field: "type", error: "Choose Bug, Idea or Other." };
  }
  const message = (input.message ?? "").trim();
  // Firestore Rules count code points, so emoji count once here too.
  const messageLength = Array.from(message).length;
  if (messageLength < SITE_FEEDBACK_LIMITS.messageMin) {
    return {
      ok: false,
      field: "message",
      error: `Please write at least ${SITE_FEEDBACK_LIMITS.messageMin} characters.`,
    };
  }
  if (messageLength > SITE_FEEDBACK_LIMITS.messageMax) {
    return {
      ok: false,
      field: "message",
      error: `Please keep it under ${SITE_FEEDBACK_LIMITS.messageMax} characters.`,
    };
  }
  const email = (input.email ?? "").trim();
  if (email) {
    if (
      email.length > SITE_FEEDBACK_LIMITS.emailMax ||
      !EMAIL_PATTERN.test(email)
    ) {
      return {
        ok: false,
        field: "email",
        error: "That email address doesn't look right. Leave it empty or fix it.",
      };
    }
  }
  const nationality = (input.nationality ?? "").trim();
  if (nationality && !isSiteFeedbackNationality(nationality)) {
    return {
      ok: false,
      field: "nationality",
      error: "Choose a country from the list, or Prefer not to say.",
    };
  }
  return {
    ok: true,
    value: {
      type: input.type,
      message,
      email: email || null,
      ...(nationality ? { nationality } : {}),
    },
  };
}

/** Checks the photo as picked, before the on-device shrink. */
export function validateSiteFeedbackPhoto(
  file: { type: string; size: number } | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!file) return { ok: true };
  if (!isSiteFeedbackPhotoType(file.type)) {
    return { ok: false, error: "Please choose a JPEG, PNG or WebP image." };
  }
  if (file.size <= 0) {
    return { ok: false, error: "That image is empty. Please choose another one." };
  }
  if (file.size > SITE_FEEDBACK_LIMITS.photoMaxBytes) {
    return { ok: false, error: "That image is over 5 MB. Please choose a smaller one." };
  }
  return { ok: true };
}

export function buildSiteFeedbackPhotoPath(
  authUid: string,
  feedbackId: string,
  contentType: SiteFeedbackPhotoType,
): string {
  return `${SITE_FEEDBACK_PHOTO_PREFIX}/${authUid}/${feedbackId}/photo.${SITE_FEEDBACK_PHOTO_EXTENSIONS[contentType]}`;
}

export interface SiteFeedbackPhotoRecord {
  path: string;
  contentType: SiteFeedbackPhotoType;
  sizeBytes: number;
}

const clip = (value: string | null | undefined, max: number): string =>
  (value ?? "").slice(0, max);

export interface SiteFeedbackContext {
  page: string;
  tab: string;
  studioStep: string | null;
  userAgent: string;
  viewport: string;
  uid: string | null;
}

/** Builds the exact document the rules accept. */
export function buildSiteFeedbackCreatePayload<TTimestamp>(
  value: Extract<SiteFeedbackValidation, { ok: true }>["value"],
  context: SiteFeedbackContext,
  createdAt: TTimestamp,
  photo: SiteFeedbackPhotoRecord | null = null,
) {
  return {
    schemaVersion: SITE_FEEDBACK_SCHEMA_VERSION,
    status: "new" as const,
    type: value.type,
    message: value.message,
    email: value.email,
    page: clip(context.page, SITE_FEEDBACK_LIMITS.pageMax),
    tab: clip(context.tab, SITE_FEEDBACK_LIMITS.tabMax),
    studioStep: context.studioStep
      ? clip(context.studioStep, SITE_FEEDBACK_LIMITS.studioStepMax)
      : null,
    userAgent: clip(context.userAgent, SITE_FEEDBACK_LIMITS.userAgentMax),
    viewport: clip(context.viewport, SITE_FEEDBACK_LIMITS.viewportMax),
    uid: context.uid,
    createdAt,
    nationality: value.nationality ?? null,
    photoPath: photo?.path ?? null,
    photoContentType: photo?.contentType ?? null,
    photoSizeBytes: photo?.sizeBytes ?? null,
  };
}

/** Returns the milliseconds to wait, or 0 when a send is allowed now. */
export function siteFeedbackRateLimitWaitMs(
  previousSends: readonly number[],
  now: number,
): number {
  const { windowMs, maxInWindow, minGapMs } = SITE_FEEDBACK_RATE_LIMIT;
  const recent = previousSends
    .filter((sentAt) => Number.isFinite(sentAt) && now - sentAt < windowMs)
    .sort((a, b) => a - b);
  let wait = 0;
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < minGapMs) {
    wait = Math.max(wait, minGapMs - (now - last));
  }
  if (recent.length >= maxInWindow) {
    const oldestThatCounts = recent[recent.length - maxInWindow];
    wait = Math.max(wait, windowMs - (now - oldestThatCounts));
  }
  return wait;
}

export function readSiteFeedbackSends(storage: Pick<Storage, "getItem"> | null): number[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(
      storage.getItem(SITE_FEEDBACK_RATE_LIMIT.storageKey) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

export function recordSiteFeedbackSend(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  now: number,
): void {
  if (!storage) return;
  try {
    const kept = readSiteFeedbackSends(storage).filter(
      (sentAt) => now - sentAt < SITE_FEEDBACK_RATE_LIMIT.windowMs,
    );
    storage.setItem(
      SITE_FEEDBACK_RATE_LIMIT.storageKey,
      JSON.stringify([...kept, now]),
    );
  } catch {
    // Private mode or full storage: the rules still bound each document.
  }
}
