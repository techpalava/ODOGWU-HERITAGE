import { Customer, MasterOrder, HistoricalOrder, Batch, CartItem } from "../types";
import { OrderRoutingEngine } from "./OrderRoutingEngine";
import { AuthorizationEngine } from "./AuthorizationEngine";
import { BatchBusinessRules } from "./BatchBusinessRules";
import { getCurrentCommunityBatch } from "../utils/batchUtils";


export type JourneyState =
  | "NEW_VISITOR"
  | "ACCOUNT_CREATED"
  | "PROFILE_INCOMPLETE"
  | "DESIGN_STARTED"
  | "DESIGN_IN_PROGRESS"
  | "DESIGN_COMPLETE"
  | "COMMUNITY_BATCH_FULL"
  | "INDIVIDUAL_ORDER_SELECTED"
  | "PERSONALIZED_BATCH_SELECTED"
  | "PAYMENT_PENDING"
  | "PAYMENT_COMPLETED"
  | "PRODUCTION"
  | "SHIPPING"
  | "DELIVERED"
  | "ORDER_COMPLETED"
  | "NO_ACTIVE_WORK";

export interface JourneyModel {
  state: JourneyState;
  progress: number;
  currentOrder: MasterOrder | CartItem | null;
  primaryAction: string;
  secondaryAction: string;
  destination: string;
  notification: string;
  workspace: "MY_DRAFTS" | "COMMUNITY_ORDERS" | "INDIVIDUAL_ORDERS" | "PERSONALIZED_BATCHES" | "COMPLETED_ORDERS" | "OVERVIEW";
  canContinue: boolean;
  blockers: string[];
  recommendedNextStep: string;
}

export interface CustomerContext {
    currentUser: Customer | null;
    drafts: CartItem[];
    activeOrders: MasterOrder[];
    historicalOrders: HistoricalOrder[];
    allBatches: Batch[];
}

