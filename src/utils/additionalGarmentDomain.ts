import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
} from "../types";
import type { FabricAllocationSelection } from "../engine/FabricAllocationStateEngine";

export interface AllowedAdditionalGarment {
  garmentType: FabricGarmentType;
  label: string;
  mainGarmentSpec: FabricCapacityGarmentSpec;
}

export interface AdditionalGarmentPriceRow {
  assignmentId: string;
  garmentType: FabricGarmentType;
  label: string;
  price: number;
}

const isPhysicalMainGarmentType = (
  garmentType: FabricGarmentType,
): boolean => garmentType !== "other";

export const resolveAllowedAdditionalGarments = (
  mainComposition: readonly FabricCapacityGarmentSpec[],
): AllowedAdditionalGarment[] => {
  const seen = new Set<FabricGarmentType>();
  return mainComposition.flatMap((mainGarmentSpec) => {
    if (
      !isPhysicalMainGarmentType(mainGarmentSpec.garmentType) ||
      seen.has(mainGarmentSpec.garmentType)
    ) {
      return [];
    }
    seen.add(mainGarmentSpec.garmentType);
    return [{
      garmentType: mainGarmentSpec.garmentType,
      label: getFabricGarmentLabel(mainGarmentSpec.garmentType),
      mainGarmentSpec: { ...mainGarmentSpec },
    }];
  });
};

export const getAllowedAdditionalGarmentLabels = (
  mainComposition: readonly FabricCapacityGarmentSpec[],
): string[] => resolveAllowedAdditionalGarments(mainComposition).map(
  (garment) => garment.label,
);

export const isAdditionalGarmentAllowed = (
  garmentType: FabricGarmentType,
  mainComposition: readonly FabricCapacityGarmentSpec[],
): boolean =>
  resolveAllowedAdditionalGarments(mainComposition).some(
    (garment) => garment.garmentType === garmentType,
  );

const getAdditionalAssignmentSequence = (
  garmentType: FabricGarmentType,
  existingAssignments: readonly FabricGarmentAssignment[],
): number =>
  existingAssignments.filter(
    (assignment) =>
      assignment.sourceRole === "additional" &&
      assignment.mainGarmentType === garmentType,
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
  existingAssignments,
}: {
  garmentType: FabricGarmentType;
  mainComposition: readonly FabricCapacityGarmentSpec[];
  existingAssignments: readonly FabricGarmentAssignment[];
}): AdditionalGarmentSelectionResolution => {
  const allowedGarments = resolveAllowedAdditionalGarments(mainComposition);
  const matchingMain = allowedGarments.find(
    (garment) => garment.garmentType === garmentType,
  );
  if (!matchingMain) {
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
        fabricUnits: matchingMain.mainGarmentSpec.fabricUnits,
        ...(matchingMain.mainGarmentSpec.lowerGarmentType
          ? { lowerGarmentType: matchingMain.mainGarmentSpec.lowerGarmentType }
          : {}),
      },
      sourceRole: "additional",
      mainGarmentKey: matchingMain.mainGarmentSpec.key,
      mainGarmentType: garmentType,
      dependencyStatus: "valid",
    },
  };
};

export const reconcileAdditionalGarmentDependencies = (
  state: FabricAllocationState,
  mainComposition: readonly FabricCapacityGarmentSpec[],
): FabricAllocationState => {
  const allowedTypes = new Set(
    resolveAllowedAdditionalGarments(mainComposition).map(
      (garment) => garment.garmentType,
    ),
  );
  const getDependencyStatus = (assignment: FabricGarmentAssignment) =>
    allowedTypes.has(assignment.mainGarmentType!) ? "valid" : "orphaned";

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
}: {
  additionalAssignments: readonly FabricGarmentAssignment[];
  mainGarmentPriceRows: readonly {
    garmentType: FabricGarmentType;
    price: number;
  }[];
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
    if (assignment.dependencyStatus === "orphaned" || !assignment.mainGarmentType) {
      unresolvedAssignmentIds.push(assignment.garmentKey);
      continue;
    }
    const mainRow = mainGarmentPriceRows.find(
      (row) => row.garmentType === assignment.mainGarmentType,
    );
    if (!mainRow) {
      unresolvedAssignmentIds.push(assignment.garmentKey);
      continue;
    }
    rows.push({
      assignmentId: assignment.garmentKey,
      garmentType: assignment.garmentType,
      label: getFabricGarmentLabel(assignment.garmentType),
      price: mainRow.price,
    });
  }
  return { rows, unresolvedAssignmentIds };
};
