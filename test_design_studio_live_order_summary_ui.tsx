import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { DesignStudioStageId } from "./src/types";
import type { LiveOrderSummaryView } from "./src/utils/designStudioLiveOrderSummary";
import { LIVE_ORDER_SUMMARY_HEADING } from "./src/utils/designStudioLiveOrderSummary";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { DesignStudioOrderSummary } = await import(
  "./src/components/DesignStudioOrderSummary"
);

const sampleView: LiveOrderSummaryView = {
  sections: [
    {
      id: "construction",
      title: "Garment Construction",
      editStage: "garment_type",
      lines: [
        {
          id: "construction-base:shirt",
          label: "Shirt",
          detail: "Standard Length Shirt, Mid-Long Sleeve",
          amountLabel: "€70.00",
        },
      ],
      footer: {
        id: "construction-subtotal",
        label: "Garment Construction Subtotal",
        amountLabel: "€70.00",
        amountCents: 7000,
        note: "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.",
      },
    },
    {
      id: "optional_extras",
      title: "Optional Extra Garments",
      editStage: "custom_details",
      lines: [
        {
          id: "additional:shirt:1",
          label: "Shirt 1",
          detail: "Imperial Sapphire Link · Standard Length Shirt, Mid-Long Sleeve",
          amountLabel: "€70.00",
        },
      ],
    },
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: [
        {
          id: "fabric-base:shirt",
          label: "Shirt",
          detail: "Royal Forest Mosaic",
          amountLabel: null,
        },
      ],
    },
    {
      id: "measurements",
      title: "Measurements",
      editStage: "measurement",
      lines: [
        {
          id: "measurements-complete",
          label: "Mid Risk — Complete",
          detail: null,
          amountLabel: null,
        },
      ],
    },
    {
      id: "delivery",
      title: "Delivery & Pickup",
      editStage: "shipping",
      lines: [
        {
          id: "Delivery Method",
          label: "Delivery Method",
          detail: "Pick Up in Eindhoven",
          amountLabel: null,
        },
      ],
    },
  ],
  totalStatus: "exact",
  totalLabel: "Total",
  totalValueLabel: "€245.00",
  totalAmountCents: 24500,
  quoteRequired: false,
};

const textOf = (node: { children?: unknown[] } | string | null): string => {
  if (typeof node === "string") return node;
  if (!node?.children) return "";
  return node.children
    .map((child) => textOf(child as { children?: unknown[] } | string))
    .join("");
};

let renderer: ReturnType<typeof create>;
act(() => {
  renderer = create(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      unlockedStages: new Set<DesignStudioStageId>(["garment_type", "fabric"]),
      currentStageId: "design_style",
      onEditStage: () => undefined,
    }),
  );
});

assert.equal(
  renderer.root.findAllByProps({ "data-testid": "live-order-summary-sidebar" })
    .length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({ "data-testid": "live-order-summary-drawer" })
    .length,
  0,
);
assert.ok(textOf(renderer.root).includes(LIVE_ORDER_SUMMARY_HEADING));
assert.ok(!textOf(renderer.root).includes("Your Order Summary"));
assert.ok(!textOf(renderer.root).includes("Live Price Summary"));
assert.equal(
  textOf(
    renderer.root.findByProps({
      "data-testid": "live-order-summary-total-value",
    }),
  ),
  "€245.00",
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-total-value",
  }).props.className,
  /\btext-base\b/,
);
assert.doesNotMatch(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-total-value",
  }).props.className,
  /\btext-2xl\b/,
);
assert.ok(textOf(renderer.root).includes("Total"));
assert.ok(textOf(renderer.root).includes("Shirt"));
assert.ok(textOf(renderer.root).includes("Royal Forest Mosaic"));
assert.ok(textOf(renderer.root).includes("€70.00"));
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-fabrics",
  }).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-measurements",
  }).length,
  0,
  "locked Measurement Edit must stay hidden",
);

