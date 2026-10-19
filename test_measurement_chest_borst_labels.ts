import assert from "node:assert/strict";
import type {
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  getDemographicMeasurementCustomerLabel,
  getMeasurementCustomerLabel,
  getSampleClothCustomerLabel,
  planMeasurementRequirements,
  resolveMeasurementLabelDemographic,
  resolveMeasurementLabelDemographicForGarments,
} from "./src/utils/measurementBlueprint";
import { getFuturePaymentReviewMeasurementGroups } from "./src/utils/designStudioFuturePaymentReview";

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: any,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [{
    componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
    optionId,
    selectionGroup,
    priceCents: 1,
    price: 0.01,
  }],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

const shirt = (demographic: GarmentTypeStepSelection["demographic"]): GarmentTypeStepSelection => ({
  garmentTypes: ["shirt"],
  demographic,
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
});
const dress = (demographic: GarmentTypeStepSelection["demographic"]): GarmentTypeStepSelection => ({
  garmentTypes: ["dress"],
  demographic,
  constructionByGarment: {
    dress: construction("dress", "dress_std_short", "dress_construction"),
  },
});
const shirtGarments = [{ garmentKey: "shirt:1", garmentType: "shirt" as const }];
const dressGarments = [{ garmentKey: "dress:1", garmentType: "dress" as const }];

const CHEST_IDS = new Set([
  "chest_bust_circumference",
  "under_bust_circumference",
  "shoulder_to_under_bust_length",
]);

// 1. Label table per demographic.
const expected = {
  male: {
    chest_bust_circumference: "Chest Circumference",
    under_bust_circumference: "Under Chest Circumference",
    shoulder_to_under_bust_length: "Shoulder to Under-Chest Length",
  },
  female: {
    chest_bust_circumference: "Borst Circumference",
    under_bust_circumference: "Under Borst Circumference",
    shoulder_to_under_bust_length: "Shoulder to Under-Borst Length",
  },
  unisex: {
    chest_bust_circumference: "Chest / Borst Circumference",
    under_bust_circumference: "Under Chest / Borst Circumference",
    shoulder_to_under_bust_length: "Shoulder to Under-Chest / Borst Length",
  },
} as const;
for (const [demographic, labels] of Object.entries(expected)) {
  for (const [id, label] of Object.entries(labels)) {
    assert.equal(getMeasurementCustomerLabel(id as any, demographic), label);
    assert.equal(getDemographicMeasurementCustomerLabel(id, demographic), label);
  }
}
assert.equal(getMeasurementCustomerLabel("chest_bust_circumference", null), "Chest / Borst Circumference");
assert.equal(getMeasurementCustomerLabel("chest_bust_circumference", undefined), "Chest / Borst Circumference");
assert.equal(getDemographicMeasurementCustomerLabel("waist_circumference", "female"), null);
assert.equal(resolveMeasurementLabelDemographic("male"), "male");
assert.equal(resolveMeasurementLabelDemographic("female"), "female");
assert.equal(resolveMeasurementLabelDemographic("unisex"), "unisex");
assert.equal(resolveMeasurementLabelDemographic(null), "unisex");
assert.equal(resolveMeasurementLabelDemographicForGarments(["male", "male"]), "male");
assert.equal(resolveMeasurementLabelDemographicForGarments(["male", "female"]), "unisex");
assert.equal(resolveMeasurementLabelDemographicForGarments([]), "unisex");

