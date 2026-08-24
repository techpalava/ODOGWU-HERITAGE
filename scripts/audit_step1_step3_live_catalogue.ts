/**
 * READ-ONLY live catalogue audit for Step 1→3 compatibility.
 * Uses the same public Firestore styles/fabrics collections the production app reads.
 * Does NOT mutate Firestore.
 */
import { writeFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import committedStagingConfig from "../firebase-applet-config.json";
import { legacyCompatMap } from "../src/utils/legacyCompat";
import {
  FABRIC_GARMENT_CAPACITY_UNITS,
} from "../src/config/StyleFabricCapacityConfig";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "../src/utils/garmentConstructionPricing";
import {
  resolveFutureDesignStyleCompatibility,
  type FutureDesignStyleCompatibilityCode,
} from "../src/utils/designStudioFutureDesignStyle";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  Fabric,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../src/types";

const app = initializeApp({
  apiKey: committedStagingConfig.apiKey,
  authDomain: committedStagingConfig.authDomain,
  projectId: committedStagingConfig.projectId,
  storageBucket: committedStagingConfig.storageBucket,
  messagingSenderId: committedStagingConfig.messagingSenderId,
  appId: committedStagingConfig.appId,
});
const db = getFirestore(app, committedStagingConfig.firestoreDatabaseId);

const AUDIENCE_COMBOS: CustomDetailDemographic[][] = [
  ["male"],
  ["female"],
  ["unisex"],
  ["male", "female"],
  ["male", "unisex"],
  ["female", "unisex"],
  ["male", "female", "unisex"],
];

const garmentCombos = (): CanonicalPhysicalGarmentType[][] => {
  const types = [...STEP_1_SELECTABLE_GARMENT_TYPES];
  const out: CanonicalPhysicalGarmentType[][] = [];
  const n = types.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const combo: CanonicalPhysicalGarmentType[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) combo.push(types[i]!);
    }
    out.push(combo);
  }
  return out;
};

const selectionFor = (
  garmentTypes: CanonicalPhysicalGarmentType[],
  demographics: CustomDetailDemographic[],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic: demographics[0] || null,
  audienceSelection: {
    schemaVersion: 1,
    demographics,
  },
  constructionByGarment: {},
});

const fetchCollection = async <T>(name: string): Promise<T[]> => {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((doc) =>
    legacyCompatMap(name, { id: doc.id, ...(doc.data() as object) } as T),
  );
};

const styles = await fetchCollection<StyleCategory>("styles");
const fabrics = await fetchCollection<Fabric>("fabrics");

type StyleAuditRow = {
  id: string;
  name: string;
  active: unknown;
  isActive: unknown;
  gender: unknown;
  targetDemographic: unknown;
  representedGenders: unknown;
  featuresMaleAndFemale: unknown;
  fabricCapacityComposition: unknown;
  staleKaftanUnits2: boolean;
  capacityUnitMismatches: Array<{
    garmentType: string;
    fabricUnits: unknown;
    expected: number | null;
  }>;
  failureCodesSample: FutureDesignStyleCompatibilityCode[];
};

const styleAudits: StyleAuditRow[] = styles.map((style) => {
  const raw = style as StyleCategory & {
    active?: unknown;
    isActive?: unknown;
  };
  const composition = style.fabricCapacityComposition || [];
  const capacityUnitMismatches = composition
    .filter((spec) => {
      const expected =
        FABRIC_GARMENT_CAPACITY_UNITS[
          spec.garmentType as keyof typeof FABRIC_GARMENT_CAPACITY_UNITS
        ];
      return expected !== undefined && expected !== spec.fabricUnits;
    })
    .map((spec) => ({
      garmentType: String(spec.garmentType),
      fabricUnits: spec.fabricUnits,
      expected:
        FABRIC_GARMENT_CAPACITY_UNITS[
          spec.garmentType as keyof typeof FABRIC_GARMENT_CAPACITY_UNITS
        ] ?? null,
    }));
  const staleKaftanUnits2 = composition.some(
    (spec) => spec.garmentType === "kaftan" && spec.fabricUnits === 2,
  );

  // Probe with male + shirt for a sample of failure codes across styles
  const probeCodes = new Set<FutureDesignStyleCompatibilityCode>();
  for (const garments of [
    ["shirt"],
    ["trouser"],
    ["kaftan"],
    ["dress"],
    ["full_length_gown"],
    ["shirt", "trouser"],
    ["kaftan", "dress"],
  ] as CanonicalPhysicalGarmentType[][]) {
    for (const demos of AUDIENCE_COMBOS) {
      const result = resolveFutureDesignStyleCompatibility({
        garmentTypeSelection: selectionFor(garments, demos),
        style,
      });
      if (result.status !== "compatible") probeCodes.add(result.code);
    }
  }

  return {
    id: style.id,
    name: style.name,
    active: raw.active,
    isActive: raw.isActive,
    gender: style.gender,
    targetDemographic: style.targetDemographic,
    representedGenders: style.customDetailConfig?.representedGenders,
    featuresMaleAndFemale:
      style.customDetailConfig?.featuresMaleAndFemale ??
      style.featuresMaleAndFemale,
    fabricCapacityComposition: composition,
    staleKaftanUnits2,
    capacityUnitMismatches,
    failureCodesSample: [...probeCodes],
  };
});

