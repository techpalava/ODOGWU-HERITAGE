/**
 * Step 3 strict, active-occurrence catalogue discovery UX.
 * Fixtures only; no production catalogue records are mutated.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
  type DesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureDesignStyleStep } = await import(
  "./src/components/DormantFutureDesignStyleStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: "male" | "female" | "unisex" = "male",
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic,
  audienceSelection: { schemaVersion: 1, demographics: [demographic] },
  constructionByGarment: {},
});

const shirtTrouserMale = selection(["shirt", "trouser"]);

const exactStyle: StyleCategory = {
  id: "style-a-exact",
  name: "Heritage Classic",
  description: "A strict published design for shirt and trouser.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const adaptableStyle: StyleCategory = {
  id: "style-b-adaptable",
  name: "Royal Senator",
  description: "A published Kaftan reference that may be adapted.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "kaftan"],
    demographics: ["male"],
  },
};

const unsupportedStyle: StyleCategory = {
  id: "style-c-unsupported",
  name: "Palace Kaftan",
  description: "A Kaftan-only published design.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
};

const wrongAudienceStyle: StyleCategory = {
  id: "style-d-wrong-audience",
  name: "Ladies Evening",
  description: "A female-audience design.",
  gender: "female",
  targetDemographic: "female",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};

const unisexStyle: StyleCategory = {
  id: "style-e-unisex",
  name: "Family Heritage",
  description: "A unisex published design.",
  gender: "unisex",
  targetDemographic: "unisex",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};

const fullCatalogue = [
  exactStyle,
  adaptableStyle,
  unsupportedStyle,
  wrongAudienceStyle,
  unisexStyle,
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const styleCards = (root: ReactTestInstance) =>
  root.findAll((node) => node.props?.["data-style-card"] === "true");

const cardsInSection = (root: ReactTestInstance, testId: string) =>
  root
    .findByProps({ "data-testid": testId })
    .findAll((node) => node.props?.["data-style-card"] === "true");

const cardByName = (root: ReactTestInstance, name: string) => {
  const cards = styleCards(root).filter(
    (card) => card.props["data-style-name"] === name,
  );
  assert.ok(cards.length > 0, `Expected a rendered card for ${name}.`);
  return cards[0]!;
};

const actionButtons = (
  root: ReactTestInstance,
  styleName: string,
  action: "Select Design" | "Use This Design" | "Selected",
) =>
  root.findAllByType("button").filter(
    (button) =>
      String(button.props["aria-label"] || "").startsWith(
        `${action} ${styleName} for `,
      ),
  );

const renderModel = async (
  model: DesignStyleStepTestModel,
  overrides: Partial<
    ReturnType<typeof createDesignStyleStepRenderProps>
  > = {},
) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(model)}
        {...overrides}
      />,
    );
  });
  return renderer;
};

// Only strict, eligible records for the active Shirt occurrence render.
{
  const model = createDesignStyleStepTestModel({
    styles: fullCatalogue,
    garmentTypeSelection: shirtTrouserMale,
  });
  const renderer = await renderModel(model);
  const names = new Set(
    styleCards(renderer.root).map((card) => card.props["data-style-name"]),
  );
  assert.deepEqual(names, new Set([
    exactStyle.name,
    adaptableStyle.name,
    unisexStyle.name,
  ]));
  assert.equal(names.has(unsupportedStyle.name), false);
  assert.equal(names.has(wrongAudienceStyle.name), false);
  assert.deepEqual(
    cardsInSection(renderer.root, "step3-best-matches").map(
      (card) => card.props["data-style-name"],
    ),
    [exactStyle.name, unisexStyle.name],
  );
  assert.equal(
    cardByName(renderer.root, adaptableStyle.name).props["data-style-tier"],
    "adaptable",
  );
}

// Adaptability confirmation captures the exact occurrence request and does not
// invoke assignment until the customer confirms.
{
  const assignedStyleIds: string[] = [];
  const model = createDesignStyleStepTestModel({
    styles: [exactStyle, adaptableStyle],
    garmentTypeSelection: shirtTrouserMale,
  });
  const renderer = await renderModel(model, {
    onAssignCatalogueStyle: (request) => assignedStyleIds.push(request.styleId),
  });
  const adaptableButton = actionButtons(
    renderer.root,
    adaptableStyle.name,
    "Use This Design",
  )[0];
  assert.ok(adaptableButton);
  await act(async () =>
    adaptableButton.props.onClick({ currentTarget: { focus() {} } }),
  );
  assert.deepEqual(assignedStyleIds, []);
  const dialog = renderer.root.findByProps({
    "data-testid": "adapt-design-confirmation",
  });
  assert.equal(dialog.props.role, "dialog");
  assert.equal(dialog.props["aria-modal"], "true");
  assert.match(textContent(dialog), /Adapt this design to your garment\?/);
  assert.match(textContent(dialog), /shown as Kaftan/);
  assert.match(textContent(dialog), /Shirt/);
  assert.match(
    textContent(dialog),
    /Your garment and Fabric selection will not change/,
  );
  await act(async () =>
    dialog
      .findAllByType("button")
      .find((button) => textContent(button).includes("Cancel"))!
      .props.onClick(),
  );
  assert.deepEqual(assignedStyleIds, []);

  await act(async () =>
    actionButtons(renderer.root, adaptableStyle.name, "Use This Design")[0]!
      .props.onClick({ currentTarget: { focus() {} } }),
  );
  await act(async () =>
    renderer.root
      .findByProps({ "data-adapt-confirm": "true" })
      .props.onClick(),
  );
  assert.deepEqual(assignedStyleIds, [adaptableStyle.id]);
}

// Exact matches dispatch directly. Duplicate presentation across Best Matches
// and Explore does not weaken the exact captured request.
{
  const requests: string[] = [];
  const model = createDesignStyleStepTestModel({
    styles: [exactStyle, adaptableStyle],
    garmentTypeSelection: shirtTrouserMale,
  });
  const renderer = await renderModel(model, {
    onAssignCatalogueStyle: (request) => requests.push(request.styleId),
  });
  const exactButtons = actionButtons(
    renderer.root,
    exactStyle.name,
    "Select Design",
  );
  assert.ok(exactButtons.length >= 1);
  await act(async () =>
    exactButtons[0]!.props.onClick({ currentTarget: { focus() {} } }),
  );
  assert.deepEqual(requests, [exactStyle.id]);
  assert.equal(
    renderer.root.findAllByProps({
      "data-testid": "adapt-design-confirmation",
    }).length,
    0,
  );
}

// Browse filters affect only already-eligible cards and never mutate garments.
{
  const originalSelection = structuredClone(shirtTrouserMale);
  const model = createDesignStyleStepTestModel({
    styles: fullCatalogue,
    garmentTypeSelection: originalSelection,
  });
  const renderer = await renderModel(model);
  const exploreNames = () =>
    cardsInSection(renderer.root, "step3-explore-all").map(
      (card) => card.props["data-style-name"],
    );

  assert.deepEqual(
    new Set(exploreNames()),
    new Set([exactStyle.name, adaptableStyle.name, unisexStyle.name]),
  );
  await act(async () =>
    renderer.root
      .findByProps({ "data-catalogue-filter": "exact_match" })
      .props.onClick(),
  );
  assert.deepEqual(exploreNames(), [exactStyle.name, unisexStyle.name]);
  await act(async () =>
    renderer.root
      .findByProps({ "data-catalogue-filter": "adaptable" })
      .props.onClick(),
  );
  assert.deepEqual(exploreNames(), [adaptableStyle.name]);
  await act(async () =>
    renderer.root
      .findByProps({ "data-catalogue-filter": "male" })
      .props.onClick(),
  );
  assert.deepEqual(new Set(exploreNames()), new Set([
    exactStyle.name,
    adaptableStyle.name,
  ]));
  await act(async () =>
    renderer.root
      .findByProps({ "data-catalogue-filter": "unisex" })
      .props.onClick(),
  );
  assert.deepEqual(exploreNames(), [unisexStyle.name]);
  assert.deepEqual(originalSelection, shirtTrouserMale);
}

// A card is selected only for the current exact occurrence.
{
  const selectedModel = createDesignStyleStepTestModel({
    styles: [exactStyle],
    garmentTypeSelection: shirtTrouserMale,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": exactStyle.id,
    },
  });
  assert.equal(selectedModel.projection.occurrences[0]!.label, "Shirt");
  assert.equal(selectedModel.projection.occurrences[0]!.status, "complete");
  assert.equal(selectedModel.projection.occurrences[1]!.status, "incomplete");
  assert.equal(
    selectedModel.activeTarget?.garmentKey,
    "base:trouser:1",
    "Initial focus should prefer the first occurrence requiring action.",
  );
  const trouserRenderer = await renderModel(selectedModel);
  assert.equal(
    styleCards(trouserRenderer.root).some(
      (card) => card.props["data-style-selected"] === "true",
    ),
    false,
  );

  const shirtActiveModel = createDesignStyleStepTestModel({
    styles: [exactStyle],
    garmentTypeSelection: shirtTrouserMale,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": exactStyle.id,
    },
    activeTarget: selectedModel.projection.occurrences[0]!.target,
  });
  const shirtRenderer = await renderModel(shirtActiveModel);
  assert.ok(
    styleCards(shirtRenderer.root).some(
      (card) => card.props["data-style-selected"] === "true",
    ),
  );
}

// No eligible strict records produces a truthful active-occurrence blocker and
// does not restore the order-wide upload panel.
{
  const model = createDesignStyleStepTestModel({
    styles: [unsupportedStyle, wrongAudienceStyle],
    garmentTypeSelection: shirtTrouserMale,
  });
  const renderer = await renderModel(model);
  assert.match(
    textContent(renderer.root.findByProps({ "data-testid": "step3-zero-selectable" })),
    /No designs can currently be selected for this garment/,
  );
  assert.equal(styleCards(renderer.root).length, 0);
  assert.equal(
    renderer.root.findAllByProps({
      "data-testid": "upload-your-design-panel",
    }).length,
    0,
  );
}

const componentSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
assert.equal(componentSource.includes("ODOGWU_STEP3_DISCOVERY_QA_STYLES"), false);
assert.equal(componentSource.includes("sessionStorage"), false);
assert.equal(componentSource.includes("localStorage"), false);
assert.match(componentSource, /All Designs/);
assert.match(componentSource, /all_designs/);
assert.match(componentSource, /useState<CatalogueBrowseFilter>\("all_designs"\)/);

console.log("PASS: Step 3 strict active-occurrence catalogue discovery UX");
