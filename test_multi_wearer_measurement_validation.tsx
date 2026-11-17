import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "./src/types";
import {
  createFutureOrderV2PaymentReviewHandoff,
  getFuturePaymentReviewWearerMeasurementSections,
} from "./src/utils/designStudioFuturePaymentReview";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import {
  createWearerProfile,
  isWearerOrderMeasurementComplete,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  updateWearerMeasurement,
} from "./src/utils/wearerOrder";
import { getFutureOrderV2CartLineLabel } from "./src/utils/futureOrderV2CartBag";
import { presentFutureOrderV2History } from "./src/utils/futureOrderV2History";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import {
  formatCustomDetailsGarmentLabel,
  formatCustomerVisibleKaftanText,
} from "./src/utils/optionalShortsPresentation";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
      optionId,
      selectionGroup,
      priceCents: 1000,
      price: 10,
    },
  ],
  totalPriceCents: 1000,
  totalPrice: 10,
});

const twoWearerSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "kaftan"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    kaftan: construction("kaftan", "shirt_long_short", "shirt_construction"),
  },
};

const physicalGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:kaftan", garmentType: "kaftan" as const },
];

const fillAllRequired = (
  plan: ReturnType<typeof planMeasurementRequirements>,
  baseValue = 80,
): FutureMeasurementStateV1 => {
  let state = setFutureMeasurementRoute(createEmptyFutureMeasurementState("low_risk", "cm"), "low_risk");
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    state = setFutureMeasurementInput({
      state,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 175 : baseValue,
    });
  }
  return reconcileFutureMeasurementState({ state, plan });
};

const primaryPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: twoWearerSelection,
  physicalGarments: [physicalGarments[0]!],
});
const secondaryPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: twoWearerSelection,
  physicalGarments: [physicalGarments[1]!],
});

const primaryComplete = fillAllRequired(primaryPlan, 82);
const secondaryComplete = fillAllRequired(secondaryPlan, 88);
const secondaryIncomplete = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(createEmptyFutureMeasurementState("low_risk", "cm"), "low_risk"),
  plan: secondaryPlan,
});
const primaryIncomplete = reconcileFutureMeasurementState({
  state: setFutureMeasurementRoute(createEmptyFutureMeasurementState("low_risk", "cm"), "low_risk"),
  plan: primaryPlan,
});

const primaryWearer = createWearerProfile({
  wearerId: "wearer-1",
  displayName: "Chidi",
  fitContext: "male",
  presentationOrder: 0,
  measurement: primaryComplete,
});
const secondaryWearer = createWearerProfile({
  wearerId: "wearer-2",
  displayName: "Ada",
  fitContext: "male",
  presentationOrder: 1,
  measurement: secondaryIncomplete,
});

const multiOrderIncompleteSecondary: WearerOrderStateV2 = {
  schemaVersion: 2,
  wearers: [primaryWearer, secondaryWearer],
  assignmentByGarmentKey: {
    "base:shirt": primaryWearer.wearerId,
    "base:kaftan": secondaryWearer.wearerId,
  },
};

const findContinueButtons = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType("button")
    .filter((node) => node.props["aria-label"] === "Continue to AI Try-on");

// 1. Primary wearer complete, secondary wearer incomplete -> Continue remains locked.
{
  const runtimes = planWearerOrderMeasurements({
    order: multiOrderIncompleteSecondary,
    garmentTypeSelection: twoWearerSelection,
    physicalGarments,
  });
  const complete = isWearerOrderMeasurementComplete({
    order: multiOrderIncompleteSecondary,
    runtimes,
    physicalGarmentKeys: physicalGarments.map((garment) => garment.garmentKey),
  });
  assert.equal(complete, false);

  let continueCalls = 0;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: primaryPlan,
        state: primaryComplete,
        physicalGarments: [physicalGarments[0]!],
        orderMeasurementsComplete: complete,
        otherWearerIncompleteLabels: ["Ada"],
        multiPersonAssignmentActive: true,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => {
          continueCalls += 1;
        },
      }),
    );
  });
  const buttons = findContinueButtons(renderer);
  assert.equal(buttons.length, 2);
  for (const button of buttons) {
    assert.equal(button.props["aria-disabled"], "true");
    act(() => {
      button.props.onClick?.();
    });
  }
  assert.equal(continueCalls, 0, "clicking locked Continue must not progress");
  act(() => renderer.unmount());
}

