import { v4 as uuidv4 } from "uuid";
import type {
  CustomerDesignImageMimeType,
  CustomerDesignUploadReference,
} from "../types.js";

export const CUSTOMER_DESIGN_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly CustomerDesignImageMimeType[];

export const MAX_CUSTOMER_DESIGN_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION = 4096;

const CUSTOMER_DESIGN_IMAGE_EXTENSION_BY_MIME: Record<
  CustomerDesignImageMimeType,
  "jpg" | "png" | "webp"
> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const hasSafePathSegment = (value: string): boolean =>
  Boolean(value) && !/[\\/]/.test(value);

export const getCustomerDesignImageExtension = (
  mimeType: string,
): "jpg" | "png" | "webp" | null =>
  CUSTOMER_DESIGN_IMAGE_EXTENSION_BY_MIME[
    mimeType as CustomerDesignImageMimeType
  ] || null;

export const isCustomerDesignImageMimeType = (
  mimeType: string,
): mimeType is CustomerDesignImageMimeType =>
  getCustomerDesignImageExtension(mimeType) !== null;

export const createCustomerDesignReferenceId = (): string => uuidv4();

export const isCustomerDesignDraftStoragePath = (
  reference: CustomerDesignUploadReference,
): boolean => {
  if (
    !hasSafePathSegment(reference.ownerUid) ||
    !hasSafePathSegment(reference.designReferenceId)
  ) {
    return false;
  }

  const extension = getCustomerDesignImageExtension(reference.mimeType);
  return (
    extension !== null &&
    reference.storagePath ===
      `customer-design-drafts/${reference.ownerUid}/${reference.designReferenceId}/original.${extension}`
  );
};

export const createCustomerDesignUploadReference = ({
  ownerUid,
  mimeType,
  originalFileName,
  designReferenceId = createCustomerDesignReferenceId(),
  createdAt = new Date().toISOString(),
}: {
  ownerUid: string;
  mimeType: string;
  originalFileName?: string;
  designReferenceId?: string;
  createdAt?: string;
}): CustomerDesignUploadReference => {
  if (!isCustomerDesignImageMimeType(mimeType)) {
    throw new TypeError("Unsupported customer design image type.");
  }
  const extension = getCustomerDesignImageExtension(mimeType);
  if (!hasSafePathSegment(ownerUid) || !hasSafePathSegment(designReferenceId)) {
    throw new TypeError("Customer design references require safe path segments.");
  }

  return {
    designReferenceId,
    ownerUid,
    storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.${extension}`,
    mimeType,
    ...(originalFileName ? { originalFileName } : {}),
    createdAt,
  };
};
