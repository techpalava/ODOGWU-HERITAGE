import type {
  AdditionalGarmentConstructionStateV1,
  CanonicalPhysicalGarmentType,
  CatalogDesignSource,
  CustomerDesignUploadReference,
  CustomDetailDemographic,
  CustomDetailDesignContext,
  CustomDetailOption,
  DesignSource,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  FabricGarmentAssignment,
  FabricGarmentType,
  FabricUnitCount,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
  UploadedDesignSource,
} from "../types";
import { isCustomerDesignDraftStoragePath } from "../services/customerDesignUploadReference";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  isCanonicalPhysicalGarmentType,
} from "./garmentConstructionPricing";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  evaluateUploadedCompositionStep1Coverage,
  getUploadedDesignCompositionNeedsReview,
  UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE,
  UPLOADED_DESIGN_MISSING_REQUIRED_STEP1_GARMENTS_MESSAGE,
} from "./uploadedDesignStep1";
import { normalizeCustomDetailCatalog } from "./catalogHelpers";
import {
  getPhysicalGarmentOccurrenceGeneration,
  reconcilePhysicalGarmentOccurrenceIdentityState,
} from "./physicalGarmentOccurrenceIdentity";

export const CATALOG_DESIGN_SOURCE_PREFIX = "catalog:";
export const UPLOADED_DESIGN_SOURCE_PREFIX = "uploaded:";
export const UPLOADED_DESIGN_DEFAULT_LABEL = "Your Uploaded Design";

const FABRIC_GARMENT_TYPES = new Set([
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
  "other",
]);

const DEMOGRAPHICS = new Set<CustomDetailDemographic>([
  "male",
  "female",
  "unisex",
]);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isFabricCapacityGarmentSpec = (
  value: unknown,
): value is FabricCapacityGarmentSpec => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FabricCapacityGarmentSpec>;
  if (
    !hasText(candidate.key) ||
    !FABRIC_GARMENT_TYPES.has(candidate.garmentType || "") ||
    (candidate.fabricUnits !== 1 && candidate.fabricUnits !== 2)
  ) {
    return false;
  }
  return (
    candidate.lowerGarmentType === undefined ||
    candidate.lowerGarmentType === "trousers" ||
    candidate.lowerGarmentType === "skirt"
  );
};

const cloneComposition = (
  composition: readonly FabricCapacityGarmentSpec[],
): FabricCapacityGarmentSpec[] =>
  composition.map((spec) => ({
    key: spec.key,
    garmentType: spec.garmentType,
    fabricUnits: spec.fabricUnits,
    ...(spec.lowerGarmentType
      ? { lowerGarmentType: spec.lowerGarmentType }
      : {}),
  }));

const cloneUploadReference = (
  reference: CustomerDesignUploadReference,
): CustomerDesignUploadReference => ({
  designReferenceId: reference.designReferenceId,
  ownerUid: reference.ownerUid,
  storagePath: reference.storagePath,
  mimeType: reference.mimeType,
  ...(typeof reference.originalFileName === "string"
    ? { originalFileName: reference.originalFileName }
    : {}),
  createdAt: reference.createdAt,
});

export const getCatalogDesignSourceKey = (styleId: string): string =>
  `${CATALOG_DESIGN_SOURCE_PREFIX}${styleId}`;

export const getUploadedDesignSourceKey = (designReferenceId: string): string =>
  `${UPLOADED_DESIGN_SOURCE_PREFIX}${designReferenceId}`;

export const createCatalogDesignSource = (
  styleId: string,
): CatalogDesignSource | null =>
  hasText(styleId)
    ? {
        kind: "catalog",
        styleId,
        sourceKey: getCatalogDesignSourceKey(styleId),
      }
    : null;

/**
 * Authoritative catalogue style activation used by Design Studio Step 3.
 * Keeps selectedStyleId and design-source identity bound to the same style.
 */
