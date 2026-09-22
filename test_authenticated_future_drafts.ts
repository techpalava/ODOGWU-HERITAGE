import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  AdditionalGarmentConstructionStateV1,
  DesignStudioStageId,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import {
  createAuthenticatedFutureDraftRepository,
  isPristineFutureDesignDraft,
  resolveAuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftPersistenceAdapter,
} from "./src/services/authenticatedFutureDraftService";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
} from "./src/utils/designSourceState";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { resolveDraftHydrationAllocations } from "./src/utils/fabricAllocationPersistence";
import { createDesignStyleStepTestModel } from "./testing/designStyleStepFixtures";
import { createRevision342FabricHydrationFixture } from "./testing/revision342FabricHydrationFixture";

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
    const timestamp = new Date(
      Date.UTC(2026, 7, 15, 10, 0, revision),
    ).toISOString();
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

// A fresh authenticated runtime may briefly hold the untouched Step 1 shell
// while the persisted cloud draft is being loaded. The shell must never turn
// the cold hydration into a conflict or replace the saved customer draft.
const pristineColdStartDraft: GuestDesignDraft = {
  ...makeDraft("garment_type"),
  currentStep: 1,
  garmentTypeSelection: {
    garmentTypes: [],
    demographic: null,
    constructionByGarment: {},
  },
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  fabricAllocations: [],
  designSource: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
  priceActivatedFabricCode: null,
};
assert.equal(isPristineFutureDesignDraft(pristineColdStartDraft), true);
const coldHydration = await transferRepository.synchronize(pristineColdStartDraft);
assert.equal(coldHydration.status, "cloud_restored");
assert.equal(coldHydration.draft?.currentStageId, "custom_details");
assert.equal(coldHydration.draft?.selectedFabricCode, "FABRIC-A");
assert.equal(coldHydration.draft?.selectedStyleId, "STYLE-A");

// This simulates a new authenticated runtime: an existing V2 cloud draft with
// Shirt + Trouser Fabric and exact occurrence assignments is loaded after a
// transient pristine local shell has been created. The cloud draft must remain
// authoritative through V2 reconciliation and expose the published catalogue.
const coldHydrationSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};
const coldHydrationStyle: StyleCategory = {
  id: "cold-hydration-style",
  name: "Cold Hydration Style",
  description: "Authenticated cold-hydration regression style.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};
const persistedV2Model = createDesignStyleStepTestModel({
  styles: [coldHydrationStyle],
  garmentTypeSelection: coldHydrationSelection,
  selectedStyleIdByGarmentKey: {
    "base:shirt:1": coldHydrationStyle.id,
    "base:trouser:1": coldHydrationStyle.id,
  },
});
assert.ok(persistedV2Model.hydration.envelope);
const persistedV2Draft: GuestDesignDraft = {
  ...makeDraft("design_style"),
  garmentTypeSelection: coldHydrationSelection,
  selectedStyleId: null,
  designSource: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
  designStyleAssignmentDraft: persistedV2Model.hydration.envelope,
  fabricAllocations: [
    {
      allocationId: "cold-hydration-fabric",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: "base:shirt:1",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
        {
          garmentKey: "base:trouser:1",
          code: "TROUSER",
          garmentType: "trouser",
          fabricUnits: 1,
        },
      ],
    },
  ],
};
const coldBoundaryAdapter = new MemoryAdapter();
const coldBoundaryRepository = createAuthenticatedFutureDraftRepository({
  adapter: coldBoundaryAdapter,
  getIdentity: () => ({ status: "authenticated" as const, ownerUid: "uid-cold" }),
});
assert.equal((await coldBoundaryRepository.save(persistedV2Draft, null)).status, "saved");
const coldBoundarySync = await coldBoundaryRepository.synchronize(
  pristineColdStartDraft,
);
assert.equal(coldBoundarySync.status, "cloud_restored");
assert.equal(coldBoundarySync.draft?.fabricAllocations?.[0]?.garmentAssignments.length, 2);
const freshV2Model = createDesignStyleStepTestModel({
  styles: persistedV2Model.styles,
  garmentTypeSelection: coldHydrationSelection,
  rawDraft: coldBoundarySync.draft || {},
});
assert.equal(freshV2Model.projection.runtimeStatus, "ready");
assert.equal(freshV2Model.projection.completedCount, 2);
assert.equal(freshV2Model.catalogueEntries.length, 1);
assert.deepEqual(
  Object.keys(freshV2Model.hydration.ledger?.assignmentsByGarmentKey || {}).sort(),
  ["base:shirt:1", "base:trouser:1"],
);

