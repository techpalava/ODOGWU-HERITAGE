import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  AiTryOnWorkflowStateV1,
  AdditionalGarmentConstructionStateV1,
  BusinessSettings,
  DesignSelections,
  Fabric,
  FabricAllocationState,
  FutureShippingStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
  WearerOrderStateV2,
} from "./src/types";
import { createAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { mergeProvisionalAdditionalConstructionForLiveSummary } from "./src/utils/additionalGarmentFabricPicker";
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
  LIVE_ORDER_SUMMARY_PENDING_LABEL,
  LIVE_ORDER_SUMMARY_CURRENT_SUBTOTAL_LABEL,
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
  LIVE_ORDER_SUMMARY_HEADING,
  LIVE_ORDER_SUMMARY_TOTAL_LABEL,
  LIVE_ORDER_SUMMARY_STANDARD_SHIPPING_LABEL,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  LIVE_ORDER_SUMMARY_PERSONALIZED_ADDITIONS_SUBTOTAL_LABEL,
  projectDesignStudioLiveOrderSummary,
  shouldShowPersistentLiveOrderSummary,
} from "./src/utils/designStudioLiveOrderSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";
import {
  calculateGarmentScopedCustomDetailsPricing,
  projectAuthorizedAdditionalGarmentAssignments,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import {
  cloneGarmentConstructionPricingResolution,
  reconcileAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

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

const seedAuthorizedAdditionalConstructionState = (
  assignments: FabricAllocationState["fabricAllocations"][number]["garmentAssignments"],
) => {
  const byGarmentKey: AdditionalGarmentConstructionStateV1["byGarmentKey"] = {};
  assignments.forEach((assignment) => {
    if (assignment.sourceRole !== "additional") return;
    const base = resolveGarmentConstructionPricing(
      assignment.garmentType,
      catalog,
    );
    if (base.status !== "resolved") return;
    byGarmentKey[assignment.garmentKey] =
      cloneGarmentConstructionPricingResolution(base);
  });
  return { schemaVersion: 1 as const, byGarmentKey };
};

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
      // Step 9 requires a region for every destination delivery.
      stateRegion: extras.stateRegion ?? "Test Region",
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

const constructionLine = (
  view: ReturnType<typeof projectDesignStudioLiveOrderSummary>,
  garmentKey: string,
) =>
  [
    ...section(view, "construction").lines,
    ...(section(view, "construction").subsections || []).flatMap(
      (subsection) => subsection.lines,
    ),
  ].find((line) => line.id === `construction-${garmentKey}`);

const additionalGarmentsSubsection = (
  view: ReturnType<typeof projectDesignStudioLiveOrderSummary>,
) =>
  view.sections.find((candidate) => candidate.id === "construction")?.subsections?.find(
    (subsection) => subsection.id === "additional_garments",
  );

const buildAuthority = ({
  garmentTypes = ["shirt"] as GarmentTypeStepSelection["garmentTypes"],
  demographic = "male" as NonNullable<GarmentTypeStepSelection["demographic"]>,
  fabricByGarment,
  fabricAllocationState,
  includeStyle = true,
  customState = createEmptyGarmentScopedCustomDetailsState(),
  measurementRoute = null as "low_risk" | "medium_risk" | "high_risk" | "critical_risk" | null,
  completeMeasurements = true,
  shippingState = null as FutureShippingStateV1 | null,
  additionalPending = false,
  additionalConstructionState = null as AdditionalGarmentConstructionStateV1 | null,
  designSelections = {} as DesignSelections,
  styleOverrides = {} as Partial<StyleCategory>,
  wearerOrder = null as WearerOrderStateV2 | null,
  unsavedWearerNameIds = null as readonly string[] | null,
  orderType = null as string | null,
  garmentTypeSelection: garmentTypeSelectionOverride = null as GarmentTypeStepSelection | null,
}: {
  garmentTypes?: GarmentTypeStepSelection["garmentTypes"];
  demographic?: NonNullable<GarmentTypeStepSelection["demographic"]>;
  fabricByGarment?: Record<string, Fabric>;
  fabricAllocationState?: FabricAllocationState;
  includeStyle?: boolean;
  customState?: ReturnType<typeof createEmptyGarmentScopedCustomDetailsState>;
  measurementRoute?: "low_risk" | "medium_risk" | "high_risk" | "critical_risk" | null;
  completeMeasurements?: boolean;
  shippingState?: FutureShippingStateV1 | null;
  additionalPending?: boolean;
  additionalConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  designSelections?: DesignSelections;
  styleOverrides?: Partial<StyleCategory>;
  wearerOrder?: WearerOrderStateV2 | null;
  unsavedWearerNameIds?: readonly string[] | null;
  orderType?: string | null;
  garmentTypeSelection?: GarmentTypeStepSelection | null;
}) => {
  const garmentTypeSelection =
    garmentTypeSelectionOverride || buildSelection(garmentTypes, demographic);
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
  const style = { ...makeStyle(garmentTypes, demographic), ...styleOverrides };
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
  const additionalConstruction = reconcileAdditionalGarmentConstructionState({
    existingState:
      additionalConstructionState ||
      seedAuthorizedAdditionalConstructionState(
        allocation.fabricAllocations.flatMap((item) => item.garmentAssignments),
      ),
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const additionalAssignments = projectAuthorizedAdditionalGarmentAssignments({
    additionalGarmentConstructions: additionalConstruction.state,
    fabricAllocationState: allocation,
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
        displayValue: 40,
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
            ...designSelections,
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
    step1GarmentTypeSelection: garmentTypeSelection,
    garmentTypeSelection,
    designSourceKind: "catalogue" as const,
    uploadedCompositionSpecs: null,
    additionalGarmentConstructionState: additionalConstruction.state,
    pendingAdditionalGarment:
      allocation.pendingFabricGarment?.sourceRole === "additional"
        ? allocation.pendingFabricGarment
        : null,
    catalogInspection: inspection,
    fabricAllocationState: allocation,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    designStyleOccurrences: garmentTypeSelection.garmentTypes.map((garmentType) => ({
      target: { garmentKey: `base:${garmentType}`, occurrenceToken: `base:${garmentType}#1` },
      garmentType,
      label: garmentType[0].toUpperCase() + garmentType.slice(1),
      status: includeStyle ? ("complete" as const) : ("incomplete" as const),
      assignment: includeStyle
        ? {
            garmentKey: `base:${garmentType}`,
            occurrenceToken: `base:${garmentType}#1`,
            assignmentRevision: 1,
            sourceKind: "catalog" as const,
            sourceKey: `catalog-style:${style.id}`,
            catalogStyleId: style.id,
            eligibilityFingerprint: "fixture-eligible",
          }
        : null,
      assignmentLabel: includeStyle ? style.name : null,
    })),
    styles: [style],
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation?.state || null,
    designSelections,
    aiTryOnWorkflow: skipWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
    ...(wearerOrder ? { wearerOrder } : {}),
    ...(unsavedWearerNameIds ? { unsavedWearerNameIds } : {}),
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
    measurementPlan,
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
    orderType,
  });
  return {
    summary,
    view,
    shippingResolution,
    candidateResult,
    allocation,
    measurementState,
    additionalConstruction,
    measurementPlan,
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
assert.deepEqual(
  section(early.view, "style_and_options").lines.map((line) => `${line.label} — ${line.detail}`),
  ["Standard Shirt — Not selected"],
  "authoritative unassigned occurrences remain visible without inheriting a sibling style",
);
hiddenSection(early.view, "measurements");
hiddenSection(early.view, "delivery");
hiddenSection(early.view, "optional_extras");
assert.equal(
  additionalGarmentsSubsection(early.view),
  undefined,
  "base-only orders must not render an empty Additional Garments subsection",
);
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
assert.equal(
  early.view.costBreakdown ?? null,
  null,
  "an early card without an order type still has no cost breakdown",
);

const earlyIndividual = buildAuthority({
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
  orderType: "Individual",
});
assert.equal(earlyIndividual.summary.garmentSummary.length, 1);
assert.equal(
  earlyIndividual.shippingResolution.state.fulfilmentMethod,
  null,
);
assert.equal(earlyIndividual.view.costBreakdown?.subtotal.label, "Order Subtotal");
assert.equal(
  earlyIndividual.view.costBreakdown?.subtotal.amountCents,
  early.view.totalAmountCents,
);
assert.equal(
  earlyIndividual.view.costBreakdown?.includedInboundShipping?.label,
  "Lagos → Eindhoven shipping",
);
assert.equal(
  earlyIndividual.view.costBreakdown?.includedInboundShipping?.valueLabel,
  "€131.25",
);
assert.equal(
  earlyIndividual.view.costBreakdown?.includedInboundShipping?.amountCents,
  13125,
);
assert.equal(
  earlyIndividual.view.costBreakdown?.includedInboundShipping?.note,
  "Shipping covers up to 10 garments (under 5 kg).",
);
assert.notEqual(
  earlyIndividual.view.costBreakdown?.includedInboundShipping?.included,
  true,
);
assert.equal(earlyIndividual.view.costBreakdown?.shipping, null);
assert.equal(
  earlyIndividual.view.totalAmountCents,
  (early.view.totalAmountCents || 0) + 13125,
  "Step 1 adds the Individual Lagos block to the live total",
);
assert.equal(
  (earlyIndividual.view.costBreakdown?.subtotal.amountCents || 0) + 13125,
  earlyIndividual.view.totalAmountCents,
);
assert.equal(
  section(earlyIndividual.view, "construction").footer?.note,
  "Includes fabric, tax, and sewing.",
);

const earlyCommunity = buildAuthority({
  includeStyle: false,
  completeMeasurements: false,
  measurementRoute: null,
  orderType: "Community",
});
assert.equal(earlyCommunity.shippingResolution.state.fulfilmentMethod, null);
assert.equal(earlyCommunity.view.costBreakdown ?? null, null);
assert.equal(
  earlyCommunity.view.totalAmountCents,
  early.view.totalAmountCents,
);
assert.equal(
  section(earlyCommunity.view, "construction").footer?.note,
  "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.",
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
  "Current Total must equal the authoritative construction subtotal",
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
assert.equal(section(step1Only.view, "style_and_options").lines[0]?.detail, "Not selected");
hiddenSection(step1Only.view, "measurements");
hiddenSection(step1Only.view, "delivery");
hiddenSection(step1Only.view, "optional_extras");
hiddenSection(step1Only.view, "additional_clothes");
assert.deepEqual(
  section(step1Only.view, "construction").lines.map((line) => [line.label, line.detail]),
  [
    ["Standard Shirt", "Standard Length Shirt, Short Sleeve"],
    ["Trouser", "With Rope"],
  ],
  "Garments Ordered leads with the garment name; the selected construction is the detail",
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
  ["Standard Shirt — Royal Forest Mosaic", "Trouser — Royal Forest Mosaic"],
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
assert.equal(section(afterFabric.view, "style_and_options").lines[0]?.detail, "Not selected");
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
  (section(preDelivery.view, "construction").footers || []).filter(
    (footer) => footer.note === LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  ).length,
  1,
  "construction inclusion note appears once under Garments Ordered footers",
);
assert.equal(
  section(preDelivery.view, "construction").footer?.note,
  LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
);

const presentationGarment = preDelivery.summary.garmentSummary[0]!;
const baseConstruction = presentationGarment.construction[0]!;
const presentationView = projectDesignStudioLiveOrderSummary({
  summary: {
    ...preDelivery.summary,
    designStyleOccurrences: [
      {
        garmentKey: presentationGarment.garmentKey,
        occurrenceLabel: presentationGarment.label,
        sourceKind: "catalogue",
        status: "selected",
        name: "Casual Native",
        image: "https://example.invalid/casual-native.jpg",
        detail: "Kaftan + Shirt + Nikka / Standard Shorts + Trouser",
      },
    ],
    customDetailsSummary: [
      {
        garmentKey: presentationGarment.garmentKey,
        garmentLabel: presentationGarment.label,
        occurrences: [
          {
            occurrenceKey: "base:shirt:duplicate-base",
            garmentKey: presentationGarment.garmentKey,
            garmentLabel: presentationGarment.label,
            selectionGroup: baseConstruction.selectionGroup,
            selectionGroupTitle: "Base construction",
            optionId: baseConstruction.optionId,
            optionLabel: baseConstruction.label,
            priceStatus: "exact",
            priceCents: baseConstruction.priceCents,
            personalizedText: null,
          },
          {
            occurrenceKey: "base:shirt:included-option",
            garmentKey: presentationGarment.garmentKey,
            garmentLabel: presentationGarment.label,
            selectionGroup: "pockets",
            selectionGroupTitle: "Pockets",
            optionId: "no-pockets",
            optionLabel: "No Pockets",
            priceStatus: "exact",
            priceCents: 0,
            personalizedText: null,
          },
          {
            occurrenceKey: "base:shirt:priced-option",
            garmentKey: presentationGarment.garmentKey,
            garmentLabel: presentationGarment.label,
            selectionGroup: "sleeve",
            selectionGroupTitle: "Sleeve",
            optionId: "detailed-sleeve",
            optionLabel: "Detailed Sleeve",
            priceStatus: "exact",
            priceCents: 1250,
            personalizedText: null,
          },
        ],
      },
    ],
  },
  shippingResolution: preDelivery.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: preDelivery.allocation,
  measurementState: preDelivery.measurementState,
  measurementPlan: preDelivery.measurementPlan,
  designSource: { kind: "catalog", sourceKey: "casual-native", styleId: "casual-native" },
});
const presentationLine = section(presentationView, "style_and_options").lines[0]!;
assert.equal(
  presentationLine.label,
  "Standard Shirt",
  "the live projection uses the authoritative Step 1 garment label, not the Fabric label",
);
assert.equal(presentationLine.detail, "Casual Native");
assert.equal(presentationLine.imageUrl, "https://example.invalid/casual-native.jpg");
assert.ok(!presentationLine.detail?.includes("Kaftan + Shirt"));
assert.deepEqual(
  presentationLine.constructionOptions?.map(
    (option) => `${option.label} — ${option.amountLabel}`,
  ),
  [
    "No Pockets — Included",
    "Detailed Sleeve — €12.50",
  ],
  "Style & Options keeps non-construction custom details and omits base construction",
);
assert.equal(
  presentationLine.constructionOptions?.some(
    (option) =>
      option.amountLabel === "Included" &&
      (option.label === baseConstruction.label ||
        option.label.includes("Standard Length Shirt")),
  ),
  false,
  "construction choices are not Included rows under Style & Options",
);
assert.equal(
  constructionLine(presentationView, presentationGarment.garmentKey)?.detail,
  baseConstruction.label,
  "Garments Ordered shows the selected construction option under the garment name",
);
assert.equal(
  constructionLine(presentationView, presentationGarment.garmentKey)?.label,
  presentationGarment.label,
);
assert.equal(
  section(presentationView, "construction").footer?.amountCents,
  preDeliveryConstructionCents,
  "separating construction prices from selected options must not alter subtotal authority",
);
assert.equal(presentationView.totalAmountCents, preDelivery.view.totalAmountCents);

const shirtSelection = buildSelection(["shirt"], "male");
const midLongPick = selectGarmentConstructionOption({
  resolution: shirtSelection.constructionByGarment.shirt!,
  selectionGroup: "shirt_construction",
  optionId: "shirt_std_midlong",
  normalizedCustomDetailCatalog: catalog,
});
assert.equal(midLongPick.status, "selected");
if (midLongPick.status !== "selected") {
  throw new Error("expected Mid-Long construction");
}
const midLongPockets = setGarmentScopedCustomDetailSelection(
  createEmptyGarmentScopedCustomDetailsState(),
  "base:shirt",
  "shirt_pockets",
  "shirt_pocket_0",
);
const midLongOrder = buildAuthority({
  garmentTypeSelection: {
    ...shirtSelection,
    constructionByGarment: {
      ...shirtSelection.constructionByGarment,
      shirt: midLongPick.resolution,
    },
  },
  styleOverrides: { name: "Casual Native" },
  customState: midLongPockets,
});
const midLongLine = constructionLine(midLongOrder.view, "base:shirt");
assert.ok(midLongLine);
assert.equal(midLongLine.label, "Standard Shirt");
assert.equal(
  midLongLine.detail,
  "Standard Length Shirt, Mid-Long Sleeve",
);
assert.match(midLongLine.detail || "", /Mid-Long/);
assert.equal(midLongLine.amountLabel, "€70.00");
assert.equal(
  midLongOrder.summary.garmentSummary[0]?.constructionTotalCents,
  7000,
);
const midLongStyle = section(midLongOrder.view, "style_and_options").lines[0]!;
assert.equal(midLongStyle.label, "Standard Shirt");
assert.equal(midLongStyle.detail, "Casual Native");
assert.deepEqual(
  (midLongStyle.constructionOptions || []).map(
    (option) => `${option.label} — ${option.amountLabel}`,
  ),
  ["No Pockets — Included"],
  "Style & Options shows the design style plus pockets, not the construction choice",
);
assert.equal(
  (midLongStyle.constructionOptions || []).some(
    (option) =>
      option.amountLabel === "Included" &&
      /Standard Length Shirt|Short Sleeve|Mid-Long/.test(option.label),
  ),
  false,
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
// Non-shirt garments: the construction labels ("With Rope", "... Length,
// Sleeveless") never name the garment, so the name must lead the row.
assert.deepEqual(
  section(multiFabric.view, "construction").lines.map((line) => [line.label, line.detail]),
  [
    ["Standard Shirt", "Standard Length Shirt, Short Sleeve"],
    ["Trouser", "With Rope"],
    ["Standard Dress", "Standard Length, Sleeveless / Over Shoulder"],
  ],
);
assert.deepEqual(
  section(multiFabric.view, "fabrics").lines.map((line) => `${line.label} — ${line.detail}`),
  [
    "Standard Shirt — Royal Forest Mosaic",
    "Trouser — Royal Forest Mosaic",
    "Standard Dress — Imperial Sapphire Link",
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
assert.ok(section(multiFabric.view, "style_and_options"));

const extraSelection = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: getFutureFabricCapacityComposition(
    buildSelection(["shirt", "trouser", "dress"], "unisex"),
  ),
  existingAssignments: multiFabric.allocation.fabricAllocations.flatMap(
    (item) => item.garmentAssignments,
  ),
  authorizedOccurrenceKeys: [],
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
assert.deepEqual(
  section(extraCommitted.view, "fabrics").lines.map((line) => line.id),
  [
    "fabric-base:shirt",
    "fabric-base:trouser",
    "fabric-base:dress",
    `fabric-${extraKeys[0]}`,
  ],
  "Fabric entries follow one physical occurrence order, including additions",
);
const extraLine = constructionLine(extraCommitted.view, extraKeys[0]);
assert.ok(extraLine, "committed extra garment must appear in construction rows");
assert.equal(extraLine.id, `construction-${extraKeys[0]}`);
assert.match(extraLine.label, /Shirt/);
// Additional Garments rows also lead with the garment name; construction is the detail.
assert.doesNotMatch(extraLine.label, /Length|Sleeve/);
assert.match(extraLine.detail || "", /Standard Length Shirt/);
assert.equal(extraLine.supportingDetail, undefined);
assert.equal(
  additionalGarmentsSubsection(extraCommitted.view)?.focusGarmentKey,
  null,
  "complete additional garments use the Additional Garment management section target",
);
hiddenSection(extraCommitted.view, "optional_extras");
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

const missingAdditionalFabricCancellation = cancelFutureFabricCatalogueAssignment({
  state: withExtraAllocation,
  garmentKey: extraKeys[0],
});
assert.equal(missingAdditionalFabricCancellation.status, "cancelled");
const missingAdditionalFabricAuthority = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: {
    ...missingAdditionalFabricCancellation.state,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  },
  additionalConstructionState: extraCommitted.additionalConstruction.state,
});
const missingAdditionalSection = additionalGarmentsSubsection(
  missingAdditionalFabricAuthority.view,
);
assert.deepEqual(
  section(missingAdditionalFabricAuthority.view, "construction").lines.map(
    (line) => line.id,
  ), [
    "construction-base:shirt",
    "construction-base:trouser",
    "construction-base:dress",
  ], "Garments Ordered keeps only base occurrences in its primary list");
assert.deepEqual(
  missingAdditionalSection?.lines.map((line) => line.id),
  [`construction-${extraKeys[0]}`],
  "the Additional Garments subsection preserves the exact additional occurrence once",
);
assert.equal(
  missingAdditionalSection?.focusGarmentKey,
  extraKeys[0],
  "Additional Garments Edit targets the first exact incomplete occurrence",
);
assert.deepEqual(
  section(missingAdditionalFabricAuthority.view, "fabrics").lines.map(
    (line) => line.id,
  ),
  [
    "fabric-base:shirt",
    "fabric-base:trouser",
    "fabric-base:dress",
  ],
  "a missing additional Fabric never displaces base Fabric entries",
);
assert.equal(
  section(missingAdditionalFabricAuthority.view, "construction").footer?.amountCents,
  section(extraCommitted.view, "construction").footer?.amountCents,
  "removing Fabric does not change the construction subtotal",
);

const extraSelection2 = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: getFutureFabricCapacityComposition(
    buildSelection(["shirt", "trouser", "dress"], "unisex"),
  ),
  existingAssignments: withExtraAllocation.fabricAllocations.flatMap(
    (item) => item.garmentAssignments,
  ),
  authorizedOccurrenceKeys: extraKeys,
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
const twoExtraLines = [
  constructionLine(twoExtras.view, "additional:shirt:1"),
  constructionLine(twoExtras.view, "additional:shirt:2"),
];
assert.ok(twoExtraLines[0]);
assert.ok(twoExtraLines[1]);
assert.equal(twoExtraLines[0]?.id, "construction-additional:shirt:1");
assert.equal(twoExtraLines[1]?.id, "construction-additional:shirt:2");
assert.match(twoExtraLines[0]?.label || "", /Shirt/);
assert.match(twoExtraLines[1]?.label || "", /Shirt/);
hiddenSection(twoExtras.view, "optional_extras");
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
assert.match(twoExtraLines[0]?.detail || "", /Length/);
assert.match(twoExtraLines[1]?.detail || "", /Length/);
assert.doesNotMatch(twoExtraLines[0]?.label || "", /Length/);
assert.doesNotMatch(twoExtraLines[1]?.label || "", /Length/);

const selectedTwoExtrasView = projectDesignStudioLiveOrderSummary({
  summary: {
    ...twoExtras.summary,
    designStyleOccurrences: twoExtras.summary.garmentSummary.map((garment) => ({
      garmentKey: garment.garmentKey,
      occurrenceLabel: garment.label,
      sourceKind: "catalogue" as const,
      status: "selected" as const,
      name: "Selected fixture design",
      image: null,
      detail: null,
    })),
  },
  shippingResolution: twoExtras.shippingResolution,
  candidatePricing: twoExtras.candidateResult.candidate?.pricing ?? null,
  fabricAllocationState: twoExtras.allocation,
  measurementState: twoExtras.measurementState,
  measurementPlan: twoExtras.measurementPlan,
  designSource: { kind: "catalog", sourceKey: "fixture-style", styleId: "fixture-style" },
  additionalConstructionState: twoExtras.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
const selectedTwoExtrasSubsection = additionalGarmentsSubsection(
  selectedTwoExtrasView,
);
assert.deepEqual(
  selectedTwoExtrasSubsection?.lines.map((line) => ({
    id: line.id,
    focusGarmentKey: line.focusGarmentKey,
    detail: line.detail,
    amountLabel: line.amountLabel,
  })),
  twoExtraKeys.map((garmentKey) => ({
    id: `construction-${garmentKey}`,
    focusGarmentKey: garmentKey,
    // The selected construction sits under the garment name.
    detail: "Standard Length Shirt, Short Sleeve",
    amountLabel: `€${(
      (twoExtras.additionalConstruction.state.byGarmentKey[garmentKey]?.status === "resolved"
        ? twoExtras.additionalConstruction.state.byGarmentKey[garmentKey].totalPriceCents
        : 0) / 100
    ).toFixed(2)}`,
  })),
  "every Additional Garment retains its exact Step 4 Edit target and price in its sole garment-order row",
);

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
const pendingExtraKey = extraSelection.selection.garmentSpec?.key;
assert.equal(pendingExtraKey, "additional:shirt:1");
const pendingShirtConstruction = resolveGarmentConstructionPricing(
  "shirt",
  normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG),
);
assert.equal(pendingShirtConstruction.status, "resolved");
const pendingOverlay = mergeProvisionalAdditionalConstructionForLiveSummary(
  null,
  {
    origin: "new_addition",
    garmentKey: pendingExtraKey || "",
    construction: pendingShirtConstruction,
  },
);
const pendingExtraPreview = buildAuthority({
  garmentTypes: ["shirt", "trouser", "dress"],
  demographic: "unisex",
  fabricAllocationState: pendingExtraState,
  additionalConstructionState: pendingOverlay || null,
});
const pendingPreviewSubsection = additionalGarmentsSubsection(
  pendingExtraPreview.view,
);
assert.equal(
  pendingPreviewSubsection?.lines.length,
  1,
  "overlaying in-flight construction lists the extra garment before fabric",
);
assert.equal(
  pendingPreviewSubsection?.lines[0]?.id,
  `construction-${pendingExtraKey}`,
);
assert.match(pendingPreviewSubsection?.lines[0]?.label || "", /Shirt/);
assert.ok(pendingPreviewSubsection?.lines[0]?.amountLabel);
assert.equal(
  section(pendingExtraPreview.view, "fabrics").lines.some(
    (line) => line.id === `fabric-${pendingExtraKey}`,
  ),
  false,
  "the preview omits a fabric row until a fabric is chosen",
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
const dressOptionsLine = section(dressCost.view, "style_and_options").lines.find(
  (line) => line.id === "style-and-options-base:dress",
);
const dressLine = dressOptionsLine?.constructionOptions?.find(
  (option) => option.id === `custom-detail-option:${dressOccurrence.occurrenceKey}`,
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
  section(dressCost.view, "style_and_options").lines.some((line) =>
    /shirt additional|trouser additional/i.test(
      line.constructionOptions?.map((option) => option.label).join(" ") || "",
    ),
  ),
  false,
);

const midIncomplete = buildAuthority({
  measurementRoute: "medium_risk",
  completeMeasurements: false,
});
assert.match(
  section(midIncomplete.view, "measurements").lines[0]?.label || "",
  /Medium Risk \(Most Measurements\)/,
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

const highShirtTrouserIncomplete = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  measurementRoute: "high_risk",
  completeMeasurements: false,
});
assert.equal(
  section(highShirtTrouserIncomplete.view, "measurements").lines[0]?.label,
  "High Risk (Key Measurements) — 6 required measurements remaining",
);
assert.equal(
  highShirtTrouserIncomplete.measurementState.diagnostics.filter(
    (diagnostic) => diagnostic.code === "required_measurement_missing",
  ).length,
  7,
);
const highShirtTrouserComplete = buildAuthority({
  garmentTypes: ["shirt", "trouser"],
  measurementRoute: "high_risk",
  completeMeasurements: true,
});
assert.equal(
  section(highShirtTrouserComplete.view, "measurements").lines[0]?.label,
  "High Risk (Key Measurements) — Complete",
);

const midComplete = buildAuthority({
  measurementRoute: "medium_risk",
  completeMeasurements: true,
});
assert.equal(
  section(midComplete.view, "measurements").lines[0]?.label,
  "Medium Risk (Most Measurements) — Complete",
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
  pickupDelivery.find((line) => line.label === "Pickup location")?.detail,
  "Eindhoven",
);
assert.equal(
  pickupDelivery.some((line) => line.label === "Shipping"),
  false,
  "pickup must not display a shipping charge",
);
assert.equal(pickup.view.costBreakdown?.shipping, null);
assert.equal(
  pickup.view.costBreakdown?.includedInboundShipping ?? null,
  null,
  "omitting the order type does not invent an inbound display line",
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
const individualPickup = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "eindhoven_pickup",
  },
  orderType: "Individual",
});
assert.equal(individualPickup.summary.garmentSummary.length, 1);
assert.equal(
  individualPickup.view.costBreakdown?.includedInboundShipping ?? null,
  null,
  "pickup does not add the Individual Lagos band",
);
assert.equal(individualPickup.view.costBreakdown?.shipping ?? null, null);
assert.equal(
  individualPickup.view.totalAmountCents,
  pickup.view.totalAmountCents,
  "pickup adds no Lagos band and no final-mile fee",
);
assert.equal(
  individualPickup.view.costBreakdown?.subtotal.amountCents,
  pickup.view.totalAmountCents,
);
assert.equal(
  individualPickup.view.costBreakdown?.subtotal.amountCents,
  individualPickup.view.totalAmountCents,
);
assert.equal(
  individualPickup.candidateResult.candidate?.pricing.components
    .lagosToEindhovenShipping.status,
  "included_in_garment_construction",
);
assert.equal(
  individualPickup.candidateResult.candidate?.pricing.components
    .lagosToEindhovenShipping.amountCents,
  null,
);
const communityPickup = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: {
    ...withContact(createEmptyFutureShippingState()),
    fulfilmentMethod: "eindhoven_pickup",
  },
  orderType: "Community",
});
assert.equal(communityPickup.view.costBreakdown?.includedInboundShipping, null);
assert.equal(
  communityPickup.view.totalAmountCents,
  pickup.view.totalAmountCents,
);
const individualDelivery = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  shippingState: withDelivery("DE", "Berlin"),
  orderType: "Individual",
});
assert.equal(
  individualDelivery.view.costBreakdown?.includedInboundShipping?.amountCents,
  13125,
  "address delivery still shows the €131.25 Lagos block",
);
for (const [pieceCount, amountCents] of [
  [5, 13125],
  [13, 26250],
  [25, 39375],
  [49, 65625],
] as const) {
  const banded = projectDesignStudioLiveOrderSummary({
    summary: {
      ...individualDelivery.summary,
      garmentSummary: Array.from({ length: pieceCount }, (_, index) => ({
        ...individualDelivery.summary.garmentSummary[0],
        garmentKey: `base:shirt:${index}`,
      })),
    },
    shippingResolution: individualDelivery.shippingResolution,
    candidatePricing: individualDelivery.candidateResult.candidate?.pricing ?? null,
    fabricAllocationState: individualPickup.allocation,
    measurementState: individualPickup.measurementState,
    measurementPlan: individualPickup.measurementPlan,
    designSource: {
      kind: "catalog",
      sourceKey: "style-shirt",
      styleId: "style-shirt",
    },
    additionalConstructionState: individualPickup.additionalConstruction.state,
    catalogInspection: inspection,
    showAdditionalClothesCosts: false,
    orderType: "Individual",
  });
  assert.equal(
    banded.costBreakdown?.includedInboundShipping?.amountCents,
    amountCents,
  );
  assert.equal(
    banded.totalAmountCents,
    (individualDelivery.candidateResult.candidate?.pricing.exactTotalCents || 0) +
      amountCents,
  );
}

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
  courierDelivery.find((line) => line.label === "Shipping")?.detail,
);
assert.notEqual(
  courierDelivery.find((line) => line.label === "Shipping")?.detail,
  "Custom shipping quote required",
);
assert.equal(
  courier.view.costBreakdown?.shipping?.amountCents,
  courier.candidateResult.candidate?.pricing.postEindhovenAdjustmentCents,
  "the mounted Summary reuses the authoritative shipping projection",
);
assert.equal(
  courier.view.costBreakdown?.subtotal.amountCents,
  courier.candidateResult.candidate?.pricing.selectedDesignTotalCents,
);
assert.equal(
  (courier.view.costBreakdown?.subtotal.amountCents || 0) +
    (courier.view.costBreakdown?.shipping?.amountCents || 0),
  courier.view.totalAmountCents,
  "the mounted Summary only projects the released payable total once",
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
  measurementPlan: courier.measurementPlan,
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
assert.equal(candidateUnavailableProjected.costBreakdown?.subtotal.amountCents, 6500);
assert.equal(
  candidateUnavailableProjected.costBreakdown?.shipping?.amountCents,
  courier.shippingResolution.postEindhovenAdjustmentCents,
);

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
  otherDelivery.find((line) => line.label === "Shipping")?.detail,
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
assert.equal(otherDestination.view.costBreakdown?.shipping?.amountCents, null);
assert.equal(
  otherDestination.view.costBreakdown?.shipping?.valueLabel,
  "Custom shipping quote required",
  "unknown shipping remains unknown rather than becoming €0",
);

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
  measurementPlan: courier.measurementPlan,
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
      (line) => line.label === "Shipping",
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
  summary: {
    ...early.summary,
    designStyleOccurrences: [{
      garmentKey: early.summary.garmentSummary[0]!.garmentKey,
      occurrenceLabel: "Shirt",
      sourceKind: "uploaded",
      status: "selected",
      name: "Uploaded design",
      image: null,
      detail: "Uploaded design selected",
    }],
  },
  shippingResolution: early.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: early.allocation,
  measurementState: early.measurementState,
  measurementPlan: early.measurementPlan,
  designSource: uploadedDesignSource,
});
assert.equal(
  section(uploaded, "style_and_options").lines[0]?.label,
  "Standard Shirt",
);
assert.equal(
  section(uploaded, "style_and_options").lines[0]?.detail,
  "Uploaded design",
);
assert.notEqual(uploaded.totalLabel, LIVE_ORDER_SUMMARY_TOTAL_LABEL);

const uploadedWithDelivery = projectDesignStudioLiveOrderSummary({
  summary: courier.summary,
  shippingResolution: courier.shippingResolution,
  candidatePricing: null,
  fabricAllocationState: courier.allocation,
  measurementState: courier.measurementState,
  measurementPlan: courier.measurementPlan,
  designSource: uploadedDesignSource,
  additionalConstructionState: courier.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.ok(
  section(uploadedWithDelivery, "delivery").lines.find(
    (line) => line.label === "Shipping",
  )?.detail,
);
assert.notEqual(
  section(uploadedWithDelivery, "delivery").lines.find(
    (line) => line.label === "Shipping",
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
  measurementPlan: otherDestination.measurementPlan,
  designSource: uploadedDesignSource,
  additionalConstructionState: otherDestination.additionalConstruction.state,
  catalogInspection: inspection,
  showAdditionalClothesCosts: false,
});
assert.equal(
  section(uploadedQuote, "delivery").lines.find(
    (line) => line.label === "Shipping",
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
const fullExtraLine = constructionLine(full.view, extraKeys[0]);
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
  section(full.view, "style_and_options").lines.some((line) =>
    line.constructionOptions?.some(
      (option) => option.id === `custom-detail-option:${dressOccurrence.occurrenceKey}`,
    ),
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
  (section(full.view, "construction").footers || []).filter(
    (footer) => footer.note === LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
  ).length,
  1,
  "construction inclusion note appears once under Garments Ordered footers",
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
      "style_and_options",
      "measurements",
      "delivery",
    ].includes(id),
  ),
  [
    "construction",
    "fabrics",
    "style_and_options",
    "measurements",
    "delivery",
  ],
);
assert.equal(section(manyItems.view, "construction").lines.length, 3);
assert.deepEqual(
  additionalGarmentsSubsection(manyItems.view)?.lines.map((line) => line.id),
  ["construction-additional:shirt:1", "construction-additional:shirt:2"],
  "multiple additions appear once in the Additional Garments subsection",
);
assert.equal(
  manyItems.view.sections.some((sectionItem) => sectionItem.id === "optional_extras"),
  false,
);
assert.equal(
  section(manyItems.view, "fabrics").lines.length,
  5,
  "the Fabrics section follows the full physical occurrence order",
);
assert.ok(
  manyItems.view.sections.every(
    (item) =>
        item.lines.length > 0 ||
        Boolean(item.subsections?.length) ||
        Boolean(item.footer),
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

const noPersonalizedAdditions = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  styleOverrides: {
    customDetailConfig: {
      representedGenders: ["male"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: [],
      enabled: true,
    },
  },
});
hiddenSection(noPersonalizedAdditions.view, "personalized_additions");

const personalizedAdditions = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  designSelections: {
    decorativeFeaturesByGarmentKey: {
      "base:shirt": ["Name Monogram", "Embroidery", "Monogram Trimming"],
    },
    decorativeFeatures: ["Name Monogram", "Embroidery", "Monogram Trimming"],
    accessories: ["Traditional Hat"],
  },
  styleOverrides: {
    customDetailConfig: {
      representedGenders: ["male"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: [],
      enabled: true,
    },
  },
});
const personalizedSection = section(
  personalizedAdditions.view,
  "personalized_additions",
);
const personalizedSectionIds = personalizedAdditions.view.sections.map(
  (item) => item.id,
);
assert.deepEqual(
  personalizedSectionIds,
  [
    "construction",
    "personalized_additions",
    "fabrics",
    "style_and_options",
    "measurements",
  ],
  "Personalized Additions renders immediately after Garments Ordered and is omitted when empty",
);
assert.equal(
  personalizedSectionIds.indexOf("personalized_additions"),
  personalizedSectionIds.indexOf("construction") + 1,
  "Personalized Additions is the next section after Garments Ordered",
);
assert.deepEqual(
  personalizedSectionIds.slice(
    personalizedSectionIds.indexOf("personalized_additions") + 1,
  ),
  ["fabrics", "style_and_options", "measurements"],
  "unrelated Summary sections keep their existing relative order after Personalized Additions",
);
assert.equal(
  personalizedSectionIds.filter((id) => id === "personalized_additions").length,
  1,
  "Personalized Additions is not duplicated later in the Summary card",
);
assert.deepEqual(
  personalizedSection.lines.map(({ label, detail, amountLabel }) => ({
    label,
    detail,
    amountLabel,
  })),
  [
    {
      label: "Monogram",
      detail: "Standard Shirt: Name Monogram",
      amountLabel: "€12.00",
    },
    {
      label: "Monogram",
      detail: "Standard Shirt: Monogram Trimming",
      amountLabel: "€12.00",
    },
    {
      label: "Embroidery Design",
      detail: "Standard Shirt: Embroidery",
      amountLabel: "€12.00",
    },
    { label: "Accessories", detail: "Traditional Hat", amountLabel: "€12.00" },
  ],
  "exact personalized addition rows show each euro price; the subtotal remains the rollup",
);
const namedPersonalizedAdditions = buildAuthority({
  fabricByGarment: { shirt: fabricA },
  measurementRoute: "low_risk",
  designSelections: {
    decorativeFeaturesByGarmentKey: {
      "base:shirt": ["Name Monogram"],
    },
    decorativeFeatures: ["Name Monogram"],
    monogramTextByGarmentKey: { "base:shirt": "ADEBAYO" },
    monogramPlacementByGarmentKey: { "base:shirt": "left_chest" },
    monogramText: "ADEBAYO",
    monogramPlacement: "left_chest",
  },
  styleOverrides: {
    customDetailConfig: {
      representedGenders: ["male"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: [],
      enabled: true,
    },
  },
});
assert.deepEqual(
  section(namedPersonalizedAdditions.view, "personalized_additions").lines.map(
    ({ label, detail, amountLabel }) => ({ label, detail, amountLabel }),
  ),
  [
    {
      label: "Monogram",
      detail: "Standard Shirt: Name Monogram “ADEBAYO”, Left Chest",
      amountLabel: "€12.00",
    },
  ],
  "the live Order Summary shows the embroidered name and placement",
);
const constructionSection = section(personalizedAdditions.view, "construction");
assert.equal(
  constructionSection.footer?.id,
  "construction-subtotal",
  "footer remains the first construction money row for callers",
);
assert.deepEqual(
  constructionSection.footers?.map(({ id, label, amountCents, note }) => ({
    id,
    label,
    amountCents,
    note,
  })),
  [
    {
      id: "construction-subtotal",
      label: LIVE_ORDER_SUMMARY_CONSTRUCTION_SUBTOTAL_LABEL,
      amountCents: constructionSection.footer?.amountCents,
      note: LIVE_ORDER_SUMMARY_CONSTRUCTION_INCLUSION_NOTE,
    },
  ],
  "Garments Ordered keeps only Garment Subtotal",
);
assert.equal(
  constructionSection.footers?.some(
    (footer) => footer.id === "personalized-additions-subtotal",
  ),
  false,
  "Personalized Additions Subtotal is not under Garments Ordered",
);
assert.deepEqual(
  personalizedSection.footers?.map(({ id, label, amountCents, note }) => ({
    id,
    label,
    amountCents,
    note,
  })),
  [
    {
      id: "personalized-additions-subtotal",
      label: LIVE_ORDER_SUMMARY_PERSONALIZED_ADDITIONS_SUBTOTAL_LABEL,
      amountCents: 4800,
      note: "",
    },
  ],
  "Personalized Additions Subtotal sits on the Personalized Additions section",
);
assert.equal(
  personalizedSection.footer?.id,
  "personalized-additions-subtotal",
  "the section footer is the Personalized Additions Subtotal",
);
assert.equal(
  personalizedAdditions.view.totalLabel,
  LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL,
  "incomplete payable totals use Current Total",
);
assert.equal(personalizedSection.editStage, "personalized_additions");
assert.equal(
  personalizedAdditions.view.totalAmountCents,
  Math.round(
    (personalizedAdditions.summary.pricingSummary.selectedDesignPrice
      ?.selectedDesignPrice || 0) * 100,
  ),
  "Summary presentation cannot alter the authoritative total",
);
assert.equal(
  personalizedAdditions.view.sections
    .find((item) => item.id === "style_and_options")
    ?.lines.some((line) => line.label === "Order Details"),
  false,
  "order-level personalized additions no longer duplicate Style & Options",
);

const projectPersonalizedPrices = (
  priceFor: (optionId: string) => {
    priceStatus: "exact" | "evaluation_required" | "invalid";
    priceCents: number | null;
  },
) =>
  projectDesignStudioLiveOrderSummary({
    summary: {
      ...personalizedAdditions.summary,
      customDetailsSummary:
        personalizedAdditions.summary.customDetailsSummary.map((group) => ({
          ...group,
          occurrences: group.occurrences.map((occurrence) =>
            occurrence.selectionGroup === "order_optional_detail"
              ? { ...occurrence, ...priceFor(occurrence.optionId) }
              : occurrence,
          ),
        })),
    },
    shippingResolution: personalizedAdditions.shippingResolution,
    candidatePricing:
      personalizedAdditions.candidateResult.candidate?.pricing ?? null,
    fabricAllocationState: personalizedAdditions.allocation,
    measurementState: personalizedAdditions.measurementState,
    measurementPlan: personalizedAdditions.measurementPlan,
    designSource: {
      kind: "catalog",
      sourceKey: "fixture",
      styleId: "fixture",
    },
  });
const mixedPersonalizedPrices = projectPersonalizedPrices((optionId) => {
  if (optionId === "Name Monogram") {
    return { priceStatus: "exact", priceCents: 1200 };
  }
  if (optionId === "Monogram Trimming") {
    return { priceStatus: "exact", priceCents: 0 };
  }
  if (optionId === "Embroidery") {
    return { priceStatus: "exact", priceCents: null };
  }
  return { priceStatus: "evaluation_required", priceCents: 1200 };
});
assert.deepEqual(
  section(mixedPersonalizedPrices, "personalized_additions").lines.map(
    ({ label, detail, amountLabel }) => ({ label, detail, amountLabel }),
  ),
  [
    {
      label: "Monogram",
      detail: "Standard Shirt: Name Monogram",
      amountLabel: "€12.00",
    },
    {
      label: "Monogram",
      detail: "Standard Shirt: Monogram Trimming",
      amountLabel: "Included",
    },
    {
      label: "Embroidery Design",
      detail: "Standard Shirt: Embroidery",
      amountLabel: "Included",
    },
    {
      label: "Accessories",
      detail: "Traditional Hat",
      amountLabel: "Price requires evaluation",
    },
  ],
  "zero and missing exact prices stay Included; a non-exact price requires evaluation",
);
assert.equal(
  section(mixedPersonalizedPrices, "personalized_additions").footers?.find(
    (footer) => footer.id === "personalized-additions-subtotal",
  )?.amountCents,
  1200,
  "the Personalized Additions Subtotal still rolls up only exact prices above zero",
);
assert.equal(
  section(mixedPersonalizedPrices, "construction").footers?.some(
    (footer) => footer.id === "personalized-additions-subtotal",
  ),
  false,
  "a partial Personalized Additions Subtotal stays off Garments Ordered",
);
assert.equal(
  mixedPersonalizedPrices.totalAmountCents,
  personalizedAdditions.view.totalAmountCents,
  "row labels do not change total resolution",
);
const invalidPersonalizedPrice = projectPersonalizedPrices((optionId) =>
  optionId === "Traditional Hat"
    ? { priceStatus: "invalid", priceCents: 1200 }
    : { priceStatus: "exact", priceCents: 0 },
);
assert.equal(
  section(invalidPersonalizedPrice, "personalized_additions").lines.find(
    (line) => line.detail === "Traditional Hat",
  )?.amountLabel,
  "Price requires evaluation",
  "an invalid personalized addition price requires evaluation and is not shown as euros",
);
assert.equal(
  section(invalidPersonalizedPrice, "personalized_additions").footers?.some(
    (footer) => footer.id === "personalized-additions-subtotal",
  ) ?? false,
  false,
  "a zero-priced exact set does not add a Personalized Additions Subtotal",
);
assert.equal(
  section(invalidPersonalizedPrice, "construction").footers?.some(
    (footer) => footer.id === "personalized-additions-subtotal",
  ),
  false,
  "a zero-priced exact set does not put a Personalized Additions Subtotal under Garments Ordered",
);
assert.equal(
  invalidPersonalizedPrice.totalAmountCents,
  personalizedAdditions.view.totalAmountCents,
  "invalid and zero row labels do not change total resolution",
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

const wearerOrderFor = (
  wearers: ReadonlyArray<{
    wearerId: string;
    displayName: string;
    presentationOrder: number;
    fitContext?: "male" | "female" | "unisex" | null;
  }>,
  assignmentByGarmentKey: Record<string, string>,
): WearerOrderStateV2 => ({
  schemaVersion: 2,
  wearers: wearers.map((wearer) => ({
    wearerId: wearer.wearerId,
    displayName: wearer.displayName,
    fitContext: wearer.fitContext === undefined ? "male" : wearer.fitContext,
    presentationOrder: wearer.presentationOrder,
    measurement: createEmptyFutureMeasurementState(),
  })),
  assignmentByGarmentKey,
});

const namedWearers = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-nol", displayName: "Nol", presentationOrder: 0 },
      { wearerId: "wearer-pio", displayName: "Pio", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-nol",
      "base:kaftan": "wearer-pio",
    },
  ),
});
const nolLine = constructionLine(namedWearers.view, "base:shirt");
const pioLine = constructionLine(namedWearers.view, "base:kaftan");
assert.equal(nolLine?.label, "Standard Shirt");
assert.equal(nolLine?.detail, "Standard Length Shirt, Short Sleeve");
assert.equal(nolLine?.wearerLabel, "Nol");
assert.equal(nolLine?.fitLabel, undefined);
assert.equal(nolLine?.supportingDetail, undefined);
assert.equal(pioLine?.label, "Long Shirt");
assert.equal(pioLine?.detail, "Long Length Shirt, Short Sleeve");
assert.equal(pioLine?.wearerLabel, "Pio");
assert.equal(pioLine?.fitLabel, undefined);
assert.equal(
  section(namedWearers.view, "fabrics").lines.every(
    (line) => line.wearerLabel == null && line.fitLabel == null,
  ),
  true,
);
assert.equal(
  section(namedWearers.view, "style_and_options").lines.every(
    (line) => line.wearerLabel == null && line.fitLabel == null,
  ),
  true,
);

// Second person not saved yet: no wearer line on any Garments Ordered row.
const blankWearers = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-spaces", displayName: "   ", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "base:kaftan": "wearer-spaces",
    },
  ),
});
assert.equal(constructionLine(blankWearers.view, "base:shirt")?.wearerLabel, undefined);
assert.equal(constructionLine(blankWearers.view, "base:shirt")?.fitLabel, undefined);
assert.equal(constructionLine(blankWearers.view, "base:kaftan")?.wearerLabel, undefined);
assert.equal(constructionLine(blankWearers.view, "base:kaftan")?.fitLabel, undefined);
assert.equal(constructionLine(blankWearers.view, "base:shirt")?.label, "Standard Shirt");
assert.equal(constructionLine(blankWearers.view, "base:shirt")?.detail, "Standard Length Shirt, Short Sleeve");
assert.equal(constructionLine(blankWearers.view, "base:kaftan")?.label, "Long Shirt");
assert.equal(constructionLine(blankWearers.view, "base:kaftan")?.detail, "Long Length Shirt, Short Sleeve");
assert.equal(
  section(blankWearers.view, "construction").lines.every((line) => line.wearerLabel == null),
  true,
  "no Person 1 / Person 2 before the second name is saved",
);

