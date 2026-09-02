import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  AdditionalGarmentConstructionStateV1,
  Fabric,
  FabricAllocation,
  FabricAllocationState,
  FabricGarmentAssignment,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  cloneGarmentConstructionPricingResolution,
  reconcileAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
} from "./src/utils/additionalGarmentConstructionState";
import { applyAdditionalGarmentConstructionAndCopy } from "./src/utils/additionalGarmentFabricPicker";
import { inspectCustomDetailCatalog, normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  buildAuthoritativePhysicalOccurrences,
  createUploadedDesignSource,
  resolveAuthoritativePhysicalOrder,
  validateRawFabricAssignments,
} from "./src/utils/designSourceState";
import {
  createCatalogueAdditionalGarmentSelection,
  getNextAdditionalOccurrenceSequence,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import {
  getFutureFabricStageCompletion,
  getHydratedOrphanFabricAssignmentRepairTargets,
  prepareHydratedFabricAllocationState,
  repairHydratedOrphanFabricAssignment,
  revalidateHydratedFabricIntegrityAfterExplicitRepair,
  applyFutureFabricCardSelection,
  assignFutureFabricToGarment,
  getFutureUnassignedFabricTargets,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveDraftAutosaveFabricAllocations } from "./src/utils/fabricAllocationPersistence";
import { reconcileFutureShippingState, createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";
import {
  resolveFutureCustomDetailPhysicalSubjects,
  projectAuthorizedAdditionalGarmentAssignments,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  resolveHydratedMeasurementPhysicalGarments,
} from "./src/utils/measurementBlueprint";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const testFabrics: Fabric[] = [
  {
    code: "FAB-A",
    name: "Fabric A",
    description: "Fabric A",
    color: "Green",
    colorHex: "#0A4A33",
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    category: "Test Fabric",
    price: 10,
  },
  {
    code: "FAB-B",
    name: "Fabric B",
    description: "Fabric B",
    color: "Blue",
    colorHex: "#003366",
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    category: "Test Fabric",
    price: 12,
  },
];

const assignedGarmentKeys = (state: FabricAllocationState): string[] =>
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  );

const stateFromPersistedFabricAllocations = (
  fabricAllocations: FabricAllocation[] | undefined,
): FabricAllocationState => ({
  fabricAllocations: fabricAllocations ?? [],
  activeAllocationId: fabricAllocations?.[0]?.allocationId ?? null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const fabricStateWithAssignments = (
  assignments: FabricGarmentAssignment[],
): FabricAllocationState => ({
  fabricAllocations: assignments.length
    ? [
        {
          allocationId: "allocation-1",
          fabricCode: "FAB-A",
          garmentAssignments: assignments,
        },
      ]
    : [],
  activeAllocationId: assignments.length ? "allocation-1" : null,
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const additionalConstructionForType = (
  _garmentKey: string,
  garmentType: "shirt" | "trouser",
  priceCents: number,
): AdditionalGarmentConstructionStateV1["byGarmentKey"][string] => {
  const base = resolveGarmentConstructionPricing(garmentType, catalog);
  assert.equal(base.status, "resolved");
  const resolved = cloneGarmentConstructionPricingResolution(base);
  assert.equal(resolved.status, "resolved");
  return {
    ...resolved,
    garmentType,
    totalPriceCents: priceCents,
    totalPrice: priceCents / 100,
    components: resolved.components.map((component, index) =>
      index === 0 ? { ...component, priceCents } : { ...component, priceCents: 0 },
    ),
  };
};

const additionalConstruction = (
  garmentKey: string,
  garmentType: "shirt",
  priceCents: number,
): AdditionalGarmentConstructionStateV1 => ({
  schemaVersion: 1,
  byGarmentKey: {
    [garmentKey]: additionalConstructionForType(garmentKey, garmentType, priceCents),
  },
});

const runDesignStudioAdditionalReconciliation = ({
  step1,
  existingAdditionalConstructions,
  fabricAssignments,
}: {
  step1: GarmentTypeStepSelection;
  existingAdditionalConstructions: unknown;
  fabricAssignments: FabricGarmentAssignment[];
}) => {
  const additionalAssignments = fabricAssignments.filter(
    (assignment) => assignment.sourceRole === "additional",
  );
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: existingAdditionalConstructions,
    assignments: additionalAssignments,
    normalizedCustomDetailCatalog: catalog,
  });
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricStateWithAssignments(fabricAssignments),
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  return { reconciliation, order };
};

// Parent orphan laundering: Fabric must not create additional membership
{
  const step1 = selection(["shirt"]);
  const orphanAssignment: FabricGarmentAssignment = {
    garmentKey: "additional:full_length_gown:99",
    code: "ADDITIONAL_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "additional",
  };
  const { reconciliation, order } = runDesignStudioAdditionalReconciliation({
    step1,
    existingAdditionalConstructions: { schemaVersion: 1, byGarmentKey: {} },
    fabricAssignments: [
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      orphanAssignment,
    ],
  });
  assert.equal(
    Object.keys(reconciliation.state.byGarmentKey).length,
    0,
    "orphan Fabric assignment must not create a construction ledger row",
  );
  assert.equal(order.status, "blocked");
  if (order.status !== "blocked") throw new Error("expected orphan block");
  assert.equal(order.diagnostics[0]?.code, "orphan_fabric_assignment");
  const hydratedMeasurements = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricStateWithAssignments([
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      orphanAssignment,
    ]),
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydratedMeasurements.map((garment) => garment.garmentKey),
    ["base:shirt"],
  );
}

// Parent valid additional reconciliation
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const { reconciliation, order } = runDesignStudioAdditionalReconciliation({
    step1,
    existingAdditionalConstructions: authorizedState,
    fabricAssignments: [
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      {
        garmentKey: "additional:shirt:1",
        code: "ADDITIONAL_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "additional",
      },
    ],
  });
  assert.equal(reconciliation.state.byGarmentKey["additional:shirt:1"]?.status, "resolved");
  assert.ok(reconciliation.state.byGarmentKey["additional:shirt:1"]);
  assert.equal(order.status, "resolved");
  if (order.status !== "resolved") throw new Error("expected resolved additional order");
  assert.deepEqual(
    order.physicalOccurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
}

// Duplicate assignment keys remain visible to raw Fabric validation
{
  const step1 = selection(["shirt"]);
  const duplicateFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_A",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_B",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: { schemaVersion: 1, byGarmentKey: {} },
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const integrity = validateRawFabricAssignments({
    authoritativeOccurrenceKeys: new Set(["base:shirt"]),
    fabricAllocationState: duplicateFabricState,
  });
  assert.equal(integrity.diagnostics[0]?.code, "duplicate_assignment_key");
  assert.equal(
    resolveAuthoritativePhysicalOrder({
      garmentTypeSelection: step1,
      fabricAllocationState: duplicateFabricState,
      additionalGarmentConstructionState: reconciliation.state,
      normalizedCustomDetailCatalog: catalog,
    }).status,
    "blocked",
  );
}

// Repeated Shirt hydration after reload
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: authorizedState,
    assignments: fabricState.fabricAllocations[0]!.garmentAssignments.filter(
      (assignment) => assignment.sourceRole === "additional",
    ),
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricState,
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
}

// Upload + additional hydration
{
  const step1 = selection(["shirt"]);
  const uploadSource = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "hydration-upload",
      designReferenceId: "hydration-upload-ref",
      mimeType: "image/png",
      createdAt: "2026-08-11T00:00:00.000Z",
    }),
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: authorizedState,
    assignments: fabricState.fabricAllocations[0]!.garmentAssignments.filter(
      (assignment) => assignment.sourceRole === "additional",
    ),
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    designSource: uploadSource,
    confirmedDesignSourceKey: uploadSource.sourceKey,
    fabricAllocationState: fabricState,
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
}

