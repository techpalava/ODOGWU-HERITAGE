import assert from "node:assert/strict";
import {
  advanceAdditionalGarmentSessionToCustomDetailsChoice,
  advanceAdditionalGarmentSessionToDesignStyle,
  isAdditionalGarmentCustomDetailsChoiceSessionPhase,
  isAdditionalGarmentDesignStyleSessionPhase,
  isAdditionalGarmentStep5ConfigurationSession,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";

const baseSession: AdditionalGarmentFabricTransaction = {
  transactionId: 7,
  phase: "awaiting_commit",
  origin: "new_addition",
  garmentKey: "additional:shirt:2",
  garmentType: "shirt",
  occurrenceGeneration: 4,
  fabricUnits: 1,
};

const designStyleSession = advanceAdditionalGarmentSessionToDesignStyle(
  baseSession,
  "FAB-SHIRT",
);

assert.equal(designStyleSession.phase, "design_style");
assert.equal(designStyleSession.openedModal, false);
assert.equal(designStyleSession.requestedFabricCode, "FAB-SHIRT");
assert.equal(designStyleSession.garmentKey, "additional:shirt:2");
assert.equal(designStyleSession.occurrenceGeneration, 4);
assert.equal(isAdditionalGarmentDesignStyleSessionPhase(designStyleSession), true);
assert.equal(isAdditionalGarmentStep5ConfigurationSession(designStyleSession), true);
assert.equal(
  isAdditionalGarmentCustomDetailsChoiceSessionPhase(designStyleSession),
  false,
);

const copySession =
  advanceAdditionalGarmentSessionToCustomDetailsChoice(designStyleSession);
assert.equal(copySession.phase, "custom_details_choice");
assert.equal(copySession.garmentKey, "additional:shirt:2");
assert.equal(copySession.occurrenceGeneration, 4);
assert.equal(isAdditionalGarmentCustomDetailsChoiceSessionPhase(copySession), true);
assert.equal(isAdditionalGarmentStep5ConfigurationSession(copySession), true);
assert.equal(isAdditionalGarmentDesignStyleSessionPhase(copySession), false);

assert.equal(
  isAdditionalGarmentStep5ConfigurationSession({
    ...designStyleSession,
    designStyleReuse: { styleId: "style-1" },
  }),
  false,
  "design-style reuse must keep returning to the Step 3 page path",
);

assert.equal(
  isAdditionalGarmentStep5ConfigurationSession({
    ...designStyleSession,
    capacityReuse: {
      allocationId: "alloc-1",
      fabricCode: "FAB-SHIRT",
      remainingUnits: 1,
      assignedGarmentKeys: ["base:shirt"],
      offerSignature: "sig",
      returnStage: "design_style",
    },
  }),
  false,
  "capacity reuse must keep its returnStage navigation",
);

assert.equal(
  isAdditionalGarmentStep5ConfigurationSession({
    ...designStyleSession,
    origin: "change_existing",
  }),
  false,
  "fabric change/repair detours are not the Step 5 configuration session",
);

assert.equal(
  isAdditionalGarmentStep5ConfigurationSession({
    ...designStyleSession,
    phase: "committed",
  }),
  false,
);

console.log("PASS: Additional Garment Step 5 configuration session helpers");
