import fs from 'fs';

let content = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');

// Find the misplaced `}` and remove it, putting it at the very end
content = content.replace(
  /\s+isRegistrationOpen: eligibility\.canAcceptOrders,\n    \};\n  \}\n\}\n\n  static canEditBatch/g,
  `\n      isRegistrationOpen: eligibility.canAcceptOrders,\n    };\n  }\n\n  static canEditBatch`
);

content += '\n}\n';

fs.writeFileSync('src/engine/BatchBusinessRules.ts', content);
