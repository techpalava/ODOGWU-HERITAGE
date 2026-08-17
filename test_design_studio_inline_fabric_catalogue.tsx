import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { ReactElement } from "react";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  assignFutureFabricToGarment,
  applyFutureFabricCardSelection,
  getFutureFabricAssignmentTargets,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  selectFutureFabric,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

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

const renderStep = (
  state = FabricAllocationStateEngine.initialize(),
  onAssign: (fabric: Fabric, garmentKey: string) => void = () => undefined,
  selection: GarmentTypeStepSelection = garmentTypeSelection,
  onUseSameFabricForGarment: (garmentKey: string) => void = () => undefined,
  onChooseAnotherFabric: () => void = () => undefined,
  constructionPrice?: number,
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
      constructionPrice={constructionPrice ?? resolveConstructionTotal(selection)}
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
assert.equal(
  findButton(renderer.root, "Select Fabric"),
  undefined,
  "Step 2 must not render a bottom Select Fabric confirmation button.",
);
assert.match(
  textContent(renderer.root),
  /Select a fabric card to assign it to the next garment: Standard Shirt\./,
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
  /Select a fabric card to assign it to Standard Shirt\./,
);

const firstCard = renderer.root.findAllByProps({ "data-fabric-card": "true" })[0];
await act(async () => firstCard.props.onClick());
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-A", garmentKey: "base:shirt" },
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
};
await act(async () => {
  shirtTrouserRenderer = create(
    renderStep(
      shirtTrouserState,
      applyShirtTrouserFabric,
      shirtTrouserSelection,
    ),
  );
});
assert.equal(
  shirtTrouserRenderer.root.findAllByProps({
    "data-assignment-status": "unassigned",
  }).length,
  2,
);
assert.match(textContent(shirtTrouserRenderer.root), /Fabrics selected: 0 \/ 1/);
assert.equal(
  findButton(shirtTrouserRenderer.root, "Continue to Design Style")?.props.disabled,
  true,
);
const shirtCard = shirtTrouserRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-A");
assert.ok(shirtCard);
await act(async () => shirtCard.props.onClick());
await act(async () =>
  shirtTrouserRenderer.update(
    renderStep(
      shirtTrouserState,
      applyShirtTrouserFabric,
      shirtTrouserSelection,
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
  "One direct card click must fill the compatible Shirt and Trouser allocation through the orchestration seam.",
);
assert.equal(
  shirtTrouserRenderer.root.findAllByProps({
    "data-assignment-status": "unassigned",
  }).length,
  0,
);
assert.match(textContent(shirtTrouserRenderer.root), /Fabrics selected: 1 \/ 1/);
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Garment Construction Subtotal€140\.00/,
  "The rendered shared allocation must retain the authoritative Shirt plus Trouser construction total.",
);
assert.equal(
  findButton(shirtTrouserRenderer.root, "Continue to Design Style")?.props.disabled,
  false,
);
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Inline Heritage A assigned to Standard Shirt and Trouser\./,
  "The live announcement must describe every garment changed by one direct assignment.",
);
assert.equal(
  shirtTrouserRenderer.root.findByProps({
    "data-fabric-code": "INLINE-A",
  }).props["data-fabric-status"],
  "IN USE",
);
assert.equal(
  shirtTrouserRenderer.root.findByProps({
    "data-fabric-code": "INLINE-B",
  }).props["data-fabric-status"],
  "SELECT",
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
  );
await act(async () => {
  mixedRenderer = create(renderMixed());
});
const mixedFirstCard = mixedRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-A");
assert.ok(mixedFirstCard);
await act(async () => mixedFirstCard.props.onClick());
await act(async () => mixedRenderer.update(renderMixed()));
assert.deepEqual(
  mixedState.fabricAllocations.map((allocation) => ({
    fabricCode: allocation.fabricCode,
    garmentKeys: allocation.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
  })),
  [{ fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] }],
);
assert.equal(
  mixedState.pendingFabricGarment?.garmentKey,
  "base:kaftan",
  "The dedicated Kaftan must remain pending after the shared allocation fills.",
);
assert.match(textContent(mixedRenderer.root), /Fabrics selected: 1 \/ 2/);
assert.match(textContent(mixedRenderer.root), /Inline Heritage A assigned to Standard Shirt and Trouser\./);
await act(async () =>
  findButton(mixedRenderer.root, "Choose Another Fabric")!.props.onClick({
    currentTarget: {},
  }),
);
await act(async () => mixedRenderer.update(renderMixed()));
const mixedSecondCard = mixedRenderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card.props["data-fabric-code"] === "INLINE-B");
assert.ok(mixedSecondCard);
await act(async () => mixedSecondCard.props.onClick());
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
    { fabricCode: "INLINE-B", garmentKeys: ["base:kaftan"] },
  ],
  "A second direct card click must allocate only the pending Kaftan in a new allocation.",
);
assert.equal(mixedState.pendingFabricGarment, null);
assert.match(textContent(mixedRenderer.root), /Fabrics selected: 2 \/ 2/);
assert.match(
  textContent(mixedRenderer.root),
  /Inline Heritage B assigned to Long Shirt \(Kaftan\)\./,
);
assert.equal(
  findButton(mixedRenderer.root, "Continue to Design Style")?.props.disabled,
  false,
);
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
assert.match(
  textContent(renderer.root),
  /INLINE-A|Inline Heritage A|Assignment status updated/,
  "A direct card selection must announce the completed assignment.",
);
assert.equal(
  findButton(renderer.root, "Select Fabric"),
  undefined,
  "Direct assignment must not reveal a replacement confirmation button.",
);

const secondCard = renderer.root
  .findAllByProps({ "data-fabric-card": "true" })
  .find((card) => card !== firstCard);
