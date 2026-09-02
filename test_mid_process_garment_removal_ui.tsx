import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import {
  FutureGarmentRemovalConfirmationDialog,
  projectFutureGarmentRemovalTargets,
  type FutureGarmentRemovalTarget,
} from "./src/components/FutureGarmentRemovalConfirmationDialog";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type { DesignSelections } from "./src/types";
import { createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import type {
  FutureOrderCandidateBuildResult,
  FutureOrderCandidateV1,
} from "./src/utils/futureOrderCandidate";
import { createEmptyFutureMeasurementState } from "./src/utils/measurementBlueprint";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children
        .map((child) => textContent(child as ReactTestInstance | string))
        .join("");

const render = (element: ReturnType<typeof createElement>) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

const physicalOccurrences = [
  {
    garmentKey: "base:shirt",
    garmentType: "shirt" as const,
    sourceRole: "main" as const,
    fabricUnits: 1,
  },
  {
    garmentKey: "additional:shirt:1",
    garmentType: "shirt" as const,
    sourceRole: "additional" as const,
    fabricUnits: 1,
  },
  {
    garmentKey: "additional:shirt:2",
    garmentType: "shirt" as const,
    sourceRole: "additional" as const,
    fabricUnits: 1,
  },
  {
    garmentKey: "base:skirt",
    garmentType: "skirt" as const,
    sourceRole: "main" as const,
    fabricUnits: 1,
  },
  {
    garmentKey: "additional:trouser:pending",
    garmentType: "trouser" as const,
    sourceRole: "additional" as const,
    fabricUnits: 1,
  },
];

const removalTargets = projectFutureGarmentRemovalTargets({
  occurrences: physicalOccurrences,
  provisionalGarmentKey: "additional:trouser:pending",
});

assert.deepEqual(
  removalTargets.map((target) => target.garmentKey),
  ["base:shirt", "additional:shirt:1", "additional:shirt:2", "base:skirt"],
  "the UI projection must retain authoritative order and exclude the provisional addition",
);
assert.deepEqual(
  removalTargets.map((target) => target.accessibleName),
  [
    "Remove Shirt, base garment",
    "Remove Shirt, additional garment 1",
    "Remove Shirt, additional garment 2",
    "Remove Skirt, base garment",
  ],
  "repeated physical occurrences must have unique customer-facing accessible names",
);

const construction = (garmentKey: string, label: string, priceCents: number) => ({
  componentKey: `${garmentKey}:construction`,
  selectionGroup: "shirt_construction",
  optionId: `${garmentKey}:standard`,
  label,
  priceCents,
});

const summary: FutureDesignStudioSummary = {
  status: "incomplete",
  blockers: [
    {
      code: "AI_TRY_ON_STALE",
      section: "ai_try_on",
      message: "Review AI Try-on after changing garments.",
    },
  ],
  garmentSummary: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt",
      label: "Standard Shirt",
      role: "main",
      demographic: "female",
      fabricUnits: 1,
      physicalComponents: [
        { garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt" },
      ],
      construction: [construction("base:shirt", "Standard Shirt", 6500)],
      constructionTotalCents: 6500,
    },
    {
      garmentKey: "additional:shirt:1",
      garmentType: "shirt",
      label: "Standard Shirt",
      role: "additional",
      demographic: "female",
      fabricUnits: 1,
      physicalComponents: [
        {
          garmentKey: "additional:shirt:1",
          garmentType: "shirt",
          label: "Standard Shirt",
        },
      ],
      construction: [
        construction("additional:shirt:1", "Standard Shirt", 6500),
      ],
      constructionTotalCents: 6500,
    },
    {
      garmentKey: "additional:shirt:2",
      garmentType: "shirt",
      label: "Standard Shirt",
      role: "additional",
      demographic: "female",
      fabricUnits: 1,
      physicalComponents: [
        {
          garmentKey: "additional:shirt:2",
          garmentType: "shirt",
          label: "Standard Shirt",
        },
      ],
      construction: [
        construction("additional:shirt:2", "Standard Shirt", 6500),
      ],
      constructionTotalCents: 6500,
    },
    {
      garmentKey: "base:skirt",
      garmentType: "skirt",
      label: "Standard Skirt With A Deliberately Long Customer Label",
      role: "main",
      demographic: "female",
      fabricUnits: 1,
      physicalComponents: [
        { garmentKey: "base:skirt", garmentType: "skirt", label: "Standard Skirt" },
      ],
      construction: [construction("base:skirt", "Standard Skirt", 7500)],
      constructionTotalCents: 7500,
    },
  ],
  fabricSummary: [
    {
      allocationId: "allocation-shared",
      fabricCode: "FAB-A",
      fabricName: "Heritage Ivory Lattice",
      availability: "available",
      capacityUnits: 2,
      materialPrice: 40,
      pricingTreatment: "included_in_garment_construction",
      garments: [
        { garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt" },
        { garmentKey: "additional:shirt:1", garmentType: "shirt", label: "Standard Shirt" },
      ],
    },
  ],
  designStyleSummary: null,
  customDetailsSummary: [],
  aiTryOnSummary: { status: "retry_required", label: "Retry required" },
  measurementSummary: {
    route: "low_risk",
    routeLabel: "Low Risk",
    unit: "cm",
    shared: [],
    byGarment: [],
  },
  pricingSummary: {
    status: "exact",
    garmentConstructionSubtotal: 270,
    customDetailsExactSubtotal: 0,
    selectedDesignPrice: null,
  },
};

const noOp = () => undefined;
const requestLog: Array<{ key: string; trigger: unknown }> = [];
const requestRemoval = (
  target: FutureGarmentRemovalTarget,
  trigger: HTMLButtonElement,
) => requestLog.push({ key: target.garmentKey, trigger });

const summaryRenderer = render(
  createElement(DormantFutureSummaryStep, {
    summary,
    onBack: noOp,
    onEditGarments: noOp,
    onEditFabrics: noOp,
    onEditDesignStyle: noOp,
    onEditCustomDetails: noOp,
    onEditAiTryOn: noOp,
    onEditMeasurements: noOp,
    canContinueToShipping: false,
    onContinueToShipping: noOp,
    removalTargets,
    onRequestGarmentRemoval: requestRemoval,
  }),
);
const summaryRemovalButtons = summaryRenderer.root.findAll(
  (node) => node.type === "button" && Boolean(node.props["data-garment-removal-button"]),
);
assert.equal(summaryRemovalButtons.length, 4);
assert.ok(summaryRemovalButtons.every((button) => button.props.type === "button"));
let stopPropagationCount = 0;
const secondRepeatedTrigger = { isConnected: true } as HTMLButtonElement;
act(() => {
  summaryRemovalButtons[2].props.onClick({
    currentTarget: secondRepeatedTrigger,
    stopPropagation: () => {
      stopPropagationCount += 1;
    },
  });
});
assert.deepEqual(requestLog.at(-1), {
  key: "additional:shirt:2",
  trigger: secondRepeatedTrigger,
});
assert.equal(stopPropagationCount, 1, "the row action must not activate a parent card");

const customDetailsProps: Parameters<typeof DormantFutureCustomDetailsStep>[0] = {
  reconciliation: {
    subjects: [],
    applicabilityByGarmentKey: new Map(),
    state: { schemaVersion: 1, selectionsByGarmentKey: {}, snapshotsByGarmentKey: {} },
    diagnostics: [],
    stateChanged: false,
  },
  catalogue: {
    coreGroups: [],
    additionalCostGroups: [],
    personalizedGroup: {
      selectionGroup: "personalized_additional",
      title: "Personalized Additional",
      options: [],
      occurrences: [],
      isConstruction: false,
      allowMultiple: false,
    },
    activeParentGarmentOrder: [],
  },
  personalizedInputs: { schemaVersion: 1, textByGarmentKey: {} },
  completion: { status: "complete", blockers: [] },
  pricing: { status: "exact", subtotalCents: 0, subtotal: 0, lines: [] },
  orderLevelCustomDetailsPrice: 0,
  constructionBreakdown: { status: "complete", rows: [] },
  constructionSubtotal: 270,
  designSelections: { accessories: [] } as DesignSelections,
  selectedStyle: null,
  additionalGarments: [],
  additionalGarmentConstructionOptions: [],
  onSingleSelect: noOp,
  onClearSelection: noOp,
  onConstructionSelect: noOp,
  onToggleMultiSelect: noOp,
  onPersonalizedTextChange: noOp,
  onDecorativeFeatureToggle: noOp,
  onClearDecorativeFeatures: noOp,
  onMonogramPlacementChange: noOp,
  onAccessoryToggle: noOp,
  onClearAccessories: noOp,
  onAddAdditionalGarment: noOp,
  removalTargets,
  onRequestGarmentRemoval: requestRemoval,
  onBack: noOp,
  onContinue: noOp,
};
const customRenderer = render(
  createElement(DormantFutureCustomDetailsStep, customDetailsProps),
);
const customRows = customRenderer.root.findAll(
  (node) => node.type === "li" && Boolean(node.props["data-garment-removal-row"]),
);
const customButtons = customRenderer.root.findAll(
  (node) => node.type === "button" && Boolean(node.props["data-garment-removal-button"]),
);
assert.equal(customRows.length, 4, "Custom Details must list each committed occurrence once");
assert.equal(customButtons.length, 4, "Custom Details must expose one shared removal request per occurrence");
assert.equal(
  customRenderer.root.findAllByProps({ "data-garment-removal-list": "custom_details" }).length,
  1,
);
assert.ok(
  !textContent(customRenderer.root).includes("additional:shirt:2"),
  "raw garment keys must not be customer-facing text",
);

const candidateGarments = summary.garmentSummary.map((garment) => ({ ...garment }));
const candidate: FutureOrderCandidateV1 = {
  schemaVersion: 1,
  journey: { mode: "future_nine_stage", schemaVersion: 1 },
  authorityVersions: {
    customDetailsSchemaVersion: 1,
    measurementSchemaVersion: 1,
    measurementBlueprintVersion: "measurement-blueprint-v1",
    measurementFormulaVersion: "low-risk-formula-v1",
    shippingSchemaVersion: 1,
    shippingTariffVersion: null,
    shippingRuleFingerprint: null,
    shippingInputFingerprint: null,
  },
  source: { kind: "catalog", sourceKey: "catalog:test-style", styleId: "test-style" },
  design: null,
  garments: candidateGarments,
  fabricAllocations: [
    {
      allocationId: "allocation-shared",
      fabricId: "fabric-a",
      fabricCode: "FAB-A",
      fabricName: "Heritage Ivory Lattice",
      availability: "available",
      capacityUnits: 2,
      materialPriceCents: 4000,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: candidateGarments.slice(0, 2).map((garment) => ({
        garmentKey: garment.garmentKey,
        code: `GARMENT-${garment.garmentKey}`,
        garmentType: garment.garmentType as "shirt",
        fabricUnits: 1 as const,
        sourceRole: garment.role,
      })),
    },
  ],
  customDetails: [],
  aiTryOn: {
    status: "stale",
    reviewStatus: "retry_required",
    verifiedPrivateResultReference: null,
  },
  measurements: createEmptyFutureMeasurementState("low_risk", "cm"),
  shipping: {
    state: createEmptyFutureShippingState(),
    status: "incomplete",
    customerInformationComplete: false,
    formInputsComplete: false,
    formComplete: false,
    quoteReady: false,
    quoteRequired: false,
    destinationLabel: null,
    parcelWeightKg: null,
    weightTier: null,
    additionalDeliveryFeeCents: null,
    rateVersion: "step8-additional-delivery-v1",
  },
  pricing: {
    schemaVersion: 2,
    model: "all_inclusive_garment_construction",
    status: "exact",
    garmentConstructionSubtotalCents: 27000,
    customDetailsCents: 0,
    selectedDesignTotalCents: 27000,
    postEindhovenAdjustmentCents: null,
    exactTotalCents: null,
    components: {
      fabric: { status: "included_in_garment_construction", amountCents: null },
      sewing: { status: "included_in_garment_construction", amountCents: null },
      tax: { status: "included_in_garment_construction", amountCents: null },
      lagosToEindhovenShipping: {
        status: "included_in_garment_construction",
        amountCents: null,
      },
      customDetails: { status: "separately_charged", amountCents: 0 },
      postEindhovenDelivery: { status: "pricing_pending", amountCents: null },
    },
  },
  contentStatus: "blocked",
  paymentStatus: "payment_provider_unavailable",
  blockers: [],
};
const candidateResult: FutureOrderCandidateBuildResult = {
  status: "blocked",
  paymentStatus: "payment_provider_unavailable",
  candidate,
  blockers: [],
};
const paymentRenderer = render(
  createElement(DormantFuturePaymentReviewStep, {
    result: candidateResult,
    survivorSummary: summary,
    removalTargets,
    onRequestGarmentRemoval: requestRemoval,
    onBack: noOp,
    onEditStage: noOp,
  }),
);
assert.equal(
  paymentRenderer.root.findAll(
    (node) => node.type === "button" && Boolean(node.props["data-garment-removal-button"]),
  ).length,
  4,
  "candidate-backed Payment Review must expose one action per exact garment row",
);

const retainedResult: FutureOrderCandidateBuildResult = {
  status: "invalid",
  paymentStatus: "payment_provider_unavailable",
  candidate: null,
  blockers: [
    {
      code: "AI_TRY_ON_STALE",
      stage: "try_on",
      message: "Review AI Try-on after changing garments.",
    },
  ],
};
const retainedPaymentRenderer = render(
  createElement(DormantFuturePaymentReviewStep, {
    result: retainedResult,
    survivorSummary: summary,
    removalTargets,
    onRequestGarmentRemoval: requestRemoval,
    onBack: noOp,
    onEditStage: noOp,
  }),
);
assert.equal(
  retainedPaymentRenderer.root.findAllByProps({ "data-retained-payment-garment": "true" }).length,
  4,
  "candidate-null retention must keep authoritative survivor rows visible",
);
assert.equal(
  retainedPaymentRenderer.root.findAll(
    (node) => node.type === "button" && Boolean(node.props["data-garment-removal-button"]),
  ).length,
  4,
);
const unavailablePayment = retainedPaymentRenderer.root.findAll(
  (node) => node.type === "button" && textContent(node).includes("Payment integration pending"),
);
assert.equal(unavailablePayment.length, 1);
assert.equal(unavailablePayment[0].props.disabled, true, "retention must not enable payment");

const finalTarget = projectFutureGarmentRemovalTargets({
  occurrences: [physicalOccurrences[0]],
  provisionalGarmentKey: null,
})[0];
assert.equal(finalTarget.canRequestRemoval, false);
assert.equal(finalTarget.disabledReason, "At least one garment must remain in your order.");
const finalSummaryRenderer = render(
  createElement(DormantFutureSummaryStep, {
    summary: { ...summary, garmentSummary: [summary.garmentSummary[0]] },
    onBack: noOp,
    onEditGarments: noOp,
    onEditFabrics: noOp,
    onEditDesignStyle: noOp,
    onEditCustomDetails: noOp,
    onEditAiTryOn: noOp,
    onEditMeasurements: noOp,
    canContinueToShipping: false,
    onContinueToShipping: noOp,
    removalTargets: [finalTarget],
    onRequestGarmentRemoval: requestRemoval,
  }),
);
const finalRemoveButton = finalSummaryRenderer.root.findByProps({
  "data-garment-removal-button": "base:shirt",
});
assert.equal(finalRemoveButton.props.disabled, true);
assert.match(textContent(finalSummaryRenderer.root), /At least one garment must remain/);

let keepCount = 0;
let confirmCount = 0;
const dialogRenderer = render(
  createElement(FutureGarmentRemovalConfirmationDialog, {
    target: removalTargets[2],
    confirming: false,
    terminalError: null,
    onCancel: () => {
      keepCount += 1;
    },
    onConfirm: () => {
      confirmCount += 1;
    },
  }),
);
const alertDialog = dialogRenderer.root.findByProps({ role: "alertdialog" });
assert.equal(alertDialog.props["aria-modal"], "true");
assert.ok(alertDialog.props["aria-labelledby"]);
assert.ok(alertDialog.props["aria-describedby"]);
assert.match(textContent(alertDialog), /Remove Shirt\?/);
assert.match(textContent(alertDialog), /saved Fabric assignment, Custom Details and measurements/);
assert.ok(!textContent(alertDialog).includes("additional:shirt:2"));
const keepButton = dialogRenderer.root.findByProps({
  "data-future-garment-removal-keep": "true",
});
const confirmButton = dialogRenderer.root.findByProps({
  "data-future-garment-removal-confirm": "true",
});
assert.equal(keepButton.props.type, "button");
assert.equal(confirmButton.props.type, "button");
assert.match(String(keepButton.props.className), /(?:^|\s)min-h-11(?:\s|$)/);
assert.match(String(confirmButton.props.className), /(?:^|\s)min-h-11(?:\s|$)/);
act(() => keepButton.props.onClick());
assert.equal(keepCount, 1);
assert.equal(confirmCount, 0, "safe cancellation must not confirm removal");
const backdropButton = dialogRenderer.root.findByProps({
  "data-future-garment-removal-backdrop-cancel": "true",
});
act(() => backdropButton.props.onClick());
assert.equal(keepCount, 2);
assert.equal(confirmCount, 0);

act(() => {
  dialogRenderer.update(
    createElement(FutureGarmentRemovalConfirmationDialog, {
      target: removalTargets[2],
      confirming: false,
      terminalError: "Remove the dependent added garment first, then try again.",
      onCancel: () => {
        keepCount += 1;
      },
      onConfirm: () => {
        confirmCount += 1;
      },
    }),
  );
});
assert.equal(dialogRenderer.root.findAllByProps({ role: "alert" }).length, 1);
assert.equal(
  dialogRenderer.root.findByProps({
    "data-future-garment-removal-confirm": "true",
  }).props.disabled,
  true,
  "a terminal blocker must prevent repeated confirmation while Keep Garment remains available",
);

const viewSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
const openStart = viewSource.indexOf("const openFutureGarmentRemovalDialog");
const confirmStart = viewSource.indexOf("const confirmFutureGarmentRemoval");
const confirmEnd = viewSource.indexOf("const handleUseSameFutureFabric", confirmStart);
assert.ok(openStart >= 0 && confirmStart > openStart && confirmEnd > confirmStart);
const openSlice = viewSource.slice(openStart, confirmStart);
const confirmSlice = viewSource.slice(confirmStart, confirmEnd);
assert.match(openSlice, /expectedAuthoritySignature:\s*futurePhysicalGarmentRemovalAuthority\.signature/);
assert.match(openSlice, /originStage,/);
assert.match(openSlice, /opener,/);
assert.match(openSlice, /sessionIdentityKey:\s*futureGarmentRemovalSessionIdentityKey/);
assert.doesNotMatch(
  openSlice,
  /handleRemoveFuturePhysicalGarmentOccurrence\(/,
  "opening confirmation must not mutate canonical state",
);
assert.match(confirmSlice, /expectedAuthoritySignature:\s*request\.expectedAuthoritySignature/);
assert.match(
  confirmSlice,
  /futureGarmentRemovalProcessedGenerationRef\.current\s*===\s*request\.confirmationGeneration/,
  "the owner must reject repeated activation for the same frozen confirmation generation",
);
assert.match(
  confirmSlice,
  /futureGarmentRemovalProcessedGenerationRef\.current\s*=\s*request\.confirmationGeneration;[\s\S]*handleRemoveFuturePhysicalGarmentOccurrence\(/,
  "the generation must be consumed before the central coordinator is called",
);
assert.equal(
  (confirmSlice.match(/handleRemoveFuturePhysicalGarmentOccurrence\(/g) || []).length,
  1,
  "confirmation must have one central coordinator call site",
);
assert.doesNotMatch(confirmSlice, /expectedAuthoritySignature:\s*futurePhysicalGarmentRemovalAuthority\.signature/);

const compactSummarySource = readFileSync(
  new URL("./src/components/DesignStudioOrderSummary.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(compactSummarySource, /garment-removal|onRequestGarmentRemoval/i);

for (const renderer of [
  summaryRenderer,
  customRenderer,
  paymentRenderer,
  retainedPaymentRenderer,
  finalSummaryRenderer,
  dialogRenderer,
]) {
  act(() => renderer.unmount());
}

console.log("Mid-process garment removal UI tests passed");
