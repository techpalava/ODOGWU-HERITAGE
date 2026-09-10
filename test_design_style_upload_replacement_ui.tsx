import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  CanonicalPhysicalGarmentType,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { createUploadedDesignSource, type PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  assignUploadedDesignStyleToGarmentOccurrence,
  createEmptyGarmentScopedDesignStyleAssignmentLedger,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import {
  createDesignStyleUploadOperationState,
  failDesignStyleUploadOperation,
  type DesignStyleUploadOperationState,
} from "./src/utils/designStyleUploadOperation";
import {
  applyDesignStyleUploadForActiveOccurrence,
  beginDesignStyleUploadForActiveOccurrence,
} from "./src/utils/designStyleStepRuntime";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  createDesignStyleOccurrences,
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "skirt"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const style: StyleCategory = {
  id: "replacement-sibling-style",
  name: "Sibling Catalogue Style",
  description: "Focused replacement test style.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("skirt"),
  ],
};

const occurrences = createDesignStyleOccurrences(["shirt", "skirt"]);
const targetFor = (
  occurrence: PhysicalGarmentOccurrence,
): GarmentDesignStyleAssignmentTarget => ({
  garmentKey: occurrence.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: occurrence.garmentKey,
    generation: occurrence.occurrenceGeneration!,
  }),
});
const shirtTarget = targetFor(occurrences[0]);

const reference = (id: string) =>
  createCustomerDesignUploadReference({
    ownerUid: "replacement-owner",
    mimeType: "image/png",
    designReferenceId: id,
    createdAt: "2026-09-04T12:00:00.000Z",
  });

const source = (id: string, garments: CanonicalPhysicalGarmentType[] = ["shirt"]) =>
  createUploadedDesignSource({
    uploadReference: reference(id),
    fabricCapacityComposition: garments.map(createStyleBaseGarmentSpec),
    demographic: "male",
  });

const sourceA = source("replacement-source-a");
const sourceBInput = {
  sourceKey: "uploaded:replacement-source-b",
  uploadedSourceRef: "replacement-source-b",
};
const sourceCInput = {
  sourceKey: "uploaded:replacement-source-c",
  uploadedSourceRef: "replacement-source-c",
};

const uploadedModel = () =>
  createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection,
    occurrences,
    activeTarget: shirtTarget,
    selectedStyleIdByGarmentKey: {
      [occurrences[1].garmentKey]: style.id,
    },
    uploadedSource: sourceA,
    uploadedAssignmentGarmentKeys: [occurrences[0].garmentKey],
    confirmedUploadedSourceKey: sourceA.sourceKey,
    expectedUploadOwnerUid: sourceA.uploadReference.ownerUid,
  });

