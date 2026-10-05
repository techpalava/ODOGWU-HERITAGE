import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const customDetailsSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);

assert.match(
  studioSource,
  /requiredPhysicalOccurrences: fabricTransactionPhysicalOccurrences/,
  "Fabric completion must validate the in-flight exact occurrence set, not a stale pre-addition ledger",
);
assert.match(
  studioSource,
  /setFutureCustomDetailsFocusGarmentKey\(commitResult\.garmentKey\)/,
  "a committed Additional Garment must retain its exact occurrence target",
);
assert.match(
  studioSource,
  /setFutureStageId\("personalized_additions"\)/,
  "a normal Additional Garment Fabric detour returns to Step 5",
);
assert.match(
  studioSource,
  /advanceAdditionalGarmentSessionToDesignStyle\(\s*transaction,\s*commitResult\.fabricCode/,
  "Step 5 Add Additional Garment continues into an in-place Design Style session after Fabric",
);
assert.match(
  studioSource,
  /FutureAdditionalGarmentDesignStyleDialog/,
  "Design Style for a Step 5 additional garment opens as a modal, not the Step 3 page",
);
assert.match(
  customDetailsSource,
  /canPresentAdditionalGarmentCustomDetailsPrompt/,
  "Custom Detail Copy may open on Step 5 after the Design Style session assigns a style",
);
assert.match(
  studioSource,
  /shouldContinueStep5Configuration[\s\S]*advanceAdditionalGarmentSessionToDesignStyle[\s\S]*setFutureStageId\("personalized_additions"\)/,
  "the normal Step 5 additional-garment Fabric path stays on Personalized Additions",
);
assert.match(customDetailsSource, /data-step5-garment-context/);
assert.match(customDetailsSource, /context\.sourceRole === "additional"/);
assert.match(
  customDetailsSource,
  /isCustomDetailsStage && onChangeAdditionalGarmentFabric/,
  "Step 5 context must not expose a Fabric-change control",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "personalized_additions",
    garmentTypeComplete: true,
    fabricComplete: false,
    designSourceReady: true,
    customDetailsReady: true,
    personalizedAdditionsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
    },
  }),
  null,
  "the Step 5 detour remains mounted while its exact transaction settles",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "personalized_additions",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: false,
    customDetailsReady: true,
    personalizedAdditionsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
      phase: "design_style",
    },
  }),
  null,
  "the Design Style session phase keeps Step 5 mounted",
);

assert.equal(
  resolveFutureStageCorrection({
    currentStageId: "personalized_additions",
    garmentTypeComplete: true,
    fabricComplete: true,
    designSourceReady: false,
    customDetailsReady: true,
    personalizedAdditionsReady: true,
    measurementUnlocked: false,
    summaryUnlocked: false,
    inlineAdditionalGarmentFabricTransaction: {
      garmentKey: "additional:shirt:1",
      phase: "custom_details_choice",
    },
  }),
  null,
  "the Custom Detail Copy session phase keeps Step 5 mounted",
);

console.log("PASS: Additional Garment return and Fabric completion contract");
