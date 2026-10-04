import type { DesignStudioResumeLocusV1 } from "../types";

export const DESIGN_STUDIO_RESUME_LOCUS_SCHEMA_VERSION = 1 as const;

export type { DesignStudioResumeLocusV1 };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeOptionalId = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeScrollY = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
};

export const createDesignStudioResumeLocus = ({
  activeWearerId,
  measurementGarmentKey,
  scrollY,
}: {
  activeWearerId?: string | null;
  measurementGarmentKey?: string | null;
  scrollY?: number | null;
}): DesignStudioResumeLocusV1 => ({
  schemaVersion: DESIGN_STUDIO_RESUME_LOCUS_SCHEMA_VERSION,
  activeWearerId: normalizeOptionalId(activeWearerId),
  measurementGarmentKey: normalizeOptionalId(measurementGarmentKey),
  scrollY: normalizeScrollY(scrollY),
});

export const normalizeDesignStudioResumeLocus = (
  value: unknown,
): DesignStudioResumeLocusV1 | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== DESIGN_STUDIO_RESUME_LOCUS_SCHEMA_VERSION
  ) {
    return null;
  }
  return createDesignStudioResumeLocus({
    activeWearerId: normalizeOptionalId(value.activeWearerId),
    measurementGarmentKey: normalizeOptionalId(value.measurementGarmentKey),
    scrollY: normalizeScrollY(value.scrollY),
  });
};

export const resolveDesignStudioResumeLocus = ({
  locus,
  wearerIds,
  garmentKeys,
}: {
  locus: unknown;
  wearerIds: readonly string[];
  garmentKeys: readonly string[];
}): DesignStudioResumeLocusV1 => {
  const normalized = normalizeDesignStudioResumeLocus(locus);
  const wearerIdSet = new Set(wearerIds);
  const garmentKeySet = new Set(garmentKeys);
  return createDesignStudioResumeLocus({
    activeWearerId:
      normalized?.activeWearerId && wearerIdSet.has(normalized.activeWearerId)
        ? normalized.activeWearerId
        : null,
    measurementGarmentKey:
      normalized?.measurementGarmentKey &&
      garmentKeySet.has(normalized.measurementGarmentKey)
        ? normalized.measurementGarmentKey
        : null,
    scrollY: normalized?.scrollY ?? null,
  });
};
