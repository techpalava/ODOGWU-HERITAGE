import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { StrictMode, createElement, useState } from "react";
import { act, create } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  AdditionalGarmentConstructionStateV1,
  DesignSelections,
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  createEmptyAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import {
  createCatalogueAdditionalGarmentSelection,
} from "./src/utils/additionalGarmentDomain";
import { isFutureMeasurementStageUnlocked } from "./src/utils/measurementBlueprint";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
} from "./src/utils/designSourceState";
import {
  createEmptyFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
} from "./src/utils/measurementBlueprint";
import {
  resolveFuturePhysicalGarmentRemovalAuthority,
  type RemoveFuturePhysicalGarmentOccurrenceInput,
} from "./src/utils/midProcessGarmentRemoval";
import {
  applyFuturePhysicalGarmentRemovalCommit,
  createRemovalStageRetentionLease,
  isCurrentAdditionalGarmentFabricOperation,
  isRemovalStageRetentionLeaseActive,
  preparePendingAdditionalGarmentCancellationCommit,
  prepareFuturePhysicalGarmentRemovalTransaction,
  projectFutureGarmentRemovalTransientPlan,
} from "./src/utils/midProcessGarmentRemovalIntegration";
import {
  createUploadedDesignOperationCoordinator,
  getUploadedDesignAdditionalGarmentTypes,
  mergeUploadedDesignCompositionWithStep1,
  runUploadedDesignOperation,
} from "./src/utils/uploadedDesignStep1";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { transitionAiTryOnWorkflow } from "./src/utils/aiTryOnWorkflow";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const makeSelection = (
  garmentTypes: readonly FabricGarmentType[],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [...garmentTypes],
    selectedDemographics: ["female"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const makeAssignment = (
  garmentType: FabricGarmentType,
  garmentKey = createStyleBaseGarmentSpec(garmentType).key,
  options: Partial<FabricGarmentAssignment> = {},
): FabricGarmentAssignment => {
  const spec = createStyleBaseGarmentSpec(garmentType);
  return {
    garmentKey,
    code: `GARMENT_${garmentKey.toUpperCase()}`,
    garmentType,
    fabricUnits: spec.fabricUnits,
    garmentSpec: { ...spec, key: garmentKey },
    sourceRole: garmentKey.startsWith("additional:")
      ? "additional"
      : "main",
    ...options,
  };
};

const makeFabricState = (
  assignments: readonly FabricGarmentAssignment[],
  allocationId = "allocation-main",
  fabricCode = "FAB-A",
): FabricAllocationState => ({
  fabricAllocations: [
    {
      allocationId,
      fabricCode,
      garmentAssignments: assignments.map((assignment) => ({
        ...assignment,
        ...(assignment.garmentSpec
          ? { garmentSpec: { ...assignment.garmentSpec } }
          : {}),
      })),
    },
  ],
  activeAllocationId: allocationId,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const authorize = (
  input: Omit<
    RemoveFuturePhysicalGarmentOccurrenceInput,
    "expectedAuthoritySignature"
  >,
): RemoveFuturePhysicalGarmentOccurrenceInput => {
  const authority = resolveFuturePhysicalGarmentRemovalAuthority(input);
  assert.equal(authority.status, "resolved");
  if (authority.status !== "resolved") {
    throw new Error("Expected removal authority to resolve.");
  }
  return { ...input, expectedAuthoritySignature: authority.signature };
};

const makeBaseRemovalInput = ({
  garmentTypes = ["shirt", "skirt"],
  targetGarmentKey = "base:skirt",
  fabricAllocationState = makeFabricState([
    makeAssignment("shirt"),
    makeAssignment("skirt"),
  ]),
  additionalGarmentConstructionState =
    createEmptyAdditionalGarmentConstructionState(),
}: {
  garmentTypes?: readonly FabricGarmentType[];
  targetGarmentKey?: string;
  fabricAllocationState?: FabricAllocationState;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1;
} = {}) => {
  const garmentTypeSelection = makeSelection(garmentTypes);
  const designSource = createCatalogDesignSource("integration-style")!;
  return authorize({
    targetGarmentKey,
    garmentTypeSelection,
    designSource,
    selectedStyle: null,
    confirmedDesignSourceKey: designSource.sourceKey,
    uploadedCompositionMirror: [],
    uploadedAdditionalGarmentTypes: [],
    additionalGarmentConstructionState,
    fabricAllocationState,
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { neck_design: "neck_no_round" },
        "base:skirt": { skirt_length: "skirt_standard" },
      },
      snapshotsByGarmentKey: {},
    },
    garmentScopedCustomDetailInputs: {
      schemaVersion: 1,
      textByGarmentKey: {
        "base:skirt": {
          personalized_additional: {
            personalized_additional_evaluation: "Remove this requirement",
          },
        },
      },
    },
    measurementState: createEmptyFutureMeasurementState("low_risk", "cm"),
    aiTryOnWorkflowState: {
      schemaVersion: 1,
      status: "completed",
      inputFingerprint: "tryon-v1-pre-removal",
      resultReference: {
        kind: "verified_private_try_on_result",
        assetId: "asset-pre-removal",
        ownerBindingId: "owner-pre-removal",
      },
    },
    shippingState: createEmptyFutureShippingState(),
    normalizedCustomDetailCatalog: catalog,
    aiTryOnPolicy: { gatewayAvailable: false, skipAllowed: true },
    pendingOperations: {
      protectedSourceMutationPending: false,
      pickerGarmentKey: null,
      additionalFabricTransactionGarmentKey: null,
      uploadOperationGeneration: null,
    },
  });
};

const currentDesignSelections: DesignSelections = {
  accessories: [],
  additionalGarmentConstructions:
    createEmptyAdditionalGarmentConstructionState(),
  garmentScopedCustomDetails:
    makeBaseRemovalInput().garmentScopedCustomDetails,
  garmentScopedCustomDetailInputs:
    makeBaseRemovalInput().garmentScopedCustomDetailInputs,
};

const baseInput = makeBaseRemovalInput();
const prepared = prepareFuturePhysicalGarmentRemovalTransaction({
  input: baseInput,
  currentDesignSelections,
  currentPriceActivatedFabricCode: "FAB-A",
});
assert.equal(prepared.status, "removed");
if (prepared.status !== "removed") {
  throw new Error("Expected the integration transaction to remove Skirt.");
}
assert.deepEqual(prepared.commit.garmentTypeSelection.garmentTypes, ["shirt"]);
assert.deepEqual(
  prepared.commit.fabricAllocationState.fabricAllocations[0]
    ?.garmentAssignments.map((assignment) => assignment.garmentKey),
  ["base:shirt"],
);
assert.equal(
  prepared.commit.fabricAllocationState.fabricAllocations[0]?.allocationId,
  "allocation-main",
  "a shared allocation remains the same allocation after shrinking from 2/2 to 1/2",
);
assert.equal(
  prepared.commit.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey["base:skirt"],
  undefined,
);
assert.equal(
  prepared.commit.designSelections.garmentScopedCustomDetailInputs
    ?.textByGarmentKey["base:skirt"],
  undefined,
);
assert.equal(prepared.commit.selectedFabricCode, "FAB-A");
assert.equal(prepared.commit.priceActivatedFabricCode, "FAB-A");
assert.equal(prepared.commit.aiTryOnWorkflowState.status, "stale");
assert.equal(prepared.commit.shippingState.quoteReference, null);
assert.equal(
  isFutureMeasurementStageUnlocked(prepared.commit.aiTryOnWorkflowState),
  false,
  "a retention lease must not make the stale AI state ready",
);
const lateAiCompletion = transitionAiTryOnWorkflow({
  state: prepared.commit.aiTryOnWorkflowState,
  event: {
    type: "complete",
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: "late-result",
      ownerBindingId: "late-owner",
    },
  },
  skipAllowed: true,
});
assert.equal(
  lateAiCompletion.ok,
  false,
  "a late AI completion cannot become current after garment removal invalidates its fingerprint",
);

// Removing a primary allocation's final owner prunes it and rebinds projection.
{
  const finalOwnerInput = makeBaseRemovalInput({
    targetGarmentKey: "base:shirt",
    fabricAllocationState: {
      fabricAllocations: [
        {
          allocationId: "allocation-primary",
          fabricCode: "FAB-A",
          garmentAssignments: [makeAssignment("shirt")],
        },
        {
          allocationId: "allocation-survivor",
          fabricCode: "FAB-B",
          garmentAssignments: [makeAssignment("skirt")],
        },
      ],
      activeAllocationId: "allocation-primary",
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    },
  });
  const finalOwner = prepareFuturePhysicalGarmentRemovalTransaction({
    input: finalOwnerInput,
    currentDesignSelections,
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(finalOwner.status, "removed");
  if (finalOwner.status !== "removed") {
    throw new Error("Expected final-owner removal to resolve.");
  }
  assert.deepEqual(
    finalOwner.commit.fabricAllocationState.fabricAllocations.map(
      (allocation) => allocation.allocationId,
    ),
    ["allocation-survivor"],
  );
  assert.equal(
    finalOwner.commit.fabricAllocationState.activeAllocationId,
    "allocation-survivor",
  );
  assert.equal(finalOwner.commit.selectedFabricCode, "FAB-B");
  assert.equal(
    finalOwner.commit.priceActivatedFabricCode,
    null,
    "a removed primary Fabric cannot remain pricing-authoritative",
  );
}

// Every aggregate writer is invoked exactly once for one successful action.
{
  const writerCalls = new Map<string, number>();
  const record = (key: string) => {
    writerCalls.set(key, (writerCalls.get(key) || 0) + 1);
  };
  applyFuturePhysicalGarmentRemovalCommit(prepared.commit, {
    setGarmentTypeSelection: () => record("garments"),
    setDesignSource: () => record("source"),
    setConfirmedDesignSourceKey: () => record("confirmed"),
    setUploadedCompositionMirror: () => record("upload-composition"),
    setUploadedAdditionalGarmentTypes: () => record("upload-additional"),
    setFabricAllocationState: () => record("fabric"),
    setDesignSelections: () => record("details"),
    setMeasurementState: () => record("measurements"),
    setAiTryOnWorkflowState: () => record("ai"),
    setShippingState: () => record("shipping"),
    setSelectedFabricCode: () => record("selected-fabric"),
    setPriceActivatedFabricCode: () => record("price-fabric"),
  });
  assert.deepEqual(
    [...writerCalls.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    [
      "ai",
      "confirmed",
      "details",
      "fabric",
      "garments",
      "measurements",
      "price-fabric",
      "selected-fabric",
      "shipping",
      "source",
      "upload-additional",
      "upload-composition",
    ].map((key) => [key, 1]),
  );
}

// Blocked and stale transactions have no aggregate commit to apply.
{
  const stale = prepareFuturePhysicalGarmentRemovalTransaction({
    input: {
      ...baseInput,
      expectedAuthoritySignature: `${baseInput.expectedAuthoritySignature}:stale`,
    },
    currentDesignSelections,
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(stale.status, "stale_authority");
  assert.equal(stale.commit, null);
  assert.strictEqual(stale.result.state.garmentTypeSelection, baseInput.garmentTypeSelection);
  assert.strictEqual(stale.result.state.fabricAllocationState, baseInput.fabricAllocationState);

  const protectedMutation = prepareFuturePhysicalGarmentRemovalTransaction({
    input: {
      ...baseInput,
      pendingOperations: {
        ...baseInput.pendingOperations,
        protectedSourceMutationPending: true,
      },
    },
    currentDesignSelections,
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(protectedMutation.status, "blocked");
  assert.equal(protectedMutation.commit, null);
  assert.equal(
    protectedMutation.result.status === "blocked"
      ? protectedMutation.result.code
      : null,
    "PROTECTED_SOURCE_MUTATION_PENDING",
  );

  const lastInput = makeBaseRemovalInput({
    garmentTypes: ["shirt"],
    targetGarmentKey: "base:shirt",
    fabricAllocationState: makeFabricState([makeAssignment("shirt")]),
  });
  const last = prepareFuturePhysicalGarmentRemovalTransaction({
    input: lastInput,
    currentDesignSelections: { accessories: [] },
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(last.status, "blocked");
  assert.equal(
    last.result.status === "blocked" ? last.result.code : null,
    "LAST_GARMENT_REMOVAL_FORBIDDEN",
  );
  assert.equal(last.commit, null);
}

// Parent dependency is also an atomic no-op at the integration boundary.
{
  const additionalKey = "additional:shirt:1";
  const construction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(construction.status, "resolved");
  const additionalState: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: { [additionalKey]: construction },
  };
  const dependentAssignment = makeAssignment("shirt", additionalKey, {
    sourceRole: "additional",
    mainGarmentKey: "base:shirt",
    mainGarmentType: "shirt",
    eligibilityRule: "catalog_all",
    dependencyStatus: "valid",
  });
  const dependencyInput = makeBaseRemovalInput({
    targetGarmentKey: "base:shirt",
    additionalGarmentConstructionState: additionalState,
    fabricAllocationState: makeFabricState([
      makeAssignment("shirt"),
      makeAssignment("skirt"),
      dependentAssignment,
    ]),
  });
  const dependency = prepareFuturePhysicalGarmentRemovalTransaction({
    input: dependencyInput,
    currentDesignSelections: {
      accessories: [],
      additionalGarmentConstructions: additionalState,
    },
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(dependency.status, "blocked");
  assert.equal(
    dependency.result.status === "blocked" ? dependency.result.code : null,
    "DEPENDENT_ADDITIONAL_GARMENT_PRESENT",
  );
  assert.equal(dependency.commit, null);
  assert.strictEqual(
    dependency.result.state.additionalGarmentConstructionState,
    dependencyInput.additionalGarmentConstructionState,
  );
}

// Repeated additions remain independent and the existing highest-key reuse stays valid.
{
  const oneKey = "additional:shirt:1";
  const twoKey = "additional:shirt:2";
  const construction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(construction.status, "resolved");
  const repeatedState: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      [oneKey]: construction,
      [twoKey]: construction,
    },
  };
  const additional = (garmentKey: string) =>
    makeAssignment("shirt", garmentKey, {
      sourceRole: "additional",
      mainGarmentKey: "base:shirt",
      mainGarmentType: "shirt",
      eligibilityRule: "catalog_all",
      dependencyStatus: "valid",
    });
  const repeatedInput = makeBaseRemovalInput({
    targetGarmentKey: twoKey,
    additionalGarmentConstructionState: repeatedState,
    fabricAllocationState: makeFabricState([
      makeAssignment("shirt"),
      makeAssignment("skirt"),
      additional(oneKey),
      additional(twoKey),
    ]),
  });
  const repeated = prepareFuturePhysicalGarmentRemovalTransaction({
    input: repeatedInput,
    currentDesignSelections: {
      accessories: [],
      additionalGarmentConstructions: repeatedState,
    },
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(repeated.status, "removed");
  if (repeated.status !== "removed") throw new Error("Repeated removal failed.");
  assert.ok(
    repeated.commit.designSelections.additionalGarmentConstructions
      ?.byGarmentKey[oneKey],
  );
  assert.equal(
    repeated.commit.designSelections.additionalGarmentConstructions
      ?.byGarmentKey[twoKey],
    undefined,
  );
  const reused = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: repeated.result.survivorOccurrences,
    authorizedOccurrenceKeys: repeated.result.survivorOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
  });
  assert.equal(reused.status, "resolved");
  assert.equal(
    reused.status === "resolved" ? reused.selection.garmentSpec?.key : null,
    twoKey,
  );
}

// Uploaded source and local composition mirrors are committed together.
{
  const step1 = makeSelection(["shirt", "skirt"]);
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: step1.garmentTypes,
    additionalGarmentTypes: ["trouser"],
  });
  const source = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "integration-owner",
      designReferenceId: "integration-upload",
      mimeType: "image/png",
      createdAt: "2026-09-02T00:00:00.000Z",
    }),
    fabricCapacityComposition: composition,
    demographic: "female",
    displayLabel: "Integration upload",
  });
  const input = authorize({
    ...makeBaseRemovalInput({
      garmentTypes: ["shirt", "skirt"],
    }),
    targetGarmentKey: "base:trouser",
    garmentTypeSelection: step1,
    designSource: source,
    confirmedDesignSourceKey: source.sourceKey,
    fabricAllocationState: makeFabricState([
      makeAssignment("shirt"),
      makeAssignment("skirt"),
      makeAssignment("trouser"),
    ]),
    uploadedCompositionMirror: composition,
    uploadedAdditionalGarmentTypes: ["trouser"],
    pendingOperations: {
      protectedSourceMutationPending: false,
      pickerGarmentKey: null,
      additionalFabricTransactionGarmentKey: null,
      uploadOperationGeneration: 9,
    },
  });
  const uploadRemoval = prepareFuturePhysicalGarmentRemovalTransaction({
    input,
    currentDesignSelections: { accessories: [] },
    currentPriceActivatedFabricCode: "FAB-A",
  });
  assert.equal(uploadRemoval.status, "removed");
  if (uploadRemoval.status !== "removed") {
    throw new Error("Uploaded removal failed.");
  }
  assert.deepEqual(
    uploadRemoval.commit.uploadedCompositionMirror.map(
      (spec) => spec.garmentType,
    ),
    ["shirt", "skirt"],
  );
  assert.deepEqual(uploadRemoval.commit.uploadedAdditionalGarmentTypes, []);
  assert.equal(
    uploadRemoval.commit.designSource?.kind === "uploaded"
      ? uploadRemoval.commit.designSource.fabricCapacityComposition.some(
          (spec) => spec.garmentType === "trouser",
        )
      : true,
    false,
  );
  assert.equal(
    uploadRemoval.result.invalidations.invalidateUploadOperationGeneration,
    true,
  );
  assert.deepEqual(
    getUploadedDesignAdditionalGarmentTypes({
      step1GarmentTypes: step1.garmentTypes,
      composition: uploadRemoval.commit.uploadedCompositionMirror,
    }),
    [],
  );
}

// Target-only transient cleanup and ABA-safe transaction identity.
{
  const matchingTransaction = {
    transactionId: 10,
    phase: "catalogue" as const,
    origin: "change_existing" as const,
    garmentKey: "base:skirt",
    garmentType: "skirt" as const,
    openedModal: true,
  };
  const matchingPlan = projectFutureGarmentRemovalTransientPlan({
    result: prepared.result,
    currentAdditionalFabricTransaction: matchingTransaction,
    currentCustomDetailsFocusGarmentKey: "base:skirt",
  });
  assert.equal(matchingPlan.clearAdditionalFabricTransaction, true);
  assert.equal(matchingPlan.nextCustomDetailsFocusGarmentKey, "base:shirt");

  const unrelatedTransaction = {
    ...matchingTransaction,
    transactionId: 11,
    garmentKey: "additional:shirt:1",
    garmentType: "shirt" as const,
  };
  const unrelatedPlan = projectFutureGarmentRemovalTransientPlan({
    result: prepared.result,
    currentAdditionalFabricTransaction: unrelatedTransaction,
    currentCustomDetailsFocusGarmentKey: "additional:shirt:1",
  });
  assert.equal(unrelatedPlan.clearAdditionalFabricTransaction, false);
  assert.equal(
    unrelatedPlan.nextCustomDetailsFocusGarmentKey,
    "additional:shirt:1",
  );
  assert.equal(
    isCurrentAdditionalGarmentFabricOperation({
      currentTransaction: unrelatedTransaction,
      expectedTransactionId: 10,
      expectedGarmentKey: "additional:shirt:1",
    }),
    false,
    "an old callback cannot attach to a reused key with a newer transaction id",
  );
  assert.equal(
    isCurrentAdditionalGarmentFabricOperation({
      currentTransaction: unrelatedTransaction,
      expectedTransactionId: 11,
      expectedGarmentKey: "additional:shirt:1",
    }),
    true,
  );
}

// A provisional addition keeps its separate cancellation path without orphans.
{
  const pendingKey = "additional:shirt:1";
  const siblingKey = "additional:shirt:2";
  const construction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(construction.status, "resolved");
  const cancellation = preparePendingAdditionalGarmentCancellationCommit({
    garmentKey: pendingKey,
    fabricAllocationState: makeFabricState([
      makeAssignment("shirt"),
      makeAssignment("shirt", pendingKey),
      makeAssignment("shirt", siblingKey),
    ]),
    designSelections: {
      accessories: [],
      additionalGarmentConstructions: {
        schemaVersion: 1,
        byGarmentKey: {
          [pendingKey]: construction,
          [siblingKey]: construction,
        },
      },
      garmentScopedCustomDetails: {
        schemaVersion: 1,
        selectionsByGarmentKey: {
          [pendingKey]: { neck_design: "neck_no_round" },
          [siblingKey]: { neck_design: "neck_no_v" },
        },
        snapshotsByGarmentKey: {},
      },
      garmentScopedCustomDetailInputs: {
        schemaVersion: 1,
        textByGarmentKey: {
          [pendingKey]: {
            personalized_additional: {
              personalized_additional_evaluation: "pending text",
            },
          },
          [siblingKey]: {
            personalized_additional: {
              personalized_additional_evaluation: "survivor text",
            },
          },
        },
      },
    },
  });
  assert.equal(
    cancellation.fabricAllocationState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === pendingKey,
      ),
    ),
    false,
  );
  assert.equal(
    cancellation.fabricAllocationState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === siblingKey,
      ),
    ),
    true,
  );
  assert.equal(
    cancellation.designSelections.additionalGarmentConstructions?.byGarmentKey[
      pendingKey
    ],
    undefined,
  );
  assert.ok(
    cancellation.designSelections.additionalGarmentConstructions?.byGarmentKey[
      siblingKey
    ],
  );
  assert.equal(
    cancellation.designSelections.garmentScopedCustomDetails
      ?.selectionsByGarmentKey[pendingKey],
    undefined,
  );
  assert.equal(
    cancellation.designSelections.garmentScopedCustomDetailInputs
      ?.textByGarmentKey[pendingKey],
    undefined,
  );
  assert.ok(
    cancellation.designSelections.garmentScopedCustomDetailInputs
      ?.textByGarmentKey[siblingKey],
  );
}

