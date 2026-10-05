import assert from "node:assert/strict";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type { GarmentTypeStepSelection, WearerOrderStateV2 } from "./src/types";
import type { MeasurementPhysicalGarment } from "./src/utils/measurementBlueprint";
import {
  addWearer,
  assignGarmentToWearer,
  deleteWearer,
  reconcileWearerOrder,
  renameWearer,
  createEmptyWearerOrder,
  resolveWearerAssignmentPresentation,
  wearerAssignmentLabel,
} from "./src/utils/wearerOrder";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children.map((child) => textContent(child as ReactTestInstance | string)).join("");

const selection = (): GarmentTypeStepSelection => ({
  garmentTypes: ["shirt"],
  demographic: "female",
  constructionByGarment: {
    shirt: {
      status: "resolved",
      garmentType: "shirt",
      components: [{
        componentKey: "shirt:shirt_construction:shirt_std_short",
        optionId: "shirt_std_short",
        selectionGroup: "shirt_construction",
        priceCents: 1,
        price: 0.01,
      }],
      totalPriceCents: 1,
      totalPrice: 0.01,
    },
  },
});

const garments: MeasurementPhysicalGarment[] = [
  { garmentKey: "base:shirt", garmentType: "shirt" },
  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
];

const youOrder = reconcileWearerOrder({
  order: createEmptyWearerOrder(),
  garmentKeys: garments.map((garment) => garment.garmentKey),
  compatibilityDemographic: "female",
  garments,
  garmentTypeSelection: selection(),
});
const added = addWearer({
  order: youOrder,
  physicalGarmentCount: garments.length,
  displayName: "Amaka",
  fitContext: "female",
});
if (added.status !== "updated") throw new Error("expected Amaka");
const youId = youOrder.wearers[0].wearerId;
const amaka = added.order.wearers.find((wearer) => wearer.displayName === "Amaka");
if (!amaka) throw new Error("expected Amaka profile");
const assigned = assignGarmentToWearer({
  order: added.order,
  garmentKey: "additional:shirt:1",
  wearerId: amaka.wearerId,
  garment: garments[1],
  garmentTypeSelection: selection(),
});
if (assigned.status !== "updated") throw new Error("expected dress assignment");
const initialOrder: WearerOrderStateV2 = {
  ...assigned.order,
  wearers: assigned.order.wearers.map((wearer) => {
    if (wearer.wearerId !== amaka.wearerId) return wearer;
    const measurement = structuredClone(wearer.measurement);
    measurement.entered.shared.total_height = {
      valueCm: 170,
      provenance: "customer_entered",
    };
    return { ...wearer, measurement };
  }),
};

let latestOrder = initialOrder;

const PanelHarness = () => {
  const [order, setOrder] = useState(initialOrder);
  const publish = (next: WearerOrderStateV2) => {
    latestOrder = next;
    setOrder(next);
  };
  return (
    <WearerAssignmentPanel
      order={order}
      activeWearerId={youId}
      garments={garments}
      garmentLabels={{
        "base:shirt": "Standard Shirt",
        "additional:shirt:1": "Standard Shirt",
      }}
      onSelectWearer={() => {}}
      onAddWearer={() => {}}
      onRenameWearer={() => {}}
      onReorderWearers={() => {}}
      onSetFitContext={() => {}}
      onDeleteWearer={(wearerId) => {
        const result = deleteWearer(order, wearerId);
        if (result.status === "updated") publish(result.order);
        return result;
      }}
      onAssignGarment={(garmentKey, wearerId) => {
        const garment = garments.find((item) => item.garmentKey === garmentKey);
        if (!garment || !wearerId) {
          return { status: "blocked", code: "WEARER_NOT_FOUND", order };
        }
        const result = assignGarmentToWearer({
          order,
          garmentKey,
          wearerId,
          garment,
          garmentTypeSelection: selection(),
        });
        if (result.status === "updated") publish(result.order);
        return result;
      }}
    />
  );
};

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(<PanelHarness />);
});

