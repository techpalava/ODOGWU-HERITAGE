/**
 * AI Try-on image placement, PR 1: Summary and Review thumbnails before payment.
 * All mocked: no Gemini, Firebase or network calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import {
  AI_TRY_ON_ORDER_IMAGE_CLASS,
  AiTryOnOrderPreviewThumbnails,
  selectAiTryOnOrderPreviews,
} from "./src/components/AiTryOnOrderPreviewThumbnails";
import {
  AI_TRY_ON_ORDER_IMAGE_COPY as COPY,
  AI_TRY_ON_ORDER_IMAGE_COPY_STATUS,
} from "./src/utils/aiTryOnOrderImageCopy";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// Minimal document for the enlarged view's Escape handling (deep check L1).
const keyListeners = new Set<(event: { key: string; preventDefault: () => void }) => void>();
Object.assign(globalThis, {
  document: {
    addEventListener: (type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => { if (type === "keydown") keyListeners.add(listener); },
    removeEventListener: (type: string, listener: (event: { key: string; preventDefault: () => void }) => void) => { if (type === "keydown") keyListeners.delete(listener); },
  },
});
const pressKey = (key: string) => { let prevented = false; for (const listener of [...keyListeners]) listener({ key, preventDefault: () => { prevented = true; } }); return prevented; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(AI_TRY_ON_ORDER_IMAGE_COPY_STATUS, "APPROVED", "wording approved by Xavier (2 Nov 2026)");

const targets = [
  { wearerId: "w-me", label: "For me", inputFingerprint: "fp-me" },
  { wearerId: "w-ada", label: "Ada", inputFingerprint: "fp-ada-new" },
  { wearerId: "w-obi", label: "Obi", inputFingerprint: "fp-obi" },
  { wearerId: "w-uche", label: "Uche", inputFingerprint: "fp-uche" },
];
const previews = [
  { previewId: "tryon-ada", wearerKey: "w-ada", inputFingerprint: "fp-ada-old" },
  { previewId: "tryon-me", wearerKey: "w-me", inputFingerprint: "fp-me" },
  { previewId: "tryon-obi", wearerKey: "w-obi", inputFingerprint: "fp-obi", modelId: "model-1" },
  { previewId: "tryon-gone", wearerKey: "w-removed", inputFingerprint: "fp-x" },
];

// 1. Selection: wearer order, fresh vs out of date, model label, none skipped.
const entries = selectAiTryOnOrderPreviews(targets, previews);
assert.deepEqual(entries, [
  { kind: "fresh", wearerId: "w-me", label: "For me", previewId: "tryon-me", onModel: false, inputFingerprint: "fp-me" },
  { kind: "stale", wearerId: "w-ada", label: "Ada" },
  { kind: "fresh", wearerId: "w-obi", label: "Obi", previewId: "tryon-obi", onModel: true, inputFingerprint: "fp-obi" },
]);
assert.deepEqual(selectAiTryOnOrderPreviews(targets, []), []);

// 2. Render: thumbnails, labels, stale suggestion, Make a new preview.
const loaded: string[] = [];
const made: string[] = [];
const loadImage = async (previewId: string) => {
  loaded.push(previewId);
  return { mimeType: "image/webp", data: "AAAA" };
};
let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(createElement(AiTryOnOrderPreviewThumbnails, { entries, loadImage, onMakeNew: (id) => made.push(id) }));
  await flush();
});
assert.deepEqual(loaded.sort(), ["tryon-me", "tryon-obi"], "only fresh previews are loaded");
const text = JSON.stringify(renderer.toJSON());
assert.ok(text.includes(COPY.thumbnailLabel("For me")));
assert.ok(text.includes(COPY.thumbnailLabelOnModel("Obi")), "default-model previews say 'on our model'");
assert.ok(!text.includes(COPY.thumbnailLabel("Ada")), "an out-of-date preview is never shown as the design");
assert.ok(text.includes(COPY.staleTitle("Ada")));
assert.ok(text.includes(COPY.staleBody));
const imgs = renderer.root.findAll((node) => node.type === "img");
assert.equal(imgs.length, 2);
assert.ok(imgs.every((img) => String(img.props.src).startsWith("data:image/webp;base64,")));
// Large, not a thumbnail: full column width, 2:3, never cropped, max 560px.
assert.ok(imgs.every((img) => img.props.className === AI_TRY_ON_ORDER_IMAGE_CLASS));
for (const token of ["w-full", "aspect-[2/3]", "max-h-[560px]", "object-contain"]) {
  assert.ok(AI_TRY_ON_ORDER_IMAGE_CLASS.split(" ").includes(token), token);
}
assert.equal(AI_TRY_ON_ORDER_IMAGE_CLASS.includes("object-cover"), false);
const makeNew = renderer.root.findAll((node) => node.type === "button" && [node.props.children].flat().includes(COPY.staleAction));
assert.equal(makeNew.length, 1);
await act(async () => { makeNew[0].props.onClick(); });
assert.deepEqual(made, ["w-ada"]);
// Enlarge and close.
const enlarge = renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === COPY.enlarge("For me"));
await act(async () => { enlarge[0].props.onClick(); });
assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-order-preview-enlarged"] !== undefined && node.type === "div").length, 1);
const close = renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === COPY.closeEnlarged);
await act(async () => { close[0].props.onClick(); });
assert.equal(renderer.root.findAll((node) => node.props["data-ai-try-on-order-preview-enlarged"] !== undefined && node.type === "div").length, 0);

// Review & Payment (PR 2): the pre-payment notice sits under the previews; Summary has none.
assert.ok(!text.includes(COPY.savedWithOrderNotice), "no notice unless asked (Summary)");
await act(async () => {
  renderer.update(createElement(AiTryOnOrderPreviewThumbnails, { entries, loadImage, onMakeNew: () => {}, notice: COPY.savedWithOrderNotice }));
  await flush();
});
assert.ok(JSON.stringify(renderer.toJSON()).includes(COPY.savedWithOrderNotice));
let staleOnly!: ReturnType<typeof create>;
await act(async () => {
  staleOnly = create(createElement(AiTryOnOrderPreviewThumbnails, { entries: entries.filter((entry) => entry.kind === "stale"), loadImage, onMakeNew: () => {}, notice: COPY.savedWithOrderNotice }));
  await flush();
});
assert.ok(!JSON.stringify(staleOnly.toJSON()).includes(COPY.savedWithOrderNotice), "no notice when nothing will be saved");

// 3. An image that can't load shows a message and "Try again" (deep check
// M4), never a broken picture; a retry that works shows the image.
let failing!: ReturnType<typeof create>;
let loadCalls = 0;
let loadWorks = false;
const flakyLoad = async () => { loadCalls += 1; if (!loadWorks) return null; return { mimeType: "image/webp", data: "UklGRg==" }; };
const rejectingLoad = async () => { throw new Error("network"); };
await act(async () => {
  failing = create(createElement(AiTryOnOrderPreviewThumbnails, { entries: entries.slice(0, 1), loadImage: flakyLoad, onMakeNew: () => {} }));
  await flush();
});
assert.equal(failing.root.findAll((node) => node.type === "img").length, 0);
const errorBox = failing.root.findAll((node) => node.props["data-ai-try-on-order-preview-error"] !== undefined && node.type === "div");
assert.equal(errorBox.length, 1, "a visible message replaces the missing picture");
assert.equal(errorBox[0].props.role, "status");
assert.ok(JSON.stringify(failing.toJSON()).includes(COPY.loadFailed(entries[0].label)));
const retry = failing.root.findAll((node) => node.props["data-ai-try-on-order-preview-retry"] !== undefined && node.type === "button");
assert.equal(retry.length, 1);
loadWorks = true;
await act(async () => { retry[0].props.onClick(); await flush(); });
assert.equal(loadCalls, 2, "Try again loads the image again");
assert.equal(failing.root.findAll((node) => node.type === "img").length, 1, "the image shows after a successful retry");
await act(async () => {
  failing.update(createElement(AiTryOnOrderPreviewThumbnails, { entries: entries.slice(2, 3), loadImage: rejectingLoad, onMakeNew: () => {} }));
  await flush();
});
assert.equal(failing.root.findAll((node) => node.props["data-ai-try-on-order-preview-error"] !== undefined && node.type === "div").length, 1, "a thrown load error is shown too, not left loading");

// 3b. Enlarged view: Escape closes it; Tab stays inside (deep check L1).
await act(async () => {
  failing.update(createElement(AiTryOnOrderPreviewThumbnails, { entries: entries.slice(0, 1), loadImage: async () => ({ mimeType: "image/webp", data: "UklGRg==" }), onMakeNew: () => {} }));
  await flush();
});
const openButton = failing.root.findAll((node) => node.type === "button" && node.props["aria-label"] === COPY.enlarge(entries[0].label));
await act(async () => { openButton[0].props.onClick(); });
const isOpen = () => failing.root.findAll((node) => node.props["data-ai-try-on-order-preview-enlarged"] !== undefined && node.type === "div").length;
assert.equal(isOpen(), 1);
assert.equal(keyListeners.size, 1, "Escape listener only while open");
assert.equal(pressKey("Tab"), true, "Tab is kept inside the dialog");
assert.equal(isOpen(), 1);
await act(async () => { assert.equal(pressKey("Escape"), true); });
assert.equal(isOpen(), 0, "Escape closes the enlarged preview");
assert.equal(keyListeners.size, 0, "listener removed on close");

// 4. Nothing to show renders nothing.
await act(async () => {
  renderer.update(createElement(AiTryOnOrderPreviewThumbnails, { entries: [], loadImage, onMakeNew: () => {} }));
});
assert.equal(renderer.toJSON(), null);

// 5. Wiring: Summary and Review get the node; Review hides it after payment;
// the AI Try-on step still shows its own result image (unchanged).
const studio = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(studio, /<DormantFutureSummaryStep\s+aiTryOnOrderPreviews=\{aiTryOnOrderPreviewsNode\}/);
assert.match(studio, /<DormantFuturePaymentReviewStep\s+result=\{futurePaymentReviewHandoff\}\s+aiTryOnOrderPreviews=\{aiTryOnOrderPreviewsNode\}/);
assert.match(studio, /\(futureStageId === "summary" \|\| futureStageId === "payment"\) &&\s+\(aiTryOnGatewayAvailable \|\|\s+futureAiTryOnWorkflow\.status === "completed" \|\|\s+futureAiTryOnWorkflow\.status === "stale" \|\|\s+Boolean\(aiTryOnCredentials\.sessionToken\)\) &&\s+!futurePaymentReviewConfirmed/, "a guest's saved session lists previews after a reload onto Summary (L2)");
// M3: a prepared, unpaid order is re-sent the latest previews; the pay path
// waits for that before paying; an empty list never clears before loading.
assert.match(studio, /if \(latestAiTryOnOrderSelections\.length === 0 && !aiTryOnOrderPreviewSummariesLoadedRef\.current\) return;/);
assert.match(studio, /await rememberAiTryOnOrderSelection\(current\.preparation\.orderId\)[\s\S]{0,80}\n\s+if \(prepared\) await handleExecuteFutureOrderV2Payment\(prepared\);/);
assert.match(studio, /onMakeNew=\{openAiTryOnForWearer\}/);
const review = readFileSync("src/components/DormantFuturePaymentReviewStep.tsx", "utf8");
assert.match(review, /showAiTryOnPreviews = Boolean\(aiTryOnOrderPreviews\) && payment\?\.status !== "confirmed"/);
const panel = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
assert.match(panel, /alt=\{`AI try-on preview for \$\{target\.label\}`\}/, "the AI Try-on step keeps its own result image");

console.log("PASS: AI Try-on order preview thumbnails (fresh, out of date, on our model, wiring)");
