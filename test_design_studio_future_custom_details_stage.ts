import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  resolveFutureCustomDetailPhysicalSubjects,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import {
  createEmptyGarmentScopedCustomDetailInputs,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  setGarmentScopedCustomDetailText,
} from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { createDormantDesignStudioJourneyState } from "./src/utils/designStudioJourneyMode";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "kaftan"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const subjectResolution = resolveFutureCustomDetailPhysicalSubjects(
  garmentTypeSelection,
);
assert.deepEqual(
  subjectResolution.subjects.map((subject) => subject.garmentKey),
  ["base:shirt", "base:kaftan"],
);

const initial = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  catalogInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const shirtNeck = initial.applicabilityByGarmentKey
  .get("base:shirt")
  ?.groups.find((group) => group.selectionGroup === "neck_design")?.options[0];
const kaftanNeck = initial.applicabilityByGarmentKey
  .get("base:kaftan")
  ?.groups.find((group) => group.selectionGroup === "neck_design")?.options[0];
assert.ok(shirtNeck);
assert.ok(kaftanNeck);

let scopedState = initial.state;
initial.subjects.forEach((subject) => {
  initial.applicabilityByGarmentKey
    .get(subject.garmentKey)
    ?.groups.filter((group) => group.required)
    .forEach((group) => {
      scopedState = setGarmentScopedCustomDetailSelection(
        scopedState,
        subject.garmentKey,
        group.selectionGroup,
        group.allowMultiple ? [group.options[0].id] : group.options[0].id,
      );
    });
});
scopedState = setGarmentScopedCustomDetailSelection(
  scopedState,
  "base:shirt",
  "neck_design",
  shirtNeck.id,
);
scopedState = setGarmentScopedCustomDetailSelection(
  scopedState,
  "base:kaftan",
  "neck_design",
  kaftanNeck.id,
);
const selected = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  catalogInspection,
  existingState: scopedState,
});
assert.equal(
  selected.state.selectionsByGarmentKey["base:shirt"]?.neck_design,
  shirtNeck.id,
);
assert.equal(
  selected.state.selectionsByGarmentKey["base:kaftan"]?.neck_design,
  kaftanNeck.id,
);
assert.equal(
  calculateGarmentScopedCustomDetailsPricing({
    reconciliation: selected,
    catalogInspection,
  }).lines.filter((line) => line.selectionGroup === "neck_design").length,
  2,
);

const personalizedState = setGarmentScopedCustomDetailSelection(
  selected.state,
  "base:shirt",
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
);
const personalizedReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  catalogInspection,
  existingState: personalizedState,
});
let personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: personalizedReconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: personalizedReconciliation,
    personalizedInputs,
  }).status,
  "incomplete",
);
personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: personalizedReconciliation,
  catalogInspection,
  existingInputs: setGarmentScopedCustomDetailText({
    state: personalizedInputs.state,
    garmentKey: "base:shirt",
    selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
    text: "Please add a family crest on the left chest.",
  }).state,
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: personalizedReconciliation,
    personalizedInputs,
  }).status,
  "pricing_pending",
);

assert.equal(
  createDormantDesignStudioJourneyState({
    persistedDraft: {
      currentStageId: "custom_details",
      garmentTypeSelection,
    },
    normalizedCustomDetailCatalog: catalogInspection.activeOptions,
    isFabricStageComplete: true,
  }).currentStageId,
  "custom_details",
);

const renderedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: initial,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
const renderedCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection,
  style: null,
  reconciliation: initial,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
