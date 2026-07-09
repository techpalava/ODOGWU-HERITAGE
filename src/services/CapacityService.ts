import { BatchProgressEngine, BatchProgressSummary } from "../engine/BatchProgressEngine";
import { Batch, OrderContext } from "../types";
import { useAppStore } from "../store/useAppStore";

export const CapacityService = {
  getCapacitySummary(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): BatchProgressSummary {
    let data: Batch | Partial<OrderContext> | null | undefined = undefined;
    if (typeof dataOrId === "string") {
      const batches = useAppStore.getState().batches;
      data = batches.find((b) => b.id === dataOrId);
    } else {
      data = dataOrId;
    }
    return BatchProgressEngine.getSummary(data);
  },

  getReservedCapacity(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): number {
    return this.getCapacitySummary(dataOrId).committedGarments;
  },

  getRemainingCapacity(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): number {
    return this.getCapacitySummary(dataOrId).remainingGarments;
  },

  getTargetCapacity(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): number {
    return this.getCapacitySummary(dataOrId).targetGarments;
  },

  getCapacityStatus(dataOrId: string | Batch | Partial<OrderContext> | null | undefined) {
    return this.getCapacitySummary(dataOrId).capacityStatus;
  },

  getCapacityBreakdown(dataOrId: string | Batch | Partial<OrderContext> | null | undefined) {
    const summary = this.getCapacitySummary(dataOrId);
    return {
      reserved: summary.committedGarments,
      remaining: summary.remainingGarments,
      target: summary.targetGarments,
      percentage: summary.completionPercentage
    };
  },

  isBatchFull(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): boolean {
    const status = this.getCapacityStatus(dataOrId);
    return status === "FULL" || status === "OVERCAPACITY";
  },

  isCapacityAvailable(dataOrId: string | Batch | Partial<OrderContext> | null | undefined): boolean {
    return !this.isBatchFull(dataOrId);
  }
};
