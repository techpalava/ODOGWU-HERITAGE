import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, StyleCategory } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabric: Fabric = {
  code: "STICKY-FABRIC",
  name: "Sticky Test Fabric",
  description: "A valid test fabric.",
  color: "Green",
  colorHex: "#0A4A33",
  category: "Test",
  price: 10,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
};
const incompleteFabricState = FabricAllocationStateEngine.initialize();
const completeFabricState = assignFutureFabricToGarment({
  state: incompleteFabricState,
  garmentTypeSelection,
  garmentKey: "base:shirt",
  fabricCode: fabric.code,
}).state;
const fabricPlanning = getFutureGarmentFabricPlanning({
  garmentTypeSelection,
  fabricAllocationState: completeFabricState,
});

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const findForwardButtons = (root: ReactTestInstance, label: string) =>
  root
    .findAllByType("button")
    .filter((button) => textContent(button).includes(label));

let fabricContinueCalls = 0;
const renderFabricStep = (state = incompleteFabricState) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: state,
    fabrics: [fabric],
  });
  return (
    <DormantFutureFabricStep
      fabrics={[fabric]}
      garmentTypeSelection={garmentTypeSelection}
      fabricAllocationState={state}
      completion={completion}
      requiredFabricQuantity={fabricPlanning.requiredFabricQuantity}
      selectedFabricQuantity={state.fabricAllocations.length}
      constructionPrice={65}
      onAssignFabricToGarment={() => undefined}
      onChangeFabricAllocationProduct={() => undefined}
      onRemoveFabricFromGarment={() => undefined}
      onUseSameFabricForGarment={() => undefined}
      onAssignSameFabricProduct={() => undefined}
      onAssignGarmentToExistingAllocation={() => undefined}
      onBack={() => undefined}
      onContinue={() => {
        fabricContinueCalls += 1;
      }}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={() => undefined}
      onCancelPendingFabric={() => undefined}
    />
  );
};

let fabricRenderer!: ReturnType<typeof create>;
await act(async () => {
  fabricRenderer = create(renderFabricStep());
});
assert.equal(
  fabricRenderer.root.findAllByProps({
    "data-testid": "future-fabric-continue-action",
  }).length,
  0,
  "An incomplete Fabric step must not render a hidden or focusable Continue action.",
);
assert.equal(
  findForwardButtons(fabricRenderer.root, "Continue to Design Style").length,
  0,
  "Fabric must expose its forward action only when completion permits it.",
);
const isViewportFixed = (className: string | undefined) =>
  /fixed/.test(className || "") && /bottom-0/.test(className || "");
const documentOrder = (root: ReactTestInstance, testIds: string[]) =>
  root
    .findAll((node) => testIds.includes(node.props?.["data-testid"]))
    .map((node) => node.props["data-testid"] as string);

const incompleteFabricSection = fabricRenderer.root.findByProps({
  "data-stage-id": "fabric",
});
assert.equal(incompleteFabricSection.props["data-bottom-action-reserved"], undefined);
assert.doesNotMatch(incompleteFabricSection.props.className, /pb-28/);
assert.doesNotMatch(incompleteFabricSection.props.className, /sm:pb-32/);

await act(async () => {
  fabricRenderer.update(renderFabricStep(completeFabricState));
});
const completeFabricAction = fabricRenderer.root.findByProps({
  "data-testid": "future-fabric-continue-action",
});
assert.equal(completeFabricAction.props["data-docked"], undefined);
assert.equal(isViewportFixed(completeFabricAction.props.className), false);
assert.ok(
  completeFabricAction.findAllByType("button").some((button) =>
    textContent(button).includes("Continue to Design Style"),
  ),
  "An unlocked Fabric step shows Continue in the bottom action area.",
);
assert.deepEqual(
  documentOrder(fabricRenderer.root, [
    "future-fabric-inline-catalogue",
    "future-fabric-continue-action",
  ]),
  ["future-fabric-inline-catalogue", "future-fabric-continue-action"],
  "Fabric Continue sits after the catalogue content.",
);
const completeFabricSection = fabricRenderer.root.findByProps({
  "data-stage-id": "fabric",
});
assert.equal(completeFabricSection.props.className, incompleteFabricSection.props.className);
const fabricForwardButton = findForwardButtons(
  fabricRenderer.root,
  "Continue to Design Style",
);
assert.equal(fabricForwardButton.length, 2);
fabricForwardButton[0].props.onClick();
assert.equal(fabricContinueCalls, 1, "The existing Fabric handler must remain intact.");

