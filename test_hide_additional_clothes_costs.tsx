import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  ADDITIONAL_CLOTHES_COST_OPTION_ORDER,
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION,
  CUSTOMER_FACING_ADDITIONAL_CLOTHES_COST_GROUPS,
  CUSTOMER_VISIBLE_ADDITIONAL_CLOTHES_COST_GROUPS,
  DRESS_LINING_OPTION_ID,
  SEED_CUSTOM_DETAIL_CATALOG,
  SHOW_ADDITIONAL_CLOTHES_COSTS,
  isCustomerAvailableCustomDetailSelectionGroup,
  resolveShowAdditionalClothesCosts,
} from "./src/config/GarmentDetailsConfig";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  FutureShippingStateV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  DesignSelections,
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
import { projectActiveCustomerDesignSelections } from "./src/utils/customerAvailableDesignSelections";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogInspection = inspectCustomDetailCatalog([
  ...SEED_CUSTOM_DETAIL_CATALOG,
  {
    ...SEED_CUSTOM_DETAIL_CATALOG.find((option) => option.id === "neck_no_round")!,
    id: "neck_priced_visible_test",
    label: "Visible Priced Neck Option",
    priceCents: 2500,
    displayOrder: 99,
  },
]);
const fabric: Fabric = {
  code: "FAB-HIDE-ACC",
  name: "Hide Additional Costs Fabric",
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
): StyleCategory =>
  ({
    id: `style-${garmentTypes.join("-")}-hide-acc`,
    name: "Hide Additional Costs Style",
    description: "Regression style",
    gender: "female",
    targetDemographic: "female",
    options: [],
    image: "https://example.invalid/hide-acc.jpg",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits: 1,
    })),
  }) as StyleCategory;

const completeRequiredSelections = ({
  garmentTypeSelection,
  style,
  existingState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style: StyleCategory;
  existingState: GarmentScopedCustomDetailsStateV1;
}) => {
  let state = existingState;
  let reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
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
    catalogInspection,
    existingState: state,
  });
};

assert.equal(SHOW_ADDITIONAL_CLOTHES_COSTS, false);
assert.equal(resolveShowAdditionalClothesCosts(), false);
assert.equal(resolveShowAdditionalClothesCosts(true), true);

// TEST G — underlying configuration retained
assert.deepEqual([...ADDITIONAL_CLOTHES_COST_SECTION_ORDER], [
  "shirt_additional",
  "dress_additional",
  "neck_additional",
  "trouser_additional",
  "standard_shorts_additional",
  "bum_shorts_additional",
  "skirt_additional",
  "personalized_additional",
]);
assert.equal(
  ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION.shirt_additional.title,
  "Shirts - Additional",
);
assert.ok(ADDITIONAL_CLOTHES_COST_OPTION_ORDER[DRESS_LINING_OPTION_ID] > 0);
assert.ok(
  SEED_CUSTOM_DETAIL_CATALOG.some((option) => option.id === DRESS_LINING_OPTION_ID),
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("dress_additional"),
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
assert.deepEqual([...CUSTOMER_VISIBLE_ADDITIONAL_CLOTHES_COST_GROUPS], [
  "dress_additional",
]);
assert.equal(isCustomerAvailableCustomDetailSelectionGroup("neck_design"), true);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("personalized_additional"),
  true,
);
assert.equal(
  isCustomerAvailableCustomDetailSelectionGroup("dress_additional", {
    showAdditionalClothesCosts: true,
  }),
  true,
);

const garmentTypes = ["dress", "shirt"] as const;
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: [...garmentTypes],
  selectedDemographic: "female",
  normalizedCustomDetailCatalog: catalogInspection.activeOptions,
}).selection;
const style = makeStyle([...garmentTypes]);

let reconciliation = completeRequiredSelections({
  garmentTypeSelection,
  style,
  existingState: createEmptyGarmentScopedCustomDetailsState(),
});

