#!/bin/bash
sed -i 's/export interface NextBatchPresentation {/export interface NextBatchPresentation {\n  id: string;\n  status: string;\n  batchNumber?: number;/g' src/engine/RoutingPresentationEngine.ts
sed -i 's/name: b.name,/id: b.id,\n        status: b.status,\n        batchNumber: b.batchNumber,\n        name: b.name,/g' src/engine/RoutingPresentationEngine.ts
