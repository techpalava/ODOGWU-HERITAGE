const fs = require('fs');

let content = fs.readFileSync('src/components/DashboardView.tsx', 'utf8');

const orderWorkspaceMarker = '{/* ==============================================================';

const endIndex = content.indexOf(orderWorkspaceMarker);

if (endIndex === -1) {
    console.error("Could not find insertion points");
    process.exit(1);
}

const after = content.substring(endIndex);

const newSections = `import React, { useState } from "react";
import { MasterOrder, HistoricalOrder, CustomGroup, OrderContext, Batch } from "../types";
import { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";
import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";
import { Edit2, Users, User, Share2, Trash2, CheckCircle2, FileText, Check, Shield, X } from "lucide-react";
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
  onUpdateProfile,
  onUpdateMeasurements,
  onLogout,
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

`;

fs.writeFileSync('src/components/DashboardView.tsx', newSections + after);
