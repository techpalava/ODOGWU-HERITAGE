import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  type PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import {
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import {
  applyDesignStyleStepLedgerToHydration,
  assignCatalogueStyleThroughStepRuntime,
  clearCatalogueStyleThroughStepRuntime,
  resolveActiveDesignStyleOccurrence,
  type DesignStyleStepCatalogMutationRequest,
} from "./src/utils/designStyleStepRuntime";
import { blockFutureOrderCandidateUntilGarmentScopedDesignStyleMapping } from "./src/utils/futureOrderCandidate";
import {
  inspectPersistedDesignStyleDraft,
  prepareDesignStyleDraftAutosave,
} from "./src/utils/designStyleDraftPersistence";
import {
  createDesignStyleStepTestModel,
  type DesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: "male" | "female" | "unisex" = "male",
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic,
  audienceSelection: { schemaVersion: 1, demographics: [demographic] },
  constructionByGarment: {},
});

const style = ({
  id,
  name,
  garments,
  demographic = "male",
  adaptableGarments = null,
}: {
  id: string;
  name: string;
  garments: GarmentTypeStepSelection["garmentTypes"];
  demographic?: "male" | "female" | "unisex";
  adaptableGarments?: GarmentTypeStepSelection["garmentTypes"] | null;
}): StyleCategory => ({
  id,
  name,
  description: `${name} strict test record.`,
  gender: demographic,
  targetDemographic: demographic,
  options: [],
  fabricCapacityComposition: garments.map(createStyleBaseGarmentSpec),
  ...(adaptableGarments
    ? {
        styleApplicability: {
          mode: "adaptable" as const,
          garmentTypes: [...adaptableGarments],
          demographics: [demographic],
        },
      }
    : {}),
});

const styleA = style({
  id: "runtime-style-a",
  name: "Style A",
  garments: ["shirt", "skirt", "bum_shorts"],
});
const styleB = style({
  id: "runtime-style-b",
  name: "Style B",
  garments: ["shirt", "skirt", "bum_shorts"],
});
const styleC = style({
  id: "runtime-style-c",
  name: "Style C",
  garments: ["shirt", "skirt", "bum_shorts"],
});
const styleD = style({
  id: "runtime-style-d",
  name: "Style D",
  garments: ["shirt", "skirt", "bum_shorts"],
});
const adaptableStyle = style({
  id: "runtime-adaptable",
  name: "Adaptable Kaftan",
  garments: ["kaftan"],
  adaptableGarments: ["shirt", "skirt"],
});
const wrongAudienceStyle = style({
  id: "runtime-female",
  name: "Female Style",
  garments: ["shirt"],
  demographic: "female",
});

const rawDraftForEnvelope = (
  envelope: DesignStyleStepTestModel["hydration"]["envelope"],
  overrides: Partial<GuestDesignDraft> = {},
): Partial<GuestDesignDraft> => ({
  designStyleAssignmentDraft: structuredClone(envelope),
  ...overrides,
});

const requestFor = (
  model: DesignStyleStepTestModel,
  styleId: string,
): DesignStyleStepCatalogMutationRequest => {
  const entry = model.catalogueEntries.find((item) => item.style.id === styleId);
  assert.ok(entry, `Expected ${styleId} for the active occurrence.`);
  return entry.request;
};

