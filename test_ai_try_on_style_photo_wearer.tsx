/**
 * Default studio model, the style-photo wearer, and the design-style flag.
 * Gemini is never called. Generate runs only when the test presses it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { AiTryOnPhotoPanel, AI_TRY_ON_STYLE_PHOTO_COPY } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import { parseAiTryOnGenerationRequest } from "./src/server/aiTryOnHttp";
import { buildAiTryOnStylePhotoPrompt } from "./src/server/aiTryOnPrompt";
import type { StyleCategory } from "./src/types";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import { aiTryOnPreviewFingerprintIsCurrent } from "./src/utils/aiTryOnWearerTargets";
import {
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
} from "./src/utils/designStyleAuthority";
import type { AiTryOnGenerationRequest } from "./src/utils/aiTryOnGatewayContract";
import { AI_TRY_ON_STYLE_PHOTO_PROMPT_VERSION } from "./src/utils/aiTryOnGatewayContract";
import {
  aiTryOnPreviewFingerprintMatchesDesign,
  aiTryOnWearerPreviewFingerprint,
  createAiTryOnVisualInputFingerprint,
} from "./src/utils/aiTryOnWorkflow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const FINGERPRINT = "tryon-v1-0123456789abcdef";
const textOf = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child))).join("");

const garment = (overrides: Record<string, unknown> = {}) => ({
  garmentKey: "shirt:1",
  garmentType: "shirt" as const,
  sourceKind: "catalog" as const,
  label: "Long Shirt",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: "https://example.test/red.jpg",
  fabricColorHex: "#aa0000",
  orderDetails: null,
  inputFingerprint: FINGERPRINT,
  styleShowsWearer: true,
  styleGender: "female",
  ...overrides,
});

const target = (overrides: Partial<AiTryOnWearerTarget> = {}): AiTryOnWearerTarget => ({
  wearerId: "w-ada",
  label: "Ada",
  inputFingerprint: FINGERPRINT,
  mode: "fabric",
  garmentImageUrl: "https://example.test/style-a.jpg",
  fabricSwatchImageUrl: "https://example.test/red.jpg",
  previewableGarments: [garment()],
  fitHints: [{ id: "total_height", valueCm: 170 }] as never,
  orderDetails: null,
  ...overrides,
});

const renderPanel = (props: Partial<React.ComponentProps<typeof AiTryOnPhotoPanel>> = {}) => {
  const requests: AiTryOnGenerationRequest[] = [];
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(AiTryOnPhotoPanel, {
        targets: [target()],
        triesPerOrder: 5,
        initialTriesRemaining: 5,
        generateEnabled: true,
        onPreviewCreated: () => undefined,
        onUnavailable: () => undefined,
        requestPreview: async (request) => {
          requests.push(request);
          return {
            kind: "completed",
            resultReference: {
              kind: "verified_private_try_on_result",
              assetId: "tryon-11111111-2222-4333-8444-555555555555",
              ownerBindingId: "order-x",
            },
            preview: { mimeType: "image/webp", data: "UklGRg==" },
            orderTriesRemaining: 4,
            storedPreviewId: null,
          };
        },
        preparePhoto: async () => ({ mimeType: "image/jpeg" as const, data: "/9j/4AAQ" }),
        createThumbnailUrl: () => null,
        revokeThumbnailUrl: () => undefined,
        readResetStatus: async () => ({ eligible: false }),
        jobStore: createAiTryOnBackgroundJobs({ storage: null }),
        ...props,
      }),
    );
  });
  return { renderer, requests };
};

const byData = (renderer: ReturnType<typeof create>, attribute: string, value?: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props[attribute] !== undefined &&
      (value === undefined || node.props[attribute] === value),
  );
const click = async (node: ReactTestInstance) => {
  await act(async () => {
    await node.props.onClick();
  });
};
const generate = (renderer: ReturnType<typeof create>) =>
  renderer.root.findByProps({ "data-ai-try-on-generate": true });

{
  const style = (showsWearer?: boolean): StyleCategory => ({
    id: "authority-style-1",
    name: "Authority Style",
    description: "A published style.",
    gender: "female",
    options: ["Standard"],
    image: "https://example.test/style.webp",
    outfitType: "Set",
    garmentComposition: "Shirt",
    fabricCategory: "Any",
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    customDetailConfig: {
      representedGenders: ["female"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: ["shirt_construction"],
      enabled: true,
    },
    includedDesignFeatures: {
      hasMonogram: false,
      hasEmbroidery: false,
      hasMonogramTrimming: false,
    },
    monogramCuffEligible: false,
    embroideryProminence: "standard",
    defaultGarmentDetails: {},
    styleApplicability: { mode: "exact_only" },
    ...(showsWearer === undefined ? {} : { showsWearer }),
  });
  const off = prepareAuthoritativeDesignStyleRecord({
    style: style(),
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    currentRecord: null,
  });
  assert.equal("showsWearer" in off.presentation, false, "default false is omitted");
  assert.equal(projectDesignStyleRecordForAdmin(off).showsWearer, undefined);
  const on = prepareAuthoritativeDesignStyleRecord({
    style: style(true),
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    currentRecord: null,
  });
  assert.equal(on.presentation.showsWearer, true);
  assert.equal(parseAuthoritativeDesignStyleRecord(on.id, on).status, "valid");
  assert.equal(projectDesignStyleRecordForAdmin(on).showsWearer, true);
  const legacy = parseAuthoritativeDesignStyleRecord(off.id, off);
  assert.equal(legacy.status, "valid");
  const rules = readFileSync("firestore.rules", "utf8");
  assert.match(rules, /"showsWearer"/);
  assert.match(rules, /!data\.keys\(\)\.hasAny\(\["showsWearer"\]\)/);
  assert.match(rules, /\|\| data\.showsWearer is bool/);
}

{
  const model = aiTryOnWearerPreviewFingerprint(FINGERPRINT, {
    kind: "studio_model",
    modelId: "female-1-light",
  });
  const photo = aiTryOnWearerPreviewFingerprint(FINGERPRINT, { kind: "customer_photo" });
  const stylePhoto = aiTryOnWearerPreviewFingerprint(FINGERPRINT, { kind: "style_photo" });
  assert.ok(model && photo && stylePhoto);
  assert.notEqual(model, photo);
  assert.notEqual(model, stylePhoto);
  assert.notEqual(photo, stylePhoto);
  assert.notEqual(model, FINGERPRINT, "wearer source changes the preview fingerprint");
  assert.equal(aiTryOnPreviewFingerprintMatchesDesign(FINGERPRINT, model), true);
  assert.equal(aiTryOnPreviewFingerprintMatchesDesign(FINGERPRINT, stylePhoto), true);
  assert.equal(aiTryOnPreviewFingerprintMatchesDesign(FINGERPRINT, "tryon-v1-0000000000000000"), false);
  assert.equal(aiTryOnPreviewFingerprintIsCurrent(target(), stylePhoto), true);
  const otherModel = aiTryOnWearerPreviewFingerprint(FINGERPRINT, {
    kind: "studio_model",
    modelId: "male-plus",
  });
  assert.notEqual(model, otherModel);
  const visual = createAiTryOnVisualInputFingerprint({
    garmentTypeSelection: {
      garmentTypes: ["shirt"],
      demographic: "female",
      constructionByGarment: {},
    },
    fabricAllocations: [],
    selectedStyleId: "style-a",
  });
  assert.equal(
    createAiTryOnVisualInputFingerprint({
      garmentTypeSelection: {
        garmentTypes: ["shirt"],
        demographic: "female",
        constructionByGarment: {},
      },
      fabricAllocations: [],
      selectedStyleId: "style-a",
    }),
    visual,
    "the design fingerprint does not change when wearer source is absent",
  );
}

{
  const url = "https://example.test/style-a.jpg";
  const fabric = "https://example.test/red.jpg";
  const parsed = parseAiTryOnGenerationRequest({
    mode: "fabric",
    inputFingerprint: FINGERPRINT,
    wearerKey: "w-ada",
    wearerSource: "style_photo",
    garmentImageUrl: url,
    fabricSwatchImageUrl: fabric,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.stylePhoto, true);
    assert.equal(parsed.personImage, null);
    assert.equal(parsed.defaultModel, null);
    assert.deepEqual(parsed.fitHints, []);
    assert.equal(parsed.orderDetails, null);
    assert.equal(parsed.garment && parsed.garment.kind === "url" && parsed.garment.url, url);
  }
  for (const extra of [
    { fitHints: [{ id: "total_height", valueCm: 170 }] },
    { personImage: { mimeType: "image/jpeg", data: "/9j/4AAQ" } },
    { defaultModelId: "female-1-light" },
    { orderDetails: { garments: [] } },
    { wearerSource: "customer_photo" },
  ]) {
    assert.equal(
      parseAiTryOnGenerationRequest({
        mode: "fabric",
        inputFingerprint: FINGERPRINT,
        wearerSource: "style_photo",
        garmentImageUrl: url,
        fabricSwatchImageUrl: fabric,
        ...extra,
      }).ok,
      false,
      JSON.stringify(extra),
    );
  }
  const prompt = buildAiTryOnStylePhotoPrompt();
  assert.match(prompt, new RegExp(AI_TRY_ON_STYLE_PHOTO_PROMPT_VERSION));
  assert.match(prompt, /Change only the fabric/);
  assert.match(prompt, /exactly as photographed/);
  assert.equal(prompt.toLowerCase().includes("measurement"), false);
  assert.equal(prompt.includes("Kaftan"), false);
}

{
  const { renderer, requests } = renderPanel();
  assert.equal(renderer.root.findByProps({ "data-ai-try-on-wearer-source": "studio_model" }).props["data-ai-try-on-wearer-source"], "studio_model");
  assert.equal(byData(renderer, "data-ai-try-on-model-option")[0].props["aria-pressed"], true);
  assert.equal(byData(renderer, "data-ai-try-on-photo-option")[0].props["aria-pressed"], false);
  assert.equal(byData(renderer, "data-ai-try-on-model", "female-1-light")[0].props["aria-checked"], true);
  assert.equal(byData(renderer, "data-ai-try-on-style-photo-option").length, 1);
  assert.equal(requests.length, 0, "mounting does not generate");
  assert.equal(generate(renderer).props.disabled, false);
  await click(generate(renderer));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].defaultModelId, "female-1-light");
  assert.equal("personImage" in requests[0], false);
  assert.equal("fitHints" in requests[0], false);
  assert.equal("wearerSource" in requests[0], false);
}

{
  const { renderer, requests } = renderPanel();
  const styleCard = () => byData(renderer, "data-ai-try-on-style-photo-option")[0];
  const modelCard = () => byData(renderer, "data-ai-try-on-model-option")[0];
  const photoCard = () => byData(renderer, "data-ai-try-on-photo-option")[0];
  assert.match(textOf(styleCard()), new RegExp(AI_TRY_ON_STYLE_PHOTO_COPY.option));
  assert.match(textOf(styleCard()), new RegExp(AI_TRY_ON_STYLE_PHOTO_COPY.caption));
  assert.match(textOf(styleCard()), /Uses 1 try/);
  assert.equal(styleCard().props["aria-pressed"], false);
  await click(styleCard());
  assert.equal(requests.length, 0, "choosing the style photo does not generate");
  assert.equal(styleCard().props["aria-pressed"], true);
  assert.equal(modelCard().props["aria-pressed"], false);
  assert.equal(photoCard().props["aria-pressed"], false);
  assert.equal(byData(renderer, "data-ai-try-on-model-picker").length, 0);
  await click(byData(renderer, "data-ai-try-on-model", "female-plus")[0] ?? modelCard());
  await click(modelCard());
  await click(byData(renderer, "data-ai-try-on-model", "female-plus")[0]);
  assert.equal(modelCard().props["aria-pressed"], true);
  assert.equal(styleCard().props["aria-pressed"], false);
  assert.equal(photoCard().props["aria-pressed"], false);
  const input = renderer.root.find((node) => node.type === "input" && node.props.type === "file");
  const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "me.jpg" });
  await act(async () => {
    await input.props.onChange({ target: { files: [file] } });
  });
  assert.equal(photoCard().props["aria-pressed"], true);
  assert.equal(modelCard().props["aria-pressed"], false);
  assert.equal(styleCard().props["aria-pressed"], false);
  assert.equal(requests.length, 0, "uploading a photo does not generate");
  await click(styleCard());
  assert.equal(styleCard().props["aria-pressed"], true);
  assert.equal(photoCard().props["aria-pressed"], false);
  assert.equal(modelCard().props["aria-pressed"], false);
  await click(generate(renderer));
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal("wearerSource" in request && request.wearerSource, "style_photo");
  assert.equal(request.mode, "fabric");
  assert.equal(request.garmentImageUrl, "https://example.test/style-a.jpg");
  assert.equal(request.fabricSwatchImageUrl, "https://example.test/red.jpg");
  assert.equal("personImage" in request, false);
  assert.equal("defaultModelId" in request, false);
  assert.equal("fitHints" in request, false);
  assert.equal("orderDetails" in request, false);
  assert.equal("uploadedDesignImage" in request, false);
  assert.notEqual(request.inputFingerprint, FINGERPRINT);
  await click(modelCard());
  await click(byData(renderer, "data-ai-try-on-model", "female-1-light")[0]);
  assert.equal(byData(renderer, "data-ai-try-on-wearer-preview-stale").length, 1);
  assert.equal(byData(renderer, "data-ai-try-on-result").length, 0);
  assert.equal(requests.length, 1, "switching wearer does not generate");
}

{
  const unflagged = renderPanel({
    targets: [target({ previewableGarments: [garment({ styleShowsWearer: false })] })],
  });
  assert.equal(byData(unflagged.renderer, "data-ai-try-on-style-photo-option").length, 0);
  assert.equal(byData(unflagged.renderer, "data-ai-try-on-model-option").length, 1);

  const uploaded = renderPanel({
    targets: [
      target({
        uploadedDesign: {
          garmentKey: "shirt:1",
          garmentType: "shirt",
          previewUrl: "https://example.test/upload.jpg",
        },
        previewableGarments: [
          garment({
            sourceKind: "uploaded",
            uploadedDesign: {
              garmentKey: "shirt:1",
              garmentType: "shirt",
              previewUrl: "https://example.test/upload.jpg",
            },
            styleShowsWearer: true,
          }),
        ],
      }),
    ],
  });
  assert.equal(byData(uploaded.renderer, "data-ai-try-on-style-photo-option").length, 0);
  assert.match(textOf(uploaded.renderer.root), /Your uploaded design/);

  const combined = renderPanel({
    targets: [
      target({
        previewableGarments: [
          garment(),
          garment({
            garmentKey: "trouser:1",
            garmentType: "trouser",
            label: "Trousers",
            garmentImageUrl: "https://example.test/style-b.jpg",
            styleShowsWearer: false,
          }),
        ],
      }),
    ],
  });
  assert.equal(byData(combined.renderer, "data-ai-try-on-style-photo-option").length, 1);
  await click(byData(combined.renderer, "data-ai-try-on-outfit-mode")[0]);
  assert.equal(byData(combined.renderer, "data-ai-try-on-style-photo-option").length, 0, "hidden in combined outfit mode");
  assert.equal(byData(combined.renderer, "data-ai-try-on-model-option").length, 1);
  assert.equal(combined.requests.length, 0);
}

console.log("PASS: default model, style-photo wearer, flag, fingerprint, no auto-generation");
