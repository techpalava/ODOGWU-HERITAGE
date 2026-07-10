import { Batch, OrderContext } from "../types";
import { BatchBusinessRules, BatchEligibility } from "./BatchBusinessRules";
import { getCurrentCommunityBatch, getNextUpcomingBatches } from "../utils/batchUtils";

export type OrderRouteActionType = "COMMUNITY_ORDER" | "INDIVIDUAL_ORDER" | "PERSONALIZED_BATCH";

export interface OrderRoutingDecision {
  mode: "COMMUNITY_OPEN" | "COMMUNITY_CLOSED" | "INDIVIDUAL" | "GROUP";
  allowCommunitySubmission: boolean;
  availableActionTypes: OrderRouteActionType[];
  nextCommunityBatches: Batch[];
  
  canSubmitCommunityOrder: boolean;
  currentBatch: Batch | undefined;
  
  routingReasonKey: string;
  routingReason: string;
  eligibility: BatchEligibility | null;
}

export class OrderRoutingEngine {
  static categorizeWorkspace(
    cartItems: any[],
    activeOrders: any[],
    historicalOrders: any[]
  ) {
    return {
      drafts: cartItems || [],
      communityOrders: (activeOrders || []).filter(o => o.batchType === "community"),
      individualOrders: (activeOrders || []).filter(o => o.batchType === "alone"),
      personalizedBatches: (activeOrders || []).filter(o => o.batchType === "personalized"),
      completedOrders: historicalOrders || []
    };
  }
  /**
   * Routing lifecycle lock.
   * If an order is paid, its routing is locked and cannot be changed.
   */
  static canChangeRouting(order: any): boolean {
    if (!order) return true;
    if (order.payment?.isPaid === true) return false;
    if (order.isPaid === true) return false;
    return true;
  }
  /**
   * Single authority for deciding how an order can be submitted.
   * Replaces duplicated React component logic for determining batch vs individual routing.
   *
   * @param orderContext The current order context from the UI (optional)
   * @param allBatches Array of all available batches from the store
   * @returns OrderRoutingDecision structured routing object
   */
  static evaluateOrder(
    orderContext: Partial<OrderContext> | null | undefined,
    allBatches: Batch[]
  ): OrderRoutingDecision {

    // 1. Get the current active community batch via Timeline Manager (batchUtils)
    const currentBatch = getCurrentCommunityBatch(allBatches);

    // 2. Evaluate batch eligibility securely through centralized Business Rules
    // Always check the current global community batch to determine if it's open
    const eligibility: BatchEligibility = BatchBusinessRules.canAcceptOrders(currentBatch);

    let canSubmitCommunityOrder = eligibility.canAcceptOrders;
    let routingReasonKey = "UNKNOWN";

    // 3. Collect upcoming batches
    let nextAvailableBatches: Batch[] = getNextUpcomingBatches(allBatches, 3);

    // 4. Generate a human-readable routing reason for transparency
    let routingReason = "Order can be processed individually or via a personalized group batch.";

    // If orderContext is provided, it might override the default routing behavior
    if (orderContext) {
      if (orderContext.orderType === "Group Organizer" || orderContext.orderType === "Group Member") {
        routingReason = eligibility.canAcceptOrders ? `Routing to personalized batch as requested by context (${orderContext.orderType}).` : `Community batch is closed. Routing to personalized batch.`;
        routingReasonKey = "CONTEXT_PERSONALIZED_BATCH";
        canSubmitCommunityOrder = false;
      } else if (orderContext.orderType === "Individual") {
        routingReason = eligibility.canAcceptOrders ? "Routing to individual order as explicitly requested." : `Community batch is closed. Defaulting to individual order.`;
        routingReasonKey = "CONTEXT_INDIVIDUAL_ORDER";
        canSubmitCommunityOrder = false;
      } else {
        // Evaluate the context explicitly if it's meant to represent a Community order
        const contextEligibility = BatchBusinessRules.canAcceptOrders(orderContext);
        canSubmitCommunityOrder = contextEligibility.canAcceptOrders;
        if (canSubmitCommunityOrder) {
          routingReason = `Eligible for Community Batch: ${orderContext.batchName || 'Active Batch'}`;
          routingReasonKey = "ELIGIBLE";
        } else {
          routingReason = contextEligibility.reason || "Community routing unavailable for this context.";
          routingReasonKey = contextEligibility.statusCode || "CONTEXT_UNAVAILABLE";
        }
      }
    } else {
      // Default global evaluation
      if (canSubmitCommunityOrder) {
        routingReason = `Eligible for current Community Batch: ${currentBatch?.name}`;
        routingReasonKey = "ELIGIBLE";
      } else if (eligibility.reason) {
        routingReason = `Community routing unavailable: ${eligibility.reason}`;
        routingReasonKey = eligibility.statusCode || "UNAVAILABLE";
      } else {
        routingReason = "Community routing unavailable: No active batch accepting orders.";
        routingReasonKey = "NO_ACTIVE_BATCH";
      }
    }

    // 5. Determine available actions
    const availableActionTypes: OrderRouteActionType[] = [];

    if (canSubmitCommunityOrder) {
      availableActionTypes.push("COMMUNITY_ORDER");
    }
    availableActionTypes.push("INDIVIDUAL_ORDER");
    availableActionTypes.push("PERSONALIZED_BATCH");
    
    // 6. Generate presentation model
    let mode: "COMMUNITY_OPEN" | "COMMUNITY_CLOSED" | "INDIVIDUAL" | "GROUP" = "COMMUNITY_CLOSED";
    if (canSubmitCommunityOrder) mode = "COMMUNITY_OPEN";
    else if (routingReasonKey === "CONTEXT_INDIVIDUAL_ORDER") mode = "INDIVIDUAL";
    else if (routingReasonKey === "CONTEXT_PERSONALIZED_BATCH") mode = "GROUP";

    return {
      mode,
      allowCommunitySubmission: canSubmitCommunityOrder,
      availableActionTypes,
      nextCommunityBatches: nextAvailableBatches,
      
      canSubmitCommunityOrder,
      currentBatch,
      routingReasonKey,
      routingReason,
      eligibility
    };
  }
}
