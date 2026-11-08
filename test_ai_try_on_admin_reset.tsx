import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { Firestore } from "firebase-admin/firestore";
import { handleAiTryOn } from "./src/server/aiTryOnHttp";
import { ALLOWED_ADMIN_EMAILS } from "./src/server/adminAllowlist";
import { createAiTryOnSessions } from "./src/server/aiTryOnSession";
import { createAiTryOnUsageLimits, aiTryOnAccountUsageDocId, hashAiTryOnOrderKey } from "./src/server/aiTryOnUsageLimits";
import { createAiTryOnBusyJobs } from "./src/server/aiTryOnBusyJobs";
import { AdminAiTryOnReset } from "./src/components/AdminAiTryOnReset";
import type { HttpResponse } from "./src/server/httpTypes";
import { aiTryOnGlobalCapWarning } from "./src/services/aiTryOnAdminReset";
import { readFileSync } from "node:fs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Doc = Record<string, unknown>;
class FakeFirestore {
  docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snapshot(path: string) {
    const value = this.docs.get(path);
    return { exists: value !== undefined, data: () => value && { ...value } };
  }
  collection(name: string) {
    return {
      doc: (id: string) => ({ path: `${name}/${id}`, get: async () => this.snapshot(`${name}/${id}`) }),
      where: (field: string, _op: string, value: unknown) => ({ query: { name, field, value } }),
    };
  }
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const run = this.lock.then(async () => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: { path?: string; query?: { name: string; field: string; value: unknown } }) => {
          if (ref.query) {
            const query = ref.query;
            const docs = [...this.docs].filter(([path, data]) => path.startsWith(`${query.name}/`) && data[query.field] === query.value)
              .map(([path, data]) => ({ id: path.slice(query.name.length + 1), data: () => ({ ...data }) }));
            return { size: docs.length, docs };
          }
          return this.snapshot(ref.path!);
        },
        set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => writes.push(() => {
          this.docs.set(ref.path, { ...(options?.merge ? this.docs.get(ref.path) : {}), ...data });
        }),
        delete: (ref: { path: string }) => writes.push(() => { this.docs.delete(ref.path); }),
      };
      const result = await fn(tx);
      writes.forEach((write) => write());
      return result;
    });
    this.lock = run.catch(() => undefined);
    return run;
  }
  asFirestore() { return this as unknown as Firestore; }
}
const now = () => Date.UTC(2026, 10, 8, 10);
const db = new FakeFirestore();
const sessions = createAiTryOnSessions(db.asFirestore(), { now });
const limits = createAiTryOnUsageLimits(db.asFirestore(), { now });
const first = await sessions.resolve({ uid: "xavier", token: null });
await limits.reserve(first.sessionId, { accountUid: "xavier" });
await sessions.close(first.sessionId);
const current = await sessions.resolve({ uid: "xavier", token: null });
const outstanding = await limits.reserve(current.sessionId, { accountUid: "xavier" });
assert.equal(outstanding.ok, true);
const fred = await sessions.resolve({ uid: "fred", token: null });
await limits.reserve(fred.sessionId, { accountUid: "fred" });
const foreignBefore = [...db.docs].filter(([key]) => key.includes(aiTryOnAccountUsageDocId("fred")) || key.includes(hashAiTryOnOrderKey(fred.sessionId)));
const globalBefore = await limits.readGlobalCount();

const call = async ({ email = ALLOWED_ADMIN_EMAILS[0], uid = "xavier", admin = true, verified = true, provider = "google.com", method = "POST", auth = true, badToken = false }: { email?: string; uid?: string; admin?: boolean; verified?: boolean; provider?: string; method?: string; auth?: boolean; badToken?: boolean } = {}) => {
  const result = { status: 200, body: {} as Record<string, unknown>, revoked: false };
  const res: HttpResponse = {
    status(code) { result.status = code; return res; },
    setHeader() { return res; },
    json(body) { result.body = body as Record<string, unknown>; return body; },
  };
  await handleAiTryOn({ method, url: "/api/ai-try-on?action=admin-reset", headers: auth ? { authorization: "Bearer test-token" } : {}, body: { uid: "fred", orderKey: fred.sessionId } }, res, {
    environment: {}, getDb: () => db.asFirestore(), now,
    verifyIdToken: async (_token, checkRevoked) => {
      result.revoked = checkRevoked === true;
      if (badToken) throw new Error("invalid");
      return { uid, admin, email, email_verified: verified, firebase: { sign_in_provider: provider } };
    },
  });
  return result;
};
for (const input of [{ auth: false }, { badToken: true }]) assert.equal((await call(input)).status, 401);
for (const input of [
  { admin: false }, { verified: false }, { provider: "anonymous" }, { provider: "" },
  { email: "customer@example.test" },
  { email: ALLOWED_ADMIN_EMAILS[2] }, { email: ALLOWED_ADMIN_EMAILS[3] },
]) {
  const before = structuredClone([...db.docs]);
  assert.equal((await call(input)).status, 403);
  assert.deepEqual([...db.docs], before, "rejected callers cause no writes");
}
assert.deepEqual((await call({ method: "GET", admin: false })).body, { eligible: false });
assert.deepEqual((await call({ method: "GET" })).body, { eligible: true, globalUsage: { count: globalBefore, cap: 1000 } }, "reset admins also read the lifetime count");
assert.equal((await call({ method: "DELETE" })).status, 405);
const reset = await call();
assert.equal(reset.status, 200);
assert.equal(reset.revoked, true, "revocation check required");
assert.deepEqual(reset.body, { status: "reset", ordersReset: 2, orderTriesRemaining: 5, accountTriesRemaining: 15 });
assert.equal(await limits.readAccountTriesRemaining("xavier"), 15);
assert.equal(await limits.readOrderTriesRemaining(first.sessionId), 5, "own older order reset too");
assert.equal(await limits.readOrderTriesRemaining(current.sessionId), 5);
assert.equal(await limits.readGlobalCount(), globalBefore, "global limit not reset");
assert.deepEqual([...db.docs].filter(([key]) => foreignBefore.some(([foreign]) => foreign === key)), foreignBefore, "foreign counters untouched despite spoofed target body");
assert.equal(await limits.readAccountTriesRemaining("fred"), 14);
const newTry = await limits.reserve(current.sessionId, { accountUid: "xavier" });
assert.equal(newTry.ok, true);
if (outstanding.ok) await limits.release(outstanding.orderDocId, outstanding.account, outstanding.orderResetGeneration);
assert.equal(await limits.readAccountTriesRemaining("xavier"), 14, "old in-flight refund cannot erase a new try");
assert.equal(await limits.readOrderTriesRemaining(current.sessionId), 4);
assert.equal((await call({ email: ALLOWED_ADMIN_EMAILS[1], uid: "fred" })).status, 200);
assert.equal(await limits.readAccountTriesRemaining("fred"), 15, "Fred can reset himself");
assert.equal(await limits.readAccountTriesRemaining("xavier"), 14, "Fred cannot reset Xavier");

