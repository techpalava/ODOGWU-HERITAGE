/**
 * Fabric catalogue empty, loading, and subscription-error states.
 * The HIDDEN filter and data-fabric-catalogue-card stay as they are.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  FABRIC_CATALOGUE_EMPTY_TITLE,
  FABRIC_CATALOGUE_ERROR_TITLE,
  FABRIC_CATALOGUE_LOADING_MESSAGE,
  reportFabricSubscriptionFailure,
  resolveFabricCatalogueNotice,
} from "./src/utils/fabricCatalogueNotice";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;

const { DormantFutureFabricStep } = await import(
  "./src/components/DormantFutureFabricStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

assert.equal(
  resolveFabricCatalogueNotice({ loadState: "loading", visibleCount: 0 }),
  "loading",
);
assert.equal(
  resolveFabricCatalogueNotice({ loadState: "ready", visibleCount: 0 }),
  "empty",
);
assert.equal(
  resolveFabricCatalogueNotice({ loadState: "ready", visibleCount: 2 }),
  null,
);
assert.equal(
  resolveFabricCatalogueNotice({ loadState: "error", visibleCount: 0 }),
  "error",
);
assert.equal(
  resolveFabricCatalogueNotice({ loadState: "error", visibleCount: 3 }),
  "error",
);
assert.equal(
  resolveFabricCatalogueNotice({ loadState: "loading", visibleCount: 1 }),
  null,
);

{
  const notices: unknown[] = [];
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const failure = new Error("permission-denied");
    reportFabricSubscriptionFailure(failure, (error) => {
      notices.push(error);
    });
    reportFabricSubscriptionFailure(failure);
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 2);
  assert.equal(logged[0]?.[0], "Error subscribing to fabrics:");
  assert.equal(logged[0]?.[1] instanceof Error, true);
  assert.equal(notices.length, 1);
  assert.equal(notices[0] instanceof Error, true);
}

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const shirtSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;

const visibleFabric: Fabric = {
  code: "ODG-NOTICE",
  name: "Notice Sapphire",
  description: "Visible test fabric",
  color: "Sapphire",
  colorHex: "#1B4F72",
  category: "Test",
  price: 20,
  priceMultiplier: 1,
  stockStatus: "IN_STOCK",
  image: "https://cdn.example.com/fabrics/notice-sapphire.jpg",
};

const hiddenFabric: Fabric = {
  ...visibleFabric,
  code: "ODG-HIDDEN",
  name: "Hidden Weave",
  stockStatus: "HIDDEN",
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const renderCatalogue = ({
  fabrics,
  fabricsCatalogueState = "ready" as const,
  onRetry,
}: {
  fabrics: Fabric[];
  fabricsCatalogueState?: "loading" | "ready" | "error";
  onRetry?: () => void;
}) => {
  const state: FabricAllocationState = FabricAllocationStateEngine.initialize();
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: state,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: state,
  });
  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection: shirtSelection,
    fabricAllocationState: state,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    fabricsCatalogueState,
    onRetryFabricCatalogue: onRetry,
    onAssignFabricToGarment: () => undefined,
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: () => undefined,
    onAssignGarmentToExistingAllocation: () => undefined,
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  });
};

const mount = (
  element: ReturnType<typeof renderCatalogue>,
) => {
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

const unmountRenderer = (renderer: ReturnType<typeof create>) => {
  act(() => {
    renderer.unmount();
  });
};

const catalogueSection = (renderer: ReturnType<typeof create>) =>
  renderer.root.findByProps({ "data-testid": "future-fabric-inline-catalogue" });

{
  const renderer = mount(renderCatalogue({ fabrics: [] }));
  const section = catalogueSection(renderer);
  assert.equal(section.props["data-fabric-catalogue-state"], "ready");
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-card": "true" }).length,
    0,
  );
  const notice = section.findByProps({ "data-fabric-catalogue-notice": "empty" });
  assert.ok(textContent(notice).includes(FABRIC_CATALOGUE_EMPTY_TITLE));
  assert.ok(renderer.root.findByProps({ "data-testid": "future-fabric-catalogue-jump" }));
  unmountRenderer(renderer);
}

{
  const renderer = mount(
    renderCatalogue({ fabrics: [hiddenFabric] }),
  );
  const section = catalogueSection(renderer);
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-card": "true" }).length,
    0,
    "HIDDEN fabrics stay out of the catalogue",
  );
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-notice": "empty" }).length,
    1,
  );
  unmountRenderer(renderer);
}

{
  const renderer = mount(
    renderCatalogue({ fabrics: [], fabricsCatalogueState: "loading" }),
  );
  const section = catalogueSection(renderer);
  const notice = section.findByProps({
    "data-fabric-catalogue-notice": "loading",
  });
  assert.ok(textContent(notice).includes(FABRIC_CATALOGUE_LOADING_MESSAGE));
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-notice": "empty" }).length,
    0,
  );
  unmountRenderer(renderer);
}

{
  let retries = 0;
  const renderer = mount(
    renderCatalogue({
      fabrics: [],
      fabricsCatalogueState: "error",
      onRetry: () => {
        retries += 1;
      },
    }),
  );
  const section = catalogueSection(renderer);
  const notice = section.findByProps({ "data-fabric-catalogue-notice": "error" });
  assert.equal(notice.props.role, "alert");
  assert.ok(textContent(notice).includes(FABRIC_CATALOGUE_ERROR_TITLE));
  const retry = notice.findByProps({
    "data-testid": "future-fabric-catalogue-retry",
  });
  act(() => {
    retry.props.onClick();
  });
  assert.equal(retries, 1);
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-card": "true" }).length,
    0,
  );
  unmountRenderer(renderer);
}

{
  const renderer = mount(
    renderCatalogue({
      fabrics: [visibleFabric],
      fabricsCatalogueState: "error",
      onRetry: () => undefined,
    }),
  );
  const section = catalogueSection(renderer);
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-card": "true" }).length,
    1,
  );
  assert.equal(
    section.findByProps({ "data-fabric-catalogue-card": "true" }).props[
      "data-fabric-card-code"
    ],
    visibleFabric.code,
  );
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-notice": "error" }).length,
    1,
  );
  unmountRenderer(renderer);
}

{
  const renderer = mount(renderCatalogue({ fabrics: [visibleFabric] }));
  const section = catalogueSection(renderer);
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-card": "true" }).length,
    1,
  );
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-notice": "empty" }).length,
    0,
  );
  assert.equal(
    section.findAllByProps({ "data-fabric-catalogue-notice": "error" }).length,
    0,
  );
  unmountRenderer(renderer);
}

console.log("PASS: fabric catalogue empty and error states");
