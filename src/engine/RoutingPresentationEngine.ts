import { Batch } from "../types";
import { OrderRoutingDecision, OrderRouteActionType } from "./OrderRoutingEngine";
import { BatchEligibility } from "./BatchBusinessRules";

export interface RoutingActionPresentation {
  type: OrderRouteActionType | "NEXT_BATCH";
  title: string;
  description: string;
  buttonText: string;
  priority: number;
  enabled: boolean;
}

export interface BatchSummaryPresentation {
  name: string;
  status: string;
  capacity: string;
  registrationStatus: string;
  closingDate: string;
  expectedDelivery: string;
  nextMilestone: string;
}

export interface NextBatchPresentation {
  id: string;
  status: string;
  batchNumber?: number;
  name: string;
  registrationOpens: string;
  expectedDelivery: string;
  capacity?: string;
  targetGarments?: number;
  currentGarments?: number;
  startDate?: string;
}

export interface RoutingPresentationModel {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  severity: "success" | "info" | "warning" | "error";
  primaryColor: string;
  badge: string;
  
  availableActions: RoutingActionPresentation[];
  currentBatchSummary: BatchSummaryPresentation | null;
  nextCommunityBatches: NextBatchPresentation[];
  submissionMessage: string;
}

export class RoutingPresentationEngine {
  static buildPresentation(decision: OrderRoutingDecision): RoutingPresentationModel {
    const {
      canSubmitCommunityOrder,
      routingReasonKey,
      currentBatch,
      eligibility,
      routingReason,
      availableActionTypes
    } = decision;

    const baseModel = this.getBaseModel(canSubmitCommunityOrder, routingReasonKey, currentBatch, eligibility);
    
    // Convert available action types into full presentation actions
    const availableActions: RoutingActionPresentation[] = [];
    
    if (availableActionTypes.includes("COMMUNITY_ORDER")) {
      availableActions.push({
        type: "COMMUNITY_ORDER",
        title: "Community Batch",
        description: "Join the current production batch and benefit from combined shipping.",
        buttonText: "Join Community Batch",
        priority: 1,
        enabled: true
      });
    }
    
    if (availableActionTypes.includes("INDIVIDUAL_ORDER")) {
      availableActions.push({
        type: "INDIVIDUAL_ORDER",
        title: "Individual Order",
        description: "Need your outfit sooner? Place an individual order outside the community production cycle.",
        buttonText: "Continue Individual Order",
        priority: 2,
        enabled: true
      });
    }
    
    if (availableActionTypes.includes("PERSONALIZED_BATCH")) {
      availableActions.push({
        type: "PERSONALIZED_BATCH",
        title: "Personalized Batch",
        description: "Create a group order for an event or special occasion.",
        buttonText: "Start Personalized Batch",
        priority: 3,
        enabled: true
      });
    }

    let currentBatchSummary = null;
    if (currentBatch) {
      currentBatchSummary = {
        name: currentBatch.name,
        status: currentBatch.status.replace(/_/g, " "),
        capacity: `${currentBatch.currentGarments} / ${currentBatch.targetGarments || 40} Garments Reserved`,
        registrationStatus: canSubmitCommunityOrder ? "Accepting Orders" : "Registration Closed",
        closingDate: currentBatch.endDate,
        expectedDelivery: currentBatch.estimatedDelivery || "TBD",
        nextMilestone: canSubmitCommunityOrder ? "Production Commences Soon" : "In Production"
      };
    }

    return {
      ...baseModel,
      availableActions,
      currentBatchSummary,
      submissionMessage: routingReason
      , nextCommunityBatches: decision.nextCommunityBatches.map(b => ({
        id: b.id,
        status: b.status,
        batchNumber: b.batchNumber,
        name: b.name,
        registrationOpens: b.startDate || (b as any).registrationOpens || "TBD",
        expectedDelivery: b.estimatedDelivery || "TBD",
        targetGarments: b.targetGarments,
        currentGarments: b.currentGarments,
        startDate: b.startDate
      }))
    };
  }

