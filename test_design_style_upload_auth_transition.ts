import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  CustomerDesignUploadReference,
  GuestDesignDraft,
} from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { createGuestUploadedDesignOwnershipContinuity } from "./src/services/guestUploadedDesignOwnershipContinuity";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import {
  DESIGN_STYLE_DRAFT_FIELD,
  hydrateDesignStyleDraftPersistence,
  type PersistedDesignStyleDraftV2,
} from "./src/utils/designStyleDraftPersistence";
import type {
  GarmentDesignStyleAssignmentTarget,
  GarmentDesignStyleAssignmentV2,
} from "./src/utils/garmentScopedDesignStyleAssignment";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";

const ANONYMOUS_UID = "auth-transition-anonymous";
const ACCOUNT_UID = "auth-transition-account";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const target = (
  garmentKey: string,
  generation: number,
): GarmentDesignStyleAssignmentTarget => ({
  garmentKey,
  occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey,
    generation,
  }),
});

const shirtTarget = target("base:shirt:1", 1);
const skirtTarget = target("base:skirt:1", 2);
const shirtTwoTarget = target("base:shirt:2", 2);

const uploadedAssignment = ({
  target: assignmentTarget,
  sourceRef,
  assignmentRevision,
}: {
  target: GarmentDesignStyleAssignmentTarget;
  sourceRef: string;
  assignmentRevision: number;
}): GarmentDesignStyleAssignmentV2 => ({
  garmentKey: assignmentTarget.garmentKey,
  occurrenceToken: assignmentTarget.occurrenceToken,
  assignmentRevision,
  sourceKind: "uploaded",
  sourceKey: `uploaded:${sourceRef}`,
  uploadedSourceRef: sourceRef,
});

const envelopeFor = (
  assignments: readonly GarmentDesignStyleAssignmentV2[],
  revision = Math.max(0, ...assignments.map((item) => item.assignmentRevision)),
): PersistedDesignStyleDraftV2 => ({
  schemaVersion: 2,
  ledger: {
    schemaVersion: 2,
    revision,
    assignmentsByGarmentKey: Object.fromEntries(
      assignments.map((assignment) => [assignment.garmentKey, assignment]),
    ),
  },
});

const referenceFor = (
  ownerUid: string,
  designReferenceId = "source-a",
): CustomerDesignUploadReference =>
  createCustomerDesignUploadReference({
    ownerUid,
    mimeType: "image/png",
    designReferenceId,
    createdAt: "2026-09-04T12:00:00.000Z",
  });

const sourceFor = (
  reference: CustomerDesignUploadReference,
) =>
  createUploadedDesignSource({
    uploadReference: reference,
    fabricCapacityComposition: [
      { key: "shirt", garmentType: "shirt", fabricUnits: 1 },
      { key: "skirt", garmentType: "skirt", fabricUnits: 1 },
    ],
    demographic: "male",
  });

const makeDraft = ({
  envelope,
  sourceReference = referenceFor(ANONYMOUS_UID),
  selectedStyleId = null,
}: {
  envelope: PersistedDesignStyleDraftV2;
  sourceReference?: CustomerDesignUploadReference;
  selectedStyleId?: string | null;
}): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "design_style",
  currentStep: 3,
  garmentTypeSelection: {
    garmentTypes: ["shirt", "skirt"],
    demographic: "male",
    constructionByGarment: {},
    physicalOccurrenceIdentityState: {
      schemaVersion: 1,
      nextGeneration: 3,
      activeGenerationByGarmentKey: {
        [shirtTarget.garmentKey]: 1,
        [skirtTarget.garmentKey]: 2,
      },
    },
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId,
  designSource: sourceFor(sourceReference),
  confirmedStyleId: null,
  confirmedDesignSourceKey: `uploaded:${sourceReference.designReferenceId}`,
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 180,
    weight: 80,
    age: 40,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 16,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 42,
    isAiEstimated: false,
    unit: "inch",
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Auth Transition Customer",
  customerEmail: "transition@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 2,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: null,
    total: 0,
  },
  shippingSnapshot: {},
  fabricAllocations: [],
  updatedAt: "2026-09-04T12:00:00.000Z",
  [DESIGN_STYLE_DRAFT_FIELD]: envelope,
});

class MemoryCloudAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  readonly values = new Map<string, unknown>();
  readonly writes: string[] = [];

  async load(ownerUid: string): Promise<unknown | null> {
    return this.values.has(ownerUid) ? clone(this.values.get(ownerUid)) : null;
  }

  async commit(input: {
    ownerUid: string;
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }) {
    const current = this.values.get(input.ownerUid) as
      | { revision?: number; createdAt?: string }
      | undefined;
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== input.expectedRevision) {
      return {
        status: "conflict" as const,
        currentValue: current ? clone(current) : null,
      };
    }
    const revision = (currentRevision || 0) + 1;
    const value = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision,
      createdAt: current?.createdAt || "2026-09-04T12:00:00.000Z",
      updatedAt: "2026-09-04T12:01:00.000Z",
      ...(input.lifecycleStatus === "active" ? { draft: clone(input.draft) } : {}),
    };
    this.values.set(input.ownerUid, value);
    this.writes.push(input.ownerUid);
    return { status: "saved" as const, value: clone(value) };
  }
}

