import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { GuestDesignDraft, GarmentTypeStepSelection } from "./src/types";
import { normalizeAuthenticatedFutureDraft } from "./src/services/authenticatedFutureDraftService";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import {
  getFuturePaymentReviewMeasurementGroups,
  getFuturePaymentReviewMeasurementHeader,
} from "./src/utils/designStudioFuturePaymentReview";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import {
  createEmptyFutureMeasurementState,
  getSampleClothProductionEquivalentCm,
  isFutureMeasurementStateV1,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { projectTailoringMeasurementReadout } from "./src/utils/tailoringMeasurementProjection";
import {
  addWearer,
  assignGarmentToWearer,
  classifyPersistedMeasurement,
  createWearerProfile,
  isWearerOrderMeasurementComplete,
  isWearerOrderStateV2,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  setWearerMeasurementRoute,
  shouldAcceptMeasurementAutosave,
  shouldReplacePersistedMeasurement,
  updateWearerMeasurement,
} from "./src/utils/wearerOrder";

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: "shirt_construction" | "trouser_fastening" | "dress_construction",
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

const selectionFor = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: GarmentTypeStepSelection["demographic"],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic,
  constructionByGarment: {
    ...(garmentTypes.includes("shirt")
      ? { shirt: construction("shirt", "shirt_std_short", "shirt_construction") }
      : {}),
    ...(garmentTypes.includes("trouser")
      ? { trouser: construction("trouser", "trouser_std", "trouser_fastening") }
      : {}),
    ...(garmentTypes.includes("dress")
      ? { dress: construction("dress", "dress_std_short", "dress_construction") }
      : {}),
  },
});

const emptyPlan = planMeasurementRequirements({
  route: null,
  garmentTypeSelection: selectionFor(["shirt"], "male"),
  physicalGarments: [],
});

const fillDirect = (
  state: ReturnType<typeof createEmptyFutureMeasurementState>,
  plan: ReturnType<typeof planMeasurementRequirements>,
  displayValueFor: (measurementId: string) => number,
) => {
  let next = state;
  for (const requirement of plan.requirements.filter((item) => item.directInput)) {
    next = setFutureMeasurementInput({
      state: next,
      requirement,
      displayValue: displayValueFor(requirement.measurementId),
    });
  }
  return reconcileFutureMeasurementState({ state: next, plan });
};

const guestShell = (
  futureMeasurementState: GuestDesignDraft["futureMeasurementState"],
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "measurement",
  currentStep: 7,
  garmentTypeSelection: selectionFor(["shirt"], "male"),
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: [] },
  futureMeasurementState,
  measurements: {
    height: 180,
    weight: 80,
    age: 40,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 16,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 42,
    isAiEstimated: false,
    unit: "inch",
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "",
  customerName: "Guest",
  customerEmail: "guest@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
  },
  shippingSnapshot: {},
  updatedAt: "2026-09-24T00:00:00.000Z",
});

const you = createWearerProfile({
  wearerId: "wearer-you",
  displayName: "You",
  fitContext: "male",
  presentationOrder: 0,
});
const friend = createWearerProfile({
  wearerId: "wearer-friend",
  displayName: "Friend",
  fitContext: "female",
  presentationOrder: 1,
});
const sameGenderFriend = createWearerProfile({
  wearerId: "wearer-friend-male",
  displayName: "Brother",
  fitContext: "male",
  presentationOrder: 1,
});

