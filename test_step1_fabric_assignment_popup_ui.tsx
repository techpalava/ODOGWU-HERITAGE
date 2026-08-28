import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  assignSameFabricProductToGarments,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { applyFutureFabricCardSelection } from "./src/utils/designStudioFutureFabricStage";
import {
  STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE,
  STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
} from "./src/utils/step1FabricAssignmentPopup";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const threeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "dress"],
  selectedDemographics: ["unisex"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fabrics: Fabric[] = [
  {
    code: "FAB-A",
    name: "Royal Forest Ankara",
    description: "Test fabric A",
    color: "Green",
    colorHex: "#0A4A33",
    category: "Test",
    price: 10,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  },
  {
    code: "FAB-B",
    name: "Heritage B",
    description: "Test fabric B",
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

const constructionPrice = threeSelection.garmentTypes.reduce((total, garmentType) => {
  const resolution = resolveGarmentConstructionPricing(garmentType, catalog);
  return resolution.status === "resolved" ? total + resolution.totalPrice : total;
}, 0);

let continueClicks = 0;
const renderStep = (
  state: FabricAllocationState,
  onAssignSameFabricProduct: (
    fabricCode: string,
    garmentKeys: string[],
  ) => ReturnType<typeof assignSameFabricProductToGarments> | void,
  onAssignFabricToGarment: (
    fabric: Fabric,
    garmentKey: string,
  ) => FabricAllocationState | void = () => undefined,
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: threeSelection,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: threeSelection,
    fabricAllocationState: state,
  });
  return (
    <DormantFutureFabricStep
      fabrics={fabrics}
      garmentTypeSelection={threeSelection}
      fabricAllocationState={state}
      completion={completion}
      requiredFabricQuantity={planning.requiredFabricQuantity}
      selectedFabricQuantity={planning.selectedFabricQuantity}
      constructionPrice={constructionPrice}
      onAssignFabricToGarment={onAssignFabricToGarment}
      onRemoveFabricFromGarment={() => undefined}
      onUseSameFabricForGarment={() => undefined}
      onAssignSameFabricProduct={onAssignSameFabricProduct}
      onBack={() => undefined}
      onContinue={() => {
        continueClicks += 1;
      }}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={() => undefined}
      onCancelPendingFabric={() => undefined}
    />
  );
};

let state = FabricAllocationStateEngine.initialize();
const applyBulk = (fabricCode: string, garmentKeys: string[]) => {
  const result = assignSameFabricProductToGarments({
    state,
    garmentTypeSelection: threeSelection,
    fabricCode,
    garmentKeys,
  });
  if (result.status === "assigned") state = result.state;
  return result;
};

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(state, applyBulk));
});

const fabricCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "FAB-A");
assert.ok(fabricCard);
assert.equal(fabricCard.props["data-fabric-status"], "SELECT");
await act(async () => fabricCard.props.onClick({ currentTarget: {} }));
await act(async () => renderer.update(renderStep(state, applyBulk)));

assert.deepEqual(state.fabricAllocations, []);
const dialog = renderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.match(textContent(dialog), /Assign Fabric to Garments/);
assert.match(textContent(dialog), /Choose which garments should use this Fabric/);
assert.match(textContent(dialog), /Royal Forest Ankara/);
assert.match(textContent(dialog), /FAB-A/);
assert.doesNotMatch(textContent(dialog), /10\.00|€10|EUR 10/);
assert.ok(dialog.findByProps({ "data-step1-fabric-assignment-row": "base:shirt" }));
assert.ok(dialog.findByProps({ "data-step1-fabric-assignment-row": "base:trouser" }));
assert.ok(dialog.findByProps({ "data-step1-fabric-assignment-row": "base:dress" }));
assert.equal(findButton(dialog, "Assign to Selected (0)")?.props.disabled, true);

await act(async () =>
  dialog
    .findByProps({ "data-step1-fabric-assignment-checkbox": "base:shirt" })
    .props.onChange({ currentTarget: { checked: true } }),
);
await act(async () => renderer.update(renderStep(state, applyBulk)));
const selectedDialog = renderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.ok(findButton(selectedDialog, "Assign to Selected (1)"));
await act(async () =>
  findButton(selectedDialog, "Assign to Selected (1)")!.props.onClick(),
);
await act(async () => renderer.update(renderStep(state, applyBulk)));
assert.deepEqual(
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt"],
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  0,
);
assert.equal(continueClicks, 0);
assert.equal(
  renderer.root.findAllByProps({ "data-stage-id": "fabric" }).length,
  1,
);

const reusedCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "FAB-A");
assert.equal(reusedCard?.props["data-fabric-status"], "USE AGAIN");
await act(async () => reusedCard?.props.onClick({ currentTarget: {} }));
await act(async () => renderer.update(renderStep(state, applyBulk)));
const reuseDialog = renderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.ok(reuseDialog.findByProps({ "data-step1-fabric-assignment-row": "base:trouser" }));
assert.ok(reuseDialog.findByProps({ "data-step1-fabric-assignment-row": "base:dress" }));
assert.equal(
  reuseDialog.findAllByProps({
    "data-step1-fabric-assignment-row": "base:shirt",
  }).length,
  0,
);

await act(async () =>
  reuseDialog.findByProps({ "data-testid": "step1-fabric-assignment-cancel" }).props.onClick(),
);
await act(async () => renderer.update(renderStep(state, applyBulk)));
assert.deepEqual(
  state.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt"],
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  0,
);

state = FabricAllocationStateEngine.initialize();
await act(async () => renderer.update(renderStep(state, applyBulk)));
const freshCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "FAB-A");
await act(async () => freshCard?.props.onClick({ currentTarget: {} }));
await act(async () => renderer.update(renderStep(state, applyBulk)));
await act(async () =>
  renderer.root
    .findByProps({ "data-testid": "step1-fabric-assignment-use-for-all" })
    .props.onClick(),
);
await act(async () => renderer.update(renderStep(state, applyBulk)));
assert.deepEqual(
  state.fabricAllocations
    .flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    )
    .sort(),
  ["base:dress", "base:shirt", "base:trouser"],
);
assert.equal(continueClicks, 0);

state = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: threeSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
await act(async () => renderer.update(renderStep(state, applyBulk)));
const leftoverCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "FAB-A");
assert.equal(leftoverCard?.props["data-fabric-status"], "USE AGAIN");
await act(async () => leftoverCard?.props.onClick({ currentTarget: {} }));
await act(async () => renderer.update(renderStep(state, applyBulk)));
const leftoverDialog = renderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.equal(
  leftoverDialog.findByProps({
    "data-testid": "step1-fabric-assignment-use-for-all",
  }).props.disabled,
  true,
);
assert.match(
  textContent(leftoverDialog),
  /This Fabric cannot cover all remaining garments. Select fewer garments./,
);

const twoSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographics: ["unisex"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const threeFabrics: Fabric[] = [
  ...fabrics,
  {
    code: "FAB-C",
    name: "Heritage C",
    description: "Test fabric C",
    color: "Cream",
    colorHex: "#E8D9B0",
    category: "Test",
    price: 15,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  },
];
const twoConstructionPrice = twoSelection.garmentTypes.reduce((total, garmentType) => {
  const resolution = resolveGarmentConstructionPricing(garmentType, catalog);
  return resolution.status === "resolved" ? total + resolution.totalPrice : total;
}, 0);
const dialogCount = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-testid": "step1-fabric-assignment-dialog" }).length;
const continueCount = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-testid": "future-fabric-continue-action" }).length;
const findFabricCardByCode = (root: ReactTestInstance, code: string) =>
  root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === code);

const renderTwoStep = (
  allocationState: FabricAllocationState,
  onAssignSameFabricProduct: (
    fabricCode: string,
    garmentKeys: string[],
  ) => ReturnType<typeof assignSameFabricProductToGarments> | void,
  catalogue: Fabric[] = threeFabrics,
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: twoSelection,
    fabricAllocationState: allocationState,
    fabrics: catalogue,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: twoSelection,
    fabricAllocationState: allocationState,
  });
  return (
    <DormantFutureFabricStep
      fabrics={catalogue}
      garmentTypeSelection={twoSelection}
      fabricAllocationState={allocationState}
      completion={completion}
      requiredFabricQuantity={planning.requiredFabricQuantity}
      selectedFabricQuantity={planning.selectedFabricQuantity}
      constructionPrice={twoConstructionPrice}
      onAssignFabricToGarment={() => undefined}
      onRemoveFabricFromGarment={() => undefined}
      onUseSameFabricForGarment={() => undefined}
      onAssignSameFabricProduct={onAssignSameFabricProduct}
      onBack={() => undefined}
      onContinue={() => {
        continueClicks += 1;
      }}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={() => undefined}
      onCancelPendingFabric={() => undefined}
    />
  );
};

