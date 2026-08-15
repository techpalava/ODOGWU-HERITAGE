import type { CustomerDesignUploadReference } from "../types";

export type UploadedDesignDeletionResult =
  | { status: "deleted" }
  | { status: "failed"; error: unknown };

export const deleteUploadedDesignBeforeSourceChange = async ({
  reference,
  deleteDraft,
  commitSourceChange,
}: {
  reference: CustomerDesignUploadReference;
  deleteDraft: (reference: CustomerDesignUploadReference) => Promise<void>;
  commitSourceChange: () => void;
}): Promise<UploadedDesignDeletionResult> => {
  try {
    await deleteDraft(reference);
  } catch (error) {
    return { status: "failed", error };
  }

  commitSourceChange();
  return { status: "deleted" };
};
