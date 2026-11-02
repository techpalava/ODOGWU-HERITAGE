/**
 * AI Try-on Step 6: private preview storage, retention, delete on request,
 * server-side reference pictures, no workshop/admin exposure, and restore
 * after reload. All mocked: no Gemini, Firestore or Storage calls.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { Firestore } from "firebase-admin/firestore";
import {
  AI_TRY_ON_PREVIEW_COLLECTION,
  AI_TRY_ON_PREVIEW_RETENTION_MS,
  AI_TRY_ON_PREVIEW_STORAGE_PREFIX,
  createAiTryOnPreviewId,
  createAiTryOnPreviewStore,
  type AiTryOnPreviewBucket,
} from "./src/server/aiTryOnPreviewStore";
import {
  AiTryOnReferenceImageError,
  loadAiTryOnReferenceImageOnServer,
} from "./src/server/aiTryOnReferenceImages";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import { createAiTryOnUsageLimits } from "./src/server/aiTryOnUsageLimits";
import {
  deleteStoredAiTryOnPreviews,
  fetchStoredAiTryOnPreview,
  mapAiTryOnPreviewResponse,
} from "./src/services/aiTryOnGateway";
import {
  AiTryOnPhotoPanel,
  AI_TRY_ON_MESSAGES,
  type AiTryOnPhotoPanelProps,
} from "./src/components/AiTryOnPhotoPanel";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import type { HttpResponse } from "./src/server/httpTypes";

type Doc = Record<string, unknown>;

/** In-memory Firestore: doc get/set/delete, where(==).get(), transactions. */
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  private lock: Promise<unknown> = Promise.resolve();
  private snap(path: string) {
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  collection(name: string) {
    const docRef = (id: string) => {
      const path = `${name}/${id}`;
      return {
        path,
        get: async () => this.snap(path),
        set: async (data: Doc) => void this.docs.set(path, { ...data }),
        delete: async () => void this.docs.delete(path),
      };
    };
    return {
      doc: docRef,
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
  readonly name = "test-bucket.firebasestorage.app";
  readonly objects = new Map<string, { bytes: Buffer; options: unknown }>();
  readonly downloads: string[] = [];
  file(path: string) {
    return {
      save: async (data: Buffer, options: unknown) => void this.objects.set(path, { bytes: data, options }),
      download: async (): Promise<[Buffer]> => {
        this.downloads.push(path);
        const entry = this.objects.get(path);
        if (!entry) throw new Error("No such object");
        return [entry.bytes];
      },
      delete: async () => void this.objects.delete(path),
    };
  }
}

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]);
const PERSON_PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("PERSON-PHOTO-MARKER-0001")]).toString("base64");
const GEMINI_OUTPUT = Buffer.concat([png, Buffer.from("GEMINI-OUTPUT")]).toString("base64");
const ORDER = "tryon-0123456789abcdef0123456789abcdef";
const OTHER_ORDER = "tryon-ffffffffffffffffffffffffffffffff";
const FINGERPRINT = "tryon-v1-0123456789abcdef";
const DAY = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------ store
{
  let clock = Date.UTC(2026, 9, 31, 12);
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const store = createAiTryOnPreviewStore(db.asFirestore(), bucket, { now: () => clock });
  const firstId = createAiTryOnPreviewId();
  assert.match(firstId, /^tryon-[0-9a-f-]{36}$/);

  const saved = await store.save({
    orderKey: ORDER, wearerKey: "w-ada", previewId: firstId, inputFingerprint: FINGERPRINT,
    promptVersion: "tryon-prompt-v2", image: { mimeType: "image/png", data: GEMINI_OUTPUT },
  });
  assert.equal(saved.expiresAt, new Date(clock + AI_TRY_ON_PREVIEW_RETENTION_MS).toISOString());
  assert.equal(AI_TRY_ON_PREVIEW_RETENTION_MS, 30 * DAY, "kept for up to 30 days");
  const [path, object] = [...bucket.objects.entries()][0];
  assert.match(path, new RegExp(`^${AI_TRY_ON_PREVIEW_STORAGE_PREFIX}/order-[0-9a-f]{64}/${firstId}\\.png$`));
  assert.equal(path.includes(ORDER), false, "the raw order key is never in the path");
  const options = object.options as { metadata: { cacheControl: string; metadata: Record<string, string> } };
  assert.equal(options.metadata.cacheControl, "private, no-store");
  assert.equal(JSON.stringify(options).includes("firebaseStorageDownloadTokens"), false, "no public download URL");
  const [docPath, doc] = [...db.docs.entries()][0];
  assert.ok(docPath.startsWith(`${AI_TRY_ON_PREVIEW_COLLECTION}/`));
  assert.ok(doc.expiresAt instanceof Date, "Firestore TTL field is a timestamp");
  assert.equal(JSON.stringify(doc).includes(ORDER), false);

  assert.deepEqual(await store.list(ORDER), [saved]);
  assert.deepEqual(await store.list(OTHER_ORDER), [], "another order sees nothing");
  assert.equal(await store.read(OTHER_ORDER, firstId), null, "owner check on read");
  const read = await store.read(ORDER, firstId);
  assert.equal(read?.data, GEMINI_OUTPUT);

  // A new preview for the same wearer replaces the old one.
  const secondId = createAiTryOnPreviewId();
  await store.save({
    orderKey: ORDER, wearerKey: "w-ada", previewId: secondId, inputFingerprint: "tryon-v1-fedcba9876543210",
    promptVersion: "tryon-prompt-v2", image: { mimeType: "image/png", data: GEMINI_OUTPUT },
  });
  assert.equal(bucket.objects.size, 1, "old object deleted");
  assert.equal(db.docs.size, 1);
  assert.equal(await store.read(ORDER, firstId), null);

  await store.save({
    orderKey: ORDER, wearerKey: "w-obi", previewId: createAiTryOnPreviewId(), inputFingerprint: FINGERPRINT,
    promptVersion: "tryon-prompt-v2", image: { mimeType: "image/jpeg", data: jpeg.toString("base64") },
  });
  assert.equal((await store.list(ORDER)).length, 2);

  // Delete on request: one, then all; other orders untouched.
  await store.save({
    orderKey: OTHER_ORDER, wearerKey: "order", previewId: createAiTryOnPreviewId(), inputFingerprint: FINGERPRINT,
    promptVersion: "tryon-prompt-v2", image: { mimeType: "image/png", data: GEMINI_OUTPUT },
  });
  assert.equal(await store.remove(OTHER_ORDER, secondId), 0, "cannot delete another order's preview");
  assert.equal(await store.remove(ORDER, secondId), 1);
  assert.equal(await store.read(ORDER, secondId), null);
  assert.equal(await store.remove(ORDER, null), 1, "delete all");
  assert.deepEqual(await store.list(ORDER), []);
  assert.equal(bucket.objects.size, 1, "only the other order's object remains");

  // Expiry: after 30 days nothing is served, and it is deleted lazily.
  clock += 30 * DAY + 1;
  assert.deepEqual(await store.list(OTHER_ORDER), []);
  assert.equal(bucket.objects.size, 0);
  assert.equal(db.docs.size, 0);
}