// 2. Even if orderMeasurementsComplete were stale/true, active wearer incomplete or other wearer incomplete still locks Continue.
{
  let continueCalls = 0;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: secondaryPlan,
        state: secondaryIncomplete,
        physicalGarments: [physicalGarments[1]!],
        orderMeasurementsComplete: true,
        multiPersonAssignmentActive: true,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => {
          continueCalls += 1;
        },
      }),
    );
  });
  for (const button of findContinueButtons(renderer)) {
    assert.equal(button.props["aria-disabled"], "true");
    act(() => {
      button.props.onClick?.();
    });
  }
  assert.equal(continueCalls, 0);
  act(() => renderer.unmount());
}

// 3. Primary wearer incomplete while secondary wearer complete -> locked.
{
  const orderPrimaryIncomplete = updateWearerMeasurement(
    updateWearerMeasurement(multiOrderIncompleteSecondary, primaryWearer.wearerId, primaryIncomplete),
    secondaryWearer.wearerId,
    secondaryComplete,
  );
  const runtimes = planWearerOrderMeasurements({
    order: orderPrimaryIncomplete,
    garmentTypeSelection: twoWearerSelection,
    physicalGarments,
  });
  assert.equal(
    isWearerOrderMeasurementComplete({
      order: orderPrimaryIncomplete,
      runtimes,
      physicalGarmentKeys: physicalGarments.map((garment) => garment.garmentKey),
    }),
    false,
  );
}

// 4. Empty wearer / unassigned garment -> locked even with complete active bag.
{
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: primaryPlan,
        state: primaryComplete,
        physicalGarments,
        unassignedGarments: [physicalGarments[1]!],
        emptyWearerLabels: ["Ada"],
        multiPersonAssignmentActive: true,
        orderMeasurementsComplete: true,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  for (const button of findContinueButtons(renderer)) {
    assert.equal(button.props["aria-disabled"], "true");
  }
  act(() => renderer.unmount());
}

// 5. All wearers complete -> Continue unlocks and invokes onContinue.
const multiOrderComplete = updateWearerMeasurement(
  multiOrderIncompleteSecondary,
  secondaryWearer.wearerId,
  secondaryComplete,
);
{
  const runtimes = planWearerOrderMeasurements({
    order: multiOrderComplete,
    garmentTypeSelection: twoWearerSelection,
    physicalGarments,
  });
  const complete = isWearerOrderMeasurementComplete({
    order: multiOrderComplete,
    runtimes,
    physicalGarmentKeys: physicalGarments.map((garment) => garment.garmentKey),
  });
  assert.equal(complete, true);

  let continueCalls = 0;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: primaryPlan,
        state: primaryComplete,
        physicalGarments: [physicalGarments[0]!],
        orderMeasurementsComplete: complete,
        otherWearerIncompleteLabels: [],
        emptyWearerLabels: [],
        multiPersonAssignmentActive: true,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => {
          continueCalls += 1;
        },
      }),
    );
  });
  const buttons = findContinueButtons(renderer);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0]?.props.disabled, false);
  act(() => {
    buttons[0]?.props.onClick?.();
  });
  assert.equal(continueCalls, 1);
  act(() => renderer.unmount());
}

