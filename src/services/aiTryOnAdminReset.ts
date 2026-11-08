import { readAiTryOnIdToken } from "./aiTryOnGateway";

const request = async (method: "GET" | "POST") => {
  const token = await readAiTryOnIdToken();
  if (!token) return null;
  const response = await fetch("/api/ai-try-on?action=admin-reset", {
    method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error("reset_unavailable");
  const body: unknown = await response.json();
  return body !== null && typeof body === "object" ? body : null;
};

export const resetOwnAiTryOnTries = async (): Promise<boolean> => {
  const body = await request("POST");
  return body !== null && "status" in body && body.status === "reset";
};

export interface AiTryOnGlobalUsage {
  count: number;
  cap: number;
}

/** Eligibility plus the read-only lifetime usage (reset admins only). */
export const readOwnAiTryOnAdminStatus = async (): Promise<{ eligible: boolean; globalUsage: AiTryOnGlobalUsage | null }> => {
  try {
    const body = (await request("GET")) as { eligible?: unknown; globalUsage?: { count?: unknown; cap?: unknown } } | null;
    const usage = body?.globalUsage;
    return {
      eligible: body?.eligible === true,
      globalUsage:
        usage && typeof usage.count === "number" && typeof usage.cap === "number" && usage.cap > 0
          ? { count: usage.count, cap: usage.cap }
          : null,
    };
  } catch { return { eligible: false, globalUsage: null }; }
};

/** 80% and 95% of the lifetime cap; null below 80%. */
export const AI_TRY_ON_CAP_WARNING_LEVELS = { warning: 0.8, critical: 0.95 } as const;

export const aiTryOnGlobalCapWarning = (
  usage: AiTryOnGlobalUsage | null,
): { level: "warning" | "critical" | "reached"; text: string } | null => {
  if (!usage) return null;
  const { count, cap } = usage;
  const share = count / cap;
  if (share < AI_TRY_ON_CAP_WARNING_LEVELS.warning) return null;
  if (count >= cap) {
    return { level: "reached", text: `AI Try-on has reached its limit of ${cap} previews and is now off for customers.` };
  }
  const used = `AI Try-on has used ${count} of its ${cap} previews (${Math.floor(share * 100)}%). At ${cap} it turns off for customers.`;
  return share >= AI_TRY_ON_CAP_WARNING_LEVELS.critical
    ? { level: "critical", text: `Almost at the limit. ${used}` }
    : { level: "warning", text: used };
};
