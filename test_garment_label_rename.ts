/**
 * Xavier (2026-10-29): customer-facing garment NAMES read "Standard Shirt",
 * "Standard Dress", "Standard Skirt", "Long Shirt" (was Kaftan) and
 * "Long Dress" (was Gown) on every surface. Stable ids/keys stay unchanged
 * ("shirt", "dress", "skirt", "kaftan", "full_length_gown"), so old saved
 * drafts and orders keep loading.
 */
import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { getFabricGarmentLabel } from "./src/engine/FabricCapacityEngine";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  Fabric,
  FabricAllocationState,
  FabricGarmentType,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { getAllowedAdditionalGarmentLabels } from "./src/utils/additionalGarmentDomain";
import { reconcileAdditionalGarmentConstructionState } from "./src/utils/additionalGarmentConstructionState";
import {
  inspectCustomDetailCatalog,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import {
  getFutureDesignStyleCompositionLabel,
  reconcileFutureDesignStyleSelection,
} from "./src/utils/designStudioFutureDesignStyle";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { getFuturePaymentReviewGarments } from "./src/utils/designStudioFuturePaymentReview";
import { projectDesignStudioLiveOrderSummary } from "./src/utils/designStudioLiveOrderSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import { buildFutureOrderCandidate } from "./src/utils/futureOrderCandidate";
import { parseFutureOrderCandidateV2 } from "./src/utils/futureOrderV2Storage";
import {
  calculateGarmentScopedCustomDetailsPricing,
  projectAuthorizedAdditionalGarmentAssignments,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import { createEmptyGarmentScopedCustomDetailInputs } from "./src/utils/garmentScopedCustomDetailInputsState";
import { createEmptyGarmentScopedCustomDetailsState } from "./src/utils/garmentScopedCustomDetailsState";
import { getStep1GarmentDisplayLabel } from "./src/utils/garmentConstructionPricing";
import {
  normalizePersistedGarmentTypeStepSelection,
  reconcileGarmentTypeStepSelection,
} from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import { projectOccurrenceDisplayLabels } from "./src/utils/occurrenceDisplayLabel";
import {
  formatCustomDetailsGarmentLabel,
  getCustomDetailsGarmentLabel,
} from "./src/utils/optionalShortsPresentation";

const EXPECTED: Readonly<Record<string, string>> = {
  shirt: "Standard Shirt",
  dress: "Standard Dress",
  skirt: "Standard Skirt",
  kaftan: "Long Shirt",
  full_length_gown: "Long Dress",
};

/** Customer text must never carry the retired names or a doubled prefix. */
const assertCustomerSafe = (text: string, where: string) => {
  assert.doesNotMatch(text, /kaftan/i, `${where}: "Kaftan" must not reach customers`);
  assert.doesNotMatch(text, /\bgowns?\b/i, `${where}: "Gown" must not reach customers`);
  assert.doesNotMatch(text, /Standard Standard/, `${where}: no "Standard Standard"`);
  assert.doesNotMatch(text, /Long Long|Standard Long|Long Standard/, `${where}: no stacked prefixes`);
};

/** Visible strings only: skips ids, keys, tokens, urls and stored enum values. */
const customerText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(customerText).join(" | ");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !/(^id$|Id$|Key$|key$|Token$|Url$|^garmentType$|^code$|^status$|Stage$)/.test(key))
      .map(([, child]) => customerText(child))
      .join(" | ");
  }
  return "";
};

/** A garment NAME label (optionally numbered) for the five renamed types. */
const assertGarmentName = (label: string, garmentType: string, where: string) => {
  const expected = EXPECTED[garmentType];
  if (!expected) return;
  assert.match(
    label,
    new RegExp(`^${expected}( [2-9]| [1-9][0-9]+)?$`),
    `${where}: ${garmentType} must read "${expected}", got "${label}"`,
  );
};