// A historical authenticated draft had six physical occurrences and three
// Fabric allocations. The legacy additional rows were produced before their
// relation metadata became mandatory. Loading it must normalize Fabric without
// disturbing the independently authoritative Design Style, Custom Details, or
// measurement fields, and the next normal save must retain the complete draft.
const revision342Fixture = createRevision342FabricHydrationFixture();
const revision342Selection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser", "skirt"],
  demographic: "female",
  audienceSelection: { schemaVersion: 1, demographics: ["female"] },
  physicalOccurrenceIdentityState: revision342Fixture.occurrenceIdentityState,
  constructionByGarment: {},
};
const revision342Style: StyleCategory = {
  id: "revision-342-style",
  name: "Revision 342 Fixture Style",
  description: "Structural authenticated-draft preservation regression.",
  gender: "female",
  targetDemographic: "female",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
    createStyleBaseGarmentSpec("skirt"),
    createStyleBaseGarmentSpec("kaftan"),
    createStyleBaseGarmentSpec("bum_shorts"),
  ],
};
const revision342CatalogSource = createCatalogDesignSource(revision342Style.id);
assert.ok(revision342CatalogSource);
const revision342StyleModel = createDesignStyleStepTestModel({
  styles: [revision342Style],
  garmentTypeSelection: revision342Selection,
  occurrences: revision342Fixture.occurrences,
  selectedStyleIdByGarmentKey: Object.fromEntries(
    revision342Fixture.occurrences.map((occurrence) => [
      occurrence.garmentKey,
      revision342Style.id,
    ]),
  ),
});
assert.ok(revision342StyleModel.hydration.envelope);
assert.equal(revision342StyleModel.projection.completedCount, 6);
const revision342AdditionalConstructions: AdditionalGarmentConstructionStateV1 = {
  schemaVersion: 1,
  byGarmentKey: Object.fromEntries(
    revision342Fixture.occurrences
      .filter((occurrence) => occurrence.sourceRole === "additional")
      .map((occurrence) => [
        occurrence.garmentKey,
        {
          status: "resolved" as const,
          garmentType: occurrence.garmentType,
          components: [],
          totalPriceCents: 1000,
          totalPrice: 10,
        },
      ]),
  ),
};
const revision342Draft: GuestDesignDraft = {
  ...makeDraft("measurement", "Revision 342 Fixture"),
  journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  currentStep: 6,
  garmentTypeSelection: revision342Selection,
  selectedFabricCode: "ODG-009",
  selectedStyleId: revision342Style.id,
  designSource: revision342CatalogSource,
  confirmedDesignSourceKey: revision342CatalogSource.sourceKey,
  fabricAllocations: revision342Fixture.legacyFabricAllocations,
  designStyleAssignmentDraft: revision342StyleModel.hydration.envelope,
  designSelections: {
    accessories: [],
    additionalGarmentConstructions: revision342AdditionalConstructions,
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { shirt_construction: "fixture-shirt-cut" },
        "additional:kaftan:1": { shirt_construction: "fixture-kaftan-cut" },
      },
      snapshotsByGarmentKey: {},
    },
  },
  futureMeasurementState: {
    ...makeDraft("measurement").futureMeasurementState!,
    entered: {
      shared: {
        chest_bust_circumference: {
          valueCm: 102,
          provenance: "customer_entered",
        },
      },
      byGarmentKey: {},
    },
  },
};
const revision342Adapter = new MemoryAdapter();
revision342Adapter.values.set("uid-revision-342", {
  schemaVersion: 1,
  lifecycleStatus: "active",
  revision: 342,
  createdAt: "2026-09-08T08:00:00.000Z",
  updatedAt: "2026-09-08T08:01:00.000Z",
  draft: clone(revision342Draft),
});
const revision342Repository = createAuthenticatedFutureDraftRepository({
  adapter: revision342Adapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: "uid-revision-342",
  }),
});
const revision342Hydrated = await revision342Repository.synchronize(
  pristineColdStartDraft,
  { localDraftProvenance: "pre_authenticated_cloud_authority" },
);
assert.equal(
  revision342Hydrated.status,
  "cloud_restored",
  revision342Hydrated.status === "invalid" || revision342Hydrated.status === "blocked"
    ? revision342Hydrated.reason
    : undefined,
);
assert.equal(
  revision342Hydrated.status === "cloud_restored" &&
    revision342Hydrated.record?.revision,
  342,
);
assert.equal(revision342Hydrated.draft?.currentStageId, "measurement");
const revision342FabricHydration = resolveDraftHydrationAllocations(
  revision342Hydrated.draft!,
);
assert.equal(revision342FabricHydration.status, "valid");
assert.equal(revision342FabricHydration.fabricAllocations.length, 3);
assert.equal(
  revision342FabricHydration.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ).length,
  6,
);
assert.deepEqual(
  revision342FabricHydration.fabricAllocations.map(
    (allocation) => allocation.allocationId,
  ),
  ["ODG-009-1", "ODG-010-1", "ODG-012-1"],
);
const revision342HydratedStyleModel = createDesignStyleStepTestModel({
  styles: [revision342Style],
  garmentTypeSelection: revision342Selection,
  occurrences: revision342Fixture.occurrences,
  rawDraft: revision342Hydrated.draft || {},
});
assert.equal(revision342HydratedStyleModel.projection.runtimeStatus, "ready");
assert.equal(revision342HydratedStyleModel.projection.completedCount, 6);
assert.deepEqual(
  revision342Hydrated.draft?.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey,
  revision342Draft.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey,
);
assert.equal(
  revision342Hydrated.draft?.futureMeasurementState?.entered.shared
    .chest_bust_circumference
    ?.valueCm,
  102,
);
const revision342Autosaved = await revision342Repository.save(
  {
    ...revision342Hydrated.draft!,
    updatedAt: "2026-09-08T08:02:00.000Z",
    fabricAllocations: revision342FabricHydration.fabricAllocations,
  },
  342,
);
assert.equal(
  revision342Autosaved.status,
  "saved",
  revision342Autosaved.status === "invalid" || revision342Autosaved.status === "blocked"
    ? revision342Autosaved.reason
    : undefined,
);
assert.equal(
  revision342Autosaved.status === "saved" && revision342Autosaved.record.revision,
  343,
);
const revision343Hydrated = await revision342Repository.synchronize(
  pristineColdStartDraft,
  { localDraftProvenance: "pre_authenticated_cloud_authority" },
);
assert.equal(revision343Hydrated.status, "cloud_restored");
assert.equal(revision343Hydrated.draft?.currentStageId, "measurement");
assert.deepEqual(
  revision343Hydrated.draft?.fabricAllocations?.map((allocation) => ({
    allocationId: allocation.allocationId,
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [
    {
      allocationId: "ODG-009-1",
      fabricCode: "ODG-009",
      garmentKeys: ["base:shirt", "base:trouser"],
    },
    {
      allocationId: "ODG-010-1",
      fabricCode: "ODG-010",
      garmentKeys: ["base:skirt", "additional:kaftan:1"],
    },
    {
      allocationId: "ODG-012-1",
      fabricCode: "ODG-012",
      garmentKeys: ["additional:bum_shorts:1", "additional:shirt:1"],
    },
  ],
);
assert.deepEqual(
  revision343Hydrated.draft?.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey,
  revision342Draft.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey,
);
assert.equal(
  revision343Hydrated.draft?.futureMeasurementState?.entered.shared
    .chest_bust_circumference
    ?.valueCm,
  102,
);
const revision343StyleModel = createDesignStyleStepTestModel({
  styles: [revision342Style],
  garmentTypeSelection: revision342Selection,
  occurrences: revision342Fixture.occurrences,
  rawDraft: revision343Hydrated.draft || {},
});
assert.equal(revision343StyleModel.projection.runtimeStatus, "ready");
assert.equal(revision343StyleModel.projection.completedCount, 6);

// Reset clears only the old cloud draft. The first meaningful post-reset
// mutation must reactivate that same revision-checked record, then a cold
// hydration must restore garments, Fabric, occurrence Design Styles, and
// Custom Details without reviving the pre-reset payload.
const clearedReactivationAdapter = new MemoryAdapter();
const clearedReactivationRepository = createAuthenticatedFutureDraftRepository({
  adapter: clearedReactivationAdapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: "uid-cleared-reactivation",
  }),
});
const preResetDraft: GuestDesignDraft = {
  ...persistedV2Draft,
  currentStageId: "custom_details",
  currentStep: 4,
  customerName: "Pre-reset Customer",
  specialInstructions: "old pre-reset instruction",
};
assert.equal(
  (await clearedReactivationRepository.save(preResetDraft, null)).status,
  "saved",
);
const clearedBeforeFreshDraft = await clearedReactivationRepository.clear(1);
assert.equal(clearedBeforeFreshDraft.status, "saved");
assert.equal(
  clearedBeforeFreshDraft.status === "saved" &&
    clearedBeforeFreshDraft.record.lifecycleStatus,
  "cleared",
);
assert.equal(
  clearedBeforeFreshDraft.status === "saved" &&
    clearedBeforeFreshDraft.record.revision,
  2,
);
const freshPostResetDraft: GuestDesignDraft = {
  ...persistedV2Draft,
  currentStageId: "custom_details",
  currentStep: 4,
  customerName: "Fresh post-reset Customer",
  specialInstructions: "fresh post-reset instruction",
  designSelections: {
    ...persistedV2Draft.designSelections,
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt:1": { shirt_construction: "fresh-shirt-construction" },
      },
      snapshotsByGarmentKey: {},
    },
  },
};
assert.equal(isPristineFutureDesignDraft(freshPostResetDraft), false);
const reactivatedAfterClear = await clearedReactivationRepository.save(
  freshPostResetDraft,
  clearedBeforeFreshDraft.status === "saved"
    ? clearedBeforeFreshDraft.record.revision
    : null,
);
assert.equal(reactivatedAfterClear.status, "saved");
assert.equal(
  reactivatedAfterClear.status === "saved" &&
    reactivatedAfterClear.record.lifecycleStatus,
  "active",
);
assert.equal(
  reactivatedAfterClear.status === "saved" &&
    reactivatedAfterClear.record.revision,
  3,
);
const freshPostResetHydration =
  await clearedReactivationRepository.synchronize(pristineColdStartDraft);