// ------------------------------------------------------------ server-side reference pictures
{
  const bucket = new FakeBucket();
  bucket.objects.set("styles/agbada.png", { bytes: png, options: {} });
  bucket.objects.set("fabrics/red.jpg", { bytes: jpeg, options: {} });
  bucket.objects.set("ai-try-on-previews/order-x/tryon-1.png", { bytes: png, options: {} });
  const fetched: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    fetched.push({ url, init });
    if (url.includes("not-image")) return new Response("<html>", { status: 200 });
    if (url.includes("missing")) return new Response("", { status: 404 });
    return new Response(jpeg, { status: 200 });
  };
  const load = (url: string) => loadAiTryOnReferenceImageOnServer(url, { bucket, fetchImpl });
  const own = (path: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=abc`;

  assert.deepEqual(await load(own("styles/agbada.png")), { mimeType: "image/png", data: png.toString("base64") });
  assert.equal((await load(`https://storage.googleapis.com/${bucket.name}/fabrics/red.jpg`)).mimeType, "image/jpeg");
  assert.equal(fetched.length, 0, "own-bucket pictures are read with the Admin SDK, not over CORS");

  const rejects = async (url: string, reason: string) => {
    await assert.rejects(load(url), (error: unknown) => error instanceof AiTryOnReferenceImageError && error.message === reason, url);
  };
  await rejects(own("ai-try-on-previews/order-x/tryon-1.png"), "reference_host"); // private prefix never readable
  await rejects(own("customers/a.png"), "reference_host");
  await rejects(own("styles/../ai-try-on-previews/x.png"), "reference_host");
  await rejects(`https://firebasestorage.googleapis.com/v0/b/other-bucket/o/styles%2Fa.png`, "reference_host");
  await rejects("http://images.unsplash.com/photo-1", "reference_url");
  await rejects("https://169.254.169.254/computeMetadata/v1/", "reference_host");
  await rejects("https://example.com/a.jpg", "reference_host");
  await rejects("https://user:pw@images.unsplash.com/photo-1", "reference_url");
  await rejects("https://images.unsplash.com:8443/photo-1", "reference_url");
  await rejects("not a url", "reference_url");
  await rejects(own("styles/missing.png"), "reference_missing");
  await rejects("https://images.unsplash.com/not-image", "reference_type");
  await rejects("https://images.unsplash.com/missing", "reference_missing");
  assert.equal(fetched.every((entry) => entry.url.startsWith("https://images.unsplash.com/")), true, "SSRF: only Unsplash is fetched");

  fetched.length = 0;
  assert.equal((await load("https://images.unsplash.com/photo-1?w=800")).mimeType, "image/jpeg");
  assert.equal(fetched[0].init?.redirect, "error", "redirects are refused");
}

