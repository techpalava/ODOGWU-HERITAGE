import assert from "node:assert/strict";
import type {
  CustomDetailGarmentGroup,
  CustomDetailSelectionGroup,
  CustomDetailSelectionSnapshot,
  GarmentScopedCustomDetailsStateV1,
  GuestDesignDraft,
} from "./src/types";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { createUploadedDesignSource } from "./src/utils/designSourceState";
import {
  clearGarmentScopedCustomDetailSelection,
  cloneGarmentScopedCustomDetailsState,
  createEmptyGarmentScopedCustomDetailsState,
  enumerateGarmentScopedCustomDetails,
  getGarmentScopedCustomDetailSelection,
  isGarmentScopedCustomDetailsStateEmpty,
  migrateLegacyCustomDetailsToGarmentScoped,
  normalizeGarmentScopedCustomDetailsState,
  projectGarmentScopedCustomDetailsToLegacy,
  removeGarmentScopedCustomDetails,
  retainGarmentScopedCustomDetailKeys,
  setGarmentScopedCustomDetailSelection,
  setGarmentScopedCustomDetailSnapshot,
} from "./src/utils/garmentScopedCustomDetailsState";

const snapshot = (
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
  garmentGroup: CustomDetailGarmentGroup = "shirt",
  priceCents = 6500,
): CustomDetailSelectionSnapshot => ({
  optionId,
  label: `Label for ${optionId}`,
  description: `Description for ${optionId}`,
  garmentGroup,
  selectionGroup,
  priceCents,
});

const empty = createEmptyGarmentScopedCustomDetailsState();
assert.deepEqual(empty, {
  schemaVersion: 1,
  selectionsByGarmentKey: {},
  snapshotsByGarmentKey: {},
});
assert.equal(isGarmentScopedCustomDetailsStateEmpty(empty), true);

let independent = setGarmentScopedCustomDetailSelection(
  empty,
  "base:shirt",
  "shirt_construction",
  "shirt_std_short",
);
independent = setGarmentScopedCustomDetailSelection(
  independent,
  "base:kaftan",
  "shirt_construction",
  "shirt_long_midlong",
);
independent = setGarmentScopedCustomDetailSnapshot(
  independent,
  "base:shirt",
  "shirt_construction",
  snapshot("shirt_std_short", "shirt_construction"),
);
independent = setGarmentScopedCustomDetailSnapshot(
  independent,
  "base:kaftan",
  "shirt_construction",
  snapshot("shirt_long_midlong", "shirt_construction"),
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    independent,
    "base:shirt",
    "shirt_construction",
  ),
  "shirt_std_short",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    independent,
    "base:kaftan",
    "shirt_construction",
  ),
  "shirt_long_midlong",
);
assert.equal(
  createEmptyGarmentScopedCustomDetailsState().selectionsByGarmentKey[
    "base:shirt"
  ],
  undefined,
  "State transitions must not mutate their input.",
);

let repeatedOption = setGarmentScopedCustomDetailSelection(
  empty,
  "base:shirt",
  "neck_design",
  "neck_no_round",
);
repeatedOption = setGarmentScopedCustomDetailSelection(
  repeatedOption,
  "base:kaftan",
  "neck_design",
  "neck_no_round",
);
repeatedOption = setGarmentScopedCustomDetailSnapshot(
  repeatedOption,
  "base:shirt",
  "neck_design",
  snapshot("neck_no_round", "neck_design", "neck", 0),
);
repeatedOption = setGarmentScopedCustomDetailSnapshot(
  repeatedOption,
  "base:kaftan",
  "neck_design",
  snapshot("neck_no_round", "neck_design", "neck", 0),
);
const repeatedOccurrences = enumerateGarmentScopedCustomDetails(repeatedOption);
assert.equal(repeatedOccurrences.length, 2);
assert.deepEqual(
  repeatedOccurrences.map(({ garmentKey, optionId }) => ({ garmentKey, optionId })),
  [
    { garmentKey: "base:kaftan", optionId: "neck_no_round" },
    { garmentKey: "base:shirt", optionId: "neck_no_round" },
  ],
  "Repeated option IDs must remain separate garment-scoped occurrences.",
);
assert.deepEqual(
  repeatedOccurrences.map((occurrence) => occurrence.snapshot?.garmentKey),
  ["base:kaftan", "base:shirt"],
);

let dresses = setGarmentScopedCustomDetailSelection(
  empty,
  "base:dress",
  "dress_construction",
  "dress_std_short",
);
dresses = setGarmentScopedCustomDetailSelection(
  dresses,
  "base:full_length_gown",
  "dress_construction",
  "dress_long_midlong",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    dresses,
    "base:dress",
    "dress_construction",
  ),
  "dress_std_short",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    dresses,
    "base:full_length_gown",
    "dress_construction",
  ),
  "dress_long_midlong",
);

