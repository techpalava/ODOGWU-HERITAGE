import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  AdditionalGarmentConstructionStateV1,
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  DesignSource,
  Fabric,
  FabricAllocationState,
  FabricGarmentAssignment,
  FabricGarmentType,
  FutureMeasurementEnteredBagV1,
  FutureMeasurementStateV1,
  FutureShippingStateV1,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { createEmptyAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import {
  createCatalogueAdditionalGarmentSelection,
} from "./src/utils/additionalGarmentDomain";
import { inspectCustomDetailCatalog, normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  resolveAuthoritativePhysicalOrder,
} from "./src/utils/designSourceState";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
} from "./src/utils/measurementBlueprint";
import {
  removeFuturePhysicalGarmentOccurrence,
  resolveFuturePhysicalGarmentRemovalAuthority,
  type RemoveFuturePhysicalGarmentOccurrenceInput,
} from "./src/utils/midProcessGarmentRemoval";
import {
  getPhysicalGarmentOccurrenceGeneration,
  reconcilePhysicalGarmentOccurrenceIdentityState,
} from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  getUploadedDesignAdditionalGarmentTypes,
  mergeUploadedDesignCompositionWithStep1,
} from "./src/utils/uploadedDesignStep1";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const catalogInspection = inspectCustomDetailCatalog(
  SEED_CUSTOM_DETAIL_CATALOG,
);
const fabrics: Fabric[] = [
  {
    code: "FAB-A",
    name: "Fabric A",
    description: "Green test Fabric",
    color: "Green",
    colorHex: "#0A4A33",
    priceMultiplier: 1,
    price: 20,
    stockStatus: "IN_STOCK",
  },
  {
    code: "FAB-B",
    name: "Fabric B",
    description: "Gold test Fabric",
    color: "Gold",
    colorHex: "#B99132",
    priceMultiplier: 1,
    price: 25,
    stockStatus: "IN_STOCK",
  },
];
const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 7.5,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const makeSelection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: "male" | "female" | "unisex" = "female",
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: [demographic],
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

const makeAllocationState = (
  allocations: FabricAllocationState["fabricAllocations"],
  pendingFabricGarment: FabricGarmentAssignment | null = null,
): FabricAllocationState => ({
  fabricAllocations: allocations,
  activeAllocationId: allocations[0]?.allocationId || null,
  pendingFabricGarment,
  awaitingFabricForPendingGarment: pendingFabricGarment !== null,
});

const makeStyle = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): StyleCategory => ({
  id: "style-removal-test",
  name: "Removal Test Style",
  description: "A style with reference garments that never create membership.",
  gender: "female",
  targetDemographic: "female",
  options: [],
  fabricCapacityComposition: garmentTypes.map((garmentType) => ({
    ...createStyleBaseGarmentSpec(garmentType),
    key: `style-reference:${garmentType}`,
  })),
});

const measurementValue = (valueCm: number) => ({
  valueCm,
  provenance: "customer_entered" as const,
});

const makeEnteredBag = (
  targetGarmentKey: string,
  survivorGarmentKey: string,
): FutureMeasurementEnteredBagV1 => ({
  shared: { total_height: measurementValue(172) },
  byGarmentKey: {
    [targetGarmentKey]: {
      waist_circumference: measurementValue(90),
    },
    [survivorGarmentKey]: {
      chest_bust_circumference: measurementValue(96),
    },
  },
});

const makeMeasurementState = (
  targetGarmentKey: string,
  survivorGarmentKey: string,
): FutureMeasurementStateV1 => {
  const empty = createEmptyFutureMeasurementState("low_risk", "cm");
  const enteredByRoute = {
    low_risk: makeEnteredBag(targetGarmentKey, survivorGarmentKey),
    medium_risk: makeEnteredBag(targetGarmentKey, survivorGarmentKey),
    high_risk: makeEnteredBag(targetGarmentKey, survivorGarmentKey),
  };
  return {
    ...empty,
    entered: makeEnteredBag(targetGarmentKey, survivorGarmentKey),
    enteredByRoute,
    unassignedEntered: makeEnteredBag(targetGarmentKey, survivorGarmentKey),
    derived: {
      shared: {},
      byGarmentKey: {
        [targetGarmentKey]: {
          waist_circumference: {
            valueCm: 88,
            provenance: "calculated_average_factor",
            calculation: {
              route: "low_risk",
              profileId: "A",
              garmentKey: targetGarmentKey,
              measurementId: "waist_circumference",
              averageFactor: 0.5,
            },
          },
        },
        [survivorGarmentKey]: {
          chest_bust_circumference: measurementValue(96),
        },
      },
    },
    diagnostics: [
      {
        code: "required_measurement_missing",
        garmentKey: targetGarmentKey,
        garmentType: "bum_shorts",
      },
      {
        code: "measurement_range_recheck",
        garmentKey: survivorGarmentKey,
        garmentType: "shirt",
      },
    ],
    invalidInputKeys: [
      `low_risk:${targetGarmentKey}:A:waist_circumference`,
      `low_risk:${survivorGarmentKey}:A:chest_bust_circumference`,
    ],
    invalidInputKeysByRoute: {
      low_risk: [
        `low_risk:${targetGarmentKey}:A:waist_circumference`,
      ],
      medium_risk: [
        `medium_risk:${targetGarmentKey}:A:waist_circumference`,
      ],
      high_risk: [
        `high_risk:${targetGarmentKey}:A:waist_circumference`,
      ],
    },
  };
};

const makeShippingState = (garmentCount: number): FutureShippingStateV1 => {
  const state: FutureShippingStateV1 = {
    ...createEmptyFutureShippingState(),
    fulfilmentMethod: "destination_delivery",
    destinationSelectionMode: "supported_country",
    customerInformation: {
      fullName: "Ada Customer",
      phone: "+31 600000000",
      email: "ada@example.com",
      deliveryAddress: {
        addressLine1: "1 Heritage Way",
        city: "Amsterdam",
        postalCode: "1000 AA",
        countryCode: "NL",
      },
      comment: "Keep this customer note.",
    },
  };
  return reconcileFutureShippingState({
    state,
    garmentCount,
    selectedDesignPrice: 200,
  }).state;
};

