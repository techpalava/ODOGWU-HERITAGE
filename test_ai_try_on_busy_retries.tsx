/**
 * AI Try-on busy retries (item 1): held try, browser retries, single charge,
 * exactly-once refund, 409 after the session closes, wording.
 * All mocked: no Gemini, Firebase or network calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { Firestore } from "firebase-admin/firestore";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import type { HttpResponse } from "./src/server/httpTypes";
import { createAiTryOnPreviewStore, type AiTryOnPreviewBucket } from "./src/server/aiTryOnPreviewStore";
import { retireAiTryOnSessionForPaidOrder } from "./src/server/aiTryOnPaymentCleanup";
import { AuthRateLimitError } from "./src/server/authRateLimit";
import {
  AI_TRY_ON_BUSY_JOB_EXPIRY_MS,
  AI_TRY_ON_BUSY_MAX_REQUESTS,
  AI_TRY_ON_BUSY_MIN_GAP_MS,
  AI_TRY_ON_BUSY_RETRY_IP_LIMIT,
  AI_TRY_ON_JOB_COLLECTION,
} from "./src/server/aiTryOnBusyJobs";
import {
  AI_TRY_ON_BUSY_GIVE_UP_MS,
  AI_TRY_ON_BUSY_RETRY_DELAYS_MS,
  AI_TRY_ON_PENDING_STORAGE_KEY,
  AI_TRY_ON_RESUME_WINDOW_MS,
  createAiTryOnBackgroundJobs,
  type AiTryOnBackgroundJob,
} from "./src/services/aiTryOnBackgroundJobs";
import {
  mapAiTryOnPreviewResponse,
  releaseAiTryOnBusyJob,
  type AiTryOnPreviewOutcome,
} from "./src/services/aiTryOnGateway";
import { AiTryOnPhotoPanel, type AiTryOnPhotoPanelProps } from "./src/components/AiTryOnPhotoPanel";
import { AiTryOnBackgroundToasts, AiTryOnGeneratingChip, aiTryOnToastKind } from "./src/components/AiTryOnBackgroundToasts";
import { AI_TRY_ON_BACKGROUND_COPY as COPY } from "./src/utils/aiTryOnBackgroundCopy";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import type { AiTryOnGenerationRequest } from "./src/utils/aiTryOnGatewayContract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ------------------------------------------------------------ approved wording (option A)
{
  assert.equal(COPY.chipBusy(null), "Still making your preview… it's busy right now");
  assert.equal(COPY.chipBusy("Ada"), "Still making Ada's preview… it's busy right now");
  assert.equal(
    COPY.panelBusy,
    "Lots of people are making previews right now. We'll keep trying for a few minutes; you can carry on and we'll let you know.",
  );
  assert.match(COPY.busyFailedBody, /couldn’t confirm whether a try was used/);
  assert.equal(COPY.failedTitle(null), "We couldn't create your preview", "title unchanged");
}

// Server-only collection: no client access.
assert.match(readFileSync("firestore.rules", "utf8"), /match \/aiTryOnJobs\/\{document=\*\*\} \{\n\s+allow read, write: if false;/);

// ------------------------------------------------------------ server fakes
type Doc = Record<string, unknown>;
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snap(path: string) {
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  collection(name: string) {
    return {
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          path,
          get: async () => this.snap(path),
          set: async (data: Doc) => void this.docs.set(path, { ...data }),
          delete: async () => void this.docs.delete(path),
        };
      },
      where: (field: string, _op: "==", value: unknown) => ({
        get: async () => ({
          docs: [...this.docs.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path, data]) => ({ id: path.slice(name.length + 1), data: () => ({ ...data }) })),
        }),
      }),
    };
  }
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const tx = {
      get: async (ref: { path: string }) => this.snap(ref.path),
      set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => {
        const previous = options?.merge ? this.docs.get(ref.path) || {} : {};
        this.docs.set(ref.path, { ...previous, ...data });
      },
      delete: (ref: { path: string }) => void this.docs.delete(ref.path),
    };
    const run = this.lock.then(() => fn(tx));
    this.lock = run.catch(() => undefined);
    return run;
  }
  jobs() {
    return [...this.docs.entries()].filter(([path]) => path.startsWith(`${AI_TRY_ON_JOB_COLLECTION}/`));
  }
  count(id: string) {
    return (this.docs.get(`aiTryOnUsage/${id}`)?.count as number | undefined) ?? 0;
  }
  orderCount() {
    const order = [...this.docs.entries()].find(([path]) => path.startsWith("aiTryOnUsage/order-"));
    return (order?.[1].count as number | undefined) ?? 0;
  }
  asFirestore() {
    return this as unknown as Firestore;
  }
}
class FakeBucket implements AiTryOnPreviewBucket {
  readonly objects = new Map<string, Buffer>();
  file(path: string) {
    return {
      save: async (data: Buffer) => void this.objects.set(path, data),
      download: async (): Promise<[Buffer]> => [this.objects.get(path)!],
      delete: async () => void this.objects.delete(path),
    };
  }
}
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString("base64");
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]).toString("base64");
const FINGERPRINT = "tryon-v1-0123456789abcdef";
const UID = "firebase-uid-ada";
const highDemand = () =>
  Object.assign(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}'), { status: 503 });

const harness = () => {
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  let clock = Date.now();
  const counters = { gemini: 0, ip: 0, busyIp: 0 };
  let gemini: "busy" | "ok" | "fail" | (() => Promise<never>) = "busy";
  let busyIpBlocked = false;
  const logs: string[] = [];
  const deps: AiTryOnHttpDependencies = {
    environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" },
    getDb: () => db.asFirestore(),
    now: () => clock,
    consumeIpRateLimit: async () => { counters.ip += 1; },
    consumeBusyRetryIpLimit: async () => {
      counters.busyIp += 1;
      if (busyIpBlocked) throw new AuthRateLimitError(120);
    },
    consumeGuestSessionLimit: async () => undefined,
    verifyIdToken: async (token) => {
      if (token === "id-token-ada") return { uid: UID, firebase: { sign_in_provider: "password" } };
      throw new Error("bad token");
    },
    geminiRetrySleep: async () => undefined,
    createGenerateContent: () => async () => {
      counters.gemini += 1;
      if (typeof gemini === "function") return gemini();
      if (gemini === "busy") throw highDemand();
      if (gemini === "fail") throw Object.assign(new Error("INTERNAL"), { status: 500 });
      return { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] };
    },
    createPreviewStore: (database) => createAiTryOnPreviewStore(database, bucket),
    compactPreviewImage: async () => ({ mimeType: "image/webp", data: Buffer.from("RIFF0000WEBPVP8 compact").toString("base64"), bytes: 23, width: 683, height: 1024 }),
    log: (line) => void logs.push(line),
  };
  const response = () => {
    const state: { status: number; body: any } = { status: 200, body: undefined };
    const res: HttpResponse = {
      status(code) { state.status = code; return res; },
      setHeader() { return res; },
      json(body) { state.body = body; return body; },
    };
    return { res, state };
  };
  const call = async (method: string, url: string, headers: Record<string, string>, body?: unknown) => {
    const result = response();
    await handleAiTryOn({ method, url, headers: { "x-forwarded-for": "203.0.113.5", ...headers }, body } as never, result.res, deps);
    return result.state;
  };
  const session = async (headers: Record<string, string> = {}) => {
    const state = await call("POST", "/api/ai-try-on?action=session", headers);
    return state.body as { sessionToken: string | null; orderTriesRemaining: number; accountTriesRemaining?: number };
  };
  const body = (overrides: Record<string, unknown> = {}) => ({
    mode: "garment",
    inputFingerprint: FINGERPRINT,
    wearerKey: "w-ada",
    personImage: { mimeType: "image/jpeg", data: jpeg },
    garmentImage: { mimeType: "image/png", data: png },
    ...overrides,
  });
  const generate = (headers: Record<string, string>, overrides: Record<string, unknown> = {}) =>
    call("POST", "/api/ai-try-on", headers, body(overrides));
  return {
    db, bucket, deps, counters, logs, call, session, generate,
    advance: (ms: number) => { clock += ms; },
    setGemini: (next: typeof gemini) => { gemini = next; },
    blockBusyIp: (blocked: boolean) => { busyIpBlocked = blocked; },
  };
};

// ------------------------------------------------------------ hold, retry, recover: one charge
{
  const h = harness();
  const guest = await h.session();
  const auth = { "x-ai-try-on-session": guest.sessionToken! };

  const first = await h.generate(auth);
  assert.equal(first.status, 503);
  assert.equal(first.body.code, "PROVIDER_BUSY");
  assert.equal(first.body.retryable, true);
  assert.match(first.body.busyJobId, /^busy-[0-9a-f-]{36}$/);
  assert.equal(first.body.orderTriesRemaining, 4, "the try is held, not refunded");
  assert.equal(h.counters.gemini, 2, "the in-function capacity retry still runs once");
  assert.equal(h.counters.ip, 1);
  assert.equal(h.db.count("global"), 1);
  const jobId = first.body.busyJobId as string;

  // Minimal job record: no customer content, no raw ids.
  const jobs = h.db.jobs();
  assert.equal(jobs.length, 1);
  const [jobPath, job] = jobs[0];
  assert.deepEqual(
    Object.keys(job).sort(),
    ["account", "expiresAt", "inputFingerprint", "jobId", "lastAt", "leaseUntil", "orderDocId", "requests", "status"],
  );
  assert.equal(job.account, null, "guests hold no account use");
  assert.equal(job.status, "held");
  assert.equal(job.requests, 1);
  assert.equal((job.expiresAt as Date).getTime() - (job.lastAt as number), AI_TRY_ON_BUSY_JOB_EXPIRY_MS);
  const raw = JSON.stringify(job);
  assert.equal(raw.includes(jpeg) || raw.includes(png) || raw.includes(guest.sessionToken!) || raw.includes("w-ada"), false);
  assert.match(jobPath, /^aiTryOnJobs\/job-[0-9a-f]{40}$/);

  // Too soon (10 s minimum gap): refused before Gemini, nothing charged.
  h.advance(AI_TRY_ON_BUSY_MIN_GAP_MS - 1);
  const early = await h.generate(auth, { busyJobId: jobId });
  assert.equal(early.status, 429);
  assert.equal(early.body.code, "RATE_LIMITED");
  assert.equal(h.counters.gemini, 2);

  // Bound to session, wearer and design.
  h.advance(15_000);
  assert.equal((await h.generate(auth, { busyJobId: jobId, inputFingerprint: "tryon-v1-fedcba9876543210" })).status, 410);
  assert.equal((await h.generate(auth, { busyJobId: jobId, wearerKey: "w-obi" })).status, 410);
  const other = await h.session();
  const stolen = await h.generate({ "x-ai-try-on-session": other.sessionToken! }, { busyJobId: jobId });
  assert.equal(stolen.status, 410, "another session can't use the job id");
  assert.equal(stolen.body.code, "BUSY_JOB_GONE");
  assert.equal((await h.generate(auth, { busyJobId: `busy-${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}` })).status, 410);
  assert.equal((await h.generate(auth, { busyJobId: "busy-not-a-uuid" })).status, 400);
  assert.equal(h.counters.gemini, 2, "none of those reached Gemini");

  // Retry: still busy; no new try, IP window or global count.
  const second = await h.generate(auth, { busyJobId: jobId });
  assert.equal(second.status, 503);
  assert.equal(second.body.busyJobId, jobId, "same job");
  assert.equal(h.counters.gemini, 4);
  assert.equal(h.counters.ip, 1, "the normal IP window is charged once");
  assert.ok(h.counters.busyIp >= 1, "retries use the light busy-retry window");
  assert.equal(h.db.count("global"), 1);
  assert.equal(h.db.orderCount(), 1);

  // Recovers: preview made with the held try; the job is gone.
  h.advance(30_000);
  h.setGemini("ok");
  const done = await h.generate(auth, { busyJobId: jobId });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "completed");
  assert.equal(done.body.orderTriesRemaining, 4);
  assert.equal(done.body.previewStored, true);
  assert.equal(h.db.jobs().length, 0);
  assert.equal(h.db.count("global"), 1, "one generation, counted once");
  assert.equal(h.db.orderCount(), 1);
  assert.ok(h.logs.some((line) => line.includes('"busy":"recovered"')));
  // The job is used up.
  h.advance(30_000);
  assert.equal((await h.generate(auth, { busyJobId: jobId })).status, 410);
  assert.deepEqual(AI_TRY_ON_BUSY_RETRY_IP_LIMIT, { bucket: "ai-try-on-busy-ip", limit: 30, windowMs: 600_000 });
}

// ------------------------------------------------------------ attempt cap: refunded exactly once
{
  const h = harness();
  const guest = await h.session();
  const auth = { "x-ai-try-on-session": guest.sessionToken! };
  // One real preview first, so a double refund would show (count 1 → -1 clamps to 0).
  h.setGemini("ok");
  assert.equal((await h.generate(auth, { wearerKey: "w-obi" })).status, 200);
  h.setGemini("busy");
  const first = await h.generate(auth);
  const jobId = first.body.busyJobId as string;
  assert.equal(h.db.count("global"), 2);
  let last = first;
  for (let request = 2; request <= AI_TRY_ON_BUSY_MAX_REQUESTS; request += 1) {
    h.advance(20_000);
    last = await h.generate(auth, { busyJobId: jobId });
  }
  assert.equal(AI_TRY_ON_BUSY_MAX_REQUESTS, 6, "first request + 5 retries");
  assert.equal(last.status, 503);
  assert.equal(last.body.code, "PROVIDER_BUSY");
  assert.equal(last.body.retryable, false);
  assert.equal(last.body.busyJobId, undefined, "final: no job to retry");
  assert.equal(last.body.orderTriesRemaining, 4, "refunded: only Obi's preview counts");
  assert.equal(h.db.count("global"), 1);
  assert.equal(h.db.jobs().length, 0);
  assert.deepEqual(mapAiTryOnPreviewResponse(last.status, last.body), { kind: "busy_failed", orderTriesRemaining: 4, tryRefunded: true });
  // Later attempts and give-ups change nothing.
  h.advance(20_000);
  assert.equal((await h.generate(auth, { busyJobId: jobId })).status, 410);
  const giveUp = await h.call("DELETE", `/api/ai-try-on?busyJobId=${jobId}&wearerKey=w-ada`, auth);
  assert.deepEqual(giveUp.body, { status: "released", released: false });
  assert.equal(h.db.count("global"), 1);
  assert.equal(h.db.orderCount(), 1);
}

// ------------------------------------------------------------ expiry, give-up, sweep, concurrency
{
  const h = harness();
  const guest = await h.session();
  const auth = { "x-ai-try-on-session": guest.sessionToken! };
  // Past the 5-minute server expiry: the retry refunds and ends.
  const jobId = (await h.generate(auth)).body.busyJobId as string;
  h.advance(AI_TRY_ON_BUSY_JOB_EXPIRY_MS);
  const expired = await h.generate(auth, { busyJobId: jobId });
  assert.equal(expired.status, 503);
  assert.equal(expired.body.retryable, false);
  assert.equal(expired.body.orderTriesRemaining, 5);
  assert.equal(h.counters.gemini, 2, "an expired job never calls Gemini");

  // Browser gave up: two give-ups at once refund once.
  const second = (await h.generate(auth)).body.busyJobId as string;
  assert.equal(h.db.orderCount(), 1);
  const [a, b] = await Promise.all([
    h.call("DELETE", `/api/ai-try-on?busyJobId=${second}&wearerKey=w-ada`, auth),
    h.call("DELETE", `/api/ai-try-on?busyJobId=${second}&wearerKey=w-ada`, auth),
  ]);
  assert.deepEqual([a.body.released, b.body.released].sort(), [false, true]);
  assert.equal(h.db.orderCount(), 0);
  assert.equal(h.db.count("global"), 0);

  // A browser that never came back: refunded by the next session call after expiry.
  await h.generate(auth);
  assert.equal((await h.session(auth)).orderTriesRemaining, 4, "still held before expiry");
  h.advance(AI_TRY_ON_BUSY_JOB_EXPIRY_MS + 1);
  assert.equal((await h.session(auth)).orderTriesRemaining, 5, "refunded after expiry");
  assert.equal(h.db.jobs().length, 0);

  // One live job per wearer: a new Generate refunds a waiting job first.
  await h.generate(auth);
  h.setGemini("ok");
  const fresh = await h.generate(auth);
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.orderTriesRemaining, 4, "old held try refunded, new one used");
  assert.equal(h.db.count("global"), 1);

  // ...and a running retry blocks a new Generate for the same wearer.
  h.setGemini("busy");
  const held = (await h.generate(auth, { wearerKey: "w-obi" })).body.busyJobId as string;
  h.advance(20_000);
  let release!: () => void;
  h.setGemini(() => new Promise<never>((_, reject) => { release = () => reject(highDemand()); }));
  const running = h.generate(auth, { wearerKey: "w-obi", busyJobId: held });
  await new Promise((done) => setTimeout(done, 20));
  const blocked = await h.generate(auth, { wearerKey: "w-obi" });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "BUSY_JOB_ACTIVE");
  release();
  await new Promise((done) => setTimeout(done, 20));
  release();
  assert.equal((await running).status, 503);

  // Deep check M5: a second new Generate for the same wearer (another tab or
  // device) is blocked while the first runs, before any try is used.
  {
    const triesBefore = (await h.session(auth)).orderTriesRemaining;
    const globalBefore = h.db.count("global");
    let finish!: () => void;
    h.setGemini(() => new Promise<never>((_, reject) => { finish = () => reject(highDemand()); }));
    h.advance(20_000);
    const first = h.generate(auth, { wearerKey: "w-zed" });
    await new Promise((done) => setTimeout(done, 20));
    const second = await h.generate(auth, { wearerKey: "w-zed" });
    assert.equal(second.status, 409, "second tab blocked");
    assert.equal(second.body.code, "BUSY_JOB_ACTIVE");
    assert.equal(mapAiTryOnPreviewResponse(second.status, second.body).kind, "in_progress");
    assert.equal(h.db.count("global"), globalBefore + 1, "blocked attempt uses no global count");
    finish();
    await new Promise((done) => setTimeout(done, 20));
    finish();
    await first;
    assert.equal(h.db.jobs().filter(([path]) => path.includes("/run-")).length, 0, "run lease released when the request ends");
    const after = (await h.session(auth)).orderTriesRemaining;
    assert.ok(after >= triesBefore - 1, "at most the first request's try is used");
    // A different wearer is never blocked by it; the same wearer is free again.
    h.setGemini("ok");
    assert.equal((await h.generate(auth, { wearerKey: "w-zed" })).status, 200, "free again after the first ended");
  }

  // Light per-IP limit on retries.
  h.setGemini("busy");
  h.advance(20_000);
  h.blockBusyIp(true);
  const limited = await h.generate(auth, { wearerKey: "w-obi", busyJobId: held });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.retryAfterSeconds, 120);
}

// ------------------------------------------------------------ session closed or paid: 409, refunded
{
  const h = harness();
  const guest = await h.session();
  const auth = { "x-ai-try-on-session": guest.sessionToken! };
  const jobId = (await h.generate(auth)).body.busyJobId as string;
  // Fresh order (draft cleared): previews deleted, session closed, held try refunded.
  const cleared = await h.call("DELETE", "/api/ai-try-on?all=1&close=1", auth);
  assert.equal(cleared.status, 200);
  assert.equal(h.db.jobs().length, 0);
  assert.equal(h.db.orderCount(), 0);
  h.advance(20_000);
  const closed = await h.generate(auth, { busyJobId: jobId });
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, "SESSION_CLOSED");
  assert.equal(mapAiTryOnPreviewResponse(closed.status, closed.body).kind, "failed");

  // Signed in, order paid: payment cleanup refunds the account use too.
  const account = { authorization: "Bearer id-token-ada" };
  await h.session(account);
  const paidJob = (await h.generate(account)).body.busyJobId as string;
  const accountDoc = () => [...h.db.docs.entries()].find(([path]) => path.startsWith("aiTryOnUsage/account-"))?.[1];
  assert.equal((accountDoc()?.uses as number[]).length, 1);
  const result = await retireAiTryOnSessionForPaidOrder(
    { ownerUid: UID },
    { getDb: () => h.db.asFirestore(), createStore: (database) => createAiTryOnPreviewStore(database, h.bucket), log: () => undefined },
  );
  assert.equal(result, "deleted");
  assert.equal(h.db.jobs().length, 0);
  assert.equal((accountDoc()?.uses as number[]).length, 0, "account use refunded");
  h.advance(20_000);
  assert.equal((await h.generate(account, { busyJobId: paidJob })).status, 409);
}

// ------------------------------------------------------------ browser: retry schedule and give-up
const flush = () => new Promise((done) => setTimeout(done, 0));
const busyOutcome = (jobId = "busy-11111111-1111-4111-8111-111111111111"): AiTryOnPreviewOutcome => ({ kind: "busy", jobId, retryAfterSeconds: 10 });
const completed = (): AiTryOnPreviewOutcome => ({
  kind: "completed",
  resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "session-x" },
  preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
  orderTriesRemaining: 4,
});
const memoryStorage = () => {
  const backing = new Map<string, string>();
  return {
    backing,
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  };
};
const fakeClock = (random = 0.5) => {
  // Real "now" as the start: the panel compares settle times with its mount time.
  let clock = Date.now() + 1_000;
  const timers: Array<{ fn: () => void; ms: number }> = [];
  return {
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
    timers,
    random: () => random,
    /** Runs the next timer after moving the clock by its delay. */
    async fire() {
      const next = timers.shift();
      assert.ok(next, "a retry timer is waiting");
      clock += next.ms;
      next.fn();
      await flush();
      await flush();
      return next.ms;
    },
  };
};
{
  assert.deepEqual([...AI_TRY_ON_BUSY_RETRY_DELAYS_MS], [15_000, 30_000, 45_000, 60_000, 60_000]);
  assert.equal(AI_TRY_ON_BUSY_GIVE_UP_MS, 240_000);
  const time = fakeClock(0.5);
  const storage = memoryStorage();
  const jobs = createAiTryOnBackgroundJobs({ storage, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  const sent: Array<string | null> = [];
  const answers = [busyOutcome(), busyOutcome(), completed()];
  jobs.start({
    wearerId: "w-ada",
    wearerName: null,
    inputFingerprint: "fp",
    scope: "guest",
    run: async (busyJobId) => { sent.push(busyJobId); return answers.shift()!; },
    giveUpBusy: async () => assert.fail("not given up"),
  });
  await flush();
  const job = () => jobs.getSnapshot()["w-ada"] as AiTryOnBackgroundJob;
  assert.equal(job().status, "running");
  assert.equal(job().busy, true, "busy wording after the first busy answer");
  const marker = JSON.parse(storage.backing.get(AI_TRY_ON_PENDING_STORAGE_KEY)!)[0];
  assert.equal(marker.busyJobId, "busy-11111111-1111-4111-8111-111111111111", "reload keeps the job id");
  assert.deepEqual(Object.keys(marker).sort(), ["busyJobId", "inputFingerprint", "scope", "startedAt", "wearerId"]);
  assert.equal(await time.fire(), 15_000);
  assert.equal(await time.fire(), 30_000);
  assert.deepEqual(sent, [null, "busy-11111111-1111-4111-8111-111111111111", "busy-11111111-1111-4111-8111-111111111111"]);
  assert.equal(job().status, "completed");
  assert.equal(storage.backing.has(AI_TRY_ON_PENDING_STORAGE_KEY), false);
}
{
  // Jitter: ±20%.
  for (const [random, expected] of [[0, 12_000], [0.9999, 17_999]] as const) {
    const time = fakeClock(random);
    const jobs = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
    jobs.start({ wearerId: "w", wearerName: null, inputFingerprint: "fp", scope: "s", run: async () => busyOutcome() });
    await flush();
    assert.equal(time.timers[0].ms, expected);
    jobs.discardAll();
  }
}
{
  // Always busy: retries until 4 minutes, then gives up (server refund) with the busy failure.
  const time = fakeClock(0.5);
  const jobs = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  let requests = 0;
  const givenUp: string[] = [];
  jobs.start({
    wearerId: "w-ada",
    wearerName: "Ada",
    inputFingerprint: "fp",
    scope: "guest",
    // Each busy request takes 10 s (two Gemini attempts and the backoff).
    run: async () => { requests += 1; time.advance(10_000); return busyOutcome(); },
    giveUpBusy: async (jobId) => void givenUp.push(jobId),
  });
  await flush();
  const waits: number[] = [];
  while (time.timers.length) waits.push(await time.fire());
  assert.deepEqual(waits, [15_000, 30_000, 45_000, 60_000], "the fifth wait would start after 4 minutes");
  assert.equal(requests, 5);
  assert.deepEqual(givenUp, ["busy-11111111-1111-4111-8111-111111111111"]);
  const job = jobs.getSnapshot()["w-ada"];
  assert.equal(job.status, "failed");
  assert.equal(job.outcome?.kind, "busy_failed");
  assert.equal(aiTryOnToastKind(job, "fp"), "busy_failed");
}
{
  // Instant busy answers: all five retries, then give up.
  const time = fakeClock(0.5);
  const jobs = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  let requests = 0;
  jobs.start({ wearerId: "w", wearerName: null, inputFingerprint: "fp", scope: "s", run: async () => { requests += 1; return busyOutcome(); } });
  await flush();
  while (time.timers.length) await time.fire();
  assert.equal(requests, 6, "first request + 5 retries at most");
  assert.equal(jobs.getSnapshot().w.outcome?.kind, "busy_failed");
}
{
  // discardAll (order placed or cleared) stops the loop: no more requests, no give-up call.
  const time = fakeClock(0.5);
  const jobs = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  let requests = 0;
  let gaveUp = 0;
  jobs.start({
    wearerId: "w",
    wearerName: null,
    inputFingerprint: "fp",
    scope: "s",
    run: async () => { requests += 1; return busyOutcome(); },
    giveUpBusy: async () => { gaveUp += 1; },
  });
  await flush();
  jobs.discardAll();
  await time.fire();
  assert.equal(requests, 1);
  assert.equal(gaveUp, 0, "the server refunds held tries when the order is paid or cleared");
  assert.deepEqual(jobs.getSnapshot(), {});
}
{
  // A non-busy answer during the loop ends it as before.
  const time = fakeClock(0.5);
  const jobs = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  const answers: AiTryOnPreviewOutcome[] = [busyOutcome(), { kind: "failed", orderTriesRemaining: 5 }];
  jobs.start({ wearerId: "w", wearerName: null, inputFingerprint: "fp", scope: "s", run: async () => answers.shift()! });
  await flush();
  await time.fire();
  assert.equal(jobs.getSnapshot().w.outcome?.kind, "failed");
  assert.equal(aiTryOnToastKind(jobs.getSnapshot().w, "fp"), "failed");
}
{
  // Reload mid-busy: no photo to resend, so wait for a running request, then give the job up.
  const time = fakeClock(0.5);
  const storage = memoryStorage();
  const start = time.now() - 60_000;
  storage.setItem(
    AI_TRY_ON_PENDING_STORAGE_KEY,
    JSON.stringify([{ wearerId: "w-ada", inputFingerprint: "fp", scope: "guest", startedAt: start, busyJobId: "busy-11111111-1111-4111-8111-111111111111", requestAt: start + 40_000 }]),
  );
  const jobs = createAiTryOnBackgroundJobs({ storage, now: time.now, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  const givenUp: Array<[string, string]> = [];
  jobs.resume({
    scope: "guest",
    listStoredPreviews: async () => [],
    loadStoredPreview: async () => null,
    giveUpBusy: async (wearerId, jobId) => { givenUp.push([wearerId, jobId]); return true; },
  });
  await flush();
  assert.equal(jobs.getSnapshot()["w-ada"].busy, true, "the chip keeps the busy wording");
  while (jobs.getSnapshot()["w-ada"].status === "running") await time.fire();
  assert.ok(time.now() - (start + 40_000) >= AI_TRY_ON_RESUME_WINDOW_MS, "waits from the latest request");
  assert.deepEqual(givenUp, [["w-ada", "busy-11111111-1111-4111-8111-111111111111"]]);
  assert.equal(aiTryOnToastKind(jobs.getSnapshot()["w-ada"], "fp"), "busy_failed");
}

// ------------------------------------------------------------ gateway client
{
  assert.deepEqual(
    mapAiTryOnPreviewResponse(503, { code: "PROVIDER_BUSY", retryable: true, busyJobId: "busy-11111111-1111-4111-8111-111111111111", retryAfterSeconds: 10 }),
    { kind: "busy", jobId: "busy-11111111-1111-4111-8111-111111111111", retryAfterSeconds: 10 },
  );
  assert.equal(mapAiTryOnPreviewResponse(503, { code: "PROVIDER_BUSY", busyJobId: "nope" }).kind, "busy_failed");
  assert.equal(mapAiTryOnPreviewResponse(410, { code: "BUSY_JOB_GONE" }).kind, "failed");
  const seen: Array<{ url: string; method?: string; keepalive?: boolean }> = [];
  const released = await releaseAiTryOnBusyJob({
    jobId: "busy-11111111-1111-4111-8111-111111111111",
    wearerKey: "w-ada",
    fetchImpl: async (url, init) => {
      seen.push({ url, method: init?.method, keepalive: init?.keepalive });
      return new Response(JSON.stringify({ status: "released", released: true }), { status: 200 });
    },
  });
  assert.equal(released, true);
  assert.deepEqual(seen, [{ url: "/api/ai-try-on?busyJobId=busy-11111111-1111-4111-8111-111111111111&wearerKey=w-ada", method: "DELETE", keepalive: true }]);
}

// ------------------------------------------------------------ UI: chip, panel, toast
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
{
  const base: AiTryOnBackgroundJob = {
    wearerId: "w-ada", wearerName: null, inputFingerprint: "fp", scope: "guest", startedAt: 1, settledAt: null,
    status: "running", outcome: null, preview: null, storedPreviewId: null, modelId: null, resumed: false,
    seenInline: false, appliedByPanel: false, handledByHost: false, toast: "none", focusRequested: false, busy: true,
  };
  const chip = renderToStaticMarkup(createElement(AiTryOnGeneratingChip, { jobs: [base] }));
  assert.match(chip, /Still making your preview… it&#x27;s busy right now/);
  assert.match(chip, /data-ai-try-on-chip-busy/);
  assert.match(renderToStaticMarkup(createElement(AiTryOnGeneratingChip, { jobs: [{ ...base, busy: false }] })), /Making your preview…/);
  assert.match(
    renderToStaticMarkup(createElement(AiTryOnGeneratingChip, { jobs: [base, { ...base, wearerId: "w-obi" }] })),
    /Making 2 previews…/,
    "several wearers keep the count wording",
  );
  const failed = { ...base, status: "failed" as const, settledAt: 2, toast: "open" as const, outcome: { kind: "busy_failed" as const, orderTriesRemaining: null } };
  const toast = renderToStaticMarkup(
    createElement(AiTryOnBackgroundToasts, { toasts: [{ job: failed, kind: aiTryOnToastKind(failed, "fp") }], onView: () => undefined, onRetry: () => undefined, onClose: () => undefined }),
  );
  assert.match(toast, /data-ai-try-on-toast="busy_failed"/);
  assert.match(toast, /We couldn&#x27;t create your preview/);
  assert.match(toast, /couldn’t confirm whether a try was used/);
  assert.match(toast, /Try again/);
  // M5: blocked by another tab/device: says so and that no try was used.
  const elsewhere = { ...base, status: "failed" as const, settledAt: 2, toast: "open" as const, outcome: { kind: "in_progress" as const } };
  const elsewhereToast = renderToStaticMarkup(
    createElement(AiTryOnBackgroundToasts, { toasts: [{ job: elsewhere, kind: aiTryOnToastKind(elsewhere, "fp") }], onView: () => undefined, onRetry: () => undefined, onClose: () => undefined }),
  );
  assert.ok(elsewhereToast.includes("another tab or on another device"));
  assert.ok(elsewhereToast.includes("No try was used."));
  assert.ok(!elsewhereToast.includes("couldn’t confirm whether a try was used"));
}
{
  const target: AiTryOnWearerTarget = {
    wearerId: "w-ada", label: "Ada", inputFingerprint: "tryon-v1-0123456789abcdef", mode: "garment",
    garmentImageUrl: "https://example.test/style-a.jpg", fabricSwatchImageUrl: null, fitHints: [], orderDetails: null,
  };
  const time = fakeClock(0.5);
  const jobStore = createAiTryOnBackgroundJobs({ storage: null, now: time.now, random: time.random, setTimer: (fn, ms) => time.timers.push({ fn, ms }) });
  const requests: AiTryOnGenerationRequest[] = [];
  const answers: AiTryOnPreviewOutcome[] = [busyOutcome(), { kind: "busy_failed", orderTriesRemaining: 5 }];
  const released: Array<[string, string]> = [];
  const props: AiTryOnPhotoPanelProps = {
    targets: [target], triesPerOrder: 5, initialTriesRemaining: 5,
    onPreviewCreated: () => undefined, onUnavailable: () => undefined,
    preparePhoto: async () => ({ mimeType: "image/jpeg", data: "/9j/4AAQ" }),
    createThumbnailUrl: () => null, revokeThumbnailUrl: () => undefined,
    jobStore, requestPreview: async (request) => { requests.push(request); return answers.shift()!; },
    releaseBusyJob: async (jobId, wearerKey) => { released.push([jobId, wearerKey]); },
  };
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(createElement(AiTryOnPhotoPanel, props)); });
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => { await input.props.onChange({ target: { files: [file] } }); });
  const generate = renderer.root.find((node) => node.type === "button" && /Generate preview/.test(textOf(node)));
  await act(async () => { generate.props.onClick(); await flush(); });
  const loading = renderer.root.find((node) => node.props["data-ai-try-on-loading"] !== undefined && typeof node.type === "string");
  assert.equal(loading.props["data-ai-try-on-loading"], "busy");
  assert.match(textOf(loading), /Lots of people are making previews right now/);
  await act(async () => { await time.fire(); });
  assert.equal(requests[1].busyJobId, "busy-11111111-1111-4111-8111-111111111111", "the retry resends the same request with the job id");
  assert.equal(requests[1].personImage?.data, requests[0].personImage?.data);
  await act(async () => { await flush(); });
  const message = renderer.root.find((node) => node.props["data-ai-try-on-message"] === "busy_failed");
  assert.equal(textOf(message), COPY.busyFailedBody);
  assert.match(textOf(renderer.root), /5 tries left/);
  act(() => renderer.unmount());
}

console.log("PASS: AI Try-on busy retries (held try, retries, single charge, exactly-once refund, 409, wording)");
