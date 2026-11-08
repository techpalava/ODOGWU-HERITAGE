/**
 * Default try-on models ("No photo? Try it on a model"): catalogue and
 * static assets, model-mode prompt, request parsing, the shared result
 * cache (fingerprint, hit = no try and no Gemini, miss = one try, 90 days
 * after last use), per-wearer picker behaviour, and that the photo flow is
 * unchanged. Gemini, Firestore, Storage and fetch are always faked.
 */
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import type { Firestore } from "firebase-admin/firestore";
import {
  AI_TRY_ON_DEFAULT_MODELS,
  aiTryOnDefaultModelImageUrl,
  findAiTryOnDefaultModel,
} from "./src/utils/aiTryOnDefaultModels";
import {
  aiTryOnDefaultModelImagePath,
  loadAiTryOnDefaultModelImage,
} from "./src/server/aiTryOnDefaultModelImages";
import {
  AI_TRY_ON_MODEL_RESULT_COLLECTION,
  AI_TRY_ON_MODEL_RESULT_RETENTION_MS,
  AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX,
  createAiTryOnModelResultCache,
  createAiTryOnModelResultKey,
} from "./src/server/aiTryOnModelResultCache";
import {
  buildAiTryOnImageLabels,
  buildAiTryOnModelImageLabels,
  buildAiTryOnModelPrompt,
  buildAiTryOnPrompt,
} from "./src/server/aiTryOnPrompt";
import { handleAiTryOn, parseAiTryOnGenerationRequest, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import { createAiTryOnPreviewStore, AI_TRY_ON_PREVIEW_COLLECTION } from "./src/server/aiTryOnPreviewStore";
import { createAiTryOnSessions } from "./src/server/aiTryOnSession";
import {
  AI_TRY_ON_OUTFIT_PROMPT_VERSION,
  AI_TRY_ON_MODEL_PROMPT_VERSION,
  AI_TRY_ON_PROMPT_VERSION,
} from "./src/utils/aiTryOnGatewayContract";
import { fetchAiTryOnAvailability, mapAiTryOnPreviewResponse } from "./src/services/aiTryOnGateway";
import {
  AI_TRY_ON_CONSENT_NOTICE,
  AI_TRY_ON_MODEL_COPY,
  AI_TRY_ON_PREVIEW_DISCLAIMER,
  AiTryOnPhotoPanel,
  type AiTryOnPhotoPanelProps,
} from "./src/components/AiTryOnPhotoPanel";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import type { HttpResponse } from "./src/server/httpTypes";
import type { AiTryOnOrderDetails } from "./src/utils/aiTryOnOrderDetails";
import { PRIVACY_POLICY } from "./src/data/legalContent";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const DAY = 24 * 60 * 60 * 1000;

// ------------------------------------------------------------ catalogue + assets
{
  assert.equal(AI_TRY_ON_DEFAULT_MODELS.length, 10);
  assert.equal(new Set(AI_TRY_ON_DEFAULT_MODELS.map((m) => m.id)).size, 10, "unique ids");
  assert.equal(AI_TRY_ON_DEFAULT_MODELS.filter((m) => m.group === "men").length, 5);
  assert.equal(AI_TRY_ON_DEFAULT_MODELS.filter((m) => m.group === "women").length, 5);
  for (const group of ["men", "women"] as const) {
    const models = AI_TRY_ON_DEFAULT_MODELS.filter((m) => m.group === group);
    assert.deepEqual(new Set(models.map((m) => m.skinTone)), new Set(["light", "medium", "deep"]), `${group}: skin tones`);
    assert.deepEqual(new Set(models.map((m) => m.build)), new Set(["regular", "medium", "plus"]), `${group}: builds`);
  }
  const files = readdirSync("public/ai-try-on-models").sort();
  assert.deepEqual(files, AI_TRY_ON_DEFAULT_MODELS.map((m) => `${m.id}.webp`).sort(), "one WebP per model, nothing else");
  for (const model of AI_TRY_ON_DEFAULT_MODELS) {
    const bytes = readFileSync(aiTryOnDefaultModelImagePath(model));
    assert.equal(bytes.subarray(8, 12).toString("latin1"), "WEBP", model.id);
    assert.ok(statSync(aiTryOnDefaultModelImagePath(model)).size < 40_000, `${model.id} stays small`);
    assert.equal(aiTryOnDefaultModelImageUrl(model), `/ai-try-on-models/${model.id}.webp`);
    const loaded = await loadAiTryOnDefaultModelImage(model);
    assert.equal(loaded.mimeType, "image/webp");
    assert.equal(loaded.data, bytes.toString("base64"));
  }
  // Approved captions: the original six are "regular build".
  assert.deepEqual(
    AI_TRY_ON_DEFAULT_MODELS.map((m) => `${m.id}: ${m.label}`),
    [
      "male-1-light: Light skin tone, regular build",
      "male-2-medium: Medium skin tone, regular build",
      "male-3-deep: Deep skin tone, regular build",
      "male-medium-build: Medium skin tone, medium build",
      "male-plus: Medium skin tone, plus-size",
      "female-1-light: Light skin tone, regular build",
      "female-2-medium: Medium skin tone, regular build",
      "female-3-deep: Deep skin tone, regular build",
      "female-medium-build: Medium skin tone, medium build",
      "female-plus: Medium skin tone, plus-size",
    ],
  );
  assert.equal(AI_TRY_ON_DEFAULT_MODELS.some((m) => /slim/i.test(m.label)), false);
  assert.equal(findAiTryOnDefaultModel("../secrets"), null);
  assert.equal(findAiTryOnDefaultModel(undefined), null);
  // Bundled into the AI Try-on function so the server reads them from disk.
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.equal(vercel.functions["api/design-studio/transfer-uploaded-design-draft.ts"].includeFiles, "public/ai-try-on-models/**");
  assert.match(readFileSync("storage.rules", "utf8"), /match \/ai-try-on-model-results\/\{allPaths=\*\*\} \{\n\s+allow read, write: if false;/);
  assert.match(readFileSync("firestore.rules", "utf8"), /match \/aiTryOnModelResults\/\{document=\*\*\} \{\n\s+allow read, write: if false;/);
}

// ------------------------------------------------------------ model-mode prompt
{
  // v2 / v4: swatch decides the fabric. v3: swatch text ignored. v4: swatch cropped.
  // v6: explicit order choices win over either reference photo.
  assert.equal(AI_TRY_ON_MODEL_PROMPT_VERSION, "tryon-model-prompt-v6");
  assert.equal(AI_TRY_ON_PROMPT_VERSION, "tryon-prompt-v9");
  for (const mode of ["garment", "fabric"] as const) {
    const prompt = buildAiTryOnModelPrompt({ mode });
    assert.match(prompt, /Image 1: our studio model\./);
    assert.match(prompt, /Any person in image 2 is only a stand-in\. Never use their face, body, pose or background, and never return image 2\./);
    assert.match(prompt, /Copy only the ordered garment, not other clothing in image 2/);
    assert.match(prompt, /keep the studio model's other clothing and shoes from image 1/);
    assert.match(prompt, /Check: the face, body, skin tone and background must be the studio model's from image 1, not the stand-in's\./);
    assert.equal(/customer/i.test(prompt), false, `${mode}: no customer wording`);
    assert.equal(/Fit guide/.test(prompt), false, `${mode}: never a fit block`);
    assert.equal(buildAiTryOnModelImageLabels(mode).length, mode === "fabric" ? 3 : 2, "one label per image");
    assert.ok(buildAiTryOnModelImageLabels(mode).every((label) => label.startsWith("Image ")));
  }
  assert.match(buildAiTryOnModelPrompt({ mode: "fabric" }), /made from the fabric in image 3/);
  {
    const fabricPrompt = buildAiTryOnModelPrompt({
      mode: "fabric",
      orderDetails: { garments: [{ garmentType: "shirt", optionIds: [], decorations: [] }], fabric: { colour: "Brown", colourHex: "#724137", category: "Lace" } } as never,
    });
    assert.match(fabricPrompt, /From image 3 take only the fabric: colour, pattern, motif scale, texture and sheen\. Image 3 always decides these; nothing in image 2 or in this text overrides it\./);
    assert.match(fabricPrompt, /The named garment type and explicitly chosen order details win over image 2/);
    assert.match(fabricPrompt, /Order details\. Keep the named garment type\. Explicit choices below override both photos.*They never change the fabric from image 3\./);
    assert.equal(fabricPrompt.includes("where they differ from image 2, follow these"), false);
    assert.equal(fabricPrompt.includes("for the garment style only"), false);
    assert.match(fabricPrompt, /\nFabric: exactly as in image 3\n/);
    assert.match(fabricPrompt, /Ignore any labels, tags, stickers, codes or text printed on the swatch in image 3, and never put them in the image\./);
    assert.equal(buildAiTryOnModelPrompt({ mode: "garment" }).includes("printed on the swatch"), false);
    for (const label of ["Brown", "#724137", "Lace"]) assert.equal(fabricPrompt.includes(label), false, `model mode: no "${label}" text`);
  }
  assert.equal(buildAiTryOnModelPrompt({ mode: "garment" }).includes("image 3"), false);
  const details: AiTryOnOrderDetails = {
    garments: [{
      garmentType: "shirt",
      optionIds: ["shirt_long_midlong", "neck_vert_round"],
      decorations: ["embroidery"],
    }],
  };
  const garmentPrompt = buildAiTryOnModelPrompt({ mode: "garment", orderDetails: details });
  assert.match(garmentPrompt, /Order details\. Keep the named garment type\./);
  assert.match(garmentPrompt, /Use image 2 only for details the order does not specify/);
  assert.equal(garmentPrompt.includes("where they differ from image 2, follow these"), false);
  assert.equal(garmentPrompt.includes("Long Length Shirt, Mid-Long Sleeve"), true, "chosen length and sleeves reach the prompt");
  assert.equal(garmentPrompt.includes("Vertical Collar, Round Neck"), true, "chosen neckline reaches the prompt");
  assert.match(garmentPrompt, /Embroidery: as on the garment in image 2/);
  assert.match(garmentPrompt, /keep the studio model's other clothing and shoes from image 1/);
}

// All four variants retain explicit collar choices and ban shirt-to-polo swaps.
for (const builder of [buildAiTryOnPrompt, buildAiTryOnModelPrompt]) {
  for (const mode of ["garment", "fabric"] as const) {
    const prompt = builder({ mode, orderDetails: { garments: [{ garmentType: "shirt", optionIds: ["neck_vert_round", "shirt_std_short"], decorations: [] }] } });
    assert.match(prompt, /Garment: Standard Shirt/);
    assert.match(prompt, /button-front shirt with a shirt hem, never a polo, tunic or Long Shirt/);
    assert.match(prompt, /Use a shirt collar unless the order explicitly chooses another neckline or collar/);
    assert.match(prompt, /Neckline and collar: Vertical Collar, Round Neck/);
    assert.match(prompt, /Length and sleeves: Standard Length Shirt, Short Sleeve/);
    assert.match(prompt, /Explicit choices below override both photos/);
    assert.match(prompt, /tuck in or out/);
    assert.equal(prompt.includes("order-detail text never changes it"), false);
  }
}

// ------------------------------------------------------------ fingerprint (cache key)
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]);
const img = (bytes: Buffer, mimeType: "image/png" | "image/jpeg" | "image/webp" = "image/png") => ({ mimeType, data: bytes.toString("base64") });
{
  const base = {
    modelId: "male-plus",
    modelImage: img(Buffer.from("MODEL-A"), "image/webp"),
    mode: "fabric" as const,
    garmentImage: img(png),
    fabricImage: img(jpeg, "image/jpeg"),
    orderDetails: null,
  };
  const key = createAiTryOnModelResultKey(base);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(createAiTryOnModelResultKey({ ...base }), key, "deterministic");
  const differs = (override: Partial<typeof base> & Record<string, unknown>, why: string) =>
    assert.notEqual(createAiTryOnModelResultKey({ ...base, ...override } as typeof base), key, why);
  differs({ modelId: "male-2-medium" }, "model id");
  differs({ modelImage: img(Buffer.from("MODEL-B"), "image/webp") }, "replaced model picture");
  differs({ garmentImage: img(Buffer.concat([png, Buffer.from("x")])) }, "garment picture");
  differs({ fabricImage: img(Buffer.concat([jpeg, Buffer.from("x")]), "image/jpeg") }, "fabric picture");
  differs({ mode: "garment", fabricImage: null } as never, "mode");
  differs({ orderDetails: { garments: [{ garmentType: "shirt", optionIds: ["x"], decorations: [] }] } as never }, "order details");
  // Same details in another order: same key.
  const a = { garments: [{ garmentType: "shirt", optionIds: ["b", "a"], decorations: [] }] } as never;
  const b = { garments: [{ garmentType: "shirt", optionIds: ["a", "b"], decorations: [] }] } as never;
  assert.equal(createAiTryOnModelResultKey({ ...base, orderDetails: a }), createAiTryOnModelResultKey({ ...base, orderDetails: b }));
  // The model prompt version is folded in (bumping it stales every saved result).
  assert.match(readFileSync("src/server/aiTryOnModelResultCache.ts", "utf8"), /CACHE_KEY_SCHEMA,\n\s+AI_TRY_ON_MODEL_PROMPT_VERSION,/);
}

// ------------------------------------------------------------ request parsing
{
  const body = (extra: Record<string, unknown>) => ({
    mode: "garment",
    inputFingerprint: "tryon-v1-0123456789abcdef",
    garmentImageUrl: "https://firebasestorage.googleapis.com/v0/b/b/o/styles%2Fa.png",
    ...extra,
  });
  const ok = parseAiTryOnGenerationRequest(body({ defaultModelId: "female-plus" }));
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.defaultModel?.id, "female-plus");
    assert.equal(ok.personImage, null);
  }
  assert.equal(parseAiTryOnGenerationRequest(body({ defaultModelId: "female-plus", fitHints: [] })).ok, true);
  const refused = (extra: Record<string, unknown>, why: string) => {
    const parsed = parseAiTryOnGenerationRequest(body(extra));
    assert.equal(parsed.ok, false, why);
  };
  refused({ defaultModelId: "nobody" }, "unknown model");
  refused({ defaultModelId: 3 }, "non-string model");
  refused({ defaultModelId: "female-plus", personImage: img(jpeg, "image/jpeg") }, "photo and model");
  refused({ defaultModelId: "female-plus", fitHints: [{ id: "total_height", valueCm: 170 }] }, "no fit hints in model mode");
  refused({ defaultModelId: "female-plus", garmentImageUrl: undefined, garmentImage: img(png) }, "catalogue URLs only");
  refused({}, "photo flow still needs a photo");
}

// ------------------------------------------------------------ fakes
type Doc = Record<string, unknown>;
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
      delete: (ref: { path: string }) => void this.docs.delete(ref.path),
    };
    const run = this.lock.then(() => fn(tx));
    this.lock = run.catch(() => undefined);
    return run;
  }
  inCollection(name: string) {
    return [...this.docs.entries()].filter(([path]) => path.startsWith(`${name}/`));
  }
  asFirestore() {
    return this as unknown as Firestore;
  }
}

