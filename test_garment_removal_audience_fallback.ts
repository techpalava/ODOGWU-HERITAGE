import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  CustomDetailDemographic,
  FabricAllocationState,
  FabricGarmentType,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  SelectedMeasurementMethod,
  StyleCategory,
  WearerOrderStateV2,
} from "./src/types";
import { createEmptyAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import { createEmptyFutureShippingState } from "./src/utils/designStudioFutureShipping";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import {
  removeFuturePhysicalGarmentOccurrence,
  resolveFuturePhysicalGarmentRemovalAuthority,
  type RemoveFuturePhysicalGarmentOccurrenceInput,
} from "./src/utils/midProcessGarmentRemoval";
import {
  addWearer,
  assignGarmentToWearer,
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  removeGarmentFromWearerOrder,
  updateWearerMeasurement,
  type WearerMeasurementRuntime,
} from "./src/utils/wearerOrder";

/**
 * Xavier (2026-10-20): removing a garment mid-order must plan the remaining
 * measurements exactly like Step 7 does, including the standard (unisex)
 * sizing fallback for a Male or no-audience order with a dress / skirt /
 * bum shorts. The remaining garment's values must survive the removal.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const selectionFor = (
  types: FabricGarmentType[],
  demographics: CustomDetailDemographic[],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as GarmentTypeStepSelection["garmentTypes"],
    selectedDemographics: demographics,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const garmentsOf = (selection: GarmentTypeStepSelection) =>
  getMeasurementPhysicalGarments({ garmentTypeSelection: selection });

const reconcileOrder = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
): WearerOrderStateV2 => {
  const garments = garmentsOf(selection);
  return reconcileWearerOrder({
    order,
    garmentKeys: garments.map((garment) => garment.garmentKey),
    compatibilityDemographic: selection.demographic,
    garments,
    garmentTypeSelection: selection,
  });
};

/** Step 7: the per-person planner the Studio renders with. */
const step7Runtimes = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
): WearerMeasurementRuntime[] =>
  planWearerOrderMeasurements({
    order,
    garmentTypeSelection: selection,
    physicalGarments: garmentsOf(selection),
  });

/** Fills every direct input Step 7 asks this person for. */
const measureWearer = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
  wearerId: string,
  route: SelectedMeasurementMethod,
): WearerOrderStateV2 => {
  let state = createEmptyFutureMeasurementState(route, "cm");
  const withRoute = updateWearerMeasurement(order, wearerId, state);
  const runtime = step7Runtimes(withRoute, selection).find(
    (candidate) => candidate.wearerId === wearerId,
  )!;
  runtime.plan.requirements
    .filter((requirement) => requirement.directInput)
    .forEach((requirement) => {
      state = setFutureMeasurementInput({
        state,
        requirement,
        displayValue: requirement.measurementId === "total_height" ? 172 : 90,
      });
    });
  const measured = updateWearerMeasurement(order, wearerId, state);
  const reconciled = step7Runtimes(measured, selection).find(
    (candidate) => candidate.wearerId === wearerId,
  )!;
  return updateWearerMeasurement(order, wearerId, reconciled.measurement);
};

const runtimeOf = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
  wearerId: string,
) =>
  step7Runtimes(order, selection).find(
    (candidate) => candidate.wearerId === wearerId,
  )!;

