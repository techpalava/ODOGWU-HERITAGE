import React, { useState } from "react";
import { Batch } from "../types";
import { StorageService } from "../services/storageService";
import { Settings, Save } from "lucide-react";
import { InputField, SelectField } from "./ui/FormControls";
import { useReferenceDataFallback } from "../hooks/useReferenceData";

interface BatchManagementPanelProps {
  batches: Batch[];
}

export const BatchManagementPanel: React.FC<BatchManagementPanelProps> = ({ batches }) => {
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Batch>>({});
  const [isSaving, setIsSaving] = useState(false);

  const statusOptions = useReferenceDataFallback("batch_status", [
    { value: "Open", label: "Open" },
    { value: "Closed", label: "Closed" },
    { value: "Coming Soon", label: "Coming Soon" },
    { value: "Recruiting", label: "Recruiting" },
    { value: "Almost Full", label: "Almost Full" },
    { value: "In Progress", label: "In Progress" },
    { value: "Completed", label: "Completed" },
    { value: "Production Started", label: "Production Started" },
  ]);

  const handleEdit = (batch: Batch) => {
    setEditingBatchId(batch.id || batch.batchNumber.toString());
    setFormData(batch);
  };

  const handleCreateBatch = async () => {
    setIsSaving(true);
    try {
      const nextBatchNumber = batches.length > 0 ? Math.max(...batches.map(b => b.batchNumber)) + 1 : 1;
      
      const newBatch: Batch = {
        id: `batch-${nextBatchNumber}`,
        batchNumber: nextBatchNumber,
        name: `New Batch ${nextBatchNumber}`,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "COMING_SOON",
        isActive: false,
        isAutoScheduled: true,
        targetGarments: 50,
        currentGarments: 0,
        currentOrders: 0,
        displayOrder: nextBatchNumber,
        allowOrders: false,
        pickupLocation: "Veldhoven Campus Lockers",
        estimatedDelivery: "TBD", duration: "4 Weeks", currentCustomers: 0, visibility: "PUBLIC",
      };

      await StorageService.saveBatches([newBatch]);
    } catch (e) {
      console.error("Failed to create batch", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editingBatchId || !formData) return;
    
    setIsSaving(true);
    try {
      // Find original batch and merge
      const originalBatch = batches.find(b => (b.id || b.batchNumber.toString()) === editingBatchId);
      if (!originalBatch) return;

      const updatedBatch: Batch = {
        ...originalBatch,
        ...formData
      };

      let batchesToSave = [updatedBatch];
      
      // If this batch is being set to active, deactivate all others
      if (updatedBatch.isActive) {
         const otherBatches = batches.filter(b => b.id !== updatedBatch.id && b.isActive).map(b => ({...b, isActive: false}));
         batchesToSave = [...batchesToSave, ...otherBatches];
      }

      await StorageService.saveBatches(batchesToSave);
      
      setEditingBatchId(null);
      setFormData({});
    } catch (e) {
      console.error("Failed to save batch", e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="font-serif font-bold text-lg text-heritage-green mb-2 flex items-center gap-2">
            <Settings className="h-5 w-5 text-heritage-gold" />
            Batch Timeline Management (Admin Override)
          </h3>
          <p className="text-xs text-heritage-ink/70 max-w-2xl">
            The Timeline system automatically drives batch statuses globally based on their dates. 
            You can disable automatic scheduling per-batch to manually force its status or edit timelines here.
          </p>
        </div>
        <button
           onClick={handleCreateBatch}
           disabled={isSaving}
           className="bg-heritage-gold text-white px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shadow-sm hover:bg-heritage-green transition"
        >
           + Create New Batch
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
              <th className="p-3 font-bold">Batch</th>
              <th className="p-3 font-bold">Auto-Schedule</th>
              <th className="p-3 font-bold">Status</th>
              <th className="p-3 font-bold">Dates</th>
              <th className="p-3 font-bold text-center hidden md:table-cell">New Participants</th>
              <th className="p-3 font-bold text-center hidden md:table-cell">Previous Participants</th>
              <th className="p-3 font-bold text-center hidden md:table-cell">Dresses Made</th>
              <th className="p-3 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {batches.map(batch => {
              const isEditing = (batch.id || batch.batchNumber.toString()) === editingBatchId;
              
              if (isEditing) {
                return (
                  <tr key={batch.id || batch.batchNumber} className="border-b border-gray-50 bg-heritage-cream/10">
                    <td className="p-3">
                      <div className="space-y-3">
                        <InputField 
                           label="Batch Name" 
                           value={formData.name || ""} 
                           onChange={(e) => setFormData({...formData, name: e.target.value})} 
                        />
                        <InputField 
                           label="Display Order" 
                           type="number"
                           value={formData.displayOrder?.toString() || ""} 
                           onChange={(e) => setFormData({...formData, displayOrder: parseInt(e.target.value) || 0})} 
                        />
                      </div>
                    </td>
                    <td className="p-3 align-top">
                      
                      <div className="flex items-center gap-2 mt-2">
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
                      </div>

                    </td>
                    <td className="p-3 align-top">
                      <SelectField
                        label="Override Status"
                        value={formData.status || ""}
                        options={statusOptions}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                        disabled={formData.isAutoScheduled !== false}
                      />
                      {formData.isAutoScheduled !== false && (
                         <span className="text-[10px] text-gray-400 mt-1 block">Disable auto-pilot to force override.</span>
                      )}
                    </td>
                    <td className="p-3 align-top min-w-[200px]">
                      <div className="space-y-3">
                         <InputField 
                           label="Start Date" 
                           type="date"
                           value={formData.startDate || ""} 
                           onChange={(e) => setFormData({...formData, startDate: e.target.value})} 
                        />
                        <InputField 
                           label="End Date" 
                           type="date"
                           value={formData.endDate || ""} 
                           onChange={(e) => setFormData({...formData, endDate: e.target.value})} 
                        />
                        
                        <div className="md:hidden space-y-3 mt-4 pt-4 border-t border-heritage-gold/20">
                          <span className="text-[10px] font-bold text-heritage-green uppercase tracking-wider block">Production Stats</span>
                          <div className="grid grid-cols-3 gap-2">
                            <InputField 
                               label="New" 
                               type="number"
                               value={formData.newParticipants?.toString() || ""} 
                               onChange={(e) => setFormData({...formData, newParticipants: parseInt(e.target.value) || 0})} 
                            />
                            <InputField 
                               label="Returning" 
                               type="number"
                               value={formData.previousParticipants?.toString() || ""} 
                               onChange={(e) => setFormData({...formData, previousParticipants: parseInt(e.target.value) || 0})} 
                            />
                            <InputField 
                               label="Dresses" 
                               type="number"
                               value={formData.dressesMade?.toString() || ""} 
                               onChange={(e) => setFormData({...formData, dressesMade: parseInt(e.target.value) || 0})} 
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 align-top min-w-[120px] hidden md:table-cell">
                      <InputField 
                         label="New" 
                         type="number"
                         value={formData.newParticipants?.toString() || ""} 
                         onChange={(e) => setFormData({...formData, newParticipants: parseInt(e.target.value) || 0})} 
                      />
                    </td>
                    <td className="p-3 align-top min-w-[120px] hidden md:table-cell">
                      <InputField 
                         label="Returning" 
                         type="number"
                         value={formData.previousParticipants?.toString() || ""} 
                         onChange={(e) => setFormData({...formData, previousParticipants: parseInt(e.target.value) || 0})} 
                      />
                    </td>
                    <td className="p-3 align-top min-w-[120px] hidden md:table-cell">
                      <InputField 
                         label="Dresses" 
                         type="number"
                         value={formData.dressesMade?.toString() || ""} 
                         onChange={(e) => setFormData({...formData, dressesMade: parseInt(e.target.value) || 0})} 
                      />
                    </td>
                    <td className="p-3 align-top text-right space-y-2 flex flex-col items-end">
                      <button 
                         onClick={handleSave}
                         disabled={isSaving}
                         className="bg-heritage-green text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-heritage-forest transition"
                      >
                         <Save size={14} /> Save
                      </button>
                      <button 
                         onClick={() => setEditingBatchId(null)}
                         className="text-gray-500 hover:text-gray-700 text-xs font-bold px-4 py-2"
                      >
                         Cancel
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={batch.id || batch.batchNumber} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="p-3">
                    <strong className="block text-heritage-green font-display">Batch {batch.batchNumber}: {batch.name}</strong>
                    <span className="text-[10px] text-gray-500">Order: {batch.displayOrder || batch.batchNumber}</span>
                    
                    {/* Mobile Stats Stack */}
                    <div className="md:hidden mt-3 flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap">
                        <span className="text-[10px]">👥</span>
                        <strong className="text-gray-700 text-[10px] font-bold">{batch.newParticipants || 0}</strong>
                        <span className="text-[8px] text-gray-400 font-medium uppercase tracking-wider">New</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap">
                        <span className="text-[10px]">🔁</span>
                        <strong className="text-gray-700 text-[10px] font-bold">{batch.previousParticipants || 0}</strong>
                        <span className="text-[8px] text-gray-400 font-medium uppercase tracking-wider">Prev</span>
                      </div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap">
                        <span className="text-[10px]">👕</span>
                        <strong className="text-gray-700 text-[10px] font-bold">{batch.dressesMade || 0}</strong>
                        <span className="text-[8px] text-gray-400 font-medium uppercase tracking-wider">Made</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    {batch.isAutoScheduled === false ? (
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-1 rounded">MANUAL</span>
                    ) : (
                      <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-1 rounded">AUTO</span>
                    )}
                  </td>
                  <td className="p-3">
                     <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border 
                       ${batch.isActive ? 'bg-heritage-gold/20 text-heritage-gold border-heritage-gold/50' : 'bg-gray-100 text-gray-500 border-gray-200'}
                     `}>
                       {batch.status}
                     </span>
                  </td>
                  <td className="p-3">
                    <div className="text-[10px] text-gray-600 space-y-1">
                       <div><strong>Start:</strong> {batch.startDate}</div>
                       <div><strong>End:</strong> {batch.endDate}</div>
                    </div>
                  </td>
                  <td className="p-3 text-center hidden md:table-cell">
                    <div className="inline-flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap min-w-16">
                      <span className="text-xs">👥</span>
                      <strong className="text-gray-700 font-bold">{batch.newParticipants || 0}</strong>
                      <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider hidden sm:inline">New</span>
                    </div>
                  </td>
                  <td className="p-3 text-center hidden md:table-cell">
                    <div className="inline-flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap min-w-16">
                      <span className="text-xs">🔁</span>
                      <strong className="text-gray-700 font-bold">{batch.previousParticipants || 0}</strong>
                      <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider hidden sm:inline">Prev</span>
                    </div>
                  </td>
                  <td className="p-3 text-center hidden md:table-cell">
                    <div className="inline-flex flex-col items-center gap-0.5 sm:flex-row sm:gap-1.5 px-2 py-1 bg-gray-50 border border-gray-100 rounded-lg whitespace-nowrap min-w-16">
                      <span className="text-xs">👕</span>
                      <strong className="text-gray-700 font-bold">{batch.dressesMade || 0}</strong>
                      <span className="text-[9px] text-gray-400 font-medium uppercase tracking-wider hidden sm:inline">Made</span>
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <button 
                       onClick={() => handleEdit(batch)}
                       className="text-heritage-gold hover:text-heritage-green text-xs font-bold underline"
                    >
                      Edit Timeline
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