const assignThroughRuntime = (
  model: DesignStyleStepTestModel,
  request: DesignStyleStepCatalogMutationRequest,
  options: {
    currentRuntimeGeneration?: number;
    activeTarget?: DesignStyleStepTestModel["activeTarget"];
  } = {},
) => {
  const ledger = model.hydration.ledger;
  assert.ok(ledger, "Expected a mutable V2 ledger.");
  return assignCatalogueStyleThroughStepRuntime({
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget:
      options.activeTarget === undefined
        ? model.activeTarget
        : options.activeTarget,
    authority: model.authority,
    request,
    currentRuntimeGeneration: options.currentRuntimeGeneration ?? 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
};

const applyMutation = (
  model: DesignStyleStepTestModel,
  result: ReturnType<typeof assignThroughRuntime>,
) => {
  assert.equal(result.status, "applied");
  return applyDesignStyleStepLedgerToHydration({
    hydration: model.hydration,
    ledger: result.ledger,
    activeOccurrences: model.occurrences,
    authority: model.authority,
  });
};

const assignmentStyle = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null,
  garmentKey: string,
): string | null => {
  const assignment = ledger?.assignmentsByGarmentKey[garmentKey];
  return assignment?.sourceKind === "catalog"
    ? assignment.catalogStyleId
    : null;
};

// A runtime assignment is carried through the canonical Task 5C autosave
// envelope; the parent subscribes to this ledger revision rather than writing
// a scalar representative style.
{
  const model = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
  });
  const assignedHydration = applyMutation(
    model,
    assignThroughRuntime(model, requestFor(model, styleA.id)),
  );
  const prepared = prepareDesignStyleDraftAutosave({
    draft: {} as GuestDesignDraft,
    hydrated: assignedHydration,
    activeOccurrences: model.occurrences,
    authority: model.authority,
    hydrationGeneration: 1,
    currentHydrationGeneration: 1,
  });
  assert.equal(prepared.status, "ready");
  const persisted =
    prepared.status === "ready"
      ? inspectPersistedDesignStyleDraft(prepared.draft)
      : { status: "absent" as const };
  assert.equal(persisted.status, "valid");
  assert.equal(
    persisted.status === "valid"
      ? persisted.envelope.ledger.revision
      : null,
    1,
  );
  assert.equal(
    persisted.status === "valid"
      ? assignmentStyle(
          persisted.envelope.ledger,
          "base:shirt:1",
        )
      : null,
    styleA.id,
  );
  assert.equal(
    prepared.status === "ready" ? prepared.draft.selectedStyleId : null,
    undefined,
  );
}

// Valid V2 is authoritative even when every scalar points at another style.
{
  const selected = createDesignStyleStepTestModel({
    styles: [styleA, styleB],
    garmentTypeSelection: selection(["shirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": styleA.id },
  });
  const conflicting = createDesignStyleStepTestModel({
    styles: [styleA, styleB],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(selected.hydration.envelope, {
      selectedStyleId: styleB.id,
      designSource: createCatalogDesignSource(styleB.id),
      confirmedStyleId: styleB.id,
      confirmedDesignSourceKey: `catalog:${styleB.id}`,
      priceActivatedFabricCode: "SCALAR-FABRIC",
    }),
  });
  assert.equal(
    assignmentStyle(conflicting.hydration.ledger, "base:shirt:1"),
    styleA.id,
  );
  assert.equal(conflicting.projection.completedCount, 1);
  assert.equal(conflicting.projection.isComplete, true);
  assert.equal(
    conflicting.catalogueEntries.find((item) => item.style.id === styleA.id)
      ?.selected,
    true,
  );
  assert.equal(
    conflicting.catalogueEntries.find((item) => item.style.id === styleB.id)
      ?.selected,
    false,
  );
}

// A valid empty V2 envelope blocks scalar fallback, progress, and completion.
{
  const emptyEnvelope = {
    schemaVersion: 2 as const,
    ledger: createEmptyGarmentScopedDesignStyleAssignmentLedger(),
  };
  const model = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(emptyEnvelope, {
      selectedStyleId: styleA.id,
      designSource: createCatalogDesignSource(styleA.id),
      confirmedStyleId: styleA.id,
      confirmedDesignSourceKey: `catalog:${styleA.id}`,
      priceActivatedFabricCode: "SCALAR-ONLY",
    }),
  });
  assert.equal(model.projection.occurrences[0]?.assignment, null);
  assert.equal(model.projection.completedCount, 0);
  assert.equal(model.projection.isComplete, false);
  assert.equal(
    model.catalogueEntries.some((item) => item.selected),
    false,
  );
}

