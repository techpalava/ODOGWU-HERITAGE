import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  AdditionalGarmentEligibilityRule,
  CustomDetailDesignContext,
  DesignSelections,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  GarmentConstructionPricingResolution,
  CanonicalPhysicalGarmentType,
} from "../types";
import type { FabricAllocationSelection } from "../engine/FabricAllocationStateEngine";
import {
  createStyleBaseGarmentSpec,
  FABRIC_GARMENT_CAPACITY_UNITS,
} from "../config/StyleFabricCapacityConfig";
import {
  resolveAdditionalGarmentPolicyCandidates,
  resolveShortsGarmentUnitPriceCents,
} from "../config/AdditionalGarmentPolicy";
import type { PhysicalGarmentOccurrence } from "./designSourceState";
import {
  isCanonicalPhysicalGarmentType,
  isCustomerSelectableGarmentType,
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
} from "./garmentConstructionPricing";

const ADDITIONAL_ELIGIBILITY_RULES: readonly AdditionalGarmentEligibilityRule[] =
  ["same_type", "demographic_policy", "catalog_all"];

/** Catalogue Step 1 base occurrences for parent resolution inputs. */
export const projectCatalogueStep1PhysicalOccurrences = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
): PhysicalGarmentOccurrence[] =>
  garmentTypes.map((garmentType) => {
    const spec = createStyleBaseGarmentSpec(garmentType);
    return {
      garmentKey: spec.key,
      garmentType,
      sourceRole: "main" as const,
      fabricUnits: spec.fabricUnits,
    };
  });

export type CanonicalAdditionalGarmentSelectionValidation =
  | { status: "valid"; selection: FabricAllocationSelection }
  | { status: "invalid"; reason: string };

const resolveCatalogueAdditionalGarmentParent = (
  authoritativePhysicalOccurrences: readonly PhysicalGarmentOccurrence[],
  garmentType: FabricGarmentType,
): PhysicalGarmentOccurrence | null => {
  const catalogEligible = authoritativePhysicalOccurrences.filter(
    (occurrence) =>
      occurrence.sourceRole === "main" ||
      occurrence.garmentKey.startsWith("base:"),
  );
  if (catalogEligible.length === 0) {
    return null;
  }

  const matchingBase = catalogEligible.find(
    (occurrence) =>
      occurrence.garmentType === garmentType &&
      occurrence.garmentKey.startsWith("base:"),
  );
  if (matchingBase) {
    return matchingBase;
  }

  return (
    catalogEligible.find((occurrence) => occurrence.sourceRole === "main") ||
    catalogEligible.find((occurrence) =>
      occurrence.garmentKey.startsWith("base:"),
    ) ||
    null
  );
};

/**
 * Fail-closed validator for parking a new Optional Extra Garment pending Fabric.
 * Relationship metadata is proven against CURRENT committed Fabric assignments.
 */
