const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `              {selectedFabric && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Fabric Type: {getNormalizedFabricName(selectedFabric.category || selectedFabric.name || "")}</span>
                  <span className="font-semibold text-heritage-green">
                    {currencySymbol}
                    {getFabricPrice(selectedFabric).toFixed(2)}
                  </span>
                </div>
              )}`;

const replacement = `              {selectedFabric && (
                <>
                  <div className="flex justify-between items-center text-heritage-ink/70">
                    <span>Fabric Type: {getNormalizedFabricName(selectedFabric.category || selectedFabric.name || "")}</span>
                  </div>
                  <div className="flex justify-between items-center text-heritage-ink/70">
                    <span>Fabric Price:</span>
                    <span className="font-semibold text-heritage-green">
                      {currencySymbol}
                      {getFabricPrice(selectedFabric).toFixed(2)}
                    </span>
                  </div>
                </>
              )}`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
