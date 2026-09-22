import type { DesignStyleStepOccurrencePresentation } from "./designStyleStepRuntime";
import type { GarmentDesignStyleAssignmentV2 } from "./garmentScopedDesignStyleAssignment";

export interface DesignStyleOccurrenceUploadPreviewState {
  readonly status: "idle" | "pending" | "success" | "error";
  readonly message?: string;
  readonly previewUrl?: string | null;
  readonly uploadedSourceRef?: string | null;
  readonly sourceKey?: string | null;
}

export const uploadPreviewMatchesUploadedAssignment = ({
  assignment,
  uploadState,
}: {
  assignment: GarmentDesignStyleAssignmentV2 | null;
  uploadState: DesignStyleOccurrenceUploadPreviewState;
}): boolean => {
  if (assignment?.sourceKind !== "uploaded") return false;
  const uploadedSourceRef = uploadState.uploadedSourceRef?.trim();
  const sourceKey = uploadState.sourceKey?.trim();
  if (uploadedSourceRef) {
    return uploadedSourceRef === assignment.uploadedSourceRef;
  }
  if (sourceKey) {
    return sourceKey === assignment.sourceKey;
  }
  return (
    uploadState.status === "pending" ||
    uploadState.status === "success" ||
    uploadState.status === "error"
  );
};

export const resolveUploadedOccurrenceSelectedPreviewUrl = ({
  matchingLiveUploadPreviewUrl,
  retainedActivePreviewUrl,
  restoredPreviewUrl,
}: {
  matchingLiveUploadPreviewUrl?: string | null;
  retainedActivePreviewUrl?: string | null;
  restoredPreviewUrl?: string | null;
}): string | null =>
  matchingLiveUploadPreviewUrl?.trim() ||
  retainedActivePreviewUrl?.trim() ||
  restoredPreviewUrl?.trim() ||
  null;

export const resolveDesignStyleOccurrenceCardPreview = ({
  occurrence,
  uploadState,
  selectedDesignPreviewByOccurrenceToken = {},
}: {
  occurrence: DesignStyleStepOccurrencePresentation;
  uploadState: DesignStyleOccurrenceUploadPreviewState;
  selectedDesignPreviewByOccurrenceToken?: Readonly<Record<string, string>>;
}): { readonly image: string | null; readonly alt: string } => {
  const assignment = occurrence.assignment;
  const catalogueAlt = `${occurrence.assignmentLabel || "Selected"} design for ${occurrence.label}`;
  const uploadedAlt = `Uploaded design preview for ${occurrence.label}`;

  if (!assignment) {
    return { image: null, alt: catalogueAlt };
  }

  if (assignment.sourceKind === "catalog") {
    return {
      image: occurrence.assignmentImage?.trim() || null,
      alt: catalogueAlt,
    };
  }

  const matchingUploadPreview = uploadPreviewMatchesUploadedAssignment({
    assignment,
    uploadState,
  })
    ? uploadState.previewUrl?.trim() || null
    : null;
  const tokenPreview =
    selectedDesignPreviewByOccurrenceToken[occurrence.target.occurrenceToken]?.trim() ||
    null;

  return {
    image: matchingUploadPreview || tokenPreview || null,
    alt: uploadedAlt,
  };
};
