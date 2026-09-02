import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { FutureFabricCatalogueCard } from "./src/components/FutureFabricCatalogueCard";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import {
  canCancelPendingForAdditionalGarmentTransaction,
  confirmAdditionalGarmentFabricAssignment,
  resolveCurrentCatalogueFabricForAssignment,
  STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE,
  type AdditionalGarmentFabricTransaction,
} from "./src/utils/additionalGarmentFabricPicker";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import type { Fabric, FabricAllocationState } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: { children?: unknown } | string | null): string => {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const children = (node as { children?: unknown }).children;
  if (!Array.isArray(children)) return "";
  return children
    .map((child) => textContent(child as { children?: unknown } | string | null))
    .join("");
};

const fabricA: Fabric = {
  code: "FAB-A",
  name: "Ankara A",
  description: "Primary",
  color: "Blue",
  colorHex: "#123456",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 12,
  image: "https://example.test/a.jpg",
};
const fabricB: Fabric = {
  code: "FAB-B",
  name: "Ankara B",
  description: "Secondary",
  color: "Red",
  colorHex: "#654321",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 14,
};

const withBaseShirt = (): FabricAllocationState => {
  let state = FabricAllocationStateEngine.initialize();
  state = FabricAllocationStateEngine.createAllocationForFabric(state, fabricA.code);
  return FabricAllocationStateEngine.attemptAppendGarment(state, {
    code: "BASE_SHIRT",
    garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    sourceRole: "main",
  });
};

// --- Engine metadata hardening ---
{
  const state = withBaseShirt();
  const valid = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
  });
  assert.equal(valid.status, "resolved");
  const parked = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    valid.selection,
  );
  assert.equal(parked.pendingFabricGarment?.garmentKey, valid.selection.garmentSpec!.key);
  assert.equal(parked.awaitingFabricForPendingGarment, true);
  assert.ok(valid.selection.mainGarmentKey);
  assert.ok(valid.selection.mainGarmentType);
  assert.equal(valid.selection.eligibilityRule, "catalog_all");
  assert.equal(valid.selection.dependencyStatus, "valid");

  const omitParent = {
    ...valid.selection,
    mainGarmentKey: undefined,
    mainGarmentType: undefined,
  };
  const rejectedParent =
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      omitParent,
    );
  assert.equal(rejectedParent, state);
  assert.equal(rejectedParent.pendingFabricGarment, null);

  const omitMainType = { ...valid.selection, mainGarmentType: undefined };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      omitMainType,
    ),
    state,
  );

  const omitEligibility = { ...valid.selection, eligibilityRule: undefined };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      omitEligibility,
    ),
    state,
  );

  const omitDependency = { ...valid.selection, dependencyStatus: undefined };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      omitDependency,
    ),
    state,
  );

  const baseRejected =
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(state, {
      code: "BASE_SHIRT",
      garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
      sourceRole: "main",
      mainGarmentKey: "base:shirt",
      mainGarmentType: "shirt",
      eligibilityRule: "catalog_all",
      dependencyStatus: "valid",
    });
  assert.equal(baseRejected, state);

  const malformedUnits = {
    ...valid.selection,
    garmentSpec: {
      ...valid.selection.garmentSpec!,
      fabricUnits: 2 as const,
    },
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      malformedUnits,
    ),
    state,
  );

  const first = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
  });
  assert.equal(first.status, "resolved");
  let committed = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    first.selection,
  );
  const alreadyCommitted =
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      committed,
      first.selection,
    );
  assert.equal(alreadyCommitted.pendingFabricGarment, null);

  const pending = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    valid.selection,
  );
  const second = createCatalogueAdditionalGarmentSelection({
    garmentType: "trouser",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
  });
  assert.equal(second.status, "resolved");
  const conflicting =
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      pending,
      second.selection,
    );
  assert.equal(
    conflicting.pendingFabricGarment?.garmentKey,
    pending.pendingFabricGarment?.garmentKey,
  );

  const awaitingOnly = {
    ...state,
    awaitingFabricForPendingGarment: true,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      awaitingOnly,
      valid.selection,
    ),
    awaitingOnly,
  );
}