const dressKey = reconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "dress",
)?.garmentKey;
const shirtKey = reconciliation.subjects.find(
  (subject) => subject.parentGarmentType === "shirt",
)?.garmentKey;
assert.ok(dressKey);
assert.ok(shirtKey);

const neckOption = reconciliation.applicabilityByGarmentKey
  .get(shirtKey)
  ?.groups.find((group) => group.selectionGroup === "neck_design")
  ?.options.find((option) => option.id === "neck_priced_visible_test");
assert.ok(neckOption, "visible priced neck option required for TEST E");
assert.equal(neckOption.priceCents, 2500);

const rawLegacyDesignSelections: DesignSelections = {
  hasLining: true,
  customDetails: {
    dress_additional: [DRESS_LINING_OPTION_ID],
    neck_design: neckOption.id,
  },
  customDetailSnapshots: [
    {
      optionId: DRESS_LINING_OPTION_ID,
      label: "Hidden dress lining",
      description: "Legacy hidden Additional Clothes Costs snapshot",
      garmentGroup: "dress",
      selectionGroup: "dress_additional",
      priceCents: 1000,
    },
    {
      optionId: neckOption.id,
      label: neckOption.label,
      description: neckOption.description,
      garmentGroup: neckOption.garmentGroup,
      selectionGroup: neckOption.selectionGroup,
      priceCents: neckOption.priceCents,
    },
  ],
  decorativeFeatures: ["Name Monogram"],
  accessories: [],
};
const rawLegacySnapshot = JSON.parse(
  JSON.stringify(rawLegacyDesignSelections),
) as DesignSelections;
const activeLegacyDesignSelections = projectActiveCustomerDesignSelections({
  designSelections: rawLegacyDesignSelections,
});
assert.equal(activeLegacyDesignSelections.hasLining, true);
assert.deepEqual(
  activeLegacyDesignSelections.customDetails?.dress_additional,
  [DRESS_LINING_OPTION_ID],
);
assert.equal(
  activeLegacyDesignSelections.customDetails?.neck_design,
  neckOption.id,
);
assert.deepEqual(
  activeLegacyDesignSelections.customDetailSnapshots?.map(
    (snapshot) => snapshot.optionId,
  ),
  [DRESS_LINING_OPTION_ID, neckOption.id],
);
assert.deepEqual(
  activeLegacyDesignSelections.decorativeFeatures,
  rawLegacyDesignSelections.decorativeFeatures,
);
assert.deepEqual(rawLegacyDesignSelections, rawLegacySnapshot);
assert.strictEqual(
  projectActiveCustomerDesignSelections({
    designSelections: rawLegacyDesignSelections,
    showAdditionalClothesCosts: true,
  }),
  rawLegacyDesignSelections,
);

const staleState = setGarmentScopedCustomDetailSelection(
  setGarmentScopedCustomDetailSelection(
    reconciliation.state,
    dressKey,
    "dress_additional",
    [DRESS_LINING_OPTION_ID],
  ),
  shirtKey,
  "neck_design",
  neckOption.id,
);

reconciliation = reconcileGarmentScopedCustomDetails({
  garmentTypeSelection,
  style,
  catalogInspection,
  existingState: staleState,
});

assert.ok(
  enumerateGarmentScopedCustomDetails(reconciliation.state).some(
    (occurrence) =>
      occurrence.selectionGroup === "dress_additional" &&
      occurrence.optionId === DRESS_LINING_OPTION_ID,
  ),
  "existing draft selections remain preserved internally (behavior A)",
);

const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation,
  catalogInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});

const disabledCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection,
  style,
  reconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
});
assert.deepEqual(
  disabledCatalogue.additionalCostGroups.map((group) => group.selectionGroup),
  ["dress_additional"],
);
assert.equal(
  disabledCatalogue.additionalCostGroups.some(
    (group) => group.selectionGroup === "shirt_additional",
  ),
  false,
);