const render = (
  model: ReturnType<typeof uploadedModel>,
  overrides: Record<string, unknown>,
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

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const beginReplacement = (
  ledger: GarmentScopedDesignStyleAssignmentLedgerV2,
  state: DesignStyleUploadOperationState = createDesignStyleUploadOperationState(),
) => {
  const started = beginDesignStyleUploadForActiveOccurrence({
    state,
    ledger,
    activeOccurrences: occurrences,
    activeTarget: shirtTarget,
    operationKind: "replace",
  });
  assert.equal(started.status, "begun");
  if (started.status !== "begun") throw new Error("REPLACEMENT_NOT_BEGUN");
  return started;
};

// A. Uploaded source A exposes one accessible replacement control and preview;
// deletion and clear controls remain absent.
{
  const model = uploadedModel();
  const selected: Array<{ target: GarmentDesignStyleAssignmentTarget; file: File }> = [];
  const renderer = render(model, {
    uploadState: { status: "success", previewUrl: "blob:source-a" },
    onSelectUploadFile: (target: GarmentDesignStyleAssignmentTarget, file: File) =>
      selected.push({ target, file }),
  });
  assert.equal(renderer.root.findAllByProps({ type: "file" }).length, 1);
  const input = renderer.root.findByProps({ type: "file" });
  assert.match(String(input.props["aria-label"]), /Replace uploaded design for Shirt/i);
  assert.equal(
    renderer.root.findAllByType("img").some(
      (image) => image.props.src === "blob:source-a",
    ),
    true,
  );
  const replacementFile = { name: "source-b.png", type: "image/png" } as File;
  act(() => {
    input.props.onChange({ currentTarget: { files: [replacementFile], value: "x" } });
  });
  assert.deepEqual(selected[0].target, shirtTarget);
  assert.equal(selected[0].file, replacementFile);
  const text = textContent(renderer.root);
  assert.doesNotMatch(text, /Delete uploaded|Clear uploaded|Remove source/i);
  act(() => renderer.unmount());
}

// B. Pending replacement keeps source A, preview A, and the sibling assignment;
// the file control is hidden until the exact operation finishes.
{
  const model = uploadedModel();
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const previousTarget = ledger.assignmentsByGarmentKey[shirtTarget.garmentKey];
  const previousSibling = ledger.assignmentsByGarmentKey[occurrences[1].garmentKey];
  const started = beginReplacement(ledger);
  assert.equal(started.ledger, ledger);
  const renderer = render(model, {
    uploadState: { status: "pending", previewUrl: "blob:source-a" },
    onSelectUploadFile: () => undefined,
  });
  assert.equal(renderer.root.findAllByProps({ type: "file" }).length, 0);
  assert.equal(renderer.root.findByType("img").props.src, "blob:source-a");
  assert.match(textContent(renderer.root), /Preparing a replacement design for Shirt/i);
  assert.equal(ledger.assignmentsByGarmentKey[shirtTarget.garmentKey], previousTarget);
  assert.equal(ledger.assignmentsByGarmentKey[occurrences[1].garmentKey], previousSibling);
  act(() => renderer.unmount());
}

// C. A valid callback replaces only Shirt with source B. Preview B is presented
// only in the accepted-success state; the sibling remains the same object.
{
  const model = uploadedModel();
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const sibling = ledger.assignmentsByGarmentKey[occurrences[1].garmentKey];
  const started = beginReplacement(ledger);
  const applied = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: occurrences,
    activeTarget: shirtTarget,
    operationKind: "replace",
    source: sourceBInput,
  });
  assert.equal(applied.status, "accepted");
  assert.equal(applied.assignmentResult.status, "applied");
  const replaced = applied.ledger.assignmentsByGarmentKey[shirtTarget.garmentKey];
  assert.equal(replaced?.sourceKind, "uploaded");
  assert.equal(
    replaced?.sourceKind === "uploaded" ? replaced.uploadedSourceRef : null,
    sourceBInput.uploadedSourceRef,
  );
  assert.equal(applied.ledger.assignmentsByGarmentKey[occurrences[1].garmentKey], sibling);
  const renderer = render(model, {
    uploadState: { status: "success", previewUrl: "blob:source-b" },
    onSelectUploadFile: () => undefined,
  });
  assert.equal(renderer.root.findByType("img").props.src, "blob:source-b");
  act(() => renderer.unmount());
}

// D. A failed replacement consumes the matching operation but returns the exact
// old ledger, while preview A and a retryable error remain visible.
{
  const model = uploadedModel();
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const started = beginReplacement(ledger);
  const failed = failDesignStyleUploadOperation({
    state: started.state,
    ticket: started.ticket,
    ledger,
    reason: "external-operation-failed",
  });
  assert.equal(failed.ledger, ledger);
  assert.equal(
    failed.ledger.assignmentsByGarmentKey[shirtTarget.garmentKey]
      ?.sourceKind,
    "uploaded",
  );
  const renderer = render(model, {
    uploadState: {
      status: "error",
      previewUrl: "blob:source-a",
      message: "Replacement failed. Your previous design is unchanged. Try again.",
    },
    onSelectUploadFile: () => undefined,
  });
  assert.equal(renderer.root.findByType("img").props.src, "blob:source-a");
  assert.match(textContent(renderer.root), /previous design is unchanged.*Try again/i);
  act(() => renderer.unmount());
}

// E. A ledger advance makes callback B stale; source A and all current ledger
// entries remain untouched.
{
  const model = uploadedModel();
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const started = beginReplacement(ledger);
  const advanced = assignUploadedDesignStyleToGarmentOccurrence({
    ledger,
    expectedLedgerRevision: ledger.revision,
    activeOccurrences: occurrences,
    target: targetFor(occurrences[1]),
    source: {
      sourceKey: "uploaded:replacement-sibling-new",
      uploadedSourceRef: "replacement-sibling-new",
    },
  });
  assert.equal(advanced.status, "applied");
  const currentTarget = advanced.ledger.assignmentsByGarmentKey[shirtTarget.garmentKey];
  const rejected = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger: advanced.ledger,
    activeOccurrences: occurrences,
    activeTarget: shirtTarget,
    operationKind: "replace",
    source: sourceBInput,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.reason, "stale-ledger-revision");
  assert.equal(rejected.ledger, advanced.ledger);
  assert.equal(rejected.ledger.assignmentsByGarmentKey[shirtTarget.garmentKey], currentTarget);
}

