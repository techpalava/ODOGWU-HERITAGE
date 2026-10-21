/**
 * Step 2 Fabric Guide flow: one merged Guide at the top of the Fabric step that
 * lists what is still needed before Continue to Design Style unlocks, marks the
 * current and done steps, links each step to its target, puts the gold beam on
 * the NEXT action only, and disappears completely once Continue unlocks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import {
  FABRIC_GUIDE_TITLE,
  buildFabricGuideFlow,
  formatFabricGuideCurrentStepAnnouncement,
} from "./src/utils/fabricStepGuideFlow";
import { DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS } from "./src/components/DesignStudioStepGuide";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureFabricStep } = await import("./src/components/DormantFutureFabricStep");

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ---------------------------------------------------------------------------
// 1. Pure flow: order, current step, done steps, merged messages, hidden.
// ---------------------------------------------------------------------------
const garmentsNone = [
  { garmentKey: "base:shirt", label: "Standard Shirt", assigned: false, action: "add_fabric" as const },
  { garmentKey: "base:trouser", label: "Trouser", assigned: false, action: "add_fabric" as const },
];
const firstVisit = buildFabricGuideFlow({
  isComplete: false,
  garments: garmentsNone,
  blockers: [
    { code: "GARMENT_ASSIGNMENT_REQUIRED", message: "Choose a fabric for every selected garment.", garmentKey: "base:shirt" },
    { code: "GARMENT_ASSIGNMENT_REQUIRED", message: "Choose a fabric for every selected garment.", garmentKey: "base:trouser" },
  ],
  selectedFabricQuantity: 0,
});
assert.equal(firstVisit.visible, true);
assert.deepEqual(
  firstVisit.steps.map((step) => [step.id, step.status]),
  [
    ["choose_fabric", "current"],
    ["assign_garment:base:shirt", "upcoming"],
    ["assign_garment:base:trouser", "upcoming"],
  ],
  "first visit: choose a fabric, then each garment in order",
);
assert.deepEqual(firstVisit.currentStep?.target, { type: "catalogue" });
assert.deepEqual(
  firstVisit.currentStep?.messages,
  ["Choose a fabric for every selected garment."],
  "the old needs-attention message is merged into the current step (once)",
);
assert.equal(
  formatFabricGuideCurrentStepAnnouncement(firstVisit),
  "Step 1 of 3: Choose a fabric from the catalogue.",
);

const afterShirt = buildFabricGuideFlow({
  isComplete: false,
  garments: [
    { garmentKey: "base:shirt", label: "Standard Shirt", assigned: true, fabricCode: "A", allocationId: "a1" },
    { garmentKey: "base:trouser", label: "Trouser", assigned: false, action: "assign_to_fabric" },
  ],
  blockers: [
    { code: "GARMENT_ASSIGNMENT_REQUIRED", message: "Choose a fabric for every selected garment.", garmentKey: "base:trouser" },
  ],
  selectedFabricQuantity: 1,
  avoidablePartialGuidance: "Complete your selected Fabric by assigning the remaining garment to it.",
});
assert.deepEqual(
  afterShirt.steps.map((step) => [step.id, step.status, step.label]),
  [
    ["choose_fabric", "done", "Choose a fabric from the catalogue"],
    ["assign_garment:base:shirt", "done", "Standard Shirt has fabric"],
    ["assign_garment:base:trouser", "current", "Assign fabric to Trouser"],
  ],
);
assert.deepEqual(afterShirt.currentStep?.target, {
  type: "garment_action",
  garmentKey: "base:trouser",
});
assert.deepEqual(afterShirt.currentStep?.messages, [
  "Complete your selected Fabric by assigning the remaining garment to it.",
  "Choose a fabric for every selected garment.",
]);
assert.equal(afterShirt.doneCount, 2);

// While the inline catalogue is choosing for Trouser, the beam moves to it.
const choosingForTrouser = buildFabricGuideFlow({
  isComplete: false,
  garments: afterShirt.steps.length ? [
    { garmentKey: "base:shirt", label: "Standard Shirt", assigned: true },
    { garmentKey: "base:trouser", label: "Trouser", assigned: false, action: "add_fabric" },
  ] : [],
  blockers: [],
  selectedFabricQuantity: 1,
  catalogueTargetGarmentKey: "base:trouser",
});
assert.deepEqual(choosingForTrouser.currentStep?.target, { type: "catalogue" });

// Blocking fixes come before the normal flow, in a fixed order.
const blockedFlow = buildFabricGuideFlow({
  isComplete: false,
  garments: [
    { garmentKey: "base:shirt", label: "Standard Shirt", assigned: true, fabricCode: "OUT", allocationId: "a1" },
    { garmentKey: "base:trouser", label: "Trouser", assigned: true, fabricCode: "B", allocationId: "a2" },
  ],
  blockers: [
    { code: "FABRIC_QUANTITY_OVER_ALLOCATED", message: "Too many fabrics." },
    { code: "FABRIC_UNAVAILABLE", message: "A selected fabric is currently unavailable. Choose another fabric.", allocationId: "a1", fabricCode: "OUT" },
    { code: "PENDING_GARMENT_ASSIGNMENT", message: "Finish the pending fabric assignment before continuing." },
    { code: "RAW_FABRIC_INTEGRITY_BLOCKED", message: "Saved Fabric assignments conflict.", garmentKey: "base:gone" },
  ],
  selectedFabricQuantity: 2,
  allocationOrder: ["a1", "a2"],
  orphanRepairKeys: ["a9:base:gone:sig"],
  pendingPanelVisible: true,
});
assert.deepEqual(
  blockedFlow.steps.map((step) => [step.kind, step.status]),
  [
    ["repair_assignment", "current"],
    ["finish_pending", "upcoming"],
    ["replace_fabric", "upcoming"],
    ["fix_quantity", "upcoming"],
    ["choose_fabric", "done"],
    ["assign_garment", "done"],
    ["assign_garment", "done"],
  ],
);
assert.deepEqual(blockedFlow.steps[0]!.target, { type: "orphan_repair", repairKey: "a9:base:gone:sig" });
assert.deepEqual(blockedFlow.steps[1]!.target, { type: "pending_panel" });
assert.deepEqual(blockedFlow.steps[2]!.target, { type: "garment_action", garmentKey: "base:shirt" });
assert.equal(blockedFlow.steps[2]!.label, "Change the fabric for Standard Shirt");
assert.deepEqual(blockedFlow.steps[3]!.target, { type: "garment_remove", garmentKey: "base:trouser" },
  "quantity fix beams the Remove control on the last Fabric Selection");
assert.deepEqual(
  blockedFlow.steps.flatMap((step) => step.messages),
  [
    "Saved Fabric assignments conflict.",
    "Finish the pending fabric assignment before continuing.",
    "A selected fabric is currently unavailable. Choose another fabric.",
    "Too many fabrics.",
  ],
  "every needs-attention message is merged into exactly one flow step",
);

// The beam moves as each step is completed.
const afterRepair = buildFabricGuideFlow({
  isComplete: false,
  garments: [
    { garmentKey: "base:shirt", label: "Standard Shirt", assigned: true, fabricCode: "A", allocationId: "a1" },
    { garmentKey: "base:trouser", label: "Trouser", assigned: true, fabricCode: "B", allocationId: "a2" },
  ],
  blockers: [{ code: "FABRIC_QUANTITY_OVER_ALLOCATED", message: "Too many fabrics." }],
  selectedFabricQuantity: 2,
  allocationOrder: ["a1", "a2"],
});
assert.equal(afterRepair.currentStep?.kind, "fix_quantity");

// Hidden completely when the canonical completion is complete.
const complete = buildFabricGuideFlow({
  isComplete: true,
  garments: [{ garmentKey: "base:shirt", label: "Standard Shirt", assigned: true }],
  blockers: [],
  selectedFabricQuantity: 1,
});
assert.deepEqual(complete, { visible: false, steps: [], currentStep: null, doneCount: 0 });

// ---------------------------------------------------------------------------
// 2. Rendered Fabric step.
// ---------------------------------------------------------------------------
const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const selectionFor = (types: string[]): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: types as Parameters<
      typeof reconcileGarmentTypeStepSelection
    >[0]["selectedGarmentTypes"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
const shirtTrouser = selectionFor(["shirt", "trouser"]);
const fabrics: Fabric[] = ["A", "B"].map((suffix) => ({
  code: `GUIDE-${suffix}`,
  name: `Guide Fabric ${suffix}`,
  description: "Test fabric",
  color: "Blue",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: `https://cdn.example.com/fabrics/guide-${suffix}.jpg`,
}));

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const renderStep = (
  state: FabricAllocationState,
  selection: GarmentTypeStepSelection = shirtTrouser,
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: selection,
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

const assign = (
  state: FabricAllocationState,
  garmentKey: string,
  fabricCode: string,
  selection: GarmentTypeStepSelection = shirtTrouser,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: selection,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} -> ${fabricCode}`);
  return result.state;
};

const focusLog: string[] = [];
const scrollLog: string[] = [];
const createNodeMock = (node: { type: unknown; props: unknown }) => {
  const element = node as { type: unknown; props: Record<string, unknown> };
  const label = String(
    element.props["data-fabric-guide-step"] ??
      element.props["aria-label"] ??
      element.props["data-garment-key"] ??
      element.props["data-catalogue-scroll-anchor"] ??
      element.props.id ??
      element.type,
  );
  return {
    tagName: String(element.type).toUpperCase(),
    isConnected: true,
    tabIndex: element.props.tabIndex ?? 0,
    parentElement: null,
    getAttribute: (name: string) => (element.props[name] as string | undefined) ?? null,
    hasAttribute: (name: string) => element.props[name] !== undefined,
    focus: () => focusLog.push(label),
    scrollIntoView: () => scrollLog.push(label),
  };
};

const render = async (state: FabricAllocationState, selection?: GarmentTypeStepSelection) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(renderStep(state, selection), { createNodeMock });
  });
  return renderer;
};
const beams = (root: ReactTestInstance) =>
  root.findAll(
    (node) =>
      typeof node.type === "string" && node.props["data-fabric-guide-beam"] === "true",
  );
const guides = (root: ReactTestInstance) =>
  root.findAll(
    (node) => typeof node.type === "string" && node.props["data-testid"] === "fabric-guide-flow",
  );

// First visit: Guide at the top (header step-actions note), current = choose.
{
  const renderer = await render(FabricAllocationStateEngine.initialize());
  const [guide] = guides(renderer.root);
  assert.ok(guide, "the Guide renders while Continue is locked");
  assert.equal(guide!.props["data-step-guide"], "active");
  assert.match(String(guide!.props.className), /animate-step-guide-beam/);
  assert.equal(guide!.props["data-fabric-guide-current"], "choose_fabric");
  assert.match(textContent(guide!), new RegExp(FABRIC_GUIDE_TITLE));
  assert.match(textContent(guide!), /Choose a fabric for every selected garment\./,
    "the old needs-attention message is inside the merged Guide");
  const headerNote = renderer.root.find(
    (node) =>
      typeof node.type === "string" &&
      node.props["data-studio-step-actions-slot"] === "header",
  );
  assert.equal(guides(headerNote).length, 1, "the Guide sits in the header, at the top of the step");
  assert.equal(
    renderer.root.findAll((node) => node.props["data-testid"] === "fabric-needs-attention").length,
    0,
    "the old separate needs-attention box is gone",
  );
  const current = guide!.find(
    (node) => typeof node.type === "string" && node.props["aria-current"] === "step",
  );
  assert.equal(current.props["data-fabric-guide-step"], "choose_fabric");
  assert.match(textContent(current), /Current step, step 1:/, "screen-reader text names the current step");
  const beamNodes = beams(renderer.root);
  assert.equal(beamNodes.length, 1, "exactly one gold beam on the next action");
  assert.equal(beamNodes[0]!.props["data-catalogue-scroll-anchor"], "true");
  assert.match(String(beamNodes[0]!.props.className), new RegExp(DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS.split(" ")[0]!));
  // Link scrolls/focuses the catalogue.
  focusLog.length = 0;
  scrollLog.length = 0;
  const link = guide!.find(
    (node) => node.type === "button" && node.props["data-fabric-guide-link"] === "choose_fabric",
  );
  await act(async () => link.props.onClick());
  assert.ok(scrollLog.includes("true"), "the catalogue anchor scrolls into view");
  assert.equal(
    renderer.root.findAll((node) => node.props["data-testid"] === "future-fabric-continue-action").length,
    0,
  );
}

// After the Shirt has fabric: beam moves to the Trouser's action button.
{
  const state = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "GUIDE-A");
  const renderer = await render(state);
  const [guide] = guides(renderer.root);
  assert.equal(guide!.props["data-fabric-guide-current"], "assign_garment:base:trouser");
  const statuses = guide!
    .findAll((node) => typeof node.type === "string" && node.props["data-fabric-guide-step"])
    .map((node) => [node.props["data-fabric-guide-step"], node.props["data-fabric-guide-step-status"]]);
  assert.deepEqual(statuses, [
    ["choose_fabric", "done"],
    ["assign_garment:base:shirt", "done"],
    ["assign_garment:base:trouser", "current"],
  ]);
  const beamNodes = beams(renderer.root);
  assert.equal(beamNodes.length, 1);
  assert.equal(beamNodes[0]!.type, "button");
  assert.equal(beamNodes[0]!.props["data-testid"], "assign-to-fabric-base:trouser");
  assert.match(String(beamNodes[0]!.props.className), /animate-step-guide-beam/);
  // Avoidable-partial hint is merged into the Guide (still identifiable).
  assert.equal(guide!.findAll((node) => node.props["data-avoidable-partial-guidance"] === "true").length, 1);
  assert.match(textContent(guide!), /Complete your selected Fabric by assigning the remaining garment to it\./);
  // Link focuses the Trouser action.
  focusLog.length = 0;
  const link = guide!.find(
    (node) => node.type === "button" && node.props["data-fabric-guide-link"] === "assign_garment:base:trouser",
  );
  await act(async () => link.props.onClick());
  assert.deepEqual(focusLog, ["Assign fabric for Trouser"]);
  assert.ok(scrollLog.includes("base:trouser"));
  // Guide links are real buttons (keyboard-focusable).
  for (const button of guide!.findAll((node) => node.type === "button")) {
    assert.equal(button.props.type, "button");
    assert.notEqual(button.props.tabIndex, -1);
  }
}

// Complete: Guide and every Fabric beam are gone; Continue shows with glow.
{
  let state = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "GUIDE-A");
  state = assign(state, "base:trouser", "GUIDE-A");
  const renderer = await render(state);
  assert.equal(guides(renderer.root).length, 0, "Guide always disappears when Continue unlocks");
  assert.equal(beams(renderer.root).length, 0, "no Fabric beam once Continue unlocks");
  assert.equal(
    renderer.root.findAll(
      (node) => typeof node.type === "string" && /animate-step-guide-beam/.test(String(node.props.className ?? "")),
    ).length,
    0,
  );
  const forwards = renderer.root.findAll(
    (node) => node.type === "button" && node.props["data-studio-nav"] === "forward",
  );
  assert.equal(forwards.length, 2, "header and docked footer Continue");
  for (const forward of forwards) {
    assert.equal(forward.props["data-continue-unlock-glow"], "on");
    assert.match(String(forward.props.className), /animate-continue-unlock-glow/);
  }
}

// Over-allocated saved draft: beam lands on the Remove control at fault.
{
  const threeGarments = selectionFor(["shirt", "trouser", "agbada"]);
  const agbadaKeys = getFutureGarmentFabricPlanning({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: FabricAllocationStateEngine.initialize(),
  });
  assert.ok(agbadaKeys.requiredFabricQuantity >= 2, "fixture needs two Fabrics for three garments");
  let state = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "GUIDE-A", threeGarments);
  state = assign(state, "base:trouser", "GUIDE-B", threeGarments);
  const renderer = await render(state, shirtTrouser);
  const [guide] = guides(renderer.root);
  assert.ok(guide);
  assert.equal(guide!.props["data-fabric-guide-current"], "fix_quantity");
  assert.equal(guide!.props["data-fabric-quantity-over-allocated"], "true");
  assert.match(textContent(guide!), /Fix your fabric quantity/);
  const beamNodes = beams(renderer.root);
  assert.equal(beamNodes.length, 1);
  assert.equal(beamNodes[0]!.props["aria-label"], "Remove fabric from Trouser");
}

// ---------------------------------------------------------------------------
// 3. Source: one cue, not two.
// ---------------------------------------------------------------------------
const source = readFileSync("src/components/DormantFutureFabricStep.tsx", "utf8");
assert.doesNotMatch(source, /animate-step2-next-unassigned/,
  "the next-unassigned gold ring is replaced by the Guide beam");
assert.doesNotMatch(source, /title="Fabric needs attention"/);
assert.match(source, /DESIGN_STUDIO_STEP_GUIDE_BEAM_CLASS/);

console.log("test_fabric_guide_flow: PASS");
