import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import type { GarmentTypeStepSelection } from "./src/types";
import {
  createEmptyFutureMeasurementState,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  projectMeasurementRequirementsForPresentation,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const measurementSource = readFileSync("src/components/DormantFutureMeasurementStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DesignStudioJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(studioSource, /futureMeasurementState/);
assert.match(studioSource, /handleOpenDormantMeasurementStage/);
assert.match(studioSource, /futureStageId === "measurement"/);
assert.match(studioSource, /futureMeasurementState,/);
assert.match(studioSource, /resumeLocus/);
assert.match(studioSource, /resolveDesignStudioResumeLocus/);
assert.match(studioSource, /resolveWearerAssignmentPresentation/);
assert.match(studioSource, /wearerPublicLabel/);
assert.match(studioSource, /nextIncompleteWearer/);
assert.match(studioSource, /onGoToWearer/);
assert.match(measurementSource, /Dimension \/ Measurement/);
assert.match(measurementSource, /Enter the complete measurements required for your selected garments\./);
assert.match(measurementSource, /Enter the required measurements\. Optional values are calculated from height where available\./);
assert.match(measurementSource, /Required Measurements/);
assert.match(measurementSource, /Optional Measurements/);
assert.match(measurementSource, /Calculated from height/);
assert.match(
  measurementSource,
  /These values fill in from Total Height after every required measurement for this garment is entered/,
);
assert.match(measurementSource, /data-measurement-calculated-pending/);
assert.match(measurementSource, /Waiting on:/);
assert.match(measurementSource, /Please recheck this measurement\./);
assert.match(measurementSource, /saved/);
assert.match(measurementSource, /Shared Body Measurements/);
assert.match(measurementSource, /Shared body measurements are entered once and used for all applicable garments\./);
assert.match(measurementSource, /Measurement setup pending/);
assert.match(measurementSource, /Assign this garment to a person/);
assert.match(measurementSource, /Assign person/);
assert.match(measurementSource, /projectMeasurementGarmentChipStates/);
assert.match(measurementSource, /data-measurement-garment-chip/);
assert.match(measurementSource, /data-measurement-garment-remaining/);
assert.match(measurementSource, /setAllowPendingChipSelection/);
assert.match(measurementSource, /nextIncompleteGarmentLabel/);
assert.match(measurementSource, /previousSharedRemainingRef/);
assert.match(measurementSource, /data-measurement-go-to-next/);
assert.match(measurementSource, /data-measurement-go-to-wearer/);
assert.match(measurementSource, /Go to \{nextIncompleteGarmentLabel\}/);
assert.match(measurementSource, /Shared left/);
assert.match(measurementSource, /otherWearerIncompleteLabels/);
assert.match(measurementSource, /emptyWearerLabels/);
assert.match(measurementSource, /nextIncompleteWearer/);
assert.match(measurementSource, /onGoToWearer/);
assert.match(measurementSource, /activeWearerLabel/);
assert.match(measurementSource, /activeWearerGarmentLabels/);
assert.doesNotMatch(measurementSource, /wearerSwitchOptions/);
assert.doesNotMatch(measurementSource, /data-measurement-switch-wearer/);
assert.match(measurementSource, /Measuring for/);
assert.match(measurementSource, /data-measurement-active-wearer=\{activeWearerLabel\}/);
assert.match(
  measurementSource,
  /Add measurements for one of \$\{activeWearerLabel\}'s garments at a time/,
);
assert.match(
  measurementSource,
  /awaiting confirmation for the selected\s+profile\. You can continue reviewing measurements for your other garments\./,
);
assert.match(measurementSource, /projectMeasurementStepProgressPresentation/);
assert.match(measurementSource, /unassignedGarments/);
assert.doesNotMatch(measurementSource, /cannot be measured for this profile/);
assert.match(measurementSource, /aria-invalid/);
assert.match(measurementSource, /Enter a positive measurement value\./);
assert.match(measurementSource, /Current route status/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.low_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.medium_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.high_risk/);
assert.match(measurementSource, /MEASUREMENT_RISK_ROUTE_LABELS\.critical_risk/);
assert.match(measurementSource, /Body Measurements/);
assert.match(measurementSource, /data-measurement-option-heading="body"/);
assert.match(measurementSource, /data-measurement-option-subtitle="risk"/);
assert.match(measurementSource, /Measurement by Risk Level/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_LABEL/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION/);
assert.match(measurementSource, /MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE/);
assert.match(measurementSource, /data-measurement-risk-selector/);
assert.match(measurementSource, /data-measurement-sample-selector/);
assert.match(measurementSource, /data-measurement-option-section="risk"/);
assert.match(measurementSource, /data-measurement-option-section="sample_cloth"/);
assert.match(measurementSource, /data-measurement-form=\{selectedMethod\}/);
assert.match(measurementSource, /data-measurement-section/);
assert.match(measurementSource, /MEASUREMENT_RISK_SELECTION_NOTICE/);
assert.match(measurementSource, /aria-describedby="measurement-risk-selection-notice"/);
assert.match(measurementSource, /DesignStudioBackButton/);
assert.match(measurementSource, /backDestination="AI Try-on"/);
assert.match(measurementSource, /Continue to Summary/);
assert.match(measurementSource, /isFutureSummaryUnlockedByMeasurements\(resolvedState\)/);
assert.equal(
  measurementSource.includes("Summary remains locked until Low Risk measurements are complete. Mid and High Risk calculations are still pending."),
  false,
);
assert.equal(measurementSource.includes("Your completed Low Risk measurements are ready for review."), false);
assert.equal(measurementSource.includes("LOW OR NO RISK"), false);
assert.equal(measurementSource.includes("Low / No Risk"), false);
assert.match(measurementSource, /aria-live="polite"/);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /step\.id === "measurement"/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);

console.log("PASS: dormant future Measurement stage integration and production lock");

const shirtConstruction = {
  status: "resolved" as const,
  garmentType: "shirt" as const,
  components: [{
    componentKey: "shirt:shirt_construction:shirt_std_short",
    optionId: "shirt_std_short",
    selectionGroup: "shirt_construction" as const,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
};
const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: { shirt: shirtConstruction },
};
const physicalShirts = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" as const },
];
const headingText = (markup: { children?: unknown } | string | null | undefined): string => {
  if (markup == null || typeof markup === "boolean") return "";
  if (typeof markup === "string" || typeof markup === "number") return String(markup);
  if (typeof markup !== "object") return "";
  const children = Array.isArray(markup.children) ? markup.children : markup.children != null ? [markup.children] : [];
  return children.map((child) => headingText(child as never)).join("");
};
const renderMeasurement = (
  garmentKeys: readonly string[],
) => {
  const state = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
  const plan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts.filter((garment) => garmentKeys.includes(garment.garmentKey)),
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(DormantFutureMeasurementStep, {
      plan,
      state,
      physicalGarments: physicalShirts,
      onChange: () => undefined,
      onRouteChange: () => undefined,
      onBack: () => undefined,
      onContinue: () => undefined,
    }));
  });
  return headingText(renderer.root);
};

