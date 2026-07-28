const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const targetForm = `                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Target Demographic
                      </label>
                      <select
                        value={editingItem.gender || "unisex"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            gender: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {genderOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>`;

const repForm = `                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">
                        Target Demographic
                      </label>
                      <select
                        value={editingItem.gender || "unisex"}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            gender: e.target.value,
                            targetDemographic: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {genderOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 col-span-1 sm:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingItem.featuresMaleAndFemale || false}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              featuresMaleAndFemale: e.target.checked,
                            })
                          }
                          className="h-4 w-4 text-heritage-green rounded"
                        />
                        <span className="font-bold text-heritage-green">Explicitly features BOTH male and female garments</span>
                      </label>
                    </div>
                    <div className="space-y-1 col-span-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green block">
                        Supported Garments (Explicitly whitelist what shows up in Custom Details)
                      </label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {['shirt', 'trousers', 'shorts', 'bum_shorts', 'dress', 'skirt'].map(g => (
                          <label key={g} className="flex items-center gap-2 cursor-pointer bg-heritage-cream/20 px-3 py-1.5 rounded border border-gray-150 text-[10px]">
                            <input
                              type="checkbox"
                              checked={(editingItem.supportedGarmentDetails || []).includes(g)}
                              onChange={(e) => {
                                const list = editingItem.supportedGarmentDetails || [];
                                setEditingItem({
                                  ...editingItem,
                                  supportedGarmentDetails: e.target.checked 
                                    ? [...list, g] 
                                    : list.filter((i: string) => i !== g),
                                })
                              }}
                              className="h-3 w-3 text-heritage-green rounded"
                            />
                            <span className="capitalize">{g.replace('_', ' ')}</span>
                          </label>
                        ))}
                      </div>
                    </div>`;

content = content.replace(targetForm, repForm);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
