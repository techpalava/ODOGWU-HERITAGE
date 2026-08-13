import { ALL_CUSTOM_DETAIL_SELECTION_GROUPS } from "../config/GarmentDetailsConfig";
import type {
  CustomDetailOptionId,
  CustomDetailSelectionGroup,
  GarmentScopedCustomDetailInputsV1,
} from "../types";

export const GARMENT_SCOPED_CUSTOM_DETAIL_INPUTS_SCHEMA_VERSION = 1 as const;
export const GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH = 2000;
export const PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID =
  "personalized_additional_evaluation" as const;
export const PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP =
  "personalized_additional" as const;

const SELECTION_GROUP_SET = new Set<CustomDetailSelectionGroup>(
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS,
);
const SELECTION_GROUP_ORDER = new Map(
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
  SELECTION_GROUP_SET.has(value as CustomDetailSelectionGroup);

const compareSelectionGroups = (
  left: CustomDetailSelectionGroup,
  right: CustomDetailSelectionGroup,
): number =>
  (SELECTION_GROUP_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (SELECTION_GROUP_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER) ||
  left.localeCompare(right);

export const isPersonalizedAdditionalRequirementIdentity = ({
  selectionGroup,
  optionId,
}: {
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
}): boolean =>
  selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
  optionId === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;

export type GarmentScopedCustomDetailTextValidation =
  | { status: "valid"; text: string }
  | { status: "empty" }
  | { status: "too_long"; text: string; maxLength: number }
  | { status: "invalid_type" };

export const validateGarmentScopedCustomDetailText = (
  value: unknown,
): GarmentScopedCustomDetailTextValidation => {
  if (typeof value !== "string") return { status: "invalid_type" };
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length === 0) return { status: "empty" };
  if (text.length > GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH) {
    return {
      status: "too_long",
      text,
      maxLength: GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH,
    };
  }
  return { status: "valid", text };
};

export type GarmentScopedCustomDetailInputsDiagnosticCode =
  | "INVALID_SCHEMA"
  | "INVALID_CONTAINER"
  | "INVALID_GARMENT_KEY"
  | "INVALID_SELECTION_GROUP"
  | "INVALID_OPTION_ID"
  | "INVALID_TEXT"
  | "TEXT_TOO_LONG";

export interface GarmentScopedCustomDetailInputsDiagnostic {
  code: GarmentScopedCustomDetailInputsDiagnosticCode;
  path: string;
}

export interface GarmentScopedCustomDetailInputsNormalizationResult {
  state: GarmentScopedCustomDetailInputsV1;
  diagnostics: GarmentScopedCustomDetailInputsDiagnostic[];
}

export const createEmptyGarmentScopedCustomDetailInputs =
  (): GarmentScopedCustomDetailInputsV1 => ({
    schemaVersion: GARMENT_SCOPED_CUSTOM_DETAIL_INPUTS_SCHEMA_VERSION,
    textByGarmentKey: {},
  });

export const normalizeGarmentScopedCustomDetailInputs = (
  value: unknown,
): GarmentScopedCustomDetailInputsNormalizationResult => {
  const state = createEmptyGarmentScopedCustomDetailInputs();
  const diagnostics: GarmentScopedCustomDetailInputsDiagnostic[] = [];
  if (value === undefined || value === null) return { state, diagnostics };
  if (!isRecord(value) || value.schemaVersion !== 1) {
    diagnostics.push({ code: "INVALID_SCHEMA", path: "schemaVersion" });
    return { state, diagnostics };
  }
  if (!isRecord(value.textByGarmentKey)) {
    diagnostics.push({ code: "INVALID_CONTAINER", path: "textByGarmentKey" });
    return { state, diagnostics };
  }

  Object.keys(value.textByGarmentKey)
    .sort((left, right) => left.localeCompare(right))
    .forEach((garmentKey) => {
      const rawGroups = value.textByGarmentKey[garmentKey];
      if (!isStableIdentifier(garmentKey)) {
        diagnostics.push({
          code: "INVALID_GARMENT_KEY",
          path: `textByGarmentKey.${garmentKey}`,
        });
        return;
      }
      if (!isRecord(rawGroups)) {
        diagnostics.push({
          code: "INVALID_CONTAINER",
          path: `textByGarmentKey.${garmentKey}`,
        });
        return;
      }
      const groups: Partial<
        Record<CustomDetailSelectionGroup, Record<CustomDetailOptionId, string>>
      > = {};
      Object.keys(rawGroups)
        .sort((left, right) =>
          compareSelectionGroups(
            left as CustomDetailSelectionGroup,
            right as CustomDetailSelectionGroup,
          ),
        )
        .forEach((rawGroup) => {
          if (!isSelectionGroup(rawGroup)) {
            diagnostics.push({
              code: "INVALID_SELECTION_GROUP",
              path: `textByGarmentKey.${garmentKey}.${rawGroup}`,
            });
            return;
          }
          const rawOptions = rawGroups[rawGroup];
          if (!isRecord(rawOptions)) {
            diagnostics.push({
              code: "INVALID_CONTAINER",
              path: `textByGarmentKey.${garmentKey}.${rawGroup}`,
            });
            return;
          }
          const options: Record<CustomDetailOptionId, string> = {};
          Object.keys(rawOptions)
            .sort((left, right) => left.localeCompare(right))
            .forEach((optionId) => {
              const path = `textByGarmentKey.${garmentKey}.${rawGroup}.${optionId}`;
              if (!isStableIdentifier(optionId)) {
                diagnostics.push({ code: "INVALID_OPTION_ID", path });
                return;
              }
              const text = validateGarmentScopedCustomDetailText(
                rawOptions[optionId],
              );
              if (text.status === "valid" || text.status === "too_long") {
                options[optionId] = text.text;
                if (text.status === "too_long") {
                  diagnostics.push({ code: "TEXT_TOO_LONG", path });
                }
                return;
              }
              if (text.status === "invalid_type") {
                diagnostics.push({ code: "INVALID_TEXT", path });
              }
            });
          if (Object.keys(options).length > 0) groups[rawGroup] = options;
        });
      if (Object.keys(groups).length > 0) {
        state.textByGarmentKey[garmentKey] = groups;
      }
    });
  return { state, diagnostics };
};

export const cloneGarmentScopedCustomDetailInputs = (
  state: GarmentScopedCustomDetailInputsV1,
): GarmentScopedCustomDetailInputsV1 =>
  normalizeGarmentScopedCustomDetailInputs(state).state;

export const getGarmentScopedCustomDetailText = (
  state: GarmentScopedCustomDetailInputsV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): string | undefined =>
  normalizeGarmentScopedCustomDetailInputs(state).state.textByGarmentKey[
    garmentKey
  ]?.[selectionGroup]?.[optionId];

export const clearGarmentScopedCustomDetailText = (
  state: GarmentScopedCustomDetailInputsV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): GarmentScopedCustomDetailInputsV1 => {
  const next = cloneGarmentScopedCustomDetailInputs(state);
  const options = next.textByGarmentKey[garmentKey]?.[selectionGroup];
  if (!options) return next;
  delete options[optionId];
  if (Object.keys(options).length === 0) {
    delete next.textByGarmentKey[garmentKey][selectionGroup];
  }
  if (Object.keys(next.textByGarmentKey[garmentKey]).length === 0) {
    delete next.textByGarmentKey[garmentKey];
  }
  return next;
};

export type SetGarmentScopedCustomDetailTextResult =
  | { status: "saved"; state: GarmentScopedCustomDetailInputsV1; text: string }
  | { status: "cleared"; state: GarmentScopedCustomDetailInputsV1 }
  | {
      status: "too_long";
      state: GarmentScopedCustomDetailInputsV1;
      maxLength: number;
    }
  | { status: "invalid_type"; state: GarmentScopedCustomDetailInputsV1 };

export const setGarmentScopedCustomDetailText = ({
  state,
  garmentKey,
  selectionGroup,
  optionId,
  text,
}: {
  state: GarmentScopedCustomDetailInputsV1;
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  text: unknown;
}): SetGarmentScopedCustomDetailTextResult => {
  const next = cloneGarmentScopedCustomDetailInputs(state);
  if (
    !isStableIdentifier(garmentKey) ||
    !isSelectionGroup(selectionGroup) ||
    !isStableIdentifier(optionId)
  ) {
    return { status: "invalid_type", state: next };
  }
  const normalizedText = validateGarmentScopedCustomDetailText(text);
  if (normalizedText.status === "empty") {
    return {
      status: "cleared",
      state: clearGarmentScopedCustomDetailText(
        next,
        garmentKey,
        selectionGroup,
        optionId,
      ),
    };
  }
  if (normalizedText.status === "too_long") {
    return {
      status: "too_long",
      state: next,
      maxLength: normalizedText.maxLength,
    };
  }
  if (normalizedText.status === "invalid_type") {
    return { status: "invalid_type", state: next };
  }
  next.textByGarmentKey[garmentKey] = {
    ...(next.textByGarmentKey[garmentKey] || {}),
    [selectionGroup]: {
      ...(next.textByGarmentKey[garmentKey]?.[selectionGroup] || {}),
      [optionId]: normalizedText.text,
    },
  };
  return { status: "saved", state: next, text: normalizedText.text };
};

export const removeGarmentScopedCustomDetailInputs = (
  state: GarmentScopedCustomDetailInputsV1,
  garmentKey: string,
): GarmentScopedCustomDetailInputsV1 => {
  const next = cloneGarmentScopedCustomDetailInputs(state);
  delete next.textByGarmentKey[garmentKey];
  return next;
};

export const retainGarmentScopedCustomDetailInputGarmentKeys = (
  state: GarmentScopedCustomDetailInputsV1,
  garmentKeys: readonly string[],
): GarmentScopedCustomDetailInputsV1 => {
  const retained = new Set(garmentKeys.filter(isStableIdentifier));
  const next = cloneGarmentScopedCustomDetailInputs(state);
  Object.keys(next.textByGarmentKey).forEach((garmentKey) => {
    if (!retained.has(garmentKey)) delete next.textByGarmentKey[garmentKey];
  });
  return next;
};

export interface GarmentScopedCustomDetailInputIdentity {
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
}

export const retainGarmentScopedCustomDetailInputIdentities = (
  state: GarmentScopedCustomDetailInputsV1,
  identities: readonly GarmentScopedCustomDetailInputIdentity[],
): GarmentScopedCustomDetailInputsV1 => {
  const retained = new Set(
    identities
      .filter(
        (identity) =>
          isStableIdentifier(identity.garmentKey) &&
          isSelectionGroup(identity.selectionGroup) &&
          isStableIdentifier(identity.optionId),
      )
      .map(
        (identity) =>
          `${identity.garmentKey}\u0000${identity.selectionGroup}\u0000${identity.optionId}`,
      ),
  );
  let next = cloneGarmentScopedCustomDetailInputs(state);
  enumerateGarmentScopedCustomDetailInputs(next).forEach((entry) => {
    const key = `${entry.garmentKey}\u0000${entry.selectionGroup}\u0000${entry.optionId}`;
    if (!retained.has(key)) {
      next = clearGarmentScopedCustomDetailText(
        next,
        entry.garmentKey,
        entry.selectionGroup,
        entry.optionId,
      );
    }
  });
  return next;
};

export interface GarmentScopedCustomDetailInputEntry
  extends GarmentScopedCustomDetailInputIdentity {
  text: string;
}

export const enumerateGarmentScopedCustomDetailInputs = (
  state: GarmentScopedCustomDetailInputsV1,
): GarmentScopedCustomDetailInputEntry[] => {
  const normalized = cloneGarmentScopedCustomDetailInputs(state);
  return Object.keys(normalized.textByGarmentKey)
    .sort((left, right) => left.localeCompare(right))
    .flatMap((garmentKey) =>
      Object.keys(normalized.textByGarmentKey[garmentKey])
        .filter(isSelectionGroup)
        .sort(compareSelectionGroups)
        .flatMap((selectionGroup) => {
          const options = normalized.textByGarmentKey[garmentKey][selectionGroup];
          if (!options) return [];
          return Object.keys(options)
            .sort((left, right) => left.localeCompare(right))
            .map((optionId) => ({
              garmentKey,
              selectionGroup,
              optionId,
              text: options[optionId],
            }));
        }),
    );
};

export const isGarmentScopedCustomDetailInputsEmpty = (
  state: GarmentScopedCustomDetailInputsV1,
): boolean =>
  Object.keys(
    normalizeGarmentScopedCustomDetailInputs(state).state.textByGarmentKey,
  ).length === 0;
