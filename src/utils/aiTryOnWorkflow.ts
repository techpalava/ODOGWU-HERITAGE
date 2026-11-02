import type {
  AiTryOnFailureCode,
  AiTryOnResumableJobReference,
  AiTryOnVerifiedPrivateResultReference,
  AiTryOnWorkflowStateV1,
  FabricAllocation,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
} from "../types.js";
import type { PhysicalGarmentOccurrence } from "./designSourceState.js";
import type { GarmentScopedCustomDetailsCompletionResult } from "./garmentScopedCustomDetailsDomain.js";
import {
  fitHintsFingerprintIdentity,
  type AiTryOnFitHint,
} from "./aiTryOnFitHints.js";
import {
  AI_TRY_ON_PROMPT_VERSION,
  type AiTryOnGenerationRequest,
} from "./aiTryOnGatewayContract.js";
import { DESIGN_STUDIO_STAGE_IDS } from "./designSourceJourney.js";
import {
  orderDetailsFingerprintIdentity,
  type AiTryOnOrderDetails,
} from "./aiTryOnOrderDetails.js";

export const AI_TRY_ON_WORKFLOW_SCHEMA_VERSION = 1 as const;

const FAILURE_CODES = new Set<AiTryOnFailureCode>([
  "interrupted",
  "provider_unavailable",
  "provider_rejected",
  "processing_failed",
]);
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const UNSAFE_REFERENCE_PATTERN = /^(?:https?:|blob:|data:)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isOpaqueReference = (value: unknown): value is string =>
  typeof value === "string" &&
  OPAQUE_REFERENCE_PATTERN.test(value) &&
  !UNSAFE_REFERENCE_PATTERN.test(value);

const normalizeJobReference = (
  value: unknown,
): AiTryOnResumableJobReference | null =>
  isRecord(value) &&
  value.kind === "resumable_job" &&
  isOpaqueReference(value.jobId)
    ? { kind: "resumable_job", jobId: value.jobId }
    : null;

export const normalizeVerifiedAiTryOnResultReference = (
  value: unknown,
): AiTryOnVerifiedPrivateResultReference | null =>
  isRecord(value) &&
  value.kind === "verified_private_try_on_result" &&
  isOpaqueReference(value.assetId) &&
  isOpaqueReference(value.ownerBindingId)
    ? {
        kind: "verified_private_try_on_result",
        assetId: value.assetId,
        ownerBindingId: value.ownerBindingId,
      }
    : null;

export const createEmptyAiTryOnWorkflowState = (): AiTryOnWorkflowStateV1 => ({
  schemaVersion: AI_TRY_ON_WORKFLOW_SCHEMA_VERSION,
  status: "not_started",
  inputFingerprint: null,
});

const normalizeFailure = (
  value: unknown,
): AiTryOnWorkflowStateV1["failure"] => {
  if (!isRecord(value) || typeof value.retryable !== "boolean") return undefined;
  const code =
    typeof value.code === "string" &&
    FAILURE_CODES.has(value.code as AiTryOnFailureCode)
      ? (value.code as AiTryOnFailureCode)
      : "processing_failed";
  return { code, retryable: value.retryable };
};

export const normalizeAiTryOnWorkflowState = (
  value: unknown,
): AiTryOnWorkflowStateV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  const statuses = new Set([
    "not_started",
    "awaiting_input",
    "ready",
    "processing",
    "completed",
    "failed",
    "skipped",
    "stale",
    "unavailable",
  ]);
  if (typeof value.status !== "string" || !statuses.has(value.status)) {
    return null;
  }
  const rawInputFingerprint = value.inputFingerprint;
  const inputFingerprint: string | null =
    rawInputFingerprint === null
      ? null
      : isOpaqueReference(rawInputFingerprint)
        ? rawInputFingerprint
        : null;
  const jobReference = normalizeJobReference(value.jobReference);
  const resultReference = normalizeVerifiedAiTryOnResultReference(
    value.resultReference,
  );
  const failure = normalizeFailure(value.failure);

  if (value.status === "processing" && !jobReference) {
    return {
      schemaVersion: 1,
      status: "failed",
      inputFingerprint,
      failure: { code: "interrupted", retryable: true },
    };
  }
  if (value.status === "completed" && (!inputFingerprint || !resultReference)) {
    return null;
  }
  if (value.status === "failed" && !failure) return null;

  return {
    schemaVersion: 1,
    status: value.status as AiTryOnWorkflowStateV1["status"],
    inputFingerprint,
    ...(jobReference ? { jobReference } : {}),
    ...(resultReference ? { resultReference } : {}),
    ...(failure ? { failure } : {}),
  };
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const hashVisualIdentity = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let first = 2166136261;
  let second = 2246822507;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `tryon-v1-${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>>
    0
  )
    .toString(16)
    .padStart(8, "0")}`;
};

