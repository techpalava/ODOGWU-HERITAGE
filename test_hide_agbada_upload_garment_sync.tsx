/**
 * Customer-selectable garments hide Agbada; Step 1 syncs into Upload Your Own Design.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { GarmentTypeStep } from "./src/components/GarmentTypeStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  createStyleBaseGarmentSpec,
  STYLE_BASE_GARMENT_TYPES,
} from "./src/config/StyleFabricCapacityConfig";
import { createCatalogueAdditionalGarmentSelection } from "./src/utils/additionalGarmentDomain";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
  STEP_1_SELECTABLE_GARMENT_TYPES,
} from "./src/utils/garmentConstructionPricing";
import {
  assignFutureFabricToGarment,
  getFutureFabricStageCompletion,
  reconcileFutureFabricAllocationState,
} from "./src/utils/designStudioFutureFabricStage";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  Fabric,
  FabricGarmentType,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  getUploadedDesignAdditionalGarmentTypes,
  getUploadedDesignRequiredStep1GarmentTypes,
  mergeUploadedDesignCompositionWithStep1,
  toggleUploadedDesignGarmentComposition,
  UPLOADED_DESIGN_GARMENT_OPTIONS,
} from "./src/utils/uploadedDesignStep1";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: Object.fromEntries(
    garmentTypes.map((garmentType) => [
      garmentType,
      {
        status: "resolved" as const,
        garmentType,
        totalPriceCents: 5000,
        components: [],
      },
    ]),
  ),
});

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const emptyUploaded = {
  source: null,
  reference: null,
  composition: [] as ReturnType<typeof mergeUploadedDesignCompositionWithStep1>,
  demographic: null,
  previewUrl: null,
  error: "",
  isUploading: false,
  isReplacing: false,
  isDeleting: false,
  isLoadingPreview: false,
  isConfirmed: false,
  isPricingActive: false,
};

// 1. Authoritative customer list excludes agbada; canonical still includes it.
assert.deepEqual([...CUSTOMER_SELECTABLE_GARMENT_TYPES], [
  "shirt",
  "trouser",
  "skirt",
  "standard_shorts",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
]);
assert.equal(CUSTOMER_SELECTABLE_GARMENT_TYPES.length, 8);
assert.deepEqual(
  [...STEP_1_SELECTABLE_GARMENT_TYPES],
  [...CUSTOMER_SELECTABLE_GARMENT_TYPES],
);
assert.ok(CANONICAL_PHYSICAL_GARMENT_TYPES.includes("agbada"));
assert.ok(STYLE_BASE_GARMENT_TYPES.includes("agbada"));
assert.ok(!CUSTOMER_SELECTABLE_GARMENT_TYPES.includes("agbada"));
assert.ok(
  UPLOADED_DESIGN_GARMENT_OPTIONS.every(
    (option) => option.garmentType !== "agbada",
  ),
);

// 2. Step 1 presentation has no Agbada card.
{
  const markup = renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: [],
      selectedDemographics: [],
      normalizedCustomDetailCatalog: catalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );
  assert.equal(markup.includes("Agbada"), false);
  assert.equal(markup.includes("agbada"), false);
}

// 3. Upload panel has no Agbada; Step 1 garments preselected and locked.
{
  const garmentTypeSelection = selection(["shirt", "trouser"]);
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: garmentTypeSelection.garmentTypes,
    additionalGarmentTypes: [],
  });
  const reference = {
    designReferenceId: "upload-sync-test",
    ownerUid: "guest",
    storagePath: "customer-design-drafts/guest/upload-sync-test/original.png",
    mimeType: "image/png" as const,
    createdAt: "2026-08-24T00:00:00.000Z",
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        styles: [],
        garmentTypeSelection,
        selectedStyleId: null,
        stagePrice: null,
        uploadedDesign: {
          ...emptyUploaded,
          reference,
          composition,
        },
        pendingCatalogStyleName: null,
        stylesLoadState: "ready",
        onSelectStyle: () => undefined,
        onUploadDesignFile: () => undefined,
        onToggleUploadedGarment: () => undefined,
        onUploadedDemographicChange: () => undefined,
        onRemoveUploadedDesign: () => undefined,
        onRetryUploadedDesignDeletion: () => undefined,
        onContinueUploadedDesign: () => undefined,
        onBack: () => undefined,
        onReturnToGarmentType: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const text = textContent(renderer.root);
  assert.equal(text.includes("Agbada"), false);
  assert.match(text, /Selected in Step 1/);
  const checkboxes = renderer.root.findAllByType("input").filter(
    (node) => node.props.type === "checkbox",
  );
  assert.equal(checkboxes.length, 8);
  const shirt = checkboxes.find(
    (node) =>
      node.props.checked &&
      node.props.disabled &&
      String(textContent(node.parent as ReactTestInstance)).includes("Shirt"),
  );
  assert.ok(shirt, "Shirt from Step 1 must be checked and disabled");
  const trouser = checkboxes.find(
    (node) =>
      node.props.checked &&
      node.props.disabled &&
      String(textContent(node.parent as ReactTestInstance)).includes("Trouser"),
  );
  assert.ok(trouser);
  const skirt = checkboxes.find(
    (node) =>
      !node.props.checked &&
      !node.props.disabled &&
      String(textContent(node.parent as ReactTestInstance)).includes("Skirt"),
  );
  assert.ok(skirt);
}

// 4. Domain: dress+kaftan required; add/remove skirt; cannot remove required shirt.
{
  const step1 = ["dress", "kaftan"] as const;
  let composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: step1,
    additionalGarmentTypes: [],
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["dress", "kaftan"],
  );

  composition = toggleUploadedDesignGarmentComposition(composition, "skirt", {
    step1GarmentTypes: step1,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["skirt", "dress", "kaftan"],
  );

  composition = toggleUploadedDesignGarmentComposition(composition, "skirt", {
    step1GarmentTypes: step1,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["dress", "kaftan"],
  );

  composition = toggleUploadedDesignGarmentComposition(composition, "dress", {
    step1GarmentTypes: step1,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["dress", "kaftan"],
    "Required Step 1 dress cannot be unchecked",
  );

  // Agbada cannot be newly selected.
  composition = toggleUploadedDesignGarmentComposition(composition, "agbada", {
    step1GarmentTypes: step1,
  });
  assert.equal(
    composition.some((spec) => spec.garmentType === "agbada"),
    false,
  );

  // Legacy Agbada already present survives visible toggles.
  let legacy = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: [],
    preservedHiddenComposition: [createStyleBaseGarmentSpec("agbada")],
  });
  assert.ok(legacy.some((spec) => spec.garmentType === "agbada"));
  legacy = toggleUploadedDesignGarmentComposition(legacy, "skirt", {
    step1GarmentTypes: ["shirt"],
  });
  assert.ok(legacy.some((spec) => spec.garmentType === "agbada"));
  assert.ok(legacy.some((spec) => spec.garmentType === "skirt"));
}

// 5. Step 1 change: add trouser => required; remove shirt => not mandatory; keep skirt extra.
{
  let step1: FabricGarmentType[] = ["shirt"];
  let additional: FabricGarmentType[] = ["skirt"];
  let composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: step1,
    additionalGarmentTypes: additional,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["shirt", "skirt"],
  );

  step1 = ["shirt", "trouser"];
  additional = getUploadedDesignAdditionalGarmentTypes({
    step1GarmentTypes: step1,
    additionalGarmentTypes: additional,
  });
  composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: step1,
    additionalGarmentTypes: additional,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["shirt", "trouser", "skirt"],
  );
  assert.deepEqual(getUploadedDesignRequiredStep1GarmentTypes(step1), [
    "shirt",
    "trouser",
  ]);

  step1 = ["trouser"];
  additional = getUploadedDesignAdditionalGarmentTypes({
    step1GarmentTypes: step1,
    additionalGarmentTypes: additional,
  });
  composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: step1,
    additionalGarmentTypes: additional,
  });
  assert.deepEqual(
    composition.map((spec) => spec.garmentType),
    ["trouser", "skirt"],
  );
  assert.ok(!composition.some((spec) => spec.garmentType === "shirt"));
}

// 6. Additional garment customer path rejects agbada; options exclude it.
{
  const rejected = createCatalogueAdditionalGarmentSelection({
    garmentType: "agbada",
    existingAssignments: [],
  });
  assert.equal(rejected.status, "invalid");
  assert.ok(
    rejected.allowedGarments.every((garment) => garment.garmentType !== "agbada"),
  );

  const withoutParent = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: [],
  });
  assert.equal(
    withoutParent.status,
    "invalid",
    "catalogue addition requires a committed parent assignment",
  );

  const allowed = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: [
      {
        garmentKey: "base:shirt",
        code: "BASE_SHIRT",
        garmentType: "shirt",
        fabricUnits: 1,
        garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
        sourceRole: "main",
        dependencyStatus: "valid",
      },
    ],
  });
  assert.equal(allowed.status, "resolved");
  assert.ok(
    allowed.allowedGarments.every((garment) => garment.garmentType !== "agbada"),
  );
}

// 7. Legacy/persisted Agbada still normalizes via createStyleBaseGarmentSpec.
{
  const legacy = createStyleBaseGarmentSpec("agbada");
  assert.equal(legacy.garmentType, "agbada");
  assert.equal(legacy.fabricUnits, 2);
  assert.equal(legacy.key, "base:agbada");
}

// 8. Fabric incomplete when upload adds trouser beyond Step 1 shirt.
{
  const fabric = {
    code: "ODG-TEST-1",
    name: "Test Fabric",
    category: "Ankara",
    description: "",
    color: "Ivory",
    colorHex: "#fff",
    price: 100,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    images: [],
  } as unknown as Fabric;

  const step1Only = selection(["shirt"]);
  let state = FabricAllocationStateEngine.initialize();
  state = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: step1Only,
    garmentKey: "base:shirt",
    fabricCode: fabric.code,
  }).state;

  const completeForShirt = getFutureFabricStageCompletion({
    garmentTypeSelection: step1Only,
    fabricAllocationState: state,
    fabrics: [fabric],
  });
  assert.equal(completeForShirt.isComplete, true);

  const journeyWithTrouser = selection(["shirt", "trouser"]);
  state = reconcileFutureFabricAllocationState({
    state,
    garmentTypeSelection: journeyWithTrouser,
  });
  const incomplete = getFutureFabricStageCompletion({
    garmentTypeSelection: journeyWithTrouser,
    fabricAllocationState: state,
    fabrics: [fabric],
  });
  assert.equal(incomplete.isComplete, false);
  assert.ok(
    state.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
    ),
    "Existing shirt fabric assignment must remain preserved",
  );

  state = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: journeyWithTrouser,
    garmentKey: "base:trouser",
    fabricCode: fabric.code,
  }).state;
  const completeAgain = getFutureFabricStageCompletion({
    garmentTypeSelection: journeyWithTrouser,
    fabricAllocationState: state,
    fabrics: [fabric],
  });
  assert.equal(completeAgain.isComplete, true);

  // Full-length gown extra uses 2 internal units.
  const gownExtra = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["full_length_gown"],
  });
  assert.equal(
    gownExtra.find((spec) => spec.garmentType === "full_length_gown")?.fabricUnits,
    2,
  );
  assert.equal(
    gownExtra.find((spec) => spec.garmentType === "shirt")?.fabricUnits,
    1,
  );
  const kaftanExtra = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["kaftan"],
  });
  assert.equal(
    kaftanExtra.find((spec) => spec.garmentType === "kaftan")?.fabricUnits,
    1,
  );
}

console.log(
  "PASS: hide Agbada + Step1→Upload garment sync + fabric integrity regressions",
);