const arbitraryComponentKey = "uploaded:customer-design:component-42";
const arbitrary = setGarmentScopedCustomDetailSelection(
  empty,
  arbitraryComponentKey,
  "skirt_length",
  "skirt_long",
);
assert.equal(
  getGarmentScopedCustomDetailSelection(
    arbitrary,
    arbitraryComponentKey,
    "skirt_length",
  ),
  "skirt_long",
);

const beforeUpdate = structuredClone(independent);
const updated = setGarmentScopedCustomDetailSelection(
  independent,
  "base:shirt",
  "shirt_construction",
  "shirt_std_midlong",
);
assert.deepEqual(independent, beforeUpdate);
assert.equal(
  updated.snapshotsByGarmentKey["base:shirt"]?.shirt_construction,
  undefined,
  "Changing an option must clear its stale scoped snapshot.",
);
assert.equal(
  updated.snapshotsByGarmentKey["base:kaftan"]?.shirt_construction?.[0]
    .optionId,
  "shirt_long_midlong",
);

const cleared = clearGarmentScopedCustomDetailSelection(
  independent,
  "base:shirt",
  "shirt_construction",
);
assert.equal(cleared.selectionsByGarmentKey["base:shirt"], undefined);
assert.equal(cleared.snapshotsByGarmentKey["base:shirt"], undefined);
assert.equal(
  cleared.selectionsByGarmentKey["base:kaftan"]?.shirt_construction,
  "shirt_long_midlong",
);

const removed = removeGarmentScopedCustomDetails(
  independent,
  "base:kaftan",
);
assert.equal(removed.selectionsByGarmentKey["base:kaftan"], undefined);
assert.equal(
  removed.selectionsByGarmentKey["base:shirt"]?.shirt_construction,
  "shirt_std_short",
);
const retained = retainGarmentScopedCustomDetailKeys(independent, ["base:kaftan"]);
assert.equal(retained.selectionsByGarmentKey["base:shirt"], undefined);
assert.equal(
  retained.selectionsByGarmentKey["base:kaftan"]?.shirt_construction,
  "shirt_long_midlong",
);

const deterministicOne = enumerateGarmentScopedCustomDetails(
  setGarmentScopedCustomDetailSelection(
    setGarmentScopedCustomDetailSelection(
      empty,
      "z:garment",
      "trouser_pockets",
      ["trouser_pocket_none", "trouser_pocket_back"],
    ),
    "a:garment",
    "neck_design",
    "neck_no_v",
  ),
);
const deterministicTwo = enumerateGarmentScopedCustomDetails(
  JSON.parse(
    JSON.stringify({
      ...empty,
      selectionsByGarmentKey: {
        "a:garment": { neck_design: "neck_no_v" },
        "z:garment": {
          trouser_pockets: ["trouser_pocket_back", "trouser_pocket_none"],
        },
      },
    }),
  ) as GarmentScopedCustomDetailsStateV1,
);
assert.deepEqual(deterministicOne, deterministicTwo);

const jsonRoundTrip = normalizeGarmentScopedCustomDetailsState(
  JSON.parse(JSON.stringify(repeatedOption)),
);
assert.deepEqual(jsonRoundTrip.state, repeatedOption);
assert.deepEqual(jsonRoundTrip.diagnostics, []);
assert.deepEqual(cloneGarmentScopedCustomDetailsState(repeatedOption), repeatedOption);

const malformed = normalizeGarmentScopedCustomDetailsState({
  schemaVersion: 1,
  selectionsByGarmentKey: {
    " base:shirt ": { shirt_construction: "shirt_std_short" },
    "base:shirt": {
      not_a_group: "unknown",
      shirt_construction: [],
      neck_design: "neck_no_round",
    },
  },
  snapshotsByGarmentKey: {
    "base:shirt": {
      neck_design: [
        {
          ...snapshot("neck_no_round", "neck_design", "neck", 0),
          garmentKey: "wrong:garment",
        },
      ],
      shirt_construction: "not-an-array",
    },
  },
});
assert.equal(malformed.state.selectionsByGarmentKey["base:shirt"]?.neck_design, "neck_no_round");
assert.equal(malformed.state.snapshotsByGarmentKey["base:shirt"], undefined);
assert.ok(malformed.diagnostics.length >= 4);

const legacySelections = {
  shirt_pockets: "shirt_pocket_1",
  neck_design: "neck_no_round",
  skirt_length: "skirt_long",
} as const;
const legacySnapshots = [
  snapshot("shirt_pocket_1", "shirt_pockets", "shirt", 0),
];
const legacyInputBefore = JSON.stringify({ legacySelections, legacySnapshots });
const migration = migrateLegacyCustomDetailsToGarmentScoped({
  customDetails: legacySelections,
  customDetailSnapshots: legacySnapshots,
  ownership: [
    { garmentKey: "base:shirt", selectionGroups: ["shirt_pockets", "neck_design"] },
    { garmentKey: "base:kaftan", selectionGroups: ["neck_design"] },
  ],
});
assert.deepEqual(migration.mapped, [
  { selectionGroup: "shirt_pockets", garmentKey: "base:shirt" },
]);
assert.deepEqual(migration.ambiguous, [
  {
    selectionGroup: "neck_design",
    garmentKeys: ["base:kaftan", "base:shirt"],
  },
]);
assert.deepEqual(migration.unmapped, [{ selectionGroup: "skirt_length" }]);
assert.equal(migration.malformed.length, 0);
assert.equal(
  migration.state.snapshotsByGarmentKey["base:shirt"]?.shirt_pockets?.[0]
    .garmentKey,
  "base:shirt",
);
assert.equal(
  JSON.stringify({ legacySelections, legacySnapshots }),
  legacyInputBefore,
  "Explicit migration must not mutate legacy input.",
);

