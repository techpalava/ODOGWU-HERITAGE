import { deleteObject, getBlob, ref, uploadBytes, type StorageReference } from "firebase/storage";
import type { CustomerDesignUploadReference } from "../types";
import {
  MAX_CUSTOMER_DESIGN_IMAGE_BYTES,
  MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION,
  createCustomerDesignUploadReference,
  isCustomerDesignDraftStoragePath,
  isCustomerDesignImageMimeType,
} from "./customerDesignUploadReference";
import {
  ensureCustomerUploadIdentity,
  type CustomerUploadIdentity,
} from "./customerDesignUploadIdentity";
import { auth, storage } from "./firebase";

type CustomerDesignImageDimensions = { width: number; height: number };
type CustomerDesignOwner = { uid: string } | null;

export type CustomerDesignUploadErrorCode =
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "IMAGE_DIMENSIONS_TOO_LARGE"
  | "IMAGE_DECODE_FAILED"
  | "UPLOAD_IDENTITY_UNAVAILABLE"
  | "UPLOAD_FAILED"
  | "READ_NOT_AUTHORIZED"
  | "READ_FAILED"
  | "DELETE_NOT_AUTHORIZED"
  | "DELETE_FAILED"
  | "INVALID_DRAFT_REFERENCE";

export class CustomerDesignUploadError extends Error {
  readonly code: CustomerDesignUploadErrorCode;

  constructor(code: CustomerDesignUploadErrorCode, message: string) {
    super(message);
    this.name = "CustomerDesignUploadError";
    this.code = code;
  }
}

export interface CustomerDesignStorageGateway {
  createReference(storagePath: string): StorageReference;
  upload(
    storageReference: StorageReference,
    file: File,
    contentType: string,
  ): Promise<void>;
  readBlob(storageReference: StorageReference): Promise<Blob>;
  remove(storageReference: StorageReference): Promise<void>;
}

export type DecodeCustomerDesignImageDimensions = (
  file: File,
) => Promise<CustomerDesignImageDimensions>;

const firebaseStorageGateway: CustomerDesignStorageGateway = {
  createReference: (storagePath) => ref(storage, storagePath),
  upload: async (storageReference, file, contentType) => {
    await uploadBytes(storageReference, file, { contentType });
  },
  readBlob: (storageReference) => getBlob(storageReference),
  remove: (storageReference) => deleteObject(storageReference),
};

