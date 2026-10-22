/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Eye, Shirt, Sparkles, Camera, Users, Globe, Box, Package } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Showpiece, CommunityPhoto, Fabric, StyleCategory, Batch } from "../types";
import { COMMUNITY_GROUPS, type CommunityGroup } from "../data/communityStats";

interface GalleryViewProps {
  onSelectStyle: (styleId: string, fabricCode: string) => void;
  showpieces?: Showpiece[];
  communityPhotos?: CommunityPhoto[];
  fabrics: Fabric[];
  styles: StyleCategory[];
  batches?: Batch[];
  onNavigateToTab: (tab: string) => void;
}

/**
 * Showpiece category keys already stored on gallery items.
 * These stay as category ids. The visible label is the community group name.
 */
const GALLERY_GROUP_FILTERS = [
  { number: 1, filter: "male" },
  { number: 2, filter: "female" },
  { number: 3, filter: "fabric" },
  { number: 4, filter: "group4" },
  { number: 5, filter: "group5" },
] as const;

/**
 * Photos saved before the verified group names still carry the old cohort
 * string. They match into the verified group and are never used as the heading.
 */
const HISTORICAL_COHORT_ALIASES: Readonly<Record<number, readonly string[]>> = {
  2: ["Group 2 - Transformers"],
  3: ["Group 3 - Avatars"],
  5: ["Group 5 - Transformers"],
};

/**
 * Production status is not in communityStats. Groups 1 and 2 already showed
 * Delivered. Groups 3–5 had no verified status, so no status is shown for them.
 */
const RETAINED_GALLERY_PRODUCTION_STATUS: Readonly<Partial<Record<number, string>>> = {
  1: "Delivered",
  2: "Delivered",
};

const galleryFilterForGroup = (number: number): string =>
  GALLERY_GROUP_FILTERS.find((entry) => entry.number === number)?.filter ??
  `group${number}`;

const communityGroupForBatch = (batch: Batch): CommunityGroup | undefined =>
  COMMUNITY_GROUPS.find((group) => group.number === batch.batchNumber);

const galleryCohortTitle = (batch: Batch): string => {
  const group = communityGroupForBatch(batch);
  if (group) return `Group ${group.number} - ${group.name}`;
  return `Group ${batch.batchNumber} - ${batch.name}`;
};

const acceptedCohortNames = (batch: Batch): Set<string> => {
  const names = new Set<string>([
    galleryCohortTitle(batch),
    `Group ${batch.batchNumber} - ${batch.name}`,
  ]);
  for (const alias of HISTORICAL_COHORT_ALIASES[batch.batchNumber] ?? []) {
    names.add(alias);
  }
  return names;
};

function GalleryGroupStats({ group }: { group: CommunityGroup }) {
  const productionStatus = RETAINED_GALLERY_PRODUCTION_STATUS[group.number];

  return (
    <div
      className="mb-10"
      data-gallery-group={group.name}
      data-member-count={group.people}
      data-outfit-count={group.outfits}
      data-nationality-count={group.nationalities}
    >
      <div className="flex items-center gap-4 mb-6">
        <h2 className="font-serif text-3xl font-bold text-heritage-green">
          Group {group.number} - {group.name}
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
            <strong className="text-lg font-serif text-heritage-green">{group.people} Members</strong>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
          <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
            <Globe size={18} />
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Nationalities</span>
            <strong className="text-lg font-serif text-heritage-green">{group.nationalities} Nationalities</strong>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
          <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
            <Shirt size={18} />
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Traditional Outfits</span>
            <strong className="text-lg font-serif text-heritage-green">{group.outfits} Outfits</strong>
          </div>
        </div>
        {productionStatus ? (
          <div className="bg-white p-4 rounded-2xl border border-heritage-gold/15 shadow-sm flex items-center gap-4">
            <div className="bg-heritage-cream w-10 h-10 rounded-full flex items-center justify-center text-heritage-gold shrink-0">
              <Package size={18} />
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Production Status</span>
              <strong className="text-lg font-serif text-heritage-green">{productionStatus}</strong>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
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
  const selectedGroup = COMMUNITY_GROUPS.find(
    (group) => galleryFilterForGroup(group.number) === filter,
  );

  const filteredItems = showpieces.filter((item) => {
    if (filter === "all") return true;
    return item.category === filter;
  });

  const activeCommunityPhotos = communityPhotos
    .filter((photo) => photo.status === "active")
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
          {COMMUNITY_GROUPS.map((group) => {
            const groupFilter = galleryFilterForGroup(group.number);
            const selected = filter === groupFilter;
            return (
              <button
                key={group.number}
                data-gallery-group-filter={group.name}
                onClick={() => setFilter(groupFilter)}
                className={`pb-2 px-3 transition whitespace-nowrap ${
                  selected
                    ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
                    : "text-heritage-ink/55 hover:text-heritage-gold"
                }`}
              >
                Group {group.number} - {group.name}
              </button>
            );
          })}
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
                  const orderedBatches = [...batches].sort(
                    (a, b) => a.batchNumber - b.batchNumber,
                  );
                  const groups = orderedBatches.map((batch) => {
                    const title = galleryCohortTitle(batch);
                    const names = acceptedCohortNames(batch);
                    const photos = activeCommunityPhotos.filter((photo) =>
                      names.has(photo.cohortName),
                    );
                    return {
                      title,
                      photos,
                      communityGroup: communityGroupForBatch(batch),
                    };
                  });

                  const otherPhotos = activeCommunityPhotos.filter((photo) => {
                    return !groups.some((group) =>
                      group.photos.some((grouped) => grouped.id === photo.id),
                    );
                  });

                  if (otherPhotos.length > 0) {
                    groups.push({
                      title: "Other / Uncategorized",
                      photos: otherPhotos,
                      communityGroup: undefined,
                    });
                  }

                  const activeGroups = groups.filter((group) => group.photos.length > 0);

                  return activeGroups.map((group) => (
                    <div
                      key={group.title}
                      className="space-y-6"
                      data-gallery-section-title={group.title}
                      data-gallery-cohort={group.communityGroup?.name}
                      data-member-count={group.communityGroup?.people}
                      data-outfit-count={group.communityGroup?.outfits}
                      data-nationality-count={group.communityGroup?.nationalities}
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <h2 className="font-serif text-2xl font-bold text-heritage-green">
                            {group.title}
                          </h2>
                          {group.communityGroup ? (
                            <p className="text-xs text-heritage-ink/60 font-sans mt-1">
                              {group.communityGroup.people} Members · {group.communityGroup.outfits} Outfits · {group.communityGroup.nationalities} Nationalities
                            </p>
                          ) : null}
                        </div>
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
          ) : (
            <div className="space-y-8 animate-in fade-in duration-500">
              {selectedGroup ? <GalleryGroupStats group={selectedGroup} /> : null}

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
