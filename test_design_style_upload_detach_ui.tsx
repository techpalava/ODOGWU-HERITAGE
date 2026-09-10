import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type { CanonicalPhysicalGarmentType, GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { createUploadedDesignSource, type PhysicalGarmentOccurrence } from "./src/utils/designSourceState";
import {
  assignUploadedDesignStyleToGarmentOccurrence,
  type GarmentDesignStyleAssignmentTarget,
  type GarmentScopedDesignStyleAssignmentLedgerV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  applyDesignStyleStepLedgerToHydration,
  detachUploadedStyleThroughStepRuntime,
  projectDesignStyleStep,
  type DesignStyleStepClearMutationRequest,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleOccurrences,
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const style: StyleCategory = {
  id: "detach-style",
  name: "Detach sibling style",
  description: "Focused detach test style.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("skirt"),
  ],
};

const selection = (garmentTypes: CanonicalPhysicalGarmentType[]): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const source = (id: string, garments: CanonicalPhysicalGarmentType[]) =>
  createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "detach-owner",
      mimeType: "image/png",
      designReferenceId: id,
      createdAt: "2026-09-04T12:00:00.000Z",
    }),
    fabricCapacityComposition: garments.map(createStyleBaseGarmentSpec),
    demographic: "male",
  });

const targetFor = (occurrence: PhysicalGarmentOccurrence): GarmentDesignStyleAssignmentTarget => ({
  garmentKey: occurrence.garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: occurrence.garmentKey,
    generation: occurrence.occurrenceGeneration!,
  }),
});

const modelWithUploads = (
  garmentTypes: CanonicalPhysicalGarmentType[],
  uploadedAssignmentIndexes: number[],
  activeIndex = 0,
) => {
  const occurrences = createDesignStyleOccurrences(garmentTypes);
  const uploadedSource = source("source-a", garmentTypes);
  return createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection: selection(garmentTypes),
    occurrences,
    activeTarget: targetFor(occurrences[activeIndex]),
    uploadedSource,
    uploadedAssignmentGarmentKeys: uploadedAssignmentIndexes.map(
      (index) => occurrences[index].garmentKey,
    ),
    confirmedUploadedSourceKey: uploadedSource.sourceKey,
    expectedUploadOwnerUid: uploadedSource.uploadReference.ownerUid,
  });
};

const detach = (
  model: ReturnType<typeof modelWithUploads>,
  overrides: Partial<{
    ledger: GarmentScopedDesignStyleAssignmentLedgerV2;
    request: DesignStyleStepClearMutationRequest;
    deletionProof: Parameters<typeof detachUploadedStyleThroughStepRuntime>[0]["deletionProof"];
    uploadOperationPending: boolean;
  }> = {},
) => {
  const ledger = overrides.ledger || model.hydration.ledger!;
  return detachUploadedStyleThroughStepRuntime({
    ledger,
    activeOccurrences: model.occurrences,
    activeTarget: model.activeTarget,
    request: overrides.request || model.clearRequest!,
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
    uploadOperationPending: overrides.uploadOperationPending || false,
    deletionProof: overrides.deletionProof || {},
  });
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

// A. The exact uploaded occurrence exposes an accessible detach control and clears only its assignment.
{
  const model = modelWithUploads(["shirt"], [0]);
  const requests: DesignStyleStepClearMutationRequest[] = [];
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(DormantFutureDesignStyleStep, {
      ...createDesignStyleStepRenderProps(model),
      uploadState: { status: "success", previewUrl: "blob:source-a" },
      onClearAssignment: (request: DesignStyleStepClearMutationRequest) => requests.push(request),
    }));
  });
  const button = renderer.root.findAllByType("button").find((candidate) =>
    String(candidate.props["aria-label"] || "").includes("Remove uploaded design from Shirt"),
  );
  assert.ok(button);
  act(() => button!.props.onClick());
  assert.deepEqual(requests, [model.clearRequest]);
  const result = detach(model);
  assert.equal(result.status, "detached");
  assert.equal(result.ledger.assignmentsByGarmentKey[model.occurrences[0].garmentKey], undefined);
  assert.equal(result.lifecycle.physicalDeletionPerformed, false);
  act(() => renderer.unmount());
}