/**
 * Visual design identity for one garment. Taken from that garment's
 * occurrence assignment, never from the legacy scalar design source.
 */
export interface AiTryOnGarmentDesignIdentity {
  readonly garmentKey: string;
  readonly sourceKind: "catalog" | "uploaded";
  readonly sourceKey: string;
  readonly catalogStyleId?: string;
  readonly uploadedSourceRef?: string;
}

export interface AiTryOnOccurrenceDesignSource {
  readonly garmentKey: string;
  readonly assignment: {
    readonly garmentKey: string;
    readonly sourceKind: string;
    readonly sourceKey: string;
    readonly catalogStyleId?: string;
    readonly uploadedSourceRef?: string;
  } | null;
}

/**
 * Returns one design identity per garment.
 * Returns null when there are no garments or any garment has no assignment.
 */
export const resolveAiTryOnGarmentDesigns = (
  occurrences: readonly AiTryOnOccurrenceDesignSource[],
): readonly AiTryOnGarmentDesignIdentity[] | null => {
  if (occurrences.length === 0) return null;
  const designs: AiTryOnGarmentDesignIdentity[] = [];
  for (const occurrence of occurrences) {
    const assignment = occurrence.assignment;
    if (
      !assignment ||
      assignment.garmentKey !== occurrence.garmentKey ||
      (assignment.sourceKind !== "catalog" &&
        assignment.sourceKind !== "uploaded") ||
      assignment.sourceKey.trim().length === 0
    ) {
      return null;
    }
    designs.push({
      garmentKey: assignment.garmentKey,
      sourceKind: assignment.sourceKind,
      sourceKey: assignment.sourceKey,
      ...(assignment.sourceKind === "catalog" && assignment.catalogStyleId
        ? { catalogStyleId: assignment.catalogStyleId }
        : {}),
      ...(assignment.sourceKind === "uploaded" && assignment.uploadedSourceRef
        ? { uploadedSourceRef: assignment.uploadedSourceRef }
        : {}),
    });
  }
  return designs;
};

export interface AiTryOnVisualInput {
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  fabricAllocations: readonly FabricAllocation[];
  selectedStyleId: string;
  /**
   * Per-garment design identity. When present, this replaces selectedStyleId
   * in the fingerprint so an empty legacy design source cannot change it.
   */
  garmentDesigns?: readonly AiTryOnGarmentDesignIdentity[];
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
  customerPhotoAssetIdentity?: {
    assetId: string;
    ownerBindingId: string;
  } | null;
  personalizedInputRevision?: string | null;
  /**
   * Tier-1 measurement fit hints sent to the prompt. Included in the
   * fingerprint only when non-empty, so orders without measurements keep
   * their existing fingerprint.
   */
  measurementFitHints?: readonly AiTryOnFitHint[] | null;
  /** Visible order details sent to the prompt; any change marks the result stale. */
  orderDetails?: AiTryOnOrderDetails | null;
}

/**
 * Fit hints may only change the Try-on fingerprint when Measurement comes
 * before AI Try-on in the journey (PR #1181). While Try-on comes first,
 * folding later measurements in would turn a finished Try-on stale and lock
 * Measurement again, so the hints still reach the prompt but not the
 * fingerprint.
 */
export const AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT =
  DESIGN_STUDIO_STAGE_IDS.indexOf("measurement") <
  DESIGN_STUDIO_STAGE_IDS.indexOf("try_on");

