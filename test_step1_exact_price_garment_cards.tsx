import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { GarmentTypeStep } from "./src/components/GarmentTypeStep";
import { DormantFutureCustomDetailsStep } from "./src/components/DormantFutureCustomDetailsStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  FabricGarmentAssignment,
  GarmentTypeStepSelection,
} from "./src/types";
import { inspectCustomDetailCatalog, normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  STEP_1_GARMENT_CARD_PRESETS,
  findStep1CardPresetForResolution,
  getAllowedStep4ConstructionOptionIdsForBaseGarment,
  resolveGarmentConstructionPricing,
  resolveGarmentConstructionPricingForOptionId,
} from "./src/utils/garmentConstructionPricing";
import {
  reconcileGarmentTypeStepSelection,
  selectGarmentConstructionOption,
  selectStep1GarmentCardPreset,
} from "./src/utils/garmentTypeStepState";
import { acceptDormantGarmentConstructionDefaults, updateDormantGarmentTypeSelection } from "./src/utils/designStudioJourneyMode";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { projectFutureCustomDetailsCatalogue } from "./src/utils/futureCustomDetailsCatalogue";
import { resolveLockedGarmentConstructionBridge } from "./src/utils/garmentConstructionCustomDetails";
import { resolveMeasurementProfile } from "./src/utils/measurementBlueprint";
import { AI_TRY_ON_VISIBLE_OPTIONS } from "./src/utils/aiTryOnOrderDetails";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

// 1. All 13 Step 1 cards render with exact dynamically resolved catalogue prices & zero "Kaftan".
{
  const expectedCards: ReadonlyArray<[string, string, number]> = [
    ["shirt_short_sleeve", "Standard Shirt — Short Sleeve", 65],
    ["shirt_long_sleeve", "Standard Shirt — Long Sleeve", 70],
    ["kaftan_short_sleeve", "Long Shirt — Short Sleeve", 70],
    ["kaftan_long_sleeve", "Long Shirt — Long Sleeve", 75],
    ["dress_sleeveless_or_short", "Standard Dress — Sleeveless / Short Sleeve", 70],
    ["dress_mid_or_long", "Standard Dress — Mid / Long Sleeve", 75],
    ["full_length_gown_sleeveless_or_short", "Long Dress — Sleeveless / Short Sleeve", 75],
    ["full_length_gown_mid_or_long", "Long Dress — Mid / Long Sleeve", 80],
    ["skirt", "Standard Skirt", 75],
    ["long_skirt", "Long Skirt", 80],
    ["trouser", "Trouser", 75],
    ["standard_shorts", "Standard Nikka Shorts", 70],
    ["bum_shorts", "Standard Bum Shorts", 70],
  ];
  assert.equal(STEP_1_GARMENT_CARD_PRESETS.length, 13);

  const markup = renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: [],
      selectedDemographics: ["unisex"],
      normalizedCustomDetailCatalog: catalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );
  const visibleStep1Text = [
    markup.replace(/<[^>]+>/g, " "),
    ...[...markup.matchAll(/(?:alt|aria-label)="([^"]*)"/g)].map((match) => match[1]),
  ].join(" ");
  assert.equal(/\bkaftan\b/i.test(visibleStep1Text), false, "Customer-visible Step 1 text and accessible labels must never contain Kaftan");

  for (const [presetId, label, euro] of expectedCards) {
    const match = markup.match(new RegExp(`data-testid="step1-garment-card-${presetId}"[\\s\\S]*?</article>`));
    assert.ok(match, `Card ${presetId} must render`);
    assert.ok(match[0].includes(label), `Card ${presetId} must display ${label}`);
    assert.ok(match[0].includes(`€${euro.toFixed(2)}`), `Card ${presetId} must display €${euro.toFixed(2)}`);
  }

  // Dynamic Admin catalogue price override propagates automatically (never hardcoded).
  const adminEditedCatalog = normalizeCustomDetailCatalog([
    { id: "shirt_std_midlong", priceCents: 7400 },
    { id: "dress_long_long", priceCents: 8300 },
  ]);
  const repricedShirt = resolveGarmentConstructionPricingForOptionId("shirt", "shirt_std_midlong", adminEditedCatalog);
  assert.equal(repricedShirt.status, "resolved");
  if (repricedShirt.status === "resolved") {
    assert.equal(repricedShirt.totalPriceCents, 7400);
  }
  const repricedMarkup = renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: [],
      selectedDemographics: ["unisex"],
      normalizedCustomDetailCatalog: adminEditedCatalog,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );
  const longShirtCard = repricedMarkup.match(/data-testid="step1-garment-card-shirt_long_sleeve"[\s\S]*?<\/article>/);
  const longDressCard = repricedMarkup.match(/data-testid="step1-garment-card-full_length_gown_mid_or_long"[\s\S]*?<\/article>/);
  assert.ok(longShirtCard?.[0].includes("€74.00"), "Admin price override flows dynamically to Step 1 shirt card");
  assert.ok(longDressCard?.[0].includes("€83.00"), "Admin price override flows dynamically to Step 1 dress card");
}

