import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  AiTryOnWorkflowStateV1,
  BusinessSettings,
  DesignSource,
  Fabric,
  FabricAllocationState,
  FutureShippingStateV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { calculateDesignPricing } from "./src/utils/designPricing";
import {
  getFutureFabricCapacityComposition,
  getFutureFabricStageCompletion,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileFutureDesignStyleSelection } from "./src/utils/designStudioFutureDesignStyle";
import {
  createEmptyFutureShippingState,
  reconcileFutureShippingState,
} from "./src/utils/designStudioFutureShipping";
import { projectFutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";
import {
  FUTURE_ORDER_CANDIDATE_PRODUCTION_CONVERSION,
  buildFutureOrderCandidate,
  cloneFutureOrderCandidate,
  enumerateFutureOrderCandidateBlockers,
  enumerateFutureOrderCandidateCustomDetails,
  enumerateFutureOrderCandidateFabricAllocations,
  enumerateFutureOrderCandidateGarments,
  inspectFutureOrderCandidateSecurity,
  normalizeFutureOrderCandidate,
  serializeFutureOrderCandidate,
  type FutureOrderCandidateBuildInput,
} from "./src/utils/futureOrderCandidate";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailInputs,
  setGarmentScopedCustomDetailText,
} from "./src/utils/garmentScopedCustomDetailInputsState";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
} from "./src/utils/measurementBlueprint";
import {
  calculateIndividualShipping,
  resolveShippingGarmentPieceCount,
} from "./src/utils/shippingPricing";

const inspection = inspectCustomDetailCatalog([]);
const fabric: Fabric = {
  id: "fabric-hi-target-royal",
  code: "FAB-HI",
  name: "HiTarget Royal",
  description: "Royal patterned fabric",
  color: "Royal Blue",
  colorHex: "#002397",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
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

const buildSelection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]> = "male",
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: inspection.activeOptions,
  }).selection;

const makeAllocationState = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): FabricAllocationState => ({
  fabricAllocations: garmentTypes.map((garmentType, index) => ({
    allocationId: `allocation-${index + 1}`,
    fabricCode: fabric.code,
    garmentAssignments: [{
      garmentKey: `base:${garmentType}`,
      code: `BASE_${garmentType.toUpperCase()}`,
      garmentType,
      fabricUnits:
        garmentType === "kaftan" ||
        garmentType === "full_length_gown" ||
        garmentType === "agbada"
          ? 2
          : 1,
      sourceRole: "main",
    }],
  })),
  activeAllocationId: "allocation-1",
  pendingFabricGarment: null,
  awaitingFabricForPendingGarment: false,
});

const makeStyle = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: NonNullable<GarmentTypeStepSelection["demographic"]> = "male",
): StyleCategory => ({
  id: `style-${garmentTypes.join("-")}`,
  name: "Heritage Complete Look",
  description: "A compatible catalog style.",
  gender: demographic,
  targetDemographic: demographic,
  options: [],
  image: "https://example.invalid/catalog-style.jpg",
  fabricCapacityComposition: garmentTypes.map((garmentType) => ({
    key: `style:${garmentType}`,
    garmentType,
    fabricUnits:
      garmentType === "kaftan" ||
      garmentType === "full_length_gown" ||
      garmentType === "agbada"
        ? 2
        : 1,
  })),
} as StyleCategory);

const completeShirtDetails = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
): GarmentScopedCustomDetailsStateV1 =>
  setGarmentScopedCustomDetailSelection(
    setGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      "shirt_pockets",
      "shirt_pocket_0",
    ),
    garmentKey,
    "neck_design",
    "neck_no_round",
  );