// --- Capacity confirmation ---
{
  let state = withBaseShirt();
  const authorizedCapacityKeys: string[] = [];
  const firstExtra = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedCapacityKeys,
  });
  assert.equal(firstExtra.status, "resolved");
  const firstKey = firstExtra.selection.garmentSpec!.key;
  assert.ok(firstKey);
  authorizedCapacityKeys.push(firstKey);
  state = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    firstExtra.selection,
  );
  const extra = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedCapacityKeys,
  });
  assert.equal(extra.status, "resolved");
  const key = extra.selection.garmentSpec!.key;
  const pending = FabricAllocationStateEngine.attemptAppendGarment(
    state,
    extra.selection,
  );
  // capacity full (base shirt + first extra) — third shirt pending
  assert.equal(pending.pendingFabricGarment?.garmentKey, key);
  const same = FabricAllocationStateEngine.useSameFabricForPendingGarment(pending);
  const ok = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: same,
    garmentKey: key,
    fabricCode: fabricA.code,
  });
  assert.equal(ok.status, "assigned");

  // Over-capacity unique assignment (gown 2 + shirt 1)
  const overCapacity = {
    fabricAllocations: [
      {
        allocationId: "over",
        fabricCode: fabricA.code,
        garmentAssignments: [
          {
            garmentKey: "additional:full_length_gown:1",
            code: "GOWN",
            garmentType: "full_length_gown" as const,
            fabricUnits: 2 as const,
            sourceRole: "additional" as const,
          },
          {
            garmentKey: key,
            code: "SHIRT",
            garmentType: "shirt" as const,
            fabricUnits: 1 as const,
            sourceRole: "additional" as const,
          },
        ],
      },
    ],
    activeAllocationId: "over",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const blockedCapacity = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: overCapacity,
    garmentKey: key,
    fabricCode: fabricA.code,
  });
  assert.equal(blockedCapacity.status, "blocked");
  assert.match(blockedCapacity.reason, /capacity/i);

  const gownAloneBlocked = confirmAdditionalGarmentFabricAssignment({
    previousState: pending,
    nextState: {
      ...overCapacity,
      fabricAllocations: [
        {
          allocationId: "gown-plus",
          fabricCode: fabricB.code,
          garmentAssignments: [
            {
              garmentKey: "additional:full_length_gown:1",
              code: "GOWN",
              garmentType: "full_length_gown",
              fabricUnits: 2,
              sourceRole: "additional",
            },
            {
              garmentKey: "additional:shirt:9",
              code: "SHIRT",
              garmentType: "shirt",
              fabricUnits: 1,
              sourceRole: "additional",
            },
          ],
        },
      ],
    },
    garmentKey: "additional:full_length_gown:1",
    fabricCode: fabricB.code,
  });
  assert.equal(gownAloneBlocked.status, "blocked");

  // two half-unit garments valid
  const twoHalf = {
    fabricAllocations: [
      {
        allocationId: "pair",
        fabricCode: fabricA.code,
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE",
            garmentType: "shirt" as const,
            fabricUnits: 1 as const,
            sourceRole: "main" as const,
          },
          {
            garmentKey: key,
            code: "ADD",
            garmentType: "shirt" as const,
            fabricUnits: 1 as const,
            sourceRole: "additional" as const,
          },
        ],
      },
    ],
    activeAllocationId: "pair",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  assert.equal(
    confirmAdditionalGarmentFabricAssignment({
      previousState: pending,
      nextState: twoHalf,
      garmentKey: key,
      fabricCode: fabricA.code,
    }).status,
    "assigned",
  );

  // duplicate garmentKey
  const duplicate = {
    ...twoHalf,
    fabricAllocations: [
      ...twoHalf.fabricAllocations,
      {
        allocationId: "dup",
        fabricCode: fabricB.code,
        garmentAssignments: [twoHalf.fabricAllocations[0].garmentAssignments[1]],
      },
    ],
  };
  assert.equal(
    confirmAdditionalGarmentFabricAssignment({
      previousState: twoHalf,
      nextState: duplicate,
      garmentKey: key,
      fabricCode: fabricB.code,
    }).status,
    "blocked",
  );
}