let collisionFree = setGarmentScopedCustomDetailSelection(
  empty,
  "base:shirt",
  "shirt_construction",
  "shirt_std_short",
);
collisionFree = setGarmentScopedCustomDetailSelection(
  collisionFree,
  "base:trouser",
  "trouser_fastening",
  "trouser_rope",
);
const validProjection = projectGarmentScopedCustomDetailsToLegacy(collisionFree);
assert.equal(validProjection.status, "valid");
if (validProjection.status === "valid") {
  assert.deepEqual(validProjection.customDetails, {
    shirt_construction: "shirt_std_short",
    trouser_fastening: "trouser_rope",
  });
}
const conflictingProjection = projectGarmentScopedCustomDetailsToLegacy(
  repeatedOption,
);
assert.equal(conflictingProjection.status, "conflict");
if (conflictingProjection.status === "conflict") {
  assert.deepEqual(conflictingProjection.collisions, [
    {
      selectionGroup: "neck_design",
      garmentKeys: ["base:kaftan", "base:shirt"],
    },
  ]);
}
assert.equal(
  projectGarmentScopedCustomDetailsToLegacy({ schemaVersion: 99 }).status,
  "malformed",
);

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});
const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "anonymous-garment-scope-test",
  designReferenceId: "garment-scope-design",
  mimeType: "image/png",
  originalFileName: "garment-scope-design.png",
  createdAt: "2026-08-13T00:00:00.000Z",
});
const uploadedSource = createUploadedDesignSource({
  uploadReference,
  fabricCapacityComposition: [
    { key: "uploaded:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
  demographic: "male",
});
const baseDraft = (
  designSelections: GuestDesignDraft["designSelections"],
): GuestDesignDraft => ({
  currentStep: 1,
  selectedFabricCode: null,
  selectedStyleId: null,
  designSource: uploadedSource,
  selectedGarment: null,
  designSelections,
  measurements: {
    height: 175,
    weight: 70,
    age: 30,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 15,
    shoulder: 18,
    chest: 40,
    waist: 33,
    hip: 40,
    sleeve: 24,
    trouserLength: 41,
    isAiEstimated: false,
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
  customerName: "Future Draft",
  customerEmail: "future@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "keep unrelated draft data",
  leftoverFabricChoice: "RETURN",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: 0,
    total: 0,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-13T00:00:00.000Z",
});

StorageService.clearGuestOrderSession();
const futureDraft = baseDraft({
  customDetails: { shirt_construction: "legacy-stays-intact" },
  garmentScopedCustomDetails: repeatedOption,
});
GuestOrderSessionService.saveGuestDesignDraft(futureDraft);
const restored = GuestOrderSessionService.getGuestDesignDraft();
assert.deepEqual(
  restored?.designSelections.garmentScopedCustomDetails,
  repeatedOption,
  "Repeated garment/group occurrences must survive guest draft persistence.",
);
assert.deepEqual(restored?.designSelections.customDetails, {
  shirt_construction: "legacy-stays-intact",
});
assert.equal(restored?.journeySchemaVersion, undefined);
assert.equal(restored?.currentStageId, undefined);
assert.equal(restored?.specialInstructions, "keep unrelated draft data");
assert.equal(restored?.leftoverFabricChoice, "RETURN");
assert.equal(restored?.designSource?.kind, "uploaded");
assert.equal(
  restored?.designSource?.kind === "uploaded"
    ? restored.designSource.uploadReference.designReferenceId
    : null,
  uploadReference.designReferenceId,
  "Upload-related draft fields must remain unchanged.",
);

StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestDesignDraft(
  baseDraft({ customDetails: { neck_design: "legacy-only" } }),
);
assert.equal(
  GuestOrderSessionService.getGuestDesignDraft()?.designSelections
    .garmentScopedCustomDetails,
  undefined,
  "Legacy drafts without the future field must remain field-compatible.",
);

StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestDesignDraft(
  baseDraft({
    garmentScopedCustomDetails: {
      schemaVersion: 1,
      selectionsByGarmentKey: { "base:shirt": { neck_design: [] } },
      snapshotsByGarmentKey: {},
    },
  }),
);
assert.deepEqual(
  GuestOrderSessionService.getGuestDesignDraft()?.designSelections
    .garmentScopedCustomDetails,
  createEmptyGarmentScopedCustomDetailsState(),
  "Malformed future state must normalize to an inert empty state.",
);

console.log("Garment-scoped Custom Details state verification passed.");
