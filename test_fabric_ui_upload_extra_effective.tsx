/**
 * Codex HIGH #1: Fabric UI must render effective journey (upload extras),
 * not Step-1-only selection — via the DesignStudio production prop path.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createElement, useState, type ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import type { Fabric, FabricAllocationState, GarmentTypeStepSelection } from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import {
  assignFutureFabricToGarment,
  assignFutureGarmentToExistingFabricAllocation,
  assignSameFabricProductToGarments,
  changeFutureFabricAllocationProduct,
  getFutureFabricAllocationAssignmentSignature,
  getFutureFabricStageCompletion,
  getFutureGarmentFabricPlanning,
} from "./src/utils/designStudioFutureFabricStage";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  mergeUploadedDesignCompositionWithStep1,
  resolveFabricStepGarmentTypeSelection,
} from "./src/utils/uploadedDesignStep1";

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

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographics: ["male"],
    normalizedCustomDetailCatalog: catalog,
  }).selection;

const fabrics: Fabric[] = [
  {
    code: "FAB-UI-A",
    name: "Fabric UI A",
    description: "Test fabric",
    color: "Green",
    colorHex: "#0A4A33",
    category: "Test",
    price: 20,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
  },
  {
    code: "FAB-UI-B",
    name: "Fabric UI B",
    description: "Second test fabric",
    color: "Gold",
    colorHex: "#B28A3B",
    category: "Test",
    price: 22,
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

const findButton = (root: ReactTestInstance, label: string) =>
  root.findAllByType("button").find((button) => textContent(button).includes(label));

/** Mirrors DesignStudioView → DormantFutureFabricStep production prop wiring. */
const FabricStepProductionBoundary = ({
  step1GarmentTypeSelection,
  effectiveJourneyGarmentTypeSelection,
  initialFabricState,
}: {
  step1GarmentTypeSelection: GarmentTypeStepSelection;
  effectiveJourneyGarmentTypeSelection: GarmentTypeStepSelection;
  initialFabricState: FabricAllocationState;
}) => {
  const [fabricAllocationState, setFabricAllocationState] =
    useState(initialFabricState);
  const garmentTypeSelection = resolveFabricStepGarmentTypeSelection({
    step1GarmentTypeSelection,
    effectiveJourneyGarmentTypeSelection,
  });
  const completion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics,
  });
  const planning = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState,
  });

  return createElement(DormantFutureFabricStep, {
    fabrics,
    garmentTypeSelection,
    fabricAllocationState,
    completion,
    requiredFabricQuantity: planning.requiredFabricQuantity,
    selectedFabricQuantity: planning.selectedFabricQuantity,
    constructionPrice: 0,
    onAssignFabricToGarment: (fabric: Fabric, garmentKey: string) => {
      setFabricAllocationState((current) =>
        assignFutureFabricToGarment({
          state: current,
          garmentTypeSelection,
          garmentKey,
          fabricCode: fabric.code,
        }).state,
      );
    },
    onChangeFabricAllocationProduct: () => undefined,
    onRemoveFabricFromGarment: () => undefined,
    onUseSameFabricForGarment: () => undefined,
    onAssignSameFabricProduct: (fabricCode: string, garmentKeys: string[]) => {
      let result: ReturnType<typeof assignSameFabricProductToGarments> | null =
        null;
      setFabricAllocationState((current) => {
        result = assignSameFabricProductToGarments({
          state: current,
          garmentTypeSelection,
          fabricCode,
          garmentKeys,
        });
        return result.status === "assigned" ? result.state : current;
      });
      return result ?? undefined;
    },
    onAssignGarmentToExistingAllocation: (garmentKey: string, allocationId: string) => {
      let result: ReturnType<
        typeof assignFutureGarmentToExistingFabricAllocation
      > | null = null;
      setFabricAllocationState((current) => {
        result = assignFutureGarmentToExistingFabricAllocation({
          state: current,
          garmentTypeSelection,
          garmentKey,
          allocationId,
        });
        return result.status === "assigned" ? result.state : current;
      });
      return result ?? undefined;
    },
    onBack: () => undefined,
    onContinue: () => undefined,
    onUseSameFabric: () => undefined,
    onChooseAnotherFabric: () => undefined,
    onCancelPendingFabric: () => undefined,
  }) as ReactElement;
};

