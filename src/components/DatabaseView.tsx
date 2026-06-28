/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import namer from 'color-namer';

const getColorName = (hex: string) => {
  try {
    return namer(hex).ntc[0].name;
  } catch (e) {
    return hex;
  }
};
import { 
  Database, Search, Filter, Layers, BookOpen, Info, Plus, Edit2, Trash2, 
  User, Users, Shirt, Layers2, Sliders, ClipboardList, CheckCircle2, ChevronRight,
  ShieldCheck, AlertTriangle, Check, X, Tag, RefreshCw, Upload, Image, Download,
  Puzzle, FileText, Copy
} from 'lucide-react';
import { Fabric, StyleCategory, Customer, CustomGroup, MasterOrder, Showpiece, CommunityPhoto, Batch, BusinessSettings, ConstructionDetail } from '../types';
import { OFFICIAL_PRICE_LIST } from '../data/pricingData';
import odogwuLogo from '../assets/images/odogwu_logo_1782556303014.jpg';
import { BusinessIntelligenceEngine } from '../engine/BusinessIntelligenceEngine';
import { useAppStore } from '../store/useAppStore';

interface DatabaseViewProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  styles: StyleCategory[];
  setStyles: React.Dispatch<React.SetStateAction<StyleCategory[]>>;
  fabrics: Fabric[];
  setFabrics: React.Dispatch<React.SetStateAction<Fabric[]>>;
  customGroups: CustomGroup[];
  setCustomGroups: React.Dispatch<React.SetStateAction<CustomGroup[]>>;
  orders: MasterOrder[];
  setOrders: React.Dispatch<React.SetStateAction<MasterOrder[]>>;
  showpieces?: Showpiece[];
  setShowpieces?: React.Dispatch<React.SetStateAction<Showpiece[]>>;
  communityPhotos?: CommunityPhoto[];
  setCommunityPhotos?: React.Dispatch<React.SetStateAction<CommunityPhoto[]>>;
  batches: Batch[];
  setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
  businessSettings: BusinessSettings;
  setBusinessSettings: React.Dispatch<React.SetStateAction<BusinessSettings>>;
}

type TabType = 'documentation' | 'users' | 'styles' | 'fabrics' | 'batches' | 'orders' | 'showpieces' | 'photos' | 'settings' | 'media' | 'plugins' | 'audit' | 'roles' | 'operations';

