import type { CustomerDesignUploadReference } from "../types";
import {
  isCustomerDesignDraftStoragePath,
  isCustomerDesignImageMimeType,
} from "./customerDesignUploadReference";

export type CustomerDesignDraftTransferClientErrorCode =
  | "AUTH_REQUIRED"
  | "CLAIM_INVALID"
  | "TRANSFER_FAILED"
  | "INVALID_RESPONSE";

export class CustomerDesignDraftTransferClientError extends Error {
  readonly code: CustomerDesignDraftTransferClientErrorCode;

  constructor(
    code: CustomerDesignDraftTransferClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CustomerDesignDraftTransferClientError";
    this.code = code;
  }
}

export interface CustomerDesignDraftTransferIdentity {
  uid: string;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

export interface TrustedCustomerDesignDraftTransferClient {
  transferDraftOwnership(input: {
    draftReference: CustomerDesignUploadReference;
    ownershipClaimToken: string;
    identity: CustomerDesignDraftTransferIdentity;
  }): Promise<CustomerDesignUploadReference>;
}

type JsonRecord = Record<string, unknown>;

const getErrorCode = (payload: JsonRecord | null): string =>
  typeof payload?.code === "string" ? payload.code : "";

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

const toErrorCode = (
  serverCode: string,
): CustomerDesignDraftTransferClientErrorCode => {
  if (serverCode === "AUTH_FAILED") return "AUTH_REQUIRED";
  if (serverCode.includes("CLAIM")) return "CLAIM_INVALID";
  return "TRANSFER_FAILED";
};

const isTransferredReference = (
  value: unknown,
  identity: CustomerDesignDraftTransferIdentity,
  source: CustomerDesignUploadReference,
): value is CustomerDesignUploadReference => {
  if (!value || typeof value !== "object") return false;
  const reference = value as Partial<CustomerDesignUploadReference>;
  return (
    reference.designReferenceId === source.designReferenceId &&
    reference.ownerUid === identity.uid &&
    reference.mimeType === source.mimeType &&
    typeof reference.storagePath === "string" &&
    typeof reference.createdAt === "string" &&
    isCustomerDesignImageMimeType(reference.mimeType || "") &&
    isCustomerDesignDraftStoragePath(reference as CustomerDesignUploadReference)
  );
};

export const customerDesignDraftOwnershipTransferClient: TrustedCustomerDesignDraftTransferClient = {
  async transferDraftOwnership({
    draftReference,
    ownershipClaimToken,
    identity,
  }) {
    let response: Response;
    try {
      response = await fetch(
        "/api/design-studio/transfer-uploaded-design-draft",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await identity.getIdToken(true)}`,
          },
          body: JSON.stringify({ draftReference, ownershipClaimToken }),
        },
      );
    } catch {
      throw new CustomerDesignDraftTransferClientError(
        "TRANSFER_FAILED",
        "Secure uploaded-design ownership transfer is temporarily unavailable.",
      );
    }

    const payload = await parseJson(response);
    if (!response.ok || !payload) {
      throw new CustomerDesignDraftTransferClientError(
        toErrorCode(getErrorCode(payload)),
        "Secure uploaded-design ownership transfer could not be completed.",
      );
    }
    if (!isTransferredReference(payload.draftReference, identity, draftReference)) {
      throw new CustomerDesignDraftTransferClientError(
        "INVALID_RESPONSE",
        "Secure uploaded-design ownership transfer returned an invalid reference.",
      );
    }
    return { ...payload.draftReference };
  },
};