// Malformed and unsupported V2 remain blocked and cannot fall back to scalar.
for (const [name, designStyleAssignmentDraft] of [
  ["malformed", { schemaVersion: 2, ledger: { revision: "bad" } }],
  ["unsupported", { schemaVersion: 99, ledger: {} }],
] as const) {
  const model = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: {
      designStyleAssignmentDraft,
      selectedStyleId: styleA.id,
      designSource: createCatalogDesignSource(styleA.id),
    },
  });
  assert.equal(model.projection.runtimeStatus, "blocked", name);
  assert.equal(model.projection.isComplete, false, name);
  assert.equal(model.hydration.destructiveNormalizationProhibited, true, name);
  assert.equal(model.hydration.canAutosave, false, name);
  assert.equal(model.hydration.ledger, null, name);
  assert.equal(model.catalogueEntries.length, 0, name);
}

// Occurrence order, repeated labels, and deterministic initial focus derive
// from exact authoritative occurrences rather than deduplicated garment types.
{
  const different = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
  });
  assert.deepEqual(
    different.projection.occurrences.map((item) => item.label),
    ["Shirt", "Skirt", "Bum Shorts"],
  );
  assert.equal(different.activeTarget?.garmentKey, "base:shirt:1");

  const repeated = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
  });
  assert.deepEqual(
    repeated.projection.occurrences.map((item) => item.label),
    ["Shirt", "Shirt 2", "Shirt 3"],
  );
  assert.equal(
    new Set(
      repeated.projection.occurrences.map(
        (item) => item.target.occurrenceToken,
      ),
    ).size,
    3,
  );
}

// Removing the active occurrence chooses the nearest surviving incomplete
// occurrence; re-adding the key with a new token never preserves old identity.
{
  const before = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
  });
  const removedTarget = before.projection.occurrences[1]!.target;
  const after = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "bum_shorts"]),
  });
  const nextTarget = resolveActiveDesignStyleOccurrence({
    occurrences: after.projection.occurrences,
    current: removedTarget,
    previousOrder: before.projection.occurrences.map((item) => item.target),
  });
  assert.equal(nextTarget?.garmentKey, "base:bum_shorts:1");

  const oldOccurrence: PhysicalGarmentOccurrence = {
    garmentKey: "additional:shirt:1",
    garmentType: "shirt",
    sourceRole: "additional",
    fabricUnits: 1,
    occurrenceGeneration: 1,
  };
  const newOccurrence: PhysicalGarmentOccurrence = {
    ...oldOccurrence,
    occurrenceGeneration: 2,
  };
  const oldModel = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    occurrences: [oldOccurrence],
  });
  const newModel = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    occurrences: [newOccurrence],
    activeTarget: oldModel.activeTarget,
  });
  assert.notEqual(
    oldModel.activeTarget?.occurrenceToken,
    newModel.activeTarget?.occurrenceToken,
  );
  const stale = assignThroughRuntime(
    newModel,
    requestFor(oldModel, styleA.id),
  );
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reason, "STALE_ACTIVE_OCCURRENCE");
}

// Independent assignments, replacement, reuse, and clear affect one exact
// occurrence while exact-set progress follows the surviving valid entries.
{
  const selected = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC, styleD],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styleA.id,
      "base:skirt:1": styleB.id,
      "base:bum_shorts:1": styleC.id,
    },
  });
  assert.equal(selected.projection.completedCount, 3);
  assert.equal(selected.projection.isComplete, true);
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(selected.hydration.ledger!.assignmentsByGarmentKey).map(
        (garmentKey) => [
          garmentKey,
          assignmentStyle(selected.hydration.ledger, garmentKey),
        ],
      ),
    ),
    {
      "base:shirt:1": styleA.id,
      "base:skirt:1": styleB.id,
      "base:bum_shorts:1": styleC.id,
    },
  );

  const skirtActive = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC, styleD],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    rawDraft: rawDraftForEnvelope(selected.hydration.envelope),
    activeTarget: selected.projection.occurrences[1]!.target,
  });
  const replacementHydration = applyMutation(
    skirtActive,
    assignThroughRuntime(skirtActive, requestFor(skirtActive, styleD.id)),
  );
  assert.equal(
    assignmentStyle(replacementHydration.ledger, "base:shirt:1"),
    styleA.id,
  );
  assert.equal(
    assignmentStyle(replacementHydration.ledger, "base:skirt:1"),
    styleD.id,
  );
  assert.equal(
    assignmentStyle(replacementHydration.ledger, "base:bum_shorts:1"),
    styleC.id,
  );

  const sameStyle = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styleA.id,
      "base:skirt:1": styleA.id,
    },
  });
  assert.equal(
    Object.keys(sameStyle.hydration.ledger!.assignmentsByGarmentKey).length,
    2,
  );
  assert.notEqual(
    sameStyle.hydration.ledger!.assignmentsByGarmentKey["base:shirt:1"]
      ?.occurrenceToken,
    sameStyle.hydration.ledger!.assignmentsByGarmentKey["base:skirt:1"]
      ?.occurrenceToken,
  );
}

