const fs = require('fs');
let content = fs.readFileSync('src/components/GalleryView.tsx', 'utf8');

content = content.replace(
  'Group {batch.batchNumber}',
  'Group {batch.batchNumber} &ndash; {batch.name}'
);

fs.writeFileSync('src/components/GalleryView.tsx', content);
