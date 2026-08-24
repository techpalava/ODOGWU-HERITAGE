/**
 * Uploaded composition stability, authoritative pricing, legacy Agbada, source switch.
 * Uses production helpers/handlers — not a fake Design Studio state machine.
 */
import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  Fabric,
  FabricAllocationState,
  FabricCapacityGarmentSpec,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  activateFutureCatalogStyleSelection,
  createCatalogDesignSource,
  createUploadedDesignSource,
} from "./src/utils/designSourceState";
import {
  assignFutureFabricToGarment,
  getFutureFabricAllocationStateSignature,
  getFutureFabricStageCompletion,
  reconcileFutureFabricAllocationStateIfChanged,
} from "./src/utils/designStudioFutureFabricStage";
import { updateDormantGarmentTypeSelection } from "./src/utils/designStudioJourneyMode";
import { resolveDesignStudioFabricAllocationPricing } from "./src/utils/fabricAllocationPricing";
import type { BusinessSettings } from "./src/types";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  evaluatePreservedHiddenUploadedGarments,
  getUploadedDesignCompositionNeedsReview,
  getUploadedDesignCompositionSignature,
  getUploadedDesignStep1Readiness,
  mergeUploadedDesignCompositionWithStep1,
  toggleUploadedDesignGarmentComposition,
  UPLOADED_DESIGN_GARMENT_OPTIONS,
} from "./src/utils/uploadedDesignStep1";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { CUSTOMER_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { deleteUploadedDesignBeforeSourceChange } from "./src/utils/uploadedDesignDeletionOrchestration";

const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 0,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const fabric: Fabric = {
  code: "ODG-STAB-1",
  name: "Stability Fabric",
  category: "Ankara",
  description: "",
  color: "Ivory",
  colorHex: "#fff",
  price: 120,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  images: [],
} as unknown as Fabric;

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  updateDormantGarmentTypeSelection({
    currentSelection: {
      garmentTypes: [],
      demographic: "male",
      audienceSelection: { schemaVersion: 1, demographics: ["male"] },
      constructionByGarment: {},
    },
    normalizedCustomDetailCatalog: catalog,
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["male"],
  });

const compatibleStyle: StyleCategory = {
  id: "stability-shirt",
  name: "Stability Shirt",
  description: "",
  gender: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "stability-guest",
  mimeType: "image/png",
  designReferenceId: "stability-upload-1",
  createdAt: "2026-08-24T12:00:00.000Z",
});

const materialPricingOrThrow = (state: FabricAllocationState) => {
  const pricing = resolveDesignStudioFabricAllocationPricing({
    fabricAllocationState: state,
    fabrics: [fabric],
    selectedFabric: fabric,
    preserveInvalidHydratedModernData: false,
  });
  assert.equal(pricing.status, "resolved");
  return pricing;
};

// ---------------------------------------------------------------------------
// 1. Render-loop / Fabric settle: identical uploaded composition must stop writing
// ---------------------------------------------------------------------------
{
  const step1 = selection(["shirt"]);
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["trouser"],
  });
  const uploaded = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: composition,
    demographic: "male",
  });
  assert.ok(uploaded);

  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: step1,
    garmentKey: "base:shirt",
    fabricCode: fabric.code,
  }).state;

  let writes = 0;
  let lastSignature = getFutureFabricAllocationStateSignature(fabricState);
  const compositionSignature = getUploadedDesignCompositionSignature(
    uploaded.fabricCapacityComposition,
  );

  // Simulate many DesignStudioView renders with stable semantic inputs.
  for (let i = 0; i < 40; i += 1) {
    const journey = buildEffectiveUploadedJourneyGarmentTypeSelection({
      step1Selection: step1,
      uploadedComposition: uploaded.fabricCapacityComposition,
      normalizedCustomDetailCatalog: catalog,
    });
    assert.equal(
      getUploadedDesignCompositionSignature(
        journey.garmentTypes.map((garmentType) =>
          createStyleBaseGarmentSpec(garmentType),
        ),
      ).includes("shirt"),
      true,
    );
    assert.ok(journey.garmentTypes.includes("trouser"));
    assert.equal(compositionSignature, compositionSignature);

    const before = fabricState;
    fabricState = reconcileFutureFabricAllocationStateIfChanged({
      state: fabricState,
      garmentTypeSelection: journey,
    });
    const afterSignature = getFutureFabricAllocationStateSignature(fabricState);
    if (fabricState !== before) {
      writes += 1;
      lastSignature = afterSignature;
    } else {
      assert.equal(afterSignature, lastSignature);
    }
  }

  assert.ok(
    writes <= 2,
    `Fabric reconcile must settle quickly; saw ${writes} writes`,
  );
  assert.equal(
    fabricState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
    ),
    true,
  );
}