// --- Stale cleanup ownership ---
{
  const transaction: AdditionalGarmentFabricTransaction = {
    transactionId: 11,
    phase: "catalogue",
    origin: "new_addition",
    garmentKey: "additional:shirt:2",
    garmentType: "shirt",
    openedModal: true,
  };
  const matchingPending: FabricAllocationState = {
    fabricAllocations: [],
    activeAllocationId: null,
    pendingFabricGarment: {
      garmentKey: "additional:shirt:2",
      code: "X",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
    awaitingFabricForPendingGarment: true,
  };
  assert.equal(
    canCancelPendingForAdditionalGarmentTransaction({
      transaction,
      fabricAllocationState: matchingPending,
      expectedTransactionId: 11,
    }),
    true,
  );
  assert.equal(
    canCancelPendingForAdditionalGarmentTransaction({
      transaction,
      fabricAllocationState: {
        ...matchingPending,
        pendingFabricGarment: {
          ...matchingPending.pendingFabricGarment!,
          garmentKey: "additional:shirt:9",
        },
      },
      expectedTransactionId: 11,
    }),
    false,
  );
  assert.equal(
    canCancelPendingForAdditionalGarmentTransaction({
      transaction,
      fabricAllocationState: matchingPending,
      expectedTransactionId: 99,
    }),
    false,
  );
  assert.match(STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE, /no longer current/i);
  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "custom_details",
      garmentTypeComplete: true,
      fabricComplete: false,
      designSourceReady: true,
      customDetailsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: null,
    }),
    "fabric",
  );
}

// --- Live catalogue re-resolution ---
{
  const staleInStock = { ...fabricA, stockStatus: "IN_STOCK" as const };
  const liveOut = { ...fabricA, stockStatus: "OUT_OF_STOCK" as const };
  assert.equal(
    resolveCurrentCatalogueFabricForAssignment({
      fabrics: [liveOut],
      fabricCode: staleInStock.code,
    }).status,
    "blocked",
  );
  assert.equal(
    resolveCurrentCatalogueFabricForAssignment({
      fabrics: [fabricB],
      fabricCode: fabricA.code,
    }).status,
    "blocked",
  );
  assert.equal(
    resolveCurrentCatalogueFabricForAssignment({
      fabrics: [{ ...fabricA, stockStatus: "HIDDEN" }],
      fabricCode: fabricA.code,
    }).status,
    "blocked",
  );
  assert.equal(
    resolveCurrentCatalogueFabricForAssignment({
      fabrics: [
        {
          ...fabricA,
          name: "Unpriced",
          category: "Unknown Category",
          price: undefined as unknown as number,
          priceMultiplier: undefined as unknown as number,
        },
      ],
      fabricCode: fabricA.code,
    }).status,
    "blocked",
  );
  const resolved = resolveCurrentCatalogueFabricForAssignment({
    fabrics: [{ ...fabricA, name: "Current Name" }],
    fabricCode: fabricA.code,
  });
  assert.equal(resolved.status, "resolved");
  if (resolved.status === "resolved") {
    assert.equal(resolved.fabric.name, "Current Name");
  }
  assert.equal(
    resolveCurrentCatalogueFabricForAssignment({
      fabrics: [fabricA, { ...fabricA, name: "Dup" }],
      fabricCode: fabricA.code,
    }).status,
    "blocked",
  );
  const dup = resolveCurrentCatalogueFabricForAssignment({
    fabrics: [fabricA, { ...fabricA, name: "Dup" }],
    fabricCode: fabricA.code,
  });
  assert.equal(dup.status, "blocked");
  if (dup.status === "blocked") {
    assert.equal(dup.code, "duplicate_code");
    assert.match(dup.reason, /catalogue review/i);
  }
}