// Guard: DesignStudioView must pass the production Fabric selection resolver path.
{
  const viewSource = readFileSync(
    new URL("./src/components/DesignStudioView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    viewSource,
    /resolveFabricStepGarmentTypeSelection/,
    "DesignStudioView must resolve Fabric props via resolveFabricStepGarmentTypeSelection",
  );
  assert.match(
    viewSource,
    /garmentTypeSelection=\{fabricStepGarmentTypeSelection\}/,
    "DesignStudioView must not pass Step1-only garmentTypeSelection into Fabric Step",
  );
}

const step1 = selection(["shirt"]);

const runUploadExtraCase = async ({
  extra,
  expectedTrouserOrExtraKey,
  expectedLabel,
  assignmentMode,
}: {
  extra: "trouser" | "full_length_gown" | "kaftan";
  expectedTrouserOrExtraKey: string;
  expectedLabel: string;
  assignmentMode: "add_fabric" | "assign_to_existing";
}) => {
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: [extra],
  });
  const effective = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: composition,
    normalizedCustomDetailCatalog: catalog,
  });
  assert.ok(effective.garmentTypes.includes("shirt"));
  assert.ok(effective.garmentTypes.includes(extra));

  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: effective,
    garmentKey: "base:shirt",
    fabricCode: fabrics[0].code,
  }).state;
  const shirtAllocationId = fabricState.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  )!.allocationId;

  assert.equal(
    getFutureFabricStageCompletion({
      garmentTypeSelection: effective,
      fabricAllocationState: fabricState,
      fabrics,
    }).isComplete,
    false,
  );

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(FabricStepProductionBoundary, {
        step1GarmentTypeSelection: step1,
        effectiveJourneyGarmentTypeSelection: effective,
        initialFabricState: fabricState,
      }),
    );
  });

  const shirtCard = renderer.root.findByProps({ "data-garment-key": "base:shirt" });
  const extraCard = renderer.root.findByProps({
    "data-garment-key": expectedTrouserOrExtraKey,
  });
  assert.equal(shirtCard.props["data-assignment-status"], "assigned");
  assert.equal(extraCard.props["data-assignment-status"], "unassigned");
  assert.ok(textContent(shirtCard).includes("Assigned"));
  assert.ok(textContent(extraCard).includes("Needs fabric"));
  assert.ok(textContent(extraCard).includes(expectedLabel));

  if (assignmentMode === "assign_to_existing") {
    assert.equal(
      findButton(extraCard, "Add Fabric"),
      undefined,
      `${expectedLabel} must not expose Add Fabric when partial capacity can complete the Fabric.`,
    );
    const assignButton = findButton(extraCard, "Assign to Fabric");
    assert.ok(assignButton, `Assign to Fabric must exist for ${extra}`);
    assert.equal(Boolean(assignButton!.props.disabled), false);

    await act(async () => assignButton!.props.onClick());
    assert.equal(
      renderer.root.findAllByProps({
        "data-testid": "partial-fabric-capacity-assignment-dialog",
      }).length,
      1,
    );
    await act(async () =>
      renderer.root
        .findByProps({ "data-testid": "partial-fabric-capacity-confirm" })
        .props.onClick(),
    );

    const updatedExtra = renderer.root.findByProps({
      "data-garment-key": expectedTrouserOrExtraKey,
    });
    assert.equal(updatedExtra.props["data-assignment-status"], "assigned");
    assert.ok(textContent(updatedExtra).includes("Assigned"));
    const stepProps = renderer.root.findByType(DormantFutureFabricStep).props;
    assert.equal(stepProps.completion.isComplete, true);
    assert.equal(stepProps.fabricAllocationState.fabricAllocations.length, 1);
    const completedAllocation = stepProps.fabricAllocationState.fabricAllocations.find(
      (allocation: { allocationId: string }) =>
        allocation.allocationId === shirtAllocationId,
    );
    assert.ok(completedAllocation);
    assert.equal(completedAllocation.garmentAssignments.length, 2);
    assert.ok(
      completedAllocation.garmentAssignments.some(
        (assignment: { garmentKey: string }) =>
          assignment.garmentKey === "base:shirt",
      ),
    );
    assert.ok(
      completedAllocation.garmentAssignments.some(
        (assignment: { garmentKey: string }) =>
          assignment.garmentKey === expectedTrouserOrExtraKey,
      ),
    );
  } else {
    const addExtra = findButton(extraCard, "Add Fabric");
    assert.ok(addExtra, `Add Fabric must exist for ${extra}`);
    assert.equal(Boolean(addExtra!.props.disabled), false);

    await act(async () => {
      addExtra!.props.onClick({ currentTarget: {} });
    });

    const fabricCards = renderer.root.findAllByProps({ "data-fabric-card": "true" });
    assert.ok(
      fabricCards.length > 0,
      "Fabric catalogue must expose a selectable fabric after Add Fabric",
    );
    const preferred =
      fabricCards.find(
        (card) => card.props["data-fabric-code"] === "FAB-UI-B",
      ) || fabricCards[0];
    await act(async () => {
      preferred.props.onClick();
    });
    const extraCheckbox = renderer.root.findByProps({
      "data-step1-fabric-assignment-checkbox": expectedTrouserOrExtraKey,
    });
    await act(async () => {
      extraCheckbox.props.onChange({ currentTarget: { checked: true } });
    });
    await act(async () => {
      renderer.root
        .findByProps({ "data-testid": "step1-fabric-assignment-confirm" })
        .props.onClick();
    });

    const updatedExtra = renderer.root.findByProps({
      "data-garment-key": expectedTrouserOrExtraKey,
    });
    assert.equal(updatedExtra.props["data-assignment-status"], "assigned");
    assert.ok(textContent(updatedExtra).includes("Assigned"));
    assert.equal(
      renderer.root.findByType(DormantFutureFabricStep).props.completion.isComplete,
      true,
    );
  }

  // Regression: Step1-only wiring would never show the extra card.
  await act(async () => {
    assert.throws(() => {
      create(
        createElement(FabricStepProductionBoundary, {
          step1GarmentTypeSelection: step1,
          // Intentionally wrong: pass Step1 as "effective" — only shirt renders.
          effectiveJourneyGarmentTypeSelection: step1,
          initialFabricState: fabricState,
        }),
      ).root.findByProps({ "data-garment-key": expectedTrouserOrExtraKey });
    });
  });
};

