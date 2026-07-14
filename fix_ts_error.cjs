const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = `                        <span className={\`font-bold block text-[11px] uppercase tracking-wide \${
                          routingDecision.mode === 'COMMUNITY_OPEN' 
                            ? 'text-heritage-green' 
                            : routingPresentation.currentBatchSummary.status.includes('FULL')
                              ? 'text-heritage-gold'
                              : routingPresentation.currentBatchSummary.status.includes('PRODUCTION')
                                ? 'text-blue-600'
                                : 'text-gray-500'
                        }\`}>`;

const replaceStr = `                        <span className={\`font-bold block text-[11px] uppercase tracking-wide \${
                           routingPresentation.currentBatchSummary.status.includes('FULL')
                              ? 'text-heritage-gold'
                              : routingPresentation.currentBatchSummary.status.includes('PRODUCTION')
                                ? 'text-blue-600'
                                : 'text-gray-500'
                        }\`}>`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/components/DesignStudioView.tsx', code);
    console.log('Fixed TS error');
} else {
    console.log('Target string not found');
}
