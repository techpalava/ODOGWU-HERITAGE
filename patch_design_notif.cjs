const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const marker = '{/* 9-step progress visualizer */}';
const newNotif = `      {/* Journey Engine Context Notification */}
      {journey.notification && (
        <div className="bg-heritage-cream/20 border border-heritage-gold/30 rounded-2xl p-4 text-xs font-sans text-heritage-green flex items-start gap-3 mb-6 shadow-sm">
          <Info size={16} className="text-heritage-gold mt-0.5 shrink-0" />
          <div>
            <span className="font-bold uppercase tracking-wider block mb-0.5">Journey Context</span>
            {journey.notification}
          </div>
        </div>
      )}

      {/* 9-step progress visualizer */}`;

content = content.replace(marker, newNotif);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
