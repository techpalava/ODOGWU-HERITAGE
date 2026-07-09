import re

with open("src/components/DesignStudioView.tsx", "r") as f:
    content = f.read()

target = """            <span className="text-[9px] font-bold tracking-wider uppercase bg-black/5 px-1.5 py-0.5 rounded-sm w-fit block text-heritage-ink/60">
              Current Routing Context
            </span>"""

replacement = """            <span className="text-[9px] font-bold tracking-wider uppercase bg-black/5 px-1.5 py-0.5 rounded-sm w-fit block text-heritage-ink/60">
              Your Order Options
            </span>"""

if target in content:
    content = content.replace(target, replacement)
    with open("src/components/DesignStudioView.tsx", "w") as f:
        f.write(content)
    print("Replaced successfully.")
else:
    print("Target not found.")