const disabledCompletion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation,
  personalizedInputs,
});
assert.equal(disabledCompletion.status, "complete");
assert.equal(
  disabledCompletion.blockers.some((blocker) =>
    CUSTOMER_FACING_ADDITIONAL_CLOTHES_COST_GROUPS.includes(
      blocker.selectionGroup as (typeof CUSTOMER_FACING_ADDITIONAL_CLOTHES_COST_GROUPS)[number],
    ),
  ),
  false,
);

const disabledPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation,
  catalogInspection,
});
assert.equal(disabledPricing.status, "exact");
if (disabledPricing.status !== "exact") {
  throw new Error("expected exact Custom Details pricing while the section is hidden");
}
assert.ok(
  disabledPricing.lines.some(
    (line) =>
      line.selectionGroup === "dress_additional" &&
      line.optionId === DRESS_LINING_OPTION_ID &&
      line.lineTotalCents === 1000,
  ),
  "Dress additional clothes costs remain priced while other additional-cost groups stay hidden",
);
assert.equal(
  disabledPricing.lines.some((line) => line.selectionGroup === "shirt_additional"),
  false,
);
assert.ok(
  disabledPricing.lines.some(
    (line) =>
      line.selectionGroup === "neck_design" &&
      line.optionId === neckOption.id &&
      line.lineTotalCents === 2500,
  ),
  "visible Custom Detail pricing must remain while the feature is hidden",
);
assert.equal(
  disabledPricing.subtotalCents,
  disabledPricing.lines.reduce(
    (total, line) => total + (line.lineTotalCents || 0),
    0,
  ),
);

const fabricAllocationState = makeAllocationState([...garmentTypes]);
const fabricCompletion = getFutureFabricStageCompletion({
  garmentTypeSelection,
  fabricAllocationState,
  fabrics: [fabric],
});
const materialPricing = resolveFabricAllocationMaterialPricing(
  fabricAllocationState.fabricAllocations,
  [fabric],
);
assert.equal(materialPricing.status, "resolved");
const designStyleSelection = reconcileFutureDesignStyleSelection({
  selectedStyleId: style.id,
  styles: [style],
  garmentTypeSelection,
});
const measurementPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection,
  physicalGarments: getMeasurementPhysicalGarments({
    garmentTypeSelection,
    fabricGarments: fabricAllocationState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
  }),
  garmentScopedCustomDetails: reconciliation.state,
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
const activeOrderDesignSelections = projectActiveCustomerDesignSelections({
  designSelections: {
    hasLining: true,
    customDetails: {
      dress_additional: [DRESS_LINING_OPTION_ID],
    },
  },
});
assert.equal(activeOrderDesignSelections.hasLining, true);
assert.deepEqual(
  activeOrderDesignSelections.customDetails?.dress_additional,
  [DRESS_LINING_OPTION_ID],
);
const dressLegacyPricing = calculateDesignPricing({
  route: "alone",
  design: activeOrderDesignSelections,
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(garmentTypeSelection),
  catalog: catalogInspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection,
});
assert.equal(dressLegacyPricing.customDetailsPrice, 10);
const basePricing = calculateDesignPricing({
  route: "alone",
  design: { accessories: [] },
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(garmentTypeSelection),
  catalog: catalogInspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection,
});
assert.equal(basePricing.customDetailsPrice, 0);

const disabledLegacyPricing = calculateDesignPricing({
  route: "alone",
  design: activeLegacyDesignSelections,
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(garmentTypeSelection),
  catalog: catalogInspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection,
});
const enabledLegacyPricing = calculateDesignPricing({
  route: "alone",
  design: projectActiveCustomerDesignSelections({
    designSelections: rawLegacyDesignSelections,
    showAdditionalClothesCosts: true,
  }),
  materialPricing,
  baseGarmentComposition: getFutureFabricCapacityComposition(garmentTypeSelection),
  catalog: catalogInspection.activeOptions,
  businessSettings,
  garmentConstructionSelectionMode: "garment_type_locked",
  garmentTypeSelection,
});
assert.equal(disabledLegacyPricing.customDetailsPrice, 35);
assert.equal(enabledLegacyPricing.customDetailsPrice, 35);
const aiTryOnWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};

