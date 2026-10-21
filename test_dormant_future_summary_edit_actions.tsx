import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";

const summary: FutureDesignStudioSummary = {
  status: "incomplete",
  blockers: [],
  garmentSummary: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt",
      label: "Shirt",
      role: "main",
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [],
      construction: [],
      constructionTotalCents: 0,
      wearerLabel: null,
      fitLabel: null,
    },
    {
      garmentKey: "base:trouser",
      garmentType: "trouser",
      label: "Trouser",
      role: "main",
      demographic: "male",
      fabricUnits: 1,
      physicalComponents: [],
      construction: [],
      constructionTotalCents: 0,
      wearerLabel: null,
      fitLabel: null,
    },
  ],
  fabricSummary: [
    {
      allocationId: "alloc-1",
      fabricCode: "FAB-1",
      fabricName: "Ankara",
      image: null,
      colorHex: null,
      availability: "available",
      capacityUnits: 2,
      materialPrice: null,
      pricingTreatment: "included_in_garment_construction",
      garments: [
        {
          garmentKey: "base:shirt",
          garmentType: "shirt",
          label: "Shirt",
        },
      ],
    },
  ],
  designStyleSummary: null,
  designStyleOccurrences: [
    {
      garmentKey: "base:shirt",
      occurrenceLabel: "Shirt",
      sourceKind: "catalogue",
      status: "selected",
      name: "Standard Shirt",
      image: null,
      detail: null,
    },
  ],
  customDetailsSummary: [],
  aiTryOnSummary: { status: "skipped", label: "Skipped" },
  measurementSummary: {
    route: "low_risk",
    routeLabel: "Low Risk",
    unit: "cm",
    shared: [],
    byGarment: [],
  },
  pricingSummary: {
    status: "pending",
    garmentConstructionSubtotal: null,
    customDetailsExactSubtotal: 0,
    selectedDesignPrice: null,
  },
};

const html = renderToStaticMarkup(
  <DormantFutureSummaryStep
    summary={summary}
    onBack={() => undefined}
    onEditGarments={() => undefined}
    onEditFabrics={() => undefined}
    onEditDesignStyle={() => undefined}
    onEditCustomDetails={() => undefined}
    onEditAiTryOn={() => undefined}
    onEditMeasurements={() => undefined}
    onEditGarment={() => undefined}
    onChangeGarmentFabric={() => undefined}
    onRemoveGarmentFabric={() => undefined}
    onChangeGarmentDesignStyle={() => undefined}
    onRemoveGarmentDesignStyle={() => undefined}
    onEditGarmentCustomDetails={() => undefined}
    canContinueToShipping={false}
    onContinueToShipping={() => undefined}
    onRequestCancelOrder={() => undefined}
    removalTargets={[
      {
        garmentKey: "base:shirt",
        occurrenceLabel: "Shirt",
        roleLabel: "base garment",
        presentationOrdinal: 1,
        canRequestRemoval: true,
        disabledReason: null,
        accessibleName: "Remove Shirt, base garment",
      },
      {
        garmentKey: "base:trouser",
        occurrenceLabel: "Trouser",
        roleLabel: "base garment",
        presentationOrdinal: 1,
        canRequestRemoval: true,
        disabledReason: null,
        accessibleName: "Remove Trouser, base garment",
      },
    ]}
  />,
);

assert.match(html, /data-summary-cancel-order="true"/);
assert.match(html, /data-summary-edit-garment="base:shirt"/);
assert.match(html, /data-summary-choice-action="change-fabric:base:shirt"/);
assert.match(html, /data-summary-choice-action="remove-fabric:base:shirt"/);
assert.match(html, /data-summary-choice-action="change-style:base:shirt"/);
assert.match(html, /data-summary-choice-action="remove-style:base:shirt"/);
assert.match(html, /data-summary-choice-action="edit-details:base:trouser"/);
// The Fabric/Design Style rows are now jump links with status; Trouser has no Fabric yet.
assert.match(html, /data-summary-garment-jump="fabric:base:trouser" data-summary-jump-status="needed"/);
assert.match(html, /data-summary-garment-jump="fabric:base:shirt" data-summary-jump-status="chosen"/);
assert.match(html, /aria-label="Select Fabric for Trouser" data-summary-choice-action="change-fabric:base:trouser"/);
assert.match(html, /Cancel Order/);

console.log("test_dormant_future_summary_edit_actions.tsx: all assertions passed");
