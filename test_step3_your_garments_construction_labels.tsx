import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import type {
  DesignStyleStepCatalogueEntry,
  DesignStyleStepOccurrencePresentation,
} from "./src/utils/designStyleStepRuntime";
import { getStep1GarmentDisplayLabel } from "./src/utils/garmentConstructionPricing";
import { projectYourGarmentsConstructionDisplayLabels } from "./src/utils/yourGarmentsConstructionLabel";
import type {
  CanonicalPhysicalGarmentType,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import type {
  CatalogGarmentDesignStyleAssignmentV2,
  UploadedGarmentDesignStyleAssignmentV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogInspection = inspectCustomDetailCatalog([]);

const optionLabel = (optionId: string): string => {
  const label = catalogInspection.byOptionId.get(optionId)?.option?.label;
  if (!label) throw new Error(`MISSING_CATALOGUE_LABEL:${optionId}`);
  return label;
};

const SHORT_LABEL = optionLabel("shirt_std_short");
const MIDLONG_LABEL = optionLabel("shirt_std_midlong");
const LONG_MIDLONG_LABEL = optionLabel("shirt_long_midlong");
const STANDARD_SHIRT = getStep1GarmentDisplayLabel("shirt");
const LONG_SHIRT = getStep1GarmentDisplayLabel("kaftan");

const resolution = (
  garmentType: CanonicalPhysicalGarmentType,
  optionId: string,
  selectionGroup: "shirt_construction",
): GarmentConstructionPricingResolution => ({
  status: "resolved",
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
      optionId,
      selectionGroup,
      priceCents: 6500,
      price: 65,
    },
  ],
  totalPriceCents: 6500,
  totalPrice: 65,
});