assert.equal(freshPostResetHydration.status, "cloud_restored");
assert.deepEqual(
  freshPostResetHydration.draft?.garmentTypeSelection?.garmentTypes,
  ["shirt", "trouser"],
);
assert.equal(
  freshPostResetHydration.draft?.fabricAllocations?.[0]?.garmentAssignments.length,
  2,
);
const freshPostResetModel = createDesignStyleStepTestModel({
  styles: persistedV2Model.styles,
  garmentTypeSelection: coldHydrationSelection,
  rawDraft: freshPostResetHydration.draft || {},
});
assert.equal(freshPostResetModel.projection.completedCount, 2);
assert.deepEqual(
  freshPostResetHydration.draft?.designSelections.garmentScopedCustomDetails,
  freshPostResetDraft.designSelections.garmentScopedCustomDetails,
);
assert.equal(
  freshPostResetHydration.draft?.customerName,
  "Fresh post-reset Customer",
);
assert.notEqual(
  freshPostResetHydration.draft?.specialInstructions,
  preResetDraft.specialInstructions,
);
const stalePostResetWrite = await clearedReactivationRepository.save(
  freshPostResetDraft,
  2,
);
assert.equal(stalePostResetWrite.status, "conflict");

// A meaningful local snapshot can be restored before this page has resolved
// its authenticated customer. It is not a competing authenticated edit, so a
// saved cloud draft must still win during the first authenticated hydration.
const preAuthLocalSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};
const preAuthLocalStyle: StyleCategory = {
  ...coldHydrationStyle,
  id: "pre-auth-local-style",
  name: "Pre-auth local runtime style",
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};
const preAuthLocalModel = createDesignStyleStepTestModel({
  styles: [preAuthLocalStyle],
  garmentTypeSelection: preAuthLocalSelection,
  selectedStyleIdByGarmentKey: {
    "base:shirt:1": preAuthLocalStyle.id,
  },
});
assert.ok(preAuthLocalModel.hydration.envelope);
const meaningfulPreAuthLocalDraft: GuestDesignDraft = {
  ...makeDraft("design_style", "Pre-auth local runtime"),
  garmentTypeSelection: preAuthLocalSelection,
  selectedStyleId: null,
  designSource: null,
  confirmedStyleId: null,
  confirmedDesignSourceKey: null,
  designStyleAssignmentDraft: preAuthLocalModel.hydration.envelope,
};
const meaningfulPreAuthSync = await coldBoundaryRepository.synchronize(
  meaningfulPreAuthLocalDraft,
  { localDraftProvenance: "pre_authenticated_cloud_authority" },
);
assert.equal(meaningfulPreAuthSync.status, "cloud_restored");
assert.equal(meaningfulPreAuthSync.draft?.currentStageId, "design_style");
assert.equal(
  meaningfulPreAuthSync.draft?.fabricAllocations?.[0]?.garmentAssignments.length,
  2,
);
const meaningfulPreAuthRestoredModel = createDesignStyleStepTestModel({
  styles: persistedV2Model.styles,
  garmentTypeSelection: coldHydrationSelection,
  rawDraft: meaningfulPreAuthSync.draft || {},
});
assert.equal(meaningfulPreAuthRestoredModel.projection.runtimeStatus, "ready");
assert.equal(meaningfulPreAuthRestoredModel.projection.completedCount, 2);
assert.equal(meaningfulPreAuthRestoredModel.catalogueEntries.length, 1);

