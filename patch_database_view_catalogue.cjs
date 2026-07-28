const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regex = /                  \)\)\}\n                <\/div>\n              <\/div>\n            \)\}/;

const replacement = `                  ))}
                </div>
                )}

                {styleSubTab === "catalogue" && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                      <div className="relative w-full sm:w-80">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                          <Search size={14} />
                        </span>
                        <input
                          type="text"
                          placeholder="Search custom options..."
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setIsNewCatalogOption(true);
                          setEditingCatalogOption({
                            id: \`opt-\${Date.now().toString().slice(-6)}\`,
                            label: "",
                            description: "",
                            garmentGroup: "shirt",
                            selectionGroup: "shirt_construction",
                            priceCents: 0,
                            eligibleDemographics: ["male", "unisex"],
                            displayOrder: 0,
                            required: true,
                            active: true,
                            allowMultiple: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                          });
                          setEditingType("catalog_option");
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
                      >
                        <Plus size={13} /> Add Option
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {customDetailCatalog
                        .filter(
                          (c) =>
                            c.label.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            c.garmentGroup.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            c.selectionGroup.toLowerCase().includes(catalogSearch.toLowerCase())
                        )
                        .map((opt) => (
                          <div
                            key={opt.id}
                            className="bg-white border border-heritage-gold/20 p-4 rounded-xl flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-heritage-green text-sm line-clamp-1">{opt.label}</h3>
                                <span className={\`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase \${opt.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}\`}>
                                  {opt.active ? "Active" : "Inactive"}
                                </span>
                              </div>
                              <p className="text-xs text-heritage-ink/70 mb-2 line-clamp-2">{opt.description}</p>
                              
                              <div className="flex flex-wrap gap-1 mb-3">
                                <span className="bg-blue-50 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-mono">
                                  {opt.garmentGroup} / {opt.selectionGroup}
                                </span>
                                <span className="bg-purple-50 text-purple-700 text-[9px] px-1.5 py-0.5 rounded font-mono">
                                  {opt.eligibleDemographics.join(", ")}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-2">
                              <span className="font-bold text-heritage-green text-sm">
                                {opt.priceCents === 0 ? "Included" : \`€\${(opt.priceCents / 100).toFixed(2)}\`}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingCatalogOption({ ...opt });
                                  setIsNewCatalogOption(false);
                                  setEditingType("catalog_option");
                                }}
                                className="text-heritage-gold bg-heritage-green px-3 py-1.5 rounded-lg text-xs font-bold transition hover:bg-emerald-800 flex items-center gap-1 cursor-pointer"
                              >
                                <Pen size={12} /> Edit
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