const selection = (
  construction: GarmentConstructionPricingResolution,
): GarmentTypeStepSelection => ({
  garmentTypes: ["shirt"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: { shirt: construction },
});

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const snapshot = (value: unknown): string => JSON.stringify(value);

assert.equal(SHORT_LABEL, "Standard Length Shirt, Short Sleeve");
assert.equal(MIDLONG_LABEL, "Standard Length Shirt, Mid-Long Sleeve");
assert.equal(LONG_MIDLONG_LABEL, "Long Length Shirt, Mid-Long Sleeve");
assert.equal(STANDARD_SHIRT, "Standard Shirt");
assert.equal(LONG_SHIRT, "Long Shirt");

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
    ],
    garmentTypeSelection: selection(resolution("shirt", "shirt_std_short", "shirt_construction")),
    catalogInspection,
  });
  assert.deepEqual(labels, { "base:shirt": "Standard Shirt" });
  assert.notEqual(labels["base:shirt"], SHORT_LABEL);
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:kaftan", garmentType: "kaftan", broadLabel: "Long Shirt" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:kaftan", garmentType: "kaftan", sourceRole: "main" },
    ],
    garmentTypeSelection: {
      garmentTypes: ["kaftan"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {
        kaftan: resolution("kaftan", "shirt_long_midlong", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, { "base:kaftan": "Long Shirt" });
  assert.notEqual(labels["base:kaftan"], LONG_MIDLONG_LABEL);
}

{
  const garmentTypeSelection = selection(resolution("shirt", "shirt_std_short", "shirt_construction"));
  const additionalState = {
    schemaVersion: 1 as const,
    byGarmentKey: {
      "additional:shirt:1": resolution("shirt", "shirt_std_midlong", "shirt_construction"),
      "additional:shirt:2": resolution("shirt", "shirt_std_short", "shirt_construction"),
    },
  };
  const presentation = [
    { garmentKey: "base:shirt", garmentType: "shirt" as const, broadLabel: "Shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" as const, broadLabel: "Shirt 2" },
    { garmentKey: "additional:shirt:2", garmentType: "shirt" as const, broadLabel: "Shirt 3" },
  ];
  const physical = [
    { garmentKey: "base:shirt", garmentType: "shirt" as const, sourceRole: "main" as const },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" as const, sourceRole: "additional" as const },
    { garmentKey: "additional:shirt:2", garmentType: "shirt" as const, sourceRole: "additional" as const },
  ];
  const before = snapshot({ garmentTypeSelection, additionalState, presentation, physical });
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: presentation,
    physicalOccurrences: physical,
    garmentTypeSelection,
    additionalGarmentConstructionState: additionalState,
    catalogInspection,
  });
  assert.equal(snapshot({ garmentTypeSelection, additionalState, presentation, physical }), before);
  assert.equal(labels["base:shirt"], "Standard Shirt");
  assert.equal(labels["additional:shirt:1"], "Standard Shirt 2");
  assert.equal(labels["additional:shirt:2"], "Standard Shirt 3");
  assert.notEqual(labels["additional:shirt:1"], MIDLONG_LABEL);
  assert.equal(catalogInspection.byOptionId.get("shirt_std_short")?.option?.priceCents, 6500);
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", broadLabel: "Shirt 2" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", sourceRole: "additional" },
    ],
    garmentTypeSelection: selection(resolution("shirt", "shirt_std_short", "shirt_construction")),
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": resolution("shirt", "shirt_std_short", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, {
    "base:shirt": "Standard Shirt",
    "additional:shirt:1": "Standard Shirt 2",
  });
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "additional:shirt:1", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt 2" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", sourceRole: "additional" },
    ],
    garmentTypeSelection: selection(resolution("shirt", "shirt_std_midlong", "shirt_construction")),
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": resolution("shirt", "shirt_std_short", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.equal(labels["additional:shirt:1"], "Standard Shirt");
  assert.equal(labels["base:shirt"], "Standard Shirt 2");
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt:1", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "base:shirt:2", garmentType: "shirt", broadLabel: "Shirt 2" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt:1", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "base:shirt:2", garmentType: "shirt", sourceRole: "main" },
    ],
    garmentTypeSelection: {
      garmentTypes: ["shirt"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {
        shirt: resolution("shirt", "shirt_std_short", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, {
    "base:shirt:1": "Standard Shirt",
    "base:shirt:2": "Standard Shirt 2",
  });
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "base:kaftan", garmentType: "kaftan", broadLabel: "Long Shirt" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", broadLabel: "Shirt 2" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "base:kaftan", garmentType: "kaftan", sourceRole: "main" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", sourceRole: "additional" },
    ],
    garmentTypeSelection: {
      garmentTypes: ["shirt", "kaftan"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {
        shirt: resolution("shirt", "shirt_std_short", "shirt_construction"),
        kaftan: resolution("kaftan", "shirt_long_midlong", "shirt_construction"),
      },
    },
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": resolution("shirt", "shirt_std_midlong", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, {
    "base:shirt": "Standard Shirt",
    "base:kaftan": "Long Shirt",
    "additional:shirt:1": "Standard Shirt 2",
  });
  assert.equal(labels["additional:shirt:1"]?.endsWith(" 2"), true);
  assert.equal(labels["base:kaftan"]?.endsWith(" 2"), false);
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", broadLabel: "Shirt 3" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt", sourceRole: "additional" },
    ],
    garmentTypeSelection: selection(resolution("shirt", "shirt_std_short", "shirt_construction")),
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": resolution("shirt", "shirt_std_short", "shirt_construction"),
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, {
    "base:shirt": "Standard Shirt",
    "additional:shirt:1": "Standard Shirt 3",
  });
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:skirt", garmentType: "skirt", broadLabel: "Skirt" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:skirt", garmentType: "skirt", sourceRole: "main" },
    ],
    garmentTypeSelection: {
      garmentTypes: ["skirt"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {
        skirt: { status: "unresolved", garmentType: "skirt", code: "missing_catalog_option" },
      },
    },
    catalogInspection,
  });
  assert.deepEqual(labels, {});
}