// B. A different-source sibling remains unchanged.
{
  const model = modelWithUploads(["shirt", "skirt"], [0]);
  const siblingSource = { sourceKey: "uploaded:source-b", uploadedSourceRef: "source-b" };
  const sibling = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: model.hydration.ledger!,
    expectedLedgerRevision: model.hydration.ledger!.revision,
    activeOccurrences: model.occurrences,
    target: targetFor(model.occurrences[1]),
    source: siblingSource,
  });
  assert.equal(sibling.status, "applied");
  const result = detach(model, { ledger: sibling.ledger, request: { ...model.clearRequest!, expectedLedgerRevision: sibling.ledger.revision } });
  assert.equal(result.status, "detached");
  const preserved = result.ledger.assignmentsByGarmentKey[model.occurrences[1].garmentKey];
  assert.equal(preserved?.sourceKind === "uploaded" ? preserved.uploadedSourceRef : null, "source-b");
}

// C. Detaching one explicit shared reference preserves the sibling and prohibits deletion.
{
  const model = modelWithUploads(["shirt", "skirt"], [0, 1]);
  const result = detach(model);
  assert.equal(result.status, "detached");
  assert.equal(result.lifecycle.referenceState.status, "ready");
  assert.equal(result.lifecycle.referenceState.status === "ready" ? result.lifecycle.referenceState.referenceCount : null, 1);
  assert.equal(result.lifecycle.deletionEligibility.status, "retain");
  assert.ok(result.ledger.assignmentsByGarmentKey[model.occurrences[1].garmentKey]);
}

// D. The final active reference reaches zero without physical deletion.
{
  const result = detach(modelWithUploads(["shirt"], [0]));
  assert.equal(result.status, "detached");
  assert.equal(result.lifecycle.referenceState.status === "ready" ? result.lifecycle.referenceState.referenceCount : null, 0);
  assert.equal(result.lifecycle.physicalDeletionPerformed, false);
}

// E. Unknown retention proof fails closed after the final detach.
{
  const result = detach(modelWithUploads(["shirt"], [0]));
  assert.equal(result.status, "detached");
  assert.equal(result.lifecycle.deletionEligibility.status, "retain");
  assert.ok(result.lifecycle.deletionEligibility.reasons.includes("HISTORY_SAFETY_UNKNOWN"));
}

// F. Explicit deletion eligibility is recorded but never auto-deletes.
{
  const result = detach(modelWithUploads(["shirt"], [0]), {
    deletionProof: {
      referenceAuthorityStatus: "complete",
      currentDraftReferenceStatus: "not-referenced",
      ownershipStatus: "settled",
      ownershipTransferStatus: "settled",
      confirmationStatus: "settled",
      historySafetyStatus: "safe-to-delete",
    },
  });
  assert.equal(result.status, "detached");
  assert.equal(result.lifecycle.deletionEligibility.status, "eligible-for-deletion");
  assert.equal(result.lifecycle.physicalDeletionPerformed, false);
}

// G. Repeated garments retain exact sibling assignments when Shirt 2 is detached.
{
  const model = modelWithUploads(["shirt", "shirt", "shirt"], [0, 1, 2], 1);
  const result = detach(model);
  assert.equal(result.status, "detached");
  assert.ok(result.ledger.assignmentsByGarmentKey[model.occurrences[0].garmentKey]);
  assert.equal(result.ledger.assignmentsByGarmentKey[model.occurrences[1].garmentKey], undefined);
  assert.ok(result.ledger.assignmentsByGarmentKey[model.occurrences[2].garmentKey]);
}

