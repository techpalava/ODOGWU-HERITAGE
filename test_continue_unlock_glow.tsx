/**
 * Gold beam on enabled Design Studio step navigation (Back, Continue, Review
 * Order) on every step. Beam only when enabled; never while disabled or
 * locked; heritage gold token; reduced motion gets a static gold ring;
 * focus-visible pauses it so the gold focus ring stays legible.
 * The white glow class remains only for the fabric capacity offer's Continue.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DesignStudioForwardButton,
  DesignStudioStepActions,
  STUDIO_CONTINUE_UNLOCK_GLOW_CLASS,
  STUDIO_NAV_GOLD_BEAM_CLASS,
  DesignStudioBackButton,
  getStudioContinueUnlockGlow,
  getStudioNavGoldBeam,
} from "./src/components/DesignStudioBackButton";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// --- Shared class and CSS ---------------------------------------------------
assert.match(STUDIO_CONTINUE_UNLOCK_GLOW_CLASS, /motion-safe:animate-continue-unlock-glow/);
assert.match(STUDIO_CONTINUE_UNLOCK_GLOW_CLASS, /motion-reduce:shadow-\[[^\]]*rgb\(255_255_255/,
  "reduced motion: static soft white ring");
assert.match(STUDIO_CONTINUE_UNLOCK_GLOW_CLASS, /focus-visible:animate-none/,
  "pulse pauses on keyboard focus so the gold focus ring is legible");
assert.doesNotMatch(STUDIO_CONTINUE_UNLOCK_GLOW_CLASS, /gold|197_168_92/);
assert.deepEqual(getStudioContinueUnlockGlow(false), {
  className: "",
  "data-continue-unlock-glow": "off",
});
assert.equal(getStudioContinueUnlockGlow(true).className, STUDIO_CONTINUE_UNLOCK_GLOW_CLASS);

const css = readFileSync("src/index.css", "utf8");
assert.match(css, /--animate-continue-unlock-glow:\s*continue-unlock-glow\b/);
const keyframes = css.match(/@keyframes continue-unlock-glow\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.ok(keyframes, "continue-unlock-glow keyframes exist");
assert.match(keyframes, /rgb\(255 255 255/, "the glow is white");
assert.doesNotMatch(keyframes, /197 168 92/, "the glow is not gold");

// Gold beam for step navigation.
assert.match(STUDIO_NAV_GOLD_BEAM_CLASS, /motion-safe:animate-studio-nav-gold-beam/);
assert.match(STUDIO_NAV_GOLD_BEAM_CLASS, /motion-reduce:studio-nav-gold-beam-static/,
  "reduced motion: static gold ring");
assert.match(STUDIO_NAV_GOLD_BEAM_CLASS, /motion-safe:focus-visible:animate-none/);
assert.deepEqual(getStudioNavGoldBeam(false), { className: "", "data-studio-nav-beam": "off" });
assert.equal(getStudioNavGoldBeam(true).className, STUDIO_NAV_GOLD_BEAM_CLASS);
assert.match(css, /--animate-studio-nav-gold-beam:\s*studio-nav-gold-beam\b/);
const goldKeyframes = css.match(/@keyframes studio-nav-gold-beam\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.ok(goldKeyframes, "studio-nav-gold-beam keyframes exist");
assert.match(goldKeyframes, /var\(--color-heritage-gold\)/, "beam uses the heritage gold token");
assert.doesNotMatch(goldKeyframes, /rgb\(255 255 255/, "beam is not white");
assert.doesNotMatch(goldKeyframes, /#[0-9a-f]{3,8}\b/i, "no new hex colour");
const goldStatic = css.match(/@utility studio-nav-gold-beam-static\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(goldStatic, /var\(--color-heritage-gold\)/);
assert.match(css, /--color-heritage-gold:\s*#C5A85C/i, "token unchanged");

// --- Shared forward button states -------------------------------------------
const renderForward = async (props: Parameters<typeof DesignStudioForwardButton>[0]) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(DesignStudioForwardButton, props));
  });
  return renderer.root.findByType("button");
};
const glowOn = (button: ReactTestInstance) => {
  assert.equal(button.props["data-continue-unlock-glow"], "on");
  assert.equal(button.props["data-studio-nav-beam"], "gold");
  assert.ok(String(button.props.className).includes(STUDIO_NAV_GOLD_BEAM_CLASS));
  assert.doesNotMatch(String(button.props.className), /animate-continue-unlock-glow/, "not the white glow");
  // Focus ring stays on the button.
  assert.match(String(button.props.className), /focus-visible:ring-heritage-gold/);
};
const glowOff = (button: ReactTestInstance) => {
  assert.equal(button.props["data-continue-unlock-glow"], "off");
  assert.equal(button.props["data-studio-nav-beam"], "off");
  assert.doesNotMatch(String(button.props.className), /animate-continue-unlock-glow|animate-studio-nav-gold-beam/);
};

glowOn(await renderForward({ destination: "Fabric", onClick: () => undefined }));
glowOff(await renderForward({ destination: "Fabric", disabled: true }));
glowOff(await renderForward({ destination: "Custom Details", disabled: true, locked: true }));
glowOff(
  await renderForward({
    destination: "Summary",
    disabled: true,
    locked: true,
    onLockedClick: () => undefined,
  }),
);
glowOn(await renderForward({ label: "Review Order", icon: "package", onClick: () => undefined }));
glowOff(await renderForward({ label: "Review Order", icon: "lock", disabled: true, locked: true, onLockedClick: () => undefined }));

// --- Every step's Continue goes through the shared forward button -----------
// Steps 1-10 (Payment Review has no Continue: its step actions are Back only).
const stepFiles: Array<[string, string, RegExp[]]> = [
  ["1 Garment Type", "src/components/GarmentTypeStep.tsx", [/destination: "Fabric"[\s\S]*?disabled: continueDisabled/, /data-testid="future-garment-type-continue-action"/]],
  ["2 Fabric", "src/components/DormantFutureFabricStep.tsx", [/destination: "Design Style"/, /future-fabric-continue-action/]],
  ["3 Design Style", "src/components/DormantFutureDesignStyleStep.tsx", [/disabled: !exactSetComplete,\s*locked: !exactSetComplete/, /future-design-style-continue-action/]],
  ["4/5 Custom Details + Personalized Additions", "src/components/DormantFutureCustomDetailsStep.tsx", [/disabled: !canContinue,\s*locked: !canContinue/]],
  ["6 AI Try-on", "src/components/DormantFutureAiTryOnStep.tsx", [/locked: !\(workflow\.status === "completed" \|\| workflow\.status === "skipped"\)/]],
  ["7 Measurement", "src/components/DormantFutureMeasurementStep.tsx", [/disabled: !canContinueToSummary,\s*locked: !canContinueToSummary/]],
  ["8 Summary", "src/components/DormantFutureSummaryStep.tsx", [/disabled: !canContinueToShipping,\s*locked: !canContinueToShipping/]],
  ["9 Delivery & Pickup", "src/components/DormantFutureShippingStep.tsx", [/label: "Review Order"[\s\S]*?disabled: !reviewReady,\s*locked: !reviewReady/]],
];
for (const [step, file, patterns] of stepFiles) {
  const source = readFileSync(file, "utf8");
  const forwardCount = (source.match(/<DesignStudioStepActions\b[\s\S]*?\/>/g) ?? []).filter((block) =>
    /forward=\{/.test(block),
  ).length;
  assert.ok(forwardCount >= 1, `${step}: Continue uses the shared step actions`);
  for (const pattern of patterns) assert.match(source, pattern, `${step}: ${pattern}`);
}
const payment = readFileSync("src/components/DormantFuturePaymentReviewStep.tsx", "utf8");
assert.equal(
  (payment.match(/<DesignStudioStepActions\b[\s\S]*?\/>/g) ?? []).some((block) => /forward=/.test(block)),
  false,
  "10 Payment Review: no Continue in its step actions",
);

// Extra Continue-style next-step buttons outside the shared row.
// AI Try-on's skip Continue is step navigation: gold. The fabric capacity
// offer is deliberately left on its existing white glow.
for (const [file, marker, cls] of [
  ["src/components/DormantFutureAiTryOnStep.tsx", "Continue without AI Try-on", /STUDIO_NAV_GOLD_BEAM_CLASS/],
  ["src/components/FutureRemainingFabricCapacityOffer.tsx", "Continue to Design Style", /STUDIO_CONTINUE_UNLOCK_GLOW_CLASS/],
] as const) {
  const source = readFileSync(file, "utf8");
  const index = source.indexOf(marker);
  const buttonStart = source.lastIndexOf("<button", index);
  const block = source.slice(buttonStart, index);
  assert.match(block, cls, `${marker} glow`);
  assert.match(block, /data-continue-unlock-glow="on"/);
}

// Back button: gold beam when enabled, none when disabled (Garment Type).
{
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(DesignStudioBackButton, { destination: "Fabric", onClick: () => undefined }));
  });
  const back = renderer.root.findByType("button");
  assert.equal(back.props["data-studio-nav-beam"], "gold");
  assert.ok(String(back.props.className).includes(STUDIO_NAV_GOLD_BEAM_CLASS));
  assert.match(String(back.props.className), /focus-visible:ring-heritage-gold/);
  await act(async () => {
    renderer = create(createElement(DesignStudioBackButton, { disabled: true }));
  });
  const disabledBack = renderer.root.findByType("button");
  assert.equal(disabledBack.props["data-studio-nav-beam"], "off");
  assert.doesNotMatch(String(disabledBack.props.className), /animate-studio-nav-gold-beam/);
}

// --- Rendered header + footer rows for each step's gate shape ---------------
const gateShapes = [
  { destination: "Fabric" },
  { destination: "Custom Details", lockedOnly: true },
  { destination: "Summary", onLockedClick: () => undefined },
  { label: "Review Order", onLockedClick: () => undefined },
];
for (const shape of gateShapes) {
  for (const unlocked of [true, false]) {
    for (const slot of ["header", "footer"] as const) {
      let renderer!: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          createElement(DesignStudioStepActions, {
            slot,
            backDestination: "Back",
            onBack: () => undefined,
            forward: {
              destination: shape.destination,
              label: shape.label,
              onClick: () => undefined,
              onLockedClick: shape.onLockedClick,
              disabled: !unlocked,
              locked: !unlocked && (shape.lockedOnly || Boolean(shape.onLockedClick) || Boolean(shape.label)),
            },
          }),
        );
      });
      const forward = renderer.root.findByProps({ "data-studio-nav": "forward" });
      const back = renderer.root.findByProps({ "data-studio-nav": "back" });
      (unlocked ? glowOn : glowOff)(forward);
      assert.equal(back.props["data-studio-nav-beam"], "gold", "enabled Back has the gold beam");
      assert.ok(String(back.props.className).includes(STUDIO_NAV_GOLD_BEAM_CLASS));
      assert.doesNotMatch(String(back.props.className), /animate-continue-unlock-glow/, "Back never gets the white glow");
    }
  }
}

console.log("test_continue_unlock_glow (gold step-nav beam): PASS");
