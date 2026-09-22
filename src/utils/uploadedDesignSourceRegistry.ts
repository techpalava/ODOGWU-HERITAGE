import type {
  CustomerDesignUploadReference,
  UploadedDesignSource,
} from "../types";
import { isCustomerDesignDraftStoragePath } from "../services/customerDesignUploadReference";
import {
  cloneDesignSource,
  isValidUploadedDesignDraftSource,
} from "./designSourceState";
import type { GarmentScopedDesignStyleAssignmentLedgerV2 } from "./garmentScopedDesignStyleAssignment";

export const UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD =
  "uploadedDesignSourceRegistry" as const;
export const UPLOADED_DESIGN_SOURCE_REGISTRY_SCHEMA_VERSION = 1 as const;

export interface PersistedUploadedDesignSourceRegistryV1 {
  readonly schemaVersion: 1;
  readonly sourcesByUploadedSourceRef: Readonly<
    Record<string, UploadedDesignSource>
  >;
}

export type UploadedDesignSourceRegistryParseResult =
  | { readonly status: "absent" }
  | {
      readonly status: "valid";
      readonly registry: PersistedUploadedDesignSourceRegistryV1;
    }
  | {
      readonly status: "malformed";
      readonly reason: string;
      readonly recovered: PersistedUploadedDesignSourceRegistryV1 | null;
    };

export interface UploadedDesignRestoreRequestIdentity {
  readonly draftIdentityKey: string;
  readonly identityGeneration: number;
  readonly occurrenceToken: string;
  readonly uploadedSourceRef: string;
}

export type UploadedDesignDraftAccessProofResult =
  | { readonly status: "proved"; readonly blob: Blob }
  | {
      readonly status: "unavailable";
      readonly reason: "MISSING_OWNER" | "WRONG_OWNER" | "READ_FAILED";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const isSafeIdentifier = (value: unknown, maxLength = 1024): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maxLength &&
  value.trim() === value &&
  value !== "__proto__" &&
  value !== "constructor" &&
  value !== "prototype" &&
  !/[\u0000-\u001f\u007f]/.test(value);

const isOpaqueSourceReference = (value: unknown): value is string =>
  isSafeIdentifier(value, 256) && !/[\\/]/.test(value);

const containsForbiddenPersistedString = (value: unknown): boolean => {
  if (typeof value === "string") {
    return /^(?:data:image|blob:)/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenPersistedString);
  }
  if (!isRecord(value)) return false;
  return Object.values(value).some(containsForbiddenPersistedString);
};

export const isExactPersistedUploadedDesignSourceShape = (
  value: unknown,
): value is UploadedDesignSource => {
  if (!isRecord(value) || !isValidUploadedDesignDraftSource(value)) return false;
  if (containsForbiddenPersistedString(value)) return false;
  if (
    !hasExactKeys(value, [
      "kind",
      "sourceKey",
      "uploadReference",
      "fabricCapacityComposition",
      "demographic",
      "displayLabel",
    ]) ||
    !isRecord(value.uploadReference) ||
    !hasExactKeys(
      value.uploadReference,
      ["designReferenceId", "ownerUid", "storagePath", "mimeType", "createdAt"],
      ["originalFileName"],
    ) ||
    !Array.isArray(value.fabricCapacityComposition)
  ) {
    return false;
  }
  if (
    value.kind !== "uploaded" ||
    !isOpaqueSourceReference(value.uploadReference.designReferenceId) ||
    value.sourceKey !== `uploaded:${value.uploadReference.designReferenceId}` ||
    !isCustomerDesignDraftStoragePath(value.uploadReference)
  ) {
    return false;
  }
  return value.fabricCapacityComposition.every(
    (spec) =>
      isRecord(spec) &&
      hasExactKeys(spec, ["key", "garmentType", "fabricUnits"], ["lowerGarmentType"]),
  );
};

const cloneUploadedDesignSource = (
  source: UploadedDesignSource,
): UploadedDesignSource | null => {
  const cloned = cloneDesignSource(source);
  return cloned?.kind === "uploaded" &&
    isExactPersistedUploadedDesignSourceShape(cloned)
    ? cloned
    : null;
};

