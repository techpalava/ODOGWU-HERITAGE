import assert from "node:assert/strict";
import {
  getFutureDesignStyleAdaptationConfirmationCopy,
  getFutureDesignStyleMatchPresentation,
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
  resolveStyleApplicability,
} from "./src/utils/designStudioFutureDesignStyle";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographic: GarmentTypeStepSelection["demographic"],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic,
  audienceSelection: demographic
    ? { schemaVersion: 1, demographics: [demographic] }
    : undefined,
  constructionByGarment: {},
});

const kaftanStyle = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "royal-senator-applicability",
  name: "Royal Senator",
  description: "Kaftan original composition fixture",
  gender: "male",
  options: [],
  targetDemographic: "male",
  fabricCapacityComposition: [
    { key: "base:kaftan", garmentType: "kaftan", fabricUnits: 1 },
  ],
  ...overrides,
});

const shirtTrouserStyle = (
  overrides: Partial<StyleCategory> = {},
): StyleCategory => ({
  id: "legacy-shirt-trouser",
  name: "Structured Set",
  description: "Legacy exact-only fixture",
  gender: "male",
  options: [],
  targetDemographic: "male",
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
  ...overrides,
});

const shirtTrouserMale = selection(["shirt", "trouser"], "male");
const kaftanMale = selection(["kaftan"], "male");

// A. Legacy style, exact composition → exact_match
const legacyExact = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: shirtTrouserStyle(),
});
assert.equal(legacyExact.status, "exact_match");
assert.equal(legacyExact.code, "EXACT_MATCH");
assert.equal(legacyExact.customerReason, "Designed for your selected garments.");
assert.equal(resolveStyleApplicability(shirtTrouserStyle()).mode, "exact_only");

// B. Legacy style, composition mismatch → blocked
const legacyMismatch = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle(),
});
assert.equal(legacyMismatch.status, "blocked");
assert.equal(legacyMismatch.code, "GARMENT_COMPOSITION_MISMATCH");
assert.equal(
  legacyMismatch.customerReason,
  "This design is not available for one or more garments in your order.",
);

const adaptableKaftan = kaftanStyle({
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "kaftan"],
  },
});

// C. adaptable style, exact composition → exact_match wins over adaptable
const exactWins = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: kaftanMale,
  style: adaptableKaftan,
});
assert.equal(exactWins.status, "exact_match");
assert.equal(exactWins.code, "EXACT_MATCH");

// D. adaptable style, different original composition but selected garments allowed
const adapted = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: adaptableKaftan,
});
assert.equal(adapted.status, "adaptable");
assert.equal(adapted.code, "ADAPTABLE");
assert.equal(
  adapted.customerReason,
  "This design can be adapted to your Standard Shirt and Trouser.",
);

const adaptedPresentation = getFutureDesignStyleMatchPresentation({
  garmentTypeSelection: shirtTrouserMale,
  style: adaptableKaftan,
});
assert.equal(adaptedPresentation.tier, "adaptable");
assert.equal(adaptedPresentation.selectable, true);
assert.equal(adaptedPresentation.requiresAdaptationConfirmation, true);
assert.equal(adaptedPresentation.originalCompositionLabel, "Long Shirt (Kaftan)");
assert.deepEqual(adaptedPresentation.selectedGarmentLabels, [
  "Standard Shirt",
  "Trouser",
]);

const adaptationCopy = getFutureDesignStyleAdaptationConfirmationCopy({
  garmentTypeSelection: shirtTrouserMale,
  style: adaptableKaftan,
});
assert.equal(adaptationCopy.title, "Adapt this design to your garments?");
assert.match(adaptationCopy.body, /Long Shirt \(Kaftan\)/);
assert.match(adaptationCopy.body, /Standard Shirt and Trouser/);
assert.match(
  adaptationCopy.body,
  /Your garments and Fabric selections will not change/,
);

const exactPresentation = getFutureDesignStyleMatchPresentation({
  garmentTypeSelection: kaftanMale,
  style: adaptableKaftan,
});
assert.equal(exactPresentation.tier, "exact_match");
assert.equal(exactPresentation.selectable, true);
assert.equal(exactPresentation.requiresAdaptationConfirmation, false);
assert.equal(
  exactPresentation.originalCompositionLabel,
  "Long Shirt (Kaftan)",
);

// E. adaptable style supports only some selected garments → blocked
const partialAdapt = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["shirt", "kaftan"],
    },
  }),
});
assert.equal(partialAdapt.status, "blocked");
assert.equal(partialAdapt.code, "GARMENT_COMPOSITION_MISMATCH");

// F. adaptable style with demographic mismatch → blocked
const femaleOnlyAdaptable = kaftanStyle({
  gender: "female",
  targetDemographic: "female",
  styleApplicability: {
    mode: "adaptable",
    garmentTypes: ["shirt", "trouser", "kaftan"],
  },
});
const demographicMismatch = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: femaleOnlyAdaptable,
});
assert.equal(demographicMismatch.status, "blocked");
assert.equal(demographicMismatch.code, "DEMOGRAPHIC_MISMATCH");
assert.equal(
  demographicMismatch.customerReason,
  "This design does not match who the order is for.",
);

