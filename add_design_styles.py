import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Find the end of Fabric Showcase
# Let's search for "Community Photo Gallery Showcase"
parts = content.split("      {/* Community Photo Gallery Showcase */}")

# Find "Made For Everyone" section
mfe_start_idx = parts[0].find("      {/* Made For Everyone */}")
mfe_end_idx = parts[0].find("      {/* How It Works (Tailoring Journey) */}")

if mfe_start_idx != -1 and mfe_end_idx != -1:
    mfe_section = parts[0][mfe_start_idx:mfe_end_idx]
    
    # Remove it from parts[0]
    parts[0] = parts[0][:mfe_start_idx] + parts[0][mfe_end_idx:]

design_styles_section = """
      {/* Design Styles Showcase */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Explore Design Styles
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Discover beautifully tailored traditional Nigerian clothing styles, each custom-made to your measurements using the fabric of your choice.
          </p>
        </div>

        {styleCategories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto px-4">
            {styleCategories.map((category, idx) => (
              <button
                key={idx}
                onClick={() => setStyleFilter(category as string)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  styleFilter === category
                    ? "bg-heritage-gold text-heritage-forest shadow-md"
                    : "bg-heritage-cream/30 text-heritage-green border border-heritage-gold/20 hover:bg-heritage-gold/20"
                }`}
              >
                {String(category).replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}

        {activeStyles.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-heritage-gold/30 rounded-2xl mx-4 sm:mx-8 bg-heritage-cream/10">
            <p className="text-sm text-heritage-ink/60 font-medium">
              Our style collection is being updated. Please visit the Design
              Studio soon.
            </p>
          </div>
        ) : (
          <div className="relative max-w-full overflow-hidden px-4 sm:px-8">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-4 hide-scrollbar cursor-grab active:cursor-grabbing">
              {activeStyles.map((style) => (
                <div
                  key={style.id}
                  className="snap-start shrink-0 w-[75vw] sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] group bg-white rounded-2xl overflow-hidden border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full"
                >
                  <div
                    className="relative aspect-square bg-heritage-cream/30 overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (onSelectStyle) onSelectStyle(style.id, "");
                    }}
                  >
                    {style.image ? (
                      <img
                        src={style.image}
                        alt={style.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-heritage-cream/50 group-hover:scale-105 transition-transform duration-700 ease-in-out flex items-center justify-center">
                        <span className="text-heritage-gold/40 font-serif text-sm">No Image</span>
                      </div>
                    )}
                    
                    {/* Subtle overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    {/* Badges */}
                    <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                      {style.gender && (
                        <span className="px-2 py-1 bg-heritage-green/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          {style.gender === "male" ? "Men" : style.gender === "female" ? "Women" : style.gender}
                        </span>
                      )}
                      {style.outfitType && (
                        <span className="px-2 py-1 bg-heritage-gold/90 text-heritage-forest backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          {style.outfitType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-grow bg-white relative z-10 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3
                          className="font-serif font-bold text-heritage-green text-lg leading-tight line-clamp-1 group-hover:text-heritage-gold transition-colors cursor-pointer"
                          onClick={() => {
                            if (onSelectStyle) onSelectStyle(style.id, "");
                          }}
                        >
                          {style.name}
                        </h3>
                        {style.description && (
                          <p className="text-xs text-heritage-ink/60 font-medium mt-1 line-clamp-2 leading-relaxed">
                            {style.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => {
                          if (onSelectStyle) {
                            onSelectStyle(style.id, "");
                          }
                        }}
                        className="w-full py-2.5 px-4 bg-heritage-cream/50 text-heritage-green border border-heritage-gold/30 hover:bg-heritage-gold hover:text-heritage-forest hover:border-heritage-gold rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-sm flex justify-center items-center gap-2"
                      >
                        Design this style <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

"""

new_content = parts[0] + design_styles_section + mfe_section + "      {/* Community Photo Gallery Showcase */}" + parts[1]

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(new_content)
