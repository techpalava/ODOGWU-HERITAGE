import { readAiTryOnIdToken } from "./aiTryOnGateway";

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
    return body && (body.view === "general" || body.view === "full") ? body : null;
  } catch {
    return null;
  }
};
