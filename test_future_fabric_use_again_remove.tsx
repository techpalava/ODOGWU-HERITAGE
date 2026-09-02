import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FutureFabricCatalogueCard } from "./src/components/FutureFabricCatalogueCard";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricGarmentType } from "./src/types";
import {
  adaptUntargetedStep1CatalogueCardPresentation,
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  getFutureFabricCatalogueCancelTargets,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveStep1FabricCatalogueCardPresentation } from "./src/utils/step1FabricAssignmentPopup";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { createCatalogueAdditionalGarmentSelection, projectCatalogueStep1PhysicalOccurrences } from "./src/utils/additionalGarmentDomain";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const createSelection = (garmentTypes: FabricGarmentType[]) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const fabric: Fabric = {
  code: "ODG-010",
  name: "Heritage Ivory Lattice",
  description: "Test fabric",
  color: "Ivory",
  colorHex: "#F5F0E6",
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  category: "HiTarget Ankara",
  price: 4,
  image: "https://example.test/odg-010.jpg",
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const renderCard = (
  presentation: Parameters<typeof FutureFabricCatalogueCard>[0]["presentation"],
  handlers?: {
    onAction?: () => void;
    onRemove?: () => void;
  },
) => {
  let actionCount = 0;
  let removeCount = 0;
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric,
        presentation,
        removeTargetGarmentLabel: "Standard Shirt",
        onAction: () => {
          actionCount += 1;
          handlers?.onAction?.();
        },
        onRemove: () => {
          removeCount += 1;
          handlers?.onRemove?.();
        },
      }),
    );
  });
  return {
    renderer,
    counts: () => ({ actionCount, removeCount }),
  };
};

const findPrimary = (root: ReactTestInstance, action: string) =>
  root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((node) => node.props["data-fabric-action"] === action);

const findRemove = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-fabric-remove": "true" })[0] || null;

const shirtTrouser = createSelection(["shirt", "trouser"]);
const unusedState = FabricAllocationStateEngine.initialize();
const unusedStep1 = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: unusedState,
  availabilityMessage: null,
});
const unusedAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: unusedStep1.status,
  step1Action: unusedStep1.action,
  cancelGarmentKeys: getFutureFabricCatalogueCancelTargets({
    fabricCode: fabric.code,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: unusedState,
    currentTargetGarmentKey: null,
  }),
});
assert.equal(unusedAdapted.status, "SELECT");
assert.equal(unusedAdapted.action, "select");
assert.deepEqual(unusedAdapted.cancelGarmentKeys, []);
{
  const { renderer } = renderCard(unusedAdapted);
  assert.ok(findPrimary(renderer.root, "select"));
  assert.equal(findRemove(renderer.root), null);
  assert.match(textContent(renderer.root), /SELECT/);
  assert.doesNotMatch(textContent(renderer.root), /USE AGAIN/);
}

let oneAssigned = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: shirtTrouser,
  garmentKey: "base:shirt",
  fabricCode: fabric.code,
});
const oneStep1 = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: oneAssigned,
  availabilityMessage: null,
});
assert.equal(oneStep1.status, "USE AGAIN");
assert.equal(oneStep1.action, "use_again");
const oneCancelKeys = getFutureFabricCatalogueCancelTargets({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: oneAssigned,
  currentTargetGarmentKey: null,
});
assert.deepEqual(oneCancelKeys, ["base:shirt"]);
const oneAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: oneStep1.status,
  step1Action: oneStep1.action,
  cancelGarmentKeys: oneCancelKeys,
});
assert.equal(oneAdapted.status, "USE AGAIN");
assert.equal(oneAdapted.action, "use_again");
assert.equal(oneAdapted.cancelGarmentKey, "base:shirt");
assert.deepEqual(oneAdapted.cancelGarmentKeys, ["base:shirt"]);
{
  const { renderer, counts } = renderCard(oneAdapted);
  const primary = findPrimary(renderer.root, "use_again");
  const remove = findRemove(renderer.root);
  assert.ok(primary);
  assert.ok(remove);
  assert.match(textContent(renderer.root), /USE AGAIN/);
  assert.equal(primary?.props["data-fabric-remove"], undefined);
  assert.equal(remove?.props["data-fabric-cancel-garment-key"], "base:shirt");
  assert.match(
    remove?.props["aria-label"] || "",
    /Remove Heritage Ivory Lattice from Standard Shirt/,
  );
  act(() => {
    primary!.props.onClick({ currentTarget: {} });
  });
  assert.deepEqual(counts(), { actionCount: 1, removeCount: 0 });
  act(() => {
    remove!.props.onClick({ currentTarget: {} });
  });
  assert.deepEqual(
    counts(),
    { actionCount: 1, removeCount: 1 },
    "X must invoke onRemove once and must not fire USE AGAIN",
  );
}

const multiAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: "USE AGAIN",
  step1Action: "use_again",
  cancelGarmentKeys: ["base:shirt", "base:trouser"],
});
assert.equal(multiAdapted.action, "use_again");
assert.equal(multiAdapted.cancelGarmentKey, null);
assert.deepEqual(multiAdapted.cancelGarmentKeys, ["base:shirt", "base:trouser"]);
{
  const { renderer, counts } = renderCard(multiAdapted);
  const primary = findPrimary(renderer.root, "use_again");
  const remove = findRemove(renderer.root);
  assert.ok(primary);
  assert.ok(remove);
  assert.equal(remove?.props["data-fabric-remove-chooser"], "true");
  assert.equal(remove?.props["data-fabric-cancel-count"], "2");
  assert.match(
    remove?.props["aria-label"] || "",
    /Choose garment to remove Heritage Ivory Lattice from/,
  );
  act(() => {
    remove!.props.onClick({ currentTarget: {} });
  });
  assert.deepEqual(counts(), { actionCount: 0, removeCount: 1 });
  act(() => {
    primary!.props.onClick({ currentTarget: {} });
  });
  assert.deepEqual(counts(), { actionCount: 1, removeCount: 1 });
}