await act(async () => {
  fabricRenderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
const fabricContinueWhileEditing = fabricRenderer.root.findByProps({
  "data-testid": "future-fabric-continue-action",
});
assert.equal(
  fabricContinueWhileEditing.props["data-docked"],
  undefined,
  "Inline Fabric targeting must not hide the completed-step action.",
);
assert.equal(isViewportFixed(fabricContinueWhileEditing.props.className), false);
assert.match(
  textContent(fabricRenderer.root),
  /Changing Fabric for Fabric Selection 1/,
);
assert.equal(
  fabricRenderer.root.findByProps({
    "data-testid": "future-fabric-inline-catalogue",
  }).props["data-catalogue-dialog-open"],
  false,
  "Changing a garment assignment must keep the catalogue inline.",
);

await act(async () => {
  fabricRenderer.update(renderFabricStep());
});
assert.equal(
  fabricRenderer.root.findAllByProps({
    "data-testid": "future-fabric-continue-action",
  }).length,
  0,
  "Invalidating Fabric completion must remove the actual forward action.",
);
assert.equal(
  fabricRenderer.root.findByProps({ "data-stage-id": "fabric" }).props.className,
  completeFabricSection.props.className,
  "Completion changes must not add a viewport dock spacer under Fabric.",
);

const compatibleStyle: StyleCategory = {
  id: "sticky-style",
  name: "Sticky Style",
  description: "A compatible test style.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    { key: "base:shirt", garmentType: "shirt", fabricUnits: 1 },
  ],
};
let styleContinueCalls = 0;
const renderStyleStep = (complete: boolean) => {
  const model = createDesignStyleStepTestModel({
    styles: [compatibleStyle],
    garmentTypeSelection,
    selectedStyleIdByGarmentKey: complete
      ? { "base:shirt:1": compatibleStyle.id }
      : {},
  });
  return (
    <DormantFutureDesignStyleStep
      {...createDesignStyleStepRenderProps(model)}
      stagePrice={65}
      onContinue={() => {
        styleContinueCalls += 1;
      }}
    />
  );
};

let styleRenderer!: ReturnType<typeof create>;
await act(async () => {
  styleRenderer = create(renderStyleStep(false));
});
const incompleteStyleAction = styleRenderer.root.findByProps({
  "data-testid": "future-design-style-continue-action",
});
assert.equal(
  Boolean(incompleteStyleAction.props["data-docked"]),
  false,
  "Design Style must not dock before a catalogue style is selected.",
);
assert.equal(isViewportFixed(incompleteStyleAction.props.className), false);
const incompleteFooterButtons = incompleteStyleAction
  .findByProps({ "data-studio-step-actions-buttons": "true" })
  .findAllByType("button");
assert.deepEqual(
  incompleteFooterButtons.map((button) => button.props["data-studio-nav"]),
  ["back", "forward"],
  "An incomplete Design Style footer keeps Back and locked Continue on one row.",
);
assert.equal(incompleteFooterButtons[1].props.disabled, true);
assert.ok(
  incompleteStyleAction.findByProps({ "data-studio-step-actions-note": "true" }),
);

await act(async () => {
  styleRenderer.update(renderStyleStep(true));
});
const completeStyleAction = styleRenderer.root.findByProps({
  "data-testid": "future-design-style-continue-action",
});
assert.equal(completeStyleAction.props["data-docked"], undefined);
assert.equal(isViewportFixed(completeStyleAction.props.className), false);
assert.doesNotMatch(
  styleRenderer.root.findByProps({ "data-stage-id": "design_style" }).props.className,
  /pb-28/,
);
const completeFooterButtons = completeStyleAction
  .findByProps({ "data-studio-step-actions-buttons": "true" })
  .findAllByType("button");
assert.deepEqual(
  completeFooterButtons.map((button) => button.props["data-studio-nav"]),
  ["back", "forward"],
  "A complete Design Style footer keeps Back and enabled Continue on one row.",
);
assert.equal(completeFooterButtons[1].props.disabled, false);
assert.equal(
  completeStyleAction.findAll(
    (node) => node.props?.["data-studio-step-actions-note"] === "true",
  ).length,
  0,
);
assert.ok(
  textContent(completeFooterButtons[1]).includes("Continue to Custom Details"),
  "An unlocked Design Style step shows Continue in the bottom action row.",
);
assert.deepEqual(
  documentOrder(styleRenderer.root, [
    "step3-assignment-progress",
    "future-design-style-continue-action",
  ]),
  ["step3-assignment-progress", "future-design-style-continue-action"],
  "Design Style Continue sits after the garment assignment content.",
);
const styleForwardButton = findForwardButtons(
  styleRenderer.root,
  "Continue to Custom Details",
);
assert.equal(styleForwardButton.length, 2);
styleForwardButton[0].props.onClick();
assert.equal(styleContinueCalls, 1, "The existing Style handler must remain intact.");

console.log("PASS: inline completed Fabric and Design Style actions");
