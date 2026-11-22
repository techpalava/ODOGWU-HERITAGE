import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
  WearerOrderStateV2,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { projectDesignStudioLiveOrderSummary } from "./src/utils/designStudioLiveOrderSummary";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailsState } from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  hasOnsitePhysicalMeasurements,
  MEASUREMENT_ONSITE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
  MEASUREMENT_ONSITE_BOOKING_INSTRUCTION,
  MEASUREMENT_ONSITE_BOOKING_REASON,
  MEASUREMENT_ONSITE_LIVE_SUMMARY_COMPLETE_DETAIL,
  MEASUREMENT_ONSITE_LIVE_SUMMARY_INCOMPLETE_DETAIL,
  MEASUREMENT_ONSITE_PHYSICAL_LABEL,
  MEASUREMENT_ONSITE_STAFF_METHOD_NOTE,
  MEASUREMENT_ONSITE_SUMMARY_CONFIRMED_NOTE,
  MEASUREMENT_ONSITE_SUMMARY_UNCONFIRMED_NOTE,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementOnsiteAcknowledged,
} from "./src/utils/measurementBlueprint";
import {
  createEmptyFutureShippingState,
  FUTURE_PICKUP_ATELIER_PHONE_DISPLAY,
  FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
} from "./src/utils/designStudioFutureShipping";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import {
  FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewMeasurementHeader,
  getFuturePaymentReviewOnsiteWearers,
} from "./src/utils/designStudioFuturePaymentReview";
import type {
  FutureOrderCandidateBuildResult,
  FutureOrderCandidateV1,
} from "./src/utils/futureOrderCandidate";
import { createWearerProfile } from "./src/utils/wearerOrder";
import {
  orderRecordUsesOnsiteMeasurements,
  renderOrderConfirmationEmail,
} from "./src/server/orderConfirmationEmail";
import { projectTailoringMeasurementReadout } from "./src/utils/tailoringMeasurementProjection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const inspection = inspectCustomDetailCatalog([]);
const fabric: Fabric = {
  code: "FAB-HI",
  name: "HiTarget Royal",
  description: "Royal patterned fabric",
  color: "Royal Blue",
  colorHex: "#002397",
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

const buildSelection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: inspection.activeOptions,
  }).selection;

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
        fabricUnits:
          garmentType === "full_length_gown" || garmentType === "agbada"
            ? 2
            : 1,
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
    id: `style-${garmentTypes.join("-")}`,
    name: "Heritage Complete Look",
    description: "A compatible catalog style.",
    gender: "male",
    targetDemographic: "male",
    options: [],
    image: "https://example.invalid/private-safe-fallback.jpg",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits:
        garmentType === "full_length_gown" || garmentType === "agbada"
          ? 2
          : 1,
    })),
  }) as StyleCategory;

const skipWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};

