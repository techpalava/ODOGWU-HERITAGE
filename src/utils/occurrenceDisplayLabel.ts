import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine.js";
import type { FabricGarmentType } from "../types.js";
import {
  getStep1GarmentDisplayLabel,
  STEP_1_GARMENT_DISPLAY_LABELS,
} from "./garmentConstructionPricing.js";

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

/**
 * Garment labels inside one person's measurement group. The person heading
 * already says whose garment it is, so the order-wide " 2" / " 3" suffix is
 * dropped ("Standard Shirt 2" -> "Standard Shirt"). If that person has two
 * garments with the same plain name, both keep their order-wide labels so the
 * groups stay distinct. Labels that are not a plain family name (+ suffix) are
 * returned unchanged.
 */
export const projectPersonGarmentLabels = (
  garments: readonly {
    readonly garmentKey: string;
    readonly garmentType?: string | null;
    readonly label: string;
  }[],
): ReadonlyMap<string, string> => {
  const plainLabelOf = (garment: (typeof garments)[number]): string => {
    const family = garment.garmentType
      ? (STEP_1_GARMENT_DISPLAY_LABELS as Readonly<Record<string, string>>)[
          garment.garmentType
        ]
      : undefined;
    if (!family || !garment.label.startsWith(family)) return garment.label;
    const rest = garment.label.slice(family.length);
    return rest === "" || /^ \d+$/.test(rest) ? family : garment.label;
  };
  const plainByKey = new Map(
    garments.map((garment) => [garment.garmentKey, plainLabelOf(garment)]),
  );
  const plainCounts = new Map<string, number>();
  plainByKey.forEach((plain) => plainCounts.set(plain, (plainCounts.get(plain) || 0) + 1));
  return new Map(
    garments.map((garment) => {
      const plain = plainByKey.get(garment.garmentKey)!;
      return [
        garment.garmentKey,
        (plainCounts.get(plain) || 0) > 1 ? garment.label : plain,
      ];
    }),
  );
};
