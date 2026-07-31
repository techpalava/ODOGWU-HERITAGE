import { BatchProgressEngine, BatchProgressSummary } from "../engine/BatchProgressEngine";
import { Batch, OrderContext } from "../types";

export const CapacityService = {
  getCapacitySummary(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): BatchProgressSummary {
    return BatchProgressEngine.getSummary(data);
  },

  getReservedCapacity(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): number {
    return this.getCapacitySummary(data).committedGarments;
  },

  getRemainingCapacity(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): number {
    return this.getCapacitySummary(data).remainingGarments;
  },

  getTargetCapacity(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): number {
    return this.getCapacitySummary(data).targetGarments;
  },

  getCapacityStatus(
    data: Batch | Partial<OrderContext> | null | undefined,
  ) {
    return this.getCapacitySummary(data).capacityStatus;
  },

  getCapacityBreakdown(
    data: Batch | Partial<OrderContext> | null | undefined,
  ) {
    const summary = this.getCapacitySummary(data);
    return {
      reserved: summary.committedGarments,
      remaining: summary.remainingGarments,
      target: summary.targetGarments,
      percentage: summary.completionPercentage
    };
  },

  isBatchFull(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): boolean {
    const status = this.getCapacityStatus(data);
    return status === "FULL" || status === "OVERCAPACITY";
  },

  isCapacityAvailable(
    data: Batch | Partial<OrderContext> | null | undefined,
  ): boolean {
    return !this.isBatchFull(data);
  }
};
