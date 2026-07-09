import fs from 'fs';

// DatabaseView
let db = fs.readFileSync('src/components/DatabaseView.tsx', 'utf8');
db = db.replace(
  /\{b\.currentGarments\} \/ \{b\.targetGarments\}/g,
  `{BatchProgressEngine.getSummary(b).progressBadge}`
);
db = db.replace(
  /width: \`\$\{Math\.min\(100, \(b\.currentGarments \/ b\.targetGarments\) \* 100\)\}%`,/g,
  `width: \`\${BatchProgressEngine.getSummary(b).completionPercentage}%\`,`
);
fs.writeFileSync('src/components/DatabaseView.tsx', db);

// OrderRoutingPanel
let orp = fs.readFileSync('src/components/OrderRoutingPanel.tsx', 'utf8');
orp = orp.replace(/import React from 'react';\n/, '');
orp = orp.replace(/import \{ Batch \} from '\.\.\/types';\n/, '');
orp = orp.replace(/import \{ RoutingPresentationModel, RoutingActionModel, OrderRoutingEngine \} from "\.\.\/engine\/OrderRoutingEngine";/, 'import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";');
fs.writeFileSync('src/components/OrderRoutingPanel.tsx', orp);

// BatchBusinessRules
let bbr = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');
bbr = bbr.replace(
  /static canAcceptOrders\(data: Batch \| OrderContext \| null \| undefined\): BatchEligibility \{/,
  'static canAcceptOrders(data: Batch | Partial<OrderContext> | null | undefined): BatchEligibility {'
);
fs.writeFileSync('src/engine/BatchBusinessRules.ts', bbr);

