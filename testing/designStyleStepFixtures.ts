import type {
  CanonicalPhysicalGarmentType,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
  UploadedDesignSource,
} from "../src/types";
import {
  getDesignStyleAuthorityMetadata,
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
} from "../src/utils/designStyleAuthority";
import {
  buildDesignStyleDraftValidationAuthority,
  buildUploadedDesignStyleAuthority,
  hydrateDesignStyleDraftEnvelope,
  hydrateDesignStyleDraftPersistence,
  type PersistedDesignStyleDraftV2,
} from "../src/utils/designStyleDraftPersistence";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  assignUploadedDesignStyleToGarmentOccurrence,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type GarmentScopedDesignStyleValidationAuthority,
} from "../src/utils/garmentScopedDesignStyleAssignment";
import type { PhysicalGarmentOccurrence } from "../src/utils/designSourceState";
import { createPhysicalGarmentOccurrenceIdentityToken } from "../src/utils/physicalGarmentOccurrenceIdentity";
import {
  bindDesignStyleStepCatalogueLedgerRevision,
  projectActiveOccurrenceDesignStyleCatalogue,
  projectDesignStyleStep,
  resolveActiveDesignStyleOccurrence,
  type DesignStyleStepCatalogMutationRequest,
  type DesignStyleStepClearMutationRequest,
} from "../src/utils/designStyleStepRuntime";

export const createStrictPublishedStyle = (
  style: StyleCategory,
  displayOrder = 0,
): StyleCategory => {
  const referenceGarments = (style.fabricCapacityComposition || []).map(
    (item) => item.garmentType as CanonicalPhysicalGarmentType,
  );
  const record = prepareAuthoritativeDesignStyleRecord({
    style,
    lifecycle: "published",
    displayOrder,
    referenceComposition:
      referenceGarments.length > 0
        ? { status: "known", garmentTypes: referenceGarments }
        : { status: "legacy_unresolved", garmentTypes: [] },
    currentRecord: null,
  });
  const projection = projectPublishedDesignStyleRecord(record);
  if (!projection) throw new Error("STRICT_STYLE_PROJECTION_FAILED");
  return projection;
};

export const createDesignStyleOccurrences = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
): PhysicalGarmentOccurrence[] => {
  const seen = new Map<CanonicalPhysicalGarmentType, number>();
  return garmentTypes.map((garmentType, index) => {
    const occurrence = (seen.get(garmentType) || 0) + 1;
    seen.set(garmentType, occurrence);
    return {
      garmentKey: `base:${garmentType}:${occurrence}`,
      garmentType,
      sourceRole: "main" as const,
      fabricUnits: 1,
      occurrenceGeneration: index + 1,
    };
  });
};

export interface DesignStyleStepTestModel {
  readonly styles: readonly StyleCategory[];
  readonly occurrences: readonly PhysicalGarmentOccurrence[];
  readonly authority: GarmentScopedDesignStyleValidationAuthority;
  readonly hydration: ReturnType<typeof hydrateDesignStyleDraftPersistence>;
  readonly projection: ReturnType<typeof projectDesignStyleStep>;
  readonly activeTarget: DesignStyleStepClearMutationRequest["target"] | null;
  readonly catalogueEntries: ReturnType<
    typeof bindDesignStyleStepCatalogueLedgerRevision
  >;
  readonly clearRequest: DesignStyleStepClearMutationRequest | null;
}

