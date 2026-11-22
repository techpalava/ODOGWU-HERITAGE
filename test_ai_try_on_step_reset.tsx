/**
 * The AI Try-on step shows the existing reset control only after the same
 * admin eligibility check resolves true, then refreshes the counts in place.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { AiTryOnPhotoPanel, AI_TRY_ON_MESSAGES } from "./src/components/AiTryOnPhotoPanel";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";

const garment = Object.freeze({
  garmentKey: "shirt:a",
  garmentType: "shirt" as const,
  sourceKind: "catalog" as const,
  label: "Standard Shirt",
  garmentImageUrl: "https://example.test/design-a.jpg",
  fabricSwatchImageUrl: "https://example.test/fabric-a.jpg",
  fabricColorHex: null,
  orderDetails: null,
  inputFingerprint: "tryon-v1-shirtaaaaaaaaa",
});

const target: AiTryOnWearerTarget = {
  wearerId: "you",
  label: "You",
  inputFingerprint: garment.inputFingerprint,
  mode: "fabric",
  garmentImageUrl: garment.garmentImageUrl,
  fabricSwatchImageUrl: garment.fabricSwatchImageUrl,
  previewableGarments: [garment],
  fitHints: [],
  orderDetails: null,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const render = async (props: {
  eligible?: boolean;
  pending?: ReturnType<typeof deferred<{ eligible: boolean }>>;
  reset?: () => Promise<boolean>;
}) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [target],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 0,
      initialAccountTriesRemaining: 2,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      readResetStatus: () => props.pending ? props.pending.promise : Promise.resolve({ eligible: props.eligible === true }),
      resetOwnTries: props.reset ?? (async () => true),
    }));
  });
  return renderer;
};

const body = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll((node) => node.type === "button" && node.children?.includes(label))[0];

{
  const pending = deferred<{ eligible: boolean }>();
  const renderer = await render({ pending });
  assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-reset-tries": "true" }).length, 0);
  assert.equal(body(renderer).includes("Reset my AI try-on tries"), false);
  await act(async () => { pending.resolve({ eligible: false }); });
  assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-reset-tries": "true" }).length, 0);
}

{
  const renderer = await render({ eligible: false });
  assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-reset-tries": "true" }).length, 0);
  assert.equal(body(renderer).includes("Reset my AI try-on tries"), false);
}

{
  let resetCalls = 0;
  const renderer = await render({
    eligible: true,
    reset: async () => { resetCalls += 1; return true; },
  });
  assert.match(body(renderer), /You've used all 5 AI Try-on previews/);
  assert.equal(body(renderer).includes(AI_TRY_ON_MESSAGES.outOfPreviews), true);
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model-option": true }).props.onClick();
  });
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model": "male-1-light" }).props.onClick();
  });
  assert.equal(renderer.root.findByProps({ "data-ai-try-on-generate": true }).props.disabled, true);
  await act(async () => { button(renderer, "Reset my AI try-on tries").props.onClick(); });
  assert.match(body(renderer), /Reset your own tries now\?/);
  await act(async () => { button(renderer, "Confirm reset").props.onClick(); });
  assert.equal(resetCalls, 1);
  const generate = renderer.root.findByProps({ "data-ai-try-on-generate": true });
  assert.equal(generate.props.disabled, false);
  assert.match(body(renderer), /5 tries left/);
  assert.equal(body(renderer).includes(AI_TRY_ON_MESSAGES.outOfPreviews), false);
}

{
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [target],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 3,
      initialAccountTriesRemaining: 8,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      readResetStatus: async () => ({ eligible: true }),
      resetOwnTries: async () => true,
    }));
  });
  assert.ok(button(renderer, "Reset my AI try-on tries"), "eligible users see the control before they run out");
  assert.equal(body(renderer).includes(AI_TRY_ON_MESSAGES.outOfPreviews), false);
}

console.log("ai try-on step reset passed");
