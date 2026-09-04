import assert from "node:assert/strict";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import { buildFutureOrderCandidateV2OccurrenceStyles } from "./src/utils/futureOrderCandidate";
import { createDesignStyleStepTestModel } from "./testing/designStyleStepFixtures";

const selection = (garmentTypes: GarmentTypeStepSelection["garmentTypes"]): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const style = (id: string, name: string): StyleCategory => ({
  id,
  name,
  description: `${name} description`,
  gender: "male",
  targetDemographic: "male",
  options: [],
  image: `https://example.test/${id}.webp`,
  outfitType: "Native",
  garmentComposition: "Shirt and skirt",
  fabricCategory: "Any",
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt"), createStyleBaseGarmentSpec("skirt")],
  customDetailConfig: { representedGenders: ["male"], featuresMaleAndFemale: false, supportedGarmentGroups: ["shirt"], requiredSelectionGroups: [], enabled: true },
  includedDesignFeatures: { hasMonogram: false, hasEmbroidery: false, hasMonogramTrimming: false },
  monogramCuffEligible: false,
  embroideryProminence: "standard",
  defaultGarmentDetails: {},
  styleApplicability: { mode: "exact_only" },
});

const styles = [style("style-a", "Classic Senator"), style("style-b", "Modern Senator")];
const model = createDesignStyleStepTestModel({
  styles,
  garmentTypeSelection: selection(["shirt", "skirt"]),
  selectedStyleIdByGarmentKey: { "base:shirt:1": "style-a", "base:skirt:1": "style-b" },
});
const result = buildFutureOrderCandidateV2OccurrenceStyles({
  occurrences: model.occurrences,
  ledger: model.hydration.ledger!,
  validationAuthority: model.authority,
  styles: model.styles,
  uploadedAuthorityBySourceRef: {},
});
assert.equal(result.status, "valid");
if (result.status !== "valid") throw new Error("Expected V2 candidate");
assert.deepEqual(result.candidate.occurrenceStyleSnapshots.map((row) => [row.occurrence.label, row.catalogue?.styleId]), [["Shirt", "style-a"], ["Skirt", "style-b"]]);
assert.equal(Object.isFrozen(result.candidate), true);
assert.equal(Object.isFrozen(result.candidate.occurrenceStyleSnapshots), true);
styles[0].name = "Admin rename after submission";
assert.equal(result.candidate.occurrenceStyleSnapshots[0].catalogue?.name, "Classic Senator");

const missing = createDesignStyleStepTestModel({
  styles: [style("style-a", "Classic Senator")],
  garmentTypeSelection: selection(["shirt", "skirt"]),
  selectedStyleIdByGarmentKey: { "base:shirt:1": "style-a" },
});
const blocked = buildFutureOrderCandidateV2OccurrenceStyles({
  occurrences: missing.occurrences,
  ledger: missing.hydration.ledger!,
  validationAuthority: missing.authority,
  styles: missing.styles,
  uploadedAuthorityBySourceRef: {},
});
assert.equal(blocked.status, "blocked");
assert.ok(blocked.blockers.some((blocker) => blocker.code === "DESIGN_STYLE_ASSIGNMENT_INVALID"));

console.log("PASS: Future Order Candidate V2 occurrence-style snapshots");
