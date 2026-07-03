import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

content = content.replace('import { OrderContext, CommunityPhoto, Showpiece } from "../types";', 'import { OrderContext, CommunityPhoto, Showpiece, Fabric } from "../types";')

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)

