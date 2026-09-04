import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import {
  createDesignStyleUploadOperationState,
  type DesignStyleUploadOperationState,
} from "./src/utils/designStyleUploadOperation";
import {
  applyDesignStyleUploadForActiveOccurrence,
  beginDesignStyleUploadForActiveOccurrence,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleOccurrences,
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "skirt"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const style = (id: string, name: string): StyleCategory => ({
  id,
  name,
  description: `${name} upload UI test style.`,
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("skirt"),
  ],
});

const catalogueStyle = style("upload-ui-catalogue", "Catalogue Shirt");
const repeatedTestOccurrences = createDesignStyleOccurrences(["shirt", "skirt"]);
const shirtTarget = {
  garmentKey: repeatedTestOccurrences[0].garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: repeatedTestOccurrences[0].garmentKey,
    generation: repeatedTestOccurrences[0].occurrenceGeneration!,
  }),
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const render = (
  model: ReturnType<typeof createDesignStyleStepTestModel>,
  overrides: Record<string, unknown> = {},
) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        ...createDesignStyleStepRenderProps(model),
        ...overrides,
      }),
    );
  });
  return renderer;
};

const uploadedInput = {
  sourceKey: "uploaded:upload-ui-source",
  uploadedSourceRef: "upload-ui-source",
};

// A. The active Shirt owns the native file input, and the production runtime
// bridge applies an accepted uploaded source to Shirt without changing Skirt.
{
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
  });
  assert.ok(model.activeTarget);
  const selected: Array<{ target: typeof model.activeTarget; file: File }> = [];
  const renderer = render(model, {
    onSelectUploadFile: (target: typeof model.activeTarget, file: File) =>
      selected.push({ target, file }),
  });
  const input = renderer.root.findByProps({ type: "file" });
  assert.equal(input.props.accept, "image/jpeg,image/png,image/webp");
  assert.match(textContent(renderer.root), /Upload a design for Shirt/i);
  const file = { name: "shirt.png", type: "image/png" } as File;
  act(() => {
    input.props.onChange({
      currentTarget: { files: [file], value: "C:\\fakepath\\shirt.png" },
    });
  });
  assert.equal(selected.length, 1);
  assert.deepEqual(selected[0].target, model.activeTarget);
  assert.equal(selected[0].file, file);

  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const started = beginDesignStyleUploadForActiveOccurrence({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
  });
  assert.equal(started.status, "begun");
  if (started.status !== "begun") throw new Error("UPLOAD_OPERATION_NOT_BEGUN");
  assert.equal(started.ledger, ledger);
  const applied = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
    source: uploadedInput,
  });
  assert.equal(applied.status, "accepted");
  assert.equal(applied.assignmentResult.status, "applied");
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[model.activeTarget.garmentKey]
      ?.sourceKind,
    "uploaded",
  );
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[model.occurrences[1].garmentKey],
    undefined,
  );
  act(() => renderer.unmount());
}

// B. A catalogue assignment remains visible during pending work and is
// replaced only after the matching occurrence operation succeeds.
{
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
    occurrences: repeatedTestOccurrences,
    activeTarget: shirtTarget,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": catalogueStyle.id,
    },
  });
  assert.ok(model.activeTarget);
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const previousAssignment =
    ledger.assignmentsByGarmentKey[model.activeTarget.garmentKey];
  const renderer = render(model, {
    onSelectUploadFile: () => undefined,
    uploadState: { status: "pending" },
  });
  assert.match(textContent(renderer.root), /Catalogue Shirt/);
  assert.match(textContent(renderer.root), /current design and preview stay in place/i);
  assert.match(textContent(renderer.root), /Preparing your uploaded design for Shirt/i);

  const started = beginDesignStyleUploadForActiveOccurrence({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "replace",
  });
  assert.equal(started.status, "begun");
  if (started.status !== "begun") throw new Error("UPLOAD_OPERATION_NOT_BEGUN");
  assert.equal(
    started.ledger.assignmentsByGarmentKey[model.activeTarget.garmentKey],
    previousAssignment,
  );
  const applied = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "replace",
    source: uploadedInput,
  });
  assert.equal(applied.status, "accepted");
  assert.equal(applied.assignmentResult.status, "applied");
  assert.equal(
    applied.ledger.assignmentsByGarmentKey[model.activeTarget.garmentKey]
      ?.sourceKind,
    "uploaded",
  );
  act(() => renderer.unmount());
}

// C. Failure is retryable and non-destructive in the UI: the catalogue target
// and sibling occurrence presentation remain intact without fabricated upload.
{
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
    occurrences: repeatedTestOccurrences,
    activeTarget: shirtTarget,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": catalogueStyle.id,
      "base:skirt:1": catalogueStyle.id,
    },
  });
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const before = ledger.assignmentsByGarmentKey;
  const renderer = render(model, {
    onSelectUploadFile: () => undefined,
    uploadState: {
      status: "error",
      message: "The upload failed. Your previous selection is unchanged. Try again.",
    },
  });
  assert.match(textContent(renderer.root), /previous selection is unchanged/i);
  assert.equal(renderer.root.findAllByProps({ role: "alert" }).length >= 1, true);
  assert.equal(ledger.assignmentsByGarmentKey, before);
  assert.equal(
    Object.values(ledger.assignmentsByGarmentKey).some(
      (assignment) => assignment.sourceKind === "uploaded",
    ),
    false,
  );
  act(() => renderer.unmount());
}

