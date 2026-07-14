const fs = require('fs');
let code = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const targetStr = '              <div className="mt-4 text-[10px] text-center text-heritage-ink/50 space-y-1">\n                <p>Your design is automatically saved while you work.</p>\n                {OrderRoutingEngine.canChangeRouting(orderContext) ? (<p>You can change your ordering option at any time before payment.</p>) : (<p className="text-red-500">This order has already been confirmed and can no longer be changed.</p>)}\n              </div>';

const replaceStr = targetStr + `
              
              {routingPresentation.currentBatchSummary && (
                <details className="mt-4 border border-gray-100 rounded-xl overflow-hidden group">
                  <summary className="bg-gray-50 p-3 text-[11px] font-bold text-heritage-ink uppercase tracking-wide cursor-pointer flex justify-between items-center hover:bg-gray-100 transition-colors">
                    <span>Current Production Batch Details</span>
                    <ChevronDown size={14} className="text-gray-500 group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="p-4 bg-white border-t border-gray-100">
                    <div className="flex flex-wrap gap-x-6 gap-y-4">
                      <div className="space-y-0.5 min-w-[120px]">
                        <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Community Batch</span>
                        <span className="font-semibold text-heritage-ink block text-[11px] uppercase tracking-wide">{routingPresentation.currentBatchSummary.name}</span>
                      </div>
                      <div className="space-y-0.5 min-w-[100px]">
                        <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Status</span>
                        <span className={\`font-bold block text-[11px] uppercase tracking-wide \${
                          routingDecision.mode === 'COMMUNITY_OPEN' 
                            ? 'text-heritage-green' 
                            : routingPresentation.currentBatchSummary.status.includes('FULL')
                              ? 'text-heritage-gold'
                              : routingPresentation.currentBatchSummary.status.includes('PRODUCTION')
                                ? 'text-blue-600'
                                : 'text-gray-500'
                        }\`}>
                          {routingPresentation.currentBatchSummary.status}
                        </span>
                      </div>
                      <div className="space-y-0.5 min-w-[100px]">
                        <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Capacity</span>
                        <span className="font-semibold text-heritage-ink block text-[11px]">{routingPresentation.currentBatchSummary.capacity}</span>
                      </div>
                      <div className="space-y-0.5 min-w-[120px]">
                        <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Production Progress</span>
                        <span className="font-semibold text-heritage-ink block text-[11px]">{routingPresentation.currentBatchSummary.nextMilestone}</span>
                      </div>
                      <div className="space-y-0.5 min-w-[120px]">
                        <span className="text-heritage-ink/40 block text-[9px] uppercase tracking-wider">Estimated Delivery</span>
                        <span className="font-serif font-bold text-heritage-gold block text-[11px]">{routingPresentation.currentBatchSummary.expectedDelivery}</span>
                      </div>
                    </div>
                  </div>
                </details>
              )}`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replaceStr);
    fs.writeFileSync('src/components/DesignStudioView.tsx', code);
    console.log('Added batch details to design studio view');
} else {
    console.log('Could not find target string');
}