// 1. Shared label sources agree for every renamed garment.
for (const [garmentType, expected] of Object.entries(EXPECTED)) {
  const type = garmentType as FabricGarmentType;
  assert.equal(getFabricGarmentLabel(type), expected, `Fabric-domain label for ${type}`);
  assert.equal(getStep1GarmentDisplayLabel(type), expected, `Step 1 label for ${type}`);
  assert.equal(getCustomDetailsGarmentLabel(type), expected, `Custom Details label for ${type}`);
  // Re-formatting an already prefixed label is a no-op (never "Standard Standard").
  assert.equal(formatCustomDetailsGarmentLabel(expected), expected);
  assert.equal(formatCustomDetailsGarmentLabel(`${expected} 2`), `${expected} 2`);
}
// Untouched garments keep their established names.
assert.equal(getFabricGarmentLabel("trouser"), "Trouser");
assert.equal(getFabricGarmentLabel("long_skirt"), "Long Skirt");
assert.equal(getFabricGarmentLabel("agbada"), "Agbada");
assert.equal(getCustomDetailsGarmentLabel("standard_shorts"), "Standard Nikka Shorts");
assert.equal(getCustomDetailsGarmentLabel("bum_shorts"), "Standard Bum Shorts");

// 2. Numbered duplicates keep their ordinal after the prefixed name.
const occurrenceLabels = projectOccurrenceDisplayLabels([
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  { garmentKey: "additional:shirt:2", garmentType: "shirt" },
  { garmentKey: "base:kaftan", garmentType: "kaftan" },
  { garmentKey: "additional:kaftan:1", garmentType: "kaftan" },
  { garmentKey: "base:full_length_gown", garmentType: "full_length_gown" },
  { garmentKey: "base:dress", garmentType: "dress" },
  { garmentKey: "base:skirt", garmentType: "skirt" },
]);
assert.deepEqual(
  [...occurrenceLabels.values()].map((labels) => labels.broadLabel),
  [
    "Standard Shirt",
    "Standard Shirt 2",
    "Standard Shirt 3",
    "Long Shirt",
    "Long Shirt 2",
    "Long Dress",
    "Standard Dress",
    "Standard Skirt",
  ],
  "Design Style popup / Your Garments broad labels",
);
occurrenceLabels.forEach((labels) => {
  assert.equal(labels.broadLabel, labels.conciseLabel, "broad and concise names agree");
  assertCustomerSafe(labels.broadLabel, "occurrence label");
});

// 3. Design Style popup composition copy ("Originally designed for ...").
const compositionStyle = (garmentTypes: FabricGarmentType[]) =>
  ({
    id: `composition-${garmentTypes.join("-")}`,
    name: "Composition Fixture",
    description: "",
    options: [],
    image: "",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits: garmentType === "full_length_gown" ? 2 : 1,
    })),
  }) as unknown as StyleCategory;
for (const garmentType of Object.keys(EXPECTED) as FabricGarmentType[]) {
  const label = getFutureDesignStyleCompositionLabel(compositionStyle([garmentType]));
  assert.equal(label, EXPECTED[garmentType], `Design Style composition for ${garmentType}`);
}

// 4. Personalized Additions "Add a garment" option titles.
const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const inspection = inspectCustomDetailCatalog(catalog);
const seedTitle = (id: string) =>
  SEED_CUSTOM_DETAIL_CATALOG.find((option) => option.id === id)?.label;
assert.equal(seedTitle("additional_garment_shirt"), "Standard Shirt");
assert.equal(seedTitle("additional_garment_dress"), "Standard Dress");
assert.equal(seedTitle("additional_garment_skirt"), "Standard Skirt");
assert.equal(seedTitle("additional_garment_kaftan"), "Long Shirt");
assert.equal(seedTitle("additional_garment_full_length_gown"), "Long Dress");
// Descriptions are sentences and stay as they were (Xavier: clear names only).
assert.equal(
  SEED_CUSTOM_DETAIL_CATALOG.find((option) => option.id === "additional_garment_shirt")?.description,
  "Add one separately tailored shirt to this design.",
);
// Construction option text is not a garment name and is unchanged.
assert.equal(
  SEED_CUSTOM_DETAIL_CATALOG.find((option) => option.id === "shirt_std_short")?.label,
  "Standard Length Shirt, Short Sleeve",
);
for (const garmentType of Object.keys(EXPECTED) as FabricGarmentType[]) {
  const labels = getAllowedAdditionalGarmentLabels([
    { key: `style:${garmentType}`, garmentType, fabricUnits: 1 },
  ] as never);
  labels.forEach((label) => assertCustomerSafe(label, "additional garment choice"));
}

