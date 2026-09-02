import assert from "node:assert/strict";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  FabricAllocationState,
  FabricGarmentAssignment,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  buildAuthoritativePhysicalOccurrences,
  createCatalogDesignSource,
  createUploadedDesignSource,
  projectAuthoritativePhysicalOccurrences,
  resolveAuthoritativePhysicalOrder,
  resolveActiveDesignComposition,
  validateFinalPhysicalOccurrenceAssignmentParity,
  validateRawFabricAssignments,
} from "./src/utils/designSourceState";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import {
  evaluateAuthoritativeUploadedDesignReadiness,
} from "./src/utils/uploadedDesignStep1";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { assignSameFabricProductToGarments } from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographics: GarmentTypeStepSelection["audienceSelection"]["demographics"] = [
    "male",
  ],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: demographics,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "authority-test",
  designReferenceId: "authority-upload-ref",
  mimeType: "image/png",
  createdAt: "2026-08-11T00:00:00.000Z",
});

const styleShirtTrouserGown: StyleCategory = {
  id: "style-shirt-trouser-gown",
  name: "Reference Gown Set",
  description: "Style reference includes gown.",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
    createStyleBaseGarmentSpec("full_length_gown"),
  ],
};

const styleShirtTrouserOnly: StyleCategory = {
  id: "style-shirt-trouser-only",
  name: "Adaptable Senator",
  description: "Adaptable subset style.",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "kaftan"],
  },
};

const styleAdaptableShirtTrouserGown: StyleCategory = {
  id: "style-adaptable-shirt-trouser-gown",
  name: "Adaptable Gown Set",
  description: "Adaptable style for shirt, trouser, and gown.",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "full_length_gown"],
  },
};

const fabricStateWithMultipleAllocations = (): FabricAllocationState => ({
  fabricAllocations: [
    {
      allocationId: "allocation-a",
      fabricCode: "FAB-A",
      garmentAssignments: [
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
      ],
    },
    {
      allocationId: "allocation-b",
      fabricCode: "FAB-B",
      garmentAssignments: [
        {
          garmentKey: "base:full_length_gown",
          code: "BASE_GOWN",
          garmentType: "full_length_gown",
          fabricUnits: 2,
          sourceRole: "main",
        },
      ],
    },
  ],
  activeAllocationId: "allocation-a",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const cloneFabricAllocationState = (
  state: FabricAllocationState,
): FabricAllocationState => JSON.parse(JSON.stringify(state));

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

const additionalConstruction = (
  garmentKey: string,
  garmentType: "shirt",
  priceCents: number,
): AdditionalGarmentConstructionStateV1 => {
  const base = resolveGarmentConstructionPricing(garmentType, catalog);
  assert.equal(base.status, "resolved");
  const resolved = cloneGarmentConstructionPricingResolution(base);
  assert.equal(resolved.status, "resolved");
  return {
    schemaVersion: 1,
    byGarmentKey: {
      [garmentKey]: {
        ...resolved,
        totalPriceCents: priceCents,
        totalPrice: priceCents / 100,
        components: resolved.components.map((component, index) =>
          index === 0
            ? { ...component, priceCents }
            : { ...component, priceCents: 0 },
        ),
      },
    },
  };
};

// Catalogue exact-match subset: Step 1 wins over style gown
{
  const step1 = selection(["shirt", "trouser"]);
  const catalogueSource = createCatalogDesignSource(styleShirtTrouserGown.id);
  assert.ok(catalogueSource);
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    designSource: catalogueSource,
    selectedStyle: styleShirtTrouserGown,
    confirmedDesignSourceKey: catalogueSource.sourceKey,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  if (order.status !== "resolved") throw new Error("expected resolved catalogue order");
  assert.deepEqual(
    order.physicalOccurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "base:trouser"],
  );
  assert.deepEqual(resolveActiveDesignComposition(catalogueSource, styleShirtTrouserGown), []);
}

// Partial Fabric assignment keeps both Step 1 garments
{
  const step1 = selection(["shirt", "trouser"]);
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "base:trouser"],
  );
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricState,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  if (order.status !== "resolved") throw new Error("partial assignment should stay resolved");
  assert.equal(order.physicalOccurrences.length, 2);
}

