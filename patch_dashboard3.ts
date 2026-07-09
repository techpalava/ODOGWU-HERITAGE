import fs from 'fs';

let dash = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

dash = dash.replace(
  /Target: \{userBatch\.targetGarments\} Garments/,
  'Target: {CapacityService.getTargetCapacity(userBatch)} Garments'
);

dash = dash.replace(
  /Batch Progress \(\{userBatch\.currentGarments\} \/\{" "\}\s*\{userBatch\.targetGarments\} Garments\)/,
  'Batch Progress ({CapacityService.getCapacitySummary(userBatch).progressBadge} Garments)'
);

dash = dash.replace(
  /width: \`\$\{Math\.min\(100, \(userBatch\.currentGarments \/ userBatch\.targetGarments\) \* 100\)\\}%`/,
  'width: `${CapacityService.getCapacitySummary(userBatch).completionPercentage}%`'
);

dash = dash.replace(
  /\{Math\.round\(\s*\(userBatch\.currentGarments \/ userBatch\.targetGarments\) \*\s*100,\s*\)\}\s*% Complete/,
  '{CapacityService.getCapacitySummary(userBatch).completionPercentage}% Complete'
);

dash = dash.replace(
  /\{Math\.max\(\s*0,\s*userBatch\.targetGarments - userBatch\.currentGarments,\s*\)\}\{" "\}\s*Garments Remaining/,
  '{CapacityService.getRemainingCapacity(userBatch)} Garments Remaining'
);

fs.writeFileSync('src/components/DashboardView.tsx', dash);
