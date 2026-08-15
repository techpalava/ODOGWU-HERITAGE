import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DesignStudioStageId, GuestDesignDraft } from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  resolveAuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeDraft = (
  stage: DesignStudioStageId,
  name = "Future Customer",
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: stage,
  currentStep: 3,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {
      shirt: {
        status: "resolved",
        garmentType: "shirt",
        components: [],
        totalPriceCents: 6500,
        totalPrice: 65,
      },
    },
  },
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  },
  futureMeasurementState: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "measurement-input-v1",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: "STYLE-A",
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
  customerName: name,
  customerEmail: "future@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 4,
    fabricSewingCost: 4.06,
    constructionSewingCost: 65,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: null,
    total: 200.31,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
  ],
  updatedAt: "2026-08-15T10:00:00.000Z",
});

class MemoryAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
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
    const timestamp = `2026-08-15T10:${String(revision).padStart(2, "0")}:00.000Z`;
    const value = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision,
      createdAt: current?.createdAt || timestamp,
      updatedAt: timestamp,
      ...(input.lifecycleStatus === "active"
        ? { draft: clone(input.draft) }
        : {}),
    };
    this.values.set(input.ownerUid, value);
    this.writes.push(input.ownerUid);
    return { status: "saved" as const, value: clone(value) };
  }
}

const adapter = new MemoryAdapter();
let identity: AuthenticatedFutureDraftIdentity = {
  status: "authenticated",
  ownerUid: "uid-a",
};
const repository = createAuthenticatedFutureDraftRepository({
  adapter,
  getIdentity: () => identity,
});

const created = await repository.save(makeDraft("garment_type"), null);
assert.equal(created.status, "saved");
assert.equal(created.status === "saved" && created.record.revision, 1);
assert.deepEqual(adapter.writes, ["uid-a"]);

const loaded = await repository.load();
assert.equal(loaded.status, "loaded");
assert.equal(
  loaded.status === "loaded" && loaded.record.draft?.currentStageId,
  "garment_type",
);

const updated = await repository.save(makeDraft("fabric"), 1);
assert.equal(updated.status, "saved");
assert.equal(updated.status === "saved" && updated.record.revision, 2);

const staleWrite = await repository.save(makeDraft("design_style"), 1);
assert.equal(staleWrite.status, "conflict");
assert.equal(
  staleWrite.status === "conflict" && staleWrite.currentRecord?.revision,
  2,
);

const cleared = await repository.clear(2);
assert.equal(cleared.status, "saved");
assert.equal(cleared.status === "saved" && cleared.record.lifecycleStatus, "cleared");
assert.equal(cleared.status === "saved" && "draft" in cleared.record, false);
assert.equal((await repository.save(makeDraft("summary"), 2)).status, "conflict");
assert.equal((await repository.synchronize(makeDraft("summary"))).status, "cloud_cleared");

identity = { status: "authenticated", ownerUid: "uid-b" };
assert.equal((await repository.load()).status, "absent");
assert.equal(adapter.values.has("uid-a"), true);
assert.equal(adapter.values.has("uid-b"), false);
identity = { status: "guest" };
assert.equal((await repository.load()).status, "blocked");
assert.equal((await repository.save(makeDraft("fabric"), null)).status, "blocked");

const transferAdapter = new MemoryAdapter();
let transferIdentity: AuthenticatedFutureDraftIdentity = {
  status: "authenticated",
  ownerUid: "uid-transfer",
};
const transferRepository = createAuthenticatedFutureDraftRepository({
  adapter: transferAdapter,
  getIdentity: () => transferIdentity,
});
const guestDraft = makeDraft("custom_details");
const transferred = await transferRepository.synchronize(guestDraft);
assert.equal(transferred.status, "guest_transferred");
assert.equal(transferAdapter.writes.length, 1);
assert.equal((await transferRepository.synchronize(guestDraft)).status, "equivalent");

const cloudOnly = await transferRepository.synchronize(null);
assert.equal(cloudOnly.status, "cloud_restored");
assert.equal(cloudOnly.draft?.currentStageId, "custom_details");