const mixedSelection = selectionFor(["shirt", "trouser", "dress"], "unisex");
const mixedGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
  { garmentKey: "base:trouser", garmentType: "trouser" as const },
  { garmentKey: "base:dress", garmentType: "dress" as const },
];
let mixed = reconcileWearerOrder({
  order: {
    schemaVersion: 2,
    wearers: [you, friend],
    assignmentByGarmentKey: {
      "base:shirt": you.wearerId,
      "base:trouser": you.wearerId,
      "base:dress": friend.wearerId,
    },
  },
  garmentKeys: mixedGarments.map((garment) => garment.garmentKey),
  compatibilityDemographic: "unisex",
  garments: mixedGarments,
  garmentTypeSelection: mixedSelection,
});
const mixedRuntimes = planWearerOrderMeasurements({
  order: mixed,
  garmentTypeSelection: mixedSelection,
  physicalGarments: mixedGarments,
});
const youRuntime = mixedRuntimes.find((runtime) => runtime.wearerId === you.wearerId);
const friendRuntime = mixedRuntimes.find((runtime) => runtime.wearerId === friend.wearerId);
assert.ok(youRuntime && friendRuntime);
assert.deepEqual(youRuntime.garmentKeys, ["base:shirt", "base:trouser"]);
assert.deepEqual(friendRuntime.garmentKeys, ["base:dress"]);
assert.equal(youRuntime.fitContext, "male");
assert.equal(friendRuntime.fitContext, "female");
const criticalSelection = selectionFor(["shirt", "dress"], "unisex");
const criticalRuntimes = planWearerOrderMeasurements({
  order: {
    schemaVersion: 2,
    wearers: [you, friend],
    assignmentByGarmentKey: {
      "base:shirt": you.wearerId,
      "base:dress": friend.wearerId,
    },
  },
  garmentTypeSelection: criticalSelection,
  physicalGarments: [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "base:dress", garmentType: "dress" },
  ],
});
const criticalYou = criticalRuntimes.find((runtime) => runtime.wearerId === you.wearerId);
const criticalFriend = criticalRuntimes.find((runtime) => runtime.wearerId === friend.wearerId);
assert.equal(criticalYou?.plan.criticalRiskSupported, true);
assert.equal(criticalFriend?.plan.criticalRiskSupported, false);
assert.equal(criticalYou?.garmentKeys.includes("base:dress"), false);
assert.equal(
  isWearerOrderMeasurementComplete({
    order: mixed,
    runtimes: mixedRuntimes,
    physicalGarmentKeys: mixedGarments.map((garment) => garment.garmentKey),
  }),
  false,
);

const sameGender = reconcileWearerOrder({
  order: {
    schemaVersion: 2,
    wearers: [you, sameGenderFriend],
    assignmentByGarmentKey: {
      "base:shirt": you.wearerId,
      "base:trouser": sameGenderFriend.wearerId,
    },
  },
  garmentKeys: ["base:shirt", "base:trouser"],
  compatibilityDemographic: "male",
  garments: mixedGarments.slice(0, 2),
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
});
assert.equal(sameGender.assignmentByGarmentKey["base:shirt"], you.wearerId);
assert.equal(sameGender.assignmentByGarmentKey["base:trouser"], sameGenderFriend.wearerId);
assert.equal(sameGender.wearers.every((wearer) => wearer.fitContext === "male"), true);

const repeated = reconcileWearerOrder({
  order: {
    schemaVersion: 2,
    wearers: [you, sameGenderFriend],
    assignmentByGarmentKey: {
      "base:shirt": you.wearerId,
      "additional:shirt:1": sameGenderFriend.wearerId,
    },
  },
  garmentKeys: ["base:shirt", "additional:shirt:1"],
  compatibilityDemographic: "male",
  garments: [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ],
  garmentTypeSelection: selectionFor(["shirt"], "male"),
});
assert.equal(repeated.assignmentByGarmentKey["base:shirt"], you.wearerId);
assert.equal(repeated.assignmentByGarmentKey["additional:shirt:1"], sameGenderFriend.wearerId);

const routed = setWearerMeasurementRoute(
  setWearerMeasurementRoute(repeated, you.wearerId, "low_risk"),
  sameGenderFriend.wearerId,
  "sample_cloth",
);
assert.equal(
  routed.wearers.find((wearer) => wearer.wearerId === you.wearerId)?.measurement.route,
  "low_risk",
);
assert.equal(
  routed.wearers.find((wearer) => wearer.wearerId === sameGenderFriend.wearerId)?.measurement.route,
  "sample_cloth",
);

