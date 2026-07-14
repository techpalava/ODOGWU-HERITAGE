const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

code = code.replace(
    /onNavigateToTab: _onNavigateToTab,/,
    'onNavigateToTab,'
);

const regex = /\{\/\* Stepper Footer Controls \*\/\}[\s\S]*?<\/div>\s*<\/div>/;

const match = code.match(regex);
if (match) {
    const replacement = match[0] + `
          {journey.requiresAttention && (
            <div className="mt-6 bg-heritage-green/5 border border-heritage-green/10 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-4">
              <div className="flex items-center gap-3">
                <div className="text-heritage-gold mt-1 sm:mt-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-heritage-green mb-0.5">{journey.notification}</h4>
                  <p className="text-xs text-heritage-ink/70">{journey.recommendedNextStep}</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => onNavigateToTab && onNavigateToTab(journey.destination)}
                className="bg-heritage-gold text-heritage-forest hover:bg-heritage-gold/90 transition px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 min-h-[36px] whitespace-nowrap w-full sm:w-auto justify-center"
              >
                {journey.primaryAction} <ArrowRight size={14} />
              </button>
            </div>
          )}`;
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/components/DesignStudioView.tsx', code);
    console.log('Patched DesignStudioView');
} else {
    console.log('Not found');
}
