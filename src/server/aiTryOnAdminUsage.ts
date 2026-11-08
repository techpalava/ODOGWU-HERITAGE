import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { AI_TRY_ON_GLOBAL_USAGE_DOC, AI_TRY_ON_USAGE_COLLECTION, aiTryOnUsageDay } from "./aiTryOnUsageLimits.js";
import { AI_TRY_ON_GLOBAL_GENERATION_CAP } from "../utils/aiTryOnGatewayContract.js";
import { getCanonicalEmail } from "../security/authIdentity.js";
import type { AiTryOnResetIdentity } from "./aiTryOnAdminReset.js";

/**
 * Read-only admin AI Try-on usage (Admin > System Settings). Every signed-in
 * admin gets the general stats; only the full-view list below also gets the
 * cost estimate and dollar reminders, and the cost is never in anyone
 * else's response. Never sent to the browser as a list.
 */
const FULL_VIEW_EMAILS = new Set(["techpalavabox@gmail.com"].map(getCanonicalEmail));

/** Estimate only: $64 per 1,000 counted tries (no billing data is read). */
export const AI_TRY_ON_COST_PER_TRY_USD = 0.064;
/** Reminders at 80% and 95% of each amount, like the cap warning. */
export const AI_TRY_ON_COST_REMINDER_AMOUNTS_USD = [10, 20] as const;
export const AI_TRY_ON_COST_REMINDER_LEVELS = { warning: 0.8, critical: 0.95 } as const;

const signedInAdmin = (identity: AiTryOnResetIdentity): boolean =>
  Boolean(identity.uid) && identity.admin === true && identity.email_verified === true &&
  typeof identity.email === "string" &&
  typeof identity.firebase?.sign_in_provider === "string" && Boolean(identity.firebase.sign_in_provider) &&
  identity.firebase.sign_in_provider !== "anonymous";

export const canSeeAiTryOnCost = (identity: AiTryOnResetIdentity): boolean =>
  signedInAdmin(identity) && FULL_VIEW_EMAILS.has(getCanonicalEmail(identity.email as string));

export interface AiTryOnUsageRow {
  /** YYYY-MM-DD or YYYY-MM (Lagos time). */
  period: string;
  started: number;
  failed: number;
  timedOut: number;
  /** Tries used: started minus refunded (no preview made). */
  used: number;
}

const tally = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

export const summariseAiTryOnUsageDays = (
  docs: ReadonlyArray<Record<string, unknown>>,
  nowMs: number,
  { days = 31, months = 13 }: { days?: number; months?: number } = {},
) => {
  const byDay = new Map<string, AiTryOnUsageRow>();
  for (const doc of docs) {
    if (doc.kind !== "day" || typeof doc.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(doc.day)) continue;
    const started = tally(doc.started);
    const failed = tally(doc.failed);
    byDay.set(doc.day, { period: doc.day, started, failed, timedOut: tally(doc.timedOut), used: Math.max(0, started - failed) });
  }
  const today = aiTryOnUsageDay(nowMs);
  const dayRows: AiTryOnUsageRow[] = [];
  for (let index = 0; index < days; index++) {
    const day = aiTryOnUsageDay(nowMs - index * 86_400_000);
    dayRows.push(byDay.get(day) ?? { period: day, started: 0, failed: 0, timedOut: 0, used: 0 });
  }
  const byMonth = new Map<string, AiTryOnUsageRow>();
  for (const row of byDay.values()) {
    const month = row.period.slice(0, 7);
    const sum = byMonth.get(month) ?? { period: month, started: 0, failed: 0, timedOut: 0, used: 0 };
    byMonth.set(month, { period: month, started: sum.started + row.started, failed: sum.failed + row.failed, timedOut: sum.timedOut + row.timedOut, used: sum.used + row.used });
  }
  const [year, month] = today.split("-").map(Number) as [number, number];
  const monthRows: AiTryOnUsageRow[] = [];
  for (let index = 0; index < months; index++) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    const key = date.toISOString().slice(0, 7);
    monthRows.push(byMonth.get(key) ?? { period: key, started: 0, failed: 0, timedOut: 0, used: 0 });
  }
  const recorded = [...byDay.keys()].sort();
  return { countingSince: recorded[0] ?? null, days: dayRows, months: monthRows };
};

const roundUsd = (value: number) => Math.round(value * 100) / 100;

/** The $10 / $20 reminders, on the all-time estimate (includes tries before the daily counts). */
export const aiTryOnCostReminders = (allTimeUsd: number) =>
  AI_TRY_ON_COST_REMINDER_AMOUNTS_USD.flatMap((amount) => {
    const share = allTimeUsd / amount;
    if (share < AI_TRY_ON_COST_REMINDER_LEVELS.warning) return [];
    const level = share >= 1 ? "reached" : share >= AI_TRY_ON_COST_REMINDER_LEVELS.critical ? "critical" : "warning";
    return [{ amountUsd: amount, level } as const];
  });

export const handleAiTryOnAdminUsage = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: {
    verifyIdToken: (token: string, checkRevoked?: boolean) => Promise<AiTryOnResetIdentity>;
    getDb: () => Promise<Firestore>;
    now?: () => number;
  },
) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED" });
  }
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return res.status(401).json({ code: "AUTH_REQUIRED" });
  let identity: AiTryOnResetIdentity;
  try {
    identity = await dependencies.verifyIdToken(bearer, true);
  } catch {
    return res.status(401).json({ code: "AUTH_REQUIRED" });
  }
  if (!signedInAdmin(identity)) return res.status(403).json({ code: "ADMIN_ONLY" });
  try {
    const db = await dependencies.getDb();
    const usage = db.collection(AI_TRY_ON_USAGE_COLLECTION);
    // Read-only. `kind == "day"` uses Firestore's automatic single-field index.
    const [global, dayDocs] = await Promise.all([
      usage.doc(AI_TRY_ON_GLOBAL_USAGE_DOC).get(),
      usage.where("kind", "==", "day").get(),
    ]);
    const allTime = tally(global.data()?.count);
    const nowMs = (dependencies.now ?? Date.now)();
    const summary = summariseAiTryOnUsageDays(dayDocs.docs.map((doc) => doc.data() as Record<string, unknown>), nowMs);
    const body = {
      ...summary,
      allTime: { tries: allTime, cap: AI_TRY_ON_GLOBAL_GENERATION_CAP },
    };
    if (!canSeeAiTryOnCost(identity)) return res.status(200).json({ view: "general", ...body });
    // All-time tries come from the existing lifetime counter, so the cost
    // includes tries made before the daily counts existed.
    const allTimeUsd = roundUsd(allTime * AI_TRY_ON_COST_PER_TRY_USD);
    return res.status(200).json({
      view: "full",
      ...body,
      cost: {
        estimate: true,
        perTryUsd: AI_TRY_ON_COST_PER_TRY_USD,
        allTimeUsd,
        thisMonthUsd: roundUsd((summary.months[0]?.used ?? 0) * AI_TRY_ON_COST_PER_TRY_USD),
        reminders: aiTryOnCostReminders(allTimeUsd),
      },
    });
  } catch {
    return res.status(503).json({ code: "USAGE_UNAVAILABLE" });
  }
};
