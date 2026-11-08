import { useEffect, useState } from "react";
import { readOwnAiTryOnResetEligibility, resetOwnAiTryOnTries } from "../services/aiTryOnAdminReset";

type ResetState = "idle" | "confirming" | "resetting" | "done" | "failed";

export function AdminAiTryOnReset({
  readEligibility = readOwnAiTryOnResetEligibility,
  reset = resetOwnAiTryOnTries,
}: {
  readEligibility?: () => Promise<boolean>;
  reset?: () => Promise<boolean>;
}) {
  const [eligible, setEligible] = useState(false);
  const [state, setState] = useState<ResetState>("idle");
  useEffect(() => {
    let active = true;
    void readEligibility().then((allowed) => { if (active) setEligible(allowed); }).catch(() => undefined);
    return () => { active = false; };
  }, [readEligibility]);
  if (!eligible) return null;
  const performReset = async () => {
    setState("resetting");
    try { setState(await reset() ? "done" : "failed"); }
    catch { setState("failed"); }
  };
  return (
    <section className="rounded-2xl border border-heritage-gold/25 p-4 space-y-3" data-admin-ai-try-on-reset>
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
