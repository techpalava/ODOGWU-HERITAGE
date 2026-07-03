import re

with open('src/components/HomeView.tsx', 'r') as f:
    content = f.read()

# Add states inside HomeView
if 'const [fabricFilter, setFabricFilter] = useState' not in content:
    state_injection = """  const [fabricFilter, setFabricFilter] = useState("All Fabrics");
  
  const activeFabrics = [...fabrics]
    .filter((f) => f.stockStatus === "IN_STOCK" || f.stockStatus === "LOW_STOCK")
    .filter((f) => f.image)
    .filter((f) => fabricFilter === "All Fabrics" || f.category === fabricFilter)
    .slice(0, 12);
    
  const fabricCategories = ["All Fabrics", ...Array.from(new Set(fabrics.filter(f => f.stockStatus === "IN_STOCK" || f.stockStatus === "LOW_STOCK").filter(f => f.image).map(f => f.category).filter(Boolean)))];
"""
    # Insert after `const [, setNow] = useState(new Date());`
    content = content.replace('  const [, setNow] = useState(new Date());', '  const [, setNow] = useState(new Date());\n' + state_injection)

# Add the UI section
fabric_showcase = """
      {/* Fabric Showcase */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Discover Premium Fabrics
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Browse authentic Nigerian fabrics carefully selected for exceptional quality, colour, and craftsmanship.
          </p>
        </div>

        {fabricCategories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto px-4">
            {fabricCategories.map((category, idx) => (
              <button
                key={idx}
                onClick={() => setFabricFilter(category as string)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  fabricFilter === category
                    ? "bg-heritage-gold text-heritage-forest shadow-md"
                    : "bg-heritage-cream/30 text-heritage-green border border-heritage-gold/20 hover:bg-heritage-gold/20"
                }`}
              >
                {String(category).replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}

        <div className="relative max-w-[100vw] overflow-hidden px-4 sm:px-8">
          <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-4 hide-scrollbar cursor-grab active:cursor-grabbing">
            {activeFabrics.map((fabric) => (
              <div 
                key={fabric.id || fabric.code}
                className="snap-start shrink-0 w-[75vw] sm:w-[45vw] lg:w-[280px] group bg-white rounded-2xl overflow-hidden border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full"
              >
                <div className="relative aspect-square bg-heritage-cream/30 overflow-hidden cursor-pointer" onClick={() => { if (onSelectFabric) onSelectFabric(fabric.code); }}>
                  {fabric.image ? (
                    <img 
                      src={fabric.image} 
                      alt={fabric.name}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-heritage-gold/30">
                      <Sparkles size={32} />
                    </div>
                  )}
                  {/* Subtle overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  
                  {/* Badges */}
                  <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                    {fabric.category && (
                      <span className="px-2 py-1 bg-heritage-green/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                        {fabric.category.replace(/_/g, " ")}
                      </span>
                    )}
                    {fabric.stockStatus === "LOW_STOCK" && (
                      <span className="px-2 py-1 bg-red-600/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                        Limited Edition
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="p-5 flex flex-col flex-grow bg-white relative z-10 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-serif font-bold text-heritage-green text-lg leading-tight line-clamp-1 group-hover:text-heritage-gold transition-colors cursor-pointer" onClick={() => { if (onSelectFabric) onSelectFabric(fabric.code); }}>
                        {fabric.name}
                      </h3>
                      <p className="text-xs text-heritage-ink/60 font-medium capitalize mt-1 flex gap-2 items-center">
                        <span className="truncate">{fabric.code}</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-1">
                    <div 
                      className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                      style={{ backgroundColor: fabric.colorHex || "#D4AF37" }}
                    ></div>
                    <span className="text-xs font-medium text-heritage-ink/75 truncate capitalize">
                      {fabric.color}
                    </span>
                  </div>
                  
                  <div className="mt-auto pt-4">
                    <button
                      onClick={() => {
                        if (onSelectFabric) {
                          onSelectFabric(fabric.code);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-heritage-cream/50 text-heritage-green border border-heritage-gold/30 hover:bg-heritage-gold hover:text-heritage-forest hover:border-heritage-gold rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-sm flex justify-center items-center gap-2"
                    >
                      Design with this <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
"""

# Insert before Community Photo Gallery Showcase
pattern = r'(      {\/\* Community Photo Gallery Showcase \*\/})'
content = re.sub(pattern, fabric_showcase + r'\n\1', content)

with open('src/components/HomeView.tsx', 'w') as f:
    f.write(content)