const shirtPlan = planMeasurementRequirements({
  route: "sample_cloth",
  garmentTypeSelection: { ...selectionFor(["shirt"], "male"), demographic: "male" },
  physicalGarments: [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ],
});
const sharedSample = fillDirect(
  createEmptyFutureMeasurementState("sample_cloth", "inch"),
  shirtPlan,
  (measurementId) => (measurementId === "chest_bust_circumference" ? 20 : 10),
);
assert.equal(
  sharedSample.derived.shared.chest_bust_circumference?.valueCm,
  getSampleClothProductionEquivalentCm(
    sharedSample.entered.shared.chest_bust_circumference?.valueCm || 0,
  ),
);
assert.equal(sharedSample.derived.byGarmentKey["base:shirt"]?.chest_bust_circumference, undefined);
assert.equal(
  sharedSample.derived.byGarmentKey["additional:shirt:1"]?.chest_bust_circumference,
  undefined,
);

const dressPlan = planMeasurementRequirements({
  route: "sample_cloth",
  garmentTypeSelection: { ...selectionFor(["dress"], "female"), demographic: "female" },
  physicalGarments: [{ garmentKey: "base:dress", garmentType: "dress" }],
});
const friendSample = fillDirect(
  createEmptyFutureMeasurementState("sample_cloth", "inch"),
  dressPlan,
  (measurementId) => (measurementId === "chest_bust_circumference" ? 18 : 10),
);
assert.notEqual(
  sharedSample.entered.shared.chest_bust_circumference?.valueCm,
  friendSample.entered.shared.chest_bust_circumference?.valueCm,
);
assert.equal(
  friendSample.derived.shared.chest_bust_circumference?.valueCm,
  getSampleClothProductionEquivalentCm(
    friendSample.entered.shared.chest_bust_circumference?.valueCm || 0,
  ),
);
assert.notEqual(
  sharedSample.derived.shared.chest_bust_circumference?.valueCm,
  friendSample.derived.shared.chest_bust_circumference?.valueCm,
);

const lowShirtPlan = planMeasurementRequirements({
  route: "low_risk",
  garmentTypeSelection: { ...selectionFor(["shirt"], "male"), demographic: "male" },
  physicalGarments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
});
let completeShirt = fillDirect(
  createEmptyFutureMeasurementState("low_risk", "cm"),
  lowShirtPlan,
  () => 40,
);
assert.equal(completeShirt.calculationStatus, "complete");
completeShirt = {
  ...completeShirt,
  entered: {
    ...completeShirt.entered,
      shared: {
      ...completeShirt.entered.shared,
      total_height: { valueCm: 180, provenance: "customer_entered" },
    },
    byGarmentKey: {
      ...completeShirt.entered.byGarmentKey,
      "base:shirt": {
        ...(completeShirt.entered.byGarmentKey["base:shirt"] || {}),
        shirt_length_standard: { valueCm: 70, provenance: "customer_entered" },
      },
    },
  },
};
const wearerB = createWearerProfile({
  wearerId: "wearer-b",
  displayName: "Friend",
  fitContext: "male",
  presentationOrder: 1,
  measurement: {
    ...createEmptyFutureMeasurementState("low_risk", "cm"),
    entered: {
      shared: { neck_circumference: { valueCm: 36, provenance: "customer_entered" } },
      byGarmentKey: {},
    },
  },
});
let completedOrder = reconcileWearerOrder({
  order: {
    schemaVersion: 2,
    wearers: [
      { ...you, measurement: completeShirt },
      wearerB,
    ],
    assignmentByGarmentKey: {
      "base:shirt": you.wearerId,
      "base:trouser": wearerB.wearerId,
    },
  },
  garmentKeys: ["base:shirt", "base:trouser"],
  compatibilityDemographic: "male",
  garments: mixedGarments.slice(0, 2),
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
});
const beforeMove = planWearerOrderMeasurements({
  order: completedOrder,
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
  physicalGarments: mixedGarments.slice(0, 2),
});
assert.equal(
  beforeMove.find((runtime) => runtime.wearerId === you.wearerId)?.measurement.calculationStatus,
  "complete",
);
const moved = assignGarmentToWearer({
  order: completedOrder,
  garmentKey: "base:shirt",
  wearerId: wearerB.wearerId,
  garment: { garmentKey: "base:shirt", garmentType: "shirt" },
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
});
assert.equal(moved.status, "updated");
if (moved.status !== "updated") throw new Error("reassignment should succeed");
const movedYou = moved.order.wearers.find((wearer) => wearer.wearerId === you.wearerId);
const movedFriend = moved.order.wearers.find((wearer) => wearer.wearerId === wearerB.wearerId);
assert.equal(moved.order.assignmentByGarmentKey["base:shirt"], wearerB.wearerId);
assert.equal(movedYou?.measurement.entered.byGarmentKey["base:shirt"], undefined);
assert.equal(movedFriend?.measurement.entered.byGarmentKey["base:shirt"], undefined);
assert.equal(movedYou?.measurement.entered.shared.total_height?.valueCm, 180);
assert.equal(movedFriend?.measurement.entered.shared.neck_circumference?.valueCm, 36);
assert.equal(movedFriend?.measurement.entered.shared.total_height, undefined);
assert.equal(movedYou?.measurement.calculationStatus, "incomplete");
assert.equal(movedFriend?.measurement.calculationStatus, "incomplete");
const replanned = planWearerOrderMeasurements({
  order: moved.order,
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
  physicalGarments: mixedGarments.slice(0, 2),
});
assert.equal(
  isWearerOrderMeasurementComplete({
    order: moved.order,
    runtimes: replanned,
    physicalGarmentKeys: ["base:shirt", "base:trouser"],
  }),
  false,
);
assert.deepEqual(
  replanned.find((runtime) => runtime.wearerId === wearerB.wearerId)?.garmentKeys.sort(),
  ["base:shirt", "base:trouser"],
);

