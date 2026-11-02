import assert from "node:assert/strict";
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
import { getCustomDetailsStageCompletion } from "./src/utils/customDetailsStageOwnership";
import {
  createCatalogueAdditionalGarmentSelection,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import { reconcileAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentAssignment,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
} from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const MANY_GARMENTS = [
  "shirt",
  "trouser",
  "skirt",
  "dress",
  "kaftan",
] as const satisfies readonly CanonicalPhysicalGarmentType[];
const MAIN_LIST_ID = "personalized-additions-main-garment-list";
const EMPTY_REQUIREMENT_ERROR =
  "Describe your personalized requirement before continuing.";

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const sectionIdsIn = (root: ReactTestInstance): string[] =>
  root
    .findAll(
      (node) => typeof node.props?.["data-custom-detail-section"] === "string",
    )
    .map((node) => String(node.props["data-custom-detail-section"]));

const occurrenceKeysIn = (root: ReactTestInstance): string[] =>
  root
    .findAll(
      (node) =>
        node.type === "h4" &&
        typeof node.props?.["data-custom-detail-occurrence"] === "string",
    )
    .map((node) => String(node.props["data-custom-detail-occurrence"]));

const garmentTypeSelectionFor = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [...garmentTypes],
    selectedDemographic: "female",
    normalizedCustomDetailCatalog: catalogInspection.activeOptions,
  }).selection;

const projectOrder = ({
  garmentTypes,
  existingState = createEmptyGarmentScopedCustomDetailsState(),
  existingInputs = createEmptyGarmentScopedCustomDetailInputs(),
  additionalGarments = [],
  additionalGarmentConstructions,
}: {
  garmentTypes: readonly CanonicalPhysicalGarmentType[];
  existingState?: GarmentScopedCustomDetailsStateV1;
  existingInputs?: GarmentScopedCustomDetailInputsV1;
  additionalGarments?: readonly FabricGarmentAssignment[];
  additionalGarmentConstructions?: ReturnType<
    typeof reconcileAdditionalGarmentConstructionState
  >["state"];
}) => {
  const garmentTypeSelection = garmentTypeSelectionFor(garmentTypes);
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    additionalGarments,
    additionalGarmentConstructions,
    catalogInspection,
    existingState,
  });
  const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs,
  });
  const fullCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation,
    personalizedInputs,
  });
  const completion = getCustomDetailsStageCompletion({
    stage: "personalized_additions",
    completion: fullCompletion,
    reconciliation,
  });
  const catalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection,
    reconciliation,
    activeOptions: catalogInspection.activeOptions,
    additionalGarments,
    additionalGarmentConstructions,
  });
  const pricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation,
    catalogInspection,
  });
  return {
    reconciliation,
    personalizedInputs,
    completion,
    catalogue,
    pricing,
    liveAdditionalGarments: projectAuthorizedAdditionalGarmentAssignments({
      additionalGarmentConstructions,
    }),
  };
};

const renderStep = (
  projected: ReturnType<typeof projectOrder>,
  stage: "custom_details" | "personalized_additions" = "personalized_additions",
) =>
  createElement(DormantFutureCustomDetailsStep, {
    stage,
    reconciliation: projected.reconciliation,
    catalogue: projected.catalogue,
    personalizedInputs: projected.personalizedInputs.state,
    completion: projected.completion,
    pricing: projected.pricing,
    orderLevelCustomDetailsPrice: 0,
    constructionBreakdown: { status: "complete", rows: [] },
    constructionSubtotal: 0,
    designSelections: {},
    selectedStyle: null,
    additionalGarments: projected.liveAdditionalGarments,
    additionalGarmentConstructionOptions: [],
    onSingleSelect: () => undefined,
    onClearSelection: () => undefined,
    onConstructionSelect: () => undefined,
    onToggleMultiSelect: () => undefined,
    onPersonalizedTextChange: () => undefined,
    onDecorativeFeatureEnable: () => undefined,
    onDecorativeFeatureDisable: () => undefined,
    onDecorativeFeatureGarmentAssign: () => undefined,
    onClearDecorativeFeatures: () => undefined,
    onMonogramPlacementChange: () => undefined,
    onMonogramTextChange: () => undefined,
    onAccessoryToggle: () => undefined,
    onClearAccessories: () => undefined,
    onAddAdditionalGarment: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  });

