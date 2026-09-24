import type { FabricGarmentType, FutureMeasurementStateV1 } from "../types";
import { projectOccurrenceDisplayLabels } from "./occurrenceDisplayLabel";
import {
  isFutureMeasurementStateV1,
  MEASUREMENT_METHOD_LABELS,
} from "./measurementBlueprint";
import { isWearerOrderStateV2 } from "./wearerOrder";

export interface TailoringMeasurementValue {
  readonly measurementId: string;
  readonly valueCm: number;
}

export interface TailoringGarmentReadout {
  readonly garmentKey: string;
  readonly label: string;
  readonly values: readonly TailoringMeasurementValue[];
}

export interface TailoringWearerReadout {
  readonly wearerId: string;
  readonly displayName: string;
  readonly methodLabel: string;
  readonly shared: readonly TailoringMeasurementValue[];
  readonly garments: readonly TailoringGarmentReadout[];
}

const garmentTypeFromKey = (garmentKey: string): FabricGarmentType | null => {
  const additional = garmentKey.match(/^additional:([^:]+):\d+$/);
  const base = garmentKey.match(/^base:([^:]+)$/);
  const token = additional?.[1] || base?.[1];
  if (!token) return null;
  return token as FabricGarmentType;
};

const orderKeysForOccurrenceLabels = (garmentKeys: readonly string[]): string[] =>
  [...new Set(garmentKeys)].sort((left, right) => {
    const leftAdditional = left.startsWith("additional:");
    const rightAdditional = right.startsWith("additional:");
    if (leftAdditional !== rightAdditional) return leftAdditional ? 1 : -1;
    return left.localeCompare(right);
  });

/** Concise labels for the full physical key set. Ownership subsets reuse this map. */
const conciseLabelsForGarmentKeys = (
  garmentKeys: readonly string[],
): ReadonlyMap<string, string> => {
  const ordered = orderKeysForOccurrenceLabels(garmentKeys);
  const labels = projectOccurrenceDisplayLabels(
    ordered.flatMap((garmentKey) => {
      const garmentType = garmentTypeFromKey(garmentKey);
      return garmentType ? [{ garmentKey, garmentType }] : [];
    }),
  );
  return new Map(
    garmentKeys.map((garmentKey) => [
      garmentKey,
      labels.get(garmentKey)?.conciseLabel || garmentKey,
    ]),
  );
};

const valuesFromBag = (
  bag: Record<string, { valueCm: number }>,
): TailoringMeasurementValue[] =>
  Object.entries(bag)
    .map(([measurementId, value]) => ({
      measurementId,
      valueCm: value.valueCm,
    }))
    .sort((left, right) => left.measurementId.localeCompare(right.measurementId));

const methodLabel = (state: FutureMeasurementStateV1): string =>
  state.route ? MEASUREMENT_METHOD_LABELS[state.route] : "Method not selected";

const readoutFromBag = ({
  wearerId,
  displayName,
  measurement,
  garmentKeys,
  conciseLabels,
}: {
  wearerId: string;
  displayName: string;
  measurement: FutureMeasurementStateV1;
  garmentKeys: readonly string[];
  conciseLabels: ReadonlyMap<string, string>;
}): TailoringWearerReadout => ({
  wearerId,
  displayName,
  methodLabel: methodLabel(measurement),
  shared: valuesFromBag(measurement.entered.shared),
  garments: garmentKeys.map((garmentKey) => ({
    garmentKey,
    label: conciseLabels.get(garmentKey) || garmentKey,
    values: valuesFromBag(measurement.entered.byGarmentKey[garmentKey] || {}),
  })),
});

/** Readable wearer → exact garment → method → values. Null when the payload is not a measurement document. */
export const projectTailoringMeasurementReadout = (
  measurements: unknown,
): readonly TailoringWearerReadout[] | null => {
  if (isWearerOrderStateV2(measurements)) {
    const conciseLabels = conciseLabelsForGarmentKeys(
      Object.keys(measurements.assignmentByGarmentKey),
    );
    return [...measurements.wearers]
      .sort((left, right) => left.presentationOrder - right.presentationOrder)
      .map((wearer) =>
        readoutFromBag({
          wearerId: wearer.wearerId,
          displayName: wearer.displayName,
          measurement: wearer.measurement,
          garmentKeys: Object.entries(measurements.assignmentByGarmentKey)
            .filter(([, wearerId]) => wearerId === wearer.wearerId)
            .map(([garmentKey]) => garmentKey)
            .sort((left, right) => left.localeCompare(right)),
          conciseLabels,
        }),
      );
  }
  if (!isFutureMeasurementStateV1(measurements)) return null;
  const garmentKeys = [
    ...new Set([
      ...Object.keys(measurements.entered.byGarmentKey),
      ...Object.keys(measurements.derived.byGarmentKey),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  return [
    readoutFromBag({
      wearerId: "wearer-legacy",
      displayName: "You",
      measurement: measurements,
      garmentKeys,
      conciseLabels: conciseLabelsForGarmentKeys(garmentKeys),
    }),
  ];
};
