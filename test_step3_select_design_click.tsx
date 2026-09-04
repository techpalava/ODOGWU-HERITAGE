/**
 * Rendered Step 3 occurrence-scoped Select Design regression.
 * Exercises the Task 5D runtime bridge and Task 5A mutation, not a scalar setter.
 */
import assert from "node:assert/strict";
import { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  applyDesignStyleStepLedgerToHydration,
  assignCatalogueStyleThroughStepRuntime,
  type DesignStyleStepClearMutationRequest,
} from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const garmentTypeSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt", "trouser"],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
};

const compatibleStyle: StyleCategory = {
  id: "casual-native-1",
  name: "Casual Native",
  description: "A catalogue design for either selected garment.",
  gender: "male",
  targetDemographic: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const Step3SelectDesignHarness = () => {
  const [rawDraft, setRawDraft] = useState<Record<string, unknown>>({});
  const [activeTarget, setActiveTarget] =
    useState<DesignStyleStepClearMutationRequest["target"] | null>(null);
  const model = createDesignStyleStepTestModel({
    styles: [compatibleStyle],
    garmentTypeSelection,
    rawDraft,
    activeTarget,
  });
  const renderProps = createDesignStyleStepRenderProps(model);

  return (
    <div data-testid="step3-select-design-harness">
      <DormantFutureDesignStyleStep
        {...renderProps}
        stagePrice={140}
        onSelectOccurrence={setActiveTarget}
        onAssignCatalogueStyle={(request) => {
          const ledger = model.hydration.ledger;
          if (!ledger) throw new Error("Expected mutable V2 ledger.");
          const result = assignCatalogueStyleThroughStepRuntime({
            ledger,
            activeOccurrences: model.occurrences,
            activeTarget: model.activeTarget,
            authority: model.authority,
            request,
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
          setRawDraft(
            {
              designStyleAssignmentDraft: structuredClone(
                nextHydration.envelope,
              ),
            },
          );
        }}
      />
      <div data-testid="harness-assignment-keys">
        {Object.keys(
          model.hydration.ledger?.assignmentsByGarmentKey || {},
        ).join("|")}
      </div>
    </div>
  );
};

let renderer!: ReturnType<typeof create>;
await act(async () => {
  renderer = create(<Step3SelectDesignHarness />);
});

const progress = () =>
  textContent(renderer.root.findByProps({ "data-testid": "step3-assignment-progress" }));
const continueButton = () =>
  renderer.root
    .findByProps({ "data-testid": "future-design-style-continue-action" })
    .findByType("button");
const activeContext = () =>
  textContent(renderer.root.findByProps({ id: "step3-active-garment-title" }));
const clickCurrentStyle = async () => {
  const activeLabel = activeContext().replace("Choose a design for ", "");
  const buttons = renderer.root.findAllByType("button").filter(
    (button) =>
      button.props["aria-label"] ===
      `Select Design ${compatibleStyle.name} for ${activeLabel}`,
  );
  assert.ok(
    buttons.length >= 1,
    "The active occurrence must expose an eligible catalogue action.",
  );
  await act(async () => buttons[0]!.props.onClick({ currentTarget: {} }));
};

assert.match(progress(), /0 of 2 garments have a design/);
assert.match(activeContext(), /Shirt/);
assert.equal(continueButton().props.disabled, true);

await clickCurrentStyle();
assert.match(progress(), /1 of 2 garments have a design/);
assert.equal(continueButton().props.disabled, true);
assert.match(
  textContent(renderer.root.findByProps({ "data-testid": "harness-assignment-keys" })),
  /base:shirt:1/,
);

const trouserOccurrence = renderer.root.findAllByType("button").find(
  (button) => String(button.props["aria-label"] || "").startsWith("Trouser:"),
);
assert.ok(trouserOccurrence);
await act(async () => trouserOccurrence.props.onClick());
assert.match(activeContext(), /Trouser/);
assert.equal(
  renderer.root
    .findAll((node) => node.props?.["data-style-selected"] === "true")
    .length,
  0,
  "Another occurrence's assignment must not select the active garment's cards.",
);

await clickCurrentStyle();
assert.match(progress(), /2 of 2 garments have a design/);
assert.equal(continueButton().props.disabled, false);
assert.match(textContent(continueButton()), /Continue to Custom Details/i);
assert.deepEqual(
  textContent(renderer.root.findByProps({ "data-testid": "harness-assignment-keys" }))
    .split("|")
    .sort(),
  ["base:shirt:1", "base:trouser:1"],
);

console.log("PASS: Step 3 Select Design assigns exact garment occurrences");
