/**
 * Step 4 sleeve choices.
 *
 * Men's combined sleeve stays one option (`shirt_*_midlong`) and is shown as
 * Long Sleeve. Women's combined sleeve splits into Mid Sleeve and Long Sleeve
 * at the same price. A saved combined dress choice resolves to Long Sleeve.
 */

export const SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID = "shirt_std_midlong";
export const SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID = "shirt_long_midlong";
export const DRESS_STANDARD_MID_SLEEVE_OPTION_ID = "dress_std_mid";
export const DRESS_STANDARD_LONG_SLEEVE_OPTION_ID = "dress_std_long";
export const DRESS_LONG_LENGTH_MID_SLEEVE_OPTION_ID = "dress_long_mid";
export const DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID = "dress_long_long";
export const LEGACY_DRESS_STANDARD_MIDLONG_OPTION_ID = "dress_std_midlong";
export const LEGACY_DRESS_LONG_LENGTH_MIDLONG_OPTION_ID = "dress_long_midlong";

export const SHIRT_STANDARD_LONG_SLEEVE_PRICE_CENTS = 7000;
export const SHIRT_LONG_LENGTH_LONG_SLEEVE_PRICE_CENTS = 7500;
export const DRESS_STANDARD_MID_OR_LONG_SLEEVE_PRICE_CENTS = 7500;
export const DRESS_LONG_LENGTH_MID_OR_LONG_SLEEVE_PRICE_CENTS = 8000;

export const LEGACY_MID_TO_LONG_SLEEVE_VALUE = "Mid-to-Long Sleeve";

const LEGACY_SLEEVE_VALUES = [
  LEGACY_MID_TO_LONG_SLEEVE_VALUE,
  "Mid-Long Sleeve",
  "Mid (3-Quarter) / Long Sleeve",
] as const;

export const LEGACY_DRESS_MIDLONG_TO_LONG_SLEEVE: Readonly<Record<string, string>> = {
  [LEGACY_DRESS_STANDARD_MIDLONG_OPTION_ID]: DRESS_STANDARD_LONG_SLEEVE_OPTION_ID,
  [LEGACY_DRESS_LONG_LENGTH_MIDLONG_OPTION_ID]: DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID,
};

const CANONICAL_SLEEVE_CONSTRUCTION_LABELS: Readonly<Record<string, string>> = {
  [SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID]: "Standard Length Shirt, Long Sleeve",
  [SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID]: "Long Length Shirt, Long Sleeve",
  [DRESS_STANDARD_MID_SLEEVE_OPTION_ID]: "Standard Length, Mid Sleeve",
  [DRESS_STANDARD_LONG_SLEEVE_OPTION_ID]: "Standard Length, Long Sleeve",
  [DRESS_LONG_LENGTH_MID_SLEEVE_OPTION_ID]: "Long Length, Mid Sleeve",
  [DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID]: "Long Length, Long Sleeve",
  [LEGACY_DRESS_STANDARD_MIDLONG_OPTION_ID]: "Standard Length, Long Sleeve",
  [LEGACY_DRESS_LONG_LENGTH_MIDLONG_OPTION_ID]: "Long Length, Long Sleeve",
};

export const canonicalSleeveConstructionLabel = (
  optionId: string,
  label: string,
): string => CANONICAL_SLEEVE_CONSTRUCTION_LABELS[optionId] ?? label;

/** Combined women's sleeve rows stay in the catalogue for saved drafts and are not offered as a third box. */
export const isCustomerHiddenLegacySleeveOption = (optionId: string): boolean =>
  Object.prototype.hasOwnProperty.call(LEGACY_DRESS_MIDLONG_TO_LONG_SLEEVE, optionId);

const isLegacySleeveValue = (value: string): boolean =>
  LEGACY_SLEEVE_VALUES.some(
    (legacy) => legacy.localeCompare(value.trim(), undefined, { sensitivity: "accent" }) === 0,
  );

const sourceHasLegacySleeveValue = (source: string): boolean =>
  LEGACY_SLEEVE_VALUES.some((legacy) => source.toLowerCase().includes(legacy.toLowerCase()));

/**
 * Saved combined sleeve values become Long Sleeve.
 * Men's option ids already are that Long Sleeve choice. Women's combined ids,
 * and the legacy label when a garment hint is present, become the Long Sleeve id.
 */
export const resolveLegacySleeveConstructionOptionId = (
  optionId: string,
  hint = "",
): string => {
  const mapped = LEGACY_DRESS_MIDLONG_TO_LONG_SLEEVE[optionId];
  if (mapped) return mapped;
  const source = `${optionId}\n${hint}`;
  if (!isLegacySleeveValue(optionId) && !sourceHasLegacySleeveValue(source)) {
    return optionId;
  }
  if (/shirt_long_midlong|shirt_long_|Long Length Shirt/i.test(source)) {
    return SHIRT_LONG_LENGTH_LONG_SLEEVE_OPTION_ID;
  }
  if (/shirt_std_midlong|shirt_std_|Standard Length Shirt/i.test(source)) {
    return SHIRT_STANDARD_LONG_SLEEVE_OPTION_ID;
  }
  if (/dress_long_midlong|dress_long_|Long Length,/i.test(source)) {
    return DRESS_LONG_LENGTH_LONG_SLEEVE_OPTION_ID;
  }
  if (/dress_std_midlong|dress_std_|Standard Length,/i.test(source)) {
    return DRESS_STANDARD_LONG_SLEEVE_OPTION_ID;
  }
  return optionId;
};
