import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import { deleteUploadedDesignBeforeSourceChange } from "./src/utils/uploadedDesignDeletionOrchestration";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "uploaded-design-delete-owner",
  mimeType: "image/png",
  designReferenceId: "uploaded-design-delete-reference",
  originalFileName: "private-reference.png",
  createdAt: "2026-08-15T12:00:00.000Z",
});

const uploadedSource = createUploadedDesignSource({
  uploadReference,
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
  demographic: "male",
});

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  demographic: "male",
  constructionByGarment: {},
};

const catalogStyle: StyleCategory = {
  id: "heritage-senator-set",
  name: "Heritage Senator Set",
  description: "A compatible catalogue design.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
};

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children.map((child) => textContent(child)).join("");

// The secure deletion coordinator still preserves the upload until deletion
// succeeds and commits the source change exactly once.
{
  let source = "uploaded";
  let preview = "blob:private-uploaded-design-preview";
  let commitCalls = 0;
  const rejected = await deleteUploadedDesignBeforeSourceChange({
    reference: uploadReference,
    deleteDraft: async () => {
      throw new Error("storage unavailable");
    },
    commitSourceChange: () => {
      source = "catalog";
      preview = "";
      commitCalls += 1;
    },
  });

  assert.equal(rejected.status, "failed");
  assert.equal(source, "uploaded");
  assert.equal(preview, "blob:private-uploaded-design-preview");
  assert.equal(commitCalls, 0);

  const retried = await deleteUploadedDesignBeforeSourceChange({
    reference: uploadReference,
    deleteDraft: async () => undefined,
    commitSourceChange: () => {
      source = "catalog";
      preview = "";
      commitCalls += 1;
    },
  });

  assert.equal(retried.status, "deleted");
  assert.equal(source, "catalog");
  assert.equal(preview, "");
  assert.equal(commitCalls, 1);
}

const renderUploadedAssignment = async (confirmed: boolean) => {
  const model = createDesignStyleStepTestModel({
    styles: [catalogStyle],
    garmentTypeSelection,
    uploadedSource,
    uploadedAssignmentGarmentKeys: ["base:shirt:1"],
    confirmedUploadedSourceKey: confirmed ? uploadedSource.sourceKey : null,
    expectedUploadOwnerUid: uploadReference.ownerUid,
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(model)}
      />,
    );
  });
  return { renderer, model };
};

// Task 5D shows an existing confirmed upload assignment as occurrence-scoped,
// read-only evidence. Task 5E owns reconnecting secure upload mutations.
{
  const { renderer, model } = await renderUploadedAssignment(true);
  const text = textContent(renderer.root);
  assert.equal(model.projection.isComplete, true);
  assert.match(text, /Current assignment:\s*Uploaded design/);
  assert.match(
    text,
    /Removing this assignment keeps the uploaded source available/i,
  );
  assert.equal(
    renderer.root.findAll((node) => {
      return (
        node.type === "button" &&
        typeof node.props["aria-label"] === "string" &&
        node.props["aria-label"].startsWith("Remove uploaded design from")
      );
    }).length,
    1,
    "Each confirmed uploaded assignment should expose an occurrence-scoped remove action.",
  );
  assert.equal(
    renderer.root.findAllByType("input").length,
    0,
    "No legacy upload mutation input may be reconnected by Task 5D.",
  );
  assert.equal(text.includes("Delete Image"), false);
  assert.equal(text.includes("Retry deleting"), false);
  assert.equal(text.includes(uploadReference.storagePath), false);
  assert.equal(text.includes(uploadReference.designReferenceId), false);
  assert.equal(text.includes("blob:private-uploaded-design-preview"), false);
  assert.equal(
    renderer.root
      .findByProps({ "data-testid": "future-design-style-continue-action" })
      .findByType("button").props.disabled,
    false,
  );
}

// A pending upload authority preserves identity but cannot satisfy completion.
{
  const { renderer, model } = await renderUploadedAssignment(false);
  assert.equal(model.projection.isComplete, false);
  assert.equal(model.projection.occurrences[0]?.status, "upload_pending");
  assert.match(textContent(renderer.root), /Upload pending/);
  assert.equal(
    renderer.root
      .findByProps({ "data-testid": "future-design-style-continue-action" })
      .findByType("button").props.disabled,
    true,
  );
}

console.log(
  "PASS: uploaded deletion remains secure and Task 5D upload assignments are read-only",
);
