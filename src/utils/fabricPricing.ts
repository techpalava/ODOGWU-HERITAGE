import type { Fabric } from "../types";
import { roundMoney } from "./money";

export const FABRIC_PRICING_EUR: Readonly<Record<string, number>> = {
  "HiTarget Ankara": 3.91,
  "Hollandis Ankara": 3.91,
  Kampala: 5,
  "Aso-Oke": 6.25,
  Adire: 6.88,
  "Isiagu (Akwa-Oche)": 28.13,
  Lace: 28.13,
};

export const FABRIC_SEWING_COST_EUR: Readonly<Record<string, number>> = {
  "HiTarget Ankara": 4.06,
  "Hollandis Ankara": 4.06,
  Kampala: 0,
  "Aso-Oke": 0,
  Adire: 0,
  "Isiagu (Akwa-Oche)": 0,
  Lace: 0,
};

export const getNormalizedFabricName = (name: string): string => {
  if (!name) return "";
  const lower = name.trim().toLowerCase();
  if (lower.includes("hitarget") || lower.includes("hi-target")) {
    return "HiTarget Ankara";
  }
  if (lower.includes("hollandis")) return "Hollandis Ankara";
  if (lower.includes("kampala")) return "Kampala";
  if (
    lower.includes("aso oke") ||
    lower.includes("aso-oke") ||
    lower.includes("asioke")
  ) {
    return "Aso-Oke";
  }
  if (lower.includes("adire")) return "Adire";
  if (lower.includes("isiagu") || lower.includes("akwa-oche")) {
    return "Isiagu (Akwa-Oche)";
  }
  if (lower.includes("lace")) return "Lace";
  return name.trim();
};

const getConfiguredCategory = (fabric: Fabric): string | null => {
  for (const candidate of [fabric.category, fabric.name]) {
    const normalized = getNormalizedFabricName(candidate || "");
    if (
      Object.prototype.hasOwnProperty.call(FABRIC_PRICING_EUR, normalized)
    ) {
      return normalized;
    }
  }
  return null;
};

export const resolveFabricPrice = (fabric: Fabric | null): number | null => {
  if (!fabric) return null;

  const configuredCategory = getConfiguredCategory(fabric);
  if (configuredCategory) {
    return FABRIC_PRICING_EUR[configuredCategory];
  }

  const explicitPrice = Number(fabric.price);
  return Number.isFinite(explicitPrice) && explicitPrice > 0
    ? roundMoney(explicitPrice)
    : null;
};

export const getFabricPrice = (fabric: Fabric | null): number =>
  resolveFabricPrice(fabric) ?? 0;

export const getFabricSewingCost = (fabric: Fabric | null): number => {
  if (!fabric) return 0;
  const configuredCategory = getConfiguredCategory(fabric);
  return configuredCategory
    ? FABRIC_SEWING_COST_EUR[configuredCategory] ?? 0
    : 0;
};

export const getFabricPricingError = (
  fabric: Fabric | null,
): string | null => {
  if (!fabric || resolveFabricPrice(fabric) !== null) return null;

  return `Pricing is not configured for ${fabric.name}. Please choose another fabric or ask an administrator to add its EUR price.`;
};