// 2. Switching sibling cards replaces price (€65 -> €70, never €135), preserves other garments, and survives reload.
{
  let selection: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["trouser"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  // Pick a non-default trouser fastening so we verify Step 1 shirt switching preserves it.
  const trouserElastic = selectGarmentConstructionOption({
    resolution: selection.constructionByGarment.trouser!,
    selectionGroup: "trouser_fastening",
    optionId: "trouser_elastic",
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(trouserElastic.status, "selected");
  if (trouserElastic.status === "selected") {
    selection = {
      ...selection,
      constructionByGarment: {
        ...selection.constructionByGarment,
        trouser: trouserElastic.resolution,
      },
    };
  }

  let renderer!: ReturnType<typeof create>;
  const renderInteractive = () =>
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: selection.garmentTypes,
      selectedDemographics: selection.audienceSelection?.demographics ?? ["male"],
      selectedConstructionByGarment: selection.constructionByGarment,
      normalizedCustomDetailCatalog: catalog,
      onGarmentTypesChange: (garmentTypes) => {
        selection = updateDormantGarmentTypeSelection({
          currentSelection: selection,
          selectedGarmentTypes: garmentTypes,
          normalizedCustomDetailCatalog: catalog,
        });
      },
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: (resolutions) => {
        selection = acceptDormantGarmentConstructionDefaults({
          currentSelection: selection,
          resolutions,
          normalizedCustomDetailCatalog: catalog,
        });
      },
    });

  act(() => {
    renderer = create(renderInteractive());
  });

  // Select Standard Shirt — Short Sleeve (€65)
  act(() => {
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_short_sleeve" }).props.onClick();
  });
  act(() => renderer.update(renderInteractive()));

  assert.deepEqual(selection.garmentTypes, ["shirt", "trouser"]);
  const shortShirt = selection.constructionByGarment.shirt;
  assert.equal(shortShirt?.status, "resolved");
  if (shortShirt?.status === "resolved") {
    assert.equal(shortShirt.components[0].optionId, "shirt_std_short");
    assert.equal(shortShirt.totalPriceCents, 6500);
  }
  assert.equal(
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_short_sleeve" }).props["aria-pressed"],
    true,
  );
  assert.equal(
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_long_sleeve" }).props["aria-pressed"],
    false,
  );

  // Click sibling card Standard Shirt — Long Sleeve (€70 replaces €65, never €135!)
  act(() => {
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_long_sleeve" }).props.onClick();
  });
  act(() => renderer.update(renderInteractive()));

  assert.deepEqual(selection.garmentTypes, ["shirt", "trouser"], "garmentTypes stays deduplicated (1 shirt)");
  const longShirt = selection.constructionByGarment.shirt;
  assert.equal(longShirt?.status, "resolved");
  if (longShirt?.status === "resolved") {
    assert.equal(longShirt.components.length, 1);
    assert.equal(longShirt.components[0].optionId, "shirt_std_midlong");
    assert.equal(longShirt.totalPriceCents, 7000, "Price is replaced (€65 -> €70), never added twice");
  }
  const preservedTrouser = selection.constructionByGarment.trouser;
  assert.equal(
    preservedTrouser?.status === "resolved" ? preservedTrouser.components[0].optionId : null,
    "trouser_elastic",
    "Switching shirt cards preserves unrelated garment constructions",
  );
  assert.equal(
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_short_sleeve" }).props["aria-pressed"],
    false,
  );
  assert.equal(
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_long_sleeve" }).props["aria-pressed"],
    true,
  );

  // Survives reload (reconcileGarmentTypeStepSelection)
  const reloaded = reconcileGarmentTypeStepSelection({
    persistedSelection: JSON.parse(JSON.stringify(selection)),
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  assert.equal(
    reloaded.constructionByGarment.shirt?.status === "resolved"
      ? reloaded.constructionByGarment.shirt.components[0].optionId
      : null,
    "shirt_std_midlong",
    "Explicit Step 1 Long Sleeve survives reload without resetting to Short Sleeve",
  );
  assert.equal(
    reloaded.constructionByGarment.shirt?.status === "resolved"
      ? reloaded.constructionByGarment.shirt.totalPriceCents
      : null,
    7000,
  );

  // Downstream parity: Step 6 Measurements, Step 7 AI Try-on, Step 10 Pricing Bridge
  const longSleeveProfile = resolveMeasurementProfile({
    garment: { garmentKey: "base:shirt", garmentType: "shirt" } as never,
    garmentTypeSelection: reloaded,
  });
  assert.equal(longSleeveProfile.status, "resolved");
  if (longSleeveProfile.status === "resolved") {
    assert.equal(longSleeveProfile.constructionOptionId, "shirt_std_midlong");
  }
  assert.equal(
    AI_TRY_ON_VISIBLE_OPTIONS.get("shirt_std_midlong")?.label,
    "Standard Length Shirt, Long Sleeve",
  );
  const pricingBridge = resolveLockedGarmentConstructionBridge({
    mode: "garment_type_locked",
    garmentTypeSelection: reloaded,
    catalog,
    selections: {},
  });
  assert.equal(
    pricingBridge.readOnlyConstructionRows.find((row) => row.garmentKey === "base:shirt")?.priceCents,
    7000,
    "Downstream pricing bridge reads exact Step 1 price (€70) without double-charging",
  );

  // Clicking the active card deselects shirt cleanly
  act(() => {
    renderer.root.findByProps({ "data-testid": "step1-garment-select-shirt_long_sleeve" }).props.onClick();
  });
  act(() => renderer.update(renderInteractive()));
  assert.deepEqual(selection.garmentTypes, ["trouser"]);
  assert.equal(selection.constructionByGarment.shirt, undefined);
  act(() => renderer.unmount());
}

// Helper to render Step 4 / Step 5
const renderCustomDetailsStage = ({
  stage = "custom_details",
  selection,
  additionalGarments = [],
  additionalGarmentConstructions,
  existingState = createEmptyGarmentScopedCustomDetailsState(),
}: {
  stage?: "custom_details" | "personalized_additions";
  selection: GarmentTypeStepSelection;
  additionalGarments?: readonly FabricGarmentAssignment[];
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
  existingState?: ReturnType<typeof createEmptyGarmentScopedCustomDetailsState>;
}) => {
  const reconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: selection,
    additionalGarments,
    additionalGarmentConstructions,
    catalogInspection,
    existingState,
  });
  const inputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation,
    catalogInspection,
    existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
  });
  const catalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection: selection,
    reconciliation,
    activeOptions: catalogInspection.activeOptions,
    additionalGarments,
    additionalGarmentConstructions,
  });
  const completion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation,
    personalizedInputs: inputs,
  });
  const pricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation,
    catalogInspection,
  });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(DormantFutureCustomDetailsStep, {
        stage,
        reconciliation,
        catalogue,
        personalizedInputs: inputs.state,
        completion,
        pricing,
        orderLevelCustomDetailsPrice: 0,
        constructionBreakdown: { status: "complete", rows: [] },
        constructionSubtotal: 0,
        designSelections: {},
        selectedStyle: null,
        additionalGarments,
        additionalGarmentConstructionOptions: [],
        onSingleSelect: () => undefined,
        onClearSelection: () => undefined,
        onConstructionSelect: () => undefined,
        onToggleMultiSelect: () => undefined,
        onPersonalizedTextChange: () => undefined,
        onDecorativeFeatureEnable: () => undefined,
        onDecorativeFeatureDisable: () => undefined,
        onDecorativeFeatureGarmentAssign: () => undefined,
        onClearDecorativeFeatures: () => undefined,
        onMonogramPlacementChange: () => undefined,
        onMonogramTextChange: () => undefined,
        onAccessoryToggle: () => undefined,
        onClearAccessories: () => undefined,
        onAddAdditionalGarment: () => undefined,
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  return { renderer, completion, pricing };
};

// 3. Step 4 hides shirt_construction (base Shirt & Long Shirt) and skirt_length (base Skirt & Long Skirt) and marks Step 4 complete.
{
  let selection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "kaftan", "skirt", "long_skirt", "trouser", "standard_shorts", "bum_shorts"],
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  selection = selectStep1GarmentCardPreset({
    currentSelection: selection,
    presetId: "kaftan_long_sleeve",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  let scopedState = createEmptyGarmentScopedCustomDetailsState();
  scopedState = setGarmentScopedCustomDetailSelection(scopedState, "base:shirt", "neck_design", "neck_no_round");
  scopedState = setGarmentScopedCustomDetailSelection(scopedState, "base:shirt", "shirt_pockets", "shirt_pocket_1");

  const { renderer, completion, pricing } = renderCustomDetailsStage({
    selection,
    existingState: scopedState,
  });
  assert.equal(completion.status, "complete", "Step 4 must be complete when construction is locked in Step 1");
  assert.equal(pricing.status, "exact");
  assert.equal(pricing.status === "exact" ? pricing.subtotalCents : -1, 0, "Zero double-charging of Step 1 construction");
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "shirt_construction" }).length,
    0,
    "Step 4 must hide shirt_construction for base Shirt and Long Shirt",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "skirt_length" }).length,
    0,
    "Step 4 must hide skirt_length for base Standard Skirt and Long Skirt",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "neck_design" }).length,
    1,
    "Step 4 must keep neck_design intact",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "shirt_pockets" }).length,
    2,
    "Step 4 must keep shirt_pockets intact for base Shirt and Long Shirt",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "skirt_pockets" }).length,
    2,
    "Step 4 must keep skirt_pockets intact for base Standard Skirt and Long Skirt",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "trouser_fastening" }).length,
    1,
    "Step 4 must keep trouser_fastening editable",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "standard_shorts_fastening" }).length,
    1,
    "Step 4 must keep standard_shorts_fastening editable",
  );
  assert.equal(
    renderer.root.findAllByProps({ "data-custom-detail-group": "bum_shorts_fastening" }).length,
    1,
    "Step 4 must keep bum_shorts_fastening editable",
  );
  assert.equal(/\bkaftan\b/i.test(textContent(renderer.root)), false, "Step 4 visible text must never say Kaftan");
  act(() => renderer.unmount());
}

