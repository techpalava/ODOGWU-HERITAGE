/**
 * Server-only transactional email through the Brevo API.
 * Every sender and site detail comes from the environment so a future
 * custom domain needs no code change:
 *   BREVO_API_KEY          Brevo API key (required)
 *   AUTH_EMAIL_FROM        verified sender address (required)
 *   AUTH_EMAIL_FROM_NAME   sender name, default "The Odogwu Heritage"
 *   PUBLIC_SITE_URL        site link in the email (falls back to APP_URL)
 */
export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
export const DEFAULT_AUTH_EMAIL_FROM_NAME = "The Odogwu Heritage";

export type AuthEmailConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  siteUrl: string;
};

type Environment = Record<string, string | undefined>;

export function readAuthEmailConfig(
  environment: Environment = process.env,
): AuthEmailConfig | null {
  const apiKey = environment.BREVO_API_KEY?.trim() || "";
  const fromEmail = environment.AUTH_EMAIL_FROM?.trim() || "";
  if (!apiKey || !fromEmail.includes("@")) return null;
  const siteUrl = (
    environment.PUBLIC_SITE_URL?.trim() ||
    environment.APP_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
  return {
    apiKey,
    fromEmail,
    fromName:
      environment.AUTH_EMAIL_FROM_NAME?.trim() || DEFAULT_AUTH_EMAIL_FROM_NAME,
    siteUrl: /^https?:\/\//i.test(siteUrl) ? siteUrl : "",
  };
}

export function requireAuthEmailConfig(
  environment: Environment = process.env,
): AuthEmailConfig {
  const config = readAuthEmailConfig(environment);
  if (!config) throw new Error("EMAIL_NOT_CONFIGURED");
  return config;
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
    throw new Error("EMAIL_SEND_FAILED");
  }
  if (!response.ok) {
    console.error(
      `Brevo transactional email failed with HTTP ${response.status}.`,
    );
    throw new Error("EMAIL_SEND_FAILED");
  }
}

export async function sendLoginCodeEmail(
  to: string,
  code: string,
  purpose: "sign-in" | "pin-confirmation",
  options: { environment?: Environment; fetchImpl?: typeof fetch } = {},
) {
  const config = requireAuthEmailConfig(options.environment);
  const rendered = renderLoginCodeEmail({
    code,
    brandName: config.fromName,
    siteUrl: config.siteUrl,
    purpose,
  });
  await sendBrevoEmail(
    config,
    { to, subject: rendered.subject, html: rendered.html },
    options.fetchImpl,
  );
}
