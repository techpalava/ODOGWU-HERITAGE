import { MediaItem, Plugin, AuditLog, Role } from '../types';

export const MOCK_ROLES: Role[] = [
  { id: 'role-super-admin', name: 'Super Administrator', description: 'Full access to all system features', permissions: ['*'], isSystem: true },
  { id: 'role-ops-manager', name: 'Operations Manager', description: 'Manages production and batches', permissions: ['view_batches', 'edit_batches', 'manage_orders'], isSystem: false },
  { id: 'role-tailor', name: 'Tailor', description: 'Views measurements and updates garment status', permissions: ['view_orders', 'update_garment_status'], isSystem: false },
  { id: 'role-support', name: 'Customer Support', description: 'Views orders and assists customers', permissions: ['view_orders', 'view_customers'], isSystem: false }
];

export const MOCK_PLUGINS: Plugin[] = [
  { id: 'plugin-ai-fitscan', name: 'AI FitScan', version: '1.2.0', description: 'Automated measurement estimation from photos', status: 'active', author: 'The Odogwu Heritage', settings: {}, hooks: ['on_measurement_submit'] },
  { id: 'plugin-woocommerce', name: 'WooCommerce Connector', version: '2.0.1', description: 'Syncs orders from WooCommerce', status: 'update_available', author: 'The Odogwu Heritage', settings: { endpoint: 'https://odogwuheritage.com' }, hooks: ['on_order_create'] },
  { id: 'plugin-stripe', name: 'Stripe Payments', version: '3.1.4', description: 'Processes credit card payments', status: 'active', author: 'Stripe', settings: {}, hooks: ['on_checkout'] }
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: 'audit-1', timestamp: new Date(Date.now() - 3600000).toISOString(), userId: 'admin', userName: 'Admin', action: 'Update Business Settings', entityType: 'Settings', entityId: 'global' },
  { id: 'audit-2', timestamp: new Date(Date.now() - 86400000).toISOString(), userId: 'admin', userName: 'Admin', action: 'Create Batch', entityType: 'Batch', entityId: 'batch-4' },
  { id: 'audit-3', timestamp: new Date(Date.now() - 172800000).toISOString(), userId: 'system', userName: 'System', action: 'Plugin Updated', entityType: 'Plugin', entityId: 'plugin-stripe' }
];

export const MOCK_MEDIA_LIBRARY: MediaItem[] = [
  { id: 'media-1', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2070', filename: 'hero-banner-1.jpg', title: 'Main Hero', altText: 'Man in traditional attire', caption: '', description: '', folder: 'banners', mimeType: 'image/jpeg', sizeBytes: 1540000, uploadedBy: 'admin', uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assignments: ['home-hero'] }
];
