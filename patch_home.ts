import fs from 'fs';

let content = fs.readFileSync('src/components/HomeView.tsx', 'utf8');

if (!content.includes('BatchProgressEngine')) {
  content = content.replace('import { BatchBusinessRules } from "../engine/BatchBusinessRules";', 'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";');
}

// Add the summary inside the component scope where it renders hero progress
content = content.replace(
  /const progress = BatchBusinessRules\.getProgressState\(activeCommunityBatch\);/g,
  `const progress = BatchBusinessRules.getProgressState(activeCommunityBatch);\n                const progressSummary = BatchProgressEngine.getSummary(activeCommunityBatch);`
);

content = content.replace(
  /\{activeCommunityBatch\.currentMembers\} \/ \{activeCommunityBatch\.expectedParticipants\} Garments/g,
  `{progressSummary.progressBadge} Garments`
);

content = content.replace(
  /\{progress\.completionPercentage\}% Complete/g,
  `{progressSummary.completionPercentage}% Complete`
);

content = content.replace(
  /\(acc, b\) => acc \+ \(b\.currentGarments \|\| 0\),/g,
  `(acc, b) => acc + BatchProgressEngine.getSummary(b).committedGarments,`
);

fs.writeFileSync('src/components/HomeView.tsx', content);
