/**
 * Step 4 length switch: Standard and Long garments of one family (Shirt, Dress, Skirt) offer the
 * Main Garment options of both lengths, and picking the other length switches the garment type
 * in the order while the garment keeps its key (and everything stored against it).
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { GarmentTypeStep } from "./src/components/GarmentTypeStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  CanonicalPhysicalGarmentType,
  FabricAllocationState,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  buildAuthoritativePhysicalOccurrences,
  resolveOccurrenceConstruction,
  type PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
} from "./src/utils/garmentTypeStepState";
import {
  getOptionGarmentLength,
  getStep1LengthSwitchNote,
  resolveBasePhysicalGarmentType,
} from "./src/utils/garmentLengthVariant";
import {
  placeLengthSwitchedGarmentOnFabric,
  planGarmentLengthSwitch,
  previewLengthSwitchedOccurrences,
} from "./src/utils/garmentLengthSwitch";
import { FutureAdditionalGarmentFabricDialog } from "./src/components/FutureAdditionalGarmentFabricDialog";
import type { Fabric } from "./src/types";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  resolveFutureCustomDetailPhysicalSubjects,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import {
  getFutureFabricCapacityComposition,
  reconcileFutureFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import { inspectDraftFabricAllocations } from "./src/utils/fabricAllocationPersistence";
import { reconcileAdditionalGarmentDependencies } from "./src/utils/additionalGarmentDomain";
import { reconcileAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import { resolveMeasurementProfile } from "./src/utils/measurementBlueprint";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import {
  quoteFutureOrderPayableTotal,
  recomputeFutureOrderPayableTotal,
} from "./src/utils/futureOrderPayableTotal";
import { createCatalogueAuthoritativeFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
} from "./src/utils/designStyleAuthority";
import { buildDesignStyleDraftValidationAuthority } from "./src/utils/designStyleDraftPersistence";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const catalog = catalogInspection.activeOptions;

const step1 = (
  garmentTypes: CanonicalPhysicalGarmentType[],
  demographic: "male" | "female" = "male",
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const pick = (
  resolution: GarmentConstructionPricingResolution | undefined,
  selectionGroup: string,
  optionId: string,
): GarmentConstructionPricingResolution => {
  assert.ok(resolution);
  const selected = selectGarmentConstructionOption({
    resolution,
    selectionGroup: selectionGroup as never,
    optionId,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(selected.status, "selected", `${optionId} is selectable`);
  return selected.resolution;
};

/** Step 1 selection with the main garment `stepOneType` switched in Step 4 to `optionId`. */
const switched = (
  selection: GarmentTypeStepSelection,
  stepOneType: CanonicalPhysicalGarmentType,
  selectionGroup: string,
  optionId: string,
): GarmentTypeStepSelection => ({
  ...selection,
  constructionByGarment: {
    ...selection.constructionByGarment,
    [stepOneType]: pick(selection.constructionByGarment[stepOneType], selectionGroup, optionId),
  },
});

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const MAIN_GARMENT_GROUP: Partial<Record<CanonicalPhysicalGarmentType, string>> = {
  shirt: "shirt_construction",
  kaftan: "shirt_construction",
  dress: "dress_construction",
  full_length_gown: "dress_construction",
  skirt: "skirt_length",
  long_skirt: "skirt_length",
};

const renderCustomDetails = ({
  selection,
  block = null,
  constructionEvents = [],
}: {
  selection: GarmentTypeStepSelection;
  block?: { parentGarmentKey: string; message: string } | null;
  constructionEvents?: string[][];
}) => {
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: selection,
    catalogInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const inputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureCustomDetailsStep, {
        stage: "custom_details",
        reconciliation,
        catalogue: projectFutureCustomDetailsCatalogue({
          garmentTypeSelection: selection,
          reconciliation,
          activeOptions: catalog,
          additionalGarments: [],
        }),
        personalizedInputs: inputs.state,
        completion: validateGarmentScopedCustomDetailsCompletion({
          earlierStagesComplete: true,
          reconciliation,
          personalizedInputs: inputs,
        }),
        pricing: calculateGarmentScopedCustomDetailsPricing({ reconciliation, catalogInspection }),
        orderLevelCustomDetailsPrice: 0,
        constructionBreakdown: { status: "complete", rows: [] },
        constructionSubtotal: 0,
        designSelections: {},
        selectedStyle: null,
        additionalGarments: [],
        additionalGarmentConstructionOptions: [],
        onSingleSelect: () => undefined,
        onClearSelection: () => undefined,
        onConstructionSelect: (...event: string[]) => {
          constructionEvents.push(event);
        },
        constructionLengthSwitchBlock: block,
        onOpenFabricStep: () => {
          constructionEvents.push(["open-fabric"]);
        },
        onToggleMultiSelect: () => undefined,
        onPersonalizedTextChange: () => undefined,
        onDecorativeFeatureEnable: () => undefined,
        onDecorativeFeatureDisable: () => undefined,
        onDecorativeFeatureGarmentAssign: () => undefined,
        onClearDecorativeFeatures: () => undefined,
        onMonogramPlacementChange: () => undefined,
        onMonogramTextChange: () => undefined,
        onAccessoryToggle: () => undefined,
        onClearAccessories: () => undefined,
        onAddAdditionalGarment: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  return renderer;
};

const mainGarmentInputs = (
  renderer: ReturnType<typeof create>,
  parentGarmentKey: string,
  selectionGroup: string,
) =>
  renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith(`future-custom-detail-${parentGarmentKey}-${selectionGroup}-`),
  );