{
  const inactiveInspection = inspectCustomDetailCatalog([]);
  const inactiveByOptionId = new Map(inactiveInspection.byOptionId);
  inactiveByOptionId.set("shirt_std_short", {
    optionId: "shirt_std_short",
    source: "admin",
    lifecycleStatus: "explicitly_deleted",
    priceStatus: "missing",
  });
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", broadLabel: "Shirt" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt", garmentType: "shirt", sourceRole: "main" },
    ],
    garmentTypeSelection: selection(resolution("shirt", "shirt_std_short", "shirt_construction")),
    catalogInspection: {
      ...inactiveInspection,
      byOptionId: inactiveByOptionId,
    },
  });
  assert.deepEqual(labels, {});
}

const baseTarget = {
  garmentKey: "base:shirt",
  occurrenceToken: "physical-occurrence-v1:1:base:shirt",
};
const midTarget = {
  garmentKey: "additional:shirt:1",
  occurrenceToken: "physical-occurrence-v1:1:additional:shirt:1",
};
const repeatTarget = {
  garmentKey: "additional:shirt:2",
  occurrenceToken: "physical-occurrence-v1:1:additional:shirt:2",
};
const displayLabels = projectYourGarmentsConstructionDisplayLabels({
  presentationOccurrences: [
    { garmentKey: baseTarget.garmentKey, garmentType: "shirt", broadLabel: "Shirt" },
    { garmentKey: midTarget.garmentKey, garmentType: "shirt", broadLabel: "Shirt 2" },
    { garmentKey: repeatTarget.garmentKey, garmentType: "shirt", broadLabel: "Shirt 3" },
  ],
  physicalOccurrences: [
    { garmentKey: baseTarget.garmentKey, garmentType: "shirt", sourceRole: "main" },
    { garmentKey: midTarget.garmentKey, garmentType: "shirt", sourceRole: "additional" },
    { garmentKey: repeatTarget.garmentKey, garmentType: "shirt", sourceRole: "additional" },
  ],
  garmentTypeSelection: selection(resolution("shirt", "shirt_std_short", "shirt_construction")),
  additionalGarmentConstructionState: {
    schemaVersion: 1,
    byGarmentKey: {
      [midTarget.garmentKey]: resolution("shirt", "shirt_std_midlong", "shirt_construction"),
      [repeatTarget.garmentKey]: resolution("shirt", "shirt_std_short", "shirt_construction"),
    },
  },
  catalogInspection,
});

const catalogAssignment = (
  target: { garmentKey: string; occurrenceToken: string },
): CatalogGarmentDesignStyleAssignmentV2 => ({
  garmentKey: target.garmentKey,
  occurrenceToken: target.occurrenceToken,
  assignmentRevision: 1,
  sourceKind: "catalog",
  sourceKey: "source-emerald",
  catalogStyleId: "style-emerald",
  eligibilityFingerprint: "fingerprint",
});

const uploadedAssignment = (
  target: { garmentKey: string; occurrenceToken: string },
): UploadedGarmentDesignStyleAssignmentV2 => ({
  garmentKey: target.garmentKey,
  occurrenceToken: target.occurrenceToken,
  assignmentRevision: 1,
  sourceKind: "uploaded",
  sourceKey: "upload-source",
  uploadedSourceRef: "upload-ref",
});

const occurrences: DesignStyleStepOccurrencePresentation[] = [
  {
    target: baseTarget,
    garmentType: "shirt",
    label: "Shirt",
    status: "incomplete",
    assignment: null,
    assignmentLabel: null,
  },
  {
    target: midTarget,
    garmentType: "shirt",
    label: "Shirt 2",
    status: "complete",
    assignment: catalogAssignment(midTarget),
    assignmentLabel: "Emerald Weave",
  },
  {
    target: repeatTarget,
    garmentType: "shirt",
    label: "Shirt 3",
    status: "complete",
    assignment: uploadedAssignment(repeatTarget),
    assignmentLabel: "Uploaded design",
  },
];

