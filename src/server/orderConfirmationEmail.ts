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
import { readAiTryOnOrderImageRecord } from "./aiTryOnOrderImages.js";

/**
 * Order confirmation email (PR 5), sent once after a V2 order's payment is
 * recorded, through the existing Brevo helper (Gmail SMTP as fallback).
 *
 * - Links to the order in My Orders, never to the AI preview image, and
 *   attaches nothing. When a preview was saved with the order it says so.
 * - Off unless ORDER_CONFIRMATION_EMAIL_ENABLED=true (nothing is sent from
 *   previews or tests by accident).
 * - Exactly once per order: `orderConfirmationEmails/<orderId>` (server-only)
 *   is claimed in a transaction before sending; a failed send is marked
 *   failed so the next payment event for that order may retry.
 * - Never blocks or fails a payment; logs carry no address, uid or order id.
 */
export const ORDER_CONFIRMATION_EMAIL_COLLECTION = "orderConfirmationEmails";
export const ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS = 4000;
const SENDING_STALE_MS = 10 * 60 * 1000;

type Environment = Record<string, string | undefined>;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** My Orders link for one order (the dashboard opens on `?tab=dashboard`). */
export const orderConfirmationOrderUrl = (siteUrl: string, orderId: string): string =>
  `${siteUrl.replace(/\/+$/, "")}/?tab=dashboard&order=${encodeURIComponent(orderId)}`;

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

  const work = async (): Promise<OrderConfirmationEmailResult> => {
    const db = (dependencies.getDb ?? (() => getAdminServices().db as Firestore))();
    const ref = db.collection(ORDER_CONFIRMATION_EMAIL_COLLECTION).doc(orderId);
    const claimed = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const data = existing.exists ? (existing.data() as { status?: string; claimedAt?: number }) : null;
      if (data?.status === "sent") return false;
      if (data?.status === "sending" && now() - (data.claimedAt ?? 0) < SENDING_STALE_MS) return false;
      tx.set(ref, { orderId, status: "sending", claimedAt: now() });
      return true;
    });
    if (!claimed) return report("already_sent");
    const recipient = await (dependencies.readRecipient ?? defaultReadRecipient)(ownerUid);
    if (!recipient.email || !recipient.email.includes("@")) {
      await ref.set({ orderId, status: "no_recipient", claimedAt: now() });
      return report("no_recipient");
    }
    let hasAiPreview = false;
    try {
      hasAiPreview = (await readAiTryOnOrderImageRecord(db, orderId))?.status === "saved";
    } catch {
      // The email still goes out, without the AI preview line.
    }
    const rendered = renderOrderConfirmationEmail({
      brandName: (brevo ?? gmail)!.fromName || DEFAULT_AUTH_EMAIL_FROM_NAME,
      siteUrl: (brevo ?? gmail)!.siteUrl,
      orderId,
      name: recipient.name,
      hasAiPreview,
    });
    const message = { to: recipient.email, subject: rendered.subject, html: rendered.html };
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
      await ref.set({ orderId, status: "failed", claimedAt: now() });
      return report("failed");
    }
    await ref.set({ orderId, status: "sent", provider, sentAt: new Date(now()), claimedAt: now() });
    return report("sent", { provider, aiPreview: hasAiPreview });
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<OrderConfirmationEmailResult>((resolve) => {
      timer = setTimeout(() => resolve("timeout"), dependencies.timeoutMs ?? ORDER_CONFIRMATION_EMAIL_TIMEOUT_MS);
    });
    const result = await Promise.race([work(), timeout]);
    if (result === "timeout") report("timeout");
    return result;
  } catch (error) {
    return report("failed", { error: error instanceof Error ? error.name : "unknown" });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
