import fs from 'fs';

let content = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');

// Add import if missing
if (!content.includes('BatchProgressEngine')) {
  content = content.replace('import { Batch, OrderContext } from "../types";', 'import { Batch, OrderContext } from "../types";\nimport { BatchProgressEngine } from "./BatchProgressEngine";');
}

// Replace calculations in canAcceptOrders
content = content.replace(
  /const remainingCapacity = Math\.max\(0, targetGarments - currentGarments\);\s*const completionPercentage = targetGarments > 0\s*\?\s*Math\.min\(100, Math\.round\(\(currentGarments \/ targetGarments\) \* 100\)\)\s*:\s*0;/g,
  `const summary = BatchProgressEngine.getSummary(data);
    const remainingCapacity = summary.remainingGarments;
    const completionPercentage = summary.completionPercentage;`
);

content = content.replace(
  /const isFull = currentGarments >= targetGarments && targetGarments > 0;/g,
  `const isFull = summary.capacityStatus === "FULL" || summary.capacityStatus === "OVERCAPACITY";`
);

// Replace getProgressState
content = content.replace(
  /static getProgressState\(batch: any\): any \{\s*const eligibility = this\.canAcceptOrders\(batch\);\s*return \{\s*completionPercentage: eligibility\.completionPercentage,\s*remainingCapacity: eligibility\.remainingCapacity,\s*daysRemaining: eligibility\.daysRemaining,\s*hoursRemaining: eligibility\.hoursRemaining,\s*minutesRemaining: eligibility\.minutesRemaining,\s*isRegistrationOpen: eligibility\.canAcceptOrders,\s*\};\s*\}/,
  `static getProgressState(batch: any): any {
    const eligibility = this.canAcceptOrders(batch);
    const summary = BatchProgressEngine.getSummary(batch);
    return {
      completionPercentage: summary.completionPercentage,
      remainingCapacity: summary.remainingGarments,
      daysRemaining: eligibility.daysRemaining,
      hoursRemaining: eligibility.hoursRemaining,
      minutesRemaining: eligibility.minutesRemaining,
      isRegistrationOpen: eligibility.canAcceptOrders,
    };
  }`
);

fs.writeFileSync('src/engine/BatchBusinessRules.ts', content);
