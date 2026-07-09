import re

with open("src/components/OrderRoutingPanel.tsx", "r") as f:
    content = f.read()

# Replace variables destructuring
content = content.replace(
    "const { presentation, availableActions, nextAvailableBatches } = decision;",
    "const { headline, description, availableActions, nextCommunityBatches, mode } = decision;"
)

content = content.replace(
    "nextAvailableBatches",
    "nextCommunityBatches"
)

content = content.replace(
    "presentation.icon",
    "'lock'" # Default icon since we removed it from the model
)

content = content.replace(
    "presentation.severity",
    "(mode === 'COMMUNITY_OPEN' ? 'success' : 'warning')"
)

content = content.replace(
    "presentation.badge",
    "(mode === 'COMMUNITY_OPEN' ? 'Accepting Orders' : 'Registration Closed')"
)

content = content.replace(
    "presentation.title",
    "headline"
)

content = content.replace(
    "presentation.subtitle",
    "description"
)

content = content.replace(
    "<p className=\"opacity-80 max-w-lg mx-auto\">{presentation.description}</p>",
    ""
)

with open("src/components/OrderRoutingPanel.tsx", "w") as f:
    f.write(content)
