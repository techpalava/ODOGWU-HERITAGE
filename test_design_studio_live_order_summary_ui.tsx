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
      editLabel: "Edit base garments",
      lines: [
        {
          id: "construction-base:shirt",
          label: "Shirt",
          detail: "Standard Length Shirt, Mid-Long Sleeve",
          amountLabel: "€70.00",
        },
      ],
      subsections: [
        {
          id: "additional_garments",
          title: "Additional Garments",
          editStage: "custom_details",
          focusGarmentKey: "additional:shirt:1",
          lines: [
            {
              id: "construction-additional:shirt:1",
              label: "Shirt 2",
              detail: "Standard Length Shirt, Short Sleeve",
              supportingDetail: "Fabric: Needs fabric",
              amountLabel: "€65.00",
            },
          ],
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
      subsections: [
        {
          id: "additional_garment_fabrics",
          title: "Additional Garment Fabrics",
          lines: [
            {
              id: "fabric-additional:shirt:1",
              label: "Shirt 2",
              detail: "Needs fabric",
              amountLabel: null,
            },
          ],
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
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments",
  }).length,
  1,
  "authoritative Additional Garment presence renders its Edit independently of transient stage state",
);
assert.ok(textOf(renderer.root).includes("Additional Garments"));
assert.ok(textOf(renderer.root).includes("Fabric: Needs fabric"));
assert.ok(textOf(renderer.root).includes("Additional Garment Fabrics"));
assert.ok(textOf(renderer.root).includes("Needs fabric"));
const additionalGarmentsHeading = renderer.root
  .findByProps({
    "data-testid": "live-order-summary-subsection-additional_garments",
  })
  .findByType("h4");
const additionalGarmentFabricsHeading = renderer.root
  .findByProps({
    "data-testid": "live-order-summary-subsection-additional_garment_fabrics",
  })
  .findByType("h4");
assert.equal(textOf(additionalGarmentsHeading), "Additional Garments");
assert.equal(textOf(additionalGarmentFabricsHeading), "Additional Garment Fabrics");
assert.doesNotMatch(
  String(additionalGarmentsHeading.props.className),
  /(?:^|\s)uppercase(?:\s|$)/,
  "Additional Garments must remain Title Case in the visible summary",
);
assert.doesNotMatch(
  String(additionalGarmentFabricsHeading.props.className),
  /(?:^|\s)uppercase(?:\s|$)/,
  "Additional Garment Fabrics must remain Title Case in the visible summary",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garment_fabrics",
  }).length,
  0,
  "the additional-Fabric clarity subsection does not add a second Edit route",
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
const constructionEdit = renderer.root.findByProps({
  "data-testid": "live-order-summary-edit-construction",
});
const constructionHeader = renderer.root.findByProps({
  "data-testid": "live-order-summary-section-header-construction",
});
const additionalGarmentsEdit = renderer.root.findByProps({
  "data-testid": "live-order-summary-edit-additional_garments",
});
const additionalGarmentsHeader = renderer.root.findByProps({
  "data-testid": "live-order-summary-subsection-header-additional_garments",
});
const fabricsHeading = renderer.root
  .findByProps({ "data-testid": "live-order-summary-section-fabrics" })
  .findByType("h3");
const constructionSubtotalLabel = renderer.root
  .findByProps({ "data-testid": "live-order-summary-construction-subtotal" })
  .findAllByType("p")[0];
assert.match(constructionHeading.props.className, /text-\[15px\]/);
assert.match(constructionHeading.props.className, /font-bold/);
assert.match(constructionHeading.props.className, /text-heritage-green/);
assert.equal(
  constructionHeading.parent,
  constructionEdit.parent,
  "Garment Construction and Edit share one compact header row",
);
assert.equal(
  constructionHeading.parent,
  constructionHeader,
  "the Garment Construction header row is the shared section header container",
);
assert.equal(
  additionalGarmentsHeading.parent,
  additionalGarmentsEdit.parent,
  "Additional Garments and Edit share one compact header row",
);
assert.equal(
  additionalGarmentsHeading.parent,
  additionalGarmentsHeader,
  "the Additional Garments header row is the shared subsection header container",
);
assert.match(constructionHeader.props.className, /items-center/);
assert.match(additionalGarmentsHeader.props.className, /items-center/);
assert.doesNotMatch(constructionEdit.props.className, /min-h-11|min-w-11/);
assert.doesNotMatch(additionalGarmentsEdit.props.className, /min-h-11|min-w-11/);
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
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments",
  }).length,
  1,
  "Additional Garments Edit remains visible while a different summary stage is current",
);