// D. A callback captured for Shirt is rejected if the active target changes to
// Skirt, and it cannot retarget the upload.
{
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
    occurrences: repeatedTestOccurrences,
    activeTarget: shirtTarget,
  });
  assert.ok(model.activeTarget);
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const started = beginDesignStyleUploadForActiveOccurrence({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
  });
  assert.equal(started.status, "begun");
  if (started.status !== "begun") throw new Error("UPLOAD_OPERATION_NOT_BEGUN");
  const skirtTarget = model.projection.occurrences[1].target;
  const rejected = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: skirtTarget,
    operationKind: "assign",
    source: uploadedInput,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reason, "wrong-target");
  assert.equal(rejected.ledger, ledger);
  assert.equal(rejected.ledger.assignmentsByGarmentKey[skirtTarget.garmentKey], undefined);
}

// E. The integration bridge retains Task 5E-A's newer-operation protection.
{
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
  });
  assert.ok(model.activeTarget);
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  let state: DesignStyleUploadOperationState =
    createDesignStyleUploadOperationState();
  const first = beginDesignStyleUploadForActiveOccurrence({
    state,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
  });
  assert.equal(first.status, "begun");
  if (first.status !== "begun") throw new Error("UPLOAD_OPERATION_NOT_BEGUN");
  state = first.state;
  const second = beginDesignStyleUploadForActiveOccurrence({
    state,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
  });
  assert.equal(second.status, "begun");
  if (second.status !== "begun") throw new Error("UPLOAD_OPERATION_NOT_BEGUN");
  const stale = applyDesignStyleUploadForActiveOccurrence({
    state: second.state,
    ticket: first.ticket,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
    source: uploadedInput,
  });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reason, "stale-operation-generation");
  const current = applyDesignStyleUploadForActiveOccurrence({
    state: second.state,
    ticket: second.ticket,
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    operationKind: "assign",
    source: uploadedInput,
  });
  assert.equal(current.status, "accepted");
  assert.equal(current.assignmentResult.status, "applied");
}

// F. An existing uploaded assignment keeps its preview while detach remains
// distinct from physical source deletion.
{
  const reference = createCustomerDesignUploadReference({
    ownerUid: "upload-ui-owner",
    mimeType: "image/png",
    designReferenceId: "upload-ui-read-only",
    createdAt: "2026-09-04T12:00:00.000Z",
  });
  const source = createUploadedDesignSource({
    uploadReference: reference,
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
    demographic: "male",
  });
  const model = createDesignStyleStepTestModel({
    styles: [catalogueStyle],
    garmentTypeSelection: selection,
    occurrences: repeatedTestOccurrences,
    activeTarget: shirtTarget,
    uploadedSource: source,
    uploadedAssignmentGarmentKeys: ["base:shirt:1"],
    confirmedUploadedSourceKey: source.sourceKey,
    expectedUploadOwnerUid: reference.ownerUid,
  });
  const renderer = render(model, {
    onSelectUploadFile: () => undefined,
    uploadState: {
      status: "success",
      previewUrl: "blob:upload-ui-read-only",
    },
  });
  assert.equal(renderer.root.findAllByProps({ type: "file" }).length, 1);
  assert.match(
    String(renderer.root.findByProps({ type: "file" }).props["aria-label"]),
    /Replace uploaded design for Shirt/i,
  );
  assert.equal(renderer.root.findAllByType("img").some((image) =>
    String(image.props.alt).includes("Uploaded design preview for Shirt")), true);
  const text = textContent(renderer.root);
  assert.match(text, /Removing this assignment keeps the uploaded source available/i);
  assert.match(text, /Remove uploaded design from Shirt/i);
  assert.doesNotMatch(text, /Delete upload|Clear uploaded|Remove source/i);
  act(() => renderer.unmount());
}

// Production wiring boundary: the active-occurrence handler reuses the released
// validator/uploader and canonical source builder, applies only through Task
// 5E-A, and does not write retired scalar Step 3 authority.
{
  const source = readFileSync(
    new URL("./src/components/DesignStudioView.tsx", import.meta.url),
    "utf8",
  );
  const handler = source.match(
    /const handleFutureDesignStyleUploadFile[\s\S]*?\n  const isStageHistoricallyUnlocked/,
  )?.[0];
  assert.ok(handler, "Expected active-occurrence upload handler wiring.");
  assert.match(handler, /beginDesignStyleUploadForActiveOccurrence/);
  assert.match(handler, /runUploadedDesignOperation/);
  assert.match(handler, /validateCustomerDesignFile/);
  assert.match(handler, /uploadCustomerDesignDraft/);
  assert.match(handler, /createUploadedDesignSourceWhenReady/);
  assert.match(handler, /applyDesignStyleUploadForActiveOccurrence/);
  assert.match(handler, /applyFutureDesignStyleMutationLedger/);
  assert.doesNotMatch(handler, /setFutureSelectedStyleId/);
  assert.doesNotMatch(handler, /setFutureDesignSource/);
  assert.doesNotMatch(handler, /setFutureConfirmedDesignSourceKey/);
  assert.doesNotMatch(handler, /setFuturePriceActivatedFabricCode/);
  assert.doesNotMatch(handler, /replaceCustomerDesignDraft|deleteCustomerDesignDraft/);
}

console.log(
  "PASS: active-occurrence Design Style upload selection, preview, and stale-callback integration",
);
