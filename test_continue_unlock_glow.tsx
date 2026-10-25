/**
 * Crisp gold ring blink (Option A) on unlocked Continue buttons on every
 * Design Studio step: Continue, Review Order, "Continue without AI Try-on".
 * Only when enabled; never while disabled or locked; never on Back; thin crisp
 * heritage gold with no blur/halo; reduced motion gets a static ring;
 * focus-visible pauses it so the gold focus ring stays readable.
 * The white glow class remains only for the fabric capacity offer's Continue.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import {
  DesignStudioForwardButton,
  DesignStudioStepActions,
  STUDIO_CONTINUE_RING_BLINK_CLASS,
  STUDIO_CONTINUE_UNLOCK_GLOW_CLASS,
  DesignStudioBackButton,
  getStudioContinueUnlockGlow,
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
assert.equal(getStudioContinueUnlockGlow(true).className, STUDIO_CONTINUE_RING_BLINK_CLASS);

// Option A ring.
assert.match(STUDIO_CONTINUE_RING_BLINK_CLASS, /motion-safe:animate-continue-ring-blink/);
assert.match(STUDIO_CONTINUE_RING_BLINK_CLASS, /motion-reduce:continue-ring-static/, "reduced motion: static ring");
assert.match(STUDIO_CONTINUE_RING_BLINK_CLASS, /motion-safe:focus-visible:animate-none/, "focus ring stays readable");

const css = readFileSync("src/index.css", "utf8");
assert.match(css, /--animate-continue-unlock-glow:\s*continue-unlock-glow\b/);
const keyframes = css.match(/@keyframes continue-unlock-glow\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.ok(keyframes, "continue-unlock-glow keyframes exist");
assert.match(keyframes, /rgb\(255 255 255/, "the glow is white");
assert.doesNotMatch(keyframes, /197 168 92/, "the white glow is not gold");

assert.match(css, /--animate-continue-ring-blink:\s*continue-ring-blink 2\.4s step-end infinite/);
const ring = css.match(/@keyframes continue-ring-blink\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.ok(ring, "continue-ring-blink keyframes exist");
assert.match(ring, /0 0 0 2px #fff, 0 0 0 3\.5px var\(--color-heritage-gold\)/, "1.5px gold ring, 2px white gap");
assert.match(ring, /3\.5px transparent/, "blinks off");
for (const shadow of ring.match(/box-shadow:[^;]+;/g) ?? []) {
  // Crisp: every shadow is a pure spread ring (0 0 0 Npx), no blur radius.
  for (const part of shadow.replace("box-shadow:", "").replace(";", "").split(",")) {
    assert.match(part.trim(), /^0 0 0 [\d.]+px /, `no blur/halo: ${part}`);
  }
}
assert.doesNotMatch(css, /studio-nav-gold-beam/, "#1002 beam removed");
const ringStatic = css.match(/@utility continue-ring-static\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(ringStatic, /0 0 0 2px #fff, 0 0 0 3\.5px var\(--color-heritage-gold\)/);

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
  assert.ok(String(button.props.className).includes(STUDIO_CONTINUE_RING_BLINK_CLASS));
  assert.doesNotMatch(String(button.props.className), /animate-continue-unlock-glow/, "not the white glow");
  // Focus ring stays on the button.
  assert.match(String(button.props.className), /focus-visible:ring-heritage-gold/);
};
const glowOff = (button: ReactTestInstance) => {
  assert.equal(button.props["data-continue-unlock-glow"], "off");
  assert.doesNotMatch(String(button.props.className), /animate-continue-unlock-glow|animate-continue-ring-blink|continue-ring-static/);
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
// AI Try-on's skip Continue gets the gold ring; the fabric capacity offer
// deliberately keeps its white glow.
for (const [file, marker, cls] of [
  ["src/components/DormantFutureAiTryOnStep.tsx", "Continue without AI Try-on", /STUDIO_CONTINUE_RING_BLINK_CLASS/],
  ["src/components/FutureRemainingFabricCapacityOffer.tsx", "{REMAINING_FABRIC_CAPACITY_OFFER_CONTINUE}", /STUDIO_CONTINUE_UNLOCK_GLOW_CLASS/],
] as const) {
  const source = readFileSync(file, "utf8");
  const index = source.indexOf(marker);
  const buttonStart = source.lastIndexOf("<button", index);
  const block = source.slice(buttonStart, index);
  assert.match(block, cls, `${marker} glow`);
  assert.match(block, /data-continue-unlock-glow="on"/);
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
      assert.doesNotMatch(String(back.props.className), /animate-continue-unlock-glow|continue-ring|gold-beam/, "Back never beams");
      assert.equal(back.props["data-studio-nav-beam"], undefined);
    }
  }
}

// Back alone: pre-#1002 style, no beam, enabled or disabled.
for (const props of [{ destination: "Fabric", onClick: () => undefined }, { disabled: true }]) {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(createElement(DesignStudioBackButton, props));
  });
  const back = renderer.root.findByType("button");
  assert.doesNotMatch(String(back.props.className), /animate-|continue-ring|gold-beam/);
  assert.match(String(back.props.className), /border-heritage-green\/75 bg-white/);
  assert.match(String(back.props.className), /focus-visible:ring-heritage-gold/);
}

console.log("test_continue_unlock_glow (Option A gold ring blink): PASS");
