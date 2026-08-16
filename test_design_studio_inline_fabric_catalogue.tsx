import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { DormantFutureFabricStep } from "./src/components/DormantFutureFabricStep";
import type { Fabric, GarmentTypeStepSelection } from "./src/types";
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
const threeGarmentSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
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
  selection: GarmentTypeStepSelection = garmentTypeSelection,
  onUseSameFabricForGarment: (garmentKey: string) => void = () => undefined,
  onChooseAnotherFabric: () => void = () => undefined,
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
  return (
    <DormantFutureFabricStep
      fabrics={fabrics}
      garmentTypeSelection={selection}
      fabricAllocationState={state}
      completion={completion}
      requiredFabricQuantity={planning.requiredFabricQuantity}
      selectedFabricQuantity={planning.selectedFabricQuantity}
      constructionPrice={65}
      onAssignFabricToGarment={onAssign}
      onUseSameFabricForGarment={onUseSameFabricForGarment}
      onBack={() => undefined}
      onContinue={() => undefined}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={onChooseAnotherFabric}
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
assert.match(
  textContent(renderer.root),
  /Choose a fabric to begin\. Your selection is not assigned until you confirm below\./,
);

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
assert.match(
  textContent(renderer.root),
  /Choose a fabric for Standard Shirt, then confirm below\./,
);

const firstCard = renderer.root.findAllByProps({ "data-fabric-card": "true" })[0];
await act(async () => firstCard.props.onClick());
assert.equal(
  renderer.root.findAllByProps({ "data-fabric-card": "true" })[0].props[
    "aria-pressed"
  ], true);
assert.match(
  textContent(renderer.root),
  /Selected temporarily\. Select Fabric to assign it to Standard Shirt\./,
);
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
assert.match(textContent(renderer.root), /Assigned/);
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

let sharedState = FabricAllocationStateEngine.initialize();
sharedState = assignFutureFabricToGarment({
  state: sharedState,
  garmentTypeSelection: threeGarmentSelection,
  garmentKey: "base:shirt",
  fabricCode: "INLINE-A",
}).state;
let useSameTarget = "";
let chooseAnotherCalls = 0;
let capacityRenderer!: ReturnType<typeof create>;
await act(async () => {
  capacityRenderer = create(
    renderStep(
      sharedState,
      () => undefined,
      threeGarmentSelection,
      (garmentKey) => {
        useSameTarget = garmentKey;
      },
      () => {
        chooseAnotherCalls += 1;
      },
    ),
  );
});
assert.equal(
  capacityRenderer.root.findAllByProps({ role: "status" }).length,
  1,
  "A confirmed eligible assignment must show the capacity offer.",
);
assert.match(
  textContent(capacityRenderer.root),
  /Your fabric can carry one more garment\. \(Optional\)/,
);
assert.match(textContent(capacityRenderer.root), /Next: Trouser/);
await act(async () =>
  findButton(capacityRenderer.root, "Use Same Fabric")!.props.onClick(),
);
assert.equal(useSameTarget, "base:trouser");

let capacityRenderer2!: ReturnType<typeof create>;
await act(async () => {
  capacityRenderer2 = create(
    renderStep(
      sharedState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => {
        chooseAnotherCalls += 1;
      },
    ),
  );
});
await act(async () =>
  findButton(capacityRenderer2.root, "Select Different Fabric")!.props.onClick({
    currentTarget: {},
  }),
);
assert.equal(chooseAnotherCalls, 1);
assert.match(
  textContent(capacityRenderer2.root),
  /Choosing fabric for: Trouser/,
);
assert.doesNotMatch(
  textContent(capacityRenderer2.root),
  /Your fabric can carry one more garment\. \(Optional\)/,
  "Selecting another Fabric must dismiss the exact capacity offer.",
);
assert.equal(
  capacityRenderer2.root.findByProps({
    "data-testid": "future-fabric-inline-catalogue",
  }).props["data-catalogue-dialog-open"],
  false,
);
assert.equal(
  capacityRenderer2.root.findAllByProps({ "aria-pressed": true }).length,
  0,
  "Selecting another Fabric must not preselect a new Fabric.",
);

const invalidOfferState = assignFutureFabricToGarment({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: threeGarmentSelection,
  garmentKey: "base:shirt",
  fabricCode: "MISSING-FABRIC",
}).state;
let invalidOfferRenderer!: ReturnType<typeof create>;
await act(async () => {
  invalidOfferRenderer = create(
    renderStep(invalidOfferState, () => undefined, threeGarmentSelection),
  );
});
assert.doesNotMatch(
  textContent(invalidOfferRenderer.root),
  /Your fabric can carry one more garment\. \(Optional\)/,
  "An offer for a missing catalogue fabric must remain hidden.",
);

console.log("PASS: inline Fabric catalogue target and confirmation flow");