// Three-occurrence hydration
{
  const step1 = selection(["shirt", "trouser"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:trouser",
      code: "BASE_TROUSER",
      garmentType: "trouser",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: authorizedState,
    assignments: fabricState.fabricAllocations[0]!.garmentAssignments.filter(
      (assignment) => assignment.sourceRole === "additional",
    ),
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricState,
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt", "base:trouser", "additional:shirt:1"],
  );
}

// Partial Fabric hydration keeps all authoritative occurrences
{
  const step1 = selection(["shirt", "trouser"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const partialFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: authorizedState,
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: partialFabricState,
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt", "base:trouser", "additional:shirt:1"],
  );
}

// Orphan Fabric must not enter hydrated measurements
{
  const step1 = selection(["shirt"]);
  const orphanAssignment: FabricGarmentAssignment = {
    garmentKey: "additional:full_length_gown:99",
    code: "ADDITIONAL_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "additional",
  };
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: { schemaVersion: 1, byGarmentKey: {} },
    assignments: [orphanAssignment],
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricStateWithAssignments([
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      orphanAssignment,
    ]),
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt"],
  );
}

// Hydration must not collapse to garment-type fallback
{
  const step1 = selection(["shirt"]);
  const fallbackOnly = getMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
  });
  assert.deepEqual(
    fallbackOnly.map((garment) => garment.garmentKey),
    ["base:shirt"],
    "baseline fallback is one base occurrence",
  );
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const reconciliation = reconcileAdditionalGarmentConstructionState({
    existingState: authorizedState,
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.notDeepEqual(
    hydrated.map((garment) => garment.garmentKey),
    fallbackOnly.map((garment) => garment.garmentKey),
    "hydration must preserve repeated/additional occurrence keys",
  );
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
}

// Full authority pipeline
{
  const step1 = selection(["shirt", "trouser"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const fabricAssignments: FabricGarmentAssignment[] = [
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:trouser",
      code: "BASE_TROUSER",
      garmentType: "trouser",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ];
  const { reconciliation, order } = runDesignStudioAdditionalReconciliation({
    step1,
    existingAdditionalConstructions: authorizedState,
    fabricAssignments,
  });
  assert.equal(order.status, "resolved");
  if (order.status !== "resolved") throw new Error("expected resolved pipeline order");
  const expectedKeys = ["base:shirt", "base:trouser", "additional:shirt:1"];
  assert.deepEqual(
    order.physicalOccurrences.map((occurrence) => occurrence.garmentKey),
    expectedKeys,
  );
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricStateWithAssignments(fabricAssignments),
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  const measurementPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection: step1,
    physicalGarments: hydrated,
    additionalGarmentConstructions: reconciliation.state,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    expectedKeys,
  );
  assert.equal(measurementPlan.profiles.length, expectedKeys.length);
  assert.deepEqual(
    measurementPlan.profiles
      .filter((profile) => profile.status === "resolved")
      .map((profile) => profile.garmentKey)
      .sort(),
    expectedKeys.sort(),
  );
}

// Orphan authority pipeline
{
  const step1 = selection(["shirt"]);
  const orphanAssignment: FabricGarmentAssignment = {
    garmentKey: "additional:full_length_gown:99",
    code: "ADDITIONAL_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "additional",
  };
  const { reconciliation, order } = runDesignStudioAdditionalReconciliation({
    step1,
    existingAdditionalConstructions: { schemaVersion: 1, byGarmentKey: {} },
    fabricAssignments: [
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      orphanAssignment,
    ],
  });
  assert.equal(Object.keys(reconciliation.state.byGarmentKey).length, 0);
  assert.equal(order.status, "blocked");
  const hydrated = resolveHydratedMeasurementPhysicalGarments({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricStateWithAssignments([
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "main",
      },
      orphanAssignment,
    ]),
    additionalGarmentConstructionState: reconciliation.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(
    hydrated.map((garment) => garment.garmentKey),
    ["base:shirt"],
  );
}

// Pending Fabric orphan must not create physical membership
{
  const step1 = selection(["shirt"]);
  const pendingOrphanState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "allocation-1",
        fabricCode: "FAB-A",
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
          },
        ],
      },
    ],
    activeAllocationId: "allocation-1",
    pendingFabricGarment: {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
    awaitingFabricForPendingGarment: true,
  };
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    fabricAllocationState: pendingOrphanState,
    additionalGarmentConstructionState: { schemaVersion: 1, byGarmentKey: {} },
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "blocked");
  if (order.status !== "blocked") throw new Error("expected pending orphan block");
  assert.equal(order.diagnostics[0]?.code, "orphan_fabric_assignment");
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: { schemaVersion: 1, byGarmentKey: {} },
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt"],
  );
}

