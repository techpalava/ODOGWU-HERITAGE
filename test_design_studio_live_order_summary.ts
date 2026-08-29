import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  FutureShippingStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { createAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  inspectCustomDetailCatalog,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
  cancelFutureFabricCatalogueAssignment,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import {
  LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL,
  LIVE_ORDER_SUMMARY_OWN_DESIGN_DETAIL,
  LIVE_ORDER_SUMMARY_OWN_DESIGN_TITLE,
  LIVE_ORDER_SUMMARY_PENDING_LABEL,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
  LIVE_ORDER_SUMMARY_HEADING,
  LIVE_ORDER_SUMMARY_TOTAL_LABEL,
  LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  projectDesignStudioLiveOrderSummary,
  shouldShowPersistentLiveOrderSummary,
} from "./src/utils/designStudioLiveOrderSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { createEmptyAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import { reconcileAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const inspection = inspectCustomDetailCatalog(catalog);
const skipWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
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

const fabricA: Fabric = {
  id: "fabric-a",
  code: "FAB-A",
  name: "Royal Forest Mosaic",
  description: "Fabric A",
  color: "Green",
  colorHex: "#0A4A33",
  price: 10,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Ankara",
};
const fabricB: Fabric = {
  id: "fabric-b",
  code: "FAB-B",
  name: "Imperial Sapphire Link",
  description: "Fabric B",
  color: "Blue",
  colorHex: "#002397",
  price: 12,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Ankara",
};
const fabricC: Fabric = {
  id: "fabric-c",
  code: "FAB-C",
  name: "Golden Heritage Weave",
  description: "Fabric C",
  color: "Gold",
  colorHex: "#C5A46A",
  price: 11,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Ankara",
};

const unitsFor = (garmentType: string): 1 | 2 =>
  garmentType === "full_length_gown" || garmentType === "agbada" ? 2 : 1;

const buildSelection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]> = "male",
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const emptyAllocation = (): FabricAllocationState => ({
  fabricAllocations: [],
  activeAllocationId: null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const allocationFor = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  fabricByGarment: Record<string, Fabric>,
): FabricAllocationState => {
  const byCode = new Map<string, FabricAllocationState["fabricAllocations"][number]>();
  garmentTypes.forEach((garmentType) => {
    const fabric = fabricByGarment[garmentType] || fabricA;
    const existing = byCode.get(fabric.code);
    const assignment = {
      garmentKey: `base:${garmentType}`,
      code: `BASE_${garmentType.toUpperCase()}`,
      garmentType,
      fabricUnits: unitsFor(garmentType),
      sourceRole: "main" as const,
    };
    if (existing) {
      existing.garmentAssignments.push(assignment);
      return;
    }
    byCode.set(fabric.code, {
      allocationId: `allocation-${byCode.size + 1}`,
      fabricCode: fabric.code,
      garmentAssignments: [assignment],
    });
  });
  const fabricAllocations = [...byCode.values()];
  return {
    fabricAllocations,
    activeAllocationId: fabricAllocations[0]?.allocationId || null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
};

const makeStyle = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]> = "male",
): StyleCategory =>
  ({
    id: `style-${garmentTypes.join("-")}`,
    name: "Royal Senator Classic",
    description: "A compatible catalog style.",
    gender: demographic,
    targetDemographic: demographic,
    options: [],
    image: "https://example.invalid/catalog-style.jpg",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits: unitsFor(garmentType),
    })),
  }) as StyleCategory;

const withContact = (
  state: FutureShippingStateV1,
): FutureShippingStateV1 => ({
  ...state,
  customerInformation: {
    ...state.customerInformation,
    fullName: "Ada Lovelace",
    phone: "+31 6 1234 5678",
    email: "ada@example.com",
  },
});

const withDelivery = (
  countryCode: string,
  city: string,
  extras: { stateRegion?: string; postalCode?: string } = {},
): FutureShippingStateV1 => ({
  ...withContact(createEmptyFutureShippingState()),
  fulfilmentMethod: "destination_delivery",
  customerInformation: {
    ...withContact(createEmptyFutureShippingState()).customerInformation,
    deliveryAddress: {
      addressLine1: "1 Heritage Way",
      addressLine2: "",
      city,
      stateRegion: extras.stateRegion || "",
      postalCode: extras.postalCode || "5611 AA",
      countryCode,
    },
  },
});

const section = (
  view: ReturnType<typeof projectDesignStudioLiveOrderSummary>,
  id: string,
) => {
  const found = view.sections.find((candidate) => candidate.id === id);
  assert.ok(found, `missing live summary section ${id}`);
  return found;
};

const hiddenSection = (
  view: ReturnType<typeof projectDesignStudioLiveOrderSummary>,
  id: string,
) => {
  assert.equal(
    view.sections.some((candidate) => candidate.id === id),
    false,
    `${id} must stay hidden until committed`,
  );
};

