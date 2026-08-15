import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DESIGN_STUDIO_STEPS } from "./src/components/DesignStudioJourneyStepper";
import { getGarmentTypeStepPresentation } from "./src/components/GarmentTypeStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { CANONICAL_PHYSICAL_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const presentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [],
  normalizedCustomDetailCatalog: catalog,
});

assert.equal(presentation.categories.length, 9);
assert.deepEqual(
  presentation.categories.map((category) => category.garmentType),
  CANONICAL_PHYSICAL_GARMENT_TYPES,
);
assert.deepEqual(
  DESIGN_STUDIO_STEPS.map((step) => step.label),
  [
    "Garment Type",
    "Fabric",
    "Design Style",
    "Custom Details",
    "AI Try-on",
    "Measurement",
    "Summary",
    "Shipping",
    "Order Review & Payment",
  ],
);

const fabricSource = readFileSync(
  "src/components/DormantFutureFabricStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");

assert.match(fabricSource, /getFutureGarmentLabel\(assignment\.garmentType\)/);
assert.match(fabricSource, /aria-label=\{`\$\{assigned \? "Change" : "Add"\} fabric for/);
assert.match(fabricSource, /Fabric needs attention/);
assert.match(stepperSource, /aria-current=\{isCurrent \? "step" : undefined\}/);
assert.match(stepperSource, /disabled=\{!isAvailable \|\| isCurrent\}/);
assert.match(stepperSource, /min-h-11/);
assert.match(studioSource, /<DesignStudioJourneyStepper/);
assert.match(studioSource, /<DormantFutureFabricStep/);

console.log("PASS: future Fabric stage presentation");
