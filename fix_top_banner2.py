import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

new_banner = """      {/* Information Banner for Routing (Phase 4.2) */}
      {routingDecision && !routingDecision.allowCommunitySubmission && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          routingDecision.mode === 'COMMUNITY_CLOSED' ? 'bg-heritage-gold/10 border-heritage-gold/20 text-heritage-gold' :
          'bg-heritage-ink/5 border-heritage-ink/10 text-heritage-ink'
        }`}>
          <div className="mt-0.5"><AlertTriangle size={16} /></div>
          <div>
            <h4 className="font-bold text-sm mb-1">{routingDecision.headline}</h4>
            <p className="text-xs opacity-90 leading-relaxed">{routingDecision.description}</p>
          </div>
        </div>
      )}"""

# Replace exactly lines 1483 to 1499 using string splitting
lines = content.split('\n')
for i, line in enumerate(lines):
    if "{/* Information Banner for Routing (Phase 4.2) */}" in line:
        start_idx = i
        break

end_idx = start_idx
for i in range(start_idx, len(lines)):
    if ")} " in lines[i] or "      )}" in lines[i] or "})()} " in lines[i]:
        # we know it's a few lines down
        if i > start_idx + 10:
            end_idx = i
            break

print("Start idx", start_idx)
print("End idx", end_idx)
