import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import type {
  DesignStyleStepCatalogMutationRequest,
  DesignStyleStepClearMutationRequest,
} from "./src/utils/designStyleStepRuntime";
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
  overrides: Partial<Parameters<typeof DormantFutureDesignStyleStep>[0]> = {},
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

// A failed authenticated draft read is terminal and recoverable; Step 3 must
// not indefinitely claim that it is still restoring choices.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
  });
  const renderer = await renderModel(model, {
    runtimeStatus: "hydrating",
    draftHydrationFailed: true,
  });
  const visibleText = textContent(renderer.root);
  assert.match(visibleText, /could not restore your saved Design Style choices/i);
  assert.equal(visibleText.includes("Restoring your Design Style choices..."), false);
}

// Customer Step 3 intentionally has no demographic selector. Published styles
// remain visible regardless of their demographic reference metadata.
{
  const publishedStyles: StyleCategory[] = [
    { ...style, id: "step3-male-reference", name: "Emerald Reference", gender: "male", targetDemographic: "male" },
    { ...style, id: "step3-female-reference", name: "Gold Reference", gender: "female", targetDemographic: "female" },
    { ...style, id: "step3-unisex-reference", name: "Ivory Reference", gender: "unisex", targetDemographic: "unisex" },
  ];
  const model = createDesignStyleStepTestModel({
    styles: publishedStyles,
    garmentTypeSelection: selection(["shirt"]),
  });
  const renderer = await renderModel(model);
  const visibleText = textContent(renderer.root);

  assert.equal(visibleText.includes("Who is this design for?"), false);
  assert.equal(visibleText.includes("Unisex / Family"), false);
  assert.equal(
    renderer.root.findAllByType("input").some(
      (input) => input.props.type === "checkbox",
    ),
    false,
  );
  assert.match(
    textContent(renderer.root.findByProps({ "data-testid": "step3-all-designs" })),
    /All Designs/,
  );
  assert.deepEqual(
    renderer.root
      .findAll((node) => node.props?.["data-style-name"] !== undefined)
      .map((card) => card.props["data-style-name"]),
    ["Emerald Reference", "Gold Reference", "Ivory Reference"],
  );
  assert.equal(visibleText.includes("Your Garments"), true);
  assert.equal(visibleText.includes("Choose Design"), true);
}

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

// Reusing a Design Style can add an exact physical occurrence only after the
// existing Fabric transaction confirms it. The Step 3 dialog must retain its
// mapping context, then leave the new occurrence unassigned until Apply.
{
  const additionalGarmentOptions = [
    {
      garmentType: "shirt" as const,
      construction: {
        status: "resolved" as const,
        garmentType: "shirt" as const,
        components: [],
        totalPriceCents: 6500,
        totalPrice: 65,
      } satisfies GarmentConstructionPricingResolution,
    },
  ];
  const allAssigned = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": style.id },
  });
  const mappingRequests: DesignStyleStepCatalogMutationRequest[][] = [];
  const additions: Array<{
    garmentType: string;
    context: { readonly origin: "design_style_reuse"; readonly styleId: string };
  }> = [];
  const handledOccurrences: string[] = [];
  const reuseProps = {
    additionalGarmentOptions,
    onAssignCatalogueStyle: (requests: readonly DesignStyleStepCatalogMutationRequest[]) =>
      mappingRequests.push([...requests]),
    onAddAdditionalGarment: (
      garmentType: "shirt",
      _trigger: HTMLElement,
      context: { readonly origin: "design_style_reuse"; readonly styleId: string },
    ) => additions.push({ garmentType, context }),
    onReuseAddedOccurrenceHandled: (garmentKey: string) =>
      handledOccurrences.push(garmentKey),
  };
  const renderer = await renderModel(allAssigned, reuseProps);
  const useAgain = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === `Use Again ${style.name}`)!;
  await act(async () =>
    useAgain.props.onClick({
      currentTarget: { focus: () => undefined } as unknown as HTMLButtonElement,
    }),
  );
  assert.match(textContent(renderer.root), /Want to use this design for another garment\?/);
  const mappingCheckbox = renderer.root
    .findByProps({ "data-testid": "design-garment-mapping-dialog" })
    .findByType("input");
  await act(async () => mappingCheckbox.props.onChange());
  assert.equal(mappingCheckbox.props.checked, false);

  const addAnother = renderer.root
    .findByProps({ "data-testid": "design-reuse-add-another-garment" })
    .findByType("button");
  await act(async () => addAnother.props.onClick());
  assert.equal(
    renderer.root.findByProps({ "data-testid": "design-garment-mapping-dialog" })
      .props["data-dialog-view"],
    "add_garment",
  );
  assert.match(textContent(renderer.root), /Add a garment/);
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-reuse-add-garment-card-shirt" })
      .length,
    1,
    "the reuse flow must render the shared Step 1 garment option",
  );
  const backToDesign = renderer.root
    .findAllByType("button")
    .find((button) => textContent(button) === "Back to Design")!;
  await act(async () => backToDesign.props.onClick());
  assert.equal(
    renderer.root
      .findByProps({ "data-testid": "design-garment-mapping-dialog" })
      .findByType("input").props.checked,
    false,
  );

  await act(async () =>
    renderer.root
      .findByProps({ "data-testid": "design-reuse-add-another-garment" })
      .findByType("button").props.onClick(),
  );
  const addShirt = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === "Add Standard Shirt to use this design")!;
  await act(async () =>
    addShirt.props.onClick({ currentTarget: {} as HTMLElement }),
  );
  assert.deepEqual(additions, [
    {
      garmentType: "shirt",
      context: { origin: "design_style_reuse", styleId: style.id },
    },
  ]);

  const addedOccurrence: PhysicalGarmentOccurrence = {
    garmentKey: "additional:shirt:1",
    garmentType: "shirt",
    sourceRole: "additional",
    fabricUnits: 1,
    occurrenceGeneration: 2,
  };
  const afterFabric = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
    occurrences: [allAssigned.occurrences[0]!, addedOccurrence],
    selectedStyleIdByGarmentKey: { "base:shirt:1": style.id },
  });
  assert.equal(
    afterFabric.projection.occurrences[1]!.assignment,
    null,
    "the returned occurrence must not receive a style before Apply Design",
  );
  await act(async () => {
    renderer.update(
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(afterFabric)}
        {...reuseProps}
        reuseFabricPending={false}
        reuseAddedOccurrence={{ garmentKey: addedOccurrence.garmentKey, styleId: style.id }}
      />,
    );
  });
  const returnedDialog = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  assert.equal(returnedDialog.props["data-dialog-view"], "mapping");
  const returnedChecks = returnedDialog.findAllByType("input");
  assert.deepEqual(
    returnedChecks.map((input) => input.props.checked),
    [false, true],
    "the new exact occurrence should be pre-checked while existing mapping state is preserved",
  );
  assert.deepEqual(handledOccurrences, [addedOccurrence.garmentKey]);
  const apply = returnedDialog.findByProps({ "data-testid": "apply-design-mapping" });
  assert.equal(apply.props.disabled, false);
  await act(async () => apply.props.onClick());
  assert.deepEqual(
    mappingRequests.map((requests) => requests.map((request) => request.target.garmentKey)),
    [[addedOccurrence.garmentKey]],
    "Apply Design is the only action that assigns the selected style to the new occurrence",
  );
}

