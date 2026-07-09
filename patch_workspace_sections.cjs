const fs = require('fs');

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

// The marker where ORDER HISTORY REGISTRY starts
const startIndex = content.indexOf('{/* ORDER HISTORY REGISTRY */}');
// The marker where the grid ends
const endIndex = content.indexOf('{/* Right Column */}');

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find insertion points");
    process.exit(1);
}

const before = content.substring(0, startIndex);
const after = content.substring(endIndex);

const newSections = `
          {/* ==============================================================
              ORDER WORKSPACE 
             ============================================================== */}
          <div className="space-y-8">
            
            {/* 1. MY DRAFT DESIGNS */}
            {workspace.drafts.length > 0 && (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
                  <Edit2 className="text-heritage-gold" size={18} />
                  <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                    My Draft Designs
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {workspace.drafts.map((draft) => (
                    <div key={draft.id} className="border border-heritage-gold/20 rounded-2xl p-4 bg-heritage-cream/10 space-y-3 relative text-left flex flex-col justify-between font-sans">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-1">
                          <h5 className="font-serif font-bold text-heritage-green text-sm">{draft.style.name}</h5>
                          <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 bg-gray-50 text-gray-700 border-gray-200">Draft</span>
                        </div>
                        <p className="text-[10px] text-heritage-ink/70 leading-relaxed font-medium">Fabric: {draft.fabric.name}</p>
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-gray-100">
                        <button onClick={() => onNavigateToTab("design")} className="flex-1 py-1.5 px-2 bg-heritage-green hover:bg-heritage-gold text-white text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer">
                          Continue
                        </button>
                        <button onClick={() => onDeleteDraft(draft.id)} className="py-1.5 px-2 border border-red-200 text-red-600 hover:bg-red-50 text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer flex items-center justify-center">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 2. COMMUNITY ORDERS */}
            {workspace.communityOrders.length > 0 && (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
                  <Users className="text-heritage-gold" size={18} />
                  <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                    Community Orders
                  </h3>
                </div>
                <div className="space-y-4">
                  {workspace.communityOrders.map((order) => (
                    <div key={order.shipment?.trackingId || order.id} className="border border-heritage-gold/20 rounded-2xl p-4 space-y-3 flex flex-col">
                      <div className="flex justify-between">
                        <div>
                          <h5 className="font-serif font-bold text-heritage-green">{order.batchName || 'Community Batch'}</h5>
                          <div className="text-[10px] font-mono text-heritage-ink/60">{order.style.name}</div>
                        </div>
                        <span className="px-2 py-1 rounded text-[8px] font-bold uppercase border bg-emerald-50 text-emerald-800 border-emerald-200 h-fit">
                          {order.shipment?.status || 'Processing'}
                        </span>
                      </div>
                      <div className="text-[10px] text-heritage-ink/75">
                        Progress: Step {order.shipment?.currentStage || 1} of 6 <br/>
                        Est. Delivery: {order.shipment?.estimatedDelivery || 'TBD'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 3. INDIVIDUAL ORDERS */}
            {workspace.individualOrders.length > 0 && (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
                  <User className="text-heritage-gold" size={18} />
                  <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                    Individual Orders
                  </h3>
                </div>
                <div className="space-y-4">
                  {workspace.individualOrders.map((order) => (
                    <div key={order.shipment?.trackingId || order.id} className="border border-heritage-gold/20 rounded-2xl p-4 space-y-3 flex flex-col">
                      <div className="flex justify-between">
                        <div>
                          <h5 className="font-serif font-bold text-heritage-green">Individual Order</h5>
                          <div className="text-[10px] font-mono text-heritage-ink/60">{order.style.name}</div>
                        </div>
                        <span className="px-2 py-1 rounded text-[8px] font-bold uppercase border bg-emerald-50 text-emerald-800 border-emerald-200 h-fit">
                          {order.shipment?.status || 'Processing'}
                        </span>
                      </div>
                      <div className="text-[10px] text-heritage-ink/75">
                        Production Stage: {order.shipment?.currentStage || 1} <br/>
                        Est. Delivery: {order.shipment?.estimatedDelivery || 'TBD'}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. PERSONALIZED BATCHES (Reuses logic from old My Groups + Active Orders) */}
            {(workspace.personalizedBatches.length > 0 || myCreatedGroups.length > 0 || myJoinedGroups.length > 0) && (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-4 border-gray-100">
                  <div className="flex items-center gap-3">
                    <Users className="text-heritage-gold" size={18} />
                    <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                      Personalized Batches
                    </h3>
                  </div>
                  <button
                    onClick={() => onNavigateToTab("custom-order")}
                    className="bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white transition py-1.5 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Create or Join New
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...myCreatedGroups, ...myJoinedGroups].map((group) => {
                    const getStatusColor = (status) => {
                      switch (status) {
                        case "DRAFT": return "bg-gray-50 text-gray-700 border-gray-200";
                        case "OPEN": return "bg-emerald-50 text-emerald-800 border-emerald-200";
                        case "ALMOST_FULL": return "bg-amber-50 text-amber-800 border-amber-200";
                        case "FULL": return "bg-orange-50 text-orange-800 border-orange-200";
                        case "CLOSED": return "bg-stone-50 text-stone-700 border-stone-200";
                        case "LOCKED": return "bg-indigo-50 text-indigo-800 border-indigo-200";
                        case "COMPLETED": return "bg-heritage-cream text-heritage-green border-heritage-gold/30";
                        default: return "bg-gray-50 text-gray-700 border-gray-200";
                      }
                    };
                    const canEdit = BatchBusinessRules.canEditBatch(group);
                    const canInvite = BatchBusinessRules.canJoinBatch(group);
                    return (
                      <div key={group.batchId} className="border border-heritage-gold/20 rounded-2xl p-4 bg-heritage-cream/10 space-y-3 relative text-left flex flex-col justify-between font-sans">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <h5 className="font-serif font-bold text-heritage-green text-sm">{group.batchName}</h5>
                              <span className="text-[9px] text-heritage-ink/50 font-mono block">Code: {group.batchId}</span>
                            </div>
                            <span className={\`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 \${getStatusColor(group.status)}\`}>
                              {group.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-gray-100 pt-2 text-heritage-ink/75">
                            <div>
                              <span className="text-[8px] text-heritage-ink/40 block uppercase">Member Count</span>
                              <strong>{group.currentMembers} / {group.maxParticipants} Joined</strong>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2 pt-2 border-t border-gray-100 font-sans">
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                onSelectOrderContext({
                                  orderType: "Group Organizer",
                                  batchId: group.batchId,
                                  batchName: group.batchName,
                                  organizer: group.organizer,
                                  deliveryWindow: group.deliveryWindow,
                                  currentMembers: group.currentMembers,
                                  expectedParticipants: group.expectedParticipants,
                                  closingDate: group.closingDate,
                                });
                              }}
                              className="flex-1 py-1 px-1.5 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer font-sans"
                            >
                              Launch Studio
                            </button>
                            {canInvite && (
                              <button
                                onClick={() => alert("Invite link copied!")}
                                className="px-2 py-1 bg-heritage-cream hover:bg-heritage-gold/20 text-heritage-green rounded-lg transition flex items-center justify-center cursor-pointer"
                                title="Copy Invite Link"
                              >
                                <Share2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 5. COMPLETED ORDERS */}
            {workspace.completedOrders.length > 0 && (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
                  <CheckCircle2 className="text-heritage-gold" size={18} />
                  <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                    Completed Orders
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[550px]">
                    <thead>
                      <tr className="border-b border-heritage-beige text-heritage-ink/60 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-3">Order ID</th>
                        <th className="pb-3">Style & fabric</th>
                        <th className="pb-3">Date Placed</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workspace.completedOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-heritage-cream/20 transition">
                          <td className="py-4 font-mono font-bold text-heritage-green">{order.id}</td>
                          <td className="py-4">
                            <span className="font-serif font-bold text-heritage-green block">{order.styleName}</span>
                            <span className="text-[10px] text-heritage-ink/50 block font-mono">{order.fabricCode}</span>
                          </td>
                          <td className="py-4 text-heritage-ink/75">{order.date}</td>
                          <td className="py-4">
                            <span className="inline-block bg-heritage-cream text-heritage-green border border-heritage-gold/30 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                              {order.status}
                            </span>
                          </td>
                          <td className="py-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              onClick={() => setSelectedReceipt(order)}
                              className="px-2.5 py-1 border border-heritage-green text-heritage-green hover:bg-heritage-cream transition rounded-lg text-[9px] font-bold uppercase cursor-pointer inline-flex items-center gap-1"
                            >
                              <FileText size={10} /> Invoice
                            </button>
                            <button
                              onClick={() => onReorder()}
                              className="px-2.5 py-1 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition rounded-lg text-[9px] font-bold uppercase cursor-pointer"
                            >
                              Reorder
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
`;

fs.writeFileSync('src/components/DashboardView.tsx', before + newSections + after);