class FakeBucket {
  readonly name = "test-bucket.firebasestorage.app";
  readonly objects = new Map<string, { bytes: Buffer; options: unknown; customTime?: string }>();
  file(path: string) {
    return {
      save: async (data: Buffer, options: { metadata?: { customTime?: string } }) =>
        void this.objects.set(path, { bytes: data, options, customTime: options.metadata?.customTime }),
      download: async (): Promise<[Buffer]> => {
        const entry = this.objects.get(path);
        if (!entry) throw new Error("No such object");
        return [entry.bytes];
      },
      delete: async () => void this.objects.delete(path),
      setMetadata: async (metadata: { customTime?: string }) => {
        const entry = this.objects.get(path);
        if (entry) entry.customTime = metadata.customTime;
      },
    };
  }
  under(prefix: string) {
    return [...this.objects.entries()].filter(([path]) => path.startsWith(`${prefix}/`));
  }
}

// ------------------------------------------------------------ cache store: 90 days after last use
{
  let clock = Date.UTC(2026, 10, 2, 12);
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const cache = createAiTryOnModelResultCache(db.asFirestore(), bucket, { now: () => clock });
  const key = "a".repeat(64);
  assert.equal(await cache.reuse(key), null, "miss on an empty cache");
  await cache.save(key, { modelId: "male-plus", mode: "garment", image: img(Buffer.from("RESULT"), "image/webp") });
  const [path, object] = bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX)[0];
  assert.equal(path, `${AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX}/${key}.webp`);
  assert.equal(JSON.stringify(object.options).includes("firebaseStorageDownloadTokens"), false, "no public URL");
  assert.equal(object.customTime, new Date(clock).toISOString());
  const doc = db.docs.get(`${AI_TRY_ON_MODEL_RESULT_COLLECTION}/${key}`)!;
  assert.ok(doc.expiresAt instanceof Date, "TTL field is a timestamp");
  assert.equal((doc.expiresAt as Date).getTime(), clock + 90 * DAY);
  assert.equal(AI_TRY_ON_MODEL_RESULT_RETENTION_MS, 90 * DAY);

  clock += 80 * DAY;
  assert.equal((await cache.reuse(key))?.data, Buffer.from("RESULT").toString("base64"), "hit within 90 days");
  const bumped = db.docs.get(`${AI_TRY_ON_MODEL_RESULT_COLLECTION}/${key}`)!;
  assert.equal((bumped.lastUsedAt as Date).getTime(), clock, "last use bumped");
  assert.equal((bumped.expiresAt as Date).getTime(), clock + 90 * DAY, "expiry follows the last use");
  assert.equal(bucket.objects.get(path)!.customTime, new Date(clock).toISOString(), "Storage customTime bumped");

  clock += 89 * DAY;
  assert.ok(await cache.reuse(key), "still live: 169 days after creation, 89 after last use");
  clock += 90 * DAY + 1;
  assert.equal(await cache.reuse(key), null, "gone 90 days after the last use");
  assert.equal(bucket.objects.size, 0, "deleted lazily");
  assert.equal(db.docs.size, 0);

  // A record whose file is gone is forgotten, not served.
  await cache.save(key, { modelId: "male-plus", mode: "garment", image: img(Buffer.from("R2"), "image/webp") });
  bucket.objects.clear();
  assert.equal(await cache.reuse(key), null);
  assert.equal(db.docs.size, 0);
}

