import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
import {
  createStyleBaseGarmentSpec,
  FABRIC_GARMENT_CAPACITY_UNITS,
} from "../config/StyleFabricCapacityConfig";
import type {
  CartItem,
  FabricAllocation,
  AdditionalGarmentDependencyStatus,
  AdditionalGarmentEligibilityRule,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  FabricGarmentRole,
  GuestDesignDraft,
  MasterOrder,
} from "../types";
import { getCatalogDesignSourceKey } from "./designSourceState";
import {
  isCanonicalPhysicalGarmentType,
  isCustomerSelectableGarmentType,
} from "./garmentConstructionPricing";

type LowerGarmentType = "trousers" | "skirt";
const GARMENT_TYPES: readonly FabricGarmentType[] = [
  "shirt",
  "standard_shorts",
  "trouser",
  "dress",
  "skirt",
  "long_skirt",
  "kaftan",
  "full_length_gown",
  "bum_shorts",
  "agbada",
  "other",
];
const GARMENT_TYPE_SET = new Set<FabricGarmentType>(GARMENT_TYPES);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const hasOwn = (value: unknown, key: string): boolean =>
  isRecord(value) && Object.prototype.hasOwnProperty.call(value, key);

const normalizeGarmentType = (value: unknown): FabricGarmentType | null => {
  if (typeof value !== "string") return null;
  if (!GARMENT_TYPE_SET.has(value as FabricGarmentType)) return null;
  return value as FabricGarmentType;
};

const normalizeLowerGarmentType = (
  value: unknown,
): LowerGarmentType | undefined =>
  value === "trousers" || value === "skirt" ? value : undefined;

const normalizeGarmentRole = (value: unknown): FabricGarmentRole | undefined =>
  value === "main" || value === "additional" ? value : undefined;

const normalizeAdditionalDependencyStatus = (
  value: unknown,
): AdditionalGarmentDependencyStatus | undefined =>
  value === "valid" || value === "orphaned" ? value : undefined;

const normalizeAdditionalEligibilityRule = (
  value: unknown,
): AdditionalGarmentEligibilityRule | undefined =>
  value === "same_type" ||
  value === "demographic_policy" ||
  value === "catalog_all"
    ? value
    : undefined;

type ReservedCanonicalOccurrenceIdentity = {
  sourceRole: FabricGarmentRole;
  garmentType: FabricGarmentType;
  allowedCodes: readonly string[];
};

const isReservedCanonicalOccurrenceKeyFamily = (garmentKey: string): boolean =>
  garmentKey.startsWith("base:") || garmentKey.startsWith("additional:");

/**
 * A reserved key is its own persisted identity. Keep the parser stricter than
 * the older additional-key reader: leading-zero sequences are not canonical
 * occurrence identities and must not fall through to legacy normalization.
 */
const getReservedCanonicalOccurrenceIdentity = (
  garmentKey: string,
): ReservedCanonicalOccurrenceIdentity | null => {
  const additionalMatch = garmentKey.match(
    /^additional:([^:]+):([1-9][0-9]*)$/,
  );
  if (additionalMatch) {
    const garmentType = normalizeGarmentType(additionalMatch[1]);
    if (!garmentType || !isCanonicalPhysicalGarmentType(garmentType)) {
      return null;
    }
    const sequence = additionalMatch[2];
    return {
      sourceRole: "additional",
      garmentType,
      allowedCodes: [
        `ADDITIONAL_${garmentType.toUpperCase()}`,
        `ADDITIONAL_${garmentType.toUpperCase()}_${sequence}`,
      ],
    };
  }

  const baseMatch = garmentKey.match(/^base:([^:]+)$/);
  if (baseMatch) {
    const garmentType = normalizeGarmentType(baseMatch[1]);
    if (
      !garmentType ||
      !isCanonicalPhysicalGarmentType(garmentType) ||
      garmentKey !== createStyleBaseGarmentSpec(garmentType).key
    ) {
      return null;
    }
    return {
      sourceRole: "main",
      garmentType,
      allowedCodes: [
        `BASE_${garmentType.toUpperCase()}`,
        `STYLE_BASE_${garmentType.toUpperCase()}`,
      ],
    };
  }

  return null;
};

const isLegacyAdditionalGarmentShape = (
  assignment: FabricGarmentAssignment,
): boolean =>
  assignment.code.startsWith("CUSTOM_DETAIL_ADDITIONAL_GARMENT_") ||
  assignment.garmentSpec?.key.startsWith(
    "custom-detail:additional_physical_garment:",
  ) === true;