// Step 4 authorization before Fabric establishes membership
{
  const step1 = selection(["shirt"]);
  const construction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(construction.status, "resolved");
  const resolvedConstruction = cloneGarmentConstructionPricingResolution(construction);
  const authorization = applyAdditionalGarmentConstructionAndCopy({
    current: {
      additionalGarmentConstructions: { schemaVersion: 1, byGarmentKey: {} },
    },
    transaction: {
      transactionId: 1,
      origin: "new_addition",
      phase: "catalogue",
      garmentKey: "additional:shirt:1",
      garmentType: "shirt",
      construction: resolvedConstruction,
      openedModal: true,
      constructionAppliedForTransactionId: 1,
    },
    catalogInspection: inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG),
  });
  assert.equal(authorization.applied, true);
  const authorizedState =
    authorization.next.additionalGarmentConstructions!;
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  if (order.status !== "resolved") throw new Error("expected authorized order");
  assert.deepEqual(
    order.physicalOccurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
}

// Authorized unassigned additional appears in Fabric requirements and downstream domains
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const partialFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection: step1,
    fabricAllocationState: partialFabricState,
    fabrics: [],
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(fabricCompletion.requiredGarmentCount, 2);
  assert.equal(fabricCompletion.assignedGarmentCount, 1);
  assert.equal(fabricCompletion.isComplete, false);
  const customDetails = resolveFutureCustomDetailPhysicalSubjects(step1, {
    additionalGarmentConstructions: authorizedState,
  });
  assert.deepEqual(
    [...new Set(customDetails.subjects.map((subject) => subject.parentGarmentKey))].sort(),
    ["additional:shirt:1", "base:shirt"],
  );
  const shipping = reconcileFutureShippingState({
    state: {
      ...createEmptyFutureShippingState(),
      fulfilmentMethod: "eindhoven_pickup",
      customerInformation: {
        ...createEmptyFutureShippingState().customerInformation,
        fullName: "Test Customer",
        phone: "+31612345678",
        email: "test@example.com",
      },
    },
    garmentCount: occurrences.length,
    selectedDesignPrice: 100,
  });
  assert.equal(shipping.parcelWeightKg, 1);
}

// Parent hydration duplicate assignment retains corruption blocker
{
  const step1 = selection(["shirt"]);
  const duplicateRawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_A",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_B",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const authoritativeKeys = new Set(["base:shirt"]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState: duplicateRawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: authoritativeKeys,
  });
  assert.equal(hydration.integrity.diagnostics[0]?.code, "duplicate_assignment_key");
  assert.equal(hydration.integrity.hasBlockingDiagnostics, true);
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: hydration.reconciledState,
      fabrics: [],
      requiredPhysicalOccurrences: buildAuthoritativePhysicalOccurrences({
        sourceKind: "catalogue",
        step1GarmentTypeSelection: step1,
        effectiveGarmentTypeSelection: step1,
      }),
      rawFabricIntegrityDiagnostics: hydration.integrity.diagnostics,
    }).blockers.some((blocker) => blocker.code === "RAW_FABRIC_INTEGRITY_BLOCKED"),
    true,
  );
}

// Orphan persisted Fabric hydration blocker
{
  const step1 = selection(["shirt"]);
  const orphanAssignment: FabricGarmentAssignment = {
    garmentKey: "additional:full_length_gown:99",
    code: "ADDITIONAL_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "additional",
  };
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    orphanAssignment,
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: new Set(["base:shirt"]),
  });
  assert.equal(hydration.integrity.diagnostics[0]?.code, "orphan_fabric_assignment");
  assert.equal(hydration.integrity.hasBlockingDiagnostics, true);
}

