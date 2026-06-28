import { CustomGroup, Fabric, StyleCategory, Showpiece, CommunityPhoto, Customer, MasterOrder } from '../types';
import { StorageService } from './storageService';

/**
 * ApiService provides an asynchronous facade over the local storage to simulate
 * a real REST API. This is a critical step for WordPress integration readiness.
 * Future developers can replace the implementation here with fetch() calls to the WordPress REST API.
 */
export const ApiService = {
  // Custom Groups
  fetchGroups: async (): Promise<CustomGroup[] | null> => {
    return new Promise((resolve) => setTimeout(() => resolve(StorageService.getGroups()), 100));
  },
  saveGroups: async (groups: CustomGroup[]): Promise<void> => {
    return new Promise((resolve) => {
      StorageService.saveGroups(groups);
      setTimeout(resolve, 100);
    });
  },

  // Users (Accounts)
  fetchAccounts: async (): Promise<Customer[] | null> => {
    return new Promise((resolve) => setTimeout(() => resolve(StorageService.getAccounts()), 100));
  },
  saveAccounts: async (accounts: Customer[]): Promise<void> => {
    return new Promise((resolve) => {
      StorageService.saveAccounts(accounts);
      setTimeout(resolve, 100);
    });
  },

  // Active Session
  fetchSession: async (): Promise<Customer | null> => {
    return new Promise((resolve) => setTimeout(() => resolve(StorageService.getSession()), 100));
  },
  saveSession: async (user: Customer): Promise<void> => {
    return new Promise((resolve) => {
      StorageService.saveSession(user);
      setTimeout(resolve, 100);
    });
  },
  clearSession: async (): Promise<void> => {
    return new Promise((resolve) => {
      StorageService.clearSession();
      setTimeout(resolve, 100);
    });
  },

  // Orders
  fetchOrders: async (): Promise<MasterOrder[] | null> => {
    return new Promise((resolve) => setTimeout(() => resolve(StorageService.getOrders()), 100));
  },
  saveOrders: async (orders: MasterOrder[]): Promise<void> => {
    return new Promise((resolve) => {
      StorageService.saveOrders(orders);
      setTimeout(resolve, 100);
    });
  },
  // Measurements
  estimateMeasurements: async (data: {
    height: number | null;
    weight: number | null;
    age: number | null;
    bodyBuild: string;
    fitPreference: string;
    gender: 'male' | 'female' | 'unisex' | 'couple' | 'family';
  }) => {
    try {
      const response = await fetch('/api/estimate-measurements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (result && result.success && result.measurements) {
        return { measurements: result.measurements, source: result.source || 'gemini' };
      }
      throw new Error('Invalid response');
    } catch (e) {
      console.warn('API estimation failed, falling back to heuristic calculation', e);
      // Fallback
      // We will lazy import or require it to avoid circular deps if any, but regular import is fine.
      const { estimateMeasurements } = await import('../utils/fitEstimator');
      const fallback = estimateMeasurements(
        data.height,
        data.weight,
        data.age,
        data.bodyBuild as any,
        data.fitPreference as any,
        data.gender
      );
      return { measurements: fallback, source: 'heuristic' };
    }
  }
};