const mainPersonalizedKeys = (projected: ReturnType<typeof projectOrder>) => {
  const group = projected.catalogue.personalizedGroup;
  return group.occurrences
    .filter((occurrence) => occurrence.role === "main")
    .map((occurrence) => occurrence.subject.garmentKey);
};

const forwardButtons = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-studio-nav": "forward" });

const manyGarmentOrder = projectOrder({ garmentTypes: MANY_GARMENTS });
const manyGarmentKeys = mainPersonalizedKeys(manyGarmentOrder);
assert.deepEqual(
  manyGarmentKeys,
  ["base:shirt", "base:trouser", "base:skirt", "base:dress", "base:kaftan"],
  "the fixture order is five base garments, in catalogue order",
);

let manyRenderer!: ReturnType<typeof create>;
act(() => {
  manyRenderer = create(renderStep(manyGarmentOrder));
});

const mainColumn = manyRenderer.root.findByProps({
  "data-studio-step-main": "true",
});
assert.deepEqual(
  sectionIdsIn(mainColumn),
  [
    "monogram-embroidery",
    "accessories",
    "add-additional-garment",
    "miscellaneous-personalized-additional",
  ],
  "Personalized Additions shows Monogram, Accessories, Add Additional Garment, then Miscellaneous",
);
const stageFlow = manyRenderer.root.findAll(
  (node) =>
    node.props?.["data-custom-detail-section"] === "add-additional-garment" ||
    node.props?.["data-custom-detail-section"] ===
      "miscellaneous-personalized-additional" ||
    node.props?.["data-studio-step-footer"] === "true",
);
assert.deepEqual(
  stageFlow.map(
    (node) =>
      node.props["data-custom-detail-section"] ||
      (node.props["data-studio-step-footer"] ? "footer" : ""),
  ),
  [
    "add-additional-garment",
    "miscellaneous-personalized-additional",
    "footer",
  ],
  "Miscellaneous sits after Add Additional Garment and before the bottom Continue row",
);

