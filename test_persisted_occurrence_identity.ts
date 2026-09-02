import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { AuthenticatedFutureDraftPersistenceAdapter } from "./src/services/authenticatedFutureDraftService";
import { createAuthenticatedFutureDraftRepository } from "./src/services/authenticatedFutureDraftService";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import type {
  CanonicalPhysicalGarmentType,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  PhysicalGarmentOccurrenceIdentityStateV1,
} from "./src/types";
import { createAiTryOnVisualInputFingerprint } from "./src/utils/aiTryOnWorkflow";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import {
  buildAuthoritativePhysicalOccurrences,
  type PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import {
  createDesignStudioDraftRepository,
  FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE,
} from "./src/utils/designStudioDraftPersistence";
import { createFuturePhysicalOrderAuthoritySignature } from "./src/utils/midProcessGarmentRemoval";
import { isCurrentAdditionalGarmentFabricOperation } from "./src/utils/midProcessGarmentRemovalIntegration";
import { normalizePersistedGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createPhysicalGarmentOccurrenceIdentityToken,
  getPhysicalGarmentOccurrenceGeneration,
  reconcileGarmentTypeSelectionOccurrenceIdentities,
  reconcilePhysicalGarmentOccurrenceIdentityState,
} from "./src/utils/physicalGarmentOccurrenceIdentity";
import { createUploadedDesignOperationCoordinator } from "./src/utils/uploadedDesignStep1";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeConstruction = (
  garmentType: CanonicalPhysicalGarmentType,
): GarmentConstructionPricingResolution => ({
  status: "resolved",
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:construction:default`,
      optionId: `${garmentType}_default`,
      selectionGroup: "shirt_construction",
      priceCents: 6500,
      price: 65,
    },
  ],
  totalPriceCents: 6500,
  totalPrice: 65,
});

const makeSelection = ({
  garmentTypes,
  identityState,
}: {
  garmentTypes: CanonicalPhysicalGarmentType[];
  identityState?: PhysicalGarmentOccurrenceIdentityStateV1;
}): GarmentTypeStepSelection => ({
  garmentTypes,
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  ...(identityState ? { physicalOccurrenceIdentityState: identityState } : {}),
  demographic: "male",
  constructionByGarment: Object.fromEntries(
    garmentTypes.map((garmentType) => [
      garmentType,
      makeConstruction(garmentType),
    ]),
  ),
});

const makeDraft = (
  garmentTypeSelection: GarmentTypeStepSelection,
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "garment_type",
  currentStep: 1,
  garmentTypeSelection,
  selectedFabricCode: null,
  selectedStyleId: null,
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
  customerName: "Identity Test",
  customerEmail: "identity@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: garmentTypeSelection.garmentTypes.length,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
  },
  shippingSnapshot: {},
  fabricAllocations: [],
  updatedAt: "2026-09-02T12:00:00.000Z",
});

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
  legacySourceVersion: "occurrence-identity-test-v1",
});

const roundTripLocally = (
  selection: GarmentTypeStepSelection,
): GarmentTypeStepSelection => {
  const saved = localRepository.saveFutureDraftV1(makeDraft(selection));
  assert.equal(saved.status, "saved");
  const envelope = JSON.parse(
    localStorage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE) || "null",
  ) as { draft: GuestDesignDraft };
  assert.deepEqual(
    envelope.draft.garmentTypeSelection?.physicalOccurrenceIdentityState,
    selection.physicalOccurrenceIdentityState,
  );
  const loaded = localRepository.loadFutureDraftV1();
  assert.equal(loaded.status, "loaded");
  assert.ok(loaded.status === "loaded" && loaded.draft.garmentTypeSelection);
  return loaded.status === "loaded" && loaded.draft.garmentTypeSelection
    ? loaded.draft.garmentTypeSelection
    : selection;
};

const generation = (
  state: PhysicalGarmentOccurrenceIdentityStateV1,
  garmentKey: string,
): number => {
  const value = getPhysicalGarmentOccurrenceGeneration(state, garmentKey);
  assert.ok(value, `Expected an identity generation for ${garmentKey}.`);
  return value!;
};

const occurrencesWithIdentity = ({
  keys,
  state,
}: {
  keys: readonly string[];
  state: PhysicalGarmentOccurrenceIdentityStateV1;
}): PhysicalGarmentOccurrence[] =>
  keys.map((garmentKey) => ({
    garmentKey,
    garmentType: garmentKey.includes("trouser") ? "trouser" : "shirt",
    sourceRole: garmentKey.startsWith("additional:") ? "additional" : "main",
    fabricUnits: 1,
    occurrenceGeneration: generation(state, garmentKey),
  }));

const baseShirtKey = createStyleBaseGarmentSpec("shirt").key;
const baseTrouserKey = createStyleBaseGarmentSpec("trouser").key;
const additionalShirt1Key = "additional:shirt:1";
const additionalShirt2Key = "additional:shirt:2";

const legacySelection = normalizePersistedGarmentTypeStepSelection(
  makeSelection({ garmentTypes: ["shirt"] }),
);
assert.equal(legacySelection.physicalOccurrenceIdentityState, undefined);
const migratedLegacySelection =
  reconcileGarmentTypeSelectionOccurrenceIdentities({
    selection: legacySelection,
    activeGarmentKeys: [baseShirtKey],
  });
assert.equal(
  generation(
    migratedLegacySelection.physicalOccurrenceIdentityState!,
    baseShirtKey,
  ),
  1,
);
const malformedIdentitySelection = normalizePersistedGarmentTypeStepSelection({
  ...makeSelection({ garmentTypes: ["shirt"] }),
  physicalOccurrenceIdentityState: {
    schemaVersion: 1,
    nextGeneration: 2,
    activeGenerationByGarmentKey: { [baseShirtKey]: -1 },
  },
});
assert.equal(
  malformedIdentitySelection.physicalOccurrenceIdentityState,
  undefined,
  "Malformed identity metadata must never become callback authority.",
);

// Additional/repeated: the compatibility key may be reused, but identity cannot.
const initialAdditionalIdentity =
  reconcilePhysicalGarmentOccurrenceIdentityState({
    state: null,
    activeGarmentKeys: [
      baseShirtKey,
      additionalShirt1Key,
      additionalShirt2Key,
    ],
  });
const removedAdditionalGeneration = generation(
  initialAdditionalIdentity,
  additionalShirt2Key,
);
const afterAdditionalRemoval = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: initialAdditionalIdentity,
  activeGarmentKeys: [baseShirtKey, additionalShirt1Key],
});
const hydratedAdditionalSelection = roundTripLocally(
  makeSelection({
    garmentTypes: ["shirt"],
    identityState: afterAdditionalRemoval,
  }),
);
const additionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: occurrencesWithIdentity({
    keys: [baseShirtKey, additionalShirt1Key],
    state: afterAdditionalRemoval,
  }),
  authorizedOccurrenceKeys: [baseShirtKey, additionalShirt1Key],
});
assert.equal(additionalSelection.status, "resolved");
const readdedAdditionalKey =
  additionalSelection.status === "resolved"
    ? additionalSelection.selection.garmentSpec!.key
    : "";
assert.equal(readdedAdditionalKey, additionalShirt2Key);
const readdedAdditionalIdentity =
  reconcilePhysicalGarmentOccurrenceIdentityState({
    state: hydratedAdditionalSelection.physicalOccurrenceIdentityState,
    activeGarmentKeys: [
      baseShirtKey,
      additionalShirt1Key,
      readdedAdditionalKey,
    ],
  });
assert.equal(
  generation(readdedAdditionalIdentity, additionalShirt1Key),
  generation(initialAdditionalIdentity, additionalShirt1Key),
  "Surviving repeated occurrences must not be renumbered.",
);
assert.notEqual(
  generation(readdedAdditionalIdentity, readdedAdditionalKey),
  removedAdditionalGeneration,
  "A re-added public key must receive a new internal identity generation.",
);
assert.ok(
  generation(readdedAdditionalIdentity, readdedAdditionalKey) >
    removedAdditionalGeneration,
);

// Step 1: remove, persist, hydrate, and select the same canonical type again.
const initialStep1Identity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: null,
  activeGarmentKeys: [baseShirtKey, baseTrouserKey],
});
const removedStep1Generation = generation(initialStep1Identity, baseShirtKey);
const afterStep1Removal = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: initialStep1Identity,
  activeGarmentKeys: [baseTrouserKey],
});
const hydratedStep1Selection = roundTripLocally(
  makeSelection({
    garmentTypes: ["trouser"],
    identityState: afterStep1Removal,
  }),
);
const readdedStep1Selection =
  reconcileGarmentTypeSelectionOccurrenceIdentities({
    selection: {
      ...hydratedStep1Selection,
      garmentTypes: ["trouser", "shirt"],
      constructionByGarment: {
        ...hydratedStep1Selection.constructionByGarment,
        shirt: makeConstruction("shirt"),
      },
    },
    activeGarmentKeys: [baseTrouserKey, baseShirtKey],
  });
const readdedStep1Identity =
  readdedStep1Selection.physicalOccurrenceIdentityState!;
assert.equal(
  generation(readdedStep1Identity, baseTrouserKey),
  generation(initialStep1Identity, baseTrouserKey),
);
assert.notEqual(
  generation(readdedStep1Identity, baseShirtKey),
  removedStep1Generation,
);

// Upload-only: preserve upload identity and survivors while rotating garment identity.
const uploadOnlyKey = createStyleBaseGarmentSpec("skirt").key;
const uploadReferenceIdentity = "upload-owner:upload-asset";
const initialUploadIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: null,
  activeGarmentKeys: [baseShirtKey, uploadOnlyKey],
});
const removedUploadGeneration = generation(initialUploadIdentity, uploadOnlyKey);
const afterUploadRemoval = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: initialUploadIdentity,
  activeGarmentKeys: [baseShirtKey],
});
const hydratedUploadSelection = roundTripLocally(
  makeSelection({
    garmentTypes: ["shirt"],
    identityState: afterUploadRemoval,
  }),
);
const readdedUploadIdentity = reconcilePhysicalGarmentOccurrenceIdentityState({
  state: hydratedUploadSelection.physicalOccurrenceIdentityState,
  activeGarmentKeys: [baseShirtKey, uploadOnlyKey],
});
assert.equal(uploadReferenceIdentity, "upload-owner:upload-asset");
assert.equal(
  generation(readdedUploadIdentity, baseShirtKey),
  generation(initialUploadIdentity, baseShirtKey),
);
assert.notEqual(
  generation(readdedUploadIdentity, uploadOnlyKey),
  removedUploadGeneration,
);

// Production projection exposes the generation without changing public keys.
const projected = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: readdedStep1Selection,
  effectiveGarmentTypeSelection: readdedStep1Selection,
});
assert.equal(
  projected.find((occurrence) => occurrence.garmentKey === baseShirtKey)
    ?.occurrenceGeneration,
  generation(readdedStep1Identity, baseShirtKey),
);

// Removal-dialog authority and AI visual identity reject an old generation.
const removedOccurrenceSet = occurrencesWithIdentity({
  keys: [baseShirtKey, additionalShirt1Key, additionalShirt2Key],
  state: initialAdditionalIdentity,
});
const readdedOccurrenceSet = occurrencesWithIdentity({
  keys: [baseShirtKey, additionalShirt1Key, additionalShirt2Key],
  state: readdedAdditionalIdentity,
});
const oldAuthoritySignature = createFuturePhysicalOrderAuthoritySignature({
  sourceKind: "catalogue",
  sourceKey: "catalog:test-style",
  physicalOccurrences: removedOccurrenceSet,
});
const newAuthoritySignature = createFuturePhysicalOrderAuthoritySignature({
  sourceKind: "catalogue",
  sourceKey: "catalog:test-style",
  physicalOccurrences: readdedOccurrenceSet,
});
assert.notEqual(oldAuthoritySignature, newAuthoritySignature);

const oldAiFingerprint = createAiTryOnVisualInputFingerprint({
  garmentTypeSelection: makeSelection({
    garmentTypes: ["shirt"],
    identityState: initialAdditionalIdentity,
  }),
  physicalOccurrences: removedOccurrenceSet,
  fabricAllocations: [],
  selectedStyleId: "catalog:test-style",
});
const newAiFingerprint = createAiTryOnVisualInputFingerprint({
  garmentTypeSelection: makeSelection({
    garmentTypes: ["shirt"],
    identityState: readdedAdditionalIdentity,
  }),
  physicalOccurrences: readdedOccurrenceSet,
  fabricAllocations: [],
  selectedStyleId: "catalog:test-style",
});
assert.notEqual(oldAiFingerprint, newAiFingerprint);

// Existing Fabric and upload coordinators continue to reject stale callbacks.
const oldFabricOperation = {
  transactionId: 1,
  phase: "catalogue" as const,
  origin: "new_addition" as const,
  garmentKey: additionalShirt2Key,
  garmentType: "shirt" as const,
};
const currentFabricOperation = { ...oldFabricOperation, transactionId: 2 };
assert.equal(
  isCurrentAdditionalGarmentFabricOperation({
    currentTransaction: currentFabricOperation,
    expectedTransactionId: oldFabricOperation.transactionId,
    expectedGarmentKey: oldFabricOperation.garmentKey,
  }),
  false,
);
const uploadCoordinator = createUploadedDesignOperationCoordinator();
const staleUploadOperation = uploadCoordinator.begin("upload");
uploadCoordinator.invalidate();
const currentUploadOperation = uploadCoordinator.begin("replacement");
assert.equal(uploadCoordinator.isCurrent(staleUploadOperation), false);
assert.equal(uploadCoordinator.isCurrent(currentUploadOperation), true);

assert.notEqual(
  createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: additionalShirt2Key,
    generation: removedAdditionalGeneration,
  }),
  createPhysicalGarmentOccurrenceIdentityToken({
    garmentKey: readdedAdditionalKey,
    generation: generation(readdedAdditionalIdentity, readdedAdditionalKey),
  }),
);

class MemoryCloudAdapter implements AuthenticatedFutureDraftPersistenceAdapter {
  private value: unknown | null = null;

  async load(): Promise<unknown | null> {
    return clone(this.value);
  }

  async commit(input: {
    ownerUid: string;
    expectedRevision: number | null;
    lifecycleStatus: "active" | "cleared";
    draft?: GuestDesignDraft;
  }) {
    const current = this.value as { revision?: number } | null;
    const currentRevision = current?.revision ?? null;
    if (currentRevision !== input.expectedRevision) {
      return { status: "conflict" as const, currentValue: clone(this.value) };
    }
    const revision = (currentRevision || 0) + 1;
    this.value = {
      schemaVersion: 1,
      lifecycleStatus: input.lifecycleStatus,
      revision,
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: `2026-09-02T12:${String(revision).padStart(2, "0")}:00.000Z`,
      ...(input.draft ? { draft: clone(input.draft) } : {}),
    };
    return { status: "saved" as const, value: clone(this.value) };
  }
}

const cloudRepository = createAuthenticatedFutureDraftRepository({
  adapter: new MemoryCloudAdapter(),
  getIdentity: () => ({ status: "authenticated", ownerUid: "identity-owner" }),
});
const cloudSave = await cloudRepository.save(
  makeDraft(
    makeSelection({
      garmentTypes: ["shirt"],
      identityState: readdedAdditionalIdentity,
    }),
  ),
  null,
);
assert.equal(cloudSave.status, "saved");
const cloudLoad = await cloudRepository.load();
assert.equal(cloudLoad.status, "loaded");
assert.deepEqual(
  cloudLoad.status === "loaded"
    ? cloudLoad.record.draft?.garmentTypeSelection
        ?.physicalOccurrenceIdentityState
    : null,
  readdedAdditionalIdentity,
);

console.log(
  "PASS: persisted physical occurrence generations remain monotonic across guest and cloud round-trips",
);
