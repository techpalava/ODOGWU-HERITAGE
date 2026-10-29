import { getCanonicalEmail } from "../security/authIdentity.js";

/**
 * Server-only administrator allowlist.
 * Browser code must not import this module. The client entry can bundle
 * anything it reaches, and these addresses must stay out of that bundle.
 *
 * Set ADMIN_EMAILS (comma or whitespace separated) on the server to manage
 * the list without a code change. When ADMIN_EMAILS is unset or empty, the
 * fallback list below applies so existing administrators keep access.
 */
export const ALLOWED_ADMIN_EMAILS = [
  "techpalavabox@gmail.com",
  "f.o.startups@gmail.com",
  "vaprecfamily@gmail.com",
  "millstechbox@gmail.com",
] as const;

export const ADMIN_EMAILS_ENV_VAR = "ADMIN_EMAILS";

export function getAllowedAdminEmails(
  environment: Record<string, string | undefined> = process.env,
): readonly string[] {
  const configured = (environment[ADMIN_EMAILS_ENV_VAR] || "")
    .split(/[\s,;]+/)
    .map((email) => getCanonicalEmail(email))
    .filter((email) => email.includes("@"));
  return configured.length > 0 ? configured : ALLOWED_ADMIN_EMAILS;
}

export function isAllowedAdminEmail(
  email?: string,
  environment?: Record<string, string | undefined>,
): boolean {
  const canonicalEmail = getCanonicalEmail(email);
  return (
    canonicalEmail.length > 0 &&
    getAllowedAdminEmails(environment).some(
      (allowedEmail) => getCanonicalEmail(allowedEmail) === canonicalEmail,
    )
  );
}