export class CustomerJourneyEngine {
    static getCurrentJourney(context: CustomerContext): JourneyModel {
        const { currentUser, drafts, activeOrders, historicalOrders, allBatches } = context;

        // Base defaults
        let state: JourneyState = "NEW_VISITOR";
        let progress = 0;
        let currentOrder: MasterOrder | CartItem | null = null;
        
        const openBatch = getCurrentCommunityBatch(allBatches);
        const canJoinActiveBatch = openBatch ? BatchBusinessRules.canAcceptOrders(openBatch).canAcceptOrders : false;
        
        let primaryAction = canJoinActiveBatch ? `Join ${openBatch?.name}` : "Create Custom Order";
        let secondaryAction = "Learn How it Works";
        let destination = canJoinActiveBatch ? "design" : "custom-order";
        let notification = "Welcome to the Odogwu Heritage Passport.";
        let workspace: JourneyModel["workspace"] = "OVERVIEW";
        let canContinue = true;
        let blockers: string[] = [];
        let recommendedNextStep = "View the gallery to see our styles.";

        if (!currentUser) {
            return {
                state, progress, currentOrder, primaryAction, secondaryAction,
                destination, notification, workspace, canContinue, blockers, recommendedNextStep
            };
        }

        const canViewPortal = AuthorizationEngine.canViewCustomerPortal(currentUser);
        if (!canViewPortal) {
             state = "ACCOUNT_CREATED";
        }

        const activeOrder = activeOrders.length > 0 ? activeOrders[0] : null;

        if (activeOrder) {
            currentOrder = activeOrder;
            if (activeOrder.shipment?.status === "Delivered") {
                 state = "DELIVERED";
                 progress = 100;
                 primaryAction = "View Order History";
                 secondaryAction = "Start New Design";
                 destination = "dashboard";
                 notification = "Your attire has been delivered. We hope you enjoy it!";
                 workspace = "COMPLETED_ORDERS";
                 recommendedNextStep = "Share your look in the Community Gallery.";
            } else if (activeOrder.payment?.isPaid === false) {
                 state = "PAYMENT_PENDING";
                 progress = 25;
                 primaryAction = "Complete Payment";
                 secondaryAction = "View Order Details";
                 destination = "dashboard";
                 notification = "Your order is pending payment. Please complete the deposit.";
                 workspace = activeOrder.batchType === "community" ? "COMMUNITY_ORDERS" : activeOrder.batchType === "alone" ? "INDIVIDUAL_ORDERS" : "PERSONALIZED_BATCHES";
                 recommendedNextStep = "Authorize Escrow Deposit to begin production.";
            } else if (activeOrder.shipment?.currentStage && activeOrder.shipment.currentStage > 1 && activeOrder.shipment.currentStage < 5) {
                 state = "PRODUCTION";
                 progress = 50;
                 primaryAction = "Track Production";
                 secondaryAction = "View Details";
                 destination = "dashboard";
                 notification = "Your attire is currently in production.";
                 workspace = activeOrder.batchType === "community" ? "COMMUNITY_ORDERS" : activeOrder.batchType === "alone" ? "INDIVIDUAL_ORDERS" : "PERSONALIZED_BATCHES";
                 recommendedNextStep = "Monitor production milestones in your dashboard.";
            } else if (activeOrder.shipment?.currentStage && activeOrder.shipment.currentStage >= 5) {
                 state = "SHIPPING";
                 progress = 75;
                 primaryAction = "Track Shipment";
                 secondaryAction = "View Details";
                 destination = "dashboard";
                 notification = "Your attire is shipped and on its way.";
                 workspace = activeOrder.batchType === "community" ? "COMMUNITY_ORDERS" : activeOrder.batchType === "alone" ? "INDIVIDUAL_ORDERS" : "PERSONALIZED_BATCHES";
                 recommendedNextStep = "Check tracking for estimated arrival date.";
            } else {
                 state = "PAYMENT_COMPLETED";
                 progress = 30;
                 primaryAction = "Track Order";
                 secondaryAction = "View Details";
                 destination = "dashboard";
                 notification = "Payment received. Awaiting production start.";
                 workspace = activeOrder.batchType === "community" ? "COMMUNITY_ORDERS" : activeOrder.batchType === "alone" ? "INDIVIDUAL_ORDERS" : "PERSONALIZED_BATCHES";
                 recommendedNextStep = "Wait for production to begin.";
            }
            return {
                state, progress, currentOrder, primaryAction, secondaryAction,
                destination, notification, workspace, canContinue, blockers, recommendedNextStep
            };
        }

        if (drafts && drafts.length > 0) {
            const draft = drafts[drafts.length - 1];
            currentOrder = draft;
            
            const routingDecision = OrderRoutingEngine.evaluateOrder({
                orderType: draft.batchType === "alone" ? "Individual" : draft.batchType === "personalized" ? "Group Organizer" : "Community",
                batchId: draft.customGroupCode,
                batchName: draft.batchName
            }, allBatches);

            if (!draft.measurements || !draft.measurements.height) {
                state = "DESIGN_STARTED";
                progress = 25;
                primaryAction = "Complete Measurements";
                secondaryAction = "Edit Design";
                destination = "design";
                notification = "Your design is saved. Add measurements to proceed.";
                workspace = "MY_DRAFTS";
                recommendedNextStep = "Enter your exact measurements.";
            } else {
                state = "DESIGN_IN_PROGRESS";
                progress = 50;
                primaryAction = "Continue Checkout";
                secondaryAction = "Review Design";
                destination = "design";
                notification = "Your custom design is ready for checkout.";
                workspace = "MY_DRAFTS";
                recommendedNextStep = "Review your selections and place order.";
            }

            if (routingDecision.mode === "COMMUNITY_CLOSED" && draft.batchType !== "alone" && draft.batchType !== "personalized") {
                state = "COMMUNITY_BATCH_FULL";
                blockers.push("Community batch is closed.");
                notification = "The community batch you selected is now closed or full.";
                primaryAction = "Select Routing Option";
                recommendedNextStep = "Choose Individual Order or personalized batch.";
            }

            return {
                state, progress, currentOrder, primaryAction, secondaryAction,
                destination, notification, workspace, canContinue, blockers, recommendedNextStep
            };
        }

        if (currentUser && !currentUser.phone) {
             state = "PROFILE_INCOMPLETE";
             progress = 10;
             primaryAction = "Complete Profile";
             secondaryAction = "Browse Styles";
             destination = "dashboard";
             notification = "Please complete your profile to continue.";
             workspace = "OVERVIEW";
             recommendedNextStep = "Add your phone number for delivery updates.";
             return {
                state, progress, currentOrder, primaryAction, secondaryAction,
                destination, notification, workspace, canContinue, blockers, recommendedNextStep
            };
        }

        if (historicalOrders && historicalOrders.length > 0) {
            state = "NO_ACTIVE_WORK";
            progress = 0;
            primaryAction = canJoinActiveBatch ? `Join ${openBatch?.name}` : "Start New Design";
            secondaryAction = "View Past Orders";
            destination = canJoinActiveBatch ? "design" : "custom-order";
            notification = "Ready for your next bespoke attire?";
            workspace = "COMPLETED_ORDERS";
            recommendedNextStep = "Head to the Design Studio to create a new look.";
            return {
                state, progress, currentOrder, primaryAction, secondaryAction,
                destination, notification, workspace, canContinue, blockers, recommendedNextStep
            };
        }

        state = "ACCOUNT_CREATED";
        progress = 5;
        primaryAction = canJoinActiveBatch ? `Join ${openBatch?.name}` : "Create Custom Order";
        secondaryAction = "View Inspiration";
        destination = canJoinActiveBatch ? "design" : "custom-order";
        notification = "Welcome! Start your custom tailoring journey.";
        workspace = "OVERVIEW";
        recommendedNextStep = "Go to the Design Studio to select a style.";

        return {
            state, progress, currentOrder, primaryAction, secondaryAction,
            destination, notification, workspace, canContinue, blockers, recommendedNextStep
        };
    }
}