const style: StyleCategory = {
  id: "style-emerald",
  name: "Emerald Weave",
  description: "A published catalogue design.",
  gender: "male",
  targetDemographic: "male",
  options: [],
};

const catalogueEntry: DesignStyleStepCatalogueEntry = {
  style,
  presentation: {
    tier: "adaptable",
    selectable: true,
    requiresAdaptationConfirmation: true,
    originalCompositionLabel: "Trouser",
    selectedGarmentLabels: ["Trouser"],
    customerReason: "This design can be adapted.",
  },
  selected: true,
  request: {
    runtimeGeneration: 1,
    expectedLedgerRevision: 2,
    target: midTarget,
    styleId: style.id,
    sourceKey: "source-emerald",
    eligibilityFingerprint: "fingerprint",
  },
  requestsByOccurrenceToken: {
    [midTarget.occurrenceToken]: {
      runtimeGeneration: 1,
      expectedLedgerRevision: 2,
      target: midTarget,
      styleId: style.id,
      sourceKey: "source-emerald",
      eligibilityFingerprint: "fingerprint",
    },
  },
  selectedOccurrenceLabels: ["Shirt", "Shirt 2"],
  referenceGarmentTypes: ["trouser"],
  adaptationCopy: null,
};

const selectedTargets: { garmentKey: string; occurrenceToken: string }[] = [];
const uploadedTargets: { garmentKey: string; occurrenceToken: string }[] = [];
const clearedTargets: { garmentKey: string; occurrenceToken: string }[] = [];

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(
    <DormantFutureDesignStyleStep
      occurrences={occurrences}
      constructionDisplayLabelByGarmentKey={displayLabels}
      activeOccurrenceTarget={baseTarget}
      catalogueEntries={[catalogueEntry]}
      clearRequest={null}
      clearRequests={occurrences.map((occurrence) => ({
        runtimeGeneration: 1,
        expectedLedgerRevision: 2,
        target: occurrence.target,
      }))}
      runtimeStatus="ready"
      completedCount={2}
      totalCount={3}
      exactSetComplete={false}
      reviewMessage={null}
      mutationError={null}
      stagePrice={null}
      stylesLoadState="ready"
      onSelectOccurrence={(target) => {
        selectedTargets.push(target);
      }}
      onAssignCatalogueStyle={() => undefined}
      onClearAssignment={(request) => {
        clearedTargets.push(request.target);
      }}
      onSelectUploadFile={(target) => {
        uploadedTargets.push(target);
      }}
      onBack={() => undefined}
      onReturnToGarmentType={() => undefined}
      onContinue={() => undefined}
    />,
  );
});

const root = renderer.root;
assert.deepEqual(
  root
    .findAll((node) => node.props?.["data-occurrence-label"])
    .map((row) => row.props["data-occurrence-label"]),
  ["Shirt", "Shirt 2", "Shirt 3"],
);

const rowByLabel = (label: string) =>
  root.findByProps({ "data-occurrence-label": label });
const visibleName = (label: string) =>
  textContent(
    rowByLabel(label).findByProps({
      className: "font-serif text-sm font-bold text-heritage-green",
    }),
  );

assert.equal(visibleName("Shirt"), "Standard Shirt");
assert.equal(visibleName("Shirt 2"), "Standard Shirt 2");
assert.equal(visibleName("Shirt 3"), "Standard Shirt 3");
assert.equal(textContent(root).includes("Choose a design reference for Shirt to continue."), true);
assert.equal(
  textContent(root.findByProps({ "data-testid": "step3-all-designs" })).includes(
    "Applied to Shirt, Shirt 2",
  ),
  true,
);
assert.equal(
  textContent(root.findByProps({ "data-testid": "step3-all-designs" })).includes(
    "Applied to Standard Length",
  ),
  false,
);

const click = async (node: ReactTestInstance) => {
  await act(async () => {
    node.props.onClick({ stopPropagation() {} });
  });
};

