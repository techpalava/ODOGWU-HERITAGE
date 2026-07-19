const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `          {/* STEP 3: Customize Accents */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 3 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Choose Custom Details
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Choose your collar type, embroidery style, sleeves, and
                  pockets.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                {/* Collar */}
                <SelectField
                  label="Collar Form"
                  value={designSelections.collar}
                  onChange={(e) =>
                    setDesignSelections((prev) => ({
                      ...prev,
                      collar: e.target.value,
                    }))
                  }
                  options={DESIGN_OPTIONS.collars.map((c) => ({
                    value: c.name,
                    label: c.name,
                  }))}
                />
                {/* Embroidery Style */}
                <SelectField
                  label="Embroidery Pattern Detailing"
                  value={designSelections.embroidery}
                  onChange={(e) =>
                    setDesignSelections((prev) => ({
                      ...prev,
                      embroidery: e.target.value,
                    }))
                  }
                  options={DESIGN_OPTIONS.embroideries.map((em) => ({
                    value: em.name,
                    label: em.name,
                  }))}
                />
                {/* Sleeves */}
                <SelectField
                  label="Sleeve Style"
                  value={designSelections.sleeve}
                  onChange={(e) =>
                    setDesignSelections((prev) => ({
                      ...prev,
                      sleeve: e.target.value,
                    }))
                  }
                  options={DESIGN_OPTIONS.sleeves.map((sl) => ({
                    value: sl.name,
                    label: sl.name,
                  }))}
                />
                {/* Pockets */}
                <SelectField
                  label="Functional Pockets"
                  value={designSelections.pocket}
                  onChange={(e) =>
                    setDesignSelections((prev) => ({
                      ...prev,
                      pocket: e.target.value,
                    }))
                  }
                  options={DESIGN_OPTIONS.pockets.map((pk) => ({
                    value: pk.name,
                    label: pk.name,
                  }))}
                />
                {/* Hem finish */}
                <SelectField
                  label="Lower Hem Edge Trim"
                  value={designSelections.hemFinish}
                  onChange={(e) =>
                    setDesignSelections((prev) => ({
                      ...prev,
                      hemFinish: e.target.value,
                    }))
                  }
                  options={DESIGN_OPTIONS.hemFinishes.map((hem) => ({
                    value: hem.name,
                    label: hem.name,
                  }))}
                />
                {/* Matching Cap Toggle (Only for relevant male styles) */}
                {selectedStyle?.gender === "male" && (
                  <div className="space-y-2">
                    <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                      Headwear Accents
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-150 rounded-xl bg-heritage-cream/20 hover:border-heritage-gold/30 transition min-h-[56px] w-full">
                      <input
                        type="checkbox"
                        checked={designSelections.additionalCap}
                        onChange={(e) =>
                          setDesignSelections((prev) => ({
                            ...prev,
                            additionalCap: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 text-heritage-green focus:ring-heritage-gold rounded border-gray-300 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-heritage-green text-xs block">
                          Add Custom Fila (Cap)
                        </span>
                        <span className="text-[10px] text-heritage-ink/50 block leading-tight">
                          Traditional matching cap (Others-1: +€10.00)
                        </span>
                      </div>
                    </label>
                  </div>
                )}
                {/* Ladies Inner Lining Net Toggle */}
                {selectedStyle?.gender === "female" &&
                  ["L1", "L2", "L3", "L4"].includes(
                    selectedGarment?.code || "",
                  ) && (
                    <div className="space-y-2">
                      <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                        Dress Reinforcement
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-150 rounded-xl bg-heritage-cream/20 hover:border-heritage-gold/30 transition min-h-[56px] w-full">
                        <input
                          type="checkbox"
                          checked={hasLining}
                          onChange={(e) => setHasLining(e.target.checked)}
                          className="h-4 w-4 text-heritage-green focus:ring-heritage-gold rounded border-gray-300 cursor-pointer"
                        />
                        <div>
                          <span className="font-bold text-heritage-green text-xs block">
                            ✓ Add Inner Net / Lining (L5)
                          </span>
                          <span className="text-[10px] text-heritage-ink/50 block leading-tight">
                            Provides structure & opacity (+€10.00)
                          </span>
                        </div>
                      </label>
                    </div>
                  )}
                {/* Optional Accessories */}
                {batchType !== "alone" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                        Included Details
                      </label>
                      <div className="text-xs text-heritage-ink/75 bg-heritage-cream/30 p-3 rounded-xl border border-gray-150">
                        Group/Cohort orders do not have optional accessories.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                      Optional Accessories
                    </label>
                    <div className="space-y-2">
                      {["Traditional Bead", "Traditional Stick"].map((acc) => (
                        <label
                          key={acc}
                          className="flex items-center gap-3 cursor-pointer p-3 border border-gray-150 rounded-xl bg-heritage-cream/20 hover:border-heritage-gold/30 transition min-h-[56px] w-full"
                        >
                          <input
                            type="checkbox"
                            checked={optionalAccessories.includes(acc)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setOptionalAccessories((prev) => [...prev, acc]);
                              } else {
                                setOptionalAccessories((prev) =>
                                  prev.filter((a) => a !== acc),
                                );
                              }
                            }}
                            className="h-4 w-4 text-heritage-green focus:ring-heritage-gold rounded border-gray-300 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-heritage-green text-xs block">
                              Add {acc}
                            </span>
                            <span className="text-[10px] text-heritage-ink/50 block leading-tight">
                              Optional embellishment (+€10.00)
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}`;

const replacement = `          {/* STEP 3: Customize Garment Details */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 3 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Customize Garment Details
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Select lengths, pockets, embroideries, and accessories for your outfit.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GarmentDetailSelector
                  selectedStyle={selectedStyle}
                  selectedGarment={selectedGarment}
                  designSelections={designSelections}
                  setDesignSelections={setDesignSelections}
                  hasLining={hasLining}
                  setHasLining={setHasLining}
                  currencySymbol={currencySymbol}
                />
              </div>
            </div>
          )}`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
