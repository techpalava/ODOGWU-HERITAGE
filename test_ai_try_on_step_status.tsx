import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import {
  getAiTryOnWorkflowAllowedActions,
  normalizeAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
  transitionAiTryOnWorkflow,
} from "./src/utils/aiTryOnWorkflow";
import { AI_TRY_ON_RETENTION_NOTICE } from "./src/components/AiTryOnPhotoPanel";
import type { AiTryOnWorkflowStateV1 } from "./src/types";

const fp = "tryon-v1-0123456789abcdef";
const noop = () => {};
const render = (workflow: AiTryOnWorkflowStateV1, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow, skipAllowed: true, onBack: noop, onRetry: noop, onSkip: noop, onContinue: noop, ...extra,
    }),
  );

// 1. Unknown availability never records "unavailable"; a real "false" does.
const pending = reconcileAiTryOnWorkflow({ state: null, currentInputFingerprint: fp, policy: { gatewayAvailable: "unknown", skipAllowed: true } });
assert.equal(pending.status, "ready");
assert.equal(reconcileAiTryOnWorkflow({ state: null, currentInputFingerprint: fp, policy: { gatewayAvailable: false, skipAllowed: true } }).status, "unavailable");
const unavailable: AiTryOnWorkflowStateV1 = { schemaVersion: 1, status: "unavailable", inputFingerprint: fp };
assert.ok(!render(unavailable, { availability: "checking" }).includes("currently unavailable"));
assert.ok(!render(unavailable, { availability: "available" }).includes("currently unavailable"));
assert.ok(render(unavailable, { availability: "unavailable" }).includes("AI Try-on is currently unavailable"));
assert.ok(render(unavailable, { availability: "checking" }).includes("Continue without AI Try-on"), "skip stays visible");

// 2. Input needed only when something is missing, and it names it.
const awaiting: AiTryOnWorkflowStateV1 = { schemaVersion: 1, status: "awaiting_input", inputFingerprint: null };
const named = render(awaiting, { missingInputs: ["Design Style", "Custom Details"] });
assert.ok(named.includes("Input needed") && named.includes("Finish Design Style and Custom Details before using AI Try-on."));
assert.ok(!render(awaiting, { missingInputs: [] }).includes("Input needed"));
assert.ok(!render(awaiting, { missingInputs: ["Custom Details"], availability: "checking" }).includes("Input needed"));
assert.ok(!named.includes("Complete the preceding design choices"));

// 3. Continuing while a preview generates is not a customer skip.
const ready: AiTryOnWorkflowStateV1 = { schemaVersion: 1, status: "ready", inputFingerprint: fp };
const passed = transitionAiTryOnWorkflow({ state: ready, event: { type: "skip", whileGenerating: true }, skipAllowed: true });
assert.ok(passed.ok);
if (passed.ok) {
  assert.equal(passed.state.skipOrigin, "continued_while_generating");
  assert.deepEqual(normalizeAiTryOnWorkflowState(JSON.parse(JSON.stringify(passed.state))), passed.state, "survives a reload");
  const html = render(passed.state);
  assert.ok(!html.includes("You chose to continue without AI Try-on"));
  assert.ok(html.includes("Continue without AI Try-on"), "explicit skip still offered");
  assert.equal(getAiTryOnWorkflowAllowedActions({ state: passed.state, skipAllowed: true }).canSkip, true);
  const chosen = transitionAiTryOnWorkflow({ state: passed.state, event: { type: "skip" }, skipAllowed: true });
  assert.ok(chosen.ok && chosen.state.skipOrigin === undefined);
}
const chosen = transitionAiTryOnWorkflow({ state: ready, event: { type: "skip" }, skipAllowed: true });
assert.ok(chosen.ok && render(chosen.state).includes("You chose to continue without AI Try-on."));
assert.equal(reconcileAiTryOnWorkflow({ state: null, currentInputFingerprint: fp, policy: { gatewayAvailable: true, skipAllowed: true } }).status, "ready", "never skipped by itself");

// 4. A real failure shows its error with Retry and Continue without AI Try-on.
const failed: AiTryOnWorkflowStateV1 = { schemaVersion: 1, status: "failed", inputFingerprint: fp, failure: { code: "processing_failed", retryable: true } };
const failedHtml = render(failed);
assert.ok(failedHtml.includes("AI Try-on could not be completed") && failedHtml.includes("Retry") && failedHtml.includes("Continue without AI Try-on"));
assert.ok(!render(ready).includes("could not be completed"));

// 5. Retention line wording.
assert.equal(AI_TRY_ON_RETENTION_NOTICE, "We use your photo only to make the try-on preview for this order. Photos are kept with the order until it's completed, then deleted.");
console.log("AI Try-on step status tests passed");