// --- 1. Every Standard and Long garment shows both lengths in Step 4 (Layout B). -------------
for (const garmentType of [
  "shirt",
  "kaftan",
  "dress",
  "full_length_gown",
  "skirt",
  "long_skirt",
] as const) {
  const selectionGroup = MAIN_GARMENT_GROUP[garmentType]!;
  const demographic = garmentType === "shirt" || garmentType === "kaftan" ? "male" : "female";
  const renderer = renderCustomDetails({ selection: step1([garmentType], demographic) });
  const lengthGroups = renderer.root.findAll(
    (node) => node.type === "div" && typeof node.props["data-construction-length-group"] === "string",
  );
  assert.deepEqual(
    lengthGroups.map((node) => textContent(node.children[0] as ReactTestInstance)),
    ["Standard Length", "Long Length"],
    `${garmentType}: Main Garment options are grouped Standard Length then Long Length`,
  );
  const optionIds = mainGarmentInputs(renderer, `base:${garmentType}`, selectionGroup).map(
    (node) => String(node.props.id).replace(`future-custom-detail-base:${garmentType}-${selectionGroup}-`, ""),
  );
  const lengths = new Set(optionIds.map((id) => getOptionGarmentLength(selectionGroup as never, id)));
  assert.deepEqual([...lengths].sort(), ["long", "standard"], `${garmentType} offers both lengths`);
  assert.equal(
    mainGarmentInputs(renderer, `base:${garmentType}`, selectionGroup).every((node) => !node.props.disabled),
    true,
    `${garmentType}: nothing is locked when the order holds one length`,
  );
}

// Option prices and text are the catalogue's, unchanged.
{
  const renderer = renderCustomDetails({ selection: step1(["shirt"]) });
  const labels = renderer.root
    .findAll((node) => node.type === "label" && typeof node.props.htmlFor === "string" && node.props.htmlFor.includes("-shirt_construction-"))
    .map((node) => textContent(node));
  for (const option of catalog.filter((candidate) => candidate.selectionGroup === "shirt_construction")) {
    assert.ok(labels.some((label) => label.includes(option.label)), `${option.label} is shown as-is`);
  }
}

// --- 2. Switching changes the garment type, units, price, label and measurement profile. ----
const shirtSelection = step1(["shirt"]);
const shirtSwitched = switched(shirtSelection, "shirt", "shirt_construction", "shirt_long_short");
assert.equal(resolveBasePhysicalGarmentType(shirtSwitched, "shirt"), "kaftan");
assert.equal(resolveBasePhysicalGarmentType(shirtSelection, "shirt"), "shirt");
const shirtOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: shirtSwitched,
  effectiveGarmentTypeSelection: shirtSwitched,
});
assert.deepEqual(
  shirtOccurrences.map((occurrence) => [occurrence.garmentKey, occurrence.garmentType, occurrence.fabricUnits]),
  [["base:shirt", "kaftan", 1]],
  "A Standard Shirt switched to Long Length is a Long Shirt under the same key",
);
assert.equal(
  resolveOccurrenceConstruction({
    garmentKey: "base:shirt",
    garmentType: "kaftan",
    sourceRole: "main",
    garmentTypeSelection: shirtSwitched,
  })?.status,
  "resolved",
  "Its construction is still found under the Step 1 card",
);
{
  const kaftanDefault = resolveGarmentConstructionPricing("kaftan", catalog);
  const switchedResolution = shirtSwitched.constructionByGarment.shirt;
  assert.ok(kaftanDefault.status === "resolved" && switchedResolution?.status === "resolved");
  assert.equal(switchedResolution.totalPriceCents, kaftanDefault.totalPriceCents, "Price follows the Long Shirt option");
}
const dressSelection = step1(["dress"], "female");
const dressSwitched = switched(dressSelection, "dress", "dress_construction", "dress_long_sleeveless");
assert.deepEqual(
  getFutureFabricCapacityComposition(dressSwitched),
  [{ key: "base:dress", garmentType: "full_length_gown", fabricUnits: 2 }],
  "A Standard Dress switched to Long Length needs a full fabric (only Dress <-> Long Dress changes units)",
);
assert.deepEqual(
  getFutureFabricCapacityComposition(
    switched(step1(["skirt"], "female"), "skirt", "skirt_length", "skirt_long"),
  ),
  [{ key: "base:skirt", garmentType: "long_skirt", fabricUnits: 1 }],
);
assert.deepEqual(
  getFutureFabricCapacityComposition(
    switched(step1(["long_skirt"], "female"), "long_skirt", "skirt_length", "skirt_std"),
  ),
  [{ key: "base:long_skirt", garmentType: "skirt", fabricUnits: 1 }],
  "A Long Skirt card may switch to Standard Length",
);
{
  const profile = resolveMeasurementProfile({
    garment: { garmentKey: "base:shirt", garmentType: "kaftan" } as never,
    garmentTypeSelection: shirtSwitched,
  });
  assert.equal(profile.status, "resolved", "Measurements resolve the Long Shirt profile for the switched garment");
  if (profile.status === "resolved") {
    assert.equal(profile.constructionOptionId, "shirt_long_short");
  }
}

