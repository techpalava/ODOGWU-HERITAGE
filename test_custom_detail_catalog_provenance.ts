import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type { CustomDetailOption } from "./src/types";
import {
  createCustomDetailCatalogTombstone,
  inspectCustomDetailCatalog,
  isCustomDetailCatalogTombstone,
  normalizeCustomDetailCatalog,
} from "./src/utils/catalogHelpers";

const seedExactZero = SEED_CUSTOM_DETAIL_CATALOG.find(
  (option) => option.priceCents === 0 && !option.requiresEvaluation,
)!;
const seedPositive = SEED_CUSTOM_DETAIL_CATALOG.find(
  (option) => option.priceCents > 0 && !option.requiresEvaluation,
)!;
const seedEvaluation = SEED_CUSTOM_DETAIL_CATALOG.find(
  (option) => option.requiresEvaluation,
)!;

const asAdminRecord = (
  seed: CustomDetailOption,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({ ...seed, ...overrides });

const exactZeroInspection = inspectCustomDetailCatalog([
  asAdminRecord(seedExactZero, { priceCents: 0 }),
]);
const exactZero = exactZeroInspection.byOptionId.get(seedExactZero.id)!;
assert.equal(exactZero.source, "admin");
assert.equal(exactZero.lifecycleStatus, "active");
assert.equal(exactZero.priceStatus, "exact");
assert.equal(exactZero.priceCents, 0);
assert.equal(exactZero.option?.priceCents, 0);

const positiveInspection = inspectCustomDetailCatalog([
  asAdminRecord(seedPositive, { priceCents: 1234 }),
]);
const positive = positiveInspection.byOptionId.get(seedPositive.id)!;
assert.equal(positive.source, "admin");
assert.equal(positive.priceStatus, "exact");
assert.equal(positive.priceCents, 1234);
assert.equal(positive.option?.priceCents, 1234);

for (const missingPrice of [undefined, null]) {
  const record = asAdminRecord(seedPositive);
  if (missingPrice === undefined) delete record.priceCents;
  else record.priceCents = missingPrice;
  const entry = inspectCustomDetailCatalog([record]).byOptionId.get(
    seedPositive.id,
  )!;
  assert.equal(entry.source, "admin");
  assert.equal(entry.lifecycleStatus, "active");
  assert.equal(entry.priceStatus, "missing");
  assert.equal(entry.priceCents, undefined);
  assert.equal(entry.option, undefined);
  assert.equal(
    normalizeCustomDetailCatalog([record]).some(
      (option) => option.id === seedPositive.id,
    ),
    false,
    "missing Admin prices must not inherit a seed price or become selectable",
  );
}

for (const invalidPrice of [-1, 1.5, "1000", Number.NaN, Number.POSITIVE_INFINITY]) {
  const record = asAdminRecord(seedPositive, { priceCents: invalidPrice });
  const entry = inspectCustomDetailCatalog([record]).byOptionId.get(
    seedPositive.id,
  )!;
  assert.equal(entry.priceStatus, "invalid");
  assert.equal(entry.priceCents, undefined);
  assert.equal(entry.option, undefined);
  assert.equal(
    normalizeCustomDetailCatalog([record]).some(
      (option) => option.id === seedPositive.id,
    ),
    false,
    "invalid Admin prices must not inherit a seed price or become selectable",
  );
}

const evaluationRecord = asAdminRecord(seedEvaluation);
delete evaluationRecord.priceCents;
const evaluation = inspectCustomDetailCatalog([evaluationRecord]).byOptionId.get(
  seedEvaluation.id,
)!;
assert.equal(evaluation.priceStatus, "evaluation_required");
assert.equal(evaluation.option?.requiresEvaluation, true);
assert.equal(evaluation.option?.priceCents, 0);

const emptyInspection = inspectCustomDetailCatalog([]);
assert.equal(
  emptyInspection.activeOptions.length,
  SEED_CUSTOM_DETAIL_CATALOG.length,
  "an empty Admin catalog must retain seed bootstrap behavior",
);
assert.equal(
  emptyInspection.entries.every((entry) => entry.source === "seed_fallback"),
  true,
);
assert.deepEqual(
  emptyInspection.activeOptions.map(({ id, priceCents }) => ({ id, priceCents })),
  SEED_CUSTOM_DETAIL_CATALOG.map(({ id, priceCents }) => ({ id, priceCents })),
  "untouched seed prices must remain unchanged",
);

const tombstone = createCustomDetailCatalogTombstone(seedPositive.id);
assert.equal(isCustomDetailCatalogTombstone(tombstone), true);
const reloadedTombstone = JSON.parse(JSON.stringify(tombstone));
const deletedInspection = inspectCustomDetailCatalog([reloadedTombstone]);
const deleted = deletedInspection.byOptionId.get(seedPositive.id)!;
assert.equal(deleted.lifecycleStatus, "explicitly_deleted");
assert.equal(deleted.option, undefined);
assert.equal(
  deletedInspection.activeOptions.some((option) => option.id === seedPositive.id),
  false,
  "a persisted tombstone must suppress its seed option",
);
assert.equal(
  deletedInspection.activeOptions.length,
  SEED_CUSTOM_DETAIL_CATALOG.length - 1,
  "deleting one option must preserve unrelated seed options",
);

const repeatedDelete = inspectCustomDetailCatalog([tombstone, tombstone]);
assert.equal(
  repeatedDelete.entries.filter((entry) => entry.optionId === seedPositive.id)
    .length,
  1,
  "repeated deletion must remain idempotent",
);

const restoredRecord = asAdminRecord(seedPositive, {
  label: "Restored Admin Option",
  priceCents: 4321,
});
const restored = inspectCustomDetailCatalog([tombstone, restoredRecord]);
assert.equal(restored.byOptionId.get(seedPositive.id)?.source, "admin");
assert.equal(restored.byOptionId.get(seedPositive.id)?.lifecycleStatus, "active");
assert.equal(restored.byOptionId.get(seedPositive.id)?.option?.priceCents, 4321);
assert.equal(
  restored.byOptionId.get(seedPositive.id)?.option?.label,
  "Restored Admin Option",
  "saving an active record with the stable ID must supersede its tombstone",
);

const customOption: CustomDetailOption = {
  ...seedPositive,
  id: "admin-custom-valid-option",
  label: "Admin Custom Valid Option",
  priceCents: 777,
};
const customInspection = inspectCustomDetailCatalog([customOption]);
assert.equal(customInspection.byOptionId.get(customOption.id)?.source, "admin");
assert.equal(
  customInspection.activeOptions.some((option) => option.id === customOption.id),
  true,
);
assert.equal(
  customInspection.byOptionId.has("unknown-absent-custom-option"),
  false,
  "unknown absent custom options must not be fabricated",
);

const malformedInspection = inspectCustomDetailCatalog([
  null,
  "invalid",
  { label: "missing stable ID", priceCents: 0 },
  { id: "malformed-known-id", priceCents: 0 },
]);
assert.equal(malformedInspection.malformedRecordsWithoutId, 3);
assert.equal(
  malformedInspection.byOptionId.get("malformed-known-id")?.lifecycleStatus,
  "malformed",
);

const legacyPartialOverride = normalizeCustomDetailCatalog([
  { id: seedPositive.id, label: "Legacy label", priceCents: 2468 },
]);
assert.equal(
  legacyPartialOverride.find((option) => option.id === seedPositive.id)?.label,
  "Legacy label",
);
assert.equal(
  legacyPartialOverride.find((option) => option.id === seedPositive.id)
    ?.priceCents,
  2468,
  "legacy partial Admin records must retain valid explicit pricing",
);
assert.equal(
  normalizeCustomDetailCatalog([
    asAdminRecord(seedExactZero, { priceCents: 0 }),
  ]).some((option) => option.id === seedExactZero.id),
  true,
  "existing valid zero-priced details must remain selectable",
);

const databaseSource = readFileSync(
  "src/components/DatabaseView.tsx",
  "utf8",
);
const storageSource = readFileSync("src/services/storageService.ts", "utf8");
const rules = readFileSync("firestore.rules", "utf8");
assert.match(databaseSource, /StorageService\.deleteCatalogOption\(id\)/);
assert.match(storageSource, /createCustomDetailCatalogTombstone\(optionId\)/);
assert.match(
  rules,
  /match \/custom_detail_catalog\/\{document=\*\*\} \{\s*allow read: if true;\s*allow write: if isAdmin\(\);/,
  "catalog writes, including tombstones, must remain Admin-only",
);

console.log("Custom Details catalog provenance verification passed.");