const parseRegistryEntry = (
  uploadedSourceRef: string,
  value: unknown,
): UploadedDesignSource | null => {
  if (!isOpaqueSourceReference(uploadedSourceRef)) return null;
  if (!isExactPersistedUploadedDesignSourceShape(value)) return null;
  if (value.uploadReference.designReferenceId !== uploadedSourceRef) return null;
  if (value.sourceKey !== `uploaded:${uploadedSourceRef}`) return null;
  return cloneUploadedDesignSource(value);
};

const registryFromSources = (
  sourcesByUploadedSourceRef: Readonly<Record<string, UploadedDesignSource>>,
): PersistedUploadedDesignSourceRegistryV1 => ({
  schemaVersion: UPLOADED_DESIGN_SOURCE_REGISTRY_SCHEMA_VERSION,
  sourcesByUploadedSourceRef,
});

const parseSourcesMap = (
  value: unknown,
): {
  readonly sources: Record<string, UploadedDesignSource>;
  readonly malformedEntry: boolean;
} => {
  if (!isRecord(value) || Array.isArray(value)) {
    return { sources: {}, malformedEntry: true };
  }
  const sources: Record<string, UploadedDesignSource> = {};
  let malformedEntry = false;
  for (const [uploadedSourceRef, entry] of Object.entries(value)) {
    const parsed = parseRegistryEntry(uploadedSourceRef, entry);
    if (!parsed) {
      malformedEntry = true;
      continue;
    }
    sources[uploadedSourceRef] = parsed;
  }
  return { sources, malformedEntry };
};

export const createEmptyUploadedDesignSourceRegistry =
  (): PersistedUploadedDesignSourceRegistryV1 =>
    registryFromSources({});

export const parseUploadedDesignSourceRegistry = (
  value: unknown,
): UploadedDesignSourceRegistryParseResult => {
  if (value === undefined) return { status: "absent" };
  if (!isRecord(value)) {
    return {
      status: "malformed",
      reason: "INVALID_UPLOADED_DESIGN_SOURCE_REGISTRY_SHAPE",
      recovered: null,
    };
  }
  const extraFields = !hasExactKeys(value, [
    "schemaVersion",
    "sourcesByUploadedSourceRef",
  ]);
  const unsupportedVersion =
    value.schemaVersion !== UPLOADED_DESIGN_SOURCE_REGISTRY_SCHEMA_VERSION;
  const parsedSources = parseSourcesMap(value.sourcesByUploadedSourceRef);
  const recovered =
    Object.keys(parsedSources.sources).length > 0
      ? registryFromSources(parsedSources.sources)
      : createEmptyUploadedDesignSourceRegistry();
  if (extraFields) {
    return {
      status: "malformed",
      reason: "UNSUPPORTED_UPLOADED_DESIGN_SOURCE_REGISTRY_FIELDS",
      recovered,
    };
  }
  if (unsupportedVersion) {
    return {
      status: "malformed",
      reason: "UNSUPPORTED_UPLOADED_DESIGN_SOURCE_REGISTRY_VERSION",
      recovered,
    };
  }
  if (parsedSources.malformedEntry) {
    return {
      status: "malformed",
      reason: "MALFORMED_UPLOADED_DESIGN_SOURCE_ENTRY",
      recovered,
    };
  }
  return { status: "valid", registry: recovered };
};

export const inspectUploadedDesignSourceRegistry = (
  rawDraft: unknown,
): UploadedDesignSourceRegistryParseResult => {
  if (
    !isRecord(rawDraft) ||
    !hasOwn(rawDraft, UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD)
  ) {
    return { status: "absent" };
  }
  return parseUploadedDesignSourceRegistry(
    rawDraft[UPLOADED_DESIGN_SOURCE_REGISTRY_FIELD],
  );
};

export const serializeUploadedDesignSourceRegistry = (
  registry: PersistedUploadedDesignSourceRegistryV1,
): PersistedUploadedDesignSourceRegistryV1 | null => {
  const parsed = parseUploadedDesignSourceRegistry(registry);
  return parsed.status === "valid" ? parsed.registry : null;
};

