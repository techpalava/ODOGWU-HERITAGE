import type { DesignStudioStageId, GuestDesignDraft } from "../types";
import {
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION,
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
} from "./designSourceJourney";
import { validateDesignStyleDraftFieldForStorage } from "./designStyleDraftPersistence";

export const GUEST_ORDER_SESSION_STORAGE_NAMESPACE =
  "odogwu_guest_order_session_v1";
export const LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE = `${GUEST_ORDER_SESSION_STORAGE_NAMESPACE}.designDraft`;
export const FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE =
  "odogwu_design_studio_future_draft_v1";
export const FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE =
  "odogwu_design_studio_future_draft_migration_v1";
export const FUTURE_DESIGN_STUDIO_DRAFT_CLOUD_SYNC_NAMESPACE =
  "odogwu_design_studio_future_draft_cloud_sync_v1";
export const FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION = 1 as const;
export const FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_VERSION = 1 as const;

const FUTURE_STAGE_IDS = new Set<DesignStudioStageId>(
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION.map((stage) => stage.id),
);

export interface DesignStudioDraftStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LegacyDesignStudioDraftAdapter {
  load(): GuestDesignDraft | null;
  /**
   * A read-only legacy inspection is optional for older callers. It lets the
   * homepage decide whether to offer replacement without migrating anything.
   */
  inspect?(): LegacyFutureDesignDraftInspectionResult;
}

export interface FutureDesignStudioDraftEnvelopeV1 {
  storageVersion: 1;
  journeyMode: "future_nine_stage";
  draft: GuestDesignDraft;
}

export type FutureDraftMigrationJournalResultCode =
  | "migrated"
  | "not_migrated_no_source"
  | "not_migrated_ambiguous_source"
  | "not_migrated_malformed_source"
  | "not_migrated_invalid_destination"
  | "cleared";

export interface FutureDraftMigrationJournalV1 {
  schemaVersion: 1;
  sourceNamespace: typeof LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE;
  sourceVersion: string;
  destinationNamespace: typeof FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE;
  destinationVersion: 1;
  resultCode: FutureDraftMigrationJournalResultCode;
  completedAt: string;
}

export interface FutureDraftCloudSyncJournalV1 {
  schemaVersion: 1;
  ownerUid: string;
  cloudRevision: number;
  synchronizedAt: string;
}

export type FutureDesignStudioDraftLoadResult =
  | { status: "empty"; draft: null }
  | { status: "loaded"; draft: GuestDesignDraft }
  | { status: "invalid"; draft: null; reason: string };

export type LegacyFutureDesignDraftInspectionResult =
  | { status: "empty" }
  | { status: "valid"; draft: GuestDesignDraft; fingerprint: string }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

/**
 * This is deliberately separate from the normal loader. `valid` says what is
 * currently stored, while callers choose whether an intentional resume should
 * subsequently migrate legacy storage.
 */
export type FutureDesignStudioDraftInspectionResult =
  | { status: "empty" }
  | {
      status: "valid";
      draft: GuestDesignDraft;
      source: "future_v1" | "legacy";
      fingerprint: string;
    }
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string };

export type FutureDesignStudioDraftSaveResult =
  | { status: "saved"; draft: GuestDesignDraft }
  | { status: "rejected"; draft: null; reason: string };

export type HistoricalFutureDraftMigrationResultCode =
  | "existing_future"
  | "migrated"
  | "not_migrated_no_source"
  | "not_migrated_ambiguous_source"
  | "not_migrated_malformed_source"
  | "not_migrated_invalid_destination"
  | "not_migrated_already_processed";

export interface HistoricalFutureDraftMigrationResult {
  status: "migrated" | "existing" | "not_migrated";
  resultCode: HistoricalFutureDraftMigrationResultCode;
  draft: GuestDesignDraft | null;
  wroteDestination: boolean;
}