// --- Forged parent relationship rejection ---
{
  const state = withBaseShirt();
  const valid = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
  });
  assert.equal(valid.status, "resolved");

  // TEST A — nonexistent parent
  const forgedMissing = {
    ...valid.selection,
    mainGarmentKey: "base:does-not-exist",
    mainGarmentType: "trouser" as const,
    eligibilityRule: "catalog_all" as const,
  };
  const rejectedMissing =
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      forgedMissing,
    );
  assert.equal(rejectedMissing, state);
  assert.equal(rejectedMissing.pendingFabricGarment, null);

  // TEST B — mismatched parent type
  const forgedType = {
    ...valid.selection,
    mainGarmentKey: "base:shirt",
    mainGarmentType: "trouser" as const,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      forgedType,
    ),
    state,
  );

  // TEST C — duplicate parent identity
  const duplicateParentState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "a",
        fabricCode: fabricA.code,
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
            dependencyStatus: "valid",
          },
        ],
      },
      {
        allocationId: "b",
        fabricCode: fabricB.code,
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT_DUP",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
            dependencyStatus: "valid",
          },
        ],
      },
    ],
    activeAllocationId: "a",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      duplicateParentState,
      valid.selection,
    ),
    duplicateParentState,
  );

  // TEST D — orphaned parent
  const orphanedParentState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "orphan",
        fabricCode: fabricA.code,
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
            dependencyStatus: "orphaned",
          },
        ],
      },
    ],
    activeAllocationId: "orphan",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      orphanedParentState,
      valid.selection,
    ),
    orphanedParentState,
  );

  // TEST E — invalid eligibility relationship (demographic_policy without policy parent)
  const forgedEligibility = {
    ...valid.selection,
    eligibilityRule: "demographic_policy" as const,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      forgedEligibility,
    ),
    state,
  );

  // TEST F — dependency status inconsistent
  const forgedDependency = {
    ...valid.selection,
    dependencyStatus: "orphaned" as const,
  };
  assert.equal(
    FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
      state,
      forgedDependency,
    ),
    state,
  );

  // TEST G — valid canonical selection accepted
  const parked = FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
    state,
    valid.selection,
  );
  assert.equal(parked.pendingFabricGarment?.garmentKey, valid.selection.garmentSpec!.key);
  assert.equal(parked.awaitingFabricForPendingGarment, true);
}