const buildBaseSummaryInput = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"] = ["shirt", "trouser"],
) => {
  const garmentTypeSelection = buildSelection(garmentTypes);
  const fabricAllocationState = makeAllocationState(garmentTypes);
  const fabrics = [fabric];
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics,
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    fabrics,
  );
  assert.equal(materialPricing.status, "resolved");
  const style = makeStyle(garmentTypes);
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: style.id,
    styles: [style],
    garmentTypeSelection,
  });
  const customState: GarmentScopedCustomDetailsStateV1 =
    createEmptyGarmentScopedCustomDetailsState();
  const customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    catalogInspection: inspection,
    existingState: customState,
  });
  const personalizedReconciliation = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const customDetailsCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: customDetailsReconciliation,
    personalizedInputs: personalizedReconciliation,
    showAdditionalClothesCosts: true,
  });
  const customDetailsPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    showAdditionalClothesCosts: true,
  });
  const physicalGarments = getMeasurementPhysicalGarments({
    garmentTypeSelection,
  });
  const measurementPlan = planMeasurementRequirements({
    route: "onsite_physical",
    garmentTypeSelection,
    physicalGarments,
    garmentScopedCustomDetails: customDetailsReconciliation.state,
  });
  let measurementState = createEmptyFutureMeasurementState(
    "onsite_physical",
    "cm",
  );
  measurementState = setFutureMeasurementOnsiteAcknowledged(
    measurementState,
    true,
  );
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const basePricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing,
    decorativeFeatureApplicabilityStyle: style,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      garmentTypeSelection,
    ),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection,
  });
  return {
    step1GarmentTypeSelection: garmentTypeSelection,
    garmentTypeSelection,
    designSourceKind: "catalogue" as const,
    uploadedCompositionSpecs: null,
    additionalGarmentConstructionState: null,
    pendingAdditionalGarment: null,
    catalogInspection: inspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    designStyleOccurrences: garmentTypes.map((garmentType) => ({
      target: {
        garmentKey: `base:${garmentType}`,
        occurrenceToken: `base:${garmentType}#1`,
      },
      garmentType,
      label: garmentType[0].toUpperCase() + garmentType.slice(1),
      status: "complete" as const,
      assignment: {
        garmentKey: `base:${garmentType}`,
        occurrenceToken: `base:${garmentType}#1`,
        assignmentRevision: 1,
        sourceKind: "catalog" as const,
        sourceKey: `catalog-style:${style.id}`,
        catalogStyleId: style.id,
        eligibilityFingerprint: "fixture-eligible",
      },
      assignmentLabel: style.name,
    })),
    styles: [style],
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation.state,
    aiTryOnWorkflow: skipWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
    physicalGarments,
  };
};

// ============================================================================
// 1. Step 8 Summary — Sole Wearer (acknowledged & unacknowledged)
// ============================================================================
{
  const base = buildBaseSummaryInput(["shirt"]);

  // 1a. Sole wearer acknowledged
  const ackSummary = projectFutureDesignStudioSummary(base);
  assert.equal(ackSummary.status, "ready");
  assert.equal(ackSummary.measurementSummary.route, "onsite_physical");
  assert.equal(ackSummary.measurementSummary.routeLabel, MEASUREMENT_ONSITE_PHYSICAL_LABEL);
  assert.equal(ackSummary.measurementSummary.onsiteBookingAcknowledged, true);

  let editedMeasurements = 0;
  const ackHtml = renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary: ackSummary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {
        editedMeasurements += 1;
      },
      canContinueToShipping: true,
      onContinueToShipping: () => {},
    }),
  );

  assert.match(ackHtml, /Onsite Physical Measurements/);
  assert.match(ackHtml, /data-summary-measurement-onsite-info="true"/);
  assert.match(ackHtml, /data-summary-measurement-onsite-acknowledged="true"/);
  assert.ok(ackHtml.includes(MEASUREMENT_ONSITE_BOOKING_INSTRUCTION));
  assert.ok(ackHtml.includes(MEASUREMENT_ONSITE_BOOKING_REASON));
  assert.ok(ackHtml.includes(MEASUREMENT_ONSITE_SUMMARY_CONFIRMED_NOTE));
  assert.ok(ackHtml.includes(FUTURE_PICKUP_ATELIER_WHATSAPP_URL));
  assert.ok(ackHtml.includes(FUTURE_PICKUP_ATELIER_PHONE_DISPLAY));
  assert.doesNotMatch(ackHtml, /0 measurements entered/i);

  // Verify Edit button on the onsite card triggers onEditMeasurements
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureSummaryStep, {
        summary: ackSummary,
        onBack: () => {},
        onEditGarments: () => {},
        onEditFabrics: () => {},
        onEditDesignStyle: () => {},
        onEditCustomDetails: () => {},
        onEditAiTryOn: () => {},
        onEditMeasurements: () => {
          editedMeasurements += 1;
        },
        canContinueToShipping: true,
        onContinueToShipping: () => {},
      }),
    );
  });
  const onsiteEditBtn = renderer.root.find(
    (node) =>
      node.type === "button" &&
      node.props["data-summary-measurement-onsite-edit"] === "true",
  );
  act(() => {
    onsiteEditBtn.props.onClick();
  });
  assert.equal(editedMeasurements, 1);

  // 1b. Sole wearer unacknowledged
  let unackMeasurementState = setFutureMeasurementOnsiteAcknowledged(
    base.measurementState,
    false,
  );
  unackMeasurementState = reconcileFutureMeasurementState({
    state: unackMeasurementState,
    plan: base.measurementPlan,
  });
  const unackSummary = projectFutureDesignStudioSummary({
    ...base,
    measurementState: unackMeasurementState,
  });
  assert.equal(unackSummary.status, "incomplete");
  assert.equal(unackSummary.measurementSummary.onsiteBookingAcknowledged, false);
  assert.ok(
    unackSummary.blockers.some(
      (b) =>
        b.code === "MEASUREMENT_INCOMPLETE" &&
        b.message === MEASUREMENT_ONSITE_ACKNOWLEDGEMENT_REQUIRED_MESSAGE,
    ),
  );
  const unackHtml = renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary: unackSummary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: false,
      onContinueToShipping: () => {},
    }),
  );
  assert.match(unackHtml, /data-summary-measurement-onsite-acknowledged="false"/);
  assert.ok(unackHtml.includes(MEASUREMENT_ONSITE_SUMMARY_UNCONFIRMED_NOTE));
  assert.doesNotMatch(unackHtml, /0 measurements entered/i);
}