// H. A stale captured revision fails closed without any ledger change.
{
  const model = modelWithUploads(["shirt", "skirt"], [0]);
  const advanced = assignUploadedDesignStyleToGarmentOccurrence({
    ledger: model.hydration.ledger!,
    expectedLedgerRevision: model.hydration.ledger!.revision,
    activeOccurrences: model.occurrences,
    target: targetFor(model.occurrences[1]),
    source: { sourceKey: "uploaded:later", uploadedSourceRef: "later" },
  });
  assert.equal(advanced.status, "applied");
  const result = detach(model, { ledger: advanced.ledger });
  assert.equal(result.status, "rejected");
  assert.equal(result.status === "rejected" ? result.reason : null, "STALE_LEDGER_REVISION");
  assert.equal(result.ledger, advanced.ledger);
  const staleTokenResult = detach(model, {
    request: {
      ...model.clearRequest!,
      target: {
        ...model.clearRequest!.target,
        occurrenceToken: `${model.clearRequest!.target.occurrenceToken}:stale`,
      },
    },
  });
  assert.equal(staleTokenResult.status, "rejected");
  assert.equal(
    staleTokenResult.status === "rejected" ? staleTokenResult.reason : null,
    "STALE_ACTIVE_OCCURRENCE",
  );
  assert.equal(staleTokenResult.ledger, model.hydration.ledger);
}

// I. Reprojection after detach reduces progress and disables Continue.
{
  const model = modelWithUploads(["shirt"], [0]);
  assert.equal(model.projection.isComplete, true);
  const result = detach(model);
  assert.equal(result.status, "detached");
  const hydration = applyDesignStyleStepLedgerToHydration({
    hydration: model.hydration,
    ledger: result.ledger,
    activeOccurrences: model.occurrences,
    authority: model.authority,
  });
  const projection = projectDesignStyleStep({
    activeOccurrences: model.occurrences,
    hydration,
    authority: model.authority,
    styles: model.styles,
  });
  assert.equal(projection.completedCount, 0);
  assert.equal(projection.isComplete, false);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(DormantFutureDesignStyleStep, {
      ...createDesignStyleStepRenderProps(model),
      occurrences: projection.occurrences,
      completedCount: projection.completedCount,
      exactSetComplete: projection.isComplete,
      onSelectUploadFile: () => undefined,
    }));
  });
  assert.match(textContent(renderer.root), /0 of 1 garment/);
  assert.equal(renderer.root.findByProps({ "aria-label": "Continue to Custom Details" }).props.disabled, true);
  assert.equal(renderer.root.findAllByProps({ type: "file" }).length, 1);
  act(() => renderer.unmount());
}

// Pending exact-occurrence upload work suppresses the clear control and runtime detach.
{
  const model = modelWithUploads(["shirt"], [0]);
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(createElement(DormantFutureDesignStyleStep, {
      ...createDesignStyleStepRenderProps(model),
      uploadState: { status: "pending" },
    }));
  });
  assert.doesNotMatch(textContent(renderer.root), /Remove uploaded design from Shirt/);
  assert.equal(detach(model, { uploadOperationPending: true }).status, "rejected");
  act(() => renderer.unmount());
  act(() => {
    renderer = create(createElement(DormantFutureDesignStyleStep, {
      ...createDesignStyleStepRenderProps(model),
      stylesLoadState: "loading",
      uploadState: { status: "success" },
    }));
  });
  assert.doesNotMatch(textContent(renderer.root), /Remove uploaded design from Shirt/);
  act(() => renderer.unmount());
}

const viewSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const detachHandler = viewSource.match(
  /const handleClearFutureDesignStyleAssignment[\s\S]*?\n  const clearFutureDesignStyleUploadUi/,
)?.[0] || "";
assert.match(detachHandler, /detachUploadedStyleThroughStepRuntime/);
assert.match(detachHandler, /applyFutureDesignStyleMutationLedger/);
assert.doesNotMatch(
  detachHandler,
  /deleteCustomerDesignDraft|deleteUploadedDesignBeforeSourceChange|replaceCustomerDesignDraft/,
);

console.log("PASS: occurrence-level uploaded Design Style detach and lifecycle retention");
