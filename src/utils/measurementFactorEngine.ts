import {
  getMeasurementProfileField,
  type CanonicalMeasurementId,
  type MeasurementProfileId,
  type MeasurementRowFactors,
} from "../config/MeasurementBlueprintConfig";

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
  return value < expectedMin || value > expectedMax;
};