const removalInput = ({
  selection,
  types,
  targetGarmentKey,
  measurementState,
  measurementGarmentKeys,
}: {
  selection: GarmentTypeStepSelection;
  types: FabricGarmentType[];
  targetGarmentKey: string;
  measurementState: FutureMeasurementStateV1;
  measurementGarmentKeys?: readonly string[];
}): RemoveFuturePhysicalGarmentOccurrenceInput => {
  const style = {
    id: "style-audience-fallback",
    name: "Audience Fallback Style",
    description: "Removal test style",
    gender: "female",
    targetDemographic: "female",
    options: [],
    fabricCapacityComposition: types.map((garmentType) => ({
      ...createStyleBaseGarmentSpec(garmentType),
      key: `style-reference:${garmentType}`,
    })),
  } as unknown as StyleCategory;
  const designSource = createCatalogDesignSource(style.id)!;
  const fabricAllocationState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "allocation-a",
        fabricCode: "FAB-A",
        garmentAssignments: types.map((garmentType) => {
          const spec = createStyleBaseGarmentSpec(garmentType);
          return {
            garmentKey: spec.key,
            code: `GARMENT_${garmentType.toUpperCase()}`,
            garmentType,
            fabricUnits: spec.fabricUnits,
            garmentSpec: spec,
            sourceRole: "main" as const,
          };
        }),
      },
    ],
    activeAllocationId: "allocation-a",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const input = {
    targetGarmentKey,
    garmentTypeSelection: selection,
    designSource,
    selectedStyle: style,
    confirmedDesignSourceKey: designSource.sourceKey,
    uploadedCompositionMirror: [],
    uploadedAdditionalGarmentTypes: [],
    additionalGarmentConstructionState:
      createEmptyAdditionalGarmentConstructionState(),
    fabricAllocationState,
    garmentScopedCustomDetails: {
      schemaVersion: 1 as const,
      selectionsByGarmentKey: {},
      snapshotsByGarmentKey: {},
    },
    garmentScopedCustomDetailInputs: {
      schemaVersion: 1 as const,
      textByGarmentKey: {},
    },
    measurementState,
    ...(measurementGarmentKeys ? { measurementGarmentKeys } : {}),
    aiTryOnWorkflowState: { schemaVersion: 1 as const, status: "skipped" as const },
    shippingState: createEmptyFutureShippingState(),
    normalizedCustomDetailCatalog: catalog,
    aiTryOnPolicy: { gatewayAvailable: false, skipAllowed: true },
    pendingOperations: {
      protectedSourceMutationPending: false,
      pickerGarmentKey: null,
      additionalFabricTransactionGarmentKey: null,
      uploadOperationGeneration: null,
    },
  } as unknown as Omit<RemoveFuturePhysicalGarmentOccurrenceInput, "expectedAuthoritySignature">;
  const authority = resolveFuturePhysicalGarmentRemovalAuthority(input);
  assert.equal(authority.status, "resolved");
  if (authority.status !== "resolved") throw new Error("authority");
  return { ...input, expectedAuthoritySignature: authority.signature };
};

const remove = (input: RemoveFuturePhysicalGarmentOccurrenceInput) => {
  const result = removeFuturePhysicalGarmentOccurrence(input);
  assert.equal(result.status, "removed");
  if (result.status !== "removed") throw new Error("removal");
  return result;
};

const assertNoDuplicateOrRemovedFields = (
  runtime: WearerMeasurementRuntime,
  removedGarmentKey: string,
  label: string,
) => {
  const keys = runtime.plan.requirements.map((requirement) => requirement.key);
  assert.equal(new Set(keys).size, keys.length, `${label}: no duplicate fields`);
  assert.equal(
    runtime.plan.requirements.some(
      (requirement) => requirement.garmentKey === removedGarmentKey,
    ),
    false,
    `${label}: no fields for the removed garment`,
  );
};

// 1. Solo person: Male or no audience, Standard Dress + Shirt, dress measured on
//    every route (Height Only included). Removing the Shirt keeps the dress values
//    and the removal result matches what Step 7 calculates for the same order.
const ROUTES: SelectedMeasurementMethod[] = [
  "low_risk",
  "medium_risk",
  "high_risk",
  "critical_risk",
  "sample_cloth",
];
const AUDIENCES: Array<[string, CustomDetailDemographic[]]> = [
  ["Male", ["male"]],
  ["no audience", []],
];
const SOLO_CASES: Array<{ types: FabricGarmentType[]; keep: string; target: string }> = [
  { types: ["dress", "shirt"], keep: "base:dress", target: "base:shirt" },
  { types: ["skirt", "shirt"], keep: "base:skirt", target: "base:shirt" },
  { types: ["bum_shorts", "shirt"], keep: "base:bum_shorts", target: "base:shirt" },
];

