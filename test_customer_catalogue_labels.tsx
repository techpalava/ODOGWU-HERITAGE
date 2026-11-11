import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { GarmentTypeStep } from "./src/components/GarmentTypeStep";
import { DesignStudioOrderSummary } from "./src/components/DesignStudioOrderSummary";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  GARMENT_COMPOSITION_CATALOGUE_LABELS,
  OUTFIT_TYPE_CATALOGUE_LABELS,
  customerCatalogueLabel,
} from "./src/utils/customerCatalogueLabel";
import { getFutureDesignStyleCompositionLabel } from "./src/utils/designStudioFutureDesignStyle";
import type { LiveOrderSummaryView } from "./src/utils/designStudioLiveOrderSummary";
import {
  NIKKA_PLAIN_DESCRIPTION,
  STEP_1_GARMENT_DISPLAY_LABELS,
  getStep1GarmentPlainDescription,
} from "./src/utils/garmentConstructionPricing";
import type {
  DesignStudioStageId,
  FabricGarmentType,
  StyleCategory,
} from "./src/types";

const NIKKA_COPY =
  "Nikka: native-style shorts that end at or just below the knee.";

assert.equal(NIKKA_PLAIN_DESCRIPTION, NIKKA_COPY);

const extractGroup = (source: string, groupId: string): Record<string, string> => {
  const start = source.indexOf(`id: "${groupId}"`);
  assert.ok(start >= 0, `catalogue group ${groupId} exists`);
  const next = source.indexOf("\n  {", start + 10);
  const block = next === -1 ? source.slice(start) : source.slice(start, next);
  const pairs = [
    ...block.matchAll(/code: "((?:\\.|[^"\\])*)", label: "((?:\\.|[^"\\])*)"/g),
  ];
  assert.ok(pairs.length > 0, `catalogue group ${groupId} has options`);
  return Object.fromEntries(pairs.map((match) => [match[1], match[2]]));
};

const seed = readFileSync("src/scripts/seedReferenceData.ts", "utf8");
assert.deepEqual(extractGroup(seed, "outfit_types"), OUTFIT_TYPE_CATALOGUE_LABELS);
assert.deepEqual(
  extractGroup(seed, "garment_compositions"),
  GARMENT_COMPOSITION_CATALOGUE_LABELS,
);

assert.equal(customerCatalogueLabel("SENATOR_SET"), "Senator Set");
assert.equal(customerCatalogueLabel(" SHIRT_ONLY "), "Shirt Only");
assert.equal(customerCatalogueLabel("KAFTAN"), "Long Shirt");
assert.equal(customerCatalogueLabel("COMPLETE_SET"), "Complete Set (3-Piece)");
assert.equal(customerCatalogueLabel("Long Shirt Set"), "Long Shirt Set");
assert.equal(customerCatalogueLabel("2-Piece Set"), "2-Piece Set");
assert.equal(customerCatalogueLabel("Men"), "Men");
assert.equal(customerCatalogueLabel("HiTarget Ankara"), "HiTarget Ankara");
assert.equal(customerCatalogueLabel("Kampala"), "Kampala");
assert.equal(customerCatalogueLabel("IN_STOCK"), "IN_STOCK");
assert.equal(customerCatalogueLabel("Standard Nikka Shorts"), "Standard Nikka Shorts");
assert.equal(
  customerCatalogueLabel("Nikka / Standard Shorts"),
  "Nikka / Standard Shorts",
);

for (const code of Object.keys(extractGroup(seed, "fabric_categories"))) {
  assert.equal(customerCatalogueLabel(code), code, `fabric code stays ${code}`);
}

for (const garmentType of Object.keys(
  STEP_1_GARMENT_DISPLAY_LABELS,
) as FabricGarmentType[]) {
  const description = getStep1GarmentPlainDescription(garmentType);
  if (garmentType === "standard_shorts") {
    assert.equal(description, NIKKA_COPY);
  } else {
    assert.equal(description, null, `${garmentType} has no invented description`);
  }
}
assert.equal(getStep1GarmentPlainDescription("other"), null);

const codedStyle = {
  id: "catalogue-code-display",
  name: "Coded",
  description: "",
  gender: "male",
  options: [],
  outfitType: "SENATOR_SET",
  garmentComposition: "SHIRT_ONLY",
} as StyleCategory;

