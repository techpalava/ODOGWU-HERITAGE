import assert from "node:assert/strict";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { FIT_CONFLICT_PULSE_MS, NAME_SAVED_FLASH_MS, WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
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
  createWearerProfile,
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

const nameInput = (root: ReactTestInstance, wearerLabel: string) =>
  root.findByProps({ "aria-label": `Name or nickname for ${wearerLabel}` });

const typeName = async (root: ReactTestInstance, wearerLabel: string, value: string) => {
  const input = nameInput(root, wearerLabel);
  await act(async () => {
    input.props.onChange({ currentTarget: { value } });
  });
};

const blurName = async (root: ReactTestInstance, wearerLabel: string) => {
  const input = nameInput(root, wearerLabel);
  await act(async () => {
    input.props.onBlur();
  });
};

const nameSaveButton = (root: ReactTestInstance, wearerLabel: string) =>
  cardFor(root, wearerLabel).findByProps({ "data-wearer-name-save": "true" });

const saveName = async (root: ReactTestInstance, wearerLabel: string) => {
  const button = nameSaveButton(root, wearerLabel);
  await act(async () => {
    button.props.onClick({ stopPropagation() {} });
  });
};

const nameHintCount = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-wearer-name-hint": "true" }).length;

const addAnotherButton = (root: ReactTestInstance) =>
  root.findByProps({ "data-wearer-add-another": "true" });

const addAnotherReason = (root: ReactTestInstance) =>
  root
    .findAllByProps({ "data-wearer-add-another-reason": "true" })
    .map((node) => textContent(node))
    .join(" ");

const removeButtonIn = (root: ReactTestInstance, wearerLabel: string) => {
  const button = cardFor(root, wearerLabel)
    .findAllByType("button")
    .find((candidate) => textContent(candidate) === "Remove person");
  if (!button) throw new Error(`expected remove control for ${wearerLabel}`);
  return button;
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
      onUnassignGarment={(garmentKey) => publish(removeGarmentFromWearerOrder(order, garmentKey))}
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
// Owned by Amaka: You's row is listed but locked with a guide; clicking never steals it.
const youOwnedByAmaka = garmentBox(renderer.root, "You", "additional:shirt:1");
assert.equal(youOwnedByAmaka.props.disabled, true);
assert.equal(youOwnedByAmaka.props.checked, false);
assert.match(textContent(cardFor(renderer.root, "You")), /Assigned to Amaka/);
await toggleGarment(renderer.root, "You", "additional:shirt:1");
assert.equal(
  latestOrder.assignmentByGarmentKey["additional:shirt:1"],
  amaka.wearerId,
  "an owned-by-other row never steals",
);
// The owner unticks; then You can tick it.
await toggleGarment(renderer.root, "Amaka", "additional:shirt:1");
assert.equal(latestOrder.assignmentByGarmentKey["additional:shirt:1"], undefined);
assert.equal(garmentBox(renderer.root, "You", "additional:shirt:1").props.disabled, false);
assert.equal(textContent(cardFor(renderer.root, "You")).includes("Assigned to"), false);
await toggleGarment(renderer.root, "You", "additional:shirt:1");
assert.equal(garmentBox(renderer.root, "Amaka", "additional:shirt:1").props.checked, false);
assert.match(textContent(cardFor(renderer.root, "Amaka")), /Assigned to You/);
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

/** No person card's garment list may ever carry a red role="alert" fit rejection. */
const assertNoGarmentListAlerts = (root: ReactTestInstance) => {
  const groups = root
    .findAllByProps({ "data-wearer-garment-assign": "true" })
    .filter((node) => typeof node.type === "string");
  for (const group of groups) {
    assert.equal(
      group.findAll((node) => node.props?.role === "alert").length,
      0,
      "no role=alert inside a garment assign fieldset",
    );
    assert.equal(textContent(group).includes("This garment is not available"), false);
  }
};

const garmentRowIn = (root: ReactTestInstance, wearerLabel: string, garmentKey: string) => {
  const row = cardFor(root, wearerLabel)
    .findAllByType("li")
    .find((candidate) =>
      candidate.findAll((node) => node.props?.["data-wearer-garment-key"] === garmentKey).length > 0,
    );
  if (!row) throw new Error(`expected ${garmentKey} row for ${wearerLabel}`);
  return row;
};

/**
 * Every owner / unfit note sits inside its own garment's bordered label (the pill),
 * next to that garment's checkbox, never floating between rows.
 */
const assertGarmentNotesInsideTheirPill = (root: ReactTestInstance) => {
  const notes = root.findAll(
    (node) =>
      typeof node.type === "string" &&
      (node.props["data-wearer-garment-owner-note"] === "true" ||
        node.props["data-wearer-garment-unfit-note"] === "true"),
  );
  for (const note of notes) {
    let pill: ReactTestInstance | null = note.parent;
    while (pill && pill.type !== "label") pill = pill.parent;
    assert.ok(pill, "garment note is inside a label");
    const boxes = pill!.findAll((node) => node.type === "input" && node.props.type === "checkbox");
    assert.equal(boxes.length, 1, "the note's label holds exactly one garment checkbox");
    assert.equal(boxes[0].props["aria-describedby"], note.props.id, "the note describes its own garment");
    let row: ReactTestInstance | null = pill!.parent;
    while (row && row.type !== "li") row = row.parent;
    assert.ok(row, "the pill is inside the garment row");
    assert.equal(
      row!.findAll((node) => node.type === "label").length,
      1,
      "one pill per garment row",
    );
  }
  return notes.length;
};

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
  // Sole -> Split cleared every tick; in Split, You has re-ticked the shirt and dress.
  assert.deepEqual(withAmaka.order.assignmentByGarmentKey, {}, "1 -> 2 starts unticked");
  const openingAssignment: Record<string, string> = {
    "base:shirt": you.wearerId,
    "base:dress": you.wearerId,
  };
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
  assert.equal(addButton.props.disabled, true, "You has no saved name yet");
  assert.equal(addAnotherReason(root()), "Save each person\u2019s name before adding another");

  assert.equal(garmentBox(root(), "You", "additional:shirt:1").props.checked, false);
  assert.equal(garmentBox(root(), "Amaka", "additional:shirt:1").props.checked, false);
  assert.equal(unassignedNoteCount(root()), 1, "order-level note while a garment is unassigned");
  assert.match(textContent(root()), /Assign all garments to continue\./);

  if (!garmentBox(root(), "You", "base:shirt").props.checked) {
    await toggleGarment(root(), "You", "base:shirt");
  }
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);

  // Owned by You: Amaka's row is locked with "Assigned to You"; no stealing.
  const amakaShirt = garmentBox(root(), "Amaka", "base:shirt");
  assert.equal(amakaShirt.props.disabled, true);
  assert.equal(amakaShirt.props.checked, false);
  assert.match(textContent(cardFor(root(), "Amaka")), /Assigned to You/);
  await toggleGarment(root(), "Amaka", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId, "a locked row never steals");
  // You unticks; Amaka can now tick it.
  await toggleGarment(root(), "You", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], undefined);
  await toggleGarment(root(), "Amaka", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], amakaWearer.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:shirt").props.checked, true);
  assert.equal(garmentBox(root(), "You", "base:shirt").props.disabled, true);
  assert.match(textContent(cardFor(root(), "You")), /Assigned to Amaka/);

  // And back: Amaka unticks, then You ticks.
  await toggleGarment(root(), "Amaka", "base:shirt");
  await toggleGarment(root(), "You", "base:shirt");
  assert.equal(authority.assignmentByGarmentKey["base:shirt"], you.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:shirt").props.checked, false);

  // The dress is still on You: You unticks it first, then Amaka ticks it.
  assert.equal(authority.assignmentByGarmentKey["base:dress"], you.wearerId);
  assert.equal(garmentBox(root(), "Amaka", "base:dress").props.disabled, true);
  await toggleGarment(root(), "You", "base:dress");
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
        garmentTypeSelection={garmentTypeSelection}
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
  const dressOwner = maleFriend.order.wearers.find((wearer) => wearer.wearerId === ownedDress);
  if (!dressOwner || dressOwner.wearerId === chike.wearerId) throw new Error("expected another dress owner");
  const dressOwnerLabel = wearerAssignmentLabel(dressOwner.displayName, dressOwner.presentationOrder);
  // Owned by another person: locked with "Assigned to …", never the fit rejection, no steal.
  const chikeDress = garmentBox(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(chikeDress.props.disabled, true);
  assert.equal(chikeDress.props.checked, false);
  assert.ok(
    textContent(cardFor(rejectionRenderer.root, "Chike")).includes(`Assigned to ${dressOwnerLabel}`),
  );
  await toggleGarment(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], ownedDress, "no stealing");
  assert.equal(
    alerts(rejectionRenderer.root).some((alert) => alert.includes("not available")),
    false,
    "owned-by-other never shows the fit rejection",
  );
  assertNoGarmentListAlerts(rejectionRenderer.root);
  assert.equal(
    garmentRowIn(rejectionRenderer.root, "Chike", "base:dress").findAllByProps({
      "data-wearer-garment-unfit-note": "true",
    }).length,
    0,
    "owned-by-other rows show Assigned to only, never the fit guide",
  );
  // The owner unticks: the dress is unassigned, and Chike's male fit cannot wear it.
  await toggleGarment(rejectionRenderer.root, dressOwnerLabel, "base:dress");
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], undefined);
  const unfitBox = garmentBox(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(unfitBox.props.disabled, true, "fit eligibility is decided before any click");
  assert.equal(unfitBox.props.checked, false);
  assert.ok(unfitBox.props["aria-describedby"]);
  const chikeDressRow = garmentRowIn(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(chikeDressRow.props["data-wearer-garment-unfit"], "true");
  const unfitNotes = chikeDressRow
    .findAllByProps({ "data-wearer-garment-unfit-note": "true" })
    .filter((node) => typeof node.type === "string");
  assert.deepEqual(unfitNotes.map((node) => textContent(node)), [
    "Not available for Chike's selected fit.",
  ]);
  assert.equal(unfitNotes[0].props.role, undefined, "quiet guide, not an alert");
  assert.equal(String(unfitNotes[0].props.className).includes("red"), false);
  assert.ok(assertGarmentNotesInsideTheirPill(rejectionRenderer.root) >= 1);
  assert.ok(
    textContent(chikeDressRow.findByType("label")).includes("Not available for Chike's selected fit."),
    "the unfit note trails the dress name inside the dress pill",
  );
  assert.equal(textContent(chikeDressRow).includes("Assigned to"), false);
  await toggleGarment(rejectionRenderer.root, "Chike", "base:dress");
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], undefined);
  assertNoGarmentListAlerts(rejectionRenderer.root);
  assert.equal(alerts(rejectionRenderer.root).length, 0, "no red alert anywhere for an unfit row");
  const chikeName = rejectionRenderer.root.findByProps({
    "aria-label": "Name or nickname for Chike",
  });
  await act(async () => {
    chikeName.props.onChange({ currentTarget: { value: "Chief" } });
  });
  assert.match(
    textContent(garmentRowIn(rejectionRenderer.root, "Chief", "base:dress")),
    /Not available for Chief's selected fit\./,
  );
  await toggleGarment(rejectionRenderer.root, "You", "base:dress");
  assert.equal(rejectionAuthority.assignmentByGarmentKey["base:dress"], you.wearerId);
  const chiefDressRow = garmentRowIn(rejectionRenderer.root, "Chief", "base:dress");
  assert.match(textContent(chiefDressRow), /Assigned to You/);
  assert.equal(textContent(chiefDressRow).includes("Not available"), false, "owned-by-other wins over unfit");
  assert.equal(garmentBox(rejectionRenderer.root, "Chief", "base:dress").props.disabled, true);
  assertNoGarmentListAlerts(rejectionRenderer.root);

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

  await typeName(root(), "You", "Ada");
  await blurName(root(), "Ada");
  assert.equal(
    addAnotherButton(root()).props.disabled,
    true,
    "Amaka Obi was edited and not saved yet",
  );
  await saveName(root(), "Amaka Obi");
  assert.equal(addAnotherButton(root()).props.disabled, false);
  const assignmentsBeforeAdd = { ...authority.assignmentByGarmentKey };
  await act(async () => {
    addAnotherButton(root()).props.onClick();
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
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") {
            latestSolo = result.order;
            setOrder(result.order);
          }
        }}
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

  assert.equal(addAnotherButton(soloRenderer.root).props.disabled, true);
  await act(async () => {
    addAnotherButton(soloRenderer.root).props.onClick();
  });
  assert.equal(addWearerCalls, 0, "unsaved name keeps Add another person locked");
  await typeName(soloRenderer.root, "You", "Ada");
  await saveName(soloRenderer.root, "Ada");
  await act(async () => {
    addAnotherButton(soloRenderer.root).props.onClick();
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
  assert.equal(garmentBox(soloRenderer.root, "Ada", "base:shirt").props.disabled, false);

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
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") {
            forMeOrder = result.order;
            setOrder(result.order);
          }
        }}
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

  await typeName(forMeRenderer.root, "You", "Ada");
  await blurName(forMeRenderer.root, "Ada");
  await act(async () => {
    addAnotherButton(forMeRenderer.root).props.onClick();
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

const SAVE_NAMES_REASON = "Save each person\u2019s name before adding another";
const NEED_GARMENT_REASON =
  "Each person needs a garment. Add another garment to add another person.";

{
  // 1-garment order: cap is 1 person; the cap reason wins over the save-name reason.
  const oneGarment: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
  ];
  let oneOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: oneGarment,
    garmentTypeSelection: selection(),
  }, "female");
  let oneAddCalls = 0;
  const OneHarness = () => {
    const [order, setOrder] = useState(oneOrder);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={oneGarment}
        garmentLabels={{ "base:shirt": "Standard Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {
          oneAddCalls += 1;
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") {
            oneOrder = result.order;
            setOrder(result.order);
          }
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
      />
    );
  };
  let oneRenderer!: ReturnType<typeof create>;
  await act(async () => {
    oneRenderer = create(<OneHarness />);
  });
  await act(async () => {
    oneRenderer.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  let add = addAnotherButton(oneRenderer.root);
  assert.equal(add.props.disabled, true);
  assert.equal(add.props.title, NEED_GARMENT_REASON, "cap reason wins even with an empty name");
  assert.equal(addAnotherReason(oneRenderer.root), NEED_GARMENT_REASON);
  assert.equal(textContent(oneRenderer.root).includes(SAVE_NAMES_REASON), false);
  await typeName(oneRenderer.root, "You", "Ada");
  await saveName(oneRenderer.root, "Ada");
  assert.equal(textContent(nameSaveButton(oneRenderer.root, "Ada")), "✓Saved");
  add = addAnotherButton(oneRenderer.root);
  assert.equal(add.props.disabled, true, "1-garment order caps at 1 person");
  assert.equal(add.props.title, NEED_GARMENT_REASON);
  assert.ok(add.props["aria-describedby"]);
  assert.equal(addAnotherReason(oneRenderer.root), NEED_GARMENT_REASON);
  assert.equal(textContent(oneRenderer.root).includes(SAVE_NAMES_REASON), false);
  await act(async () => {
    addAnotherButton(oneRenderer.root).props.onClick();
  });
  assert.equal(oneAddCalls, 0, "a capped Add another person does nothing");
}

console.log("PASS: wearer assignment panel 1-garment order shows the garment cap reason");

{
  // 2-garment order: Save / blur confirm unlocks Add another person until the cap.
  const twoGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const twoKeys = twoGarments.map((garment) => garment.garmentKey);
  let capOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: twoKeys,
    compatibilityDemographic: "female",
    garments: twoGarments,
    garmentTypeSelection: selection(),
  }, "female");
  const soleId = capOrder.wearers[0].wearerId;
  assert.equal(capOrder.assignmentByGarmentKey["base:shirt"], soleId);
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], soleId);
  const CapHarness = () => {
    const [order, setOrder] = useState(capOrder);
    const publish = (next: WearerOrderStateV2) => {
      capOrder = next;
      setOrder(next);
    };
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={twoGarments}
        garmentLabels={{
          "base:shirt": "Standard Shirt",
          "additional:shirt:1": "Standard Shirt 2",
        }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          const result = addWearer({
            order,
            physicalGarmentCount: twoGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") publish(result.order);
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") publish(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={(wearerId, fitContext) => {
          const result = setWearerFitContext(order, wearerId, fitContext);
          if (result.status === "updated") publish(result.order);
        }}
        onDeleteWearer={(wearerId) => {
          const result = deleteWearer(order, wearerId);
          if (result.status === "updated") {
            // Same as Design Studio: back to one person re-runs the sole auto-assign.
            publish(
              result.order.wearers.length === 1
                ? reconcileWearerOrder({
                    order: result.order,
                    garmentKeys: twoKeys,
                    compatibilityDemographic: "female",
                    garments: twoGarments,
                    garmentTypeSelection: selection(),
                  })
                : result.order,
            );
          }
          return result;
        }}
        onAssignGarment={(garmentKey, wearerId) => {
          const garment = twoGarments.find((item) => item.garmentKey === garmentKey);
          if (!garment) return { status: "blocked", code: "WEARER_NOT_FOUND", order };
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
        onUnassignGarment={(garmentKey) => publish(removeGarmentFromWearerOrder(order, garmentKey))}
      />
    );
  };
  let capRenderer!: ReturnType<typeof create>;
  await act(async () => {
    capRenderer = create(<CapHarness />);
  });
  const root = () => capRenderer.root;
  await act(async () => {
    root().findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });

  // Empty name under the cap: save-name reason.
  let add = addAnotherButton(root());
  assert.equal(add.props.disabled, true);
  assert.equal(add.props.title, SAVE_NAMES_REASON);
  assert.ok(add.props["aria-describedby"], "disabled reason is announced");
  assert.equal(addAnotherReason(root()), SAVE_NAMES_REASON);
  assert.equal(textContent(root()).includes(NEED_GARMENT_REASON), false);
  assert.equal(nameSaveButton(root(), "You").props["data-wearer-name-confirmed"], "false");
  assert.equal(nameHintCount(root()), 0);
  await saveName(root(), "You");
  assert.equal(nameHintCount(root()), 1, "Save with an empty name shows the hint");
  assert.match(textContent(root()), /Enter a name or nickname/);
  assert.equal(addAnotherButton(root()).props.disabled, true);
  await typeName(root(), "You", "   ");
  await saveName(root(), "You");
  assert.equal(addAnotherButton(root()).props.disabled, true, "whitespace is never confirmed");

  // Typing clears the hint but does not confirm; blur with a name confirms.
  await typeName(root(), "You", "Ada");
  assert.equal(nameHintCount(root()), 0);
  assert.equal(textContent(nameSaveButton(root(), "Ada")), "Save");
  assert.equal(addAnotherButton(root()).props.disabled, true, "an edit is not confirmed yet");
  await blurName(root(), "Ada");
  const savedButton = nameSaveButton(root(), "Ada");
  assert.equal(textContent(savedButton), "✓Saved");
  assert.equal(savedButton.props["data-wearer-name-confirmed"], "true");
  assert.equal(savedButton.props["aria-label"], "Name saved for Ada");
  add = addAnotherButton(root());
  assert.equal(add.props.disabled, false, "blur with a name unlocks Add another person");
  assert.equal(add.props.title, undefined);
  assert.equal(add.props["aria-describedby"], undefined);
  assert.equal(addAnotherReason(root()), "");

  // Any edit clears confirmation until Save again; clearing clears it too.
  await typeName(root(), "Ada", "Adaeze");
  assert.equal(textContent(nameSaveButton(root(), "Adaeze")), "Save");
  assert.equal(addAnotherButton(root()).props.disabled, true);
  await saveName(root(), "Adaeze");
  assert.equal(textContent(nameSaveButton(root(), "Adaeze")), "✓Saved");
  assert.equal(addAnotherButton(root()).props.disabled, false, "Save confirms");
  await typeName(root(), "Adaeze", "");
  assert.equal(addAnotherButton(root()).props.disabled, true, "clearing clears confirmation");
  await blurName(root(), "You");
  assert.equal(addAnotherButton(root()).props.disabled, true, "blur with an empty name never confirms");
  assert.equal(nameHintCount(root()), 0, "blur alone does not nag");
  await typeName(root(), "You", "Ada");
  await saveName(root(), "Ada");

  // Second person reaches the cap (2 garments = 2 people): cap reason wins.
  await act(async () => {
    addAnotherButton(root()).props.onClick();
  });
  assert.equal(capOrder.wearers.length, 2);
  add = addAnotherButton(root());
  assert.equal(add.props.disabled, true);
  assert.equal(add.props.title, NEED_GARMENT_REASON, "cap reason even while Person 2 is unnamed");
  assert.equal(addAnotherReason(root()), NEED_GARMENT_REASON);
  assert.equal(textContent(root()).includes(SAVE_NAMES_REASON), false);
  await typeName(root(), "Person 2", "Bola");
  await blurName(root(), "Bola");
  assert.equal(capOrder.wearers[1].fitContext, null, "no fit needed to save a name");
  assert.equal(addAnotherButton(root()).props.title, NEED_GARMENT_REASON);
  await act(async () => {
    addAnotherButton(root()).props.onClick();
  });
  assert.equal(capOrder.wearers.length, 2, "a capped Add another person does nothing");

  // 2 garments + 2 people: checkboxes still work (fit before garments).
  assert.equal(garmentBox(root(), "Bola", "base:shirt").props.disabled, true);
  const bolaFemale = cardFor(root(), "Bola").findAll(
    (node) => node.type === "input" && node.props.type === "radio",
  )[1];
  await act(async () => {
    bolaFemale.props.onChange();
  });
  assert.equal(capOrder.wearers[1].fitContext, "female");
  // Sole -> Split cleared every tick: the customer now owns the split.
  assert.deepEqual(capOrder.assignmentByGarmentKey, {}, "adding a 2nd person unticks everything");
  assert.equal(garmentBox(root(), "Ada", "base:shirt").props.checked, false);
  assert.equal(garmentBox(root(), "Ada", "additional:shirt:1").props.checked, false);
  assert.equal(garmentBox(root(), "Bola", "additional:shirt:1").props.disabled, false);
  assert.equal(root().findAllByProps({ "data-wearer-unassigned-note": "true" }).length, 1);
  assert.match(textContent(root()), /Assign all garments to continue\./);
  assert.equal(root().findAllByProps({ "data-wearer-sole-all-assigned": "true" }).length, 0);
  assert.equal(
    root().findAllByProps({ "data-wearer-garment-assign": "true" })
      .filter((node) => typeof node.type === "string").length,
    2,
  );
  // Ada ticks Shirt 2: Bola's row locks with "Assigned to Ada" until Ada unticks.
  await toggleGarment(root(), "Ada", "additional:shirt:1");
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], soleId);
  assert.equal(garmentBox(root(), "Bola", "additional:shirt:1").props.disabled, true);
  assert.match(textContent(cardFor(root(), "Bola")), /Assigned to Ada/);
  await toggleGarment(root(), "Bola", "additional:shirt:1");
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], soleId, "no stealing");
  await toggleGarment(root(), "Ada", "additional:shirt:1");
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], undefined);
  await toggleGarment(root(), "Bola", "additional:shirt:1");
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], capOrder.wearers[1].wearerId);
  assert.equal(garmentBox(root(), "Ada", "additional:shirt:1").props.checked, false);
  await toggleGarment(root(), "Bola", "additional:shirt:1");
  assert.equal(
    hasUnassignedPhysicalGarments({ order: capOrder, physicalGarmentKeys: twoKeys }),
    true,
    "Continue still needs every garment assigned",
  );
  assert.equal(root().findAllByProps({ "data-wearer-unassigned-note": "true" }).length, 1);

  // 2+ people: Remove deletes only that person; back under the cap.
  await act(async () => {
    removeButtonIn(root(), "Bola").props.onClick();
  });
  assert.equal(capOrder.wearers.length, 1);
  assert.equal(capOrder.wearers[0].wearerId, soleId);
  assert.equal(root().findAllByProps({ "data-wearer-people": "true" }).length, 1);
  assert.equal(addAnotherButton(root()).props.disabled, false, "under the cap again with Ada saved");
  // Back to Sole: auto-assign returns and the notice replaces the checklist.
  assert.equal(capOrder.assignmentByGarmentKey["base:shirt"], soleId);
  assert.equal(capOrder.assignmentByGarmentKey["additional:shirt:1"], soleId);
  assert.equal(root().findAllByProps({ "data-wearer-sole-all-assigned": "true" }).length, 1);
  assert.equal(root().findAllByProps({ "data-wearer-garment-assign": "true" }).length, 0);
}

