import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  DRESS_LINING_OPTION_ID,
  SEED_CUSTOM_DETAIL_CATALOG,
  isCustomerAvailableCustomDetailSelectionGroup,
  isCustomerVisibleAdditionalClothesCostForGarment,
} from "./src/config/GarmentDetailsConfig";
import { CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT } from "./src/config/CustomDetailPhysicalComponentConfig";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  FabricGarmentAssignment,
  FutureShippingStateV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import {
  buildFutureOrderCandidate,
  type FutureOrderCandidateBuildInput,
} from "./src/utils/futureOrderCandidate";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  enumerateGarmentScopedCustomDetails,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { resolveShippingGarmentPieceCount } from "./src/utils/shippingPricing";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import {
  cloneGarmentConstructionPricingResolution,
  reconcileAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const fabric: Fabric = {
  code: "FAB-DRESS-ACC",
  name: "Dress additional costs fabric",
  description: "Regression fabric",
  color: "Indigo",
  colorHex: "#1f3b73",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
};
const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 7.5,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const DRESS_ADDITIONAL_OPTIONS = [
  {
    id: DRESS_LINING_OPTION_ID,
    label: "Lining in Dress - to keep dress firm (in shape)",
    description:
      "Lining is to prevent sheerness, provide a smooth barrier against the skin, and help the outer garment drape elegantly without clinging.",
    priceCents: 1000,
  },
  {
    id: "dress_additional_net",
    label: "Net - to keep dress firm (in shape)",
    description:
      "Netting (or tulle) is used to create dramatic volume, lift, and structure, transforming flat dresses into bouncy, fairytale silhouettes.",
    priceCents: 1000,
  },
  {
    id: "dress_additional_head_wrap",
    label: "Head Wrap / Gear / Skarf",
    description: "Head-Tie (traditional look)",
    priceCents: 1000,
  },
  {
    id: "dress_additional_shoulder_waist_wrap",
    label: "Shoulder or Waist Wrap / Skarf",
    description:
      "Over the Shoulder or around both shoulders or around the Waist",
    priceCents: 1500,
  },
] as const;

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const makeAllocationState = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): FabricAllocationState => ({
  fabricAllocations: garmentTypes.map((garmentType, index) => ({
    allocationId: `allocation-${index + 1}`,
    fabricCode: fabric.code,
    garmentAssignments: [
      {
        garmentKey: `base:${garmentType}`,
        code: `BASE_${garmentType.toUpperCase()}`,
        garmentType,
        fabricUnits: 1,
        sourceRole: "main",
      },
    ],
  })),
  activeAllocationId: "allocation-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const makeStyle = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  gender: StyleCategory["gender"] = "female",
): StyleCategory =>
  ({
    id: `style-${garmentTypes.join("-")}-dress-acc`,
    name: "Dress additional costs style",
    description: "Regression style",
    gender,
    targetDemographic: gender === "male" ? "male" : "female",
    options: [],
    image: "https://example.invalid/dress-acc.jpg",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits: garmentType === "full_length_gown" ? 2 : 1,
    })),
  }) as StyleCategory;

const completeRequiredSelections = ({
  garmentTypeSelection,
  style,
  additionalGarments = [],
  additionalGarmentConstructions,
  existingState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style: StyleCategory;
  additionalGarments?: readonly FabricGarmentAssignment[];
  additionalGarmentConstructions?: ReturnType<
    typeof reconcileAdditionalGarmentConstructionState
  >["state"];
  existingState: GarmentScopedCustomDetailsStateV1;
}) => {
  let state = existingState;
  let reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    additionalGarments,
    additionalGarmentConstructions,
    catalogInspection,
    existingState: state,
  });
  reconciliation.subjects.forEach((subject) => {
    reconciliation.applicabilityByGarmentKey
      .get(subject.garmentKey)
      ?.groups.filter((group) => group.required)
      .forEach((group) => {
        const option = group.options[0];
        if (!option) return;
        state = setGarmentScopedCustomDetailSelection(
          state,
          subject.garmentKey,
          group.selectionGroup,
          group.allowMultiple ? [option.id] : option.id,
        );
      });
  });
  return reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    additionalGarments,
    additionalGarmentConstructions,
    catalogInspection,
    existingState: state,
  });
};

const stepHandlers = {
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
};

assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("dress_additional"),
  true,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("standard_shorts_additional"),
  true,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("shirt_additional"),
  false,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("trouser_additional"),
  false,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("skirt_additional"),
  false,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("bum_shorts_additional"),
  false,
);
assert.equal(
  isCustomerVisibleAdditionalClothesCostForGarment("dress_additional", "dress"),
  true,
);
assert.equal(
  isCustomerVisibleAdditionalClothesCostForGarment(
    "dress_additional",
    "full_length_gown",
  ),
  true,
);
assert.equal(
  isCustomerVisibleAdditionalClothesCostForGarment(
    "standard_shorts_additional",
    "standard_shorts",
  ),
  true,
);
assert.equal(
  isCustomerVisibleAdditionalClothesCostForGarment(
    "standard_shorts_additional",
    "bum_shorts",
  ),
  false,
);
assert.deepEqual(
  CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT.dress[0]?.garmentGroups,
  ["dress", "neck"],
);
assert.deepEqual(
  CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT.full_length_gown[0]?.garmentGroups,
  ["dress", "neck"],
);
assert.deepEqual(
  CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT.standard_shorts[0]?.garmentGroups,
  ["standard_shorts"],
);
assert.deepEqual(
  CUSTOM_DETAIL_PHYSICAL_COMPONENTS_BY_GARMENT.bum_shorts[0]?.garmentGroups,
  ["bum_shorts"],
);

const dressShirtTypes = ["dress", "shirt"] as const;
const dressShirtSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [...dressShirtTypes],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const dressShirtStyle = makeStyle([...dressShirtTypes]);
let dressShirtReconciliation = completeRequiredSelections({
  garmentTypeSelection: dressShirtSelection,
  style: dressShirtStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const dressKey = dressShirtReconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "dress",
)?.garmentKey;
const shirtKey = dressShirtReconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "shirt",
)?.garmentKey;
assert.ok(dressKey);
assert.ok(shirtKey);

dressShirtReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressShirtSelection,
  style: dressShirtStyle,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    setGarmentScopedCustomDetailSelection(
      dressShirtReconciliation.state,
      dressKey,
      "dress_additional",
      DRESS_ADDITIONAL_OPTIONS.map((option) => option.id),
    ),
    shirtKey,
    "shirt_additional",
    "shirt_additional_no_cost",
  ),
});

assert.ok(
  enumerateGarmentScopedCustomDetails(dressShirtReconciliation.state).some(
    (occurrence) =>
      occurrence.selectionGroup === "shirt_additional" &&
      occurrence.optionId === "shirt_additional_no_cost",
  ),
  "hidden Shirt additional selections remain preserved in the raw scoped draft",
);

const dressShirtCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: dressShirtSelection,
  style: dressShirtStyle,
  reconciliation: dressShirtReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
assert.deepEqual(
  dressShirtCatalogue.additionalCostGroups.map((group) => group.selectionGroup),
  ["dress_additional"],
);
assert.equal(
  dressShirtCatalogue.additionalCostGroups.some(
    (group) => group.selectionGroup === "shirt_additional",
  ),
  false,
);

const dressGroup = dressShirtCatalogue.additionalCostGroups.find(
  (group) => group.selectionGroup === "dress_additional",
);
assert.ok(dressGroup);
assert.deepEqual(
  dressGroup.options.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    priceCents: option.priceCents,
  })),
  DRESS_ADDITIONAL_OPTIONS.map((option) => ({ ...option })),
);

const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: dressShirtReconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
const completion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation: dressShirtReconciliation,
  personalizedInputs,
});
assert.equal(completion.status, "complete");
assert.equal(
  completion.blockers.some((blocker) => blocker.selectionGroup === "shirt_additional"),
  false,
  "hidden non-dress additional-cost groups must not block completion",
);

const pricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: dressShirtReconciliation,
  catalogInspection,
});
assert.equal(pricing.status, "exact");
if (pricing.status !== "exact") {
  throw new Error("expected exact Dress additional-cost pricing");
}
assert.deepEqual(
  new Map(
    pricing.lines
      .filter((line) => line.selectionGroup === "dress_additional")
      .map((line) => [line.optionId, line.lineTotalCents]),
  ),
  new Map(DRESS_ADDITIONAL_OPTIONS.map((option) => [option.id, option.priceCents])),
);
assert.equal(
  pricing.lines
    .filter((line) => line.selectionGroup === "dress_additional")
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  4500,
);
assert.equal(
  pricing.lines.some((line) => line.selectionGroup === "shirt_additional"),
  false,
  "hidden Shirt additional selections must not add a charge",
);

const shirtOnlySelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const shirtOnlyStyle = makeStyle(["shirt"]);
const shirtOnlyReconciliation = completeRequiredSelections({
  garmentTypeSelection: shirtOnlySelection,
  style: shirtOnlyStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const shirtOnlyCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: shirtOnlySelection,
  style: shirtOnlyStyle,
  reconciliation: shirtOnlyReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
assert.equal(shirtOnlyCatalogue.additionalCostGroups.length, 0);

const trouserSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["trouser"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const trouserStyle = makeStyle(["trouser"]);
const trouserReconciliation = completeRequiredSelections({
  garmentTypeSelection: trouserSelection,
  style: trouserStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
assert.equal(
  projectFutureCustomDetailsCatalogue({
    garmentTypeSelection: trouserSelection,
    style: trouserStyle,
    reconciliation: trouserReconciliation,
    activeOptions: catalogInspection.activeOptions,
    additionalGarments: [],
  }).additionalCostGroups.length,
  0,
);

const gownSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["full_length_gown"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const gownStyle = makeStyle(["full_length_gown"]);
let gownReconciliation = completeRequiredSelections({
  garmentTypeSelection: gownSelection,
  style: gownStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const gownKey = gownReconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "full_length_gown",
)?.garmentKey;
assert.ok(gownKey);
assert.ok(
  gownReconciliation.subjects
    .find((subject) => subject.garmentKey === gownKey)
    ?.garmentGroups.includes("dress"),
  "Long Dress participates in the Dress-owned physical grouping",
);
gownReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: gownSelection,
  style: gownStyle,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    gownReconciliation.state,
    gownKey,
    "dress_additional",
    DRESS_ADDITIONAL_OPTIONS.map((option) => option.id),
  ),
});
const gownCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: gownSelection,
  style: gownStyle,
  reconciliation: gownReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
const gownDressGroup = gownCatalogue.additionalCostGroups.find(
  (group) => group.selectionGroup === "dress_additional",
);
assert.ok(gownDressGroup);
assert.ok(
  gownDressGroup.occurrences.some(
    (occurrence) => occurrence.subject.parentGarmentType === "full_length_gown",
  ),
  "Long Dress must receive Dress additional clothes costs",
);
assert.deepEqual(
  gownDressGroup.options.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    priceCents: option.priceCents,
  })),
  DRESS_ADDITIONAL_OPTIONS.map((option) => ({ ...option })),
);
const gownPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: gownReconciliation,
  catalogInspection,
});
assert.equal(gownPricing.status, "exact");
if (gownPricing.status !== "exact") {
  throw new Error("expected exact Long Dress additional-cost pricing");
}
assert.deepEqual(
  new Map(
    gownPricing.lines
      .filter((line) => line.selectionGroup === "dress_additional")
      .map((line) => [line.optionId, line.lineTotalCents]),
  ),
  new Map(DRESS_ADDITIONAL_OPTIONS.map((option) => [option.id, option.priceCents])),
);
assert.equal(
  gownPricing.lines
    .filter((line) => line.selectionGroup === "dress_additional")
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  4500,
);

const uploadedDressSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["dress"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const uploadedDressStyle = makeStyle(["dress"]);
const uploadedDressReconciliation = completeRequiredSelections({
  garmentTypeSelection: uploadedDressSelection,
  style: uploadedDressStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const uploadedDressCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: uploadedDressSelection,
  style: uploadedDressStyle,
  reconciliation: uploadedDressReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
assert.ok(
  uploadedDressCatalogue.additionalCostGroups.some(
    (group) =>
      group.selectionGroup === "dress_additional" &&
      group.occurrences.some(
        (occurrence) => occurrence.subject.parentGarmentType === "dress",
      ),
  ),
  "Dress additional costs remain available for effective/uploaded Dress journeys",
);

const addition = createCatalogueAdditionalGarmentSelection({
  garmentType: "dress",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
});
assert.equal(addition.status, "resolved");
if (addition.status !== "resolved") {
  throw new Error("expected an additional Dress assignment");
}
const additionalDress: FabricGarmentAssignment = {
  garmentKey: addition.selection.garmentSpec!.key,
  code: addition.selection.code,
  garmentType: "dress",
  fabricUnits: 1,
  sourceRole: "additional",
  eligibilityRule: "catalog_all",
  dependencyStatus: "valid",
  mainGarmentKey: addition.selection.mainGarmentKey,
  mainGarmentType: addition.selection.mainGarmentType,
};
const dressConstruction = resolveGarmentConstructionPricing(
  "dress",
  catalogInspection.activeOptions,
);
assert.equal(dressConstruction.status, "resolved");
if (dressConstruction.status !== "resolved") {
  throw new Error("expected dress construction pricing");
}
const additionalConstructions = reconcileAdditionalGarmentConstructionState({
  existingState: {
    schemaVersion: 1,
    byGarmentKey: {
      [additionalDress.garmentKey]:
        cloneGarmentConstructionPricingResolution(dressConstruction),
    },
  },
  assignments: [additionalDress],
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
});
const shirtPlusAddedDress = completeRequiredSelections({
  garmentTypeSelection: shirtOnlySelection,
  style: shirtOnlyStyle,
  additionalGarments: [additionalDress],
  additionalGarmentConstructions: additionalConstructions.state,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const addedDressCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: shirtOnlySelection,
  style: shirtOnlyStyle,
  reconciliation: shirtPlusAddedDress,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [additionalDress],
  additionalGarmentConstructions: additionalConstructions.state,
});
assert.ok(
  addedDressCatalogue.additionalCostGroups.some(
    (group) =>
      group.selectionGroup === "dress_additional" &&
      group.occurrences.some(
        (occurrence) => occurrence.subject.parentGarmentKey === additionalDress.garmentKey,
      ),
  ),
  "an added Dress garment must receive Dress additional clothes costs",
);

const dressOnlySelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["dress"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const dressOnlyStyle = makeStyle(["dress"]);
const secondDressAddition = createCatalogueAdditionalGarmentSelection({
  garmentType: "dress",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["dress"]),
});
assert.equal(secondDressAddition.status, "resolved");
if (secondDressAddition.status !== "resolved") {
  throw new Error("expected a second Dress occurrence");
}
const secondDress: FabricGarmentAssignment = {
  garmentKey: secondDressAddition.selection.garmentSpec!.key,
  code: secondDressAddition.selection.code,
  garmentType: "dress",
  fabricUnits: 1,
  sourceRole: "additional",
  eligibilityRule: "catalog_all",
  dependencyStatus: "valid",
  mainGarmentKey: secondDressAddition.selection.mainGarmentKey,
  mainGarmentType: secondDressAddition.selection.mainGarmentType,
};
const secondDressConstructions = reconcileAdditionalGarmentConstructionState({
  existingState: {
    schemaVersion: 1,
    byGarmentKey: {
      [secondDress.garmentKey]:
        cloneGarmentConstructionPricingResolution(dressConstruction),
    },
  },
  assignments: [secondDress],
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
});
let twoDressReconciliation = completeRequiredSelections({
  garmentTypeSelection: dressOnlySelection,
  style: dressOnlyStyle,
  additionalGarments: [secondDress],
  additionalGarmentConstructions: secondDressConstructions.state,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const baseDressKey = twoDressReconciliation.subjects.find(
  (subject) =>
    subject.parentGarmentType === "dress" &&
    subject.parentGarmentKey !== secondDress.garmentKey,
)?.garmentKey;
assert.ok(baseDressKey);
assert.notEqual(baseDressKey, secondDress.garmentKey);
twoDressReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressOnlySelection,
  style: dressOnlyStyle,
  additionalGarments: [secondDress],
  additionalGarmentConstructions: secondDressConstructions.state,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    twoDressReconciliation.state,
    baseDressKey,
    "dress_additional",
    [DRESS_LINING_OPTION_ID],
  ),
});
const oneLiningPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: twoDressReconciliation,
  catalogInspection,
});
assert.equal(
  oneLiningPricing.lines.filter(
    (line) =>
      line.selectionGroup === "dress_additional" &&
      line.optionId === DRESS_LINING_OPTION_ID,
  ).length,
  1,
);
assert.equal(
  oneLiningPricing.lines
    .filter(
      (line) =>
        line.selectionGroup === "dress_additional" &&
        line.optionId === DRESS_LINING_OPTION_ID,
    )
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  1000,
);
assert.equal(
  enumerateGarmentScopedCustomDetails(twoDressReconciliation.state).some(
    (occurrence) =>
      occurrence.garmentKey === secondDress.garmentKey &&
      occurrence.optionId === DRESS_LINING_OPTION_ID,
  ),
  false,
  "selecting Lining on one Dress must not select it on the other",
);
twoDressReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressOnlySelection,
  style: dressOnlyStyle,
  additionalGarments: [secondDress],
  additionalGarmentConstructions: secondDressConstructions.state,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    twoDressReconciliation.state,
    secondDress.garmentKey,
    "dress_additional",
    [DRESS_LINING_OPTION_ID],
  ),
});
const twoLiningPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: twoDressReconciliation,
  catalogInspection,
});
assert.equal(
  twoLiningPricing.lines
    .filter(
      (line) =>
        line.selectionGroup === "dress_additional" &&
        line.optionId === DRESS_LINING_OPTION_ID,
    )
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  2000,
);
twoDressReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: dressOnlySelection,
  style: dressOnlyStyle,
  additionalGarments: [secondDress],
  additionalGarmentConstructions: secondDressConstructions.state,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    twoDressReconciliation.state,
    secondDress.garmentKey,
    "dress_additional",
    [],
  ),
});
const deselectedLiningPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: twoDressReconciliation,
  catalogInspection,
});
assert.equal(
  deselectedLiningPricing.lines
    .filter(
      (line) =>
        line.selectionGroup === "dress_additional" &&
        line.optionId === DRESS_LINING_OPTION_ID,
    )
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  1000,
);

const nikkaSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["standard_shorts"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const nikkaStyle = makeStyle(["standard_shorts"], "male");
let nikkaReconciliation = completeRequiredSelections({
  garmentTypeSelection: nikkaSelection,
  style: nikkaStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const nikkaKey = nikkaReconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "standard_shorts",
)?.garmentKey;
assert.ok(nikkaKey);
nikkaReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: nikkaSelection,
  style: nikkaStyle,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    nikkaReconciliation.state,
    nikkaKey,
    "standard_shorts_additional",
    ["standard_shorts_additional_combat_pockets"],
  ),
});
const nikkaCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: nikkaSelection,
  style: nikkaStyle,
  reconciliation: nikkaReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
const nikkaGroup = nikkaCatalogue.additionalCostGroups.find(
  (group) => group.selectionGroup === "standard_shorts_additional",
);
assert.ok(nikkaGroup);
assert.deepEqual(
  nikkaGroup.options.map((option) => ({
    id: option.id,
    label: option.label,
    description: option.description,
    priceCents: option.priceCents,
  })),
  [
    {
      id: "standard_shorts_additional_combat_pockets",
      label: "Combat (Extra side hip-pockets)",
      description: "Additional combat-style pockets at the sides of the hips.",
      priceCents: 500,
    },
  ],
);
const nikkaPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: nikkaReconciliation,
  catalogInspection,
});
assert.equal(
  nikkaPricing.lines
    .filter(
      (line) =>
        line.optionId === "standard_shorts_additional_combat_pockets",
    )
    .reduce((total, line) => total + (line.lineTotalCents || 0), 0),
  500,
);
nikkaReconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection: nikkaSelection,
  style: nikkaStyle,
  catalogInspection,
  existingState: setGarmentScopedCustomDetailSelection(
    nikkaReconciliation.state,
    nikkaKey,
    "standard_shorts_additional",
    [],
  ),
});
const nikkaDeselectedPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation: nikkaReconciliation,
  catalogInspection,
});
assert.equal(
  nikkaDeselectedPricing.lines.some(
    (line) => line.optionId === "standard_shorts_additional_combat_pockets",
  ),
  false,
);

const bumSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["bum_shorts"],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const bumStyle = makeStyle(["bum_shorts"]);
const bumReconciliation = completeRequiredSelections({
  garmentTypeSelection: bumSelection,
  style: bumStyle,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});
const bumCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection: bumSelection,
  style: bumStyle,
  reconciliation: bumReconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
