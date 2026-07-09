import fs from 'fs';

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

content = content.replace(
  /width: `\$\{Math\.min\(100, \(userBatch\.currentGarments \/ userBatch\.targetGarments\) \* 100\)\}%`,/g,
  `width: \`\${userBatchSummary?.completionPercentage || 0}%\`,`
);

content = content.replace(
  /\{Math\.max\([\s\S]*?Garments Remaining/g,
  `{userBatchSummary?.remainingGarments || 0} Garments Remaining`
);

// We also need to check if userBatch definition has `userBatchSummary`.
if (!content.includes('const userBatchSummary = userBatch ? BatchProgressEngine.getSummary(userBatch) : null;')) {
  content = content.replace(
    /const userBatch = batches\.find\(\(b\) => b\.id === order\.batchId\);/g,
    `const userBatch = batches.find((b) => b.id === order.batchId);\n                          const userBatchSummary = userBatch ? BatchProgressEngine.getSummary(userBatch) : null;`
  );
}

fs.writeFileSync('src/components/DashboardView.tsx', content);
