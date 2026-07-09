import { useState } from "react";

import { MasterOrder, HistoricalOrder, CustomGroup, OrderContext, Batch } from "../types";
import { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";
import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";
import { Edit2, Users, User, Share2, Trash2, CheckCircle2, FileText, Check, Shield, X, CreditCard, Mail, Printer } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";

interface DashboardViewProps {
  masterOrder: MasterOrder | null;
  historicalOrders: HistoricalOrder[];
  activeOrders: MasterOrder[];
  drafts: any[];
  onDeleteDraft: (id: string) => void;
  onReorder: () => void;
  onNavigateToTab: (tabId: string) => void;
  onUpdateProfile: (name: string, email: string, phone: string) => void;
  onUpdateMeasurements: (measurements: MasterOrder["measurements"]) => void;
  onLogout: () => void;
  customGroups: CustomGroup[];
  onUpdateCustomGroup: (batchId: string, updatedFields: Partial<CustomGroup>) => void;
  onDeleteCustomGroup: (batchId: string) => void;
  onSelectOrderContext: (context: OrderContext) => void;
  joinedBatchIds: string[];
  onLeaveCustomGroup: (batchId: string) => void;
  currentUser?: { name: string; email?: string, phone?: string } | null;
  batches: Batch[];
}

export default function DashboardView({
  masterOrder,
  historicalOrders,
  activeOrders,
  drafts,
  onDeleteDraft,
  onReorder,
  onNavigateToTab,
  
  
  
  customGroups,
  onSelectOrderContext,
  joinedBatchIds,
  currentUser,
  batches,
}: DashboardViewProps) {
  
  const journey = CustomerJourneyEngine.getCurrentJourney({
    currentUser: currentUser as any,
    drafts,
    activeOrders,
    historicalOrders,
    allBatches: batches
  });

  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const { businessSettings } = useAppStore();
  const profileName = currentUser?.name || "Guest";
  const profileEmail = currentUser?.email || "guest@example.com";
  const profilePhone = currentUser?.phone || "+1234567890";

  const editedMeasurements = masterOrder?.measurements || {
    height: 180,
    weight: 75,
    neck: 15.5,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 40,
    fitPreference: "Slim/Executive",
    unit: "inch",
    isAiEstimated: false
  };

  const workspace = OrderRoutingEngine.categorizeWorkspace(drafts, activeOrders, historicalOrders);

  const myCreatedGroups = customGroups.filter(
    (g) =>
      g.organizer === currentUser?.name ||
      g.organizer === masterOrder?.customer.name ||
      g.organizer === "Xavier E."
  );

  const myJoinedGroups = customGroups.filter(
    (g) =>
      joinedBatchIds.includes(g.batchId) &&
      g.organizer !== currentUser?.name &&
      g.organizer !== masterOrder?.customer.name &&
      g.organizer !== "Xavier E."
  );

  return (
    <div className="space-y-8" id="dashboard-view-container">
      {/* Customer Journey Orchestration Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 text-white shadow-lg border border-heritage-gold/25">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4 font-sans">
            <h2 className="text-xl font-serif mb-2">Welcome, {currentUser?.name || 'Guest'}</h2>
            <p className="text-sm opacity-80 mb-4">{journey.notification}</p>
            <div className="flex gap-4">
              <button 
                onClick={() => onNavigateToTab(journey.destination)}
                className="bg-heritage-gold text-heritage-forest px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer">
                {journey.primaryAction}
              </button>
              <button 
                onClick={() => onNavigateToTab(journey.destination)}
                className="bg-transparent border border-white/30 hover:bg-white/10 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer">
                {journey.secondaryAction}
              </button>
            </div>
          </div>
        </div>
      </section>

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
                    
                    const canInvite = BatchBusinessRules.canJoinBatch(group);
                    return (
                      <div key={group.batchId} className="border border-heritage-gold/20 rounded-2xl p-4 bg-heritage-cream/10 space-y-3 relative text-left flex flex-col justify-between font-sans">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <h5 className="font-serif font-bold text-heritage-green text-sm">{group.batchName}</h5>
                              <span className="text-[9px] text-heritage-ink/50 font-mono block">Code: {group.batchId}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 ${getStatusColor(group.status)}`}>
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
        {/* Right Column */}
        <div className="lg:col-span-4 space-y-8 font-sans text-xs">
          {/* Active order cost Breakdown */}
          {masterOrder && (
            <div className="rounded-3xl border-2 border-heritage-gold bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-2 border-b border-heritage-beige pb-3">
                <CreditCard className="text-heritage-gold" size={16} />
                <h4 className="text-sm font-bold uppercase tracking-wider text-heritage-green font-serif">
                  Payment Details
                </h4>
              </div>

              <div className="space-y-2 font-medium">
                <div className="flex justify-between">
                  <span>Base Sewing Price:</span>
                  <span className="text-heritage-green font-bold">
                    €{(masterOrder.style.basePrice || 150).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 font-bold text-sm text-heritage-green font-serif">
                  <span>Total Price:</span>
                  <span>€{masterOrder.payment.subtotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center pt-2">
                <div className="bg-heritage-cream border border-heritage-gold/20 p-3 rounded-xl">
                  <span className="block text-[8px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                    50% Deposit Paid
                  </span>
                  <span className="text-sm font-serif font-bold text-emerald-800">
                    €{masterOrder.payment.deposit.toFixed(2)}
                  </span>
                </div>
                <div className="bg-heritage-cream border border-heritage-gold/20 p-3 rounded-xl">
                  <span className="block text-[8px] uppercase font-bold text-heritage-ink/50 tracking-wider">
                    Due at Pickup
                  </span>
                  <span className="text-sm font-serif font-bold text-heritage-green">
                    €{masterOrder.payment.remaining.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] rounded-xl flex items-center gap-2">
                <Check size={14} className="text-emerald-700 shrink-0" />
                <p>
                  Your payment for{" "}
                  <strong>{masterOrder.batchName || "Community Batch"}</strong>{" "}
                  was logged on {masterOrder.payment.date}.
                </p>
              </div>

              <div className="p-3 bg-heritage-cream/40 border border-heritage-gold/25 text-heritage-ink text-[10px] rounded-xl flex items-start gap-2 text-left">
                <Mail
                  size={14}
                  className="text-heritage-gold shrink-0 mt-0.5"
                />
                <p className="leading-relaxed">
                  <strong>Corporate Email Tracking Active:</strong> You will
                  automatically receive real-time shipment progress, customs
                  clearance, and locker courier codes directly to your inbox.
                </p>
              </div>

              <button
                onClick={() => setSelectedReceipt(masterOrder)}
                className="w-full mt-1 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <FileText size={12} /> View Digital Receipt
              </button>
            </div>
          )}

          {/* Informational Guidelines Card */}
          <div className="rounded-3xl border border-heritage-gold/15 bg-white p-6 shadow-sm space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-heritage-green border-b pb-2 font-serif">
              Locker Pickup Guidelines
            </h4>
            <div className="space-y-3 text-[11px] leading-relaxed text-heritage-ink/80">
              <p>
                <strong>1. Locker Notification:</strong> Once the shipment is
                delivered, we will email you the locker code.
              </p>
              <p>
                <strong>2. Locker Location:</strong> The lockers are in{" "}
                <strong>{businessSettings.productionSettings.defaultPickupLocation}</strong>.
              </p>
              <p>
                <strong>3. Fitting & Adjustments:</strong> You can try on your
                clothes right away at our campus fitting area. If you need any
                adjustments, let us know within 7 days.
              </p>
            </div>
          </div>
        </div>

      {/* DIGITAL RECEIPT MODAL (Feature 3) */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-heritage-ink/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-heritage-gold/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header / Actions */}
            <div className="bg-heritage-cream/60 px-6 py-4 border-b border-heritage-gold/15 flex justify-between items-center print:hidden">
              <span className="flex items-center gap-1.5 text-heritage-green font-serif text-sm font-bold">
                <FileText size={16} className="text-heritage-gold" />
                Digital Receipt & Escrow Invoice
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <Printer size={12} /> Print/Save PDF
                </button>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 transition p-1.5 rounded-xl cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Receipt Printable Canvas */}
            <div
              className="p-8 space-y-6 text-left relative overflow-hidden"
              id="printable-receipt"
            >
              {/* Giant background faint crest (for print authenticity) */}
              <div className="absolute right-0 bottom-0 translate-y-16 translate-x-16 opacity-3 text-[300px] pointer-events-none font-serif select-none">
                ⚜
              </div>

              {/* Top Banner */}
              <div className="flex justify-between items-start border-b-2 border-heritage-green pb-5">
                <div>
                  <div className="flex items-center gap-1 text-heritage-green">
                    <span className="text-xl font-serif font-bold tracking-tight">
                      N.T.C.C. Veldhoven
                    </span>
                  </div>
                  <p className="text-[10px] text-heritage-ink/60 mt-0.5 leading-snug max-w-xs uppercase font-bold tracking-wider">
                    {businessSettings.applicationSettings.tagline || "Nigerian Traditional Clothing Community (NTCC)"} Buy
                    <br />
                    {businessSettings.applicationSettings.communityName} — Est. 2024
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                    Escrow Paid & Active
                  </span>
                  <p className="text-[10px] font-mono text-heritage-ink/50 mt-1.5 font-bold">
                    Invoice ID:{" "}
                    <span className="text-heritage-green font-semibold">
                      INV-
                      {selectedReceipt.id ||
                        selectedReceipt.shipment?.trackingId ||
                        "TRK-2026-X1"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-6 text-[11px] border-b pb-5 border-gray-100 font-sans">
                <div className="space-y-1 text-left">
                  <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">
                    Billed To (Client Member)
                  </span>
                  <strong className="text-heritage-green block text-xs">
                    {selectedReceipt.customer?.name || profileName}
                  </strong>
                  <span className="text-heritage-ink/70 block font-mono font-medium">
                    {selectedReceipt.customer?.email || profileEmail}
                  </span>
                  <span className="text-heritage-ink/70 block font-mono font-medium">
                    {selectedReceipt.customer?.phone || profilePhone}
                  </span>
                  <span className="text-heritage-ink/50 block italic">
                    {businessSettings.productionSettings.defaultPickupLocation} Delivery
                  </span>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">
                    Escrow Ledger details
                  </span>
                  <span className="text-heritage-ink/70 block">
                    <strong>Cohort Group:</strong>{" "}
                    {selectedReceipt.batchName || "Community Batch"}
                  </span>
                  <span className="text-heritage-ink/70 block">
                    <strong>Payment Method:</strong> SEPA Bank Transfer
                  </span>
                  <span className="text-heritage-ink/70 block">
                    <strong>Transaction Date:</strong>{" "}
                    {selectedReceipt.payment?.date ||
                      selectedReceipt.date ||
                      "April 15, 2026"}
                  </span>
                  <span className="text-heritage-ink/70 block">
                    <strong>Locker Location:</strong>{" "}
                    {selectedReceipt.batchType === "alone"
                      ? "Direct priority home shipping"
                      : businessSettings.productionSettings.defaultPickupLocation}
                  </span>
                </div>
              </div>

              {/* Custom specs breakdown */}
              <div className="space-y-2">
                <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">
                  Garment Specifications & Custom Tailoring
                </span>
                <div className="border border-heritage-gold/20 rounded-2xl bg-heritage-cream/15 p-4 space-y-3 text-xs font-sans text-left">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <div>
                      <strong className="text-heritage-green text-sm font-serif">
                        {selectedReceipt.styleName ||
                          selectedReceipt.style?.name ||
                          "Traditional Senator Suit"}
                      </strong>
                      <span className="text-[10px] text-heritage-ink/50 block font-mono mt-0.5">
                        Fabric:{" "}
                        {selectedReceipt.fabricCode ||
                          selectedReceipt.fabric?.code}{" "}
                        —{" "}
                        {selectedReceipt.fabricName ||
                          selectedReceipt.fabric?.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono bg-heritage-green/10 text-heritage-green px-2 py-0.5 rounded-md font-semibold">
                        {selectedReceipt.garmentType ||
                          selectedReceipt.garment?.type ||
                          "Full 2-Piece Set"}
                      </span>
                    </div>
                  </div>

                  {/* Design Choices (if available) */}
                  {selectedReceipt.design && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[10px] text-heritage-ink/75 border-b border-gray-100 pb-2 text-left">
                      <div>
                        Collar Style:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.collar}
                        </strong>
                      </div>
                      <div>
                        Embroidery Pattern:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.embroidery}
                        </strong>
                      </div>
                      <div>
                        Sleeve Design:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.sleeve}
                        </strong>
                      </div>
                      <div>
                        Pockets:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.pocket}
                        </strong>
                      </div>
                      <div>
                        Hem Finish:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.hemFinish}
                        </strong>
                      </div>
                      <div>
                        L5 Selected:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.hasLining ? "Yes" : "No"}
                        </strong>
                      </div>
                      <div>
                        Order Type:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.batchType === "alone" ? "Order Alone" : "Join Current Group Order"}
                        </strong>
                      </div>
                      <div>
                        Shipping Surcharge Applied:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.batchType === "alone" ? "+ €35.00" : "None"}
                        </strong>
                      </div>
                      {selectedReceipt.design.optionalAccessories && selectedReceipt.design.optionalAccessories.length > 0 && (
                        <div>
                          Selected Accessories:{" "}
                          <strong className="text-heritage-green">
                            {selectedReceipt.design.optionalAccessories.join(", ")}
                          </strong>
                        </div>
                      )}
                      {selectedReceipt.design.optionalAccessories && selectedReceipt.design.optionalAccessories.length > 0 && (
                        <div>
                          Accessory Total:{" "}
                          <strong className="text-heritage-green">
                            + €{(selectedReceipt.design.optionalAccessories.length * 10).toFixed(2)}
                          </strong>
                        </div>
                      )}
                      <div>
                        Agbada Cap:{" "}
                        <strong className="text-heritage-green">
                          {selectedReceipt.design.additionalCap
                            ? "Included"
                            : "None"}
                        </strong>
                      </div>
                    </div>
                  )}

                  {/* Sizing Blueprint summary */}
                  <div className="text-[10px] text-heritage-ink/70 space-y-1 text-left">
                    <span className="font-bold text-heritage-green">
                      Tailor Sizing Vector:
                    </span>
                    <p className="font-mono bg-white p-2.5 rounded-lg border border-gray-150 tracking-wide leading-relaxed text-[11px] font-semibold text-heritage-green">
                      HT:{" "}
                      {selectedReceipt.measurements?.height ||
                        editedMeasurements.height}
                      cm | WT:{" "}
                      {selectedReceipt.measurements?.weight ||
                        editedMeasurements.weight}
                      kg | NK:{" "}
                      {selectedReceipt.measurements?.neck ||
                        editedMeasurements.neck}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | SH:{" "}
                      {selectedReceipt.measurements?.shoulder ||
                        editedMeasurements.shoulder}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | CH:{" "}
                      {selectedReceipt.measurements?.chest ||
                        editedMeasurements.chest}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | WS:{" "}
                      {selectedReceipt.measurements?.waist ||
                        editedMeasurements.waist}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | HP:{" "}
                      {selectedReceipt.measurements?.hip ||
                        editedMeasurements.hip}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | SL:{" "}
                      {selectedReceipt.measurements?.sleeve ||
                        editedMeasurements.sleeve}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}{" "}
                      | TR:{" "}
                      {selectedReceipt.measurements?.trouserLength ||
                        editedMeasurements.trouserLength}
                      {(selectedReceipt.measurements?.unit || "inch") === "cm"
                        ? "cm"
                        : '"'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial calculations */}
              <div className="border-t pt-4 space-y-2 font-sans text-left">
                <div className="flex justify-between text-[11px] text-heritage-ink/75 border-b pb-2 border-gray-100">
                  <span>Base Sewing Price:</span>
                  <span className="font-bold text-heritage-green">
                    €
                    {(
                      selectedReceipt.style?.basePrice ||
                      selectedReceipt.amount ||
                      320
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-serif font-bold text-heritage-green pt-1">
                  <span className="text-sm">Total Custom Order Value:</span>
                  <span className="text-sm">
                    €
                    {(
                      selectedReceipt.payment?.subtotal ||
                      selectedReceipt.amount ||
                      320
                    ).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Split payment deposit tracking */}
              <div className="grid grid-cols-2 gap-3 pt-2 font-sans">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-emerald-800/60 tracking-wider">
                      50% Deposit Paid (Cleared)
                    </span>
                    <strong className="text-emerald-800 text-sm font-serif">
                      €
                      {(
                        selectedReceipt.payment?.deposit ||
                        (selectedReceipt.amount || 320) * 0.5
                      ).toFixed(2)}
                    </strong>
                  </div>
                  <Check
                    size={16}
                    className="text-emerald-700 font-bold shrink-0"
                  />
                </div>
                <div className="bg-heritage-cream border border-heritage-gold/20 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-heritage-ink/40 tracking-wider">
                      50% Balance Held in Escrow
                    </span>
                    <strong className="text-heritage-green text-sm font-serif">
                      €
                      {(
                        selectedReceipt.payment?.remaining ||
                        (selectedReceipt.amount || 320) * 0.5
                      ).toFixed(2)}
                    </strong>
                  </div>
                  <Shield size={16} className="text-heritage-gold shrink-0" />
                </div>
              </div>

              {/* Escrow note footer */}
              <div className="border-t border-gray-100 pt-4 text-[9px] text-heritage-ink/50 leading-relaxed font-sans text-center space-y-1.5">
                <p>
                  <strong>
                    NIGERIAN TRADITIONAL CLOTHING ESCROW AGREEMENT:
                  </strong>{" "}
                  Handled securely by the NTCC board coordinator. The 50%
                  deposit has been disbursed to our weaver cooperative in Iseyin
                  to source raw fibers and spool loom threads. The remaining 50%
                  balance is stored in escrow and will be unlocked for our
                  tailors in Lagos upon the successful fitting session on-site
                  at Veldhoven.
                </p>
                <p className="font-mono text-[8px]">
                  Authorized by Coordinator: Fredrick Ezeh | NTCC Veldhoven
                  Ledger System | Secure Key: NTCC-ESCROW-
                  {selectedReceipt.id || "ACTIVE-G3"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
