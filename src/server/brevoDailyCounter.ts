import type { Firestore } from "firebase-admin/firestore";

/**
 * Daily count of successful Brevo login-code sends, kept in the existing
 * Firestore database (Admin SDK only; client rules deny it through the
 * catch-all rule). One document per UTC day, so the count starts again at
 * midnight UTC. Each document carries `expiresAt` so a Firestore TTL policy
 * on that field can remove old days.
 *
 * BREVO_DAILY_LIMIT sets the threshold (default 290, just under Brevo's
 * free 300/day). Once reached, login codes go straight to Gmail SMTP.
 */
export const BREVO_DAILY_USAGE_COLLECTION = "authEmailProviderUsage";
export const DEFAULT_BREVO_DAILY_LIMIT = 290;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BrevoDailyUsage = {
  limit: number;
  /** Successful Brevo sends so far today (UTC). */
  readCount(): Promise<number>;
  /** Atomically adds one successful Brevo send to today's count. */
  recordSend(): Promise<void>;
};

export function readBrevoDailyLimit(
  environment: Record<string, string | undefined> = process.env,
): number {
  const raw = environment.BREVO_DAILY_LIMIT?.trim() || "";
  const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BREVO_DAILY_LIMIT;
}

export const utcDayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

export function createBrevoDailyUsage(
  db: Firestore,
  options: {
    environment?: Record<string, string | undefined>;
    now?: () => number;
  } = {},
): BrevoDailyUsage {
  const now = options.now ?? Date.now;
  const reference = () =>
    db
      .collection(BREVO_DAILY_USAGE_COLLECTION)
      .doc(`brevo-${utcDayKey(now())}`);
  return {
    limit: readBrevoDailyLimit(options.environment),
    async readCount() {
      const snapshot = await reference().get();
      const count = snapshot.exists ? snapshot.data()?.count : 0;
      return typeof count === "number" && Number.isFinite(count) ? count : 0;
    },
    async recordSend() {
      const at = now();
      const day = utcDayKey(at);
      const ref = reference();
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists ? snapshot.data()?.count : 0;
        const count = (typeof current === "number" ? current : 0) + 1;
        const dayStart = Date.parse(`${day}T00:00:00.000Z`);
        transaction.set(
          ref,
          {
            provider: "brevo",
            day,
            count,
            updatedAt: new Date(at),
            // Kept a day past the end of its UTC day, then TTL can delete it.
            expiresAt: new Date(dayStart + 2 * DAY_MS),
          },
          { merge: true },
        );
      });
    },
  };
}
