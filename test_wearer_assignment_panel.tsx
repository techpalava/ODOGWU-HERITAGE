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
  hasUnassignedPhysicalGarments,
  reconcileWearerOrder,
  removeGarmentFromWearerOrder,
  renameWearer,
  createEmptyWearerOrder,
  resolveWearerAssignmentPresentation,
  wearerAssignmentLabel,
  setWearerFitContext,
} from "./src/utils/wearerOrder";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Customer picks the sole fit on Measurement; Studio then reconciles (no demographic inference). */
const reconcileWithChosenSoleFit = (
  input: Parameters<typeof reconcileWearerOrder>[0],
  fitContext: "male" | "female",
) => {
  const first = reconcileWearerOrder(input);
  const sole = first.wearers[0];
  if (first.wearers.length !== 1 || !sole || sole.fitContext !== null) return first;
  const chosen = setWearerFitContext(first, sole.wearerId, fitContext);
  if (chosen.status !== "updated") throw new Error("expected sole fit choice");
  return reconcileWearerOrder({ ...input, order: chosen.order });
};

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children.map((child) => textContent(child as ReactTestInstance | string)).join("");

const cardFor = (root: ReactTestInstance, wearerLabel: string) => {
  const card = root.findAllByType("article").find((article) =>
    article
      .findAllByType("input")
      .some((input) => input.props["aria-label"] === `Name or nickname for ${wearerLabel}`),
  );
  if (!card) throw new Error(`expected person card for ${wearerLabel}`);
  return card;
};

const garmentBox = (root: ReactTestInstance, wearerLabel: string, garmentKey: string) =>
  cardFor(root, wearerLabel).findByProps({ "data-wearer-garment-key": garmentKey });

const toggleGarment = async (root: ReactTestInstance, wearerLabel: string, garmentKey: string) => {
  const box = garmentBox(root, wearerLabel, garmentKey);
  await act(async () => {
    box.props.onChange({ currentTarget: { checked: !box.props.checked } });
  });
};

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

const youOrder = reconcileWithChosenSoleFit({
  order: createEmptyWearerOrder(),
  garmentKeys: garments.map((garment) => garment.garmentKey),
  compatibilityDemographic: "female",
  garments,
  garmentTypeSelection: selection(),
}, "female");
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

assert.equal(garmentBox(renderer.root, "Amaka", "additional:shirt:1").props.checked, true);
await toggleGarment(renderer.root, "You", "additional:shirt:1");
assert.equal(garmentBox(renderer.root, "Amaka", "additional:shirt:1").props.checked, false);
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

const alerts = (root: ReactTestInstance) =>
  root.findAllByProps({ role: "alert" }).map((node) => textContent(node));

const unassignedNoteCount = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-wearer-unassigned-note": "true" }).length;

