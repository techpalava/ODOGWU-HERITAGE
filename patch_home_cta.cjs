const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const oldCTA = `<div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={onStartDesigning}
              className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              Start Designing <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigateToTab("gallery")}
              className="w-full sm:w-auto border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer"
            >
              Browse Gallery
            </button>
          </div>`;

const newCTA = `<div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={() => onNavigateToTab(journey.destination as any)}
              className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {journey.primaryAction} <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigateToTab(journey.destination === "gallery" ? "design" : "gallery")}
              className="w-full sm:w-auto border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer"
            >
              {journey.secondaryAction}
            </button>
          </div>`;

content = content.replace(oldCTA, newCTA);
fs.writeFileSync('src/components/HomeView.tsx', content);