// ============================================================================
// 2. Step 8 Summary — Mixed Multi-Wearer (Wearer 1 = onsite, Wearer 2 = low_risk)
// ============================================================================
{
  const base = buildBaseSummaryInput(["shirt", "trouser"]);
  const shirtGarment = base.physicalGarments.filter(
    (g) => g.garmentKey === "base:shirt",
  );
  const trouserGarment = base.physicalGarments.filter(
    (g) => g.garmentKey === "base:trouser",
  );

  // Wearer 1: onsite_physical + acknowledged for base:shirt
  const plan1 = planMeasurementRequirements({
    route: "onsite_physical",
    garmentTypeSelection: base.garmentTypeSelection,
    physicalGarments: shirtGarment,
    garmentScopedCustomDetails: base.customDetailsReconciliation.state,
  });
  let m1 = createEmptyFutureMeasurementState("onsite_physical", "cm");
  m1 = setFutureMeasurementOnsiteAcknowledged(m1, true);
  m1 = reconcileFutureMeasurementState({ state: m1, plan: plan1 });

  // Wearer 2: low_risk complete for base:trouser
  const plan2 = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: base.garmentTypeSelection,
    physicalGarments: trouserGarment,
    garmentScopedCustomDetails: base.customDetailsReconciliation.state,
  });
  let m2 = createEmptyFutureMeasurementState("low_risk", "inch");
  for (const req of plan2.requirements.filter((r) => r.directInput)) {
    m2 = setFutureMeasurementInput({
      state: m2,
      requirement: req,
      displayValue: req.measurementId === "total_height" ? 70 : 34,
    });
  }
  m2 = reconcileFutureMeasurementState({ state: m2, plan: plan2 });
  assert.equal(m2.calculationStatus, "complete");

  const wearerOrder: WearerOrderStateV2 = {
    schemaVersion: 2,
    assignmentByGarmentKey: {
      "base:shirt": "wearer-1",
      "base:trouser": "wearer-2",
    },
    wearers: [
      {
        ...createWearerProfile({
          wearerId: "wearer-1",
          displayName: "Chidi",
          presentationOrder: 1,
        }),
        measurement: m1,
      },
      {
        ...createWearerProfile({
          wearerId: "wearer-2",
          displayName: "Emeka",
          presentationOrder: 2,
        }),
        measurement: m2,
      },
    ],
  };

  const mixedSummary = projectFutureDesignStudioSummary({
    ...base,
    wearerOrder,
    wearerRuntimes: [
      {
        wearerId: "wearer-1",
        displayName: "Chidi",
        fitContext: "male",
        garmentKeys: ["base:shirt"],
        plan: plan1,
        measurement: m1,
      },
      {
        wearerId: "wearer-2",
        displayName: "Emeka",
        fitContext: "male",
        garmentKeys: ["base:trouser"],
        plan: plan2,
        measurement: m2,
      },
    ],
  });
  assert.equal(mixedSummary.status, "ready");
  assert.equal(mixedSummary.measurementSummary.wearerGroups?.length, 2);
  assert.equal(
    mixedSummary.measurementSummary.wearerGroups?.[0].onsiteBookingAcknowledged,
    true,
  );

  const mixedHtml = renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary: mixedSummary,
      onBack: () => {},
      onEditGarments: () => {},
      onEditFabrics: () => {},
      onEditDesignStyle: () => {},
      onEditCustomDetails: () => {},
      onEditAiTryOn: () => {},
      onEditMeasurements: () => {},
      canContinueToShipping: true,
      onContinueToShipping: () => {},
    }),
  );

  // Wearer 1 shows onsite booking info card
  assert.match(mixedHtml, /Chidi/);
  assert.match(mixedHtml, /data-summary-measurement-onsite-info="true"/);
  assert.ok(mixedHtml.includes(FUTURE_PICKUP_ATELIER_WHATSAPP_URL));
  // Wearer 2 shows dual-unit measurement pills untouched
  assert.match(mixedHtml, /Emeka/);
  assert.match(mixedHtml, /data-measurement-pill/);
  assert.doesNotMatch(mixedHtml, /0 measurements entered/i);
}

