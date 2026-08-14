import {
  MEASUREMENT_BLUEPRINT_VERSION,
  MEASUREMENT_DEFINITIONS,
  MEASUREMENT_FORMULA_VERSION,
  MEASUREMENT_PROFILES,
  SQUARE_NECK_OPTION_IDS,
  type CanonicalMeasurementId,
  type MeasurementDefinition,
  type MeasurementProfile,
  type MeasurementProfileField,
  type MeasurementProfileId,
} from "../config/MeasurementBlueprintConfig";
import type {
  AiTryOnWorkflowStateV1,
  CanonicalPhysicalGarmentType,
  FabricGarmentAssignment,
  FabricGarmentType,
  FutureMeasurementDiagnostic,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
  MeasurementUnit,
  Measurements,
} from "../types";

const MEASUREMENT_ID_SET = new Set<CanonicalMeasurementId>(
  MEASUREMENT_DEFINITIONS.map((definition) => definition.id),
);
const PROFILE_BY_ID = new Map(
  MEASUREMENT_PROFILES.map((profile) => [profile.id, profile]),
);
const DEFINITION_BY_ID = new Map(
  MEASUREMENT_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const VALID_ROUTES = new Set<MeasurementRiskRoute>([
  "low_risk",
  "medium_risk",
  "high_risk",
]);
const VALID_UNITS = new Set<MeasurementUnit>(["inch", "cm"]);
const SQUARE_NECK_OPTION_ID_SET = new Set<string>(SQUARE_NECK_OPTION_IDS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const stableHash = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const getConstructionOptionIds = (
  selection: GarmentTypeStepSelection,
  garmentType: FabricGarmentType,
): string[] => {
  const resolution = selection.constructionByGarment[garmentType as CanonicalPhysicalGarmentType];
  return resolution?.status === "resolved"
    ? resolution.components.map((component) => component.optionId)
    : [];
};

export interface MeasurementPhysicalGarment {
  garmentKey: string;
  garmentType: FabricGarmentType;
}

export type MeasurementProfileResolution =
  | {
      status: "resolved";
      garmentKey: string;
      garmentType: FabricGarmentType;
      profile: MeasurementProfile;
      constructionOptionId: string | null;
    }
  | {
      status: "unmapped";
      garmentKey: string;
      garmentType: FabricGarmentType;
      code: "measurement_profile_unmapped";
    }
  | {
      status: "unresolved";
      garmentKey: string;
      garmentType: FabricGarmentType;
      code: "construction_unresolved" | "demographic_ineligible";
    };

export const getMeasurementPhysicalGarments = ({
  garmentTypeSelection,
  fabricGarments,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  fabricGarments?: readonly FabricGarmentAssignment[];
}): MeasurementPhysicalGarment[] => {
  const source = fabricGarments?.length
    ? fabricGarments.map(({ garmentKey, garmentType }) => ({ garmentKey, garmentType }))
    : garmentTypeSelection.garmentTypes.map((garmentType) => ({
        garmentKey: `main:${garmentType}:0`,
        garmentType,
      }));
  const seen = new Set<string>();
  return source.filter(({ garmentKey }) => {
    if (!garmentKey || seen.has(garmentKey)) return false;
    seen.add(garmentKey);
    return true;
  });
};

export const resolveMeasurementProfile = ({
  garment,
  garmentTypeSelection,
}: {
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
}): MeasurementProfileResolution => {
  const { garmentKey, garmentType } = garment;
  if (["kaftan", "full_length_gown", "agbada", "other"].includes(garmentType)) {
    return { status: "unmapped", garmentKey, garmentType, code: "measurement_profile_unmapped" };
  }
  const demographic = garmentTypeSelection.demographic;
  if (!demographic) {
    return { status: "unresolved", garmentKey, garmentType, code: "demographic_ineligible" };
  }
  const candidates = MEASUREMENT_PROFILES.filter(
    (profile) => profile.garmentType === garmentType,
  );
  const eligible = candidates.filter((profile) =>
    profile.demographics.includes(demographic),
  );
  if (eligible.length === 0) {
    return { status: "unresolved", garmentKey, garmentType, code: "demographic_ineligible" };
  }
  const constructionOptionIds = getConstructionOptionIds(
    garmentTypeSelection,
    garmentType,
  );
  if (eligible.length === 1 && eligible[0].constructionOptionIds.length === 0) {
    return {
      status: "resolved",
      garmentKey,
      garmentType,
      profile: eligible[0],
      constructionOptionId: constructionOptionIds[0] || null,
    };
  }
  const profile = eligible.find((candidate) =>
    candidate.constructionOptionIds.some((optionId) =>
      constructionOptionIds.includes(optionId),
    ),
  );
  const constructionOptionId = profile?.constructionOptionIds.find((optionId) =>
    constructionOptionIds.includes(optionId),
  );
  return profile
    ? {
        status: "resolved",
        garmentKey,
        garmentType,
        profile,
        constructionOptionId: constructionOptionId || null,
      }
    : { status: "unresolved", garmentKey, garmentType, code: "construction_unresolved" };
};

export interface PlannedMeasurementRequirement {
  key: string;
  measurementId: CanonicalMeasurementId;
  definition: MeasurementDefinition;
  scope: "shared" | "garment";
  garmentKey?: string;
  garmentType?: FabricGarmentType;
  profileId: MeasurementProfileId;
  sourceRow: number;
  directInput: boolean;
  inputSource: "route_marker" | "factorless_manual";
  averageFactor: number | null;
}

export interface MeasurementRequirementPlan {
  blueprintVersion: string;
  route: MeasurementRiskRoute;
  profiles: MeasurementProfileResolution[];
  requirements: PlannedMeasurementRequirement[];
  diagnostics: FutureMeasurementDiagnostic[];
  inputFingerprint: string;
  canCalculate: false;
}

const getSelectedOptionIds = (
  state: GarmentScopedCustomDetailsStateV1 | undefined,
  garmentKey: string,
): string[] => {
  const groups = state?.selectionsByGarmentKey[garmentKey];
  if (!groups) return [];
  return Object.values(groups).flatMap((selection) =>
    Array.isArray(selection) ? selection : selection ? [selection] : [],
  );
};

const resolveFieldApplicability = ({
  field,
  profile,
  constructionOptionId,
  selectedOptionIds,
}: {
  field: MeasurementProfileField;
  profile: MeasurementProfile;
  constructionOptionId: string | null;
  selectedOptionIds: readonly string[];
}): "include" | "exclude" | "unresolved" => {
  if (field.conditionalRule === "applicability_unresolved") return "unresolved";
  if (field.conditionalRule === "square_neck_option") {
    const neckSelections = selectedOptionIds.filter((optionId) => optionId.startsWith("neck_"));
    if (neckSelections.length === 0) return "unresolved";
    return neckSelections.some((optionId) => SQUARE_NECK_OPTION_ID_SET.has(optionId))
      ? "include"
      : "exclude";
  }
  if (field.alternativeGroup) {
    const selectedAlternative = constructionOptionId
      ? profile.alternativeSelectionByConstructionId?.[constructionOptionId]
      : undefined;
    if (!selectedAlternative) return "unresolved";
    return selectedAlternative === field.measurementId ? "include" : "exclude";
  }
  return "include";
};

export const planMeasurementRequirements = ({
  route,
  garmentTypeSelection,
  physicalGarments,
  garmentScopedCustomDetails,
}: {
  route: MeasurementRiskRoute;
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: readonly MeasurementPhysicalGarment[];
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
}): MeasurementRequirementPlan => {
  const profiles = physicalGarments.map((garment) =>
    resolveMeasurementProfile({ garment, garmentTypeSelection }),
  );
  const diagnostics: FutureMeasurementDiagnostic[] = [];
  const requirements = new Map<string, PlannedMeasurementRequirement>();

  profiles.forEach((resolution) => {
    if (resolution.status !== "resolved") {
      diagnostics.push({
        code: resolution.status === "unmapped"
          ? "measurement_profile_unmapped"
          : "applicability_unresolved",
        garmentKey: resolution.garmentKey,
        garmentType: resolution.garmentType,
      });
      return;
    }
    const selectedOptionIds = getSelectedOptionIds(
      garmentScopedCustomDetails,
      resolution.garmentKey,
    );
    resolution.profile.fields.forEach((field) => {
      const applicability = resolveFieldApplicability({
        field,
        profile: resolution.profile,
        constructionOptionId: resolution.constructionOptionId,
        selectedOptionIds,
      });
      if (applicability === "exclude") return;
      if (applicability === "unresolved") {
        if (field.directRoutes.includes(route) || field.directRoutes.includes("low_risk")) {
          diagnostics.push({
            code: "applicability_unresolved",
            garmentKey: resolution.garmentKey,
            garmentType: resolution.garmentType,
            measurementId: field.measurementId,
            profileId: resolution.profile.id,
          });
        }
        return;
      }
      const definition = DEFINITION_BY_ID.get(field.measurementId);
      if (!definition) return;
      const routeMarkerInput = field.directRoutes.includes(route);
      const factorlessManualInput =
        route !== "low_risk" &&
        field.averageFactor === null &&
        field.directRoutes.includes("low_risk");
      const directInput = routeMarkerInput || factorlessManualInput;
      const key = definition.scope === "shared_body"
        ? `shared:${field.measurementId}`
        : `${resolution.garmentKey}:${field.measurementId}`;
      if (!requirements.has(key)) {
        requirements.set(key, {
          key,
          measurementId: field.measurementId,
          definition,
          scope: definition.scope === "shared_body" ? "shared" : "garment",
          ...(definition.scope === "garment"
            ? {
                garmentKey: resolution.garmentKey,
                garmentType: resolution.garmentType,
              }
            : {}),
          profileId: resolution.profile.id,
          sourceRow: field.sourceRow,
          directInput,
          inputSource: factorlessManualInput
            ? "factorless_manual"
            : "route_marker",
          averageFactor: field.averageFactor,
        });
      } else if (directInput) {
        const current = requirements.get(key)!;
        if (!current.directInput) {
          requirements.set(key, {
            ...current,
            directInput: true,
            inputSource: factorlessManualInput
              ? "factorless_manual"
              : "route_marker",
          });
        }
      }
      if (!directInput && field.directRoutes.includes("low_risk")) {
        diagnostics.push({
          code: "calculation_configuration_pending",
          garmentKey: resolution.garmentKey,
          garmentType: resolution.garmentType,
          measurementId: field.measurementId,
          profileId: resolution.profile.id,
        });
      }
    });
    const requiresFutureCalculation =
      route !== "low_risk" &&
      resolution.profile.fields.some(
        (field) =>
          field.directRoutes.includes("low_risk") &&
          !field.directRoutes.includes(route) &&
          field.averageFactor !== null,
      );
    const hasCanonicalHeightInput = resolution.profile.fields.some(
      (field) =>
        field.measurementId === "total_height" &&
        field.directRoutes.includes(route),
    );
    if (requiresFutureCalculation && !hasCanonicalHeightInput) {
      diagnostics.push({
        code: "calculation_basis_unresolved",
        garmentKey: resolution.garmentKey,
        garmentType: resolution.garmentType,
        profileId: resolution.profile.id,
      });
    }
  });

  const orderedRequirements = [...requirements.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const fingerprintInput = {
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: MEASUREMENT_FORMULA_VERSION,
    route,
    profiles: profiles.map((resolution) =>
      resolution.status === "resolved"
        ? [resolution.garmentKey, resolution.profile.id, resolution.constructionOptionId]
        : [resolution.garmentKey, resolution.status, resolution.code],
    ),
    requirements: orderedRequirements.map((requirement) => [
      requirement.key,
      requirement.directInput,
      requirement.inputSource,
      requirement.averageFactor,
    ]),
    diagnostics: diagnostics.map((diagnostic) => [
      diagnostic.code,
      diagnostic.garmentKey,
      diagnostic.measurementId,
    ]),
  };
  return {
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    route,
    profiles,
    requirements: orderedRequirements,
    diagnostics,
    inputFingerprint: `measurement_${stableHash(fingerprintInput)}`,
    canCalculate: false,
  };
};

export const inchesToCentimetres = (value: number): number => value * 2.54;
export const centimetresToInches = (value: number): number => value / 2.54;
export const toCanonicalCentimetres = (
  value: number,
  unit: MeasurementUnit,
): number => unit === "inch" ? inchesToCentimetres(value) : value;
export const fromCanonicalCentimetres = (
  valueCm: number,
  unit: MeasurementUnit,
): number => unit === "inch" ? centimetresToInches(valueCm) : valueCm;
export const roundMeasurementDisplayValue = (value: number): number =>
  Math.round(value * 100) / 100;

export const createEmptyFutureMeasurementState = (
  route: MeasurementRiskRoute = "low_risk",
  unit: MeasurementUnit = "inch",
): FutureMeasurementStateV1 => ({
  schemaVersion: 1,
  route,
  unit,
  entered: { shared: {}, byGarmentKey: {} },
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: MEASUREMENT_FORMULA_VERSION,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
});

const normalizeValueMap = (
  value: unknown,
  provenance: FutureMeasurementValueV1["provenance"],
): Record<string, FutureMeasurementValueV1> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([measurementId, entry]) => {
      if (!MEASUREMENT_ID_SET.has(measurementId as CanonicalMeasurementId) || !isRecord(entry)) return [];
      const valueCm = entry.valueCm;
      return typeof valueCm === "number" && Number.isFinite(valueCm) && valueCm > 0 && entry.provenance === provenance
        ? [[measurementId, { valueCm, provenance }]]
        : [];
    }),
  );
};

