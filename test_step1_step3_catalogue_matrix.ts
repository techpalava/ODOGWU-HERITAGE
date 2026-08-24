/**
 * Step 1 → Step 3 catalogue matrix regressions against live-shaped styles.
 * Uses resolveFutureDesignStyleCompatibility / resolveStep1CatalogueCoverage directly.
 */
import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { legacyCompatMap } from "./src/utils/legacyCompat";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import {
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
} from "./src/utils/designStudioFutureDesignStyle";
import { resolveStep1CatalogueCoverage } from "./src/utils/step1CatalogueCoverage";
import { reconcileFutureFabricAllocationState } from "./src/utils/designStudioFutureFabricStage";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  FabricAllocationState,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";

const AUDIENCES: CustomDetailDemographic[][] = [
  ["male"],
  ["female"],
  ["unisex"],
  ["male", "female"],
  ["male", "unisex"],
  ["female", "unisex"],
  ["male", "female", "unisex"],
];

/** Mirrors production Firestore styles after legacyCompatMap (case + composition). */
const rawLiveShapedStyles: StyleCategory[] = [
  {
    id: "casual-native-1",
    name: "Casual Native",
    description: "",
    gender: "MALE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "classic-ankara-kaftan-set-traditional-embellished-boubou-1",
    name: "Classic Ankara Kaftan Set & Traditional Embellished Boubou",
    description: "",
    gender: "COUPLE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "classic-v-neck-maxi-dress-1",
    name: "Classic V-Neck Maxi Dress",
    description: "",
    gender: "FEMALE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "classic-v-neck-maxi-dress-2",
    name: "Classic V-Neck Maxi Dress 2",
    description: "",
    gender: "FEMALE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "contemporary-ankara-1",
    name: "Contemporary Ankara",
    description: "",
    gender: "UNISEX" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "floral-senator-shirt-contemporary-shift-dress-1",
    name: "Floral Senator Shirt & Contemporary Shift Dress",
    description: "",
    gender: "COUPLE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "royal-senator-1",
    name: "Royal Senator",
    description: "",
    gender: "MALE" as StyleCategory["gender"],
    options: [],
  },
  {
    id: "royal-senator-2",
    name: "Royal Senator",
    description: "",
    gender: "MALE" as StyleCategory["gender"],
    options: [],
  },
];

const styles = rawLiveShapedStyles.map((style) =>
  legacyCompatMap("styles", style),
);

const selection = (
  garmentTypes: CanonicalPhysicalGarmentType[],
  demographics: CustomDetailDemographic[],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic: demographics[0] || null,
  audienceSelection: { schemaVersion: 1, demographics },
  constructionByGarment: {},
});

const garmentCombos = (): CanonicalPhysicalGarmentType[][] => {
  const types = [...STEP_1_SELECTABLE_GARMENT_TYPES];
  const out: CanonicalPhysicalGarmentType[][] = [];
  for (let mask = 1; mask < 1 << types.length; mask++) {
    const combo: CanonicalPhysicalGarmentType[] = [];
    for (let i = 0; i < types.length; i++) {
      if (mask & (1 << i)) combo.push(types[i]!);
    }
    out.push(combo);
  }
  return out;
};

const expectedReachableGarmentCombos = new Set([
  "shirt",
  "trouser",
  "shirt+trouser",
  "dress",
  "shirt+dress",
  "kaftan",
  "dress+kaftan",
  "full_length_gown",
]);

// Agbada is intentionally hidden from Step 1.
assert.equal(STEP_1_SELECTABLE_GARMENT_TYPES.includes("agbada" as any), false);
assert.equal(STEP_1_SELECTABLE_GARMENT_TYPES.length, 8);

// Uppercase live gender still resolves after legacyCompat / demographic hardening.
assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    style: styles.find((s) => s.id === "casual-native-1")!,
  }).status,
  "compatible",
);
assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    style: {
      ...rawLiveShapedStyles[0]!,
      gender: "MALE" as StyleCategory["gender"],
      fabricCapacityComposition: [
        createStyleBaseGarmentSpec("shirt"),
        createStyleBaseGarmentSpec("trouser"),
      ],
    },
  }).status,
  "compatible",
);

// Supported singles / pairs
for (const [garments, demos, minCount] of [
  [["shirt"], ["male"], 1],
  [["trouser"], ["male"], 1],
  [["shirt", "trouser"], ["male"], 1],
  [["dress"], ["female"], 1],
  [["shirt", "dress"], ["female"], 1],
  [["kaftan"], ["male"], 1],
  [["dress", "kaftan"], ["unisex"], 1],
  [["full_length_gown"], ["female"], 1],
] as Array<[CanonicalPhysicalGarmentType[], CustomDetailDemographic[], number]>) {
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(garments, demos),
    styles,
  });
  assert.equal(coverage.status, "matched", garments.join("+"));
  assert.ok(coverage.compatibleCount >= minCount, garments.join("+"));
}

// Unsupported singles are explicit Step 1 dead ends
for (const garment of ["skirt", "standard_shorts", "bum_shorts"] as const) {
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection([garment], ["female"]),
    styles,
  });
  assert.equal(coverage.status, "no_match", garment);
  assert.match(coverage.customerDetail || "", /Upload Your Own Design/);
}

// Demographic mismatch explicit (gown + male only)
{
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["male"]),
    styles,
  });
  assert.equal(coverage.status, "no_match");
  const rejection = resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(["full_length_gown"], ["male"]),
    style: styles.find((s) => s.id === "classic-v-neck-maxi-dress-1")!,
  });
  assert.equal(rejection.code, "DEMOGRAPHIC_MISMATCH");
}

