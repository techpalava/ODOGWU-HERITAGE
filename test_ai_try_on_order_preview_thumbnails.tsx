/**
 * AI Try-on image placement, PR 1: Summary and Review thumbnails before payment.
 * All mocked: no Gemini, Firebase or network calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import {
  AiTryOnOrderPreviewThumbnails,
  selectAiTryOnOrderPreviews,
} from "./src/components/AiTryOnOrderPreviewThumbnails";
import {
  AI_TRY_ON_ORDER_IMAGE_COPY as COPY,
  AI_TRY_ON_ORDER_IMAGE_COPY_STATUS,
} from "./src/utils/aiTryOnOrderImageCopy";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

assert.equal(AI_TRY_ON_ORDER_IMAGE_COPY_STATUS, "DRAFT", "wording stays DRAFT until Xavier approves it");

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
  { kind: "fresh", wearerId: "w-me", label: "For me", previewId: "tryon-me", onModel: false },
  { kind: "stale", wearerId: "w-ada", label: "Ada" },
  { kind: "fresh", wearerId: "w-obi", label: "Obi", previewId: "tryon-obi", onModel: true },
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

// 3. An image that can't load is left out (no broken picture).
let failing!: ReturnType<typeof create>;
await act(async () => {
  failing = create(createElement(AiTryOnOrderPreviewThumbnails, { entries: entries.slice(0, 1), loadImage: async () => null, onMakeNew: () => {} }));
  await flush();
});
assert.equal(failing.root.findAll((node) => node.type === "img").length, 0);

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
assert.match(studio, /\(futureStageId === "summary" \|\| futureStageId === "payment"\) &&\s+\(aiTryOnGatewayAvailable \|\|\s+futureAiTryOnWorkflow\.status === "completed" \|\|\s+futureAiTryOnWorkflow\.status === "stale"\) &&\s+!futurePaymentReviewConfirmed/);
assert.match(studio, /onMakeNew=\{openAiTryOnForWearer\}/);
const review = readFileSync("src/components/DormantFuturePaymentReviewStep.tsx", "utf8");
assert.match(review, /showAiTryOnPreviews = Boolean\(aiTryOnOrderPreviews\) && payment\?\.status !== "confirmed"/);
const panel = readFileSync("src/components/AiTryOnPhotoPanel.tsx", "utf8");
assert.match(panel, /alt=\{`AI try-on preview for \$\{target\.label\}`\}/, "the AI Try-on step keeps its own result image");

console.log("PASS: AI Try-on order preview thumbnails (fresh, out of date, on our model, wiring)");
