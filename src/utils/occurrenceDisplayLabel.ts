import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { FabricGarmentType } from "../types";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing";

export interface OccurrenceFamilyLabels {
  readonly broadLabel: string;
  readonly conciseLabel: string;
}

/**
 * Family ordinal for one physical occurrence, in the order the caller walks.
 * The first occurrence of a type has no numeric suffix. Later occurrences use
 * the same " 2", " 3" suffix already minted for Step 3 broad labels.
 */
export const nextOccurrenceFamilyLabels = (
  seenByType: Map<string, number>,
  garmentType: FabricGarmentType,
): OccurrenceFamilyLabels => {
  const count = (seenByType.get(garmentType) || 0) + 1;
  seenByType.set(garmentType, count);
  const suffix = count === 1 ? "" : ` ${count}`;
  return {
    broadLabel: `${getFabricGarmentLabel(garmentType)}${suffix}`,
    conciseLabel: `${getStep1GarmentDisplayLabel(garmentType)}${suffix}`,
  };
};

/** garmentKey -> broad and concise labels. Counts only in the supplied order. */
export const projectOccurrenceDisplayLabels = (
  occurrences: readonly {
    readonly garmentKey: string;
    readonly garmentType: FabricGarmentType;
  }[],
): ReadonlyMap<string, OccurrenceFamilyLabels> => {
  const seenByType = new Map<string, number>();
  const labels = new Map<string, OccurrenceFamilyLabels>();
  for (const occurrence of occurrences) {
    labels.set(
      occurrence.garmentKey,
      nextOccurrenceFamilyLabels(seenByType, occurrence.garmentType),
    );
  }
  return labels;
};
