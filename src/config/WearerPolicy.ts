/** Configured ceiling. The live cap is also limited by physical garment count. */
export const MAX_CONFIGURED_ACTIVE_WEARERS = 10;

export const resolveActiveWearerCap = (physicalOccurrenceCount: number): number => {
  const occurrences = Number.isFinite(physicalOccurrenceCount)
    ? Math.max(0, Math.floor(physicalOccurrenceCount))
    : 0;
  return Math.min(MAX_CONFIGURED_ACTIVE_WEARERS, occurrences);
};