assert.equal(
  bumCatalogue.additionalCostGroups.some(
    (group) =>
      group.selectionGroup === "standard_shorts_additional" &&
      group.occurrences.length > 0,
  ),
  false,
  "Bum Shorts must not receive Nikka Combat",
);
assert.equal(
  bumCatalogue.additionalCostGroups.some(
    (group) =>
      group.selectionGroup === "dress_additional" &&
      group.occurrences.length > 0,
  ),
  false,
  "Bum Shorts must not receive Dress additions",
);

const fabricAllocationState = makeAllocationState([...dressShirtTypes]);
const fabricCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection: dressShirtSelection,
  fabricAllocationState,
  fabrics: [fabric],
});
const materialPricing = resolveFabricAllocationMaterialPricing(
  fabricAllocationState.fabricAllocations,
  [fabric],
);
assert.equal(materialPricing.status, "resolved");
const designStyleSelection = reconcileFutureDesignStyleSelection({
  selectedStyleId: dressShirtStyle.id,
  styles: [dressShirtStyle],
  garmentTypeSelection: dressShirtSelection,
});
const measurementPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: dressShirtSelection,
  physicalGarments: getMeasurementPhysicalGarments({
    garmentTypeSelection: dressShirtSelection,
  }),
  garmentScopedCustomDetails: dressShirtReconciliation.state,
});
let measurementState = createEmptyFutureMeasurementState("low_risk", "inch");
for (const requirement of measurementPlan.requirements.filter(
  (candidate) => candidate.directInput,
)) {
  measurementState = setFutureMeasurementInput({
    state: measurementState,
    requirement,
    displayValue: 10,
  });
}
measurementState = reconcileFutureMeasurementState({
  state: measurementState,
  plan: measurementPlan,
});
const basePricing = calculateDesignPricing({
  route: "alone",
  design: { accessories: [] },
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(dressShirtSelection),
  catalog: catalogInspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection: dressShirtSelection,
});
const summary = projectFutureDesignStudioSummary({
  step1GarmentTypeSelection: dressShirtSelection,
  garmentTypeSelection: dressShirtSelection,
  designSourceKind: "catalogue",
  catalogInspection,
  fabricAllocationState,
  fabricCompletion,
  materialPricing,
  designStyleSelection,
  customDetailsReconciliation: dressShirtReconciliation,
  customDetailsCompletion: completion,
  customDetailsPricing: pricing,
  personalizedInputs: personalizedInputs.state,
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  } as AiTryOnWorkflowStateV1,
  measurementPlan,
  measurementState,
  basePricing,
});
assert.ok(
  summary.customDetailsSummary.some((group) =>
    group.occurrences.some(
      (occurrence) =>
        occurrence.selectionGroup === "dress_additional" &&
        occurrence.optionId === "dress_additional_shoulder_waist_wrap" &&
        occurrence.priceCents === 1500,
    ),
  ),
);
assert.equal(
  summary.customDetailsSummary.some((group) =>
    group.occurrences.some(
      (occurrence) => occurrence.selectionGroup === "shirt_additional",
    ),
  ),
  false,
);

