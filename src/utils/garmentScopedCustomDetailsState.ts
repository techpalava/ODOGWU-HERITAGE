import { ALL_CUSTOM_DETAIL_SELECTION_GROUPS } from "../config/GarmentDetailsConfig";
import type {
  CustomDetailGarmentGroup,
  CustomDetailSelectionGroup,
  CustomDetailSelectionSnapshot,
  DesignSelections,
  GarmentScopedCustomDetailSelection,
  GarmentScopedCustomDetailSnapshot,
  GarmentScopedCustomDetailsStateV1,
} from "../types";

export const GARMENT_SCOPED_CUSTOM_DETAILS_SCHEMA_VERSION = 1 as const;

const CUSTOM_DETAIL_SELECTION_GROUP_SET = new Set<CustomDetailSelectionGroup>(
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS,
);
const CUSTOM_DETAIL_GARMENT_GROUP_SET = new Set<CustomDetailGarmentGroup>([
  "shirt",
  "dress",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
  "skirt",
  "personalized",
]);
const CUSTOM_DETAIL_GROUP_ORDER = new Map(
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS.map((group, index) => [group, index]),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isStableIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

const isSelectionGroup = (
  value: unknown,
): value is CustomDetailSelectionGroup =>
  typeof value === "string" &&
  CUSTOM_DETAIL_SELECTION_GROUP_SET.has(value as CustomDetailSelectionGroup);

const compareSelectionGroups = (
  left: CustomDetailSelectionGroup,
  right: CustomDetailSelectionGroup,
): number =>
  (CUSTOM_DETAIL_GROUP_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (CUSTOM_DETAIL_GROUP_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER) ||
  left.localeCompare(right);

const getSelectionOptionIds = (
  selection: GarmentScopedCustomDetailSelection,
): string[] => (Array.isArray(selection) ? [...selection] : [selection]);

const cloneSelection = (
  selection: GarmentScopedCustomDetailSelection,
): GarmentScopedCustomDetailSelection =>
  Array.isArray(selection) ? [...selection] : selection;

const normalizeSelection = (
  value: unknown,
): GarmentScopedCustomDetailSelection | null => {
  if (isStableIdentifier(value)) return value;
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every(isStableIdentifier)) return null;
  const uniqueOptionIds = new Set(value);
  if (uniqueOptionIds.size !== value.length) return null;
  return [...uniqueOptionIds].sort((left, right) => left.localeCompare(right));
};

const cloneScopedSnapshot = (
  snapshot: GarmentScopedCustomDetailSnapshot,
): GarmentScopedCustomDetailSnapshot => ({ ...snapshot });

const normalizeSnapshot = ({
  value,
  garmentKey,
  selectionGroup,
  allowUnscoped = false,
}: {
  value: unknown;
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  allowUnscoped?: boolean;
}): GarmentScopedCustomDetailSnapshot | null => {
  if (!isRecord(value)) return null;
  if (
    (allowUnscoped
      ? value.garmentKey !== undefined && value.garmentKey !== garmentKey
      : value.garmentKey !== garmentKey) ||
    value.selectionGroup !== selectionGroup ||
    !isStableIdentifier(value.optionId) ||
    !isStableIdentifier(value.label) ||
    typeof value.description !== "string" ||
    typeof value.garmentGroup !== "string" ||
    !CUSTOM_DETAIL_GARMENT_GROUP_SET.has(
      value.garmentGroup as CustomDetailGarmentGroup,
    ) ||
    !Number.isFinite(value.priceCents) ||
    (value.informational !== undefined &&
      typeof value.informational !== "boolean") ||
    (value.requiresEvaluation !== undefined &&
      typeof value.requiresEvaluation !== "boolean")
  ) {
    return null;
  }
  return {
    garmentKey,
    optionId: value.optionId,
    label: value.label,
    description: value.description,
    garmentGroup: value.garmentGroup as CustomDetailGarmentGroup,
    selectionGroup,
    priceCents: Number(value.priceCents),
    ...(value.informational !== undefined
      ? { informational: value.informational as boolean }
      : {}),
    ...(value.requiresEvaluation !== undefined
      ? { requiresEvaluation: value.requiresEvaluation as boolean }
      : {}),
  };
};

export type GarmentScopedCustomDetailsNormalizationDiagnosticCode =
  | "INVALID_SCHEMA"
  | "INVALID_CONTAINER"
  | "INVALID_GARMENT_KEY"
  | "INVALID_SELECTION_GROUP"
  | "INVALID_SELECTION"
  | "INVALID_SNAPSHOT"
  | "ORPHANED_SNAPSHOT"
  | "DUPLICATE_SNAPSHOT";

export interface GarmentScopedCustomDetailsNormalizationDiagnostic {
  code: GarmentScopedCustomDetailsNormalizationDiagnosticCode;
  path: string;
}

export interface GarmentScopedCustomDetailsNormalizationResult {
  state: GarmentScopedCustomDetailsStateV1;
  diagnostics: GarmentScopedCustomDetailsNormalizationDiagnostic[];
}

export const createEmptyGarmentScopedCustomDetailsState =
  (): GarmentScopedCustomDetailsStateV1 => ({
    schemaVersion: GARMENT_SCOPED_CUSTOM_DETAILS_SCHEMA_VERSION,
    selectionsByGarmentKey: {},
    snapshotsByGarmentKey: {},
  });

export const normalizeGarmentScopedCustomDetailsState = (
  value: unknown,
): GarmentScopedCustomDetailsNormalizationResult => {
  const state = createEmptyGarmentScopedCustomDetailsState();
  const diagnostics: GarmentScopedCustomDetailsNormalizationDiagnostic[] = [];
  if (value === undefined || value === null) return { state, diagnostics };
  if (!isRecord(value) || value.schemaVersion !== 1) {
    diagnostics.push({ code: "INVALID_SCHEMA", path: "schemaVersion" });
    return { state, diagnostics };
  }

  const rawSelections = value.selectionsByGarmentKey;
  if (!isRecord(rawSelections)) {
    diagnostics.push({
      code: "INVALID_CONTAINER",
      path: "selectionsByGarmentKey",
    });
  } else {
    Object.keys(rawSelections)
      .sort((left, right) => left.localeCompare(right))
      .forEach((garmentKey) => {
        const rawGarmentSelections = rawSelections[garmentKey];
        if (!isStableIdentifier(garmentKey)) {
          diagnostics.push({
            code: "INVALID_GARMENT_KEY",
            path: `selectionsByGarmentKey.${garmentKey}`,
          });
          return;
        }
        if (!isRecord(rawGarmentSelections)) {
          diagnostics.push({
            code: "INVALID_CONTAINER",
            path: `selectionsByGarmentKey.${garmentKey}`,
          });
          return;
        }
        const garmentSelections: Partial<
          Record<CustomDetailSelectionGroup, GarmentScopedCustomDetailSelection>
        > = {};
        Object.keys(rawGarmentSelections)
          .sort((left, right) => left.localeCompare(right))
          .forEach((rawGroup) => {
            if (!isSelectionGroup(rawGroup)) {
              diagnostics.push({
                code: "INVALID_SELECTION_GROUP",
                path: `selectionsByGarmentKey.${garmentKey}.${rawGroup}`,
              });
              return;
            }
            const selection = normalizeSelection(rawGarmentSelections[rawGroup]);
            if (!selection) {
              diagnostics.push({
                code: "INVALID_SELECTION",
                path: `selectionsByGarmentKey.${garmentKey}.${rawGroup}`,
              });
              return;
            }
            garmentSelections[rawGroup] = selection;
          });
        if (Object.keys(garmentSelections).length > 0) {
          state.selectionsByGarmentKey[garmentKey] = garmentSelections;
        }
      });
  }

  const rawSnapshots = value.snapshotsByGarmentKey;
  if (!isRecord(rawSnapshots)) {
    diagnostics.push({
      code: "INVALID_CONTAINER",
      path: "snapshotsByGarmentKey",
    });
  } else {
    Object.keys(rawSnapshots)
      .sort((left, right) => left.localeCompare(right))
      .forEach((garmentKey) => {
        const rawGarmentSnapshots = rawSnapshots[garmentKey];
        if (!isStableIdentifier(garmentKey)) {
          diagnostics.push({
            code: "INVALID_GARMENT_KEY",
            path: `snapshotsByGarmentKey.${garmentKey}`,
          });
          return;
        }
        if (!isRecord(rawGarmentSnapshots)) {
          diagnostics.push({
            code: "INVALID_CONTAINER",
            path: `snapshotsByGarmentKey.${garmentKey}`,
          });
          return;
        }
        const garmentSnapshots: Partial<
          Record<CustomDetailSelectionGroup, GarmentScopedCustomDetailSnapshot[]>
        > = {};
        Object.keys(rawGarmentSnapshots)
          .sort((left, right) => left.localeCompare(right))
          .forEach((rawGroup) => {
            if (!isSelectionGroup(rawGroup)) {
              diagnostics.push({
                code: "INVALID_SELECTION_GROUP",
                path: `snapshotsByGarmentKey.${garmentKey}.${rawGroup}`,
              });
              return;
            }
            const selection = state.selectionsByGarmentKey[garmentKey]?.[rawGroup];
            if (!selection) {
              diagnostics.push({
                code: "ORPHANED_SNAPSHOT",
                path: `snapshotsByGarmentKey.${garmentKey}.${rawGroup}`,
              });
              return;
            }
            const rawGroupSnapshots = rawGarmentSnapshots[rawGroup];
            if (!Array.isArray(rawGroupSnapshots)) {
              diagnostics.push({
                code: "INVALID_SNAPSHOT",
                path: `snapshotsByGarmentKey.${garmentKey}.${rawGroup}`,
              });
              return;
            }
            const selectedOptionIds = new Set(getSelectionOptionIds(selection));
            const seenOptionIds = new Set<string>();
            const snapshots = rawGroupSnapshots.flatMap((rawSnapshot, index) => {
              const snapshot = normalizeSnapshot({
                value: rawSnapshot,
                garmentKey,
                selectionGroup: rawGroup,
              });
              if (!snapshot || !selectedOptionIds.has(snapshot.optionId)) {
                diagnostics.push({
                  code: "INVALID_SNAPSHOT",
                  path: `snapshotsByGarmentKey.${garmentKey}.${rawGroup}.${index}`,
                });
                return [];
              }
              if (seenOptionIds.has(snapshot.optionId)) {
                diagnostics.push({
                  code: "DUPLICATE_SNAPSHOT",
                  path: `snapshotsByGarmentKey.${garmentKey}.${rawGroup}.${index}`,
                });
                return [];
              }
              seenOptionIds.add(snapshot.optionId);
              return [snapshot];
            });
            if (snapshots.length > 0) {
              garmentSnapshots[rawGroup] = snapshots.sort((left, right) =>
                left.optionId.localeCompare(right.optionId),
              );
            }
          });
        if (Object.keys(garmentSnapshots).length > 0) {
          state.snapshotsByGarmentKey[garmentKey] = garmentSnapshots;
        }
      });
  }

  return { state, diagnostics };
};

export const cloneGarmentScopedCustomDetailsState = (
  state: GarmentScopedCustomDetailsStateV1,
): GarmentScopedCustomDetailsStateV1 =>
  normalizeGarmentScopedCustomDetailsState(state).state;

export const getGarmentScopedCustomDetailSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
): GarmentScopedCustomDetailSelection | undefined => {
  const selection = normalizeGarmentScopedCustomDetailsState(state).state
    .selectionsByGarmentKey[garmentKey]?.[selectionGroup];
  return selection === undefined ? undefined : cloneSelection(selection);
};

export const clearGarmentScopedCustomDetailSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
): GarmentScopedCustomDetailsStateV1 => {
  const next = cloneGarmentScopedCustomDetailsState(state);
  const selections = next.selectionsByGarmentKey[garmentKey];
  if (selections) {
    delete selections[selectionGroup];
    if (Object.keys(selections).length === 0) {
      delete next.selectionsByGarmentKey[garmentKey];
    }
  }
  const snapshots = next.snapshotsByGarmentKey[garmentKey];
  if (snapshots) {
    delete snapshots[selectionGroup];
    if (Object.keys(snapshots).length === 0) {
      delete next.snapshotsByGarmentKey[garmentKey];
    }
  }
  return next;
};

export const setGarmentScopedCustomDetailSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  selection: GarmentScopedCustomDetailSelection,
): GarmentScopedCustomDetailsStateV1 => {
  if (!isStableIdentifier(garmentKey) || !isSelectionGroup(selectionGroup)) {
    return cloneGarmentScopedCustomDetailsState(state);
  }
  if (Array.isArray(selection) && selection.length === 0) {
    return clearGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      selectionGroup,
    );
  }
  const normalizedSelection = normalizeSelection(selection);
  if (!normalizedSelection) return cloneGarmentScopedCustomDetailsState(state);
  const next = cloneGarmentScopedCustomDetailsState(state);
  next.selectionsByGarmentKey[garmentKey] = {
    ...(next.selectionsByGarmentKey[garmentKey] || {}),
    [selectionGroup]: normalizedSelection,
  };
  const selectedOptionIds = new Set(getSelectionOptionIds(normalizedSelection));
  const currentSnapshots =
    next.snapshotsByGarmentKey[garmentKey]?.[selectionGroup] || [];
  const retainedSnapshots = currentSnapshots.filter((snapshot) =>
    selectedOptionIds.has(snapshot.optionId),
  );
  if (retainedSnapshots.length > 0) {
    next.snapshotsByGarmentKey[garmentKey] = {
      ...(next.snapshotsByGarmentKey[garmentKey] || {}),
      [selectionGroup]: retainedSnapshots,
    };
  } else if (next.snapshotsByGarmentKey[garmentKey]) {
    delete next.snapshotsByGarmentKey[garmentKey][selectionGroup];
    if (Object.keys(next.snapshotsByGarmentKey[garmentKey]).length === 0) {
      delete next.snapshotsByGarmentKey[garmentKey];
    }
  }
  return next;
};

