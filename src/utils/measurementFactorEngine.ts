import {
  getMeasurementProfileField,
  type CanonicalMeasurementId,
  type MeasurementProfileId,
  type MeasurementRowFactors,
} from "../config/MeasurementBlueprintConfig.js";

export const calculateMeasurementFromAverageFactor = (
  heightValue: number,
  averageFactor: number,
): number => heightValue * averageFactor;

export const deriveMeasurementRangeFromFactors = (
  heightValue: number,
  factors: MeasurementRowFactors,
): {
  estimatedValue: number;
  expectedMin: number;
  expectedMax: number;
  expectedStd: number;
} => ({
  estimatedValue: calculateMeasurementFromAverageFactor(
    heightValue,
    factors.averageFactor,
  ),
  expectedMin: heightValue * factors.minFactor,
  expectedMax: heightValue * factors.maxFactor,
  expectedStd: heightValue * factors.stdFactor,
});

export const getProfileRowFactors = (
  profileId: MeasurementProfileId,
  measurementId: CanonicalMeasurementId,
): MeasurementRowFactors | null => {
  const field = getMeasurementProfileField(profileId, measurementId);
  if (
    !field ||
    field.averageFactor === null ||
    field.minFactor === null ||
    field.maxFactor === null ||
    field.stdFactor === null
  ) {
    return null;
  }
  return {
    averageFactor: field.averageFactor,
    minFactor: field.minFactor,
    maxFactor: field.maxFactor,
    stdFactor: field.stdFactor,
  };
};

/**
 * The workbook min/max factors are the extremes seen in a small sample of
 * customers, not the limits of normal adult bodies. Low-variance rows such as
 * Head Top to Lower Neck (24.3-29.4 cm at 175 cm height) therefore flagged
 * ordinary values like 22 cm. The "please recheck" hint now allows this much
 * slack beyond the sampled extremes; clearly wrong values (e.g. a doubled or
 * halved number) still fall outside and keep the hint.
 */
export const MANUAL_RANGE_RECHECK_TOLERANCE = 0.2;

export const isManualValueOutsideExpectedRange = ({
  value,
  heightValue,
  factors,
}: {
  value: number;
  heightValue: number;
  factors: MeasurementRowFactors | null;
}): boolean => {
  if (!factors || !Number.isFinite(value) || !Number.isFinite(heightValue) || heightValue <= 0) {
    return false;
  }
  const { expectedMin, expectedMax } = deriveMeasurementRangeFromFactors(
    heightValue,
    factors,
  );
  return (
    value < expectedMin * (1 - MANUAL_RANGE_RECHECK_TOLERANCE) ||
    value > expectedMax * (1 + MANUAL_RANGE_RECHECK_TOLERANCE)
  );
};
