import assert from "node:assert/strict";
import { FabricCapacityEngine } from "./src/engine/FabricCapacityEngine";
import type { FabricAllocation, FabricGarmentAssignment, FabricGarmentInputAssignment } from "./src/types";

const summarize = (garments: FabricGarmentAssignment[]) =>
  garments.map((assignment) => {
    const summary: Record<string, unknown> = {
      garmentKey: assignment.garmentKey,
      code: assignment.code,
      garmentType: assignment.garmentType,
      fabricUnits: assignment.fabricUnits,
    };
    if (assignment.lowerGarmentType) {
      summary.lowerGarmentType = assignment.lowerGarmentType;
    }
    return summary;
  });

const assertResolved = (
  allocation: FabricAllocation,
  expectedUnits: number,
  expectedGarments?: Array<{
    garmentKey: string;
    code: string;
    garmentType: string;
    fabricUnits: number;
    lowerGarmentType?: "trousers" | "skirt";
  }>,
) => {
  const result = FabricCapacityEngine.resolveFabricAllocation(allocation);
  assert.equal(result.status, "resolved", "Allocation should resolve successfully");
  assert.equal(result.totalUnits, expectedUnits, "Total fabric units should match expected capacity");
  if (expectedGarments) {
    assert.deepEqual(summarize(result.garments), expectedGarments);
  }
};

const assertUnclassified = (
  input: FabricGarmentInputAssignment,
  expectedMessage: string,
) => {
  const result = FabricCapacityEngine.resolveGarmentAssignment(input);
  assert.equal(result.status, "unclassified", "Garment input should be unclassified");
  assert.ok(
    result.reason.includes(expectedMessage),
    `Expected unclassified reason to include '${expectedMessage}', got '${result.reason}'`,
  );
};

const assertCapacityExceeded = (
  allocation: FabricAllocation,
  expectedUsedUnitsBeforeAttempt: number,
  expectedAttemptedUnits: number,
  expectedGarmentKey: string,
) => {
  const result = FabricCapacityEngine.resolveFabricAllocation(allocation);
  assert.equal(result.status, "capacity_exceeded", "Allocation should report capacity exceeded");
  assert.equal(result.usedUnitsBeforeAttempt, expectedUsedUnitsBeforeAttempt);
  assert.equal(result.attemptedUnits, expectedAttemptedUnits);
  assert.equal(result.maxUnits, 2);
  assert.equal(result.attemptedGarment.garmentKey, expectedGarmentKey);
};

const resolveInputAllocation = (
  allocationId: string,
  fabricCode: string,
  inputAssignments: Array<{ code: string; lowerGarmentType?: "trousers" | "skirt"; garmentSpec?: any }>,
): FabricAllocation => {
  const garmentAssignments: FabricGarmentAssignment[] = [];
  for (const input of inputAssignments) {
    const result = FabricCapacityEngine.resolveGarmentAssignment(input);
    assert.equal(result.status, "resolved", `Expected ${input.code} to resolve`);
    garmentAssignments.push(...result.assignments);
  }
  return { allocationId, fabricCode, garmentAssignments };
};

const assertCodeResolves = (
  code: string,
  expectedGarments: Array<{
    garmentKey: string;
    code: string;
    garmentType: string;
    fabricUnits: number;
    lowerGarmentType?: "trousers" | "skirt";
  }>,
) => {
  const resolution = FabricCapacityEngine.resolveGarmentAssignment({ code });
  assert.equal(resolution.status, "resolved", `Expected ${code} to resolve`);

  assertResolved(
    {
      allocationId: `resolve-${code}`,
      fabricCode: "FABRIC_TEST",
      garmentAssignments: resolution.assignments,
    },
    expectedGarments.reduce((sum, garment) => sum + garment.fabricUnits, 0),
    expectedGarments,
  );
};

