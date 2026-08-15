import { createHash } from "node:crypto";
import type {
  CustomerDesignImageMimeType,
  CustomerDesignUploadReference,
} from "../types.js";
import {
  MAX_CUSTOMER_DESIGN_IMAGE_BYTES,
  getCustomerDesignImageExtension,
  isCustomerDesignDraftStoragePath,
  isCustomerDesignImageMimeType,
} from "../services/customerDesignUploadReference.js";
import type {
  TrustedStorageBucket,
  TrustedStorageObject,
  TrustedStorageObjectMetadata,
} from "./uploadedDesignTransfer.js";

export type UploadedDesignDraftTransferErrorCode =
  | "AUTH_FAILED"
  | "INVALID_REFERENCE"
  | "TRUSTED_OWNERSHIP_CLAIM_REQUIRED"
  | "TRUSTED_OWNERSHIP_CLAIM_INVALID"
  | "SOURCE_NOT_FOUND"
  | "INVALID_FILE"
  | "DESTINATION_CONFLICT"
  | "TRANSFER_FAILED";

export class UploadedDesignDraftTransferError extends Error {
  readonly code: UploadedDesignDraftTransferErrorCode;

  constructor(code: UploadedDesignDraftTransferErrorCode, message: string) {
    super(message);
    this.name = "UploadedDesignDraftTransferError";
    this.code = code;
  }
}

export interface UploadedDesignDraftTransferRequest {
  draftReference: CustomerDesignUploadReference;
  ownershipClaimToken: string;
}

export interface UploadedDesignDraftTransferResult {
  status: "SUCCESS" | "ALREADY_TRANSFERRED";
  draftReference: CustomerDesignUploadReference;
}

interface DeletableTrustedStorageObject extends TrustedStorageObject {
  delete(): Promise<unknown>;
}

const DESTINATION_METADATA_KEYS = {
  sourceOwnerUid: "odogwuDraftSourceOwnerUid",
  sourceReferenceId: "odogwuDraftSourceReferenceId",
  sourceStoragePath: "odogwuDraftSourceStoragePath",
  destinationOwnerUid: "odogwuDraftDestinationOwnerUid",
} as const;

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isReferenceShape = (
  value: unknown,
): value is CustomerDesignUploadReference => {
  if (!isRecord(value)) return false;
  return (
    typeof value.designReferenceId === "string" &&
    typeof value.ownerUid === "string" &&
    typeof value.storagePath === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.createdAt === "string" &&
    (value.originalFileName === undefined ||
      typeof value.originalFileName === "string")
  );
};

export const parseUploadedDesignDraftTransferRequest = (
  value: unknown,
): UploadedDesignDraftTransferRequest => {
  if (!isRecord(value) || !isReferenceShape(value.draftReference)) {
    throw new UploadedDesignDraftTransferError(
      "INVALID_REFERENCE",
      "A valid private customer design reference is required.",
    );
  }
  const draftReference = value.draftReference;
  if (
    !isSafeIdentifier(draftReference.ownerUid) ||
    !isSafeIdentifier(draftReference.designReferenceId) ||
    !isCustomerDesignImageMimeType(draftReference.mimeType) ||
    !isCustomerDesignDraftStoragePath(draftReference)
  ) {
    throw new UploadedDesignDraftTransferError(
      "INVALID_REFERENCE",
      "The customer design reference is not a valid private draft.",
    );
  }
  if (
    typeof value.ownershipClaimToken !== "string" ||
    value.ownershipClaimToken.length < 32 ||
    value.ownershipClaimToken.length > 256
  ) {
    throw new UploadedDesignDraftTransferError(
      "TRUSTED_OWNERSHIP_CLAIM_REQUIRED",
      "A trusted ownership claim is required for this draft transfer.",
    );
  }
  return {
    draftReference: { ...draftReference },
    ownershipClaimToken: value.ownershipClaimToken,
  };
};

export const getUploadedDesignDraftTransferRedemptionId = (
  destinationOwnerUid: string,
  designReferenceId: string,
): string =>
  `draft_${createHash("sha256")
    .update(`${destinationOwnerUid}:${designReferenceId}`)
    .digest("hex")
    .slice(0, 48)}`;

const buildDestinationPath = (
  ownerUid: string,
  designReferenceId: string,
  mimeType: CustomerDesignImageMimeType,
): string => {
  const extension = getCustomerDesignImageExtension(mimeType);
  if (!extension) {
    throw new UploadedDesignDraftTransferError(
      "INVALID_REFERENCE",
      "The customer design image type is not supported.",
    );
  }
  return `customer-design-drafts/${ownerUid}/${designReferenceId}/original.${extension}`;
};

const parseSize = (size: string | number | undefined): number | null => {
  if (typeof size === "number" && Number.isFinite(size)) return size;
  if (typeof size === "string" && /^\d+$/.test(size)) return Number(size);
  return null;
};

const getErrorCode = (error: unknown): string =>
  error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

const isAlreadyExistsError = (error: unknown): boolean => {
  const code = getErrorCode(error);
  return code === "412" || code === "storage/object-already-exists";
};

