import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DESIGN_STUDIO_TEN_STAGE_FOUNDATION } from "./src/utils/designSourceJourney";
import {
  CUSTOM_DETAILS_STAGE_SECTION_ORDER,
  getCustomDetailsSectionIdsForStage,
  getCustomDetailsStageCompletion,
} from "./src/utils/customDetailsStageOwnership";
import { hasAuthoritativeFutureDraftMarker } from "./src/utils/designStudioDraftPersistence";
import type { GarmentScopedCustomDetailsCompletionResult } from "./src/utils/garmentScopedCustomDetailsDomain";

assert.deepEqual(
  DESIGN_STUDIO_TEN_STAGE_FOUNDATION.map((stage) => stage.id),
  [
    "garment_type",
    "fabric",
    "design_style",
    "custom_details",
    "personalized_additions",
    "try_on",
    "measurement",
    "summary",
    "shipping",
    "payment",
  ],
  "the customer journey has exactly ten stable semantic stages",
);

const oldStep4Sections = CUSTOM_DETAILS_STAGE_SECTION_ORDER.map(
  (section) => section.id,
);
const step4Sections = getCustomDetailsSectionIdsForStage("custom_details");
const step5Sections = getCustomDetailsSectionIdsForStage(
  "personalized_additions",
);
assert.deepEqual(
  [...step4Sections, ...step5Sections],
  oldStep4Sections,
  "the ordered prior Step 4 section sequence is partitioned without reordering",
);
assert.deepEqual(
  step4Sections.filter((section) => step5Sections.includes(section)),
  [],
  "the two presentation stages never duplicate a section",
);
assert.deepEqual(
  new Set([...step4Sections, ...step5Sections]),
  new Set(oldStep4Sections),
  "the two presentation stages omit no prior Step 4 section",
);
assert.deepEqual(step4Sections, ["catalogue_core", "additional_clothes_costs"]);
assert.deepEqual(step5Sections, [
  "personalized_additional",
  "monogram_embroidery",
  "accessories",
  "additional_garment_management",
]);

const reconciliation = {
  subjects: [
    { garmentKey: "base:shirt", parentGarmentKey: "base:shirt" },
    {
      garmentKey: "additional:shirt:1",
      parentGarmentKey: "additional:shirt:1",
    },
  ],
} as any;
const completion: GarmentScopedCustomDetailsCompletionResult = {
  status: "incomplete" as const,
  blockers: [
    {
      code: "required_selection_missing" as const,
      message: "A base detail is missing.",
      garmentKey: "base:shirt",
      selectionGroup: "neck_design",
    },
    {
      code: "personalized_requirement_missing" as const,
      message: "A personalized description is missing.",
      garmentKey: "base:shirt",
      selectionGroup: "personalized_additional",
    },
    {
      code: "required_selection_missing" as const,
      message: "An added garment detail is missing.",
      garmentKey: "additional:shirt:1",
      selectionGroup: "shirt_construction",
    },
  ],
};
const step4Completion = getCustomDetailsStageCompletion({
  stage: "custom_details",
  completion,
  reconciliation,
});
const step5Completion = getCustomDetailsStageCompletion({
  stage: "personalized_additions",
  completion,
  reconciliation,
});
assert.deepEqual(
  step4Completion.blockers.map((blocker) => blocker.message),
  ["A base detail is missing."],
  "Step 4 completion ignores all Step 5-owned details",
);
assert.deepEqual(
  step5Completion.blockers.map((blocker) => blocker.message),
  ["A personalized description is missing.", "An added garment detail is missing."],
  "Step 5 completion owns personalized and added-garment details",
);

assert.equal(
  hasAuthoritativeFutureDraftMarker({
    journeySchemaVersion: 1,
    currentStageId: "try_on",
  }),
  true,
  "a persisted nine-stage draft remains readable by its stable stage ID",
);
assert.equal(
  hasAuthoritativeFutureDraftMarker({
    journeySchemaVersion: 2,
    currentStageId: "personalized_additions",
  }),
  true,
  "a ten-stage draft persists the new stable stage ID",
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const customDetailsSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);
assert.match(studioSource, /handleOpenDormantPersonalizedAdditionsStage/);
assert.match(studioSource, /onContinue=\{[\s\S]*handleOpenDormantPersonalizedAdditionsStage/);
assert.match(studioSource, /onBack=\{\(\) => navigateToFutureStage\("personalized_additions"\)\}/);
assert.match(customDetailsSource, /stage = "custom_details"/);
assert.match(customDetailsSource, /isPersonalizedAdditionsStage && mainPersonalizedGroups/);

console.log("PASS: ten-stage Custom Details and Personalized Additions split");
