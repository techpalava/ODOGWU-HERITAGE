import type {
  CustomerDesignUploadReference,
  ImmutableUploadedOrderDesignReference,
} from "../types";
import { getCustomerDesignImageExtension } from "./customerDesignUploadReference";

export type UploadedDesignTransferClientErrorCode =
  | "AUTH_REQUIRED"
  | "CLAIM_EXPIRED"
  | "CLAIM_INVALID"
  | "TRANSFER_FAILED"
  | "INVALID_RESPONSE";

export class UploadedDesignTransferClientError extends Error {
  readonly code: UploadedDesignTransferClientErrorCode;

  constructor(code: UploadedDesignTransferClientErrorCode, message: string) {
    super(message);
    this.name = "UploadedDesignTransferClientError";
    this.code = code;
  }
}

export interface FirebaseCheckoutIdentity {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export interface UploadedDesignOwnershipClaim {
  claimToken: string;
  expiresAt: string;
}

export interface TrustedUploadedDesignTransferClient {
  createOwnershipClaim(
    draftReference: CustomerDesignUploadReference,
    identity: FirebaseCheckoutIdentity,
  ): Promise<UploadedDesignOwnershipClaim>;
  transferUploadedDesign(input: {
    orderId: string;
    draftReference: CustomerDesignUploadReference;
    ownershipClaimToken?: string;
    identity: FirebaseCheckoutIdentity;
  }): Promise<ImmutableUploadedOrderDesignReference>;
}

type JsonRecord = Record<string, unknown>;

const getErrorCode = (payload: JsonRecord | null): string =>
  typeof payload?.code === "string" ? payload.code : "";

const toClientError = (code: string): UploadedDesignTransferClientErrorCode => {
  if (code === "AUTH_FAILED" || code === "CLAIM_AUTH_REQUIRED") {
    return "AUTH_REQUIRED";
  }
  if (code === "CLAIM_EXPIRED") return "CLAIM_EXPIRED";
  if (
    code === "TRUSTED_OWNERSHIP_CLAIM_INVALID" ||
    code.startsWith("CLAIM_")
  ) {
    return "CLAIM_INVALID";
  }
  return "TRANSFER_FAILED";
};

const parseJson = async (response: Response): Promise<JsonRecord | null> => {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" ? (payload as JsonRecord) : null;
  } catch {
    return null;
  }
};

const request = async (
  path: string,
  body: JsonRecord,
  identity: FirebaseCheckoutIdentity,
): Promise<JsonRecord> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await identity.getIdToken(true)}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new UploadedDesignTransferClientError(
      "TRANSFER_FAILED",
      "The secure design preparation service is temporarily unavailable.",
    );
  }

  const payload = await parseJson(response);
  if (!response.ok || !payload) {
    throw new UploadedDesignTransferClientError(
      toClientError(getErrorCode(payload)),
      "The secure design preparation service could not complete the request.",
    );
  }
  return payload;
};

const isImmutableOrderReference = (
  value: unknown,
): value is ImmutableUploadedOrderDesignReference => {
  if (!value || typeof value !== "object") return false;
  const reference = value as Record<string, unknown>;
  return (
    typeof reference.orderId === "string" &&
    typeof reference.storagePath === "string" &&
    typeof reference.mimeType === "string" &&
    typeof reference.createdAt === "string"
  );
};

const assertImmutableOrderReference = (
  reference: ImmutableUploadedOrderDesignReference,
  identity: FirebaseCheckoutIdentity,
  orderId: string,
  draftReference: CustomerDesignUploadReference,
): ImmutableUploadedOrderDesignReference => {
  const extension = getCustomerDesignImageExtension(draftReference.mimeType);
  const expectedPath = extension
    ? `customer-order-designs/${identity.uid}/${orderId}/${draftReference.designReferenceId}/reference.${extension}`
    : "";
  if (
    reference.orderId !== orderId ||
    reference.storagePath !== expectedPath ||
    reference.mimeType !== draftReference.mimeType
  ) {
    throw new UploadedDesignTransferClientError(
      "INVALID_RESPONSE",
      "The secure design preparation service returned an invalid order reference.",
    );
  }
  return { ...reference };
};

export const customerDesignOrderTransferClient: TrustedUploadedDesignTransferClient = {
  async createOwnershipClaim(draftReference, identity) {
    const payload = await request(
      "/api/orders/create-uploaded-design-ownership-claim",
      { draftReference },
      identity,
    );
    if (
      typeof payload.claimToken !== "string" ||
      typeof payload.expiresAt !== "string" ||
      payload.claimToken.length < 32
    ) {
      throw new UploadedDesignTransferClientError(
        "INVALID_RESPONSE",
        "The secure design authorization could not be prepared.",
      );
    }
    return { claimToken: payload.claimToken, expiresAt: payload.expiresAt };
  },

  async transferUploadedDesign({
    orderId,
    draftReference,
    ownershipClaimToken,
    identity,
  }) {
    const payload = await request(
      "/api/orders/transfer-uploaded-design",
      {
        orderId,
        draftReference,
        ...(ownershipClaimToken ? { ownershipClaimToken } : {}),
      },
      identity,
    );
    if (!isImmutableOrderReference(payload.orderReference)) {
      throw new UploadedDesignTransferClientError(
        "INVALID_RESPONSE",
        "The secure design preparation service returned an invalid order reference.",
      );
    }
    return assertImmutableOrderReference(
      payload.orderReference,
      identity,
      orderId,
      draftReference,
    );
  },
};
