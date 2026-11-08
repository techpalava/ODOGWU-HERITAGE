import { aiTryOnGarmentPreviewKey } from "./src/utils/aiTryOnWorkflow";
import { aiTryOnPreviewTargets } from "./src/utils/aiTryOnWearerTargets";
/**
 * Step 5 AI Try-on UI: wearer targets, availability and preview mapping,
 * client photo checks, order key, order-level completion, the photo panel
 * (consent notice, How we use, tips, picker, Generate, errors, result) and
 * the server's 90-day order counters. Gemini and fetch are always mocked.
 */
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, useRef, useState } from "react";
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
  type AiTryOnSessionPhoto,
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
import { isOrderAiTryOnFinishedForSummary } from "./src/utils/measurementBlueprint";
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
  assert.equal(single.previewableGarments?.length, 2, "both catalogue garments can be chosen");
  assert.deepEqual(
    single.previewableGarments?.map((garment) => garment.label),
    ["Standard Shirt", "Trouser"],
  );
  assert.equal(single.previewableGarments?.[0].garmentImageUrl, "https://example.test/style-a.jpg");
  assert.equal(single.previewableGarments?.[0].fabricSwatchImageUrl, "https://example.test/red.jpg");
  assert.equal(single.previewableGarments?.[0].orderDetails?.garments.length, 1, "a try describes one garment");
  assert.equal(single.previewableGarments?.[0].orderDetails?.garments[0].garmentType, "shirt");
  assert.equal(single.previewableGarments?.[1].garmentImageUrl, "https://example.test/style-b.jpg");
  assert.equal(single.previewableGarments?.[1].fabricSwatchImageUrl, null, "that fabric has no picture");
  assert.equal(single.previewableGarments?.[1].orderDetails?.garments.length, 1);
  assert.equal(single.previewableGarments?.[1].orderDetails?.garments[0].garmentType, "trouser");
  // The picture URL is not part of the fingerprint. Changing it does not
  // make an existing preview stale; changing the design does.
  const relabelledPicture = buildAiTryOnWearerTargets(
    baseInput({
      occurrences: [
        baseInput().occurrences[0],
        { ...baseInput().occurrences[1], assignmentImage: "https://example.test/style-b-2.jpg" },
      ],
    }),
  );
  assert.equal(relabelledPicture[0].inputFingerprint, single.inputFingerprint);
  assert.equal(relabelledPicture[0].previewableGarments?.[1].garmentImageUrl, "https://example.test/style-b-2.jpg");
  const twoShirts = buildAiTryOnWearerTargets(
    baseInput({
      occurrences: [
        baseInput().occurrences[0],
        {
          garmentKey: "shirt:2",
          garmentType: "shirt",
          assignment: assignment("shirt:2", "style-b"),
          assignmentImage: "https://example.test/style-b.jpg",
        },
      ],
      fabricAllocations: [
        baseInput().fabricAllocations[0],
        {
          allocationId: "a2",
          fabricCode: "F-PLAIN",
          garmentAssignments: [{ garmentKey: "shirt:2", code: "S2", garmentType: "shirt", fabricUnits: 1 }],
        },
      ] as never,
    }),
  );
  assert.deepEqual(
    twoShirts[0].previewableGarments?.map((garment) => garment.label),
    ["Standard Shirt", "Standard Shirt 2"],
  );

  const targets = buildAiTryOnWearerTargets(baseInput({ wearerOrder: twoWearers }));
  assert.deepEqual(targets.map((target) => target.label), ["Ada", "Person 2"]);
  const [ada, obi] = targets;
  assert.equal(ada.mode, "fabric");
  assert.equal(obi.mode, "garment", "no swatch picture → garment mode");
  assert.equal(obi.fabricSwatchImageUrl, null);
  assert.equal(obi.garmentImageUrl, "https://example.test/style-b.jpg");
  assert.equal(ada.previewableGarments?.length, 1, "picker hidden when a person has one pictured garment");
  assert.equal(obi.previewableGarments?.length, 1);
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
  assert.deepEqual(uploaded[0].previewableGarments, []);

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
    });
    assert.equal(next.status, "completed", state.status);
    assert.equal(next.inputFingerprint, fingerprint);
    assert.equal(next.jobReference, undefined, "completion stores the server result, not a job id");
    assert.equal(isOrderAiTryOnFinishedForSummary(next), true);
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
    }),
    unchanged,
    "an unsafe reference never completes the workflow",
  );

  // One wearer's preview completes the ORDER workflow and unlocks Summary.
  // A second wearer is not required and is not stored on this state.
  const afterAda = recordAiTryOnPreviewCompletion({
    state: unchanged,
    currentInputFingerprint: fingerprint,
    resultReference: reference,
  });
  assert.equal(isOrderAiTryOnFinishedForSummary(afterAda), true);
  assert.equal(afterAda.resultReference?.assetId, reference.assetId);
  const afterObi = recordAiTryOnPreviewCompletion({
    state: afterAda,
    currentInputFingerprint: fingerprint,
    resultReference: { ...reference, assetId: "tryon-obi" },
  });
  assert.equal(afterObi.status, "completed");
  assert.equal(isOrderAiTryOnFinishedForSummary(afterObi), true);
  assert.equal(afterObi.resultReference?.assetId, "tryon-obi");
  assert.equal("wearers" in afterObi, false, "the order workflow is not a per-wearer checklist");
  const skipped = {
    schemaVersion: 1 as const,
    status: "skipped" as const,
    inputFingerprint: fingerprint,
  };
  assert.equal(
    isOrderAiTryOnFinishedForSummary(skipped),
    true,
    "an order-level skip unlocks Summary even when nobody has a preview",
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
    accountTriesRemaining: null,
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
  // Deep check H1: off or capped still carries the stored previews.
  const storedWhileCapped = { previewId: "tryon-0b5e7a2c-1111-4a2b-8c3d-4e5f60718293", wearerKey: "order", inputFingerprint: "tryon-v1-0123456789abcdef", expiresAt: "2026-12-01T00:00:00.000Z" };
  assert.deepEqual(
    await fetchAiTryOnAvailability({
      credentials,
      fetchImpl: async () => new Response(JSON.stringify({ status: "unavailable", code: "GLOBAL_LIMIT_REACHED", previews: [storedWhileCapped, { previewId: "bad" }] })),
    }),
    { status: "unavailable", storedPreviews: [storedWhileCapped] },
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
    jobStore: createAiTryOnBackgroundJobs({ storage: null }),
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
  assert.equal(markup.includes("Whose measurements?"), false, "no measurement picker for one wearer");
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
    // Approved wording (PR 4, Xavier 2 Nov 2026).
    "we delete your photo straight after the preview is made. We keep the preview privately for up to 30 days, or until you place your order, and delete it sooner if you ask. If you order, we keep one preview per garment and the latest combined outfit preview per person with the order for 60 days so our team and tailors can see what you chose. We never share your photo with our workshop.",
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
  const chips = renderer.root.findAll(
    (node) => node.type === "button" && node.props["data-wearer-chip"],
  );
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

{
  // Two pictured garments: the customer picks exactly one. Default is the
  // first pictured. One Generate sends that garment and its swatch only.
  const [built] = buildAiTryOnWearerTargets(baseInput());
  const { renderer, requests } = renderPanel({ targets: [built] });
  const garmentButtons = () =>
    renderer.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-garment"]);
  assert.equal(garmentButtons().length, 2);
  assert.equal(garmentButtons()[0].props["aria-checked"], true, "first pictured is selected");
  assert.equal(garmentButtons()[1].props["aria-checked"], false);
  assert.match(textOf(renderer.root), /Which garment\?/);
  assert.match(textOf(renderer.root), /This preview uses one garment and its fabric/);
  await choosePhoto(renderer);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  const first = requests[0] as {
    mode: string;
    garmentImageUrl: string;
    fabricSwatchImageUrl?: string;
    inputFingerprint: string;
    orderDetails: { garments: Array<{ garmentType: string }> };
  };
  assert.equal(requests.length, 1, "one Generate is one try");
  assert.equal(first.mode, "fabric");
  assert.equal(first.garmentImageUrl, "https://example.test/style-a.jpg");
  assert.equal(first.fabricSwatchImageUrl, "https://example.test/red.jpg");
  assert.equal(first.inputFingerprint, built.previewableGarments?.[0]?.inputFingerprint, "fingerprint is this garment's own (deep check M1)");
  assert.notEqual(first.inputFingerprint, built.inputFingerprint);
  assert.equal(first.orderDetails.garments.length, 1);
  assert.equal(first.orderDetails.garments[0].garmentType, "shirt");
  assert.equal(JSON.stringify(first).includes("style-b"), false, "the other garment picture is not sent");
  assert.equal(JSON.stringify(first).includes("trouser"), false, "the other garment is not described");

  act(() => garmentButtons()[1].props.onClick());
  assert.equal(garmentButtons()[1].props["aria-checked"], true);
  await choosePhoto(renderer);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  const second = requests[1] as typeof first;
  assert.equal(requests.length, 2, "the next garment is its own try, not a batch");
  assert.equal(second.mode, "garment", "no swatch picture → garment mode");
  assert.equal(second.garmentImageUrl, "https://example.test/style-b.jpg");
  assert.equal(second.fabricSwatchImageUrl, undefined);
  assert.equal(second.inputFingerprint, built.previewableGarments?.[1]?.inputFingerprint, "each garment has its own fingerprint (M1)");
  assert.equal(second.orderDetails.garments.length, 1);
  assert.equal(second.orderDetails.garments[0].garmentType, "trouser");
  assert.equal(JSON.stringify(second).includes("style-a"), false);
  assert.equal(JSON.stringify(second).includes("https://example.test/red.jpg"), false);

  const onlyOne = renderPanel({
    targets: [{ ...built, previewableGarments: built.previewableGarments?.slice(0, 1) }],
  });
  assert.equal(
    onlyOne.renderer.root.findAll((node) => node.props["data-ai-try-on-garment"]).length,
    0,
    "no picker when only one garment can be previewed",
  );
  assert.equal(textOf(onlyOne.renderer.root).includes("Which garment?"), false);
}

{
  // "Whose measurements?" is a separate single-select. It only changes the
  // fit hints Generate sends. One wearer has no row. Empty hints omit the
  // block. Model mode still sends none.
  const adaHints = [{ id: "total_height" as const, valueCm: 170 }];
  const obiHints = [
    { id: "total_height" as const, valueCm: 188 },
    { id: "shoulder_length" as const, valueCm: 42 },
  ];
  const adaGarments = [
    {
      garmentKey: "shirt:1",
      label: "Shirt",
      garmentImageUrl: "https://example.test/ada-shirt.jpg",
      fabricSwatchImageUrl: null,
      fabricColorHex: null,
      orderDetails: null,
    },
    {
      garmentKey: "trouser:1",
      label: "Trouser",
      garmentImageUrl: "https://example.test/ada-trouser.jpg",
      fabricSwatchImageUrl: null,
      fabricColorHex: null,
      orderDetails: {
        garments: [{ garmentType: "trouser" as const, optionIds: ["wide-leg"], decorations: [] }],
      },
    },
  ];
  const ada = target({
    fitHints: adaHints,
    garmentImageUrl: adaGarments[0].garmentImageUrl,
    previewableGarments: adaGarments,
  });
  const obi = target({
    wearerId: "w-obi",
    label: "Obi",
    inputFingerprint: "tryon-v1-fedcba9876543210",
    garmentImageUrl: "https://example.test/obi.jpg",
    fitHints: obiHints,
    orderDetails: {
      garments: [{ garmentType: "shirt" as const, optionIds: ["obi-shirt"], decorations: [] }],
    },
  });
  const wearerChips = (renderer: ReturnType<typeof create>) =>
    renderer.root.findAll((node) => node.type === "button" && node.props["data-wearer-chip"]);
  const measurementChips = (renderer: ReturnType<typeof create>) =>
    renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-ai-try-on-measurement-wearer"],
    );
  const checkedWearer = (
    renderer: ReturnType<typeof create>,
    attribute: "data-wearer-chip" | "data-ai-try-on-measurement-wearer",
  ) =>
    (attribute === "data-wearer-chip" ? wearerChips(renderer) : measurementChips(renderer)).find(
      (node) => node.props["aria-checked"] === true,
    )?.props[attribute];

  const single = renderPanel({ targets: [target({ fitHints: adaHints })] });
  assert.equal(measurementChips(single.renderer).length, 0, "one wearer has no measurement chips");
  assert.equal(textOf(single.renderer.root).includes("Whose measurements?"), false);
  await choosePhoto(single.renderer);
  await act(async () => {
    await generateButton(single.renderer).props.onClick();
  });
  assert.deepEqual(
    (single.requests[0] as { fitHints?: unknown }).fitHints,
    adaHints,
    "the only wearer's hints are still sent",
  );

  const { renderer, requests } = renderPanel({
    targets: [ada, obi],
    createThumbnailUrl: () => "blob:ada-photo",
  });
  assert.equal(measurementChips(renderer).length, 2, "one chip per wearer");
  const measurementGroup = renderer.root.find(
    (node) => node.props.role === "radiogroup" && node.props["aria-label"] === "Whose measurements?",
  );
  assert.equal(measurementGroup.props["aria-label"], "Whose measurements?");
  assert.match(textOf(renderer.root), /Whose measurements\?/);
  assert.match(textOf(renderer.root), /This does not change the photo or the garment/);
  assert.equal(checkedWearer(renderer, "data-wearer-chip"), "w-ada");
  assert.equal(checkedWearer(renderer, "data-ai-try-on-measurement-wearer"), "w-ada", "defaults to Who's this for?");
  assert.equal(measurementChips(renderer)[0].props.type, "button");
  assert.equal(measurementChips(renderer)[0].props.role, "radio");
  assert.match(String(measurementChips(renderer)[1].props.className), /focus-visible:ring-heritage-gold/);
  assert.equal(
    wearerChips(renderer)[1].props.className,
    measurementChips(renderer)[1].props.className,
    "same chip treatment as Who's this for?",
  );

  const garmentButtons = () =>
    renderer.root.findAll((node) => node.type === "button" && node.props["data-ai-try-on-garment"]);
  act(() => garmentButtons()[1].props.onClick());
  await choosePhoto(renderer);
  const thumb = () =>
    renderer.root.findAll((node) => node.type === "img" && /Photo chosen for/.test(node.props.alt || ""));
  assert.equal(thumb().length, 1);
  act(() => {
    measurementChips(renderer)
      .find((node) => node.props["data-ai-try-on-measurement-wearer"] === "w-obi")!
      .props.onClick();
  });
  assert.equal(checkedWearer(renderer, "data-wearer-chip"), "w-ada", "photo wearer stays");
  assert.equal(checkedWearer(renderer, "data-ai-try-on-measurement-wearer"), "w-obi");
  assert.equal(garmentButtons()[1].props["aria-checked"], true, "garment choice stays");
  assert.equal(thumb().length, 1, "photo stays");
  assert.equal(thumb()[0].props.alt, "Photo chosen for Ada");
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  const sent = requests[0] as {
    wearerKey: string;
    inputFingerprint: string;
    garmentImageUrl: string;
    fitHints?: Array<{ id: string; valueCm: number }>;
    orderDetails?: { garments: Array<{ optionIds: string[] }> };
    defaultModelId?: string;
  };
  assert.equal(sent.wearerKey, aiTryOnPreviewTargets([ada])[1].wearerId);
  assert.equal(sent.inputFingerprint, ada.inputFingerprint, "fingerprint stays with the photo wearer");
  assert.equal(sent.garmentImageUrl, "https://example.test/ada-trouser.jpg");
  assert.deepEqual(sent.orderDetails?.garments[0].optionIds, ["wide-leg"], "garment details stay");
  assert.deepEqual(sent.fitHints, obiHints, "Generate uses the measurement wearer's hints");
  assert.equal(sent.defaultModelId, undefined);

  act(() => wearerChips(renderer)[1].props.onClick());
  assert.equal(checkedWearer(renderer, "data-wearer-chip"), "w-obi");
  assert.equal(
    checkedWearer(renderer, "data-ai-try-on-measurement-wearer"),
    "w-obi",
    "Who's this for? resets measurements to that person",
  );
  assert.equal(thumb().length, 0, "the photo still belongs to one person");
  act(() => wearerChips(renderer)[0].props.onClick());
  assert.equal(checkedWearer(renderer, "data-wearer-chip"), "w-ada");
  assert.equal(checkedWearer(renderer, "data-ai-try-on-measurement-wearer"), "w-ada", "reset again, not the earlier choice");
  assert.equal(garmentButtons()[1].props["aria-checked"], true, "Ada's garment choice is kept");

  const emptyAda = renderPanel({
    targets: [
      target({ fitHints: [] }),
      target({
        wearerId: "w-obi",
        label: "Obi",
        inputFingerprint: "tryon-v1-fedcba9876543210",
        fitHints: obiHints,
      }),
    ],
  });
  await choosePhoto(emptyAda.renderer);
  await act(async () => {
    await generateButton(emptyAda.renderer).props.onClick();
  });
  assert.equal("fitHints" in (emptyAda.requests[0] as object), false, "empty hints omit the block");
  await choosePhoto(emptyAda.renderer);
  act(() => {
    measurementChips(emptyAda.renderer)
      .find((node) => node.props["data-ai-try-on-measurement-wearer"] === "w-obi")!
      .props.onClick();
  });
  await act(async () => {
    await generateButton(emptyAda.renderer).props.onClick();
  });
  const withObi = emptyAda.requests[1] as { wearerKey: string; fitHints?: unknown; inputFingerprint: string };
  assert.equal(withObi.wearerKey, "w-ada");
  assert.equal(withObi.inputFingerprint, "tryon-v1-0123456789abcdef");
  assert.deepEqual(withObi.fitHints, obiHints, "hints are sent when that wearer has them");

  act(() => {
    emptyAda.renderer.root.find((node) => node.props["data-ai-try-on-model-option"]).props.onClick();
  });
  act(() => {
    emptyAda.renderer.root.find((node) => node.props["data-ai-try-on-model"] === "male-1-light").props.onClick();
  });
  await act(async () => {
    await generateButton(emptyAda.renderer).props.onClick();
  });
  const modeled = emptyAda.requests[2] as { wearerKey: string; defaultModelId?: string };
  assert.equal(modeled.wearerKey, "w-ada");
  assert.equal(modeled.defaultModelId, "male-1-light");
  assert.equal("fitHints" in modeled, false, "model mode sends no customer fit hints");
  assert.equal(
    checkedWearer(emptyAda.renderer, "data-ai-try-on-measurement-wearer"),
    "w-obi",
    "model mode does not clear the measurement choice",
  );
}

{
  // The measurement choice lives with the photo and wearer in tab memory.
  const SessionHarness = () => {
    const [show, setShow] = useState(true);
    const [photo, setPhoto] = useState<AiTryOnSessionPhoto | null>(null);
    const [models, setModels] = useState<Record<string, string>>({});
    const [wearerId, setWearerId] = useState<string | null>(null);
    const [measurementWearerId, setMeasurementWearerId] = useState<string | null>(null);
    const jobs = useRef(createAiTryOnBackgroundJobs({ storage: null }));
    const panel = show
      ? createElement(AiTryOnPhotoPanel, {
          targets: [
            target(),
            target({ wearerId: "w-obi", label: "Obi", inputFingerprint: "tryon-v1-fedcba9876543210", fitHints: [{ id: "total_height", valueCm: 188 }] }),
          ],
          triesPerOrder: 5,
          initialTriesRemaining: 5,
          onPreviewCreated: () => undefined,
          onUnavailable: () => undefined,
          preparePhoto: async () => fakeImage,
          createThumbnailUrl: () => "blob:kept-photo",
          revokeThumbnailUrl: () => undefined,
          jobStore: jobs.current,
          sessionPhoto: photo,
          onSessionPhotoChange: setPhoto,
          sessionModelIdByWearer: models,
          onSessionModelIdByWearerChange: setModels,
          sessionWearerId: wearerId,
          onSessionWearerIdChange: setWearerId,
          sessionMeasurementWearerId: measurementWearerId,
          onSessionMeasurementWearerIdChange: setMeasurementWearerId,
        })
      : null;
    return createElement(
      "div",
      null,
      panel,
      createElement(
        "button",
        { type: "button", "data-toggle-panel": "true", onClick: () => setShow((open) => !open) },
        "toggle",
      ),
    );
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(SessionHarness));
  });
  const toggle = () => renderer.root.find((node) => node.props["data-toggle-panel"] === "true");
  const measurementChips = () =>
    renderer.root.findAll(
      (node) => node.type === "button" && node.props["data-ai-try-on-measurement-wearer"],
    );
  const checkedMeasurement = () =>
    measurementChips().find((node) => node.props["aria-checked"] === true)?.props[
      "data-ai-try-on-measurement-wearer"
    ];
  act(() => {
    measurementChips()
      .find((node) => node.props["data-ai-try-on-measurement-wearer"] === "w-obi")!
      .props.onClick();
  });
  assert.equal(checkedMeasurement(), "w-obi");
  await choosePhoto(renderer);
  act(() => toggle().props.onClick());
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-panel"]).length, 0);
  act(() => toggle().props.onClick());
  assert.equal(checkedMeasurement(), "w-obi", "leaving Try-on keeps Whose measurements?");
  const wearer = renderer.root
    .findAll((node) => node.type === "button" && node.props["data-wearer-chip"])
    .find((node) => node.props["aria-checked"] === true);
  assert.equal(wearer?.props["data-wearer-chip"], "w-ada", "the photo wearer is unchanged");
  assert.equal(
    renderer.root.findAll((node) => node.type === "img" && /Photo chosen for/.test(node.props.alt || "")).length,
    1,
    "the photo is still there",
  );
}

