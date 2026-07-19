const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(/gender: selectedStyle\.gender,/g, 'gender: selectedStyle?.gender || "unisex",');
content = content.replace(/if \(hasLining && selectedStyle\.gender === "female" && \["L1", "L2", "L3", "L4"\]\.includes\(selectedGarment\.code \|\| ""\)\) \{/g, 
  'if (selectedStyle && hasLining && selectedStyle.gender === "female" && selectedGarment && ["L1", "L2", "L3", "L4"].includes(selectedGarment.code || "")) {');
content = content.replace(/hasLining: \(selectedStyle\.gender === "female" && \["L1", "L2", "L3", "L4"\]\.includes\(selectedGarment\.code \|\| ""\)\) \? hasLining : false,/g,
  'hasLining: (selectedStyle && selectedGarment && selectedStyle.gender === "female" && ["L1", "L2", "L3", "L4"].includes(selectedGarment.code || "")) ? hasLining : false,');
content = content.replace(/selectedStyle\.id === style\.id/g, 'selectedStyle?.id === style.id');
content = content.replace(/\{selectedStyle\.gender === "male" && \(/g, '{selectedStyle?.gender === "male" && (');
content = content.replace(/\{selectedStyle\.gender === "female" &&/g, '{selectedStyle?.gender === "female" &&');
content = content.replace(/\(selectedStyle\.gender === "female" && \["L1", "L2", "L3", "L4"\]\.includes\(selectedGarment\.code \|\| ""\)\) \? hasLining : false,/g,
  '(selectedStyle?.gender === "female" && selectedGarment && ["L1", "L2", "L3", "L4"].includes(selectedGarment.code || "")) ? hasLining : false,');
content = content.replace(/const isFemaleStyle = selectedStyle\.gender === "female";/g, 'const isFemaleStyle = selectedStyle?.gender === "female";');
content = content.replace(/fTypeRecommendUpper\(selectedStyle\.id\);/g, 'fTypeRecommendUpper(selectedStyle?.id || "");');

content = content.replace(/<strong>\{selectedStyle\.name\}<\/strong>/g, '<strong>{selectedStyle?.name || "Pending"}</strong>');
content = content.replace(/<strong>\{selectedGarment\.type\}<\/strong>/g, '<strong>{selectedGarment?.type || "Pending"}</strong>');

content = content.replace(/\{selectedStyle\.outfitType \|\| selectedStyle\.name\} -\{" "\}/g, '{selectedStyle?.outfitType || selectedStyle?.name || "Pending Design"} -{" "}');
content = content.replace(/selectedStyle\.garmentComposition \|\| "2-Piece Set",/g, '{selectedStyle?.garmentComposition || "Pending"}');

content = content.replace(/\{selectedStyle\.name\}/g, '{selectedStyle?.name || "Pending"}');
content = content.replace(/\{selectedGarment\.type\}/g, '{selectedGarment?.type || "Pending"}');

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