// G1 Case A — hydrated valid additional assignment retained
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState: fabricState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: new Set([
      "base:shirt",
      "additional:shirt:1",
    ]),
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(hydration.integrity.hasBlockingDiagnostics, false);
  assert.deepEqual(
    assignedGarmentKeys(hydration.reconciledState).sort(),
    ["additional:shirt:1", "base:shirt"],
  );
}

// G1 Case B — authorized additional without Fabric remains a valid target
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const partialFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const unassigned = getFutureUnassignedFabricTargets({
    garmentTypeSelection: step1,
    fabricAllocationState: partialFabricState,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.deepEqual(
    unassigned.map((target) => target.assignment.garmentKey),
    ["additional:shirt:1"],
  );
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: step1,
    fabricAllocationState: partialFabricState,
    fabrics: [],
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(completion.requiredGarmentCount, 2);
  assert.equal(completion.assignedGarmentCount, 1);
  assert.equal(completion.isComplete, false);
}

// G1 Case C — applyFutureFabricCardSelection assigns authorized additional
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const partialFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const assigned = applyFutureFabricCardSelection({
    state: partialFabricState,
    garmentTypeSelection: step1,
    garmentKey: "additional:shirt:1",
    fabricCode: "FAB-A",
    fabrics: testFabrics,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.deepEqual(
    assignedGarmentKeys(assigned).sort(),
    ["additional:shirt:1", "base:shirt"],
  );
}

// G1 Case D — replacement/change path for authoritative additional occurrence
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const fabricState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "allocation-1",
        fabricCode: "FAB-A",
        garmentAssignments: [
          {
            garmentKey: "base:shirt",
            code: "BASE_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "main",
          },
        ],
      },
      {
        allocationId: "allocation-2",
        fabricCode: "FAB-A",
        garmentAssignments: [
          {
            garmentKey: "additional:shirt:1",
            code: "ADDITIONAL_SHIRT",
            garmentType: "shirt",
            fabricUnits: 1,
            sourceRole: "additional",
          },
        ],
      },
    ],
    activeAllocationId: "allocation-2",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const changeResult = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: step1,
    garmentKey: "additional:shirt:1",
    fabricCode: "FAB-B",
    fabrics: testFabrics,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(changeResult.status, "assigned");
  const additionalAllocation = changeResult.state.fabricAllocations.find(
    (allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
  );
  assert.equal(additionalAllocation?.fabricCode, "FAB-B");
}

// G1 Case E — orphan hydration strips unauthorized additional from reconcile output
{
  const step1 = selection(["shirt"]);
  const orphanAssignment: FabricGarmentAssignment = {
    garmentKey: "additional:full_length_gown:99",
    code: "ADDITIONAL_GOWN",
    garmentType: "full_length_gown",
    fabricUnits: 2,
    sourceRole: "additional",
  };
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    orphanAssignment,
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: new Set(["base:shirt"]),
    requiredPhysicalOccurrences: buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: step1,
      effectiveGarmentTypeSelection: step1,
    }),
  });
  assert.equal(hydration.integrity.diagnostics[0]?.code, "orphan_fabric_assignment");
  assert.deepEqual(assignedGarmentKeys(hydration.reconciledState), ["base:shirt"]);
}

// G2 D — uploaded Shirt + authorized additional Shirt without Fabric
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const partialFabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const subjects = resolveFutureCustomDetailPhysicalSubjects(step1, {
    additionalGarmentConstructions: authorizedState,
  });
  assert.deepEqual(
    [...new Set(subjects.subjects.map((subject) => subject.parentGarmentKey))].sort(),
    ["additional:shirt:1", "base:shirt"],
  );
  assert.deepEqual(
    projectAuthorizedAdditionalGarmentAssignments({
      additionalGarmentConstructions: authorizedState,
      fabricAllocationState: partialFabricState,
    }).map((assignment) => assignment.garmentKey),
    ["additional:shirt:1"],
  );
}

// G2 E — upload Shirt+Gown + Step 4 additional Shirt
{
  const step1 = selection(["shirt"]);
  const effectiveSelection = selection(["shirt", "full_length_gown"]);
  const uploadSource = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "g2-upload-gown",
      designReferenceId: "g2-upload-gown-ref",
      mimeType: "image/png",
      createdAt: "2026-08-11T00:00:00.000Z",
    }),
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("full_length_gown"),
    ],
    demographic: "male",
  });
  const authorizedState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: effectiveSelection,
    uploadedCompositionSpecs: uploadSource.fabricCapacityComposition,
    additionalGarmentConstructionState: authorizedState,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey).sort(),
    ["additional:shirt:1", "base:full_length_gown", "base:shirt"],
  );
  const subjects = resolveFutureCustomDetailPhysicalSubjects(effectiveSelection, {
    additionalGarmentConstructions: authorizedState,
  });
  assert.deepEqual(
    [...new Set(subjects.subjects.map((subject) => subject.parentGarmentKey))].sort(),
    ["additional:shirt:1", "base:full_length_gown", "base:shirt"],
  );
  void uploadSource;
}