// ============================================================================
// 3. Live Order Summary Sidebar — Sole & Multi-Wearer Onsite
// ============================================================================
{
  const base = buildBaseSummaryInput(["shirt"]);

  // 3a. Sole wearer complete
  const liveComplete = projectDesignStudioLiveOrderSummary({
    summary: projectFutureDesignStudioSummary(base),
    shippingResolution: null,
    candidatePricing: null,
    fabricAllocationState: base.fabricAllocationState,
    measurementState: base.measurementState,
    measurementPlan: base.measurementPlan,
    designSource: null,
  });
  const mSectionComplete = liveComplete.sections.find(
    (s) => s.id === "measurements",
  );
  assert.ok(mSectionComplete);
  assert.equal(mSectionComplete.editStage, "measurement");
  assert.ok(
    mSectionComplete.lines.some(
      (l) =>
        l.label === `${MEASUREMENT_ONSITE_PHYSICAL_LABEL} — Complete` &&
        l.detail === MEASUREMENT_ONSITE_LIVE_SUMMARY_COMPLETE_DETAIL,
    ),
  );
  assert.ok(
    !mSectionComplete.lines.some((l) =>
      /Not selected|0 of|0 required measurements remaining/i.test(
        `${l.label} ${l.detail ?? ""}`,
      ),
    ),
  );

  // 3b. Sole wearer incomplete (unacknowledged)
  let unack = setFutureMeasurementOnsiteAcknowledged(
    base.measurementState,
    false,
  );
  unack = reconcileFutureMeasurementState({
    state: unack,
    plan: base.measurementPlan,
  });
  const liveIncomplete = projectDesignStudioLiveOrderSummary({
    summary: projectFutureDesignStudioSummary({
      ...base,
      measurementState: unack,
    }),
    shippingResolution: null,
    candidatePricing: null,
    fabricAllocationState: base.fabricAllocationState,
    measurementState: unack,
    measurementPlan: base.measurementPlan,
    designSource: null,
  });
  const mSectionIncomplete = liveIncomplete.sections.find(
    (s) => s.id === "measurements",
  );
  assert.ok(mSectionIncomplete);
  assert.equal(mSectionIncomplete.editStage, "measurement");
  assert.ok(
    mSectionIncomplete.lines.some(
      (l) =>
        l.label === `${MEASUREMENT_ONSITE_PHYSICAL_LABEL} — Incomplete` &&
        l.detail === MEASUREMENT_ONSITE_LIVE_SUMMARY_INCOMPLETE_DETAIL,
    ),
  );
}

