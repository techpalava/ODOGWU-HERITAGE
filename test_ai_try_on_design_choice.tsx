/**
 * AI Try-on design photos: the assigned picture stays visible beside the
 * fabric, and clicking it selects that garment for a later manual Generate.
 * No network. Choosing a photo does not generate and does not change the
 * garment object the order already saved.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AiTryOnPhotoPanel } from "./src/components/AiTryOnPhotoPanel";
import { createAiTryOnBackgroundJobs } from "./src/services/aiTryOnBackgroundJobs";
import type { AiTryOnGenerationRequest } from "./src/utils/aiTryOnGatewayContract";
import type { AiTryOnPreviewOutcome } from "./src/services/aiTryOnGateway";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";

const completed = (): AiTryOnPreviewOutcome => ({
  kind: "completed",
  resultReference: {
    kind: "verified_private_try_on_result",
    assetId: "tryon-00000000-0000-4000-8000-000000000001",
    ownerBindingId: "owner",
  },
  preview: { mimeType: "image/webp", data: "AQID" },
  orderTriesRemaining: 3,
  storedPreviewId: null,
});

const garment = (
  garmentKey: string,
  garmentType: "shirt" | "kaftan" | "standard_shorts",
  label: string,
  design: string,
  fabric: string | null,
) => Object.freeze({
  garmentKey,
  garmentType,
  sourceKind: "catalog" as const,
  label,
  garmentImageUrl: design,
  fabricSwatchImageUrl: fabric,
  fabricColorHex: fabric ? null : "#12422c",
  orderDetails: null,
  inputFingerprint: `tryon-v1-${garmentKey.replace(/\W/g, "").padEnd(16, "a").slice(0, 16)}`,
});

const shirtA = garment("shirt:a", "shirt", "Standard Shirt A", "https://example.test/design-a.jpg", "https://example.test/fabric-a.jpg");
const shirtB = garment("shirt:b", "shirt", "Standard Shirt B", "https://example.test/design-b.jpg", "https://example.test/fabric-b.jpg");
const shorts = garment("shorts:1", "standard_shorts", "Standard Nikka Shorts", "https://example.test/design-shorts.jpg", "https://example.test/fabric-shorts.jpg");

const target: AiTryOnWearerTarget = {
  wearerId: "you",
  label: "You",
  inputFingerprint: shirtA.inputFingerprint,
  mode: "fabric",
  garmentImageUrl: shirtA.garmentImageUrl,
  fabricSwatchImageUrl: shirtA.fabricSwatchImageUrl,
  previewableGarments: [shirtA, shirtB, shorts],
  fitHints: [],
  orderDetails: null,
};

const render = async (requests: AiTryOnGenerationRequest[]) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [target],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 4,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      requestPreview: async (request) => {
        requests.push(request);
        return completed();
      },
    }));
  });
  return renderer;
};

const generate = (renderer: ReactTestRenderer) => renderer.root.findByProps({ "data-ai-try-on-generate": true });
const chooseModel = async (renderer: ReactTestRenderer) => {
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model-option": true }).props.onClick();
  });
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model": "male-1-light" }).props.onClick();
  });
};
const designButtons = (renderer: ReactTestRenderer, part: string) =>
  renderer.root.findAll((node) => node.props["data-ai-try-on-design-choice"] === part);

{
  const requests: AiTryOnGenerationRequest[] = [];
  const renderer = await render(requests);
  const first = designButtons(renderer, "garment")[0];
  const second = designButtons(renderer, "garment")[1];
  assert.equal(first.props["aria-checked"], true);
  assert.equal(first.findByProps({ "data-ai-try-on-design-image": "true" }).props.src, shirtA.garmentImageUrl);
  assert.equal(first.findByProps({ "data-ai-try-on-fabric-swatch": "image" }).props.src, shirtA.fabricSwatchImageUrl);
  assert.notEqual(
    first.findByProps({ "data-ai-try-on-design-image": "true" }).props.src,
    first.findByProps({ "data-ai-try-on-fabric-swatch": "image" }).props.src,
  );
  await act(async () => { second.props.onClick(); });
  assert.equal(requests.length, 0, "selecting a design photo does not generate");
  assert.equal(second.props["aria-checked"], true);
  assert.equal(shirtB.garmentImageUrl, "https://example.test/design-b.jpg", "the saved garment reference is unchanged");
  await chooseModel(renderer);
  await act(async () => { await generate(renderer).props.onClick(); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].garmentImageUrl, shirtB.garmentImageUrl);
  assert.equal(requests[0].fabricSwatchImageUrl, shirtB.fabricSwatchImageUrl);
}

{
  const requests: AiTryOnGenerationRequest[] = [];
  const renderer = await render(requests);
  await act(async () => { renderer.root.findByProps({ "data-ai-try-on-outfit-mode": true }).props.onClick(); });
  const tops = () => designButtons(renderer, "top");
  const bottoms = () => designButtons(renderer, "bottom");
  assert.equal(tops().length, 2);
  assert.equal(bottoms().length, 1);
  assert.equal(tops()[1].findByProps({ "data-ai-try-on-design-image": "true" }).props.src, shirtB.garmentImageUrl);
  assert.equal(bottoms()[0].findByProps({ "data-ai-try-on-fabric-swatch": "image" }).props.src, shorts.fabricSwatchImageUrl);
  await act(async () => { tops()[1].props.onClick(); });
  await act(async () => { bottoms()[0].props.onClick(); });
  assert.equal(requests.length, 0, "choosing the outfit photos does not generate");
  assert.equal(tops()[1].props["aria-checked"], true);
  assert.equal(bottoms()[0].props["aria-checked"], true);
  assert.equal(renderer.root.findByProps({ "data-ai-try-on-outfit-choice": "top" }).props.value, "shirt:b");
  await chooseModel(renderer);
  await act(async () => { await generate(renderer).props.onClick(); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].mode, "garment");
  assert.deepEqual(
    requests[0].outfitGarments?.map((item) => item.garmentImageUrl),
    [shirtB.garmentImageUrl, shorts.garmentImageUrl],
  );
  assert.deepEqual(
    requests[0].outfitGarments?.map((item) => item.fabricSwatchImageUrl),
    [shirtB.fabricSwatchImageUrl, shorts.fabricSwatchImageUrl],
  );
}

{
  const requests: AiTryOnGenerationRequest[] = [];
  const broken = { ...shirtA, garmentKey: "shirt:broken", garmentImageUrl: "https://example.test/missing.jpg", label: "Broken photo" };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [{ ...target, previewableGarments: [broken] }],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 4,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      requestPreview: async (request) => {
        requests.push(request);
        return completed();
      },
    }));
  });
  const image = renderer.root.findByProps({ "data-ai-try-on-design-image": "true" });
  await act(async () => { image.props.onError(); });
  assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-design-missing": "true" }).length, 1);
  assert.equal(requests.length, 0);
}

{
  let unavailableCalls = 0;
  let renderer!: ReactTestRenderer;
  const jobStore = createAiTryOnBackgroundJobs();
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [target],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 4,
      jobStore,
      onPreviewCreated: () => undefined,
      onUnavailable: () => { unavailableCalls += 1; },
      requestPreview: async (): Promise<AiTryOnPreviewOutcome> => ({ kind: "unavailable" }),
    }));
  });
  await chooseModel(renderer);
  await act(async () => {
    generate(renderer).props.onClick();
    await Promise.resolve();
    await Promise.resolve();
  });
  assert.equal(unavailableCalls, 1, "a confirmed unavailable generation result leaves the unavailable page");
}

console.log("AI Try-on design choice tests passed");