const differentGuest = makeDraft("custom_details", "Different Customer");
const conflict = await transferRepository.synchronize(differentGuest, {
  localDraftProvenance: "authenticated_user_edit",
});
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

const ownershipAdapter = new MemoryAdapter();
const ownershipRepository = createAuthenticatedFutureDraftRepository({
  adapter: ownershipAdapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: "account-draft-owner",
  }),
});
const foreignUploadedDraft = makeDraft("design_style");
foreignUploadedDraft.selectedStyleId = null;
foreignUploadedDraft.designSource = createUploadedDesignSource({
  uploadReference: {
    ownerUid: "anonymous-upload-owner",
    designReferenceId: "design-reference-001",
    storagePath:
      "customer-design-drafts/anonymous-upload-owner/design-reference-001/original.png",
    mimeType: "image/png",
    createdAt: "2026-08-15T09:00:00.000Z",
  },
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
  demographic: "male",
});
const foreignSave = await ownershipRepository.save(foreignUploadedDraft, null);
assert.equal(foreignSave.status, "blocked");
assert.equal(
  foreignSave.status === "blocked" && foreignSave.reason,
  "uploaded_design_owner_mismatch",
);
const foreignSync = await ownershipRepository.synchronize(foreignUploadedDraft);
assert.equal(foreignSync.status, "blocked");
assert.equal(ownershipAdapter.writes.length, 0);

