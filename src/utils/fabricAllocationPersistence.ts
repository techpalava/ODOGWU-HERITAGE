import { FabricCapacityEngine } from "../engine/FabricCapacityEngine";
import type {
  CartItem,
  FabricAllocation,
  AdditionalGarmentDependencyStatus,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  FabricGarmentRole,
  GuestDesignDraft,
  MasterOrder,
} from "../types";

type LowerGarmentType = "trousers" | "skirt";
const GARMENT_TYPES: readonly FabricGarmentType[] = [
  "shirt",
  "standard_shorts",
  "trouser",
  "dress",
  "skirt",
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

const normalizeGarmentAssignmentStrict = (
  value: unknown,
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
  if (sourceRole === "additional" && !mainGarmentType) return null;

  if (sourceRole) assignment.sourceRole = sourceRole;
  if (mainGarmentKey) assignment.mainGarmentKey = mainGarmentKey;
  if (mainGarmentType) assignment.mainGarmentType = mainGarmentType;
  if (dependencyStatus) assignment.dependencyStatus = dependencyStatus;

  if (hasOwn(value, "garmentSpec")) {
    const garmentSpec = normalizeGarmentSpecStrict(value.garmentSpec);
    if (!garmentSpec) {
      return null;
    }
    assignment.garmentSpec = garmentSpec;
  }

  const isLegacyAdditionalGarment =
    !sourceRole &&
    (code.startsWith("CUSTOM_DETAIL_ADDITIONAL_GARMENT_") ||
      assignment.garmentSpec?.key.startsWith(
        "custom-detail:additional_physical_garment:",
      ));
  if (isLegacyAdditionalGarment) {
    assignment.sourceRole = "additional";
    assignment.mainGarmentType = garmentType;
    assignment.dependencyStatus = "valid";
  }

  return assignment;
};

const inspectFabricAllocationsField = (
  container: unknown,
): FabricAllocationInspection => {
  if (!hasOwn(container, "fabricAllocations")) {
    return { status: "absent" };
  }

  const rawFabricAllocations = (container as Record<string, unknown>)
    .fabricAllocations;
  if (!Array.isArray(rawFabricAllocations)) {
    return { status: "invalid" };
  }

  const normalizedAllocations: FabricAllocation[] = [];
  for (const rawAllocation of rawFabricAllocations) {
    if (!isRecord(rawAllocation)) {
      return { status: "invalid" };
    }

    const allocationId =
      typeof rawAllocation.allocationId === "string"
        ? rawAllocation.allocationId
        : null;
    const fabricCode =
      typeof rawAllocation.fabricCode === "string"
        ? rawAllocation.fabricCode
        : null;
    if (!allocationId || !fabricCode) {
      return { status: "invalid" };
    }

    if (!Array.isArray(rawAllocation.garmentAssignments)) {
      return { status: "invalid" };
    }

    const garmentAssignments: FabricGarmentAssignment[] = [];
    for (const rawAssignment of rawAllocation.garmentAssignments) {
      const normalizedAssignment = normalizeGarmentAssignmentStrict(rawAssignment);
      if (!normalizedAssignment) {
        return { status: "invalid" };
      }
      garmentAssignments.push(normalizedAssignment);
    }

    normalizedAllocations.push({
      allocationId,
      fabricCode,
      garmentAssignments,
    });
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

export type FabricAllocationInspection =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; fabricAllocations: FabricAllocation[] };

export interface DraftHydrationAllocationResolution {
  hasValidModernAllocations: boolean;
  fabricAllocations: FabricAllocation[];
  primaryFabricCode: string | null;
}

export interface DraftAutosaveAllocationResolution {
  fabricAllocations: FabricAllocation[] | undefined;
  preserveInvalidHydratedModernData: boolean;
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
      ...(assignment.dependencyStatus
        ? { dependencyStatus: assignment.dependencyStatus }
        : {}),
    })),
  }));
};

export const inspectDraftFabricAllocations = (
  draft: GuestDesignDraft,
): FabricAllocationInspection => inspectFabricAllocationsField(draft);

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
  if (inspection.status !== "valid") {
    return {
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
  preservedInvalidHydratedSelectionSignature,
  currentSelectionSignature,
  generatedFabricAllocations,
}: {
  preservedInvalidHydratedFabricAllocations: unknown | null;
  preservedInvalidHydratedSelectionSignature: string | null;
  currentSelectionSignature: string;
  generatedFabricAllocations: FabricAllocation[];
}): DraftAutosaveAllocationResolution => {
  if (
    preservedInvalidHydratedFabricAllocations !== null &&
    preservedInvalidHydratedSelectionSignature === currentSelectionSignature
  ) {
    return {
      fabricAllocations:
        preservedInvalidHydratedFabricAllocations as FabricAllocation[],
      preserveInvalidHydratedModernData: true,
    };
  }

  return {
    fabricAllocations: cloneFabricAllocations(generatedFabricAllocations),
    preserveInvalidHydratedModernData: false,
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
