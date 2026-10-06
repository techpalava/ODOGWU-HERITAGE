import { getCanonicalEmail } from "../security/authIdentity.js";

/**
 * Server-only administrator allowlist.
 * Browser code must not import this module. The client entry can bundle
 * anything it reaches, and these addresses must stay out of that bundle.
 */
export const ALLOWED_ADMIN_EMAILS = [
  "techpalavabox@gmail.com",
  "f.o.startups@gmail.com",
  "vaprecfamily@gmail.com",
  "millstechbox@gmail.com",
] as const;

export function isAllowedAdminEmail(email?: string): boolean {
  const canonicalEmail = getCanonicalEmail(email);
  return (
    canonicalEmail.length > 0 &&
    ALLOWED_ADMIN_EMAILS.some(
      (allowedEmail) => getCanonicalEmail(allowedEmail) === canonicalEmail,
    )
  );
}
