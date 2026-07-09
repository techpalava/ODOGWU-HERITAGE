import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

new_card = """      {/* ROUTING PRESENTATION CARD */}
      {routingDecision && (
        <div className={`bg-white border rounded-3xl p-5 flex flex-col gap-4 shadow-sm text-center sm:text-left ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'border-heritage-green/30' : 'border-heritage-gold/30'}`}>
          <div className="space-y-1.5 flex flex-col items-center sm:items-start w-full">
            <span className="text-[9px] font-bold tracking-wider uppercase bg-black/5 px-1.5 py-0.5 rounded-sm w-fit block text-heritage-ink/60">
              Current Routing Context
            </span>
            <div className="space-y-1 w-full">
              <h4 className={`font-serif font-bold text-sm ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-heritage-gold'}`}>
                {routingDecision.headline}
              </h4>
              <p className="text-[11px] text-heritage-ink/75 font-medium leading-relaxed">
                {routingDecision.submissionMessage}
              </p>
            </div>
          </div>
          {routingDecision.currentBatchSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 w-full border-t border-gray-100 pt-4 text-center sm:text-left">
              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Status:</span>
                <span className="font-semibold text-heritage-ink block text-[11px] uppercase tracking-wide">{routingDecision.currentBatchSummary.status}</span>
              </div>
              <div className="space-y-0.5">
                <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Registration:</span>
                <span className={`font-bold block text-[11px] ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-red-500'}`}>
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
          )}
        </div>
      )}"""

# Replace from {/* ORDER CONTEXT CARD */} until })()}
content = re.sub(
    r'\{\/\* ORDER CONTEXT CARD \*\/\}.*?\}\)\(\)\}', 
    new_card, 
    content, 
    flags=re.DOTALL
)

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