// F. Replacement C invalidates pending replacement B; B cannot mutate source A,
// while C may replace it.
{
  const model = uploadedModel();
  const ledger = model.hydration.ledger;
  assert.ok(ledger);
  const first = beginReplacement(ledger);
  const second = beginReplacement(ledger, first.state);
  const stale = applyDesignStyleUploadForActiveOccurrence({
    state: second.state,
    ticket: first.ticket,
    ledger,
    activeOccurrences: occurrences,
    activeTarget: shirtTarget,
    operationKind: "replace",
    source: sourceBInput,
  });
  assert.equal(stale.status, "rejected");
  assert.equal(stale.reason, "stale-operation-generation");
  assert.equal(stale.ledger, ledger);
  const current = applyDesignStyleUploadForActiveOccurrence({
    state: second.state,
    ticket: second.ticket,
    ledger,
    activeOccurrences: occurrences,
    activeTarget: shirtTarget,
    operationKind: "replace",
    source: sourceCInput,
  });
  assert.equal(current.status, "accepted");
  assert.equal(current.assignmentResult.status, "applied");
}

// G. Repeated Shirt occurrences retain independent uploaded assignments;
// replacing Shirt 2 changes only its exact garment key.
{
  const repeated: PhysicalGarmentOccurrence[] = [
    { garmentKey: "base:shirt:1", garmentType: "shirt", occurrenceGeneration: 1, sourceRole: "main", fabricUnits: 1 },
    { garmentKey: "base:shirt:2", garmentType: "shirt", occurrenceGeneration: 2, sourceRole: "main", fabricUnits: 1 },
    { garmentKey: "base:shirt:3", garmentType: "shirt", occurrenceGeneration: 3, sourceRole: "main", fabricUnits: 1 },
  ];
  let ledger = createEmptyGarmentScopedDesignStyleAssignmentLedger();
  for (const [index, occurrence] of repeated.entries()) {
    const assigned = assignUploadedDesignStyleToGarmentOccurrence({
      ledger,
      expectedLedgerRevision: ledger.revision,
      activeOccurrences: repeated,
      target: targetFor(occurrence),
      source: {
        sourceKey: `uploaded:repeated-source-${index + 1}`,
        uploadedSourceRef: `repeated-source-${index + 1}`,
      },
    });
    assert.equal(assigned.status, "applied");
    ledger = assigned.ledger;
  }
  const shirtOne = ledger.assignmentsByGarmentKey[repeated[0].garmentKey];
  const shirtThree = ledger.assignmentsByGarmentKey[repeated[2].garmentKey];
  const shirtTwoTarget = targetFor(repeated[1]);
  const started = beginDesignStyleUploadForActiveOccurrence({
    state: createDesignStyleUploadOperationState(),
    ledger,
    activeOccurrences: repeated,
    activeTarget: shirtTwoTarget,
    operationKind: "replace",
  });
  assert.equal(started.status, "begun");
  if (started.status !== "begun") throw new Error("REPLACEMENT_NOT_BEGUN");
  const applied = applyDesignStyleUploadForActiveOccurrence({
    state: started.state,
    ticket: started.ticket,
    ledger,
    activeOccurrences: repeated,
    activeTarget: shirtTwoTarget,
    operationKind: "replace",
    source: sourceBInput,
  });
  assert.equal(applied.status, "accepted");
  assert.equal(applied.ledger.assignmentsByGarmentKey[repeated[0].garmentKey], shirtOne);
  assert.equal(applied.ledger.assignmentsByGarmentKey[repeated[2].garmentKey], shirtThree);
  const shirtTwo = applied.ledger.assignmentsByGarmentKey[repeated[1].garmentKey];
  assert.equal(
    shirtTwo?.sourceKind === "uploaded" ? shirtTwo.uploadedSourceRef : null,
    sourceBInput.uploadedSourceRef,
  );
}

// H. The production replacement path uploads a distinct canonical source and
// retains source A: it calls neither replacement-with-cleanup nor deletion.
{
  const viewSource = readFileSync(
    new URL("./src/components/DesignStudioView.tsx", import.meta.url),
    "utf8",
  );
  const handler = viewSource.match(
    /const handleFutureDesignStyleUploadFile[\s\S]*?\n  const isStageHistoricallyUnlocked/,
  )?.[0];
  assert.ok(handler);
  assert.match(handler, /operationKind = existingAssignment \? "replace" : "assign"/);
  assert.match(handler, /uploadCustomerDesignDraft/);
  assert.doesNotMatch(
    handler,
    /replaceCustomerDesignDraft|deleteCustomerDesignDraft|deleteUploadedDesignBeforeSourceChange/,
  );
  assert.match(handler, /setFutureDesignStyleUploadedSourceByGarmentKey/);
}

console.log(
  "PASS: occurrence-targeted uploaded Design Style replacement and source retention",
);
