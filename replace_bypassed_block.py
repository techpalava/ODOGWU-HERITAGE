import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

new_block = """              {/* Order Context Information - Read Only (Controls Bypassed) */}
              <div className="bg-heritage-cream/30 p-4 border border-heritage-gold/20 rounded-2xl space-y-2 text-left">
                <span className="text-[10px] uppercase font-bold text-heritage-gold tracking-wider block">
                  Delivery &amp; Batch Route (Locked)
                </span>
                
                {routingDecision && (
                  <>
                    <div className={`border rounded-xl p-3.5 mb-3 text-xs space-y-1 ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'bg-heritage-green/10 border-heritage-green/20 text-heritage-green' : 'bg-heritage-gold/10 border-heritage-gold/20 text-heritage-ink'}`}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle size={14} />
                        <span>{routingDecision.headline.toUpperCase()}</span>
                      </div>
                      <p className="leading-relaxed text-[11px] font-medium">
                        {routingDecision.submissionMessage}
                      </p>
                    </div>
                    
                    <p className="text-xs text-heritage-ink/80 leading-relaxed font-medium">
                      Your order route is governed by our centralized capacity and routing engine.
                    </p>
                    
                    <div className="text-[11px] bg-white p-3 rounded-xl border border-gray-150 font-sans space-y-1.5 text-heritage-ink">
                      <div>
                        <strong>Selected Path:</strong>{" "}
                        {routingDecision.mode === "COMMUNITY_OPEN"
                          ? `Active Community Cohort (${routingDecision.currentBatchSummary?.name || 'Veldhoven Campus Batch'})`
                          : routingDecision.mode === "INDIVIDUAL"
                            ? "Individual Priority Order"
                            : routingDecision.mode === "GROUP"
                              ? "Personalized Custom Batch"
                              : "Pending Routing Decision"}
                      </div>
                      <div>
                        <strong>Delivery Schedule:</strong>{" "}
                        {routingDecision.mode === "INDIVIDUAL"
                          ? "2-3 Weeks (Express Air Priority)"
                          : "Coordinated Collective Delivery"}
                      </div>
                      <div>
                        <strong>Destination:</strong>{" "}
                        {routingDecision.mode === "INDIVIDUAL"
                          ? "Direct Shipping to Your Provided Address"
                          : businessSettings.productionSettings.defaultPickupLocation}
                      </div>
                    </div>
                  </>
                )}
              </div>"""

content = re.sub(
    r'\{\/\* Order Context Information - Read Only \(Controls Bypassed\) \*\/\}.*?\{\/\* Contact Information & Specific Logistics fields \*\/\}', 
    new_block + '\n              {/* Contact Information & Specific Logistics fields */}', 
    content, 
    flags=re.DOTALL
)

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