// Orphan Fabric assignment is blocked
{
  const step1 = selection(["shirt", "trouser"]);
  const fabricState = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
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
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricState,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "blocked");
  if (order.status !== "blocked") throw new Error("expected orphan assignment block");
  assert.equal(order.diagnostics[0]?.code, "orphan_fabric_assignment");
}

// Duplicate assignment keys are blocked before dedupe
{
  const step1 = selection(["shirt"]);
  const fabricState = fabricStateWithAssignments([
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
  const authoritativeKeys = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
  }).map((occurrence) => occurrence.garmentKey);
  const integrity = validateRawFabricAssignments({
    authoritativeOccurrenceKeys: new Set(authoritativeKeys),
    fabricAllocationState: fabricState,
  });
  assert.equal(integrity.diagnostics[0]?.code, "duplicate_assignment_key");
}

// Valid additional occurrence from construction ledger
{
  const step1 = selection(["shirt", "trouser"]);
  const additionalState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    additionalGarmentConstructionState: additionalState,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "base:trouser", "additional:shirt:1"],
  );
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
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    fabricAllocationState: fabricState,
    additionalGarmentConstructionState: additionalState,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
}

// Adaptable missing-garment order keeps gown from Step 1
{
  const step1 = selection(["shirt", "trouser", "full_length_gown"]);
  let fabricState = FabricAllocationStateEngine.initialize();
  const assign = assignSameFabricProductToGarments({
    state: fabricState,
    garmentTypeSelection: step1,
    fabricCode: "FAB-A",
    garmentKeys: ["base:shirt", "base:trouser"],
  });
  assert.equal(assign.status, "assigned");
  fabricState = assign.state;
  const gownAssign = assignSameFabricProductToGarments({
    state: fabricState,
    garmentTypeSelection: step1,
    fabricCode: "FAB-A",
    garmentKeys: ["base:full_length_gown"],
  });
  assert.equal(gownAssign.status, "assigned");
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    designSource: createCatalogDesignSource(styleShirtTrouserOnly.id),
    selectedStyle: styleShirtTrouserOnly,
    fabricAllocationState: gownAssign.state,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  assert.equal(order.status === "resolved" ? order.physicalOccurrences.length : 0, 3);
}

// Uploaded Step 1 subset is blocked everywhere
{
  const step1 = selection(["shirt", "trouser", "full_length_gown"]);
  const uploaded = createUploadedDesignSource({
    uploadReference,
    demographic: "male",
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
  });
  const readiness = evaluateAuthoritativeUploadedDesignReadiness({
    uploadInput: {
      uploadReference,
      fabricCapacityComposition: uploaded.fabricCapacityComposition,
      demographic: "male",
    },
    step1GarmentTypes: step1.garmentTypes,
    designSource: uploaded,
    confirmedDesignSourceKey: uploaded.sourceKey,
    selectedFabricCode: "FAB-A",
    priceActivatedFabricCode: "FAB-A",
  });
  assert.equal(readiness.isReady, false);
  assert.equal(readiness.isProgressionReady, false);
  assert.equal(readiness.isPricingEligible, false);
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    designSource: uploaded,
    confirmedDesignSourceKey: uploaded.sourceKey,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "blocked");
}

// Final parity only required when fabric is complete
{
  const step1 = selection(["shirt", "trouser"]);
  const partialFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const authoritativeKeys = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
  }).map((occurrence) => occurrence.garmentKey);
  assert.equal(
    validateFinalPhysicalOccurrenceAssignmentParity({
      authoritativeOccurrenceKeys: authoritativeKeys,
      fabricAllocationState: partialFabric,
    }).length,
    1,
  );
}

