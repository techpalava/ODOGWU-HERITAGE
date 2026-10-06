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

export function normalizePhone(phone?: string): string {
  return (phone || "").replace(/[^\d+]/g, "");
}