export const validateCanonicalAdditionalGarmentSelectionForParking = ({
  state,
  selection,
}: {
  state: FabricAllocationState;
  selection: FabricAllocationSelection | null | undefined;
}): CanonicalAdditionalGarmentSelectionValidation => {
  if (!selection) {
    return { status: "invalid", reason: "selection_missing" };
  }
  if (typeof selection.code !== "string" || selection.code.trim().length === 0) {
    return { status: "invalid", reason: "code_missing" };
  }
  if (selection.sourceRole !== "additional") {
    return { status: "invalid", reason: "source_role_not_additional" };
  }
  const garmentSpec = selection.garmentSpec;
  if (!garmentSpec) {
    return { status: "invalid", reason: "garment_spec_missing" };
  }
  if (typeof garmentSpec.key !== "string" || garmentSpec.key.trim().length === 0) {
    return { status: "invalid", reason: "garment_key_missing" };
  }
  if (!isCanonicalPhysicalGarmentType(garmentSpec.garmentType)) {
    return { status: "invalid", reason: "garment_type_invalid" };
  }
  const expectedUnits = FABRIC_GARMENT_CAPACITY_UNITS[garmentSpec.garmentType];
  if (garmentSpec.fabricUnits !== expectedUnits) {
    return { status: "invalid", reason: "fabric_units_invalid" };
  }
  if (
    typeof selection.mainGarmentKey !== "string" ||
    selection.mainGarmentKey.trim().length === 0
  ) {
    return { status: "invalid", reason: "main_garment_key_missing" };
  }
  if (
    !selection.mainGarmentType ||
    !isCanonicalPhysicalGarmentType(selection.mainGarmentType)
  ) {
    return { status: "invalid", reason: "main_garment_type_missing" };
  }
  if (
    !selection.eligibilityRule ||
    !ADDITIONAL_ELIGIBILITY_RULES.includes(selection.eligibilityRule)
  ) {
    return { status: "invalid", reason: "eligibility_rule_missing" };
  }
  if (selection.dependencyStatus !== "valid") {
    return { status: "invalid", reason: "dependency_status_invalid" };
  }

  const committedAssignments = state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  );
  const parentMatches = committedAssignments.filter(
    (assignment) => assignment.garmentKey === selection.mainGarmentKey,
  );
  if (parentMatches.length === 0) {
    return { status: "invalid", reason: "parent_missing" };
  }
  if (parentMatches.length > 1) {
    return { status: "invalid", reason: "parent_duplicate" };
  }
  const parent = parentMatches[0];
  if (!isCanonicalPhysicalGarmentType(parent.garmentType)) {
    return { status: "invalid", reason: "parent_malformed" };
  }
  if (parent.dependencyStatus === "orphaned") {
    return { status: "invalid", reason: "parent_orphaned" };
  }
  if (parent.garmentType !== selection.mainGarmentType) {
    return { status: "invalid", reason: "parent_type_mismatch" };
  }
  if (parent.sourceRole === "additional") {
    return { status: "invalid", reason: "parent_role_ineligible" };
  }

  const committedMainComposition = committedAssignments
    .filter(
      (assignment) =>
        assignment.sourceRole !== "additional" &&
        assignment.dependencyStatus !== "orphaned",
    )
    .map((assignment) =>
      assignment.garmentSpec
        ? { ...assignment.garmentSpec }
        : createStyleBaseGarmentSpec(assignment.garmentType),
    );

  if (selection.eligibilityRule === "same_type") {
    if (
      parent.garmentType !== garmentSpec.garmentType ||
      selection.mainGarmentType !== garmentSpec.garmentType
    ) {
      return { status: "invalid", reason: "same_type_parent_mismatch" };
    }
  }

  if (selection.eligibilityRule === "catalog_all") {
    if (
      parent.sourceRole !== "main" &&
      !parent.garmentKey.startsWith("base:")
    ) {
      return { status: "invalid", reason: "catalog_all_parent_ineligible" };
    }
    if (!isCustomerSelectableGarmentType(garmentSpec.garmentType)) {
      return { status: "invalid", reason: "eligibility_relationship_invalid" };
    }
  }

  if (selection.eligibilityRule === "demographic_policy") {
    const policyCandidate = resolveAdditionalGarmentPolicyCandidates(
      committedMainComposition,
    ).find(
      (candidate) =>
        candidate.garmentType === garmentSpec.garmentType &&
        candidate.eligibilityRule === "demographic_policy",
    );
    if (!policyCandidate) {
      return { status: "invalid", reason: "eligibility_relationship_invalid" };
    }
    if (
      policyCandidate.mainGarmentSpec &&
      policyCandidate.mainGarmentSpec.key !== selection.mainGarmentKey
    ) {
      return { status: "invalid", reason: "eligibility_relationship_invalid" };
    }
  }

  if (
    selection.eligibilityRule !== "catalog_all" &&
    selection.eligibilityRule !== "same_type" &&
    selection.eligibilityRule !== "demographic_policy"
  ) {
    return { status: "invalid", reason: "eligibility_rule_missing" };
  }

  const allowedTypes = new Set(
    resolveAllowedAdditionalGarments(committedMainComposition).map(
      (garment) => garment.garmentType,
    ),
  );
  const expectedDependencyStatus =
    selection.eligibilityRule === "catalog_all" &&
    isCanonicalPhysicalGarmentType(garmentSpec.garmentType)
      ? "valid"
      : allowedTypes.has(garmentSpec.garmentType)
        ? "valid"
        : "orphaned";
  if (selection.dependencyStatus !== expectedDependencyStatus) {
    return { status: "invalid", reason: "dependency_status_inconsistent" };
  }
  if (expectedDependencyStatus !== "valid") {
    return { status: "invalid", reason: "dependency_status_invalid" };
  }

  if (state.pendingFabricGarment?.garmentKey === selection.mainGarmentKey) {
    return { status: "invalid", reason: "parent_pending" };
  }

  return { status: "valid", selection };
};

