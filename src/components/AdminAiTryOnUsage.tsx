import { useEffect, useState } from "react";
import { aiTryOnGlobalCapWarning } from "../services/aiTryOnAdminReset";
import { readAiTryOnAdminUsage, startAiTryOnAdminTopUp, type AiTryOnAdminUsage, type AiTryOnTopUpRow, type AiTryOnUsageRow } from "../services/aiTryOnAdminUsage";

const usd = (value: number) => `$${value.toFixed(2)}`;
const whenLabel = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

const Table = ({ title, rows, label }: { title: string; rows: AiTryOnUsageRow[]; label: string }) => (
  <div className="min-w-0">
    <h4 className="text-sm font-bold text-heritage-green">{title}</h4>
    <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-heritage-gold/20">
      <table className="w-full text-left text-xs" data-admin-ai-try-on-usage-table={label}>
        <thead className="sticky top-0 bg-heritage-cream text-heritage-ink/70">
          <tr><th className="px-2 py-1.5">{label}</th><th className="px-2 py-1.5 text-right">Tries used</th><th className="px-2 py-1.5 text-right">Failures</th><th className="px-2 py-1.5 text-right">Timeouts</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period} className="border-t border-heritage-gold/10">
              <td className="px-2 py-1.5 font-semibold">{row.period}</td>
              <td className="px-2 py-1.5 text-right">{row.used}</td>
              <td className="px-2 py-1.5 text-right">{row.failed}</td>
              <td className="px-2 py-1.5 text-right">{row.timedOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

/** AI Try-on usage for admins (Admin > System Settings). The top-up button opens Checkout; it does not add tries. */
export function AdminAiTryOnUsage({
  readUsage = readAiTryOnAdminUsage,
  startTopUp = startAiTryOnAdminTopUp,
}: {
  readUsage?: () => Promise<AiTryOnAdminUsage | null>;
  startTopUp?: () => Promise<string | null>;
}) {
  const [usage, setUsage] = useState<AiTryOnAdminUsage | null>(null);
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [topUpPending, setTopUpPending] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const apply = (next: AiTryOnAdminUsage | null) => { if (active) setUsage(next); };
    const load = () => readUsage().then(apply).catch(() => undefined);
    void load();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (typeof window !== "undefined") {
      const status = new URLSearchParams(window.location.search).get("ai_try_on_top_up");
      if (status === "success") {
        setReturnNote("Stripe accepted the test payment. Remaining tries update here once Stripe confirms it.");
        let left = 4;
        timer = setInterval(() => {
          left -= 1;
          void load();
          if (left <= 0 && timer) clearInterval(timer);
        }, 2000);
      } else if (status === "cancel") {
        setReturnNote("Checkout was cancelled. No tries were added.");
      }
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [readUsage]);
  if (!usage) return null;
  const capWarning = aiTryOnGlobalCapWarning({ count: usage.allTime.tries, cap: usage.allTime.cap });
  const capShare = Math.min(100, Math.round((usage.allTime.tries / Math.max(usage.allTime.cap, 1)) * 100));
  const remaining = Math.max(0, usage.allTime.cap - usage.allTime.tries);
  const cost = usage.view === "full" ? usage.cost : undefined;
  const topUps: AiTryOnTopUpRow[] = usage.view === "full" && Array.isArray(usage.topUps) ? usage.topUps : [];
  const openCheckout = () => {
    if (topUpPending) return Promise.resolve();
    setTopUpPending(true);
    setTopUpError(null);
    return startTopUp().then((url) => {
      if (!url || typeof window === "undefined") {
        setTopUpPending(false);
        if (!url) setTopUpError("Stripe Checkout could not be started. Try again in a moment.");
        return;
      }
      window.location.assign(url);
    }).catch(() => {
      setTopUpPending(false);
      setTopUpError("Stripe Checkout could not be started. Try again in a moment.");
    });
  };
  return (
    <section className="space-y-4 rounded-2xl border border-heritage-gold/25 p-4" data-admin-ai-try-on-usage={usage.view}>
      <h3 className="font-bold text-heritage-green">AI Try-on usage</h3>
      <p className="text-xs text-heritage-ink/70">
        {cost ? "Daily and monthly figures are counted from " : "Read only. Daily and monthly figures are counted from "}
        {usage.countingSince ?? "the day this page shipped"} (Lagos time). The all-time count includes earlier tries. A failure is a try refunded with no preview made; a timeout is a failure after the time limit.
        {cost ? " A paid top-up adds 1,000 tries only after Stripe confirms the payment." : ""}
      </p>
      {returnNote && <p role="status" data-admin-ai-try-on-top-up-return className="rounded-xl border border-heritage-green/20 bg-heritage-cream/40 p-3 text-sm">{returnNote}</p>}
      {capWarning && (
        <p role={capWarning.level === "warning" ? "status" : "alert"} data-admin-ai-try-on-usage-cap-warning={capWarning.level}
          className={`rounded-xl border p-3 text-sm font-semibold ${capWarning.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-800"}`}>
          {capWarning.text}
        </p>
      )}
      <div>
        <p className="text-sm font-semibold text-heritage-green" data-admin-ai-try-on-usage-all-time>All-time tries: {usage.allTime.tries} of {usage.allTime.cap} ({capShare}%). Remaining: {remaining}.</p>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-heritage-gold/15" role="progressbar" aria-valuemin={0} aria-valuemax={usage.allTime.cap} aria-valuenow={usage.allTime.tries} aria-label="All-time tries against the limit">
          <div className="h-full bg-heritage-green" style={{ width: `${capShare}%` }} />
        </div>
      </div>
      {cost && (
        <div className="space-y-2 rounded-xl border border-heritage-green/20 bg-heritage-cream/40 p-3" data-admin-ai-try-on-usage-cost>
          <p className="text-sm font-bold text-heritage-green">Cost estimate</p>
          <p className="text-sm">All time: <strong>{usd(cost.allTimeUsd)}</strong> (estimate) · This month: <strong>{usd(cost.thisMonthUsd)}</strong> (estimate)</p>
          <p className="text-xs text-heritage-ink/70">Estimate only: ${cost.perTryUsd.toFixed(3)} per try ($64 per 1,000 tries), from counted tries. Not a bill.</p>
          {cost.reminders.map((reminder) => (
            <p key={reminder.amountUsd} role={reminder.level === "warning" ? "status" : "alert"} data-admin-ai-try-on-usage-cost-reminder={`${reminder.amountUsd}-${reminder.level}`}
              className={`rounded-lg border p-2 text-xs font-semibold ${reminder.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-800"}`}>
              {reminder.level === "reached"
                ? `This month's estimated cost has reached $${reminder.amountUsd}.`
                : `This month's estimated cost is near $${reminder.amountUsd} (${usd(cost.thisMonthUsd)} so far).`}
            </p>
          ))}
          <button type="button" data-admin-ai-try-on-usage-top-up onClick={openCheckout} disabled={topUpPending}
            className="inline-flex min-h-11 items-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wide text-white disabled:opacity-60">
            {topUpPending ? "Opening Stripe Checkout..." : "Top up 1,000 tries ($64)"}
          </button>
          {topUpError && <p role="alert" data-admin-ai-try-on-top-up-error className="text-xs font-semibold text-red-800">{topUpError}</p>}
          <div data-admin-ai-try-on-top-up-history>
            <p className="text-sm font-bold text-heritage-green">Top-up history</p>
            {topUps.length === 0 ? (
              <p className="mt-1 text-xs text-heritage-ink/70">No top-ups yet. A paid Checkout adds 1,000 tries after Stripe confirms it.</p>
            ) : (
              <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-heritage-gold/20">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-heritage-cream text-heritage-ink/70">
                    <tr>
                      <th className="px-2 py-1.5">When</th>
                      <th className="px-2 py-1.5">Who</th>
                      <th className="px-2 py-1.5 text-right">Tries</th>
                      <th className="px-2 py-1.5 text-right">Amount</th>
                      <th className="px-2 py-1.5">Stripe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUps.map((row) => (
                      <tr key={row.sessionId} data-admin-ai-try-on-top-up-row={row.sessionId} className="border-t border-heritage-gold/10">
                        <td className="px-2 py-1.5 whitespace-nowrap">{whenLabel(row.createdAt)}</td>
                        <td className="px-2 py-1.5">{row.adminEmail}</td>
                        <td className="px-2 py-1.5 text-right">{row.triesAdded}</td>
                        <td className="px-2 py-1.5 text-right">{usd(row.amountCents / 100)}</td>
                        <td className="px-2 py-1.5">
                          <span className="block break-all">{row.sessionId}</span>
                          {row.paymentIntentId && <span className="block break-all text-heritage-ink/70">{row.paymentIntentId}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Per day (last 31 days)" rows={usage.days} label="Day" />
        <Table title="Per month" rows={usage.months} label="Month" />
      </div>
    </section>
  );
}
