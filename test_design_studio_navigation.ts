import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION,
} from "./src/utils/designSourceJourney";
import {
  createDesignStudioNavigationRequest,
  getMainStageNavigationTarget,
  getOrderSummaryNavigationTarget,
  getValidationNavigationTarget,
} from "./src/utils/designStudioNavigation";

const stages = DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map((stage) => stage.id);

// Every successful Next and Back transition carries a new, explicit
// destination-top request. A new id keeps repeat clicks observable even when
// the destination is already active.
stages.slice(1).forEach((stage, index) => {
  const next = createDesignStudioNavigationRequest({
    id: index + 1,
    stage,
    target: getMainStageNavigationTarget(),
  });
  const back = createDesignStudioNavigationRequest({
    id: index + 101,
    stage: stages[index]!,
    target: getMainStageNavigationTarget(),
  });
  assert.equal(next.target.kind, "stage_top");
  assert.equal(back.target.kind, "stage_top");
  assert.notEqual(next.id, back.id);
});

const blockedFabricAdvance = createDesignStudioNavigationRequest({
  id: 201,
  stage: "fabric",
  target: getValidationNavigationTarget(),
});
assert.equal(blockedFabricAdvance.stage, "fabric");
assert.equal(blockedFabricAdvance.target.kind, "validation_target");

assert.deepEqual(getOrderSummaryNavigationTarget(), { kind: "stage_top" });
assert.deepEqual(
  getOrderSummaryNavigationTarget({ focusAdditionalGarmentKey: "additional:shirt:2" }),
  { kind: "additional_garment", garmentKey: "additional:shirt:2" },
);
assert.deepEqual(getOrderSummaryNavigationTarget({ focusAdditionalGarmentKey: null }), {
  kind: "additional_garment",
  garmentKey: null,
});

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const summarySource = readFileSync(
  "src/utils/designStudioLiveOrderSummary.ts",
  "utf8",
);
const customDetailsSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);
assert.match(studioSource, /data-design-studio-stage-target=\{futureStageId\}/);
assert.match(studioSource, /scrollIntoView\(\{ behavior: "auto", block: "start" \}\)/);
assert.match(studioSource, /focus\(\{ preventScroll: true \}\)/);
assert.match(studioSource, /\[aria-invalid="true"\], \[data-validation-target="true"\]/);
assert.match(studioSource, /getOrderSummaryNavigationTarget\(/);
assert.match(studioSource, /futureAdditionalGarmentNavigationRequestIdRef\.current \+= 1/);

// Audit the actual persistent Order Summary ownership map without adding or
// inventing any visible controls.
for (const [section, stage] of [
  ["Garment Construction", "garment_type"],
  ["Optional Extra Garments", "custom_details"],
  ["Additional Clothes Costs", "custom_details"],
  ["Garments", "garment_type"],
  ["Fabrics", "fabric"],
  ["Design Style", "design_style"],
  ["Measurements", "measurement"],
  ["Delivery & Pickup", "shipping"],
] as const) {
  assert.match(
    summarySource,
    new RegExp(`title: "${section}",[\\s\\S]{0,180}editStage: "${stage}"`),
  );
}
assert.match(summarySource, /id: "additional_garments",[\s\S]{0,180}focusGarmentKey/);

// Intentional modal/sub-flow returns keep their established direct state
// updates and therefore never receive the shared main-stage top request.
assert.match(studioSource, /transaction\.designStyleReuse[\s\S]{0,400}setFutureStageId\("design_style"\)/);
assert.match(studioSource, /setFutureCustomDetailsFocusGarmentKey\(commitResult\.garmentKey\);[\s\S]{0,120}setFutureStageId\("custom_details"\)/);

// The existing exact-occurrence request remains the sole Additional Garments
// scroller. Its scroll is deferred until the originating Summary click settles,
// so a second Edit request cannot be overtaken by browser scroll restoration.
assert.match(customDetailsSource, /const scrollFrame = window\.requestAnimationFrame/);
assert.match(
  customDetailsSource,
  /focusTarget\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)[\s\S]{0,160}focusTarget\.focus\(\{ preventScroll: true \}\)/,
);

console.log("PASS: Design Studio navigation intents");
