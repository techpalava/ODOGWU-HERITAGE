/**
 * Xavier (2026-10-29), follow-up to #1185: catalogue / admin-settings
 * defaults and reference seed labels read "Long Shirt" naming instead of
 * "Kaftan" (Kaftan Dress -> Long Dress). Display strings only; stable ids are
 * unchanged so old drafts and Firestore docs keep loading.
 *
 * Run: node scripts/tsxWithViteProductionFirebase.mjs test_kaftan_catalogue_display_labels.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_BUSINESS_SETTINGS,
  DESIGN_COLLECTION,
  MOCK_COMMUNITY_PHOTOS,
  MOCK_HISTORICAL_ORDERS,
  STYLE_CATEGORIES,
} from "./src/data/mockData";

// Catalogue / admin-settings defaults (mockData) and reference seed labels
// no longer show "Kaftan"; stable ids (kaftan, kaftan-set, kaftan-dress,
// executive-kaftan, kaftan-var-N, outfit_type_kaftan / KAFTAN) are unchanged.
{
  const assertNoKaftan = (text: string, where: string) =>
    assert.doesNotMatch(text, /kaftan/i, `${where}: "Kaftan" must not be shown`);
  const outfitTypes = DEFAULT_BUSINESS_SETTINGS.outfitTypes || [];
  const outfitName = (id: string) => outfitTypes.find((o) => o.id === id)?.name;
  assert.equal(outfitName("kaftan"), "Long Shirt");
  assert.equal(outfitName("kaftan-set"), "Long Shirt Set");
  assert.equal(outfitName("kaftan-dress"), "Long Dress");
  for (const o of outfitTypes) assertNoKaftan(o.name, `outfit type ${o.id}`);

  const compositions = DEFAULT_BUSINESS_SETTINGS.garmentCompositions || [];
  assert.ok(compositions.includes("Long Shirt Only"));
  for (const c of compositions) assertNoKaftan(c, "garment composition");

  const executive = STYLE_CATEGORIES.find((s) => s.id === "executive-kaftan");
  assert.equal(executive?.name, "Executive Long Shirt");
  assert.equal(executive?.outfitType, "Long Shirt Set");
  assert.equal(executive?.garmentComposition, "Long Shirt Only");
  const generatedLongShirts = STYLE_CATEGORIES.filter((s) => /^kaftan-var-\d+$/.test(s.id));
  assert.ok(generatedLongShirts.length > 0, "generated style ids keep the kaftan-var-N prefix");
  assert.ok(generatedLongShirts.every((s) => s.name.endsWith(" Long Shirt")));
  for (const s of STYLE_CATEGORIES) {
    assertNoKaftan(s.name, `style ${s.id} name`);
    assertNoKaftan(s.description || "", `style ${s.id} description`);
    assertNoKaftan(String(s.outfitType || ""), `style ${s.id} outfitType`);
    assertNoKaftan(String(s.garmentComposition || ""), `style ${s.id} composition`);
  }
  for (const d of DESIGN_COLLECTION) {
    assertNoKaftan(`${d.styleCategory} ${d.garmentType} ${d.description}`, `design ${d.designCode}`);
  }
  for (const o of MOCK_HISTORICAL_ORDERS) assertNoKaftan(o.styleName, `historical order ${o.id}`);
  for (const p of MOCK_COMMUNITY_PHOTOS) assertNoKaftan(p.caption || "", `community photo ${p.id}`);

  const seedSource = readFileSync("src/scripts/seedReferenceData.ts", "utf8");
  assert.match(
    seedSource,
    /id: "outfit_type_kaftan", code: "KAFTAN", label: "Long Shirt", value: "Long Shirt"/,
  );
}

console.log("Kaftan catalogue display label checks passed.");
