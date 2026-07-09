const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

content = content.replace(
    /<ArrowLeft size=\{14\} \/> Previous Step/,
    '<ArrowLeft size={14} /> {journey.stepperPreviousLabel || "Previous Step"}'
);

content = content.replace(
    /Continue <ArrowRight size=\{14\} \/>/,
    '{journey.stepperNextLabel || "Continue"} <ArrowRight size={14} />'
);

content = content.replace(
    /Add Custom Attire to Cart <Check size=\{14\} \/>/,
    '{journey.stepperSubmitLabel || "Add Custom Attire to Cart"} <Check size={14} />'
);

fs.writeFileSync('src/components/DesignStudioView.tsx', content);
