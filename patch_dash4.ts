import fs from 'fs';

let dash = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

dash = dash.replace(
  /width: `\$\{Math\.min\(100, \(userBatch\.currentGarments \/ userBatch\.targetGarments\) \* 100\)\}%`,/g,
  'width: `${CapacityService.getCapacitySummary(userBatch).completionPercentage}%`,'
);

fs.writeFileSync('src/components/DashboardView.tsx', dash);