export const setGarmentScopedCustomDetailSnapshot = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  snapshot: CustomDetailSelectionSnapshot,
): GarmentScopedCustomDetailsStateV1 => {
  const next = cloneGarmentScopedCustomDetailsState(state);
  const selection = next.selectionsByGarmentKey[garmentKey]?.[selectionGroup];
  if (!selection) return next;
  const normalizedSnapshot = normalizeSnapshot({
    value: snapshot,
    garmentKey,
    selectionGroup,
    allowUnscoped: true,
  });
  if (
    !normalizedSnapshot ||
    !getSelectionOptionIds(selection).includes(normalizedSnapshot.optionId)
  ) {
    return next;
  }
  const currentSnapshots =
    next.snapshotsByGarmentKey[garmentKey]?.[selectionGroup] || [];
  next.snapshotsByGarmentKey[garmentKey] = {
    ...(next.snapshotsByGarmentKey[garmentKey] || {}),
    [selectionGroup]: [
      ...currentSnapshots.filter(
        (candidate) => candidate.optionId !== normalizedSnapshot.optionId,
      ),
      normalizedSnapshot,
    ].sort((left, right) => left.optionId.localeCompare(right.optionId)),
  };
  return next;
};

export const removeGarmentScopedCustomDetails = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
): GarmentScopedCustomDetailsStateV1 => {
  const next = cloneGarmentScopedCustomDetailsState(state);
  delete next.selectionsByGarmentKey[garmentKey];
  delete next.snapshotsByGarmentKey[garmentKey];
  return next;
};

