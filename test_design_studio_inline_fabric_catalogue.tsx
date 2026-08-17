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
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";

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
const mockWindow = {
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  },
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
  assert.equal(
    activeFocusMock?.label,
    "catalogue-heading",
    "When the target garment is removed, cancellation must use the mounted catalogue heading fallback.",
  );

  let chooserRenderer!: ReturnType<typeof create>;
  await act(async () => {
    chooserRenderer = create(renderStep(), { createNodeMock: createFocusMock });
  });
  await act(async () =>
    chooserRenderer.root.findAllByProps({ "data-fabric-card": "true" })[0].props.onClick(),
  );
  await act(async () => findButton(chooserRenderer.root, "Select Fabric")!.props.onClick());
  assert.ok(dialogFocusMock, "Untargeted confirmation must render the catalogue dialog.");
  assert.ok(lastPortalChildren, "The catalogue dialog must provide rendered portal content.");
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
  assert.equal(
    activeFocusMock?.label,
    "catalogue-heading",
    "Untargeted chooser Close must restore an eligible persistent fallback.",
  );
  assert.notEqual(activeFocusMock, mockDocument.body);

  activeFocusMock = null;
  dialogFocusMock = null;
  await act(async () => {
    chooserRenderer = create(renderStep(), { createNodeMock: createFocusMock });
  });
  await act(async () =>
    chooserRenderer.root.findAllByProps({ "data-fabric-card": "true" })[0].props.onClick(),
  );
  await act(async () => findButton(chooserRenderer.root, "Select Fabric")!.props.onClick());
  assert.ok(dialogFocusMock, "Untargeted confirmation must render the catalogue dialog.");
  assert.ok(lastPortalChildren, "The Escape path must provide rendered portal content.");
  const escapeDialog = dialogFocusMock;
  let escapePortalRenderer!: ReturnType<typeof create>;
  await act(async () => {
    escapePortalRenderer = create(lastPortalChildren as ReactElement, {
      createNodeMock: createFocusMock,
    });
  });
  assert.ok(escapePortalRenderer);
  await act(async () =>
    escapeDialog?.dispatchKeyDown({
      key: "Escape",
      preventDefault: () => undefined,
    }),
  );
  assert.ok(
    activeFocusMock && activeFocusMock !== mockDocument.body,
    "Untargeted chooser Escape must restore an eligible persistent fallback.",
  );
  assert.notEqual(activeFocusMock, mockDocument.body);

  const confirmationCalls: string[] = [];
  await act(async () => {
    chooserRenderer = create(
      renderStep(
        FabricAllocationStateEngine.initialize(),
        (_fabric, garmentKey) => confirmationCalls.push(garmentKey),
        garmentTypeSelection,
      ),
      { createNodeMock: createFocusMock },
    );
  });
  await act(async () =>
    chooserRenderer.root.findAllByProps({ "data-fabric-card": "true" })[0].props.onClick(),
  );
  await act(async () => findButton(chooserRenderer.root, "Select Fabric")!.props.onClick());
  assert.ok(lastPortalChildren, "The assignment chooser must provide rendered portal content.");
  let assignmentPortalRenderer!: ReturnType<typeof create>;
  await act(async () => {
    assignmentPortalRenderer = create(lastPortalChildren as ReactElement, {
      createNodeMock: createFocusMock,
    });
  });
  const chooserTarget = findButton(assignmentPortalRenderer.root, "Standard Shirt");
  assert.ok(chooserTarget || dialogButtonHandlers.has("Standard Shirt"));
  await act(async () => {
    if (chooserTarget) chooserTarget.props.onClick();
    else dialogButtonHandlers.get("Standard Shirt")!();
  });
  assert.deepEqual(confirmationCalls, ["base:shirt"]);
  assert.equal(
    findButton(chooserRenderer.root, "Close fabric catalogue"),
    undefined,
    "Successful chooser confirmation must close the dialog without using cancellation controls.",
  );

} finally {
  reactDomRuntime.createPortal = originalCreatePortal;
  if (previousDocument === undefined) delete runtime.document;
  else runtime.document = previousDocument;
  if (previousWindow === undefined) delete runtime.window;
  else runtime.window = previousWindow;
}

console.log("PASS: inline Fabric catalogue target and confirmation flow");