// Summary/Payment retention is exact, repeatable, non-authorizing, and ephemeral.
{
  const summaryLease = createRemovalStageRetentionLease({
    result: prepared.result,
    originStage: "summary",
    removalGeneration: 4,
    sessionIdentityKey: "guest",
  });
  const paymentLease = createRemovalStageRetentionLease({
    result: prepared.result,
    originStage: "payment",
    removalGeneration: 5,
    sessionIdentityKey: "guest",
  });
  assert.ok(summaryLease);
  assert.ok(paymentLease);
  const isActive = (lease: typeof summaryLease, stage: "summary" | "payment", generation: number) =>
    isRemovalStageRetentionLeaseActive({
      lease,
      currentStageId: stage,
      liveAuthoritySignature: prepared.result.authoritySignature,
      removalGeneration: generation,
      sessionIdentityKey: "guest",
    });
  assert.equal(isActive(summaryLease, "summary", 4), true);
  assert.equal(isActive(summaryLease, "summary", 4), true);
  assert.equal(isActive(paymentLease, "payment", 5), true);
  assert.equal(
    createRemovalStageRetentionLease({
      result: prepared.result,
      originStage: "custom_details",
      removalGeneration: 6,
      sessionIdentityKey: "guest",
    }),
    null,
  );
  assert.equal(isActive(summaryLease, "payment", 4), false);
  assert.equal(
    isRemovalStageRetentionLeaseActive({
      lease: summaryLease,
      currentStageId: "summary",
      liveAuthoritySignature: `${prepared.result.authoritySignature}:changed`,
      removalGeneration: 4,
      sessionIdentityKey: "guest",
    }),
    false,
  );
  assert.equal(isActive(summaryLease, "summary", 5), false);
  assert.equal(
    isRemovalStageRetentionLeaseActive({
      lease: summaryLease,
      currentStageId: "summary",
      liveAuthoritySignature: prepared.result.authoritySignature,
      removalGeneration: 4,
      sessionIdentityKey: "authenticated:new-owner",
    }),
    false,
  );
  assert.equal(
    isRemovalStageRetentionLeaseActive({
      lease: null,
      currentStageId: "summary",
      liveAuthoritySignature: prepared.result.authoritySignature,
      removalGeneration: 4,
      sessionIdentityKey: "guest",
    }),
    false,
    "a remount/hydration starts without a lease",
  );
}

