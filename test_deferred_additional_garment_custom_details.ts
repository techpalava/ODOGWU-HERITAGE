import assert from "node:assert/strict";
import { inspectCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  cloneGarmentConstructionPricingResolution,
  createEmptyAdditionalGarmentConstructionState,
} from "./src/utils/additionalGarmentConstructionState";
import {
  applyAdditionalGarmentConstructionAndCopy,
  dismissDeferredAdditionalGarmentCustomDetailsPrompt,
  mergeProvisionalAdditionalConstructionForLiveSummary,
  queueDeferredAdditionalGarmentCustomDetailsPrompt,
  resolveDeferredAdditionalGarmentCustomDetailsRequest,
  type DeferredAdditionalGarmentCustomDetailsPrompt,
} from "./src/utils/additionalGarmentFabricPicker";
import { resolveGarmentConstructionPricing } from "./src/utils/garmentConstructionPricing";

const shirtPrompt: DeferredAdditionalGarmentCustomDetailsPrompt = {
  transactionId: 11,
  garmentKey: "additional:shirt:1",
  garmentType: "shirt",
  occurrenceGeneration: 2,
};

const queued = queueDeferredAdditionalGarmentCustomDetailsPrompt([], shirtPrompt);
assert.deepEqual(queued, [shirtPrompt]);
assert.deepEqual(
  queueDeferredAdditionalGarmentCustomDetailsPrompt(queued, {
    ...shirtPrompt,
    transactionId: 12,
  }),
  [{ ...shirtPrompt, transactionId: 12 }],
  "re-queueing the same additional garment replaces the deferred prompt",
);

assert.equal(
  resolveDeferredAdditionalGarmentCustomDetailsRequest({
    prompts: queued,
    occurrences: [
      {
        target: { garmentKey: "additional:shirt:1" },
        assignment: null,
      },
    ],
  }),
  null,
  "Step 5 must not open the dialog before a Step 3 design exists",
);

assert.deepEqual(
  resolveDeferredAdditionalGarmentCustomDetailsRequest({
    prompts: queued,
    occurrences: [
      {
        target: { garmentKey: "additional:shirt:1" },
        assignment: { sourceKind: "catalog", styleId: "style-shirt" },
      },
    ],
  }),
  shirtPrompt,
  "a design assignment on the exact extra garment unlocks the dialog",
);

assert.deepEqual(
  dismissDeferredAdditionalGarmentCustomDetailsPrompt(queued, "additional:shirt:1"),
  [],
  "dismissing after design keeps the committed garment and only closes the prompt",
);

const catalogInspection = inspectCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);
const construction = resolveGarmentConstructionPricing(
  "shirt",
  catalogInspection.activeOptions,
);
assert.equal(construction.status, "resolved");
const copied = applyAdditionalGarmentConstructionAndCopy({
  current: {
    accessories: [],
    additionalGarmentConstructions: {
      schemaVersion: 1,
      byGarmentKey: {
        "additional:shirt:1": cloneGarmentConstructionPricingResolution(
          construction,
        ),
      },
    },
  },
  transaction: {
    transactionId: 11,
    phase: "awaiting_commit",
    origin: "new_addition",
    garmentKey: "additional:shirt:1",
    garmentType: "shirt",
    occurrenceGeneration: 2,
    construction: cloneGarmentConstructionPricingResolution(construction),
  },
  catalogInspection,
});
assert.equal(
  copied.applied,
  true,
  "Use Same after design still copies through the shared construction helper",
);

const gownConstruction = resolveGarmentConstructionPricing(
  "full_length_gown",
  catalogInspection.activeOptions,
);
assert.equal(gownConstruction.status, "resolved");
const emptyLedger = createEmptyAdditionalGarmentConstructionState();
const gownOverlay = mergeProvisionalAdditionalConstructionForLiveSummary(
  emptyLedger,
  {
    origin: "new_addition",
    garmentKey: "additional:full_length_gown:1",
    construction: gownConstruction,
  },
);
assert.equal(
  gownOverlay?.byGarmentKey["additional:full_length_gown:1"]?.status,
  "resolved",
  "a new extra garment previews on the live summary before fabric",
);
assert.equal(
  emptyLedger.byGarmentKey["additional:full_length_gown:1"],
  undefined,
  "the live-summary overlay must not write the construction ledger",
);
assert.equal(
  mergeProvisionalAdditionalConstructionForLiveSummary(gownOverlay, {
    origin: "new_addition",
    garmentKey: "additional:full_length_gown:1",
    construction: gownConstruction,
  }),
  gownOverlay,
  "an extra garment already on the ledger is not overlaid again",
);
assert.equal(
  mergeProvisionalAdditionalConstructionForLiveSummary(emptyLedger, {
    origin: "change_existing",
    garmentKey: "additional:full_length_gown:1",
    construction: gownConstruction,
  }),
  emptyLedger,
  "changing fabric does not preview a new additional garment",
);
assert.equal(
  mergeProvisionalAdditionalConstructionForLiveSummary(emptyLedger, null),
  emptyLedger,
  "cancelling the fabric transaction removes the live-summary preview",
);

console.log(
  "PASS: deferred additional-garment Custom Details wait for a Step 3 design",
);
