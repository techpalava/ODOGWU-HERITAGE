import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DormantFutureAiTryOnStep } from "./src/components/DormantFutureAiTryOnStep";
import type { FabricAllocation, GarmentTypeStepSelection } from "./src/types";
import {
  createAiTryOnFingerprintFromOccurrenceAssignments,
  createAiTryOnVisualInputFingerprint,
  createEmptyAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
  resolveAiTryOnGarmentDesigns,
  type AiTryOnOccurrenceDesignSource,
} from "./src/utils/aiTryOnWorkflow";

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {
    shirt: {
      status: "resolved",
      garmentType: "shirt",
      components: [
        {
          componentKey: "shirt:shirt_construction:shirt_standard_short",
          optionId: "shirt_standard_short",
          selectionGroup: "shirt_construction",
          priceCents: 6500,
          price: 65,
        },
      ],
      totalPriceCents: 6500,
      totalPrice: 65,
    },
    trouser: {
      status: "resolved",
      garmentType: "trouser",
      components: [
        {
          componentKey: "trouser:trouser_fastening:trouser_standard",
          optionId: "trouser_standard",
          selectionGroup: "trouser_fastening",
          priceCents: 7000,
          price: 70,
        },
      ],
      totalPriceCents: 7000,
      totalPrice: 70,
    },
  },
};

const fabricAllocations: FabricAllocation[] = [
  {
    allocationId: "allocation-runtime-1",
    fabricCode: "FABRIC-A",
    garmentAssignments: [
      {
        garmentKey: "base:shirt",
        code: "shirt",
        garmentType: "shirt",
        fabricUnits: 1,
      },
      {
        garmentKey: "base:trouser",
        code: "trouser",
        garmentType: "trouser",
        fabricUnits: 1,
      },
    ],
  },
];

const catalogAssignment = (
  garmentKey: string,
  styleId: string,
): AiTryOnOccurrenceDesignSource => ({
  garmentKey,
  assignment: {
    garmentKey,
    sourceKind: "catalog",
    sourceKey: `catalog-style:${styleId}`,
    catalogStyleId: styleId,
  },
});

const uploadedAssignment = (
  garmentKey: string,
  sourceRef: string,
): AiTryOnOccurrenceDesignSource => ({
  garmentKey,
  assignment: {
    garmentKey,
    sourceKind: "uploaded",
    sourceKey: `uploaded:${sourceRef}`,
    uploadedSourceRef: sourceRef,
  },
});

const assignedOccurrences: readonly AiTryOnOccurrenceDesignSource[] = [
  catalogAssignment("base:shirt", "senator-red"),
  uploadedAssignment("base:trouser", "upload-ref-1"),
];

const visualInput = {
  garmentTypeSelection,
  fabricAllocations,
  physicalOccurrences: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt" as const,
      sourceRole: "main" as const,
      fabricUnits: 1,
      occurrenceGeneration: 1,
    },
    {
      garmentKey: "base:trouser",
      garmentType: "trouser" as const,
      sourceRole: "main" as const,
      fabricUnits: 1,
      occurrenceGeneration: 1,
    },
  ],
};

const renderTryOn = (
  workflow: ReturnType<typeof reconcileAiTryOnWorkflow>,
) =>
  renderToStaticMarkup(
    createElement(DormantFutureAiTryOnStep, {
      workflow,
      skipAllowed: true,
      onBack: () => undefined,
      onRetry: () => undefined,
      onSkip: () => undefined,
      onContinue: () => undefined,
    }),
  );

const designs = resolveAiTryOnGarmentDesigns(assignedOccurrences);
assert.ok(designs);
assert.equal(designs.length, 2);

const fingerprintWithEmptyLegacySource = createAiTryOnVisualInputFingerprint({
  ...visualInput,
  selectedStyleId: "",
  garmentDesigns: designs,
});
const fingerprintWithStaleLegacySource = createAiTryOnVisualInputFingerprint({
  ...visualInput,
  selectedStyleId: "catalog:leftover-scalar-source",
  garmentDesigns: designs,
});
assert.equal(
  fingerprintWithEmptyLegacySource,
  fingerprintWithStaleLegacySource,
  "An empty legacy design source must not change the fingerprint once each garment has an assignment.",
);