// React applies all canonical slices in one event without a mixed survivor render.
{
  const snapshots: string[] = [];
  let removalActions = 0;

  const Harness = () => {
    const [garments, setGarments] = useState(baseInput.garmentTypeSelection);
    const [source, setSource] = useState(baseInput.designSource);
    const [confirmed, setConfirmed] = useState(
      baseInput.confirmedDesignSourceKey,
    );
    const [uploadComposition, setUploadComposition] = useState(
      baseInput.uploadedCompositionMirror,
    );
    const [uploadAdditional, setUploadAdditional] = useState(
      baseInput.uploadedAdditionalGarmentTypes,
    );
    const [fabric, setFabric] = useState(baseInput.fabricAllocationState);
    const [details, setDetails] = useState(currentDesignSelections);
    const [measurement, setMeasurement] = useState(baseInput.measurementState);
    const [ai, setAi] = useState(baseInput.aiTryOnWorkflowState);
    const [shipping, setShipping] = useState(baseInput.shippingState);
    const [selectedFabricCode, setSelectedFabricCode] = useState<string | null>(
      "FAB-A",
    );
    const [priceFabricCode, setPriceFabricCode] = useState<string | null>(
      "FAB-A",
    );
    const garmentPresent = garments.garmentTypes.includes("skirt");
    const fabricPresent = fabric.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:skirt",
      ),
    );
    const detailsPresent = Boolean(
      details.garmentScopedCustomDetails?.selectionsByGarmentKey[
        "base:skirt"
      ],
    );
    snapshots.push(
      JSON.stringify({ garmentPresent, fabricPresent, detailsPresent }),
    );

    return createElement(
      "button",
      {
        type: "button",
        "data-remove-integration": "true",
        onClick: () => {
          removalActions += 1;
          const transaction = prepareFuturePhysicalGarmentRemovalTransaction({
            input: {
              ...baseInput,
              garmentTypeSelection: garments,
              designSource: source,
              confirmedDesignSourceKey: confirmed,
              uploadedCompositionMirror: uploadComposition,
              uploadedAdditionalGarmentTypes: uploadAdditional,
              fabricAllocationState: fabric,
              garmentScopedCustomDetails:
                details.garmentScopedCustomDetails ||
                baseInput.garmentScopedCustomDetails,
              garmentScopedCustomDetailInputs:
                details.garmentScopedCustomDetailInputs ||
                baseInput.garmentScopedCustomDetailInputs,
              measurementState: measurement,
              aiTryOnWorkflowState: ai,
              shippingState: shipping,
            },
            currentDesignSelections: details,
            currentPriceActivatedFabricCode: priceFabricCode,
          });
          if (transaction.status !== "removed") return;
          applyFuturePhysicalGarmentRemovalCommit(transaction.commit, {
            setGarmentTypeSelection: setGarments,
            setDesignSource: setSource,
            setConfirmedDesignSourceKey: setConfirmed,
            setUploadedCompositionMirror: setUploadComposition,
            setUploadedAdditionalGarmentTypes: setUploadAdditional,
            setFabricAllocationState: setFabric,
            setDesignSelections: setDetails,
            setMeasurementState: setMeasurement,
            setAiTryOnWorkflowState: setAi,
            setShippingState: setShipping,
            setSelectedFabricCode,
            setPriceActivatedFabricCode: setPriceFabricCode,
          });
        },
      },
      `${selectedFabricCode || "none"}:${priceFabricCode || "pending"}`,
    );
  };

  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(StrictMode, null, createElement(Harness)));
  });
  act(() => {
    renderer.root.findByProps({ "data-remove-integration": "true" }).props.onClick();
  });
  assert.equal(removalActions, 1, "StrictMode must not double-run the action");
  const uniqueSnapshots = [...new Set(snapshots)];
  assert.deepEqual(uniqueSnapshots, [
    JSON.stringify({
      garmentPresent: true,
      fabricPresent: true,
      detailsPresent: true,
    }),
    JSON.stringify({
      garmentPresent: false,
      fabricPresent: false,
      detailsPresent: false,
    }),
  ]);
  assert.equal(
    renderer.root.findByProps({ "data-remove-integration": "true" }).children.join(""),
    "FAB-A:FAB-A",
  );
}

