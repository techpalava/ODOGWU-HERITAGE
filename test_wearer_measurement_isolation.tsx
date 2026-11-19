import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, useRef, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
  GuestDesignDraft,
  MeasurementMethodId,
  WearerOrderStateV2,
} from "./src/types";
import {
  normalizeGuestDesignDraft,
} from "./src/services/guestOrderSessionService";
import { DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import {
  createDesignStudioResumeLocus,
  resolveDesignStudioResumeLocus,
} from "./src/utils/designStudioResumeLocus";
import {
  createEmptyFutureMeasurementState,
  setFutureMeasurementRoute,
  type MeasurementPhysicalGarment,
} from "./src/utils/measurementBlueprint";
import { createWearerGarmentToggleHandlers } from "./src/utils/wearerGarmentToggle";
import {
  addPersonAndAssignGarment,
  addWearer,
  applyWearerMeasurementUpdate,
  assignGarmentToWearer,
  canonicalizeWearerOrderNames,
  classifyPersistedMeasurement,
  copySharedBodyMeasurementsBetweenWearers,
  createEmptyWearerOrder,
  deleteWearer,
  getWearerCopyableSharedBodyMeasurements,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  removeGarmentFromWearerOrder,
  renameWearer,
  summarizeWearerOrderMeasurementCompletion,
  updateWearerMeasurement,
  wearerAssignmentLabel,
} from "./src/utils/wearerOrder";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const textOf = (node: ReactTestInstance | string | number | boolean | null | undefined): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map((child) => textOf(child as ReactTestInstance | string)).join("");
};

const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
      optionId,
      selectionGroup,
      priceCents: 1000,
      price: 10,
    },
  ],
  totalPriceCents: 1000,
  totalPrice: 10,
});

const studioSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
    trouser: construction("trouser", "trouser_std", "trouser_fastening"),
  },
};

const physicalGarments: readonly MeasurementPhysicalGarment[] = [
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "base:trouser", garmentType: "trouser" },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
];

const garmentLabels: Readonly<Record<string, string>> = {
  "base:shirt": "Standard Shirt",
  "base:trouser": "Standard Trouser",
  "additional:shirt:1": "Additional Shirt",
};