const mainMiscellaneous = mainColumn.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.equal(
  mainColumn
    .findByProps({ "data-custom-detail-section": "add-additional-garment" })
    .findAllByProps({
      "data-custom-detail-section": "miscellaneous-personalized-additional",
    }).length,
  0,
  "the main Miscellaneous section is not nested inside Add Additional Garment",
);
assert.deepEqual(
  occurrenceKeysIn(mainMiscellaneous),
  manyGarmentKeys.slice(0, 2),
  "a long order starts with only the first two garment cards",
);
assert.equal(
  mainMiscellaneous.findByProps({
    "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  }).props["data-active-occurrences"],
  manyGarmentKeys.length,
  "collapsing the list keeps the full active-occurrence count on the group",
);
const collapsedToggle = mainMiscellaneous.findByProps({
  "data-personalized-garment-list-toggle": "main",
});
assert.equal(textContent(collapsedToggle), "Show all garments (3 more)");
assert.equal(collapsedToggle.props["aria-expanded"], false);
assert.equal(collapsedToggle.props["aria-controls"], MAIN_LIST_ID);
assert.equal(
  mainMiscellaneous.findByProps({
    "data-personalized-additional-garment-list": "main",
  }).props.id,
  MAIN_LIST_ID,
);
const toggleClass = String(collapsedToggle.props.className);
assert.match(toggleClass, /\bmin-h-11\b/, "the toggle keeps a 44px tap target");
assert.match(toggleClass, /\bw-full\b/);
assert.match(toggleClass, /\bmin-w-0\b/);
assert.match(toggleClass, /\bmax-w-full\b/);
assert.match(toggleClass, /\bflex\b/);
const toggleLabel = collapsedToggle.findByType("span");
assert.match(String(toggleLabel.props.className), /\bmin-w-0\b/);
assert.match(String(toggleLabel.props.className), /\bbreak-words\b/);
assert.match(String(toggleLabel.props.className), /whitespace-normal/);
assert.match(toggleClass, /focus-visible:ring-2/);
assert.match(toggleClass, /focus-visible:ring-heritage-gold/);
assert.match(toggleClass, /border-heritage-green/);
assert.equal(collapsedToggle.props.type, "button");

act(() => {
  collapsedToggle.props.onClick();
});
assert.deepEqual(
  occurrenceKeysIn(
    manyRenderer.root.findByProps({
      "data-custom-detail-section": "miscellaneous-personalized-additional",
    }),
  ),
  manyGarmentKeys,
  "Show all garments reveals every base garment, in the same order",
);
const expandedToggle = manyRenderer.root.findByProps({
  "data-personalized-garment-list-toggle": "main",
});
assert.equal(textContent(expandedToggle), "Show fewer garments");
assert.equal(expandedToggle.props["aria-expanded"], true);
assert.equal(expandedToggle.props["aria-controls"], MAIN_LIST_ID);
act(() => {
  expandedToggle.props.onClick();
});
assert.deepEqual(
  occurrenceKeysIn(
    manyRenderer.root.findByProps({
      "data-custom-detail-section": "miscellaneous-personalized-additional",
    }),
  ),
  manyGarmentKeys.slice(0, 2),
  "Show fewer garments returns to the first two cards",
);

const selectedBeyondPreview = manyGarmentKeys[3];
assert.equal(selectedBeyondPreview, "base:dress");
const hiddenWhileSelected = [manyGarmentKeys[2], manyGarmentKeys[4]];
let selectedState = setGarmentScopedCustomDetailSelection(
  manyGarmentOrder.reconciliation.state,
  selectedBeyondPreview,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
);
const selectedEmpty = projectOrder({
  garmentTypes: MANY_GARMENTS,
  existingState: selectedState,
});
assert.equal(selectedEmpty.completion.status, "incomplete");
assert.ok(
  selectedEmpty.completion.blockers.some(
    (blocker) =>
      blocker.code === "personalized_requirement_missing" &&
      blocker.garmentKey === selectedBeyondPreview,
  ),
  "an empty personalized requirement is still a Step 5 blocker",
);
act(() => {
  manyRenderer.update(renderStep(selectedEmpty));
});
const selectedSection = manyRenderer.root.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.deepEqual(
  occurrenceKeysIn(selectedSection),
  [...manyGarmentKeys.slice(0, 2), selectedBeyondPreview],
  "a selected garment past the preview stays visible while the list is collapsed",
);
for (const hiddenKey of hiddenWhileSelected) {
  assert.equal(
    selectedSection.findAll(
      (node) => node.props?.["data-custom-detail-occurrence"] === hiddenKey,
    ).length,
    0,
    `${hiddenKey} stays hidden while it has no Personalized Additional Requirement`,
  );
}
const requirementDetail = selectedSection.findByProps({
  "data-custom-detail-conditional-garment": selectedBeyondPreview,
});
assert.match(textContent(requirementDetail), new RegExp(EMPTY_REQUIREMENT_ERROR));
assert.equal(
  requirementDetail.findByType("textarea").props["aria-invalid"],
  true,
);
assert.equal(
  textContent(
    manyRenderer.root.findByProps({
      "data-personalized-garment-list-toggle": "main",
    }),
  ),
  "Show all garments (2 more)",
);
assert.equal(
  manyRenderer.root.findByProps({ "data-stage-id": "personalized_additions" })
    .props["data-stage-complete"],
  false,
);
const blockedForward = forwardButtons(manyRenderer.root);
assert.equal(blockedForward.length, 2);
assert.ok(
  blockedForward.every((button) => button.props.disabled === true),
  "an empty requirement on a selected garment still blocks Continue",
);

const described = projectOrder({
  garmentTypes: MANY_GARMENTS,
  existingState: selectedState,
  existingInputs: setGarmentScopedCustomDetailText({
    state: createEmptyGarmentScopedCustomDetailInputs(),
    garmentKey: selectedBeyondPreview,
    selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
    text: "Please add a family crest on the left chest.",
  }).state,
});
assert.equal(described.completion.status, "pricing_pending");
act(() => {
  manyRenderer.update(renderStep(described));
});
const describedSection = manyRenderer.root.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.equal(
  textContent(
    describedSection.findByProps({
      "data-custom-detail-conditional-garment": selectedBeyondPreview,
    }),
  ).includes(EMPTY_REQUIREMENT_ERROR),
  false,
);
assert.equal(
  manyRenderer.root.findByProps({ "data-stage-id": "personalized_additions" })
    .props["data-stage-complete"],
  true,
);
assert.ok(
  forwardButtons(manyRenderer.root).every(
    (button) => button.props.disabled === false,
  ),
  "a described requirement no longer blocks Continue",
);
act(() => {
  manyRenderer.unmount();
});

const shortOrder = projectOrder({ garmentTypes: ["shirt", "trouser"] });
assert.deepEqual(mainPersonalizedKeys(shortOrder), ["base:shirt", "base:trouser"]);
let shortRenderer!: ReturnType<typeof create>;
act(() => {
  shortRenderer = create(renderStep(shortOrder));
});
const shortSection = shortRenderer.root.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.deepEqual(occurrenceKeysIn(shortSection), ["base:shirt", "base:trouser"]);
assert.equal(
  shortRenderer.root.findAllByProps({
    "data-personalized-garment-list-toggle": "main",
  }).length,
  0,
  "two garments show every card and no Show all button",
);
act(() => {
  shortRenderer.unmount();
});

const singleGarment = projectOrder({ garmentTypes: ["shirt"] });
let singleRenderer!: ReturnType<typeof create>;
act(() => {
  singleRenderer = create(renderStep(singleGarment));
});
assert.equal(
  singleRenderer.root.findAllByProps({
    "data-personalized-garment-list-toggle": "main",
  }).length,
  0,
  "one garment shows no Show all button",
);
act(() => {
  singleRenderer.unmount();
});

let customDetailsRenderer!: ReturnType<typeof create>;
act(() => {
  customDetailsRenderer = create(renderStep(manyGarmentOrder, "custom_details"));
});
assert.equal(
  customDetailsRenderer.root.findAllByProps({
    "data-custom-detail-section": "miscellaneous-personalized-additional",
  }).length,
  0,
  "Custom Details does not render the Personalized Additions miscellaneous list",
);
assert.equal(
  customDetailsRenderer.root.findAllByProps({
    "data-personalized-garment-list-toggle": "main",
  }).length,
  0,
);
act(() => {
  customDetailsRenderer.unmount();
});

const shirtConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalogInspection.activeOptions,
);
assert.equal(shirtConstruction.status, "resolved");
if (shirtConstruction.status !== "resolved") {
  throw new Error("Expected resolved shirt construction");
}
const additionalAssignments: FabricGarmentAssignment[] = [];
for (let index = 0; index < 3; index += 1) {
  const selection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
      "shirt",
    ]),
    authorizedOccurrenceKeys: additionalAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  });
  assert.equal(selection.status, "resolved");
  if (selection.status !== "resolved" || !selection.selection.garmentSpec) {
    throw new Error("Expected an additional shirt selection");
  }
  additionalAssignments.push({
    garmentKey: selection.selection.garmentSpec.key,
    code: selection.selection.code,
    garmentType: "shirt",
    fabricUnits: 1,
    garmentSpec: selection.selection.garmentSpec,
    sourceRole: "additional",
    eligibilityRule: "catalog_all",
    dependencyStatus: "valid",
    mainGarmentKey: selection.selection.mainGarmentKey,
    mainGarmentType: selection.selection.mainGarmentType,
  });
}
assert.deepEqual(
  additionalAssignments.map((assignment) => assignment.garmentKey),
  ["additional:shirt:1", "additional:shirt:2", "additional:shirt:3"],
);
const additionalConstructions = reconcileAdditionalGarmentConstructionState({
  existingState: {
    schemaVersion: 1,
    byGarmentKey: Object.fromEntries(
      additionalAssignments.map((assignment) => [
        assignment.garmentKey,
        shirtConstruction,
      ]),
    ),
  },
  assignments: [],
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
});
const withAdditional = projectOrder({
  garmentTypes: ["shirt", "trouser", "skirt"],
  additionalGarments: additionalAssignments,
  additionalGarmentConstructions: additionalConstructions.state,
});
let additionalRenderer!: ReturnType<typeof create>;
act(() => {
  additionalRenderer = create(renderStep(withAdditional));
});
const addSection = additionalRenderer.root.findByProps({
  "data-custom-detail-section": "add-additional-garment",
});
assert.equal(
  addSection.findAllByProps({
    "data-personalized-garment-list-toggle": "main",
  }).length,
  0,
  "added garments do not get the main-list Show all button",
);
assert.equal(
  addSection.findAllByProps({
    "data-custom-detail-section": "miscellaneous-personalized-additional",
  }).length,
  0,
);
for (const assignment of additionalAssignments) {
  const block = addSection.findByProps({
    "data-additional-garment-details": assignment.garmentKey,
  });
  const personalized = block.findByProps({
    "data-custom-detail-group": PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  });
  assert.deepEqual(occurrenceKeysIn(personalized), [assignment.garmentKey]);
  assert.match(textContent(personalized), /Personalized Additional Requirement/);
  assert.match(textContent(personalized), /None/);
  assert.equal(
    personalized.findAllByProps({
      "data-custom-detail-conditional-row":
        PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
    }).length,
    0,
    "an unselected added garment still has no requirement textarea",
  );
}
const mainAfterAdditional = additionalRenderer.root.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.deepEqual(occurrenceKeysIn(mainAfterAdditional), [
  "base:shirt",
  "base:trouser",
]);
assert.equal(
  textContent(
    additionalRenderer.root.findByProps({
      "data-personalized-garment-list-toggle": "main",
    }),
  ),
  "Show all garments (1 more)",
);
assert.equal(
  occurrenceKeysIn(mainAfterAdditional).some((key) => key.startsWith("additional:")),
  false,
  "added garments stay out of the collapsed main list",
);
assert.deepEqual(sectionIdsIn(
  additionalRenderer.root.findByProps({ "data-studio-step-main": "true" }),
), [
  "monogram-embroidery",
  "accessories",
  "add-additional-garment",
  "miscellaneous-personalized-additional",
]);
act(() => {
  additionalRenderer.unmount();
});

