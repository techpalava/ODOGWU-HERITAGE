import { getCustomerFacingFabricQuantityForAllocations } from "../engine/FabricCapacityEngine";
import { isCustomerDesignDraftStoragePath } from "../services/customerDesignUploadReference";
import type {
  CartDesignPricingSnapshot,
  CartDesignSource,
  CartDesignValidation,
  CartItem,
  DesignSource,
  FabricAllocation,
  FabricGarmentAssignment,
  StyleCategory,
  StoredOrderDesignSource,
  UploadedCartDesignSource,
} from "../types";
import {
  cloneFabricAllocations,
  inspectCartItemFabricAllocations,
  toDeterministicFabricAllocationHashInput,
} from "./fabricAllocationPersistence";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  createCatalogDesignSource,
  getCatalogDesignSourceKey,
  isValidUploadedDesignSource,
} from "./designSourceState";
import { isAdditionalGarmentAllowed } from "./additionalGarmentDomain";

export const UPLOADED_DESIGN_TRUSTED_TRANSFER_BLOCKER =
  "Trusted uploaded-design image transfer is required before checkout.";

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const cloneUploadReference = (
  source: UploadedCartDesignSource,
): UploadedCartDesignSource => ({
  kind: "uploaded",
  sourceKey: source.sourceKey,
  displayLabel: source.displayLabel,
  uploadReference: {
    designReferenceId: source.uploadReference.designReferenceId,
    ownerUid: source.uploadReference.ownerUid,
    storagePath: source.uploadReference.storagePath,
    mimeType: source.uploadReference.mimeType,
    ...(source.uploadReference.originalFileName
      ? { originalFileName: source.uploadReference.originalFileName }
      : {}),
    createdAt: source.uploadReference.createdAt,
  },
  fabricCapacityComposition: source.fabricCapacityComposition.map((spec) => ({
    ...spec,
  })),
  demographic: source.demographic,
});

export const cloneCartDesignSource = (
  source: CartDesignSource,
): CartDesignSource =>
  source.kind === "catalog"
    ? {
        kind: "catalog",
        sourceKey: source.sourceKey,
        styleId: source.styleId,
      }
    : cloneUploadReference(source);

export const createCartDesignSource = (
  source: DesignSource | null | undefined,
  style: StyleCategory | null | undefined,
): CartDesignSource | null => {
  if (source?.kind === "uploaded") {
    return isValidUploadedDesignSource(source)
      ? cloneUploadReference(source)
      : null;
  }

  const styleId = source?.kind === "catalog" ? source.styleId : style?.id;
  const catalogSource = createCatalogDesignSource(styleId || "");
  return catalogSource
    ? {
        kind: "catalog",
        sourceKey: catalogSource.sourceKey,
        styleId: catalogSource.styleId,
      }
    : null;
};

export const createCartDesignPricingSnapshot = ({
  garmentSubtotal,
  capturedAt = new Date().toISOString(),
}: {
  garmentSubtotal: number | null | undefined;
  capturedAt?: string;
}): CartDesignPricingSnapshot =>
  typeof garmentSubtotal === "number" &&
  Number.isFinite(garmentSubtotal) &&
  garmentSubtotal > 0
    ? {
        status: "resolved",
        capturedAt,
        garmentSubtotal,
        authority: "display_snapshot_only",
      }
    : {
        status: "unresolved",
        capturedAt,
        authority: "display_snapshot_only",
      };

const normalizeAssignmentForCart = (
  assignment: FabricGarmentAssignment,
): FabricGarmentAssignment => {
  return {
    ...assignment,
    ...(assignment.garmentSpec
      ? { garmentSpec: { ...assignment.garmentSpec } }
      : {}),
    ...(assignment.sourceRole === "additional"
      ? {
          mainGarmentKey: assignment.mainGarmentKey,
          mainGarmentType: assignment.mainGarmentType,
          eligibilityRule:
            assignment.eligibilityRule ||
            (assignment.mainGarmentType ? "same_type" : undefined),
          dependencyStatus: assignment.dependencyStatus || "orphaned",
        }
      : {}),
  };
};