// ------------------------------------------------------------ HTTP: generate, store, read, delete
const response = () => {
  const state: { status: number; headers: Record<string, string>; body: unknown } = { status: 200, headers: {}, body: undefined };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader(name, value) { state.headers[name.toLowerCase()] = value; return res; },
    json(body) { state.body = body; return body; },
  };
  return { res, state };
};

const serverHarness = () => {
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const referenceUrls: string[] = [];
  const geminiRequests: unknown[] = [];
  let referenceFails = false;
  let saveFails = false;
  const deps: AiTryOnHttpDependencies = {
    environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" },
    getDb: () => db.asFirestore(),
    consumeIpRateLimit: async () => undefined,
    createGenerateContent: () => async (request) => {
      geminiRequests.push(request);
      return {
        candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: GEMINI_OUTPUT } }] } }],
      };
    },
    createPreviewStore: (database) => {
      const store = createAiTryOnPreviewStore(database, bucket);
      return { ...store, save: (input) => (saveFails ? Promise.reject(new Error("storage down")) : store.save(input)) };
    },
    loadReferenceImage: async (url) => {
      referenceUrls.push(url);
      if (referenceFails) throw new AiTryOnReferenceImageError("reference_missing");
      return { mimeType: "image/png", data: png.toString("base64") };
    },
    log: () => undefined,
  };
  return {
    db, bucket, deps, referenceUrls, geminiRequests,
    failReferences: () => { referenceFails = true; },
    failSaves: () => { saveFails = true; },
  };
};

