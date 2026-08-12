import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import {
  createAdditionalGarmentSelection,
  resolveAdditionalGarmentPriceRows,
  resolveAllowedAdditionalGarments,
} from "./src/utils/additionalGarmentDomain";

const composition = [
  { key: "shirt", garmentType: "shirt" as const, fabricUnits: 1 as const },
  { key: "trouser", garmentType: "trouser" as const, fabricUnits: 1 as const },
];

const allowed = resolveAllowedAdditionalGarments(composition);
assert.deepEqual(
  allowed.map((garment) => garment.garmentType),
  ["shirt", "trouser"],
  "the optional UI must only offer physical garment types represented by the main composition",
);

const state = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  FabricAllocationStateEngine.initialize(),
  "HT-001",
  [{ code: "MAIN_SHIRT", garmentSpec: composition[0], sourceRole: "main" }],
);
const selection = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: composition,
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(selection.status, "resolved");
if (selection.status !== "resolved") throw new Error("Expected an allowed additional garment.");

const appended = appendCustomerFabricGarment(state, "HT-001", selection.selection);
const additional = appended.fabricAllocations
  .flatMap((allocation) => allocation.garmentAssignments)
  .find((assignment) => assignment.sourceRole === "additional");
assert.ok(additional, "the UI-facing append helper must create an additional allocation record");

const inherited = resolveAdditionalGarmentPriceRows({
  additionalAssignments: [additional],
  mainGarmentPriceRows: [{ garmentType: "shirt", price: 65 }],
});
assert.deepEqual(inherited.rows, [
  {
    assignmentId: additional.garmentKey,
    garmentType: "shirt",
    label: "Shirt",
    price: 65,
  },
]);

const source = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.ok(
  source.includes("onAddAdditionalGarment={handleAddAdditionalGarment}"),
  "the customer selector must call the UI-facing additional garment handler",
);
assert.ok(
  source.includes("appendCustomerFabricGarment("),
  "the UI-facing handler must delegate append behavior to the centralized allocation flow",
);
assert.ok(
  !source.includes("additionalGarmentParentSection"),
  "the old additional physical garment radio section must not remain active",
);

console.log("Optional additional garment UI regression checks passed.");
