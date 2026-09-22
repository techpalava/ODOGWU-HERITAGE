import assert from "node:assert/strict";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import {
  resolveDesignStyleOccurrenceCardPreview,
  resolveUploadedOccurrenceSelectedPreviewUrl,
} from "./src/utils/designStyleOccurrencePreview";
import {
  mergeRestoredOccurrencePreviewMap,
  objectUrlsToRevokeAfterPreviewMerge,
  previewUpdatesForUploadedSource,
  restoreUploadedDesignOccurrencePreviews,
  retainAssignedOccurrencePreviews,
  shouldPublishRestoredUploadedPreview,
  type RestoredUploadedPreviewSourceWork,
} from "./src/utils/restoredUploadedDesignPreviewPublication";

const shirtToken = createPhysicalGarmentOccurrenceIdentityToken({
  garmentKey: "base:shirt",
  generation: 1,
});
const skirtToken = createPhysicalGarmentOccurrenceIdentityToken({
  garmentKey: "base:skirt",
  generation: 2,
});
const shirtTwoToken = createPhysicalGarmentOccurrenceIdentityToken({
  garmentKey: "base:shirt:2",
  generation: 3,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const blobA = new Blob(["a"], { type: "image/png" });
const blobB = new Blob(["b"], { type: "image/png" });
const blobC = new Blob(["c"], { type: "image/png" });

const sourceA = (): RestoredUploadedPreviewSourceWork => ({
  sourceKey: "uploaded:source-a",
  uploadedSourceRef: "ref-a",
  occurrenceTokens: [shirtToken],
});
const sourceB = (): RestoredUploadedPreviewSourceWork => ({
  sourceKey: "uploaded:source-b",
  uploadedSourceRef: "ref-b",
  occurrenceTokens: [skirtToken],
});

{
  assert.equal(
    resolveUploadedOccurrenceSelectedPreviewUrl({
      matchingLiveUploadPreviewUrl: null,
      retainedActivePreviewUrl: null,
      restoredPreviewUrl: "blob:restored-a",
    }),
    "blob:restored-a",
  );
  assert.equal(
    resolveUploadedOccurrenceSelectedPreviewUrl({
      matchingLiveUploadPreviewUrl: null,
      retainedActivePreviewUrl: "blob:retained-a",
      restoredPreviewUrl: "blob:restored-a",
    }),
    "blob:retained-a",
  );
}

{
  const shirtOccurrence = {
    target: { garmentKey: "base:shirt", occurrenceToken: shirtToken },
    garmentType: "shirt" as const,
    label: "Shirt",
    status: "complete" as const,
    assignment: {
      garmentKey: "base:shirt",
      occurrenceToken: shirtToken,
      assignmentRevision: 1,
      sourceKind: "uploaded" as const,
      sourceKey: "uploaded:ref-a",
      uploadedSourceRef: "ref-a",
    },
    assignmentLabel: "Uploaded design",
    assignmentImage: null,
  };
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: shirtOccurrence,
    uploadState: { status: "idle" },
    selectedDesignPreviewByOccurrenceToken: { [shirtToken]: "blob:a", [skirtToken]: "blob:b" },
  });
  assert.equal(preview.image, "blob:a");
}

const runRestore = async ({
  sources,
  prove,
  isCurrent = () => true,
  cancelled = () => false,
}: {
  sources: readonly RestoredUploadedPreviewSourceWork[];
  prove: (
    source: RestoredUploadedPreviewSourceWork,
  ) => Promise<
    | { readonly status: "proved"; readonly blob: Blob }
    | { readonly status: "failed" | "missing-owner" }
  >;
  isCurrent?: (source: RestoredUploadedPreviewSourceWork) => boolean;
  cancelled?: () => boolean;
}) => {
  let map: Readonly<Record<string, string>> = {};
  const proved: string[] = [];
  const failed: string[] = [];
  const discarded: string[] = [];
  const created: string[] = [];
  await restoreUploadedDesignOccurrencePreviews({
    sources,
    cancelled,
    prove,
    isCurrent,
    createPreviewUrl: (blob) => {
      const url = `blob:${blob === blobA ? "a" : blob === blobB ? "b" : blob === blobC ? "c" : "x"}:${created.length}`;
      created.push(url);
      return url;
    },
    onProved: (source) => {
      proved.push(source.sourceKey);
    },
    onFailed: (source) => {
      failed.push(source.sourceKey);
    },
    onDiscardPreviewUrl: (url) => {
      discarded.push(url);
    },
    onPublish: (_source, updates) => {
      map = mergeRestoredOccurrencePreviewMap(map, updates);
    },
  });
  return { map, proved, failed, discarded, created };
};

