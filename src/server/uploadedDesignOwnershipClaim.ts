import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { CustomerDesignUploadReference } from "../types.js";
import {
  MAX_CUSTOMER_DESIGN_IMAGE_BYTES,
  isCustomerDesignDraftStoragePath,
  isCustomerDesignImageMimeType,
} from "../services/customerDesignUploadReference.js";
import type {
  TrustedStorageBucket,
  TrustedStorageObjectMetadata,
} from "./uploadedDesignTransfer.js";

export const UPLOADED_DESIGN_OWNERSHIP_CLAIM_COLLECTION =
  "uploadedDesignOwnershipClaims";
export const UPLOADED_DESIGN_OWNERSHIP_CLAIM_LIFETIME_MS = 15 * 60 * 1000;

export type UploadedDesignOwnershipClaimErrorCode =
  | "CLAIM_AUTH_REQUIRED"
  | "CLAIM_INVALID_REFERENCE"
  | "CLAIM_OWNER_MISMATCH"
  | "CLAIM_NOT_FOUND"
  | "CLAIM_EXPIRED"
  | "CLAIM_ALREADY_USED"
  | "CLAIM_REDEEMED_BY_DIFFERENT_USER"
  | "TRUSTED_OWNERSHIP_CLAIM_INVALID";

export class UploadedDesignOwnershipClaimError extends Error {
  readonly code: UploadedDesignOwnershipClaimErrorCode;

  constructor(code: UploadedDesignOwnershipClaimErrorCode, message: string) {
    super(message);
    this.name = "UploadedDesignOwnershipClaimError";
    this.code = code;
  }
}

export interface UploadedDesignOwnershipClaimRecord {
  version: 1;
  tokenHash: string;
  sourceOwnerUid: string;
  draftReference: Pick<
    CustomerDesignUploadReference,
    "designReferenceId" | "storagePath" | "mimeType"
  >;
  createdAt: string;
  expiresAt: string;
  status: "issued" | "redeemed";
  redeemedAt?: string;
  redeemedByUid?: string;
  redeemedOrderId?: string;
}

export interface OwnershipClaimDocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: OwnershipClaimDocumentReference;
  data(): UploadedDesignOwnershipClaimRecord | undefined;
}

export interface OwnershipClaimDocumentReference {
  readonly id: string;
}

export interface OwnershipClaimQuery {
  limit(value: number): OwnershipClaimQuery;
  get(): Promise<{ empty: boolean; docs: OwnershipClaimDocumentSnapshot[] }>;
}

export interface OwnershipClaimCollection {
  doc(id: string): OwnershipClaimDocumentReference;
  where(
    fieldPath: "tokenHash",
    operation: "==",
    value: string,
  ): OwnershipClaimQuery;
}

export interface OwnershipClaimTransaction {
  get(
    reference: OwnershipClaimDocumentReference,
  ): Promise<OwnershipClaimDocumentSnapshot>;
  create(
    reference: OwnershipClaimDocumentReference,
    record: UploadedDesignOwnershipClaimRecord,
  ): void;
  set(
    reference: OwnershipClaimDocumentReference,
    patch: Partial<UploadedDesignOwnershipClaimRecord>,
    options: { merge: true },
  ): void;
}

export interface OwnershipClaimStore {
  collection(name: string): OwnershipClaimCollection;
  runTransaction<T>(
    update: (transaction: OwnershipClaimTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface OwnershipClaimCreatedResult {
  claimToken: string;
  expiresAt: string;
}

export interface RedeemedUploadedDesignOwnership {
  status: "REDEEMED" | "ALREADY_REDEEMED";
  sourceOwnerUid: string;
}

const isSafeIdentifier = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

const hashClaimToken = (claimToken: string): string =>
  createHash("sha256").update(claimToken).digest("hex");

const generateClaimToken = (): string => randomBytes(32).toString("base64url");

const parseSize = (size: string | number | undefined): number | null => {
  if (typeof size === "number" && Number.isFinite(size)) return size;
  if (typeof size === "string" && /^\d+$/.test(size)) return Number(size);
  return null;
};

const isSecureDraftReference = (
  reference: CustomerDesignUploadReference,
): boolean =>
  isSafeIdentifier(reference.ownerUid) &&
  isSafeIdentifier(reference.designReferenceId) &&
  isCustomerDesignImageMimeType(reference.mimeType) &&
  isCustomerDesignDraftStoragePath(reference);

const assertSecureDraftReference = (
  reference: CustomerDesignUploadReference,
): void => {
  if (!isSecureDraftReference(reference)) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_INVALID_REFERENCE",
      "The customer design reference is not a valid private draft.",
    );
  }
};

const assertSourceObjectIsPolicyCompliant = (
  metadata: TrustedStorageObjectMetadata,
  reference: CustomerDesignUploadReference,
): void => {
  const size = parseSize(metadata.size);
  if (
    metadata.contentType !== reference.mimeType ||
    !isCustomerDesignImageMimeType(metadata.contentType || "") ||
    size === null ||
    size < 1 ||
    size > MAX_CUSTOMER_DESIGN_IMAGE_BYTES
  ) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_INVALID_REFERENCE",
      "The private customer design does not satisfy the image security policy.",
    );
  }
};

const hasClaimScopeForReference = (
  claim: UploadedDesignOwnershipClaimRecord,
  reference: CustomerDesignUploadReference,
): boolean =>
  claim.sourceOwnerUid === reference.ownerUid &&
  claim.draftReference.designReferenceId === reference.designReferenceId &&
  claim.draftReference.storagePath === reference.storagePath &&
  claim.draftReference.mimeType === reference.mimeType;