/** Builds identity only from stable visual semantics, never labels, prices, URLs, or raw text. */
export const createAiTryOnVisualInputFingerprint = (
  input: AiTryOnVisualInput,
): string => {
  const construction = input.garmentTypeSelection.garmentTypes
    .map((garmentType) => {
      const resolution =
        input.garmentTypeSelection.constructionByGarment[garmentType];
      return {
        garmentType,
        status: resolution?.status || "missing",
        components:
          resolution?.status === "resolved"
            ? resolution.components
                .map((component) => ({
                  selectionGroup: component.selectionGroup,
                  optionId: component.optionId,
                }))
                .sort((left, right) =>
                  `${left.selectionGroup}:${left.optionId}`.localeCompare(
                    `${right.selectionGroup}:${right.optionId}`,
                  ),
                )
            : [],
      };
    })
    .sort((left, right) => left.garmentType.localeCompare(right.garmentType));
  const allocations = input.fabricAllocations
    .map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garments: allocation.garmentAssignments
        .map((assignment) => ({
          garmentKey: assignment.garmentKey,
          garmentType: assignment.garmentType,
          lowerGarmentType: assignment.lowerGarmentType || null,
        }))
        .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey)),
    }))
    .sort((left, right) =>
      stableSerialize(left).localeCompare(stableSerialize(right)),
    );
  const detailSelections = Object.entries(
    input.garmentScopedCustomDetails?.selectionsByGarmentKey || {},
  )
    .map(([garmentKey, selections]) => ({
      garmentKey,
      selections: Object.entries(selections || {})
        .map(([selectionGroup, selection]) => ({
          selectionGroup,
          optionIds: (Array.isArray(selection) ? selection : [selection])
            .filter((optionId): optionId is string => typeof optionId === "string")
            .sort(),
        }))
        .sort((left, right) =>
          left.selectionGroup.localeCompare(right.selectionGroup),
        ),
    }))
    .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey));
  const privatePhoto = input.customerPhotoAssetIdentity;
  const garmentDesigns = input.garmentDesigns?.length
    ? [...input.garmentDesigns]
        .map((design) => ({
          garmentKey: design.garmentKey,
          sourceKind: design.sourceKind,
          sourceKey: design.sourceKey,
          catalogStyleId:
            design.sourceKind === "catalog" ? design.catalogStyleId || null : null,
          uploadedSourceRef:
            design.sourceKind === "uploaded"
              ? design.uploadedSourceRef || null
              : null,
        }))
        .sort(
          (left, right) =>
            left.garmentKey.localeCompare(right.garmentKey) ||
            left.sourceKey.localeCompare(right.sourceKey),
        )
    : null;
  const occurrenceIdentities = input.physicalOccurrences
    ? input.physicalOccurrences
        .map((occurrence) => ({
          garmentKey: occurrence.garmentKey,
          generation: occurrence.occurrenceGeneration ?? null,
        }))
        .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey))
    : Object.entries(
        input.garmentTypeSelection.physicalOccurrenceIdentityState
          ?.activeGenerationByGarmentKey || {},
      )
        .map(([garmentKey, generation]) => ({ garmentKey, generation }))
        .sort((left, right) => left.garmentKey.localeCompare(right.garmentKey));

  const measurementFitHints = fitHintsFingerprintIdentity(
    input.measurementFitHints,
  );

  return hashVisualIdentity({
    demographic: input.garmentTypeSelection.demographic,
    garmentTypes: [...input.garmentTypeSelection.garmentTypes].sort(),
    construction,
    allocations,
    ...(garmentDesigns
      ? { garmentDesigns }
      : { selectedStyleId: input.selectedStyleId }),
    occurrenceIdentities,
    detailSelections,
    personalizedInputRevision: input.personalizedInputRevision || null,
    ...(measurementFitHints ? { measurementFitHints } : {}),
    promptVersion: AI_TRY_ON_PROMPT_VERSION,
    orderDetails: orderDetailsFingerprintIdentity(input.orderDetails),
    customerPhotoAssetIdentity:
      privatePhoto &&
      isOpaqueReference(privatePhoto.assetId) &&
      isOpaqueReference(privatePhoto.ownerBindingId)
        ? {
            assetId: privatePhoto.assetId,
            ownerBindingId: privatePhoto.ownerBindingId,
          }
        : null,
  });
};

/**
 * Fingerprint for Step 6 from each garment's occurrence assignment.
 * A null result means a garment design is missing or an earlier stage is not ready.
 * The legacy scalar design source is intentionally not an input.
 */
export const createAiTryOnFingerprintFromOccurrenceAssignments = ({
  customDetailsReady,
  designSourceReady,
  occurrences,
  visualInput,
}: {
  customDetailsReady: boolean;
  designSourceReady: boolean;
  occurrences: readonly AiTryOnOccurrenceDesignSource[];
  visualInput: Omit<AiTryOnVisualInput, "selectedStyleId" | "garmentDesigns">;
}): string | null => {
  const garmentDesigns = resolveAiTryOnGarmentDesigns(occurrences);
  if (!customDetailsReady || !designSourceReady || !garmentDesigns) return null;
  return createAiTryOnVisualInputFingerprint({
    ...visualInput,
    selectedStyleId: garmentDesigns.map((design) => design.sourceKey).join("|"),
    garmentDesigns,
  });
};