export const retainGarmentScopedCustomDetailKeys = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKeys: readonly string[],
): GarmentScopedCustomDetailsStateV1 => {
  const retainedKeys = new Set(garmentKeys.filter(isStableIdentifier));
  const next = cloneGarmentScopedCustomDetailsState(state);
  Object.keys(next.selectionsByGarmentKey).forEach((garmentKey) => {
    if (!retainedKeys.has(garmentKey)) {
      delete next.selectionsByGarmentKey[garmentKey];
    }
  });
  Object.keys(next.snapshotsByGarmentKey).forEach((garmentKey) => {
    if (!retainedKeys.has(garmentKey)) {
      delete next.snapshotsByGarmentKey[garmentKey];
    }
  });
  return next;
};

export interface GarmentScopedCustomDetailOccurrence {
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  snapshot?: GarmentScopedCustomDetailSnapshot;
}

export const enumerateGarmentScopedCustomDetails = (
  state: GarmentScopedCustomDetailsStateV1,
): GarmentScopedCustomDetailOccurrence[] => {
  const normalized = cloneGarmentScopedCustomDetailsState(state);
  return Object.keys(normalized.selectionsByGarmentKey)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((garmentKey) =>
      Object.keys(normalized.selectionsByGarmentKey[garmentKey])
        .filter(isSelectionGroup)
        .sort(compareSelectionGroups)
        .flatMap((selectionGroup) => {
          const selection = normalized.selectionsByGarmentKey[garmentKey][
            selectionGroup
          ];
          if (!selection) return [];
          const snapshots =
            normalized.snapshotsByGarmentKey[garmentKey]?.[selectionGroup] || [];
          return getSelectionOptionIds(selection)
            .sort((left, right) => left.localeCompare(right))
            .map((optionId) => {
              const snapshot = snapshots.find(
                (candidate) => candidate.optionId === optionId,
              );
              return {
                garmentKey,
                selectionGroup,
                optionId,
                ...(snapshot ? { snapshot: cloneScopedSnapshot(snapshot) } : {}),
              };
            });
        }),
    );
};