{
  // The prepared photo and model choice live above the panel, so leaving
  // Try-on and coming back in the same tab keeps them. Switching wearer
  // still drops the photo.
  const SessionHarness = () => {
    const [show, setShow] = useState(true);
    const [photo, setPhoto] = useState<AiTryOnSessionPhoto | null>(null);
    const [models, setModels] = useState<Record<string, string>>({});
    const [wearerId, setWearerId] = useState<string | null>(null);
    const jobs = useRef(createAiTryOnBackgroundJobs({ storage: null }));
    const panel = show
      ? createElement(AiTryOnPhotoPanel, {
          targets: [
            target(),
            target({ wearerId: "w-obi", label: "Person 2", inputFingerprint: "tryon-v1-fedcba9876543210" }),
          ],
          triesPerOrder: 5,
          initialTriesRemaining: 5,
          onPreviewCreated: () => undefined,
          onUnavailable: () => undefined,
          preparePhoto: async () => fakeImage,
          createThumbnailUrl: () => "blob:kept-photo",
          revokeThumbnailUrl: () => undefined,
          jobStore: jobs.current,
          sessionPhoto: photo,
          onSessionPhotoChange: setPhoto,
          sessionModelIdByWearer: models,
          onSessionModelIdByWearerChange: setModels,
          sessionWearerId: wearerId,
          onSessionWearerIdChange: setWearerId,
        })
      : null;
    return createElement(
      "div",
      null,
      panel,
      createElement("button", { type: "button", "data-toggle-panel": "true", onClick: () => setShow((open) => !open) }, "toggle"),
    );
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(SessionHarness));
  });
  const toggle = () => renderer.root.find((node) => node.props["data-toggle-panel"] === "true");
  const thumb = () => renderer.root.findAll((node) => node.type === "img" && /Photo chosen for/.test(node.props.alt || ""));
  await choosePhoto(renderer);
  assert.equal(thumb().length, 1);
  assert.equal(thumb()[0].props.src, "blob:kept-photo");
  act(() => toggle().props.onClick());
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-panel"]).length, 0, "left Try-on");
  act(() => toggle().props.onClick());
  assert.equal(thumb().length, 1, "the photo is still there");
  assert.equal(generateButton(renderer).props.disabled, false, "Generate does not ask for the photo again");

  const wearerChips = () =>
    renderer.root.findAll((node) => node.type === "button" && node.props["data-wearer-chip"]);
  act(() => wearerChips()[1].props.onClick());
  assert.equal(thumb().length, 0, "a photo belongs to one person");
  assert.equal(generateButton(renderer).props.disabled, true);
  act(() => wearerChips()[0].props.onClick());
  assert.equal(thumb().length, 0, "switching back does not restore the cleared photo");

  const modelOption = renderer.root.find((node) => node.props["data-ai-try-on-model-option"]);
  act(() => modelOption.props.onClick());
  const modelButton = renderer.root.find((node) => node.props["data-ai-try-on-model"] === "male-1-light");
  act(() => modelButton.props.onClick());
  assert.equal(modelButton.props["aria-checked"], true);
  act(() => toggle().props.onClick());
  act(() => toggle().props.onClick());
  const restoredModel = renderer.root.find((node) => node.props["data-ai-try-on-model"] === "male-1-light");
  assert.equal(restoredModel.props["aria-checked"], true, "the model choice survives leaving Try-on");
  assert.equal(generateButton(renderer).props.disabled, false);
}