const combos = garmentCombos();
type MatrixRow = {
  garments: string[];
  demographics: string[];
  compatibleCount: number;
  compatibleStyles: Array<{ id: string; name: string }>;
  rejectionTallies: Record<string, number>;
};

const matrix: MatrixRow[] = [];
let reachableCombos = 0;
let deadEndCombos = 0;

for (const garments of combos) {
  for (const demographics of AUDIENCE_COMBOS) {
    const selection = selectionFor(garments, demographics);
    const rejectionTallies: Record<string, number> = {};
    const compatibleStyles: Array<{ id: string; name: string }> = [];
    for (const style of styles) {
      const result = resolveFutureDesignStyleCompatibility({
        garmentTypeSelection: selection,
        style,
      });
      if (result.status === "compatible") {
        compatibleStyles.push({ id: style.id, name: style.name });
      } else {
        rejectionTallies[result.code] =
          (rejectionTallies[result.code] || 0) + 1;
      }
    }
    const row: MatrixRow = {
      garments,
      demographics,
      compatibleCount: compatibleStyles.length,
      compatibleStyles,
      rejectionTallies,
    };
    matrix.push(row);
    if (compatibleStyles.length > 0) reachableCombos += 1;
    else deadEndCombos += 1;
  }
}

// Single-garment coverage by demographic
const singleGarmentCoverage = STEP_1_SELECTABLE_GARMENT_TYPES.map(
  (garment) => {
    const byDemo = AUDIENCE_COMBOS.map((demographics) => {
      const compatible = styles
        .filter(
          (style) =>
            resolveFutureDesignStyleCompatibility({
              garmentTypeSelection: selectionFor([garment], demographics),
              style,
            }).status === "compatible",
        )
        .map((s) => ({ id: s.id, name: s.name }));
      return {
        demographics,
        compatibleCount: compatible.length,
        compatibleStyles: compatible,
      };
    });
    return { garment, byDemo };
  },
);

const fabricIssues = fabrics.map((fabric) => {
  const code = typeof fabric.code === "string" ? fabric.code.trim() : "";
  const stockStatus = fabric.stockStatus;
  const price =
    typeof fabric.price === "number" && Number.isFinite(fabric.price)
      ? fabric.price
      : null;
  const issues: string[] = [];
  if (!code) issues.push("missing_code");
  if (stockStatus === "HIDDEN") issues.push("HIDDEN");
  if (stockStatus === "OUT_OF_STOCK") issues.push("OUT_OF_STOCK");
  if (stockStatus === "LOW_STOCK") issues.push("LOW_STOCK");
  if (stockStatus === "IN_STOCK") issues.push("IN_STOCK");
  if (price === null || price <= 0) issues.push("missing_or_invalid_price");
  return {
    id: fabric.id || code,
    code,
    name: fabric.name,
    stockStatus,
    stock: fabric.stock,
    reservedStock: (fabric as Fabric & { reservedStock?: unknown }).reservedStock,
    price,
    issues,
  };
});

const codes = fabrics
  .map((f) => (typeof f.code === "string" ? f.code.trim() : ""))
  .filter(Boolean);
const duplicateCodes = [
  ...new Set(
    codes.filter((code, index) => codes.indexOf(code) !== index),
  ),
];

const selectableFabrics = fabricIssues.filter(
  (f) =>
    (f.stockStatus === "IN_STOCK" || f.stockStatus === "LOW_STOCK") &&
    f.price !== null &&
    f.price > 0 &&
    !f.issues.includes("HIDDEN"),
);

const reachableByGarmentOnly = new Map<string, number>();
for (const row of matrix) {
  const key = row.garments.join("+");
  const prev = reachableByGarmentOnly.get(key) || 0;
  if (row.compatibleCount > 0) {
    reachableByGarmentOnly.set(key, prev + 1);
  } else if (!reachableByGarmentOnly.has(key)) {
    reachableByGarmentOnly.set(key, 0);
  }
}

const garmentCombosWithAnyAudience = [...reachableByGarmentOnly.entries()].map(
  ([garments, audienceHits]) => ({
    garments,
    audiencesWithCatalogue: audienceHits,
    hasAnyCatalogue: audienceHits > 0,
  }),
);