await click(
  rowByLabel("Shirt")
    .findAllByType("button")
    .find((button) => textContent(button) === "Choose Design")!,
);
await click(
  rowByLabel("Shirt 2")
    .findAllByType("button")
    .find((button) => textContent(button) === "Change Design")!,
);
assert.equal(
  rowByLabel("Shirt 3")
    .findAllByType("button")
    .find((button) => textContent(button) === "Replace Upload")?.props["aria-label"],
  "Replace uploaded design for Standard Shirt 3",
);

const uploadFor = async (label: string) => {
  const input = rowByLabel(label).findByType("input");
  await act(async () => {
    input.props.onChange({
      currentTarget: {
        files: [new File(["design"], "design.png", { type: "image/png" })],
        value: "design.png",
      },
    });
  });
};
await uploadFor("Shirt");
await uploadFor("Shirt 2");
await uploadFor("Shirt 3");

await click(
  rowByLabel("Shirt 2")
    .findAllByType("button")
    .find((button) => textContent(button) === "Clear")!,
);
await click(
  rowByLabel("Shirt 3")
    .findAllByType("button")
    .find((button) => textContent(button).startsWith("Remove uploaded design from"))!,
);

assert.deepEqual(
  selectedTargets.map((target) => target.occurrenceToken),
  [baseTarget.occurrenceToken, midTarget.occurrenceToken],
);
assert.deepEqual(
  uploadedTargets.map((target) => target.occurrenceToken),
  [baseTarget.occurrenceToken, midTarget.occurrenceToken, repeatTarget.occurrenceToken],
);
assert.deepEqual(
  clearedTargets.map((target) => [target.garmentKey, target.occurrenceToken]),
  [
    [midTarget.garmentKey, midTarget.occurrenceToken],
    [repeatTarget.garmentKey, repeatTarget.occurrenceToken],
  ],
);
assert.deepEqual(
  uploadedTargets.find((target) => target.occurrenceToken === midTarget.occurrenceToken),
  midTarget,
);
assert.equal(
  rowByLabel("Shirt").findByType("input").props["aria-label"],
  "Upload a design for Standard Shirt",
);
assert.equal(
  rowByLabel("Shirt 2").findByType("input").props["aria-label"],
  "Upload a design for Standard Shirt 2",
);
assert.equal(
  rowByLabel("Shirt 2")
    .findAllByType("button")
    .find((button) => textContent(button) === "Clear")?.props["aria-label"],
  "Clear design for Standard Shirt 2",
);
assert.equal(
  rowByLabel("Shirt 3").findByType("input").props["aria-label"],
  "Replace uploaded design for Standard Shirt 3",
);
assert.equal(
  rowByLabel("Shirt 3")
    .findAllByType("button")
    .find((button) => textContent(button).startsWith("Remove uploaded design from"))
    ?.props["aria-label"],
  "Remove uploaded design from Standard Shirt 3",
);

const selectStyle = root
  .findAllByType("button")
  .find((button) => button.props["aria-label"] === "Select Emerald Weave");
await click(selectStyle!);
const dialog = root.findByProps({ "data-testid": "design-garment-mapping-dialog" });
assert.equal(textContent(dialog).includes(SHORT_LABEL), false);
assert.equal(textContent(dialog).includes("Standard Shirt"), false);
assert.equal(textContent(dialog).includes("Shirt 2"), true);
const warning = dialog.findByProps({ "data-testid": "reference-composition-warning" });
assert.equal(textContent(warning).includes("Shirt 2"), true);
assert.equal(textContent(warning).includes(MIDLONG_LABEL), false);
assert.equal(textContent(warning).includes("Standard Shirt"), false);

