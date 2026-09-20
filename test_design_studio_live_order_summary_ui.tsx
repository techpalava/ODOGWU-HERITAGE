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
          editStage: "personalized_additions",
          focusGarmentKey: "additional:shirt:1",
          lines: [
            {
              id: "construction-additional:shirt:1",
              label: "Shirt 2",
              detail: "Standard Length Shirt, Short Sleeve",
              supportingDetail: "Fabric: Needs fabric",
              amountLabel: "€65.00",
              focusGarmentKey: "additional:shirt:1",
            },
          ],
        },
      ],
      footer: {
        id: "construction-subtotal",
        label: "Garment Subtotal",
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
      id: "design_style",
      title: "Design Style",
      editStage: "design_style",
      lines: [
        {
          id: "design-style-base:shirt",
          label: "Standard Shirt",
          detail: "Casual Native",
          imageUrl: "https://example.invalid/casual-native.jpg",
          constructionOptions: [
            { id: "base-shirt-length", label: "Standard Length Shirt", amountLabel: "Included" },
            { id: "base-shirt-sleeve", label: "Short Sleeve", amountLabel: "Included" },
            { id: "base-shirt-pocket", label: "No Pockets", amountLabel: "Included" },
            { id: "base-shirt-cuff", label: "Detailed Cuff", amountLabel: "€12.50" },
          ],
          amountLabel: null,
        },
        {
          id: "design-style-base:trouser",
          label: "Trouser",
          detail: "Casual Native",
          imageUrl: "https://example.invalid/casual-native-trouser.jpg",
          constructionOptions: [
            { id: "base-trouser-fit", label: "Straight Trouser Fit", amountLabel: "Included" },
          ],
          amountLabel: null,
        },
        {
          id: "design-style-additional:shirt:1",
          label: "Standard Shirt 2",
          detail: "Geometric Print Shirt Set",
          imageUrl: "https://example.invalid/geometric-shirt.jpg",
          constructionOptions: [
            { id: "additional-shirt-length", label: "Standard Length Shirt", amountLabel: "Included" },
          ],
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
  costBreakdown: {
    subtotal: {
      label: "Order Subtotal",
      valueLabel: "€220.00",
      amountCents: 22000,
    },
    shipping: {
      label: "Shipping",
      valueLabel: "€25.00",
      amountCents: 2500,
    },
  },
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
      unlockedStages: new Set<DesignStudioStageId>([
        "garment_type",
        "fabric",
        "custom_details",
      ]),
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

const architectureView: LiveOrderSummaryView = {
  sections: [
    {
      id: "construction",
      title: "Garments Ordered",
      editStage: "garment_type",
      lines: [
        { id: "construction-base:shirt", label: "Standard Shirt", detail: null, amountLabel: "€65.00" },
        { id: "construction-base:trouser", label: "Trouser", detail: null, amountLabel: "€75.00" },
      ],
      subsections: [{
        id: "additional_garments",
        title: "Additional Garments",
        editStage: "personalized_additions",
        focusGarmentKey: "additional:shirt:1",
        lines: [{ id: "construction-additional:shirt:1", label: "Standard Shirt 2", detail: null, amountLabel: "€70.00", focusGarmentKey: "additional:shirt:1" }],
      }],
      footer: { id: "construction-subtotal", label: "Garment Subtotal", amountLabel: "€210.00", amountCents: 21000, note: "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing." },
    },
    {
      id: "personalized_additions",
      title: "Personalized Additions",
      editStage: "personalized_additions",
      lines: [
        { id: "personalized-addition:order-detail:1:Name Monogram", label: "Monogram", detail: "Name Monogram", amountLabel: "€12.00" },
        { id: "personalized-addition:order-detail:2:Embroidery", label: "Embroidery Design", detail: "Embroidery", amountLabel: "€12.00" },
        { id: "personalized-addition:order-detail:3:Traditional Hat", label: "Accessories", detail: "Traditional Hat", amountLabel: "€12.00" },
      ],
    },
    {
      id: "fabrics",
      title: "Fabrics",
      editStage: "fabric",
      lines: [
        { id: "fabric-base:shirt", label: "Standard Shirt", detail: "Ivory Imperial Leaf", amountLabel: null },
        { id: "fabric-base:trouser", label: "Trouser", detail: "Heritage Ivory Lattice", amountLabel: null },
        { id: "fabric-additional:shirt:1", label: "Standard Shirt 2", detail: "Royal Forest Mosaic", amountLabel: null },
      ],
    },
    {
      id: "design_style",
      title: "Design Style",
      editStage: "design_style",
      lines: [
        { id: "design-style-base:shirt", label: "Standard Shirt", detail: "Casual Native", imageUrl: "https://example.invalid/casual-native.jpg", amountLabel: null },
        { id: "design-style-base:trouser", label: "Trouser", detail: "Casual Native", imageUrl: "https://example.invalid/casual-native-trouser.jpg", amountLabel: null },
        { id: "design-style-additional:shirt:1", label: "Standard Shirt 2", detail: "Geometric Print Shirt Set", imageUrl: "https://example.invalid/geometric-shirt.jpg", amountLabel: null },
      ],
    },
    {
      id: "custom_details",
      title: "Construction Options",
      editStage: "custom_details",
      lines: [
        { id: "construction-options-base:shirt", label: "Standard Shirt", detail: null, amountLabel: null, constructionOptions: [
          { id: "shirt-length", label: "Standard Length Shirt", amountLabel: "Included" },
          { id: "shirt-pocket", label: "No Pockets", amountLabel: "Included" },
          { id: "shirt-cuff", label: "Detailed Cuff", amountLabel: "€12.50" },
        ] },
        { id: "construction-options-base:trouser", label: "Trouser", detail: null, amountLabel: null, constructionOptions: [
          { id: "trouser-rope", label: "With Rope", amountLabel: "Included" },
        ] },
        { id: "construction-options-additional:shirt:1", label: "Standard Shirt 2", detail: null, amountLabel: null, constructionOptions: [
          { id: "additional-shirt-length", label: "Standard Length Shirt", amountLabel: "Included" },
        ] },
      ],
    },
    { id: "measurements", title: "Measurements", editStage: "measurement", lines: [{ id: "measurements-complete", label: "Low Risk — Complete", detail: null, amountLabel: null }] },
    { id: "delivery", title: "Delivery & Pickup", editStage: "shipping", lines: [{ id: "delivery-method", label: "Delivery Method", detail: "Pick Up in Eindhoven", amountLabel: null }] },
  ],
  totalStatus: "exact", totalLabel: "Current Total", totalValueLabel: "€222.50", totalAmountCents: 22250, quoteRequired: false,
};
let architectureRenderer: ReturnType<typeof create>;
const architectureEditedStages: DesignStudioStageId[] = [];
act(() => {
  architectureRenderer = create(createElement(DesignStudioOrderSummary, {
    view: architectureView,
    unlockedStages: new Set<DesignStudioStageId>(["garment_type", "fabric", "design_style", "custom_details", "personalized_additions", "measurement", "shipping"]),
    currentStageId: "custom_details",
    onEditStage: (stage) => architectureEditedStages.push(stage),
  }));
});
const architectureSectionIds = architectureRenderer.root.findAll((node) =>
  typeof node.props["data-testid"] === "string" &&
  /^live-order-summary-section-(?!header-)/.test(node.props["data-testid"]),
).map((node) => node.props["data-testid"].replace("live-order-summary-section-", ""));
assert.deepEqual(architectureSectionIds, ["construction", "personalized_additions", "fabrics", "design_style", "custom_details", "measurements", "delivery"]);
assert.equal(
  architectureSectionIds.indexOf("personalized_additions"),
  architectureSectionIds.indexOf("construction") + 1,
  "Personalized Additions renders immediately after Garments Ordered",
);
assert.equal(
  architectureSectionIds.filter((id) => id === "personalized_additions").length,
  1,
  "Personalized Additions is not duplicated later in the Summary card",
);
assert.deepEqual(
  architectureSectionIds.slice(
    architectureSectionIds.indexOf("personalized_additions") + 1,
  ),
  ["fabrics", "design_style", "custom_details", "measurements", "delivery"],
  "unrelated Summary sections keep their existing relative order after Personalized Additions",
);
assert.match(textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-construction" })), /Standard Shirt.*€65\.00.*Trouser.*€75\.00/);
assert.equal(textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-construction" })).includes("Garments Ordered"), true);
assert.equal(architectureRenderer.root.findAllByProps({ "data-line-id": "construction-additional:shirt:1" }).length, 1, "an Additional Garment is shown once in Garments Ordered");
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-construction" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-fabrics" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-design_style" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-custom_details" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-personalized_additions" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-measurements" }).length, 1);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-edit-delivery" }).length, 1);
assert.ok(textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-construction" })).includes("Garment Subtotal"));
assert.ok(!textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-construction" })).includes("Garment Construction Subtotal"));
for (const [sectionId, stage] of [
  ["construction", "garment_type"],
  ["fabrics", "fabric"],
  ["design_style", "design_style"],
  ["custom_details", "custom_details"],
  ["personalized_additions", "personalized_additions"],
  ["measurements", "measurement"],
  ["delivery", "shipping"],
] as const) {
  act(() => {
    architectureRenderer.root
      .findByProps({ "data-testid": `live-order-summary-edit-${sectionId}` })
      .props.onClick();
  });
  assert.equal(architectureEditedStages.at(-1), stage);
}
assert.match(textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-fabrics" })), /Standard Shirt.*Ivory Imperial Leaf.*Trouser.*Heritage Ivory Lattice.*Standard Shirt 2.*Royal Forest Mosaic/);
assert.equal(architectureRenderer.root.findAllByProps({ "data-testid": "live-order-summary-construction-options-design-style-base:shirt" }).length, 0, "Design Style contains identity and Design only");
assert.match(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-design-image-design-style-base:shirt" }).props.className, /h-9 w-9/);
const optionRow = architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-construction-option-construction-options-base:shirt-shirt-cuff" });
assert.match(optionRow.props.className, /grid-cols-\[minmax\(0,1fr\)_auto\]/);
assert.ok(textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-custom_details" })).includes("Included"));
assert.ok(!textOf(architectureRenderer.root.findByProps({ "data-testid": "live-order-summary-section-custom_details" })).includes("€65.00"), "option rows never repeat the garment base price");
assert.match(
  textOf(
    architectureRenderer.root.findByProps({
      "data-testid": "live-order-summary-section-personalized_additions",
    }),
  ),
  /Monogram.*Name Monogram.*€12\.00.*Embroidery Design.*Embroidery.*€12\.00.*Accessories.*Traditional Hat.*€12\.00/,
);
const emptyPersonalizedAdditionsView: LiveOrderSummaryView = {
  ...architectureView,
  sections: architectureView.sections.filter(
    (section) => section.id !== "personalized_additions",
  ),
};
let emptyPersonalizedAdditionsRenderer: ReturnType<typeof create>;
act(() => {
  emptyPersonalizedAdditionsRenderer = create(
    createElement(DesignStudioOrderSummary, {
      view: emptyPersonalizedAdditionsView,
      unlockedStages: new Set<DesignStudioStageId>([
        "garment_type",
        "fabric",
        "design_style",
        "custom_details",
        "personalized_additions",
        "measurement",
        "shipping",
      ]),
      currentStageId: "personalized_additions",
    }),
  );
});
assert.equal(
  emptyPersonalizedAdditionsRenderer!.root.findAllByProps({
    "data-testid": "live-order-summary-section-personalized_additions",
  }).length,
  0,
  "empty Personalized Additions does not create a misleading price section",
);
assert.deepEqual(
  emptyPersonalizedAdditionsRenderer!.root.findAll((node) =>
    typeof node.props["data-testid"] === "string" &&
    /^live-order-summary-section-(?!header-)/.test(node.props["data-testid"]),
  ).map((node) => node.props["data-testid"].replace("live-order-summary-section-", "")),
  ["construction", "fabrics", "design_style", "custom_details", "measurements", "delivery"],
);
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
  /\btext-xl\b/,
);
assert.doesNotMatch(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-total-value",
  }).props.className,
  /\btext-base\b/,
);
assert.equal(
  textOf(renderer.root.findByProps({
    "data-testid": "live-order-summary-order-subtotal",
  })),
  "Order Subtotal€220.00",
);
assert.equal(
  textOf(renderer.root.findByProps({
    "data-testid": "live-order-summary-shipping",
  })),
  "Shipping€25.00",
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-shipping",
  }).findByType("dd").props.className,
  /font-medium/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-total-value",
  }).props.className,
  /font-bold/,
);
assert.ok(textOf(renderer.root).includes("Total"));
assert.ok(textOf(renderer.root).includes("Shirt"));
assert.ok(textOf(renderer.root).includes("Royal Forest Mosaic"));
assert.ok(textOf(renderer.root).includes("€70.00"));
const selectedDesignRow = renderer.root.findByProps({
  "data-line-id": "design-style-base:shirt",
});
assert.equal(
  textOf(selectedDesignRow).includes("Standard Shirt"),
  true,
  "the mounted Summary renders the base garment with its Step 1 customer label",
);
assert.ok(textOf(selectedDesignRow).includes("Casual Native"));
assert.ok(!textOf(selectedDesignRow).includes("Kaftan + Shirt"));
assert.match(textOf(selectedDesignRow), /Standard Length Shirt.*Included.*Short Sleeve.*Included.*No Pockets.*Included.*Detailed Cuff.*€12\.50/);
assert.equal(
  (textOf(selectedDesignRow).match(/Standard Length Shirt/g) || []).length,
  1,
  "the mounted Summary renders each selected base construction option once",
);
assert.equal(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-design-image-design-style-base:shirt",
  }).props.src,
  "https://example.invalid/casual-native.jpg",
);
  assert.equal(
    renderer.root.findByProps({
      "data-testid": "live-order-summary-design-image-design-style-additional:shirt:1",
  }).props.src,
  "https://example.invalid/geometric-shirt.jpg",
    "repeated garment occurrences keep their own selected Design thumbnail",
  );
  const selectedDesignImage = renderer.root.findByProps({
    "data-testid": "live-order-summary-design-image-design-style-base:shirt",
  });
  assert.match(selectedDesignImage.props.className, /h-9 w-9/);

  const constructionOption = renderer.root.findByProps({
    "data-testid":
      "live-order-summary-construction-option-design-style-base:shirt-base-shirt-pocket",
  });
  assert.match(
    constructionOption.props.className,
    /grid-cols-\[minmax\(0,1fr\)_auto\]/,
  );
  const constructionOptionSpans = constructionOption.findAllByType("span");
  assert.match(constructionOptionSpans[0].props.className, /break-words/);