const generate = async (h: ReturnType<typeof serverHarness>, overrides: Record<string, unknown> = {}) => {
  const result = response();
  await handleAiTryOn(
    {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
      query: { route: "ai-try-on" },
      body: {
        mode: "fabric",
        orderKey: ORDER,
        inputFingerprint: FINGERPRINT,
        wearerKey: "w-ada",
        personImage: { mimeType: "image/jpeg", data: PERSON_PHOTO },
        garmentImageUrl: "https://firebasestorage.googleapis.com/v0/b/b/o/styles%2Fa.png",
        fabricSwatchImageUrl: "https://firebasestorage.googleapis.com/v0/b/b/o/fabrics%2Fr.jpg",
        ...overrides,
      },
    } as never,
    result.res,
    h.deps,
  );
  return result.state;
};

const serverRequest = async (h: ReturnType<typeof serverHarness>, method: string, url: string) => {
  const result = response();
  await handleAiTryOn({ method, headers: {}, url } as never, result.res, h.deps);
  return result.state;
};

{
  const h = serverHarness();
  const ok = await generate(h);
  assert.equal(ok.status, 200);
  const body = ok.body as { previewStored: boolean; previewExpiresAt: string; resultReference: { assetId: string }; image: { data: string } };
  assert.equal(body.previewStored, true);
  assert.ok(body.previewExpiresAt);
  assert.match(body.resultReference.assetId, /^tryon-[0-9a-f-]{36}$/);
  assert.deepEqual(h.referenceUrls, [
    "https://firebasestorage.googleapis.com/v0/b/b/o/styles%2Fa.png",
    "https://firebasestorage.googleapis.com/v0/b/b/o/fabrics%2Fr.jpg",
  ]);
  assert.equal(h.geminiRequests.length, 1);

  // The person photo is never stored: only Gemini's output is saved.
  assert.equal(h.bucket.objects.size, 1);
  const [storedObject] = [...h.bucket.objects.values()];
  assert.equal(storedObject.bytes.toString("base64"), GEMINI_OUTPUT);
  const everything = JSON.stringify([...h.db.docs.values()]) + [...h.bucket.objects.values()].map((o) => o.bytes.toString("base64")).join();
  assert.equal(everything.includes(PERSON_PHOTO), false, "no copy of the photo in Firestore or Storage");
  assert.equal(everything.includes(Buffer.from("PERSON-PHOTO-MARKER-0001").toString("base64").slice(0, 16)), false);
  assert.equal(JSON.stringify(ok.body).includes(PERSON_PHOTO), false, "the photo is not echoed back");
  assert.equal(ok.headers["cache-control"], "no-store");

  // Client maps the stored id.
  const mapped = mapAiTryOnPreviewResponse(200, ok.body);
  assert.equal(mapped.kind === "completed" && mapped.storedPreviewId, body.resultReference.assetId);

  // Reload: GET lists the order's previews; GET by id restores the image.
  const list = await serverRequest(h, "GET", `/api/ai-try-on?orderKey=${ORDER}`);
  const previews = (list.body as { previews: Array<{ previewId: string; wearerKey: string; inputFingerprint: string }> }).previews;
  assert.deepEqual(previews.map((p) => [p.previewId, p.wearerKey, p.inputFingerprint]), [[body.resultReference.assetId, "w-ada", FINGERPRINT]]);
  const id = body.resultReference.assetId;
  const read = await serverRequest(h, "GET", `/api/ai-try-on?orderKey=${ORDER}&previewId=${id}`);
  assert.equal(read.status, 200);
  assert.equal((read.body as { image: { data: string } }).image.data, GEMINI_OUTPUT);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.equal((await serverRequest(h, "GET", `/api/ai-try-on?orderKey=${OTHER_ORDER}&previewId=${id}`)).status, 404, "not the owner");
  assert.equal(((await serverRequest(h, "GET", `/api/ai-try-on?orderKey=${OTHER_ORDER}`)).body as { previews: unknown[] }).previews.length, 0);

  // Delete on request.
  assert.equal((await serverRequest(h, "DELETE", `/api/ai-try-on?orderKey=${OTHER_ORDER}&previewId=${id}`)).body && h.bucket.objects.size, 1);
  assert.equal((await serverRequest(h, "DELETE", `/api/ai-try-on?orderKey=${ORDER}`)).status, 400, "needs an id or all=1");
  assert.equal((await serverRequest(h, "DELETE", `/api/ai-try-on?orderKey=bad&previewId=${id}`)).status, 400);
  const deleted = await serverRequest(h, "DELETE", `/api/ai-try-on?orderKey=${ORDER}&previewId=${id}`);
  assert.deepEqual(deleted.body, { status: "deleted", deleted: 1 });
  assert.equal(h.bucket.objects.size, 0);
  assert.equal((await serverRequest(h, "GET", `/api/ai-try-on?orderKey=${ORDER}&previewId=${id}`)).status, 404);

  // Delete all (order placed / draft discarded), still allowed when generation is off.
  await generate(h);
  await generate(h, { wearerKey: "w-obi" });
  assert.equal(h.bucket.objects.size, 2);
  h.deps.environment = { AI_TRY_ON_ENABLED: "false" };
  const all = await serverRequest(h, "DELETE", `/api/ai-try-on?orderKey=${ORDER}&all=1`);
  assert.deepEqual(all.body, { status: "deleted", deleted: 2 });
  assert.equal(h.bucket.objects.size, 0);
}