const buildAuthority = ({
  garmentTypes = ["shirt"] as GarmentTypeStepSelection["garmentTypes"],
  demographic = "male" as NonNullable<GarmentTypeStepSelection["demographic"]>,
  fabricByGarment,
  fabricAllocationState,
  includeStyle = true,
  customState = createEmptyGarmentScopedCustomDetailsState(),
  measurementRoute = null as "low_risk" | "medium_risk" | "high_risk" | null,
  completeMeasurements = true,
  shippingState = null as FutureShippingStateV1 | null,
  additionalPending = false,
}: {
  garmentTypes?: GarmentTypeStepSelection["garmentTypes"];
  demographic?: NonNullable<GarmentTypeStepSelection["demographic"]>;
  fabricByGarment?: Record<string, Fabric>;
  fabricAllocationState?: FabricAllocationState;
  includeStyle?: boolean;
  customState?: ReturnType<typeof createEmptyGarmentScopedCustomDetailsState>;
  measurementRoute?: "low_risk" | "medium_risk" | "high_risk" | null;
  completeMeasurements?: boolean;
  shippingState?: FutureShippingStateV1 | null;
  additionalPending?: boolean;
}) => {
  const garmentTypeSelection = buildSelection(garmentTypes, demographic);
  let allocation =
    fabricAllocationState ||
    (fabricByGarment
      ? allocationFor(garmentTypes, fabricByGarment)
      : emptyAllocation());
  if (additionalPending && allocation.pendingFabricGarment) {
    allocation = {
      ...allocation,
      awaitingFabricForPendingGarment: true,
    };
  }
  const fabrics = [fabricA, fabricB, fabricC];
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: allocation,
    fabrics,
  });
  const materialPricing =
    allocation.fabricAllocations.length > 0
      ? resolveFabricAllocationMaterialPricing(
          allocation.fabricAllocations,
          fabrics,
        )
      : null;
  const style = makeStyle(garmentTypes, demographic);
  const designStyleSelection = includeStyle
    ? reconcileFutureDesignStyleSelection({
        selectedStyleId: style.id,
        styles: [style],
        garmentTypeSelection,
      })
    : reconcileFutureDesignStyleSelection({
        selectedStyleId: null,
        styles: [style],
        garmentTypeSelection,
      });
  const additionalAssignments = allocation.fabricAllocations.flatMap(
    (item) =>
      item.garmentAssignments.filter(
        (assignment) => assignment.sourceRole === "additional",
      ),
  );
  const additionalConstruction = reconcileAdditionalGarmentConstructionState({
    existingState: createEmptyAdditionalGarmentConstructionState(),
    assignments: additionalAssignments,
    normalizedCustomDetailCatalog: catalog,
  });
  const customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    additionalGarments: additionalAssignments,
    additionalGarmentConstructions: additionalConstruction.state,
    style: includeStyle ? style : null,
    catalogInspection: inspection,
    existingState: customState,
  });
  const personalizedReconciliation = customDetailsReconciliation
    ? reconcileGarmentScopedPersonalizedInputs({
        reconciliation: customDetailsReconciliation,
        catalogInspection: inspection,
        existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
      })
    : null;
  const customDetailsCompletion = customDetailsReconciliation
    ? validateGarmentScopedCustomDetailsCompletion({
        earlierStagesComplete:
          fabricCompletion.isComplete && includeStyle,
        reconciliation: customDetailsReconciliation,
        personalizedInputs: personalizedReconciliation || undefined,
        showAdditionalClothesCosts: false,
      })
    : null;
  const customDetailsPricing = customDetailsReconciliation
    ? calculateGarmentScopedCustomDetailsPricing({
        reconciliation: customDetailsReconciliation,
        catalogInspection: inspection,
        showAdditionalClothesCosts: false,
      })
    : null;
  const measurementPlan = planMeasurementRequirements({
    route: measurementRoute || "low_risk",
    garmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({
      garmentTypeSelection,
      fabricGarments: allocation.fabricAllocations.flatMap(
        (item) => item.garmentAssignments,
      ),
    }),
    garmentScopedCustomDetails:
      customDetailsReconciliation?.state ||
      createEmptyGarmentScopedCustomDetailsState(),
  });
  let measurementState = createEmptyFutureMeasurementState(
    measurementRoute,
    "inch",
  );
  if (completeMeasurements && measurementRoute) {
    for (const requirement of measurementPlan.requirements.filter(
      (candidate) => candidate.directInput,
    )) {
      measurementState = setFutureMeasurementInput({
        state: measurementState,
        requirement,
        displayValue: 10,
      });
    }
  }
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const resolvedMaterialPricing =
    materialPricing?.status === "resolved" ? materialPricing : null;
  const basePricing =
    resolvedMaterialPricing && includeStyle
      ? calculateDesignPricing({
          route: "alone",
          design: {
            additionalGarmentConstructions: additionalConstruction.state,
          },
          materialPricing: resolvedMaterialPricing,
          decorativeFeatureApplicabilityStyle: style,
          baseGarmentComposition: getFutureFabricCapacityComposition(
            garmentTypeSelection,
          ),
          additionalGarments: additionalAssignments,
          catalog,
          businessSettings,
          garmentConstructionSelectionMode: "garment_type_locked",
          garmentTypeSelection,
        })
      : null;
  const summaryInput = {
    garmentTypeSelection,
    catalogInspection: inspection,
    fabricAllocationState: allocation,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation?.state || null,
    aiTryOnWorkflow: skipWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
  };
  const summary = projectFutureDesignStudioSummary(summaryInput);
  const selectedDesignPrice =
    summary.pricingSummary.status === "exact"
      ? (summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice ??
        null)
      : null;
  const shippingResolution = reconcileFutureShippingState({
    state: shippingState || createEmptyFutureShippingState(),
    garmentCount: fabricCompletion.requiredGarmentCount,
    selectedDesignPrice,
  });
  const candidateResult = buildFutureOrderCandidate({
    ...summaryInput,
    source: includeStyle
      ? {
          kind: "catalog",
          sourceKey: style.id,
          styleId: style.id,
        }
      : null,
    shippingResolution,
  });
  const view = projectDesignStudioLiveOrderSummary({
    summary,
    shippingResolution,
    candidatePricing: candidateResult.candidate?.pricing ?? null,
    fabricAllocationState: allocation,
    measurementState,
    designSource: includeStyle
      ? {
          kind: "catalog",
          sourceKey: style.id,
          styleId: style.id,
        }
      : null,
    additionalConstructionState: additionalConstruction.state,
    catalogInspection: inspection,
    showAdditionalClothesCosts: false,
  });
  return {
    summary,
    view,
    shippingResolution,
    candidateResult,
    allocation,
    measurementState,
    additionalConstruction,
  };
};

