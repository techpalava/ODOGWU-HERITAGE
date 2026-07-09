import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """            </div>
          )}
        </div>"""

replacement = """            </div>
          )}
          {!routingDecision.allowCommunitySubmission && routingDecision.availableActions && routingDecision.mode === 'COMMUNITY_CLOSED' && (
            <div className="w-full border-t border-gray-100 pt-4 mt-2 flex flex-col sm:flex-row gap-3">
              {routingDecision.availableActions.filter(a => a.type !== 'COMMUNITY_ORDER').map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRoutingActionSelect(action.type)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                    action.type === 'INDIVIDUAL_ORDER'
                      ? 'bg-heritage-ink text-white border-heritage-ink hover:bg-black'
                      : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30'
                  }`}
                >
                  {action.buttonText}
                </button>
              ))}
            </div>
          )}
        </div>"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced buttons.")
else:
    print("Not found buttons.")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