let twoState = applyFutureFabricCardSelection({
  state: applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: twoSelection,
    garmentKey: "base:shirt",
    fabricCode: "FAB-A",
  }),
  garmentTypeSelection: twoSelection,
  garmentKey: "base:trouser",
  fabricCode: "FAB-B",
});
const noopAssign = () => {
  throw new Error("zero-candidate unused fabric must not start an assignment");
};
let zeroRenderer!: ReturnType<typeof create>;
await act(async () => {
  zeroRenderer = create(renderTwoStep(twoState, noopAssign));
});
const unusedZeroCard = findFabricCardByCode(zeroRenderer.root, "FAB-C");
assert.ok(unusedZeroCard);
assert.equal(unusedZeroCard?.props["data-fabric-status"], STEP1_NO_GARMENTS_TO_ASSIGN_STATUS);
assert.equal(unusedZeroCard?.props["data-fabric-action"], "none");
assert.equal(unusedZeroCard?.props.disabled, true);
assert.match(textContent(unusedZeroCard!), /ALL GARMENTS HAVE FABRIC/);
assert.doesNotMatch(textContent(unusedZeroCard!), /NO GARMENTS TO ASSIGN/);
assert.doesNotMatch(textContent(unusedZeroCard!), /\bSELECT\b/);
await act(async () => unusedZeroCard?.props.onClick({ currentTarget: {} }));
await act(async () => zeroRenderer.update(renderTwoStep(twoState, noopAssign)));
assert.equal(dialogCount(zeroRenderer.root), 0);

const usedZeroCard = findFabricCardByCode(zeroRenderer.root, "FAB-A");
assert.ok(usedZeroCard);
assert.equal(usedZeroCard?.props["data-fabric-status"], "IN USE");
assert.notEqual(usedZeroCard?.props["data-fabric-action"], "use_again");
assert.notEqual(usedZeroCard?.props["data-fabric-action"], "select");
assert.equal(usedZeroCard?.props["data-fabric-remove"], "true");
assert.match(usedZeroCard?.props["aria-label"] || "", /Remove .+ from /);
assert.match(textContent(zeroRenderer.root), /IN USE/);
assert.doesNotMatch(textContent(usedZeroCard!), /USE AGAIN/);
assert.equal(dialogCount(zeroRenderer.root), 0);

let oneState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: twoSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-A",
});
const applyTwoBulk = (fabricCode: string, garmentKeys: string[]) => {
  const result = assignSameFabricProductToGarments({
    state: oneState,
    garmentTypeSelection: twoSelection,
    fabricCode,
    garmentKeys,
  });
  if (result.status === "assigned") oneState = result.state;
  return result;
};
let oneRenderer!: ReturnType<typeof create>;
await act(async () => {
  oneRenderer = create(renderTwoStep(oneState, applyTwoBulk));
});
const unusedOneCard = findFabricCardByCode(oneRenderer.root, "FAB-C");
assert.equal(unusedOneCard?.props["data-fabric-status"], "SELECT");
assert.equal(unusedOneCard?.props["data-fabric-action"], "select");
await act(async () => unusedOneCard?.props.onClick({ currentTarget: {} }));
await act(async () => oneRenderer.update(renderTwoStep(oneState, applyTwoBulk)));
const oneDialog = oneRenderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.equal(
  oneDialog.findAllByProps({ "data-step1-fabric-assignment-row": "base:trouser" })
    .length,
  1,
);
assert.equal(
  oneDialog.findAllByProps({ "data-step1-fabric-assignment-row": "base:shirt" })
    .length,
  0,
);
await act(async () =>
  oneDialog.findByProps({ "data-testid": "step1-fabric-assignment-cancel" }).props.onClick(),
);
await act(async () => oneRenderer.update(renderTwoStep(oneState, applyTwoBulk)));
assert.equal(dialogCount(oneRenderer.root), 0);

