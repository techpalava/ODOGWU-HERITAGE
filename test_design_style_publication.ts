import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { StyleCategory } from "./src/types";
import {
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
} from "./src/utils/designStyleAuthority";
import {
  DesignStylePublicationError,
  isSupersededDesignStyleImageUnreferenced,
  publishDesignStyleWithDependencies,
  rejectDesignStyleHardDelete,
  type DesignStylePublicationDependencies,
} from "./src/utils/designStylePublication";

const style = (overrides: Partial<StyleCategory> = {}): StyleCategory => ({
  id: "published-style-1",
  name: "Published Style",
  description: "Atomic publication test style.",
  gender: "unisex",
  options: [],
  image: "https://firebasestorage.googleapis.com/old.webp",
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt"],
    requiredSelectionGroups: ["shirt_construction"],
    enabled: true,
  },
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const firstRecord = prepareAuthoritativeDesignStyleRecord({
  style: style(),
  lifecycle: "published",
  displayOrder: 1,
  referenceComposition: { status: "known", garmentTypes: ["shirt"] },
  currentRecord: null,
});

const createHarness = ({
  initial = firstRecord,
  failCommit = false,
  safeToDelete = true,
}: {
  initial?: AuthoritativeDesignStyleRecordV1 | null;
  failCommit?: boolean;
  safeToDelete?: boolean;
} = {}) => {
  let stored = initial;
  const events: string[] = [];
  const deleted: string[] = [];
  let publicProjection = stored
    ? projectPublishedDesignStyleRecord(stored)
    : null;
  const dependencies: DesignStylePublicationDependencies = {
    readCurrent: async () => {
      events.push("read");
      return stored
        ? {
            record: stored,
            legacyMigrationAllowed: false,
            currentImage: stored.presentation.image,
          }
        : null;
    },
    uploadReplacementImage: async () => {
      events.push("upload-new");
      return "https://firebasestorage.googleapis.com/new.webp";
    },
    commitAuthoritativeRecord: async ({
      record,
      expectedPublicRevision,
    }) => {
      events.push("commit");
      assert.equal(stored?.publicRevision || 0, expectedPublicRevision);
      if (failCommit) throw new Error("simulated Firestore failure");
      stored = record;
      publicProjection = projectPublishedDesignStyleRecord(record);
    },
    canDeleteSupersededImage: async () => {
      events.push("reference-check");
      return safeToDelete;
    },
    deleteImage: async (url) => {
      events.push(url.endsWith("old.webp") ? "delete-old" : "delete-new");
      deleted.push(url);
    },
  };
  return {
    dependencies,
    events,
    deleted,
    getStored: () => stored,
    getPublicProjection: () => publicProjection,
  };
};

const success = createHarness();
const replacement = await publishDesignStyleWithDependencies(
  {
    style: style({ image: "data:image/png;base64,AAAA" }),
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    expectedPublicRevision: firstRecord.publicRevision,
  },
  success.dependencies,
);
assert.deepEqual(success.events, [
  "read",
  "upload-new",
  "commit",
  "reference-check",
  "delete-old",
]);
assert.equal(replacement.presentation.image.endsWith("new.webp"), true);
assert.equal(success.getStored(), replacement);
assert.equal(success.deleted.includes(firstRecord.presentation.image), true);
assert.equal(success.getPublicProjection()?.name, "Published Style");

const retained = createHarness({ safeToDelete: false });
await publishDesignStyleWithDependencies(
  {
    style: style({ image: "data:image/png;base64,BBBB" }),
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    expectedPublicRevision: firstRecord.publicRevision,
  },
  retained.dependencies,
);
assert.equal(retained.deleted.includes(firstRecord.presentation.image), false);

const failed = createHarness({ failCommit: true });
await assert.rejects(
  publishDesignStyleWithDependencies(
    {
      style: style({ image: "data:image/png;base64,CCCC" }),
      lifecycle: "published",
      displayOrder: 1,
      referenceComposition: { status: "known", garmentTypes: ["shirt"] },
      expectedPublicRevision: firstRecord.publicRevision,
    },
    failed.dependencies,
  ),
  (error: unknown) =>
    error instanceof DesignStylePublicationError &&
    error.code === "AUTHORITATIVE_COMMIT_FAILED",
);
assert.deepEqual(failed.events, ["read", "upload-new", "commit", "delete-new"]);
assert.equal(failed.getStored(), firstRecord);
assert.equal(failed.getPublicProjection()?.name, "Published Style");
assert.equal(failed.deleted.includes(firstRecord.presentation.image), false);
assert.equal(
  failed.deleted.includes("https://firebasestorage.googleapis.com/new.webp"),
  true,
);

const stale = createHarness();
await assert.rejects(
  publishDesignStyleWithDependencies(
    {
      style: style({ name: "Stale Admin Edit" }),
      lifecycle: "published",
      displayOrder: 1,
      referenceComposition: { status: "known", garmentTypes: ["shirt"] },
      expectedPublicRevision: 0,
    },
    stale.dependencies,
  ),
  (error: unknown) =>
    error instanceof DesignStylePublicationError &&
    error.code === "STALE_PUBLIC_REVISION",
);
assert.deepEqual(stale.events, ["read"]);
assert.equal(stale.getStored(), firstRecord);

const lifecycle = createHarness();
const disabled = await publishDesignStyleWithDependencies(
  {
    style: style(),
    lifecycle: "disabled",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    expectedPublicRevision: firstRecord.publicRevision,
  },
  lifecycle.dependencies,
);
assert.equal(disabled.lifecycle, "disabled");
assert.equal(lifecycle.getPublicProjection(), null);

assert.throws(rejectDesignStyleHardDelete, /HARD_DELETE_PROHIBITED/);

assert.equal(
  isSupersededDesignStyleImageUnreferenced({
    styleId: firstRecord.id,
    hasLegacyOrderReference: false,
    hasOrderDesignSourceReference: false,
    styleReferenceIds: [],
  }),
  true,
);
assert.equal(
  isSupersededDesignStyleImageUnreferenced({
    styleId: firstRecord.id,
    hasLegacyOrderReference: false,
    hasOrderDesignSourceReference: false,
    styleReferenceIds: ["duplicated-style-2"],
  }),
  false,
);
assert.equal(
  isSupersededDesignStyleImageUnreferenced({
    styleId: firstRecord.id,
    hasLegacyOrderReference: true,
    hasOrderDesignSourceReference: false,
    styleReferenceIds: [],
  }),
  false,
);

console.log(
  "PASS: optimistic Design Style publication, image ordering, rollback, synchronization, lifecycle, and hard-delete policy",
);