const getClaimRecord = async (
  store: OwnershipClaimStore,
  claimToken: string,
): Promise<{ reference: OwnershipClaimDocumentReference; record: UploadedDesignOwnershipClaimRecord }> => {
  const snapshot = await store
    .collection(UPLOADED_DESIGN_OWNERSHIP_CLAIM_COLLECTION)
    .where("tokenHash", "==", hashClaimToken(claimToken))
    .limit(1)
    .get();
  const document = snapshot.docs[0];
  const record = document?.data();
  if (!document || !record) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_NOT_FOUND",
      "The uploaded design ownership claim is invalid or unavailable.",
    );
  }
  return { reference: document.ref, record };
};

export const createUploadedDesignOwnershipClaim = async ({
  authenticatedUid,
  draftReference,
  store,
  bucket,
  now = () => new Date(),
  claimTokenGenerator = generateClaimToken,
  claimIdGenerator = randomUUID,
}: {
  authenticatedUid: string;
  draftReference: CustomerDesignUploadReference;
  store: OwnershipClaimStore;
  bucket: TrustedStorageBucket;
  now?: () => Date;
  claimTokenGenerator?: () => string;
  claimIdGenerator?: () => string;
}): Promise<OwnershipClaimCreatedResult> => {
  if (!isSafeIdentifier(authenticatedUid)) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
  assertSecureDraftReference(draftReference);
  if (draftReference.ownerUid !== authenticatedUid) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_OWNER_MISMATCH",
      "Only the authenticated owner can prepare this customer design transfer.",
    );
  }

  const source = bucket.file(draftReference.storagePath);
  const [exists] = await source.exists();
  if (!exists) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_INVALID_REFERENCE",
      "The private customer design could not be found.",
    );
  }
  const [metadata] = await source.getMetadata();
  assertSourceObjectIsPolicyCompliant(metadata, draftReference);

  const claimToken = claimTokenGenerator();
  if (claimToken.length < 32) {
    throw new Error("Ownership claim token generator returned insufficient entropy.");
  }
  const created = now();
  const expiresAt = new Date(
    created.getTime() + UPLOADED_DESIGN_OWNERSHIP_CLAIM_LIFETIME_MS,
  );
  const record: UploadedDesignOwnershipClaimRecord = {
    version: 1,
    tokenHash: hashClaimToken(claimToken),
    sourceOwnerUid: authenticatedUid,
    draftReference: {
      designReferenceId: draftReference.designReferenceId,
      storagePath: draftReference.storagePath,
      mimeType: draftReference.mimeType,
    },
    createdAt: created.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "issued",
  };

  const reference = store
    .collection(UPLOADED_DESIGN_OWNERSHIP_CLAIM_COLLECTION)
    .doc(claimIdGenerator());
  await store.runTransaction(async (transaction) => {
    transaction.create(reference, record);
  });

  return { claimToken, expiresAt: record.expiresAt };
};

export const redeemUploadedDesignOwnershipClaim = async ({
  authenticatedUid,
  claimToken,
  orderId,
  draftReference,
  store,
  now = () => new Date(),
}: {
  authenticatedUid: string;
  claimToken: string;
  orderId: string;
  draftReference: CustomerDesignUploadReference;
  store: OwnershipClaimStore;
  now?: () => Date;
}): Promise<RedeemedUploadedDesignOwnership> => {
  if (!isSafeIdentifier(authenticatedUid)) {
    throw new UploadedDesignOwnershipClaimError(
      "CLAIM_AUTH_REQUIRED",
      "Firebase authentication is required.",
    );
  }
  if (!isSafeIdentifier(orderId) || claimToken.length < 32) {
    throw new UploadedDesignOwnershipClaimError(
      "TRUSTED_OWNERSHIP_CLAIM_INVALID",
      "The uploaded design ownership claim is invalid.",
    );
  }
  assertSecureDraftReference(draftReference);

  const located = await getClaimRecord(store, claimToken);
  return store.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(located.reference);
    const claim = snapshot.data();
    if (!snapshot.exists || !claim || claim.tokenHash !== hashClaimToken(claimToken)) {
      throw new UploadedDesignOwnershipClaimError(
        "CLAIM_NOT_FOUND",
        "The uploaded design ownership claim is invalid or unavailable.",
      );
    }
    if (!hasClaimScopeForReference(claim, draftReference)) {
      throw new UploadedDesignOwnershipClaimError(
        "TRUSTED_OWNERSHIP_CLAIM_INVALID",
        "This claim cannot authorize the requested customer design.",
      );
    }

    if (claim.status === "redeemed") {
      if (claim.redeemedByUid !== authenticatedUid) {
        throw new UploadedDesignOwnershipClaimError(
          "CLAIM_REDEEMED_BY_DIFFERENT_USER",
          "This uploaded design ownership claim has already been redeemed.",
        );
      }
      if (claim.redeemedOrderId !== orderId) {
        throw new UploadedDesignOwnershipClaimError(
          "CLAIM_ALREADY_USED",
          "This uploaded design ownership claim is already bound to another order.",
        );
      }
      return { status: "ALREADY_REDEEMED" as const, sourceOwnerUid: claim.sourceOwnerUid };
    }

    if (new Date(claim.expiresAt).getTime() <= now().getTime()) {
      throw new UploadedDesignOwnershipClaimError(
        "CLAIM_EXPIRED",
        "This uploaded design ownership claim has expired. Please prepare it again before signing in.",
      );
    }

    transaction.set(
      located.reference,
      {
        status: "redeemed",
        redeemedAt: now().toISOString(),
        redeemedByUid: authenticatedUid,
        redeemedOrderId: orderId,
      },
      { merge: true },
    );
    return { status: "REDEEMED" as const, sourceOwnerUid: claim.sourceOwnerUid };
  });
};
