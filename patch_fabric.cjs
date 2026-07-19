const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

// fix the filter
content = content.replace(/f\.category\.toLowerCase\(\)\.includes/g, '(f.category || "").toLowerCase().includes');

// fix the setEditingItem(f) for fabrics
const editFabricTarget = `                                  onClick={() => {
                                    setIsNewRecord(false);
                                    setEditingItem(f);
                                    setFabricNameSuggestions([]);`;

const editFabricRep = `                                  onClick={() => {
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

content = content.replace(editFabricTarget, editFabricRep);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