// Repeated Shirt 2 can be cleared without changing either sibling.
{
  const complete = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styleA.id,
      "base:shirt:2": styleB.id,
      "base:shirt:3": styleC.id,
    },
  });
  const shirtTwo = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
    rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
    activeTarget: complete.projection.occurrences[1]!.target,
  });
  const clearRequest = shirtTwo.clearRequest;
  assert.ok(clearRequest);
  const cleared = clearCatalogueStyleThroughStepRuntime({
    ledger: shirtTwo.hydration.ledger!,
    activeOccurrences: shirtTwo.occurrences,
    activeTarget: shirtTwo.activeTarget,
    request: clearRequest,
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
  assert.equal(cleared.status, "applied");
  assert.equal(
    assignmentStyle(cleared.ledger, "base:shirt:1"),
    styleA.id,
  );
  assert.equal(assignmentStyle(cleared.ledger, "base:shirt:2"), null);
  assert.equal(
    assignmentStyle(cleared.ledger, "base:shirt:3"),
    styleC.id,
  );
  const nextHydration = applyDesignStyleStepLedgerToHydration({
    hydration: shirtTwo.hydration,
    ledger: cleared.ledger,
    activeOccurrences: shirtTwo.occurrences,
    authority: shirtTwo.authority,
  });
  const projected = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
    rawDraft: rawDraftForEnvelope(nextHydration.envelope),
  });
  assert.equal(projected.projection.completedCount, 2);
  assert.equal(projected.projection.isComplete, false);
}

