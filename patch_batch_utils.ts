import fs from 'fs';

let content = fs.readFileSync('src/utils/batchUtils.ts', 'utf8');

content = content.replace(
  'export function processDynamicBatches(batches: Batch[]): Batch[] {\n    // First, figure out if there\'s any manually overridden active batch',
  `export function processDynamicBatches(batches: Batch[]): Batch[] {
  // ARCHITECTURAL COMPLIANCE:
  // Apply explicit deterministic ordering before lifecycle evaluation
  // Prefer displayOrder if present, fallback to batchNumber
  const sortedBatches = [...batches].sort((a, b) => {
    const orderA = a.displayOrder !== undefined ? a.displayOrder : a.batchNumber;
    const orderB = b.displayOrder !== undefined ? b.displayOrder : b.batchNumber;
    return orderA - orderB;
  });

  // First, figure out if there's any manually overridden active batch
  const manualActiveBatch = sortedBatches.find(b => b.isAutoScheduled === false && b.isActive);`
);

content = content.replace(
  /return batches\.map\(batch => \{/g,
  'return sortedBatches.map(batch => {'
);

fs.writeFileSync('src/utils/batchUtils.ts', content);
