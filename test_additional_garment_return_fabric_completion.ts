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

console.log("PASS: Additional Garment return and Fabric completion contract");