await runUploadExtraCase({
  extra: "trouser",
  expectedTrouserOrExtraKey: "base:trouser",
  expectedLabel: "Trouser",
  assignmentMode: "assign_to_existing",
});

await runUploadExtraCase({
  extra: "full_length_gown",
  expectedTrouserOrExtraKey: "base:full_length_gown",
  expectedLabel: "Long Dress (Gown)",
  assignmentMode: "add_fabric",
});

{
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["kaftan"],
  });
  assert.equal(
    composition.find((spec) => spec.garmentType === "kaftan")?.fabricUnits,
    1,
  );
  assert.equal(
    composition.find((spec) => spec.garmentType === "full_length_gown"),
    undefined,
  );
  const gownComposition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["full_length_gown"],
  });
  assert.equal(
    gownComposition.find((spec) => spec.garmentType === "full_length_gown")
      ?.fabricUnits,
    2,
  );
}

await runUploadExtraCase({
  extra: "kaftan",
  expectedTrouserOrExtraKey: "base:kaftan",
  expectedLabel: "Long Shirt (Kaftan)",
  assignmentMode: "assign_to_existing",
});

{
  let priceActivatedFabricCode: string | null = "FAB-UI-A";
  const activeUploadedDesignSource = true;
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt"],
    additionalGarmentTypes: ["trouser"],
  });
  const effective = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: composition,
    normalizedCustomDetailCatalog: catalog,
  });
  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: effective,
    garmentKey: "base:shirt",
    fabricCode: fabrics[0].code,
  }).state;
  const shirtAllocationId = fabricState.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  )!.allocationId;
  const staleState = assignFutureGarmentToExistingFabricAllocation({
    state: fabricState,
    garmentTypeSelection: effective,
    garmentKey: "base:trouser",
    allocationId: shirtAllocationId,
  }).state;

  const handleAssignGarmentToExistingAllocation = (
    state: FabricAllocationState,
    garmentKey: string,
    allocationId: string,
  ) => {
    const result = assignFutureGarmentToExistingFabricAllocation({
      state,
      garmentTypeSelection: effective,
      garmentKey,
      allocationId,
    });
    if (result.status === "assigned") {
      if (activeUploadedDesignSource) {
        priceActivatedFabricCode = null;
      }
    }
    return result;
  };

  const blocked = handleAssignGarmentToExistingAllocation(
    staleState,
    "base:trouser",
    shirtAllocationId,
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.status === "blocked" ? blocked.reason : null,
    "GARMENT_ALREADY_ASSIGNED",
  );
  assert.equal(priceActivatedFabricCode, "FAB-UI-A");

  const validResult = handleAssignGarmentToExistingAllocation(
    fabricState,
    "base:trouser",
    shirtAllocationId,
  );
  assert.equal(validResult.status, "assigned");
  assert.equal(priceActivatedFabricCode, null);
}

