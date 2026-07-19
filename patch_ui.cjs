const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `            <div className="space-y-2 text-xs font-sans">
              {selectedFabric && selectedStyle && selectedGarment && (
                <div className="flex justify-between items-start text-heritage-ink/70 gap-4">
                  <span className="leading-tight">
                    Base Sewing Price (`;

const replacement = `            <div className="space-y-2 text-xs font-sans">
              {selectedFabric && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Fabric Type: {getNormalizedFabricName(selectedFabric.category || selectedFabric.name || "")}</span>
                  <span className="font-semibold text-heritage-green">
                    {currencySymbol}
                    {getFabricPrice(selectedFabric).toFixed(2)}
                  </span>
                </div>
              )}
              {selectedFabric && selectedStyle && selectedGarment && (
                <div className="flex justify-between items-start text-heritage-ink/70 gap-4">
                  <span className="leading-tight">
                    Base Sewing Price (`;

content = content.replace(targetStr, replacement);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
