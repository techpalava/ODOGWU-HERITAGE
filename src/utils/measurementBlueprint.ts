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
import {
  calculateMeasurementFromAverageFactor,
  isManualValueOutsideExpectedRange,
} from "./measurementFactorEngine";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import {
  projectAuthoritativePhysicalOccurrences,
  resolveActiveDesignSource,
  resolveAuthoritativePhysicalOrder,
} from "./designSourceState";
import { buildEffectiveUploadedJourneyGarmentTypeSelection } from "./uploadedDesignStep1";
import type {
  AdditionalGarmentConstructionStateV1,
  AiTryOnWorkflowStateV1,
  CanonicalPhysicalGarmentType,
  CustomDetailOption,
  DesignSource,
  FabricAllocationState,
  FabricGarmentType,
  StyleCategory,
  FutureMeasurementDiagnostic,
  FutureMeasurementEnteredBagV1,
  FutureMeasurementEnteredByRouteV1,
  FutureMeasurementStateV1,
  FutureMeasurementValueV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementMethodId,
  MeasurementRiskRoute,
  MeasurementUnit,
  Measurements,
  SelectedMeasurementMethod,
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
  "critical_risk",
]);
const VALID_METHODS = new Set<MeasurementMethodId>([
  "low_risk",
  "medium_risk",
  "high_risk",
  "critical_risk",
  "sample_cloth",
]);

export const MEASUREMENT_RISK_ROUTE_ORDER = [
  "low_risk",
  "medium_risk",
  "high_risk",
  "critical_risk",
] as const satisfies ReadonlyArray<MeasurementRiskRoute>;

export const MEASUREMENT_SAMPLE_CLOTH_METHOD = "sample_cloth" as const;
export const MEASUREMENT_SAMPLE_CLOTH_LABEL = "Sample Cloth Measurements";
export const MEASUREMENT_SAMPLE_CLOTH_FORM_TITLE = "Sample Cloth Measurements";
export const MEASUREMENT_SAMPLE_CLOTH_REQUIRED_DESCRIPTION =
  "Measure these on the sample garment.";
export const MEASUREMENT_SAMPLE_CLOTH_CONVERTED_COPY =
  "Production equivalent (sample circumference = laid-flat width × 2). No extra ease is added, because the sample already includes the fit you like.";
export const MEASUREMENT_SAMPLE_CLOTH_DESCRIPTION =
  `${MEASUREMENT_SAMPLE_CLOTH_REQUIRED_DESCRIPTION} ${MEASUREMENT_SAMPLE_CLOTH_CONVERTED_COPY}`;
export const MEASUREMENT_SAMPLE_CLOTH_LENGTH_INSTRUCTION =
  "Measure on the sample.";
export const MEASUREMENT_SAMPLE_CLOTH_HALF_WIDTH_INSTRUCTION =
  "Measure across the sample garment laid flat.";
export const SAMPLE_CLOTH_PRODUCTION_SCALE = 2;

const SAMPLE_CLOTH_OMITTED_IDS = new Set<CanonicalMeasurementId>([
  "total_height",
  "height_head_to_lower_neck",
  "height_lower_neck_to_waist",
  "height_waist_to_feet",
  "head_circumference",
]);

const SAMPLE_CLOTH_HALF_WIDTH_IDS = new Set<CanonicalMeasurementId>([
  "chest_bust_circumference",
  "belly_circumference",
  "waist_circumference",
  "hip_circumference",
  "under_bust_circumference",
  "bicep_circumference",
  "elbow_circumference",
  "wrist_circumference",
  "thigh_circumference",
  "knee_circumference",
  "ankle_circumference",
]);

const SAMPLE_CLOTH_CUSTOMER_LABELS: Partial<Record<CanonicalMeasurementId, string>> = {
  chest_bust_circumference: "Chest / bust across sample (laid flat)",
  belly_circumference: "Belly across sample (laid flat)",
  waist_circumference: "Waist across sample (laid flat)",
  hip_circumference: "Hip across sample (laid flat)",
  under_bust_circumference: "Under-bust across sample (laid flat)",
  bicep_circumference: "Bicep across sample (laid flat)",
  elbow_circumference: "Elbow across sample (laid flat)",
  wrist_circumference: "Wrist across sample (laid flat)",
  thigh_circumference: "Thigh across sample (laid flat)",
  knee_circumference: "Knee across sample (laid flat)",
  ankle_circumference: "Ankle across sample (laid flat)",
};

export type SampleClothGeometry = "laid_flat_half_width" | "length_or_opening";

export const isSampleClothOmittedMeasurement = (
  measurementId: CanonicalMeasurementId,
): boolean => SAMPLE_CLOTH_OMITTED_IDS.has(measurementId);

export const isSampleClothHalfWidthMeasurement = (
  measurementId: string,
): measurementId is CanonicalMeasurementId =>
  SAMPLE_CLOTH_HALF_WIDTH_IDS.has(measurementId as CanonicalMeasurementId);

export const getSampleClothGeometry = (
  measurementId: CanonicalMeasurementId,
): SampleClothGeometry | null => {
  if (SAMPLE_CLOTH_OMITTED_IDS.has(measurementId)) return null;
  return SAMPLE_CLOTH_HALF_WIDTH_IDS.has(measurementId)
    ? "laid_flat_half_width"
    : "length_or_opening";
};

export const getSampleClothCustomerLabel = (
  measurementId: CanonicalMeasurementId,
  fallbackLabel: string,
): string => SAMPLE_CLOTH_CUSTOMER_LABELS[measurementId] || fallbackLabel;

export const getSampleClothFieldInstruction = (
  geometry: SampleClothGeometry | undefined,
): string =>
  geometry === "laid_flat_half_width"
    ? MEASUREMENT_SAMPLE_CLOTH_HALF_WIDTH_INSTRUCTION
    : MEASUREMENT_SAMPLE_CLOTH_LENGTH_INSTRUCTION;

export const getSampleClothProductionEquivalentCm = (valueCm: number): number =>
  valueCm * SAMPLE_CLOTH_PRODUCTION_SCALE;

export const MEASUREMENT_METHOD_ORDER = [
  ...MEASUREMENT_RISK_ROUTE_ORDER,
  MEASUREMENT_SAMPLE_CLOTH_METHOD,
] as const satisfies ReadonlyArray<MeasurementMethodId>;

