import type {
  CanonicalPhysicalGarmentType,
  StyleCategory,
} from "../types";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  getDesignStyleAuthorityMetadata,
  isAuthoritativeDesignStyleProjection,
} from "./designStyleAuthority";
import {
  type FutureDesignStyleAdaptationConfirmationCopy,
  type FutureDesignStyleMatchPresentation,
} from "./designStudioFutureDesignStyle";
import {
  assignCatalogDesignStyleToGarmentOccurrence,
  clearGarmentDesignStyleAssignment,
  validateGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentMutationResult,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentDesignStyleAssignmentV2,
  type GarmentDesignStyleOccurrenceValidationStatus,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
  type GarmentScopedDesignStyleValidationAuthority,
  type GarmentScopedDesignStyleValidationResult,
} from "./garmentScopedDesignStyleAssignment";
import {
  hydrateDesignStyleDraftEnvelope,
  type DesignStyleDraftHydrationResult,
  type PersistedDesignStyleDraftV2,
} from "./designStyleDraftPersistence";
import type { PhysicalGarmentOccurrence } from "./designSourceState";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./physicalGarmentOccurrenceIdentity";
import {
  applyDesignStyleUploadOperation,
  beginDesignStyleUploadOperation,
  type ApplyDesignStyleUploadOperationResult,
  type BeginDesignStyleUploadOperationResult,
  type DesignStyleUploadOperationKind,
  type DesignStyleUploadOperationState,
  type DesignStyleUploadOperationTicket,
} from "./designStyleUploadOperation";
import type { UploadedDesignStyleAssignmentInput } from "./garmentScopedDesignStyleAssignment";

export type DesignStyleStepOccurrenceStatus =
  | "complete"
  | "incomplete"
  | "awaiting_validation"
  | "needs_review"
  | "unavailable"
  | "upload_pending";

export type DesignStyleStepRuntimeStatus =
  | "hydrating"
  | "ready"
  | "loading"
  | "error"
  | "review"
  | "blocked";

export interface DesignStyleStepOccurrencePresentation {
  readonly target: GarmentDesignStyleAssignmentTarget;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly label: string;
  readonly status: DesignStyleStepOccurrenceStatus;
  readonly assignment: GarmentDesignStyleAssignmentV2 | null;
  readonly assignmentLabel: string | null;
}

export interface DesignStyleStepProjection {
  readonly runtimeStatus: DesignStyleStepRuntimeStatus;
  readonly occurrences: readonly DesignStyleStepOccurrencePresentation[];
  readonly validation: GarmentScopedDesignStyleValidationResult | null;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly isComplete: boolean;
  readonly reviewMessage: string | null;
}

export interface DesignStyleStepCatalogMutationRequest {
  readonly runtimeGeneration: number;
  readonly expectedLedgerRevision: number;
  readonly target: GarmentDesignStyleAssignmentTarget;
  readonly styleId: string;
  readonly sourceKey: string;
  readonly eligibilityFingerprint: string;
  readonly adaptabilityConfirmationFingerprint?: string;
}

export interface DesignStyleStepClearMutationRequest {
  readonly runtimeGeneration: number;
  readonly expectedLedgerRevision: number;
  readonly target: GarmentDesignStyleAssignmentTarget;
}

export interface DesignStyleStepCatalogueEntry {
  readonly style: StyleCategory;
  readonly presentation: FutureDesignStyleMatchPresentation;
  readonly selected: boolean;
  readonly request: DesignStyleStepCatalogMutationRequest;
  readonly adaptationCopy: FutureDesignStyleAdaptationConfirmationCopy | null;
}

export type DesignStyleStepMutationRejection =
  | "STEP_NOT_ACTIVE"
  | "STALE_RUNTIME_GENERATION"
  | "STALE_ACTIVE_OCCURRENCE"
  | "HYDRATION_NOT_MUTABLE"
  | "CATALOGUE_NOT_READY"
  | "STYLE_AUTHORITY_CHANGED"
  | "STYLE_NOT_ELIGIBLE"
  | "ADAPTABILITY_CONFIRMATION_REQUIRED";

export type DesignStyleStepMutationResult =
  | GarmentDesignStyleAssignmentMutationResult
  | {
      readonly status: "rejected";
      readonly reason: DesignStyleStepMutationRejection;
      readonly ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    };

const targetsEqual = (
  left: GarmentDesignStyleAssignmentTarget | null,
  right: GarmentDesignStyleAssignmentTarget | null,
): boolean =>
  Boolean(
    left &&
      right &&
      left.garmentKey === right.garmentKey &&
      left.occurrenceToken === right.occurrenceToken,
  );

