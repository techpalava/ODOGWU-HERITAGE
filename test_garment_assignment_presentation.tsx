import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import type { DesignStyleStepOccurrencePresentation } from "./src/utils/designStyleStepRuntime";
import {
  formatFabricHalfCapacityCannotFitCopy,
  formatFabricStockExhaustedCopy,
  getFabricNewAllocationStockConstraintMessage,
  getOrderAwareFabricStockPresentation,
} from "./src/utils/fabricStockAvailability";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const text = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => text(child as ReactTestInstance | string)).join("")
      : "";

const fabric = {
  code: "ROYAL-FOREST",
  name: "Royal Forest Mosaic",
  description: "Fixture",
  color: "Green",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  stock: 1,
  category: "Fixture",
} as Fabric;
const halfUsed: FabricAllocationState = {
  fabricAllocations: [{
    allocationId: "royal-forest-selection",
    fabricCode: fabric.code,
    garmentAssignments: [{
      code: "BASE_SHIRT",
      garmentKey: "base:shirt",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    }],
  }],
  activeAllocationId: "royal-forest-selection",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
};

const fabricStockLabel = (
  candidate: ReturnType<typeof getOrderAwareFabricStockPresentation>,
) => {
  assert.equal(candidate.visible, true);
  return candidate.label;
};

// Task 1: only an allocator-confirmed target may replace stock-exhausted copy.
assert.deepEqual(
  getOrderAwareFabricStockPresentation(fabric, halfUsed, {
    hasCompatibleReusableHalfCapacity: true,
  }),
  { visible: true, status: "REUSABLE_CAPACITY", label: "1/2 Capacity Left", tone: "in_stock" },
);
assert.equal(
  fabricStockLabel(getOrderAwareFabricStockPresentation(fabric, halfUsed)),
  "Out of Stock",
);
assert.equal(
  fabricStockLabel(
    getOrderAwareFabricStockPresentation({ ...fabric, stock: 3 }, halfUsed),
  ),
  "Low Stock: 2",
);
assert.equal(
  fabricStockLabel(
    getOrderAwareFabricStockPresentation(
      { ...fabric, stockStatus: "LOW_STOCK", stock: 3 },
      halfUsed,
    ),
  ),
  "Low Stock: 2",
);

// Target-aware stock constraint copy: a leftover half that the waiting garment
// cannot fit must be explained, not reported as generic missing stock.
assert.equal(
  formatFabricHalfCapacityCannotFitCopy(["Long Dress"]),
  "1/2 Fabric capacity is left, but Long Dress needs a full Fabric. No additional stock is available for this Fabric.",
);
assert.equal(
  formatFabricHalfCapacityCannotFitCopy(["Long Dress", "Long Dress"]),
  "1/2 Fabric capacity is left, but the remaining garments need a full Fabric. No additional stock is available for this Fabric.",
);
assert.equal(
  getFabricNewAllocationStockConstraintMessage(fabric, halfUsed, false, {
    halfCapacityBlockedGarmentLabels: ["Long Dress"],
  }),
  formatFabricHalfCapacityCannotFitCopy(["Long Dress"]),
  "Exhausted stock with an unusable leftover half explains the target.",
);
assert.equal(
  getFabricNewAllocationStockConstraintMessage(fabric, halfUsed, true, {
    halfCapacityBlockedGarmentLabels: ["Long Dress"],
  }),
  null,
  "Allocator-confirmed reuse clears the constraint so USE AGAIN stays enabled.",
);
assert.equal(
  getFabricNewAllocationStockConstraintMessage(fabric, halfUsed, false),
  formatFabricStockExhaustedCopy(),
  "Without leftover-half context the generic exhausted copy is unchanged.",
);
assert.equal(
  getFabricNewAllocationStockConstraintMessage({ ...fabric, stock: 3 }, halfUsed, false, {
    halfCapacityBlockedGarmentLabels: ["Long Dress"],
  }),
  null,
  "Remaining stock never produces a constraint message.",
);
assert.equal(
  getFabricNewAllocationStockConstraintMessage({ ...fabric, stock: 0 }, halfUsed, false, {
    halfCapacityBlockedGarmentLabels: ["Long Dress"],
  }),
  "Currently out of stock.",
  "Zero stock keeps its existing copy.",
);