const garmentCount = resolveShippingGarmentPieceCount({
  fabricAllocations: fabricAllocationState.fabricAllocations,
});
const shippingState = (): FutureShippingStateV1 => ({
  ...createEmptyFutureShippingState(),
  fulfilmentMethod: "destination_delivery",
  customerInformation: {
    fullName: "Ada Lovelace",
    phone: "+31 6 1234 5678",
    email: "ada@example.com",
    deliveryAddress: {
      addressLine1: "1 Heritage Way",
      addressLine2: "Suite 4",
      city: "Eindhoven",
      postalCode: "5611 AA",
      countryCode: "NL",
    },
    comment: "Call before delivery.",
  },
  destinationZoneId: "EUROPE",
  destinationZoneSource: "iso_resolved",
});
const shippingResolution = reconcileFutureShippingState({
  state: shippingState(),
  garmentCount,
  selectedDesignPrice:
    summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice || null,
});
const selectedDesignCents = Math.round(
  (summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice || 0) * 100,
);
const orderInput: FutureOrderCandidateBuildInput = {
  ...{
    step1GarmentTypeSelection: dressShirtSelection,
    designSourceKind: "catalogue",
    garmentTypeSelection: dressShirtSelection,
    catalogInspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    customDetailsReconciliation: dressShirtReconciliation,
    customDetailsCompletion: completion,
    customDetailsPricing: pricing,
    personalizedInputs: personalizedInputs.state,
    aiTryOnWorkflow: {
      schemaVersion: 1,
      status: "skipped",
      inputFingerprint: null,
    } as AiTryOnWorkflowStateV1,
    measurementPlan,
    measurementState,
    basePricing,
  },
  source: {
    kind: "catalog",
    sourceKey: dressShirtStyle.id,
    styleId: dressShirtStyle.id,
  },
  shippingResolution: {
    ...shippingResolution,
    state: {
      ...shippingResolution.state,
      quoteReference: {
        tariffVersion: "test-current-tariff-v1",
        ruleId: "test-current-europe-rule",
        ruleFingerprint: "test-current-rule-fingerprint",
        inputFingerprint: "test-current-input-fingerprint",
        garmentCount,
        weightKg: 2,
        weightTier: "0_2",
        destinationZoneId: "EUROPE",
        quoteRequired: false,
      },
    },
    status: "quote_ready",
    quoteReady: true,
    quoteRequired: false,
    postEindhovenAdjustmentCents: 1900,
    projectedTotalCents: selectedDesignCents + 1900,
    parcelWeightKg: 2,
    weightTier: "0_2",
    rateVersion: "step8-delivery-v1",
  },
};
const orderResult = buildFutureOrderCandidate(orderInput);
assert.ok(orderResult.candidate);
assert.deepEqual(
  orderResult.candidate.customDetails
    .filter((detail) => detail.selectionGroup === "dress_additional")
    .map((detail) => detail.optionId)
    .sort(),
  DRESS_ADDITIONAL_OPTIONS.map((option) => option.id).slice().sort(),
);
assert.equal(
  orderResult.candidate.customDetails.some(
    (detail) => detail.selectionGroup === "shirt_additional",
  ),
  false,
);

let dressRenderer!: ReturnType<typeof create>;
act(() => {
  dressRenderer = create(
    createElement(DormantFutureCustomDetailsStep, {
      reconciliation: dressShirtReconciliation,
      catalogue: dressShirtCatalogue,
      personalizedInputs: personalizedInputs.state,
      completion,
      pricing,
      orderLevelCustomDetailsPrice: 0,
      constructionBreakdown: { status: "complete", rows: [] },
      constructionSubtotal: basePricing.garmentConstructionSubtotal ?? 0,
      designSelections: { accessories: [] },
      showAdditionalClothesCosts: false,
      selectedStyle: dressShirtStyle,
      additionalGarments: [],
      additionalGarmentConstructionOptions: [],
      ...stepHandlers,
    }),
  );
});
const dressRendered = textContent(dressRenderer.root);
assert.equal(
  dressRenderer.root.findAllByProps({
    "data-custom-detail-section": "additional-clothes-costs",
  }).length,
  0,
  "the bulky Additional Clothes Costs section stays closed for Dress-only extras",
);
const companion = dressRenderer.root.findByProps({
  "data-custom-detail-section": "dress-additional-clothes-costs",
});
const companionLayout = dressRenderer.root.findByProps({
  "data-dress-additional-layout": "companion",
});
assert.match(String(companionLayout.props.className), /auto-fit/);
assert.match(
  String(companionLayout.props.className),
  /minmax\(min\(100%,24rem\),1fr\)/,
);
assert.match(String(companionLayout.props.className), /min-w-0/);
assert.match(
  String(companionLayout.parent?.props.className || ""),
  /overflow-x-hidden/,
);
assert.match(dressRendered, /Lining in Dress - to keep dress firm \(in shape\)/);
assert.match(dressRendered, /Net - to keep dress firm \(in shape\)/);
assert.match(dressRendered, /Head Wrap \/ Gear \/ Skarf/);
assert.match(dressRendered, /Head-Tie \(traditional look\)/);
assert.match(dressRendered, /Shoulder or Waist Wrap \/ Skarf/);
assert.match(dressRendered, /\+€10\.00/);
assert.match(dressRendered, /\+€15\.00/);
assert.doesNotMatch(dressRendered, /Shirts - Additional/);
assert.doesNotMatch(dressRendered, /Leg Pants \(Trouser\) - Additional/);
assert.equal(
  companion.findAllByProps({ "data-custom-detail-group": "dress_additional" })
    .length,
  1,
);

