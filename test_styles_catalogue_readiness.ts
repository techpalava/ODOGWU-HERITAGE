/**
 * Authoritative Style catalogue readiness + loaded-empty draft hydration.
 */
import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  FabricAllocationState,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import { resolveDraftHydrationAllocations } from "./src/utils/fabricAllocationPersistence";
import { reconcileFutureFabricAllocationState } from "./src/utils/designStudioFutureFabricStage";
import { resolveStep1CatalogueCoverage } from "./src/utils/step1CatalogueCoverage";
import {
  canBeginFutureDesignDraftHydration,
  isCatalogueDesignStyleStageComplete,
  isFutureDesignStyleStageCompleteForCustomDetails,
  resolveHydratedDesignStyleSelection,
  shouldAwaitStylesCatalogueBeforeDraftHydration,
} from "./src/utils/stylesCatalogueLoadState";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographics: GarmentTypeStepSelection["demographic"][],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: demographics[0] || null,
  audienceSelection: {
    schemaVersion: 1,
    demographics: demographics.filter(Boolean) as ("male" | "female" | "unisex")[],
  },
  constructionByGarment: {},
});

const compatibleStyle: StyleCategory = {
  id: "casual-native-1",
  name: "Casual Native",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const shirtTrouserMale = selection(["shirt", "trouser"], ["male"]);

// TEST A — slow Style first snapshot (isLoadingData already false)
{
  assert.equal(
    shouldAwaitStylesCatalogueBeforeDraftHydration("loading"),
    true,
  );
  const loadingCoverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: shirtTrouserMale,
    styles: [],
    stylesLoadState: "loading",
  });
  assert.equal(loadingCoverage.status, "loading");
  assert.notEqual(loadingCoverage.status, "empty_catalogue");
  assert.notEqual(loadingCoverage.status, "no_match");
  assert.equal(loadingCoverage.customerHeadline, null);

  // Global app data may already be idle while Style snapshot is pending.
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: false,
      isLoadingData: false,
      stylesLoadState: "loading",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    false,
  );

  const matched = resolveStep1CatalogueCoverage({
    garmentTypeSelection: shirtTrouserMale,
    styles: [compatibleStyle],
    stylesLoadState: "ready",
  });
  assert.equal(matched.status, "matched");
}

// TEST B — true loaded-empty catalogue
{
  const empty = resolveStep1CatalogueCoverage({
    garmentTypeSelection: shirtTrouserMale,
    styles: [],
    stylesLoadState: "ready",
  });
  assert.equal(empty.status, "empty_catalogue");
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: false,
      isLoadingData: false,
      stylesLoadState: "ready",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    true,
    "ready empty catalogue must not block draft hydration",
  );
}

// TEST D — listener failure is not empty_catalogue
{
  const unavailable = resolveStep1CatalogueCoverage({
    garmentTypeSelection: shirtTrouserMale,
    styles: [],
    stylesLoadState: "error",
  });
  assert.equal(unavailable.status, "catalogue_unavailable");
  assert.notEqual(unavailable.status, "empty_catalogue");
  assert.match(unavailable.customerDetail || "", /Upload Your Own Design/);

  const preserved = resolveHydratedDesignStyleSelection({
    stylesLoadState: "error",
    selectedStyleId: "casual-native-1",
    styles: [],
    garmentTypeSelection: shirtTrouserMale,
  });
  assert.equal(preserved.selectedStyleId, "casual-native-1");
  assert.equal(preserved.status, "none");
  assert.notEqual(preserved.status, "reselection_required");
  assert.equal(preserved.compatibility, null);
}

// TEST E — saved compatible selection during slow load (loading, not error)
{
  const whileLoading = resolveHydratedDesignStyleSelection({
    stylesLoadState: "loading",
    selectedStyleId: "casual-native-1",
    styles: [],
    garmentTypeSelection: shirtTrouserMale,
  });
  assert.equal(whileLoading.selectedStyleId, "casual-native-1");
  assert.equal(whileLoading.status, "none");
  assert.notEqual(whileLoading.status, "reselection_required");
  assert.notEqual(whileLoading.status, "selected");

  // Error path separately preserves identity without deletion claim.
  const whileError = resolveHydratedDesignStyleSelection({
    stylesLoadState: "error",
    selectedStyleId: "casual-native-1",
    styles: [],
    garmentTypeSelection: shirtTrouserMale,
  });
  assert.equal(whileError.selectedStyleId, "casual-native-1");
  assert.equal(whileError.status, "none");
  assert.notEqual(whileError.status, "reselection_required");

  // While loading, hydration must not run (selection not rewritten against []).
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: false,
      isLoadingData: false,
      stylesLoadState: "loading",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    false,
  );

  const afterReady = resolveHydratedDesignStyleSelection({
    stylesLoadState: "ready",
    selectedStyleId: "casual-native-1",
    styles: [compatibleStyle],
    garmentTypeSelection: shirtTrouserMale,
  });
  assert.equal(afterReady.status, "selected");
  assert.equal(afterReady.selectedStyle?.id, "casual-native-1");

  const readyMissing = resolveHydratedDesignStyleSelection({
    stylesLoadState: "ready",
    selectedStyleId: "casual-native-1",
    styles: [],
    garmentTypeSelection: shirtTrouserMale,
  });
  assert.equal(readyMissing.status, "reselection_required");

  // Shared journey gate: catalogue path blocked until ready; upload independent.
  assert.equal(
    isCatalogueDesignStyleStageComplete({
      stylesLoadState: "loading",
      selectedStyleId: "casual-native-1",
      styles: [compatibleStyle],
      garmentTypeSelection: shirtTrouserMale,
    }),
    false,
  );
  assert.equal(
    isCatalogueDesignStyleStageComplete({
      stylesLoadState: "error",
      selectedStyleId: "casual-native-1",
      styles: [compatibleStyle],
      garmentTypeSelection: shirtTrouserMale,
    }),
    false,
  );
  assert.equal(
    isCatalogueDesignStyleStageComplete({
      stylesLoadState: "ready",
      selectedStyleId: "casual-native-1",
      styles: [compatibleStyle],
      garmentTypeSelection: shirtTrouserMale,
    }),
    true,
  );
  const uploadedSourceForGate = createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "guest",
      mimeType: "image/png",
      designReferenceId: "u1",
      originalFileName: "design.png",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
    demographic: "male",
  });
  assert.equal(
    isFutureDesignStyleStageCompleteForCustomDetails({
      stylesLoadState: "loading",
      selectedStyleId: null,
      styles: [],
      garmentTypeSelection: shirtTrouserMale,
      designSource: uploadedSourceForGate,
      isUploadedDesignConfirmed: true,
      isUploadedDesignPricingActive: true,
    }),
    true,
  );
}