// Step 4 subjects keep the key and follow the type; custom details stored on the key stay.
{
  const subjects = resolveFutureCustomDetailPhysicalSubjects(shirtSwitched).subjects;
  assert.deepEqual(
    subjects.map((subject) => [subject.garmentKey, subject.parentGarmentKey, subject.parentGarmentType]),
    [["base:shirt", "base:shirt", "kaftan"]],
  );
  const neck = catalog.find((option) => option.selectionGroup === "neck_design" && option.active);
  assert.ok(neck);
  const existingState = setGarmentScopedCustomDetailSelection(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
    "neck_design",
    neck.id,
  );
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: shirtSwitched,
    catalogInspection,
    existingState,
  });
  assert.equal(
    reconciliation.state.selectionsByGarmentKey["base:shirt"]?.neck_design,
    neck.id,
    "A neck design picked before the switch survives it",
  );
}

// The Step 1 reconcile (draft load / Step 1 visit) keeps a switched construction.
for (const [types, stepOne, group, optionId] of [
  [["shirt"], "shirt", "shirt_construction", "shirt_long_midlong"],
  [["kaftan"], "kaftan", "shirt_construction", "shirt_std_short"],
  [["dress"], "dress", "dress_construction", "dress_long_short"],
  [["full_length_gown"], "full_length_gown", "dress_construction", "dress_std_midlong"],
  [["skirt"], "skirt", "skirt_length", "skirt_long"],
  [["long_skirt"], "long_skirt", "skirt_length", "skirt_std"],
] as const) {
  const persisted = switched(step1([...types], "female"), stepOne, group, optionId);
  const reloaded = reconcileGarmentTypeStepSelection({
    persistedSelection: persisted,
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const component = reloaded.constructionByGarment[stepOne];
  assert.ok(component?.status === "resolved");
  assert.equal(
    component.components.find((candidate) => candidate.selectionGroup === group)?.optionId,
    optionId,
    `${stepOne} switched to ${optionId} survives reload`,
  );
}

// Old drafts (no switch) load exactly as before.
{
  const old = step1(["shirt", "kaftan", "dress", "long_skirt"], "male");
  const reloaded = reconcileGarmentTypeStepSelection({
    persistedSelection: old,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(reloaded.selection.constructionByGarment, old.constructionByGarment);
  assert.deepEqual(
    buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: old,
      effectiveGarmentTypeSelection: old,
    }).map((occurrence) => [occurrence.garmentKey, occurrence.garmentType, occurrence.fabricUnits])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    [
      ["base:dress", "dress", 1],
      ["base:kaftan", "kaftan", 1],
      ["base:long_skirt", "long_skirt", 1],
      ["base:shirt", "shirt", 1],
    ],
  );
  for (const stepOneType of old.garmentTypes) {
    assert.equal(getStep1LengthSwitchNote(old, stepOneType), null);
  }
}

// --- 3. Both lengths in one order: every garment may switch to any length. -------------------
{
  const bothShirts = step1(["shirt", "kaftan"]);
  const events: string[][] = [];
  const renderer = renderCustomDetails({ selection: bothShirts, constructionEvents: events });
  for (const key of ["base:shirt", "base:kaftan"]) {
    const inputs = mainGarmentInputs(renderer, key, "shirt_construction");
    assert.equal(inputs.length, 4, `${key} offers both lengths`);
    assert.ok(inputs.every((node) => !node.props.disabled), `${key} has no locked option`);
  }
  assert.equal(
    renderer.root.findAll((node) => node.props["data-construction-length-lock-reason"] !== undefined).length,
    0,
    "No lock message",
  );
  const standardShirtLong = mainGarmentInputs(renderer, "base:shirt", "shirt_construction").find((node) =>
    String(node.props.id).endsWith("shirt_long_short"),
  )!;
  act(() => {
    standardShirtLong.props.onChange();
  });
  assert.deepEqual(events, [["base:shirt", "shirt", "shirt_construction", "shirt_long_short"]]);
  const plan = planGarmentLengthSwitch({
    parentGarmentKey: "base:shirt",
    currentGarmentType: "shirt",
    selectionGroup: "shirt_construction",
    optionId: "shirt_long_short",
    fabricAllocationState: emptyFabricState(),
    fabrics: [],
  });
  assert.equal(plan.status === "switch" && plan.toGarmentType, "kaftan");

  // Every family can end with two garments of one type; Step 1 reload, garments, fabric
  // reconcile and saved-draft inspection all accept it.
  const cases = [
    { types: ["shirt", "kaftan"], key: "kaftan", group: "shirt_construction", option: "shirt_std_short", to: "shirt", demographic: "male" },
    { types: ["shirt", "kaftan"], key: "shirt", group: "shirt_construction", option: "shirt_long_short", to: "kaftan", demographic: "male" },
    { types: ["dress", "full_length_gown"], key: "dress", group: "dress_construction", option: "dress_long_sleeveless", to: "full_length_gown", demographic: "female" },
    { types: ["dress", "full_length_gown"], key: "full_length_gown", group: "dress_construction", option: "dress_std_sleeveless", to: "dress", demographic: "female" },
    { types: ["skirt", "long_skirt"], key: "skirt", group: "skirt_length", option: "skirt_long", to: "long_skirt", demographic: "female" },
    { types: ["skirt", "long_skirt"], key: "long_skirt", group: "skirt_length", option: "skirt_std", to: "skirt", demographic: "female" },
  ] as const;
  for (const testCase of cases) {
    const before = step1([...testCase.types], testCase.demographic);
    const after = switched(before, testCase.key, testCase.group, testCase.option);
    const reloaded = reconcileGarmentTypeStepSelection({
      persistedSelection: after,
      selectedGarmentTypes: [...testCase.types],
      selectedDemographic: testCase.demographic,
      normalizedCustomDetailCatalog: catalog,
    }).selection;
    assert.deepEqual(reloaded.constructionByGarment, after.constructionByGarment, `${testCase.key} -> ${testCase.to} survives reload`);
    const occurrences = buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: reloaded,
      effectiveGarmentTypeSelection: reloaded,
    });
    assert.deepEqual(
      occurrences.map((occurrence) => occurrence.garmentType),
      [testCase.to, testCase.to],
      `${testCase.key} -> ${testCase.to}: two garments of one type`,
    );
    const allocations = occurrences.map((occurrence, index) =>
      allocation(`a${index}`, `F${index}`, [
        {
          garmentKey: occurrence.garmentKey,
          code: `BASE_${occurrence.garmentType.toUpperCase()}`,
          garmentType: occurrence.garmentType,
          fabricUnits: occurrence.fabricUnits as 1 | 2,
          sourceRole: "main",
        },
      ]),
    );
    assert.deepEqual(
      reconcileFutureFabricAllocationState({
        state: fabricState(allocations),
        garmentTypeSelection: reloaded,
        requiredPhysicalOccurrences: occurrences,
      }).fabricAllocations,
      allocations,
      "Fabric keeps both garments",
    );
    assert.equal(
      inspectDraftFabricAllocations({ fabricAllocations: allocations, designSelections: {} } as unknown as GuestDesignDraft).status,
      "valid",
      "A saved order with two garments of one type loads back",
    );
    for (const occurrence of occurrences) {
      const profile = resolveMeasurementProfile({ garment: occurrence, garmentTypeSelection: reloaded });
      assert.equal(profile.status, "resolved", `${occurrence.garmentKey} measures as ${testCase.to}`);
    }
  }
}