export const isFutureCustomDetailsContentReady = (
  completion: GarmentScopedCustomDetailsCompletionResult | null | undefined,
): boolean =>
  completion?.status === "complete" || completion?.status === "pricing_pending";

export interface AiTryOnReconciliationPolicy {
  gatewayAvailable: boolean;
  skipAllowed: boolean;
}

export const reconcileAiTryOnWorkflow = ({
  state,
  currentInputFingerprint,
  policy,
}: {
  state: AiTryOnWorkflowStateV1 | null | undefined;
  currentInputFingerprint: string | null;
  policy: AiTryOnReconciliationPolicy;
}): AiTryOnWorkflowStateV1 => {
  const normalized =
    normalizeAiTryOnWorkflowState(state) || createEmptyAiTryOnWorkflowState();

  if (normalized.status === "skipped" && policy.skipAllowed) return normalized;
  if (!currentInputFingerprint) {
    return {
      schemaVersion: 1,
      status: "awaiting_input",
      inputFingerprint: null,
    };
  }
  if (
    normalized.status === "completed" &&
    normalized.inputFingerprint !== currentInputFingerprint
  ) {
    return { ...normalized, status: "stale" };
  }
  if (
    normalized.status === "processing" &&
    normalized.inputFingerprint !== currentInputFingerprint
  ) {
    return {
      schemaVersion: 1,
      status: "stale",
      inputFingerprint: normalized.inputFingerprint,
    };
  }
  if (
    normalized.status === "completed" ||
    normalized.status === "processing" ||
    normalized.status === "stale" ||
    (normalized.status === "failed" &&
      normalized.inputFingerprint === currentInputFingerprint)
  ) {
    return normalized;
  }
  return {
    schemaVersion: 1,
    status: policy.gatewayAvailable ? "ready" : "unavailable",
    inputFingerprint: currentInputFingerprint,
  };
};

export type AiTryOnWorkflowEvent =
  | { type: "start"; jobReference: AiTryOnResumableJobReference }
  | { type: "complete"; resultReference: AiTryOnVerifiedPrivateResultReference }
  | { type: "fail"; code: unknown; retryable: boolean }
  | { type: "retry" }
  | { type: "skip" };

export type AiTryOnTransitionResult =
  | { ok: true; state: AiTryOnWorkflowStateV1 }
  | {
      ok: false;
      error: {
        code: "invalid_transition" | "invalid_job_reference" | "invalid_result_reference" | "skip_not_allowed";
      };
    };

export interface AiTryOnWorkflowAllowedActions {
  canRetry: boolean;
  canSkip: boolean;
}

/** Keeps customer controls aligned with the workflow transitions. */
export const getAiTryOnWorkflowAllowedActions = ({
  state,
  skipAllowed,
}: {
  state: AiTryOnWorkflowStateV1;
  skipAllowed: boolean;
}): AiTryOnWorkflowAllowedActions => {
  const current = normalizeAiTryOnWorkflowState(state);
  if (!current) return { canRetry: false, canSkip: false };

  return {
    canRetry:
      current.status === "failed" && Boolean(current.failure?.retryable),
    canSkip:
      skipAllowed &&
      !["processing", "completed", "skipped"].includes(current.status),
  };
};

