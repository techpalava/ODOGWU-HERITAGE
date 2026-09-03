import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import type { StyleCategory } from "../types";
import {
  DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
  createLegacyDesignStyleMigrationDraft,
  parseAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
  projectPublishedDesignStyleSnapshot,
  type AuthoritativeDesignStyleRecordV1,
  type DesignStyleAdminProjection,
  type PublishedDesignStyleProjection,
} from "../utils/designStyleAuthority";
import {
  DesignStylePublicationError,
  isSupersededDesignStyleImageUnreferenced,
  publishDesignStyleWithDependencies,
  rejectDesignStyleHardDelete,
  type CurrentDesignStylePublicationAuthority,
  type PublishDesignStyleInput,
} from "../utils/designStylePublication";
import { db } from "./firebase";
import { ImageService } from "./imageService";

export interface AdminDesignStyleSnapshot {
  readonly styles: readonly DesignStyleAdminProjection[];
  readonly diagnostics: readonly {
    readonly documentId: string;
    readonly reason: string;
  }[];
}

const currentAuthorityFromSnapshot = (
  documentId: string,
  exists: boolean,
  data: unknown,
): CurrentDesignStylePublicationAuthority | null => {
  if (!exists) return null;
  const parsed = parseAuthoritativeDesignStyleRecord(documentId, data);
  if (parsed.status === "valid") {
    return {
      record: parsed.record,
      legacyMigrationAllowed: false,
      currentImage: parsed.record.presentation.image,
    };
  }
  const legacy = createLegacyDesignStyleMigrationDraft(documentId, data);
  return {
    record: null,
    legacyMigrationAllowed: legacy !== null,
    currentImage:
      typeof (data as { image?: unknown } | null)?.image === "string"
        ? String((data as { image: string }).image)
        : "",
  };
};

const readCurrent = async (
  styleId: string,
): Promise<CurrentDesignStylePublicationAuthority | null> => {
  const snapshot = await getDoc(doc(db, "styles", styleId));
  return currentAuthorityFromSnapshot(
    snapshot.id,
    snapshot.exists(),
    snapshot.exists() ? snapshot.data() : null,
  );
};

const commitAuthoritativeRecord = async ({
  record,
  expectedPublicRevision,
}: {
  record: AuthoritativeDesignStyleRecordV1;
  expectedPublicRevision: number;
}): Promise<void> => {
  const reference = doc(db, "styles", record.id);
  await runTransaction(db, async (transaction) => {
    const currentSnapshot = await transaction.get(reference);
    const current = currentAuthorityFromSnapshot(
      currentSnapshot.id,
      currentSnapshot.exists(),
      currentSnapshot.exists() ? currentSnapshot.data() : null,
    );
    if (current && !current.record && !current.legacyMigrationAllowed) {
      throw new DesignStylePublicationError(
        "CURRENT_RECORD_INVALID",
        "The current Design Style record cannot be migrated safely.",
      );
    }
    const currentRevision = current?.record?.publicRevision ?? 0;
    if (currentRevision !== expectedPublicRevision) {
      throw new DesignStylePublicationError(
        "STALE_PUBLIC_REVISION",
        `Expected Design Style revision ${expectedPublicRevision}, received ${currentRevision}.`,
      );
    }
    transaction.set(reference, record);
  });
};

