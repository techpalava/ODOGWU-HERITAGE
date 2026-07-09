import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    lines = f.read().split('\n')

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

# Replace exactly lines 1482 to 1497 (0-based)
lines = lines[:1482] + new_banner.split('\n') + lines[1498:]

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write('\n'.join(lines))