export const activateFutureCatalogStyleSelection = (input: {
  styleId: string;
  primaryFabricCode?: string | null;
}): {
  selectedStyleId: string;
  designSource: CatalogDesignSource;
  confirmedDesignSourceKey: string;
  priceActivatedFabricCode: string | null;
} => {
  const designSource = createCatalogDesignSource(input.styleId);
  if (!designSource) {
    throw new TypeError(
      "A non-empty catalogue style id is required to activate a Design Style selection.",
    );
  }
  return {
    selectedStyleId: designSource.styleId,
    designSource,
    confirmedDesignSourceKey: designSource.sourceKey,
    priceActivatedFabricCode:
      typeof input.primaryFabricCode === "string" &&
      input.primaryFabricCode.trim()
        ? input.primaryFabricCode.trim()
        : null,
  };
};

export const createUploadedDesignSource = ({
  uploadReference,
  fabricCapacityComposition,
  demographic,
  displayLabel = UPLOADED_DESIGN_DEFAULT_LABEL,
}: Omit<UploadedDesignSource, "kind" | "sourceKey" | "displayLabel"> & {
  displayLabel?: string;
}): UploadedDesignSource => {
  const source: UploadedDesignSource = {
    kind: "uploaded",
    sourceKey: getUploadedDesignSourceKey(uploadReference.designReferenceId),
    uploadReference: cloneUploadReference(uploadReference),
    fabricCapacityComposition: cloneComposition(fabricCapacityComposition),
    demographic,
    displayLabel,
  };
  if (!isValidUploadedDesignSource(source)) {
    throw new TypeError("Uploaded design sources require a valid private reference and garment composition.");
  }
  return source;
};

const isValidUploadedDesignSourceShape = (
  source: unknown,
  requireComposition: boolean,
): source is UploadedDesignSource => {
  if (!source || typeof source !== "object") return false;
  const candidate = source as Partial<UploadedDesignSource>;
  return (
    candidate.kind === "uploaded" &&
    hasText(candidate.sourceKey) &&
    hasText(candidate.displayLabel) &&
    candidate.sourceKey ===
      getUploadedDesignSourceKey(candidate.uploadReference?.designReferenceId || "") &&
    candidate.uploadReference !== undefined &&
    isCustomerDesignDraftStoragePath(candidate.uploadReference) &&
    hasText(candidate.uploadReference.createdAt) &&
    (candidate.uploadReference.originalFileName === undefined ||
      typeof candidate.uploadReference.originalFileName === "string") &&
    DEMOGRAPHICS.has(candidate.demographic as CustomDetailDemographic) &&
    Array.isArray(candidate.fabricCapacityComposition) &&
    (!requireComposition || candidate.fabricCapacityComposition.length > 0) &&
    candidate.fabricCapacityComposition.every(isFabricCapacityGarmentSpec)
  );
};

/**
 * Draft-only structural contract. An active legacy migration may retain a
 * private uploaded-design identity while removing its final invalid garment.
 * Progression and order conversion continue to require the stricter non-empty
 * composition contract below.
 */
export const isValidUploadedDesignDraftSource = (
  source: unknown,
): source is UploadedDesignSource =>
  isValidUploadedDesignSourceShape(source, false);

export const isValidUploadedDesignSource = (
  source: unknown,
): source is UploadedDesignSource =>
  isValidUploadedDesignSourceShape(source, true);

export const isValidDesignSource = (source: unknown): source is DesignSource => {
  if (!source || typeof source !== "object") return false;
  const candidate = source as Partial<DesignSource>;
  if (candidate.kind === "catalog") {
    return (
      hasText(candidate.styleId) &&
      candidate.sourceKey === getCatalogDesignSourceKey(candidate.styleId)
    );
  }
  return isValidUploadedDesignSource(candidate);
};

export const cloneDesignSource = (
  source: DesignSource | null | undefined,
): DesignSource | null => {
  if (!source) return null;
  if (source.kind === "catalog") return { ...source };
  return {
    ...source,
    uploadReference: cloneUploadReference(source.uploadReference),
    fabricCapacityComposition: cloneComposition(source.fabricCapacityComposition),
  };
};

export const isDesignSourceConfirmed = (
  source: DesignSource | null | undefined,
  confirmedDesignSourceKey: string | null | undefined,
): boolean => Boolean(source && confirmedDesignSourceKey === source.sourceKey);

export const resolveActiveDesignSource = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): DesignSource | null =>
  designSource ||
  (selectedStyle ? createCatalogDesignSource(selectedStyle.id) : null);

