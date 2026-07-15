/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Eye, Shirt, Sparkles, Camera, Users, Globe, Truck, Box, Package } from "lucide-react";
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
}: GalleryViewProps) {
  const [filter, setFilter] = useState<string>("all");
    
    
  
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
        </div>
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