// 5. Live Order Summary, Stage 8 Future Summary, Order Review (Payment Review).
const fabric: Fabric = {
  id: "fabric-a",
  code: "FAB-A",
  name: "Royal Forest Mosaic",
  description: "Fabric A",
  color: "Green",
  colorHex: "#0A4A33",
  price: 10,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "Ankara",
};
const businessSettings = {
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 7.5,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
  },
} as BusinessSettings;
const skipWorkflow: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};
const unitsFor = (garmentType: string): 1 | 2 =>
  garmentType === "full_length_gown" || garmentType === "agbada" ? 2 : 1;

const buildOrder = (
  garmentTypeSelection: GarmentTypeStepSelection,
) => {
  const garmentTypes = garmentTypeSelection.garmentTypes;
  const demographic = garmentTypeSelection.demographic || "unisex";
  const allocation: FabricAllocationState = {
    fabricAllocations: garmentTypes.map((garmentType, index) => ({
      allocationId: `allocation-${index + 1}`,
      fabricCode: fabric.code,
      garmentAssignments: [
        {
          garmentKey: `base:${garmentType}`,
          code: `BASE_${garmentType.toUpperCase()}`,
          garmentType,
          fabricUnits: unitsFor(garmentType),
          sourceRole: "main" as const,
        },
      ],
    })),
    activeAllocationId: "allocation-1",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: allocation,
    fabrics: [fabric],
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    allocation.fabricAllocations,
    [fabric],
  );
  const style = {
    id: `style-${garmentTypes.join("-")}`,
    name: "Royal Heritage Classic",
    description: "A compatible catalog style.",
    gender: demographic,
    targetDemographic: demographic,
    options: [],
    image: "https://example.invalid/catalog-style.jpg",
    fabricCapacityComposition: garmentTypes.map((garmentType) => ({
      key: `style:${garmentType}`,
      garmentType,
      fabricUnits: unitsFor(garmentType),
    })),
  } as StyleCategory;
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: style.id,
    styles: [style],
    garmentTypeSelection,
  });
  const additionalConstruction = reconcileAdditionalGarmentConstructionState({
    existingState: { schemaVersion: 1, byGarmentKey: {} },
    assignments: [],
    normalizedCustomDetailCatalog: catalog,
  });
  const additionalAssignments = projectAuthorizedAdditionalGarmentAssignments({
    additionalGarmentConstructions: additionalConstruction.state,
    fabricAllocationState: allocation,
  });
  const customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    additionalGarments: additionalAssignments,
    additionalGarmentConstructions: additionalConstruction.state,
    style,
    catalogInspection: inspection,
    existingState: createEmptyGarmentScopedCustomDetailsState(),
  });
  const personalizedReconciliation = customDetailsReconciliation
    ? reconcileGarmentScopedPersonalizedInputs({
        reconciliation: customDetailsReconciliation,
        catalogInspection: inspection,
        existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
      })
    : null;
  const customDetailsCompletion = customDetailsReconciliation
    ? validateGarmentScopedCustomDetailsCompletion({
        earlierStagesComplete: fabricCompletion.isComplete,
        reconciliation: customDetailsReconciliation,
        personalizedInputs: personalizedReconciliation || undefined,
        showAdditionalClothesCosts: false,
      })
    : null;
  const customDetailsPricing = customDetailsReconciliation
    ? calculateGarmentScopedCustomDetailsPricing({
        reconciliation: customDetailsReconciliation,
        catalogInspection: inspection,
        showAdditionalClothesCosts: false,
      })
    : null;
  const measurementPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({ garmentTypeSelection }),
    garmentScopedCustomDetails:
      customDetailsReconciliation?.state || createEmptyGarmentScopedCustomDetailsState(),
  });
  let measurementState = createEmptyFutureMeasurementState("low_risk", "inch");
  for (const requirement of measurementPlan.requirements.filter(
    (candidate) => candidate.directInput,
  )) {
    measurementState = setFutureMeasurementInput({
      state: measurementState,
      requirement,
      displayValue: 40,
    });
  }
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const basePricing =
    materialPricing.status === "resolved"
      ? calculateDesignPricing({
          route: "alone",
          design: { additionalGarmentConstructions: additionalConstruction.state },
          materialPricing,
          decorativeFeatureApplicabilityStyle: style,
          baseGarmentComposition: getFutureFabricCapacityComposition(garmentTypeSelection),
          additionalGarments: additionalAssignments,
          catalog,
          businessSettings,
          garmentConstructionSelectionMode: "garment_type_locked",
          garmentTypeSelection,
        })
      : null;
  const labelsByKey = projectOccurrenceDisplayLabels(
    garmentTypes.map((garmentType) => ({ garmentKey: `base:${garmentType}`, garmentType })),
  );
  const summaryInput = {
    step1GarmentTypeSelection: garmentTypeSelection,
    garmentTypeSelection,
    designSourceKind: "catalogue" as const,
    uploadedCompositionSpecs: null,
    additionalGarmentConstructionState: additionalConstruction.state,
    pendingAdditionalGarment: null,
    catalogInspection: inspection,
    fabricAllocationState: allocation,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    designStyleOccurrences: garmentTypes.map((garmentType) => ({
      target: { garmentKey: `base:${garmentType}`, occurrenceToken: `base:${garmentType}#1` },
      garmentType,
      label: labelsByKey.get(`base:${garmentType}`)!.broadLabel,
      status: "complete" as const,
      assignment: {
        garmentKey: `base:${garmentType}`,
        occurrenceToken: `base:${garmentType}#1`,
        assignmentRevision: 1,
        sourceKind: "catalog" as const,
        sourceKey: `catalog-style:${style.id}`,
        catalogStyleId: style.id,
        eligibilityFingerprint: "fixture-eligible",
      },
      assignmentLabel: style.name,
    })),
    styles: [style],
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation?.state || null,
    designSelections: {},
    aiTryOnWorkflow: skipWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
  };
  const summary = projectFutureDesignStudioSummary(summaryInput);
  const selectedDesignPrice =
    summary.pricingSummary.status === "exact"
      ? (summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice ?? null)
      : null;
  const shippingResolution = reconcileFutureShippingState({
    state: createEmptyFutureShippingState(),
    garmentCount: fabricCompletion.requiredGarmentCount,
    selectedDesignPrice,
  });
  const source = { kind: "catalog" as const, sourceKey: style.id, styleId: style.id };
  const candidateResult = buildFutureOrderCandidate({
    ...summaryInput,
    source,
    shippingResolution,
  });
  const view = projectDesignStudioLiveOrderSummary({
    summary,
    shippingResolution,
    candidatePricing: candidateResult.candidate?.pricing ?? null,
    fabricAllocationState: allocation,
    measurementState,
    measurementPlan,
    designSource: source,
    additionalConstructionState: additionalConstruction.state,
    catalogInspection: inspection,
    showAdditionalClothesCosts: false,
    orderType: null,
  });
  return { summary, view, candidateResult };
};