const additionalGarmentConstructions = {
  schemaVersion: 1 as const,
  byGarmentKey: {
    "additional:shirt:1": construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};

const findFieldInput = (renderer: ReactTestRenderer, measurementId: string) => {
  const fields = renderer.root.findAll(
    (node) => node.props?.["data-measurement-field"] === measurementId,
  );
  for (const field of fields) {
    const inputs = field.findAllByType("input");
    if (inputs.length > 0) return inputs[0]!;
  }
  return null;
};

// ---------------------------------------------------------------------------
// 0. Architecture source invariants (single source of truth, no synthetic wearers)
// ---------------------------------------------------------------------------
{
  const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  const stepSource = readFileSync("src/components/DormantFutureMeasurementStep.tsx", "utf8");
  assert.equal(
    studioSource.includes("setFutureMeasurementState"),
    false,
    "DesignStudioView must not keep independent futureMeasurementState useState",
  );
  assert.equal(
    studioSource.includes("updateWearerMeasurement(\n            reconciledWearerOrder"),
    false,
    "wearerOrderForPlan must not stamp a flat measurement overlay onto activeWearer",
  );
  assert.match(studioSource, /const commitWearerMeasurement = \(/);
  assert.match(studioSource, /const selectWearer = \(/);
  assert.equal(stepSource.includes("localAddedWearers"), false, "no fake localAddedWearers");
  assert.equal(stepSource.includes("localAssignedByGarmentKey"), false, "no fake local assignments");
  assert.equal(stepSource.includes('"wearer-1"'), false, "no synthetic wearer-1 fallback");
}

// ---------------------------------------------------------------------------
// Harness mirroring DesignStudioView's single-source-of-truth wiring
// ---------------------------------------------------------------------------
const buildInitialTwoWearerOrder = (): {
  order: WearerOrderStateV2;
  wearerAId: string;
  wearerBId: string;
} => {
  let order = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "male",
    garments: physicalGarments,
    garmentTypeSelection: studioSelection,
    additionalGarmentConstructions,
  });
  const wearerAId = order.wearers[0]!.wearerId;
  const renamed = renameWearer(order, wearerAId, "Chidi");
  assert.equal(renamed.status, "updated");
  order = renamed.order;

  const added = addWearer({
    order,
    physicalGarmentCount: physicalGarments.length,
    displayName: "Ada",
    fitContext: null,
  });
  assert.equal(added.status, "updated");
  order = added.order;
  const wearerBId = order.wearers.find((wearer) => wearer.wearerId !== wearerAId)!.wearerId;

  const assignA = assignGarmentToWearer({
    order,
    garmentKey: "base:shirt",
    wearerId: wearerAId,
    garment: physicalGarments[0]!,
    garmentTypeSelection: studioSelection,
    additionalGarmentConstructions,
  });
  assert.equal(assignA.status, "updated");
  order = assignA.order;

  const assignA2 = assignGarmentToWearer({
    order,
    garmentKey: "base:trouser",
    wearerId: wearerAId,
    garment: physicalGarments[1]!,
    garmentTypeSelection: studioSelection,
    additionalGarmentConstructions,
  });
  assert.equal(assignA2.status, "updated");
  order = assignA2.order;

  const assignB = assignGarmentToWearer({
    order,
    garmentKey: "additional:shirt:1",
    wearerId: wearerBId,
    garment: physicalGarments[2]!,
    garmentTypeSelection: studioSelection,
    additionalGarmentConstructions,
  });
  assert.equal(assignB.status, "updated");
  order = assignB.order;

  // Both start with low_risk selected and zero entered measurements.
  order = updateWearerMeasurement(
    order,
    wearerAId,
    setFutureMeasurementRoute(createEmptyFutureMeasurementState("low_risk", "cm"), "low_risk"),
  );
  order = updateWearerMeasurement(
    order,
    wearerBId,
    setFutureMeasurementRoute(createEmptyFutureMeasurementState("low_risk", "cm"), "low_risk"),
  );
  return { order, wearerAId, wearerBId };
};

interface HarnessApi {
  getOrder: () => WearerOrderStateV2;
  getActiveWearerId: () => string | null;
  selectWearer: (wearerId: string) => void;
  addAndSelectWearer: (displayName: string) => string | null;
  deleteActiveWearer: () => void;
  collapseToSolo: () => void;
  assignGarment: (garmentKey: string, wearerId: string) => void;
  unassignGarment: (garmentKey: string) => void;
  getOnChangeCalls: () => Array<{ wearerId: string | null; state: FutureMeasurementStateV1 }>;
}

const mountStudioHarness = (
  initialOrder: WearerOrderStateV2,
  initialActiveWearerId: string,
): { renderer: ReactTestRenderer; api: HarnessApi } => {
  let currentApi!: HarnessApi;
  const onChangeCalls: Array<{ wearerId: string | null; state: FutureMeasurementStateV1 }> = [];

  const StudioHarness = () => {
    const [wearerOrder, setWearerOrder] = useState<WearerOrderStateV2>(initialOrder);
    const [activeWearerId, setActiveWearerId] = useState<string | null>(initialActiveWearerId);

    const wearerOrderForPlan = reconcileWearerOrder({
      order: wearerOrder,
      garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
      compatibilityDemographic: studioSelection.demographic,
      garments: physicalGarments,
      garmentTypeSelection: studioSelection,
      additionalGarmentConstructions,
    });
    const wearerOrderForPlanRef = useRef(wearerOrderForPlan);
    wearerOrderForPlanRef.current = wearerOrderForPlan;

    const activeWearer =
      (activeWearerId
        ? wearerOrderForPlan.wearers.find((wearer) => wearer.wearerId === activeWearerId)
        : null) ||
      wearerOrderForPlan.wearers[0] ||
      null;
    const activeWearerIdRef = useRef<string | null>(activeWearer?.wearerId || null);
    activeWearerIdRef.current = activeWearer?.wearerId || null;

    const runtimes = planWearerOrderMeasurements({
      order: wearerOrderForPlan,
      garmentTypeSelection: studioSelection,
      physicalGarments,
      additionalGarmentConstructions,
    });
    const activeRuntime =
      runtimes.find((runtime) => runtime.wearerId === activeWearer?.wearerId) ||
      runtimes[0] ||
      null;
    const completion = summarizeWearerOrderMeasurementCompletion({
      order: wearerOrderForPlan,
      runtimes,
      physicalGarmentKeys: physicalGarments.map((garment) => garment.garmentKey),
    });

    const commitWearerMeasurement = (
      wearerId: string | null | undefined,
      updater:
        | FutureMeasurementStateV1
        | ((current: FutureMeasurementStateV1) => FutureMeasurementStateV1),
    ) => {
      const baseOrder = wearerOrderForPlanRef.current;
      const targetId = wearerId || activeWearerIdRef.current || null;
      if (!targetId) return null;
      const targetWearer = baseOrder.wearers.find((wearer) => wearer.wearerId === targetId);
      if (!targetWearer) return null;
      const nextMeasurement =
        typeof updater === "function" ? updater(targetWearer.measurement) : updater;
      const nextOrder = applyWearerMeasurementUpdate(
        baseOrder,
        baseOrder,
        targetId,
        nextMeasurement,
      );
      wearerOrderForPlanRef.current = nextOrder;
      setWearerOrder((stored) =>
        applyWearerMeasurementUpdate(stored, nextOrder, targetId, nextMeasurement),
      );
      return nextOrder;
    };

    const selectWearer = (nextWearerId: string) => {
      const next = wearerOrderForPlanRef.current.wearers.find(
        (wearer) => wearer.wearerId === nextWearerId,
      );
      if (!next) return;
      activeWearerIdRef.current = nextWearerId;
      setActiveWearerId(nextWearerId);
    };

    const toggles = createWearerGarmentToggleHandlers({
      getOrder: () => wearerOrderForPlanRef.current,
      getActiveWearerId: () => activeWearerIdRef.current,
      garments: physicalGarments,
      garmentTypeSelection: studioSelection,
      additionalGarmentConstructions,
      commitOrder: (order) => {
        wearerOrderForPlanRef.current = order;
        setWearerOrder(order);
      },
    });

    const wearerChips = [...wearerOrderForPlan.wearers]
      .sort((left, right) => left.presentationOrder - right.presentationOrder)
      .map((wearer) => {
        const progress = completion.byWearerId?.[wearer.wearerId];
        return {
          wearerId: wearer.wearerId,
          label: wearerAssignmentLabel(wearer.displayName, wearer.presentationOrder),
          ...(progress
            ? {
                completedCount: progress.completedCount,
                requiredCount: progress.requiredCount,
                complete: progress.complete,
                hasAssignedGarments: progress.hasAssignedGarments,
              }
            : {}),
        };
      });

    const copyableBodyMeasurementWearers = activeWearer
      ? [...wearerOrderForPlan.wearers]
          .sort((left, right) => left.presentationOrder - right.presentationOrder)
          .filter((wearer) => wearer.wearerId !== activeWearer.wearerId)
          .map((wearer) => ({
            wearerId: wearer.wearerId,
            label: wearerAssignmentLabel(wearer.displayName, wearer.presentationOrder),
            sharedCount: Object.keys(
              getWearerCopyableSharedBodyMeasurements(wearer.measurement),
            ).length,
          }))
          .filter((candidate) => candidate.sharedCount > 0)
      : [];

    const activeWearerLabel = activeWearer
      ? wearerAssignmentLabel(activeWearer.displayName, activeWearer.presentationOrder)
      : null;
    const activeWearerGarmentLabels = (activeRuntime?.garmentKeys || []).map(
      (garmentKey) => garmentLabels[garmentKey] || garmentKey,
    );

    const handleAddWearer = (displayName: string, fitContext: "male" | "female" | null) => {
      const currentOrder = wearerOrderForPlanRef.current;
      const result = addWearer({
        order: currentOrder,
        physicalGarmentCount: physicalGarments.length,
        displayName,
        fitContext,
      });
      if (result.status !== "updated") return null;
      wearerOrderForPlanRef.current = result.order;
      setWearerOrder(result.order);
      const previousIds = new Set(currentOrder.wearers.map((wearer) => wearer.wearerId));
      const addedWearer = result.order.wearers.find(
        (wearer) => !previousIds.has(wearer.wearerId),
      );
      const nextActiveId = addedWearer?.wearerId || result.order.wearers[0]?.wearerId || null;
      activeWearerIdRef.current = nextActiveId;
      setActiveWearerId(nextActiveId);
      return addedWearer?.wearerId || null;
    };

    const handleDeleteWearer = (wearerId: string) => {
      const result = deleteWearer(wearerOrderForPlanRef.current, wearerId);
      if (result.status === "updated") {
        const nextOrder =
          result.order.wearers.length === 1
            ? reconcileWearerOrder({
                order: result.order,
                garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
                compatibilityDemographic: studioSelection.demographic,
                garments: physicalGarments,
                garmentTypeSelection: studioSelection,
                additionalGarmentConstructions,
              })
            : result.order;
        wearerOrderForPlanRef.current = nextOrder;
        setWearerOrder(nextOrder);
        if (activeWearerIdRef.current === wearerId) {
          const nextActiveId = nextOrder.wearers[0]?.wearerId || null;
          activeWearerIdRef.current = nextActiveId;
          setActiveWearerId(nextActiveId);
        }
      }
      return result;
    };

    const handleCollapseToSolo = () => {
      let current = wearerOrderForPlanRef.current;
      for (const garmentKey of Object.keys(current.assignmentByGarmentKey)) {
        if (current.assignmentByGarmentKey[garmentKey] !== current.wearers[0]?.wearerId) {
          current = removeGarmentFromWearerOrder(current, garmentKey);
        }
      }
      for (let index = current.wearers.length - 1; index >= 1; index -= 1) {
        const del = deleteWearer(current, current.wearers[index]!.wearerId);
        if (del.status === "updated") current = del.order;
      }
      const nextOrder = reconcileWearerOrder({
        order: current,
        garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
        compatibilityDemographic: studioSelection.demographic,
        garments: physicalGarments,
        garmentTypeSelection: studioSelection,
        additionalGarmentConstructions,
      });
      wearerOrderForPlanRef.current = nextOrder;
      setWearerOrder(nextOrder);
      const soleId = nextOrder.wearers[0]?.wearerId || null;
      activeWearerIdRef.current = soleId;
      setActiveWearerId(soleId);
    };

    currentApi = {
      getOrder: () => wearerOrderForPlanRef.current,
      getActiveWearerId: () => activeWearerIdRef.current,
      selectWearer,
      addAndSelectWearer: (name) => handleAddWearer(name, null),
      deleteActiveWearer: () => {
        if (activeWearerIdRef.current) {
          handleDeleteWearer(activeWearerIdRef.current);
        }
      },
      collapseToSolo: handleCollapseToSolo,
      assignGarment: (garmentKey, wearerId) => {
        toggles.assign(garmentKey, wearerId);
      },
      unassignGarment: (garmentKey) => {
        toggles.unassign(garmentKey);
      },
      getOnChangeCalls: () => onChangeCalls,
    };

    return createElement(
      "div",
      null,
      createElement(WearerAssignmentPanel, {
        order: wearerOrderForPlan,
        presentation: wearerOrderForPlan.wearers.length > 1 ? "people" : "solo",
        activeWearerId: activeWearer?.wearerId || null,
        garments: physicalGarments,
        garmentLabels,
        onSelectWearer: selectWearer,
        onAddWearer: (name, fit) => {
          handleAddWearer(name, fit);
        },
        onRenameWearer: (wearerId, displayName) => {
          const renamed = renameWearer(wearerOrderForPlanRef.current, wearerId, displayName);
          if (renamed.status === "updated") {
            wearerOrderForPlanRef.current = renamed.order;
            setWearerOrder(renamed.order);
          }
        },
        onReorderWearers: () => undefined,
        onDeleteWearer: handleDeleteWearer,
        onAssignGarment: toggles.assign,
        onUnassignGarment: toggles.unassign,
        onCollapseToSolo: handleCollapseToSolo,
      }),
      createElement(DormantFutureMeasurementStep, {
        plan: activeRuntime!.plan,
        state: activeRuntime!.measurement,
        physicalGarments,
        garmentLabels,
        multiPersonAssignmentActive: wearerOrderForPlan.wearers.length > 1,
        unassignedGarments: physicalGarments.filter(
          (garment) => !wearerOrderForPlan.assignmentByGarmentKey[garment.garmentKey],
        ),
        orderMeasurementsComplete: completion.complete,
        activeWearerLabel,
        activeWearerGarmentLabels,
        wearerChips,
        activeWearerId: activeWearer?.wearerId || null,
        onSelectWearer: selectWearer,
        copyableBodyMeasurementWearers,
        onCopySharedBodyMeasurements: (sourceWearerId) => {
          const targetWearerId = activeWearerIdRef.current;
          if (!targetWearerId) return null;
          const copied = copySharedBodyMeasurementsBetweenWearers({
            order: wearerOrderForPlanRef.current,
            sourceWearerId,
            targetWearerId,
          });
          if (copied.status !== "copied" || !copied.previousTargetMeasurement) {
            return null;
          }
          wearerOrderForPlanRef.current = copied.order;
          setWearerOrder(copied.order);
          return {
            copiedCount: copied.copiedCount,
            previousMeasurement: copied.previousTargetMeasurement,
          };
        },
        onAddPersonAndAssignGarment: (displayName, garmentKey) => {
          const res = addPersonAndAssignGarment({
            order: wearerOrderForPlanRef.current,
            garments: physicalGarments,
            garmentTypeSelection: studioSelection,
            additionalGarmentConstructions,
            displayName,
            garmentKey,
            defaultRoute: "low_risk",
          });
          if (res.status !== "updated") return;
          wearerOrderForPlanRef.current = res.order;
          setWearerOrder(res.order);
          activeWearerIdRef.current = res.wearerId;
          setActiveWearerId(res.wearerId);
        },
        onChange: (nextState) => {
          const currentId = activeWearerIdRef.current;
          onChangeCalls.push({ wearerId: currentId, state: nextState });
          commitWearerMeasurement(currentId, nextState);
        },
        onRouteChange: (route: MeasurementMethodId) => {
          commitWearerMeasurement(activeWearerIdRef.current, (current) =>
            setFutureMeasurementRoute(current, route),
          );
        },
        onBack: () => undefined,
        onContinue: () => undefined,
      }),
    );
  };

  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(StudioHarness));
  });
  return { renderer, api: {
    getOrder: () => currentApi.getOrder(),
    getActiveWearerId: () => currentApi.getActiveWearerId(),
    selectWearer: (id) => currentApi.selectWearer(id),
    addAndSelectWearer: (name) => currentApi.addAndSelectWearer(name),
    deleteActiveWearer: () => currentApi.deleteActiveWearer(),
    collapseToSolo: () => currentApi.collapseToSolo(),
    assignGarment: (g, w) => currentApi.assignGarment(g, w),
    unassignGarment: (g) => currentApi.unassignGarment(g),
    getOnChangeCalls: () => currentApi.getOnChangeCalls(),
  } };
};