const missing = assignGarmentToWearer({
  order: moved.order,
  garmentKey: "base:trouser",
  wearerId: "wearer-missing",
  garment: { garmentKey: "base:trouser", garmentType: "trouser" },
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
});
assert.equal(missing.status, "blocked");
if (missing.status === "blocked") assert.equal(missing.code, "WEARER_NOT_FOUND");
assert.equal(missing.order.assignmentByGarmentKey["base:trouser"], wearerB.wearerId);

const lowYou = updateWearerMeasurement(
  completedOrder,
  you.wearerId,
  completeShirt,
);
const partialRuntimes = planWearerOrderMeasurements({
  order: lowYou,
  garmentTypeSelection: selectionFor(["shirt", "trouser"], "male"),
  physicalGarments: mixedGarments.slice(0, 2),
});
assert.equal(
  partialRuntimes.find((runtime) => runtime.wearerId === you.wearerId)?.measurement.calculationStatus,
  "complete",
);
assert.notEqual(
  partialRuntimes.find((runtime) => runtime.wearerId === wearerB.wearerId)?.measurement.calculationStatus,
  "complete",
);
assert.equal(
  isWearerOrderMeasurementComplete({
    order: lowYou,
    runtimes: partialRuntimes,
    physicalGarmentKeys: ["base:shirt", "base:trouser"],
  }),
  false,
);

const envelope = classifyPersistedMeasurement({
  value: routed,
  garmentKeys: ["base:shirt", "additional:shirt:1"],
  compatibilityDemographic: "male",
});
assert.equal(envelope.status, "valid");
const schema2Draft = guestShell(envelope.status === "valid" ? envelope.order : undefined);
const reloaded = normalizeGuestDesignDraft(schema2Draft);
assert.equal(isWearerOrderStateV2(reloaded.futureMeasurementState), true);
if (isWearerOrderStateV2(reloaded.futureMeasurementState)) {
  assert.equal(reloaded.futureMeasurementState.wearers.length, 2);
  assert.equal(
    reloaded.futureMeasurementState.assignmentByGarmentKey["additional:shirt:1"],
    sameGenderFriend.wearerId,
  );
}
const authenticated = normalizeAuthenticatedFutureDraft(schema2Draft);
assert.equal(authenticated.reason, null);
assert.equal(isWearerOrderStateV2(authenticated.draft?.futureMeasurementState), true);

const legacy = createEmptyFutureMeasurementState("low_risk", "cm");
legacy.entered.shared.total_height = { valueCm: 180, provenance: "customer_entered" };
const legacyDraft = guestShell(legacy);
const legacyNormalized = normalizeGuestDesignDraft(legacyDraft);
assert.equal(isFutureMeasurementStateV1(legacyNormalized.futureMeasurementState), true);
const lifted = classifyPersistedMeasurement({
  value: legacyNormalized.futureMeasurementState,
  garmentKeys: ["base:shirt"],
  compatibilityDemographic: "male",
});
assert.equal(lifted.status, "valid");
if (lifted.status === "valid") {
  assert.equal(lifted.order.wearers.length, 1);
  assert.equal(lifted.order.wearers[0]?.measurement.entered.shared.total_height?.valueCm, 180);
}