// The existing upload generation coordinator rejects a late source write.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  let releaseValidation!: () => void;
  const validation = new Promise<void>((resolve) => {
    releaseValidation = resolve;
  });
  let successCalls = 0;
  let finishCalls = 0;
  const operation = runUploadedDesignOperation({
    coordinator,
    kind: "replacement",
    onBegin: () => undefined,
    validate: () => validation,
    execute: async () => "stale-upload-composition",
    onSuccess: () => {
      successCalls += 1;
    },
    onError: () => undefined,
    onFinish: () => {
      finishCalls += 1;
    },
  });
  coordinator.invalidate();
  releaseValidation();
  const operationResult = await operation;
  assert.equal(operationResult.status, "stale");
  assert.equal(successCalls, 0);
  assert.equal(finishCalls, 0);
}

// Ordinary Remove Fabric keeps its intentionally different primary behavior.
{
  const ordinary = FabricAllocationStateEngine.removeGarmentAssignments(
    makeFabricState([makeAssignment("shirt")]),
    ["base:shirt"],
  );
  assert.equal(ordinary.fabricAllocations.length, 1);
  assert.equal(ordinary.fabricAllocations[0]?.garmentAssignments.length, 0);
}

// Static integration checks are bounded and secondary to the behavior above.
{
  const studioSource = readFileSync(
    "src/components/DesignStudioView.tsx",
    "utf8",
  );
  const integrationSource = readFileSync(
    "src/utils/midProcessGarmentRemovalIntegration.ts",
    "utf8",
  );
  const prepareBody = integrationSource.slice(
    integrationSource.indexOf(
      "export const prepareFuturePhysicalGarmentRemovalTransaction",
    ),
    integrationSource.indexOf(
      "export interface FuturePhysicalGarmentRemovalCommitWriters",
    ),
  );
  assert.equal(
    (prepareBody.match(/removeFuturePhysicalGarmentOccurrence\(input\)/g) || [])
      .length,
    1,
    "the production preparation path calls Task 4A exactly once",
  );
  const coordinatorBody = studioSource.slice(
    studioSource.indexOf(
      "const handleRemoveFuturePhysicalGarmentOccurrence",
    ),
    studioSource.indexOf("const openFutureGarmentRemovalDialog"),
  );
  assert.equal(
    (
      coordinatorBody.match(
        /prepareFuturePhysicalGarmentRemovalTransaction\(/g,
      ) || []
    ).length,
    1,
  );
  assert.doesNotMatch(
    studioSource,
    /const handleRemoveFutureAdditionalGarment/,
    "committed additional garments no longer retain a direct cleanup handler",
  );
  assert.match(
    studioSource,
    /preparePendingAdditionalGarmentCancellationCommit\(/,
    "pending additional cancellation removes its provisional occurrence data",
  );
  assert.match(
    studioSource,
    /cloudFutureDraftSaveQueueRef\.current\s*=\s*cloudFutureDraftSaveQueueRef\.current\s*\.then/,
    "authenticated saves remain serialized so survivor state is last",
  );
  assert.match(
    studioSource,
    /isFuturePaymentReviewUnlocked\s*=\s*isFuturePaymentReviewStageUnlocked\(\s*futureOrderCandidateResult/,
    "payment eligibility remains candidate-derived",
  );
  assert.doesNotMatch(
    studioSource,
    /onAddToCart\s*\(/,
    "the retained Payment screen cannot submit or convert a CartItem",
  );
  assert.doesNotMatch(
    studioSource.slice(
      studioSource.indexOf("const isFutureSummaryStageUnlocked"),
      studioSource.indexOf("const showPersistentLiveOrderSummary"),
    ),
    /RemovalStageRetentionLease|shouldRetainCurrentStageAfterGarmentRemoval/,
    "the presentation lease must not enter readiness or payment calculations",
  );
  assert.match(
    studioSource,
    /handleRemoveFuturePhysicalGarmentOccurrence\(\{[\s\S]*expectedAuthoritySignature:\s*request\.expectedAuthoritySignature/,
    "Task 4C delegates the frozen confirmation to the Task 4B coordinator",
  );
  const summarySource = readFileSync(
    "src/components/DormantFutureSummaryStep.tsx",
    "utf8",
  );
  const paymentSource = readFileSync(
    "src/components/DormantFuturePaymentReviewStep.tsx",
    "utf8",
  );
  assert.match(summarySource, /onRequestGarmentRemoval/);
  assert.match(paymentSource, /onRequestGarmentRemoval/);
}

console.log("Mid-process garment removal integration tests passed");
