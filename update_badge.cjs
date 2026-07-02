const fs = require('fs');
const file = 'src/components/GalleryView.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '<div className="text-[10px] text-heritage-ink/60 mt-0.5">Status: Open for Orders</div>',
  '<span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-heritage-gold/20 text-heritage-gold mt-1 inline-block border border-heritage-gold/30">Open for Orders</span>'
);

fs.writeFileSync(file, content);
