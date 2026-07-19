const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `                              onClick={() => {
                                setSelectedGarment(g);
                                setIsGarmentDropdownOpen(false);
                              }}`;

const replacement = `                              onClick={() => {
                                setSelectedGarment(g);
                                if (g.code === "EXACT" && selectedStyle?.defaultGarmentDetails) {
                                  setDesignSelections(selectedStyle.defaultGarmentDetails);
                                }
                                setIsGarmentDropdownOpen(false);
                              }}`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