const targetForOccurrence = (
  occurrence: PhysicalGarmentOccurrence,
): GarmentDesignStyleAssignmentTarget | null => {
  if (
    !Number.isSafeInteger(occurrence.occurrenceGeneration) ||
    Number(occurrence.occurrenceGeneration) <= 0
  ) {
    return null;
  }
  return {
    garmentKey: occurrence.garmentKey,
    occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
      garmentKey: occurrence.garmentKey,
      generation: occurrence.occurrenceGeneration!,
    }),
  };
};

const statusFor = (
  status: GarmentDesignStyleOccurrenceValidationStatus | undefined,
  assignment: GarmentDesignStyleAssignmentV2 | null,
): DesignStyleStepOccurrenceStatus => {
  if (status === "valid") return "complete";
  if (status === "unassigned") return "incomplete";
  if (status === "unavailable") return "unavailable";
  if (status === "awaiting_validation") {
    return assignment?.sourceKind === "uploaded"
      ? "upload_pending"
      : "awaiting_validation";
  }
  return "needs_review";
};

const runtimeStatusFor = ({
  hydration,
  authority,
  validation,
}: {
  hydration: DesignStyleDraftHydrationResult | null;
  authority: GarmentScopedDesignStyleValidationAuthority;
  validation: GarmentScopedDesignStyleValidationResult | null;
}): DesignStyleStepRuntimeStatus => {
  if (!hydration) return "hydrating";
  if (
    hydration.destructiveNormalizationProhibited ||
    !hydration.ledger ||
    !hydration.envelope
  ) {
    return "blocked";
  }
  if (authority.catalogueState === "loading") return "loading";
  if (authority.catalogueState === "error") return "error";
  if (hydration.migrationEvidence || hydration.reviewRequired) return "review";
  return validation ? "ready" : "blocked";
};

const assignmentLabelFor = (
  assignment: GarmentDesignStyleAssignmentV2 | null,
  stylesById: ReadonlyMap<string, StyleCategory>,
): string | null => {
  if (!assignment) return null;
  if (assignment.sourceKind === "uploaded") return "Uploaded design";
  return stylesById.get(assignment.catalogStyleId)?.name ||
    "Previously selected catalogue design";
};

const reviewMessageFor = (
  hydration: DesignStyleDraftHydrationResult | null,
): string | null => {
  if (!hydration) return null;
  if (hydration.status === "malformed-v2") {
    return "Your saved Design Style choices need support before they can be changed safely.";
  }
  if (hydration.status === "unsupported-v2") {
    return "This saved Design Style version is not supported here yet.";
  }
  if (hydration.destructiveNormalizationProhibited) {
    return "Your saved Design Style choices need review. Nothing has been overwritten.";
  }
  if (hydration.migrationEvidence?.sourceKind === "catalog") {
    return "A previous catalogue design choice could not be assigned safely. Choose a design for each garment.";
  }
  if (hydration.migrationEvidence?.sourceKind === "uploaded") {
    return "A previous uploaded design choice could not be assigned safely. Review each garment before continuing.";
  }
  return null;
};

export const projectDesignStyleStep = ({
  activeOccurrences,
  hydration,
  authority,
  styles,
}: {
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  hydration: DesignStyleDraftHydrationResult | null;
  authority: GarmentScopedDesignStyleValidationAuthority;
  styles: readonly StyleCategory[];
}): DesignStyleStepProjection => {
  const ledger = hydration?.ledger || null;
  const validation = ledger
    ? validateGarmentScopedDesignStyleAssignmentLedger({
        ledger,
        activeOccurrences,
        authority,
      })
    : null;
  const stylesById = new Map(
    styles
      .filter(isAuthoritativeDesignStyleProjection)
      .map((style) => [style.id, style] as const),
  );
  const seenByType = new Map<CanonicalPhysicalGarmentType, number>();
  let occurrenceAuthorityInvalid = false;
  const occurrences = activeOccurrences.flatMap((occurrence) => {
    const target = targetForOccurrence(occurrence);
    if (!target) {
      occurrenceAuthorityInvalid = true;
      return [];
    }
    const count = (seenByType.get(occurrence.garmentType) || 0) + 1;
    seenByType.set(occurrence.garmentType, count);
    const assignment =
      validation?.occurrencesByGarmentKey[occurrence.garmentKey]?.assignment ||
      null;
    return [
      {
        target,
        garmentType: occurrence.garmentType,
        label: `${getFabricGarmentLabel(occurrence.garmentType)}${
          count === 1 ? "" : ` ${count}`
        }`,
        status: statusFor(
          validation?.occurrencesByGarmentKey[occurrence.garmentKey]?.status,
          assignment,
        ),
        assignment,
        assignmentLabel: assignmentLabelFor(assignment, stylesById),
      },
    ];
  });
  const runtimeStatus = occurrenceAuthorityInvalid
    ? "blocked"
    : runtimeStatusFor({ hydration, authority, validation });
  const isComplete = Boolean(
    runtimeStatus === "ready" &&
      !hydration?.migrationEvidence &&
      validation?.isComplete,
  );
  return {
    runtimeStatus,
    occurrences,
    validation,
    completedCount: validation?.validOccurrenceTokens.length || 0,
    totalCount: activeOccurrences.length,
    isComplete,
    reviewMessage: reviewMessageFor(hydration),
  };
};