console.log("PASS: wearer assignment panel Save name unlocks Add another person until the cap");

{
  // At the hard ceiling (10 garments, 10 people) the copy says the order is full.
  const tenGarments: MeasurementPhysicalGarment[] = Array.from({ length: 10 }, (_, index) => ({
    garmentKey: index === 0 ? "base:shirt" : `additional:shirt:${index}`,
    garmentType: "shirt" as const,
  }));
  let full = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: tenGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: tenGarments,
    garmentTypeSelection: selection(),
  }, "female");
  const named = renameWearer(full, full.wearers[0].wearerId, "Ada");
  if (named.status !== "updated") throw new Error("expected rename");
  full = named.order;
  for (let count = 2; count <= 10; count += 1) {
    const result = addWearer({
      order: full,
      physicalGarmentCount: tenGarments.length,
      displayName: `Guest ${count}`,
      fitContext: "female",
    });
    if (result.status !== "updated") throw new Error(`expected Guest ${count}`);
    full = result.order;
  }
  let fullRenderer!: ReturnType<typeof create>;
  await act(async () => {
    fullRenderer = create(
      <WearerAssignmentPanel
        order={full}
        activeWearerId={full.wearers[0].wearerId}
        garments={tenGarments}
        garmentLabels={{}}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(full, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order: full })}
      />,
    );
  });
  const add = addAnotherButton(fullRenderer.root);
  assert.equal(add.props.disabled, true);
  assert.equal(add.props.title, "Maximum of 10 people per order.");
  assert.equal(addAnotherReason(fullRenderer.root), "Maximum of 10 people per order.");
}

