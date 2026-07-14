const fs = require('fs');
let code = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const regex = /\{journey\.currentOrder && \([\s\S]*?<\/div>\s*<\/div>/;

const replacement = `{journey.currentOrder && (
              <>
                <p className="text-sm opacity-80 mb-4">{journey.notification}</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => onNavigateToTab(journey.destination)}
                    className="bg-heritage-gold text-heritage-forest px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer">
                    {journey.primaryAction}
                  </button>
                  <button 
                    onClick={() => onNavigateToTab(journey.destination)}
                    className="bg-transparent border border-white/30 hover:bg-white/10 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer">
                    {journey.secondaryAction}
                  </button>
                </div>
              </>
            )}
          </div>`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/DashboardView.tsx', code);
console.log('Fixed');
