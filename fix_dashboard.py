import re

with open('src/components/DashboardView.tsx', 'r') as f:
    content = f.read()

# Replace userBatch.status === "PRODUCTION_STARTED" with BatchBusinessRules.getLifecycleStage(userBatch) === "In Production"
content = content.replace('userBatch.status === "PRODUCTION_STARTED"', 'BatchBusinessRules.getLifecycleStage(userBatch) === "In Production"')

with open('src/components/DashboardView.tsx', 'w') as f:
    f.write(content)
