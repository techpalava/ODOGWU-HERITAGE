import type { CustomerDesignUploadReference } from "../types";

export type UploadedDesignDeletionResult =
  | { status: "deleted" }
  | { status: "failed"; error: unknown };

/** Low-level physical deletion only; it never mutates Design Style state. */
export const deleteUploadedDesignCanonicalSource = async ({
  reference,
  deleteDraft,
}: {
  reference: CustomerDesignUploadReference;
  deleteDraft: (reference: CustomerDesignUploadReference) => Promise<void>;
}): Promise<UploadedDesignDeletionResult> => {
  try {
    await deleteDraft(reference);
    return { status: "deleted" };
  } catch (error) {
    return { status: "failed", error };
  }
};

export const deleteUploadedDesignBeforeSourceChange = async ({
  reference,
  deleteDraft,
  commitSourceChange,
}: {
  reference: CustomerDesignUploadReference;
  deleteDraft: (reference: CustomerDesignUploadReference) => Promise<void>;
  commitSourceChange: () => void;
}): Promise<UploadedDesignDeletionResult> => {
  const deletion = await deleteUploadedDesignCanonicalSource({
    reference,
    deleteDraft,
  });
  if (deletion.status === "failed") return deletion;

  commitSourceChange();
  return { status: "deleted" };
};