function emptyFabricState(): FabricAllocationState {
  return {
    fabricAllocations: [],
    activeAllocationId: null,
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
}

// --- 4. Step 1 note. --------------------------------------------------------------------------
assert.equal(getStep1LengthSwitchNote(shirtSwitched, "shirt"), "Switched to Long Length in Step 4");
assert.equal(
  getStep1LengthSwitchNote(
    switched(step1(["full_length_gown"], "female"), "full_length_gown", "dress_construction", "dress_std_short"),
    "full_length_gown",
  ),
  "Switched to Standard Length in Step 4",
);
{
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(GarmentTypeStep, {
        selectedGarmentTypes: ["shirt"],
        selectedDemographics: ["male"],
        normalizedCustomDetailCatalog: catalog,
        onGarmentTypesChange: () => undefined,
        onDemographicsChange: () => undefined,
        onConstructionDefaultsChange: () => undefined,
        lengthSwitchNotes: { shirt: "Switched to Long Length in Step 4" },
      }),
    );
  });
  const notes = renderer.root.findAll(
    (node) => node.type === "p" && node.props["data-garment-type-length-switch-note"] !== undefined,
  );
  assert.deepEqual(
    notes.map((node) => [node.props["data-garment-type-length-switch-note"], textContent(node)]),
    [["shirt", "Switched to Long Length in Step 4"]],
    "Step 1 keeps the Standard Shirt card selected with the note under it",
  );
  assert.match(String(notes[0]!.props.className), /text-\[11px\] leading-relaxed text-heritage-ink\/60/);
}

// --- 5. Fabric: resize, block, and free capacity. ---------------------------------------------
function allocation(
  allocationId: string,
  fabricCode: string,
  assignments: FabricAllocationState["fabricAllocations"][number]["garmentAssignments"],
): FabricAllocationState["fabricAllocations"][number] {
  return { allocationId, fabricCode, garmentAssignments: assignments };
}
function fabricState(allocations: FabricAllocationState["fabricAllocations"]): FabricAllocationState {
  return { ...emptyFabricState(), fabricAllocations: allocations, activeAllocationId: allocations[0]?.allocationId ?? null };
}
const IN_STOCK = { code: "F1", stock: 5, stockStatus: "IN_STOCK" as const };

