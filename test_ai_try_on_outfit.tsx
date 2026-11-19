/** Combined outfits: explicit choices, identity, snapshots and independent preview slots. No network/AI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { AiTryOnPhotoPanel, type AiTryOnPhotoPanelProps } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import { aiTryOnOutfitChoices, aiTryOnOutfitTarget, aiTryOnOrderPreviewTargets, getAiTryOnOutfitEligibility, type AiTryOnPreviewableGarment, type AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import { AI_TRY_ON_OUTFIT_PROMPT_VERSION, type AiTryOnGenerationRequest, type AiTryOnOutfitGarmentRequest } from "./src/utils/aiTryOnGatewayContract";
import { aiTryOnOutfitFingerprint, aiTryOnOutfitPreviewKey } from "./src/utils/aiTryOnWorkflow";
import { buildAiTryOnOutfitPrompt, buildAiTryOnOutfitImageLabels } from "./src/server/aiTryOnPrompt";
import { selectAiTryOnOrderPreviews } from "./src/components/AiTryOnOrderPreviewThumbnails";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const fp = "tryon-v1-0123456789abcdef";
const garment = (key: string, garmentType: AiTryOnOutfitGarmentRequest["garmentType"], sourceKind: "catalog" | "uploaded" = "catalog"): AiTryOnPreviewableGarment => ({
  garmentKey: key, garmentType, sourceKind, label: key, garmentImageUrl: `https://example.test/${key}.jpg`,
  fabricSwatchImageUrl: `https://example.test/${key}-fabric.jpg`, fabricColorHex: null,
  orderDetails: { garments: [{ garmentType, optionIds: garmentType === "shirt" ? ["neck_vert_round"] : [], decorations: ["embroidery"] }] },
});
const garments = [garment("shirt-first", "shirt"), garment("shirt-chosen", "shirt"), garment("trouser", "trouser"), garment("uploaded", "shirt", "uploaded")];
const target: AiTryOnWearerTarget = { wearerId: "w-ada", label: "Ada", inputFingerprint: fp, mode: "fabric", garmentImageUrl: garments[0].garmentImageUrl, fabricSwatchImageUrl: garments[0].fabricSwatchImageUrl, fitHints: [], orderDetails: null, previewableGarments: garments };
const outfit = aiTryOnOutfitTarget(target);
assert.ok(outfit);
assert.equal(outfit.wearerId, aiTryOnOutfitPreviewKey(target.wearerId));
assert.notEqual(outfit.inputFingerprint, fp, "own versioned fingerprint");
assert.notEqual(outfit.wearerId, aiTryOnOutfitTarget({ ...target, wearerId: "w-obi" })?.wearerId);
assert.deepEqual(aiTryOnOutfitChoices(target).tops.map((g) => g.garmentKey), ["shirt-first", "shirt-chosen"], "never include uploaded designs");
for (const list of [[garments[0]], [garment("dress", "dress")], [garments[3], garments[2]]]) {
  assert.equal(aiTryOnOutfitTarget({ ...target, previewableGarments: list }), null, "no valid pair: single garment behavior unchanged");
}
const promptGarments: readonly [AiTryOnOutfitGarmentRequest, AiTryOnOutfitGarmentRequest] = [
  { garmentKey: "top", garmentType: "shirt", garmentImageUrl: "https://example.test/top", fabricSwatchImageUrl: "https://example.test/swatch", orderDetails: garments[1].orderDetails },
  { garmentKey: "bottom", garmentType: "trouser", garmentImageUrl: "https://example.test/bottom", orderDetails: garments[2].orderDetails },
];
assert.equal(AI_TRY_ON_OUTFIT_PROMPT_VERSION, "tryon-outfit-prompt-v4");
const snapshots = JSON.parse(readFileSync("test_ai_try_on_outfit.snap.json", "utf8"));
for (const onModel of [false, true]) {
  const key = onModel ? "model" : "photo";
  const prompt = buildAiTryOnOutfitPrompt({ garments: promptGarments, onModel });
  assert.equal(prompt, snapshots[key]);
  assert.equal(prompt, buildAiTryOnOutfitPrompt({ garments: [...promptGarments], onModel }), "deterministic");
  assert.match(prompt, /Chosen top: Standard Shirt, design in image 2/);
  assert.match(prompt, /Chosen bottom: Trouser, design in image 4/);
  assert.match(prompt, /Embroidery: as on the garment in image 4/);
  assert.match(prompt, /Vertical Collar, Round Neck/);
  assert.match(prompt, /never a polo/);
  assert.match(prompt, /No text, labels, numbers, logos, watermarks or borders/);
  assert.match(prompt, /stand-ins only/);
  assert.match(prompt, /Never transfer this swatch to the other garment/);
  assert.equal(buildAiTryOnOutfitImageLabels(promptGarments, onModel).length, 4);
  assert.match(buildAiTryOnOutfitImageLabels(promptGarments, onModel)[3], /IMAGE 4: Trouser/);
}
{
  const kaftanOutfit = buildAiTryOnOutfitPrompt({ garments: [{ ...promptGarments[0], garmentType: "kaftan" }, promptGarments[1]], onModel: false });
  assert.match(kaftanOutfit, /Chosen top: Long Shirt/);
  assert.match(kaftanOutfit, /A named Long Shirt must be a long tunic silhouette extending to mid-thigh or near the knee/);
  assert.match(kaftanOutfit, /Top styling: wear the Long Shirt completely untucked as a long tunic extending to mid-thigh or near the knee, completely covering the hips and trouser waistband/);
  assert.doesNotMatch(kaftanOutfit, /\bKaftan\b/);
}
const withFingerprint = (garmentKey: string) => ({ garmentKey, inputFingerprint: fp });
const photoFingerprint = aiTryOnOutfitFingerprint(withFingerprint(garments[1].garmentKey), withFingerprint(garments[2].garmentKey), { kind: "customer_photo" });
const lightModelFingerprint = aiTryOnOutfitFingerprint(withFingerprint(garments[0].garmentKey), withFingerprint(garments[2].garmentKey), { kind: "studio_model", modelId: "male-1-light" });
const plusModelFingerprint = aiTryOnOutfitFingerprint(withFingerprint(garments[0].garmentKey), withFingerprint(garments[2].garmentKey), { kind: "studio_model", modelId: "male-plus" });
const unselectedFingerprint = aiTryOnOutfitFingerprint(withFingerprint(garments[0].garmentKey), withFingerprint(garments[2].garmentKey), null);
assert.ok(photoFingerprint && lightModelFingerprint && plusModelFingerprint && unselectedFingerprint);
assert.notEqual(photoFingerprint, plusModelFingerprint);
assert.notEqual(lightModelFingerprint, plusModelFingerprint);
assert.equal(aiTryOnOutfitFingerprint(withFingerprint(garments[0].garmentKey), withFingerprint(garments[2].garmentKey), { kind: "studio_model", modelId: "not-a-model" }), unselectedFingerprint, "unknown model ids are dropped");
assert.notEqual(unselectedFingerprint, aiTryOnOutfitFingerprint(withFingerprint(garments[1].garmentKey), withFingerprint(garments[2].garmentKey), null), "a different garment still changes the hash");

const text = (node: ReactTestInstance): string => node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
const requests: AiTryOnGenerationRequest[] = [];
const saved = new Map<string, { previewId: string; wearerKey: string; inputFingerprint: string }>();
const jobs = createAiTryOnBackgroundJobs({ storage: null });
const props: AiTryOnPhotoPanelProps = {
  targets: [target], triesPerOrder: 5, initialTriesRemaining: 5, jobStore: jobs,
  onPreviewCreated: () => undefined, onUnavailable: () => undefined,
  requestPreview: async (request) => {
    requests.push(request);
    const previewId = `tryon-${requests.length}`;
    saved.set(request.wearerKey ?? "", { previewId, wearerKey: request.wearerKey ?? "", inputFingerprint: request.inputFingerprint });
    return { kind: "completed", resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId: "order" }, previewStored: true, preview: { mimeType: "image/webp", data: Buffer.from(previewId).toString("base64") }, orderTriesRemaining: 5 - requests.length };
  },
  preparePhoto: async () => ({ mimeType: "image/jpeg", data: "/9j/4AAQ" }),
  createThumbnailUrl: () => null, revokeThumbnailUrl: () => undefined,
};
let panel: ReturnType<typeof create>;
await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, props)); });
const data = (attribute: string, value?: string) => panel.root.findAll((node) => typeof node.type === "string" && node.props[attribute] !== undefined && (value === undefined || node.props[attribute] === value));
const click = async (node: ReactTestInstance) => { await act(async () => { await node.props.onClick(); }); };
const generate = () => panel.root.find((node) => node.type === "button" && /Generate preview|Generate combined outfit|Make a new preview/.test(text(node)));
const file = Object.assign(new Blob([new Uint8Array(20)], { type: "image/jpeg" }), { name: "photo.jpg" });
const choosePhoto = async () => { await act(async () => { await panel.root.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } }); }); };
await choosePhoto();
await click(generate());
await click(data("data-ai-try-on-garment", "trouser")[0]);
await choosePhoto();
await click(generate());
assert.equal(requests.length, 2);
await click(data("data-ai-try-on-outfit-mode")[0]);
assert.equal(generate().props.disabled, true, "never auto-select even when one bottom is available");
for (const [part, value] of [["top", "shirt-chosen"], ["bottom", "trouser"]]) {
  await act(async () => { data("data-ai-try-on-outfit-choice", part)[0].props.onChange({ target: { value } }); });
}
await choosePhoto();
assert.equal(generate().props.disabled, false);
await click(generate());
assert.equal(requests.length, 3);
assert.deepEqual(requests[2].outfitGarments?.map((g) => g.garmentKey), ["shirt-chosen", "trouser"], "only explicit choices, never first garment");
assert.equal(requests[2].personImage?.data, requests[0].personImage?.data, "same base photo");
assert.equal(requests[2].garmentImageUrl, undefined);
assert.equal(requests[2].orderDetails, undefined);
assert.equal(requests[2].inputFingerprint, photoFingerprint, "a photo outfit fingerprint includes the photo source");
assert.match(JSON.stringify(panel.toJSON()), /Latest combined outfit preview/);
const outfitSrc = panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src;
await click(data("data-ai-try-on-single-mode")[0]);
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src, "data:image/webp;base64," + Buffer.from("tryon-2").toString("base64"), "individual trouser survives");
await click(data("data-ai-try-on-outfit-mode")[0]);
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src, outfitSrc, "outfit survives switching");
const entries = selectAiTryOnOrderPreviews(aiTryOnOrderPreviewTargets([target]), [...saved.values()]);
assert.equal(entries.length, 3, "Summary/Review/payment transfer have two individuals plus outfit");
assert.ok(entries.some((entry) => entry.label === "Ada — Combined outfit (shirt-chosen + trouser)"), "the outfit names its pair (M1)");
await act(async () => { panel.unmount(); });
// Reload reads the one stored outfit slot without generation or another try.
await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, { ...props, storedPreviews: [...saved.values()].map((entry) => ({ ...entry, expiresAt: "2026-12-01T00:00:00Z" })), loadStoredPreview: async (id) => ({ mimeType: "image/webp", data: Buffer.from(id).toString("base64") }), jobStore: createAiTryOnBackgroundJobs({ storage: null }) })); });
await click(data("data-ai-try-on-outfit-mode")[0]);
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src, outfitSrc);
assert.equal(requests.length, 3);
await act(async () => { panel.unmount(); });
// Model mode sends exactly one selected studio base and no customer photo/fit hints.
await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, { ...props, jobStore: createAiTryOnBackgroundJobs({ storage: null }) })); });
await click(data("data-ai-try-on-model-option")[0]);
await click(data("data-ai-try-on-model", "male-plus")[0]);
await click(data("data-ai-try-on-outfit-mode")[0]);
for (const [part, value] of [["top", "shirt-first"], ["bottom", "trouser"]]) {
  await act(async () => { data("data-ai-try-on-outfit-choice", part)[0].props.onChange({ target: { value } }); });
}
await click(generate());
assert.equal(requests[3].defaultModelId, "male-plus");
assert.equal(requests[3].personImage, undefined);
assert.equal(requests[3].fitHints, undefined);
assert.equal(requests[3].inputFingerprint, plusModelFingerprint, "the request uses the selected model fingerprint");
await click(data("data-ai-try-on-model", "male-1-light")[0]);
assert.equal(requests.length, 4, "switching model does not generate");
assert.equal(data("data-ai-try-on-outfit-preview-stale").length, 1, "the previous model's outfit preview is out of date");
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:")).length, 0);
await act(async () => { panel.unmount(); });
for (const list of [[garments[0]], [garment("dress", "dress")]]) {
  await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, { ...props, targets: [{ ...target, previewableGarments: list }], jobStore: createAiTryOnBackgroundJobs({ storage: null }) })); });
  assert.equal(data("data-ai-try-on-outfit-controls").length, 0, "a single garment keeps the switcher hidden");
  await act(async () => { panel.unmount(); });
}
// Integration: a separate uploaded design never supplies the combined base or disables a valid pair.
const uploadedTarget = { ...target, previewableGarments: [...garments, {
  ...garment("private-design", "shirt", "uploaded"), garmentImageUrl: null,
  uploadedDesign: { garmentKey: "private-design", garmentType: "shirt" as const, previewUrl: null },
}] };
await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, { ...props, targets: [uploadedTarget], jobStore: createAiTryOnBackgroundJobs({ storage: null }) })); });
await click(data("data-ai-try-on-garment", "private-design")[0]);
assert.equal(data("data-ai-try-on-uploaded-design").length, 1);
assert.equal(data("data-ai-try-on-source-cards").length, 0);
await click(data("data-ai-try-on-outfit-mode")[0]);
assert.equal(data("data-ai-try-on-uploaded-design").length, 0);
assert.equal(data("data-ai-try-on-source-cards").length, 1);
for (const [part, value] of [["top", "shirt-first"], ["bottom", "trouser"]]) {
  await act(async () => { data("data-ai-try-on-outfit-choice", part)[0].props.onChange({ target: { value } }); });
}
await choosePhoto();
assert.equal(generate().props.disabled, false);
await click(generate());
assert.equal(requests[4].outfitGarments?.length, 2);
assert.equal(requests[4].uploadedDesignImage, undefined);
await act(async () => { panel.unmount(); });
// Short bottoms use only short studio bases. Long bottoms use only long bases.
// Switching the bottom keeps the persona and changes the outfit fingerprint.
const shorts = garment("shorts", "standard_shorts");
const bumShorts = garment("bum-shorts", "bum_shorts");
const skirt = garment("skirt", "skirt");
const longSkirt = garment("long-skirt", "long_skirt");
const lengthTarget: AiTryOnWearerTarget = {
  ...target,
  previewableGarments: [garments[0], shorts, bumShorts, skirt, longSkirt, garments[2]],
};
const shownModels = () => data("data-ai-try-on-model").map((node) => node.props["data-ai-try-on-model"] as string);
const lengthRequests: AiTryOnGenerationRequest[] = [];
await act(async () => {
  panel = create(createElement(AiTryOnPhotoPanel, {
    ...props,
    targets: [lengthTarget],
    triesPerOrder: 20,
    initialTriesRemaining: 20,
    jobStore: createAiTryOnBackgroundJobs({ storage: null }),
    requestPreview: async (request) => {
      lengthRequests.push(request);
      return {
        kind: "completed",
        resultReference: { kind: "verified_private_try_on_result", assetId: `len-${lengthRequests.length}`, ownerBindingId: "order" },
        previewStored: true,
        preview: { mimeType: "image/webp", data: Buffer.from(`len-${lengthRequests.length}`).toString("base64") },
        orderTriesRemaining: 20 - lengthRequests.length,
      };
    },
  }));
});
assert.equal(data("data-ai-try-on-model-length")[0].props["data-ai-try-on-model-length"], "long", "a standalone shirt uses the long base");
assert.ok(shownModels().every((id) => !id.endsWith("-short")));
assert.equal(data("data-ai-try-on-model", "male-1-light")[0].props["aria-checked"], true);
await click(data("data-ai-try-on-outfit-mode")[0]);
for (const bottom of ["shorts", "bum-shorts", "skirt"] as const) {
  await act(async () => { data("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: bottom } }); });
  assert.equal(data("data-ai-try-on-model-length")[0].props["data-ai-try-on-model-length"], "short", bottom);
  assert.equal(shownModels().length, 10, bottom);
  assert.ok(shownModels().every((id) => id.endsWith("-short")), `${bottom} hides trouser bases`);
  assert.equal(data("data-ai-try-on-model", "male-1-light-short")[0].props["aria-checked"], true, bottom);
}
assert.equal(lengthRequests.length, 0, "choosing a short bottom does not generate");
await click(data("data-ai-try-on-model", "male-plus-short")[0]);
assert.equal(lengthRequests.length, 0, "picking the short persona does not generate");
await act(async () => { data("data-ai-try-on-outfit-choice", "top")[0].props.onChange({ target: { value: "shirt-first" } }); });
await act(async () => { data("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: "long-skirt" } }); });
assert.equal(data("data-ai-try-on-model-length")[0].props["data-ai-try-on-model-length"], "long");
assert.ok(shownModels().every((id) => !id.endsWith("-short")), "Long Skirt hides the short bases");
assert.equal(data("data-ai-try-on-model", "male-plus")[0].props["aria-checked"], true, "same persona, long base");
assert.equal(lengthRequests.length, 0, "switching to a long bottom does not generate");
const longSkirtFingerprint = aiTryOnOutfitFingerprint(withFingerprint("shirt-first"), withFingerprint("long-skirt"), { kind: "studio_model", modelId: "male-plus" });
await click(generate());
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
assert.equal(lengthRequests[0].defaultModelId, "male-plus");
assert.equal(lengthRequests[0].inputFingerprint, longSkirtFingerprint, "the long studio model id is in the outfit fingerprint");
await act(async () => { data("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: "shorts" } }); });
assert.equal(data("data-ai-try-on-model", "male-plus-short")[0].props["aria-checked"], true, "shorts return to the short base");
assert.equal(lengthRequests.length, 1, "switching back to shorts does not generate");
const shortsFingerprint = aiTryOnOutfitFingerprint(withFingerprint("shirt-first"), withFingerprint("shorts"), { kind: "studio_model", modelId: "male-plus-short" });
assert.notEqual(shortsFingerprint, longSkirtFingerprint);
await click(generate());
assert.equal(lengthRequests[1].defaultModelId, "male-plus-short");
assert.equal(lengthRequests[1].inputFingerprint, shortsFingerprint, "the short studio model id changes the outfit fingerprint");
await act(async () => { data("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: "trouser" } }); });
assert.equal(data("data-ai-try-on-model", "male-plus")[0].props["aria-checked"], true, "trousers stay on the long base");
assert.ok(shownModels().every((id) => !id.endsWith("-short")));
await choosePhoto();
await act(async () => { data("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: "shorts" } }); });
assert.equal(data("data-ai-try-on-model-picker").length, 0, "an uploaded photo stays the wearer when the bottom becomes short");
await act(async () => { panel.unmount(); });
const shortOutfitPrompt = buildAiTryOnOutfitPrompt({
  garments: [
    { garmentKey: "shirt-first", garmentType: "shirt", garmentImageUrl: "https://example.test/shirt-first.jpg" },
    { garmentKey: "shorts", garmentType: "standard_shorts", garmentImageUrl: "https://example.test/shorts.jpg" },
  ],
  onModel: true,
  baseLength: "short",
});
assert.match(shortOutfitPrompt, /base bum shorts or short knickers/);
assert.match(shortOutfitPrompt, /No trouser legs may be visible/);
assert.equal(/Kaftan/.test(shortOutfitPrompt), false);
// Verify gallery retention & click-to-swap between combined outfit and single garment previews.
{
  const outfitGalleryStore = new Map<string, string>();
  const mockStore = {
    getItem: (key: string) => outfitGalleryStore.get(key) ?? null,
    setItem: (key: string, value: string) => void outfitGalleryStore.set(key, value),
    removeItem: (key: string) => void outfitGalleryStore.delete(key),
  };
  let outfitReq = 0;
  let gPanel!: ReturnType<typeof create>;
  await act(async () => {
    gPanel = create(createElement(AiTryOnPhotoPanel, {
      ...props,
      galleryStore: mockStore,
      jobScope: "outfit-switcher-test",
      jobStore: createAiTryOnBackgroundJobs({ storage: null }),
      requestPreview: async (request) => {
        requests.push(request);
        outfitReq += 1;
        const previewId = `out-sw-${outfitReq}`;
        return {
          kind: "completed",
          resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId: "order" },
          previewStored: true,
          preview: { mimeType: "image/webp", data: Buffer.from(previewId).toString("base64") },
          storedPreviewId: previewId,
          orderTriesRemaining: 5 - outfitReq,
        };
      },
    }));
  });
  const gData = (attr: string, value?: string) =>
    gPanel.root.findAll((node) => typeof node.type === "string" && node.props[attr] !== undefined && (value === undefined || node.props[attr] === value));
  const gGenerate = () => gPanel.root.find((node) => node.type === "button" && /Generate preview|Generate combined outfit|Make a new preview/.test(text(node)));
  await act(async () => { await gPanel.root.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } }); });
  await act(async () => { await gGenerate().props.onClick(); });
  assert.equal(text(gData("data-ai-try-on-main-caption")[0]), "Preview 1 — shirt-first");
  await act(async () => { await gData("data-ai-try-on-outfit-mode")[0].props.onClick(); });
  for (const [part, value] of [["top", "shirt-chosen"], ["bottom", "trouser"]]) {
    await act(async () => { gData("data-ai-try-on-outfit-choice", part)[0].props.onChange({ target: { value } }); });
  }
  await act(async () => { await gPanel.root.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } }); });
  await act(async () => { await gGenerate().props.onClick(); });
  assert.equal(text(gData("data-ai-try-on-main-caption")[0]), "Preview 2 — shirt-chosen & trouser");
  assert.equal(gData("data-ai-try-on-side-preview").length, 1);
  const reqBeforeSwap = requests.length;
  await act(async () => { gData("data-ai-try-on-side-preview")[0].props.onClick(); });
  assert.equal(requests.length, reqBeforeSwap, "side preview swap never calls requestPreview");
  assert.equal(text(gData("data-ai-try-on-main-caption")[0]), "Preview 1 — shirt-first");
  await act(async () => { gPanel.unmount(); });
}

// Option D + Option A fallback: top tuck toggle UI, prompt wiring, waistband helper copy, and reload persistence.
{
  const shirtItem: AiTryOnPreviewableGarment = {
    ...garment("top-shirt", "shirt"),
    label: "Standard Shirt",
    orderDetails: { garments: [{ garmentType: "shirt", optionIds: ["shirt_std_short"], decorations: [] }] },
  };
  const kaftanItem: AiTryOnPreviewableGarment = {
    ...garment("top-kaftan", "kaftan"),
    label: "Long Shirt",
    orderDetails: { garments: [{ garmentType: "kaftan", optionIds: [], decorations: [] }] },
  };
  const beltShortsItem: AiTryOnPreviewableGarment = {
    ...garment("bottom-belt-shorts", "standard_shorts"),
    label: "Shorts (Belt)",
    orderDetails: { garments: [{ garmentType: "standard_shorts", optionIds: ["shorts_std_belt"], decorations: [] }] },
  };
  const elasticShortsItem: AiTryOnPreviewableGarment = {
    ...garment("bottom-elastic-shorts", "standard_shorts"),
    label: "Shorts (Elastic)",
    orderDetails: { garments: [{ garmentType: "standard_shorts", optionIds: ["shorts_std_elastic"], decorations: [] }] },
  };
  const tuckTarget: AiTryOnWearerTarget = {
    wearerId: "w-tuck",
    label: "Tuck Tester",
    inputFingerprint: fp,
    mode: "fabric",
    garmentImageUrl: shirtItem.garmentImageUrl,
    fabricSwatchImageUrl: shirtItem.fabricSwatchImageUrl,
    fitHints: [],
    orderDetails: null,
    previewableGarments: [shirtItem, kaftanItem, beltShortsItem, elasticShortsItem],
  };
  const tuckRequests: AiTryOnGenerationRequest[] = [];
  const tuckSaved = new Map<string, { previewId: string; wearerKey: string; inputFingerprint: string; modelId?: string }>();
  let tPanel!: ReturnType<typeof create>;
  const mountTuckPanel = async (storedList: Array<{ previewId: string; wearerKey: string; inputFingerprint: string; expiresAt: string; modelId?: string }> = []) => {
    tPanel = create(createElement(AiTryOnPhotoPanel, {
      targets: [tuckTarget],
      triesPerOrder: 5,
      initialTriesRemaining: 5,
      jobStore: createAiTryOnBackgroundJobs({ storage: null }),
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      storedPreviews: storedList,
      loadStoredPreview: async (id) => ({ mimeType: "image/webp" as const, data: Buffer.from(id).toString("base64") }),
      requestPreview: async (req) => {
        tuckRequests.push(req);
        const previewId = `tuck-${tuckRequests.length}`;
        tuckSaved.set(req.wearerKey ?? "", { previewId, wearerKey: req.wearerKey ?? "", inputFingerprint: req.inputFingerprint, ...(req.defaultModelId ? { modelId: req.defaultModelId } : {}) });
        return {
          kind: "completed",
          resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId: "order" },
          previewStored: true,
          preview: { mimeType: "image/webp", data: Buffer.from(previewId).toString("base64") },
          orderTriesRemaining: 5 - tuckRequests.length,
        };
      },
      preparePhoto: async () => ({ mimeType: "image/jpeg" as const, data: "/9j/4AAQ" }),
      createThumbnailUrl: () => null,
      revokeThumbnailUrl: () => undefined,
    }));
  };
  await act(async () => { await mountTuckPanel(); });
  const tData = (attr: string, value?: string) =>
    tPanel.root.findAll((node) => typeof node.type === "string" && node.props[attr] !== undefined && (value === undefined || node.props[attr] === value));
  const tGenerate = () => tPanel.root.find((node) => node.type === "button" && /Generate preview|Generate combined outfit|Make a new preview/.test(text(node)));
  // Single garment: Standard Shirt shows toggle; Long Shirt & Shorts hide toggle.
  assert.equal(tData("data-ai-try-on-top-tuck-controls").length, 1);
  assert.equal(tData("data-ai-try-on-top-tuck", "auto")[0].props["aria-checked"], true);
  await act(async () => { tData("data-ai-try-on-garment", "top-kaftan")[0].props.onClick(); });
  assert.equal(tData("data-ai-try-on-top-tuck-controls").length, 0, "Long Shirt hides tuck toggle");
  await act(async () => { tData("data-ai-try-on-garment", "bottom-belt-shorts")[0].props.onClick(); });
  assert.equal(tData("data-ai-try-on-top-tuck-controls").length, 0, "Shorts alone hides tuck toggle");

  // Outfit mode: Shirt + Belt-holder shorts shows Option A helper copy on Auto
  await act(async () => { tData("data-ai-try-on-outfit-mode")[0].props.onClick(); });
  for (const [part, value] of [["top", "top-shirt"], ["bottom", "bottom-belt-shorts"]]) {
    await act(async () => { tData("data-ai-try-on-outfit-choice", part)[0].props.onChange({ target: { value } }); });
  }
  assert.equal(tData("data-ai-try-on-top-tuck-controls").length, 1);
  assert.match(text(tData("data-ai-try-on-top-tuck-note")[0]), /Front-tucked lightly at the waist/);

  // Switching to elastic shorts changes Auto helper copy to untucked signature style
  await act(async () => { tData("data-ai-try-on-outfit-choice", "bottom")[0].props.onChange({ target: { value: "bottom-elastic-shorts" } }); });
  assert.match(text(tData("data-ai-try-on-top-tuck-note")[0]), /Worn untucked outside and over bottoms/);

  // Explicit Tucked override sends topTuckPreference: "tucked"
  await act(async () => { tData("data-ai-try-on-top-tuck", "tucked")[0].props.onClick(); });
  assert.equal(tData("data-ai-try-on-top-tuck", "tucked")[0].props["aria-checked"], true);
  await act(async () => { await tPanel.root.find((node) => node.type === "input" && node.props.type === "file").props.onChange({ target: { files: [file] } }); });
  await act(async () => { await tGenerate().props.onClick(); });
  assert.equal(tuckRequests[0].topTuckPreference, "tucked");
  // Summary keeps tucked outfit preview
  assert.equal(selectAiTryOnOrderPreviews(aiTryOnOrderPreviewTargets([tuckTarget]), [...tuckSaved.values()]).length, 1);

  // Toggling to Untucked marks preview stale
  await act(async () => { tData("data-ai-try-on-top-tuck", "untucked")[0].props.onClick(); });
  assert.equal(tData("data-ai-try-on-outfit-preview-stale").length, 1);

  await act(async () => { tPanel.unmount(); });

  // Reloading restores the tucked preference & preview cleanly
  await act(async () => {
    await mountTuckPanel([...tuckSaved.values()].map((e) => ({ ...e, expiresAt: "2026-12-01T00:00:00Z" })));
  });
  await act(async () => { tData("data-ai-try-on-outfit-mode")[0].props.onClick(); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.equal(tData("data-ai-try-on-top-tuck", "tucked")[0].props["aria-checked"], true, "reload restores tucked selection");
  assert.equal(tPanel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:")).length, 1, "reload restores tucked preview");
  await act(async () => { tPanel.unmount(); });
}

const wearer = (id: string, label: string, list: AiTryOnPreviewableGarment[]): AiTryOnWearerTarget => ({
  ...target, wearerId: id, label, previewableGarments: list,
});
const janeBottoms = wearer("w-jane", "Jane", [garment("skirt", "skirt"), garment("shorts", "standard_shorts"), garment("gown", "dress")]);
assert.deepEqual(getAiTryOnOutfitEligibility(janeBottoms), {
  eligible: false,
  reason: "missing_top",
  helperMessage: "Combined outfit previews require 1 top and 1 bottom. Add a top for Jane to unlock combined previews.",
});
assert.equal(getAiTryOnOutfitEligibility(wearer("w-obi", "Obi", [garment("shirt-a", "shirt"), garment("shirt-b", "kaftan")])).reason, "missing_bottom");
assert.match(getAiTryOnOutfitEligibility(wearer("w-obi", "Obi", [garment("shirt-a", "shirt"), garment("shirt-b", "kaftan")])).helperMessage || "", /Add a bottom for Obi/);
assert.equal(getAiTryOnOutfitEligibility(wearer("w-ada", "Ada", [garment("dress-a", "dress"), garment("gown", "full_length_gown")])).reason, "dresses_only");
assert.equal(getAiTryOnOutfitEligibility(wearer("w-ada", "Ada", [garment("dress-a", "dress"), garment("gown", "full_length_gown")])).helperMessage, "Combined outfit previews pair a separate top and bottom. Dresses are standalone full outfits.");
assert.deepEqual(getAiTryOnOutfitEligibility(wearer("w-ada", "Ada", [garment("agbada-a", "agbada"), garment("agbada-b", "agbada")])), {
  eligible: false,
  reason: "standalone_only",
  helperMessage: "Combined outfit previews pair a separate top and bottom. Full-outfit garments are previewed on their own.",
});
assert.equal(getAiTryOnOutfitEligibility(wearer("w-ada", "Ada", [garments[0]])).reason, "single_garment");
assert.equal(getAiTryOnOutfitEligibility(target).eligible, true);
assert.equal(getAiTryOnOutfitEligibility(wearer("w-ada", "Ada", [garments[3], garments[2]])).reason, "missing_top");

const mountWearers = async (wearers: AiTryOnWearerTarget[]) => {
  let view!: ReturnType<typeof create>;
  await act(async () => {
    view = create(createElement(AiTryOnPhotoPanel, {
      ...props,
      targets: wearers,
      jobStore: createAiTryOnBackgroundJobs({ storage: null }),
    }));
  });
  const find = (attribute: string, value?: string) => view.root.findAll((node) =>
    typeof node.type === "string" && node.props[attribute] !== undefined && (value === undefined || node.props[attribute] === value));
  return { view, find };
};
{
  const { view, find } = await mountWearers([target, janeBottoms]);
  assert.equal(find("data-ai-try-on-outfit-mode")[0].props.disabled, undefined);
  assert.match(text(find("data-ai-try-on-outfit-mode")[0]), /Combined outfit · 1 try/);
  await act(async () => { find("data-ai-try-on-outfit-mode")[0].props.onClick(); });
  assert.equal(find("data-ai-try-on-outfit-mode")[0].props["aria-pressed"], true);
  await act(async () => { find("data-wearer-chip", "w-jane")[0].props.onClick(); });
  const combined = find("data-ai-try-on-outfit-mode")[0];
  const callout = find("data-ai-try-on-outfit-eligibility", "missing_top")[0];
  assert.equal(combined.props.disabled, true);
  assert.equal(combined.props["aria-pressed"], false);
  assert.equal(text(combined), "Combined outfit");
  assert.match(combined.props.className, /cursor-not-allowed/);
  assert.match(combined.props.className, /opacity-60/);
  assert.equal(combined.props["aria-describedby"], callout.props.id);
  assert.equal(text(callout), "Combined outfit previews require 1 top and 1 bottom. Add a top for Jane to unlock combined previews.");
  assert.equal(find("data-ai-try-on-single-mode")[0].props["aria-pressed"], true);
  assert.equal(find("data-ai-try-on-outfit-choice").length, 0);
  await act(async () => { view.unmount(); });
}
for (const [list, reason, message] of [
  [[garment("shirt-a", "shirt"), garment("shirt-b", "shirt")], "missing_bottom", "Add a bottom for Ada"],
  [[garment("dress-a", "dress"), garment("dress-b", "dress")], "dresses_only", "Dresses are standalone full outfits."],
] as const) {
  const { view, find } = await mountWearers([wearer("w-ada", "Ada", [...list])]);
  const combined = find("data-ai-try-on-outfit-mode")[0];
  const callout = find("data-ai-try-on-outfit-eligibility", reason)[0];
  assert.equal(find("data-ai-try-on-outfit-controls").length, 1);
  assert.equal(combined.props.disabled, true);
  assert.equal(find("data-ai-try-on-single-mode")[0].props["aria-pressed"], true);
  assert.equal(combined.props["aria-describedby"], callout.props.id);
  assert.match(text(callout), new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await act(async () => { view.unmount(); });
}

console.log("Combined outfit: snapshots, explicit choices, slot isolation, downstream selection and reload passed");
