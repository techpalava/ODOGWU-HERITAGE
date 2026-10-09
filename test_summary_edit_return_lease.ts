/**
 * M2: the Summary-edit return lease (also used by Step 7 Add Garment -> Step 5)
 * only lives while the customer is on its focus stage or on the way back to it.
 * - Leaving the focus stage any other way (stepper jump, live summary edit,
 *   any explicit navigation) clears it; a later Back / Continue is normal.
 * - Back honours returnStageId only on the focus stage.
 * - Allowed in-trip sub-flows: the Step 5 Fabric / Design Style / Copy modals
 *   (no stage change), and a stage-correction detour from the focus stage to
 *   an earlier stage that leads back to it via Continue.
 *
 * The journey below drives the same controller Design Studio uses, wired the
 * same way (source checks at the end pin that wiring).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DesignStudioStageId } from "./src/types";
import {
  createSummaryEditReturnLease,
  createSummaryEditReturnTripController,
  type SummaryEditFocusStageId,
  type SummaryEditReturnStageId,
} from "./src/utils/designStudioSummaryEditReturn";

const pass = (label: string) => console.log(`PASS ${label}`);
const ORDER: DesignStudioStageId[] = [
  "garment_type",
  "fabric",
  "design_style",
  "custom_details",
  "personalized_additions",
  "try_on",
  "measurement",
  "summary",
  "shipping",
  "payment",
];
const next = (stage: DesignStudioStageId) => ORDER[ORDER.indexOf(stage) + 1]!;
const previous = (stage: DesignStudioStageId) => ORDER[ORDER.indexOf(stage) - 1]!;

/** Mirrors Design Studio's handlers around the lease. */
const createStudio = (startStage: DesignStudioStageId) => {
  const trip = createSummaryEditReturnTripController(ORDER);
  let stage = startStage;
  let generation = 0;
  let session = "draft-1";
  let peopleExpanded = false;
  const context = () => ({ generation, sessionIdentityKey: session, currentStageId: stage });
  // navigateToFutureStage / setFutureStageId + the [futureStageId] effect.
  const navigate = (target: DesignStudioStageId) => {
    if (target === stage) return;
    stage = target;
    trip.onStageChange(target);
  };
  const begin = (focusStageId: SummaryEditFocusStageId, returnStageId: SummaryEditReturnStageId) => {
    generation += 1;
    trip.begin(
      createSummaryEditReturnLease({ focusStageId, returnStageId, generation, sessionIdentityKey: session }),
      stage,
    );
  };
  // handleOpenDormant*Stage: the stage Continue (and, via handleStepperJump, the stepper).
  const open = (target: DesignStudioStageId) => {
    const returnStage = trip.consumeOnContinue(context());
    navigate(returnStage ?? target);
  };
  return {
    trip,
    get stage() {
      return stage;
    },
    get peopleExpanded() {
      return peopleExpanded;
    },
    setSession(next: string) {
      session = next;
    },
    navigate,
    begin,
    /** handleMeasurementAddGarment with no spare fabric capacity. */
    measurementAddGarment() {
      peopleExpanded = true;
      begin("personalized_additions", "measurement");
      navigate("personalized_additions");
    },
    continue() {
      open(next(stage));
    },
    /** handleBackDuringSummaryEdit(previous stage). */
    back() {
      navigate(trip.back(context()) ?? previous(stage));
    },
    /** handleStepperJump(open stage). */
    stepper(target: DesignStudioStageId) {
      trip.clear();
      open(target);
    },
    /** resolveFutureStageCorrection effect. */
    correction(target: DesignStudioStageId) {
      trip.markCorrection();
      navigate(target);
    },
  };
};

// 1. The bug: Add Garment -> Step 5 -> stepper jump away -> later Back.
{
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  assert.equal(studio.stage, "personalized_additions");
  assert.equal(studio.trip.lease?.returnStageId, "measurement");
  studio.stepper("fabric");
  assert.equal(studio.stage, "fabric", "stepper goes where clicked, not back to Measurement");
  assert.equal(studio.trip.lease, null, "stepper jump clears the lease");
  studio.continue();
  assert.equal(studio.stage, "design_style");
  studio.back();
  assert.equal(studio.stage, "fabric", "Back from another stage is the normal previous stage");
  pass("stepper jump away from Step 5 clears the lease; Back is normal");
}
{
  // Any explicit navigation off the focus stage (no stepper wrapper) also clears.
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  studio.navigate("garment_type");
  assert.equal(studio.trip.lease, null, "the stage-change check clears it");
  studio.navigate("try_on");
  studio.back();
  assert.equal(studio.stage, "personalized_additions", "Back from Try On is Step 5, not Measurement");
  studio.continue();
  assert.equal(studio.stage, "try_on", "Step 5 Continue no longer returns to Measurement");
  pass("leaving the focus stage by any other navigation clears the lease");
}
{
  // Stale lease on a non-focus stage (e.g. kept by an older build): Back clears it.
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  studio.setSession("draft-2");
  studio.back();
  assert.equal(studio.stage, "custom_details", "a lease from another session is ignored");
  assert.equal(studio.trip.lease, null);
  pass("Back ignores and clears a lease that does not match");
}

