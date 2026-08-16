import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import type { Fabric } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  assignFutureFabricToGarment,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabrics: Fabric[] = [
  {
    code: "INLINE-A",
    name: "Inline Heritage A",
    description: "First inline test fabric.",
    color: "Green",
    colorHex: "#0A4A33",
    category: "Test",
    price: 10,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  },
  {
    code: "INLINE-B",
    name: "Inline Heritage B",
    description: "Second inline test fabric.",
    color: "Gold",
    colorHex: "#B28A3B",
    category: "Test",
    price: 20,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  },
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const findButton = (root: ReactTestInstance, text: string) =>
  root
    .findAllByType("button")
    .find((button) => textContent(button).includes(text));

const renderStep = (
  state = FabricAllocationStateEngine.initialize(),
  onAssign: (fabric: Fabric, garmentKey: string) => void = () => undefined,
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState: state,
  });
  return (
    <DormantFutureFabricStep
      fabrics={fabrics}
      garmentTypeSelection={garmentTypeSelection}
      fabricAllocationState={state}
      completion={completion}
      requiredFabricQuantity={planning.requiredFabricQuantity}
      selectedFabricQuantity={planning.selectedFabricQuantity}
      constructionPrice={65}
      onAssignFabricToGarment={onAssign}
      onUseSameFabricForGarment={() => undefined}
      onBack={() => undefined}
      onContinue={() => undefined}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={() => undefined}
      onCancelPendingFabric={() => undefined}
    />
  );
};

let assigned: Array<{ fabricCode: string; garmentKey: string }> = [];
let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(
    renderStep(
      FabricAllocationStateEngine.initialize(),
      (fabric, garmentKey) => assigned.push({ fabricCode: fabric.code, garmentKey }),
    ),
  );
});

assert.equal(
  renderer.root.findAllByProps({ "data-testid": "future-fabric-inline-catalogue" })
    .length,
  1,
  "Fresh Step 2 must render one inline Fabric catalogue.",
);
const freshConfirm = findButton(renderer.root, "Select Fabric");
assert.ok(freshConfirm);
assert.equal(freshConfirm.props.disabled, true);

await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Add fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
assert.match(
  textContent(renderer.root),
  /Choosing fabric for: Standard Shirt/,
  "Add Fabric must activate the clicked garment target.",
);

const firstCard = renderer.root.findAllByProps({ "data-fabric-card": "true" })[0];
await act(async () => firstCard.props.onClick());
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-card": "true" })[0].props[
    "aria-pressed"
  ], true);
assert.equal(assigned.length, 0, "Selecting a card must not assign Fabric yet.");
assert.equal(findButton(renderer.root, "Select Fabric")?.props.disabled, false);

const secondCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card !== firstCard);
assert.ok(secondCard);
await act(async () => secondCard.props.onClick());
assert.equal(assigned.length, 0, "A replacement card selection remains temporary.");
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-card": "true" })[1].props[
    "aria-pressed"
  ], true,
);

await act(async () => findButton(renderer.root, "Select Fabric")!.props.onClick());
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-B", garmentKey: "base:shirt" },
]);
assert.doesNotMatch(textContent(renderer.root), /Choosing fabric for: Standard Shirt/);

const assignedState = assignFutureFabricToGarment({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection,
  garmentKey: "base:shirt",
  fabricCode: "INLINE-A",
}).state;
assigned = [];
await act(async () => {
  renderer.update(
    renderStep(
      assignedState,
      (fabric, garmentKey) => assigned.push({ fabricCode: fabric.code, garmentKey }),
    ),
  );
});
await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});
assert.match(textContent(renderer.root), /Inline Heritage A \(INLINE-A\)/);
await act(async () =>
  renderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B")!.props.onClick(),
);
assert.equal(assigned.length, 0, "Change Fabric must preserve the old assignment until confirmation.");
await act(async () => findButton(renderer.root, "Select Fabric")!.props.onClick());
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-B", garmentKey: "base:shirt" },
]);

assigned = [];
await act(async () => renderer.update(renderStep()));
await act(async () =>
  renderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => findButton(renderer.root, "Select Fabric")!.props.onClick());
assert.equal(
  renderer.root.findByProps({
    "data-testid": "future-fabric-inline-catalogue",
  }).props["data-catalogue-dialog-open"],
  true,
  "A temporary selection without a target must open the garment chooser.",
);
assert.equal(assigned.length, 0, "The chooser path must not guess or assign a garment.");
await act(async () => findButton(renderer.root, "Cancel")!.props.onClick());
assert.equal(assigned.length, 0, "Cancelling the chooser must leave allocation state unchanged.");

console.log("PASS: inline Fabric catalogue target and confirmation flow");