console.log("PASS: wearer assignment panel hard ceiling copy");

{
  // Sole expanded card: Remove person = Only for me (back to For me strip).
  const soleOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection(),
  }, "female");
  let deleteCalls = 0;
  let collapseCalls = 0;
  let soleRenderer!: ReturnType<typeof create>;
  await act(async () => {
    soleRenderer = create(
      <WearerAssignmentPanel
        order={soleOrder}
        activeWearerId={soleOrder.wearers[0].wearerId}
        garments={[{ garmentKey: "base:shirt", garmentType: "shirt" }]}
        garmentLabels={{ "base:shirt": "Standard Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => {
          deleteCalls += 1;
          return deleteWearer(soleOrder, wearerId);
        }}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order: soleOrder })}
        onCollapseToSolo={() => {
          collapseCalls += 1;
        }}
      />,
    );
  });
  await act(async () => {
    soleRenderer.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  assert.equal(soleRenderer.root.findAllByProps({ "data-wearer-people": "true" }).length, 1);
  await act(async () => {
    removeButtonIn(soleRenderer.root, "You").props.onClick({ stopPropagation() {} });
  });
  assert.equal(deleteCalls, 0, "the sole person is not deleted");
  assert.equal(collapseCalls, 1, "same path as Only for me");
  assert.equal(soleRenderer.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(
    soleRenderer.root.findByProps({ "data-wearer-for-me": "true" }).props["data-wearer-for-me-selected"],
    "true",
  );
  assert.equal(soleRenderer.root.findAllByProps({ role: "alert" }).length, 0);
}

console.log("PASS: wearer assignment panel sole Remove person returns to For me");

{
  // Reloaded draft: non-empty names already in the order count as confirmed.
  const base = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: [{ garmentKey: "base:shirt", garmentType: "shirt" }],
    garmentTypeSelection: selection(),
  }, "female");
  const named = renameWearer(base, base.wearers[0].wearerId, "Ada");
  if (named.status !== "updated") throw new Error("expected rename");
  const withGuest = addWearer({
    order: named.order,
    physicalGarmentCount: 3,
    displayName: "Bola",
    fitContext: null,
  });
  if (withGuest.status !== "updated") throw new Error("expected Bola");
  let reloadRenderer!: ReturnType<typeof create>;
  await act(async () => {
    reloadRenderer = create(
      <WearerAssignmentPanel
        order={withGuest.order}
        activeWearerId={withGuest.order.wearers[0].wearerId}
        garments={[
          { garmentKey: "base:shirt", garmentType: "shirt" },
          { garmentKey: "additional:shirt:1", garmentType: "shirt" },
          { garmentKey: "additional:shirt:2", garmentType: "shirt" },
        ]}
        garmentLabels={{ "base:shirt": "Standard Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(withGuest.order, wearerId)}
        onAssignGarment={() => ({
          status: "blocked",
          code: "WEARER_NOT_FOUND",
          order: withGuest.order,
        })}
      />,
    );
  });
  assert.equal(addAnotherButton(reloadRenderer.root).props.disabled, false);
  assert.deepEqual(
    reloadRenderer.root
      .findAllByProps({ "data-wearer-name-save": "true" })
      .map((button) => textContent(button)),
    ["✓Saved", "✓Saved"],
  );
}

console.log("PASS: wearer assignment panel reloaded names count as saved");

const addGarmentButtons = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-wearer-add-garment": "true" }).filter(
    (node) => typeof node.type === "string",
  );

{
  // Step 7 Add Garment: at the garment-tied cap the people panel offers the
  // existing Add Garment path; a new garment (panel stays mounted, as with the
  // fabric-capacity commit) unlocks Add another person under the new cap.
  const startGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
  ];
  const startOrder = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: ["base:shirt"],
    compatibilityDemographic: "female",
    garments: startGarments,
    garmentTypeSelection: selection(),
  }, "female");
  let addGarmentCalls = 0;
  let addWearerCalls = 0;
  const AddGarmentHarness = ({ withHandler }: { withHandler: boolean }) => {
    const [order, setOrder] = useState(startOrder);
    const [liveGarments, setLiveGarments] = useState(startGarments);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={liveGarments}
        garmentLabels={{ "base:shirt": "Standard Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {
          addWearerCalls += 1;
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") setOrder(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
        onAddGarment={
          withHandler
            ? () => {
                addGarmentCalls += 1;
                const next: MeasurementPhysicalGarment[] = [
                  ...liveGarments,
                  { garmentKey: "additional:shirt:1", garmentType: "shirt" },
                ];
                setLiveGarments(next);
                setOrder(
                  reconcileWearerOrder({
                    order,
                    garmentKeys: next.map((garment) => garment.garmentKey),
                    compatibilityDemographic: "female",
                    garments: next,
                    garmentTypeSelection: selection(),
                  }),
                );
              }
            : undefined
        }
      />
    );
  };

  // No handler wired: never rendered.
  let bare!: ReturnType<typeof create>;
  await act(async () => {
    bare = create(<AddGarmentHarness withHandler={false} />);
  });
  await act(async () => {
    bare.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  assert.equal(addGarmentButtons(bare.root).length, 0, "no Add Garment without a handler");

  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AddGarmentHarness withHandler />);
  });
  assert.equal(addGarmentButtons(renderer.root).length, 0, "solo first-screen has no Add Garment");
  await act(async () => {
    renderer.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  let buttons = addGarmentButtons(renderer.root);
  assert.equal(buttons.length, 1, "Add Garment shows at the garment cap");
  assert.equal(textContent(buttons[0]), "Add Garment");
  assert.equal(addAnotherButton(renderer.root).props.disabled, true);
  assert.equal(addAnotherReason(renderer.root), NEED_GARMENT_REASON, "cap reason line is kept");
  await typeName(renderer.root, "You", "Ada");
  await saveName(renderer.root, "Ada");
  await act(async () => {
    addGarmentButtons(renderer.root)[0].props.onClick();
  });
  assert.equal(addGarmentCalls, 1);
  assert.ok(
    renderer.root.findAllByProps({ "data-wearer-people": "true" }).length > 0,
    "people panel stays expanded after the garment lands",
  );
  assert.equal(
    addAnotherButton(renderer.root).props.disabled,
    false,
    "the new garment raises the cap; saved names unlock Add another person",
  );
  assert.equal(addAnotherReason(renderer.root), "");
  assert.equal(addGarmentButtons(renderer.root).length, 0, "below the cap without spare capacity: hidden");
  await act(async () => {
    addAnotherButton(renderer.root).props.onClick();
  });
  assert.equal(addWearerCalls, 1);
}

console.log("PASS: wearer assignment panel Add Garment at the cap unlocks another person");

{
  // Spare fabric capacity surfaces Add Garment below the cap; the hard ceiling hides it.
  const twoGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const base = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: twoGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: twoGarments,
    garmentTypeSelection: selection(),
  }, "female");
  let spareCalls = 0;
  const renderPanel = (props: {
    order: WearerOrderStateV2;
    garments: MeasurementPhysicalGarment[];
    spare: boolean;
    initialPeopleExpanded?: boolean;
  }) =>
    create(
      <WearerAssignmentPanel
        order={props.order}
        activeWearerId={props.order.wearers[0]?.wearerId || null}
        garments={props.garments}
        garmentLabels={{}}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(props.order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order: props.order })}
        onAddGarment={() => {
          spareCalls += 1;
        }}
        spareFabricCapacityAvailable={props.spare}
        initialPeopleExpanded={props.initialPeopleExpanded}
      />,
    );

  let below!: ReturnType<typeof create>;
  await act(async () => {
    below = renderPanel({ order: base, garments: twoGarments, spare: false, initialPeopleExpanded: true });
  });
  assert.ok(
    below.root.findAllByProps({ "data-wearer-people": "true" }).length > 0,
    "initialPeopleExpanded remounts with the people panel open (return trip)",
  );
  assert.equal(addGarmentButtons(below.root).length, 0, "below the cap, no offer: hidden");

  let spare!: ReturnType<typeof create>;
  await act(async () => {
    spare = renderPanel({ order: base, garments: twoGarments, spare: true, initialPeopleExpanded: true });
  });
  const spareButtons = addGarmentButtons(spare.root);
  assert.equal(spareButtons.length, 1, "spare fabric capacity shows Add Garment below the cap");
  await act(async () => {
    spareButtons[0].props.onClick();
  });
  assert.equal(spareCalls, 1);

  let collapsed!: ReturnType<typeof create>;
  await act(async () => {
    collapsed = renderPanel({ order: base, garments: twoGarments, spare: true });
  });
  assert.equal(
    collapsed.root.findAllByProps({ "data-wearer-people": "true" }).length,
    0,
    "without initialPeopleExpanded a sole order mounts on the solo first-screen",
  );
  assert.equal(addGarmentButtons(collapsed.root).length, 0, "solo first-screen has no Add Garment");

  // 10 people on 10 garments: the hard ceiling, so another garment cannot add a person.
  const tenGarments: MeasurementPhysicalGarment[] = Array.from({ length: 10 }, (_, index) => ({
    garmentKey: index === 0 ? "base:shirt" : `additional:shirt:${index}`,
    garmentType: "shirt",
  }));
  const tenBase = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: tenGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: tenGarments,
    garmentTypeSelection: selection(),
  }, "female");
  const firstNamed = renameWearer(tenBase, tenBase.wearers[0].wearerId, "Person A");
  if (firstNamed.status !== "updated") throw new Error("expected rename");
  let tenOrder = firstNamed.order;
  for (let index = 1; index < 10; index += 1) {
    const result = addWearer({
      order: tenOrder,
      physicalGarmentCount: 10,
      displayName: `Guest ${index}`,
      fitContext: null,
    });
    if (result.status !== "updated") throw new Error(`expected guest ${index}`);
    tenOrder = result.order;
  }
  assert.equal(tenOrder.wearers.length, 10);
  let ceiling!: ReturnType<typeof create>;
  await act(async () => {
    ceiling = renderPanel({ order: tenOrder, garments: tenGarments, spare: false });
  });
  assert.equal(addAnotherButton(ceiling.root).props.disabled, true);
  assert.equal(addGarmentButtons(ceiling.root).length, 0, "at the 10-person ceiling Add Garment is hidden");
}

