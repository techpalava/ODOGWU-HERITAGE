import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
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
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  createEmptyAdditionalGarmentConstructionState,
  reconcileAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import type { FabricGarmentAssignment } from "./src/types";
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

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const neckLayoutGarmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
let neckLayoutReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: neckLayoutGarmentTypeSelection,
  catalogInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
let neckLayoutInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: neckLayoutReconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
let neckLayoutCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: neckLayoutGarmentTypeSelection,
  style: null,
  reconciliation: neckLayoutReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
let neckLayoutCompletion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation: neckLayoutReconciliation,
  personalizedInputs: neckLayoutInputs,
});
let neckLayoutPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: neckLayoutReconciliation,
  catalogInspection,
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let neckRenderer!: ReturnType<typeof create>;
const createNeckStep = ({
  constructionBreakdown = { status: "complete" as const, rows: [] },
  constructionSubtotal = 0,
  orderLevelCustomDetailsPrice = 0,
}: {
  constructionBreakdown?: Parameters<typeof DormantFutureCustomDetailsStep>[0]["constructionBreakdown"];
  constructionSubtotal?: number | null;
  orderLevelCustomDetailsPrice?: number;
} = {}) =>
  createElement(DormantFutureCustomDetailsStep, {
    reconciliation: neckLayoutReconciliation,
    catalogue: neckLayoutCatalogue,
    personalizedInputs: neckLayoutInputs.state,
    completion: neckLayoutCompletion,
    pricing: neckLayoutPricing,
    orderLevelCustomDetailsPrice,
    constructionBreakdown,
    constructionSubtotal,
    designSelections: {},
    selectedStyle: null,
    additionalGarments: [],
    additionalGarmentConstructionOptions: [],
    onSingleSelect: (garmentKey, selectionGroup, optionId) => {
      const nextState = setGarmentScopedCustomDetailSelection(
        neckLayoutReconciliation.state,
        garmentKey,
        selectionGroup,
        optionId,
      );
      neckLayoutReconciliation = reconcileGarmentScopedCustomDetails({
        garmentTypeSelection: neckLayoutGarmentTypeSelection,
        catalogInspection,
        existingState: nextState,
      });
      neckLayoutInputs = reconcileGarmentScopedPersonalizedInputs({
        reconciliation: neckLayoutReconciliation,
        catalogInspection,
        existingInputs: neckLayoutInputs.state,
      });
      neckLayoutCatalogue = projectFutureCustomDetailsCatalogue({
        garmentTypeSelection: neckLayoutGarmentTypeSelection,
        style: null,
        reconciliation: neckLayoutReconciliation,
        activeOptions: catalogInspection.activeOptions,
        additionalGarments: [],
      });
      neckLayoutCompletion = validateGarmentScopedCustomDetailsCompletion({
        earlierStagesComplete: true,
        reconciliation: neckLayoutReconciliation,
        personalizedInputs: neckLayoutInputs,
      });
      neckLayoutPricing = calculateGarmentScopedCustomDetailsPricing({
        reconciliation: neckLayoutReconciliation,
        catalogInspection,
      });
      neckRenderer.update(createNeckStep());
    },
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureToggle: () => undefined,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onBeginAdditionalGarment: () => undefined,
    onConfirmAdditionalGarmentCustomDetails: () => undefined,
    onCancelAdditionalGarmentCustomDetails: () => undefined,
    onRemoveAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  });
act(() => {
  neckRenderer = create(createNeckStep());
});

const neckFieldsets = neckRenderer.root.findAllByProps({
  "data-custom-detail-group": "neck_design",
});
assert.ok(
  !/STANDARD LEG SHORTS|Nikka/i.test(textContent(neckRenderer.root)),
  "inactive policy garments such as Nikka must not render in Custom Details",
);
const neckFieldset = neckFieldsets[0];
const neckLegend = neckFieldset.findByType("legend");
assert.equal(
  textContent(neckLegend.findAllByType("span")[0]).trim().toUpperCase(),
  "NECK DESIGN",
);
assert.match(
  String(neckFieldset.props.className),
  /(?:^|\s)lg:col-span-2(?:\s|$)/,
  "Rendered Neck fieldset must span the full Custom Details section width",
);
const ordinaryFieldsets = neckRenderer.root
  .findAllByType("fieldset")
  .filter((fieldset) => fieldset !== neckFieldset);
assert.ok(
  ordinaryFieldsets.length > 0,
  "Rendered tree must contain at least one ordinary non-Neck fieldset",
);
assert.ok(
  ordinaryFieldsets.every(
    (fieldset) => !String(fieldset.props.className).includes("lg:col-span-2"),
  ),
  "Ordinary Custom Details fieldsets must retain their normal layout",
);

const collarGridClass =
  "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4";
