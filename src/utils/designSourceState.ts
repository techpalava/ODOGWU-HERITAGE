import type {
  CatalogDesignSource,
  CustomerDesignUploadReference,
  CustomDetailDemographic,
  CustomDetailDesignContext,
  DesignSource,
  FabricCapacityGarmentSpec,
  GuestDesignDraft,
  StyleCategory,
  UploadedDesignSource,
} from "../types";
import { isCustomerDesignDraftStoragePath } from "../services/customerDesignUploadReference";
import { getStyleBaseFabricCapacityComposition } from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";

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

export const isValidUploadedDesignSource = (
  source: unknown,
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
    candidate.fabricCapacityComposition.length > 0 &&
    candidate.fabricCapacityComposition.every(isFabricCapacityGarmentSpec)
  );
};

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
  selectedStyle: StyleCategory | null | undefined,
): FabricCapacityGarmentSpec[] => {
  const source = resolveActiveDesignSource(designSource, selectedStyle);
  if (source?.kind === "uploaded") return cloneComposition(source.fabricCapacityComposition);
  return getStyleBaseFabricCapacityComposition(selectedStyle);
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
    if (!isValidUploadedDesignSource(source)) {
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