// ------------------------------------------------------------ HTTP: miss, hit, sharing, photo flow
const ORDER = `tts1_${"A".repeat(43)}`;
const OTHER_ORDER = `tts1_${"B".repeat(43)}`;
const FINGERPRINT = "tryon-v1-0123456789abcdef";
const GARMENT_URL = "https://firebasestorage.googleapis.com/v0/b/b/o/styles%2Fa.png";
const FABRIC_URL = "https://firebasestorage.googleapis.com/v0/b/b/o/fabrics%2Fr.jpg";
const GEMINI_OUTPUT = Buffer.concat([png, Buffer.from("GEMINI-OUTPUT")]).toString("base64");
const PERSON_PHOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("PERSON-PHOTO")]).toString("base64");

const response = () => {
  const state: { status: number; headers: Record<string, string>; body: unknown } = { status: 200, headers: {}, body: undefined };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader(name, value) { state.headers[name.toLowerCase()] = value; return res; },
    json(body) { state.body = body; return body; },
  };
  return { res, state };
};

const harness = () => {
  let clock = Date.UTC(2026, 10, 2, 12);
  const db = new FakeFirestore();
  const bucket = new FakeBucket();
  const geminiRequests: Array<{ contents: Array<{ parts: Array<{ text?: string; inlineData?: { data: string } }> }> }> = [];
  const events: string[] = [];
  const tokens = [ORDER, OTHER_ORDER];
  const deps: AiTryOnHttpDependencies = {
    environment: { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" },
    getDb: () => db.asFirestore(),
    now: () => clock,
    consumeIpRateLimit: async () => void events.push("ip"),
    createGenerateContent: () => async (request) => {
      events.push("gemini");
      geminiRequests.push(request as never);
      return { candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType: "image/png", data: GEMINI_OUTPUT } }] } }] };
    },
    createPreviewStore: (database) => createAiTryOnPreviewStore(database, bucket as never, { now: () => clock }),
    createModelResultCache: (database) => createAiTryOnModelResultCache(database, bucket, { now: () => clock }),
    loadReferenceImage: async (url) => {
      events.push(`ref:${url.includes("fabrics") ? "fabric" : "garment"}`);
      return url.includes("fabrics") ? img(jpeg, "image/jpeg") : img(png);
    },
    createSessions: (database, options) => createAiTryOnSessions(database, { ...options, now: () => clock, createGuestToken: () => tokens.shift()! }),
    compactPreviewImage: async (image) => ({ mimeType: "image/webp", data: image.data, bytes: 0, width: 1, height: 1 }),
    log: () => undefined,
  };
  const ready = (async () => {
    const sessions = createAiTryOnSessions(db.asFirestore(), { now: () => clock, createGuestToken: () => tokens.shift()! });
    await sessions.resolve({ uid: null, token: null });
    await sessions.resolve({ uid: null, token: null });
  })();
  const post = async (body: Record<string, unknown>, session = ORDER) => {
    await ready;
    const result = response();
    await handleAiTryOn(
      {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9", "x-ai-try-on-session": session },
        query: { route: "ai-try-on" },
        body: { mode: "garment", inputFingerprint: FINGERPRINT, wearerKey: "w-ada", garmentImageUrl: GARMENT_URL, ...body },
      } as never,
      result.res,
      deps,
    );
    return result.state as { status: number; body: Record<string, unknown> };
  };
  const usage = () => JSON.stringify(db.inCollection("aiTryOnUsage"));
  return { db, bucket, deps, geminiRequests, events, post, usage, ready };
};

