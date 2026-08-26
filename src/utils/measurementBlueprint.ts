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
  FutureMeasurementEnteredBagV1,
  FutureMeasurementEnteredByRouteV1,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementRiskRoute,
  MeasurementUnit,
  Measurements,
  SelectedMeasurementRiskRoute,
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

export const MEASUREMENT_RISK_ROUTE_ORDER = [
  "low_risk",
  "medium_risk",
  "high_risk",
] as const satisfies ReadonlyArray<MeasurementRiskRoute>;

export const MEASUREMENT_RISK_ROUTE_LABELS: Record<MeasurementRiskRoute, string> = {
  low_risk: "Low / No Risk",
  medium_risk: "Mid Risk",
  high_risk: "High Risk",
};

export const MEASUREMENT_RISK_SELECTION_NOTICE =
  "Choose one measurement risk level and complete only the measurements shown for your selected option.";

const PATH_INPUT_BLOCKING_CODES = new Set<FutureMeasurementDiagnostic["code"]>([
  "required_measurement_missing",
  "invalid_measurement_value",
  "applicability_unresolved",
  "invalid_state",
  "invalid_measurement_id",
  "invalid_route",
  "invalid_unit",
]);

export const isSelectedMeasurementRiskRoute = (
  route: SelectedMeasurementRiskRoute | undefined,
): route is MeasurementRiskRoute =>
  route === "low_risk" || route === "medium_risk" || route === "high_risk";
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
  route: SelectedMeasurementRiskRoute;
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
  route: SelectedMeasurementRiskRoute;
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: readonly MeasurementPhysicalGarment[];
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
}): MeasurementRequirementPlan => {
  if (!isSelectedMeasurementRiskRoute(route)) {
    return {
      blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
      route: null,
      profiles: [],
      requirements: [],
      diagnostics: [],
      inputFingerprint: `measurement_unresolved_${MEASUREMENT_BLUEPRINT_VERSION}`,
      canCalculate: false,
    };
  }
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

const createEmptyEnteredBag = (): FutureMeasurementEnteredBagV1 => ({
  shared: {},
  byGarmentKey: {},
});

const createEmptyEnteredByRoute = (): FutureMeasurementEnteredByRouteV1 => ({
  low_risk: createEmptyEnteredBag(),
  medium_risk: createEmptyEnteredBag(),
  high_risk: createEmptyEnteredBag(),
});

const createEmptyInvalidKeysByRoute = (): Record<MeasurementRiskRoute, string[]> => ({
  low_risk: [],
  medium_risk: [],
  high_risk: [],
});

export const cloneFutureMeasurementEnteredBag = (
  bag: FutureMeasurementEnteredBagV1 | undefined,
): FutureMeasurementEnteredBagV1 => ({
  shared: { ...(bag?.shared || {}) },
  byGarmentKey: Object.fromEntries(
    Object.entries(bag?.byGarmentKey || {}).map(([key, values]) => [key, { ...values }]),
  ),
});

const cloneEnteredByRoute = (
  byRoute: FutureMeasurementEnteredByRouteV1 | undefined,
): FutureMeasurementEnteredByRouteV1 => ({
  low_risk: cloneFutureMeasurementEnteredBag(byRoute?.low_risk),
  medium_risk: cloneFutureMeasurementEnteredBag(byRoute?.medium_risk),
  high_risk: cloneFutureMeasurementEnteredBag(byRoute?.high_risk),
});

export const isFutureMeasurementEnteredBagEmpty = (
  bag: FutureMeasurementEnteredBagV1 | undefined,
): boolean =>
  !bag ||
  (Object.keys(bag.shared).length === 0 && Object.keys(bag.byGarmentKey).length === 0);

export const getActiveFutureMeasurementEntered = (
  state: FutureMeasurementStateV1,
): FutureMeasurementEnteredBagV1 => {
  if (!isSelectedMeasurementRiskRoute(state.route)) {
    return createEmptyEnteredBag();
  }
  if (state.enteredByRoute) {
    return cloneFutureMeasurementEnteredBag(state.enteredByRoute[state.route]);
  }
  return cloneFutureMeasurementEnteredBag(state.entered);
};

const ensureEnteredByRoute = (
  state: FutureMeasurementStateV1,
): FutureMeasurementEnteredByRouteV1 => {
  if (state.enteredByRoute) return cloneEnteredByRoute(state.enteredByRoute);
  const next = createEmptyEnteredByRoute();
  if (isSelectedMeasurementRiskRoute(state.route)) {
    next[state.route] = cloneFutureMeasurementEnteredBag(state.entered);
  }
  return next;
};

const ensureInvalidKeysByRoute = (
  state: FutureMeasurementStateV1,
): Record<MeasurementRiskRoute, string[]> => {
  const next = createEmptyInvalidKeysByRoute();
  if (state.invalidInputKeysByRoute) {
    MEASUREMENT_RISK_ROUTE_ORDER.forEach((route) => {
      next[route] = [...(state.invalidInputKeysByRoute?.[route] || [])];
    });
    return next;
  }
  if (isSelectedMeasurementRiskRoute(state.route)) {
    next[state.route] = [...state.invalidInputKeys];
  }
  return next;
};

export const createEmptyFutureMeasurementState = (
  route: SelectedMeasurementRiskRoute = null,
  unit: MeasurementUnit = "inch",
): FutureMeasurementStateV1 => ({
  schemaVersion: 1,
  route,
  unit,
  entered: createEmptyEnteredBag(),
  enteredByRoute: createEmptyEnteredByRoute(),
  derived: { shared: {}, byGarmentKey: {} },
  blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
  formulaVersion: MEASUREMENT_FORMULA_VERSION,
  inputFingerprint: "",
  calculationStatus: "incomplete",
  diagnostics: [],
  invalidInputKeys: [],
  invalidInputKeysByRoute: createEmptyInvalidKeysByRoute(),
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

const normalizeEnteredBag = (value: unknown): FutureMeasurementEnteredBagV1 => {
  if (!isRecord(value)) return createEmptyEnteredBag();
  return {
    shared: normalizeValueMap(value.shared, "customer_entered"),
    byGarmentKey: normalizeScopedValueMap(value.byGarmentKey, "customer_entered"),
  };
};

export const normalizeFutureMeasurementState = (
  value: unknown,
): FutureMeasurementStateV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const hasSelectedRoute = VALID_ROUTES.has(value.route as MeasurementRiskRoute);
  const hasUnresolvedRoute = value.route === null || value.route === undefined;
  if (!hasSelectedRoute && !hasUnresolvedRoute) return null;
  if (!VALID_UNITS.has(value.unit as MeasurementUnit)) return null;
  if (!isRecord(value.entered) || !isRecord(value.derived)) return null;
  const route = hasSelectedRoute
    ? (value.route as MeasurementRiskRoute)
    : null;
  const unit = value.unit as MeasurementUnit;
  const legacyEntered = normalizeEnteredBag(value.entered);
  const enteredByRouteSource = isRecord(value.enteredByRoute) ? value.enteredByRoute : null;
  const hasEnteredByRouteField = Boolean(enteredByRouteSource);
  const enteredByRoute = enteredByRouteSource
    ? {
        low_risk: normalizeEnteredBag(enteredByRouteSource.low_risk),
        medium_risk: normalizeEnteredBag(enteredByRouteSource.medium_risk),
        high_risk: normalizeEnteredBag(enteredByRouteSource.high_risk),
      }
    : createEmptyEnteredByRoute();
  if (!hasEnteredByRouteField && route) {
    enteredByRoute[route] = cloneFutureMeasurementEnteredBag(legacyEntered);
  } else if (
    hasEnteredByRouteField &&
    route &&
    isFutureMeasurementEnteredBagEmpty(enteredByRoute[route]) &&
    !isFutureMeasurementEnteredBagEmpty(legacyEntered)
  ) {
    enteredByRoute[route] = cloneFutureMeasurementEnteredBag(legacyEntered);
  }
  const unassignedEntered = !route && !hasEnteredByRouteField && !isFutureMeasurementEnteredBagEmpty(legacyEntered)
    ? cloneFutureMeasurementEnteredBag(legacyEntered)
    : !route
      ? normalizeEnteredBag(value.unassignedEntered)
      : undefined;
  const entered = route
    ? cloneFutureMeasurementEnteredBag(enteredByRoute[route])
    : createEmptyEnteredBag();
  const invalidInputKeysByRoute = createEmptyInvalidKeysByRoute();
  const normalizeKeys = (keys: unknown): string[] =>
    Array.isArray(keys)
      ? keys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
      : [];
  const invalidKeysSource = isRecord(value.invalidInputKeysByRoute)
    ? value.invalidInputKeysByRoute
    : null;
  if (invalidKeysSource) {
    MEASUREMENT_RISK_ROUTE_ORDER.forEach((riskRoute) => {
      invalidInputKeysByRoute[riskRoute] = normalizeKeys(invalidKeysSource[riskRoute]);
    });
  } else if (route) {
    invalidInputKeysByRoute[route] = normalizeKeys(value.invalidInputKeys);
  }
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
    enteredByRoute,
    ...(unassignedEntered && !isFutureMeasurementEnteredBagEmpty(unassignedEntered)
      ? { unassignedEntered }
      : {}),
    derived,
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: MEASUREMENT_FORMULA_VERSION,
    inputFingerprint: typeof value.inputFingerprint === "string" ? value.inputFingerprint : "",
    calculationStatus: "incomplete",
    diagnostics: [],
    invalidInputKeys: route ? invalidInputKeysByRoute[route] : [],
    invalidInputKeysByRoute,
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
  if (state.enteredByRoute) {
    state.enteredByRoute.low_risk = cloneFutureMeasurementEnteredBag(state.entered);
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
  if (!isSelectedMeasurementRiskRoute(state.route)) return state;
  const enteredByRoute = ensureEnteredByRoute(state);
  const entered = cloneFutureMeasurementEnteredBag(enteredByRoute[state.route]);
  const target = requirement.scope === "shared"
    ? entered.shared
    : (entered.byGarmentKey[requirement.garmentKey || ""] ||= {});
  const invalidInputKeysByRoute = ensureInvalidKeysByRoute(state);
  const invalidInputKeys = invalidInputKeysByRoute[state.route].filter(
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
  enteredByRoute[state.route] = entered;
  invalidInputKeysByRoute[state.route] = invalidInputKeys;
  return {
    ...state,
    entered,
    enteredByRoute,
    derived: { shared: {}, byGarmentKey: {} },
    invalidInputKeys,
    invalidInputKeysByRoute,
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

export const setFutureMeasurementRoute = (
  state: FutureMeasurementStateV1,
  route: MeasurementRiskRoute,
): FutureMeasurementStateV1 => {
  const enteredByRoute = ensureEnteredByRoute(state);
  const invalidInputKeysByRoute = ensureInvalidKeysByRoute(state);
  return {
    ...state,
    route,
    entered: cloneFutureMeasurementEnteredBag(enteredByRoute[route]),
    enteredByRoute,
    derived: { shared: {}, byGarmentKey: {} },
    calculationStatus: "incomplete",
    diagnostics: [],
    invalidInputKeys: [...invalidInputKeysByRoute[route]],
    invalidInputKeysByRoute,
  };
};

export const reconcileFutureMeasurementState = ({
  state,
  plan,
}: {
  state: FutureMeasurementStateV1;
  plan: MeasurementRequirementPlan;
}): FutureMeasurementStateV1 => {
  const route = isSelectedMeasurementRiskRoute(state.route)
    ? state.route
    : null;
  const enteredByRoute = ensureEnteredByRoute(state);
  const invalidInputKeysByRoute = ensureInvalidKeysByRoute(state);
  if (!route) {
    return {
      ...state,
      route: null,
      entered: createEmptyEnteredBag(),
      enteredByRoute,
      blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
      formulaVersion: MEASUREMENT_FORMULA_VERSION,
      inputFingerprint: plan.inputFingerprint,
      derived: { shared: {}, byGarmentKey: {} },
      calculationStatus: "incomplete",
      diagnostics: [],
      invalidInputKeys: [],
      invalidInputKeysByRoute,
    };
  }
  const entered = cloneFutureMeasurementEnteredBag(enteredByRoute[route]);
  const diagnostics = [...plan.diagnostics];
  const requiredDirect = plan.requirements.filter((requirement) => requirement.directInput);
  const invalidInputKeys = invalidInputKeysByRoute[route].filter((key) =>
    plan.requirements.some((requirement) => requirement.key === key),
  );
  invalidInputKeysByRoute[route] = invalidInputKeys;
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
      ? entered.shared[requirement.measurementId]
      : entered.byGarmentKey[requirement.garmentKey || ""]?.[requirement.measurementId];
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
    route,
    entered,
    enteredByRoute,
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
    invalidInputKeysByRoute,
  };
};

export const isFutureMeasurementStageUnlocked = (
  workflow: AiTryOnWorkflowStateV1,
): boolean => workflow.status === "completed" || workflow.status === "skipped";

export const isFutureMeasurementSelectedPathInputComplete = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean => {
  if (!state || !isSelectedMeasurementRiskRoute(state.route)) return false;
  return !state.diagnostics.some((diagnostic) =>
    PATH_INPUT_BLOCKING_CODES.has(diagnostic.code),
  );
};

export const isFutureMeasurementStageComplete = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean =>
  Boolean(
    isSelectedMeasurementRiskRoute(state?.route) &&
      state?.calculationStatus === "complete",
  );

export const isFutureSummaryUnlockedByMeasurements = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean =>
  state?.route === "low_risk" && state.calculationStatus === "complete";

const omitUnassignedEntered = (
  state: FutureMeasurementStateV1,
): Omit<FutureMeasurementStateV1, "unassignedEntered"> => {
  const { unassignedEntered, ...rest } = state;
  void unassignedEntered;
  return rest;
};

const cloneEnteredMap = (
  value: Record<string, FutureMeasurementValueV1>,
  allowedIds: ReadonlySet<string>,
): Record<string, FutureMeasurementValueV1> =>
  Object.fromEntries(
    Object.entries(value).filter(([measurementId]) => allowedIds.has(measurementId)),
  );

export const projectActiveFutureMeasurementState = ({
  state,
  plan,
}: {
  state: FutureMeasurementStateV1;
  plan: MeasurementRequirementPlan;
}): FutureMeasurementStateV1 => {
  const route = isSelectedMeasurementRiskRoute(state.route) ? state.route : null;
  if (!route || plan.route !== route) {
    return {
      ...omitUnassignedEntered(state),
      route,
      entered: createEmptyEnteredBag(),
      enteredByRoute: createEmptyEnteredByRoute(),
      derived: { shared: {}, byGarmentKey: {} },
    };
  }
  const activeEntered = getActiveFutureMeasurementEntered(state);
  const sharedIds = new Set(
    plan.requirements
      .filter((requirement) => requirement.directInput && requirement.scope === "shared")
      .map((requirement) => requirement.measurementId),
  );
  const garmentIds = new Map<string, Set<string>>();
  plan.requirements
    .filter((requirement) => requirement.directInput && requirement.scope === "garment" && requirement.garmentKey)
    .forEach((requirement) => {
      const garmentKey = requirement.garmentKey!;
      const ids = garmentIds.get(garmentKey) || new Set<string>();
      ids.add(requirement.measurementId);
      garmentIds.set(garmentKey, ids);
    });
  const entered = {
    shared: cloneEnteredMap(activeEntered.shared, sharedIds),
    byGarmentKey: Object.fromEntries(
      Object.entries(activeEntered.byGarmentKey).flatMap(([garmentKey, values]) => {
        const allowed = garmentIds.get(garmentKey);
        if (!allowed) return [];
        const next = cloneEnteredMap(values, allowed);
        return Object.keys(next).length ? [[garmentKey, next]] : [];
      }),
    ),
  };
  const enteredByRoute = createEmptyEnteredByRoute();
  enteredByRoute[route] = cloneFutureMeasurementEnteredBag(entered);
  return {
    ...omitUnassignedEntered(state),
    route,
    entered,
    enteredByRoute,
    derived: { shared: {}, byGarmentKey: {} },
  };
};

export const getMeasurementDefinition = (
  measurementId: CanonicalMeasurementId,
): MeasurementDefinition | undefined => DEFINITION_BY_ID.get(measurementId);

export const getMeasurementProfile = (
  profileId: MeasurementProfileId,
): MeasurementProfile | undefined => PROFILE_BY_ID.get(profileId);