// Style reference does not add physical gown when Step 1 is shirt + trouser
{
  const step1 = selection(["shirt", "trouser"]);
  let fabricState = FabricAllocationStateEngine.initialize();
  const firstAssign = assignSameFabricProductToGarments({
    state: fabricState,
    garmentTypeSelection: step1,
    fabricCode: "FAB-A",
    garmentKeys: ["base:shirt", "base:trouser"],
  });
  assert.equal(firstAssign.status, "assigned");
  fabricState = firstAssign.state;
  const styleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: styleShirtTrouserGown.id,
    styles: [styleShirtTrouserGown],
    garmentTypeSelection: step1,
  });
  const occurrences = projectAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    fabricAllocationState: fabricState,
  });
  assert.equal(occurrences.length, 2);
  assert.ok(
    !occurrences.some((occurrence) => occurrence.garmentType === "full_length_gown"),
  );
  assert.equal(styleSelection.status, "selected");
}

// Style switching must not mutate Fabric allocation state
{
  const step1 = selection(["shirt", "trouser", "full_length_gown"]);
  const fabricState = fabricStateWithMultipleAllocations();
  const fabricSnapshot = cloneFabricAllocationState(fabricState);
  const exactStyle = reconcileFutureDesignStyleSelection({
    selectedStyleId: styleShirtTrouserGown.id,
    styles: [styleShirtTrouserGown, styleAdaptableShirtTrouserGown],
    garmentTypeSelection: step1,
  });
  assert.equal(exactStyle.status, "selected");
  assert.deepEqual(fabricState, fabricSnapshot);
  const adaptableStyle = reconcileFutureDesignStyleSelection({
    selectedStyleId: styleAdaptableShirtTrouserGown.id,
    styles: [styleShirtTrouserGown, styleAdaptableShirtTrouserGown],
    garmentTypeSelection: step1,
  });
  assert.equal(adaptableStyle.status, "selected");
  assert.deepEqual(fabricState, fabricSnapshot);
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    designSource: createCatalogDesignSource(styleAdaptableShirtTrouserGown.id),
    selectedStyle: styleAdaptableShirtTrouserGown,
    fabricAllocationState: fabricState,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  assert.deepEqual(
    order.physicalOccurrences.map((occurrence) => occurrence.garmentKey).sort(),
    ["base:full_length_gown", "base:shirt", "base:trouser"],
  );
  assert.deepEqual(fabricState, fabricSnapshot);
}

// Uploaded base + Step 4 additional occurrence share the same ledger path
{
  const step1 = selection(["shirt"]);
  const uploaded = createUploadedDesignSource({
    uploadReference,
    demographic: "male",
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  });
  const additionalState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    uploadedCompositionSpecs: uploaded.fabricCapacityComposition,
    additionalGarmentConstructionState: additionalState,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey),
    ["base:shirt", "additional:shirt:1"],
  );
  const partialFabric = fabricStateWithAssignments([
    {
      garmentKey: "base:shirt",
      code: "BASE_SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ]);
  const order = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection: step1,
    designSource: uploaded,
    confirmedDesignSourceKey: uploaded.sourceKey,
    additionalGarmentConstructionState: additionalState,
    fabricAllocationState: partialFabric,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(order.status, "resolved");
  assert.equal(order.physicalOccurrences.length, 2);
}

// Upload composition extra and Step 4 additional remain distinct
{
  const step1 = selection(["shirt"]);
  const uploadReferenceWithGown = createCustomerDesignUploadReference({
    ownerUid: "authority-test-gown",
    designReferenceId: "authority-upload-gown",
    mimeType: "image/png",
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  const uploaded = createUploadedDesignSource({
    uploadReference: uploadReferenceWithGown,
    demographic: "male",
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("full_length_gown"),
    ],
  });
  const additionalState = additionalConstruction("additional:shirt:1", "shirt", 7000);
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "uploaded",
    step1GarmentTypeSelection: step1,
    effectiveGarmentTypeSelection: step1,
    uploadedCompositionSpecs: uploaded.fabricCapacityComposition,
    additionalGarmentConstructionState: additionalState,
  });
  assert.deepEqual(
    occurrences.map((occurrence) => occurrence.garmentKey).sort(),
    ["additional:shirt:1", "base:full_length_gown", "base:shirt"],
  );
}

console.log("PASS: authoritative physical order resolver");
