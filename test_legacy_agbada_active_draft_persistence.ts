import assert from "node:assert/strict";
import type {
  AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import {
  createAuthenticatedFutureDraftRepository,
} from "./src/services/authenticatedFutureDraftService";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import type {
  GarmentConstructionPricingResolution,
  GuestDesignDraft,
} from "./src/types";
import {
  createDesignStudioDraftRepository,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeConstruction = (
  garmentType: "shirt" | "agbada",
  priceCents: number,
): GarmentConstructionPricingResolution => ({
  status: "resolved",
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:shirt_construction:default`,
      optionId: `${garmentType}_default`,
      selectionGroup: "shirt_construction",
      priceCents,
      price: priceCents / 100,
    },
  ],
  totalPriceCents: priceCents,
  totalPrice: priceCents / 100,
});

const makeLegacyDraft = (): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "summary",
  currentStep: 7,
  garmentTypeSelection: {
    garmentTypes: ["shirt", "agbada"],
    audienceSelection: { schemaVersion: 1, demographics: ["male"] },
    demographic: "male",
    constructionByGarment: {
      shirt: makeConstruction("shirt", 6500),
      agbada: makeConstruction("agbada", 14000),
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
    enteredByRoute: {
      low_risk: { shared: {}, byGarmentKey: {} },
      medium_risk: { shared: {}, byGarmentKey: {} },
      high_risk: { shared: {}, byGarmentKey: {} },
    },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "legacy-measurement-fingerprint",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  },
  futureShippingState: {
    schemaVersion: 1,
    fulfilmentMethod: null,
    destinationSelectionMode: null,
    otherDestinationCountry: "",
    customerInformation: {
      fullName: "Draft Owner",
      phone: "+31000000000",
      email: "owner@example.com",
      deliveryAddress: {
        addressLine1: "",
        addressLine2: "",
        city: "",
        postalCode: "",
        countryCode: "",
      },
      comment: "",
    },
    destinationZoneId: null,
    destinationZoneSource: null,
    quoteReference: null,
  },
  selectedFabricCode: "ODG-009",
  selectedStyleId: "casual-native-1",
  designSource: {
    kind: "catalog",
    sourceKey: "catalog:casual-native-1",
    styleId: "casual-native-1",
  },
  confirmedStyleId: "casual-native-1",
  confirmedDesignSourceKey: "catalog:casual-native-1",
  priceActivatedFabricCode: "ODG-009",
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
  customerName: "Draft Owner",
  customerEmail: "owner@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 2,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    pricingModel: "all_inclusive_garment_construction",
    garmentConstructionSubtotal: 205,
    clothingPrice: 205,
    customDetailsPrice: 0,
    selectedDesignPrice: 205,
    eindhovenToDestinationShipping: null,
    total: 205,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-shirt",
      fabricCode: "ODG-009",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
    {
      allocationId: "allocation-agbada",
      fabricCode: "ODG-010",
      garmentAssignments: [
        {
          garmentKey: "base:agbada",
          code: "AGBADA",
          garmentType: "agbada",
          fabricUnits: 2,
        },
      ],
    },
  ],
  updatedAt: "2026-09-02T12:00:00.000Z",
});

const assertSanitized = (draft: GuestDesignDraft) => {
  assert.deepEqual(draft.garmentTypeSelection?.garmentTypes, ["shirt"]);
  assert.equal(
    draft.garmentTypeSelection?.constructionByGarment.agbada,
    undefined,
  );
  assert.equal(
    draft.fabricAllocations?.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentType === "agbada",
      ),
    ),
    false,
  );
  assert.equal(draft.pricingBreakdown.selectedDesignPrice, null);
};

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const localStorage = new MemoryStorage();
const localRepository = createDesignStudioDraftRepository({
  storage: localStorage,
  legacy: { load: () => null },
  normalizeDraft: normalizeGuestDesignDraft,
  legacySourceVersion: "test-legacy-v1",
});
const localSave = localRepository.saveFutureDraftV1(makeLegacyDraft());
assert.equal(localSave.status, "saved");
assertSanitized(localSave.status === "saved" ? localSave.draft : makeLegacyDraft());
const localEnvelope = JSON.parse(
  localStorage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE) || "null",
) as { draft: GuestDesignDraft };
assertSanitized(localEnvelope.draft);
const localLoad = localRepository.loadFutureDraftV1();
assert.equal(localLoad.status, "loaded");
if (localLoad.status === "loaded") assertSanitized(localLoad.draft);

// A later stale local payload must be normalized again at the save boundary.
const staleLocalSave = localRepository.saveFutureDraftV1(makeLegacyDraft());
assert.equal(staleLocalSave.status, "saved");
if (staleLocalSave.status === "saved") assertSanitized(staleLocalSave.draft);

class MemoryCloudAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  readonly values = new Map<string, unknown>();
  readonly committedDrafts: GuestDesignDraft[] = [];

  async load(ownerUid: string): Promise<unknown | null> {
    return this.values.has(ownerUid)
      ? clone(this.values.get(ownerUid))
      : null;
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
    const timestamp = `2026-09-02T12:${String(revision).padStart(2, "0")}:00.000Z`;
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
    if (input.draft) this.committedDrafts.push(clone(input.draft));
    this.values.set(input.ownerUid, value);
    return { status: "saved" as const, value: clone(value) };
  }
}

const cloudAdapter = new MemoryCloudAdapter();
const cloudRepository = createAuthenticatedFutureDraftRepository({
  adapter: cloudAdapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: "cloud-owner",
  }),
});
const cloudSave = await cloudRepository.save(makeLegacyDraft(), null);
assert.equal(cloudSave.status, "saved");
assert.equal(cloudAdapter.committedDrafts.length, 1);
assertSanitized(cloudAdapter.committedDrafts[0]);

// Even a current-revision stale payload is sanitized before the cloud adapter.
const staleCloudSave = await cloudRepository.save(makeLegacyDraft(), 1);
assert.equal(staleCloudSave.status, "saved");
assert.equal(cloudAdapter.committedDrafts.length, 2);
assertSanitized(cloudAdapter.committedDrafts[1]);
assert.equal((await cloudRepository.save(makeLegacyDraft(), 1)).status, "conflict");

const rawCloudAdapter = new MemoryCloudAdapter();
rawCloudAdapter.values.set("cloud-owner", {
  schemaVersion: 1,
  lifecycleStatus: "active",
  revision: 1,
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
  draft: makeLegacyDraft(),
});
const rawCloudRepository = createAuthenticatedFutureDraftRepository({
  adapter: rawCloudAdapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: "cloud-owner",
  }),
});
const cloudLoad = await rawCloudRepository.load();
assert.equal(cloudLoad.status, "loaded");
if (cloudLoad.status === "loaded") {
  assertSanitized(cloudLoad.record.draft!);
  const persistedSanitized = await rawCloudRepository.save(
    cloudLoad.record.draft!,
    cloudLoad.record.revision,
  );
  assert.equal(persistedSanitized.status, "saved");
  assertSanitized(rawCloudAdapter.committedDrafts[0]);
}

const makeUploadedOnlyDraft = (ownerUid: string): GuestDesignDraft => {
  const draft = makeLegacyDraft();
  draft.garmentTypeSelection = {
    ...draft.garmentTypeSelection!,
    garmentTypes: ["agbada"],
    constructionByGarment: {
      agbada: makeConstruction("agbada", 14000),
    },
  };
  draft.selectedStyleId = null;
  draft.confirmedStyleId = null;
  draft.designSource = {
    kind: "uploaded",
    sourceKey: "uploaded:legacy-upload-reference",
    uploadReference: {
      ownerUid,
      designReferenceId: "legacy-upload-reference",
      storagePath: `customer-design-drafts/${ownerUid}/legacy-upload-reference/original.png`,
      mimeType: "image/png",
      createdAt: "2026-09-02T10:00:00.000Z",
    },
    fabricCapacityComposition: [
      { key: "base:agbada", garmentType: "agbada", fabricUnits: 2 },
    ],
    demographic: "male",
    displayLabel: "Your Uploaded Design",
  };
  draft.confirmedDesignSourceKey = "uploaded:legacy-upload-reference";
  draft.fabricAllocations = [clone(makeLegacyDraft().fabricAllocations![1])];
  return draft;
};

const emptyUploadSave = await cloudRepository.save(
  makeUploadedOnlyDraft("cloud-owner"),
  2,
);
assert.equal(emptyUploadSave.status, "saved");
if (emptyUploadSave.status === "saved") {
  assert.equal(emptyUploadSave.record.draft?.designSource?.kind, "uploaded");
  assert.deepEqual(
    emptyUploadSave.record.draft?.designSource?.kind === "uploaded"
      ? emptyUploadSave.record.draft.designSource.fabricCapacityComposition
      : null,
    [],
  );
}

const foreignEmptyUploadSave = await cloudRepository.save(
  makeUploadedOnlyDraft("foreign-owner"),
  3,
);
assert.equal(foreignEmptyUploadSave.status, "blocked");
assert.equal(
  foreignEmptyUploadSave.status === "blocked"
    ? foreignEmptyUploadSave.reason
    : null,
  "uploaded_design_owner_mismatch",
);

console.log(
  "PASS: legacy Agbada migration is enforced at local and authenticated draft persistence boundaries",
);