assert.equal(getSampleClothCustomerLabel("chest_bust_circumference", "x", "male"), "Chest across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("chest_bust_circumference", "x", "female"), "Borst across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("chest_bust_circumference", "x", null), "Chest / Borst across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("under_bust_circumference", "x", "male"), "Under Chest across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("under_bust_circumference", "x", "female"), "Under Borst across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("under_bust_circumference", "x", "unisex"), "Under Chest / Borst across sample (laid flat)");
assert.equal(getSampleClothCustomerLabel("waist_circumference", "x", "female"), "Waist across sample (laid flat)");

// 2. Planned requirements (Step 7 fields, Summary rows) carry the demographic wording.
const labelsFor = (
  route: Parameters<typeof planMeasurementRequirements>[0]["route"],
  selection: GarmentTypeStepSelection,
  garments: typeof shirtGarments | typeof dressGarments,
) => {
  const plan = planMeasurementRequirements({
    route,
    garmentTypeSelection: selection,
    physicalGarments: garments,
  });
  const requirements = plan.requirements.filter(({ measurementId }) => CHEST_IDS.has(measurementId));
  assert.ok(requirements.length > 0, `${route} plan should include the chest field`);
  return requirements.map((requirement) => ({
    id: requirement.measurementId,
    body: requirement.definition.customerLabel,
    sample: requirement.sampleGeometry
      ? getSampleClothCustomerLabel(
          requirement.measurementId,
          requirement.definition.customerLabel,
          requirement.labelDemographic,
        )
      : null,
  }));
};

const maleLow = labelsFor("low_risk", shirt("male"), shirtGarments);
assert.ok(maleLow.some(({ body }) => body === "Chest Circumference"));
for (const { body } of maleLow) {
  assert.doesNotMatch(body, /Borst/);
  assert.doesNotMatch(body, /Bust/);
}

const femaleLow = labelsFor("low_risk", dress("female"), dressGarments);
assert.ok(femaleLow.some(({ body }) => body === "Borst Circumference"));
for (const { body } of femaleLow) {
  assert.doesNotMatch(body, /Chest/);
  assert.doesNotMatch(body, /Bust/);
}
assert.ok(femaleLow.some(({ id, body }) => id === "under_bust_circumference" && body === "Under Borst Circumference"));
assert.ok(femaleLow.some(({ id, body }) => id === "shoulder_to_under_bust_length" && body === "Shoulder to Under-Borst Length"));
// Male Shirt has no under-chest fields at all.
assert.ok(maleLow.every(({ id }) => id === "chest_bust_circumference"));

const unisexLow = labelsFor("low_risk", shirt("unisex"), shirtGarments);
assert.ok(unisexLow.some(({ body }) => body === "Chest / Borst Circumference"));

const maleSample = labelsFor("sample_cloth", shirt("male"), shirtGarments);
assert.ok(maleSample.some(({ sample }) => sample === "Chest across sample (laid flat)"));
for (const { sample } of maleSample) assert.doesNotMatch(String(sample), /Borst|Bust/);
const femaleSample = labelsFor("sample_cloth", dress("female"), dressGarments);
assert.ok(femaleSample.some(({ sample }) => sample === "Borst across sample (laid flat)"));
for (const { sample } of femaleSample) assert.doesNotMatch(String(sample), /Chest|Bust/);
const unisexSample = labelsFor("sample_cloth", shirt("unisex"), shirtGarments);
assert.ok(unisexSample.some(({ sample }) => sample === "Chest / Borst across sample (laid flat)"));

// 3. Payment Review and customer order details label by the order's garment demographic.
const withValues = (): FutureMeasurementStateV1 => {
  const state = createEmptyFutureMeasurementState("low_risk", "cm");
  return {
    ...state,
    entered: {
      ...state.entered,
      shared: {
        chest_bust_circumference: { valueCm: 96, provenance: "customer_entered" },
        under_bust_circumference: { valueCm: 80, provenance: "customer_entered" },
        waist_circumference: { valueCm: 80, provenance: "customer_entered" },
      },
    },
  } as FutureMeasurementStateV1;
};
const reviewLabels = (demographics: Array<string | null>) =>
  getFuturePaymentReviewMeasurementGroups({
    measurements: withValues(),
    garments: demographics.map((demographic, index) => ({
      garmentKey: `g:${index}`,
      label: `Garment ${index}`,
      demographic,
    })),
  }).flatMap((group) => group.items.map((item) => item.label));

const maleReview = reviewLabels(["male"]);
assert.ok(maleReview.includes("Chest Circumference"));
assert.ok(maleReview.includes("Under Chest Circumference"));
assert.ok(maleReview.includes("Waist Circumference"));
assert.ok(maleReview.every((label) => !/Borst|Bust/.test(label)));

const femaleReview = reviewLabels(["female"]);
assert.ok(femaleReview.includes("Borst Circumference"));
assert.ok(femaleReview.includes("Under Borst Circumference"));
assert.ok(femaleReview.every((label) => !/Chest|Bust/.test(label)));

const mixedReview = reviewLabels(["male", "female"]);
assert.ok(mixedReview.includes("Chest / Borst Circumference"));
assert.ok(mixedReview.includes("Under Chest / Borst Circumference"));
assert.ok(mixedReview.every((label) => !/Bust/.test(label)));
const unknownReview = reviewLabels([null]);
assert.ok(unknownReview.includes("Chest / Borst Circumference"));

console.log("PASS: Chest for male, Borst for female, Chest / Borst fallback");
