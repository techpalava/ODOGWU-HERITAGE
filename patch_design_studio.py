import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """            <div className="space-y-1 w-full">
              <h4 className={`font-serif font-bold text-sm ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-heritage-gold'}`}>
                {routingDecision.headline}
              </h4>
              <p className="text-[11px] text-heritage-ink/75 font-medium leading-relaxed">
                {routingDecision.submissionMessage}
              </p>
            </div>"""

replacement = """            <div className="space-y-1 w-full">
              <h4 className={`font-serif font-bold text-sm ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-heritage-gold'}`}>
                {routingDecision.mode === 'COMMUNITY_OPEN' ? routingDecision.headline : 'Order Routing Guidance'}
              </h4>
              <p className="text-[11px] text-heritage-ink/75 font-medium leading-relaxed">
                {routingDecision.submissionMessage}
              </p>
            </div>"""

if target in content:
    content = content.replace(target, replacement)
    with open("src/components/DesignStudioView.tsx", "w") as f:
        f.write(content)
    print("Replaced successfully.")
else:
    print("Target not found.")

