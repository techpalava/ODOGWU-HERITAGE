import assert from "node:assert/strict";
import {
  DRESS_CONDITIONAL_MEASUREMENT_IDS,
  getMeasurementProfileField,
  getRequiredMeasurementIdsForRoute,
  MEASUREMENT_PROFILES,
  type CanonicalMeasurementId,
  type MeasurementProfileId,
} from "./src/config/MeasurementBlueprintConfig";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { resolveGarmentConstructionPricingForOptionId } from "./src/utils/garmentConstructionPricing";
import { planMeasurementRequirements } from "./src/utils/measurementBlueprint";

const MID_REQUIRED: Record<MeasurementProfileId, CanonicalMeasurementId[]> = {
  A: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  B: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  C: [
    "shoulder_length",
    "wrist_circumference",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  D: [
    "shoulder_length",
    "wrist_circumference",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  E: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  F: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  G: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  H: [
    "shoulder_length",
    "chest_bust_circumference",
    "belly_circumference",
    "armhole_circumference",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  I: [
    "waist_circumference",
    "hip_circumference",
    "thigh_circumference",
    "waist_to_crotch_depth_length",
    "waist_to_ankle_length",
    "waist_to_feet_back_length",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  J: [
    "waist_circumference",
    "hip_circumference",
    "thigh_circumference",
    "waist_to_crotch_depth_length",
    "waist_to_knee_length",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  K: [
    "waist_circumference",
    "hip_circumference",
    "thigh_circumference",
    "waist_to_crotch_depth_length",
    "waist_to_lap_length",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  L: [
    "waist_circumference",
    "hip_circumference",
    "skirt_bottom_circumference",
    "waist_to_lap_length",
    "waist_to_knee_length",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
  M: [
    "waist_circumference",
    "hip_circumference",
    "skirt_bottom_circumference",
    "waist_to_ankle_length",
    "total_height",
    "height_head_to_lower_neck",
    "height_lower_neck_to_waist",
    "height_waist_to_feet",
  ],
};

const HIGH_REQUIRED: Record<MeasurementProfileId, CanonicalMeasurementId[]> = {
  A: ["chest_bust_circumference", "belly_circumference", "total_height"],
  B: ["chest_bust_circumference", "belly_circumference", "total_height"],
  C: [
    "wrist_circumference",
    "chest_bust_circumference",
    "belly_circumference",
    "total_height",
  ],
  D: [
    "wrist_circumference",
    "chest_bust_circumference",
    "belly_circumference",
    "total_height",
  ],
  E: ["chest_bust_circumference", "belly_circumference", "total_height"],
  F: ["chest_bust_circumference", "belly_circumference", "total_height"],
  G: ["chest_bust_circumference", "belly_circumference", "total_height"],
  H: ["chest_bust_circumference", "belly_circumference", "total_height"],
  I: [
    "waist_circumference",
    "thigh_circumference",
    "waist_to_crotch_depth_length",
    "total_height",
  ],
  J: [
    "waist_circumference",
    "thigh_circumference",
    "waist_to_knee_length",
    "total_height",
  ],
  K: [
    "waist_circumference",
    "thigh_circumference",
    "waist_to_lap_length",
    "total_height",
  ],
  L: [
    "waist_circumference",
    "waist_to_lap_length",
    "waist_to_knee_length",
    "total_height",
  ],
  M: ["waist_circumference", "waist_to_ankle_length", "total_height"],
};

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

for (const profile of MEASUREMENT_PROFILES) {
  assert.deepEqual(
    sorted(getRequiredMeasurementIdsForRoute(profile.id, "medium_risk")),
    sorted(MID_REQUIRED[profile.id]),
    `${profile.id} Mid required IDs`,
  );
  assert.deepEqual(
    sorted(getRequiredMeasurementIdsForRoute(profile.id, "high_risk")),
    sorted(HIGH_REQUIRED[profile.id]),
    `${profile.id} High required IDs`,
  );
}

for (const profileId of ["E", "F", "G", "H"] as const) {
  for (const measurementId of DRESS_CONDITIONAL_MEASUREMENT_IDS) {
    const field = getMeasurementProfileField(profileId, measurementId);
    assert.ok(field, `${profileId} ${measurementId} exists`);
    assert.equal(
      field.directRoutes.includes("medium_risk"),
      false,
      `${profileId} ${measurementId} must not be Mid required`,
    );
    assert.equal(field.directRoutes.includes("high_risk"), false);
    assert.equal(field.averageFactor, null);
  }
}

assert.equal(
  MEASUREMENT_PROFILES.some((profile) => ["N", "O"].includes(profile.id)),
  false,
);
assert.equal(
  JSON.stringify(MEASUREMENT_PROFILES).includes('"N"') &&
    MEASUREMENT_PROFILES.some((profile) => profile.id === "N" as MeasurementProfileId),
  false,
);

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
for (const [garmentType, optionId, expectedSleeveId, expectedExcludedSleeveId] of [
  ["dress", "dress_std_sleeveless", "sleeve_length_sleeveless", "sleeve_length_short"],
  ["dress", "dress_std_short", "sleeve_length_short", "sleeve_length_sleeveless"],
  ["dress", "dress_std_mid", "sleeve_length_mid", "sleeve_length_long"],
  ["dress", "dress_std_long", "sleeve_length_long", "sleeve_length_mid"],
  ["full_length_gown", "dress_long_sleeveless", "sleeve_length_sleeveless", "sleeve_length_short"],
  ["full_length_gown", "dress_long_short", "sleeve_length_short", "sleeve_length_sleeveless"],
  ["full_length_gown", "dress_long_mid", "sleeve_length_mid", "sleeve_length_long"],
  ["full_length_gown", "dress_long_long", "sleeve_length_long", "sleeve_length_mid"],
] as const) {
  const construction = resolveGarmentConstructionPricingForOptionId(
    garmentType,
    optionId,
    catalog,
  );
  assert.equal(construction.status, "resolved");
  const plan = planMeasurementRequirements({
    route: "high_risk",
    garmentTypeSelection: {
      garmentTypes: [garmentType],
      demographic: "female",
      constructionByGarment: { [garmentType]: construction },
    },
    physicalGarments: [{ garmentKey: `base:${garmentType}`, garmentType }],
  });
  assert.equal(
    plan.requirements.some((req) => req.measurementId === expectedSleeveId),
    true,
    `${optionId} must resolve ${expectedSleeveId}`,
  );
  assert.equal(
    plan.requirements.some((req) => req.measurementId === expectedExcludedSleeveId),
    false,
    `${optionId} must exclude ${expectedExcludedSleeveId} without mid/long ambiguity`,
  );
  assert.equal(
    plan.requirements.some((req) => Boolean(req.alternativeGroup)),
    false,
    `${optionId} must have zero unresolved alternativeGroup ambiguity`,
  );
}

console.log("PASS: measurement required matrix A-M");
