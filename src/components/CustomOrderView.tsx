/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Shirt, Users, Calendar, ArrowRight, PlusCircle, Globe, Lock, MapPin, CheckCircle2 } from 'lucide-react';
import { CustomGroup, OrderContext, Batch } from '../types';
import { useAppStore } from '../store/useAppStore';

interface CustomOrderViewProps {
  customGroups: CustomGroup[];
  batches: Batch[];
  onCreateCustomGroup: (group: Omit<CustomGroup, 'batchId' | 'currentMembers' | 'organizer' | 'closingDate' | 'deliveryWindow'>) => void;
  onSelectOrderContext: (context: OrderContext) => void;
  currentUser?: { name: string; email?: string } | null;
  onJoinCustomGroup?: (batchId: string) => void;
}

export default function CustomOrderView({
  customGroups,
  batches,
  onCreateCustomGroup,
  onSelectOrderContext,
  currentUser,
  onJoinCustomGroup
}: CustomOrderViewProps) {
  // Option 2 Form state
  const businessSettings = useAppStore(state => state.businessSettings);

  const [batchName, setBatchName] = useState('');
  const [occasion, setOccasion] = useState('');
  const [description, setDescription] = useState('');
  const [country, setCountry] = useState(businessSettings.applicationSettings.defaultCountry || 'Netherlands');
  const [city, setCity] = useState('');
  const [preferredDeliveryMonth, setPreferredDeliveryMonth] = useState('August 2026');
  const [expectedParticipants, setExpectedParticipants] = useState(businessSettings.batchSettings.minParticipantsRequired);
  const [maxParticipants, setMaxParticipants] = useState(businessSettings.batchSettings.maxGarmentsPerBatch);
  const [visibility, setVisibility] = useState<'Private' | 'Public'>('Public');
  const [notes, setNotes] = useState('');
  const [saveAsDraft, setSaveAsDraft] = useState(false);

  // Form error & success states
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);

  // Filter active public groups for Option 3 list (only Open)
  const openBatches = batches.filter(b => b.visibility === 'Public' && b.status === 'Open');
  const publicGroups = customGroups.filter(g => g.visibility === 'Public' && (g.status === 'Open' || g.status === 'Almost Full'));

  const handleCreateGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!batchName.trim()) {
      setFormError('Please enter a Batch Name.');
      return;
    }
    if (!occasion.trim()) {
      setFormError('Please describe the Occasion.');
      return;
    }
    if (!city.trim()) {
      setFormError('Please enter a target City.');
      return;
    }

    // Call create group callback
    onCreateCustomGroup({
      batchName,
      occasion,
      description,
      country,
      city,
      preferredDeliveryMonth,
      expectedParticipants,
      maxParticipants,
      visibility,
      notes,
      status: saveAsDraft ? 'Draft' : 'Open'
    });

    setFormSuccess(true);
    setTimeout(() => {
      // Trigger redirect to design studio with newly created context
      onSelectOrderContext({
        orderType: 'Group Organizer',
        batchId: `GRP-${batchName.replace(/\s+/g, '')}`,
        batchName: batchName,
        organizer: currentUser?.name || 'Xavier E.',
        deliveryWindow: `Late ${preferredDeliveryMonth}`,
        expectedParticipants: expectedParticipants,
        currentMembers: 1,
        closingDate: 'August 15, 2026'
      });
    }, 1200);
  };

  const handleStartIndividualOrder = () => {
    onSelectOrderContext({
      orderType: 'Individual',
      deliveryWindow: 'Within 2-3 weeks (Express Air Priority)'
    });
  };

  const handleJoinExistingGroup = (group: CustomGroup) => {
    if (onJoinCustomGroup) {
      onJoinCustomGroup(group.batchId);
    }
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
  };

  return (
    <div id="custom-order-view-container" className="space-y-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      {/* Editorial Luxury Header Section */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 sm:p-12 lg:p-16 text-white shadow-xl border border-heritage-gold/20">
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute top-10 right-10 text-4xl text-heritage-gold/25 pointer-events-none font-serif">⚜</div>

        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs font-bold tracking-[0.25em] text-heritage-gold uppercase">
            Exclusive Custom Outfits
          </span>
          <h1 className="text-4xl sm:text-5xl font-display tracking-tight leading-tight">
            Tailor Your Perfect <span className="text-heritage-gold italic">Traditional Silhouette</span>
          </h1>
          <p className="text-sm text-heritage-beige leading-relaxed font-sans max-w-2xl">
            Choose how you would like to place your order. You can order individually, create your own group for others to join, or join an existing personalized group.
          </p>
        </div>
      </section>

      {/* Grid containing Options */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: OPTIONS 1 & 2 */}
        <div className="lg:col-span-7 space-y-12">
          
          {/* OPTION 1: INDIVIDUAL CUSTOM ORDER */}
          <section id="option-individual-order" className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center shrink-0">
                <Shirt size={22} className="text-heritage-gold" />
              </div>
              <div>
                <span className="text-[10px] text-heritage-gold font-bold tracking-wider uppercase block">
                  Option 1
                </span>
                <h3 className="text-xl font-serif font-bold text-heritage-green mt-0.5">
                  Individual Custom Order
                </h3>
              </div>
            </div>

            <p className="text-xs text-heritage-ink/75 leading-relaxed font-medium">
              Ideal for customers who want their garments produced independently without waiting for a community batch.
            </p>

            <div className="bg-heritage-cream/40 rounded-xl p-5 border border-heritage-gold/10 space-y-3">
              <span className="text-[10px] uppercase font-bold text-heritage-green tracking-wider block">
                Premium Benefits:
              </span>
              <ul className="text-xs text-heritage-ink/80 space-y-2 font-medium">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-heritage-gold shrink-0" />
                  <span><strong>Production starts immediately</strong> after measurements validation</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-heritage-gold shrink-0" />
                  <span><strong>Flexible delivery schedule</strong> with priority direct-to-home courier air transit</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-heritage-gold shrink-0" />
                  <span><strong>Premium one-to-one tailoring experience</strong> with dedicated Lagos master tailors</span>
                </li>
              </ul>
            </div>

            <button
              id="btn-start-individual-order"
              onClick={handleStartIndividualOrder}
              className="bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md flex items-center gap-2 cursor-pointer"
            >
              Start Individual Order <ArrowRight size={14} />
            </button>
          </section>

          {/* OPTION 2: CREATE YOUR OWN GROUP */}
          <section id="option-create-group" className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center shrink-0">
                <PlusCircle size={22} className="text-heritage-gold" />
              </div>
              <div>
                <span className="text-[10px] text-heritage-gold font-bold tracking-wider uppercase block">
                  Option 2
                </span>
                <h3 className="text-xl font-serif font-bold text-heritage-green mt-0.5">
                  Create Your Own Group
                </h3>
              </div>
            </div>

            <p className="text-xs text-heritage-ink/75 leading-relaxed font-medium">
              Create your own personalized batch that friends, family, church members, colleagues or other communities can join. The creator becomes the Batch Organizer.
            </p>

            <form onSubmit={handleCreateGroupSubmit} className="space-y-4 text-xs font-medium text-heritage-green">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-700 shrink-0" />
                  <span>Success! Group initialized. Loading Design Studio...</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Batch Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Niger State Gala Crew"
                    value={batchName}
                    onChange={e => setBatchName(e.target.value)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Occasion *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wedding, Cultural Day, Dinner"
                    value={occasion}
                    onChange={e => setOccasion(e.target.value)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Group Description</label>
                <textarea
                  rows={2}
                  placeholder="Tell potential members about the theme, fabric guidelines or purpose of this order batch..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold font-sans text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Country</label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none"
                  >
                    <option value="Netherlands">Netherlands</option>
                    <option value="Belgium">Belgium</option>
                    <option value="Germany">Germany</option>
                    <option value="Nigeria">Nigeria</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">City *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eindhoven"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Delivery Target</label>
                  <select
                    value={preferredDeliveryMonth}
                    onChange={e => setPreferredDeliveryMonth(e.target.value)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none"
                  >
                    <option value="July 2026">July 2026</option>
                    <option value="August 2026">August 2026</option>
                    <option value="September 2026">September 2026</option>
                    <option value="October 2026">October 2026</option>
                    <option value="December 2026">December 2026</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Expected Members</label>
                  <input
                    type="number"
                    min={businessSettings.batchSettings.minParticipantsRequired}
                    max={businessSettings.batchSettings.maxGarmentsPerBatch}
                    value={expectedParticipants}
                    onChange={e => setExpectedParticipants(parseInt(e.target.value) || businessSettings.batchSettings.minParticipantsRequired)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Max Capacity</label>
                  <input
                    type="number"
                    min={expectedParticipants}
                    max={businessSettings.batchSettings.maxGarmentsPerBatch}
                    value={maxParticipants}
                    onChange={e => setMaxParticipants(parseInt(e.target.value) || businessSettings.batchSettings.maxGarmentsPerBatch)}
                    className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Privacy Settings</label>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setVisibility('Public')}
                      className={`flex-1 py-1 px-2 border rounded-lg flex items-center justify-center gap-1 font-bold ${visibility === 'Public' ? 'bg-heritage-green text-white border-heritage-green' : 'bg-heritage-cream/30 text-heritage-ink/60 border-heritage-gold/20'}`}
                    >
                      <Globe size={11} /> Public
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('Private')}
                      className={`flex-1 py-1 px-2 border rounded-lg flex items-center justify-center gap-1 font-bold ${visibility === 'Private' ? 'bg-heritage-green text-white border-heritage-green' : 'bg-heritage-cream/30 text-heritage-ink/60 border-heritage-gold/20'}`}
                    >
                      <Lock size={11} /> Private
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-heritage-ink/60">Optional Notes / Requirements</label>
                <input
                  type="text"
                  placeholder="e.g., Particular embroidery patterns, color restrictions"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-heritage-cream/40 border border-heritage-gold/20 rounded-xl focus:outline-none focus:border-heritage-gold"
                />
              </div>

              <div className="flex items-center gap-2 pt-1 text-left">
                <input
                  type="checkbox"
                  id="checkbox-save-as-draft"
                  checked={saveAsDraft}
                  onChange={e => setSaveAsDraft(e.target.checked)}
                  className="rounded border-heritage-gold/30 text-heritage-green focus:ring-heritage-gold h-4 w-4 cursor-pointer"
                />
                <label htmlFor="checkbox-save-as-draft" className="text-[11px] font-semibold text-heritage-green select-none cursor-pointer">
                  Save as Draft (Hide from community lists while configuring)
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md cursor-pointer"
                >
                  Create My Group
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* RIGHT COLUMN: OPTION 3 (JOIN EXISTING GROUP) */}
        <div className="lg:col-span-5 space-y-6">
          <section id="option-join-group" className="rounded-3xl border border-heritage-gold/15 bg-white p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center shrink-0">
                <Users size={22} className="text-heritage-gold" />
              </div>
              <div>
                <span className="text-[10px] text-heritage-gold font-bold tracking-wider uppercase block">
                  Option 3
                </span>
                <h3 className="text-xl font-serif font-bold text-heritage-green mt-0.5">
                  Available Personalized Groups
                </h3>
              </div>
            </div>

            <p className="text-xs text-heritage-ink/75 leading-relaxed font-medium">
              Join an existing personalized batch that other coordinators have opened. This combines shipping discounts while keeping your personal specifications.
            </p>

            <div className="space-y-4">
              {openBatches.map(batch => {
                const getBadgeColor = (status: string) => {
                  switch (status) {
                    case 'Open':
                      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    case 'Almost Full':
                      return 'bg-amber-50 text-amber-800 border-amber-200';
                    case 'Closing Soon':
                      return 'bg-rose-50 text-rose-800 border-rose-200';
                    default:
                      return 'bg-gray-100 text-gray-800 border-gray-300';
                  }
                };

                return (
                  <div key={batch.id} className="border border-heritage-gold/15 hover:border-heritage-gold/40 p-4 rounded-2xl bg-heritage-cream/10 space-y-3 shadow-xs transition duration-200">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-serif font-bold text-heritage-green text-sm">
                          {batch.name}
                        </h4>
                        <span className="text-[9px] text-heritage-ink/50 font-medium block">
                          Organized by {batch.createdBy || 'NTCC'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${getBadgeColor(batch.status)}`}>
                        {batch.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-heritage-ink/75 pt-1">
                      <div className="flex items-center gap-1.5 font-sans font-medium">
                        <MapPin size={11} className="text-heritage-gold shrink-0" />
                        <span>{batch.pickupLocation || 'ASML Campus'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-sans font-medium">
                        <Users size={11} className="text-heritage-gold shrink-0" />
                        <span>{batch.currentGarments} / {batch.targetGarments} Members</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-sans font-medium">
                        <Calendar size={11} className="text-heritage-gold shrink-0" />
                        <span>Deliver by: {batch.estimatedDelivery}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[8px] text-heritage-ink/40 font-mono">
                        Closes: {batch.endDate}
                      </span>
                      <button
                        onClick={() => {
                           const context: OrderContext = {
                             orderType: 'Group Member',
                             batchId: batch.id,
                             batchName: batch.name,
                             closingDate: batch.endDate,
                             deliveryWindow: batch.estimatedDelivery,
                             pickupLocation: batch.pickupLocation,
                             currentMembers: batch.currentGarments,
                             expectedParticipants: batch.targetGarments,
                           };
                           if (onJoinCustomGroup) {
                             onJoinCustomGroup(batch.id);
                           }
                           onSelectOrderContext(context);
                        }}
                        disabled={batch.status === 'Full'}
                        className={`text-[10px] px-3.5 py-1.5 font-bold uppercase tracking-wider rounded-lg transition duration-200 cursor-pointer ${batch.status === 'Full' ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' : 'bg-heritage-green hover:bg-heritage-gold hover:text-heritage-forest text-white border border-heritage-green hover:border-heritage-gold'}`}
                      >
                        Join Group
                      </button>
                    </div>
                  </div>
                );
              })}
              {openBatches.length === 0 && (
                <div className="text-xs text-center py-4 text-heritage-ink/50 italic">
                  No public groups are currently open.
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
