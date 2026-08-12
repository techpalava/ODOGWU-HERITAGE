import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  CustomDetailDesignContext,
  DesignSelections,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
} from "../types";
import type { FabricAllocationSelection } from "../engine/FabricAllocationStateEngine";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import {
  resolveAdditionalGarmentPolicyCandidates,
  resolveShortsGarmentUnitPriceCents,
} from "../config/AdditionalGarmentPolicy";

export interface AllowedAdditionalGarment {
  garmentType: FabricGarmentType;
  label: string;
  garmentSpec: FabricCapacityGarmentSpec;
  mainGarmentSpec?: FabricCapacityGarmentSpec;
  eligibilityRule: "same_type" | "demographic_policy";
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

const getAdditionalAssignmentSequence = (
  garmentType: FabricGarmentType,
  existingAssignments: readonly FabricGarmentAssignment[],
): number =>
  existingAssignments.filter(
    (assignment) =>
      assignment.sourceRole === "additional" &&
      assignment.garmentType === garmentType,
  ).length + 1;

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
  existingAssignments,
}: {
  garmentType: FabricGarmentType;
  mainComposition: readonly FabricCapacityGarmentSpec[];
  design?: CustomDetailDesignContext | null;
  existingAssignments: readonly FabricGarmentAssignment[];
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

  const sequence = getAdditionalAssignmentSequence(
    garmentType,
    existingAssignments,
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
    allowedTypes.has(assignment.garmentType) ? "valid" : "orphaned";

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
}: {
  additionalAssignments: readonly FabricGarmentAssignment[];
  mainGarmentPriceRows: readonly {
    garmentType: FabricGarmentType;
    price: number;
  }[];
  designSelections?: DesignSelections;
}): {
  rows: AdditionalGarmentPriceRow[];
  unresolvedAssignmentIds: string[];
} => {
  const rows: AdditionalGarmentPriceRow[] = [];
  const unresolvedAssignmentIds: string[] = [];
  for (const assignment of additionalAssignments) {
    if (assignment.sourceRole !== "additional") {
      continue;
    }
    if (assignment.dependencyStatus === "orphaned") {
      unresolvedAssignmentIds.push(assignment.garmentKey);
      continue;
    }
    const mainRow = mainGarmentPriceRows.find(
      (row) => row.garmentType === assignment.garmentType,
    );
    const canonicalShortsPriceCents = resolveShortsGarmentUnitPriceCents(
      assignment.garmentType,
      designSelections || {},
    );
    const price = mainRow?.price ??
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
