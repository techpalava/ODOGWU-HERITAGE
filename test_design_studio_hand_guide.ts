import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESIGN_STUDIO_TEN_STAGE_FOUNDATION } from "./src/utils/designSourceJourney";
import {
  CONTINUE_UNLOCKED_SELECTOR,
  MODAL_CHECKBOX_SELECTOR,
  MODAL_PRIMARY_SELECTOR,
  computeHandGuidePlacement,
  findPrioritizedHandGuideElement,
  findPrioritizedHandGuideElements,
  getHandGuideHintForElement,
  resolveHandGuideTarget,
  resolveModalHandGuideTarget,
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

  it("orders selectors in strict priority for measurement, shipping, payment", () => {
    const measurement = resolveHandGuideTarget("measurement");
    assert.equal(measurement.hint, "Select a measurement option");
    assert.deepEqual(measurement.selectors, [
      '[data-hand-guide-target="measurement-option-group"]',
      '[data-hand-guide-target="measurement-required-field"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
    assert.equal(
      getHandGuideHintForElement(measurement, false, '[data-hand-guide-target="measurement-required-field"]'),
      "Enter required measurement",
    );

    const shipping = resolveHandGuideTarget("shipping");
    assert.equal(shipping.hint, "Choose delivery or pickup");
    assert.deepEqual(shipping.selectors, [
      '[data-hand-guide-target="shipping-delivery-option"]',
      '[data-hand-guide-target="shipping-required-field"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);

    assert.deepEqual(resolveHandGuideTarget("payment").selectors, [
      '[data-hand-guide-target="payment-terms-checkbox"]',
      '[data-hand-guide-target="payment-pay-button"]',
      CONTINUE_UNLOCKED_SELECTOR,
    ]);
  });

  it("resolves guided modal targets for fabric-capacity and apply-design-style", () => {
    const capacity = resolveModalHandGuideTarget("fabric-capacity");
    assert.deepEqual(capacity.selectors, [MODAL_PRIMARY_SELECTOR]);
    assert.equal(capacity.hint, "Continue or add a garment");

    const applyStyle = resolveModalHandGuideTarget("apply-design-style");
    assert.deepEqual(applyStyle.selectors, [MODAL_CHECKBOX_SELECTOR, MODAL_PRIMARY_SELECTOR]);
    assert.equal(getHandGuideHintForElement(applyStyle, true), "Apply design style");
  });

  it("findPrioritizedHandGuideElements returns all visible cards for alternating delivery options", () => {
    const pickupEl = { id: "pickup" } as unknown as HTMLElement;
    const deliveryEl = { id: "delivery" } as unknown as HTMLElement;

    const result = findPrioritizedHandGuideElements(
      ['[data-hand-guide-target="shipping-delivery-option"]', CONTINUE_UNLOCKED_SELECTOR],
      (sel) =>
        sel === '[data-hand-guide-target="shipping-delivery-option"]'
          ? [pickupEl, deliveryEl]
          : [],
      () => true,
    );
    assert.equal(result.elements.length, 2);
    assert.equal(result.matchedSelector, '[data-hand-guide-target="shipping-delivery-option"]');
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
  });

  it("shouldSuppressHandGuide returns false for all stages", () => {
    for (const stage of DESIGN_STUDIO_TEN_STAGE_FOUNDATION) {
      assert.equal(shouldSuppressHandGuide(stage.id), false);
    }
  });
});

describe("viewport-edge flip, neutral group, diagonal pay, and off-screen geometry", () => {
  const viewport = { width: 1280, height: 720 };

  it("places hand neutrally at top-center for measurement-option-group", () => {
    const placement = computeHandGuidePlacement(
      { top: 220, left: 100, right: 900, bottom: 480, width: 800, height: 260 },
      viewport,
      { neutralGroup: true },
    );
    assert.equal(placement.mode, "anchored");
    if (placement.mode === "anchored") {
      assert.equal(placement.anchor, "top-center");
      assert.ok(placement.x > 400 && placement.x < 550);
    }
  });

  it("uses diagonal-up-left anchor for Step 10 Pay button", () => {
    const placement = computeHandGuidePlacement(
      { top: 500, left: 200, right: 380, bottom: 548, width: 180, height: 48 },
      viewport,
      { diagonalUpLeft: true },
    );
    assert.equal(placement.mode, "anchored");
    if (placement.mode === "anchored") {
      assert.equal(placement.anchor, "diagonal-up-left");
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
        distancePx: 310,
        previousDistancePx: 350,
        elapsedFarMs: 4000,
        isFinePointer: true,
      }),
      false,
    );
  });
});
