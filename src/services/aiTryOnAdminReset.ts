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

export const readOwnAiTryOnResetEligibility = async (): Promise<boolean> => {
  try {
    const body = await request("GET");
    return body !== null && "eligible" in body && body.eligible === true;
  } catch { return false; }
};

export const resetOwnAiTryOnTries = async (): Promise<boolean> => {
  const body = await request("POST");
  return body !== null && "status" in body && body.status === "reset";
};
