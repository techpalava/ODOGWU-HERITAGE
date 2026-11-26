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

// 1. All 17 Step 1 cards render with exact dynamically resolved catalogue prices & zero "Kaftan".
{
  const expectedCards: ReadonlyArray<[string, string, number]> = [
    ["shirt_short_sleeve", "Standard Shirt — Short Sleeve", 65],
    ["shirt_long_sleeve", "Standard Shirt — Long Sleeve", 70],
    ["kaftan_short_sleeve", "Long Shirt — Short Sleeve", 70],
    ["kaftan_long_sleeve", "Long Shirt — Long Sleeve", 75],
    ["dress_sleeveless", "Standard Dress — Sleeveless", 70],
    ["dress_short_sleeve", "Standard Dress — Short Sleeve", 70],
    ["dress_mid_sleeve", "Standard Dress — Mid Sleeve", 75],
    ["dress_long_sleeve", "Standard Dress — Long Sleeve", 75],
    ["full_length_gown_sleeveless", "Long Dress — Sleeveless", 75],
    ["full_length_gown_short_sleeve", "Long Dress — Short Sleeve", 75],
    ["full_length_gown_mid_sleeve", "Long Dress — Mid Sleeve", 80],
    ["full_length_gown_long_sleeve", "Long Dress — Long Sleeve", 80],
    ["skirt", "Standard Skirt", 75],
    ["long_skirt", "Long Skirt", 80],
    ["trouser", "Trouser", 75],
    ["standard_shorts", "Standard Nikka Shorts", 70],
    ["bum_shorts", "Standard Bum Shorts", 70],
  ];
  assert.equal(STEP_1_GARMENT_CARD_PRESETS.length, 17);

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
  const longDressCard = repricedMarkup.match(/data-testid="step1-garment-card-full_length_gown_long_sleeve"[\s\S]*?<\/article>/);
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
  const trouserGroup = renderer.root.findByProps({ "data-custom-detail-group": "trouser_fastening" });
  const nikkaGroup = renderer.root.findByProps({ "data-custom-detail-group": "standard_shorts_fastening" });
  const bumGroup = renderer.root.findByProps({ "data-custom-detail-group": "bum_shorts_fastening" });
  for (const [label, groupNode] of [
    ["Trouser", trouserGroup],
    ["Standard Nikka Shorts", nikkaGroup],
    ["Standard Bum Shorts", bumGroup],
  ] as const) {
    const groupText = textContent(groupNode);
    assert.match(groupText, /Waistband Fastening/, `${label} must render under Waistband Fastening`);
    assert.match(
      groupText,
      /Choose your preferred waistband fastening for this garment\./,
      `${label} must show waistband fastening helper copy`,
    );
    assert.doesNotMatch(groupText, /Main Garment/, `${label} must not say Main Garment`);
    assert.match(groupText, /€\d+\.\d{2}/, `${label} must keep price labels on unselected fastening options`);
  }

  // Step 4 intro subtitle reflects Garment Type choices without stale "Review the construction..." copy.
  const step4Text = textContent(renderer.root);
  assert.ok(
    step4Text.includes(
      "Customize the details for your selected garments. Garment length and base sleeve tier were chosen in Garment Type and are already included in your price.",
    ),
    "Step 4 must show updated intro subtitle",
  );
  assert.equal(step4Text.includes("Review the construction"), false, "Step 4 must remove stale intro copy");

  // Step 4 Garment Context bar reflects active Step 1 sleeve preset label & secondary photo.
  const longShirtContext = renderer.root.findByProps({ "data-step4-garment-context": "base:kaftan" });
  assert.match(textContent(longShirtContext), /Long Shirt — Long Sleeve/);
  const longShirtRefImg = longShirtContext.findByProps({ "data-step4-garment-reference": "base:kaftan" });
  assert.equal(longShirtRefImg.props.src, "/images/garments/ankara-kaftan.webp");
  assert.equal(longShirtRefImg.props.alt, "Ankara Long Shirt — Long Sleeve reference");

  const stdShirtContext = renderer.root.findByProps({ "data-step4-garment-context": "base:shirt" });
  assert.match(textContent(stdShirtContext), /Standard Shirt — Short Sleeve/);
  const stdShirtRefImg = stdShirtContext.findByProps({ "data-step4-garment-reference": "base:shirt" });
  assert.equal(stdShirtRefImg.props.src, "/images/garments/ankara-standard-shirt.webp");
  assert.equal(stdShirtRefImg.props.alt, "Ankara Standard Shirt — Short Sleeve reference");

  assert.equal(/\bkaftan\b/i.test(step4Text), false, "Step 4 visible text must never say Kaftan");
  act(() => renderer.unmount());

  // Verify Standard Shirt — Long Sleeve also uses its preset label & secondary photo in Step 4 Garment Context.
  const longSleeveShirtSelection = selectStep1GarmentCardPreset({
    currentSelection: reconcileGarmentTypeStepSelection({
      selectedGarmentTypes: ["shirt"],
      selectedDemographics: ["male"],
      normalizedCustomDetailCatalog: catalog,
    }).selection,
    presetId: "shirt_long_sleeve",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const { renderer: longSleeveShirtRenderer } = renderCustomDetailsStage({
    selection: longSleeveShirtSelection,
  });
  const shirtLongContext = longSleeveShirtRenderer.root.findByProps({
    "data-step4-garment-context": "base:shirt",
  });
  assert.match(textContent(shirtLongContext), /Standard Shirt — Long Sleeve/);
  const shirtLongRefImg = shirtLongContext.findByProps({
    "data-step4-garment-reference": "base:shirt",
  });
  assert.equal(shirtLongRefImg.props.src, "/images/garments/ankara-standard-shirt-long-sleeve.webp");
  assert.equal(shirtLongRefImg.props.alt, "Ankara Standard Shirt — Long Sleeve reference");
  act(() => longSleeveShirtRenderer.unmount());
}

// 4. Step 4 locks base dress & full_length_gown dress_construction to single Step 1 sleeve choice, hides dress_construction, and sibling switching replaces price cleanly.
{
  let dressSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["dress", "full_length_gown"],
    selectedDemographics: ["female"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  dressSelection = selectStep1GarmentCardPreset({
    currentSelection: dressSelection,
    presetId: "dress_short_sleeve",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  assert.equal(
    findStep1CardPresetForResolution("dress", dressSelection.constructionByGarment.dress)?.id,
    "dress_short_sleeve",
  );
  assert.deepEqual(
    getAllowedStep4ConstructionOptionIdsForBaseGarment("dress", dressSelection.constructionByGarment.dress),
    ["dress_std_short"],
  );

  // Switch Step 1 to Mid Sleeve and Long Sleeve -> exact single option replaced cleanly
  dressSelection = selectStep1GarmentCardPreset({
    currentSelection: dressSelection,
    presetId: "dress_mid_sleeve",
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  dressSelection = selectStep1GarmentCardPreset({
    currentSelection: dressSelection,
    presetId: "full_length_gown_long_sleeve",
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  assert.equal(
    dressSelection.constructionByGarment.dress?.status === "resolved"
      ? dressSelection.constructionByGarment.dress.components[0].optionId
      : null,
    "dress_std_mid",
    "Switching Step 1 dress card updates exact optionId to dress_std_mid",
  );
  assert.equal(
    dressSelection.constructionByGarment.dress?.status === "resolved"
      ? dressSelection.constructionByGarment.dress.totalPriceCents
      : null,
    7500,
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
  assert.equal(
    stdDressInputs.length,
    0,
    "Step 4 hides dress_construction for base Standard Dress once sleeve is chosen in Step 1",
  );
  const longDressInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-base:full_length_gown-dress_construction-"),
  );
  assert.equal(
    longDressInputs.length,
    0,
    "Step 4 hides dress_construction for base Long Dress once sleeve is chosen in Step 1",
  );
  // Garment Context bar for Mid Sleeve / Long Sleeve dresses shows matching preset label & image.
  const stdDressContext = renderer.root.findByProps({ "data-step4-garment-context": "base:dress" });
  assert.match(textContent(stdDressContext), /Standard Dress — Mid Sleeve/);
  const stdDressRefImg = stdDressContext.findByProps({ "data-step4-garment-reference": "base:dress" });
  assert.equal(stdDressRefImg.props.src, "/images/garments/ankara-standard-dress-mid-sleeve.webp");
  assert.equal(stdDressRefImg.props.alt, "Ankara Standard Dress — Mid Sleeve reference");
  const longDressContext = renderer.root.findByProps({ "data-step4-garment-context": "base:full_length_gown" });
  assert.match(textContent(longDressContext), /Long Dress — Long Sleeve/);
  const longDressRefImg = longDressContext.findByProps({ "data-step4-garment-reference": "base:full_length_gown" });
  assert.equal(longDressRefImg.props.src, "/images/garments/ankara-long-dress-gown.webp");
  assert.equal(longDressRefImg.props.alt, "Ankara Long Dress — Long Sleeve reference");
  assert.equal(
    renderer.root.findAll((node) => typeof node.props["data-construction-length-group"] === "string").length,
    0,
    "No Standard/Long Dress length switcher inside Step 4",
  );
  act(() => renderer.unmount());
}

// 5. Step 5 Additional Garments lock added Shirt/Dress sleeves & Skirt length (hidden in Step 4/5) while keeping Trousers/Shorts Waistband Fastening editable.
{
  const selection = selectStep1GarmentCardPreset({
    currentSelection: reconcileGarmentTypeStepSelection({
      selectedGarmentTypes: ["shirt"],
      selectedDemographics: ["unisex"],
      normalizedCustomDetailCatalog: catalog,
    }).selection,
    presetId: "shirt_long_sleeve",
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
      garmentKey: "additional:kaftan:1",
      code: "ADDITIONAL_KAFTAN_1",
      garmentType: "kaftan",
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
    {
      garmentKey: "additional:trouser:1",
      code: "ADDITIONAL_TROUSER_1",
      garmentType: "trouser",
      fabricUnits: 1,
      sourceRole: "additional",
    },
  ];
  const additionalConstructions: AdditionalGarmentConstructionStateV1 = {
    schemaVersion: 1,
    byGarmentKey: {
      "additional:shirt:1": resolveGarmentConstructionPricing("shirt", catalog),
      "additional:kaftan:1": resolveGarmentConstructionPricing("kaftan", catalog),
      "additional:dress:1": resolveGarmentConstructionPricingForOptionId("dress", "dress_std_mid", catalog),
      "additional:skirt:1": resolveGarmentConstructionPricing("skirt", catalog),
      "additional:trouser:1": resolveGarmentConstructionPricing("trouser", catalog),
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
  assert.equal(additionalShirtInputs.length, 0, "Step 5 additional:shirt:1 hides shirt_construction once sleeve is picked");
  const additionalLongShirtInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:kaftan:1-shirt_construction-"),
  );
  assert.equal(additionalLongShirtInputs.length, 0, "Step 5 additional:kaftan:1 hides shirt_construction once sleeve is picked");
  const additionalDressInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:dress:1-dress_construction-"),
  );
  assert.equal(additionalDressInputs.length, 0, "Step 5 additional:dress:1 hides dress_construction once sleeve is picked");
  const additionalSkirtInputs = renderer.root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props.id === "string" &&
      node.props.id.startsWith("future-custom-detail-additional:skirt:1-skirt_length-"),
  );
  assert.equal(additionalSkirtInputs.length, 0, "Step 5 additional:skirt:1 hides skirt_length switch");
  const addedTrouserGroup = renderer.root
    .findByProps({ "data-trouser-garment-block": "additional:trouser:1" })
    .findByProps({ "data-custom-detail-group": "trouser_fastening" });
  assert.match(textContent(addedTrouserGroup), /Waistband Fastening/);
  assert.match(
    textContent(addedTrouserGroup),
    /Choose your preferred waistband fastening for this garment\./,
  );
  // Step 5 Garment Context bar reflects active Step 1 / Add-garment preset labels & photos.
  const step5BaseContext = renderer.root.findByProps({ "data-step5-garment-context": "base:shirt" });
  assert.match(textContent(step5BaseContext), /Standard Shirt — Long Sleeve/);
  assert.equal(
    step5BaseContext.findByProps({ "data-step4-garment-reference": "base:shirt" }).props.src,
    "/images/garments/ankara-standard-shirt-long-sleeve.webp",
  );
  const step5AddedContext = renderer.root.findByProps({ "data-step5-garment-context": "additional:shirt:1" });
  assert.match(textContent(step5AddedContext), /Standard Shirt — Short Sleeve/);
  assert.doesNotMatch(textContent(step5AddedContext), /Long Sleeve/);
  assert.equal(
    step5AddedContext.findByProps({ "data-step4-garment-reference": "additional:shirt:1" }).props.src,
    "/images/garments/ankara-standard-shirt.webp",
  );
  const step5AddedDressContext = renderer.root.findByProps({ "data-step5-garment-context": "additional:dress:1" });
  assert.match(textContent(step5AddedDressContext), /Standard Dress — Mid Sleeve/);
  assert.equal(
    step5AddedDressContext.findByProps({ "data-step4-garment-reference": "additional:dress:1" }).props.src,
    "/images/garments/ankara-standard-dress-mid-sleeve.webp",
  );
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
    "dress_sleeveless",
  );
  assert.equal(
    findStep1CardPresetForResolution("full_length_gown", hydratedOld.constructionByGarment.full_length_gown)?.id,
    "full_length_gown_sleeveless",
  );

  // Legacy combined sleeve IDs hydrate cleanly to Long Sleeve cards.
  assert.equal(
    findStep1CardPresetForResolution("dress", "dress_std_midlong")?.id,
    "dress_long_sleeve",
  );
  assert.equal(
    findStep1CardPresetForResolution("full_length_gown", "dress_long_midlong")?.id,
    "full_length_gown_long_sleeve",
  );
}

console.log("PASS: Step 1 17-card exact-price presets, sibling switching, Step 4 hiding, Step 5 preservation, and downstream parity");