const summary = {
  fetchedAt: new Date().toISOString(),
  projectId: committedStagingConfig.projectId,
  databaseId: committedStagingConfig.firestoreDatabaseId,
  step1SelectableGarments: STEP_1_SELECTABLE_GARMENT_TYPES,
  agbadaVisibleInStep1: STEP_1_SELECTABLE_GARMENT_TYPES.includes(
    "agbada" as CanonicalPhysicalGarmentType,
  ),
  styleCount: styles.length,
  fabricCount: fabrics.length,
  garmentComboCount: combos.length,
  audienceComboCount: AUDIENCE_COMBOS.length,
  matrixRows: matrix.length,
  reachableStateCount: reachableCombos,
  deadEndStateCount: deadEndCombos,
  stylesWithStaleKaftanUnits2: styleAudits.filter((s) => s.staleKaftanUnits2),
  stylesWithCapacityMismatches: styleAudits.filter(
    (s) => s.capacityUnitMismatches.length > 0,
  ),
  singleGarmentCoverage,
  garmentCombosWithAnyAudience: garmentCombosWithAnyAudience.filter(
    (row) => !row.hasAnyCatalogue,
  ),
  garmentCombosReachableCount: garmentCombosWithAnyAudience.filter(
    (row) => row.hasAnyCatalogue,
  ).length,
  garmentCombosDeadCount: garmentCombosWithAnyAudience.filter(
    (row) => !row.hasAnyCatalogue,
  ).length,
  duplicateFabricCodes: duplicateCodes,
  selectableFabricCount: selectableFabrics.length,
  fabricIssueSummary: {
    HIDDEN: fabricIssues.filter((f) => f.issues.includes("HIDDEN")).length,
    OUT_OF_STOCK: fabricIssues.filter((f) =>
      f.issues.includes("OUT_OF_STOCK"),
    ).length,
    LOW_STOCK: fabricIssues.filter((f) => f.issues.includes("LOW_STOCK"))
      .length,
    IN_STOCK: fabricIssues.filter((f) => f.issues.includes("IN_STOCK")).length,
    missing_or_invalid_price: fabricIssues.filter((f) =>
      f.issues.includes("missing_or_invalid_price"),
    ).length,
    missing_code: fabricIssues.filter((f) => f.issues.includes("missing_code"))
      .length,
  },
  styleAudits,
  // Keep full matrix for tooling; console prints summary only.
};

writeFileSync(
  "tmp_step1_step3_live_audit.json",
  JSON.stringify({ summary, matrix, fabricIssues, selectableFabrics }, null, 2),
);

console.log(
  JSON.stringify(
    {
      projectId: summary.projectId,
      styleCount: summary.styleCount,
      fabricCount: summary.fabricCount,
      matrixRows: summary.matrixRows,
      reachableStateCount: summary.reachableStateCount,
      deadEndStateCount: summary.deadEndStateCount,
      stylesWithStaleKaftanUnits2: summary.stylesWithStaleKaftanUnits2.map(
        (s) => ({ id: s.id, name: s.name }),
      ),
      stylesWithCapacityMismatches: summary.stylesWithCapacityMismatches.map(
        (s) => ({
          id: s.id,
          name: s.name,
          mismatches: s.capacityUnitMismatches,
        }),
      ),
      singleGarmentCoverage: summary.singleGarmentCoverage.map((row) => ({
        garment: row.garment,
        byDemo: row.byDemo.map((d) => ({
          demographics: d.demographics.join("+"),
          compatibleCount: d.compatibleCount,
          styles: d.compatibleStyles.map((s) => s.name),
        })),
      })),
      deadGarmentCombos: summary.garmentCombosWithAnyAudience.map(
        (r) => r.garments,
      ),
      reachableGarmentCombos: garmentCombosWithAnyAudience
        .filter((row) => row.hasAnyCatalogue)
        .map((r) => r.garments),
      selectableFabricCount: summary.selectableFabricCount,
      fabricIssueSummary: summary.fabricIssueSummary,
      duplicateFabricCodes: summary.duplicateFabricCodes,
      styleNames: styleAudits.map((s) => ({
        id: s.id,
        name: s.name,
        gender: s.gender,
        composition: (s.fabricCapacityComposition as any[])?.map(
          (spec: any) => `${spec.garmentType}:${spec.fabricUnits}`,
        ),
        active: s.active,
        isActive: s.isActive,
        representedGenders: s.representedGenders,
        featuresMaleAndFemale: s.featuresMaleAndFemale,
        failureCodesSample: s.failureCodesSample,
      })),
    },
    null,
    2,
  ),
);
