import assert from "node:assert/strict";
import type { GuestDesignDraft } from "./src/types";
import {
  createDesignStylePersistenceAcknowledgement,
  getPersistedDesignStyleEnvelopeFingerprint,
  proveUploadedSourceAbsentFromPersistedDesignStyle,
  DESIGN_STYLE_DRAFT_FIELD,
  type PersistedDesignStyleDraftV2,
} from "./src/utils/designStyleDraftPersistence";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const envelopeFor = (
  revision: number,
  assignments: Readonly<Record<string, string | null>>,
): PersistedDesignStyleDraftV2 => ({
  schemaVersion: 2,
  ledger: {
    schemaVersion: 2,
    revision,
    assignmentsByGarmentKey: Object.fromEntries(
      Object.entries(assignments).flatMap(([garmentKey, sourceRef], index) =>
        sourceRef === null
          ? []
          : [[
              garmentKey,
              {
                garmentKey,
                occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
                  garmentKey,
                  generation: index + 1,
                }),
                assignmentRevision: revision,
                sourceKind: "uploaded" as const,
                sourceKey: `uploaded:${sourceRef}`,
                uploadedSourceRef: sourceRef,
              },
            ]],
      ),
    ),
  },
});

const draftFor = (envelope: PersistedDesignStyleDraftV2): GuestDesignDraft =>
  ({ [DESIGN_STYLE_DRAFT_FIELD]: envelope }) as GuestDesignDraft;

const acknowledge = (
  envelope: PersistedDesignStyleDraftV2,
  overrides: Partial<Parameters<typeof createDesignStylePersistenceAcknowledgement>[0]> = {},
) =>
  createDesignStylePersistenceAcknowledgement({
    persistenceKind: "guest",
    draftIdentity: "guest",
    saveGeneration: 4,
    currentSaveGeneration: 4,
    identityGeneration: 7,
    currentIdentityGeneration: 7,
    persistedDraft: draftFor(envelope),
    ...overrides,
  });

const sourceAOnly = envelopeFor(1, { "base:shirt": "source-A" });
const sourceAAndB = envelopeFor(2, {
  "base:shirt": "source-A",
  "base:skirt": "source-B",
});
const sourceBOnly = envelopeFor(3, { "base:skirt": "source-B" });
const sharedA = envelopeFor(4, {
  "base:shirt": "source-A",
  "base:skirt": "source-A",
});
const catalogOnly = envelopeFor(5, {});

const guestAcknowledgement = acknowledge(sourceAAndB);
assert.ok(guestAcknowledgement);
assert.equal(guestAcknowledgement.persistenceKind, "guest");
assert.equal(guestAcknowledgement.designStyleLedgerRevision, 2);
assert.equal(
  guestAcknowledgement.designStyleEnvelopeFingerprint,
  getPersistedDesignStyleEnvelopeFingerprint(sourceAAndB),
);
assert.deepEqual(guestAcknowledgement.persistedUploadedSourceRefs, ["source-A", "source-B"]);

const authenticatedAcknowledgement = acknowledge(sourceAOnly, {
  persistenceKind: "authenticated",
  draftIdentity: "authenticated:uid-a",
});
assert.ok(authenticatedAcknowledgement);
assert.equal(authenticatedAcknowledgement.persistenceKind, "authenticated");
assert.equal(authenticatedAcknowledgement.designStyleLedgerRevision, 1);

const absentAcknowledgement = acknowledge(sourceBOnly);
assert.ok(absentAcknowledgement);
const expectedAbsentProof = {
  acknowledgement: absentAcknowledgement,
  expectedDraftIdentity: "guest",
  expectedLedgerRevision: 3,
  expectedFingerprint: getPersistedDesignStyleEnvelopeFingerprint(sourceBOnly)!,
  expectedSaveGeneration: 4,
  expectedIdentityGeneration: 7,
  currentSaveGeneration: 4,
  currentIdentityGeneration: 7,
  uploadedSourceRef: "source-A",
};
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle(expectedAbsentProof),
  { status: "proven-absent" },
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    acknowledgement: acknowledge(sourceAOnly),
    expectedLedgerRevision: 1,
    expectedFingerprint: getPersistedDesignStyleEnvelopeFingerprint(sourceAOnly)!,
  }),
  { status: "source-still-present" },
);
assert.deepEqual(acknowledge(sharedA)?.persistedUploadedSourceRefs, ["source-A"]);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    acknowledgement: acknowledge(sharedA),
    expectedLedgerRevision: 4,
    expectedFingerprint: getPersistedDesignStyleEnvelopeFingerprint(sharedA)!,
  }),
  { status: "source-still-present" },
);
assert.deepEqual(acknowledge(catalogOnly)?.persistedUploadedSourceRefs, []);

assert.equal(
  acknowledge(sourceAOnly, { saveGeneration: 4, currentSaveGeneration: 5 }),
  null,
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    currentSaveGeneration: 5,
  }),
  { status: "stale-acknowledgement" },
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    expectedLedgerRevision: 4,
  }),
  { status: "revision-mismatch" },
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    expectedFingerprint: "different-payload",
  }),
  { status: "fingerprint-mismatch" },
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    expectedSaveGeneration: 5,
  }),
  { status: "generation-mismatch" },
);
assert.deepEqual(
  proveUploadedSourceAbsentFromPersistedDesignStyle({
    ...expectedAbsentProof,
    expectedDraftIdentity: "authenticated:uid-a",
  }),
  { status: "wrong-draft" },
);
assert.equal(
  createDesignStylePersistenceAcknowledgement({
    persistenceKind: "guest",
    draftIdentity: "guest",
    saveGeneration: 1,
    currentSaveGeneration: 1,
    identityGeneration: 1,
    currentIdentityGeneration: 1,
    persistedDraft: {} as GuestDesignDraft,
  }),
  null,
);
assert.equal(
  createDesignStylePersistenceAcknowledgement({
    persistenceKind: "guest",
    draftIdentity: "guest",
    saveGeneration: 1,
    currentSaveGeneration: 1,
    identityGeneration: 1,
    currentIdentityGeneration: 1,
    persistedDraft: {
      [DESIGN_STYLE_DRAFT_FIELD]: { schemaVersion: 99 },
    } as GuestDesignDraft,
  }),
  null,
);
assert.equal(
  DESIGN_STYLE_DRAFT_FIELD in (guestAcknowledgement as unknown as object),
  false,
);

console.log("Design Style persistence acknowledgement tests passed.");
