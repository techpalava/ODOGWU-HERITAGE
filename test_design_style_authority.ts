import assert from "node:assert/strict";
import {
  applyLegacyStyleFabricCapacityConfig,
  createStyleBaseGarmentSpec,
} from "./src/config/StyleFabricCapacityConfig";
import type { StyleCategory } from "./src/types";
import {
  createLegacyDesignStyleMigrationDraft,
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectPublishedDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
  type DesignStyleLifecycle,
} from "./src/utils/designStyleAuthority";

const baseStyle = (overrides: Partial<StyleCategory> = {}): StyleCategory => ({
  id: "authority-style-1",
  name: "Authority Style",
  description: "A published style controlled by Admin authority.",
  gender: "unisex",
  options: ["Standard"],
  image: "https://example.test/style.webp",
  outfitType: "Senator Set",
  garmentComposition: "2-Piece Set",
  fabricCategory: "Any",
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "neck", "trousers"],
    requiredSelectionGroups: ["shirt_construction", "trouser_fastening"],
    enabled: true,
  },
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: true,
    hasMonogramTrimming: false,
  },
  monogramCuffEligible: true,
  embroideryProminence: "heavy",
  defaultGarmentDetails: {},
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const createRecord = (
  lifecycle: DesignStyleLifecycle = "published",
  currentRecord: AuthoritativeDesignStyleRecordV1 | null = null,
  style = baseStyle(),
) =>
  prepareAuthoritativeDesignStyleRecord({
    style,
    lifecycle,
    displayOrder: 3,
    referenceComposition: {
      status: "known",
      garmentTypes: ["shirt", "trouser"],
    },
    currentRecord,
  });

const published = createRecord();
assert.equal(
  parseAuthoritativeDesignStyleRecord(published.id, published).status,
  "valid",
);
assert.equal(
  parseAuthoritativeDesignStyleRecord("different-id", published).status,
  "invalid",
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(published.id, {
    ...published,
    schemaVersion: 2,
  }).status,
  "invalid",
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(published.id, {
    ...published,
    unexpected: true,
  }).status,
  "invalid",
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(published.id, {
    ...published,
    eligibilityFingerprint: "fabricated",
  }).status,
  "invalid",
);

for (const lifecycle of [
  "draft",
  "published",
  "disabled",
  "archived",
] as const) {
  const record = createRecord(lifecycle);
  assert.equal(
    projectPublishedDesignStyleRecord(record) !== null,
    lifecycle === "published",
  );
}

const renamed = createRecord(
  "published",
  published,
  baseStyle({ name: "Authority Style Renamed" }),
);
assert.equal(renamed.publicRevision, published.publicRevision + 1);
assert.equal(renamed.eligibilityRevision, published.eligibilityRevision);
assert.equal(renamed.eligibilityFingerprint, published.eligibilityFingerprint);

const imageChanged = prepareAuthoritativeDesignStyleRecord({
  style: baseStyle({ image: "https://example.test/new.webp" }),
  lifecycle: "published",
  displayOrder: 9,
  referenceComposition: {
    status: "known",
    garmentTypes: ["shirt"],
  },
  currentRecord: renamed,
});
assert.equal(imageChanged.publicRevision, renamed.publicRevision + 1);
assert.equal(imageChanged.eligibilityRevision, renamed.eligibilityRevision);
assert.equal(imageChanged.eligibilityFingerprint, renamed.eligibilityFingerprint);

const garmentEligibilityChanged = createRecord(
  "published",
  published,
  baseStyle({
    fabricCapacityComposition: [createStyleBaseGarmentSpec("dress")],
  }),
);
assert.equal(
  garmentEligibilityChanged.eligibilityRevision,
  published.eligibilityRevision + 1,
);
assert.notEqual(
  garmentEligibilityChanged.eligibilityFingerprint,
  published.eligibilityFingerprint,
);

const demographicChanged = createRecord(
  "published",
  published,
  baseStyle({
    gender: "female",
    customDetailConfig: {
      ...baseStyle().customDetailConfig!,
      representedGenders: ["female"],
      featuresMaleAndFemale: false,
    },
  }),
);
assert.equal(
  demographicChanged.eligibilityRevision,
  published.eligibilityRevision + 1,
);

const adaptabilityChanged = createRecord(
  "published",
  published,
  baseStyle({
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["dress"],
      demographics: ["female"],
    },
  }),
);
assert.equal(
  adaptabilityChanged.eligibilityRevision,
  published.eligibilityRevision + 1,
);

const normalizedUnisexAdaptability = createRecord(
  "published",
  published,
  baseStyle({
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["dress"],
      demographics: ["unisex"],
    },
  }),
);
assert.deepEqual(
  normalizedUnisexAdaptability.eligibility.adaptability.demographics,
  ["female", "male"],
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(published.id, {
    ...published,
    eligibility: {
      ...published.eligibility,
      demographics: ["unisex"],
    },
  }).status,
  "invalid",
);

assert.throws(
  () =>
    prepareAuthoritativeDesignStyleRecord({
      style: baseStyle({ id: "different-id" }),
      lifecycle: "published",
      displayOrder: 3,
      referenceComposition: {
        status: "known",
        garmentTypes: ["shirt"],
      },
      currentRecord: published,
    }),
  /STYLE_ID_IMMUTABLE/,
);

const projection = projectPublishedDesignStyleRecord(published);
assert.ok(projection);
assert.deepEqual(
  projection.fabricCapacityComposition?.map((item) => item.garmentType),
  ["shirt", "trouser"],
);
assert.equal(projection.designStyleAuthority.lifecycle, "published");
assert.equal(
  projection.designStyleAuthority.eligibilityFingerprint,
  published.eligibilityFingerprint,
);
assert.equal(projection.monogramCuffEligible, true);
assert.equal(projection.embroideryProminence, "heavy");

const legacy = createLegacyDesignStyleMigrationDraft(
  "legacy-style-1",
  baseStyle({ id: "legacy-style-1" }),
);
assert.ok(legacy);
assert.equal(legacy.designStyleAuthority.source, "legacy_migration");
assert.equal(legacy.designStyleAuthority.publicRevision, 0);
assert.equal(
  legacy.designStyleAuthority.referenceComposition.status,
  "legacy_unresolved",
);

// A stable ID in the historical map is not migration evidence by itself.
assert.equal(
  createLegacyDesignStyleMigrationDraft("casual-native-1", {
    ...baseStyle({ id: "casual-native-1" }),
    fabricCapacityComposition: undefined,
  }),
  null,
);
assert.equal(
  createLegacyDesignStyleMigrationDraft("legacy-style-1", {
    ...baseStyle({ id: "legacy-style-1" }),
    schemaVersion: 1,
  }),
  null,
);

const missingCanonicalEligibility = {
  ...projection,
  fabricCapacityComposition: undefined,
};
const guarded = applyLegacyStyleFabricCapacityConfig(
  missingCanonicalEligibility,
);
assert.equal(guarded.fabricCapacityComposition, undefined);

console.log(
  "PASS: strict Design Style authority schema, lifecycle, revisions, projection, and legacy boundary",
);
