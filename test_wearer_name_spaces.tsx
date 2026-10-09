/**
 * H2: a person's name keeps its spaces while typing ("Ada Obi", never "AdaObi").
 * - onChange / renameWearer store the raw value (no trim, no collapse).
 * - Save and blur store the canonical leading/trailing-trimmed name.
 * - Labels, the draft write and the paid V2 snapshot use the trimmed name.
 * - A whitespace-only name is stored blank and never counts as confirmed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { WearerAssignmentPanel } from "./src/components/WearerAssignmentPanel";
import type { GarmentTypeStepSelection, WearerOrderStateV2 } from "./src/types";
import type { MeasurementPhysicalGarment } from "./src/utils/measurementBlueprint";
import { projectAuthoritativeOrderMeasurements } from "./src/utils/futureOrderCandidate";
import {
  canonicalWearerDisplayName,
  canonicalizeWearerOrderNames,
  createEmptyWearerOrder,
  createWearerProfile,
  deleteWearer,
  normalizeWearerOrderState,
  planWearerOrderMeasurements,
  reconcileWearerOrder,
  renameWearer,
  wearerAssignmentLabel,
  wearerFitConflictCopy,
  wearerPublicLabel,
} from "./src/utils/wearerOrder";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const pass = (label: string) => console.log(`PASS ${label}`);

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
const garmentKeys = garments.map((garment) => garment.garmentKey);

const soleOrder = (displayName = ""): WearerOrderStateV2 => {
  const base = createEmptyWearerOrder();
  const withPerson: WearerOrderStateV2 = {
    ...base,
    wearers: [{ ...createWearerProfile({ fitContext: "female", presentationOrder: 0 }), displayName }],
  };
  return reconcileWearerOrder({
    order: withPerson,
    garmentKeys,
    compatibilityDemographic: "female",
    garments,
    garmentTypeSelection: selection(),
  });
};

// --- Pure helpers ---------------------------------------------------------
{
  const order = soleOrder();
  const id = order.wearers[0].wearerId;
  let current = order;
  for (const value of ["A", "Ad", "Ada", "Ada ", "Ada O", "Ada Ob", "Ada Obi"]) {
    const result = renameWearer(current, id, value);
    assert.equal(result.status, "updated");
    current = result.order;
    assert.equal(current.wearers[0].displayName, value, `renameWearer stores "${value}" raw`);
  }
  assert.equal(renameWearer(current, id, "  Ada  Obi  ").order.wearers[0].displayName, "  Ada  Obi  ",
    "no trim or internal collapse mid-keystroke");
  assert.equal(canonicalWearerDisplayName("  Ada Obi  "), "Ada Obi");
  assert.equal(canonicalWearerDisplayName("Ada  Obi"), "Ada  Obi", "internal spaces kept");
  assert.equal(canonicalWearerDisplayName("   "), "");
  assert.equal(wearerPublicLabel("Ada Obi ", 1), "Ada Obi");
  assert.equal(wearerPublicLabel("   ", 1), "Person 2");
  assert.equal(wearerAssignmentLabel(" Ada Obi ", 0), "Ada Obi");
  assert.equal(wearerAssignmentLabel("   ", 0), "You");
  const raw = renameWearer(current, id, "  Ada Obi  ").order;
  const canonical = canonicalizeWearerOrderNames(raw);
  assert.equal(canonical.wearers[0].displayName, "Ada Obi");
  assert.equal(canonicalizeWearerOrderNames(canonical), canonical, "already canonical keeps the reference");
  const normalized = normalizeWearerOrderState(JSON.parse(JSON.stringify(raw)));
  assert.equal(normalized?.wearers[0].displayName, "Ada Obi", "readers trim persisted names");
  assert.equal(
    wearerFitConflictCopy({
      wearerLabel: wearerAssignmentLabel("Ada Obi ", 1),
      garmentLabels: ["Standard Dress"],
      sole: true,
    }).includes("Ada Obi's selected fit"),
    true,
    "fit-conflict copy uses the trimmed label",
  );
  // Paid V2 snapshot stores the trimmed name.
  const runtimes = planWearerOrderMeasurements({
    order: raw,
    garmentTypeSelection: selection(),
    physicalGarments: garments,
  });
  assert.equal(runtimes[0].displayName, "  Ada Obi  ", "runtime carries the raw live value");
  const snapshot = projectAuthoritativeOrderMeasurements({
    wearerRuntimes: runtimes,
    measurementState: runtimes[0].measurement,
    measurementPlan: runtimes[0].plan,
  } as Parameters<typeof projectAuthoritativeOrderMeasurements>[0]) as WearerOrderStateV2;
  assert.equal(snapshot.wearers[0].displayName, "Ada Obi", "paid V2 snapshot trims");
  // Draft write path canonicalizes (source check: the live field keeps raw).
  const dsv = readFileSync("src/components/DesignStudioView.tsx", "utf8");
  assert.match(dsv, /futureMeasurementState:[\s\S]{0,400}canonicalizeWearerOrderNames\(wearerOrderForPlanRef\.current\)/);
  pass("renameWearer raw; canonical trim helpers; readers, draft and paid V2 trim");
}

// --- Panel ----------------------------------------------------------------
const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children.map((child) => textContent(child as ReactTestInstance | string)).join("");

let latest: WearerOrderStateV2 = soleOrder();
let renameCalls: string[] = [];
const mount = async (initial: WearerOrderStateV2) => {
  latest = initial;
  renameCalls = [];
  const Harness = () => {
    const [order, setOrder] = useState(initial);
    latest = order;
    const publish = (next: WearerOrderStateV2) => {
      latest = next;
      setOrder(next);
    };
    return (
      <WearerAssignmentPanel
        order={order}
        presentation="people"
        initialPeopleExpanded
        activeWearerId={order.wearers[0]?.wearerId ?? null}
        garments={garments}
        garmentLabels={{}}
        garmentTypeSelection={selection()}
        onSelectWearer={() => {}}
        onAddWearer={() => {}}
        onRenameWearer={(wearerId, displayName) => {
          renameCalls.push(displayName);
          const result = renameWearer(order, wearerId, displayName);
          if (result.status === "updated") publish(result.order);
        }}
        onReorderWearers={() => {}}
        onSetFitContext={() => {}}
        onDeleteWearer={(wearerId) => deleteWearer(order, wearerId)}
        onAssignGarment={() => ({ status: "blocked", code: "WEARER_NOT_FOUND", order })}
      />
    );
  };
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<Harness />);
  });
  return renderer;
};
const nameInput = (root: ReactTestInstance) =>
  root.findAll(
    (node) =>
      node.type === "input" &&
      typeof node.props["aria-label"] === "string" &&
      node.props["aria-label"].startsWith("Name or nickname for "),
  )[0];
const saveButton = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-wearer-name-save": "true" })[0];
const addAnother = (root: ReactTestInstance) =>
  root.findAllByProps({ "data-wearer-add-another": "true" }).find((node) => node.type === "button");
const type = async (root: ReactTestInstance, value: string) => {
  const input = nameInput(root);
  await act(async () => {
    input.props.onChange({ currentTarget: { value } });
  });
};
const blur = async (root: ReactTestInstance) => {
  const input = nameInput(root);
  await act(async () => {
    input.props.onBlur();
  });
};
const save = async (root: ReactTestInstance) => {
  const button = saveButton(root);
  await act(async () => {
    button.props.onClick({ stopPropagation() {} });
  });
};

{
  const renderer = await mount(soleOrder());
  const root = () => renderer.root;
  // Keystroke by keystroke, no blur: "Ada " then "Obi".
  for (const value of ["A", "Ad", "Ada", "Ada "]) await type(root(), value);
  assert.equal(nameInput(root()).props.value, "Ada ", "trailing space survives typing");
  assert.equal(latest.wearers[0].displayName, "Ada ");
  assert.equal(nameInput(root()).props["aria-label"], "Name or nickname for Ada", "label is trimmed");
  for (const value of ["Ada O", "Ada Ob", "Ada Obi"]) await type(root(), value);
  assert.equal(nameInput(root()).props.value, "Ada Obi", "field shows Ada Obi, not AdaObi");
  assert.equal(latest.wearers[0].displayName, "Ada Obi");
  assert.equal(saveButton(root()).props["data-wearer-name-confirmed"], "false", "typing does not confirm");
  assert.deepEqual(renameCalls, ["A", "Ad", "Ada", "Ada ", "Ada O", "Ada Ob", "Ada Obi"]);
  await blur(root());
  assert.equal(latest.wearers[0].displayName, "Ada Obi");
  assert.equal(saveButton(root()).props["data-wearer-name-confirmed"], "true", "blur confirms");
  assert.equal(saveButton(root()).props["aria-label"], "Name saved for Ada Obi");
  pass('typing "Ada " then "Obi" shows and stores "Ada Obi"; blur confirms');

  // Leading/trailing spaces are trimmed on blur.
  await type(root(), "Ada Obi ");
  assert.equal(nameInput(root()).props.value, "Ada Obi ");
  await blur(root());
  assert.equal(latest.wearers[0].displayName, "Ada Obi", "blur stores the trimmed name");
  assert.equal(nameInput(root()).props.value, "Ada Obi");
  pass("blur trims trailing space");

  // Save trims "  Ada Obi  " to "Ada Obi"; labels use it.
  await type(root(), "  Ada Obi  ");
  assert.equal(nameInput(root()).props.value, "  Ada Obi  ");
  assert.equal(saveButton(root()).props["aria-label"], "Save name for Ada Obi");
  await save(root());
  assert.equal(latest.wearers[0].displayName, "Ada Obi", "Save stores the trimmed name");
  assert.equal(nameInput(root()).props.value, "Ada Obi");
  assert.equal(saveButton(root()).props["data-wearer-name-confirmed"], "true");
  assert.equal(nameInput(root()).props["aria-label"], "Name or nickname for Ada Obi");
  assert.equal(textContent(root()).includes("Ada Obi "), false, "no trailing space anywhere in the panel");
  assert.equal(addAnother(root())?.props.disabled, false, "a saved name unlocks Add another person");
  pass('Save stores "  Ada Obi  " as "Ada Obi"');

  // Whitespace alone is never a saved name.
  await type(root(), "   ");
  assert.equal(nameInput(root()).props.value, "   ", "raw spaces kept while typing");
  assert.equal(addAnother(root())?.props.disabled, true);
  await save(root());
  assert.equal(latest.wearers[0].displayName, "", "whitespace-only saves blank");
  assert.equal(saveButton(root()).props["data-wearer-name-confirmed"], "false", "never confirmed");
  assert.equal(root().findAllByProps({ "data-wearer-name-hint": "true" }).length, 1, "Save shows the name hint");
  assert.equal(addAnother(root())?.props.disabled, true, "Save-before-Add gate holds");
  await type(root(), "   ");
  await blur(root());
  assert.equal(latest.wearers[0].displayName, "");
  assert.equal(saveButton(root()).props["data-wearer-name-confirmed"], "false");
  assert.equal(addAnother(root())?.props.disabled, true);
  pass('"   " alone is never a saved name (Save and blur)');
}

{
  // Reload rule: a non-empty saved name confirms; whitespace never does.
  const spaces = await mount(soleOrder("   "));
  assert.equal(saveButton(spaces.root).props["data-wearer-name-confirmed"], "false");
  assert.equal(addAnother(spaces.root)?.props.disabled, true);
  const named = await mount(soleOrder("Ada Obi"));
  assert.equal(saveButton(named.root).props["data-wearer-name-confirmed"], "true");
  const reloaded = normalizeWearerOrderState(JSON.parse(JSON.stringify(soleOrder("   "))));
  assert.equal(reloaded?.wearers[0].displayName, "", "reload stores whitespace-only as blank");
  pass("reload rule: whitespace-only never confirmed; saved non-empty name is");
}

console.log("test_wearer_name_spaces: all passed");