const garmentsPastPreview = manyGarmentKeys.slice(2);
let everyLaterGarmentSelected = manyGarmentOrder.reconciliation.state;
for (const garmentKey of garmentsPastPreview) {
  everyLaterGarmentSelected = setGarmentScopedCustomDetailSelection(
    everyLaterGarmentSelected,
    garmentKey,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  );
}
const nothingHidden = projectOrder({
  garmentTypes: MANY_GARMENTS,
  existingState: everyLaterGarmentSelected,
});
let nothingHiddenRenderer!: ReturnType<typeof create>;
act(() => {
  nothingHiddenRenderer = create(renderStep(nothingHidden));
});
const nothingHiddenSection = nothingHiddenRenderer.root.findByProps({
  "data-custom-detail-section": "miscellaneous-personalized-additional",
});
assert.deepEqual(
  occurrenceKeysIn(nothingHiddenSection),
  manyGarmentKeys,
  "selected garments past the preview stay visible when none would be hidden",
);
for (const garmentKey of garmentsPastPreview) {
  assert.equal(
    nothingHiddenSection.findAllByProps({
      "data-custom-detail-conditional-garment": garmentKey,
    }).length,
    1,
    `${garmentKey} keeps its requirement textarea when the toggle is omitted`,
  );
}
assert.equal(
  nothingHiddenRenderer.root.findAllByProps({
    "data-personalized-garment-list-toggle": "main",
  }).length,
  0,
  "no toggle when collapsing would hide zero garments",
);
assert.equal(
  textContent(nothingHiddenRenderer.root).includes("Show all garments (0 more)"),
  false,
);
assert.equal(
  textContent(nothingHiddenRenderer.root).includes("Show fewer garments"),
  false,
);
assert.equal(
  nothingHiddenRenderer.root.findByProps({
    "data-stage-id": "personalized_additions",
  }).props["data-stage-complete"],
  false,
  "empty requirements on those selected garments still block Continue",
);
act(() => {
  nothingHiddenRenderer.unmount();
});

console.log("PASS: personalized additions garment list order and collapse");