const firstBaseTarget = {
  garmentKey: "base:shirt:1",
  occurrenceToken: "physical-occurrence-v1:1:base:shirt:1",
};
const secondBaseTarget = {
  garmentKey: "base:shirt:2",
  occurrenceToken: "physical-occurrence-v1:2:base:shirt:2",
};
const twoBaseLabels = projectYourGarmentsConstructionDisplayLabels({
  presentationOccurrences: [
    { garmentKey: firstBaseTarget.garmentKey, garmentType: "shirt", broadLabel: "Shirt" },
    { garmentKey: secondBaseTarget.garmentKey, garmentType: "shirt", broadLabel: "Shirt 2" },
  ],
  physicalOccurrences: [
    { garmentKey: firstBaseTarget.garmentKey, garmentType: "shirt", sourceRole: "main" },
    { garmentKey: secondBaseTarget.garmentKey, garmentType: "shirt", sourceRole: "main" },
  ],
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    audienceSelection: { schemaVersion: 1, demographics: ["male"] },
    constructionByGarment: {
      shirt: resolution("shirt", "shirt_std_short", "shirt_construction"),
    },
  },
  catalogInspection,
});
const twoBaseOccurrences: DesignStyleStepOccurrencePresentation[] = [
  {
    target: firstBaseTarget,
    garmentType: "shirt",
    label: "Shirt",
    status: "incomplete",
    assignment: null,
    assignmentLabel: null,
  },
  {
    target: secondBaseTarget,
    garmentType: "shirt",
    label: "Shirt 2",
    status: "incomplete",
    assignment: null,
    assignmentLabel: null,
  },
];
const secondBaseActions: { garmentKey: string; occurrenceToken: string }[] = [];
let twoBaseRenderer!: ReturnType<typeof create>;
await act(async () => {
  twoBaseRenderer = create(
    <DormantFutureDesignStyleStep
      occurrences={twoBaseOccurrences}
      constructionDisplayLabelByGarmentKey={twoBaseLabels}
      activeOccurrenceTarget={firstBaseTarget}
      catalogueEntries={[]}
      clearRequest={null}
      clearRequests={[]}
      runtimeStatus="ready"
      completedCount={0}
      totalCount={2}
      exactSetComplete={false}
      reviewMessage={null}
      mutationError={null}
      stagePrice={null}
      stylesLoadState="ready"
      onSelectOccurrence={(target) => {
        secondBaseActions.push(target);
      }}
      onAssignCatalogueStyle={() => undefined}
      onClearAssignment={() => undefined}
      onSelectUploadFile={(target) => {
        secondBaseActions.push(target);
      }}
      onBack={() => undefined}
      onReturnToGarmentType={() => undefined}
      onContinue={() => undefined}
    />,
  );
});
const twoBaseRoot = twoBaseRenderer.root;
assert.deepEqual(
  twoBaseRoot
    .findAll((node) => node.props?.["data-occurrence-label"])
    .map((row) => row.props["data-occurrence-label"]),
  ["Shirt", "Shirt 2"],
);
assert.deepEqual(
  twoBaseRoot
    .findAll((node) => node.props?.["data-occurrence-token"])
    .map((row) => row.props["data-occurrence-token"]),
  [firstBaseTarget.occurrenceToken, secondBaseTarget.occurrenceToken],
);
const twoBaseName = (label: string) =>
  textContent(
    twoBaseRoot.findByProps({ "data-occurrence-label": label }).findByProps({
      className: "font-serif text-sm font-bold text-heritage-green",
    }),
  );
assert.equal(twoBaseName("Shirt"), "Standard Shirt");
assert.equal(twoBaseName("Shirt 2"), "Standard Shirt 2");
assert.notEqual(twoBaseName("Shirt 2"), "Shirt 2");
const secondBaseRow = twoBaseRoot.findByProps({ "data-occurrence-label": "Shirt 2" });
await click(
  secondBaseRow
    .findAllByType("button")
    .find((button) => textContent(button) === "Choose Design")!,
);
await act(async () => {
  secondBaseRow.findByType("input").props.onChange({
    currentTarget: {
      files: [new File(["design"], "second.png", { type: "image/png" })],
      value: "second.png",
    },
  });
});
assert.deepEqual(secondBaseActions, [secondBaseTarget, secondBaseTarget]);
assert.equal(
  secondBaseActions.every(
    (target) =>
      target.garmentKey === secondBaseTarget.garmentKey &&
      target.occurrenceToken === secondBaseTarget.occurrenceToken &&
      target.occurrenceToken !== "Standard Shirt 2",
  ),
  true,
);