const requiresAction = (
  occurrence: DesignStyleStepOccurrencePresentation,
): boolean => occurrence.status !== "complete";

export const resolveActiveDesignStyleOccurrence = ({
  occurrences,
  current,
  previousOrder = [],
}: {
  occurrences: readonly DesignStyleStepOccurrencePresentation[];
  current: GarmentDesignStyleAssignmentTarget | null;
  previousOrder?: readonly GarmentDesignStyleAssignmentTarget[];
}): GarmentDesignStyleAssignmentTarget | null => {
  if (occurrences.length === 0) return null;
  const surviving = occurrences.find((item) => targetsEqual(item.target, current));
  if (surviving) return surviving.target;
  if (!current) {
    return (occurrences.find(requiresAction) || occurrences[0]).target;
  }
  const previousIndex = previousOrder.findIndex((item) =>
    targetsEqual(item, current),
  );
  const anchor = previousIndex >= 0 ? previousIndex : 0;
  const nearest = (items: readonly DesignStyleStepOccurrencePresentation[]) =>
    [...items].sort((left, right) => {
      const leftIndex = occurrences.indexOf(left);
      const rightIndex = occurrences.indexOf(right);
      return (
        Math.abs(leftIndex - anchor) - Math.abs(rightIndex - anchor) ||
        leftIndex - rightIndex
      );
    })[0];
  return nearest(occurrences.filter(requiresAction))?.target ||
    nearest(occurrences)?.target ||
    null;
};

const referenceCompositionLabel = (
  style: StyleCategory,
): string => {
  const metadata = getDesignStyleAuthorityMetadata(style);
  if (metadata?.referenceComposition.status === "known") {
    return metadata.referenceComposition.garmentTypes
      .map(getFabricGarmentLabel)
      .join(" + ");
  }
  return style.garmentComposition?.trim() || "Reference composition unavailable";
};

const presentationForEligibility = ({
  style,
  garmentType,
  eligibility,
}: {
  style: StyleCategory;
  garmentType: CanonicalPhysicalGarmentType;
  eligibility: Exclude<
    GarmentScopedDesignStyleValidationAuthority["catalogStylesById"][string]["occurrenceEligibilityByToken"][string],
    undefined
  >;
}): {
  presentation: FutureDesignStyleMatchPresentation;
  adaptationCopy: FutureDesignStyleAdaptationConfirmationCopy | null;
} => {
  const garmentLabel = getFabricGarmentLabel(garmentType);
  const originalCompositionLabel = referenceCompositionLabel(style);
  const adaptable = eligibility.status === "adaptable";
  return {
    presentation: {
      tier: adaptable ? "adaptable" : "exact_match",
      selectable: true,
      requiresAdaptationConfirmation: adaptable,
      originalCompositionLabel,
      selectedGarmentLabels: [garmentLabel],
      customerReason: adaptable
        ? `This design can be adapted for ${garmentLabel}.`
        : `Designed for ${garmentLabel}.`,
    },
    adaptationCopy: adaptable
      ? {
          title: "Adapt this design to your garment?",
          body: `This design is shown as ${originalCompositionLabel}, but it can be adapted for ${garmentLabel}. Your garment and Fabric selection will not change.`,
        }
      : null,
  };
};

