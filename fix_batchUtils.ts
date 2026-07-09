import fs from 'fs';

let content = fs.readFileSync('src/utils/batchUtils.ts', 'utf8');

content = content.replace(
  /export function processDynamicBatches\(batches: Batch\[\]\): Batch\[\] \{/,
  `export function processDynamicBatches(batches: Batch[]): Batch[] {
  // ARCHITECTURAL COMPLIANCE:
  // Apply explicit deterministic ordering before lifecycle evaluation
  // Prefer displayOrder if present, fallback to batchNumber
  const sortedBatches = [...batches].sort((a, b) => {
    const orderA = a.displayOrder !== undefined ? a.displayOrder : a.batchNumber;
    const orderB = b.displayOrder !== undefined ? b.displayOrder : b.batchNumber;
    return orderA - orderB;
  });
`
);

content = content.replace(
  /const manualActiveBatch = batches\.find\(/,
  'const manualActiveBatch = sortedBatches.find('
);

fs.writeFileSync('src/utils/batchUtils.ts', content);
