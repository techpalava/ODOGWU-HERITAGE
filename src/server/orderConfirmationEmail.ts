import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "../utils/aiTryOnOrderImageCopy.js";
import {
  DEFAULT_AUTH_EMAIL_FROM_NAME,
  readAuthEmailConfig,
  readGmailSmtpConfig,
  sendBrevoEmail,
  sendGmailSmtpEmail,
  type GmailSmtpConfig,
  type GmailTransport,
} from "./brevoEmail.js";
import { getAdminServices } from "./firebaseAdmin.js";
import { FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM } from "../utils/futureOrderV2StripeReturn.js";
import { readAiTryOnOrderImageRecord } from "./aiTryOnOrderImages.js";
import { keepAliveAfterResponse, type KeepAliveAfterResponse } from "./keepAliveAfterResponse.js";

/**
 * Order confirmation email (PR 5), sent once after a V2 order's payment is
 * recorded, through the existing Brevo helper (Gmail SMTP as fallback).
 *
 * - Links to the order in My Orders, never to the AI preview image, and
 *   attaches nothing. When a preview was saved with the order it says so.
 * - Off unless ORDER_CONFIRMATION_EMAIL_ENABLED=true (nothing is sent from
 *   previews or tests by accident).
 * - Exactly once per order: `orderConfirmationEmails/<orderId>` (server-only)
 *   is claimed in a transaction before sending. A live "sending" claim is
 *   not taken by a second call (that call waits). A claim left "failed",
 *   or still "sending" after the attempt deadline, is claimed again so the
 *   next payment event retries. The sent record is never sent twice.
 * - Awaited for up to 15s, so the send finishes before the payment function
 *   returns. If that deadline passes before the message is handed to the
 *   provider, the claim is marked failed and the next event can retry; the
 *   abandoned attempt re-checks ownership in a transaction before it sends,
 *   so it can never send alongside that retry. Leftover work is handed to
 *   Vercel `waitUntil` so it is not frozen mid-write.
 * - Never blocks or fails a payment; logs carry no address, uid or order id.
 */
export const ORDER_CONFIRMATION_EMAIL_COLLECTION = "orderConfirmationEmails";
/** Was 4s, which returned while the send was still running. */
export const ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS = 15_000;
/**
 * A "sending" claim older than one full attempt is stuck (the function
 * returned or was frozen). The next payment event may take it. A newer
 * claim is a live send and must not be stolen.
 */
export const ORDER_CONFIRMATION_EMAIL_SENDING_STALE_MS = 15_000;
const EMAIL_CLAIM_POLL_MS = 50;

type Environment = Record<string, string | undefined>;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Link to this one order: the existing `?future_order_v2_order_id=<id>` deep
 * link (also used by the Stripe/Pix returns and the personalised-price
 * messages) opens My Orders with that order's details open for its
 * signed-in owner.
 */
export const orderConfirmationOrderUrl = (siteUrl: string, orderId: string): string =>
  `${siteUrl.replace(/\/+$/, "")}/?${FUTURE_ORDER_V2_STRIPE_RETURN_ORDER_PARAM}=${encodeURIComponent(orderId)}`;