const selectionFor = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]>,
) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const checkOrder = (
  garmentTypeSelection: GarmentTypeStepSelection,
  scenario: string,
) => {
  const garmentTypes = garmentTypeSelection.garmentTypes;
  assert.ok(garmentTypes.length > 0, `${scenario}: fixture has garments`);
  const { summary, view, candidateResult } = buildOrder(garmentTypeSelection);

  // Live Order Summary: Garments Ordered rows lead with the garment name.
  const constructionSection = view.sections.find((section) => section.id === "construction");
  assert.ok(constructionSection, `${scenario}: live summary construction section`);
  const liveRows = constructionSection.lines.filter((line) =>
    line.id.startsWith("construction-base:"),
  );
  assert.equal(liveRows.length, garmentTypes.length, `${scenario}: one live row per garment`);
  liveRows.forEach((line) => {
    const garmentType = line.id.slice("construction-base:".length);
    assertGarmentName(line.label, garmentType, `${scenario} live Order Summary`);
  });
  const liveText = customerText(view.sections);
  assert.match(liveText, /Standard Length Shirt|Standard Length|Long Length|With Rope|Royal/, "fixture renders detail text");
  assertCustomerSafe(liveText, `${scenario} live Order Summary`);

  // Stage 8 Future Summary: garment cards, design style and custom detail rows.
  summary.garmentSummary.forEach((garment) =>
    assertGarmentName(garment.label, garment.garmentType, `${scenario} Stage 8 garment`),
  );
  summary.customDetailsSummary.forEach((group) => {
    const garmentType = group.garmentKey.replace(/^base:/, "");
    assertGarmentName(group.garmentLabel, garmentType, `${scenario} Stage 8 custom details`);
  });
  (summary.designStyleOccurrences || []).forEach((occurrence) => {
    const garmentType = occurrence.garmentKey.replace(/^base:/, "");
    assertGarmentName(occurrence.occurrenceLabel, garmentType, `${scenario} Stage 8 design style`);
  });
  assertCustomerSafe(
    JSON.stringify({
      garments: summary.garmentSummary.map((garment) => garment.label),
      custom: summary.customDetailsSummary.map((group) => group.garmentLabel),
      styles: summary.designStyleOccurrences?.map((occurrence) => occurrence.occurrenceLabel),
    }),
    `${scenario} Stage 8 summary`,
  );

  // Order Review / Payment Review garments come from the order candidate.
  const candidate = candidateResult.candidate;
  assert.ok(candidate, `${scenario}: order candidate builds`);
  const reviewGarments = getFuturePaymentReviewGarments(candidate);
  assert.equal(reviewGarments.length, garmentTypes.length);
  reviewGarments.forEach(({ garment }) =>
    assertGarmentName(garment.label, garment.garmentType, `${scenario} Order Review`),
  );
  assertCustomerSafe(
    JSON.stringify(reviewGarments.map(({ garment }) => garment.label)),
    `${scenario} Order Review`,
  );

  // A saved order with the stable ids round-trips and still reads the new names.
  const restored = parseFutureOrderCandidateV2(JSON.parse(JSON.stringify(candidate)));
  assert.ok(restored, `${scenario}: saved order candidate still parses`);
  return { summary, view, candidate };
};