const selection = {
  garmentTypes: ["shirt", "shirt"],
  demographic: "male" as const,
  audienceSelection: { schemaVersion: 1 as const, demographics: ["male" as const] },
  constructionByGarment: {},
} satisfies GarmentTypeStepSelection;
const styles: StyleCategory[] = [
  { id: "style-a", name: "Forest Design", description: "A", gender: "male", targetDemographic: "male", options: [], image: "https://example.test/forest.jpg", fabricCapacityComposition: [{ key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }] },
  { id: "style-b", name: "Gold Design", description: "B", gender: "male", targetDemographic: "male", options: [], image: "https://example.test/gold.jpg", fabricCapacityComposition: [{ key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }] },
];
const model = createDesignStyleStepTestModel({ styles, garmentTypeSelection: selection });
const catalogueOccurrences: readonly DesignStyleStepOccurrencePresentation[] = [
  {
    target: { garmentKey: "base:shirt", occurrenceToken: "base:shirt#1" },
    garmentType: "shirt" as const,
    label: "Shirt",
    status: "complete" as const,
    assignment: { garmentKey: "base:shirt", assignmentRevision: 1, sourceKind: "catalog", occurrenceToken: "base:shirt#1", sourceKey: "style-a", catalogStyleId: "style-a", eligibilityFingerprint: "fixture" },
    assignmentLabel: "Forest Design",
    assignmentImage: "https://example.test/forest.jpg",
  },
  {
    target: { garmentKey: "additional:shirt:1", occurrenceToken: "additional:shirt:1#1" },
    garmentType: "shirt" as const,
    label: "Shirt 2",
    status: "complete" as const,
    assignment: { garmentKey: "additional:shirt:1", assignmentRevision: 1, sourceKind: "catalog", occurrenceToken: "additional:shirt:1#1", sourceKey: "style-b", catalogStyleId: "style-b", eligibilityFingerprint: "fixture" },
    assignmentLabel: "Gold Design",
    assignmentImage: "https://example.test/gold.jpg",
  },
];
let designRenderer!: ReturnType<typeof create>;
act(() => {
  designRenderer = create(
    <DormantFutureDesignStyleStep {...createDesignStyleStepRenderProps(model)} occurrences={catalogueOccurrences} completedCount={2} totalCount={2} exactSetComplete />,
  );
});
const selectedPreviews = designRenderer.root.findAll(
  (node) => node.props?.["data-selected-design-preview"] === "true" || node.props?.["data-selected-design-preview"] === true,
);
assert.deepEqual(
  selectedPreviews.map((preview) => preview.findByType("img").props.src),
  ["https://example.test/forest.jpg", "https://example.test/gold.jpg"],
  "repeated shirt occurrences retain their exact selected catalogue image",
);
act(() => {
  designRenderer.update(
    <DormantFutureDesignStyleStep
      {...createDesignStyleStepRenderProps(model)}
      occurrences={[
        catalogueOccurrences[0]!,
        {
          ...catalogueOccurrences[1]!,
          assignment: {
            garmentKey: "additional:shirt:1",
            assignmentRevision: 2,
            sourceKind: "uploaded" as const,
            occurrenceToken: "additional:shirt:1#1",
            sourceKey: "uploaded-source",
            uploadedSourceRef: "uploaded-reference",
          },
          assignmentLabel: "Uploaded design",
          assignmentImage: null,
        },
      ]}
      selectedDesignPreviewByOccurrenceToken={{
        "additional:shirt:1#1": "blob:uploaded-shirt-two",
      }}
      completedCount={2}
      totalCount={2}
      exactSetComplete
    />,
  );
});
assert.deepEqual(
  designRenderer.root.findAll(
    (node) => node.props?.["data-selected-design-preview"] === "true" || node.props?.["data-selected-design-preview"] === true,
  ).map((preview) => preview.findByType("img").props.src),
  ["https://example.test/forest.jpg", "blob:uploaded-shirt-two"],
  "an uploaded preview stays scoped to its exact physical occurrence",
);
act(() => designRenderer.unmount());

