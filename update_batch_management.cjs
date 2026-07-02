const fs = require('fs');
let content = fs.readFileSync('src/components/BatchManagementPanel.tsx', 'utf8');

// Add fields to edit form
const editFormStart = `                      <div className="flex items-center gap-2 mt-2">
                        <input 
                           type="checkbox" 
                           checked={formData.isAutoScheduled !== false}
                           onChange={(e) => setFormData({...formData, isAutoScheduled: e.target.checked})}
                           className="w-4 h-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                        />
                        <span className="text-xs font-bold text-gray-700">Auto-Pilot</span>
                      </div>`;

const editFormAdditions = `                      <div className="flex items-center gap-2 mt-2">
                        <input 
                           type="checkbox" 
                           checked={formData.isAutoScheduled !== false}
                           onChange={(e) => setFormData({...formData, isAutoScheduled: e.target.checked})}
                           className="w-4 h-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                        />
                        <span className="text-xs font-bold text-gray-700">Auto-Pilot</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input 
                           type="checkbox" 
                           checked={!!formData.isActive}
                           onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                           className="w-4 h-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                        />
                        <span className="text-xs font-bold text-gray-700">Is Active Batch</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <input 
                           type="checkbox" 
                           checked={!!formData.allowOrders}
                           onChange={(e) => setFormData({...formData, allowOrders: e.target.checked})}
                           className="w-4 h-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                        />
                        <span className="text-xs font-bold text-gray-700">Allow Orders</span>
                      </div>`;

content = content.replace(editFormStart, editFormAdditions);

// Update handleSave to deactivate others if this one is made active
const saveStart = `      const updatedBatch: Batch = {
        ...originalBatch,
        ...formData
      };

      // saveBatch does not exist, use saveBatches with just this one to upsert
      await StorageService.saveBatches([updatedBatch]);`;

const saveReplacement = `      const updatedBatch: Batch = {
        ...originalBatch,
        ...formData
      };

      let batchesToSave = [updatedBatch];
      
      // If this batch is being set to active, deactivate all others
      if (updatedBatch.isActive) {
         const otherBatches = batches.filter(b => b.id !== updatedBatch.id && b.isActive).map(b => ({...b, isActive: false}));
         batchesToSave = [...batchesToSave, ...otherBatches];
      }

      await StorageService.saveBatches(batchesToSave);`;

content = content.replace(saveStart, saveReplacement);

fs.writeFileSync('src/components/BatchManagementPanel.tsx', content);
