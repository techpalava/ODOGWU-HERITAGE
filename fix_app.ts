import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');

if (!content.includes('import { CapacityService }')) {
  content = content.replace(
    /import \{ processDynamicBatches \} from "\.\/utils\/batchUtils";/,
    'import { processDynamicBatches } from "./utils/batchUtils";\nimport { CapacityService } from "./services/CapacityService";'
  );
  content = content.replace(
    /import \{ getCurrentCommunityBatch \} from "\.\/utils\/batchUtils";/,
    'import { getCurrentCommunityBatch } from "./utils/batchUtils";\nimport { CapacityService } from "./services/CapacityService";'
  );
}

fs.writeFileSync('src/App.tsx', content);

let bbr = fs.readFileSync('src/engine/BatchBusinessRules.ts', 'utf8');
if (!bbr.includes('static canEditBatch')) {
  bbr = bbr.replace(
    /}\n$/,
    `
  static canEditBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open" || status === "Registration Closed";
  }

  static canJoinBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    return this.canAcceptOrders(batch).canAcceptOrders;
  }

  static canDeleteBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const capacity = CapacityService.getCapacitySummary(batch);
    return capacity.committedGarments === 0;
  }

  static canCloseBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open";
  }

  static canLeaveBatch(batch: Batch | Partial<OrderContext> | null | undefined): boolean {
    if (!batch) return false;
    const status = this.getLifecycleStage(batch);
    return status === "Registration Open" || status === "Registration Closed";
  }

  static getHeroPresentation(batch: Batch | Partial<OrderContext> | null | undefined): any {
    return this.getPresentation(batch);
  }
}
`
  );
  fs.writeFileSync('src/engine/BatchBusinessRules.ts', bbr);
}

let home = fs.readFileSync('src/components/HomeView.tsx', 'utf8');
home = home.replace(/BatchBusinessRules\.getHeroPresentation/g, 'BatchBusinessRules.getPresentation');
fs.writeFileSync('src/components/HomeView.tsx', home);

let bie = fs.readFileSync('src/engine/BusinessIntelligenceEngine.ts', 'utf8');
bie = bie.replace(/calculateCapacityPercentage: \(batch: Batch, settings: BusinessSettings\) => \{/g, 'calculateCapacityPercentage: (batch: Batch, _settings: BusinessSettings) => {');
bie = bie.replace(/getRemainingGarments: \(batch: Batch, settings: BusinessSettings\) => \{/g, 'getRemainingGarments: (batch: Batch, _settings: BusinessSettings) => {');
fs.writeFileSync('src/engine/BusinessIntelligenceEngine.ts', bie);
