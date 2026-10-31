/**
 * Step 3 AI Try-on gateway: server route, limits, Gemini call shape, prompt
 * modes, Tier-1 fit hints, fingerprint folding, and the browser gateway.
 * Gemini is always mocked here. No network call and no real key.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import designStudioHandler from "./api/design-studio/transfer-uploaded-design-draft.js";
import {
  AI_TRY_ON_FIT_HINT_MAX_FIELDS,
  buildAiTryOnFitHints,
  normalizeAiTryOnFitHints,
} from "./src/utils/aiTryOnFitHints";
import {
  AI_TRY_ON_GLOBAL_GENERATION_CAP,
  AI_TRY_ON_TRIES_PER_ORDER,
} from "./src/utils/aiTryOnGatewayContract";
import { buildAiTryOnPrompt } from "./src/server/aiTryOnPrompt";
import {
  AI_TRY_ON_GEMINI_MODEL,
  readGeminiApiKey,
  runAiTryOnGemini,
  type AiTryOnGeminiRequest,
  type AiTryOnGeminiResponseLike,
} from "./src/server/aiTryOnGemini";
import {
  handleAiTryOn,
  isAiTryOnEnabled,
  isAiTryOnRequest,
  type AiTryOnHttpDependencies,
} from "./src/server/aiTryOnHttp";
import {
  AI_TRY_ON_IP_RATE_LIMIT,
  createAiTryOnUsageLimits,
} from "./src/server/aiTryOnUsageLimits";
import { consumeAuthRateLimit } from "./src/server/authRateLimit";
import {
  AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT,
  createAiTryOnVisualInputFingerprint,
  createEmptyAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
} from "./src/utils/aiTryOnWorkflow";
import {
  createHttpAiTryOnGateway,
  mapAiTryOnHttpResult,
  runAiTryOnGeneration,
} from "./src/services/aiTryOnGateway";
import { DESIGN_STUDIO_STAGE_IDS } from "./src/utils/designSourceJourney";
import type { FutureMeasurementStateV1, GarmentTypeStepSelection } from "./src/types";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";
import type { Firestore } from "firebase-admin/firestore";

const FAKE_KEY = "AIzaTESTONLY_not_a_real_key_0123456789abcdef";

// ---------------------------------------------------------------- fakes

type Doc = Record<string, unknown>;
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  reads = 0;
  private lock: Promise<unknown> = Promise.resolve();
  collection(name: string) {
    return {
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return { path, get: async () => this.snapshot(path) };
      },
    };
  }
  snapshot(path: string) {
    this.reads += 1;
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const tx = {
      get: async (ref: { path: string }) => this.snapshot(ref.path),
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

const response = () => {
  const state: { status: number; headers: Record<string, string>; body: unknown } = {
    status: 200,
    headers: {},
    body: undefined,
  };
  const res: HttpResponse = {
    status(code) {
      state.status = code;
      return res;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
      return res;
    },
    json(body) {
      state.body = body;
      return body;
    },
  };
  return { res, state };
};

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 7),
]).toString("base64");
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 3)]).toString(
  "base64",
);
const FINGERPRINT = "tryon-v1-0123456789abcdef";

const validBody = (overrides: Record<string, unknown> = {}) => ({
  mode: "garment",
  orderKey: "draft-abc12345",
  inputFingerprint: FINGERPRINT,
  personImage: { mimeType: "image/jpeg", data: jpeg },
  garmentImage: { mimeType: "image/png", data: png },
  fitHints: [
    { id: "total_height", valueCm: 178 },
    { id: "sleeve_length_long", valueCm: 63.2 },
  ],
  ...overrides,
});

const post = (body: unknown, ip = "203.0.113.7"): HttpRequest & { query?: unknown } => ({
  method: "POST",
  headers: { "x-forwarded-for": ip },
  body,
  query: { route: "ai-try-on" },
});

const imageResponse: AiTryOnGeminiResponseLike = {
  candidates: [
    {
      finishReason: "STOP",
      content: { parts: [{ text: "ok" }, { inlineData: { mimeType: "image/png", data: "R0VO" } }] },
    },
  ],
};

const harness = ({
  geminiResponse = imageResponse,
  geminiError,
  environment = { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: FAKE_KEY },
  db = new FakeFirestore(),
  globalCap,
}: {
  geminiResponse?: AiTryOnGeminiResponseLike;
  geminiError?: unknown;
  environment?: Record<string, string | undefined>;
  db?: FakeFirestore;
  globalCap?: number;
} = {}) => {
  const calls: AiTryOnGeminiRequest[] = [];
  const keysSeen: string[] = [];
  const logs: string[] = [];
  const deps: AiTryOnHttpDependencies = {
    environment,
    getDb: () => db.asFirestore(),
    createUsageLimits: (database) => createAiTryOnUsageLimits(database, { globalCap }),
    createGenerateContent: (apiKey) => {
      keysSeen.push(apiKey);
      return async (request) => {
        calls.push(request);
        if (geminiError) throw geminiError;
        return geminiResponse;
      };
    },
    createAssetId: () => "tryon-asset-1",
    log: (line) => logs.push(line),
  };
  return { deps, calls, keysSeen, logs, db };
};

// ---------------------------------------------------------------- fit hints

const value = (valueCm: number, provenance = "customer_entered") => ({ valueCm, provenance }) as never;
const measurement = (overrides: Partial<FutureMeasurementStateV1> = {}): FutureMeasurementStateV1 =>
  ({
    schemaVersion: 1,
    route: "low_risk",
    unit: "cm",
    entered: {
      shared: { total_height: value(178.2), chest_bust_circumference: value(101) },
      byGarmentKey: { "base:shirt": { sleeve_length_long: value(63.2), shirt_length_standard: value(80) } },
    },
    derived: {
      shared: { total_height: value(150, "system_derived"), shoulder_length: value(46.1, "system_derived") },
      byGarmentKey: {},
    },
    blueprintVersion: "x",
    formulaVersion: null,
    inputFingerprint: "m",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
    ...overrides,
  }) as FutureMeasurementStateV1;

assert.deepEqual(buildAiTryOnFitHints({ measurement: null }), [], "no measurement → no hints");
assert.deepEqual(
  buildAiTryOnFitHints({ measurement: measurement({ route: null }) }),
  [],
  "no method selected → no hints",
);
assert.deepEqual(
  buildAiTryOnFitHints({ measurement: measurement({ calculationStatus: "invalid" }) }),
  [],
);
assert.deepEqual(buildAiTryOnFitHints({ measurement: measurement(), garmentKeys: ["base:shirt"] }), [
  { id: "total_height", valueCm: 178 },
  { id: "shoulder_length", valueCm: 46 },
  { id: "chest_bust_circumference", valueCm: 101 },
  { id: "shirt_length_standard", valueCm: 80 },
  { id: "sleeve_length_long", valueCm: 63 },
], "entered beats derived, derived fills gaps, nothing invented (no belly, no dress)");
assert.deepEqual(
  buildAiTryOnFitHints({
    measurement: measurement({ invalidInputKeys: ["chest_bust_circumference"] }),
  }).map((hint) => hint.id),
  ["total_height", "shoulder_length", "shirt_length_standard", "sleeve_length_long"],
  "invalid inputs are skipped",
);
assert.equal(
  buildAiTryOnFitHints({ measurement: measurement({ route: "sample_cloth" }) }).some(
    (hint) => hint.id === "chest_bust_circumference",
  ),
  false,
  "sample-cloth laid-flat widths are not body circumferences",
);
const implausible = measurement();
implausible.entered.shared.total_height = value(9999);
implausible.derived.shared.total_height = value(9999);
assert.equal(
  buildAiTryOnFitHints({ measurement: implausible }).some((hint) => hint.id === "total_height"),
  false,
  "implausible values are dropped, never clamped",
);
const full = measurement();
Object.assign(full.entered.shared, {
  belly_circumference: value(90),
  shoulder_length: value(45),
});
Object.assign(full.entered.byGarmentKey["base:shirt"], {
  dress_length_long: value(120),
});
const fullHints = buildAiTryOnFitHints({ measurement: full });
assert.ok(fullHints.length <= AI_TRY_ON_FIT_HINT_MAX_FIELDS);
assert.equal(AI_TRY_ON_FIT_HINT_MAX_FIELDS, 8);
assert.deepEqual(normalizeAiTryOnFitHints(undefined), []);
assert.equal(normalizeAiTryOnFitHints([{ id: "neck_circumference", valueCm: 40 }]), null);
assert.equal(normalizeAiTryOnFitHints([{ id: "total_height", valueCm: 5 }]), null);
assert.equal(
  normalizeAiTryOnFitHints([
    { id: "total_height", valueCm: 170 },
    { id: "total_height", valueCm: 171 },
  ]),
  null,
);
assert.equal(normalizeAiTryOnFitHints("178"), null);

// ---------------------------------------------------------------- prompts

const garmentPrompt = buildAiTryOnPrompt({ mode: "garment" });
const fabricPrompt = buildAiTryOnPrompt({ mode: "fabric" });
assert.match(garmentPrompt, /second image is the garment design/);
assert.equal(/swatch|third image/i.test(garmentPrompt), false, "garment mode never mentions a swatch");
assert.match(fabricPrompt, /third image is a fabric swatch/);
assert.notEqual(garmentPrompt, fabricPrompt);
assert.equal(/Fit guidance/.test(garmentPrompt), false, "no hints → no fit block");
const hintedPrompt = buildAiTryOnPrompt({
  mode: "garment",
  fitHints: [
    { id: "total_height", valueCm: 178 },
    { id: "sleeve_length_long", valueCm: 63 },
  ],
});
assert.match(hintedPrompt, /Fit guidance/);
assert.match(hintedPrompt, /- Height: 178 cm/);
assert.match(hintedPrompt, /- Long sleeve length: 63 cm/);
assert.match(hintedPrompt, /Never write these numbers or any text on the image/);
assert.match(garmentPrompt, /Do not add text, numbers, measurements/);

// ---------------------------------------------------------------- fingerprint

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: {
      status: "resolved",
      garmentType: "shirt",
      components: [
        {
          componentKey: "shirt:shirt_construction:shirt_standard_short",
          optionId: "shirt_standard_short",
          selectionGroup: "shirt_construction",
          priceCents: 6500,
          price: 65,
        },
      ],
      totalPriceCents: 6500,
      totalPrice: 65,
    },
  },
};
const baseInput = { garmentTypeSelection: selection, fabricAllocations: [], selectedStyleId: "style-1" };
const noHints = createAiTryOnVisualInputFingerprint(baseInput);
assert.equal(
  createAiTryOnVisualInputFingerprint({ ...baseInput, measurementFitHints: [] }),
  noHints,
  "empty hints keep the existing fingerprint (degrades cleanly)",
);
const withHints = createAiTryOnVisualInputFingerprint({
  ...baseInput,
  measurementFitHints: [
    { id: "total_height", valueCm: 178 },
    { id: "sleeve_length_long", valueCm: 63 },
  ],
});
assert.notEqual(withHints, noHints, "hints are folded into the fingerprint");
assert.equal(
  createAiTryOnVisualInputFingerprint({
    ...baseInput,
    measurementFitHints: [
      { id: "sleeve_length_long", valueCm: 63 },
      { id: "total_height", valueCm: 178 },
    ],
  }),
  withHints,
  "hint order does not matter",
);
assert.equal(
  AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT,
  DESIGN_STUDIO_STAGE_IDS.indexOf("measurement") < DESIGN_STUDIO_STAGE_IDS.indexOf("try_on"),
  "hints join the fingerprint only when Measurement precedes Try-on (false on main, true after #1181)",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(studioSource, /AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT\s*\?\s*\{ measurementFitHints: futureAiTryOnFitHints \}/);

// ---------------------------------------------------------------- Gemini call

{
  const sent: AiTryOnGeminiRequest[] = [];
  const outcome = await runAiTryOnGemini({
    generateContent: async (request) => {
      sent.push(request);
      return imageResponse;
    },
    prompt: "p",
    images: [
      { mimeType: "image/jpeg", data: "AAAA" },
      { mimeType: "image/png", data: "BBBB" },
    ],
  });
  assert.equal(outcome.ok, true);
  assert.equal(sent[0].model, "gemini-2.5-flash-image");
  assert.equal(AI_TRY_ON_GEMINI_MODEL, "gemini-2.5-flash-image");
  assert.deepEqual(sent[0].config.responseModalities, ["TEXT", "IMAGE"]);
  assert.deepEqual(
    sent[0].contents[0].parts.map((part) => ("text" in part ? "text" : part.inlineData.data)),
    ["text", "AAAA", "BBBB"],
  );
  const noImage = await runAiTryOnGemini({
    generateContent: async () => ({ candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: "no" }] } }] }),
    prompt: "p",
    images: [],
  });
  assert.deepEqual(noImage.ok === false && [noImage.kind, noImage.retryable], ["rejected", true]);
  const blocked = await runAiTryOnGemini({
    generateContent: async () => ({ promptFeedback: { blockReason: "SAFETY" } }),
    prompt: "p",
    images: [],
  });
  assert.equal(blocked.ok === false && blocked.retryable, false);
  const thrown = await runAiTryOnGemini({
    generateContent: async () => {
      throw Object.assign(new Error(`bad request key=${FAKE_KEY}`), { status: 400 });
    },
    prompt: "p",
    images: [],
    secret: FAKE_KEY,
  });
  assert.equal(thrown.ok, false);
  assert.equal(JSON.stringify(thrown).includes(FAKE_KEY), false, "key never appears in errors");
  assert.equal(thrown.ok === false && thrown.retryable, false);
  const timedOut = await runAiTryOnGemini({
    generateContent: (request) =>
      new Promise((_, reject) =>
        request.config.abortSignal?.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
    prompt: "p",
    images: [],
    timeoutMs: 5,
  });
  assert.deepEqual(timedOut.ok === false && [timedOut.reason, timedOut.retryable], ["timeout", true]);
}

assert.equal(readGeminiApiKey({}), null);
assert.equal(readGeminiApiKey({ GEMINI_API_KEY: "MY_GEMINI_API_KEY" }), null);
assert.equal(isAiTryOnEnabled({ GEMINI_API_KEY: FAKE_KEY }), false, "key alone does not switch it on");
assert.equal(isAiTryOnEnabled({ AI_TRY_ON_ENABLED: "true" }), false, "flag alone does not switch it on");
assert.equal(isAiTryOnEnabled({ AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: FAKE_KEY }), true);

// ---------------------------------------------------------------- HTTP: disabled

for (const environment of [{}, { GEMINI_API_KEY: FAKE_KEY }, { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "MY_GEMINI_API_KEY" }]) {
  const h = harness({ environment });
  const get = response();
  await handleAiTryOn({ method: "GET", headers: {} }, get.res, h.deps);
  assert.deepEqual(get.state.body, { status: "unavailable", code: "NOT_CONFIGURED" });
  const generation = response();
  await handleAiTryOn(post(validBody()), generation.res, h.deps);
  assert.equal(generation.state.status, 503);
  assert.equal((generation.state.body as { code: string }).code, "NOT_CONFIGURED");
  assert.equal(h.calls.length, 0, "Gemini is never called while unavailable");
  assert.equal(h.db.reads, 0, "Firestore is never touched while unavailable");
}

// ---------------------------------------------------------------- HTTP: enabled

{
  const h = harness();
  const get = response();
  await handleAiTryOn({ method: "GET", headers: {} }, get.res, h.deps);
  assert.deepEqual(get.state.body, { status: "available", triesPerOrder: 5 });

  const ok = response();
  await handleAiTryOn(post(validBody()), ok.res, h.deps);
  assert.equal(ok.state.status, 200);
  assert.equal(ok.state.headers["cache-control"], "no-store");
  const body = ok.state.body as Record<string, any>;
  assert.equal(body.status, "completed");
  assert.equal(body.inputFingerprint, FINGERPRINT);
  assert.equal(body.resultReference.kind, "verified_private_try_on_result");
  assert.match(body.resultReference.ownerBindingId, /^order-[0-9a-f]{32}$/);
  assert.equal(body.resultReference.ownerBindingId.includes("draft-abc12345"), false);
  assert.deepEqual(body.image, { mimeType: "image/png", data: "R0VO" });
  assert.equal(body.orderTriesRemaining, AI_TRY_ON_TRIES_PER_ORDER - 1);
  assert.deepEqual(h.keysSeen, [FAKE_KEY], "key is read server-side and passed only to the client factory");
  assert.equal(JSON.stringify(ok.state).includes(FAKE_KEY), false, "key never in the response");
  assert.equal(h.logs.join("\n").includes(FAKE_KEY), false, "key never logged");
  assert.equal(h.logs.join("\n").includes(jpeg), false, "photos never logged");
  assert.equal(h.calls[0].model, "gemini-2.5-flash-image");
  const promptText = (h.calls[0].contents[0].parts[0] as { text: string }).text;
  assert.match(promptText, /- Height: 178 cm/);
  assert.match(promptText, /- Long sleeve length: 63 cm/, "server re-rounds hint values");
  assert.equal(h.calls[0].contents[0].parts.length, 3, "garment mode: prompt + person + garment");
  assert.equal(h.db.docs.get("aiTryOnUsage/global")?.count, 1);
  const orderDocs = [...h.db.docs.keys()].filter((key) => key.startsWith("aiTryOnUsage/order-"));
  assert.equal(orderDocs.length, 1);
  assert.equal([...h.db.docs.keys()].some((key) => key.includes("draft-abc12345")), false);
  assert.equal([...h.db.docs.keys()].some((key) => key.includes("203.0.113.7")), false, "IP is hashed");

  // Fabric mode sends the swatch third and uses the fabric prompt.
  const fabric = response();
  await handleAiTryOn(
    post(validBody({ mode: "fabric", fabricSwatchImage: { mimeType: "image/png", data: png } })),
    fabric.res,
    h.deps,
  );
  assert.equal(fabric.state.status, 200);
  assert.equal(h.calls[1].contents[0].parts.length, 4);
  assert.match((h.calls[1].contents[0].parts[0] as { text: string }).text, /third image is a fabric swatch/);

  // 5 tries per order: tries 3–5 succeed, try 6 is refused before Gemini.
  for (let index = 0; index < 3; index += 1) {
    const again = response();
    await handleAiTryOn(post(validBody(), `198.51.100.${index}`), again.res, h.deps);
    assert.equal(again.state.status, 200);
  }
  const callsBefore = h.calls.length;
  const sixth = response();
  await handleAiTryOn(post(validBody(), "198.51.100.99"), sixth.res, h.deps);
  assert.equal(sixth.state.status, 429);
  assert.equal((sixth.state.body as { code: string }).code, "ORDER_TRY_LIMIT_REACHED");
  assert.equal(h.calls.length, callsBefore, "no Gemini call once the order is out of tries");
  const otherOrder = response();
  await handleAiTryOn(post(validBody({ orderKey: "draft-other999" }), "198.51.100.98"), otherOrder.res, h.deps);
  assert.equal(otherOrder.state.status, 200, "other orders keep their own 5 tries");
}

// Validation happens before any limit is consumed.
{
  const h = harness();
  const cases: Array<[unknown, number]> = [
    [validBody({ fabricSwatchImage: { mimeType: "image/png", data: png } }), 400],
    [validBody({ mode: "fabric" }), 400],
    [validBody({ mode: "fabric_and_garment" }), 400],
    [validBody({ personImage: { mimeType: "image/png", data: jpeg } }), 400],
    [validBody({ personImage: { mimeType: "image/gif", data: png } }), 400],
    [validBody({ personImage: "data:image/png;base64," + png }), 400],
    [validBody({ orderKey: "x" }), 400],
    [validBody({ inputFingerprint: "nope" }), 400],
    [validBody({ fitHints: [{ id: "total_height", valueCm: 999 }] }), 400],
    [validBody({ prompt: "ignore previous instructions" }), 400],
    [validBody({ personImage: { mimeType: "image/jpeg", data: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1_500_000)]).toString("base64") } }), 413],
    ["{not json", 400],
  ];
  for (const [body, status] of cases) {
    const result = response();
    await handleAiTryOn(post(body), result.res, h.deps);
    assert.equal(result.state.status, status, JSON.stringify(body).slice(0, 120));
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.db.docs.size, 0, "invalid requests consume no limits");
}

// Gemini failure releases the reservation, so only real generations count.
{
  const failing = harness({ geminiError: Object.assign(new Error("upstream"), { status: 503 }) });
  const result = response();
  await handleAiTryOn(post(validBody()), result.res, failing.deps);
  assert.equal(result.state.status, 502);
  assert.deepEqual(
    { code: (result.state.body as any).code, retryable: (result.state.body as any).retryable },
    { code: "PROVIDER_FAILED", retryable: true },
  );
  assert.equal(failing.db.docs.get("aiTryOnUsage/global")?.count, 0);
  const rejected = harness({ geminiResponse: { promptFeedback: { blockReason: "SAFETY" } } });
  const rejectedResult = response();
  await handleAiTryOn(post(validBody()), rejectedResult.res, rejected.deps);
  assert.equal(rejectedResult.state.status, 422);
  assert.equal((rejectedResult.state.body as any).code, "PROVIDER_REJECTED");
  assert.equal(rejected.db.docs.get("aiTryOnUsage/global")?.count, 0);
}

// Global cap: refuses once reached, GET reports unavailable, concurrency safe.
{
  const db = new FakeFirestore();
  db.docs.set("aiTryOnUsage/global", { count: AI_TRY_ON_GLOBAL_GENERATION_CAP });
  const h = harness({ db });
  const get = response();
  await handleAiTryOn({ method: "GET", headers: {} }, get.res, h.deps);
  assert.deepEqual(get.state.body, { status: "unavailable", code: "GLOBAL_LIMIT_REACHED" });
  const capped = response();
  await handleAiTryOn(post(validBody()), capped.res, h.deps);
  assert.equal(capped.state.status, 503);
  assert.equal((capped.state.body as any).code, "GLOBAL_LIMIT_REACHED");
  assert.equal(h.calls.length, 0);

  const raceDb = new FakeFirestore();
  const limits = createAiTryOnUsageLimits(raceDb.asFirestore(), { globalCap: 3 });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) => limits.reserve(`draft-race-${index}xx`)),
  );
  assert.equal(results.filter((result) => result.ok).length, 3, "parallel requests never overshoot the cap");
  assert.equal(raceDb.docs.get("aiTryOnUsage/global")?.count, 3);
  assert.equal(AI_TRY_ON_GLOBAL_GENERATION_CAP, 1000);
  assert.equal(AI_TRY_ON_TRIES_PER_ORDER, 5);
}

// Per-IP window (real consumeAuthRateLimit on the fake store).
{
  const db = new FakeFirestore();
  const h = harness({ db });
  h.deps.consumeIpRateLimit = (database, ip) =>
    consumeAuthRateLimit(database, AI_TRY_ON_IP_RATE_LIMIT, ip, () => 1_000);
  let lastStatus = 0;
  for (let index = 0; index < AI_TRY_ON_IP_RATE_LIMIT.limit + 1; index += 1) {
    const result = response();
    await handleAiTryOn(post(validBody({ orderKey: `draft-ip-${index}xxxx` }), "192.0.2.1"), result.res, h.deps);
    lastStatus = result.state.status;
    if (index < AI_TRY_ON_IP_RATE_LIMIT.limit) assert.equal(result.state.status, 200);
  }
  assert.equal(lastStatus, 429);
  assert.equal(h.calls.length, AI_TRY_ON_IP_RATE_LIMIT.limit);
}

// Method guard.
{
  const result = response();
  await handleAiTryOn({ method: "DELETE", headers: {} }, result.res, harness().deps);
  assert.equal(result.state.status, 405);
}

// ---------------------------------------------------------------- multiplex

assert.equal(isAiTryOnRequest({ method: "GET", headers: {}, query: { route: "ai-try-on" } } as never), true);
assert.equal(isAiTryOnRequest({ method: "GET", headers: {}, url: "/api/ai-try-on" } as never), true);
assert.equal(isAiTryOnRequest({ method: "POST", headers: {}, url: "/api/design-studio/transfer-uploaded-design-draft" } as never), false);
{
  const previous = { enabled: process.env.AI_TRY_ON_ENABLED, key: process.env.GEMINI_API_KEY };
  delete process.env.AI_TRY_ON_ENABLED;
  try {
    const result = response();
    await designStudioHandler(
      { method: "GET", headers: {}, query: { route: "ai-try-on" } } as never,
      result.res,
    );
    assert.deepEqual(result.state.body, { status: "unavailable", code: "NOT_CONFIGURED" });
  } finally {
    if (previous.enabled === undefined) delete process.env.AI_TRY_ON_ENABLED;
    else process.env.AI_TRY_ON_ENABLED = previous.enabled;
  }
}
const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
assert.ok(
  vercel.rewrites.some(
    (rewrite: { source: string; destination: string }) =>
      rewrite.source === "/api/ai-try-on" &&
      rewrite.destination === "/api/design-studio/transfer-uploaded-design-draft?route=ai-try-on",
  ),
);
assert.equal(vercel.functions["api/design-studio/transfer-uploaded-design-draft.ts"].maxDuration, 60);

// The browser bundle never reads the key.
for (const path of ["src/services/aiTryOnGateway.ts", "src/utils/aiTryOnGatewayContract.ts", "src/utils/aiTryOnFitHints.ts", "src/utils/aiTryOnWorkflow.ts"]) {
  const source = readFileSync(path, "utf8");
  assert.equal(/GEMINI_API_KEY|import\.meta\.env|@google\/genai/.test(source), false, path);
}
assert.equal(
  readFileSync("src/server/aiTryOnGemini.ts", "utf8").includes("gemini-2.0-flash-preview-image-generation\""),
  false,
  "the dead 2.0 preview model is never used",
);

// ---------------------------------------------------------------- browser gateway

assert.deepEqual(mapAiTryOnHttpResult(503, { code: "NOT_CONFIGURED" }), { status: "unavailable", code: "not_configured" });
assert.deepEqual(mapAiTryOnHttpResult(429, { code: "ORDER_TRY_LIMIT_REACHED", retryable: false }), {
  status: "failed",
  code: "provider_rejected",
  retryable: false,
});
assert.deepEqual(mapAiTryOnHttpResult(429, { code: "RATE_LIMITED", retryable: true }), {
  status: "failed",
  code: "provider_unavailable",
  retryable: true,
});
assert.deepEqual(mapAiTryOnHttpResult(500, "garbage"), { status: "failed", code: "processing_failed", retryable: false });

{
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const gateway = createHttpAiTryOnGateway({
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (init?.method === "GET") return new Response(JSON.stringify({ status: "available", triesPerOrder: 5 }));
      return new Response(
        JSON.stringify({
          status: "completed",
          inputFingerprint: FINGERPRINT,
          resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-a1", ownerBindingId: "order-b1" },
          image: { mimeType: "image/png", data: "R0VO" },
          orderTriesRemaining: 4,
        }),
      );
    },
  });
  assert.deepEqual(await gateway.getAvailability(), { status: "available" });
  assert.equal(requests[0].url, "/api/ai-try-on");
  const offline = createHttpAiTryOnGateway({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.deepEqual(await offline.getAvailability(), { status: "unavailable", code: "not_configured" });

  const ready = reconcileAiTryOnWorkflow({
    state: createEmptyAiTryOnWorkflowState(),
    currentInputFingerprint: FINGERPRINT,
    policy: { gatewayAvailable: true, skipAllowed: true },
  });
  assert.equal(ready.status, "ready");
  const processingStates: string[] = [];
  const run = await runAiTryOnGeneration({
    gateway,
    state: ready,
    request: validBody() as never,
    skipAllowed: true,
    onProcessing: (state) => processingStates.push(state.status),
    createJobReferenceId: () => "job-1",
  });
  assert.deepEqual(processingStates, ["processing"]);
  assert.equal(run.state.status, "completed");
  assert.equal(run.state.inputFingerprint, FINGERPRINT);
  assert.deepEqual(run.preview, { mimeType: "image/png", data: "R0VO" });
  assert.equal(run.orderTriesRemaining, 4);
  assert.equal(JSON.stringify(run.state).includes("R0VO"), false, "preview bytes never enter workflow state");
  const sent = JSON.parse(String(requests[1].init?.body));
  assert.equal(sent.inputFingerprint, FINGERPRINT);

  const mismatch = await runAiTryOnGeneration({
    gateway,
    state: ready,
    request: validBody({ inputFingerprint: "tryon-v1-ffffffffffffffff" }) as never,
    skipAllowed: true,
  });
  assert.equal(mismatch.state, ready, "a request for another fingerprint never starts");

  const unavailableGateway = createHttpAiTryOnGateway({
    fetchImpl: async () => new Response(JSON.stringify({ code: "NOT_CONFIGURED", retryable: false }), { status: 503 }),
  });
  const unavailableRun = await runAiTryOnGeneration({
    gateway: unavailableGateway,
    state: ready,
    request: validBody() as never,
    skipAllowed: true,
  });
  assert.deepEqual(unavailableRun.state.failure, { code: "provider_unavailable", retryable: false });

  const flaky = createHttpAiTryOnGateway({ fetchImpl: async () => { throw new Error("network"); } });
  const flakyRun = await runAiTryOnGeneration({ gateway: flaky, state: ready, request: validBody() as never, skipAllowed: true });
  assert.deepEqual(flakyRun.state.failure, { code: "interrupted", retryable: true });
}

console.log("PASS: AI Try-on Step 3 gateway (route, limits, Gemini shape, prompt modes, fit hints, fingerprint, browser gateway)");
