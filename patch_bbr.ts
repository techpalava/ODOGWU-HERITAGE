import fs from 'fs';

let content = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');

content = content.replace(
  'import { Batch, OrderContext } from "../types";',
  'import { Batch, OrderContext } from "../types";\nimport { CapacityService } from "../services/CapacityService";'
);

content = content.replace(
  /    let currentGarments = 0;\n    let targetGarments = 0;\n/g,
  ``
);

// We need to replace the capacity parsing block. Let's see the context.
content = content.replace(
  /    if \("expectedParticipants" in data\) \{[\s\S]*?\} else \{[\s\S]*?\}\n\n    const remainingCapacity = Math\.max\(0, targetGarments - currentGarments\);\n    const completionPercentage =\n      targetGarments > 0\n        \? Math\.min\(100, Math\.round\(\(currentGarments \/ targetGarments\) \* 100\)\)\n        : 0;\n\n    const isStarted = status === "PRODUCTION_STARTED";\n    const isStatusClosed = status === "CLOSED" || status === "COMPLETED";\n    const isManuallyClosed = !allowOrders;\n    const isTimeUp = endDateStr \? now > new Date\(endDateStr\) : false;\n    const isFull = currentGarments >= targetGarments && targetGarments > 0;/g,
  `    let endDateStr = "";
    let startDateStr = "";
    let allowOrders = true;
    let status = "";
    if ("expectedParticipants" in data) {
      const ctx = data as OrderContext;
      endDateStr = ctx.closingDate || "";
      startDateStr = ""; 
      allowOrders = ctx.allowOrders !== false;
      status = ctx.batchStatus || "";
    } else {
      const batch = data as Batch;
      endDateStr = batch.endDate || "";
      startDateStr = batch.startDate || "";
      allowOrders = batch.allowOrders !== false;
      status = batch.status || "";
    }

    const capacitySummary = CapacityService.getCapacitySummary(data);
    const remainingCapacity = capacitySummary.remainingGarments;
    const completionPercentage = capacitySummary.completionPercentage;

    const isStarted = status === "PRODUCTION_STARTED";
    const isStatusClosed = status === "CLOSED" || status === "COMPLETED";
    const isManuallyClosed = !allowOrders;
    const isTimeUp = endDateStr ? now > new Date(endDateStr) : false;
    const isFull = capacitySummary.capacityStatus === "FULL" || capacitySummary.capacityStatus === "OVERCAPACITY";`
);

fs.writeFileSync('src/engine/BatchBusinessRules.ts', content);
