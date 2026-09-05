import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import type { DesignStyleStepClearMutationRequest } from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
  type DesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const style: StyleCategory = {
  id: "task5d-ui-style",
  name: "Task 5D Heritage",
  description: "A strict fixture for occurrence UI.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("skirt"),
    createStyleBaseGarmentSpec("bum_shorts"),
  ],
};

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

const continueButton = (root: ReactTestInstance) =>
  root
    .findByProps({ "data-testid": "future-design-style-continue-action" })
    .findByType("button");

// Repeated occurrences render independently, in order, without internal IDs.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
  });
  const selectedTargets: DesignStyleStepClearMutationRequest["target"][] = [];
  const renderer = await renderModel(model, {
    onSelectOccurrence: (target) => selectedTargets.push(target),
  });
  const occurrenceRows = renderer.root.findAll(
    (node) => node.props?.["data-occurrence-label"],
  );
  assert.deepEqual(
    occurrenceRows.map((row) => row.props["data-occurrence-label"]),
    ["Shirt", "Shirt 2", "Shirt 3"],
  );
  assert.match(
    textContent(
      renderer.root.findByProps({ "data-testid": "step3-assignment-progress" }),
    ),
    /0 of 3 garments assigned/,
  );
  const visibleText = textContent(renderer.root);
  for (const occurrence of model.projection.occurrences) {
    assert.equal(visibleText.includes(occurrence.target.garmentKey), false);
    assert.equal(visibleText.includes(occurrence.target.occurrenceToken), false);
  }
  await act(async () =>
    occurrenceRows[1]!
      .findAllByType("button")
      .find((button) => textContent(button).includes("Choose Design"))!
      .props.onClick(),
  );
  assert.deepEqual(selectedTargets, [model.projection.occurrences[1]!.target]);
  assert.equal(
    Object.keys(model.hydration.ledger!.assignmentsByGarmentKey).length,
    0,
    "Occurrence navigation must not mutate assignments.",
  );
}

// Current mapping actions select the exact authoritative occurrence.
{
  const base = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
  });
  const middle = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    activeTarget: base.projection.occurrences[1]!.target,
  });
  const selectedTargets: DesignStyleStepClearMutationRequest["target"][] = [];
  const renderer = await renderModel(middle, {
    onSelectOccurrence: (target) => selectedTargets.push(target),
  });
  const rows = renderer.root.findAll(
    (node) => node.props?.["data-occurrence-label"],
  );
  assert.equal(rows[0]!.props.className, rows[1]!.props.className);
  assert.equal(rows[1]!.props.className, rows[2]!.props.className);
  assert.doesNotMatch(rows[1]!.props.className, /border-heritage-gold|heritage-cream/);
  await act(async () =>
    rows[2]!
      .findAllByType("button")
      .find((button) => textContent(button).includes("Choose Design"))!
      .props.onClick(),
  );
  assert.deepEqual(selectedTargets, [middle.projection.occurrences[2]!.target]);
}

// Progress and Continue are driven by exact-set V2 validation only.
for (const [count, selectedStyleIdByGarmentKey, complete] of [
  [
    2,
    {
      "base:shirt:1": style.id,
      "base:skirt:1": style.id,
    },
    false,
  ],
  [
    3,
    {
      "base:shirt:1": style.id,
      "base:skirt:1": style.id,
      "base:bum_shorts:1": style.id,
    },
    true,
  ],
] as const) {
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    selectedStyleIdByGarmentKey,
  });
  const renderer = await renderModel(model);
  assert.match(
    textContent(
      renderer.root.findByProps({ "data-testid": "step3-assignment-progress" }),
    ),
    new RegExp(`${count} of 3 garments assigned`),
  );
  assert.equal(continueButton(renderer.root).props.disabled, !complete);
  assert.equal(
    renderer.root.findByProps({ "data-stage-id": "design_style" }).props[
      "data-stage-complete"
    ],
    complete,
  );
}

// Clear controls are available per assigned occurrence; Clear All belongs with
// the mapping section rather than a selected row.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": style.id,
      "base:skirt:1": style.id,
    },
  });
  let clearAllCalls = 0;
  const renderer = await renderModel(model, {
    onClearAllAssignments: () => {
      clearAllCalls += 1;
    },
  });
  const rows = renderer.root.findAll(
    (node) => node.props?.["data-occurrence-label"],
  );
  assert.equal(
    rows[0]!.findAllByType("button").some((button) => textContent(button) === "Clear"),
    true,
  );
  assert.equal(
    rows[1]!.findAllByType("button").some((button) => textContent(button) === "Clear"),
    true,
  );
  const clearAll = renderer.root
    .findAllByType("button")
    .find((button) => textContent(button) === "Clear All")!;
  await act(async () => clearAll.props.onClick());
  assert.equal(clearAllCalls, 1);
}

// Ambiguous scalar migration is visible, assigns nothing, and remains blocked.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    rawDraft: {
      selectedStyleId: style.id,
      designSource: createCatalogDesignSource(style.id),
      confirmedStyleId: style.id,
      confirmedDesignSourceKey: `catalog:${style.id}`,
      priceActivatedFabricCode: "SCALAR-CANNOT-COMPLETE",
    },
  });
  const renderer = await renderModel(model);
  assert.equal(model.projection.runtimeStatus, "review");
  assert.match(
    textContent(renderer.root.findByProps({ "data-testid": "step3-migration-review" })),
    /Choose a design for each garment/,
  );
  assert.equal(model.projection.completedCount, 0);
  assert.equal(continueButton(renderer.root).props.disabled, true);
}

// Malformed V2 is a fail-closed recovery state, never a normal empty catalogue.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: {
      designStyleAssignmentDraft: {
        schemaVersion: 2,
        ledger: { revision: "malformed" },
      },
      selectedStyleId: style.id,
    },
  });
  const renderer = await renderModel(model);
  assert.equal(model.projection.runtimeStatus, "blocked");
  assert.match(
    renderer.root
      .findAllByProps({ role: "alert" })
      .map((alert) => textContent(alert))
      .join(" "),
    /cannot be changed safely|need support/i,
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "step3-zero-selectable" })
      .length,
    0,
  );
  assert.equal(continueButton(renderer.root).props.disabled, true);
}

// Loading/error preserve selected evidence, disable mutations, and do not show
// the final empty-catalogue message.
{
  const complete = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": style.id },
  });
  for (const catalogueState of ["loading", "error"] as const) {
    const model = createDesignStyleStepTestModel({
      styles: [style],
      garmentTypeSelection: selection(["shirt"]),
      catalogueState,
      rawDraft: {
        designStyleAssignmentDraft: complete.hydration.envelope,
      },
    });
    const renderer = await renderModel(model, {
      stylesLoadState: catalogueState,
      isCatalogueLoading: catalogueState === "loading",
    });
    assert.match(textContent(renderer.root), /saved assignments are preserved/i);
    assert.equal(
      renderer.root.findAllByProps({ "data-testid": "step3-zero-selectable" })
        .length,
      0,
    );
    assert.equal(continueButton(renderer.root).props.disabled, true);
  }
}

console.log("PASS: garment-scoped Design Style Step 3 rendered runtime");