/**
 * A source-validity gate for source-agnostic Design Studio transitions.
 * Catalog sources still require the real selected catalog style; uploaded
 * sources are validated through their private-reference contract instead.
 */
export const hasValidActiveDesignSource = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): boolean => {
  const source = resolveActiveDesignSource(designSource, selectedStyle);
  if (!isValidDesignSource(source)) return false;

  return source.kind === "uploaded"
    ? isValidUploadedDesignSource(source)
    : selectedStyle?.id === source.styleId;
};

export const resolveActiveDesignSourceKey = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): string | null => resolveActiveDesignSource(designSource, selectedStyle)?.sourceKey || null;

export interface ActiveDesignSelectionPresentation {
  label: string;
  includedGarmentLabels: string[];
  isUploaded: boolean;
}

export const getActiveDesignSelectionPresentation = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): ActiveDesignSelectionPresentation => {
  const source = resolveActiveDesignSource(designSource, selectedStyle);
  if (source?.kind === "uploaded") {
    return {
      label: source.displayLabel,
      includedGarmentLabels: source.fabricCapacityComposition.map((spec) =>
        getFabricGarmentLabel(spec.garmentType),
      ),
      isUploaded: true,
    };
  }

  return {
    label: selectedStyle?.name || "Pending",
    includedGarmentLabels: [],
    isUploaded: false,
  };
};

export const resolveActiveDesignComposition = (
  designSource: DesignSource | null | undefined,
  _selectedStyle: StyleCategory | null | undefined,
): FabricCapacityGarmentSpec[] => {
  const source = resolveActiveDesignSource(designSource, _selectedStyle);
  if (source?.kind === "uploaded") {
    return cloneComposition(source.fabricCapacityComposition);
  }
  return [];
};

export type PhysicalGarmentOccurrence = {
  garmentKey: string;
  garmentType: CanonicalPhysicalGarmentType;
  sourceRole: "main" | "additional";
  fabricUnits: number;
  occurrenceGeneration?: number;
};

export type AuthoritativePhysicalOrderDiagnosticCode =
  | "upload_missing_required_step1_garment"
  | "upload_composition_needs_review"
  | "upload_not_confirmed"
  | "missing_demographic"
  | "duplicate_occurrence_key"
  | "duplicate_assignment_key"
  | "orphan_fabric_assignment"
  | "missing_occurrence_for_assignment";

export type FabricAssignmentIntegrityResult = {
  diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
  assignmentKeys: readonly string[];
};

const collectRawFabricAssignments = (
  fabricAllocationState?: FabricAllocationState | null,
): FabricGarmentAssignment[] => {
  const committed =
    fabricAllocationState?.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ) ?? [];
  const pending = fabricAllocationState?.pendingFabricGarment;
  return pending ? [...committed, pending] : committed;
};

export const physicalOccurrencesToFabricRequirements = (
  occurrences: readonly PhysicalGarmentOccurrence[],
): FabricGarmentAssignment[] =>
  occurrences.map((occurrence) => ({
    garmentKey: occurrence.garmentKey,
    code:
      occurrence.sourceRole === "additional"
        ? `ADDITIONAL_${occurrence.garmentType.toUpperCase()}`
        : `BASE_${occurrence.garmentType.toUpperCase()}`,
    garmentType: occurrence.garmentType,
    fabricUnits: occurrence.fabricUnits as FabricUnitCount,
    sourceRole: occurrence.sourceRole,
  }));

export const parseAdditionalGarmentTypeFromKey = (
  garmentKey: string,
): CanonicalPhysicalGarmentType | null => {
  if (!garmentKey.startsWith("additional:")) return null;
  const garmentType = garmentKey.split(":")[1];
  return isCanonicalPhysicalGarmentType(garmentType as FabricGarmentType)
    ? (garmentType as CanonicalPhysicalGarmentType)
    : null;
};