const removeButtonFor = (displayName: string) => {
  const article = renderer.root.findAllByType("article").find((candidate) =>
    candidate.findAllByType("input").some((input) => input.props.value === displayName),
  );
  const button = article
    ?.findAllByType("button")
    .find((candidate) => textContent(candidate) === "Remove person");
  if (!button) throw new Error(`expected remove control for ${displayName}`);
  return button;
};

const beforeReject = structuredClone(latestOrder);
await act(async () => {
  removeButtonFor("Amaka").props.onClick();
});
const rejection = renderer.root.findByProps({ role: "alert" });
assert.match(textContent(rejection), /Cannot remove Amaka yet/);
assert.match(textContent(rejection), /Reassign their garments/);
assert.deepEqual(latestOrder, beforeReject);
assert.equal(latestOrder.assignmentByGarmentKey["additional:shirt:1"], amaka.wearerId);
assert.equal(
  latestOrder.wearers.find((wearer) => wearer.wearerId === amaka.wearerId)
    ?.measurement.entered.shared.total_height?.valueCm,
  170,
);

const amakaShirtSelect = renderer.root
  .findAllByType("select")
  .find((select) => select.props.value === amaka.wearerId);
if (!amakaShirtSelect) throw new Error("expected Amaka garment select");
await act(async () => {
  amakaShirtSelect.props.onChange({ currentTarget: { value: youId } });
});
assert.equal(latestOrder.assignmentByGarmentKey["additional:shirt:1"], youId);
assert.ok(latestOrder.wearers.some((wearer) => wearer.wearerId === amaka.wearerId));

await act(async () => {
  removeButtonFor("Amaka").props.onClick();
});
assert.equal(
  latestOrder.wearers.some((wearer) => wearer.wearerId === amaka.wearerId),
  false,
);
assert.equal(renderer.root.findAllByProps({ role: "alert" }).length, 0);
assert.equal(latestOrder.assignmentByGarmentKey["additional:shirt:1"], youId);

console.log("PASS: wearer assignment panel blocks occupied removal");

const selectFor = (root: ReactTestInstance, label: string) => {
  const select = root.findAllByType("select").find(
    (candidate) => candidate.props["aria-label"] === `Wearer for ${label}`,
  );
  if (!select) throw new Error(`expected select for ${label}`);
  return select;
};

const optionValues = (select: ReactTestInstance) =>
  select.findAllByType("option").map((option) => option.props.value);

const placeholderOption = (select: ReactTestInstance) => {
  const option = select.findAllByType("option")[0];
  if (!option) throw new Error("expected Choose a person option");
  return option;
};

const alerts = (root: ReactTestInstance) =>
  root.findAllByProps({ role: "alert" }).map((node) => textContent(node));

