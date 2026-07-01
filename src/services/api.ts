import {
  CustomGroup,
  Customer,
  MasterOrder,
} from "../types";
import { StorageService } from "./storageService";

/**
 * ApiService provides an asynchronous facade over the local storage to simulate
 * a real REST API. This is a critical step for WordPress integration readiness.
 * Future developers can replace the implementation here with fetch() calls to the WordPress REST API.
 */
export const ApiService = {
  // Custom Groups
  fetchGroups: async (): Promise<CustomGroup[]> => {
    return await StorageService.getGroups();
  },
  saveGroups: async (groups: CustomGroup[]): Promise<void> => {
    await StorageService.saveGroups(groups);
  },

  // Users (Accounts)
  fetchAccounts: async (): Promise<Customer[]> => {
    return await StorageService.getAccounts();
  },
  saveAccounts: async (accounts: Customer[]): Promise<void> => {
    await StorageService.saveAccounts(accounts);
  },

  // Active Session
  fetchSession: async (): Promise<Customer | null> => {
    // Session is still sync in StorageService since it uses localStorage for auth
    return StorageService.getSession();
  },
  saveSession: async (user: Customer): Promise<void> => {
    StorageService.saveSession(user);
  },
  clearSession: async (): Promise<void> => {
    StorageService.clearSession();
  },

  // Orders
  fetchOrders: async (): Promise<MasterOrder[]> => {
    return await StorageService.getOrders();
  },
  saveOrders: async (orders: MasterOrder[]): Promise<void> => {
    await StorageService.saveOrders(orders);
  },
  // Measurements
  estimateMeasurements: async (data: {
    height: number | null;
    weight: number | null;
    age: number | null;
    bodyBuild: string;
    fitPreference: string;
    gender: "male" | "female" | "unisex" | "couple" | "family";
  }) => {
    try {
      const response = await fetch("/api/estimate-measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (result && result.success && result.measurements) {
        return {
          measurements: result.measurements,
          source: result.source || "gemini",
        };
      }
      throw new Error("Invalid response");
    } catch (e) {
      console.warn(
        "API estimation failed, falling back to heuristic calculation",
        e,
      );
      // Fallback
      // We will lazy import or require it to avoid circular deps if any, but regular import is fine.
      const { estimateMeasurements } = await import("../utils/fitEstimator");
      const fallback = estimateMeasurements(
        data.height,
        data.weight,
        data.age,
        data.bodyBuild as any,
        data.fitPreference as any,
        data.gender,
      );
      return { measurements: fallback, source: "heuristic" };
    }
  },
};