export interface AllowedAdditionalGarment {
  garmentType: FabricGarmentType;
  label: string;
  garmentSpec: FabricCapacityGarmentSpec;
  mainGarmentSpec?: FabricCapacityGarmentSpec;
  eligibilityRule: "same_type" | "demographic_policy" | "catalog_all";
}

export interface AdditionalGarmentPriceRow {
  assignmentId: string;
  garmentType: FabricGarmentType;
  label: string;
  price: number;
}

export const resolveAllowedAdditionalGarments = (
  mainComposition: readonly FabricCapacityGarmentSpec[],
  design?: CustomDetailDesignContext | null,
): AllowedAdditionalGarment[] =>
  resolveAdditionalGarmentPolicyCandidates(mainComposition, design).map(
    (candidate) => ({
      garmentType: candidate.garmentType,
      label: getFabricGarmentLabel(candidate.garmentType),
      garmentSpec:
        candidate.mainGarmentSpec ||
        createStyleBaseGarmentSpec(candidate.garmentType),
      ...(candidate.mainGarmentSpec
        ? { mainGarmentSpec: { ...candidate.mainGarmentSpec } }
        : {}),
      eligibilityRule: candidate.eligibilityRule,
    }),
  );

export const getAllowedAdditionalGarmentLabels = (
  mainComposition: readonly FabricCapacityGarmentSpec[],
  design?: CustomDetailDesignContext | null,
): string[] => resolveAllowedAdditionalGarments(mainComposition, design).map(
  (garment) => garment.label,
);

export const isAdditionalGarmentAllowed = (
  garmentType: FabricGarmentType,
  mainComposition: readonly FabricCapacityGarmentSpec[],
  design?: CustomDetailDesignContext | null,
): boolean =>
  resolveAllowedAdditionalGarments(mainComposition, design).some(
    (garment) => garment.garmentType === garmentType,
  );

const ADDITIONAL_OCCURRENCE_KEY_PATTERN = /^additional:([^:]+):(\d+)$/;

export const parseAdditionalOccurrenceSequenceFromKey = (
  garmentKey: string,
): { garmentType: FabricGarmentType; sequence: number } | null => {
  const match = garmentKey.match(ADDITIONAL_OCCURRENCE_KEY_PATTERN);
  if (!match) return null;
  const garmentType = match[1];
  if (!isCanonicalPhysicalGarmentType(garmentType as FabricGarmentType)) {
    return null;
  }
  const sequence = Number.parseInt(match[2], 10);
  if (!Number.isFinite(sequence) || sequence < 1) return null;
  return { garmentType: garmentType as FabricGarmentType, sequence };
};

/**
 * Monotonic additional occurrence sequence from authoritative ledger keys.
 * Fabric assignments must not influence identity allocation.
 */
export const getNextAdditionalOccurrenceSequence = (
  garmentType: FabricGarmentType,
  authorizedOccurrenceKeys: readonly string[],
): number => {
  let maxSequence = 0;
  for (const garmentKey of authorizedOccurrenceKeys) {
    const parsed = parseAdditionalOccurrenceSequenceFromKey(garmentKey);
    if (parsed?.garmentType === garmentType) {
      maxSequence = Math.max(maxSequence, parsed.sequence);
    }
  }
  return maxSequence + 1;
};

export type AdditionalGarmentSelectionResolution =
  | {
      status: "resolved";
      selection: FabricAllocationSelection;
      allowedGarments: AllowedAdditionalGarment[];
    }
  | {
      status: "invalid";
      attemptedGarmentType: FabricGarmentType;
      allowedGarments: AllowedAdditionalGarment[];
    };

/**
 * Additional garments are physical assignments with their own stable identity.
 * Their price is deliberately not stored here; it is resolved from main rows.
 */
