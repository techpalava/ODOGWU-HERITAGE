import nodemailer from "nodemailer";

/**
 * Server-only transactional email for login codes.
 * Brevo's API is the primary sender; Gmail SMTP is the automatic fallback
 * when Brevo is not configured, fails, or hits its quota/rate limit.
 * Every sender and site detail comes from the environment so a future
 * custom domain needs no code change:
 *   BREVO_API_KEY            Brevo API key
 *   AUTH_EMAIL_FROM          Brevo-verified sender address
 *   GMAIL_SMTP_USER          Gmail address used for fallback (also its From address)
 *   GMAIL_SMTP_APP_PASSWORD  Google app password for GMAIL_SMTP_USER
 *   AUTH_EMAIL_FROM_NAME     sender name for both, default "The Odogwu Heritage"
 *   PUBLIC_SITE_URL          site link in the email (falls back to APP_URL)
 * At least one sender (Brevo or Gmail) must be configured.
 */
export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
export const DEFAULT_AUTH_EMAIL_FROM_NAME = "The Odogwu Heritage";

export type AuthEmailConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  siteUrl: string;
};

export const GMAIL_SMTP_HOST = "smtp.gmail.com";
export const GMAIL_SMTP_PORT = 465;

export type GmailSmtpConfig = {
  user: string;
  appPassword: string;
  fromName: string;
  siteUrl: string;
};

export type LoginCodeEmailProvider = "brevo" | "gmail-smtp";

type Environment = Record<string, string | undefined>;

const readFromName = (environment: Environment) =>
  environment.AUTH_EMAIL_FROM_NAME?.trim() || DEFAULT_AUTH_EMAIL_FROM_NAME;

const readSiteUrl = (environment: Environment) => {
  const siteUrl = (
    environment.PUBLIC_SITE_URL?.trim() ||
    environment.APP_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  return /^https?:\/\//i.test(siteUrl) ? siteUrl : "";
};

/** Brevo sender settings, or null when Brevo is not configured. */
export function readAuthEmailConfig(
  environment: Environment = process.env,
): AuthEmailConfig | null {
  const apiKey = environment.BREVO_API_KEY?.trim() || "";
  const fromEmail = environment.AUTH_EMAIL_FROM?.trim() || "";
  if (!apiKey || !fromEmail.includes("@")) return null;
  return {
    apiKey,
    fromEmail,
    fromName: readFromName(environment),
    siteUrl: readSiteUrl(environment),
  };
}

/** Gmail SMTP fallback settings, or null when Gmail is not configured. */
export function readGmailSmtpConfig(
  environment: Environment = process.env,
): GmailSmtpConfig | null {
  const user = environment.GMAIL_SMTP_USER?.trim() || "";
  // Google shows app passwords in groups of four separated by spaces.
  const appPassword = (environment.GMAIL_SMTP_APP_PASSWORD || "").replace(
    /\s+/g,
    "",
  );
  if (!user.includes("@") || !appPassword) return null;
  return {
    user,
    appPassword,
    fromName: readFromName(environment),
    siteUrl: readSiteUrl(environment),
  };
}

/** Throws EMAIL_NOT_CONFIGURED unless Brevo or Gmail SMTP is configured. */
export function requireAuthEmailConfig(
  environment: Environment = process.env,
): LoginCodeEmailProvider[] {
  const providers: LoginCodeEmailProvider[] = [];
  if (readAuthEmailConfig(environment)) providers.push("brevo");
  if (readGmailSmtpConfig(environment)) providers.push("gmail-smtp");
  if (providers.length === 0) throw new Error("EMAIL_NOT_CONFIGURED");
  return providers;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function renderLoginCodeEmail(input: {
  code: string;
  brandName: string;
  siteUrl: string;
  purpose: "sign-in" | "pin-confirmation";
}) {
  const brand = escapeHtml(input.brandName);
  const code = escapeHtml(input.code);
  const intro =
    input.purpose === "pin-confirmation"
      ? "Enter this code to confirm it's you. Your PIN keeps working afterwards."
      : "Enter this code to sign in or finish creating your account.";
  const siteLink = input.siteUrl
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:20px;color:#5b5b5b;">Signing in at <a href="${escapeHtml(input.siteUrl)}" style="color:#0A291B;">${escapeHtml(input.siteUrl.replace(/^https?:\/\//i, ""))}</a></p>`
    : "";
  const subject = `${input.code} is your ${input.brandName} code`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F6F1E7;font-family:Arial,Helvetica,sans-serif;color:#1B1B1B;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6F1E7;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8DDC4;">
<tr><td style="background:#0A291B;padding:24px;text-align:center;">
<div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:2px;color:#C5A85C;font-weight:bold;">${brand}</div>
</td></tr>
<tr><td style="padding:32px 28px;text-align:center;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:28px;color:#0A291B;">Your one-time code</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#333333;">${intro}</p>
<div style="display:inline-block;padding:16px 24px;border-radius:12px;background:#F6F1E7;border:1px solid #C5A85C;font-family:'Courier New',Courier,monospace;font-size:40px;line-height:44px;font-weight:bold;letter-spacing:10px;color:#0A291B;">${code}</div>
<p style="margin:24px 0 0;font-size:14px;line-height:20px;color:#5b5b5b;">This code expires in 10 minutes and can be used once.</p>
${siteLink}
<p style="margin:24px 0 0;font-size:13px;line-height:19px;color:#7a7a7a;">If you didn't ask for this code, you can ignore this email. Nobody can sign in without it.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html };
}

/** Thrown for any send failure; `reason` is safe to log (no codes, no secrets). */
export class EmailSendError extends Error {
  constructor(
    readonly reason: string,
    readonly quotaOrRateLimited = false,
  ) {
    super("EMAIL_SEND_FAILED");
  }
}

export async function sendBrevoEmail(
  config: AuthEmailConfig,
  message: { to: string; subject: string; html: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        sender: { name: config.fromName, email: config.fromEmail },
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        tags: ["auth-code"],
      }),
    });
  } catch {
    throw new EmailSendError("network error");
  }
  if (!response.ok) {
    // 429 = rate limited, 402 = out of credits / daily limit reached.
    const quota = response.status === 429 || response.status === 402;
    throw new EmailSendError(
      `HTTP ${response.status}${quota ? " (quota or rate limit)" : ""}`,
      quota,
    );
  }
}