const summaryAuthority = {
  garmentTypeSelection,
  catalogInspection,
  fabricAllocationState,
  fabricCompletion,
  materialPricing,
  designStyleSelection,
  customDetailsReconciliation: reconciliation,
  customDetailsCompletion: disabledCompletion,
  customDetailsPricing: disabledPricing,
  personalizedInputs: personalizedInputs.state,
  aiTryOnWorkflow,
  measurementPlan,
  measurementState,
  basePricing,
};

const summary = projectFutureDesignStudioSummary(summaryAuthority);
assert.equal(
  summary.customDetailsSummary.some((group) =>
    group.occurrences.some(
      (occurrence) => occurrence.selectionGroup === "dress_additional",
    ),
  ),
  true,
);
assert.ok(
  summary.customDetailsSummary.some((group) =>
    group.occurrences.some(
      (occurrence) => occurrence.optionId === neckOption.id,
    ),
  ),
);
assert.equal(
  summary.pricingSummary.customDetailsExactSubtotal,
  disabledPricing.subtotal + basePricing.customDetailsPrice,
);

const deliveryState = (): FutureShippingStateV1 => ({
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
  destinationZoneSource: "customer_provisional",
});

const garmentCount = resolveShippingGarmentPieceCount({
  fabricAllocations: fabricAllocationState.fabricAllocations,
});
const shippingResolution = reconcileFutureShippingState({
  state: deliveryState(),
  garmentCount,
  selectedDesignPrice:
    summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice || null,
});
const selectedDesignCents = Math.round(
  (summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice || 0) * 100,
);
const orderInput: FutureOrderCandidateBuildInput = {
  ...summaryAuthority,
  source: {
    kind: "catalog",
    sourceKey: style.id,
    styleId: style.id,
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
        destinationZoneId: "EUROPE",
      },
    },
    status: "quote_ready",
    quoteReady: true,
    postEindhovenAdjustmentCents: 1900,
    projectedTotalCents: selectedDesignCents + 1900,
    parcelWeightKg: 2,
  },
};
const orderResult = buildFutureOrderCandidate(orderInput);
assert.ok(orderResult.candidate);
assert.equal(
  orderResult.candidate.customDetails.some(
    (detail) => detail.selectionGroup === "dress_additional",
  ),
  true,
);
assert.ok(
  orderResult.candidate.customDetails.some(
    (detail) => detail.optionId === neckOption.id,
  ),
);
assert.match(
  JSON.stringify(orderResult.candidate),
  new RegExp(DRESS_LINING_OPTION_ID),
);
assert.doesNotMatch(JSON.stringify(orderResult.candidate), /"hasLining":true/);

// TEST A / B — section absent; visible sections remain
const disabledStep = createElement(DormantFutureCustomDetailsStep, {
  reconciliation,
  catalogue: disabledCatalogue,
  personalizedInputs: personalizedInputs.state,
  completion: disabledCompletion,
  pricing: disabledPricing,
  orderLevelCustomDetailsPrice: 0,
  constructionBreakdown: { status: "complete", rows: [] },
  constructionSubtotal: basePricing.garmentConstructionSubtotal ?? 0,
  designSelections: activeOrderDesignSelections,
  showAdditionalClothesCosts: false,
  selectedStyle: style,
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
});

let renderer!: ReturnType<typeof create>;
act(() => {
  renderer = create(disabledStep);
});
const rendered = textContent(renderer.root);
assert.equal(
  renderer.root.findAllByProps({
    "data-custom-detail-section": "additional-clothes-costs",
  }).length,
  0,
);
assert.ok(
  renderer.root.findAllByProps({
    "data-custom-detail-section": "dress-additional-clothes-costs",
  }).length > 0,
);
assert.match(rendered, /Additional Clothes Costs/);
assert.doesNotMatch(rendered, /Shirts - Additional/);
assert.doesNotMatch(rendered, /Neck Design - Additional/);
assert.match(rendered, /Dress - Additional/);
assert.match(rendered, /Lining in Dress - to keep dress firm \(in shape\)/);
assert.match(rendered, /Add Additional Garment/);
assert.match(rendered, /Neck Design/i);
assert.ok(
  renderer.root.findAllByProps({ "data-custom-detail-group": "neck_design" })
    .length > 0,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-custom-detail-section": "add-additional-garment",
  }).length,
  1,
);