assert.match(constructionOptionSpans[1].props.className, /whitespace-nowrap/);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-garment-group-design-style-base:shirt",
  }).length,
  1,
  "the base garment identity, selected Design, and construction options share one group",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-garment-group-design-style-additional:shirt:1",
  }).length,
  1,
  "the repeated Additional Garment uses the same exact-occurrence group structure",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-garment-group-design-style-base:trouser",
  }).length,
  1,
  "another base garment uses the same compact group structure",
);
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
    "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
  }).length,
  0,
  "Additional Garment Edit stays locked until Step 5 Personalized Additions is enterable",
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
const constructionSubtotalIndex = markup.indexOf("Garment Subtotal");
const inclusionIndex = markup.indexOf(
  "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.",
);
const totalIndex = markup.indexOf("€245.00");
const fabricsIndex = markup.indexOf("Fabrics");
assert.ok(constructionIndex >= 0 && totalIndex > constructionIndex);
assert.ok(
  constructionSubtotalIndex > constructionIndex,
  "Garment Subtotal must sit inside Garment Construction",
);
assert.ok(
  inclusionIndex > constructionSubtotalIndex,
  "inclusion note must sit beneath Garment Subtotal",
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
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /lg:max-h-\[calc\(100dvh-7rem\)\]/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-content",
  }).props.className,
  /lg:overflow-y-auto/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-content",
  }).props.className,
  /lg:overflow-x-hidden/,
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
  additionalGarmentsHeader,
  "the Additional Garments header row is the shared subsection header container",
);
assert.match(constructionHeader.props.className, /items-center/);
assert.match(additionalGarmentsHeader.props.className, /items-center/);
assert.doesNotMatch(constructionEdit.props.className, /min-h-11|min-w-11/);
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
  1,
  "Edit for the current reached stage remains available",
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
  }).length,
  0,
  "Additional Garments Edit cannot jump ahead before Step 5 Personalized Additions has been reached",
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
        "design_style",
        "custom_details",
        "personalized_additions",
        "measurement",
        "shipping",
      ]),
      currentStageId: "shipping",
      onEditStage: (stage, options) => {
        editedStage = stage;
        additionalFocusKey = options?.focusAdditionalGarmentKey || null;
        if (stage === "personalized_additions") {
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
    .findByProps({ "data-testid": "live-order-summary-edit-design_style" })
    .props.onClick();
});
assert.equal(editedStage, "design_style");
act(() => {
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-measurements" })
    .props.onClick();
});
assert.equal(editedStage, "measurement");
act(() => {
  renderer.root
    .findByProps({ "data-testid": "live-order-summary-edit-delivery" })
    .props.onClick();
});
assert.equal(editedStage, "shipping");
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
    })
    .props.onClick();
});
assert.equal(editedStage, "personalized_additions");
assert.equal(
  additionalFocusKey,
  "additional:shirt:1",
  "Additional Garments Edit passes its exact repair occurrence to Step 5",
);
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
    })
    .props.onClick();
});
assert.deepEqual(
  additionalEditRequests,
  ["additional:shirt:1", "additional:shirt:1"],
  "repeated Additional Garments Edit clicks issue repeatable exact-occurrence requests",
);
const multipleAdditionalView: LiveOrderSummaryView = {
  ...sampleView,
  sections: sampleView.sections.map((section) =>
    section.id === "construction"
      ? {
          ...section,
          subsections: section.subsections?.map((subsection) =>
            subsection.id === "additional_garments"
              ? {
                  ...subsection,
                  lines: [
                    ...subsection.lines,
                    {
                      id: "construction-additional:shirt:2",
                      label: "Shirt 3",
                      detail: "Standard Length Shirt, Long Sleeve",
                      amountLabel: "€65.00",
                      focusGarmentKey: "additional:shirt:2",
                    },
                  ],
                }
              : subsection,
          ),
        }
      : section,
  ),
};
act(() => {
  renderer.update(
    createElement(DesignStudioOrderSummary, {
      view: multipleAdditionalView,
      unlockedStages: new Set<DesignStudioStageId>([
        "garment_type",
        "custom_details",
        "personalized_additions",
      ]),
      currentStageId: "shipping",
      onEditStage: (stage, options) => {
        editedStage = stage;
        additionalFocusKey = options?.focusAdditionalGarmentKey || null;
      },
    }),
  );
});
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:2",
    })
    .props.onClick();
});
assert.equal(editedStage, "personalized_additions");
assert.equal(
  additionalFocusKey,
  "additional:shirt:2",
  "each Additional Garment Edit retains its own exact occurrence identity",
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
      unlockedStages: new Set<DesignStudioStageId>(["personalized_additions"]),
      currentStageId: "personalized_additions",
      onEditStage: (stage, options) => {
        editedStage = stage;
        additionalFocusKey = options?.focusAdditionalGarmentKey || null;
      },
    }),
  );
});
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
  }).length,
  1,
  "Additional Garments Edit remains available while the authorized Step 5 is current",
);
act(() => {
  renderer.root
    .findByProps({
      "data-testid": "live-order-summary-edit-additional_garments-additional:shirt:1",
    })
    .props.onClick();
});
assert.equal(editedStage, "personalized_additions");
assert.equal(
  additionalFocusKey,
  "additional:shirt:1",
  "the current Step 5 Additional Garment Edit retains its exact occurrence key",
);