// Stale kaftan fabricUnits=2 is malformed / rejected
{
  const stale = resolveFutureDesignStyleCompatibility({
    garmentTypeSelection: selection(["kaftan"], ["male"]),
    style: {
      id: "stale-kaftan",
      name: "Stale Kaftan",
      description: "",
      gender: "male",
      options: [],
      fabricCapacityComposition: [
        { key: "base:kaftan", garmentType: "kaftan", fabricUnits: 2 },
      ],
    },
  });
  assert.equal(stale.code, "STYLE_COMPOSITION_MALFORMED");
}

// Full matrix: reachable garment combos match live catalogue coverage set
{
  const reachable = new Set<string>();
  for (const garments of garmentCombos()) {
    let any = false;
    for (const demographics of AUDIENCES) {
      const coverage = resolveStep1CatalogueCoverage({
        garmentTypeSelection: selection(garments, demographics),
        styles,
      });
      if (coverage.status === "matched") any = true;
    }
    const key = garments.join("+");
    if (any) reachable.add(key);
  }
  assert.deepEqual(
    [...reachable].sort(),
    [...expectedReachableGarmentCombos].sort(),
  );
  assert.equal(garmentCombos().length, 255);
  assert.equal(reachable.size, 8);
}

// Compatible Select Design path: reconcile reports selected after choosing id
{
  const selected = reconcileFutureDesignStyleSelection({
    selectedStyleId: "contemporary-ankara-1",
    styles,
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
  });
  assert.equal(selected.status, "selected");
  assert.equal(selected.selectedStyleId, "contemporary-ankara-1");
  assert.equal(selected.compatibility?.status, "compatible");
}

// Empty styles vs zero compatible vs compatible vs loading
{
  // 1. loading + styles=[] => loading, no zero-match warning
  const loadingEmpty = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [],
    stylesLoadState: "loading",
  });
  assert.equal(loadingEmpty.status, "loading");
  assert.equal(loadingEmpty.customerHeadline, null);
  assert.equal(loadingEmpty.customerDetail, null);

  // 2. ready + styles=[] => genuine empty catalogue
  const emptyCatalogue = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt"], ["male"]),
    styles: [],
    stylesLoadState: "ready",
  });
  assert.equal(emptyCatalogue.status, "empty_catalogue");
  assert.match(emptyCatalogue.customerDetail || "", /Upload Your Own Design/);

  // 3. ready + compatible => matched, no warning
  const matched = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt"], ["male"]),
    styles,
    stylesLoadState: "ready",
  });
  assert.equal(matched.status, "matched");
  assert.equal(matched.customerHeadline, null);

  // 4. ready + incompatible only => no_match + upload-later warning
  const noMatch = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["skirt"], ["female"]),
    styles,
    stylesLoadState: "ready",
  });
  assert.equal(noMatch.status, "no_match");
  assert.match(noMatch.customerDetail || "", /Upload Your Own Design/);

  // 5. saved Shirt+Trouser+Male while styles initially [] during load
  //    must NOT become upload-only; once styles arrive => matched
  const savedWhileLoading = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [],
    stylesLoadState: "loading",
  });
  assert.equal(savedWhileLoading.status, "loading");
  assert.notEqual(savedWhileLoading.status, "no_match");
  assert.notEqual(savedWhileLoading.status, "empty_catalogue");
  const savedAfterReady = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles,
    stylesLoadState: "ready",
  });
  assert.equal(savedAfterReady.status, "matched");

  // 6–7. demographic supported → unsupported → supported again
  const supported = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["female"]),
    styles,
  });
  assert.equal(supported.status, "matched");
  const unsupported = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["male"]),
    styles,
  });
  assert.equal(unsupported.status, "no_match");
  assert.ok(unsupported.customerHeadline);
  const supportedAgain = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["female"]),
    styles,
  });
  assert.equal(supportedAgain.status, "matched");
  assert.equal(supportedAgain.customerHeadline, null);
}

// Draft hydration: stale kaftan units=2 assignment is dropped (not falsely complete)
{
  const garmentTypeSelection = selection(["kaftan"], ["male"]);
  const staleState: FabricAllocationState = {
    fabricAllocations: [
      {
        allocationId: "alloc-1",
        fabricCode: "ODG-001",
        garmentAssignments: [
          {
            garmentKey: "KAFTAN:kaftan",
            code: "KAFTAN",
            garmentType: "kaftan",
            fabricUnits: 2,
          },
        ],
      },
    ],
    activeAllocationId: "alloc-1",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  const reconciled = reconcileFutureFabricAllocationState({
    state: staleState,
    garmentTypeSelection,
  });
  assert.equal(reconciled.fabricAllocations.length, 0);
}

// Step 2 assignability smoke: all eight garments produce required half/full units
{
  const allEight = selection([...STEP_1_SELECTABLE_GARMENT_TYPES], ["male"]);
  const units = allEight.garmentTypes.reduce((sum, garmentType) => {
    return sum + createStyleBaseGarmentSpec(garmentType).fabricUnits;
  }, 0);
  // 7 half + 1 gown(2) = 9 half-units => ceil(9/2)=5 fabrics minimum when packed
  assert.equal(units, 9);
  assert.equal(Math.ceil(units / 2), 5);
  assert.equal(createStyleBaseGarmentSpec("kaftan").fabricUnits, 1);
  assert.equal(createStyleBaseGarmentSpec("full_length_gown").fabricUnits, 2);
}

console.log("PASS: Step1→Step3 catalogue matrix + coverage regressions");
