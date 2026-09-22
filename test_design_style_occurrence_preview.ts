import assert from "node:assert/strict";
import type { DesignStyleStepOccurrencePresentation } from "./src/utils/designStyleStepRuntime";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  resolveDesignStyleOccurrenceCardPreview,
  resolveUploadedOccurrenceSelectedPreviewUrl,
  uploadPreviewMatchesUploadedAssignment,
} from "./src/utils/designStyleOccurrencePreview";

const shirtToken = createPhysicalGarmentOccurrenceIdentityToken({
  garmentKey: "base:shirt:1",
  generation: 1,
});

const catalogueOccurrence = (
  overrides: Partial<DesignStyleStepOccurrencePresentation> = {},
): DesignStyleStepOccurrencePresentation => ({
  target: { garmentKey: "base:shirt:1", occurrenceToken: shirtToken },
  garmentType: "shirt",
  label: "Shirt",
  status: "complete",
  assignment: {
    garmentKey: "base:shirt:1",
    occurrenceToken: shirtToken,
    assignmentRevision: 1,
    sourceKind: "catalog",
    sourceKey: "catalog:style-c",
    catalogStyleId: "style-c",
    eligibilityFingerprint: "style-c:eligibility:v1",
  },
  assignmentLabel: "Catalogue C",
  assignmentImage: "https://catalogue.example/c.png",
  ...overrides,
});

const uploadedOccurrence = (
  sourceRef = "private-upload-reference-a",
): DesignStyleStepOccurrencePresentation => ({
  target: { garmentKey: "base:shirt:1", occurrenceToken: shirtToken },
  garmentType: "shirt",
  label: "Shirt",
  status: "complete",
  assignment: {
    garmentKey: "base:shirt:1",
    occurrenceToken: shirtToken,
    assignmentRevision: 1,
    sourceKind: "uploaded",
    sourceKey: `uploaded:${sourceRef}`,
    uploadedSourceRef: sourceRef,
  },
  assignmentLabel: "Uploaded design",
  assignmentImage: null,
});

{
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: catalogueOccurrence(),
    uploadState: {
      status: "success",
      previewUrl: "blob:upload-a",
      uploadedSourceRef: "private-upload-reference-a",
      sourceKey: "uploaded:private-upload-reference-a",
    },
  });
  assert.equal(preview.image, "https://catalogue.example/c.png");
  assert.match(preview.alt, /Catalogue C design for Shirt/);
}

{
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: {
      ...catalogueOccurrence(),
      assignment: null,
      assignmentLabel: null,
      assignmentImage: null,
      status: "incomplete",
    },
    uploadState: { status: "success", previewUrl: "blob:upload-a" },
    selectedDesignPreviewByOccurrenceToken: { [shirtToken]: "blob:token-a" },
  });
  assert.equal(preview.image, null);
}

{
  const assignment = uploadedOccurrence().assignment;
  assert.equal(
    uploadPreviewMatchesUploadedAssignment({
      assignment,
      uploadState: {
        status: "success",
        previewUrl: "blob:upload-a",
        uploadedSourceRef: "private-upload-reference-a",
      },
    }),
    true,
  );
  assert.equal(
    uploadPreviewMatchesUploadedAssignment({
      assignment,
      uploadState: {
        status: "success",
        previewUrl: "blob:upload-b",
        uploadedSourceRef: "private-upload-reference-b",
      },
    }),
    false,
  );
}

{
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: uploadedOccurrence("private-upload-reference-a"),
    uploadState: {
      status: "pending",
      previewUrl: "blob:upload-a",
      uploadedSourceRef: "private-upload-reference-a",
      sourceKey: "uploaded:private-upload-reference-a",
    },
  });
  assert.equal(preview.image, "blob:upload-a");
  assert.match(preview.alt, /Uploaded design preview for Shirt/);
}

{
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: uploadedOccurrence("private-upload-reference-b"),
    uploadState: {
      status: "success",
      previewUrl: "blob:upload-b",
      uploadedSourceRef: "private-upload-reference-b",
      sourceKey: "uploaded:private-upload-reference-b",
    },
  });
  assert.equal(preview.image, "blob:upload-b");
}

{
  assert.equal(
    resolveUploadedOccurrenceSelectedPreviewUrl({
      matchingLiveUploadPreviewUrl: null,
      retainedActivePreviewUrl: null,
      restoredPreviewUrl: "blob:restored-a",
    }),
    "blob:restored-a",
  );
}

console.log("PASS: source-aware Design Style occurrence preview selection");
