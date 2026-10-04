import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDesignStudioResumeLocus,
  normalizeDesignStudioResumeLocus,
  resolveDesignStudioResumeLocus,
} from "./src/utils/designStudioResumeLocus";
import { persistDormantGarmentTypeStage } from "./src/utils/designStudioJourneyMode";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import type { GuestDesignDraft } from "./src/types";
import { DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const measurementSource = readFileSync(
  "src/components/DormantFutureMeasurementStep.tsx",
  "utf8",
);

assert.match(studioSource, /createDesignStudioResumeLocus/);
assert.match(studioSource, /resolveDesignStudioResumeLocus/);
assert.match(studioSource, /pendingResumeScrollYRef/);
assert.match(studioSource, /restoredGarmentKey=\{hydratedMeasurementGarmentKey\}/);
assert.match(measurementSource, /restoredGarmentKey/);

const created = createDesignStudioResumeLocus({
  activeWearerId: " wearer-2 ",
  measurementGarmentKey: "base:shirt:1",
  scrollY: 412.6,
});
assert.deepEqual(created, {
  schemaVersion: 1,
  activeWearerId: "wearer-2",
  measurementGarmentKey: "base:shirt:1",
  scrollY: 413,
});

assert.equal(normalizeDesignStudioResumeLocus(null), null);
assert.equal(
  normalizeDesignStudioResumeLocus({ schemaVersion: 2, activeWearerId: "x" }),
  null,
);
assert.equal(
  normalizeDesignStudioResumeLocus({
    schemaVersion: 1,
    activeWearerId: "",
    measurementGarmentKey: 12,
    scrollY: -20,
  })?.activeWearerId,
  null,
);

const resolved = resolveDesignStudioResumeLocus({
  locus: {
    schemaVersion: 1,
    activeWearerId: "missing-wearer",
    measurementGarmentKey: "gone-garment",
    scrollY: 88,
  },
  wearerIds: ["wearer-1", "wearer-2"],
  garmentKeys: ["base:shirt:1", "base:trouser:1"],
});
assert.deepEqual(resolved, {
  schemaVersion: 1,
  activeWearerId: null,
  measurementGarmentKey: null,
  scrollY: 88,
});

const kept = resolveDesignStudioResumeLocus({
  locus: created,
  wearerIds: ["wearer-1", "wearer-2"],
  garmentKeys: ["base:shirt:1"],
});
assert.equal(kept.activeWearerId, "wearer-2");
assert.equal(kept.measurementGarmentKey, "base:shirt:1");

const draft: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
  currentStageId: "measurement",
  currentStep: 7,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {},
  },
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: { accessories: [] },
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
  deliveryAddress: {
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "community",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {},
  shippingSnapshot: {},
  updatedAt: "2026-10-04T12:00:00.000Z",
  resumeLocus: created,
};

const persisted = persistDormantGarmentTypeStage({
  draft,
  garmentTypeSelection: draft.garmentTypeSelection!,
  currentStageId: "measurement",
});
assert.deepEqual(persisted.resumeLocus, created);

const normalized = normalizeGuestDesignDraft({
  ...draft,
  resumeLocus: {
    schemaVersion: 1,
    activeWearerId: " wearer-2 ",
    measurementGarmentKey: "base:shirt:1",
    scrollY: 90.2,
  },
});
assert.deepEqual(normalized.resumeLocus, {
  schemaVersion: 1,
  activeWearerId: "wearer-2",
  measurementGarmentKey: "base:shirt:1",
  scrollY: 90,
});

const dropped = normalizeGuestDesignDraft({
  ...draft,
  resumeLocus: { schemaVersion: 9, activeWearerId: "wearer-2" } as GuestDesignDraft["resumeLocus"],
});
assert.equal(dropped.resumeLocus, undefined);

console.log("PASS: Design Studio resume locus persistence");
