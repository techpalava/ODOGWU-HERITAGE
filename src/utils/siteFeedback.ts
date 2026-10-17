/**
 * Site feedback: pure helpers shared by the floating Feedback button, its
 * Firestore write, and test_site_feedback.tsx. Field names and limits mirror
 * `hasValidSiteFeedbackCreate` in firestore.rules.
 */

export const SITE_FEEDBACK_COLLECTION = "site_feedback";

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
} as const;

/** Every field a client create carries. Mirrors firestore.rules exactly. */
export const SITE_FEEDBACK_CREATE_KEYS = [
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
}

export type SiteFeedbackValidation =
  | {
      ok: true;
      value: { type: SiteFeedbackType; message: string; email: string | null };
    }
  | { ok: false; field: "type" | "message" | "email"; error: string };

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
  return {
    ok: true,
    value: { type: input.type, message, email: email || null },
  };
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
) {
  return {
    schemaVersion: 1 as const,
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
