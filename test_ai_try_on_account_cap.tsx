/**
 * AI Try-on account cap (follow-up to Step 7): signed-in accounts get at
 * most 15 successful previews in any rolling 30 days, across all orders,
 * on top of the 5-per-order, 10/hour IP and 1000 global limits. Guests are
 * unaffected. All mocked: no Gemini, Firebase or network calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { Firestore } from "firebase-admin/firestore";
import {
  aiTryOnAccountUsageDocId,
  createAiTryOnUsageLimits,
} from "./src/server/aiTryOnUsageLimits";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import { createAiTryOnPreviewStore, type AiTryOnPreviewBucket } from "./src/server/aiTryOnPreviewStore";
import {
  AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW,
  AI_TRY_ON_ACCOUNT_WINDOW_MS,
} from "./src/utils/aiTryOnGatewayContract";
import {
  fetchAiTryOnAvailability,
  mapAiTryOnPreviewResponse,
  type AiTryOnPreviewOutcome,
} from "./src/services/aiTryOnGateway";
import {
  AI_TRY_ON_MESSAGES,
  AiTryOnPhotoPanel,
  type AiTryOnPhotoPanelProps,
} from "./src/components/AiTryOnPhotoPanel";
import type { HttpResponse } from "./src/server/httpTypes";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Doc = Record<string, unknown>;

class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snap(path: string) {
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? structuredClone(data) : undefined) };
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

const DAY = 24 * 60 * 60 * 1000;
const UID = "firebase-uid-ada";
assert.equal(AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW, 15);
assert.equal(AI_TRY_ON_ACCOUNT_WINDOW_MS, 30 * DAY);

// ------------------------------------------------------------ usage limits: rolling window
{
  let clock = Date.UTC(2026, 9, 1, 9);
  const db = new FakeFirestore();
  const limits = createAiTryOnUsageLimits(db.asFirestore(), { now: () => clock });
  const accountPath = `aiTryOnUsage/${aiTryOnAccountUsageDocId(UID)}`;
  assert.match(accountPath, /^aiTryOnUsage\/account-[0-9a-f]{64}$/, "uid is hashed");
  assert.equal(accountPath.includes(UID), false);
  assert.equal(await limits.readAccountTriesRemaining(UID), 15);

  // 15 tries across three orders (5 each), one day apart.
  for (let order = 0; order < 3; order += 1) {
    for (let i = 0; i < 5; i += 1) {
      const reservation = await limits.reserve(`session-${order}`, { accountUid: UID });
      assert.equal(reservation.ok, true);
      clock += DAY / 10;
    }
    clock += DAY;
  }
  assert.equal(await limits.readAccountTriesRemaining(UID), 0);
  const blocked = await limits.reserve("session-3", { accountUid: UID });
  assert.deepEqual(blocked, { ok: false, code: "ACCOUNT_TRY_LIMIT_REACHED" }, "a fresh order doesn't help");
  assert.equal(await limits.readOrderTriesRemaining("session-3"), 5, "a refused try isn't counted on the order");
  assert.equal((db.docs.get("aiTryOnUsage/global") as { count: number }).count, 15, "nor globally");

  // Minimal record: kind, use times (≤15 numbers), updatedAt, expiresAt.
  const doc = db.docs.get(accountPath)!;
  assert.deepEqual(Object.keys(doc).sort(), ["expiresAt", "kind", "updatedAt", "uses"]);
  assert.equal((doc.uses as number[]).length, 15);
  assert.equal((doc.expiresAt as Date).getTime(), Math.max(...(doc.uses as number[])) + 30 * DAY);

  // Rolling: the oldest use leaves the window exactly 30 days later.
  const oldest = Math.min(...(doc.uses as number[]));
  clock = oldest + 30 * DAY - 1;
  assert.equal(await limits.readAccountTriesRemaining(UID), 0);
  clock = oldest + 30 * DAY;
  assert.equal(await limits.readAccountTriesRemaining(UID), 1);
  const freed = await limits.reserve("session-3", { accountUid: UID });
  assert.equal(freed.ok, true);
  assert.equal(freed.ok && freed.accountTriesRemaining, 0);
  assert.equal((db.docs.get(accountPath)!.uses as number[]).length, 15, "old uses are pruned, never more than 15 kept");

  // Refund: a failed generation gives the account try back.
  clock += 31 * DAY;
  const r = await limits.reserve("session-4", { accountUid: UID });
  assert.ok(r.ok && r.account);
  assert.equal(r.ok && r.accountTriesRemaining, 14);
  await limits.release(r.ok ? r.orderDocId : "", r.ok ? r.account : null);
  assert.equal(await limits.readAccountTriesRemaining(UID), 15);
  assert.equal(await limits.readOrderTriesRemaining("session-4"), 5);
  // Releasing twice doesn't hand out extra tries.
  await limits.release(r.ok ? r.orderDocId : "", r.ok ? r.account : null);
  assert.equal(await limits.readAccountTriesRemaining(UID), 15);

  // The per-order limit still applies first when the account has tries left.
  for (let i = 0; i < 5; i += 1) await limits.reserve("session-5", { accountUid: UID });
  assert.deepEqual(await limits.reserve("session-5", { accountUid: UID }), { ok: false, code: "ORDER_TRY_LIMIT_REACHED" });
  assert.equal(await limits.readAccountTriesRemaining(UID), 10);

  // Guests: no account record at all.
  const before = db.docs.size;
  const guest = await limits.reserve("guest-session");
  assert.ok(guest.ok);
  assert.equal(guest.ok && guest.account, null);
  assert.equal(guest.ok && guest.accountTriesRemaining, null);
  assert.equal(db.docs.size, before + 1, "only the guest order counter is added");

  // Concurrent reservations can't overshoot the account cap.
  const db2 = new FakeFirestore();
  const limits2 = createAiTryOnUsageLimits(db2.asFirestore(), { now: () => clock, triesPerOrder: 100 });
  const results = await Promise.all(Array.from({ length: 20 }, () => limits2.reserve("s", { accountUid: UID })));
  assert.equal(results.filter((entry) => entry.ok).length, 15);
}

// ------------------------------------------------------------ HTTP
const response = () => {
  const state: { status: number; body: unknown } = { status: 200, body: undefined };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader() { return res; },
    json(body) { state.body = body; return body; },
  };
  return { res, state };
};
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString("base64");
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]).toString("base64");

const harness = () => {
  const db = new FakeFirestore();
  const counters = { gemini: 0 };
  let geminiFails = false;
  const logs: string[] = [];
  const deps: AiTryOnHttpDependencies = {
    environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" },
    getDb: () => db.asFirestore(),
    consumeIpRateLimit: async () => undefined,
    consumeGuestSessionLimit: async () => undefined,
    verifyIdToken: async (token) => {
      if (token === "id-token-ada") return { uid: UID, firebase: { sign_in_provider: "password" } };
      throw new Error("bad token");
    },
    createGenerateContent: () => async () => {
      counters.gemini += 1;
      if (geminiFails) throw Object.assign(new Error("upstream 503"), { status: 503 });
      return { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] };
    },
    createPreviewStore: (database) => createAiTryOnPreviewStore(database, new FakeBucket()),
    compactPreviewImage: async () => ({ mimeType: "image/webp", data: Buffer.from("RIFF0000WEBPVP8 x").toString("base64"), bytes: 17, width: 1024, height: 1024 }),
    log: (line) => void logs.push(line),
  };
  return { db, deps, counters, logs, setGeminiFails: (value: boolean) => { geminiFails = value; } };
};
const call = async (h: ReturnType<typeof harness>, method: string, url: string, headers: Record<string, string>, body?: unknown) => {
  const result = response();
  await handleAiTryOn({ method, url, headers: { "x-forwarded-for": "203.0.113.5", ...headers }, body } as never, result.res, h.deps);
  return result.state;
};
const generateBody = { mode: "garment", inputFingerprint: "tryon-v1-0123456789abcdef", wearerKey: "w-ada", personImage: { mimeType: "image/jpeg", data: jpeg }, garmentImage: { mimeType: "image/png", data: png } };
const auth = { authorization: "Bearer id-token-ada" };
type SessionBody = { status: string; orderTriesRemaining: number; accountTriesRemaining?: number; sessionToken: string | null };

{
  const h = harness();
  const first = (await call(h, "POST", "/api/ai-try-on?action=session", auth)).body as SessionBody;
  assert.equal(first.orderTriesRemaining, 5);
  assert.equal(first.accountTriesRemaining, 15, "signed-in session reports the account's tries");

  // Three orders × 5 = 15. Each fresh order = delete all + close, then a new session.
  for (let order = 0; order < 3; order += 1) {
    await call(h, "POST", "/api/ai-try-on?action=session", auth);
    for (let i = 0; i < 5; i += 1) {
      const made = await call(h, "POST", "/api/ai-try-on", auth, generateBody);
      assert.equal(made.status, 200);
      assert.equal((made.body as { accountTriesRemaining: number }).accountTriesRemaining, 15 - (order * 5 + i + 1));
    }
    await call(h, "DELETE", "/api/ai-try-on?all=1&close=1", auth);
  }
  const fresh = (await call(h, "POST", "/api/ai-try-on?action=session", auth)).body as SessionBody;
  assert.equal(fresh.orderTriesRemaining, 5, "the fresh order still has its own 5");
  assert.equal(fresh.accountTriesRemaining, 0, "but the account has none left");

  const geminiBefore = h.counters.gemini;
  const refused = await call(h, "POST", "/api/ai-try-on", auth, generateBody);
  assert.equal(refused.status, 429);
  assert.deepEqual(refused.body, {
    error: "This account has used all 15 AI Try-on previews for the last 30 days.",
    code: "ACCOUNT_TRY_LIMIT_REACHED",
    retryable: false,
    accountTriesRemaining: 0,
  });
  assert.equal(h.counters.gemini, geminiBefore, "refused before Gemini");
  assert.ok(h.logs.some((line) => line.includes("account_limit_reached")));
  assert.equal(h.logs.some((line) => line.includes(UID)), false, "logs carry no uid");
  assert.deepEqual(mapAiTryOnPreviewResponse(refused.status, refused.body), { kind: "account_limit_reached" });

  // Payment cleanup / closing sessions never resets the account counter.
  assert.equal(((await call(h, "POST", "/api/ai-try-on?action=session", auth)).body as SessionBody).accountTriesRemaining, 0);
}

{
  // Refund on failure: account and order tries both come back, and the error says so.
  const h = harness();
  await call(h, "POST", "/api/ai-try-on?action=session", auth);
  h.setGeminiFails(true);
  const failed = await call(h, "POST", "/api/ai-try-on", auth, generateBody);
  assert.equal(failed.status, 502);
  const failedBody = failed.body as { orderTriesRemaining: number; accountTriesRemaining: number };
  assert.equal(failedBody.orderTriesRemaining, 5);
  assert.equal(failedBody.accountTriesRemaining, 15);
  assert.deepEqual(mapAiTryOnPreviewResponse(failed.status, failed.body), { kind: "failed", orderTriesRemaining: 5, accountTriesRemaining: 15 });
  const after = (await call(h, "POST", "/api/ai-try-on?action=session", auth)).body as SessionBody;
  assert.equal(after.accountTriesRemaining, 15);
}

{
  // Guests are unaffected: no account field, no account record, 5 per order as before.
  const h = harness();
  const guest = (await call(h, "POST", "/api/ai-try-on?action=session", {})).body as SessionBody;
  assert.equal("accountTriesRemaining" in guest, false);
  const headers = { "x-ai-try-on-session": guest.sessionToken! };
  const made = await call(h, "POST", "/api/ai-try-on", headers, generateBody);
  assert.equal(made.status, 200);
  assert.equal("accountTriesRemaining" in (made.body as object), false);
  assert.equal([...h.db.docs.keys()].some((key) => key.startsWith("aiTryOnUsage/account-")), false);
}

// ------------------------------------------------------------ browser gateway
{
  const credentials = { sessionToken: null, getIdToken: async () => "id-token-ada" };
  const fetchImpl = async () =>
    new Response(JSON.stringify({ status: "available", triesPerOrder: 5, orderTriesRemaining: 5, accountTriesRemaining: 2, previews: [], sessionToken: null }), { status: 200 });
  const details = await fetchAiTryOnAvailability({ credentials, fetchImpl });
  assert.equal(details.status === "available" && details.accountTriesRemaining, 2);
  const guestFetch = async () =>
    new Response(JSON.stringify({ status: "available", triesPerOrder: 5, orderTriesRemaining: 5 }), { status: 200 });
  const guestDetails = await fetchAiTryOnAvailability({ credentials: { sessionToken: null, getIdToken: async () => null }, fetchImpl: guestFetch });
  assert.equal(guestDetails.status === "available" && guestDetails.accountTriesRemaining, null);
  assert.deepEqual(mapAiTryOnPreviewResponse(200, {
    status: "completed",
    image: { mimeType: "image/webp", data: "UklGRg==" },
    resultReference: { kind: "verified_private_try_on_result", assetId: "x", ownerBindingId: "y" },
    orderTriesRemaining: 4,
    accountTriesRemaining: 1,
  }), {
    kind: "completed",
    resultReference: { kind: "verified_private_try_on_result", assetId: "x", ownerBindingId: "y" },
    preview: { mimeType: "image/webp", data: "UklGRg==" },
    orderTriesRemaining: 4,
    accountTriesRemaining: 1,
    storedPreviewId: null,
  });
}

// ------------------------------------------------------------ panel: min of order and account, account message
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
const target = {
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: "tryon-v1-0123456789abcdef",
  mode: "garment" as const,
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [],
  orderDetails: null,
};
const renderPanel = (props: Partial<AiTryOnPhotoPanelProps>) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [target],
      triesPerOrder: 5,
      initialTriesRemaining: 5,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      preparePhoto: async () => ({ mimeType: "image/jpeg" as const, data: "/9j/4AAQ" }),
      createThumbnailUrl: () => null,
      revokeThumbnailUrl: () => undefined,
      ...props,
    }));
  });
  return renderer;
};
const choosePhoto = async (renderer: ReturnType<typeof create>) => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  await act(async () => {
    await input.props.onChange({ target: { files: [Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" })] } });
  });
};
const generateButton = (renderer: ReturnType<typeof create>) =>
  renderer.root.find((node) => node.type === "button" && /Generate preview|Make a new preview/.test(textOf(node)));
const alertText = (renderer: ReturnType<typeof create>) =>
  textOf(renderer.root.find((node) => node.type === "div" && node.props.role === "alert"));

assert.equal(
  AI_TRY_ON_MESSAGES.accountOutOfPreviews,
  "You've used all 15 AI Try-on previews on your account in the last 30 days. You can still continue without one.",
);
{
  // Shown tries = min(order, account).
  assert.match(textOf(renderPanel({ initialTriesRemaining: 5, initialAccountTriesRemaining: 2 }).root), /2 tries left/);
  assert.match(textOf(renderPanel({ initialTriesRemaining: 3, initialAccountTriesRemaining: 9 }).root), /3 tries left/);
  assert.match(textOf(renderPanel({ initialTriesRemaining: 4 }).root), /4 tries left/, "guests: order only");
}
{
  // Account at 0 on load: account message, Generate disabled.
  const renderer = renderPanel({ initialTriesRemaining: 5, initialAccountTriesRemaining: 0 });
  assert.equal(alertText(renderer), AI_TRY_ON_MESSAGES.accountOutOfPreviews);
  await choosePhoto(renderer);
  assert.equal(generateButton(renderer).props.disabled, true);
}
{
  // Order and account both at 0: the account message wins (a fresh order wouldn't help).
  const renderer = renderPanel({ initialTriesRemaining: 0, initialAccountTriesRemaining: 0 });
  assert.equal(alertText(renderer), AI_TRY_ON_MESSAGES.accountOutOfPreviews);
}
{
  // Server refuses mid-flow (another device used the last one).
  const renderer = renderPanel({ initialAccountTriesRemaining: 3, requestPreview: async (): Promise<AiTryOnPreviewOutcome> => ({ kind: "account_limit_reached" }) });
  await choosePhoto(renderer);
  await act(async () => { await generateButton(renderer).props.onClick(); });
  assert.equal(alertText(renderer), AI_TRY_ON_MESSAGES.accountOutOfPreviews);
  assert.match(textOf(renderer.root), /0 tries left/);
}
{
  // A success that uses the account's last try leaves "0 tries left"; a refunded failure reports the min.
  const renderer = renderPanel({
    initialAccountTriesRemaining: 1,
    requestPreview: async () => ({
      kind: "completed",
      resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "s" },
      preview: { mimeType: "image/webp", data: "UklGRg==" },
      orderTriesRemaining: 4,
      accountTriesRemaining: 0,
    }),
  });
  await choosePhoto(renderer);
  await act(async () => { await generateButton(renderer).props.onClick(); });
  assert.match(textOf(renderer.root), /0 tries left/);
  const failed = renderPanel({
    initialAccountTriesRemaining: 2,
    requestPreview: async () => ({ kind: "failed", orderTriesRemaining: 5, accountTriesRemaining: 2 }),
  });
  await choosePhoto(failed);
  await act(async () => { await generateButton(failed).props.onClick(); });
  assert.equal(alertText(failed), AI_TRY_ON_MESSAGES.failed(2));
}

// ------------------------------------------------------------ rules: account counters stay server-only
{
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/aiTryOnUsage\/\{[^}]+\}\s*\{\s*allow read, write: if false;/);
}

console.log("PASS: AI Try-on account cap (15 per rolling 30 days, signed-in only)");