// Second person typing (name stored but still unsaved in Step 7): no wearer line.
const typingSecond = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-pio", displayName: "Pi", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "base:kaftan": "wearer-pio",
    },
  ),
  unsavedWearerNameIds: ["wearer-pio"],
});
assert.equal(constructionLine(typingSecond.view, "base:shirt")?.wearerLabel, undefined);
assert.equal(constructionLine(typingSecond.view, "base:kaftan")?.wearerLabel, undefined);

// Second name saved: lines show; a still-blank first person reads Person 1.
const savedSecond = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-blank", displayName: "", presentationOrder: 0 },
      { wearerId: "wearer-pio", displayName: "Pio", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-blank",
      "base:kaftan": "wearer-pio",
    },
  ),
  unsavedWearerNameIds: [],
});
assert.equal(constructionLine(savedSecond.view, "base:shirt")?.wearerLabel, "Person 1");
assert.equal(constructionLine(savedSecond.view, "base:kaftan")?.wearerLabel, "Pio");

// Editing the first person's name does not close the gate.
const typingFirst = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-nol", displayName: "No", presentationOrder: 0 },
      { wearerId: "wearer-pio", displayName: "Pio", presentationOrder: 1 },
    ],
    {
      "base:shirt": "wearer-nol",
      "base:kaftan": "wearer-pio",
    },
  ),
  unsavedWearerNameIds: ["wearer-nol"],
});
assert.equal(constructionLine(typingFirst.view, "base:shirt")?.wearerLabel, "No");
assert.equal(constructionLine(typingFirst.view, "base:kaftan")?.wearerLabel, "Pio");