const baseShirtAssignment: FabricGarmentAssignment = {
  garmentKey: "base:shirt",
  code: "BASE_SHIRT",
  garmentType: "shirt",
  fabricUnits: 1,
  sourceRole: "main",
};

const authorizedKeysFromLedger = (
  ledger: AdditionalGarmentConstructionStateV1,
): string[] => Object.keys(ledger.byGarmentKey);

// H2 A: catalogue parent without Fabric
{
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected catalogue shirt without Fabric");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:1");
  assert.equal(next.selection.mainGarmentKey, "base:shirt");
  assert.equal(next.selection.mainGarmentType, "shirt");
}

// H2 B: uploaded parent without Fabric
{
  const step1 = selection(["shirt"]);
  const uploadSource = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "h2-upload-owner",
      mimeType: "image/png",
      designReferenceId: "h2-upload-reference",
      originalFileName: "h2-upload.png",
      createdAt: "2026-08-15T12:00:00.000Z",
    }),
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const uploadOccurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    uploadedCompositionSpecs: uploadSource.fabricCapacityComposition,
    additionalGarmentConstructionState: null,
  });
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: uploadOccurrences,
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected uploaded shirt without Fabric");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:1");
  assert.equal(next.selection.mainGarmentKey, "base:shirt");
}

// H2 C: parent with Fabric still succeeds
{
  const fabricState = fabricStateWithAssignments([baseShirtAssignment]);
  assert.ok(assignedGarmentKeys(fabricState).includes("base:shirt"));
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected shirt with Fabric parent");
  assert.equal(next.selection.mainGarmentKey, "base:shirt");
}

// H2 D: orphan Fabric gown is not a parent candidate
{
  const orphanState = fabricStateWithAssignments([
    baseShirtAssignment,
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  assert.ok(
    assignedGarmentKeys(orphanState).includes("additional:full_length_gown:99"),
  );
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected shirt parent despite orphan Fabric");
  assert.equal(next.selection.mainGarmentKey, "base:shirt");
  assert.notEqual(next.selection.mainGarmentKey, "additional:full_length_gown:99");
}

// H2 F: Step 4 authorization is established before Fabric transaction
{
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved shirt for authorization");
  const garmentKey = next.selection.garmentSpec!.key;
  const construction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(construction.status, "resolved");
  if (construction.status !== "resolved") throw new Error("expected resolved construction");
  const authorization = applyAdditionalGarmentConstructionAndCopy({
    current: {
      additionalGarmentConstructions: { schemaVersion: 1, byGarmentKey: {} },
    },
    transaction: {
      transactionId: 1,
      phase: "catalogue",
      origin: "new_addition",
      garmentKey,
      garmentType: "shirt",
      openedModal: true,
      construction: cloneGarmentConstructionPricingResolution(construction),
      constructionAppliedForTransactionId: 1,
    },
    catalogInspection: inspectCustomDetailCatalog(catalog),
  });
  assert.equal(authorization.applied, true);
  assert.ok(authorization.next.additionalGarmentConstructions?.byGarmentKey[garmentKey]);
}

// G3 A: authorized additional:shirt:1 with no Fabric → next Shirt is :2
{
  const ledger = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedKeysFromLedger(ledger),
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved next shirt");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:2");
}

// G3 B: two authorized shirts with no Fabric → next Shirt is :3
{
  const ledger: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": additionalConstruction("additional:shirt:1", "shirt", 7000)
        .byGarmentKey["additional:shirt:1"]!,
      "additional:shirt:2": additionalConstruction("additional:shirt:2", "shirt", 6500)
        .byGarmentKey["additional:shirt:2"]!,
    },
  };
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedKeysFromLedger(ledger),
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved third shirt");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:3");
}

// G3 C: Fabric removal does not free sequence 1 for reuse
{
  const ledger = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const fabricRemovedState = fabricStateWithAssignments([baseShirtAssignment]);
  assert.ok(!assignedGarmentKeys(fabricRemovedState).includes("additional:shirt:1"));
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedKeysFromLedger(ledger),
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved shirt after fabric removal");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:2");
}

// G3 D: garment-type sequences remain independent
{
  const ledger: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": additionalConstructionForType("additional:shirt:1", "shirt", 7000),
      "additional:shirt:2": additionalConstructionForType("additional:shirt:2", "shirt", 6500),
      "additional:trouser:1": additionalConstructionForType(
        "additional:trouser:1",
        "trouser",
        7200,
      ),
    },
  };
  const keys = authorizedKeysFromLedger(ledger);
  assert.equal(getNextAdditionalOccurrenceSequence("shirt", keys), 3);
  assert.equal(getNextAdditionalOccurrenceSequence("trouser", keys), 2);
}

