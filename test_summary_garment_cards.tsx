/**
 * Stage 8 Summary Garments section: garment cards, grouped by person.
 * - Each card: Step 1 reference photo (labelled), type + role line, name,
 *   construction + this garment's Custom Details with prices, and jump links
 *   Fabric / Design Style / Custom Details (n) with chosen / needed status.
 * - 2+ wearers: one person block each (initial, name, count), then an
 *   Unassigned block. One wearer or solo: plain cards, never "Person 1".
 * - Dropped from the card: Fabric and Design Style rows with names, fabric
 *   capacity line, Custom Details count row, fit chip, wearer chip.
 * - Kept: per-garment Edit / Remove, fabric and design Change / Remove,
 *   Edit Custom Details, Components, header Edit Garments, and every section
 *   below (Fabrics, Design Style, Custom Details, AI Try-on, Measurements,
 *   Cost Breakdown).
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type { FutureGarmentRemovalTarget } from "./src/components/FutureGarmentRemovalConfirmationDialog";
import type {
  FutureDesignStudioSummary,
  FutureSummaryGarment,
  FutureSummaryWearerMeasurements,
} from "./src/utils/designStudioFutureSummary";
import {
  formatSummaryGarmentTypeRoleLine,
  getSummaryGarmentReferenceImage,
  groupSummaryGarmentsByWearer,
} from "./src/utils/summaryGarmentGroups";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const garment = (
  garmentKey: string,
  garmentType: FutureSummaryGarment["garmentType"],
  label: string,
  overrides: Partial<FutureSummaryGarment> = {},
): FutureSummaryGarment => ({
  garmentKey,
  garmentType,
  label,
  role: "main",
  demographic: "male",
  fabricUnits: 1,
  physicalComponents: [],
  construction: [
    { componentKey: `${garmentKey}:base`, selectionGroup: "length", optionId: `${garmentKey}-len`, label: `${label} base`, priceCents: 6500 },
    { componentKey: `${garmentKey}:collar`, selectionGroup: "collar", optionId: `${garmentKey}-col`, label: "Vertical Collar, Round Neck", priceCents: 0 },
  ],
  constructionTotalCents: 6500,
  wearerLabel: null,
  fitLabel: null,
  ...overrides,
});

const wearerGroup = (
  wearerId: string,
  displayName: string,
  garmentKeys: string[],
): FutureSummaryWearerMeasurements => ({
  wearerId,
  displayName,
  garmentKeys,
  route: "low_risk",
  routeLabel: "Low Risk",
  unit: "cm",
  status: "complete",
  shared: [],
  byGarment: [],
});

const shirt = garment("base:shirt", "shirt", "Standard Shirt");
const trouser = garment("base:trouser", "trouser", "Trouser");

const baseSummary = (overrides: Partial<FutureDesignStudioSummary> = {}): FutureDesignStudioSummary => ({
  status: "ready",
  blockers: [],
  garmentSummary: [shirt, trouser],
  fabricSummary: [
    {
      allocationId: "alloc-1",
      fabricCode: "ANK-0142",
      fabricName: "Emerald Adire Ankara",
      image: null,
      colorHex: "#1f5a43",
      availability: "available",
      capacityUnits: 2,
      materialPrice: 0,
      pricingTreatment: "included_in_garment_construction",
      garments: [{ garmentKey: "base:shirt", garmentType: "shirt", label: "Standard Shirt" }],
    },
  ],
  designStyleSummary: null,
  designStyleOccurrences: [
    { garmentKey: "base:shirt", occurrenceLabel: "Standard Shirt", sourceKind: "catalogue", status: "selected", name: "Royal Senator", image: null, detail: null },
    { garmentKey: "base:trouser", occurrenceLabel: "Trouser", sourceKind: "unassigned", status: "unassigned", name: "", image: null, detail: null },
  ],
  customDetailsSummary: [
    {
      garmentKey: "base:shirt",
      garmentLabel: "Standard Shirt",
      occurrences: [
        {
          occurrenceKey: "cd-monogram",
          garmentKey: "base:shirt",
          garmentLabel: "Standard Shirt",
          selectionGroup: "decorative",
          selectionGroupTitle: "Personalised Additions",
          optionId: "Name Monogram",
          optionLabel: "Name Monogram “ADEBAYO”, Left Chest",
          priceStatus: "exact",
          priceCents: 1200,
          personalizedText: "ADEBAYO",
        },
      ],
    },
  ],
  aiTryOnSummary: { status: "skipped", label: "Skipped" },
  measurementSummary: { route: "low_risk", routeLabel: "Low Risk", unit: "cm", shared: [], byGarment: [] },
  pricingSummary: { status: "exact", garmentConstructionSubtotal: 130, customDetailsExactSubtotal: 12, selectedDesignPrice: null },
  ...overrides,
});

const removalTargets: FutureGarmentRemovalTarget[] = [
  { garmentKey: "base:shirt", occurrenceLabel: "Standard Shirt", roleLabel: "base garment", presentationOrdinal: 1, canRequestRemoval: true, disabledReason: null, accessibleName: "Remove Standard Shirt, base garment" },
  { garmentKey: "base:trouser", occurrenceLabel: "Trouser", roleLabel: "base garment", presentationOrdinal: 1, canRequestRemoval: false, disabledReason: "Your order needs at least one garment.", accessibleName: "Remove Trouser, base garment" },
];

type Call = [string, ...unknown[]];
const render = (summary: FutureDesignStudioSummary) => {
  const calls: Call[] = [];
  const jumps: Array<[string | undefined, string, unknown]> = [];
  const record = (name: string) => (...args: unknown[]) => calls.push([name, ...args]);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DormantFutureSummaryStep, {
        summary,
        onBack: record("back"),
        onEditGarments: record("editGarments"),
        onEditFabrics: record("editFabrics"),
        onEditDesignStyle: record("editDesignStyle"),
        onEditCustomDetails: record("editCustomDetails"),
        onEditAiTryOn: record("editAiTryOn"),
        onEditMeasurements: record("editMeasurements"),
        onEditGarment: record("editGarment"),
        onChangeGarmentFabric: record("changeFabric"),
        onRemoveGarmentFabric: record("removeFabric"),
        onChangeGarmentDesignStyle: record("changeStyle"),
        onRemoveGarmentDesignStyle: record("removeStyle"),
        onEditGarmentCustomDetails: record("editDetails"),
        canContinueToShipping: true,
        onContinueToShipping: record("continue"),
        removalTargets,
        onRequestGarmentRemoval: (target, trigger) =>
          calls.push(["requestRemoval", target.garmentKey, trigger]),
      }),
      {
        createNodeMock: (element) => {
          const target = (element.props as Record<string, unknown>)["data-summary-jump-target"] as string | undefined;
          return {
            scrollIntoView: (options: unknown) => jumps.push([target, "scroll", options]),
            focus: (options: unknown) => jumps.push([target, "focus", options]),
          };
        },
      },
    );
  });
  return { renderer, root: renderer.root, calls, jumps };
};

const text = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(text).join("");
const byAttr = (root: ReactTestInstance, attribute: string, value?: string) =>
  root.findAll(
    (node) =>
      typeof node.type === "string" &&
      (value === undefined ? node.props[attribute] !== undefined : node.props[attribute] === value),
  );
const one = (root: ReactTestInstance, attribute: string, value?: string) => {
  const found = byAttr(root, attribute, value);
  assert.equal(found.length, 1, `exactly one [${attribute}${value === undefined ? "" : `=${value}`}]`);
  return found[0];
};
const sectionTitled = (root: ReactTestInstance, title: string) => {
  const heading = root.findAll((node) => node.type === "h3" && text(node) === title)[0];
  let node: ReactTestInstance | null = heading ?? null;
  while (node && node.type !== "section") node = node.parent;
  return node as ReactTestInstance;
};

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------
assert.equal(getSummaryGarmentReferenceImage("shirt")?.src, "/images/garments/ankara-standard-shirt.webp");
assert.equal(getSummaryGarmentReferenceImage("trouser")?.src, "/images/garments/ankara-trouser.webp");
assert.equal(getSummaryGarmentReferenceImage("agbada"), null, "no Step 1 photo for agbada: show the placeholder");
assert.equal(formatSummaryGarmentTypeRoleLine(shirt), "Main garment", "type left out when it only repeats the name");
assert.equal(
  formatSummaryGarmentTypeRoleLine({ garmentType: "shirt", label: "Standard Shirt 2", role: "additional" }),
  "Standard Shirt · Additional garment",
);
assert.equal(groupSummaryGarmentsByWearer(baseSummary()), null, "solo: no person groups");
assert.equal(
  groupSummaryGarmentsByWearer(
    baseSummary({
      measurementSummary: { ...baseSummary().measurementSummary, wearerGroups: [wearerGroup("w-1", "You", ["base:shirt", "base:trouser"])] },
    }),
  ),
  null,
  "one wearer: no person groups",
);

// ---------------------------------------------------------------------------
// 2. Solo: plain cards with photo, role line, construction + details, links
// ---------------------------------------------------------------------------
{
  const { renderer, root, calls, jumps } = render(baseSummary());
  const garmentsSection = sectionTitled(root, "Garments");
  assert.ok(garmentsSection, "Garments section renders");
  assert.equal(byAttr(root, "data-summary-garment-person").length, 0, "solo has no person block");
  const cards = byAttr(garmentsSection, "data-summary-garment-card");
  assert.deepEqual(cards.map((card) => card.props["data-summary-garment-card"]), ["base:shirt", "base:trouser"]);

  // Reference photo, labelled as reference only.
  const photo = one(root, "data-summary-garment-reference", "base:shirt");
  assert.equal(photo.type, "figure");
  assert.equal(photo.find((node) => node.type === "img").props.src, "/images/garments/ankara-standard-shirt.webp");
  assert.equal(text(photo.find((node) => node.type === "figcaption")), "Reference photo");
  assert.equal(text(one(root, "data-summary-garment-type-role", "base:shirt")), "Main garment");
  const shirtHeading = one(root, "data-garment-removal-row-heading", "base:shirt");
  assert.equal(shirtHeading.type, "h4");
  assert.equal(text(shirtHeading), "Standard Shirt");

  // Construction + Custom Details with prices stay on the card.
  const shirtCard = cards[0];
  const constructionText = text(one(shirtCard, "data-summary-garment-construction", "base:shirt"));
  assert.match(constructionText, /Standard Shirt base€65\.00/);
  assert.match(constructionText, /Vertical Collar, Round NeckIncluded/);
  assert.match(constructionText, /Name Monogram “ADEBAYO”, Left Chest€12\.00/);

  // Duplicates dropped from the Garments section.
  const garmentsText = text(garmentsSection);
  assert.equal(garmentsText.includes("Emerald Adire Ankara"), false, "fabric name only in Fabrics");
  assert.equal(garmentsText.includes("Royal Senator"), false, "design name only in Design Style");
  assert.equal(/fabric capacity/i.test(garmentsText), false, "no capacity line");
  assert.equal(garmentsText.includes("Fabric: "), false);
  assert.equal(garmentsText.includes("Design Style: "), false);
  assert.equal(garmentsText.includes("Custom Details: "), false);
  assert.equal(garmentsText.includes("None added"), false);
  assert.equal(/\b1 selected\b/.test(garmentsText), false);
  assert.equal(byAttr(root, "data-summary-garment-fit").length, 0);
  assert.equal(byAttr(root, "data-summary-garment-wearer").length, 0);

  // Jump links and their status.
  const status = (id: string) => one(root, "data-summary-garment-jump", id).props["data-summary-jump-status"];
  assert.equal(status("fabric:base:shirt"), "chosen");
  assert.equal(status("fabric:base:trouser"), "needed");
  assert.equal(status("design-style:base:shirt"), "chosen");
  assert.equal(status("design-style:base:trouser"), "needed", "unassigned design is still needed");
  assert.equal(status("custom-details:base:shirt"), "chosen");
  assert.equal(status("custom-details:base:trouser"), "none", "optional and none chosen: no tick, no !");
  assert.equal(text(one(root, "data-summary-garment-jump", "custom-details:base:shirt")), "Custom Details (1)");
  assert.equal(text(one(root, "data-summary-garment-jump", "custom-details:base:trouser")), "Custom Details (0)");
  assert.equal(text(one(root, "data-summary-garment-jump", "fabric:base:shirt")), "Fabric");
  assert.equal(
    one(root, "data-summary-garment-jump", "fabric:base:trouser").props["aria-label"],
    "Fabric still needed for Trouser. Go to Fabrics",
  );

  // Fabric / Design Style jump to the sections below; Custom Details to this card's list.
  const fabricsHeading = one(root, "data-summary-jump-target", "fabrics");
  assert.equal(fabricsHeading.type, "h3");
  assert.equal(text(fabricsHeading), "Fabrics");
  assert.equal(fabricsHeading.props.tabIndex, -1);
  assert.equal(text(one(root, "data-summary-jump-target", "design-style")), "Design Style");
  const clickJump = (id: string) => act(() => {
    one(root, "data-summary-garment-jump", id).props.onClick({ stopPropagation() {} });
  });
  clickJump("fabric:base:trouser");
  clickJump("design-style:base:shirt");
  clickJump("custom-details:base:shirt");
  assert.deepEqual(jumps, [
    ["fabrics", "scroll", { behavior: "smooth", block: "start" }],
    ["fabrics", "focus", { preventScroll: true }],
    ["design-style", "scroll", { behavior: "smooth", block: "start" }],
    ["design-style", "focus", { preventScroll: true }],
    ["custom-details:base:shirt", "scroll", { behavior: "smooth", block: "start" }],
    ["custom-details:base:shirt", "focus", { preventScroll: true }],
  ]);
  const inCardTarget = one(shirtCard, "data-summary-jump-target", "custom-details:base:shirt");
  assert.equal(text(inCardTarget), "Garment Construction");
  assert.deepEqual(calls, [], "jump links call no edit handlers");

  // Per-garment Edit / Remove and choice actions are unchanged.
  const press = (attribute: string, value: string) =>
    act(() => {
      one(root, attribute, value).props.onClick({ stopPropagation() {}, currentTarget: `trigger:${value}` });
    });
  press("data-summary-edit-garment", "base:shirt");
  press("data-garment-removal-button", "base:shirt");
  press("data-summary-choice-action", "change-fabric:base:shirt");
  press("data-summary-choice-action", "remove-fabric:base:shirt");
  press("data-summary-choice-action", "change-style:base:shirt");
  press("data-summary-choice-action", "remove-style:base:shirt");
  press("data-summary-choice-action", "edit-details:base:trouser");
  assert.deepEqual(calls, [
    ["editGarment", "base:shirt"],
    ["requestRemoval", "base:shirt", "trigger:base:shirt"],
    ["changeFabric", "base:shirt"],
    ["removeFabric", "base:shirt"],
    ["changeStyle", "base:shirt"],
    ["removeStyle", "base:shirt"],
    ["editDetails", "base:trouser"],
  ]);
  // Tidy 3-row list: each row holds its link and its own actions.
  const choiceList = one(shirtCard, "data-summary-garment-choices", "base:shirt");
  assert.equal(choiceList.type, "ul");
  const rows = choiceList.findAll((node) => node.type === "li");
  assert.deepEqual(rows.map((row) => row.props["data-summary-garment-choice-row"]), ["fabric", "design-style", "custom-details"]);
  const rowActions = (row: ReactTestInstance) =>
    byAttr(row, "data-summary-choice-action").map((node) => node.props["data-summary-choice-action"]);
  assert.deepEqual(rows.map(rowActions), [
    ["change-fabric:base:shirt", "remove-fabric:base:shirt"],
    ["change-style:base:shirt", "remove-style:base:shirt"],
    ["edit-details:base:shirt"],
  ]);
  assert.deepEqual(
    rows.map((row) => byAttr(row, "data-summary-garment-jump").map((node) => node.props["data-summary-garment-jump"])),
    [["fabric:base:shirt"], ["design-style:base:shirt"], ["custom-details:base:shirt"]],
  );
  // Every action is a real button (keyboard reachable) with its own name.
  for (const id of rows.flatMap(rowActions)) {
    const button = one(root, "data-summary-choice-action", id);
    assert.equal(button.type, "button");
    assert.equal(button.props.type, "button");
    assert.ok(String(button.props["aria-label"]).length > 0);
  }
  // Short visible labels beside their jump link; full names for assistive tech.
  const action = (id: string) => one(root, "data-summary-choice-action", id);
  assert.deepEqual(
    [text(action("change-fabric:base:shirt")), action("change-fabric:base:shirt").props["aria-label"]],
    ["Change", "Change Fabric for Standard Shirt"],
  );
  assert.deepEqual(
    [text(action("change-fabric:base:trouser")), action("change-fabric:base:trouser").props["aria-label"]],
    ["Select", "Select Fabric for Trouser"],
  );
  assert.equal(action("remove-fabric:base:shirt").props["aria-label"], "Remove Fabric from Standard Shirt");
  assert.equal(byAttr(root, "data-summary-choice-action", "remove-fabric:base:trouser").length, 0);
  assert.equal(action("change-style:base:trouser").props["aria-label"], "Select Design Style for Trouser");
  assert.equal(action("remove-style:base:shirt").props["aria-label"], "Remove Design Style from Standard Shirt");
  assert.equal(byAttr(root, "data-summary-choice-action", "remove-style:base:trouser").length, 0);
  assert.deepEqual(
    [text(action("edit-details:base:trouser")), action("edit-details:base:trouser").props["aria-label"]],
    ["Edit", "Edit Custom Details for Trouser"],
  );
  assert.equal(one(root, "data-summary-edit-garment", "base:shirt").props["aria-label"], "Edit Standard Shirt");
  // Edit/Remove sit side by side on the name row (no stacked column that
  // pushes the choice rows down and leaves an empty gap on desktop).
  const headerActions = one(root, "data-summary-edit-garment", "base:shirt").parent!;
  assert.ok(!String(headerActions.props.className).includes("flex-col"));
  assert.ok(byAttr(headerActions, "data-garment-removal-button").length === 1);
  const removeShirt = one(root, "data-garment-removal-button", "base:shirt");
  assert.equal(removeShirt.props["aria-label"], "Remove Standard Shirt, base garment");
  assert.equal(removeShirt.props["data-garment-removal-origin-stage"], "summary");
  // Blocked removal reveals its reason instead of requesting removal.
  calls.length = 0;
  press("data-garment-removal-button", "base:trouser");
  assert.deepEqual(calls, []);
  assert.match(text(garmentsSection), /Your order needs at least one garment\./);

  // Header Edit Garments stays.
  const editGarments = garmentsSection.find((node) => node.type === "button" && node.props["aria-label"] === "Edit Garments");
  act(() => editGarments.props.onClick());
  assert.deepEqual(calls.at(-1), ["editGarments"]);

  // Every section below is still rendered, with its own content.
  for (const title of ["Fabrics", "Design Style", "AI Try-on", "Measurements"]) {
    assert.ok(sectionTitled(root, title), `${title} section still renders`);
  }
  assert.match(text(sectionTitled(root, "Fabrics")), /Emerald Adire Ankara/);
  assert.match(text(sectionTitled(root, "Design Style")), /Standard Shirt: Royal Senator/);
  assert.equal(byAttr(root, "data-summary-cost-breakdown").length, 1, "Cost Breakdown still renders");
  for (const label of ["Edit Fabrics", "Edit Design Style", "Edit AI Try-on", "Edit Measurements"]) {
    assert.equal(
      root.findAll((node) => node.type === "button" && node.props["aria-label"] === label).length,
      1,
      `${label} still available`,
    );
  }
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 3. Custom Details "needed", components line, orphaned Custom Details section
// ---------------------------------------------------------------------------
{
  const kaftan = garment("base:kaftan", "kaftan", "Long Shirt", {
    physicalComponents: [
      { garmentKey: "base:kaftan:top", garmentType: "kaftan", label: "Long Shirt" },
      { garmentKey: "base:kaftan:trouser", garmentType: "trouser", label: "Trouser" },
    ],
  });
  const summary = baseSummary({
    status: "incomplete",
    garmentSummary: [shirt, kaftan],
    blockers: [{ code: "CUSTOM_DETAILS_INCOMPLETE", section: "custom_details", message: "Complete every required Custom Details selection." }],
    customDetailsSummary: [
      ...baseSummary().customDetailsSummary,
      {
        garmentKey: "removed:skirt",
        garmentLabel: "Standard Skirt",
        occurrences: [{ occurrenceKey: "orphan", garmentKey: "removed:skirt", garmentLabel: "Standard Skirt", selectionGroup: "pockets", selectionGroupTitle: "Pockets", optionId: "p", optionLabel: "With 2 Side Pockets", priceStatus: "exact", priceCents: 0, personalizedText: null }],
      },
    ],
  });
  const { renderer, root } = render(summary);
  const status = (id: string) => one(root, "data-summary-garment-jump", id).props["data-summary-jump-status"];
  assert.equal(status("custom-details:base:shirt"), "chosen", "a garment with details keeps its tick");
  assert.equal(status("custom-details:base:kaftan"), "needed", "no details while Custom Details are incomplete: !");
  assert.match(text(one(root, "data-summary-garment-card", "base:kaftan")), /Components: Long Shirt, Trouser/);
  assert.equal(text(one(root, "data-summary-garment-type-role", "base:kaftan")), "Main garment");
  assert.equal(
    one(root, "data-summary-garment-reference", "base:kaftan").find((node) => node.type === "img").props.src,
    "/images/garments/ankara-kaftan-short-sleeve.webp",
  );
  const customDetails = sectionTitled(root, "Custom Details");
  assert.ok(customDetails, "orphaned Custom Details section still renders");
  assert.match(text(customDetails), /With 2 Side Pockets/);
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 4. 2+ wearers: grouped by person, then Unassigned; empty person omitted
// ---------------------------------------------------------------------------
{
  const extraShirt = garment("additional:shirt:1", "shirt", "Standard Shirt 2", { role: "additional" });
  const summary = baseSummary({
    garmentSummary: [shirt, trouser, extraShirt],
    measurementSummary: {
      route: null,
      routeLabel: "3 people",
      unit: "cm",
      shared: [],
      byGarment: [],
      wearerGroups: [
        wearerGroup("w-chidi", "Chidi", ["base:shirt"]),
        wearerGroup("w-amaka", "Amaka", ["base:trouser"]),
        wearerGroup("w-empty", "Ngozi", []),
      ],
    },
  });
  const groups = groupSummaryGarmentsByWearer(summary);
  assert.deepEqual(
    groups?.map((group) => [group.kind, group.label, group.initial, group.garments.map((g) => g.garmentKey)]),
    [
      ["wearer", "Chidi", "C", ["base:shirt"]],
      ["wearer", "Amaka", "A", ["base:trouser"]],
      ["unassigned", "Unassigned", null, ["additional:shirt:1"]],
    ],
  );
  const { renderer, root } = render(summary);
  const blocks = byAttr(root, "data-summary-garment-person");
  assert.deepEqual(
    blocks.map((block) => [
      block.props["data-summary-garment-person-kind"],
      text(block.find((node) => node.type === "h4")),
      byAttr(block, "data-summary-garment-card").map((card) => card.props["data-summary-garment-card"]),
    ]),
    [
      ["wearer", "Chidi", ["base:shirt"]],
      ["wearer", "Amaka", ["base:trouser"]],
      ["unassigned", "Unassigned", ["additional:shirt:1"]],
    ],
  );
  assert.equal(blocks[0].props["aria-label"], "Chidi: 1 garment");
  assert.match(text(blocks[0]), /^C/);
  assert.match(text(blocks[0]), /1 garment/);
  assert.match(text(blocks[2]), /^\?Unassigned/);
  assert.equal(text(sectionTitled(root, "Garments")).includes("Ngozi"), false, "a person with no garments gets no block");
  assert.equal(byAttr(root, "data-summary-garment-wearer").length, 0, "wearer chip dropped inside person blocks");
  assert.equal(one(root, "data-garment-removal-row-heading", "base:shirt").type, "h5", "garment heading nests under the person h4");
  assert.equal(text(one(root, "data-summary-garment-type-role", "additional:shirt:1")), "Standard Shirt · Additional garment");
  // Edit / Remove still present on grouped cards.
  assert.equal(byAttr(root, "data-summary-edit-garment").length, 3);
  assert.equal(byAttr(root, "data-garment-removal-button").length, 2, "Remove where a removal target exists");
  act(() => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 5. Without measurement groups: two named wearers group by label; blank-name
//    groups use the public label; one named wearer stays plain.
// ---------------------------------------------------------------------------
{
  const named = baseSummary({
    garmentSummary: [
      { ...shirt, wearerLabel: "Chidi" },
      { ...trouser, wearerLabel: "Amaka" },
    ],
  });
  assert.deepEqual(
    groupSummaryGarmentsByWearer(named)?.map((group) => [group.label, group.garments.length]),
    [["Chidi", 1], ["Amaka", 1]],
  );
  const oneNamed = baseSummary({ garmentSummary: [{ ...shirt, wearerLabel: "Amaka" }, trouser] });
  assert.equal(groupSummaryGarmentsByWearer(oneNamed), null);
  const { renderer, root } = render(oneNamed);
  assert.equal(text(sectionTitled(root, "Garments")).includes("Amaka"), false, "sole wearer name is not repeated");
  assert.equal(text(root).includes("Person 1"), false, "never Person 1");
  act(() => renderer.unmount());
}

console.log("test_summary_garment_cards.tsx: all assertions passed");