{
  const h = harness();
  // 1. Cache miss: one try, one Gemini call, saved to the shared cache.
  const miss = await h.post({ defaultModelId: "female-plus" });
  assert.equal(miss.status, 200);
  assert.equal(miss.body.cacheHit, false);
  assert.equal(miss.body.modelId, "female-plus");
  assert.equal(miss.body.promptVersion, AI_TRY_ON_MODEL_PROMPT_VERSION);
  assert.equal(miss.body.orderTriesRemaining, 4, "a new model image uses one of the order's 5 tries");
  assert.equal(miss.body.previewStored, true);
  assert.deepEqual(h.events, ["ref:garment", "ip", "gemini"], "IP window charged only on a miss, after the cache lookup");
  const request = h.geminiRequests[0];
  const parts = request.contents[0].parts;
  const modelBytes = readFileSync("public/ai-try-on-models/female-plus.webp").toString("base64");
  assert.equal(parts.filter((part) => part.inlineData).length, 2);
  assert.equal(parts.find((part) => part.inlineData)?.inlineData?.data, modelBytes, "image 1 is our model, loaded by the server");
  const texts = parts.map((part) => part.text).filter(Boolean).join("\n");
  assert.ok(texts.includes(buildAiTryOnModelPrompt({ mode: "garment" })), "model-mode prompt");
  assert.ok(texts.includes(buildAiTryOnModelImageLabels("garment")[0]), "model-mode labels");
  assert.deepEqual((request as unknown as { config: { imageConfig?: unknown } }).config.imageConfig, { aspectRatio: "3:4" }, "full-body 3:4 output");
  assert.equal(h.bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX).length, 1, "shared result saved");
  const wearerCopies = h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION);
  assert.equal(wearerCopies.length, 1, "per-wearer copy for this session");
  assert.equal(wearerCopies[0][1].modelId, "female-plus");
  const usageAfterMiss = h.usage();

  // 2. Same selection again: a cache hit costs nothing.
  h.events.length = 0;
  const hit = await h.post({ defaultModelId: "female-plus" });
  assert.equal(hit.status, 200);
  assert.equal(hit.body.cacheHit, true);
  assert.equal(hit.body.modelId, "female-plus");
  assert.equal(h.geminiRequests.length, 1, "no Gemini call on a hit");
  assert.deepEqual(h.events, ["ref:garment"], "no IP charge, no Gemini");
  assert.equal(hit.body.orderTriesRemaining, 4, "no try reserved");
  assert.equal(h.usage(), usageAfterMiss, "usage counters untouched by a hit");
  assert.equal((hit.body.image as { data: string }).data, (miss.body.image as { data: string }).data);
  assert.notEqual((hit.body.resultReference as { assetId: string }).assetId, (miss.body.resultReference as { assetId: string }).assetId);
  assert.equal(h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION).length, 1, "same wearer: copy replaced, not duplicated");

  // 3. Shared across customers: another order's same selection is a free hit.
  const shared = await h.post({ defaultModelId: "female-plus" }, OTHER_ORDER);
  assert.equal(shared.body.cacheHit, true);
  assert.equal(shared.body.orderTriesRemaining, 5, "the other order keeps all its tries");
  assert.equal(h.geminiRequests.length, 1);
  assert.equal(h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION).length, 2, "each session gets its own copy");

  // 4. Another model, fabric or order details: a miss.
  const other = await h.post({ defaultModelId: "male-plus" });
  assert.equal(other.body.cacheHit, false);
  assert.equal(other.body.orderTriesRemaining, 3);
  const fabric = await h.post({ defaultModelId: "male-plus", mode: "fabric", fabricSwatchImageUrl: FABRIC_URL });
  assert.equal(fabric.body.cacheHit, false);
  const fabricTexts = h.geminiRequests.at(-1)!.contents[0].parts.map((part) => part.text).filter(Boolean).join("\n");
  assert.ok(fabricTexts.includes(buildAiTryOnModelPrompt({ mode: "fabric" })));
  assert.equal(h.geminiRequests.at(-1)!.contents[0].parts.filter((part) => part.inlineData).length, 3);
  assert.equal(h.geminiRequests.length, 3);

  // 5. Out of tries: a saved result is still served, a new one is refused.
  await h.post({ defaultModelId: "male-1-light" });
  await h.post({ defaultModelId: "male-2-medium" });
  const outOfTries = await h.post({ defaultModelId: "male-3-deep" });
  assert.equal(outOfTries.status, 429);
  assert.equal(outOfTries.body.code, "ORDER_TRY_LIMIT_REACHED");
  const stillFree = await h.post({ defaultModelId: "female-plus" });
  assert.equal(stillFree.body.cacheHit, true, "reuse needs no try");
  assert.equal(stillFree.body.orderTriesRemaining, 0);

  // 6. "Delete my preview" removes only the customer's copy, not the shared result.
  const sharedBefore = h.bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX).length;
  await h.ready;
  const del = response();
  await handleAiTryOn(
    { method: "DELETE", headers: { "x-ai-try-on-session": ORDER }, query: { route: "ai-try-on", all: "1" } } as never,
    del.res,
    h.deps,
  );
  assert.equal(del.state.status, 200);
  assert.equal(h.bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX).length, sharedBefore, "shared results kept");
  assert.equal(h.db.inCollection(AI_TRY_ON_MODEL_RESULT_COLLECTION).length, sharedBefore);
}