// 4. Step 4 narrows base dress & full_length_gown dress_construction to strictly 2 same-price sleeves, and switching Step 1 tier reconciles out-of-tier sleeve cleanly.
{
  let dressSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["dress", "full_length_gown"],
    selectedDemographics: ["female"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  // Pick Short Sleeve on base Standard Dress in Step 4 (still within Sleeveless/Short tier)
  const pickedShort = selectGarmentConstructionOption({
    resolution: dressSelection.constructionByGarment.dress!,
    selectionGroup: "dress_construction",
    optionId: "dress_std_short",
    normalizedCustomDetailCatalog: catalog,
  });
  assert.equal(pickedShort.status, "selected");
  if (pickedShort.status === "selected") {
    dressSelection = {
      ...dressSelection,
      constructionByGarment: {
        ...dressSelection.constructionByGarment,
        dress: pickedShort.resolution,
      },
    };
  }
  assert.equal(
    findStep1CardPresetForResolution("dress", dressSelection.constructionByGarment.dress)?.id,
    "dress_sleeveless_or_short",
  );
  assert.deepEqual(
    getAllowedStep4ConstructionOptionIdsForBaseGarment("dress", dressSelection.constructionByGarment.dress),
    ["dress_std_sleeveless", "dress_std_short"],
  );

  // Switch Step 1 to Mid / Long Sleeve on both dresses -> out-of-tier dress_std_short cleanly replaced with dress_std_long
  dressSelection = selectStep1GarmentCardPreset({
    currentSelection: dressSelection,
    presetId: "dress_mid_or_long",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  dressSelection = selectStep1GarmentCardPreset({
    currentSelection: dressSelection,
    presetId: "full_length_gown_mid_or_long",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  assert.equal(
    dressSelection.constructionByGarment.dress?.status === "resolved"
      ? dressSelection.constructionByGarment.dress.components[0].optionId
      : null,
    "dress_std_long",
    "Switching Step 1 dress tier reconciles incompatible dress_std_short to dress_std_long",
  );
  assert.equal(
    dressSelection.constructionByGarment.full_length_gown?.status === "resolved"
      ? dressSelection.constructionByGarment.full_length_gown.components[0].optionId
      : null,
    "dress_long_long",
  );

  const { renderer } = renderCustomDetailsStage({ selection: dressSelection });
  const stdDressInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-base:dress-dress_construction-"),
  );
  assert.deepEqual(
    stdDressInputs.map((node) =>
      String(node.props.id).replace("future-custom-detail-base:dress-dress_construction-", ""),
    ),
    ["dress_std_mid", "dress_std_long"],
    "Mid/Long Standard Dress narrows Step 4 to strictly Mid Sleeve & Long Sleeve",
  );
  const longDressInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-base:full_length_gown-dress_construction-"),
  );
  assert.deepEqual(
    longDressInputs.map((node) =>
      String(node.props.id).replace("future-custom-detail-base:full_length_gown-dress_construction-", ""),
    ),
    ["dress_long_mid", "dress_long_long"],
    "Mid/Long Long Dress narrows Step 4 to strictly Mid Sleeve & Long Sleeve",
  );
  assert.match(textContent(renderer.root.findByProps({ "data-dress-garment-block": "base:dress" })), /Sleeve Style/);
  assert.equal(
    renderer.root.findAll((node) => typeof node.props["data-construction-length-group"] === "string").length,
    0,
    "No Standard/Long Dress length switcher inside Step 4",
  );
  act(() => renderer.unmount());
}

// 5. Step 5 Additional Garments STILL retain editable sleeve/construction choices.
{
  const selection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt"],
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const additionalGarments: FabricGarmentAssignment[] = [
    {
      garmentKey: "additional:shirt:1",
      code: "ADDITIONAL_SHIRT_1",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
    {
      garmentKey: "additional:dress:1",
      code: "ADDITIONAL_DRESS_1",
      garmentType: "dress",
      fabricUnits: 1,
      sourceRole: "additional",
    },
    {
      garmentKey: "additional:skirt:1",
      code: "ADDITIONAL_SKIRT_1",
      garmentType: "skirt",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ];
  const additionalConstructions: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": resolveGarmentConstructionPricing("shirt", catalog),
      "additional:dress:1": resolveGarmentConstructionPricing("dress", catalog),
      "additional:skirt:1": resolveGarmentConstructionPricing("skirt", catalog),
    },
  };
  const { renderer } = renderCustomDetailsStage({
    stage: "personalized_additions",
    selection,
    additionalGarments,
    additionalGarmentConstructions: additionalConstructions,
  });
  const additionalShirtInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:shirt:1-shirt_construction-"),
  );
  assert.equal(additionalShirtInputs.length, 4, "Step 5 additional:shirt:1 retains editable shirt_construction options");
  const additionalDressInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:dress:1-dress_construction-"),
  );
  assert.equal(additionalDressInputs.length, 4, "Step 5 additional:dress:1 retains all 4 Standard Dress sleeve options");
  const additionalSkirtInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:skirt:1-skirt_length-"),
  );
  assert.equal(additionalSkirtInputs.length, 2, "Step 5 additional:skirt:1 retains editable skirt_length options");
  act(() => renderer.unmount());
}

