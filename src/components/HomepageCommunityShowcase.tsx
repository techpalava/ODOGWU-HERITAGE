/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  COMMUNITY_CONTINENT_PEOPLE_LINE,
  COMMUNITY_GROUPS,
  COMMUNITY_GROWING_CAPTION,
  COMMUNITY_HEADLINE_STATS,
  COMMUNITY_NATIONALITIES_BY_PEOPLE,
} from "../data/communityStats";

const COMMUNITY_SHOWCASE_HEADLINE =
  "Join Our Growing Community Celebrating Nigerian Culture";

const STAT_TILES = [
  {
    label: "Participants",
    value: COMMUNITY_HEADLINE_STATS.participants,
  },
  {
    label: "Traditional Outfits",
    value: COMMUNITY_HEADLINE_STATS.outfits,
  },
  {
    label: "Nationalities",
    value: COMMUNITY_HEADLINE_STATS.nationalities,
  },
  {
    label: "Continents",
    value: COMMUNITY_HEADLINE_STATS.continents,
  },
  {
    label: "Groups",
    value: COMMUNITY_HEADLINE_STATS.groups,
  },
] as const;

const STAT_TILE_CLASS =
  "min-w-0 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-heritage-gold/50 transition-colors shadow-sm flex flex-col justify-center items-center group";

interface HomepageCommunityShowcaseProps {
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onClick?: () => void;
  primaryActionDisabled?: boolean;
  onViewGallery: () => void;
}

export default function HomepageCommunityShowcase({
  primaryActionLabel,
  onPrimaryAction,
  onClick = onPrimaryAction,
  primaryActionDisabled = false,
  onViewGallery,
}: HomepageCommunityShowcaseProps) {
  return (
    <section
      id="homepage-community-showcase"
      className="bg-heritage-green text-white rounded-3xl p-8 sm:p-12 text-center max-w-5xl mx-auto shadow-2xl border border-heritage-gold/20 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80')] opacity-5 mix-blend-overlay"></div>
      <div className="relative z-10 space-y-10">
        <div className="space-y-4 max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-heritage-gold tracking-tight">
            {COMMUNITY_SHOWCASE_HEADLINE}
          </h2>
          <p className="text-base sm:text-lg text-white/80 font-sans leading-relaxed max-w-2xl mx-auto">
            Become part of a growing multicultural community in the Netherlands
            discovering the beauty of authentic Nigerian traditional clothing.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid min-w-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {STAT_TILES.map((tile, index) => (
              <div
                key={tile.label}
                role="group"
                aria-label={`${tile.value} ${tile.label}`}
                data-stat-value={tile.value}
                className={`${STAT_TILE_CLASS}${index === STAT_TILES.length - 1 ? " col-span-2 sm:col-span-1" : ""}`}
              >
                <span
                  className="text-4xl sm:text-5xl font-serif font-bold text-heritage-gold mb-2 block group-hover:scale-110 transition-transform duration-300"
                  aria-hidden="true"
                >
                  <CountUpNumber value={tile.value} />
                </span>
                <span className="text-xs uppercase tracking-widest text-white/70 font-semibold font-sans">
                  {tile.label}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/60 font-sans tracking-wide">
            {COMMUNITY_GROWING_CAPTION}
          </p>
        </div>

        <div className="space-y-5 min-w-0">
          <div className="grid min-w-0 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {COMMUNITY_GROUPS.map((group) => (
              <div
                key={group.number}
                data-community-group={group.name}
                className="min-w-0 rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-left"
              >
                <p className="text-xs font-semibold text-heritage-gold font-sans break-words">
                  Group {group.number} · {group.name}
                </p>
                <p className="text-xs text-white/70 font-sans mt-1 break-words">
                  {group.people} people · {group.outfits} outfits
                </p>
              </div>
            ))}
          </div>

          <p className="text-xs sm:text-sm text-white/75 font-sans leading-relaxed break-words">
            {COMMUNITY_CONTINENT_PEOPLE_LINE}
          </p>

          <div className="flex flex-wrap justify-center gap-2 min-w-0">
            {COMMUNITY_NATIONALITIES_BY_PEOPLE.map((nationality) => (
              <span
                key={nationality.country}
                data-community-nationality={nationality.country}
                className="max-w-full rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-white/80 font-sans break-words"
              >
                {nationality.country}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
          <button
            onClick={onClick}
            disabled={primaryActionDisabled}
            className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:cursor-wait disabled:opacity-70"
          >
            {primaryActionLabel} <ArrowRight size={16} />
          </button>

          <button
            onClick={onViewGallery}
            className="w-full sm:w-auto text-white hover:text-heritage-gold transition duration-300 px-6 py-4 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center cursor-pointer"
          >
            View Community Gallery
          </button>
        </div>
      </div>
    </section>
  );
}

function CountUpNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let hasAnimated = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          hasAnimated = true;

          let startTime: number;
          const duration = 2000;

          const animateCount = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);

            const easeOut = 1 - Math.pow(1 - progress, 4);
            setDisplayValue(Math.floor(easeOut * value));

            if (progress < 1) {
              requestAnimationFrame(animateCount);
            }
          };

          requestAnimationFrame(animateCount);
        }
      },
      { threshold: 0.1 },
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [value]);

  return <span ref={elementRef}>{displayValue}</span>;
}
