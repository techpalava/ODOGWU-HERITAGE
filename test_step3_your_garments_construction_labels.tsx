import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import type {
  DesignStyleStepCatalogueEntry,
  DesignStyleStepOccurrencePresentation,
} from "./src/utils/designStyleStepRuntime";
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
  assert.equal(labels["base:shirt"], SHORT_LABEL);
  assert.equal(labels["additional:shirt:1"], MIDLONG_LABEL);
  assert.equal(labels["additional:shirt:2"], `${SHORT_LABEL} 3`);
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
    "base:shirt": SHORT_LABEL,
    "additional:shirt:1": `${SHORT_LABEL} 2`,
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
  assert.equal(labels["additional:shirt:1"], SHORT_LABEL);
  assert.equal(labels["base:shirt"], MIDLONG_LABEL);
}

{
  const labels = projectYourGarmentsConstructionDisplayLabels({
    presentationOccurrences: [
      { garmentKey: "base:shirt:1", garmentType: "shirt", broadLabel: "Shirt" },
      { garmentKey: "base:shirt:2", garmentType: "shirt", broadLabel: "Shirt 2" },
      { garmentKey: "base:skirt", garmentType: "skirt", broadLabel: "Skirt" },
    ],
    physicalOccurrences: [
      { garmentKey: "base:shirt:1", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "base:shirt:2", garmentType: "shirt", sourceRole: "main" },
      { garmentKey: "base:skirt", garmentType: "skirt", sourceRole: "main" },
    ],
    garmentTypeSelection: {
      garmentTypes: ["shirt", "skirt"],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {
        shirt: resolution("shirt", "shirt_std_short", "shirt_construction"),
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

assert.equal(visibleName("Shirt"), SHORT_LABEL);
assert.equal(visibleName("Shirt 2"), MIDLONG_LABEL);
assert.equal(visibleName("Shirt 3"), `${SHORT_LABEL} 3`);
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
  `Replace uploaded design for ${SHORT_LABEL} 3`,
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
  clearedTargets.map((target) => target.occurrenceToken),
  [midTarget.occurrenceToken, repeatTarget.occurrenceToken],
);
assert.equal(
  rowByLabel("Shirt").findByType("input").props["aria-label"],
  `Upload a design for ${SHORT_LABEL}`,
);
assert.equal(
  rowByLabel("Shirt 3").findByType("input").props["aria-label"],
  `Replace uploaded design for ${SHORT_LABEL} 3`,
);
assert.equal(
  rowByLabel("Shirt 3")
    .findAllByType("button")
    .find((button) => textContent(button).startsWith("Remove uploaded design from"))
    ?.props["aria-label"],
  `Remove uploaded design from ${SHORT_LABEL} 3`,
);

const selectStyle = root
  .findAllByType("button")
  .find((button) => button.props["aria-label"] === "Select Emerald Weave");
await click(selectStyle!);
const dialog = root.findByProps({ "data-testid": "design-garment-mapping-dialog" });
assert.equal(textContent(dialog).includes(SHORT_LABEL), false);
assert.equal(textContent(dialog).includes("Shirt 2"), true);
const warning = dialog.findByProps({ "data-testid": "reference-composition-warning" });
assert.equal(textContent(warning).includes("Shirt 2"), true);
assert.equal(textContent(warning).includes(MIDLONG_LABEL), false);

console.log("step3 your garments construction labels: PASS");
