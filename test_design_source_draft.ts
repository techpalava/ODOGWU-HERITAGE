import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GuestDesignDraft } from "./src/types";
import { createClearedDesignSelectionStateSnapshot } from "./src/utils/designStyleClearState";
import {
  createCatalogDesignSource,
  createUploadedDesignSource,
  getCatalogDesignSourceKey,
  getConfirmedDesignSourceKeyAfterSourceChange,
  getUploadedDesignSourceKey,
  isDesignSourceConfirmed,
  reconcileGuestDesignDraftDesignSource,
} from "./src/utils/designSourceState";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import { isDesignStylePricingActive } from "./src/utils/designStylePricingActivation";
import {
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
  migrateLegacyDesignStudioStage,
  prepareLegacyDraftForNineStageJourney,
} from "./src/utils/designSourceJourney";

const expectedNumericStages = [
  "design_style",
  "fabric",
  "custom_details",
  "try_on",
  "measurement",
  "measurement",
  "shipping",
  "summary",
  "summary",
] as const;
expectedNumericStages.forEach((expectedStage, index) => {
  assert.equal(migrateLegacyDesignStudioStage(index + 1), expectedStage);
});
assert.deepEqual(
  ["style", "fabric", "details", "shipping", "review"].map((stage) =>
    migrateLegacyDesignStudioStage(stage),
  ),
  ["design_style", "fabric", "custom_details", "shipping", "summary"],
);
[undefined, null, -1, 0, 1.5, 10, "", "4", "unknown", {}, []].forEach(
  (value) => {
    assert.equal(migrateLegacyDesignStudioStage(value), "garment_type");
  },
);
const preparedDraft = prepareLegacyDraftForNineStageJourney(
  { currentStep: 7, unrelated: { preserved: true } },
  7,
);
assert.equal(preparedDraft.currentStageId, "shipping");
assert.equal(
  preparedDraft.journeySchemaVersion,
  DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
);
assert.deepEqual(preparedDraft.unrelated, { preserved: true });

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
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);

const baseDraft = (
  overrides: Partial<GuestDesignDraft> = {},
): GuestDesignDraft => ({
  currentStep: 1,
  selectedFabricCode: null,
  selectedStyleId: "catalog-style-1",
  selectedGarment: { type: "Shirt", fee: 0, code: "G1" },
  designSelections: { customDetails: { shirt_construction: "shirt_standard" } },
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
  deliveryMethod: "PICKUP",
  deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
  pickupTime: "Morning",
  customerName: "Draft Customer",
  customerEmail: "draft@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "",
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
  updatedAt: "2026-08-10T00:00:00.000Z",
  ...overrides,
});

const uploadReference = createCustomerDesignUploadReference({
  ownerUid: "anonymous-user-1",
  designReferenceId: "design-reference-1",
  mimeType: "image/png",
  originalFileName: "customer-design.png",
  createdAt: "2026-08-10T00:00:00.000Z",
});
const uploadedSource = createUploadedDesignSource({
  uploadReference,
  fabricCapacityComposition: [
    { key: "uploaded-shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "uploaded-trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  demographic: "male",
});

const legacyCatalog = reconcileGuestDesignDraftDesignSource(baseDraft());
assert.equal(
  legacyCatalog.designSource,
  undefined,
  "Legacy drafts remain byte-compatible until the future journey is activated.",
);
assert.equal(legacyCatalog.selectedStyleId, "catalog-style-1");

const confirmedCatalog = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: createCatalogDesignSource("catalog-style-1"),
    confirmedStyleId: "catalog-style-1",
    confirmedDesignSourceKey: getCatalogDesignSourceKey("catalog-style-1"),
  }),
);
assert.equal(confirmedCatalog.confirmedStyleId, "catalog-style-1");
assert.equal(
  confirmedCatalog.confirmedDesignSourceKey,
  getCatalogDesignSourceKey("catalog-style-1"),
);

const hydratedUploaded = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: uploadedSource,
    selectedStyleId: "catalog-style-1",
    confirmedStyleId: "catalog-style-1",
    confirmedDesignSourceKey: uploadedSource.sourceKey,
  }),
);
assert.equal(hydratedUploaded.designSource?.kind, "uploaded");
assert.equal(hydratedUploaded.selectedStyleId, null);
assert.equal(hydratedUploaded.selectedGarment, null);
assert.equal(hydratedUploaded.confirmedStyleId, null);
assert.equal(
  hydratedUploaded.designSource?.kind === "uploaded"
    ? hydratedUploaded.designSource.uploadReference.storagePath
    : null,
  uploadReference.storagePath,
);
assert.deepEqual(
  hydratedUploaded.designSource?.kind === "uploaded"
    ? hydratedUploaded.designSource.fabricCapacityComposition
    : [],
  uploadedSource.fabricCapacityComposition,
);
assert.equal(
  hydratedUploaded.designSource?.kind === "uploaded"
    ? hydratedUploaded.designSource.demographic
    : null,
  "male",
);
assert.equal(
  JSON.stringify(hydratedUploaded).includes("blob:"),
  false,
  "Draft persistence must not contain a browser object URL.",
);
assert.equal(
  JSON.stringify(hydratedUploaded).includes('"File"'),
  false,
  "Draft persistence must not contain a File object.",
);