const isCanonicalCatalogueAdditionalOccurrence = ({
  garmentKey,
  code,
  garmentType,
  fabricUnits,
}: Pick<
  FabricGarmentAssignment,
  "garmentKey" | "code" | "garmentType" | "fabricUnits"
>): boolean =>
  isCustomerSelectableGarmentType(garmentType) &&
  fabricUnits === FABRIC_GARMENT_CAPACITY_UNITS[garmentType] &&
  code === `ADDITIONAL_${garmentType.toUpperCase()}` &&
  new RegExp(`^additional:${garmentType}:[1-9][0-9]*$`).test(garmentKey);

/**
 * Reserved occurrence keys are complete identities. They always validate their
 * role, code, type, and capacity, whether the historical row supplied a role
 * or not. Generic historical keys remain outside this canonical contract.
 */
const hasCoherentCanonicalOccurrenceIdentity = ({
  assignment,
}: {
  assignment: FabricGarmentAssignment;
}): boolean => {
  const identity = getReservedCanonicalOccurrenceIdentity(
    assignment.garmentKey,
  );
  if (!identity) {
    // A malformed claim to a reserved key is never a generic legacy key.
    return !isReservedCanonicalOccurrenceKeyFamily(assignment.garmentKey);
  }
  return (
    assignment.sourceRole === identity.sourceRole &&
    assignment.garmentType === identity.garmentType &&
    assignment.fabricUnits === FABRIC_GARMENT_CAPACITY_UNITS[identity.garmentType] &&
    identity.allowedCodes.includes(assignment.code)
  );
};

const hasCoherentGarmentSpec = (
  assignment: FabricGarmentAssignment,
): boolean =>
  !assignment.garmentSpec ||
  (!assignment.garmentKey.startsWith("base:") &&
    !assignment.garmentKey.startsWith("additional:")) ||
  (assignment.garmentSpec.key === assignment.garmentKey &&
    assignment.garmentSpec.garmentType === assignment.garmentType &&
    assignment.garmentSpec.fabricUnits === assignment.fabricUnits &&
    assignment.garmentSpec.lowerGarmentType === assignment.lowerGarmentType);

/**
 * Generic Custom Detail additional rows predate structured role metadata. If
 * they are promoted, their legacy code/spec must still describe the same
 * garment as the final normalized assignment.
 */
const hasCoherentLegacyAdditionalIdentity = (
  assignment: FabricGarmentAssignment,
): boolean => {
  if (!isLegacyAdditionalGarmentShape(assignment)) return true;
  if (assignment.sourceRole !== "additional") return false;
  if (
    assignment.code.startsWith("CUSTOM_DETAIL_ADDITIONAL_GARMENT_") &&
    assignment.code !==
      `CUSTOM_DETAIL_ADDITIONAL_GARMENT_${assignment.garmentType.toUpperCase()}`
  ) {
    return false;
  }
  return (
    !assignment.garmentSpec ||
    (assignment.garmentSpec.garmentType === assignment.garmentType &&
      assignment.garmentSpec.fabricUnits === assignment.fabricUnits)
  );
};

const hasCoherentFinalAssignmentIdentity = (
  assignment: FabricGarmentAssignment,
): boolean =>
  hasCoherentCanonicalOccurrenceIdentity({ assignment }) &&
  hasCoherentGarmentSpec(assignment) &&
  hasCoherentLegacyAdditionalIdentity(assignment);

const normalizeGarmentSpecStrict = (
  value: unknown,
): FabricCapacityGarmentSpec | null => {
  if (!isRecord(value)) return null;
  const key = typeof value.key === "string" ? value.key : null;
  const garmentType = normalizeGarmentType(value.garmentType);
  const fabricUnits = value.fabricUnits;
  if (!key || !garmentType || (fabricUnits !== 1 && fabricUnits !== 2)) {
    return null;
  }

  const lowerGarmentType = normalizeLowerGarmentType(value.lowerGarmentType);
  if (hasOwn(value, "lowerGarmentType") && !lowerGarmentType) {
    return null;
  }

  return {
    key,
    garmentType,
    fabricUnits,
    ...(lowerGarmentType ? { lowerGarmentType } : {}),
  };
};