const shirtOnly = createSelection(["shirt"]);
const exhaustedState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: shirtOnly,
  garmentKey: "base:shirt",
  fabricCode: fabric.code,
});
const exhaustedStep1 = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtOnly,
  fabricAllocationState: exhaustedState,
  availabilityMessage: null,
});
assert.equal(exhaustedStep1.status, "IN USE");
const exhaustedAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: exhaustedStep1.status,
  step1Action: exhaustedStep1.action,
  cancelGarmentKeys: getFutureFabricCatalogueCancelTargets({
    fabricCode: fabric.code,
    garmentTypeSelection: shirtOnly,
    fabricAllocationState: exhaustedState,
    currentTargetGarmentKey: null,
  }),
});
assert.equal(exhaustedAdapted.status, "IN USE");
assert.equal(exhaustedAdapted.action, "cancel");
assert.deepEqual(exhaustedAdapted.cancelGarmentKeys, ["base:shirt"]);
{
  const { renderer, counts } = renderCard(exhaustedAdapted);
  assert.equal(findPrimary(renderer.root, "use_again"), undefined);
  const remove = findRemove(renderer.root);
  assert.ok(remove);
  assert.match(textContent(renderer.root), /IN USE/);
  act(() => {
    remove!.props.onClick({ currentTarget: {} });
  });
  assert.deepEqual(counts(), { actionCount: 0, removeCount: 1 });
}

let bothAssigned = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: shirtTrouser,
  garmentKey: "base:shirt",
  fabricCode: fabric.code,
});
const bothResult = assignSameFabricProductToGarments({
  state: bothAssigned,
  garmentTypeSelection: shirtTrouser,
  fabricCode: fabric.code,
  garmentKeys: ["base:trouser"],
});
assert.equal(bothResult.status, "assigned");
bothAssigned = bothResult.state;
const bothCancelKeys = getFutureFabricCatalogueCancelTargets({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: bothAssigned,
  currentTargetGarmentKey: null,
});
assert.deepEqual(bothCancelKeys, ["base:shirt", "base:trouser"]);
const bothStep1 = resolveStep1FabricCatalogueCardPresentation({
  fabricCode: fabric.code,
  garmentTypeSelection: shirtTrouser,
  fabricAllocationState: bothAssigned,
  availabilityMessage: null,
});
const bothAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: bothStep1.status,
  step1Action: bothStep1.action,
  cancelGarmentKeys: bothCancelKeys,
});
assert.ok(
  bothAdapted.action === "cancel" || bothAdapted.action === "use_again",
);
assert.deepEqual(bothAdapted.cancelGarmentKeys, ["base:shirt", "base:trouser"]);
assert.equal(bothAdapted.cancelGarmentKeys?.includes("additional:shirt:1"), false);

let mixedAdditionalState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: shirtTrouser,
  garmentKey: "base:shirt",
  fabricCode: fabric.code,
});
mixedAdditionalState = applyFutureFabricCardSelection({
  state: mixedAdditionalState,
  garmentTypeSelection: shirtTrouser,
  garmentKey: "base:trouser",
  fabricCode: "ODG-OTHER",
});
const mixedAdditionalSelection = createCatalogueAdditionalGarmentSelection({
  garmentType: "shirt",
  authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt", "trouser"]),
});
assert.equal(mixedAdditionalSelection.status, "resolved");
if (mixedAdditionalSelection.status === "resolved") {
  mixedAdditionalState = FabricAllocationStateEngine.attemptAppendGarment(
    mixedAdditionalState,
    mixedAdditionalSelection.selection,
  );
  if (mixedAdditionalState.pendingFabricGarment) {
    mixedAdditionalState = FabricAllocationStateEngine.assignPendingGarmentToFabric(
      mixedAdditionalState,
      fabric.code,
    );
  }
}
assert.deepEqual(
  getFutureFabricCatalogueCancelTargets({
    fabricCode: fabric.code,
    garmentTypeSelection: shirtTrouser,
    fabricAllocationState: mixedAdditionalState,
    currentTargetGarmentKey: null,
  }),
  ["base:shirt"],
  "Untargeted X must own Step 1 assignments and not include additional:* keys",
);

const lastRemovedAdapted = adaptUntargetedStep1CatalogueCardPresentation({
  step1Status: "SELECT",
  step1Action: "select",
  cancelGarmentKeys: [],
});
assert.equal(lastRemovedAdapted.status, "SELECT");
assert.equal(lastRemovedAdapted.action, "select");
assert.deepEqual(lastRemovedAdapted.cancelGarmentKeys, []);
{
  const { renderer } = renderCard(lastRemovedAdapted);
  assert.ok(findPrimary(renderer.root, "select"));
  assert.equal(findRemove(renderer.root), null);
}

console.log("PASS: Fabric USE AGAIN + X removal presentation and click isolation");
