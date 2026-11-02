import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DESIGN_STUDIO_STEPS } from "./src/components/DesignStudioJourneyStepper";
import { getGarmentTypeStepPresentation } from "./src/components/GarmentTypeStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { CANONICAL_PHYSICAL_GARMENT_TYPES, STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";

const fabricSource = readFileSync(
  "src/components/DormantFutureFabricStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const guideSource = readFileSync(
  "src/components/DesignStudioStepGuide.tsx",
  "utf8",
);

assert.match(fabricSource, /getFutureGarmentLabel\(assignment\.garmentType\)/);
assert.match(fabricSource, /aria-label=\{`Change fabric for \$\{garmentLabel\}`\}/);
assert.match(fabricSource, /aria-label=\{`Add fabric for \$\{garmentLabel\}`\}/);
assert.match(fabricSource, /aria-label=\{`Assign fabric for \$\{garmentLabel\}`\}/);
// The old "Fabric needs attention" box is merged into the Fabric Guide flow.
assert.doesNotMatch(fabricSource, /title="Fabric needs attention"/);
assert.match(fabricSource, /data-testid="fabric-guide-flow"/);
assert.match(fabricSource, /title=\{FABRIC_GUIDE_TITLE\}/);
assert.match(fabricSource, /DesignStudioStepGuide/);
assert.match(guideSource, />\s*Guide\s*</);
assert.match(guideSource, /motion-safe:animate-step-guide-beam/);

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const presentation = getGarmentTypeStepPresentation({
  selectedGarmentTypes: [],
  normalizedCustomDetailCatalog: catalog,
});

assert.equal(presentation.categories.length, 8);
assert.deepEqual(
  presentation.categories.map((category) => category.garmentType),
  STEP_1_SELECTABLE_GARMENT_TYPES,
);
assert.ok(
  CANONICAL_PHYSICAL_GARMENT_TYPES.includes("agbada"),
  "Agbada domain support must remain in the canonical catalogue",
);
assert.ok(
  !STEP_1_SELECTABLE_GARMENT_TYPES.includes("agbada"),
  "Agbada must be excluded from Step 1 selectable garments",
);
assert.deepEqual(
  DESIGN_STUDIO_STEPS.map((step) => step.label),
  [
    "Garment Type",
    "Fabric",
    "Design Style",
    "Custom Details",
    "Personalized Additions",
    "Measurement",
    "AI Try-on",
    "Summary",
    "Delivery & Pickup",
    "Order Review & Payment",
  ],
);

assert.match(stepperSource, /aria-current=\{isCurrent \? "step" : undefined\}/);
assert.match(stepperSource, /disabled=\{!isClickable\}/);
assert.match(stepperSource, /min-h-11/);
assert.match(studioSource, /<DesignStudioJourneyStepper/);
assert.match(studioSource, /<DormantFutureFabricStep/);

console.log("PASS: future Fabric stage presentation");
