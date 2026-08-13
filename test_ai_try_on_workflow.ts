import assert from "node:assert/strict";
import type {
  AiTryOnGateway,
  AiTryOnGatewayJobResult,
} from "./src/utils/aiTryOnWorkflow";
import type {
  AiTryOnVerifiedPrivateResultReference,
  FabricAllocation,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  createAiTryOnVisualInputFingerprint,
  createEmptyAiTryOnWorkflowState,
  createUnavailableAiTryOnGateway,
  getAiTryOnWorkflowAllowedActions,
  normalizeAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
  transitionAiTryOnWorkflow,
} from "./src/utils/aiTryOnWorkflow";

const createSelection = (priceCents = 6500): GarmentTypeStepSelection => ({
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: {
      status: "resolved",
      garmentType: "shirt",
      components: [
        {
          componentKey: "shirt:shirt_construction:shirt_standard_short",
          optionId: "shirt_standard_short",
          selectionGroup: "shirt_construction",
          priceCents,
          price: priceCents / 100,
        },
      ],
      totalPriceCents: priceCents,
      totalPrice: priceCents / 100,
    },
  },
});

const allocations: FabricAllocation[] = [
  {
    allocationId: "allocation-runtime-1",
    fabricCode: "FABRIC-A",
    garmentAssignments: [
      {
        garmentKey: "base:shirt",
        code: "shirt",
        garmentType: "shirt",
        fabricUnits: 1,
      },
    ],
  },
];

const fingerprintFor = ({
  priceCents = 6500,
  fabricCode = "FABRIC-A",
  styleId = "style-1",
  optionId = "left_chest",
}: {
  priceCents?: number;
  fabricCode?: string;
  styleId?: string;
  optionId?: string;
} = {}) =>
  createAiTryOnVisualInputFingerprint({
    garmentTypeSelection: createSelection(priceCents),
    fabricAllocations: allocations.map((allocation) => ({
      ...allocation,
      fabricCode,
    })),
    selectedStyleId: styleId,
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { neck_design: optionId },
      },
      snapshotsByGarmentKey: {
        "base:shirt": {
          neck_design: [
            {
              garmentKey: "base:shirt",
              optionId,
              label: "Price and label are deliberately excluded",
              description: "Display-only metadata",
              garmentGroup: "neck",
              selectionGroup: "neck_design",
              priceCents: 1200,
            },
          ],
        },
      },
    },
  });

const fingerprint = fingerprintFor();
assert.match(fingerprint, /^tryon-v1-[a-f0-9]{16}$/);
assert.equal(
  fingerprintFor({ priceCents: 9900 }),
  fingerprint,
  "Price-only construction changes must not invalidate a visual result.",
);
assert.notEqual(fingerprintFor({ fabricCode: "FABRIC-B" }), fingerprint);
assert.notEqual(fingerprintFor({ styleId: "style-2" }), fingerprint);
assert.notEqual(fingerprintFor({ optionId: "right_chest" }), fingerprint);

const empty = createEmptyAiTryOnWorkflowState();
assert.deepEqual(empty, {
  schemaVersion: 1,
  status: "not_started",
  inputFingerprint: null,
});
assert.deepEqual(normalizeAiTryOnWorkflowState(JSON.parse(JSON.stringify(empty))), empty);
assert.equal(normalizeAiTryOnWorkflowState({ schemaVersion: 99 }), null);

const unavailable = reconcileAiTryOnWorkflow({
  state: empty,
  currentInputFingerprint: fingerprint,
  policy: { gatewayAvailable: false, skipAllowed: true },
});
assert.equal(unavailable.status, "unavailable");
assert.deepEqual(
  getAiTryOnWorkflowAllowedActions({ state: unavailable, skipAllowed: true }),
  { canRetry: false, canSkip: true },
);
const ready = reconcileAiTryOnWorkflow({
  state: empty,
  currentInputFingerprint: fingerprint,
  policy: { gatewayAvailable: true, skipAllowed: true },
});
assert.equal(ready.status, "ready");

const invalidStart = transitionAiTryOnWorkflow({
  state: empty,
  event: { type: "start", jobReference: { kind: "resumable_job", jobId: "job-1" } },
  skipAllowed: true,
});
assert.equal(invalidStart.ok, false);
const started = transitionAiTryOnWorkflow({
  state: ready,
  event: { type: "start", jobReference: { kind: "resumable_job", jobId: "job-1" } },
  skipAllowed: true,
});
assert.equal(started.ok, true);
assert.equal(started.ok && started.state.status, "processing");
assert.equal(
  normalizeAiTryOnWorkflowState(started.ok ? started.state : null)?.status,
  "processing",
  "A resumable processing job must survive reload normalization.",
);
assert.equal(
  normalizeAiTryOnWorkflowState({
    schemaVersion: 1,
    status: "processing",
    inputFingerprint: fingerprint,
  })?.failure?.code,
  "interrupted",
);