{
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const b = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: (source) =>
      source.uploadedSourceRef === "ref-a" ? a.promise : b.promise,
  });
  a.resolve({ status: "proved", blob: blobA });
  await Promise.resolve();
  const afterA = await Promise.race([
    restore.then((result) => ({ done: true as const, result })),
    Promise.resolve({ done: false as const }),
  ]);
  assert.equal(afterA.done, false);
  b.resolve({ status: "proved", blob: blobB });
  const result = await restore;
  assert.equal(result.map[shirtToken]?.startsWith("blob:a:"), true);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
  assert.deepEqual(result.proved.sort(), [
    "uploaded:source-a",
    "uploaded:source-b",
  ]);
}

{
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const b = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: (source) =>
      source.uploadedSourceRef === "ref-a" ? a.promise : b.promise,
  });
  b.resolve({ status: "proved", blob: blobB });
  a.resolve({ status: "proved", blob: blobA });
  const result = await restore;
  assert.equal(result.map[shirtToken]?.startsWith("blob:a:"), true);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
}

{
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const b = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: (source) =>
      source.uploadedSourceRef === "ref-a" ? a.promise : b.promise,
  });
  a.resolve({ status: "proved", blob: blobA });
  b.resolve({ status: "proved", blob: blobB });
  const result = await restore;
  assert.equal(Object.keys(result.map).sort().join(","), `${shirtToken},${skirtToken}`.split(",").sort().join(","));
}

{
  let currentA = true;
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: async (source) => {
      if (source.uploadedSourceRef === "ref-a") return a.promise;
      return { status: "proved", blob: blobB };
    },
    isCurrent: (source) =>
      source.uploadedSourceRef === "ref-a" ? currentA : true,
  });
  await Promise.resolve();
  currentA = false;
  a.resolve({ status: "proved", blob: blobA });
  const result = await restore;
  assert.equal(result.map[shirtToken], undefined);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
  assert.equal(result.discarded.length > 0 || result.created.filter((url) => url.startsWith("blob:a:")).every((url) => result.discarded.includes(url) || !Object.values(result.map).includes(url)), true);
}

{
  let aTokens = [shirtToken];
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [
      { ...sourceA(), occurrenceTokens: aTokens },
      sourceB(),
    ],
    prove: async (source) => {
      if (source.uploadedSourceRef === "ref-a") return a.promise;
      return { status: "proved", blob: blobB };
    },
    isCurrent: (source) =>
      source.uploadedSourceRef !== "ref-a" || aTokens.length > 0,
  });
  await Promise.resolve();
  aTokens = [];
  a.resolve({ status: "proved", blob: blobA });
  const result = await restore;
  assert.equal(result.map[shirtToken], undefined);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
}

{
  let aRef = "ref-a";
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: async (source) => {
      if (source.uploadedSourceRef === "ref-a") return a.promise;
      return { status: "proved", blob: blobB };
    },
    isCurrent: (source) =>
      source.uploadedSourceRef !== "ref-a" || aRef === "ref-a",
  });
  await Promise.resolve();
  aRef = "catalog";
  a.resolve({ status: "proved", blob: blobA });
  const result = await restore;
  assert.equal(result.map[shirtToken], undefined);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
}

{
  let aRef = "ref-a";
  const a = deferred<{ status: "proved"; blob: Blob }>();
  const restore = runRestore({
    sources: [sourceA(), sourceB()],
    prove: async (source) => {
      if (source.uploadedSourceRef === "ref-a") return a.promise;
      return { status: "proved", blob: blobB };
    },
    isCurrent: (source) =>
      source.uploadedSourceRef !== "ref-a" || aRef === "ref-a",
  });
  await Promise.resolve();
  aRef = "ref-c";
  a.resolve({ status: "proved", blob: blobA });
  const result = await restore;
  assert.equal(result.map[shirtToken], undefined);
  assert.equal(result.map[skirtToken]?.startsWith("blob:b:"), true);
}

