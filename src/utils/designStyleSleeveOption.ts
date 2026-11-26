/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DesignStyleSleeveOption } from "../types.js";

export type { DesignStyleSleeveOption };

export const DESIGN_STYLE_SLEEVE_OPTIONS: readonly DesignStyleSleeveOption[] = [
  "sleeveless",
  "short_sleeve",
  "mid_sleeve",
  "long_sleeve",
] as const;

/**
 * Canonical persisted sleeve option values. Kept in lockstep with the
 * `hasValidDesignStylePresentation` rule in firestore.rules. "Not specified"
 * is represented by omitting the field, never by an empty string.
 */
export const DESIGN_STYLE_SLEEVE_OPTION_VALUES: readonly DesignStyleSleeveOption[] = [
  "sleeveless",
  "short_sleeve",
  "mid_sleeve",
  "long_sleeve",
] as const;

/**
 * Type guard for DesignStyleSleeveOption.
 * Returns true only for the four canonical sleeve option values.
 */
export const isDesignStyleSleeveOption = (
  value: unknown,
): value is DesignStyleSleeveOption =>
  DESIGN_STYLE_SLEEVE_OPTION_VALUES.includes(value as DesignStyleSleeveOption);

/**
 * Normalizes a value to a valid DesignStyleSleeveOption or undefined.
 * Returns undefined for empty string, null, undefined, or invalid values.
 */
export const normalizeDesignStyleSleeveOption = (
  value: unknown,
): DesignStyleSleeveOption | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    if (isDesignStyleSleeveOption(trimmed)) return trimmed;
  }
  return undefined;
};

/**
 * Returns the human-readable label for a sleeve option, or null if the value
 * is not a valid sleeve option (i.e., undefined, empty string, or invalid).
 * This is used to determine whether to render a badge.
 */
export const getDesignStyleSleeveOptionLabel = (
  value: unknown,
): string | null => {
  if (!isDesignStyleSleeveOption(value)) return null;

  switch (value) {
    case "sleeveless":
      return "Sleeveless";
    case "short_sleeve":
      return "Short Sleeve";
    case "mid_sleeve":
      return "Mid Sleeve";
    case "long_sleeve":
      return "Long Sleeve";
    default:
      return null;
  }
};