export const transitionAiTryOnWorkflow = ({
  state,
  event,
  skipAllowed,
}: {
  state: AiTryOnWorkflowStateV1;
  event: AiTryOnWorkflowEvent;
  skipAllowed: boolean;
}): AiTryOnTransitionResult => {
  const current = normalizeAiTryOnWorkflowState(state);
  if (!current) {
    return { ok: false, error: { code: "invalid_transition" } };
  }
  const allowedActions = getAiTryOnWorkflowAllowedActions({
    state: current,
    skipAllowed,
  });
  if (event.type === "skip") {
    if (!skipAllowed) return { ok: false, error: { code: "skip_not_allowed" } };
    if (!allowedActions.canSkip) {
      return { ok: false, error: { code: "invalid_transition" } };
    }
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        status: "skipped",
        inputFingerprint: current.inputFingerprint,
        ...(current.resultReference
          ? { resultReference: current.resultReference }
          : {}),
      },
    };
  }
  if (event.type === "start") {
    if (
      current.status !== "ready" &&
      !(current.status === "failed" && current.failure?.retryable)
    ) {
      return { ok: false, error: { code: "invalid_transition" } };
    }
    const jobReference = normalizeJobReference(event.jobReference);
    if (!jobReference) {
      return { ok: false, error: { code: "invalid_job_reference" } };
    }
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        status: "processing",
        inputFingerprint: current.inputFingerprint,
        jobReference,
      },
    };
  }
  if (event.type === "complete") {
    if (current.status !== "processing") {
      return { ok: false, error: { code: "invalid_transition" } };
    }
    const resultReference = normalizeVerifiedAiTryOnResultReference(
      event.resultReference,
    );
    if (!resultReference) {
      return { ok: false, error: { code: "invalid_result_reference" } };
    }
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        status: "completed",
        inputFingerprint: current.inputFingerprint,
        resultReference,
      },
    };
  }
  if (event.type === "fail") {
    if (current.status !== "processing") {
      return { ok: false, error: { code: "invalid_transition" } };
    }
    const code =
      typeof event.code === "string" &&
      FAILURE_CODES.has(event.code as AiTryOnFailureCode)
        ? (event.code as AiTryOnFailureCode)
        : "processing_failed";
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        status: "failed",
        inputFingerprint: current.inputFingerprint,
        failure: { code, retryable: event.retryable },
      },
    };
  }
  if (
    event.type === "retry" &&
    allowedActions.canRetry
  ) {
    return {
      ok: true,
      state: {
        schemaVersion: 1,
        status: "ready",
        inputFingerprint: current.inputFingerprint,
      },
    };
  }
  return { ok: false, error: { code: "invalid_transition" } };
};

export type AiTryOnGatewayAvailability =
  | { status: "available" }
  | { status: "unavailable"; code: "not_configured" };

export type AiTryOnGatewayJobResult =
  | { status: "processing"; jobReference: AiTryOnResumableJobReference }
  | {
      status: "completed";
      resultReference: AiTryOnVerifiedPrivateResultReference;
      /**
       * Inline preview from the server. Kept in memory only: it is never
       * persisted to the draft (normalize refuses data: URLs) until private
       * storage lands in Step 6.
       */
      preview?: { mimeType: string; data: string };
      orderTriesRemaining?: number;
    }
  | { status: "failed"; code: AiTryOnFailureCode; retryable: boolean }
  | { status: "unavailable"; code: "not_configured" };

export interface AiTryOnGateway {
  getAvailability(): Promise<AiTryOnGatewayAvailability>;
  /** `request` carries the photos and fit hints for a real generation. */
  start(
    inputFingerprint: string,
    request?: AiTryOnGenerationRequest,
  ): Promise<AiTryOnGatewayJobResult>;
  resume(jobReference: AiTryOnResumableJobReference): Promise<AiTryOnGatewayJobResult>;
  cancel?(jobReference: AiTryOnResumableJobReference): Promise<void>;
}

export const createUnavailableAiTryOnGateway = (): AiTryOnGateway => ({
  getAvailability: async () => ({ status: "unavailable", code: "not_configured" }),
  start: async () => ({ status: "unavailable", code: "not_configured" }),
  resume: async () => ({ status: "unavailable", code: "not_configured" }),
});

/**
 * Records a wearer's finished preview on the order-level workflow, which
 * gates Measurement. Generation itself is tracked per wearer in the Try-on
 * step; the order workflow only ever stores the opaque result reference
 * (never the image). A stale, failed, unavailable or skipped order workflow
 * restarts at the current fingerprint, so a fresh preview always completes
 * it. Returns the unchanged state when the reference is not valid or the
 * design is not ready.
 */
export const recordAiTryOnPreviewCompletion = ({
  state,
  currentInputFingerprint,
  resultReference,
  jobId,
}: {
  state: AiTryOnWorkflowStateV1;
  currentInputFingerprint: string | null;
  resultReference: AiTryOnVerifiedPrivateResultReference;
  jobId: string;
}): AiTryOnWorkflowStateV1 => {
  if (!currentInputFingerprint) return state;
  const ready: AiTryOnWorkflowStateV1 = {
    schemaVersion: 1,
    status: "ready",
    inputFingerprint: currentInputFingerprint,
  };
  const started = transitionAiTryOnWorkflow({
    state: ready,
    event: { type: "start", jobReference: { kind: "resumable_job", jobId } },
    skipAllowed: true,
  });
  if (!started.ok) return state;
  const completed = transitionAiTryOnWorkflow({
    state: started.state,
    event: { type: "complete", resultReference },
    skipAllowed: true,
  });
  return completed.ok ? completed.state : state;
};