const demographicOptIn = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    gender: "female",
    targetDemographic: "female",
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["shirt", "trouser", "kaftan"],
      demographics: ["male"],
    },
  }),
});
assert.equal(demographicOptIn.status, "adaptable");

// G. disabled adaptable style → blocked
const disabledAdaptable = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: { ...adaptableKaftan, isActive: false } as StyleCategory,
});
assert.equal(disabledAdaptable.status, "blocked");
assert.equal(disabledAdaptable.code, "STYLE_DISABLED");

// H. missing/malformed composition → indeterminate
const missingComposition = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    id: "missing-composition",
    fabricCapacityComposition: undefined,
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["shirt", "trouser"],
    },
  }),
});
assert.equal(missingComposition.status, "indeterminate");
assert.equal(missingComposition.code, "STYLE_COMPOSITION_MISSING");
assert.equal(
  missingComposition.customerReason,
  "This design needs catalogue review before it can be selected.",
);

const malformedComposition = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: kaftanMale,
  style: kaftanStyle({
    fabricCapacityComposition: [
      { key: "base:kaftan", garmentType: "kaftan", fabricUnits: 2 },
    ],
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["kaftan", "shirt"],
    },
  }),
});
assert.equal(malformedComposition.status, "indeterminate");
assert.equal(malformedComposition.code, "STYLE_COMPOSITION_MALFORMED");

// I. missing/malformed applicability → exact_only / fail closed
assert.equal(resolveStyleApplicability(kaftanStyle()).mode, "exact_only");
assert.equal(
  resolveStyleApplicability(
    kaftanStyle({
      styleApplicability: {
        mode: "adaptable",
        garmentTypes: ["not-a-garment"] as unknown as ["shirt"],
      },
    }),
  ).mode,
  "exact_only",
);

const malformedApplicabilityBlocked = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: ["not-a-garment"] as unknown as ["shirt"],
    },
  }),
});
assert.equal(malformedApplicabilityBlocked.status, "blocked");

const omittedGarmentTypes = resolveStyleApplicability(
  kaftanStyle({
    styleApplicability: { mode: "adaptable" },
  }),
);
assert.equal(omittedGarmentTypes.mode, "exact_only");

const emptyAdaptableTypes = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    styleApplicability: {
      mode: "adaptable",
      garmentTypes: [],
    },
  }),
});
assert.equal(emptyAdaptableTypes.status, "blocked");

const unknownMode = resolveFutureDesignStyleCompatibility({
  garmentTypeSelection: shirtTrouserMale,
  style: kaftanStyle({
    styleApplicability: {
      mode: "maybe" as "adaptable",
      garmentTypes: ["shirt", "trouser"],
    },
  }),
});
assert.equal(unknownMode.status, "blocked");

// J. Step 1 change makes previously adaptable style invalid → reselection_required
const selectedAdaptable = reconcileFutureDesignStyleSelection({
  selectedStyleId: adaptableKaftan.id,
  styles: [adaptableKaftan],
  garmentTypeSelection: shirtTrouserMale,
});
assert.equal(selectedAdaptable.status, "selected");
assert.equal(selectedAdaptable.compatibility?.status, "adaptable");

const step1Invalidates = reconcileFutureDesignStyleSelection({
  selectedStyleId: adaptableKaftan.id,
  styles: [adaptableKaftan],
  garmentTypeSelection: selection(["shirt", "skirt"], "male"),
});
assert.equal(step1Invalidates.status, "reselection_required");
assert.equal(step1Invalidates.selectedStyleId, adaptableKaftan.id);
assert.equal(step1Invalidates.compatibility?.status, "blocked");

// K. Step 1 change still permitted → selection retained
const step1StillExact = reconcileFutureDesignStyleSelection({
  selectedStyleId: adaptableKaftan.id,
  styles: [adaptableKaftan],
  garmentTypeSelection: kaftanMale,
});
assert.equal(step1StillExact.status, "selected");
assert.equal(step1StillExact.compatibility?.status, "exact_match");

const step1StillAdaptable = reconcileFutureDesignStyleSelection({
  selectedStyleId: adaptableKaftan.id,
  styles: [adaptableKaftan],
  garmentTypeSelection: selection(["shirt"], "male"),
});
assert.equal(step1StillAdaptable.status, "selected");
assert.equal(step1StillAdaptable.compatibility?.status, "adaptable");

const blockedPresentation = getFutureDesignStyleMatchPresentation({
  garmentTypeSelection: selection(["skirt"], "male"),
  style: adaptableKaftan,
});
assert.equal(blockedPresentation.tier, "blocked");
assert.equal(blockedPresentation.selectable, false);
assert.equal(blockedPresentation.requiresAdaptationConfirmation, false);

console.log("PASS: style applicability engine and Design Style compatibility tiers");