const buildSummaryAuthority = ({
  garmentTypes = ["shirt"],
  customState,
  personalizedText,
  demographic = "male",
  aiTryOnWorkflow = {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  },
}: {
  garmentTypes?: GarmentTypeStepSelection["garmentTypes"];
  customState?: GarmentScopedCustomDetailsStateV1;
  personalizedText?: string;
  demographic?: NonNullable<GarmentTypeStepSelection["demographic"]>;
  aiTryOnWorkflow?: AiTryOnWorkflowStateV1;
} = {}) => {
  const garmentTypeSelection = buildSelection(garmentTypes, demographic);
  const fabricAllocationState = makeAllocationState(garmentTypes);
  const fabricCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics: [fabric],
  });
  const materialPricing = resolveFabricAllocationMaterialPricing(
    fabricAllocationState.fabricAllocations,
    [fabric],
  );
  assert.equal(materialPricing.status, "resolved");
  const style = makeStyle(garmentTypes, demographic);
  const designStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: style.id,
    styles: [style],
    garmentTypeSelection,
  });
  let resolvedCustomState =
    customState || createEmptyGarmentScopedCustomDetailsState();
  let customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style,
    catalogInspection: inspection,
    existingState: resolvedCustomState,
  });
  if (!customState) {
    customDetailsReconciliation.subjects.forEach((subject) => {
      customDetailsReconciliation.applicabilityByGarmentKey
        .get(subject.garmentKey)
        ?.groups.filter((group) => group.required)
        .forEach((group) => {
          const option = group.options[0];
          if (option) {
            resolvedCustomState = setGarmentScopedCustomDetailSelection(
              resolvedCustomState,
              subject.garmentKey,
              group.selectionGroup,
              group.allowMultiple ? [option.id] : option.id,
            );
          }
        });
    });
    customDetailsReconciliation = reconcileGarmentScopedCustomDetails({
      garmentTypeSelection,
      style,
      catalogInspection: inspection,
      existingState: resolvedCustomState,
    });
  }
  let personalizedInputs = createEmptyGarmentScopedCustomDetailInputs();
  if (personalizedText) {
    personalizedInputs = setGarmentScopedCustomDetailText({
      state: personalizedInputs,
      garmentKey: "base:shirt",
      selectionGroup: "personalized_additional",
      optionId: "personalized_additional_evaluation",
      text: personalizedText,
    }).state;
  }
  const personalizedReconciliation = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
    existingInputs: personalizedInputs,
  });
  const customDetailsCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: customDetailsReconciliation,
    personalizedInputs: personalizedReconciliation,
  });
  const customDetailsPricing = calculateGarmentScopedCustomDetailsPricing({
    reconciliation: customDetailsReconciliation,
    catalogInspection: inspection,
  });
  const measurementPlan = planMeasurementRequirements({
    route: "low_risk",
    garmentTypeSelection,
    physicalGarments: getMeasurementPhysicalGarments({
      garmentTypeSelection,
      fabricGarments: fabricAllocationState.fabricAllocations.flatMap(
        (allocation) => allocation.garmentAssignments,
      ),
    }),
    garmentScopedCustomDetails: customDetailsReconciliation.state,
  });
  let measurementState = createEmptyFutureMeasurementState("low_risk", "inch");
  for (const requirement of measurementPlan.requirements.filter(
    (candidate) => candidate.directInput,
  )) {
    measurementState = setFutureMeasurementInput({
      state: measurementState,
      requirement,
      displayValue: 10,
    });
  }
  measurementState = reconcileFutureMeasurementState({
    state: measurementState,
    plan: measurementPlan,
  });
  const basePricing = calculateDesignPricing({
    route: "alone",
    design: {},
    materialPricing,
    baseGarmentComposition: getFutureFabricCapacityComposition(
      garmentTypeSelection,
    ),
    catalog: inspection.activeOptions,
    businessSettings,
    garmentConstructionSelectionMode: "garment_type_locked",
    garmentTypeSelection,
  });
  const garmentPieceCount = resolveShippingGarmentPieceCount({
    fabricAllocations: fabricAllocationState.fabricAllocations,
  });
  return {
    garmentTypeSelection,
    catalogInspection: inspection,
    fabricAllocationState,
    fabricCompletion,
    materialPricing,
    designStyleSelection,
    customDetailsReconciliation,
    customDetailsCompletion,
    customDetailsPricing,
    personalizedInputs: personalizedReconciliation.state,
    aiTryOnWorkflow,
    measurementPlan,
    measurementState,
    basePricing,
    taxPercentage: businessSettings.pricingSettings.vatTaxPercentage,
    lagosToEindhovenShipping:
      calculateIndividualShipping(garmentPieceCount).priceEur,
  };
};

