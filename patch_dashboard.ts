import fs from 'fs';

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// Add import if missing
if (!content.includes('BatchProgressEngine')) {
  content = content.replace('import { BatchBusinessRules } from "../engine/BatchBusinessRules";', 'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";');
}

// Ensure summary variable exists and replace math
content = content.replace(
  /const hasActiveBatch = batches\.find\(\s*\(b\)\s*=>\s*b\.id === order\.batchId,\s*\);/g,
  `const hasActiveBatch = batches.find((b) => b.id === order.batchId);
                  const progressSummary = hasActiveBatch ? BatchProgressEngine.getSummary(hasActiveBatch) : null;`
);

// We need to be careful with userBatch inside the map. The map logic:
content = content.replace(
  /const userBatch = batches\.find\(\(b\) => b\.id === order\.batchId\);/g,
  `const userBatch = batches.find((b) => b.id === order.batchId);\n                          const userBatchSummary = userBatch ? BatchProgressEngine.getSummary(userBatch) : null;`
);

content = content.replace(
  /Batch Progress \(\{userBatch\.currentGarments\} \/\{" "\}\s*\{userBatch\.targetGarments\} Garments\)/g,
  `Batch Progress ({userBatchSummary?.progressBadge} Garments)`
);

content = content.replace(
  /width: \`\$\{Math\.min\(100, \(userBatch\.currentGarments \/ userBatch\.targetGarments\) \* 100\)\\}%\`/g,
  `width: \`\${userBatchSummary?.completionPercentage || 0}%\``
);

content = content.replace(
  /\{Math\.round\(\s*\(userBatch\.currentGarments \/ userBatch\.targetGarments\) \*\s*100,\s*\)\}\s*% Complete/g,
  `{userBatchSummary?.completionPercentage || 0}% Complete`
);

content = content.replace(
  /\{Math\.max\(\s*0,\s*userBatch\.targetGarments - userBatch\.currentGarments,\s*\)\}\s*Garments Remaining/g,
  `{userBatchSummary?.remainingGarments || 0} Garments Remaining`
);

fs.writeFileSync('src/components/DashboardView.tsx', content);
