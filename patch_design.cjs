const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const regex = /\{\/\* Journey Engine Context Notification \*\/\}[\s\S]*?\{journey\.notification && \([\s\S]*?<div className="bg-heritage-cream\/20 border border-heritage-gold\/30 rounded-2xl p-4 text-xs font-sans text-heritage-green flex items-start gap-3 mb-6 shadow-sm">[\s\S]*?<Info size=\{16\} className="text-heritage-gold mt-0\.5 shrink-0" \/>[\s\S]*?<div>[\s\S]*?<span className="font-bold uppercase tracking-wider block mb-0\.5">Journey Context<\/span>[\s\S]*?\{journey\.notification\}[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\)\}/;

const replacement = `      {/* Journey Engine Context Notification */}
      {journey.notification && (
        <div className="bg-heritage-cream/20 border border-heritage-gold/30 rounded-2xl p-4 text-xs font-sans text-heritage-green flex items-start gap-3 mb-6 shadow-sm">
          <Info size={16} className="text-heritage-gold mt-0.5 shrink-0" />
          <div className="flex-1 space-y-3">
            <div>
              <span className="font-bold uppercase tracking-wider block mb-0.5">Journey Context</span>
              <p>{journey.notification}</p>
            </div>
            {journey.recommendedNextStep && (
              <div className="bg-white/50 p-2.5 rounded-lg border border-heritage-gold/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-[10px] text-heritage-gold uppercase tracking-wider block mb-0.5">Recommended Next Step</span>
                  <span className="font-medium">{journey.recommendedNextStep}</span>
                </div>
                {journey.destination !== "design" && (
                  <button 
                    onClick={() => onNavigateToTab(journey.destination as any)}
                    className="shrink-0 bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1.5"
                  >
                    {journey.primaryAction} <ArrowRight size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
