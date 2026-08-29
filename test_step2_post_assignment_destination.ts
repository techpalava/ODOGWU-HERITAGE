import assert from "node:assert/strict";
import { resolveStep2PostAssignmentDestination } from "./src/utils/step2PostAssignmentDestination";

const canonical = [
  "base:shirt",
  "base:trouser",
  "base:skirt",
  "base:dress",
] as const;

assert.deepEqual(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["base:shirt"],
    canonicalGarmentKeys: canonical,
    remainingUnassignedGarmentKeys: ["base:trouser", "base:skirt", "base:dress"],
  }),
  { garmentKey: "base:shirt", kind: "assigned" },
  "Exactly one assigned garment must land on that exact garmentKey.",
);

assert.deepEqual(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["base:shirt", "base:trouser"],
    canonicalGarmentKeys: canonical,
    remainingUnassignedGarmentKeys: ["base:skirt", "base:dress"],
  }),
  { garmentKey: "base:skirt", kind: "next_unassigned" },
  "Multiple assignments with remaining work must jump to the next canonical unassigned garment.",
);

assert.deepEqual(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["base:shirt", "base:trouser"],
    canonicalGarmentKeys: ["base:shirt", "base:trouser"],
    remainingUnassignedGarmentKeys: [],
  }),
  { garmentKey: "base:trouser", kind: "assigned" },
  "Completing all garments must land on the last newly assigned garmentKey.",
);

assert.deepEqual(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["base:trouser", "base:skirt"],
    canonicalGarmentKeys: canonical,
    remainingUnassignedGarmentKeys: ["base:shirt", "base:dress"],
  }),
  { garmentKey: "base:shirt", kind: "next_unassigned" },
  "Next unassigned must use canonical order, not last-checked order.",
);

assert.deepEqual(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["base:shirt", "additional:dress:1"],
    canonicalGarmentKeys: ["base:shirt", "base:trouser"],
    remainingUnassignedGarmentKeys: ["base:trouser"],
  }),
  { garmentKey: "base:shirt", kind: "assigned" },
  "Navigation must ignore non-canonical additional garmentKeys.",
);

assert.equal(
  resolveStep2PostAssignmentDestination({
    assignedGarmentKeys: ["additional:dress:1"],
    canonicalGarmentKeys: ["base:shirt"],
    remainingUnassignedGarmentKeys: ["base:shirt"],
  }),
  null,
  "A Step 4-only assignment must not produce a Step 2 destination.",
);

console.log("PASS: Step 2 post-assignment destination policy");
