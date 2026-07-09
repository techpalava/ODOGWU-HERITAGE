import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                    action.type === 'INDIVIDUAL_ORDER'
                      ? 'bg-heritage-ink text-white border-heritage-ink hover:bg-black'
                      : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30'
                  }`}"""

replacement = """                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-colors ${
                    (batchType === 'alone' && action.type === 'INDIVIDUAL_ORDER') ||
                    (batchType === 'personalized' && action.type === 'PERSONALIZED_BATCH')
                      ? 'bg-heritage-ink text-white border-heritage-ink shadow-md'
                      : 'bg-white text-heritage-ink border-gray-200 hover:border-heritage-ink/30 opacity-70 hover:opacity-100'
                  }`}"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced button classes.")
else:
    print("Not found button classes.")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write(content)