export const collectReferencedUploadedSourceRefsFromLedger = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null | undefined,
): readonly string[] => {
  if (!ledger) return [];
  const refs = new Set<string>();
  for (const assignment of Object.values(ledger.assignmentsByGarmentKey)) {
    if (assignment.sourceKind === "uploaded") {
      refs.add(assignment.uploadedSourceRef);
    }
  }
  return [...refs].sort((left, right) => left.localeCompare(right));
};

export const upsertUploadedDesignSources = (
  registry: PersistedUploadedDesignSourceRegistryV1,
  sources: readonly UploadedDesignSource[],
): PersistedUploadedDesignSourceRegistryV1 => {
  const next: Record<string, UploadedDesignSource> = {
    ...registry.sourcesByUploadedSourceRef,
  };
  for (const source of sources) {
    if (!isExactPersistedUploadedDesignSourceShape(source)) continue;
    const cloned = cloneUploadedDesignSource(source);
    if (!cloned) continue;
    next[cloned.uploadReference.designReferenceId] = cloned;
  }
  return registryFromSources(next);
};

export const pruneUploadedDesignSourceRegistry = (
  registry: PersistedUploadedDesignSourceRegistryV1,
  referencedUploadedSourceRefs: readonly string[],
): PersistedUploadedDesignSourceRegistryV1 => {
  const referenced = new Set(referencedUploadedSourceRefs);
  const next: Record<string, UploadedDesignSource> = {};
  for (const [uploadedSourceRef, source] of Object.entries(
    registry.sourcesByUploadedSourceRef,
  )) {
    if (!referenced.has(uploadedSourceRef)) continue;
    const cloned = cloneUploadedDesignSource(source);
    if (cloned) next[uploadedSourceRef] = cloned;
  }
  return registryFromSources(next);
};

export const matchingScalarUploadedDesignSource = ({
  designSource,
  referencedUploadedSourceRefs,
}: {
  designSource: unknown;
  referencedUploadedSourceRefs: readonly string[];
}): UploadedDesignSource | null => {
  if (!isExactPersistedUploadedDesignSourceShape(designSource)) return null;
  const uploadedSourceRef = designSource.uploadReference.designReferenceId;
  if (!referencedUploadedSourceRefs.includes(uploadedSourceRef)) return null;
  return cloneUploadedDesignSource(designSource);
};

export const restoreUploadedDesignSourcesFromDraft = ({
  rawDraft,
  ledger,
}: {
  rawDraft: unknown;
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null | undefined;
}): {
  readonly registryParse: UploadedDesignSourceRegistryParseResult;
  readonly referencedUploadedSourceRefs: readonly string[];
  readonly sourcesByUploadedSourceRef: Readonly<
    Record<string, UploadedDesignSource>
  >;
} => {
  const registryParse = inspectUploadedDesignSourceRegistry(rawDraft);
  const referencedUploadedSourceRefs =
    collectReferencedUploadedSourceRefsFromLedger(ledger);
  const sourcesByUploadedSourceRef: Record<string, UploadedDesignSource> = {};
  const recovered =
    registryParse.status === "valid"
      ? registryParse.registry
      : registryParse.status === "malformed"
        ? registryParse.recovered
        : null;
  if (recovered) {
    Object.assign(sourcesByUploadedSourceRef, recovered.sourcesByUploadedSourceRef);
  }
  const scalar = matchingScalarUploadedDesignSource({
    designSource: isRecord(rawDraft) ? rawDraft.designSource : undefined,
    referencedUploadedSourceRefs,
  });
  if (scalar && !sourcesByUploadedSourceRef[scalar.uploadReference.designReferenceId]) {
    sourcesByUploadedSourceRef[scalar.uploadReference.designReferenceId] = scalar;
  }
  return {
    registryParse,
    referencedUploadedSourceRefs,
    sourcesByUploadedSourceRef,
  };
};

