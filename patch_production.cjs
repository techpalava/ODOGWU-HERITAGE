const fs = require('fs');
let content = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');

const target = `    } else if (stage === "In Production") {
      presentation.title = "SOURCING PHASE";
      presentation.headline = "Batch is in Production";`;

const replacement = `    } else if (stage === "In Production") {
      presentation.title = "SOURCING PHASE";
      presentation.headline = (batch as any)?.batchName ? \`\${(batch as any).batchName} Orders in Production\` : "Orders in Production";`;

content = content.replace(target, replacement);

fs.writeFileSync('src/engine/BatchBusinessRules.ts', content);
