const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `            <div className="space-y-2 text-xs font-sans">
              {selectedFabric && (
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
              )}
              {selectedFabric && selectedStyle && selectedGarment && (
                <div className="flex justify-between items-start text-heritage-ink/70 gap-4">
                  <span className="leading-tight">
                    Base Sewing Price (
                    {selectedStyle?.outfitType || selectedStyle?.name || "Pending Design"} -{" "}
                    {getGarmentCompositionFromCode(
                      selectedGarment?.code || "",
                      selectedStyle?.garmentComposition || "Pending"
                    )}
                    ):
                  </span>
                  <span className="font-semibold text-heritage-green shrink-0">
                    {currencySymbol}
                    {baseRate.toFixed(2)}
                  </span>
                </div>
              )}
              {selectedFabric && selectedStyle?.gender === "female" && selectedGarment && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "") && hasLining && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Inner Lining/Net (L5):</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}10.00
                  </span>
                </div>
              )}
              {selectedFabric && designSelections.additionalCap && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Custom Matching Fila (Accessory):</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}
                    {(
                      businessSettings.pricingSettings
                        ?.standardAccessoryCharge ?? 10
                    ).toFixed(2)}
                  </span>
                </div>
              )}
              {selectedFabric && optionalAccessories.map(acc => (
                <div key={acc} className="flex justify-between items-center text-heritage-ink/70">
                  <span>{acc}:</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}10.00
                  </span>
                </div>
              ))}
              {selectedFabric && batchType === "alone" && (
                <div className="flex flex-col text-amber-700 font-semibold text-[10px]">
                  <div className="flex justify-between items-center">
                    <span>Priority Home Shipping / Courier (Order Alone):</span>
                    <span className="font-mono">
                      +{currencySymbol}
                      {Number(35).toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[9px] text-amber-600/80 mt-0.5">(SEPA Transfer Directly)</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2.5 font-bold text-sm text-heritage-green font-serif">
                <span>Total Subtotal:</span>
                <span className="font-mono text-emerald-800">
                  {currencySymbol}
                  {subtotal.toFixed(2)}
                </span>
              </div>
            </div>`;

const replacement = `            <div className="space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-heritage-ink/70">
                <span>Fabric Type: {selectedFabric ? getNormalizedFabricName(selectedFabric.category || selectedFabric.name || "") : "Pending"}</span>
              </div>
              <div className="flex justify-between items-center text-heritage-ink/70">
                <span>Fabric Price:</span>
                <span className="font-semibold text-heritage-green">
                  {currencySymbol}
                  {pricing.fabricPrice.toFixed(2)}
                </span>
              </div>
              
              <div className="flex justify-between items-start text-heritage-ink/70 gap-4 mt-2 border-t border-heritage-gold/20 pt-2">
                <span className="leading-tight">
                  Design Style (Base Sewing):<br/>
                  <span className="text-[10px] opacity-70">
                    {selectedStyle ? \`\${selectedStyle.outfitType || selectedStyle.name} - \${selectedGarment?.type || getGarmentCompositionFromCode(selectedGarment?.code || "", selectedStyle.garmentComposition || "")}\` : "Pending"}
                  </span>
                </span>
                <span className="font-semibold text-heritage-ink/50 shrink-0 text-[10px] mt-1 italic">
                  {selectedStyle ? \`(+$\{currencySymbol}\${pricing.baseRate.toFixed(2)} added at checkout)\` : "Pending"}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-heritage-ink/70 border-t border-heritage-gold/20 pt-2">
                <span>Custom Details: {Object.keys(designSelections).length > 0 ? "Selected" : "Pending"}</span>
              </div>
              <div className="flex justify-between items-center text-heritage-ink/70">
                <span>Custom Details Total:</span>
                <span className="font-semibold text-heritage-green">
                  {currencySymbol}
                  {pricing.customDetailsPrice.toFixed(2)}
                </span>
              </div>
              
              <div className="flex justify-between border-t pt-2.5 font-bold text-sm text-heritage-green font-serif">
                <span>Total Subtotal:</span>
                <span className="font-mono text-emerald-800">
                  {currencySymbol}
                  {subtotal.toFixed(2)}
                </span>
              </div>
            </div>`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