// Captured request authority rejects stale ledger, runtime, active occurrence,
// style fingerprint, and delayed adaptability confirmation without mutation.
{
  const model = createDesignStyleStepTestModel({
    styles: [styleA, styleB, adaptableStyle],
    garmentTypeSelection: selection(["shirt", "skirt"]),
  });
  const originalLedger = model.hydration.ledger!;
  const oldRequest = requestFor(model, styleA.id);
  const first = assignThroughRuntime(model, oldRequest);
  assert.equal(first.status, "applied");

  const staleRevision = assignCatalogueStyleThroughStepRuntime({
    ledger: first.ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    authority: model.authority,
    request: oldRequest,
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
  assert.equal(staleRevision.status, "rejected");
  assert.equal(staleRevision.reason, "STALE_LEDGER_REVISION");
  assert.strictEqual(staleRevision.ledger, first.ledger);

  const staleRuntime = assignThroughRuntime(model, oldRequest, {
    currentRuntimeGeneration: 2,
  });
  assert.equal(staleRuntime.status, "rejected");
  assert.equal(staleRuntime.reason, "STALE_RUNTIME_GENERATION");
  assert.strictEqual(staleRuntime.ledger, originalLedger);

  const otherTarget = model.projection.occurrences[1]!.target;
  const staleActive = assignThroughRuntime(model, oldRequest, {
    activeTarget: otherTarget,
  });
  assert.equal(staleActive.status, "rejected");
  assert.equal(staleActive.reason, "STALE_ACTIVE_OCCURRENCE");
  assert.strictEqual(staleActive.ledger, originalLedger);

  const authorityChanged = assignThroughRuntime(model, {
    ...oldRequest,
    eligibilityFingerprint: "stale-eligibility",
  });
  assert.equal(authorityChanged.status, "rejected");
  assert.equal(authorityChanged.reason, "STYLE_AUTHORITY_CHANGED");

  const adaptableRequest = requestFor(model, adaptableStyle.id);
  const { adaptabilityConfirmationFingerprint: _confirmation, ...unconfirmed } =
    adaptableRequest;
  const missingConfirmation = assignThroughRuntime(
    model,
    unconfirmed as DesignStyleStepCatalogMutationRequest,
  );
  assert.equal(missingConfirmation.status, "rejected");
  assert.equal(
    missingConfirmation.reason,
    "ADAPTABILITY_CONFIRMATION_REQUIRED",
  );
  const delayedConfirmation = assignThroughRuntime(model, adaptableRequest, {
    activeTarget: otherTarget,
  });
  assert.equal(delayedConfirmation.status, "rejected");
  assert.equal(delayedConfirmation.reason, "STALE_ACTIVE_OCCURRENCE");
}

// Every published style remains selectable. Compatibility and demographic
// differences are advisory presentation data, not catalogue gates.
{
  const shirtModel = createDesignStyleStepTestModel({
    styles: [styleA, adaptableStyle, wrongAudienceStyle],
    garmentTypeSelection: selection(["shirt", "skirt"]),
  });
  assert.deepEqual(
    new Set(shirtModel.catalogueEntries.map((item) => item.style.id)),
    new Set([styleA.id, adaptableStyle.id, wrongAudienceStyle.id]),
  );
  assert.equal(
    shirtModel.catalogueEntries.find(
      (item) => item.style.id === adaptableStyle.id,
    )?.presentation.tier,
    "adaptable",
  );
  assert.equal(
    shirtModel.catalogueEntries.some(
      (item) => item.style.id === wrongAudienceStyle.id,
    ),
    true,
  );

  const kaftanReferenceOnly = style({
    id: "reference-only-kaftan",
    name: "Reference Only Kaftan",
    garments: ["kaftan"],
  });
  const referenceBoundary = createDesignStyleStepTestModel({
    styles: [kaftanReferenceOnly],
    garmentTypeSelection: selection(["shirt"]),
  });
  assert.equal(referenceBoundary.catalogueEntries.length, 1);
}

// Loading and listener error preserve the exact assignment identity while
// denying completion. A ready snapshot revalidates the same V2 envelope.
{
  const complete = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": styleA.id },
  });
  const assignment = complete.hydration.ledger!.assignmentsByGarmentKey[
    "base:shirt:1"
  ];
  for (const catalogueState of ["loading", "error"] as const) {
    const waiting = createDesignStyleStepTestModel({
      styles: [styleA],
      garmentTypeSelection: selection(["shirt"]),
      rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
      catalogueState,
    });
    assert.equal(waiting.projection.runtimeStatus, catalogueState);
    assert.equal(waiting.projection.isComplete, false);
    assert.equal(waiting.projection.completedCount, 0);
    assert.strictEqual(
      waiting.hydration.ledger!.assignmentsByGarmentKey["base:shirt:1"]
        ?.occurrenceToken,
      assignment?.occurrenceToken,
    );
    assert.equal(waiting.catalogueEntries.length, 0);
  }
  const readyAgain = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
  });
  assert.equal(readyAgain.projection.isComplete, true);
  assert.equal(readyAgain.projection.completedCount, 1);
}

// Cosmetic presentation changes refresh the display without invalidation;
// eligibility or catalogue removal preserves evidence and requires review.
{
  const complete = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    selectedStyleIdByGarmentKey: { "base:shirt:1": styleA.id },
  });
  const renamed = { ...styleA, name: "Style A Renamed" };
  const cosmetic = createDesignStyleStepTestModel({
    styles: [renamed],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
  });
  assert.equal(cosmetic.projection.isComplete, true);
  assert.equal(cosmetic.projection.occurrences[0]?.assignmentLabel, renamed.name);

  const eligibilityChanged = style({
    id: styleA.id,
    name: styleA.name,
    garments: ["trouser"],
  });
  const needsReview = createDesignStyleStepTestModel({
    styles: [eligibilityChanged],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
  });
  assert.equal(needsReview.projection.isComplete, false);
  assert.equal(needsReview.projection.occurrences[0]?.status, "needs_review");
  assert.ok(needsReview.projection.occurrences[0]?.assignment);

  const unavailable = createDesignStyleStepTestModel({
    styles: [],
    garmentTypeSelection: selection(["shirt"]),
    rawDraft: rawDraftForEnvelope(complete.hydration.envelope),
  });
  assert.equal(unavailable.projection.isComplete, false);
  assert.equal(unavailable.projection.occurrences[0]?.status, "unavailable");
  assert.ok(unavailable.projection.occurrences[0]?.assignment);
  assert.equal(unavailable.catalogueEntries.length, 0);
}

