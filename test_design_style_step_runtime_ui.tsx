import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  CanonicalPhysicalGarmentType,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import type { PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import {
  assignCatalogueStyleToOccurrencesThroughStepRuntime,
  type DesignStyleStepCatalogMutationRequest,
  type DesignStyleStepClearMutationRequest,
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

const withReferenceGarmentTypes = (
  model: DesignStyleStepTestModel,
  referenceGarmentTypes: readonly CanonicalPhysicalGarmentType[],
) =>
  model.catalogueEntries.map((entry) => ({
    ...entry,
    referenceGarmentTypes,
  }));

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
    /Choose design styles you like/,
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

// Upload and catalogue are equivalent pathways, but upload is presented first.
// Catalogue cards keep the full description for an accessible details dialog
// while their visible preview stays compact.
{
  const longDescription =
    "An intentionally long Design Style description that remains intact in the details dialog while the catalogue card only previews two compact lines for a stable grid.";
  const detailedStyle = { ...style, id: "details-style", description: longDescription };
  const model = createDesignStyleStepTestModel({
    styles: [detailedStyle],
    garmentTypeSelection: selection(["shirt"]),
  });
  const renderer = await renderModel(model, {
    catalogueEntries: withReferenceGarmentTypes(model, ["trouser"]),
  });
  const upload = renderer.root.findByProps({
    "data-testid": "step3-upload-own-design",
  });
  const catalogue = renderer.root.findByProps({
    "data-testid": "step3-all-designs",
  });
  const orderedSections = renderer.root
    .findAll(
      (node) =>
        node.props?.["data-testid"] === "step3-upload-own-design" ||
        node.props?.["data-testid"] === "step3-all-designs",
    )
    .map((node) => node.props["data-testid"]);
  assert.deepEqual(orderedSections, ["step3-upload-own-design", "step3-all-designs"]);
  assert.match(textContent(upload), /Option 1.*Upload your own design/i);
  assert.match(textContent(catalogue), /Option 2.*Choose design styles you like/i);

  const card = renderer.root.findByProps({ "data-style-name": detailedStyle.name });
  const preview = card.findByProps({
    "data-testid": "design-style-description-preview",
  });
  assert.match(preview.props.className, /line-clamp-2/);
  assert.match(card.props.className, /h-full/);
  assert.match(
    card.findByProps({ "data-testid": "design-style-card-title-zone" }).props.className,
    /min-h-\[2\.75rem\]/,
  );
  assert.match(
    card.findByProps({ "data-testid": "design-style-card-description-zone" }).props.className,
    /min-h-\[2\.5rem\]/,
  );
  assert.match(
    card.findByProps({ "data-testid": "design-style-card-cta-zone" }).props.className,
    /mt-auto/,
  );
  const readMore = card.findByProps({
    "aria-label": `Read more about ${detailedStyle.name}`,
  });
  await act(async () =>
    readMore.props.onClick({
      stopPropagation: () => undefined,
      currentTarget: { focus: () => undefined },
    }),
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-garment-mapping-dialog" })
      .length,
    0,
    "Read more must not select the Design Style.",
  );
  const details = renderer.root.findByProps({
    "data-testid": "design-style-details-dialog",
  });
  assert.match(textContent(details), new RegExp(longDescription));
  assert.match(textContent(details), /Originally designed for:.*Trouser/);
  assert.doesNotMatch(textContent(details), /Standard Shirt/);
  await act(async () =>
    details
      .findByProps({ "aria-label": "Close Design Style details" })
      .props.onClick(),
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-garment-mapping-dialog" })
      .length,
    0,
  );

  const useThisDesign = card.findByProps({
    "aria-label": `Use This Design ${detailedStyle.name}`,
  });
  await act(async () =>
    useThisDesign.props.onClick({
      stopPropagation: () => undefined,
      currentTarget: { focus: () => undefined },
    }),
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-garment-mapping-dialog" })
      .length,
    1,
    "The CTA must open one mapping dialog without a parent-card double trigger.",
  );
  await act(async () =>
    renderer.root
      .findByProps({ "data-testid": "design-garment-mapping-dialog" })
      .findByProps({ "aria-label": "Close garment mapping dialog" })
      .props.onClick(),
  );

  const cardClickTarget = card.findByProps({
    "aria-label": `Select ${detailedStyle.name}`,
  });
  await act(async () =>
    cardClickTarget.props.onClick({
      currentTarget: { focus: () => undefined },
    }),
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-testid": "design-garment-mapping-dialog" })
      .length,
    1,
    "The card-wide click target must reuse the primary mapping dialog.",
  );
  assert.match(
    textContent(
      renderer.root.findByProps({
        "data-testid": "design-garment-mapping-dialog",
      }),
    ),
    /Originally designed for:.*Trouser/,
  );
}

// The advisory is omitted entirely when the authoritative reference metadata
// is unresolved, even when capacity composition remains present.
{
  const model = createDesignStyleStepTestModel({
    styles: [{ ...style, id: "no-reference-style", name: "No Reference Style" }],
    garmentTypeSelection: selection(["shirt"]),
  });
  const renderer = await renderModel(model, {
    catalogueEntries: withReferenceGarmentTypes(model, []),
  });
  const noReferenceCard = renderer.root.findByProps({
    "data-style-name": "No Reference Style",
  });
  await act(async () =>
    noReferenceCard
      .findByProps({ "aria-label": "Read more about No Reference Style" })
      .props.onClick({
        stopPropagation: () => undefined,
        currentTarget: { focus: () => undefined },
      }),
  );
  assert.doesNotMatch(
    textContent(
      renderer.root.findByProps({
        "data-testid": "design-style-details-dialog",
      }),
    ),
    /Originally designed for:/,
  );
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Close Design Style details" })
      .props.onClick(),
  );
  await act(async () =>
    noReferenceCard
      .findByProps({ "aria-label": "Select No Reference Style" })
      .props.onClick({ currentTarget: { focus: () => undefined } }),
  );
  assert.doesNotMatch(
    textContent(
      renderer.root.findByProps({
        "data-testid": "design-garment-mapping-dialog",
      }),
    ),
    /Originally designed for:/,
  );
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

// The mapping dialog initializes from authoritative exact-occurrence assignments
// and presents replacement intent only after the customer selects it.
{
  const casualNative = {
    ...style,
    id: "ODG-042",
    name: "Casual Native",
  };
  const contemporaryAnkara = {
    ...style,
    id: "ODGH-043",
    name: "Contemporary Ankara",
  };
  const unassignedStyle = {
    ...style,
    id: "ODGH-044",
    name: "Unassigned Style",
  };
  const exactOccurrences: PhysicalGarmentOccurrence[] = [
    {
      garmentKey: "base:shirt:1",
      garmentType: "shirt",
      sourceRole: "main",
      fabricUnits: 1,
      occurrenceGeneration: 1,
    },
    {
      garmentKey: "additional:shirt:1",
      garmentType: "shirt",
      sourceRole: "additional",
      fabricUnits: 1,
      occurrenceGeneration: 2,
    },
  ];
  const model = createDesignStyleStepTestModel({
    styles: [casualNative, contemporaryAnkara, unassignedStyle],
    garmentTypeSelection: selection(["shirt"]),
    occurrences: exactOccurrences,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": casualNative.id,
      "additional:shirt:1": contemporaryAnkara.id,
    },
  });
  const mappingRequests: DesignStyleStepCatalogMutationRequest[][] = [];
  const renderer = await renderModel(model, {
    onAssignCatalogueStyle: (requests) => mappingRequests.push([...requests]),
  });
  const openStyle = async (styleName: string) => {
    const control = renderer.root
      .findAllByType("button")
      .find(
        (button) =>
          button.props["aria-label"] === `Use Again ${styleName}` ||
          button.props["aria-label"] === `Use This Design ${styleName}`,
      );
    assert.ok(control, `Expected a catalogue control for ${styleName}.`);
    await act(async () =>
      control.props.onClick({
        currentTarget: { focus: () => undefined } as unknown as HTMLButtonElement,
        stopPropagation: () => undefined,
      }),
    );
    return renderer.root.findByProps({
      "data-testid": "design-garment-mapping-dialog",
    });
  };
  const checkboxFor = (dialog: ReactTestInstance, occurrenceIndex: number) =>
    dialog
      .findByProps({
        "data-occurrence-token":
          model.projection.occurrences[occurrenceIndex]!.target.occurrenceToken,
      })
      .findByType("input");

  // Exact stored IDs, including legacy ODG IDs, determine the initial checked
  // set. Repeated shirts remain separate physical occurrences.
  let dialog = await openStyle(casualNative.name);
  assert.match(
    textContent(dialog),
    /Choose the garments you want to use this design on\./,
  );
  const sameStyleCheckbox = checkboxFor(dialog, 0);
  const differentStyleCheckbox = checkboxFor(dialog, 1);
  assert.equal(sameStyleCheckbox.props.checked, true);
  assert.equal(sameStyleCheckbox.props.disabled, true);
  await act(async () => sameStyleCheckbox.props.onChange());
  assert.equal(
    checkboxFor(dialog, 0).props.checked,
    true,
    "A disabled same-style checkbox cannot remove an assign-only mapping.",
  );
  assert.equal(differentStyleCheckbox.props.checked, false);
  assert.equal(differentStyleCheckbox.props.disabled, false);
  assert.match(
    textContent(
      dialog.findByProps({
        "data-occurrence-token": model.projection.occurrences[0]!.target.occurrenceToken,
      }),
    ),
    /Using this design/,
  );
  assert.match(
    textContent(
      dialog.findByProps({
        "data-occurrence-token": model.projection.occurrences[1]!.target.occurrenceToken,
      }),
    ),
    /Current design: Contemporary Ankara/,
  );
  assert.equal(
    dialog.findAllByProps({ "data-testid": "design-style-replacement-warning" })
      .length,
    0,
    "Opening the dialog must not imply that an existing different style will be replaced.",
  );
  const noChanges = dialog.findByProps({ "data-testid": "apply-design-mapping" });
  assert.equal(noChanges.props.disabled, true);
  assert.equal(textContent(noChanges), "No changes");
  await act(async () =>
    dialog
      .findByProps({ "aria-label": "Close garment mapping dialog" })
      .props.onClick(),
  );
  assert.deepEqual(mappingRequests, []);
  assert.equal(
    model.hydration.ledger?.assignmentsByGarmentKey["base:shirt:1"]
      ?.sourceKind === "catalog" &&
      model.hydration.ledger.assignmentsByGarmentKey["base:shirt:1"].catalogStyleId,
    casualNative.id,
    "Opening and closing cannot mutate the authoritative assignment ledger.",
  );

  // A checked different-style row shows a row-level warning only while the
  // customer has explicitly selected that replacement.
  dialog = await openStyle(casualNative.name);
  const additionalCheckbox = checkboxFor(dialog, 1);
  await act(async () => additionalCheckbox.props.onChange());
  const warning = dialog.findByProps({
    "data-testid": "design-style-replacement-warning",
  });
  assert.equal(
    warning.props["data-occurrence-token"],
    model.projection.occurrences[1]!.target.occurrenceToken,
  );
  assert.equal(
    textContent(warning),
    "This garment currently uses Contemporary Ankara. Applying Casual Native will replace it.",
  );
  await act(async () => additionalCheckbox.props.onChange());
  assert.equal(
    dialog.findAllByProps({ "data-testid": "design-style-replacement-warning" })
      .length,
    0,
  );
  await act(async () => additionalCheckbox.props.onChange());
  const apply = dialog.findByProps({ "data-testid": "apply-design-mapping" });
  assert.equal(textContent(apply), "Apply to 2 garments");
  assert.equal(apply.props.disabled, false);
  await act(async () => apply.props.onClick());
  assert.deepEqual(
    mappingRequests[0]?.map((request) => request.target.occurrenceToken),
    model.projection.occurrences.map((occurrence) => occurrence.target.occurrenceToken),
  );
  const replacement = assignCatalogueStyleToOccurrencesThroughStepRuntime({
    ledger: model.hydration.ledger!,
    activeOccurrences: model.occurrences,
    authority: model.authority,
    requests: mappingRequests[0]!,
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
  assert.equal(replacement.status, "applied");
  assert.equal(
    replacement.ledger.assignmentsByGarmentKey["base:shirt:1"]?.sourceKind ===
      "catalog" &&
      replacement.ledger.assignmentsByGarmentKey["base:shirt:1"].catalogStyleId,
    casualNative.id,
  );
  assert.equal(
    replacement.ledger.assignmentsByGarmentKey["additional:shirt:1"]
      ?.sourceKind === "catalog" &&
      replacement.ledger.assignmentsByGarmentKey["additional:shirt:1"]
        .catalogStyleId,
    casualNative.id,
  );
  assert.equal(
    replacement.ledger.assignmentsByGarmentKey["additional:shirt:1"]
      ?.occurrenceToken,
    model.projection.occurrences[1]!.target.occurrenceToken,
  );

  // New ODGH IDs use the same exact-ID comparison. An unassigned card starts
  // with no checked rows and neither opening path creates a warning.
  dialog = await openStyle(contemporaryAnkara.name);
  assert.equal(checkboxFor(dialog, 0).props.checked, false);
  assert.equal(checkboxFor(dialog, 1).props.checked, true);
  assert.equal(
    dialog.findAllByProps({ "data-testid": "design-style-replacement-warning" })
      .length,
    0,
  );
  await act(async () =>
    dialog
      .findByProps({ "aria-label": "Close garment mapping dialog" })
      .props.onClick(),
  );
  dialog = await openStyle(unassignedStyle.name);
  assert.equal(checkboxFor(dialog, 0).props.checked, false);
  assert.equal(checkboxFor(dialog, 1).props.checked, false);
  assert.equal(
    dialog.findAllByProps({ "data-testid": "design-style-replacement-warning" })
      .length,
    0,
  );
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
  assert.equal(mappingCheckbox.props.checked, true);
  assert.equal(mappingCheckbox.props.disabled, true);
  await act(async () => mappingCheckbox.props.onChange());
  assert.equal(mappingCheckbox.props.checked, true);

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
    true,
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
    [true, true],
    "the new exact occurrence is pre-checked while the existing assignment stays active",
  );
  assert.deepEqual(handledOccurrences, [addedOccurrence.garmentKey]);
  const apply = returnedDialog.findByProps({ "data-testid": "apply-design-mapping" });
  assert.equal(apply.props.disabled, false);
  await act(async () => apply.props.onClick());
  assert.deepEqual(
    mappingRequests.map((requests) => requests.map((request) => request.target.garmentKey)),
    [["base:shirt:1", addedOccurrence.garmentKey]],
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