// ---------------------------------------------------------------------------
// 1 & 2. Entering measurements for Wearer A -> switching to Wearer B shows
//        completely empty fields; editing Wearer B -> switching back preserves A
//        + Sticky Active Wearer Banner + Per-Wearer Completion Chips
// ---------------------------------------------------------------------------
{
  const { order: initialOrder, wearerAId, wearerBId } = buildInitialTwoWearerOrder();
  const { renderer, api } = mountStudioHarness(initialOrder, wearerAId);

  // Sticky active wearer banner shows Chidi and Chidi's assigned garments.
  const bannerForA = renderer.root.findByProps({
    "data-measurement-active-wearer-banner": "true",
  });
  assert.match(textOf(bannerForA), /Measuring for Chidi/);
  assert.match(textOf(bannerForA), /Standard Shirt/);
  assert.match(textOf(bannerForA), /Standard Trouser/);

  // Enter shared body measurements AND garment-specific measurement for Wearer A (Chidi).
  act(() => {
    findFieldInput(renderer, "total_height")!.props.onChange({ target: { value: "182" } });
  });
  act(() => {
    findFieldInput(renderer, "chest_bust_circumference")!.props.onChange({
      target: { value: "104" },
    });
  });
  act(() => {
    findFieldInput(renderer, "shoulder_length")!.props.onChange({ target: { value: "46" } });
  });
  act(() => {
    findFieldInput(renderer, "shirt_length_standard")!.props.onChange({
      target: { value: "74" },
    });
  });

  // Also switch Chidi's picked garment to trouser so we test composite garment pick isolation on switch.
  act(() => {
    renderer.root
      .findByProps({ "data-measurement-garment": "base:trouser" })
      .props.onClick();
  });

  // Per-wearer completion chips reflect Chidi's progress vs Ada's 0 progress.
  const chipA = renderer.root.findByProps({ "data-measurement-wearer-chip": wearerAId });
  const chipB = renderer.root.findByProps({ "data-measurement-wearer-chip": wearerBId });
  assert.equal(chipA.props["data-measurement-wearer-chip-complete"], "false");
  assert.equal(chipB.props["data-measurement-wearer-chip-complete"], "false");
  assert.ok(
    chipA.props["data-measurement-wearer-chip-progress"]?.startsWith("4/"),
    `expected Chidi progress to start with 4/, got ${chipA.props["data-measurement-wearer-chip-progress"]}`,
  );
  assert.ok(
    chipB.props["data-measurement-wearer-chip-progress"]?.startsWith("0/"),
    `expected Ada progress to start with 0/, got ${chipB.props["data-measurement-wearer-chip-progress"]}`,
  );

  const onChangeCountBeforeSwitch = api.getOnChangeCalls().length;

  // Switch to Wearer B (Ada) via wearer chip.
  act(() => {
    chipB.props.onClick();
  });
  assert.equal(api.getActiveWearerId(), wearerBId);
  assert.equal(
    api.getOnChangeCalls().length,
    onChangeCountBeforeSwitch,
    "switching wearers must not fire a stale onChange against the newly selected wearer",
  );

  // Sticky banner immediately updates to Ada and her assigned garment.
  const bannerForB = renderer.root.findByProps({
    "data-measurement-active-wearer-banner": "true",
  });
  assert.match(textOf(bannerForB), /Measuring for Ada/);
  assert.match(textOf(bannerForB), /Additional Shirt/);
  assert.equal(textOf(bannerForB).includes("Standard Trouser"), false);

  // ALL of Wearer B's fields must be completely empty (zero bleed from Wearer A).
  const adaInputs = renderer.root
    .findAllByProps({ "data-measurement-section": "required" })
    .flatMap((section) =>
      section.findAll((node) => node.type === "input" && node.props?.type === "number"),
    );
  assert.ok(adaInputs.length >= 4, "Ada should have required numeric measurement inputs");
  for (const input of adaInputs) {
    assert.equal(input.props.value, "", "every field on Wearer B must start empty");
  }
  assert.equal(findFieldInput(renderer, "total_height")?.props.value, "");
  assert.equal(findFieldInput(renderer, "chest_bust_circumference")?.props.value, "");
  assert.equal(findFieldInput(renderer, "shoulder_length")?.props.value, "");
  assert.equal(findFieldInput(renderer, "shirt_length_standard")?.props.value, "");

  // Enter distinct measurements for Wearer B (Ada).
  act(() => {
    findFieldInput(renderer, "total_height")!.props.onChange({ target: { value: "165" } });
  });
  act(() => {
    findFieldInput(renderer, "chest_bust_circumference")!.props.onChange({
      target: { value: "90" },
    });
  });
  act(() => {
    findFieldInput(renderer, "shirt_length_standard")!.props.onChange({
      target: { value: "62" },
    });
  });

  // Switch back to Wearer A (Chidi) and verify Wearer A's exact values remain intact!
  act(() => {
    renderer.root.findByProps({ "data-measurement-wearer-chip": wearerAId }).props.onClick();
  });
  assert.equal(api.getActiveWearerId(), wearerAId);
  assert.equal(findFieldInput(renderer, "total_height")?.props.value, 182);
  assert.equal(findFieldInput(renderer, "chest_bust_circumference")?.props.value, 104);
  assert.equal(findFieldInput(renderer, "shoulder_length")?.props.value, 46);
  // Switch back to Chidi's shirt garment chip to verify Chidi's shirt length is intact.
  act(() => {
    renderer.root.findByProps({ "data-measurement-garment": "base:shirt" }).props.onClick();
  });
  assert.equal(findFieldInput(renderer, "shirt_length_standard")?.props.value, 74);

  // Verify Wearer B's stored values in wearerOrder remain untouched.
  const storedAda = api.getOrder().wearers.find((wearer) => wearer.wearerId === wearerBId)!;
  assert.equal(storedAda.measurement.entered.shared.total_height?.valueCm, 165);
  assert.equal(storedAda.measurement.entered.shared.chest_bust_circumference?.valueCm, 90);
  assert.equal(
    storedAda.measurement.entered.byGarmentKey["additional:shirt:1"]?.shirt_length_standard
      ?.valueCm,
    62,
  );

  // -------------------------------------------------------------------------
  // 5. Explicit, undoable "Copy body measurements from..."
  //    Copies ONLY shared body fields, leaves garment-specific entries isolated,
  //    and restores prior values cleanly on Undo.
  // -------------------------------------------------------------------------
  // Switch to Ada; Ada currently has total_height=165, chest=90, waist=undefined,
  // and garment-specific additional:shirt:1 shirt_length_standard=62.
  act(() => {
    renderer.root.findByProps({ "data-measurement-wearer-chip": wearerBId }).props.onClick();
  });

  // Copy button should offer copying from Chidi.
  const copyTrigger = renderer.root.findByProps({
    "data-measurement-copy-trigger": wearerAId,
  });
  assert.match(textOf(copyTrigger), /Copy body measurements from Chidi/);

  // Clicking the trigger opens confirmation step (does NOT copy yet!).
  act(() => {
    copyTrigger.props.onClick();
  });
  const confirmPanel = renderer.root.findByProps({
    "data-measurement-copy-confirmation": "true",
  });
  assert.match(textOf(confirmPanel), /Copy 3 shared body measurements from Chidi to Ada/);
  assert.equal(
    findFieldInput(renderer, "total_height")?.props.value,
    165,
    "values must not change before confirming copy",
  );

  // Confirm copy!
  act(() => {
    renderer.root
      .findByProps({ "data-measurement-copy-confirm": "true" })
      .props.onClick();
  });

  // Shared body fields are copied from Chidi to Ada.
  assert.equal(findFieldInput(renderer, "total_height")?.props.value, 182);
  assert.equal(findFieldInput(renderer, "chest_bust_circumference")?.props.value, 104);
  assert.equal(findFieldInput(renderer, "shoulder_length")?.props.value, 46);
  // Garment-specific field on Ada MUST stay isolated at 62 (never overwritten by Chidi's 74)!
  assert.equal(
    findFieldInput(renderer, "shirt_length_standard")?.props.value,
    62,
    "Copy body measurements must NEVER overwrite garment-specific overrides",
  );

  // Undo banner is visible and one-click Undo restores Ada's exact prior snapshot!
  const undoBanner = renderer.root.findByProps({
    "data-measurement-copy-undo-banner": "true",
  });
  assert.match(textOf(undoBanner), /Copied 3 shared body measurements from Chidi to Ada/);

  act(() => {
    renderer.root.findByProps({ "data-measurement-copy-undo": "true" }).props.onClick();
  });
  assert.equal(findFieldInput(renderer, "total_height")?.props.value, 165);
  assert.equal(findFieldInput(renderer, "chest_bust_circumference")?.props.value, 90);
  assert.equal(findFieldInput(renderer, "shoulder_length")?.props.value, "");
  assert.equal(findFieldInput(renderer, "shirt_length_standard")?.props.value, 62);
  assert.equal(
    renderer.root.findAllByProps({ "data-measurement-copy-undo-banner": "true" }).length,
    0,
    "undo banner clears after Undo",
  );

  // Chidi's own measurements were never mutated during copy or undo.
  const storedChidiAfterCopy = api
    .getOrder()
    .wearers.find((wearer) => wearer.wearerId === wearerAId)!;
  assert.equal(storedChidiAfterCopy.measurement.entered.shared.total_height?.valueCm, 182);
  assert.equal(
    storedChidiAfterCopy.measurement.entered.byGarmentKey["base:shirt"]?.shirt_length_standard
      ?.valueCm,
    74,
  );

  // -------------------------------------------------------------------------
  // 4. Draft serialization & restore round-trip preserves distinct per-wearer
  //    measurements accurately
  // -------------------------------------------------------------------------
  const serializedOrder = canonicalizeWearerOrderNames(api.getOrder());
  const draftPayload: GuestDesignDraft = {
    journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
    currentStageId: "measurement",
    currentStep: 7,
    garmentTypeSelection: studioSelection,
    selectedFabricCode: null,
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: { accessories: [] },
    measurements: {} as GuestDesignDraft["measurements"],
    futureMeasurementState: serializedOrder,
    resumeLocus: createDesignStudioResumeLocus({
      activeWearerId: wearerBId,
      measurementGarmentKey: "additional:shirt:1",
      scrollY: 120,
    }),
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: {
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      countryCode: "",
    },
    pickupTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    batchType: "community",
    customGroupCode: "",
    garmentPieceCount: physicalGarments.length,
    specialInstructions: "",
    leftoverFabricChoice: "",
    hasLining: false,
    pricingBreakdown: { customDetailsPrice: 0, eindhovenToDestinationShipping: null },
    shippingSnapshot: {},
    updatedAt: "2026-11-19T12:00:00.000Z",
  };
  const roundTrippedDraft = normalizeGuestDesignDraft(
    JSON.parse(JSON.stringify(draftPayload)) as GuestDesignDraft,
  );
  const hydrated = classifyPersistedMeasurement({
    value: roundTrippedDraft.futureMeasurementState,
    garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "male",
  });
  assert.equal(hydrated.status, "valid");
  if (hydrated.status !== "valid") throw new Error("expected valid hydrated wearer order");
  const restoredLocus = resolveDesignStudioResumeLocus({
    locus: roundTrippedDraft.resumeLocus,
    wearerIds: hydrated.order.wearers.map((wearer) => wearer.wearerId),
    garmentKeys: physicalGarments.map((garment) => garment.garmentKey),
  });
  assert.equal(restoredLocus.activeWearerId, wearerBId);
  assert.equal(restoredLocus.measurementGarmentKey, "additional:shirt:1");

  const restoredChidi = hydrated.order.wearers.find((wearer) => wearer.wearerId === wearerAId)!;
  const restoredAda = hydrated.order.wearers.find((wearer) => wearer.wearerId === wearerBId)!;
  assert.equal(restoredChidi.measurement.entered.shared.total_height?.valueCm, 182);
  assert.equal(restoredChidi.measurement.entered.shared.chest_bust_circumference?.valueCm, 104);
  assert.equal(
    restoredChidi.measurement.entered.byGarmentKey["base:shirt"]?.shirt_length_standard?.valueCm,
    74,
  );
  assert.equal(restoredAda.measurement.entered.shared.total_height?.valueCm, 165);
  assert.equal(restoredAda.measurement.entered.shared.chest_bust_circumference?.valueCm, 90);
  assert.equal(
    restoredAda.measurement.entered.byGarmentKey["additional:shirt:1"]?.shirt_length_standard
      ?.valueCm,
    62,
  );

  // -------------------------------------------------------------------------
  // 3. Reassigning garments, adding-then-selecting a new wearer, deleting the
  //    active wearer, and collapsing to solo never copy or overwrite another
  //    wearer's measurements.
  // -------------------------------------------------------------------------

  // 3a. Reassigning base:shirt from Chidi to Ada strips base:shirt from Chidi
  //     and does NOT carry over Chidi's shirt_length_standard (74) onto Ada.
  act(() => {
    api.assignGarment("base:shirt", wearerBId);
  });
  const chidiAfterReassign = api
    .getOrder()
    .wearers.find((wearer) => wearer.wearerId === wearerAId)!;
  const adaAfterReassign = api
    .getOrder()
    .wearers.find((wearer) => wearer.wearerId === wearerBId)!;
  assert.equal(chidiAfterReassign.measurement.entered.byGarmentKey["base:shirt"], undefined);
  assert.equal(adaAfterReassign.measurement.entered.byGarmentKey["base:shirt"], undefined);
  assert.equal(chidiAfterReassign.measurement.entered.shared.total_height?.valueCm, 182);
  assert.equal(adaAfterReassign.measurement.entered.shared.total_height?.valueCm, 165);

  // Even if Ada had stale byGarmentKey["base:shirt"] from an earlier state,
  // reassigning base:shirt to Ada strips any stale entry on the new assignee.
  const withStaleTargetEntry = updateWearerMeasurement(
    api.getOrder(),
    wearerAId,
    (() => {
      const m = structuredClone(chidiAfterReassign.measurement);
      m.entered.byGarmentKey["base:shirt"] = {
        shirt_length_standard: { valueCm: 99, provenance: "customer_entered" },
      };
      return m;
    })(),
  );
  const reassignedBack = assignGarmentToWearer({
    order: withStaleTargetEntry,
    garmentKey: "base:shirt",
    wearerId: wearerAId,
    garment: physicalGarments[0]!,
    garmentTypeSelection: studioSelection,
    additionalGarmentConstructions,
  });
  assert.equal(reassignedBack.status, "updated");
  if (reassignedBack.status === "updated") {
    const chidiBack = reassignedBack.order.wearers.find(
      (wearer) => wearer.wearerId === wearerAId,
    )!;
    assert.equal(
      chidiBack.measurement.entered.byGarmentKey["base:shirt"],
      undefined,
      "reassignment clears stale byGarmentKey entries on the new assignee",
    );
  }

  // 3b. Adding a 3rd person ("Bola") selects Bola immediately and starts Bola empty
  //     without overwriting Chidi or Ada.
  let bolaId: string | null = null;
  act(() => {
    bolaId = api.addAndSelectWearer("Bola");
  });
  assert.ok(bolaId, "new wearer Bola should have a real wearerId");
  assert.equal(api.getActiveWearerId(), bolaId);
  const storedBola = api.getOrder().wearers.find((wearer) => wearer.wearerId === bolaId)!;
  assert.deepEqual(storedBola.measurement.entered.shared, {});
  assert.deepEqual(storedBola.measurement.entered.byGarmentKey, {});
  assert.equal(
    api.getOrder().wearers.find((wearer) => wearer.wearerId === wearerAId)!.measurement.entered
      .shared.total_height?.valueCm,
    182,
  );
  assert.equal(
    api.getOrder().wearers.find((wearer) => wearer.wearerId === wearerBId)!.measurement.entered
      .shared.total_height?.valueCm,
    165,
  );

  // 3c. Deleting the active wearer (Bola, who owns no garments) switches active
  //     wearer cleanly to Chidi and preserves Chidi & Ada's distinct measurements.
  act(() => {
    api.deleteActiveWearer();
  });
  assert.equal(api.getActiveWearerId(), wearerAId);
  assert.equal(
    api.getOrder().wearers.find((wearer) => wearer.wearerId === wearerAId)!.measurement.entered
      .shared.total_height?.valueCm,
    182,
  );
  assert.equal(
    api.getOrder().wearers.find((wearer) => wearer.wearerId === wearerBId)!.measurement.entered
      .shared.total_height?.valueCm,
    165,
  );

  // 3d. Collapsing to solo while Ada is active selects Chidi (sole wearer) and
  //     NEVER stamps Ada's measurements onto Chidi!
  act(() => {
    api.selectWearer(wearerBId);
  });
  assert.equal(api.getActiveWearerId(), wearerBId);
  act(() => {
    api.collapseToSolo();
  });
  assert.equal(api.getOrder().wearers.length, 1);
  assert.equal(api.getActiveWearerId(), wearerAId);
  assert.equal(
    api.getOrder().wearers[0]!.measurement.entered.shared.total_height?.valueCm,
    182,
    "collapsing to solo while another wearer was active must keep sole wearer's own measurements",
  );
  assert.equal(
    api.getOrder().wearers[0]!.measurement.entered.shared.chest_bust_circumference?.valueCm,
    104,
  );

  act(() => renderer.unmount());
}

console.log("PASS: per-wearer measurement isolation, atomic switching, copy+undo, and UX");