{
  // A picture the server can't load: 422, no try used, Gemini not called.
  const h = serverHarness();
  h.failReferences();
  const failed = await generate(h);
  assert.equal(failed.status, 422);
  assert.equal((failed.body as { code: string }).code, "REFERENCE_IMAGE_UNAVAILABLE");
  assert.equal(h.geminiRequests.length, 0);
  assert.equal(await createAiTryOnUsageLimits(h.db.asFirestore()).readOrderTriesRemaining(ORDER), 5);
  const mapped = mapAiTryOnPreviewResponse(422, failed.body);
  assert.equal(mapped.kind, "failed");

  // Inline references (Step 3 clients) still work; a store failure still returns the preview.
  const inline = serverHarness();
  inline.failSaves();
  const ok = await generate(inline, {
    garmentImageUrl: undefined,
    fabricSwatchImageUrl: undefined,
    mode: "garment",
    garmentImage: { mimeType: "image/png", data: png.toString("base64") },
  });
  assert.equal(ok.status, 200);
  assert.equal((ok.body as { previewStored: boolean }).previewStored, false);
  assert.equal(inline.referenceUrls.length, 0);
  const mapped2 = mapAiTryOnPreviewResponse(200, ok.body);
  assert.equal(mapped2.kind === "completed" && mapped2.storedPreviewId, null, "no delete control for an unstored preview");

  // Bad URL fields are rejected before anything runs.
  const bad = await generate(serverHarness(), { garmentImageUrl: 42 });
  assert.equal(bad.status, 400);
}

// ------------------------------------------------------------ never exposed to workshop or admin views
{
  const firestoreRules = readFileSync("firestore.rules", "utf8");
  const storageRules = readFileSync("storage.rules", "utf8");
  assert.match(firestoreRules, /match \/aiTryOnPreviews\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(firestoreRules, /match \/aiTryOnUsage\/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(storageRules, /match \/ai-try-on-previews\/\{allPaths=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|js|mjs)$/.test(name) ? [full] : [];
    });
  const offenders = [...walk("src"), ...walk("api")]
    .filter((file) => !file.startsWith(join("src", "server")))
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes(AI_TRY_ON_PREVIEW_COLLECTION) || source.includes(AI_TRY_ON_PREVIEW_STORAGE_PREFIX);
    });
  assert.deepEqual(offenders, [], "only server code knows where previews are stored");
  const serverUsers = walk(join("src", "server")).filter((file) =>
    readFileSync(file, "utf8").includes("aiTryOnPreviewStore"),
  );
  assert.deepEqual(serverUsers.sort(), [join("src", "server", "aiTryOnHttp.ts")], "only the owner gateway uses the store");
  const workshopOrAdmin = walk("src").filter((file) => /admin|workshop|manifest|staff|production/i.test(file));
  assert.ok(workshopOrAdmin.length > 0);
  for (const file of workshopOrAdmin) {
    const source = readFileSync(file, "utf8");
    assert.equal(/aiTryOnPreview|ai-try-on-preview|fetchStoredAiTryOnPreview/.test(source), false, file);
  }
}