const transferGuestOwnership = async (
  initialDraft: GuestDesignDraft,
): Promise<GuestDesignDraft> => {
  let storedDraft = clone(initialDraft);
  const continuity = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(storedDraft),
    saveDraft: (draft) => {
      storedDraft = clone(draft);
    },
    claimClient: {
      createOwnershipClaim: async () => ({
        claimToken: "auth-transition-claim-token-1234567890",
        expiresAt: "2026-09-05T12:00:00.000Z",
      }),
    },
    transferClient: {
      transferDraftOwnership: async ({ draftReference }) =>
        referenceFor(ACCOUNT_UID, draftReference.designReferenceId),
    },
    now: () => new Date("2026-09-04T12:00:00.000Z").getTime(),
  });
  assert.deepEqual(
    await continuity.prepare({
      uid: ANONYMOUS_UID,
      getIdToken: async () => "anonymous-token",
    }),
    { status: "ready", method: "uid_preserved" },
  );
  assert.deepEqual(
    await continuity.ensure({
      uid: ACCOUNT_UID,
      getIdToken: async () => "account-token",
    }),
    { status: "ready", method: "transferred" },
  );
  return storedDraft;
};

const synchronize = async (draft: GuestDesignDraft) => {
  const adapter = new MemoryCloudAdapter();
  const repository = createAuthenticatedFutureDraftRepository({
    adapter,
    getIdentity: () => ({ status: "authenticated", ownerUid: ACCOUNT_UID }),
  });
  const result = await repository.synchronize(draft);
  assert.equal(result.status, "guest_transferred");
  return { result, adapter };
};

const assignmentSnapshot = (draft: GuestDesignDraft) =>
  clone(draft[DESIGN_STYLE_DRAFT_FIELD] as PersistedDesignStyleDraftV2);

// A. One guest uploaded assignment preserves source and exact occurrence identity.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
  ]);
  const guest = makeDraft({ envelope });
  const transferred = await transferGuestOwnership(guest);
  assert.equal(transferred.designSource?.kind, "uploaded");
  assert.equal(
    transferred.designSource?.kind === "uploaded"
      ? transferred.designSource.uploadReference.designReferenceId
      : null,
    "source-a",
  );
  const { result } = await synchronize(transferred);
  assert.deepEqual(assignmentSnapshot(result.draft!), envelope);
}

// B. Different exact occurrence uploads survive independently.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
    uploadedAssignment({ target: skirtTarget, sourceRef: "source-b", assignmentRevision: 2 }),
  ]);
  const transferred = await transferGuestOwnership(makeDraft({ envelope }));
  const { result } = await synchronize(transferred);
  assert.deepEqual(assignmentSnapshot(result.draft!), envelope);
}

// C. Repeated Shirt occurrences remain keyed by their exact independent identities.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
    uploadedAssignment({ target: shirtTwoTarget, sourceRef: "source-b", assignmentRevision: 2 }),
  ]);
  const transferred = await transferGuestOwnership(makeDraft({ envelope }));
  const { result } = await synchronize(transferred);
  const ledger = assignmentSnapshot(result.draft!).ledger;
  assert.equal(ledger.assignmentsByGarmentKey[shirtTarget.garmentKey]?.sourceKind, "uploaded");
  assert.equal(ledger.assignmentsByGarmentKey[shirtTwoTarget.garmentKey]?.sourceKind, "uploaded");
  assert.notEqual(
    ledger.assignmentsByGarmentKey[shirtTarget.garmentKey]?.occurrenceToken,
    ledger.assignmentsByGarmentKey[shirtTwoTarget.garmentKey]?.occurrenceToken,
  );
}

// D. Explicit shared-source references remain two explicit references.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
    uploadedAssignment({ target: skirtTarget, sourceRef: "source-a", assignmentRevision: 2 }),
  ]);
  const transferred = await transferGuestOwnership(makeDraft({ envelope }));
  const { result } = await synchronize(transferred);
  const assignments = Object.values(assignmentSnapshot(result.draft!).ledger.assignmentsByGarmentKey);
  assert.equal(assignments.length, 2);
  assert.deepEqual(
    assignments.map((assignment) =>
      assignment.sourceKind === "uploaded" ? assignment.uploadedSourceRef : null),
    ["source-a", "source-a"],
  );
}

