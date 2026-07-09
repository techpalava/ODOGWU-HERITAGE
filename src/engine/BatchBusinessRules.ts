import { Batch, OrderContext } from "../types";
import { CapacityService } from "../services/CapacityService";

export interface BatchEligibility {
  canAcceptOrders: boolean;
  statusCode: string;
  displayLabel: string;
  reason: string | null;
  remainingCapacity: number;
  completionPercentage: number;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
}

export class BatchBusinessRules {
  static canAcceptOrders(data: Batch | Partial<OrderContext> | null | undefined): BatchEligibility {
    const now = new Date();
    
    const defaultClosed: BatchEligibility = {
      canAcceptOrders: false,
      statusCode: "NOT_YET_OPEN",
      displayLabel: "Registration Closed",
      reason: "No active batch found",
      remainingCapacity: 0,
      completionPercentage: 0,
      daysRemaining: 0,
      hoursRemaining: 0,
      minutesRemaining: 0
    };

    if (!data) return defaultClosed;

    let endDateStr = "";
    let startDateStr = "";
    let allowOrders = true;
    let status = "";
    if ("expectedParticipants" in data) {
      const ctx = data as OrderContext;
      endDateStr = ctx.closingDate || "";
      startDateStr = ""; 
      allowOrders = ctx.allowOrders !== false;
      status = ctx.batchStatus || "";
    } else {
      const batch = data as Batch;
      endDateStr = batch.endDate || "";
      startDateStr = batch.startDate || "";
      allowOrders = batch.allowOrders !== false;
      status = batch.status || "";
    }

    const capacitySummary = CapacityService.getCapacitySummary(data);
    const remainingCapacity = capacitySummary.remainingGarments;
    const completionPercentage = capacitySummary.completionPercentage;

    const isStarted = status === "PRODUCTION_STARTED";
    const isStatusClosed = status === "CLOSED" || status === "COMPLETED";
    const isManuallyClosed = !allowOrders;
    const isTimeUp = endDateStr ? now > new Date(endDateStr) : false;
    const isFull = capacitySummary.capacityStatus === "FULL" || capacitySummary.capacityStatus === "OVERCAPACITY";

    let timeDiff = 0;
    let daysRemaining = 0;
    let hoursRemaining = 0;
    let minutesRemaining = 0;

    if (endDateStr) {
      const endDate = new Date(endDateStr);
      timeDiff = endDate.getTime() - now.getTime();
      if (timeDiff > 0) {
        daysRemaining = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
        hoursRemaining = Math.floor((timeDiff / (1000 * 60 * 60)) % 24);
        minutesRemaining = Math.floor((timeDiff / (1000 * 60)) % 60);
      }
    }

    const baseResult = {
      remainingCapacity,
      completionPercentage,
      daysRemaining,
      hoursRemaining,
      minutesRemaining
    };

    if (!isStarted && (!startDateStr || now < new Date(startDateStr))) {
        return {
            ...baseResult,
            canAcceptOrders: false,
            statusCode: "NOT_YET_OPEN",
            displayLabel: "Coming Soon",
            reason: "Registration period has not started",
        };
    }

    if (isStatusClosed) {
        return {
            ...baseResult,
            canAcceptOrders: false,
            statusCode: "REGISTRATION_CLOSED",
            displayLabel: "Registration Closed",
            reason: "Batch production has already started",
        };
    }

    if (isTimeUp) {
        return {
            ...baseResult,
            canAcceptOrders: false,
            statusCode: "EXPIRED",
            displayLabel: "Registration Closed",
            reason: "Registration deadline has passed",
        };
    }

    if (isManuallyClosed) {
        return {
            ...baseResult,
            canAcceptOrders: false,
            statusCode: "ORDERS_DISABLED",
            displayLabel: "Registration Closed",
            reason: "Orders have been manually disabled",
        };
    }

    if (isFull) {
        return {
            ...baseResult,
            canAcceptOrders: false,
            statusCode: "BATCH_FULL",
            displayLabel: "Registration Closed",
            reason: "Target garment capacity reached",
        };
    }

    return {
      ...baseResult,
      canAcceptOrders: true,
      statusCode: "OPEN_FOR_ORDERS",
      displayLabel: "Open for Orders",
      reason: null,
    };
  }

