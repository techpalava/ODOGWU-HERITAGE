import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { getFabricGarmentLabel } from "./src/engine/FabricCapacityEngine";
import { createCustomerDesignUploadReference } from "./src/services/customerDesignUploadReference";
import type {
  BusinessSettings,
  Fabric,
  FabricAllocation,
  FabricCapacityGarmentSpec,
} from "./src/types";
import { calculateCustomDetailsPriceBreakdown } from "./src/utils/catalogHelpers";
import {
  calculateDesignPricing,
  resolveStructuredBaseGarmentPricing,
} from "./src/utils/designPricing";
import {
  getActiveDesignSelectionPresentation,
  createUploadedDesignSource,
  getConfirmedDesignSourceKeyAfterSourceChange,
  resolveActiveCustomDetailDesignContext,
} from "./src/utils/designSourceState";
import {
  getPriceActivatedFabricCodeAfterDesignSourceChange,
  getPriceActivatedFabricCodeAfterSelection,
  isDesignSourcePricingActive,
} from "./src/utils/designStylePricingActivation";
import { resolveFabricAllocationMaterialPricing } from "./src/utils/fabricAllocationPricing";

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

const makeFabric = (overrides: Partial<Fabric>): Fabric => ({
  code: "FABRIC-DEFAULT",
  name: "Default Fabric",
  description: "Default",
  color: "Green",
  colorHex: "#006b54",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  ...overrides,
});

const hiTarget = makeFabric({
  code: "HI-TARGET",
  name: "Imperial Sapphire Link",
  category: "HiTarget Ankara",
});

const makeUploadedSource = (
  designReferenceId: string,
  fabricCapacityComposition: FabricCapacityGarmentSpec[],
  demographic: "male" | "female" | "unisex" = "unisex",
) =>
  createUploadedDesignSource({
    uploadReference: createCustomerDesignUploadReference({
      ownerUid: "private-test-owner",
      designReferenceId,
      mimeType: "image/png",
      originalFileName: "private-reference.png",
      createdAt: "2026-08-11T00:00:00.000Z",
    }),
    fabricCapacityComposition,
    demographic,
  });

const priceUploadedComposition = (
  source: ReturnType<typeof makeUploadedSource>,
  customDetails: Record<string, string | string[]> = {},
  materialPricing?: ReturnType<typeof resolveFabricAllocationMaterialPricing>,
) => {
  const designContext = resolveActiveCustomDetailDesignContext(source, null);
  assert.ok(designContext && "kind" in designContext && designContext.kind === "uploaded");
  return calculateDesignPricing({
    route: "community",
    design: { customDetails },
    fabric: hiTarget,
    materialPricing:
      materialPricing?.status === "resolved" ? materialPricing : undefined,
    allowUnresolvedMaterialPricing: true,
    designContext,
    baseGarmentComposition: source.fabricCapacityComposition,
    catalog: SEED_CUSTOM_DETAIL_CATALOG,
    businessSettings,
  });
};

