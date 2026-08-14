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
assert.match(measurementSource, /Enter the complete measurements required for your selected garments\./);
assert.match(measurementSource, /Enter the highlighted measurements for assisted calculation\./);
assert.match(measurementSource, /Enter the three or four quick measurements required for this garment\./);
assert.match(
  measurementSource,
  /Your required measurements can be saved, but the assisted calculation method is still being finalised\./,
);
assert.match(
  measurementSource,
  /Your quick measurements can be saved, but the remaining calculation method is still being finalised\./,
);
assert.match(measurementSource, /saved/);
assert.match(measurementSource, /no approved calculation factor/);
assert.match(measurementSource, /Shared Body Measurements/);
assert.match(measurementSource, /Shared body measurements are entered once and used for all applicable garments\./);
assert.match(measurementSource, /Measurement setup pending/);
assert.match(measurementSource, /awaiting confirmation\. You can continue reviewing measurements for your other garments\./);
assert.match(measurementSource, /aria-invalid/);
assert.match(measurementSource, /Enter a positive measurement value\./);
assert.match(measurementSource, /Current route status/);
assert.match(measurementSource, /Calculation pending/);
assert.match(measurementSource, /aria-describedby="measurement-summary-lock-reason"/);
assert.match(measurementSource, /Back to AI Try-on/);
assert.match(measurementSource, /Continue to Summary/);
assert.match(measurementSource, /Summary remains locked while the future measurement calculation is awaiting approval\./);
assert.match(measurementSource, /aria-live="polite"/);
assert.equal(measurementSource.includes("calculated value"), false);
assert.match(stepperSource, /canEnterMeasurement/);
assert.match(stepperSource, /step\.id === "measurement"/);
assert.equal(appSource.includes("future_nine_stage"), false);
assert.match(studioSource, /journeyMode = "legacy_five_stage"/);

console.log("PASS: dormant future Measurement stage integration and production lock");
