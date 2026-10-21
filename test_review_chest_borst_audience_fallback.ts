import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  CustomDetailDemographic,
  FabricGarmentType,
  GarmentTypeStepSelection,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  createEmptyWearerOrder,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  updateWearerMeasurement,
  wearerPublicLabel,
} from "./src/utils/wearerOrder";

/**
 * Xavier (2026-10-20): Payment Review and My Orders must word Chest / Borst
 * exactly like Step 7 and Summary. Step 7 measures a dress / skirt / bum shorts
 * on a Male order with the standard (unisex) sizing, so its fields read
 * "Chest / Borst"; the reviews read "Chest" from the raw Male audience.
 * Standing rule kept: Chest for male garments, Borst for female garments.
 */

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const CHEST_IDS = new Set([
  "chest_bust_circumference",
  "under_bust_circumference",
  "shoulder_to_under_bust_length",
]);

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

const reconcileOrder = (order: WearerOrderStateV2, selection: GarmentTypeStepSelection) => {
  const garments = garmentsOf(selection);
  return reconcileWearerOrder({
    order,
    garmentKeys: garments.map((garment) => garment.garmentKey),
    compatibilityDemographic: selection.demographic,
    garments,
    garmentTypeSelection: selection,
  });
};

const runtimes = (order: WearerOrderStateV2, selection: GarmentTypeStepSelection) =>
  planWearerOrderMeasurements({
    order,
    garmentTypeSelection: selection,
    physicalGarments: garmentsOf(selection),
  });

const measureEveryone = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
  route: SelectedMeasurementMethod,
): WearerOrderStateV2 => {
  let next = order;
  for (const wearer of order.wearers) {
    let state = createEmptyFutureMeasurementState(route, "cm");
    const planned = runtimes(updateWearerMeasurement(next, wearer.wearerId, state), selection)
      .find((runtime) => runtime.wearerId === wearer.wearerId)!;
    planned.plan.requirements
      .filter((requirement) => requirement.directInput)
      .forEach((requirement) => {
        state = setFutureMeasurementInput({
          state,
          requirement,
          displayValue: requirement.measurementId === "total_height" ? 172 : 90,
        });
      });
    const reconciled = runtimes(updateWearerMeasurement(next, wearer.wearerId, state), selection)
      .find((runtime) => runtime.wearerId === wearer.wearerId)!;
    next = updateWearerMeasurement(next, wearer.wearerId, reconciled.measurement);
  }
  return next;
};

/** Step 7 / Summary chest wording per person (from the per-person plan). */
const step7ChestLabels = (order: WearerOrderStateV2, selection: GarmentTypeStepSelection) =>
  new Map(
    runtimes(order, selection).map((runtime) => [
      runtime.wearerId,
      new Set(
        runtime.plan.requirements
          .filter((requirement) => CHEST_IDS.has(requirement.measurementId))
          .map((requirement) => requirement.definition.customerLabel),
      ),
    ]),
  );

/** Payment Review / My Orders chest wording per person. */
const reviewChestLabels = (
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
  audience: CustomDetailDemographic | null,
) => {
  // Exactly what the order candidate stores per garment (raw Step 1 audience).
  const garments = garmentsOf(selection).map((garment) => ({
    garmentKey: garment.garmentKey,
    garmentType: garment.garmentType,
    label: garment.garmentType,
    demographic: audience,
  }));
  const groups = getFuturePaymentReviewMeasurementGroups({ measurements: order, garments });
  const byWearer = new Map<string, Set<string>>();
  for (const wearer of order.wearers) {
    const prefix = wearerPublicLabel(wearer.displayName, wearer.presentationOrder);
    const owned = Object.entries(order.assignmentByGarmentKey)
      .filter(([, wearerId]) => wearerId === wearer.wearerId)
      .map(([garmentKey]) => garmentKey);
    const mine = order.wearers.length === 1
      ? groups
      : groups.filter((group) =>
          group.garmentKey === null
            ? group.title.startsWith(`${prefix} — `)
            : owned.includes(group.garmentKey),
        );
    byWearer.set(
      wearer.wearerId,
      new Set(
        mine.flatMap((group) =>
          group.items
            .filter((item) => CHEST_IDS.has(item.measurementId))
            .map((item) => item.label),
        ),
      ),
    );
  }
  return byWearer;
};

