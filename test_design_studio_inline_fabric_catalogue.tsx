import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import type { ReactElement } from "react";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type {
  Fabric,
  FabricAllocationState,
  GarmentTypeStepSelection,
} from "./src/types";
import type {
  AuthoritativePhysicalOrderDiagnostic,
  PhysicalGarmentOccurrence,
} from "./src/utils/designSourceState";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { STEP_1_SELECTABLE_GARMENT_TYPES } from "./src/utils/garmentConstructionPricing";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  applyFutureFabricCardSelection,
  assignSameFabricProductToGarments,
  cancelFutureFabricCatalogueAssignment,
  changeFutureFabricAllocationProduct,
  getFutureFabricAllocationAssignmentSignature,
  formatFabricQuantityLimitReachedCopy,
  formatFabricQuantityOverAllocatedCopy,
  getFutureFabricAssignmentTargets,
  getFutureUnassignedFabricTargets,
  formatRequiredFabricQuantitySentence,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
  getHydratedOrphanFabricAssignmentRepairTargets,
  prepareHydratedFabricAllocationState,
  repairHydratedOrphanFabricAssignment,
  removeFutureFabricAssignment,
  selectFutureFabric,
  type HydratedOrphanFabricAssignmentRepairResult,
  type HydratedOrphanFabricAssignmentRepairTarget,
} from "./src/utils/designStudioFutureFabricStage";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";
import { buildAuthoritativePhysicalOccurrences } from "./src/utils/designSourceState";
import { cloneGarmentConstructionPricingResolution } from "./src/utils/additionalGarmentConstructionState";
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
const mixedScreenshotSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "full_length_gown"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const fourOrdinaryInlineSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt", "trouser", "standard_shorts", "bum_shorts"],
  selectedDemographics: ["male"],
  normalizedCustomDetailCatalog: catalog,
}).selection;
const gownOnlySelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["full_length_gown"],
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
      `^Fabrics Selected: ${fabricSelected}/${fabricRequired}$`,
    ),
  );
  assert.doesNotMatch(
    textContent(fabricLine),
    /needed/,
    "Step 2 Fabrics Selected counter must not include the word needed.",
  );
  const progressIcon = progressRegion.findAllByProps({
    "data-fabric-progress-icon": "true",
  })[0];
  assert.ok(progressIcon, "Step 2 Fabric progress must include the decorative Layers3 icon.");
  assert.equal(progressIcon.props["aria-hidden"], "true");
  assert.equal(progressRegion.props["aria-live"], "polite");
  assert.match(
    textContent(garmentLine),
    new RegExp(
      `^Garments assigned: ${garmentsAssigned}/${garmentsRequired}$`,
    ),
  );
  if (garmentsRequired > 0) {
    const planningLine = progressRegion.findByProps({
      "data-fabric-planning-sentence": "true",
    });
    assert.equal(
      textContent(planningLine),
      formatRequiredFabricQuantitySentence(fabricRequired, garmentsRequired),
    );
  }
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
  onAssignGarmentToExistingAllocation: (
    garmentKey: string,
    allocationId: string,
  ) => void = () => undefined,
  onChangeFabricAllocationProduct: (
    allocationId: string,
    fabricCode: string,
    expectation?: {
      expectedCurrentFabricCode: string;
      expectedAssignmentSignature: string;
    },
  ) => void = () => undefined,
  requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[],
  integrityRepair?: {
    diagnostics: readonly AuthoritativePhysicalOrderDiagnostic[];
    targets: readonly HydratedOrphanFabricAssignmentRepairTarget[];
    onRepair: (
      target: HydratedOrphanFabricAssignmentRepairTarget,
    ) => HydratedOrphanFabricAssignmentRepairResult;
  },
) => {
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    fabrics: catalogueFabrics,
    requiredPhysicalOccurrences,
    rawFabricIntegrityDiagnostics: integrityRepair?.diagnostics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: selection,
    fabricAllocationState: state,
    requiredPhysicalOccurrences,
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
      requiredPhysicalOccurrences={requiredPhysicalOccurrences}
      orphanRepairTargets={integrityRepair?.targets}
      onAssignFabricToGarment={onAssign}
      onRemoveFabricFromGarment={onRemoveFabricFromGarment}
      onRepairInvalidFabricAssignment={integrityRepair?.onRepair}
      onUseSameFabricForGarment={onUseSameFabricForGarment}
      onAssignSameFabricProduct={onAssignSameFabricProduct}
      onAssignGarmentToExistingAllocation={onAssignGarmentToExistingAllocation}
      onChangeFabricAllocationProduct={onChangeFabricAllocationProduct}
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

const applyExistingAllocationResult =
  (
    getState: () => ReturnType<typeof FabricAllocationStateEngine.initialize>,
    setState: (
      state: ReturnType<typeof FabricAllocationStateEngine.initialize>,
    ) => void,
    selection: GarmentTypeStepSelection,
    requiredPhysicalOccurrences?: readonly PhysicalGarmentOccurrence[],
  ) =>
  (garmentKey: string, allocationId: string) => {
    const result = assignFutureGarmentToExistingFabricAllocation({
      state: getState(),
      garmentTypeSelection: selection,
      garmentKey,
      allocationId,
      requiredPhysicalOccurrences,
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
  /Select a fabric card to assign it to Standard Shirt\./,
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
await act(async () => firstCard.props.onClick({ currentTarget: {} }));
assert.deepEqual(assigned, []);
assert.deepEqual(bulkAssigned, [
  { fabricCode: "INLINE-A", garmentKeys: ["base:shirt"] },
]);
assert.equal(
  renderer.root.findAllByProps({
    "data-testid": "step1-fabric-assignment-dialog",
  }).length,
  0,
  "Selecting a Fabric with one eligible garment must assign directly without the popup.",
);

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
assert.match(
  textContent(shirtTrouserRenderer.root),
  /Select a fabric card to choose which garments should use this Fabric\./,
);
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
const changeCalls: Array<{ allocationId: string; fabricCode: string }> = [];
let changeState = assignedState;
await act(async () => {
  renderer.update(
    renderStep(
      changeState,
      () => undefined,
      garmentTypeSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      () => undefined,
      fabrics,
      () => undefined,
      (allocationId, fabricCode) => {
        changeCalls.push({ allocationId, fabricCode });
        const result = changeFutureFabricAllocationProduct({
          state: changeState,
          allocationId,
          nextFabricCode: fabricCode,
          fabrics,
        });
        if (result.status === "assigned") {
          changeState = result.state;
        }
        return result;
      },
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
  changeCalls.length,
  1,
  "Single-garment Change Fabric must replace the allocation product directly without a group confirmation.",
);
assert.equal(changeCalls[0]?.fabricCode, "INLINE-B");
assert.equal(
  changeState.fabricAllocations[0]?.fabricCode,
  "INLINE-B",
);

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
  0,
  "An un-targeted card selection with one eligible garment must assign directly without the popup.",
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
const sharedInlineAllocationId = fullState.fabricAllocations.find((allocation) =>
  allocation.garmentAssignments.some(
    (assignment) => assignment.garmentKey === "base:shirt",
  ),
)!.allocationId;
let targetedTwoGarmentState = fullState;
const targetedTwoGarmentCalls: Array<{
  allocationId: string;
  fabricCode: string;
  expectation?: {
    expectedCurrentFabricCode: string;
    expectedAssignmentSignature: string;
  };
}> = [];
let targetedTwoGarmentRenderer!: ReturnType<typeof create>;
await act(async () => {
  targetedTwoGarmentRenderer = create(
    renderStep(
      targetedTwoGarmentState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      () => undefined,
      fabrics,
      () => undefined,
      (allocationId, fabricCode, expectation) => {
        targetedTwoGarmentCalls.push({ allocationId, fabricCode, expectation });
        const result = changeFutureFabricAllocationProduct({
          state: targetedTwoGarmentState,
          allocationId,
          nextFabricCode: fabricCode,
          fabrics,
          expectation,
        });
        if (result.status === "assigned") {
          targetedTwoGarmentState = result.state;
        }
        return result;
      },
    ),
  );
});
await act(async () =>
  targetedTwoGarmentRenderer.root
    .findByProps({ "aria-label": "Change fabric for Standard Shirt" })
    .props.onClick({ currentTarget: {} }),
);
assert.match(
  textContent(targetedTwoGarmentRenderer.root),
  /Changing Fabric for Fabric Selection/,
);
assert.match(
  textContent(targetedTwoGarmentRenderer.root),
  /shared by Standard Shirt and Trouser/i,
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
assert.equal(
  targetedTwoGarmentRenderer.root.findAllByProps({
    "data-testid": "change-fabric-allocation-dialog",
  }).length,
  1,
  "Shared-group Change Fabric must require confirmation before commit.",
);
await act(async () =>
  targetedTwoGarmentRenderer.root
    .findByProps({ "data-change-fabric-confirm": "true" })
    .props.onClick(),
);
assert.deepEqual(
  targetedTwoGarmentCalls,
  [
    {
      allocationId: sharedInlineAllocationId,
      fabricCode: "INLINE-B",
      expectation: {
        expectedCurrentFabricCode: "INLINE-A",
        expectedAssignmentSignature: getFutureFabricAllocationAssignmentSignature(
          fullState.fabricAllocations.find(
            (allocation) => allocation.allocationId === sharedInlineAllocationId,
          )!,
        ),
      },
    },
  ],
  "Shared-group Change Fabric must replace the whole physical allocation by allocationId.",
);
assert.deepEqual(
  targetedTwoGarmentState.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => ({
      garmentKey: assignment.garmentKey,
      fabricCode: allocation.fabricCode,
    })),
  ),
  [
    { garmentKey: "base:shirt", fabricCode: "INLINE-B" },
    { garmentKey: "base:trouser", fabricCode: "INLINE-B" },
  ],
  "Shared-group replacement must update every garment in the targeted allocation.",
);

let trouserSharedState = fullState;
const trouserSharedCalls: Array<{
  allocationId: string;
  fabricCode: string;
  expectation?: {
    expectedCurrentFabricCode: string;
    expectedAssignmentSignature: string;
  };
}> = [];
let trouserSharedRenderer!: ReturnType<typeof create>;
await act(async () => {
  trouserSharedRenderer = create(
    renderStep(
      trouserSharedState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      () => undefined,
      fabrics,
      () => undefined,
      (allocationId, fabricCode, expectation) => {
        trouserSharedCalls.push({ allocationId, fabricCode, expectation });
        const result = changeFutureFabricAllocationProduct({
          state: trouserSharedState,
          allocationId,
          nextFabricCode: fabricCode,
          fabrics,
          expectation,
        });
        if (result.status === "assigned") {
          trouserSharedState = result.state;
        }
        return result;
      },
    ),
  );
});
await act(async () =>
  trouserSharedRenderer.root
    .findByProps({ "aria-label": "Change fabric for Trouser" })
    .props.onClick({ currentTarget: {} }),
);
assert.match(
  textContent(trouserSharedRenderer.root),
  /shared by Standard Shirt and Trouser/i,
  "Trouser-initiated Change Fabric must resolve the same shared allocation group.",
);
await act(async () =>
  trouserSharedRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B")!
    .props.onClick(),
);
await act(async () =>
  trouserSharedRenderer.root
    .findByProps({ "data-change-fabric-confirm": "true" })
    .props.onClick(),
);
assert.deepEqual(
  trouserSharedCalls,
  [
    {
      allocationId: sharedInlineAllocationId,
      fabricCode: "INLINE-B",
      expectation: {
        expectedCurrentFabricCode: "INLINE-A",
        expectedAssignmentSignature: getFutureFabricAllocationAssignmentSignature(
          fullState.fabricAllocations.find(
            (allocation) => allocation.allocationId === sharedInlineAllocationId,
          )!,
        ),
      },
    },
  ],
  "Trouser-initiated shared-group Change Fabric must confirm against the same allocationId.",
);
assert.deepEqual(
  trouserSharedState.fabricAllocations.flatMap((allocation) =>
    allocation.garmentAssignments.map((assignment) => ({
      allocationId: allocation.allocationId,
      garmentKey: assignment.garmentKey,
      fabricCode: allocation.fabricCode,
    })),
  ),
  [
    {
      allocationId: sharedInlineAllocationId,
      garmentKey: "base:shirt",
      fabricCode: "INLINE-B",
    },
    {
      allocationId: sharedInlineAllocationId,
      garmentKey: "base:trouser",
      fabricCode: "INLINE-B",
    },
  ],
  "Trouser-initiated shared-group replacement must update every garment in the allocation.",
);
assert.equal(
  trouserSharedState.fabricAllocations.length,
  fullState.fabricAllocations.length,
  "Shared-group replacement from Trouser must not create another physical allocation.",
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
assertFabricProgress(capacityRenderer3.root, 0, 2, 0, 3);
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
assert.equal(capacityState3.fabricAllocations.length, 2);
assert.equal(
  new Set(capacityState3.fabricAllocations.map((allocation) => allocation.fabricCode))
    .size,
  1,
  "Same Fabric product may occupy two physical allocations.",
);
assert.equal(
  getFutureGarmentFabricPlanning({
    garmentTypeSelection: threeGarmentSelection,
    fabricAllocationState: capacityState3,
  }).selectedFabricQuantity,
  2,
  "Fabrics Selected counts allocations, not distinct fabric codes.",
);
assertFabricProgress(capacityRenderer3.root, 2, 2, 3, 3);
assert.equal(bulkChoiceCount(capacityRenderer3.root), 0);

let halfOneState = applyFutureFabricCardSelection({
  state: FabricAllocationStateEngine.initialize(),
  garmentTypeSelection: threeGarmentSelection,
  garmentKey: "base:shirt",
  fabricCode: "INLINE-A",
});
let halfOneRenderer!: ReturnType<typeof create>;
await act(async () => {
  halfOneRenderer = create(
    renderStep(halfOneState, () => undefined, threeGarmentSelection),
  );
});
assertFabricProgress(halfOneRenderer.root, 1, 2, 1, 3);

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
const orphanRepairDialogFocusables: FocusMock[] = [];
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
  matchMedia: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
  getComputedStyle: () => ({
    display: "block",
    visibility: "visible",
  }),
};
let lastScrolledGarmentKey: string | null = null;
let lastScrolledCatalogueAnchor = false;
let lastFocusedFabricCard = false;
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
  if (props["data-testid"] === "invalid-fabric-assignment-repair-dialog") {
    mock.querySelectorAll = () =>
      orphanRepairDialogFocusables.filter(
        (element) => !element.hasAttribute("disabled"),
      );
  }
  if (
    props["data-invalid-fabric-repair-cancel"] === "true" ||
    props["data-invalid-fabric-repair-confirm"] === "true"
  ) {
    orphanRepairDialogFocusables.push(mock);
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
  if (props["data-fabric-integrity-repair-status"] === "true") {
    mock.label = "fabric-integrity-repair-status";
  }
  const garmentKey = props["data-garment-key"];
  if (typeof garmentKey === "string") {
    mock.label = mock.label || `garment-card:${garmentKey}`;
    mock.scrollIntoView = () => {
      lastScrolledGarmentKey = garmentKey;
    };
    focusMocks.set(`garment-card:${garmentKey}`, mock);
  }
  if (props["data-catalogue-scroll-anchor"] === "true") {
    mock.scrollIntoView = () => {
      lastScrolledCatalogueAnchor = true;
    };
    focusMocks.set("catalogue-scroll-anchor", mock);
  }
  if (props["data-fabric-card"] === "true") {
    const originalFocus = mock.focus;
    mock.focus = (options?: FocusOptions) => {
      lastFocusedFabricCard = true;
      originalFocus(options);
    };
    const fabricCodeAttr = props["data-fabric-code"];
    if (typeof fabricCodeAttr === "string") {
      mock.label = `fabric-card:${fabricCodeAttr}`;
      focusMocks.set(`fabric-card:${fabricCodeAttr}`, mock);
    }
  }
  if (props["data-change-fabric-confirm"] === "true") {
    mock.label = "change-fabric-confirm";
  }
  if (props["data-change-fabric-cancel"] === "true") {
    mock.label = "change-fabric-cancel";
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
  lastScrolledCatalogueAnchor = false;
  lastFocusedFabricCard = false;
  lastScrolledGarmentKey = null;
  await act(async () =>
    addShirt.props.onClick({
      currentTarget: addShirtFocusTarget,
    }),
  );
  flushAnimationFrames();
  assert.equal(
    lastScrolledCatalogueAnchor,
    true,
    "Add Fabric must scroll the catalogue header anchor into view.",
  );
  assert.equal(
    lastFocusedFabricCard,
    false,
    "Add Fabric must not automatically focus the first Fabric card.",
  );
  assert.equal(
    lastScrolledGarmentKey,
    null,
    "Add Fabric must not scroll a garment card.",
  );
  assert.equal(
    activeFocusMock?.label,
    "catalogue-heading",
    "Add Fabric must focus the catalogue heading without moving the viewport to a card.",
  );
  assert.match(
    textContent(focusRenderer.root),
    /Choosing fabric for: Standard Shirt/,
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
  lastScrolledCatalogueAnchor = false;
  lastFocusedFabricCard = false;
  lastScrolledGarmentKey = null;
  await act(async () =>
    changeShirt.props.onClick({
      currentTarget: changeShirtFocusTarget,
    }),
  );
  flushAnimationFrames();
  assert.equal(
    lastScrolledCatalogueAnchor,
    true,
    "Change Fabric must scroll the same catalogue header anchor as Add Fabric.",
  );
  assert.equal(
    lastFocusedFabricCard,
    false,
    "Change Fabric must not automatically focus the first Fabric card.",
  );
  assert.equal(lastScrolledGarmentKey, null);
  assert.equal(activeFocusMock?.label, "catalogue-heading");
  assert.match(
    textContent(focusRenderer.root),
    /Changing Fabric for Fabric Selection 1/,
  );
  assert.match(
    textContent(focusRenderer.root),
    /Select a replacement Fabric for Fabric Selection 1\./,
  );
  await act(async () => findButton(focusRenderer.root, "Cancel")!.props.onClick());
  flushAnimationFrames();
  assert.equal(
    activeFocusMock?.label,
    "Change fabric for Standard Shirt",
    "Change Fabric cancellation must restore focus to the mounted garment action.",
  );

  let sharedFocusState = FabricAllocationStateEngine.initialize();
  const sharedFocusSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  sharedFocusState = assignFutureFabricToGarment({
    state: sharedFocusState,
    garmentTypeSelection: sharedFocusSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  sharedFocusState = assignFutureFabricToGarment({
    state: sharedFocusState,
    garmentTypeSelection: sharedFocusSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-A",
  }).state;
  const sharedFocusBefore = JSON.stringify(sharedFocusState.fabricAllocations);
  let sharedFocusRenderer!: ReturnType<typeof create>;
  await act(async () => {
    sharedFocusRenderer = create(
      renderStep(
        sharedFocusState,
        () => undefined,
        sharedFocusSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        () => undefined,
        fabrics,
        () => undefined,
        () => undefined,
      ),
      { createNodeMock: createFocusMock },
    );
  });
  const sharedChangeShirt = sharedFocusRenderer.root.findByProps({
    "aria-label": "Change fabric for Standard Shirt",
  });
  const sharedChangeShirtFocusTarget = focusMocks.get(
    "Change fabric for Standard Shirt",
  );
  await act(async () =>
    sharedChangeShirt.props.onClick({
      currentTarget: sharedChangeShirtFocusTarget,
    }),
  );
  flushAnimationFrames();
  const inlineBReplacementCard = sharedFocusRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B");
  assert.ok(
    inlineBReplacementCard,
    "INLINE-B replacement card must render during shared-group change.",
  );
  const replacementCardTrigger: FocusMock =
    focusMocks.get("fabric-card:INLINE-B") ?? {
      label: "fabric-card:INLINE-B",
      tagName: "BUTTON",
      isConnected: true,
      hidden: false,
      inert: false,
      tabIndex: 0,
      parentElement: null,
      focus: () => {
        activeFocusMock = replacementCardTrigger;
      },
      hasAttribute: () => false,
      getAttribute: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchKeyDown: () => undefined,
      scrollIntoView: () => undefined,
    };
  await act(async () =>
    inlineBReplacementCard.props.onClick({ currentTarget: replacementCardTrigger }),
  );
  flushAnimationFrames();
  assert.equal(
    sharedFocusRenderer.root.findAllByProps({
      "data-testid": "change-fabric-allocation-dialog",
    }).length,
    1,
    "Shared-group replacement must open the confirmation dialog.",
  );
  assert.equal(
    activeFocusMock?.label,
    "change-fabric-confirm",
    "Shared-group confirmation must initialize focus on the confirm action.",
  );
  await act(async () =>
    sharedFocusRenderer.root
      .findByProps({ "data-change-fabric-cancel": "true" })
      .props.onClick(),
  );
  flushAnimationFrames();
  assert.equal(
    JSON.stringify(sharedFocusState.fabricAllocations),
    sharedFocusBefore,
    "Cancel must leave allocation state unchanged.",
  );
  assert.equal(
    activeFocusMock?.label,
    "fabric-card:INLINE-B",
    "Cancel must restore focus to the replacement Fabric card that opened confirmation.",
  );

  await act(async () =>
    sharedChangeShirt.props.onClick({
      currentTarget: sharedChangeShirtFocusTarget,
    }),
  );
  flushAnimationFrames();
  await act(async () =>
    inlineBReplacementCard.props.onClick({ currentTarget: replacementCardTrigger }),
  );
  flushAnimationFrames();
  assert.ok(dialogFocusMock);
  await act(async () =>
    dialogFocusMock!.dispatchKeyDown({
      key: "Escape",
      preventDefault: () => undefined,
    }),
  );
  flushAnimationFrames();
  assert.equal(
    JSON.stringify(sharedFocusState.fabricAllocations),
    sharedFocusBefore,
    "Escape must leave allocation state unchanged.",
  );
  assert.equal(
    activeFocusMock?.label,
    "fabric-card:INLINE-B",
    "Escape must restore focus to the replacement Fabric card that opened confirmation.",
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
    "A one-candidate card Select click must not call the per-garment handler.",
  );
  assert.equal(
    directRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
    "Selecting a Fabric with one eligible garment must not open the assignment popup.",
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
    "Direct one-candidate assignment must stay on Step 2 without a popup.",
  );
  assert.equal(
    lastScrolledGarmentKey,
    "base:shirt",
    "A single assigned garment must scroll to that exact garment card.",
  );
  assert.equal(
    activeFocusMock?.label,
    "Change fabric for Standard Shirt",
    "A single assigned garment must focus Change Fabric on that card.",
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
  flushAnimationFrames();
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
  assert.equal(
    lastScrolledGarmentKey,
    "base:trouser",
    "Use for All that completes every garment must scroll to the last newly assigned card.",
  );
  assert.equal(
    activeFocusMock?.label,
    "Change fabric for Trouser",
    "Use for All that completes every garment must focus Change Fabric on the last assigned card.",
  );
  assert.equal(
    shirtTrouserRenderer.root.findByProps({
      "data-garment-key": "base:trouser",
    }).props["data-post-assignment-highlight"],
    "assigned",
  );
  assert.equal(
    shirtTrouserRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
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
    findButton(removalRenderer.root, "Assign to Fabric") ||
      removalRenderer.root.findByProps({
        "data-testid": "assign-to-fabric-base:shirt",
      }),
    "The removed garment must expose Assign to Fabric when a partial allocation can accept it.",
  );
  assert.equal(
    findButton(removalRenderer.root, "Add Fabric"),
    undefined,
    "At the Fabric limit, the removed garment must not offer Add Fabric when a partial target exists.",
  );
  assert.equal(
    findButton(removalRenderer.root, "Continue to Design Style"),
    undefined,
    "Removal must remove the forward action while Fabric is incomplete.",
  );
  assert.equal(
    activeFocusMock?.label,
    "Assign fabric for Standard Shirt",
    "Removing a fabric must return focus to the removed garment's fabric action.",
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
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  separateRemovalState = applyFutureFabricCardSelection({
    state: separateRemovalState,
    garmentTypeSelection: threeGarmentSelection,
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
      threeGarmentSelection,
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
      .find(
        (card) =>
          card.props["data-fabric-code"] === fabricCode &&
          card.props["data-fabric-remove"] !== "true",
      ) ||
    root
      .findAllByProps({ "data-fabric-card": "true" })
      .find((card) => card.props["data-fabric-code"] === fabricCode);

  const findFabricRemoveButton = (root: ReactTestInstance, fabricCode: string) =>
    root
      .findAllByProps({ "data-fabric-remove": "true" })
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
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  preserveOtherState = applyFutureFabricCardSelection({
    state: preserveOtherState,
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
  preserveOtherState = applyFutureFabricCardSelection({
    state: preserveOtherState,
    garmentTypeSelection: threeGarmentSelection,
    garmentKey: "base:skirt",
    fabricCode: "INLINE-B",
  });
  let preserveOtherRenderer!: ReturnType<typeof create>;
  const renderPreserveOther = () =>
    renderStep(
      preserveOtherState,
      () => undefined,
      threeGarmentSelection,
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
    [{ fabricCode: "INLINE-B", garmentKeys: ["base:trouser", "base:skirt"] }],
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
  assertFabricProgress(preserveOtherRenderer.root, 1, 2, 2, 3);

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
  const remainingSharedRemove = findFabricRemoveButton(
    sharedCodeRenderer.root,
    "INLINE-A",
  );
  assert.ok(
    remainingSharedRemove,
    "USE AGAIN must keep the X removal control for the remaining assignment.",
  );
  assert.equal(
    remainingSharedRemove?.props["data-fabric-cancel-garment-key"],
    "base:trouser",
  );

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
  const useAgainRemove = findFabricRemoveButton(useAgainRenderer.root, "INLINE-A");
  assert.ok(useAgainRemove, "USE AGAIN must render a distinct X removal control.");
  assert.equal(useAgainRemove?.props["data-fabric-cancel-garment-key"], "base:shirt");
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

  const {
    createCatalogueAdditionalGarmentSelection,
    projectCatalogueStep1PhysicalOccurrences,
  } = await import("./src/utils/additionalGarmentDomain");
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
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
      "shirt",
      "trouser",
    ]),
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
  const mixedAdditionalSelection = createCatalogueAdditionalGarmentSelection({
    garmentType: "shirt",
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
      "shirt",
      "trouser",
    ]),
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
  mixedStep4UiState = applyFutureFabricCardSelection({
    state: mixedStep4UiState,
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
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

  const authorizedInlineAdditionalKeys: string[] = [];
  const appendInlineAdditionalShirt = (
    state: typeof additionalCancelState,
    fabricCode?: string,
  ) => {
    const selection = createCatalogueAdditionalGarmentSelection({
      garmentType: "shirt",
      authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences([
        "shirt",
        "trouser",
      ]),
      authorizedOccurrenceKeys: authorizedInlineAdditionalKeys,
    });
    assert.equal(selection.status, "resolved");
    if (selection.status !== "resolved") {
      throw new Error("Expected additional shirt.");
    }
    const garmentKey = selection.selection.garmentSpec?.key;
    assert.ok(garmentKey);
    if (!authorizedInlineAdditionalKeys.includes(garmentKey)) {
      authorizedInlineAdditionalKeys.push(garmentKey);
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
  flushAnimationFrames();
  assert.equal(
    freshTransactionalRenderer.root.findAllByProps({
      "data-post-assignment-highlight": "assigned",
    }).length,
    0,
    "A blocked assignment must not apply a success highlight.",
  );
  assert.equal(
    freshTransactionalRenderer.root.findAllByProps({
      "data-post-assignment-highlight": "next_unassigned",
    }).length,
    0,
    "A blocked assignment must not apply a next-action highlight.",
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
  flushAnimationFrames();
  assert.match(
    textContent(announcedOnlyRenderer.root),
    /Inline Heritage A assigned to Trouser\./,
    "The live announcement must describe only garments returned in assignedGarmentKeys.",
  );
  assert.equal(
    textContent(announcedOnlyRenderer.root).includes("assigned to Trouser and Skirt"),
    false,
  );
  assert.equal(
    lastScrolledGarmentKey,
    "base:trouser",
    "A single newly assigned garment must land on that exact garmentKey even when other garments already have fabric.",
  );
  assert.equal(activeFocusMock?.label, "Change fabric for Trouser");

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
    authoritativePhysicalOccurrences: projectCatalogueStep1PhysicalOccurrences(["shirt"]),
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
  const pendingUiShirtConstruction = resolveGarmentConstructionPricing("shirt", catalog);
  assert.equal(pendingUiShirtConstruction.status, "resolved");
  if (pendingUiShirtConstruction.status !== "resolved") {
    throw new Error("Expected shirt construction for pending UI test");
  }
  const pendingUiAuthorizedOccurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: threeGarmentSelection,
    effectiveGarmentTypeSelection: threeGarmentSelection,
    additionalGarmentConstructionState: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": cloneGarmentConstructionPricingResolution(
          pendingUiShirtConstruction,
        ),
      },
    },
  });
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
          requiredPhysicalOccurrences:
            garmentKey === "additional:shirt:1"
              ? pendingUiAuthorizedOccurrences
              : undefined,
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
  assert.equal(
    bulkChoiceCount(pendingUiRenderer.root),
    1,
    "The final Step 1 garment must open the grouping dialog without mixing in the pending additional shirt.",
  );
  assert.equal(
    pendingUiRenderer.root.findAllByProps({
      "data-step1-fabric-assignment-checkbox": "additional:shirt:1",
    }).length,
    0,
    "The Step 2 grouping dialog must not expose pending additional garments.",
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
  if (pendingUiState.pendingFabricGarment?.garmentKey === "additional:shirt:1") {
    pendingUiState = applyFutureFabricCardSelection({
      state: pendingUiState,
      garmentTypeSelection: threeGarmentSelection,
      garmentKey: "additional:shirt:1",
      fabricCode: "INLINE-B",
      requiredPhysicalOccurrences: pendingUiAuthorizedOccurrences,
    });
    await act(async () => pendingUiRenderer.update(renderPendingUi()));
  }
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
  let emptyEightRenderer!: ReturnType<typeof create>;
  await act(async () => {
    emptyEightRenderer = create(
      renderStep(
        FabricAllocationStateEngine.initialize(),
        () => undefined,
        eightGarmentSelection,
      ),
    );
  });
  assertFabricProgress(emptyEightRenderer.root, 0, 5, 0, 8);

  let threeOfFiveState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: eightGarmentSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  threeOfFiveState = applyFutureFabricCardSelection({
    state: threeOfFiveState,
    garmentTypeSelection: eightGarmentSelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-A",
  });
  threeOfFiveState = applyFutureFabricCardSelection({
    state: threeOfFiveState,
    garmentTypeSelection: eightGarmentSelection,
    garmentKey: "base:skirt",
    fabricCode: "INLINE-B",
  });
  threeOfFiveState = applyFutureFabricCardSelection({
    state: threeOfFiveState,
    garmentTypeSelection: eightGarmentSelection,
    garmentKey: "base:dress",
    fabricCode: "INLINE-A",
  });
  let threeOfFiveRenderer!: ReturnType<typeof create>;
  await act(async () => {
    threeOfFiveRenderer = create(
      renderStep(threeOfFiveState, () => undefined, eightGarmentSelection),
    );
  });
  assertFabricProgress(threeOfFiveRenderer.root, 3, 5, 4, 8);

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
  assert.equal(
    inStockZeroBadge?.props["data-fabric-stock-label"],
    "Out of Stock",
  );
  assert.match(textContent(inStockZeroBadge ?? null), /^Out of Stock$/);
  const inStockZeroCard = stockCatalogueRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "STOCK-IN-ZERO");
  assert.equal(
    inStockZeroCard?.props.disabled,
    true,
    "Numeric stock 0 must block new Fabric selection even when stockStatus is IN_STOCK.",
  );
  const lowStockZeroBadge = findStockBadge(
    stockCatalogueRenderer.root,
    "STOCK-LOW-ZERO",
  );
  assert.equal(
    lowStockZeroBadge?.props["data-fabric-stock-label"],
    "Out of Stock",
  );
  assert.match(textContent(lowStockZeroBadge ?? null), /^Out of Stock$/);
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

  const shirtTrouserDressSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser", "dress"],
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const shirtTrouserSkirtDressSelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser", "skirt", "dress"],
    selectedDemographics: ["unisex"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

  lastScrolledGarmentKey = null;
  activeFocusMock = null;
  let singleJumpState = FabricAllocationStateEngine.initialize();
  let singleJumpRenderer!: ReturnType<typeof create>;
  const renderSingleJump = () =>
    renderStep(
      singleJumpState,
      () => undefined,
      shirtTrouserDressSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => singleJumpState,
        (state) => {
          singleJumpState = state;
        },
        shirtTrouserDressSelection,
      ),
    );
  await act(async () => {
    singleJumpRenderer = create(renderSingleJump(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    singleJumpRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => singleJumpRenderer.update(renderSingleJump()));
  await act(async () =>
    singleJumpRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:shirt" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  assert.equal(
    lastScrolledGarmentKey,
    null,
    "Checking a garment in the assignment dialog must not scroll the page.",
  );
  await act(async () =>
    singleJumpRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => singleJumpRenderer.update(renderSingleJump()));
  flushAnimationFrames();
  assert.deepEqual(
    singleJumpState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    ["base:shirt"],
  );
  assert.equal(
    singleJumpRenderer.root.findAllByProps({
      "data-assignment-status": "unassigned",
    }).length,
    2,
  );
  assert.equal(lastScrolledGarmentKey, "base:shirt");
  assert.equal(activeFocusMock?.label, "Change fabric for Standard Shirt");
  assert.equal(
    singleJumpRenderer.root.findByProps({
      "data-garment-key": "base:shirt",
    }).props["data-assignment-status"],
    "assigned",
  );
  assert.equal(
    singleJumpRenderer.root.findByProps({
      "data-garment-key": "base:shirt",
    }).props["data-post-assignment-highlight"],
    "assigned",
  );
  assert.match(
    textContent(singleJumpRenderer.root),
    /Inline Heritage A assigned to Standard Shirt\./,
  );
  assert.equal(
    singleJumpRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
  );

  lastScrolledGarmentKey = null;
  activeFocusMock = null;
  let remainingJumpState = FabricAllocationStateEngine.initialize();
  let remainingJumpRenderer!: ReturnType<typeof create>;
  const renderRemainingJump = () =>
    renderStep(
      remainingJumpState,
      () => undefined,
      shirtTrouserSkirtDressSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => remainingJumpState,
        (state) => {
          remainingJumpState = state;
        },
        shirtTrouserSkirtDressSelection,
      ),
    );
  await act(async () => {
    remainingJumpRenderer = create(renderRemainingJump(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    remainingJumpRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => remainingJumpRenderer.update(renderRemainingJump()));
  await act(async () =>
    remainingJumpRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:shirt" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () =>
    remainingJumpRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () =>
    remainingJumpRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => remainingJumpRenderer.update(renderRemainingJump()));
  flushAnimationFrames();
  assert.deepEqual(
    remainingJumpState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
    ["base:shirt", "base:trouser"],
  );
  assert.equal(lastScrolledGarmentKey, "base:skirt");
  assert.equal(activeFocusMock?.label, "Add fabric for Standard Skirt");
  assert.equal(
    remainingJumpRenderer.root.findByProps({
      "data-garment-key": "base:skirt",
    }).props["data-post-assignment-highlight"],
    "next_unassigned",
  );
  assert.match(
    textContent(remainingJumpRenderer.root),
    /Inline Heritage A assigned to Standard Shirt and Trouser\. Next: Standard Skirt needs fabric\./,
  );
  assert.equal(
    remainingJumpRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
    "Successful assignment must close the dialog without opening the catalogue.",
  );
  assert.equal(
    remainingJumpRenderer.root.findByProps({
      "data-catalogue-dialog-open": false,
    }).props["data-catalogue-dialog-open"],
    false,
  );

  lastScrolledGarmentKey = null;
  activeFocusMock = null;
  const cancelTrigger = {
    label: "catalogue-card-trigger",
    tagName: "BUTTON",
    isConnected: true,
    hidden: false,
    inert: false,
    tabIndex: 0,
    parentElement: null,
    focus: () => {
      activeFocusMock = cancelTrigger as unknown as FocusMock;
    },
    hasAttribute: () => false,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchKeyDown: () => undefined,
    scrollIntoView: () => undefined,
  } as FocusMock;
  let cancelJumpState = FabricAllocationStateEngine.initialize();
  let cancelJumpRenderer!: ReturnType<typeof create>;
  const renderCancelJump = () =>
    renderStep(
      cancelJumpState,
      () => undefined,
      shirtTrouserDressSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => cancelJumpState,
        (state) => {
          cancelJumpState = state;
        },
        shirtTrouserDressSelection,
      ),
    );
  await act(async () => {
    cancelJumpRenderer = create(renderCancelJump(), {
      createNodeMock: createFocusMock,
    });
  });
  mockWindow.scrollY = 180;
  await act(async () =>
    cancelJumpRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: cancelTrigger }),
  );
  await act(async () => cancelJumpRenderer.update(renderCancelJump()));
  mockWindow.scrollY = 999;
  await act(async () =>
    cancelJumpRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-cancel" })
      .props.onClick(),
  );
  flushAnimationFrames();
  assert.equal(cancelJumpState.fabricAllocations.length, 0);
  assert.equal(
    cancelJumpRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
  );
  assert.equal(activeFocusMock?.label, "catalogue-card-trigger");
  assert.equal(
    mockWindow.scrollY,
    180,
    "Cancellation must restore the pre-dialog catalogue scroll position.",
  );
  assert.equal(
    lastScrolledGarmentKey,
    null,
    "Cancellation must not smart-jump to a garment card.",
  );

  lastScrolledGarmentKey = null;
  activeFocusMock = null;
  let remainingOneState = assignFutureFabricToGarment({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: shirtTrouserSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  let remainingOneRenderer!: ReturnType<typeof create>;
  const renderRemainingOne = () =>
    renderStep(
      remainingOneState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => remainingOneState,
        (state) => {
          remainingOneState = state;
        },
        shirtTrouserSelection,
      ),
    );
  await act(async () => {
    remainingOneRenderer = create(renderRemainingOne(), {
      createNodeMock: createFocusMock,
    });
  });
  assertFabricProgress(remainingOneRenderer.root, 1, 1, 1, 2);
  assert.match(
    textContent(remainingOneRenderer.root),
    new RegExp(
      formatFabricQuantityLimitReachedCopy(1).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      ),
    ),
  );
  const remainingInlineB = remainingOneRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-B");
  assert.equal(
    remainingInlineB?.props["data-fabric-action"],
    "none",
    "A new Fabric product must not keep a SELECT path once the allocation limit is reached.",
  );
  const remainingInlineA = remainingOneRenderer.root
    .findAllByProps({ "data-fabric-card": "true" })
    .find((card) => card.props["data-fabric-code"] === "INLINE-A");
  assert.equal(remainingInlineA?.props["data-fabric-action"], "use_again");
  await act(async () =>
    remainingInlineB!.props.onClick({ currentTarget: {} }),
  );
  await act(async () => remainingOneRenderer.update(renderRemainingOne()));
  assert.deepEqual(
    remainingOneState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ).sort(),
    ["base:shirt"],
    "A blocked unused Fabric must not assign the remaining garment.",
  );
  await act(async () =>
    remainingInlineA!.props.onClick({ currentTarget: {} }),
  );
  await act(async () => remainingOneRenderer.update(renderRemainingOne()));
  flushAnimationFrames();
  assert.equal(
    remainingOneRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
    "One remaining Step 1 candidate must assign via USE AGAIN without the popup.",
  );
  assert.deepEqual(
    remainingOneState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ).sort(),
    ["base:shirt", "base:trouser"],
  );
  assert.equal(lastScrolledGarmentKey, "base:trouser");
  assert.equal(activeFocusMock?.label, "Change fabric for Trouser");

  lastScrolledGarmentKey = null;
  let blockedDirectState = FabricAllocationStateEngine.initialize();
  let blockedDirectRenderer!: ReturnType<typeof create>;
  await act(async () => {
    blockedDirectRenderer = create(
      renderStep(
        blockedDirectState,
        () => undefined,
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        () => ({
          status: "blocked" as const,
          state: blockedDirectState,
          reason: "INVALID_CAPACITY" as const,
        }),
      ),
      { createNodeMock: createFocusMock },
    );
  });
  await act(async () =>
    blockedDirectRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  assert.equal(
    blockedDirectRenderer.root.findAllByProps({
      "data-testid": "step1-fabric-assignment-dialog",
    }).length,
    0,
    "A blocked one-candidate assignment must not fall back to the popup.",
  );
  assert.ok(findVisibleFabricActionError(blockedDirectRenderer.root));
  assert.doesNotMatch(textContent(blockedDirectRenderer.root), /assigned to Standard Shirt/);
  assert.equal(lastScrolledGarmentKey, null);
  assert.equal(
    blockedDirectRenderer.root.findAllByProps({
      "data-post-assignment-highlight": "assigned",
    }).length,
    0,
  );

  const fourOrdinarySelection = reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: ["shirt", "trouser", "standard_shorts", "bum_shorts"],
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;
  const fourCatalogueFabrics: Fabric[] = [
    ...fabrics,
    {
      code: "INLINE-C",
      name: "Inline Heritage C",
      description: "Third inline test fabric.",
      color: "Ivory",
      colorHex: "#F5F0E6",
      category: "Test",
      price: 30,
      priceMultiplier: 1,
      stockStatus: "IN_STOCK",
    },
  ];
  let fourLimitState = applyFutureFabricCardSelection({
    state: FabricAllocationStateEngine.initialize(),
    garmentTypeSelection: fourOrdinarySelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  });
  fourLimitState = applyFutureFabricCardSelection({
    state: fourLimitState,
    garmentTypeSelection: fourOrdinarySelection,
    garmentKey: "base:trouser",
    fabricCode: "INLINE-B",
  });
  let fourLimitRenderer!: ReturnType<typeof create>;
  const renderFourLimit = () =>
    renderStep(
      fourLimitState,
      (fabric, garmentKey) => {
        fourLimitState = applyFutureFabricCardSelection({
          state: fourLimitState,
          garmentTypeSelection: fourOrdinarySelection,
          garmentKey,
          fabricCode: fabric.code,
        });
      },
      fourOrdinarySelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => fourLimitState,
        (state) => {
          fourLimitState = state;
        },
        fourOrdinarySelection,
      ),
      fourCatalogueFabrics,
    );
  await act(async () => {
    fourLimitRenderer = create(renderFourLimit());
  });
  assertFabricProgress(fourLimitRenderer.root, 2, 2, 2, 4);
  assert.match(
    textContent(fourLimitRenderer.root),
    new RegExp(formatFabricQuantityLimitReachedCopy(2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.equal(
    findFabricCard(fourLimitRenderer.root, "INLINE-C")?.props["data-fabric-action"],
    "none",
    "An unused Fabric product must not keep a SELECT path once the allocation limit is reached.",
  );
  assert.equal(
    findFabricCard(fourLimitRenderer.root, "INLINE-A")?.props["data-fabric-action"],
    "use_again",
  );
  await act(async () =>
    findFabricCard(fourLimitRenderer.root, "INLINE-C")!.props.onClick({
      currentTarget: {},
    }),
  );
  await act(async () => fourLimitRenderer.update(renderFourLimit()));
  assert.equal(fourLimitState.fabricAllocations.length, 2);
  assert.equal(
    fourLimitState.fabricAllocations.some(
      (allocation) => allocation.fabricCode === "INLINE-C",
    ),
    false,
  );
  fourLimitState = applyFutureFabricCardSelection({
    state: fourLimitState,
    garmentTypeSelection: fourOrdinarySelection,
    garmentKey: "base:standard_shorts",
    fabricCode: "INLINE-A",
  });
  fourLimitState = applyFutureFabricCardSelection({
    state: fourLimitState,
    garmentTypeSelection: fourOrdinarySelection,
    garmentKey: "base:bum_shorts",
    fabricCode: "INLINE-B",
  });
  await act(async () => fourLimitRenderer.update(renderFourLimit()));
  assertFabricProgress(fourLimitRenderer.root, 2, 2, 4, 4);
  assert.match(
    textContent(fourLimitRenderer.root),
    /You need 2 fabrics for your 4 garments\./,
  );

  const fourTargets = getFutureFabricAssignmentTargets(fourOrdinarySelection);
  const legacyOverAllocatedState = {
    fabricAllocations: fourTargets.map((target, index) => ({
      allocationId: `legacy-${index + 1}`,
      fabricCode: ["INLINE-A", "INLINE-B", "INLINE-C", "INLINE-A"][index]!,
      garmentAssignments: [target.assignment],
    })),
    activeAllocationId: "legacy-4",
    pendingFabricGarment: null,
    awaitingFabricForPendingGarment: false,
  };
  let legacyRenderer!: ReturnType<typeof create>;
  await act(async () => {
    legacyRenderer = create(
      renderStep(
        legacyOverAllocatedState,
        () => undefined,
        fourOrdinarySelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        undefined,
        fourCatalogueFabrics,
      ),
    );
  });
  assertFabricProgress(legacyRenderer.root, 4, 2, 4, 4);
  assert.match(
    textContent(legacyRenderer.root),
    new RegExp(
      formatFabricQuantityOverAllocatedCopy(4, 2).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      ),
    ),
  );
  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: fourOrdinarySelection,
      fabricAllocationState: legacyOverAllocatedState,
      fabrics: fourCatalogueFabrics,
    }).isComplete,
    false,
  );

  const buildScreenshotPartialState = () => {
    let state = FabricAllocationStateEngine.initialize();
    state = assignFutureFabricToGarment({
      state,
      garmentTypeSelection: mixedScreenshotSelection,
      garmentKey: "base:full_length_gown",
      fabricCode: "INLINE-A",
    }).state;
    state = assignFutureFabricToGarment({
      state,
      garmentTypeSelection: mixedScreenshotSelection,
      garmentKey: "base:shirt",
      fabricCode: "INLINE-B",
    }).state;
    return state;
  };

  let screenshotPartialState = buildScreenshotPartialState();
  let screenshotPartialRenderer!: ReturnType<typeof create>;
  const renderScreenshotPartial = () =>
    renderStep(
      screenshotPartialState,
      () => undefined,
      mixedScreenshotSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => screenshotPartialState,
        (state) => {
          screenshotPartialState = state;
        },
        mixedScreenshotSelection,
      ),
      undefined,
      applyExistingAllocationResult(
        () => screenshotPartialState,
        (state) => {
          screenshotPartialState = state;
        },
        mixedScreenshotSelection,
      ),
    );
  await act(async () => {
    screenshotPartialRenderer = create(renderScreenshotPartial(), {
      createNodeMock: createFocusMock,
    });
  });
  assert.match(
    textContent(screenshotPartialRenderer.root),
    /One Fabric makes two standard garments\./,
  );
  assertFabricProgress(screenshotPartialRenderer.root, 2, 2, 2, 3);
  assert.equal(
    findButton(screenshotPartialRenderer.root, "Add Fabric"),
    undefined,
    "At the Fabric limit, unassigned garments with partial targets must not show Add Fabric.",
  );
  const assignTrouserButton = screenshotPartialRenderer.root.findByProps({
    "data-testid": "assign-to-fabric-base:trouser",
  });
  assert.ok(assignTrouserButton, "Trouser must expose Assign to Fabric.");
  const shirtAllocationId = screenshotPartialState.fabricAllocations.find(
    (allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === "base:shirt",
      ),
  )!.allocationId;
  await act(async () => assignTrouserButton.props.onClick());
  await act(async () => screenshotPartialRenderer.update(renderScreenshotPartial()));
  assert.equal(
    screenshotPartialRenderer.root.findAllByProps({
      "data-testid": "partial-fabric-capacity-assignment-dialog",
    }).length,
    1,
  );
  await act(async () =>
    screenshotPartialRenderer.root
      .findByProps({ "data-testid": "partial-fabric-capacity-confirm" })
      .props.onClick(),
  );
  await act(async () => screenshotPartialRenderer.update(renderScreenshotPartial()));
  assert.equal(
    screenshotPartialState.fabricAllocations.find(
      (allocation) => allocation.allocationId === shirtAllocationId,
    )?.garmentAssignments.length,
    2,
  );
  assertFabricProgress(screenshotPartialRenderer.root, 2, 2, 3, 3);

  let shirtTrouserGroupState = FabricAllocationStateEngine.initialize();
  let shirtTrouserGroupRenderer!: ReturnType<typeof create>;
  const renderShirtTrouserGroup = () =>
    renderStep(
      shirtTrouserGroupState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => shirtTrouserGroupState,
        (state) => {
          shirtTrouserGroupState = state;
        },
        shirtTrouserSelection,
      ),
    );
  await act(async () => {
    shirtTrouserGroupRenderer = create(renderShirtTrouserGroup(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    shirtTrouserGroupRenderer.root
      .findByProps({ "data-garment-key": "base:shirt" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    shirtTrouserGroupRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => shirtTrouserGroupRenderer.update(renderShirtTrouserGroup()));
  const groupConfirm = shirtTrouserGroupRenderer.root.findByProps({
    "data-testid": "step1-fabric-assignment-confirm",
  });
  assert.equal(groupConfirm.props.disabled, true);
  assert.match(
    textContent(
      shirtTrouserGroupRenderer.root.findByProps({
        "data-testid": "step1-fabric-assignment-capacity-progress",
      }),
    ),
    /Fabric Capacity: 1\/2/,
  );
  await act(async () =>
    shirtTrouserGroupRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () => shirtTrouserGroupRenderer.update(renderShirtTrouserGroup()));
  const enabledGroupConfirm = shirtTrouserGroupRenderer.root.findByProps({
    "data-testid": "step1-fabric-assignment-confirm",
  });
  assert.equal(enabledGroupConfirm.props.disabled, false);
  await act(async () => enabledGroupConfirm.props.onClick());
  await act(async () => shirtTrouserGroupRenderer.update(renderShirtTrouserGroup()));
  assert.equal(shirtTrouserGroupState.fabricAllocations.length, 1);
  assert.equal(
    shirtTrouserGroupState.fabricAllocations[0]!.garmentAssignments.length,
    2,
  );
  assertFabricProgress(shirtTrouserGroupRenderer.root, 1, 1, 2, 2);

  let cancelGroupState = FabricAllocationStateEngine.initialize();
  let cancelGroupRenderer!: ReturnType<typeof create>;
  const renderCancelGroup = () =>
    renderStep(
      cancelGroupState,
      () => undefined,
      shirtTrouserSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => cancelGroupState,
        (state) => {
          cancelGroupState = state;
        },
        shirtTrouserSelection,
      ),
    );
  await act(async () => {
    cancelGroupRenderer = create(renderCancelGroup(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    cancelGroupRenderer.root
      .findByProps({ "data-garment-key": "base:shirt" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    cancelGroupRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => cancelGroupRenderer.update(renderCancelGroup()));
  await act(async () =>
    cancelGroupRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-cancel" })
      .props.onClick(),
  );
  await act(async () => cancelGroupRenderer.update(renderCancelGroup()));
  assert.equal(cancelGroupState.fabricAllocations.length, 0);
  assert.equal(
    cancelGroupRenderer.root.findAllByProps({
      "data-assignment-status": "assigned",
    }).length,
    0,
  );

  let oddResidualState = FabricAllocationStateEngine.initialize();
  oddResidualState = commitSameFabric({
    state: oddResidualState,
    garmentTypeSelection: threeGarmentSelection,
    fabricCode: "INLINE-A",
    garmentKeys: ["base:shirt", "base:trouser"],
  });
  let oddResidualRenderer!: ReturnType<typeof create>;
  const renderOddResidual = () =>
    renderStep(
      oddResidualState,
      () => undefined,
      threeGarmentSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => oddResidualState,
        (state) => {
          oddResidualState = state;
        },
        threeGarmentSelection,
      ),
    );
  await act(async () => {
    oddResidualRenderer = create(renderOddResidual(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    oddResidualRenderer.root
      .findByProps({ "data-garment-key": "base:skirt" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    oddResidualRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })
      .find((card) => card.props["data-fabric-code"] === "INLINE-B")!
      .props.onClick({ currentTarget: {} }),
  );
  assert.equal(
    bulkChoiceCount(oddResidualRenderer.root),
    1,
    "Final residual skirt assignment must open the grouping dialog.",
  );
  assert.equal(
    oddResidualRenderer.root.findByProps({
      "data-testid": "step1-fabric-assignment-confirm",
    }).props.disabled,
    false,
  );
  await act(async () =>
    oddResidualRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => oddResidualRenderer.update(renderOddResidual()));
  assertFabricProgress(oddResidualRenderer.root, 2, 2, 3, 3);
  assert.equal(
    oddResidualRenderer.root.findAllByProps({
      "data-avoidable-partial-guidance": "true",
    }).length,
    0,
  );

  let gownOnlyState = FabricAllocationStateEngine.initialize();
  let gownOnlyRenderer!: ReturnType<typeof create>;
  const renderGownOnly = () =>
    renderStep(
      gownOnlyState,
      () => undefined,
      gownOnlySelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => gownOnlyState,
        (state) => {
          gownOnlyState = state;
        },
        gownOnlySelection,
      ),
    );
  await act(async () => {
    gownOnlyRenderer = create(renderGownOnly(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    gownOnlyRenderer.root
      .findByProps({ "data-garment-key": "base:full_length_gown" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    gownOnlyRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => gownOnlyRenderer.update(renderGownOnly()));
  assert.match(
    textContent(
      gownOnlyRenderer.root.findByProps({
        "data-testid": "step1-fabric-assignment-capacity-progress",
      }),
    ),
    /Fabric Capacity: 2\/2/,
  );
  assert.equal(
    gownOnlyRenderer.root.findByProps({
      "data-testid": "step1-fabric-assignment-confirm",
    }).props.disabled,
    false,
  );
  await act(async () =>
    gownOnlyRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => gownOnlyRenderer.update(renderGownOnly()));
  assertFabricProgress(gownOnlyRenderer.root, 1, 1, 1, 1);

  let sameProductState = FabricAllocationStateEngine.initialize();
  let sameProductRenderer!: ReturnType<typeof create>;
  const renderSameProduct = () =>
    renderStep(
      sameProductState,
      () => undefined,
      fourOrdinaryInlineSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => sameProductState,
        (state) => {
          sameProductState = state;
        },
        fourOrdinaryInlineSelection,
      ),
    );
  await act(async () => {
    sameProductRenderer = create(renderSameProduct(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    sameProductRenderer.root
      .findByProps({ "data-garment-key": "base:shirt" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    sameProductRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  await act(async () =>
    sameProductRenderer.root
      .findByProps({ "data-step1-fabric-assignment-checkbox": "base:trouser" })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  await act(async () =>
    sameProductRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  await act(async () =>
    sameProductRenderer.root
      .findByProps({ "data-garment-key": "base:standard_shorts" })
      .findAllByType("button")[0]
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () =>
    sameProductRenderer.root
      .findAllByProps({ "data-fabric-card": "true" })
      .find((card) => card.props["data-fabric-code"] === "INLINE-A")!
      .props.onClick({ currentTarget: {} }),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  await act(async () =>
    sameProductRenderer.root
      .findByProps({
        "data-step1-fabric-assignment-checkbox": "base:bum_shorts",
      })
      .props.onChange({ currentTarget: { checked: true } }),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  await act(async () =>
    sameProductRenderer.root
      .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
      .props.onClick(),
  );
  await act(async () => sameProductRenderer.update(renderSameProduct()));
  assert.equal(sameProductState.fabricAllocations.length, 2);
  assert.ok(
    sameProductState.fabricAllocations.every(
      (allocation) => allocation.fabricCode === "INLINE-A",
    ),
  );
  assertFabricProgress(sameProductRenderer.root, 2, 2, 4, 4);

  let multiTargetState = FabricAllocationStateEngine.initialize();
  multiTargetState = assignFutureFabricToGarment({
    state: multiTargetState,
    garmentTypeSelection: shirtTrouserKaftanSelection,
    garmentKey: "base:shirt",
    fabricCode: "INLINE-A",
  }).state;
  multiTargetState = assignFutureFabricToGarment({
    state: multiTargetState,
    garmentTypeSelection: shirtTrouserKaftanSelection,
    garmentKey: "base:kaftan",
    fabricCode: "INLINE-B",
  }).state;
  let multiTargetRenderer!: ReturnType<typeof create>;
  const renderMultiTarget = () =>
    renderStep(
      multiTargetState,
      () => undefined,
      shirtTrouserKaftanSelection,
      () => undefined,
      () => undefined,
      () => undefined,
      undefined,
      applySameFabricResult(
        () => multiTargetState,
        (state) => {
          multiTargetState = state;
        },
        shirtTrouserKaftanSelection,
      ),
      undefined,
      applyExistingAllocationResult(
        () => multiTargetState,
        (state) => {
          multiTargetState = state;
        },
        shirtTrouserKaftanSelection,
      ),
    );
  await act(async () => {
    multiTargetRenderer = create(renderMultiTarget(), {
      createNodeMock: createFocusMock,
    });
  });
  await act(async () =>
    multiTargetRenderer.root
      .findByProps({ "data-testid": "assign-to-fabric-base:trouser" })
      .props.onClick(),
  );
  await act(async () => multiTargetRenderer.update(renderMultiTarget()));
  assert.ok(
    multiTargetRenderer.root.findAll(
      (node) => typeof node.props["data-partial-allocation-id"] === "string",
    ).length >= 2,
    "Multiple partial targets must render a chooser.",
  );
  const multiShirtAllocationId = multiTargetState.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  )!.allocationId;
  const multiKaftanAllocationId = multiTargetState.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:kaftan",
    ),
  )!.allocationId;
  await act(async () =>
    multiTargetRenderer.root
      .findByProps({
        "data-testid": `partial-fabric-capacity-select-${multiKaftanAllocationId}`,
      })
      .props.onClick(),
  );
  await act(async () => multiTargetRenderer.update(renderMultiTarget()));
  const kaftanAllocation = multiTargetState.fabricAllocations.find(
    (allocation) => allocation.allocationId === multiKaftanAllocationId,
  );
  const shirtAllocation = multiTargetState.fabricAllocations.find(
    (allocation) => allocation.allocationId === multiShirtAllocationId,
  );
  assert.ok(kaftanAllocation);
  assert.ok(shirtAllocation);
  assert.equal(kaftanAllocation!.garmentAssignments.length, 2);
  assert.ok(
    kaftanAllocation!.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:trouser",
    ),
  );
  assert.equal(shirtAllocation!.garmentAssignments.length, 1);
  assert.ok(
    shirtAllocation!.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  );
  assert.equal(multiTargetState.fabricAllocations.length, 2);

  {
    let focusPartialState = buildScreenshotPartialState();
    let focusPartialRenderer!: ReturnType<typeof create>;
    const renderFocusPartial = () =>
      renderStep(
        focusPartialState,
        () => undefined,
        mixedScreenshotSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        applySameFabricResult(
          () => focusPartialState,
          (state) => {
            focusPartialState = state;
          },
          mixedScreenshotSelection,
        ),
        undefined,
        applyExistingAllocationResult(
          () => focusPartialState,
          (state) => {
            focusPartialState = state;
          },
          mixedScreenshotSelection,
        ),
      );
    await act(async () => {
      focusPartialRenderer = create(renderFocusPartial(), {
        createNodeMock: createFocusMock,
      });
    });
    const assignTrigger = focusPartialRenderer.root.findByProps({
      "data-testid": "assign-to-fabric-base:trouser",
    });
    const assignFocusTarget = focusMocks.get("Assign fabric for Trouser");
    assert.ok(assignFocusTarget);
    activeFocusMock = assignFocusTarget;
    await act(async () => assignTrigger.props.onClick());
    await act(async () => focusPartialRenderer.update(renderFocusPartial()));
    assert.ok(dialogFocusMock, "Partial assignment dialog must receive initial focus.");
    assert.notEqual(activeFocusMock, assignFocusTarget);
    await act(async () => {
      dialogFocusMock!.dispatchKeyDown({ key: "Escape", preventDefault: () => undefined });
    });
    await act(async () => focusPartialRenderer.update(renderFocusPartial()));
    flushAnimationFrames();
    assert.equal(
      activeFocusMock?.label,
      "Assign fabric for Trouser",
      "Escape must restore focus to the originating Assign to Fabric action.",
    );

    activeFocusMock = assignFocusTarget;
    await act(async () => assignTrigger.props.onClick());
    await act(async () => focusPartialRenderer.update(renderFocusPartial()));
    await act(async () =>
      focusPartialRenderer.root
        .findByProps({ "data-testid": "partial-fabric-capacity-cancel" })
        .props.onClick(),
    );
    await act(async () => focusPartialRenderer.update(renderFocusPartial()));
    flushAnimationFrames();
    assert.equal(
      activeFocusMock?.label,
      "Assign fabric for Trouser",
      "Cancel must restore focus to the originating Assign to Fabric action.",
    );
  }

  {
    const shirtOnlySelection = reconcileGarmentTypeStepSelection({
      selectedGarmentTypes: ["shirt"],
      selectedDemographics: ["male"],
      normalizedCustomDetailCatalog: catalog,
    }).selection;
    const shirtConstruction = resolveGarmentConstructionPricing("shirt", catalog);
    assert.equal(shirtConstruction.status, "resolved");
    if (shirtConstruction.status !== "resolved") {
      throw new Error("Expected shirt construction pricing");
    }
    const authorizedAdditionalShirtOccurrences = buildAuthoritativePhysicalOccurrences({
      sourceKind: "catalogue",
      step1GarmentTypeSelection: shirtOnlySelection,
      effectiveGarmentTypeSelection: shirtOnlySelection,
      additionalGarmentConstructionState: {
        schemaVersion: 1,
        byGarmentKey: {
          "additional:shirt:1": cloneGarmentConstructionPricingResolution(
            shirtConstruction,
          ),
        },
      },
    });
    let additionalPartialState = applyFutureFabricCardSelection({
      state: FabricAllocationStateEngine.initialize(),
      garmentTypeSelection: shirtOnlySelection,
      garmentKey: "base:shirt",
      fabricCode: "INLINE-A",
    });
    const shirtAllocationId =
      additionalPartialState.fabricAllocations[0]?.allocationId;
    assert.ok(shirtAllocationId);
    let additionalPartialRenderer!: ReturnType<typeof create>;
    const renderAdditionalPartial = () =>
      renderStep(
        additionalPartialState,
        () => undefined,
        shirtOnlySelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        undefined,
        fabrics,
        applyExistingAllocationResult(
          () => additionalPartialState,
          (state) => {
            additionalPartialState = state;
          },
          shirtOnlySelection,
          authorizedAdditionalShirtOccurrences,
        ),
        undefined,
        authorizedAdditionalShirtOccurrences,
      );
    await act(async () => {
      additionalPartialRenderer = create(renderAdditionalPartial(), {
        createNodeMock: createFocusMock,
      });
    });
    const assignAdditionalShirtButton = additionalPartialRenderer.root.findByProps({
      "data-testid": "assign-to-fabric-additional:shirt:1",
    });
    assert.ok(
      assignAdditionalShirtButton,
      "Authorized additional Shirt must expose Assign to Fabric for a partial allocation.",
    );
    assert.equal(
      findButton(additionalPartialRenderer.root, "Add Fabric"),
      undefined,
      "Authorized additional Shirt must not be blocked behind Add Fabric at the limit.",
    );
    await act(async () => assignAdditionalShirtButton.props.onClick());
    await act(async () => additionalPartialRenderer.update(renderAdditionalPartial()));
    await act(async () =>
      additionalPartialRenderer.root
        .findByProps({ "data-testid": "partial-fabric-capacity-confirm" })
        .props.onClick(),
    );
    await act(async () => additionalPartialRenderer.update(renderAdditionalPartial()));
    const filledAllocation = additionalPartialState.fabricAllocations.find(
      (allocation) => allocation.allocationId === shirtAllocationId,
    );
    assert.deepEqual(
      filledAllocation?.garmentAssignments.map((assignment) => assignment.garmentKey).sort(),
      ["additional:shirt:1", "base:shirt"],
    );
    assert.equal(additionalPartialState.fabricAllocations.length, 1);
    assert.equal(
      getFutureFabricStageCompletion({
        garmentTypeSelection: shirtOnlySelection,
        fabricAllocationState: additionalPartialState,
        fabrics,
        requiredPhysicalOccurrences: authorizedAdditionalShirtOccurrences,
      }).isComplete,
      true,
    );
  }

  // H4 renders a scoped orphan repair flow without legitimizing the orphan card.
  {
    const orphanGarmentKey = "additional:full_length_gown:99";
    const requiredOccurrences: PhysicalGarmentOccurrence[] = [
      {
        garmentKey: "base:shirt",
        garmentType: "shirt",
        sourceRole: "main",
        fabricUnits: 1,
      },
    ];
    const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
    const rawState: FabricAllocationState = {
      fabricAllocations: [
        {
          allocationId: "integrity-mixed-allocation",
          fabricCode: "INLINE-A",
          garmentAssignments: [
            {
              garmentKey: "base:shirt",
              code: "BASE_SHIRT",
              garmentType: "shirt",
              fabricUnits: 1,
              sourceRole: "main",
            },
            {
              garmentKey: orphanGarmentKey,
              code: "ADDITIONAL_GOWN",
              garmentType: "full_length_gown",
              fabricUnits: 2,
              sourceRole: "additional",
            },
          ],
        },
      ],
      activeAllocationId: "integrity-mixed-allocation",
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
    const hydration = prepareHydratedFabricAllocationState({
      rawState,
      garmentTypeSelection,
      authoritativeOccurrenceKeys,
      requiredPhysicalOccurrences: requiredOccurrences,
    });
    const runtimeStateBeforeRepair = JSON.stringify(hydration.reconciledState);
    let preservedRawAllocations = hydration.preservedRawFabricAllocations;
    let integrityDiagnostics = hydration.integrity.diagnostics;
    let repairTargets = getHydratedOrphanFabricAssignmentRepairTargets({
      preservedRawFabricAllocations: preservedRawAllocations ?? [],
      authoritativeOccurrenceKeys,
    });
    let repairCallCount = 0;
    const repairOrphan = (
      target: HydratedOrphanFabricAssignmentRepairTarget,
    ): HydratedOrphanFabricAssignmentRepairResult => {
      repairCallCount += 1;
      const result = repairHydratedOrphanFabricAssignment({
        preservedRawFabricAllocations: preservedRawAllocations,
        runtimeState: hydration.reconciledState,
        authoritativeOccurrenceKeys,
        target,
      });
      if (result.status === "removed") {
        preservedRawAllocations = result.preservedRawFabricAllocations;
        integrityDiagnostics = result.integrity.diagnostics;
        repairTargets = getHydratedOrphanFabricAssignmentRepairTargets({
          preservedRawFabricAllocations: preservedRawAllocations ?? [],
          authoritativeOccurrenceKeys,
        });
      }
      return result;
    };
    const renderIntegrityRepair = () =>
      renderStep(
        hydration.reconciledState,
        () => undefined,
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        undefined,
        fabrics,
        () => undefined,
        () => undefined,
        requiredOccurrences,
        {
          diagnostics: integrityDiagnostics,
          targets: repairTargets,
          onRepair: repairOrphan,
        },
      );
    orphanRepairDialogFocusables.length = 0;
    let integrityRenderer!: ReturnType<typeof create>;
    await act(async () => {
      integrityRenderer = create(renderIntegrityRepair(), {
        createNodeMock: createFocusMock,
      });
    });
    assert.equal(
      integrityRenderer.root.findAllByProps({
        "data-fabric-integrity-repair-panel": "true",
      }).length,
      1,
    );
    assert.match(
      textContent(integrityRenderer.root),
      /Saved Fabric assignment needs repair/,
    );
    assert.equal(
      integrityRenderer.root.findAllByProps({
        "data-garment-key": orphanGarmentKey,
      }).length,
      0,
      "An orphan must not render as an authoritative garment assignment card.",
    );
    assert.equal(
      integrityRenderer.root.findAllByProps({
        "data-garment-key": "base:shirt",
        "data-assignment-status": "assigned",
      }).length,
      1,
      "The valid assignment in the mixed allocation must remain visible.",
    );

    const repairButton = integrityRenderer.root.findByProps({
      "data-remove-invalid-fabric-assignment": "true",
    });
    const repairButtonLabel =
      "Remove invalid Fabric assignment for Long Dress (Gown)";
    const repairButtonFocus = focusMocks.get(repairButtonLabel);
    assert.ok(repairButtonFocus);
    activeFocusMock = repairButtonFocus;
    const rawBeforeCancel = JSON.stringify(preservedRawAllocations);
    await act(async () =>
      repairButton.props.onClick({ currentTarget: repairButtonFocus }),
    );
    const repairDialog = integrityRenderer.root.findByProps({
      "data-testid": "invalid-fabric-assignment-repair-dialog",
    });
    assert.equal(repairDialog.props.role, "dialog");
    assert.equal(repairDialog.props["aria-modal"], "true");
    assert.equal(
      repairDialog.props["data-repair-allocation-id"],
      "integrity-mixed-allocation",
    );
    assert.equal(repairDialog.props["data-repair-garment-key"], orphanGarmentKey);
    assert.match(
      textContent(repairDialog),
      /This removes the saved Fabric assignment only\. It will not add or remove garments from your order\./,
    );
    await act(async () =>
      integrityRenderer.root
        .findByProps({ "data-invalid-fabric-repair-cancel": "true" })
        .props.onClick(),
    );
    flushAnimationFrames();
    assert.equal(JSON.stringify(preservedRawAllocations), rawBeforeCancel);
    assert.equal(repairCallCount, 0);
    assert.equal(activeFocusMock, repairButtonFocus);

    activeFocusMock = repairButtonFocus;
    await act(async () =>
      repairButton.props.onClick({ currentTarget: repairButtonFocus }),
    );
    assert.ok(dialogFocusMock);
    await act(async () =>
      dialogFocusMock!.dispatchKeyDown({
        key: "Escape",
        preventDefault: () => undefined,
      }),
    );
    flushAnimationFrames();
    assert.equal(JSON.stringify(preservedRawAllocations), rawBeforeCancel);
    assert.equal(repairCallCount, 0);
    assert.equal(activeFocusMock, repairButtonFocus);

    await act(async () =>
      repairButton.props.onClick({ currentTarget: repairButtonFocus }),
    );
    await act(async () =>
      integrityRenderer.root
        .findByProps({ "data-invalid-fabric-repair-confirm": "true" })
        .props.onClick(),
    );
    await act(async () => integrityRenderer.update(renderIntegrityRepair()));
    flushAnimationFrames();
    assert.equal(repairCallCount, 1);
    assert.equal(repairTargets.length, 0);
    assert.equal(integrityDiagnostics.length, 0);
    assert.equal(
      integrityRenderer.root.findAllByProps({
        "data-fabric-integrity-repair-panel": "true",
      }).length,
      0,
    );
    assert.equal(
      integrityRenderer.root.findAllByProps({
        "data-garment-key": "base:shirt",
        "data-assignment-status": "assigned",
      }).length,
      1,
    );
    assert.equal(
      JSON.stringify(hydration.reconciledState),
      runtimeStateBeforeRepair,
      "Orphan repair must not mutate valid runtime Fabric or membership state.",
    );
    assert.match(
      textContent(
        integrityRenderer.root.findByProps({
          "data-fabric-integrity-repair-status": "true",
        }),
      ),
      /Invalid saved assignment for Inline Heritage A removed\./,
    );
    assert.equal(activeFocusMock?.label, "fabric-integrity-repair-status");
  }

  // H4 keeps independent repair actions when more than one orphan remains.
  {
    const requiredOccurrences: PhysicalGarmentOccurrence[] = [
      {
        garmentKey: "base:shirt",
        garmentType: "shirt",
        sourceRole: "main",
        fabricUnits: 1,
      },
    ];
    const authoritativeOccurrenceKeys = new Set(["base:shirt"]);
    const rawState: FabricAllocationState = {
      fabricAllocations: [
        {
          allocationId: "orphan-gown-allocation",
          fabricCode: "INLINE-A",
          garmentAssignments: [
            {
              garmentKey: "additional:full_length_gown:99",
              code: "ADDITIONAL_GOWN",
              garmentType: "full_length_gown",
              fabricUnits: 2,
              sourceRole: "additional",
            },
          ],
        },
        {
          allocationId: "orphan-trouser-allocation",
          fabricCode: "INLINE-B",
          garmentAssignments: [
            {
              garmentKey: "additional:trouser:88",
              code: "ADDITIONAL_TROUSER",
              garmentType: "trouser",
              fabricUnits: 1,
              sourceRole: "additional",
            },
          ],
        },
      ],
      activeAllocationId: "orphan-gown-allocation",
      pendingFabricGarment: null,
      awaitingFabricForPendingGarment: false,
    };
    const hydration = prepareHydratedFabricAllocationState({
      rawState,
      garmentTypeSelection,
      authoritativeOccurrenceKeys,
      requiredPhysicalOccurrences: requiredOccurrences,
    });
    let preservedRawAllocations = hydration.preservedRawFabricAllocations;
    let diagnostics = hydration.integrity.diagnostics;
    let targets = getHydratedOrphanFabricAssignmentRepairTargets({
      preservedRawFabricAllocations: preservedRawAllocations ?? [],
      authoritativeOccurrenceKeys,
    });
    const onRepair = (target: HydratedOrphanFabricAssignmentRepairTarget) => {
      const result = repairHydratedOrphanFabricAssignment({
        preservedRawFabricAllocations: preservedRawAllocations,
        runtimeState: hydration.reconciledState,
        authoritativeOccurrenceKeys,
        target,
      });
      if (result.status === "removed") {
        preservedRawAllocations = result.preservedRawFabricAllocations;
        diagnostics = result.integrity.diagnostics;
        targets = getHydratedOrphanFabricAssignmentRepairTargets({
          preservedRawFabricAllocations: preservedRawAllocations ?? [],
          authoritativeOccurrenceKeys,
        });
      }
      return result;
    };
    const renderMultipleRepairs = () =>
      renderStep(
        hydration.reconciledState,
        () => undefined,
        garmentTypeSelection,
        () => undefined,
        () => undefined,
        () => undefined,
        undefined,
        undefined,
        fabrics,
        () => undefined,
        () => undefined,
        requiredOccurrences,
        { diagnostics, targets, onRepair },
      );
    let multipleRepairRenderer!: ReturnType<typeof create>;
    await act(async () => {
      multipleRepairRenderer = create(renderMultipleRepairs(), {
        createNodeMock: createFocusMock,
      });
    });
    assert.equal(
      multipleRepairRenderer.root.findAllByProps({
        "data-fabric-integrity-repair-item": "true",
      }).length,
      2,
    );
    const gownRepairButton = multipleRepairRenderer.root.findByProps({
      "aria-label": "Remove invalid Fabric assignment for Long Dress (Gown)",
    });
    await act(async () =>
      gownRepairButton.props.onClick({
        currentTarget: focusMocks.get(
          "Remove invalid Fabric assignment for Long Dress (Gown)",
        ),
      }),
    );
    await act(async () =>
      multipleRepairRenderer.root
        .findByProps({ "data-invalid-fabric-repair-confirm": "true" })
        .props.onClick(),
    );
    await act(async () =>
      multipleRepairRenderer.update(renderMultipleRepairs()),
    );
    flushAnimationFrames();
    assert.equal(targets.length, 1);
    assert.equal(targets[0]?.garmentKey, "additional:trouser:88");
    assert.equal(
      multipleRepairRenderer.root.findAllByProps({
        "data-fabric-integrity-repair-item": "true",
      }).length,
      1,
    );
    assert.equal(
      activeFocusMock?.label,
      "Remove invalid Fabric assignment for Trouser",
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