const usedOneCard = findFabricCardByCode(oneRenderer.root, "FAB-A");
assert.equal(usedOneCard?.props["data-fabric-status"], "USE AGAIN");
assert.equal(usedOneCard?.props["data-fabric-action"], "use_again");
await act(async () => usedOneCard?.props.onClick({ currentTarget: {} }));
await act(async () => oneRenderer.update(renderTwoStep(oneState, applyTwoBulk)));
const useAgainDialog = oneRenderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.equal(
  useAgainDialog.findAllByProps({
    "data-step1-fabric-assignment-row": "base:trouser",
  }).length,
  1,
);
await act(async () =>
  useAgainDialog
    .findByProps({ "data-testid": "step1-fabric-assignment-cancel" })
    .props.onClick(),
);
await act(async () => oneRenderer.update(renderTwoStep(oneState, applyTwoBulk)));

oneState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: twoSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
});
let missingRenderer!: ReturnType<typeof create>;
await act(async () => {
  missingRenderer = create(renderTwoStep(oneState, applyTwoBulk, threeFabrics));
});
const missingOpenCard = findFabricCardByCode(missingRenderer.root, "FAB-A");
assert.equal(missingOpenCard?.props["data-fabric-status"], "SELECT");
await act(async () => missingOpenCard?.props.onClick({ currentTarget: {} }));
await act(async () =>
  missingRenderer.update(renderTwoStep(oneState, applyTwoBulk, threeFabrics)),
);
const openMissingDialog = missingRenderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
await act(async () =>
  openMissingDialog
    .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
    .props.onChange({ currentTarget: { checked: true } }),
);
await act(async () =>
  missingRenderer.update(renderTwoStep(oneState, applyTwoBulk, threeFabrics)),
);
const withoutFabricA = threeFabrics.filter((fabric) => fabric.code !== "FAB-A");
await act(async () =>
  missingRenderer.update(renderTwoStep(oneState, applyTwoBulk, withoutFabricA)),
);
const missingDialog = missingRenderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.match(textContent(missingDialog), /Royal Forest Ankara|FAB-A/);
const missingError = missingDialog.findByProps({
  "data-testid": "step1-fabric-assignment-error",
});
assert.equal(missingError.props.role, "alert");
assert.equal(textContent(missingError), STEP1_FABRIC_NO_LONGER_AVAILABLE_MESSAGE);
assert.equal(
  findButton(missingDialog, "Assign to Selected")?.props.disabled,
  true,
);
assert.equal(
  missingDialog.findByProps({
    "data-testid": "step1-fabric-assignment-use-for-all",
  }).props.disabled,
  true,
);
assert.deepEqual(
  oneState.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt"],
);
assert.equal(continueCount(missingRenderer.root), 0);
await act(async () =>
  missingDialog.findByProps({ "data-testid": "step1-fabric-assignment-cancel" }).props.onClick(),
);
await act(async () =>
  missingRenderer.update(renderTwoStep(oneState, applyTwoBulk, withoutFabricA)),
);
assert.equal(dialogCount(missingRenderer.root), 0);
assert.equal(continueCount(missingRenderer.root), 0);