export const isGarmentScopedCustomDetailsStateEmpty = (
  state: GarmentScopedCustomDetailsStateV1,
): boolean =>
  Object.keys(
    normalizeGarmentScopedCustomDetailsState(state).state
      .selectionsByGarmentKey,
  ).length === 0;

export interface LegacyCustomDetailOwnershipDescriptor {
  garmentKey: string;
  selectionGroups: readonly CustomDetailSelectionGroup[];
}

export interface LegacyCustomDetailMigrationMappedEntry {
  selectionGroup: CustomDetailSelectionGroup;
  garmentKey: string;
}

export interface LegacyCustomDetailMigrationAmbiguousEntry {
  selectionGroup: CustomDetailSelectionGroup;
  garmentKeys: string[];
}

export interface LegacyCustomDetailMigrationUnmappedEntry {
  selectionGroup: CustomDetailSelectionGroup;
}

export interface LegacyCustomDetailMigrationMalformedEntry {
  path: string;
}

export interface LegacyCustomDetailsMigrationResult {
  state: GarmentScopedCustomDetailsStateV1;
  mapped: LegacyCustomDetailMigrationMappedEntry[];
  ambiguous: LegacyCustomDetailMigrationAmbiguousEntry[];
  unmapped: LegacyCustomDetailMigrationUnmappedEntry[];
  malformed: LegacyCustomDetailMigrationMalformedEntry[];
}

