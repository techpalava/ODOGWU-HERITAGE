import re

with open('src/components/CustomOrderView.tsx', 'r') as f:
    content = f.read()

content = content.replace('b.status === "OPEN"', 'BatchBusinessRules.getLifecycleStage(b) === "Recruiting"')

with open('src/components/CustomOrderView.tsx', 'w') as f:
    f.write(content)