interface FutureDesignStudioDraftRepositoryDependencies {
  storage: DesignStudioDraftStorageAdapter;
  legacy: LegacyDesignStudioDraftAdapter;
  normalizeDraft: (draft: GuestDesignDraft) => GuestDesignDraft;
  legacySourceVersion: string;
  now?: () => string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const hasAuthoritativeFutureDraftMarker = (
  value: unknown,
): value is GuestDesignDraft & {
  journeySchemaVersion: number;
  currentStageId: DesignStudioStageId;
} =>
  isRecord(value) &&
  value.journeySchemaVersion === DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION &&
  typeof value.currentStageId === "string" &&
  FUTURE_STAGE_IDS.has(value.currentStageId as DesignStudioStageId);

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

// The raw serialized value is kept only in the in-memory pending decision. It
// gives a guest destructive action an exact, collision-free storage handle.
const fingerprintRawStorageValue = (value: string): string => value;

const normalizeJsonSafeFutureDraft = ({
  value,
  normalizeDraft,
}: {
  value: unknown;
  normalizeDraft: (draft: GuestDesignDraft) => GuestDesignDraft;
}): { draft: GuestDesignDraft | null; reason: string | null } => {
  if (!hasAuthoritativeFutureDraftMarker(value)) {
    return { draft: null, reason: "missing_authoritative_future_marker" };
  }
  try {
    const jsonInput = JSON.parse(JSON.stringify(value)) as GuestDesignDraft;
    const normalized = normalizeDraft(jsonInput);
    if (!hasAuthoritativeFutureDraftMarker(normalized)) {
      return { draft: null, reason: "normalizer_removed_future_marker" };
    }
    return {
      draft: JSON.parse(JSON.stringify(normalized)) as GuestDesignDraft,
      reason: null,
    };
  } catch {
    return { draft: null, reason: "future_draft_normalization_failed" };
  }
};

const isMigrationJournal = (
  value: unknown,
): value is FutureDraftMigrationJournalV1 =>
  isRecord(value) &&
  value.schemaVersion === FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_VERSION &&
  value.sourceNamespace === LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE &&
  typeof value.sourceVersion === "string" &&
  value.destinationNamespace === FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE &&
  value.destinationVersion === FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION &&
  typeof value.resultCode === "string" &&
  [
    "migrated",
    "not_migrated_no_source",
    "not_migrated_ambiguous_source",
    "not_migrated_malformed_source",
    "not_migrated_invalid_destination",
    "cleared",
  ].includes(value.resultCode) &&
  typeof value.completedAt === "string";

export const createDesignStudioDraftRepository = ({
  storage,
  legacy,
  normalizeDraft,
  legacySourceVersion,
  now = () => new Date().toISOString(),
}: FutureDesignStudioDraftRepositoryDependencies) => {
  const loadLegacyDraft = (): GuestDesignDraft | null => legacy.load();

  const inspectLegacyDraft = (): LegacyFutureDesignDraftInspectionResult => {
    if (legacy.inspect) return legacy.inspect();
    try {
      const draft = loadLegacyDraft();
      if (draft === null) return { status: "empty" };
      if (!isRecord(draft)) {
        return { status: "invalid", reason: "invalid_legacy_future_draft" };
      }
      return {
        status: "valid",
        draft,
        fingerprint: fingerprintRawStorageValue(JSON.stringify(draft)),
      };
    } catch {
      return { status: "unavailable", reason: "legacy_draft_read_failed" };
    }
  };

  const readMigrationResult = (): FutureDraftMigrationJournalV1 | null => {
    const raw = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE);
    if (!raw) return null;
    const parsed = parseJson(raw);
    return isMigrationJournal(parsed) ? parsed : null;
  };

  const writeMigrationResult = (
    resultCode: FutureDraftMigrationJournalResultCode,
  ): FutureDraftMigrationJournalV1 => {
    const current = readMigrationResult();
    if (current?.resultCode === resultCode) return current;
    const journal: FutureDraftMigrationJournalV1 = {
      schemaVersion: FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_VERSION,
      sourceNamespace: LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE,
      sourceVersion: legacySourceVersion,
      destinationNamespace: FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
      destinationVersion: FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION,
      resultCode,
      completedAt: now(),
    };
    storage.setItem(
      FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE,
      JSON.stringify(journal),
    );
    return journal;
  };

  const readCloudSyncResult = (): FutureDraftCloudSyncJournalV1 | null => {
    const raw = storage.getItem(
      FUTURE_DESIGN_STUDIO_DRAFT_CLOUD_SYNC_NAMESPACE,
    );
    if (!raw) return null;
    const parsed = parseJson(raw);
    return isRecord(parsed) &&
      parsed.schemaVersion === 1 &&
      typeof parsed.ownerUid === "string" &&
      parsed.ownerUid.length > 0 &&
      Number.isSafeInteger(parsed.cloudRevision) &&
      (parsed.cloudRevision as number) > 0 &&
      typeof parsed.synchronizedAt === "string"
      ? (parsed as unknown as FutureDraftCloudSyncJournalV1)
      : null;
  };

