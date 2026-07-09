const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const heroCtaMarker = `            <div className="flex flex-wrap gap-4 pt-4">
              {activeCommunityBatch ? (
                <button
                  id="btn-hero-join-cohort"
                  onClick={onStartDesigning}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Join {activeCommunityBatch.batchName} <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  id="btn-hero-create-batch"
                  onClick={() => onNavigateToTab("custom-order")}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Create Your Own Batch <ArrowRight size={14} />
                </button>
              )}`;

const newHeroCta = `            <div className="flex flex-wrap gap-4 pt-4">
              {activeCommunityBatch && canJoinActiveBatch ? (
                <button
                  id="btn-hero-join-cohort"
                  onClick={onStartDesigning}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Join {activeCommunityBatch.batchName} <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  id="btn-hero-create-batch"
                  onClick={() => onNavigateToTab("custom-order")}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Create Your Own Batch <ArrowRight size={14} />
                </button>
              )}`;

content = content.replace(heroCtaMarker, newHeroCta);
fs.writeFileSync('src/components/HomeView.tsx', content);
