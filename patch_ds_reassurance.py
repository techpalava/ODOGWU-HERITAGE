import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """          {!routingDecision.allowCommunitySubmission && routingDecision.availableActions && routingDecision.mode !== 'COMMUNITY_OPEN' && (
            <div className="w-full border-t border-gray-100 pt-4 mt-2 flex flex-col sm:flex-row gap-3">
              {routingDecision.availableActions.filter(a => a.type !== 'COMMUNITY_ORDER').map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRoutingActionSelect(action.type)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                    (batchType === 'alone' && action.type === 'INDIVIDUAL_ORDER') ||
                    (batchType === 'personalized' && action.type === 'PERSONALIZED_BATCH')
                      ? 'bg-heritage-ink text-white border-heritage-ink shadow-md'
                      : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30 opacity-70 hover:opacity-100'
                  }`}
                >
                  {action.buttonText}
                </button>
              ))}
            </div>
          )}
          {!routingDecision.allowCommunitySubmission && routingDecision.availableActions && routingDecision.mode !== 'COMMUNITY_OPEN' && (
            <div className="w-full border-t border-gray-100 pt-4 mt-2 flex flex-col sm:flex-row gap-3">
              {routingDecision.availableActions.filter(a => a.type !== 'COMMUNITY_ORDER').map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRoutingActionSelect(action.type)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                    (batchType === 'alone' && action.type === 'INDIVIDUAL_ORDER') ||
                    (batchType === 'personalized' && action.type === 'PERSONALIZED_BATCH')
                      ? 'bg-heritage-ink text-white border-heritage-ink shadow-md'
                      : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30 opacity-70 hover:opacity-100'
                  }`}
                >
                  {action.buttonText}
                </button>
              ))}
            </div>
          )}"""

replacement = """          {!routingDecision.allowCommunitySubmission && routingDecision.availableActions && routingDecision.mode !== 'COMMUNITY_OPEN' && (
            <div className="w-full border-t border-gray-100 pt-4 mt-2">
              <div className="flex flex-col sm:flex-row gap-3">
                {routingDecision.availableActions.filter(a => a.type !== 'COMMUNITY_ORDER').map((action, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleRoutingActionSelect(action.type)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                      (batchType === 'alone' && action.type === 'INDIVIDUAL_ORDER') ||
                      (batchType === 'personalized' && action.type === 'PERSONALIZED_BATCH')
                        ? 'bg-heritage-ink text-white border-heritage-ink shadow-md'
                        : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {action.buttonText}
                  </button>
                ))}
              </div>
              <div className="mt-4 text-[10px] text-center text-heritage-ink/50 space-y-1">
                <p>Your design is automatically saved while you work.</p>
                <p>You can change your ordering option at any time before payment.</p>
              </div>
            </div>
          )}"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced successfully.")
else:
    print("Target not found.")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)

