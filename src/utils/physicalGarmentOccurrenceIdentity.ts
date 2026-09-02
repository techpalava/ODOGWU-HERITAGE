import type {
  GarmentTypeStepSelection,
  PhysicalGarmentOccurrenceIdentityStateV1,
} from "../types";

export const PHYSICAL_GARMENT_OCCURRENCE_IDENTITY_SCHEMA_VERSION = 1 as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isValidGeneration = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const isValidGarmentKey = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 256 &&
  value !== "__proto__" &&
  value !== "constructor" &&
  value !== "prototype" &&
  !/[\u0000-\u001f\u007f]/.test(value);

export const normalizePhysicalGarmentOccurrenceIdentityState = (
  value: unknown,
): PhysicalGarmentOccurrenceIdentityStateV1 | null => {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !==
      PHYSICAL_GARMENT_OCCURRENCE_IDENTITY_SCHEMA_VERSION ||
    !isValidGeneration(value.nextGeneration) ||
    !isRecord(value.activeGenerationByGarmentKey)
  ) {
    return null;
  }

  const activeGenerationByGarmentKey: Record<string, number> = {};
  const seenGenerations = new Set<number>();
  for (const [garmentKey, generation] of Object.entries(
    value.activeGenerationByGarmentKey,
  )) {
    if (
      !isValidGarmentKey(garmentKey) ||
      !isValidGeneration(generation) ||
      generation >= value.nextGeneration ||
      seenGenerations.has(generation)
    ) {
      return null;
    }
    activeGenerationByGarmentKey[garmentKey] = generation;
    seenGenerations.add(generation);
  }

  return {
    schemaVersion: PHYSICAL_GARMENT_OCCURRENCE_IDENTITY_SCHEMA_VERSION,
    nextGeneration: value.nextGeneration,
    activeGenerationByGarmentKey,
  };
};

const statesEqual = (
  left: PhysicalGarmentOccurrenceIdentityStateV1,
  right: PhysicalGarmentOccurrenceIdentityStateV1,
): boolean => {
  if (left.nextGeneration !== right.nextGeneration) return false;
  const leftEntries = Object.entries(left.activeGenerationByGarmentKey);
  const rightEntries = Object.entries(right.activeGenerationByGarmentKey);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([garmentKey, generation]) =>
        right.activeGenerationByGarmentKey[garmentKey] === generation,
    )
  );
};

export const reconcilePhysicalGarmentOccurrenceIdentityState = ({
  state,
  activeGarmentKeys,
}: {
  state: unknown;
  activeGarmentKeys: readonly string[];
}): PhysicalGarmentOccurrenceIdentityStateV1 => {
  const normalized = normalizePhysicalGarmentOccurrenceIdentityState(state);
  const uniqueActiveGarmentKeys = [...new Set(activeGarmentKeys)].filter(
    isValidGarmentKey,
  );
  const activeGenerationByGarmentKey: Record<string, number> = {};
  let nextGeneration = normalized?.nextGeneration ?? 1;

  uniqueActiveGarmentKeys.forEach((garmentKey) => {
    const existing = normalized?.activeGenerationByGarmentKey[garmentKey];
    if (existing !== undefined) {
      activeGenerationByGarmentKey[garmentKey] = existing;
      return;
    }
    activeGenerationByGarmentKey[garmentKey] = nextGeneration;
    nextGeneration += 1;
  });

  const reconciled: PhysicalGarmentOccurrenceIdentityStateV1 = {
    schemaVersion: PHYSICAL_GARMENT_OCCURRENCE_IDENTITY_SCHEMA_VERSION,
    nextGeneration,
    activeGenerationByGarmentKey,
  };
  if (
    normalized &&
    state === normalized &&
    statesEqual(normalized, reconciled)
  ) {
    return normalized;
  }
  if (
    normalized &&
    isRecord(state) &&
    statesEqual(normalized, reconciled)
  ) {
    return state as unknown as PhysicalGarmentOccurrenceIdentityStateV1;
  }
  return reconciled;
};

export const reconcileGarmentTypeSelectionOccurrenceIdentities = ({
  selection,
  activeGarmentKeys,
}: {
  selection: GarmentTypeStepSelection;
  activeGarmentKeys: readonly string[];
}): GarmentTypeStepSelection => {
  const physicalOccurrenceIdentityState =
    reconcilePhysicalGarmentOccurrenceIdentityState({
      state: selection.physicalOccurrenceIdentityState,
      activeGarmentKeys,
    });
  if (
    selection.physicalOccurrenceIdentityState ===
    physicalOccurrenceIdentityState
  ) {
    return selection;
  }
  return { ...selection, physicalOccurrenceIdentityState };
};

export const getPhysicalGarmentOccurrenceGeneration = (
  state: PhysicalGarmentOccurrenceIdentityStateV1 | null | undefined,
  garmentKey: string,
): number | null => state?.activeGenerationByGarmentKey[garmentKey] ?? null;

export const createPhysicalGarmentOccurrenceIdentityToken = ({
  garmentKey,
  generation,
}: {
  garmentKey: string;
  generation: number;
}): string => `physical-occurrence-v1:${generation}:${garmentKey}`;
