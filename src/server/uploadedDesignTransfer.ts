import type {
  CustomerDesignImageMimeType,
  CustomerDesignUploadReference,
  ImmutableUploadedOrderDesignReference,
} from "../types.js";
import {
  MAX_CUSTOMER_DESIGN_IMAGE_BYTES,
  getCustomerDesignImageExtension,
  isCustomerDesignDraftStoragePath,
  isCustomerDesignImageMimeType,
} from "../services/customerDesignUploadReference.js";

export type TrustedUploadedDesignTransferErrorCode =
  | "AUTH_FAILED"
  | "INVALID_REFERENCE"
  | "SOURCE_NOT_AUTHORIZED"
  | "TRUSTED_OWNERSHIP_CLAIM_REQUIRED"
  | "TRUSTED_OWNERSHIP_CLAIM_INVALID"
  | "SOURCE_NOT_FOUND"
  | "INVALID_FILE"
  | "DESTINATION_CONFLICT"
  | "TRANSFER_FAILED";

export class TrustedUploadedDesignTransferError extends Error {
  readonly code: TrustedUploadedDesignTransferErrorCode;

  constructor(code: TrustedUploadedDesignTransferErrorCode, message: string) {
    super(message);
    this.name = "TrustedUploadedDesignTransferError";
    this.code = code;
  }
}

export interface VerifiedFirebaseToken {
  uid: string;
}

export interface TrustedStorageObjectMetadata {
  contentType?: string;
  size?: string | number;
  timeCreated?: string;
  updated?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

export interface TrustedStorageObject {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[TrustedStorageObjectMetadata, unknown]>;
  copy(
    destination: TrustedStorageObject,
    options: {
      preconditionOpts: { ifGenerationMatch: 0 };
      metadata: {
        contentType: CustomerDesignImageMimeType;
        metadata: Record<string, string>;
      };
    },
  ): Promise<unknown>;
}

export interface TrustedStorageBucket {
  file(storagePath: string): TrustedStorageObject;
}

export interface UploadedDesignTransferRequest {
  orderId: string;
  draftReference: CustomerDesignUploadReference;
  ownershipClaimToken?: string;
}

export interface TrustedUploadedDesignTransferResult {
  status: "SUCCESS" | "ALREADY_TRANSFERRED";
  orderReference: ImmutableUploadedOrderDesignReference;
}

const DESTINATION_METADATA_KEYS = {
  sourceOwnerUid: "odogwuSourceOwnerUid",
  sourceReferenceId: "odogwuSourceReferenceId",
  sourceStoragePath: "odogwuSourceStoragePath",
  orderId: "odogwuOrderId",
} as const;

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasDraftReferenceShape = (
  value: unknown,
): value is CustomerDesignUploadReference => {
  if (!isRecord(value)) return false;
  return (
    typeof value.designReferenceId === "string" &&
    typeof value.ownerUid === "string" &&
    typeof value.storagePath === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.createdAt === "string"
  );
};

export const parseUploadedDesignTransferRequest = (
  body: unknown,
): UploadedDesignTransferRequest => {
  if (!isRecord(body) || !isSafeIdentifier(body.orderId)) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "A valid order preparation identifier is required.",
    );
  }

  if (!hasDraftReferenceShape(body.draftReference)) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "A valid private customer design reference is required.",
    );
  }

  const draftReference = body.draftReference;
  if (
    !isSafeIdentifier(draftReference.ownerUid) ||
    !isSafeIdentifier(draftReference.designReferenceId) ||
    !isCustomerDesignImageMimeType(draftReference.mimeType) ||
    !isCustomerDesignDraftStoragePath(draftReference)
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The customer design reference is not a valid private draft.",
    );
  }

  const ownershipClaimToken = body.ownershipClaimToken;
  if (
    ownershipClaimToken !== undefined &&
    (typeof ownershipClaimToken !== "string" || ownershipClaimToken.length > 256)
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The uploaded design ownership claim is invalid.",
    );
  }

  const validOwnershipClaimToken =
    typeof ownershipClaimToken === "string" && ownershipClaimToken.length > 0
      ? ownershipClaimToken
      : undefined;
  return {
    orderId: body.orderId,
    draftReference,
    ...(validOwnershipClaimToken
      ? { ownershipClaimToken: validOwnershipClaimToken }
      : {}),
  };
};