const renderedMarkup = renderToStaticMarkup(
  createElement(DormantFutureCustomDetailsStep, {
    reconciliation: initial,
    catalogue: renderedCatalogue,
    personalizedInputs: renderedInputs.state,
    completion: validateGarmentScopedCustomDetailsCompletion({
      earlierStagesComplete: true,
      reconciliation: initial,
      personalizedInputs: renderedInputs,
    }),
    pricing: calculateGarmentScopedCustomDetailsPricing({
      reconciliation: initial,
      catalogInspection,
    }),
    orderLevelCustomDetailsPrice: 0,
    constructionSubtotal: 0,
    designSelections: {},
    selectedStyle: null,
    additionalGarments: [],
    additionalGarmentConstructionOptions: [],
    onSingleSelect: () => undefined,
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureToggle: () => undefined,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onAddAdditionalGarment: () => undefined,
    onRemoveAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }),
);
const renderedNeckStart = renderedMarkup.indexOf(
  'data-custom-detail-group="neck_design"',
);
assert.ok(renderedNeckStart >= 0, "Rendered markup must contain the Neck group");
const renderedNeckMarkup = renderedMarkup.slice(renderedNeckStart);
assert.match(
  renderedNeckMarkup,
  /class="min-w-0 lg:col-span-2"/,
  "Rendered Neck fieldset must span the full Custom Details section width",
);
assert.match(
  renderedNeckMarkup,
  /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,20rem\),1fr\)\)\]/,
  "Rendered collar panels must use a readable minimum-width grid",
);
assert.ok(
  renderedNeckMarkup.indexOf("None") < renderedNeckMarkup.indexOf("No Collar"),
  "Rendered Neck None option must precede collar panels",
);
for (const label of [
  "No Collar",
  "Vertical Collar",
  "Flat Collar",
  "Vertical Collar, U or Square-Shaped Neck",
  "Flat Collar, U or Square-Shaped Neck",
]) {
  assert.ok(renderedNeckMarkup.includes(label), `Rendered Neck must retain ${label}`);
}
assert.ok(!renderedNeckMarkup.includes("break-all"));

const componentSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const styleSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(componentSource, /Step 4 of 9/);
assert.match(
  componentSource,
  /Base garment construction was selected in Garment Type and is already included in your price/,
);
assert.match(componentSource, /Price requires evaluation\./);
assert.match(componentSource, /Confirmed after tailoring review/);
assert.match(componentSource, /Describe your personalized requirement/);
assert.match(componentSource, /type=\{group\.allowMultiple \? "checkbox" : "radio"\}/);
assert.match(componentSource, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(19rem,24rem\)\]/);
assert.match(componentSource, /xl:sticky xl:top-4/);
assert.match(componentSource, /min-w-0 break-words/);
assert.match(componentSource, /Not currently included/);
assert.match(componentSource, /Included in your selected design/);
assert.match(componentSource, /Added garment/);
assert.match(componentSource, /Add Additional Garment/);
assert.match(componentSource, /No selection for this category/);
assert.match(componentSource, /NECK_DESIGN_SUBCATEGORY_ORDER/);
assert.match(
  componentSource,
  /group\.selectionGroup === "neck_design" \? "lg:col-span-2"/,
  "Neck must occupy the full Custom Details section width",
);
assert.match(
  componentSource,
  /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,20rem\),1fr\)\)\]/,
  "Neck collar panels must retain a readable minimum width",
);
assert.doesNotMatch(
  componentSource,
  /neck_design[\s\S]{0,240}lg:grid-cols-2 2xl:grid-cols-3/,
  "Neck must not force narrow two- or three-column panels",
);
assert.ok(
  !componentSource.includes("break-all"),
  "Neck labels must not use character-by-character wrapping",
);
assert.match(componentSource, /Included in your selected design/);
assert.match(componentSource, /additionalGarmentConstructionOptions/);
assert.match(componentSource, /min-h-12/);
assert.match(componentSource, /onConstructionSelect/);
assert.match(componentSource, /onClearSelection/);
assert.match(stepperSource, /canEnterCustomDetails/);
assert.match(styleSource, /onContinue/);
assert.match(studioSource, /handleOpenDormantCustomDetailsStage/);
assert.match(studioSource, /reconcileGarmentScopedCustomDetails/);
assert.match(studioSource, /reconcileGarmentScopedPersonalizedInputs/);
assert.match(studioSource, /setGarmentScopedCustomDetailSelection/);
assert.match(studioSource, /futureAdditionalGarmentConstructionOptions/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: future Custom Details stage navigation and scoped state contract");
