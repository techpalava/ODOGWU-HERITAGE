const fs = require('fs');
let code = fs.readFileSync('src/engine/CustomerJourneyEngine.ts', 'utf8');

code = code.replace(
    'stepperSubmitLabel: string;',
    'stepperSubmitLabel: string;\n  requiresAttention: boolean;'
);

code = code.replace(
    'let recommendedNextStep = "View the gallery to see our styles.";',
    'let recommendedNextStep = "View the gallery to see our styles.";\n        let requiresAttention = false;'
);

code = code.replace(
    /return \{ stepperPreviousLabel, stepperNextLabel, stepperSubmitLabel,\s*state, progress, currentOrder, primaryAction, secondaryAction,\s*destination, notification, workspace, canContinue, blockers, recommendedNextStep\s*\};/g,
    'return { stepperPreviousLabel, stepperNextLabel, stepperSubmitLabel, state, progress, currentOrder, primaryAction, secondaryAction, destination, notification, workspace, canContinue, blockers, recommendedNextStep, requiresAttention };'
);

code = code.replace(
    'state = "PAYMENT_PENDING";',
    'state = "PAYMENT_PENDING"; requiresAttention = true;'
);

code = code.replace(
    'state = "PRODUCTION";',
    'state = "PRODUCTION"; requiresAttention = true;'
);

code = code.replace(
    'state = "SHIPPING";',
    'state = "SHIPPING"; requiresAttention = true;'
);

code = code.replace(
    'state = "PAYMENT_COMPLETED";',
    'state = "PAYMENT_COMPLETED"; requiresAttention = true;'
);

fs.writeFileSync('src/engine/CustomerJourneyEngine.ts', code);
console.log('Patched');