export function renderOrderConfirmationEmail(input: {
  brandName: string;
  siteUrl: string;
  orderId: string;
  name: string | null;
  hasAiPreview: boolean;
}) {
  const brand = escapeHtml(input.brandName);
  const subject = COPY.emailSubject(input.orderId);
  const orderUrl = input.siteUrl ? orderConfirmationOrderUrl(input.siteUrl, input.orderId) : "";
  const paragraph = (text: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#333333;">${escapeHtml(text)}</p>`;
  const button = orderUrl
    ? `<p style="margin:8px 0 24px;"><a href="${escapeHtml(orderUrl)}" data-order-link style="display:inline-block;padding:14px 24px;border-radius:12px;background:#0A291B;color:#ffffff;font-weight:bold;text-decoration:none;font-size:15px;">${escapeHtml(COPY.emailViewOrder)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F6F1E7;font-family:Arial,Helvetica,sans-serif;color:#1B1B1B;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F1E7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8DDC4;">
<tr><td style="background:#0A291B;padding:24px;text-align:center;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:2px;color:#C5A85C;font-weight:bold;">${brand}</div>
</td></tr>
<tr><td style="padding:32px 28px;text-align:left;">
${paragraph(COPY.emailGreeting(input.name))}
${paragraph(COPY.emailIntro(input.orderId))}
${button}
${input.hasAiPreview ? paragraph(COPY.emailAiPreviewLine) : ""}
${paragraph(COPY.emailNextSteps)}
<p style="margin:24px 0 0;font-size:16px;line-height:24px;color:#0A291B;font-weight:bold;">${escapeHtml(COPY.emailSignOff)}</p>
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E8DDC4;">
<p style="margin:0;font-size:12px;line-height:18px;color:#7a7a7a;">${escapeHtml(COPY.emailFooter)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html };
}

export interface OrderConfirmationEmailDependencies {
  environment?: Environment;
  getDb?: () => Firestore;
  /** The paying account's email and name (Firebase Auth by default). */
  readRecipient?: (ownerUid: string) => Promise<{ email: string | null; name: string | null }>;
  fetchImpl?: typeof fetch;
  createGmailTransport?: (config: GmailSmtpConfig) => GmailTransport;
  now?: () => number;
  log?: (line: string) => void;
  timeoutMs?: number;
  /** Wait while another call holds the send (tests can shorten this). */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Keeps an attempt that is still running when the budget expires alive
   * after the payment response (Vercel `waitUntil`). Tests pass a spy.
   */
  keepAlive?: KeepAliveAfterResponse;
}

export type OrderConfirmationEmailResult =
  | "disabled"
  | "not_configured"
  | "no_recipient"
  | "already_sent"
  | "sent"
  | "failed"
  | "timeout";

const defaultReadRecipient = async (ownerUid: string) => {
  const user = await getAdminServices().auth.getUser(ownerUid);
  return { email: user.email ?? null, name: user.displayName?.trim() || null };
};

export const sendOrderConfirmationEmail = async (
  { ownerUid, orderId }: { ownerUid: string; orderId: string },
  dependencies: OrderConfirmationEmailDependencies = {},
): Promise<OrderConfirmationEmailResult> => {
  const environment = dependencies.environment ?? process.env;
  const log = dependencies.log ?? ((line: string) => console.info(line));
  const now = dependencies.now ?? Date.now;
  const report = (status: OrderConfirmationEmailResult, extra: Record<string, unknown> = {}) => {
    log(JSON.stringify({ event: "order_confirmation_email", status, ...extra }));
    return status;
  };
  if (environment.ORDER_CONFIRMATION_EMAIL_ENABLED?.trim() !== "true") return report("disabled");
  const brevo = readAuthEmailConfig(environment);
  const gmail = readGmailSmtpConfig(environment);
  if (!brevo && !gmail) return report("not_configured");

  const sleep = dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const budgetMs = dependencies.timeoutMs ?? ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS;
  let db: Firestore | null = null;
  let claimId: string | null = null;
  let phase: "idle" | "claimed" | "sending" | "settled" = "idle";
  let abandoned = false;

  const work = async (): Promise<OrderConfirmationEmailResult> => {
    db = (dependencies.getDb ?? (() => getAdminServices().db as Firestore))();
    const ref = db.collection(ORDER_CONFIRMATION_EMAIL_COLLECTION).doc(orderId);
    const deadline = now() + budgetMs;
    while (phase === "idle") {
      const claimed = await db.runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        const data = existing.exists
          ? (existing.data() as { status?: string; claimedAt?: number })
          : null;
        if (data?.status === "sent") return "sent" as const;
        if (
          data?.status === "sending" &&
          now() - (data.claimedAt ?? 0) < ORDER_CONFIRMATION_EMAIL_SENDING_STALE_MS
        ) {
          return "busy" as const;
        }
        const id = randomUUID();
        tx.set(ref, { orderId, status: "sending", claimedAt: now(), claimId: id });
        return id;
      });
      if (claimed === "sent") return report("already_sent");
      if (claimed === "busy") {
        // Another call is sending. Wait for it to finish or give up, then
        // retry a failed or stuck claim. Never start a second email.
        if (now() >= deadline) return report("already_sent");
        await sleep(Math.min(EMAIL_CLAIM_POLL_MS, Math.max(1, deadline - now())));
        continue;
      }
      claimId = claimed;
      phase = "claimed";
    }
    if (abandoned) return "timeout";
    const recipient = await (dependencies.readRecipient ?? defaultReadRecipient)(ownerUid);
    if (abandoned) return "timeout";
    if (!recipient.email || !recipient.email.includes("@")) {
      await ref.set({ orderId, status: "no_recipient", claimedAt: now(), claimId });
      phase = "settled";
      return report("no_recipient");
    }
    let hasAiPreview = false;
    try {
      hasAiPreview = (await readAiTryOnOrderImageRecord(db, orderId))?.status === "saved";
    } catch {
      // The email still goes out, without the AI preview line.
    }
    // The budget may have expired during the read above. The timeout path
    // then releases this claim as "failed" for the next event; sending now
    // could race that event's retry and email the customer twice.
    if (abandoned) return "timeout";
    const rendered = renderOrderConfirmationEmail({
      brandName: (brevo ?? gmail)!.fromName || DEFAULT_AUTH_EMAIL_FROM_NAME,
      siteUrl: (brevo ?? gmail)!.siteUrl,
      orderId,
      name: recipient.name,
      hasAiPreview,
    });
    const message = { to: recipient.email, subject: rendered.subject, html: rendered.html };
    // The provider call is in flight. Refresh the lease so a concurrent
    // payment event keeps waiting instead of sending a second copy.
    // Only while this call still owns the claim: if it was released or
    // taken over meanwhile, another event owns the send and this one stops.
    const stillOwned = await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const data = current.exists ? (current.data() as { status?: string; claimId?: string }) : null;
      if (abandoned || data?.status !== "sending" || data.claimId !== claimId) return false;
      tx.set(ref, { orderId, status: "sending", claimedAt: now(), claimId });
      return true;
    });
    if (!stillOwned) {
      phase = "settled";
      return report("already_sent", { claimLost: true });
    }
    phase = "sending";
    let provider: "brevo" | "gmail-smtp" | null = null;
    if (brevo) {
      try {
        await sendBrevoEmail(brevo, message, dependencies.fetchImpl);
        provider = "brevo";
      } catch {
        log(JSON.stringify({ event: "order_confirmation_email", status: "brevo_failed", fallback: Boolean(gmail) }));
      }
    }
    if (!provider && gmail) {
      try {
        await sendGmailSmtpEmail(gmail, message, dependencies.createGmailTransport);
        provider = "gmail-smtp";
      } catch {
        // Reported below.
      }
    }
    if (!provider) {
      await ref.set({ orderId, status: "failed", claimedAt: now(), claimId });
      phase = "settled";
      return report("failed");
    }
    await ref.set({ orderId, status: "sent", provider, sentAt: new Date(now()), claimedAt: now(), claimId });
    phase = "settled";
    return report("sent", { provider, aiPreview: hasAiPreview });
  };

  const workPromise = work().catch((error) =>
    report("failed", { error: error instanceof Error ? error.name : "unknown" }),
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<OrderConfirmationEmailResult>((resolve) => {
      timer = setTimeout(() => resolve("timeout"), budgetMs);
    });
    const result = await Promise.race([workPromise, timeout]);
    if (result !== "timeout") return result;
    abandoned = true;
    // `phase` is updated inside `work`. Read it as the full union: control
    // flow analysis only sees the initial "idle" in this function.
    const phaseNow = phase as "idle" | "claimed" | "sending" | "settled";
    // The message is already with the provider: wait for that attempt to
    // record sent or failed. Returning here would freeze it.
    if (phaseNow === "sending" || phaseNow === "settled") return await workPromise;
    if (db && claimId && phaseNow === "claimed") {
      const ref = db.collection(ORDER_CONFIRMATION_EMAIL_COLLECTION).doc(orderId);
      try {
        await db.runTransaction(async (tx) => {
          const existing = await tx.get(ref);
          const data = existing.exists
            ? (existing.data() as { status?: string; claimedAt?: number; claimId?: string })
            : null;
          if (data?.status === "sending" && data.claimId === claimId) {
            tx.set(ref, {
              orderId,
              status: "failed",
              claimedAt: data.claimedAt ?? now(),
              claimId,
            });
          }
        });
      } catch {
        // A stale "sending" claim is still retried once the deadline passes.
      }
    }
    // Whatever is still running (a claim poll, the recipient read) stops at
    // its next `abandoned` check; keep it alive so it ends cleanly instead
    // of being frozen mid-write.
    (dependencies.keepAlive ?? keepAliveAfterResponse)(workPromise);
    return report("timeout");
  } catch (error) {
    return report("failed", { error: error instanceof Error ? error.name : "unknown" });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