// ---------------------------------------------------------------------------
// 2. Authoritative pricing: shirt + trouser upload charges both constructions
// ---------------------------------------------------------------------------
{
  const step1 = selection(["shirt"]);
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["trouser"],
  });
  const journey = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: composition,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.deepEqual(journey.garmentTypes, ["shirt", "trouser"]);
  assert.equal(journey.constructionByGarment.shirt?.status, "resolved");
  assert.equal(journey.constructionByGarment.trouser?.status, "resolved");

  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: journey,
    garmentKey: "base:shirt",
    fabricCode: fabric.code,
  }).state;
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: journey,
      fabricAllocationState: fabricState,
      fabrics: [fabric],
    }).isComplete,
    false,
  );
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: journey,
    garmentKey: "base:trouser",
    fabricCode: fabric.code,
  }).state;
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: journey,
      fabricAllocationState: fabricState,
      fabrics: [fabric],
    }).isComplete,
    true,
  );

  const shirtOnly = step1.constructionByGarment.shirt;
  assert.equal(shirtOnly?.status, "resolved");
  const trouserOnly = journey.constructionByGarment.trouser;
  assert.equal(trouserOnly?.status, "resolved");
  const expectedSubtotal =
    (shirtOnly!.status === "resolved" ? shirtOnly.totalPrice : 0) +
    (trouserOnly!.status === "resolved" ? trouserOnly.totalPrice : 0);

  const pricing = calculateDesignPricing({
    route: "community",
    design: { accessories: [] },
    materialPricing: materialPricingOrThrow(fabricState),
    baseGarmentComposition: composition,
    catalog,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: journey,
  });
  assert.equal(pricing.garmentConstructionSubtotal, expectedSubtotal);
  assert.ok(expectedSubtotal > (shirtOnly!.status === "resolved" ? shirtOnly.totalPrice : 0));
}

// ---------------------------------------------------------------------------
// 3. Gown extra: construction + fabric units 2
// ---------------------------------------------------------------------------
{
  const step1 = selection(["shirt"]);
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["full_length_gown"],
  });
  assert.equal(
    composition.find((spec) => spec.garmentType === "full_length_gown")
      ?.fabricUnits,
    2,
  );
  const journey = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: composition,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.ok(journey.garmentTypes.includes("shirt"));
  assert.ok(journey.garmentTypes.includes("full_length_gown"));
  assert.equal(
    journey.constructionByGarment.full_length_gown?.status,
    "resolved",
  );
  const shirtPrice =
    journey.constructionByGarment.shirt?.status === "resolved"
      ? journey.constructionByGarment.shirt.totalPrice
      : 0;
  const gownPrice =
    journey.constructionByGarment.full_length_gown?.status === "resolved"
      ? journey.constructionByGarment.full_length_gown.totalPrice
      : 0;
  assert.ok(gownPrice > 0);
  assert.ok(shirtPrice > 0);
}

