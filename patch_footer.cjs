const fs = require('fs');
let content = fs.readFileSync('src/components/Footer.tsx', 'utf8');

// Imports
const importToAdd = `import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { getCurrentCommunityBatch } from "../utils/batchUtils";\nimport { CapacityService } from "../services/CapacityService";\n`;
if (!content.includes('BatchBusinessRules')) {
  content = content.replace('import { useAppStore } from "../store/useAppStore";', 'import { useAppStore } from "../store/useAppStore";\n' + importToAdd);
}

// Add state destructs
if (!content.includes('const { activeTab, setActiveTab, businessSettings, batches }')) {
  content = content.replace('const { activeTab, setActiveTab, businessSettings } = useAppStore();', 'const { activeTab, setActiveTab, businessSettings, batches } = useAppStore();');
}

fs.writeFileSync('src/components/Footer.tsx', content);
