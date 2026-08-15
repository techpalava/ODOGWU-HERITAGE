import assert from "node:assert/strict";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import { deleteUploadedDesignBeforeSourceChange } from "./src/utils/uploadedDesignDeletionOrchestration";

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

const findButton = (
  renderer: ReactTestRenderer,
  predicate: (button: ReactTestInstance) => boolean,
) => renderer.root.findAllByType("button").find(predicate);

const callbacks = {
  selectStyleCalls: 0,
  removeCalls: 0,
  retryCalls: 0,
};

const renderStep = ({
  isDeleting,
  error,
}: {
  isDeleting: boolean;
  error: string;
}) => (
  <DormantFutureDesignStyleStep
    styles={[catalogStyle]}
    garmentTypeSelection={garmentTypeSelection}
    selectedStyleId={null}
    stagePrice={65}
    uploadedDesign={{
      source: uploadedSource,
      reference: uploadReference,
      composition: uploadedSource.fabricCapacityComposition,
      demographic: "male",
      previewUrl: "blob:private-uploaded-design-preview",
      error,
      isUploading: false,
      isReplacing: false,
      isDeleting,
      isLoadingPreview: false,
      isConfirmed: false,
      isPricingActive: false,
    }}
    pendingCatalogStyleName="Heritage Senator Set"
    onSelectStyle={() => {
      callbacks.selectStyleCalls += 1;
    }}
    onUploadDesignFile={() => undefined}
    onToggleUploadedGarment={() => undefined}
    onUploadedDemographicChange={() => undefined}
    onRemoveUploadedDesign={() => {
      callbacks.removeCalls += 1;
    }}
    onRetryUploadedDesignDeletion={() => {
      callbacks.retryCalls += 1;
    }}
    onContinueUploadedDesign={() => undefined}
    onBack={() => undefined}
    onReturnToGarmentType={() => undefined}
    onContinue={() => undefined}
  />
);

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

let renderer!: ReactTestRenderer;
await act(async () => {
  renderer = create(renderStep({ isDeleting: true, error: "" }));
});

const uploadPanel = renderer.root.findByProps({
  "data-testid": "upload-your-design-panel",
});
assert.equal(uploadPanel.props["aria-busy"], true);
assert.equal(
  renderer.root.findByProps({ alt: "Your uploaded design reference" }).props
    .src,
  "blob:private-uploaded-design-preview",
);
assert.equal(
  findButton(
    renderer,
    (button) =>
      button.props["aria-label"] ===
      "Select Heritage Senator Set design style",
  )?.props.disabled,
  true,
);
assert(
  renderer.root.findAllByType("input").every((input) => input.props.disabled),
  "Every conflicting uploaded-source input must be disabled while deletion is pending.",
);
assert.equal(
  findButton(renderer, (button) =>
    textContent(button).includes("Deleting..."),
  )?.props.disabled,
  true,
);
assert.equal(
  findButton(
    renderer,
    (button) =>
      button.props["aria-label"] ===
      "Continue with Uploaded Design to Fabric",
  )?.props.disabled,
  true,
);

await act(async () => {
  renderer.update(
    renderStep({
      isDeleting: false,
      error: "We could not delete your private design. Please try again.",
    }),
  );
});

assert.equal(
  renderer.root.findByProps({ alt: "Your uploaded design reference" }).props
    .src,
  "blob:private-uploaded-design-preview",
);
assert.match(
  textContent(renderer.root.findByProps({ role: "alert" })),
  /could not delete your private design/i,
);

const retryButton = findButton(
  renderer,
  (button) =>
    button.props["aria-label"] ===
    "Retry deleting uploaded design and switch to Heritage Senator Set",
);
assert(retryButton);
assert.equal(retryButton.props.disabled, false);
await act(async () => retryButton.props.onClick());
assert.equal(callbacks.retryCalls, 1);

const deleteButton = findButton(renderer, (button) =>
  textContent(button).includes("Delete Image"),
);
assert(deleteButton);
assert.equal(deleteButton.props.disabled, false);
await act(async () => deleteButton.props.onClick());
assert.equal(callbacks.removeCalls, 1);
assert.equal(callbacks.selectStyleCalls, 0);

await act(async () => renderer.unmount());

console.log(
  "PASS: uploaded-design deletion keeps the source active and exposes retry/delete after rejection",
);