export const migrateLegacyCustomDetailsToGarmentScoped = ({
  customDetails,
  customDetailSnapshots,
  ownership,
}: {
  customDetails?: DesignSelections["customDetails"] | unknown;
  customDetailSnapshots?: CustomDetailSelectionSnapshot[] | unknown;
  ownership: readonly LegacyCustomDetailOwnershipDescriptor[];
}): LegacyCustomDetailsMigrationResult => {
  let state = createEmptyGarmentScopedCustomDetailsState();
  const mapped: LegacyCustomDetailMigrationMappedEntry[] = [];
  const ambiguous: LegacyCustomDetailMigrationAmbiguousEntry[] = [];
  const unmapped: LegacyCustomDetailMigrationUnmappedEntry[] = [];
  const malformed: LegacyCustomDetailMigrationMalformedEntry[] = [];
  const ownersByGroup = new Map<CustomDetailSelectionGroup, Set<string>>();

  ownership.forEach((descriptor, descriptorIndex) => {
    if (!isStableIdentifier(descriptor.garmentKey)) {
      malformed.push({ path: `ownership.${descriptorIndex}.garmentKey` });
      return;
    }
    descriptor.selectionGroups.forEach((selectionGroup, groupIndex) => {
      if (!isSelectionGroup(selectionGroup)) {
        malformed.push({
          path: `ownership.${descriptorIndex}.selectionGroups.${groupIndex}`,
        });
        return;
      }
      const owners = ownersByGroup.get(selectionGroup) || new Set<string>();
      owners.add(descriptor.garmentKey);
      ownersByGroup.set(selectionGroup, owners);
    });
  });

  const rawSnapshots = Array.isArray(customDetailSnapshots)
    ? customDetailSnapshots
    : [];
  if (customDetailSnapshots !== undefined && !Array.isArray(customDetailSnapshots)) {
    malformed.push({ path: "customDetailSnapshots" });
  }
  const handledSnapshotIndexes = new Set<number>();

  if (customDetails !== undefined && !isRecord(customDetails)) {
    malformed.push({ path: "customDetails" });
  } else if (isRecord(customDetails)) {
    Object.keys(customDetails)
      .sort((left, right) => left.localeCompare(right))
      .forEach((rawGroup) => {
        if (!isSelectionGroup(rawGroup)) {
          malformed.push({ path: `customDetails.${rawGroup}` });
          return;
        }
        const selection = normalizeSelection(customDetails[rawGroup]);
        if (!selection) {
          malformed.push({ path: `customDetails.${rawGroup}` });
          return;
        }
        const garmentKeys = [...(ownersByGroup.get(rawGroup) || [])].sort(
          (left, right) => left.localeCompare(right),
        );
        if (garmentKeys.length === 0) {
          unmapped.push({ selectionGroup: rawGroup });
          return;
        }
        if (garmentKeys.length > 1) {
          ambiguous.push({ selectionGroup: rawGroup, garmentKeys });
          return;
        }
        const garmentKey = garmentKeys[0];
        state = setGarmentScopedCustomDetailSelection(
          state,
          garmentKey,
          rawGroup,
          selection,
        );
        mapped.push({ selectionGroup: rawGroup, garmentKey });
        const selectedOptionIds = new Set(getSelectionOptionIds(selection));
        const seenSnapshotOptionIds = new Set<string>();
        rawSnapshots.forEach((snapshot, snapshotIndex) => {
          if (!isRecord(snapshot) || snapshot.selectionGroup !== rawGroup) return;
          handledSnapshotIndexes.add(snapshotIndex);
          if (
            !isStableIdentifier(snapshot.optionId) ||
            !selectedOptionIds.has(snapshot.optionId) ||
            seenSnapshotOptionIds.has(snapshot.optionId)
          ) {
            malformed.push({ path: `customDetailSnapshots.${snapshotIndex}` });
            return;
          }
          const normalizedSnapshot = normalizeSnapshot({
            value: snapshot,
            garmentKey,
            selectionGroup: rawGroup,
            allowUnscoped: true,
          });
          if (!normalizedSnapshot) {
            malformed.push({ path: `customDetailSnapshots.${snapshotIndex}` });
            return;
          }
          seenSnapshotOptionIds.add(normalizedSnapshot.optionId);
          state = setGarmentScopedCustomDetailSnapshot(
            state,
            garmentKey,
            rawGroup,
            normalizedSnapshot,
          );
        });
      });
  }

  rawSnapshots.forEach((_snapshot, snapshotIndex) => {
    if (handledSnapshotIndexes.has(snapshotIndex)) return;
    const rawSnapshot = rawSnapshots[snapshotIndex];
    if (!isRecord(rawSnapshot) || !isSelectionGroup(rawSnapshot.selectionGroup)) {
      malformed.push({ path: `customDetailSnapshots.${snapshotIndex}` });
      return;
    }
    const legacySelection = isRecord(customDetails)
      ? normalizeSelection(customDetails[rawSnapshot.selectionGroup])
      : null;
    const normalizedSnapshot = normalizeSnapshot({
      value: rawSnapshot,
      garmentKey: "legacy-validation",
      selectionGroup: rawSnapshot.selectionGroup,
      allowUnscoped: true,
    });
    if (
      !legacySelection ||
      !normalizedSnapshot ||
      !getSelectionOptionIds(legacySelection).includes(
        normalizedSnapshot.optionId,
      )
    ) {
      malformed.push({ path: `customDetailSnapshots.${snapshotIndex}` });
    }
  });

  return { state, mapped, ambiguous, unmapped, malformed };
};