  const recordCloudSynchronization = ({
    ownerUid,
    cloudRevision,
  }: {
    ownerUid: string;
    cloudRevision: number;
  }): FutureDraftCloudSyncJournalV1 | null => {
    if (
      !ownerUid ||
      !Number.isSafeInteger(cloudRevision) ||
      cloudRevision < 1
    ) {
      return null;
    }
    const journal: FutureDraftCloudSyncJournalV1 = {
      schemaVersion: 1,
      ownerUid,
      cloudRevision,
      synchronizedAt: now(),
    };
    storage.setItem(
      FUTURE_DESIGN_STUDIO_DRAFT_CLOUD_SYNC_NAMESPACE,
      JSON.stringify(journal),
    );
    return journal;
  };

  const clearFutureDraftAfterCloudSynchronization = (): boolean => {
    if (!readCloudSyncResult()) return false;
    storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
    return true;
  };

  const loadFutureDraftV1 = (): FutureDesignStudioDraftLoadResult => {
    // A clear marker is a committed tombstone. It takes precedence over an
    // orphaned payload when removal failed after the marker was persisted, so
    // an old draft can never rehydrate after a completed clear transition.
    if (readMigrationResult()?.resultCode === "cleared") {
      return { status: "empty", draft: null };
    }
    const raw = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
    if (raw === null) return { status: "empty", draft: null };
    const parsed = parseJson(raw);
    if (
      !isRecord(parsed) ||
      parsed.storageVersion !== FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION ||
      parsed.journeyMode !== "future_nine_stage" ||
      !("draft" in parsed)
    ) {
      return {
        status: "invalid",
        draft: null,
        reason: "invalid_future_draft_envelope",
      };
    }
    const normalized = normalizeJsonSafeFutureDraft({
      value: parsed.draft,
      normalizeDraft,
    });
    return normalized.draft
      ? { status: "loaded", draft: normalized.draft }
      : {
          status: "invalid",
          draft: null,
          reason: normalized.reason || "invalid_future_draft",
        };
  };

  /**
   * Reads enough state to classify a homepage entry, but never creates the
   * V1 destination, records a migration journal, or deletes a legacy source.
   */
  const inspectFutureDraftForHomepage =
    (): FutureDesignStudioDraftInspectionResult => {
      try {
        // Keep preflight aligned with Studio hydration: a committed clear
        // marker wins even if physical removal of an old payload failed.
        if (readMigrationResult()?.resultCode === "cleared") {
          return { status: "empty" };
        }
        const raw = storage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
        if (raw !== null) {
          const loaded = loadFutureDraftV1();
          if (loaded.status === "invalid") {
            return { status: "invalid", reason: loaded.reason };
          }
          if (loaded.status === "loaded") {
            return {
              status: "valid",
              draft: loaded.draft,
              source: "future_v1",
              fingerprint: fingerprintRawStorageValue(raw),
            };
          }
          return { status: "invalid", reason: "future_draft_disappeared_during_read" };
        }

        // A migrated journal is authoritative when the destination is absent:
        // do not re-enter an obsolete legacy snapshot.
        const journal = readMigrationResult();
        if (journal?.resultCode === "migrated") {
          return { status: "empty" };
        }

        const legacyInspection = inspectLegacyDraft();
        if (legacyInspection.status !== "valid") return legacyInspection;
        const normalized = normalizeJsonSafeFutureDraft({
          value: legacyInspection.draft,
          normalizeDraft,
        });
        return normalized.draft
          ? {
              status: "valid",
              draft: normalized.draft,
              source: "legacy",
              fingerprint: legacyInspection.fingerprint,
            }
          : {
              status: "invalid",
              reason: normalized.reason || "invalid_legacy_future_draft",
            };
      } catch {
        return { status: "unavailable", reason: "future_draft_storage_read_failed" };
      }
    };