export default function DatabaseView({
  customers,
  setCustomers,
  styles,
  setStyles,
  fabrics,
  setFabrics,
  customGroups,
  setCustomGroups,
  orders,
  setOrders,
  showpieces = [],
  setShowpieces,
  communityPhotos: _communityPhotos = [],
  setCommunityPhotos,
  batches,
  setBatches,
  businessSettings,
  setBusinessSettings
}: DatabaseViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('documentation');
  
  const { mediaLibrary, plugins, auditLogs, roles } = useAppStore();

  // Search states for each table
  const [userSearch, setUserSearch] = useState('');
  const [styleSearch, setStyleSearch] = useState('');
  const [fabricSearch, setFabricSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [showpieceSearch, setShowpieceSearch] = useState('');
  const [photoSearch, setPhotoSearch] = useState('');

  const communityPhotos = Array.isArray(_communityPhotos) ? _communityPhotos : [];

  // Editing modal/form states
  const [editingType, setEditingType] = useState<'user' | 'style' | 'fabric' | 'batch' | 'order' | 'showpiece' | 'photo' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null); // holds the item being edited or new template
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Status message HUD
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const triggerStatus = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportManifest = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/production-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `heritage_workshop_production_manifest_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        triggerStatus('Production manifest exported successfully for workshop floor!', 'success');
      } else {
        alert('Failed to generate production manifest.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend manifest engine.');
    } finally {
      setIsExporting(false);
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const extractColors = (dataURL: string): Promise<{ main: string, secondary: string }> => {
    return new Promise((resolve) => {
      const img = new globalThis.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve({ main: '#2c3e50', secondary: '#e67e22' });
        
        // Resize for faster processing
        const scale = Math.min(100 / img.width, 100 / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Sample center for main, edge for secondary
        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 2);
        const mainData = ctx.getImageData(cx, cy, 1, 1).data;
        
        const sx = Math.floor(canvas.width * 0.8);
        const sy = Math.floor(canvas.height * 0.2);
        const secData = ctx.getImageData(sx, sy, 1, 1).data;
        
        const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => {
          const hex = x.toString(16);
          return hex.length === 1 ? '0' + hex : hex;
        }).join('');
        
        resolve({
          main: rgbToHex(mainData[0], mainData[1], mainData[2]),
          secondary: rgbToHex(secData[0], secData[1], secData[2])
        });
      };
      img.onerror = () => resolve({ main: '#2c3e50', secondary: '#e67e22' });
      img.src = dataURL;
    });
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }

    try {
      triggerStatus('Processing image file...', 'info');
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataURL = e.target?.result as string;
        if (editingItem) {
          if (editingType === 'photo') {
            const updatedPhotoItem = {
              ...editingItem,
              url: dataURL
            };
            setEditingItem(updatedPhotoItem);
            
            if (isNewRecord && setCommunityPhotos) {
              setCommunityPhotos(prev => {
                if (prev.some(p => p.id === updatedPhotoItem.id)) {
                  return prev.map(p => p.id === updatedPhotoItem.id ? updatedPhotoItem : p);
                }
                return [...prev, updatedPhotoItem];
              });
              setIsNewRecord(false); // Make it an existing record now
            } else if (setCommunityPhotos) {
              setCommunityPhotos(prev => prev.map(p => p.id === updatedPhotoItem.id ? updatedPhotoItem : p));
            }

            triggerStatus('Community image processed successfully!', 'success');
          } else if (editingType === 'style') {
            // Detect colors for style
            triggerStatus('Detecting garment colors...', 'info');
            const colors = await extractColors(dataURL);
            setEditingItem({
              ...editingItem,
              image: dataURL,
              detectedColors: colors
            });
            triggerStatus('Image processed & colors detected successfully!', 'success');
          } else {
            setEditingItem({
              ...editingItem,
              image: dataURL
            });
            triggerStatus('Image processed successfully!', 'success');
          }
        }
      };
      reader.onerror = () => {
        triggerStatus('Error reading image file.', 'error');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing file:', error);
      triggerStatus('Error processing image. Please try again.', 'error');
    }
  };

  // ----------------------------------------------------
  // CRUD Action Handlers
  // ----------------------------------------------------

  // USERS
  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Customer;
    if (!item.email || !item.name) {
      alert('Email and Name are required.');
      return;
    }

    if (isNewRecord) {
      if (customers.some(c => c.email.toLowerCase() === item.email.toLowerCase())) {
        alert('A customer with this email already exists.');
        return;
      }
      setCustomers(prev => [...prev, { ...item, passcode: item.passcode || '1960', role: item.role || 'Engineer', location: item.location || 'ASML Building 4 Veldhoven' }]);
      triggerStatus(`Added Customer ${item.name} successfully!`);
    } else {
      setCustomers(prev => prev.map(c => c.email.toLowerCase() === item.email.toLowerCase() ? item : c));
      // Update any orders placed by this customer as well
      setOrders(prev => prev.map(o => o.customer.email.toLowerCase() === item.email.toLowerCase() ? { ...o, customer: { ...o.customer, name: item.name, phone: item.phone, location: item.location } } : o));
      triggerStatus(`Updated Customer ${item.name} successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteUser = (email: string) => {
    setCustomers(prev => prev.filter(c => c.email.toLowerCase() !== email.toLowerCase()));
    triggerStatus('Customer record deleted.', 'info');
  };

  // STYLES
  const handleSaveStyle = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as StyleCategory;
    if (!item.id || !item.name) {
      alert('Style ID and Name are required.');
      return;
    }

    if (isNewRecord) {
      if (styles.some(s => s.id === item.id)) {
        alert('A style with this ID already exists.');
        return;
      }
      setStyles(prev => [...prev, item]);
      triggerStatus(`Created style ${item.name} successfully!`);
    } else {
      setStyles(prev => prev.map(s => s.id === item.id ? item : s));
      triggerStatus(`Updated style ${item.name} successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteStyle = (id: string) => {
    setStyles(prev => prev.filter(s => s.id !== id));
    triggerStatus('Style class deleted.', 'info');
  };

  const handleDuplicateStyle = (style: StyleCategory) => {
    const newStyle = {
      ...style,
      id: `${style.id}-copy-${Date.now().toString().slice(-4)}`,
      name: `${style.name} (Copy)`
    };
    setStyles(prev => [...prev, newStyle]);
    triggerStatus(`Duplicated style class.`, 'success');
  };

  // FABRICS
  const handleSaveFabric = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Fabric;
    if (!item.code || !item.name) {
      alert('Fabric Code and Name are required.');
      return;
    }

    // Auto-calculate the price from base if multiplier is updated
    const basePrice = 35; // Standard mill pricing
    const price = Math.round(basePrice * (item.priceMultiplier || 1));

    const finalItem: Fabric = {
      ...item,
      price,
      stockStatus: item.stock <= 0 ? 'Out of Stock' : item.stock <= 5 ? 'Low Stock' : 'In Stock'
    };

    if (isNewRecord) {
      if (fabrics.some(f => f.code.toUpperCase() === item.code.toUpperCase())) {
        alert('A fabric with this code already exists.');
        return;
      }
      setFabrics(prev => [...prev, finalItem]);
      triggerStatus(`Added fabric ${item.name} to catalogue!`);
    } else {
      setFabrics(prev => prev.map(f => f.code.toUpperCase() === item.code.toUpperCase() ? finalItem : f));
      triggerStatus(`Updated fabric ${item.name} specifications.`);
    }
    setEditingType(null);
  };

  const handleDeleteFabric = (code: string) => {
    setFabrics(prev => prev.filter(f => f.code !== code));
    triggerStatus('Fabric catalogue entry deleted.', 'info');
  };

  // BATCHES
  const handleSaveBatch = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Batch;
    if (!item.id || !item.name) {
      alert('Batch ID and Name are required.');
      return;
    }

    if (isNewRecord) {
      if (batches.some(b => b.id === item.id)) {
        alert('A cohort batch with this ID already exists.');
        return;
      }
      setBatches(prev => [...prev, item]);
      triggerStatus(`Cohort batch ${item.name} created!`);
    } else {
      setBatches(prev => prev.map(b => b.id === item.id ? item : b));
      triggerStatus(`Cohort batch ${item.name} details synchronized.`);
    }
    setEditingType(null);
  };

  const handleDeleteBatch = (batchId: string) => {
    setCustomGroups(prev => prev.filter(g => g.batchId !== batchId));
    triggerStatus('Cohort batch deleted.', 'info');
  };

  // ORDERS
  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as MasterOrder;
    if (!item.shipment.trackingId) {
      alert('Order tracking ID is required.');
      return;
    }

    if (isNewRecord) {
      setOrders(prev => [item, ...prev]);
      triggerStatus(`Manually registered order ${item.shipment.trackingId}`);
    } else {
      setOrders(prev => prev.map(o => o.shipment.trackingId === item.shipment.trackingId ? item : o));
      triggerStatus(`Order ${item.shipment.trackingId} tracking & payments updated!`);
    }
    setEditingType(null);
  };

  const handleDeleteOrder = (trackingId: string) => {
    setOrders(prev => prev.filter(o => o.shipment.trackingId !== trackingId));
    triggerStatus('Order deleted.', 'info');
  };

  const handleChargeBalance = async (order: MasterOrder) => {
    try {
      const remainingAmount = order.payment.remaining || (order.garment.totalPrice / 2);
      const response = await fetch('/api/charge-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: remainingAmount,
          paymentMethod: order.payment.paymentMethod || 'Stripe',
          customerEmail: order.customer.email,
          orderId: order.shipment.trackingId
        })
      });
      const data = await response.json();
      if (data.success) {
        setOrders(prev => prev.map(o => {
          if (o.shipment.trackingId === order.shipment.trackingId) {
            return {
              ...o,
              payment: {
                ...o.payment,
                secondPaymentStatus: 'paid',
                secondPaymentMethod: order.payment.paymentMethod || 'Stripe',
                secondPaymentDate: new Date().toLocaleDateString('en-US'),
                secondTransactionId: data.secondTransactionId,
                lockerPasscode: data.lockerPasscode
              },
              shipment: {
                ...o.shipment,
                status: 'Balance Paid securely! Locker code delivered.',
                currentStage: 6 // Delivered
              }
            };
          }
          return o;
        }));
        triggerStatus(`Charged remaining balance (€${remainingAmount}) securely via Stripe. Locker passcode generated: ${data.lockerPasscode}`);
      } else {
        alert('Stripe balance charge failed: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to connect to stripe backend microservice.');
    }
  };

  const handleSendPaymentLink = (order: MasterOrder) => {
    triggerStatus(`Emailed unique payment page link to ${order.customer.email} to settle final 50% balance (€${order.payment.remaining || (order.garment.totalPrice / 2)})!`);
  };

  // SHOWPIECES
  const handleSaveShowpiece = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as Showpiece;
    if (!item.id || !item.title) {
      alert('Showpiece ID and Title are required.');
      return;
    }

    if (isNewRecord) {
      if (showpieces.some(s => s.id === item.id)) {
        alert('A showpiece with this ID already exists.');
        return;
      }
      if (setShowpieces) {
        setShowpieces(prev => [...prev, item]);
      }
      triggerStatus(`Created showpiece "${item.title}" successfully!`);
    } else {
      if (setShowpieces) {
        setShowpieces(prev => prev.map(s => s.id === item.id ? item : s));
      }
      triggerStatus(`Updated showpiece "${item.title}" successfully!`);
    }
    setEditingType(null);
  };

  const handleDeleteShowpiece = (id: string) => {
    if (setShowpieces) {
      setShowpieces(prev => prev.filter(s => s.id !== id));
    }
    triggerStatus('Showpiece deleted.', 'info');
  };

  // COMMUNITY PHOTOS
  const handleSavePhoto = (e: React.FormEvent) => {
    e.preventDefault();
    const item = editingItem as CommunityPhoto;
    if (!item.id) {
      alert('Photo ID is required.');
      return;
    }
    if (!item.url) {
      alert('Photo Image or URL is required.');
      return;
    }

    if (isNewRecord) {
      if (communityPhotos.length >= 20) {
        alert('Maximum capacity reached! The community photo gallery has a strict limit of 20 photos. Please delete some photos before adding new ones.');
        return;
      }
      if (communityPhotos.some(p => p.id === item.id)) {
        alert('A photo with this ID already exists.');
        return;
      }
      if (setCommunityPhotos) {
        setCommunityPhotos(prev => [...prev, item]);
      }
      triggerStatus(`Added photo "${item.id}" successfully!`);
    } else {
      if (setCommunityPhotos) {
        setCommunityPhotos(prev => prev.map(p => p.id === item.id ? item : p));
      }
      triggerStatus(`Updated photo "${item.id}" successfully!`);
    }
    setEditingType(null);
  };

  const handleDeletePhoto = (id: string) => {
    if (setCommunityPhotos) {
      setCommunityPhotos(prev => prev.filter(p => p.id !== id));
    }
    triggerStatus('Community photo deleted.', 'info');
  };


  // ----------------------------------------------------
  // Render Filters & Helpers
  // ----------------------------------------------------
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    c.phone.includes(userSearch) ||
    (c.role && c.role.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const filteredStyles = styles.filter(s =>
    s.name.toLowerCase().includes(styleSearch.toLowerCase()) ||
    s.id.toLowerCase().includes(styleSearch.toLowerCase()) ||
    s.description.toLowerCase().includes(styleSearch.toLowerCase())
  );

  const filteredFabrics = fabrics.filter(f =>
    f.name.toLowerCase().includes(fabricSearch.toLowerCase()) ||
    f.code.toLowerCase().includes(fabricSearch.toLowerCase()) ||
    f.category.toLowerCase().includes(fabricSearch.toLowerCase())
  );

  const filteredBatches = batches.filter(b =>
    b.name.toLowerCase().includes(batchSearch.toLowerCase()) ||
    b.id.toLowerCase().includes(batchSearch.toLowerCase()) ||
    (b.pickupLocation && b.pickupLocation.toLowerCase().includes(batchSearch.toLowerCase()))
  );

  const filteredOrders = orders.filter(o =>
    o.shipment.trackingId.toLowerCase().includes(orderSearch.toLowerCase()) ||
    o.customer.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
    o.customer.email.toLowerCase().includes(orderSearch.toLowerCase()) ||
    o.style.name.toLowerCase().includes(orderSearch.toLowerCase()) ||
    o.fabric.name.toLowerCase().includes(orderSearch.toLowerCase())
  );

  const filteredPhotos = communityPhotos.filter(p =>
    p.id.toLowerCase().includes(photoSearch.toLowerCase()) ||
    (p.caption && p.caption.toLowerCase().includes(photoSearch.toLowerCase())) ||
    (p.cohortName && p.cohortName.toLowerCase().includes(photoSearch.toLowerCase())) ||
    (p.deliveryYear && p.deliveryYear.toString().includes(photoSearch))
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 font-sans py-4">
      {/* Toast HUD Status messages */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-full bg-heritage-green text-heritage-gold border border-heritage-gold/30 shadow-2xl flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          >
            <Check size={14} className="text-heritage-gold" />
            <span>{statusMsg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="text-center space-y-3 flex flex-col items-center">
        <div className="mb-2">
          <img loading="lazy"
            src={odogwuLogo}
            alt="The Odogwu Heritage Official Logo"
            className="w-20 h-20 rounded-full border-2 border-heritage-gold/35 object-cover bg-heritage-forest shadow-md"
            referrerPolicy="no-referrer"
          />
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25 rounded-full text-[10px] font-bold uppercase tracking-widest">
          <Database size={11} className="animate-pulse text-heritage-gold" /> Relational Database Management Panel
        </span>
        <h1 className="text-3xl sm:text-4xl font-display font-semibold text-heritage-green leading-none tracking-tight">
          Bespoke Tailoring Database Hub
        </h1>
        <p className="text-xs sm:text-sm text-heritage-ink/70 max-w-2xl mx-auto leading-relaxed">
          Manage, create, and audit live relational records. Changes propagate instantly to active client tracking dashboards and the live configurator studio.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
        {/* Navigation Sidebar / Mobile Scrollable Row */}
        <div className="w-full md:w-56 lg:w-64 shrink-0 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
          <div className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 bg-heritage-forest/40 p-1 md:p-2 rounded-2xl border border-heritage-gold/10 w-max md:w-full min-w-full">
            {[
              { id: 'documentation', label: 'Schema Models & ERD', icon: BookOpen },
              { id: 'operations', label: 'Operations Dashboard', icon: Layers },
              { id: 'users', label: 'Users & Profiles', icon: User },
              { id: 'styles', label: 'Garment Options', icon: Shirt },
              { id: 'fabrics', label: 'Fabrics Catalogue', icon: Layers },
              { id: 'batches', label: 'Sourcing Batches', icon: Layers2 },
              { id: 'orders', label: 'Master Orders', icon: ClipboardList },
              { id: 'showpieces', label: 'Lookbook Showpieces', icon: Tag },
              { id: 'photos', label: 'Community & Cohorts', icon: Image },
              { id: 'media', label: 'Media Library', icon: Image },
              { id: 'plugins', label: 'Plugins', icon: Puzzle },
              { id: 'audit', label: 'Audit Logs', icon: FileText },
              { id: 'roles', label: 'Roles', icon: ShieldCheck },
              { id: 'settings', label: 'System Settings', icon: Sliders }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    setEditingType(null);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 md:py-2.5 text-[10px] md:text-[11px] font-bold uppercase tracking-wider rounded-xl transition cursor-pointer select-none whitespace-nowrap md:whitespace-normal text-left ${
                    isActive
                      ? 'bg-heritage-green text-heritage-gold border border-heritage-gold/25 shadow-md font-bold'
                      : 'text-heritage-beige hover:text-heritage-gold hover:bg-heritage-forest/30'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* CORE VIEWPORT */}
        <div className="flex-1 min-w-0">
          <div className="bg-white border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 shadow-sm h-full">
        {/* EDITING FORMS OVERLAYS */}
        {editingType && editingItem && (
          <div className="mb-8 p-6 bg-heritage-forest/5 border-2 border-heritage-gold/20 rounded-2xl text-left space-y-4">
            <div className="flex items-center justify-between border-b border-heritage-gold/10 pb-3">
              <h3 className="text-sm font-bold font-serif text-heritage-green uppercase tracking-wider">
                {isNewRecord ? '➕ Register New Relational Record' : '✏️ Modify Selected Database Entity'}
              </h3>
              <button 
                onClick={() => setEditingType(null)}
                className="h-7 w-7 rounded-full bg-heritage-forest/15 text-heritage-green flex items-center justify-center hover:bg-heritage-green hover:text-heritage-gold transition cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Entity-Specific Form Elements */}
            {editingType === 'user' && (
              <form onSubmit={handleSaveUser} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Email Address (Key / Login)</label>
                  <input
                    type="email"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.email}
                    onChange={e => setEditingItem({ ...editingItem, email: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                    placeholder="e.g. x.e@asml-corp.nl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Customer Full Name</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. Xavier E."
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Phone Number</label>
                  <input
                    type="text"
                    value={editingItem.phone}
                    onChange={e => setEditingItem({ ...editingItem, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. +31 6 1234 5678"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Campus Location / Pickup Lockers</label>
                  <input
                    type="text"
                    value={editingItem.location}
                    onChange={e => setEditingItem({ ...editingItem, location: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. ASML Veldhoven Building 4 Lockers"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">User Security PIN (Passcode)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={editingItem.passcode || '1960'}
                    onChange={e => setEditingItem({ ...editingItem, passcode: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono tracking-widest"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Organizational Role</label>
                  <select
                    value={editingItem.role || 'Engineer'}
                    onChange={e => setEditingItem({ ...editingItem, role: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="Active Cohort Member">Active Cohort Member</option>
                    <option value="Engineer">Engineer</option>
                    <option value="NTCC Founder & Coordinator">NTCC Founder & Coordinator</option>
                    <option value="Lead Fabric Sourcing Agent">Lead Fabric Sourcing Agent</option>
                  </select>
                </div>
                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20">Save Customer Record</button>
                </div>
              </form>
            )}

            {editingType === 'style' && (
              <form onSubmit={handleSaveStyle} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Style ID / Code (Primary Key)</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.id}
                    onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. style-kaftan"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Garment Style Name</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. Royal Senator"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Base Price (€)</label>
                  <input
                    type="number"
                    required
                    value={editingItem.basePrice}
                    onChange={e => setEditingItem({ ...editingItem, basePrice: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Target Demographic</label>
                  <select
                    value={editingItem.gender || 'unisex'}
                    onChange={e => setEditingItem({ ...editingItem, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unisex">Unisex</option>
                    <option value="couple">Couple</option>
                    <option value="family">Family</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Difficulty Level</label>
                  <select
                    value={editingItem.difficulty || 'Medium'}
                    onChange={e => setEditingItem({ ...editingItem, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="Easy">Easy (Single Placket Sews)</option>
                    <option value="Medium">Medium (Embroidered Detailing)</option>
                    <option value="Hard">Hard (Ceremonial Triple Draped Layers)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Outfit Type</label>
                  <select
                    value={editingItem.outfitType || 'Full Outfit'}
                    onChange={e => setEditingItem({ ...editingItem, outfitType: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="Full Outfit">Full Outfit</option>
                    <option value="Shirt Only">Shirt Only</option>
                    <option value="Trousers Only">Trousers Only</option>
                    <option value="Agbada Only">Agbada Only</option>
                    <option value="Cap Only">Cap Only</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Fabric Category</label>
                  <select
                    value={editingItem.fabricCategory || 'Any'}
                    onChange={e => setEditingItem({ ...editingItem, fabricCategory: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="Any">Any Fabric</option>
                    <option value="Ankara">Ankara</option>
                    <option value="Lace">Lace</option>
                    <option value="Senator / Cashmere">Senator / Cashmere</option>
                    <option value="Atiku">Atiku</option>
                    <option value="Silk / Chiffon">Silk / Chiffon</option>
                    <option value="Velvet">Velvet</option>
                    <option value="Aso Oke">Aso Oke</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-heritage-green">Style Description</label>
                  <input
                    type="text"
                    value={editingItem.description}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="Short summary of fit guidelines..."
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="font-bold text-heritage-green flex justify-between items-center">
                    <span>Style Reference Image URL</span>
                    <span className="text-gray-400 font-normal">Enter URL or drag file</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://images.unsplash.com..."
                    value={editingItem.image || ''}
                    onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                  />

                  <div 
                    className={`relative w-24 h-24 sm:w-32 sm:h-32 border-2 border-dashed rounded-xl overflow-hidden transition-colors mx-auto ${
                      isDragging ? 'border-heritage-gold bg-heritage-gold/5' : 'border-gray-300 hover:border-heritage-gold/50 bg-gray-50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input 
                      type="file"
                      id="style-file-input"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {editingItem.image ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-heritage-cream border border-heritage-gold/10 shadow-sm group">
                        <img loading="lazy" 
                          src={editingItem.image} 
                          alt="Style Preview" 
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                          <Upload size={16} className="mb-1" />
                          <span>Replace</span>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingItem({ ...editingItem, image: '' });
                            }}
                            className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-[10px] font-bold cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label 
                        htmlFor="style-file-input"
                        className="absolute inset-0 flex flex-col items-center justify-center text-heritage-ink/50 cursor-pointer hover:text-heritage-gold transition-colors p-2 text-center"
                      >
                        <Image size={20} className="mb-1 opacity-50" />
                        <p className="text-[9px] font-semibold">Upload Image</p>
                      </label>
                    )}
                  </div>
                  
                  {editingItem.image && editingItem.detectedColors && (
                    <div className="flex items-center justify-between mt-2 p-2 bg-white rounded-lg border border-gray-200">
                      <span className="text-[10px] font-bold text-heritage-green">Detected Garment Colors:</span>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[9px] text-gray-500 font-bold uppercase">Main</label>
                          <input 
                            type="color"
                            value={editingItem.detectedColors.main}
                            onChange={(e) => setEditingItem({
                              ...editingItem,
                              detectedColors: { ...editingItem.detectedColors, main: e.target.value }
                            })}
                            className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                            title="Edit Main Color"
                          />
                          <span className="text-[9px] text-heritage-ink/70 font-medium w-16 truncate" title={getColorName(editingItem.detectedColors.main)}>
                            {getColorName(editingItem.detectedColors.main)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                          <label className="text-[9px] text-gray-500 font-bold uppercase">Accent</label>
                          <input 
                            type="color"
                            value={editingItem.detectedColors.secondary}
                            onChange={(e) => setEditingItem({
                              ...editingItem,
                              detectedColors: { ...editingItem.detectedColors, secondary: e.target.value }
                            })}
                            className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                            title="Edit Secondary Color"
                          />
                          <span className="text-[9px] text-heritage-ink/70 font-medium w-16 truncate" title={getColorName(editingItem.detectedColors.secondary)}>
                            {getColorName(editingItem.detectedColors.secondary)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3 sm:col-span-2 border-t border-heritage-gold/20 pt-4 mt-2">
                  <div className="flex justify-between items-center">
                    <label className="font-bold text-heritage-green">Garment Construction Details & Prices</label>
                    <button
                      type="button"
                      onClick={() => {
                        const current = editingItem.constructionDetails || [];
                        setEditingItem({
                          ...editingItem,
                          constructionDetails: [
                            ...current,
                            { code: 'NEW', type: 'New Configuration', price: editingItem.basePrice || 150, discountPrice: (editingItem.basePrice || 150) - 20 }
                          ]
                        });
                      }}
                      className="text-[10px] font-bold bg-heritage-green/10 text-heritage-green hover:bg-heritage-green hover:text-white px-2 py-1 rounded transition"
                    >
                      + Add Option
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {(editingItem.constructionDetails || []).map((detail: ConstructionDetail, idx: number) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 bg-gray-50 p-2 rounded-lg border border-gray-200">
                        <input
                          type="text"
                          placeholder="Code (e.g. G1)"
                          value={detail.code}
                          onChange={(e) => {
                            const newDetails = [...editingItem.constructionDetails];
                            newDetails[idx] = { ...detail, code: e.target.value };
                            setEditingItem({ ...editingItem, constructionDetails: newDetails });
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 rounded font-mono text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Description (e.g. 3-Piece Set)"
                          value={detail.type}
                          onChange={(e) => {
                            const newDetails = [...editingItem.constructionDetails];
                            newDetails[idx] = { ...detail, type: e.target.value };
                            setEditingItem({ ...editingItem, constructionDetails: newDetails });
                          }}
                          className="flex-grow px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 font-medium">€</span>
                          <input
                            type="number"
                            placeholder="Price"
                            value={detail.price}
                            onChange={(e) => {
                              const newDetails = [...editingItem.constructionDetails];
                              newDetails[idx] = { ...detail, price: parseFloat(e.target.value) || 0 };
                              setEditingItem({ ...editingItem, constructionDetails: newDetails });
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 font-medium">Dist: €</span>
                          <input
                            type="number"
                            placeholder="Disc"
                            value={detail.discountPrice || ''}
                            onChange={(e) => {
                              const newDetails = [...editingItem.constructionDetails];
                              newDetails[idx] = { ...detail, discountPrice: parseFloat(e.target.value) || 0 };
                              setEditingItem({ ...editingItem, constructionDetails: newDetails });
                            }}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-xs text-green-700"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newDetails = editingItem.constructionDetails.filter((_, i) => i !== idx);
                            setEditingItem({ ...editingItem, constructionDetails: newDetails });
                          }}
                          className="p-1.5 text-red-500 hover:bg-red-100 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {(!editingItem.constructionDetails || editingItem.constructionDetails.length === 0) && (
                      <div className="text-center p-4 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
                        <p className="text-xs text-gray-500 mb-2">No specific construction pricing defined. Will fall back to official price list by gender.</p>
                        <button
                          type="button"
                          onClick={() => {
                            const isFemale = editingItem.gender === 'female';
                            const defaults = OFFICIAL_PRICE_LIST.filter(p => isFemale ? p.category === 'ladies' && p.code !== 'L5' : p.category === 'guys').map(p => ({
                              code: p.code,
                              type: p.description,
                              price: p.actualMax,
                              discountPrice: p.discountedMax
                            }));
                            setEditingItem({ ...editingItem, constructionDetails: defaults });
                          }}
                          className="text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition font-medium"
                        >
                          Populate from Official Price List
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20">Save Style Class</button>
                </div>
              </form>
            )}

            {editingType === 'fabric' && (
              <form onSubmit={handleSaveFabric} className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs font-sans">
                {/* Left Column: Details */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green">Fabric Catalogue Code (Primary Key)</label>
                    <input
                      type="text"
                      required
                      disabled={!isNewRecord}
                      value={editingItem.code}
                      onChange={e => setEditingItem({ ...editingItem, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-xs"
                      placeholder="e.g. ODG-809"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green">Fabric Name</label>
                    <input
                      type="text"
                      required
                      value={editingItem.name}
                      onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                      className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      placeholder="e.g. Royal Emerald Ankara"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green">Fabric Category Class</label>
                    <select
                      value={editingItem.category || 'Printed Fabrics'}
                      onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                      className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    >
                      <option value="Printed Fabrics">Printed Fabrics (Standard Ankara)</option>
                      <option value="Handcrafted Fabrics">Handcrafted Fabrics (Adire Tie-Dye)</option>
                      <option value="Traditional Fabrics">Traditional Fabrics (Aso-Oke Strip Weaves)</option>
                      <option value="Luxury Fabrics">Luxury Fabrics (Grand Gold Cashmere Brocades)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green flex justify-between">
                      <span>Mill Cost Multiplier</span>
                      <span className="text-heritage-gold font-mono">{editingItem.priceMultiplier || 1.0}x</span>
                    </label>
                    <div className="flex gap-4 items-center">
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.05"
                        value={editingItem.priceMultiplier || 1.0}
                        onChange={e => setEditingItem({ ...editingItem, priceMultiplier: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-heritage-green"
                      />
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={editingItem.priceMultiplier || 1.0}
                        onChange={e => setEditingItem({ ...editingItem, priceMultiplier: parseFloat(e.target.value) })}
                        className="w-20 px-2 py-1.5 border border-heritage-gold/20 bg-white rounded-lg text-center font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">
                      Calculated Price: <strong className="text-heritage-green">€{Math.round(40 * (editingItem.priceMultiplier || 1.0))}</strong> <span className="text-gray-400">(Base tailoring €40 * multiplier)</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">Color Family Name</label>
                      <input
                        type="text"
                        value={editingItem.color || editingItem.colorName || ''}
                        onChange={e => setEditingItem({ ...editingItem, color: e.target.value, colorName: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                        placeholder="e.g. Emerald Green"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-heritage-green">HEX Hue Code</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={editingItem.colorHex || '#1e3a1e'}
                          onChange={e => setEditingItem({ ...editingItem, colorHex: e.target.value })}
                          className="h-8 w-10 border border-heritage-gold/20 rounded-lg p-0.5 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={editingItem.colorHex || '#1e3a1e'}
                          onChange={e => setEditingItem({ ...editingItem, colorHex: e.target.value })}
                          className="w-full px-2 py-1.5 border border-heritage-gold/20 bg-white rounded-lg font-mono text-center text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Swatches and Stock controls */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green">Stock Inventory &amp; Status</label>
                    <div className="flex gap-4 items-center">
                      <div className="w-1/2 space-y-1">
                        <span className="text-[10px] text-gray-500 font-medium">Linear Yards</span>
                        <input
                          type="number"
                          required
                          min="0"
                          value={editingItem.stock ?? 30}
                          onChange={e => {
                            const stock = parseInt(e.target.value) || 0;
                            setEditingItem({ 
                              ...editingItem, 
                              stock,
                              stockStatus: stock <= 0 ? 'Out of Stock' : (stock <= 5 ? 'Low Stock' : 'In Stock')
                            });
                          }}
                          className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono"
                        />
                      </div>
                      <div className="w-1/2 self-end">
                        <button
                          type="button"
                          onClick={() => {
                            const currentStock = editingItem.stock ?? 30;
                            const newStock = currentStock <= 0 ? 25 : 0;
                            setEditingItem({
                              ...editingItem,
                              stock: newStock,
                              stockStatus: newStock <= 0 ? 'Out of Stock' : 'In Stock'
                            });
                          }}
                          className={`w-full py-2 px-3 border rounded-lg font-bold text-center transition cursor-pointer select-none text-[10px] ${
                            (editingItem.stock ?? 30) <= 0
                              ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                              : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                          }`}
                        >
                          {(editingItem.stock ?? 30) <= 0 ? 'Mark as In Stock (25 Yds)' : 'Mark Out of Stock (0 Yds)'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-heritage-green">Manufacturer &amp; Texture</label>
                    <div className="grid grid-cols-2 gap-4">
                      <input
                        type="text"
                        placeholder="Sourcing Mill"
                        value={editingItem.manufacturer || 'Lagos Heritage Weavers'}
                        onChange={e => setEditingItem({ ...editingItem, manufacturer: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                      <input
                        type="text"
                        placeholder="e.g. Smooth Wax Cotton"
                        value={editingItem.texture || ''}
                        onChange={e => setEditingItem({ ...editingItem, texture: e.target.value })}
                        className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                      />
                    </div>
                  </div>

                  {/* High-res Image / Swatch URL with Upload Simulation */}
                  <div className="space-y-2">
                    <label className="font-bold text-heritage-green flex justify-between items-center">
                      <span>Fabric Swatch Texture Image URL</span>
                      <span className="text-gray-400 font-normal">Enter URL or drag file</span>
                    </label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com..."
                      value={editingItem.image || ''}
                      onChange={e => setEditingItem({ ...editingItem, image: e.target.value })}
                      className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                    />

                    {/* Drag and Drop Swatch Area */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('swatch-file-input')?.click()}
                      className={`relative h-24 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all cursor-pointer overflow-hidden ${
                        isDragging 
                          ? 'border-heritage-gold bg-heritage-gold/10' 
                          : 'border-heritage-gold/30 hover:border-heritage-gold hover:bg-heritage-forest/5'
                      }`}
                    >
                      <input
                        type="file"
                        id="swatch-file-input"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      {editingItem.image ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group">
                          <img loading="lazy" 
                            src={editingItem.image} 
                            alt="Swatch Preview" 
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                            <Upload size={14} className="mb-1" />
                            <span>Replace Swatch File</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center space-y-1 text-heritage-ink/70">
                          <Upload size={16} className="mx-auto text-heritage-gold" />
                          <p className="text-[10px] font-semibold">Drag &amp; drop swatch image, or click to browse</p>
                          <p className="text-[9px] text-gray-400">Supports PNG, JPG, WebP (Converts to high-res data URL)</p>
                        </div>
                      )}
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Quick Premium Swatch Presets</span>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { name: 'Sarkari Golden Weave', url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=400' },
                          { name: 'Classic Ankara Star', url: 'https://images.unsplash.com/photo-1584184922226-f725f05a9603?auto=format&fit=crop&q=80&w=400' },
                          { name: 'Royal Emerald Leaf', url: 'https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80&w=400' },
                          { name: 'Adire Indigo Swirl', url: 'https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?auto=format&fit=crop&q=80&w=400' }
                        ].map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setEditingItem({ ...editingItem, image: preset.url });
                              triggerStatus(`Applied preset swatch: ${preset.name}!`);
                            }}
                            className="px-2 py-1 bg-heritage-forest/10 hover:bg-heritage-forest/20 text-[9px] text-heritage-green font-bold rounded-lg border border-heritage-gold/15 cursor-pointer"
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="sm:col-span-2 border-t border-heritage-gold/10 pt-4 flex gap-2 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setEditingType(null)} 
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition cursor-pointer select-none"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-heritage-green hover:bg-heritage-forest text-heritage-gold font-bold rounded-lg border border-heritage-gold/20 transition cursor-pointer select-none"
                  >
                    Save Fabric Settings
                  </button>
                </div>
              </form>
            )}

            {editingType === 'batch' && (
              <form onSubmit={handleSaveBatch} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Batch ID (Primary Key)</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.id}
                    onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Batch Name</label>
                  <input
                    type="text"
                    required
                    value={editingItem.name}
                    onChange={e => setEditingItem({ ...editingItem, name: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Duration (Timeline String)</label>
                  <input
                    type="text"
                    required
                    value={editingItem.duration}
                    onChange={e => setEditingItem({ ...editingItem, duration: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. Mar 10 - Apr 25, 2025"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Estimated Delivery</label>
                  <input
                    type="text"
                    required
                    value={editingItem.estimatedDelivery || ''}
                    onChange={e => setEditingItem({ ...editingItem, estimatedDelivery: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Target Garments</label>
                  <input
                    type="number"
                    required
                    value={editingItem.targetGarments}
                    onChange={e => setEditingItem({ ...editingItem, targetGarments: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Current Garments</label>
                  <input
                    type="number"
                    required
                    value={editingItem.currentGarments}
                    onChange={e => setEditingItem({ ...editingItem, currentGarments: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Pickup Coordinates</label>
                  <input
                    type="text"
                    value={editingItem.pickupLocation || ''}
                    onChange={e => setEditingItem({ ...editingItem, pickupLocation: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Pipeline Status</label>
                  <select
                    value={editingItem.status}
                    onChange={e => setEditingItem({ ...editingItem, status: e.target.value as Batch['status'] })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Yet To Start">Yet To Start</option>
                    <option value="Open">Open</option>
                    <option value="Almost Full">Almost Full</option>
                    <option value="Full">Full</option>
                    <option value="Closed">Closed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Locked">Locked</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20">Save Batch Parameters</button>
                </div>
              </form>
            )}

            {editingType === 'order' && (
              <form onSubmit={handleSaveOrder} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Tracking ID (Primary Key)</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.shipment.trackingId}
                    onChange={e => setEditingItem({ 
                      ...editingItem, 
                      shipment: { ...editingItem.shipment, trackingId: e.target.value } 
                    })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono"
                    placeholder="e.g. ODG-TRK-3950"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Customer Link (User Email)</label>
                  <select
                    value={editingItem.customer.email}
                    onChange={e => {
                      const matched = customers.find(c => c.email === e.target.value);
                      if (matched) {
                        setEditingItem({
                          ...editingItem,
                          customer: {
                            name: matched.name,
                            email: matched.email,
                            phone: matched.phone,
                            location: matched.location
                          }
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    {customers.map(c => (
                      <option key={c.email} value={c.email}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Stitch tracking status (Shipment Stage 1 to 6)</label>
                  <select
                    value={editingItem.shipment.currentStage}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      const statusTexts = [
                        'Deposit Verified. Securing Fabric Swatch...',
                        'Fabric Cut & Registered with Lagos Atelier floor',
                        'Pattern Drafting & Sewing on Lagos floor',
                        'Garment Sewing Completed. Passing QA & Fit Checks...',
                        'Consolidated & Dispatched via Lagos-Schiethol Air Freight Route',
                        'Arrived at ASML Veldhoven Locker Hub. Ready for secure PIN pickup!'
                      ];
                      setEditingItem({
                        ...editingItem,
                        shipment: {
                          ...editingItem.shipment,
                          currentStage: val,
                          status: statusTexts[val - 1] || 'In Production Pipeline'
                        }
                      });
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value={1}>Stage 1: Deposit Verified & Sourced Fabric</option>
                    <option value={2}>Stage 2: Pattern Drafting & Marking</option>
                    <option value={3}>Stage 3: Cutting & Stitching on Atelier Floor</option>
                    <option value={4}>Stage 4: Sewing Completed & Cultural QA Checked</option>
                    <option value={5}>Stage 5: Schiphol Freight Transited</option>
                    <option value={6}>Stage 6: Arrived in ASML Campus Locker!</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Sourced Fabric Swatch</label>
                  <select
                    value={editingItem.fabric.code}
                    onChange={e => {
                      const f = fabrics.find(fb => fb.code === e.target.value);
                      if (f) {
                        setEditingItem({
                          ...editingItem,
                          fabric: f
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    {fabrics.map(f => (
                      <option key={f.code} value={f.code}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Garment Style Base</label>
                  <select
                    value={editingItem.style.id}
                    onChange={e => {
                      const s = styles.find(st => st.id === e.target.value);
                      if (s) {
                        setEditingItem({
                          ...editingItem,
                          style: s
                        });
                      }
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    {styles.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (€{s.basePrice})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Special Custom Instructions</label>
                  <input
                    type="text"
                    value={editingItem.specialInstructions || ''}
                    onChange={e => setEditingItem({ ...editingItem, specialInstructions: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-heritage-green">Notes about Leftover Fabric Piece Management</label>
                  <input
                    type="text"
                    value={editingItem.notesAboutLeftoverFabric || ''}
                    onChange={e => setEditingItem({ ...editingItem, notesAboutLeftoverFabric: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. Please sew traditional custom matching cap or returning scraps."
                  />
                </div>
                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20">Sync Master Order</button>
                </div>
              </form>
            )}

            {editingType === 'showpiece' && (
              <form onSubmit={handleSaveShowpiece} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Showpiece ID (Unique Key)</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.id}
                    onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold font-mono"
                    placeholder="e.g. item-6"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Showpiece Title</label>
                  <input
                    type="text"
                    required
                    value={editingItem.title}
                    onChange={e => setEditingItem({ ...editingItem, title: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                    placeholder="e.g. The Sovereign Crimson Senator"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Gender / Style Category</label>
                  <select
                    value={editingItem.category}
                    onChange={e => setEditingItem({ ...editingItem, category: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="male">Men's Attire</option>
                    <option value="female">Women's Couture</option>
                    <option value="fabric">Raw Fabric Bolts</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Highlight Tag</label>
                  <input
                    type="text"
                    value={editingItem.tag || ''}
                    onChange={e => setEditingItem({ ...editingItem, tag: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                    placeholder="e.g. Bestseller, Trending, Exclusive"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Style Template (FK Link)</label>
                  <select
                    value={editingItem.styleId}
                    onChange={e => {
                      const selectedStyle = styles.find(s => s.id === e.target.value);
                      setEditingItem({
                        ...editingItem,
                        styleId: e.target.value,
                        styleName: selectedStyle ? selectedStyle.name : ''
                      });
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    {styles.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Fabric Sourcing (FK Link)</label>
                  <select
                    value={editingItem.fabricCode}
                    onChange={e => {
                      const selectedFabric = fabrics.find(f => f.code === e.target.value);
                      setEditingItem({
                        ...editingItem,
                        fabricCode: e.target.value,
                        fabricName: selectedFabric ? selectedFabric.name : '',
                        colorHex: selectedFabric ? selectedFabric.colorHex : '#000000'
                      });
                    }}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    {fabrics.map(f => (
                      <option key={f.code} value={f.code}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-heritage-green">Showpiece Description</label>
                  <textarea
                    rows={2}
                    value={editingItem.description || ''}
                    onChange={e => setEditingItem({ ...editingItem, description: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-sans text-xs"
                    placeholder="Describe the aesthetic flow, embroidery details, and mandarin collar options..."
                  />
                </div>
                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-gold text-heritage-forest font-bold rounded-lg border border-heritage-gold/20">Save Showpiece Combo</button>
                </div>
              </form>
            )}

            {editingType === 'photo' && (
              <form onSubmit={handleSavePhoto} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Photo ID (Unique Key)</label>
                  <input
                    type="text"
                    required
                    disabled={!isNewRecord}
                    value={editingItem.id}
                    onChange={e => setEditingItem({ ...editingItem, id: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold font-mono"
                    placeholder="e.g. photo-6"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Delivery Year</label>
                  <input
                    type="number"
                    required
                    value={editingItem.deliveryYear || 2026}
                    onChange={e => setEditingItem({ ...editingItem, deliveryYear: parseInt(e.target.value) || 2026 })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                    placeholder="e.g. 2026"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Cohort Name</label>
                  <input
                    type="text"
                    required
                    value={editingItem.cohortName || ''}
                    onChange={e => setEditingItem({ ...editingItem, cohortName: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                    placeholder="e.g. Group 3 — The Sovereign Cohort"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Display Order</label>
                  <input
                    type="number"
                    required
                    value={editingItem.displayOrder || 1}
                    onChange={e => setEditingItem({ ...editingItem, displayOrder: parseInt(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg focus:ring-1 focus:ring-heritage-gold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Gallery Status</label>
                  <select
                    value={editingItem.status || 'active'}
                    onChange={e => setEditingItem({ ...editingItem, status: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="active">Active (Visible in Gallery Slider)</option>
                    <option value="inactive">Inactive (Hidden from Client View)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-heritage-green">Featured Status</label>
                  <select
                    value={editingItem.featured ? 'yes' : 'no'}
                    onChange={e => setEditingItem({ ...editingItem, featured: e.target.value === 'yes' })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg"
                  >
                    <option value="yes">Yes (Featured Showcase)</option>
                    <option value="no">No (Standard Showcase)</option>
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-heritage-green">Community Caption</label>
                  <textarea
                    rows={2}
                    required
                    value={editingItem.caption || ''}
                    onChange={e => setEditingItem({ ...editingItem, caption: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-sans text-xs"
                    placeholder="Describe who is wearing what traditional attire in this shot..."
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <label className="font-bold text-heritage-green block">Client Attire Photo Image</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter absolute Unsplash URL or drag/drop file below"
                    value={editingItem.url || ''}
                    onChange={e => setEditingItem({ ...editingItem, url: e.target.value })}
                    className="w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg font-mono text-[10px]"
                  />

                  {/* Drag and Drop Swatch Area for Photo */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('photo-file-input')?.click()}
                    className={`relative h-28 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-4 transition-all cursor-pointer overflow-hidden ${
                      isDragging 
                        ? 'border-heritage-gold bg-heritage-gold/10' 
                        : 'border-heritage-gold/30 hover:border-heritage-gold hover:bg-heritage-forest/5'
                    }`}
                  >
                    <input
                      type="file"
                      id="photo-file-input"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {editingItem.url ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group">
                        <img loading="lazy" 
                          src={editingItem.url} 
                          alt="Photo Preview" 
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[9px]">
                          <Upload size={14} className="mb-1" />
                          <span>Replace Image File</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-1 text-heritage-ink/70">
                        <Upload size={16} className="mx-auto text-heritage-gold" />
                        <p className="text-[10px] font-semibold">Drag &amp; drop attire image, or click to browse</p>
                        <p className="text-[9px] text-gray-400">Supports PNG, JPG, WebP (Converts to high-res data URL)</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="sm:col-span-2 pt-4 flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditingType(null)} className="px-4 py-2 bg-gray-100 rounded-lg font-bold">Cancel</button>
                  <button type="submit" className="px-4 py-2 bg-heritage-green text-heritage-gold font-bold rounded-lg border border-heritage-gold/20">Save Community Photo</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ACTIVE TAB RENDER VIEWS */}

        {activeTab === 'documentation' && (
          <div className="space-y-8 text-left">
            {/* Database Cards Overview HUD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                <div className="h-9 w-9 bg-heritage-gold/10 text-heritage-gold rounded-xl flex items-center justify-center border border-heritage-gold/15">
                  <Layers2 size={18} />
                </div>
                <h3 className="text-sm font-bold text-heritage-green tracking-tight">Relational Integrity Mapping</h3>
                <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                  Strict foreign key definitions ensure order fabric codes connect beautifully with live warehouse fabric quantities.
                </p>
                <div className="pt-2 text-[10px] text-heritage-gold font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>5 Normalized Tables Live</span>
                  <ChevronRight size={10} />
                </div>
              </div>

              <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                <div className="h-9 w-9 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                  <Database size={18} />
                </div>
                <h3 className="text-sm font-bold text-heritage-green tracking-tight">Active State Syncing</h3>
                <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                  Direct React context linkage. Updating stock levels or style prices here updates options inside Design Studio.
                </p>
                <div className="pt-2 text-[10px] text-heritage-green font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>Zero Delay Propagated</span>
                  <ChevronRight size={10} />
                </div>
              </div>

              <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 space-y-3 shadow-sm hover:border-heritage-gold/30 transition-all">
                <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
                  <Sliders size={18} />
                </div>
                <h3 className="text-sm font-bold text-heritage-green tracking-tight">Escrow Tracking Audit</h3>
                <p className="text-[11px] text-heritage-ink/75 leading-relaxed">
                  Track stages 1 to 6 to safely release 50% deposits from Schiphol custom ports directly to Lagos weavers.
                </p>
                <div className="pt-2 text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>Stages 1 - 6 Audited</span>
                  <ChevronRight size={10} />
                </div>
              </div>
            </div>

            {/* Entity-Relationship ERD Diagram */}
            <div className="bg-heritage-forest/20 border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 space-y-6 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-heritage-gold/10 pb-4">
                <div>
                  <h3 className="text-base sm:text-lg font-serif font-semibold text-heritage-green">
                    Odogwu Heritage Database ER Architecture
                  </h3>
                  <p className="text-[11px] text-heritage-ink/70">
                    Visualizing table linkages, primary key constraints, and normalized connections.
                  </p>
                </div>
                <span className="self-start sm:self-auto inline-flex items-center gap-1 px-2.5 py-0.5 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/20 rounded-md text-[9px] font-bold uppercase tracking-widest">
                  <ShieldCheck size={10} /> 3NF Normalized Schema
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Table: Users */}
                <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                    <span className="text-[11px] font-bold font-serif tracking-wider">Users_Customers</span>
                    <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">Accounts</span>
                  </div>
                  <div className="p-3.5 space-y-2 text-[10px] font-mono">
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="font-bold text-heritage-green">email (PK)</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>name</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>phone</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>location</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>role</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="text-heritage-gold">measurements (JSON)</span>
                      <span className="text-gray-400">JSONB</span>
                    </div>
                  </div>
                </div>

                {/* Table: Fabrics */}
                <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                    <span className="text-[11px] font-bold font-serif tracking-wider">Fabrics_Catalogue</span>
                    <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">Inventory</span>
                  </div>
                  <div className="p-3.5 space-y-2 text-[10px] font-mono">
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="font-bold text-heritage-green">fabric_code (PK)</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>name</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>category</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>multiplier</span>
                      <span className="text-gray-400">FLOAT</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>price</span>
                      <span className="text-gray-400">DECIMAL</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>stock_quantity</span>
                      <span className="text-gray-400">INTEGER</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>color_hex</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                  </div>
                </div>

                {/* Table: Master Orders */}
                <div className="bg-white border border-heritage-gold/15 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                  <div className="bg-heritage-green text-heritage-gold px-4 py-2 flex items-center justify-between border-b border-heritage-gold/15">
                    <span className="text-[11px] font-bold font-serif tracking-wider">Master_Orders</span>
                    <span className="text-[8px] font-mono bg-heritage-forest/40 px-1 py-0.5 rounded text-heritage-beige">Pipeline</span>
                  </div>
                  <div className="p-3.5 space-y-2 text-[10px] font-mono">
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="font-bold text-heritage-green">tracking_id (PK)</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="text-heritage-gold">customer_email (FK)</span>
                      <span className="text-gray-400">VARCHAR 🔗</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span className="text-heritage-gold">fabric_code (FK)</span>
                      <span className="text-gray-400">VARCHAR 🔗</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>style_id</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>payment_status</span>
                      <span className="text-gray-400">VARCHAR</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>tracking_stage</span>
                      <span className="text-gray-400">INTEGER</span>
                    </div>
                    <div className="flex justify-between pb-1 border-b border-gray-100">
                      <span>leftover_fabric_instructions</span>
                      <span className="text-gray-400">TEXT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search accounts by name or email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    name: '',
                    email: '',
                    phone: '',
                    location: 'ASML Veldhoven Building 4',
                    role: 'Active Cohort Member',
                    passcode: '1960',
                    measurementProfile: {
                      height: 180, weight: 78, age: 32, bodyBuild: 'Average', fitPreference: 'Standard',
                      neck: 16, shoulder: 18.5, chest: 41.5, waist: 36, hip: 39, sleeve: 24.5, trouserLength: 40, isAiEstimated: true
                    }
                  });
                  setEditingType('user');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Add New User
              </button>
            </div>

            <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                      <th className="px-4 py-3">Customer Email (Key)</th>
                      <th className="px-4 py-3">Full Name</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Campus Location</th>
                      <th className="px-4 py-3">Role Class</th>
                      <th className="px-4 py-3">PIN</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No accounts registered in localStorage schema.</td>
                      </tr>
                    ) : (
                      filteredCustomers.map(c => (
                        <tr key={c.email} className="hover:bg-heritage-forest/5 transition">
                          <td className="px-4 py-3 font-mono font-bold text-heritage-green">{c.email}</td>
                          <td className="px-4 py-3 font-semibold text-heritage-ink">{c.name}</td>
                          <td className="px-4 py-3 text-gray-500">{c.phone || 'N/A'}</td>
                          <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]">{c.location}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20">
                              {c.role || 'Active Cohort Member'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-400 select-all">{c.passcode || '1960'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => {
                                  setIsNewRecord(false);
                                  setEditingItem(c);
                                  setEditingType('user');
                                }}
                                className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                title="Edit Customer profile"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(c.email)}
                                className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                title="Delete user"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'styles' && (
          <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search styles..."
                  value={styleSearch}
                  onChange={e => setStyleSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    id: `style-${Date.now().toString().slice(-4)}`,
                    name: '',
                    description: '',
                    basePrice: 150,
                    gender: 'unisex',
                    options: ['Standard Collar', 'Agbada Over-shirt', 'Embroidery Work']
                  });
                  setEditingType('style');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Add Style Class
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredStyles.map(s => (
                <div key={s.id} className="bg-white border border-heritage-gold/15 rounded-2xl p-5 space-y-3 shadow-sm hover:border-heritage-gold/30 transition flex flex-col justify-between">
                  <div className="flex gap-4">
                    {s.image && (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-heritage-cream border border-heritage-gold/10 shadow-sm shrink-0">
                        <img 
                          loading="lazy"
                          src={s.image} 
                          alt={s.name} 
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="space-y-2 flex-grow min-w-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-serif font-bold text-sm text-heritage-green">{s.name}</h4>
                          <p className="font-mono text-[9px] text-gray-400">ID: {s.id}</p>
                        </div>
                        <span className="text-sm font-black text-heritage-green bg-heritage-forest/5 border border-heritage-gold/10 px-2.5 py-0.5 rounded-lg shrink-0 ml-2">
                          €{s.basePrice}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-normal line-clamp-2">{s.description}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wider">
                          {s.gender}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-500 uppercase tracking-wider">
                          {s.outfitType || 'Full Outfit'}
                        </span>
                        {s.fabricCategory && s.fabricCategory !== 'Any' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-heritage-gold/10 text-heritage-gold uppercase tracking-wider">
                            {s.fabricCategory}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          s.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          Difficulty: {s.difficulty || 'Medium'}
                        </span>
                      </div>
                      {s.detectedColors && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[9px] font-bold text-gray-400">Garment Colors:</span>
                          <div className="flex gap-1">
                            <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: s.detectedColors.main }} title={s.detectedColors.main}></div>
                            <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: s.detectedColors.secondary }} title={s.detectedColors.secondary}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    {s.constructionDetails && s.constructionDetails.length > 0 && (
                      <div className="pt-2 border-t border-gray-50 mt-2 space-y-1">
                        <span className="text-[10px] font-bold text-heritage-green block">Garment Construction Details:</span>
                        <div className="flex flex-wrap gap-1">
                          {s.constructionDetails.map((c: any, i: number) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-heritage-green/5 text-heritage-green border border-heritage-gold/20">
                              {c.code} (€{c.price})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-50">
                    <button 
                      onClick={() => {
                        setIsNewRecord(false);
                        setEditingItem(s);
                        setEditingType('style');
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold bg-heritage-forest/10 hover:bg-heritage-green hover:text-heritage-gold text-heritage-green rounded-lg transition flex items-center gap-1"
                    >
                      <Edit2 size={10} /> Edit Garment Option
                    </button>
                    <button 
                      onClick={() => handleDuplicateStyle(s)}
                      className="p-1.5 bg-gray-50 text-gray-600 hover:bg-heritage-green/10 hover:text-heritage-green rounded-lg transition flex items-center justify-center"
                      title="Duplicate Garment Option"
                    >
                      <Copy size={12} />
                    </button>
                    <button 
                      onClick={() => handleDeleteStyle(s.id)}
                      className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition flex items-center justify-center"
                      title="Delete Garment Option"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'fabrics' && (
          <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search fabric list..."
                  value={fabricSearch}
                  onChange={e => setFabricSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    code: `ODG-${Math.floor(800 + Math.random() * 200)}`,
                    name: '',
                    description: 'Premium Nigerian Traditional weave.',
                    category: 'Printed Fabrics',
                    priceMultiplier: 1.2,
                    color: 'Multi',
                    colorHex: '#2e3a1e',
                    stock: 30,
                    width: '45 inches',
                    manufacturer: 'Lagos Sourcing Mills'
                  });
                  setEditingType('fabric');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Add Fabric Code
              </button>
            </div>

            <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                      <th className="px-4 py-3">Code (Key)</th>
                      <th className="px-4 py-3">Fabric Image &amp; Name</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Multiplier</th>
                      <th className="px-4 py-3">Computed Price</th>
                      <th className="px-4 py-3">Quantity (Yds)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredFabrics.map(f => (
                      <tr key={f.code} className="hover:bg-heritage-forest/5 transition">
                        <td className="px-4 py-3 font-mono font-bold text-heritage-green">{f.code}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span 
                              className="h-5 w-5 rounded-full border border-gray-300 shrink-0"
                              style={{ backgroundColor: f.colorHex }}
                            />
                            <div>
                              <p className="font-semibold text-heritage-ink leading-tight">{f.name}</p>
                              <p className="text-[9px] text-gray-400 line-clamp-1">{f.manufacturer}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{f.category}</td>
                        <td className="px-4 py-3 font-mono text-gray-600">{f.priceMultiplier}x</td>
                        <td className="px-4 py-3 font-bold text-heritage-green">€{f.price || Math.round(35 * f.priceMultiplier)}</td>
                        <td className="px-4 py-3 font-mono text-gray-600">{f.stock}</td>
                        <td className="px-4 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            f.stock <= 0 ? 'bg-red-100 text-red-700' : f.stock <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {f.stock <= 0 ? 'Out of Stock' : f.stock <= 5 ? 'Low Stock' : 'In Stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                           <div className="flex gap-2 justify-end">
                             <button 
                               onClick={() => {
                                 const currentStock = f.stock ?? 30;
                                 const newStock = currentStock <= 0 ? 30 : 0;
                                 const finalItem: Fabric = {
                                   ...f,
                                   stock: newStock,
                                   stockStatus: newStock <= 0 ? 'Out of Stock' : 'In Stock'
                                 };
                                 setFabrics(prev => prev.map(item => item.code.toUpperCase() === f.code.toUpperCase() ? finalItem : item));
                                 triggerStatus(newStock <= 0 ? `Marked ${f.name} as Out of Stock!` : `Restocked ${f.name} to 30 yards!`);
                               }}
                               className={`p-1.5 rounded transition ${
                                 (f.stock ?? 30) <= 0 
                                   ? 'bg-green-50 hover:bg-green-100 text-green-700' 
                                   : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                               }`}
                               title={(f.stock ?? 30) <= 0 ? "Restock to 30 yds" : "Mark Out of Stock"}
                             >
                               {(f.stock ?? 30) <= 0 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                             </button>
                             <button 
                               onClick={() => {
                                 setIsNewRecord(false);
                                 setEditingItem(f);
                                 setEditingType('fabric');
                               }}
                               className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                               title="Edit fabric settings"
                             >
                               <Edit2 size={12} />
                             </button>
                             <button 
                               onClick={() => handleDeleteFabric(f.code)}
                               className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                               title="Delete fabric"
                             >
                               <Trash2 size={12} />
                             </button>
                           </div>
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'batches' && (
          <div className="space-y-6 text-left">
            {/* Business Intelligence Engine: Production Analytics */}
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm mb-6">
              <h3 className="font-serif font-bold text-lg text-heritage-green mb-4">Business Intelligence: Production Analytics</h3>
              {(() => {
                const analytics = BusinessIntelligenceEngine.getBatchAnalytics(batches, businessSettings);
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Total Garments</span>
                      <strong className="text-2xl text-heritage-green font-mono">{analytics.totalGarments}</strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Total Customers</span>
                      <strong className="text-2xl text-heritage-green font-mono">{analytics.totalCustomers}</strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Garments / Customer</span>
                      <strong className="text-2xl text-heritage-green font-mono">
                        {analytics.avgGarmentsPerCustomer}
                      </strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Avg Order Size</span>
                      <strong className="text-2xl text-heritage-green font-mono">
                        {analytics.avgOrderSize}
                      </strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Est. Production Hours</span>
                      <strong className="text-2xl text-heritage-green font-mono">{analytics.estimatedProductionHours}h</strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Production Efficiency</span>
                      <strong className="text-2xl text-heritage-green font-mono text-green-600">{analytics.productionEfficiency}</strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Current Batch Capacity</span>
                      <strong className="text-2xl text-heritage-green font-mono">
                        {(() => {
                          const active = batches.find(b => ['Open', 'Recruiting', 'Almost Full', 'In Progress'].includes(b.status));
                          return active ? `${BusinessIntelligenceEngine.calculateCapacityPercentage(active, businessSettings)}%` : 'N/A';
                        })()}
                      </strong>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Est. Completion Date</span>
                      <strong className="text-xl text-heritage-green font-sans mt-1 block">
                        {(() => {
                          const active = batches.find(b => ['Open', 'Recruiting', 'Almost Full', 'In Progress'].includes(b.status));
                          return active?.estimatedDelivery || 'TBD';
                        })()}
                      </strong>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Fabric Forecast Engine */}
              <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                  <span className="text-heritage-gold">🧵</span> Fabric Forecast Engine
                </h3>
                {(() => {
                  const active = batches.find(b => ['Open', 'Recruiting', 'Almost Full', 'In Progress'].includes(b.status));
                  if (!active) return <p className="text-xs text-gray-500">No active production batch.</p>;
                  
                  const requiredYards = active.fabricForecast?.requiredYards || active.currentGarments * 6.5; // default estimate
                  const requiredRolls = active.fabricForecast?.requiredRolls || Math.ceil(requiredYards / 6);
                  const inventoryStatus = active.fabricForecast?.inventoryStatus || 'Sufficient';
                  
                  return (
                    <div className="space-y-4 text-xs">
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Active Batch</span>
                        <strong className="text-heritage-green">{active.name}</strong>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Target Garments</span>
                        <strong className="text-heritage-green">{active.targetGarments} Garments</strong>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Estimated Fabric</span>
                        <strong className="text-heritage-green">{Math.round(requiredYards)} Yards</strong>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Fabric Rolls Required</span>
                        <strong className="text-heritage-green">{requiredRolls} Pieces</strong>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Inventory Status</span>
                        <strong className={`px-2 py-0.5 rounded-full ${inventoryStatus === 'Sufficient' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {inventoryStatus}
                        </strong>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Shipping Intelligence */}
              <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
                <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                  <span className="text-heritage-gold">✈️</span> Shipping Intelligence
                </h3>
                {(() => {
                  const active = batches.find(b => ['Open', 'Recruiting', 'Almost Full', 'In Progress'].includes(b.status));
                  if (!active) return <p className="text-xs text-gray-500">No active production batch.</p>;
                  
                  const pkgs = active.shippingForecast?.totalPackages || Math.ceil(active.currentOrders * 1.2);
                  const weight = active.shippingForecast?.estimatedWeightKg || pkgs * 2.5;
                  const volume = active.shippingForecast?.estimatedVolumeCbm || pkgs * 0.05;
                  const tier = active.shippingForecast?.shippingTier || 'Air Freight (Standard)';
                  const cost = active.shippingForecast?.expectedTransportCost || weight * 8.5;

                  return (
                    <div className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <span className="block text-gray-500 mb-1">Total Packages</span>
                          <strong className="text-lg text-heritage-green">{pkgs}</strong>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <span className="block text-gray-500 mb-1">Est. Weight</span>
                          <strong className="text-lg text-heritage-green">{Math.round(weight)} kg</strong>
                        </div>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Est. Volume</span>
                        <strong className="text-heritage-green">{volume.toFixed(2)} cbm</strong>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Shipping Tier</span>
                        <strong className="text-heritage-green">{tier}</strong>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                        <span className="text-gray-500">Expected Transport Cost</span>
                        <strong className="text-heritage-green">€{cost.toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Pickup Location</span>
                        <strong className="text-heritage-green">{active.pickupLocation}</strong>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search custom batches..."
                  value={batchSearch}
                  onChange={e => setBatchSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    id: `batch-${Date.now().toString().slice(-4)}`,
                    batchNumber: batches.length + 1,
                    name: '',
                    startDate: '',
                    endDate: '',
                    duration: '',
                    targetGarments: 30,
                    currentGarments: 0,
                    currentOrders: 0,
                    currentCustomers: 0,
                    status: 'Yet To Start',
                    pickupLocation: 'ASML Veldhoven Campus',
                    visibility: 'Public'
                  });
                  setEditingType('batch');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Create Sourcing Batch
              </button>
            </div>

            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {filteredBatches.sort((a, b) => a.batchNumber - b.batchNumber).map(b => (
                <div key={b.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-white shadow-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 text-xl text-center shadow-heritage-gold/20">
                     {b.status === 'Completed' ? '✅' : ['Production Ready', 'Production Started', 'Quality Control'].includes(b.status) ? '🧵' : ['Packed', 'Shipped', 'Arrived Netherlands', 'Ready For Pickup'].includes(b.status) ? '✈️' : '🕒'}
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white border border-heritage-gold/15 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-serif font-bold text-sm text-heritage-green">{b.name}</h4>
                        <p className="font-mono text-[9px] text-gray-400">BATCH #{b.batchNumber}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        ['Open', 'Recruiting', 'Almost Full'].includes(b.status) ? 'bg-green-100 text-green-700' : 
                        ['Production Started', 'Quality Control', 'Production Ready'].includes(b.status) ? 'bg-blue-100 text-blue-700' :
                        b.status === 'Completed' ? 'bg-gray-100 text-gray-700' :
                        ['Yet To Start', 'Draft'].includes(b.status) ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="text-xs space-y-1 text-gray-600">
                      <p>📅 <strong className="text-heritage-green">Timeline:</strong> {b.duration}</p>
                      <p>📦 <strong className="text-heritage-green">Est. Delivery:</strong> {b.estimatedDelivery}</p>
                      <div className="pt-2 border-t border-gray-100 mt-2">
                         <div className="flex justify-between items-end mb-1">
                            <span className="text-[10px] font-bold text-heritage-green uppercase tracking-wider">Garments</span>
                            <span className="text-[10px] font-mono font-bold text-heritage-gold">{b.currentGarments} / {b.targetGarments}</span>
                         </div>
                         <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                           <div className="h-full bg-heritage-green" style={{ width: `${Math.min(100, (b.currentGarments / b.targetGarments) * 100)}%` }}></div>
                         </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-50 mt-3">
                      <button 
                        onClick={() => {
                          setIsNewRecord(false);
                          setEditingItem(b);
                          setEditingType('batch');
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold bg-heritage-forest/10 hover:bg-heritage-green hover:text-heritage-gold text-heritage-green rounded-lg transition"
                      >
                        Configure Batch
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search orders by tracking, customer name..."
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    customer: customers[0] || {
                      name: 'Guest User',
                      email: 'guest@asml.com',
                      phone: '',
                      location: 'ASML Veldhoven'
                    },
                    style: styles[0] || { id: 'style-kaftan', name: 'Standard Senator', basePrice: 150 },
                    fabric: fabrics[0] || { code: 'ODG-801', name: 'Traditional Ankara' },
                    design: {
                      collar: 'Mandarin High Collar',
                      embroidery: 'Geometric embroidery',
                      sleeve: 'Long Sleeve',
                      pocket: 'Side pocket',
                      additionalCap: false,
                      hemFinish: 'Split sides'
                    },
                    garment: {
                      type: 'Shirt + Trouser Set',
                      tailoringFee: 45,
                      totalPrice: 195
                    },
                    measurements: {
                      height: 180, weight: 78, age: 32, bodyBuild: 'Average', fitPreference: 'Standard',
                      neck: 16, shoulder: 18.5, chest: 41.5, waist: 36, hip: 39, sleeve: 24.5, trouserLength: 40, isAiEstimated: true
                    },
                    payment: {
                      subtotal: 195, deposit: 97.5, remaining: 97.5,
                      method: 'Escrow Portal Transaction', date: 'June 26, 2026', isPaid: true
                    },
                    shipment: {
                      trackingId: `ODH-${Date.now().toString().slice(-4)}`,
                      status: 'Pattern Drafting & Sewing on Lagos floor',
                      currentStage: 3,
                      estimatedDeliveryDate: 'May 30'
                    },
                    specialInstructions: 'Ensure loose comfort fits',
                    notesAboutLeftoverFabric: 'Sew traditional fila cap'
                  });
                  setEditingType('order');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Manually Place Order
              </button>
              <button
                type="button"
                onClick={handleExportManifest}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-gold hover:bg-heritage-gold/80 text-heritage-forest text-xs font-bold rounded-xl border border-heritage-gold/30 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0 transition disabled:opacity-50"
              >
                {isExporting ? (
                  <span className="animate-spin inline-block h-3 w-3 border-2 border-heritage-forest border-t-transparent rounded-full" />
                ) : (
                  <Download size={13} />
                )}
                Export Manifest
              </button>
            </div>

            <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                      <th className="px-4 py-3">Tracking ID (PK)</th>
                      <th className="px-4 py-3">Customer (FK Connection)</th>
                      <th className="px-4 py-3">Fabric &amp; Style Selected</th>
                      <th className="px-4 py-3">Total Cost</th>
                      <th className="px-4 py-3">Payment Ledgers (Deposit &amp; Balance)</th>
                      <th className="px-4 py-3">Tracking Stage</th>
                      <th className="px-4 py-3">Leftover fabric instructions</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No active custom selections registered.</td>
                      </tr>
                    ) : (
                      filteredOrders.map(o => (
                        <tr key={o.shipment.trackingId} className="hover:bg-heritage-forest/5 transition">
                          <td className="px-4 py-3 font-mono font-bold text-heritage-green">{o.shipment.trackingId}</td>
                          <td className="px-4 py-3 space-y-0.5">
                            <p className="font-semibold text-heritage-ink leading-tight">{o.customer.name}</p>
                            <p className="text-[9px] text-gray-400 font-mono">{o.customer.email}</p>
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <span className="inline-block px-1.5 py-0.5 bg-heritage-forest/5 text-heritage-green rounded font-semibold text-[10px]">
                              👕 {o.style.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span 
                                className="h-2 w-2 rounded-full border border-gray-300" 
                                style={{ backgroundColor: o.fabric.colorHex }}
                              />
                              <span className="text-[9px] text-gray-500 font-mono">{o.fabric.name} ({o.fabric.code})</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-heritage-green">
                            €{(o.garment.totalPrice || o.payment.subtotal).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 w-fit">
                                🟢 Deposit (€{o.payment.deposit.toFixed(2)}) Paid ({o.payment.paymentMethod || 'Stripe'})
                              </span>
                              {o.payment.secondPaymentStatus === 'paid' ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 w-fit">
                                  🔵 Balance (€{o.payment.remaining.toFixed(2)}) Paid ({o.payment.secondPaymentMethod || 'Stripe'})
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-fit">
                                    🟡 Balance (€{o.payment.remaining.toFixed(2)}) Unpaid
                                  </span>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleChargeBalance(o)}
                                      className="px-1.5 py-0.5 bg-heritage-green text-white font-mono text-[8px] font-bold rounded hover:bg-heritage-gold transition uppercase tracking-wider"
                                      title="Charge the saved card on file securely via Stripe Customer object"
                                    >
                                      ⚡ Charge Card
                                    </button>
                                    <button
                                      onClick={() => handleSendPaymentLink(o)}
                                      className="px-1.5 py-0.5 bg-gray-100 text-gray-700 font-mono text-[8px] rounded hover:bg-gray-200 transition uppercase tracking-wider"
                                      title="Send direct email invoice with payment page link"
                                    >
                                      ✉️ Send Link
                                    </button>
                                  </div>
                                </div>
                              )}
                              {(o.payment.lockerPasscode || o.payment.secondPaymentStatus === 'paid') && (
                                <span className="inline-block font-mono text-[9px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 w-fit font-bold">
                                  🔑 Locker PIN: {o.payment.lockerPasscode || 'B4-03-4910'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25">
                                Stage {o.shipment.currentStage || 1} of 6
                              </span>
                              <p className="text-[9px] text-gray-400 max-w-[150px] truncate">{o.shipment.status}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 italic max-w-[120px] truncate" title={o.notesAboutLeftoverFabric}>
                            {o.notesAboutLeftoverFabric || 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => {
                                  setIsNewRecord(false);
                                  setEditingItem(o);
                                  setEditingType('order');
                                }}
                                className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                title="Edit order / update tracking stage"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button 
                                onClick={() => handleDeleteOrder(o.shipment.trackingId)}
                                className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'showpieces' && (
          <div className="space-y-6 text-left">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search showpieces by title, tag, style..."
                  value={showpieceSearch}
                  onChange={e => setShowpieceSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <button
                onClick={() => {
                  setIsNewRecord(true);
                  setEditingItem({
                    id: `item-${Date.now().toString().slice(-4)}`,
                    title: '',
                    category: 'male',
                    styleId: styles[0]?.id || 'royal-senator',
                    fabricCode: fabrics[0]?.code || 'ODG-902',
                    styleName: styles[0]?.name || 'Royal Senator',
                    fabricName: fabrics[0]?.name || 'Royal Emerald Cotton',
                    colorHex: fabrics[0]?.colorHex || '#0D3E26',
                    description: '',
                    tag: 'New'
                  });
                  setEditingType('showpiece');
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0"
              >
                <Plus size={13} /> Add Lookbook Showpiece
              </button>
            </div>

            <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                      <th className="px-4 py-3">Showpiece ID</th>
                      <th className="px-4 py-3">Title &amp; Highlight</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Style Class Link (FK)</th>
                      <th className="px-4 py-3">Fabric Sourcing (FK)</th>
                      <th className="px-4 py-3">Aesthetic Swatch</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {showpieces.filter(s => 
                      s.title.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                      s.tag.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                      s.description.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                      s.styleName.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                      s.fabricName.toLowerCase().includes(showpieceSearch.toLowerCase())
                    ).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No matching showpiece combinations found.</td>
                      </tr>
                    ) : (
                      showpieces.filter(s => 
                        s.title.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                        s.tag.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                        s.description.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                        s.styleName.toLowerCase().includes(showpieceSearch.toLowerCase()) ||
                        s.fabricName.toLowerCase().includes(showpieceSearch.toLowerCase())
                      ).map(s => (
                        <tr key={s.id} className="hover:bg-heritage-forest/5 transition">
                          <td className="px-4 py-3 font-mono font-bold text-heritage-green">{s.id}</td>
                          <td className="px-4 py-3 space-y-1">
                            <p className="font-semibold text-heritage-ink leading-tight">{s.title}</p>
                            <p className="text-[10px] text-gray-500 leading-snug">{s.description}</p>
                            {s.tag && (
                              <span className="inline-block px-2 py-0.5 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25 rounded-md font-bold text-[9px] uppercase tracking-wider">
                                {s.tag}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 capitalize font-semibold text-heritage-ink">
                            {s.category === 'male' ? "Men's Attire" : s.category === 'female' ? "Women's Couture" : "Raw Fabric"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-block px-2 py-0.5 bg-heritage-forest/5 text-heritage-green rounded font-semibold text-[10px]">
                              👔 {s.styleName} ({s.styleId})
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-gray-500">
                            {s.fabricName} ({s.fabricCode})
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span 
                                className="h-4 w-4 rounded-full border border-gray-300 shadow-sm" 
                                style={{ backgroundColor: s.colorHex }}
                              />
                              <span className="font-mono text-[9px] text-gray-400 select-all">{s.colorHex}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => {
                                    setIsNewRecord(false);
                                    setEditingItem(s);
                                    setEditingType('showpiece');
                                }}
                                className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button 
                                onClick={() => handleDeleteShowpiece(s.id)}
                                className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="space-y-6 text-left">
            {/* Cohorts Management Panel */}
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm mb-8">
              <h3 className="font-serif font-bold text-lg text-heritage-green mb-4 flex items-center gap-2">
                <Users size={18} /> Cohorts & Groups Management
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Define the groups/cohorts (e.g. Sample from Group 1, Cohort 2026) that organize community gallery photos.
              </p>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-heritage-green text-sm">Sample from Group 1</h4>
                      <p className="text-[10px] text-gray-500">Currently active in gallery</p>
                    </div>
                    <button className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-lg font-bold hover:bg-gray-50">Manage</button>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-heritage-green text-sm">Sample from Group 2</h4>
                      <p className="text-[10px] text-gray-500">Currently active in gallery</p>
                    </div>
                    <button className="text-[10px] bg-white border border-gray-200 px-3 py-1 rounded-lg font-bold hover:bg-gray-50">Manage</button>
                  </div>
                </div>
                <div className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 flex-1 cursor-pointer hover:bg-gray-50 transition">
                  <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><Plus size={14} /> Add New Group</span>
                </div>
              </div>
            </div>

            <h3 className="font-serif font-bold text-lg text-heritage-green flex items-center gap-2 mb-2">
              <Image size={18} /> Community Gallery Photos
            </h3>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-heritage-beige">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Search community gallery photos..."
                  value={photoSearch}
                  onChange={e => setPhotoSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-heritage-gold/20 rounded-xl text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 font-medium">
                  Capacity: {communityPhotos.length} / 20 photos
                </span>
                <button
                  onClick={() => {
                    if (communityPhotos.length >= 20) {
                      alert('Maximum capacity reached! The community photo gallery has a strict limit of 20 photos. Please delete some photos before adding new ones.');
                      return;
                    }
                    setIsNewRecord(true);
                    setEditingItem({
                      id: `photo-${Date.now().toString().slice(-4)}`,
                      url: '',
                      caption: '',
                      cohortName: 'Cohort ' + (new Date().getFullYear()),
                      deliveryYear: new Date().getFullYear(),
                      featured: true,
                      status: 'active',
                      displayOrder: communityPhotos.length + 1
                    });
                    setEditingType('photo');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-heritage-gold text-xs font-bold rounded-xl border border-heritage-gold/20 shadow-sm cursor-pointer select-none uppercase tracking-wider shrink-0 transition hover:bg-heritage-forest"
                >
                  <Plus size={13} /> Add Gallery Photo
                </button>
              </div>
            </div>

            <div className="bg-white border border-heritage-gold/15 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="bg-heritage-forest/20 border-b border-heritage-gold/15 text-heritage-green font-serif font-bold text-[10px] tracking-wider uppercase">
                      <th className="px-4 py-3 w-24">Preview</th>
                      <th className="px-4 py-3">Photo ID</th>
                      <th className="px-4 py-3">Caption</th>
                      <th className="px-4 py-3">Cohort Info</th>
                      <th className="px-4 py-3">Display Order</th>
                      <th className="px-4 py-3">Gallery Status</th>
                      <th className="px-4 py-3">Featured</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPhotos.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No community gallery photos found.</td>
                      </tr>
                    ) : (
                      [...filteredPhotos].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map(p => (
                        <tr key={p.id} className="hover:bg-heritage-forest/5 transition">
                          <td className="px-4 py-3">
                            <div className="h-12 w-12 rounded-lg border border-heritage-gold/15 overflow-hidden bg-gray-50 flex items-center justify-center">
                              {p.url ? (
                                <img loading="lazy"
                                  src={p.url}
                                  alt={p.caption}
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <Image size={16} className="text-gray-300" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-heritage-green">{p.id}</td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="text-heritage-ink font-medium leading-tight line-clamp-2" title={p.caption}>
                              {p.caption}
                            </p>
                          </td>
                          <td className="px-4 py-3 space-y-0.5">
                            <p className="font-semibold text-heritage-ink leading-tight">{p.cohortName}</p>
                            <p className="text-[9px] text-gray-400 font-mono">Delivered: {p.deliveryYear}</p>
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-gray-500">
                            {p.displayOrder || 0}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              p.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-50 text-gray-400 border border-gray-200'
                            }`}>
                              {p.status === 'active' ? '● Active' : '○ Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              p.featured
                                ? 'bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/25'
                                : 'bg-gray-50 text-gray-400 border border-gray-200'
                            }`}>
                              {p.featured ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-2 justify-end">
                              <div className="flex flex-col gap-0.5">
                                <button
                                  disabled={p.displayOrder === 1}
                                  onClick={() => {
                                    if (setCommunityPhotos) {
                                      setCommunityPhotos(prev => {
                                        const currentIdx = prev.findIndex(item => item.id === p.id);
                                        if (currentIdx <= 0) return prev;
                                        const updated = [...prev];
                                        const tempOrder = updated[currentIdx].displayOrder || 1;
                                        updated[currentIdx].displayOrder = updated[currentIdx - 1].displayOrder || 1;
                                        updated[currentIdx - 1].displayOrder = tempOrder;
                                        return updated;
                                      });
                                      triggerStatus('Adjusted display order!');
                                    }
                                  }}
                                  className="p-0.5 text-[9px] font-mono hover:text-heritage-gold transition disabled:opacity-30 cursor-pointer"
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button
                                  disabled={p.displayOrder === communityPhotos.length}
                                  onClick={() => {
                                    if (setCommunityPhotos) {
                                      setCommunityPhotos(prev => {
                                        const currentIdx = prev.findIndex(item => item.id === p.id);
                                        if (currentIdx === -1 || currentIdx >= prev.length - 1) return prev;
                                        const updated = [...prev];
                                        const tempOrder = updated[currentIdx].displayOrder || 1;
                                        updated[currentIdx].displayOrder = updated[currentIdx + 1].displayOrder || 1;
                                        updated[currentIdx + 1].displayOrder = tempOrder;
                                        return updated;
                                      });
                                      triggerStatus('Adjusted display order!');
                                    }
                                  }}
                                  className="p-0.5 text-[9px] font-mono hover:text-heritage-gold transition disabled:opacity-30 cursor-pointer"
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                              </div>

                              <button
                                onClick={() => {
                                  setIsNewRecord(false);
                                  setEditingItem(p);
                                  setEditingType('photo');
                                }}
                                className="p-1.5 bg-gray-50 hover:bg-heritage-green/10 text-heritage-green rounded transition"
                                title="Edit Photo Details"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeletePhoto(p.id)}
                                className="p-1.5 bg-gray-50 hover:bg-red-50 text-red-600 rounded transition"
                                title="Delete Photo"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-serif font-bold text-xl text-heritage-green">Central Business Rules</h3>
                  <p className="text-xs text-gray-500 mt-1">Configure global application variables. Changes propagate instantly across all modules.</p>
                </div>
                <button
                  onClick={() => triggerStatus('Settings saved successfully')}
                  className="bg-heritage-green text-heritage-gold hover:bg-heritage-forest px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                >
                  Save Configuration
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Batch Settings */}
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                    <Layers2 size={14} className="text-heritage-gold" /> Batch & Capacity Settings
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Minimum Garments Per Batch</label>
                      <input
                        type="number"
                        value={businessSettings.batchSettings.minGarmentsPerBatch}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, batchSettings: { ...prev.batchSettings, minGarmentsPerBatch: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Maximum Garments Per Batch</label>
                      <input
                        type="number"
                        value={businessSettings.batchSettings.maxGarmentsPerBatch}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, batchSettings: { ...prev.batchSettings, maxGarmentsPerBatch: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Minimum Participants Required</label>
                      <input
                        type="number"
                        value={businessSettings.batchSettings.minParticipantsRequired}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, batchSettings: { ...prev.batchSettings, minParticipantsRequired: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Default Community Batch Size</label>
                      <input
                        type="number"
                        value={businessSettings.batchSettings.defaultCommunityBatchSize}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, batchSettings: { ...prev.batchSettings, defaultCommunityBatchSize: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <label className="text-xs text-gray-600 font-medium">Auto-manage Batch Status Rules</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={businessSettings.batchSettings.automaticBatchStatusRules}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, batchSettings: { ...prev.batchSettings, automaticBatchStatusRules: e.target.checked } }))}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Shipping Settings */}
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                    <span className="text-heritage-gold">✈️</span> Shipping & Fulfillment Rates
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Community Batch Shipping Rate ({businessSettings.pricingSettings.currency})</label>
                      <input
                        type="number"
                        value={businessSettings.shippingSettings.communityBatchShippingRate}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, shippingSettings: { ...prev.shippingSettings, communityBatchShippingRate: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Individual Order Shipping ({businessSettings.pricingSettings.currency})</label>
                      <input
                        type="number"
                        value={businessSettings.shippingSettings.individualOrderShippingRate}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, shippingSettings: { ...prev.shippingSettings, individualOrderShippingRate: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Personalized Batch Shipping ({businessSettings.pricingSettings.currency})</label>
                      <input
                        type="number"
                        value={businessSettings.shippingSettings.personalizedBatchShippingRate}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, shippingSettings: { ...prev.shippingSettings, personalizedBatchShippingRate: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">International Delivery Surcharge</label>
                      <input
                        type="number"
                        value={businessSettings.shippingSettings.internationalDeliverySurcharge}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, shippingSettings: { ...prev.shippingSettings, internationalDeliverySurcharge: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Express Delivery Surcharge</label>
                      <input
                        type="number"
                        value={businessSettings.shippingSettings.expressDeliverySurcharge}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, shippingSettings: { ...prev.shippingSettings, expressDeliverySurcharge: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                  </div>
                </div>

                {/* Pricing Rules */}
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                    <span className="text-heritage-gold">€</span> Financial & Pricing Rules
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Required Deposit Percentage (%)</label>
                      <input
                        type="number"
                        value={businessSettings.pricingSettings.depositPercentage}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, pricingSettings: { ...prev.pricingSettings, depositPercentage: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Balance Percentage (%)</label>
                      <input
                        type="number"
                        disabled
                        value={100 - businessSettings.pricingSettings.depositPercentage}
                        className="w-24 px-2 py-1 text-right border border-gray-100 bg-gray-50 text-gray-400 rounded text-xs cursor-not-allowed"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Primary Currency</label>
                      <select
                        value={businessSettings.pricingSettings.currency}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, pricingSettings: { ...prev.pricingSettings, currency: e.target.value } }))}
                        className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold text-right"
                      >
                        <option value="EUR">EUR (€)</option>
                        <option value="USD">USD ($)</option>
                        <option value="NGN">NGN (₦)</option>
                      </select>
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">VAT / Tax Rate (%)</label>
                      <input
                        type="number"
                        value={businessSettings.pricingSettings.vatTaxPercentage}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, pricingSettings: { ...prev.pricingSettings, vatTaxPercentage: parseFloat(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <label className="text-xs text-gray-600 font-medium">Enable Global Discount Engine</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={businessSettings.pricingSettings.discountRulesEnabled}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, pricingSettings: { ...prev.pricingSettings, discountRulesEnabled: e.target.checked } }))}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Production Settings */}
                <div className="space-y-4">
                  <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                    <span className="text-heritage-gold">🧵</span> Production Timelines
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Production Start Threshold (%)</label>
                      <input
                        type="number"
                        value={businessSettings.productionSettings.productionStartThresholdPercentage}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, productionSettings: { ...prev.productionSettings, productionStartThresholdPercentage: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Est. Production Duration (Days)</label>
                      <input
                        type="number"
                        value={businessSettings.productionSettings.estimatedProductionDurationDays}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, productionSettings: { ...prev.productionSettings, estimatedProductionDurationDays: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Default Delivery Window (Days)</label>
                      <input
                        type="number"
                        value={businessSettings.productionSettings.defaultDeliveryWindowDays}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, productionSettings: { ...prev.productionSettings, defaultDeliveryWindowDays: parseInt(e.target.value) || 0 } }))}
                        className="w-24 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-gray-600 font-medium">Default Pickup Location</label>
                      <input
                        type="text"
                        value={businessSettings.productionSettings.defaultPickupLocation}
                        onChange={(e) => setBusinessSettings(prev => ({ ...prev, productionSettings: { ...prev.productionSettings, defaultPickupLocation: e.target.value } }))}
                        className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                      />
                    </div>
                  </div>
                </div>

                {/* Application Wide */}
                <div className="space-y-4 md:col-span-2">
                  <h4 className="font-bold text-sm text-heritage-green border-b border-gray-100 pb-2 flex items-center gap-2">
                    <span className="text-heritage-gold">🌐</span> Platform Branding & Announcements
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-600 font-medium">Community Name</label>
                        <input
                          type="text"
                          value={businessSettings.applicationSettings.communityName}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, applicationSettings: { ...prev.applicationSettings, communityName: e.target.value } }))}
                          className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-600 font-medium">Default Active Batch ID</label>
                        <input
                          type="text"
                          value={businessSettings.applicationSettings.defaultActiveBatchId}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, applicationSettings: { ...prev.applicationSettings, defaultActiveBatchId: e.target.value } }))}
                          className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-600 font-medium">Default Country Scope</label>
                        <input
                          type="text"
                          value={businessSettings.applicationSettings.defaultCountry}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, applicationSettings: { ...prev.applicationSettings, defaultCountry: e.target.value } }))}
                          className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-xs text-gray-600 font-medium">System Announcements</label>
                        <textarea
                          value={businessSettings.applicationSettings.systemAnnouncements}
                          onChange={(e) => setBusinessSettings(prev => ({ ...prev, applicationSettings: { ...prev.applicationSettings, systemAnnouncements: e.target.value } }))}
                          placeholder="Global notice banner text (empty to disable)..."
                          className="w-48 px-2 py-1 text-right border border-gray-200 rounded text-xs focus:outline-none focus:border-heritage-gold resize-none h-16"
                        />
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <label className="text-xs text-gray-600 font-medium">Enable Active Platform Notifications</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={businessSettings.applicationSettings.notificationMessagesEnabled}
                            onChange={(e) => setBusinessSettings(prev => ({ ...prev, applicationSettings: { ...prev.applicationSettings, notificationMessagesEnabled: e.target.checked } }))}
                            className="sr-only peer" 
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-heritage-green"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                  <strong>WordPress Integration Ready:</strong> This unified settings object is designed to serialize cleanly to a standard SQL options table or WordPress Settings API layer in future headless integrations.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* --- FOUNDATION TABS --- */}
        {activeTab === 'operations' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">Operations Command Centre</h2>
              <p className="text-sm text-heritage-ink/70 mb-6">Centralized production, shipping, and fabric forecasting dashboard.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                  <h3 className="font-bold text-blue-900 mb-2">Production Queue</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">Yet To Start</span>
                      <strong className="text-blue-900">4</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">In Production</span>
                      <strong className="text-blue-900">2</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-700">Quality Control</span>
                      <strong className="text-blue-900">1</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50/50 border border-green-100 p-4 rounded-xl">
                  <h3 className="font-bold text-green-900 mb-2">Shipping Forecast</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-green-700">Pending Shipment</span>
                      <strong className="text-green-900">28 Pkgs</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-700">In Transit</span>
                      <strong className="text-green-900">12 Pkgs</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-green-700">Arrived NL Hub</span>
                      <strong className="text-green-900">5 Pkgs</strong>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-xl">
                  <h3 className="font-bold text-amber-900 mb-2">Fabric Logistics</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700">Procuring</span>
                      <strong className="text-amber-900">420 Yds</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700">In Stock</span>
                      <strong className="text-amber-900">1,250 Yds</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700">Low Stock Alerts</span>
                      <strong className="text-amber-900">3 Fabrics</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'media' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold font-serif text-heritage-green">Global Media Library</h2>
                  <p className="text-sm text-heritage-ink/70">Centralized repository for all images, banners, and assets.</p>
                </div>
                <button className="flex items-center gap-2 bg-heritage-green text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-800 transition">
                  <Upload size={16} /> Upload Media
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {mediaLibrary.map(media => (
                  <div key={media.id} className="border border-gray-200 rounded-lg overflow-hidden group">
                    <div className="aspect-square bg-gray-100 relative">
                      <img src={media.url} alt={media.altText} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition">
                        <button className="h-8 w-8 bg-white text-gray-800 rounded-full flex items-center justify-center hover:bg-gray-100"><Edit2 size={14} /></button>
                        <button className="h-8 w-8 bg-white text-red-600 rounded-full flex items-center justify-center hover:bg-gray-100"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="p-2 text-xs truncate text-gray-700 font-medium">
                      {media.filename}
                    </div>
                  </div>
                ))}
                {mediaLibrary.length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-500 text-sm">
                    No media items found.
                  </div>
                )}
              </div>
              <div className="mt-6 bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                  <strong>WordPress Ready:</strong> This unified media library will seamlessly sync with the WordPress Media Library REST API in future releases.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plugins' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">Plugin Manager</h2>
              <p className="text-sm text-heritage-ink/70 mb-6">Manage external integrations and premium modules.</p>
              
              <div className="space-y-4">
                {plugins.map(plugin => (
                  <div key={plugin.id} className="border border-gray-200 rounded-xl p-4 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800">{plugin.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          plugin.status === 'active' ? 'bg-green-100 text-green-700' :
                          plugin.status === 'update_available' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {plugin.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{plugin.description}</p>
                      <p className="text-xs text-gray-400 mt-2 font-mono">v{plugin.version} • by {plugin.author}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50">Settings</button>
                      <button className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50">Disable</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm overflow-hidden">
              <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">System Audit Logs</h2>
              <p className="text-sm text-heritage-ink/70 mb-6">Immutable record of administrative actions and system events.</p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                        <td className="px-4 py-3 font-medium text-gray-700">{log.userName}</td>
                        <td className="px-4 py-3 text-gray-600">{log.action}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 border border-gray-200">
                            {log.entityType} ({log.entityId})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'roles' && (
          <div className="space-y-6 text-left">
            <div className="bg-white border border-heritage-gold/20 rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl font-bold font-serif text-heritage-green mb-4">Roles & Permissions</h2>
              <p className="text-sm text-heritage-ink/70 mb-6">Manage access control and operational capabilities.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {roles.map(role => (
                  <div key={role.id} className="border border-gray-200 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-gray-800">{role.name}</h3>
                      {role.isSystem && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold uppercase tracking-wider">System Role</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">{role.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {role.permissions.map(p => (
                        <span key={p} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-mono">{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

          </div>
        </div>
      </div>
    </div>
  );
}
