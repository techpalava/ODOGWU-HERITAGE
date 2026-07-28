const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regex = /<div className="space-y-1 col-span-1 sm:col-span-2">\n\s*<label className="flex items-center gap-2 cursor-pointer">\n\s*<input\n\s*type="checkbox"\n\s*checked=\{editingItem.featuresMaleAndFemale[\s\S]*?<\/div>\n\s*<\/div>/;

const replacement = `<div className="space-y-4 col-span-1 sm:col-span-2 bg-heritage-cream/10 p-4 rounded-xl border border-heritage-gold/20">
                      <h4 className="font-bold text-heritage-green text-sm mb-2 border-b border-heritage-gold/20 pb-2">Step 3 Custom Detail Configuration</h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="font-bold text-heritage-green block">Represented Genders</label>
                          <div className="flex gap-4">
                            {['male', 'female'].map(g => (
                              <label key={g} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editingItem.customDetailConfig?.representedGenders?.includes(g) || false}
                                  onChange={(e) => {
                                    const conf = editingItem.customDetailConfig || { representedGenders: [], featuresMaleAndFemale: false, supportedGarmentGroups: [], requiredSelectionGroups: [], enabled: true };
                                    const list = conf.representedGenders || [];
                                    setEditingItem({
                                      ...editingItem,
                                      customDetailConfig: {
                                        ...conf,
                                        representedGenders: e.target.checked ? [...list, g] : list.filter((i: string) => i !== g)
                                      }
                                    });
                                  }}
                                  className="h-4 w-4 text-heritage-green rounded"
                                />
                                <span className="capitalize">{g}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer mt-6">
                            <input
                              type="checkbox"
                              checked={editingItem.customDetailConfig?.featuresMaleAndFemale || false}
                              onChange={(e) => {
                                const conf = editingItem.customDetailConfig || { representedGenders: [], featuresMaleAndFemale: false, supportedGarmentGroups: [], requiredSelectionGroups: [], enabled: true };
                                setEditingItem({
                                  ...editingItem,
                                  customDetailConfig: { ...conf, featuresMaleAndFemale: e.target.checked }
                                });
                              }}
                              className="h-4 w-4 text-heritage-green rounded"
                            />
                            <span className="font-bold text-heritage-green">Explicitly features BOTH male and female garments</span>
                          </label>
                        </div>

                        <div className="space-y-2 col-span-1 sm:col-span-2">
                          <label className="font-bold text-heritage-green block">Supported Garment Groups</label>
                          <div className="flex flex-wrap gap-2">
                            {['shirt', 'dress', 'neck', 'standard_shorts', 'bum_shorts', 'trousers', 'skirt'].map(g => (
                              <label key={g} className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded border border-gray-150 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editingItem.customDetailConfig?.supportedGarmentGroups?.includes(g) || false}
                                  onChange={(e) => {
                                    const conf = editingItem.customDetailConfig || { representedGenders: [], featuresMaleAndFemale: false, supportedGarmentGroups: [], requiredSelectionGroups: [], enabled: true };
                                    const list = conf.supportedGarmentGroups || [];
                                    setEditingItem({
                                      ...editingItem,
                                      customDetailConfig: {
                                        ...conf,
                                        supportedGarmentGroups: e.target.checked ? [...list, g] : list.filter((i: string) => i !== g)
                                      }
                                    });
                                  }}
                                  className="h-4 w-4 text-heritage-green rounded"
                                />
                                <span className="capitalize">{g.replace(/_/g, ' ')}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2 col-span-1 sm:col-span-2 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingItem.customDetailConfig?.enabled ?? true}
                              onChange={(e) => {
                                const conf = editingItem.customDetailConfig || { representedGenders: [], featuresMaleAndFemale: false, supportedGarmentGroups: [], requiredSelectionGroups: [], enabled: true };
                                setEditingItem({
                                  ...editingItem,
                                  customDetailConfig: { ...conf, enabled: e.target.checked }
                                });
                              }}
                              className="h-4 w-4 text-heritage-green rounded"
                            />
                            <span className="font-bold text-heritage-green">Enable Step 3 Custom Details for this style</span>
                          </label>
                        </div>
                      </div>
                    </div>`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
