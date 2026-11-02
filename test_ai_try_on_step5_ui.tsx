/**
 * Step 5 AI Try-on UI: wearer targets, availability and preview mapping,
 * client photo checks, order key, order-level completion, the photo panel
 * (consent notice, How we use, tips, picker, Generate, errors, result) and
 * the server's 90-day order counters. Gemini and fetch are always mocked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  AI_TRY_ON_CONSENT_NOTICE,
  AI_TRY_ON_HOW_WE_USE_BULLETS,
  AI_TRY_ON_MESSAGES,
  AI_TRY_ON_PHOTO_TIPS,
  AI_TRY_ON_PREVIEW_DISCLAIMER,
  AiTryOnPhotoPanel,
  type AiTryOnPhotoPanelProps,
} from "./src/components/AiTryOnPhotoPanel";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import {
  fetchAiTryOnAvailability,
  mapAiTryOnPreviewResponse,
  type AiTryOnPreviewOutcome,
} from "./src/services/aiTryOnGateway";
import {
  AI_TRY_ON_PHOTO_ACCEPT,
  AI_TRY_ON_PHOTO_SIZE_ERROR,
  AI_TRY_ON_PHOTO_TYPE_ERROR,
  fitAiTryOnImage,
  prepareAiTryOnPersonPhoto,
  validateAiTryOnPhotoFile,
  type AiTryOnImageEncoder,
} from "./src/utils/aiTryOnPhoto";
import {
  AI_TRY_ON_SINGLE_TARGET_ID,
  buildAiTryOnWearerTargets,
  type AiTryOnWearerTarget,
  type BuildAiTryOnWearerTargetsInput,
} from "./src/utils/aiTryOnWearerTargets";
import {
  normalizeAiTryOnWorkflowState,
  recordAiTryOnPreviewCompletion,
} from "./src/utils/aiTryOnWorkflow";
import { isFutureMeasurementStageUnlocked } from "./src/utils/measurementBlueprint";
import { createEmptyFutureMeasurementState } from "./src/utils/measurementBlueprint";
import {
  AI_TRY_ON_ORDER_USAGE_RETENTION_MS,
  createAiTryOnUsageLimits,
} from "./src/server/aiTryOnUsageLimits";
import { handleAiTryOn } from "./src/server/aiTryOnHttp";
import { PRIVACY_POLICY } from "./src/data/legalContent";
import type {
  AiTryOnWorkflowStateV1,
  Fabric,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "./src/types";
import type { Firestore } from "firebase-admin/firestore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ------------------------------------------------------------ fixtures

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {},
} as unknown as GarmentTypeStepSelection;

const assignment = (garmentKey: string, styleId: string) => ({
  garmentKey,
  sourceKind: "catalog",
  sourceKey: `catalog:${styleId}`,
  catalogStyleId: styleId,
});

const fabrics = [
  { code: "F-RED", name: "Red", color: "Red", category: "Lace", image: "https://example.test/red.jpg" },
  { code: "F-PLAIN", name: "Plain", color: "Blue", category: "Lace" },
] as unknown as Fabric[];

const baseInput = (
  overrides: Partial<BuildAiTryOnWearerTargetsInput> = {},
): BuildAiTryOnWearerTargetsInput => ({
  occurrences: [
    {
      garmentKey: "shirt:1",
      garmentType: "shirt",
      assignment: assignment("shirt:1", "style-a"),
      assignmentImage: "https://example.test/style-a.jpg",
    },
    {
      garmentKey: "trouser:1",
      garmentType: "trouser",
      assignment: assignment("trouser:1", "style-b"),
      assignmentImage: "https://example.test/style-b.jpg",
    },
  ],
  wearerOrder: null,
  measurement: null,
  customDetailsReady: true,
  designSourceReady: true,
  garmentTypeSelection,
  fabricAllocations: [
    {
      allocationId: "a1",
      fabricCode: "F-RED",
      garmentAssignments: [{ garmentKey: "shirt:1", code: "S", garmentType: "shirt", fabricUnits: 1 }],
    },
    {
      allocationId: "a2",
      fabricCode: "F-PLAIN",
      garmentAssignments: [{ garmentKey: "trouser:1", code: "T", garmentType: "trouser", fabricUnits: 1 }],
    },
  ] as never,
  fabrics,
  ...overrides,
});

const twoWearers: WearerOrderStateV2 = {
  schemaVersion: 2,
  wearers: [
    { wearerId: "w-ada", displayName: "Ada", fitContext: "female", presentationOrder: 0, measurement: createEmptyFutureMeasurementState() },
    { wearerId: "w-obi", displayName: "", fitContext: "male", presentationOrder: 1, measurement: createEmptyFutureMeasurementState() },
  ],
  assignmentByGarmentKey: { "shirt:1": "w-ada", "trouser:1": "w-obi" },
} as unknown as WearerOrderStateV2;

// ------------------------------------------------------------ wearer targets

{
  const [single] = buildAiTryOnWearerTargets(baseInput());
  assert.equal(single.wearerId, AI_TRY_ON_SINGLE_TARGET_ID);
  assert.equal(single.label, "You");
  assert.match(single.inputFingerprint || "", /^tryon-v1-[0-9a-f]{16}$/);
  assert.equal(single.mode, "fabric", "the pictured garment has a swatch picture → fabric mode");
  assert.equal(single.garmentImageUrl, "https://example.test/style-a.jpg");
  assert.equal(single.fabricSwatchImageUrl, "https://example.test/red.jpg");
  assert.equal(single.orderDetails?.garments.length, 2);
  assert.equal(single.orderDetails?.fabric?.colour, "Red");

  const targets = buildAiTryOnWearerTargets(baseInput({ wearerOrder: twoWearers }));
  assert.deepEqual(targets.map((target) => target.label), ["Ada", "Person 2"]);
  const [ada, obi] = targets;
  assert.equal(ada.mode, "fabric");
  assert.equal(obi.mode, "garment", "no swatch picture → garment mode");
  assert.equal(obi.fabricSwatchImageUrl, null);
  assert.equal(obi.garmentImageUrl, "https://example.test/style-b.jpg");
  assert.deepEqual(ada.orderDetails?.garments.map((garment) => garment.garmentType), ["shirt"]);
  assert.deepEqual(obi.orderDetails?.garments.map((garment) => garment.garmentType), ["trouser"]);
  assert.notEqual(ada.inputFingerprint, obi.inputFingerprint, "one fingerprint per wearer");

  // Changing Obi's design changes only Obi's fingerprint.
  const changed = buildAiTryOnWearerTargets(
    baseInput({
      wearerOrder: twoWearers,
      occurrences: [
        baseInput().occurrences[0],
        { ...baseInput().occurrences[1], assignment: assignment("trouser:1", "style-c") },
      ],
    }),
  );
  assert.equal(changed[0].inputFingerprint, ada.inputFingerprint);
  assert.notEqual(changed[1].inputFingerprint, obi.inputFingerprint);

  const uploaded = buildAiTryOnWearerTargets(
    baseInput({
      occurrences: baseInput().occurrences.map((occurrence) => ({ ...occurrence, assignmentImage: null })),
    }),
  );
  assert.equal(uploaded[0].garmentImageUrl, null, "no catalogue picture (uploaded design)");
  assert.equal(uploaded[0].mode, "garment");

  const notReady = buildAiTryOnWearerTargets(baseInput({ customDetailsReady: false }));
  assert.equal(notReady[0].inputFingerprint, null);
}

// ------------------------------------------------------------ order-level completion

{
  const reference = {
    kind: "verified_private_try_on_result" as const,
    assetId: "tryon-1",
    ownerBindingId: "order-abc",
  };
  const fingerprint = "tryon-v1-0123456789abcdef";
  for (const state of [
    { schemaVersion: 1, status: "ready", inputFingerprint: fingerprint },
    { schemaVersion: 1, status: "stale", inputFingerprint: "tryon-v1-ffffffffffffffff" },
    { schemaVersion: 1, status: "skipped", inputFingerprint: fingerprint },
    { schemaVersion: 1, status: "failed", inputFingerprint: fingerprint, failure: { code: "interrupted", retryable: false } },
  ] as AiTryOnWorkflowStateV1[]) {
    const next = recordAiTryOnPreviewCompletion({
      state,
      currentInputFingerprint: fingerprint,
      resultReference: reference,
      jobId: "preview-1",
    });
    assert.equal(next.status, "completed", state.status);
    assert.equal(next.inputFingerprint, fingerprint);
    assert.equal(isFutureMeasurementStageUnlocked(next), true);
    const roundTrip = normalizeAiTryOnWorkflowState(JSON.parse(JSON.stringify(next)));
    assert.deepEqual(roundTrip, next);
    assert.equal(JSON.stringify(next).includes("base64"), false, "no image in workflow state");
  }
  const unchanged = { schemaVersion: 1, status: "ready", inputFingerprint: fingerprint } as AiTryOnWorkflowStateV1;
  assert.equal(
    recordAiTryOnPreviewCompletion({
      state: unchanged,
      currentInputFingerprint: fingerprint,
      resultReference: { ...reference, assetId: "data:image/png;base64,AAAA" },
      jobId: "preview-1",
    }),
    unchanged,
    "an unsafe reference never completes the workflow",
  );
}

// ------------------------------------------------------------ availability + preview mapping

{
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ status: "available", triesPerOrder: 5, orderTriesRemaining: 3 }), { status: 200 });
  };
  const credentials = { sessionToken: null, getIdToken: async () => null };
  assert.deepEqual(await fetchAiTryOnAvailability({ credentials, fetchImpl }), {
    status: "available",
    triesPerOrder: 5,
    orderTriesRemaining: 3,
    storedPreviews: [],
    sessionToken: null,
  });
  assert.equal(calls[0], "/api/ai-try-on?action=session");
  assert.deepEqual(
    await fetchAiTryOnAvailability({
      credentials,
      fetchImpl: async () => new Response(JSON.stringify({ status: "unavailable", code: "NOT_CONFIGURED" })),
    }),
    { status: "unavailable" },
  );
  assert.deepEqual(
    await fetchAiTryOnAvailability({ credentials, fetchImpl: async () => new Response("<html>404</html>", { status: 404 }) }),
    { status: "unavailable" },
    "Vite dev server without the API reads as unavailable",
  );
  assert.deepEqual(
    await fetchAiTryOnAvailability({ credentials, fetchImpl: async () => { throw new Error("offline"); } }),
    { status: "unavailable" },
  );

  const ok = mapAiTryOnPreviewResponse(200, {
    status: "completed",
    resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "order-x" },
    image: { mimeType: "image/png", data: "iVBORw0KGgo=" },
    orderTriesRemaining: 2,
  });
  assert.equal(ok.kind, "completed");
  assert.deepEqual(mapAiTryOnPreviewResponse(429, { code: "ORDER_TRY_LIMIT_REACHED" }), { kind: "order_limit_reached" });
  assert.deepEqual(mapAiTryOnPreviewResponse(429, { code: "RATE_LIMITED", retryAfterSeconds: 30 }), { kind: "rate_limited", retryAfterSeconds: 30 });
  assert.deepEqual(mapAiTryOnPreviewResponse(422, { code: "PROVIDER_REJECTED", orderTriesRemaining: 4 }), { kind: "photo_blocked", orderTriesRemaining: 4 });
  assert.deepEqual(mapAiTryOnPreviewResponse(502, { code: "PROVIDER_FAILED", orderTriesRemaining: 4 }), { kind: "failed", orderTriesRemaining: 4 });
  assert.deepEqual(mapAiTryOnPreviewResponse(503, { code: "GLOBAL_LIMIT_REACHED" }), { kind: "unavailable" });
  assert.deepEqual(mapAiTryOnPreviewResponse(200, { status: "completed", image: { mimeType: "text/html", data: "x" } }), { kind: "failed", orderTriesRemaining: null });
}

// ------------------------------------------------------------ client photo checks

{
  assert.equal(AI_TRY_ON_PHOTO_ACCEPT, "image/jpeg,image/png,image/webp");
  assert.equal(validateAiTryOnPhotoFile({ type: "image/jpeg", size: 2_000_000 }), null);
  assert.equal(validateAiTryOnPhotoFile({ type: "image/gif", size: 1000 }), AI_TRY_ON_PHOTO_TYPE_ERROR);
  assert.equal(validateAiTryOnPhotoFile({ type: "image/heic", size: 1000 }), AI_TRY_ON_PHOTO_TYPE_ERROR);
  assert.equal(validateAiTryOnPhotoFile({ type: "image/png", size: 0 }), AI_TRY_ON_PHOTO_TYPE_ERROR);
  assert.equal(validateAiTryOnPhotoFile({ type: "image/png", size: 16 * 1024 * 1024 }), AI_TRY_ON_PHOTO_SIZE_ERROR);
  assert.deepEqual(fitAiTryOnImage(3000, 4000), { width: 768, height: 1024 });
  assert.deepEqual(fitAiTryOnImage(600, 800), { width: 600, height: 800 });

  let drawn: number[] = [];
  const encoder: AiTryOnImageEncoder = {
    decode: async () => ({ width: 2000, height: 1000 }),
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: () => undefined,
        drawImage: (_image: never, _x: number, _y: number, w: number, h: number) => { drawn = [w, h]; },
      }),
      toBlob: (callback: (blob: Blob | null) => void) =>
        callback(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: "image/jpeg" })),
    }),
  };
  const file = Object.assign(new Blob([new Uint8Array(10)], { type: "image/png" }), { name: "me.png" });
  const prepared = await prepareAiTryOnPersonPhoto(file as never, encoder);
  assert.equal(prepared.mimeType, "image/jpeg", "always re-encoded (EXIF dropped)");
  assert.equal(Buffer.from(prepared.data, "base64")[0], 0xff);
  assert.deepEqual(drawn, [1024, 512]);
  await assert.rejects(
    prepareAiTryOnPersonPhoto(Object.assign(new Blob(["x"], { type: "image/gif" })) as never, encoder),
    /JPEG, PNG or WebP/,
  );
}

// ------------------------------------------------------------ order key
// Step 7 replaced the browser-chosen order key with a server-issued session
// (tested in test_ai_try_on_step7_session.ts).
{
  const sessionSource = readFileSync("src/services/guestOrderSessionService.ts", "utf8");
  assert.match(sessionSource, /clearFutureDesignDraft: \(\): void => \{[\s\S]*?retireAiTryOnSessions\(\);/);
}

// ------------------------------------------------------------ panel

const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: "tryon-v1-0123456789abcdef",
  mode: "garment",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: null,
  fitHints: [],
  orderDetails: null,
  ...overrides,
});

const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");

const fakeImage = { mimeType: "image/jpeg" as const, data: "/9j/4AAQ" };

const renderPanel = (props: Partial<AiTryOnPhotoPanelProps> = {}) => {
  const created: string[] = [];
  const requests: unknown[] = [];
  let renderer!: ReturnType<typeof create>;
  const base: AiTryOnPhotoPanelProps = {
    targets: [target()],
    triesPerOrder: 5,
    initialTriesRemaining: 5,
    onPreviewCreated: ({ wearerId }) => created.push(wearerId),
    onUnavailable: () => created.push("unavailable"),
    requestPreview: async (request) => {
      requests.push(request);
      return {
        kind: "completed",
        resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "order-x" },
        preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
        orderTriesRemaining: 4,
      };
    },
    preparePhoto: async () => fakeImage,
    createThumbnailUrl: () => null,
    revokeThumbnailUrl: () => undefined,
    ...props,
  };
  act(() => {
    renderer = create(createElement(AiTryOnPhotoPanel, base));
  });
  return { renderer, created, requests };
};

const choosePhoto = async (renderer: ReturnType<typeof create>, type = "image/jpeg") => {
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type }), { name: "me.jpg" });
  await act(async () => {
    await input.props.onChange({ target: { files: [file] } });
  });
};

const generateButton = (renderer: ReturnType<typeof create>) =>
  renderer.root.find(
    (node) => node.type === "button" && /Generate preview|Make a new preview/.test(textOf(node)),
  );

{
  // Static content: exact consent notice, no checkbox, tips, How we use collapsed.
  const markup = renderToStaticMarkup(
    createElement(AiTryOnPhotoPanel, {
      targets: [target()],
        triesPerOrder: 5,
      initialTriesRemaining: 5,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
    }),
  );
  assert.equal(
    AI_TRY_ON_CONSENT_NOTICE,
    "By uploading a photo, you agree that The Odogwu Heritage can send it to Google's Gemini AI to create a try-on preview. The photo must be of you, or of someone aged 18 or over who has agreed to it.",
  );
  assert.ok(markup.includes(AI_TRY_ON_CONSENT_NOTICE.replace(/'/g, "&#x27;")));
  assert.equal(markup.includes('type="checkbox"'), false, "consent is a notice, not a checkbox");
  assert.match(markup, /How we use your photo/);
  assert.match(markup, /aria-expanded="false"/);
  assert.equal(markup.includes("What we keep:"), false, "How we use starts collapsed");
  assert.equal(markup.includes("Who&#x27;s this for?"), false, "no picker for one wearer");
  assert.match(markup, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(markup, /5 tries left/);
  assert.match(markup, /disabled=""[^>]*>.*Generate preview/s, "Generate waits for a photo");
  // Tips use column flow, not a row grid, so a wrapped tip can't misalign the other column.
  assert.match(markup, /sm:columns-2/);
  assert.equal(/<ul[^>]*sm:grid-cols-2/.test(markup), false);
  assert.match(markup, /break-inside-avoid/);
  AI_TRY_ON_PHOTO_TIPS.forEach((tip) => assert.ok(markup.includes(tip.replace(/'/g, "&#x27;")), tip));
  assert.deepEqual(
    AI_TRY_ON_HOW_WE_USE_BULLETS.map((bullet) => bullet.label),
    ["What we send:", "What Google does with it:", "What we keep:", "Fair use:", "It's optional:", "It's a preview:"],
  );
  assert.equal(
    AI_TRY_ON_HOW_WE_USE_BULLETS[2].text,
    "we delete your photo straight after the preview is made. We keep the preview privately for up to 30 days, or until you place your order, whichever comes first, and delete it sooner if you ask. We never share it with our workshop.",
  );
  assert.equal(
    AI_TRY_ON_PREVIEW_DISCLAIMER,
    "This is an AI preview to help you picture your outfit. The real garment, fabric colour, pattern placement and fit may look different. We make your order from your measurements and choices, not from this image.",
  );
}

{
  // Expand How we use; generate; result with disclaimer; tick on the wearer.
  const { renderer, created, requests } = renderPanel({
    targets: [target(), target({ wearerId: "w-obi", label: "Person 2", inputFingerprint: "tryon-v1-fedcba9876543210" })],
  });
  const chips = renderer.root.findAll((node) => node.type === "button" && node.props.role === "radio");
  assert.equal(chips.length, 2, "picker shown for two wearers");
  assert.match(textOf(renderer.root), /Who's this for\?/);
  const howButton = renderer.root.find((node) => node.type === "button" && /How we use your photo/.test(textOf(node)));
  act(() => howButton.props.onClick());
  assert.match(textOf(renderer.root), /What we keep: we delete your photo straight after/);

  await choosePhoto(renderer);
  assert.equal(generateButton(renderer).props.disabled, false);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  assert.deepEqual(created, ["w-ada"]);
  const sent = requests[0] as Record<string, unknown>;
  assert.equal(sent.mode, "garment");
  assert.equal(sent.inputFingerprint, "tryon-v1-0123456789abcdef", "Ada's own fingerprint");
  assert.equal("fabricSwatchImageUrl" in sent, false);
  assert.equal(sent.garmentImageUrl, "https://example.test/style-a.jpg", "server loads the picture");
  assert.equal("garmentImage" in sent, false, "no client-side reference download");
  assert.equal(sent.wearerKey, "w-ada");
  const result = renderer.root.find((node) => node.type === "img" && /AI try-on preview for Ada/.test(node.props.alt));
  assert.equal(result.props.src, "data:image/png;base64,iVBORw0KGgo=");
  assert.match(textOf(renderer.root), new RegExp(AI_TRY_ON_PREVIEW_DISCLAIMER.slice(0, 40)));
  assert.match(textOf(renderer.root), /4 tries left/);
  assert.match(textOf(chips[0]), /\(preview ready\)/, "tick on the wearer with a preview");
  assert.equal(textOf(chips[1]).includes("(preview ready)"), false);
  assert.equal(generateButton(renderer).props.disabled, true, "photo dropped after the preview");

  // Switching wearer never carries the photo across.
  act(() => chips[1].props.onClick());
  assert.equal(
    renderer.root.findAll((node) => node.type === "img" && /AI try-on preview/.test(node.props.alt || "")).length,
    0,
  );
  assert.equal(generateButton(renderer).props.disabled, true);
}

{
  // Fabric mode sends the swatch URL; the server loads it third.
  const { renderer, requests } = renderPanel({
    targets: [target({ mode: "fabric", fabricSwatchImageUrl: "https://example.test/red.jpg" })],
  });
  await choosePhoto(renderer);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  assert.equal((requests[0] as { mode: string }).mode, "fabric");
  assert.equal((requests[0] as { fabricSwatchImageUrl?: string }).fabricSwatchImageUrl, "https://example.test/red.jpg");
}

const errorCases: Array<[AiTryOnPreviewOutcome, string]> = [
  [{ kind: "order_limit_reached" }, AI_TRY_ON_MESSAGES.outOfPreviews],
  [{ kind: "rate_limited", retryAfterSeconds: 60 }, AI_TRY_ON_MESSAGES.tooManyTries],
  [{ kind: "failed", orderTriesRemaining: 3 }, AI_TRY_ON_MESSAGES.failed(3)],
  [{ kind: "photo_blocked", orderTriesRemaining: 3 }, AI_TRY_ON_MESSAGES.photoBlocked],
];
assert.equal(
  AI_TRY_ON_MESSAGES.failed(3),
  "We couldn't create a preview this time. This try wasn't counted, so you still have 3 left. Try again, or use a different photo.",
);
assert.equal(AI_TRY_ON_MESSAGES.photoBlocked, "We couldn't use this photo. This try wasn't counted. Please try a different photo.");
assert.equal(AI_TRY_ON_MESSAGES.tooManyTries, "That's a lot of tries in a short time. Please wait a while and try again.");
assert.equal(
  AI_TRY_ON_MESSAGES.outOfPreviews,
  "You've used all 5 AI Try-on previews for this order. They're shared by everyone on the order. You can still continue without one.",
);
for (const [outcome, text] of errorCases) {
  const { renderer, created } = renderPanel({ requestPreview: async () => outcome });
  await choosePhoto(renderer);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  const alert = renderer.root.find((node) => node.type === "div" && node.props.role === "alert");
  assert.equal(textOf(alert), text, outcome.kind);
  assert.deepEqual(created, [], "no completion on errors");
}

{
  // Out of tries on load; unavailable mid-flow; bad file type; reference image fails.
  const out = renderPanel({ initialTriesRemaining: 0 });
  assert.match(textOf(out.renderer.root), /You've used all 5 AI Try-on previews/);
  await choosePhoto(out.renderer);
  assert.equal(generateButton(out.renderer).props.disabled, true);

  const gone = renderPanel({ requestPreview: async () => ({ kind: "unavailable" }) });
  await choosePhoto(gone.renderer);
  await act(async () => {
    await generateButton(gone.renderer).props.onClick();
  });
  assert.deepEqual(gone.created, ["unavailable"]);

  const gif = renderPanel();
  await choosePhoto(gif.renderer, "image/gif");
  assert.match(textOf(gif.renderer.root), /Please choose a JPEG, PNG or WebP photo\./);
  assert.equal(generateButton(gif.renderer).props.disabled, true);

  // The server could not load a catalogue picture: failed, no try used.
  const cors = renderPanel({
    requestPreview: async () => ({ kind: "failed", orderTriesRemaining: 5 }),
  });
  await choosePhoto(cors.renderer);
  await act(async () => {
    await generateButton(cors.renderer).props.onClick();
  });
  assert.match(textOf(cors.renderer.root), /so you still have 5 left/);

  const uploadedDesign = renderPanel({ targets: [target({ garmentImageUrl: null })] });
  assert.match(textOf(uploadedDesign.renderer.root), /isn't available for uploaded designs yet/);
}

{
  // Loading state while Gemini runs.
  let resolve!: (outcome: AiTryOnPreviewOutcome) => void;
  const { renderer } = renderPanel({
    requestPreview: () => new Promise((done) => { resolve = done; }),
  });
  await choosePhoto(renderer);
  let pending!: Promise<void>;
  await act(async () => {
    pending = generateButton(renderer).props.onClick();
  });
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-loading"] !== undefined && node.type === "div").length, 1);
  assert.match(textOf(renderer.root), /Creating your preview\. This can take up to a minute\./);
  await act(async () => {
    resolve({ kind: "failed", orderTriesRemaining: 5 });
    await pending;
  });
}

// ------------------------------------------------------------ step shell

{
  const unavailable = renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow: { schemaVersion: 1, status: "unavailable", inputFingerprint: "tryon-v1-0123456789abcdef" },
      skipAllowed: true,
      onBack: () => undefined,
      onRetry: () => undefined,
      onSkip: () => undefined,
      onContinue: () => undefined,
    }),
  );
  assert.match(unavailable, /AI Try-on is currently unavailable/);
  assert.match(unavailable, /You can continue with your order without a Try-on preview\./);
  assert.match(unavailable, /Continue without AI Try-on/);
  assert.equal(unavailable.includes("type=\"file\""), false, "no photo picker while unavailable");

  const live = renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow: { schemaVersion: 1, status: "ready", inputFingerprint: "tryon-v1-0123456789abcdef" },
      skipAllowed: true,
      onBack: () => undefined,
      onRetry: () => undefined,
      onSkip: () => undefined,
      onContinue: () => undefined,
      livePanel: createElement("div", { "data-live": "yes" }),
    }),
  );
  assert.match(live, /data-live="yes"/);
  assert.match(live, /Continue without AI Try-on/, "Try-on stays optional when available");
  assert.equal(live.includes("currently unavailable"), false);
}

// ------------------------------------------------------------ skip hidden while generating

{
  // Same wiring as DesignStudioView: the panel reports generating, the step hides skip.
  const skipButtons = (renderer: ReturnType<typeof create>) =>
    renderer.root.findAll(
      (node) => node.type === "button" && /Continue without AI Try-on/.test(textOf(node)),
    );
  for (const finalOutcome of [
    { kind: "failed", orderTriesRemaining: 5 },
    {
      kind: "completed",
      resultReference: { kind: "verified_private_try_on_result", assetId: "tryon-1", ownerBindingId: "order-x" },
      preview: { mimeType: "image/png", data: "iVBORw0KGgo=" },
      orderTriesRemaining: 4,
    },
  ] as AiTryOnPreviewOutcome[]) {
    let resolve!: (outcome: AiTryOnPreviewOutcome) => void;
    const Wrapper = () => {
      const [generating, setGenerating] = useState(false);
      return createElement(DormantFutureAiTryOnStep, {
        workflow: { schemaVersion: 1, status: "ready", inputFingerprint: "tryon-v1-0123456789abcdef" },
        skipAllowed: true,
        onBack: () => undefined,
        onRetry: () => undefined,
        onSkip: () => undefined,
        onContinue: () => undefined,
        generating,
        livePanel: createElement(AiTryOnPhotoPanel, {
          targets: [target()],
                triesPerOrder: 5,
          initialTriesRemaining: 5,
          onPreviewCreated: () => undefined,
          onUnavailable: () => undefined,
          onGeneratingChange: setGenerating,
          requestPreview: () => new Promise<AiTryOnPreviewOutcome>((done) => { resolve = done; }),
          preparePhoto: async () => fakeImage,
          createThumbnailUrl: () => null,
          revokeThumbnailUrl: () => undefined,
        }),
      });
    };
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(Wrapper));
    });
    assert.equal(skipButtons(renderer).length, 1, "skip shown before generating");
    await choosePhoto(renderer);
    let pending!: Promise<void>;
    await act(async () => {
      pending = generateButton(renderer).props.onClick();
    });
    assert.match(textOf(renderer.root), /Creating your preview/);
    assert.equal(skipButtons(renderer).length, 0, "skip hidden while a preview is generating");
    await act(async () => {
      resolve(finalOutcome);
      await pending;
    });
    assert.equal(skipButtons(renderer).length, 1, `skip shown again after ${finalOutcome.kind}`);
  }
}

// ------------------------------------------------------------ privacy boundary (source)

{
  const panelSource = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "assetId", "saveFutureDesignDraft"]) {
    assert.equal(panelSource.includes(forbidden), false, `panel must not touch ${forbidden}`);
  }
  assert.equal(studioSource.includes("personImage"), false, "photos never reach DesignStudioView state");
  assert.equal(/preview\.data|previews\[/.test(studioSource), false, "previews never reach the draft");
  assert.match(studioSource, /recordAiTryOnPreviewCompletion\(/);
}

// ------------------------------------------------------------ privacy policy

{
  const section = PRIVACY_POLICY.sections.find((entry) => entry.id === "privacy-ai-try-on");
  assert.ok(section, "AI Try-on photos section");
  assert.equal(section!.title, "AI Try-on photos");
  assert.match(section!.paragraphs![0], /someone aged 18 or over who has agreed/);
  assert.match(section!.paragraphs![0], /By uploading a photo, you agree/);
  assert.equal(
    section!.paragraphs![1],
    "We delete your photo as soon as the preview is created. We keep the preview privately for up to 30 days, or until you place your order, whichever is sooner, and delete it earlier if you ask. Try-on photos and previews are never shared with our workshop. Our legal basis is your consent, which you give by uploading a photo; you can withdraw it at any time by not using AI Try-on or asking us to delete your preview. To limit use, we count previews per order (5 per order, kept for 90 days) and requests per IP address (10 per hour), stored only in scrambled (hashed) form.",
  );
  const all = JSON.stringify(PRIVACY_POLICY);
  assert.match(all, /Google \(Gemini API\): creates AI Try-on previews/);
  assert.match(all, /Google may process and briefly store your photo and preview in any country/);
  assert.match(all, /AI Try-on: we delete your photo as soon as the preview is created[^"]*55 days/);
  assert.match(all, /\[TRANSFER SAFEGUARDS\]/, "placeholder stays until the Google DPA is accepted");
}

// ------------------------------------------------------------ server: 90-day order counters

type Doc = Record<string, unknown>;
class FakeFirestore {
  readonly docs = new Map<string, Doc>();
  collection(name: string) {
    return {
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return { path, get: async () => this.snapshot(path) };
      },
    };
  }
  snapshot(path: string) {
    const data = this.docs.get(path);
    return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  }
  async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn({
      get: async (ref: { path: string }) => this.snapshot(ref.path),
      set: (ref: { path: string }, data: Doc, options?: { merge?: boolean }) => {
        const previous = options?.merge ? this.docs.get(ref.path) || {} : {};
        this.docs.set(ref.path, { ...previous, ...data });
      },
    });
  }
  asFirestore() {
    return this as unknown as Firestore;
  }
}

{
  assert.equal(AI_TRY_ON_ORDER_USAGE_RETENTION_MS, 90 * 24 * 60 * 60 * 1000);
  const db = new FakeFirestore();
  let now = 1_000_000;
  const limits = createAiTryOnUsageLimits(db.asFirestore(), { now: () => now });
  const first = await limits.reserve("tryon-order-0001");
  assert.equal(first.ok, true);
  const orderPath = [...db.docs.keys()].find((key) => key.startsWith("aiTryOnUsage/order-"))!;
  const expiresAt = db.docs.get(orderPath)?.expiresAt as Date;
  assert.equal(expiresAt.getTime(), 1_000_000 + AI_TRY_ON_ORDER_USAGE_RETENTION_MS);
  assert.equal(db.docs.get("aiTryOnUsage/global")?.expiresAt, undefined, "global cap never expires");
  now += 1000;
  await limits.reserve("tryon-order-0001");
  assert.equal((db.docs.get(orderPath)?.expiresAt as Date).getTime(), expiresAt.getTime(), "window fixed at first try");
  assert.equal(await limits.readOrderTriesRemaining("tryon-order-0001"), 3);
  for (let index = 0; index < 3; index += 1) await limits.reserve("tryon-order-0001");
  assert.deepEqual(await limits.reserve("tryon-order-0001"), { ok: false, code: "ORDER_TRY_LIMIT_REACHED" });
  // After 90 days an expired counter (TTL deletion pending) counts as fresh.
  now = expiresAt.getTime() + 1;
  assert.equal(await limits.readOrderTriesRemaining("tryon-order-0001"), 5);
  const fresh = await limits.reserve("tryon-order-0001");
  assert.equal(fresh.ok && fresh.orderTriesRemaining, 4);
  assert.equal((db.docs.get(orderPath)?.expiresAt as Date).getTime(), now + AI_TRY_ON_ORDER_USAGE_RETENTION_MS);
  // Firestore Timestamp shape (toMillis) is read too.
  db.docs.set(orderPath, { count: 5, expiresAt: { toMillis: () => now - 1 } });
  assert.equal(await limits.readOrderTriesRemaining("tryon-order-0001"), 5);
}

// The session call reports tries left; refunded failures report them too.
// (Step 7: the session is server-issued; a fake one is used here.)
{
  const db = new FakeFirestore();
  const environment = { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: "fake-gemini-key-for-tests-only" };
  const response = () => {
    const state: { status: number; body: unknown } = { status: 0, body: null };
    const res = {
      setHeader: () => res,
      status: (code: number) => { state.status = code; return res; },
      json: (body: unknown) => { state.body = body; return res; },
    };
    return { state, res: res as never };
  };
  const deps = {
    environment,
    getDb: () => db.asFirestore(),
    consumeIpRateLimit: async () => undefined,
    createGenerateContent: () => async () => { throw Object.assign(new Error("upstream"), { status: 503 }); },
    createPreviewStore: () => ({
      save: async () => { throw new Error("not expected"); },
      list: async () => [],
      read: async () => null,
      remove: async () => 0,
    }),
    createSessions: () => ({
      resolve: async () => ({ sessionId: "tryon-order-0002", sessionToken: null, created: false }),
      authorize: async () => "tryon-order-0002",
      close: async () => undefined,
      findOpenForUid: async () => null,
    }),
    log: () => undefined,
  };
  await createAiTryOnUsageLimits(db.asFirestore()).reserve("tryon-order-0002");
  const get = response();
  await handleAiTryOn({ method: "POST", headers: {}, query: { route: "ai-try-on", action: "session" } } as never, get.res, deps as never);
  assert.deepEqual(get.state.body, { status: "available", triesPerOrder: 5, orderTriesRemaining: 4, previews: [], sessionToken: null });
  const getUrl = response();
  await handleAiTryOn({ method: "POST", headers: {}, url: "/api/ai-try-on?action=session" } as never, getUrl.res, deps as never);
  assert.deepEqual(getUrl.state.body, { status: "available", triesPerOrder: 5, orderTriesRemaining: 4, previews: [], sessionToken: null });
  const getPlain = response();
  await handleAiTryOn({ method: "GET", headers: {}, query: { orderKey: "x" } } as never, getPlain.res, deps as never);
  assert.deepEqual(getPlain.state.body, { status: "available", triesPerOrder: 5 }, "plain GET: no session, no order key");

  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]).toString("base64");
  const post = response();
  await handleAiTryOn(
    {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
      body: {
        mode: "garment",
        inputFingerprint: "tryon-v1-0123456789abcdef",
        personImage: { mimeType: "image/jpeg", data: jpeg },
        garmentImage: { mimeType: "image/jpeg", data: jpeg },
      },
    } as never,
    post.res,
    deps as never,
  );
  assert.equal(post.state.status, 502);
  assert.equal((post.state.body as { orderTriesRemaining?: number }).orderTriesRemaining, 4, "refunded: still 4 left");
}

console.log("PASS: AI Try-on Step 5 UI, consent, privacy policy and 90-day order counters");
