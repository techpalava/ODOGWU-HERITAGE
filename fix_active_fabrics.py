import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Replace activeFabrics and fabricCategories
pattern = r'  const activeFabrics = \[\.\.\.fabrics\]\n\s*\.filter\(\(f\) => f\.stockStatus === "IN_STOCK" \|\| f\.stockStatus === "LOW_STOCK"\)\n\s*\.filter\(\(f\) => f\.image\)\n\s*\.filter\(\(f\) => fabricFilter === "All Fabrics" \|\| f\.category === fabricFilter\)\n\s*\.slice\(0, 12\);\n\s*\n\s*const fabricCategories = \["All Fabrics", \.\.\.Array\.from\(new Set\(fabrics\.filter\(f => f\.stockStatus === "IN_STOCK" \|\| f\.stockStatus === "LOW_STOCK"\)\.filter\(f => f\.image\)\.map\(f => f\.category\)\.filter\(Boolean\)\)\)\];'

replacement = """  const activeFabrics = [...fabrics]
    .filter((f) => fabricFilter === "All Fabrics" || f.category === fabricFilter)
    .slice(0, 12);
    
  const fabricCategories = ["All Fabrics", ...Array.from(new Set(fabrics.map(f => f.category).filter(Boolean)))];"""

content = re.sub(pattern, replacement, content)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)