interface FabricAllocationInspectionOptions {
  /**
   * Revision-342-era catalogue additions omitted relationship metadata. This
   * compatibility path is intentionally available only to a draft whose
   * persisted design source structurally proves catalogue lineage.
   */
  allowHistoricalCatalogueAdditionalFallback?: boolean;
}

const normalizeGarmentAssignmentStrict = (
  value: unknown,
  options: FabricAllocationInspectionOptions = {},
): FabricGarmentAssignment | null => {
  if (!isRecord(value)) return null;

  const garmentKey =
    typeof value.garmentKey === "string" ? value.garmentKey : null;
  const code = typeof value.code === "string" ? value.code : null;
  const garmentType = normalizeGarmentType(value.garmentType);
  const fabricUnits = value.fabricUnits;
  if (
    !garmentKey ||
    !code ||
    !garmentType ||
    (fabricUnits !== 1 && fabricUnits !== 2)
  ) {
    return null;
  }

  const lowerGarmentType = normalizeLowerGarmentType(value.lowerGarmentType);
  if (hasOwn(value, "lowerGarmentType") && !lowerGarmentType) {
    return null;
  }

  const assignment: FabricGarmentAssignment = {
    garmentKey,
    code,
    garmentType,
    fabricUnits,
    ...(lowerGarmentType ? { lowerGarmentType } : {}),
  };

  const sourceRole = normalizeGarmentRole(value.sourceRole);
  if (hasOwn(value, "sourceRole") && !sourceRole) return null;
  const reservedCanonicalIdentity = getReservedCanonicalOccurrenceIdentity(
    garmentKey,
  );
  if (
    isReservedCanonicalOccurrenceKeyFamily(garmentKey) &&
    !reservedCanonicalIdentity
  ) {
    return null;
  }
  if (
    reservedCanonicalIdentity &&
    sourceRole &&
    sourceRole !== reservedCanonicalIdentity.sourceRole
  ) {
    return null;
  }
  if (reservedCanonicalIdentity) {
    assignment.sourceRole = reservedCanonicalIdentity.sourceRole;
  }
  const mainGarmentKey =
    typeof value.mainGarmentKey === "string" && value.mainGarmentKey
      ? value.mainGarmentKey
      : undefined;
  if (hasOwn(value, "mainGarmentKey") && !mainGarmentKey) return null;
  const mainGarmentType = normalizeGarmentType(value.mainGarmentType);
  if (hasOwn(value, "mainGarmentType") && !mainGarmentType) return null;
  const dependencyStatus = normalizeAdditionalDependencyStatus(
    value.dependencyStatus,
  );
  if (hasOwn(value, "dependencyStatus") && !dependencyStatus) return null;
  const eligibilityRule = normalizeAdditionalEligibilityRule(
    value.eligibilityRule,
  );
  if (hasOwn(value, "eligibilityRule") && !eligibilityRule) return null;
  if (hasOwn(value, "garmentSpec")) {
    const garmentSpec = normalizeGarmentSpecStrict(value.garmentSpec);
    if (!garmentSpec) {
      return null;
    }
    assignment.garmentSpec = garmentSpec;
  }
  if (
    !hasCoherentCanonicalOccurrenceIdentity({ assignment }) ||
    !hasCoherentGarmentSpec(assignment)
  ) {
    return null;
  }
  const isHistoricalCatalogueAdditional =
    options.allowHistoricalCatalogueAdditionalFallback === true &&
    assignment.sourceRole === "additional" &&
    !hasOwn(value, "mainGarmentKey") &&
    !hasOwn(value, "mainGarmentType") &&
    !hasOwn(value, "eligibilityRule") &&
    !hasOwn(value, "dependencyStatus") &&
    !hasOwn(value, "garmentSpec") &&
    isCanonicalCatalogueAdditionalOccurrence(assignment);
  if (isHistoricalCatalogueAdditional) {
    assignment.eligibilityRule = "catalog_all";
    assignment.dependencyStatus = "valid";
  }
  if (
    (assignment.sourceRole ?? sourceRole) === "additional" &&
    !mainGarmentType &&
    assignment.eligibilityRule !== "demographic_policy" &&
    assignment.eligibilityRule !== "catalog_all" &&
    eligibilityRule !== "demographic_policy" &&
    eligibilityRule !== "catalog_all"
  ) return null;

  if (sourceRole && !reservedCanonicalIdentity) assignment.sourceRole = sourceRole;
  if (mainGarmentKey) assignment.mainGarmentKey = mainGarmentKey;
  if (mainGarmentType) assignment.mainGarmentType = mainGarmentType;
  if (eligibilityRule) assignment.eligibilityRule = eligibilityRule;
  if (dependencyStatus) assignment.dependencyStatus = dependencyStatus;

  const isLegacyAdditionalGarment =
    !isReservedCanonicalOccurrenceKeyFamily(garmentKey) &&
    !sourceRole &&
    isLegacyAdditionalGarmentShape(assignment);
  if (isLegacyAdditionalGarment) {
    assignment.sourceRole = "additional";
    assignment.mainGarmentType = garmentType;
    assignment.eligibilityRule = "same_type";
    assignment.dependencyStatus = "valid";
  }

  return hasCoherentFinalAssignmentIdentity(assignment) ? assignment : null;
};

