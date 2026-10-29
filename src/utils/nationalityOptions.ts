import {
  STEP8_COUNTRY_ZONE_INDEX,
  STEP8_FAKE_COUNTRY_CODE_SENTINELS,
  formatStep8CountryLabel,
} from "../config/Step8AdditionalDeliveryConfig.js";

/**
 * Nationality choices for customer reviews. Built from the Step 8 country
 * list the same way as SITE_FEEDBACK_NATIONALITY_OPTIONS in siteFeedback.ts,
 * so both forms offer the same countries with the same English names.
 */

export interface NationalityOption {
  code: string;
  label: string;
}

/** Every ISO country from the Step 8 country list, by English name. */
export const NATIONALITY_OPTIONS: readonly NationalityOption[] = Object.freeze(
  [...STEP8_COUNTRY_ZONE_INDEX.keys()]
    .filter((code) => /^[A-Z]{2}$/.test(code) && !STEP8_FAKE_COUNTRY_CODE_SENTINELS.has(code))
    .map((code) => ({ code, label: formatStep8CountryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en")),
);

const NATIONALITY_CODES = new Set(NATIONALITY_OPTIONS.map((option) => option.code));

/** Shape the rules accept: two uppercase letters. */
export const NATIONALITY_CODE_PATTERN = /^[A-Z]{2}$/;

export function isNationalityCode(value: unknown): value is string {
  return typeof value === "string" && NATIONALITY_CODES.has(value);
}

export function nationalityLabel(code: string | null | undefined): string {
  if (!code) return "";
  return formatStep8CountryLabel(code);
}