const completeAdditionalView: LiveOrderSummaryView = {
  ...sampleView,
  sections: sampleView.sections.map((section) =>
    section.id === "construction"
      ? {
          ...section,
          subsections: section.subsections?.map((subsection) =>
            subsection.id === "additional_garments"
              ? {
                  ...subsection,
                  focusGarmentKey: null,
                  lines: subsection.lines.map((line) => ({
                    ...line,
                    focusGarmentKey: null,
                  })),
                }
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
      unlockedStages: new Set<DesignStudioStageId>(["personalized_additions"]),
      currentStageId: "shipping",
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
assert.equal(sectionLevelEditStage, "personalized_additions");
assert.equal(
  sectionLevelFocusKey,
  null,
  "complete additions use the Step 5 Additional Garment management section target",
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
  "Additional Edit creates a new navigation request even when Step 5 is already active",
);
assert.match(
  viewSource,
  /setFutureAdditionalGarmentNavigationRequestId/,
  "Additional Edit forwards the distinct navigation request to Step 5",
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
assert.match(summarySource, /lg:max-h-\[calc\(100dvh-7rem\)\]/);
assert.match(summarySource, /lg:overflow-y-auto/);
assert.match(summarySource, /lg:overflow-x-hidden/);
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
const mountedSummarySource = readFileSync(
  new URL("./src/components/DesignStudioOrderSummary.tsx", import.meta.url),
  "utf8",
);
assert.match(
  mountedSummarySource,
  /useEffect\(\(\) => \{[\s\S]*scrollTop = 0/,
  "entering Summary returns its own internal scroll region to the first garment",
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
        label: "Garment Subtotal",
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
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-sidebar",
  }).props.className,
  /lg:max-h-\[/,
);
assert.match(
  renderer.root.findByProps({
    "data-testid": "live-order-summary-content",
  }).props.className,
  /lg:overflow-y-auto/,
);

const shortsLines = [
  { id: "construction-base:standard_shorts", label: "Nikka / Standard Shorts", detail: "With Rope", amountLabel: "€70.00" },
  { id: "construction-base:bum_shorts", label: "Bum Shorts", detail: "With Rope", amountLabel: "€70.00" },
];
const shortsView: LiveOrderSummaryView = {
  ...sampleView,
  sections: [{
    ...sampleView.sections[0],
    lines: shortsLines,
    subsections: [{
      id: "additional_garments",
      title: "Additional Garments",
      lines: shortsLines.map((line) => ({ ...line, id: `${line.id}:2`, label: `${line.label} 2` })),
    }],
    footer: { ...sampleView.sections[0].footer!, amountCents: 28000, amountLabel: "€280.00" },
  }],
  totalAmountCents: 28000,
  totalValueLabel: "€280.00",
};
const shortsViewBefore = JSON.stringify(shortsView);
act(() => renderer.update(createElement(DesignStudioOrderSummary, {
  view: shortsView,
  unlockedStages: new Set<DesignStudioStageId>(),
  currentStageId: "custom_details",
})));
for (const [index, label] of ["Standard Nikka Shorts", "Standard Bum Shorts"].entries()) {
  for (const suffix of ["", ":2"]) {
    const row = renderer.root.findByProps({ "data-line-id": `${shortsLines[index].id}${suffix}` });
    assert.equal(textOf(row.findAllByType("p")[0]), `${label}${suffix ? " 2" : ""}`);
    assert.ok(textOf(row).includes("With Rope€70.00"));
  }
}
assert.equal(textOf(renderer.root.findByProps({ "data-testid": "live-order-summary-total-value" })), "€280.00");
assert.equal(JSON.stringify(shortsView), shortsViewBefore, "Rendering labels must not mutate order IDs or pricing data");

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