const makeScopedDetails = (
  targetGarmentKey: string,
  survivorGarmentKey: string,
): GarmentScopedCustomDetailsStateV1 => ({
  schemaVersion: 1,
  selectionsByGarmentKey: {
    [targetGarmentKey]: { neck_design: "neck_no_round" },
    [survivorGarmentKey]: { neck_design: "neck_no_v" },
  },
  snapshotsByGarmentKey: {
    [targetGarmentKey]: {
      neck_design: [
        {
          garmentKey: targetGarmentKey,
          optionId: "neck_no_round",
          label: "No Collar, Round Neck",
          description: "Target snapshot",
          garmentGroup: "neck",
          selectionGroup: "neck_design",
          priceCents: 0,
        },
      ],
    },
    [survivorGarmentKey]: {
      neck_design: [
        {
          garmentKey: survivorGarmentKey,
          optionId: "neck_no_v",
          label: "No Collar, V-Shaped Neck",
          description: "Survivor snapshot",
          garmentGroup: "neck",
          selectionGroup: "neck_design",
          priceCents: 0,
        },
      ],
    },
  },
});

const makeScopedInputs = (
  targetGarmentKey: string,
  survivorGarmentKey: string,
): GarmentScopedCustomDetailInputsV1 => ({
  schemaVersion: 1,
  textByGarmentKey: {
    [targetGarmentKey]: {
      personalized_additional: {
        personalized_additional_evaluation: "Remove this text",
      },
    },
    [survivorGarmentKey]: {
      personalized_additional: {
        personalized_additional_evaluation: "Keep this text",
      },
    },
  },
});

const completedAiState: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "completed",
  inputFingerprint: "tryon-v1-old-input",
  resultReference: {
    kind: "verified_private_try_on_result",
    assetId: "asset-old-result",
    ownerBindingId: "owner-old-result",
  },
};

const defaultPendingOperations = () => ({
  protectedSourceMutationPending: false,
  pickerGarmentKey: null,
  additionalFabricTransactionGarmentKey: null,
  uploadOperationGeneration: null,
});

type RemovalInputWithoutSignature = Omit<
  RemoveFuturePhysicalGarmentOccurrenceInput,
  "expectedAuthoritySignature"
>;

const authorizeRemoval = (
  input: RemovalInputWithoutSignature,
): RemoveFuturePhysicalGarmentOccurrenceInput => {
  const authority = resolveFuturePhysicalGarmentRemovalAuthority(input);
  assert.equal(authority.status, "resolved");
  if (authority.status !== "resolved") {
    throw new Error("Expected a resolved removal authority.");
  }
  return { ...input, expectedAuthoritySignature: authority.signature };
};

const makeBaseInput = ({
  garmentTypes,
  targetGarmentKey,
  fabricAllocationState,
  designSource,
  selectedStyle = null,
  additionalGarmentConstructionState =
    createEmptyAdditionalGarmentConstructionState(),
  uploadedCompositionMirror = [],
  uploadedAdditionalGarmentTypes = [],
  aiTryOnWorkflowState = completedAiState,
}: {
  garmentTypes: GarmentTypeStepSelection["garmentTypes"];
  targetGarmentKey: string;
  fabricAllocationState: FabricAllocationState;
  designSource: DesignSource;
  selectedStyle?: StyleCategory | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1;
  uploadedCompositionMirror?: ReturnType<typeof createStyleBaseGarmentSpec>[];
  uploadedAdditionalGarmentTypes?: FabricGarmentType[];
  aiTryOnWorkflowState?: AiTryOnWorkflowStateV1;
}): RemovalInputWithoutSignature => {
  const garmentTypeSelection = makeSelection(garmentTypes);
  const survivorGarmentKey =
    garmentTypes
      .map((garmentType) => createStyleBaseGarmentSpec(garmentType).key)
      .find((garmentKey) => garmentKey !== targetGarmentKey) ||
    Object.keys(additionalGarmentConstructionState.byGarmentKey).find(
      (garmentKey) => garmentKey !== targetGarmentKey,
    ) ||
    targetGarmentKey;
  const garmentScopedCustomDetails = makeScopedDetails(
    targetGarmentKey,
    survivorGarmentKey,
  );
  const garmentScopedCustomDetailInputs = makeScopedInputs(
    targetGarmentKey,
    survivorGarmentKey,
  );
  return {
    targetGarmentKey,
    garmentTypeSelection,
    designSource,
    selectedStyle,
    confirmedDesignSourceKey: designSource.sourceKey,
    uploadedCompositionMirror,
    uploadedAdditionalGarmentTypes,
    additionalGarmentConstructionState,
    fabricAllocationState,
    garmentScopedCustomDetails,
    garmentScopedCustomDetailInputs,
    measurementState: makeMeasurementState(
      targetGarmentKey,
      survivorGarmentKey,
    ),
    aiTryOnWorkflowState,
    shippingState: makeShippingState(
      garmentTypes.length +
        Object.keys(additionalGarmentConstructionState.byGarmentKey).length,
    ),
    normalizedCustomDetailCatalog: catalog,
    aiTryOnPolicy: { gatewayAvailable: false, skipAllowed: true },
    pendingOperations: defaultPendingOperations(),
  };
};

const constructionTotal = (
  selection: GarmentTypeStepSelection,
  garmentType: GarmentTypeStepSelection["garmentTypes"][number],
): number | null => {
  const resolution = selection.constructionByGarment[garmentType];
  return resolution?.status === "resolved" ? resolution.totalPriceCents : null;
};

