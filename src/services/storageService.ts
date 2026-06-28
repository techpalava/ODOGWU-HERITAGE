/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CustomGroup, Fabric, StyleCategory, Showpiece, CommunityPhoto, Customer, MasterOrder, Batch, BusinessSettings } from '../types';

/**
 * StorageService abstracts the local storage interactions to prepare the frontend
 * for future WordPress REST API or other backend database integrations.
 */
export const StorageService = {
  safeParse: <T>(saved: string | null): T | null => {
    if (!saved || saved === 'undefined') return null;
    try {
      return JSON.parse(saved) as T;
    } catch (e) {
      console.warn('Error parsing JSON from local storage', e);
      return null;
    }
  },

  // Business Settings
  getBusinessSettings: (): BusinessSettings | null => {
    const saved = localStorage.getItem('asml_business_settings');
    return StorageService.safeParse<BusinessSettings>(saved);
  },
  saveBusinessSettings: (settings: BusinessSettings) => {
    localStorage.setItem('asml_business_settings', JSON.stringify(settings));
  },

  // Batches
  getBatches: (): Batch[] | null => {
    const saved = localStorage.getItem('asml_batches');
    return StorageService.safeParse<Batch[]>(saved);
  },
  saveBatches: (batches: Batch[]) => {
    localStorage.setItem('asml_batches', JSON.stringify(batches));
  },

  // Custom Groups
  getGroups: (): CustomGroup[] | null => {
    const saved = localStorage.getItem('asml_custom_groups');
    return StorageService.safeParse<CustomGroup[]>(saved);
  },
  saveGroups: (groups: CustomGroup[]) => {
    localStorage.setItem('asml_custom_groups', JSON.stringify(groups));
  },

  // Users (Accounts)
  getAccounts: (): Customer[] | null => {
    const saved = localStorage.getItem('asml_accounts');
    return StorageService.safeParse<Customer[]>(saved);
  },
  saveAccounts: (accounts: Customer[]) => {
    localStorage.setItem('asml_accounts', JSON.stringify(accounts));
  },

  // Active Session
  getSession: (): Customer | null => {
    const saved = localStorage.getItem('ntcc_user');
    return StorageService.safeParse<Customer>(saved);
  },
  saveSession: (user: Customer) => {
    localStorage.setItem('ntcc_user', JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem('ntcc_user');
  },

  // Fabrics
  getFabrics: (): Fabric[] | null => {
    const saved = localStorage.getItem('asml_fabrics');
    return StorageService.safeParse<Fabric[]>(saved);
  },
  saveFabrics: (fabrics: Fabric[]) => {
    localStorage.setItem('asml_fabrics', JSON.stringify(fabrics));
  },

  // Styles
  getStyles: (): StyleCategory[] | null => {
    const saved = localStorage.getItem('asml_styles');
    return StorageService.safeParse<StyleCategory[]>(saved);
  },
  saveStyles: (styles: StyleCategory[]) => {
    localStorage.setItem('asml_styles', JSON.stringify(styles));
  },

  // Showpieces (Gallery)
  getShowpieces: (): Showpiece[] | null => {
    const saved = localStorage.getItem('asml_showpieces');
    return StorageService.safeParse<Showpiece[]>(saved);
  },
  saveShowpieces: (showpieces: Showpiece[]) => {
    localStorage.setItem('asml_showpieces', JSON.stringify(showpieces));
  },

  // Community Photos
  getCommunityPhotos: (): CommunityPhoto[] | null => {
    const saved = localStorage.getItem('asml_community_photos');
    return StorageService.safeParse<CommunityPhoto[]>(saved);
  },
  saveCommunityPhotos: (photos: CommunityPhoto[]) => {
    localStorage.setItem('asml_community_photos', JSON.stringify(photos));
  },

  // Orders
  getOrders: (): MasterOrder[] | null => {
    const saved = localStorage.getItem('asml_orders');
    return StorageService.safeParse<MasterOrder[]>(saved);
  },
  saveOrders: (orders: MasterOrder[]) => {
    localStorage.setItem('asml_orders', JSON.stringify(orders));
  },

  // Joined Batch IDs
  getJoinedBatchIds: (): string[] | null => {
    const saved = localStorage.getItem('asml_joined_batch_ids');
    return StorageService.safeParse<string[]>(saved);
  },
  saveJoinedBatchIds: (ids: string[]) => {
    localStorage.setItem('asml_joined_batch_ids', JSON.stringify(ids));
  }
};
