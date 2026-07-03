import { BatchBusinessRules } from "../engine/BatchBusinessRules";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Eye, Shirt, Sparkles, Camera, Users, Globe, Truck, Box, Package, ChevronDown, Search, Star, CheckCircle2, Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Showpiece, CommunityPhoto, Fabric, StyleCategory, Batch } from "../types";

interface GalleryViewProps {
  onSelectStyle: (styleId: string, fabricCode: string) => void;
  showpieces?: Showpiece[];
  communityPhotos?: CommunityPhoto[];
  fabrics: Fabric[];
  styles: StyleCategory[];
  batches?: Batch[];
  onNavigateToTab: (tab: string) => void;
}

export default function GalleryView({
  onSelectStyle,
  showpieces = [],
  communityPhotos = [],
  fabrics: _fabrics = [],
  styles: _styles = [],
  batches = [],
  onNavigateToTab,
}: GalleryViewProps) {
  const [filter, setFilter] = useState<string>("all");
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
      default: return `group${batchNumber}`;
    }
  };

  const getBatchNameFromCategory = (catStr) => {
    let bNum = 0;
    if (catStr === "male") bNum = 1;
    else if (catStr === "female") bNum = 2;
    else if (catStr === "fabric") bNum = 3;
    else if (catStr === "group4") bNum = 4;
    else if (catStr === "group5") bNum = 5;
    else if (catStr.startsWith("group")) bNum = parseInt(catStr.replace("group", ""));
    
    if (bNum > 0) {
      const b = batches.find(x => x.batchNumber === bNum);
      if (b) return `Group ${b.batchNumber} - ${b.name}`;
      return `Group ${bNum}`;
    }
    return catStr;
  };
  const filteredItems = showpieces.filter((item) => {
    if (filter === "all") return true;
    return item.category === filter;
  });

  const activeCommunityPhotos = communityPhotos
    .filter((p) => p.status === "active")
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

  return (
    <div id="gallery-view-container" className="space-y-12">
      {/* Header section */}
      <div className="border-b border-heritage-beige pb-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-heritage-gold">
          Gallery & Fabric Showcase
        </span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-heritage-green sm:text-4xl font-display">
          The Heritage Showcase
        </h1>
        <p className="mt-2 text-sm text-heritage-ink/70 max-w-3xl font-sans">
          Browse our curated traditional combinations, worn by team members
          across the community. Select any style to load its configuration instantly
          inside our Design Studio.
        </p>
      </div>

      {/* NTCC Production Timeline Section */}
      <div className="bg-heritage-cream/20 rounded-2xl p-4 md:p-5 border border-heritage-gold/15 shadow-sm mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-serif font-bold text-heritage-green tracking-tight uppercase">NTCC Timeline</h2>
            <div className="h-px w-8 bg-heritage-gold/30 hidden md:block"></div>
            <span className="text-[10px] text-heritage-ink/60 hidden sm:inline-block">Select a batch from the timeline or continue to the design studio.</span>
          </div>
          <button 
             onClick={() => onNavigateToTab("design")}
             className="px-4 py-1.5 bg-white border border-heritage-gold/40 text-heritage-gold font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm hover:bg-heritage-gold hover:text-white transition duration-300 self-start md:self-auto flex items-center gap-1.5 shrink-0"
          >
             Continue to Design Studio
          </button>
        </div>
        
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar items-center">
          {batches.sort((a,b) => a.batchNumber - b.batchNumber).map((batch) => {
            let statusColor = "bg-gray-100 text-gray-400 border-gray-100";
            let displayStatus: string = batch.status;

            if (BatchBusinessRules.getLifecycleStage(batch) === "Registration Closed" || BatchBusinessRules.getLifecycleStage(batch) === "Completed") {
              statusColor = "bg-gray-50 text-gray-400 border-gray-100";
              displayStatus = "Closed";
            }
            else if (batch.isActive) {
              statusColor = "bg-heritage-gold/10 text-heritage-gold border-heritage-gold/30";
              displayStatus = "Open for Orders";
            }
            else if (BatchBusinessRules.getLifecycleStage(batch) === "Upcoming") {
              statusColor = "bg-neutral-50 text-neutral-400 border-neutral-100";
              displayStatus = "Coming Soon";
            }
            else { 
               statusColor = "bg-heritage-green/5 text-heritage-green/60 border-heritage-green/20";
            }

            return (
              <div key={batch.id} className={`snap-start flex-shrink-0 rounded-xl border p-3 flex flex-col justify-center transition-all ${batch.isActive ? 'bg-white w-[220px] shadow-sm ring-1 ring-heritage-gold/50' : 'bg-white/40 w-[150px] opacity-70 hover:opacity-100'}`}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[9px] font-bold uppercase text-heritage-ink/50">Batch {batch.batchNumber}</span>
                  {batch.isActive ? (
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusColor}`}>
                      {displayStatus}
                    </span>
                  ) : (
                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-gray-400">
                      {displayStatus}
                    </span>
                  )}
                </div>
                <h3 className={`font-serif font-bold text-sm leading-tight truncate mb-1 ${batch.isActive ? 'text-heritage-green' : 'text-heritage-ink/60'}`}>{batch.name}</h3>
                <p className="text-[9px] text-heritage-ink/50 font-medium truncate">
                  {batch.duration || `${new Date(batch.startDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} - ${new Date(batch.endDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: '2-digit'})}`}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="relative">
        <div className="flex border-b border-heritage-beige pb-2 gap-4 overflow-x-auto text-xs font-bold font-sans hide-scrollbar">
          <button
            onClick={() => setFilter("all")}
            className={`pb-2 px-3 transition whitespace-nowrap ${
              filter === "all"
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }`}
          >
            All Showpieces
          </button>
          <button
            onClick={() => setFilter("community")}
            className={`pb-2 px-3 transition whitespace-nowrap ${
              filter === "community"
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }`}
          >
            Community Gallery
          </button>
          {activeBatch && (
            <button
              onClick={() => { setFilter(getBatchCategory(activeBatch.batchNumber)); setIsBrowseOpen(false); }}
              className={`pb-2 px-3 transition whitespace-nowrap flex items-center gap-1.5 ${
                filter === getBatchCategory(activeBatch.batchNumber)
                  ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                  : "text-heritage-ink/55 hover:text-heritage-gold"
              }`}
            >
              Current Batch <Star size={12} className={filter === getBatchCategory(activeBatch.batchNumber) ? "fill-heritage-green" : "fill-heritage-gold text-heritage-gold"} />
            </button>
          )}
          <button
            onClick={() => setIsBrowseOpen(!isBrowseOpen)}
            className={`pb-2 px-3 transition whitespace-nowrap flex items-center gap-1 ${
              isBrowseOpen || (filter !== "all" && filter !== "community" && (!activeBatch || filter !== getBatchCategory(activeBatch.batchNumber)))
                ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                : "text-heritage-ink/55 hover:text-heritage-gold"
            }`}
          >
            Browse Batches <ChevronDown size={14} className={`transition-transform ${isBrowseOpen ? "rotate-180" : ""}`} />
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
                    const completed = searchedBatches.filter(b => BatchBusinessRules.getLifecycleStage(b) === "Registration Closed" || BatchBusinessRules.getLifecycleStage(b) === "Completed");
                    const upcoming = searchedBatches.filter(b => !b.isActive && b.status !== "CLOSED" && b.status !== "COMPLETED");

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
                                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-heritage-gold/20 text-heritage-gold mt-1 inline-block border border-heritage-gold/30">Open for Orders</span>
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
                                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-colors ${
                                    filter === getBatchCategory(batch.batchNumber) ? 'border-heritage-green bg-gray-50' : 'border-gray-100 hover:bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <CheckCircle2 size={16} className={filter === getBatchCategory(batch.batchNumber) ? "text-heritage-green" : "text-gray-400"} />
                                    <div className={`font-bold text-sm ${filter === getBatchCategory(batch.batchNumber) ? "text-heritage-green" : "text-gray-700"}`}>
                                      Group {batch.batchNumber} &ndash; {batch.name} &ndash; {batch.name}
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

      {/* Gallery Showcase Grid */}
      <AnimatePresence mode="wait">
        <motion.div
          key={filter}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="w-full"
        >
          {filter === "community" ? (
            <div className="space-y-16">
              {activeCommunityPhotos.length === 0 ? (
                <div className="col-span-full py-12 text-center">
                  <Camera className="mx-auto h-12 w-12 text-heritage-ink/20 mb-3" />
                  <p className="text-heritage-ink/60 font-sans text-sm">
                    No community gallery photos found.
                  </p>
                </div>
              ) : (
                (() => {
                  const groups = batches.sort((a,b) => a.batchNumber - b.batchNumber).map(b => {
                    const title = `Group ${b.batchNumber} - ${b.name}`;
                    // some photos might have been saved with old hardcoded names, map them:
                    let legacyName = "";
                    if (b.batchNumber === 1) legacyName = "Group 1 - Pioneers";
                    else if (b.batchNumber === 2) legacyName = "Group 2 - Transformers";
                    else if (b.batchNumber === 3) legacyName = "Group 3 - Avatars";
                    else if (b.batchNumber === 4) legacyName = "Group 4 - Executives";
                    else if (b.batchNumber === 5) legacyName = "Group 5 - Transformers";
                    
                    const photos = activeCommunityPhotos.filter(p => p.cohortName === title || (legacyName && p.cohortName === legacyName));
                    return { title, photos };
                  });
                  
                  const otherPhotos = activeCommunityPhotos.filter(p => {
                    return !groups.some(g => g.photos.some(photo => photo.id === p.id));
                  });
                  
                  if (otherPhotos.length > 0) {
                    groups.push({ title: "Other / Uncategorized", photos: otherPhotos });
                  }
                  
                  const activeGroups = groups.filter(g => g.photos.length > 0);

                  return activeGroups.map(group => (
                    <div key={group.title} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h2 className="font-serif text-2xl font-bold text-heritage-green">
                          {group.title}
                        </h2>
                        <div className="h-px flex-grow bg-heritage-gold/20"></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {group.photos.map((photo) => (
                          <div
                            key={photo.id}
                            className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col aspect-[3/4] sm:aspect-[4/5] lg:aspect-[3/4]"
                          >
                            <div className="relative h-[75%] sm:h-[78%] lg:h-[80%] w-full overflow-hidden bg-heritage-cream">
                              <img
                                src={photo.url}
                                alt={photo.caption || "Community Photo"}
                                className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                referrerPolicy="no-referrer"
                              />
                              {photo.featured && (
                                <div className="absolute top-4 right-4 bg-heritage-gold text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                                  Featured
                                </div>
                              )}
                            </div>
                            <div className="h-[25%] sm:h-[22%] lg:h-[20%] p-4 sm:p-5 space-y-2 flex flex-col justify-between font-sans text-xs">
                              <p className="text-heritage-ink/80 leading-relaxed italic line-clamp-2 sm:line-clamp-3">
                                "{photo.caption}"
                              </p>
                              <div className="flex items-center gap-2 pt-2 border-t border-gray-100 mt-2">
                                <span className="font-mono text-[10px] text-heritage-ink/60">
                                  {photo.deliveryYear}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()
              )}
            </div>
          ) : filter === "fabric" ? (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="font-serif text-3xl font-bold text-heritage-green">
                    {getBatchNameFromCategory("fabric")}
                  </h2>
                  <p className="text-sm font-medium text-heritage-gold uppercase tracking-wider mt-1">Current Batch &bull; Coming Soon</p>
                </div>
                <div className="h-px flex-grow bg-heritage-gold/20"></div>
              </div>
              <p className="text-heritage-ink/70 max-w-2xl text-sm leading-relaxed mb-6">
                {batches.find(b => b.batchNumber === 3)?.name || "This group"} represents one of the latest NTCC production batches. Their custom-made traditional garments are presently being designed, tailored in Nigeria, and prepared for shipment to the Netherlands.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl border border-heritage-gold/15 p-8 flex flex-col items-center justify-center text-center min-h-[200px] shadow-sm">
                  <Shirt className="h-10 w-10 text-heritage-gold/40 mb-4" />
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-2">Outfit Showcase</h3>
                  <p className="text-xs text-heritage-ink/60">Coming Soon</p>
                </div>
                <div className="bg-white rounded-3xl border border-heritage-gold/15 p-8 flex flex-col items-center justify-center text-center min-h-[200px] shadow-sm">
                  <Users className="h-10 w-10 text-heritage-gold/40 mb-4" />
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-2">Participant Gallery</h3>
                  <p className="text-xs text-heritage-ink/60">Coming Soon</p>
                </div>
                <div className="bg-white rounded-3xl border border-heritage-gold/15 p-8 flex flex-col items-center justify-center text-center min-h-[200px] shadow-sm">
                  <Globe className="h-10 w-10 text-heritage-gold/40 mb-4" />
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-2">Community Stories</h3>
                  <p className="text-xs text-heritage-ink/60">Coming Soon</p>
                </div>
                <div className="bg-white rounded-3xl border border-heritage-gold/15 p-8 flex flex-col items-center justify-center text-center min-h-[200px] shadow-sm">
                  <Camera className="h-10 w-10 text-heritage-gold/40 mb-4" />
                  <h3 className="font-serif font-bold text-lg text-heritage-green mb-2">Behind-the-Scenes Photos</h3>
                  <p className="text-xs text-heritage-ink/60">Coming Soon</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              {filter === "male" && (
                <div className="mb-10">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="font-serif text-3xl font-bold text-heritage-green">
                      {getBatchNameFromCategory("male")}
                    </h2>
                    <div className="h-px flex-grow bg-heritage-gold/20"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Users size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Participants</span>
                        <strong className="text-lg font-serif text-heritage-green">11 Members</strong>
                        <div className="text-[10px] text-heritage-ink/60 mt-0.5">10 Gentlemen, 1 Lady</div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Globe size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Nationalities</span>
                        <strong className="text-lg font-serif text-heritage-green">6 Origins</strong>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Shirt size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Traditional Outfits</span>
                        <strong className="text-lg font-serif text-heritage-green">13 Outfits</strong>
                        <div className="text-[10px] text-heritage-ink/60 mt-0.5">Including 1 Couple / Family</div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Truck size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Production Status</span>
                        <strong className="text-lg font-serif text-heritage-green">Delivered</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {filter === "female" && (
                <div className="mb-10">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="font-serif text-3xl font-bold text-heritage-green">
                      {getBatchNameFromCategory("female")}
                    </h2>
                    <div className="h-px flex-grow bg-heritage-gold/20"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Users size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Participants</span>
                        <strong className="text-lg font-serif text-heritage-green">15 Members</strong>
                        <div className="text-[10px] text-heritage-ink/60 mt-0.5">13 New, 2 Returning</div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Shirt size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Traditional Outfits</span>
                        <strong className="text-lg font-serif text-heritage-green">17 Outfits</strong>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Package size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Production Status</span>
                        <strong className="text-lg font-serif text-heritage-green">Delivered</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {filter === "group4" && (
                <div className="mb-10">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="font-serif text-3xl font-bold text-heritage-green">
                      {getBatchNameFromCategory("group4")}
                    </h2>
                    <div className="h-px flex-grow bg-heritage-gold/20"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Users size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Participants</span>
                        <strong className="text-lg font-serif text-heritage-green">Members (TBD)</strong>
                        <div className="text-[10px] text-heritage-ink/60 mt-0.5">TBD</div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Shirt size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Traditional Outfits</span>
                        <strong className="text-lg font-serif text-heritage-green">Outfits (TBD)</strong>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Package size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Production Status</span>
                        <strong className="text-lg font-serif text-heritage-green">Coming Soon</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {filter === "group5" && (
                <div className="mb-10">
                  <div className="flex items-center gap-4 mb-6">
                    <h2 className="font-serif text-3xl font-bold text-heritage-green">
                      {getBatchNameFromCategory("group5")}
                    </h2>
                    <div className="h-px flex-grow bg-heritage-gold/20"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Users size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Participants</span>
                        <strong className="text-lg font-serif text-heritage-green">Members (TBD)</strong>
                        <div className="text-[10px] text-heritage-ink/60 mt-0.5">TBD</div>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Shirt size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Traditional Outfits</span>
                        <strong className="text-lg font-serif text-heritage-green">Outfits (TBD)</strong>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
                      <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
                        <Package size={18} />
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Production Status</span>
                        <strong className="text-lg font-serif text-heritage-green">Coming Soon</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
                  >
                    <div className="relative h-96 w-full overflow-hidden bg-heritage-cream">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center opacity-30"
                          style={{ backgroundColor: item.colorHex }}
                        >
                          <Shirt size={48} className="text-white" />
                        </div>
                      )}
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur text-heritage-green text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                        {item.tag}
                      </div>
                    </div>
                    <div className="p-5 flex-grow flex flex-col">
                      <h3 className="font-serif text-xl font-bold text-heritage-green mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-heritage-ink/70 mb-4 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                      <div className="mt-auto space-y-3">
                        <div className="flex gap-2">
                          <span className="inline-flex items-center gap-1 bg-heritage-cream px-2 py-1 rounded text-[10px] font-bold text-heritage-gold tracking-wider uppercase">
                            <Sparkles size={12} />
                            {item.styleName}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-gray-50 px-2 py-1 rounded text-[10px] font-bold text-gray-500 tracking-wider uppercase">
                            <Box size={12} />
                            {item.fabricName}
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            onSelectStyle(item.styleId, item.fabricCode)
                          }
                          className="w-full py-2.5 rounded-xl border border-heritage-gold/30 text-heritage-gold text-xs font-bold uppercase tracking-wider hover:bg-heritage-gold hover:text-white transition flex items-center justify-center gap-2"
                        >
                          <Eye size={14} /> Customize This Look
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
