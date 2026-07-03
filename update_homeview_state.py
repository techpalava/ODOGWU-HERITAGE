import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Destructure `styles` from useAppStore
content = content.replace(
    "  const { businessSettings, currentUser, customers, orders, batches } =",
    "  const { businessSettings, currentUser, customers, orders, batches, styles } ="
)

# Insert Design Styles state below Fabric filter state
style_state = """
  const [styleFilter, setStyleFilter] = useState("All Styles");
  
  // Extract categories dynamically
  const styleCategories = [
    "All Styles",
    ...Array.from(new Set(styles.map(s => {
      if (s.gender === "male") return "Men";
      if (s.gender === "female") return "Women";
      if (s.gender === "couple") return "Couples";
      if (s.gender === "family") return "Families";
      if (s.gender === "unisex") return "Unisex";
      return s.outfitType || s.gender;
    }).filter(Boolean)))
  ];

  const activeStyles = [...styles]
    .filter(s => {
      if (styleFilter === "All Styles") return true;
      const mappedGender = 
        s.gender === "male" ? "Men" : 
        s.gender === "female" ? "Women" : 
        s.gender === "couple" ? "Couples" : 
        s.gender === "family" ? "Families" : 
        s.gender === "unisex" ? "Unisex" : s.gender;
      
      return mappedGender === styleFilter || s.outfitType === styleFilter;
    });
"""

content = content.replace(
    '  const fabricCategories = [',
    style_state + '\n  const fabricCategories = ['
)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)