// Exact-set progress responds to additions/removals without changing surviving
// occurrence assignments or using any scalar activation marker.
{
  const zero = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
  });
  assert.deepEqual(
    [zero.projection.completedCount, zero.projection.totalCount, zero.projection.isComplete],
    [0, 3, false],
  );

  const two = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styleA.id,
      "base:skirt:1": styleB.id,
    },
  });
  assert.deepEqual(
    [two.projection.completedCount, two.projection.totalCount, two.projection.isComplete],
    [2, 3, false],
  );

  const three = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": styleA.id,
      "base:skirt:1": styleB.id,
      "base:bum_shorts:1": styleC.id,
    },
  });
  assert.deepEqual(
    [three.projection.completedCount, three.projection.totalCount, three.projection.isComplete],
    [3, 3, true],
  );

  const added = createDesignStyleStepTestModel({
    styles: [styleA, styleB, styleC],
    garmentTypeSelection: selection(["shirt", "skirt", "bum_shorts"]),
    rawDraft: rawDraftForEnvelope(
      createDesignStyleStepTestModel({
        styles: [styleA, styleB],
        garmentTypeSelection: selection(["shirt", "skirt"]),
        selectedStyleIdByGarmentKey: {
          "base:shirt:1": styleA.id,
          "base:skirt:1": styleB.id,
        },
      }).hydration.envelope,
      { priceActivatedFabricCode: "MUST-NOT-COMPLETE" },
    ),
  });
  assert.equal(added.projection.completedCount, 2);
  assert.equal(added.projection.totalCount, 3);
  assert.equal(added.projection.isComplete, false);

  const survivingOccurrences = [
    three.occurrences[0]!,
    three.occurrences[2]!,
  ];
  const removed = createDesignStyleStepTestModel({
    styles: [styleA, styleC],
    garmentTypeSelection: selection(["shirt", "bum_shorts"]),
    occurrences: survivingOccurrences,
    rawDraft: rawDraftForEnvelope(three.hydration.envelope),
  });
  assert.equal(removed.projection.isComplete, true);
  assert.deepEqual(
    Object.keys(removed.hydration.ledger!.assignmentsByGarmentKey),
    ["base:shirt:1", "base:bum_shorts:1"],
  );

  const none = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection([]),
    occurrences: [],
  });
  assert.equal(none.projection.totalCount, 0);
  assert.equal(none.projection.isComplete, false);
  assert.equal(none.activeTarget, null);
}

