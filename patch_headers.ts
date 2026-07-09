import fs from 'fs';

// DashboardView
let dash = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
dash = dash.replace(/import \{ BatchProgressEngine \} from "\.\.\/engine\/BatchProgressEngine";\nimport \{ BatchProgressEngine \} from "\.\.\/engine\/BatchProgressEngine";/, 'import { BatchProgressEngine } from "../engine/BatchProgressEngine";');
fs.writeFileSync('src/components/DashboardView.tsx', dash);

// DatabaseView
let db = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');
if (!db.includes('import { BatchProgressEngine } from "../engine/BatchProgressEngine";')) {
  db = db.replace(
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { BatchProgressEngine } from "../engine/BatchProgressEngine";'
  );
  fs.writeFileSync('src/components/DatabaseView.tsx', db);
}

