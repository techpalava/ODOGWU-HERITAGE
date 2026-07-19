const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

// replace all garment_compositions fallback maps
content = content.replace(/\{useReferenceDataFallback\("garment_compositions", \[[^\]]+\]\)\.map/g, '{garmentCompositionOptions.map');

// replace all fabric_categories fallback maps
content = content.replace(/\{useReferenceDataFallback\("fabric_categories", \[[^\]]+\]\)\.map/g, '{fabricCategoryOptions.map');

fs.writeFileSync('src/components/DatabaseView.tsx', content);