const resolveAdditionalOccurrenceGarmentType = ({
  garmentKey,
  additionalGarmentConstructionState,
}: {
  garmentKey: string;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): CanonicalPhysicalGarmentType | null => {
  const construction = additionalGarmentConstructionState?.byGarmentKey[garmentKey];
  if (
    construction?.garmentType &&
    isCanonicalPhysicalGarmentType(construction.garmentType)
  ) {
    return construction.garmentType;
  }
  return parseAdditionalGarmentTypeFromKey(garmentKey);
};

const projectAuthorizedAdditionalPhysicalOccurrences = ({
  additionalGarmentConstructionState,
}: {
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): PhysicalGarmentOccurrence[] => {
  const occurrences: PhysicalGarmentOccurrence[] = [];
  Object.keys(additionalGarmentConstructionState?.byGarmentKey || {}).forEach(
    (garmentKey) => {
      const garmentType = resolveAdditionalOccurrenceGarmentType({
        garmentKey,
        additionalGarmentConstructionState,
      });
      if (!garmentType) return;
      occurrences.push({
        garmentKey,
        garmentType,
        sourceRole: "additional",
        fabricUnits: createStyleBaseGarmentSpec(garmentType).fabricUnits,
      });
    },
  );
  return occurrences;
};

const projectSourceBasePhysicalOccurrences = ({
  sourceKind,
  step1GarmentTypeSelection,
  uploadedCompositionSpecs,
}: {
  sourceKind: "catalogue" | "uploaded";
  step1GarmentTypeSelection: GarmentTypeStepSelection;
  uploadedCompositionSpecs?: readonly FabricCapacityGarmentSpec[] | null;
}): PhysicalGarmentOccurrence[] => {
  if (sourceKind === "uploaded" && uploadedCompositionSpecs?.length) {
    return uploadedCompositionSpecs.map((spec) => ({
      garmentKey: spec.key,
      garmentType: spec.garmentType as CanonicalPhysicalGarmentType,
      sourceRole: inferOccurrenceRole(
        spec.key,
        spec.garmentType,
        step1GarmentTypeSelection.garmentTypes,
      ),
      fabricUnits: spec.fabricUnits,
    }));
  }

  return step1GarmentTypeSelection.garmentTypes.map((garmentType) => {
    const spec = createStyleBaseGarmentSpec(garmentType);
    return {
      garmentKey: spec.key,
      garmentType,
      sourceRole: "main" as const,
      fabricUnits: spec.fabricUnits,
    };
  });
};

export const validateRawFabricAssignments = ({
  authoritativeOccurrenceKeys,
  fabricAllocationState,
}: {
  authoritativeOccurrenceKeys: ReadonlySet<string>;
  fabricAllocationState?: FabricAllocationState | null;
}): FabricAssignmentIntegrityResult => {
  const diagnostics: AuthoritativePhysicalOrderDiagnostic[] = [];
  const rawAssignments = collectRawFabricAssignments(fabricAllocationState);
  const seenKeys = new Set<string>();
  const assignmentKeys: string[] = [];

  rawAssignments.forEach((assignment) => {
    if (seenKeys.has(assignment.garmentKey)) {
      diagnostics.push({
        code: "duplicate_assignment_key",
        message: "Duplicate Fabric assignment keys were detected.",
        garmentKey: assignment.garmentKey,
      });
    }
    seenKeys.add(assignment.garmentKey);
    assignmentKeys.push(assignment.garmentKey);
    if (!authoritativeOccurrenceKeys.has(assignment.garmentKey)) {
      diagnostics.push({
        code: "orphan_fabric_assignment",
        message:
          "A Fabric assignment does not match an active physical garment.",
        garmentKey: assignment.garmentKey,
        garmentType: isCanonicalPhysicalGarmentType(assignment.garmentType)
          ? assignment.garmentType
          : undefined,
      });
    }
  });

  return { diagnostics, assignmentKeys };
};

export const validateFinalPhysicalOccurrenceAssignmentParity = ({
  authoritativeOccurrenceKeys,
  fabricAllocationState,
}: {
  authoritativeOccurrenceKeys: readonly string[];
  fabricAllocationState: FabricAllocationState;
}): AuthoritativePhysicalOrderDiagnostic[] => {
  const occurrenceSet = new Set(authoritativeOccurrenceKeys);
  const integrity = validateRawFabricAssignments({
    authoritativeOccurrenceKeys: occurrenceSet,
    fabricAllocationState,
  });
  const diagnostics = [...integrity.diagnostics];
  const assignmentSet = new Set(integrity.assignmentKeys);
  authoritativeOccurrenceKeys.forEach((garmentKey) => {
    if (!assignmentSet.has(garmentKey)) {
      diagnostics.push({
        code: "missing_occurrence_for_assignment",
        message: "A physical garment is missing a Fabric assignment.",
        garmentKey,
      });
    }
  });
  return diagnostics;
};

export const resolveOccurrenceConstruction = ({
  garmentKey,
  garmentType,
  sourceRole,
  garmentTypeSelection,
  additionalGarmentConstructionState,
}: {
  garmentKey: string;
  garmentType: CanonicalPhysicalGarmentType;
  sourceRole: "main" | "additional";
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): GarmentConstructionPricingResolution | undefined => {
  if (sourceRole === "additional" || garmentKey.startsWith("additional:")) {
    return additionalGarmentConstructionState?.byGarmentKey[garmentKey];
  }
  return garmentTypeSelection.constructionByGarment[garmentType];
};

export type AuthoritativePhysicalOrderDiagnostic = {
  code: AuthoritativePhysicalOrderDiagnosticCode;
  message: string;
  garmentKey?: string;
  garmentType?: CanonicalPhysicalGarmentType;
};

export type AuthoritativePhysicalOrderResolution =
  | {
      status: "resolved";
      sourceKind: "catalogue" | "uploaded";
      effectiveGarmentTypeSelection: GarmentTypeStepSelection;
      basePhysicalSpecs: FabricCapacityGarmentSpec[];
      physicalOccurrences: readonly PhysicalGarmentOccurrence[];
    }
  | {
      status: "blocked";
      sourceKind: "catalogue" | "uploaded";
      diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
    };

const inferOccurrenceRole = (
  garmentKey: string,
  garmentType: FabricGarmentType,
  step1GarmentTypes: readonly FabricGarmentType[],
): "main" | "additional" => {
  if (garmentKey.startsWith("additional:")) return "additional";
  if (garmentKey.startsWith("base:")) return "main";
  const step1Count = step1GarmentTypes.filter((type) => type === garmentType).length;
  return step1Count > 0 ? "main" : "additional";
};

const sortPhysicalOccurrences = (
  occurrences: readonly PhysicalGarmentOccurrence[],
  effectiveGarmentTypeSelection: GarmentTypeStepSelection,
): PhysicalGarmentOccurrence[] => {
  const baseKeyOrder = new Map(
    effectiveGarmentTypeSelection.garmentTypes.map((garmentType, index) => [
      createStyleBaseGarmentSpec(garmentType).key,
      index,
    ]),
  );
  return [...occurrences].sort((left, right) => {
    const leftIsAdditional =
      left.sourceRole === "additional" || left.garmentKey.startsWith("additional:");
    const rightIsAdditional =
      right.sourceRole === "additional" || right.garmentKey.startsWith("additional:");
    if (leftIsAdditional !== rightIsAdditional) {
      return leftIsAdditional ? 1 : -1;
    }
    if (!leftIsAdditional) {
      const leftOrder = baseKeyOrder.get(left.garmentKey) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = baseKeyOrder.get(right.garmentKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    return left.garmentKey.localeCompare(right.garmentKey);
  });
};

export const buildAuthoritativePhysicalOccurrences = ({
  sourceKind,
  step1GarmentTypeSelection,
  effectiveGarmentTypeSelection,
  uploadedCompositionSpecs,
  additionalGarmentConstructionState,
}: {
  sourceKind: "catalogue" | "uploaded";
  step1GarmentTypeSelection: GarmentTypeStepSelection;
  effectiveGarmentTypeSelection: GarmentTypeStepSelection;
  uploadedCompositionSpecs?: readonly FabricCapacityGarmentSpec[] | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): PhysicalGarmentOccurrence[] => {
  const baseOccurrences = projectSourceBasePhysicalOccurrences({
    sourceKind,
    step1GarmentTypeSelection,
    uploadedCompositionSpecs,
  });
  const additionalOccurrences = projectAuthorizedAdditionalPhysicalOccurrences({
    additionalGarmentConstructionState,
  });

  const sortedOccurrences = sortPhysicalOccurrences(
    [...baseOccurrences, ...additionalOccurrences],
    effectiveGarmentTypeSelection,
  );
  const identityState = reconcilePhysicalGarmentOccurrenceIdentityState({
    state: step1GarmentTypeSelection.physicalOccurrenceIdentityState,
    activeGarmentKeys: sortedOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
  });
  return sortedOccurrences.map((occurrence) => ({
    ...occurrence,
    occurrenceGeneration:
      getPhysicalGarmentOccurrenceGeneration(
        identityState,
        occurrence.garmentKey,
      ) ?? undefined,
  }));
};

export const projectAuthoritativePhysicalOccurrences = ({
  sourceKind = "catalogue",
  step1GarmentTypeSelection,
  effectiveGarmentTypeSelection,
  uploadedCompositionSpecs = null,
  additionalGarmentConstructionState = null,
  compositionFallback: _compositionFallback,
  pendingAdditionalGarment: _pendingAdditionalGarment,
}: {
  sourceKind?: "catalogue" | "uploaded";
  step1GarmentTypeSelection?: GarmentTypeStepSelection;
  effectiveGarmentTypeSelection: GarmentTypeStepSelection;
  uploadedCompositionSpecs?: readonly FabricCapacityGarmentSpec[] | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  pendingAdditionalGarment?: FabricGarmentAssignment | null;
  fabricAllocationState?: FabricAllocationState | null;
  compositionFallback?: readonly FabricCapacityGarmentSpec[] | null;
}): PhysicalGarmentOccurrence[] =>
  buildAuthoritativePhysicalOccurrences({
    sourceKind,
    step1GarmentTypeSelection:
      step1GarmentTypeSelection || effectiveGarmentTypeSelection,
    effectiveGarmentTypeSelection,
    uploadedCompositionSpecs,
    additionalGarmentConstructionState,
  });

const validateAuthoritativeOccurrenceKeys = (
  occurrences: readonly PhysicalGarmentOccurrence[],
): AuthoritativePhysicalOrderDiagnostic[] => {
  const keys = occurrences.map((occurrence) => occurrence.garmentKey);
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    return [
      {
        code: "duplicate_occurrence_key",
        message: "Duplicate physical garment keys were detected.",
      },
    ];
  }
  return [];
};

export const resolveAuthoritativePhysicalOrder = ({
  garmentTypeSelection,
  designSource,
  selectedStyle,
  confirmedDesignSourceKey,
  normalizedCustomDetailCatalog,
  fabricAllocationState,
  additionalGarmentConstructionState,
  pendingAdditionalGarment: _pendingAdditionalGarment,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  designSource?: DesignSource | null;
  selectedStyle?: StyleCategory | null;
  confirmedDesignSourceKey?: string | null;
  normalizedCustomDetailCatalog?: readonly CustomDetailOption[];
  fabricAllocationState?: FabricAllocationState | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  pendingAdditionalGarment?: FabricGarmentAssignment | null;
}): AuthoritativePhysicalOrderResolution => {
  const activeSource = resolveActiveDesignSource(designSource, selectedStyle);
  const catalog = normalizedCustomDetailCatalog
    ? normalizedCustomDetailCatalog
    : normalizeCustomDetailCatalog([]);
  const uploadedConfirmed =
    activeSource?.kind === "uploaded" &&
    confirmedDesignSourceKey === activeSource.sourceKey;

  const finalizeResolution = ({
    sourceKind,
    effectiveGarmentTypeSelection,
    basePhysicalSpecs,
    physicalOccurrences,
  }: {
    sourceKind: "catalogue" | "uploaded";
    effectiveGarmentTypeSelection: GarmentTypeStepSelection;
    basePhysicalSpecs: FabricCapacityGarmentSpec[];
    physicalOccurrences: readonly PhysicalGarmentOccurrence[];
  }): AuthoritativePhysicalOrderResolution => {
    const occurrenceDiagnostics = validateAuthoritativeOccurrenceKeys(
      physicalOccurrences,
    );
    const assignmentIntegrity = validateRawFabricAssignments({
      authoritativeOccurrenceKeys: new Set(
        physicalOccurrences.map((occurrence) => occurrence.garmentKey),
      ),
      fabricAllocationState,
    });
    const diagnostics = [
      ...occurrenceDiagnostics,
      ...assignmentIntegrity.diagnostics,
    ];
    if (diagnostics.length > 0) {
      return { status: "blocked", sourceKind, diagnostics };
    }
    return {
      status: "resolved",
      sourceKind,
      effectiveGarmentTypeSelection,
      basePhysicalSpecs,
      physicalOccurrences,
    };
  };

  if (uploadedConfirmed) {
    if (getUploadedDesignCompositionNeedsReview(activeSource.fabricCapacityComposition)) {
      return {
        status: "blocked",
        sourceKind: "uploaded",
        diagnostics: [
          {
            code: "upload_composition_needs_review",
            message: UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE,
          },
        ],
      };
    }
    const step1Coverage = evaluateUploadedCompositionStep1Coverage({
      step1GarmentTypes: garmentTypeSelection.garmentTypes,
      uploadedComposition: activeSource.fabricCapacityComposition,
    });
    if (step1Coverage.status === "missing_required") {
      const missingLabels = step1Coverage.missingGarmentTypes
        .map((garmentType) => getFabricGarmentLabel(garmentType))
        .join(", ");
      return {
        status: "blocked",
        sourceKind: "uploaded",
        diagnostics: [
          {
            code: "upload_missing_required_step1_garment",
            message: `${UPLOADED_DESIGN_MISSING_REQUIRED_STEP1_GARMENTS_MESSAGE} Missing: ${missingLabels}.`,
          },
        ],
      };
    }
    if (!activeSource.demographic) {
      return {
        status: "blocked",
        sourceKind: "uploaded",
        diagnostics: [
          {
            code: "missing_demographic",
            message: "Select who the uploaded design is for before continuing.",
          },
        ],
      };
    }
    const effectiveGarmentTypeSelection =
      buildEffectiveUploadedJourneyGarmentTypeSelection({
        step1Selection: garmentTypeSelection,
        uploadedComposition: activeSource.fabricCapacityComposition,
        normalizedCustomDetailCatalog: catalog,
      });
    const physicalOccurrences = buildAuthoritativePhysicalOccurrences({
      sourceKind: "uploaded",
      step1GarmentTypeSelection: garmentTypeSelection,
      effectiveGarmentTypeSelection,
      uploadedCompositionSpecs: activeSource.fabricCapacityComposition,
      additionalGarmentConstructionState,
    });
    return finalizeResolution({
      sourceKind: "uploaded",
      effectiveGarmentTypeSelection,
      basePhysicalSpecs: activeSource.fabricCapacityComposition.map((spec) => ({
        ...spec,
      })),
      physicalOccurrences,
    });
  }

  const effectiveGarmentTypeSelection = garmentTypeSelection;
  const physicalOccurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection,
    additionalGarmentConstructionState,
  });
  return finalizeResolution({
    sourceKind: "catalogue",
    effectiveGarmentTypeSelection,
    basePhysicalSpecs: garmentTypeSelection.garmentTypes.map(
      createStyleBaseGarmentSpec,
    ),
    physicalOccurrences,
  });
};

export const resolveActiveDesignDemographic = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): CustomDetailDemographic | null => {
  const source = resolveActiveDesignSource(designSource, selectedStyle);
  if (source?.kind === "uploaded") return source.demographic;

  const raw = String(selectedStyle?.targetDemographic || selectedStyle?.gender || "unisex")
    .trim()
    .toLowerCase();
  return raw === "male" || raw === "female" ? raw : "unisex";
};

export const resolveActiveCustomDetailDesignContext = (
  designSource: DesignSource | null | undefined,
  selectedStyle: StyleCategory | null | undefined,
): CustomDetailDesignContext | null => {
  const source = resolveActiveDesignSource(designSource, selectedStyle);
  if (source?.kind === "uploaded") {
    return {
      kind: "uploaded",
      sourceKey: source.sourceKey,
      fabricCapacityComposition: cloneComposition(source.fabricCapacityComposition),
      demographic: source.demographic,
      displayLabel: source.displayLabel,
    };
  }
  return selectedStyle || null;
};

export const getConfirmedDesignSourceKeyAfterChange = (
  currentConfirmedDesignSourceKey: string | null | undefined,
  nextSource: DesignSource | null | undefined,
): string | null =>
  nextSource && currentConfirmedDesignSourceKey === nextSource.sourceKey
    ? currentConfirmedDesignSourceKey
    : null;

export const hasSameDesignSource = (
  currentSource: DesignSource | null | undefined,
  nextSource: DesignSource | null | undefined,
): boolean => {
  if (!currentSource || !nextSource || currentSource.kind !== nextSource.kind) {
    return false;
  }
  if (currentSource.kind === "catalog" && nextSource.kind === "catalog") {
    return currentSource.styleId === nextSource.styleId;
  }
  if (currentSource.kind !== "uploaded" || nextSource.kind !== "uploaded") {
    return false;
  }
  return (
    currentSource.sourceKey === nextSource.sourceKey &&
    currentSource.demographic === nextSource.demographic &&
    currentSource.displayLabel === nextSource.displayLabel &&
    JSON.stringify(currentSource.uploadReference) ===
      JSON.stringify(nextSource.uploadReference) &&
    JSON.stringify(currentSource.fabricCapacityComposition) ===
      JSON.stringify(nextSource.fabricCapacityComposition)
  );
};

export const getConfirmedDesignSourceKeyAfterSourceChange = (
  currentSource: DesignSource | null | undefined,
  currentConfirmedDesignSourceKey: string | null | undefined,
  nextSource: DesignSource | null | undefined,
): string | null =>
  hasSameDesignSource(currentSource, nextSource)
    ? getConfirmedDesignSourceKeyAfterChange(
        currentConfirmedDesignSourceKey,
        nextSource,
      )
    : null;

const clearInvalidDesignSourceDraftState = (
  draft: GuestDesignDraft,
): GuestDesignDraft => ({
  ...draft,
  designSource: null,
  selectedStyleId: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
  priceActivatedFabricCode: null,
  selectedGarment: null,
  designSelections: {
    ...draft.designSelections,
    customDetails: {},
  },
  fabricAllocations: undefined,
});

/**
 * Normalizes only the design-source portion of a serializable guest draft.
 * No catalog lookup or Firebase request occurs here.
 */
export const reconcileGuestDesignDraftDesignSource = (
  draft: GuestDesignDraft,
): GuestDesignDraft => {
  const source = draft.designSource;

  if (source?.kind === "uploaded") {
    if (!isValidUploadedDesignDraftSource(source)) {
      return clearInvalidDesignSourceDraftState(draft);
    }
    return {
      ...draft,
      designSource: cloneDesignSource(source),
      selectedStyleId: null,
      selectedGarment: null,
      confirmedStyleId: null,
      confirmedDesignSourceKey: isDesignSourceConfirmed(
        source,
        draft.confirmedDesignSourceKey,
      )
        ? draft.confirmedDesignSourceKey
        : null,
    };
  }

  if (source?.kind === "catalog") {
    if (!isValidDesignSource(source)) {
      return clearInvalidDesignSourceDraftState(draft);
    }
    const isConfirmed = isDesignSourceConfirmed(
      source,
      draft.confirmedDesignSourceKey,
    );
    return {
      ...draft,
      designSource: cloneDesignSource(source),
      selectedStyleId: source.styleId,
      confirmedStyleId:
        draft.confirmedStyleId === source.styleId ? draft.confirmedStyleId : null,
      confirmedDesignSourceKey: isConfirmed ? draft.confirmedDesignSourceKey : null,
      priceActivatedFabricCode:
        draft.confirmedStyleId === source.styleId
          ? draft.priceActivatedFabricCode || null
          : null,
    };
  }

  if (source !== undefined && source !== null) {
    return clearInvalidDesignSourceDraftState(draft);
  }

  // Keep old drafts byte-compatible until a user actively changes the source.
  // Cart normalization, unlike Studio draft autosave, upgrades legacy catalogue
  // records because it needs durable order identity immediately.
  return draft;
};
