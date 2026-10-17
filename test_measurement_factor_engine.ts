import assert from "node:assert/strict";
import {
  getMeasurementProfileField,
} from "./src/config/MeasurementBlueprintConfig";
import {
  calculateMeasurementFromAverageFactor,
  deriveMeasurementRangeFromFactors,
  getProfileRowFactors,
  isManualValueOutsideExpectedRange,
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

nearlyEqual(
  getMeasurementProfileField("G", "dress_length_long")!.averageFactor!,
  0.597092331523786,
);
nearlyEqual(
  getProfileRowFactors("G", "dress_length_long")!.averageFactor,
  0.597092331523786,
);
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
nearlyEqual(
  getProfileRowFactors("I", "waist_to_feet_back_length")!.averageFactor,
  0.561814572654843,
);
nearlyEqual(
  getProfileRowFactors("K", "waist_to_lap_length")!.averageFactor,
  (0.0897214528042889 + 0.289493733847171) / 2,
);
nearlyEqual(
  getProfileRowFactors("L", "skirt_bottom_circumference")!.averageFactor,
  0.584591437335114,
);
nearlyEqual(
  getProfileRowFactors("L", "waist_to_lap_length")!.averageFactor,
  (0.0897214528042889 + 0.289493733847171) / 2,
);
nearlyEqual(
  getProfileRowFactors("M", "waist_to_ankle_length")!.averageFactor,
  0.535919333317358,
);

// Ordinary adult measurements at 175 cm must not trigger "Please recheck".
const ordinaryAdult175: Record<string, number> = {
  head_circumference: 56,
  neck_circumference: 38,
  shoulder_length: 45,
  chest_bust_circumference: 100,
  belly_circumference: 92,
  bicep_circumference: 32,
  elbow_circumference: 27,
  armhole_circumference: 50,
  height_head_to_lower_neck: 22,
  height_lower_neck_to_waist: 47,
  height_waist_to_feet: 95,
  shirt_length_standard: 75,
  sleeve_length_short: 22,
};
for (const [measurementId, value] of Object.entries(ordinaryAdult175)) {
  assert.equal(
    isManualValueOutsideExpectedRange({
      value,
      heightValue: 175,
      factors: getProfileRowFactors("A", measurementId as never),
    }),
    false,
    `${measurementId} ${value} cm at 175 cm should not ask for a recheck`,
  );
}
const headToNeck = getProfileRowFactors("A", "height_head_to_lower_neck");
for (const value of [20, 22, 26, 30, 32]) {
  assert.equal(
    isManualValueOutsideExpectedRange({ value, heightValue: 175, factors: headToNeck }),
    false,
    `Head Top to Lower Neck ${value} cm should be accepted quietly`,
  );
}
for (const value of [11, 15, 40, 52]) {
  assert.equal(
    isManualValueOutsideExpectedRange({ value, heightValue: 175, factors: headToNeck }),
    true,
    `Head Top to Lower Neck ${value} cm should still ask for a recheck`,
  );
}
assert.equal(
  isManualValueOutsideExpectedRange({
    value: 200,
    heightValue: 175,
    factors: getProfileRowFactors("A", "chest_bust_circumference"),
  }),
  true,
);

console.log("PASS: measurement factor engine");