{
  const previous = { [shirtToken]: "blob:a", [skirtToken]: "blob:b" };
  const next = mergeRestoredOccurrencePreviewMap(previous, {
    [shirtToken]: "blob:stale-a",
  });
  assert.equal(next[skirtToken], "blob:b");
  assert.equal(next[shirtToken], "blob:stale-a");
  const keptB = mergeRestoredOccurrencePreviewMap(previous, {});
  assert.equal(keptB[skirtToken], "blob:b");
  assert.equal(
    shouldPublishRestoredUploadedPreview({
      cancelled: false,
      requestStillCurrent: false,
      occurrenceTokens: [shirtToken],
    }),
    false,
  );
}

{
  const previous = { [shirtToken]: "blob:a", [skirtToken]: "blob:b" };
  const next = retainAssignedOccurrencePreviews({
    currentByOccurrenceToken: previous,
    assignedOccurrenceTokens: new Set([shirtToken]),
  });
  assert.equal(next[shirtToken], "blob:a");
  assert.equal(next[skirtToken], undefined);
  assert.deepEqual(
    objectUrlsToRevokeAfterPreviewMerge({
      previousByOccurrenceToken: previous,
      nextByOccurrenceToken: next,
    }),
    ["blob:b"],
  );
  assert.deepEqual(
    objectUrlsToRevokeAfterPreviewMerge({
      previousByOccurrenceToken: previous,
      nextByOccurrenceToken: previous,
    }),
    [],
  );
}

{
  const shared = "blob:shared-a";
  assert.deepEqual(
    objectUrlsToRevokeAfterPreviewMerge({
      previousByOccurrenceToken: {
        [shirtToken]: shared,
        [shirtTwoToken]: shared,
      },
      nextByOccurrenceToken: {
        [shirtTwoToken]: shared,
      },
    }),
    [],
  );
}

{
  const result = await runRestore({
    sources: [
      { ...sourceA(), occurrenceTokens: [shirtToken] },
      {
        sourceKey: "uploaded:source-a2",
        uploadedSourceRef: "ref-a2",
        occurrenceTokens: [shirtTwoToken],
      },
    ],
    prove: async (source) =>
      source.uploadedSourceRef === "ref-a"
        ? { status: "proved", blob: blobA }
        : { status: "proved", blob: blobC },
  });
  assert.equal(result.map[shirtToken]?.startsWith("blob:a:"), true);
  assert.equal(result.map[shirtTwoToken]?.startsWith("blob:c:"), true);
  assert.notEqual(result.map[shirtToken], result.map[shirtTwoToken]);
}

{
  const result = await runRestore({
    sources: [sourceA()],
    prove: async () => ({ status: "proved", blob: blobA }),
  });
  assert.equal(result.map[shirtToken]?.startsWith("blob:a:"), true);
  assert.equal(result.map[skirtToken], undefined);
}

{
  const catalogueOccurrence = {
    target: { garmentKey: "base:shirt", occurrenceToken: shirtToken },
    garmentType: "shirt" as const,
    label: "Shirt",
    status: "complete" as const,
    assignment: {
      garmentKey: "base:shirt",
      occurrenceToken: shirtToken,
      assignmentRevision: 2,
      sourceKind: "catalog" as const,
      sourceKey: "catalog:style-c",
      catalogStyleId: "style-c",
      eligibilityFingerprint: "fp",
    },
    assignmentLabel: "Catalogue C",
    assignmentImage: "https://catalogue.example/c.png",
  };
  const preview = resolveDesignStyleOccurrenceCardPreview({
    occurrence: catalogueOccurrence,
    uploadState: {
      status: "success",
      previewUrl: "blob:stale-upload",
      uploadedSourceRef: "ref-a",
    },
    selectedDesignPreviewByOccurrenceToken: { [shirtToken]: "blob:stale-upload" },
  });
  assert.equal(preview.image, "https://catalogue.example/c.png");
}

{
  assert.deepEqual(
    previewUpdatesForUploadedSource({
      occurrenceTokens: [shirtToken, skirtToken],
      previewUrl: "blob:shared",
    }),
    { [shirtToken]: "blob:shared", [skirtToken]: "blob:shared" },
  );
}

console.log(
  "PASS: restored uploaded preview publication keeps sibling occurrence previews",
);
