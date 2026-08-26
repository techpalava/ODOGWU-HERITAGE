import assert from "node:assert/strict";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: true,
    customDetailsReady: false,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
    },
  }),
  null,
  "inline transaction keeps Custom Details even when fabric is incomplete",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: true,
    customDetailsReady: false,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: null,
  }),
  "fabric",
  "without inline transaction incomplete fabric returns fabric",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "summary",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: true,
    customDetailsReady: true,
    measurementUnlocked: true,
    summaryUnlocked: true,
    inlineAdditionalGarmentFabricTransaction: null,
  }),
  null,
  "complete summary stays put",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "try_on",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: true,
    customDetailsReady: false,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: null,
  }),
  "custom_details",
  "incomplete custom details redirects from try_on",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "fabric",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: false,
    customDetailsReady: false,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
    },
  }),
  null,
  "helper does not rewrite non-watched stages",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: false,
    customDetailsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
      phase: "committed",
    },
  }),
  null,
  "committed inline transaction suppresses design_style bounce",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "custom_details",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: false,
    customDetailsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: null,
  }),
  "design_style",
  "truly invalid design source still redirects when no inline transaction",
);

console.log("PASS: future stage correction helper");
