const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regex = /                \{editingType === "style" && \(/;

const editor = `                {editingType === "catalog_option" && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const item = editingCatalogOption;
                      if (!item.id || !item.label || !item.description || !item.garmentGroup || !item.selectionGroup || item.eligibleDemographics.length === 0) {
                        alert("Missing required fields");
                        return;
                      }
                      try {
                        const { StorageService } = await import('../services/storageService');
                        item.updatedAt = new Date().toISOString();
                        await StorageService.saveCatalogOption(item);
                        
                        setCustomDetailCatalog((prev: any) => {
                          const existing = prev.find((o: any) => o.id === item.id);
                          if (existing) return prev.map((o: any) => o.id === item.id ? item : o);
                          return [...prev, item];
                        });
                        setEditingType(null);
                        setEditingCatalogOption(null);
                      } catch (err) {
                        alert("Failed to save catalog option");
                      }
                    }}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans"
                  >
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Option ID (Primary Key)</label>
                      <input
                        type="text"
                        required
                        disabled={!isNewCatalogOption}
                        value={editingCatalogOption?.id || ""}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, id: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Customer-Facing Label</label>
                      <input
                        type="text"
                        required
                        value={editingCatalogOption?.label || ""}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, label: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="font-bold text-heritage-green">Description</label>
                      <textarea
                        required
                        value={editingCatalogOption?.description || ""}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, description: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg min-h-[60px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Garment Group</label>
                      <select
                        required
                        value={editingCatalogOption?.garmentGroup || ""}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, garmentGroup: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {['shirt', 'dress', 'neck', 'standard_shorts', 'bum_shorts', 'trousers', 'skirt'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Selection Group</label>
                      <select
                        required
                        value={editingCatalogOption?.selectionGroup || ""}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, selectionGroup: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      >
                        {['shirt_construction', 'shirt_pockets', 'dress_construction', 'dress_pockets', 'neck_design', 'standard_shorts_fastening', 'standard_shorts_pockets', 'bum_shorts_fastening', 'bum_shorts_pockets', 'trouser_fastening', 'trouser_pockets', 'skirt_length', 'skirt_pockets'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Price (in cents, e.g. 6500 for €65.00)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={editingCatalogOption?.priceCents || 0}
                        onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, priceCents: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green block">Eligible Demographics</label>
                      <div className="flex gap-4 mt-2">
                        {['male', 'female', 'unisex'].map(d => (
                          <label key={d} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(editingCatalogOption?.eligibleDemographics || []).includes(d)}
                              onChange={(e) => {
                                const curr = editingCatalogOption?.eligibleDemographics || [];
                                setEditingCatalogOption({
                                  ...editingCatalogOption,
                                  eligibleDemographics: e.target.checked ? [...curr, d] : curr.filter((x: string) => x !== d)
                                });
                              }}
                              className="h-4 w-4 text-heritage-green rounded"
                            />
                            <span className="capitalize">{d}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer p-2 bg-heritage-cream/30 rounded border border-heritage-gold/20">
                        <input
                          type="checkbox"
                          checked={editingCatalogOption?.active ?? true}
                          onChange={(e) => setEditingCatalogOption({ ...editingCatalogOption, active: e.target.checked })}
                          className="h-4 w-4 text-heritage-green rounded"
                        />
                        <span className="font-bold text-heritage-green">Active (Available for new orders)</span>
                      </label>
                    </div>
                    
                    <div className="col-span-1 sm:col-span-2 flex justify-end gap-3 mt-4 pt-4 border-t border-heritage-gold/20">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingType(null);
                          setEditingCatalogOption(null);
                        }}
                        className="px-4 py-2 text-heritage-ink/70 font-bold hover:bg-gray-100 rounded-lg transition cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg shadow-sm hover:bg-emerald-800 transition cursor-pointer"
                      >
                        Save Option
                      </button>
                    </div>
                  </form>
                )}

                {editingType === "style" && (`;

content = content.replace(regex, editor);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