// ---------------------------------------------------------------------------
// 4. Legacy Agbada preserved across toggle / Step 1 change; never selectable
// ---------------------------------------------------------------------------
{
  assert.ok(
    UPLOADED_DESIGN_GARMENT_OPTIONS.every(
      (option) => option.garmentType !== "agbada",
    ),
  );
  assert.equal(
    createCatalogueAdditionalGarmentSelection({
      garmentType: "agbada",
      existingAssignments: [],
    }).status,
    "invalid",
  );

  const legacyComposition: FabricCapacityGarmentSpec[] = [
    createStyleBaseGarmentSpec("agbada"),
    createStyleBaseGarmentSpec("shirt"),
  ];
  let composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: [],
    preservedHiddenComposition: legacyComposition,
  });
  assert.ok(composition.some((spec) => spec.garmentType === "agbada"));
  assert.ok(composition.some((spec) => spec.garmentType === "shirt"));
  const preservedAgbada = composition.find(
    (spec) => spec.garmentType === "agbada",
  )!;
  assert.equal(preservedAgbada.key, legacyComposition[0].key);
  assert.equal(preservedAgbada.fabricUnits, 2);

  composition = toggleUploadedDesignGarmentComposition(composition, "skirt", {
    step1GarmentTypes: ["shirt"],
  });
  assert.ok(composition.some((spec) => spec.garmentType === "agbada"));
  assert.ok(composition.some((spec) => spec.garmentType === "skirt"));

  composition = toggleUploadedDesignGarmentComposition(composition, "skirt", {
    step1GarmentTypes: ["shirt"],
  });
  assert.ok(composition.some((spec) => spec.garmentType === "agbada"));
  assert.ok(!composition.some((spec) => spec.garmentType === "skirt"));

  composition = toggleUploadedDesignGarmentComposition(composition, "agbada", {
    step1GarmentTypes: ["shirt"],
  });
  assert.equal(
    composition.filter((spec) => spec.garmentType === "agbada").length,
    1,
    "Toggle must not add a second Agbada and must preserve the legacy one",
  );

  // Step 1 gains trouser; Agbada remains.
  composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt", "trouser"],
    additionalGarmentTypes: [],
    preservedHiddenComposition: composition,
  });
  assert.ok(composition.some((spec) => spec.garmentType === "agbada"));
  assert.deepEqual(
    composition
      .filter((spec) =>
        CUSTOMER_SELECTABLE_GARMENT_TYPES.includes(
          spec.garmentType as (typeof CUSTOMER_SELECTABLE_GARMENT_TYPES)[number],
        ),
      )
      .map((spec) => spec.garmentType),
    ["shirt", "trouser"],
  );

  // Round-trip through uploaded source persistence shape.
  const persisted = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: composition,
    demographic: "male",
  });
  assert.ok(persisted);
  const restored = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt", "trouser"],
    additionalGarmentTypes: ["skirt"],
    preservedHiddenComposition: persisted.fabricCapacityComposition,
  });
  assert.ok(restored.some((spec) => spec.garmentType === "agbada"));
  assert.ok(restored.some((spec) => spec.garmentType === "skirt"));
}

// ---------------------------------------------------------------------------
// 4b. Malformed hidden Agbada — fail closed, never auto-correct
// ---------------------------------------------------------------------------
{
  const malformed: FabricCapacityGarmentSpec = {
    key: "bad",
    garmentType: "agbada",
    fabricUnits: 1,
  };
  const evaluation = evaluatePreservedHiddenUploadedGarments([
    malformed,
    createStyleBaseGarmentSpec("shirt"),
  ]);
  assert.equal(evaluation.needsReview, true);
  assert.equal(evaluation.validSpecs.length, 0);
  assert.equal(evaluation.malformedSpecs.length, 1);
  assert.equal(evaluation.malformedSpecs[0].fabricUnits, 1);
  assert.equal(evaluation.malformedSpecs[0].key, "bad");

  const merged = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: [],
    preservedHiddenComposition: [malformed],
  });
  const hidden = merged.find((spec) => spec.garmentType === "agbada");
  assert.ok(hidden);
  assert.equal(hidden!.fabricUnits, 1, "must not manufacture fabricUnits=2");
  assert.equal(hidden!.key, "bad", "must not rewrite key to base:agbada");
  assert.equal(getUploadedDesignCompositionNeedsReview(merged), true);
  assert.equal(
    getUploadedDesignStep1Readiness({
      uploadReference,
      fabricCapacityComposition: merged,
      demographic: "male",
    }).isReady,
    false,
  );
}

