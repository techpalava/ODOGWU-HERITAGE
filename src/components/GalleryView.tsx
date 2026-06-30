/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Eye, Shirt, Sparkles, Camera } from "lucide-react";
import { Showpiece, CommunityPhoto, Fabric, StyleCategory } from "../types";

interface GalleryViewProps {
  onSelectStyle: (styleId: string, fabricCode: string) => void;
  showpieces?: Showpiece[];
  communityPhotos?: CommunityPhoto[];
  fabrics: Fabric[];
  styles: StyleCategory[];
}

export default function GalleryView({
  onSelectStyle,
  showpieces = [],
  communityPhotos = [],
  fabrics = [],
  styles: _styles = [],
}: GalleryViewProps) {
  const [filter, setFilter] = useState<
    "all" | "male" | "female" | "fabric" | "community"
  >("all");

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
          Lookbook & Fabric Showcase
        </span>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-heritage-green sm:text-4xl font-display">
          The Heritage Showcase
        </h1>
        <p className="mt-2 text-sm text-heritage-ink/70 max-w-3xl font-sans">
          Browse our curated traditional combinations, worn by team members
          across ASML. Select any style to load its configuration instantly
          inside our Design Studio.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-heritage-beige pb-2 gap-4 overflow-x-auto text-xs font-bold font-sans">
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
        <button
          onClick={() => setFilter("male")}
          className={`pb-2 px-3 transition whitespace-nowrap ${
            filter === "male"
              ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
              : "text-heritage-ink/55 hover:text-heritage-gold"
          }`}
        >
          Men's Attire
        </button>
        <button
          onClick={() => setFilter("female")}
          className={`pb-2 px-3 transition whitespace-nowrap ${
            filter === "female"
              ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
              : "text-heritage-ink/55 hover:text-heritage-gold"
          }`}
        >
          Women's Couture
        </button>
        <button
          onClick={() => setFilter("fabric")}
          className={`pb-2 px-3 transition whitespace-nowrap ${
            filter === "fabric"
              ? "border-b-2 border-heritage-green text-heritage-green font-extrabold"
              : "text-heritage-ink/55 hover:text-heritage-gold"
          }`}
        >
          Raw Fabric Bolts
        </button>
      </div>

      {/* Gallery Showcase Grid */}
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
            // Group by cohortName
            Array.from(
              new Set(activeCommunityPhotos.map((p) => p.cohortName)),
            ).map((cohort) => {
              const cohortPhotos = activeCommunityPhotos.filter(
                (p) => p.cohortName === cohort,
              );
              return (
                <div key={cohort || "Uncategorized"} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h2 className="font-serif text-2xl font-bold text-heritage-green">
                      {cohort || "Uncategorized"}
                    </h2>
                    <div className="h-px flex-grow bg-heritage-gold/20"></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {cohortPhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col"
                      >
                        <div className="relative h-96 w-full overflow-hidden bg-heritage-cream">
                          <img
                            src={photo.url}
                            alt={photo.caption || "Community Photo"}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                          {photo.featured && (
                            <div className="absolute top-4 right-4 bg-heritage-gold text-white text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded shadow-sm">
                              Featured
                            </div>
                          )}
                        </div>
                        <div className="p-5 space-y-2 flex-grow flex flex-col justify-between font-sans text-xs">
                          <p className="text-heritage-ink/80 leading-relaxed italic">
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
              );
            })
          )}
        </div>
      ) : filter !== "fabric" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group bg-white rounded-3xl border border-heritage-gold/15 overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
            >
              {/* Card visual representation banner */}
              <div
                className="relative h-64 flex flex-col justify-between p-6 overflow-hidden select-none"
                style={{
                  background: `linear-gradient(135deg, ${item.colorHex}dd, ${item.colorHex}ff)`,
                }}
              >
                {/* Traditional geometric overlay pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(#C5A85C_1px,transparent_1px)] [background-size:16px_16px] opacity-15"></div>

                <div className="flex justify-between items-start z-10">
                  <span className="bg-white/10 backdrop-blur-md text-heritage-gold border border-heritage-gold/30 px-3 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider">
                    {item.tag}
                  </span>
                  <div className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20">
                    <Shirt size={16} />
                  </div>
                </div>

                <div className="z-10 space-y-1">
                  <span className="text-[10px] text-heritage-beige font-mono uppercase block">
                    {item.fabricCode} — {item.fabricName}
                  </span>
                  <h3 className="text-xl font-serif text-white leading-tight font-medium">
                    {item.title}
                  </h3>
                </div>
              </div>

              {/* Card Content & Action Button */}
              <div className="p-6 space-y-4 flex-grow flex flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                    {item.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono font-semibold text-heritage-green">
                    <span className="bg-heritage-cream border px-2 py-0.5 rounded-md">
                      Style: {item.styleName}
                    </span>
                    <span className="bg-heritage-cream border px-2 py-0.5 rounded-md">
                      Color: {item.colorHex}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectStyle(item.styleId, item.fabricCode)}
                  className="w-full bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 min-h-[44px] py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  Configure This Combo <Sparkles size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Fabric Bolts Specific Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">
          {fabrics.map((fabric) => (
            <div
              key={fabric.code}
              className="bg-white rounded-3xl border border-heritage-gold/15 p-6 shadow-sm flex flex-col sm:flex-row gap-6 hover:shadow-md transition"
            >
              {/* Color swatch representation (Replaced with Fabric Image) */}
              <div className="w-full sm:w-32 h-32 rounded-2xl relative overflow-hidden flex items-center justify-center shrink-0 bg-gray-150">
                {fabric.image ? (
                  <img
                    src={fabric.image}
                    referrerPolicy="no-referrer"
                    alt={fabric.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, ${fabric.colorHex}dd, ${fabric.colorHex}ff)`,
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-black/10"></div>
                <div className="absolute inset-0 bg-[radial-gradient(#C5A85C_1.5px,transparent_1.5px)] [background-size:12px_12px] opacity-20"></div>
                <span className="text-[10px] font-bold bg-white/95 px-2 py-1 rounded text-heritage-green border shadow-sm font-mono z-10">
                  {fabric.code}
                </span>
              </div>

              {/* Fabric Description details */}
              <div className="space-y-3 flex-grow flex flex-col justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-serif text-sm font-bold text-heritage-green">
                      {fabric.name}
                    </h3>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        fabric.stockStatus === "In Stock"
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : fabric.stockStatus === "Low Stock"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-red-50 text-red-800 border-red-200"
                      }`}
                    >
                      {fabric.stockStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-heritage-ink/70 leading-relaxed">
                    {fabric.description}
                  </p>
                  <p className="text-[10px] font-mono text-heritage-green pt-1">
                    Base Swatch Color:{" "}
                    <strong className="font-semibold">
                      {fabric.color}
                    </strong>
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                  <span className="font-bold text-heritage-green">
                    Width:{" "}
                    <span className="font-mono text-heritage-gold">
                      {fabric.width || "45 inches"}
                    </span>
                  </span>
                  {fabric.stockStatus === "Out of Stock" ? (
                    <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded">
                      Unavailable
                    </span>
                  ) : (
                    <button
                      onClick={() =>
                        onSelectStyle("royal-senator", fabric.code)
                      }
                      className="text-xs font-bold text-heritage-gold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Select Fabric <Eye size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