// 6. Stage progression & DesignStudioView guards prevent bypassing Measurement when measurements become incomplete.
for (const blockedStage of ["try_on", "summary", "shipping", "payment"] as const) {
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: blockedStage,
      garmentTypeComplete: true,
      fabricComplete: true,
      designSourceReady: true,
      customDetailsReady: true,
      personalizedAdditionsReady: true,
      tryOnFinishedForSummary: true,
      tryOnUnlockedByMeasurements: false,
      inlineAdditionalGarmentFabricTransaction: null,
    }),
    "measurement",
    `${blockedStage} must bounce back to measurement when any wearer is incomplete`,
  );
}

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(
  studioSource,
  /effectiveHighestUnlockedStageIndex\s*=\s*tryOnUnlockedByMeasurements/,
);
assert.match(
  studioSource,
  /const handleOpenDormantAiTryOnStage = \(\) => \{\s*if \(!tryOnUnlockedByMeasurements\)/,
);
assert.match(
  studioSource,
  /const handleOpenDormantSummaryStage = \(\) => \{\s*if \(!tryOnUnlockedByMeasurements\)/,
);
assert.match(
  studioSource,
  /const handleOpenDormantShippingStage = \(\) => \{\s*if \(!tryOnUnlockedByMeasurements\)/,
);
assert.match(
  studioSource,
  /const handleOpenDormantPaymentReviewStage = \(\) => \{\s*if \(!tryOnUnlockedByMeasurements\)/,
);

// 7. Summary projection & Summary step display each wearer's measurements alongside assigned garments (and Long Shirt wording).
{
  const unreadyOrder = reconcileWearerOrder({
    order: {
      schemaVersion: 2,
      wearers: [primaryWearer, { ...secondaryWearer, measurement: secondaryComplete }],
      assignmentByGarmentKey: {
        "base:shirt": primaryWearer.wearerId,
      },
    },
    garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "male",
    garments: physicalGarments,
    garmentTypeSelection: twoWearerSelection,
  });
  const unreadyRuntimes = planWearerOrderMeasurements({
    order: unreadyOrder,
    garmentTypeSelection: twoWearerSelection,
    physicalGarments,
  });
  const unreadySummary = projectFutureDesignStudioSummary({
    step1GarmentTypeSelection: twoWearerSelection,
    garmentTypeSelection: twoWearerSelection,
    designSourceKind: "catalogue",
    catalogInspection: { byOptionId: new Map(), groups: [] } as never,
    fabricAllocationState: { fabricAllocations: [], pendingFabricGarment: null } as never,
    fabricCompletion: { isComplete: true, blockers: [] } as never,
    materialPricing: null,
    designStyleSelection: { selectedStyle: null } as never,
    customDetailsReconciliation: { state: { schemaVersion: 1, byGarmentKey: {} }, subjects: [] } as never,
    customDetailsCompletion: { status: "complete", isComplete: true, missingGarments: [], invalidSelections: [] } as never,
    customDetailsPricing: { status: "exact", exactSubtotalCents: 0, lines: [] } as never,
    personalizedInputs: null,
    designSelections: { accessories: [] },
    aiTryOnWorkflow: { status: "skipped", triesUsed: 0 } as never,
    measurementPlan: primaryPlan,
    measurementState: primaryComplete,
    wearerOrder: unreadyOrder,
    wearerRuntimes: unreadyRuntimes,
    basePricing: null,
  });
  assert.equal(
    unreadySummary.blockers.some((blocker) => blocker.code === "MEASUREMENT_INCOMPLETE"),
    true,
    "summary must block when a registered wearer has no assigned garments",
  );

  const completeRuntimes = planWearerOrderMeasurements({
    order: multiOrderComplete,
    garmentTypeSelection: twoWearerSelection,
    physicalGarments,
  });
  const completeSummary = projectFutureDesignStudioSummary({
    step1GarmentTypeSelection: twoWearerSelection,
    garmentTypeSelection: twoWearerSelection,
    designSourceKind: "catalogue",
    catalogInspection: { byOptionId: new Map(), groups: [] } as never,
    fabricAllocationState: { fabricAllocations: [], pendingFabricGarment: null } as never,
    fabricCompletion: { isComplete: true, blockers: [] } as never,
    materialPricing: null,
    designStyleSelection: { selectedStyle: null } as never,
    customDetailsReconciliation: { state: { schemaVersion: 1, byGarmentKey: {} }, subjects: [] } as never,
    customDetailsCompletion: { status: "complete", isComplete: true, missingGarments: [], invalidSelections: [] } as never,
    customDetailsPricing: { status: "exact", exactSubtotalCents: 0, lines: [] } as never,
    personalizedInputs: null,
    designSelections: { accessories: [] },
    aiTryOnWorkflow: { status: "skipped", triesUsed: 0 } as never,
    measurementPlan: primaryPlan,
    measurementState: primaryComplete,
    wearerOrder: multiOrderComplete,
    wearerRuntimes: completeRuntimes,
    basePricing: null,
  });

  const summaryMarkup = renderToStaticMarkup(
    createElement(DormantFutureSummaryStep, {
      summary: completeSummary,
      onBack: () => undefined,
      onEditGarments: () => undefined,
      onEditFabrics: () => undefined,
      onEditDesignStyle: () => undefined,
      onEditCustomDetails: () => undefined,
      onEditAiTryOn: () => undefined,
      onEditMeasurements: () => undefined,
      canContinueToShipping: false,
      onContinueToShipping: () => undefined,
    }),
  );
  assert.ok(summaryMarkup.includes('data-summary-measurement-wearer="wearer-1"'));
  assert.ok(summaryMarkup.includes('data-summary-measurement-wearer="wearer-2"'));
  assert.ok(summaryMarkup.includes("Chidi"));
  assert.ok(summaryMarkup.includes("Ada"));
  assert.ok(summaryMarkup.includes("Standard Shirt"));
  assert.ok(summaryMarkup.includes("Long Shirt"));
  const summaryText = summaryMarkup.replace(/<[^>]+>/g, " ");
  assert.equal(/kaftan/i.test(summaryText), false, "Customer summary must never show Kaftan");
}

// 8. Payment Review displays separate wearer measurement sections alongside assigned garments
// and normalizes any legacy/raw Kaftan labels or style names to Long Shirt.
{
  const fixture = createFutureOrderV2Fixture("multi-wearer-review");
  const baseCandidate = fixture.cartItem.candidate;
  const twoWearerCandidate = {
    ...baseCandidate,
    garments: [
      {
        ...baseCandidate.garments[0]!,
        garmentKey: "base:shirt",
        garmentType: "shirt" as const,
        label: "Standard Shirt",
      },
      {
        ...baseCandidate.garments[1]!,
        garmentKey: "base:kaftan",
        garmentType: "kaftan" as const,
        label: "Long Shirt",
      },
    ],
    occurrenceStyleSnapshots: [
      {
        ...baseCandidate.occurrenceStyleSnapshots[0]!,
        occurrence: {
          garmentKey: "base:shirt",
          occurrenceToken: "token-shirt-1",
          label: "Shirt",
          garmentType: "shirt",
        },
      },
      {
        ...baseCandidate.occurrenceStyleSnapshots[0]!,
        occurrence: {
          garmentKey: "base:kaftan",
          occurrenceToken: "token-kaftan-1",
          label: "Kaftan",
          garmentType: "kaftan",
        },
        catalogue: {
          ...baseCandidate.occurrenceStyleSnapshots[0]!.catalogue!,
          name: "Royal Kaftan",
        },
      },
    ],
    measurements: multiOrderComplete,
  };
  const sections = getFuturePaymentReviewWearerMeasurementSections(twoWearerCandidate, {
    plainPersonGarmentLabels: true,
  });
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0]?.assignedGarmentLabels, ["Standard Shirt"]);
  assert.deepEqual(sections[1]?.assignedGarmentLabels, ["Long Shirt"]);

  const handoff = createFutureOrderV2PaymentReviewHandoff(twoWearerCandidate, {
    status: "prepared",
    cartItemId: "cart-multi-wearer",
    orderId: "order-multi-wearer",
  });
  const reviewMarkup = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      result: handoff,
      onBack: () => undefined,
      onEditStage: () => undefined,
    }),
  );
  assert.ok(reviewMarkup.includes('data-payment-review-measurement-wearer="wearer-1"'));
  assert.ok(reviewMarkup.includes('data-payment-review-measurement-wearer="wearer-2"'));
  assert.ok(reviewMarkup.includes('data-payment-review-measurement-wearer-garments="wearer-1"'));
  assert.ok(reviewMarkup.includes('data-payment-review-measurement-wearer-garments="wearer-2"'));
  assert.ok(reviewMarkup.includes("Garments: Standard Shirt"));
  assert.ok(reviewMarkup.includes("Garments: Long Shirt"));
  assert.ok(reviewMarkup.includes("Royal Long Shirt"));
  const reviewText = reviewMarkup.replace(/<[^>]+>/g, " ");
  assert.equal(/kaftan/i.test(reviewText), false, "Payment review must never show Kaftan");

  assert.equal(formatCustomDetailsGarmentLabel("Kaftan"), "Long Shirt");
  assert.equal(formatCustomDetailsGarmentLabel("Kaftan 2"), "Long Shirt 2");
  assert.equal(formatCustomerVisibleKaftanText("Executive Kaftan"), "Executive Long Shirt");
  const cartLabel = getFutureOrderV2CartLineLabel({
    ...fixture.cartItem,
    candidate: twoWearerCandidate as never,
  });
  assert.equal(/kaftan/i.test(cartLabel), false, "Cart line label must never show Kaftan");
  assert.ok(cartLabel.includes("Long Shirt"));

  const persistedResult = createPersistedFutureOrderV2({
    masterOrder: {
      ...fixture,
      cartItem: {
        ...fixture.cartItem,
        candidate: twoWearerCandidate as never,
      },
    },
    owner: { uid: "test-owner", isAnonymous: false },
    customerOwnerUid: "test-owner",
    persistedAt: "2026-11-17T10:00:00.000Z",
  });
  assert.equal(persistedResult.status, "valid");
  const historyResult =
    persistedResult.status === "valid"
      ? presentFutureOrderV2History(persistedResult.value)
      : ({ status: "not_v2" } as const);
  assert.equal(historyResult.status, "valid");
  if (historyResult.status === "valid") {
    const kaftanOccurrence = historyResult.value.occurrences.find(
      (occurrence) => occurrence.garmentKey === "base:kaftan",
    );
    assert.equal(kaftanOccurrence?.garmentLabel, "Long Shirt");
    assert.equal(
      kaftanOccurrence?.style.kind === "catalogue" ? kaftanOccurrence.style.name : "",
      "Royal Long Shirt",
    );
  }
}

console.log("PASS: multi-wearer measurement validation & summary/review display");
