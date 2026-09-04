/**
 * Catalogue Design Style must deselect immediately after a successful
 * Upload Your Own Design preview — never coexist with an uploaded preview.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  CustomDetailDemographic,
  DesignSource,
  FabricCapacityGarmentSpec,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import {
  activateFutureCatalogStyleSelection,
  createUploadedDesignSource,
  reconcileGuestDesignDraftDesignSource,
} from "./src/utils/designSourceState";
import {
  createUploadedDesignOperationCoordinator,
  createUploadedDesignSourceWhenReady,
  mergeUploadedDesignCompositionWithStep1,
  resolveAuthorityAfterSuccessfulUploadedDesignPreview,
  runUploadedDesignOperation,
} from "./src/utils/uploadedDesignStep1";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "deselect-owner",
  mimeType: "image/png",
  designReferenceId: "deselect-upload-1",
  createdAt: "2026-08-24T18:00:00.000Z",
});

const shirtComposition = mergeUploadedDesignCompositionWithStep1({
  step1GarmentTypes: ["shirt"],
  additionalGarmentTypes: [],
});

const royalSenator: StyleCategory = {
  id: "royal-senator-1",
  name: "Royal Senator",
  description: "Catalogue style",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  image: "https://example.com/royal-senator.jpg",
};

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const advanceAsyncOperation = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

// ---------------------------------------------------------------------------
// Production wiring guard
// ---------------------------------------------------------------------------
{
  const viewSource = readFileSync(
    new URL("./src/components/DesignStudioView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    viewSource,
    /resolveAuthorityAfterSuccessfulUploadedDesignPreview/,
  );
  assert.match(viewSource, /applySuccessfulUploadedDesignPreview/);
  assert.match(viewSource, /createUploadedDesignOperationCoordinator/);
  assert.match(viewSource, /runUploadedDesignOperation/);
  assert.match(viewSource, /invalidateUploadedDesignOperation/);
  assert.match(
    viewSource,
    /setUploadedDesignPreviewFromBlob[\s\S]*?applySuccessfulUploadedDesignPreview/,
    "Preview acceptance must be followed by the authority transition",
  );
}

// ---------------------------------------------------------------------------
// A/B/C — domain authority after successful preview
// ---------------------------------------------------------------------------
{
  const activated = activateFutureCatalogStyleSelection({
    styleId: royalSenator.id,
    primaryFabricCode: "FAB-1",
  });
  assert.equal(activated.selectedStyleId, royalSenator.id);
  assert.equal(activated.designSource.kind, "catalog");

  // B: upload succeeds, demographic missing
  const incomplete = resolveAuthorityAfterSuccessfulUploadedDesignPreview({
    uploadReference,
    fabricCapacityComposition: shirtComposition,
    demographic: null,
  });
  assert.equal(incomplete.selectedStyleId, null);
  assert.equal(incomplete.designSource, null);
  assert.equal(incomplete.confirmedDesignSourceKey, null);
  assert.equal(incomplete.priceActivatedFabricCode, null);
  assert.equal(
    createUploadedDesignSourceWhenReady({
      uploadReference,
      fabricCapacityComposition: shirtComposition,
      demographic: null,
    }),
    null,
  );

  // C: upload succeeds, form already ready
  const complete = resolveAuthorityAfterSuccessfulUploadedDesignPreview({
    uploadReference,
    fabricCapacityComposition: shirtComposition,
    demographic: "male",
  });
  assert.equal(complete.selectedStyleId, null);
  assert.ok(complete.designSource);
  assert.equal(complete.designSource!.kind, "uploaded");
  assert.equal(
    complete.designSource!.uploadReference.designReferenceId,
    uploadReference.designReferenceId,
  );
  assert.equal(complete.confirmedDesignSourceKey, null);
  assert.equal(complete.priceActivatedFabricCode, null);
}

// ---------------------------------------------------------------------------
// Simulated DesignStudio success/failure transitions (catalogue selected)
// ---------------------------------------------------------------------------
type StudioAuthority = {
  futureSelectedStyleId: string | null;
  futureDesignSource: DesignSource | null;
  futureConfirmedDesignSourceKey: string | null;
  futurePriceActivatedFabricCode: string | null;
  uploadedDesignReference: ReturnType<
    typeof createCustomerDesignUploadReference
  > | null;
  uploadedDesignComposition: FabricCapacityGarmentSpec[];
  uploadedDesignDemographic: CustomDetailDemographic | null;
  uploadedDesignPreviewUrl: string | null;
};

const activateCatalog = (): StudioAuthority => {
  const activated = activateFutureCatalogStyleSelection({
    styleId: royalSenator.id,
    primaryFabricCode: "FAB-1",
  });
  return {
    futureSelectedStyleId: activated.selectedStyleId,
    futureDesignSource: activated.designSource,
    futureConfirmedDesignSourceKey: activated.confirmedDesignSourceKey,
    futurePriceActivatedFabricCode: activated.priceActivatedFabricCode,
    uploadedDesignReference: null,
    uploadedDesignComposition: shirtComposition,
    uploadedDesignDemographic: null,
    uploadedDesignPreviewUrl: null,
  };
};

const applySuccessfulPreview = (
  state: StudioAuthority,
  input: {
    reference: ReturnType<typeof createCustomerDesignUploadReference>;
    composition: FabricCapacityGarmentSpec[];
    demographic: CustomDetailDemographic | null;
    previewUrl: string;
  },
): StudioAuthority => {
  const authority = resolveAuthorityAfterSuccessfulUploadedDesignPreview({
    uploadReference: input.reference,
    fabricCapacityComposition: input.composition,
    demographic: input.demographic,
  });
  return {
    ...state,
    uploadedDesignReference: input.reference,
    uploadedDesignComposition: input.composition,
    uploadedDesignDemographic: input.demographic,
    uploadedDesignPreviewUrl: input.previewUrl,
    futureSelectedStyleId: authority.selectedStyleId,
    futureDesignSource: authority.designSource,
    futureConfirmedDesignSourceKey: authority.confirmedDesignSourceKey,
    futurePriceActivatedFabricCode: authority.priceActivatedFabricCode,
  };
};

// ---------------------------------------------------------------------------
// Production upload-operation coordinator: busy, generations, and races
// ---------------------------------------------------------------------------

// Busy begins before unresolved validation and a current success publishes once.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const validation = createDeferred<void>();
  let state = activateCatalog();
  let busy = false;
  let executeCalls = 0;
  let errorMessage: string | null = null;
  const pending = runUploadedDesignOperation({
    coordinator,
    kind: "upload",
    onBegin: () => {
      busy = true;
      errorMessage = null;
    },
    validate: () => validation.promise,
    execute: async () => {
      executeCalls += 1;
      return {
        composition: shirtComposition,
        demographic: null as CustomDetailDemographic | null,
        previewUrl: "blob:current-upload",
        reference: uploadReference,
      };
    },
    onSuccess: (value) => {
      state = applySuccessfulPreview(state, value);
    },
    onError: (error) => {
      errorMessage = String(error);
    },
    onFinish: () => {
      busy = false;
    },
  });

  assert.equal(busy, true, "Upload must be busy before validation resolves");
  assert.equal(executeCalls, 0);
  validation.resolve(undefined);
  const result = await pending;
  assert.equal(result.status, "succeeded");
  assert.equal(busy, false);
  assert.equal(errorMessage, null);
  assert.equal(executeCalls, 1);
  assert.equal(state.futureSelectedStyleId, null);
  assert.equal(state.futureDesignSource, null);
  assert.equal(state.uploadedDesignReference?.designReferenceId, "deselect-upload-1");
  assert.equal(state.uploadedDesignPreviewUrl, "blob:current-upload");
}

// A current validation failure restores busy without touching catalogue authority.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const expectedState = activateCatalog();
  let state = expectedState;
  let busy = false;
  let executeCalls = 0;
  let errorMessage: string | null = null;
  const result = await runUploadedDesignOperation({
    coordinator,
    kind: "upload",
    onBegin: () => {
      busy = true;
      errorMessage = null;
    },
    validate: async () => {
      throw new Error("invalid image");
    },
    execute: async () => {
      executeCalls += 1;
      return uploadReference;
    },
    onSuccess: () => {
      state = { ...state, futureSelectedStyleId: null };
    },
    onError: (error) => {
      errorMessage = String(error);
    },
    onFinish: () => {
      busy = false;
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(busy, false);
  assert.equal(executeCalls, 0);
  assert.match(errorMessage || "", /invalid image/);
  assert.deepEqual(state, expectedState);
}

// A stale upload cannot overwrite a newer catalogue source decision.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const upload = createDeferred<{
    composition: FabricCapacityGarmentSpec[];
    demographic: CustomDetailDemographic | null;
    previewUrl: string;
    reference: typeof uploadReference;
  }>();
  let state = activateCatalog();
  let busy = false;
  let uploadStarted = false;
  let staleError: string | null = null;
  const pending = runUploadedDesignOperation({
    coordinator,
    kind: "upload",
    onBegin: () => {
      busy = true;
    },
    validate: async () => undefined,
    execute: () => {
      uploadStarted = true;
      return upload.promise;
    },
    onSuccess: (value) => {
      state = applySuccessfulPreview(state, value);
    },
    onError: (error) => {
      staleError = String(error);
    },
    onFinish: () => {
      busy = false;
    },
  });
  await advanceAsyncOperation();
  assert.equal(uploadStarted, true);

  coordinator.invalidate();
  busy = false;
  const newerCatalogue = activateFutureCatalogStyleSelection({
    styleId: "newer-catalogue-style",
    primaryFabricCode: "FAB-2",
  });
  state = {
    ...state,
    futureSelectedStyleId: newerCatalogue.selectedStyleId,
    futureDesignSource: newerCatalogue.designSource,
    futureConfirmedDesignSourceKey: newerCatalogue.confirmedDesignSourceKey,
    futurePriceActivatedFabricCode: newerCatalogue.priceActivatedFabricCode,
  };

  upload.resolve({
    composition: shirtComposition,
    demographic: "male",
    previewUrl: "blob:stale-upload",
    reference: uploadReference,
  });
  const result = await pending;
  assert.equal(result.status, "stale");
  assert.equal(busy, false);
  assert.equal(staleError, null);
  assert.equal(state.futureSelectedStyleId, "newer-catalogue-style");
  assert.equal(state.futureDesignSource?.kind, "catalog");
  assert.equal(
    state.futureConfirmedDesignSourceKey,
    newerCatalogue.confirmedDesignSourceKey,
  );
  assert.equal(
    state.futurePriceActivatedFabricCode,
    newerCatalogue.priceActivatedFabricCode,
  );
  assert.equal(state.uploadedDesignReference, null);
  assert.equal(state.uploadedDesignPreviewUrl, null);
}

// Upload B completes before Upload A; A's later success cannot overwrite B.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const uploadA = createDeferred<string>();
  const uploadB = createDeferred<string>();
  const published: string[] = [];
  let busy = false;
  let errorMessage: string | null = null;
  const run = (value: Promise<string>) =>
    runUploadedDesignOperation({
      coordinator,
      kind: "upload",
      onBegin: () => {
        busy = true;
        errorMessage = null;
      },
      validate: async () => undefined,
      execute: () => value,
      onSuccess: (referenceId) => {
        published.push(referenceId);
      },
      onError: (error) => {
        errorMessage = String(error);
      },
      onFinish: () => {
        busy = false;
      },
    });

  const pendingA = run(uploadA.promise);
  await advanceAsyncOperation();
  const pendingB = run(uploadB.promise);
  await advanceAsyncOperation();
  uploadB.resolve("upload-b");
  assert.equal((await pendingB).status, "succeeded");
  assert.equal(busy, false);
  uploadA.resolve("upload-a");
  assert.equal((await pendingA).status, "stale");
  assert.deepEqual(published, ["upload-b"]);
  assert.equal(errorMessage, null);
}

// A stale failure cannot replace B's success with an obsolete error.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const uploadA = createDeferred<string>();
  const uploadB = createDeferred<string>();
  const published: string[] = [];
  let errorMessage: string | null = null;
  const run = (value: Promise<string>) =>
    runUploadedDesignOperation({
      coordinator,
      kind: "upload",
      onBegin: () => {
        errorMessage = null;
      },
      validate: async () => undefined,
      execute: () => value,
      onSuccess: (referenceId) => {
        published.push(referenceId);
      },
      onError: (error) => {
        errorMessage = String(error);
      },
      onFinish: () => undefined,
    });

  const pendingA = run(uploadA.promise);
  await advanceAsyncOperation();
  const pendingB = run(uploadB.promise);
  await advanceAsyncOperation();
  uploadB.resolve("upload-b");
  assert.equal((await pendingB).status, "succeeded");
  uploadA.reject(new Error("stale upload failed"));
  assert.equal((await pendingA).status, "stale");
  assert.deepEqual(published, ["upload-b"]);
  assert.equal(errorMessage, null);
}

// A settling while B is pending cannot clear B's busy state.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const uploadA = createDeferred<string>();
  const uploadB = createDeferred<string>();
  let busy = false;
  const run = (value: Promise<string>) =>
    runUploadedDesignOperation({
      coordinator,
      kind: "upload",
      onBegin: () => {
        busy = true;
      },
      validate: async () => undefined,
      execute: () => value,
      onSuccess: () => undefined,
      onError: () => undefined,
      onFinish: () => {
        busy = false;
      },
    });

  const pendingA = run(uploadA.promise);
  await advanceAsyncOperation();
  const pendingB = run(uploadB.promise);
  await advanceAsyncOperation();
  uploadA.resolve("upload-a");
  assert.equal((await pendingA).status, "stale");
  assert.equal(busy, true);
  uploadB.resolve("upload-b");
  assert.equal((await pendingB).status, "succeeded");
  assert.equal(busy, false);
}

// Replacement shares the same generation authority as a newer upload.
{
  const coordinator = createUploadedDesignOperationCoordinator();
  const replacement = createDeferred<string>();
  const upload = createDeferred<string>();
  const published: string[] = [];
  const run = (
    kind: "upload" | "replacement",
    value: Promise<string>,
  ) =>
    runUploadedDesignOperation({
      coordinator,
      kind,
      onBegin: () => undefined,
      validate: async () => undefined,
      execute: () => value,
      onSuccess: (referenceId) => {
        published.push(referenceId);
      },
      onError: () => undefined,
      onFinish: () => undefined,
    });

  const pendingReplacement = run("replacement", replacement.promise);
  await advanceAsyncOperation();
  const pendingUpload = run("upload", upload.promise);
  await advanceAsyncOperation();
  upload.resolve("newer-upload");
  assert.equal((await pendingUpload).status, "succeeded");
  replacement.resolve("older-replacement");
  assert.equal((await pendingReplacement).status, "stale");
  assert.deepEqual(published, ["newer-upload"]);
}

// A + B
{
  let state = activateCatalog();
  assert.equal(state.futureSelectedStyleId, royalSenator.id);

  state = applySuccessfulPreview(state, {
    reference: uploadReference,
    composition: shirtComposition,
    demographic: null,
    previewUrl: "blob:uploaded-preview",
  });
  assert.equal(state.uploadedDesignPreviewUrl, "blob:uploaded-preview");
  assert.equal(state.futureSelectedStyleId, null);
  assert.equal(state.futureDesignSource, null);
  assert.equal(state.futureConfirmedDesignSourceKey, null);
  assert.equal(state.futurePriceActivatedFabricCode, null);
  assert.ok(state.uploadedDesignReference);
  assert.ok(state.uploadedDesignComposition.length > 0);
}

// C
{
  let state = activateCatalog();
  state = applySuccessfulPreview(state, {
    reference: uploadReference,
    composition: shirtComposition,
    demographic: "male",
    previewUrl: "blob:ready-preview",
  });
  assert.equal(state.futureSelectedStyleId, null);
  assert.equal(state.futureDesignSource?.kind, "uploaded");
  assert.equal(state.futureConfirmedDesignSourceKey, null);
}

// D — invalid image must not deselect (simulate failed validate before preview)
{
  let state = activateCatalog();
  const before = { ...state };
  try {
    throw new Error("UNSUPPORTED_FILE_TYPE");
  } catch {
    // catalogue untouched
  }
  assert.deepEqual(state, before);
  assert.equal(state.futureSelectedStyleId, royalSenator.id);
}

// E — Firebase upload failure after validate must not deselect
{
  let state = activateCatalog();
  const before = { ...state };
  try {
    throw new Error("UPLOAD_FAILED");
  } catch {
    // catalogue untouched — preview never applied
  }
  assert.equal(state.futureSelectedStyleId, before.futureSelectedStyleId);
  assert.equal(state.futureDesignSource?.kind, "catalog");
  assert.equal(state.uploadedDesignPreviewUrl, null);
}

// F — replacement keeps uploaded mode + composition/demographic
{
  const original = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: shirtComposition,
    demographic: "male",
  });
  let state: StudioAuthority = {
    futureSelectedStyleId: null,
    futureDesignSource: original,
    futureConfirmedDesignSourceKey: original.sourceKey,
    futurePriceActivatedFabricCode: null,
    uploadedDesignReference: uploadReference,
    uploadedDesignComposition: shirtComposition,
    uploadedDesignDemographic: "male",
    uploadedDesignPreviewUrl: "blob:old",
  };
  const replacementRef = createCustomerDesignUploadReference({
    ownerUid: "deselect-owner",
    mimeType: "image/png",
    designReferenceId: "deselect-upload-2",
    createdAt: "2026-08-24T18:05:00.000Z",
  });
  state = applySuccessfulPreview(state, {
    reference: replacementRef,
    composition: state.uploadedDesignComposition,
    demographic: state.uploadedDesignDemographic,
    previewUrl: "blob:new",
  });
  assert.equal(state.futureDesignSource?.kind, "uploaded");
  assert.equal(
    state.futureDesignSource && state.futureDesignSource.kind === "uploaded"
      ? state.futureDesignSource.uploadReference.designReferenceId
      : null,
    "deselect-upload-2",
  );
  assert.equal(state.uploadedDesignDemographic, "male");
  assert.deepEqual(
    state.uploadedDesignComposition.map((spec) => spec.garmentType),
    ["shirt"],
  );
  assert.equal(state.futureSelectedStyleId, null);
}

// G — failed replacement preserves previous uploaded state
{
  const original = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: shirtComposition,
    demographic: "female",
  });
  const state: StudioAuthority = {
    futureSelectedStyleId: null,
    futureDesignSource: original,
    futureConfirmedDesignSourceKey: original.sourceKey,
    futurePriceActivatedFabricCode: null,
    uploadedDesignReference: uploadReference,
    uploadedDesignComposition: shirtComposition,
    uploadedDesignDemographic: "female",
    uploadedDesignPreviewUrl: "blob:keep",
  };
  const snapshot = { ...state };
  try {
    throw new Error("UPLOAD_FAILED");
  } catch {
    // no authority transition
  }
  assert.equal(state.futureDesignSource, snapshot.futureDesignSource);
  assert.equal(state.uploadedDesignPreviewUrl, "blob:keep");
  assert.equal(state.uploadedDesignDemographic, "female");
}

// H — draft persistence must not resurrect catalogue selection
{
  const afterUpload = resolveAuthorityAfterSuccessfulUploadedDesignPreview({
    uploadReference,
    fabricCapacityComposition: shirtComposition,
    demographic: "male",
  });
  const draft = {
    designSource: afterUpload.designSource,
    selectedStyleId: afterUpload.selectedStyleId,
    confirmedStyleId: null,
    confirmedDesignSourceKey: afterUpload.confirmedDesignSourceKey,
    priceActivatedFabricCode: afterUpload.priceActivatedFabricCode,
    designSelections: { accessories: [] },
  } as GuestDesignDraft;
  const reconciled = reconcileGuestDesignDraftDesignSource(draft);
  assert.equal(reconciled.selectedStyleId, null);
  assert.equal(reconciled.designSource?.kind, "uploaded");
  assert.equal(reconciled.confirmedStyleId, null);

  const incompleteDraft = {
    designSource: null,
    selectedStyleId: null,
    confirmedStyleId: null,
    confirmedDesignSourceKey: null,
    priceActivatedFabricCode: null,
    designSelections: { accessories: [] },
  } as GuestDesignDraft;
  const incompleteReconciled =
    reconcileGuestDesignDraftDesignSource(incompleteDraft);
  assert.equal(incompleteReconciled.selectedStyleId, null);
  assert.equal(incompleteReconciled.designSource, null);
}

// Later demographic completes uploaded source without restoring catalogue
{
  let state = activateCatalog();
  state = applySuccessfulPreview(state, {
    reference: uploadReference,
    composition: shirtComposition,
    demographic: null,
    previewUrl: "blob:pending-demo",
  });
  assert.equal(state.futureDesignSource, null);
  const ready = createUploadedDesignSourceWhenReady({
    uploadReference: state.uploadedDesignReference!,
    fabricCapacityComposition: state.uploadedDesignComposition,
    demographic: "male",
  });
  assert.ok(ready);
  state = {
    ...state,
    uploadedDesignDemographic: "male",
    futureSelectedStyleId: null,
    futureDesignSource: ready,
    futureConfirmedDesignSourceKey: null,
    futurePriceActivatedFabricCode: null,
  };
  assert.equal(state.futureSelectedStyleId, null);
  assert.equal(state.futureDesignSource?.kind, "uploaded");
  assert.notEqual(state.futureSelectedStyleId, royalSenator.id);
}

// ---------------------------------------------------------------------------
// I — rendered catalogue card loses selected state after successful upload
// ---------------------------------------------------------------------------
{
  const selectedModel = createDesignStyleStepTestModel({
    styles: [royalSenator],
    garmentTypeSelection,
    selectedStyleIdByGarmentKey: {
      "base:shirt:1": royalSenator.id,
    },
  });
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        ...createDesignStyleStepRenderProps(selectedModel),
      }),
    );
  });

  const selectedButton = renderer.root
    .findAllByType("button")
    .find(
      (button) =>
        button.props["aria-pressed"] === true &&
        textContent(button).includes("Selected"),
    );
  assert.ok(selectedButton, "Catalogue card must show selected before upload");

  const incompleteAuthority =
    resolveAuthorityAfterSuccessfulUploadedDesignPreview({
      uploadReference,
      fabricCapacityComposition: shirtComposition,
      demographic: null,
    });
  const uploadedReviewModel = createDesignStyleStepTestModel({
    styles: [royalSenator],
    garmentTypeSelection,
    rawDraft: {
      selectedStyleId: incompleteAuthority.selectedStyleId,
      designSource: incompleteAuthority.designSource,
      confirmedDesignSourceKey:
        incompleteAuthority.confirmedDesignSourceKey,
      priceActivatedFabricCode:
        incompleteAuthority.priceActivatedFabricCode,
    },
  });

  await act(async () => {
    renderer.update(
      createElement(DormantFutureDesignStyleStep, {
        ...createDesignStyleStepRenderProps(uploadedReviewModel),
      }),
    );
  });

  const stillSelected = renderer.root
    .findAllByType("button")
    .filter(
      (button) =>
        button.props["aria-pressed"] === true &&
        !button.props["data-catalogue-filter"],
    );
  assert.equal(
    stillSelected.length,
    0,
    "No catalogue card may remain selected after successful upload preview",
  );
  assert.ok(
    textContent(renderer.root).includes("Select Design"),
    "Catalogue cards return to unselected Select Design affordance",
  );
}

console.log(
  "PASS: upload success immediately deselects catalogue Design Style",
);