const assertSameWording = (
  label: string,
  order: WearerOrderStateV2,
  selection: GarmentTypeStepSelection,
  audience: CustomDetailDemographic | null,
  expected: Record<string, string[]>,
) => {
  const step7 = step7ChestLabels(order, selection);
  const review = reviewChestLabels(order, selection, audience);
  for (const wearer of order.wearers) {
    const step7Labels = [...(step7.get(wearer.wearerId) || [])].sort();
    const reviewLabels = [...(review.get(wearer.wearerId) || [])].sort();
    assert.ok(step7Labels.length > 0, `${label}: Step 7 asks a chest field`);
    assert.deepEqual(
      reviewLabels,
      step7Labels,
      `${label}: Payment Review / My Orders wording matches Step 7 for ${wearer.displayName || "person 1"}`,
    );
    const want = expected[wearer.wearerId];
    if (want) assert.deepEqual(reviewLabels, [...want].sort(), `${label}: expected wording`);
  }
};

const solo = (
  types: FabricGarmentType[],
  demographics: CustomDetailDemographic[],
  route: SelectedMeasurementMethod,
) => {
  const selection = selectionFor(types, demographics);
  const order = measureEveryone(reconcileOrder(createEmptyWearerOrder(), selection), selection, route);
  return { selection, order };
};

// 1. Male order with a dress (and a shirt): Step 7 uses the standard sizing for
//    this person, so every chest field reads "Chest / Borst"; the reviews must too.
for (const route of ["low_risk", "medium_risk"] as const) {
  for (const types of [["dress", "shirt"], ["dress"]] as FabricGarmentType[][]) {
    const { selection, order } = solo(types, ["male"], route);
    assertSameWording(`Male ${types.join("+")} ${route}`, order, selection, "male", {});
    const labels = [...reviewChestLabels(order, selection, "male").values()][0]!;
    assert.ok(labels.has("Chest / Borst Circumference"), `Male ${types.join("+")} ${route}: Chest / Borst`);
    assert.equal(labels.has("Chest Circumference"), false, `Male ${types.join("+")} ${route}: not plain Chest`);
  }
}

// 2. Standing rule unchanged: Male shirt-only order reads Chest, Female dress reads Borst,
//    no audience reads Chest / Borst.
{
  const male = solo(["shirt"], ["male"], "low_risk");
  assertSameWording("Male shirt", male.order, male.selection, "male", {
    [male.order.wearers[0]!.wearerId]: ["Chest Circumference"],
  });
  const female = solo(["dress"], ["female"], "low_risk");
  const femaleLabels = [...reviewChestLabels(female.order, female.selection, "female").values()][0]!;
  assertSameWording("Female dress", female.order, female.selection, "female", {});
  assert.ok([...femaleLabels].every((value) => /Borst/.test(value) && !/Chest/.test(value)));
  const none = solo(["dress", "shirt"], [], "low_risk");
  assertSameWording("No audience dress+shirt", none.order, none.selection, null, {});
}

// 3. Two people on a Male order: person 1 has the Shirt (Chest), person 2 the Dress
//    (Chest / Borst, standard sizing) — each person worded like their Step 7 fields.
{
  const types: FabricGarmentType[] = ["shirt", "dress"];
  const selection = selectionFor(types, ["male"]);
  const garments = garmentsOf(selection);
  let order = reconcileOrder(createEmptyWearerOrder(), selection);
  const first = order.wearers[0]!.wearerId;
  const added = addWearer({ order, physicalGarmentCount: garments.length, displayName: "Ada", fitContext: null });
  assert.equal(added.status, "updated");
  order = added.order;
  const second = order.wearers.find((wearer) => wearer.wearerId !== first)!.wearerId;
  for (const [garmentKey, wearerId] of [["base:shirt", first], ["base:dress", second]] as const) {
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
  order = measureEveryone(reconcileOrder(order, selection), selection, "low_risk");
  assertSameWording("Two people, Male order", order, selection, "male", {
    [first]: ["Chest Circumference"],
  });
  const personTwo = reviewChestLabels(order, selection, "male").get(second)!;
  assert.ok(personTwo.has("Chest / Borst Circumference"), "person 2's dress reads Chest / Borst");
}

console.log("PASS: Payment Review / My Orders Chest / Borst wording matches Step 7 and Summary");