{
  // Dress + Standard Shirt share one fabric: Dress -> Long Dress does not fit.
  const shared = fabricState([
    allocation("a1", "F1", [
      { garmentKey: "base:dress", code: "BASE_DRESS", garmentType: "dress", fabricUnits: 1, sourceRole: "main" },
      { garmentKey: "base:shirt", code: "BASE_SHIRT", garmentType: "shirt", fabricUnits: 1, sourceRole: "main" },
    ]),
  ]);
  const needsFabric = planGarmentLengthSwitch({
    parentGarmentKey: "base:dress",
    currentGarmentType: "dress",
    selectionGroup: "dress_construction",
    optionId: "dress_long_sleeveless",
    fabricAllocationState: shared,
    fabrics: [IN_STOCK],
  });
  assert.equal(needsFabric.status, "needs_fabric", "A shared fabric that cannot hold a Long Dress asks for a fabric");
  assert.ok(needsFabric.status === "needs_fabric");
  assert.deepEqual(needsFabric.fabricAllocationStateWithoutGarment.fabricAllocations[0]!.garmentAssignments.map((a) => a.garmentKey), ["base:shirt"]);
  assert.deepEqual(needsFabric.assignment, {
    garmentKey: "base:dress",
    code: "BASE_FULL_LENGTH_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "main",
  });
  // Out of stock on a shared fabric also asks for a fabric (a new piece is needed anyway).
  assert.equal(
    planGarmentLengthSwitch({
      parentGarmentKey: "base:dress",
      currentGarmentType: "dress",
      selectionGroup: "dress_construction",
      optionId: "dress_long_sleeveless",
      fabricAllocationState: shared,
      fabrics: [{ code: "F1", stock: 0, stockStatus: "OUT_OF_STOCK" }],
    }).status,
    "needs_fabric",
  );

  // The customer picks a fabric in the picker; the switch applies with the new assignment.
  const fabricOf = (code: string, overrides: Partial<Fabric> = {}): Fabric => ({
    code,
    name: `Fabric ${code}`,
    description: "Fixture",
    color: "Green",
    colorHex: "#0A4A33",
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    category: "HiTarget Ankara",
    price: 10,
    stock: 5,
    ...overrides,
  });
  const fabrics = [fabricOf("F1"), fabricOf("F2"), fabricOf("F3", { stockStatus: "OUT_OF_STOCK", stock: 0 })];
  const dressShirt = step1(["dress", "shirt"], "female");
  const dressShirtLong = switched(dressShirt, "dress", "dress_construction", "dress_long_sleeveless");
  const previewOccurrences = previewLengthSwitchedOccurrences(
    buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: dressShirt,
      effectiveGarmentTypeSelection: dressShirt,
    }),
    "base:dress",
    "full_length_gown",
  );
  assert.deepEqual(
    previewOccurrences.map((occurrence) => [occurrence.garmentKey, occurrence.garmentType, occurrence.fabricUnits]),
    [["base:shirt", "shirt", 1], ["base:dress", "full_length_gown", 2]],
  );
  const place = (choice: Parameters<typeof placeLengthSwitchedGarmentOnFabric>[0]["choice"], plan = needsFabric) =>
    placeLengthSwitchedGarmentOnFabric({
      plan,
      parentGarmentKey: "base:dress",
      garmentTypeSelection: dressShirtLong,
      requiredPhysicalOccurrences: previewOccurrences,
      fabrics,
      choice,
    });
  const layout = (state: FabricAllocationState) =>
    state.fabricAllocations.map((candidate) => [
      candidate.fabricCode,
      candidate.garmentAssignments.map((assignment) => `${assignment.garmentKey}:${assignment.garmentType}:${assignment.fabricUnits}`),
    ]);
  const sameFabric = place({ kind: "fabric", fabricCode: "F1" });
  assert.ok(sameFabric.status === "assigned");
  assert.deepEqual(
    layout(sameFabric.fabricAllocationState),
    [["F1", ["base:shirt:shirt:1"]], ["F1", ["base:dress:full_length_gown:2"]]],
    "The same fabric as a new piece; the Standard Shirt keeps its piece",
  );
  const otherFabric = place({ kind: "fabric", fabricCode: "F2" });
  assert.ok(otherFabric.status === "assigned");
  assert.deepEqual(
    layout(otherFabric.fabricAllocationState),
    [["F1", ["base:shirt:shirt:1"]], ["F2", ["base:dress:full_length_gown:2"]]],
  );
  // The fabric state after the pick passes reconciliation with the Long Dress construction.
  assert.deepEqual(
    layout(
      reconcileFutureFabricAllocationState({
        state: otherFabric.fabricAllocationState,
        garmentTypeSelection: dressShirtLong,
        requiredPhysicalOccurrences: buildAuthoritativePhysicalOccurrences({
          sourceKind: "catalogue",
          step1GarmentTypeSelection: dressShirtLong,
          effectiveGarmentTypeSelection: dressShirtLong,
        }),
      }),
    ),
    layout(otherFabric.fabricAllocationState),
  );
  const soldOut = place({ kind: "fabric", fabricCode: "F3" });
  assert.equal(soldOut.status, "blocked", "A sold-out fabric can't be picked");
  // A new piece of the same fabric needs stock for it.
  const lastPiece = placeLengthSwitchedGarmentOnFabric({
    plan: needsFabric,
    parentGarmentKey: "base:dress",
    garmentTypeSelection: dressShirtLong,
    requiredPhysicalOccurrences: previewOccurrences,
    fabrics: [fabricOf("F1", { stock: 1 }), fabricOf("F2")],
    choice: { kind: "fabric", fabricCode: "F1" },
  });
  assert.equal(lastPiece.status, "blocked", "No second piece when only one is in stock");

  // The picker is the Step 4 fabric picker, for this garment at its new length.
  let picked: string[] = [];
  let pickerRenderer!: ReturnType<typeof create>;
  act(() => {
    pickerRenderer = create(
      createElement(FutureAdditionalGarmentFabricDialog, {
        transaction: { transactionId: 0, phase: "catalogue", origin: "change_existing", garmentKey: "base:dress", garmentType: "full_length_gown" },
        eyebrow: null,
        fabrics,
        garmentTypeSelection: dressShirtLong,
        fabricAllocationState: needsFabric.fabricAllocationStateWithoutGarment,
        requiredPhysicalOccurrences: previewOccurrences,
        errorMessage: null,
        onSelectFabric: (code: string) => picked.push(code),
        onSelectExistingAllocation: (id: string) => picked.push(`allocation:${id}`),
        onCancel: () => picked.push("cancel"),
      }),
    );
  });
  const pickerText = textContent(pickerRenderer.root);
  assert.match(pickerText, /Choose fabric for Long Dress/);
  assert.doesNotMatch(pickerText, /Optional Extra Garment/);
  const cancel = pickerRenderer.root.find((node) => node.props["data-fabric-dialog-action"] === "cancel");
  act(() => cancel.props.onClick());
  assert.deepEqual(picked, ["cancel"]);
  picked = [];
  act(() => pickerRenderer.unmount());

  const events: string[][] = [];
  const renderer = renderCustomDetails({
    selection: step1(["dress"], "female"),
    block: { parentGarmentKey: "base:dress", message: "Blocked message" },
    constructionEvents: events,
  });
  const notice = renderer.root.find((node) => node.props["data-construction-length-switch-blocked"] === "true");
  assert.match(textContent(notice), /Blocked message/);
  act(() => {
    notice.findByType("button").props.onClick();
  });
  assert.deepEqual(events, [["open-fabric"]], "The message links back to the Fabric step");
  const dressInputs = mainGarmentInputs(renderer, "base:dress", "dress_construction");
  assert.equal(
    dressInputs.find((node) => node.props.checked)?.props.id,
    "future-custom-detail-base:dress-dress_construction-dress_std_sleeveless",
    "The previous option stays selected",
  );

  // Alone on its fabric, the Dress may become a Long Dress; the assignment is resized in place.
  const alone = fabricState([
    allocation("a1", "F1", [
      { garmentKey: "base:dress", code: "BASE_DRESS", garmentType: "dress", fabricUnits: 1, sourceRole: "main" },
    ]),
  ]);
  const grown = planGarmentLengthSwitch({
    parentGarmentKey: "base:dress",
    currentGarmentType: "dress",
    selectionGroup: "dress_construction",
    optionId: "dress_long_midlong",
    fabricAllocationState: alone,
    fabrics: [IN_STOCK],
  });
  assert.equal(grown.status, "switch");
  if (grown.status === "switch") {
    assert.equal(grown.toGarmentType, "full_length_gown");
    assert.deepEqual(grown.fabricAllocationState.fabricAllocations[0]!.garmentAssignments[0], {
      garmentKey: "base:dress",
      code: "BASE_FULL_LENGTH_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "main",
    });
    // Reconciliation keeps the resized assignment once the construction says Long Dress.
    const occurrences = buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: dressSwitched,
      effectiveGarmentTypeSelection: dressSwitched,
    });
    const reconciled = reconcileFutureFabricAllocationState({
      state: grown.fabricAllocationState,
      garmentTypeSelection: dressSwitched,
      requiredPhysicalOccurrences: occurrences,
    });
    assert.deepEqual(
      reconciled.fabricAllocations.map((candidate) =>
        candidate.garmentAssignments.map((assignment) => [assignment.garmentKey, assignment.garmentType, assignment.fabricUnits]),
      ),
      [[["base:dress", "full_length_gown", 2]]],
    );
  }

  // Out of stock: a bigger garment cannot go on it.
  const outOfStock = planGarmentLengthSwitch({
    parentGarmentKey: "base:dress",
    currentGarmentType: "dress",
    selectionGroup: "dress_construction",
    optionId: "dress_long_midlong",
    fabricAllocationState: alone,
    fabrics: [{ code: "F1", stock: 0, stockStatus: "OUT_OF_STOCK" }],
  });
  assert.equal(outOfStock.status === "blocked" && outOfStock.reason, "fabric_out_of_stock");

  // Long Dress -> Standard Dress always fits and frees half the fabric.
  const shrunk = planGarmentLengthSwitch({
    parentGarmentKey: "base:full_length_gown",
    currentGarmentType: "full_length_gown",
    selectionGroup: "dress_construction",
    optionId: "dress_std_short",
    fabricAllocationState: fabricState([
      allocation("a1", "F1", [
        { garmentKey: "base:full_length_gown", code: "BASE_FULL_LENGTH_GOWN", garmentType: "full_length_gown", fabricUnits: 2, sourceRole: "main" },
      ]),
    ]),
    fabrics: [{ code: "F1", stock: 0, stockStatus: "OUT_OF_STOCK" }],
  });
  assert.equal(shrunk.status, "switch");
  if (shrunk.status === "switch") {
    assert.equal(shrunk.fabricAllocationState.fabricAllocations[0]!.garmentAssignments[0]!.fabricUnits, 1);
  }

  // A Step 1 change that resets the switched garment keeps its fabric when it still fits.
  const reverted = reconcileFutureFabricAllocationState({
    state: fabricState([
      allocation("a1", "F1", [
        { garmentKey: "base:dress", code: "BASE_FULL_LENGTH_GOWN", garmentType: "full_length_gown", fabricUnits: 2, sourceRole: "main" },
      ]),
    ]),
    garmentTypeSelection: dressSelection,
    requiredPhysicalOccurrences: buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: dressSelection,
      effectiveGarmentTypeSelection: dressSelection,
    }),
  });
  assert.deepEqual(
    reverted.fabricAllocations[0]?.garmentAssignments.map((assignment) => [assignment.garmentType, assignment.fabricUnits]),
    [["dress", 1]],
  );
}