const runtimePropertySource = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: {
      ...uploadedSource,
      uploadReference: {
        ...uploadReference,
        previewUrl: "blob:never-persist",
        file: { name: "never-persist.png" },
      },
    } as typeof uploadedSource,
  }),
);
assert.equal(
  JSON.stringify(runtimePropertySource).includes("never-persist"),
  false,
  "Only typed upload-reference fields may survive draft reconciliation.",
);

StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestDesignDraft(hydratedUploaded);
const persistedUploaded = GuestOrderSessionService.getGuestDesignDraft();
assert.equal(persistedUploaded?.designSource?.kind, "uploaded");
assert.equal(
  persistedUploaded?.designSource?.kind === "uploaded"
    ? persistedUploaded.designSource.uploadReference.designReferenceId
    : null,
  uploadReference.designReferenceId,
  "Uploaded design references must survive guest draft persistence.",
);
assert.deepEqual(
  persistedUploaded?.designSource?.kind === "uploaded"
    ? persistedUploaded.designSource.fabricCapacityComposition
    : [],
  uploadedSource.fabricCapacityComposition,
  "Uploaded composition must survive guest draft persistence.",
);

const catalogAfterUploaded = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: createCatalogDesignSource("catalog-style-2"),
    selectedStyleId: "catalog-style-1",
    confirmedDesignSourceKey: uploadedSource.sourceKey,
  }),
);
assert.equal(catalogAfterUploaded.designSource?.kind, "catalog");
assert.equal(catalogAfterUploaded.selectedStyleId, "catalog-style-2");
assert.equal(catalogAfterUploaded.confirmedDesignSourceKey, null);

assert.equal(isDesignSourceConfirmed(uploadedSource, uploadedSource.sourceKey), true);
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(uploadedSource, uploadedSource.sourceKey, {
    ...uploadedSource,
    fabricCapacityComposition: [{ key: "uploaded-dress", garmentType: "dress", fabricUnits: 1 }],
  }),
  null,
  "Changing composition must invalidate the uploaded source confirmation.",
);
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(
    uploadedSource,
    uploadedSource.sourceKey,
    createUploadedDesignSource({
      uploadReference: createCustomerDesignUploadReference({
        ownerUid: "anonymous-user-1",
        designReferenceId: "design-reference-2",
        mimeType: "image/png",
      }),
      fabricCapacityComposition: [{ key: "uploaded-dress", garmentType: "dress", fabricUnits: 1 }],
      demographic: "female",
    }),
  ),
  null,
  "A replacement upload must invalidate the prior confirmation.",
);

const malformedReference = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: {
      ...uploadedSource,
      uploadReference: { ...uploadReference, storagePath: "orders/not-private.png" },
    },
    confirmedDesignSourceKey: uploadedSource.sourceKey,
    priceActivatedFabricCode: "FABRIC-A",
    fabricAllocations: [],
  }),
);
assert.equal(malformedReference.designSource, null);
assert.equal(malformedReference.selectedStyleId, null);
assert.equal(malformedReference.confirmedDesignSourceKey, null);
assert.equal(malformedReference.priceActivatedFabricCode, null);
assert.deepEqual(malformedReference.designSelections.customDetails, {});

const missingReference = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: {
      kind: "uploaded",
      sourceKey: getUploadedDesignSourceKey("missing"),
      fabricCapacityComposition: [{ key: "shirt", garmentType: "shirt", fabricUnits: 1 }],
      demographic: "male",
      displayLabel: "Your Uploaded Design",
    } as never,
  }),
);
assert.equal(missingReference.designSource, null);

const malformedCatalog = reconcileGuestDesignDraftDesignSource(
  baseDraft({
    designSource: {
      kind: "catalog",
      sourceKey: "catalog:wrong-style",
      styleId: "catalog-style-1",
    },
    confirmedStyleId: "catalog-style-1",
    confirmedDesignSourceKey: "catalog:wrong-style",
  }),
);
assert.equal(malformedCatalog.designSource, null);
assert.equal(malformedCatalog.selectedStyleId, null);
assert.equal(malformedCatalog.confirmedStyleId, null);

const clearSnapshot = createClearedDesignSelectionStateSnapshot(1);
assert.equal(clearSnapshot.designSource, null);
assert.equal(clearSnapshot.confirmedDesignSourceKey, null);
assert.equal(clearSnapshot.confirmedStyleId, null);
assert.equal(clearSnapshot.priceActivatedFabricCode, null);
assert.equal(clearSnapshot.fabricAllocationState.fabricAllocations.length, 0);

assert.equal(
  isDesignStylePricingActive(null, null, "FABRIC-A", "FABRIC-A"),
  false,
  "An uploaded source cannot activate catalog pricing through the legacy style gate.",
);
assert.equal(
  getUploadedDesignSourceKey(uploadReference.designReferenceId),
  uploadedSource.sourceKey,
);

const designStudioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
assert.match(
  designStudioSource,
  /CustomerDesignUploadService\.uploadCustomerDesignDraft/,
  "Step 1 must use the existing secure upload service once the Upload Your Design UI exists.",
);
assert.match(designStudioSource, /CustomerDesignUploadService\.readCustomerDesignDraft/);
assert.match(designStudioSource, /CustomerDesignUploadService\.deleteCustomerDesignDraft/);
assert.match(designStudioSource, /CustomerDesignUploadService\.replaceCustomerDesignDraft/);

console.log("PASS: typed design-source draft persistence foundation");
