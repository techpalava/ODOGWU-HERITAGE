import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """          {routingDecision.currentBatchSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 w-full border-t border-gray-100 pt-4 text-center sm:text-left">
              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Status:</span>
                <span className="font-semibold text-heritage-ink block text-[11px] uppercase tracking-wide">{routingDecision.currentBatchSummary.status}</span>
              </div>
              <div className="space-y-0.5">
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
              </div>
              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Capacity:</span>
                <span className="font-semibold text-heritage-ink block text-[11px]">{routingDecision.currentBatchSummary.capacity}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Closing Date:</span>
                <span className="font-serif font-bold text-heritage-gold block text-[11px]">{routingDecision.currentBatchSummary.closingDate}</span>
              </div>
            </div>
          )}"""

replacement = """          {routingDecision.currentBatchSummary && (
            <div className="flex flex-wrap gap-x-6 gap-y-3 w-full border-t border-gray-100 pt-4 text-center sm:text-left">
              <div className="space-y-0.5 min-w-[120px]">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Community Batch</span>
                <span className="font-semibold text-heritage-ink block text-[11px] uppercase tracking-wide">{routingDecision.currentBatchSummary.name}</span>
              </div>
              <div className="space-y-0.5 min-w-[100px]">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Status</span>
                <span className={`font-bold block text-[11px] uppercase tracking-wide ${
                  routingDecision.mode === 'COMMUNITY_OPEN' 
                    ? 'text-heritage-green' 
                    : routingDecision.currentBatchSummary.status.includes('FULL')
                      ? 'text-heritage-gold'
                      : routingDecision.currentBatchSummary.status.includes('PRODUCTION')
                        ? 'text-blue-600'
                        : 'text-gray-500'
                }`}>
                  {routingDecision.currentBatchSummary.status}
                </span>
              </div>
              <div className="space-y-0.5 min-w-[100px]">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Capacity</span>
                <span className="font-semibold text-heritage-ink block text-[11px]">{routingDecision.currentBatchSummary.capacity}</span>
              </div>
              <div className="space-y-0.5 min-w-[120px]">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Production Progress</span>
                <span className="font-semibold text-heritage-ink block text-[11px]">{routingDecision.currentBatchSummary.nextMilestone}</span>
              </div>
              <div className="space-y-0.5 min-w-[120px]">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Estimated Delivery</span>
                <span className="font-serif font-bold text-heritage-gold block text-[11px]">{routingDecision.currentBatchSummary.expectedDelivery}</span>
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