// Held jobs carry the reservation generation across retries and refund safely.
const heldReservation = await limits.reserve(current.sessionId, { accountUid: "xavier" });
assert.ok(heldReservation.ok);
const jobs = createAiTryOnBusyJobs(db.asFirestore(), limits, { now });
const held = await jobs.hold({ sessionId: current.sessionId, wearerKey: "order", inputFingerprint: "tryon-v1-0123456789abcdef", orderDocId: heldReservation.orderDocId, account: heldReservation.account, orderResetGeneration: heldReservation.orderResetGeneration });
assert.ok(held);
await call();
await limits.reserve(current.sessionId, { accountUid: "xavier" });
await jobs.giveUp({ sessionId: current.sessionId, wearerKey: "order", jobId: held.jobId });
assert.equal(await limits.readOrderTriesRemaining(current.sessionId), 4);
assert.equal(await limits.readAccountTriesRemaining("xavier"), 14);

// Reset restores ordinary caps; it is not an unlimited bypass.
for (let index = 0; index < 4; index++) await limits.reserve(current.sessionId, { accountUid: "xavier" });
assert.deepEqual(await limits.reserve(current.sessionId, { accountUid: "xavier" }), { ok: false, code: "ORDER_TRY_LIMIT_REACHED" });
assert.equal(await limits.readOrderTriesRemaining(current.sessionId), 0);
assert.equal(await limits.readAccountTriesRemaining("xavier"), 10);

// Capability-gated UI never renders for customers or the other administrators.
for (const allowed of [false, true]) {
  let resets = 0;
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(createElement(AdminAiTryOnReset, { readStatus: async () => ({ eligible: allowed, globalUsage: null }), reset: async () => { resets++; return true; } })); });
  const buttons = () => renderer.root.findAllByType("button");
  if (!allowed) assert.equal(buttons().length, 0);
  else {
    assert.equal(buttons().length, 1);
    await act(async () => { buttons()[0].props.onClick(); });
    assert.equal(resets, 0, "confirmation required");
    await act(async () => { buttons()[0].props.onClick(); });
    assert.equal(resets, 1);
    assert.equal(renderer.root.findAllByProps({ role: "status" }).length, 1);
  }
  act(() => renderer.unmount());
}
console.log("PASS: admin self-reset authorization, own-only scope, finite limits, stale-refund safety and capability-gated UI");

// Lifetime cap warning in System Settings (read-only; cap unchanged).
{
  assert.equal(aiTryOnGlobalCapWarning(null), null);
  assert.equal(aiTryOnGlobalCapWarning({ count: 799, cap: 1000 }), null, "nothing below 80%");
  assert.equal(aiTryOnGlobalCapWarning({ count: 800, cap: 1000 })?.level, "warning");
  assert.equal(aiTryOnGlobalCapWarning({ count: 949, cap: 1000 })?.level, "warning");
  assert.equal(aiTryOnGlobalCapWarning({ count: 950, cap: 1000 })?.level, "critical");
  assert.equal(aiTryOnGlobalCapWarning({ count: 1000, cap: 1000 })?.level, "reached");
  assert.match(aiTryOnGlobalCapWarning({ count: 812, cap: 1000 })!.text, /used 812 of its 1000 previews \(81%\)/);
  const markup = async (globalUsage: { count: number; cap: number } | null, eligible = true) => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(createElement(AdminAiTryOnReset, { readStatus: async () => ({ eligible, globalUsage }), reset: async () => true })); });
    const found = renderer.root.findAll((node) => typeof node.props["data-admin-ai-try-on-cap-warning"] === "string").map((node) => node.props["data-admin-ai-try-on-cap-warning"] as string);
    act(() => renderer.unmount());
    return found;
  };
  assert.deepEqual(await markup({ count: 500, cap: 1000 }), []);
  assert.deepEqual(await markup({ count: 850, cap: 1000 }), ["warning"]);
  assert.deepEqual(await markup({ count: 960, cap: 1000 }), ["critical"]);
  assert.deepEqual(await markup({ count: 960, cap: 1000 }, false), [], "never shown to anyone else");
  const settings = readFileSync("src/components/DatabaseView.tsx", "utf8");
  assert.match(settings, /<AdminAiTryOnReset key=/, "shown in Admin > System Settings");
}
console.log("PASS: AI Try-on lifetime cap warning (80% / 95%)");

