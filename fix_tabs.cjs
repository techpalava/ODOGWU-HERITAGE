const fs = require('fs');

let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

// 1. Add imports
content = content.replace(
  'import { Eye, Shirt, Sparkles, Camera, Users, Globe, Truck, Box, Package } from "lucide-react";',
  'import { Eye, Shirt, Sparkles, Camera, Users, Globe, Truck, Box, Package, ChevronDown, Search, Star, CheckCircle2, Clock, X } from "lucide-react";'
);

// 2. Change the useState
const oldUseState = `  const [filter, setFilter] = useState<
    "all" | "male" | "female" | "fabric" | "group4" | "group5" | "community"
  >("all");`;

const newUseState = `  const [filter, setFilter] = useState<string>("all");
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const activeBatch = batches.find(b => b.isActive);
  const getBatchCategory = (batchNumber) => {
    switch (batchNumber) {
      case 1: return "male";
      case 2: return "female";
      case 3: return "fabric";
      case 4: return "group4";
      case 5: return "group5";
      default: return \`group\${batchNumber}\`;
    }
  };`;

content = content.replace(oldUseState, newUseState);

// 3. Replace the Tabs section
const filterTabsRegex = /\{\/\* Filter Tabs \*\/\}.*?(?=\{\/\* Gallery Showcase Grid \*\/\})/s;

const newFilterTabs = `{/* Filter Tabs */}
      <div className="relative">
        <div className="flex border-b border-heritage-beige pb-2 gap-4 overflow-x-auto text-xs font-bold font-sans hide-scrollbar">
          <button
            onClick={() => setFilter("all")}
            className={\`pb-2 px-3 transition whitespace-nowrap \${
              filter === "all"
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }\`}
          >
            All Showpieces
          </button>
          <button
            onClick={() => setFilter("community")}
            className={\`pb-2 px-3 transition whitespace-nowrap \${
              filter === "community"
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }\`}
          >
            Community Gallery
          </button>
          {activeBatch && (
            <button
              onClick={() => { setFilter(getBatchCategory(activeBatch.batchNumber)); setIsBrowseOpen(false); }}
              className={\`pb-2 px-3 transition whitespace-nowrap flex items-center gap-1.5 \${
                filter === getBatchCategory(activeBatch.batchNumber)
                  ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                  : "text-heritage-ink/55 hover:text-heritage-gold"
              }\`}
            >
              Current Batch <Star size={12} className={filter === getBatchCategory(activeBatch.batchNumber) ? "fill-heritage-green" : "fill-heritage-gold text-heritage-gold"} />
            </button>
          )}
          <button
            onClick={() => setIsBrowseOpen(!isBrowseOpen)}
            className={\`pb-2 px-3 transition whitespace-nowrap flex items-center gap-1 \${
              isBrowseOpen || (filter !== "all" && filter !== "community" && (!activeBatch || filter !== getBatchCategory(activeBatch.batchNumber)))
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }\`}
          >
            Browse Batches <ChevronDown size={14} className={\`transition-transform \${isBrowseOpen ? "rotate-180" : ""}\`} />
          </button>
        </div>

        {/* Browse Batches Dropdown / Bottom Sheet */}
        <AnimatePresence>
          {isBrowseOpen && (
            <>
              {/* Mobile Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40 md:hidden"
                onClick={() => setIsBrowseOpen(false)}
              />
              
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-0 left-0 right-0 h-[85vh] bg-white rounded-t-3xl shadow-2xl z-50 flex flex-col md:absolute md:top-full md:bottom-auto md:left-auto md:right-0 md:mt-2 md:w-[400px] md:h-auto md:max-h-[70vh] md:rounded-2xl border border-heritage-gold/20 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-100 flex items-center justify-between md:hidden">
                  <h3 className="font-serif font-bold text-lg text-heritage-green">Browse Batches</h3>
                  <button onClick={() => setIsBrowseOpen(false)} className="p-2 text-gray-400 hover:text-heritage-ink rounded-full bg-gray-50">
                    <X size={18} />
                  </button>
                </div>
                
                {batches.length >= 20 && (
                  <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="Search batches..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex-grow overflow-y-auto p-4 space-y-6">
                  {(() => {
                    const searchedBatches = batches.filter(b => 
                      b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      b.batchNumber.toString().includes(searchQuery)
                    ).sort((a,b) => a.batchNumber - b.batchNumber);

                    const current = searchedBatches.filter(b => b.isActive);
                    const completed = searchedBatches.filter(b => b.status === "Closed" || b.status === "Completed");
                    const upcoming = searchedBatches.filter(b => !b.isActive && b.status !== "Closed" && b.status !== "Completed");

                    return (
                      <>
                        {current.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-heritage-gold mb-3 px-2">Current</h4>
                            <div className="space-y-2">
                              {current.map(batch => (
                                <button
                                  key={batch.id}
                                  onClick={() => {
                                    setFilter(getBatchCategory(batch.batchNumber));
                                    setIsBrowseOpen(false);
                                  }}
                                  className="w-full text-left p-3 rounded-xl border border-heritage-gold bg-heritage-cream/30 hover:bg-heritage-cream flex items-center justify-between transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <Star size={16} className="text-heritage-gold fill-heritage-gold" />
                                    <div>
                                      <div className="font-bold text-sm text-heritage-green">Batch {batch.batchNumber} &ndash; {batch.name}</div>
                                      <div className="text-[10px] text-heritage-ink/60 mt-0.5">Status: Open for Orders</div>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {completed.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-2">Completed Batches</h4>
                            <div className="space-y-2">
                              {completed.map(batch => (
                                <button
                                  key={batch.id}
                                  onClick={() => {
                                    setFilter(getBatchCategory(batch.batchNumber));
                                    setIsBrowseOpen(false);
                                  }}
                                  className={\`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors \${
                                    filter === getBatchCategory(batch.batchNumber) ? 'border-heritage-green bg-gray-50' : 'border-gray-100 hover:bg-gray-50'
                                  }\`}
                                >
                                  <div className="flex items-center gap-3">
                                    <CheckCircle2 size={16} className={filter === getBatchCategory(batch.batchNumber) ? "text-heritage-green" : "text-gray-400"} />
                                    <div className={\`font-bold text-sm \${filter === getBatchCategory(batch.batchNumber) ? "text-heritage-green" : "text-gray-700"}\`}>
                                      Group {batch.batchNumber} &ndash; {batch.name}
                                    </div>
                                  </div>
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500">
                                    Closed
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {upcoming.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-2">Upcoming Batches</h4>
                            <div className="space-y-2">
                              {upcoming.map(batch => (
                                <div
                                  key={batch.id}
                                  className="w-full text-left p-3 rounded-xl border border-gray-100 bg-white flex items-center justify-between opacity-70"
                                >
                                  <div className="flex items-center gap-3">
                                    <Clock size={16} className="text-gray-400" />
                                    <div className="font-bold text-sm text-gray-500">
                                      Group {batch.batchNumber}
                                    </div>
                                  </div>
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-100 text-neutral-500">
                                    Coming Soon
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      `;

content = content.replace(filterTabsRegex, newFilterTabs);

fs.writeFileSync('src/components/GalleryView.tsx', content);