const inspectFabricAllocationsField = (
  container: unknown,
  options: FabricAllocationInspectionOptions = {},
): FabricAllocationInspection => {
  if (!hasOwn(container, "fabricAllocations")) {
    return { status: "absent" };
  }

  const rawFabricAllocations = (container as Record<string, unknown>)
    .fabricAllocations;
  if (!Array.isArray(rawFabricAllocations)) {
    return invalidFabricAllocationInspection({
      rawFabricAllocations,
      code: "fabric_allocations_not_array",
    });
  }

  const normalizedAllocations: FabricAllocation[] = [];
  const seenAllocationIds = new Set<string>();
  const seenAssignmentKeys = new Set<string>();
  for (const [allocationIndex, rawAllocation] of rawFabricAllocations.entries()) {
    if (!isRecord(rawAllocation)) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "fabric_allocation_not_object",
        allocationIndex,
      });
    }

    const allocationId =
      typeof rawAllocation.allocationId === "string"
        ? rawAllocation.allocationId
        : null;
    const fabricCode =
      typeof rawAllocation.fabricCode === "string"
        ? rawAllocation.fabricCode
        : null;
    if (!allocationId || !allocationId.trim()) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "allocation_id_invalid",
        allocationIndex,
      });
    }
    if (!fabricCode || !fabricCode.trim()) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "fabric_code_invalid",
        allocationIndex,
      });
    }

    if (!Array.isArray(rawAllocation.garmentAssignments)) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "garment_assignments_not_array",
        allocationIndex,
      });
    }
    if (seenAllocationIds.has(allocationId)) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "allocation_id_duplicate",
        allocationIndex,
      });
    }
    seenAllocationIds.add(allocationId);

    const garmentAssignments: FabricGarmentAssignment[] = [];
    for (const [assignmentIndex, rawAssignment] of rawAllocation.garmentAssignments.entries()) {
      const normalizedAssignment = normalizeGarmentAssignmentStrict(
        rawAssignment,
        options,
      );
      if (!normalizedAssignment) {
        return invalidFabricAllocationInspection({
          rawFabricAllocations,
          code: "garment_assignment_invalid",
          allocationIndex,
          assignmentIndex,
        });
      }
      if (seenAssignmentKeys.has(normalizedAssignment.garmentKey)) {
        return invalidFabricAllocationInspection({
          rawFabricAllocations,
          code: "duplicate_garment_assignment",
          allocationIndex,
          assignmentIndex,
        });
      }
      seenAssignmentKeys.add(normalizedAssignment.garmentKey);
      garmentAssignments.push(normalizedAssignment);
    }

    const normalizedAllocation: FabricAllocation = {
      allocationId,
      fabricCode,
      garmentAssignments,
    };
    if (
      FabricCapacityEngine.resolveFabricAllocation(normalizedAllocation).status !==
      "resolved"
    ) {
      return invalidFabricAllocationInspection({
        rawFabricAllocations,
        code: "allocation_capacity_invalid",
        allocationIndex,
      });
    }
    normalizedAllocations.push(normalizedAllocation);
  }

  return { status: "valid", fabricAllocations: normalizedAllocations };
};

const buildLegacyAllocation = (
  fabricCode: string | null | undefined,
  garmentCode: string | null | undefined,
  lowerGarmentType: LowerGarmentType | undefined,
): FabricAllocation[] | undefined => {
  if (!fabricCode || !garmentCode) return undefined;
  const resolution = FabricCapacityEngine.resolveGarmentAssignment({
    code: garmentCode,
    lowerGarmentType,
  });
  if (resolution.status !== "resolved") return undefined;

  return [
    {
      allocationId: `${fabricCode}-1`,
      fabricCode,
      garmentAssignments: resolution.assignments.map((assignment) => ({
        ...assignment,
      })),
    },
  ];
};