const deliveryState = (): FutureShippingStateV1 => ({
  ...createEmptyFutureShippingState(),
  fulfilmentMethod: "destination_delivery",
  customerInformation: {
    fullName: "Ada Lovelace",
    phone: "+31 6 1234 5678",
    email: "ada@example.com",
    deliveryAddress: {
      addressLine1: "1 Heritage Way",
      addressLine2: "Suite 4",
      city: "Eindhoven",
      postalCode: "5611 AA",
      countryCode: "NL",
    },
    comment: "Call before delivery.",
  },
  destinationZoneId: "EUROPE",
  destinationZoneSource: "customer_provisional",
});

const buildInput = (
  options: Parameters<typeof buildSummaryAuthority>[0] = {},
): FutureOrderCandidateBuildInput => {
  const authority = buildSummaryAuthority(options);
  const summary = projectFutureDesignStudioSummary(authority);
  const garmentCount = resolveShippingGarmentPieceCount({
    fabricAllocations: authority.fabricAllocationState.fabricAllocations,
  });
  const shippingResolution = reconcileFutureShippingState({
    state: deliveryState(),
    garmentCount,
    selectedDesignPrice:
      summary.pricingSummary.selectedDesignPrice?.selectedDesignPrice || null,
  });
  return {
    ...authority,
    source: {
      kind: "catalog",
      sourceKey: authority.designStyleSelection.selectedStyleId!,
      styleId: authority.designStyleSelection.selectedStyleId!,
    },
    shippingResolution,
  };
};

const exactBaseInput = buildInput({
  garmentTypes: ["shirt", "trouser", "standard_shorts", "bum_shorts"],
  demographic: "female",
});
const exactSelectedDesignCents = Math.round(
  projectFutureDesignStudioSummary(exactBaseInput).pricingSummary
    .selectedDesignPrice!.selectedDesignPrice! * 100,
);
const authoritativeFinalMileCents = 1900;
const exactInput: FutureOrderCandidateBuildInput = {
  ...exactBaseInput,
  shippingResolution: {
  ...exactBaseInput.shippingResolution,
  state: {
    ...exactBaseInput.shippingResolution.state,
    quoteReference: {
      tariffVersion: "test-current-tariff-v1",
      ruleId: "test-current-europe-rule",
      ruleFingerprint: "test-current-rule-fingerprint",
      inputFingerprint: "test-current-input-fingerprint",
      garmentCount: 4,
      weightKg: 2,
      destinationZoneId: "EUROPE",
    },
  },
  status: "quote_ready",
  quoteReady: true,
  postEindhovenAdjustmentCents: authoritativeFinalMileCents,
  projectedTotalCents:
    exactSelectedDesignCents + authoritativeFinalMileCents,
  parcelWeightKg: 2,
  },
};
const inputBefore = JSON.stringify(exactInput, (_key, value) =>
  value instanceof Map ? [...value.entries()] : value,
);
const exactResult = buildFutureOrderCandidate(exactInput);
assert.equal(exactResult.status, "reviewable");
assert.ok(exactResult.candidate);
const candidate = exactResult.candidate;
assert.equal(candidate.schemaVersion, 1);
assert.equal(candidate.journey.mode, "future_nine_stage");
assert.equal(
  candidate.source.styleId,
  "style-shirt-trouser-standard_shorts-bum_shorts",
);
assert.equal(candidate.paymentStatus, "payment_provider_unavailable");
assert.ok(
  candidate.blockers.some(
    (blocker) => blocker.code === "PAYMENT_PROVIDER_UNAVAILABLE",
  ),
);
assert.equal(candidate.pricing.status, "exact");
assert.equal(
  candidate.pricing.constructionAndSewingCents! +
    candidate.pricing.fabricMaterialCents! +
    candidate.pricing.customDetailsCents!,
  candidate.pricing.preTaxDesignSubtotalCents,
  "construction, fabric, and occurrence pricing reconcile once",
);
assert.equal(
  candidate.pricing.preTaxDesignSubtotalCents! +
    candidate.pricing.taxCents! +
    candidate.pricing.lagosToEindhovenShippingCents!,
  candidate.pricing.selectedDesignTotalCents,
  "tax and Lagos-to-Eindhoven shipping occur exactly once",
);
assert.equal(
  candidate.pricing.selectedDesignTotalCents! +
    candidate.pricing.postEindhovenAdjustmentCents!,
  candidate.pricing.exactTotalCents,
  "authoritative post-Eindhoven delivery occurs exactly once",
);
assert.equal(
  JSON.stringify(exactInput, (_key, value) =>
    value instanceof Map ? [...value.entries()] : value,
  ),
  inputBefore,
  "the pure builder must not mutate any authority input",
);
assert.equal(Object.isFrozen(candidate), true);
assert.equal(Object.isFrozen(candidate.shipping.state), true);

