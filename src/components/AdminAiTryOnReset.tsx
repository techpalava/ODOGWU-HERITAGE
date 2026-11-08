import { useEffect, useState } from "react";
import {
  aiTryOnGlobalCapWarning,
  readOwnAiTryOnAdminStatus,
  resetOwnAiTryOnTries,
  type AiTryOnGlobalUsage,
} from "../services/aiTryOnAdminReset";

type ResetState = "idle" | "confirming" | "resetting" | "done" | "failed";

export function AdminAiTryOnReset({
  readStatus = readOwnAiTryOnAdminStatus,
  reset = resetOwnAiTryOnTries,
}: {
  readStatus?: () => Promise<{ eligible: boolean; globalUsage: AiTryOnGlobalUsage | null }>;
  reset?: () => Promise<boolean>;
}) {
  const [eligible, setEligible] = useState(false);
  const [globalUsage, setGlobalUsage] = useState<AiTryOnGlobalUsage | null>(null);
  const [state, setState] = useState<ResetState>("idle");
  useEffect(() => {
    let active = true;
    void readStatus().then((status) => {
      if (!active) return;
      setEligible(status.eligible);
      setGlobalUsage(status.globalUsage);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [readStatus]);
  if (!eligible) return null;
  const capWarning = aiTryOnGlobalCapWarning(globalUsage);
  const performReset = async () => {
    setState("resetting");
    try { setState(await reset() ? "done" : "failed"); }
    catch { setState("failed"); }
  };
  return (
    <section className="rounded-2xl border border-heritage-gold/25 p-4 space-y-3" data-admin-ai-try-on-reset>
      {capWarning && (
        <p
          role={capWarning.level === "warning" ? "status" : "alert"}
          data-admin-ai-try-on-cap-warning={capWarning.level}
          className={`rounded-xl border p-3 text-sm font-semibold ${capWarning.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-800"}`}
        >
          {capWarning.text}
        </p>
      )}
      <h3 className="font-bold text-heritage-green">AI Try-on testing</h3>
      <p className="text-sm text-gray-600">Reset only your own account and order tries to the normal limits: 5 per order and 15 per account. Customer accounts, saved previews and the shared service limit are unchanged.</p>
      {state === "confirming" ? (
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm">Reset your own tries now?</span>
          <button type="button" className="rounded-lg bg-heritage-green text-white px-4 py-2 text-sm" onClick={() => void performReset()}>Confirm reset</button>
          <button type="button" className="text-sm underline" onClick={() => setState("idle")}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="rounded-lg bg-heritage-green text-white px-4 py-2 text-sm disabled:opacity-50" disabled={state === "resetting"} onClick={() => setState("confirming")}>
          {state === "resetting" ? "Resetting…" : "Reset my AI try-on tries"}
        </button>
      )}
      {state === "done" && <p role="status" className="text-sm text-heritage-green">Your tries were reset. Reload AI Try-on before testing again.</p>}
      {state === "failed" && <p role="alert" className="text-sm text-red-700">Your tries could not be reset. Sign in again or try later.</p>}
    </section>
  );
}