const assertTargetRemovedFromMeasurements = (
  state: FutureMeasurementStateV1,
  targetGarmentKey: string,
) => {
  assert.equal(state.entered.byGarmentKey[targetGarmentKey], undefined);
  assert.equal(state.derived.byGarmentKey[targetGarmentKey], undefined);
  assert.equal(
    state.unassignedEntered?.byGarmentKey[targetGarmentKey],
    undefined,
  );
  for (const route of ["low_risk", "medium_risk", "high_risk"] as const) {
    assert.equal(
      state.enteredByRoute?.[route].byGarmentKey[targetGarmentKey],
      undefined,
    );
    assert.equal(
      state.invalidInputKeysByRoute?.[route].some((key) =>
        key.startsWith(`${route}:${targetGarmentKey}:`),
      ),
      false,
    );
  }
  assert.equal(
    state.diagnostics.some(
      (diagnostic) => diagnostic.garmentKey === targetGarmentKey,
    ),
    false,
  );
  assert.equal(
    state.invalidInputKeys.some((key) => key.includes(targetGarmentKey)),
    false,
  );
  assert.equal(state.entered.shared.total_height?.valueCm, 172);
};

// Base Shirt + Bum Shorts + Skirt: exact removal and complete dependent cleanup.
const baseStyle = makeStyle(["shirt", "bum_shorts", "skirt", "trouser"]);
const baseSource = createCatalogDesignSource(baseStyle.id)!;
const sharedAllocation: FabricAllocationState["fabricAllocations"][number] = {
  allocationId: "allocation-shared",
  fabricCode: "FAB-A",
  garmentAssignments: [
    makeAssignment("shirt"),
    makeAssignment("bum_shorts"),
  ],
};
const skirtAllocation: FabricAllocationState["fabricAllocations"][number] = {
  allocationId: "allocation-skirt",
  fabricCode: "FAB-B",
  garmentAssignments: [makeAssignment("skirt")],
};
const baseInput = authorizeRemoval(
  makeBaseInput({
    garmentTypes: ["shirt", "bum_shorts", "skirt"],
    targetGarmentKey: "base:bum_shorts",
    fabricAllocationState: makeAllocationState([
      sharedAllocation,
      skirtAllocation,
    ]),
    designSource: baseSource,
    selectedStyle: baseStyle,
  }),
);
const shirtPriceBefore = constructionTotal(
  baseInput.garmentTypeSelection,
  "shirt",
);
const skirtPriceBefore = constructionTotal(
  baseInput.garmentTypeSelection,
  "skirt",
);
const baseAuthorityBeforeRemoval =
  resolveFuturePhysicalGarmentRemovalAuthority(baseInput);
assert.equal(baseAuthorityBeforeRemoval.status, "resolved");
const removedBaseGeneration =
  baseAuthorityBeforeRemoval.status === "resolved"
    ? baseAuthorityBeforeRemoval.physicalOccurrences.find(
        (occurrence) => occurrence.garmentKey === "base:bum_shorts",
      )?.occurrenceGeneration
    : null;
const survivingBaseShirtGeneration =
  baseAuthorityBeforeRemoval.status === "resolved"
    ? baseAuthorityBeforeRemoval.physicalOccurrences.find(
        (occurrence) => occurrence.garmentKey === "base:shirt",
      )?.occurrenceGeneration
    : null;
assert.ok(removedBaseGeneration);
assert.ok(survivingBaseShirtGeneration);
const baseResult = removeFuturePhysicalGarmentOccurrence(baseInput);
assert.equal(baseResult.status, "removed");
if (baseResult.status !== "removed") throw new Error("Base removal failed.");
assert.deepEqual(baseResult.state.garmentTypeSelection.garmentTypes, [
  "shirt",
  "skirt",
]);
assert.deepEqual(
  baseResult.survivorOccurrences.map((occurrence) => occurrence.garmentKey),
  ["base:shirt", "base:skirt"],
);
assert.equal(
  baseResult.survivorOccurrences.some(
    (occurrence) => occurrence.garmentType === "trouser",
  ),
  false,
  "style-reference-only Trouser must remain nonphysical",
);
assert.equal(
  constructionTotal(baseResult.state.garmentTypeSelection, "shirt"),
  shirtPriceBefore,
);
assert.equal(
  constructionTotal(baseResult.state.garmentTypeSelection, "skirt"),
  skirtPriceBefore,
);
assert.equal(
  baseResult.state.garmentTypeSelection.constructionByGarment.bum_shorts,
  undefined,
);
assert.deepEqual(
  baseResult.state.fabricAllocationState.fabricAllocations.map(
    (allocation) => ({
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    }),
  ),
  [
    {
      allocationId: "allocation-shared",
      fabricCode: "FAB-A",
      garmentKeys: ["base:shirt"],
    },
    {
      allocationId: "allocation-skirt",
      fabricCode: "FAB-B",
      garmentKeys: ["base:skirt"],
    },
  ],
);
assert.equal(
  baseResult.state.garmentScopedCustomDetails.selectionsByGarmentKey[
    "base:bum_shorts"
  ],
  undefined,
);
assert.equal(
  baseResult.state.garmentScopedCustomDetails.snapshotsByGarmentKey[
    "base:bum_shorts"
  ],
  undefined,
);
assert.ok(
  baseResult.state.garmentScopedCustomDetails.selectionsByGarmentKey[
    "base:shirt"
  ],
);
assert.equal(
  baseResult.state.garmentScopedCustomDetailInputs.textByGarmentKey[
    "base:bum_shorts"
  ],
  undefined,
);
assert.equal(
  baseResult.state.garmentScopedCustomDetailInputs.textByGarmentKey[
    "base:shirt"
  ]?.personalized_additional?.personalized_additional_evaluation,
  "Keep this text",
);
assertTargetRemovedFromMeasurements(
  baseResult.state.measurementState,
  "base:bum_shorts",
);
assert.equal(baseResult.state.aiTryOnWorkflowState.status, "stale");
assert.equal(baseResult.state.shippingState.quoteReference, null);
assert.deepEqual(
  baseResult.state.shippingState.customerInformation,
  baseInput.shippingState.customerInformation,
);
const baseIdentityAfterRemoval =
  baseResult.state.garmentTypeSelection.physicalOccurrenceIdentityState;