// A current unassigned occurrence remains an in-dialog mapping choice; the
// creation CTA is reserved for the true empty-reuse state.
{
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": style.id },
  });
  const renderer = await renderModel(model, {
    additionalGarmentOptions: [],
    onAddAdditionalGarment: () => undefined,
  });
  const useAgain = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === `Use Again ${style.name}`)!;
  await act(async () =>
    useAgain.props.onClick({
      currentTarget: { focus: () => undefined } as unknown as HTMLButtonElement,
    }),
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-reuse-add-another-garment" })
      .length,
    0,
  );
  assert.equal(
    renderer.root
      .findByProps({ "data-testid": "design-garment-mapping-dialog" })
      .findAllByType("input").length,
    2,
    "the existing unassigned garment remains available in the normal mapping dialog",
  );
}

// A composition mismatch remains advisory for a newly available exact
// occurrence: selecting it keeps Apply Design enabled.
{
  const mismatchOccurrence: PhysicalGarmentOccurrence = {
    garmentKey: "additional:kaftan:1",
    garmentType: "kaftan",
    sourceRole: "additional",
    fabricUnits: 1,
    occurrenceGeneration: 2,
  };
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(["shirt"]),
    occurrences: [
      {
        garmentKey: "base:shirt:1",
        garmentType: "shirt",
        sourceRole: "main",
        fabricUnits: 1,
        occurrenceGeneration: 1,
      },
      mismatchOccurrence,
    ],
    selectedStyleIdByGarmentKey: { "base:shirt:1": style.id },
  });
  const renderer = await renderModel(model);
  const useAgain = renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === `Use Again ${style.name}`)!;
  await act(async () =>
    useAgain.props.onClick({
      currentTarget: { focus: () => undefined } as unknown as HTMLButtonElement,
    }),
  );
  const mapping = renderer.root.findByProps({
    "data-testid": "design-garment-mapping-dialog",
  });
  const checks = mapping.findAllByType("input");
  await act(async () => checks[1]!.props.onChange());
  assert.equal(
    mapping.findAllByProps({ "data-testid": "reference-composition-warning" })
      .length,
    1,
  );
  assert.equal(
    mapping.findByProps({ "data-testid": "apply-design-mapping" }).props.disabled,
    false,
    "a mismatch warning must not block Apply Design",
  );
}

console.log("PASS: garment-scoped Design Style Step 3 rendered runtime");