const female = checkOrder(
  selectionFor(["dress", "skirt", "full_length_gown"], "female"),
  "female dress/skirt/long dress",
);
assert.deepEqual(
  female.summary.garmentSummary.map((garment) => garment.label).sort(),
  ["Long Dress", "Standard Dress", "Standard Skirt"],
);
const male = checkOrder(
  selectionFor(["shirt", "kaftan", "trouser"], "male"),
  "male shirt/long shirt/trouser",
);
assert.deepEqual(
  male.summary.garmentSummary.map((garment) => garment.label).sort(),
  ["Long Shirt", "Standard Shirt", "Trouser"],
);
assert.ok(
  male.candidate.garments.some((garment) => garment.garmentType === "kaftan"),
  "stable kaftan id is still stored on the order",
);
assert.ok(
  female.candidate.garments.some((garment) => garment.garmentType === "full_length_gown"),
  "stable full_length_gown id is still stored on the order",
);

// 6. An old saved draft with kaftan / full_length_gown keys still loads.
const oldDraftJson = JSON.stringify({
  garmentTypes: ["kaftan", "full_length_gown", "shirt"],
  demographic: "unisex",
  constructionByGarment: {},
});
const restoredSelection = normalizePersistedGarmentTypeStepSelection(JSON.parse(oldDraftJson));
assert.deepEqual(restoredSelection.garmentTypes, ["shirt", "kaftan", "full_length_gown"]);
const reconciledOldDraft = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: restoredSelection.garmentTypes,
  selectedDemographic: restoredSelection.demographic || "unisex",
  normalizedCustomDetailCatalog: catalog,
}).selection;
assert.deepEqual(reconciledOldDraft.garmentTypes, ["shirt", "kaftan", "full_length_gown"]);
assert.deepEqual(
  reconciledOldDraft.garmentTypes.map(getStep1GarmentDisplayLabel),
  ["Standard Shirt", "Long Shirt", "Long Dress"],
);
checkOrder(reconciledOldDraft, "restored old draft");

console.log("Garment label rename checks passed.");