export const deriveUploadedDesignSourcesByGarmentKey = ({
  ledger,
  sourcesByUploadedSourceRef,
}: {
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2 | null | undefined;
  sourcesByUploadedSourceRef: Readonly<Record<string, UploadedDesignSource>>;
}): Readonly<Record<string, UploadedDesignSource>> => {
  if (!ledger) return {};
  const next: Record<string, UploadedDesignSource> = {};
  for (const [garmentKey, assignment] of Object.entries(
    ledger.assignmentsByGarmentKey,
  )) {
    if (assignment.sourceKind !== "uploaded") continue;
    const source = sourcesByUploadedSourceRef[assignment.uploadedSourceRef];
    if (source) next[garmentKey] = source;
  }
  return next;
};

export const serializeUploadedDesignSourcesForDraft = ({
  existingRegistryField,
  uploadedDesignSources,
  referencedUploadedSourceRefs,
}: {
  existingRegistryField: unknown;
  uploadedDesignSources: readonly UploadedDesignSource[];
  referencedUploadedSourceRefs: readonly string[];
}):
  | { readonly status: "omit" }
  | {
      readonly status: "ready";
      readonly registry: PersistedUploadedDesignSourceRegistryV1;
    }
  | { readonly status: "blocked"; readonly reason: string } => {
  const parsed = parseUploadedDesignSourceRegistry(existingRegistryField);
  const base =
    parsed.status === "valid"
      ? parsed.registry
      : parsed.status === "malformed"
        ? parsed.recovered || createEmptyUploadedDesignSourceRegistry()
        : createEmptyUploadedDesignSourceRegistry();
  if (
    parsed.status === "malformed" &&
    Object.keys(base.sourcesByUploadedSourceRef).length === 0 &&
    uploadedDesignSources.length === 0
  ) {
    return {
      status: "blocked",
      reason: parsed.reason,
    };
  }
  const upserted = upsertUploadedDesignSources(base, uploadedDesignSources);
  const pruned = pruneUploadedDesignSourceRegistry(
    upserted,
    referencedUploadedSourceRefs,
  );
  const serialized = serializeUploadedDesignSourceRegistry(pruned);
  if (!serialized) {
    return {
      status: "blocked",
      reason: "MALFORMED_UPLOADED_DESIGN_SOURCE_REGISTRY",
    };
  }
  if (Object.keys(serialized.sourcesByUploadedSourceRef).length === 0) {
    return { status: "omit" };
  }
  return { status: "ready", registry: serialized };
};

export const isCurrentUploadedDesignRestoreRequest = ({
  request,
  current,
}: {
  request: UploadedDesignRestoreRequestIdentity;
  current: UploadedDesignRestoreRequestIdentity;
}): boolean =>
  request.draftIdentityKey === current.draftIdentityKey &&
  request.identityGeneration === current.identityGeneration &&
  request.occurrenceToken === current.occurrenceToken &&
  request.uploadedSourceRef === current.uploadedSourceRef;

export const bindUploadedDesignRestoreRequest = ({
  draftIdentityKey,
  identityGeneration,
  occurrenceToken,
  uploadedSourceRef,
}: UploadedDesignRestoreRequestIdentity): UploadedDesignRestoreRequestIdentity => ({
  draftIdentityKey,
  identityGeneration,
  occurrenceToken,
  uploadedSourceRef,
});

export const proveUploadedDesignDraftAccess = async ({
  source,
  expectedOwnerUid,
  readCustomerDesignDraft,
}: {
  source: UploadedDesignSource;
  expectedOwnerUid: string | null;
  readCustomerDesignDraft: (
    reference: CustomerDesignUploadReference,
  ) => Promise<Blob>;
}): Promise<UploadedDesignDraftAccessProofResult> => {
  if (!expectedOwnerUid) {
    return { status: "unavailable", reason: "MISSING_OWNER" };
  }
  if (source.uploadReference.ownerUid !== expectedOwnerUid) {
    return { status: "unavailable", reason: "WRONG_OWNER" };
  }
  try {
    const blob = await readCustomerDesignDraft(source.uploadReference);
    return { status: "proved", blob };
  } catch {
    return { status: "unavailable", reason: "READ_FAILED" };
  }
};