const mutateLiveFabric = async (
  extras: Partial<Fabric>,
  expectedError: string,
) => {
  let liveState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: twoSelection,
    garmentKey: "base:shirt",
    fabricCode: "FAB-B",
  });
  const assignLive = (fabricCode: string, garmentKeys: string[]) => {
    const result = assignSameFabricProductToGarments({
      state: liveState,
      garmentTypeSelection: twoSelection,
      fabricCode,
      garmentKeys,
    });
    if (result.status === "assigned") liveState = result.state;
    return result;
  };
  let liveRenderer!: ReturnType<typeof create>;
  await act(async () => {
    liveRenderer = create(renderTwoStep(liveState, assignLive, threeFabrics));
  });
  const card = findFabricCardByCode(liveRenderer.root, "FAB-A");
  await act(async () => card?.props.onClick({ currentTarget: {} }));
  await act(async () =>
    liveRenderer.update(renderTwoStep(liveState, assignLive, threeFabrics)),
  );
  const liveDialog = liveRenderer.root.findByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  });
  await act(async () =>
    liveDialog
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  const mutatedCatalogue = threeFabrics.map((fabric) =>
    fabric.code === "FAB-A" ? { ...fabric, ...extras } : fabric,
  );
  await act(async () =>
    liveRenderer.update(renderTwoStep(liveState, assignLive, mutatedCatalogue)),
  );
  const staleDialog = liveRenderer.root.findByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  });
  assert.match(textContent(staleDialog), new RegExp(expectedError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(
    findButton(staleDialog, "Assign to Selected")?.props.disabled,
    true,
  );
  assert.equal(
    staleDialog.findByProps({
      "data-testid": "step1-fabric-assignment-use-for-all",
    }).props.disabled,
    true,
  );
  assert.deepEqual(
    liveState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    ["base:shirt"],
  );
  await act(async () =>
    staleDialog.findByProps({ "data-testid": "step1-fabric-assignment-cancel" }).props.onClick(),
  );
  await act(async () =>
    liveRenderer.update(renderTwoStep(liveState, assignLive, mutatedCatalogue)),
  );
  assert.equal(dialogCount(liveRenderer.root), 0);
  return liveState;
};

await mutateLiveFabric({ stockStatus: "OUT_OF_STOCK" }, "Currently out of stock.");
const unpricedLive = await mutateLiveFabric(
  { price: undefined, priceMultiplier: 0 },
  "Price needs catalogue review before selection.",
);
assert.deepEqual(
  unpricedLive.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  ["base:shirt"],
);

let staleCandidateState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: twoSelection,
  garmentKey: "base:shirt",
  fabricCode: "FAB-B",
});
const assignStaleCandidate = (fabricCode: string, garmentKeys: string[]) => {
  const result = assignSameFabricProductToGarments({
    state: staleCandidateState,
    garmentTypeSelection: twoSelection,
    fabricCode,
    garmentKeys,
  });
  if (result.status === "assigned") staleCandidateState = result.state;
  return result;
};
let staleCandidateRenderer!: ReturnType<typeof create>;
await act(async () => {
  staleCandidateRenderer = create(
    renderTwoStep(staleCandidateState, assignStaleCandidate, threeFabrics),
  );
});
await act(async () =>
  findFabricCardByCode(staleCandidateRenderer.root, "FAB-A")?.props.onClick({
    currentTarget: {},
  }),
);
await act(async () =>
  staleCandidateRenderer.update(
    renderTwoStep(staleCandidateState, assignStaleCandidate, threeFabrics),
  ),
);
assert.equal(dialogCount(staleCandidateRenderer.root), 1);
staleCandidateState = applyFutureFabricCardSelection({
  state: staleCandidateState,
  garmentTypeSelection: twoSelection,
  garmentKey: "base:trouser",
  fabricCode: "FAB-B",
});
await act(async () =>
  staleCandidateRenderer.update(
    renderTwoStep(staleCandidateState, assignStaleCandidate, threeFabrics),
  ),
);
assert.equal(dialogCount(staleCandidateRenderer.root), 1);
assert.equal(continueCount(staleCandidateRenderer.root), 0);
const staleCandidateDialog = staleCandidateRenderer.root.findByProps({
  "data-testid": "step1-fabric-assignment-dialog",
});
assert.equal(
  findButton(staleCandidateDialog, "Assign to Selected")?.props.disabled,
  true,
);
await act(async () =>
  staleCandidateDialog
    .findByProps({ "data-testid": "step1-fabric-assignment-cancel" })
    .props.onClick(),
);
await act(async () =>
  staleCandidateRenderer.update(
    renderTwoStep(staleCandidateState, assignStaleCandidate, threeFabrics),
  ),
);
assert.equal(dialogCount(staleCandidateRenderer.root), 0);
assert.equal(continueCount(staleCandidateRenderer.root), 1);

const assignmentDialogSource = readFileSync(
  new URL("./src/components/Step1FabricAssignmentDialog.tsx", import.meta.url),
  "utf8",
);
assert.match(assignmentDialogSource, /behavior: "smooth", block: "start"/);
assert.match(assignmentDialogSource, /initialFocusRef\.current \|\| dialog/);

console.log("test_step1_fabric_assignment_popup_ui.tsx: all assertions passed");
