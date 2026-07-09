import fs from 'fs';

let content = fs.readFileSync('src/components/CustomOrderView.tsx', 'utf8');

if (!content.includes('BatchProgressEngine')) {
  content = content.replace('import { BatchBusinessRules } from "../engine/BatchBusinessRules";', 'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";');
}

// In the map function
content = content.replace(
  /\{batch\.currentGarments\} \/ \{batch\.targetGarments\}\{" "\}/g,
  `{BatchProgressEngine.getSummary(batch).progressBadge}{" "}`
);

fs.writeFileSync('src/components/CustomOrderView.tsx', content);
