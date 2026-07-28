const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');
const target = `              {selectedFabric && getGarmentDetailsBreakdown(designSelections, selectedStyle).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-heritage-ink/70">
                  <span>{item.label}: {item.value}</span>
                  <span className="font-semibold text-heritage-green">
                    {item.price === 0 ? 'Included' : \`+\${currencySymbol}\${item.price.toFixed(2)}\`}
                  </span>
                </div>
              ))}`;
const rep = `              {selectedFabric && getGarmentDetailsBreakdown(designSelections, selectedStyle).map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-heritage-ink/70">
                  <span>{item.label}{item.value ? ': ' + item.value : ''}</span>
                  <span className="font-semibold text-heritage-green">
                    {item.price === 0 ? 'Included' : \`+\${currencySymbol}\${item.price.toFixed(2)}\`}
                  </span>
                </div>
              ))}`;
content = content.replace(target, rep);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