// --- Duplicate Same Fabric presentation + live re-resolution ---
{
  const { FutureAdditionalGarmentFabricDialog } = await import(
    "./src/components/FutureAdditionalGarmentFabricDialog"
  );
  const { reconcileGarmentTypeStepSelection } = await import(
    "./src/utils/garmentTypeStepState"
  );
  const { normalizeCustomDetailCatalog } = await import(
    "./src/utils/catalogHelpers"
  );
  const { SEED_CUSTOM_DETAIL_CATALOG } = await import(
    "./src/config/GarmentDetailsConfig"
  );
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: normalizeCustomDetailCatalog(
      SEED_CUSTOM_DETAIL_CATALOG,
    ),
  }).selection;
  const state = withBaseShirt();
  const pending: FabricAllocationState = {
    ...state,
    pendingFabricGarment: {
      garmentKey: "additional:shirt:1",
      code: "ADD",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
      mainGarmentKey: "base:shirt",
      mainGarmentType: "shirt",
      eligibilityRule: "catalog_all",
      dependencyStatus: "valid",
    },
    awaitingFabricForPendingGarment: true,
  };
  let assignCalls = 0;
  let dialog!: ReturnType<typeof create>;
  const renderDialog = (fabrics: Fabric[]) =>
    createElement(FutureAdditionalGarmentFabricDialog, {
      transaction: {
        transactionId: 7,
        phase: "choice",
        garmentKey: "additional:shirt:1",
        garmentType: "shirt",
        origin: "new_addition",
        openedModal: true,
      },
      fabrics,
      garmentTypeSelection,
      fabricAllocationState: pending,
      activeFabric: fabrics[0] || null,
      activeFabricSelectionIndex: 1,
      activeFabricResolution: resolveCurrentCatalogueFabricForAssignment({
        fabrics,
        fabricCode: fabricA.code,
      }),
      activeFabricCode: fabricA.code,
      errorMessage: null,
      onUseSameFabric: () => {
        assignCalls += 1;
      },
      onChooseAnotherFabric: () => undefined,
      onBackToChoice: () => undefined,
      onSelectFabric: () => undefined,
      onCancel: () => undefined,
    });

  act(() => {
    dialog = create(renderDialog([fabricA]));
  });
  assert.equal(
    dialog.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
      .disabled,
    false,
  );

  act(() => {
    dialog.update(renderDialog([fabricA, { ...fabricA, name: "Duplicate A" }]));
  });
  const sameBtn = dialog.root.findByProps({
    "data-fabric-dialog-action": "use-same",
  });
  assert.equal(sameBtn.props.disabled, true);
  assert.match(textContent(dialog.root), /catalogue review/i);
  assert.equal(
    dialog.root.findAllByProps({ "data-fabric-dialog-action": "choose-another" })
      .length,
    1,
  );
  act(() => {
    sameBtn.props.onClick();
  });
  assert.equal(assignCalls, 1, "disabled control still invokes handler in test renderer");
  // Handler path must revalidate: simulate production click-time check
  const blockedAtClick = resolveCurrentCatalogueFabricForAssignment({
    fabrics: [fabricA, { ...fabricA, name: "Duplicate A" }],
    fabricCode: fabricA.code,
  });
  assert.equal(blockedAtClick.status, "blocked");

  act(() => {
    dialog.update(
      renderDialog([{ ...fabricA, stockStatus: "OUT_OF_STOCK" as const }]),
    );
  });
  assert.equal(
    dialog.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
      .disabled,
    true,
  );

  act(() => {
    dialog.update(
      renderDialog([{ ...fabricA, stockStatus: "HIDDEN" as const }]),
    );
  });
  assert.equal(
    dialog.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
      .disabled,
    true,
  );

  act(() => {
    dialog.update(renderDialog([]));
  });
  assert.equal(
    dialog.root.findByProps({ "data-fabric-dialog-action": "use-same" }).props
      .disabled,
    true,
  );
}