{
  const shirtGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "base:dress", garmentType: "dress" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const shirtKeys = shirtGarments.map((garment) => garment.garmentKey);
  const fitted = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: shirtKeys,
    compatibilityDemographic: "female",
    garments: shirtGarments,
    garmentTypeSelection: selection(),
  }, "female");
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
        onUnassignGarment={(garmentKey) => {
          const next = removeGarmentFromWearerOrder(order, garmentKey);
          publishAuthority(next);
          setOrder(next);
        }}
      />
    );
  };
  let assignmentRenderer!: ReturnType<typeof create>;
  await act(async () => {
    assignmentRenderer = create(<AssignmentHarness />);
  });
  const root = () => assignmentRenderer.root;
  const body = textContent(root());
  assert.match(body, /Add people/);
  assert.equal(body.includes("1. Add people"), false);
  assert.match(body, /Name or nickname/);
  assert.match(body, /Fit for measurements/);
  assert.match(body, /Garments for this person/);
  assert.match(body, /tick the\s+garments each person will wear on their card/);
  assert.equal(body.includes("2. Assign garments"), false, "step-2 assign block is gone");
  assert.equal(body.includes("Choose who will wear each garment"), false);
  assert.equal(root().findAllByType("select").length, 0, "per-garment dropdowns are gone");
  const groups = root().findAllByProps({ "data-wearer-garment-assign": "true" });
  assert.equal(groups.length, 2, "every person card gets garment checkboxes");
  for (const group of groups) {
    assert.deepEqual(
      group
        .findAll((node) => node.type === "input" && node.props.type === "checkbox")
        .map((node) => node.props["data-wearer-garment-key"]),
      shirtKeys,
    );
  }
  const youCardText = textContent(cardFor(root(), "You"));
  assert.ok(youCardText.indexOf("Name or nickname") < youCardText.indexOf("Move up"));
  assert.ok(youCardText.indexOf("Remove person") < youCardText.indexOf("Fit for measurements"));
  assert.ok(
    youCardText.indexOf("Fit for measurements") < youCardText.indexOf("Garments for this person"),
    "fit comes before garments on the card",
  );
  const addButton = root().findAllByType("button").find(
    (button) => textContent(button) === "+ Add another person",
  );
  if (!addButton || addButton.props.type !== "button") {
    throw new Error("expected Add another person button");
  }

  assert.equal(garmentBox(root(), "You", "additional:shirt:1").props.checked, false);
  assert.equal(garmentBox(root(), "Amaka", "additional:shirt:1").props.checked, false);
  assert.equal(unassignedNoteCount(root()), 1, "order-level note while a garment is unassigned");
  assert.match(textContent(root()), /Assign all garments to continue\./);

  if (!garmentBox(root(), "You", "base:shirt").props.checked) {
    await toggleGarment(root(), "You", "base:shirt");
  }
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);

  await toggleGarment(root(), "Amaka", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], amakaWearer.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:shirt").props.checked, true);
  assert.equal(
    garmentBox(root(), "You", "base:shirt").props.checked,
    false,
    "checking on one card moves the garment off the other card",
  );

  await toggleGarment(root(), "You", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:shirt").props.checked, false);

  await toggleGarment(root(), "Amaka", "base:dress");
  assert.equal(authority.assignmentByGarmentKey["base:dress"], amakaWearer.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:dress").props.checked, true);
  assert.equal(garmentBox(root(), "You", "base:dress").props.checked, false);
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);

  await act(async () => {
    assignmentRenderer.update(<AssignmentHarness />);
  });
  assert.equal(garmentBox(root(), "You", "base:shirt").props.checked, true);
  assert.equal(garmentBox(root(), "Amaka", "base:dress").props.checked, true);

  const amakaName = root().findByProps({ "aria-label": "Name or nickname for Amaka" });
  await act(async () => {
    amakaName.props.onChange({ currentTarget: { value: "Amaka Obi" } });
  });
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(authority.assignmentByGarmentKey["base:dress"], amakaWearer.wearerId);

  await toggleGarment(root(), "Amaka Obi", "additional:shirt:1");
  assert.equal(authority.assignmentByGarmentKey["additional:shirt:1"], amakaWearer.wearerId);
  assert.equal(unassignedNoteCount(root()), 0);
  assert.equal(textContent(root()).includes("Assign all garments to continue."), false);

  await toggleGarment(root(), "Amaka Obi", "additional:shirt:1");
  assert.equal(
    authority.assignmentByGarmentKey["additional:shirt:1"],
    undefined,
    "unchecking leaves the garment unassigned",
  );
  assert.equal(garmentBox(root(), "Amaka Obi", "additional:shirt:1").props.checked, false);
  assert.equal(garmentBox(root(), "You", "additional:shirt:1").props.checked, false);
  assert.equal(
    hasUnassignedPhysicalGarments({ order: authority, physicalGarmentKeys: shirtKeys }),
    true,
    "an unchecked garment keeps the Continue gate closed",
  );
  assert.equal(unassignedNoteCount(root()), 1);
  const stillUnassigned = reconcileWearerOrder({
    order: authority,
    garmentKeys: shirtKeys,
    compatibilityDemographic: "female",
    garments: shirtGarments,
    garmentTypeSelection: selection(),
  });
  assert.equal(
    stillUnassigned.assignmentByGarmentKey["additional:shirt:1"],
    undefined,
    "with 2+ people an unassigned garment is not auto-stolen",
  );

  await toggleGarment(root(), "Amaka Obi", "additional:shirt:1");
  assert.equal(authority.assignmentByGarmentKey["additional:shirt:1"], amakaWearer.wearerId);

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

  let rejectionAuthority: WearerOrderStateV2 = maleFriend.order;
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
    const publish = (next: WearerOrderStateV2) => {
      rejectionAuthority = next;
      setOrder(next);
    };
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
          if (result.status === "updated") publish(result.order);
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
          if (result.status === "updated") publish(result.order);
          return result;
        }}
        onUnassignGarment={(garmentKey) => publish(removeGarmentFromWearerOrder(order, garmentKey))}
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
  await toggleGarment(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(garmentBox(rejectionRenderer.root, "Chike", "base:dress").props.checked, false);
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], ownedDress);
  assert.match(
    alerts(rejectionRenderer.root).join(" "),
    /This garment is not available for Chike's selected fit/,
  );
  await toggleGarment(rejectionRenderer.root, "You", "base:dress");
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], you.wearerId);
  assert.equal(
    alerts(rejectionRenderer.root).some((alert) => alert.includes("not available")),
    false,
    "a successful assignment clears the garment's rejection",
  );
  await toggleGarment(rejectionRenderer.root, "Chike", "base:dress");
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

  const withUnfittedPerson = addWearer({
    order: authority,
    physicalGarmentCount: shirtGarments.length,
    displayName: "",
    fitContext: null,
  });
  if (withUnfittedPerson.status !== "updated") throw new Error("expected Person 3");
  rejectionAuthority = withUnfittedPerson.order;
  let unfittedCardRenderer!: ReturnType<typeof create>;
  await act(async () => {
    unfittedCardRenderer = create(
      <RejectionHarness
        initial={withUnfittedPerson.order}
        garmentsForPanel={shirtGarments}
        garmentTypeSelection={selection()}
      />,
    );
  });
  const person3Card = cardFor(unfittedCardRenderer.root, "Person 3");
  const person3Group = person3Card.findByProps({ "data-wearer-garment-assign": "true" });
  assert.equal(person3Group.props.disabled, true, "fit is required before garments");
  const person3Boxes = person3Group.findAll(
    (node) => node.type === "input" && node.props.type === "checkbox",
  );
  assert.equal(person3Boxes.length, shirtKeys.length);
  assert.equal(person3Boxes.every((box) => box.props.disabled === true), true);
  assert.match(
    textContent(person3Card),
    /Select a fit for Person 3 before assigning garments\./,
  );
  const beforeDisabledToggle = structuredClone(rejectionAuthority.assignmentByGarmentKey);
  await toggleGarment(unfittedCardRenderer.root, "Person 3", "base:shirt");
  assert.deepEqual(rejectionAuthority.assignmentByGarmentKey, beforeDisabledToggle);
  assert.equal(
    garmentBox(unfittedCardRenderer.root, "You", "base:shirt").props.disabled,
    false,
    "a fitted person's checkboxes stay enabled",
  );

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
  assert.equal(missingFitBody.includes("Garments for this person"), false);
  assert.equal(missingFitBody.includes("Assign all garments to continue"), false);

  const reconciled = reconcileWearerOrder({
    order: authority,
    garmentKeys: shirtKeys,
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
  assert.equal(
    root().findAllByProps({ "data-wearer-garment-assign": "true" }).length,
    3,
    "a new person also gets the in-card garment list",
  );
  assert.equal(
    cardFor(root(), "Person 3").findByProps({ "data-wearer-garment-assign": "true" }).props.disabled,
    true,
  );
}

console.log("PASS: wearer assignment panel in-card garment assignment");

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
  const soloOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: soloGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: soloGarments,
    garmentTypeSelection: selection(),
  }, "female");
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
  assert.equal(textContent(addPeople), "Add a person");
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
  assert.match(expandedBody, /Add people/);
  assert.equal(expandedBody.includes("1. Add people"), false);
  assert.match(expandedBody, /Fit for measurements/);
  assert.match(expandedBody, /Male fit/);
  assert.equal(expandedBody.includes("Person 1"), false);
  const youNameInput = soloRenderer.root.findByProps({
    "aria-label": "Name or nickname for You",
  });
  assert.equal(youNameInput.props.placeholder, "You");
  assert.equal(
    soloRenderer.root.findAllByProps({ "data-wearer-garment-assign": "true" }).length,
    0,
    "one wearer: no in-card garment checkboxes",
  );
  assert.equal(expandedBody.includes("Garments for this person"), false);
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
  assert.equal(
    soloRenderer.root.findAllByProps({ "data-wearer-garment-assign": "true" }).length,
    2,
    "garment checkboxes appear on every card once a second person exists",
  );
  assert.equal(textContent(soloRenderer.root).includes("2. Assign garments"), false);
  assert.equal(
    garmentBox(soloRenderer.root, "Person 2", "base:shirt").props.disabled,
    true,
    "Person 2 has no fit yet",
  );
  assert.equal(garmentBox(soloRenderer.root, "You", "base:shirt").props.disabled, false);

  await act(async () => {
    soloRenderer.root.findByProps({ "data-wearer-only-for-me": "true" }).props.onClick();
  });
  assert.equal(latestSolo.wearers.length, 1);
  assert.equal(soloRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(textContent(soloRenderer.root).includes("Add people"), false);
  assert.equal(soloRenderer.root.findAllByProps({ "data-wearer-garment-assign": "true" }).length, 0);
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
  const collapseOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: collapseGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: collapseGarments,
    garmentTypeSelection: selection(),
  }, "female");
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
  const defaultSoloOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection(),
  }, "female");
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