const normalizeScopedValueMap = (
  value: unknown,
  provenance: FutureMeasurementValueV1["provenance"],
): Record<string, Record<string, FutureMeasurementValueV1>> => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([garmentKey, entries]) => {
      if (!garmentKey.trim()) return [];
      const normalized = normalizeValueMap(entries, provenance);
      return Object.keys(normalized).length ? [[garmentKey, normalized]] : [];
    }),
  );
};

export const normalizeFutureMeasurementState = (
  value: unknown,
): FutureMeasurementStateV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!VALID_ROUTES.has(value.route as MeasurementRiskRoute)) return null;
  if (!VALID_UNITS.has(value.unit as MeasurementUnit)) return null;
  if (!isRecord(value.entered) || !isRecord(value.derived)) return null;
  const route = value.route as MeasurementRiskRoute;
  const unit = value.unit as MeasurementUnit;
  const entered = {
    shared: normalizeValueMap(value.entered.shared, "customer_entered"),
    byGarmentKey: normalizeScopedValueMap(value.entered.byGarmentKey, "customer_entered"),
  };
  const derived = value.formulaVersion && value.formulaVersion === MEASUREMENT_FORMULA_VERSION
    ? {
        shared: normalizeValueMap(value.derived.shared, "system_derived"),
        byGarmentKey: normalizeScopedValueMap(value.derived.byGarmentKey, "system_derived"),
      }
    : { shared: {}, byGarmentKey: {} };
  return {
    schemaVersion: 1,
    route,
    unit,
    entered,
    derived,
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: MEASUREMENT_FORMULA_VERSION,
    inputFingerprint: typeof value.inputFingerprint === "string" ? value.inputFingerprint : "",
    calculationStatus: "incomplete",
    diagnostics: [],
    invalidInputKeys: Array.isArray(value.invalidInputKeys)
      ? value.invalidInputKeys.filter(
          (key): key is string => typeof key === "string" && key.trim().length > 0,
        )
      : [],
  };
};

