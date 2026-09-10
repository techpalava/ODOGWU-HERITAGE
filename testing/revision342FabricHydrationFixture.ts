import type {
  FabricAllocation,
  PhysicalGarmentOccurrenceIdentityStateV1,
} from "../src/types";
import type { PhysicalGarmentOccurrence } from "../src/utils/designSourceState";

/**
 * Structural, non-customer fixture for the historical revision-342 loss
 * regression. Additional assignments deliberately use the former production
 * shape: identity/type/units/sourceRole, without newer relationship metadata.
 */
export const createRevision342FabricHydrationFixture = (): {
  occurrences: PhysicalGarmentOccurrence[];
  occurrenceIdentityState: PhysicalGarmentOccurrenceIdentityStateV1;
  legacyFabricAllocations: FabricAllocation[];
} => ({
  // This is persisted draft authority, not runtime enrichment. Its stable
  // generations are the values carried by the historical Design Style ledger.
  occurrenceIdentityState: {
    schemaVersion: 1,
    nextGeneration: 7,
    activeGenerationByGarmentKey: {
      "base:shirt": 1,
      "base:trouser": 2,
      "base:skirt": 3,
      "additional:bum_shorts:1": 4,
      "additional:kaftan:1": 5,
      "additional:shirt:1": 6,
    },
  },
  occurrences: [
    {
      garmentKey: "base:shirt",
      garmentType: "shirt",
      sourceRole: "main",
      fabricUnits: 1,
      occurrenceGeneration: 1,
    },
    {
      garmentKey: "base:trouser",
      garmentType: "trouser",
      sourceRole: "main",
      fabricUnits: 1,
      occurrenceGeneration: 2,
    },
    {
      garmentKey: "base:skirt",
      garmentType: "skirt",
      sourceRole: "main",
      fabricUnits: 1,
      occurrenceGeneration: 3,
    },
    {
      garmentKey: "additional:kaftan:1",
      garmentType: "kaftan",
      sourceRole: "additional",
      fabricUnits: 1,
      occurrenceGeneration: 5,
      additionalPersistenceAuthority: "construction_ledger",
    },
    {
      garmentKey: "additional:bum_shorts:1",
      garmentType: "bum_shorts",
      sourceRole: "additional",
      fabricUnits: 1,
      occurrenceGeneration: 4,
      additionalPersistenceAuthority: "construction_ledger",
    },
    {
      garmentKey: "additional:shirt:1",
      garmentType: "shirt",
      sourceRole: "additional",
      fabricUnits: 1,
      occurrenceGeneration: 6,
      additionalPersistenceAuthority: "construction_ledger",
    },
  ],
  legacyFabricAllocations: [
    {
      allocationId: "ODG-009-1",
      fabricCode: "ODG-009",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "BASE_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "main",
        },
        {
          garmentKey: "base:trouser",
          code: "BASE_TROUSER",
          garmentType: "trouser",
          fabricUnits: 1,
          sourceRole: "main",
        },
      ],
    },
    {
      allocationId: "ODG-010-1",
      fabricCode: "ODG-010",
      garmentAssignments: [
        {
          garmentKey: "base:skirt",
          code: "BASE_SKIRT",
          garmentType: "skirt",
          fabricUnits: 1,
          sourceRole: "main",
        },
        {
          garmentKey: "additional:kaftan:1",
          code: "ADDITIONAL_KAFTAN",
          garmentType: "kaftan",
          fabricUnits: 1,
          sourceRole: "additional",
        },
      ],
    },
    {
      allocationId: "ODG-012-1",
      fabricCode: "ODG-012",
      garmentAssignments: [
        {
          garmentKey: "additional:bum_shorts:1",
          code: "ADDITIONAL_BUM_SHORTS",
          garmentType: "bum_shorts",
          fabricUnits: 1,
          sourceRole: "additional",
        },
        {
          garmentKey: "additional:shirt:1",
          code: "ADDITIONAL_SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
          sourceRole: "additional",
        },
      ],
    },
  ],
});
