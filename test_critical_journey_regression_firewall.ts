import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import {
  createCatalogueAdditionalGarmentSelection,
  projectCatalogueStep1PhysicalOccurrences,
} from "./src/utils/additionalGarmentDomain";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  getFutureFabricStageCompletion,
  prepareHydratedFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import {
  applyDesignStyleStepLedgerToHydration,
  assignCatalogueStyleThroughStepRuntime,
} from "./src/utils/designStyleStepRuntime";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { resolveFutureStageCorrection } from "./src/utils/resolveFutureStageCorrection";
import {
  createDesignStyleStepTestModel,
  type DesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

/**
 * Critical journey firewall: the released Design Studio depends on exact
 * physical occurrence keys through Fabric, Design Style, Steps 4/5, Summary,
 * and Payment. Keep this suite contract-oriented: it deliberately reuses the
 * released stage helpers instead of reproducing their algorithms.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: "male",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const fabric = (code: string): Fabric => ({
  code,
  name: `Firewall ${code}`,
  description: "Critical journey fixture fabric",
  color: "Green",
  colorHex: "#0A4A33",
  category: "Test",
  stockStatus: "IN_STOCK",
  price: 10,
  priceMultiplier: 1,
});

const fabrics = [fabric("FAB-BASE"), fabric("FAB-ADDITIONAL")];

const style = (id: string): StyleCategory => ({
  id,
  name: `Firewall ${id}`,
  description: "Published occurrence-scoped test style",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
});

const styleFor = (model: DesignStyleStepTestModel, styleId: string) => {
  const request = model.catalogueEntries.find((entry) => entry.style.id === styleId)
    ?.request;
  assert.ok(request, `Expected published ${styleId} for the active occurrence`);
  return request;
};

const assignStyle = (model: DesignStyleStepTestModel, styleId: string) => {
  assert.ok(model.hydration.ledger, "Design Style ledger must be hydrated");
  assert.ok(model.activeTarget, "An exact active occurrence is required");
  const result = assignCatalogueStyleThroughStepRuntime({
    ledger: model.hydration.ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    authority: model.authority,
    request: styleFor(model, styleId),
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
  assert.equal(result.status, "applied");
  return applyDesignStyleStepLedgerToHydration({
    hydration: model.hydration,
    ledger: result.ledger,
    activeOccurrences: model.occurrences,
    authority: model.authority,
  });
};

const fabricCodeFor = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  garmentKey: string,
): string | null =>
  state.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some((assignment) => assignment.garmentKey === garmentKey),
  )?.fabricCode ?? null;

const catalogStyleIdFor = (
  model: DesignStyleStepTestModel,
  garmentKey: string,
): string | null => {
  const assignment = model.hydration.ledger?.assignmentsByGarmentKey[garmentKey];
  return assignment?.sourceKind === "catalog" ? assignment.catalogStyleId : null;
};

// Journey A: normal Step 1 -> Fabric -> Design Style transition retains the
// same canonical physical occurrence, and Fabric completion unlocks Step 3.
{
  const step1 = selection(["shirt"]);
  const occurrences = projectCatalogueStep1PhysicalOccurrences(["shirt"]);
  const garmentKey = occurrences[0]!.garmentKey;
  const fabricResult = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: step1,
    garmentKey,
    fabricCode: "FAB-BASE",
    fabrics,
    requiredPhysicalOccurrences: occurrences,
  });
  assert.equal(fabricResult.status, "assigned");
  assert.equal(fabricCodeFor(fabricResult.state, garmentKey), "FAB-BASE");
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: fabricResult.state,
      fabrics,
      requiredPhysicalOccurrences: occurrences,
    }).isComplete,
    true,
    "a valid exact Fabric assignment must complete the normal Step 2 flow",
  );

  const styleOccurrences = occurrences.map((occurrence, index) => ({
    ...occurrence,
    occurrenceGeneration: index + 1,
  }));
  const designModel = createDesignStyleStepTestModel({
    styles: [style("style-base")],
    garmentTypeSelection: step1,
    occurrences: styleOccurrences,
  });
  const styled = assignStyle(designModel, "style-base");
  assert.equal(
    styled.ledger?.assignmentsByGarmentKey[garmentKey]?.sourceKind,
    "catalog",
  );
  assert.equal(
    styled.ledger?.assignmentsByGarmentKey[garmentKey]?.catalogStyleId,
    "style-base",
  );
}

// Journeys B, C, D, F, and J: an Additional Garment gets a distinct canonical
// key and Fabric, repeated same-type occurrences retain independent Design
// Styles, and a persisted remount never lets legacy scalar state replace them.
{
  const step1 = selection(["shirt"]);
  const base = projectCatalogueStep1PhysicalOccurrences(["shirt"])[0]!;
  const additionalSelection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: [base],
    authorizedOccurrenceKeys: [base.garmentKey],
  });
  assert.equal(additionalSelection.status, "resolved");
  if (additionalSelection.status !== "resolved") throw new Error("UNREACHABLE");
  const additional = {
    garmentKey: additionalSelection.selection.garmentSpec!.key,
    garmentType: "shirt" as const,
    sourceRole: "additional" as const,
    fabricUnits: 1,
  };
  assert.equal(additional.garmentKey, "additional:shirt:1");

  const normalOnly = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: step1,
    garmentKey: base.garmentKey,
    fabricCode: "FAB-BASE",
    fabrics,
    requiredPhysicalOccurrences: [base],
  });
  assert.equal(normalOnly.status, "assigned");
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: normalOnly.state,
      fabrics,
      requiredPhysicalOccurrences: [base],
    }).isComplete,
    true,
    "the normal Step 2 flow must not inherit an Additional Garment requirement",
  );

  const missingAdditional = getFutureFabricStageCompletion({
    garmentTypeSelection: step1,
    fabricAllocationState: normalOnly.state,
    fabrics,
    requiredPhysicalOccurrences: [base, additional],
  });
  assert.equal(missingAdditional.isComplete, false);
  assert.ok(
    missingAdditional.blockers.some(
      (blocker) => blocker.code === "GARMENT_ASSIGNMENT_REQUIRED" && blocker.garmentKey === additional.garmentKey,
    ),
  );

  const additionalFabric = assignFutureFabricToGarment({
    state: normalOnly.state,
    garmentTypeSelection: step1,
    garmentKey: additional.garmentKey,
    fabricCode: "FAB-ADDITIONAL",
    fabrics,
    requiredPhysicalOccurrences: [base, additional],
  });
  assert.equal(additionalFabric.status, "assigned");
  assert.equal(fabricCodeFor(additionalFabric.state, base.garmentKey), "FAB-BASE");
  assert.equal(
    fabricCodeFor(additionalFabric.state, additional.garmentKey),
    "FAB-ADDITIONAL",
    "Additional Garment Fabric must not overwrite the same-type base occurrence",
  );
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: additionalFabric.state,
      fabrics,
      requiredPhysicalOccurrences: [base, additional],
    }).isComplete,
    true,
    "the exact completed set must not report false Fabric attention",
  );
  const additionalFabricRemount = prepareHydratedFabricAllocationState({
    rawState: additionalFabric.state,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: new Set([base.garmentKey, additional.garmentKey]),
    requiredPhysicalOccurrences: [base, additional],
  });
  assert.equal(additionalFabricRemount.integrity.hasBlockingDiagnostics, false);
  assert.equal(
    fabricCodeFor(additionalFabricRemount.reconciledState, base.garmentKey),
    "FAB-BASE",
  );
  assert.equal(
    fabricCodeFor(additionalFabricRemount.reconciledState, additional.garmentKey),
    "FAB-ADDITIONAL",
  );

  const styleOccurrences = [
    { ...base, occurrenceGeneration: 1 },
    { ...additional, occurrenceGeneration: 2 },
  ];
  const initial = createDesignStyleStepTestModel({
    styles: [style("style-base"), style("style-additional")],
    garmentTypeSelection: step1,
    occurrences: styleOccurrences,
  });
  const baseHydration = assignStyle(initial, "style-base");
  const additionalModel = createDesignStyleStepTestModel({
    styles: [style("style-base"), style("style-additional")],
    garmentTypeSelection: step1,
    occurrences: styleOccurrences,
    rawDraft: { designStyleAssignmentDraft: baseHydration.envelope },
    activeTarget: {
      garmentKey: additional.garmentKey,
      occurrenceToken: `${additional.garmentKey}@2`,
    },
  });
  const completeHydration = assignStyle(additionalModel, "style-additional");
  const remounted = createDesignStyleStepTestModel({
    styles: [style("style-base"), style("style-additional")],
    garmentTypeSelection: step1,
    occurrences: styleOccurrences,
    rawDraft: {
      designStyleAssignmentDraft: completeHydration.envelope,
      selectedStyleId: "legacy-scalar-must-not-displace-occurrence-authority",
    },
  });
  assert.deepEqual(
    Object.keys(remounted.hydration.ledger?.assignmentsByGarmentKey ?? {}).sort(),
    [additional.garmentKey, base.garmentKey].sort(),
  );
  assert.equal(catalogStyleIdFor(remounted, base.garmentKey), "style-base");
  assert.equal(
    catalogStyleIdFor(remounted, additional.garmentKey),
    "style-additional",
  );
  assert.equal(remounted.projection.isComplete, true);

  assert.equal(
    resolveFutureStageCorrection({
      currentStageId: "personalized_additions",
      garmentTypeComplete: true,
      fabricComplete: false,
      designSourceReady: true,
      customDetailsReady: true,
      personalizedAdditionsReady: true,
      measurementUnlocked: false,
      summaryUnlocked: false,
      inlineAdditionalGarmentFabricTransaction: { garmentKey: additional.garmentKey },
    }),
    null,
    "the Additional Garment Fabric detour must keep Step 5 mounted",
  );
}

// Journey E and the removed-occurrence side of Journey J: valid hydrated
// assignments remain visible; duplicate raw rows remain strict/preserved; an
// orphaned removed occurrence is reconciled out and cannot hold Fabric open.
{
  const step1 = selection(["shirt"]);
  const base = projectCatalogueStep1PhysicalOccurrences(["shirt"])[0]!;
  const authoritativeKeys = new Set([base.garmentKey]);
  const valid = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: step1,
    garmentKey: base.garmentKey,
    fabricCode: "FAB-BASE",
    fabrics,
    requiredPhysicalOccurrences: [base],
  });
  assert.equal(valid.status, "assigned");
  const healthyReload = prepareHydratedFabricAllocationState({
    rawState: valid.state,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: authoritativeKeys,
    requiredPhysicalOccurrences: [base],
  });
  assert.equal(healthyReload.integrity.hasBlockingDiagnostics, false);
  assert.equal(fabricCodeFor(healthyReload.reconciledState, base.garmentKey), "FAB-BASE");

  const duplicateRaw = {
    ...valid.state,
    fabricAllocations: [
      ...valid.state.fabricAllocations,
      {
        allocationId: "stale-duplicate-row",
        fabricCode: "FAB-ADDITIONAL",
        garmentAssignments: structuredClone(valid.state.fabricAllocations[0]!.garmentAssignments),
      },
    ],
  };
  const duplicateReload = prepareHydratedFabricAllocationState({
    rawState: duplicateRaw,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: authoritativeKeys,
    requiredPhysicalOccurrences: [base],
  });
  assert.equal(duplicateReload.integrity.hasBlockingDiagnostics, true);
  assert.ok(
    duplicateReload.integrity.diagnostics.some(
      (diagnostic) => diagnostic.code === "duplicate_assignment_key" && diagnostic.garmentKey === base.garmentKey,
    ),
  );
  assert.equal(duplicateReload.preservedRawFabricAllocations?.length, 2);

  const staleRemovedRaw: FabricAllocationState = {
    ...valid.state,
    fabricAllocations: [
      ...valid.state.fabricAllocations,
      {
        allocationId: "stale-removed-occurrence",
        fabricCode: "FAB-ADDITIONAL",
        garmentAssignments: [{
          garmentKey: "additional:shirt:99",
          code: "ADDITIONAL_SHIRT_99",
          garmentType: "shirt" as const,
          fabricUnits: 1 as const,
          sourceRole: "additional" as const,
        }],
      },
    ],
  };
  const staleRemovedReload = prepareHydratedFabricAllocationState({
    rawState: staleRemovedRaw,
    garmentTypeSelection: step1,
    authoritativeOccurrenceKeys: authoritativeKeys,
    requiredPhysicalOccurrences: [base],
  });
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: step1,
      fabricAllocationState: staleRemovedReload.reconciledState,
      fabrics,
      requiredPhysicalOccurrences: [base],
    }).isComplete,
    true,
    "a reconciled removed occurrence must not block the current exact set",
  );
}

// Journeys G, H, and I: ownership and mounted Summary -> Payment continuity
// remain intentionally delegated to their existing mounted contracts. These
// source-level integration anchors prevent a cross-stage prop regression while
// the focused mounted suites verify the rendered rows and totals.
{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const detailsSource = readFileSync("src/components/DormantFutureCustomDetailsStep.tsx", "utf8");
  assert.match(studioSource, /stage=\{futureStageId\}/);
  assert.match(studioSource, /orderSummary=\{\s*embedPersistentLiveOrderSummary \? liveOrderSummaryCard : null\s*\}/);
  assert.match(studioSource, /setFutureStageId\("personalized_additions"\)/);
  assert.match(detailsSource, /data-step5-garment-context/);
  assert.match(detailsSource, /context\.sourceRole === "additional"/);
  assert.match(
    detailsSource,
    /isCustomDetailsStage && onChangeAdditionalGarmentFabric/,
    "Fabric reassignment must remain unavailable in Step 5",
  );
  assert.doesNotMatch(detailsSource, /GARMENTS IN THIS ORDER/);
}

console.log("PASS: critical Design Studio journey regression firewall");