export const migrateLegacyManualMeasurements = (
  measurements: Measurements,
  sizingMode: "ai" | "manual",
): FutureMeasurementStateV1 | null => {
  if (sizingMode !== "manual") return null;
  const state = createEmptyFutureMeasurementState("low_risk", measurements.unit === "cm" ? "cm" : "inch");
  const legacyMap: Array<[keyof Measurements, CanonicalMeasurementId]> = [
    ["neck", "neck_circumference"],
    ["shoulder", "shoulder_length"],
    ["chest", "chest_bust_circumference"],
    ["waist", "waist_circumference"],
    ["hip", "hip_circumference"],
  ];
  legacyMap.forEach(([legacyKey, measurementId]) => {
    const value = measurements[legacyKey];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      state.entered.shared[measurementId] = {
        valueCm: toCanonicalCentimetres(value, state.unit),
        provenance: "customer_entered",
      };
    }
  });
  if (
    typeof measurements.height === "number" &&
    Number.isFinite(measurements.height) &&
    measurements.height > 0
  ) {
    state.entered.shared.total_height = {
      valueCm: measurements.height,
      provenance: "customer_entered",
    };
  }
  return Object.keys(state.entered.shared).length ? state : null;
};

export const setFutureMeasurementInput = ({
  state,
  requirement,
  displayValue,
}: {
  state: FutureMeasurementStateV1;
  requirement: PlannedMeasurementRequirement;
  displayValue: number | null;
}): FutureMeasurementStateV1 => {
  const entered = {
    shared: { ...state.entered.shared },
    byGarmentKey: Object.fromEntries(
      Object.entries(state.entered.byGarmentKey).map(([key, values]) => [key, { ...values }]),
    ),
  };
  const target = requirement.scope === "shared"
    ? entered.shared
    : (entered.byGarmentKey[requirement.garmentKey || ""] ||= {});
  const invalidInputKeys = state.invalidInputKeys.filter(
    (key) => key !== requirement.key,
  );
  if (displayValue === null) {
    delete target[requirement.measurementId];
  } else if (!Number.isFinite(displayValue) || displayValue <= 0) {
    delete target[requirement.measurementId];
    invalidInputKeys.push(requirement.key);
  } else {
    target[requirement.measurementId] = {
      valueCm: toCanonicalCentimetres(displayValue, state.unit),
      provenance: "customer_entered",
    };
  }
  return {
    ...state,
    entered,
    derived: { shared: {}, byGarmentKey: {} },
    invalidInputKeys,
  };
};

