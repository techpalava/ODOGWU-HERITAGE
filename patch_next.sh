#!/bin/bash
sed -i '/currentBatchSummary: BatchSummaryPresentation | null;/a \  nextCommunityBatches: NextBatchPresentation[];' src/engine/RoutingPresentationEngine.ts

sed -i '/submissionMessage: routingReason/a \      , nextCommunityBatches: decision.nextCommunityBatches.map(b => ({\n        name: b.name,\n        registrationOpens: b.startDate || (b as any).registrationOpens || "TBD",\n        expectedDelivery: b.estimatedDelivery || "TBD",\n        targetGarments: b.targetGarments,\n        currentGarments: b.currentGarments,\n        startDate: b.startDate\n      }))' src/engine/RoutingPresentationEngine.ts

sed -i 's/routingDecision\.nextCommunityBatches/routingPresentation\.nextCommunityBatches/g' src/components/DesignStudioView.tsx