const shirtTrouser = makeUploadedSource(
  "uploaded-shirt-trouser",
  [
    { key: "shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  "male",
);
const shirtTrouserContext = resolveActiveCustomDetailDesignContext(
  shirtTrouser,
  null,
);
assert.ok(shirtTrouserContext && "kind" in shirtTrouserContext);

const isUploadedPricingActive = (
  confirmedDesignSourceKey: string | null,
  selectedFabricCode: string | null,
  priceActivatedFabricCode: string | null,
) =>
  isDesignSourcePricingActive({
    designSource: shirtTrouser,
    selectedStyle: null,
    confirmedStyleId: null,
    confirmedDesignSourceKey,
    selectedFabricCode,
    priceActivatedFabricCode,
    step1GarmentTypes: ["shirt", "trouser"],
  });

assert.equal(isUploadedPricingActive(null, null, null), false);
assert.equal(isUploadedPricingActive(shirtTrouser.sourceKey, null, null), false);
assert.equal(isUploadedPricingActive(shirtTrouser.sourceKey, hiTarget.code, null), false);
assert.equal(
  isUploadedPricingActive(
    shirtTrouser.sourceKey,
    hiTarget.code,
    hiTarget.code,
  ),
  true,
  "Uploaded pricing activates only after the existing Fabric approval state matches.",
);

const shirtTrouserDefaults = resolveStructuredBaseGarmentPricing(
  shirtTrouser.fabricCapacityComposition,
);
assert.equal(shirtTrouserDefaults.status, "resolved");
const expectedShirtTrouserPrice = calculateCustomDetailsPriceBreakdown(
  shirtTrouserDefaults.defaultSelections,
  SEED_CUSTOM_DETAIL_CATALOG,
).clothingPrice;
const shirtTrouserPricing = priceUploadedComposition(shirtTrouser);
assert.ok(shirtTrouserPricing);
assert.equal(shirtTrouserPricing.baseGarmentPricingStatus, "resolved");
assert.equal(shirtTrouserPricing.clothingPrice, expectedShirtTrouserPrice);

const trouserBeltPricing = priceUploadedComposition(shirtTrouser, {
  trouser_fastening: "trouser_belt",
});
assert.ok(trouserBeltPricing);
assert.equal(
  trouserBeltPricing.clothingPrice,
  calculateCustomDetailsPriceBreakdown(
    {
      customDetails: {
        ...(shirtTrouserDefaults.defaultSelections.customDetails || {}),
        trouser_fastening: "trouser_belt",
      },
    },
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  "Uploaded custom details reuse the existing catalog pricing pipeline.",
);

const kaftan = makeUploadedSource(
  "uploaded-kaftan",
  [{ key: "kaftan", garmentType: "kaftan", fabricUnits: 1 }],
  "male",
);
const kaftanPricing = priceUploadedComposition(kaftan);
assert.ok(kaftanPricing);
assert.equal(
  kaftanPricing.clothingPrice,
  calculateCustomDetailsPriceBreakdown(
    resolveStructuredBaseGarmentPricing(kaftan.fabricCapacityComposition)
      .defaultSelections,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  "Kaftan is priced once as a half-capacity garment.",
);

const gown = makeUploadedSource(
  "uploaded-gown",
  [{ key: "gown", garmentType: "full_length_gown", fabricUnits: 2 }],
  "female",
);
const gownPricing = priceUploadedComposition(gown);
assert.ok(gownPricing);
assert.equal(
  gownPricing.clothingPrice,
  calculateCustomDetailsPriceBreakdown(
    resolveStructuredBaseGarmentPricing(gown.fabricCapacityComposition)
      .defaultSelections,
    SEED_CUSTOM_DETAIL_CATALOG,
  ).clothingPrice,
  "A full-length gown is priced once even though it consumes two fabric units.",
);

const shirtTrouserSkirt = makeUploadedSource(
  "uploaded-shirt-trouser-skirt",
  [
    ...shirtTrouser.fabricCapacityComposition,
    { key: "skirt", garmentType: "skirt", fabricUnits: 1 },
  ],
  "unisex",
);
const singleAllocation = resolveFabricAllocationMaterialPricing(
  [
    {
      allocationId: "allocation-1",
      fabricCode: hiTarget.code,
      garmentAssignments: [
        { garmentKey: "shirt", code: "shirt", garmentType: "shirt", fabricUnits: 1 },
        { garmentKey: "trouser", code: "trouser", garmentType: "trouser", fabricUnits: 1 },
      ],
    },
  ],
  [hiTarget],
);
const twoAllocations = resolveFabricAllocationMaterialPricing(
  [
    ...([
      {
        allocationId: "allocation-1",
        fabricCode: hiTarget.code,
        garmentAssignments: [
          { garmentKey: "shirt", code: "shirt", garmentType: "shirt" as const, fabricUnits: 1 as const },
          { garmentKey: "trouser", code: "trouser", garmentType: "trouser" as const, fabricUnits: 1 as const },
        ],
      },
    ] as FabricAllocation[]),
    {
      allocationId: "allocation-2",
      fabricCode: hiTarget.code,
      garmentAssignments: [
        { garmentKey: "skirt", code: "skirt", garmentType: "skirt", fabricUnits: 1 },
      ],
    },
  ] as FabricAllocation[],
  [hiTarget],
);
assert.equal(singleAllocation.status, "resolved");
assert.equal(twoAllocations.status, "resolved");
if (twoAllocations.status !== "resolved") {
  throw new Error("Expected two valid material allocations.");
}
assert.equal(twoAllocations.allocationLines.length, 2);
assert.equal(twoAllocations.allocationLines[0].fabricCode, hiTarget.code);
assert.equal(twoAllocations.allocationLines[1].fabricCode, hiTarget.code);
assert.notEqual(
  twoAllocations.allocationLines[0].allocationId,
  twoAllocations.allocationLines[1].allocationId,
  "The same fabric remains a distinct Active Selection row per allocation ID.",
);
const oneAllocationPricing = priceUploadedComposition(
  shirtTrouserSkirt,
  {},
  singleAllocation,
);
const twoAllocationPricing = priceUploadedComposition(
  shirtTrouserSkirt,
  {},
  twoAllocations,
);
assert.ok(oneAllocationPricing && twoAllocationPricing);
assert.equal(
  twoAllocationPricing.clothingPrice,
  oneAllocationPricing.clothingPrice,
  "A second Fabric Allocation must not multiply base garment pricing.",
);
assert.equal(twoAllocationPricing.fabricAllocationCount, 2);
assert.equal(
  twoAllocationPricing.totalFabricMaterialPrice,
  singleAllocation.status === "resolved"
    ? singleAllocation.totalMaterialPrice * 2
    : 0,
  "Separate allocation IDs retain their separate material charges.",
);

const unpricedSource = makeUploadedSource(
  "uploaded-unpriced",
  [{ key: "other", garmentType: "other", fabricUnits: 1 }],
);
const unpricedPricing = priceUploadedComposition(unpricedSource);
assert.ok(unpricedPricing);
assert.equal(unpricedPricing.baseGarmentPricingStatus, "unresolved");
assert.deepEqual(unpricedPricing.unresolvedBaseGarmentTypes, ["other"]);

const replacementSource = makeUploadedSource(
  "uploaded-replacement",
  shirtTrouser.fabricCapacityComposition,
  "male",
);
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(
    shirtTrouser,
    shirtTrouser.sourceKey,
    replacementSource,
  ),
  null,
);
assert.equal(
  getPriceActivatedFabricCodeAfterDesignSourceChange({
    currentSource: shirtTrouser,
    currentConfirmedDesignSourceKey: shirtTrouser.sourceKey,
    currentPriceActivatedFabricCode: hiTarget.code,
    nextSource: replacementSource,
  }),
  null,
);
const changedComposition = makeUploadedSource(
  "uploaded-shirt-trouser",
  shirtTrouserSkirt.fabricCapacityComposition,
  "unisex",
);
assert.equal(
  getConfirmedDesignSourceKeyAfterSourceChange(
    shirtTrouser,
    shirtTrouser.sourceKey,
    changedComposition,
  ),
  null,
  "Changing composition under the same reference invalidates confirmation.",
);
assert.equal(
  getPriceActivatedFabricCodeAfterSelection(hiTarget.code, "NEW-FABRIC"),
  null,
);

const activeSelection = getActiveDesignSelectionPresentation(
  shirtTrouser,
  null,
);
assert.deepEqual(activeSelection, {
  label: "Your Uploaded Design",
  includedGarmentLabels: ["Shirt", "Trouser"],
  isUploaded: true,
});
assert.equal(
  JSON.stringify(activeSelection).includes("private-test-owner"),
  false,
  "Customer-facing selection presentation must not expose upload metadata.",
);
assert.deepEqual(
  shirtTrouser.fabricCapacityComposition.map((spec) =>
    getFabricGarmentLabel(spec.garmentType),
  ),
  activeSelection.includedGarmentLabels,
);

const studioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
const candidateSource = readFileSync(
  fileURLToPath(new URL("./src/utils/futureOrderCandidate.ts", import.meta.url)),
  "utf8",
);
assert.match(studioSource, /createUploadedDesignSourceWhenReady/);
assert.match(studioSource, /source: activeFutureDesignSource/);
assert.match(
  studioSource,
  /!activeUploadedDesignSource \|\| isFutureUploadedDesignPricingActive/,
  "Uploaded construction pricing must remain inactive until Fabric confirmation.",
);
assert.match(studioSource, /setFuturePriceActivatedFabricCode\(null\)/);
assert.match(studioSource, /setFuturePriceActivatedFabricCode\(futurePrimaryFabricCode\)/);
assert.match(candidateSource, /UNSUPPORTED_FUTURE_SOURCE/);
assert.match(candidateSource, /source\?\.kind === "catalog"/);
assert.match(
  candidateSource,
  /This design source is not supported in the future order review yet\./,
  "Uploaded designs remain fail-closed until their secure future adapter exists.",
);

console.log("PASS: uploaded design pricing domain and future fail-closed boundary");