const PLAN_BLOCKERS = new Set<string>([
  "required_measurement_missing",
  "applicability_unresolved",
  "calculation_configuration_pending",
  "measurement_profile_unmapped",
]);

let soloChecks = 0;
for (const [audienceLabel, demographics] of AUDIENCES) {
  for (const { types, keep, target } of SOLO_CASES) {
    for (const route of ROUTES) {
      const label = `${audienceLabel} ${types.join("+")} ${route}`;
      const selection = selectionFor(types, demographics);
      let order = reconcileOrder(createEmptyWearerOrder(), selection);
      const wearerId = order.wearers[0]!.wearerId;
      order = measureWearer(order, selection, wearerId, route);
      const before = runtimeOf(order, selection, wearerId).measurement;
      assert.equal(before.calculationStatus, "complete", `${label}: measured before removal`);

      const result = remove(
        removalInput({
          selection,
          types,
          targetGarmentKey: target,
          measurementState: before,
        }),
      );
      const after = result.state.measurementState;

      // Customer-entered values for the remaining garment survive.
      assert.deepEqual(
        after.entered.byGarmentKey[keep],
        before.entered.byGarmentKey[keep],
        `${label}: entered values for ${keep} survive`,
      );
      assert.deepEqual(
        after.entered.shared,
        before.entered.shared,
        `${label}: shared values (height included) survive`,
      );
      // Height-based estimates for the remaining garment survive too.
      assert.deepEqual(
        after.derived.byGarmentKey[keep] || {},
        before.derived.byGarmentKey[keep] || {},
        `${label}: calculated values for ${keep} survive`,
      );
      assert.equal(after.calculationStatus, "complete", `${label}: still complete`);
      assert.deepEqual(
        after.diagnostics
          .filter((diagnostic) => PLAN_BLOCKERS.has(diagnostic.code))
          .map((diagnostic) => diagnostic.code),
        [],
        `${label}: no profile or missing-value blockers`,
      );

      // Same answer as Step 7 for the order after removal.
      const nextSelection = result.state.garmentTypeSelection;
      const nextOrder = reconcileOrder(
        removeGarmentFromWearerOrder(
          updateWearerMeasurement(order, wearerId, after),
          target,
        ),
        nextSelection,
      );
      const step7 = runtimeOf(nextOrder, nextSelection, wearerId);
      assert.deepEqual(after, step7.measurement, `${label}: matches Step 7`);
      assertNoDuplicateOrRemovedFields(step7, target, label);
      if (route === "critical_risk") {
        assert.equal(step7.plan.criticalRiskSupported, true, `${label}: Height Only stays available`);
      }
      soloChecks += 1;
    }
  }
}

// 2. A typed-but-invalid value on the remaining dress keeps its "invalid" flag.
{
  const types: FabricGarmentType[] = ["dress", "shirt"];
  const selection = selectionFor(types, ["male"]);
  let order = reconcileOrder(createEmptyWearerOrder(), selection);
  const wearerId = order.wearers[0]!.wearerId;
  order = measureWearer(order, selection, wearerId, "low_risk");
  const runtime = runtimeOf(order, selection, wearerId);
  const dressField = runtime.plan.requirements.find(
    (requirement) =>
      requirement.garmentKey === "base:dress" &&
      requirement.scope === "garment" &&
      requirement.directInput,
  )!;
  assert.ok(dressField, "dress has a garment-specific field");
  const invalid = setFutureMeasurementInput({
    state: runtime.measurement,
    requirement: dressField,
    displayValue: -1,
  });
  const result = remove(
    removalInput({
      selection,
      types,
      targetGarmentKey: "base:shirt",
      measurementState: invalid,
    }),
  );
  assert.ok(
    result.state.measurementState.invalidInputKeys.includes(dressField.key),
    "invalid flag on the remaining dress survives removal",
  );
  assert.equal(result.state.measurementState.calculationStatus, "invalid");
}