assert.ok(baseIdentityAfterRemoval);
assert.equal(
  getPhysicalGarmentOccurrenceGeneration(
    baseIdentityAfterRemoval,
    "base:bum_shorts",
  ),
  null,
);
assert.equal(
  getPhysicalGarmentOccurrenceGeneration(
    baseIdentityAfterRemoval,
    "base:shirt",
  ),
  survivingBaseShirtGeneration,
);
const readdedBaseIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: baseIdentityAfterRemoval,
  activeGarmentKeys: [
    ...baseResult.survivorOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
    "base:bum_shorts",
  ],
});
assert.ok(
  getPhysicalGarmentOccurrenceGeneration(
    readdedBaseIdentity,
    "base:bum_shorts",
  )! > removedBaseGeneration!,
);

const processingRemovalResult = removeFuturePhysicalGarmentOccurrence({
  ...baseInput,
  aiTryOnWorkflowState: {
    schemaVersion: 1,
    status: "processing",
    inputFingerprint: "tryon-v1-processing-input",
    jobReference: {
      kind: "resumable_job",
      jobId: "job-processing-removal",
    },
  },
  pendingOperations: {
    protectedSourceMutationPending: false,
    pickerGarmentKey: "base:bum_shorts",
    additionalFabricTransactionGarmentKey: "base:bum_shorts",
    uploadOperationGeneration: null,
  },
});
assert.equal(processingRemovalResult.status, "removed");
if (processingRemovalResult.status !== "removed") {
  throw new Error("Processing AI removal reconciliation failed.");
}
assert.equal(
  processingRemovalResult.state.aiTryOnWorkflowState.status,
  "stale",
);
assert.equal(
  processingRemovalResult.state.aiTryOnWorkflowState.jobReference,
  undefined,
);
assert.equal(
  processingRemovalResult.invalidations.pickerGarmentKey,
  "base:bum_shorts",
);
assert.equal(
  processingRemovalResult.invalidations
    .additionalFabricTransactionGarmentKey,
  "base:bum_shorts",
);

// Final-owner primary allocation is pruned and the next allocation is selected.
const finalOwnerInput = authorizeRemoval(
  makeBaseInput({
    garmentTypes: ["shirt", "skirt"],
    targetGarmentKey: "base:shirt",
    fabricAllocationState: makeAllocationState([
      {
        allocationId: "allocation-primary-shirt",
        fabricCode: "FAB-A",
        garmentAssignments: [makeAssignment("shirt")],
      },
      {
        allocationId: "allocation-survivor-skirt",
        fabricCode: "FAB-B",
        garmentAssignments: [makeAssignment("skirt")],
      },
    ]),
    designSource: baseSource,
    selectedStyle: baseStyle,
    aiTryOnWorkflowState: {
      schemaVersion: 1,
      status: "skipped",
      inputFingerprint: null,
    },
  }),
);
const finalOwnerResult = removeFuturePhysicalGarmentOccurrence(
  finalOwnerInput,
);
assert.equal(finalOwnerResult.status, "removed");
if (finalOwnerResult.status !== "removed") {
  throw new Error("Final-owner allocation removal failed.");
}
assert.deepEqual(
  finalOwnerResult.state.fabricAllocationState.fabricAllocations.map(
    (allocation) => allocation.allocationId,
  ),
  ["allocation-survivor-skirt"],
);
assert.equal(
  finalOwnerResult.state.fabricAllocationState.activeAllocationId,
  "allocation-survivor-skirt",
);
assert.equal(finalOwnerResult.state.aiTryOnWorkflowState.status, "skipped");

// Uploaded Step-1 overlap is removed from source, Step 1, and both local mirrors.
const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "task-4a-owner",
  designReferenceId: "task-4a-upload",
  mimeType: "image/png",
  createdAt: "2026-09-02T00:00:00.000Z",
});
const uploadedOverlapStep1 = makeSelection(["shirt", "skirt"]);
const uploadedOverlapComposition = mergeUploadedDesignCompositionWithStep1({
  step1GarmentTypes: uploadedOverlapStep1.garmentTypes,
  additionalGarmentTypes: ["trouser"],
});
const uploadedSource = createUploadedDesignSource({
  uploadReference,
  fabricCapacityComposition: uploadedOverlapComposition,
  demographic: "female",
  displayLabel: "Task 4A uploaded design",
});
const uploadedFabricState = makeAllocationState([
  {
    allocationId: "upload-allocation-1",
    fabricCode: "FAB-A",
    garmentAssignments: [makeAssignment("shirt"), makeAssignment("skirt")],
  },
  {
    allocationId: "upload-allocation-2",
    fabricCode: "FAB-B",
    garmentAssignments: [makeAssignment("trouser")],
  },
]);
const uploadedOverlapInput = authorizeRemoval({
  ...makeBaseInput({
    garmentTypes: ["shirt", "skirt"],
    targetGarmentKey: "base:shirt",
    fabricAllocationState: uploadedFabricState,
    designSource: uploadedSource,
    uploadedCompositionMirror: uploadedOverlapComposition,
    uploadedAdditionalGarmentTypes: ["trouser"],
  }),
  garmentTypeSelection: uploadedOverlapStep1,
});
const uploadedOverlapResult = removeFuturePhysicalGarmentOccurrence(
  uploadedOverlapInput,
);
assert.equal(uploadedOverlapResult.status, "removed");
if (uploadedOverlapResult.status !== "removed") {
  throw new Error("Uploaded overlap removal failed.");
}
assert.deepEqual(
  uploadedOverlapResult.state.garmentTypeSelection.garmentTypes,
  ["skirt"],
);
assert.equal(uploadedOverlapResult.state.designSource?.kind, "uploaded");
if (uploadedOverlapResult.state.designSource?.kind !== "uploaded") {
  throw new Error("Uploaded source identity was lost.");
}
assert.deepEqual(
  uploadedOverlapResult.state.designSource.fabricCapacityComposition.map(
    (spec) => spec.garmentType,
  ),
  ["trouser", "skirt"],
);
assert.deepEqual(
  uploadedOverlapResult.state.uploadedCompositionMirror.map(
    (spec) => spec.garmentType,
  ),
  ["trouser", "skirt"],
);
assert.deepEqual(
  uploadedOverlapResult.state.uploadedAdditionalGarmentTypes,
  ["trouser"],
);
assert.equal(
  uploadedOverlapResult.state.designSource.sourceKey,
  uploadedSource.sourceKey,
);
assert.deepEqual(
  uploadedOverlapResult.state.designSource.uploadReference,
  uploadedSource.uploadReference,
);
assert.equal(
  uploadedOverlapResult.state.designSource.demographic,
  uploadedSource.demographic,
);
assert.equal(
  uploadedOverlapResult.state.confirmedDesignSourceKey,
  uploadedSource.sourceKey,
);