export const normalizeCartFabricAllocations = (
  fabricAllocations: readonly FabricAllocation[] | undefined,
): FabricAllocation[] | undefined =>
  cloneFabricAllocations(fabricAllocations ? [...fabricAllocations] : undefined)?.map((allocation) => ({
    ...allocation,
    garmentAssignments: allocation.garmentAssignments.map(
      normalizeAssignmentForCart,
    ),
  }));

export const getCartDesignSource = (
  item: CartItem,
): CartDesignSource | null => {
  if (item.cartDesignSource !== undefined) {
    if (item.cartDesignSource.kind === "catalog") {
      return hasText(item.cartDesignSource.styleId) &&
        item.cartDesignSource.sourceKey ===
          getCatalogDesignSourceKey(item.cartDesignSource.styleId)
        ? cloneCartDesignSource(item.cartDesignSource)
        : null;
    }
    return isValidUploadedDesignSource(item.cartDesignSource)
      ? cloneCartDesignSource(item.cartDesignSource)
      : null;
  }
  if (!item.style?.id) return null;
  return {
    kind: "catalog",
    sourceKey: getCatalogDesignSourceKey(item.style.id),
    styleId: item.style.id,
  };
};

export const getCartDesignLabel = (item: CartItem): string =>
  item.cartDesignSource?.kind === "uploaded"
    ? item.cartDesignSource.displayLabel
    : item.style?.name || "Design pending review";

export const getCartDesignDemographicLabel = (item: CartItem): string => {
  if (item.cartDesignSource?.kind === "uploaded") {
    return item.cartDesignSource.demographic;
  }
  return item.style?.gender || "custom";
};

export interface CartDesignInspection {
  status: "valid" | "invalid";
  source: CartDesignSource | null;
  reasons: string[];
}

const validateUploadedAllocations = (
  source: UploadedCartDesignSource,
  fabricAllocations: readonly FabricAllocation[] | undefined,
  pricingSnapshot: CartDesignPricingSnapshot | undefined,
): string[] => {
  const reasons: string[] = [];
  if (!isCustomerDesignDraftStoragePath(source.uploadReference)) {
    reasons.push("Uploaded design has an invalid private draft reference.");
  }
  if (!isValidUploadedDesignSource(source)) {
    reasons.push("Uploaded design source metadata is incomplete.");
  }
  if (!pricingSnapshot || pricingSnapshot.status !== "resolved") {
    reasons.push("Uploaded design requires resolved pricing before checkout.");
  }
  if (
    pricingSnapshot?.status === "resolved" &&
    (!Number.isFinite(pricingSnapshot.garmentSubtotal) ||
      (pricingSnapshot.garmentSubtotal || 0) <= 0)
  ) {
    reasons.push("Uploaded design has an invalid pricing snapshot.");
  }
  if (!fabricAllocations?.length) {
    reasons.push("Uploaded design has unassigned physical garments.");
    return reasons;
  }

  const allocationIds = new Set<string>();
  const assignmentIds = new Set<string>();
  const mainTypes = new Set(
    fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .filter((assignment) => (assignment.sourceRole || "main") === "main")
      .map((assignment) => assignment.garmentType),
  );
  const compositionByKey = new Map(
    source.fabricCapacityComposition.map((spec) => [spec.key, spec]),
  );

  for (const allocation of fabricAllocations) {
    if (!hasText(allocation.allocationId) || allocationIds.has(allocation.allocationId)) {
      reasons.push("Uploaded design has invalid fabric allocation identifiers.");
    }
    allocationIds.add(allocation.allocationId);
    if (!hasText(allocation.fabricCode) || allocation.garmentAssignments.length === 0) {
      reasons.push("Uploaded design has an incomplete fabric allocation.");
      continue;
    }
    for (const assignment of allocation.garmentAssignments) {
      if (!hasText(assignment.garmentKey) || assignmentIds.has(assignment.garmentKey)) {
        reasons.push("Uploaded design has duplicate or missing garment assignments.");
      }
      assignmentIds.add(assignment.garmentKey);
      if (!assignment.garmentSpec) {
        reasons.push("Uploaded design is missing canonical garment specifications.");
      }
      if (assignment.sourceRole === "additional") {
        const isPolicyEligible = isAdditionalGarmentAllowed(
          assignment.garmentType,
          source.fabricCapacityComposition,
          source,
        );
        const hasValidSameTypeDependency =
          assignment.eligibilityRule === "demographic_policy" ||
          (Boolean(assignment.mainGarmentKey) &&
            Boolean(assignment.mainGarmentType) &&
            mainTypes.has(assignment.mainGarmentType!) &&
            fabricAllocations.some((candidateAllocation) =>
              candidateAllocation.garmentAssignments.some(
                (candidate) =>
                  (candidate.sourceRole || "main") === "main" &&
                  candidate.garmentKey === assignment.mainGarmentKey &&
                  candidate.garmentType === assignment.mainGarmentType,
              ),
            ));
        if (
          assignment.dependencyStatus !== "valid" ||
          !isPolicyEligible ||
          !hasValidSameTypeDependency
        ) {
          reasons.push("Uploaded design has an orphaned Additional garment.");
        }
      } else {
        const composition = compositionByKey.get(assignment.garmentKey);
        if (
          !composition ||
          composition.garmentType !== assignment.garmentType ||
          composition.fabricUnits !== assignment.fabricUnits
        ) {
          reasons.push("Uploaded design has an unassigned or mismatched Main garment.");
        }
      }
    }
  }
  return [...new Set(reasons)];
};

