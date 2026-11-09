/**
 * Explicit provider billing / payment signals for AI Try-on.
 *
 * A signal is only a status-and-reason pair on this allowlist. Missing
 * objects, network failures, and HTTP 429 are never billing. The customer
 * unavailable page is limited to one verified Firebase account; every other
 * caller keeps the generic failure. The email is a code constant, not an
 * environment variable or a secret, and it is never written to a log.
 */
export const AI_TRY_ON_BILLING_UNAVAILABLE_EMAIL = "techpalavabox@gmail.com";

const BILLING_STATUSES = new Set([402, 403]);
const BILLING_REASONS = new Set([
  "billingdisabled",
  "billingaccountdisabled",
  "paymentrequired",
]);

export interface AiTryOnProviderBillingSignal {
  readonly status: number;
  readonly reason: string;
}

export interface AiTryOnBillingAccountIdentity {
  uid?: unknown;
  email?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

const normalizeReason = (reason: string): string =>
  reason.trim().toLowerCase().replace(/[_\-\s]/g, "");

export const matchAiTryOnBillingSignal = (
  status: number | null,
  reasons: readonly string[],
): AiTryOnProviderBillingSignal | null => {
  if (status === null || !BILLING_STATUSES.has(status)) return null;
  for (const reason of reasons) {
    const normalized = normalizeReason(reason);
    if (BILLING_REASONS.has(normalized)) return { status, reason: normalized };
  }
  return null;
};

export const readProviderHttpStatus = (error: unknown): number | null => {
  const seen = new Set<unknown>();
  const read = (value: unknown, depth: number): number | null => {
    if (depth > 4 || value === null || typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["status", "statusCode", "code"]) {
      const candidate = record[key];
      if (typeof candidate === "number" && candidate >= 100 && candidate <= 599) return candidate;
      if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) return Number(candidate);
    }
    for (const key of ["error", "response"]) {
      const nested = read(record[key], depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  };
  const status = read(error, 0);
  if (status !== null) return status;
  const message = error instanceof Error ? error.message : "";
  const start = message.indexOf("{");
  if (start < 0) return null;
  try {
    return read(JSON.parse(message.slice(start)), 0);
  } catch {
    return null;
  }
};

const collectReasons = (value: unknown, reasons: string[], seen: Set<unknown>, depth: number) => {
  if (depth > 5 || value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) collectReasons(entry, reasons, seen, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.reason === "string") reasons.push(record.reason);
  for (const key of ["error", "errors", "details", "errorDetails", "response"]) {
    collectReasons(record[key], reasons, seen, depth + 1);
  }
};

export const readProviderReasons = (error: unknown): string[] => {
  const reasons: string[] = [];
  collectReasons(error, reasons, new Set(), 0);
  const message = error instanceof Error ? error.message : "";
  const start = message.indexOf("{");
  if (start >= 0) {
    try {
      collectReasons(JSON.parse(message.slice(start)), reasons, new Set(), 0);
    } catch {
      // Free text is not a reason.
    }
  }
  return reasons;
};

/** Status + allowlisted reason. Message wording alone is not a signal. */
export const readAiTryOnBillingSignal = (error: unknown): AiTryOnProviderBillingSignal | null =>
  matchAiTryOnBillingSignal(readProviderHttpStatus(error), readProviderReasons(error));

/**
 * Verified Firebase token only. Case-insensitive exact email match.
 * Gmail dot-stripping and plus-tags do not count, and a client-supplied
 * address is never an input to this function.
 */
export const isAiTryOnBillingUnavailableAccount = (
  identity: AiTryOnBillingAccountIdentity | null | undefined,
): boolean => {
  if (!identity || typeof identity.uid !== "string" || identity.uid.length === 0) return false;
  if (identity.email_verified !== true || typeof identity.email !== "string") return false;
  const provider = identity.firebase?.sign_in_provider;
  if (typeof provider !== "string" || provider.length === 0 || provider === "anonymous") return false;
  return identity.email.trim().toLowerCase() === AI_TRY_ON_BILLING_UNAVAILABLE_EMAIL;
};