export interface ScopedToLegacyCollision {
  selectionGroup: CustomDetailSelectionGroup;
  garmentKeys: string[];
}

export type ScopedToLegacyCustomDetailsProjection =
  | {
      status: "valid";
      customDetails: NonNullable<DesignSelections["customDetails"]>;
      customDetailSnapshots: CustomDetailSelectionSnapshot[];
    }
  | {
      status: "conflict";
      collisions: ScopedToLegacyCollision[];
    }
  | {
      status: "malformed";
      diagnostics: GarmentScopedCustomDetailsNormalizationDiagnostic[];
    };

export const projectGarmentScopedCustomDetailsToLegacy = (
  value: unknown,
): ScopedToLegacyCustomDetailsProjection => {
  const normalized = normalizeGarmentScopedCustomDetailsState(value);
  if (normalized.diagnostics.length > 0) {
    return { status: "malformed", diagnostics: normalized.diagnostics };
  }
  const ownersByGroup = new Map<CustomDetailSelectionGroup, Set<string>>();
  Object.entries(normalized.state.selectionsByGarmentKey).forEach(
    ([garmentKey, selections]) => {
      Object.keys(selections)
        .filter(isSelectionGroup)
        .forEach((selectionGroup) => {
          const owners = ownersByGroup.get(selectionGroup) || new Set<string>();
          owners.add(garmentKey);
          ownersByGroup.set(selectionGroup, owners);
        });
    },
  );
  const collisions = [...ownersByGroup.entries()]
    .filter(([, garmentKeys]) => garmentKeys.size > 1)
    .sort(([left], [right]) => compareSelectionGroups(left, right))
    .map(([selectionGroup, garmentKeys]) => ({
      selectionGroup,
      garmentKeys: [...garmentKeys].sort((left, right) =>
        left.localeCompare(right),
      ),
    }));
  if (collisions.length > 0) return { status: "conflict", collisions };

  const customDetails: NonNullable<DesignSelections["customDetails"]> = {};
  const customDetailSnapshots: CustomDetailSelectionSnapshot[] = [];
  Object.entries(normalized.state.selectionsByGarmentKey)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([garmentKey, selections]) => {
      Object.keys(selections)
        .filter(isSelectionGroup)
        .sort(compareSelectionGroups)
        .forEach((selectionGroup) => {
          const selection = selections[selectionGroup];
          if (!selection) return;
          customDetails[selectionGroup] = cloneSelection(selection);
          const snapshots =
            normalized.state.snapshotsByGarmentKey[garmentKey]?.[
              selectionGroup
            ] || [];
          snapshots.forEach(({ garmentKey: _garmentKey, ...snapshot }) => {
            customDetailSnapshots.push({ ...snapshot });
          });
        });
    });
  return { status: "valid", customDetails, customDetailSnapshots };
};
