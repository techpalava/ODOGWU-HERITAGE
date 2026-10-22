/**
 * Fabric Selection card pairing (number badge + colour) and the Change Fabric
 * highlight (gold outline, Changing tag, dimmed neighbours, heading jump).
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  FABRIC_SELECTION_BADGE_TONES,
  FABRIC_SELECTION_CHANGING_CARD_CLASS,
  FABRIC_SELECTION_CHANGING_SCROLL_MARGIN_CLASS,
  FABRIC_SELECTION_DIMMED_CARD_CLASS,
  FABRIC_SELECTION_SCROLL_MARGIN_BREATHING_PX,
  getFabricSelectionBadgeClass,
  getFabricSelectionBadgeTone,
  getFabricSelectionCardClass,
  getFirstChangingGarmentKey,
  resolveFabricSelectionCardHighlight,
  resolveFabricSelectionScrollMarginTopPx,
} from "./src/utils/fabricSelectionHighlight";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// ---------------------------------------------------------------------------
// 1. Pure mapping: colours pair by selection number; changing state is derived.
// ---------------------------------------------------------------------------
assert.equal(FABRIC_SELECTION_BADGE_TONES.length, 8);
assert.equal(getFabricSelectionBadgeTone(1).id, "gold");
assert.equal(getFabricSelectionBadgeTone(2).id, "green");
assert.equal(
  getFabricSelectionBadgeTone(1).className,
  getFabricSelectionBadgeTone(1).className,
  "the same selection number always maps to the same colour",
);
assert.notEqual(
  getFabricSelectionBadgeTone(1).id,
  getFabricSelectionBadgeTone(2).id,
  "different selection numbers get different colours",
);
assert.equal(
  getFabricSelectionBadgeTone(9).id,
  getFabricSelectionBadgeTone(1).id,
  "colours wrap after the palette",
);
assert.match(getFabricSelectionBadgeClass(1), /rounded-full/);
assert.match(getFabricSelectionBadgeClass(1), /bg-heritage-gold/);

assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: false,
    changingSelectionNumber: 1,
    cardSelectionNumber: 1,
  }),
  "idle",
  "plain assign (no Change Fabric tap) never enters the changing highlight",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: true,
    changingSelectionNumber: null,
    cardSelectionNumber: 1,
  }),
  "idle",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: true,
    changingSelectionNumber: 1,
    cardSelectionNumber: 1,
  }),
  "changing",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: true,
    changingSelectionNumber: 1,
    cardSelectionNumber: 2,
  }),
  "dimmed",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: true,
    changingSelectionNumber: 2,
    cardSelectionNumber: null,
  }),
  "dimmed",
  "unassigned cards dim while another selection is being changed",
);
assert.equal(
  resolveFabricSelectionCardHighlight({
    isChangingFabric: true,
    changingSelectionNumber: 0,
    cardSelectionNumber: 1,
  }),
  "idle",
);
assert.equal(
  resolveFabricSelectionScrollMarginTopPx(80),
  80 + FABRIC_SELECTION_SCROLL_MARGIN_BREATHING_PX,
);
assert.equal(FABRIC_SELECTION_SCROLL_MARGIN_BREATHING_PX, 16);
assert.match(FABRIC_SELECTION_CHANGING_SCROLL_MARGIN_CLASS, /scroll-mt-/);
assert.equal(
  getFabricSelectionCardClass("changing"),
  FABRIC_SELECTION_CHANGING_CARD_CLASS,
);
assert.equal(
  getFabricSelectionCardClass("dimmed"),
  FABRIC_SELECTION_DIMMED_CARD_CLASS,
);
assert.match(FABRIC_SELECTION_CHANGING_CARD_CLASS, /ring-heritage-gold/);
assert.match(FABRIC_SELECTION_DIMMED_CARD_CLASS, /opacity-60/);
assert.equal(
  getFirstChangingGarmentKey(
    ["base:shirt", "base:trouser", "base:skirt"],
    ["base:trouser", "base:shirt"],
  ),
  "base:shirt",
  "scroll target is the first highlighted card in roster order",
);
assert.equal(getFirstChangingGarmentKey(["base:skirt"], ["base:shirt"]), "base:shirt");
assert.equal(getFirstChangingGarmentKey(["base:shirt"], []), null);

// ---------------------------------------------------------------------------
// 2. Step 2 UI: badges, Change Fabric highlight, heading jump + thumbnail.
// ---------------------------------------------------------------------------
const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const threeGarments: GarmentTypeStepSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "skirt"],
  selectedDemographics: ["male", "female"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const fabrics: Fabric[] = [
  {
    code: "HL-A",
    name: "Highlight Ankara A",
    description: "Shared fabric",
    color: "Gold",
    colorHex: "#C5A85C",
    category: "Test",
    price: 20,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: "https://cdn.example.com/fabrics/highlight-a.jpg",
  },
  {
    code: "HL-B",
    name: "Highlight Ankara B",
    description: "Second fabric",
    color: "Green",
    colorHex: "#0A291B",
    category: "Test",
    price: 22,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: "https://cdn.example.com/fabrics/highlight-b.jpg",
  },
];

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

const assign = (
  state: FabricAllocationState,
  garmentKey: string,
  fabricCode: string,
) => {
  const result = assignFutureFabricToGarment({
    state,
    garmentTypeSelection: threeGarments,
    garmentKey,
    fabricCode,
    fabrics,
  });
  assert.equal(result.status, "assigned", `assign ${garmentKey} -> ${fabricCode}`);
  return result.state;
};

const renderStep = (
  state: FabricAllocationState,
  handlers: {
    onAssignFabricToGarment?: (fabric: Fabric, garmentKey: string) => FabricAllocationState | void;
    onAssignSameFabricProduct?: (
      fabricCode: string,
      garmentKeys: string[],
    ) => ReturnType<typeof assignSameFabricProductToGarments> | void;
    onChangeFabricAllocationProduct?: (
      allocationId: string,
      fabricCode: string,
      expectation?: {
        expectedCurrentFabricCode: string;
        expectedAssignmentSignature: string;
      },
    ) => unknown;
  } = {},
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: threeGarments,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: handlers.onAssignFabricToGarment || (() => undefined),
    onChangeFabricAllocationProduct: (handlers.onChangeFabricAllocationProduct ||
      (() => undefined)) as never,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct:
      handlers.onAssignSameFabricProduct || (() => undefined),
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const clickFabricCard = (root: ReactTestInstance, fabricCode: string) => {
  const card = root
    .findAllByProps({ "data-fabric-card": "true" })
    .find(
      (node) =>
        node.props["data-fabric-code"] === fabricCode &&
        typeof node.props.onClick === "function",
    );
  assert.ok(card, `fabric card ${fabricCode} should be clickable`);
  card!.props.onClick();
};

const assertNotChanging = (root: ReactTestInstance) => {
  const cards = root.findAll(
    (node) =>
      typeof node.props?.["data-garment-key"] === "string" &&
      typeof node.props?.["data-assignment-status"] === "string",
  );
  for (const card of cards) {
    assert.equal(
      card.props["data-fabric-selection-highlight"],
      "idle",
      `${card.props["data-garment-key"]} must not stay in Changing mode`,
    );
  }
  assert.equal(
    root.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
    0,
  );
  assert.equal(
    root.findAllByProps({ "data-testid": "fabric-selection-change-heading" }).length,
    0,
  );
  assert.doesNotMatch(textContent(root), /Choose a new fabric for Selection/);
};

const scrolledKeys: string[] = [];
const createNodeMock = (element: ReactElement) => {
  const props = (element.props ?? {}) as Record<string, unknown>;
  const garmentKey =
    typeof props["data-garment-key"] === "string" &&
    typeof props["data-assignment-status"] === "string"
      ? props["data-garment-key"]
      : null;
  return {
    tagName: typeof element.type === "string" ? element.type.toUpperCase() : "DIV",
    isConnected: true,
    tabIndex: typeof props.tabIndex === "number" ? props.tabIndex : 0,
    parentElement: null,
    style: {} as { scrollMarginTop?: string },
    getAttribute: (name: string) =>
      props[name] == null ? null : String(props[name]),
    hasAttribute: (name: string) => props[name] !== undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelectorAll: () => [],
    querySelector: () => null,
    focus: () => undefined,
    scrollIntoView: () => {
      if (garmentKey) scrolledKeys.push(garmentKey);
    },
  };
};

let state = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "HL-A");
state = assign(state, "base:trouser", "HL-A");
state = assign(state, "base:skirt", "HL-B");

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(renderStep(state), { createNodeMock });
});

const shirtCard = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const trouserCard = renderer.root.findByProps({
  "data-garment-key": "base:trouser",
  "data-assignment-status": "assigned",
});
const skirtCard = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});

assert.equal(shirtCard.props["data-fabric-selection-number"], "1");
assert.equal(trouserCard.props["data-fabric-selection-number"], "1");
assert.equal(skirtCard.props["data-fabric-selection-number"], "2");
assert.equal(shirtCard.props["data-fabric-selection-highlight"], "idle");
assert.equal(trouserCard.props["data-fabric-selection-highlight"], "idle");
assert.equal(skirtCard.props["data-fabric-selection-highlight"], "idle");

const shirtBadge = shirtCard.findByProps({ "data-fabric-selection-badge": "true" });
const trouserBadge = trouserCard.findByProps({ "data-fabric-selection-badge": "true" });
const skirtBadge = skirtCard.findByProps({ "data-fabric-selection-badge": "true" });
assert.equal(shirtBadge.props["aria-label"], "Fabric Selection 1");
assert.equal(trouserBadge.props["aria-label"], "Fabric Selection 1");
assert.equal(skirtBadge.props["aria-label"], "Fabric Selection 2");
assert.equal(textContent(shirtBadge), "1");
assert.equal(textContent(skirtBadge), "2");
assert.equal(shirtBadge.props.className, trouserBadge.props.className);
assert.notEqual(shirtBadge.props.className, skirtBadge.props.className);
assert.match(textContent(shirtCard), /Fabric Selection 1/);
assert.match(textContent(skirtCard), /Fabric Selection 2/);
assert.equal(
  shirtCard.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.doesNotMatch(String(shirtCard.props.className), /ring-heritage-gold/);
assert.doesNotMatch(String(skirtCard.props.className), /opacity-60/);

await act(async () => {
  renderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} });
});

const changingShirt = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const changingTrouser = renderer.root.findByProps({
  "data-garment-key": "base:trouser",
  "data-assignment-status": "assigned",
});
const dimmedSkirt = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});
assert.equal(changingShirt.props["data-fabric-selection-highlight"], "changing");
assert.equal(changingTrouser.props["data-fabric-selection-highlight"], "changing");
assert.equal(dimmedSkirt.props["data-fabric-selection-highlight"], "dimmed");
assert.equal(changingShirt.props["data-fabric-selection-highlight-anchor"], "true");
assert.equal(changingTrouser.props["data-fabric-selection-highlight-anchor"], undefined);
assert.match(String(changingShirt.props.className), /ring-heritage-gold/);
assert.match(String(changingTrouser.props.className), /ring-heritage-gold/);
assert.ok(
  String(changingShirt.props.className).includes(
    FABRIC_SELECTION_CHANGING_SCROLL_MARGIN_CLASS,
  ),
  "highlighted card gets scroll-margin-top so it sits below the sticky header",
);
assert.match(String(dimmedSkirt.props.className), /opacity-60/);
assert.doesNotMatch(String(changingShirt.props.className), /opacity-60/);
assert.equal(
  textContent(changingShirt.findByProps({ "data-fabric-selection-changing-tag": "true" })),
  "Changing",
);
assert.equal(
  textContent(changingTrouser.findByProps({ "data-fabric-selection-changing-tag": "true" })),
  "Changing",
);
assert.equal(
  dimmedSkirt.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.match(
  textContent(renderer.root),
  /Choose a new fabric for Selection 1/,
);
assert.match(
  textContent(renderer.root),
  /This Fabric is shared by/,
);

const headingButton = renderer.root.findByProps({
  "data-testid": "fabric-selection-change-heading",
});
assert.equal(headingButton.type, "button");
assert.match(
  String(headingButton.props["aria-label"]),
  /Jump to highlighted garment cards/,
);
assert.equal(
  headingButton.findByProps({ "data-fabric-selection-heading-thumb": "true" }).type,
  "span",
);
const headingPreview = headingButton.findByProps({
  "data-assigned-fabric-preview": "true",
});
assert.equal(headingPreview.props["data-fabric-code"], "HL-A");

scrolledKeys.length = 0;
await act(async () => headingButton.props.onClick());
assert.deepEqual(scrolledKeys, ["base:shirt"]);

const cancel = renderer.root.findAllByType("button").find((button) =>
  textContent(button).includes("Cancel"),
);
assert.ok(cancel);
await act(async () => cancel!.props.onClick());

const idleShirt = renderer.root.findByProps({
  "data-garment-key": "base:shirt",
  "data-assignment-status": "assigned",
});
const idleSkirt = renderer.root.findByProps({
  "data-garment-key": "base:skirt",
  "data-assignment-status": "assigned",
});
assert.equal(idleShirt.props["data-fabric-selection-highlight"], "idle");
assert.equal(idleSkirt.props["data-fabric-selection-highlight"], "idle");
assert.equal(
  idleShirt.findAllByProps({ "data-fabric-selection-changing-tag": "true" }).length,
  0,
);
assert.equal(
  renderer.root.findAllByProps({ "data-testid": "fabric-selection-change-heading" })
    .length,
  0,
);
assert.doesNotMatch(String(idleShirt.props.className), /ring-heritage-gold/);
assert.doesNotMatch(String(idleSkirt.props.className), /opacity-60/);
assert.equal(idleShirt.findByProps({ "data-fabric-selection-badge": "true" }).props["aria-label"], "Fabric Selection 1");

act(() => renderer.unmount());

// ---------------------------------------------------------------------------
// 3. Changing mode is only for Change Fabric, and it clears after assign.
// ---------------------------------------------------------------------------
const liveHandlers = (getState: () => FabricAllocationState, setState: (next: FabricAllocationState) => void) => ({
  onAssignFabricToGarment: (fabric: Fabric, garmentKey: string) => {
    const result = assignFutureFabricToGarment({
      state: getState(),
      garmentTypeSelection: threeGarments,
      garmentKey,
      fabricCode: fabric.code,
      fabrics,
    });
    if (result.status === "assigned") setState(result.state);
    return result.status === "assigned" ? result.state : undefined;
  },
  onAssignSameFabricProduct: (fabricCode: string, garmentKeys: string[]) => {
    const result = assignSameFabricProductToGarments({
      state: getState(),
      garmentTypeSelection: threeGarments,
      fabricCode,
      garmentKeys,
      fabrics,
    });
    if (result.status === "assigned") setState(result.state);
    return result;
  },
  onChangeFabricAllocationProduct: (
    allocationId: string,
    fabricCode: string,
    expectation?: {
      expectedCurrentFabricCode: string;
      expectedAssignmentSignature: string;
    },
  ) => {
    const result = changeFutureFabricAllocationProduct({
      state: getState(),
      allocationId,
      nextFabricCode: fabricCode,
      fabrics,
      expectation,
    });
    if (result.status === "assigned") setState(result.state);
    return result;
  },
});

{
  let liveState = FabricAllocationStateEngine.initialize();
  let liveRenderer!: ReturnType<typeof create>;
  const setLiveState = (next: FabricAllocationState) => {
    liveState = next;
  };
  await act(async () => {
    liveRenderer = create(
      renderStep(liveState, liveHandlers(() => liveState, setLiveState)),
      { createNodeMock },
    );
  });
  await act(async () => {
    liveRenderer.root
      .findByProps({ "aria-label": "Add fabric for Standard Shirt" })
      .props.onClick({ currentTarget: {} });
  });
  await act(async () => clickFabricCard(liveRenderer.root, "HL-A"));
  const shirtCheckbox = liveRenderer.root.findByProps({
    "data-step1-fabric-assignment-checkbox": "base:shirt",
  });
  await act(async () =>
    shirtCheckbox.props.onChange({
      target: { checked: true },
      currentTarget: { checked: true },
    }),
  );
  await act(async () => {
    liveRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick();
  });
  await act(async () => {
    liveRenderer.update(
      renderStep(liveState, liveHandlers(() => liveState, setLiveState)),
    );
  });
  assert.equal(
    liveRenderer.root.findByProps({
      "data-garment-key": "base:shirt",
      "data-assignment-status": "assigned",
    }).props["data-assignment-status"],
    "assigned",
  );
  assertNotChanging(liveRenderer.root);
  act(() => liveRenderer.unmount());
}

{
  let liveState = assign(FabricAllocationStateEngine.initialize(), "base:shirt", "HL-A");
  liveState = assign(liveState, "base:trouser", "HL-A");
  liveState = assign(liveState, "base:skirt", "HL-B");
  let liveRenderer!: ReturnType<typeof create>;
  const setLiveState = (next: FabricAllocationState) => {
    liveState = next;
  };
  await act(async () => {
    liveRenderer = create(
      renderStep(liveState, liveHandlers(() => liveState, setLiveState)),
      { createNodeMock },
    );
  });
  await act(async () => {
    liveRenderer.root
      .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
      .props.onClick({ currentTarget: {} });
  });
  assert.match(
    textContent(liveRenderer.root),
    /Choose a new fabric for Selection 1/,
  );
  await act(async () => clickFabricCard(liveRenderer.root, "HL-B"));
  await act(async () => {
    liveRenderer.root
      .findByProps({ "data-change-fabric-confirm": "true" })
      .props.onClick();
  });
  await act(async () => {
    liveRenderer.update(
      renderStep(liveState, liveHandlers(() => liveState, setLiveState)),
    );
  });
  assertNotChanging(liveRenderer.root);
  act(() => liveRenderer.unmount());
}

console.log("test_fabric_selection_highlight: PASS");
