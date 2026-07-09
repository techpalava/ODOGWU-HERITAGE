import fs from 'fs';

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

content = content.replace(
  /if \(!userBatch\) return null;/g,
  `if (!userBatch) return null;\n            const userBatchSummary = BatchProgressEngine.getSummary(userBatch);`
);

content = content.replace(
  /import { BatchBusinessRules } from "\.\.\/engine\/BatchBusinessRules";/g,
  `import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";`
);

fs.writeFileSync('src/components/DashboardView.tsx', content);