// --- 6. Added garments: switch, keep the link, policy, persistence. ---------------------------
{
  const linked = fabricState([
    allocation("a1", "F1", [
      { garmentKey: "base:shirt", code: "BASE_SHIRT", garmentType: "shirt", fabricUnits: 1, sourceRole: "main" },
      {
        garmentKey: "additional:skirt:1",
        code: "ADDITIONAL_SKIRT_1",
        garmentType: "skirt",
        fabricUnits: 1,
        sourceRole: "additional",
        garmentSpec: { key: "additional:skirt:1", garmentType: "skirt", fabricUnits: 1 },
        mainGarmentKey: "base:shirt",
        mainGarmentType: "shirt",
        eligibilityRule: "catalog_all",
        dependencyStatus: "valid",
      },
    ]),
  ]);
  const plan = planGarmentLengthSwitch({
    parentGarmentKey: "additional:skirt:1",
    currentGarmentType: "skirt",
    selectionGroup: "skirt_length",
    optionId: "skirt_long",
    fabricAllocationState: linked,
    fabrics: [IN_STOCK],
  });
  assert.equal(plan.status, "switch", "An added Standard Skirt may pick Long Length");
  assert.ok(plan.status === "switch");
  const addedSkirt = plan.fabricAllocationState.fabricAllocations[0]!.garmentAssignments[1]!;
  assert.deepEqual(addedSkirt, {
    garmentKey: "additional:skirt:1",
    code: "ADDITIONAL_LONG_SKIRT_1",
    garmentType: "long_skirt",
    fabricUnits: 1,
    sourceRole: "additional",
    garmentSpec: { key: "additional:skirt:1", garmentType: "long_skirt", fabricUnits: 1 },
    mainGarmentKey: "base:shirt",
    mainGarmentType: "shirt",
    eligibilityRule: "catalog_all",
    dependencyStatus: "valid",
  }, "It becomes a Long Skirt and keeps its link to the main garment");

  // Nothing re-validates the link or the policy away.
  const dependencies = reconcileAdditionalGarmentDependencies(plan.fabricAllocationState, [
    createStyleBaseGarmentSpec("shirt"),
  ]);
  assert.equal(dependencies.fabricAllocations[0]!.garmentAssignments[1]!.dependencyStatus, "valid");
  assert.equal(dependencies.fabricAllocations[0]!.garmentAssignments[1]!.mainGarmentKey, "base:shirt");
  // Main garment switched to Long Shirt: a same_type added Standard Shirt stays valid.
  const sameType = reconcileAdditionalGarmentDependencies(
    fabricState([
      allocation("a1", "F1", [
        { garmentKey: "base:shirt", code: "BASE_KAFTAN", garmentType: "kaftan", fabricUnits: 1, sourceRole: "main" },
        {
          garmentKey: "additional:shirt:1",
          code: "ADDITIONAL_SHIRT_1",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "additional",
          mainGarmentKey: "base:shirt",
          mainGarmentType: "shirt",
          eligibilityRule: "same_type",
          dependencyStatus: "valid",
        },
      ]),
    ]),
    [{ key: "base:shirt", garmentType: "kaftan", fabricUnits: 1 }],
  );
  assert.equal(sameType.fabricAllocations[0]!.garmentAssignments[1]!.dependencyStatus, "valid");

  // Persisted switched garments pass hydration.
  const inspection = inspectDraftFabricAllocations({
    fabricAllocations: [
      allocation("a1", "F1", [
        { garmentKey: "base:shirt", code: "BASE_KAFTAN", garmentType: "kaftan", fabricUnits: 1, sourceRole: "main" },
        addedSkirt,
      ]),
      allocation("a2", "F2", [
        { garmentKey: "base:dress", code: "BASE_FULL_LENGTH_GOWN", garmentType: "full_length_gown", fabricUnits: 2, sourceRole: "main" },
      ]),
    ],
    designSelections: {},
  } as unknown as GuestDesignDraft);
  assert.equal(inspection.status, "valid", "Saved switched garments load back");

  // The added garment's construction follows its new type through reconciliation.
  const longSkirtConstruction = pick(
    resolveGarmentConstructionPricing("skirt", catalog),
    "skirt_length",
    "skirt_long",
  );
  const constructions: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:skirt:1": { ...longSkirtConstruction, garmentType: "long_skirt" },
    },
  };
  const reconciledConstructions = reconcileAdditionalGarmentConstructionState({
    existingState: constructions,
    assignments: [addedSkirt],
    normalizedCustomDetailCatalog: catalog,
  });
  const reconciledSkirt = reconciledConstructions.state.byGarmentKey["additional:skirt:1"];
  assert.equal(reconciledSkirt?.garmentType, "long_skirt");
  assert.ok(reconciledSkirt?.status === "resolved");
  assert.equal(reconciledSkirt.components[0]?.optionId, "skirt_long");
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: shirtSelection,
    effectiveGarmentTypeSelection: shirtSelection,
    additionalGarmentConstructionState: reconciledConstructions.state,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => [occurrence.garmentKey, occurrence.garmentType]),
    [["base:shirt", "shirt"], ["additional:skirt:1", "long_skirt"]],
  );
  assert.deepEqual(
    reconcileFutureFabricAllocationState({
      state: plan.fabricAllocationState,
      garmentTypeSelection: shirtSelection,
      requiredPhysicalOccurrences: occurrences,
    }).fabricAllocations[0]!.garmentAssignments.map((assignment) => [assignment.garmentKey, assignment.garmentType]),
    [["base:shirt", "shirt"], ["additional:skirt:1", "long_skirt"]],
    "Fabric keeps the switched added garment",
  );
}

