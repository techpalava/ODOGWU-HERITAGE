/**
 * The previous "AI Try-on is currently unavailable" page must not stay on
 * screen while a new availability check is still running. A settled
 * unavailable answer still shows that page. Fetch is mocked; nothing is sent.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import { AiTryOnPhotoPanel } from "./src/components/AiTryOnPhotoPanel";
import { fetchAiTryOnAvailability, mapAiTryOnPreviewResponse, type AiTryOnAvailabilityDetails, type AiTryOnPreviewOutcome } from "./src/services/aiTryOnGateway";
import type { AiTryOnGenerationRequest } from "./src/utils/aiTryOnGatewayContract";
import type { AiTryOnWorkflowStateV1 } from "./src/types";
import type { AiTryOnWearerTarget } from "./src/utils/aiTryOnWearerTargets";
import {
  aiTryOnControlsVisible,
  aiTryOnGenerationEnabled,
  resolveAiTryOnStepAvailability,
  useAiTryOnStepAvailability,
} from "./src/utils/aiTryOnStepAvailability";

const fp = "tryon-v1-0123456789abcdef";
const noop = () => {};
const unavailableWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "unavailable",
  inputFingerprint: fp,
};
const failedWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "failed",
  inputFingerprint: fp,
  failure: { code: "processing_failed", retryable: true },
};

const step = (availability: "checking" | "available" | "unavailable", workflow = unavailableWorkflow) =>
  renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow,
      skipAllowed: true,
      onBack: noop,
      onRetry: noop,
      onSkip: noop,
      onContinue: noop,
      availability,
      livePanel: availability === "available" ? createElement("p", null, "Live try-on panel") : undefined,
    }),
  );

assert.equal(resolveAiTryOnStepAvailability({ reported: "unknown", checkInFlight: false }), "checking");
assert.equal(resolveAiTryOnStepAvailability({ reported: "unavailable", checkInFlight: true }), "checking");
assert.equal(resolveAiTryOnStepAvailability({ reported: "unavailable", checkInFlight: false }), "unavailable");
assert.equal(resolveAiTryOnStepAvailability({ reported: "available", checkInFlight: true }), "available");
assert.equal(
  resolveAiTryOnStepAvailability({ reported: "available", checkInFlight: false, inputFingerprintPending: true }),
  "checking",
);

const checking = step("checking");
assert.equal(checking.includes("currently unavailable"), false);
assert.match(checking, /Upload a photo or pick a model/);
assert.match(checking, /Continue without AI Try-on/);

const unavailable = step("unavailable");
assert.match(unavailable, /AI Try-on is currently unavailable/);
assert.match(unavailable, /You can continue with your order without a Try-on preview/);
assert.equal(unavailable.includes("Live try-on panel"), false);
assert.equal(unavailable.includes("type=\"file\""), false);

const failed = step("unavailable", failedWorkflow);
assert.match(failed, /AI Try-on could not be completed/);
assert.match(failed, /Retry/);
assert.equal(failed.includes("AI Try-on is currently unavailable"), false);

const available = step("available");
assert.match(available, /Live try-on panel/);
assert.equal(available.includes("currently unavailable"), false);

const unavailableAnswer: AiTryOnAvailabilityDetails = { status: "unavailable" };
const availableAnswer: AiTryOnAvailabilityDetails = {
  status: "available",
  triesPerOrder: 5,
  orderTriesRemaining: 4,
  accountTriesRemaining: null,
  storedPreviews: [],
  sessionToken: null,
};

const shirtFingerprint = "tryon-v1-aaaaaaaaaaaaaaaa";
const shortsFingerprint = "tryon-v1-bbbbbbbbbbbbbbbb";
const tryOnTarget: AiTryOnWearerTarget = {
  wearerId: "you",
  label: "You",
  inputFingerprint: shirtFingerprint,
  mode: "garment",
  garmentImageUrl: "/ai-try-on-models/male-1-light.webp",
  fabricSwatchImageUrl: null,
  previewableGarments: [
    {
      garmentKey: "shirt:1",
      garmentType: "shirt",
      sourceKind: "catalog",
      label: "Standard Shirt",
      garmentImageUrl: "/ai-try-on-models/male-1-light.webp",
      fabricSwatchImageUrl: null,
      fabricColorHex: null,
      orderDetails: null,
      inputFingerprint: shirtFingerprint,
    },
    {
      garmentKey: "shorts:1",
      garmentType: "standard_shorts",
      sourceKind: "catalog",
      label: "Standard Nikka Shorts",
      garmentImageUrl: "/ai-try-on-models/male-2-medium.webp",
      fabricSwatchImageUrl: null,
      fabricColorHex: null,
      orderDetails: null,
      inputFingerprint: shortsFingerprint,
    },
  ],
  fitHints: [],
  orderDetails: null,
};

const completedPreview = (): AiTryOnPreviewOutcome => ({
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

const Probe = ({
  active,
  load,
  requests,
}: {
  active: boolean;
  load: () => Promise<AiTryOnAvailabilityDetails>;
  requests: AiTryOnGenerationRequest[];
}) => {
  const state = useAiTryOnStepAvailability({ active, reloadKey: "guest", load });
  const availability = resolveAiTryOnStepAvailability({
    reported:
      state.details.status === "available" || state.details.status === "unavailable"
        ? state.details.status
        : "unknown",
    checkInFlight: state.checkInFlight,
  });
  const panel = aiTryOnControlsVisible(availability)
    ? createElement(AiTryOnPhotoPanel, {
        targets: [tryOnTarget],
        triesPerOrder: 5,
        generateEnabled: aiTryOnGenerationEnabled(availability),
        initialTriesRemaining: availability === "available" ? 4 : availability === "unavailable" ? 0 : null,
        onPreviewCreated: () => undefined,
        onUnavailable: () => undefined,
        requestPreview: async (request) => {
          requests.push(request);
          return completedPreview();
        },
      })
    : undefined;
  return createElement(DormantFutureAiTryOnStep, {
    workflow: unavailableWorkflow,
    skipAllowed: true,
    onBack: noop,
    onRetry: noop,
    onSkip: noop,
    onContinue: noop,
    availability,
    livePanel: panel,
  });
};

const generateButton = (renderer: ReactTestRenderer) =>
  renderer.root.findByProps({ "data-ai-try-on-generate": true });

const deferred = () => {
  let settle!: (value: AiTryOnAvailabilityDetails) => void;
  const promise = new Promise<AiTryOnAvailabilityDetails>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

{
  const requests: AiTryOnGenerationRequest[] = [];
  const first = deferred();
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe, { active: true, load: () => first.promise, requests }));
  });
  assert.equal(text(renderer).includes("currently unavailable"), false, "first check does not show the unavailable page");
  assert.match(text(renderer), /Choose a model/);
  assert.match(text(renderer), /Combined outfit/);
  assert.equal(generateButton(renderer).props.disabled, true, "Generate stays disabled while availability is loading");
  assert.equal(requests.length, 0, "opening the step does not generate");
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model-option": true }).props.onClick();
  });
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model": "male-1-light" }).props.onClick();
  });
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-outfit-mode": true }).props.onClick();
  });
  assert.equal(renderer.root.findByProps({ "data-ai-try-on-outfit-choice": "top" }).props.value, "");
  assert.equal(requests.length, 0, "choosing a model and outfit does not generate");
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  assert.equal(requests.length, 0, "Generate does not send while availability is still loading");

  await act(async () => {
    first.settle(unavailableAnswer);
    await first.promise;
  });
  assert.match(text(renderer), /AI Try-on is currently unavailable/, "a settled unavailable answer is shown");
  assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-model-option": true }).length, 0);

  const second = deferred();
  await act(async () => {
    renderer.update(createElement(Probe, { active: false, load: () => second.promise, requests }));
  });
  await act(async () => {
    renderer.update(createElement(Probe, { active: true, load: () => second.promise, requests }));
  });
  assert.equal(
    text(renderer).includes("currently unavailable"),
    false,
    "returning to the step hides the previous unavailable page while the new check runs",
  );
  assert.match(text(renderer), /Choose a model/);
  assert.equal(generateButton(renderer).props.disabled, true);
  assert.equal(requests.length, 0, "re-entry does not generate");

  await act(async () => {
    second.settle(availableAnswer);
    await second.promise;
  });
  assert.equal(text(renderer).includes("currently unavailable"), false);
  assert.equal(generateButton(renderer).props.disabled, true, "a model must still be chosen after availability");
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model-option": true }).props.onClick();
  });
  await act(async () => {
    renderer.root.findByProps({ "data-ai-try-on-model": "male-1-light" }).props.onClick();
  });
  assert.equal(generateButton(renderer).props.disabled, false);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  assert.equal(requests.length, 1, "one explicit Generate sends one request");
  assert.equal(requests[0].defaultModelId, "male-1-light");
}

{
  const requests: AiTryOnGenerationRequest[] = [];
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AiTryOnPhotoPanel, {
      targets: [tryOnTarget],
      triesPerOrder: 5,
      generateEnabled: true,
      initialTriesRemaining: 0,
      onPreviewCreated: () => undefined,
      onUnavailable: () => undefined,
      requestPreview: async (request) => {
        requests.push(request);
        return completedPreview();
      },
    }));
  });
  assert.match(text(renderer), /used all 5 AI Try-on previews/);
  assert.equal(generateButton(renderer).props.disabled, true);
  await act(async () => {
    await generateButton(renderer).props.onClick();
  });
  assert.equal(requests.length, 0, "no tries left does not send a request");
}

{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.match(studioSource, /aiTryOnControlsVisible\(tryOnStepAvailability\)/);
  assert.match(studioSource, /generateEnabled=\{aiTryOnGenerationEnabled\(tryOnStepAvailability\)\}/);
}

{
  const slowUnavailable = deferred();
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe, { active: true, load: () => slowUnavailable.promise, requests: [] }));
  });
  await act(async () => {
    slowUnavailable.settle(unavailableAnswer);
    await slowUnavailable.promise;
  });
  assert.match(text(renderer), /AI Try-on is currently unavailable/);
}

{
  const credentials = { sessionToken: null, getIdToken: async () => null };
  for (const code of ["GLOBAL_LIMIT_REACHED", "NOT_CONFIGURED"] as const) {
    const result = await fetchAiTryOnAvailability({
      credentials,
      fetchImpl: async () => new Response(JSON.stringify({ status: "unavailable", code }), { status: 200 }),
    });
    assert.equal(result.status, "unavailable", code);
    const requests: AiTryOnGenerationRequest[] = [];
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Probe, {
        active: true,
        load: async () => result,
        requests,
      }));
    });
    assert.match(text(renderer), /AI Try-on is currently unavailable/);
    assert.equal(renderer.root.findAllByProps({ "data-ai-try-on-generate": true }).length, 0, `${code} hides Generate`);
    assert.equal(requests.length, 0, `${code} does not generate`);
  }
}

assert.equal(mapAiTryOnPreviewResponse(503, { code: "GLOBAL_LIMIT_REACHED" }).kind, "unavailable");
assert.equal(mapAiTryOnPreviewResponse(503, { code: "NOT_CONFIGURED" }).kind, "unavailable");
assert.equal(mapAiTryOnPreviewResponse(422, { code: "REFERENCE_IMAGE_UNAVAILABLE" }).kind, "failed");
assert.equal(mapAiTryOnPreviewResponse(429, { code: "RATE_LIMITED", retryAfterSeconds: 2 }).kind, "rate_limited");
assert.equal(mapAiTryOnPreviewResponse(429, { code: "ORDER_TRY_LIMIT_REACHED" }).kind, "order_limit_reached");
assert.equal(mapAiTryOnPreviewResponse(429, { code: "ACCOUNT_TRY_LIMIT_REACHED" }).kind, "account_limit_reached");
assert.equal(mapAiTryOnPreviewResponse(500, { code: "STRIPE_LOOKUP_FAILED" }).kind, "failed");
assert.equal(mapAiTryOnPreviewResponse(500, { code: "PROVIDER_FAILED" }).kind, "failed");

console.log("AI Try-on availability loading tests passed");
