const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr1 = `                    <li>
                      Neck Accent: <strong>{designSelections.collar}</strong>
                    </li>
                    <li>
                      Sleeve Style: <strong>{designSelections.sleeve}</strong>
                    </li>
                    <li>
                      Functional Pockets:{" "}
                      <strong>{designSelections.pocket}</strong>
                    </li>
                    <li>
                      Lower Hem: <strong>{designSelections.hemFinish}</strong>
                    </li>
                    {designSelections.additionalCap && (
                      <li>
                        Included Extra:{" "}
                        <strong>Matching Custom Fila (Cap)</strong>
                      </li>
                    )}
                    {selectedStyle?.gender === "female" && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "") && hasLining && (
                      <li>
                        Included Extra: <strong>Inner Lining/Net (L5)</strong>
                      </li>
                    )}
                    {optionalAccessories.map(acc => (
                      <li key={acc}>
                        Included Extra: <strong>{acc}</strong>
                      </li>
                    ))}`;

const replacement1 = `                    <GarmentDetailSummaryItems designSelections={designSelections} isLi={true} currencySymbol={currencySymbol} />
                    {selectedStyle?.gender === "female" && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "") && hasLining && (
                      <li>
                        Included Extra: <strong>Inner Lining/Net (L5)</strong> <span className="text-heritage-gold ml-1">(+{currencySymbol}10.00)</span>
                      </li>
                    )}`;

content = content.replace(targetStr1, replacement1);

const targetStr2 = `              <p>
                Collar Form:{" "}
                <strong className="text-heritage-green">
                  {designSelections.collar}
                </strong>
              </p>
              <p>
                Sleeves:{" "}
                <strong className="text-heritage-green">
                  {designSelections.sleeve}
                </strong>
              </p>
              <p>
                Pockets:{" "}
                <strong className="text-heritage-green">
                  {designSelections.pocket}
                </strong>
              </p>
              <p>
                Hem Finish:{" "}
                <strong className="text-heritage-green">
                  {designSelections.hemFinish}
                </strong>
              </p>
              {designSelections.additionalCap && (
                <p>
                  Custom Fila (Cap):{" "}
                  <strong className="text-heritage-gold">Included</strong>
                </p>
              )}
              {selectedStyle?.gender === "female" && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "") && hasLining && (
                <p>
                  Lining/Inner Net:{" "}
                  <strong className="text-heritage-gold">Included (L5)</strong>
                </p>
              )}
              {optionalAccessories.map(acc => (
                <p key={acc}>
                  {acc}:{" "}
                  <strong className="text-heritage-gold">Included</strong>
                </p>
              ))}`;

const replacement2 = `              <GarmentDetailSummaryItems designSelections={designSelections} isLi={false} currencySymbol={currencySymbol} />
              {selectedStyle?.gender === "female" && ["L1", "L2", "L3", "L4"].includes(selectedGarment?.code || "") && hasLining && (
                <p>
                  Lining/Inner Net:{" "}
                  <strong className="text-heritage-gold">Included (L5) (+{currencySymbol}10.00)</strong>
                </p>
              )}`;

content = content.replace(targetStr2, replacement2);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