assertCodeResolves("G1", [
  { garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 },
]);
assertCodeResolves("G2", [
  { garmentKey: "G2:shirt", code: "G2", garmentType: "shirt", fabricUnits: 1 },
]);
assertCodeResolves("G3", [
  { garmentKey: "G3:standard_shorts", code: "G3", garmentType: "standard_shorts", fabricUnits: 1 },
]);
assertCodeResolves("G4", [
  { garmentKey: "G4:trouser", code: "G4", garmentType: "trouser", fabricUnits: 1 },
]);
assertCodeResolves("G5.1", [
  { garmentKey: "G5.1:shirt", code: "G5.1", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.1:standard_shorts", code: "G5.1", garmentType: "standard_shorts", fabricUnits: 1 },
]);
assertCodeResolves("G5.2", [
  { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertCodeResolves("G6.1", [
  { garmentKey: "G6.1:shirt", code: "G6.1", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G6.1:standard_shorts", code: "G6.1", garmentType: "standard_shorts", fabricUnits: 1 },
]);
assertCodeResolves("G6.2", [
  { garmentKey: "G6.2:shirt", code: "G6.2", garmentType: "shirt", fabricUnits: 1 },
  { garmentKey: "G6.2:trouser", code: "G6.2", garmentType: "trouser", fabricUnits: 1 },
]);
assertCodeResolves("L1", [
  { garmentKey: "L1:dress", code: "L1", garmentType: "dress", fabricUnits: 1 },
]);
assertCodeResolves("L2", [
  { garmentKey: "L2:dress", code: "L2", garmentType: "dress", fabricUnits: 1 },
]);
assertCodeResolves("L3", [
  { garmentKey: "L3:dress", code: "L3", garmentType: "dress", fabricUnits: 1 },
]);
assertCodeResolves("L4", [
  { garmentKey: "L4:dress", code: "L4", garmentType: "dress", fabricUnits: 1 },
]);

assertResolved(
  resolveInputAllocation("L6-trouser", "FABRIC_L6", [
    { code: "L6", lowerGarmentType: "trousers" },
  ]),
  1,
  [
    {
      garmentKey: "L6:trouser",
      code: "L6",
      garmentType: "trouser",
      fabricUnits: 1,
      lowerGarmentType: "trousers",
    },
  ],
);

assertResolved(
  resolveInputAllocation("L7-skirt", "FABRIC_L7", [
    { code: "L7", lowerGarmentType: "skirt" },
  ]),
  1,
  [
    {
      garmentKey: "L7:skirt",
      code: "L7",
      garmentType: "skirt",
      fabricUnits: 1,
      lowerGarmentType: "skirt",
    },
  ],
);

assertResolved(
  resolveInputAllocation("L8.1-trouser", "FABRIC_L8_1", [
    { code: "L8.1", lowerGarmentType: "trousers" },
  ]),
  2,
  [
    {
      garmentKey: "L8.1:dress",
      code: "L8.1",
      garmentType: "dress",
      fabricUnits: 1,
      lowerGarmentType: "trousers",
    },
    {
      garmentKey: "L8.1:trouser",
      code: "L8.1",
      garmentType: "trouser",
      fabricUnits: 1,
      lowerGarmentType: "trousers",
    },
  ],
);

assertResolved(
  resolveInputAllocation("L8.2-skirt", "FABRIC_L8_2", [
    { code: "L8.2", lowerGarmentType: "skirt" },
  ]),
  2,
  [
    {
      garmentKey: "L8.2:dress",
      code: "L8.2",
      garmentType: "dress",
      fabricUnits: 1,
      lowerGarmentType: "skirt",
    },
    {
      garmentKey: "L8.2:skirt",
      code: "L8.2",
      garmentType: "skirt",
      fabricUnits: 1,
      lowerGarmentType: "skirt",
    },
  ],
);

assertResolved(
  resolveInputAllocation("L9.1-trouser", "FABRIC_L9_1", [
    { code: "L9.1", lowerGarmentType: "trousers" },
  ]),
  2,
  [
    {
      garmentKey: "L9.1:dress",
      code: "L9.1",
      garmentType: "dress",
      fabricUnits: 1,
      lowerGarmentType: "trousers",
    },
    {
      garmentKey: "L9.1:trouser",
      code: "L9.1",
      garmentType: "trouser",
      fabricUnits: 1,
      lowerGarmentType: "trousers",
    },
  ],
);

assertResolved(
  resolveInputAllocation("L9.2-skirt", "FABRIC_L9_2", [
    { code: "L9.2", lowerGarmentType: "skirt" },
  ]),
  2,
  [
    {
      garmentKey: "L9.2:dress",
      code: "L9.2",
      garmentType: "dress",
      fabricUnits: 1,
      lowerGarmentType: "skirt",
    },
    {
      garmentKey: "L9.2:skirt",
      code: "L9.2",
      garmentType: "skirt",
      fabricUnits: 1,
      lowerGarmentType: "skirt",
    },
  ],
);

assertUnclassified(
  { code: "L6" },
  "L6 requires lowerGarmentType",
);

assertUnclassified(
  { code: "L8.1" },
  "L8.1 requires lowerGarmentType",
);

assertResolved(
  resolveInputAllocation("standard-dress-L2", "FABRIC_DRESS", [
    { code: "L2" },
  ]),
  1,
  [{ garmentKey: "L2:dress", code: "L2", garmentType: "dress", fabricUnits: 1 }],
);

assertResolved(
  resolveInputAllocation("kaftan-explicit", "FABRIC_KAFTAN", [
    {
      code: "KAFTAN",
      garmentSpec: {
        key: "KAFTAN:kaftan",
        garmentType: "kaftan",
        fabricUnits: 2,
      },
    },
  ]),
  2,
  [
    {
      garmentKey: "KAFTAN:kaftan",
      code: "KAFTAN",
      garmentType: "kaftan",
      fabricUnits: 2,
    },
  ],
);

assertResolved(
  resolveInputAllocation("full-length-gown-explicit", "FABRIC_GOWN", [
    {
      code: "GOWN",
      garmentSpec: {
        key: "GOWN:full_length_gown",
        garmentType: "full_length_gown",
        fabricUnits: 2,
      },
    },
  ]),
  2,
  [
    {
      garmentKey: "GOWN:full_length_gown",
      code: "GOWN",
      garmentType: "full_length_gown",
      fabricUnits: 2,
    },
  ],
);

assertUnclassified(
  { code: "KAFTAN", garmentSpec: { key: "KAFTAN:kaftan", garmentType: "kaftan", fabricUnits: 1 } },
  "kaftan explicit metadata must resolve to 2 fabric units",
);

assertUnclassified(
  { code: "GOWN", garmentSpec: { key: "GOWN:full_length_gown", garmentType: "full_length_gown", fabricUnits: 1 } },
  "full_length_gown explicit metadata must resolve to 2 fabric units",
);

assertUnclassified(
  { code: "UNKNOWN" },
  "unknown garment code UNKNOWN",
);

assertResolved(
  resolveInputAllocation("shirt-trouser-valid", "FABRIC_SET", [
    { code: "G5.2" },
  ]),
  2,
  [
    { garmentKey: "G5.2:shirt", code: "G5.2", garmentType: "shirt", fabricUnits: 1 },
    { garmentKey: "G5.2:trouser", code: "G5.2", garmentType: "trouser", fabricUnits: 1 },
  ],
);

assertCapacityExceeded(
  resolveInputAllocation("shirt-trouser-skirt-exceeds", "FABRIC_OVERFLOW", [
    { code: "G5.2" },
    { code: "L7", lowerGarmentType: "skirt" },
  ]),
  2,
  1,
  "L7:skirt",
);

assertCapacityExceeded(
  resolveInputAllocation("kaftan-with-trouser", "FABRIC_KAFTAN_SET", [
    {
      code: "KAFTAN",
      garmentSpec: {
        key: "KAFTAN:kaftan",
        garmentType: "kaftan",
        fabricUnits: 2,
      },
    },
    { code: "G4" },
  ]),
  2,
  1,
  "G4:trouser",
);

assertResolved(
  resolveInputAllocation("same-fabric-one", "FABRIC_SHARED", [
    { code: "G1" },
  ]),
  1,
  [{ garmentKey: "G1:shirt", code: "G1", garmentType: "shirt", fabricUnits: 1 }],
);

assertResolved(
  resolveInputAllocation("same-fabric-two", "FABRIC_SHARED", [
    { code: "G2" },
  ]),
  1,
  [{ garmentKey: "G2:shirt", code: "G2", garmentType: "shirt", fabricUnits: 1 }],
);

console.log("All fabric capacity tests passed.");