// Upload-only occurrence is removed by exact key without changing Step 1.
const uploadOnlyInput = authorizeRemoval({
  ...makeBaseInput({
    garmentTypes: ["shirt", "skirt"],
    targetGarmentKey: "base:trouser",
    fabricAllocationState: uploadedFabricState,
    designSource: uploadedSource,
    uploadedCompositionMirror: uploadedOverlapComposition,
    uploadedAdditionalGarmentTypes: ["trouser"],
  }),
  garmentTypeSelection: uploadedOverlapStep1,
});
const uploadOnlyAuthorityBeforeRemoval =
  resolveFuturePhysicalGarmentRemovalAuthority(uploadOnlyInput);
assert.equal(uploadOnlyAuthorityBeforeRemoval.status, "resolved");
const removedUploadOnlyGeneration =
  uploadOnlyAuthorityBeforeRemoval.status === "resolved"
    ? uploadOnlyAuthorityBeforeRemoval.physicalOccurrences.find(
        (occurrence) => occurrence.garmentKey === "base:trouser",
      )?.occurrenceGeneration
    : null;
assert.ok(removedUploadOnlyGeneration);
const uploadOnlyResult = removeFuturePhysicalGarmentOccurrence(uploadOnlyInput);
assert.equal(uploadOnlyResult.status, "removed");
if (uploadOnlyResult.status !== "removed") {
  throw new Error("Upload-only removal failed.");
}
assert.deepEqual(
  uploadOnlyResult.state.garmentTypeSelection.garmentTypes,
  ["shirt", "skirt"],
);
assert.deepEqual(
  uploadOnlyResult.survivorOccurrences.map(
    (occurrence) => occurrence.garmentKey,
  ),
  ["base:shirt", "base:skirt"],
);
assert.deepEqual(uploadOnlyResult.state.uploadedAdditionalGarmentTypes, []);
assert.equal(uploadOnlyResult.state.designSource?.sourceKey, uploadedSource.sourceKey);
assert.deepEqual(
  uploadOnlyResult.state.designSource?.kind === "uploaded"
    ? uploadOnlyResult.state.designSource.uploadReference
    : null,
  uploadedSource.uploadReference,
);
const uploadIdentityAfterRemoval =
  uploadOnlyResult.state.garmentTypeSelection
    .physicalOccurrenceIdentityState;
assert.ok(uploadIdentityAfterRemoval);
assert.equal(
  getPhysicalGarmentOccurrenceGeneration(
    uploadIdentityAfterRemoval,
    "base:trouser",
  ),
  null,
);
const readdedUploadIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: uploadIdentityAfterRemoval,
  activeGarmentKeys: [
    ...uploadOnlyResult.survivorOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
    "base:trouser",
  ],
});
assert.ok(
  getPhysicalGarmentOccurrenceGeneration(
    readdedUploadIdentity,
    "base:trouser",
  )! > removedUploadOnlyGeneration!,
);
const uploadGenerationResult = removeFuturePhysicalGarmentOccurrence({
  ...uploadOnlyInput,
  pendingOperations: {
    ...uploadOnlyInput.pendingOperations,
    uploadOperationGeneration: 17,
  },
});
assert.equal(uploadGenerationResult.status, "removed");
if (uploadGenerationResult.status !== "removed") {
  throw new Error("Uploaded generation invalidation failed.");
}
assert.equal(
  uploadGenerationResult.invalidations.invalidateUploadOperationGeneration,
  true,
);
assert.equal(
  uploadGenerationResult.invalidations.uploadOperationGeneration,
  17,
);

// Repeated additions retain sibling identity. The compatibility key may be reused,
// but its persisted internal generation must advance.
const additionalOneKey = "additional:shirt:1";
const additionalTwoKey = "additional:shirt:2";
const additionalOneConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalog,
);
const additionalTwoConstruction = resolveGarmentConstructionPricing(
  "shirt",
  catalog,
);
assert.equal(additionalOneConstruction.status, "resolved");
assert.equal(additionalTwoConstruction.status, "resolved");
const repeatedAdditionalConstructions: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: {
    [additionalOneKey]: additionalOneConstruction,
    [additionalTwoKey]: additionalTwoConstruction,
  },
};
const additionalOneAssignment = makeAssignment("shirt", additionalOneKey, {
  sourceRole: "additional",
  mainGarmentKey: "base:shirt",
  mainGarmentType: "shirt",
  eligibilityRule: "catalog_all",
  dependencyStatus: "valid",
});
const additionalTwoAssignment = makeAssignment("shirt", additionalTwoKey, {
  sourceRole: "additional",
  mainGarmentKey: "base:shirt",
  mainGarmentType: "shirt",
  eligibilityRule: "catalog_all",
  dependencyStatus: "valid",
});
const repeatedInput = authorizeRemoval(
  makeBaseInput({
    garmentTypes: ["shirt", "skirt"],
    targetGarmentKey: additionalTwoKey,
    fabricAllocationState: makeAllocationState([
      {
        allocationId: "base-and-additional-one",
        fabricCode: "FAB-A",
        garmentAssignments: [makeAssignment("shirt"), additionalOneAssignment],
      },
      {
        allocationId: "skirt-and-additional-two",
        fabricCode: "FAB-B",
        garmentAssignments: [makeAssignment("skirt"), additionalTwoAssignment],
      },
    ]),
    designSource: baseSource,
    selectedStyle: baseStyle,
    additionalGarmentConstructionState: repeatedAdditionalConstructions,
    aiTryOnWorkflowState: {
      schemaVersion: 1,
      status: "skipped",
      inputFingerprint: null,
    },
  }),
);
const repeatedAuthorityBeforeRemoval =
  resolveFuturePhysicalGarmentRemovalAuthority(repeatedInput);
