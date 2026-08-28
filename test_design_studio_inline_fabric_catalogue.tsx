import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { ReactElement } from "react";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import {
  assignFutureFabricToGarment,
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  cancelFutureFabricCatalogueAssignment,
  getFutureFabricAssignmentTargets,
  getFutureUnassignedFabricTargets,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  removeFutureFabricAssignment,
  selectFutureFabric,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { STEP1_NO_GARMENTS_TO_ASSIGN_STATUS } from "./src/utils/step1FabricAssignmentPopup";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
const originalCreatePortal = reactDomRuntime.createPortal;
let lastPortalChildren: unknown = null;
reactDomRuntime.createPortal = (children) => {
  lastPortalChildren = children;
  return children;
};
const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const shirtTrouserSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const shirtTrouserKaftanSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "kaftan"],
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

const resolveConstructionTotal = (selection: GarmentTypeStepSelection): number =>
  getFutureFabricAssignmentTargets(selection).reduce((total, { assignment }) => {
    const resolution = resolveGarmentConstructionPricing(
      assignment.garmentType,
      catalog,
    );
    assert.equal(resolution.status, "resolved");
    return total + resolution.totalPrice;
  }, 0);

const findButton = (root: ReactTestInstance, text: string) =>
  root
    .findAllByType("button")
    .find((button) => textContent(button).includes(text));

const findStockBadge = (root: ReactTestInstance, fabricCode: string) =>
  root
    .findAllByProps({ "data-fabric-stock-badge": "true" })
    .find((badge) => badge.props["data-fabric-stock-code"] === fabricCode);

const findVisibleFabricActionError = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-fabric-visible-action-error": "true" })[0] ??
  null;

const assertFabricProgress = (
  root: ReactTestInstance,
  fabricSelected: number,
  fabricRequired: number,
  garmentsAssigned: number,
  garmentsRequired: number,
) => {
  const progressRegion = root.findByProps({ "data-fabric-progress": "true" });
  const fabricLine = progressRegion.findByProps({
    "data-fabric-selection-progress": "true",
  });
  const garmentLine = progressRegion.findByProps({
    "data-garment-assignment-progress": "true",
  });
  assert.match(
    textContent(fabricLine),
    new RegExp(
      `^Fabric selections: ${fabricSelected} of ${fabricRequired} needed$`,
    ),
  );
  assert.match(
    textContent(garmentLine),
    new RegExp(
      `^Garments assigned: ${garmentsAssigned} of ${garmentsRequired}$`,
    ),
  );
  assert.equal(
    String(progressRegion.props.className ?? "").includes("sr-only"),
    false,
    "Fabric progress must remain visible to sighted customers.",
  );
  assert.equal(
    String(progressRegion.props.className ?? "").includes("min-w-0"),
    true,
    "Fabric progress markup must wrap safely on narrow layouts.",
  );
};

const renderStep = (
  state = FabricAllocationStateEngine.initialize(),
  onAssign: (fabric: Fabric, garmentKey: string) => void = () => undefined,
  selection: GarmentTypeStepSelection = garmentTypeSelection,
  onUseSameFabricForGarment: (garmentKey: string) => void = () => undefined,
  onChooseAnotherFabric: () => void = () => undefined,
  onRemoveFabricFromGarment: (garmentKey: string) => void = () => undefined,
  constructionPrice?: number,
  onAssignSameFabricProduct: (
    fabricCode: string,
    garmentKeys: string[],
  ) => void = () => undefined,
  catalogueFabrics: Fabric[] = fabrics,
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabrics: catalogueFabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
  });
  return (
    <DormantFutureFabricStep
      fabrics={catalogueFabrics}
      garmentTypeSelection={selection}
      fabricAllocationState={state}
      completion={completion}
      requiredFabricQuantity={planning.requiredFabricQuantity}
      selectedFabricQuantity={planning.selectedFabricQuantity}
      constructionPrice={constructionPrice ?? resolveConstructionTotal(selection)}
      onAssignFabricToGarment={onAssign}
      onRemoveFabricFromGarment={onRemoveFabricFromGarment}
      onUseSameFabricForGarment={onUseSameFabricForGarment}
      onAssignSameFabricProduct={onAssignSameFabricProduct}
      onBack={() => undefined}
      onContinue={() => undefined}
      onUseSameFabric={() => undefined}
      onChooseAnotherFabric={onChooseAnotherFabric}
      onCancelPendingFabric={() => undefined}
    />
  );
};

const remainingGarmentKeys = (
  selection: GarmentTypeStepSelection,
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
) =>
  getFutureUnassignedFabricTargets({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
  }).map(({ assignment }) => assignment.garmentKey);

const commitSameFabric = (
  args: Parameters<typeof assignSameFabricProductToGarments>[0],
) => {
  const result = assignSameFabricProductToGarments(args);
  assert.equal(
    result.status,
    "assigned",
    result.status === "blocked" ? result.reason : "",
  );
  return result.state;
};

const applySameFabricResult =
  (
    getState: () => ReturnType<typeof FabricAllocationStateEngine.initialize>,
    setState: (
      state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
    ) => void,
    selection: GarmentTypeStepSelection,
  ) =>
  (fabricCode: string, garmentKeys: string[]) => {
    const result = assignSameFabricProductToGarments({
      state: getState(),
      garmentTypeSelection: selection,
      fabricCode,
      garmentKeys,
    });
    if (result.status === "assigned") setState(result.state);
    return result;
  };

const assignRemainingSameFabric = (
  state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
  selection: GarmentTypeStepSelection,
  fabricCode: string,
) =>
  commitSameFabric({
    state,
    garmentTypeSelection: selection,
    fabricCode,
    garmentKeys: remainingGarmentKeys(selection, state),
  });

const clickBulkYes = async (root: ReactTestInstance) => {
  const yes =
    root.findAllByProps({ "data-testid": "step1-fabric-assignment-use-for-all" })[0] ||
    findButton(root, "YES — Use for All");
  assert.ok(yes, "Expected the Step 1 fabric assignment YES — Use for All action.");
  await act(async () => yes.props.onClick());
};

let assigned: Array<{ fabricCode: string; garmentKey: string }> = [];
let bulkAssigned: Array<{ fabricCode: string; garmentKeys: string[] }> = [];
let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(
    renderStep(
      FabricAllocationStateEngine.initialize(),
      (fabric, garmentKey) => assigned.push({ fabricCode: fabric.code, garmentKey }),
      garmentTypeSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) => {
        bulkAssigned.push({ fabricCode, garmentKeys });
      },
    ),
  );
});

assert.equal(
  renderer.root.findAllByProps({ "data-testid": "future-fabric-inline-catalogue" })
    .length,
  1,
  "Fresh Step 2 must render one inline Fabric catalogue.",
);
assert.equal(
  findButton(renderer.root, "Select Fabric"),
  undefined,
  "Step 2 must not render a bottom Select Fabric confirmation button.",
);
assert.match(
  textContent(renderer.root),
  /Select a fabric card to choose which garments should use this Fabric\./,
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
  /Select a fabric card to choose which garments should use this Fabric\./,
);

const firstCard = renderer.root.findAllByProps({ "data-fabric-card": "true" })[0];
await act(async () => firstCard.props.onClick({ currentTarget: {} }));
assert.deepEqual(assigned, []);
assert.deepEqual(bulkAssigned, []);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  1,
  "Selecting a Fabric must open the assignment popup before any allocation.",
);
await clickBulkYes(renderer.root);
assert.deepEqual(assigned, []);
assert.deepEqual(bulkAssigned, [
  { fabricCode: "INLINE-A", garmentKeys: ["base:shirt"] },
]);

let shirtTrouserState = FabricAllocationStateEngine.initialize();
let shirtTrouserRenderer!: ReturnType<typeof create>;
const applyShirtTrouserFabric = (fabric: Fabric, garmentKey: string) => {
  shirtTrouserState = applyFutureFabricCardSelection({
    state: shirtTrouserState,
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey,
    fabricCode: fabric.code,
  });
  return shirtTrouserState;
};
await act(async () => {
  shirtTrouserRenderer = create(
    renderStep(
      shirtTrouserState,
      applyShirtTrouserFabric,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) =>
        applySameFabricResult(
          () => shirtTrouserState,
          (state) => {
            shirtTrouserState = state;
          },
          shirtTrouserSelection,
        )(fabricCode, garmentKeys),
    ),
  );
});
assert.equal(
  shirtTrouserRenderer.root.findAllByProps({
    "data-assignment-status": "unassigned",
  }).length,
  2,
);
assertFabricProgress(shirtTrouserRenderer.root, 0, 1, 0, 2);
assert.equal(
  findButton(shirtTrouserRenderer.root, "Continue to Design Style"),
  undefined,
  "Incomplete Fabric must not render a forward action.",
);
const shirtCard = shirtTrouserRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-A");
assert.ok(shirtCard);
await act(async () => shirtCard.props.onClick({ currentTarget: {} }));
await act(async () =>
  shirtTrouserRenderer.update(
    renderStep(
      shirtTrouserState,
      applyShirtTrouserFabric,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) =>
        applySameFabricResult(
          () => shirtTrouserState,
          (state) => {
            shirtTrouserState = state;
          },
          shirtTrouserSelection,
        )(fabricCode, garmentKeys),
    ),
  ),
);
assert.deepEqual(
  shirtTrouserState.fabricAllocations,
  [],
  "Selecting a Fabric must not assign until the popup is confirmed.",
);
assert.equal(
  shirtTrouserRenderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  1,
);
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Assign Fabric to Garments/,
);
await clickBulkYes(shirtTrouserRenderer.root);
await act(async () =>
  shirtTrouserRenderer.update(
    renderStep(
      shirtTrouserState,
      applyShirtTrouserFabric,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) =>
        applySameFabricResult(
          () => shirtTrouserState,
          (state) => {
            shirtTrouserState = state;
          },
          shirtTrouserSelection,
        )(fabricCode, garmentKeys),
    ),
  ),
);
assert.deepEqual(
  shirtTrouserState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] }],
  "YES — Use for All must assign the same fabric product to remaining garments through the allocation engine.",
);
assert.equal(
  shirtTrouserRenderer.root.findAllByProps({
    "data-assignment-status": "unassigned",
  }).length,
  0,
);
assertFabricProgress(shirtTrouserRenderer.root, 1, 1, 2, 2);
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Garment Construction Subtotal€140\.00/,
  "The rendered shared allocation must retain the authoritative Shirt plus Trouser construction total.",
);
assert.ok(findButton(shirtTrouserRenderer.root, "Continue to Design Style"));
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Inline Heritage A assigned to Standard Shirt and Trouser\./,
  "The live announcement must describe garments assigned by YES — Use for All.",
);
assert.equal(
  shirtTrouserRenderer.root.findByProps({
    "data-fabric-card": "true",
    "data-fabric-code": "INLINE-A",
  }).props["data-fabric-status"],
  "IN USE",
);
assert.equal(
  shirtTrouserRenderer.root.findByProps({
    "data-fabric-card": "true",
    "data-fabric-code": "INLINE-B",
  }).props["data-fabric-status"],
  STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
);

let mixedState = FabricAllocationStateEngine.initialize();
let mixedRenderer!: ReturnType<typeof create>;
const applyMixedFabric = (fabric: Fabric, garmentKey: string) => {
  mixedState = applyFutureFabricCardSelection({
    state: mixedState,
    garmentTypeSelection: shirtTrouserKaftanSelection,
    garmentKey,
    fabricCode: fabric.code,
  });
  return mixedState;
};
const renderMixed = () =>
  renderStep(
    mixedState,
    applyMixedFabric,
    shirtTrouserKaftanSelection,
    () => undefined,
    () => {
      mixedState = FabricAllocationStateEngine.beginChooseAnotherFabric(
        mixedState,
      );
    },
    () => undefined,
    undefined,
    applySameFabricResult(
      () => mixedState,
      (state) => {
        mixedState = state;
      },
      shirtTrouserKaftanSelection,
    ),
  );
await act(async () => {
  mixedRenderer = create(renderMixed());
});
const mixedFirstCard = mixedRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-A");
assert.ok(mixedFirstCard);
await act(async () => mixedFirstCard.props.onClick({ currentTarget: {} }));
await act(async () => mixedRenderer.update(renderMixed()));
assert.deepEqual(
  mixedState.fabricAllocations,
  [],
  "Selecting a Fabric must not assign until the popup is confirmed.",
);
assert.match(
  textContent(mixedRenderer.root),
  /Assign Fabric to Garments/,
);
await clickBulkYes(mixedRenderer.root);
await act(async () => mixedRenderer.update(renderMixed()));
assert.deepEqual(
  mixedState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [
    { fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] },
    { fabricCode: "INLINE-A", garmentKeys: ["base:kaftan"] },
  ],
  "YES — Use for All must create another allocation for Kaftan using the same fabric product.",
);
assert.equal(mixedState.pendingFabricGarment, null);
assertFabricProgress(mixedRenderer.root, 2, 2, 3, 3);
assert.ok(findButton(mixedRenderer.root, "Continue to Design Style"));
let failedAssignmentRenderer!: ReturnType<typeof create>;
const failedAssignmentState = FabricAllocationStateEngine.initialize();
await act(async () => {
  failedAssignmentRenderer = create(
    renderStep(
      failedAssignmentState,
      () => undefined,
      shirtTrouserSelection,
    ),
  );
});
await act(async () =>
  failedAssignmentRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () =>
  failedAssignmentRenderer.update(
    renderStep(
      failedAssignmentState,
      () => undefined,
      shirtTrouserSelection,
    ),
  ),
);
assert.doesNotMatch(
  textContent(failedAssignmentRenderer.root),
  /assigned to Standard/,
  "A failed assignment must never announce a successful garment assignment.",
);
assert.equal(
  findButton(renderer.root, "Select Fabric"),
  undefined,
  "Direct assignment must not reveal a replacement confirmation button.",
);

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
assert.equal(
  assigned.length,
  1,
  "Change Fabric must assign the selected card without a second confirmation.",
);
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-B", garmentKey: "base:shirt" },
]);