// --- Persistent accessible stale alert on Step 4 ---
{
  const { DormantFutureCustomDetailsStep } = await import(
    "./src/components/DormantFutureCustomDetailsStep"
  );
  const { reconcileGarmentTypeStepSelection } = await import(
    "./src/utils/garmentTypeStepState"
  );
  const { inspectCustomDetailCatalog } = await import(
    "./src/utils/catalogHelpers"
  );
  const { SEED_CUSTOM_DETAIL_CATALOG } = await import(
    "./src/config/GarmentDetailsConfig"
  );
  const {
    reconcileGarmentScopedCustomDetails,
    reconcileGarmentScopedPersonalizedInputs,
    validateGarmentScopedCustomDetailsCompletion,
    calculateGarmentScopedCustomDetailsPricing,
  } = await import("./src/utils/garmentScopedCustomDetailsDomain");
  const { createEmptyGarmentScopedCustomDetailsState } = await import(
    "./src/utils/garmentScopedCustomDetailsState"
  );
  const { createEmptyGarmentScopedCustomDetailInputs } = await import(
    "./src/utils/garmentScopedCustomDetailInputsState"
  );
  const { projectFutureCustomDetailsCatalogue } = await import(
    "./src/utils/futureCustomDetailsCatalogue"
  );
  const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
  const garmentTypeSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: catalogInspection.activeOptions,
  }).selection;
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    catalogInspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const catalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection,
    style: null,
    reconciliation,
    activeOptions: catalogInspection.activeOptions,
    additionalGarments: [],
  });
  const completion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation,
    personalizedInputs,
  });
  const pricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation,
    catalogInspection,
  });
  let step!: ReturnType<typeof create>;
  const renderStep = (persistentError: string | null) =>
    createElement(DormantFutureCustomDetailsStep, {
      reconciliation,
      catalogue,
      personalizedInputs: personalizedInputs.state,
      completion,
      pricing,
      constructionBreakdown: { status: "complete", rows: [] },
      constructionSubtotal: 65,
      orderLevelCustomDetailsPrice: 0,
      designSelections: {},
      showAdditionalClothesCosts: false,
      selectedStyle: null,
      additionalGarments: [],
      additionalGarmentConstructionOptions: [],
      onSingleSelect: () => undefined,
      onClearSelection: () => undefined,
      onConstructionSelect: () => undefined,
      onToggleMultiSelect: () => undefined,
      onPersonalizedTextChange: () => undefined,
      onDecorativeFeatureToggle: () => undefined,
      onClearDecorativeFeatures: () => undefined,
      onMonogramPlacementChange: () => undefined,
      onAccessoryToggle: () => undefined,
      onClearAccessories: () => undefined,
      onAddAdditionalGarment: () => undefined,
      onRemoveAdditionalGarment: () => undefined,
      fabricPersistentError: persistentError,
      onBack: () => undefined,
      onContinue: () => undefined,
    });

  act(() => {
    step = create(renderStep(STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE));
  });
  const alerts = step.root.findAllByProps({
    "data-additional-garment-fabric-persistent-error": "true",
  });
  assert.ok(alerts.length >= 1);
  assert.equal(alerts[0].props.role, "alert");
  assert.equal(alerts[0].props["aria-live"], "assertive");
  assert.match(textContent(alerts[0]), /no longer current/i);
  assert.equal(
    String(alerts[0].props.className || "").includes("sr-only"),
    false,
  );

  // TEST B — survives transaction clear (still rendered when error prop remains)
  act(() => {
    step.update(renderStep(STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE));
  });
  assert.ok(
    step.root.findAllByProps({
      "data-additional-garment-fabric-persistent-error": "true",
    }).length >= 1,
  );

  // TEST C — clears on meaningful new action (parent clears prop)
  act(() => {
    step.update(renderStep(null));
  });
  assert.equal(
    step.root.findAllByProps({
      "data-additional-garment-fabric-persistent-error": "true",
    }).length,
    0,
  );

  // TEST D — unrelated Step 4 action does not clear (error still passed)
  act(() => {
    step.update(renderStep(STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE));
  });
  assert.ok(
    step.root.findAllByProps({
      "data-additional-garment-fabric-persistent-error": "true",
    }).length >= 1,
  );
}

// --- Broken image fallback on shared card ---
{
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric: {
          ...fabricA,
          image: "https://example.test/broken.jpg",
          colorHex: "#ABCDEF",
        },
        presentation: {
          status: "SELECT",
          action: "select",
          cancelGarmentKey: null,
        },
        onAction: () => undefined,
      }),
    );
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-fabric-card-image": "true" }).length,
    1,
  );
  act(() => {
    renderer.root
      .findByProps({ "data-fabric-card-image": "true" })
      .props.onError();
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-fabric-card-image": "true" }).length,
    0,
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-fabric-card-swatch": "true" }).length,
    1,
  );

  act(() => {
    renderer.update(
      createElement(FutureFabricCatalogueCard, {
        fabric: {
          ...fabricA,
          code: "FAB-FALLBACK",
          image: "https://example.test/also-broken.jpg",
          colorHex: "not-a-hex",
        },
        presentation: {
          status: "SELECT",
          action: "select",
          cancelGarmentKey: null,
        },
        onAction: () => undefined,
      }),
    );
  });
  act(() => {
    renderer.root
      .findByProps({ "data-fabric-card-image": "true" })
      .props.onError();
  });
  assert.equal(
    renderer.root.findAllByProps({ "data-fabric-card-fallback": "true" }).length,
    1,
  );
}

console.log("PASS: narrow inline fabric picker repair regressions");