{
  let priceActivatedFabricCode: string | null = "FAB-UI-A";
  const activeUploadedDesignSource = true;
  const composition = mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes: ["shirt", "trouser"],
    additionalGarmentTypes: [],
  });
  const effective = buildEffectiveUploadedJourneyGarmentTypeSelection({
    step1Selection: step1,
    uploadedComposition: composition,
    normalizedCustomDetailCatalog: catalog,
  });
  let fabricState = FabricAllocationStateEngine.initialize();
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: effective,
    garmentKey: "base:shirt",
    fabricCode: fabrics[0].code,
    fabrics,
  }).state;
  fabricState = assignFutureFabricToGarment({
    state: fabricState,
    garmentTypeSelection: effective,
    garmentKey: "base:trouser",
    fabricCode: fabrics[0].code,
    fabrics,
  }).state;
  const sharedAllocation = fabricState.fabricAllocations.find((allocation) =>
    allocation.garmentAssignments.some(
      (assignment) => assignment.garmentKey === "base:shirt",
    ),
  )!;
  const expectation = {
    expectedCurrentFabricCode: sharedAllocation.fabricCode,
    expectedAssignmentSignature: getFutureFabricAllocationAssignmentSignature(
      sharedAllocation,
    ),
  };
  const mutatedState = {
    ...fabricState,
    fabricAllocations: fabricState.fabricAllocations.map((allocation) =>
      allocation.allocationId === sharedAllocation.allocationId
        ? { ...allocation, fabricCode: fabrics[1].code }
        : allocation,
    ),
  };

  const handleChangeFabricAllocationProduct = (
    state: typeof fabricState,
    allocationId: string,
    fabricCode: string,
    changeExpectation?: typeof expectation,
  ) => {
    const result = changeFutureFabricAllocationProduct({
      state,
      allocationId,
      nextFabricCode: fabricCode,
      fabrics,
      expectation: changeExpectation,
    });
    if (result.status === "assigned" && result.state !== state) {
      if (activeUploadedDesignSource) {
        priceActivatedFabricCode = null;
      }
    }
    return result;
  };

  const blocked = handleChangeFabricAllocationProduct(
    mutatedState,
    sharedAllocation.allocationId,
    fabrics[1].code,
    expectation,
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(
    blocked.status === "blocked" ? blocked.reason : null,
    "ALLOCATION_CHANGED",
  );
  assert.equal(priceActivatedFabricCode, "FAB-UI-A");
  assert.equal(
    mutatedState.fabricAllocations.find(
      (allocation) => allocation.allocationId === sharedAllocation.allocationId,
    )?.fabricCode,
    fabrics[1].code,
  );
}

console.log("PASS: rendered Fabric UI upload-extra effective composition");