{
  // Photo flow unchanged: same prompt, labels, version, IP charge first, no cache.
  const h = harness();
  let cacheTouched = false;
  h.deps.createModelResultCache = () => {
    cacheTouched = true;
    throw new Error("photo flow must not use the model cache");
  };
  const fitHints = [{ id: "total_height", valueCm: 170 }];
  const photo = await h.post({ personImage: { mimeType: "image/jpeg", data: PERSON_PHOTO }, fitHints });
  assert.equal(photo.status, 200);
  assert.equal(cacheTouched, false);
  assert.deepEqual(h.events, ["ip", "ref:garment", "gemini"], "photo flow order of checks unchanged");
  assert.equal(photo.body.promptVersion, AI_TRY_ON_PROMPT_VERSION);
  assert.equal("modelId" in photo.body, false);
  assert.equal("cacheHit" in photo.body, false);
  assert.equal(photo.body.orderTriesRemaining, 4);
  const parts = h.geminiRequests[0].contents[0].parts;
  const texts = parts.map((part) => part.text).filter(Boolean).join("\n");
  assert.ok(texts.includes(buildAiTryOnPrompt({ mode: "garment", fitHints: fitHints as never })), "photo prompt with fit hints");
  assert.ok(texts.includes(buildAiTryOnImageLabels("garment")![0]));
  assert.equal(parts.find((part) => part.inlineData)?.inlineData?.data, PERSON_PHOTO, "image 1 is the customer's photo");
  assert.equal("imageConfig" in (h.geminiRequests[0] as unknown as { config: object }).config, false, "photo request config unchanged");
  assert.equal(h.bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX).length, 0, "photos are never shared");
  assert.equal("modelId" in h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION)[0][1], false);
}