const decodeCustomerDesignImageDimensions: DecodeCustomerDesignImageDimensions = async (
  file,
) => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  if (
    typeof Image === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    throw new Error("Image decoding is unavailable in this environment.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    return await new Promise<CustomerDesignImageDimensions>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.width, height: image.height });
      image.onerror = () => reject(new Error("Image decoding failed."));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const getStorageErrorCode = (error: unknown): string =>
  error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

const validateDraftReference = (
  reference: CustomerDesignUploadReference,
): void => {
  if (!isCustomerDesignDraftStoragePath(reference)) {
    throw new CustomerDesignUploadError(
      "INVALID_DRAFT_REFERENCE",
      "This customer design reference is not a valid private draft.",
    );
  }
};

const ensureCurrentOwner = (
  reference: CustomerDesignUploadReference,
  currentOwner: CustomerDesignOwner,
  code: "READ_NOT_AUTHORIZED" | "DELETE_NOT_AUTHORIZED",
): void => {
  validateDraftReference(reference);
  if (!currentOwner || currentOwner.uid !== reference.ownerUid) {
    throw new CustomerDesignUploadError(
      code,
      "This private customer design belongs to a different Firebase user.",
    );
  }
};

export const validateCustomerDesignFile = async (
  file: File,
  decodeDimensions: DecodeCustomerDesignImageDimensions =
    decodeCustomerDesignImageDimensions,
): Promise<void> => {
  if (!isCustomerDesignImageMimeType(file.type)) {
    throw new CustomerDesignUploadError(
      "UNSUPPORTED_FILE_TYPE",
      "Use a JPEG, PNG, or WebP image for your design.",
    );
  }
  if (file.size > MAX_CUSTOMER_DESIGN_IMAGE_BYTES) {
    throw new CustomerDesignUploadError(
      "FILE_TOO_LARGE",
      "Customer design images must be 5 MB or smaller.",
    );
  }

  let dimensions: CustomerDesignImageDimensions;
  try {
    dimensions = await decodeDimensions(file);
  } catch {
    throw new CustomerDesignUploadError(
      "IMAGE_DECODE_FAILED",
      "The selected image could not be decoded.",
    );
  }

  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    throw new CustomerDesignUploadError(
      "IMAGE_DECODE_FAILED",
      "The selected image could not be decoded.",
    );
  }
  if (
    dimensions.width > MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION ||
    dimensions.height > MAX_CUSTOMER_DESIGN_IMAGE_DIMENSION
  ) {
    throw new CustomerDesignUploadError(
      "IMAGE_DIMENSIONS_TOO_LARGE",
      "Customer design images must be no larger than 4096px on either side.",
    );
  }
};

export interface CustomerDesignDraftReplacementResult {
  reference: CustomerDesignUploadReference;
  previousDraftCleanupError?: CustomerDesignUploadError;
}

export interface CustomerDesignUploadServiceDependencies {
  ensureIdentity?: () => Promise<CustomerUploadIdentity>;
  getCurrentOwner?: () => CustomerDesignOwner;
  decodeDimensions?: DecodeCustomerDesignImageDimensions;
  storageGateway?: CustomerDesignStorageGateway;
  createReference?: typeof createCustomerDesignUploadReference;
}

export const createCustomerDesignUploadService = (
  dependencies: CustomerDesignUploadServiceDependencies = {},
) => {
  const ensureIdentity =
    dependencies.ensureIdentity || ensureCustomerUploadIdentity;
  const getCurrentOwner = dependencies.getCurrentOwner || (() => auth.currentUser);
  const decodeDimensions =
    dependencies.decodeDimensions || decodeCustomerDesignImageDimensions;
  const storageGateway = dependencies.storageGateway || firebaseStorageGateway;
  const createReference =
    dependencies.createReference || createCustomerDesignUploadReference;

  const uploadCustomerDesignDraft = async (
    file: File,
  ): Promise<CustomerDesignUploadReference> => {
    await validateCustomerDesignFile(file, decodeDimensions);

    let identity: CustomerUploadIdentity;
    try {
      identity = await ensureIdentity();
    } catch {
      throw new CustomerDesignUploadError(
        "UPLOAD_IDENTITY_UNAVAILABLE",
        "A secure guest upload identity could not be created. Please try again.",
      );
    }

    const reference = createReference({
      ownerUid: identity.uid,
      mimeType: file.type,
      ...(file.name ? { originalFileName: file.name } : {}),
    });

    try {
      await storageGateway.upload(
        storageGateway.createReference(reference.storagePath),
        file,
        reference.mimeType,
      );
      return reference;
    } catch {
      throw new CustomerDesignUploadError(
        "UPLOAD_FAILED",
        "The customer design could not be uploaded. Please try again.",
      );
    }
  };

  const readCustomerDesignDraft = async (
    reference: CustomerDesignUploadReference,
  ): Promise<Blob> => {
    ensureCurrentOwner(reference, getCurrentOwner(), "READ_NOT_AUTHORIZED");
    try {
      return await storageGateway.readBlob(
        storageGateway.createReference(reference.storagePath),
      );
    } catch {
      throw new CustomerDesignUploadError(
        "READ_FAILED",
        "The private customer design could not be read.",
      );
    }
  };

  const deleteCustomerDesignDraft = async (
    reference: CustomerDesignUploadReference,
  ): Promise<void> => {
    ensureCurrentOwner(reference, getCurrentOwner(), "DELETE_NOT_AUTHORIZED");
    try {
      await storageGateway.remove(
        storageGateway.createReference(reference.storagePath),
      );
    } catch (error) {
      if (getStorageErrorCode(error) === "storage/object-not-found") return;
      throw new CustomerDesignUploadError(
        "DELETE_FAILED",
        "The previous customer design could not be deleted.",
      );
    }
  };

  const replaceCustomerDesignDraft = async (
    previousReference: CustomerDesignUploadReference,
    replacementFile: File,
  ): Promise<CustomerDesignDraftReplacementResult> => {
    await validateCustomerDesignFile(replacementFile, decodeDimensions);
    ensureCurrentOwner(
      previousReference,
      getCurrentOwner(),
      "DELETE_NOT_AUTHORIZED",
    );

    const reference = await uploadCustomerDesignDraft(replacementFile);
    try {
      await deleteCustomerDesignDraft(previousReference);
      return { reference };
    } catch (error) {
      if (error instanceof CustomerDesignUploadError) {
        return { reference, previousDraftCleanupError: error };
      }
      throw error;
    }
  };

  return {
    validateCustomerDesignFile: (file: File) =>
      validateCustomerDesignFile(file, decodeDimensions),
    uploadCustomerDesignDraft,
    readCustomerDesignDraft,
    deleteCustomerDesignDraft,
    replaceCustomerDesignDraft,
  };
};

export const CustomerDesignUploadService = createCustomerDesignUploadService();