{
  const unresolvedOccurrence: DesignStyleStepOccurrencePresentation = {
    target: baseTarget,
    garmentType: "shirt",
    label: "Shirt",
    status: "incomplete",
    assignment: null,
    assignmentLabel: null,
  };
  let fallbackRenderer!: ReturnType<typeof create>;
  await act(async () => {
    fallbackRenderer = create(
      <DormantFutureDesignStyleStep
        occurrences={[unresolvedOccurrence]}
        constructionDisplayLabelByGarmentKey={{}}
        activeOccurrenceTarget={baseTarget}
        catalogueEntries={[]}
        clearRequest={null}
        runtimeStatus="ready"
        completedCount={0}
        totalCount={1}
        exactSetComplete={false}
        reviewMessage={null}
        mutationError={null}
        stagePrice={null}
        stylesLoadState="ready"
        uploadStateByOccurrenceToken={{
          [baseTarget.occurrenceToken]: { status: "pending" },
        }}
        onSelectOccurrence={() => undefined}
        onAssignCatalogueStyle={() => undefined}
        onClearAssignment={() => undefined}
        onSelectUploadFile={() => undefined}
        onBack={() => undefined}
        onReturnToGarmentType={() => undefined}
        onContinue={() => undefined}
      />,
    );
  });
  const fallbackRoot = fallbackRenderer.root;
  const fallbackRow = fallbackRoot.findByProps({ "data-occurrence-label": "Shirt" });
  assert.equal(
    textContent(
      fallbackRow.findByProps({
        className: "font-serif text-sm font-bold text-heritage-green",
      }),
    ),
    "Shirt",
  );
  assert.equal(
    textContent(fallbackRow).includes("Preparing your uploaded design for Shirt..."),
    true,
  );
  assert.equal(textContent(fallbackRow).includes("Standard Shirt"), false);
}

{
  let preparingRenderer!: ReturnType<typeof create>;
  await act(async () => {
    preparingRenderer = create(
      <DormantFutureDesignStyleStep
        occurrences={[twoBaseOccurrences[1]!]}
        constructionDisplayLabelByGarmentKey={twoBaseLabels}
        activeOccurrenceTarget={secondBaseTarget}
        catalogueEntries={[]}
        clearRequest={null}
        runtimeStatus="ready"
        completedCount={0}
        totalCount={1}
        exactSetComplete={false}
        reviewMessage={null}
        mutationError={null}
        stagePrice={null}
        stylesLoadState="ready"
        uploadStateByOccurrenceToken={{
          [secondBaseTarget.occurrenceToken]: { status: "pending" },
        }}
        onSelectOccurrence={() => undefined}
        onAssignCatalogueStyle={() => undefined}
        onClearAssignment={() => undefined}
        onSelectUploadFile={() => undefined}
        onBack={() => undefined}
        onReturnToGarmentType={() => undefined}
        onContinue={() => undefined}
      />,
    );
  });
  const preparingRow = preparingRenderer.root.findByProps({
    "data-occurrence-label": "Shirt 2",
  });
  assert.equal(
    preparingRow.props["data-occurrence-token"],
    secondBaseTarget.occurrenceToken,
  );
  assert.equal(
    textContent(preparingRow).includes(
      "Preparing your uploaded design for Standard Shirt 2...",
    ),
    true,
  );
  assert.equal(preparingRow.findAllByType("input").length, 0);
  assert.equal(
    preparingRow
      .findAllByType("button")
      .find((button) => textContent(button) === "Upload Design")?.props["aria-label"],
    "Upload a design for Standard Shirt 2",
  );
}

console.log("step3 your garments construction labels: PASS");