const markup = textOf(renderer.root);
const constructionIndex = markup.indexOf("Garment Construction");
const constructionSubtotalIndex = markup.indexOf("Garment Construction Subtotal");
const inclusionIndex = markup.indexOf(
  "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.",
);
const totalIndex = markup.indexOf("€245.00");
const fabricsIndex = markup.indexOf("Fabrics");
assert.ok(constructionIndex >= 0 && totalIndex > constructionIndex);
assert.ok(
  constructionSubtotalIndex > constructionIndex,
  "Garment Construction Subtotal must sit inside Garment Construction",
);
assert.ok(
  inclusionIndex > constructionSubtotalIndex,
  "inclusion note must sit beneath Garment Construction Subtotal",
);
assert.equal(
  (
    markup.match(
      /Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing\./g,
    ) || []
  ).length,
  1,
);
assert.ok(!markup.includes("Lagos → Eindhoven Standard Shipping"));
assert.ok(
  fabricsIndex > constructionSubtotalIndex && fabricsIndex < totalIndex,
  "Fabrics must sit under Order Summary and above the final total",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-construction-subtotal",
  }).length,
  1,
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-construction-inclusion",
  }).length,
  1,
);
assert.equal(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-construction-subtotal",
  }).props["data-subtotal-cents"],
  7000,
);
assert.doesNotMatch(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /overflow-y-auto|max-h-\[/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /lg:sticky/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /lg:top-24/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /lg:self-start/,
);
assert.doesNotMatch(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /(?:^|\s)(?:sticky|fixed)(?:\s|$)/,
);

const constructionHeading = renderer.root
  .findByProps({ "data-testid": "live-order-summary-section-construction" })
  .findByType("h3");
const fabricsHeading = renderer.root
  .findByProps({ "data-testid": "live-order-summary-section-fabrics" })
  .findByType("h3");
const constructionSubtotalLabel = renderer.root
  .findByProps({ "data-testid": "live-order-summary-construction-subtotal" })
  .findAllByType("p")[0];
assert.match(constructionHeading.props.className, /text-\[15px\]/);
assert.match(constructionHeading.props.className, /font-bold/);
assert.match(constructionHeading.props.className, /text-heritage-green/);
assert.match(fabricsHeading.props.className, /text-\[15px\]/);
assert.match(fabricsHeading.props.className, /font-bold/);
assert.match(fabricsHeading.props.className, /text-heritage-green/);
assert.match(constructionSubtotalLabel.props.className, /text-\[13px\]/);
assert.match(constructionSubtotalLabel.props.className, /font-semibold/);
assert.doesNotMatch(constructionSubtotalLabel.props.className, /text-\[15px\]/);
assert.doesNotMatch(
  constructionSubtotalLabel.props.className,
  /text-heritage-green/,
);
assert.doesNotMatch(
  constructionHeading.props.className,
  /text-\[10px\]|text-\[13px\]/,
);

act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      unlockedStages: new Set<DesignStudioStageId>(["fabric"]),
      currentStageId: "fabric",
      onEditStage: () => undefined,
    }),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-fabrics",
  }).length,
  0,
  "Edit for the current stage stays hidden",
);

let editedStage: DesignStudioStageId | null = null;
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      unlockedStages: new Set<DesignStudioStageId>(["fabric", "measurement"]),
      currentStageId: "shipping",
      onEditStage: (stage) => {
        editedStage = stage;
      },
    }),
  );
});
act(() => {
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-fabrics" })
    .props.onClick();
});
assert.equal(editedStage, "fabric");

const viewSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(viewSource, /showShellLiveOrderSummary/);
assert.match(viewSource, /embedPersistentLiveOrderSummary/);
assert.doesNotMatch(viewSource, /lg:max-h-\[calc\(100vh-2rem\)\]/);
assert.doesNotMatch(viewSource, /lg:overflow-y-auto/);
assert.doesNotMatch(viewSource, /position:\s*fixed/);
assert.doesNotMatch(viewSource, /DesignStudioOrderSummaryTrigger/);
assert.doesNotMatch(viewSource, /mobileSummaryOpen/);
assert.doesNotMatch(viewSource, /Your Order Summary/);
assert.doesNotMatch(viewSource, /live-order-summary-view-order/);

const summarySource = readFileSync(
  new URL("./src/components/DesignStudioOrderSummary.tsx", import.meta.url),
  "utf8",
);
assert.match(summarySource, /LIVE_ORDER_SUMMARY_HEADING/);
assert.match(summarySource, /text-base/);
assert.match(summarySource, /lg:sticky/);
assert.match(summarySource, /lg:top-24/);
assert.match(summarySource, /lg:self-start/);
assert.match(summarySource, /text-\[15px\] font-bold leading-snug text-heritage-green/);
assert.doesNotMatch(summarySource, /text-2xl/);
assert.doesNotMatch(summarySource, /overflow-y-auto/);
assert.doesNotMatch(summarySource, /max-h-\[calc/);
assert.doesNotMatch(summarySource, /(?:^|\s)fixed(?:\s|$)/m);
assert.doesNotMatch(summarySource, /live-order-summary-drawer/);
assert.doesNotMatch(summarySource, /View Order/);
assert.match(summarySource, /<aside/);

const { GarmentTypeStep } = await import("./src/components/GarmentTypeStep");
const { SEED_CUSTOM_DETAIL_CATALOG } = await import(
  "./src/config/GarmentDetailsConfig"
);
const { normalizeCustomDetailCatalog } = await import(
  "./src/utils/catalogHelpers"
);
const step1Catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
let step1SummaryRenderer!: ReturnType<typeof create>;
act(() => {
  step1SummaryRenderer = create(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: ["shirt"],
      selectedDemographics: ["male"],
      normalizedCustomDetailCatalog: step1Catalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
      orderSummary: createElement(DesignStudioOrderSummary, {
        view: sampleView,
        unlockedStages: new Set<DesignStudioStageId>(),
      }),
    }),
  );
});
const step1Asides = step1SummaryRenderer.root.findAllByType("aside");
const step1OrderSummaryLandmarks = step1Asides.filter((node) => {
  const label = String(node.props["aria-label"] || "");
  const labelledBy = String(node.props["aria-labelledby"] || "");
  const testId = String(node.props["data-testid"] || "");
  return (
    label === "Order Summary" ||
    labelledBy === "live-order-summary-heading" ||
    testId === "live-order-summary-sidebar"
  );
});
assert.equal(
  step1OrderSummaryLandmarks.length,
  1,
  "Step 1 must expose exactly one Order Summary complementary landmark.",
);
assert.equal(
  step1Asides.filter((node) => node.props["aria-label"] === "Order Summary")
    .length,
  0,
  "The parent must not add a second identically named Order Summary landmark.",
);