const swappedDesigns = resolveAiTryOnGarmentDesigns([
  catalogAssignment("base:trouser", "senator-red"),
  uploadedAssignment("base:shirt", "upload-ref-1"),
]);
assert.ok(swappedDesigns);
assert.notEqual(
  createAiTryOnVisualInputFingerprint({
    ...visualInput,
    selectedStyleId: "",
    garmentDesigns: swappedDesigns,
  }),
  fingerprintWithEmptyLegacySource,
  "Each garment's own assignment must be part of the fingerprint.",
);

const readyFingerprint = createAiTryOnFingerprintFromOccurrenceAssignments({
  customDetailsReady: true,
  designSourceReady: true,
  occurrences: assignedOccurrences,
  visualInput,
});
assert.equal(readyFingerprint, fingerprintWithEmptyLegacySource);
assert.ok(readyFingerprint);

const readyWorkflow = reconcileAiTryOnWorkflow({
  state: createEmptyAiTryOnWorkflowState(),
  currentInputFingerprint: readyFingerprint,
  policy: { gatewayAvailable: false, skipAllowed: true },
});
assert.notEqual(readyWorkflow.status, "awaiting_input");
assert.equal(
  readyWorkflow.status,
  "unavailable",
  "Designs on garment assignments must not stay awaiting_input when the legacy design source is empty.",
);
const readyMarkup = renderTryOn(readyWorkflow);
assert.match(readyMarkup, /AI Try-on is currently unavailable/);
assert.match(readyMarkup, /Continue without AI Try-on/);
assert.equal(
  readyMarkup.includes("Complete the preceding design choices"),
  false,
);

const missingDesignOccurrences: readonly AiTryOnOccurrenceDesignSource[] = [
  catalogAssignment("base:shirt", "senator-red"),
  { garmentKey: "base:trouser", assignment: null },
];
assert.equal(resolveAiTryOnGarmentDesigns(missingDesignOccurrences), null);
assert.equal(
  createAiTryOnFingerprintFromOccurrenceAssignments({
    customDetailsReady: true,
    designSourceReady: false,
    occurrences: missingDesignOccurrences,
    visualInput,
  }),
  null,
);
assert.equal(
  createAiTryOnFingerprintFromOccurrenceAssignments({
    customDetailsReady: true,
    designSourceReady: true,
    occurrences: missingDesignOccurrences,
    visualInput,
  }),
  null,
  "A missing garment assignment must block the fingerprint even if the stage flag is ready.",
);

const missingWorkflow = reconcileAiTryOnWorkflow({
  state: createEmptyAiTryOnWorkflowState(),
  currentInputFingerprint: null,
  policy: { gatewayAvailable: false, skipAllowed: true },
});
assert.equal(missingWorkflow.status, "awaiting_input");
const missingMarkup = renderTryOn(missingWorkflow);
assert.match(
  missingMarkup,
  /Complete the preceding design choices before using AI Try-on\./,
);

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const fingerprintStart = studioSource.indexOf("const futureAiTryOnInputFingerprint");
const fingerprintEnd = studioSource.indexOf("const futureMeasurementPhysicalGarments");
assert.ok(fingerprintStart >= 0 && fingerprintEnd > fingerprintStart);
const fingerprintBlock = studioSource.slice(fingerprintStart, fingerprintEnd);
assert.equal(fingerprintBlock.includes("activeFutureDesignSource"), false);
assert.match(fingerprintBlock, /futureDesignStyleStepProjection\.occurrences/);
assert.match(fingerprintBlock, /assignment: occurrence\.assignment/);
assert.match(
  fingerprintBlock,
  /createAiTryOnFingerprintFromOccurrenceAssignments/,
);

const tryOnSource = readFileSync(
  "src/components/DormantFutureAiTryOnStep.tsx",
  "utf8",
);
assert.match(tryOnSource, /AI Try-on is currently unavailable/);
assert.match(tryOnSource, /Continue without AI Try-on/);
assert.match(
  tryOnSource,
  /Complete the preceding design choices before using AI Try-on\./,
);

console.log(
  "PASS: AI Try-on fingerprint uses garment occurrence assignments",
);
