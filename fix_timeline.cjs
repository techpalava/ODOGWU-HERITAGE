const fs = require('fs');
let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

const targetRegex = /\{\/\* NTCC Production Timeline Section \*\/\}.*?(?=\{\/\* Filter Tabs \*\/\})/s;

const replacement = `{/* NTCC Production Timeline Section */}
      <div className="bg-heritage-cream/20 rounded-2xl p-4 md:p-5 border border-heritage-gold/15 shadow-sm mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-serif font-bold text-heritage-green tracking-tight uppercase">NTCC Timeline</h2>
            <div className="h-px w-8 bg-heritage-gold/30 hidden md:block"></div>
            <span className="text-[10px] text-heritage-ink/60 hidden sm:inline-block">Select a batch from the timeline or continue to the design studio.</span>
          </div>
          <button 
             onClick={() => onNavigateToTab("design")}
             className="px-4 py-1.5 bg-white border border-heritage-gold/40 text-heritage-gold font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm hover:bg-heritage-gold hover:text-white transition duration-300 self-start md:self-auto flex items-center gap-1.5 shrink-0"
          >
             Continue to Design Studio
          </button>
        </div>
        
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar items-center">
          {batches.sort((a,b) => a.batchNumber - b.batchNumber).map((batch) => {
            let statusColor = "bg-gray-100 text-gray-400 border-gray-100";
            let displayStatus: string = batch.status;

            if (batch.status === "Closed" || batch.status === "Completed") {
              statusColor = "bg-gray-50 text-gray-400 border-gray-100";
              displayStatus = "Closed";
            }
            else if (batch.isActive) {
              statusColor = "bg-heritage-gold/10 text-heritage-gold border-heritage-gold/30";
              displayStatus = "Open for Orders";
            }
            else if (batch.status === "Coming Soon" || batch.status === "Yet To Start") {
              statusColor = "bg-neutral-50 text-neutral-400 border-neutral-100";
              displayStatus = "Coming Soon";
            }
            else { 
               statusColor = "bg-heritage-green/5 text-heritage-green/60 border-heritage-green/20";
            }

            return (
              <div key={batch.id} className={\`snap-start flex-shrink-0 rounded-xl border p-3 flex flex-col justify-center transition-all \${batch.isActive ? 'bg-white w-[220px] shadow-sm ring-1 ring-heritage-gold/50' : 'bg-white/40 w-[150px] opacity-70 hover:opacity-100'}\`}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-[9px] font-bold uppercase text-heritage-ink/50">Batch {batch.batchNumber}</span>
                  {batch.isActive ? (
                    <span className={\`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border \${statusColor}\`}>
                      {displayStatus}
                    </span>
                  ) : (
                    <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-gray-400">
                      {displayStatus}
                    </span>
                  )}
                </div>
                <h3 className={\`font-serif font-bold text-sm leading-tight truncate mb-1 \${batch.isActive ? 'text-heritage-green' : 'text-heritage-ink/60'}\`}>{batch.name}</h3>
                <p className="text-[9px] text-heritage-ink/50 font-medium truncate">
                  {batch.duration || \`\${new Date(batch.startDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} - \${new Date(batch.endDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: '2-digit'})}\`}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      `;

content = content.replace(targetRegex, replacement);
fs.writeFileSync('src/components/GalleryView.tsx', content);