// --- 7. Uploaded designs: the garment list follows the switch. --------------------------------
{
  const uploadedSelection = switched(step1(["shirt"]), "shirt", "shirt_construction", "shirt_long_short");
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: uploadedSelection,
    effectiveGarmentTypeSelection: uploadedSelection,
    uploadedCompositionSpecs: [createStyleBaseGarmentSpec("shirt")],
  });
  assert.deepEqual(
    occurrences.map((occurrence) => [occurrence.garmentKey, occurrence.garmentType, occurrence.fabricUnits]),
    [["base:shirt", "kaftan", 1]],
    "An uploaded design's Standard Shirt switched in Step 4 is a Long Shirt",
  );
}

// --- 8. Design style is kept. ------------------------------------------------------------------
{
  const styleBase = (id: string, garmentTypes: CanonicalPhysicalGarmentType[]): StyleCategory => ({
    id,
    name: `Style ${id}`,
    description: "Fixture.",
    gender: "male",
    options: ["Standard"],
    image: `https://example.test/${id}.webp`,
    outfitType: "Native",
    garmentComposition: "Configured garments",
    fabricCategory: "Any",
    fabricCapacityComposition: garmentTypes.map(createStyleBaseGarmentSpec),
    customDetailConfig: {
      representedGenders: ["male"],
      featuresMaleAndFemale: false,
      supportedGarmentGroups: ["shirt"],
      requiredSelectionGroups: [],
      enabled: true,
    },
    includedDesignFeatures: { hasMonogram: false, hasEmbroidery: false, hasMonogramTrimming: false },
    monogramCuffEligible: false,
    embroideryProminence: "standard",
    defaultGarmentDetails: {},
    styleApplicability: { mode: "exact_only" },
  });
  const style = projectPublishedDesignStyleRecord(
    prepareAuthoritativeDesignStyleRecord({
      style: styleBase("standard-shirt-only", ["shirt"]),
      lifecycle: "published",
      displayOrder: 1,
      referenceComposition: { status: "known", garmentTypes: ["shirt"] },
      currentRecord: null,
    }),
  );
  assert.ok(style);
  const switchedOccurrence: PhysicalGarmentOccurrence = {
    garmentKey: "base:shirt",
    garmentType: "kaftan",
    sourceRole: "main",
    fabricUnits: 1,
    occurrenceGeneration: 1,
  };
  const token = createPhysicalGarmentOccurrenceIdentityToken({ garmentKey: "base:shirt", generation: 1 });
  const authority = buildDesignStyleDraftValidationAuthority({
    catalogueState: "ready",
    styles: [style],
    garmentTypeSelection: shirtSwitched,
    activeOccurrences: [switchedOccurrence],
  });
  assert.deepEqual(
    authority.catalogStylesById["standard-shirt-only"]?.occurrenceEligibilityByToken[token],
    { status: "eligible" },
    "A Standard Shirt style stays valid on the garment after it switched to Long Shirt",
  );
  const unswitched = buildDesignStyleDraftValidationAuthority({
    catalogueState: "ready",
    styles: [style],
    garmentTypeSelection: step1(["kaftan"]),
    activeOccurrences: [{ ...switchedOccurrence, garmentKey: "base:kaftan" }],
  });
  assert.notDeepEqual(
    unswitched.catalogStylesById["standard-shirt-only"]?.occurrenceEligibilityByToken[
      createPhysicalGarmentOccurrenceIdentityToken({ garmentKey: "base:kaftan", generation: 1 })
    ],
    { status: "eligible" },
    "Eligibility for garments that were not switched is unchanged",
  );
}

