/** Combined outfits: explicit choices, identity, snapshots and independent preview slots. No network/AI. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { AiTryOnPhotoPanel, type AiTryOnPhotoPanelProps } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import { aiTryOnOutfitChoices, aiTryOnOutfitTarget, aiTryOnOrderPreviewTargets, type AiTryOnPreviewableGarment, type AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import { AI_TRY_ON_OUTFIT_PROMPT_VERSION, type AiTryOnGenerationRequest, type AiTryOnOutfitGarmentRequest } from "./src/utils/aiTryOnGatewayContract";
import { aiTryOnOutfitPreviewKey } from "./src/utils/aiTryOnWorkflow";
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
assert.equal(AI_TRY_ON_OUTFIT_PROMPT_VERSION, "tryon-outfit-prompt-v1");
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
assert.match(buildAiTryOnOutfitPrompt({ garments: [{ ...promptGarments[0], garmentType: "kaftan" }, promptGarments[1]], onModel: false }), /Chosen top: Long Shirt/);

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
assert.match(JSON.stringify(panel.toJSON()), /Latest combined outfit preview/);
const outfitSrc = panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src;
await click(data("data-ai-try-on-single-mode")[0]);
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src, "data:image/webp;base64," + Buffer.from("tryon-2").toString("base64"), "individual trouser survives");
await click(data("data-ai-try-on-outfit-mode")[0]);
assert.equal(panel.root.findAll((node) => node.type === "img" && String(node.props.src).startsWith("data:"))[0].props.src, outfitSrc, "outfit survives switching");
const entries = selectAiTryOnOrderPreviews(aiTryOnOrderPreviewTargets([target]), [...saved.values()]);
assert.equal(entries.length, 3, "Summary/Review/payment transfer have two individuals plus outfit");
assert.ok(entries.some((entry) => entry.label === "Ada — Combined outfit"));
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
await act(async () => { panel.unmount(); });
for (const list of [[garments[0]], [garment("dress", "dress")], [garments[3], garments[2]]]) {
  await act(async () => { panel = create(createElement(AiTryOnPhotoPanel, { ...props, targets: [{ ...target, previewableGarments: list }], jobStore: createAiTryOnBackgroundJobs({ storage: null }) })); });
  assert.equal(data("data-ai-try-on-outfit-controls").length, 0);
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
console.log("Combined outfit: snapshots, explicit choices, slot isolation, downstream selection and reload passed");
