import type {
  CustomDetailDemographic,
  FabricGarmentType,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
} from "../types.js";
import { projectOccurrenceDisplayLabels } from "./occurrenceDisplayLabel.js";
import { STEP_1_GARMENT_DISPLAY_LABELS } from "./garmentConstructionPricing.js";
import {
  getMeasurementCustomerLabel,
  getSampleClothCustomerLabel,
  getSampleClothProductionEquivalentCm,
  isFutureMeasurementStateV1,
  isSampleClothHalfWidthMeasurement,
  isSampleClothMeasurementMethod,
  MEASUREMENT_METHOD_STAFF_LABELS,
  resolveMeasurementLabelDemographic,
  resolveMeasurementLabelDemographicForGarments,
  resolveMeasurementPlanningDemographic,
} from "./measurementBlueprint.js";
import type { CanonicalMeasurementId } from "../config/MeasurementBlueprintConfig.js";
import { isWearerOrderStateV2, wearerPublicLabel } from "./wearerOrder.js";

export interface TailoringMeasurementValue {
  readonly measurementId: string;
  readonly valueCm: number;
  /**
   * Staff label. Sample Cloth: the label the customer saw on Step 7 ("Waist across
   * sample (laid flat)"). Body-measurement methods keep the measurement id.
   */
  readonly label: string;
  /**
   * Staff value text. Sample Cloth: 1 decimal, and laid-flat across widths add the
   * full-round equivalent ("46 cm laid flat (≈ 92 cm around)"). Otherwise "<valueCm> cm".
   */
  readonly display: string;
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
  /** Sample Cloth only: says the values come from a sample garment, not the body. */
  readonly methodNote: string | null;
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
  garmentTypeByKey: Readonly<Record<string, string>> = {},
): ReadonlyMap<string, string> => {
  const ordered = orderKeysForOccurrenceLabels(garmentKeys);
  const labels = projectOccurrenceDisplayLabels(
    ordered.flatMap((garmentKey) => {
      // The order's garment type wins: a garment switched to its other length in Step 4 keeps
      // the key it was created with.
      const garmentType =
        (garmentTypeByKey[garmentKey] as FabricGarmentType | undefined) ||
        garmentTypeFromKey(garmentKey);
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

export const SAMPLE_CLOTH_STAFF_METHOD_NOTE =
  "Measured on the customer's sample garment, not the body. Across values were measured laid flat; ≈ around is twice that width.";

const roundSampleCm = (valueCm: number): number => Math.round(valueCm * 10) / 10;

/** How one stored value reads to staff. Sample Cloth uses the customer's wording. */
const staffValue = ({
  measurementId,
  valueCm,
  sampleCloth,
  labelDemographic,
}: {
  measurementId: string;
  valueCm: number;
  sampleCloth: boolean;
  labelDemographic: CustomDetailDemographic;
}): TailoringMeasurementValue => {
  if (!sampleCloth) {
    return { measurementId, valueCm, label: measurementId, display: `${valueCm} cm` };
  }
  const id = measurementId as CanonicalMeasurementId;
  const label = getSampleClothCustomerLabel(
    id,
    getMeasurementCustomerLabel(id, labelDemographic),
    labelDemographic,
  );
  const display = isSampleClothHalfWidthMeasurement(measurementId)
    ? `${roundSampleCm(valueCm)} cm laid flat (≈ ${roundSampleCm(
        getSampleClothProductionEquivalentCm(valueCm),
      )} cm around)`
    : `${roundSampleCm(valueCm)} cm`;
  return { measurementId, valueCm, label, display };
};

const valuesFromBag = (
  bag: Record<string, { valueCm: number }>,
  sampleCloth: boolean,
  labelDemographic: CustomDetailDemographic,
): TailoringMeasurementValue[] =>
  Object.entries(bag)
    .map(([measurementId, value]) =>
      staffValue({ measurementId, valueCm: value.valueCm, sampleCloth, labelDemographic }),
    )
    .sort((left, right) => left.measurementId.localeCompare(right.measurementId));

/**
 * Chest / Borst wording for one person's garments, resolved like Step 7 and Payment Review:
 * the Step 1 audience when every garment agrees and can be sized for it, otherwise the
 * Chest / Borst fallback. Unknown audience (no demographics passed) is the fallback.
 */
const labelDemographicForGarments = (
  garmentKeys: readonly string[],
  garmentTypeByKey: Readonly<Record<string, string>>,
  garmentDemographicByKey: Readonly<Record<string, string | null | undefined>>,
): CustomDetailDemographic => {
  if (garmentKeys.length === 0) return "unisex";
  const audience = resolveMeasurementLabelDemographicForGarments(
    garmentKeys.map((garmentKey) => garmentDemographicByKey[garmentKey] ?? null),
  );
  if (audience === "unisex") return audience;
  return resolveMeasurementLabelDemographic(
    resolveMeasurementPlanningDemographic({
      garments: garmentKeys.flatMap((garmentKey) => {
        const garmentType =
          (garmentTypeByKey[garmentKey] as FabricGarmentType | undefined) ||
          garmentTypeFromKey(garmentKey);
        return garmentType ? [{ garmentKey, garmentType }] : [];
      }),
      garmentTypeSelection: {
        garmentTypes: [],
        demographic: audience,
        constructionByGarment: {},
      } as unknown as GarmentTypeStepSelection,
    }),
  );
};

const methodLabel = (state: FutureMeasurementStateV1): string =>
  state.route ? MEASUREMENT_METHOD_STAFF_LABELS[state.route] : "Method not selected";

const readoutFromBag = ({
  wearerId,
  displayName,
  measurement,
  garmentKeys,
  conciseLabels,
  labelDemographic,
}: {
  wearerId: string;
  displayName: string;
  measurement: FutureMeasurementStateV1;
  garmentKeys: readonly string[];
  conciseLabels: ReadonlyMap<string, string>;
  labelDemographic: CustomDetailDemographic;
}): TailoringWearerReadout => {
  const sampleCloth = isSampleClothMeasurementMethod(measurement.route);
  return {
    wearerId,
    displayName,
    methodLabel: methodLabel(measurement),
    methodNote: sampleCloth ? SAMPLE_CLOTH_STAFF_METHOD_NOTE : null,
    shared: valuesFromBag(measurement.entered.shared, sampleCloth, labelDemographic),
    garments: garmentKeys.map((garmentKey) => ({
      garmentKey,
      label: conciseLabels.get(garmentKey) || garmentKey,
      values: valuesFromBag(
        measurement.entered.byGarmentKey[garmentKey] || {},
        sampleCloth,
        labelDemographic,
      ),
    })),
  };
};

/**
 * Garment type per garment key from an order's fabric allocations (the order's own record of each
 * garment, which follows a Step 4 length switch). Unknown or malformed entries are skipped, so the
 * readout falls back to the type in the garment key.
 */
export const garmentTypeByKeyFromFabricAllocations = (
  fabricAllocations: unknown,
): Record<string, string> => {
  if (!Array.isArray(fabricAllocations)) return {};
  const byKey: Record<string, string> = {};
  for (const allocation of fabricAllocations) {
    const assignments = (allocation as { garmentAssignments?: unknown } | null)?.garmentAssignments;
    if (!Array.isArray(assignments)) continue;
    for (const assignment of assignments) {
      const { garmentKey, garmentType } = (assignment ?? {}) as {
        garmentKey?: unknown;
        garmentType?: unknown;
      };
      if (
        typeof garmentKey === "string" &&
        typeof garmentType === "string" &&
        Object.prototype.hasOwnProperty.call(STEP_1_GARMENT_DISPLAY_LABELS, garmentType)
      ) {
        byKey[garmentKey] = garmentType;
      }
    }
  }
  return byKey;
};

/**
 * Step 1 audience per garment key from an order's garment list (`garments[].demographic`).
 * Missing or malformed entries are skipped, so the readout uses the Chest / Borst fallback.
 */
export const garmentDemographicByKeyFromGarments = (
  garments: unknown,
): Record<string, string> => {
  if (!Array.isArray(garments)) return {};
  const byKey: Record<string, string> = {};
  for (const garment of garments) {
    const { garmentKey, demographic } = (garment ?? {}) as {
      garmentKey?: unknown;
      demographic?: unknown;
    };
    if (typeof garmentKey === "string" && typeof demographic === "string") {
      byKey[garmentKey] = demographic;
    }
  }
  return byKey;
};

/** Readable wearer → exact garment → method → values. Null when the payload is not a measurement document. */
export const projectTailoringMeasurementReadout = (
  measurements: unknown,
  /** Garment type per garment key from the order, when the caller has it. */
  garmentTypeByKey: Readonly<Record<string, string>> = {},
  /**
   * Step 1 audience per garment key, when the caller has it. Only words the Sample Cloth
   * Chest / Borst labels; without it they use the Chest / Borst fallback.
   */
  garmentDemographicByKey: Readonly<Record<string, string | null | undefined>> = {},
): readonly TailoringWearerReadout[] | null => {
  if (isWearerOrderStateV2(measurements)) {
    const conciseLabels = conciseLabelsForGarmentKeys(
      Object.keys(measurements.assignmentByGarmentKey),
      garmentTypeByKey,
    );
    return [...measurements.wearers]
      .sort((left, right) => left.presentationOrder - right.presentationOrder)
      .map((wearer) => {
        const garmentKeys = Object.entries(measurements.assignmentByGarmentKey)
          .filter(([, wearerId]) => wearerId === wearer.wearerId)
          .map(([garmentKey]) => garmentKey)
          .sort((left, right) => left.localeCompare(right));
        return readoutFromBag({
          wearerId: wearer.wearerId,
          displayName: wearerPublicLabel(wearer.displayName, wearer.presentationOrder),
          measurement: wearer.measurement,
          garmentKeys,
          conciseLabels,
          labelDemographic: labelDemographicForGarments(
            garmentKeys,
            garmentTypeByKey,
            garmentDemographicByKey,
          ),
        });
      });
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
      conciseLabels: conciseLabelsForGarmentKeys(garmentKeys, garmentTypeByKey),
      labelDemographic: labelDemographicForGarments(
        garmentKeys,
        garmentTypeByKey,
        garmentDemographicByKey,
      ),
    }),
  ];
};