const errorCases: Array<[AiTryOnPreviewOutcome, string]> = [
  [{ kind: "order_limit_reached" }, AI_TRY_ON_MESSAGES.outOfPreviews],
  [{ kind: "rate_limited", retryAfterSeconds: 60 }, AI_TRY_ON_MESSAGES.tooManyTries],
  [{ kind: "failed", orderTriesRemaining: 3 }, AI_TRY_ON_MESSAGES.failed(3)],
  [{ kind: "photo_blocked", orderTriesRemaining: 3 }, `${AI_TRY_ON_MESSAGES.photoBlocked} ${AI_TRY_ON_MESSAGES.failed(3)}`],
  [{ kind: "failed", orderTriesRemaining: 3, tryRefunded: true }, AI_TRY_ON_MESSAGES.failed(3, true)],
];
assert.equal(
  AI_TRY_ON_MESSAGES.failed(3),
  "Your preview didn’t finish. We couldn’t confirm whether a try was used. Check AI Try-on for your latest tries remaining.",
);
assert.equal(AI_TRY_ON_MESSAGES.photoBlocked, "We couldn't use this photo. Please try a different photo.");
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
  assert.match(textOf(cors.renderer.root), /couldn’t confirm whether a try was used/);

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
      (node) => node.type === "button" && /Continue without AI Try-on|Continue while we make your preview/.test(textOf(node)),
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
    const jobStore = createAiTryOnBackgroundJobs({ storage: null });
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
          jobStore,
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
    // Phase B: the customer can move on while the preview is made.
    assert.equal(skipButtons(renderer).length, 1, "skip stays while a preview is generating");
    assert.match(textOf(skipButtons(renderer)[0]), /Continue while we make your preview/);
    await act(async () => {
      resolve(finalOutcome);
      await pending;
    });
    assert.equal(skipButtons(renderer).length, 1, `skip shown after ${finalOutcome.kind}`);
    assert.match(textOf(skipButtons(renderer)[0]), /Continue without AI Try-on/);
  }
}

