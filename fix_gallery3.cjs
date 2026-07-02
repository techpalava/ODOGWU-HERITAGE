const fs = require('fs');

let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

content = content.replace(/The Avatars represent the current NTCC production batch\./g, '{batches.find(b => b.batchNumber === 3)?.name || "This group"} represents one of the latest NTCC production batches.');

fs.writeFileSync('src/components/GalleryView.tsx', content);