assert.ok(secondCard);
await act(async () => secondCard.props.onClick());
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-A", garmentKey: "base:shirt" },
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
    .props.onClick(),
);
assert.equal(
  renderer.root.findByProps({
    "data-testid": "future-fabric-inline-catalogue",
  }).props["data-catalogue-dialog-open"],
  false,
  "An un-targeted card selection must complete inline without opening a chooser.",
);
assert.deepEqual(assigned, [
  { fabricCode: "INLINE-A", garmentKey: "base:shirt" },
]);

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
  targetedCurrentFabricCard?.findByType("button").props.disabled,
  true,
  "The exact current target fabric must be visibly assigned and protected from a redundant transaction.",
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
  findButton(capacityRenderer2.root, "Select Fabric"),
  undefined,
  "The capacity flow must not reintroduce a bottom Select Fabric button.",
);
assert.equal(
  capacityRenderer2.root.findAllByProps({ "aria-pressed": true }).length,
  0,
  "Fabric cards are assigned directly and never remain temporarily selected.",
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

  let capacityFocusRenderer!: ReturnType<typeof create>;
  await act(async () => {
    capacityFocusRenderer = create(
      renderStep(sharedState, () => undefined, threeGarmentSelection),
      { createNodeMock: createFocusMock },
    );
  });
  const differentFabric = findButton(
    capacityFocusRenderer.root,
    "Select Different Fabric",
  );
  assert.ok(differentFabric);
  const detachedCapacityTrigger = {
    ...focusMocks.get("Select Different Fabric"),
    isConnected: true,
  } as FocusMock;
  await act(async () =>
    differentFabric.props.onClick({ currentTarget: detachedCapacityTrigger }),
  );
  detachedCapacityTrigger.isConnected = false;
  await act(async () =>
    findButton(capacityFocusRenderer.root, "Cancel")!.props.onClick(),
  );
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "Add fabric for Trouser",
    "Capacity cancellation must skip the detached offer trigger and restore focus to the target garment action.",
  );
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
      ),
    );
  });
  await act(async () =>
    directRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  assert.deepEqual(
    directCalls,
    ["base:shirt"],
    "A card Select click must call the authoritative assignment handler directly.",
  );
  assert.equal(
    directRenderer.root.findAllByProps({ role: "dialog" }).length,
    0,
    "Direct assignment must not open a second confirmation dialog.",
  );
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
      ),
    );
  });
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "Change fabric for Standard Shirt",
    "Direct assignment must focus the updated garment action.",
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
    capacityAssignmentRenderer.root.findAllByProps({ role: "status" }).length,
    1,
    "Successful assignment must preserve the existing capacity offer.",
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
  assert.match(textContent(shirtTrouserRenderer.root), /Fabrics selected: 0 \/ 1/);
  assert.equal(
    findButton(shirtTrouserRenderer.root, "Continue to Design Style")?.props.disabled,
    true,
  );
  await act(async () =>
    shirtTrouserRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick(),
  );
  await act(async () => shirtTrouserRenderer.update(renderShirtTrouser()));
  assert.deepEqual(
    shirtTrouserCalls,
    ["base:shirt"],
    "One catalogue click must invoke the UI-facing handler once for its active target.",
  );
  assert.deepEqual(
    shirtTrouserState.fabricAllocations.map((allocation) => ({
      fabricCode: allocation.fabricCode,
      garmentKeys: allocation.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
    })),
    [{ fabricCode: "INLINE-A", garmentKeys: ["base:shirt", "base:trouser"] }],
    "The direct selection must fill one authoritative allocation through the capacity engine.",
  );
  assert.match(textContent(shirtTrouserRenderer.root), /Fabrics selected: 1 \/ 1/);
  assert.equal(
    shirtTrouserRenderer.root.findAllByProps({
      "data-assignment-status": "unassigned",
    }).length,
    0,
  );
  assert.equal(
    findButton(shirtTrouserRenderer.root, "Continue to Design Style")?.props.disabled,
    false,
  );
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
  assert.deepEqual(shirtTrouserKaftanCalls, ["base:shirt"]);
  assert.deepEqual(
    shirtTrouserKaftanState.fabricAllocations[0]?.garmentAssignments.map(
      (assignment) => assignment.garmentKey,
    ),
    ["base:shirt", "base:trouser"],
  );
  assert.equal(
    shirtTrouserKaftanState.pendingFabricGarment?.garmentKey,
    "base:kaftan",
    "A dedicated-fabric garment must remain pending when the first allocation is full.",
  );
  assert.match(textContent(shirtTrouserKaftanRenderer.root), /Fabrics selected: 1 \/ 2/);
  assert.equal(
    shirtTrouserKaftanRenderer.root.findAllByProps({ role: "dialog" }).length,
    1,
  );

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
    assert.deepEqual(
      dedicatedState.fabricAllocations[0]?.garmentAssignments.map(
        (assignment) => assignment.garmentKey,
      ),
      ["base:shirt", "base:trouser"],
      `${dedicatedCase.garmentType} must not be appended to the full first allocation.`,
    );
    assert.equal(dedicatedState.pendingFabricGarment?.garmentKey, dedicatedCase.key);
    assert.equal(
      dedicatedRenderer.root.findAllByProps({ role: "dialog" }).length,
      1,
      `${dedicatedCase.garmentType} must expose the existing capacity-resolution flow.`,
    );
  }

} finally {
  animationFrames.clear();
  reactDomRuntime.createPortal = originalCreatePortal;
  if (previousDocument === undefined) delete runtime.document;
  else runtime.document = previousDocument;
  if (previousWindow === undefined) delete runtime.window;
  else runtime.window = previousWindow;
}

console.log("PASS: inline Fabric catalogue target and confirmation flow");