const serialized = serializeFutureOrderCandidate(candidate);
assert.equal(serialized.status, "serialized");
assert.ok(serialized.status === "serialized");
const roundTrip = normalizeFutureOrderCandidate(serialized.json);
assert.equal(roundTrip.status, "valid");
assert.ok(roundTrip.status === "valid");
assert.deepEqual(roundTrip.candidate, candidate);
const cloned = cloneFutureOrderCandidate(candidate);
assert.equal(cloned.status, "valid");
assert.ok(cloned.status === "valid");
assert.deepEqual(cloned.candidate, candidate);
assert.notEqual(cloned.candidate, candidate);
assert.deepEqual(enumerateFutureOrderCandidateGarments(candidate), candidate.garments);
assert.deepEqual(
  enumerateFutureOrderCandidateFabricAllocations(candidate),
  candidate.fabricAllocations,
);
assert.deepEqual(
  enumerateFutureOrderCandidateCustomDetails(candidate),
  candidate.customDetails,
);
assert.deepEqual(
  enumerateFutureOrderCandidateBlockers(candidate),
  candidate.blockers,
);

const shirtKaftanState = setGarmentScopedCustomDetailSelection(
  setGarmentScopedCustomDetailSelection(
    completeShirtDetails(
      completeShirtDetails(
        createEmptyGarmentScopedCustomDetailsState(),
        "base:shirt",
      ),
      "base:kaftan",
    ),
    "base:shirt",
    "neck_additional",
    "neck_additional_no_cost",
  ),
  "base:kaftan",
  "neck_additional",
  "neck_additional_no_cost",
);
const shirtKaftan = buildFutureOrderCandidate(
  buildInput({
    garmentTypes: ["kaftan", "shirt"],
    customState: shirtKaftanState,
  }),
);
assert.ok(shirtKaftan.candidate);
assert.deepEqual(
  shirtKaftan.candidate.garments.map((garment) => [
    garment.garmentKey,
    garment.garmentType,
  ]),
  [["base:shirt", "shirt"], ["base:kaftan", "kaftan"]],
);
assert.equal(shirtKaftan.candidate.fabricAllocations.length, 2);
assert.equal(
  shirtKaftan.candidate.fabricAllocations.reduce(
    (total, allocation) => total + (allocation.materialPriceCents || 0),
    0,
  ),
  shirtKaftan.candidate.pricing.fabricMaterialCents,
);
assert.equal(
  shirtKaftan.candidate.customDetails.filter(
    (detail) => detail.optionId === "neck_additional_no_cost",
  ).length,
  2,
  "repeated option IDs remain occurrence-safe by garment",
);

const agbada = buildFutureOrderCandidate(
  buildInput({
    garmentTypes: ["agbada"],
    customState: createEmptyGarmentScopedCustomDetailsState(),
  }),
);
assert.ok(agbada.candidate);
assert.deepEqual(
  agbada.candidate.garments[0].physicalComponents.map(
    (component) => component.garmentType,
  ),
  ["shirt", "trouser"],
);
assert.ok(agbada.candidate.garments[0].construction.length > 1);

const pendingState = setGarmentScopedCustomDetailSelection(
  completeShirtDetails(
    createEmptyGarmentScopedCustomDetailsState(),
    "base:shirt",
  ),
  "base:shirt",
  "personalized_additional",
  ["personalized_additional_evaluation"],
);
const pending = buildFutureOrderCandidate(
  buildInput({
    customState: pendingState,
    personalizedText: "Add a hand-finished family crest.",
  }),
);
assert.equal(pending.status, "blocked");
assert.ok(pending.candidate);
const personalized = pending.candidate.customDetails.find(
  (detail) => detail.optionId === "personalized_additional_evaluation",
);
assert.equal(personalized?.garmentKey, "base:shirt");
assert.equal(personalized?.personalizedText, "Add a hand-finished family crest.");
assert.equal(personalized?.priceStatus, "evaluation_required");
assert.equal(personalized?.priceCents, null);
assert.equal(pending.candidate.pricing.exactTotalCents, null);

