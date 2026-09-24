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
  createEmptyWearerOrder,
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
        if (!garment || !wearerId) return;
        const result = assignGarmentToWearer({
          order,
          garmentKey,
          wearerId,
          garment,
          garmentTypeSelection: selection(),
        });
        if (result.status === "updated") publish(result.order);
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
