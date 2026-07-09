import { Batch, OrderContext } from "../types";

export interface BatchProgressSummary {
  targetGarments: number;
  committedGarments: number;
  remainingGarments: number;
  completionPercentage: number;
  dressesCompleted: number;
  newParticipants: number;
  returningParticipants: number;
  capacityStatus: "OPEN" | "FULL" | "OVERCAPACITY";
  productionStatus: string;
  progressLabel: string;
  progressBadge: string;
}

export const BatchProgressEngine = {
  getSummary: (data: Batch | Partial<OrderContext> | null | undefined): BatchProgressSummary => {
    let currentGarments = 0;
    let targetGarments = 0;
    let status = "";
    
    if (data) {
      if ("expectedParticipants" in data) {
        currentGarments = (data as OrderContext).currentMembers || 0;
        targetGarments = (data as OrderContext).expectedParticipants || 0;
        status = (data as OrderContext).batchStatus || "";
      } else {
        currentGarments = (data as Batch).currentGarments || 0;
        targetGarments = (data as Batch).targetGarments || 0;
        status = (data as Batch).status || "";
      }
    }

    const remainingGarments = Math.max(0, targetGarments - currentGarments);
    let completionPercentage = 0;
    
    if (targetGarments > 0) {
      completionPercentage = Math.min(100, Math.round((currentGarments / targetGarments) * 100));
    }
    
    let capacityStatus: "OPEN" | "FULL" | "OVERCAPACITY" = "OPEN";
    if (currentGarments >= targetGarments && targetGarments > 0) {
      capacityStatus = currentGarments > targetGarments ? "OVERCAPACITY" : "FULL";
    }

    const progressBadge = `${currentGarments} / ${targetGarments}`;

    return {
      targetGarments,
      committedGarments: currentGarments,
      remainingGarments,
      completionPercentage,
      dressesCompleted: 0,
      newParticipants: 0,
      returningParticipants: 0,
      capacityStatus,
      productionStatus: status,
      progressLabel: "",
      progressBadge,
    };
  }
};