export type GmailTransport = {
  sendMail(message: {
    from: { name: string; address: string };
    to: string;
    subject: string;
    html: string;
  }): Promise<unknown>;
};

export const createGmailTransport = (config: GmailSmtpConfig): GmailTransport =>
  nodemailer.createTransport({
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: true,
    auth: { user: config.user, pass: config.appPassword },
  });

export async function sendGmailSmtpEmail(
  config: GmailSmtpConfig,
  message: { to: string; subject: string; html: string },
  createTransport: (config: GmailSmtpConfig) => GmailTransport = createGmailTransport,
): Promise<void> {
  try {
    await createTransport(config).sendMail({
      // Gmail only sends as the authenticated account, so the From address
      // is always GMAIL_SMTP_USER.
      from: { name: config.fromName, address: config.user },
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  } catch (error) {
    const details = error as { code?: unknown; responseCode?: unknown };
    const parts = [
      typeof details?.code === "string" ? details.code : "",
      typeof details?.responseCode === "number"
        ? `SMTP ${details.responseCode}`
        : "",
    ].filter(Boolean);
    throw new EmailSendError(parts.join(" ") || "send error");
  }
}

const PROVIDER_LABEL: Record<LoginCodeEmailProvider, string> = {
  brevo: "Brevo",
  "gmail-smtp": "Gmail SMTP",
};

const failureReason = (error: unknown) =>
  error instanceof EmailSendError ? error.reason : "unexpected error";

/**
 * Sends a login code, Brevo first and Gmail SMTP as the fallback.
 * Logs only which provider sent it (or why one failed): never the code,
 * the recipient or any secret.
 */
export async function sendLoginCodeEmail(
  to: string,
  code: string,
  purpose: "sign-in" | "pin-confirmation",
  options: {
    environment?: Environment;
    fetchImpl?: typeof fetch;
    createGmailTransport?: (config: GmailSmtpConfig) => GmailTransport;
    log?: (line: string) => void;
  } = {},
): Promise<LoginCodeEmailProvider> {
  const environment = options.environment ?? process.env;
  const log = options.log ?? ((line: string) => console.info(line));
  requireAuthEmailConfig(environment);
  const brevo = readAuthEmailConfig(environment);
  const gmail = readGmailSmtpConfig(environment);
  const fromName = (brevo ?? gmail)!.fromName;
  const siteUrl = (brevo ?? gmail)!.siteUrl;
  const rendered = renderLoginCodeEmail({
    code,
    brandName: fromName,
    siteUrl,
    purpose,
  });
  const message = { to, subject: rendered.subject, html: rendered.html };

  if (brevo) {
    try {
      await sendBrevoEmail(brevo, message, options.fetchImpl);
      log(`Login code email sent via ${PROVIDER_LABEL.brevo}.`);
      return "brevo";
    } catch (error) {
      log(
        `Login code email: ${PROVIDER_LABEL.brevo} failed (${failureReason(error)})${gmail ? `; falling back to ${PROVIDER_LABEL["gmail-smtp"]}` : ""}.`,
      );
      if (!gmail) throw new Error("EMAIL_SEND_FAILED");
    }
  } else {
    log(
      `Login code email: ${PROVIDER_LABEL.brevo} not configured; using ${PROVIDER_LABEL["gmail-smtp"]}.`,
    );
  }

  try {
    await sendGmailSmtpEmail(gmail!, message, options.createGmailTransport);
  } catch (error) {
    log(
      `Login code email: ${PROVIDER_LABEL["gmail-smtp"]} failed (${failureReason(error)}).`,
    );
    throw new Error("EMAIL_SEND_FAILED");
  }
  log(`Login code email sent via ${PROVIDER_LABEL["gmail-smtp"]}.`);
  return "gmail-smtp";
}
