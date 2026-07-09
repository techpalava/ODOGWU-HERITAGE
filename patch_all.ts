import fs from 'fs';

// DashboardView
let dash = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');
dash = dash.replace(
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { CapacityService } from "../services/CapacityService";'
);
dash = dash.replace(/Batch Progress \(\{userBatch\.currentGarments\} \/\{" "\}\n\s*\{userBatch\.targetGarments\} Garments\)/, 'Batch Progress ({CapacityService.getCapacitySummary(userBatch).progressBadge} Garments)');
dash = dash.replace(/width: \`\$\{Math\.min\(100, \(userBatch\.currentGarments \/ userBatch\.targetGarments\) \* 100\)\\}%`/, 'width: `${CapacityService.getCapacitySummary(userBatch).completionPercentage}%`');
dash = dash.replace(/\{Math\.round\(\n\s*\(userBatch\.currentGarments \/ userBatch\.targetGarments\) \*\n\s*100,\n\s*\)\}\n\s*% Complete/, '{CapacityService.getCapacitySummary(userBatch).completionPercentage}% Complete');
dash = dash.replace(/\{Math\.max\(\n\s*0,\n\s*userBatch\.targetGarments - userBatch\.currentGarments,\n\s*\)\}\{" "\}\n\s*Garments Remaining/, '{CapacityService.getRemainingCapacity(userBatch)} Garments Remaining');
fs.writeFileSync('src/components/DashboardView.tsx', dash);

// CustomOrderView
let cov = fs.readFileSync('src/components/CustomOrderView.tsx', 'utf8');
cov = cov.replace(
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { CapacityService } from "../services/CapacityService";'
);
cov = cov.replace(/\{batch\.currentGarments\} \/ \{batch\.targetGarments\}\{" "\}/g, '{CapacityService.getCapacitySummary(batch).progressBadge}{" "}');
cov = cov.replace(/currentMembers: batch\.currentGarments,/g, 'currentMembers: CapacityService.getReservedCapacity(batch),');
cov = cov.replace(/expectedParticipants: batch\.targetGarments,/g, 'expectedParticipants: CapacityService.getTargetCapacity(batch),');
fs.writeFileSync('src/components/CustomOrderView.tsx', cov);

// DesignStudioView
let dsv = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');
dsv = dsv.replace(
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
  'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { CapacityService } from "../services/CapacityService";'
);
dsv = dsv.replace(/currentMembers: computedActiveBatch\.currentGarments,/g, 'currentMembers: CapacityService.getReservedCapacity(computedActiveBatch),');
dsv = dsv.replace(/expectedParticipants: computedActiveBatch\.targetGarments,/g, 'expectedParticipants: CapacityService.getTargetCapacity(computedActiveBatch),');
fs.writeFileSync('src/components/DesignStudioView.tsx', dsv);

// HomeView
let home = fs.readFileSync('src/components/HomeView.tsx', 'utf8');
if (!home.includes('CapacityService')) {
  home = home.replace(
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";',
    'import { BatchBusinessRules } from "../engine/BatchBusinessRules";\nimport { CapacityService } from "../services/CapacityService";'
  );
}
home = home.replace(/\(acc, b\) => acc \+ \(b\.currentGarments \|\| 0\)/g, '(acc, b) => acc + CapacityService.getReservedCapacity(b)');
fs.writeFileSync('src/components/HomeView.tsx', home);

// App.tsx
let app = fs.readFileSync('src/App.tsx', 'utf8');
if (!app.includes('CapacityService')) {
  app = app.replace(
    'import { processDynamicBatches } from "./utils/batchUtils";',
    'import { processDynamicBatches } from "./utils/batchUtils";\nimport { CapacityService } from "./services/CapacityService";'
  );
}
app = app.replace(/currentMembers: openBatch\.currentGarments,/g, 'currentMembers: CapacityService.getReservedCapacity(openBatch),');
app = app.replace(/expectedParticipants: openBatch\.targetGarments,/g, 'expectedParticipants: CapacityService.getTargetCapacity(openBatch),');
fs.writeFileSync('src/App.tsx', app);

