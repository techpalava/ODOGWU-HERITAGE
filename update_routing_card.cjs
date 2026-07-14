const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const startTag = "{/* ROUTING PRESENTATION CARD */}";
const endTag = "{/* Validation feedback banners */}";

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
    const originalBlock = code.substring(startIndex, endIndex);
    const replacement = `      {/* ROUTING PRESENTATION CARD */}
      {routingDecision && (
        <div className={\`border rounded-xl p-3 flex items-center justify-between shadow-sm \${routingDecision.mode === 'COMMUNITY_OPEN' ? 'bg-heritage-green/5 border-heritage-green/20' : 'bg-gray-50 border-gray-200'}\`}>
          <div className="flex items-center gap-3">
             <div className={\`\${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-gray-500'}\`}>
                 <Shirt size={16} />
             </div>
             <div>
                <h4 className={\`text-xs font-bold uppercase tracking-wider \${routingDecision.mode === 'COMMUNITY_OPEN' ? 'text-heritage-green' : 'text-gray-700'}\`}>
                   {routingDecision.mode === 'COMMUNITY_OPEN' ? routingPresentation.title : (batchType === 'personalized' ? 'Personalized Batch' : 'Individual Order')}
                </h4>
                <p className="text-[10px] text-gray-500">
                   {routingDecision.mode === 'COMMUNITY_OPEN' ? routingPresentation.submissionMessage : 'Standard custom order processing.'}
                </p>
             </div>
          </div>
        </div>
      )}

      `;
    
    code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
    fs.writeFileSync('src/components/DesignStudioView.tsx', code);
    console.log('Replaced routing presentation card');
} else {
    console.log('Could not find tags');
}
