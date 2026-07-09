const fs = require('fs');
let content = fs.readFileSync('src/components/DesignStudioView.tsx', 'utf8');

const modalJSX = `
      {/* Next Batch Confirmation Modal */}
      <AnimatePresence>
        {showNextBatchConfirm && nextBatchToJoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 sm:p-8"
            >
              <h2 className="text-xl font-serif font-bold text-heritage-green mb-2">
                Move this design to the next available community batch?
              </h2>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Current Batch</span>
                  <div className="font-bold text-gray-400">{ctx.batchName} (Closed)</div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-heritage-gold tracking-wider">Next Batch</span>
                  <div className="font-bold text-heritage-ink">{nextBatchToJoin.name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Registration Opens: {nextBatchToJoin.registrationOpens || nextBatchToJoin.startDate || "TBD"}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNextBatchConfirm(false)}
                  className="flex-1 py-3 px-4 bg-white border border-gray-200 text-heritage-ink rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmNextBatch}
                  className="flex-1 py-3 px-4 bg-heritage-green text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-heritage-gold hover:text-heritage-forest transition"
                >
                  Move Design
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Routing Panel */}
`;

content = content.replace('{/* Order Routing Panel */}', modalJSX);
fs.writeFileSync('src/components/DesignStudioView.tsx', content);
