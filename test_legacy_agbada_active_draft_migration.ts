import assert from "node:assert/strict";
import type {
  CanonicalPhysicalGarmentType,
  FabricAllocation,
  GarmentConstructionPricingResolution,
  GuestDesignDraft,
} from "./src/types";
import { normalizeGuestDesignDraft } from "./src/services/guestOrderSessionService";
import {
  buildAuthoritativePhysicalOccurrences,
  isValidUploadedDesignDraftSource,
  isValidUploadedDesignSource,
} from "./src/utils/designSourceState";
import { getGarmentTypeStageCompletion } from "./src/utils/designStudioJourneyMode";
import {
  LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION,
  migrateLegacyAgbadaActiveDraft,
} from "./src/utils/legacyAgbadaActiveDraftMigration";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeConstruction = (
  garmentType: "shirt" | "agbada",
  priceCents: number,
): GarmentConstructionPricingResolution => ({
  status: "resolved",
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:construction:default`,
      optionId: `${garmentType}_default`,
      selectionGroup: "shirt_construction",
      priceCents,
      price: priceCents / 100,
    },
  ],
  totalPriceCents: priceCents,
  totalPrice: priceCents / 100,
});

const makeMeasurements = (): GuestDesignDraft["measurements"] => ({
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
});

const shirtAllocation: FabricAllocation = {
  allocationId: "allocation-shirt",
  fabricCode: "ODG-009",
  garmentAssignments: [
    {
      garmentKey: "base:shirt",
      code: "SHIRT",
      garmentType: "shirt",
      fabricUnits: 1,
      sourceRole: "main",
    },
  ],
};

const agbadaAllocation: FabricAllocation = {
  allocationId: "allocation-agbada",
  fabricCode: "ODG-010",
  garmentAssignments: [
    {
      garmentKey: "base:agbada",
      code: "AGBADA",
      garmentType: "agbada",
      fabricUnits: 2,
      sourceRole: "main",
    },
  ],
};

const makeDraft = (
  garmentTypes: CanonicalPhysicalGarmentType[] = ["shirt", "agbada"],
): GuestDesignDraft => ({
  journeySchemaVersion: 1,
  currentStageId: "summary",
  currentStep: 7,
  garmentTypeSelection: {
    garmentTypes,
    audienceSelection: { schemaVersion: 1, demographics: ["male"] },
    demographic: "male",
    constructionByGarment: {
      ...(garmentTypes.includes("shirt")
        ? { shirt: makeConstruction("shirt", 6500) }
        : {}),
      ...(garmentTypes.includes("agbada")
        ? { agbada: makeConstruction("agbada", 14000) }
        : {}),
    },
  },
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "completed",
    inputFingerprint: "legacy-shirt-agbada-fingerprint",
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: "asset_legacy_agbada_001",
      ownerBindingId: "owner_legacy_agbada_001",
    },
  },
  futureMeasurementState: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: {
      shared: {},
      byGarmentKey: {
        "base:shirt": {
          chest_bust_circumference: {
            valueCm: 101.6,
            provenance: "customer_entered",
          },
        },
        "base:agbada": {
          chest_bust_circumference: {
            valueCm: 106.68,
            provenance: "customer_entered",
          },
        },
      },
    },
    enteredByRoute: {
      low_risk: {
        shared: {},
        byGarmentKey: {
          "base:shirt": {
            chest_bust_circumference: {
              valueCm: 101.6,
              provenance: "customer_entered",
            },
          },
          "base:agbada": {
            chest_bust_circumference: {
              valueCm: 106.68,
              provenance: "customer_entered",
            },
          },
        },
      },
      medium_risk: {
        shared: {},
        byGarmentKey: {
          "base:agbada": {
            chest_bust_circumference: {
              valueCm: 107,
              provenance: "customer_entered",
            },
          },
        },
      },
      high_risk: {
        shared: {},
        byGarmentKey: {
          "base:agbada": {
            chest_bust_circumference: {
              valueCm: 108,
              provenance: "customer_entered",
            },
          },
        },
      },
    },
    unassignedEntered: {
      shared: {},
      byGarmentKey: {
        "base:agbada": {
          chest_bust_circumference: {
            valueCm: 109,
            provenance: "customer_entered",
          },
        },
      },
    },
    derived: {
      shared: {
        hip_circumference: {
          valueCm: 104,
          provenance: "system_derived",
          calculation: {
            route: "low_risk",
            profileId: "agbada-profile",
            garmentKey: "base:agbada",
            measurementId: "hip_circumference",
            averageFactor: 1,
          },
        },
      },
      byGarmentKey: {
        "base:shirt": {
          sleeve_length: {
            valueCm: 63,
            provenance: "system_derived",
          },
        },
        "base:agbada": {
          sleeve_length: {
            valueCm: 65,
            provenance: "system_derived",
          },
        },
      },
    },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "legacy-measurement-fingerprint",
    calculationStatus: "complete",
    diagnostics: [
      { code: "measurement_range_recheck", garmentKey: "base:agbada" },
      { code: "measurement_range_recheck", garmentKey: "base:shirt" },
    ],
    invalidInputKeys: [
      "low_risk:base:agbada:chest_bust_circumference",
      "low_risk:base:shirt:chest_bust_circumference",
    ],
    invalidInputKeysByRoute: {
      low_risk: [
        "low_risk:base:agbada:chest_bust_circumference",
        "low_risk:base:shirt:chest_bust_circumference",
      ],
      medium_risk: ["medium_risk:base:agbada:chest_bust_circumference"],
      high_risk: ["high_risk:base:agbada:chest_bust_circumference"],
    },
  },
  futureShippingState: {
    schemaVersion: 1,
    fulfilmentMethod: "destination_delivery",
    destinationSelectionMode: "supported_country",
    otherDestinationCountry: "",
    customerInformation: {
      fullName: "Legacy Customer",
      phone: "+31000000000",
      email: "legacy@example.com",
      deliveryAddress: {
        addressLine1: "1 Survivor Street",
        addressLine2: "",
        city: "Eindhoven",
        postalCode: "0000AA",
        countryCode: "NL",
      },
      comment: "Keep this address",
    },
    destinationZoneId: "NETHERLANDS_OTHER",
    destinationZoneSource: "iso_resolved",
    quoteReference: {
      tariffVersion: "legacy-tariff",
      ruleId: "step8_legacy",
      ruleFingerprint: "legacy-rule",
      inputFingerprint: "legacy-quote",
      garmentCount: 2,
      weightKg: 2,
      weightTier: "0_2",
      destinationZoneId: "NETHERLANDS_OTHER",
      quoteRequired: false,
    },
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
  designSelections: {
    accessories: ["traditional_hat"],
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: {
        "base:shirt": { neck_design: "round_neck" },
        "base:agbada": { neck_design: "vertical_neck" },
      },
      snapshotsByGarmentKey: {
        "base:agbada": {
          neck_design: [
            {
              garmentKey: "base:agbada",
              optionId: "vertical_neck",
              label: "Vertical neck",
              description: "Legacy option",
              garmentGroup: "neck",
              selectionGroup: "neck_design",
              priceCents: 0,
            },
          ],
        },
      },
    },
    garmentScopedCustomDetailInputs: {
      schemaVersion: 1,
      textByGarmentKey: {
        "base:shirt": {
          personalized_additional: {
            personalized_additional_evaluation: "Keep Shirt text",
          },
        },
        "base:agbada": {
          personalized_additional: {
            personalized_additional_evaluation: "Remove with Agbada",
          },
        },
      },
    },
  },
  measurements: makeMeasurements(),
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "1 Survivor Street",
    city: "Eindhoven",
    postalCode: "0000AA",
    countryCode: "NL",
  },
  pickupTime: "",
  customerName: "Legacy Customer",
  customerEmail: "legacy@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: garmentTypes.length,
  specialInstructions: "Preserve this note",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    pricingModel: "all_inclusive_garment_construction",
    garmentConstructionSubtotal: 205,
    clothingPrice: 205,
    includesFabricAndSewing: true,
    customDetailsPrice: 0,
    selectedDesignPrice: 205,
    eindhovenToDestinationShipping: 15,
    total: 220,
  },
  shippingSnapshot: {
    finalMile: {
      routeId: "EINDHOVEN_DESTINATION",
      pricingVersion: "legacy-final-mile",
      shipmentGroupId: "legacy-group",
      arrivalGroupKey: "legacy-arrival",
      status: "READY",
      method: "DELIVERY",
      zone: "NETHERLANDS_OTHER",
      zoneLabel: "Netherlands",
      garmentPieceCount: 2,
      weightSource: "GARMENT_COUNT_ESTIMATE",
      weightBand: "0 - 2 kg",
      priceEur: 15,
    },
  },
  fabricAllocations: [clone(shirtAllocation), clone(agbadaAllocation)],
  updatedAt: "2026-09-02T12:00:00.000Z",
});

const freshDraft = makeDraft(["shirt"]);
freshDraft.aiTryOnWorkflow = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};
freshDraft.fabricAllocations = [clone(shirtAllocation)];
const freshSnapshot = clone(freshDraft);
const freshResult = migrateLegacyAgbadaActiveDraft(freshDraft);
assert.equal(freshResult.changed, false);
assert.equal(freshResult.draft, freshDraft);
assert.deepEqual(freshResult.draft, freshSnapshot);

const catalogueDraft = makeDraft();
const catalogueResult = migrateLegacyAgbadaActiveDraft(catalogueDraft);
assert.equal(catalogueResult.migrationVersion, 1);
assert.equal(
  catalogueResult.migrationVersion,
  LEGACY_AGBADA_ACTIVE_DRAFT_MIGRATION_VERSION,
);
assert.equal(catalogueResult.changed, true);
assert.deepEqual(catalogueResult.removedGarmentKeys, ["base:agbada"]);
assert.deepEqual(catalogueResult.draft.garmentTypeSelection?.garmentTypes, [
  "shirt",
]);
assert.equal(
  catalogueResult.draft.garmentTypeSelection?.constructionByGarment.agbada,
  undefined,
);
assert.deepEqual(
  catalogueResult.draft.fabricAllocations?.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt"],
);
assert.deepEqual(
  Object.keys(
    catalogueResult.draft.designSelections.garmentScopedCustomDetails
      ?.selectionsByGarmentKey || {},
  ),
  ["base:shirt"],
);
assert.deepEqual(
  Object.keys(
    catalogueResult.draft.designSelections.garmentScopedCustomDetails
      ?.snapshotsByGarmentKey || {},
  ),
  [],
);
assert.deepEqual(
  Object.keys(
    catalogueResult.draft.designSelections.garmentScopedCustomDetailInputs
      ?.textByGarmentKey || {},
  ),
  ["base:shirt"],
);
assert.deepEqual(catalogueResult.draft.designSelections.accessories, [
  "traditional_hat",
]);
assert.equal(
  catalogueResult.draft.futureMeasurementState?.entered.byGarmentKey[
    "base:agbada"
  ],
  undefined,
);
assert.ok(
  catalogueResult.draft.futureMeasurementState?.entered.byGarmentKey[
    "base:shirt"
  ],
);
(["low_risk", "medium_risk", "high_risk"] as const).forEach((route) => {
  assert.equal(
    catalogueResult.draft.futureMeasurementState?.enteredByRoute?.[route]
      .byGarmentKey["base:agbada"],
    undefined,
  );
});
assert.equal(
  catalogueResult.draft.futureMeasurementState?.unassignedEntered
    ?.byGarmentKey["base:agbada"],
  undefined,
);
assert.equal(
  catalogueResult.draft.futureMeasurementState?.derived.byGarmentKey[
    "base:agbada"
  ],
  undefined,
);
assert.ok(
  catalogueResult.draft.futureMeasurementState?.derived.byGarmentKey[
    "base:shirt"
  ],
);
assert.equal(
  catalogueResult.draft.futureMeasurementState?.derived.shared
    .hip_circumference,
  undefined,
);
assert.deepEqual(
  catalogueResult.draft.futureMeasurementState?.diagnostics.map(
    (diagnostic) => diagnostic.garmentKey,
  ),
  ["base:shirt"],
);
assert.deepEqual(
  catalogueResult.draft.futureMeasurementState?.invalidInputKeys,
  ["low_risk:base:shirt:chest_bust_circumference"],
);
assert.equal(
  catalogueResult.draft.futureMeasurementState?.inputFingerprint,
  "",
);
assert.equal(
  catalogueResult.draft.futureMeasurementState?.calculationStatus,
  "incomplete",
);
assert.deepEqual(catalogueResult.draft.aiTryOnWorkflow, {
  schemaVersion: 1,
  status: "stale",
  inputFingerprint: "legacy-shirt-agbada-fingerprint",
});
assert.equal(catalogueResult.draft.futureShippingState?.quoteReference, null);
assert.equal(
  catalogueResult.draft.futureShippingState?.customerInformation.comment,
  "Keep this address",
);
assert.equal(
  catalogueResult.draft.futureShippingState?.customerInformation.deliveryAddress
    .addressLine1,
  "1 Survivor Street",
);
assert.deepEqual(catalogueResult.draft.shippingSnapshot, {});
assert.equal(
  catalogueResult.draft.pricingBreakdown.garmentConstructionSubtotal,
  undefined,
);
assert.equal(catalogueResult.draft.pricingBreakdown.selectedDesignPrice, null);
assert.equal(catalogueResult.draft.pricingBreakdown.total, undefined);
assert.equal(catalogueResult.draft.garmentPieceCount, 1);
assert.equal(catalogueResult.draft.updatedAt, catalogueDraft.updatedAt);

const survivorOccurrences = buildAuthoritativePhysicalOccurrences({
  sourceKind: "catalogue",
  step1GarmentTypeSelection: catalogueResult.draft.garmentTypeSelection!,
  effectiveGarmentTypeSelection: catalogueResult.draft.garmentTypeSelection!,
  additionalGarmentConstructionState:
    catalogueResult.draft.designSelections.additionalGarmentConstructions,
});
assert.deepEqual(
  survivorOccurrences.map((occurrence) => occurrence.garmentKey),
  ["base:shirt"],
);

const normalizedCatalogue = normalizeGuestDesignDraft(catalogueDraft);
assert.deepEqual(normalizedCatalogue.garmentTypeSelection?.garmentTypes, [
  "shirt",
]);
assert.equal(normalizedCatalogue.pricingBreakdown.selectedDesignPrice, null);
const secondMigration = migrateLegacyAgbadaActiveDraft(catalogueResult.draft);
assert.equal(secondMigration.changed, false);
assert.equal(secondMigration.draft, catalogueResult.draft);

const sharedAllocationDraft = makeDraft();
sharedAllocationDraft.fabricAllocations = [
  {
    allocationId: "allocation-shared",
    fabricCode: "ODG-009",
    garmentAssignments: [
      ...clone(shirtAllocation.garmentAssignments),
      ...clone(agbadaAllocation.garmentAssignments),
    ],
  },
];
const sharedResult = migrateLegacyAgbadaActiveDraft(sharedAllocationDraft);
assert.equal(sharedResult.draft.fabricAllocations?.length, 1);
assert.equal(
  sharedResult.draft.fabricAllocations?.[0].allocationId,
  "allocation-shared",
);
assert.equal(sharedResult.draft.fabricAllocations?.[0].fabricCode, "ODG-009");
assert.deepEqual(
  sharedResult.draft.fabricAllocations?.[0].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["base:shirt"],
);

const additionalDraft = makeDraft(["shirt"]);
additionalDraft.fabricAllocations = [
  clone(shirtAllocation),
  {
    allocationId: "allocation-additional",
    fabricCode: "ODG-011",
    garmentAssignments: [
      {
        garmentKey: "additional:agbada:4",
        code: "ADDITIONAL_AGBADA_4",
        garmentType: "agbada",
        fabricUnits: 2,
        sourceRole: "additional",
        mainGarmentKey: "base:shirt",
        mainGarmentType: "shirt",
        eligibilityRule: "catalog_all",
        dependencyStatus: "valid",
      },
      {
        garmentKey: "additional:shirt:7",
        code: "ADDITIONAL_SHIRT_7",
        garmentType: "shirt",
        fabricUnits: 1,
        sourceRole: "additional",
        mainGarmentKey: "base:shirt",
        mainGarmentType: "shirt",
        eligibilityRule: "catalog_all",
        dependencyStatus: "valid",
      },
    ],
  },
];
additionalDraft.designSelections.additionalGarmentConstructions = {
  schemaVersion: 1,
  byGarmentKey: {
    "additional:agbada:4": makeConstruction("agbada", 14000),
    "additional:shirt:7": makeConstruction("shirt", 6500),
  },
};
additionalDraft.designSelections.garmentScopedCustomDetails = {
  schemaVersion: 1,
  selectionsByGarmentKey: {
    "additional:agbada:4": { neck_design: "vertical_neck" },
    "additional:shirt:7": { neck_design: "round_neck" },
  },
  snapshotsByGarmentKey: {},
};
const additionalResult = migrateLegacyAgbadaActiveDraft(additionalDraft);
assert.deepEqual(additionalResult.removedGarmentKeys, [
  "additional:agbada:4",
  "base:agbada",
]);
assert.deepEqual(
  Object.keys(
    additionalResult.draft.designSelections.additionalGarmentConstructions
      ?.byGarmentKey || {},
  ),
  ["additional:shirt:7"],
);
assert.ok(
  additionalResult.draft.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey["additional:shirt:7"],
);
assert.equal(
  additionalResult.draft.designSelections.garmentScopedCustomDetails
    ?.selectionsByGarmentKey["additional:agbada:4"],
  undefined,
);
assert.deepEqual(
  additionalResult.draft.fabricAllocations?.[1].garmentAssignments.map(
    (assignment) => assignment.garmentKey,
  ),
  ["additional:shirt:7"],
);
assert.equal(additionalResult.draft.garmentPieceCount, 2);

const uploadReference = {
  ownerUid: "legacy-upload-owner",
  designReferenceId: "legacy-upload-reference",
  storagePath:
    "customer-design-drafts/legacy-upload-owner/legacy-upload-reference/original.png",
  mimeType: "image/png" as const,
  originalFileName: "legacy.png",
  createdAt: "2026-09-01T10:00:00.000Z",
};
const uploadedDraft = makeDraft();
uploadedDraft.selectedStyleId = null;
uploadedDraft.confirmedStyleId = null;
uploadedDraft.designSource = {
  kind: "uploaded",
  sourceKey: "uploaded:legacy-upload-reference",
  uploadReference,
  demographic: "male",
  displayLabel: "Your Uploaded Design",
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "upload:agbada:legacy", garmentType: "agbada", fabricUnits: 2 },
  ],
};
uploadedDraft.confirmedDesignSourceKey = "uploaded:legacy-upload-reference";
uploadedDraft.fabricAllocations = [
  clone(shirtAllocation),
  {
    ...clone(agbadaAllocation),
    garmentAssignments: [
      {
        ...clone(agbadaAllocation.garmentAssignments[0]),
        garmentKey: "upload:agbada:legacy",
      },
    ],
  },
];
const uploadedResult = migrateLegacyAgbadaActiveDraft(uploadedDraft);
assert.equal(uploadedResult.draft.designSource?.kind, "uploaded");
assert.deepEqual(
  uploadedResult.draft.designSource?.kind === "uploaded"
    ? uploadedResult.draft.designSource.fabricCapacityComposition
    : null,
  [{ key: "base:shirt", garmentType: "shirt", fabricUnits: 1 }],
);
assert.deepEqual(
  uploadedResult.draft.designSource?.kind === "uploaded"
    ? uploadedResult.draft.designSource.uploadReference
    : null,
  uploadReference,
);
assert.equal(
  uploadedResult.draft.confirmedDesignSourceKey,
  "uploaded:legacy-upload-reference",
);
assert.equal(
  isValidUploadedDesignSource(uploadedResult.draft.designSource),
  true,
);

const catalogueOnlyDraft = makeDraft(["agbada"]);
catalogueOnlyDraft.fabricAllocations = [clone(agbadaAllocation)];
const catalogueOnlyResult = migrateLegacyAgbadaActiveDraft(catalogueOnlyDraft);
assert.deepEqual(
  catalogueOnlyResult.draft.garmentTypeSelection?.garmentTypes,
  [],
);
assert.equal(catalogueOnlyResult.draft.currentStageId, "garment_type");
assert.equal(catalogueOnlyResult.draft.currentStep, 1);
assert.equal(catalogueOnlyResult.draft.designSource, null);
assert.equal(catalogueOnlyResult.draft.selectedStyleId, null);
assert.equal(catalogueOnlyResult.draft.fabricAllocations?.length, 0);
assert.equal(catalogueOnlyResult.draft.garmentPieceCount, 0);
assert.equal(
  getGarmentTypeStageCompletion(
    catalogueOnlyResult.draft.garmentTypeSelection!,
  ).isComplete,
  false,
);

const uploadedOnlyDraft = makeDraft(["agbada"]);
uploadedOnlyDraft.selectedStyleId = null;
uploadedOnlyDraft.confirmedStyleId = null;
uploadedOnlyDraft.designSource = {
  kind: "uploaded",
  sourceKey: "uploaded:legacy-upload-reference",
  uploadReference: clone(uploadReference),
  demographic: "male",
  displayLabel: "Your Uploaded Design",
  fabricCapacityComposition: [
    { key: "base:agbada", garmentType: "agbada", fabricUnits: 2 },
  ],
};
uploadedOnlyDraft.confirmedDesignSourceKey =
  "uploaded:legacy-upload-reference";
uploadedOnlyDraft.fabricAllocations = [clone(agbadaAllocation)];
const uploadedOnlyResult = migrateLegacyAgbadaActiveDraft(uploadedOnlyDraft);
assert.equal(uploadedOnlyResult.draft.currentStageId, "garment_type");
assert.equal(uploadedOnlyResult.draft.designSource?.kind, "uploaded");
assert.deepEqual(
  uploadedOnlyResult.draft.designSource?.kind === "uploaded"
    ? uploadedOnlyResult.draft.designSource.fabricCapacityComposition
    : null,
  [],
);
assert.equal(
  uploadedOnlyResult.draft.confirmedDesignSourceKey,
  "uploaded:legacy-upload-reference",
);
assert.equal(
  isValidUploadedDesignDraftSource(uploadedOnlyResult.draft.designSource),
  true,
);
assert.equal(
  isValidUploadedDesignSource(uploadedOnlyResult.draft.designSource),
  false,
);
const normalizedUploadedOnly = normalizeGuestDesignDraft(uploadedOnlyDraft);
assert.equal(normalizedUploadedOnly.designSource?.kind, "uploaded");
assert.deepEqual(
  normalizedUploadedOnly.designSource?.kind === "uploaded"
    ? normalizedUploadedOnly.designSource.fabricCapacityComposition
    : null,
  [],
);
assert.equal(
  normalizedUploadedOnly.confirmedDesignSourceKey,
  "uploaded:legacy-upload-reference",
);

const skippedDraft = makeDraft();
skippedDraft.aiTryOnWorkflow = {
  schemaVersion: 1,
  status: "skipped",
  inputFingerprint: null,
};
assert.deepEqual(
  migrateLegacyAgbadaActiveDraft(skippedDraft).draft.aiTryOnWorkflow,
  skippedDraft.aiTryOnWorkflow,
);

const processingDraft = makeDraft();
processingDraft.aiTryOnWorkflow = {
  schemaVersion: 1,
  status: "processing",
  inputFingerprint: "processing-old-composition",
  jobReference: { kind: "resumable_job", jobId: "legacy-job" },
};
assert.deepEqual(
  migrateLegacyAgbadaActiveDraft(processingDraft).draft.aiTryOnWorkflow,
  {
    schemaVersion: 1,
    status: "stale",
    inputFingerprint: "processing-old-composition",
  },
);

const historicalCart = {
  id: "historical-cart-agbada",
  garmentType: "agbada",
  constructionPrice: 140,
};
const historicalOrder = {
  id: "historical-order-agbada",
  garmentType: "agbada",
  paidTotal: 140,
};
const historicalSnapshot = clone({ historicalCart, historicalOrder });
migrateLegacyAgbadaActiveDraft(catalogueDraft);
assert.deepEqual({ historicalCart, historicalOrder }, historicalSnapshot);

console.log(
  "PASS: legacy Agbada active-draft migration covers authority, cleanup, uploads, and idempotence",
);
