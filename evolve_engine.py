import re

with open('src/engine/BatchBusinessRules.ts', 'r') as f:
    content = f.read()

new_methods = """
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
"""

content = content.replace("  static canEditBatch(batch: any): boolean {", new_methods + "\n  static canEditBatch(batch: any): boolean {")

with open('src/engine/BatchBusinessRules.ts', 'w') as f:
    f.write(content)
