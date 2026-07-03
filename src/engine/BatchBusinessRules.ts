import { Batch, OrderContext } from "../types";

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
  /**
   * Centralized evaluation of order eligibility for a batch.
   * Can accept either a standard Batch or an OrderContext.
   */
  static canAcceptOrders(data: Batch | OrderContext | null | undefined): BatchEligibility {
    const now = new Date();
    
    // Default closed state for null/undefined
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

    // Normalize properties since Batch and OrderContext have different keys
    let currentGarments = 0;
    let targetGarments = 0;
    let endDateStr = "";
    let startDateStr = "";
    let allowOrders = true;
    let status = "";

    if ("expectedParticipants" in data) {
      // OrderContext
      const ctx = data as OrderContext;
      currentGarments = ctx.currentMembers || 0;
      targetGarments = ctx.expectedParticipants || 0;
      endDateStr = ctx.closingDate || "";
      startDateStr = ""; // OrderContext doesn't typically store start date
      allowOrders = ctx.allowOrders !== false; // defaults to true
      status = ctx.batchStatus || "";
    } else {
      // Batch
      const batch = data as Batch;
      currentGarments = batch.currentGarments || 0;
      targetGarments = batch.targetGarments || 0;
      endDateStr = batch.endDate || "";
      startDateStr = batch.startDate || "";
      allowOrders = batch.allowOrders !== false;
      status = batch.status || "";
    }

    const remainingCapacity = Math.max(0, targetGarments - currentGarments);
    const completionPercentage = targetGarments > 0 
      ? Math.min(100, Math.round((currentGarments / targetGarments) * 100))
      : 0;

    let daysRemaining = 0;
    let hoursRemaining = 0;
    let minutesRemaining = 0;
    let isTimeUp = false;

    if (endDateStr) {
      const endDate = new Date(endDateStr);
      // ensure end date represents the end of the day if no time is specified
      if (endDateStr.length <= 10) {
        endDate.setHours(23, 59, 59, 999);
      }
      const diffMs = endDate.getTime() - now.getTime();
      
      if (diffMs > 0) {
        daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        hoursRemaining = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        minutesRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      } else {
        isTimeUp = true;
      }
    } else {
        // If no end date, assume it's not time up, but might be restricted by other rules
    }
    
    // Evaluate conditions
    const isFull = currentGarments >= targetGarments && targetGarments > 0;
    const isManuallyClosed = !allowOrders;
    const isStatusClosed = ["CLOSED", "LOCKED", "COMPLETED", "PRODUCTION_READY", "PRODUCTION_STARTED", "QUALITY_CONTROL", "PACKED", "SHIPPED", "ARRIVED_NETHERLANDS", "READY_FOR_PICKUP"].includes(status);
    
    let isStarted = true;
    if (startDateStr) {
       const startDate = new Date(startDateStr);
       if (now < startDate) {
           isStarted = false;
       }
    }

    if (!isStarted) {
        return {
            canAcceptOrders: false,
            statusCode: "NOT_YET_OPEN",
            displayLabel: "Coming Soon",
            reason: "Registration window has not yet opened",
            remainingCapacity,
            completionPercentage,
            daysRemaining,
            hoursRemaining,
            minutesRemaining
        };
    }

    if (isStatusClosed) {
        return {
            canAcceptOrders: false,
            statusCode: "REGISTRATION_CLOSED",
            displayLabel: "Registration Closed",
            reason: "Batch has been closed by administration",
            remainingCapacity,
            completionPercentage,
            daysRemaining,
            hoursRemaining,
            minutesRemaining
        };
    }

    if (isTimeUp) {
        return {
            canAcceptOrders: false,
            statusCode: "EXPIRED",
            displayLabel: "Registration Closed",
            reason: "Registration deadline has passed",
            remainingCapacity,
            completionPercentage,
            daysRemaining,
            hoursRemaining,
            minutesRemaining
        };
    }

    if (isManuallyClosed) {
        return {
            canAcceptOrders: false,
            statusCode: "ORDERS_DISABLED",
            displayLabel: "Registration Closed",
            reason: "Orders are currently paused",
            remainingCapacity,
            completionPercentage,
            daysRemaining,
            hoursRemaining,
            minutesRemaining
        };
    }

    if (isFull) {
        return {
            canAcceptOrders: false,
            statusCode: "BATCH_FULL",
            displayLabel: "Registration Closed",
            reason: "Target garment capacity reached",
            remainingCapacity,
            completionPercentage,
            daysRemaining,
            hoursRemaining,
            minutesRemaining
        };
    }

    // Default OPEN
    return {
      canAcceptOrders: true,
      statusCode: "OPEN_FOR_ORDERS",
      displayLabel: "Open for Orders",
      reason: null,
      remainingCapacity,
      completionPercentage,
      daysRemaining,
      hoursRemaining,
      minutesRemaining
    };
  }


  static getLifecycleStage(batch: any): string {
    if (!batch || !batch.status) return "Unknown";
    const status = batch.status;
    
    if (["DRAFT", "YET_TO_START", "COMING_SOON"].includes(status)) return "Upcoming";
    if (["OPEN", "RECRUITING"].includes(status)) return "Recruiting";
    if (["ALMOST_FULL"].includes(status)) return "Almost Full";
    if (["FULL", "CLOSED"].includes(status)) return "Registration Closed";
    if (["PRODUCTION_READY", "PRODUCTION_STARTED", "IN_PRODUCTION"].includes(status)) return "In Production";
    if (["QUALITY_CONTROL"].includes(status)) return "Quality Control";
    if (["PACKED", "SHIPPED", "ARRIVED_NETHERLANDS"].includes(status)) return "Shipping";
    if (["READY_FOR_PICKUP", "COLLECTED", "COMPLETED"].includes(status)) return "Completed";
    
    return "Unknown";
  }

  static getHeroPresentation(batch: any): any {
    if (!batch) {
      return {
        title: "Community Batch",
        headline: "Community Batch Registration Closed",
        subheadline: "There are currently no active batches open for registration.",
        badgeText: "Registration Closed",
        badgeStyle: "red",
        buttonText: "Create Your Own Batch",
        buttonAction: "CREATE_OWN",
        showCountdown: false,
        showProgress: false
      };
    }

    const stage = this.getLifecycleStage(batch);
    const eligibility = this.canAcceptOrders(batch);
    
    const presentation = {
      title: "ACTIVE GROUP",
      headline: batch.batchName || batch.name || "Community Batch",
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

    if (stage === "In Production") {
      presentation.title = "CURRENTLY IN PRODUCTION";
      presentation.badgeText = "Tailoring in Nigeria";
      presentation.badgeStyle = "gold-static";
      presentation.buttonText = "Follow Production";
      presentation.buttonAction = "TRACK_BATCH";
      presentation.showCountdown = false;
      presentation.productionPhase = "Locked & Sent to Lagos Ateliers";
      presentation.productionDescription = `Deadline passed on ${batch.closingDate || batch.endDate || "schedule"}. Custom fabric is locked, patterns are being custom-drawn.`;
    } else if (stage === "Quality Control") {
      presentation.title = "QUALITY CONTROL";
      presentation.badgeText = "Final Inspections";
      presentation.badgeStyle = "gold-static";
      presentation.buttonText = "Follow Production";
      presentation.buttonAction = "TRACK_BATCH";
      presentation.showCountdown = false;
      presentation.productionPhase = "Quality Control phase";
      presentation.productionDescription = "Artisans are performing final finishing and quality inspections.";
    } else if (stage === "Shipping") {
      presentation.title = "SHIPPING TO NETHERLANDS";
      presentation.badgeText = "On Its Way";
      presentation.badgeStyle = "green";
      presentation.buttonText = "Track Delivery";
      presentation.buttonAction = "TRACK_BATCH";
      presentation.showCountdown = false;
      presentation.productionPhase = "In Transit";
      presentation.productionDescription = "Your garments are currently shipping to the Netherlands.";
    } else if (stage === "Completed") {
      presentation.title = "BATCH COMPLETE";
      presentation.badgeText = "Delivered";
      presentation.badgeStyle = "green";
      presentation.buttonText = "View Gallery";
      presentation.buttonAction = "VIEW_GALLERY";
      presentation.showCountdown = false;
      presentation.showProgress = false;
      presentation.productionPhase = "Successfully Delivered";
      presentation.productionDescription = "This batch has been successfully completed and delivered.";
    } else if (stage === "Registration Closed" && !eligibility.canAcceptOrders) {
      // In case it's just closed but not in production yet
      presentation.title = "SOURCING PHASE";
      presentation.badgeText = "Registration Closed";
      presentation.badgeStyle = "red";
      presentation.buttonText = "Create Your Own Batch";
      presentation.buttonAction = "CREATE_OWN";
      presentation.showCountdown = false;
      presentation.productionPhase = "Locked & Preparing";
      presentation.productionDescription = `Deadline passed on ${batch.closingDate || batch.endDate || "schedule"}. Preparing to send orders to Lagos Ateliers.`;
    }

    return presentation;
  }

  static getTimelineBadge(batch: any): any {
    const stage = this.getLifecycleStage(batch);
    switch (stage) {
      case "Upcoming": return { label: "Upcoming", colorClass: "bg-heritage-gold/20 text-heritage-gold" };
      case "Recruiting": return { label: "Recruiting", colorClass: "bg-heritage-gold/20 text-heritage-gold" };
      case "Almost Full": return { label: "Almost Full", colorClass: "bg-heritage-gold/20 text-heritage-gold" };
      case "Registration Closed": return { label: "Closed", colorClass: "bg-red-600/20 text-red-300" };
      case "In Production": return { label: "In Production", colorClass: "bg-blue-600/20 text-blue-300" };
      case "Quality Control": return { label: "Quality Control", colorClass: "bg-purple-600/20 text-purple-300" };
      case "Shipping": return { label: "Shipping", colorClass: "bg-teal-600/20 text-teal-300" };
      case "Completed": return { label: "Completed", colorClass: "bg-heritage-green text-white" };
      default: return { label: "Unknown", colorClass: "bg-white/10 text-white/50" };
    }
  }

  static getProgressState(batch: any): any {
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

  static getNextMilestone(batch: any): any {
    if (!batch) return null;
    const stage = this.getLifecycleStage(batch);
    if (["Upcoming", "Recruiting", "Almost Full"].includes(stage)) {
      return { name: "Registration Closes", date: batch.closingDate || batch.endDate };
    } else if (stage === "Registration Closed") {
      return { name: "Production Begins", date: "Soon" };
    } else if (stage === "In Production" || stage === "Quality Control") {
      return { name: "Shipping Starts", date: "After Quality Control" };
    } else if (stage === "Shipping") {
      return { name: "Delivery", date: batch.deliveryWindow || batch.estimatedDelivery };
    }
    return { name: "Completed", date: "" };
  }

  static getCommunityMessage(batch: any): string {
    if (!batch) return "";
    const stage = this.getLifecycleStage(batch);
    switch (stage) {
      case "Upcoming": return "A new batch is opening soon.";
      case "Recruiting": return "Registration is now open. Join the community batch.";
      case "Almost Full": return "Registration is almost full. Secure your spot.";
      case "Registration Closed": return "Registration is closed. Production begins soon.";
      case "In Production": return "Your garments are being handcrafted in Nigeria.";
      case "Quality Control": return "Garments are undergoing final quality checks.";
      case "Shipping": return "Your batch is currently on its way to the Netherlands.";
      case "Completed": return "Thank you for participating in this community batch.";
      default: return "";
    }
  }

  static canEditBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return batch.status === "DRAFT" || batch.status === "OPEN";
  }

  static canJoinBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return batch.status === "DRAFT" || batch.status === "OPEN" || batch.status === "ALMOST_FULL";
  }

  static canDeleteBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return batch.status === "DRAFT";
  }

  static canCloseBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return batch.status === "OPEN" || batch.status === "ALMOST_FULL";
  }

  static canShipBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return ["QUALITY_CONTROL", "PACKED"].includes(batch.status);
  }

  static canLeaveBatch(batch: any): boolean {
    if (!batch || !batch.status) return false;
    return batch.status !== "LOCKED" && batch.status !== "COMPLETED";
  }
}
