/** Configured ceiling for people in one order. */
export const MAX_CONFIGURED_ACTIVE_WEARERS = 10;

// Any order with at least one physical garment may hold up to 10 people (some may own no garments).

export const resolveActiveWearerCap = (physicalOccurrenceCount: number): number => {
  const occurrences = Number.isFinite(physicalOccurrenceCount)
    ? Math.max(0, Math.floor(physicalOccurrenceCount))
    : 0;
  return occurrences > 0 ? MAX_CONFIGURED_ACTIVE_WEARERS : 0;
};
