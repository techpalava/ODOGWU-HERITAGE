import { readAiTryOnIdToken } from "./aiTryOnGateway";

/** Set just before Stripe Checkout so the return opens Admin > System Settings. */
export const AI_TRY_ON_ADMIN_TAB_STORAGE_KEY = "asml_admin_portal_tab";

export interface AiTryOnTopUpRow {
  sessionId: string;
  paymentIntentId: string | null;
  adminEmail: string;
  amountCents: number;
  currency: "usd";
  triesAdded: number;
  createdAt: string;
}

export interface AiTryOnUsageRow {
  period: string;
  started: number;
  failed: number;
  timedOut: number;
  used: number;
}
export interface AiTryOnAdminUsage {
  view: "general" | "full";
  countingSince: string | null;
  days: AiTryOnUsageRow[];
  months: AiTryOnUsageRow[];
  allTime: { tries: number; cap: number };
  /** Full view only. Amounts stay off the general admin response. */
  topUps?: AiTryOnTopUpRow[];
  /** Full view only; never sent to other admins. */
  cost?: {
    estimate: true;
    perTryUsd: number;
    allTimeUsd: number;
    thisMonthUsd: number;
    reminders: Array<{ amountUsd: number; level: "warning" | "critical" | "reached" }>;
  };
}

/** Null when not signed in as an admin (the section then shows nothing). */
export const readAiTryOnAdminUsage = async (): Promise<AiTryOnAdminUsage | null> => {
  try {
    const token = await readAiTryOnIdToken();
    if (!token) return null;
    const response = await fetch("/api/ai-try-on?action=admin-usage", {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as AiTryOnAdminUsage;
    if (body?.view === "general") return { ...body, topUps: undefined, cost: undefined };
    return body && body.view === "full" ? body : null;
  } catch {
    return null;
  }
};

const checkoutUrl = (value: unknown): string | null =>
  typeof value === "string" && value.startsWith("https://checkout.stripe.com/") ? value : null;

/** Opens Stripe Checkout. Returns the hosted URL, or null when it cannot start. Does not add tries. */
export const startAiTryOnAdminTopUp = async (): Promise<string | null> => {
  try {
    const token = await readAiTryOnIdToken();
    if (!token) return null;
    const response = await fetch("/api/ai-try-on?action=admin-top-up", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const url = checkoutUrl(((await response.json()) as { url?: unknown }).url);
    if (!url) return null;
    try {
      sessionStorage.setItem("asml_active_tab", "database");
      sessionStorage.setItem(AI_TRY_ON_ADMIN_TAB_STORAGE_KEY, "settings");
    } catch {
      // Checkout can still finish. The webhook credits the tries either way.
    }
    return url;
  } catch {
    return null;
  }
};
