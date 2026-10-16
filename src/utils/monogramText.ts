export const MONOGRAM_TEXT_MAX_LENGTH = 12;

const APOSTROPHE_VARIANTS = /[\u2018\u2019\u02BC]/g;

/**
 * Letters (including accented letters), spaces, hyphens, and apostrophes.
 * At least one letter is required so a string of punctuation is not a name.
 */
const MONOGRAM_TEXT_PATTERN = /^(?=.*\p{L})[\p{L} '-]+$/u;

export type MonogramTextValidation =
  | { status: "valid"; text: string }
  | { status: "empty" }
  | { status: "too_long"; text: string; maxLength: number }
  | { status: "invalid_characters"; text: string };

/** Trim, collapse repeated spaces, normalize apostrophes, and uppercase. */
export const normalizeMonogramText = (value: string): string =>
  value
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .toUpperCase();

/**
 * What the customer sees while typing. Uppercase and collapse repeated spaces,
 * but keep one trailing space so a multi-word name can still be entered.
 */
export const presentMonogramDraft = (value: string): string =>
  value
    .replace(APOSTROPHE_VARIANTS, "'")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+/, "")
    .toUpperCase();

export const validateMonogramText = (value: unknown): MonogramTextValidation => {
  if (typeof value !== "string") {
    return { status: "invalid_characters", text: "" };
  }
  const text = normalizeMonogramText(value);
  if (text.length === 0) return { status: "empty" };
  if (text.length > MONOGRAM_TEXT_MAX_LENGTH) {
    return {
      status: "too_long",
      text,
      maxLength: MONOGRAM_TEXT_MAX_LENGTH,
    };
  }
  if (!MONOGRAM_TEXT_PATTERN.test(text)) {
    return { status: "invalid_characters", text };
  }
  return { status: "valid", text };
};

export const monogramTextErrorMessage = (
  validation: MonogramTextValidation,
): string | null => {
  if (validation.status === "empty") return "Enter the name for this garment.";
  if (validation.status === "too_long") {
    return `Use ${validation.maxLength} characters or fewer.`;
  }
  if (validation.status === "invalid_characters") {
    return "Use letters, spaces, hyphens, and apostrophes.";
  }
  return null;
};
