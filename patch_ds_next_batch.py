import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target_action = """  const handleRoutingActionSelect = (actionType: string) => {
    if (actionType === "INDIVIDUAL_ORDER") {
      setBatchType("alone");
    } else if (actionType === "PERSONALIZED_BATCH") {
      setBatchType("personalized");
    }"""

replacement_action = """  const handleRoutingActionSelect = (actionType: string) => {
    if (actionType === "INDIVIDUAL_ORDER") {
      setBatchType("alone");
    } else if (actionType === "PERSONALIZED_BATCH") {
      setBatchType("personalized");
    } else if (actionType === "COMMUNITY_ORDER" || actionType === "NEXT_BATCH") {
      setBatchType("community");
    }"""

if target_action in content:
    content = content.replace(target_action, replacement_action)
    print("Replaced handleRoutingActionSelect")
else:
    print("Could not find handleRoutingActionSelect")

target_render = """              <div className="mt-4 text-[10px] text-center text-heritage-ink/50 space-y-1">
                <p>Your design is automatically saved while you work.</p>
                <p>You can change your ordering option at any time before payment.</p>
              </div>
            </div>
          )}"""

replacement_render = """              <div className="mt-4 text-[10px] text-center text-heritage-ink/50 space-y-1">
                <p>Your design is automatically saved while you work.</p>
                <p>You can change your ordering option at any time before payment.</p>
              </div>
              
              {routingDecision.nextCommunityBatches && routingDecision.nextCommunityBatches.length > 0 && (
                <div className="mt-6 border border-gray-100 rounded-2xl p-4 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex-1 space-y-1 w-full text-center md:text-left">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Next Upcoming Batch</span>
                    <h5 className="font-serif font-bold text-sm text-heritage-ink">{routingDecision.nextCommunityBatches[0].name}</h5>
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 mt-2 text-[10px] text-gray-600">
                      <span><strong className="text-gray-900">Registration Opens:</strong> {routingDecision.nextCommunityBatches[0].startDate || routingDecision.nextCommunityBatches[0].registrationOpens || "TBD"}</span>
                      <span><strong className="text-gray-900">Expected Delivery:</strong> {routingDecision.nextCommunityBatches[0].estimatedDelivery || "TBD"}</span>
                      {routingDecision.nextCommunityBatches[0].targetGarments ? (
                        <span><strong className="text-gray-900">Capacity:</strong> {routingDecision.nextCommunityBatches[0].currentGarments || 0} / {routingDecision.nextCommunityBatches[0].targetGarments} Garments</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRoutingActionSelect("NEXT_BATCH")}
                    className="shrink-0 bg-white border border-gray-200 text-heritage-ink font-bold text-xs py-2 px-4 rounded-xl hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    Join Next Batch
                  </button>
                </div>
              )}
            </div>
          )}"""

if target_render in content:
    content = content.replace(target_render, replacement_render)
    print("Replaced render block")
else:
    print("Could not find render block")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
