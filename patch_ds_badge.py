import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """          <div className="space-y-1.5 flex flex-col items-center sm:items-start w-full">
            <span className="text-[9px] font-bold tracking-wider uppercase bg-black/5 px-1.5 py-0.5 rounded-sm w-fit block text-heritage-ink/60">
              Your Order Options
            </span>"""

replacement = """          <div className="space-y-1.5 flex flex-col items-center sm:items-start w-full">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-wider uppercase bg-black/5 px-1.5 py-0.5 rounded-sm w-fit block text-heritage-ink/60">
                Your Order Options
              </span>
              <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full w-fit block ${
                routingDecision.mode === 'COMMUNITY_OPEN' ? 'bg-heritage-green/10 text-heritage-green' :
                routingDecision.mode === 'INDIVIDUAL' ? 'bg-heritage-ink text-white' :
                routingDecision.mode === 'GROUP' ? 'bg-heritage-gold/20 text-heritage-gold' :
                'bg-gray-100 text-gray-500'
              }`}>
                Current Mode: {
                  routingDecision.mode === 'COMMUNITY_OPEN' ? 'Community Order' :
                  routingDecision.mode === 'INDIVIDUAL' ? 'Individual Order' :
                  routingDecision.mode === 'GROUP' ? 'Personalized Batch' :
                  'Select an Option'
                }
              </span>
            </div>"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced successfully.")
else:
    print("Target not found.")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)

