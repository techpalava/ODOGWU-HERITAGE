import type { StyleCategory } from "../types";
import {
  prepareAuthoritativeDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
  type DesignStyleLifecycle,
  type DesignStyleReferenceComposition,
} from "./designStyleAuthority";

export class DesignStylePublicationError extends Error {
  readonly code:
    | "CURRENT_RECORD_INVALID"
    | "STALE_PUBLIC_REVISION"
    | "IMAGE_UPLOAD_FAILED"
    | "AUTHORITATIVE_COMMIT_FAILED";

  constructor(
    code: DesignStylePublicationError["code"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DesignStylePublicationError";
    this.code = code;
  }
}

export interface CurrentDesignStylePublicationAuthority {
  readonly record: AuthoritativeDesignStyleRecordV1 | null;
  /** True only when the raw legacy record passed explicit migration validation. */
  readonly legacyMigrationAllowed: boolean;
  readonly currentImage: string;
}

export interface DesignStylePublicationDependencies {
  readCurrent(
    styleId: string,
  ): Promise<CurrentDesignStylePublicationAuthority | null>;
  uploadReplacementImage(styleId: string, dataUrl: string): Promise<string>;
  commitAuthoritativeRecord(input: {
    record: AuthoritativeDesignStyleRecordV1;
    expectedPublicRevision: number;
  }): Promise<void>;
  canDeleteSupersededImage(input: {
    styleId: string;
    imageUrl: string;
  }): Promise<boolean>;
  deleteImage(imageUrl: string): Promise<void>;
}

export interface PublishDesignStyleInput {
  readonly style: StyleCategory;
  readonly lifecycle: DesignStyleLifecycle;
  readonly displayOrder: number;
  readonly referenceComposition: DesignStyleReferenceComposition;
  readonly expectedPublicRevision: number;
}

export const isSupersededDesignStyleImageUnreferenced = ({
  styleId,
  hasLegacyOrderReference,
  hasOrderDesignSourceReference,
  styleReferenceIds,
}: {
  readonly styleId: string;
  readonly hasLegacyOrderReference: boolean;
  readonly hasOrderDesignSourceReference: boolean;
  readonly styleReferenceIds: readonly string[];
}): boolean =>
  !hasLegacyOrderReference &&
  !hasOrderDesignSourceReference &&
  !styleReferenceIds.some((referenceId) => referenceId !== styleId);

const isReplacementUpload = (image: string): boolean =>
  image.startsWith("data:image/");

export const publishDesignStyleWithDependencies = async (
  input: PublishDesignStyleInput,
  dependencies: DesignStylePublicationDependencies,
): Promise<AuthoritativeDesignStyleRecordV1> => {
  const current = await dependencies.readCurrent(input.style.id);
  if (current && !current.record && !current.legacyMigrationAllowed) {
    throw new DesignStylePublicationError(
      "CURRENT_RECORD_INVALID",
      "The current Design Style record is malformed and cannot be overwritten safely.",
    );
  }
  const currentRevision = current?.record?.publicRevision ?? 0;
  if (currentRevision !== input.expectedPublicRevision) {
    throw new DesignStylePublicationError(
      "STALE_PUBLIC_REVISION",
      `The Design Style changed after this edit began (expected revision ${input.expectedPublicRevision}, current revision ${currentRevision}).`,
    );
  }

  const requestedImage = String(input.style.image || "");
  const replacementUpload = isReplacementUpload(requestedImage);
  // Validate every non-image field before allocating Storage resources.
  prepareAuthoritativeDesignStyleRecord({
    style: input.style,
    lifecycle: input.lifecycle,
    displayOrder: input.displayOrder,
    referenceComposition: input.referenceComposition,
    currentRecord: current?.record ?? null,
    image: replacementUpload ? "" : requestedImage,
  });

  let uploadedImage: string | null = null;
  if (replacementUpload) {
    try {
      uploadedImage = await dependencies.uploadReplacementImage(
        input.style.id,
        requestedImage,
      );
    } catch (error) {
      throw new DesignStylePublicationError(
        "IMAGE_UPLOAD_FAILED",
        "The replacement image could not be uploaded.",
        { cause: error },
      );
    }
  }

  const record = prepareAuthoritativeDesignStyleRecord({
    style: input.style,
    lifecycle: input.lifecycle,
    displayOrder: input.displayOrder,
    referenceComposition: input.referenceComposition,
    currentRecord: current?.record ?? null,
    image: uploadedImage ?? requestedImage,
  });

  try {
    await dependencies.commitAuthoritativeRecord({
      record,
      expectedPublicRevision: input.expectedPublicRevision,
    });
  } catch (error) {
    if (uploadedImage) {
      try {
        await dependencies.deleteImage(uploadedImage);
      } catch {
        // The failed upload cleanup is best effort; the authoritative record is unchanged.
      }
    }
    if (error instanceof DesignStylePublicationError) throw error;
    throw new DesignStylePublicationError(
      "AUTHORITATIVE_COMMIT_FAILED",
      "The Design Style publication did not commit.",
      { cause: error },
    );
  }

  const oldImage = current?.currentImage || "";
  const imageWasSuperseded = oldImage && oldImage !== record.presentation.image;
  if (imageWasSuperseded) {
    try {
      const safe = await dependencies.canDeleteSupersededImage({
        styleId: record.id,
        imageUrl: oldImage,
      });
      if (safe) await dependencies.deleteImage(oldImage);
    } catch {
      // Publication already succeeded. Retaining the superseded image is fail-safe.
    }
  }

  return record;
};

export const rejectDesignStyleHardDelete = (): never => {
  throw new Error(
    "DESIGN_STYLE_HARD_DELETE_PROHIBITED: archive or disable the style instead.",
  );
};