const soloWearer = buildAuthority({
  garmentTypes: ["shirt"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA },
  wearerOrder: wearerOrderFor(
    [{
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      presentationOrder: 0,
      fitContext: "female",
    }],
    { "base:shirt": "wearer-amaka" },
  ),
});
assert.equal(constructionLine(soloWearer.view, "base:shirt")?.label, "Standard Shirt");
assert.equal(constructionLine(soloWearer.view, "base:shirt")?.detail, "Standard Length Shirt, Short Sleeve");
// Solo: no wearer line, even with a saved name.
assert.equal(constructionLine(soloWearer.view, "base:shirt")?.wearerLabel, undefined);
assert.equal(constructionLine(soloWearer.view, "base:shirt")?.fitLabel, undefined);
assert.equal(
  section(soloWearer.view, "fabrics").lines.every(
    (line) => line.wearerLabel == null && line.fitLabel == null,
  ),
  true,
);
assert.equal(
  section(soloWearer.view, "style_and_options").lines.every(
    (line) => line.wearerLabel == null && line.fitLabel == null,
  ),
  true,
);

const soloFitUnset = buildAuthority({
  garmentTypes: ["shirt"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA },
  wearerOrder: wearerOrderFor(
    [{
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      presentationOrder: 0,
      fitContext: null,
    }],
    { "base:shirt": "wearer-amaka" },
  ),
});
assert.equal(constructionLine(soloFitUnset.view, "base:shirt")?.wearerLabel, undefined);
assert.equal(constructionLine(soloFitUnset.view, "base:shirt")?.fitLabel, undefined);

