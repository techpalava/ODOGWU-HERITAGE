import assert from "node:assert/strict";
import {
  getMeasurementProfileField,
} from "./src/config/MeasurementBlueprintConfig";
import {
  calculateMeasurementFromAverageFactor,
  deriveMeasurementRangeFromFactors,
  getProfileRowFactors,
} from "./src/utils/measurementFactorEngine";

const HEIGHT = 180;
const nearlyEqual = (actual: number, expected: number) => {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${expected}, received ${actual}`,
  );
};

const chest = getProfileRowFactors("A", "chest_bust_circumference")!;
const head = getProfileRowFactors("A", "head_circumference")!;
const waist = getProfileRowFactors("I", "waist_circumference")!;
const heightLength1 = getProfileRowFactors("A", "height_head_to_lower_neck")!;

nearlyEqual(
  calculateMeasurementFromAverageFactor(HEIGHT, chest.averageFactor),
  HEIGHT * 0.571563968173318,
);
nearlyEqual(
  calculateMeasurementFromAverageFactor(HEIGHT, head.averageFactor),
  HEIGHT * 0.343366501291449,
);
nearlyEqual(
  calculateMeasurementFromAverageFactor(HEIGHT, waist.averageFactor),
  HEIGHT * 0.512617442081532,
);
nearlyEqual(
  calculateMeasurementFromAverageFactor(HEIGHT, heightLength1.averageFactor),
  HEIGHT * 0.151682300586608,
);

const chestRange = deriveMeasurementRangeFromFactors(HEIGHT, chest);
nearlyEqual(chestRange.estimatedValue, HEIGHT * 0.571563968173318);
nearlyEqual(chestRange.expectedMin, HEIGHT * 0.466911764705882);
nearlyEqual(chestRange.expectedMax, HEIGHT * 0.693390804597701);
nearlyEqual(chestRange.expectedStd, HEIGHT * 0.0661713886575747);

assert.equal(getMeasurementProfileField("E", "hip_circumference")?.averageFactor, null);
assert.equal(getProfileRowFactors("E", "hip_circumference"), null);
assert.equal(getProfileRowFactors("I", "hip_circumference")?.averageFactor, 0.584591437335114);

assert.equal(getMeasurementProfileField("G", "dress_length_long")?.averageFactor, null);
assert.equal(getProfileRowFactors("G", "dress_length_long"), null);
assert.equal(
  getProfileRowFactors("C", "shirt_length_long")?.averageFactor,
  0.597092331523786,
);

const skirtKnee = getProfileRowFactors("L", "waist_to_knee_length")!;
const pantsKnee = getProfileRowFactors("I", "waist_to_knee_length")!;
nearlyEqual(skirtKnee.averageFactor, 0.242042112706051);
nearlyEqual(pantsKnee.averageFactor, 0.289493733847171);
assert.notEqual(skirtKnee.averageFactor, pantsKnee.averageFactor);

assert.equal(getProfileRowFactors("B", "sleeve_length_mid"), null);
assert.equal(getProfileRowFactors("E", "sleeve_length_sleeveless"), null);
assert.equal(getProfileRowFactors("I", "waist_to_feet_back_length"), null);
assert.equal(getProfileRowFactors("K", "waist_to_lap_length"), null);
assert.equal(getProfileRowFactors("L", "skirt_bottom_circumference"), null);
assert.equal(getProfileRowFactors("L", "waist_to_lap_length"), null);
assert.equal(getProfileRowFactors("M", "waist_to_ankle_length"), null);

console.log("PASS: measurement factor engine");