{
  const forMeGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const freshSolo = reconcileWearerOrder({
    order: createEmptyWearerOrder(),
    garmentKeys: forMeGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: forMeGarments,
    garmentTypeSelection: selection(),
  });
  assert.equal(freshSolo.wearers.length, 1);
  assert.equal(freshSolo.wearers[0].fitContext, null, "fresh solo must not pre-select a fit");
  assert.deepEqual(freshSolo.assignmentByGarmentKey, {});

  let forMeOrder = freshSolo;
  let addCalls = 0;
  let deleteCalls = 0;
  let collapseCalls = 0;
  const ForMeHarness = () => {
    const [order, setOrder] = useState(forMeOrder);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={forMeGarments}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          addCalls += 1;
          const result = addWearer({
            order,
            physicalGarmentCount: forMeGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") {
            forMeOrder = result.order;
            setOrder(result.order);
          }
        }}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => {
          deleteCalls += 1;
          const result = deleteWearer(order, wearerId);
          if (result.status === "updated") {
            forMeOrder = result.order;
            setOrder(result.order);
          }
          return result;
        }}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
        onCollapseToSolo={() => {
          collapseCalls += 1;
        }}
      />
    );
  };
  let forMeRenderer!: ReturnType<typeof create>;
  await act(async () => {
    forMeRenderer = create(<ForMeHarness />);
  });
  const soloStrip = forMeRenderer.root.findByProps({ "data-wearer-solo-first": "true" });
  assert.match(
    textContent(soloStrip),
    /These clothes are for you\. Add another person if you are ordering for someone else\./,
  );
  assert.deepEqual(
    soloStrip.findAllByType("button").map((button) => textContent(button)),
    ["For me", "Add a person"],
    "For me comes first, then Add a person",
  );
  const forMe = forMeRenderer.root.findByProps({ "data-wearer-for-me": "true" });
  assert.equal(forMe.props["data-wearer-for-me-selected"], "true", "For me is selected by default");
  assert.equal(forMe.props["aria-pressed"], true);
  assert.match(forMe.props.className, /bg-heritage-green/);
  const addPerson = forMeRenderer.root.findByProps({ "data-wearer-add-people": "true" });
  assert.equal(textContent(addPerson), "Add a person");
  assert.equal(
    /bg-heritage-green/.test(addPerson.props.className),
    false,
    "Add a person is outline while For me is selected",
  );

  await act(async () => {
    forMe.props.onClick();
  });
  assert.equal(collapseCalls, 1, "clicking selected For me still resets to solo");
  assert.equal(deleteCalls, 0);
  assert.equal(forMeOrder.wearers.length, 1);
  assert.equal(forMeRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(
    forMeRenderer.root.findByProps({ "data-wearer-for-me": "true" }).props["data-wearer-for-me-selected"],
    "true",
  );

  await act(async () => {
    forMeRenderer.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  assert.equal(addCalls, 0, "Add a person must not create a wearer");
  assert.equal(forMeOrder.wearers.length, 1);
  assert.equal(forMeRenderer.root.findAllByProps({ "data-wearer-people": "true" }).length, 1);
  assert.equal(forMeRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 0);
  assert.equal(
    forMeRenderer.root.findAllByProps({ "data-wearer-for-me": "true" }).length,
    0,
    "For me is deselected once people UI opens",
  );
  const soleFitRadios = forMeRenderer.root.findAll(
    (node) => node.type === "input" && node.props.type === "radio",
  );
  assert.equal(soleFitRadios.length, 2);
  assert.equal(soleFitRadios.some((radio) => radio.props.checked), false, "no fit pre-selected");

  await act(async () => {
    forMeRenderer.root.findByProps({ "data-wearer-add-another": "true" }).props.onClick();
  });
  assert.equal(addCalls, 1);
  assert.equal(forMeOrder.wearers.length, 2);
  assert.equal(forMeOrder.wearers[1].fitContext, null, "new person starts with no fit");

  await act(async () => {
    forMeRenderer.root.findByProps({ "data-wearer-only-for-me": "true" }).props.onClick();
  });
  assert.equal(forMeOrder.wearers.length, 1);
  assert.equal(collapseCalls, 2);
  assert.equal(forMeRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(
    forMeRenderer.root.findByProps({ "data-wearer-for-me": "true" }).props["data-wearer-for-me-selected"],
    "true",
    "Only for me restores For me selected",
  );
}

console.log("PASS: wearer assignment panel For me / Add a person solo strip");