// TEST C + F — loaded-empty draft hydration with fabric + uploaded design
{
  const uploadReference = createCustomerDesignUploadReference({
    ownerUid: "guest-empty-catalogue",
    mimeType: "image/png",
    designReferenceId: "upload-empty-cat-1",
    originalFileName: "design.png",
    createdAt: "2026-08-24T00:00:00.000Z",
  });
  const uploadedSource = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: [
      createStyleBaseGarmentSpec("shirt"),
      createStyleBaseGarmentSpec("trouser"),
    ],
    demographic: "male",
  });
  assert.ok(uploadedSource);

  const fabricState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "alloc-shirt",
        fabricCode: "ODG-001",
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
        allocationId: "alloc-trouser",
        fabricCode: "ODG-002",
        garmentAssignments: [
          {
            garmentKey: "base:trouser",
            code: "TROUSER",
            garmentType: "trouser",
            fabricUnits: 1,
          },
        ],
      },
    ],
    activeAllocationId: "alloc-shirt",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };

  const draft = {
    journeySchemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    currentStageId: "design_style" as const,
    currentStep: 3,
    garmentTypeSelection: shirtTrouserMale,
    fabricAllocations: fabricState.fabricAllocations,
    designSource: uploadedSource!,
    confirmedDesignSourceKey: uploadedSource!.sourceKey,
    selectedStyleId: null,
    selectedFabricCode: "ODG-001",
    selectedGarment: null,
    designSelections: { accessories: [] },
  } as GuestDesignDraft;

  // Round-trip through JSON like guest draft persistence.
  const stored = JSON.parse(JSON.stringify(draft)) as GuestDesignDraft;
  assert.deepEqual(stored.garmentTypeSelection?.garmentTypes, [
    "shirt",
    "trouser",
  ]);
  assert.equal(stored.designSource?.kind, "uploaded");
  assert.equal(
    stored.designSource?.kind === "uploaded"
      ? stored.designSource.uploadReference.designReferenceId
      : null,
    "upload-empty-cat-1",
  );

  // Ready empty catalogue: hydration gate opens (old bug required styles.length > 0).
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: false,
      isLoadingData: false,
      stylesLoadState: "ready",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    true,
  );

  const hydratedAllocations = resolveDraftHydrationAllocations(stored);
  assert.equal(hydratedAllocations.hasValidModernAllocations, true);
  const reconciled = reconcileFutureFabricAllocationState({
    state: {
      fabricAllocations: hydratedAllocations.fabricAllocations,
      activeAllocationId:
        hydratedAllocations.fabricAllocations[0]?.allocationId || null,
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    },
    garmentTypeSelection: stored.garmentTypeSelection!,
  });
  assert.equal(reconciled.fabricAllocations.length, 2);

  // Empty catalogue coverage still allows upload path.
  assert.equal(
    resolveStep1CatalogueCoverage({
      garmentTypeSelection: stored.garmentTypeSelection!,
      styles: [],
      stylesLoadState: "ready",
    }).status,
    "empty_catalogue",
  );

  // Simulate post-hydration: guestDraftHydrated true unlocks autosave gate.
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: true,
      isLoadingData: false,
      stylesLoadState: "ready",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    false,
  );

  // Error load: still allow hydration of non-catalogue state; preserve style id.
  assert.equal(
    canBeginFutureDesignDraftHydration({
      guestDraftHydrated: false,
      isLoadingData: false,
      stylesLoadState: "error",
      hasFabrics: true,
      hasGarmentCatalog: true,
      identityStatus: "guest",
    }),
    true,
  );
}

console.log(
  "PASS: Style catalogue readiness + loaded-empty draft hydration regressions",
);