const completedAi: AiTryOnWorkflowStateV1 = {
  schemaVersion: 1,
  status: "completed",
  inputFingerprint: "safe-input-fingerprint",
  jobReference: { kind: "resumable_job", jobId: "private-job" },
  resultReference: {
    kind: "verified_private_try_on_result",
    assetId: "verified-asset",
    ownerBindingId: "verified-owner-binding",
  },
  failure: { code: "interrupted", retryable: true },
};
const completed = buildFutureOrderCandidate(
  buildInput({ aiTryOnWorkflow: completedAi }),
);
assert.ok(completed.candidate);
const aiJson = JSON.stringify(completed.candidate.aiTryOn);
assert.equal(aiJson.includes("private-job"), false);
assert.equal(aiJson.includes("interrupted"), false);
assert.equal(
  completed.candidate.aiTryOn.verifiedPrivateResultReference?.assetId,
  "verified-asset",
);

assert.ok(candidate.measurements.entered.shared);
assert.ok(Object.keys(candidate.measurements.entered.byGarmentKey).length > 0);
assert.equal(candidate.measurements.unit, "inch");
assert.equal(candidate.measurements.blueprintVersion.length > 0, true);
assert.equal(
  Object.values(candidate.measurements.entered.shared).every(
    (value) => value.provenance === "customer_entered",
  ),
  true,
);

const measurementPendingInput = buildInput();
measurementPendingInput.measurementState = {
  ...measurementPendingInput.measurementState,
  route: "medium_risk",
  calculationStatus: "calculation_formula_pending",
};
const measurementPending = buildFutureOrderCandidate(measurementPendingInput);
assert.equal(measurementPending.status, "blocked");
assert.ok(
  measurementPending.blockers.some(
    (blocker) => blocker.code === "MEASUREMENT_CALCULATION_PENDING",
  ),
);

assert.equal(candidate.shipping.state.customerInformation.fullName, "Ada Lovelace");
assert.equal(candidate.shipping.state.customerInformation.deliveryAddress.city, "Eindhoven");
assert.equal(candidate.shipping.state.quoteReference?.tariffVersion.length! > 0, true);

const pickupBaseInput = buildInput();
const pickupInput: FutureOrderCandidateBuildInput = {
  ...pickupBaseInput,
  shippingResolution: reconcileFutureShippingState({
  state: {
    ...deliveryState(),
    fulfilmentMethod: "eindhoven_pickup",
  },
  garmentCount: 1,
  selectedDesignPrice:
    projectFutureDesignStudioSummary(pickupBaseInput).pricingSummary
      .selectedDesignPrice?.selectedDesignPrice || null,
  }),
};
const pickup = buildFutureOrderCandidate(pickupInput);
assert.equal(pickup.status, "blocked");
assert.ok(pickup.blockers.some((blocker) => blocker.code === "PICKUP_FEE_PENDING"));
assert.equal(pickup.candidate?.pricing.exactTotalCents, null);

const quotePendingBaseInput = buildInput();
const quotePendingInput: FutureOrderCandidateBuildInput = {
  ...quotePendingBaseInput,
  shippingResolution: reconcileFutureShippingState({
  state: deliveryState(),
  garmentCount: 6,
  selectedDesignPrice:
    projectFutureDesignStudioSummary(quotePendingBaseInput).pricingSummary
      .selectedDesignPrice?.selectedDesignPrice || null,
  }),
};
const quotePending = buildFutureOrderCandidate(quotePendingInput);
assert.equal(quotePending.status, "blocked");
assert.ok(
  quotePending.blockers.some(
    (blocker) => blocker.code === "DELIVERY_QUOTE_PENDING",
  ),
);

const staleBaseInput: FutureOrderCandidateBuildInput = {
  ...exactInput,
  shippingResolution: exactInput.shippingResolution,
};
const staleInput: FutureOrderCandidateBuildInput = {
  ...staleBaseInput,
  shippingResolution: reconcileFutureShippingState({
  state: {
    ...staleBaseInput.shippingResolution.state,
    quoteReference: {
      ...staleBaseInput.shippingResolution.state.quoteReference!,
      tariffVersion: "obsolete-tariff",
    },
  },
  garmentCount: 4,
  selectedDesignPrice:
    projectFutureDesignStudioSummary(staleBaseInput).pricingSummary
      .selectedDesignPrice?.selectedDesignPrice || null,
  }),
};
const stale = buildFutureOrderCandidate(staleInput);
assert.equal(stale.status, "blocked");
assert.ok(stale.blockers.some((blocker) => blocker.code === "STALE_SHIPPING_QUOTE"));