assert.equal(shouldShowPersistentLiveOrderSummary("garment_type"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("fabric"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("design_style"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("custom_details"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("try_on"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("measurement"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("shipping"), true);
assert.equal(shouldShowPersistentLiveOrderSummary("summary"), false);
assert.equal(shouldShowPersistentLiveOrderSummary("payment"), false);

const early = buildAuthority({
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
assert.equal(
  JSON.stringify(early.view.sections).includes(LIVE_ORDER_SUMMARY_PENDING_LABEL),
  false,
);
assert.equal(
  JSON.stringify(early.view.sections).includes(
    LIVE_ORDER_SUMMARY_NOT_COMPLETED_LABEL,
  ),
  false,
);
hiddenSection(early.view, "fabrics");
hiddenSection(early.view, "design_style");
hiddenSection(early.view, "measurements");
hiddenSection(early.view, "delivery");
hiddenSection(early.view, "optional_extras");
assert.ok(
  early.view.sections.some(
    (candidate) => candidate.id === "construction" || candidate.id === "garments",
  ),
);
assert.equal(early.view.totalLabel, LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL);
assert.notEqual(early.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(early.view.totalStatus, "subtotal");
assert.notEqual(early.view.totalValueLabel, "Pending");
assert.ok(early.view.totalAmountCents);
assert.equal(
  early.view.totalAmountCents,
  section(early.view, "construction").footer?.amountCents,
);
assert.equal(
  early.view.totalValueLabel,
  section(early.view, "construction").footer?.amountLabel,
);
assert.equal(
  JSON.stringify(early.view).includes("Pending"),
  false,
);

const emptyStep1 = buildAuthority({
  garmentTypes: [],
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
assert.equal(emptyStep1.summary.garmentSummary.length, 0);
assert.equal(emptyStep1.view.totalStatus, "hidden");
assert.equal(emptyStep1.view.totalAmountCents, null);
assert.equal(emptyStep1.view.totalValueLabel, "");
assert.equal(emptyStep1.view.totalLabel, "");
assert.equal(JSON.stringify(emptyStep1.view).includes("Pending"), false);
assert.equal(JSON.stringify(emptyStep1.view).includes("Current Subtotal"), false);
assert.equal(JSON.stringify(emptyStep1.view).includes('"Total"'), false);
assert.equal(JSON.stringify(emptyStep1.view).includes("€0.00"), false);
hiddenSection(emptyStep1.view, "construction");

const oneGarment = buildAuthority({
  garmentTypes: ["shirt"],
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
const oneGarmentConstructionCents =
  oneGarment.summary.garmentSummary[0]?.constructionTotalCents ?? null;
assert.ok(oneGarmentConstructionCents);
assert.equal(
  section(oneGarment.view, "construction").footer?.amountCents,
  oneGarmentConstructionCents,
);
assert.equal(oneGarment.view.totalStatus, "subtotal");
assert.equal(oneGarment.view.totalLabel, LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL);
assert.equal(oneGarment.view.totalAmountCents, oneGarmentConstructionCents);
assert.equal(
  oneGarment.view.totalValueLabel,
  section(oneGarment.view, "construction").footer?.amountLabel,
);
assert.equal(JSON.stringify(oneGarment.view).includes("Pending"), false);
assert.notEqual(oneGarment.view.totalValueLabel, "€0.00");

const multipleGarments = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
const multipleConstructionCents = multipleGarments.summary.garmentSummary.reduce(
  (total, garment) => total + (garment.constructionTotalCents || 0),
  0,
);
assert.equal(multipleGarments.summary.garmentSummary.length, 3);
assert.equal(
  section(multipleGarments.view, "construction").footer?.amountCents,
  multipleConstructionCents,
);
assert.equal(multipleGarments.view.totalStatus, "subtotal");
assert.equal(
  multipleGarments.view.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
);
assert.equal(multipleGarments.view.totalAmountCents, multipleConstructionCents);
assert.equal(
  multipleGarments.view.totalValueLabel,
  section(multipleGarments.view, "construction").footer?.amountLabel,
);
assert.equal(JSON.stringify(multipleGarments.view).includes("Pending"), false);
assert.equal(
  multipleGarments.view.totalAmountCents,
  section(multipleGarments.view, "construction").footer?.amountCents,
  "Current Subtotal must equal the authoritative construction subtotal",
);

const step2PreFabric = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  demographic: "unisex",
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
hiddenSection(step2PreFabric.view, "fabrics");
assert.equal(step2PreFabric.view.totalStatus, "subtotal");
assert.equal(
  step2PreFabric.view.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
);
assert.equal(
  step2PreFabric.view.totalAmountCents,
  section(step2PreFabric.view, "construction").footer?.amountCents,
);
assert.equal(JSON.stringify(step2PreFabric.view).includes("Pending"), false);

const step1Only = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  demographic: "unisex",
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
assert.equal(
  JSON.stringify(step1Only.view.sections).includes("Not selected yet"),
  false,
);
assert.equal(
  JSON.stringify(step1Only.view.sections).includes("Not completed yet"),
  false,
);
hiddenSection(step1Only.view, "fabrics");
hiddenSection(step1Only.view, "design_style");
hiddenSection(step1Only.view, "measurements");
hiddenSection(step1Only.view, "delivery");
hiddenSection(step1Only.view, "optional_extras");
hiddenSection(step1Only.view, "additional_clothes");
assert.ok(
  section(step1Only.view, "construction").lines.some(
    (line) => line.label === "Shirt" || line.label === "Trouser",
  ),
);
hiddenSection(step1Only.view, "standard_shipping");
assert.equal(
  JSON.stringify(step1Only.view.sections).includes(
    LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL,
  ),
  false,
);

const afterFabric = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  demographic: "unisex",
  fabricByGarment: { shirt: fabricA, trouser: fabricA },
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
assert.deepEqual(
  section(afterFabric.view, "fabrics").lines.map(
    (line) => `${line.label} — ${line.detail}`,
  ),
  ["Shirt — Royal Forest Mosaic", "Trouser — Royal Forest Mosaic"],
);
const shirtRemoval = cancelFutureFabricCatalogueAssignment({
  state: afterFabric.allocation,
  garmentKey: "base:shirt",
});
assert.equal(shirtRemoval.status, "cancelled");
const afterShirtFabricRemoval = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  demographic: "unisex",
  fabricAllocationState: shirtRemoval.state,
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
});
assert.deepEqual(
  section(afterShirtFabricRemoval.view, "fabrics").lines.map(
    (line) => `${line.label} — ${line.detail}`,
  ),
  ["Trouser — Royal Forest Mosaic"],
);
hiddenSection(afterFabric.view, "design_style");
hiddenSection(afterFabric.view, "measurements");
hiddenSection(afterFabric.view, "delivery");

const preDelivery = buildAuthority({
  fabricByGarment: { shirt: fabricA },
});
assert.equal(preDelivery.view.totalLabel, LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL);
assert.notEqual(preDelivery.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(preDelivery.view.totalStatus, "subtotal");
assert.ok(preDelivery.view.totalAmountCents);
assert.notEqual(preDelivery.view.totalValueLabel, "€0.00");
assert.ok(preDelivery.summary.pricingSummary.garmentConstructionSubtotal !== null);
const preDeliveryConstructionCents = Math.round(
  preDelivery.summary.pricingSummary.garmentConstructionSubtotal! * 100,
);
assert.equal(
  section(preDelivery.view, "construction").footer?.amountCents,
  preDeliveryConstructionCents,
);
assert.equal(
  section(preDelivery.view, "construction").footer?.label,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
);
assert.equal(
  section(preDelivery.view, "construction").footer?.amountLabel,
  `€${(preDeliveryConstructionCents / 100).toFixed(2)}`,
);
assert.equal(
  section(preDelivery.view, "construction").footer?.note,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
);
assert.equal(
  section(preDelivery.view, "construction").lines.some(
    (line) => line.label === LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
  ),
  false,
  "construction subtotal must not be summed from visible rows",
);
hiddenSection(preDelivery.view, "standard_shipping");
assert.equal(
  JSON.stringify(preDelivery.view.sections).includes(
    LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL,
  ),
  false,
);
assert.equal(
  JSON.stringify(preDelivery.view.sections).split(
    LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  ).length - 1,
  1,
);

const multiFabric = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricByGarment: {
    shirt: fabricA,
    trouser: fabricA,
    dress: fabricB,
  },
});
assert.deepEqual(
  section(multiFabric.view, "fabrics").lines.map((line) => `${line.label} — ${line.detail}`),
  [
    "Shirt — Royal Forest Mosaic",
    "Trouser — Royal Forest Mosaic",
    "Dress — Imperial Sapphire Link",
  ],
);
assert.equal(
  section(multiFabric.view, "fabrics").lines.every(
    (line) => line.detail !== "Royal Forest Mosaic",
  ),
  false,
);
assert.equal(
  section(multiFabric.view, "fabrics").lines.every(
    (line) => line.amountLabel === null,
  ),
  true,
  "fabric summary must not show fabric prices",
);
hiddenSection(step1Only.view, "fabrics");
assert.ok(section(multiFabric.view, "fabrics"));
assert.ok(section(multiFabric.view, "design_style"));

const extraSelection = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: getFutureFabricCapacityComposition(
    buildSelection(["shirt", "trouser", "dress"], "unisex"),
  ),
  existingAssignments: multiFabric.allocation.fabricAllocations.flatMap(
    (item) => item.garmentAssignments,
  ),
});
assert.equal(extraSelection.status, "resolved");
if (extraSelection.status !== "resolved") {
  throw new Error("expected additional shirt");
}
const fabricBAllocation = multiFabric.allocation.fabricAllocations.find(
  (allocation) => allocation.fabricCode === fabricB.code,
);
assert.ok(fabricBAllocation);
const withExtraAllocation = appendCustomerFabricGarment(
  {
    ...multiFabric.allocation,
    activeAllocationId: fabricBAllocation.allocationId,
  },
  fabricB.code,
  extraSelection.selection,
);
const extraKeys = withExtraAllocation.fabricAllocations
  .flatMap((item) => item.garmentAssignments)
  .filter((assignment) => assignment.sourceRole === "additional")
  .map((assignment) => assignment.garmentKey);
assert.equal(extraKeys.length, 1, "extra garment must be committed to fabric state");
const extraCommitted = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: withExtraAllocation,
});
const extraLine = section(extraCommitted.view, "optional_extras").lines.find(
  (line) => line.id === extraKeys[0],
);
assert.ok(extraLine, "committed extra garment must appear");
assert.equal(extraLine.id, extraKeys[0]);
assert.match(extraLine.label, /Shirt/);
assert.match(extraLine.detail || "", /Imperial Sapphire Link|Royal Forest Mosaic/);
const extraConstruction =
  extraCommitted.additionalConstruction.state.byGarmentKey[extraKeys[0]];
assert.equal(extraConstruction?.status, "resolved");
if (extraConstruction?.status !== "resolved") {
  throw new Error("expected resolved extra construction");
}
assert.equal(
  extraLine.amountLabel,
  `€${(extraConstruction.totalPriceCents / 100).toFixed(2)}`,
);
assert.notEqual(extraLine.amountLabel, null);
assert.notEqual(extraLine.amountLabel, "€0.00");
assert.equal(
  extraCommitted.view.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
);
assert.notEqual(extraCommitted.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(
  extraCommitted.view.totalAmountCents,
  extraCommitted.summary.pricingSummary.selectedDesignPrice
    ? Math.round(
        extraCommitted.summary.pricingSummary.selectedDesignPrice
          .selectedDesignPrice * 100,
      )
    : extraCommitted.view.totalAmountCents,
);

const extraSelection2 = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: getFutureFabricCapacityComposition(
    buildSelection(["shirt", "trouser", "dress"], "unisex"),
  ),
  existingAssignments: withExtraAllocation.fabricAllocations.flatMap(
    (item) => item.garmentAssignments,
  ),
});
assert.equal(extraSelection2.status, "resolved");
if (extraSelection2.status !== "resolved") {
  throw new Error("expected second additional shirt");
}
const withTwoExtraAllocation = appendCustomerFabricGarment(
  FabricAllocationStateEngine.createAllocationForFabric(
    withExtraAllocation,
    fabricC.code,
  ),
  fabricC.code,
  extraSelection2.selection,
);
const twoExtraKeys = withTwoExtraAllocation.fabricAllocations
  .flatMap((item) => item.garmentAssignments)
  .filter((assignment) => assignment.sourceRole === "additional")
  .map((assignment) => assignment.garmentKey);
assert.deepEqual(twoExtraKeys, [
  extraKeys[0],
  extraSelection2.selection.garmentSpec?.key,
]);
assert.equal(twoExtraKeys[0], "additional:shirt:1");
assert.equal(twoExtraKeys[1], "additional:shirt:2");
const twoExtras = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: withTwoExtraAllocation,
});
const twoExtraLines = section(twoExtras.view, "optional_extras").lines;
assert.equal(twoExtraLines.length, 2);
assert.equal(twoExtraLines[0]?.id, "additional:shirt:1");
assert.equal(twoExtraLines[1]?.id, "additional:shirt:2");
assert.equal(twoExtraLines[0]?.label, "Shirt 1");
assert.equal(twoExtraLines[1]?.label, "Shirt 2");
const firstExtraConstruction =
  twoExtras.additionalConstruction.state.byGarmentKey["additional:shirt:1"];
const secondExtraConstruction =
  twoExtras.additionalConstruction.state.byGarmentKey["additional:shirt:2"];
assert.equal(firstExtraConstruction?.status, "resolved");
assert.equal(secondExtraConstruction?.status, "resolved");
if (
  firstExtraConstruction?.status !== "resolved" ||
  secondExtraConstruction?.status !== "resolved"
) {
  throw new Error("expected both extra constructions to resolve");
}
assert.equal(
  twoExtraLines[0]?.amountLabel,
  `€${(firstExtraConstruction.totalPriceCents / 100).toFixed(2)}`,
);
assert.equal(
  twoExtraLines[1]?.amountLabel,
  `€${(secondExtraConstruction.totalPriceCents / 100).toFixed(2)}`,
);
assert.match(twoExtraLines[0]?.detail || "", /Imperial Sapphire Link|Royal Forest Mosaic/);
assert.match(twoExtraLines[1]?.detail || "", /Golden Heritage Weave/);

const extraRemoved = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricByGarment: {
    shirt: fabricA,
    trouser: fabricA,
    dress: fabricB,
  },
});
assert.equal(
  extraRemoved.view.sections.some((candidate) => candidate.id === "optional_extras"),
  false,
);
hiddenSection(extraRemoved.view, "optional_extras");

const pendingExtraState: FabricAllocationState = {
  ...withExtraAllocation,
  pendingFabricGarment: extraSelection.selection.garmentSpec
    ? {
        garmentKey: extraSelection.selection.garmentSpec.key,
        code: extraSelection.selection.code || "ADDITIONAL_SHIRT_1",
        garmentType: "shirt",
        fabricUnits: extraSelection.selection.garmentSpec.fabricUnits,
        sourceRole: "additional",
      }
    : null,
  awaitingFabricForPendingGarment: true,
  fabricAllocations: withExtraAllocation.fabricAllocations.map((allocation) => ({
    ...allocation,
    garmentAssignments: allocation.garmentAssignments.filter(
      (assignment) =>
        assignment.garmentKey !== extraSelection.selection.garmentSpec.key,
    ),
  })),
};
const pendingExtra = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: pendingExtraState,
});
hiddenSection(pendingExtra.view, "optional_extras");
assert.equal(
  pendingExtra.view.sections.some((candidate) =>
    candidate.lines.some((line) => line.amountLabel === "€0.00"),
  ),
  false,
);