assigned = [];
await act(async () =>
  renderer.update(
    renderStep(
      FabricAllocationStateEngine.initialize(),
      (fabric, garmentKey) => assigned.push({ fabricCode: fabric.code, garmentKey }),
    ),
  ),
);
await act(async () =>
  renderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick({ currentTarget: {} }),
);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  1,
  "An un-targeted card selection must open the assignment popup before allocating.",
);
assert.deepEqual(assigned, []);

let sharedState = FabricAllocationStateEngine.initialize();
sharedState = assignFutureFabricToGarment({
  state: sharedState,
  garmentTypeSelection: threeGarmentSelection,
  garmentKey: "base:shirt",
  fabricCode: "INLINE-A",
}).state;
let fullState = assignFutureFabricToGarment({
  state: sharedState,
  garmentTypeSelection: threeGarmentSelection,
  garmentKey: "base:trouser",
  fabricCode: "INLINE-A",
}).state;
let targetedTwoGarmentState = fullState;
const targetedTwoGarmentCalls: string[] = [];
let targetedTwoGarmentRenderer!: ReturnType<typeof create>;
await act(async () => {
  targetedTwoGarmentRenderer = create(
    renderStep(
      targetedTwoGarmentState,
      (fabric, garmentKey) => {
        targetedTwoGarmentCalls.push(garmentKey);
        targetedTwoGarmentState = assignFutureFabricToGarment({
          state: targetedTwoGarmentState,
          garmentTypeSelection: threeGarmentSelection,
          garmentKey,
          fabricCode: fabric.code,
        }).state;
      },
      threeGarmentSelection,
    ),
  );
});
await act(async () =>
  targetedTwoGarmentRenderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} }),
);
const targetedCurrentFabricCard = targetedTwoGarmentRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-A");
assert.equal(targetedCurrentFabricCard?.props["data-fabric-status"], "ASSIGNED");
assert.equal(
  targetedCurrentFabricCard?.props["data-fabric-action"],
  "cancel",
  "The exact current target fabric must expose cancellation instead of a redundant assignment.",
);
assert.ok(
  !targetedCurrentFabricCard?.props.disabled,
  "The assigned fabric CTA must remain actionable so the customer can cancel that assignment.",
);
assert.match(
  String(targetedCurrentFabricCard?.props["aria-label"] || ""),
  /Remove Inline Heritage A from Standard Shirt/,
);
await act(async () =>
  targetedTwoGarmentRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B")!
    .props.onClick(),
);
assert.deepEqual(
  targetedTwoGarmentCalls,
  ["base:shirt"],
  "Targeted Change Fabric must invoke the assignment handler only for the changed garment.",
);
assert.deepEqual(
  targetedTwoGarmentState.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => ({
      garmentKey: assignment.garmentKey,
      fabricCode: allocation.fabricCode,
    })),
  ),
  [
    { garmentKey: "base:trouser", fabricCode: "INLINE-A" },
    { garmentKey: "base:shirt", fabricCode: "INLINE-B" },
  ],
  "Targeted replacement must preserve the unrelated Trouser assignment.",
);
const pendingTarget = getFutureFabricAssignmentTargets(threeGarmentSelection).find(
  ({ assignment }) => assignment.garmentKey === "base:skirt",
);
assert.ok(pendingTarget);
const pendingState = FabricAllocationStateEngine.attemptAppendGarment(
  fullState,
  pendingTarget.selection,
);
const bulkChoiceCount = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-testid": "step1-fabric-assignment-dialog" }).length;

let useSameTarget = "";
let chooseAnotherCalls = 0;
void useSameTarget;
void chooseAnotherCalls;
let capacityState = FabricAllocationStateEngine.initialize();
let capacityRenderer!: ReturnType<typeof create>;
const renderCapacity = () =>
  renderStep(
    capacityState,
    (fabric, garmentKey) => {
      capacityState = assignFutureFabricToGarment({
        state: capacityState,
        garmentTypeSelection: threeGarmentSelection,
        garmentKey,
        fabricCode: fabric.code,
      }).state;
      return capacityState;
    },
    threeGarmentSelection,
    (garmentKey) => {
      useSameTarget = garmentKey;
    },
    () => undefined,
    () => undefined,
    undefined,
    applySameFabricResult(
      () => capacityState,
      (state) => {
        capacityState = state;
      },
      threeGarmentSelection,
    ),
  );
await act(async () => {
  capacityRenderer = create(renderCapacity());
});
assert.equal(
  bulkChoiceCount(capacityRenderer.root),
  0,
  "Mounting Fabric from state alone must not infer a first-fabric bulk choice.",
);
await act(async () =>
  capacityRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => capacityRenderer.update(renderCapacity()));
assert.equal(
  bulkChoiceCount(capacityRenderer.root),
  1,
  "Selecting a Fabric must open the assignment popup before allocating.",
);
assert.match(
  textContent(capacityRenderer.root),
  /Assign Fabric to Garments/,
);
assert.match(
  textContent(capacityRenderer.root),
  /Choose which garments should use this Fabric\./,
);
await act(async () =>
  findButton(capacityRenderer.root, "Cancel")!.props.onClick(),
);
assert.equal(
  bulkChoiceCount(capacityRenderer.root),
  0,
  "Cancel must close the assignment popup without allocating.",
);

let remountedCapacityRenderer!: ReturnType<typeof create>;
await act(async () => {
  remountedCapacityRenderer = create(renderCapacity());
});
assert.equal(
  bulkChoiceCount(remountedCapacityRenderer.root),
  0,
  "Draft hydration or completed-step remount must not reconstruct the bulk choice.",
);

let capacityState2 = FabricAllocationStateEngine.initialize();
let capacityRenderer2!: ReturnType<typeof create>;
const renderCapacity2 = () =>
  renderStep(
    capacityState2,
    (fabric, garmentKey) => {
      capacityState2 = assignFutureFabricToGarment({
        state: capacityState2,
        garmentTypeSelection: threeGarmentSelection,
        garmentKey,
        fabricCode: fabric.code,
      }).state;
    },
    threeGarmentSelection,
    () => undefined,
    () => {
      chooseAnotherCalls += 1;
    },
    () => undefined,
    undefined,
      applySameFabricResult(
        () => capacityState2,
        (state) => {
          capacityState2 = state;
        },
        threeGarmentSelection,
      ),
  );
await act(async () => {
  capacityRenderer2 = create(renderCapacity2());
});
await act(async () =>
  capacityRenderer2.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => capacityRenderer2.update(renderCapacity2()));
assert.equal(
  bulkChoiceCount(capacityRenderer2.root),
  1,
  "A later genuine first assignment may open the assignment popup.",
);
assert.match(
  textContent(capacityRenderer2.root),
  /Assign Fabric to Garments/,
);
assert.equal(
  findButton(capacityRenderer2.root, "Select Fabric"),
  undefined,
  "The assignment popup must not reintroduce a bottom Select Fabric button.",
);
assert.equal(
  capacityRenderer2.root.findAllByProps({ "aria-pressed": true }).length,
  0,
  "Fabric cards are assigned directly and never remain temporarily selected.",
);

let capacityState3 = FabricAllocationStateEngine.initialize();
let capacityRenderer3!: ReturnType<typeof create>;
const renderCapacity3 = () =>
  renderStep(
    capacityState3,
    (fabric, garmentKey) => {
      capacityState3 = assignFutureFabricToGarment({
        state: capacityState3,
        garmentTypeSelection: threeGarmentSelection,
        garmentKey,
        fabricCode: fabric.code,
      }).state;
    },
    threeGarmentSelection,
    (garmentKey) => {
      useSameTarget = garmentKey;
    },
    () => undefined,
    () => undefined,
    undefined,
      applySameFabricResult(
        () => capacityState3,
        (state) => {
          capacityState3 = state;
        },
        threeGarmentSelection,
      ),
  );
await act(async () => {
  capacityRenderer3 = create(renderCapacity3());
});
await act(async () =>
  capacityRenderer3.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => capacityRenderer3.update(renderCapacity3()));
await clickBulkYes(capacityRenderer3.root);
await act(async () => capacityRenderer3.update(renderCapacity3()));
assert.deepEqual(
  capacityState3.fabricAllocations.map((allocation) =>
    allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
  ),
  [["base:shirt", "base:trouser"], ["base:skirt"]],
);
assert.equal(bulkChoiceCount(capacityRenderer3.root), 0);

let staleOfferState = FabricAllocationStateEngine.initialize();
let staleOfferRenderer!: ReturnType<typeof create>;
const renderStaleOffer = () =>
  renderStep(
    staleOfferState,
    (fabric, garmentKey) => {
      staleOfferState = assignFutureFabricToGarment({
        state: staleOfferState,
        garmentTypeSelection: threeGarmentSelection,
        garmentKey,
        fabricCode: fabric.code,
      }).state;
    },
    threeGarmentSelection,
    () => undefined,
    () => undefined,
    (garmentKey) => {
      staleOfferState = removeFutureFabricAssignment({
        state: staleOfferState,
        garmentKey,
      });
    },
    undefined,
    applySameFabricResult(
      () => staleOfferState,
      (state) => {
        staleOfferState = state;
      },
      threeGarmentSelection,
    ),
  );
await act(async () => {
  staleOfferRenderer = create(renderStaleOffer());
});
await act(async () =>
  staleOfferRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => staleOfferRenderer.update(renderStaleOffer()));
assert.equal(bulkChoiceCount(staleOfferRenderer.root), 1);
await act(async () =>
  staleOfferRenderer.root
    .findByProps({ "data-testid": "step1-fabric-assignment-cancel" })
    .props.onClick(),
);
await act(async () => staleOfferRenderer.update(renderStaleOffer()));
assert.equal(
  bulkChoiceCount(staleOfferRenderer.root),
  0,
  "Cancel must close the assignment popup without allocating.",
);
let removalRemountRenderer!: ReturnType<typeof create>;
await act(async () => {
  removalRemountRenderer = create(renderStaleOffer());
});
assert.equal(
  bulkChoiceCount(removalRemountRenderer.root),
  0,
  "Reload and completed-step remount after removal must keep the bulk choice closed.",
);
await act(async () =>
  staleOfferRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })[0]
    .props.onClick(),
);
await act(async () => staleOfferRenderer.update(renderStaleOffer()));
assert.equal(
  bulkChoiceCount(staleOfferRenderer.root),
  1,
  "A genuine later first assignment after all fabrics are removed may show the bulk choice again.",
);

let pendingChoiceState = pendingState;
let pendingChoiceRenderer!: ReturnType<typeof create>;
await act(async () => {
  pendingChoiceRenderer = create(
    renderStep(
      pendingChoiceState,
      (fabric, garmentKey) => {
        if (
          pendingChoiceState.awaitingFabricForPendingGarment &&
          pendingChoiceState.pendingFabricGarment?.garmentKey === garmentKey
        ) {
          pendingChoiceState =
            FabricAllocationStateEngine.assignPendingGarmentToFabric(
              pendingChoiceState,
              fabric.code,
            );
        } else {
          pendingChoiceState = applyFutureFabricCardSelection({
            state: pendingChoiceState,
            garmentTypeSelection: threeGarmentSelection,
            garmentKey,
            fabricCode: fabric.code,
          });
        }
      },
      threeGarmentSelection,
      () => undefined,
      () => {
        pendingChoiceState =
          FabricAllocationStateEngine.beginChooseAnotherFabric(
            pendingChoiceState,
          );
      },
    ),
  );
});
pendingChoiceRenderer.root
  .findAllByType("button")
  .filter((button) => {
    const label = textContent(button);
    return label.includes("Add Fabric") || label.includes("Change Fabric");
  })
  .forEach((button) => {
    assert.equal(
      Boolean(button.props.disabled),
      false,
      "A full pending allocation must not disable unrelated garment fabric actions.",
    );
  });
await act(async () => {
  findButton(pendingChoiceRenderer.root, "Choose Another Fabric")!.props.onClick({
    currentTarget: {},
  });
});
await act(async () => {
  pendingChoiceRenderer.update(
    renderStep(
      pendingChoiceState,
      (fabric, garmentKey) => {
        if (
          pendingChoiceState.awaitingFabricForPendingGarment &&
          pendingChoiceState.pendingFabricGarment?.garmentKey === garmentKey
        ) {
          pendingChoiceState =
            FabricAllocationStateEngine.assignPendingGarmentToFabric(
              pendingChoiceState,
              fabric.code,
            );
        }
      },
      threeGarmentSelection,
      () => undefined,
      () => {
        pendingChoiceState =
          FabricAllocationStateEngine.beginChooseAnotherFabric(
            pendingChoiceState,
          );
      },
    ),
  );
});
const pendingChoiceCards = pendingChoiceRenderer.root.findAllByProps({
  "data-fabric-card": "true",
});
assert.equal(
  pendingChoiceCards[1].findByType("button").props.disabled,
  false,
  "Choose Another Fabric must enable direct catalogue selection while awaiting the pending garment.",
);
await act(async () => pendingChoiceCards[1].findByType("button").props.onClick());
assert.equal(pendingChoiceState.pendingFabricGarment, null);
assert.deepEqual(
  pendingChoiceState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [
    { fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] },
    { fabricCode: "INLINE-B", garmentKeys: ["base:skirt"] },
  ],
  "Choose Another Fabric must create the second allocation for the pending garment only.",
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

