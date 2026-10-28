import type {
  CustomDetailDemographic,
  FabricGarmentType,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentTypeStepSelection,
} from "../types.js";
import { projectOccurrenceDisplayLabels } from "./occurrenceDisplayLabel.js";
import { STEP_1_GARMENT_DISPLAY_LABELS } from "./garmentConstructionPricing.js";
import {
  getMeasurementCustomerLabel,
  getMeasurementDefinition,
  getMeasurementProfile,
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
import {
  MEASUREMENT_PROFILES,
  type CanonicalMeasurementId,
  type MeasurementProfile,
  type MeasurementProfileId,
} from "../config/MeasurementBlueprintConfig.js";
import { isWearerOrderStateV2, wearerPublicLabel } from "./wearerOrder.js";

export interface TailoringMeasurementValue {
  readonly measurementId: string;
  readonly valueCm: number;
  /**
   * Staff label: the label the customer saw on Step 7 ("Waist Circumference"; Sample
   * Cloth: "Waist across sample (laid flat)").
   */
  readonly label: string;
  /**
   * Staff value text, 1 decimal. Height estimates say so ("81.3 cm (estimated from
   * height)"). Sample Cloth laid-flat across widths add the full-round equivalent
   * ("46 cm laid flat (≈ 92 cm around)").
   */
  readonly display: string;
  /** True when the value was calculated from Total Height rather than entered. */
  readonly estimated: boolean;
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

const roundCm = (valueCm: number): number => Math.round(valueCm * 10) / 10;

export const SAMPLE_CLOTH_STAFF_METHOD_NOTE =
  "Measured on the customer's sample garment, not the body. Across values were measured laid flat; ≈ around is twice that width.";

/** How one Sample Cloth value reads to staff: the customer's wording, all typed. */
const sampleClothValue = (
  measurementId: string,
  valueCm: number,
  labelDemographic: CustomDetailDemographic,
): TailoringMeasurementValue => {
  const id = measurementId as CanonicalMeasurementId;
  const label = getSampleClothCustomerLabel(
    id,
    getMeasurementCustomerLabel(id, labelDemographic),
    labelDemographic,
  );
  const display = isSampleClothHalfWidthMeasurement(measurementId)
    ? `${roundCm(valueCm)} cm laid flat (≈ ${roundCm(
        getSampleClothProductionEquivalentCm(valueCm),
      )} cm around)`
    : `${roundCm(valueCm)} cm`;
  return { measurementId, valueCm, label, display, estimated: false };
};

const sampleClothValuesFromBag = (
  bag: Record<string, { valueCm: number }>,
  labelDemographic: CustomDetailDemographic,
): TailoringMeasurementValue[] =>
  Object.entries(bag)
    .map(([measurementId, value]) => sampleClothValue(measurementId, value.valueCm, labelDemographic))
    .sort((left, right) => left.measurementId.localeCompare(right.measurementId));

const isPositiveCm = (value: { valueCm: number } | undefined): value is { valueCm: number } =>
  Boolean(value && Number.isFinite(value.valueCm) && value.valueCm > 0);

/**
 * The workbook profile Step 7 planned for one garment. Height estimates record it; for
 * typed-only methods it is the profile holding every value typed for that garment.
 */
const profileForGarment = (
  measurement: FutureMeasurementStateV1,
  garmentKey: string,
  garmentType: string | null,
): MeasurementProfile | null => {
  const calculated = Object.values(measurement.derived.byGarmentKey[garmentKey] || {}).find(
    (value) => value.calculation?.profileId,
  );
  const recorded = calculated?.calculation
    ? getMeasurementProfile(calculated.calculation.profileId as MeasurementProfileId)
    : undefined;
  if (recorded) return recorded;
  const typedIds = Object.keys(measurement.entered.byGarmentKey[garmentKey] || {});
  const holdsTyped = (profile: MeasurementProfile) =>
    typedIds.every((id) => profile.fields.some((field) => field.measurementId === id));
  return (
    MEASUREMENT_PROFILES.find((profile) => profile.garmentType === garmentType && holdsTyped(profile)) ||
    MEASUREMENT_PROFILES.find(holdsTyped) ||
    null
  );
};

/** Step 7's section order: Total Height, typed required, height estimates, typed optional. */
const STAFF_BAND = { height: 0, required: 1, estimated: 2, optional: 3 } as const;

const typedBand = (
  profile: MeasurementProfile | null,
  measurementId: string,
  route: FutureMeasurementStateV1["route"],
): number => {
  if (measurementId === "total_height") return STAFF_BAND.height;
  const field = profile?.fields.find((candidate) => candidate.measurementId === measurementId);
  if (!field) return STAFF_BAND.required;
  // Rows without an Average Factor cannot be estimated, so Step 7 asks for them.
  const required =
    field.averageFactor === null ||
    (route !== "critical_risk" &&
      (field.directRoutes.includes(route as never) || Boolean(field.alternativeGroup)));
  return required ? STAFF_BAND.required : STAFF_BAND.optional;
};

interface StaffRow {
  readonly band: number;
  readonly sourceRow: number;
  readonly sortKey: string;
  readonly value: TailoringMeasurementValue;
}

const compareStaffRows = (left: StaffRow, right: StaffRow): number =>
  left.band - right.band ||
  left.sourceRow - right.sourceRow ||
  left.sortKey.localeCompare(right.sortKey);

/**
 * Every saved value for the chosen body-measurement method, the way Step 7 shows it:
 * typed values and height estimates, Step 7 labels and order, one row per shared value.
 */
const bodyMeasurementRows = ({
  measurement,
  garmentKeys,
  garmentTypeByKey,
  labelDemographic,
}: {
  measurement: FutureMeasurementStateV1;
  garmentKeys: readonly string[];
  garmentTypeByKey: Readonly<Record<string, string>>;
  labelDemographic: CustomDetailDemographic;
}): { shared: TailoringMeasurementValue[]; byGarmentKey: Map<string, TailoringMeasurementValue[]> } => {
  const sortedKeys = [...garmentKeys].sort((left, right) => left.localeCompare(right));
  const profiles = new Map(
    sortedKeys.map((garmentKey) => [
      garmentKey,
      profileForGarment(
        measurement,
        garmentKey,
        garmentTypeByKey[garmentKey] || garmentTypeFromKey(garmentKey),
      ),
    ]),
  );
  const fieldOf = (garmentKey: string, measurementId: string) =>
    profiles.get(garmentKey)?.fields.find((field) => field.measurementId === measurementId);
  const row = ({
    garmentKey,
    measurementId,
    valueCm,
    band,
  }: {
    garmentKey: string | null;
    measurementId: string;
    valueCm: number;
    band: number;
  }): StaffRow => {
    const estimated = band === STAFF_BAND.estimated;
    const profile = garmentKey ? profiles.get(garmentKey) : null;
    return {
      band,
      sourceRow: (garmentKey && fieldOf(garmentKey, measurementId)?.sourceRow) || Number.MAX_SAFE_INTEGER,
      sortKey: `${garmentKey ?? ""}:${profile?.id ?? ""}:${measurementId}`,
      value: {
        measurementId,
        valueCm,
        label: getMeasurementCustomerLabel(measurementId as CanonicalMeasurementId, labelDemographic),
        display: `${roundCm(valueCm)} cm${estimated ? " (estimated from height)" : ""}`,
        estimated,
      },
    };
  };

  // Typed shared values sit where Step 7 asks for them: the first garment that requires
  // them, otherwise the first garment that has the field.
  const shared: StaffRow[] = Object.entries(measurement.entered.shared)
    .filter(([, value]) => isPositiveCm(value))
    .map(([measurementId, value]) => {
      const holders = sortedKeys.filter((garmentKey) => fieldOf(garmentKey, measurementId));
      const bands = holders.map((garmentKey) =>
        typedBand(profiles.get(garmentKey) ?? null, measurementId, measurement.route),
      );
      const requiredAt = bands.findIndex((band) => band <= STAFF_BAND.required);
      const at = requiredAt >= 0 ? requiredAt : 0;
      return row({
        garmentKey: holders[at] ?? null,
        measurementId,
        valueCm: value.valueCm,
        band: holders.length ? bands[at] : typedBand(null, measurementId, measurement.route),
      });
    });
  const byGarmentKey = new Map<string, StaffRow[]>(
    sortedKeys.map((garmentKey) => [
      garmentKey,
      Object.entries(measurement.entered.byGarmentKey[garmentKey] || {})
        .filter(([, value]) => isPositiveCm(value))
        .map(([measurementId, value]) =>
          row({
            garmentKey,
            measurementId,
            valueCm: value.valueCm,
            band: typedBand(profiles.get(garmentKey) ?? null, measurementId, measurement.route),
          }),
        ),
    ]),
  );

  // Height estimates. A body estimate repeated for several garments with one factor is one
  // value, shown once with the shared values; a typed shared value replaces its estimate.
  const estimatesById = new Map<string, { garmentKey: string; value: FutureMeasurementValueV1 }[]>();
  sortedKeys.forEach((garmentKey) => {
    Object.entries(measurement.derived.byGarmentKey[garmentKey] || {}).forEach(([measurementId, value]) => {
      if (value.provenance !== "calculated_average_factor" || !isPositiveCm(value)) return;
      const sharedBody =
        getMeasurementDefinition(measurementId as CanonicalMeasurementId)?.scope === "shared_body";
      if (!sharedBody) {
        byGarmentKey.get(garmentKey)!.push(
          row({ garmentKey, measurementId, valueCm: value.valueCm, band: STAFF_BAND.estimated }),
        );
        return;
      }
      if (isPositiveCm(measurement.entered.shared[measurementId])) return;
      const group = estimatesById.get(measurementId) || [];
      group.push({ garmentKey, value });
      estimatesById.set(measurementId, group);
    });
  });
  estimatesById.forEach((group, measurementId) => {
    const oneValue =
      group.length > 1 &&
      group.every(
        (entry) => entry.value.calculation?.averageFactor === group[0].value.calculation?.averageFactor,
      );
    if (oneValue) {
      shared.push(
        row({ garmentKey: group[0].garmentKey, measurementId, valueCm: group[0].value.valueCm, band: STAFF_BAND.estimated }),
      );
      return;
    }
    group.forEach(({ garmentKey, value }) =>
      byGarmentKey.get(garmentKey)!.push(
        row({ garmentKey, measurementId, valueCm: value.valueCm, band: STAFF_BAND.estimated }),
      ),
    );
  });

  const ordered = (rows: StaffRow[]) => [...rows].sort(compareStaffRows).map((entry) => entry.value);
  return {
    shared: ordered(shared),
    byGarmentKey: new Map([...byGarmentKey].map(([garmentKey, rows]) => [garmentKey, ordered(rows)])),
  };
};

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
  garmentTypeByKey,
  labelDemographic,
}: {
  wearerId: string;
  displayName: string;
  measurement: FutureMeasurementStateV1;
  garmentKeys: readonly string[];
  conciseLabels: ReadonlyMap<string, string>;
  garmentTypeByKey: Readonly<Record<string, string>>;
  labelDemographic: CustomDetailDemographic;
}): TailoringWearerReadout => {
  const header = { wearerId, displayName, methodLabel: methodLabel(measurement) };
  const garmentLabel = (garmentKey: string) => conciseLabels.get(garmentKey) || garmentKey;
  if (isSampleClothMeasurementMethod(measurement.route)) {
    return {
      ...header,
      methodNote: SAMPLE_CLOTH_STAFF_METHOD_NOTE,
      shared: sampleClothValuesFromBag(measurement.entered.shared, labelDemographic),
      garments: garmentKeys.map((garmentKey) => ({
        garmentKey,
        label: garmentLabel(garmentKey),
        values: sampleClothValuesFromBag(
          measurement.entered.byGarmentKey[garmentKey] || {},
          labelDemographic,
        ),
      })),
    };
  }
  const rows = bodyMeasurementRows({ measurement, garmentKeys, garmentTypeByKey, labelDemographic });
  return {
    ...header,
    methodNote: null,
    shared: rows.shared,
    garments: garmentKeys.map((garmentKey) => ({
      garmentKey,
      label: garmentLabel(garmentKey),
      values: rows.byGarmentKey.get(garmentKey) || [],
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
   * Step 1 audience per garment key, when the caller has it. Words the Chest / Borst
   * labels; without it they use the Chest / Borst fallback.
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
          garmentTypeByKey,
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
      garmentTypeByKey,
      labelDemographic: labelDemographicForGarments(
        garmentKeys,
        garmentTypeByKey,
        garmentDemographicByKey,
      ),
    }),
  ];
};
