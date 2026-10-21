import type {
  FutureDesignStudioSummary,
  FutureSummaryGarment,
} from "./designStudioFutureSummary.js";
import type { CanonicalPhysicalGarmentType } from "../types.js";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing.js";
import {
  STEP1_GARMENT_REFERENCE_IMAGES,
  type Step1GarmentReferenceImageConfig,
} from "./step1GarmentReferenceImages.js";

/** One person's block in the Stage 8 Garments section (2+ wearers only). */
export interface SummaryGarmentPersonGroup {
  key: string;
  kind: "wearer" | "unassigned";
  label: string;
  /** Single uppercase letter for the avatar; null for the Unassigned group. */
  initial: string | null;
  garments: FutureSummaryGarment[];
}

export const SUMMARY_UNASSIGNED_GARMENT_GROUP_LABEL = "Unassigned";

const initialFor = (label: string): string | null => {
  const first = Array.from(label.trim())[0];
  return first ? first.toLocaleUpperCase() : null;
};

/**
 * Display-only grouping of Summary garments by person. Returns null for a solo
 * or single-wearer order, so those keep plain garment cards (never "Person 1").
 * Uses the measurement wearer groups (wearer order, ids) when there are 2+, and
 * otherwise the garment wearer labels when at least two different people are
 * named. Garments no person claims go in a trailing "Unassigned" group; a person
 * with no garments is not shown.
 */
export const groupSummaryGarmentsByWearer = (
  summary: Pick<FutureDesignStudioSummary, "garmentSummary" | "measurementSummary">,
): SummaryGarmentPersonGroup[] | null => {
  const garments = summary.garmentSummary;
  const wearerGroups = summary.measurementSummary.wearerGroups ?? [];
  const claimed = new Set<string>();
  const groups: SummaryGarmentPersonGroup[] = [];
  if (wearerGroups.length >= 2) {
    for (const wearer of wearerGroups) {
      const keys = new Set(wearer.garmentKeys);
      const own = garments.filter(
        (garment) => keys.has(garment.garmentKey) && !claimed.has(garment.garmentKey),
      );
      own.forEach((garment) => claimed.add(garment.garmentKey));
      if (own.length === 0) continue;
      groups.push({
        key: `wearer:${wearer.wearerId}`,
        kind: "wearer",
        label: wearer.displayName,
        initial: initialFor(wearer.displayName),
        garments: own,
      });
    }
  } else {
    const labels = [
      ...new Set(
        garments.flatMap((garment) =>
          garment.wearerLabel?.trim() ? [garment.wearerLabel.trim()] : [],
        ),
      ),
    ];
    if (labels.length < 2) return null;
    for (const label of labels) {
      const own = garments.filter(
        (garment) => garment.wearerLabel?.trim() === label,
      );
      own.forEach((garment) => claimed.add(garment.garmentKey));
      groups.push({
        key: `wearer-label:${label}`,
        kind: "wearer",
        label,
        initial: initialFor(label),
        garments: own,
      });
    }
  }
  const unassigned = garments.filter((garment) => !claimed.has(garment.garmentKey));
  if (unassigned.length > 0) {
    groups.push({
      key: "unassigned",
      kind: "unassigned",
      label: SUMMARY_UNASSIGNED_GARMENT_GROUP_LABEL,
      initial: null,
      garments: unassigned,
    });
  }
  return groups;
};

/** Step 1 reference photo for a garment type (garment type only, not the customer's design). */
export const getSummaryGarmentReferenceImage = (
  garmentType: CanonicalPhysicalGarmentType,
): Step1GarmentReferenceImageConfig | null =>
  (STEP1_GARMENT_REFERENCE_IMAGES as Partial<
    Record<CanonicalPhysicalGarmentType, Step1GarmentReferenceImageConfig>
  >)[garmentType] ?? null;

/**
 * "Standard Shirt · Main garment". The type is left out when it only repeats the
 * garment name.
 */
export const formatSummaryGarmentTypeRoleLine = (
  garment: Pick<FutureSummaryGarment, "garmentType" | "label" | "role">,
): string => {
  const role = garment.role === "additional" ? "Additional garment" : "Main garment";
  const typeLabel = getStep1GarmentDisplayLabel(garment.garmentType);
  return typeLabel && typeLabel.trim() !== garment.label.trim()
    ? `${typeLabel} · ${role}`
    : role;
};
