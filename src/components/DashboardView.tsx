/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, ClipboardList, CreditCard, History, Settings, Check, Mail, Phone, Edit2, MapPin, Printer, Download, FileText, Sparkles, ChevronDown, ChevronUp, Award, X, Info, Clock, Shield, Users, UserPlus, Share2, LogOut, Trash2, Calendar, CheckSquare } from 'lucide-react';
import { MasterOrder, HistoricalOrder, CustomGroup, OrderContext, Batch } from '../types';
import odogwuLogo from '../assets/images/odogwu_logo_1782556303014.jpg';

interface DashboardViewProps {
  masterOrder: MasterOrder | null;
  historicalOrders: HistoricalOrder[];
  onReorder: (styleId: string, fabricCode: string) => void;
  onNavigateToTab: (tabId: string) => void;
  onUpdateProfile: (name: string, email: string, phone: string) => void;
  onUpdateMeasurements: (measurements: MasterOrder['measurements']) => void;
  onLogout: () => void;
  customGroups: CustomGroup[];
  onUpdateCustomGroup: (batchId: string, updatedFields: Partial<CustomGroup>) => void;
  onDeleteCustomGroup: (batchId: string) => void;
  onSelectOrderContext: (context: OrderContext) => void;
  joinedBatchIds: string[];
  onLeaveCustomGroup: (batchId: string) => void;
  currentUser?: { name: string; email?: string } | null;
  batches: Batch[];
}

