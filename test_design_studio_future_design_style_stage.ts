import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getFutureDesignStyleCompositionLabel,
  reconcileFutureDesignStyleSelection,
  resolveFutureDesignStyleCompatibility,
} from "./src/utils/designStudioFutureDesignStyle";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {},
};

const compatibleStyle: StyleCategory = {
  id: "future-stage-compatible",
  name: "Heritage Senator Set",
  description: "A complete matching set.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
    { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
  ],
};

assert.equal(
  getFutureDesignStyleCompositionLabel(compatibleStyle),
  "Shirt + Trouser",
);
assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection,
    style: compatibleStyle,
  }).status,
  "exact_match",
);
assert.equal(
  resolveFutureDesignStyleCompatibility({
    garmentTypeSelection,
    style: { ...compatibleStyle, isActive: false } as StyleCategory,
  }).code,
  "STYLE_DISABLED",
);
assert.equal(
  reconcileFutureDesignStyleSelection({
    selectedStyleId: "future-stage-compatible",
    styles: [compatibleStyle],
    garmentTypeSelection,
  }).status,
  "selected",
);
assert.equal(
  reconcileFutureDesignStyleSelection({
    selectedStyleId: "deleted-style",
    styles: [],
    garmentTypeSelection,
  }).status,
  "reselection_required",
);

const componentSource = readFileSync(
  "src/components/DormantFutureDesignStyleStep.tsx",
  "utf8",
);
const stepperSource = readFileSync(
  "src/components/DesignStudioJourneyStepper.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");
const adminSource = readFileSync("src/components/DatabaseView.tsx", "utf8");

assert.match(componentSource, /No designs can currently be selected for this garment/);
assert.match(componentSource, /No exact catalogue matches yet/);
assert.match(componentSource, /Return to Garment Type/);
assert.match(
  componentSource,
  /Loading catalogue designs\. Your saved assignments are preserved/,
);
assert.match(
  componentSource,
  /catalogue is temporarily unavailable\. Your saved[\s\S]*assignments are preserved/,
);
assert.equal(
  /A current catalog design is required/.test(componentSource),
  false,
);
assert.match(componentSource, /aria-pressed=\{selected\}/);
assert.match(componentSource, /aria-current=\{active \? "true" : undefined\}/);
assert.match(componentSource, /min-h-11/);
assert.match(componentSource, /sm:grid-cols-2 xl:grid-cols-3/);
assert.match(componentSource, /Image unavailable/);
assert.match(componentSource, /Originally shown as:/);
assert.match(componentSource, /DesignStyleStepCatalogueEntry/);
assert.match(componentSource, /All Designs/);
assert.match(componentSource, /Choose a design for each garment/);
assert.match(componentSource, /garment[\s\S]*has[\s\S]*a design/);
assert.equal(
  componentSource.includes("ODOGWU_STEP3_DISCOVERY_QA_STYLES"),
  false,
);
assert.equal(componentSource.includes("sessionStorage"), false);
assert.equal(componentSource.includes('data-testid="upload-your-design-panel"'), false);
assert.equal(componentSource.includes("Continue with Uploaded Design"), false);
assert.match(componentSource, /existing uploaded design assignment is shown read-only/);
assert.equal(componentSource.includes("handleStyleChange"), false);
assert.equal(componentSource.includes("setFabricAllocationState"), false);
assert.match(componentSource, /Continue to Custom Details/);
assert.match(stepperSource, /aria-current=\{isCurrent \? "step" : undefined\}/);
assert.match(stepperSource, /aria-disabled=\{!isClickable\}/);
assert.match(studioSource, /onReturnToGarmentType=\{\(\) => setFutureStageId\("garment_type"\)\}/);
assert.match(studioSource, /futureDesignStyleStepProjection\.isComplete/);
assert.match(studioSource, /assignCatalogueStyleThroughStepRuntime/);
assert.match(studioSource, /clearCatalogueStyleThroughStepRuntime/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.match(adminSource, /Compatible Physical Garments/);
assert.match(
  adminSource,
  /Customers may select any one supported[\s\S]*compatible combination/,
);
assert.match(
  adminSource,
  /selections do not automatically add garments to the[\s\S]*customer&apos;s order/,
);

console.log("PASS: future Design Style stage presentation and accessibility contract");