type FocusMock = {
  label?: string;
  nodeType?: number;
  tagName: string;
  type?: string;
  isConnected: boolean;
  hidden?: boolean;
  inert?: boolean;
  tabIndex: number;
  parentElement: FocusMock | null;
  focus: (options?: FocusOptions) => void;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  querySelector: () => FocusMock | null;
  querySelectorAll: () => FocusMock[];
  addEventListener: (name: string, listener: (event: unknown) => void) => void;
  removeEventListener: (name: string, listener: (event: unknown) => void) => void;
  dispatchKeyDown: (event: unknown) => void;
  scrollIntoView: () => void;
};

const runtime = globalThis as unknown as {
  document?: unknown;
  window?: unknown;
};
const previousDocument = runtime.document;
const previousWindow = runtime.window;
let activeFocusMock: FocusMock | null = null;
let dialogFocusMock: FocusMock | null = null;
let bulkChoiceDialogFocusMock: FocusMock | null = null;
const bulkDialogFocusables: FocusMock[] = [];
const dialogButtonHandlers = new Map<string, () => void>();
const focusMocks = new Map<string, FocusMock>();
const mockDocument = {
  body: { nodeType: 1 } as FocusMock,
  get activeElement() {
    return activeFocusMock;
  },
};
const animationFrames = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 1;
const flushAnimationFrame = () => {
  const next = animationFrames.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!next) return false;
  animationFrames.delete(next[0]);
  next[1](0);
  return true;
};
const flushAnimationFrames = () => {
  while (flushAnimationFrame()) {
    // Flush callbacks in registration order so stale-request checks are exercised.
  }
};
const mockWindow = {
  scrollY: 240,
  scrollTo: ({ top }: { top: number }) => {
    mockWindow.scrollY = top;
  },
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    const id = nextAnimationFrameId++;
    animationFrames.set(id, callback);
    return id;
  },
  cancelAnimationFrame: (id: number) => animationFrames.delete(id),
  getComputedStyle: () => ({
    display: "block",
    visibility: "visible",
  }),
};
const createFocusMock = (element: ReactElement): FocusMock => {
  const props = element.props as Record<string, unknown>;
  const tagName = typeof element.type === "string" ? element.type.toUpperCase() : "DIV";
  const elementText = (value: unknown): string => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(elementText).join("");
    if (value && typeof value === "object" && "props" in value) {
      return elementText((value as { props?: { children?: unknown } }).props?.children);
    }
    return "";
  };
  const attributes = new Map<string, string>();
  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith("aria-") || name === "disabled" || name === "tabIndex") {
      const normalizedName = name.toLowerCase();
      if (value === true) attributes.set(normalizedName, "");
      else if (typeof value === "string" || typeof value === "number") {
        attributes.set(normalizedName, String(value));
      }
    }
  }
  const mock: FocusMock = {
    label: element.type === "h3" ? "catalogue-heading" : undefined,
    tagName,
    type: typeof props.type === "string" ? props.type : undefined,
    isConnected: true,
    hidden: false,
    inert: false,
    tabIndex:
      typeof props.tabIndex === "number"
        ? props.tabIndex
        : tagName === "BUTTON"
          ? 0
          : -2,
    parentElement: null,
    focus: () => {
      activeFocusMock = mock;
    },
    hasAttribute: (name) => attributes.has(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchKeyDown: () => undefined,
    scrollIntoView: () => undefined,
  };
  let keydownHandler: ((event: unknown) => void) | null = null;
  mock.addEventListener = (name, listener) => {
    if (name === "keydown") keydownHandler = listener;
  };
  mock.removeEventListener = (name, listener) => {
    if (name === "keydown" && keydownHandler === listener) keydownHandler = null;
  };
  mock.dispatchKeyDown = (event) => keydownHandler?.(event);
  if (props.role === "dialog") dialogFocusMock = mock;
  if (props["data-testid"] === "step1-fabric-assignment-dialog") {
    bulkChoiceDialogFocusMock = mock;
    mock.querySelectorAll = () =>
      bulkDialogFocusables.filter((element) => !element.hasAttribute("disabled"));
  }
  if (
    props["data-bulk-choice-control"] ||
    props["data-step1-fabric-assignment-control"]
  ) {
    if (!mock.label && tagName === "BUTTON") {
      mock.label =
        elementText(props.children) ||
        (typeof props["aria-label"] === "string" ? props["aria-label"] : undefined);
    }
    if (!mock.label && tagName === "INPUT") {
      mock.label =
        (typeof props.id === "string" ? props.id : undefined) ||
        mock.label;
    }
    bulkDialogFocusables.push(mock);
  }
  if (tagName === "BUTTON" && typeof props.onClick === "function") {
    const buttonLabel =
      typeof props["aria-label"] === "string"
        ? props["aria-label"]
        : elementText(props.children);
    if (buttonLabel) dialogButtonHandlers.set(buttonLabel, props.onClick as () => void);
  }
  const ariaLabel = props["aria-label"];
  if (typeof ariaLabel === "string") {
    mock.label = ariaLabel;
    focusMocks.set(ariaLabel, mock);
  }
  return mock;
};

const createTriggerVariant = (
  base: FocusMock,
  overrides: Partial<FocusMock> & { attributes?: Record<string, string> },
): FocusMock => {
  const attributes = new Map(Object.entries(overrides.attributes ?? {}));
  const variant = {
    ...base,
    ...overrides,
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
  } as FocusMock;
  delete (variant as { attributes?: Record<string, string> }).attributes;
  return variant;
};

