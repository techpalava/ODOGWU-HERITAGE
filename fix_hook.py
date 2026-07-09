import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

# Replace the inline hook with outfitTypes
content = content.replace(
    '''...useReferenceDataFallback("outfit_types", [
                        { value: "Senator Set", label: "Senator Set" },
                        { value: "Kaftan Set", label: "Kaftan Set" },
                        { value: "Agbada", label: "Agbada" },
                        { value: "Boubou", label: "Boubou" },
                        { value: "Maxi Gown", label: "Maxi Gown" },
                      ]).map(opt => ({ value: opt.value, label: opt.label }))''',
    '...outfitTypes.map(opt => ({ value: opt.value, label: opt.label }))'
)

# Also check for exactly how it looks
