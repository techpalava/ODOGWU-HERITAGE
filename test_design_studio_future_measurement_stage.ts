import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const measurementSource = readFileSync("src/components/DormantFutureMeasurementStep.tsx", "utf8");
const stepperSource = readFileSync("src/components/DormantFutureJourneyStepper.tsx", "utf8");
const appSource = readFileSync("src/App.tsx", "utf8");

assert.match(studioSource, /futureMeasurementState/);
assert.match(studioSource, /handleOpenDormantMeasurementStage/);
assert.match(studioSource, /futureStageId === "measurement"/);
assert.match(studioSource, /futureMeasurementState: isFutureNineStageMode/);
assert.match(measurementSource, /Dimension \/ Measurement/);
assert.match(measurementSource, /Low Risk — Complete Measurement Set/);
assert.match(measurementSource, /Mid Risk — Minimum Measurement Set/);
assert.match(measurementSource, /High Risk — Minimal Measurement Set/);
assert.match(measurementSource, /Back to AI Try-on/);
assert.match(measurementSource, /Summary is locked/);
assert.match(measurementSource, /aria-live="polite"/);
assert.equal(measurementSource.includes("calculated value"), false);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /step\.id === "measurement"/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.match(studioSource, /journeyMode = "legacy_five_stage"/);

console.log("PASS: dormant future Measurement stage integration and production lock");
