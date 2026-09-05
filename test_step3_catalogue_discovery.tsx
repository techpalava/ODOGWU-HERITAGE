/** Focused customer-visible Step 3 all-designs garment-mapping contract. */
import assert from "node:assert/strict";
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

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser", "shirt", "bum_shorts", "kaftan"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const makeStyle = (
  id: string,
  name: string,
  garment: "shirt" | "trouser" | "bum_shorts" | "agbada" | "kaftan",
  demographic: "male" | "female" | "unisex" = "male",
): StyleCategory => ({
  id,
  name,
  description: `${name} published reference.`,
  gender: demographic,
  targetDemographic: demographic,
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec(garment)],
});

const styles = [
  makeStyle("all-a", "Shirt Reference", "shirt"),
  makeStyle("all-b", "Shorts Reference", "bum_shorts"),
  makeStyle("all-c", "Agbada Reference", "agbada"),
  makeStyle("all-d", "Ladies Reference", "trouser", "female"),
  makeStyle("all-e", "Kaftan Reference", "kaftan", "unisex"),
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const renderModel = async (
  model: DesignStyleStepTestModel,
  overrides: Partial<ReturnType<typeof createDesignStyleStepRenderProps>> = {},
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

const styleCards = (root: ReactTestInstance) =>
  root.findAll((node) => node.props?.["data-style-card"] === "true");

const styleButton = (root: ReactTestInstance, styleName: string) =>
  root
    .findAllByType("button")
    .find(
      (button) =>
        button.props["aria-label"] === `Use This Design ${styleName}` ||
        button.props["aria-label"] === `Use Again ${styleName}`,
    )!;

const checkboxFor = (dialog: ReactTestInstance, occurrenceLabel: string) =>
  dialog
    .findAllByType("label")
    .find((label) => textContent(label).startsWith(occurrenceLabel))!
    .findByType("input");

// All published projections render once, without filters or compatibility groups.
{
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection,
  });
  const renderer = await renderModel(model);
  assert.deepEqual(
    styleCards(renderer.root).map((card) => card.props["data-style-name"]),
    styles.map((style) => style.name),
  );
  for (const card of styleCards(renderer.root)) {
    const title = card.findByType("h4");
    assert.equal(textContent(title), card.props["data-style-name"]);
    assert.match(
      title.props.className,
      /break-words font-serif text-base font-bold text-heritage-green/,
    );
  }
  assert.equal(renderer.root.findAllByProps({ "data-testid": "step3-best-matches" }).length, 0);
  assert.equal(renderer.root.findAllByProps({ "aria-label": "Catalogue design filters" }).length, 0);
  assert.equal(textContent(renderer.root).includes("Adaptable"), false);
  assert.equal(textContent(renderer.root).includes("Incompatible"), false);
  assert.ok(styleCards(renderer.root).every((card) => !styleButton(card, card.props["data-style-name"]).props.disabled));

  await act(async () =>
    styleButton(renderer.root, "Shirt Reference").props.onClick({
      currentTarget: { focus() {} },
    }),
  );
  const dialog = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  assert.equal(dialog.props.role, "dialog");
  assert.equal(dialog.props["aria-modal"], "true");
  assert.deepEqual(
    dialog.findAllByType("label").map((label) =>
      textContent(label).replace(/Already using this design|Current:.*$/g, ""),
    ),
    ["Shirt", "Trouser", "Shirt 2", "Bum Shorts", "Kaftan"],
  );
}

// One click maps one style to multiple exact occurrences; mismatch is advisory.
{
  const batches: readonly string[][] = [];
  const captured: string[][] = batches as string[][];
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection,
  });
  const renderer = await renderModel(model, {
    onAssignCatalogueStyle: (requests) =>
      captured.push(requests.map((request) => request.target.garmentKey)),
  });
  await act(async () =>
    styleButton(renderer.root, "Shorts Reference").props.onClick({
      currentTarget: { focus() {} },
    }),
  );
  const dialog = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  await act(async () => checkboxFor(dialog, "Shirt").props.onChange());
  await act(async () => checkboxFor(dialog, "Trouser").props.onChange());
  assert.match(
    textContent(
      renderer.root.findByProps({
        "data-testid": "reference-composition-warning",
      }),
    ),
    /Trouser.*not part of the reference outfit.*still apply/i,
  );
  const apply = renderer.root.findByProps({ "data-testid": "apply-design-mapping" });
  assert.equal(apply.props.disabled, false);
  await act(async () => apply.props.onClick());
  assert.deepEqual(captured, [["base:shirt:1", "base:trouser:1"]]);
}

// Reusing the same card keeps prior assignments checked and permits additions.
{
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styles[0]!.id,
      "base:trouser:1": styles[0]!.id,
    },
  });
  const renderer = await renderModel(model);
  const card = styleCards(renderer.root).find(
    (candidate) => candidate.props["data-style-name"] === styles[0]!.name,
  )!;
  assert.match(textContent(card), /IN USE/);
  assert.equal(
    styleButton(card, styles[0]!.name).props["aria-label"],
    `Use Again ${styles[0]!.name}`,
  );
  assert.equal(styleButton(card, styles[0]!.name).props.disabled, false);
  await act(async () =>
    styleButton(card, styles[0]!.name).props.onClick({
      currentTarget: { focus() {} },
    }),
  );
  const dialog = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  assert.equal(checkboxFor(dialog, "Shirt").props.checked, true);
  assert.equal(checkboxFor(dialog, "Trouser").props.checked, true);
  await act(async () => checkboxFor(dialog, "Bum Shorts").props.onChange());
  assert.equal(renderer.root.findByProps({ "data-testid": "apply-design-mapping" }).props.disabled, false);
}

// Selecting an occurrence with a different style shows a scoped replacement warning.
{
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection,
    selectedStyleIdByGarmentKey: { "base:shirt:1": styles[0]!.id },
  });
  const renderer = await renderModel(model);
  await act(async () =>
    styleButton(renderer.root, styles[1]!.name).props.onClick({
      currentTarget: { focus() {} },
    }),
  );
  const dialog = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  await act(async () => checkboxFor(dialog, "Shirt").props.onChange());
  assert.match(
    textContent(dialog),
    /Shirt currently uses Shirt Reference.*will replace it for Shirt/i,
  );
}

console.log("PASS: Step 3 shows all designs with reusable exact-garment mapping");