export const inspectCartDesignDomain = (item: CartItem): CartDesignInspection => {
  const source = getCartDesignSource(item);
  if (!source) {
    return {
      status: "invalid",
      source: null,
      reasons: ["Cart item has no valid design source."],
    };
  }
  if (source.kind === "catalog") {
    if (!item.style?.id || item.style.id !== source.styleId) {
      return {
        status: "invalid",
        source,
        reasons: ["Catalog cart source does not match a real style."],
      };
    }
    return { status: "valid", source, reasons: [] };
  }
  if (item.style) {
    return {
      status: "invalid",
      source,
      reasons: ["Uploaded cart source must not contain a catalogue style."],
    };
  }
  const modernInspection = inspectCartItemFabricAllocations(item);
  const fabricAllocations =
    modernInspection.status === "valid"
      ? normalizeCartFabricAllocations(modernInspection.fabricAllocations)
      : undefined;
  const reasons = validateUploadedAllocations(
    source,
    fabricAllocations,
    item.cartDesignPricingSnapshot,
  );
  return {
    status: reasons.length === 0 ? "valid" : "invalid",
    source,
    reasons,
  };
};

export const normalizeCartItemDesignDomain = (item: CartItem): CartItem => {
  const source = getCartDesignSource(item);
  const modernInspection = inspectCartItemFabricAllocations(item);
  const fabricAllocations =
    modernInspection.status === "valid"
      ? normalizeCartFabricAllocations(modernInspection.fabricAllocations)
      : item.fabricAllocations;
  const normalized: CartItem = {
    ...item,
    ...(source ? { cartDesignSource: source } : {}),
    ...(fabricAllocations ? { fabricAllocations } : {}),
  };
  const inspection = inspectCartDesignDomain(normalized);
  const validation: CartDesignValidation = {
    status: inspection.status,
    reasons: inspection.reasons,
  };
  return {
    ...normalized,
    cartDesignValidation: validation,
  };
};

export const getCartDesignConfigurationFingerprintInput = (item: CartItem) => {
  const source = getCartDesignSource(item);
  const allocations = resolveCartDesignAllocationsForFingerprint(item);
  // Preserve the existing catalogue-cart identity used for legacy cart claims.
  if (source?.kind !== "uploaded") {
    const inspection = inspectCartItemFabricAllocations(item);
    return {
      styleId: item.style?.id || null,
      fabricCode: inspection.status === "valid" ? null : item.fabric.code,
      fabricAllocations: toDeterministicFabricAllocationHashInput(
        inspection.status === "valid" ? inspection.fabricAllocations : undefined,
      ),
      design: item.design,
      garmentType: item.garment.type,
      measurements: item.measurements,
      specialInstructions: item.specialInstructions,
      notesAboutLeftoverFabric: item.notesAboutLeftoverFabric,
      batchType: item.batchType,
      batchId: item.batchId,
      batchName: item.batchName,
      customGroupCode: item.customGroupCode,
      garmentPieceCount: item.garmentPieceCount,
      deliverySelection: item.deliverySelection,
    };
  }
  return {
    designSource:
      source?.kind === "uploaded"
        ? {
            kind: source.kind,
            sourceKey: source.sourceKey,
            designReferenceId: source.uploadReference.designReferenceId,
            composition: source.fabricCapacityComposition,
            demographic: source.demographic,
          }
        : source,
    fabricAllocations: allocations,
    design: item.design,
    garmentType: item.garment.type,
    measurements: item.measurements,
    specialInstructions: item.specialInstructions,
    notesAboutLeftoverFabric: item.notesAboutLeftoverFabric,
    batchType: item.batchType,
    batchId: item.batchId,
    batchName: item.batchName,
    customGroupCode: item.customGroupCode,
    garmentPieceCount: item.garmentPieceCount,
    deliverySelection: item.deliverySelection,
  };
};