const canDeleteSupersededImage = async ({
  styleId,
  imageUrl,
}: {
  styleId: string;
  imageUrl: string;
}): Promise<boolean> => {
  if (!imageUrl.includes("firebasestorage.googleapis.com")) return false;
  try {
    const [
      legacyOrderSnapshot,
      sourceOrderSnapshot,
      authoritativeStyleImageSnapshot,
      legacyStyleImageSnapshot,
    ] = await Promise.all([
      getDocs(
        query(
          collection(db, "orders"),
          where("style.id", "==", styleId),
          limit(1),
        ),
      ),
      getDocs(
        query(
          collection(db, "orders"),
          where("orderDesignSource.styleId", "==", styleId),
          limit(1),
        ),
      ),
      getDocs(
        query(
          collection(db, "styles"),
          where("presentation.image", "==", imageUrl),
          limit(2),
        ),
      ),
      getDocs(
        query(
          collection(db, "styles"),
          where("image", "==", imageUrl),
          limit(2),
        ),
      ),
    ]);
    return isSupersededDesignStyleImageUnreferenced({
      styleId,
      hasLegacyOrderReference: !legacyOrderSnapshot.empty,
      hasOrderDesignSourceReference: !sourceOrderSnapshot.empty,
      styleReferenceIds: [
        ...authoritativeStyleImageSnapshot.docs,
        ...legacyStyleImageSnapshot.docs,
      ].map((document) => document.id),
    });
  } catch {
    return false;
  }
};

const sortAdminStyles = (
  styles: readonly DesignStyleAdminProjection[],
): DesignStyleAdminProjection[] =>
  [...styles].sort((left, right) => {
    const order =
      left.designStyleAuthority.displayOrder -
      right.designStyleAuthority.displayOrder;
    return order || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });

const sortPublishedStyles = (
  styles: readonly PublishedDesignStyleProjection[],
): PublishedDesignStyleProjection[] =>
  [...styles].sort((left, right) => {
    const order =
      left.designStyleAuthority.displayOrder -
      right.designStyleAuthority.displayOrder;
    return order || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  });

export const DesignStyleAuthorityService = {
  publish: (input: PublishDesignStyleInput) =>
    publishDesignStyleWithDependencies(input, {
      readCurrent,
      uploadReplacementImage: (styleId, dataUrl) =>
        ImageService.uploadImageIfBase64(dataUrl, `styles/${styleId}`, {
          refId: styleId,
          authoritySchemaVersion: String(
            DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION,
          ),
        }),
      commitAuthoritativeRecord,
      canDeleteSupersededImage,
      deleteImage: ImageService.deleteImageFromStorage,
    }),

  hardDelete: rejectDesignStyleHardDelete,

  subscribeToPublished(
    callback: (styles: readonly StyleCategory[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const publishedQuery = query(
      collection(db, "styles"),
      where("schemaVersion", "==", DESIGN_STYLE_AUTHORITY_SCHEMA_VERSION),
      where("lifecycle", "==", "published"),
    );
    return onSnapshot(
      publishedQuery,
      (snapshot) => {
        const projected = projectPublishedDesignStyleSnapshot(
          snapshot.docs.map((document) => ({
            id: document.id,
            data: document.data(),
          })),
        );
        if (projected.status === "error") {
          onError(
            new Error(
              "The published Design Style catalogue contains an invalid record.",
            ),
          );
          return;
        }
        callback(sortPublishedStyles(projected.styles));
      },
      (error) => onError(error),
    );
  },

  subscribeToAdminRecords(
    callback: (snapshot: AdminDesignStyleSnapshot) => void,
    onError: (error: Error) => void,
  ): () => void {
    return onSnapshot(
      collection(db, "styles"),
      (snapshot) => {
        const styles: DesignStyleAdminProjection[] = [];
        const diagnostics: AdminDesignStyleSnapshot["diagnostics"][number][] = [];
        snapshot.docs.forEach((document) => {
          const parsed = parseAuthoritativeDesignStyleRecord(
            document.id,
            document.data(),
          );
          if (parsed.status === "valid") {
            styles.push(projectDesignStyleRecordForAdmin(parsed.record));
            return;
          }
          const migration = createLegacyDesignStyleMigrationDraft(
            document.id,
            document.data(),
          );
          if (migration) {
            styles.push(migration);
            diagnostics.push({
              documentId: document.id,
              reason: "LEGACY_MIGRATION_REQUIRED",
            });
            return;
          }
          diagnostics.push({
            documentId: document.id,
            reason: parsed.reason,
          });
        });
        callback({ styles: sortAdminStyles(styles), diagnostics });
      },
      (error) => onError(error),
    );
  },
};