export default function DashboardView({
  masterOrder,
  historicalOrders,
  onReorder,
  onNavigateToTab,
  onUpdateProfile,
  onUpdateMeasurements,
  onLogout,
  customGroups,
  onUpdateCustomGroup,
  onDeleteCustomGroup,
  onSelectOrderContext,
  joinedBatchIds,
  onLeaveCustomGroup,
  currentUser,
  batches
}: DashboardViewProps) {
  // Local states for editing profile
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(masterOrder?.customer.name || 'Xavier E.');
  const [profileEmail, setProfileEmail] = useState(masterOrder?.customer.email || 'x.e@asml-corp.nl');
  const [profilePhone, setProfilePhone] = useState(masterOrder?.customer.phone || '+31 6 1234 5678');

  // Dynamic lists from central synced state
  const myCreatedGroups = customGroups.filter(g => 
    g.organizer === currentUser?.name || 
    g.organizer === masterOrder?.customer.name || 
    g.organizer === 'Xavier E.'
  );

  const myJoinedGroups = customGroups.filter(g => 
    joinedBatchIds.includes(g.batchId) && 
    g.organizer !== currentUser?.name && 
    g.organizer !== masterOrder?.customer.name && 
    g.organizer !== 'Xavier E.'
  );

  const [pendingInvitations, setPendingInvitations] = useState<any[]>([
    {
      batchId: 'GRP-DelftScholars',
      batchName: 'Delft Tech Scholars',
      occasion: 'Graduation Gala Wear',
      description: 'Custom Agbada and Senator wears for graduating master students.',
      currentMembers: 5,
      maxParticipants: 15,
      closingDate: 'September 10, 2026',
      deliveryWindow: 'September 28, 2026',
      status: 'Open',
      organizer: 'Grace E.'
    }
  ]);

  const [copiedGroupCode, setCopiedGroupCode] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [activeInviteGroupId, setActiveInviteGroupId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<CustomGroup | null>(null);

  const handleShareCode = (batchId: string) => {
    const inviteLink = `${window.location.origin}/?join=${batchId}`;
    navigator.clipboard.writeText(`Join our custom traditional outfit batch! Join link: ${inviteLink} (Code: ${batchId})`);
    setCopiedGroupCode(batchId);
    setTimeout(() => setCopiedGroupCode(null), 2000);
  };

  const handleLeaveGroup = (batchId: string) => {
    onLeaveCustomGroup(batchId);
  };

  const handleAcceptInvite = (group: CustomGroup) => {
    if (!joinedBatchIds.includes(group.batchId)) {
      onUpdateCustomGroup(group.batchId, { currentMembers: group.currentMembers + 1 });
      onSelectOrderContext({
        orderType: 'Group Member',
        batchId: group.batchId,
        batchName: group.batchName,
        organizer: group.organizer,
        deliveryWindow: group.deliveryWindow,
        currentMembers: group.currentMembers + 1,
        expectedParticipants: group.expectedParticipants,
        closingDate: group.closingDate
      });
    }
    setPendingInvitations(prev => prev.filter(g => g.batchId !== group.batchId));
  };

  const handleDeclineInvite = (batchId: string) => {
    setPendingInvitations(prev => prev.filter(g => g.batchId !== batchId));
  };

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteEmail.trim()) {
      alert(`Invitation sent to ${inviteEmail} for group ${activeInviteGroupId}!`);
      setInviteEmail('');
      setActiveInviteGroupId(null);
    }
  };

  // Sync profile editing fields with masterOrder changes (for different logged-in users)
  useEffect(() => {
    if (masterOrder) {
      setProfileName(masterOrder.customer.name);
      setProfileEmail(masterOrder.customer.email);
      setProfilePhone(masterOrder.customer.phone);
      setEditedMeasurements(masterOrder.measurements);
    }
  }, [masterOrder]);

  // Local states for fine-tuning active measurements
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
  const [editedMeasurements, setEditedMeasurements] = useState(
    masterOrder?.measurements || {
      height: 180,
      weight: 78,
      age: 32,
      bodyBuild: 'Average' as const,
      fitPreference: 'Standard' as const,
      neck: 16,
      shoulder: 18.5,
      chest: 41.5,
      waist: 36,
      hip: 39,
      sleeve: 24.5,
      trouserLength: 40,
      isAiEstimated: false
    }
  );

  const handleSaveProfile = () => {
    onUpdateProfile(profileName, profileEmail, profilePhone);
    setIsEditingProfile(false);
  };

  const handleSaveMeasurements = () => {
    onUpdateMeasurements(editedMeasurements);
    setIsEditingMeasurements(false);
  };

  // Detailed delivery tracking logs (Feature 4)
  const [showTrackingLogs, setShowTrackingLogs] = useState(false);

  // Digital Receipt modal state (Feature 3)
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  return (
    <div id="dashboard-view-container" className="space-y-12">
      {/* Welcome & Overview Row */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 text-white shadow-lg border border-heritage-gold/25">
        <div className="absolute right-0 bottom-0 translate-y-10 translate-x-10 opacity-5 text-[240px] pointer-events-none font-serif select-none">
          ⚜
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4 font-sans">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <img loading="lazy"
                  src={odogwuLogo}
                  alt="The Odogwu Heritage Logo"
                  className="w-10 h-10 rounded-full border border-heritage-gold/30 object-cover bg-heritage-forest shadow-sm"
                  referrerPolicy="no-referrer"
                />
                <span className="text-xs font-semibold uppercase tracking-widest text-heritage-gold font-display">
                  THE ODOGWU HERITAGE PASSPORT
                </span>
              </div>
              <button
                onClick={onLogout}
                className="text-[10px] bg-white/10 hover:bg-white/20 text-heritage-beige border border-white/10 px-3 py-1 rounded-xl font-bold uppercase tracking-wider transition duration-300 cursor-pointer"
              >
                Sign Out
              </button>
            </div>
            <h2 className="text-3xl sm:text-4xl font-display leading-none font-semibold">
              Welcome back,<br />
              <span id="db-profile-title" className="text-heritage-gold italic font-serif mt-1 block">
                {masterOrder?.customer.name || 'Xavier E.'}
              </span>
            </h2>
            <p className="text-xs text-heritage-beige max-w-sm">
              ASML Veldhoven Traditional Clothing Member. View your order progress and manage your custom measurements below.
            </p>
          </div>

          <div className="lg:col-span-5 bg-heritage-forest border border-heritage-gold/20 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-heritage-gold">
                Current Active Order
              </span>
              <span className="text-xs font-mono text-heritage-beige">
                {masterOrder ? masterOrder.shipment.trackingId : 'No active order'}
              </span>
            </div>

            {masterOrder ? (
              <div className="space-y-4 font-sans text-left">
                <div className="flex justify-between text-xs text-heritage-beige">
                  <span>Status: {masterOrder.shipment.status}</span>
                  <span className="font-semibold text-heritage-gold">
                    Step {masterOrder.shipment.currentStage} of 6
                  </span>
                </div>
                {/* Visual Progress Bar */}
                <div className="h-2 w-full bg-heritage-green rounded-full overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-heritage-gold transition-all duration-300"
                    style={{ width: `${(masterOrder.shipment.currentStage / 6) * 100}%` }}
                  ></div>
                </div>

                {/* Tracking Action Buttons */}
                <div className="flex justify-between items-center pt-2 border-t border-white/10">
                  <button
                    onClick={() => setShowTrackingLogs(!showTrackingLogs)}
                    className="flex items-center gap-1 text-[10px] text-heritage-beige/85 hover:text-white font-bold uppercase tracking-wider transition cursor-pointer"
                  >
                    <Clock size={11} className="text-heritage-gold" />
                    {showTrackingLogs ? 'Hide Live Logs' : 'View Hub Logs'}
                    {showTrackingLogs ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                  <span className="text-[10px] text-heritage-beige/75 font-medium italic flex items-center gap-1 select-none">
                    <Mail size={10} className="text-heritage-gold shrink-0" />
                    Updates sent to email
                  </span>
                </div>

                {/* Hub Logs Detail List */}
                {showTrackingLogs && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-3 max-h-56 overflow-y-auto pr-1">
                    {[
                      {
                        title: 'Delivered to B4 secure locker',
                        date: 'May 08, 2026',
                        loc: 'ASML Veldhoven (NL)',
                        step: 6,
                        desc: 'Locker B4-08 code ready for client pickup'
                      },
                      {
                        title: 'Cleared Customs at Schiphol',
                        date: 'May 05, 2026',
                        loc: 'Amsterdam Schiphol (AMS)',
                        step: 5,
                        desc: 'Cargo batch approved by Dutch custom officers'
                      },
                      {
                        title: 'Air Transit Hub Handoff',
                        date: 'May 02, 2026',
                        loc: 'Lagos Airport Cargo (LOS)',
                        step: 5,
                        desc: 'Dispatched via KLM Cargo flight KL588'
                      },
                      {
                        title: 'Passed 24-point QC Check',
                        date: 'Apr 28, 2026',
                        loc: 'Lagos Tailoring Hub',
                        step: 4,
                        desc: 'Stitching, drape, and hem compliance approved'
                      },
                      {
                        title: 'Embroidery & Assembly Finished',
                        date: 'Apr 24, 2026',
                        loc: 'NTCC Lagos Workshop',
                        step: 3,
                        desc: 'Intricate golden embroidery threads applied'
                      },
                      {
                        title: 'Measurements Calibrated',
                        date: 'Apr 18, 2026',
                        loc: 'Digital Verification System',
                        step: 2,
                        desc: 'Sizing validated against fabric weave shrink coefficients'
                      },
                      {
                        title: 'Fabric Secured from Cooperative',
                        date: 'Apr 15, 2026',
                        loc: 'Iseyin Weaver Coop (NG)',
                        step: 1,
                        desc: '50% deposit cleared to source premium thread'
                      }
                    ].map((log, i) => {
                      const isPast = log.step < masterOrder.shipment.currentStage;
                      const isCurrent = log.step === masterOrder.shipment.currentStage;
                      const isFuture = log.step > masterOrder.shipment.currentStage;

                      return (
                        <div key={i} className={`flex gap-2.5 items-start text-[11px] leading-snug transition-opacity ${isFuture ? 'opacity-35' : 'opacity-100'}`}>
                          <div className="flex flex-col items-center mt-1 shrink-0">
                            <div className={`h-2.5 w-2.5 rounded-full border border-white/20 ${
                              isCurrent ? 'bg-heritage-gold ring-4 ring-heritage-gold/25 animate-pulse' :
                              isPast ? 'bg-emerald-500' : 'bg-white/10'
                            }`} />
                          </div>
                          <div className="space-y-1 w-full">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className={`font-semibold text-xs ${isCurrent ? 'text-heritage-gold' : isPast ? 'text-white' : 'text-white/50'}`}>
                                {log.title}
                              </span>
                              <span className="text-[9px] font-mono text-heritage-beige/50 shrink-0">{log.date}</span>
                            </div>
                            <p className="text-[10px] text-heritage-beige/75 leading-normal">{log.desc}</p>
                            <span className="inline-block text-[8px] bg-white/10 text-heritage-beige px-1.5 py-0.5 rounded font-mono">
                              {log.loc}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-heritage-beige/70 italic text-center py-4">
                No active order in the current group. Go to the Design Studio to create your custom outfit.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Grid containing Profile & Sizing detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column */}
        <div className="lg:col-span-8 space-y-8 font-sans">
          
          {/* BATCH TIMELINE SECTION */}
          {(() => {
            // Find the most relevant batch the user is in. For now, we take the first joined batch or an active one.
            const userBatchId = joinedBatchIds.length > 0 ? joinedBatchIds[0] : (masterOrder?.customGroupCode);
            const userBatch = batches.find(b => b.id === userBatchId) || batches.find(b => ['Production Started', 'Open', 'Almost Full'].includes(b.status));

            if (!userBatch) return null;

            return (
              <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex justify-between items-center border-b pb-4 border-gray-100">
                  <div className="flex items-center gap-3">
                    <Clock className="text-heritage-gold" size={18} />
                    <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                      Batch Timeline
                    </h3>
                  </div>
                  <span className="text-xs font-bold text-heritage-gold uppercase bg-heritage-gold/10 px-3 py-1 rounded-full">
                    {userBatch.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Current Batch</span>
                    <strong className="text-lg text-heritage-green block">{userBatch.name}</strong>
                    <span className="text-xs text-gray-600 block mt-1">Target: {userBatch.targetGarments} Garments</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Timeline</span>
                    <strong className="text-sm text-heritage-green block">{userBatch.duration}</strong>
                    <span className="text-xs text-gray-600 block mt-1">Expected Delivery: {userBatch.estimatedDelivery || 'TBD'}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-semibold text-gray-600">Batch Progress ({userBatch.currentGarments} / {userBatch.targetGarments} Garments)</span>
                    {userBatch.status === 'Production Started' && (
                      <span className="text-[10px] bg-heritage-green text-white px-2 py-0.5 rounded font-bold animate-pulse">
                        Production Started
                      </span>
                    )}
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${userBatch.status === 'Production Started' ? 'bg-heritage-green' : 'bg-heritage-gold'} transition-all duration-500`}
                      style={{ width: `${Math.min(100, (userBatch.currentGarments / userBatch.targetGarments) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                    <span>{Math.round((userBatch.currentGarments / userBatch.targetGarments) * 100)}% Complete</span>
                    <span>{Math.max(0, userBatch.targetGarments - userBatch.currentGarments)} Garments Remaining</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Production Status</span>
                    <strong className="text-xs text-heritage-green">
                       {['Production Started', 'Quality Control', 'Packed', 'Shipped', 'Arrived Netherlands', 'Ready For Pickup', 'Collected', 'Completed'].includes(userBatch.status) ? userBatch.status : 'Awaiting Production'}
                    </strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Shipping Status</span>
                    <strong className="text-xs text-heritage-green">
                       {['Shipped', 'Arrived Netherlands', 'Ready For Pickup', 'Collected', 'Completed'].includes(userBatch.status) ? 'In Transit' : 'Pending'}
                    </strong>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Pickup Status</span>
                    <strong className="text-xs text-heritage-green">
                       {['Ready For Pickup', 'Collected', 'Completed'].includes(userBatch.status) ? userBatch.status : 'Pending Arrival'}
                    </strong>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* PROFILE CENTER */}
          <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b pb-4 border-gray-100">
              <div className="flex items-center gap-3">
                <User className="text-heritage-gold" size={18} />
                <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                  My Contact Info
                </h3>
              </div>
              <button
                id="btn-edit-profile-toggle"
                onClick={() => {
                  if (isEditingProfile) {
                    handleSaveProfile();
                  } else {
                    setIsEditingProfile(true);
                  }
                }}
                className="text-xs font-bold text-heritage-gold hover:underline cursor-pointer"
              >
                {isEditingProfile ? 'Save Profile' : 'Edit Profile'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="h-20 w-20 rounded-full bg-heritage-green flex items-center justify-center text-white text-xl font-bold font-serif border-2 border-heritage-gold shrink-0 shadow-inner">
                {profileName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || 'XE'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs w-full">
                <div className="space-y-1">
                  <span className="text-heritage-ink/50 text-[9px] uppercase tracking-wider block">
                    Full Name
                  </span>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={profileName}
                      onChange={e => setProfileName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-heritage-cream border border-heritage-gold/30 rounded-lg text-heritage-green font-bold focus:outline-none"
                    />
                  ) : (
                    <strong className="text-heritage-green text-sm block py-1">
                      {profileName}
                    </strong>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-heritage-ink/50 text-[9px] uppercase tracking-wider block">
                    ASML Email
                  </span>
                  {isEditingProfile ? (
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={e => setProfileEmail(e.target.value)}
                      className="w-full px-3 py-1.5 bg-heritage-cream border border-heritage-gold/30 rounded-lg text-heritage-green font-bold focus:outline-none"
                    />
                  ) : (
                    <strong className="text-heritage-green text-sm block py-1 font-mono">
                      {profileEmail}
                    </strong>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-heritage-ink/50 text-[9px] uppercase tracking-wider block">
                    Phone Number
                  </span>
                  {isEditingProfile ? (
                    <input
                      type="text"
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-heritage-cream border border-heritage-gold/30 rounded-lg text-heritage-green font-bold focus:outline-none font-mono"
                    />
                  ) : (
                    <strong className="text-heritage-green text-sm block py-1 font-mono">
                      {profilePhone}
                    </strong>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-heritage-ink/50 text-[9px] uppercase tracking-wider block">
                    Delivery Location
                  </span>
                  <strong className="text-heritage-green text-sm block py-1 flex items-center gap-1">
                    <MapPin size={12} className="text-heritage-gold" /> ASML Campus Veldhoven (NL)
                  </strong>
                </div>
              </div>
            </div>
          </section>

          {/* MEASUREMENT METRICS */}
          <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex justify-between items-center border-b pb-4 border-gray-100">
              <div className="flex items-center gap-3">
                <ClipboardList className="text-heritage-gold" size={18} />
                <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                  My Sizes
                </h3>
              </div>
              <button
                id="btn-edit-measurements-toggle"
                onClick={() => {
                  if (isEditingMeasurements) {
                    handleSaveMeasurements();
                  } else {
                    setIsEditingMeasurements(true);
                  }
                }}
                className="text-xs font-bold text-heritage-gold hover:underline"
              >
                {isEditingMeasurements ? 'Save Changes' : 'Fine-Tune Sizes'}
              </button>
            </div>

            {/* Profile factors */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-heritage-cream p-4 rounded-2xl border border-heritage-gold/10 text-xs">
              <div>
                <span className="text-[9px] text-heritage-ink/50 block uppercase">Height</span>
                <strong className="text-heritage-green">{editedMeasurements.height} cm</strong>
              </div>
              <div>
                <span className="text-[9px] text-heritage-ink/50 block uppercase">Weight</span>
                <strong className="text-heritage-green">{editedMeasurements.weight} kg</strong>
              </div>
              <div>
                <span className="text-[9px] text-heritage-ink/50 block uppercase">Age</span>
                <strong className="text-heritage-green">{editedMeasurements.age} yrs</strong>
              </div>
              <div>
                <span className="text-[9px] text-heritage-ink/50 block uppercase">Body Build</span>
                <strong className="text-heritage-green">{editedMeasurements.bodyBuild}</strong>
              </div>
              <div>
                <span className="text-[9px] text-heritage-ink/50 block uppercase">Fit Preference</span>
                <strong className="text-heritage-green">{editedMeasurements.fitPreference}</strong>
              </div>
            </div>

            {/* Detailed measurements grids */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              {[
                { label: 'Neck Size', key: 'neck', unit: 'in' },
                { label: 'Shoulders', key: 'shoulder', unit: 'in' },
                { label: 'Chest Size', key: 'chest', unit: 'in' },
                { label: 'Waist Size', key: 'waist', unit: 'in' },
                { label: 'Hip Size', key: 'hip', unit: 'in' },
                { label: 'Sleeve Length', key: 'sleeve', unit: 'in' },
                { label: 'Trouser Length', key: 'trouserLength', unit: 'in' }
              ].map(item => {
                const val = editedMeasurements[item.key as keyof typeof editedMeasurements];
                return (
                  <div key={item.key} className="p-4 rounded-xl border border-gray-150 bg-white shadow-sm space-y-1">
                    <span className="text-heritage-ink/60 text-[10px] block font-medium">
                      {item.label}
                    </span>
                    {isEditingMeasurements ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number"
                          step="0.5"
                          value={val as number}
                          onChange={e => {
                            setEditedMeasurements(prev => ({
                              ...prev,
                              [item.key]: parseFloat(e.target.value) || 0
                            }));
                          }}
                          className="w-20 px-2 py-1 bg-heritage-cream border border-heritage-gold/30 rounded focus:outline-none font-bold text-heritage-green text-xs"
                        />
                        <span className="text-[10px] text-heritage-ink/50">{item.unit}</span>
                      </div>
                    ) : (
                      <strong className="text-sm font-serif text-heritage-green font-bold block mt-1">
                        {val} {item.unit}
                      </strong>
                    )}
                  </div>
                );
              })}
            </div>

            {/* AI Fit Advisory Feedback Panel (Feature 2) */}
            <div className="mt-6 pt-5 border-t border-gray-100 space-y-3 text-left">
              <div className="flex items-center gap-1.5 text-heritage-gold font-serif">
                <Sparkles size={16} className="text-heritage-gold shrink-0" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-heritage-green">
                  NTCC Master Tailor Fit Assessment
                </h4>
                <span className="bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/30 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest font-mono">
                  {editedMeasurements.isAiEstimated ? 'AI Predicted Profile' : 'Verified Tailor Specs'}
                </span>
              </div>
              
              <div className="bg-heritage-cream/40 border border-heritage-gold/15 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Visual silhouette summary */}
                <div className="space-y-1 bg-white p-3 rounded-xl border border-gray-150 shadow-sm text-left">
                  <span className="text-[9px] uppercase tracking-wider text-heritage-ink/40 font-bold block">
                    Silhouette Blueprint
                  </span>
                  <strong className="text-heritage-green font-serif text-sm block">
                    {editedMeasurements.fitPreference === 'Slim/Executive' ? 'Executive Slim Drop' : 
                     editedMeasurements.fitPreference === 'Relaxed' ? 'Classic Generous Drape' : 'Balanced Senator Cut'}
                  </strong>
                  <p className="text-[10px] text-heritage-ink/75 leading-normal mt-1 font-medium">
                    {editedMeasurements.fitPreference === 'Slim/Executive' 
                      ? 'Tapered chest-to-waist drop highlighting clean lines for high-profile business panels.'
                      : editedMeasurements.fitPreference === 'Relaxed' 
                      ? 'Traditional roomy silhouette maximizing aeration and comfort, ideal for community celebrations.'
                      : 'The iconic modern Nigerian corporate cut with standard ease allowing excellent ease of motion.'}
                  </p>
                </div>

                {/* Frame alignment check */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-1.5 text-heritage-green font-semibold text-[11px]">
                    <Check size={12} className="text-emerald-600 shrink-0" />
                    <span>Collar Frame Alignment</span>
                  </div>
                  <p className="text-[10px] text-heritage-ink/70 leading-relaxed pl-3.5 font-medium">
                    Neck size <strong className="text-heritage-green">{editedMeasurements.neck}"</strong> is optimally proportioned for a Mandarin collar. Includes a standard <strong className="text-heritage-green">0.5"</strong> ease allowance so you can breathe comfortably without loose gapping.
                  </p>
                </div>

                {/* Proportion analysis */}
                <div className="space-y-1.5 text-left">
                  <div className="flex items-center gap-1.5 text-heritage-green font-semibold text-[11px]">
                    <Check size={12} className="text-emerald-600 shrink-0" />
                    <span>Sleeve to Length Ratio</span>
                  </div>
                  <p className="text-[10px] text-heritage-ink/70 leading-relaxed pl-3.5 font-medium">
                    Sleeve length <strong className="text-heritage-green">{editedMeasurements.sleeve}"</strong> aligns with your shoulders to hang crisply at the wristbone, displaying watches and bracelets perfectly below traditional Senator cuffs.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ORDER HISTORY REGISTRY */}
          <section className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center gap-3 border-b pb-4 border-gray-100">
              <History className="text-heritage-gold" size={18} />
              <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                Past Orders
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-heritage-beige text-heritage-ink/60 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="pb-3">Order ID</th>
                    <th className="pb-3">Style & fabric</th>
                    <th className="pb-3">Date Placed</th>
                    <th className="pb-3">Total</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historicalOrders.map(order => (
                    <tr key={order.id} className="hover:bg-heritage-cream/20 transition">
                      <td className="py-4 font-mono font-bold text-heritage-green">
                        {order.id}
                      </td>
                      <td className="py-4">
                        <span className="font-serif font-bold text-heritage-green block">
                          {order.styleName}
                        </span>
                        <span className="text-[10px] text-heritage-ink/50 block font-mono">
                          {order.fabricCode} — {order.fabricName} ({order.garmentType})
                        </span>
                      </td>
                      <td className="py-4 text-heritage-ink/75">
                        {order.date}
                      </td>
                      <td className="py-4 font-semibold text-heritage-green font-mono">
                        €{order.amount.toFixed(2)}
                      </td>
                      <td className="py-4">
                        <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
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
                          onClick={() => onReorder(order.styleName.toLowerCase().replace(/\s+/g, '-'), order.fabricCode)}
                          className="px-2.5 py-1 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition rounded-lg text-[9px] font-bold uppercase cursor-pointer"
                        >
                          Reorder Set
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* MY GROUPS MANAGEMENT SECTION */}
          <section id="my-groups-management" className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b pb-4 border-gray-100">
              <div className="flex items-center gap-3">
                <Users className="text-heritage-gold" size={18} />
                <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                  My Groups
                </h3>
              </div>
              <button
                onClick={() => onNavigateToTab('custom-order')}
                className="bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white transition py-1.5 px-3 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer"
              >
                Create or Join New Group
              </button>
            </div>

            {/* Groups I Created */}
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase font-bold text-heritage-gold tracking-widest text-left font-sans">
                Groups I Created (Organizer)
              </h4>
              {myCreatedGroups.length === 0 ? (
                <p className="text-xs text-heritage-ink/50 italic text-left font-sans">You have not created any groups yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myCreatedGroups.map(group => {
                    const getStatusColor = (status: string) => {
                      switch (status) {
                        case 'Draft': return 'bg-gray-50 text-gray-700 border-gray-200';
                        case 'Open': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
                        case 'Almost Full': return 'bg-amber-50 text-amber-800 border-amber-200';
                        case 'Full': return 'bg-orange-50 text-orange-800 border-orange-200';
                        case 'Closed': return 'bg-stone-50 text-stone-700 border-stone-200';
                        case 'Locked': return 'bg-indigo-50 text-indigo-800 border-indigo-200';
                        case 'Completed': return 'bg-heritage-cream text-heritage-green border-heritage-gold/30';
                        default: return 'bg-gray-50 text-gray-700 border-gray-200';
                      }
                    };

                    const canEdit = group.status === 'Draft' || group.status === 'Open';
                    const canInvite = group.status === 'Draft' || group.status === 'Open' || group.status === 'Almost Full';
                    const canDelete = group.status === 'Draft';
                    const canClose = group.status === 'Open' || group.status === 'Almost Full';

                    return (
                      <div key={group.batchId} className="border border-heritage-gold/20 rounded-2xl p-4 bg-heritage-cream/10 space-y-3 relative text-left flex flex-col justify-between font-sans">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-1">
                            <div>
                              <h5 className="font-serif font-bold text-heritage-green text-sm">{group.batchName}</h5>
                              <span className="text-[9px] text-heritage-ink/50 font-mono block">Code: {group.batchId}</span>
                              <span className="text-[8px] uppercase tracking-wider font-bold text-heritage-gold">{group.visibility} Group</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border shrink-0 ${getStatusColor(group.status)}`}>
                              {group.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-heritage-ink/70 leading-relaxed font-medium">{group.description}</p>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-gray-100 pt-2 text-heritage-ink/75">
                            <div>
                              <span className="text-[8px] text-heritage-ink/40 block uppercase">Member Count</span>
                              <strong>{group.currentMembers} / {group.maxParticipants} Joined</strong>
                            </div>
                            <div>
                              <span className="text-[8px] text-heritage-ink/40 block uppercase">Estimated Delivery</span>
                              <strong className="text-heritage-green">{group.deliveryWindow}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-gray-100 font-sans">
                          {/* Main Actions */}
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                onSelectOrderContext({
                                  orderType: 'Group Organizer',
                                  batchId: group.batchId,
                                  batchName: group.batchName,
                                  organizer: group.organizer,
                                  deliveryWindow: group.deliveryWindow,
                                  currentMembers: group.currentMembers,
                                  expectedParticipants: group.expectedParticipants,
                                  closingDate: group.closingDate
                                });
                              }}
                              className="flex-1 py-1 px-1.5 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer font-sans"
                            >
                              Launch Studio
                            </button>
                            
                            {canInvite && (
                              <>
                                <button
                                  onClick={() => setActiveInviteGroupId(group.batchId)}
                                  className="py-1 px-2 border border-heritage-green text-heritage-green hover:bg-heritage-cream text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 font-sans"
                                  title="Invite Members"
                                >
                                  <UserPlus size={10} /> Invite
                                </button>
                                <button
                                  onClick={() => handleShareCode(group.batchId)}
                                  className="px-2 py-1 bg-heritage-cream hover:bg-heritage-gold/20 text-heritage-green rounded-lg transition flex items-center justify-center cursor-pointer"
                                  title="Copy Invite Link"
                                >
                                  <Share2 size={11} />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Administrative Actions */}
                          <div className="flex gap-1 justify-end text-[9px] text-heritage-ink/50 font-sans font-bold pt-1">
                            {canEdit && (
                              <button
                                onClick={() => setEditingGroup(group)}
                                className="px-2 py-0.5 hover:text-heritage-green border border-gray-150 rounded hover:bg-gray-50 flex items-center gap-0.5 cursor-pointer"
                              >
                                <Edit2 size={8} /> Edit
                              </button>
                            )}
                            {canClose && (
                              <button
                                onClick={() => {
                                  onUpdateCustomGroup(group.batchId, { status: 'Closed' });
                                }}
                                className="px-2 sm:py-0.5 min-h-[44px] sm:min-h-[24px] hover:text-amber-700 border border-gray-150 rounded hover:bg-gray-50 flex items-center gap-0.5 cursor-pointer"
                              >
                                <Clock size={8} /> Close
                              </button>
                            )}
                            {canDelete && (
                              <button
                                onClick={() => {
                                  onDeleteCustomGroup(group.batchId);
                                }}
                                className="px-2 sm:py-0.5 min-h-[44px] sm:min-h-[24px] text-red-600 hover:bg-red-50 border border-red-100 rounded flex items-center gap-0.5 cursor-pointer"
                              >
                                <Trash2 size={8} /> Delete
                              </button>
                            )}
                          </div>
                        </div>

                        {copiedGroupCode === group.batchId && (
                          <div className="absolute top-2 right-2 bg-heritage-green text-white text-[9px] px-2 py-1 rounded shadow-md font-sans">
                            Invite Copied!
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Groups I Joined */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[10px] uppercase font-bold text-heritage-gold tracking-widest text-left font-sans">
                Groups I Joined
              </h4>
              {myJoinedGroups.length === 0 ? (
                <p className="text-xs text-heritage-ink/50 italic text-left">You have not joined any groups yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
                  {myJoinedGroups.map(group => {
                    const getStatusColor = (status: string) => {
                      switch (status) {
                        case 'Draft': return 'bg-gray-50 text-gray-700 border-gray-200';
                        case 'Open': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
                        case 'Almost Full': return 'bg-amber-50 text-amber-800 border-amber-200';
                        case 'Full': return 'bg-orange-50 text-orange-800 border-orange-200';
                        case 'Closed': return 'bg-stone-50 text-stone-700 border-stone-200';
                        case 'Locked': return 'bg-indigo-50 text-indigo-800 border-indigo-200';
                        case 'Completed': return 'bg-heritage-cream text-heritage-green border-heritage-gold/30';
                        default: return 'bg-gray-50 text-gray-700 border-gray-200';
                      }
                    };

                    const canLeave = group.status !== 'Locked' && group.status !== 'Completed';

                    return (
                      <div key={group.batchId} className="border border-heritage-gold/15 rounded-2xl p-4 bg-heritage-cream/10 space-y-3 relative text-left flex flex-col justify-between font-sans">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-serif font-bold text-heritage-green text-sm">{group.batchName}</h5>
                              <span className="text-[9px] text-heritage-ink/50 font-mono block">Organizer: {group.organizer}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getStatusColor(group.status)}`}>
                              {group.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-heritage-ink/70 leading-relaxed font-medium mt-1">{group.description}</p>
                          
                          <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-gray-100 pt-2 text-heritage-ink/75 mt-2">
                            <div>
                              <span className="text-[8px] text-heritage-ink/40 block uppercase">Member Count</span>
                              <strong>{group.currentMembers} Joined</strong>
                            </div>
                            <div>
                              <span className="text-[8px] text-heritage-ink/40 block uppercase">Estimated Delivery</span>
                              <strong className="text-heritage-green">{group.deliveryWindow}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2 border-t border-gray-100 mt-2 font-sans">
                          <button
                            onClick={() => {
                              onSelectOrderContext({
                                orderType: 'Group Member',
                                batchId: group.batchId,
                                batchName: group.batchName,
                                organizer: group.organizer,
                                deliveryWindow: group.deliveryWindow,
                                currentMembers: group.currentMembers,
                                expectedParticipants: group.expectedParticipants,
                                closingDate: group.closingDate
                              });
                            }}
                            className="flex-1 py-1.5 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer font-sans"
                          >
                            Launch Studio
                          </button>
                          
                          {canLeave && (
                            <button
                              onClick={() => handleLeaveGroup(group.batchId)}
                              className="py-1.5 px-3 border border-red-200 text-red-600 hover:bg-red-50 text-[9px] font-bold uppercase rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 font-sans"
                            >
                              <LogOut size={10} /> Leave Group
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[10px] uppercase font-bold text-heritage-gold tracking-widest text-left font-sans">
                Pending Invitations
              </h4>
              {pendingInvitations.length === 0 ? (
                <p className="text-xs text-heritage-ink/50 italic text-left font-sans">No pending invitations.</p>
              ) : (
                <div className="space-y-3 font-sans font-sans">
                  {pendingInvitations.map(inv => (
                    <div key={inv.batchId} className="border border-amber-200 bg-amber-50/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left font-sans">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-sans font-sans">
                          <h5 className="font-serif font-bold text-heritage-green text-sm">{inv.batchName}</h5>
                          <span className="text-[8px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-sans font-sans">
                            Invite
                          </span>
                        </div>
                        <p className="text-[10px] text-heritage-ink/70">
                          Organizer: <strong>{inv.organizer}</strong> &mdash; occasion: {inv.occasion}
                        </p>
                        <p className="text-[9px] text-heritage-ink/50 italic font-sans font-sans">{inv.description}</p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto shrink-0 font-sans font-sans">
                        <button
                          onClick={() => handleAcceptInvite(inv)}
                          className="flex-1 sm:flex-initial py-1 px-3 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white text-[10px] font-bold uppercase rounded-lg transition cursor-pointer font-sans"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineInvite(inv.batchId)}
                          className="flex-1 sm:flex-initial py-1 px-3 border border-gray-200 hover:bg-gray-50 text-heritage-ink text-[10px] font-bold uppercase rounded-lg transition cursor-pointer font-sans font-sans"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Simple Invite Members Modal */}
            {activeInviteGroupId && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans font-sans">
                <div className="bg-white rounded-3xl border border-heritage-gold/25 p-6 w-full max-w-sm space-y-4 shadow-2xl relative text-left font-sans font-sans">
                  <button
                    onClick={() => setActiveInviteGroupId(null)}
                    className="absolute top-4 right-4 text-heritage-ink/50 hover:text-heritage-green cursor-pointer font-sans"
                  >
                    <X size={16} />
                  </button>
                  <div className="space-y-1 font-sans">
                    <h4 className="font-serif font-bold text-heritage-green text-base">Invite Members</h4>
                    <p className="text-[10px] text-heritage-ink/60 font-sans font-sans">Send an invitation email or share the code: <strong className="text-heritage-gold font-mono">{activeInviteGroupId}</strong></p>
                  </div>
                  <form onSubmit={handleSendInvite} className="space-y-3 font-sans">
                    <input
                      type="email"
                      required
                      placeholder="colleague@asml-corp.nl"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl text-xs focus:outline-none focus:border-heritage-gold text-heritage-green font-sans font-sans"
                    />
                    <button
                      type="submit"
                      className="w-full py-2 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white font-bold uppercase tracking-wider rounded-xl text-[10px] transition cursor-pointer font-sans"
                    >
                      Send Invitation
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Edit Batch Modal */}
            {editingGroup && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
                <div className="bg-white rounded-3xl border border-heritage-gold/25 p-6 w-full max-w-md space-y-4 shadow-2xl relative text-left">
                  <button
                    onClick={() => setEditingGroup(null)}
                    className="absolute top-4 right-4 text-heritage-ink/50 hover:text-heritage-green cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                  <div className="space-y-1">
                    <h4 className="font-serif font-bold text-heritage-green text-base">Edit Batch Details</h4>
                    <p className="text-[10px] text-heritage-ink/60 font-sans">Modify settings or status for batch <strong>{editingGroup.batchId}</strong>.</p>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onUpdateCustomGroup(editingGroup.batchId, editingGroup);
                      setEditingGroup(null);
                    }}
                    className="space-y-3 text-xs"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Batch Name</label>
                      <input
                        type="text"
                        required
                        value={editingGroup.batchName}
                        onChange={e => setEditingGroup({ ...editingGroup, batchName: e.target.value })}
                        className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Occasion</label>
                      <input
                        type="text"
                        required
                        value={editingGroup.occasion}
                        onChange={e => setEditingGroup({ ...editingGroup, occasion: e.target.value })}
                        className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Description</label>
                      <textarea
                        rows={2}
                        value={editingGroup.description}
                        onChange={e => setEditingGroup({ ...editingGroup, description: e.target.value })}
                        className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-heritage-ink/60">City</label>
                        <input
                          type="text"
                          required
                          value={editingGroup.city}
                          onChange={e => setEditingGroup({ ...editingGroup, city: e.target.value })}
                          className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Max Participants</label>
                        <input
                          type="number"
                          required
                          min={editingGroup.currentMembers}
                          value={editingGroup.maxParticipants}
                          onChange={e => setEditingGroup({ ...editingGroup, maxParticipants: parseInt(e.target.value) || 10 })}
                          className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Status</label>
                        <select
                          value={editingGroup.status}
                          onChange={e => setEditingGroup({ ...editingGroup, status: e.target.value as 'Draft' | 'Open' | 'Almost Full' | 'Full' | 'Closed' | 'Locked' | 'Completed' })}
                          className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green font-semibold"
                        >
                          <option value="Draft">Draft</option>
                          <option value="Open">Open</option>
                          <option value="Almost Full">Almost Full</option>
                          <option value="Full">Full</option>
                          <option value="Closed">Closed</option>
                          <option value="Locked">Locked</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Visibility</label>
                        <select
                          value={editingGroup.visibility}
                          onChange={e => setEditingGroup({ ...editingGroup, visibility: e.target.value as 'Private' | 'Public' })}
                          className="w-full px-3 py-2 bg-heritage-cream/20 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold text-heritage-green"
                        >
                          <option value="Public">Public (Discoverable)</option>
                          <option value="Private">Private (Invite-Only)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white font-bold uppercase tracking-wider rounded-xl text-[10px] transition cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </form>
                </div>
              </div>
            )}
          </section>
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
                  <span>Style Price:</span>
                  <span className="text-heritage-green font-bold">
                    €{masterOrder.style.basePrice.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Tailoring Fee:</span>
                  <span className="text-heritage-green font-bold">
                    €{masterOrder.garment.tailoringFee.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Fabric Price Multiplier:</span>
                  <span className="text-heritage-green font-mono">
                    x{masterOrder.fabric.priceMultiplier}
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
                  Your payment for <strong>{masterOrder.batchName || 'Community Batch'}</strong> was logged on {masterOrder.payment.date}.
                </p>
              </div>

              <div className="p-3 bg-heritage-cream/40 border border-heritage-gold/25 text-heritage-ink text-[10px] rounded-xl flex items-start gap-2 text-left">
                <Mail size={14} className="text-heritage-gold shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Corporate Email Tracking Active:</strong> You will automatically receive real-time shipment progress, customs clearance, and locker courier codes directly to your inbox.
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
                <strong>1. Locker Notification:</strong> Once the shipment is delivered, we will email you the locker code.
              </p>
              <p>
                <strong>2. Locker Location:</strong> The lockers are in <strong>ASML Building 4, Ground Level East Wing</strong>.
              </p>
              <p>
                <strong>3. Fitting & Adjustments:</strong> You can try on your clothes right away at our campus fitting area. If you need any adjustments, let us know within 7 days.
              </p>
            </div>
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
            <div className="p-8 space-y-6 text-left relative overflow-hidden" id="printable-receipt">
              {/* Giant background faint crest (for print authenticity) */}
              <div className="absolute right-0 bottom-0 translate-y-16 translate-x-16 opacity-3 text-[300px] pointer-events-none font-serif select-none">
                ⚜
              </div>

              {/* Top Banner */}
              <div className="flex justify-between items-start border-b-2 border-heritage-green pb-5">
                <div>
                  <div className="flex items-center gap-1 text-heritage-green">
                    <span className="text-xl font-serif font-bold tracking-tight">N.T.C.C. Veldhoven</span>
                  </div>
                  <p className="text-[10px] text-heritage-ink/60 mt-0.5 leading-snug max-w-xs uppercase font-bold tracking-wider">
                    Nigerian Traditional Clothing Community Buy<br />
                    ASML Veldhoven Chapter — Est. 2024
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                    Escrow Paid & Active
                  </span>
                  <p className="text-[10px] font-mono text-heritage-ink/50 mt-1.5 font-bold">
                    Invoice ID: <span className="text-heritage-green font-semibold">INV-{selectedReceipt.id || selectedReceipt.shipment?.trackingId || 'TRK-2026-X1'}</span>
                  </p>
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-6 text-[11px] border-b pb-5 border-gray-100 font-sans">
                <div className="space-y-1 text-left">
                  <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">Billed To (Client Member)</span>
                  <strong className="text-heritage-green block text-xs">{selectedReceipt.customer?.name || profileName}</strong>
                  <span className="text-heritage-ink/70 block font-mono font-medium">{selectedReceipt.customer?.email || profileEmail}</span>
                  <span className="text-heritage-ink/70 block font-mono font-medium">{selectedReceipt.customer?.phone || profilePhone}</span>
                  <span className="text-heritage-ink/50 block italic">ASML Veldhoven Campus Delivery</span>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">Escrow Ledger details</span>
                  <span className="text-heritage-ink/70 block"><strong>Cohort Group:</strong> {selectedReceipt.batchName || 'Community Batch'}</span>
                  <span className="text-heritage-ink/70 block"><strong>Payment Method:</strong> SEPA Bank Transfer</span>
                  <span className="text-heritage-ink/70 block"><strong>Transaction Date:</strong> {selectedReceipt.payment?.date || selectedReceipt.date || 'April 15, 2026'}</span>
                  <span className="text-heritage-ink/70 block"><strong>Locker Location:</strong> {selectedReceipt.batchType === 'alone' ? 'Direct priority home shipping' : 'ASML Building 4 Ground level'}</span>
                </div>
              </div>

              {/* Custom specs breakdown */}
              <div className="space-y-2">
                <span className="text-heritage-ink/50 text-[9px] uppercase font-bold tracking-wider block">Garment Specifications & Custom Tailoring</span>
                <div className="border border-heritage-gold/20 rounded-2xl bg-heritage-cream/15 p-4 space-y-3 text-xs font-sans text-left">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <div>
                      <strong className="text-heritage-green text-sm font-serif">{selectedReceipt.styleName || selectedReceipt.style?.name || 'Traditional Senator Suit'}</strong>
                      <span className="text-[10px] text-heritage-ink/50 block font-mono mt-0.5">
                        Fabric: {selectedReceipt.fabricCode || selectedReceipt.fabric?.code} — {selectedReceipt.fabricName || selectedReceipt.fabric?.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono bg-heritage-green/10 text-heritage-green px-2 py-0.5 rounded-md font-semibold">
                        {selectedReceipt.garmentType || selectedReceipt.garment?.type || 'Full 2-Piece Set'}
                      </span>
                    </div>
                  </div>

                  {/* Design Choices (if available) */}
                  {selectedReceipt.design && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[10px] text-heritage-ink/75 border-b border-gray-100 pb-2 text-left">
                      <div>Collar Style: <strong className="text-heritage-green">{selectedReceipt.design.collar}</strong></div>
                      <div>Embroidery Pattern: <strong className="text-heritage-green">{selectedReceipt.design.embroidery}</strong></div>
                      <div>Sleeve Design: <strong className="text-heritage-green">{selectedReceipt.design.sleeve}</strong></div>
                      <div>Pockets: <strong className="text-heritage-green">{selectedReceipt.design.pocket}</strong></div>
                      <div>Hem Finish: <strong className="text-heritage-green">{selectedReceipt.design.hemFinish}</strong></div>
                      <div>Agbada Cap: <strong className="text-heritage-green">{selectedReceipt.design.additionalCap ? 'Included' : 'None'}</strong></div>
                    </div>
                  )}

                  {/* Sizing Blueprint summary */}
                  <div className="text-[10px] text-heritage-ink/70 space-y-1 text-left">
                    <span className="font-bold text-heritage-green">Tailor Sizing Vector:</span>
                    <p className="font-mono bg-white p-2.5 rounded-lg border border-gray-150 tracking-wide leading-relaxed text-[11px] font-semibold text-heritage-green">
                      HT: {selectedReceipt.measurements?.height || editedMeasurements.height}cm | 
                      WT: {selectedReceipt.measurements?.weight || editedMeasurements.weight}kg | 
                      NK: {selectedReceipt.measurements?.neck || editedMeasurements.neck}" | 
                      SH: {selectedReceipt.measurements?.shoulder || editedMeasurements.shoulder}" | 
                      CH: {selectedReceipt.measurements?.chest || editedMeasurements.chest}" | 
                      WS: {selectedReceipt.measurements?.waist || editedMeasurements.waist}" | 
                      HP: {selectedReceipt.measurements?.hip || editedMeasurements.hip}" | 
                      SL: {selectedReceipt.measurements?.sleeve || editedMeasurements.sleeve}" | 
                      TR: {selectedReceipt.measurements?.trouserLength || editedMeasurements.trouserLength}"
                    </p>
                  </div>
                </div>
              </div>

              {/* Financial calculations */}
              <div className="border-t pt-4 space-y-2 font-sans text-left">
                <div className="flex justify-between text-[11px] text-heritage-ink/75">
                  <span>Custom Hand-Made Style base:</span>
                  <span className="font-bold text-heritage-green">€{(selectedReceipt.style?.basePrice || (selectedReceipt.amount || 320) * 0.65).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-heritage-ink/75">
                  <span>Premium Hand-Weave Fabric multiplier:</span>
                  <span className="font-mono text-heritage-green">x{selectedReceipt.fabric?.priceMultiplier || '1.1'}</span>
                </div>
                <div className="flex justify-between text-[11px] text-heritage-ink/75">
                  <span>Traditional Tailoring fees:</span>
                  <span className="font-bold text-heritage-green">€{(selectedReceipt.garment?.tailoringFee || (selectedReceipt.amount || 320) * 0.35).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-heritage-ink/75 border-b pb-2 border-gray-100">
                  <span>ASML Cohort Bulk Discount (12% Group Buy):</span>
                  <span className="text-emerald-700 font-semibold">-€{((selectedReceipt.payment?.subtotal || selectedReceipt.amount || 320) * 0.12).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-serif font-bold text-heritage-green pt-1">
                  <span className="text-sm">Total Custom Order Value:</span>
                  <span className="text-sm">€{(selectedReceipt.payment?.subtotal || selectedReceipt.amount || 320).toFixed(2)}</span>
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
                      €{(selectedReceipt.payment?.deposit || (selectedReceipt.amount || 320) * 0.5).toFixed(2)}
                    </strong>
                  </div>
                  <Check size={16} className="text-emerald-700 font-bold shrink-0" />
                </div>
                <div className="bg-heritage-cream border border-heritage-gold/20 p-3 rounded-xl flex justify-between items-center text-xs">
                  <div>
                    <span className="block text-[8px] uppercase font-bold text-heritage-ink/40 tracking-wider">
                      50% Balance Held in Escrow
                    </span>
                    <strong className="text-heritage-green text-sm font-serif">
                      €{(selectedReceipt.payment?.remaining || (selectedReceipt.amount || 320) * 0.5).toFixed(2)}
                    </strong>
                  </div>
                  <Shield size={16} className="text-heritage-gold shrink-0" />
                </div>
              </div>

              {/* Escrow note footer */}
              <div className="border-t border-gray-100 pt-4 text-[9px] text-heritage-ink/50 leading-relaxed font-sans text-center space-y-1.5">
                <p>
                  <strong>NIGERIAN TRADITIONAL CLOTHING ESCROW AGREEMENT:</strong> Handled securely by the NTCC board coordinator. The 50% deposit has been disbursed to our weaver cooperative in Iseyin to source raw fibers and spool loom threads. The remaining 50% balance is stored in escrow and will be unlocked for our tailors in Lagos upon the successful fitting session on-site at Veldhoven.
                </p>
                <p className="font-mono text-[8px]">
                  Authorized by Coordinator: Fredrick Ezeh | NTCC Veldhoven Ledger System | Secure Key: NTCC-ESCROW-{selectedReceipt.id || 'ACTIVE-G3'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