const buildDestinationPath = (
  ownerUid: string,
  orderId: string,
  designReferenceId: string,
  mimeType: CustomerDesignImageMimeType,
): string => {
  const extension = getCustomerDesignImageExtension(mimeType);
  if (!extension) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The customer design image type is not supported.",
    );
  }
  return `customer-order-designs/${ownerUid}/${orderId}/${designReferenceId}/reference.${extension}`;
};

const parseObjectSize = (size: string | number | undefined): number | null => {
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
  request: UploadedDesignTransferRequest,
): Record<string, string> => ({
  [DESTINATION_METADATA_KEYS.sourceOwnerUid]: request.draftReference.ownerUid,
  [DESTINATION_METADATA_KEYS.sourceReferenceId]:
    request.draftReference.designReferenceId,
  [DESTINATION_METADATA_KEYS.sourceStoragePath]: request.draftReference.storagePath,
  [DESTINATION_METADATA_KEYS.orderId]: request.orderId,
});

const destinationMatchesRequest = (
  metadata: TrustedStorageObjectMetadata,
  request: UploadedDesignTransferRequest,
): boolean => {
  const expected = getDestinationMetadata(request);
  const actual = metadata.metadata || {};
  return (
    metadata.contentType === request.draftReference.mimeType &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
};

const getExistingDestinationResult = async (
  destination: TrustedStorageObject,
  request: UploadedDesignTransferRequest,
  destinationPath: string,
  now: () => string,
): Promise<TrustedUploadedDesignTransferResult | null> => {
  const [exists] = await destination.exists();
  if (!exists) return null;

  const [metadata] = await destination.getMetadata();
  if (!destinationMatchesRequest(metadata, request)) {
    throw new TrustedUploadedDesignTransferError(
      "DESTINATION_CONFLICT",
      "This order design reference is already occupied by another asset.",
    );
  }

  return {
    status: "ALREADY_TRANSFERRED",
    orderReference: {
      orderId: request.orderId,
      storagePath: destinationPath,
      mimeType: request.draftReference.mimeType,
      createdAt: metadata.timeCreated || metadata.updated || now(),
    },
  };
};

export const transferVerifiedUploadedDesign = async ({
  authenticatedUid,
  request,
  bucket,
  trustedSourceOwnerUid,
  now = () => new Date().toISOString(),
}: {
  authenticatedUid: string;
  request: UploadedDesignTransferRequest;
  bucket: TrustedStorageBucket;
  /** Server-only claim output; never accepted directly from request JSON. */
  trustedSourceOwnerUid?: string;
  now?: () => string;
}): Promise<TrustedUploadedDesignTransferResult> => {
  if (!isSafeIdentifier(authenticatedUid)) {
    throw new TrustedUploadedDesignTransferError(
      "AUTH_FAILED",
      "Firebase authentication is required.",
    );
  }

  if (
    !isSafeIdentifier(request.orderId) ||
    !isSafeIdentifier(request.draftReference.ownerUid) ||
    !isSafeIdentifier(request.draftReference.designReferenceId) ||
    !isCustomerDesignImageMimeType(request.draftReference.mimeType) ||
    !isCustomerDesignDraftStoragePath(request.draftReference)
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The customer design reference is not a valid private draft.",
    );
  }

  if (
    request.draftReference.ownerUid !== authenticatedUid &&
    trustedSourceOwnerUid !== request.draftReference.ownerUid
  ) {
    throw new TrustedUploadedDesignTransferError(
      "TRUSTED_OWNERSHIP_CLAIM_REQUIRED",
      "This design belongs to a previous secure guest identity and needs a trusted ownership transfer before checkout.",
    );
  }

  const source = bucket.file(request.draftReference.storagePath);
  const [sourceExists] = await source.exists();
  if (!sourceExists) {
    throw new TrustedUploadedDesignTransferError(
      "SOURCE_NOT_FOUND",
      "The private customer design could not be found.",
    );
  }

  const [sourceMetadata] = await source.getMetadata();
  const sourceSize = parseObjectSize(sourceMetadata.size);
  if (
    sourceMetadata.contentType !== request.draftReference.mimeType ||
    !isCustomerDesignImageMimeType(sourceMetadata.contentType || "") ||
    sourceSize === null ||
    sourceSize < 1 ||
    sourceSize > MAX_CUSTOMER_DESIGN_IMAGE_BYTES
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_FILE",
      "The private customer design does not satisfy the image security policy.",
    );
  }

  const destinationPath = buildDestinationPath(
    authenticatedUid,
    request.orderId,
    request.draftReference.designReferenceId,
    request.draftReference.mimeType,
  );
  const destination = bucket.file(destinationPath);
  const existing = await getExistingDestinationResult(
    destination,
    request,
    destinationPath,
    now,
  );
  if (existing) return existing;

  try {
    await source.copy(destination, {
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: request.draftReference.mimeType,
        metadata: getDestinationMetadata(request),
      },
    });
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      const retry = await getExistingDestinationResult(
        destination,
        request,
        destinationPath,
        now,
      );
      if (retry) return retry;
    }
    throw new TrustedUploadedDesignTransferError(
      "TRANSFER_FAILED",
      "The private customer design could not be transferred to the order.",
    );
  }

  return {
    status: "SUCCESS",
    orderReference: {
      orderId: request.orderId,
      storagePath: destinationPath,
      mimeType: request.draftReference.mimeType,
      createdAt: now(),
    },
  };
};