export const projectActiveOccurrenceDesignStyleCatalogue = ({
  projection,
  activeTarget,
  styles,
  authority,
  runtimeGeneration,
}: {
  projection: DesignStyleStepProjection;
  activeTarget: GarmentDesignStyleAssignmentTarget | null;
  styles: readonly StyleCategory[];
  authority: GarmentScopedDesignStyleValidationAuthority;
  runtimeGeneration: number;
}): readonly DesignStyleStepCatalogueEntry[] => {
  if (
    authority.catalogueState !== "ready" ||
    !activeTarget ||
    !projection.validation
  ) {
    return [];
  }
  const activeOccurrence = projection.occurrences.find((item) =>
    targetsEqual(item.target, activeTarget),
  );
  if (!activeOccurrence) return [];
  const selectedAssignment = activeOccurrence.assignment;
  return styles.flatMap((style) => {
    if (!isAuthoritativeDesignStyleProjection(style)) return [];
    const metadata = getDesignStyleAuthorityMetadata(style);
    const facts = authority.catalogStylesById[style.id];
    const eligibility =
      facts?.occurrenceEligibilityByToken[activeTarget.occurrenceToken];
    if (
      !metadata ||
      !facts ||
      facts.availability !== "available" ||
      facts.sourceKey !== metadata.sourceKey ||
      facts.eligibilityFingerprint !== metadata.eligibilityFingerprint ||
      !eligibility ||
      eligibility.status === "incompatible"
    ) {
      return [];
    }
    const { presentation, adaptationCopy } = presentationForEligibility({
      style,
      garmentType: activeOccurrence.garmentType,
      eligibility,
    });
    const adaptabilityConfirmationFingerprint =
      eligibility.status === "adaptable"
        ? eligibility.requiredConfirmationFingerprint
        : undefined;
    return [
      {
        style,
        presentation,
        selected: Boolean(
          selectedAssignment?.sourceKind === "catalog" &&
            selectedAssignment.occurrenceToken === activeTarget.occurrenceToken &&
            selectedAssignment.catalogStyleId === style.id,
        ),
        request: {
          runtimeGeneration,
          expectedLedgerRevision: -1,
          target: activeTarget,
          styleId: style.id,
          sourceKey: facts.sourceKey,
          eligibilityFingerprint: facts.eligibilityFingerprint,
          ...(adaptabilityConfirmationFingerprint
            ? { adaptabilityConfirmationFingerprint }
            : {}),
        },
        adaptationCopy,
      },
    ];
  });
};

export const bindDesignStyleStepCatalogueLedgerRevision = ({
  entries,
  ledgerRevision,
}: {
  entries: readonly DesignStyleStepCatalogueEntry[];
  ledgerRevision: number;
}): readonly DesignStyleStepCatalogueEntry[] =>
  entries.map((entry) => ({
    ...entry,
    request: { ...entry.request, expectedLedgerRevision: ledgerRevision },
  }));

const reject = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  reason: DesignStyleStepMutationRejection,
): DesignStyleStepMutationResult => ({ status: "rejected", reason, ledger });

export const assignCatalogueStyleThroughStepRuntime = ({
  ledger,
  activeOccurrences,
  activeTarget,
  authority,
  request,
  currentRuntimeGeneration,
  stepIsActive,
  hydrationMutable,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  activeTarget: GarmentDesignStyleAssignmentTarget | null;
  authority: GarmentScopedDesignStyleValidationAuthority;
  request: DesignStyleStepCatalogMutationRequest;
  currentRuntimeGeneration: number;
  stepIsActive: boolean;
  hydrationMutable: boolean;
}): DesignStyleStepMutationResult => {
  if (!stepIsActive) return reject(ledger, "STEP_NOT_ACTIVE");
  if (request.runtimeGeneration !== currentRuntimeGeneration) {
    return reject(ledger, "STALE_RUNTIME_GENERATION");
  }
  if (!targetsEqual(request.target, activeTarget)) {
    return reject(ledger, "STALE_ACTIVE_OCCURRENCE");
  }
  if (!hydrationMutable) return reject(ledger, "HYDRATION_NOT_MUTABLE");
  if (authority.catalogueState !== "ready") {
    return reject(ledger, "CATALOGUE_NOT_READY");
  }
  const facts = authority.catalogStylesById[request.styleId];
  if (
    !facts ||
    facts.availability !== "available" ||
    facts.styleId !== request.styleId ||
    facts.sourceKey !== request.sourceKey ||
    facts.eligibilityFingerprint !== request.eligibilityFingerprint
  ) {
    return reject(ledger, "STYLE_AUTHORITY_CHANGED");
  }
  const eligibility =
    facts.occurrenceEligibilityByToken[request.target.occurrenceToken];
  if (!eligibility || eligibility.status === "incompatible") {
    return reject(ledger, "STYLE_NOT_ELIGIBLE");
  }
  if (
    eligibility.status === "adaptable" &&
    eligibility.requiredConfirmationFingerprint !==
      request.adaptabilityConfirmationFingerprint
  ) {
    return reject(ledger, "ADAPTABILITY_CONFIRMATION_REQUIRED");
  }
  if (
    eligibility.status === "eligible" &&
    request.adaptabilityConfirmationFingerprint !== undefined
  ) {
    return reject(ledger, "STYLE_AUTHORITY_CHANGED");
  }
  return assignCatalogDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: request.expectedLedgerRevision,
    activeOccurrences,
    target: request.target,
    source: {
      sourceKey: request.sourceKey,
      catalogStyleId: request.styleId,
      eligibilityFingerprint: request.eligibilityFingerprint,
      ...(request.adaptabilityConfirmationFingerprint
        ? {
            adaptabilityConfirmationFingerprint:
              request.adaptabilityConfirmationFingerprint,
          }
        : {}),
    },
  });
};

