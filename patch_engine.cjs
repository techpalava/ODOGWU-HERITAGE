const fs = require('fs');
let content = fs.readFileSync('src/engine/CustomerJourneyEngine.ts', 'utf8');

// 1. Add stepperContext to CustomerContext
content = content.replace(
    'allBatches: Batch[];',
    'allBatches: Batch[];\n    stepperContext?: {\n        currentStep: number;\n        totalSteps: number;\n    };'
);

// 2. Add properties to JourneyModel
content = content.replace(
    'recommendedNextStep: string;',
    'recommendedNextStep: string;\n  stepperPreviousLabel?: string;\n  stepperNextLabel?: string;\n  stepperSubmitLabel?: string;'
);

// 3. Initialize variables in getCurrentJourney
content = content.replace(
    'const { currentUser, drafts, activeOrders, historicalOrders, allBatches } = context;',
    `const { currentUser, drafts, activeOrders, historicalOrders, allBatches, stepperContext } = context;

        let stepperPreviousLabel = "Previous Step";
        let stepperNextLabel = "Continue";
        let stepperSubmitLabel = "Add Custom Attire to Cart";

        if (stepperContext) {
            const { currentStep, totalSteps } = stepperContext;
            
            // Custom model logic based on state/context
            if (currentStep === 1) {
                stepperPreviousLabel = "";
            } else if (currentStep === 2) {
                stepperPreviousLabel = "Back to Styles";
            } else if (currentStep === totalSteps) {
                stepperPreviousLabel = "Back to Review";
            }
            
            stepperNextLabel = "Continue to Next Step";
            if (currentStep === 1) stepperNextLabel = "Proceed with this Style";
            if (currentStep === totalSteps - 1) stepperNextLabel = "Review Order Details";
            
            stepperSubmitLabel = "Secure My Order Selection";
        }
`
);

// 4. Update returns
content = content.replace(/return\s*\{/g, 'return { stepperPreviousLabel, stepperNextLabel, stepperSubmitLabel,');

fs.writeFileSync('src/engine/CustomerJourneyEngine.ts', content);
