const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

const regex = /\{activeTab === "styles" && \(\n\s*<div className="space-y-6 text-left">\n\s*<div className="flex flex-col sm:flex-row gap-4 items-center justify-between">/;

const replacement = `{activeTab === "styles" && (
              <div className="space-y-6 text-left">
                <div className="flex bg-heritage-cream rounded-t-2xl border-b border-heritage-gold/20 overflow-x-auto">
                  <div
                    onClick={() => { setStyleSubTab("styles"); setEditingType(null); }}
                    className={\`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl select-none cursor-pointer flex items-center gap-1.5 \${
                      styleSubTab === "styles"
                        ? "bg-white text-heritage-green border-t border-l border-r border-heritage-gold/20 -mb-[1px]"
                        : "text-heritage-ink/40 hover:text-heritage-green hover:bg-white/50"
                    }\`}
                  >
                    Style Configuration
                  </div>
                  <div
                    onClick={() => { setStyleSubTab("catalogue"); setEditingType(null); }}
                    className={\`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all rounded-t-xl select-none cursor-pointer flex items-center gap-1.5 \${
                      styleSubTab === "catalogue"
                        ? "bg-white text-heritage-green border-t border-l border-r border-heritage-gold/20 -mb-[1px]"
                        : "text-heritage-ink/40 hover:text-heritage-green hover:bg-white/50"
                    }\`}
                  >
                    Custom Detail Catalogue
                  </div>
                </div>

                {styleSubTab === "styles" && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/DatabaseView.tsx', content);
