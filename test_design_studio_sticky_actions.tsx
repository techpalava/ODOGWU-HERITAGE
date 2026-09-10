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
const incompleteFabricSection = fabricRenderer.root.findByProps({
  "data-stage-id": "fabric",
});
assert.equal(incompleteFabricSection.props["data-bottom-action-reserved"], "true");
assert.match(incompleteFabricSection.props.className, /pb-28/);
assert.match(incompleteFabricSection.props.className, /sm:pb-32/);

await act(async () => {
  fabricRenderer.update(renderFabricStep(completeFabricState));
});
const completeFabricAction = fabricRenderer.root.findByProps({
  "data-testid": "future-fabric-continue-action",
});
assert.equal(completeFabricAction.props["data-docked"], "true");
assert.match(completeFabricAction.props.className, /fixed inset-x-0 bottom-0/);
const completeFabricSection = fabricRenderer.root.findByProps({
  "data-stage-id": "fabric",
});
assert.equal(completeFabricSection.props.className, incompleteFabricSection.props.className);
const fabricForwardButton = findForwardButtons(
  fabricRenderer.root,
  "Continue to Design Style",
);
assert.equal(fabricForwardButton.length, 1);
fabricForwardButton[0].props.onClick();
assert.equal(fabricContinueCalls, 1, "The existing Fabric handler must remain intact.");

await act(async () => {
  fabricRenderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
assert.equal(
  fabricRenderer.root.findByProps({
    "data-testid": "future-fabric-continue-action",
  }).props["data-docked"],
  "true",
  "Inline Fabric targeting must not hide the completed-step action.",
);
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
  "Completion changes must not collapse Step 2's bottom layout reservation.",
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
assert.equal(
  Boolean(
    styleRenderer.root.findByProps({
      "data-testid": "future-design-style-continue-action",
    }).props["data-docked"],
  ),
  false,
  "Design Style must not dock before a catalogue style is selected.",
);

await act(async () => {
  styleRenderer.update(renderStyleStep(true));
});
const completeStyleAction = styleRenderer.root.findByProps({
  "data-testid": "future-design-style-continue-action",
});
assert.equal(completeStyleAction.props["data-docked"], true);
assert.match(completeStyleAction.props.className, /fixed inset-x-0 bottom-0/);
const styleForwardButton = findForwardButtons(
  styleRenderer.root,
  "Continue to Custom Details",
);
assert.equal(styleForwardButton.length, 1);
styleForwardButton[0].props.onClick();
assert.equal(styleContinueCalls, 1, "The existing Style handler must remain intact.");

console.log("PASS: sticky completed Fabric and Design Style actions");