const differentGuest = makeDraft("custom_details", "Different Customer");
const conflict = await transferRepository.synchronize(differentGuest);
assert.equal(conflict.status, "conflict");
assert.equal(conflict.status === "conflict" && conflict.cloudDraft.customerName, "Future Customer");
assert.equal(conflict.status === "conflict" && conflict.guestDraft.customerName, "Different Customer");
assert.equal(transferAdapter.writes.length, 1);

transferAdapter.values.set("uid-invalid", { schemaVersion: 999 });
transferIdentity = { status: "authenticated", ownerUid: "uid-invalid" };
assert.equal((await transferRepository.load()).status, "invalid");
const malformedGuest = { currentStageId: "fabric" };
transferIdentity = { status: "authenticated", ownerUid: "uid-empty" };
assert.equal((await transferRepository.synchronize(malformedGuest)).status, "invalid");
assert.equal(transferAdapter.values.has("uid-empty"), false);

const sensitiveDraft = makeDraft("try_on") as GuestDesignDraft & {
  paymentDetails?: { cardNumber: string };
};
sensitiveDraft.paymentDetails = { cardNumber: "4111111111111111" };
assert.equal((await transferRepository.save(sensitiveDraft, null)).status, "invalid");

const redirectedDraft = makeDraft("measurement") as GuestDesignDraft & {
  ownerUid?: string;
};
redirectedDraft.ownerUid = "uid-attacker";
const redirected = await transferRepository.save(redirectedDraft, null);
assert.equal(redirected.status, "saved");
assert.equal(transferAdapter.values.has("uid-empty"), true);
assert.equal(transferAdapter.values.has("uid-attacker"), false);

const stages: DesignStudioStageId[] = [
  "garment_type",
  "fabric",
  "design_style",
  "custom_details",
  "try_on",
  "measurement",
  "summary",
  "shipping",
  "payment",
];
for (const [index, stage] of stages.entries()) {
  const ownerUid = `uid-stage-${index}`;
  transferIdentity = { status: "authenticated", ownerUid };
  const saved = await transferRepository.save(makeDraft(stage), null);
  assert.equal(
    saved.status,
    "saved",
    saved.status === "invalid" ? `${stage}: ${saved.reason}` : stage,
  );
  const restored = await transferRepository.load();
  assert.equal(
    restored.status === "loaded" && restored.record.draft?.currentStageId,
    stage,
  );
}

assert.deepEqual(
  resolveAuthenticatedFutureDraftIdentity({
    authResolved: false,
    firebaseUser: null,
    customer: null,
  }),
  { status: "resolving" },
);
assert.equal(
  resolveAuthenticatedFutureDraftIdentity({
    authResolved: true,
    firebaseUser: null,
    customer: { name: "A", email: "a@example.com", ownerUid: "uid-a" },
  }).status,
  "blocked",
);
assert.equal(
  resolveAuthenticatedFutureDraftIdentity({
    authResolved: true,
    firebaseUser: { uid: "uid-a", email: "a@example.com", isAnonymous: false },
    customer: { name: "B", email: "b@example.com", ownerUid: "uid-b" },
  }).status,
  "blocked",
);
assert.equal(
  resolveAuthenticatedFutureDraftIdentity({
    authResolved: true,
    firebaseUser: { uid: "uid-a", email: "a@example.com", isAnonymous: false },
    customer: { name: "A", email: "a@example.com", ownerUid: "uid-a" },
  }).status,
  "authenticated",
);

const appSource = readFileSync("src/App.tsx", "utf8");
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.doesNotMatch(appSource, /journeyMode=/);
assert.doesNotMatch(studioSource, /legacy_five_stage/);
assert.match(studioSource, /synchronization\.status === "cloud_cleared"/);
assert.match(
  studioSource,
  /clearFutureDesignDraftAfterCloudSynchronization\(\)/,
  "A confirmed transfer must remove the local customer payload before account switching.",
);
assert.match(
  studioSource,
  /futureDraftPersistenceStatus !== "ready"/,
  "A cleared or conflicted cloud record must block autosave.",
);
assert.match(studioSource, /createFirebaseAuthenticatedFutureDraftRepository/);
assert.match(studioSource, /futureDraftIdentity\.status === "authenticated"/);
assert.doesNotMatch(studioSource, /isFutureNineStageMode/);

console.log("PASS: authenticated future draft persistence and isolation");