export const MEASUREMENT_RISK_ROUTE_LABELS: Record<MeasurementRiskRoute, string> = {
  low_risk: "Low Risk",
  medium_risk: "Mid Risk",
  high_risk: "High Risk",
  critical_risk: "Critical Risk",
};

export const MEASUREMENT_METHOD_LABELS: Record<MeasurementMethodId, string> = {
  ...MEASUREMENT_RISK_ROUTE_LABELS,
  sample_cloth: MEASUREMENT_SAMPLE_CLOTH_LABEL,
};

export const CRITICAL_RISK_AVAILABLE_COPY =
  "Provide only your Total Height. All required measurements are calculated automatically.";
export const CRITICAL_RISK_UNAVAILABLE_COPY =
  "Critical Risk is unavailable for this garment selection because one or more required measurements cannot yet be calculated from height.";

export const criticalRiskUnavailableCopy = (
  garmentLabels: readonly string[],
): string => {
  if (garmentLabels.length === 0) return CRITICAL_RISK_UNAVAILABLE_COPY;
  const list =
    garmentLabels.length === 1
      ? garmentLabels[0]
      : garmentLabels.length === 2
        ? `${garmentLabels[0]} and ${garmentLabels[1]}`
        : `${garmentLabels.slice(0, -1).join(", ")}, and ${garmentLabels[garmentLabels.length - 1]}`;
  const verb = garmentLabels.length === 1 ? "needs" : "need";
  return `Critical Risk is unavailable because ${list} still ${verb} measurements that cannot be calculated from height.`;
};

export const MEASUREMENT_RISK_SELECTION_NOTICE =
  "Choose one measurement option and complete only the measurements shown for your selected method.";

const PATH_INPUT_BLOCKING_CODES = new Set<FutureMeasurementDiagnostic["code"]>([
  "required_measurement_missing",
  "invalid_measurement_value",
  "applicability_unresolved",
  "invalid_state",
  "invalid_measurement_id",
  "invalid_route",
  "invalid_unit",
]);

const NON_BLOCKING_DIAGNOSTIC_CODES = new Set<FutureMeasurementDiagnostic["code"]>([
  "measurement_range_recheck",
]);

export const isSelectedMeasurementRiskRoute = (
  route: SelectedMeasurementMethod | SelectedMeasurementRiskRoute | undefined,
): route is MeasurementRiskRoute =>
  typeof route === "string" && VALID_ROUTES.has(route as MeasurementRiskRoute);

export const isSampleClothMeasurementMethod = (
  route: SelectedMeasurementMethod | undefined,
): route is typeof MEASUREMENT_SAMPLE_CLOTH_METHOD =>
  route === MEASUREMENT_SAMPLE_CLOTH_METHOD;

export const isSelectedMeasurementMethod = (
  route: SelectedMeasurementMethod | undefined,
): route is MeasurementMethodId =>
  typeof route === "string" && VALID_METHODS.has(route as MeasurementMethodId);

export const getMeasurementPlanningRiskRoute = (
  method: MeasurementMethodId,
): MeasurementRiskRoute =>
  isSampleClothMeasurementMethod(method) ? "low_risk" : method;
const VALID_UNITS = new Set<MeasurementUnit>(["inch", "cm"]);
const SQUARE_NECK_OPTION_ID_SET = new Set<string>(SQUARE_NECK_OPTION_IDS);

const ALLOWED_MEASUREMENT_PROFILE_IDS_BY_PHYSICAL_GARMENT: Partial<
  Readonly<Record<FabricGarmentType, readonly MeasurementProfileId[]>>
> = {
  kaftan: ["C", "D"],
  long_skirt: ["M"],
};

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

const getBaseConstructionOptionIds = (
  selection: GarmentTypeStepSelection,
  garmentType: FabricGarmentType,
): string[] => {
  const resolution = selection.constructionByGarment[
    garmentType as CanonicalPhysicalGarmentType
  ];
  return resolution?.status === "resolved"
    ? resolution.components.map((component) => component.optionId)
    : [];
};

const getOccurrenceConstructionOptionIds = ({
  garment,
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): string[] | null => {
  if (garment.garmentKey.startsWith("additional:")) {
    const additionalResolution =
      additionalGarmentConstructions?.byGarmentKey[garment.garmentKey];
    if (!additionalResolution) return null;
    return additionalResolution.status === "resolved"
      ? additionalResolution.components.map((component) => component.optionId)
      : null;
  }
  return getBaseConstructionOptionIds(
    garmentTypeSelection,
    garment.garmentType,
  );
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
  physicalOccurrences,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalOccurrences?: readonly {
    garmentKey: string;
    garmentType: FabricGarmentType;
  }[];
}): MeasurementPhysicalGarment[] => {
  const source =
    physicalOccurrences && physicalOccurrences.length > 0
      ? physicalOccurrences.map(({ garmentKey, garmentType }) => ({
          garmentKey,
          garmentType,
        }))
      : garmentTypeSelection.garmentTypes.map((garmentType) => {
          const spec = createStyleBaseGarmentSpec(garmentType);
          return { garmentKey: spec.key, garmentType };
        });
  const seen = new Set<string>();
  return source.filter(({ garmentKey }) => {
    if (!garmentKey || seen.has(garmentKey)) return false;
    seen.add(garmentKey);
    return true;
  });
};