const dressState = setGarmentScopedCustomDetailSelection(
  createEmptyGarmentScopedCustomDetailsState(),
  "base:dress",
  "dress_additional",
  ["dress_additional_net"],
);
const dressCost = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricByGarment: {
    shirt: fabricA,
    trouser: fabricA,
    dress: fabricB,
  },
  customState: dressState,
});
const dressOccurrence = dressCost.summary.customDetailsSummary
  .flatMap((group) => group.occurrences)
  .find((occurrence) => occurrence.optionId === "dress_additional_net");
assert.ok(dressOccurrence);
const dressLine = section(dressCost.view, "additional_clothes").lines.find(
  (line) => line.id === dressOccurrence.occurrenceKey,
);
assert.ok(dressLine);
assert.equal(dressLine.label, dressOccurrence.optionLabel);
assert.equal(
  dressLine.amountLabel,
  dressOccurrence.priceCents === null
    ? null
    : `€${(dressOccurrence.priceCents / 100).toFixed(2)}`,
);
assert.equal(
  section(dressCost.view, "additional_clothes").lines.some((line) =>
    /shirt additional|trouser additional/i.test(`${line.label} ${line.detail || ""}`),
  ),
  false,
);

const midIncomplete = buildAuthority({
  measurementRoute: "medium_risk",
  completeMeasurements: false,
});
assert.match(
  section(midIncomplete.view, "measurements").lines[0]?.label || "",
  /Mid Risk/,
);
assert.match(
  section(midIncomplete.view, "measurements").lines[0]?.label || "",
  /remaining|Incomplete|Not completed/,
);
assert.equal(
  section(midIncomplete.view, "measurements").lines.some((line) =>
    /factor/i.test(line.label),
  ),
  false,
);