// ------------------------------------------------------------ browser service
{
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "DELETE") return new Response(JSON.stringify({ status: "deleted", deleted: 1 }));
    if (url.includes("gone")) return new Response(JSON.stringify({ code: "PREVIEW_NOT_FOUND" }), { status: 404 });
    return new Response(JSON.stringify({ status: "preview", image: { mimeType: "image/png", data: "iVBORw0KGgo=" } }));
  };
  assert.deepEqual(await fetchStoredAiTryOnPreview({ orderKey: ORDER, previewId: "tryon-1", fetchImpl }), { mimeType: "image/png", data: "iVBORw0KGgo=" });
  assert.equal(calls[0].url, `/api/ai-try-on?orderKey=${ORDER}&previewId=tryon-1`);
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(await fetchStoredAiTryOnPreview({ orderKey: ORDER, previewId: "gone", fetchImpl }), null);
  assert.equal(await deleteStoredAiTryOnPreviews({ orderKey: ORDER, previewId: "tryon-1", fetchImpl }), true);
  assert.equal(calls[2].url, `/api/ai-try-on?orderKey=${ORDER}&previewId=tryon-1`);
  assert.equal(calls[2].init?.method, "DELETE");
  await deleteStoredAiTryOnPreviews({ orderKey: ORDER, previewId: null, fetchImpl, keepalive: true });
  assert.equal(calls[3].url, `/api/ai-try-on?orderKey=${ORDER}&all=1`);
  assert.equal(calls[3].init?.keepalive, true);
  assert.equal(await deleteStoredAiTryOnPreviews({ orderKey: ORDER, previewId: null, fetchImpl: async () => { throw new Error("offline"); } }), false);
}

// ------------------------------------------------------------ panel: restore after reload, delete my preview
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: FINGERPRINT,
  mode: "garment",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [],
  orderDetails: null,
  ...overrides,
});
const STORED_ID = "tryon-11111111-2222-4333-8444-555555555555";
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const renderPanel = (props: Partial<AiTryOnPhotoPanelProps> = {}) => {
  const loads: string[] = [];
  const deletes: string[] = [];
  let renderer!: ReturnType<typeof create>;
  const base: AiTryOnPhotoPanelProps = {
    targets: [target()],
    orderKey: ORDER,
    triesPerOrder: 5,
    initialTriesRemaining: 4,
    onPreviewCreated: () => undefined,
    onUnavailable: () => undefined,
    storedPreviews: [{ previewId: STORED_ID, wearerKey: "w-ada", inputFingerprint: FINGERPRINT, expiresAt: "2026-11-30T12:00:00.000Z" }],
    loadStoredPreview: async (id) => { loads.push(id); return { mimeType: "image/png", data: "c3RvcmVk" }; },
    deleteStoredPreview: async (id) => { deletes.push(id); return true; },
    preparePhoto: async () => ({ mimeType: "image/jpeg", data: "/9j/4AAQ" }),
    createThumbnailUrl: () => null,
    revokeThumbnailUrl: () => undefined,
    ...props,
  };
  act(() => { renderer = create(createElement(AiTryOnPhotoPanel, base)); });
  return { renderer, loads, deletes };
};
const resultImages = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAll((node) => node.type === "img" && /AI try-on preview/.test(node.props.alt || ""));
const deleteButton = (renderer: ReturnType<typeof create>) =>
  renderer.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-delete"] !== undefined);

