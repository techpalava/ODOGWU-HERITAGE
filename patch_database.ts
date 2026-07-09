import fs from 'fs';

let content = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');

if (!content.includes('BatchProgressEngine')) {
  content = content.replace('import { BatchBusinessRules } from "../engine/BatchBusinessRules";', 'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";');
}

content = content.replace(
  /\{b\.currentGarments\} \/ \{b\.targetGarments\}/g,
  `{BatchProgressEngine.getSummary(b).progressBadge}`
);

content = content.replace(
  /width: \`\$\{Math\.min\(100, \(b\.currentGarments \/ b\.targetGarments\) \* 100\)\}%`,/g,
  `width: \`\${BatchProgressEngine.getSummary(b).completionPercentage}%\`,`
);

fs.writeFileSync('src/components/DatabaseView.tsx', content);
