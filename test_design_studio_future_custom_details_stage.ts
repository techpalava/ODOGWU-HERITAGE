import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
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
import type { FabricGarmentAssignment } from "./src/types";
import { createDormantDesignStudioJourneyState } from "./src/utils/designStudioJourneyMode";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

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
};
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
    onDecorativeFeatureToggle: () => undefined,
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
const personalizedLayoutFieldset = neckRenderer.root.findByProps({
  "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
});
assert.match(
  String(personalizedLayoutFieldset.props.className),
  /(?:^|\s)lg:col-span-2(?:\s|$)/,
  "Personalized Additional must span the available Custom Details width",
);
const ordinaryFieldsets = neckRenderer.root
  .findAllByType("fieldset")
  .filter((fieldset) => fieldset !== neckFieldset && fieldset !== personalizedLayoutFieldset);
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

const personalizedFieldset = () => neckRenderer.root.findByProps({
  "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
});
const personalizedOptionGrid = () => neckRenderer.root.findByProps({
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
  neckRenderer.root.findAllByProps({
    "data-custom-detail-conditional-row": PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  }).length,
  0,
  "the conditional detail must remain hidden until Personalized Additional is selected",
);

act(() => {
  personalizedOptionLabel()?.findByType("input").props.onChange();
});
const personalizedDetail = neckRenderer.root.findByProps({
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
  neckRenderer.root
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
  neckRenderer.root.findAllByProps({
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