// ---------------------------------------------------------------------------
// 5. Upload → catalogue source switch (production deletion semantics)
// ---------------------------------------------------------------------------
{
  const step1 = selection(["shirt"]);
  const uploadComposition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["trouser"],
  });
  const uploaded = createUploadedDesignSource({
    uploadReference,
    fabricCapacityComposition: uploadComposition,
    demographic: "male",
  });
  assert.ok(uploaded);

  let fabricState = FabricAllocationStateEngine.initialize();
  const uploadJourney = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: uploadComposition,
    normalizedCustomDetailCatalog: catalog,
  });
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: uploadJourney,
    garmentKey: "base:shirt",
    fabricCode: fabric.code,
  }).state;
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: uploadJourney,
    garmentKey: "base:trouser",
    fabricCode: fabric.code,
  }).state;
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: uploadJourney,
      fabricAllocationState: fabricState,
      fabrics: [fabric],
    }).isComplete,
    true,
  );

  // Production Upload → Catalogue deletes the private upload before committing.
  let deletedReferenceId: string | null = null;
  let sourceCommitted = false;
  let activeDesignSource: ReturnType<typeof createUploadedDesignSource> | ReturnType<
    typeof createCatalogDesignSource
  > | null = uploaded;
  let activeUploadComposition: FabricCapacityGarmentSpec[] | null =
    uploadComposition.map((spec) => ({ ...spec }));

  const deletion = await deleteUploadedDesignBeforeSourceChange({
    reference: uploadReference,
    deleteDraft: async (reference) => {
      deletedReferenceId = reference.designReferenceId;
    },
    commitSourceChange: () => {
      sourceCommitted = true;
      activeUploadComposition = null;
      const activated = activateFutureCatalogStyleSelection({
        styleId: compatibleStyle.id,
        primaryFabricCode: fabric.code,
      });
      activeDesignSource =
        activated.designSource || createCatalogDesignSource(compatibleStyle.id);
    },
  });
  assert.equal(deletion.status, "deleted");
  assert.equal(deletedReferenceId, uploadReference.designReferenceId);
  assert.equal(sourceCommitted, true);
  assert.equal(activeDesignSource?.kind, "catalog");
  assert.equal(activeUploadComposition, null);

  fabricState = reconcileFutureFabricAllocationStateIfChanged({
    state: fabricState,
    garmentTypeSelection: step1,
  });
  assert.equal(
    fabricState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:trouser",
      ),
    ),
    false,
    "Upload-only Trouser must not remain required under catalogue Step 1",
  );
  assert.equal(
    fabricState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
    ),
    true,
  );
  const catalogPricing = calculateDesignPricing({
    route: "community",
    design: { accessories: [] },
    materialPricing: materialPricingOrThrow(fabricState),
    baseGarmentComposition: [createStyleBaseGarmentSpec("shirt")],
    catalog,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection: step1,
  });
  assert.equal(
    catalogPricing.garmentConstructionSubtotal,
    step1.constructionByGarment.shirt?.status === "resolved"
      ? step1.constructionByGarment.shirt.totalPrice
      : 0,
  );

  // Catalogue → Upload starts a NEW upload flow; prior composition does not return.
  const freshUploadComposition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: [],
  });
  assert.ok(
    !freshUploadComposition.some((spec) => spec.garmentType === "trouser"),
    "Returning to Upload after deletion must not restore prior upload-only garments",
  );
  const freshJourney = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: freshUploadComposition,
    normalizedCustomDetailCatalog: catalog,
  });
  fabricState = reconcileFutureFabricAllocationStateIfChanged({
    state: fabricState,
    garmentTypeSelection: freshJourney,
  });
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: freshJourney,
      fabricAllocationState: fabricState,
      fabrics: [fabric],
    }).isComplete,
    true,
    "Fresh upload (shirt only) keeps prior valid shirt fabric assignment",
  );

  // Failed deletion must not partially switch source.
  let failedCommit = false;
  const failedDeletion = await deleteUploadedDesignBeforeSourceChange({
    reference: uploadReference,
    deleteDraft: async () => {
      throw new Error("storage denied");
    },
    commitSourceChange: () => {
      failedCommit = true;
    },
  });
  assert.equal(failedDeletion.status, "failed");
  assert.equal(failedCommit, false);
}

// ---------------------------------------------------------------------------
// 6. Fabric state signature distinguishes previously omitted semantic fields
// ---------------------------------------------------------------------------
{
  const base = FabricAllocationStateEngine.initialize();
  const withShirt = assignFutureFabricToGarment({
    state: base,
    garmentTypeSelection: selection(["shirt"]),
    garmentKey: "base:shirt",
    fabricCode: fabric.code,
  }).state;
  const clone: FabricAllocationState = JSON.parse(JSON.stringify(withShirt));
  assert.equal(
    getFutureFabricAllocationStateSignature(withShirt),
    getFutureFabricAllocationStateSignature(clone),
  );

  const withCodeChange: FabricAllocationState = JSON.parse(
    JSON.stringify(withShirt),
  );
  withCodeChange.fabricAllocations[0].garmentAssignments[0].code = "OTHER";
  assert.notEqual(
    getFutureFabricAllocationStateSignature(withShirt),
    getFutureFabricAllocationStateSignature(withCodeChange),
  );

  const withSpecKeyChange: FabricAllocationState = JSON.parse(
    JSON.stringify(withShirt),
  );
  const assignment = withSpecKeyChange.fabricAllocations[0].garmentAssignments[0];
  assignment.garmentSpec = {
    key: "different-key",
    garmentType: assignment.garmentType,
    fabricUnits: assignment.fabricUnits,
  };
  assert.notEqual(
    getFutureFabricAllocationStateSignature(withShirt),
    getFutureFabricAllocationStateSignature(withSpecKeyChange),
  );
}

console.log(
  "PASS: uploaded composition stability + authoritative pricing + legacy Agbada + source switch",
);
