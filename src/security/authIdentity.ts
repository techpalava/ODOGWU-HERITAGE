export const ALLOWED_ADMIN_EMAILS = [
  "techpalavabox@gmail.com",
  "f.o.startups@gmail.com",
  "vaprecfamily@gmail.com",
  "millstechbox@gmail.com",
] as const;

export function getCanonicalEmail(email?: string): string {
  if (!email) return "";

  const normalized = email.trim().toLowerCase();
  const parts = normalized.split("@");
  if (parts.length !== 2) return normalized;

  let [localPart, domain] = parts;
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  if (domain === "gmail.com") {
    localPart = localPart.split("+")[0].replace(/\./g, "");
  }

  return `${localPart}@${domain}`;
}

export function isAllowedAdminEmail(email?: string): boolean {
  const canonicalEmail = getCanonicalEmail(email);
  return (
    canonicalEmail.length > 0 &&
    ALLOWED_ADMIN_EMAILS.some(
      (allowedEmail) => getCanonicalEmail(allowedEmail) === canonicalEmail,
    )
  );
}

export function normalizePhone(phone?: string): string {
  return (phone || "").replace(/[^\d+]/g, "");
}