// --- 9. Server recompute accepts switched garments. ------------------------------------------
{
  const order = createCatalogueAuthoritativeFutureOrderV2Fixture("length-switch");
  const candidate = structuredClone(order.cartItem.candidate) as {
    -readonly [K in keyof FutureOrderCandidateV2]: FutureOrderCandidateV2[K];
  };
  const switchedShirt = pick(
    resolveGarmentConstructionPricing("shirt", catalog),
    "shirt_construction",
    "shirt_long_midlong",
  );
  assert.ok(switchedShirt.status === "resolved");
  const garments = structuredClone(candidate.garments) as unknown as Array<Record<string, unknown>>;
  garments[0] = {
    ...garments[0],
    garmentType: "kaftan",
    label: "Long Shirt",
    construction: switchedShirt.components.map((component) => ({
      componentKey: component.componentKey,
      selectionGroup: component.selectionGroup,
      optionId: component.optionId,
      label: component.optionId,
      priceCents: component.priceCents,
    })),
    constructionTotalCents: switchedShirt.totalPriceCents,
  };
  candidate.garments = garments as unknown as FutureOrderCandidateV2["garments"];
  const quote = quoteFutureOrderPayableTotal(candidate as FutureOrderCandidateV2);
  assert.ok(quote, "The server quotes a switched Long Shirt");
  assert.equal(quote.garments[0]!.totalPriceCents, switchedShirt.totalPriceCents);
  const pricing = structuredClone(candidate.pricing) as unknown as Record<string, unknown>;
  pricing.garmentConstructionSubtotalCents = quote.garmentConstructionSubtotalCents;
  pricing.selectedDesignTotalCents = quote.selectedDesignTotalCents;
  pricing.exactTotalCents = quote.exactTotalCents;
  candidate.pricing = pricing as unknown as FutureOrderCandidateV2["pricing"];
  const recomputed = recomputeFutureOrderPayableTotal(candidate as FutureOrderCandidateV2);
  assert.equal(recomputed.status, "exact", "Server recompute agrees with the switched price");
}

console.log("garment length switch tests passed");
