import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    'return mappedGender === styleFilter || s.outfitType === styleFilter;\n    });',
    'return mappedGender === styleFilter || s.outfitType === styleFilter;\n    })\n    .slice(0, 12);'
)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