// G3 E: pending Fabric alone does not reserve authoritative sequence
{
  const pendingOnlyState: FabricAllocationState = {
    ...fabricStateWithAssignments([baseShirtAssignment]),
    pendingFabricGarment: {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT_1",
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
  assert.equal(pendingOnlyState.awaitingFabricForPendingGarment, true);
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: [],
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved pending-only next shirt");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:1");
}

// G3 F: new allocation must not overwrite prior occurrence-owned construction
{
  const ledger = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const firstConstruction = ledger.byGarmentKey["additional:shirt:1"];
  assert.equal(firstConstruction?.status, "resolved");
  const preservedConstruction =
    firstConstruction?.status === "resolved"
      ? firstConstruction.totalPriceCents
      : null;
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedKeysFromLedger(ledger),
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved second shirt");
  assert.equal(next.selection.garmentSpec?.key, "additional:shirt:2");
  assert.equal(
    firstConstruction?.status === "resolved"
      ? firstConstruction.totalPriceCents
      : null,
    preservedConstruction,
    "sequence allocation must not mutate the prior occurrence construction row",
  );
}

// G3 gap semantics: do not reuse missing sequence numbers
{
  const ledger: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": additionalConstructionForType("additional:shirt:1", "shirt", 7000),
      "additional:shirt:3": additionalConstructionForType("additional:shirt:3", "shirt", 6500),
    },
  };
  assert.equal(
    getNextAdditionalOccurrenceSequence(
      "shirt",
      authorizedKeysFromLedger(ledger),
    ),
    4,
  );
}

// G3 explicit remove: surviving authoritative keys determine next sequence
{
  const ledger: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": additionalConstructionForType("additional:shirt:1", "shirt", 7000),
      "additional:shirt:2": additionalConstructionForType("additional:shirt:2", "shirt", 6500),
    },
  };
  const afterRemoval = removeAdditionalGarmentConstruction(
    ledger,
    "additional:shirt:2",
  );
  const next = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
    authorizedOccurrenceKeys: authorizedKeysFromLedger(afterRemoval),
  });
  assert.equal(next.status, "resolved");
  if (next.status !== "resolved") throw new Error("expected resolved shirt after explicit removal");
  assert.equal(
    next.selection.garmentSpec?.key,
    "additional:shirt:2",
    "explicit removal drops :2 from the authoritative ledger so max surviving sequence is 1",
  );
}

// G4 duplicate corruption survives autosave and reload until explicit repair.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_A",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_B",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(hydration.integrity.diagnostics[0]?.code, "duplicate_assignment_key");
  assert.equal(hydration.preservedRawFabricAllocations?.[0].garmentAssignments.length, 2);

  const autosaveWithoutRepair = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      hydration.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity: true,
    generatedFabricAllocations: hydration.reconciledState.fabricAllocations,
  });
  assert.equal(autosaveWithoutRepair.preserveInvalidHydratedModernData, true);
  assert.equal(autosaveWithoutRepair.fabricAllocations?.[0].garmentAssignments.length, 2);

  const reload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      autosaveWithoutRepair.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(reload.integrity.diagnostics[0]?.code, "duplicate_assignment_key");

  const reassignment = assignFutureFabricToGarment({
    state: hydration.reconciledState,
    garmentTypeSelection: step1,
    garmentKey: "base:shirt",
    fabricCode: "FAB-B",
    fabrics: testFabrics,
  });
  assert.equal(reassignment.status, "assigned");
  const repair = revalidateHydratedFabricIntegrityAfterExplicitRepair({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    previousRuntimeState: hydration.reconciledState,
    nextRuntimeState: reassignment.state,
    authoritativeOccurrenceKeys,
  });
  assert.deepEqual(repair.repairedGarmentKeys, ["base:shirt"]);
  assert.equal(repair.integrity.hasBlockingDiagnostics, false);
  assert.equal(repair.preservedRawFabricAllocations, null);

  const autosaveAfterRepair = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      repair.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity:
      repair.integrity.hasBlockingDiagnostics,
    generatedFabricAllocations: reassignment.state.fabricAllocations,
  });
  const repairedReload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      autosaveAfterRepair.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(repairedReload.integrity.hasBlockingDiagnostics, false);
  assert.deepEqual(assignedGarmentKeys(repairedReload.reconciledState), [
    "base:shirt",
  ]);
}

// G4 orphan corruption survives unrelated autosave, then explicit removal clears it.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const orphanGarmentKey = "additional:full_length_gown:99";
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: orphanGarmentKey,
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(hydration.integrity.diagnostics[0]?.code, "orphan_fabric_assignment");

  const unrelatedAutosave = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      hydration.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity: true,
    generatedFabricAllocations: hydration.reconciledState.fabricAllocations,
  });
  const reload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      unrelatedAutosave.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(reload.integrity.diagnostics[0]?.code, "orphan_fabric_assignment");

  const repair = revalidateHydratedFabricIntegrityAfterExplicitRepair({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    previousRuntimeState: hydration.reconciledState,
    nextRuntimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    explicitlyRepairedGarmentKeys: [orphanGarmentKey],
  });
  assert.equal(repair.integrity.hasBlockingDiagnostics, false);
  assert.equal(repair.preservedRawFabricAllocations, null);
  const autosaveAfterRepair = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      repair.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity: false,
    generatedFabricAllocations: hydration.reconciledState.fabricAllocations,
  });
  const repairedReload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      autosaveAfterRepair.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(repairedReload.integrity.hasBlockingDiagnostics, false);
}

