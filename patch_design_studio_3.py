import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Registration:</span>
                <span className={`font-bold block text-[11px] ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-red-500'}`}>
                  {routingDecision.currentBatchSummary.registrationStatus}
                </span>
              </div>"""

replacement = """              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Registration:</span>
                <span className={`font-bold block text-[11px] ${
                  routingDecision.mode === 'COMMUNITY_OPEN' 
                    ? 'text-heritage-green' 
                    : routingDecision.currentBatchSummary.status.includes('FULL')
                      ? 'text-heritage-gold'
                      : routingDecision.currentBatchSummary.status.includes('PRODUCTION')
                        ? 'text-blue-600'
                        : 'text-gray-500'
                }`}>
                  {routingDecision.currentBatchSummary.registrationStatus}
                </span>
              </div>"""

if target in content:
    content = content.replace(target, replacement)
    with open("src/components/DesignStudioView.tsx", "w") as f:
        f.write(content)
    print("Replaced successfully.")
else:
    print("Target not found.")

