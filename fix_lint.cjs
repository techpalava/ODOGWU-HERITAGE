const fs = require('fs');
let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

// fix showpieces.images
content = content.replace(
  'showpieces.forEach(s => s.images?.forEach(checkUrl));',
  'showpieces.forEach(s => checkUrl(s.image));'
);

// fix Batch statuses
content = content.replace(
  'batches.filter(b => b.status === "Sourcing" || b.status === "Production").length',
  'batches.filter(b => ["Open", "Recruiting", "Almost Full", "Full", "Production Ready", "Production Started"].includes(b.status)).length'
);

content = content.replace(
  'batches.filter(b => b.status === "Quality Control" || b.status === "Shipment").length',
  'batches.filter(b => ["Quality Control", "Packed", "Shipped", "Arrived Netherlands"].includes(b.status)).length'
);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
console.log('Fixed linting errors in DatabaseView.tsx');
