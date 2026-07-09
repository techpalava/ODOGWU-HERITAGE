const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const oldButtons = `<div className="flex flex-wrap gap-4 pt-4">
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
              )}
              <button
                id="btn-hero-custom-order"
                onClick={() => onNavigateToTab("custom-order")}
                className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                Custom Order <ArrowRight size={14} />
              </button>
              <button
                id="btn-hero-how-it-works"
                onClick={() => onNavigateToTab("gallery")}
                className="border border-heritage-beige/55 text-white hover:bg-white/10 transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer w-full sm:w-auto"
              >
                Style Gallery
              </button>
            </div>`;

const newButtons = `<div className="flex flex-wrap gap-4 pt-4">
              <button
                id="btn-hero-journey-primary"
                onClick={() => onNavigateToTab(journey.destination as any)}
                className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                {journey.primaryAction} <ArrowRight size={14} />
              </button>
              <button
                id="btn-hero-journey-secondary"
                onClick={() => onNavigateToTab(journey.destination === "gallery" ? "design" : "gallery")}
                className="border border-heritage-beige/55 text-white hover:bg-white/10 transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer w-full sm:w-auto"
              >
                {journey.secondaryAction}
              </button>
            </div>`;

content = content.replace(oldButtons, newButtons);
fs.writeFileSync('src/components/HomeView.tsx', content);