// 3. Removing the dress from a Male order goes back to Male sizing for the shirt,
//    exactly like Step 7 (the fallback is not sticky).
{
  const types: FabricGarmentType[] = ["dress", "shirt"];
  const selection = selectionFor(types, ["male"]);
  let order = reconcileOrder(createEmptyWearerOrder(), selection);
  const wearerId = order.wearers[0]!.wearerId;
  order = measureWearer(order, selection, wearerId, "medium_risk");
  const before = runtimeOf(order, selection, wearerId).measurement;
  const result = remove(
    removalInput({
      selection,
      types,
      targetGarmentKey: "base:dress",
      measurementState: before,
    }),
  );
  const nextSelection = result.state.garmentTypeSelection;
  const nextOrder = reconcileOrder(
    removeGarmentFromWearerOrder(
      updateWearerMeasurement(order, wearerId, result.state.measurementState),
      "base:dress",
    ),
    nextSelection,
  );
  const step7 = runtimeOf(nextOrder, nextSelection, wearerId);
  assert.deepEqual(result.state.measurementState, step7.measurement, "shirt-only Male order matches Step 7");
  assert.equal(step7.plan.audienceNotice ?? null, null, "no standard-sizing warning once the dress is gone");
  assertNoDuplicateOrRemovedFields(step7, "base:dress", "Male shirt after dress removal");
}

// 4. Two people on a Male order: person 1 has Shirt + Trouser, person 2 has the
//    Dress. Removing person 1's Trouser plans only person 1's garments (Male
//    sizing, no dress fields), like Step 7, and keeps person 1's values.
{
  const types: FabricGarmentType[] = ["shirt", "trouser", "dress"];
  const selection = selectionFor(types, ["male"]);
  const garments = garmentsOf(selection);
  let order = reconcileOrder(createEmptyWearerOrder(), selection);
  const first = order.wearers[0]!.wearerId;
  const added = addWearer({
    order,
    physicalGarmentCount: garments.length,
    displayName: "Ada",
    fitContext: null,
  });
  assert.equal(added.status, "updated");
  order = added.order;
  const second = order.wearers.find((wearer) => wearer.wearerId !== first)!.wearerId;
  for (const [garmentKey, wearerId] of [
    ["base:shirt", first],
    ["base:trouser", first],
    ["base:dress", second],
  ] as const) {
    const assigned = assignGarmentToWearer({
      order,
      garmentKey,
      wearerId,
      garment: garments.find((garment) => garment.garmentKey === garmentKey)!,
      garmentTypeSelection: selection,
    });
    assert.equal(assigned.status, "updated");
    order = assigned.order;
  }
  order = reconcileOrder(order, selection);
  order = measureWearer(order, selection, first, "high_risk");
  const firstRuntime = runtimeOf(order, selection, first);
  assert.equal(firstRuntime.measurement.calculationStatus, "complete");
  assert.deepEqual([...firstRuntime.garmentKeys].sort(), ["base:shirt", "base:trouser"]);

  const result = remove(
    removalInput({
      selection,
      types,
      targetGarmentKey: "base:trouser",
      measurementState: firstRuntime.measurement,
      measurementGarmentKeys: firstRuntime.garmentKeys,
    }),
  );
  const after = result.state.measurementState;
  assert.deepEqual(
    after.entered.byGarmentKey["base:shirt"],
    firstRuntime.measurement.entered.byGarmentKey["base:shirt"],
    "person 1 shirt values survive",
  );
  assert.equal(after.calculationStatus, "complete", "person 1 is still complete");
  assert.equal(
    after.diagnostics.some((diagnostic) => diagnostic.garmentKey === "base:dress"),
    false,
    "person 1 is never asked about person 2's dress",
  );
  const nextSelection = result.state.garmentTypeSelection;
  const nextOrder = reconcileOrder(
    removeGarmentFromWearerOrder(
      updateWearerMeasurement(order, first, after),
      "base:trouser",
    ),
    nextSelection,
  );
  const step7 = runtimeOf(nextOrder, nextSelection, first);
  assert.deepEqual(after, step7.measurement, "person 1 removal matches Step 7");
  assertNoDuplicateOrRemovedFields(step7, "base:trouser", "person 1 after trouser removal");
}

console.log(`garment removal audience fallback: ${soloChecks} solo route checks + invalid flag + Male return + two-person passed`);