const unassignedSecond = buildAuthority({
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  fabricByGarment: { shirt: fabricA, kaftan: fabricA },
  wearerOrder: wearerOrderFor(
    [
      { wearerId: "wearer-nol", displayName: "Nol", presentationOrder: 0 },
      { wearerId: "wearer-pio", displayName: "Pio", presentationOrder: 1 },
    ],
    { "base:shirt": "wearer-nol" },
  ),
});
assert.equal(constructionLine(unassignedSecond.view, "base:shirt")?.wearerLabel, "Nol");
assert.equal(constructionLine(unassignedSecond.view, "base:shirt")?.fitLabel, undefined);
assert.equal(constructionLine(unassignedSecond.view, "base:kaftan")?.wearerLabel, undefined);
assert.equal(constructionLine(unassignedSecond.view, "base:kaftan")?.fitLabel, undefined);

const helperSource = readFileSync(
  new URL("./src/utils/designStudioLiveOrderSummary.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(helperSource, /calculateDesignPricing\(/);
assert.doesNotMatch(helperSource, /resolveStep8AdditionalDelivery\(/);
assert.match(helperSource, /projectFutureDesignStudioSummary|FutureDesignStudioSummary/);
assert.match(helperSource, /getStep8OrderSummaryRows/);
assert.match(helperSource, /LIVE_ORDER_SUMMARY_CURRENT_TOTAL_LABEL/);
assert.match(helperSource, /constructionTotalCents/);

console.log("test_design_studio_live_order_summary.ts: all assertions passed");