{
  const shirtGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "base:dress", garmentType: "dress" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const fitted = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: shirtGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: shirtGarments,
    garmentTypeSelection: selection(),
  });
  const withAmaka = addWearer({
    order: fitted,
    physicalGarmentCount: shirtGarments.length,
    displayName: "Amaka",
    fitContext: "female",
  });
  if (withAmaka.status !== "updated") throw new Error("expected Amaka");
  const you = withAmaka.order.wearers.find((wearer) => wearer.displayName === "");
  const amakaWearer = withAmaka.order.wearers.find((wearer) => wearer.displayName === "Amaka");
  if (!you || !amakaWearer) throw new Error("expected You and Amaka");
  const openingAssignment = { ...withAmaka.order.assignmentByGarmentKey };
  delete openingAssignment["additional:shirt:1"];
  let authority: WearerOrderStateV2 = {
    ...withAmaka.order,
    assignmentByGarmentKey: openingAssignment,
  };
  const publishAuthority = (next: WearerOrderStateV2) => {
    authority = next;
  };
  const AssignmentHarness = () => {
    const [order, setOrder] = useState(authority);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={you.wearerId}
        garments={shirtGarments}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "base:dress": "Standard Dress",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          const result = addWearer({
            order,
            physicalGarmentCount: shirtGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") {
            publishAuthority(result.order);
            setOrder(result.order);
          }
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") {
            publishAuthority(result.order);
            setOrder(result.order);
          }
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={(garmentKey, wearerId) => {
          const garment = shirtGarments.find((item) => item.garmentKey === garmentKey);
          if (!garment) {
            return { status: "blocked", code: "WEARER_NOT_FOUND", order };
          }
          const result = assignGarmentToWearer({
            order,
            garmentKey,
            wearerId,
            garment,
            garmentTypeSelection: selection(),
          });
          if (result.status === "updated") {
            publishAuthority(result.order);
            setOrder(result.order);
          }
          return result;
        }}
      />
    );
  };
  let assignmentRenderer!: ReturnType<typeof create>;
  await act(async () => {
    assignmentRenderer = create(<AssignmentHarness />);
  });
  const body = textContent(assignmentRenderer.root);
  assert.match(body, /1\. Add people/);
  assert.match(body, /Name or nickname/);
  assert.match(body, /Fit for measurements/);
  assert.match(body, /2\. Assign garments/);
  assert.match(body, /Choose who will wear each garment/);
  const addButton = assignmentRenderer.root.findAllByType("button").find(
    (button) => textContent(button) === "+ Add another person",
  );
  if (!addButton || addButton.props.type !== "button") {
    throw new Error("expected Add another person button");
  }
  const shirtSelect = selectFor(assignmentRenderer.root, "Standard Shirt");
  const dressSelect = selectFor(assignmentRenderer.root, "Standard Dress");
  const repeatSelect = selectFor(assignmentRenderer.root, "Standard Shirt 2");
  assert.equal(repeatSelect.props.value, "");
  assert.equal(textContent(placeholderOption(repeatSelect)), "Choose a person");
  assert.equal(placeholderOption(repeatSelect).props.disabled, true);
  assert.equal(placeholderOption(shirtSelect).props.disabled, true);
  assert.deepEqual(optionValues(shirtSelect).slice(1), [you.wearerId, amakaWearer.wearerId]);
  assert.equal(optionValues(shirtSelect).includes("You"), false);
  assert.equal(optionValues(shirtSelect).includes("Amaka"), false);

  await act(async () => {
    shirtSelect.props.onChange({ currentTarget: { value: you.wearerId } });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, you.wearerId);
  assert.equal(
    placeholderOption(selectFor(assignmentRenderer.root, "Standard Shirt")).props.disabled,
    true,
  );
  await act(async () => {
    selectFor(assignmentRenderer.root, "Standard Shirt").props.onChange({
      currentTarget: { value: "" },
    });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, you.wearerId);

  await act(async () => {
    selectFor(assignmentRenderer.root, "Standard Shirt").props.onChange({
      currentTarget: { value: amakaWearer.wearerId },
    });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Dress").props.value, dressSelect.props.value);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt 2").props.value, "");
  await act(async () => {
    selectFor(assignmentRenderer.root, "Standard Shirt").props.onChange({
      currentTarget: { value: you.wearerId },
    });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);

  await act(async () => {
    selectFor(assignmentRenderer.root, "Standard Dress").props.onChange({
      currentTarget: { value: amakaWearer.wearerId },
    });
  });
  assert.equal(authority.assignmentByGarmentKey["base:dress"], amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Dress").props.value, amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, you.wearerId);

  await act(async () => {
    assignmentRenderer.update(<AssignmentHarness />);
  });
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, you.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Dress").props.value, amakaWearer.wearerId);

  const beforeRename = authority.assignmentByGarmentKey["base:shirt"];
  const amakaName = assignmentRenderer.root.findByProps({
    "aria-label": "Name or nickname for Amaka",
  });
  await act(async () => {
    amakaName.props.onChange({ currentTarget: { value: "Amaka Obi" } });
  });
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, beforeRename);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Dress").props.value, amakaWearer.wearerId);

  await act(async () => {
    selectFor(assignmentRenderer.root, "Standard Shirt 2").props.onChange({
      currentTarget: { value: amakaWearer.wearerId },
    });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(authority.assignmentByGarmentKey["additional:shirt:1"], amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt").props.value, you.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Shirt 2").props.value, amakaWearer.wearerId);
  assert.equal(selectFor(assignmentRenderer.root, "Standard Dress").props.value, amakaWearer.wearerId);
  assert.equal(textContent(assignmentRenderer.root).includes("Assign all garments to continue."), false);

  const dressSelection = (): GarmentTypeStepSelection => ({
    ...selection(),
    garmentTypes: ["shirt", "dress"],
    constructionByGarment: {
      ...selection().constructionByGarment,
      dress: {
        status: "resolved",
        garmentType: "dress",
        components: [{
          componentKey: "dress:dress_construction:dress_std_short",
          optionId: "dress_std_short",
          selectionGroup: "dress_construction",
          priceCents: 1,
          price: 0.01,
        }],
        totalPriceCents: 1,
        totalPrice: 0.01,
      },
    },
  });
  const maleFriend = addWearer({
    order: authority,
    physicalGarmentCount: shirtGarments.length,
    displayName: "Chike",
    fitContext: "male",
  });
  if (maleFriend.status !== "updated") throw new Error("expected Chike");
  const chike = maleFriend.order.wearers.find((wearer) => wearer.displayName === "Chike");
  if (!chike) throw new Error("expected Chike");
  const beforeRejectAssign = structuredClone(authority);
  const rejected = assignGarmentToWearer({
    order: maleFriend.order,
    garmentKey: "base:dress",
    wearerId: chike.wearerId,
    garment: shirtGarments[1],
    garmentTypeSelection: dressSelection(),
  });
  assert.equal(rejected.status, "blocked");
  if (rejected.status === "blocked") {
    assert.equal(rejected.code, "GARMENT_INELIGIBLE_FOR_WEARER");
  }
  assert.deepEqual(authority.assignmentByGarmentKey, beforeRejectAssign.assignmentByGarmentKey);

  const unfitted = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: null,
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection(),
  });
  const missingFit = assignGarmentToWearer({
    order: unfitted,
    garmentKey: "base:shirt",
    wearerId: unfitted.wearers[0].wearerId,
    garment: { garmentKey: "base:shirt", garmentType: "shirt" },
    garmentTypeSelection: selection(),
  });
  assert.equal(missingFit.status, "blocked");
  if (missingFit.status === "blocked") assert.equal(missingFit.code, "WEARER_FIT_REQUIRED");
  assert.equal(missingFit.order.assignmentByGarmentKey["base:shirt"], undefined);

  const RejectionHarness = ({
    initial,
    garmentsForPanel,
    garmentTypeSelection,
  }: {
    initial: WearerOrderStateV2;
    garmentsForPanel: MeasurementPhysicalGarment[];
    garmentTypeSelection: GarmentTypeStepSelection;
  }) => {
    const [order, setOrder] = useState(initial);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={initial.wearers[0]?.wearerId || null}
        garments={garmentsForPanel}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "base:dress": "Standard Dress",
        }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") setOrder(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={(garmentKey, wearerId) => {
          const garment = garmentsForPanel.find((item) => item.garmentKey === garmentKey);
          if (!garment) return { status: "blocked", code: "WEARER_NOT_FOUND", order };
          const result = assignGarmentToWearer({
            order,
            garmentKey,
            wearerId,
            garment,
            garmentTypeSelection,
          });
          if (result.status === "updated") setOrder(result.order);
          return result;
        }}
      />
    );
  };
  let rejectionRenderer!: ReturnType<typeof create>;
  await act(async () => {
    rejectionRenderer = create(
      <RejectionHarness
        initial={maleFriend.order}
        garmentsForPanel={shirtGarments}
        garmentTypeSelection={dressSelection()}
      />,
    );
  });
  const ownedDress = maleFriend.order.assignmentByGarmentKey["base:dress"];
  await act(async () => {
    selectFor(rejectionRenderer.root, "Standard Dress").props.onChange({
      currentTarget: { value: chike.wearerId },
    });
  });
  assert.equal(
    selectFor(rejectionRenderer.root, "Standard Dress").props.value,
    ownedDress || "",
  );
  assert.match(
    alerts(rejectionRenderer.root).join(" "),
    /This garment is not available for Chike's selected fit/,
  );
  await act(async () => {
    selectFor(rejectionRenderer.root, "Standard Dress").props.onChange({
      currentTarget: { value: ownedDress },
    });
  });
  assert.equal(selectFor(rejectionRenderer.root, "Standard Dress").props.value, ownedDress);
  assert.equal(
    alerts(rejectionRenderer.root).some((alert) => alert.includes("not available")),
    false,
  );
  await act(async () => {
    selectFor(rejectionRenderer.root, "Standard Dress").props.onChange({
      currentTarget: { value: chike.wearerId },
    });
  });
  assert.match(
    alerts(rejectionRenderer.root).join(" "),
    /This garment is not available for Chike's selected fit/,
  );
  const chikeName = rejectionRenderer.root.findByProps({
    "aria-label": "Name or nickname for Chike",
  });
  await act(async () => {
    chikeName.props.onChange({ currentTarget: { value: "Chief" } });
  });
  const rejectionText = alerts(rejectionRenderer.root).join(" ");
  assert.match(rejectionText, /This garment is not available for Chief's selected fit/);
  assert.equal(rejectionText.includes("Chike"), false);

  let missingFitRenderer!: ReturnType<typeof create>;
  await act(async () => {
    missingFitRenderer = create(
      <RejectionHarness
        initial={unfitted}
        garmentsForPanel={[{ garmentKey: "base:shirt", garmentType: "shirt" }]}
        garmentTypeSelection={selection()}
      />,
    );
  });
  const missingFitBody = textContent(missingFitRenderer.root);
  assert.equal(
    missingFitRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length,
    1,
    "solo null-fit stays on first screen; fit is chosen in the measurement card",
  );
  assert.equal(missingFitBody.includes("Select a fit for You before assigning garments"), false);
  assert.equal(missingFitBody.includes("2. Assign garments"), false);
  assert.equal(missingFitBody.includes("Assign all garments to continue"), false);

  const reconciled = reconcileWearerOrder({
    order: authority,
    garmentKeys: shirtGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: shirtGarments,
    garmentTypeSelection: selection(),
  });
  assert.equal(reconciled.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(reconciled.assignmentByGarmentKey["base:dress"], amakaWearer.wearerId);
  assert.equal(reconciled.assignmentByGarmentKey["additional:shirt:1"], amakaWearer.wearerId);

  const assignmentsBeforeAdd = { ...authority.assignmentByGarmentKey };
  await act(async () => {
    addButton.props.onClick();
  });
  assert.deepEqual(authority.assignmentByGarmentKey, assignmentsBeforeAdd);
  assert.equal(
    authority.wearers.some((wearer) => wearer.displayName === "" && wearer.fitContext === null),
    true,
  );
  assert.equal(alerts(assignmentRenderer.root).some((message) => message.includes("Standard Shirt")), false);
  void dressSelect;
  void repeatSelect;
}

console.log("PASS: wearer assignment panel keeps authoritative garment ownership");

{
  assert.equal(wearerAssignmentLabel("", 0), "You");
  assert.equal(wearerAssignmentLabel("", 1), "Person 2");
  assert.equal(wearerAssignmentLabel("Amaka", 0), "Amaka");
  assert.equal(
    resolveWearerAssignmentPresentation({
      wearerCount: 1,
      soleWearerFitContext: "female",
      hasUnassignedGarments: true,
    }),
    "solo",
  );

  const soloGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const soloOrder = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: soloGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: soloGarments,
    garmentTypeSelection: selection(),
  });
  assert.equal(soloOrder.wearers.length, 1);

  let latestSolo = soloOrder;
  let addWearerCalls = 0;
  const SoloHarness = () => {
    const [order, setOrder] = useState(latestSolo);
    return (
      <WearerAssignmentPanel
        order={order}
        presentation="solo"
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={soloGarments}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          addWearerCalls += 1;
          const result = addWearer({
            order,
            physicalGarmentCount: soloGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") {
            latestSolo = result.order;
            setOrder(result.order);
          }
        }}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => {
          const result = deleteWearer(order, wearerId);
          if (result.status === "updated") {
            latestSolo = result.order;
            setOrder(result.order);
          }
          return result;
        }}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
      />
    );
  };

  let soloRenderer!: ReturnType<typeof create>;
  await act(async () => {
    soloRenderer = create(<SoloHarness />);
  });
  const soloBody = textContent(soloRenderer.root);
  assert.match(
    soloBody,
    /These clothes are for you\. Add another person if you are ordering for someone else\./,
  );
  assert.equal(soloBody.includes("1. Add people"), false);
  assert.equal(soloBody.includes("Person 1"), false);
  assert.equal(soloBody.includes("Male fit"), false);
  assert.equal(soloBody.includes("Female fit"), false);
  assert.equal(soloBody.includes("Fit for measurements"), false);
  assert.equal(soloRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  const addPeople = soloRenderer.root.findByProps({ "data-wearer-add-people": "true" });
  assert.equal(textContent(addPeople), "Add people");
  assert.equal(addWearerCalls, 0);
  assert.equal(latestSolo.wearers.length, 1);

  await act(async () => {
    addPeople.props.onClick();
  });
  assert.equal(addWearerCalls, 0, "expand must not create a person");
  assert.equal(latestSolo.wearers.length, 1);
  const expandedBody = textContent(soloRenderer.root);
  assert.match(
    expandedBody,
    /These clothes are for you\. Add another person if you are ordering for someone else\./,
  );
  assert.match(expandedBody, /1\. Add people/);
  assert.match(expandedBody, /Fit for measurements/);
  assert.match(expandedBody, /Male fit/);
  assert.equal(expandedBody.includes("Person 1"), false);
  const youNameInput = soloRenderer.root.findByProps({
    "aria-label": "Name or nickname for You",
  });
  assert.equal(youNameInput.props.placeholder, "You");
  assert.equal(
    expandedBody.includes("2. Assign garments"),
    false,
    "Assign garments stays hidden until a second person exists",
  );
  assert.equal(soloRenderer.root.findAllByProps({ "data-wearer-people": "true" }).length, 1);

  const addAnother = soloRenderer.root.findByProps({ "data-wearer-add-another": "true" });
  await act(async () => {
    addAnother.props.onClick();
  });
  assert.equal(addWearerCalls, 1);
  assert.equal(latestSolo.wearers.length, 2);
  assert.equal(
    wearerAssignmentLabel(latestSolo.wearers[1].displayName, latestSolo.wearers[1].presentationOrder),
    "Person 2",
  );
  assert.match(
    textContent(soloRenderer.root),
    /2\. Assign garments/,
    "Assign garments appears once a second person exists",
  );

  await act(async () => {
    soloRenderer.root.findByProps({ "data-wearer-only-for-me": "true" }).props.onClick();
  });
  assert.equal(latestSolo.wearers.length, 1);
  assert.equal(soloRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(textContent(soloRenderer.root).includes("1. Add people"), false);
  assert.equal(textContent(soloRenderer.root).includes("2. Assign garments"), false);
}

console.log("PASS: wearer assignment panel solo-first people UX");

{
  const unfittedSolo = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt", "additional:shirt:1"],
    compatibilityDemographic: null,
    garments: [
      { garmentKey: "base:shirt", garmentType: "shirt" },
      { garmentKey: "additional:shirt:1", garmentType: "shirt" },
    ],
    garmentTypeSelection: selection(),
  });
  assert.equal(unfittedSolo.wearers[0]?.fitContext ?? null, null);
  let fitFirstRenderer!: ReturnType<typeof create>;
  await act(async () => {
    fitFirstRenderer = create(
      <WearerAssignmentPanel
        order={unfittedSolo}
        presentation="fit"
        activeWearerId={unfittedSolo.wearers[0]?.wearerId || null}
        garments={[
          { garmentKey: "base:shirt", garmentType: "shirt" },
          { garmentKey: "additional:shirt:1", garmentType: "shirt" },
        ]}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(unfittedSolo, wearerId)}
        onAssignGarment={() => ({
          status: "blocked",
          code: "WEARER_NOT_FOUND",
          order: unfittedSolo,
        })}
      />,
    );
  });
  const fitFirstBody = textContent(fitFirstRenderer.root);
  assert.match(
    fitFirstBody,
    /These clothes are for you\. Add another person if you are ordering for someone else\./,
  );
  assert.equal(fitFirstBody.includes("Male fit"), false);
  assert.equal(fitFirstBody.includes("Female fit"), false);
  assert.equal(fitFirstBody.includes("Fit for measurements"), false);
  assert.equal(fitFirstRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
}

