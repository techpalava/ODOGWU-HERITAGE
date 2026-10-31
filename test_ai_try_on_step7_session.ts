/**
 * AI Try-on Step 7: server-issued sessions, server-side preview deletion at
 * payment, and compact preview storage. All mocked: no Gemini, Firebase,
 * Stripe or PayPal calls. (sharp runs locally on generated pixels.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import {
  AI_TRY_ON_GUEST_SESSION_IP_LIMIT,
  AI_TRY_ON_SESSION_COLLECTION,
  AI_TRY_ON_SESSION_OWNER_COLLECTION,
  AI_TRY_ON_SESSION_RETENTION_MS,
  AI_TRY_ON_SESSION_TOKEN_PATTERN,
  AiTryOnGuestSessionLimitError,
  createAiTryOnSessions,
  hashAiTryOnSessionToken,
} from "./src/server/aiTryOnSession";
import {
  createAiTryOnPreviewStore,
  type AiTryOnPreviewBucket,
} from "./src/server/aiTryOnPreviewStore";
import {
  AI_TRY_ON_PREVIEW_MAX_EDGE_PX,
  compactAiTryOnPreviewImage,
} from "./src/server/aiTryOnPreviewImage";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import { retireAiTryOnSessionForPaidOrder } from "./src/server/aiTryOnPaymentCleanup";
import {
  createFutureOrderV2PaymentRecordHandler,
  type FutureOrderV2PaymentRecordStore,
} from "./src/server/futureOrderV2PaymentRecord";
import { handleFutureOrderV2PayPalCapture } from "./src/server/futureOrderV2PayPalPayment";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import {
  AI_TRY_ON_LEGACY_ORDER_KEY_STORAGE_KEY,
  AI_TRY_ON_SESSION_STORAGE_KEY,
  aiTryOnCredentialsForIdentity,
  readAiTryOnSessionToken,
  retireAiTryOnSessions,
  saveAiTryOnSessionToken,
} from "./src/services/aiTryOnSessionToken";
import type { HttpResponse } from "./src/server/httpTypes";

type Doc = Record<string, unknown>;

class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  failSetsFor: string | null = null;
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
          set: async (data: Doc) => {
            if (this.failSetsFor && path.startsWith(this.failSetsFor)) throw new Error("firestore down");
            this.docs.set(path, { ...data });
          },
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
  failSaves = false;
  file(path: string) {
    return {
      save: async (data: Buffer) => {
        if (this.failSaves) throw new Error("storage down");
        this.objects.set(path, data);
      },
      download: async (): Promise<[Buffer]> => {
        const bytes = this.objects.get(path);
        if (!bytes) throw new Error("missing");
        return [bytes];
      },
      delete: async () => void this.objects.delete(path),
    };
  }
}

const DAY = 24 * 60 * 60 * 1000;
const UID_A = "firebase-uid-ada";
const UID_B = "firebase-uid-obi";
const FINGERPRINT = "tryon-v1-0123456789abcdef";

// ------------------------------------------------------------ sessions
{
  let clock = Date.UTC(2026, 9, 31, 12);
  const db = new FakeFirestore();
  let guestSlots = 2;
  const sessions = createAiTryOnSessions(db.asFirestore(), {
    now: () => clock,
    allowNewGuestSession: async () => {
      if (guestSlots <= 0) throw new AiTryOnGuestSessionLimitError();
      guestSlots -= 1;
    },
  });

  // Guest: the server mints the token; only its hash is stored.
  const guest = await sessions.resolve({ uid: null, token: null });
  assert.ok(guest.sessionToken && AI_TRY_ON_SESSION_TOKEN_PATTERN.test(guest.sessionToken));
  assert.equal(guest.sessionId, hashAiTryOnSessionToken(guest.sessionToken!));
  assert.equal(guest.created, true);
  const guestDoc = db.docs.get(`${AI_TRY_ON_SESSION_COLLECTION}/${guest.sessionId}`)!;
  assert.deepEqual(Object.keys(guestDoc).sort(), ["closedAt", "expiresAt", "ownerUidHash"], "minimal record");
  assert.equal(guestDoc.ownerUidHash, null);
  assert.equal((guestDoc.expiresAt as Date).getTime(), clock + AI_TRY_ON_SESSION_RETENTION_MS);
  assert.equal(AI_TRY_ON_SESSION_RETENTION_MS, 90 * DAY);
  assert.equal(JSON.stringify([...db.docs.entries()]).includes(guest.sessionToken!), false, "token never stored");

  // Reload with the token: same session, nothing minted.
  const reloaded = await sessions.resolve({ uid: null, token: guest.sessionToken });
  assert.deepEqual(reloaded, { sessionId: guest.sessionId, sessionToken: guest.sessionToken, created: false });
  assert.equal(await sessions.authorize({ uid: null, token: guest.sessionToken }), guest.sessionId);

  // Forged tokens are never accepted, and browser-chosen ones aren't either.
  const forged = `tts1_${"x".repeat(43)}`;
  assert.equal(await sessions.authorize({ uid: null, token: forged }), null);
  assert.equal(await sessions.authorize({ uid: null, token: "tryon-0123456789abcdef0123456789abcdef" }), null);
  assert.equal(await sessions.authorize({ uid: null, token: null }), null);
  const fromForged = await sessions.resolve({ uid: null, token: forged });
  assert.notEqual(fromForged.sessionToken, forged, "a forged token gets a NEW server token, not that one");

  // New guest sessions are limited per IP (clearing storage to get tries).
  await assert.rejects(sessions.resolve({ uid: null, token: null }), AiTryOnGuestSessionLimitError);
  assert.equal(
    (await sessions.resolve({ uid: null, token: guest.sessionToken })).sessionId,
    guest.sessionId,
    "an existing guest session keeps working at the limit",
  );
  assert.deepEqual(AI_TRY_ON_GUEST_SESSION_IP_LIMIT, { bucket: "ai-try-on-guest-session-ip", limit: 5, windowMs: DAY });

  // Signed in: tied to the account; clearing storage or another device returns the same session.
  const account = await sessions.resolve({ uid: UID_A, token: null });
  assert.equal(account.sessionToken, null, "no browser secret for signed-in customers");
  assert.deepEqual(await sessions.resolve({ uid: UID_A, token: null }), { ...account, created: false });
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), account.sessionId);
  assert.equal(await sessions.authorize({ uid: UID_B, token: null }), null, "another account can't use it");
  assert.equal(JSON.stringify([...db.docs.entries()]).includes(UID_A), false, "raw uid never stored");
  assert.equal(await sessions.findOpenForUid(UID_A), account.sessionId);

  // Concurrent first calls from two tabs mint one session.
  const [tab1, tab2] = await Promise.all([
    sessions.resolve({ uid: UID_B, token: null }),
    sessions.resolve({ uid: UID_B, token: null }),
  ]);
  assert.equal(tab1.sessionId, tab2.sessionId);

  // Signing in adopts an open guest session (tries + previews follow).
  const adopter = "firebase-uid-chidi";
  const adopted = await sessions.resolve({ uid: adopter, token: guest.sessionToken });
  assert.equal(adopted.sessionId, guest.sessionId);
  assert.equal(await sessions.authorize({ uid: null, token: guest.sessionToken }), null, "the guest token alone no longer works");
  assert.equal(await sessions.authorize({ uid: adopter, token: null }), guest.sessionId);
  // An account that already has a session keeps it; the guest one isn't merged.
  const other = await sessions.resolve({ uid: UID_A, token: fromForged.sessionToken });
  assert.equal(other.sessionId, account.sessionId);

  // Close: idempotent, never reopened; the next order gets a fresh session.
  await sessions.close(account.sessionId);
  await sessions.close(account.sessionId);
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null);
  const ownerPointers = () => [...db.docs.entries()].filter(([path]) => path.startsWith(`${AI_TRY_ON_SESSION_OWNER_COLLECTION}/`));
  assert.equal(
    ownerPointers().some(([, data]) => data.sessionId === account.sessionId),
    false,
    "the account no longer points at the closed session",
  );
  const next = await sessions.resolve({ uid: UID_A, token: null });
  assert.notEqual(next.sessionId, account.sessionId);
  assert.equal(next.created, true);

  // Expiry: a session past 90 days is not served.
  clock += 90 * DAY + 1;
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null);
  assert.equal(await sessions.authorize({ uid: null, token: fromForged.sessionToken }), null);
}

// ------------------------------------------------------------ HTTP with sessions
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

const httpHarness = () => {
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const counters = { gemini: 0, ip: 0, guestMints: 0, verify: 0 };
  let guestLimit = 5;
  const deps: AiTryOnHttpDependencies = {
    environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" },
    getDb: () => db.asFirestore(),
    consumeIpRateLimit: async () => { counters.ip += 1; },
    consumeGuestSessionLimit: async () => {
      counters.guestMints += 1;
      if (counters.guestMints > guestLimit) {
        const { AuthRateLimitError } = await import("./src/server/authRateLimit");
        throw new AuthRateLimitError(3600);
      }
    },
    verifyIdToken: async (token) => {
      counters.verify += 1;
      if (token === "id-token-ada") return { uid: UID_A, firebase: { sign_in_provider: "password" } };
      if (token === "id-token-anon") return { uid: "anon-uid", firebase: { sign_in_provider: "anonymous" } };
      throw new Error("bad token");
    },
    createGenerateContent: () => async () => {
      counters.gemini += 1;
      return { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] };
    },
    createPreviewStore: (database) => createAiTryOnPreviewStore(database, bucket),
    compactPreviewImage: async () => ({ mimeType: "image/webp", data: Buffer.from("RIFF0000WEBPVP8 compact").toString("base64"), bytes: 23, width: 683, height: 1024 }),
    log: () => undefined,
  };
  return { db, bucket, deps, counters, setGuestLimit: (n: number) => { guestLimit = n; } };
};
const call = async (
  h: ReturnType<typeof httpHarness>,
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: unknown,
) => {
  const result = response();
  await handleAiTryOn({ method, url, headers: { "x-forwarded-for": "203.0.113.5", ...headers }, body } as never, result.res, h.deps);
  return result.state;
};
const session = (h: ReturnType<typeof httpHarness>, headers: Record<string, string> = {}) =>
  call(h, "POST", "/api/ai-try-on?action=session", headers);
const generateBody = (overrides: Record<string, unknown> = {}) => ({
  mode: "garment",
  inputFingerprint: FINGERPRINT,
  wearerKey: "w-ada",
  personImage: { mimeType: "image/jpeg", data: jpeg },
  garmentImage: { mimeType: "image/png", data: png },
  ...overrides,
});
const generate = (h: ReturnType<typeof httpHarness>, headers: Record<string, string>, overrides = {}) =>
  call(h, "POST", "/api/ai-try-on", headers, generateBody(overrides));

{
  const h = httpHarness();
  // No session: refused before the IP limit, a try or Gemini.
  const none = await generate(h, {});
  assert.equal(none.status, 401);
  assert.equal((none.body as { code: string }).code, "SESSION_REQUIRED");
  const forged = await generate(h, { "x-ai-try-on-session": `tts1_${"z".repeat(43)}` });
  assert.equal(forged.status, 401);
  assert.equal(h.counters.gemini + h.counters.ip, 0);

  // An old body-level orderKey is refused outright.
  assert.equal((await generate(h, {}, { orderKey: "tryon-0123456789abcdef0123456789abcdef" })).status, 400);

  // Guest: server-issued token in the session response; tries tracked per session.
  const first = await session(h);
  const firstBody = first.body as { status: string; sessionToken: string; orderTriesRemaining: number; previews: unknown[] };
  assert.equal(firstBody.status, "available");
  assert.match(firstBody.sessionToken, AI_TRY_ON_SESSION_TOKEN_PATTERN);
  assert.equal(firstBody.orderTriesRemaining, 5);
  const guestHeaders = { "x-ai-try-on-session": firstBody.sessionToken };
  const made = await generate(h, guestHeaders);
  assert.equal(made.status, 200);
  const madeBody = made.body as { image: { mimeType: string }; previewStored: boolean; orderTriesRemaining: number };
  assert.equal(madeBody.image.mimeType, "image/webp", "the browser gets the compact copy too");
  assert.equal(madeBody.previewStored, true);
  assert.equal(h.counters.ip, 1, "the 10/hour IP limit still applies");
  const again = (await session(h, guestHeaders)).body as { sessionToken: string; orderTriesRemaining: number; previews: unknown[] };
  assert.equal(again.sessionToken, firstBody.sessionToken, "reload keeps the session");
  assert.equal(again.orderTriesRemaining, 4);
  assert.equal(again.previews.length, 1);

  // One preview per wearer per session: a new one overwrites the file.
  await generate(h, guestHeaders);
  await generate(h, guestHeaders);
  assert.equal(h.bucket.objects.size, 1, "still exactly one file for this wearer");
  assert.equal([...h.db.docs.keys()].filter((key) => key.startsWith("aiTryOnPreviews/")).length, 1);
  await generate(h, guestHeaders, { wearerKey: "w-obi" });
  assert.equal(h.bucket.objects.size, 2, "one per wearer");

  // Guest limit: a guest who clears storage gets a new session only within the IP allowance.
  h.setGuestLimit(1);
  const limited = await session(h);
  assert.deepEqual(limited.body, { status: "unavailable", code: "RATE_LIMITED" });
  assert.equal(((await session(h, guestHeaders)).body as { status: string }).status, "available");

  // Fresh order: delete all + close; the next call is a new session with 5 tries and no previews.
  h.setGuestLimit(99);
  const closed = await call(h, "DELETE", "/api/ai-try-on?all=1&close=1", guestHeaders);
  assert.deepEqual(closed.body, { status: "deleted", deleted: 2 });
  assert.equal(h.bucket.objects.size, 0);
  assert.equal((await generate(h, guestHeaders)).status, 401, "a closed session can't be used again");
  const fresh = (await session(h, guestHeaders)).body as { sessionToken: string; orderTriesRemaining: number; previews: unknown[] };
  assert.notEqual(fresh.sessionToken, firstBody.sessionToken);
  assert.equal(fresh.orderTriesRemaining, 5);
  assert.deepEqual(fresh.previews, []);
}

{
  // Signed in: tries survive clearing storage and switching device.
  const h = httpHarness();
  const auth = { authorization: "Bearer id-token-ada" };
  const first = (await session(h, auth)).body as { sessionToken: string | null };
  assert.equal(first.sessionToken, null);
  for (let index = 0; index < 5; index += 1) assert.equal((await generate(h, auth)).status, 200);
  const out = await generate(h, auth);
  assert.equal((out.body as { code: string }).code, "ORDER_TRY_LIMIT_REACHED");
  const otherDevice = (await session(h, auth)).body as { orderTriesRemaining: number; previews: unknown[] };
  assert.equal(otherDevice.orderTriesRemaining, 0, "clearing storage does not reset tries");
  assert.equal(otherDevice.previews.length, 1, "the preview follows the account");

  // A bad ID token is refused, not treated as a guest.
  assert.deepEqual((await session(h, { authorization: "Bearer forged" })).body, { status: "unavailable", code: "AUTH_REQUIRED" });
  assert.equal((await generate(h, { authorization: "Bearer forged" })).status, 401);
  // Anonymous Firebase users are guests.
  const anon = (await session(h, { authorization: "Bearer id-token-anon" })).body as { sessionToken: string | null };
  assert.match(anon.sessionToken ?? "", AI_TRY_ON_SESSION_TOKEN_PATTERN);

  // Guest adoption at sign-in.
  const g = httpHarness();
  const guestToken = ((await session(g)).body as { sessionToken: string }).sessionToken;
  await generate(g, { "x-ai-try-on-session": guestToken });
  const adopted = (await session(g, { authorization: "Bearer id-token-ada", "x-ai-try-on-session": guestToken })).body as {
    orderTriesRemaining: number; previews: unknown[]; sessionToken: string | null;
  };
  assert.equal(adopted.orderTriesRemaining, 4);
  assert.equal(adopted.previews.length, 1);
  assert.equal(adopted.sessionToken, null);
  // The browser's follow-up guest-only close is a no-op once adopted…
  assert.deepEqual((await call(g, "DELETE", "/api/ai-try-on?all=1&close=1", { "x-ai-try-on-session": guestToken })).body, { status: "deleted", deleted: 0 });
  assert.equal(((await session(g, { authorization: "Bearer id-token-ada" })).body as { previews: unknown[] }).previews.length, 1);
  // …and removes a guest session that was NOT adopted (the account already had one).
  const strayToken = ((await session(g)).body as { sessionToken: string }).sessionToken;
  await generate(g, { "x-ai-try-on-session": strayToken }, { wearerKey: "w-obi" });
  const beforeObjects = g.bucket.objects.size;
  await session(g, { authorization: "Bearer id-token-ada", "x-ai-try-on-session": strayToken });
  assert.deepEqual((await call(g, "DELETE", "/api/ai-try-on?all=1&close=1", { "x-ai-try-on-session": strayToken })).body, { status: "deleted", deleted: 1 });
  assert.equal(g.bucket.objects.size, beforeObjects - 1);
}

{
  // Re-encoding failure: the preview is returned but nothing is stored.
  const h = httpHarness();
  h.deps.compactPreviewImage = async () => { throw new Error("sharp unavailable"); };
  const token = ((await session(h)).body as { sessionToken: string }).sessionToken;
  const made = await generate(h, { "x-ai-try-on-session": token });
  assert.equal(made.status, 200);
  assert.equal((made.body as { previewStored: boolean }).previewStored, false);
  assert.equal(h.bucket.objects.size, 0);
}

// ------------------------------------------------------------ no orphans on failed writes
{
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const store = createAiTryOnPreviewStore(db.asFirestore(), bucket);
  const save = (previewId: string) =>
    store.save({ orderKey: "session-1", wearerKey: "w-ada", previewId, inputFingerprint: FINGERPRINT, image: { mimeType: "image/webp", data: "UklGRg==" } });
  db.failSetsFor = "aiTryOnPreviews/";
  await assert.rejects(save("tryon-11111111-1111-4111-8111-111111111111"));
  assert.equal(bucket.objects.size, 0, "the upload is removed when its record can't be written");
  assert.equal(db.docs.size, 0);
  db.failSetsFor = null;
  await save("tryon-22222222-2222-4222-8222-222222222222");
  bucket.failSaves = true;
  await assert.rejects(save("tryon-33333333-3333-4333-8333-333333333333"));
  assert.equal(bucket.objects.size, 0, "a failed overwrite leaves no stale file…");
  assert.equal(db.docs.size, 0, "…and no record pointing at it");
  const doc = (() => {
    bucket.failSaves = false;
    return save("tryon-44444444-4444-4444-8444-444444444444").then(() => [...db.docs.values()][0]);
  })();
  assert.deepEqual(Object.keys(await doc).sort(), ["expiresAt", "inputFingerprint", "mimeType", "orderDocId", "previewId", "wearerKey"], "minimal record");
}

// ------------------------------------------------------------ compact re-encoding (real sharp)
{
  // A photo-like 1024x1536 PNG (smooth gradients + grain), like Gemini output.
  const width = 1024;
  const height = 1536;
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const noise = (seed >> 16) % 24;
      const index = (y * width + x) * 3;
      raw[index] = (x * 255) / width / 1.3 + noise;
      raw[index + 1] = (y * 255) / height / 1.5 + noise;
      raw[index + 2] = 120 + Math.sin(x / 40) * 40 + noise;
    }
  }
  const input = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const compact = await compactAiTryOnPreviewImage({ mimeType: "image/png", data: input.toString("base64") });
  assert.equal(compact.mimeType, "image/webp");
  assert.equal(Math.max(compact.width, compact.height), AI_TRY_ON_PREVIEW_MAX_EDGE_PX, "long edge ≤ 1024");
  assert.equal(compact.height, 1024);
  assert.equal(compact.width, 683);
  assert.ok(compact.bytes < input.length / 3, `compact ${compact.bytes} B vs ${input.length} B`);
  const meta = await sharp(Buffer.from(compact.data, "base64")).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.exif, undefined, "metadata stripped");
  // Never enlarged.
  const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#a33" } }).png().toBuffer();
  const smallCompact = await compactAiTryOnPreviewImage({ mimeType: "image/png", data: small.toString("base64") });
  assert.deepEqual([smallCompact.width, smallCompact.height], [300, 200]);
  await assert.rejects(compactAiTryOnPreviewImage({ mimeType: "image/png", data: Buffer.from("not an image").toString("base64") }));
}

// ------------------------------------------------------------ payment cleanup
{
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const sessions = createAiTryOnSessions(db.asFirestore());
  const store = createAiTryOnPreviewStore(db.asFirestore(), bucket);
  const { sessionId } = await sessions.resolve({ uid: UID_A, token: null });
  for (const wearerKey of ["w-ada", "w-obi"]) {
    await store.save({ orderKey: sessionId, wearerKey, previewId: `tryon-${"5".repeat(8)}-5555-4555-8555-${"5".repeat(12)}`, inputFingerprint: FINGERPRINT, image: { mimeType: "image/webp", data: "UklGRg==" } });
  }
  const logs: string[] = [];
  const deps = { getDb: () => db.asFirestore(), createStore: () => store, log: (line: string) => logs.push(line) };
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A }, deps), "deleted");
  assert.equal(bucket.objects.size, 0);
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null, "session closed");
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A }, deps), "no_session", "idempotent");
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_B }, deps), "no_session");
  assert.equal(logs.join("\n").includes(UID_A), false, "no PII in logs");
  assert.equal(logs.join("\n").includes(sessionId), false);
  assert.match(logs[0], /"status":"deleted","previews":2/);

  // Failures and hangs never throw; a failed delete leaves the session open to retry.
  const db2 = new FakeFirestore();
  const sessions2 = createAiTryOnSessions(db2.asFirestore());
  await sessions2.resolve({ uid: UID_A, token: null });
  const failing = await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A }, {
    getDb: () => db2.asFirestore(),
    createStore: () => ({ save: async () => { throw new Error("x"); }, list: async () => [], read: async () => null, remove: async () => { throw new Error("storage down"); } }),
    log: () => undefined,
  });
  assert.equal(failing, "failed");
  assert.ok(await sessions2.authorize({ uid: UID_A, token: null }), "still open for the next payment event");
  const started = Date.now();
  const hung = await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A }, {
    getDb: () => db2.asFirestore(),
    createSessions: () => ({ ...sessions2, findOpenForUid: () => new Promise<string | null>(() => undefined) }),
    timeoutMs: 30,
    log: () => undefined,
  });
  assert.equal(hung, "timeout");
  assert.ok(Date.now() - started < 1000);
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A }, { getDb: () => { throw new Error("no db"); }, log: () => undefined }), "failed");
}

// ------------------------------------------------------------ payment paths call the cleanup, and it can't break them
const preparedResult = createFutureOrderV2PreparationAttempt({
  candidate: createFutureOrderV2Fixture("ai-try-on-step7").cartItem.candidate,
  ids: { cartItemId: "future-cart-step7", orderId: "future-order-step7" },
});
if (preparedResult.status !== "valid") throw new Error("Expected prepare.");
const prepared = preparedResult.attempt;
const persisted = createPersistedFutureOrderV2({
  masterOrder: prepared.masterOrder,
  owner: { uid: UID_A, isAnonymous: false },
  customerOwnerUid: UID_A,
  persistedAt: "2026-10-31T12:00:00.000Z",
});
if (persisted.status !== "valid") throw new Error("Expected a persisted order.");
const memoryStore = (): FutureOrderV2PaymentRecordStore => {
  const payments = new Map<string, unknown>();
  return {
    async readOrder(orderId) { return orderId === prepared.orderId ? persisted.value : null; },
    async runTransaction(operation) {
      return operation({
        async getPayment(orderId) { return payments.get(orderId) ?? null; },
        createPayment(orderId, record) { payments.set(orderId, record); },
      });
    },
  };
};
const intent = {
  id: "pi_test_step7_123",
  status: "succeeded",
  amount: 43125,
  currency: "eur",
  metadata: { orderId: prepared.orderId, paymentReference: `future-v2-payment-${prepared.orderId}` },
};
for (const mode of ["webhook", "browser"] as const) {
  for (const cleanup of ["ok", "throws"] as const) {
    const cleaned: string[] = [];
    const store = memoryStore();
    const handler = createFutureOrderV2PaymentRecordHandler({
      getServices: () => ({
        auth: { async verifyIdToken() { return { uid: UID_A, firebase: { sign_in_provider: "password" } }; } },
        db: { marker: "payment-db" },
      }) as never,
      createStore: () => store,
      readSecretKey: () => "sk_test_example",
      readWebhookSecret: () => "whsec_test_placeholder",
      constructEvent: () => ({ id: "evt_1", type: "payment_intent.succeeded", livemode: false, paymentIntentId: intent.id }),
      retrievePaymentIntent: async () => intent,
      readCatalog: async () => [],
      onPaymentRecorded: async ({ ownerUid, db }) => {
        cleaned.push(`${ownerUid}:${(db as { marker?: string }).marker}`);
        if (cleanup === "throws") throw new Error("cleanup exploded");
      },
      now: () => new Date("2026-10-31T12:05:00.000Z"),
      log: () => undefined,
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = response();
      await handler(
        mode === "webhook"
          ? { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, rawBody: "{}" }
          : { method: "POST", headers: { authorization: "Bearer t" }, body: { orderId: prepared.orderId, paymentIntentId: intent.id } },
        result.res,
      );
      const status = (result.state.body as { status?: string }).status;
      assert.equal(status, attempt === 0 ? "recorded" : "already_recorded", `${mode}/${cleanup}/${attempt}`);
      assert.ok(result.state.status === 200 || result.state.status === 201, `${mode}/${cleanup}: payment unaffected`);
    }
    assert.deepEqual(cleaned, [`${UID_A}:payment-db`, `${UID_A}:payment-db`], `${mode}: cleanup on record and on retry`);
  }
}
{
  // PayPal capture.
  const cleaned: string[] = [];
  const capture = { id: "5O190127TN364715T", status: "COMPLETED", amountCents: 43125, currency: "eur", customId: prepared.orderId, invoiceId: `future-v2-payment-${prepared.orderId}` };
  const result = response();
  await handleFutureOrderV2PayPalCapture(
    { method: "POST", headers: { authorization: "Bearer valid-token" }, body: { orderId: prepared.orderId, paypalOrderId: capture.id } },
    result.res,
    {
      readEnv: () => "sandbox",
      readClientId: () => "sandbox-client-id",
      readClientSecret: () => "sandbox-secret",
      getServices: () => ({ auth: { async verifyIdToken() { return { uid: UID_A, firebase: { sign_in_provider: "password" } }; } }, db: {} }) as never,
      createStore: () => memoryStore(),
      readPayPalOrder: async () => ({ ...capture, status: "APPROVED" }),
      capturePayPalOrder: async () => capture,
      readCatalog: async () => [],
      onPaymentRecorded: async ({ ownerUid }) => { cleaned.push(ownerUid); throw new Error("cleanup exploded"); },
      now: () => new Date("2026-10-31T12:05:00.000Z"),
    },
  );
  assert.equal(result.state.status, 200);
  assert.equal((result.state.body as { status: string }).status, "recorded");
  assert.deepEqual(cleaned, [UID_A]);
}
{
  // Default hook wiring (source): every payment path uses the shared cleanup after saving.
  for (const file of ["src/server/futureOrderV2PaymentRecord.ts", "src/server/futureOrderV2PayPalPayment.ts"]) {
    assert.match(readFileSync(file, "utf8"), /retireAiTryOnSessionForPaidOrder/, file);
  }
}

// ------------------------------------------------------------ browser session token store
{
  const backing = new Map<string, string>();
  const store = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => void backing.set(key, value),
    removeItem: (key: string) => void backing.delete(key),
  };
  const token = `tts1_${"Q".repeat(43)}`;
  assert.equal(readAiTryOnSessionToken("guest", store), null);
  saveAiTryOnSessionToken("guest", "tryon-browser-chosen-key", store);
  assert.equal(readAiTryOnSessionToken("guest", store), null, "only server tokens are kept");
  saveAiTryOnSessionToken("guest", token, store);
  assert.equal(readAiTryOnSessionToken("guest", store), token, "survives reloads");
  assert.equal(aiTryOnCredentialsForIdentity("guest", store).sessionToken, token);
  const signedIn = aiTryOnCredentialsForIdentity("authenticated:uid-1", store);
  assert.equal(signedIn.sessionToken, token, "signed-in sends the guest token once, for adoption");
  backing.set(AI_TRY_ON_LEGACY_ORDER_KEY_STORAGE_KEY, "{}");
  const closed: Array<string | null> = [];
  retireAiTryOnSessions(store, (credentials) => closed.push(credentials.sessionToken), async () => "id-token");
  assert.deepEqual(closed, [token, null], "closes the guest session and the account session");
  assert.equal(backing.has(AI_TRY_ON_SESSION_STORAGE_KEY), false);
  assert.equal(backing.has(AI_TRY_ON_LEGACY_ORDER_KEY_STORAGE_KEY), false, "old Step 5/6 keys are removed");
  assert.equal(readAiTryOnSessionToken("guest", store), null, "a fresh order gets a fresh session");
}

// ------------------------------------------------------------ rules: new collections are server-only
{
  const rules = readFileSync("firestore.rules", "utf8");
  for (const name of [AI_TRY_ON_SESSION_COLLECTION, AI_TRY_ON_SESSION_OWNER_COLLECTION]) {
    assert.match(rules, new RegExp(`match /${name}/\\{document=\\*\\*\\} \\{\\s*allow read, write: if false;\\s*\\}`), name);
  }
}

console.log("PASS: AI Try-on Step 7 server sessions, payment cleanup and compact previews");