assert.equal(getFutureDesignStyleCompositionLabel(codedStyle), "Shirt Only");
assert.equal(
  getFutureDesignStyleCompositionLabel({
    ...codedStyle,
    garmentComposition: undefined,
    outfitType: "SENATOR_SET",
  }),
  "Senator Set",
);
assert.equal(
  getFutureDesignStyleCompositionLabel({
    ...codedStyle,
    garmentComposition: "2-Piece Set",
    outfitType: "Long Shirt Set",
  }),
  "2-Piece Set",
);
assert.equal(
  getFutureDesignStyleCompositionLabel({
    ...codedStyle,
    garmentComposition: "  ",
    outfitType: "  ",
  }),
  "Garment details to be confirmed",
);

const resolvedNikka = {
  id: "resolved-nikka",
  name: "Resolved",
  description: "",
  gender: "male",
  options: [],
  outfitType: "SENATOR_SET",
  fabricCapacityComposition: [
    {
      key: "base:standard_shorts",
      garmentType: "standard_shorts",
      fabricUnits: 1,
    },
  ],
} as StyleCategory;
assert.equal(
  getFutureDesignStyleCompositionLabel(resolvedNikka),
  "Nikka / Standard Shorts",
  "Resolved garment names stay on their existing labels",
);

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const markup = renderToStaticMarkup(
  createElement(GarmentTypeStep, {
    selectedGarmentTypes: ["standard_shorts", "bum_shorts"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
    onGarmentTypesChange: () => undefined,
    onDemographicsChange: () => undefined,
    onConstructionDefaultsChange: () => undefined,
  }),
);

const cardMarkup = (garmentType: string): string => {
  const match = markup.match(
    new RegExp(
      `data-testid="step1-garment-card-${garmentType}"[\\s\\S]*?</article>`,
    ),
  );
  assert.ok(match, `${garmentType} card renders`);
  return match[0];
};

const nikkaCard = cardMarkup("standard_shorts");
const bumCard = cardMarkup("bum_shorts");
assert.ok(nikkaCard.includes("Standard Nikka Shorts"));
assert.equal(nikkaCard.split(NIKKA_COPY).length - 1, 1);
assert.ok(bumCard.includes("Standard Bum Shorts"));
assert.equal(bumCard.includes(NIKKA_COPY), false);
assert.equal(bumCard.includes("Just below the Crotch"), false);
assert.ok(markup.includes('data-testid="step1-summary-description-standard_shorts"'));
assert.equal(
  markup.includes('data-testid="step1-summary-description-bum_shorts"'),
  false,
);
const summaryMarkup = markup.split('aria-label="Order Summary"')[1] || "";
assert.equal(summaryMarkup.split(NIKKA_COPY).length - 1, 1);
assert.ok(summaryMarkup.includes("Standard Nikka Shorts"));
assert.ok(summaryMarkup.includes("Standard Bum Shorts"));

const view: LiveOrderSummaryView = {
  sections: [
    {
      id: "construction",
      title: "Garments Ordered",
      editStage: "garment_type",
      lines: [
        {
          id: "construction-base:standard_shorts",
          label: "Standard Nikka Shorts",
          detail: "With Rope",
          plainDescription: NIKKA_COPY,
          amountLabel: "€70.00",
          focusGarmentKey: "base:standard_shorts",
        },
        {
          id: "construction-base:shirt",
          label: "Standard Shirt",
          detail: "Standard Length Shirt, Short Sleeve",
          amountLabel: "€65.00",
          focusGarmentKey: "base:shirt",
        },
      ],
    },
  ],
  totalStatus: "hidden",
  totalLabel: "Total",
  totalValueLabel: "",
  totalAmountCents: null,
  quoteRequired: false,
};

const orderSummary = renderToStaticMarkup(
  createElement(DesignStudioOrderSummary, {
    view,
    unlockedStages: new Set<DesignStudioStageId>(),
  }),
);
assert.ok(orderSummary.includes("Standard Nikka Shorts"));
assert.equal(orderSummary.split(NIKKA_COPY).length - 1, 1);
assert.ok(orderSummary.includes("With Rope"));
assert.ok(orderSummary.includes("Standard Shirt"));
assert.equal(
  orderSummary.includes(
    'data-testid="live-order-summary-plain-description-construction-base:shirt"',
  ),
  false,
);

const home = readFileSync("src/components/HomeView.tsx", "utf8");
assert.match(home, /customerCatalogueLabel\(style\.outfitType\)/);
assert.match(home, /customerCatalogueLabel\(String\(category\)\)/);
assert.match(home, /fabric\.category\.replace\(\/_\/g, " "\)/);
assert.doesNotMatch(home, /native-style shorts/);

console.log("customer catalogue label checks passed");
