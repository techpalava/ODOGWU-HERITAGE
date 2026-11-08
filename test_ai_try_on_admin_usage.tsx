/** Admin AI Try-on usage page: daily counters, split view, cost only for the full view. No network/AI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { createAiTryOnUsageLimits, aiTryOnUsageDayDocId, AI_TRY_ON_DAILY_USAGE_RETENTION_MS } from "./src/server/aiTryOnUsageLimits";
import { handleAiTryOn } from "./src/server/aiTryOnHttp";
import { aiTryOnCostReminders, summariseAiTryOnUsageDays } from "./src/server/aiTryOnAdminUsage";
import { AdminAiTryOnUsage } from "./src/components/AdminAiTryOnUsage";
import type { AiTryOnAdminUsage } from "./src/services/aiTryOnAdminUsage";
import type { HttpResponse } from "./src/server/httpTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Doc = Record<string, unknown>;
class FakeFirestore {
  docs = new Map<string, Doc>();
  private snapshot(path: string) {
    const value = this.docs.get(path);
    return { exists: value !== undefined, data: () => value && { ...value } };
  }
  collection(name: string) {
    return {
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => this.snapshot(`${name}/${id}`) }),
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => ({ docs: [...this.docs].filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value).map(([, data]) => ({ data: () => ({ ...data }) })) }),
      }),
    };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const writes: Array<() => void> = [];
    const result = await fn({
      get: async (ref: { path: string }) => this.snapshot(ref.path),
      set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => writes.push(() => this.docs.set(ref.path, { ...(options?.merge ? this.docs.get(ref.path) : {}), ...data })),
      delete: (ref: { path: string }) => writes.push(() => void this.docs.delete(ref.path)),
    });
    writes.forEach((write) => write());
    return result;
  }
  asFirestore() { return this as unknown as Firestore; }
}

// ------------------------------------------------------------ daily counters (Lagos day, ~400 days)
{
  const db = new FakeFirestore();
  let nowMs = Date.UTC(2026, 10, 8, 23, 30); // 00:30 on 9 Nov in Lagos
  const limits = createAiTryOnUsageLimits(db.asFirestore(), { now: () => nowMs });
  assert.equal(aiTryOnUsageDayDocId(nowMs), "day-2026-11-09", "days are cut at Lagos time");
  assert.equal(aiTryOnUsageDayDocId(Date.UTC(2026, 10, 8, 22, 59)), "day-2026-11-08");
  const a = await limits.reserve("order-a");
  const b = await limits.reserve("order-b");
  assert.ok(a.ok && b.ok);
  const day = () => db.docs.get("aiTryOnUsage/day-2026-11-09")!;
  assert.equal(day().started, 2);
  assert.equal(day().kind, "day");
  assert.equal((day().expiresAt as Date).getTime(), nowMs + AI_TRY_ON_DAILY_USAGE_RETENTION_MS, "kept about 400 days (existing TTL)");
  assert.equal(AI_TRY_ON_DAILY_USAGE_RETENTION_MS, 400 * 86_400_000);
  if (a.ok) await limits.release(a.orderDocId, a.account, a.orderResetGeneration, "timeout");
  assert.equal(day().failed, 1, "a refunded try is a failure");
  assert.equal(day().timedOut, 1, "after the time limit: also a timeout");
  if (b.ok) await limits.release(b.orderDocId, b.account, b.orderResetGeneration);
  assert.equal(day().failed, 2);
  assert.equal(day().timedOut, 1, "other failures are not timeouts");
  // Held busy jobs refund through releaseHeld with the same counting.
  const c = await limits.reserve("order-c");
  assert.ok(c.ok);
  db.docs.set("aiTryOnJobs/job-x", { orderDocId: c.ok ? c.orderDocId : "", account: null });
  const guard = db.collection("aiTryOnJobs").doc("job-x") as unknown as DocumentReference;
  assert.equal(await limits.releaseHeld(guard, () => true, "timeout"), true);
  assert.deepEqual([day().started, day().failed, day().timedOut], [3, 3, 2]);
  nowMs += 86_400_000;
  await limits.reserve("order-d");
  assert.equal(db.docs.get("aiTryOnUsage/day-2026-11-10")?.started, 1, "a new day gets its own record");
  assert.equal(await limits.readGlobalCount(), 1, "the lifetime counter is unchanged in meaning");
}

// ------------------------------------------------------------ summaries: per day, per month = sum of days
{
  const now = Date.UTC(2026, 10, 8, 12);
  const summary = summariseAiTryOnUsageDays([
    { kind: "day", day: "2026-11-08", started: 5, failed: 1, timedOut: 1 },
    { kind: "day", day: "2026-11-01", started: 3, failed: 0 },
    { kind: "day", day: "2026-10-31", started: 2, failed: 2, timedOut: 0 },
    { kind: "account", day: "2026-11-02", started: 99 },
  ], now);
  assert.deepEqual(summary.days[0], { period: "2026-11-08", started: 5, failed: 1, timedOut: 1, used: 4 });
  assert.equal(summary.days.length, 31);
  assert.deepEqual(summary.months[0], { period: "2026-11", started: 8, failed: 1, timedOut: 1, used: 7 });
  assert.deepEqual(summary.months[1], { period: "2026-10", started: 2, failed: 2, timedOut: 0, used: 0 });
  assert.equal(summary.months.length, 13);
  assert.equal(summary.countingSince, "2026-10-31");
  assert.deepEqual(aiTryOnCostReminders(7.99), []);
  assert.deepEqual(aiTryOnCostReminders(8), [{ amountUsd: 10, level: "warning" }]);
  assert.deepEqual(aiTryOnCostReminders(9.5), [{ amountUsd: 10, level: "critical" }]);
  assert.deepEqual(aiTryOnCostReminders(16), [{ amountUsd: 10, level: "reached" }, { amountUsd: 20, level: "warning" }]);
  assert.deepEqual(aiTryOnCostReminders(19), [{ amountUsd: 10, level: "reached" }, { amountUsd: 20, level: "critical" }]);
}

// ------------------------------------------------------------ endpoint: admins only; cost only for the full view
{
  const db = new FakeFirestore();
  db.docs.set("aiTryOnUsage/global", { count: 150 });
  db.docs.set("aiTryOnUsage/day-2026-11-08", { kind: "day", day: "2026-11-08", started: 6, failed: 2, timedOut: 1 });
  const identities: Record<string, Doc> = {
    xavier: { uid: "x", admin: true, email: "techpalavabox@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } },
    fred: { uid: "f", admin: true, email: "f.o.startups@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } },
    customer: { uid: "c", admin: false, email: "someone@example.test", email_verified: true, firebase: { sign_in_provider: "password" } },
    anon: { uid: "a", admin: true, email: "techpalavabox@gmail.com", email_verified: true, firebase: { sign_in_provider: "anonymous" } },
  };
  const call = async (who: string | null, method = "GET") => {
    const state = { status: 200, body: {} as Record<string, unknown>, revoked: false };
    const res: HttpResponse = { status(code) { state.status = code; return res; }, setHeader() { return res; }, json(body) { state.body = body as Record<string, unknown>; return body; } };
    await handleAiTryOn({ method, url: "/api/ai-try-on?action=admin-usage", query: { action: "admin-usage" }, headers: who ? { authorization: `Bearer ${who}` } : {} } as never, res, {
      environment: {}, getDb: () => db.asFirestore(), now: () => Date.UTC(2026, 10, 8, 12),
      verifyIdToken: async (token, checkRevoked) => { state.revoked = checkRevoked === true; const id = identities[token]; if (!id) throw new Error("bad"); return id as never; },
    });
    return state;
  };
  assert.equal((await call(null)).status, 401);
  assert.equal((await call("bad")).status, 401);
  assert.equal((await call("customer")).status, 403, "admins only");
  assert.equal((await call("anon")).status, 403, "never anonymous");
  assert.equal((await call("xavier", "POST")).status, 405, "read-only");
  const before = JSON.stringify([...db.docs]);
  const fred = await call("fred");
  assert.equal(JSON.stringify([...db.docs]), before, "reading writes nothing");
  assert.equal(fred.status, 200);
  assert.equal(fred.revoked, true, "revoked sessions refused");
  assert.equal(fred.body.view, "general");
  assert.equal("cost" in fred.body, false, "no cost for other admins");
  assert.doesNotMatch(JSON.stringify(fred.body), /\$|usd|cost|top up|billing/i, "nothing about money in the response");
  assert.deepEqual(fred.body.allTime, { tries: 150, cap: 1000 });
  const xavier = await call("xavier");
  assert.equal(xavier.body.view, "full");
  const cost = xavier.body.cost as { estimate: boolean; perTryUsd: number; allTimeUsd: number; thisMonthUsd: number; reminders: unknown[] };
  assert.equal(cost.estimate, true);
  assert.equal(cost.perTryUsd, 0.064);
  assert.equal(cost.allTimeUsd, 9.6, "all-time cost from the lifetime counter (includes earlier tries)");
  assert.equal(cost.thisMonthUsd, 0.26, "4 tries used this month");
  assert.deepEqual(cost.reminders, [], "reminders use this month ($0.26), not all time ($9.60)");
  db.docs.set("aiTryOnUsage/day-2026-11-02", { kind: "day", day: "2026-11-02", started: 150, failed: 0 });
  db.docs.set("aiTryOnUsage/day-2026-10-30", { kind: "day", day: "2026-10-30", started: 900, failed: 0 });
  const busy = (await call("xavier")).body.cost as typeof cost;
  assert.equal(busy.thisMonthUsd, 9.86, "154 tries this Lagos month");
  assert.deepEqual(busy.reminders, [{ amountUsd: 10, level: "critical" }], "October tries do not count toward this month");
  db.docs.delete("aiTryOnUsage/day-2026-11-02");
  db.docs.delete("aiTryOnUsage/day-2026-10-30");
  const source = readFileSync("src/server/aiTryOnAdminUsage.ts", "utf8");
  assert.match(source, /const FULL_VIEW_EMAILS = new Set\(\["techpalavabox@gmail\.com"\]/, "only Xavier's account sees cost");
  const http = readFileSync("src/server/aiTryOnHttp.ts", "utf8");
  assert.match(http, /const refundReason = outcome\.reason === "timeout" \? "timeout" : "other";/, "a timeout is a refund after the time limit");
  assert.match(http, /limits\.release\(reserved\.orderDocId, reserved\.account, reserved\.orderResetGeneration, refundReason\)/);
  assert.match(http, /refundClaim\(refundReason\)/);
  assert.match(readFileSync("src/components/DatabaseView.tsx", "utf8"), /<AdminAiTryOnUsage key=/, "in Admin > System Settings");
}

// ------------------------------------------------------------ UI: split view
{
  const base: AiTryOnAdminUsage = {
    view: "general", countingSince: "2026-11-08",
    days: [{ period: "2026-11-08", started: 6, failed: 2, timedOut: 1, used: 4 }],
    months: [{ period: "2026-11", started: 6, failed: 2, timedOut: 1, used: 4 }],
    allTime: { tries: 820, cap: 1000 },
  };
  const render = async (usage: AiTryOnAdminUsage | null) => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(createElement(AdminAiTryOnUsage, { readUsage: async () => usage })); });
    const json = JSON.stringify(renderer.toJSON());
    const links = renderer.root.findAll((node) => node.props["data-admin-ai-try-on-usage-top-up"] !== undefined).map((node) => ({ props: { ...node.props } }));
    act(() => renderer.unmount());
    return { json, links };
  };
  assert.equal((await render(null)).json, "null", "nothing for non-admins");
  const general = await render(base);
  assert.match(general.json, /All-time tries: /);
  assert.match(general.json, /data-admin-ai-try-on-usage-cap-warning/);
  assert.doesNotMatch(general.json, /\$|Cost|estimate|Top up/, "no cost or dollar reminder for other admins");
  assert.equal(general.links.length, 0, "no Top up for other admins");
  const full = await render({ ...base, view: "full", cost: { estimate: true, perTryUsd: 0.064, allTimeUsd: 52.48, thisMonthUsd: 0.26, reminders: [{ amountUsd: 10, level: "reached" }, { amountUsd: 20, level: "reached" }] } });
  assert.match(full.json, /\$52\.48/);
  assert.match(full.json, /estimate/);
  assert.match(full.json, /\$64 per 1,000 tries/);
  assert.equal(full.links.length, 1);
  assert.equal(full.links[0].props.href, "https://console.cloud.google.com/billing");
  assert.equal(full.links[0].props.target, "_blank");
  assert.match(full.links[0].props.rel, /noopener/);
  // A general response never shows cost even if a cost field slipped in.
  assert.doesNotMatch((await render({ ...base, cost: full.links.length ? { estimate: true, perTryUsd: 0.064, allTimeUsd: 1, thisMonthUsd: 1, reminders: [] } : undefined })).json, /\$/);
}
console.log("PASS: admin AI Try-on usage (Lagos-day counters, split view, cost and Top up only for the full view)");