console.log("PASS: wearer assignment panel Add Garment follows spare capacity and the ceiling");

{
  // Sole expanded card is simplified: Name + Save, Fit, Remove only (no Move up,
  // no garment checkboxes). A second person brings back the full card chrome.
  const soleGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const soleStart = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: soleGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: soleGarments,
    garmentTypeSelection: selection(),
  }, "female");
  let soleCollapseCalls = 0;
  const SoleCardHarness = () => {
    const [order, setOrder] = useState(soleStart);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={soleGarments}
        garmentLabels={{ "base:shirt": "Standard Shirt", "additional:shirt:1": "Standard Shirt 2" }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          const result = addWearer({
            order,
            physicalGarmentCount: soleGarments.length,
            displayName,
            fitContext,
          });
          if (result.status === "updated") setOrder(result.order);
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") setOrder(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
        onCollapseToSolo={() => {
          soleCollapseCalls += 1;
          setOrder(soleStart);
        }}
      />
    );
  };
  const hostButtons = (node: ReactTestInstance, marker: string) =>
    node.findAllByProps({ [marker]: "true" }).filter((match) => typeof match.type === "string");
  const expectSoleCard = (root: ReactTestInstance) => {
    const cards = root.findAllByType("article");
    assert.equal(cards.length, 1);
    const card = cards[0];
    const text = textContent(card);
    assert.match(text, /Name or nickname/);
    assert.equal(hostButtons(card, "data-wearer-name-save").length, 1, "Save is on the sole card");
    assert.match(text, /Fit for measurements/);
    assert.equal(
      card.findAll((node) => node.type === "input" && node.props.type === "radio").length,
      2,
      "Male / Female fit on the sole card",
    );
    assert.equal(hostButtons(card, "data-wearer-remove").length, 1, "Remove person is on the sole card");
    assert.equal(hostButtons(card, "data-wearer-move-up").length, 0, "Move up is hidden, not disabled");
    assert.equal(text.includes("Move up"), false);
    assert.equal(hostButtons(card, "data-wearer-garment-assign").length, 0, "no garment-assign block");
    assert.equal(text.includes("Garments for this person"), false);
    assert.equal(
      card.findAll((node) => node.type === "input" && node.props.type === "checkbox").length,
      0,
      "Sole: no garment checkboxes",
    );
    // Sole notice under Fit: the system owns the split.
    const notice = hostButtons(card, "data-wearer-sole-all-assigned");
    assert.equal(notice.length, 1, "Sole notice is shown");
    const noticeText = textContent(notice[0]);
    assert.match(noticeText, /All garments are for this person\./);
    assert.match(noticeText, /Add another person to split garments between people\./);
    assert.match(noticeText, /Standard Shirt, Standard Shirt 2/);
    assert.equal(notice[0].props.role, undefined, "a quiet notice, not an alert");
    assert.ok(text.indexOf("Fit for measurements") < text.indexOf("All garments are for this person"));
    assert.equal(text.includes("Used to determine"), false, "card fit helper dropped");
  };

  let sole!: ReturnType<typeof create>;
  await act(async () => {
    sole = create(<SoleCardHarness />);
  });
  await act(async () => {
    sole.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  expectSoleCard(sole.root);
  await typeName(sole.root, "You", "Ada");
  await saveName(sole.root, "Ada");
  expectSoleCard(sole.root);
  await act(async () => {
    addAnotherButton(sole.root).props.onClick();
  });
  const cards = sole.root.findAllByType("article");
  assert.equal(cards.length, 2, "second person added");
  assert.equal(
    hostButtons(sole.root, "data-wearer-sole-all-assigned").length,
    0,
    "Split hides the Sole notice",
  );
  for (const card of cards) {
    assert.equal(hostButtons(card, "data-wearer-move-up").length, 1, "Move up returns with 2+ people");
    assert.equal(hostButtons(card, "data-wearer-remove").length, 1);
    assert.equal(hostButtons(card, "data-wearer-name-save").length, 1);
    assert.equal(hostButtons(card, "data-wearer-garment-assign").length, 1, "garment checkboxes return");
    assert.match(textContent(card), /Fit for measurements/);
  }
  assert.equal(hostButtons(cards[0], "data-wearer-move-up")[0].props.disabled, true, "first card cannot move up");
  assert.equal(hostButtons(cards[1], "data-wearer-move-up")[0].props.disabled, false);

  // Fresh sole card: Remove person still returns to the For me strip.
  let removeSole!: ReturnType<typeof create>;
  await act(async () => {
    removeSole = create(<SoleCardHarness />);
  });
  await act(async () => {
    removeSole.root.findByProps({ "data-wearer-add-people": "true" }).props.onClick();
  });
  expectSoleCard(removeSole.root);
  await act(async () => {
    hostButtons(removeSole.root.findAllByType("article")[0], "data-wearer-remove")[0].props.onClick({
      stopPropagation() {},
    });
  });
  assert.equal(soleCollapseCalls, 1, "sole Remove = Only for me");
  assert.equal(removeSole.root.findAllByProps({ "data-wearer-solo-first": "true" }).length, 1);
  assert.equal(
    removeSole.root.findByProps({ "data-wearer-for-me": "true" }).props["data-wearer-for-me-selected"],
    "true",
  );
}

console.log("PASS: wearer assignment panel sole expanded card is simplified");

{
  // Acceptance: Shirt on fred -> nol's Shirt row is disabled with "Assigned to fred";
  // fred unticks -> nol can tick it.
  const fnGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const fnBase = reconcileWithChosenSoleFit({
    order: createEmptyWearerOrder(),
    garmentKeys: fnGarments.map((garment) => garment.garmentKey),
    compatibilityDemographic: "female",
    garments: fnGarments,
    garmentTypeSelection: selection(),
  }, "female");
  const fredNamed = renameWearer(fnBase, fnBase.wearers[0].wearerId, "fred");
  if (fredNamed.status !== "updated") throw new Error("expected fred");
  const withNol = addWearer({
    order: fredNamed.order,
    physicalGarmentCount: fnGarments.length,
    displayName: "nol",
    fitContext: "female",
  });
  if (withNol.status !== "updated") throw new Error("expected nol");
  const fredId = fnBase.wearers[0].wearerId;
  const nolId = withNol.order.wearers.find((wearer) => wearer.displayName === "nol")!.wearerId;
  assert.deepEqual(withNol.order.assignmentByGarmentKey, {}, "adding nol starts the split unticked");
  // Split mode: fred ticks both shirts.
  const fredTicked = fnGarments.reduce((order, garment) => {
    const result = assignGarmentToWearer({
      order,
      garmentKey: garment.garmentKey,
      wearerId: fredId,
      garment,
      garmentTypeSelection: selection(),
    });
    if (result.status !== "updated") throw new Error(`fred ticks ${garment.garmentKey}`);
    return result.order;
  }, withNol.order);
  assert.equal(fredTicked.assignmentByGarmentKey["base:shirt"], fredId);
  let fnOrder = fredTicked;
  let fnAssignCalls = 0;
  const FredNolHarness = () => {
    const [order, setOrder] = useState(fnOrder);
    const publish = (next: WearerOrderStateV2) => {
      fnOrder = next;
      setOrder(next);
    };
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId={fredId}
        garments={fnGarments}
        garmentLabels={{ "base:shirt": "Shirt", "additional:shirt:1": "Shirt 2" }}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={(garmentKey, wearerId) => {
          fnAssignCalls += 1;
          const garment = fnGarments.find((item) => item.garmentKey === garmentKey)!;
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
        onUnassignGarment={(garmentKey) => publish(removeGarmentFromWearerOrder(order, garmentKey))}
      />
    );
  };
  let fn!: ReturnType<typeof create>;
  await act(async () => {
    fn = create(<FredNolHarness />);
  });
  const nolShirt = garmentBox(fn.root, "nol", "base:shirt");
  assert.equal(nolShirt.props.disabled, true);
  assert.equal(nolShirt.props.checked, false);
  const nolRow = cardFor(fn.root, "nol")
    .findAll((node) => node.type === "li" && node.props["data-wearer-garment-owned-by-other"] === fredId);
  assert.equal(nolRow.length, 2, "both of fred's garments are locked on nol's card");
  const notes = cardFor(fn.root, "nol")
    .findAllByProps({ "data-wearer-garment-owner-note": "true" })
    .filter((node) => typeof node.type === "string")
    .map((node) => textContent(node));
  assert.deepEqual(notes, ["Assigned to fred", "Assigned to fred"]);
  assert.equal(assertGarmentNotesInsideTheirPill(fn.root), 2);
  for (const garmentKey of ["base:shirt", "additional:shirt:1"]) {
    const pill = garmentRowIn(fn.root, "nol", garmentKey).findByType("label");
    assert.match(textContent(pill), /Assigned to fred$/, `owner note inside the ${garmentKey} pill`);
  }
  assert.equal(nolShirt.props["aria-describedby"] !== undefined, true);
  await toggleGarment(fn.root, "nol", "base:shirt");
  assert.equal(fnAssignCalls, 0, "onAssignGarment is never called from an owned-by-other row");
  assertNoGarmentListAlerts(fn.root);
  assert.equal(fnOrder.assignmentByGarmentKey["base:shirt"], fredId);
  assert.equal(cardFor(fn.root, "fred").findAllByProps({ "data-wearer-garment-owner-note": "true" }).length, 0);
  await toggleGarment(fn.root, "fred", "base:shirt");
  assert.equal(fnOrder.assignmentByGarmentKey["base:shirt"], undefined);
  assert.equal(garmentBox(fn.root, "nol", "base:shirt").props.disabled, false);
  await toggleGarment(fn.root, "nol", "base:shirt");
  assert.equal(fnOrder.assignmentByGarmentKey["base:shirt"], nolId);
  assert.equal(garmentBox(fn.root, "nol", "base:shirt").props.checked, true);
  const fredNotes = cardFor(fn.root, "fred")
    .findAllByProps({ "data-wearer-garment-owner-note": "true" })
    .filter((node) => typeof node.type === "string")
    .map((node) => textContent(node));
  assert.deepEqual(fredNotes, ["Assigned to nol"]);
  assert.equal(assertGarmentNotesInsideTheirPill(fn.root), 2);
  assert.match(
    textContent(garmentRowIn(fn.root, "fred", "base:shirt").findByType("label")),
    /^Shirt\s*Assigned to nol$/,
    "the note sits in the Shirt pill, not the Shirt 2 pill",
  );
  assert.equal(
    textContent(garmentRowIn(fn.root, "fred", "additional:shirt:1").findByType("label")).includes("Assigned to"),
    false,
  );
}

console.log("PASS: wearer assignment panel owned-by-other rows are locked with an owner guide");

{
  // Fit-conflict attention: resting gold beam on unfit pills; pulse + scroll + focus
  // only when a Fit change makes a garment newly unfit on a Split card.
  const fcSelection = (): GarmentTypeStepSelection => ({
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
  const fcGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "base:dress", garmentType: "dress" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const build = (fredFit: "male" | "female"): WearerOrderStateV2 => ({
    ...createEmptyWearerOrder(),
    wearers: [
      createWearerProfile({ wearerId: "w-fred", displayName: "fred", fitContext: fredFit, presentationOrder: 0 }),
      createWearerProfile({ wearerId: "w-nol", displayName: "nol", fitContext: "female", presentationOrder: 1 }),
    ],
    assignmentByGarmentKey: { "base:shirt": "w-nol" },
  });
  const focused: string[] = [];
  const scrolled: unknown[] = [];
  const nodeMock = (element: { type: unknown; props: Record<string, unknown> }) =>
    element.type === "li"
      ? {
          focus: () => {
            focused.push(String(element.props["data-wearer-garment-unfit-focus"] ?? ""));
          },
          scrollIntoView: (options: unknown) => {
            scrolled.push(options);
          },
        }
      : null;
  let fcOrder = build("female");
  let selectCalls = 0;
  const FitConflictHarness = ({ initial }: { initial: WearerOrderStateV2 }) => {
    const [order, setOrder] = useState(initial);
    return (
      <WearerAssignmentPanel
        order={order}
        activeWearerId="w-fred"
        garments={fcGarments}
        garmentLabels={{ "base:shirt": "Standard Shirt", "base:dress": "Standard Dress", "additional:shirt:1": "Long Shirt" }}
        garmentTypeSelection={fcSelection()}
        onSelectWearer={() => {
          selectCalls += 1;
        }}
        onAddWearer={() => {}}
        onRenameWearer={() => {}}
        onReorderWearers={() => {}}
        onSetFitContext={(wearerId, fitContext) => {
          const result = setWearerFitContext(order, wearerId, fitContext);
          if (result.status === "updated") {
            fcOrder = result.order;
            setOrder(result.order);
          }
        }}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
        onUnassignGarment={() => {}}
      />
    );
  };
  const fitRadio = (root: ReactTestInstance, wearerLabel: string, fit: "male" | "female") =>
    cardFor(root, wearerLabel).findAll(
      (node) => node.type === "input" && node.props.type === "radio",
    )[fit === "male" ? 0 : 1];
  const beams = (root: ReactTestInstance) =>
    root.findAll((node) => node.type === "label" && node.props["data-wearer-garment-unfit-beam"] === "true");
  const marked = (root: ReactTestInstance, marker: string) =>
    root.findAll((node) => typeof node.type === "string" && node.props[marker] === "true");
  const liveText = (root: ReactTestInstance) =>
    textContent(root.findByProps({ "data-wearer-fit-attention-live": "true" }));

  // Mount with fred already on Male fit: resting beam, but no pulse/scroll/focus.
  let resting!: ReturnType<typeof create>;
  await act(async () => {
    resting = create(<FitConflictHarness initial={build("male")} />, { createNodeMock: nodeMock as never });
  });
  const restingDress = garmentRowIn(resting.root, "fred", "base:dress");
  assert.equal(restingDress.props["data-wearer-garment-unfit"], "true");
  const restingPill = restingDress.findByType("label");
  assert.equal(restingPill.props["data-wearer-garment-unfit-beam"], "true");
  assert.match(String(restingPill.props.className), /border-l-4 border-l-heritage-gold/);
  assert.equal(String(restingPill.props.className).includes("opacity-50"), false, "no half-opacity wash on the unfit pill");
  assert.match(String(garmentBox(resting.root, "fred", "base:dress").props.className), /opacity-50/, "muting stays on the checkbox");
  assert.match(textContent(restingPill), /Not available for fred's selected fit\./);
  const assertBeamsOnlyOnUnfitRows = (root: ReactTestInstance) => {
    for (const row of root.findAllByType("li")) {
      const pill = row.findAllByType("label")[0];
      if (!pill) continue;
      const beamed = pill.props["data-wearer-garment-unfit-beam"] === "true";
      assert.equal(beamed, row.props["data-wearer-garment-unfit"] === "true", "beam iff unfit row");
      if (row.props["data-wearer-garment-owned-by-other"]) {
        assert.equal(beamed, false, "owner-note rows never get the beam");
        assert.match(String(pill.props.className), /opacity-50/, "Assigned-to rows keep their muted look");
      }
    }
  };
  assertBeamsOnlyOnUnfitRows(resting.root);
  assert.ok(beams(resting.root).length >= 1);
  const fredShirtPill = garmentRowIn(resting.root, "fred", "base:shirt").findByType("label");
  assert.match(textContent(fredShirtPill), /Assigned to nol/);
  assert.equal(fredShirtPill.props["data-wearer-garment-unfit-beam"], undefined);
  assert.deepEqual(focused, [], "no focus on mount");
  assert.deepEqual(scrolled, [], "no scroll on mount");
  assert.equal(marked(resting.root, "data-wearer-garment-unfit-pulse").length, 0, "no pulse on mount");
  assert.equal(marked(resting.root, "data-wearer-garment-unfit-focus").length, 0);
  assert.equal(liveText(resting.root), "");
  // Selecting a person card does not trigger either.
  await act(async () => {
    cardFor(resting.root, "nol").props.onClick();
  });
  assert.equal(selectCalls, 1);
  assert.deepEqual(focused, []);
  // Male -> Female on fred: nothing becomes newly unfit, so no scroll / pulse / focus.
  await act(async () => {
    fitRadio(resting.root, "fred", "female").props.onChange();
  });
  assert.equal(fcOrder.wearers.find((wearer) => wearer.wearerId === "w-fred")?.fitContext, "female");
  assert.deepEqual(focused, [], "no new unfit rows: no focus");
  assert.deepEqual(scrolled, [], "no new unfit rows: no scroll");
  assert.equal(marked(resting.root, "data-wearer-garment-unfit-pulse").length, 0);
  assert.equal(garmentRowIn(resting.root, "fred", "base:dress").props["data-wearer-garment-unfit"], undefined);
  await act(async () => {
    resting.unmount();
  });

  // Female -> Male on fred: the dress becomes newly unfit -> pulse, scroll, focus, live.
  focused.length = 0;
  scrolled.length = 0;
  let trigger!: ReturnType<typeof create>;
  await act(async () => {
    trigger = create(<FitConflictHarness initial={build("female")} />, { createNodeMock: nodeMock as never });
  });
  assert.equal(beams(trigger.root).length, 0, "Female fit: nothing unfit yet");
  await act(async () => {
    fitRadio(trigger.root, "fred", "male").props.onChange();
  });
  assert.equal(fcOrder.wearers.find((wearer) => wearer.wearerId === "w-fred")?.fitContext, "male");
  const newlyUnfit = garmentRowIn(trigger.root, "fred", "base:dress");
  assert.equal(newlyUnfit.props["data-wearer-garment-unfit"], "true");
  assert.equal(newlyUnfit.props["data-wearer-garment-unfit-focus"], "true", "first newly unfit row is marked");
  assert.equal(newlyUnfit.props.tabIndex, -1);
  assert.equal(newlyUnfit.props["data-wearer-garment-unfit-pulse"], "true");
  assert.match(String(newlyUnfit.findByType("label").props.className), /motion-safe:animate-step2-next-unassigned/);
  assert.deepEqual(focused, ["true"], "focus lands on the first newly unfit row");
  assert.deepEqual(scrolled, [{ block: "nearest" }]);
  const focusRows = marked(trigger.root, "data-wearer-garment-unfit-focus");
  assert.equal(focusRows.length, 1);
  for (const row of marked(trigger.root, "data-wearer-garment-unfit-pulse")) {
    assert.equal(row.props["data-wearer-garment-unfit"], "true", "only unfit rows pulse");
    assert.equal(row.props["data-wearer-garment-owned-by-other"], undefined, "owner rows never pulse");
  }
  assert.equal(liveText(trigger.root), "Some garments are not available for this fit.");
  assertBeamsOnlyOnUnfitRows(trigger.root);
  assert.equal(
    garmentRowIn(trigger.root, "fred", "base:shirt").findByType("label").props["data-wearer-garment-unfit-beam"],
    undefined,
  );
  // The pulse and announcement clear after ~1.3s; the resting beam stays.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, FIT_CONFLICT_PULSE_MS + 100));
  });
  assert.equal(marked(trigger.root, "data-wearer-garment-unfit-pulse").length, 0, "pulse removed by the timeout");
  assert.equal(liveText(trigger.root), "");
  assert.equal(
    garmentRowIn(trigger.root, "fred", "base:dress").findByType("label").props["data-wearer-garment-unfit-beam"],
    "true",
  );
  assert.equal(focused.length, 1, "no extra focus after the pulse");
  // Unmount mid-pulse: the timer is cleaned up (no state update after unmount).
  await act(async () => {
    fitRadio(trigger.root, "fred", "female").props.onChange();
  });
  await act(async () => {
    fitRadio(trigger.root, "fred", "male").props.onChange();
  });
  assert.equal(focused.length, 2, "a later Female -> Male flip triggers again");
  await act(async () => {
    trigger.unmount();
  });
  await new Promise((resolve) => setTimeout(resolve, FIT_CONFLICT_PULSE_MS + 100));
}

console.log("PASS: wearer assignment panel fit-conflict attention");

{
  // Saved reads as success; Remove person is a visible bordered button (sole + multi cards).
  const svGarments: MeasurementPhysicalGarment[] = [
    { garmentKey: "base:shirt", garmentType: "shirt" },
    { garmentKey: "additional:shirt:1", garmentType: "shirt" },
  ];
  const svStart: WearerOrderStateV2 = {
    ...createEmptyWearerOrder(),
    wearers: [
      createWearerProfile({ wearerId: "w-ada", displayName: "Ada", fitContext: "female", presentationOrder: 0 }),
    ],
    assignmentByGarmentKey: { "base:shirt": "w-ada", "additional:shirt:1": "w-ada" },
  };
  const SavedHarness = ({ initial }: { initial: WearerOrderStateV2 }) => {
    const [order, setOrder] = useState(initial);
    return (
      <WearerAssignmentPanel
        order={order}
        presentation="people"
        activeWearerId={order.wearers[0]?.wearerId || null}
        garments={svGarments}
        garmentLabels={{ "base:shirt": "Standard Shirt", "additional:shirt:1": "Long Shirt" }}
        onSelectWearer={() => {}}
        onAddWearer={(displayName, fitContext) => {
          const result = addWearer({ order, physicalGarmentCount: svGarments.length, displayName, fitContext });
          if (result.status === "updated") setOrder(result.order);
        }}
        onRenameWearer={(wearerId, displayName) => {
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") setOrder(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
      />
    );
  };
  const removeClass = /rounded-xl border border-heritage-green\/30 .*font-bold text-heritage-green/;
  let sv!: ReturnType<typeof create>;
  await act(async () => {
    sv = create(<SavedHarness initial={svStart} />);
  });
  // Reloaded name: Saved on mount, success styling, no flash.
  const savedOnMount = nameSaveButton(sv.root, "Ada");
  assert.equal(savedOnMount.props["data-wearer-name-confirmed"], "true");
  assert.equal(textContent(savedOnMount), "✓Saved");
  assert.equal(savedOnMount.props["aria-label"], "Name saved for Ada", "accessible label unchanged");
  const tick = savedOnMount.findAll((node) => node.type === "span" && node.props["aria-hidden"] === "true");
  assert.deepEqual(tick.map((node) => textContent(node)), ["✓"], "the tick is aria-hidden");
  const savedClass = String(savedOnMount.props.className);
  for (const token of ["border-heritage-green", "ring-heritage-green", "text-heritage-green", "bg-heritage-green/5", "font-bold"]) {
    assert.ok(savedClass.split(/\s+/).includes(token), `Saved has ${token}`);
  }
  assert.equal(/text-heritage-ink\/55|border-heritage-gold\/30/.test(savedClass), false, "no greyed-out Saved");
  assert.equal(savedOnMount.props["data-wearer-name-saved-flash"], undefined, "no flash on mount");
  // Sole card Remove person is bordered and green.
  const soleRemove = removeButtonIn(sv.root, "Ada");
  assert.match(String(soleRemove.props.className), removeClass);
  assert.equal(String(soleRemove.props.className).includes("text-heritage-ink/60"), false);
  assert.equal(/red/.test(String(soleRemove.props.className)), false, "not a danger button");

  // Dirty name: solid green Save, unchanged.
  await typeName(sv.root, "Ada", "Adaeze");
  const dirty = nameSaveButton(sv.root, "Adaeze");
  assert.equal(textContent(dirty), "Save");
  assert.match(String(dirty.props.className), /border-heritage-green bg-heritage-green text-white/);
  assert.equal(dirty.props["data-wearer-name-saved-flash"], undefined);
  // Save -> Saved flashes once, then settles to the outline.
  await saveName(sv.root, "Adaeze");
  const flashing = nameSaveButton(sv.root, "Adaeze");
  assert.equal(textContent(flashing), "✓Saved");
  assert.equal(flashing.props["data-wearer-name-saved-flash"], "true");
  assert.match(String(flashing.props.className), /bg-heritage-green\/25/);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, NAME_SAVED_FLASH_MS + 100));
  });
  const settled = nameSaveButton(sv.root, "Adaeze");
  assert.equal(settled.props["data-wearer-name-saved-flash"], undefined, "flash cleared");
  assert.match(String(settled.props.className), /bg-heritage-green\/5/);

  // Multi cards: Remove person sits beside Move up with the same weight.
  await act(async () => {
    addAnotherButton(sv.root).props.onClick();
  });
  assert.equal(sv.root.findAllByType("article").length, 2);
  for (const label of ["Adaeze", "Person 2"]) {
    const card = cardFor(sv.root, label);
    const moveUp = card.findAll((node) => node.type === "button" && node.props["data-wearer-move-up"] === "true")[0];
    const remove = removeButtonIn(sv.root, label);
    assert.match(String(remove.props.className), removeClass);
    assert.match(String(moveUp.props.className), /border border-heritage-green\/30/);
    assert.ok(String(remove.props.className).includes("min-h-9"));
  }
  assert.equal(
    nameSaveButton(sv.root, "Person 2").props["data-wearer-name-saved-flash"],
    undefined,
    "a newly added person never flashes",
  );

  // Reduced motion: Save -> Saved without the flash.
  const previousWindow = (globalThis as { window?: unknown }).window;
  Object.assign(globalThis, { window: { matchMedia: () => ({ matches: true }) } });
  try {
    await typeName(sv.root, "Person 2", "Bola");
    await saveName(sv.root, "Bola");
    const reduced = nameSaveButton(sv.root, "Bola");
    assert.equal(textContent(reduced), "✓Saved");
    assert.equal(reduced.props["data-wearer-name-saved-flash"], undefined, "no flash under reduced motion");
  } finally {
    Object.assign(globalThis, { window: previousWindow });
  }
  // Unmount mid-flash: timers are cleaned up.
  await typeName(sv.root, "Bola", "Bolaji");
  await saveName(sv.root, "Bolaji");
  await act(async () => {
    sv.unmount();
  });
  await new Promise((resolve) => setTimeout(resolve, NAME_SAVED_FLASH_MS + 100));
}

console.log("PASS: wearer assignment panel Saved success state and visible Remove person");
