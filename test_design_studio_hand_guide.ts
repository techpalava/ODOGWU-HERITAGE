import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESIGN_STUDIO_TEN_STAGE_FOUNDATION } from "./src/utils/designSourceJourney";
import {
  CONTINUE_UNLOCKED_SELECTOR,
  computeHandGuidePlacement,
  findPrioritizedHandGuideElement,
  getHandGuideHintForElement,
  resolveHandGuideTarget,
  shouldSuppressHandGuide,
  shouldTriggerFarCursor,
} from "./src/utils/designStudioHandGuide";

describe("designStudioHandGuide target resolution", () => {
  it("returns a HandGuideTarget for each of the 10 stages", () => {
    assert.equal(DESIGN_STUDIO_TEN_STAGE_FOUNDATION.length, 10);
    for (const stage of DESIGN_STUDIO_TEN_STAGE_FOUNDATION) {
      const target = resolveHandGuideTarget(stage.id);
      assert.ok(target.selectors.length > 0, `Stage ${stage.id} should have selectors`);
      assert.ok(target.hint.length > 0, `Stage ${stage.id} should have a hint`);
    }
  });

  it("orders selectors in strict priority for garment_type, fabric, design_style, measurement, shipping, payment", () => {
    assert.deepEqual(resolveHandGuideTarget("garment_type").selectors, [
      '[data-hand-guide-target="garment-type-select"]',
      '[data-hand-guide-target="garment-type-audience"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.deepEqual(resolveHandGuideTarget("fabric").selectors, [
      '[data-hand-guide-target="fabric-select"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.deepEqual(resolveHandGuideTarget("design_style").selectors, [
      '[data-hand-guide-target="design-style-select"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.deepEqual(resolveHandGuideTarget("measurement").selectors, [
      '[data-hand-guide-target="measurement-standard-size"]',
      '[data-hand-guide-target="measurement-required-field"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.deepEqual(resolveHandGuideTarget("shipping").selectors, [
      '[data-hand-guide-target="shipping-required-field"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.deepEqual(resolveHandGuideTarget("payment").selectors, [
      '[data-hand-guide-target="payment-terms-checkbox"]',
      '[data-hand-guide-target="payment-pay-button"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
  });

  it("explains optional/prefilled steps can be adjusted below or continued", () => {
    const fabricTarget = resolveHandGuideTarget("fabric");
    assert.equal(
      getHandGuideHintForElement(fabricTarget, true),
      "Ready — adjust below or continue",
    );
    const additionsTarget = resolveHandGuideTarget("personalized_additions");
    assert.equal(additionsTarget.isContinue, true);
    assert.ok(additionsTarget.hint.toLowerCase().includes("below or continue"));

    const tryOnTarget = resolveHandGuideTarget("try_on");
    assert.equal(tryOnTarget.isContinue, true);
    assert.ok(tryOnTarget.hint.toLowerCase().includes("below or continue"));
  });

  it("findPrioritizedHandGuideElement respects selector priority over DOM order", () => {
    const continueEl = { id: "continue" } as unknown as HTMLElement;
    const selectEl = { id: "select" } as unknown as HTMLElement;

    const picked = findPrioritizedHandGuideElement(
      ['[data-hand-guide-target="garment-type-select"]', CONTINUE_UNLOCKED_SELECTOR],
      (selector) => {
        if (selector === CONTINUE_UNLOCKED_SELECTOR) return [continueEl];
        if (selector === '[data-hand-guide-target="garment-type-select"]') return [selectEl];
        return [];
      },
      () => true,
    );
    assert.equal(picked, selectEl);

    const skippedHidden = findPrioritizedHandGuideElement(
      ['[data-hand-guide-target="garment-type-select"]', CONTINUE_UNLOCKED_SELECTOR],
      (selector) => {
        if (selector === CONTINUE_UNLOCKED_SELECTOR) return [continueEl];
        if (selector === '[data-hand-guide-target="garment-type-select"]') return [selectEl];
        return [];
      },
      (el) => el !== selectEl,
    );
    assert.equal(skippedHidden, continueEl);
  });

  it("shouldSuppressHandGuide returns false for all stages", () => {
    for (const stage of DESIGN_STUDIO_TEN_STAGE_FOUNDATION) {
      assert.equal(shouldSuppressHandGuide(stage.id), false);
    }
  });
});

describe("viewport-edge flip and off-screen geometry", () => {
  const viewport = { width: 1280, height: 720 };

  it("places hand below-right when space permits", () => {
    const placement = computeHandGuidePlacement(
      { top: 180, left: 200, right: 320, bottom: 220, width: 120, height: 40 },
      viewport,
    );
    assert.equal(placement.mode, "anchored");
    if (placement.mode === "anchored") {
      assert.equal(placement.anchor, "below-right");
      assert.ok(placement.x > 300);
      assert.ok(placement.y > 210);
    }
  });

  it("flips to above-left when target is near right or bottom edge", () => {
    const rightEdge = computeHandGuidePlacement(
      { top: 400, left: 1120, right: 1265, bottom: 444, width: 145, height: 44 },
      viewport,
    );
    assert.equal(rightEdge.mode, "anchored");
    if (rightEdge.mode === "anchored") {
      assert.equal(rightEdge.anchor, "above-left");
    }

    const bottomEdge = computeHandGuidePlacement(
      { top: 650, left: 500, right: 660, bottom: 695, width: 160, height: 45 },
      viewport,
    );
    assert.equal(bottomEdge.mode, "anchored");
    if (bottomEdge.mode === "anchored") {
      assert.equal(bottomEdge.anchor, "above-left");
    }
  });

  it("returns off-screen mode with up/down direction when scrolled out of viewport", () => {
    const above = computeHandGuidePlacement(
      { top: -140, left: 200, right: 360, bottom: -90, width: 160, height: 50 },
      viewport,
    );
    assert.deepEqual(above, { mode: "off-screen", direction: "up" });

    const below = computeHandGuidePlacement(
      { top: 820, left: 200, right: 360, bottom: 870, width: 160, height: 50 },
      viewport,
    );
    assert.deepEqual(below, { mode: "off-screen", direction: "down" });
  });
});

describe("far-cursor trigger hysteresis", () => {
  it("triggers only for fine pointers >280px away for >=3500ms without moving closer", () => {
    assert.equal(
      shouldTriggerFarCursor({
        distancePx: 320,
        previousDistancePx: 320,
        elapsedFarMs: 3500,
        isFinePointer: true,
      }),
      true,
    );
    assert.equal(
      shouldTriggerFarCursor({
        distancePx: 320,
        previousDistancePx: 320,
        elapsedFarMs: 3500,
        isFinePointer: false,
      }),
      false,
    );
    assert.equal(
      shouldTriggerFarCursor({
        distancePx: 260,
        previousDistancePx: 260,
        elapsedFarMs: 5000,
        isFinePointer: true,
      }),
      false,
    );
    assert.equal(
      shouldTriggerFarCursor({
        distancePx: 310,
        previousDistancePx: 350,
        elapsedFarMs: 4000,
        isFinePointer: true,
      }),
      false,
    );
  });
});