console.log("PASS: wearer assignment panel hides fit on first screen");

{
  const collapseGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const collapseOrder = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: collapseGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: collapseGarments,
    garmentTypeSelection: selection(),
  });
  let collapseCalls = 0;
  const CollapseHarness = () => {
    const [order, setOrder] = useState(collapseOrder);
    return (
      <WearerAssignmentPanel
        order={order}
        presentation="solo"
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={collapseGarments}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          const result = addWearer({
            order,
            physicalGarmentCount: collapseGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") setOrder(result.order);
        }}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => {
          const result = deleteWearer(order, wearerId);
          if (result.status === "updated") setOrder(result.order);
          return result;
        }}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
        onCollapseToSolo={() => {
          collapseCalls += 1;
        }}
      />
    );
  };
  let collapseRenderer!: ReturnType<typeof create>;
  await act(async () => {
    collapseRenderer = create(<CollapseHarness />);
  });
  await act(async () => {
    collapseRenderer.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  await act(async () => {
    collapseRenderer.root.findByProps({ "data-wearer-only-for-me": "true" }).props.onClick();
  });
  assert.equal(collapseCalls, 1, "Only for me must notify Design Studio to reconcile solo assignments");
  assert.equal(collapseRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
}

console.log("PASS: wearer assignment panel Only for me collapse reconciles");

{
  const defaultSoloOrder = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection(),
  });
  let defaultRenderer!: ReturnType<typeof create>;
  await act(async () => {
    defaultRenderer = create(
      <WearerAssignmentPanel
        order={defaultSoloOrder}
        activeWearerId={defaultSoloOrder.wearers[0]?.wearerId || null}
        garments={[{ garmentKey: "base:shirt", garmentType: "shirt" }]}
        garmentLabels={{ "base:shirt": "Standard Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(defaultSoloOrder, wearerId)}
        onAssignGarment={() => ({
          status: "blocked",
          code: "WEARER_NOT_FOUND",
          order: defaultSoloOrder,
        })}
      />,
    );
  });
  assert.equal(
    defaultRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length,
    1,
    "presentation defaults to solo",
  );
  assert.equal(
    defaultRenderer.root.findAllByProps({ "data-wearer-people": "true" }).length,
    0,
  );
}

console.log("PASS: wearer assignment panel presentation defaults to solo");