// ------------------------------------------------------------ privacy boundary (source)

{
  const panelSource = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  for (const forbidden of ["localStorage", "sessionStorage", "indexedDB", "assetId", "saveFutureDesignDraft"]) {
    assert.equal(panelSource.includes(forbidden), false, `panel must not touch ${forbidden}`);
  }
  assert.equal(studioSource.includes("personImage"), false, "the request field stays in the panel");
  assert.match(studioSource, /aiTryOnSessionPhoto/, "the prepared photo is held in Design Studio memory");
  assert.match(studioSource, /aiTryOnSessionMeasurementWearerId/, "the measurement wearer is held in Design Studio memory");
  assert.match(
    studioSource,
    /setAiTryOnSessionMeasurementWearerId\(null\)/,
    "a new order and sign-out drop the measurement wearer",
  );
  assert.match(studioSource, /clearAiTryOnSessionMemory\(\)/, "a new order and sign-out drop it");
  assert.equal(studioSource.includes("aiTryOnSessionPhoto:"), false, "the session photo is not a draft field");
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
    // Approved wording (PR 4): the order image (60 days), then the consent addition.
    "We delete your photo as soon as the preview is created. Before you order, we keep the preview privately for up to 30 days and delete it earlier if you ask. If you place your order, we keep one preview per garment and the latest combined outfit preview per person with that order for up to 60 days after payment, and delete it earlier if the order is cancelled or refunded or you delete it in My Orders. Your photo is never shared with our workshop. The preview saved with your order is visible to our team and tailors, for reference only. Our legal basis is your consent, which you give by uploading a photo; you can withdraw it at any time by not using AI Try-on or asking us to delete your preview. Your consent also covers keeping the preview with your order. You can withdraw it at any time by deleting the AI preview in My Orders. To limit use, we count previews per order (5 per order, kept for 90 days), per signed-in account (15 in any 30 days, kept for 30 days) and requests per IP address (10 per hour), stored only in scrambled (hashed) form.",
  );
  const all = JSON.stringify(PRIVACY_POLICY);
  assert.match(all, /Google \(Gemini API\): creates AI Try-on previews/);
  assert.match(all, /Google may process and briefly store your photo and preview in any country/);
  assert.match(all, /AI Try-on: we delete your photo as soon as the preview is created[^"]*55 days/);
  assert.match(all, /When you place your order, we keep one preview per garment and the latest combined outfit preview per person with that order for up to 60 days/);
  assert.match(all, /Brevo: sends our sign-in code emails and order confirmation emails\. If Brevo is unavailable/);
  assert.equal(all.includes("Try-on photos and previews are never shared with our workshop"), false, "old wording gone");
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
      delete: (ref: { path: string }) => void this.docs.delete(ref.path),
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
    createGenerateContent: () => async () => { throw Object.assign(new Error("upstream"), { status: 500 }); },
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


// Uploaded-design mode: per-garment target, own input identity and no customer/model inputs.
{
  const input = baseInput();
  const uploadedOccurrence = { ...input.occurrences[0], assignmentImage: null,
    uploadedDesignPreviewUrl: "blob:existing-private-design",
    assignment: { garmentKey: input.occurrences[0].garmentKey, sourceKind: "uploaded" as const, sourceKey: "uploaded:private-1", uploadedSourceRef: "private-1" },
  };
  const [built] = buildAiTryOnWearerTargets({ ...input, occurrences: [uploadedOccurrence, input.occurrences[1]] });
  assert.equal(built.previewableGarments?.length, 2, "uploaded and catalogue garments both stay selectable");
  assert.equal(built.previewableGarments?.[0].uploadedDesign?.previewUrl, "blob:existing-private-design");
  const renamedBlob = buildAiTryOnWearerTargets({ ...input, occurrences: [{ ...uploadedOccurrence, uploadedDesignPreviewUrl: "blob:restored-same-design" }, input.occurrences[1]] });
  assert.equal(renamedBlob[0].inputFingerprint, built.inputFingerprint, "restoring the same private image must not stale the preview");
  const replaced = buildAiTryOnWearerTargets({ ...input, occurrences: [{ ...uploadedOccurrence, assignment: { ...uploadedOccurrence.assignment, sourceKey: "uploaded:private-2", uploadedSourceRef: "private-2" } }, input.occurrences[1]] });
  assert.notEqual(replaced[0].inputFingerprint, built.inputFingerprint, "replacing the Step 3 design stales the old preview");
  const studio = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const targetsMemo = studio.slice(studio.indexOf("const aiTryOnWearerTargets = useMemo("), studio.indexOf("// Background AI Try-on:"));
  assert.match(targetsMemo, /uploadedDesignPreviewUrl: futureDesignStylePreviewByOccurrenceToken/);
  assert.match(targetsMemo, /futureDesignStyleStepProjection\.occurrences,\s+futureDesignStylePreviewByOccurrenceToken,/, "restored upload URL must invalidate the targets memo");
  assert.match(studio, /onUploadAnotherDesign=\{[\s\S]*?setFutureActiveDesignStyleOccurrence\(occurrence\.target\);\s+navigateToFutureStage\("design_style"\);/, "replacement reuses the existing targeted Step 3 uploader");
  const reads: string[] = [];
  const replacements: string[] = [];
  const photoUpdates: unknown[] = [];
  const { renderer, requests } = renderPanel({
    targets: [{ ...built, wearerId: "w-ada" }],
    sessionPhoto: { wearerId: "w-ada", image: { mimeType: "image/jpeg", data: "CUSTOMER_PHOTO_MUST_NOT_BE_SENT" }, thumbnailUrl: null },
    onSessionPhotoChange: (next) => photoUpdates.push(next),
    sessionModelIdByWearer: { "w-ada": "male-plus" },
    loadUploadedDesign: async (url) => { reads.push(url); return fakeImage; },
    onUploadAnotherDesign: (key) => replacements.push(key),
  });
  const use = () => renderer.root.find((node) => node.type === "button" && /^Use this design/.test(textOf(node)));
  assert.equal(use().props.disabled, false, "no new customer photo or model needed");
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-model-option"]).length, 0);
  assert.equal(renderer.root.findAll((node) => node.type === "input" && node.props.type === "file").length, 0, "replacement must reuse Step 3, not introduce a new upload/storage flow");
  assert.match(textOf(renderer.root), /person in your uploaded picture, not you/);
  // Deep check M2: the uploaded picture goes to Gemini, so the photo-mode
  // consent notice (same wording) shows in the uploaded-design box.
  const designBox = renderer.root.find((node) => node.props["data-ai-try-on-uploaded-design"]);
  const designConsent = designBox.findAll((node) => node.props["data-ai-try-on-consent"]);
  assert.equal(designConsent.length, 1, "consent notice shown before generating from an uploaded design");
  assert.ok(textOf(designConsent[0]).startsWith(AI_TRY_ON_CONSENT_NOTICE), "same wording as photo mode");
  await act(async () => { renderer.root.find((node) => node.props["data-ai-try-on-upload-another-design"]).props.onClick(); });
  assert.deepEqual(replacements, [uploadedOccurrence.garmentKey]);
  await act(async () => { use().props.onClick(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.deepEqual(reads, ["blob:existing-private-design"]);
  assert.deepEqual(requests, [{ mode: "fabric", inputFingerprint: built.previewableGarments?.[0]?.inputFingerprint, wearerKey: aiTryOnGarmentPreviewKey("w-ada", uploadedOccurrence.garmentKey), uploadedDesignImage: fakeImage, uploadedGarmentType: "shirt", fabricSwatchImageUrl: "https://example.test/red.jpg" }]);
  assert.equal(photoUpdates.length, 0, "unused customer photo for other garments must not be cleared");
  assert.match(textOf(renderer.root), /on your uploaded design/);
  assert.match(textOf(renderer.root), /4 tries left/);
  // Switching to catalogue garment restores its ordinary photo/model controls.
  await act(async () => { renderer.root.find((node) => node.props["data-ai-try-on-garment"] === input.occurrences[1].garmentKey).props.onClick(); });
  assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-uploaded-design"]).length, 0);
  assert.equal(renderer.root.findAll((node) => node.type === "input" && node.props.type === "file").length, 1);
  await act(async () => { renderer.root.find((node) => node.props["data-ai-try-on-garment"] === input.occurrences[0].garmentKey).props.onClick(); });
  assert.match(textOf(renderer.root), /on your uploaded design/, "per-garment preview stays after switching away and back");
  act(() => renderer.unmount());
  const noSwatch = renderPanel({ targets: [target({ garmentImageUrl: "blob:design", uploadedDesign: { garmentKey: "base:shirt", garmentType: "shirt", previewUrl: "blob:design" }, fabricSwatchImageUrl: null })] });
  assert.equal(noSwatch.renderer.root.find((node) => node.type === "button" && /^Use this design/.test(textOf(node))).props.disabled, true);
  assert.match(textOf(noSwatch.renderer.root), /Choose a fabric with a swatch image/);
  act(() => noSwatch.renderer.unmount());
}
console.log("PASS: AI Try-on Step 5 UI, consent, privacy policy and 90-day order counters");

// Deep check M1: a change to one garment makes only that garment's preview
// (and an outfit that includes it) out of date; the outfit uses the chosen pair.
{
  const { aiTryOnOutfitTarget, aiTryOnOutfitChoices, aiTryOnPreviewFingerprintIsCurrent } = await import("./src/utils/aiTryOnWearerTargets");
  const three = (trouserFabric: string, extraShirtStyle = "style-c") => baseInput({
    occurrences: [
      ...baseInput().occurrences,
      { garmentKey: "shirt:2", garmentType: "shirt", assignment: assignment("shirt:2", extraShirtStyle), assignmentImage: "https://example.test/style-c.jpg" },
    ],
    fabricAllocations: [
      ...(baseInput().fabricAllocations as never[]).slice(0, 1),
      { allocationId: "a2", fabricCode: trouserFabric, garmentAssignments: [{ garmentKey: "trouser:1", code: "T", garmentType: "trouser", fabricUnits: 1 }] },
    ] as never,
  });
  const before = buildAiTryOnWearerTargets(three("F-PLAIN"))[0];
  const after = buildAiTryOnWearerTargets(three("F-RED"))[0];
  const byKey = (target: AiTryOnWearerTarget) => Object.fromEntries(aiTryOnPreviewTargets([target]).map((entry) => [entry.previewableGarments?.[0]?.garmentKey, entry.inputFingerprint]));
  assert.equal(byKey(after)["shirt:1"], byKey(before)["shirt:1"], "changing the trousers keeps the shirt preview current");
  assert.equal(byKey(after)["shirt:2"], byKey(before)["shirt:2"]);
  assert.notEqual(byKey(after)["trouser:1"], byKey(before)["trouser:1"], "the changed garment's preview goes out of date");
  const pairOf = (target: AiTryOnWearerTarget, top: string) => {
    const { tops, bottoms } = aiTryOnOutfitChoices(target);
    return aiTryOnOutfitTarget(target, { top: tops.find((g) => g.garmentKey === top)!, bottom: bottoms[0] })!.inputFingerprint;
  };
  assert.notEqual(pairOf(before, "shirt:1"), pairOf(before, "shirt:2"), "a different chosen top is a different outfit");
  assert.notEqual(pairOf(after, "shirt:1"), pairOf(before, "shirt:1"), "outfit including the changed trousers goes out of date");
  const otherShirt = buildAiTryOnWearerTargets(three("F-PLAIN", "style-d"))[0];
  assert.equal(pairOf(otherShirt, "shirt:1"), pairOf(before, "shirt:1"), "an outfit without the changed garment stays current");
  assert.notEqual(pairOf(otherShirt, "shirt:2"), pairOf(before, "shirt:2"));
  const slot = aiTryOnOutfitTarget(before)!;
  assert.equal(aiTryOnPreviewFingerprintIsCurrent(slot, pairOf(before, "shirt:2")), true, "Summary accepts any current pair");
  assert.equal(aiTryOnPreviewFingerprintIsCurrent(aiTryOnOutfitTarget(after)!, pairOf(before, "shirt:1")), false);
  console.log("PASS: AI Try-on per-garment and per-pair freshness (M1)");
}
