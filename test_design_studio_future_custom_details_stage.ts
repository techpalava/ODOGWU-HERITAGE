import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, useRef, useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { DesignStudioOrderSummary } from "./src/components/DesignStudioOrderSummary";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  calculateGarmentScopedCustomDetailsPricing,
  projectAuthorizedAdditionalGarmentAssignments,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  resolveFutureCustomDetailPhysicalSubjects,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  clearGarmentScopedCustomDetailSelection,
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
import {
  createCatalogueAdditionalGarmentSelection,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import {
  reconcileAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import type {
  DecorativeFeature,
  DesignStudioStageId,
  FabricGarmentAssignment,
} from "./src/types";
import { createDormantDesignStudioJourneyState } from "./src/utils/designStudioJourneyMode";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import type { LiveOrderSummaryView } from "./src/utils/designStudioLiveOrderSummary";

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
let personalizedLayoutRenderer: ReturnType<typeof create> | null = null;
const refreshNeckLayout = (
  nextState: typeof neckLayoutReconciliation.state,
  nextInputs = neckLayoutInputs.state,
) => {
  neckLayoutReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: neckLayoutGarmentTypeSelection,
    catalogInspection,
    existingState: nextState,
  });
  neckLayoutInputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: neckLayoutReconciliation,
    catalogInspection,
    existingInputs: nextInputs,
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
  personalizedLayoutRenderer?.update(
    createNeckStep({ stage: "personalized_additions" }),
  );
};
const createNeckStep = ({
  stage = "custom_details",
  constructionBreakdown = { status: "complete" as const, rows: [] },
  constructionSubtotal = 0,
  orderLevelCustomDetailsPrice = 0,
  onDecorativeFeatureToggle = () => undefined,
}: {
  stage?: "custom_details" | "personalized_additions";
  constructionBreakdown?: Parameters<typeof DormantFutureCustomDetailsStep>[0]["constructionBreakdown"];
  constructionSubtotal?: number | null;
  orderLevelCustomDetailsPrice?: number;
  onDecorativeFeatureToggle?: (feature: DecorativeFeature) => void;
} = {}) =>
  createElement(DormantFutureCustomDetailsStep, {
    stage,
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
      refreshNeckLayout(
        setGarmentScopedCustomDetailSelection(
          neckLayoutReconciliation.state,
          garmentKey,
          selectionGroup,
          optionId,
        ),
      );
    },
    onClearSelection: (garmentKey, selectionGroup) => {
      refreshNeckLayout(
        clearGarmentScopedCustomDetailSelection(
          neckLayoutReconciliation.state,
          garmentKey,
          selectionGroup,
        ),
      );
    },
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: (garmentKey, selectionGroup, optionId) => {
      refreshNeckLayout(
        setGarmentScopedCustomDetailSelection(
          neckLayoutReconciliation.state,
          garmentKey,
          selectionGroup,
          optionId,
        ),
      );
    },
    onPersonalizedTextChange: (garmentKey, selectionGroup, optionId, text) => {
      refreshNeckLayout(
        neckLayoutReconciliation.state,
        setGarmentScopedCustomDetailText({
          state: neckLayoutInputs.state,
          garmentKey,
          selectionGroup,
          optionId,
          text,
        }).state,
      );
    },
    onDecorativeFeatureToggle,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onAddAdditionalGarment: () => undefined,
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
act(() => {
  personalizedLayoutRenderer = create(
    createNeckStep({ stage: "personalized_additions" }),
  );
});
assert.equal(
  neckRenderer.root.findAllByProps({
    "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  }).length,
  0,
  "Step 4 must not render Personalized Additional",
);
const personalizedLayoutFieldset = personalizedLayoutRenderer.root.findByProps({
  "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
});
assert.match(
  String(personalizedLayoutFieldset.props.className),
  /(?:^|\s)lg:col-span-2(?:\s|$)/,
  "Personalized Additional must span the available Custom Details width",
);

const selectableDecorativeEvents: DecorativeFeature[] = [];
let selectableDecorativeRenderer!: ReturnType<typeof create>;
act(() => {
  selectableDecorativeRenderer = create(
    createNeckStep({
      stage: "personalized_additions",
      onDecorativeFeatureToggle: (feature) => {
        selectableDecorativeEvents.push(feature);
      },
    }),
  );
});
for (const feature of [
  "Name Monogram",
  "Embroidery",
  "Monogram Trimming",
] as const) {
  const card = selectableDecorativeRenderer.root
    .findAllByType("label")
    .find((label) =>
      textContent(label).includes(feature) &&
      label.findAllByType("input").some(
        (input) => input.props.type === "checkbox",
      ),
    );
  assert.ok(card, `${feature} renders as a Step 5 customer option`);
  const checkbox = card.findByType("input");
  assert.equal(
    checkbox.props.disabled,
    undefined,
    `${feature} remains selectable when selected Design Style metadata is absent`,
  );
  assert.doesNotMatch(
    textContent(card),
    /Not available for the current design\./,
  );
  act(() => {
    checkbox.props.onChange();
  });
}
assert.deepEqual(
  selectableDecorativeEvents,
  ["Name Monogram", "Embroidery", "Monogram Trimming"],
  "Step 5 forwards every customer decorative selection without a Design Style availability gate",
);
act(() => selectableDecorativeRenderer.unmount());

const ordinaryFieldsets = neckRenderer.root
  .findAllByType("fieldset")
  .filter((fieldset) => fieldset !== neckFieldset);
assert.ok(
  ordinaryFieldsets.length > 0,
  "Rendered tree must contain at least one ordinary non-spanning fieldset",
);
assert.ok(
  ordinaryFieldsets.every(
    (fieldset) => !String(fieldset.props.className).includes("lg:col-span-2"),
  ),
  "Only the wide-option Custom Details fieldsets may span the full layout",
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
  /(?:^|\s)space-y-\S+/.test(String(noneLabel.parent?.props.className)),
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
        String(label.props.className).includes("min-h-20") &&
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

const personalizedFieldset = () => personalizedLayoutRenderer!.root.findByProps({
  "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
});
const personalizedOptionGrid = () => personalizedLayoutRenderer!.root.findByProps({
  "data-custom-detail-option-grid": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
});
const personalizedOptionLabel = () => personalizedFieldset()
  .findAllByType("label")
  .find((label) => textContent(label).includes("Personalized Additional Requirement"));
const personalizedNoneLabel = () => personalizedFieldset()
  .findAllByType("label")
  .find((label) => textContent(label).trim().startsWith("None"));

assert.ok(personalizedNoneLabel(), "Personalized Additional must retain None");
assert.ok(
  personalizedOptionLabel(),
  "Personalized Additional must retain its evaluation-required option",
);
assert.ok(
  !textContent(personalizedOptionLabel() || null).includes(
    "Additional cost will depend on evaluation of personalized needs.",
  ),
  "the concise Personalized card must not carry the selected-only evaluation explanation",
);
assert.ok(
  !textContent(personalizedOptionLabel() || null).includes(
    "Confirmed after tailoring review",
  ),
  "the concise Personalized card must not carry the selected-only review notice",
);
assert.equal(personalizedNoneLabel()?.findByType("input").props.checked, true);
assert.match(
  String(personalizedOptionGrid().props.className),
  /sm:grid-cols-2/,
  "Personalized Additional must retain its two peer choices",
);
assert.equal(
  personalizedNoneLabel()?.parent,
  personalizedOptionGrid(),
  "None must share the personalized option grid",
);
assert.equal(
  personalizedOptionLabel()?.parent?.parent,
  personalizedOptionGrid(),
  "the personalized option card must share the same option grid as None",
);
const ordinaryOptionGrids = neckRenderer.root
  .findAll((node) => node.props["data-custom-detail-option-grid"])
  .filter(
    (grid) =>
      grid.props["data-custom-detail-option-grid"] !==
      PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  );
assert.ok(
  ordinaryOptionGrids.length > 0,
  "the rendered Step 4 catalogue must include ordinary option groups",
);
assert.ok(
  ordinaryOptionGrids.every(
    (grid) => !String(grid.props.className).includes("sm:grid-cols-2"),
  ),
  "ordinary Step 4 option groups must keep one vertical option stack inside their category column",
);
const ordinaryNoneLabel = ordinaryOptionGrids
  .flatMap((grid) => grid.findAllByType("label"))
  .find((label) => textContent(label).trim().startsWith("None"));
const ordinaryOptionLabel = ordinaryOptionGrids
  .flatMap((grid) => grid.findAllByType("label"))
  .find((label) => !textContent(label).trim().startsWith("None"));
assert.ok(ordinaryNoneLabel, "ordinary option groups must retain None");
assert.ok(ordinaryOptionLabel, "ordinary option groups must retain their options");
assert.ok(
  [ordinaryNoneLabel, ordinaryOptionLabel].every((label) =>
    ["min-h-20", "items-start", "gap-3", "p-3"].every((token) =>
      String(label?.props.className).includes(token),
    ),
  ),
  "None and ordinary choices must share the same normal option-card geometry",
);
assert.equal(
  personalizedLayoutRenderer!.root.findAllByProps({
    "data-custom-detail-conditional-row": PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  }).length,
  0,
  "the conditional detail must remain hidden until Personalized Additional is selected",
);

act(() => {
  personalizedOptionLabel()?.findByType("input").props.onChange();
});
const personalizedDetail = personalizedLayoutRenderer!.root.findByProps({
  "data-custom-detail-conditional-row": PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
});
assert.equal(
  personalizedDetail.props["data-custom-detail-conditional-group"],
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  "the conditional detail must remain associated with Personalized Additional",
);
assert.ok(
  textContent(personalizedDetail).includes(
    "Additional cost will depend on evaluation of personalized needs.",
  ),
  "the selected-only detail must retain the evaluation explanation",
);
assert.ok(
  textContent(personalizedDetail).includes("Confirmed after tailoring review"),
  "the selected-only detail must retain the tailoring-review notice",
);
assert.equal(
  personalizedDetail.parent,
  personalizedOptionGrid().parent,
  "the conditional detail must be a full-width sibling of the option grid",
);
assert.ok(
  personalizedDetail.parent!.children.indexOf(personalizedDetail) >
    personalizedDetail.parent!.children.indexOf(personalizedOptionGrid()),
  "the conditional detail must follow the entire option grid",
);
const personalizedTextarea = personalizedDetail.findByType("textarea");
act(() => {
  personalizedTextarea.props.onChange({ target: { value: "Add a family crest on the left chest." } });
});
assert.equal(
  personalizedLayoutRenderer!.root
    .findByProps({
      "data-custom-detail-conditional-row": PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
    })
    .findByType("textarea").props.value,
  "Add a family crest on the left chest.",
  "the displayed conditional detail must retain the selected option's persisted text",
);
assert.equal(
  neckLayoutReconciliation.state.selectionsByGarmentKey["base:shirt"]?.[
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP
  ],
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  "selecting Personalized Additional must retain the existing selection authority",
);
act(() => {
  personalizedNoneLabel()?.findByType("input").props.onChange();
});
assert.equal(personalizedNoneLabel()?.findByType("input").props.checked, true);
assert.equal(
  personalizedLayoutRenderer!.root.findAllByProps({
    "data-custom-detail-conditional-row": PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  }).length,
  0,
  "selecting None must hide the personalized detail without changing the option catalogue",
);

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
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
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
const additionalConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalogInspection.activeOptions,
);
assert.equal(additionalConstruction.status, "resolved");
if (additionalConstruction.status !== "resolved") {
  throw new Error("Expected resolved additional shirt construction");
}
const additionalConstructions = reconcileAdditionalGarmentConstructionState({
  existingState: {
    schemaVersion: 1,
    byGarmentKey: {
      [additionalAssignment.garmentKey]: additionalConstruction,
    },
  },
  assignments: [],
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
});
const liveAdditionalGarments = projectAuthorizedAdditionalGarmentAssignments({
  additionalGarmentConstructions: additionalConstructions.state,
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
const additionalStepProps = {
  stage: "personalized_additions" as const,
  reconciliation: additionalReconciliation,
  catalogue: additionalCatalogue,
  personalizedInputs: additionalInputs.state,
  completion: additionalCompletion,
  pricing: additionalPricing,
  orderLevelCustomDetailsPrice: 0,
  constructionBreakdown: { status: "complete" as const, rows: [] },
  constructionSubtotal: 0,
  designSelections: {},
  selectedStyle: null,
  additionalGarments: liveAdditionalGarments,
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
  fabricAllocationState: {
    fabricAllocations: [],
    activeAllocationId: null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
  onBack: () => undefined,
  onContinue: () => undefined,
};
act(() => {
  additionalRenderer = create(
    createElement(DormantFutureCustomDetailsStep, additionalStepProps),
  );
});
const addSection = additionalRenderer.root.findByProps({
  "data-custom-detail-section": "add-additional-garment",
});
assert.equal(
  additionalRenderer.root.findAllByProps({
    "data-custom-detail-section": "main-garment-details",
  }).length,
  0,
  "Step 5 must not duplicate Step 4 main-garment Custom Details",
);
assert.equal(
  /STANDARD LEG SHORTS|Nikka/i.test(textContent(addSection)),
  false,
  "Additional Garment details must not render inactive Nikka sections",
);
assert.equal(
  textContent(addSection).includes("Base garment"),
  false,
  "Step 5 Additional Garment details must not duplicate the base garment",
);
assert.match(textContent(addSection), /Added garment/);
assert.equal(
  addSection.findAllByProps({ "data-custom-detail-group": "shirt_construction" }).length,
  1,
  "the Additional Shirt construction group renders inside Step 5 Add Additional Garment",
);
assert.ok(
  addSection.findByProps({ "data-added-garment-heading": "true" }),
  "a newly added garment must expose a stable focus target inside Add Additional Garment",
);

let additionalContextRenderer!: ReturnType<typeof create>;
act(() => {
  additionalContextRenderer = create(
    createElement(DormantFutureCustomDetailsStep, {
      ...additionalStepProps,
      stage: "custom_details",
      fabrics: [
        { code: "FAB-BASE", name: "Base Fabric", image: "https://example.test/base.jpg" },
        { code: "FAB-ADDED", name: "Added Fabric", image: "https://example.test/added.jpg" },
      ] as unknown as Parameters<typeof DormantFutureCustomDetailsStep>[0]["fabrics"],
      fabricAllocationState: {
        fabricAllocations: [
          {
            allocationId: "allocation-base-shirt",
            fabricCode: "FAB-BASE",
            garmentAssignments: [{
              garmentKey: "base:shirt",
              code: "BASE_SHIRT",
              garmentType: "shirt",
              fabricUnits: 1,
              garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
              sourceRole: "main",
              dependencyStatus: "valid",
            }],
          },
          {
            allocationId: "allocation-added-shirt",
            fabricCode: "FAB-ADDED",
            garmentAssignments: [{
              ...additionalAssignment,
              dependencyStatus: "valid",
            }],
          },
        ],
        activeAllocationId: null,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      } as Parameters<typeof DormantFutureCustomDetailsStep>[0]["fabricAllocationState"],
      removalTargets: [{
        garmentKey: "base:shirt",
        occurrenceLabel: "Standard Shirt",
        roleLabel: "Base garment",
        canRequestRemoval: true,
      }] as unknown as Parameters<typeof DormantFutureCustomDetailsStep>[0]["removalTargets"],
    }),
  );
});
const baseContext = additionalContextRenderer.root.findByProps({
  "data-step4-garment-context": "base:shirt",
});
const addedContext = additionalContextRenderer.root.findByProps({
  "data-step4-garment-context": additionalAssignment.garmentKey,
});
assert.match(textContent(baseContext), /Base Fabric/);
assert.match(textContent(addedContext), /Added Fabric/);
assert.equal(
  additionalContextRenderer.root.findAllByProps({ "data-garment-removal-list": "custom_details" }).length,
  0,
  "Step 4 must not mount a direct garment-removal control",
);
assert.equal(
  additionalContextRenderer.root.findAllByProps({ "data-garment-removal-button": "base:shirt" }).length,
  0,
  "Step 4 keeps garment removal owned by the existing correction flow",
);
act(() => additionalContextRenderer.unmount());

let personalizedContextRenderer!: ReturnType<typeof create>;
act(() => {
  personalizedContextRenderer = create(
    createElement(DormantFutureCustomDetailsStep, {
      ...additionalStepProps,
      stage: "personalized_additions",
      fabrics: [
        { code: "FAB-BASE", name: "Base Fabric", image: "https://example.test/base.jpg" },
        { code: "FAB-ADDED", name: "Added Fabric", image: "https://example.test/added.jpg" },
      ] as unknown as Parameters<typeof DormantFutureCustomDetailsStep>[0]["fabrics"],
      fabricAllocationState: {
        fabricAllocations: [
          {
            allocationId: "allocation-base-shirt",
            fabricCode: "FAB-BASE",
            garmentAssignments: [{
              garmentKey: "base:shirt",
              code: "BASE_SHIRT",
              garmentType: "shirt",
              fabricUnits: 1,
              garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
              sourceRole: "main",
              dependencyStatus: "valid",
            }],
          },
          {
            allocationId: "allocation-added-shirt",
            fabricCode: "FAB-ADDED",
            garmentAssignments: [{
              ...additionalAssignment,
              dependencyStatus: "valid",
            }],
          },
        ],
        activeAllocationId: null,
        pendingFabricGarment: null,
        awaitingFabricForPendingGarment: false,
      } as Parameters<typeof DormantFutureCustomDetailsStep>[0]["fabricAllocationState"],
    }),
  );
});
const step5BaseContext = personalizedContextRenderer.root.findByProps({
  "data-step5-garment-context": "base:shirt",
});
const step5AddedContext = personalizedContextRenderer.root.findByProps({
  "data-step5-garment-context": additionalAssignment.garmentKey,
});
assert.match(textContent(step5BaseContext), /Shirt/);
assert.match(textContent(step5BaseContext), /Base Fabric/);
assert.match(textContent(step5AddedContext), /Added Fabric/);
assert.match(textContent(step5AddedContext), /Additional/);
assert.equal(
  personalizedContextRenderer.root.findAllByProps({
    "data-change-additional-garment-fabric": additionalAssignment.garmentKey,
  }).length,
  0,
  "Step 5 context remains read-only; Fabric changes stay in Step 2 authority",
);
assert.equal(
  personalizedContextRenderer.root.findAllByProps({
    "data-garment-removal-list": "personalized_additions",
  }).length,
  0,
  "Step 5 uses compact garment context cards instead of the redundant garments-in-order list",
);
assert.equal(
  personalizedContextRenderer.root.findAllByProps({
    "data-garment-removal-button": "base:shirt",
  }).length,
  0,
  "base garment context is read-only and has no removal control in Step 5",
);
assert.equal(
  personalizedContextRenderer.root.findAllByProps({
    "data-step4-garment-context": "base:shirt",
  }).length,
  0,
  "Step 4 context hooks remain scoped to Step 4",
);
act(() => personalizedContextRenderer.unmount());
assert.equal(
  addSection.props["data-additional-garment-management"],
  "true",
  "the Additional Garment management section exposes the section-level focus target",
);
assert.equal(
  addSection
    .findByProps({ "data-additional-garment-management-heading": "true" })
    .props.tabIndex,
  -1,
  "the section-level Additional Garment focus target is programmatically focusable",
);
assert.ok(
  addSection.findByProps({
    "data-additional-garment-details": additionalAssignment.garmentKey,
  }),
);
assert.equal(
  addSection.findAllByProps({
    "data-change-additional-garment-fabric": additionalAssignment.garmentKey,
  }).length,
  0,
  "Step 5 keeps Fabric reassignment in Step 2 rather than exposing a repair control",
);

const originalWindow = globalThis.window;
Object.assign(globalThis, {
  window: {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: (timestamp: number) => void) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame: () => undefined,
  },
});
const navigationEvents: string[] = [];
const exactRepairControl = {
  focus: () => navigationEvents.push("exact-focus"),
  scrollIntoView: () => navigationEvents.push("exact-scroll"),
};
const exactGarmentTarget = {
  dataset: { parentGarmentKey: additionalAssignment.garmentKey },
  querySelector: (selector: string) =>
    selector === "[data-added-garment-heading]"
      ? exactRepairControl
      : null,
  setAttribute: () => undefined,
  removeAttribute: () => undefined,
};
const sectionFocusTarget = {
  focus: () => navigationEvents.push("section-focus"),
  scrollIntoView: () => navigationEvents.push("section-scroll"),
};
const additionalManagementTarget = {
  querySelector: (selector: string) =>
    selector === "[data-additional-garment-management-heading]"
      ? sectionFocusTarget
      : null,
  setAttribute: () => undefined,
  removeAttribute: () => undefined,
};
const contentNodeMock = {
  querySelectorAll: (selector: string) =>
    selector === "[data-parent-garment-key]" ? [exactGarmentTarget] : [],
  querySelector: (selector: string) =>
    selector === "[data-additional-garment-management]"
      ? additionalManagementTarget
      : null,
};
const handledNavigationRequests: number[] = [];
let navigationRenderer!: ReturnType<typeof create>;
const createNavigationRequestStep = (
  requestId: number,
  focusGarmentKey: string | null,
) =>
  createElement(DormantFutureCustomDetailsStep, {
    ...additionalStepProps,
    focusAdditionalGarmentKey: focusGarmentKey,
    additionalGarmentNavigationRequestId: requestId,
    onAdditionalGarmentNavigationHandled: (handledRequestId) => {
      handledNavigationRequests.push(handledRequestId);
    },
  });
try {
  act(() => {
    navigationRenderer = create(
      createNavigationRequestStep(1, additionalAssignment.garmentKey),
      {
        createNodeMock: (element) => {
          const props = element.props as { className?: unknown };
          return element.type === "div" &&
            props.className === "min-w-0 space-y-4"
            ? contentNodeMock
            : null;
        },
      },
    );
  });
  act(() => {
    navigationRenderer.update(
      createNavigationRequestStep(2, additionalAssignment.garmentKey),
    );
  });
  act(() => {
    navigationRenderer.update(createNavigationRequestStep(3, null));
  });
  assert.deepEqual(
    handledNavigationRequests,
    [1, 2, 3],
    "each Order Summary request is consumed independently, including repeated Step 5 clicks",
  );
  assert.deepEqual(
    navigationEvents,
    [
      "exact-scroll",
      "exact-focus",
      "exact-scroll",
      "exact-focus",
      "section-scroll",
      "section-focus",
    ],
    "Step 5 navigation focuses the exact Additional occurrence, then its management section",
  );

  // Exercise the persistent Summary callback and its Step 5 consumer in one
  // production-component tree. This catches a request that is emitted by the
  // Summary but never reaches the rendered exact Additional occurrence.
  const persistentSummaryView: LiveOrderSummaryView = {
    sections: [
      {
        id: "construction",
        title: "Garment Construction",
        editStage: "garment_type",
        lines: [],
        subsections: [
          {
            id: "additional_garments",
            title: "Additional Garments",
            editStage: "personalized_additions",
            focusGarmentKey: additionalAssignment.garmentKey,
            lines: [
              {
                id: `construction-${additionalAssignment.garmentKey}`,
                label: "Shirt 2",
                detail: "Standard Shirt",
                supportingDetail: "Fabric: Needs fabric",
                amountLabel: null,
              },
            ],
          },
        ],
      },
    ],
    totalStatus: "hidden",
    totalLabel: "",
    totalValueLabel: "",
    totalAmountCents: null,
    quoteRequired: false,
  };
  const persistentSummaryNavigationEvents: string[] = [];
  const persistentSummaryFabricRequests: string[] = [];
  const PersistentSummaryStep5Harness = () => {
    const nextRequestIdRef = useRef(0);
    const [focusGarmentKey, setFocusGarmentKey] = useState<string | null>(null);
    const [requestId, setRequestId] = useState<number | null>(null);
    return createElement(
      "div",
      null,
      createElement(DesignStudioOrderSummary, {
        view: persistentSummaryView,
        unlockedStages: new Set<DesignStudioStageId>(["personalized_additions"]),
        currentStageId: "personalized_additions",
        onEditStage: (stage, options) => {
          assert.equal(stage, "personalized_additions");
          setFocusGarmentKey(options?.focusAdditionalGarmentKey || null);
          nextRequestIdRef.current += 1;
          setRequestId(nextRequestIdRef.current);
        },
      }),
      createElement(DormantFutureCustomDetailsStep, {
        ...additionalStepProps,
        focusAdditionalGarmentKey: focusGarmentKey,
        additionalGarmentNavigationRequestId: requestId,
        onAdditionalGarmentNavigationHandled: (handledRequestId) => {
          persistentSummaryNavigationEvents.push(String(handledRequestId));
          setRequestId((current) =>
            current === handledRequestId ? null : current,
          );
        },
        onChangeAdditionalGarmentFabric: (garmentKey: string) => {
          persistentSummaryFabricRequests.push(garmentKey);
        },
      }),
    );
  };
  let persistentSummaryRenderer!: ReturnType<typeof create>;
  act(() => {
    persistentSummaryRenderer = create(
      createElement(PersistentSummaryStep5Harness),
      {
        createNodeMock: (element) => {
          const props = element.props as { className?: unknown };
          return element.type === "div" &&
            props.className === "min-w-0 space-y-4"
            ? contentNodeMock
            : null;
        },
      },
    );
  });
  const persistentEdit = () =>
    persistentSummaryRenderer.root.findByProps({
      "data-testid": "live-order-summary-edit-additional_garments",
    });
  act(() => {
    persistentEdit().props.onClick();
  });
  act(() => {
    persistentEdit().props.onClick();
  });
  assert.deepEqual(
    persistentSummaryNavigationEvents,
    ["1", "2"],
    "repeated persistent Summary edits reach the rendered exact Additional target independently",
  );
  assert.deepEqual(
    navigationEvents.slice(-4),
    ["exact-scroll", "exact-focus", "exact-scroll", "exact-focus"],
    "persistent Summary edits visibly focus and scroll the exact Step 5 occurrence",
  );
  assert.equal(
    persistentSummaryFabricRequests.length,
    0,
    "Step 5 does not expose a Fabric-change action",
  );
  act(() => persistentSummaryRenderer.unmount());
} finally {
  act(() => navigationRenderer.unmount());
  Object.assign(globalThis, { window: originalWindow });
}

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

assert.match(componentSource, /stage = "custom_details"/);
assert.match(componentSource, /Personalized Additions/);
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
assert.match(componentSource, /additionalGarmentNavigationRequestId/);
assert.match(componentSource, /lastHandledAdditionalGarmentNavigationRequestIdRef/);
assert.match(componentSource, /data-additional-garment-management/);
assert.match(componentSource, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
assert.match(componentSource, /partitionCatalogueGroupsByRole/);
assert.match(componentSource, /Added garment/);
assert.match(componentSource, /Add Additional Garment/);
assert.match(componentSource, /additionalGarmentConstructionOptions/);
assert.match(componentSource, /onConstructionSelect/);
assert.match(componentSource, /onClearSelection/);
assert.match(componentSource, /data-step4-garment-context/);
assert.match(componentSource, /getAssignedFabricForGarment\(context\.garmentKey\)/);
assert.doesNotMatch(componentSource, /Garments in this order/);
assert.doesNotMatch(componentSource, /data-garment-removal-list/);
assert.match(stepperSource, /canEnterCustomDetails/);
assert.match(styleSource, /onContinue/);
assert.match(studioSource, /handleOpenDormantCustomDetailsStage/);
assert.match(studioSource, /reconcileGarmentScopedCustomDetails/);
assert.match(studioSource, /reconcileGarmentScopedPersonalizedInputs/);
assert.match(studioSource, /setGarmentScopedCustomDetailSelection/);
assert.match(studioSource, /futureAdditionalGarmentConstructionOptions/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: future Custom Details stage navigation and scoped state contract");