export const createAdditionalGarmentSelection = ({
  garmentType,
  mainComposition,
  design,
  existingAssignments: _existingAssignments,
  authorizedOccurrenceKeys = [],
}: {
  garmentType: FabricGarmentType;
  mainComposition: readonly FabricCapacityGarmentSpec[];
  design?: CustomDetailDesignContext | null;
  existingAssignments: readonly FabricGarmentAssignment[];
  authorizedOccurrenceKeys?: readonly string[];
}): AdditionalGarmentSelectionResolution => {
  const allowedGarments = resolveAllowedAdditionalGarments(
    mainComposition,
    design,
  );
  const allowedGarment = allowedGarments.find(
    (garment) => garment.garmentType === garmentType,
  );
  if (!allowedGarment) {
    return { status: "invalid", attemptedGarmentType: garmentType, allowedGarments };
  }

  const sequence = getNextAdditionalOccurrenceSequence(
    garmentType,
    authorizedOccurrenceKeys,
  );
  const assignmentId = `additional:${garmentType}:${sequence}`;
  return {
    status: "resolved",
    allowedGarments,
    selection: {
      code: `ADDITIONAL_${garmentType.toUpperCase()}_${sequence}`,
      garmentSpec: {
        key: assignmentId,
        garmentType,
        fabricUnits: allowedGarment.garmentSpec.fabricUnits,
        ...(allowedGarment.garmentSpec.lowerGarmentType
          ? { lowerGarmentType: allowedGarment.garmentSpec.lowerGarmentType }
          : {}),
      },
      sourceRole: "additional",
      ...(allowedGarment.mainGarmentSpec
        ? {
            mainGarmentKey: allowedGarment.mainGarmentSpec.key,
            mainGarmentType: allowedGarment.mainGarmentSpec.garmentType,
          }
        : {}),
      eligibilityRule: allowedGarment.eligibilityRule,
      dependencyStatus: "valid",
    },
  };
};

/**
 * The nine-stage Custom Details catalogue may add customer-selectable physical
 * garments. Agbada remains canonical for legacy/reconcile paths but cannot be
 * newly selected through this customer-facing creation helper.
 * Capacity and allocation still run through the existing append transaction.
 */
export const createCatalogueAdditionalGarmentSelection = ({
  garmentType,
  authoritativePhysicalOccurrences,
  authorizedOccurrenceKeys = [],
}: {
  garmentType: FabricGarmentType;
  authoritativePhysicalOccurrences: readonly PhysicalGarmentOccurrence[];
  authorizedOccurrenceKeys?: readonly string[];
}): AdditionalGarmentSelectionResolution => {
  if (!isCustomerSelectableGarmentType(garmentType)) {
    return {
      status: "invalid",
      attemptedGarmentType: garmentType,
      allowedGarments: CUSTOMER_SELECTABLE_GARMENT_TYPES.map((candidate) => ({
        garmentType: candidate,
        label: getFabricGarmentLabel(candidate),
        garmentSpec: createStyleBaseGarmentSpec(candidate),
        eligibilityRule: "catalog_all" as const,
      })),
    };
  }
  const parentMain = resolveCatalogueAdditionalGarmentParent(
    authoritativePhysicalOccurrences,
    garmentType,
  );
  if (!parentMain || !isCanonicalPhysicalGarmentType(parentMain.garmentType)) {
    return {
      status: "invalid",
      attemptedGarmentType: garmentType,
      allowedGarments: CUSTOMER_SELECTABLE_GARMENT_TYPES.map((candidate) => ({
        garmentType: candidate,
        label: getFabricGarmentLabel(candidate),
        garmentSpec: createStyleBaseGarmentSpec(candidate),
        eligibilityRule: "catalog_all" as const,
      })),
    };
  }
  const sequence = getNextAdditionalOccurrenceSequence(
    garmentType,
    authorizedOccurrenceKeys,
  );
  const assignmentId = `additional:${garmentType}:${sequence}`;
  const garmentSpec = createStyleBaseGarmentSpec(garmentType);
  return {
    status: "resolved",
    allowedGarments: CUSTOMER_SELECTABLE_GARMENT_TYPES.map((candidate) => ({
      garmentType: candidate,
      label: getFabricGarmentLabel(candidate),
      garmentSpec: createStyleBaseGarmentSpec(candidate),
      eligibilityRule: "catalog_all" as const,
    })),
    selection: {
      code: `ADDITIONAL_${garmentType.toUpperCase()}_${sequence}`,
      garmentSpec: { ...garmentSpec, key: assignmentId },
      sourceRole: "additional",
      mainGarmentKey: parentMain.garmentKey,
      mainGarmentType: parentMain.garmentType,
      eligibilityRule: "catalog_all",
      dependencyStatus: "valid",
    },
  };
};