const emptyDraft = guestShell(createEmptyFutureMeasurementState());
const emptyNormalized = normalizeGuestDesignDraft(emptyDraft);
assert.equal(isFutureMeasurementStateV1(emptyNormalized.futureMeasurementState), true);
if (isFutureMeasurementStateV1(emptyNormalized.futureMeasurementState)) {
  assert.equal(emptyNormalized.futureMeasurementState.route, null);
  assert.deepEqual(emptyNormalized.futureMeasurementState.entered.shared, {});
}
assert.equal(
  classifyPersistedMeasurement({
    value: undefined,
    garmentKeys: [],
    compatibilityDemographic: null,
  }).status,
  "absent",
);

const malformed = { schemaVersion: 1, route: "nope" };
const malformedDraft = guestShell(
  malformed as GuestDesignDraft["futureMeasurementState"],
);
const malformedNormalized = normalizeGuestDesignDraft(malformedDraft);
assert.deepEqual(malformedNormalized.futureMeasurementState, malformed);
assert.equal(isWearerOrderStateV2(malformedNormalized.futureMeasurementState), false);

const projected = projectAuthoritativeOrderMeasurements({
  measurementState: you.measurement,
  measurementPlan: emptyPlan,
  wearerRuntimes: [
    {
      wearerId: you.wearerId,
      displayName: "You",
      fitContext: "male",
      garmentKeys: ["base:shirt", "base:trouser"],
      plan: lowShirtPlan,
      measurement: { ...completeShirt, route: "low_risk" },
    },
    {
      wearerId: friend.wearerId,
      displayName: "Friend",
      fitContext: "female",
      garmentKeys: ["base:dress"],
      plan: dressPlan,
      measurement: friendSample,
    },
  ],
});
assert.equal(projected.schemaVersion, 2);
assert.equal(isWearerOrderStateV2(projected), true);
if (isWearerOrderStateV2(projected)) {
  assert.equal(projected.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(projected.assignmentByGarmentKey["base:dress"], friend.wearerId);
  assert.equal(
    projected.wearers.find((wearer) => wearer.displayName === "You")?.measurement.route,
    "low_risk",
  );
  assert.equal(
    projected.wearers.find((wearer) => wearer.displayName === "Friend")?.measurement.route,
    "sample_cloth",
  );
  assert.equal("wearerMeasurements" in projected, false);
}
const roundTrip = JSON.parse(JSON.stringify(projected));
assert.equal(isWearerOrderStateV2(roundTrip), true);

const amakaMeasurement = {
  ...friendSample,
  route: "sample_cloth" as const,
};
const oneWearerProjection = projectAuthoritativeOrderMeasurements({
  measurementState: amakaMeasurement,
  measurementPlan: dressPlan,
  wearerRuntimes: [
    {
      wearerId: "wearer-amaka",
      displayName: "Amaka",
      fitContext: "female",
      garmentKeys: ["base:dress"],
      plan: dressPlan,
      measurement: amakaMeasurement,
    },
  ],
});
assert.equal(oneWearerProjection.schemaVersion, 2);
assert.equal(isWearerOrderStateV2(oneWearerProjection), true);
assert.equal(isFutureMeasurementStateV1(oneWearerProjection), false);
if (isWearerOrderStateV2(oneWearerProjection)) {
  assert.equal(oneWearerProjection.wearers.length, 1);
  assert.equal(oneWearerProjection.wearers[0]?.wearerId, "wearer-amaka");
  assert.equal(oneWearerProjection.wearers[0]?.displayName, "Amaka");
  assert.equal(oneWearerProjection.wearers[0]?.fitContext, "female");
  assert.equal(oneWearerProjection.assignmentByGarmentKey["base:dress"], "wearer-amaka");
  assert.equal(oneWearerProjection.wearers[0]?.measurement.route, "sample_cloth");
  assert.equal("wearerMeasurements" in oneWearerProjection, false);
}
const amakaTailoring = projectTailoringMeasurementReadout(oneWearerProjection);
assert.equal(amakaTailoring?.[0]?.displayName, "Amaka");
assert.equal(amakaTailoring?.[0]?.wearerId, "wearer-amaka");
assert.equal(amakaTailoring?.[0]?.methodLabel, "Sample Cloth Measurements");
assert.equal(amakaTailoring?.[0]?.garments[0]?.garmentKey, "base:dress");
assert.equal(amakaTailoring?.[0]?.garments[0]?.label, "Standard Dress");
const oneWearerHeader = getFuturePaymentReviewMeasurementHeader(oneWearerProjection);
assert.equal(oneWearerHeader.kind, "single");
if (oneWearerHeader.kind === "single") {
  assert.equal(oneWearerHeader.wearerLabel, "Amaka");
  assert.match(oneWearerHeader.routeLabel, /sample cloth/i);
}
const youProjection = projectAuthoritativeOrderMeasurements({
  measurementState: completeShirt,
  measurementPlan: lowShirtPlan,
  wearerRuntimes: [
    {
      wearerId: you.wearerId,
      displayName: "You",
      fitContext: "male",
      garmentKeys: ["base:shirt"],
      plan: lowShirtPlan,
      measurement: completeShirt,
    },
  ],
});
const youHeader = getFuturePaymentReviewMeasurementHeader(youProjection);
assert.equal(youHeader.kind, "single");
if (youHeader.kind === "single") assert.equal(youHeader.wearerLabel, null);
assert.equal(isWearerOrderStateV2(youProjection), true);
const oneWearerGroups = getFuturePaymentReviewMeasurementGroups({
  measurements: oneWearerProjection,
  garments: [{ garmentKey: "base:dress", label: "Standard Dress" }],
});
assert.equal(oneWearerGroups.some((group) => group.garmentKey === "base:dress"), true);
const historicalHeader = getFuturePaymentReviewMeasurementHeader(completeShirt);
assert.equal(historicalHeader.kind, "single");
if (historicalHeader.kind === "single") assert.equal(historicalHeader.wearerLabel, null);
const historicalTailoring = projectTailoringMeasurementReadout(completeShirt);
assert.equal(historicalTailoring?.[0]?.displayName, "You");
assert.equal(
  historicalTailoring?.[0]?.garments.find((garment) => garment.garmentKey === "base:shirt")
    ?.label,
  "Standard Shirt",
);
assert.equal(
  historicalTailoring?.[0]?.garments.some((garment) => garment.label === "Standard Shirt 1"),
  false,
);
assert.equal(isFutureMeasurementStateV1(completeShirt), true);

const header = getFuturePaymentReviewMeasurementHeader(projected);
assert.equal(header.kind, "wearers");
if (header.kind === "wearers") {
  assert.deepEqual(
    header.wearers.map((wearer) => wearer.displayName),
    ["You", "Friend"],
  );
  assert.match(header.wearers[0]?.routeLabel || "", /low risk/i);
  assert.match(header.wearers[1]?.routeLabel || "", /sample cloth/i);
}
const groups = getFuturePaymentReviewMeasurementGroups({
  measurements: projected,
  garments: [
    { garmentKey: "base:shirt", label: "Standard Shirt" },
    { garmentKey: "base:trouser", label: "Trouser" },
    { garmentKey: "base:dress", label: "Standard Dress" },
  ],
});
assert.equal(groups.some((group) => group.title.startsWith("You")), true);
assert.equal(groups.some((group) => group.title.includes("Standard Dress")), true);
assert.equal(groups.some((group) => group.garmentKey === "base:dress"), true);

const tailoring = projectTailoringMeasurementReadout(projected);
assert.ok(tailoring);
assert.equal(tailoring?.[0]?.displayName, "You");
assert.equal(tailoring?.[0]?.methodLabel, "Low Risk");
assert.deepEqual(
  tailoring?.[0]?.garments.map((garment) => garment.garmentKey),
  ["base:shirt", "base:trouser"],
);
assert.equal(tailoring?.[1]?.displayName, "Friend");
assert.equal(tailoring?.[1]?.garments[0]?.garmentKey, "base:dress");
assert.equal(tailoring?.[1]?.garments[0]?.label, "Standard Dress");
assert.equal(
  tailoring?.[0]?.garments.find((garment) => garment.garmentKey === "base:shirt")?.label,
  "Standard Shirt",
);
assert.equal(
  tailoring?.[0]?.garments.find((garment) => garment.garmentKey === "base:trouser")?.label,
  "Trouser",
);

const chief = createWearerProfile({
  wearerId: "wearer-chief",
  displayName: "Chief",
  fitContext: "male",
  presentationOrder: 0,
});
const ada = createWearerProfile({
  wearerId: "wearer-ada",
  displayName: "Ada",
  fitContext: "female",
  presentationOrder: 1,
});
const chiefAdaOrder = {
  schemaVersion: 2 as const,
  wearers: [chief, ada],
  assignmentByGarmentKey: {
    "base:shirt": chief.wearerId,
    "additional:shirt:1": ada.wearerId,
  },
};
const chiefAdaTailoring = projectTailoringMeasurementReadout(chiefAdaOrder);
assert.equal(chiefAdaTailoring?.[0]?.displayName, "Chief");
assert.equal(chiefAdaTailoring?.[0]?.wearerId, chief.wearerId);
assert.deepEqual(chiefAdaTailoring?.[0]?.garments.map((garment) => garment.garmentKey), [
  "base:shirt",
]);
assert.equal(chiefAdaTailoring?.[0]?.garments[0]?.label, "Standard Shirt");
assert.equal(chiefAdaTailoring?.[1]?.displayName, "Ada");
assert.equal(chiefAdaTailoring?.[1]?.wearerId, ada.wearerId);
assert.deepEqual(chiefAdaTailoring?.[1]?.garments.map((garment) => garment.garmentKey), [
  "additional:shirt:1",
]);
assert.equal(chiefAdaTailoring?.[1]?.garments[0]?.label, "Standard Shirt 2");
assert.equal(chiefAdaOrder.assignmentByGarmentKey["base:shirt"], chief.wearerId);
assert.equal(chiefAdaOrder.assignmentByGarmentKey["additional:shirt:1"], ada.wearerId);

assert.equal(
  shouldReplacePersistedMeasurement({
    persisted: projected,
    incoming: completeShirt,
  }),
  false,
);
assert.equal(
  shouldAcceptMeasurementAutosave({
    persisted: projected,
    incoming: projected,
    saveGeneration: 2,
    currentSaveGeneration: 3,
  }),
  false,
);
assert.equal(
  shouldAcceptMeasurementAutosave({
    persisted: projected,
    incoming: projected,
    saveGeneration: 4,
    currentSaveGeneration: 4,
  }),
  true,
);

const capOrder = {
  schemaVersion: 2 as const,
  wearers: [you],
  assignmentByGarmentKey: { "base:shirt": you.wearerId },
};
const blockedEleventh = addWearer({
  order: {
    ...capOrder,
    wearers: Array.from({ length: 10 }, (_, index) =>
      createWearerProfile({
        wearerId: `wearer-${index}`,
        displayName: `Person ${index}`,
        fitContext: "male",
        presentationOrder: index,
      }),
    ),
  },
  physicalGarmentCount: 11,
  displayName: "Eleventh",
  fitContext: "male",
});
assert.equal(blockedEleventh.status, "blocked");

const studioSource = readFileSync(
  new URL("./src/components/DesignStudioView.tsx", import.meta.url),
  "utf8",
);
assert.match(studioSource, /wearerRuntimes:\s*wearerMeasurementRuntimes/);
assert.match(studioSource, /buildFutureOrderCandidateV2\(\{/);
assert.equal(studioSource.includes("buildFutureOrderCandidate("), false);
const legacyOnly = projectAuthoritativeOrderMeasurements({
  measurementState: completeShirt,
  measurementPlan: lowShirtPlan,
});
assert.equal(legacyOnly.schemaVersion, 1);
assert.equal(oneWearerProjection.schemaVersion, 2);

console.log("multiple wearers review gates passed");