export const createDesignStyleStepTestModel = ({
  styles,
  garmentTypeSelection,
  occurrences = createDesignStyleOccurrences(
    garmentTypeSelection.garmentTypes as CanonicalPhysicalGarmentType[],
  ),
  catalogueState = "ready",
  rawDraft = {},
  selectedStyleIdByGarmentKey = {},
  uploadedAssignmentGarmentKeys = [],
  uploadedSource = null,
  confirmedUploadedSourceKey = null,
  expectedUploadOwnerUid = null,
  ownershipTransferPending = false,
  sourceOperationStable = true,
  activeTarget = null,
  runtimeGeneration = 1,
}: {
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  occurrences?: readonly PhysicalGarmentOccurrence[];
  catalogueState?: "loading" | "ready" | "error";
  rawDraft?: Partial<GuestDesignDraft> | Record<string, unknown>;
  selectedStyleIdByGarmentKey?: Readonly<Record<string, string>>;
  uploadedAssignmentGarmentKeys?: readonly string[];
  uploadedSource?: UploadedDesignSource | null;
  confirmedUploadedSourceKey?: string | null;
  expectedUploadOwnerUid?: string | null;
  ownershipTransferPending?: boolean;
  sourceOperationStable?: boolean;
  activeTarget?: DesignStyleStepClearMutationRequest["target"] | null;
  runtimeGeneration?: number;
}): DesignStyleStepTestModel => {
  const strictStyles = styles.map(createStrictPublishedStyle);
  const authority = buildDesignStyleDraftValidationAuthority({
    catalogueState,
    styles: strictStyles,
    garmentTypeSelection,
    activeOccurrences: occurrences,
    uploadedSourcesByKey: buildUploadedDesignStyleAuthority({
      source: uploadedSource,
      confirmedDesignSourceKey: confirmedUploadedSourceKey,
      expectedOwnerUid: expectedUploadOwnerUid,
      ownershipTransferPending,
      sourceOperationStable,
      activeOccurrences: occurrences,
    }),
  });
  let hydration = hydrateDesignStyleDraftPersistence({
    rawDraft,
    activeOccurrences: occurrences,
    authority,
  });
  let ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null =
    hydration.ledger;
  for (const occurrence of occurrences) {
    const styleId = selectedStyleIdByGarmentKey[occurrence.garmentKey];
    if (!styleId || !ledger || !occurrence.occurrenceGeneration) continue;
    const facts = authority.catalogStylesById[styleId];
    const occurrenceToken = createPhysicalGarmentOccurrenceIdentityToken({
      garmentKey: occurrence.garmentKey,
      generation: occurrence.occurrenceGeneration,
    });
    const eligibility = facts?.occurrenceEligibilityByToken[occurrenceToken];
    if (!facts || !eligibility || eligibility.status === "incompatible") {
      throw new Error(`STYLE_NOT_ELIGIBLE:${styleId}`);
    }
    const result = assignCatalogDesignStyleToGarmentOccurrence({
      ledger,
      expectedLedgerRevision: ledger.revision,
      activeOccurrences: occurrences,
      target: { garmentKey: occurrence.garmentKey, occurrenceToken },
      source: {
        sourceKey: facts.sourceKey,
        catalogStyleId: styleId,
        eligibilityFingerprint: facts.eligibilityFingerprint,
        ...(eligibility.status === "adaptable"
          ? {
              adaptabilityConfirmationFingerprint:
                eligibility.requiredConfirmationFingerprint,
            }
          : {}),
      },
    });
    if (result.status === "rejected") throw new Error(result.reason);
    ledger = result.ledger;
  }
  for (const garmentKey of uploadedAssignmentGarmentKeys) {
    const occurrence = occurrences.find((item) => item.garmentKey === garmentKey);
    if (
      !occurrence ||
      !ledger ||
      !occurrence.occurrenceGeneration ||
      !uploadedSource
    ) {
      throw new Error(`UPLOADED_ASSIGNMENT_NOT_AVAILABLE:${garmentKey}`);
    }
    const occurrenceToken = createPhysicalGarmentOccurrenceIdentityToken({
      garmentKey: occurrence.garmentKey,
      generation: occurrence.occurrenceGeneration,
    });
    const result = assignUploadedDesignStyleToGarmentOccurrence({
      ledger,
      expectedLedgerRevision: ledger.revision,
      activeOccurrences: occurrences,
      target: { garmentKey, occurrenceToken },
      source: {
        sourceKey: uploadedSource.sourceKey,
        uploadedSourceRef: uploadedSource.uploadReference.designReferenceId,
      },
    });
    if (result.status === "rejected") throw new Error(result.reason);
    ledger = result.ledger;
  }
  if (ledger !== hydration.ledger && ledger) {
    const envelope: PersistedDesignStyleDraftV2 = {
      schemaVersion: 2,
      ledger,
    };
    hydration = hydrateDesignStyleDraftEnvelope({
      envelope,
      activeOccurrences: occurrences,
      authority,
      legacyScalarFingerprint: hydration.legacyScalarFingerprint,
    });
  }
  const projection = projectDesignStyleStep({
    activeOccurrences: occurrences,
    hydration,
    authority,
    styles: strictStyles,
  });
  const resolvedActiveTarget = resolveActiveDesignStyleOccurrence({
    occurrences: projection.occurrences,
    current: activeTarget,
  });
  const catalogueEntries = bindDesignStyleStepCatalogueLedgerRevision({
    entries: projectActiveOccurrenceDesignStyleCatalogue({
      projection,
      activeTarget: resolvedActiveTarget,
      styles: strictStyles,
      authority,
      runtimeGeneration,
    }),
    ledgerRevision: hydration.ledger?.revision ?? -1,
  });
  return {
    styles: strictStyles,
    occurrences,
    authority,
    hydration,
    projection,
    activeTarget: resolvedActiveTarget,
    catalogueEntries,
    clearRequest:
      resolvedActiveTarget && hydration.ledger
        ? {
            runtimeGeneration,
            expectedLedgerRevision: hydration.ledger.revision,
            target: resolvedActiveTarget,
          }
        : null,
  };
};

export const createDesignStyleStepRenderProps = (
  model: DesignStyleStepTestModel,
) => ({
  occurrences: model.projection.occurrences,
  activeOccurrenceTarget: model.activeTarget,
  catalogueEntries: model.catalogueEntries,
  clearRequest: model.clearRequest,
  runtimeStatus: model.projection.runtimeStatus,
  completedCount: model.projection.completedCount,
  totalCount: model.projection.totalCount,
  exactSetComplete: model.projection.isComplete,
  reviewMessage: model.projection.reviewMessage,
  mutationError: null,
  stagePrice: null,
  isCatalogueLoading: false,
  stylesLoadState: "ready" as "loading" | "ready" | "error",
  onSelectOccurrence: (
    _target: DesignStyleStepClearMutationRequest["target"],
  ) => undefined,
  onAssignCatalogueStyle: (
    _request: DesignStyleStepCatalogMutationRequest,
  ) => undefined,
  onClearAssignment: (_request: DesignStyleStepClearMutationRequest) =>
    undefined,
  onBack: () => undefined,
  onReturnToGarmentType: () => undefined,
  onContinue: () => undefined,
});

export const getStrictStyleSourceKey = (style: StyleCategory): string => {
  const metadata = getDesignStyleAuthorityMetadata(style);
  if (!metadata) throw new Error("STRICT_STYLE_METADATA_MISSING");
  return metadata.sourceKey;
};