assert.equal(repeatedAuthorityBeforeRemoval.status, "resolved");
const removedAdditionalGeneration =
  repeatedAuthorityBeforeRemoval.status === "resolved"
    ? repeatedAuthorityBeforeRemoval.physicalOccurrences.find(
        (occurrence) => occurrence.garmentKey === additionalTwoKey,
      )?.occurrenceGeneration
    : null;
assert.ok(removedAdditionalGeneration);
const repeatedResult = removeFuturePhysicalGarmentOccurrence(repeatedInput);
assert.equal(repeatedResult.status, "removed");
if (repeatedResult.status !== "removed") {
  throw new Error("Repeated additional removal failed.");
}
assert.ok(
  repeatedResult.state.additionalGarmentConstructionState.byGarmentKey[
    additionalOneKey
  ],
);
assert.equal(
  repeatedResult.state.additionalGarmentConstructionState.byGarmentKey[
    additionalTwoKey
  ],
  undefined,
);
assert.deepEqual(
  repeatedResult.survivorOccurrences.map(
    (occurrence) => occurrence.garmentKey,
  ),
  ["base:shirt", "base:skirt", additionalOneKey],
);
const reusedSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: repeatedResult.survivorOccurrences,
  authorizedOccurrenceKeys: repeatedResult.survivorOccurrences.map(
    (occurrence) => occurrence.garmentKey,
  ),
});
assert.equal(reusedSelection.status, "resolved");
if (reusedSelection.status !== "resolved") {
  throw new Error("Expected the highest removed key to be reusable.");
}
assert.equal(reusedSelection.selection.garmentSpec?.key, additionalTwoKey);
const persistedIdentityAfterRemoval =
  repeatedResult.state.garmentTypeSelection.physicalOccurrenceIdentityState;
assert.ok(persistedIdentityAfterRemoval);
assert.equal(
  getPhysicalGarmentOccurrenceGeneration(
    persistedIdentityAfterRemoval,
    additionalTwoKey,
  ),
  null,
);
const readdedIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: persistedIdentityAfterRemoval,
  activeGarmentKeys: [
    ...repeatedResult.survivorOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
    additionalTwoKey,
  ],
});
assert.ok(
  getPhysicalGarmentOccurrenceGeneration(readdedIdentity, additionalTwoKey)! >
    removedAdditionalGeneration!,
);
assert.equal(
  getPhysicalGarmentOccurrenceGeneration(readdedIdentity, additionalOneKey),
  repeatedResult.survivorOccurrences.find(
    (occurrence) => occurrence.garmentKey === additionalOneKey,
  )?.occurrenceGeneration,
);
const staleReaddedRemoval = removeFuturePhysicalGarmentOccurrence({
  ...repeatedInput,
  expectedAuthoritySignature: repeatedInput.expectedAuthoritySignature,
  garmentTypeSelection: {
    ...repeatedResult.state.garmentTypeSelection,
    physicalOccurrenceIdentityState: readdedIdentity,
  },
  additionalGarmentConstructionState: {
    ...repeatedResult.state.additionalGarmentConstructionState,
    byGarmentKey: {
      ...repeatedResult.state.additionalGarmentConstructionState.byGarmentKey,
      [additionalTwoKey]: additionalTwoConstruction,
    },
  },
  fabricAllocationState: repeatedResult.state.fabricAllocationState,
  garmentScopedCustomDetails:
    repeatedResult.state.garmentScopedCustomDetails,
  garmentScopedCustomDetailInputs:
    repeatedResult.state.garmentScopedCustomDetailInputs,
  measurementState: repeatedResult.state.measurementState,
  aiTryOnWorkflowState: repeatedResult.state.aiTryOnWorkflowState,
  shippingState: repeatedResult.state.shippingState,
});
assert.equal(staleReaddedRemoval.status, "stale_authority");
assert.strictEqual(
  staleReaddedRemoval.state.garmentTypeSelection
    .physicalOccurrenceIdentityState,
  readdedIdentity,
);
assert.equal(
  repeatedResult.state.fabricAllocationState.fabricAllocations.some(
    (allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === additionalTwoKey,
      ),
  ),
  false,
);
assert.equal(
  repeatedResult.state.garmentScopedCustomDetails.selectionsByGarmentKey[
    additionalTwoKey
  ],
  undefined,
);
assert.equal(
  repeatedResult.state.garmentScopedCustomDetailInputs.textByGarmentKey[
    additionalTwoKey
  ],
  undefined,
);
assertTargetRemovedFromMeasurements(
  repeatedResult.state.measurementState,
  additionalTwoKey,
);
assert.equal(repeatedResult.state.shippingState.quoteReference, null);

// Stale, last-garment, protected-operation, and parent-dependency failures are atomic.
const staleInput: RemoveFuturePhysicalGarmentOccurrenceInput = {
  ...baseInput,
  expectedAuthoritySignature: `${baseInput.expectedAuthoritySignature}:stale`,
};
const staleBefore = structuredClone(staleInput);
const staleResult = removeFuturePhysicalGarmentOccurrence(staleInput);
assert.equal(staleResult.status, "stale_authority");
assert.deepEqual(staleResult.state, {
  garmentTypeSelection: staleBefore.garmentTypeSelection,
  designSource: staleBefore.designSource,
  confirmedDesignSourceKey: staleBefore.confirmedDesignSourceKey,
  uploadedCompositionMirror: staleBefore.uploadedCompositionMirror,
  uploadedAdditionalGarmentTypes: staleBefore.uploadedAdditionalGarmentTypes,
  additionalGarmentConstructionState:
    staleBefore.additionalGarmentConstructionState,
  fabricAllocationState: staleBefore.fabricAllocationState,
  garmentScopedCustomDetails: staleBefore.garmentScopedCustomDetails,
  garmentScopedCustomDetailInputs:
    staleBefore.garmentScopedCustomDetailInputs,
  measurementState: staleBefore.measurementState,
  aiTryOnWorkflowState: staleBefore.aiTryOnWorkflowState,
  shippingState: staleBefore.shippingState,
});