  private static getBaseModel(
    canSubmitCommunityOrder: boolean, 
    routingReasonKey: string, 
    currentBatch: Batch | undefined,
    eligibility: BatchEligibility | null
  ) {
    if (canSubmitCommunityOrder) {
      return {
        title: "Community Batch Open",
        subtitle: `Join ${currentBatch?.name || 'the current batch'}`,
        description: "Select your fabric and submit your measurements before the deadline.",
        icon: "check-circle",
        severity: "success" as const,
        primaryColor: "heritage-green",
        badge: "Accepting Orders"
      };
    }

    switch (routingReasonKey) {
      case "BATCH_FULL":
        return {
          title: "Community Registration Closed",
          subtitle: "The current community batch has reached maximum capacity.",
          description: "You can still order your outfit using one of the options below.",
          icon: "lock",
          severity: "warning" as const,
          primaryColor: "heritage-gold",
          badge: "Batch Full"
        };
      case "REGISTRATION_CLOSED":
      case "EXPIRED":
        return {
          title: "Community Registration Closed",
          subtitle: "The current community batch has already entered production.",
          description: "You can still order your outfit using one of the options below.",
          icon: "lock",
          severity: "info" as const,
          primaryColor: "heritage-ink",
          badge: "Production Started"
        };
      case "NOT_YET_OPEN":
        return {
          title: "Registration Not Started",
          subtitle: "The next community batch will open soon.",
          description: "You can still order your outfit using one of the options below or wait for the next batch.",
          icon: "clock",
          severity: "info" as const,
          primaryColor: "heritage-ink",
          badge: "Coming Soon"
        };
      case "ORDERS_DISABLED":
      case "ADMIN_DISABLED":
        return {
          title: "Community Orders Paused",
          subtitle: "Community orders are temporarily paused by the administration.",
          description: "You can still order your outfit using one of the options below.",
          icon: "alert-triangle",
          severity: "warning" as const,
          primaryColor: "heritage-gold",
          badge: "Paused"
        };
      case "PAYMENT_WINDOW_CLOSED":
        return {
          title: "Payment Window Closed",
          subtitle: "The payment window for the current batch has closed.",
          description: "You can still order your outfit using one of the options below.",
          icon: "lock",
          severity: "error" as const,
          primaryColor: "red-600",
          badge: "Closed"
        };
      case "QUALITY_HOLD":
        return {
          title: "Production Hold",
          subtitle: "The current batch is undergoing a quality review.",
          description: "You can still order your outfit using one of the options below.",
          icon: "info",
          severity: "warning" as const,
          primaryColor: "heritage-gold",
          badge: "Quality Hold"
        };
      case "FABRIC_UNAVAILABLE":
        return {
          title: "Fabric Unavailable",
          subtitle: "Required fabrics for community production are currently out of stock.",
          description: "You can still order your outfit using one of the options below.",
          icon: "alert-triangle",
          severity: "warning" as const,
          primaryColor: "heritage-gold",
          badge: "Stock Issue"
        };
      case "BATCH_CANCELLED":
        return {
          title: "Batch Cancelled",
          subtitle: "The current community batch was cancelled.",
          description: "You can still order your outfit using one of the options below.",
          icon: "alert-triangle",
          severity: "error" as const,
          primaryColor: "red-600",
          badge: "Cancelled"
        };
      case "CONTEXT_INDIVIDUAL_ORDER":
        return {
          title: "Individual Order",
          subtitle: "You are placing an individual order outside the community batch.",
          description: "Proceed with your individual order selections.",
          icon: "info",
          severity: "info" as const,
          primaryColor: "heritage-ink",
          badge: "Individual"
        };
      case "CONTEXT_PERSONALIZED_BATCH":
        return {
          title: "Personalized Batch",
          subtitle: "You are placing an order for a personalized group batch.",
          description: "Proceed with your personalized batch selections.",
          icon: "users",
          severity: "info" as const,
          primaryColor: "heritage-ink",
          badge: "Group Order"
        };
      default:
        return {
          title: "Community Registration Closed",
          subtitle: "The current community batch is not accepting new orders.",
          description: "You can still order your outfit using one of the options below.",
          icon: "lock",
          severity: "info" as const,
          primaryColor: "heritage-ink",
          badge: eligibility?.displayLabel || "Closed"
        };
    }
  }
}
