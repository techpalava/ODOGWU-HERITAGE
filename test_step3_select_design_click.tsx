/** Rendered Step 3 batch-mapping bridge through the Task 5 occurrence ledger. */
import assert from "node:assert/strict";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  applyDesignStyleStepLedgerToHydration,
  assignCatalogueStyleToOccurrencesThroughStepRuntime,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser", "bum_shorts"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const style: StyleCategory = {
  id: "casual-native-1",
  name: "Casual Native",
  description: "A shirt reference that can be mapped to any garment.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const Step3Harness = () => {
  const [rawDraft, setRawDraft] = useState<Record<string, unknown>>({});
  const model = createDesignStyleStepTestModel({
    styles: [style],
    garmentTypeSelection,
    rawDraft,
  });
  return (
    <div>
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(model)}
        stagePrice={140}
        onAssignCatalogueStyle={(requests) => {
          const ledger = model.hydration.ledger;
          if (!ledger) throw new Error("Expected mutable V2 ledger.");
          const result = assignCatalogueStyleToOccurrencesThroughStepRuntime({
            ledger,
            activeOccurrences: model.occurrences,
            authority: model.authority,
            requests,
            currentRuntimeGeneration: 1,
            stepIsActive: true,
            hydrationMutable: true,
          });
          if (result.status === "rejected") throw new Error(result.reason);
          const nextHydration = applyDesignStyleStepLedgerToHydration({
            hydration: model.hydration,
            ledger: result.ledger,
            activeOccurrences: model.occurrences,
            authority: model.authority,
          });
          setRawDraft({
            designStyleAssignmentDraft: structuredClone(nextHydration.envelope),
          });
        }}
      />
      <div data-testid="assignment-keys">
        {Object.keys(model.hydration.ledger?.assignmentsByGarmentKey || {}).join("|")}
      </div>
    </div>
  );
};

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(<Step3Harness />);
});

const useButton = () =>
  renderer.root
    .findAllByType("button")
    .find((button) => button.props["aria-label"] === `Use This Design ${style.name}`)!;
const openDialog = async () => {
  await act(async () => useButton().props.onClick({ currentTarget: { focus() {} } }));
  return renderer.root.findByProps({ "data-testid": "design-garment-mapping-dialog" });
};
const checkbox = (dialog: ReactTestInstance, label: string) =>
  dialog
    .findAllByType("label")
    .find((candidate) => textContent(candidate).startsWith(label))!
    .findByType("input");
const progress = () =>
  textContent(renderer.root.findByProps({ "data-testid": "step3-assignment-progress" }));
const continueButton = () =>
  renderer.root
    .findByProps({ "data-testid": "future-design-style-continue-action" })
    .findByType("button");

assert.match(progress(), /0 of 3 garments assigned/);
let dialog = await openDialog();
await act(async () => checkbox(dialog, "Shirt").props.onChange());
await act(async () => checkbox(dialog, "Trouser").props.onChange());
assert.equal(renderer.root.findByProps({ "data-testid": "apply-design-mapping" }).props.disabled, false);
await act(async () => renderer.root.findByProps({ "data-testid": "apply-design-mapping" }).props.onClick());

assert.match(progress(), /2 of 3 garments assigned/);
assert.equal(continueButton().props.disabled, true);
assert.deepEqual(
  textContent(renderer.root.findByProps({ "data-testid": "assignment-keys" })).split("|").sort(),
  ["base:shirt:1", "base:trouser:1"],
);

// The same card remains clickable and adds another occurrence without clearing prior mappings.
assert.equal(useButton().props.disabled, false);
dialog = await openDialog();
assert.equal(checkbox(dialog, "Shirt").props.checked, true);
assert.equal(checkbox(dialog, "Trouser").props.checked, true);
await act(async () => checkbox(dialog, "Bum Shorts").props.onChange());
assert.match(
  textContent(renderer.root.findByProps({ "data-testid": "reference-composition-warning" })),
  /Bum Shorts.*still apply/i,
);
await act(async () => renderer.root.findByProps({ "data-testid": "apply-design-mapping" }).props.onClick());

assert.match(progress(), /3 of 3 garments assigned/);
assert.equal(continueButton().props.disabled, false);
assert.deepEqual(
  textContent(renderer.root.findByProps({ "data-testid": "assignment-keys" })).split("|").sort(),
  ["base:bum_shorts:1", "base:shirt:1", "base:trouser:1"],
);
assert.ok(
  renderer.root
    .findAll((node) => node.props?.["data-style-card"] === "true")
    .some((card) => /Used for 3/.test(textContent(card))),
);

console.log("PASS: Step 3 reuses one style across exact garment occurrences");
