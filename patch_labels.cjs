const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `                          {style.fabricCategory && style.fabricCategory !== "Any" && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded border border-heritage-gold/30 text-heritage-gold bg-heritage-gold/5">
                              {style.fabricCategory}
                            </span>
                          )}`;
                          
const replacement = `                          {style.fabricCategory && style.fabricCategory !== "Any" && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded border border-heritage-gold/30 text-heritage-gold bg-heritage-gold/5">
                              {style.fabricCategory}
                            </span>
                          )}
                          {hasMonogram(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Monogram
                            </span>
                          )}
                          {hasEmbroidery(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Embroidery
                            </span>
                          )}
                          {hasMonogramTrimming(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Monogram Trim
                            </span>
                          )}`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
