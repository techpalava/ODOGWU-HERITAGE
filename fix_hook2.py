import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

# find the exact string
target = """                      ...useReferenceDataFallback("outfit_types", [
                        { value: "Senator Set", label: "Senator Set" },
                        { value: "Kaftan Set", label: "Kaftan Set" },
                        { value: "Agbada", label: "Agbada" },
                        { value: "Boubou", label: "Boubou" },
                        { value: "Maxi Gown", label: "Maxi Gown" },
                      ]).map(opt => ({ value: opt.value, label: opt.label }))"""

if target in content:
    content = content.replace(target, "                      ...outfitTypes.map(opt => ({ value: opt.value, label: opt.label }))")
    print("Replaced!")
else:
    print("Not found")

# insert the hook at line 477
lines = content.split('\n')
for i, line in enumerate(lines):
    if "const setNotification =" in line:
        insert_idx = i + 1
        break

lines.insert(insert_idx, """
  const outfitTypes = useReferenceDataFallback("outfit_types", [
    { value: "Senator Set", label: "Senator Set" },
    { value: "Kaftan Set", label: "Kaftan Set" },
    { value: "Agbada", label: "Agbada" },
    { value: "Boubou", label: "Boubou" },
    { value: "Maxi Gown", label: "Maxi Gown" },
  ]);
""")

with open("src/components/DesignStudioView.tsx", "w") as f:
    f.write('\n'.join(lines))