const oneShirtText = renderMeasurement(["base:shirt"]);
assert.ok(oneShirtText.includes("Standard Shirt Measurements"));
assert.equal(oneShirtText.includes("Standard Shirt 1"), false);
assert.equal(oneShirtText.includes("Standard Shirt 2"), false);

const bothShirtsText = renderMeasurement(["base:shirt", "additional:shirt:1"]);
assert.ok(bothShirtsText.includes("Standard Shirt"));
assert.ok(bothShirtsText.includes("Standard Shirt 2"));
assert.ok(bothShirtsText.includes("Standard Shirt Measurements"));
assert.equal(bothShirtsText.includes("Standard Shirt 2 Measurements"), false);
assert.equal(bothShirtsText.includes("Standard Shirt 1"), false);
const bothState = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
const bothPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: physicalShirts,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: { "additional:shirt:1": shirtConstruction },
  },
});
let bothRenderer!: ReturnType<typeof create>;
act(() => {
  bothRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: bothPlan,
    state: bothState,
    physicalGarments: physicalShirts,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
act(() => {
  bothRenderer.root.findByProps({ "data-measurement-garment": "additional:shirt:1" }).props.onClick();
});
const secondShirtText = headingText(bothRenderer.root);
assert.ok(secondShirtText.includes("Standard Shirt 2 Measurements"));
assert.equal(secondShirtText.includes("Standard Shirt Measurements"), false);

const adaOnlyText = renderMeasurement(["additional:shirt:1"]);
assert.ok(adaOnlyText.includes("Standard Shirt 2 Measurements"));
assert.equal(adaOnlyText.includes("Standard Shirt Measurements"), false);

const storedPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: physicalShirts,
  additionalGarmentConstructions: {
    schemaVersion: 1,
    byGarmentKey: { "additional:shirt:1": shirtConstruction },
  },
});
const lengthRequirement = storedPlan.requirements.find(
  (requirement) =>
    requirement.garmentKey === "additional:shirt:1" && requirement.scope === "garment",
);
assert.ok(lengthRequirement);
const stored = setFutureMeasurementInput({
  state: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
  requirement: lengthRequirement!,
  displayValue: 28,
});
assert.ok(stored.entered.byGarmentKey["additional:shirt:1"]);
assert.equal(stored.entered.byGarmentKey["base:shirt"], undefined);
assert.equal("Standard Shirt 2" in stored.entered.byGarmentKey, false);

const shirtTrouserSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: { shirt: shirtConstruction },
};
const shirtTrouserGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
];
const highRiskPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: shirtTrouserSelection,
  physicalGarments: shirtTrouserGarments,
});
let sharedState = createEmptyFutureMeasurementState("high_risk", "cm");
let sharedRenderer!: ReturnType<typeof create>;
act(() => {
  sharedRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: highRiskPlan,
    state: sharedState,
    physicalGarments: shirtTrouserGarments,
    onChange: (next) => {
      sharedState = next;
    },
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
act(() => {
  sharedRenderer.root.findByProps({ "data-measurement-garment": "base:trouser" }).props.onClick();
});
const trouserHeight = sharedRenderer.root.findByProps({ "data-measurement-field": "total_height" });
act(() => {
  trouserHeight.findByType("input").props.onChange({ target: { value: "180" } });
});
act(() => {
  sharedRenderer.update(createElement(DormantFutureMeasurementStep, {
    plan: highRiskPlan,
    state: sharedState,
    physicalGarments: shirtTrouserGarments,
    onChange: (next) => {
      sharedState = next;
    },
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
act(() => {
  sharedRenderer.root.findByProps({ "data-measurement-garment": "base:shirt" }).props.onClick();
});
assert.equal(
  sharedRenderer.root.findByProps({ "data-measurement-field": "total_height" }).findByType("input").props.value,
  180,
);
assert.equal(sharedState.entered.shared.total_height?.valueCm, 180);

let rememberedState = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "high_risk");
let rememberedRenderer!: ReturnType<typeof create>;
const rememberedProps = () => ({
  plan: highRiskPlan,
  state: rememberedState,
  physicalGarments: shirtTrouserGarments,
  onChange: (next: typeof rememberedState) => {
    rememberedState = next;
  },
  onRouteChange: () => undefined,
  onBack: () => undefined,
  onContinue: () => undefined,
});
act(() => {
  rememberedRenderer = create(createElement(DormantFutureMeasurementStep, rememberedProps()));
});
act(() => {
  rememberedRenderer.root.findByProps({ "data-measurement-garment": "base:trouser" }).props.onClick();
});
assert.equal(rememberedState.activeGarmentKey, "base:trouser");
const reloaded = normalizeFutureMeasurementState(rememberedState);
assert.equal(reloaded?.activeGarmentKey, "base:trouser");
act(() => {
  rememberedRenderer = create(createElement(DormantFutureMeasurementStep, {
    ...rememberedProps(),
    state: reloaded!,
  }));
});
assert.equal(
  rememberedRenderer.root.findByProps({ "data-measurement-garment": "base:trouser" }).props["aria-pressed"],
  true,
);

const shirtOnlyPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
let completeShirt = createEmptyFutureMeasurementState("high_risk", "cm");
for (const requirement of shirtOnlyPlan.requirements.filter((item) => item.directInput)) {
  completeShirt = setFutureMeasurementInput({
    state: completeShirt,
    requirement,
    displayValue: requirement.measurementId === "total_height" ? 180 : 90,
  });
}
completeShirt = reconcileFutureMeasurementState({ state: completeShirt, plan: shirtOnlyPlan });
let pendingRenderer!: ReturnType<typeof create>;
act(() => {
  pendingRenderer = create(createElement(DormantFutureMeasurementStep, {
    plan: shirtOnlyPlan,
    state: completeShirt,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    unassignedGarments: [{ garmentKey: "base:bum_shorts", garmentType: "bum_shorts" }],
    orderMeasurementsComplete: false,
    onChange: () => undefined,
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  }));
});
const pendingButton = pendingRenderer.root.findByProps({ "data-measurement-garment": "base:bum_shorts" });
assert.equal(pendingButton.props["data-measurement-garment-pending"], "true");
assert.equal(pendingButton.props["data-measurement-garment-pending-reason"], "assignment");
const pendingText = headingText(pendingRenderer.root);
assert.ok(pendingText.includes("Assign person") || pendingText.includes("Assignment needed"));
assert.ok(pendingText.includes("Assign"));
assert.ok(pendingText.includes("before Summary unlocks"));
assert.equal(pendingText.includes("cannot be measured for this profile"), false);
assert.equal(pendingText.includes("All required measurements are saved."), false);
assert.equal(
  pendingRenderer.root.findByProps({ "data-stage-id": "measurement" }).props[
    "data-measurement-blocked-by-assignment"
  ],
  "true",
);

const renderPickerHarness = ({
  state,
  plan,
  physicalGarments,
  unassignedGarments,
  orderMeasurementsComplete,
}: {
  state: ReturnType<typeof createEmptyFutureMeasurementState>;
  plan: ReturnType<typeof planMeasurementRequirements>;
  physicalGarments: Array<{ garmentKey: string; garmentType: "shirt" | "bum_shorts" | "trouser" }>;
  unassignedGarments?: Array<{ garmentKey: string; garmentType: "shirt" | "bum_shorts" | "trouser" }>;
  orderMeasurementsComplete?: boolean;
}) => {
  let liveState = state;
  let renderer!: ReturnType<typeof create>;
  const props = () => ({
    plan,
    state: liveState,
    physicalGarments,
    unassignedGarments,
    orderMeasurementsComplete,
    onChange: (next: typeof liveState) => {
      liveState = next;
    },
    onRouteChange: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
  });
  act(() => {
    renderer = create(createElement(DormantFutureMeasurementStep, props()));
  });
  const sync = () => {
    act(() => {
      renderer.update(createElement(DormantFutureMeasurementStep, props()));
    });
  };
  return {
    get state() {
      return liveState;
    },
    setState: (next: typeof liveState) => {
      liveState = next;
      sync();
    },
    renderer,
    sync,
    fillVisible: () => {
      const fields = renderer.root.findAll(
        (node) =>
          typeof node.props?.["data-measurement-field"] === "string" &&
          node.props?.["data-measurement-calculated"] !== "true",
      );
      for (const field of fields) {
        const input = field.findAllByType("input")[0];
        if (!input) continue;
        const measurementId = String(field.props["data-measurement-field"]);
        act(() => {
          input.props.onChange({
            target: {
              value: measurementId === "total_height" ? "180" : "90",
            },
          });
        });
        // Re-render after each field so the next onChange sees the latest state.
        sync();
      }
    },
  };
};

// Chip badges: incomplete shows remaining; complete shows Done.
{
  const badgePlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts,
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  const badgeHarness = renderPickerHarness({
    state: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
    plan: badgePlan,
    physicalGarments: physicalShirts,
  });
  const baseChip = badgeHarness.renderer.root.findByProps({
    "data-measurement-garment": "base:shirt",
  });
  const secondChip = badgeHarness.renderer.root.findByProps({
    "data-measurement-garment": "additional:shirt:1",
  });
  assert.equal(baseChip.props["data-measurement-garment-chip"], "remaining");
  assert.equal(secondChip.props["data-measurement-garment-chip"], "remaining");
  assert.ok(Number(baseChip.props["data-measurement-garment-remaining"]) > 0);
  assert.ok(headingText(badgeHarness.renderer.root).includes("left"));

  let completeBoth = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
  for (const requirement of badgePlan.requirements.filter((item) => item.directInput)) {
    completeBoth = setFutureMeasurementInput({
      state: completeBoth,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  completeBoth = reconcileFutureMeasurementState({ state: completeBoth, plan: badgePlan });
  const doneHarness = renderPickerHarness({
    state: completeBoth,
    plan: badgePlan,
    physicalGarments: physicalShirts,
    orderMeasurementsComplete: true,
  });
  assert.equal(
    doneHarness.renderer.root.findByProps({ "data-measurement-garment": "base:shirt" }).props[
      "data-measurement-garment-chip"
    ],
    "done",
  );
  assert.equal(
    doneHarness.renderer.root.findByProps({
      "data-measurement-garment": "additional:shirt:1",
    }).props["data-measurement-garment-chip"],
    "done",
  );
  assert.ok(headingText(doneHarness.renderer.root).includes("Done"));
}

// Unassigned chip is not the default selection when a measurable incomplete garment exists.
{
  const incompleteShirt = setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk");
  const defaultAwayPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  });
  const defaultAwayHarness = renderPickerHarness({
    state: {
      ...incompleteShirt,
      activeGarmentKey: "base:bum_shorts",
    },
    plan: defaultAwayPlan,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    unassignedGarments: [{ garmentKey: "base:bum_shorts", garmentType: "bum_shorts" }],
    orderMeasurementsComplete: false,
  });
  assert.equal(
    defaultAwayHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["aria-pressed"],
    true,
  );
  assert.equal(
    defaultAwayHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:bum_shorts",
    }).props["aria-pressed"],
    false,
  );
  assert.equal(
    defaultAwayHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:bum_shorts",
    }).props["data-measurement-garment-chip"],
    "assignment",
  );
}

// Auto-advance: fill garment A → selection advances to garment B; Continue stays locked.
{
  const advancePlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts,
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  const advanceHarness = renderPickerHarness({
    state: {
      ...setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
      activeGarmentKey: "base:shirt",
    },
    plan: advancePlan,
    physicalGarments: physicalShirts,
    orderMeasurementsComplete: false,
  });
  act(() => {
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props.onClick();
  });
  advanceHarness.sync();
  assert.equal(
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["aria-pressed"],
    true,
  );

  // Leave one base garment-specific field empty so the selected chip stays incomplete,
  // then complete that last field to trigger the complete → next-incomplete transition.
  const requiredPresentation = projectMeasurementRequirementsForPresentation({
    requirements: advancePlan.requirements,
    state: advanceHarness.state,
  }).filter((requirement) => requirement.section === "required");
  const sharedById = new Map<string, (typeof requiredPresentation)[number]>();
  for (const requirement of requiredPresentation) {
    if (requirement.scope === "shared" && requirement.directInput) {
      sharedById.set(requirement.measurementId, requirement);
    }
  }
  const baseSpecific = requiredPresentation.filter(
    (requirement) =>
      requirement.directInput &&
      requirement.garmentKey === "base:shirt" &&
      requirement.scope !== "shared",
  );
  assert.ok(baseSpecific.length > 0);
  const lastBaseField = baseSpecific.at(-1)!;
  let almostDone = advanceHarness.state;
  for (const requirement of [...sharedById.values(), ...baseSpecific.slice(0, -1)]) {
    almostDone = setFutureMeasurementInput({
      state: almostDone,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  almostDone = reconcileFutureMeasurementState({
    state: { ...almostDone, activeGarmentKey: "base:shirt" },
    plan: advancePlan,
  });
  advanceHarness.setState(almostDone);
  assert.equal(
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["data-measurement-garment-chip"],
    "remaining",
  );

  advanceHarness.setState(
    reconcileFutureMeasurementState({
      state: setFutureMeasurementInput({
        state: advanceHarness.state,
        requirement: lastBaseField,
        displayValue: lastBaseField.measurementId === "total_height" ? 180 : 90,
      }),
      plan: advancePlan,
    }),
  );

  assert.equal(
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "additional:shirt:1",
    }).props["aria-pressed"],
    true,
    "selection should auto-advance to the next incomplete garment",
  );
  assert.equal(
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["data-measurement-garment-chip"],
    "done",
  );
  assert.equal(
    advanceHarness.renderer.root.findByProps({
      "data-measurement-garment": "additional:shirt:1",
    }).props["data-measurement-garment-chip"],
    "remaining",
  );
  assert.equal(advanceHarness.state.activeGarmentKey, "additional:shirt:1");
  const continueButtons = advanceHarness.renderer.root.findAllByProps({
    "aria-label": "Continue to Summary",
  });
  assert.ok(continueButtons.length > 0);
  assert.ok(
    continueButtons.every((button) => button.props.disabled === true),
    "Continue must stay locked until the next garment is complete",
  );
  assert.ok(
    headingText(advanceHarness.renderer.root).includes("Standard Shirt 2") ||
      headingText(advanceHarness.renderer.root).includes("remains"),
  );
}

console.log("PASS: measurement garment picker badges, default, and auto-advance");

// Shared-then-advance: finish garment-specific first, then last shared → advances to B.
{
  const sharedAdvancePlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts,
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  const sharedHarness = renderPickerHarness({
    state: {
      ...setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
      activeGarmentKey: "base:shirt",
    },
    plan: sharedAdvancePlan,
    physicalGarments: physicalShirts,
    orderMeasurementsComplete: false,
  });
  act(() => {
    sharedHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props.onClick();
  });
  sharedHarness.sync();

  const requiredPresentation = projectMeasurementRequirementsForPresentation({
    requirements: sharedAdvancePlan.requirements,
    state: sharedHarness.state,
  }).filter((requirement) => requirement.section === "required");
  const sharedById = new Map<string, (typeof requiredPresentation)[number]>();
  for (const requirement of requiredPresentation) {
    if (requirement.scope === "shared" && requirement.directInput) {
      sharedById.set(requirement.measurementId, requirement);
    }
  }
  const baseSpecific = requiredPresentation.filter(
    (requirement) =>
      requirement.directInput &&
      requirement.garmentKey === "base:shirt" &&
      requirement.scope !== "shared",
  );
  const sharedFields = [...sharedById.values()];
  assert.ok(sharedFields.length > 0);
  assert.ok(baseSpecific.length > 0);

  let specificsDone = sharedHarness.state;
  for (const requirement of baseSpecific) {
    specificsDone = setFutureMeasurementInput({
      state: specificsDone,
      requirement,
      displayValue: 90,
    });
  }
  specificsDone = reconcileFutureMeasurementState({
    state: { ...specificsDone, activeGarmentKey: "base:shirt" },
    plan: sharedAdvancePlan,
  });
  sharedHarness.setState(specificsDone);
  assert.equal(
    sharedHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["data-measurement-garment-chip"],
    "shared",
  );
  assert.ok(headingText(sharedHarness.renderer.root).includes("Shared left"));
  assert.equal(
    sharedHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["aria-pressed"],
    true,
    "stay on base while shared remaining is still open",
  );

  const lastShared = sharedFields.at(-1)!;
  let almostShared = specificsDone;
  for (const requirement of sharedFields.slice(0, -1)) {
    almostShared = setFutureMeasurementInput({
      state: almostShared,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  almostShared = reconcileFutureMeasurementState({
    state: { ...almostShared, activeGarmentKey: "base:shirt" },
    plan: sharedAdvancePlan,
  });
  sharedHarness.setState(almostShared);
  assert.equal(
    sharedHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["aria-pressed"],
    true,
  );

  sharedHarness.setState(
    reconcileFutureMeasurementState({
      state: setFutureMeasurementInput({
        state: sharedHarness.state,
        requirement: lastShared,
        displayValue: lastShared.measurementId === "total_height" ? 180 : 90,
      }),
      plan: sharedAdvancePlan,
    }),
  );

  assert.equal(
    sharedHarness.renderer.root.findByProps({
      "data-measurement-garment": "additional:shirt:1",
    }).props["aria-pressed"],
    true,
    "finishing shared after garment-specific should auto-advance",
  );
  assert.equal(sharedHarness.state.activeGarmentKey, "additional:shirt:1");
  assert.ok(
    sharedHarness.renderer.root
      .findAllByProps({ "aria-label": "Continue to Summary" })
      .every((button) => button.props.disabled === true),
  );
}

// Go-to CTA: stranded on Done with B remaining → control advances pick.
{
  const goPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts,
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  const requiredPresentation = projectMeasurementRequirementsForPresentation({
    requirements: goPlan.requirements,
    state: createEmptyFutureMeasurementState("low_risk", "cm"),
  }).filter((requirement) => requirement.section === "required");
  let baseDoneState = setFutureMeasurementRoute(
    createEmptyFutureMeasurementState(),
    "low_risk",
  );
  for (const requirement of requiredPresentation.filter(
    (item) =>
      item.directInput &&
      (item.scope === "shared" || item.garmentKey === "base:shirt"),
  )) {
    baseDoneState = setFutureMeasurementInput({
      state: baseDoneState,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  baseDoneState = reconcileFutureMeasurementState({
    state: { ...baseDoneState, activeGarmentKey: "base:shirt" },
    plan: goPlan,
  });
  const goHarness = renderPickerHarness({
    state: baseDoneState,
    plan: goPlan,
    physicalGarments: physicalShirts,
    orderMeasurementsComplete: false,
  });
  act(() => {
    goHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props.onClick();
  });
  goHarness.sync();
  assert.equal(
    goHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["data-measurement-garment-chip"],
    "done",
  );
  assert.equal(
    goHarness.renderer.root.findByProps({
      "data-measurement-garment": "base:shirt",
    }).props["aria-pressed"],
    true,
  );
  const goButton = goHarness.renderer.root.findByProps({
    "data-measurement-go-to-next": "additional:shirt:1",
  });
  assert.match(headingText(goButton), /Go to Standard Shirt 2/i);
  act(() => {
    goButton.props.onClick();
  });
  goHarness.sync();
  assert.equal(
    goHarness.renderer.root.findByProps({
      "data-measurement-garment": "additional:shirt:1",
    }).props["aria-pressed"],
    true,
  );
  assert.equal(goHarness.state.activeGarmentKey, "additional:shirt:1");
  assert.ok(
    goHarness.renderer.root
      .findAllByProps({ "aria-label": "Continue to Summary" })
      .every((button) => button.props.disabled === true),
  );
}

console.log("PASS: multi-garment shared-then-advance and Go-to next garment");

// Go-to-person: active wearer complete + other incomplete → control switches wearer.
{
  const personPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  });
  let personComplete = setFutureMeasurementRoute(
    createEmptyFutureMeasurementState(),
    "low_risk",
  );
  for (const requirement of personPlan.requirements.filter(
    (item) => item.directInput,
  )) {
    personComplete = setFutureMeasurementInput({
      state: personComplete,
      requirement,
      displayValue: requirement.measurementId === "total_height" ? 180 : 90,
    });
  }
  personComplete = reconcileFutureMeasurementState({
    state: personComplete,
    plan: personPlan,
  });
  let wentToWearerId: string | null = null;
  let personRenderer!: ReturnType<typeof create>;
  act(() => {
    personRenderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: personPlan,
        state: personComplete,
        physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
        orderMeasurementsComplete: false,
        otherWearerIncompleteLabels: ["Person 2"],
        nextIncompleteWearer: { wearerId: "wearer-b", label: "Person 2" },
        onGoToWearer: (wearerId: string) => {
          wentToWearerId = wearerId;
        },
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const goPerson = personRenderer.root.findByProps({
    "data-measurement-go-to-wearer": "wearer-b",
  });
  assert.match(headingText(goPerson), /Go to Person 2/i);
  assert.ok(headingText(personRenderer.root).includes("Person 2"));
  act(() => {
    goPerson.props.onClick();
  });
  assert.equal(wentToWearerId, "wearer-b");
}

console.log("PASS: measurement Go-to-person and shared chip honesty");

// Matching clarity: elevated Measuring for banner + garment pills; no duplicate person switcher.
{
  const matchPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: physicalShirts,
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: { "additional:shirt:1": shirtConstruction },
    },
  });
  let matchRenderer!: ReturnType<typeof create>;
  act(() => {
    matchRenderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: matchPlan,
        state: setFutureMeasurementRoute(createEmptyFutureMeasurementState(), "low_risk"),
        physicalGarments: physicalShirts,
        activeWearerLabel: "Person 2",
        activeWearerGarmentLabels: ["Standard Shirt", "Standard Shirt 2"],
        orderMeasurementsComplete: false,
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const matchText = headingText(matchRenderer.root);
  assert.equal(
    matchRenderer.root.findByProps({
      "data-measurement-active-wearer": "Person 2",
    }).props["data-measurement-active-wearer"],
    "Person 2",
  );
  assert.ok(matchText.includes("Measuring for"));
  assert.ok(matchText.includes("Person 2"));
  assert.ok(matchText.includes("Standard Shirt"));
  assert.ok(matchText.includes("Standard Shirt 2"));
  assert.ok(
    matchText.includes("Add measurements for one of Person 2's garments at a time"),
  );
  assert.equal(
    matchRenderer.root.findAll(
      (node) => typeof node.props?.["data-measurement-switch-wearer"] === "string",
    ).length,
    0,
    "Measuring-for must not duplicate the People panel with a person switcher",
  );
  assert.ok(matchText.includes("Medium Risk") || matchText.includes("Low Risk"));
}

console.log("PASS: measurement matching clarity person + garments banner");

{
  const mediumPlan = planMeasurementRequirements({
    route: "medium_risk",
    garmentTypeSelection: shirtSelection,
    physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
  });
  let mediumState = setFutureMeasurementRoute(
    createEmptyFutureMeasurementState(),
    "medium_risk",
  );
  const heightRequirement = mediumPlan.requirements.find(
    (requirement) =>
      requirement.directInput && requirement.measurementId === "total_height",
  );
  assert.ok(heightRequirement);
  mediumState = setFutureMeasurementInput({
    state: mediumState,
    requirement: heightRequirement!,
    displayValue: 180,
  });
  mediumState = reconcileFutureMeasurementState({
    state: mediumState,
    plan: mediumPlan,
  });
  let pendingCalcRenderer!: ReturnType<typeof create>;
  act(() => {
    pendingCalcRenderer = create(
      createElement(DormantFutureMeasurementStep, {
        plan: mediumPlan,
        state: mediumState,
        physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
        onChange: () => undefined,
        onRouteChange: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const pendingNode = pendingCalcRenderer.root.findByProps({
    "data-measurement-calculated-pending": "true",
  });
  const waitingOn = String(pendingNode.props["data-measurement-calculated-waiting-on"] || "");
  assert.ok(waitingOn.length > 0, "pending calc lists remaining required manuals");
  assert.equal(waitingOn.includes("Total Height"), false);
  assert.ok(headingText(pendingNode).includes("Waiting on:"));
  assert.ok(
    pendingCalcRenderer.root.findAll(
      (node) => node.props?.["data-measurement-calculated-value"] === "pending",
    ).length > 0,
  );
}

console.log("PASS: measurement calculated-from-height pending remaining manuals");