const singleSource = createCatalogDesignSource("single-style")!;
const lastInput = authorizeRemoval(
  makeBaseInput({
    garmentTypes: ["shirt"],
    targetGarmentKey: "base:shirt",
    fabricAllocationState: makeAllocationState([
      {
        allocationId: "single-allocation",
        fabricCode: "FAB-A",
        garmentAssignments: [makeAssignment("shirt")],
      },
    ]),
    designSource: singleSource,
  }),
);
const lastBefore = structuredClone(lastInput);
const lastResult = removeFuturePhysicalGarmentOccurrence(lastInput);
assert.equal(lastResult.status, "blocked");
assert.equal(
  lastResult.status === "blocked" ? lastResult.code : null,
  "LAST_GARMENT_REMOVAL_FORBIDDEN",
);
assert.deepEqual(lastResult.state, {
  garmentTypeSelection: lastBefore.garmentTypeSelection,
  designSource: lastBefore.designSource,
  confirmedDesignSourceKey: lastBefore.confirmedDesignSourceKey,
  uploadedCompositionMirror: lastBefore.uploadedCompositionMirror,
  uploadedAdditionalGarmentTypes: lastBefore.uploadedAdditionalGarmentTypes,
  additionalGarmentConstructionState:
    lastBefore.additionalGarmentConstructionState,
  fabricAllocationState: lastBefore.fabricAllocationState,
  garmentScopedCustomDetails: lastBefore.garmentScopedCustomDetails,
  garmentScopedCustomDetailInputs:
    lastBefore.garmentScopedCustomDetailInputs,
  measurementState: lastBefore.measurementState,
  aiTryOnWorkflowState: lastBefore.aiTryOnWorkflowState,
  shippingState: lastBefore.shippingState,
});

const protectedInput: RemoveFuturePhysicalGarmentOccurrenceInput = {
  ...baseInput,
  pendingOperations: {
    ...baseInput.pendingOperations,
    protectedSourceMutationPending: true,
  },
};
const protectedResult = removeFuturePhysicalGarmentOccurrence(protectedInput);
assert.equal(protectedResult.status, "blocked");
assert.equal(
  protectedResult.status === "blocked" ? protectedResult.code : null,
  "PROTECTED_SOURCE_MUTATION_PENDING",
);

const parentConstruction = resolveGarmentConstructionPricing("shirt", catalog);
assert.equal(parentConstruction.status, "resolved");
const dependentState: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: { [additionalOneKey]: parentConstruction },
};
const dependencyInput = authorizeRemoval(
  makeBaseInput({
    garmentTypes: ["shirt", "skirt"],
    targetGarmentKey: "base:shirt",
    fabricAllocationState: makeAllocationState([
      {
        allocationId: "dependency-allocation",
        fabricCode: "FAB-A",
        garmentAssignments: [makeAssignment("shirt"), additionalOneAssignment],
      },
      {
        allocationId: "dependency-skirt",
        fabricCode: "FAB-B",
        garmentAssignments: [makeAssignment("skirt")],
      },
    ]),
    designSource: baseSource,
    selectedStyle: baseStyle,
    additionalGarmentConstructionState: dependentState,
  }),
);
const dependencyBefore = structuredClone(dependencyInput);
const dependencyResult = removeFuturePhysicalGarmentOccurrence(
  dependencyInput,
);
assert.equal(dependencyResult.status, "blocked");
assert.equal(
  dependencyResult.status === "blocked" ? dependencyResult.code : null,
  "DEPENDENT_ADDITIONAL_GARMENT_PRESENT",
);
assert.deepEqual(
  dependencyResult.status === "blocked"
    ? dependencyResult.dependentGarmentKeys
    : [],
  [additionalOneKey],
);
assert.deepEqual(dependencyResult.state.fabricAllocationState, dependencyBefore.fabricAllocationState);
assert.deepEqual(
  dependencyResult.state.additionalGarmentConstructionState,
  dependencyBefore.additionalGarmentConstructionState,
);

// JSON persistence and hydration from canonical sources cannot resurrect the deletion.
const persistedBaseState = JSON.parse(JSON.stringify(baseResult.state)) as typeof baseResult.state;
const hydratedOrder = resolveAuthoritativePhysicalOrder({
  garmentTypeSelection: persistedBaseState.garmentTypeSelection,
  designSource: persistedBaseState.designSource,
  selectedStyle: baseStyle,
  confirmedDesignSourceKey: persistedBaseState.confirmedDesignSourceKey,
  normalizedCustomDetailCatalog: catalog,
  fabricAllocationState: persistedBaseState.fabricAllocationState,
  additionalGarmentConstructionState:
    persistedBaseState.additionalGarmentConstructionState,
});
assert.equal(hydratedOrder.status, "resolved");
if (hydratedOrder.status !== "resolved") {
  throw new Error("Hydrated survivor order did not resolve.");
}
assert.deepEqual(
  hydratedOrder.physicalOccurrences.map(
    (occurrence) => occurrence.garmentKey,
  ),
  ["base:shirt", "base:skirt"],
);

