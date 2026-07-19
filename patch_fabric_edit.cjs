const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const targetEdit = `                                  onClick={() => {
                                    setIsNewRecord(false);
                                    setEditingItem({
                                      ...f,
                                      category: f.category || "HiTarget Ankara",
                                      stock: f.stock ?? 0,
                                      color: f.color || "Multi",
                                      colorHex: f.colorHex || "#2e3a1e",
                                      width: f.width || "45 inches",
                                    });
                                    setFabricNameSuggestions([]);`;

const repEdit = `                                  onClick={() => {
                                    setIsNewRecord(false);
                                    
                                    const allowedCategories = ["HiTarget Ankara", "Hollandis Ankara", "Kampala", "Aso-Oke", "Adire", "Isiagu (Akwa-Oche)", "Lace"];
                                    let cat = f.category;
                                    if (cat === "Hi-Target Ankara" || cat === "Hi-Target") cat = "HiTarget Ankara";
                                    if (cat && !allowedCategories.includes(cat)) {
                                      cat = ""; // force re-selection
                                    }
                                    
                                    setEditingItem({
                                      ...f,
                                      category: cat || "",
                                      stock: f.stock ?? 0,
                                      color: f.color || "Multi",
                                      colorHex: f.colorHex || "#2e3a1e",
                                      width: f.width || "45 inches",
                                    });
                                    setFabricNameSuggestions([]);`;

content = content.replace(targetEdit, repEdit);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
