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

content = re.sub(
    r'\{\/\* Information Banner for Routing \(Phase 4\.2\) \*\/\}.*?<\/div>\s*\}\)',
    new_banner,
    content,
    flags=re.DOTALL
)

# And fix handleAddToCartAction to check allowCommunitySubmission instead of canSubmitCommunityOrder
content = content.replace(
    'if (!decision.canSubmitCommunityOrder && batchType === "community") {',
    'if (!decision.allowCommunitySubmission && batchType === "community") {'
)
content = content.replace(
    '{routingDecision && !routingDecision.canSubmitCommunityOrder && (',
    '{routingDecision && !routingDecision.allowCommunitySubmission && ('
)

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