export const reconcileAdditionalGarmentDependencies = (
  state: FabricAllocationState,
  mainComposition: readonly FabricCapacityGarmentSpec[],
  design?: CustomDetailDesignContext | null,
): FabricAllocationState => {
  const allowedTypes = new Set(
    resolveAllowedAdditionalGarments(mainComposition, design).map(
      (garment) => garment.garmentType,
    ),
  );
  const getDependencyStatus = (assignment: FabricGarmentAssignment) =>
    assignment.eligibilityRule === "catalog_all" &&
    isCanonicalPhysicalGarmentType(assignment.garmentType)
      ? "valid"
      : allowedTypes.has(assignment.garmentType)
        ? "valid"
        : "orphaned";

  return {
    ...state,
    fabricAllocations: state.fabricAllocations.map((allocation) => ({
      ...allocation,
      garmentAssignments: allocation.garmentAssignments.map((assignment) => {
        if (assignment.sourceRole !== "additional") return assignment;
        const dependencyStatus = getDependencyStatus(assignment);
        return assignment.dependencyStatus === dependencyStatus
          ? assignment
          : { ...assignment, dependencyStatus };
      }),
    })),
    pendingFabricGarment:
      state.pendingFabricGarment?.sourceRole === "additional"
        ? {
            ...state.pendingFabricGarment,
            dependencyStatus: getDependencyStatus(state.pendingFabricGarment),
          }
        : state.pendingFabricGarment,
  };
};

export const getInvalidAdditionalGarmentAssignments = (
  state: FabricAllocationState,
): FabricGarmentAssignment[] =>
  state.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter(
      (assignment) =>
        assignment.sourceRole === "additional" &&
        assignment.dependencyStatus === "orphaned",
    );

export const resolveAdditionalGarmentPriceRows = ({
  additionalAssignments,
  mainGarmentPriceRows,
  designSelections,
  constructionByGarmentKey,
}: {
  additionalAssignments: readonly FabricGarmentAssignment[];
  mainGarmentPriceRows: readonly {
    garmentType: FabricGarmentType;
    price: number;
  }[];
  designSelections?: DesignSelections;
  constructionByGarmentKey?: Readonly<
    Record<string, GarmentConstructionPricingResolution>
  >;
}): {
  rows: AdditionalGarmentPriceRow[];
  unresolvedAssignmentIds: string[];
} => {
  const rows: AdditionalGarmentPriceRow[] = [];
  const unresolvedAssignmentIds: string[] = [];
  const assignmentByGarmentKey = new Map<string, FabricGarmentAssignment>();
  for (const assignment of additionalAssignments) {
    if (
      assignment.sourceRole === "additional" &&
      assignment.dependencyStatus !== "orphaned"
    ) {
      assignmentByGarmentKey.set(assignment.garmentKey, assignment);
    }
  }
  for (const garmentKey of Object.keys(constructionByGarmentKey || {})) {
    if (assignmentByGarmentKey.has(garmentKey)) continue;
    const occurrenceConstruction = constructionByGarmentKey?.[garmentKey];
    if (
      !occurrenceConstruction?.garmentType ||
      !isCanonicalPhysicalGarmentType(occurrenceConstruction.garmentType)
    ) {
      continue;
    }
    assignmentByGarmentKey.set(garmentKey, {
      garmentKey,
      code: `ADDITIONAL_${occurrenceConstruction.garmentType.toUpperCase()}`,
      garmentType: occurrenceConstruction.garmentType,
      fabricUnits:
        FABRIC_GARMENT_CAPACITY_UNITS[occurrenceConstruction.garmentType],
      sourceRole: "additional",
    });
  }
  for (const assignment of assignmentByGarmentKey.values()) {
    if (assignment.sourceRole !== "additional") {
      continue;
    }
    const occurrenceConstruction = constructionByGarmentKey?.[
      assignment.garmentKey
    ];
    const mainRow = mainGarmentPriceRows.find(
      (row) => row.garmentType === assignment.garmentType,
    );
    const canonicalShortsPriceCents = resolveShortsGarmentUnitPriceCents(
      assignment.garmentType,
      designSelections || {},
    );
    const price =
      occurrenceConstruction?.status === "resolved"
        ? occurrenceConstruction.totalPrice
        : mainRow?.price ??
      (canonicalShortsPriceCents === null
        ? null
        : canonicalShortsPriceCents / 100);
    if (price === null) {
      unresolvedAssignmentIds.push(assignment.garmentKey);
      continue;
    }
    rows.push({
      assignmentId: assignment.garmentKey,
      garmentType: assignment.garmentType,
      label: getFabricGarmentLabel(assignment.garmentType),
      price,
    });
  }
  return { rows, unresolvedAssignmentIds };
};