const resolveCartDesignAllocationsForFingerprint = (item: CartItem) => {
  const inspection = inspectCartItemFabricAllocations(item);
  if (inspection.status !== "valid") return undefined;
  return inspection.fabricAllocations.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentAssignments: allocation.garmentAssignments.map((assignment) => ({
      garmentKey: assignment.garmentKey,
      code: assignment.code,
      garmentType: assignment.garmentType,
      fabricUnits: assignment.fabricUnits,
      lowerGarmentType: assignment.lowerGarmentType,
      garmentSpec: assignment.garmentSpec,
      sourceRole: assignment.sourceRole || "main",
      mainGarmentKey: assignment.mainGarmentKey,
      mainGarmentType: assignment.mainGarmentType,
      eligibilityRule: assignment.eligibilityRule,
      dependencyStatus: assignment.dependencyStatus,
    })),
  }));
};

export const getCartFabricQuantity = (item: CartItem): number => {
  const inspection = inspectCartItemFabricAllocations(item);
  return inspection.status === "valid"
    ? getCustomerFacingFabricQuantityForAllocations(
        inspection.fabricAllocations,
      ).fabricQuantity
    : 0;
};

export interface CartGarmentAssignmentPresentation {
  allocationId: string;
  garmentKey: string;
  label: string;
  role: "Main" | "Additional";
}

/**
 * Customer-facing cart structure comes from durable allocation assignments,
 * never reconstructed from a design label or upload reference.
 */
export const getCartGarmentAssignmentPresentation = (
  item: CartItem,
): CartGarmentAssignmentPresentation[] => {
  const inspection = inspectCartItemFabricAllocations(item);
  if (inspection.status !== "valid") return [];
  return inspection.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => ({
      allocationId: allocation.allocationId,
      garmentKey: assignment.garmentKey,
      label: getFabricGarmentLabel(assignment.garmentType),
      role: assignment.sourceRole === "additional" ? "Additional" : "Main",
    })),
  );
};

export const createCatalogStoredOrderDesignSource = (
  styleId: string,
): StoredOrderDesignSource | null => {
  const source = createCatalogDesignSource(styleId);
  return source
    ? { kind: "catalog", sourceKey: source.sourceKey, styleId: source.styleId }
    : null;
};

export const createUploadedDraftStoredOrderDesignSource = (
  source: UploadedCartDesignSource,
): StoredOrderDesignSource => ({
  kind: "uploaded",
  sourceKey: source.sourceKey,
  displayLabel: source.displayLabel,
  fabricCapacityComposition: source.fabricCapacityComposition.map((spec) => ({
    ...spec,
  })),
  demographic: source.demographic,
  imageState: {
    kind: "draft_pending_trusted_transfer",
    draftReference: { ...source.uploadReference },
  },
});

export const isUploadedOrderDesignImmutable = (
  source: StoredOrderDesignSource | undefined,
): boolean =>
  source?.kind === "uploaded" &&
  source.imageState.kind === "immutable_order_asset";

export const normalizeMasterOrderDesignDomain = <T extends {
  style?: StyleCategory;
  orderDesignSource?: StoredOrderDesignSource;
}>(order: T): T => {
  if (order.orderDesignSource) return order;
  const source = order.style?.id
    ? createCatalogStoredOrderDesignSource(order.style.id)
    : null;
  return source ? { ...order, orderDesignSource: source } : order;
};