// 6. Old drafts without explicit Step 1 preset (and legacy dress_std_midlong / dress_long_midlong) hydrate cleanly.
{
  const oldDraftWithoutConstruction = {
    garmentTypes: ["shirt", "kaftan", "dress", "full_length_gown", "skirt"],
    demographic: "unisex",
  };
  const hydratedOld = reconcileGarmentTypeStepSelection({
    persistedSelection: oldDraftWithoutConstruction,
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  assert.equal(
    findStep1CardPresetForResolution("shirt", hydratedOld.constructionByGarment.shirt)?.id,
    "shirt_short_sleeve",
  );
  assert.equal(
    findStep1CardPresetForResolution("kaftan", hydratedOld.constructionByGarment.kaftan)?.id,
    "kaftan_short_sleeve",
  );
  assert.equal(
    findStep1CardPresetForResolution("dress", hydratedOld.constructionByGarment.dress)?.id,
    "dress_sleeveless_or_short",
  );
  assert.equal(
    findStep1CardPresetForResolution("full_length_gown", hydratedOld.constructionByGarment.full_length_gown)?.id,
    "full_length_gown_sleeveless_or_short",
  );

  // Legacy combined sleeve IDs hydrate cleanly to Mid / Long cards.
  assert.equal(
    findStep1CardPresetForResolution("dress", "dress_std_midlong")?.id,
    "dress_mid_or_long",
  );
  assert.equal(
    findStep1CardPresetForResolution("full_length_gown", "dress_long_midlong")?.id,
    "full_length_gown_mid_or_long",
  );
}

console.log("PASS: Step 1 13-card exact-price presets, sibling switching, Step 4 hiding/narrowing, Step 5 preservation, and downstream parity");
