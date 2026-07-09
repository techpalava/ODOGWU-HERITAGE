import re

with open("src/engine/OrderRoutingEngine.ts", "r") as f:
    content = f.read()

new_decision_interface = """export interface OrderRoutingDecision {
  mode: "COMMUNITY_OPEN" | "COMMUNITY_CLOSED" | "INDIVIDUAL" | "GROUP";
  headline: string;
  description: string;
  allowCommunitySubmission: boolean;
  availableActions: RoutingActionModel[];
  nextCommunityBatches: Batch[];
  currentBatchSummary: {
    name: string;
    status: string;
    capacity: string;
    registrationStatus: string;
    closingDate: string;
    expectedDelivery: string;
    nextMilestone: string;
  } | null;
  submissionMessage: string;

  canSubmitCommunityOrder: boolean;
  currentBatch: Batch | undefined;
  routingReason: string;
  nextAvailableBatches: Batch[];
  presentation: RoutingPresentationModel;
}"""

content = re.sub(r'export interface OrderRoutingDecision \{.*?\n\}', new_decision_interface, content, flags=re.DOTALL)

with open("src/engine/OrderRoutingEngine.ts", "w") as f:
    f.write(content)