  static getLifecycleStage(batch: Batch | Partial<OrderContext> | null | undefined): string {
    if (!batch) return "Registration Closed";
    
    let status = "";
    if ("expectedParticipants" in batch) {
      status = (batch as OrderContext).batchStatus || "";
    } else {
      status = (batch as Batch).status || "";
    }

    if (status === "PRODUCTION_STARTED") return "In Production";
    if (status === "COMPLETED" || status === "DELIVERED") return "Successfully Delivered";
    
    const eligibility = this.canAcceptOrders(batch);
    if (eligibility.canAcceptOrders) return "Registration Open";
    return "Registration Closed";
  }

  static getPresentation(batch: Batch | Partial<OrderContext> | null | undefined): any {
    const stage = this.getLifecycleStage(batch);
    const eligibility = this.canAcceptOrders(batch);
    
    const presentation = {
      title: "BATCH STATUS",
      headline: stage,
      subheadline: "",
      badgeText: eligibility.displayLabel,
      badgeStyle: eligibility.canAcceptOrders ? "pulsing-gold" : "red",
      buttonText: "Join Batch",
      buttonAction: eligibility.canAcceptOrders ? "JOIN_BATCH" : "CREATE_OWN",
      showCountdown: eligibility.canAcceptOrders,
      showProgress: true,
      productionPhase: "",
      productionDescription: ""
    };

    if (stage === "Registration Open") {
      presentation.title = "CURRENT BATCH";
      presentation.headline = "Open for Registrations";
      if (eligibility.daysRemaining > 0) {
        presentation.subheadline = `Closing in ${eligibility.daysRemaining} days`;
      } else {
        presentation.subheadline = `Closing in ${eligibility.hoursRemaining}h ${eligibility.minutesRemaining}m`;
      }
    } else if (stage === "In Production") {
      presentation.title = "SOURCING PHASE";
      presentation.headline = "Batch is in Production";
      presentation.badgeText = "In Production";
      presentation.badgeStyle = "green";
      presentation.buttonText = "Pre-register Next Batch";
      presentation.buttonAction = "CREATE_OWN";
      presentation.showCountdown = false;
      presentation.productionPhase = "Fabric Sourcing";
      presentation.productionDescription = "Artisans are currently sourcing and preparing the authentic heritage fabrics for this batch.";
    } else if (stage === "Successfully Delivered") {
      presentation.title = "COMPLETED";
      presentation.headline = "Batch Delivered";
      presentation.badgeText = "Completed";
      presentation.badgeStyle = "gray";
      presentation.buttonText = "View Gallery";
      presentation.buttonAction = "VIEW_GALLERY";
      presentation.showCountdown = false;
      presentation.showProgress = false;
      presentation.productionPhase = "Successfully Delivered";
      presentation.productionDescription = "This batch has been successfully completed and delivered.";
    } else if (stage === "Registration Closed" && !eligibility.canAcceptOrders) {
      presentation.title = "SOURCING PHASE";
      presentation.headline = "Preparing for Production";
      presentation.subheadline = "Reviewing final orders";
      presentation.buttonText = "Pre-register Next Batch";
      presentation.buttonAction = "CREATE_OWN";
      presentation.showCountdown = false;
    }

    return presentation;
  }

  static getProgressState(batch: Batch | Partial<OrderContext> | null | undefined): any {
    const eligibility = this.canAcceptOrders(batch);
    return {
      completionPercentage: eligibility.completionPercentage,
      remainingCapacity: eligibility.remainingCapacity,
      daysRemaining: eligibility.daysRemaining,
      hoursRemaining: eligibility.hoursRemaining,
      minutesRemaining: eligibility.minutesRemaining,
      isRegistrationOpen: eligibility.canAcceptOrders,
    };
  }

  static canEditBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open" || status === "Registration Closed";
  }

  static canJoinBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    return this.canAcceptOrders(batch).canAcceptOrders;
  }

  static canDeleteBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const capacity = CapacityService.getCapacitySummary(batch);
    return capacity.committedGarments === 0;
  }

  static canCloseBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open";
  }

  static canLeaveBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open" || status === "Registration Closed";
  }

  static getHeroPresentation(batch: Batch | Partial<OrderContext> | null | undefined): any {
    return this.getPresentation(batch);
  }

}