const getLegacyFabricCodeFromCartLike = (
  value: Pick<CartItem, "fabric"> | Pick<MasterOrder, "fabric">,
): string | null => {
  const code = value.fabric?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
};

const getLegacyGarmentCodeFromCartLike = (
  value: Pick<CartItem, "design"> | Pick<MasterOrder, "design">,
): string | null => {
  const priceCode = (value.design as Record<string, unknown> | undefined)
    ?.priceCode;
  return typeof priceCode === "string" && priceCode.length > 0
    ? priceCode
    : null;
};

export type FabricAllocationPersistenceDiagnosticCode =
  | "fabric_allocations_not_array"
  | "fabric_allocation_not_object"
  | "allocation_id_invalid"
  | "fabric_code_invalid"
  | "allocation_id_duplicate"
  | "garment_assignments_not_array"
  | "garment_assignment_invalid"
  | "duplicate_garment_assignment"
  | "allocation_capacity_invalid";

export interface InvalidPersistedFabricAllocationDiagnostic {
  code: FabricAllocationPersistenceDiagnosticCode;
  field: "fabricAllocations";
  rawAllocationCount: number | null;
  allocationIndex?: number;
  assignmentIndex?: number;
}

export type FabricAllocationInspection =
  | { status: "absent" }
  | {
      status: "invalid";
      rawFabricAllocations: unknown;
      diagnostic: InvalidPersistedFabricAllocationDiagnostic;
    }
  | { status: "valid"; fabricAllocations: FabricAllocation[] };

const invalidFabricAllocationInspection = ({
  rawFabricAllocations,
  code,
  allocationIndex,
  assignmentIndex,
}: {
  rawFabricAllocations: unknown;
  code: FabricAllocationPersistenceDiagnosticCode;
  allocationIndex?: number;
  assignmentIndex?: number;
}): Extract<FabricAllocationInspection, { status: "invalid" }> => ({
  status: "invalid",
  rawFabricAllocations,
  diagnostic: {
    code,
    field: "fabricAllocations",
    rawAllocationCount: Array.isArray(rawFabricAllocations)
      ? rawFabricAllocations.length
      : null,
    ...(allocationIndex === undefined ? {} : { allocationIndex }),
    ...(assignmentIndex === undefined ? {} : { assignmentIndex }),
  },
});

export type DraftHydrationAllocationResolution =
  | {
      status: "valid";
      hasValidModernAllocations: true;
      fabricAllocations: FabricAllocation[];
      primaryFabricCode: string | null;
    }
  | {
      status: "absent";
      hasValidModernAllocations: false;
      fabricAllocations: [];
      primaryFabricCode: string | null;
    }
  | {
      status: "invalid";
      hasValidModernAllocations: false;
      fabricAllocations: [];
      primaryFabricCode: string | null;
      rawFabricAllocations: unknown;
      diagnostic: InvalidPersistedFabricAllocationDiagnostic;
    };

export interface DraftAutosaveAllocationResolution {
  fabricAllocations: FabricAllocation[] | undefined;
  preserveInvalidHydratedModernData: boolean;
  blockedByInvalidGeneratedAllocations: boolean;
  diagnostic?: InvalidPersistedFabricAllocationDiagnostic;
}

export const cloneFabricAllocations = (
  fabricAllocations: FabricAllocation[] | undefined,
): FabricAllocation[] | undefined => {
  if (!fabricAllocations) return undefined;
  return fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentAssignments: allocation.garmentAssignments.map((assignment) => ({
      garmentKey: assignment.garmentKey,
      code: assignment.code,
      garmentType: assignment.garmentType,
      fabricUnits: assignment.fabricUnits,
      ...(assignment.lowerGarmentType
        ? { lowerGarmentType: assignment.lowerGarmentType }
        : {}),
      ...(assignment.garmentSpec
        ? { garmentSpec: { ...assignment.garmentSpec } }
        : {}),
      ...(assignment.sourceRole ? { sourceRole: assignment.sourceRole } : {}),
      ...(assignment.mainGarmentKey
        ? { mainGarmentKey: assignment.mainGarmentKey }
        : {}),
      ...(assignment.mainGarmentType
        ? { mainGarmentType: assignment.mainGarmentType }
        : {}),
      ...(assignment.eligibilityRule
        ? { eligibilityRule: assignment.eligibilityRule }
        : {}),
      ...(assignment.dependencyStatus
        ? { dependencyStatus: assignment.dependencyStatus }
        : {}),
    })),
  }));
};