let editedStage: DesignStudioStageId | null = null;
let additionalFocusKey: string | null = null;
const additionalEditRequests: Array<string | null> = [];
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      unlockedStages: new Set<DesignStudioStageId>([
        "garment_type",
        "fabric",
        "custom_details",
        "measurement",
      ]),
      currentStageId: "shipping",
      onEditStage: (stage, options) => {
        editedStage = stage;
        additionalFocusKey = options?.focusAdditionalGarmentKey || null;
        if (stage === "custom_details") {
          additionalEditRequests.push(
            options?.focusAdditionalGarmentKey || null,
          );
        }
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
act(() => {
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-construction" })
    .props.onClick();
});
assert.equal(editedStage, "garment_type");
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments",
    })
    .props.onClick();
});
assert.equal(editedStage, "custom_details");
assert.equal(
  additionalFocusKey,
  "additional:shirt:1",
  "Additional Garments Edit passes its exact repair occurrence to Step 4",
);
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments",
    })
    .props.onClick();
});
assert.deepEqual(
  additionalEditRequests,
  ["additional:shirt:1", "additional:shirt:1"],
  "repeated Additional Garments Edit clicks issue repeatable exact-occurrence requests",
);
assert.equal(
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-construction" })
    .props["aria-label"],
  "Edit base garments",
  "the existing Garment Construction control remains explicitly base-owned",
);

act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: sampleView,
      unlockedStages: new Set<DesignStudioStageId>(["custom_details"]),
      currentStageId: "custom_details",
      onEditStage: () => undefined,
    }),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments",
  }).length,
  1,
  "Additional Garments Edit remains visible when Step 4 is the current stage",
);

const completeAdditionalView: LiveOrderSummaryView = {
  ...sampleView,
  sections: sampleView.sections.map((section) =>
    section.id === "construction"
      ? {
          ...section,
          subsections: section.subsections?.map((subsection) =>
            subsection.id === "additional_garments"
              ? { ...subsection, focusGarmentKey: null }
              : subsection,
          ),
        }
      : section,
  ),
};
let sectionLevelEditStage: DesignStudioStageId | null = null;
let sectionLevelFocusKey: string | null | undefined;
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: completeAdditionalView,
      unlockedStages: new Set<DesignStudioStageId>(["custom_details"]),
      currentStageId: "custom_details",
      onEditStage: (stage, options) => {
        sectionLevelEditStage = stage;
        sectionLevelFocusKey = options?.focusAdditionalGarmentKey;
      },
    }),
  );
});
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments",
    })
    .props.onClick();
});
assert.equal(sectionLevelEditStage, "custom_details");
assert.equal(
  sectionLevelFocusKey,
  null,
  "complete additions use the Step 4 Additional Garment management section target",
);

const baseOnlyView: LiveOrderSummaryView = {
  ...sampleView,
  sections: sampleView.sections.map((section) =>
    section.id === "construction" || section.id === "fabrics"
      ? { ...section, subsections: undefined }
      : section,
  ),
};
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: baseOnlyView,
      unlockedStages: new Set<DesignStudioStageId>(["custom_details"]),
      currentStageId: "shipping",
      onEditStage: () => undefined,
    }),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments",
  }).length,
  0,
  "base-only orders render neither an Additional Garments heading nor its Edit control",
);

const viewSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(viewSource, /showShellLiveOrderSummary/);
assert.match(viewSource, /embedPersistentLiveOrderSummary/);
assert.match(
  viewSource,
  /futureAdditionalGarmentNavigationRequestIdRef\.current \+= 1/,
  "Additional Edit creates a new navigation request even when Step 4 is already active",
);
assert.match(
  viewSource,
  /setFutureAdditionalGarmentNavigationRequestId/,
  "Additional Edit forwards the distinct navigation request to Step 4",
);
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

const emptySummaryView: LiveOrderSummaryView = {
  sections: [],
  totalStatus: "hidden",
  totalLabel: "",
  totalValueLabel: "",
  totalAmountCents: null,
  quoteRequired: false,
};
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: emptySummaryView,
      unlockedStages: new Set<DesignStudioStageId>(),
    }),
  );
});
const emptyMarkup = textOf(renderer.root);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-total",
  }).length,
  0,
);
assert.ok(!emptyMarkup.includes("Pending"));
assert.ok(!emptyMarkup.includes("Current Subtotal"));
assert.ok(!emptyMarkup.includes("€0.00"));
assert.ok(emptyMarkup.includes(LIVE_ORDER_SUMMARY_HEADING));

console.log("test_design_studio_live_order_summary_ui.tsx: all assertions passed");