// 2. Happy path: Step 5 Continue / Back return to Measurement, people expanded.
for (const finish of ["continue", "back"] as const) {
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  studio[finish]();
  assert.equal(studio.stage, "measurement", `Step 5 ${finish} returns to Measurement`);
  assert.equal(studio.peopleExpanded, true, "people panel stays expanded");
  assert.equal(studio.trip.lease, null, "consumed");
  pass(`happy path: Step 5 ${finish} -> Measurement with people expanded`);
}

// 3. Summary / Payment edit leases follow the same rule.
for (const finish of ["continue", "back"] as const) {
  const studio = createStudio("summary");
  studio.begin("fabric", "summary");
  studio.navigate("fabric");
  studio[finish]();
  assert.equal(studio.stage, "summary", `Summary edit Fabric ${finish} returns to Summary`);
  pass(`Summary edit: Fabric ${finish} -> Summary`);
}
{
  // Gated approach: Summary -> Fabric edit lands on Garment Type first.
  const studio = createStudio("summary");
  studio.begin("fabric", "summary");
  studio.navigate("garment_type");
  assert.equal(studio.trip.phase, "approach");
  studio.continue();
  assert.equal(studio.stage, "fabric");
  assert.equal(studio.trip.phase, "focus");
  studio.continue();
  assert.equal(studio.stage, "summary", "approach then focus Continue still returns");
  pass("Summary edit through a gate stage still returns to Summary");
}
{
  const studio = createStudio("payment");
  studio.begin("custom_details", "payment");
  studio.navigate("custom_details");
  studio.back();
  assert.equal(studio.stage, "payment", "Payment edit Back returns to Payment");
  studio.begin("shipping", "payment");
  studio.navigate("shipping");
  studio.stepper("measurement");
  assert.equal(studio.stage, "measurement");
  assert.equal(studio.trip.lease, null);
  studio.continue();
  assert.equal(studio.stage, "summary", "after a jump, Continue is normal");
  pass("Payment edit returns via Back; a stepper jump drops it");
}

// 4. Allowed sub-flow: correction detour from Step 5 back through earlier stages.
{
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  // Step 5 Fabric / Design Style / Copy modals do not change the stage.
  assert.equal(studio.trip.phase, "focus");
  // The session ended with the new garment missing a Design Style: the safety net bounces.
  studio.correction("design_style");
  assert.equal(studio.stage, "design_style");
  assert.equal(studio.trip.lease?.returnStageId, "measurement", "detour keeps the lease");
  assert.equal(studio.trip.phase, "detour");
  studio.back();
  assert.equal(studio.stage, "fabric", "Back on a detour stage is a normal Back");
  assert.ok(studio.trip.lease, "and keeps the trip");
  studio.continue();
  studio.continue();
  studio.continue();
  assert.equal(studio.stage, "personalized_additions", "Continue chain leads back to Step 5");
  studio.continue();
  assert.equal(studio.stage, "measurement", "Step 5 Continue still returns to Measurement");
  assert.equal(studio.peopleExpanded, true);
  pass("correction detour from Step 5 returns to Measurement via the Continue chain");
}
{
  const studio = createStudio("measurement");
  studio.measurementAddGarment();
  studio.correction("design_style");
  studio.stepper("summary");
  assert.equal(studio.trip.lease, null, "a stepper jump during the detour drops the trip");
  const forward = createStudio("measurement");
  forward.measurementAddGarment();
  forward.correction("try_on");
  assert.equal(forward.trip.lease, null, "a correction past the focus stage is not a detour");
  pass("detour is limited to stages before the focus stage");
}

// 5. Design Studio wiring.
{
  const src = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.match(src, /useEffect\(\(\) => \{\s*summaryEditReturnTrip\.onStageChange\(futureStageId\);\s*\}, \[futureStageId, summaryEditReturnTrip\]\);/);
  assert.match(src, /summaryEditReturnTrip\.markCorrection\(\);/);
  assert.match(
    src,
    /const handleBackDuringSummaryEdit = \(fallbackStage: DesignStudioStageId\) => \{\s*const returnStageId = summaryEditReturnTrip\.back\(summaryEditReturnContext\(\)\);\s*navigateToFutureStage\(returnStageId \?\? fallbackStage\);/,
  );
  for (const prop of [
    "GarmentType",
    "Fabric",
    "DesignStyle",
    "CustomDetails",
    "PersonalizedAdditions",
    "TryOn",
    "Measurement",
    "Summary",
    "Shipping",
    "Payment",
  ]) {
    assert.match(src, new RegExp(`onSelect${prop}=\\{handleStepperJump\\(`), `stepper ${prop} clears the lease`);
  }
  assert.match(src, /liveOrderSummaryUnlockedStages\.has\(stage\)\) return;\s*\/\/[^\n]*\n\s*clearSummaryEditReturnLease\(\);/);
  assert.match(
    src,
    /setMeasurementResumePeopleExpanded\(true\);\s*beginSummaryEditReturn\(\{\s*focusStageId: "personalized_additions",\s*returnStageId: "measurement",\s*\}\);\s*navigateToFutureStage\("personalized_additions"\);/,
  );
  assert.doesNotMatch(src, /summaryEditReturnLeaseRef/, "no second lease owner");
  pass("Design Studio wiring: stage-change check, correction mark, Back, stepper, live summary");
}

console.log("test_summary_edit_return_lease: all passed");