const hasVerifiedCatalogueDraftLineage = (draft: GuestDesignDraft): boolean => {
  const source = draft.designSource;
  return (
    source?.kind === "catalog" &&
    typeof source.styleId === "string" &&
    source.styleId.trim().length > 0 &&
    source.sourceKey === getCatalogDesignSourceKey(source.styleId)
  );
};

export const inspectDraftFabricAllocations = (
  draft: GuestDesignDraft,
): FabricAllocationInspection =>
  inspectFabricAllocationsField(draft, {
    allowHistoricalCatalogueAdditionalFallback:
      hasVerifiedCatalogueDraftLineage(draft),
  });

export const inspectCartItemFabricAllocations = (
  item: CartItem,
): FabricAllocationInspection => inspectFabricAllocationsField(item);

export const inspectMasterOrderFabricAllocations = (
  order: MasterOrder,
): FabricAllocationInspection => inspectFabricAllocationsField(order);

export const resolveDraftHydrationAllocations = (
  draft: GuestDesignDraft,
): DraftHydrationAllocationResolution => {
  const inspection = inspectDraftFabricAllocations(draft);
  if (inspection.status === "invalid") {
    return {
      status: "invalid",
      hasValidModernAllocations: false,
      fabricAllocations: [],
      primaryFabricCode: draft.selectedFabricCode,
      rawFabricAllocations: inspection.rawFabricAllocations,
      diagnostic: inspection.diagnostic,
    };
  }
  if (inspection.status === "absent") {
    return {
      status: "absent",
      hasValidModernAllocations: false,
      fabricAllocations: [],
      primaryFabricCode: draft.selectedFabricCode,
    };
  }

  const preferredAllocation =
    inspection.fabricAllocations.find(
      (allocation) => allocation.fabricCode === draft.selectedFabricCode,
    ) || inspection.fabricAllocations[0];

  return {
    status: "valid",
    hasValidModernAllocations: true,
    fabricAllocations: cloneFabricAllocations(inspection.fabricAllocations) || [],
    primaryFabricCode: preferredAllocation?.fabricCode || null,
  };
};

export const getFabricAllocationSyncSignature = (
  fabricCode: string | null,
  garmentCode: string | null | undefined,
  lowerGarmentType: LowerGarmentType | undefined,
  styleId?: string | null,
): string =>
  `${fabricCode || ""}|${garmentCode || ""}|${lowerGarmentType || ""}|${styleId || ""}`;

export const resolveDraftFabricAllocations = (
  draft: GuestDesignDraft,
): FabricAllocation[] | undefined => {
  const modernInspection = inspectDraftFabricAllocations(draft);
  if (modernInspection.status === "valid") {
    return modernInspection.fabricAllocations;
  }
  if (modernInspection.status === "invalid") {
    return undefined;
  }
  return buildLegacyAllocation(
    draft.selectedFabricCode,
    draft.selectedGarment?.code || null,
    draft.designSelections.lowerGarmentType,
  );
};

export const resolveCartItemFabricAllocations = (
  item: CartItem,
): FabricAllocation[] | undefined => {
  const modernInspection = inspectCartItemFabricAllocations(item);
  if (modernInspection.status === "valid") {
    return modernInspection.fabricAllocations;
  }
  if (modernInspection.status === "invalid") {
    return undefined;
  }
  return buildLegacyAllocation(
    getLegacyFabricCodeFromCartLike(item),
    getLegacyGarmentCodeFromCartLike(item),
    item.design.lowerGarmentType,
  );
};

export const resolveMasterOrderFabricAllocations = (
  order: MasterOrder,
): FabricAllocation[] | undefined => {
  const modernInspection = inspectMasterOrderFabricAllocations(order);
  if (modernInspection.status === "valid") {
    return modernInspection.fabricAllocations;
  }
  if (modernInspection.status === "invalid") {
    return undefined;
  }
  return buildLegacyAllocation(
    getLegacyFabricCodeFromCartLike(order),
    getLegacyGarmentCodeFromCartLike(order),
    order.design.lowerGarmentType,
  );
};