let shirtRenderer!: ReturnType<typeof create>;
act(() => {
  shirtRenderer = create(
    createElement(DormantFutureCustomDetailsStep, {
      reconciliation: shirtOnlyReconciliation,
      catalogue: shirtOnlyCatalogue,
      personalizedInputs: createEmptyGarmentScopedCustomDetailInputs(),
      completion: validateGarmentScopedCustomDetailsCompletion({
        earlierStagesComplete: true,
        reconciliation: shirtOnlyReconciliation,
      }),
      pricing: calculateGarmentScopedCustomDetailsPricing({
        reconciliation: shirtOnlyReconciliation,
        catalogInspection,
      }),
      orderLevelCustomDetailsPrice: 0,
      constructionBreakdown: { status: "complete", rows: [] },
      constructionSubtotal: 0,
      designSelections: { accessories: [] },
      showAdditionalClothesCosts: false,
      selectedStyle: shirtOnlyStyle,
      additionalGarments: [],
      additionalGarmentConstructionOptions: [],
      ...stepHandlers,
    }),
  );
});
assert.equal(
  shirtRenderer.root.findAllByProps({
    "data-custom-detail-section": "dress-additional-clothes-costs",
  }).length,
  0,
);
assert.doesNotMatch(textContent(shirtRenderer.root), /Shirts - Additional/);

const renderStep = ({
  reconciliation,
  catalogue,
  style,
  additionalGarments = [],
}: {
  reconciliation: typeof gownReconciliation;
  catalogue: ReturnType<typeof projectFutureCustomDetailsCatalogue>;
  style: StyleCategory;
  additionalGarments?: readonly FabricGarmentAssignment[];
}) => {
  const inputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const stepCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation,
    personalizedInputs: inputs,
  });
  const stepPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation,
    catalogInspection,
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureCustomDetailsStep, {
        reconciliation,
        catalogue,
        personalizedInputs: inputs.state,
        completion: stepCompletion,
        pricing: stepPricing,
        orderLevelCustomDetailsPrice: 0,
        constructionBreakdown: { status: "complete", rows: [] },
        constructionSubtotal: 0,
        designSelections: { accessories: [] },
        showAdditionalClothesCosts: false,
        selectedStyle: style,
        additionalGarments: [...additionalGarments],
        additionalGarmentConstructionOptions: [],
        ...stepHandlers,
      }),
    );
  });
  return renderer;
};

const gownRenderer = renderStep({
  reconciliation: gownReconciliation,
  catalogue: gownCatalogue,
  style: gownStyle,
});
const gownRendered = textContent(gownRenderer.root);
assert.ok(
  gownRenderer.root.findAllByProps({
    "data-custom-detail-section": "dress-additional-clothes-costs",
  }).length > 0,
);
assert.match(gownRendered, /Lining in Dress - to keep dress firm \(in shape\)/);
assert.match(gownRendered, /Net - to keep dress firm \(in shape\)/);
assert.match(gownRendered, /Head Wrap \/ Gear \/ Skarf/);
assert.match(gownRendered, /Shoulder or Waist Wrap \/ Skarf/);
assert.match(gownRendered, /\+€10\.00/);
assert.match(gownRendered, /\+€15\.00/);

const nikkaRenderer = renderStep({
  reconciliation: nikkaReconciliation,
  catalogue: nikkaCatalogue,
  style: nikkaStyle,
});
const nikkaRendered = textContent(nikkaRenderer.root);
assert.ok(
  nikkaRenderer.root.findAllByProps({
    "data-custom-detail-section": "standard-shorts-additional-clothes-costs",
  }).length > 0,
);
assert.match(nikkaRendered, /Combat \(Extra side hip-pockets\)/);
assert.match(nikkaRendered, /\+€5\.00/);
assert.doesNotMatch(nikkaRendered, /Lining in Dress/);

const bumRenderer = renderStep({
  reconciliation: bumReconciliation,
  catalogue: bumCatalogue,
  style: bumStyle,
});
const bumRendered = textContent(bumRenderer.root);
assert.equal(
  bumRenderer.root.findAllByProps({
    "data-custom-detail-section": "standard-shorts-additional-clothes-costs",
  }).length,
  0,
);
assert.doesNotMatch(bumRendered, /Combat \(Extra side hip-pockets\)/);
assert.doesNotMatch(bumRendered, /Lining in Dress/);

console.log("PASS: Dress Additional Clothes Costs are customer-visible with companion layout");