{
  const { renderer, loads, deletes } = renderPanel();
  await flush();
  assert.deepEqual(loads, [STORED_ID], "restores the stored preview on reload");
  assert.equal(resultImages(renderer)[0].props.src, "data:image/png;base64,c3RvcmVk");
  assert.equal(deleteButton(renderer).length, 1);
  assert.match(textOf(deleteButton(renderer)[0]), /Delete my preview/);
  await act(async () => { await deleteButton(renderer)[0].props.onClick(); });
  assert.deepEqual(deletes, [STORED_ID]);
  assert.equal(resultImages(renderer).length, 0);
  assert.match(textOf(renderer.root), new RegExp(AI_TRY_ON_MESSAGES.previewDeleted));
  assert.equal(AI_TRY_ON_MESSAGES.previewDeleted, "Your preview was deleted.");
  await flush();
  assert.deepEqual(loads, [STORED_ID], "not restored again after deletion");
}
{
  // Design changed since the preview: not valid for this wearer, not loaded.
  const { renderer, loads } = renderPanel({ targets: [target({ inputFingerprint: "tryon-v1-fedcba9876543210" })] });
  await flush();
  assert.deepEqual(loads, []);
  assert.equal(resultImages(renderer).length, 0);
}
{
  // Gone on the server (expired or deleted elsewhere): nothing shown, no tick.
  const { renderer } = renderPanel({ loadStoredPreview: async () => null });
  await flush();
  assert.equal(resultImages(renderer).length, 0);
}
{
  // Delete fails: the preview stays and the customer is told.
  const { renderer } = renderPanel({ deleteStoredPreview: async () => false });
  await flush();
  await act(async () => { await deleteButton(renderer)[0].props.onClick(); });
  assert.equal(resultImages(renderer).length, 1);
  assert.match(textOf(renderer.root), new RegExp(AI_TRY_ON_MESSAGES.deleteFailed.replace(/[.']/g, ".")));
}
{
  // Only the selected wearer's preview is restored; the other wearer gets the tick.
  const { renderer, loads } = renderPanel({
    targets: [target(), target({ wearerId: "w-obi", label: "Obi", inputFingerprint: "tryon-v1-aaaaaaaaaaaaaaaa" })],
    storedPreviews: [
      { previewId: STORED_ID, wearerKey: "w-ada", inputFingerprint: FINGERPRINT, expiresAt: "2026-11-30T12:00:00.000Z" },
      { previewId: "tryon-99999999-2222-4333-8444-555555555555", wearerKey: "w-obi", inputFingerprint: "tryon-v1-aaaaaaaaaaaaaaaa", expiresAt: "2026-11-30T12:00:00.000Z" },
    ],
  });
  await flush();
  assert.deepEqual(loads, [STORED_ID]);
  const chips = renderer.root.findAll((node) => node.type === "button" && node.props.role === "radio");
  assert.match(textOf(chips[1]), /\(preview ready\)/);
  act(() => chips[1].props.onClick());
  await flush();
  assert.deepEqual(loads, [STORED_ID, "tryon-99999999-2222-4333-8444-555555555555"]);
}
{
  // A fresh preview the server could not store has no delete control.
  const { renderer } = renderPanel({
    storedPreviews: [],
    requestPreview: async () => ({
      kind: "completed",
      resultReference: { kind: "verified_private_try_on_result", assetId: "x", ownerBindingId: "order-x" },
      preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
      orderTriesRemaining: 3,
      storedPreviewId: null,
    }),
  });
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => { await input.props.onChange({ target: { files: [file] } }); });
  const generate = renderer.root.find((node) => node.type === "button" && /Generate preview/.test(textOf(node)));
  await act(async () => { await generate.props.onClick(); });
  assert.equal(resultImages(renderer).length, 1);
  assert.equal(deleteButton(renderer).length, 0);
}

console.log("PASS: AI Try-on Step 6 private preview storage, retention, deletion and server-side references");
