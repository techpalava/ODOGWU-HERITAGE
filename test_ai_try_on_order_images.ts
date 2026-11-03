/**
 * AI Try-on PR 2: the AI preview saved with a paid order. All mocked: no
 * Gemini, Firebase, Stripe or PayPal calls, no real payment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Firestore } from "firebase-admin/firestore";
import { createAiTryOnSessions } from "./src/server/aiTryOnSession";
import { createAiTryOnPreviewStore, type AiTryOnPreviewBucket } from "./src/server/aiTryOnPreviewStore";
import {
  AI_TRY_ON_ORDER_IMAGE_COLLECTION,
  AI_TRY_ON_ORDER_IMAGE_COPY_LOCK_MS,
  AI_TRY_ON_ORDER_IMAGE_RETENTION_MS,
  AI_TRY_ON_ORDER_SELECTION_COLLECTION,
  aiTryOnOrderImagePath,
  copyAiTryOnOrderImagesForPaidOrder,
  deleteAiTryOnOrderImages,
  parseAiTryOnOrderSelectionInput,
  readAiTryOnOrderImageRecord,
  saveAiTryOnOrderSelection,
} from "./src/server/aiTryOnOrderImages";
import { retireAiTryOnSessionForPaidOrder } from "./src/server/aiTryOnPaymentCleanup";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import { saveAiTryOnOrderSelection as saveSelectionFromBrowser } from "./src/services/aiTryOnGateway";
import { AI_TRY_ON_ORDER_IMAGE_COPY } from "./src/utils/aiTryOnOrderImageCopy";
import type { HttpResponse } from "./src/server/httpTypes";

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
  asFirestore() {
    return this as unknown as Firestore;
  }
}

class FakeBucket implements AiTryOnPreviewBucket {
  readonly objects = new Map<string, Buffer>();
  failSavesUnder: string | null = null;
  file(path: string) {
    return {
      save: async (data: Buffer) => {
        if (this.failSavesUnder && path.startsWith(this.failSavesUnder)) throw new Error("storage down");
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

const UID_A = "firebase-uid-ada";
const UID_B = "firebase-uid-obi";
const FINGERPRINT = "tryon-v1-0123456789abcdef";
const OTHER_FINGERPRINT = "tryon-v1-fedcba9876543210";
const ORDER_ID = "future-order-pr2";
const PREVIEW_ADA = "tryon-11111111-1111-4111-8111-111111111111";
const PREVIEW_OBI = "tryon-22222222-2222-4222-8222-222222222222";
const ORDER_PREFIX = "ai-try-on-order-images/";

const setup = async () => {
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const sessions = createAiTryOnSessions(db.asFirestore());
  const store = createAiTryOnPreviewStore(db.asFirestore(), bucket);
  const { sessionId } = await sessions.resolve({ uid: UID_A, token: null });
  await store.save({ orderKey: sessionId, wearerKey: "w-ada", previewId: PREVIEW_ADA, inputFingerprint: FINGERPRINT, image: { mimeType: "image/webp", data: Buffer.from("ada-webp").toString("base64") } });
  await store.save({ orderKey: sessionId, wearerKey: "w-obi", previewId: PREVIEW_OBI, inputFingerprint: FINGERPRINT, image: { mimeType: "image/webp", data: Buffer.from("obi-webp").toString("base64") }, modelId: "model-1" });
  db.docs.set(`orders/${ORDER_ID}`, { ownerUid: UID_A });
  return { db, bucket, sessions, store, sessionId };
};
const orderObjects = (bucket: FakeBucket) => [...bucket.objects.keys()].filter((key) => key.startsWith(ORDER_PREFIX));
const select = (overrides: Partial<{ wearerKey: string; previewId: string; inputFingerprint: string; label: string }> = {}) => ({
  wearerKey: "w-ada",
  previewId: PREVIEW_ADA,
  inputFingerprint: FINGERPRINT,
  label: "Ada",
  ...overrides,
});

// ------------------------------------------------------------ parsing
{
  assert.deepEqual(parseAiTryOnOrderSelectionInput([select()]), [select()]);
  assert.equal(parseAiTryOnOrderSelectionInput("x"), null);
  assert.equal(parseAiTryOnOrderSelectionInput([select(), select()]), null, "one per wearer");
  assert.equal(parseAiTryOnOrderSelectionInput([select({ previewId: "../x" })]), null);
  assert.equal(parseAiTryOnOrderSelectionInput([select({ inputFingerprint: "nope" })]), null);
  assert.equal(parseAiTryOnOrderSelectionInput(Array.from({ length: 21 }, (_, i) => select({ wearerKey: `w-${i}` }))), null);
  assert.equal(parseAiTryOnOrderSelectionInput([select({ label: ` ${"x".repeat(200)} ` })])![0].label.length, 80);
  assert.match(aiTryOnOrderImagePath(ORDER_ID, "w:ada/..", "image/webp"), /^ai-try-on-order-images\/future-order-pr2\/[0-9a-f]{32}\.webp$/);
}

// ------------------------------------------------------------ selection: own order, own current previews only
{
  const { db, store, sessionId } = await setup();
  const firestore = db.asFirestore();
  const base = { db: firestore, store, sessionId, orderId: ORDER_ID };
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_B, selections: [select()] }), "order_not_found", "someone else's order");
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, orderId: "missing", selections: [select()] }), "order_not_found");
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, selections: [select({ inputFingerprint: OTHER_FINGERPRINT })] }), "preview_not_found", "out-of-date preview refused");
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, selections: [select({ previewId: PREVIEW_OBI })] }), "preview_not_found", "preview of another wearer refused");
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, sessionId: "other-session", selections: [select()] }), "preview_not_found", "another session's preview refused");
  assert.equal(db.docs.has(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`), false);
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, selections: [select(), select({ wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi" })] }), "saved");
  const saved = db.docs.get(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`)!;
  assert.deepEqual(saved.selections, [
    { wearerKey: "w-ada", previewId: PREVIEW_ADA, label: "Ada", onModel: false },
    { wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi", onModel: true },
  ]);
  assert.equal(await saveAiTryOnOrderSelection({ ...base, uid: UID_A, selections: [] }), "cleared");
  assert.equal(db.docs.has(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`), false);
}

// ------------------------------------------------------------ payment: copy BEFORE the session previews are deleted; idempotent; 60 days
{
  const { db, bucket, sessions, store, sessionId } = await setup();
  const firestore = db.asFirestore();
  await saveAiTryOnOrderSelection({ db: firestore, store, sessionId, uid: UID_A, orderId: ORDER_ID, selections: [select(), select({ wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi" })] });
  const logs: string[] = [];
  const clock = Date.UTC(2026, 10, 2, 17);
  const deps = { getDb: () => firestore, createStore: () => store, getBucket: () => bucket, log: (line: string) => logs.push(line) };
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, deps), "deleted");
  } finally {
    Date.now = realNow;
  }
  const objects = orderObjects(bucket);
  assert.equal(objects.length, 2, "one image per wearer copied to the order");
  assert.deepEqual(objects.map((key) => bucket.objects.get(key)!.toString()).sort(), ["ada-webp", "obi-webp"]);
  assert.equal([...bucket.objects.keys()].length, 2, "the session previews are still deleted");
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null, "session closed as before");
  const record = await readAiTryOnOrderImageRecord(firestore, ORDER_ID);
  assert.ok(record);
  assert.equal(record.status, "saved");
  assert.equal(record.ownerUid, UID_A);
  assert.deepEqual(record.images.map((image) => [image.label, image.onModel]), [["Ada", false], ["Obi", true]]);
  assert.equal(record.expiresAt.getTime() - record.createdAt.getTime(), AI_TRY_ON_ORDER_IMAGE_RETENTION_MS);
  assert.equal(AI_TRY_ON_ORDER_IMAGE_RETENTION_MS, 60 * 24 * 60 * 60 * 1000);
  assert.equal(db.docs.has(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`), false, "selection consumed");
  assert.match(logs.join("\n"), /"event":"ai_try_on_order_images","status":"copied","images":2/);
  assert.equal(logs.join("\n").includes(UID_A) || logs.join("\n").includes(ORDER_ID), false, "no PII in logs");
  // A repeat payment event (webhook + browser): nothing copied again.
  const again = await copyAiTryOnOrderImagesForPaidOrder({ db: firestore, store, bucket, sessionId, orderId: ORDER_ID, ownerUid: UID_A });
  assert.equal(again.result, "already_copied");
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, deps), "no_session");

  // Delete (My Orders / admin / cancellation / refund): files gone, record says deleted; repeat is safe.
  assert.equal(await deleteAiTryOnOrderImages({ db: firestore, bucket, orderId: ORDER_ID, reason: "refunded" }), 2);
  assert.equal(orderObjects(bucket).length, 0);
  const deleted = await readAiTryOnOrderImageRecord(firestore, ORDER_ID);
  assert.equal(deleted?.status, "deleted");
  assert.equal(deleted?.deletedReason, "refunded");
  assert.deepEqual(deleted?.images, []);
  assert.equal(await deleteAiTryOnOrderImages({ db: firestore, bucket, orderId: ORDER_ID, reason: "customer" }), 0);
  assert.equal((await readAiTryOnOrderImageRecord(firestore, ORDER_ID))?.deletedReason, "refunded", "first reason kept");
  assert.equal((await copyAiTryOnOrderImagesForPaidOrder({ db: firestore, store, bucket, sessionId, orderId: ORDER_ID, ownerUid: UID_A })).result, "already_copied", "never re-saved after delete");
}

// ------------------------------------------------------------ no selection / wrong owner / failed copy never break the payment cleanup
{
  const { db, bucket, sessions, store } = await setup();
  const firestore = db.asFirestore();
  const deps = { getDb: () => firestore, createStore: () => store, getBucket: () => bucket, log: () => undefined };
  assert.equal(await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, deps), "deleted", "no selection: nothing copied");
  assert.equal(orderObjects(bucket).length, 0);
  assert.equal(db.docs.has(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER_ID}`), false);
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null);
}
{
  const { db, bucket, sessions, store, sessionId } = await setup();
  const firestore = db.asFirestore();
  await saveAiTryOnOrderSelection({ db: firestore, store, sessionId, uid: UID_A, orderId: ORDER_ID, selections: [select()] });
  db.docs.set(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`, { ...db.docs.get(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`)!, ownerUid: UID_B });
  assert.equal((await copyAiTryOnOrderImagesForPaidOrder({ db: firestore, store, bucket, sessionId, orderId: ORDER_ID, ownerUid: UID_A })).result, "no_selection", "another payer's selection is ignored");
  bucket.failSavesUnder = ORDER_PREFIX;
  db.docs.set(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`, { ...db.docs.get(`${AI_TRY_ON_ORDER_SELECTION_COLLECTION}/${ORDER_ID}`)!, ownerUid: UID_A });
  const logs: string[] = [];
  assert.equal(
    await retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, { getDb: () => firestore, createStore: () => store, getBucket: () => bucket, log: (line) => logs.push(line) }),
    "deleted",
    "a failed copy never stops the cleanup",
  );
  assert.match(logs.join("\n"), /"event":"ai_try_on_order_images","status":"failed"/);
  assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null);
}

// ------------------------------------------------------------ payment paths pass the order id
{
  const source = readFileSync("src/server/futureOrderV2PaymentRecord.ts", "utf8");
  assert.match(source, /retireAiTryOnSessionForPaidOrder\(\s*\{ ownerUid: input\.ownerUid, orderId: input\.orderId \}/);
  assert.equal((source.match(/await onPaymentRecorded\(outcome\.record, /g) || []).length, 2, "Stripe webhook and browser record");
  const paypal = readFileSync("src/server/futureOrderV2PayPalPayment.ts", "utf8");
  assert.match(paypal, /orderId: outcome\.record\.orderId, db: services\.db/);
}

// ------------------------------------------------------------ HTTP: POST ?action=order-selection
{
  const { db, bucket } = await setup();
  const response = () => {
    const state: { status: number; body: unknown } = { status: 200, body: undefined };
    const res: HttpResponse = {
      status(code) { state.status = code; return res; },
      setHeader() { return res; },
      json(body) { state.body = body; return body; },
    };
    return { res, state };
  };
  const deps: AiTryOnHttpDependencies = {
    environment: {},
    getDb: () => db.asFirestore(),
    verifyIdToken: async (token) => {
      if (token === "id-token-ada") return { uid: UID_A, firebase: { sign_in_provider: "password" } };
      if (token === "id-token-anon") return { uid: "anon", firebase: { sign_in_provider: "anonymous" } };
      throw new Error("bad");
    },
    createPreviewStore: (database) => createAiTryOnPreviewStore(database, bucket),
    log: () => undefined,
  };
  const call = async (authorization: string | null, body: unknown) => {
    const { res, state } = response();
    await handleAiTryOn(
      { method: "POST", query: { action: "order-selection" }, headers: authorization ? { authorization } : {}, body } as never,
      res,
      deps,
    );
    return state;
  };
  assert.equal((await call(null, { orderId: ORDER_ID, selections: [select()] })).status, 401, "guests can't attach previews");
  assert.equal((await call("Bearer id-token-anon", { orderId: ORDER_ID, selections: [select()] })).status, 401);
  assert.equal((await call("Bearer bad", { orderId: ORDER_ID, selections: [select()] })).status, 401);
  assert.equal((await call("Bearer id-token-ada", { orderId: "../x", selections: [select()] })).status, 400);
  assert.equal((await call("Bearer id-token-ada", { orderId: ORDER_ID, selections: [select({ inputFingerprint: OTHER_FINGERPRINT })] })).status, 404);
  const ok = await call("Bearer id-token-ada", { orderId: ORDER_ID, selections: [select()] });
  assert.equal(ok.status, 200, "works even with generation switched off");
  assert.deepEqual(ok.body, { status: "saved" });
}

// ------------------------------------------------------------ browser call: POST with the ID token, false on failure
{
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = await saveSelectionFromBrowser({
    credentials: { sessionToken: null, getIdToken: async () => "id-token-ada" },
    orderId: ORDER_ID,
    selections: [select()],
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ status: "saved" }), { status: 200 });
    },
  });
  assert.equal(ok, true);
  assert.equal(calls[0].url, "/api/ai-try-on?action=order-selection");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer id-token-ada");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { orderId: ORDER_ID, selections: [select()] });
  assert.equal(
    await saveSelectionFromBrowser({ credentials: { sessionToken: null, getIdToken: async () => null }, orderId: ORDER_ID, selections: [], fetchImpl: async () => { throw new Error("offline"); } }),
    false,
  );
}

// ------------------------------------------------------------ rules and the pre-payment notice
{
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /match \/aiTryOnOrderSelections\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(rules, /match \/aiTryOnOrderImages\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  const view = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.match(view, /notice=\{futureStageId === "payment" \? AI_TRY_ON_ORDER_IMAGE_COPY\.savedWithOrderNotice : undefined\}/);
  assert.match(view, /rememberAiTryOnOrderSelection\(outcome\.attempt\.orderId\)/);
  assert.match(view, /if \(entry\.kind !== "fresh"\) return \[\];/, "out-of-date previews are never sent");
  assert.match(AI_TRY_ON_ORDER_IMAGE_COPY.savedWithOrderNotice, /60 days/);
}

// ------------------------------------------------------------ concurrent payment events keep every wearer's image
{
  const { db, bucket, store, sessionId } = await setup();
  const firestore = db.asFirestore();
  await saveAiTryOnOrderSelection({
    db: firestore,
    store,
    sessionId,
    uid: UID_A,
    orderId: ORDER_ID,
    selections: [select(), select({ wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi" })],
  });
  let held = false;
  let releaseCopy!: () => void;
  let notifyCopy!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseCopy = resolve;
  });
  const started = new Promise<void>((resolve) => {
    notifyCopy = resolve;
  });
  const slowStore = {
    ...store,
    async read(orderKey: string, previewId: string) {
      const image = await store.read(orderKey, previewId);
      if (previewId === PREVIEW_ADA && !held) {
        held = true;
        notifyCopy();
        await gate;
      }
      return image;
    },
  };
  const deps = {
    getDb: () => firestore,
    createStore: () => slowStore,
    getBucket: () => bucket,
    log: () => undefined,
  };
  const sessionFiles = () => [...bucket.objects.keys()].filter((key) => !key.startsWith(ORDER_PREFIX));
  const first = retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, deps);
  await Promise.race([
    started,
    new Promise((_, reject) => setTimeout(() => reject(new Error("copy did not start")), 2000)),
  ]);
  const second = retireAiTryOnSessionForPaidOrder({ ownerUid: UID_A, orderId: ORDER_ID }, deps);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(sessionFiles().length >= 2, "the second payment event does not delete previews while the first is still copying");
  releaseCopy();
  const results = (await Promise.all([first, second])).sort();
  assert.deepEqual(results, ["deleted", "deleted"]);
  const record = await readAiTryOnOrderImageRecord(firestore, ORDER_ID);
  assert.equal(record?.status, "saved");
  assert.deepEqual(record?.images.map((image) => image.wearerKey).sort(), ["w-ada", "w-obi"], "both wearers survive the double call");
  assert.equal(sessionFiles().length, 0, "previews are deleted once the copy is confirmed");
  assert.equal(orderObjects(bucket).length, 2);
}

// ------------------------------------------------------------ a partial copy must not replace a fuller record
{
  const { db, bucket, store, sessionId } = await setup();
  const firestore = db.asFirestore();
  await saveAiTryOnOrderSelection({
    db: firestore,
    store,
    sessionId,
    uid: UID_A,
    orderId: ORDER_ID,
    selections: [select(), select({ wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi" })],
  });
  let injected = false;
  const partialStore = {
    ...store,
    async read(orderKey: string, previewId: string) {
      const image = await store.read(orderKey, previewId);
      if (previewId === PREVIEW_OBI && !injected) {
        injected = true;
        db.docs.set(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER_ID}`, {
          orderId: ORDER_ID,
          ownerUid: UID_A,
          status: "saved",
          images: [
            { wearerKey: "w-ada", label: "Ada", onModel: false, path: "kept-ada", mimeType: "image/webp", bytes: 3 },
            { wearerKey: "w-obi", label: "Obi", onModel: true, path: "kept-obi", mimeType: "image/webp", bytes: 3 },
          ],
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        });
        return null;
      }
      return image;
    },
  };
  const copied = await copyAiTryOnOrderImagesForPaidOrder({
    db: firestore,
    store: partialStore,
    bucket,
    sessionId,
    orderId: ORDER_ID,
    ownerUid: UID_A,
  });
  assert.equal(copied.result, "already_copied");
  const record = await readAiTryOnOrderImageRecord(firestore, ORDER_ID);
  assert.deepEqual(record?.images.map((image) => image.path).sort(), ["kept-ada", "kept-obi"]);
}

// ------------------------------------------------------------ a fresh copy lock is not stolen; a dead holder's lock is reclaimed
{
  const LOCK = AI_TRY_ON_ORDER_IMAGE_COPY_LOCK_MS;
  const sessionFiles = (bucket: FakeBucket) =>
    [...bucket.objects.keys()].filter((key) => !key.startsWith(ORDER_PREFIX));

  // Holder still copying: claimedAt moves with the clock. The waiter must
  // leave the session previews alone.
  {
    const { db, bucket, sessions, store, sessionId } = await setup();
    const firestore = db.asFirestore();
    await saveAiTryOnOrderSelection({
      db: firestore, store, sessionId, uid: UID_A, orderId: ORDER_ID, selections: [select()],
    });
    let clock = 1_700_000_000_000;
    const recordPath = `${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER_ID}`;
    db.docs.set(recordPath, {
      orderId: ORDER_ID,
      ownerUid: UID_A,
      status: "copying",
      copyClaimId: "live-holder",
      copyClaimedAt: clock + 1_000,
    });
    const before = sessionFiles(bucket).length;
    const logs: string[] = [];
    const result = await retireAiTryOnSessionForPaidOrder(
      { ownerUid: UID_A, orderId: ORDER_ID },
      {
        getDb: () => firestore,
        createStore: () => store,
        getBucket: () => bucket,
        log: (line) => logs.push(line),
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
          const lock = db.docs.get(recordPath);
          if (lock?.status === "copying" && lock.copyClaimId === "live-holder") {
            lock.copyClaimedAt = clock;
          }
        },
      },
    );
    assert.equal(result, "failed");
    assert.equal(sessionFiles(bucket).length, before, "a live holder keeps the session previews");
    assert.equal(await sessions.authorize({ uid: UID_A, token: null }), sessionId, "session stays open");
    assert.match(logs.join("\n"), /"status":"in_progress"/);
    assert.match(logs.join("\n"), /"status":"copy_in_progress","previewsKept":true/);
    assert.equal(orderObjects(bucket).length, 0, "the waiter did not copy over a live holder");
  }

  // Dead holder: the claim does not move. After the lease the waiter
  // reclaims, copies, and cleanup deletes the session previews.
  {
    const { db, bucket, sessions, store, sessionId } = await setup();
    const firestore = db.asFirestore();
    await saveAiTryOnOrderSelection({
      db: firestore, store, sessionId, uid: UID_A, orderId: ORDER_ID,
      selections: [select(), select({ wearerKey: "w-obi", previewId: PREVIEW_OBI, label: "Obi" })],
    });
    let clock = 1_700_000_000_000;
    db.docs.set(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER_ID}`, {
      orderId: ORDER_ID,
      ownerUid: UID_A,
      status: "copying",
      copyClaimId: "dead-holder",
      copyClaimedAt: clock + 1_000,
    });
    const logs: string[] = [];
    const result = await retireAiTryOnSessionForPaidOrder(
      { ownerUid: UID_A, orderId: ORDER_ID },
      {
        getDb: () => firestore,
        createStore: () => store,
        getBucket: () => bucket,
        log: (line) => logs.push(line),
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      },
    );
    assert.equal(result, "deleted");
    assert.ok(clock - 1_700_000_000_000 >= LOCK, "the waiter waited out the dead holder's lease");
    assert.equal(sessionFiles(bucket).length, 0, "previews are deleted after the reclaim copy");
    assert.equal(await sessions.authorize({ uid: UID_A, token: null }), null, "session closed");
    const record = await readAiTryOnOrderImageRecord(firestore, ORDER_ID);
    assert.equal(record?.status, "saved");
    assert.deepEqual(record?.images.map((image) => image.wearerKey).sort(), ["w-ada", "w-obi"]);
    assert.match(logs.join("\n"), /"status":"copied"/);
    assert.equal(logs.some((line) => line.includes("copy_in_progress")), false);
  }
}

console.log("ai try-on order images: ok");