const getDestinationMetadata = (
  authenticatedUid: string,
  reference: CustomerDesignUploadReference,
): Record<string, string> => ({
  [DESTINATION_METADATA_KEYS.sourceOwnerUid]: reference.ownerUid,
  [DESTINATION_METADATA_KEYS.sourceReferenceId]: reference.designReferenceId,
  [DESTINATION_METADATA_KEYS.sourceStoragePath]: reference.storagePath,
  [DESTINATION_METADATA_KEYS.destinationOwnerUid]: authenticatedUid,
});

const destinationMatches = (
  metadata: TrustedStorageObjectMetadata,
  authenticatedUid: string,
  reference: CustomerDesignUploadReference,
): boolean => {
  const expected = getDestinationMetadata(authenticatedUid, reference);
  const actual = metadata.metadata || {};
  return (
    metadata.contentType === reference.mimeType &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
};

const createTransferredReference = ({
  authenticatedUid,
  sourceReference,
  destinationPath,
  createdAt,
}: {
  authenticatedUid: string;
  sourceReference: CustomerDesignUploadReference;
  destinationPath: string;
  createdAt: string;
}): CustomerDesignUploadReference => ({
  designReferenceId: sourceReference.designReferenceId,
  ownerUid: authenticatedUid,
  storagePath: destinationPath,
  mimeType: sourceReference.mimeType,
  ...(sourceReference.originalFileName
    ? { originalFileName: sourceReference.originalFileName }
    : {}),
  createdAt,
});

const removeSource = async (
  source: DeletableTrustedStorageObject,
): Promise<void> => {
  try {
    await source.delete();
  } catch (error) {
    if (getErrorCode(error) === "404" || getErrorCode(error) === "storage/object-not-found") {
      return;
    }
    throw new UploadedDesignDraftTransferError(
      "TRANSFER_FAILED",
      "The previous private customer design could not be finalized.",
    );
  }
};

export const transferVerifiedUploadedDesignDraft = async ({
  authenticatedUid,
  request,
  bucket,
  trustedSourceOwnerUid,
  now = () => new Date().toISOString(),
}: {
  authenticatedUid: string;
  request: UploadedDesignDraftTransferRequest;
  bucket: TrustedStorageBucket;
  /** Server-only claim output; never accepted directly from request JSON. */
  trustedSourceOwnerUid?: string;
  now?: () => string;
}): Promise<UploadedDesignDraftTransferResult> => {
  if (!isSafeIdentifier(authenticatedUid)) {
    throw new UploadedDesignDraftTransferError(
      "AUTH_FAILED",
      "Firebase authentication is required.",
    );
  }
  const reference = request.draftReference;
  if (
    reference.ownerUid === authenticatedUid ||
    trustedSourceOwnerUid !== reference.ownerUid
  ) {
    throw new UploadedDesignDraftTransferError(
      "TRUSTED_OWNERSHIP_CLAIM_INVALID",
      "A verified previous owner is required for this draft transfer.",
    );
  }

  const destinationPath = buildDestinationPath(
    authenticatedUid,
    reference.designReferenceId,
    reference.mimeType,
  );
  const source = bucket.file(
    reference.storagePath,
  ) as DeletableTrustedStorageObject;
  const destination = bucket.file(destinationPath);
  const [destinationExists] = await destination.exists();
  if (destinationExists) {
    const [metadata] = await destination.getMetadata();
    if (!destinationMatches(metadata, authenticatedUid, reference)) {
      throw new UploadedDesignDraftTransferError(
        "DESTINATION_CONFLICT",
        "The destination draft reference belongs to another transfer.",
      );
    }
    await removeSource(source);
    return {
      status: "ALREADY_TRANSFERRED",
      draftReference: createTransferredReference({
        authenticatedUid,
        sourceReference: reference,
        destinationPath,
        createdAt: metadata.timeCreated || metadata.updated || now(),
      }),
    };
  }

  const [sourceExists] = await source.exists();
  if (!sourceExists) {
    throw new UploadedDesignDraftTransferError(
      "SOURCE_NOT_FOUND",
      "The private customer design could not be found.",
    );
  }
  const [sourceMetadata] = await source.getMetadata();
  const sourceSize = parseSize(sourceMetadata.size);
  if (
    sourceMetadata.contentType !== reference.mimeType ||
    sourceSize === null ||
    sourceSize < 1 ||
    sourceSize > MAX_CUSTOMER_DESIGN_IMAGE_BYTES
  ) {
    throw new UploadedDesignDraftTransferError(
      "INVALID_FILE",
      "The private customer design does not satisfy the image security policy.",
    );
  }

  try {
    await source.copy(destination, {
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: reference.mimeType,
        metadata: getDestinationMetadata(authenticatedUid, reference),
      },
    });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      const [existsAfterRace] = await destination.exists();
      if (existsAfterRace) {
        const [metadata] = await destination.getMetadata();
        if (destinationMatches(metadata, authenticatedUid, reference)) {
          await removeSource(source);
          return {
            status: "ALREADY_TRANSFERRED",
            draftReference: createTransferredReference({
              authenticatedUid,
              sourceReference: reference,
              destinationPath,
              createdAt: metadata.timeCreated || metadata.updated || now(),
            }),
          };
        }
      }
    }
    throw new UploadedDesignDraftTransferError(
      "TRANSFER_FAILED",
      "The private customer design could not be transferred.",
    );
  }

  await removeSource(source);
  return {
    status: "SUCCESS",
    draftReference: createTransferredReference({
      authenticatedUid,
      sourceReference: reference,
      destinationPath,
      createdAt: now(),
    }),
  };
};