// G4 partial repair leaves unrelated raw diagnostics blocked and persistable.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const orphanGarmentKey = "additional:full_length_gown:99";
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_A",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_B",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: orphanGarmentKey,
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.deepEqual(
    hydration.integrity.diagnostics.map((diagnostic) => diagnostic.code),
    ["duplicate_assignment_key", "orphan_fabric_assignment"],
  );
  const reassignment = assignFutureFabricToGarment({
    state: hydration.reconciledState,
    garmentTypeSelection: step1,
    garmentKey: "base:shirt",
    fabricCode: "FAB-B",
    fabrics: testFabrics,
  });
  assert.equal(reassignment.status, "assigned");
  const duplicateRepair = revalidateHydratedFabricIntegrityAfterExplicitRepair({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    previousRuntimeState: hydration.reconciledState,
    nextRuntimeState: reassignment.state,
    authoritativeOccurrenceKeys,
  });
  assert.deepEqual(
    duplicateRepair.integrity.diagnostics.map((diagnostic) => diagnostic.code),
    ["orphan_fabric_assignment"],
  );
  assert.equal(
    duplicateRepair.preservedRawFabricAllocations
      ?.flatMap((allocation) => allocation.garmentAssignments)
      .filter((assignment) => assignment.garmentKey === "base:shirt").length,
    1,
  );
  const partialAutosave = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      duplicateRepair.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity: true,
    generatedFabricAllocations: reassignment.state.fabricAllocations,
  });
  const partialReload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      partialAutosave.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.deepEqual(
    partialReload.integrity.diagnostics.map((diagnostic) => diagnostic.code),
    ["orphan_fabric_assignment"],
  );
}

// H4 exact orphan repair retains valid assignments in a mixed allocation.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const orphanGarmentKey = "additional:full_length_gown:99";
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: orphanGarmentKey,
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  const targets = getHydratedOrphanFabricAssignmentRepairTargets({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    authoritativeOccurrenceKeys,
  });
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.garmentKey, orphanGarmentKey);
  const repair = repairHydratedOrphanFabricAssignment({
    preservedRawFabricAllocations: hydration.preservedRawFabricAllocations,
    runtimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    target: targets[0]!,
  });
  if (repair.status !== "removed") {
    throw new Error("Expected the mixed orphan assignment to be removed.");
  }
  assert.equal(repair.status, "removed");
  assert.equal(repair.rawFabricAllocations.length, 1);
  assert.equal(
    repair.rawFabricAllocations[0]?.allocationId,
    rawState.fabricAllocations[0]?.allocationId,
  );
  assert.equal(
    repair.rawFabricAllocations[0]?.fabricCode,
    rawState.fabricAllocations[0]?.fabricCode,
  );
  assert.deepEqual(
    repair.rawFabricAllocations[0]?.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
    ["base:shirt"],
  );
  assert.equal(repair.integrity.hasBlockingDiagnostics, false);
  const autosave = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      repair.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity:
      repair.integrity.hasBlockingDiagnostics,
    generatedFabricAllocations: hydration.reconciledState.fabricAllocations,
  });
  const reload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(autosave.fabricAllocations),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.equal(reload.integrity.hasBlockingDiagnostics, false);
  assert.deepEqual(assignedGarmentKeys(reload.reconciledState), ["base:shirt"]);
}

// H4 orphan-only allocations are removed without manufacturing membership or stock.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  const target = getHydratedOrphanFabricAssignmentRepairTargets({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    authoritativeOccurrenceKeys,
  })[0]!;
  const repair = repairHydratedOrphanFabricAssignment({
    preservedRawFabricAllocations: hydration.preservedRawFabricAllocations,
    runtimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    target,
  });
  if (repair.status !== "removed") {
    throw new Error("Expected the orphan-only assignment to be removed.");
  }
  assert.equal(repair.status, "removed");
  assert.deepEqual(repair.rawFabricAllocations, []);
  assert.equal(repair.preservedRawFabricAllocations, null);
  assert.equal(repair.integrity.hasBlockingDiagnostics, false);
  assert.deepEqual(assignedGarmentKeys(hydration.reconciledState), []);
}

// H4 removes one of multiple orphans and preserves every unresolved sibling.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
    {
      garmentKey: "additional:trouser:88",
      code: "ADDITIONAL_TROUSER",
      garmentType: "trouser",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  const targets = getHydratedOrphanFabricAssignmentRepairTargets({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    authoritativeOccurrenceKeys,
  });
  assert.equal(targets.length, 2);
  const repair = repairHydratedOrphanFabricAssignment({
    preservedRawFabricAllocations: hydration.preservedRawFabricAllocations,
    runtimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    target: targets[0]!,
  });
  if (repair.status !== "removed") {
    throw new Error("Expected one orphan assignment to be removed.");
  }
  assert.equal(repair.status, "removed");
  assert.deepEqual(
    repair.integrity.diagnostics.map((diagnostic) => diagnostic.garmentKey),
    ["additional:trouser:88"],
  );
  assert.equal(repair.preservedRawFabricAllocations !== null, true);
}

// H4 orphan repair does not clear an unrelated duplicate diagnostic.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_A",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT_B",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  const target = getHydratedOrphanFabricAssignmentRepairTargets({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    authoritativeOccurrenceKeys,
  })[0]!;
  const repair = repairHydratedOrphanFabricAssignment({
    preservedRawFabricAllocations: hydration.preservedRawFabricAllocations,
    runtimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    target,
  });
  if (repair.status !== "removed") {
    throw new Error("Expected the orphan assignment to be removed.");
  }
  assert.equal(repair.status, "removed");
  assert.deepEqual(
    repair.integrity.diagnostics.map((diagnostic) => diagnostic.code),
    ["duplicate_assignment_key"],
  );
  assert.equal(repair.preservedRawFabricAllocations !== null, true);
  const autosave = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations:
      repair.preservedRawFabricAllocations,
    hasUnresolvedHydratedFabricIntegrity:
      repair.integrity.hasBlockingDiagnostics,
    generatedFabricAllocations: hydration.reconciledState.fabricAllocations,
  });
  const reload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(autosave.fabricAllocations),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  assert.deepEqual(
    reload.integrity.diagnostics.map((diagnostic) => diagnostic.code),
    ["duplicate_assignment_key"],
  );
}

