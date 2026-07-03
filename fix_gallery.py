import re

with open('src/components/GalleryView.tsx', 'r') as f:
    content = f.read()

# I will replace batch.status === "CLOSED" || batch.status === "COMPLETED"
content = content.replace('batch.status === "CLOSED" || batch.status === "COMPLETED"', 'BatchBusinessRules.getLifecycleStage(batch) === "Registration Closed" || BatchBusinessRules.getLifecycleStage(batch) === "Completed"')

content = content.replace('b.status === "CLOSED" || b.status === "COMPLETED"', 'BatchBusinessRules.getLifecycleStage(b) === "Registration Closed" || BatchBusinessRules.getLifecycleStage(b) === "Completed"')

content = content.replace('batch.status === "COMING_SOON" || batch.status === "YET_TO_START"', 'BatchBusinessRules.getLifecycleStage(batch) === "Upcoming"')

with open('src/components/GalleryView.tsx', 'w') as f:
    f.write(content)