// E. An authoritative detached V2 ledger is not resurrected by the retained scalar source.
{
  const envelope = envelopeFor([], 2);
  const transferred = await transferGuestOwnership(makeDraft({ envelope }));
  const { result } = await synchronize(transferred);
  assert.deepEqual(
    assignmentSnapshot(result.draft!).ledger.assignmentsByGarmentKey,
    {},
  );
}

// F. Supported V2 outranks disagreeing scalar uploaded evidence.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
  ]);
  const rawDraft = makeDraft({
    envelope,
    sourceReference: referenceFor(ACCOUNT_UID, "stale-scalar-source"),
    selectedStyleId: "stale-scalar-source",
  });
  const hydration = hydrateDesignStyleDraftPersistence({
    rawDraft,
    activeOccurrences: [
      {
        garmentKey: shirtTarget.garmentKey,
        garmentType: "shirt",
        sourceRole: "main",
        fabricUnits: 1,
        occurrenceGeneration: 1,
      },
    ],
    authority: {
      catalogueState: "ready",
      catalogStylesById: {},
      uploadedSourcesByKey: {
        "uploaded:source-a": {
          sourceKey: "uploaded:source-a",
          uploadedSourceRef: "source-a",
          status: "confirmed",
          eligibleOccurrenceTokens: [shirtTarget.occurrenceToken],
        },
      },
    },
  });
  assert.equal(hydration.ledger?.assignmentsByGarmentKey[shirtTarget.garmentKey]?.sourceKind, "uploaded");
  const assignment = hydration.ledger?.assignmentsByGarmentKey[shirtTarget.garmentKey];
  assert.equal(
    assignment?.sourceKind === "uploaded" ? assignment.uploadedSourceRef : null,
    "source-a",
  );
}

// G. The production auth generation boundary rejects a stale pre-auth callback.
{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const identityTransitionStart = studioSource.indexOf(
    "invalidateFutureGarmentRemovalRetention();\n    futureDraftIdentityGenerationRef.current += 1;",
  );
  assert.ok(identityTransitionStart >= 0);
  const identityTransition = studioSource.slice(
    identityTransitionStart,
    identityTransitionStart + 1_200,
  );
  assert.match(identityTransition, /futureDraftIdentityGenerationRef\.current \+= 1/);
  assert.match(identityTransition, /clearFutureDesignStyleRuntimeHydration\(\)/);
  const uploadSuccess = studioSource.match(
    /onSuccess: \(source\) => \{[\s\S]*?applyFutureDesignStyleMutationLedger\(latest, result\.ledger\);/,
  )?.[0] || "";
  assert.match(uploadSuccess, /latest\.identityKey !== captured\.identityKey/);
  assert.match(uploadSuccess, /latest\.identityGeneration !== captured\.identityGeneration/);
  assert.match(uploadSuccess, /latest\.runtimeGeneration !== captured\.runtimeGeneration/);
  assert.match(uploadSuccess, /finishFutureDesignStyleUploadWithoutMutation/);
}

// H. Transfer failure preserves the guest ledger and fabricates no account draft.
{
  const envelope = envelopeFor([
    uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
  ]);
  let storedDraft = makeDraft({ envelope });
  const adapter = new MemoryCloudAdapter();
  const continuity = createGuestUploadedDesignOwnershipContinuity({
    loadDraft: () => clone(storedDraft),
    saveDraft: (draft) => {
      storedDraft = clone(draft);
    },
    claimClient: {
      createOwnershipClaim: async () => ({
        claimToken: "auth-transition-failure-token-123456",
        expiresAt: "2026-09-05T12:00:00.000Z",
      }),
    },
    transferClient: {
      transferDraftOwnership: async () => {
        throw new Error("TRANSFER_FAILED");
      },
    },
    now: () => new Date("2026-09-04T12:00:00.000Z").getTime(),
  });
  await continuity.prepare({
    uid: ANONYMOUS_UID,
    getIdToken: async () => "anonymous-token",
  });
  assert.deepEqual(
    await continuity.ensure({
      uid: ACCOUNT_UID,
      getIdToken: async () => "account-token",
    }),
    { status: "transfer_required", reason: "transfer_failed" },
  );
  assert.deepEqual(assignmentSnapshot(storedDraft), envelope);
  assert.equal(
    storedDraft.designSource?.kind === "uploaded"
      ? storedDraft.designSource.uploadReference.ownerUid
      : null,
    ANONYMOUS_UID,
  );
  assert.equal(adapter.writes.length, 0);
}

assert.deepEqual(
  assignmentSnapshot(
    normalizeGuestDesignDraft(
      makeDraft({
        envelope: envelopeFor([
          uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
        ]),
      }),
    ),
  ).ledger.assignmentsByGarmentKey[shirtTarget.garmentKey],
  uploadedAssignment({ target: shirtTarget, sourceRef: "source-a", assignmentRevision: 1 }),
);

console.log("PASS: occurrence-scoped uploaded Design Style ownership continuity across auth");