const summary = {
  status: "ready",
  blockers: [],
  garmentSummary: [
    { garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt", role: "main", demographic: "male", fabricUnits: 1, physicalComponents: [], construction: [{ componentKey: "shirt:neck:base", selectionGroup: "neck", optionId: "base-neck", label: "Base Neck", priceCents: 8500 }, { componentKey: "shirt:cuff:base", selectionGroup: "cuff", optionId: "included-cuff", label: "Classic Cuff", priceCents: 0 }], constructionTotalCents: 8500 },
    { garmentKey: "additional:shirt:1", garmentType: "shirt", label: "Standard Shirt", role: "additional", demographic: "male", fabricUnits: 1, physicalComponents: [], construction: [{ componentKey: "shirt:neck:added", selectionGroup: "neck", optionId: "base-neck", label: "Base Neck", priceCents: 8500 }], constructionTotalCents: 8500 },
  ],
  fabricSummary: [],
  designStyleSummary: null,
  designStyleOccurrences: [],
  customDetailsSummary: [
    { garmentKey: "base:shirt", garmentLabel: "Standard Shirt", occurrences: [{ occurrenceKey: "base:shirt:neck", garmentKey: "base:shirt", garmentLabel: "Standard Shirt", selectionGroup: "neck", selectionGroupTitle: "Neck", optionId: "base-neck", optionLabel: "Base Neck", priceStatus: "exact", priceCents: 8500, personalizedText: null }, { occurrenceKey: "base:shirt:sleeve", garmentKey: "base:shirt", garmentLabel: "Standard Shirt", selectionGroup: "sleeve", selectionGroupTitle: "Sleeve", optionId: "paid-sleeve", optionLabel: "Detailed Sleeve", priceStatus: "exact", priceCents: 1250, personalizedText: null }, { occurrenceKey: "base:shirt:trim", garmentKey: "base:shirt", garmentLabel: "Standard Shirt", selectionGroup: "trim", selectionGroupTitle: "Trim", optionId: "included-trim", optionLabel: "Heritage Trim", priceStatus: "exact", priceCents: 0, personalizedText: null }] },
    { garmentKey: "additional:shirt:1", garmentLabel: "Standard Shirt", occurrences: [{ occurrenceKey: "additional:shirt:1:collar", garmentKey: "additional:shirt:1", garmentLabel: "Standard Shirt", selectionGroup: "collar", selectionGroupTitle: "Collar", optionId: "included-collar", optionLabel: "Soft Collar", priceStatus: "exact", priceCents: null, personalizedText: null }] },
  ],
  aiTryOnSummary: { status: "skipped", label: "Skipped" },
  measurementSummary: { route: "low_risk", routeLabel: "Low risk", unit: "inch", shared: [], byGarment: [] },
  pricingSummary: { status: "exact", garmentConstructionSubtotal: 170, customDetailsExactSubtotal: 12.5, selectedDesignPrice: null },
} as FutureDesignStudioSummary;
const pricingBefore = JSON.stringify(summary.pricingSummary);
const paymentTotalBefore =
  summary.pricingSummary.garmentConstructionSubtotal! +
  summary.pricingSummary.customDetailsExactSubtotal;
let summaryRenderer!: ReturnType<typeof create>;
act(() => {
  summaryRenderer = create(
    <DormantFutureSummaryStep summary={summary} onBack={() => undefined} onEditGarments={() => undefined} onEditFabrics={() => undefined} onEditDesignStyle={() => undefined} onEditCustomDetails={() => undefined} onEditAiTryOn={() => undefined} onEditMeasurements={() => undefined} canContinueToShipping onContinueToShipping={() => undefined} />,
  );
});
const baseConstruction = summaryRenderer.root.findByProps({
  "data-summary-garment-construction": "base:shirt",
});
const addedConstruction = summaryRenderer.root.findByProps({
  "data-summary-garment-construction": "additional:shirt:1",
});
assert.match(text(baseConstruction), /Base Neck.*€85\.00.*Classic Cuff.*Included.*Detailed Sleeve.*€12\.50.*Heritage Trim.*Included/);
assert.match(text(addedConstruction), /Soft Collar.*Included/);
assert.equal(
  (text(baseConstruction).match(/Base Neck/g) || []).length,
  1,
  "a selected base construction option must not be duplicated by Custom Details",
);
assert.ok(
  !text(baseConstruction).includes("Unselected Catalogue Lapel"),
  "the Summary must not invent unselected catalogue options",
);
assert.ok(
  !text(addedConstruction).includes("Detailed Sleeve"),
  "selected custom details remain isolated to their exact garment occurrence",
);
assert.equal(JSON.stringify(summary.pricingSummary), pricingBefore, "Summary presentation must not alter totals");
assert.equal(
  summary.pricingSummary.garmentConstructionSubtotal! +
    summary.pricingSummary.customDetailsExactSubtotal,
  paymentTotalBefore,
  "Summary presentation must not alter the payment total source",
);
act(() => summaryRenderer.unmount());

console.log("PASS: garment assignment presentation");
