import type { FabricAllocation } from "../types.js";

/**
 * Count committed physical Fabric allocations by fabricCode.
 *
 * Each allocation entry consumes exactly 1 inventory unit, regardless of how
 * many half-capacity garments share that allocation.
 *
 * Never trusts a client-supplied quantity field — only the allocation list
 * length grouped by fabricCode.
 */
export const countPhysicalFabricAllocationsByCode = (
  fabricAllocations: readonly Pick<FabricAllocation, "fabricCode">[],
): Map<string, number> => {
  const quantities = new Map<string, number>();

  for (const allocation of fabricAllocations) {
    const fabricCode =
      typeof allocation.fabricCode === "string"
        ? allocation.fabricCode.trim()
        : "";
    if (!fabricCode) {
      throw new Error(
        "Every Fabric allocation must include a non-empty fabricCode.",
      );
    }
    quantities.set(fabricCode, (quantities.get(fabricCode) ?? 0) + 1);
  }

  return quantities;
};

export const physicalFabricAllocationQuantitiesToRecord = (
  quantities: Map<string, number>,
): Record<string, number> =>
  Object.fromEntries(
    [...quantities.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
