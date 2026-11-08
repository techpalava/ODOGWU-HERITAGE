import { useEffect, useState } from "react";
import { aiTryOnGlobalCapWarning } from "../services/aiTryOnAdminReset";
import { readAiTryOnAdminUsage, type AiTryOnAdminUsage, type AiTryOnUsageRow } from "../services/aiTryOnAdminUsage";

const usd = (value: number) => `$${value.toFixed(2)}`;
const BILLING_URL = "https://console.cloud.google.com/billing";

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

/** Read-only AI Try-on usage for admins (Admin > System Settings). */
export function AdminAiTryOnUsage({ readUsage = readAiTryOnAdminUsage }: { readUsage?: () => Promise<AiTryOnAdminUsage | null> }) {
  const [usage, setUsage] = useState<AiTryOnAdminUsage | null>(null);
  useEffect(() => {
    let active = true;
    void readUsage().then((next) => { if (active) setUsage(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [readUsage]);
  if (!usage) return null;
  const capWarning = aiTryOnGlobalCapWarning({ count: usage.allTime.tries, cap: usage.allTime.cap });
  const capShare = Math.min(100, Math.round((usage.allTime.tries / usage.allTime.cap) * 100));
  const cost = usage.view === "full" ? usage.cost : undefined;
  return (
    <section className="space-y-4 rounded-2xl border border-heritage-gold/25 p-4" data-admin-ai-try-on-usage={usage.view}>
      <h3 className="font-bold text-heritage-green">AI Try-on usage</h3>
      <p className="text-xs text-heritage-ink/70">
        Read only. Daily and monthly figures are counted from {usage.countingSince ?? "the day this page shipped"} (Lagos time). The all-time count includes earlier tries. A failure is a try refunded with no preview made; a timeout is a failure after the time limit.
      </p>
      {capWarning && (
        <p role={capWarning.level === "warning" ? "status" : "alert"} data-admin-ai-try-on-usage-cap-warning={capWarning.level}
          className={`rounded-xl border p-3 text-sm font-semibold ${capWarning.level === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-800"}`}>
          {capWarning.text}
        </p>
      )}
      <div>
        <p className="text-sm font-semibold text-heritage-green" data-admin-ai-try-on-usage-all-time>All-time tries: {usage.allTime.tries} of {usage.allTime.cap} ({capShare}%)</p>
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
          <a href={BILLING_URL} target="_blank" rel="noopener noreferrer" data-admin-ai-try-on-usage-top-up
            className="inline-flex min-h-11 items-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wide text-white">Top up</a>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Per day (last 31 days)" rows={usage.days} label="Day" />
        <Table title="Per month" rows={usage.months} label="Month" />
      </div>
    </section>
  );
}