const midComplete = buildAuthority({
  measurementRoute: "medium_risk",
  completeMeasurements: true,
});
assert.equal(
  section(midComplete.view, "measurements").lines[0]?.label,
  "Mid Risk — Complete",
);

const pickup = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "eindhoven_pickup",
  },
});
const pickupDelivery = section(pickup.view, "delivery").lines;
assert.equal(
  pickupDelivery.find((line) => line.label === "Delivery Method")?.detail,
  "Pick Up in Eindhoven",
);
assert.equal(
  pickupDelivery.find((line) => line.label === "Additional Delivery")?.detail,
  "€0.00",
);
assert.equal(pickup.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(pickup.view.totalStatus, "exact");
assert.equal(
  pickup.view.totalAmountCents,
  pickup.candidateResult.candidate?.pricing.exactTotalCents,
);
assert.equal(
  pickup.candidateResult.candidate?.pricing.status,
  "exact",
);

const courier = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: withDelivery("DE", "Berlin"),
});
const courierDelivery = section(courier.view, "delivery").lines;
assert.match(
  courierDelivery.find((line) => line.label === "Destination")?.detail || "",
  /Germany|Berlin/,
);
assert.match(
  courierDelivery.find((line) => line.label === "Estimated Shipment Weight")
    ?.detail || "",
  /kg/,
);
assert.ok(
  courierDelivery.find((line) => line.label === "Additional Delivery")?.detail,
);
assert.notEqual(
  courierDelivery.find((line) => line.label === "Additional Delivery")?.detail,
  "Custom shipping quote required",
);
assert.equal(courier.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(courier.view.totalStatus, "exact");
assert.equal(
  courier.view.totalAmountCents,
  courier.candidateResult.candidate?.pricing.exactTotalCents,
);

const candidateUnavailableProjected = projectDesignStudioLiveOrderSummary({
  summary: {
    ...courier.summary,
    pricingSummary: {
      ...courier.summary.pricingSummary,
      selectedDesignPrice: courier.summary.pricingSummary.selectedDesignPrice
        ? {
            ...courier.summary.pricingSummary.selectedDesignPrice,
            selectedDesignPrice: 65,
          }
        : null,
    },
  },
  shippingResolution: {
    ...courier.shippingResolution,
    projectedTotalCents: 8000,
    quoteRequired: false,
  },
  candidatePricing: null,
  fabricAllocationState: courier.allocation,
  measurementState: courier.measurementState,
  designSource: {
    kind: "catalog",
    sourceKey: "style-shirt",
    styleId: "style-shirt",
  },
  additionalConstructionState: courier.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.equal(candidateUnavailableProjected.totalAmountCents, 8000);
assert.equal(
  candidateUnavailableProjected.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
);
assert.equal(candidateUnavailableProjected.totalStatus, "current");
assert.notEqual(
  candidateUnavailableProjected.totalLabel,
  LIVE_ORDER_SUMMARY_TOTAL_LABEL,
);
assert.notEqual(candidateUnavailableProjected.totalAmountCents, 6500);

const otherDestination = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: withDelivery("AU", "Sydney"),
});
const otherDelivery = section(otherDestination.view, "delivery").lines;
assert.match(
  otherDelivery.find((line) => line.label === "Destination")?.detail || "",
  /Sydney|Australia|Other Destination/,
);
assert.equal(
  otherDelivery.find((line) => line.label === "Additional Delivery")?.detail,
  "Custom shipping quote required",
);
assert.equal(
  otherDelivery.some((line) => line.detail === "€0.00"),
  false,
);
assert.equal(otherDestination.view.quoteRequired, true);
assert.equal(otherDestination.view.totalStatus, "quote_required");
assert.equal(
  otherDestination.view.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
);
assert.notEqual(
  otherDestination.view.totalLabel,
  LIVE_ORDER_SUMMARY_TOTAL_LABEL,
);
assert.ok(otherDestination.view.totalAmountCents);
assert.notEqual(otherDestination.view.totalValueLabel, "€0.00");

const over20kg = projectDesignStudioLiveOrderSummary({
  summary: courier.summary,
  shippingResolution: {
    ...courier.shippingResolution,
    quoteRequired: true,
    projectedTotalCents: null,
    weightTier: "over_20",
  },
  candidatePricing: null,
  fabricAllocationState: courier.allocation,
  measurementState: courier.measurementState,
  designSource: {
    kind: "catalog",
    sourceKey: "style-shirt",
    styleId: "style-shirt",
  },
  additionalConstructionState: courier.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.equal(over20kg.quoteRequired, true);
assert.equal(over20kg.totalStatus, "quote_required");
assert.equal(over20kg.totalLabel, LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL);
assert.notEqual(over20kg.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(
  section(over20kg, "delivery").lines.find(
    (line) => line.label === "Additional Delivery",
  )?.detail,
  "Custom shipping quote required",
);

const uploadedDesignSource = {
  kind: "uploaded" as const,
  sourceKey: "uploaded:demo",
  displayLabel: "Own upload",
  demographic: "male" as const,
  fabricCapacityComposition: [],
  uploadReference: {
    designReferenceId: "ref-1",
    ownerUid: "owner-1",
    storagePath: "designs/owner-1/ref-1.jpg",
    mimeType: "image/jpeg" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

const uploaded = projectDesignStudioLiveOrderSummary({
  summary: early.summary,
  shippingResolution: early.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: early.allocation,
  measurementState: early.measurementState,
  designSource: uploadedDesignSource,
});
assert.equal(
  section(uploaded, "design_style").lines[0]?.label,
  LIVE_ORDER_SUMMARY_OWN_DESIGN_TITLE,
);
assert.equal(
  section(uploaded, "design_style").lines[0]?.detail,
  LIVE_ORDER_SUMMARY_OWN_DESIGN_DETAIL,
);
assert.notEqual(uploaded.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);

const uploadedWithDelivery = projectDesignStudioLiveOrderSummary({
  summary: courier.summary,
  shippingResolution: courier.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: courier.allocation,
  measurementState: courier.measurementState,
  designSource: uploadedDesignSource,
  additionalConstructionState: courier.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.ok(
  section(uploadedWithDelivery, "delivery").lines.find(
    (line) => line.label === "Additional Delivery",
  )?.detail,
);
assert.notEqual(
  section(uploadedWithDelivery, "delivery").lines.find(
    (line) => line.label === "Additional Delivery",
  )?.detail,
  LIVE_ORDER_SUMMARY_PENDING_LABEL,
);
assert.equal(
  uploadedWithDelivery.totalAmountCents,
  courier.shippingResolution.projectedTotalCents,
);
assert.equal(
  uploadedWithDelivery.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
);
assert.notEqual(uploadedWithDelivery.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);

const uploadedQuote = projectDesignStudioLiveOrderSummary({
  summary: otherDestination.summary,
  shippingResolution: otherDestination.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: otherDestination.allocation,
  measurementState: otherDestination.measurementState,
  designSource: uploadedDesignSource,
  additionalConstructionState: otherDestination.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.equal(
  section(uploadedQuote, "delivery").lines.find(
    (line) => line.label === "Additional Delivery",
  )?.detail,
  "Custom shipping quote required",
);
assert.equal(uploadedQuote.totalLabel, LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL);
assert.notEqual(uploadedQuote.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);

const full = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: withExtraAllocation,
  customState: dressState,
  measurementRoute: "low_risk",
  shippingState: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "eindhoven_pickup",
  },
});
const dedicatedTotalCents = full.summary.pricingSummary.selectedDesignPrice
  ? Math.round(
      full.summary.pricingSummary.selectedDesignPrice.selectedDesignPrice * 100,
    )
  : null;
assert.equal(full.view.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);
assert.equal(full.view.totalStatus, "exact");
assert.equal(full.view.totalAmountCents, dedicatedTotalCents);
assert.equal(
  full.view.totalAmountCents,
  full.candidateResult.candidate?.pricing.exactTotalCents,
);
assert.equal(
  full.candidateResult.candidate?.pricing.status,
  "exact",
);
assert.equal(
  full.view.totalAmountCents,
  full.shippingResolution.projectedTotalCents,
);
const fullExtraLine = section(full.view, "optional_extras").lines.find(
  (line) => line.id === extraKeys[0],
);
const fullExtraConstruction =
  full.additionalConstruction.state.byGarmentKey[extraKeys[0]];
assert.ok(fullExtraLine);
assert.equal(fullExtraConstruction?.status, "resolved");
if (fullExtraConstruction?.status !== "resolved") {
  throw new Error("expected full-order extra construction");
}
assert.equal(
  fullExtraLine.amountLabel,
  `€${(fullExtraConstruction.totalPriceCents / 100).toFixed(2)}`,
);
assert.notEqual(
  full.view.totalAmountCents,
  (full.candidateResult.candidate?.pricing.exactTotalCents || 0) +
    fullExtraConstruction.totalPriceCents,
  "optional extra row amount must not be added again into Total",
);
assert.ok(
  section(full.view, "additional_clothes").lines.some(
    (line) => line.id === dressOccurrence.occurrenceKey,
  ),
);
assert.ok(
  section(full.view, "construction").lines.some((line) => line.detail !== LIVE_ORDER_SUMMARY_PENDING_LABEL),
);
hiddenSection(full.view, "standard_shipping");
assert.equal(
  JSON.stringify(full.view).includes(LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL),
  false,
);
assert.ok(full.summary.pricingSummary.garmentConstructionSubtotal !== null);
assert.equal(
  section(full.view, "construction").footer?.amountCents,
  Math.round(full.summary.pricingSummary.garmentConstructionSubtotal! * 100),
);
assert.equal(
  section(full.view, "construction").footer?.note,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
);
assert.equal(
  JSON.stringify(full.view.sections).split(
    LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  ).length - 1,
  1,
);
assert.equal(
  section(full.view, "delivery").lines.filter((line) =>
    /Lagos/.test(`${line.label} ${line.detail || ""}`),
  ).length,
  0,
);

const manyItems = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: withTwoExtraAllocation,
  customState: dressState,
  measurementRoute: "low_risk",
  shippingState: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "eindhoven_pickup",
  },
});
const manySectionIds = manyItems.view.sections.map((item) => item.id);
assert.deepEqual(
  manySectionIds.filter((id) =>
    [
      "construction",
      "optional_extras",
      "additional_clothes",
      "fabrics",
      "design_style",
      "measurements",
      "delivery",
    ].includes(id),
  ),
  [
    "construction",
    "optional_extras",
    "additional_clothes",
    "fabrics",
    "design_style",
    "measurements",
    "delivery",
  ],
);
assert.equal(section(manyItems.view, "construction").lines.length >= 3, true);
assert.equal(section(manyItems.view, "optional_extras").lines.length, 2);
assert.ok(
  section(manyItems.view, "additional_clothes").lines.some(
    (line) => line.id === dressOccurrence.occurrenceKey,
  ),
);
assert.equal(section(manyItems.view, "fabrics").lines.length >= 4, true);
assert.ok(
  manyItems.view.sections.every(
    (item) =>
      item.lines.length > 0 || Boolean(item.footer),
  ),
);
assert.equal(
  JSON.stringify(manyItems.view.sections).includes("Not selected yet"),
  false,
);
assert.equal(
  JSON.stringify(manyItems.view.sections).includes("Not completed yet"),
  false,
);
hiddenSection(manyItems.view, "standard_shipping");
assert.ok(manyItems.summary.pricingSummary.garmentConstructionSubtotal !== null);
assert.equal(
  section(manyItems.view, "construction").footer?.amountCents,
  Math.round(manyItems.summary.pricingSummary.garmentConstructionSubtotal! * 100),
);
assert.ok(manyItems.view.totalAmountCents);
assert.notEqual(manyItems.view.totalValueLabel, "Pending");
assert.equal(
  manyItems.view.totalAmountCents,
  manyItems.candidateResult.candidate?.pricing.exactTotalCents,
);

const viewSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(viewSource, /shouldShowPersistentLiveOrderSummary/);
assert.match(viewSource, /DesignStudioOrderSummary/);
assert.doesNotMatch(viewSource, /lg:max-h-\[calc\(100vh-2rem\)\]/);
assert.doesNotMatch(viewSource, /lg:overflow-y-auto/);
assert.match(viewSource, /useMemo\([\s\S]*projectDesignStudioLiveOrderSummary/);
assert.match(viewSource, /showShellLiveOrderSummary/);
assert.match(viewSource, /embedPersistentLiveOrderSummary/);
assert.doesNotMatch(viewSource, /DesignStudioOrderSummaryTrigger/);
assert.doesNotMatch(viewSource, /closeMobileLiveOrderSummary/);
assert.doesNotMatch(viewSource, /Your Order Summary/);
assert.equal(LIVE_ORDER_SUMMARY_HEADING, "Order Summary");

const helperSource = readFileSync(
  new URL("./src/utils/designStudioLiveOrderSummary.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(helperSource, /calculateDesignPricing\(/);
assert.doesNotMatch(helperSource, /resolveStep8AdditionalDelivery\(/);
assert.match(helperSource, /projectFutureDesignStudioSummary|FutureDesignStudioSummary/);
assert.match(helperSource, /getStep8OrderSummaryRows/);
assert.match(helperSource, /LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL/);
assert.match(helperSource, /totalPriceCents/);

console.log("test_design_studio_live_order_summary.ts: all assertions passed");