// Ambiguous scalar evidence never fans out. It survives the first explicit
// choice and is retired only after every exact occurrence is explicitly valid.
{
  const legacyScalar: Partial<GuestDesignDraft> = {
    selectedStyleId: styleA.id,
    designSource: createCatalogDesignSource(styleA.id),
    confirmedStyleId: styleA.id,
    confirmedDesignSourceKey: `catalog:${styleA.id}`,
    priceActivatedFabricCode: "LEGACY-FABRIC",
  };
  const migration = createDesignStyleStepTestModel({
    styles: [styleA, styleB],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    rawDraft: legacyScalar,
  });
  assert.equal(migration.projection.runtimeStatus, "review");
  assert.ok(migration.projection.reviewMessage);
  assert.ok(migration.hydration.migrationEvidence);
  assert.equal(
    Object.keys(migration.hydration.ledger!.assignmentsByGarmentKey).length,
    0,
  );
  assert.equal(migration.projection.isComplete, false);

  const firstExplicit = applyMutation(
    migration,
    assignThroughRuntime(migration, requestFor(migration, styleA.id)),
  );
  assert.ok(firstExplicit.migrationEvidence);
  assert.equal(
    Object.keys(firstExplicit.ledger!.assignmentsByGarmentKey).length,
    1,
  );
  const firstRoundTrip = createDesignStyleStepTestModel({
    styles: [styleA, styleB],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    rawDraft: rawDraftForEnvelope(firstExplicit.envelope, {
      selectedStyleId: "stale-scalar-must-not-return",
    }),
  });
  assert.equal(firstRoundTrip.projection.runtimeStatus, "review");
  assert.ok(firstRoundTrip.hydration.migrationEvidence);
  assert.equal(firstRoundTrip.activeTarget?.garmentKey, "base:skirt:1");

  const completed = applyMutation(
    firstRoundTrip,
    assignThroughRuntime(
      firstRoundTrip,
      requestFor(firstRoundTrip, styleB.id),
    ),
  );
  assert.equal(completed.migrationEvidence, null);
  const completedRoundTrip = createDesignStyleStepTestModel({
    styles: [styleA, styleB],
    garmentTypeSelection: selection(["shirt", "skirt"]),
    rawDraft: rawDraftForEnvelope(completed.envelope, {
      selectedStyleId: "stale-scalar-must-not-return",
    }),
  });
  assert.equal(completedRoundTrip.projection.completedCount, 2);
  assert.equal(completedRoundTrip.projection.isComplete, true);
  assert.equal(completedRoundTrip.hydration.migrationEvidence, null);

  const repeatedMigration = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt", "shirt", "shirt"]),
    rawDraft: legacyScalar,
  });
  assert.equal(
    Object.keys(repeatedMigration.hydration.ledger!.assignmentsByGarmentKey)
      .length,
    0,
  );
  assert.ok(repeatedMigration.hydration.migrationEvidence);
}

// Existing uploaded assignments are occurrence-scoped, count only when current
// ownership/confirmation authority proves them, and expose no scalar authority.
{
  const uploadReference = createCustomerDesignUploadReference({
    ownerUid: "task5d-upload-owner",
    mimeType: "image/png",
    designReferenceId: "task5d-upload-reference",
    originalFileName: "private.png",
    createdAt: "2026-08-25T00:00:00.000Z",
  });
  const source = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const confirmed = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    uploadedSource: source,
    uploadedAssignmentGarmentKeys: ["base:shirt:1"],
    confirmedUploadedSourceKey: source.sourceKey,
    expectedUploadOwnerUid: uploadReference.ownerUid,
  });
  assert.equal(confirmed.projection.isComplete, true);
  assert.equal(
    confirmed.projection.occurrences[0]?.assignment?.sourceKind,
    "uploaded",
  );
  assert.equal(
    confirmed.projection.occurrences[0]?.assignmentLabel,
    "Uploaded design",
  );

  const pending = createDesignStyleStepTestModel({
    styles: [styleA],
    garmentTypeSelection: selection(["shirt"]),
    uploadedSource: source,
    uploadedAssignmentGarmentKeys: ["base:shirt:1"],
    confirmedUploadedSourceKey: null,
    expectedUploadOwnerUid: uploadReference.ownerUid,
  });
  assert.equal(pending.projection.isComplete, false);
  assert.equal(pending.projection.occurrences[0]?.status, "upload_pending");
}

// Task 5F has not introduced a lossless candidate mapping. Candidate and
// payment therefore fail closed even if stale scalar fields still exist.
{
  const blocked = blockFutureOrderCandidateUntilGarmentScopedDesignStyleMapping();
  assert.equal(blocked.candidate, null);
  assert.equal(blocked.status, "invalid");
  assert.deepEqual(
    blocked.blockers.map((item) => item.code),
    [
      "GARMENT_SCOPED_DESIGN_STYLE_MAPPING_PENDING",
      "PAYMENT_PROVIDER_UNAVAILABLE",
    ],
  );
}

console.log("PASS: garment-scoped Design Style Step 3 runtime");