const invalidCompletion = transitionAiTryOnWorkflow({
  state: started.ok ? started.state : ready,
  event: {
    type: "complete",
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: "https://public.example/result.png",
      ownerBindingId: "owner-1",
    },
  },
  skipAllowed: true,
});
assert.deepEqual(invalidCompletion, {
  ok: false,
  error: { code: "invalid_result_reference" },
});
const resultReference: AiTryOnVerifiedPrivateResultReference = {
  kind: "verified_private_try_on_result",
  assetId: "private-result-1",
  ownerBindingId: "owner-1",
};
const completed = transitionAiTryOnWorkflow({
  state: started.ok ? started.state : ready,
  event: { type: "complete", resultReference },
  skipAllowed: true,
});
assert.equal(completed.ok, true);
assert.equal(completed.ok && completed.state.status, "completed");
assert.equal(
  reconcileAiTryOnWorkflow({
    state: completed.ok ? completed.state : empty,
    currentInputFingerprint: fingerprintFor({ fabricCode: "FABRIC-B" }),
    policy: { gatewayAvailable: true, skipAllowed: true },
  }).status,
  "stale",
);

const failed = transitionAiTryOnWorkflow({
  state: started.ok ? started.state : ready,
  event: { type: "fail", code: { providerPayload: "secret" }, retryable: true },
  skipAllowed: true,
});
assert.equal(failed.ok, true);
assert.deepEqual(failed.ok && failed.state.failure, {
  code: "processing_failed",
  retryable: true,
});
assert.equal(JSON.stringify(failed).includes("providerPayload"), false);
const retry = transitionAiTryOnWorkflow({
  state: failed.ok ? failed.state : ready,
  event: { type: "retry" },
  skipAllowed: true,
});
assert.equal(retry.ok, true);
assert.equal(retry.ok && retry.state.status, "ready");
const nonRetryable = transitionAiTryOnWorkflow({
  state: {
    schemaVersion: 1,
    status: "failed",
    inputFingerprint: fingerprint,
    failure: { code: "provider_rejected", retryable: false },
  },
  event: { type: "retry" },
  skipAllowed: true,
});
assert.equal(nonRetryable.ok, false);
assert.deepEqual(
  getAiTryOnWorkflowAllowedActions({
    state: {
      schemaVersion: 1,
      status: "failed",
      inputFingerprint: fingerprint,
      failure: { code: "provider_rejected", retryable: false },
    },
    skipAllowed: true,
  }),
  { canRetry: false, canSkip: true },
  "The UI must only show retry when the same transition authority permits it.",
);
assert.deepEqual(
  getAiTryOnWorkflowAllowedActions({
    state: started.ok ? started.state : ready,
    skipAllowed: true,
  }),
  { canRetry: false, canSkip: false },
  "Processing must not expose a skip or retry control.",
);
assert.equal(
  transitionAiTryOnWorkflow({
    state: unavailable,
    event: { type: "skip" },
    skipAllowed: false,
  }).ok,
  false,
);
const skipped = transitionAiTryOnWorkflow({
  state: unavailable,
  event: { type: "skip" },
  skipAllowed: true,
});
assert.equal(skipped.ok && skipped.state.status, "skipped");
assert.deepEqual(
  getAiTryOnWorkflowAllowedActions({
    state: skipped.ok ? skipped.state : unavailable,
    skipAllowed: true,
  }),
  { canRetry: false, canSkip: false },
  "A completed skip transition must not offer another skip.",
);
assert.equal(
  reconcileAiTryOnWorkflow({
    state: skipped.ok ? skipped.state : empty,
    currentInputFingerprint: fingerprintFor({ styleId: "another-style" }),
    policy: { gatewayAvailable: false, skipAllowed: true },
  }).status,
  "skipped",
);

const unsafeState = normalizeAiTryOnWorkflowState({
  schemaVersion: 1,
  status: "completed",
  inputFingerprint: fingerprint,
  resultReference: {
    kind: "verified_private_try_on_result",
    assetId: "data:image/png;base64,AAAA",
    ownerBindingId: "owner-1",
  },
  rawPhoto: "blob:customer-photo",
});
assert.equal(unsafeState, null);

const unavailableGateway = createUnavailableAiTryOnGateway();
assert.equal((await unavailableGateway.getAvailability()).status, "unavailable");
assert.equal((await unavailableGateway.start(fingerprint)).status, "unavailable");

const fakeGateway: AiTryOnGateway = {
  getAvailability: async () => ({ status: "available" }),
  start: async (): Promise<AiTryOnGatewayJobResult> => ({
    status: "processing",
    jobReference: { kind: "resumable_job", jobId: "fake-job-1" },
  }),
  resume: async (): Promise<AiTryOnGatewayJobResult> => ({
    status: "completed",
    resultReference,
  }),
};
assert.equal((await fakeGateway.getAvailability()).status, "available");
const fakeStart = await fakeGateway.start(fingerprint);
assert.equal(fakeStart.status, "processing");
assert.equal(
  fakeStart.status === "processing"
    ? (await fakeGateway.resume(fakeStart.jobReference)).status
    : null,
  "completed",
);

console.log("PASS: provider-neutral AI Try-on workflow and privacy boundary");