const malformedCandidate = {
  ...candidate,
  pricing: { ...candidate.pricing, taxCents: Number.NaN },
};
assert.equal(normalizeFutureOrderCandidate(malformedCandidate).status, "invalid");
assert.equal(
  normalizeFutureOrderCandidate(malformedCandidate).blockers[0].code,
  "MALFORMED_MONEY",
);
const tamperedTotal = {
  ...candidate,
  pricing: {
    ...candidate.pricing,
    exactTotalCents: candidate.pricing.exactTotalCents! + 1,
  },
};
assert.equal(normalizeFutureOrderCandidate(tamperedTotal).status, "invalid");
assert.equal(
  normalizeFutureOrderCandidate(tamperedTotal).blockers[0].code,
  "NON_AUTHORITATIVE_TOTAL",
);
const malformedMoneyInput: FutureOrderCandidateBuildInput = {
  ...buildInput(),
  taxPercentage: Number.NaN,
};
const malformedMoney = buildFutureOrderCandidate(malformedMoneyInput);
assert.equal(malformedMoney.status, "invalid");
assert.ok(
  malformedMoney.blockers.some((blocker) => blocker.code === "MALFORMED_MONEY"),
);

const wrongGarmentCountInput: FutureOrderCandidateBuildInput = {
  ...exactInput,
  shippingResolution: {
    ...exactInput.shippingResolution,
    state: {
      ...exactInput.shippingResolution.state,
      quoteReference: {
        ...exactInput.shippingResolution.state.quoteReference!,
        garmentCount: 99,
      },
    },
  },
};
const wrongGarmentCount = buildFutureOrderCandidate(wrongGarmentCountInput);
assert.equal(wrongGarmentCount.status, "blocked");
assert.ok(
  wrongGarmentCount.blockers.some(
    (blocker) => blocker.code === "STALE_SHIPPING_QUOTE",
  ),
);

const uploadedSource: DesignSource = {
  kind: "uploaded",
  sourceKey: "uploaded-source",
  displayLabel: "Customer design",
  demographic: "male",
  fabricCapacityComposition: [],
  uploadReference: {
    designReferenceId: "design-reference",
    ownerUid: "owner",
    storagePath: "private/storage/path",
    mimeType: "image/jpeg",
    createdAt: "2026-08-14T00:00:00.000Z",
  },
};
const unsupportedInput: FutureOrderCandidateBuildInput = {
  ...buildInput(),
  source: uploadedSource,
};
const unsupported = buildFutureOrderCandidate(unsupportedInput);
assert.equal(unsupported.status, "invalid");
assert.equal(unsupported.candidate, null);
assert.ok(
  unsupported.blockers.some(
    (blocker) => blocker.code === "UNSUPPORTED_FUTURE_SOURCE",
  ),
);

assert.deepEqual(inspectFutureOrderCandidateSecurity(candidate), {
  safe: true,
  forbiddenPaths: [],
});
assert.equal(
  inspectFutureOrderCandidateSecurity({
    candidate,
    paymentToken: "secret",
    nested: { rawImage: "data:image/jpeg;base64,secret" },
  }).safe,
  false,
);

assert.equal(FUTURE_ORDER_CANDIDATE_PRODUCTION_CONVERSION.supported, false);
const candidateSource = readFileSync("src/utils/futureOrderCandidate.ts", "utf8");
assert.equal(candidateSource.includes("as CartItem"), false);
assert.equal(candidateSource.includes("as MasterOrder"), false);
assert.equal(candidateSource.includes("useAppStore"), false);
assert.equal(candidateSource.includes("localStorage"), false);
assert.equal(candidateSource.includes("StorageService"), false);
const appSource = readFileSync("src/App.tsx", "utf8");
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.equal(appSource.includes("future_nine_stage"), false);
assert.equal(studioSource.includes("legacy_five_stage"), false);
assert.doesNotMatch(
  studioSource,
  /futureOrderCandidateResult\.candidate\.pricing/,
  "An incomplete journey must not dereference a missing order candidate",
);
assert.match(studioSource, /futureOrderCandidateResult\.candidate\?\.pricing/);

console.log("PASS: future order candidate contract and security boundary");