export const resolveLegacyDraftFabricAllocations = (
  draft: GuestDesignDraft,
): FabricAllocation[] | undefined =>
  buildLegacyAllocation(
    draft.selectedFabricCode,
    draft.selectedGarment?.code || null,
    draft.designSelections.lowerGarmentType,
  );

export const resolveLegacyCartItemFabricAllocations = (
  item: CartItem,
): FabricAllocation[] | undefined =>
  buildLegacyAllocation(
    getLegacyFabricCodeFromCartLike(item),
    getLegacyGarmentCodeFromCartLike(item),
    item.design.lowerGarmentType,
  );

export const getPersistableCartItemFabricAllocationsForOrder = (
  item: CartItem,
): FabricAllocation[] | undefined => {
  const modernInspection = inspectCartItemFabricAllocations(item);
  if (modernInspection.status === "valid") {
    return cloneFabricAllocations(modernInspection.fabricAllocations);
  }
  if (modernInspection.status === "invalid") {
    return undefined;
  }
  return cloneFabricAllocations(resolveLegacyCartItemFabricAllocations(item));
};

export const resolveDraftAutosaveFabricAllocations = ({
  preservedInvalidHydratedFabricAllocations,
  hasUnresolvedHydratedFabricIntegrity,
  generatedFabricAllocations,
}: {
  preservedInvalidHydratedFabricAllocations: unknown | null;
  hasUnresolvedHydratedFabricIntegrity: boolean;
  generatedFabricAllocations: FabricAllocation[];
}): DraftAutosaveAllocationResolution => {
  if (
    preservedInvalidHydratedFabricAllocations !== null &&
    hasUnresolvedHydratedFabricIntegrity
  ) {
    return {
      fabricAllocations:
        preservedInvalidHydratedFabricAllocations as FabricAllocation[],
      preserveInvalidHydratedModernData: true,
      blockedByInvalidGeneratedAllocations: false,
    };
  }

  // Validate the exact JSON-safe representation that will be persisted. Runtime
  // engines may retain optional properties with an `undefined` value; the
  // canonical clone deliberately omits those properties before storage.
  const generatedPersistableFabricAllocations =
    cloneFabricAllocations(generatedFabricAllocations) || [];
  const generatedInspection = inspectFabricAllocationsField({
    fabricAllocations: generatedPersistableFabricAllocations,
  });
  if (generatedInspection.status === "invalid") {
    return {
      fabricAllocations: undefined,
      preserveInvalidHydratedModernData: false,
      blockedByInvalidGeneratedAllocations: true,
      diagnostic: generatedInspection.diagnostic,
    };
  }

  return {
    fabricAllocations:
      generatedInspection.status === "valid"
        ? cloneFabricAllocations(generatedInspection.fabricAllocations)
        : undefined,
    preserveInvalidHydratedModernData: false,
    blockedByInvalidGeneratedAllocations: false,
  };
};

export const toDeterministicFabricAllocationHashInput = (
  fabricAllocations: FabricAllocation[] | undefined,
): Array<Record<string, unknown>> | null => {
  if (!fabricAllocations) return null;

  return [...fabricAllocations]
    .map((allocation) => ({
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      garmentAssignments: [...allocation.garmentAssignments]
        .map((assignment) => ({
          garmentKey: assignment.garmentKey,
          code: assignment.code,
          garmentType: assignment.garmentType,
          fabricUnits: assignment.fabricUnits,
          lowerGarmentType: assignment.lowerGarmentType || null,
          sourceRole: assignment.sourceRole || null,
          mainGarmentKey: assignment.mainGarmentKey || null,
          mainGarmentType: assignment.mainGarmentType || null,
          eligibilityRule: assignment.eligibilityRule || null,
          dependencyStatus: assignment.dependencyStatus || null,
          garmentSpec: assignment.garmentSpec
            ? {
                key: assignment.garmentSpec.key,
                garmentType: assignment.garmentSpec.garmentType,
                fabricUnits: assignment.garmentSpec.fabricUnits,
                lowerGarmentType:
                  assignment.garmentSpec.lowerGarmentType || null,
              }
            : null,
        }))
        .sort(
          (left, right) =>
            left.garmentKey.localeCompare(right.garmentKey) ||
            left.code.localeCompare(right.code) ||
            left.garmentType.localeCompare(right.garmentType),
        ),
    }))
    .sort(
      (left, right) =>
        left.allocationId.localeCompare(right.allocationId) ||
        left.fabricCode.localeCompare(right.fabricCode),
    );
};