  const saveFutureDraftV1 = (
    draft: GuestDesignDraft,
  ): FutureDesignStudioDraftSaveResult => {
    const designStyleDraftValidation =
      validateDesignStyleDraftFieldForStorage(draft);
    if (designStyleDraftValidation.status === "invalid") {
      return {
        status: "rejected",
        draft: null,
        reason: designStyleDraftValidation.reason,
      };
    }
    const normalized = normalizeJsonSafeFutureDraft({
      value: draft,
      normalizeDraft,
    });
    if (!normalized.draft) {
      return {
        status: "rejected",
        draft: null,
        reason: normalized.reason || "invalid_future_draft",
      };
    }
    const normalizedDesignStyleDraftValidation =
      validateDesignStyleDraftFieldForStorage(normalized.draft);
    if (normalizedDesignStyleDraftValidation.status === "invalid") {
      return {
        status: "rejected",
        draft: null,
        reason: normalizedDesignStyleDraftValidation.reason,
      };
    }
    const envelope: FutureDesignStudioDraftEnvelopeV1 = {
      storageVersion: FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION,
      journeyMode: "future_nine_stage",
      draft: normalized.draft,
    };
    storage.setItem(
      FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
      JSON.stringify(envelope),
    );
    // A new successful save supersedes a prior committed clear. Remove that
    // tombstone only after its replacement payload is durable; removing it
    // first could make an old payload visible again if this write failed.
    if (readMigrationResult()?.resultCode === "cleared") {
      storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE);
    }
    return { status: "saved", draft: normalized.draft };
  };

  const clearFutureDraftV1 = (): void => {
    // The marker is the durable destructive decision. Persist it before
    // removing the only payload: if this write fails, the draft is still
    // completely recoverable; if payload removal fails afterwards, readers
    // deterministically honor the committed tombstone.
    writeMigrationResult("cleared");
    storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
  };

  const migrateHistoricalFutureDraft =
    (): HistoricalFutureDraftMigrationResult => {
      const destination = loadFutureDraftV1();
      const journal = readMigrationResult();
      if (destination.status === "loaded") {
        return journal?.resultCode === "migrated"
          ? {
              status: "migrated",
              resultCode: "migrated",
              draft: destination.draft,
              wroteDestination: false,
            }
          : {
              status: "existing",
              resultCode: "existing_future",
              draft: destination.draft,
              wroteDestination: false,
            };
      }
      if (destination.status === "invalid") {
        writeMigrationResult("not_migrated_invalid_destination");
        return {
          status: "not_migrated",
          resultCode: "not_migrated_invalid_destination",
          draft: null,
          wroteDestination: false,
        };
      }
      if (
        journal?.resultCode === "migrated" ||
        journal?.resultCode === "cleared"
      ) {
        return {
          status: "not_migrated",
          resultCode: "not_migrated_already_processed",
          draft: null,
          wroteDestination: false,
        };
      }

      const source = loadLegacyDraft();
      if (source === null) {
        writeMigrationResult("not_migrated_no_source");
        return {
          status: "not_migrated",
          resultCode: "not_migrated_no_source",
          draft: null,
          wroteDestination: false,
        };
      }
      if (!isRecord(source)) {
        writeMigrationResult("not_migrated_malformed_source");
        return {
          status: "not_migrated",
          resultCode: "not_migrated_malformed_source",
          draft: null,
          wroteDestination: false,
        };
      }
      if (!hasAuthoritativeFutureDraftMarker(source)) {
        writeMigrationResult("not_migrated_ambiguous_source");
        return {
          status: "not_migrated",
          resultCode: "not_migrated_ambiguous_source",
          draft: null,
          wroteDestination: false,
        };
      }

      const saved = saveFutureDraftV1(source);
      if (saved.status === "rejected") {
        writeMigrationResult("not_migrated_malformed_source");
        return {
          status: "not_migrated",
          resultCode: "not_migrated_malformed_source",
          draft: null,
          wroteDestination: false,
        };
      }
      writeMigrationResult("migrated");
      return {
        status: "migrated",
        resultCode: "migrated",
        draft: saved.draft,
        wroteDestination: true,
      };
    };

  const loadFutureDraftWithMigration =
    (): FutureDesignStudioDraftLoadResult => {
      const loaded = loadFutureDraftV1();
      if (loaded.status !== "empty") return loaded;
      const migration = migrateHistoricalFutureDraft();
      return migration.draft
        ? { status: "loaded", draft: migration.draft }
        : { status: "empty", draft: null };
    };

  return {
    loadFutureDraftV1,
    inspectFutureDraftForHomepage,
    loadFutureDraftWithMigration,
    saveFutureDraftV1,
    clearFutureDraftV1,
    migrateHistoricalFutureDraft,
    readMigrationResult,
    readCloudSyncResult,
    recordCloudSynchronization,
    clearFutureDraftAfterCloudSynchronization,
  };
};

export type DesignStudioDraftRepository = ReturnType<
  typeof createDesignStudioDraftRepository
>;