{
  // An expired shared result is regenerated (uses a try again).
  const h = harness();
  await h.post({ defaultModelId: "female-2-medium" });
  // (Sessions end long before 90 days, so age the shared record directly.)
  for (const [path, doc] of h.db.inCollection(AI_TRY_ON_MODEL_RESULT_COLLECTION)) {
    h.db.docs.set(path, { ...doc, expiresAt: new Date(Date.UTC(2026, 10, 2, 11)) });
  }
  const again = await h.post({ defaultModelId: "female-2-medium" }, OTHER_ORDER);
  assert.equal(again.body.cacheHit, false);
  assert.equal(h.geminiRequests.length, 2);
}

{
  // A model that fails to load never uses a try.
  const h = harness();
  h.deps.loadDefaultModelImage = async () => { throw new Error("missing"); };
  const failed = await h.post({ defaultModelId: "female-plus" });
  assert.equal(failed.status, 422);
  assert.equal(failed.body.code, "REFERENCE_IMAGE_UNAVAILABLE");
  assert.equal(h.geminiRequests.length, 0);
  assert.equal(h.usage(), "[]");
}

// Combined outfits use one normal reservation, never the shared model cache.
for (const onModel of [false, true]) {
  const h = harness();
  h.deps.createModelResultCache = () => { throw new Error("outfit must not use shared cache"); };
  const outfitGarments = [
    { garmentKey: "shirt:chosen", garmentType: "shirt", garmentImageUrl: GARMENT_URL, fabricSwatchImageUrl: FABRIC_URL },
    { garmentKey: "trouser:chosen", garmentType: "trouser", garmentImageUrl: `${GARMENT_URL}&bottom=1`, fabricSwatchImageUrl: `${FABRIC_URL}&bottom=1` },
  ];
  const refs: string[] = [];
  h.deps.loadReferenceImage = async (url) => { refs.push(url); return img(Buffer.from(url), "image/jpeg"); };
  const cropped: string[] = [];
  h.deps.cropFabricSwatch = async (image) => { cropped.push(Buffer.from(image.data, "base64").toString()); return { ...image, data: Buffer.from(`cropped:${Buffer.from(image.data, "base64")}`).toString("base64") }; };
  const body = { garmentImageUrl: undefined, wearerKey: "w-outfit", outfitGarments, ...(onModel ? { defaultModelId: "male-plus" } : { personImage: { mimeType: "image/jpeg", data: PERSON_PHOTO } }) };
  const result = await h.post(body);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.promptVersion, AI_TRY_ON_OUTFIT_PROMPT_VERSION);
  assert.equal(result.body.orderTriesRemaining, 4, "one whole outfit costs exactly one try");
  assert.equal(h.events.filter((event) => event === "ip").length, 1);
  assert.equal(h.geminiRequests.length, 1);
  assert.deepEqual(refs, [GARMENT_URL, FABRIC_URL, `${GARMENT_URL}&bottom=1`, `${FABRIC_URL}&bottom=1`]);
  assert.deepEqual(cropped, [FABRIC_URL, `${FABRIC_URL}&bottom=1`], "crop both swatches, never either garment");
  const images = h.geminiRequests[0].contents[0].parts.flatMap((part) => part.inlineData ? [part.inlineData.data] : []);
  assert.equal(images.length, 5);
  assert.deepEqual(images.slice(1).map((data) => Buffer.from(data, "base64").toString()), [GARMENT_URL, `cropped:${FABRIC_URL}`, `${GARMENT_URL}&bottom=1`, `cropped:${FABRIC_URL}&bottom=1`]);
  const docs = h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION);
  assert.equal(docs.length, 1, "one private compressed outfit slot");
  assert.equal(docs[0][1].wearerKey, "w-outfit");
  assert.equal(docs[0][1].mimeType, "image/webp");
  assert.equal((docs[0][1].expiresAt as Date).getTime(), Date.UTC(2026, 10, 2, 12) + 30 * DAY, "existing 30-day TTL");
  assert.equal(h.bucket.under(AI_TRY_ON_MODEL_RESULT_STORAGE_PREFIX).length, 0);
  await h.post(body);
  assert.equal(h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION).length, 1, "regenerating replaces only latest outfit slot");
  assert.equal(h.geminiRequests.length, 2, "repeat combined request still costs one try, no shared cache");
  assert.equal((await h.post({ ...body, wearerKey: "w-shirt", outfitGarments: undefined, garmentImageUrl: GARMENT_URL })).body.orderTriesRemaining, 2);
  assert.equal(h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION).length, 2, "individual preview coexists");
}

{
  const top = { garmentKey: "shirt:1", garmentType: "shirt", garmentImageUrl: GARMENT_URL };
  const bottom = { garmentKey: "trouser:1", garmentType: "trouser", garmentImageUrl: GARMENT_URL };
  const valid = { mode: "garment", inputFingerprint: FINGERPRINT, defaultModelId: "male-plus", outfitGarments: [top, bottom] };
  assert.equal(parseAiTryOnGenerationRequest(valid).ok, true);
  for (const overrides of [
    { outfitGarments: [top, top] }, { outfitGarments: [bottom, bottom] }, { outfitGarments: [top, bottom, bottom] },
    { outfitGarments: [top] }, { outfitGarments: [top, { ...bottom, garmentKey: top.garmentKey }] },
    { outfitGarments: [{ ...top, garmentImage: img(png) }, bottom] },
    { outfitGarments: [{ ...top, garmentImageUrl: "http://example.test/a" }, bottom] },
    { outfitGarments: [{ ...top, orderDetails: { garments: [{ garmentType: "trouser", optionIds: [], decorations: [] }] } }, bottom] },
    { garmentImageUrl: GARMENT_URL }, { fabricSwatchImageUrl: FABRIC_URL }, { mode: "fabric" },
    { uploadedDesignImage: img(png) }, { defaultModelId: undefined },
  ]) assert.equal(parseAiTryOnGenerationRequest({ ...valid, ...overrides }).ok, false, JSON.stringify(overrides));
}