/**
 * Independently verify an immutable uploaded-order reference for deposit prepare.
 * Does not trust client-forged paths/metadata without storage confirmation.
 */
export const verifyImmutableUploadedOrderReferenceForDeposit = async ({
  authenticatedUid,
  orderId,
  designReferenceId,
  orderReference,
  draftMimeType,
  draftStoragePath,
  draftOwnerUid,
  bucket,
}: {
  authenticatedUid: string;
  orderId: string;
  designReferenceId: string;
  orderReference: ImmutableUploadedOrderDesignReference;
  draftMimeType: CustomerDesignImageMimeType;
  draftStoragePath: string;
  draftOwnerUid: string;
  bucket: TrustedStorageBucket;
}): Promise<ImmutableUploadedOrderDesignReference> => {
  if (
    !isSafeIdentifier(authenticatedUid) ||
    !isSafeIdentifier(orderId) ||
    !isSafeIdentifier(designReferenceId) ||
    !isCustomerDesignImageMimeType(draftMimeType)
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The uploaded-design order reference is invalid.",
    );
  }

  const expectedPath = buildDestinationPath(
    authenticatedUid,
    orderId,
    designReferenceId,
    draftMimeType,
  );
  if (
    orderReference.orderId !== orderId ||
    orderReference.storagePath !== expectedPath ||
    orderReference.mimeType !== draftMimeType
  ) {
    throw new TrustedUploadedDesignTransferError(
      "INVALID_REFERENCE",
      "The uploaded-design order reference does not match the trusted path convention.",
    );
  }

  const destination = bucket.file(expectedPath);
  const [exists] = await destination.exists();
  if (!exists) {
    throw new TrustedUploadedDesignTransferError(
      "SOURCE_NOT_FOUND",
      "The trusted uploaded-design order asset was not found.",
    );
  }

  const [metadata] = await destination.getMetadata();
  const request: UploadedDesignTransferRequest = {
    orderId,
    draftReference: {
      designReferenceId,
      ownerUid: draftOwnerUid,
      storagePath: draftStoragePath,
      mimeType: draftMimeType,
      createdAt: orderReference.createdAt,
    },
  };
  if (!destinationMatchesRequest(metadata, request)) {
    throw new TrustedUploadedDesignTransferError(
      "DESTINATION_CONFLICT",
      "The uploaded-design order asset metadata does not match the trusted transfer.",
    );
  }

  return {
    orderId,
    storagePath: expectedPath,
    mimeType: draftMimeType,
    createdAt: metadata.timeCreated || metadata.updated || orderReference.createdAt,
  };
};