runtime.document = mockDocument;
runtime.window = mockWindow;
try {
  let focusRenderer!: ReturnType<typeof create>;
  await act(async () => {
    focusRenderer = create(
      renderStep(FabricAllocationStateEngine.initialize()),
      { createNodeMock: createFocusMock },
    );
  });
  const addShirt = findButton(focusRenderer.root, "Add Fabric");
  assert.ok(addShirt);
  const addShirtFocusTarget = focusMocks.get("Add fabric for Standard Shirt");
  await act(async () =>
    addShirt.props.onClick({
      currentTarget: addShirtFocusTarget,
    }),
  );
  await act(async () => findButton(focusRenderer.root, "Cancel")!.props.onClick());
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "Add fabric for Standard Shirt",
    "Add Fabric cancellation must restore focus to the mounted garment action.",
  );

  const assignedState = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  await act(async () => {
    focusRenderer = create(
      renderStep(assignedState),
      { createNodeMock: createFocusMock },
    );
  });
  const changeShirt = findButton(focusRenderer.root, "Change Fabric");
  assert.ok(changeShirt);
  const changeShirtFocusTarget = focusMocks.get("Change fabric for Standard Shirt");
  await act(async () =>
    changeShirt.props.onClick({
      currentTarget: changeShirtFocusTarget,
    }),
  );
  await act(async () => findButton(focusRenderer.root, "Cancel")!.props.onClick());
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "Change fabric for Standard Shirt",
    "Change Fabric cancellation must restore focus to the mounted garment action.",
  );

  const testFallbackTrigger = async (
    trigger: FocusMock,
    message: string,
  ) => {
    await act(async () =>
      changeShirt.props.onClick({ currentTarget: trigger }),
    );
    await act(async () => findButton(focusRenderer.root, "Cancel")!.props.onClick());
    flushAnimationFrames();
    assert.equal(activeFocusMock?.label, "Change fabric for Standard Shirt", message);
  };
  const changeShirtFocus = focusMocks.get("Change fabric for Standard Shirt");
  assert.ok(changeShirtFocus);
  await testFallbackTrigger(
    createTriggerVariant(changeShirtFocus, { hidden: true }),
    "A hidden trigger must be skipped in favour of the mounted garment action.",
  );
  await testFallbackTrigger(
    createTriggerVariant(changeShirtFocus, { inert: true }),
    "An inert trigger must be skipped in favour of the mounted garment action.",
  );
  await testFallbackTrigger(
    createTriggerVariant(changeShirtFocus, {
      attributes: { "aria-disabled": "true" },
    }),
    "An ARIA-disabled trigger must be skipped in favour of the mounted garment action.",
  );
  await testFallbackTrigger(
    createTriggerVariant(changeShirtFocus, { tagName: "DIV", tabIndex: -2 }),
    "A non-focusable trigger must be skipped in favour of the mounted garment action.",
  );
  const focusFailureTrigger = createTriggerVariant(changeShirtFocus, {
    focus: () => undefined,
  });
  await testFallbackTrigger(
    focusFailureTrigger,
    "A failed focus attempt must continue through the fallback order.",
  );

  let capacityFocusState = FabricAllocationStateEngine.initialize();
  let capacityFocusRenderer!: ReturnType<typeof create>;
  const renderCapacityFocus = () =>
    renderStep(
      capacityFocusState,
      (fabric, garmentKey) => {
        capacityFocusState = assignFutureFabricToGarment({
          state: capacityFocusState,
          garmentTypeSelection: threeGarmentSelection,
          garmentKey,
          fabricCode: fabric.code,
        }).state;
        return capacityFocusState;
      },
      threeGarmentSelection,
    );
  await act(async () => {
    capacityFocusRenderer = create(
      renderCapacityFocus(),
      { createNodeMock: createFocusMock },
    );
  });
  await act(async () =>
    capacityFocusRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => capacityFocusRenderer.update(renderCapacityFocus()));
  await act(async () =>
    findButton(capacityFocusRenderer.root, "Cancel")!.props.onClick(),
  );
  flushAnimationFrames();
  assert.equal(
    capacityFocusRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
  );
  const remainingAddButtons = capacityFocusRenderer.root
    .findAllByType("button")
    .filter((button) => textContent(button).includes("Add Fabric"));
  assert.ok(remainingAddButtons.length >= 2);
  remainingAddButtons.forEach((button) => {
    assert.equal(Boolean(button.props.disabled), false);
  });
  assert.notEqual(activeFocusMock, mockDocument.body);

  let removedTargetRenderer!: ReturnType<typeof create>;
  await act(async () => {
    removedTargetRenderer = create(
      renderStep(sharedState, () => undefined, threeGarmentSelection),
      { createNodeMock: createFocusMock },
    );
  });
  const addTrouser = findButton(removedTargetRenderer.root, "Add Fabric");
  assert.ok(addTrouser);
  const removedTargetFocus = focusMocks.get("Add fabric for Trouser");
  await act(async () =>
    addTrouser.props.onClick({ currentTarget: removedTargetFocus }),
  );
  const staleCancel = findButton(removedTargetRenderer.root, "Cancel");
  assert.ok(staleCancel);
  const staleCancelOnClick = staleCancel.props.onClick;
  await act(async () =>
    removedTargetRenderer.update(renderStep(sharedState)),
  );
  if (removedTargetFocus) removedTargetFocus.isConnected = false;
  const currentRemovedTargetFocus = focusMocks.get("Add fabric for Trouser");
  if (currentRemovedTargetFocus) currentRemovedTargetFocus.isConnected = false;
  activeFocusMock = null;
  await act(async () => staleCancelOnClick());
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "catalogue-heading",
    "When the target garment is removed, cancellation must use the mounted catalogue heading fallback.",
  );

  let unmountRenderer!: ReturnType<typeof create>;
  await act(async () => {
    unmountRenderer = create(
      renderStep(FabricAllocationStateEngine.initialize()),
      { createNodeMock: createFocusMock },
    );
  });
  const unmountAdd = findButton(unmountRenderer.root, "Add Fabric");
  assert.ok(unmountAdd);
  const unmountTrigger = focusMocks.get("Add fabric for Standard Shirt");
  await act(async () =>
    unmountAdd.props.onClick({ currentTarget: unmountTrigger }),
  );
  const unmountCancel = findButton(unmountRenderer.root, "Cancel");
  assert.ok(unmountCancel);
  activeFocusMock = null;
  await act(async () => unmountCancel.props.onClick());
  await act(async () => unmountRenderer.unmount());
  if (unmountTrigger) unmountTrigger.isConnected = false;
  flushAnimationFrames();
  assert.equal(
    activeFocusMock,
    null,
    "A queued cancellation must not focus a Step 2 element after unmount.",
  );

  let directRenderer!: ReturnType<typeof create>;
  await act(async () => {
    directRenderer = create(renderStep(), { createNodeMock: createFocusMock });
  });
  assert.equal(
    findButton(directRenderer.root, "Select Fabric"),
    undefined,
    "The direct assignment path must not render a bottom confirmation button.",
  );
  const directCalls: string[] = [];
  let directState = FabricAllocationStateEngine.initialize();
  await act(async () => {
    directRenderer.update(
      renderStep(
        directState,
        (fabric, garmentKey) => {
          directCalls.push(garmentKey);
          directState = assignFutureFabricToGarment({
            state: directState,
            garmentTypeSelection,
            garmentKey,
            fabricCode: fabric.code,
          }).state;
        },
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        applySameFabricResult(
          () => directState,
          (state) => {
            directState = state;
          },
          garmentTypeSelection,
        ),
      ),
    );
  });
  await act(async () =>
    directRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  assert.deepEqual(
    directCalls,
    [],
    "A card Select click must open the assignment popup before calling the garment handler.",
  );
  assert.equal(
    directRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    1,
    "Selecting a Fabric must open the assignment popup.",
  );
  await clickBulkYes(directRenderer.root);
  await act(async () => {
    directRenderer.update(
      renderStep(
        directState,
        (fabric, garmentKey) => {
          directCalls.push(garmentKey);
          directState = assignFutureFabricToGarment({
            state: directState,
            garmentTypeSelection,
            garmentKey,
            fabricCode: fabric.code,
          }).state;
        },
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        applySameFabricResult(
          () => directState,
          (state) => {
            directState = state;
          },
          garmentTypeSelection,
        ),
      ),
    );
  });
  flushAnimationFrames();
  assert.deepEqual(
    directState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    ["base:shirt"],
  );
  assert.equal(
    directRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
    "Confirmed assignment must close the popup and stay on Step 2.",
  );

  activeFocusMock = null;
  dialogFocusMock = null;
  await act(async () => {
    directRenderer = create(renderStep(pendingState, () => undefined, threeGarmentSelection), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    findButton(directRenderer.root, "Choose Another Fabric")!.props.onClick({
      currentTarget: {},
    }),
  );
  assert.ok(lastPortalChildren, "Choose Another Fabric must render the catalogue dialog.");
  let closePortalRenderer!: ReturnType<typeof create>;
  await act(async () => {
    closePortalRenderer = create(lastPortalChildren as ReactElement, {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    closePortalRenderer.root
      .findByProps({ "aria-label": "Close fabric catalogue" })
      .props.onClick(),
  );
  flushAnimationFrames();
  assert.notEqual(activeFocusMock, mockDocument.body);

  activeFocusMock = null;
  dialogFocusMock = null;
  await act(async () => {
    directRenderer = create(renderStep(pendingState, () => undefined, threeGarmentSelection), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    findButton(directRenderer.root, "Choose Another Fabric")!.props.onClick({
      currentTarget: {},
    }),
  );
  let escapePortalRenderer!: ReturnType<typeof create>;
  await act(async () => {
    escapePortalRenderer = create(lastPortalChildren as ReactElement, {
      createNodeMock: createFocusMock,
    });
  });
  assert.ok(escapePortalRenderer);
  await act(async () =>
    dialogFocusMock?.dispatchKeyDown({
      key: "Escape",
      preventDefault: () => undefined,
    }),
  );
  flushAnimationFrames();
  assert.notEqual(activeFocusMock, mockDocument.body);

  let capacityAssignmentState = FabricAllocationStateEngine.initialize();
  let capacityAssignmentRenderer!: ReturnType<typeof create>;
  await act(async () => {
    capacityAssignmentRenderer = create(
      renderStep(
        capacityAssignmentState,
        (fabric, garmentKey) => {
          capacityAssignmentState = assignFutureFabricToGarment({
            state: capacityAssignmentState,
            garmentTypeSelection: threeGarmentSelection,
            garmentKey,
            fabricCode: fabric.code,
          }).state;
        },
        threeGarmentSelection,
      ),
      { createNodeMock: createFocusMock },
    );
  });
  const capacityAssignmentAdd = findButton(
    capacityAssignmentRenderer.root,
    "Add Fabric",
  );
  assert.ok(capacityAssignmentAdd);
  await act(async () =>
    capacityAssignmentAdd.props.onClick({
      currentTarget: focusMocks.get("Add fabric for Standard Shirt"),
    }),
  );
  await act(async () =>
    capacityAssignmentRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () =>
    capacityAssignmentRenderer.update(
      renderStep(
        capacityAssignmentState,
        (fabric, garmentKey) => {
          capacityAssignmentState = assignFutureFabricToGarment({
            state: capacityAssignmentState,
            garmentTypeSelection: threeGarmentSelection,
            garmentKey,
            fabricCode: fabric.code,
          }).state;
        },
        threeGarmentSelection,
      ),
    ),
  );
  flushAnimationFrames();
  assert.equal(
    capacityAssignmentRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    1,
    "Successful first assignment must keep the bulk-choice dialog open.",
  );

  let rapidRenderer!: ReturnType<typeof create>;
  await act(async () => {
    rapidRenderer = create(
      renderStep(sharedState, () => undefined, threeGarmentSelection),
      { createNodeMock: createFocusMock },
    );
  });
  const rapidChange = findButton(rapidRenderer.root, "Change Fabric");
  const rapidAdd = findButton(rapidRenderer.root, "Add Fabric");
  assert.ok(rapidChange && rapidAdd);
  const olderTrigger = createTriggerVariant(
    focusMocks.get("Change fabric for Standard Shirt")!,
    { label: "older-trigger" },
  );
  await act(async () => rapidChange.props.onClick({ currentTarget: olderTrigger }));
  await act(async () => findButton(rapidRenderer.root, "Cancel")!.props.onClick());
  await act(async () =>
    rapidAdd.props.onClick({
      currentTarget: focusMocks.get("Add fabric for Trouser"),
    }),
  );
  flushAnimationFrames();
  assert.notEqual(
    activeFocusMock,
    olderTrigger,
    "A newer catalogue interaction must invalidate an older queued restoration.",
  );

  const shirtTrouserSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  let shirtTrouserState = FabricAllocationStateEngine.initialize();
  const shirtTrouserCalls: string[] = [];
  let shirtTrouserRenderer!: ReturnType<typeof create>;
  const renderShirtTrouser = () =>
    renderStep(
      shirtTrouserState,
      (fabric, garmentKey) => {
        shirtTrouserCalls.push(garmentKey);
        shirtTrouserState = selectFutureFabric({
          state: shirtTrouserState,
          garmentTypeSelection: shirtTrouserSelection,
          fabricCode: fabric.code,
          targetGarmentKey: garmentKey,
        });
      },
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) =>
        applySameFabricResult(
          () => shirtTrouserState,
          (state) => {
            shirtTrouserState = state;
          },
          shirtTrouserSelection,
        )(fabricCode, garmentKeys),
    );
  await act(async () => {
    shirtTrouserRenderer = create(renderShirtTrouser(), {
      createNodeMock: createFocusMock,
    });
  });
  assert.equal(
    textContent(shirtTrouserRenderer.root).match(/Needs fabric/g)?.length,
    2,
    "Fresh Shirt + Trouser must show both garments as needing fabric.",
  );
  assertFabricProgress(shirtTrouserRenderer.root, 0, 1, 0, 2);
  assert.equal(
    findButton(shirtTrouserRenderer.root, "Continue to Design Style"),
    undefined,
    "Incomplete Fabric must not expose a hidden or focusable Continue action.",
  );
  await act(async () =>
    shirtTrouserRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => shirtTrouserRenderer.update(renderShirtTrouser()));
  assert.deepEqual(
    shirtTrouserCalls,
    [],
    "Selecting a Fabric must not assign until the popup is confirmed.",
  );
  assert.deepEqual(
    shirtTrouserState.fabricAllocations,
    [],
    "The first catalogue click must open the assignment popup without allocating.",
  );
  await clickBulkYes(shirtTrouserRenderer.root);
  await act(async () => shirtTrouserRenderer.update(renderShirtTrouser()));
  assert.deepEqual(
    shirtTrouserState.fabricAllocations.map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [{ fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] }],
    "YES — Use for All must fill one authoritative allocation through the capacity engine.",
  );
  assertFabricProgress(shirtTrouserRenderer.root, 1, 1, 2, 2);
  assert.equal(
    shirtTrouserRenderer.root.findAllByProps({
      "data-assignment-status": "unassigned",
    }).length,
    0,
  );
  assert.ok(findButton(shirtTrouserRenderer.root, "Continue to Design Style"));
  assert.equal(
    findButton(shirtTrouserRenderer.root, "Select Fabric"),
    undefined,
    "The direct multi-garment path must not render a bottom confirmation action.",
  );

  const shirtTrouserKaftanSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser", "kaftan"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  let shirtTrouserKaftanState = FabricAllocationStateEngine.initialize();
  const shirtTrouserKaftanCalls: string[] = [];
  let shirtTrouserKaftanRenderer!: ReturnType<typeof create>;
  const renderShirtTrouserKaftan = () =>
    renderStep(
      shirtTrouserKaftanState,
      (fabric, garmentKey) => {
        shirtTrouserKaftanCalls.push(garmentKey);
        if (
          shirtTrouserKaftanState.awaitingFabricForPendingGarment &&
          shirtTrouserKaftanState.pendingFabricGarment?.garmentKey === garmentKey
        ) {
          shirtTrouserKaftanState =
            FabricAllocationStateEngine.assignPendingGarmentToFabric(
              shirtTrouserKaftanState,
              fabric.code,
            );
          return;
        }
        const alreadyAssigned = shirtTrouserKaftanState.fabricAllocations.some(
          (allocation) =>
            allocation.garmentAssignments.some(
              (assignment) => assignment.garmentKey === garmentKey,
            ),
        );
        shirtTrouserKaftanState = alreadyAssigned
          ? assignFutureFabricToGarment({
              state: shirtTrouserKaftanState,
              garmentTypeSelection: shirtTrouserKaftanSelection,
              garmentKey,
              fabricCode: fabric.code,
            }).state
          : selectFutureFabric({
              state: shirtTrouserKaftanState,
              garmentTypeSelection: shirtTrouserKaftanSelection,
              fabricCode: fabric.code,
              targetGarmentKey: garmentKey,
            });
      },
      shirtTrouserKaftanSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => shirtTrouserKaftanState,
        (state) => {
          shirtTrouserKaftanState = state;
        },
        shirtTrouserKaftanSelection,
      ),
    );
  await act(async () => {
    shirtTrouserKaftanRenderer = create(renderShirtTrouserKaftan(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    shirtTrouserKaftanRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => shirtTrouserKaftanRenderer.update(renderShirtTrouserKaftan()));
  assert.deepEqual(shirtTrouserKaftanCalls, []);
  assert.equal(shirtTrouserKaftanState.fabricAllocations.length, 0);
  await clickBulkYes(shirtTrouserKaftanRenderer.root);
  await act(async () => shirtTrouserKaftanRenderer.update(renderShirtTrouserKaftan()));
  assert.deepEqual(
    shirtTrouserKaftanState.fabricAllocations.map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [
      { fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] },
      { fabricCode: "INLINE-A", garmentKeys: ["base:kaftan"] },
    ],
  );
  assert.equal(shirtTrouserKaftanState.pendingFabricGarment, null);
  assertFabricProgress(shirtTrouserKaftanRenderer.root, 2, 2, 3, 3);

  for (const dedicatedCase of [
    { garmentType: "full_length_gown" as const, key: "base:full_length_gown" },
    { garmentType: "agbada" as const, key: "base:agbada" },
  ]) {
    const dedicatedSelection = reconcileGarmentTypeStepSelection({
      selectedGarmentTypes: ["shirt", "trouser", dedicatedCase.garmentType],
      selectedDemographics: ["male"],
      normalizedCustomDetailCatalog: catalog,
    }).selection;
    let dedicatedState = FabricAllocationStateEngine.initialize();
    let dedicatedRenderer!: ReturnType<typeof create>;
    const renderDedicated = () =>
      renderStep(
        dedicatedState,
        (fabric, garmentKey) => {
          dedicatedState = selectFutureFabric({
            state: dedicatedState,
            garmentTypeSelection: dedicatedSelection,
            fabricCode: fabric.code,
            targetGarmentKey: garmentKey,
          });
        },
        dedicatedSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        applySameFabricResult(
          () => dedicatedState,
          (state) => {
            dedicatedState = state;
          },
          dedicatedSelection,
        ),
      );
    await act(async () => {
      dedicatedRenderer = create(renderDedicated(), {
        createNodeMock: createFocusMock,
      });
    });
    await act(async () =>
      dedicatedRenderer.root
        .findAllByProps({ "data-fabric-card": "true" })[0]
        .props.onClick(),
    );
    await act(async () => dedicatedRenderer.update(renderDedicated()));
    await clickBulkYes(dedicatedRenderer.root);
    await act(async () => dedicatedRenderer.update(renderDedicated()));
    if (dedicatedCase.garmentType === "agbada") {
      assert.deepEqual(
        dedicatedState.fabricAllocations.map((allocation) =>
          allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
        ),
        [["base:shirt", "base:trouser"]],
        "Hidden Agbada must be excluded from the initial Step 1 bulk assignment.",
      );
    } else {
      assert.deepEqual(
        dedicatedState.fabricAllocations.map((allocation) =>
          allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
        ),
        [["base:shirt", "base:trouser"], [dedicatedCase.key]],
        `${dedicatedCase.garmentType} must occupy its own allocation when the first allocation is full.`,
      );
      assert.equal(
        new Set(
          dedicatedState.fabricAllocations.map((allocation) => allocation.fabricCode),
        ).size,
        1,
        `${dedicatedCase.garmentType} must reuse the selected fabric product across allocations.`,
      );
    }
    assert.equal(dedicatedState.pendingFabricGarment, null);
  }

  let removalState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  removalState = assignRemainingSameFabric(
    removalState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  const removalAllocationId = removalState.fabricAllocations[0].allocationId;
  let removalRenderer!: ReturnType<typeof create>;
  const renderRemoval = () =>
    renderStep(
      removalState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        removalState = removeFutureFabricAssignment({
          state: removalState,
          garmentKey,
        });
      },
    );
  await act(async () => {
    removalRenderer = create(renderRemoval(), {
      createNodeMock: createFocusMock,
    });
  });
  const removeShirt = removalRenderer.root.findByProps({
    "aria-label": "Remove fabric from Standard Shirt",
  });
  assert.equal(removeShirt.props.title, "Remove Fabric");
  assert.match(removeShirt.props.className, /min-h-11/);
  assert.match(removeShirt.props.className, /min-w-11/);
  await act(async () => removeShirt.props.onClick());
  await act(async () => removalRenderer.update(renderRemoval()));
  flushAnimationFrames();
  assert.deepEqual(
    removalState.fabricAllocations.map((allocation) => ({
      allocationId: allocation.allocationId,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [{ allocationId: removalAllocationId, garmentKeys: ["base:trouser"] }],
  );
  assert.equal(
    removalRenderer.root.findByProps({
      "data-garment-key": "base:shirt",
    }).props["data-assignment-status"],
    "unassigned",
  );
  assert.equal(
    removalRenderer.root.findAllByProps({
      "aria-label": "Remove fabric from Standard Shirt",
    }).length,
    0,
  );
  assert.equal(
    removalRenderer.root.findAllByProps({
      "aria-label": "Remove fabric from Trouser",
    }).length,
    1,
  );
  assertFabricProgress(removalRenderer.root, 1, 1, 1, 2);
  assert.doesNotMatch(
    textContent(removalRenderer.root),
    /Your fabric can carry one more garment\. \(Optional\)/,
    "Removing a shared assignment must not create a spare-capacity offer.",
  );
  assert.match(
    textContent(removalRenderer.root),
    /Garment Construction Subtotal€140\.00/,
    "The construction subtotal must remain visible while Fabric completion is blocked.",
  );
  assert.match(
    textContent(removalRenderer.root),
    /Inline Heritage A removed from Standard Shirt\./,
    "Removal must announce the exact fabric and garment without exposing implementation details.",
  );
  assert.ok(
    findButton(removalRenderer.root, "Add Fabric"),
    "The removed garment must immediately expose its Add Fabric action.",
  );
  assert.equal(
    findButton(removalRenderer.root, "Continue to Design Style"),
    undefined,
    "Removal must remove the forward action while Fabric is incomplete.",
  );
  assert.equal(
    activeFocusMock?.label,
    "Add fabric for Standard Shirt",
    "Removing a fabric must return focus to the removed garment's Add Fabric action.",
  );
  assert.equal(
    mockWindow.scrollY,
    240,
    "Removal focus must preserve the customer viewport position.",
  );

  const removeTrouser = removalRenderer.root.findByProps({
    "aria-label": "Remove fabric from Trouser",
  });
  await act(async () => removeTrouser.props.onClick());
  await act(async () => removalRenderer.update(renderRemoval()));
  assert.equal(removalState.fabricAllocations.length, 0);
  assert.equal(removalState.activeAllocationId, null);
  assertFabricProgress(removalRenderer.root, 0, 1, 0, 2);
  assert.doesNotMatch(
    textContent(removalRenderer.root),
    /Your fabric can carry one more garment\. \(Optional\)/,
    "Removing the final assignment must not create a spare-capacity offer.",
  );
  assert.match(
    textContent(removalRenderer.root),
    /Garment Construction Subtotal€140\.00/,
    "The construction subtotal must remain visible after final Fabric removal.",
  );
  assert.match(
    textContent(removalRenderer.root),
    /Inline Heritage A removed from Trouser\./,
  );
  assert.equal(
    removalRenderer.root.findAllByProps({
      "aria-label": "Remove fabric from Trouser",
    }).length,
    0,
  );
  assert.equal(findButton(removalRenderer.root, "Select Fabric"), undefined);

  let pendingFinalRemovalState =
    FabricAllocationStateEngine.removeGarmentAssignments(
      pendingState,
      ["base:shirt"],
    );
  assert.equal(
    pendingFinalRemovalState.pendingFabricGarment?.garmentKey,
    "base:skirt",
    "The rendered regression must begin with a different pending overflow garment.",
  );
  let pendingFinalRemovalRenderer!: ReturnType<typeof create>;
  const renderPendingFinalRemoval = () =>
    renderStep(
      pendingFinalRemovalState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        pendingFinalRemovalState = removeFutureFabricAssignment({
          state: pendingFinalRemovalState,
          garmentKey,
        });
      },
    );
  await act(async () => {
    pendingFinalRemovalRenderer = create(renderPendingFinalRemoval(), {
      createNodeMock: createFocusMock,
    });
  });
  assert.equal(
    pendingFinalRemovalRenderer.root.findAllByProps({ role: "dialog" }).length,
    1,
  );
  await act(async () =>
    pendingFinalRemovalRenderer.root
      .findByProps({ "aria-label": "Remove fabric from Trouser" })
      .props.onClick(),
  );
  await act(async () =>
    pendingFinalRemovalRenderer.update(renderPendingFinalRemoval()),
  );
  flushAnimationFrames();
  assert.equal(pendingFinalRemovalState.fabricAllocations.length, 0);
  assert.equal(pendingFinalRemovalState.activeAllocationId, null);
  assert.equal(
    pendingFinalRemovalState.pendingFabricGarment?.garmentKey,
    "base:skirt",
    "Removing the last unrelated assignment must preserve the pending overflow garment.",
  );
  assert.equal(
    pendingFinalRemovalRenderer.root.findAllByProps({ role: "dialog" }).length,
    1,
    "The pending overflow dialog must remain while its garment is still pending.",
  );
  const pendingFinalAdd = pendingFinalRemovalRenderer.root.findByProps({
    "aria-label": "Add fabric for Trouser",
  });
  assert.equal(Boolean(pendingFinalAdd.props.disabled), false);
  assert.equal(
    findButton(pendingFinalRemovalRenderer.root, "Continue to Design Style"),
    undefined,
  );
  assert.doesNotMatch(
    textContent(pendingFinalRemovalRenderer.root),
    /Your fabric can carry one more garment\. \(Optional\)/,
  );
  assert.match(
    textContent(pendingFinalRemovalRenderer.root),
    /Inline Heritage A removed from Trouser\./,
  );
  assert.equal(activeFocusMock?.label, "Add fabric for Trouser");

  let noOpRenderer!: ReturnType<typeof create>;
  await act(async () => {
    noOpRenderer = create(
      renderStep(sharedState, () => undefined, shirtTrouserSelection, () => undefined, () => undefined, () => undefined),
      { createNodeMock: createFocusMock },
    );
  });
  const noOpRemove = noOpRenderer.root.findByProps({
    "aria-label": "Remove fabric from Standard Shirt",
  });
  await act(async () => noOpRemove.props.onClick());
  await act(async () => noOpRenderer.update(renderStep(sharedState, () => undefined, shirtTrouserSelection, () => undefined, () => undefined, () => undefined)));
  await act(async () => flushAnimationFrames());
  assert.doesNotMatch(
    textContent(noOpRenderer.root),
    /removed from Standard Shirt\./,
    "A no-op removal must not announce a false removal.",
  );

  let separateRemovalState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  separateRemovalState = applyFutureFabricCardSelection({
    state: separateRemovalState,
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
  const separateAllocationId = separateRemovalState.fabricAllocations.find(
    (allocation) => allocation.fabricCode === "INLINE-B",
  )?.allocationId;
  let separateRemovalRenderer!: ReturnType<typeof create>;
  const renderSeparateRemoval = () =>
    renderStep(
      separateRemovalState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        separateRemovalState = removeFutureFabricAssignment({
          state: separateRemovalState,
          garmentKey,
        });
      },
    );
  await act(async () => {
    separateRemovalRenderer = create(renderSeparateRemoval(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    separateRemovalRenderer.root
      .findByProps({ "aria-label": "Remove fabric from Standard Shirt" })
      .props.onClick(),
  );
  await act(async () => separateRemovalRenderer.update(renderSeparateRemoval()));
  assert.deepEqual(
    separateRemovalState.fabricAllocations.map((allocation) => ({
      allocationId: allocation.allocationId,
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [
      {
        allocationId: separateAllocationId,
        fabricCode: "INLINE-B",
        garmentKeys: ["base:trouser"],
      },
    ],
    "Removing one separate assignment must preserve the unrelated allocation and Fabric.",
  );

  const findFabricCard = (root: ReactTestInstance, fabricCode: string) =>
    root
      .findAllByProps({ "data-fabric-card": "true" })
      .find((card) => card.props["data-fabric-code"] === fabricCode);

  let inUseCancelState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: garmentTypeSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  let inUseCancelRenderer!: ReturnType<typeof create>;
  const renderInUseCancel = () =>
    renderStep(
      inUseCancelState,
      (fabric, garmentKey) => {
        inUseCancelState = applyFutureFabricCardSelection({
          state: inUseCancelState,
          garmentTypeSelection: garmentTypeSelection,
          garmentKey,
          fabricCode: fabric.code,
        });
      },
      garmentTypeSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: inUseCancelState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          inUseCancelState = result.state;
        }
        return result;
      },
      undefined,
      applySameFabricResult(
        () => inUseCancelState,
        (state) => {
          inUseCancelState = state;
        },
        garmentTypeSelection,
      ),
    );
  await act(async () => {
    inUseCancelRenderer = create(renderInUseCancel());
  });
  const assignedShirtCard = findFabricCard(inUseCancelRenderer.root, "INLINE-A");
  assert.equal(assignedShirtCard?.props["data-fabric-status"], "IN USE");
  assert.equal(assignedShirtCard?.props["data-fabric-action"], "cancel");
  assert.equal(assignedShirtCard?.props["data-fabric-remove"], "true");
  assert.equal(assignedShirtCard?.props["data-fabric-idle-label"], undefined);
  assert.equal(assignedShirtCard?.props["data-fabric-active-label"], undefined);
  assert.equal(
    assignedShirtCard?.props["data-fabric-cancel-garment-key"],
    "base:shirt",
  );
  assert.equal(assignedShirtCard?.props["data-fabric-cancel-count"], "1");
  assert.equal(
    assignedShirtCard?.props["data-fabric-remove-chooser"],
    undefined,
  );
  assert.match(
    assignedShirtCard?.props["aria-label"] || "",
    /Remove Inline Heritage A from Standard Shirt/,
  );
  assert.match(
    textContent(inUseCancelRenderer.root),
    /IN USE/,
  );
  assert.doesNotMatch(
    textContent(assignedShirtCard!),
    /CANCEL/,
  );
  const assignedShirtStockBadge = findStockBadge(
    inUseCancelRenderer.root,
    "INLINE-A",
  );
  assert.ok(
    assignedShirtStockBadge,
    "IN USE / CANCEL cards must still show the visible stock badge.",
  );
  assert.equal(assignedShirtStockBadge?.props["data-fabric-stock-label"], "In Stock");
  assert.ok(!assignedShirtCard?.props.disabled);
  await act(async () => assignedShirtCard!.props.onClick());
  await act(async () => inUseCancelRenderer.update(renderInUseCancel()));
  assert.equal(
    inUseCancelState.fabricAllocations.length,
    0,
    "Cancelling the only assignment must unassign Shirt through the canonical removal path.",
  );
  assert.equal(
    inUseCancelRenderer.root.findByProps({ "data-garment-key": "base:shirt" })
      .props["data-assignment-status"],
    "unassigned",
  );
  assert.match(textContent(inUseCancelRenderer.root), /Fabric not assigned/);
  assertFabricProgress(inUseCancelRenderer.root, 0, 1, 0, 1);
  assert.equal(
    findFabricCard(inUseCancelRenderer.root, "INLINE-A")?.props[
      "data-fabric-status"
    ],
    "SELECT",
  );
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection,
      fabricAllocationState: inUseCancelState,
      fabrics,
    }).isComplete,
    false,
  );

  await act(async () =>
    findFabricCard(inUseCancelRenderer.root, "INLINE-B")!.props.onClick({
      currentTarget: {},
    }),
  );
  await act(async () => inUseCancelRenderer.update(renderInUseCancel()));
  await clickBulkYes(inUseCancelRenderer.root);
  await act(async () => inUseCancelRenderer.update(renderInUseCancel()));
  assert.deepEqual(
    inUseCancelState.fabricAllocations.map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [{ fabricCode: "INLINE-B", garmentKeys: ["base:shirt"] }],
    "After cancellation the same garment must be able to receive another fabric.",
  );
  assert.equal(
    findFabricCard(inUseCancelRenderer.root, "INLINE-B")?.props[
      "data-fabric-status"
    ],
    "IN USE",
  );
  assert.equal(
    findFabricCard(inUseCancelRenderer.root, "INLINE-A")?.props[
      "data-fabric-status"
    ],
    STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
    "The cancelled unused fabric must not remain marked in use after a replacement assignment.",
  );

  let preserveOtherState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  preserveOtherState = applyFutureFabricCardSelection({
    state: preserveOtherState,
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
  let preserveOtherRenderer!: ReturnType<typeof create>;
  const renderPreserveOther = () =>
    renderStep(
      preserveOtherState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: preserveOtherState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          preserveOtherState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    preserveOtherRenderer = create(renderPreserveOther());
  });
  assert.equal(
    findFabricCard(preserveOtherRenderer.root, "INLINE-A")?.props[
      "data-fabric-cancel-garment-key"
    ],
    "base:shirt",
  );
  await act(async () =>
    findFabricCard(preserveOtherRenderer.root, "INLINE-A")!.props.onClick(),
  );
  await act(async () => preserveOtherRenderer.update(renderPreserveOther()));
  assert.deepEqual(
    preserveOtherState.fabricAllocations.map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [{ fabricCode: "INLINE-B", garmentKeys: ["base:trouser"] }],
    "Cancelling Shirt must not remove Trouser's unrelated fabric assignment.",
  );
  assert.equal(
    preserveOtherRenderer.root.findByProps({ "data-garment-key": "base:shirt" })
      .props["data-assignment-status"],
    "unassigned",
  );
  assert.equal(
    preserveOtherRenderer.root.findByProps({
      "data-garment-key": "base:trouser",
    }).props["data-assignment-status"],
    "assigned",
  );
  assert.match(
    textContent(
      preserveOtherRenderer.root.findByProps({
        "data-garment-key": "base:trouser",
      }),
    ),
    /Inline Heritage B/,
  );
  assertFabricProgress(preserveOtherRenderer.root, 1, 1, 1, 2);

  const findRemovalDialog = (root: ReactTestInstance) =>
    root.findAllByProps({
      "data-testid": "remove-fabric-assignment-dialog",
    })[0] ?? null;
  const findRemovalButton = (root: ReactTestInstance, garmentKey: string) =>
    root.findAllByProps({
      "data-remove-fabric-assignment-garment-key": garmentKey,
    })[0] ?? null;

  let sharedCodeState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  sharedCodeState = assignRemainingSameFabric(
    sharedCodeState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  let sharedCodeRenderer!: ReturnType<typeof create>;
  const renderSharedCode = () =>
    renderStep(
      sharedCodeState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: sharedCodeState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          sharedCodeState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    sharedCodeRenderer = create(renderSharedCode());
  });
  assert.deepEqual(
    sharedCodeState.fabricAllocations[0]?.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
    ["base:shirt", "base:trouser"],
  );
  const sharedFabricCard = findFabricCard(sharedCodeRenderer.root, "INLINE-A");
  assert.equal(sharedFabricCard?.props["data-fabric-action"], "cancel");
  assert.equal(
    findFabricCard(sharedCodeRenderer.root, "INLINE-B")?.props["data-fabric-status"],
    STEP1_NO_GARMENTS_TO_ASSIGN_STATUS,
  );
  assert.equal(sharedFabricCard?.props["data-fabric-remove-chooser"], "true");
  assert.equal(sharedFabricCard?.props["data-fabric-cancel-count"], "2");
  assert.equal(
    sharedFabricCard?.props["data-fabric-cancel-garment-key"],
    undefined,
  );
  assert.match(
    sharedFabricCard?.props["aria-label"] || "",
    /Choose garment to remove Inline Heritage A from/,
  );
  const sharedSnapshot = JSON.parse(JSON.stringify(sharedCodeState));
  await act(async () => sharedFabricCard!.props.onClick());
  assert.deepEqual(
    JSON.parse(JSON.stringify(sharedCodeState)),
    sharedSnapshot,
    "Opening the removal chooser must not mutate assignments.",
  );
  const sharedChooser = findRemovalDialog(sharedCodeRenderer.root);
  assert.ok(sharedChooser, "Multi-assignment X must open Remove Fabric Assignment.");
  assert.match(textContent(sharedChooser!), /Remove Fabric Assignment/);
  assert.match(textContent(sharedChooser!), /Inline Heritage A/);
  assert.match(textContent(sharedChooser!), /INLINE-A/);
  assert.match(
    textContent(sharedChooser!),
    /Choose which garment should stop using this Fabric\./,
  );
  assert.ok(findRemovalButton(sharedCodeRenderer.root, "base:shirt"));
  assert.ok(findRemovalButton(sharedCodeRenderer.root, "base:trouser"));
  await act(async () =>
    findRemovalButton(sharedCodeRenderer.root, "base:shirt")!.props.onClick(),
  );
  await act(async () => sharedCodeRenderer.update(renderSharedCode()));
  assert.deepEqual(
    sharedCodeState.fabricAllocations.map((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    [["base:trouser"]],
    "Removing Shirt from the chooser must leave Trouser assigned to the shared Fabric.",
  );
  assert.equal(
    sharedCodeRenderer.root.findByProps({ "data-garment-key": "base:shirt" })
      .props["data-assignment-status"],
    "unassigned",
  );
  assert.equal(
    sharedCodeRenderer.root.findByProps({ "data-garment-key": "base:trouser" })
      .props["data-assignment-status"],
    "assigned",
  );
  assert.equal(findRemovalDialog(sharedCodeRenderer.root), null);
  const remainingSharedCard = findFabricCard(
    sharedCodeRenderer.root,
    "INLINE-A",
  );
  assert.equal(
    remainingSharedCard?.props["data-fabric-status"],
    "USE AGAIN",
    "After Shirt is removed, residual capacity plus an unassigned candidate must keep USE AGAIN.",
  );
  assert.equal(remainingSharedCard?.props["data-fabric-action"], "use_again");
  assert.equal(remainingSharedCard?.props["data-fabric-remove"], undefined);

  let sharedTrouserState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  sharedTrouserState = assignRemainingSameFabric(
    sharedTrouserState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  let sharedTrouserRenderer!: ReturnType<typeof create>;
  const renderSharedTrouser = () =>
    renderStep(
      sharedTrouserState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: sharedTrouserState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          sharedTrouserState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    sharedTrouserRenderer = create(renderSharedTrouser());
  });
  await act(async () =>
    findFabricCard(sharedTrouserRenderer.root, "INLINE-A")!.props.onClick(),
  );
  await act(async () =>
    findRemovalButton(sharedTrouserRenderer.root, "base:trouser")!.props.onClick(),
  );
  await act(async () => sharedTrouserRenderer.update(renderSharedTrouser()));
  assert.deepEqual(
    sharedTrouserState.fabricAllocations.map((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    [["base:shirt"]],
    "Removing Trouser from the chooser must leave Shirt assigned.",
  );

  let sharedCancelChooserState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  sharedCancelChooserState = assignRemainingSameFabric(
    sharedCancelChooserState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  const sharedCancelChooserSnapshot = JSON.parse(
    JSON.stringify(sharedCancelChooserState),
  );
  let sharedCancelChooserRenderer!: ReturnType<typeof create>;
  const renderSharedCancelChooser = () =>
    renderStep(
      sharedCancelChooserState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: sharedCancelChooserState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          sharedCancelChooserState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    sharedCancelChooserRenderer = create(renderSharedCancelChooser());
  });
  await act(async () =>
    findFabricCard(sharedCancelChooserRenderer.root, "INLINE-A")!.props.onClick(),
  );
  assert.ok(findRemovalDialog(sharedCancelChooserRenderer.root));
  await act(async () =>
    sharedCancelChooserRenderer.root.findByProps({
      "data-remove-fabric-assignment-cancel": "true",
    }).props.onClick(),
  );
  assert.equal(findRemovalDialog(sharedCancelChooserRenderer.root), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sharedCancelChooserState)),
    sharedCancelChooserSnapshot,
    "Cancel on the removal chooser must not change assignments.",
  );
  await act(async () =>
    findFabricCard(sharedCancelChooserRenderer.root, "INLINE-A")!.props.onClick(),
  );
  const escapeEvent = {
    key: "Escape",
    preventDefault() {
      return undefined;
    },
  };
  await act(async () =>
    findRemovalDialog(sharedCancelChooserRenderer.root)!.props.onKeyDown(
      escapeEvent,
    ),
  );
  assert.equal(findRemovalDialog(sharedCancelChooserRenderer.root), null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sharedCancelChooserState)),
    sharedCancelChooserSnapshot,
    "Escape on the removal chooser must not change assignments.",
  );

  let useAgainState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  let useAgainRenderer!: ReturnType<typeof create>;
  await act(async () => {
    useAgainRenderer = create(
      renderStep(
        useAgainState,
        () => undefined,
        shirtTrouserSelection,
        () => undefined,
        () => undefined,
        () => undefined,
      ),
    );
  });
  const useAgainCard = findFabricCard(useAgainRenderer.root, "INLINE-A");
  assert.equal(useAgainCard?.props["data-fabric-status"], "USE AGAIN");
  assert.equal(useAgainCard?.props["data-fabric-action"], "use_again");
  assert.equal(useAgainCard?.props["data-fabric-remove"], undefined);
  assert.equal(
    findFabricCard(useAgainRenderer.root, "INLINE-B")?.props["data-fabric-status"],
    "SELECT",
  );

  let threeSharedUiState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  threeSharedUiState = commitSameFabric({
    state: threeSharedUiState,
    garmentTypeSelection: threeGarmentSelection,
    fabricCode: "INLINE-A",
    garmentKeys: remainingGarmentKeys(threeGarmentSelection, threeSharedUiState),
  });
  let threeSharedRenderer!: ReturnType<typeof create>;
  const renderThreeShared = () =>
    renderStep(
      threeSharedUiState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: threeSharedUiState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          threeSharedUiState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    threeSharedRenderer = create(renderThreeShared());
  });
  const threeCard = findFabricCard(threeSharedRenderer.root, "INLINE-A");
  assert.equal(threeCard?.props["data-fabric-remove-chooser"], "true");
  await act(async () => threeCard!.props.onClick());
  assert.ok(findRemovalButton(threeSharedRenderer.root, "base:shirt"));
  assert.ok(findRemovalButton(threeSharedRenderer.root, "base:trouser"));
  assert.ok(findRemovalButton(threeSharedRenderer.root, "base:skirt"));
  await act(async () =>
    findRemovalButton(threeSharedRenderer.root, "base:shirt")!.props.onClick(),
  );
  await act(async () => threeSharedRenderer.update(renderThreeShared()));
  assert.deepEqual(
    threeSharedUiState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    ["base:trouser", "base:skirt"],
  );

  const { createCatalogueAdditionalGarmentSelection } = await import(
    "./src/utils/additionalGarmentDomain"
  );
  let additionalCancelState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  additionalCancelState = assignRemainingSameFabric(
    additionalCancelState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  const additionalSelection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: additionalCancelState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
  });
  assert.equal(additionalSelection.status, "resolved");
  if (additionalSelection.status !== "resolved") {
    throw new Error("Expected additional shirt selection.");
  }
  additionalCancelState = FabricAllocationStateEngine.attemptAppendGarment(
    additionalCancelState,
    additionalSelection.selection,
  );
  if (additionalCancelState.pendingFabricGarment) {
    additionalCancelState =
      FabricAllocationStateEngine.assignPendingGarmentToFabric(
        additionalCancelState,
        "INLINE-B",
      );
  }
  assert.ok(
    additionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
    ),
    "Additional Shirt must be assigned before its fabric can be cancelled.",
  );
  let additionalCancelRenderer!: ReturnType<typeof create>;
  const renderAdditionalCancel = () =>
    renderStep(
      additionalCancelState,
      (fabric, garmentKey) => {
        additionalCancelState = applyFutureFabricCardSelection({
          state: additionalCancelState,
          garmentTypeSelection: shirtTrouserSelection,
          garmentKey,
          fabricCode: fabric.code,
        });
      },
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: additionalCancelState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          additionalCancelState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    additionalCancelRenderer = create(renderAdditionalCancel());
  });
  const additionalFabricCard = findFabricCard(
    additionalCancelRenderer.root,
    additionalCancelState.fabricAllocations.find((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
    )?.fabricCode || "INLINE-B",
  );
  assert.equal(additionalFabricCard?.props["data-fabric-action"], "cancel");
  assert.equal(
    additionalFabricCard?.props["data-fabric-cancel-garment-key"],
    "additional:shirt:1",
  );
  await act(async () => additionalFabricCard!.props.onClick());
  await act(async () =>
    additionalCancelRenderer.update(renderAdditionalCancel()),
  );
  assert.equal(
    additionalCancelState.pendingFabricGarment?.garmentKey,
    "additional:shirt:1",
    "Cancelling Additional Shirt fabric must keep the additional occurrence pending.",
  );
  assert.equal(additionalCancelState.awaitingFabricForPendingGarment, true);
  assert.ok(
    additionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
    ),
    "Main Shirt fabric must survive Additional Shirt fabric cancellation.",
  );
  assert.ok(
    additionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:trouser",
      ),
    ),
    "Trouser fabric must survive Additional Shirt fabric cancellation.",
  );
  assert.equal(
    additionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
    ),
    false,
  );
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: shirtTrouserSelection,
      fabricAllocationState: additionalCancelState,
      fabrics,
    }).isComplete,
    false,
    "Progression must block until Additional Shirt receives fabric again.",
  );

  let mixedStep4UiState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  mixedStep4UiState = applyFutureFabricCardSelection({
    state: mixedStep4UiState,
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
  const mixedAdditionalSelection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: mixedStep4UiState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
  });
  assert.equal(mixedAdditionalSelection.status, "resolved");
  if (mixedAdditionalSelection.status !== "resolved") {
    throw new Error("Expected additional shirt.");
  }
  mixedStep4UiState = FabricAllocationStateEngine.attemptAppendGarment(
    mixedStep4UiState,
    mixedAdditionalSelection.selection,
  );
  if (mixedStep4UiState.pendingFabricGarment) {
    mixedStep4UiState = FabricAllocationStateEngine.assignPendingGarmentToFabric(
      mixedStep4UiState,
      "INLINE-A",
    );
  }
  let mixedStep4Renderer!: ReturnType<typeof create>;
  const renderMixedStep4 = () =>
    renderStep(
      mixedStep4UiState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: mixedStep4UiState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          mixedStep4UiState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    mixedStep4Renderer = create(renderMixedStep4());
  });
  const mixedCard = findFabricCard(mixedStep4Renderer.root, "INLINE-A");
  assert.equal(mixedCard?.props["data-fabric-cancel-garment-key"], "base:shirt");
  assert.equal(mixedCard?.props["data-fabric-remove-chooser"], undefined);
  await act(async () => mixedCard!.props.onClick());
  await act(async () => mixedStep4Renderer.update(renderMixedStep4()));
  assert.equal(
    mixedStep4UiState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
    ),
    false,
  );
  assert.ok(
    mixedStep4UiState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
    ),
    "Step 2 card X must not silently remove a Step 4 additional assignment.",
  );

  const additionalOccurrences = (
    state: typeof additionalCancelState,
  ) => [
    ...state.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
    ...(state.pendingFabricGarment ? [state.pendingFabricGarment] : []),
  ];
  const appendInlineAdditionalShirt = (
    state: typeof additionalCancelState,
    fabricCode?: string,
  ) => {
    const selection = createCatalogueAdditionalGarmentSelection({
      garmentType: "shirt",
      existingAssignments: additionalOccurrences(state),
    });
    assert.equal(selection.status, "resolved");
    if (selection.status !== "resolved") {
      throw new Error("Expected additional shirt.");
    }
    let next = FabricAllocationStateEngine.attemptAppendGarment(
      state,
      selection.selection,
    );
    if (fabricCode && next.pendingFabricGarment) {
      next = FabricAllocationStateEngine.assignPendingGarmentToFabric(
        next,
        fabricCode,
      );
    }
    return next;
  };
  let blockedAdditionalCancelState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  blockedAdditionalCancelState = assignRemainingSameFabric(
    blockedAdditionalCancelState,
    shirtTrouserSelection,
    "INLINE-A",
  );
  blockedAdditionalCancelState = appendInlineAdditionalShirt(
    blockedAdditionalCancelState,
    "INLINE-B",
  );
  blockedAdditionalCancelState = appendInlineAdditionalShirt(
    blockedAdditionalCancelState,
    "INLINE-B",
  );
  blockedAdditionalCancelState = appendInlineAdditionalShirt(
    blockedAdditionalCancelState,
  );
  const blockedAdditionalSnapshot = JSON.parse(
    JSON.stringify(blockedAdditionalCancelState),
  ) as typeof blockedAdditionalCancelState;
  assert.equal(
    blockedAdditionalCancelState.pendingFabricGarment?.garmentKey,
    "additional:shirt:3",
  );
  let blockedAdditionalRenderer!: ReturnType<typeof create>;
  const renderBlockedAdditionalCancel = () =>
    renderStep(
      blockedAdditionalCancelState,
      (fabric, garmentKey) => {
        blockedAdditionalCancelState = applyFutureFabricCardSelection({
          state: blockedAdditionalCancelState,
          garmentTypeSelection: shirtTrouserSelection,
          garmentKey,
          fabricCode: fabric.code,
        });
      },
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      (garmentKey) => {
        const result = cancelFutureFabricCatalogueAssignment({
          state: blockedAdditionalCancelState,
          garmentKey,
        });
        if (result.status === "cancelled") {
          blockedAdditionalCancelState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    blockedAdditionalRenderer = create(renderBlockedAdditionalCancel());
  });
  const shirt1FabricCard = findFabricCard(
    blockedAdditionalRenderer.root,
    "INLINE-B",
  );
  assert.equal(shirt1FabricCard?.props["data-fabric-action"], "cancel");
  assert.equal(
    shirt1FabricCard?.props["data-fabric-remove-chooser"],
    "true",
    "Two additional assignments on the same Fabric must open a removal chooser instead of silently targeting Shirt 1.",
  );
  assert.equal(
    shirt1FabricCard?.props["data-fabric-cancel-garment-key"],
    undefined,
  );
  const blockedBeforeChooser = JSON.parse(
    JSON.stringify(blockedAdditionalCancelState),
  );
  await act(async () => shirt1FabricCard!.props.onClick());
  assert.deepEqual(
    JSON.parse(JSON.stringify(blockedAdditionalCancelState)),
    blockedBeforeChooser,
    "Opening the additional-fabric chooser must not mutate assignments.",
  );
  assert.ok(findRemovalDialog(blockedAdditionalRenderer.root));
  assert.ok(
    findRemovalButton(blockedAdditionalRenderer.root, "additional:shirt:1"),
  );
  assert.ok(
    findRemovalButton(blockedAdditionalRenderer.root, "additional:shirt:2"),
  );
  await act(async () =>
    findRemovalButton(
      blockedAdditionalRenderer.root,
      "additional:shirt:1",
    )!.props.onClick(),
  );
  const visibleBlockedError = findVisibleFabricActionError(
    blockedAdditionalRenderer.root,
  );
  assert.ok(
    visibleBlockedError,
    "Blocked cancellation must render a visible Fabric action error.",
  );
  assert.equal(visibleBlockedError?.props.role, "alert");
  assert.equal(
    String(visibleBlockedError?.props.className ?? "").includes("sr-only"),
    false,
    "The visible Fabric action error must not be screen-reader only.",
  );
  assert.match(
    textContent(visibleBlockedError),
    /Finish assigning fabric to the pending additional garment before removing fabric from another additional garment\./,
  );
  await act(async () =>
    blockedAdditionalRenderer.update(renderBlockedAdditionalCancel()),
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(blockedAdditionalCancelState)),
    blockedAdditionalSnapshot,
    "Blocked additional cancellation must leave the original allocation state unchanged.",
  );
  assert.ok(
    blockedAdditionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "additional:shirt:1",
      ),
    ),
    "Committed Additional Shirt 1 must remain assigned.",
  );
  assert.equal(
    blockedAdditionalCancelState.pendingFabricGarment?.garmentKey,
    "additional:shirt:3",
  );
  assert.equal(
    blockedAdditionalCancelState.awaitingFabricForPendingGarment,
    blockedAdditionalSnapshot.awaitingFabricForPendingGarment,
  );
  const trouserRemoveButton = blockedAdditionalRenderer.root
    .findByProps({ "data-garment-key": "base:trouser" })
    .findAllByType("button")
    .find((button) =>
      String(button.props["aria-label"] ?? "").includes("Remove fabric"),
    );
  assert.ok(
    trouserRemoveButton,
    "A successful unrelated fabric removal control must be available to clear the visible error.",
  );
  await act(async () => trouserRemoveButton!.props.onClick());
  await act(async () =>
    blockedAdditionalRenderer.update(renderBlockedAdditionalCancel()),
  );
  assert.equal(
    findVisibleFabricActionError(blockedAdditionalRenderer.root),
    null,
    "A successful fabric removal must clear the visible Fabric action error.",
  );
  assert.ok(
    !blockedAdditionalCancelState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:trouser",
      ),
    ),
    "Removing Trouser fabric must still succeed after the blocked additional cancellation.",
  );

  const persistedAfterCancel = {
    fabricAllocations: JSON.parse(
      JSON.stringify(preserveOtherState.fabricAllocations),
    ),
    activeAllocationId: preserveOtherState.activeAllocationId,
    pendingFabricGarment: preserveOtherState.pendingFabricGarment,
    awaitingFabricForPendingGarment:
      preserveOtherState.awaitingFabricForPendingGarment,
  };
  assert.deepEqual(
    persistedAfterCancel.fabricAllocations.map(
      (allocation: { fabricCode: string }) => allocation.fabricCode,
    ),
    ["INLINE-B"],
    "Serialized draft allocations must keep the cancelled Shirt fabric out.",
  );

  let failedAssignState = FabricAllocationStateEngine.initialize();
  let failedAssignRenderer!: ReturnType<typeof create>;
  const renderFailedAssign = () =>
    renderStep(
      failedAssignState,
      () => failedAssignState,
      threeGarmentSelection,
    );
  await act(async () => {
    failedAssignRenderer = create(renderFailedAssign(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    failedAssignRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => failedAssignRenderer.update(renderFailedAssign()));
  assert.equal(
    bulkChoiceCount(failedAssignRenderer.root),
    1,
    "Selecting a Fabric must still open the assignment popup before any allocation.",
  );

  let transactionalState = FabricAllocationStateEngine.initialize();
  transactionalState = assignFutureFabricToGarment({
    state: transactionalState,
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  let transactionalRenderer!: ReturnType<typeof create>;
  const renderTransactional = () =>
    renderStep(
      transactionalState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) => {
        const result = assignSameFabricProductToGarments({
          state: transactionalState,
          garmentTypeSelection: threeGarmentSelection,
          fabricCode,
          garmentKeys: [...garmentKeys, "missing:stale-target"],
        });
        if (result.status === "assigned") {
          transactionalState = result.state;
        }
        return result;
      },
    );
  await act(async () => {
    transactionalRenderer = create(renderTransactional(), {
      createNodeMock: createFocusMock,
    });
  });
  assert.equal(bulkChoiceCount(transactionalRenderer.root), 0);
  await act(async () => {
    transactionalRenderer.update(
      renderStep(
        transactionalState,
        (fabric, garmentKey) => {
          transactionalState = assignFutureFabricToGarment({
            state: transactionalState,
            garmentTypeSelection: threeGarmentSelection,
            garmentKey,
            fabricCode: fabric.code,
          }).state;
          return transactionalState;
        },
        threeGarmentSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        (fabricCode, garmentKeys) => {
          const result = assignSameFabricProductToGarments({
            state: transactionalState,
            garmentTypeSelection: threeGarmentSelection,
            fabricCode,
            garmentKeys: [...garmentKeys, "missing:stale-target"],
          });
          if (result.status === "assigned") {
            transactionalState = result.state;
          }
          return result;
        },
      ),
    );
  });
  // Re-open the bulk dialog from a successful first assignment on a fresh tree.
  let freshTransactional = FabricAllocationStateEngine.initialize();
  const renderFreshTransactional = () =>
    renderStep(
      freshTransactional,
      (fabric, garmentKey) => {
        freshTransactional = assignFutureFabricToGarment({
          state: freshTransactional,
          garmentTypeSelection: threeGarmentSelection,
          garmentKey,
          fabricCode: fabric.code,
        }).state;
        return freshTransactional;
      },
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      (fabricCode, garmentKeys) => {
        const result = assignSameFabricProductToGarments({
          state: freshTransactional,
          garmentTypeSelection: threeGarmentSelection,
          fabricCode,
          garmentKeys: [...garmentKeys, "missing:stale-target"],
        });
        if (result.status === "assigned") {
          freshTransactional = result.state;
        }
        return result;
      },
    );
  let freshTransactionalRenderer!: ReturnType<typeof create>;
  await act(async () => {
    freshTransactionalRenderer = create(renderFreshTransactional(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    freshTransactionalRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () =>
    freshTransactionalRenderer.update(renderFreshTransactional()),
  );
  assert.equal(bulkChoiceCount(freshTransactionalRenderer.root), 1);
  await clickBulkYes(freshTransactionalRenderer.root);
  await act(async () =>
    freshTransactionalRenderer.update(renderFreshTransactional()),
  );
  assert.equal(
    bulkChoiceCount(freshTransactionalRenderer.root),
    1,
    "A blocked bulk request must keep the dialog open for correction.",
  );
  assert.deepEqual(
    freshTransactional.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    [],
    "A stale bulk target must commit zero garments.",
  );
  assert.match(
    textContent(freshTransactionalRenderer.root),
    /That fabric could not be assigned\. No garments were changed\./,
  );
  assert.equal(
    textContent(freshTransactionalRenderer.root).includes(
      "assigned to Trouser and Skirt",
    ),
    false,
    "Announcements must not claim requested garments that were not committed.",
  );

  let announcedOnlyState = FabricAllocationStateEngine.initialize();
  announcedOnlyState = assignFutureFabricToGarment({
    state: announcedOnlyState,
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  let announcedOnlyRenderer!: ReturnType<typeof create>;
  await act(async () => {
    announcedOnlyRenderer = create(
      renderStep(
        announcedOnlyState,
        () => undefined,
        threeGarmentSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        (fabricCode, garmentKeys) => {
          void garmentKeys;
          const result = assignSameFabricProductToGarments({
            state: announcedOnlyState,
            garmentTypeSelection: threeGarmentSelection,
            fabricCode,
            garmentKeys: ["base:trouser"],
          });
          if (result.status === "assigned") {
            announcedOnlyState = result.state;
          }
          return result;
        },
      ),
      { createNodeMock: createFocusMock },
    );
  });
  await act(async () =>
    announcedOnlyRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    announcedOnlyRenderer.update(
      renderStep(
        announcedOnlyState,
        () => undefined,
        threeGarmentSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        (fabricCode, garmentKeys) => {
          void garmentKeys;
          const result = assignSameFabricProductToGarments({
            state: announcedOnlyState,
            garmentTypeSelection: threeGarmentSelection,
            fabricCode,
            garmentKeys: ["base:trouser"],
          });
          if (result.status === "assigned") {
            announcedOnlyState = result.state;
          }
          return result;
        },
      ),
    ),
  );
  await act(async () =>
    announcedOnlyRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () =>
    announcedOnlyRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () =>
    announcedOnlyRenderer.update(
      renderStep(
        announcedOnlyState,
        () => undefined,
        threeGarmentSelection,
      ),
    ),
  );
  assert.match(
    textContent(announcedOnlyRenderer.root),
    /Inline Heritage A assigned to Trouser\./,
    "The live announcement must describe only garments returned in assignedGarmentKeys.",
  );
  assert.equal(
    textContent(announcedOnlyRenderer.root).includes("assigned to Trouser and Skirt"),
    false,
  );

  let keyboardState = FabricAllocationStateEngine.initialize();
  const renderKeyboard = () =>
    renderStep(
      keyboardState,
      (fabric, garmentKey) => {
        keyboardState = assignFutureFabricToGarment({
          state: keyboardState,
          garmentTypeSelection: threeGarmentSelection,
          garmentKey,
          fabricCode: fabric.code,
        }).state;
        return keyboardState;
      },
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => keyboardState,
        (state) => {
          keyboardState = state;
        },
        threeGarmentSelection,
      ),
    );
  let keyboardRenderer!: ReturnType<typeof create>;
  bulkDialogFocusables.length = 0;
  bulkChoiceDialogFocusMock = null;
  activeFocusMock = null;
  animationFrames.clear();
  await act(async () => {
    keyboardRenderer = create(renderKeyboard(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    keyboardRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => keyboardRenderer.update(renderKeyboard()));
  assert.equal(bulkChoiceCount(keyboardRenderer.root), 1);
  assert.ok(
    bulkDialogFocusables.some((element) => element.label === "YES — Use for All"),
    `Bulk dialog focusables were ${bulkDialogFocusables.map((element) => element.label).join(", ") || "empty"}.`,
  );
  assert.equal(
    activeFocusMock?.label,
    "Close fabric assignment",
    "Initial assignment-dialog focus must land on the first interactive control.",
  );
  assert.ok(bulkChoiceDialogFocusMock);
  let prevented = false;
  await act(async () => {
    bulkChoiceDialogFocusMock?.dispatchKeyDown({
      key: "Tab",
      shiftKey: true,
      preventDefault: () => {
        prevented = true;
      },
    });
  });
  assert.equal(prevented, true);
  assert.equal(
    activeFocusMock?.label,
    "Cancel",
    "Shift+Tab from the first control must wrap to the last enabled control.",
  );
  prevented = false;
  await act(async () => {
    bulkChoiceDialogFocusMock?.dispatchKeyDown({
      key: "Tab",
      shiftKey: false,
      preventDefault: () => {
        prevented = true;
      },
    });
  });
  assert.equal(prevented, true);
  assert.equal(
    activeFocusMock?.label,
    "Close fabric assignment",
    "Tab from the last control must wrap to the first control.",
  );
  await act(async () => {
    bulkChoiceDialogFocusMock?.dispatchKeyDown({
      key: "Escape",
      preventDefault: () => undefined,
    });
  });
  await act(async () => keyboardRenderer.update(renderKeyboard()));
  assert.equal(
    bulkChoiceCount(keyboardRenderer.root),
    0,
    "Escape must dismiss the assignment popup without allocating.",
  );
  assert.deepEqual(
    keyboardState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    [],
  );

  let pendingUiState = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  pendingUiState = commitSameFabric({
    state: pendingUiState,
    garmentTypeSelection: threeGarmentSelection,
    fabricCode: "INLINE-A",
    garmentKeys: ["base:trouser"],
  });
  const pendingUiAdditional = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    existingAssignments: pendingUiState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    ),
  });
  assert.equal(pendingUiAdditional.status, "resolved");
  if (pendingUiAdditional.status !== "resolved") {
    throw new Error("Expected pending additional shirt for UI safety");
  }
  pendingUiState = FabricAllocationStateEngine.attemptAppendGarment(
    pendingUiState,
    pendingUiAdditional.selection,
  );
  assert.equal(pendingUiState.pendingFabricGarment?.garmentKey, "additional:shirt:1");
  let pendingUiRenderer!: ReturnType<typeof create>;
  const renderPendingUi = () =>
    renderStep(
      pendingUiState,
      (fabric, garmentKey) => {
        pendingUiState = applyFutureFabricCardSelection({
          state: pendingUiState,
          garmentTypeSelection: threeGarmentSelection,
          garmentKey,
          fabricCode: fabric.code,
        });
        return pendingUiState;
      },
      threeGarmentSelection,
      () => undefined,
      () => {
        pendingUiState = FabricAllocationStateEngine.beginChooseAnotherFabric(
          pendingUiState,
        );
      },
      (garmentKey) => {
        pendingUiState = removeFutureFabricAssignment({
          state: pendingUiState,
          garmentKey,
        });
      },
      undefined,
      applySameFabricResult(
        () => pendingUiState,
        (state) => {
          pendingUiState = state;
        },
        threeGarmentSelection,
      ),
    );
  await act(async () => {
    pendingUiRenderer = create(renderPendingUi(), {
      createNodeMock: createFocusMock,
    });
  });
  pendingUiRenderer.root
    .findAllByType("button")
    .filter((button) => {
      const label = textContent(button);
      return label.includes("Add Fabric") || label.includes("Change Fabric");
    })
    .forEach((button) => {
      assert.equal(
        Boolean(button.props.disabled),
        false,
        "Unrelated Add/Change Fabric actions must remain enabled while an additional garment is pending.",
      );
    });
  const addSkirt = pendingUiRenderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === "Add fabric for Standard Skirt");
  assert.ok(addSkirt);
  await act(async () => addSkirt!.props.onClick({ currentTarget: {} }));
  const skirtCard = pendingUiRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B");
  assert.ok(skirtCard);
  await act(async () => skirtCard!.props.onClick());
  await act(async () => pendingUiRenderer.update(renderPendingUi()));
  assert.equal(bulkChoiceCount(pendingUiRenderer.root), 1);
  assert.equal(
    pendingUiRenderer.root.findAllByProps({
      "data-step1-fabric-assignment-checkbox": "base:skirt",
    }).length,
    1,
  );
  await act(async () =>
    pendingUiRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:skirt" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () =>
    pendingUiRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => pendingUiRenderer.update(renderPendingUi()));
  assert.equal(
    pendingUiState.pendingFabricGarment?.garmentKey,
    "additional:shirt:1",
    "Assigning an unrelated Step 1 garment must not consume the pending additional shirt.",
  );
  assert.ok(
    pendingUiState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:skirt",
      ),
    ),
  );
  const pendingUiRemoveTrouser = pendingUiRenderer.root.findByProps({
    "aria-label": "Remove fabric from Trouser",
  });
  await act(async () => pendingUiRemoveTrouser.props.onClick());
  await act(async () => pendingUiRenderer.update(renderPendingUi()));
  assert.equal(
    pendingUiState.pendingFabricGarment?.garmentKey,
    "additional:shirt:1",
    "Removing an unrelated assigned garment must preserve the pending additional shirt.",
  );
  await act(async () => {
    findButton(pendingUiRenderer.root, "Choose Another Fabric")!.props.onClick({
      currentTarget: {},
    });
  });
  await act(async () => pendingUiRenderer.update(renderPendingUi()));
  const pendingCard = pendingUiRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B");
  assert.ok(pendingCard);
  await act(async () => pendingCard!.props.onClick());
  await act(async () => pendingUiRenderer.update(renderPendingUi()));
  assert.equal(pendingUiState.pendingFabricGarment, null);
  assert.ok(
    pendingUiState.fabricAllocations.some(
      (allocation) =>
        allocation.fabricCode === "INLINE-B" &&
        allocation.garmentAssignments.some(
          (assignment) => assignment.garmentKey === "additional:shirt:1",
        ),
    ),
    "The pending additional garment itself must still assign through assignPendingGarmentToFabric.",
  );

  const eightGarmentSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: [...STEP_1_SELECTABLE_GARMENT_TYPES],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  let eightGarmentState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: eightGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  eightGarmentState = commitSameFabric({
    state: eightGarmentState,
    garmentTypeSelection: eightGarmentSelection,
    fabricCode: "INLINE-A",
    garmentKeys: remainingGarmentKeys(eightGarmentSelection, eightGarmentState),
  });
  let eightGarmentRenderer!: ReturnType<typeof create>;
  await act(async () => {
    eightGarmentRenderer = create(
      renderStep(
        eightGarmentState,
        (fabric, garmentKey) => {
          eightGarmentState = applyFutureFabricCardSelection({
            state: eightGarmentState,
            garmentTypeSelection: eightGarmentSelection,
            garmentKey,
            fabricCode: fabric.code,
          });
        },
        eightGarmentSelection,
      ),
    );
  });
  assertFabricProgress(eightGarmentRenderer.root, 5, 5, 8, 8);

  const stockCatalogueFabrics: Fabric[] = [
    { ...fabrics[0], stock: 12 },
    { ...fabrics[1] },
    {
      ...fabrics[0],
      code: "STOCK-LOW-3",
      name: "Low Stock Counted",
      stockStatus: "LOW_STOCK",
      stock: 3,
    },
    {
      ...fabrics[0],
      code: "STOCK-LOW",
      name: "Low Stock Uncounted",
      stockStatus: "LOW_STOCK",
    },
    {
      ...fabrics[0],
      code: "STOCK-IN-ZERO",
      name: "In Stock Zero Count",
      stockStatus: "IN_STOCK",
      stock: 0,
    },
    {
      ...fabrics[0],
      code: "STOCK-LOW-ZERO",
      name: "Low Stock Zero Count",
      stockStatus: "LOW_STOCK",
      stock: 0,
    },
    {
      ...fabrics[0],
      code: "STOCK-OUT",
      name: "Out Of Stock Counted",
      stockStatus: "OUT_OF_STOCK",
      stock: 0,
    },
    {
      ...fabrics[0],
      code: "STOCK-OUT-CONTRADICTORY",
      name: "Out Of Stock Contradictory Count",
      stockStatus: "OUT_OF_STOCK",
      stock: 10,
    },
    {
      ...fabrics[0],
      code: "STOCK-HIDDEN",
      name: "Hidden Stock Fabric",
      stockStatus: "HIDDEN",
      stock: 8,
    },
  ];
  let stockCatalogueRenderer!: ReturnType<typeof create>;
  let stockCatalogueAssigned: Array<{ fabricCode: string; garmentKey: string }> =
    [];
  await act(async () => {
    stockCatalogueRenderer = create(
      renderStep(
        FabricAllocationStateEngine.initialize(),
        (fabric, garmentKey) => {
          stockCatalogueAssigned.push({
            fabricCode: fabric.code,
            garmentKey,
          });
        },
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        () => undefined,
        stockCatalogueFabrics,
      ),
    );
  });
  const inStockCountedBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "INLINE-A",
  );
  assert.equal(inStockCountedBadge?.props["data-fabric-stock-label"], "In Stock: 12");
  assert.match(textContent(inStockCountedBadge ?? null), /^In Stock: 12$/);
  assert.equal(
    String(inStockCountedBadge?.props.className ?? "").includes("sr-only"),
    false,
    "Stock badges must be visible, not screen-reader only.",
  );
  assert.match(
    String(inStockCountedBadge?.props.className ?? ""),
    /absolute top-2 right-2/,
  );
  assert.match(
    String(inStockCountedBadge?.props.className ?? ""),
    /pointer-events-none/,
  );
  assert.match(
    String(inStockCountedBadge?.props.className ?? ""),
    /max-w-\[calc\(100%-1rem\)\]/,
    "The stock badge must constrain itself so it does not overlap the fabric card on narrow layouts.",
  );
  const inStockMissingBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "INLINE-B",
  );
  assert.equal(inStockMissingBadge?.props["data-fabric-stock-label"], "In Stock");
  assert.match(textContent(inStockMissingBadge ?? null), /^In Stock$/);
  const lowStockCountedBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-LOW-3",
  );
  assert.equal(
    lowStockCountedBadge?.props["data-fabric-stock-label"],
    "Low Stock: 3",
  );
  const lowStockMissingBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-LOW",
  );
  assert.equal(lowStockMissingBadge?.props["data-fabric-stock-label"], "Low Stock");
  const inStockZeroBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-IN-ZERO",
  );
  assert.equal(inStockZeroBadge?.props["data-fabric-stock-label"], "In Stock");
  assert.match(textContent(inStockZeroBadge ?? null), /^In Stock$/);
  assert.doesNotMatch(
    textContent(inStockZeroBadge ?? null),
    /: 0$/,
    "Contradictory IN_STOCK + stock 0 must not show ': 0'.",
  );
  const inStockZeroCard = stockCatalogueRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "STOCK-IN-ZERO");
  assert.ok(
    !inStockZeroCard?.props.disabled,
    "IN_STOCK fabrics remain selectable even when stock is zero.",
  );
  const lowStockZeroBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-LOW-ZERO",
  );
  assert.equal(lowStockZeroBadge?.props["data-fabric-stock-label"], "Low Stock");
  assert.match(textContent(lowStockZeroBadge ?? null), /^Low Stock$/);
  assert.doesNotMatch(
    textContent(lowStockZeroBadge ?? null),
    /: 0$/,
    "Contradictory LOW_STOCK + stock 0 must not show ': 0'.",
  );
  const outOfStockBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-OUT",
  );
  assert.equal(outOfStockBadge?.props["data-fabric-stock-label"], "Out of Stock");
  const outOfStockContradictoryBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-OUT-CONTRADICTORY",
  );
  assert.equal(
    outOfStockContradictoryBadge?.props["data-fabric-stock-label"],
    "Out of Stock",
  );
  assert.match(
    textContent(outOfStockContradictoryBadge ?? null),
    /^Out of Stock$/,
  );
  assert.doesNotMatch(
    textContent(outOfStockContradictoryBadge ?? null),
    /: 10$/,
    "Contradictory OUT_OF_STOCK + stock 10 must not expose the quantity.",
  );
  assert.equal(
    findStockBadge(stockCatalogueRenderer.root, "STOCK-HIDDEN"),
    undefined,
    "HIDDEN fabrics must remain excluded from the catalogue.",
  );
  assert.equal(
    stockCatalogueRenderer.root.findAllByProps({
      "data-fabric-code": "STOCK-HIDDEN",
    }).length,
    0,
  );
  const outOfStockCard = stockCatalogueRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "STOCK-OUT");
  assert.equal(outOfStockCard?.props.disabled, true);
  const outOfStockContradictoryCard = stockCatalogueRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "STOCK-OUT-CONTRADICTORY");
  assert.equal(
    outOfStockContradictoryCard?.props.disabled,
    true,
    "OUT_OF_STOCK fabrics remain unavailable even when stock is positive.",
  );
  assert.deepEqual(
    stockCatalogueAssigned,
    [],
    "OUT_OF_STOCK fabrics must remain unselectable.",
  );
  const selectableInStockCard = stockCatalogueRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-A");
  assert.ok(!selectableInStockCard?.props.disabled);

} finally {
  animationFrames.clear();
  reactDomRuntime.createPortal = originalCreatePortal;
  if (previousDocument === undefined) delete runtime.document;
  else runtime.document = previousDocument;
  if (previousWindow === undefined) delete runtime.window;
  else runtime.window = previousWindow;
}

console.log("PASS: inline Fabric catalogue target and confirmation flow");