// TEST H — reactivation via injection (does not mutate production flag)
const enabledCatalogue = projectFutureCustomDetailsCatalogue({
  garmentTypeSelection,
  style,
  reconciliation,
  activeOptions: catalogInspection.activeOptions,
  additionalGarments: [],
  showAdditionalClothesCosts: true,
});
assert.ok(
  enabledCatalogue.additionalCostGroups.some(
    (group) => group.selectionGroup === "dress_additional",
  ),
);
assert.equal(
  enabledCatalogue.additionalCostGroups.find(
    (group) => group.selectionGroup === "dress_additional",
  )?.title,
  "Dress - Additional",
);

const enabledPricing = calculateGarmentScopedCustomDetailsPricing({
  reconciliation,
  catalogInspection,
  showAdditionalClothesCosts: true,
});
assert.ok(
  enabledPricing.lines.some(
    (line) =>
      line.selectionGroup === "dress_additional" &&
      line.optionId === DRESS_LINING_OPTION_ID &&
      line.lineTotalCents === 1000,
  ),
);
assert.equal(enabledPricing.status, "exact");
if (enabledPricing.status !== "exact") {
  throw new Error("expected exact pricing when Additional Clothes Costs are reactivated");
}
assert.equal(enabledPricing.subtotalCents, disabledPricing.subtotalCents);
assert.ok(
  enabledPricing.lines.some(
    (line) =>
      line.selectionGroup === "dress_additional" &&
      line.optionId === DRESS_LINING_OPTION_ID &&
      line.lineTotalCents === 1000,
  ),
);

const enabledCompletion = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation,
  personalizedInputs,
  showAdditionalClothesCosts: true,
});
assert.equal(enabledCompletion.status, "complete");
assert.equal(
  enabledCompletion.blockers.some(
    (blocker) => blocker.selectionGroup === "dress_additional",
  ),
  false,
);

let enabledRenderer!: ReturnType<typeof create>;
act(() => {
  enabledRenderer = create(
    createElement(DormantFutureCustomDetailsStep, {
      ...disabledStep.props,
      catalogue: enabledCatalogue,
      completion: enabledCompletion,
      pricing: enabledPricing,
      orderLevelCustomDetailsPrice: enabledLegacyPricing.customDetailsPrice,
      designSelections: rawLegacyDesignSelections,
      showAdditionalClothesCosts: true,
    }),
  );
});
const enabledRendered = textContent(enabledRenderer.root);
const enabledAdditionalSection = enabledRenderer.root.findByProps({
  "data-custom-detail-section": "additional-clothes-costs",
});
assert.match(enabledRendered, /Additional Clothes Costs/);
assert.doesNotMatch(textContent(enabledAdditionalSection), /Dress - Additional/);
assert.match(textContent(enabledAdditionalSection), /Shirts - Additional|Neck Design - Additional/);
assert.ok(
  enabledRenderer.root.findAllByProps({
    "data-custom-detail-section": "dress-additional-clothes-costs",
  }).length > 0,
);
assert.ok(enabledAdditionalSection.findAllByType("input").length > 0);
assert.equal(
  enabledPricing.lines.find(
    (line) =>
      line.selectionGroup === "dress_additional" &&
      line.optionId === DRESS_LINING_OPTION_ID,
  )?.lineTotalCents,
  1000,
);
assert.equal(
  enabledRenderer.root.findAllByProps({
    "data-custom-detail-group": "personalized_additional",
  }).length > 0,
  true,
);
assert.equal(SHOW_ADDITIONAL_CLOTHES_COSTS, false);

console.log("hide Additional Clothes Costs regression passed.");
