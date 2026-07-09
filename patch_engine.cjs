const fs = require('fs');
let content = fs.readFileSync('src/engine/CustomerJourneyEngine.ts', 'utf8');

const imports = `import { BatchBusinessRules } from "./BatchBusinessRules";\nimport { getCurrentCommunityBatch } from "../utils/batchUtils";\n`;
if (!content.includes('BatchBusinessRules')) {
  content = content.replace('import { AuthorizationEngine } from "./AuthorizationEngine";', 'import { AuthorizationEngine } from "./AuthorizationEngine";\n' + imports);
}

const findBaseDefaults = `        // Base defaults
        let state: JourneyState = "NEW_VISITOR";
        let progress = 0;
        let currentOrder: MasterOrder | CartItem | null = null;
        let primaryAction = "Explore Designs";
        let secondaryAction = "Learn How it Works";
        let destination = "gallery";`;

const replacementBaseDefaults = `        // Base defaults
        let state: JourneyState = "NEW_VISITOR";
        let progress = 0;
        let currentOrder: MasterOrder | CartItem | null = null;
        
        const openBatch = getCurrentCommunityBatch(allBatches);
        const canJoinActiveBatch = openBatch ? BatchBusinessRules.canAcceptOrders(openBatch).canAcceptOrders : false;
        
        let primaryAction = canJoinActiveBatch ? \`Join \${openBatch?.name}\` : "Create Custom Order";
        let secondaryAction = "Learn How it Works";
        let destination = canJoinActiveBatch ? "design" : "custom-order";`;

content = content.replace(findBaseDefaults, replacementBaseDefaults);

const findAccountCreated = `        state = "ACCOUNT_CREATED";
        progress = 5;
        primaryAction = "Create Custom Attire";
        secondaryAction = "View Inspiration";
        destination = "design";`;

const replaceAccountCreated = `        state = "ACCOUNT_CREATED";
        progress = 5;
        primaryAction = canJoinActiveBatch ? \`Join \${openBatch?.name}\` : "Create Custom Order";
        secondaryAction = "View Inspiration";
        destination = canJoinActiveBatch ? "design" : "custom-order";`;

content = content.replace(findAccountCreated, replaceAccountCreated);

const findNoActiveWork = `        if (historicalOrders && historicalOrders.length > 0) {
            state = "NO_ACTIVE_WORK";
            progress = 0;
            primaryAction = "Start New Design";
            secondaryAction = "View Past Orders";
            destination = "design";`;

const replaceNoActiveWork = `        if (historicalOrders && historicalOrders.length > 0) {
            state = "NO_ACTIVE_WORK";
            progress = 0;
            primaryAction = canJoinActiveBatch ? \`Join \${openBatch?.name}\` : "Start New Design";
            secondaryAction = "View Past Orders";
            destination = canJoinActiveBatch ? "design" : "custom-order";`;

content = content.replace(findNoActiveWork, replaceNoActiveWork);

fs.writeFileSync('src/engine/CustomerJourneyEngine.ts', content);