export const setFutureMeasurementUnit = (
  state: FutureMeasurementStateV1,
  unit: MeasurementUnit,
): FutureMeasurementStateV1 => ({
  ...state,
  unit,
  derived: { shared: {}, byGarmentKey: {} },
});

export const reconcileFutureMeasurementState = ({
  state,
  plan,
}: {
  state: FutureMeasurementStateV1;
  plan: MeasurementRequirementPlan;
}): FutureMeasurementStateV1 => {
  const diagnostics = [...plan.diagnostics];
  const requiredDirect = plan.requirements.filter((requirement) => requirement.directInput);
  const invalidInputKeys = state.invalidInputKeys.filter((key) =>
    plan.requirements.some((requirement) => requirement.key === key),
  );
  invalidInputKeys.forEach((key) => {
    const requirement = plan.requirements.find((item) => item.key === key);
    if (!requirement) return;
    diagnostics.push({
      code: "invalid_measurement_value",
      garmentKey: requirement.garmentKey,
      garmentType: requirement.garmentType,
      measurementId: requirement.measurementId,
      profileId: requirement.profileId,
    });
  });
  requiredDirect.forEach((requirement) => {
    const value = requirement.scope === "shared"
      ? state.entered.shared[requirement.measurementId]
      : state.entered.byGarmentKey[requirement.garmentKey || ""]?.[requirement.measurementId];
    if (!value || !Number.isFinite(value.valueCm) || value.valueCm <= 0) {
      diagnostics.push({
        code: "required_measurement_missing",
        garmentKey: requirement.garmentKey,
        garmentType: requirement.garmentType,
        measurementId: requirement.measurementId,
        profileId: requirement.profileId,
      });
    }
  });
  const configurationPending = diagnostics.some(
    (diagnostic) => diagnostic.code === "calculation_configuration_pending",
  );
  const profileMappingPending = diagnostics.some(
    (diagnostic) => diagnostic.code === "measurement_profile_unmapped",
  );
  const invalid = diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "invalid_measurement_value" ||
      diagnostic.code === "invalid_state" ||
      diagnostic.code === "invalid_measurement_id",
  );
  const complete = diagnostics.length === 0;
  return {
    ...state,
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: MEASUREMENT_FORMULA_VERSION,
    inputFingerprint: plan.inputFingerprint,
    derived:
      state.inputFingerprint === plan.inputFingerprint
        ? state.derived
        : { shared: {}, byGarmentKey: {} },
    calculationStatus: invalid
      ? "invalid"
      : profileMappingPending
        ? "profile_mapping_pending"
        : configurationPending
          ? "calculation_formula_pending"
          : complete
            ? "complete"
            : "incomplete",
    diagnostics,
    invalidInputKeys,
  };
};

export const isFutureMeasurementStageUnlocked = (
  workflow: AiTryOnWorkflowStateV1,
): boolean => workflow.status === "completed" || workflow.status === "skipped";

export const isFutureMeasurementStageComplete = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean => state?.calculationStatus === "complete";

export const getMeasurementDefinition = (
  measurementId: CanonicalMeasurementId,
): MeasurementDefinition | undefined => DEFINITION_BY_ID.get(measurementId);

export const getMeasurementProfile = (
  profileId: MeasurementProfileId,
): MeasurementProfile | undefined => PROFILE_BY_ID.get(profileId);
