/**
 * Step 2 garment Fabric cards line up (assigned and unassigned alike), and the
 * status box uses clear wording, including a complete state.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { GARMENT_CARD_FABRIC_PHOTO_CLASSNAME } from "./src/components/AssignedFabricPreview";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const {
  DormantFutureFabricStep,
  FABRIC_PROGRESS_COMPLETE_HEADING,
  formatFabricProgressCompleteSummary,
  formatFabricSelectionProgress,
  formatGarmentAssignmentProgress,
} = await import("./src/components/DormantFutureFabricStep");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// --- Wording and pluralization ---
assert.equal(FABRIC_PROGRESS_COMPLETE_HEADING, "All garments have fabric");
assert.equal(formatFabricProgressCompleteSummary(1, 1), "1 fabric covers your 1 garment.");
assert.equal(formatFabricProgressCompleteSummary(1, 2), "1 fabric covers your 2 garments.");
assert.equal(formatFabricProgressCompleteSummary(2, 3), "2 fabrics cover your 3 garments.");
assert.equal(formatFabricProgressCompleteSummary(5, 9), "5 fabrics cover your 9 garments.");
assert.equal(formatFabricSelectionProgress(1, 2), "Fabrics chosen: 1 of 2 needed");
assert.equal(formatFabricSelectionProgress(2, 2), "Fabrics chosen: 2 of 2 needed");
assert.equal(formatFabricSelectionProgress(3, 2), "Fabrics chosen: 3 (2 needed)");
assert.equal(formatFabricSelectionProgress(4, 1), "Fabrics chosen: 4 (1 needed)");
assert.equal(formatGarmentAssignmentProgress(1, 3), "Garments with fabric: 1 of 3");

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const shirtTrouser: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabrics: Fabric[] = ["A", "B"].map((suffix) => ({
  code: `ALIGN-${suffix}`,
  name: `Align Fabric ${suffix}`,
  description: "Test fabric",
  color: "Blue",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: `https://cdn.example.com/fabrics/align-${suffix}.jpg`,
}));

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const renderStep = (state: FabricAllocationState) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: () => undefined,
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: () => undefined,
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const assign = (state: FabricAllocationState, garmentKey: string, fabricCode: string) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: shirtTrouser,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned");
  return result.state;
};

const hostChildren = (node: ReactTestInstance) =>
  node.children.filter((child): child is ReactTestInstance => typeof child !== "string");

// --- Mixed row: one assigned card, one unassigned card ---
const mixedState = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "ALIGN-A");
let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(mixedState));
});
const assignedCard = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const unassignedCard = renderer.root.findByProps({
  "data-garment-key": "base:trouser",
  "data-assignment-status": "unassigned",
});
for (const card of [assignedCard, unassignedCard]) {
  assert.match(String(card.props.className), /\bflex\b/);
  assert.match(String(card.props.className), /\bflex-col\b/);
  const [content, action] = hostChildren(card);
  assert.match(
    String(content.props.className),
    /\bflex-1\b/,
    "card content grows so the action button pins to the bottom of every card",
  );
  assert.equal(content.props["data-garment-card-layout"], "photo-left");
  const topRow = content.findByProps({ "data-garment-card-top-row": "true" });
  const [photoSlot] = hostChildren(topRow);
  assert.equal(photoSlot.props["data-garment-card-photo"], "true", "the fabric photo is on the left");
  const [photo] = hostChildren(photoSlot);
  assert.ok(
    photo.props.className === GARMENT_CARD_FABRIC_PHOTO_CLASSNAME ||
      photo.props["data-unassigned-fabric-placeholder"] === "true",
    "the fabric photo (or its placeholder) fills the left photo slot",
  );
  assert.equal(action.type, "button", "the action button is the last item in every card");
  const badge = card.findByProps({ "data-garment-fabric-badge": "true" });
  const statusRow = card.findByProps({ "data-garment-card-status-row": "true" });
  assert.ok(
    statusRow.findAll((node) => node === badge).length === 1,
    "the ASSIGNED / Needs fabric tag sits beside the photo",
  );
}
assert.equal(
  hostChildren(assignedCard)[0].props.className,
  hostChildren(unassignedCard)[0].props.className,
  "assigned and unassigned cards share one content layout",
);
const placeholder = unassignedCard.findByProps({ "data-unassigned-fabric-placeholder": "true" });
for (const sizeClass of GARMENT_CARD_FABRIC_PHOTO_CLASSNAME.split(" ").filter((name) => /h-|w-/.test(name))) {
  assert.ok(
    String(placeholder.props.className).split(" ").includes(sizeClass),
    `placeholder keeps the Fabric image size (${sizeClass})`,
  );
}
assert.equal(placeholder.props["aria-hidden"], "true");
assert.equal(
  unassignedCard.findAllByProps({ "data-assigned-fabric-preview": "true" }).length,
  0,
);

// Incomplete status box keeps clear counts.
let progress = renderer.root.findByProps({ "data-fabric-progress": "true" });
assert.equal(progress.props["data-fabric-progress-state"], "in_progress");
assert.equal(
  textContent(progress.findByProps({ "data-fabric-selection-progress": "true" })),
  "Fabrics chosen: 1 of 1 needed",
);
assert.equal(
  textContent(progress.findByProps({ "data-garment-assignment-progress": "true" })),
  "Garments with fabric: 1 of 2",
);

// --- Complete: every garment has fabric ---
const completeState = assign(mixedState, "base:trouser", "ALIGN-A");
await act(async () => {
  renderer.update(renderStep(completeState));
});
progress = renderer.root.findByProps({ "data-fabric-progress": "true" });
assert.equal(progress.props["data-fabric-progress-state"], "complete");
assert.equal(
  textContent(progress.findByProps({ "data-fabric-progress-complete-heading": "true" })),
  "All garments have fabric",
);
assert.equal(
  textContent(progress.findByProps({ "data-fabric-progress-complete-summary": "true" })),
  "1 fabric covers your 2 garments.",
);
assert.equal(progress.findAllByProps({ "data-fabric-selection-progress": "true" }).length, 0);
assert.match(String(progress.props.className), /heritage-green/);

// --- More pieces than Fabrics Needed (one piece per garment) completes ---
let overState = FabricAllocationStateEngine.createAllocationForFabric(
  FabricAllocationStateEngine.initialize(),
  "ALIGN-A",
);
overState = FabricAllocationStateEngine.attemptAppendGarment(overState, {
  code: "BASE_SHIRT",
  garmentSpec: { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  sourceRole: "main",
});
overState = FabricAllocationStateEngine.createAllocationForFabric(overState, "ALIGN-B");
overState = FabricAllocationStateEngine.attemptAppendGarment(overState, {
  code: "BASE_TROUSER",
  garmentSpec: { key: "base:trouser", garmentType: "trouser", fabricUnits: 1 },
  sourceRole: "main",
});
await act(async () => {
  renderer.update(renderStep(overState));
});
progress = renderer.root.findByProps({ "data-fabric-progress": "true" });
assert.equal(progress.props["data-fabric-progress-state"], "complete");
assert.equal(
  textContent(progress.findByProps({ "data-fabric-progress-complete-summary": "true" })),
  "2 fabrics cover your 2 garments.",
);
assert.doesNotMatch(textContent(renderer.root), /Your saved Fabric selections use/);
act(() => renderer.unmount());

console.log("PASS: Step 2 Fabric cards align and the status box wording is clear");