{
  const h = harness();
  h.deps.createGenerateContent = () => async () => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] });
  const result = await h.post({ garmentImageUrl: undefined, defaultModelId: "male-plus", outfitGarments: [
    { garmentKey: "top", garmentType: "shirt", garmentImageUrl: GARMENT_URL },
    { garmentKey: "bottom", garmentType: "trouser", garmentImageUrl: GARMENT_URL },
  ] });
  assert.equal(result.status, 422);
  assert.equal(result.body.orderTriesRemaining, 5, "failed combined generation refunds its single reservation");
  assert.equal(h.db.inCollection(AI_TRY_ON_PREVIEW_COLLECTION).length, 0);
}

// ------------------------------------------------------------ client gateway mapping
{
  const completed = (extra: Record<string, unknown>) =>
    mapAiTryOnPreviewResponse(200, {
      status: "completed",
      image: { mimeType: "image/webp", data: "UklGRg==" },
      resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-11111111-2222-4333-8444-555555555555", ownerBindingId: "session-x" },
      previewStored: true,
      orderTriesRemaining: 4,
      ...extra,
    });
  const hit = completed({ modelId: "male-plus", cacheHit: true });
  assert.equal(hit.kind === "completed" && hit.modelId, "male-plus");
  assert.equal(hit.kind === "completed" && hit.cacheHit, true);
  const photo = completed({});
  assert.equal(photo.kind === "completed" && "modelId" in photo, false);
  const bogus = completed({ modelId: "someone-else" });
  assert.equal(bogus.kind === "completed" && "modelId" in bogus, false, "unknown model ids are dropped");

  const availability = await fetchAiTryOnAvailability({
    credentials: { sessionToken: null, getIdToken: async () => null },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          status: "available",
          triesPerOrder: 5,
          orderTriesRemaining: 4,
          previews: [
            { previewId: "tryon-11111111-2222-4333-8444-555555555555", wearerKey: "w-ada", inputFingerprint: FINGERPRINT, expiresAt: "2026-12-01T00:00:00.000Z", modelId: "female-plus" },
            { previewId: "tryon-21111111-2222-4333-8444-555555555555", wearerKey: "w-obi", inputFingerprint: FINGERPRINT, expiresAt: "2026-12-01T00:00:00.000Z", modelId: "nope" },
            { previewId: "tryon-31111111-2222-4333-8444-555555555555", wearerKey: "w-eze", inputFingerprint: FINGERPRINT, expiresAt: "2026-12-01T00:00:00.000Z" },
          ],
        }),
        { status: 200 },
      ),
  });
  assert.equal(availability.status, "available");
  if (availability.status === "available") {
    assert.deepEqual(availability.storedPreviews.map((entry) => entry.modelId ?? null), ["female-plus", null, null]);
  }
}

// ------------------------------------------------------------ panel: picker, per-wearer, photo flow
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");
const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: FINGERPRINT,
  mode: "garment",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [{ id: "total_height", valueCm: 170 }] as never,
  orderDetails: null,
  ...overrides,
});
const renderPanel = (props: Partial<AiTryOnPhotoPanelProps> = {}) => {
  const requests: Array<Record<string, unknown>> = [];
  let renderer!: ReturnType<typeof create>;
  const base: AiTryOnPhotoPanelProps = {
    targets: [target()],
    triesPerOrder: 5,
    initialTriesRemaining: 5,
    onPreviewCreated: () => undefined,
    onUnavailable: () => undefined,
    requestPreview: async (request) => {
      requests.push(request as never);
      return {
        kind: "completed",
        resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "order-x" },
        preview: { mimeType: "image/webp", data: "UklGRg==" },
        orderTriesRemaining: 4,
      };
    },
    preparePhoto: async () => ({ mimeType: "image/jpeg", data: "/9j/4AAQ" }),
    createThumbnailUrl: () => null,
    revokeThumbnailUrl: () => undefined,
    jobStore: createAiTryOnBackgroundJobs({ storage: null }),
    ...props,
  };
  act(() => {
    renderer = create(createElement(AiTryOnPhotoPanel, base));
  });
  return { renderer, requests };
};
const byData = (renderer: ReturnType<typeof create>, attribute: string, value?: string) =>
  renderer.root.findAll((node) => typeof node.type === "string" && node.props[attribute] !== undefined && (value === undefined || node.props[attribute] === value));
const click = async (node: ReactTestInstance) => {
  await act(async () => {
    await node.props.onClick();
  });
};
const generateButton = (renderer: ReturnType<typeof create>) =>
  renderer.root.find((node) => node.type === "button" && /Generate preview|Make a new preview/.test(textOf(node)));
const choosePhoto = async (renderer: ReturnType<typeof create>) => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => {
    await input.props.onChange({ target: { files: [file] } });
  });
};
const hasConsent = (renderer: ReturnType<typeof create>) => byData(renderer, "data-ai-try-on-consent").length > 0;