const garmentTypeSource = readFileSync(
  new URL("./src/components/GarmentTypeStep.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  garmentTypeSource,
  /aria-label="Order Summary"[\s\S]{0,80}\{orderSummary/,
);
const customDetailsSource = readFileSync(
  new URL("./src/components/DormantFutureCustomDetailsStep.tsx", import.meta.url),
  "utf8",
);
assert.match(
  customDetailsSource,
  /orderSummary \? \(\s*<div className="mt-5 min-w-0 lg:mt-0/,
);

const manyItemsView: LiveOrderSummaryView = {
  sections: [
    {
      id: "construction",
      title: "Garment Construction",
      editStage: "garment_type",
      lines: [
        { id: "construction-base:shirt", label: "Shirt", detail: null, amountLabel: "€65.00" },
        { id: "construction-base:trouser", label: "Trouser", detail: null, amountLabel: "€75.00" },
        { id: "construction-base:dress", label: "Dress", detail: "Additional net", amountLabel: "€90.00" },
      ],
      footer: {
        id: "construction-subtotal",
        label: "Garment Construction Subtotal",
        amountLabel: "€230.00",
        amountCents: 23000,
        note: "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.",
      },
    },
    {
      id: "optional_extras",
      title: "Optional Extra Garments",
      editStage: "custom_details",
      lines: [
        {
          id: "additional:shirt:1",
          label: "Shirt 1",
          detail: "Imperial Sapphire Link · Standard",
          amountLabel: "€35.00",
        },
        {
          id: "additional:shirt:2",
          label: "Shirt 2",
          detail: "Golden Heritage Weave · Standard",
          amountLabel: "€35.00",
        },
      ],
    },
    {
      id: "additional_clothes",
      title: "Additional Clothes Costs",
      editStage: "custom_details",
      lines: [
        {
          id: "dress-net",
          label: "Net overlay",
          detail: "Dress",
          amountLabel: "€25.00",
        },
      ],
    },
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: [
        { id: "fabric-base:shirt", label: "Shirt", detail: "Royal Forest Mosaic", amountLabel: null },
        { id: "fabric-base:trouser", label: "Trouser", detail: "Royal Forest Mosaic", amountLabel: null },
        { id: "fabric-base:dress", label: "Dress", detail: "Imperial Sapphire Link", amountLabel: null },
        { id: "fabric-additional:shirt:1", label: "Shirt 1", detail: "Imperial Sapphire Link", amountLabel: null },
        { id: "fabric-additional:shirt:2", label: "Shirt 2", detail: "Golden Heritage Weave", amountLabel: null },
      ],
    },
    {
      id: "measurements",
      title: "Measurements",
      editStage: "measurement",
      lines: [
        { id: "measurements-complete", label: "Low Risk — Complete", detail: null, amountLabel: null },
      ],
    },
    {
      id: "delivery",
      title: "Delivery & Pickup",
      editStage: "shipping",
      lines: [
        { id: "Delivery Method", label: "Delivery Method", detail: "Pick Up in Eindhoven", amountLabel: null },
      ],
    },
  ],
  totalStatus: "exact",
  totalLabel: "Total",
  totalValueLabel: "€325.00",
  totalAmountCents: 32500,
  quoteRequired: false,
};

act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: manyItemsView,
      unlockedStages: new Set<DesignStudioStageId>(),
    }),
  );
});
const manyMarkup = textOf(renderer.root);
assert.ok(manyMarkup.includes("Shirt"));
assert.ok(manyMarkup.includes("Trouser"));
assert.ok(manyMarkup.includes("Dress"));
assert.ok(manyMarkup.includes("Shirt 1"));
assert.ok(manyMarkup.includes("Shirt 2"));
assert.ok(manyMarkup.includes("Royal Forest Mosaic"));
assert.ok(manyMarkup.includes("Imperial Sapphire Link"));
assert.ok(manyMarkup.includes("Golden Heritage Weave"));
assert.ok(manyMarkup.includes("Net overlay"));
assert.ok(manyMarkup.includes("Low Risk — Complete"));
assert.ok(manyMarkup.includes("Pick Up in Eindhoven"));
assert.ok(manyMarkup.includes("€230.00"));
assert.ok(manyMarkup.includes("€325.00"));
assert.ok(!manyMarkup.includes("Not selected yet"));
assert.ok(!manyMarkup.includes("Not completed yet"));
assert.ok(!manyMarkup.includes("Lagos → Eindhoven Standard Shipping"));
assert.doesNotMatch(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /overflow-y-auto|max-h-\[/,
);

console.log("test_design_studio_live_order_summary_ui.tsx: all assertions passed");