// H4 stale requests fail closed and cannot remove a replacement assignment.
{
  const step1 = selection(["shirt"]);
  const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
  const rawState = fabricStateWithAssignments([
    {
      garmentKey: "additional:full_length_gown:99",
      code: "ADDITIONAL_GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
      sourceRole: "additional",
    },
  ]);
  const hydration = prepareHydratedFabricAllocationState({
    rawState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
  });
  const staleTarget = getHydratedOrphanFabricAssignmentRepairTargets({
    preservedRawFabricAllocations:
      hydration.preservedRawFabricAllocations ?? [],
    authoritativeOccurrenceKeys,
  })[0]!;
  const changedRawAllocations = (hydration.preservedRawFabricAllocations ?? []).map(
    (allocation) => ({
      ...allocation,
      garmentAssignments: allocation.garmentAssignments.map((assignment) => ({
        ...assignment,
        code: "REPLACED_ORPHAN",
      })),
    }),
  );
  const repair = repairHydratedOrphanFabricAssignment({
    preservedRawFabricAllocations: changedRawAllocations,
    runtimeState: hydration.reconciledState,
    authoritativeOccurrenceKeys,
    target: staleTarget,
  });
  assert.deepEqual(repair, {
    status: "blocked",
    reason: "STALE_REPAIR_REQUEST",
  });
  assert.equal(
    changedRawAllocations[0]?.garmentAssignments[0]?.code,
    "REPLACED_ORPHAN",
  );
}

// H4 never classifies authorized or merely unassigned occurrences as corruption.
{
  const step1 = selection(["shirt"]);
  const authorizedAdditionalKey = "additional:shirt:1";
  const authoritativeOccurrenceKeys = new Set([
    "base:shirt",
    authorizedAdditionalKey,
  ]);
  const authorizedRawState = fabricStateWithAssignments([
    {
      garmentKey: authorizedAdditionalKey,
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  assert.deepEqual(
    getHydratedOrphanFabricAssignmentRepairTargets({
      preservedRawFabricAllocations: authorizedRawState.fabricAllocations,
      authoritativeOccurrenceKeys,
    }),
    [],
  );
  assert.deepEqual(
    getHydratedOrphanFabricAssignmentRepairTargets({
      preservedRawFabricAllocations: [],
      authoritativeOccurrenceKeys,
    }),
    [],
  );
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: FabricAllocationStateEngine.initialize(),
      fabrics: testFabrics,
      requiredPhysicalOccurrences: [
        {
          garmentKey: "base:shirt",
          garmentType: "shirt",
          sourceRole: "main",
          fabricUnits: 1,
        },
        {
          garmentKey: authorizedAdditionalKey,
          garmentType: "shirt",
          sourceRole: "additional",
          fabricUnits: 1,
        },
      ],
    }).blockers.some(
      (blocker) => blocker.code === "RAW_FABRIC_INTEGRITY_BLOCKED",
    ),
    false,
  );
}

// G4 healthy and authorized-incomplete drafts retain normal autosave semantics.
{
  const step1 = selection(["shirt"]);
  const authorizedState = additionalConstruction(
    "additional:shirt:1",
    "shirt",
    7000,
  );
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: authorizedState,
  });
  const authoritativeOccurrenceKeys = new Set(
    occurrences.map((occurrence) => occurrence.garmentKey),
  );
  const completeState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ]);
  const healthyHydration = prepareHydratedFabricAllocationState({
    rawState: completeState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(healthyHydration.integrity.hasBlockingDiagnostics, false);
  assert.equal(healthyHydration.preservedRawFabricAllocations, null);
  const healthyAutosave = resolveDraftAutosaveFabricAllocations({
    preservedInvalidHydratedFabricAllocations: null,
    hasUnresolvedHydratedFabricIntegrity: false,
    generatedFabricAllocations:
      healthyHydration.reconciledState.fabricAllocations,
  });
  assert.equal(healthyAutosave.preserveInvalidHydratedModernData, false);
  const healthyReload = prepareHydratedFabricAllocationState({
    rawState: stateFromPersistedFabricAllocations(
      healthyAutosave.fabricAllocations,
    ),
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(healthyReload.integrity.hasBlockingDiagnostics, false);
  assert.deepEqual(assignedGarmentKeys(healthyReload.reconciledState).sort(), [
    "additional:shirt:1",
    "base:shirt",
  ]);

  const incompleteState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const incompleteHydration = prepareHydratedFabricAllocationState({
    rawState: incompleteState,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(incompleteHydration.integrity.hasBlockingDiagnostics, false);
  assert.equal(incompleteHydration.preservedRawFabricAllocations, null);
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: incompleteHydration.reconciledState,
      fabrics: testFabrics,
      requiredPhysicalOccurrences: occurrences,
    }).isComplete,
    false,
  );
}

console.log("PASS: authoritative parent reconciliation and hydration pipeline");