const collarGrids = neckFieldset.findAll(
  (node) => node.type === "div" && node.props.className === collarGridClass,
);
assert.equal(collarGrids.length, 1, "Neck must render one scoped responsive collar grid");
const collarGrid = collarGrids[0];
const collarGroups = collarGrid.findAllByType("section");
const optionTitleSpan = (label: ReactTestInstance) =>
  label.findAllByType("span").find((span) =>
    String(span.props.className).includes("text-sm") &&
    String(span.props.className).includes("font-bold"),
  );

const neckLabels = neckFieldset.findAllByType("label");
const noneLabel = neckLabels.find((label) =>
  textContent(label).trim().startsWith("None"),
);
assert.ok(noneLabel, "Neck must render None as the first selectable option");
assert.equal(
  neckLabels.indexOf(noneLabel),
  0,
  "None must be the first rendered Neck option",
);
const noneInput = noneLabel.findByType("input");
assert.equal(noneInput.props.type, "radio");
assert.equal(noneInput.props.checked, true);
assert.match(
  String(noneLabel.props.className),
  /border-heritage-green bg-heritage-green\/5/,
  "None must retain the existing selected-card styling",
);
assert.equal(
  textContent(optionTitleSpan(noneLabel) || null).trim(),
  "None",
);
assert.ok(textContent(noneLabel).includes("No selection for this category"));
assert.equal(
  noneLabel.parent,
  collarGrid.parent,
  "None and the collar grid must share the occurrence-level layout wrapper",
);
assert.equal(
  noneLabel.parent?.children.indexOf(noneLabel),
  0,
  "None must occupy the full-width block before the collar grid",
);
assert.ok(
  String(noneLabel.parent?.props.className).includes("space-y-3"),
  "None must remain a full-width sibling of the collar grid",
);

const collarGroupOrder = collarGroups
  .map((group) => textContent(group.findByType("h5")).trim().toUpperCase());
assert.deepEqual(collarGroupOrder, [
  "NO COLLAR",
  "VERTICAL COLLAR",
  "FLAT COLLAR",
]);

const expectedNeckOptionLabels = [
  "No Collar, Round Neck",
  "No Collar, V-Shaped Neck",
  "No Collar, U or Square-Shaped Neck",
  "Vertical Collar, Round Neck",
  "Vertical Collar, V-Shaped Neck",
  "Vertical Collar, U or Square-Shaped Neck",
  "Flat Collar, Round Neck",
  "Flat Collar, V-Shaped Neck",
  "Flat Collar, U or Square-Shaped Neck",
];
const collarOptionLabels = collarGroups.flatMap((group) =>
  group
    .findAllByType("label")
    .map((label) => optionTitleSpan(label))
    .filter((span): span is ReactTestInstance => Boolean(span))
    .map((span) => textContent(span).trim()),
);
assert.deepEqual(collarOptionLabels, expectedNeckOptionLabels);
assert.ok(
  collarGroups.every((group) =>
    group.findAllByType("label").every((label) => {
      const title = optionTitleSpan(label);
      return (
        label.findByType("input").props.type === "radio" &&
        new Set(String(title?.props.className).split(/\s+/)).has("min-w-0") &&
        new Set(String(title?.props.className).split(/\s+/)).has("break-words") &&
        !new Set(String(title?.props.className).split(/\s+/)).has("break-all") &&
        String(label.props.className).includes("min-h-12") &&
        String(label.props.className).includes("focus-within:ring-2") &&
        textContent(label).includes("Included")
      );
    }),
  ),
  "Neck option cards must retain radio, wrapping, focus, touch-target, and Included contracts",
);
const includedNeckOption = neckLayoutReconciliation.applicabilityByGarmentKey
  .get("base:shirt")
  ?.groups.find((group) => group.selectionGroup === "neck_design")
  ?.options.find((option) => option.label === "Vertical Collar, U or Square-Shaped Neck");
assert.ok(includedNeckOption, "The real Included Neck option must be available");
const includedNeckLabel = neckFieldset.findAllByType("label").find((label) =>
  textContent(label).includes(includedNeckOption.label),
);
assert.ok(includedNeckLabel, "The real Included Neck option must render");
act(() => {
  includedNeckLabel.findByType("input").props.onChange();
});
const selectedNeckFieldset = neckRenderer.root.findAllByProps({
  "data-custom-detail-group": "neck_design",
})[0];
const selectedIncludedNeckLabel = selectedNeckFieldset.findAllByType("label").find((label) =>
  textContent(label).includes(includedNeckOption.label),
);
assert.ok(selectedIncludedNeckLabel);
assert.equal(selectedIncludedNeckLabel.findByType("input").props.checked, true);
assert.equal(
  neckLayoutReconciliation.state.selectionsByGarmentKey["base:shirt"]?.neck_design,
  includedNeckOption.id,
);
assert.equal(
  neckRenderer.root.findByType(DormantFutureCustomDetailsStep).props.constructionSubtotal,
  0,
  "Selecting an Included Neck option must not change Garment Construction",
);
assert.equal(neckLayoutPricing.status, "exact");
if (neckLayoutPricing.status === "exact") {
  assert.equal(neckLayoutPricing.subtotalCents, 0);
  assert.deepEqual(
    neckLayoutPricing.lines
      .filter((line) => line.selectionGroup === "neck_design")
      .filter((line) => line.optionId === includedNeckOption.id)
      .map((line) => line.lineTotalCents),
    [0],
    "The selected Included Neck option must contribute exactly €0",
  );
}

