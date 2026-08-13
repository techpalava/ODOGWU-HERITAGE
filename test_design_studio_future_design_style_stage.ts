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
  "compatible",
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
  "src/components/DormantFutureJourneyStepper.tsx",
  "utf8",
);
const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(componentSource, /No matching design styles are available yet/);
assert.match(componentSource, /Return to Garment Type/);
assert.match(componentSource, /aria-pressed=\{isSelected\}/);
assert.match(componentSource, /aria-describedby=\{!isCompatible \? reasonId : undefined\}/);
assert.match(componentSource, /min-h-11/);
assert.match(componentSource, /sm:grid-cols-2 xl:grid-cols-3/);
assert.match(componentSource, /Image unavailable/);
assert.equal(componentSource.includes("Upload Your Own Design"), false);
assert.equal(componentSource.includes("handleStyleChange"), false);
assert.equal(componentSource.includes("setFabricAllocationState"), false);
assert.match(componentSource, /Continue to Custom Details/);
assert.match(stepperSource, /aria-current=\{isCurrent \? "step" : undefined\}/);
assert.match(stepperSource, /aria-disabled=\{!isAvailable \|\| isCurrent\}/);
assert.match(studioSource, /onReturnToGarmentType=\{\(\) => setFutureStageId\("garment_type"\)\}/);
assert.equal(appSource.includes("future_nine_stage"), false);

console.log("PASS: future Design Style stage presentation and accessibility contract");