export const clearCatalogueStyleThroughStepRuntime = ({
  ledger,
  activeOccurrences,
  activeTarget,
  request,
  currentRuntimeGeneration,
  stepIsActive,
  hydrationMutable,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  activeTarget: GarmentDesignStyleAssignmentTarget | null;
  request: DesignStyleStepClearMutationRequest;
  currentRuntimeGeneration: number;
  stepIsActive: boolean;
  hydrationMutable: boolean;
}): DesignStyleStepMutationResult => {
  if (!stepIsActive) return reject(ledger, "STEP_NOT_ACTIVE");
  if (request.runtimeGeneration !== currentRuntimeGeneration) {
    return reject(ledger, "STALE_RUNTIME_GENERATION");
  }
  if (!targetsEqual(request.target, activeTarget)) {
    return reject(ledger, "STALE_ACTIVE_OCCURRENCE");
  }
  if (!hydrationMutable) return reject(ledger, "HYDRATION_NOT_MUTABLE");
  return clearGarmentDesignStyleAssignment({
    ledger,
    expectedLedgerRevision: request.expectedLedgerRevision,
    activeOccurrences,
    target: request.target,
  });
};

export const applyDesignStyleStepLedgerToHydration = ({
  hydration,
  ledger,
  activeOccurrences,
  authority,
}: {
  hydration: DesignStyleDraftHydrationResult;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  authority: GarmentScopedDesignStyleValidationAuthority;
}): DesignStyleDraftHydrationResult => {
  const { unresolvedLegacyScalar: _ignored, ...resolvedAuthority } = authority;
  const explicitValidation = validateGarmentScopedDesignStyleAssignmentLedger({
    ledger,
    activeOccurrences,
    authority: resolvedAuthority,
  });
  const migration = explicitValidation.isComplete
    ? null
    : hydration.migrationEvidence;
  const envelope: PersistedDesignStyleDraftV2 = {
    schemaVersion: 2,
    ledger,
    ...(migration ? { migration } : {}),
  };
  return hydrateDesignStyleDraftEnvelope({
    envelope,
    activeOccurrences,
    authority: resolvedAuthority,
    legacyScalarFingerprint: hydration.legacyScalarFingerprint,
  });
};

export const designStyleStepTargetsEqual = targetsEqual;

export const beginDesignStyleUploadForActiveOccurrence = ({
  state,
  ledger,
  activeOccurrences,
  activeTarget,
  operationKind,
}: {
  state: DesignStyleUploadOperationState;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  activeTarget: GarmentDesignStyleAssignmentTarget;
  operationKind: DesignStyleUploadOperationKind;
}): BeginDesignStyleUploadOperationResult =>
  beginDesignStyleUploadOperation({
    state,
    ledger,
    activeOccurrences,
    target: activeTarget,
    operationKind,
  });

export const applyDesignStyleUploadForActiveOccurrence = ({
  state,
  ticket,
  ledger,
  activeOccurrences,
  activeTarget,
  operationKind,
  source,
}: {
  state: DesignStyleUploadOperationState;
  ticket: DesignStyleUploadOperationTicket;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
  activeOccurrences: readonly PhysicalGarmentOccurrence[];
  activeTarget: GarmentDesignStyleAssignmentTarget;
  operationKind: DesignStyleUploadOperationKind;
  source: UploadedDesignStyleAssignmentInput;
}): ApplyDesignStyleUploadOperationResult =>
  applyDesignStyleUploadOperation({
    state,
    ticket,
    ledger,
    activeOccurrences,
    callbackTarget: activeTarget,
    callbackOperationKind: operationKind,
    source,
  });