let constructionBreakdownRenderer!: ReturnType<typeof create>;
act(() => {
  constructionBreakdownRenderer = create(createNeckStep({
    constructionBreakdown: {
      status: "complete",
      rows: [{
        garmentKey: "base:shirt",
        garmentLabel: "Shirt",
        constructionLabel: "Standard Length Shirt, Short Sleeve",
        role: "main",
        priceCents: 6500,
      }],
    },
    constructionSubtotal: 65,
  }));
});
const constructionBreakdown = constructionBreakdownRenderer.root.findByProps({
  "data-construction-price-breakdown": true,
});
assert.equal(
  textContent(constructionBreakdown.findByProps({ "data-construction-price-row": "base:shirt" })),
  "ShirtStandard Length Shirt, Short Sleeve€65.00",
  "the read-only breakdown renders the garment occurrence, selected construction, and authoritative price together",
);
assert.equal(
  textContent(constructionBreakdown).includes("Vertical Collar"),
  false,
  "Included Neck choices remain outside Garment Construction",
);

let pendingConstructionRenderer!: ReturnType<typeof create>;
act(() => {
  pendingConstructionRenderer = create(createNeckStep({
    constructionBreakdown: {
      status: "pending",
      rows: [{
        garmentKey: "base:shirt",
        garmentLabel: "Shirt",
        constructionLabel: null,
        role: "main",
        priceCents: null,
      }],
    },
    constructionSubtotal: null,
  }));
});
const pendingConstructionBreakdown = pendingConstructionRenderer.root.findByProps({
  "data-construction-price-breakdown": true,
});
assert.match(textContent(pendingConstructionBreakdown), /Price pending/);
assert.equal(
  textContent(pendingConstructionBreakdown).includes("€0.00"),
  false,
  "unresolved construction pricing must never be presented as a free row",
);
assert.match(
  textContent(pendingConstructionRenderer.root),
  /Construction pricing needs review before an exact total is available\./,
);

let repeatedConstructionRenderer!: ReturnType<typeof create>;
act(() => {
  repeatedConstructionRenderer = create(createNeckStep({
    constructionBreakdown: {
      status: "complete",
      rows: [
        {
          garmentKey: "base:shirt",
          garmentLabel: "Shirt",
          constructionLabel: "Standard Length Shirt, Short Sleeve",
          role: "main",
          priceCents: 6500,
        },
        {
          garmentKey: "additional:shirt:1",
          garmentLabel: "Shirt",
          constructionLabel: "Standard Length Shirt, Mid-Long Sleeve",
          role: "additional",
          priceCents: 7000,
        },
      ],
    },
    constructionSubtotal: 135,
    orderLevelCustomDetailsPrice: 12,
  }));
});
assert.equal(
  textContent(repeatedConstructionRenderer.root.findByProps({
    "data-construction-price-row": "base:shirt",
  })).startsWith("Shirt 1"),
  true,
);
assert.equal(
  textContent(repeatedConstructionRenderer.root.findByProps({
    "data-construction-price-row": "additional:shirt:1",
  })).startsWith("Shirt 2"),
  true,
);
assert.match(textContent(repeatedConstructionRenderer.root), /Custom Details subtotal€12\.00/);
assert.match(textContent(repeatedConstructionRenderer.root), /Estimated total so far€147\.00/);

const additionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  existingAssignments: [
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
      sourceRole: "main",
      dependencyStatus: "valid",
    },
  ],
});
assert.equal(additionalSelection.status, "resolved");
if (
  additionalSelection.status !== "resolved" ||
  !additionalSelection.selection.garmentSpec
) {
  throw new Error("Expected an additional Shirt selection.");
}
const additionalAssignment: FabricGarmentAssignment = {
  garmentKey: additionalSelection.selection.garmentSpec.key,
  code: additionalSelection.selection.code,
  garmentType: "shirt",
  fabricUnits: 1,
  garmentSpec: additionalSelection.selection.garmentSpec,
  sourceRole: "additional",
  eligibilityRule: "catalog_all",
  dependencyStatus: "valid",
  mainGarmentKey: additionalSelection.selection.mainGarmentKey,
  mainGarmentType: additionalSelection.selection.mainGarmentType,
};
const additionalConstructions = reconcileAdditionalGarmentConstructionState({
  existingState: createEmptyAdditionalGarmentConstructionState(),
  assignments: [additionalAssignment],
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
});
const additionalReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: neckLayoutGarmentTypeSelection,
  additionalGarments: [additionalAssignment],
  additionalGarmentConstructions: additionalConstructions.state,
  catalogInspection,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const additionalCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: neckLayoutGarmentTypeSelection,
  reconciliation: additionalReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [additionalAssignment],
  additionalGarmentConstructions: additionalConstructions.state,
});
const additionalInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: additionalReconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
const additionalCompletion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation: additionalReconciliation,
  personalizedInputs: additionalInputs,
});
const additionalPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: additionalReconciliation,
  catalogInspection,
});
let additionalRenderer!: ReturnType<typeof create>;
act(() => {
  additionalRenderer = create(createElement(DormantFutureCustomDetailsStep, {
    reconciliation: additionalReconciliation,
    catalogue: additionalCatalogue,
    personalizedInputs: additionalInputs.state,
    completion: additionalCompletion,
    pricing: additionalPricing,
    orderLevelCustomDetailsPrice: 0,
    constructionBreakdown: { status: "complete", rows: [] },
    constructionSubtotal: 0,
    designSelections: {},
    selectedStyle: null,
    additionalGarments: [additionalAssignment],
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
    onBeginAdditionalGarment: () => undefined,
    onConfirmAdditionalGarmentCustomDetails: () => undefined,
    onCancelAdditionalGarmentCustomDetails: () => undefined,
    onRemoveAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
const mainDetails = additionalRenderer.root.findByProps({
  "data-custom-detail-section": "main-garment-details",
});
const addSection = additionalRenderer.root.findByProps({
  "data-custom-detail-section": "add-additional-garment",
});
assert.equal(
  /STANDARD LEG SHORTS|Nikka/i.test(textContent(mainDetails)),
  false,
  "Main Custom Details must not render inactive Nikka sections",
);
assert.equal(
  textContent(mainDetails).includes("Added garment"),
  false,
  "Main Custom Details must not mix Additional Garment options into the Step 1 garments",
);
assert.match(textContent(mainDetails), /Base garment/);
assert.match(textContent(addSection), /Added garment/);
assert.equal(
  mainDetails.findAllByProps({ "data-custom-detail-group": "shirt_construction" }).length,
  1,
  "the Main Shirt construction group remains in the main area",
);
assert.equal(
  addSection.findAllByProps({ "data-custom-detail-group": "shirt_construction" }).length,
  1,
  "the Additional Shirt construction group renders inside Add Additional Garment",
);
assert.ok(
  addSection.findByProps({ "data-added-garment-heading": "true" }),
  "a newly added garment must expose a stable focus target inside Add Additional Garment",
);
assert.ok(
  addSection.findByProps({
    "data-additional-garment-details": additionalAssignment.garmentKey,
  }),
);

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
assert.match(componentSource, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(19rem,24rem\)\]/);
assert.match(componentSource, /lg:sticky lg:top-24/);
assert.doesNotMatch(componentSource, /Not currently included/);
assert.match(componentSource, /Included in your selected design/);
assert.match(componentSource, /data-custom-detail-section="main-garment-details"/);
assert.match(componentSource, /data-additional-garment-details/);
assert.match(componentSource, /partitionCatalogueGroupsByRole/);
assert.match(componentSource, /Added garment/);
assert.match(componentSource, /Add Additional Garment/);
assert.match(componentSource, /additionalGarmentConstructionOptions/);
assert.match(componentSource, /onBeginAdditionalGarment/);
assert.match(componentSource, /onConfirmAdditionalGarmentCustomDetails/);
assert.match(
  componentSource,
  /grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start/,
);
assert.match(
  componentSource,
  /isPersonalizedAdditionalGroup \? noneCard : null/,
);
assert.match(componentSource, /onConstructionSelect/);
assert.match(componentSource, /onClearSelection/);
assert.match(stepperSource, /canEnterCustomDetails/);
assert.match(styleSource, /onContinue/);
assert.match(studioSource, /handleOpenDormantCustomDetailsStage/);
assert.match(studioSource, /handleBeginFutureAdditionalGarment/);
assert.match(studioSource, /custom_details_choice/);
assert.match(studioSource, /isAdditionalGarmentFabricDialogVisible/);
assert.match(studioSource, /reconcileGarmentScopedCustomDetails/);
assert.match(studioSource, /reconcileGarmentScopedPersonalizedInputs/);
assert.match(studioSource, /setGarmentScopedCustomDetailSelection/);
assert.match(studioSource, /futureAdditionalGarmentConstructionOptions/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: future Custom Details stage navigation and scoped state contract");