const buildProjectionInput = () => {
  const state = baseResult.state;
  const physicalOrder = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: state.garmentTypeSelection,
    designSource: state.designSource,
    selectedStyle: baseStyle,
    confirmedDesignSourceKey: state.confirmedDesignSourceKey,
    normalizedCustomDetailCatalog: catalog,
    fabricAllocationState: state.fabricAllocationState,
    additionalGarmentConstructionState:
      state.additionalGarmentConstructionState,
  });
  assert.equal(physicalOrder.status, "resolved");
  if (physicalOrder.status !== "resolved") {
    throw new Error("Projection authority failed.");
  }
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
    fabricAllocationState: state.fabricAllocationState,
    fabrics,
    requiredPhysicalOccurrences: physicalOrder.physicalOccurrences,
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    state.fabricAllocationState.fabricAllocations,
    fabrics,
  );
  assert.equal(materialPricing.status, "resolved");
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: baseStyle.id,
    styles: [baseStyle],
    garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
  });
  const measurementPlan = planMeasurementRequirements({
    route: state.measurementState.route,
    garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({
      garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
      physicalOccurrences: physicalOrder.physicalOccurrences,
    }),
    garmentScopedCustomDetails: state.garmentScopedCustomDetails,
    additionalGarmentConstructions:
      state.additionalGarmentConstructionState,
  });
  const basePricing = calculateDesignPricing({
    route: "alone",
    design: {
      garmentScopedCustomDetails: state.garmentScopedCustomDetails,
      garmentScopedCustomDetailInputs:
        state.garmentScopedCustomDetailInputs,
      additionalGarmentConstructions:
        state.additionalGarmentConstructionState,
    },
    materialPricing,
    style: baseStyle,
    baseGarmentComposition: physicalOrder.physicalOccurrences
      .filter((occurrence) => occurrence.sourceRole === "main")
      .map((occurrence) => ({
        ...createStyleBaseGarmentSpec(occurrence.garmentType),
        key: occurrence.garmentKey,
      })),
    additionalGarments:
      state.fabricAllocationState.fabricAllocations.flatMap(
        (allocation) => allocation.garmentAssignments,
      ),
    catalog,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
  });
  const authority = {
    step1GarmentTypeSelection: state.garmentTypeSelection,
    garmentTypeSelection: physicalOrder.effectiveGarmentTypeSelection,
    designSourceKind: "catalogue" as const,
    uploadedCompositionSpecs: null,
    additionalGarmentConstructionState:
      state.additionalGarmentConstructionState,
    pendingAdditionalGarment: null,
    catalogInspection,
    fabricAllocationState: state.fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    customDetailsReconciliation: null,
    customDetailsCompletion: null,
    customDetailsPricing: null,
    personalizedInputs: state.garmentScopedCustomDetailInputs,
    aiTryOnWorkflow: state.aiTryOnWorkflowState,
    measurementPlan,
    measurementState: state.measurementState,
    basePricing,
  };
  const summary = projectFutureDesignStudioSummary(authority);
  const shippingResolution = reconcileFutureShippingState({
    state: state.shippingState,
    garmentCount: summary.garmentSummary.length,
    selectedDesignPrice:
      summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice ?? null,
  });
  return { authority, summary, shippingResolution };
};

const projection = buildProjectionInput();
assert.deepEqual(
  projection.summary.garmentSummary.map((garment) => garment.garmentKey),
  ["base:shirt", "base:skirt"],
);
assert.equal(
  projection.summary.garmentSummary.find(
    (garment) => garment.garmentKey === "base:shirt",
  )?.constructionTotalCents,
  shirtPriceBefore,
);
assert.equal(
  projection.summary.garmentSummary.find(
    (garment) => garment.garmentKey === "base:skirt",
  )?.constructionTotalCents,
  skirtPriceBefore,
);
const candidateResult = buildFutureOrderCandidate({
  ...projection.authority,
  source: baseResult.state.designSource,
  shippingResolution: projection.shippingResolution,
});
assert.ok(candidateResult.candidate);
assert.deepEqual(
  candidateResult.candidate?.garments.map((garment) => garment.garmentKey),
  ["base:shirt", "base:skirt"],
);
assert.ok(
  candidateResult.blockers.some(
    (blocker) => blocker.code === "PAYMENT_PROVIDER_UNAVAILABLE",
  ),
  "payment availability must not be broadened",
);

const uploadedCandidateResult = buildFutureOrderCandidate({
  ...projection.authority,
  source: uploadedOverlapResult.state.designSource,
  shippingResolution: projection.shippingResolution,
});
assert.equal(uploadedCandidateResult.status, "invalid");
assert.ok(
  uploadedCandidateResult.blockers.some(
    (blocker) => blocker.code === "UNSUPPORTED_FUTURE_SOURCE",
  ),
  "uploaded Candidate conversion must remain unsupported",
);

// Existing ordinary Remove Fabric behavior still keeps an empty primary allocation.
const ordinaryRemoval = FabricAllocationStateEngine.removeGarmentAssignments(
  makeAllocationState([
    {
      allocationId: "ordinary-primary",
      fabricCode: "FAB-A",
      garmentAssignments: [makeAssignment("shirt")],
    },
  ]),
  ["base:shirt"],
);
assert.equal(ordinaryRemoval.fabricAllocations.length, 1);
assert.equal(ordinaryRemoval.fabricAllocations[0].garmentAssignments.length, 0);

// Current upload mirrors stay normalized after exact-key removal.
assert.deepEqual(
  getUploadedDesignAdditionalGarmentTypes({
    step1GarmentTypes:
      uploadOnlyResult.state.garmentTypeSelection.garmentTypes,
    composition:
      uploadOnlyResult.state.designSource?.kind === "uploaded"
        ? uploadOnlyResult.state.designSource.fabricCapacityComposition
        : [],
  }),
  uploadOnlyResult.state.uploadedAdditionalGarmentTypes,
);
const uploadedEffective =
  uploadOnlyResult.state.designSource?.kind === "uploaded"
    ? buildEffectiveUploadedJourneyGarmentTypeSelection({
        step1Selection: uploadOnlyResult.state.garmentTypeSelection,
        uploadedComposition:
          uploadOnlyResult.state.designSource.fabricCapacityComposition,
        normalizedCustomDetailCatalog: catalog,
      })
    : null;
assert.deepEqual(uploadedEffective?.garmentTypes, ["shirt", "skirt"]);

console.log("Mid-process garment removal domain tests passed");