const markedDraft = makeDraft("design_style");
markedDraft.uploadedDesignOwnershipTransition = {
  schemaVersion: 1,
  status: "transfer_required",
  reason: "claim_unavailable",
};
const markedSave = await ownershipRepository.save(markedDraft, null);
assert.equal(markedSave.status, "blocked");
assert.equal(
  markedSave.status === "blocked" && markedSave.reason,
  "uploaded_design_ownership_transfer_required",
);
assert.equal(ownershipAdapter.writes.length, 0);

const makeOwnedUploadedSource = (
  ownerUid: string,
  designReferenceId: string,
) =>
  createUploadedDesignSource({
    uploadReference: {
      ownerUid,
      designReferenceId,
      storagePath: `customer-design-drafts/${ownerUid}/${designReferenceId}/original.png`,
      mimeType: "image/png",
      createdAt: "2026-09-21T00:00:00.000Z",
    },
    fabricCapacityComposition: [
      { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    ],
    demographic: "male",
  });

const attachRegistry = (
  draft: GuestDesignDraft,
  sources: ReturnType<typeof makeOwnedUploadedSource>[],
): GuestDesignDraft => ({
  ...draft,
  uploadedDesignSourceRegistry: {
    schemaVersion: 1,
    sourcesByUploadedSourceRef: Object.fromEntries(
      sources.map((source) => [
        source.uploadReference.designReferenceId,
        source,
      ]),
    ),
  },
});

const AUTH_OWNER_A = "account-draft-owner";
const AUTH_OWNER_B = "authenticated-session-b";
const GUEST_OWNER_A = "anonymous-upload-owner";

const sessionBAdapter = new MemoryAdapter();
const sessionBRepository = createAuthenticatedFutureDraftRepository({
  adapter: sessionBAdapter,
  getIdentity: () => ({
    status: "authenticated" as const,
    ownerUid: AUTH_OWNER_B,
  }),
});

const sameOwnerRegistryDraft = attachRegistry(
  {
    ...makeDraft("design_style"),
    selectedStyleId: null,
    designSource: null,
  },
  [makeOwnedUploadedSource(AUTH_OWNER_A, "registry-same-owner")],
);
const sameOwnerRegistrySave = await ownershipRepository.save(
  sameOwnerRegistryDraft,
  null,
);
assert.equal(sameOwnerRegistrySave.status, "saved");

const foreignRegistryOnlyDraft = attachRegistry(
  {
    ...makeDraft("design_style"),
    selectedStyleId: null,
    designSource: createCatalogDesignSource("STYLE-A"),
  },
  [makeOwnedUploadedSource(GUEST_OWNER_A, "registry-guest-a")],
);
const foreignRegistrySave = await sessionBRepository.save(
  foreignRegistryOnlyDraft,
  null,
);
assert.equal(foreignRegistrySave.status, "blocked");
assert.equal(
  foreignRegistrySave.status === "blocked" && foreignRegistrySave.reason,
  "uploaded_design_owner_mismatch",
);

const guestToAuthSync = await sessionBRepository.synchronize(
  foreignRegistryOnlyDraft,
);
assert.equal(guestToAuthSync.status, "blocked");
assert.equal(
  guestToAuthSync.status === "blocked" && guestToAuthSync.reason,
  "uploaded_design_owner_mismatch",
);
assert.equal(sessionBAdapter.writes.length, 0);

const mixedRegistryDraft = attachRegistry(
  {
    ...makeDraft("design_style"),
    selectedStyleId: null,
    designSource: null,
  },
  [
    makeOwnedUploadedSource(AUTH_OWNER_B, "registry-session-b"),
    makeOwnedUploadedSource(GUEST_OWNER_A, "registry-guest-a-mixed"),
  ],
);
const mixedRegistrySave = await sessionBRepository.save(
  mixedRegistryDraft,
  null,
);
assert.equal(mixedRegistrySave.status, "blocked");
assert.equal(
  mixedRegistrySave.status === "blocked" && mixedRegistrySave.reason,
  "uploaded_design_owner_mismatch",
);
assert.equal(sessionBAdapter.writes.length, 0);

const sameOwnerScalarNoRegistry = makeDraft("design_style");
sameOwnerScalarNoRegistry.selectedStyleId = null;
sameOwnerScalarNoRegistry.designSource = makeOwnedUploadedSource(
  AUTH_OWNER_A,
  "scalar-same-owner-no-registry",
);
assert.equal(
  (await ownershipRepository.save(sameOwnerScalarNoRegistry, 1)).status,
  "saved",
);

const matchingScalarForeignRegistryDraft = attachRegistry(
  {
    ...makeDraft("design_style"),
    selectedStyleId: null,
    designSource: makeOwnedUploadedSource(
      AUTH_OWNER_B,
      "scalar-session-b",
    ),
  },
  [makeOwnedUploadedSource(GUEST_OWNER_A, "registry-guest-a-vs-scalar")],
);
const matchingScalarForeignRegistrySave = await sessionBRepository.save(
  matchingScalarForeignRegistryDraft,
  null,
);
assert.equal(matchingScalarForeignRegistrySave.status, "blocked");
assert.equal(
  matchingScalarForeignRegistrySave.status === "blocked" &&
    matchingScalarForeignRegistrySave.reason,
  "uploaded_design_owner_mismatch",
);
assert.equal(sessionBAdapter.writes.length, 0);

const sameOwnerScalarAndRegistryDraft = attachRegistry(
  {
    ...makeDraft("design_style"),
    selectedStyleId: null,
    designSource: makeOwnedUploadedSource(
      AUTH_OWNER_A,
      "scalar-and-registry-a",
    ),
  },
  [makeOwnedUploadedSource(AUTH_OWNER_A, "registry-same-as-scalar")],
);
assert.equal(
  (await ownershipRepository.save(sameOwnerScalarAndRegistryDraft, 2)).status,
  "saved",
);

const tokenBearingDraft = makeDraft("design_style") as GuestDesignDraft & {
  ownershipClaimToken?: string;
};
tokenBearingDraft.ownershipClaimToken = "must-never-reach-cloud-storage";
const writesBeforeTokenDraft = ownershipAdapter.writes.length;
assert.equal(
  (await ownershipRepository.save(tokenBearingDraft, null)).status,
  "invalid",
);
assert.equal(ownershipAdapter.writes.length, writesBeforeTokenDraft);

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
  /awaitingFreshAuthenticatedDraftMutationRef\.current/,
  "A cleared cloud tombstone must wait for the first meaningful customer mutation.",
);
assert.match(
  studioSource,
  /isPristineFutureDesignDraft\(canonicalGuestDraft\)/,
  "The untouched post-reset Step 1 shell must not reactivate a draft automatically.",
);
const failedAutosaveSource = studioSource.slice(
  studioSource.indexOf('} else if (result.status === "conflict") {'),
  studioSource.indexOf('  }, [', studioSource.indexOf('} else if (result.status === "conflict") {')),
);
assert.doesNotMatch(
  failedAutosaveSource,
  /futureDraftIdentityGenerationRef\.current \+= 1/,
  "A failed save must not invalidate the current customer identity and hide the reconciled Step 3 catalogue.",
);
assert.match(studioSource, /createFirebaseAuthenticatedFutureDraftRepository/);
assert.match(studioSource, /futureDraftIdentity\.status === "authenticated"/);
assert.match(
  studioSource,
  /repository\.synchronize\(localDraft,\s*\{\s*localDraftProvenance,\s*\}\)/,
  "The first authenticated hydration must mark existing local state as pre-authority.",
);
assert.match(
  studioSource,
  /authenticatedCloudDraftAuthorityEstablishedRef\.current = true/,
  "The authenticated cloud authority boundary must be established only after restoration.",
);
assert.match(
  studioSource,
  /!guestDraftHydrated[\s\S]*isAdditionalGarmentCommitPending[\s\S]*blockedPersistedFabricHydrationRef\.current !== null/,
  "Autosave must remain suppressed before hydration reaches ready or while raw persisted Fabric data is invalid.",
);
assert.doesNotMatch(studioSource, /isFutureNineStageMode/);

console.log("PASS: authenticated future draft persistence and isolation");