export const resolveHydratedMeasurementPhysicalGarments = ({
  garmentTypeSelection,
  designSource,
  selectedStyle,
  confirmedDesignSourceKey,
  normalizedCustomDetailCatalog,
  fabricAllocationState,
  additionalGarmentConstructionState,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  designSource?: DesignSource | null;
  selectedStyle?: StyleCategory | null;
  confirmedDesignSourceKey?: string | null;
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[];
  fabricAllocationState?: FabricAllocationState | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): MeasurementPhysicalGarment[] => {
  const authoritativePhysicalOrder = resolveAuthoritativePhysicalOrder({
    garmentTypeSelection,
    designSource,
    selectedStyle,
    confirmedDesignSourceKey,
    normalizedCustomDetailCatalog,
    fabricAllocationState,
    additionalGarmentConstructionState,
  });
  if (authoritativePhysicalOrder.status === "resolved") {
    return getMeasurementPhysicalGarments({
      garmentTypeSelection:
        authoritativePhysicalOrder.effectiveGarmentTypeSelection,
      physicalOccurrences: authoritativePhysicalOrder.physicalOccurrences,
    });
  }

  const activeSource = resolveActiveDesignSource(designSource, selectedStyle);
  const uploadedCompositionSpecs =
    activeSource?.kind === "uploaded"
      ? activeSource.fabricCapacityComposition
      : null;
  const effectiveGarmentTypeSelection =
    authoritativePhysicalOrder.sourceKind === "uploaded" &&
    uploadedCompositionSpecs
      ? buildEffectiveUploadedJourneyGarmentTypeSelection({
          step1Selection: garmentTypeSelection,
          uploadedComposition: uploadedCompositionSpecs,
          normalizedCustomDetailCatalog: normalizedCustomDetailCatalog || [],
        })
      : garmentTypeSelection;
  const physicalOccurrences = projectAuthoritativePhysicalOccurrences({
    sourceKind: authoritativePhysicalOrder.sourceKind,
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection,
    uploadedCompositionSpecs,
    additionalGarmentConstructionState,
  });
  return getMeasurementPhysicalGarments({
    garmentTypeSelection: effectiveGarmentTypeSelection,
    physicalOccurrences,
  });
};

export const resolveMeasurementProfile = ({
  garment,
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): MeasurementProfileResolution => {
  const { garmentKey, garmentType } = garment;
  if (["full_length_gown", "agbada", "other"].includes(garmentType)) {
    return { status: "unmapped", garmentKey, garmentType, code: "measurement_profile_unmapped" };
  }
  const demographic = garmentTypeSelection.demographic;
  if (!demographic) {
    return { status: "unresolved", garmentKey, garmentType, code: "demographic_ineligible" };
  }
  const measurementFamily =
    garmentType === "kaftan"
      ? "shirt"
      : garmentType === "long_skirt"
        ? "skirt"
        : garmentType;
  const allowedProfileIds =
    ALLOWED_MEASUREMENT_PROFILE_IDS_BY_PHYSICAL_GARMENT[garmentType];
  const candidates = MEASUREMENT_PROFILES.filter(
    (profile) =>
      profile.garmentType === measurementFamily &&
      (!allowedProfileIds || allowedProfileIds.includes(profile.id)),
  );
  const eligible = candidates.filter((profile) =>
    profile.demographics.includes(demographic),
  );
  if (eligible.length === 0) {
    return { status: "unresolved", garmentKey, garmentType, code: "demographic_ineligible" };
  }
  const constructionOptionIds = getOccurrenceConstructionOptionIds({
    garment,
    garmentTypeSelection,
    additionalGarmentConstructions,
  });
  if (!constructionOptionIds) {
    return { status: "unresolved", garmentKey, garmentType, code: "construction_unresolved" };
  }
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

/** Profile eligibility for one wearer. Does not invent a second measurement engine. */
export const isGarmentMeasurementEligibleForDemographic = ({
  garment,
  garmentTypeSelection,
  demographic,
  additionalGarmentConstructions,
}: {
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
  demographic: GarmentTypeStepSelection["demographic"];
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): boolean => {
  const resolution = resolveMeasurementProfile({
    garment,
    garmentTypeSelection: { ...garmentTypeSelection, demographic },
    additionalGarmentConstructions,
  });
  return !(
    resolution.status === "unresolved" &&
    resolution.code === "demographic_ineligible"
  );
};

export type MeasurementInputSource =
  | "route_marker"
  | "calculated_average_factor"
  | "optional_manual";

export interface PlannedMeasurementRequirement {
  key: string;
  manualValueKey: string;
  measurementId: CanonicalMeasurementId;
  definition: MeasurementDefinition;
  scope: "shared" | "garment";
  garmentKey: string;
  garmentType: FabricGarmentType;
  profileId: MeasurementProfileId;
  sourceRow: number;
  directInput: boolean;
  section: "required" | "optional";
  inputSource: MeasurementInputSource;
  averageFactor: number | null;
  minFactor: number | null;
  maxFactor: number | null;
  stdFactor: number | null;
  alternativeGroup?: string;
  sampleGeometry?: SampleClothGeometry;
}

export interface MeasurementRequirementPlan {
  blueprintVersion: string;
  route: SelectedMeasurementMethod;
  profiles: MeasurementProfileResolution[];
  requirements: PlannedMeasurementRequirement[];
  diagnostics: FutureMeasurementDiagnostic[];
  inputFingerprint: string;
  canCalculate: boolean;
  criticalRiskSupported: boolean;
  criticalRiskBlockingGarmentKeys: readonly string[];
}

const presentationBand = (requirement: PlannedMeasurementRequirement): number => {
  if (requirement.measurementId === "total_height") return 0;
  if (requirement.section === "required") return 1;
  if (requirement.inputSource === "calculated_average_factor") return 2;
  return 3;
};

const compareMeasurementRequirementsForPresentation = (
  left: PlannedMeasurementRequirement,
  right: PlannedMeasurementRequirement,
): number => {
  const band = presentationBand(left) - presentationBand(right);
  if (band !== 0) return band;
  const sourceRow = left.sourceRow - right.sourceRow;
  return sourceRow !== 0 ? sourceRow : left.key.localeCompare(right.key);
};

export const projectMeasurementRequirementsForPresentation = ({
  requirements,
  state,
}: {
  requirements: readonly PlannedMeasurementRequirement[];
  state?: FutureMeasurementStateV1;
}): PlannedMeasurementRequirement[] => {
  const ordered = [...requirements].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  const sharedManual = new Map<string, PlannedMeasurementRequirement>();
  const projected: PlannedMeasurementRequirement[] = [];

  ordered.forEach((requirement) => {
    if (
      requirement.scope === "shared" &&
      requirement.inputSource !== "calculated_average_factor"
    ) {
      const current = sharedManual.get(requirement.manualValueKey);
      if (!current || (requirement.directInput && !current.directInput)) {
        sharedManual.set(requirement.manualValueKey, requirement);
      }
      return;
    }
    if (
      requirement.inputSource === "calculated_average_factor" &&
      requirement.scope === "shared" &&
      Boolean(
        state?.entered.shared[requirement.measurementId] &&
          Number.isFinite(
            state.entered.shared[requirement.measurementId].valueCm,
          ) &&
          state.entered.shared[requirement.measurementId].valueCm > 0,
      )
    ) {
      return;
    }
    projected.push(requirement);
  });

  return [...sharedManual.values(), ...projected].sort(
    compareMeasurementRequirementsForPresentation,
  );
};

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

const isCompleteSetField = (field: MeasurementProfileField): boolean =>
  field.directRoutes.includes("low_risk");

export const isCriticalRiskCompleteSetCalculable = ({
  profile,
  constructionOptionId,
  selectedOptionIds = [],
}: {
  profile: MeasurementProfile;
  constructionOptionId: string | null;
  selectedOptionIds?: readonly string[];
}): boolean => {
  let hasHeight = false;
  for (const field of profile.fields) {
    if (!isCompleteSetField(field)) continue;
    const applicability = resolveFieldApplicability({
      field,
      profile,
      constructionOptionId,
      selectedOptionIds,
    });
    if (applicability === "exclude") continue;
    if (applicability === "unresolved") return false;
    if (field.measurementId === "total_height") {
      hasHeight = true;
      continue;
    }
    if (field.averageFactor === null) return false;
  }
  return hasHeight;
};

export const isCriticalRiskSupportedForOccurrence = ({
  garment,
  garmentTypeSelection,
  additionalGarmentConstructions,
  garmentScopedCustomDetails,
}: {
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
}): boolean => {
  const resolution = resolveMeasurementProfile({
    garment,
    garmentTypeSelection,
    additionalGarmentConstructions,
  });
  if (resolution.status !== "resolved") return false;
  return isCriticalRiskCompleteSetCalculable({
    profile: resolution.profile,
    constructionOptionId: resolution.constructionOptionId,
    selectedOptionIds: getSelectedOptionIds(
      garmentScopedCustomDetails,
      resolution.garmentKey,
    ),
  });
};

export const isCriticalRiskSupportedForSelection = ({
  garmentTypeSelection,
  physicalGarments,
  additionalGarmentConstructions,
  garmentScopedCustomDetails,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: readonly MeasurementPhysicalGarment[];
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
}): boolean =>
  physicalGarments.length > 0 &&
  physicalGarments.every((garment) =>
    isCriticalRiskSupportedForOccurrence({
      garment,
      garmentTypeSelection,
      additionalGarmentConstructions,
      garmentScopedCustomDetails,
    }),
  );

export const planMeasurementRequirements = ({
  route,
  garmentTypeSelection,
  physicalGarments,
  garmentScopedCustomDetails,
  additionalGarmentConstructions,
}: {
  route: SelectedMeasurementMethod;
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: readonly MeasurementPhysicalGarment[];
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): MeasurementRequirementPlan => {
  const criticalRiskBlockingGarmentKeys = physicalGarments
    .filter(
      (garment) =>
        !isCriticalRiskSupportedForOccurrence({
          garment,
          garmentTypeSelection,
          additionalGarmentConstructions,
          garmentScopedCustomDetails,
        }),
    )
    .map((garment) => garment.garmentKey);
  const criticalRiskSupported =
    physicalGarments.length > 0 && criticalRiskBlockingGarmentKeys.length === 0;
  if (!isSelectedMeasurementMethod(route)) {
    return {
      blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
      route: null,
      profiles: [],
      requirements: [],
      diagnostics: [],
      inputFingerprint: `measurement_unresolved_${MEASUREMENT_BLUEPRINT_VERSION}`,
      canCalculate: false,
      criticalRiskSupported,
      criticalRiskBlockingGarmentKeys,
    };
  }
  const planningRoute = getMeasurementPlanningRiskRoute(route);
  const profiles = physicalGarments
    .map((garment) =>
      resolveMeasurementProfile({
        garment,
        garmentTypeSelection,
        additionalGarmentConstructions,
      }),
    )
    .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey));
  const diagnostics: FutureMeasurementDiagnostic[] = [];
  const requirements: PlannedMeasurementRequirement[] = [];
  if (route === "critical_risk" && !criticalRiskSupported) {
    diagnostics.push({
      code: "calculation_configuration_pending",
    });
  }

  profiles.forEach((resolution) => {
    if (route === "critical_risk" && !criticalRiskSupported) return;
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
      if (route === "critical_risk") {
        if (!isCompleteSetField(field)) return;
        if (applicability === "unresolved" || (
          field.measurementId !== "total_height" && field.averageFactor === null
        )) {
          diagnostics.push({
            code: "calculation_configuration_pending",
            garmentKey: resolution.garmentKey,
            garmentType: resolution.garmentType,
            measurementId: field.measurementId,
            profileId: resolution.profile.id,
          });
          return;
        }
        const definition = DEFINITION_BY_ID.get(field.measurementId);
        if (!definition) return;
        const isHeight = field.measurementId === "total_height";
        const scope = definition.scope === "shared_body" ? "shared" : "garment";
        requirements.push({
          key: [
            route,
            resolution.garmentKey,
            resolution.profile.id,
            field.measurementId,
          ].join(":"),
          manualValueKey: scope === "shared"
            ? `shared:${field.measurementId}`
            : `${resolution.garmentKey}:${field.measurementId}`,
          measurementId: field.measurementId,
          definition,
          scope,
          garmentKey: resolution.garmentKey,
          garmentType: resolution.garmentType,
          profileId: resolution.profile.id,
          sourceRow: field.sourceRow,
          directInput: isHeight,
          section: isHeight ? "required" : "optional",
          inputSource: isHeight ? "route_marker" : "calculated_average_factor",
          averageFactor: field.averageFactor,
          minFactor: field.minFactor,
          maxFactor: field.maxFactor,
          stdFactor: field.stdFactor,
        });
        return;
      }
      const provenRequiredOnRoute = field.directRoutes.includes(planningRoute);
      // Unproven IF APPLICABLE rows stay optional. Unresolved alternative
      // groups (mid/long sleeve when construction cannot discriminate) stay
      // enterable as a one-of requirement: at least one member, never both
      // independently required, never both omissible.
      const requiredOnRoute = applicability === "unresolved"
        ? false
        : provenRequiredOnRoute;
      const alternativeOneOf = applicability === "unresolved"
        && Boolean(field.alternativeGroup)
        && provenRequiredOnRoute;
      const definition = DEFINITION_BY_ID.get(field.measurementId);
      if (!definition) return;
      const sampleGeometry = isSampleClothMeasurementMethod(route)
        ? getSampleClothGeometry(field.measurementId)
        : null;
      if (isSampleClothMeasurementMethod(route) && sampleGeometry === null) {
        return;
      }
      const inputSource: MeasurementInputSource = requiredOnRoute || alternativeOneOf
        ? "route_marker"
        : field.averageFactor === null
          ? "optional_manual"
          : "calculated_average_factor";
      const directInput = requiredOnRoute;
      const scope = definition.scope === "shared_body" ? "shared" : "garment";
      const key = [
        route,
        resolution.garmentKey,
        resolution.profile.id,
        field.measurementId,
      ].join(":");
      const nextRequirement: PlannedMeasurementRequirement = {
        key,
        manualValueKey: scope === "shared"
          ? `shared:${field.measurementId}`
          : `${resolution.garmentKey}:${field.measurementId}`,
        measurementId: field.measurementId,
        definition,
        scope,
        garmentKey: resolution.garmentKey,
        garmentType: resolution.garmentType,
        profileId: resolution.profile.id,
        sourceRow: field.sourceRow,
        directInput,
        section: requiredOnRoute || alternativeOneOf ? "required" : "optional",
        inputSource,
        averageFactor: field.averageFactor,
        minFactor: field.minFactor,
        maxFactor: field.maxFactor,
        stdFactor: field.stdFactor,
        ...(alternativeOneOf ? { alternativeGroup: field.alternativeGroup } : {}),
        ...(sampleGeometry ? { sampleGeometry } : {}),
      };
      requirements.push(nextRequirement);
    });
    const requiresFutureCalculation =
      planningRoute !== "low_risk" &&
      planningRoute !== "critical_risk" &&
      resolution.profile.fields.some(
        (field) =>
          field.directRoutes.includes("low_risk") &&
          !field.directRoutes.includes(planningRoute) &&
          field.averageFactor !== null,
      );
    const hasCanonicalHeightInput = resolution.profile.fields.some(
      (field) =>
        field.measurementId === "total_height" &&
        field.directRoutes.includes(planningRoute),
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

  const orderedRequirements = [...requirements].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  diagnostics.sort((left, right) =>
    [left.code, left.garmentKey || "", left.profileId || "", left.measurementId || ""]
      .join(":")
      .localeCompare(
        [right.code, right.garmentKey || "", right.profileId || "", right.measurementId || ""]
          .join(":"),
      ),
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
      requirement.section,
      requirement.inputSource,
      requirement.alternativeGroup || "",
      requirement.sampleGeometry || "",
      requirement.averageFactor,
      requirement.minFactor,
      requirement.maxFactor,
      requirement.stdFactor,
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
    canCalculate:
      route === "medium_risk" ||
      route === "high_risk" ||
      (route === "critical_risk" && criticalRiskSupported),
    criticalRiskSupported,
    criticalRiskBlockingGarmentKeys,
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
  critical_risk: createEmptyEnteredBag(),
  sample_cloth: createEmptyEnteredBag(),
});

const createEmptyInvalidKeysByRoute = (): Record<MeasurementMethodId, string[]> => ({
  low_risk: [],
  medium_risk: [],
  high_risk: [],
  critical_risk: [],
  sample_cloth: [],
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
  critical_risk: cloneFutureMeasurementEnteredBag(byRoute?.critical_risk),
  sample_cloth: cloneFutureMeasurementEnteredBag(byRoute?.sample_cloth),
});

export const isFutureMeasurementEnteredBagEmpty = (
  bag: FutureMeasurementEnteredBagV1 | undefined,
): boolean =>
  !bag ||
  (Object.keys(bag.shared).length === 0 && Object.keys(bag.byGarmentKey).length === 0);

export const getActiveFutureMeasurementEntered = (
  state: FutureMeasurementStateV1,
): FutureMeasurementEnteredBagV1 => {
  if (!isSelectedMeasurementMethod(state.route)) {
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
  if (isSelectedMeasurementMethod(state.route)) {
    next[state.route] = cloneFutureMeasurementEnteredBag(state.entered);
  }
  return next;
};

const ensureInvalidKeysByRoute = (
  state: FutureMeasurementStateV1,
): Record<MeasurementMethodId, string[]> => {
  const next = createEmptyInvalidKeysByRoute();
  if (state.invalidInputKeysByRoute) {
    MEASUREMENT_METHOD_ORDER.forEach((route) => {
      next[route] = [...(state.invalidInputKeysByRoute?.[route] || [])];
    });
    return next;
  }
  if (isSelectedMeasurementMethod(state.route)) {
    next[state.route] = [...state.invalidInputKeys];
  }
  return next;
};

export const createEmptyFutureMeasurementState = (
  route: SelectedMeasurementMethod = null,
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
  const hasSelectedMethod = VALID_METHODS.has(value.route as MeasurementMethodId);
  const hasUnresolvedRoute = value.route === null || value.route === undefined;
  if (!hasSelectedMethod && !hasUnresolvedRoute) return null;
  if (!VALID_UNITS.has(value.unit as MeasurementUnit)) return null;
  if (!isRecord(value.entered) || !isRecord(value.derived)) return null;
  const route = hasSelectedMethod
    ? (value.route as MeasurementMethodId)
    : null;
  const unit = value.unit as MeasurementUnit;
  const legacyEntered = normalizeEnteredBag(value.entered);
  const enteredByRouteSource = isRecord(value.enteredByRoute) ? value.enteredByRoute : null;
  const hasEnteredByRouteField = Boolean(enteredByRouteSource);
  if (
    hasEnteredByRouteField &&
    MEASUREMENT_METHOD_ORDER.some((method) =>
      Object.prototype.hasOwnProperty.call(enteredByRouteSource, method) &&
      enteredByRouteSource![method] != null &&
      !isRecord(enteredByRouteSource![method]),
    )
  ) {
    return null;
  }
  const enteredByRoute = enteredByRouteSource
    ? {
        low_risk: normalizeEnteredBag(enteredByRouteSource.low_risk),
        medium_risk: normalizeEnteredBag(enteredByRouteSource.medium_risk),
        high_risk: normalizeEnteredBag(enteredByRouteSource.high_risk),
        critical_risk: normalizeEnteredBag(enteredByRouteSource.critical_risk),
        sample_cloth: normalizeEnteredBag(enteredByRouteSource.sample_cloth),
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
    MEASUREMENT_METHOD_ORDER.forEach((riskRoute) => {
      invalidInputKeysByRoute[riskRoute] = normalizeKeys(invalidKeysSource[riskRoute]);
    });
  } else if (route) {
    invalidInputKeysByRoute[route] = normalizeKeys(value.invalidInputKeys);
  }
  const derived = { shared: {}, byGarmentKey: {} };
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

export type FutureMeasurementHydrationResult =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly state: FutureMeasurementStateV1 }
  | { readonly status: "invalid"; readonly preservedRaw: unknown };

export const isFutureMeasurementStateV1 = (
  value: unknown,
): value is FutureMeasurementStateV1 =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (value as { schemaVersion?: unknown }).schemaVersion === 1 &&
  "route" in value &&
  "entered" in value &&
  "derived" in value;

export const requireFutureMeasurementStateV1 = (
  value: unknown,
): FutureMeasurementStateV1 => {
  if (!isFutureMeasurementStateV1(value)) {
    throw new Error("Expected a single-wearer measurement document.");
  }
  return value;
};

export const FUTURE_MEASUREMENT_INVALID_HYDRATION_MESSAGE =
  "Your saved measurements could not be loaded. Your saved draft has been kept unchanged.";

export const classifyFutureMeasurementHydration = (
  value: unknown,
): FutureMeasurementHydrationResult => {
  if (value === undefined) return { status: "absent" };
  const state = normalizeFutureMeasurementState(value);
  if (state) return { status: "valid", state };
  return { status: "invalid", preservedRaw: value };
};

export const resolvePersistedFutureMeasurementState = ({
  hydration,
  reconciled,
}: {
  hydration: FutureMeasurementHydrationResult;
  reconciled: FutureMeasurementStateV1;
}): unknown =>
  hydration.status === "invalid" ? hydration.preservedRaw : reconciled;

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
  if (!isSelectedMeasurementMethod(state.route)) return state;
  if (requirement.inputSource === "calculated_average_factor") return state;
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
  route: MeasurementMethodId,
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

export const getEnteredMeasurementValue = (
  entered: FutureMeasurementEnteredBagV1,
  requirement: PlannedMeasurementRequirement,
): FutureMeasurementValueV1 | undefined =>
  requirement.scope === "shared"
    ? entered.shared[requirement.measurementId]
    : entered.byGarmentKey[requirement.garmentKey || ""]?.[requirement.measurementId];

const isPositiveMeasurementValue = (
  value: FutureMeasurementValueV1 | undefined,
): value is FutureMeasurementValueV1 =>
  Boolean(value && Number.isFinite(value.valueCm) && value.valueCm > 0);

export const getRequiredAlternativeGroupId = (
  requirement: PlannedMeasurementRequirement,
): string | null =>
  requirement.alternativeGroup &&
  requirement.section === "required" &&
  !requirement.directInput
    ? `${requirement.garmentKey}:${requirement.alternativeGroup}`
    : null;

export const collectRequiredAlternativeGroups = (
  requirements: readonly PlannedMeasurementRequirement[],
): Map<string, PlannedMeasurementRequirement[]> => {
  const groups = new Map<string, PlannedMeasurementRequirement[]>();
  requirements.forEach((requirement) => {
    const groupId = getRequiredAlternativeGroupId(requirement);
    if (!groupId) return;
    const current = groups.get(groupId) || [];
    current.push(requirement);
    groups.set(groupId, current);
  });
  return groups;
};

export const isRequiredAlternativeGroupSatisfied = ({
  members,
  entered,
  invalidInputKeys,
}: {
  members: readonly PlannedMeasurementRequirement[];
  entered: FutureMeasurementEnteredBagV1;
  invalidInputKeys: readonly string[];
}): boolean =>
  members.some((requirement) =>
    !invalidInputKeys.includes(requirement.key) &&
    isPositiveMeasurementValue(getEnteredMeasurementValue(entered, requirement)),
  );

const uniqueDirectInputRequirements = (
  requirements: readonly PlannedMeasurementRequirement[],
): PlannedMeasurementRequirement[] => {
  const byManualValueKey = new Map<string, PlannedMeasurementRequirement>();
  requirements.forEach((requirement) => {
    if (!requirement.directInput) return;
    if (!byManualValueKey.has(requirement.manualValueKey)) {
      byManualValueKey.set(requirement.manualValueKey, requirement);
    }
  });
  return [...byManualValueKey.values()];
};

export const countRequiredMeasurementUnits = (
  requirements: readonly PlannedMeasurementRequirement[],
): number =>
  uniqueDirectInputRequirements(requirements).length +
  collectRequiredAlternativeGroups(requirements).size;

export const countSatisfiedRequiredMeasurementUnits = ({
  requirements,
  entered,
  invalidInputKeys,
}: {
  requirements: readonly PlannedMeasurementRequirement[];
  entered: FutureMeasurementEnteredBagV1;
  invalidInputKeys: readonly string[];
}): number => {
  const individualSatisfied = uniqueDirectInputRequirements(requirements).filter(
    (requirement) =>
      !invalidInputKeys.includes(requirement.key) &&
      isPositiveMeasurementValue(getEnteredMeasurementValue(entered, requirement)),
  ).length;
  const satisfiedGroups = [...collectRequiredAlternativeGroups(requirements).values()]
    .filter((members) => isRequiredAlternativeGroupSatisfied({
      members,
      entered,
      invalidInputKeys,
    }))
    .length;
  return individualSatisfied + satisfiedGroups;
};

export const countRemainingRequiredMeasurementUnits = ({
  requirements,
  entered,
  invalidInputKeys,
}: {
  requirements: readonly PlannedMeasurementRequirement[];
  entered: FutureMeasurementEnteredBagV1;
  invalidInputKeys: readonly string[];
}): number =>
  Math.max(
    0,
    countRequiredMeasurementUnits(requirements) -
      countSatisfiedRequiredMeasurementUnits({
        requirements,
        entered,
        invalidInputKeys,
      }),
  );

export const collectPresentedRequiredMeasurementRequirements = ({
  plan,
  state,
}: {
  plan: MeasurementRequirementPlan;
  state: FutureMeasurementStateV1;
}): PlannedMeasurementRequirement[] =>
  projectMeasurementRequirementsForPresentation({
    requirements: plan.requirements,
    state,
  }).filter((requirement) => requirement.section === "required");

export const countRemainingCustomerRequiredMeasurementUnits = ({
  plan,
  state,
}: {
  plan: MeasurementRequirementPlan;
  state: FutureMeasurementStateV1;
}): number =>
  countRemainingRequiredMeasurementUnits({
    requirements: collectPresentedRequiredMeasurementRequirements({ plan, state }),
    entered: state.entered,
    invalidInputKeys: state.invalidInputKeys,
  });

const getRequirementFactors = (
  requirement: PlannedMeasurementRequirement,
) =>
  requirement.averageFactor !== null &&
  requirement.minFactor !== null &&
  requirement.maxFactor !== null &&
  requirement.stdFactor !== null
    ? {
        averageFactor: requirement.averageFactor,
        minFactor: requirement.minFactor,
        maxFactor: requirement.maxFactor,
        stdFactor: requirement.stdFactor,
      }
    : null;

export const deriveActiveCalculatedMeasurements = ({
  route,
  entered,
  plan,
  requiredComplete,
}: {
  route: MeasurementMethodId;
  entered: FutureMeasurementEnteredBagV1;
  plan: MeasurementRequirementPlan;
  requiredComplete: boolean;
}): FutureMeasurementStateV1["derived"] => {
  const derived: FutureMeasurementStateV1["derived"] = {
    shared: {},
    byGarmentKey: {},
  };
  if (route === "sample_cloth") {
    if (!requiredComplete) return derived;
    plan.requirements.forEach((requirement) => {
      if (requirement.sampleGeometry !== "laid_flat_half_width") return;
      const enteredValue = getEnteredMeasurementValue(entered, requirement);
      if (!isPositiveMeasurementValue(enteredValue)) return;
      const converted: FutureMeasurementValueV1 = {
        valueCm: getSampleClothProductionEquivalentCm(enteredValue.valueCm),
        provenance: "system_derived",
      };
      if (requirement.scope === "shared") {
        derived.shared[requirement.measurementId] = converted;
        return;
      }
      (derived.byGarmentKey[requirement.garmentKey] ||= {})[requirement.measurementId] =
        converted;
    });
    return derived;
  }
  if (route === "low_risk" || !requiredComplete) return derived;
  const height = entered.shared.total_height;
  if (!isPositiveMeasurementValue(height)) return derived;
  plan.requirements.forEach((requirement) => {
    if (
      requirement.inputSource !== "calculated_average_factor" ||
      requirement.averageFactor === null
    ) {
      return;
    }
    if (
      requirement.scope === "shared" &&
      isPositiveMeasurementValue(entered.shared[requirement.measurementId])
    ) {
      return;
    }
    const derivedValue: FutureMeasurementValueV1 = {
      valueCm: calculateMeasurementFromAverageFactor(
        height.valueCm,
        requirement.averageFactor,
      ),
      provenance: "calculated_average_factor",
      calculation: {
        route,
        profileId: requirement.profileId,
        garmentKey: requirement.garmentKey,
        measurementId: requirement.measurementId,
        averageFactor: requirement.averageFactor,
      },
    };
    (derived.byGarmentKey[requirement.garmentKey] ||= {})[requirement.measurementId] =
      derivedValue;
  });
  return derived;
};

export const reconcileFutureMeasurementState = ({
  state,
  plan,
}: {
  state: FutureMeasurementStateV1;
  plan: MeasurementRequirementPlan;
}): FutureMeasurementStateV1 => {
  const route = isSelectedMeasurementMethod(state.route)
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
  if (isSampleClothMeasurementMethod(route)) {
    SAMPLE_CLOTH_OMITTED_IDS.forEach((measurementId) => {
      delete entered.shared[measurementId];
    });
  }
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
    const value = getEnteredMeasurementValue(entered, requirement);
    if (!isPositiveMeasurementValue(value)) {
      diagnostics.push({
        code: "required_measurement_missing",
        garmentKey: requirement.garmentKey,
        garmentType: requirement.garmentType,
        measurementId: requirement.measurementId,
        profileId: requirement.profileId,
      });
      return;
    }
    const heightValue = entered.shared.total_height?.valueCm;
    if (
      !isSampleClothMeasurementMethod(route) &&
      heightValue &&
      Number.isFinite(heightValue) &&
      heightValue > 0 &&
      isManualValueOutsideExpectedRange({
        value: value.valueCm,
        heightValue,
        factors: getRequirementFactors(requirement),
      })
    ) {
      diagnostics.push({
        code: "measurement_range_recheck",
        garmentKey: requirement.garmentKey,
        garmentType: requirement.garmentType,
        measurementId: requirement.measurementId,
        profileId: requirement.profileId,
      });
    }
  });
  collectRequiredAlternativeGroups(plan.requirements).forEach((members) => {
    if (isRequiredAlternativeGroupSatisfied({
      members,
      entered,
      invalidInputKeys,
    })) return;
    const representative = members[0];
    if (!representative) return;
    diagnostics.push({
      code: "required_measurement_missing",
      garmentKey: representative.garmentKey,
      garmentType: representative.garmentType,
      profileId: representative.profileId,
    });
  });
  plan.requirements
    .filter((requirement) => requirement.inputSource === "calculated_average_factor")
    .forEach((requirement) => {
      const hasCompatibleManualRequirement = plan.requirements.some(
        (candidate) =>
          candidate.manualValueKey === requirement.manualValueKey &&
          candidate.inputSource !== "calculated_average_factor",
      );
      if (hasCompatibleManualRequirement) return;
      if (requirement.scope === "shared") {
        delete entered.shared[requirement.measurementId];
        return;
      }
      const garmentKey = requirement.garmentKey || "";
      if (entered.byGarmentKey[garmentKey]) {
        delete entered.byGarmentKey[garmentKey][requirement.measurementId];
      }
    });
  const blockingDiagnostics = diagnostics.filter(
    (diagnostic) => !NON_BLOCKING_DIAGNOSTIC_CODES.has(diagnostic.code),
  );
  const profileMappingPending = blockingDiagnostics.some(
    (diagnostic) => diagnostic.code === "measurement_profile_unmapped",
  );
  const invalid = blockingDiagnostics.some(
    (diagnostic) =>
      diagnostic.code === "invalid_measurement_value" ||
      diagnostic.code === "invalid_state" ||
      diagnostic.code === "invalid_measurement_id",
  );
  const requiredValuesComplete = requiredDirect.every((requirement) =>
    isPositiveMeasurementValue(getEnteredMeasurementValue(entered, requirement)),
  );
  const complete = blockingDiagnostics.length === 0;
  const derived = deriveActiveCalculatedMeasurements({
    route,
    entered,
    plan,
    requiredComplete: requiredValuesComplete,
  });
  return {
    ...state,
    route,
    entered,
    enteredByRoute: {
      ...enteredByRoute,
      [route]: cloneFutureMeasurementEnteredBag(entered),
    },
    blueprintVersion: MEASUREMENT_BLUEPRINT_VERSION,
    formulaVersion: MEASUREMENT_FORMULA_VERSION,
    inputFingerprint: plan.inputFingerprint,
    derived,
    calculationStatus: invalid
      ? "invalid"
      : profileMappingPending
        ? "profile_mapping_pending"
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
  if (!state || !isSelectedMeasurementMethod(state.route)) return false;
  return !state.diagnostics.some((diagnostic) =>
    PATH_INPUT_BLOCKING_CODES.has(diagnostic.code),
  );
};

export const isFutureMeasurementStageComplete = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean =>
  Boolean(
    isSelectedMeasurementMethod(state?.route) &&
      state?.calculationStatus === "complete",
  );

export const isFutureSummaryUnlockedByMeasurements = (
  state: FutureMeasurementStateV1 | null | undefined,
): boolean =>
  Boolean(
    isSelectedMeasurementMethod(state?.route) &&
      state?.calculationStatus === "complete",
  );

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
  provenance?: FutureMeasurementValueV1["provenance"],
): Record<string, FutureMeasurementValueV1> =>
  Object.fromEntries(
    Object.entries(value).filter(([measurementId, entry]) =>
      allowedIds.has(measurementId) &&
      (!provenance || entry.provenance === provenance),
    ),
  );

export const projectActiveFutureMeasurementState = ({
  state,
  plan,
}: {
  state: FutureMeasurementStateV1;
  plan: MeasurementRequirementPlan;
}): FutureMeasurementStateV1 => {
  const route = isSelectedMeasurementMethod(state.route) ? state.route : null;
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
      .filter((requirement) =>
        requirement.scope === "shared" &&
        requirement.inputSource !== "calculated_average_factor",
      )
      .map((requirement) => requirement.measurementId),
  );
  const garmentIds = new Map<string, Set<string>>();
  plan.requirements
    .filter((requirement) =>
      requirement.scope === "garment" &&
      requirement.garmentKey &&
      requirement.inputSource !== "calculated_average_factor",
    )
    .forEach((requirement) => {
      const garmentKey = requirement.garmentKey!;
      const ids = garmentIds.get(garmentKey) || new Set<string>();
      ids.add(requirement.measurementId);
      garmentIds.set(garmentKey, ids);
    });
  const entered = {
    shared: cloneEnteredMap(activeEntered.shared, sharedIds, "customer_entered"),
    byGarmentKey: Object.fromEntries(
      Object.entries(activeEntered.byGarmentKey).flatMap(([garmentKey, values]) => {
        const allowed = garmentIds.get(garmentKey);
        if (!allowed) return [];
        const next = cloneEnteredMap(values, allowed, "customer_entered");
        return Object.keys(next).length ? [[garmentKey, next]] : [];
      }),
    ),
  };
  const enteredByRoute = createEmptyEnteredByRoute();
  enteredByRoute[route] = cloneFutureMeasurementEnteredBag(entered);
  const calculatedGarmentIds = new Map<string, Set<string>>();
  plan.requirements
    .filter((requirement) =>
      requirement.inputSource === "calculated_average_factor",
    )
    .forEach((requirement) => {
      const garmentKey = requirement.garmentKey;
      const ids = calculatedGarmentIds.get(garmentKey) || new Set<string>();
      ids.add(requirement.measurementId);
      calculatedGarmentIds.set(garmentKey, ids);
    });
  const calculatedDerived = {
    shared: {},
    byGarmentKey: Object.fromEntries(
      Object.entries(state.derived.byGarmentKey).flatMap(([garmentKey, values]) => {
        const allowed = calculatedGarmentIds.get(garmentKey);
        if (!allowed) return [];
        const next = cloneEnteredMap(values, allowed, "calculated_average_factor");
        return Object.keys(next).length ? [[garmentKey, next]] : [];
      }),
    ),
  };
  const derived = route === "sample_cloth"
    ? {
        shared: cloneEnteredMap(
          state.derived.shared,
          new Set(
            plan.requirements
              .filter((requirement) =>
                requirement.scope === "shared" &&
                requirement.sampleGeometry === "laid_flat_half_width",
              )
              .map((requirement) => requirement.measurementId),
          ),
          "system_derived",
        ),
        byGarmentKey: Object.fromEntries(
          Object.entries(state.derived.byGarmentKey).flatMap(([garmentKey, values]) => {
            const allowed = new Set(
              plan.requirements
                .filter((requirement) =>
                  requirement.garmentKey === garmentKey &&
                  requirement.sampleGeometry === "laid_flat_half_width",
                )
                .map((requirement) => requirement.measurementId),
            );
            if (allowed.size === 0) return [];
            const next = cloneEnteredMap(values, allowed, "system_derived");
            return Object.keys(next).length ? [[garmentKey, next]] : [];
          }),
        ),
      }
    : calculatedDerived;
  return {
    ...omitUnassignedEntered(state),
    route,
    entered,
    enteredByRoute,
    derived,
  };
};

export const getResolvedMeasurementValue = (
  state: FutureMeasurementStateV1,
  requirement: PlannedMeasurementRequirement,
): FutureMeasurementValueV1 | undefined => {
  const entered = getEnteredMeasurementValue(
    getActiveFutureMeasurementEntered(state),
    requirement,
  );
  if (isPositiveMeasurementValue(entered)) return entered;
  if (requirement.inputSource === "calculated_average_factor") {
    return state.derived.byGarmentKey[requirement.garmentKey]?.[
      requirement.measurementId
    ];
  }
  return entered;
};

export const getMeasurementDefinition = (
  measurementId: CanonicalMeasurementId,
): MeasurementDefinition | undefined => DEFINITION_BY_ID.get(measurementId);

export const getMeasurementProfile = (
  profileId: MeasurementProfileId,
): MeasurementProfile | undefined => PROFILE_BY_ID.get(profileId);