{
  const { renderer, requests } = renderPanel();
  // The option sits next to the photo picker; the picker opens on demand.
  const option = byData(renderer, "data-ai-try-on-model-option");
  assert.equal(option.length, 1);
  assert.equal(textOf(option[0]), AI_TRY_ON_MODEL_COPY.option);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 0);
  assert.equal(hasConsent(renderer), true);
  await click(option[0]);
  const picker = byData(renderer, "data-ai-try-on-model-picker")[0];
  assert.match(textOf(picker), new RegExp(AI_TRY_ON_MODEL_COPY.heading));
  assert.equal(byData(renderer, "data-ai-try-on-model").length, 10, "all ten models");
  assert.deepEqual(byData(renderer, "data-ai-try-on-model-group").map((node) => node.props["data-ai-try-on-model-group"]), ["men", "women"]);
  // Filter by Men / Women.
  await click(byData(renderer, "data-ai-try-on-model-filter", "women")[0]);
  assert.deepEqual(
    byData(renderer, "data-ai-try-on-model").map((node) => node.props["data-ai-try-on-model"]),
    ["female-1-light", "female-2-medium", "female-3-deep", "female-medium-build", "female-plus"],
  );
  const thumbs = renderer.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("/ai-try-on-models/"));
  assert.equal(thumbs.length, 5, "static assets, no Storage");
  assert.ok(byData(renderer, "data-ai-try-on-model").every((node) => /skin tone/.test(textOf(node))), "skin tone + build shown");
  assert.equal(generateButton(renderer).props.disabled, true, "nothing chosen yet");
  await click(byData(renderer, "data-ai-try-on-model", "female-plus")[0]);
  assert.equal(byData(renderer, "data-ai-try-on-model", "female-plus")[0].props["aria-checked"], true);
  assert.equal(hasConsent(renderer), false, "model mode needs no consent notice");
  assert.equal(generateButton(renderer).props.disabled, false, "no photo needed");
  await click(generateButton(renderer));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].defaultModelId, "female-plus");
  assert.equal("personImage" in requests[0], false);
  assert.equal("fitHints" in requests[0], false, "fit hints are not sent in model mode");
  const result = byData(renderer, "data-ai-try-on-result")[0];
  assert.match(textOf(result), new RegExp(AI_TRY_ON_MODEL_COPY.shownOnModel));
  assert.ok(textOf(result).includes(AI_TRY_ON_PREVIEW_DISCLAIMER), "AI disclaimer kept");
}

{
  // Per wearer: each wearer keeps their own choice; a photo replaces a model.
  const { renderer, requests } = renderPanel({ targets: [target(), target({ wearerId: "w-obi", label: "Obi" })] });
  await click(byData(renderer, "data-ai-try-on-model-option")[0]);
  await click(byData(renderer, "data-ai-try-on-model", "male-plus")[0]);
  await click(byData(renderer, "data-wearer-chip", "w-obi")[0]);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 0, "Obi has no model chosen");
  assert.equal(hasConsent(renderer), true);
  assert.equal(generateButton(renderer).props.disabled, true);
  await click(byData(renderer, "data-wearer-chip", "w-ada")[0]);
  assert.equal(byData(renderer, "data-ai-try-on-model", "male-plus")[0].props["aria-checked"], true, "Ada's model is kept");
  await choosePhoto(renderer);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 0, "a photo replaces the model");
  assert.equal(hasConsent(renderer), true);
  await click(generateButton(renderer));
  assert.equal(requests[0].defaultModelId, undefined);
  assert.ok(requests[0].personImage, "photo flow unchanged");
  assert.deepEqual(requests[0].fitHints, [{ id: "total_height", valueCm: 170 }], "photo flow still sends fit hints");
  assert.equal(byData(renderer, "data-ai-try-on-shown-on-model").length, 0, "no model line on a photo preview");
  // "Use a photo instead" clears the wearer's model choice.
  await click(byData(renderer, "data-ai-try-on-model-option")[0]);
  await click(byData(renderer, "data-ai-try-on-model", "male-1-light")[0]);
  await click(byData(renderer, "data-ai-try-on-model-close")[0]);
  assert.equal(generateButton(renderer).props.disabled, true);
  assert.equal(hasConsent(renderer), true);
}

{
  // Restored model preview after reload shows the model line; delete clears it.
  const STORED = "tryon-11111111-2222-4333-8444-555555555555";
  const deleted: string[] = [];
  const { renderer } = renderPanel({
    storedPreviews: [{ previewId: STORED, wearerKey: "w-ada", inputFingerprint: FINGERPRINT, expiresAt: "2026-12-01T00:00:00.000Z", modelId: "female-plus" }],
    loadStoredPreview: async () => ({ mimeType: "image/webp", data: "UklGRg==" }),
    deleteStoredPreview: async (id) => { deleted.push(id); return true; },
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(byData(renderer, "data-ai-try-on-shown-on-model").length, 1);
  assert.equal(byData(renderer, "data-ai-try-on-model", "female-plus")[0].props["aria-checked"], true, "model choice restored");
  assert.equal(hasConsent(renderer), false);
  await click(byData(renderer, "data-ai-try-on-delete")[0]);
  assert.deepEqual(deleted, [STORED]);
  assert.equal(byData(renderer, "data-ai-try-on-result").length, 0);
  assert.equal(hasConsent(renderer), true, "delete clears the wearer's model choice");
}

{
  // Approved step subtitle (live) and approved model-mode copy.
  const live = renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow: { schemaVersion: 1, status: "ready", inputFingerprint: FINGERPRINT },
      skipAllowed: true,
      onBack: () => undefined,
      onRetry: () => undefined,
      onSkip: () => undefined,
      onContinue: () => undefined,
      livePanel: createElement("div"),
    }),
  );
  assert.ok(live.includes("Upload a photo or pick a model to preview your selected garments, fabrics, and visual details on you."));
  assert.deepEqual(AI_TRY_ON_MODEL_COPY, {
    option: "No photo? Try it on a model",
    heading: "Choose a model",
    intro: "See the design on one of our AI-generated models instead of a photo of you.",
    filterAll: "All",
    shownOnModel: "Shown on one of our AI-generated models, not on you, so the fit won't match your measurements.",
    usePhotoInstead: "Use a photo instead",
  });
}

{
  // Consent text itself is untouched; the privacy policy explains model mode (draft).
  assert.match(AI_TRY_ON_CONSENT_NOTICE, /^By uploading a photo, you agree/);
  const section = PRIVACY_POLICY.sections.find((entry) => entry.id === "privacy-ai-try-on")!;
  assert.match(section.paragraphs!.at(-1)!, /^If you choose to try a design on one of our models instead, no photo of you is used\./);
  assert.match(section.paragraphs!.at(-1)!, /90 days after it was last shown/);
}

console.log("AI Try-on default models: all checks passed");
