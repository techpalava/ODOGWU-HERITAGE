import type { DesignStudioStageId, GuestDesignDraft } from "../types";
import {
  DESIGN_STUDIO_NINE_STAGE_FOUNDATION,
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
} from "./designSourceJourney";

export const GUEST_ORDER_SESSION_STORAGE_NAMESPACE =
  "odogwu_guest_order_session_v1";
export const LEGACY_DESIGN_STUDIO_DRAFT_NAMESPACE =
  `${GUEST_ORDER_SESSION_STORAGE_NAMESPACE}.designDraft`;
export const FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE =
  "odogwu_design_studio_future_draft_v1";
export const FUTURE_DESIGN_STUDIO_DRAFT_MIGRATION_NAMESPACE =
  "odogwu_design_studio_future_draft_migration_v1";
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
  save(draft: GuestDesignDraft): void;
  clear(): void;
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

export type FutureDesignStudioDraftLoadResult =
  | { status: "empty"; draft: null }
  | { status: "loaded"; draft: GuestDesignDraft }
  | { status: "invalid"; draft: null; reason: string };

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

  const saveLegacyDraft = (draft: GuestDesignDraft): void => legacy.save(draft);

  const clearLegacyDraft = (): void => legacy.clear();

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

  const loadFutureDraftV1 = (): FutureDesignStudioDraftLoadResult => {
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

  const saveFutureDraftV1 = (
    draft: GuestDesignDraft,
  ): FutureDesignStudioDraftSaveResult => {
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
    const envelope: FutureDesignStudioDraftEnvelopeV1 = {
      storageVersion: FUTURE_DESIGN_STUDIO_DRAFT_STORAGE_VERSION,
      journeyMode: "future_nine_stage",
      draft: normalized.draft,
    };
    storage.setItem(
      FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
      JSON.stringify(envelope),
    );
    return { status: "saved", draft: normalized.draft };
  };

  const clearFutureDraftV1 = (): void => {
    storage.removeItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE);
    writeMigrationResult("cleared");
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

  const loadFutureDraftWithMigration = (): FutureDesignStudioDraftLoadResult => {
    const loaded = loadFutureDraftV1();
    if (loaded.status !== "empty") return loaded;
    const migration = migrateHistoricalFutureDraft();
    return migration.draft
      ? { status: "loaded", draft: migration.draft }
      : { status: "empty", draft: null };
  };

  return {
    loadLegacyDraft,
    saveLegacyDraft,
    clearLegacyDraft,
    loadFutureDraftV1,
    loadFutureDraftWithMigration,
    saveFutureDraftV1,
    clearFutureDraftV1,
    migrateHistoricalFutureDraft,
    readMigrationResult,
  };
};

export type DesignStudioDraftRepository = ReturnType<
  typeof createDesignStudioDraftRepository
>;
