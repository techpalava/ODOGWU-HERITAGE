/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Batch, BusinessSettings } from "../types";
import { CapacityService } from "../services/CapacityService";

export const BusinessIntelligenceEngine = {
  // --- PRODUCTION & CAPACITY ---
  calculateCapacityPercentage: (batch: Batch, _settings: BusinessSettings) => {
    return CapacityService.getCapacityBreakdown(batch).percentage;
  },

  getRemainingGarments: (batch: Batch, _settings: BusinessSettings) => {
    return CapacityService.getRemainingCapacity(batch);
  },

  getEstimatedProductionHours: (
    garments: number,
    _settings: BusinessSettings,
  ) => {
    // We assume 1 garment = 1 day's work fraction based on duration / garments or standard metric
    // If estimatedProductionDurationDays is provided, map that to hours. e.g. 1 garment = 8 hours
    return garments * 8; // Kept at 8 hours as fixed standard for now
  },

  // --- FORECASTING ---
  generateFabricForecast: (garments: number) => {
    const requiredYards = garments * 6.5;
    const requiredRolls = Math.ceil(requiredYards / 6);
    return {
      requiredYards,
      requiredRolls,
      inventoryStatus:
        requiredRolls > 20 ? "Procurement Required" : "Sufficient",
    };
  },

  generateShippingForecast: (orders: number, settings: BusinessSettings) => {
    const totalPackages = Math.ceil(orders * 1.2);
    const estimatedWeightKg = totalPackages * 2.5;
    const estimatedVolumeCbm = totalPackages * 0.05;

    // Instead of hardcoded 8.5 rate, we can use the average shipping rate
    const shippingRateBase =
      settings.shippingSettings.communityBatchShippingRate > 0
        ? settings.shippingSettings.communityBatchShippingRate / 10
        : 8.5;

    return {
      totalPackages,
      estimatedWeightKg,
      estimatedVolumeCbm,
      shippingTier:
        estimatedWeightKg > 100 ? "Freight" : "Air Freight (Standard)",
      expectedTransportCost: estimatedWeightKg * shippingRateBase,
    };
  },

  // --- ANALYTICS ---
  getBatchAnalytics: (batches: Batch[], settings: BusinessSettings) => {
    const totalGarments = batches.reduce(
      (acc, b) => acc + CapacityService.getReservedCapacity(b),
      0,
    );
    const totalCustomers = batches.reduce(
      (acc, b) => acc + b.currentCustomers,
      0,
    );
    const totalOrders = batches.reduce((acc, b) => acc + b.currentOrders, 0);

    return {
      totalGarments,
      totalCustomers,
      avgGarmentsPerCustomer:
        totalCustomers > 0 ? (totalGarments / totalCustomers).toFixed(1) : 0,
      avgOrderSize:
        totalOrders > 0 ? (totalGarments / totalOrders).toFixed(1) : 0,
      estimatedProductionHours:
        BusinessIntelligenceEngine.getEstimatedProductionHours(
          totalGarments,
          settings,
        ),
      productionEfficiency: "92%", // Mocked efficiency metric
    };
  },
};
