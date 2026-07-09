const fs = require('fs');
let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

const regex1 = /<button\s*onClick=\{\(\) => \{\s*if \(currentUser\) \{\s*onStartDesigning\(\);\s*\} else \{\s*onNavigateToTab\("login"\);\s*\}\s*\}\}\s*className="inline-flex bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest px-8 py-3\.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2"\s*>\s*Start Designing Your Outfit <ArrowRight size=\{14\} \/>\s*<\/button>/;

const replacement1 = `<button
            onClick={() => onNavigateToTab(journey.destination as any)}
            className="inline-flex bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"
          >
            {journey.primaryAction} <ArrowRight size={14} />
          </button>`;

content = content.replace(regex1, replacement1);

const regex2 = /<button\s*onClick=\{\(\) => \{\s*if \(currentUser\) \{\s*onStartDesigning\(\);\s*\} else \{\s*onNavigateToTab\("login"\);\s*\}\s*\}\}\s*className="inline-flex bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white px-8 py-3\.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"\s*>\s*Design Your Outfit <ArrowRight size=\{14\} \/>\s*<\/button>/;

const replacement2 = `<button
            onClick={() => onNavigateToTab(journey.destination as any)}
            className="inline-flex bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"
          >
            {journey.primaryAction} <ArrowRight size={14} />
          </button>`;

content = content.replace(regex2, replacement2);

fs.writeFileSync('src/components/HomeView.tsx', content);