// ============================================================================
// 4. Step 10 Payment Review & Confirmation Email
// ============================================================================
{
  const base = buildBaseSummaryInput(["shirt"]);
  const onsiteState = base.measurementState;

  const shippingState = {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "eindhoven_pickup" as const,
    pickupLocation: "atelier_eindhoven",
    customerInformation: {
      fullName: "Ada Heritage",
      phone: "+31 6 1234 5678",
      email: "ada@example.com",
      deliveryAddress: {
        addressLine1: "",
        addressLine2: "",
        city: "",
        postalCode: "",
        countryCode: "NL",
      },
      comment: "",
    },
  };

  const onsiteCandidate: FutureOrderCandidateV1 = {
    schemaVersion: 1,
    journey: { mode: "future_nine_stage", schemaVersion: 1 },
    authorityVersions: {
      customDetailsSchemaVersion: 1,
      measurementSchemaVersion: 1,
      measurementBlueprintVersion: "measurement-blueprint-v1",
      measurementFormulaVersion: "low-risk-formula-v1",
      shippingSchemaVersion: 1,
      shippingTariffVersion: "future-shipping-v1",
      shippingRuleFingerprint: "safe-rule-fingerprint",
      shippingInputFingerprint: "safe-input-fingerprint",
    },
    source: {
      kind: "catalog",
      sourceKey: "catalog:heritage-complete",
      styleId: "heritage-complete",
    },
    design: {
      styleId: "heritage-complete",
      name: "Heritage Complete Look",
      image: null,
      demographic: "male",
      compositionLabel: "Shirt",
      resolutionStatus: "selected",
      compatibilityStatus: "compatible",
      compatibilityCode: "STYLE_COMPATIBLE",
      compatibilityMessage: "This style matches the selected garments.",
    },
    garments: [
      {
        garmentKey: "base:shirt",
        garmentType: "shirt",
        label: "Standard Shirt",
        role: "main",
        demographic: "male",
        fabricUnits: 1,
        physicalComponents: [
          { garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt" },
        ],
        construction: [
          {
            componentKey: "shirt_construction",
            selectionGroup: "shirt_construction",
            optionId: "shirt-standard-short",
            label: "Standard Length Shirt, Short Sleeve",
            priceCents: 10000,
          },
        ],
        constructionTotalCents: 10000,
      },
    ],
    fabricAllocations: [
      {
        allocationId: "allocation-1",
        fabricId: "fabric-hi",
        fabricCode: "FAB-HI",
        fabricName: "HiTarget Royal",
        availability: "available",
        capacityUnits: 1,
        materialPriceCents: 1000,
        pricingTreatment: "included_in_garment_construction",
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
          },
        ],
      },
    ],
    customDetails: [],
    aiTryOn: {
      status: "skipped",
      reviewStatus: "skipped",
      verifiedPrivateResultReference: null,
    },
    measurements: onsiteState,
    shipping: {
      state: shippingState,
      status: "quote_ready",
      customerInformationComplete: true,
      formInputsComplete: true,
      formComplete: true,
      quoteReady: true,
      quoteRequired: false,
      destinationLabel: "Pick Up in Eindhoven",
      parcelWeightKg: 1,
      weightTier: "0_2",
      additionalDeliveryFeeCents: 0,
      rateVersion: "step8-delivery-v1",
    },
    pricing: {
      schemaVersion: 2,
      model: "all_inclusive_garment_construction",
      status: "exact",
      garmentConstructionSubtotalCents: 10000,
      customDetailsCents: 0,
      selectedDesignTotalCents: 10000,
      postEindhovenAdjustmentCents: 0,
      exactTotalCents: 10000,
      components: {
        fabric: { status: "included_in_garment_construction", amountCents: null },
        sewing: { status: "included_in_garment_construction", amountCents: null },
        tax: { status: "included_in_garment_construction", amountCents: null },
        lagosToEindhovenShipping: {
          status: "included_in_garment_construction",
          amountCents: null,
        },
        customDetails: { status: "separately_charged", amountCents: 0 },
        postEindhovenDelivery: {
          status: "included_in_garment_construction",
          amountCents: 0,
        },
      },
    },
    contentStatus: "reviewable",
    paymentStatus: "payment_provider_unavailable",
    blockers: [
      {
        code: "PAYMENT_PROVIDER_UNAVAILABLE",
        stage: "payment",
        message: FUTURE_PAYMENT_UNAVAILABLE_MESSAGE,
      },
    ],
  };

  const header = getFuturePaymentReviewMeasurementHeader(onsiteCandidate.measurements);
  assert.equal(header.kind, "single");
  if (header.kind === "single") {
    assert.equal(header.routeLabel, MEASUREMENT_ONSITE_PHYSICAL_LABEL);
    assert.equal(header.statusLabel, "complete");
  }
  const onsiteWearers = getFuturePaymentReviewOnsiteWearers(onsiteCandidate);
  assert.equal(onsiteWearers.length, 1);
  assert.deepEqual(onsiteWearers[0].assignedGarmentLabels, ["Standard Shirt"]);
  assert.equal(getFuturePaymentReviewMeasurementGroups(onsiteCandidate).length, 0);

  const reviewResult: FutureOrderCandidateBuildResult = {
    status: "reviewable",
    paymentStatus: "payment_provider_unavailable",
    candidate: onsiteCandidate,
    blockers: onsiteCandidate.blockers,
  };

  const paymentReviewHtml = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      result: reviewResult,
      onBack: () => {},
      onEditStage: () => {},
    }),
  );

  assert.match(paymentReviewHtml, /Onsite Physical Measurements/);
  assert.doesNotMatch(paymentReviewHtml, /onsite_physical/i);
  assert.doesNotMatch(paymentReviewHtml, /Onsite Physical Measurements route/);
  assert.doesNotMatch(paymentReviewHtml, /Measurement values are pending\./);
  assert.match(paymentReviewHtml, /data-payment-review-measurement-onsite-info="true"/);
  assert.match(paymentReviewHtml, /Covered garments: Standard Shirt/);
  assert.ok(paymentReviewHtml.includes(MEASUREMENT_ONSITE_BOOKING_INSTRUCTION));
  assert.ok(paymentReviewHtml.includes(FUTURE_PICKUP_ATELIER_WHATSAPP_URL));
  assert.ok(paymentReviewHtml.includes(FUTURE_PICKUP_ATELIER_PHONE_DISPLAY));

  // Confirmation Email tests
  assert.equal(hasOnsitePhysicalMeasurements(onsiteCandidate.measurements), true);
  assert.equal(
    orderRecordUsesOnsiteMeasurements({
      masterOrder: { cartItem: { candidate: onsiteCandidate } },
    }),
    true,
  );
  const emailRendered = renderOrderConfirmationEmail({
    brandName: "The Odogwu Heritage",
    siteUrl: "https://theodogwuheritage.com",
    orderId: "ord_onsite_1",
    name: "Ada Heritage",
    hasAiPreview: false,
    hasOnsiteMeasurements: true,
  });
  assert.match(emailRendered.html, /Onsite Physical Measurements/);
  assert.ok(emailRendered.html.includes(MEASUREMENT_ONSITE_BOOKING_INSTRUCTION));
  assert.ok(emailRendered.html.includes(FUTURE_PICKUP_ATELIER_WHATSAPP_URL));
  assert.doesNotMatch(emailRendered.html, /onsite_physical/);
}

// ============================================================================
// 5. Admin / Staff Tailoring Readout & Production Manifest/CSV
// ============================================================================
{
  const base = buildBaseSummaryInput(["shirt"]);
  const onsiteState = base.measurementState;

  const readout = projectTailoringMeasurementReadout(
    onsiteState,
    {
      "base:shirt": "shirt",
      "base:kaftan": "kaftan",
    },
  );
  assert.ok(readout);
  assert.equal(readout.length, 1);
  assert.equal(readout[0].methodLabel, MEASUREMENT_ONSITE_PHYSICAL_LABEL);
  assert.equal(readout[0].methodNote, MEASUREMENT_ONSITE_STAFF_METHOD_NOTE);
  assert.equal(readout[0].shared.length, 0);
  assert.deepEqual(
    readout[0].garments.map((g) => g.label),
    ["Long Shirt", "Standard Shirt"],
  );
  assert.ok(!readout[0].garments.some((g) => /kaftan/i.test(g.label)));
}

console.log("test_summary_onsite_measurement_display passed");
