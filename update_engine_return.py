import re

with open("src/engine/OrderRoutingEngine.ts", "r") as f:
    content = f.read()

return_statement = """
    // 6. Generate presentation model
    const presentation = this.buildPresentationModel(canSubmitCommunityOrder, routingReasonKey, currentBatch, eligibility);
    
    let mode: "COMMUNITY_OPEN" | "COMMUNITY_CLOSED" | "INDIVIDUAL" | "GROUP" = "COMMUNITY_CLOSED";
    if (canSubmitCommunityOrder) mode = "COMMUNITY_OPEN";
    else if (routingReasonKey === "CONTEXT_INDIVIDUAL_ORDER") mode = "INDIVIDUAL";
    else if (routingReasonKey === "CONTEXT_PERSONALIZED_BATCH") mode = "GROUP";

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
      mode,
      headline: presentation.title,
      description: presentation.description,
      allowCommunitySubmission: canSubmitCommunityOrder,
      availableActions,
      nextCommunityBatches: nextAvailableBatches,
      currentBatchSummary,
      submissionMessage: routingReason,

      canSubmitCommunityOrder,
      currentBatch,
      routingReason,
      nextAvailableBatches,
      presentation
    };
"""

content = re.sub(
    r'// 6\. Generate presentation model.*?return \{.*?presentation\s*\};\s*\}', 
    return_statement.replace('\\', '\\\\') + "  }", 
    content, 
    flags=re.DOTALL
)

with open("src/engine/OrderRoutingEngine.ts", "w") as f:
    f.write(content)
