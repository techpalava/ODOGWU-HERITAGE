import type { DesignStyleCategory, StyleCategory } from "../types.js";
import { formatCustomerVisibleKaftanText } from "./optionalShortsPresentation.js";

export const DESIGN_STYLE_CATEGORY_MAX_PER_STYLE = 3 as const;
export const DESIGN_STYLE_CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DESIGN_STYLE_CATEGORY_MAX_NAME_LENGTH = 80;
export const DESIGN_STYLE_CATEGORY_MAX_DESCRIPTION_LENGTH = 240;

const KAFTAN_PATTERN = /kaftan/i;

export interface DesignStyleCategoryNameValidationResult {
  readonly valid: boolean;
  readonly normalizedName: string;
  readonly replacedKaftan: boolean;
  readonly reason?: string;
}

/**
 * Normalizes whitespace and enforces "Long Shirt" wording in place of "Kaftan"
 * for every admin- and customer-facing category name.
 */
export const normalizeDesignStyleCategoryName = (raw: string): string => {
  const collapsed = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!collapsed) return "";
  return formatCustomerVisibleKaftanText(collapsed)
    .replace(/kaftans/gi, "Long Shirts")
    .replace(/kaftan/gi, "Long Shirt")
    .trim();
};

/**
 * Validates and sanitizes a category name, enforcing the "Long Shirt" wording
 * invariant and bounding length for Firestore rules compatibility.
 */
export const validateDesignStyleCategoryName = (
  raw: string,
): DesignStyleCategoryNameValidationResult => {
  const collapsed = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!collapsed) {
    return {
      valid: false,
      normalizedName: "",
      replacedKaftan: false,
      reason: "Category name is required.",
    };
  }
  const normalizedName = normalizeDesignStyleCategoryName(collapsed);
  if (!normalizedName) {
    return {
      valid: false,
      normalizedName: "",
      replacedKaftan: false,
      reason: "Category name is required.",
    };
  }
  if (KAFTAN_PATTERN.test(normalizedName)) {
    return {
      valid: false,
      normalizedName: "",
      replacedKaftan: false,
      reason: 'Category names must use "Long Shirt" instead of legacy wording.',
    };
  }
  if (normalizedName.length > DESIGN_STYLE_CATEGORY_MAX_NAME_LENGTH) {
    return {
      valid: false,
      normalizedName: "",
      replacedKaftan: false,
      reason: `Category name must be ${DESIGN_STYLE_CATEGORY_MAX_NAME_LENGTH} characters or fewer.`,
    };
  }
  return {
    valid: true,
    normalizedName,
    replacedKaftan: KAFTAN_PATTERN.test(collapsed),
  };
};

export const normalizeDesignStyleCategoryDescription = (
  raw: string | undefined,
): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const normalized = normalizeDesignStyleCategoryName(raw);
  if (!normalized) return undefined;
  return normalized.slice(0, DESIGN_STYLE_CATEGORY_MAX_DESCRIPTION_LENGTH);
};

export const isValidDesignStyleCategoryId = (
  value: unknown,
): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 64 &&
  DESIGN_STYLE_CATEGORY_ID_PATTERN.test(value);

/**
 * Generates a stable lowercase slug from a sanitized category name.
 */
export const slugifyDesignStyleCategoryId = (rawName: string): string => {
  const normalized = normalizeDesignStyleCategoryName(rawName);
  const slug = normalized
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug;
};

export const normalizeDesignStyleCategoryLookupKey = (rawName: string): string =>
  normalizeDesignStyleCategoryName(rawName).toLowerCase();

export const sortDesignStyleCategories = <
  T extends Pick<DesignStyleCategory, "id" | "name" | "displayOrder">,
>(
  categories: readonly T[],
): T[] =>
  [...categories].sort(
    (left, right) =>
      left.displayOrder - right.displayOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Strictly validates a persisted `design_style_categories` record.
 * Rejects any record whose stored name contains "Kaftan".
 */
export const parseDesignStyleCategoryRecord = (
  documentId: string,
  value: unknown,
): DesignStyleCategory | null => {
  if (!isValidDesignStyleCategoryId(documentId) || !isRecord(value)) {
    return null;
  }
  const keys = Object.keys(value);
  const requiredKeys = ["id", "name", "displayOrder", "enabled"];
  const allowedKeys = new Set([...requiredKeys, "description"]);
  if (
    !requiredKeys.every((key) => keys.includes(key)) ||
    keys.some((key) => !allowedKeys.has(key))
  ) {
    return null;
  }
  if (value.id !== documentId) return null;
  if (
    typeof value.name !== "string" ||
    value.name !== value.name.trim() ||
    value.name.length === 0 ||
    value.name.length > DESIGN_STYLE_CATEGORY_MAX_NAME_LENGTH ||
    KAFTAN_PATTERN.test(value.name)
  ) {
    return null;
  }
  if (
    !Number.isSafeInteger(value.displayOrder) ||
    Number(value.displayOrder) < 0 ||
    typeof value.enabled !== "boolean"
  ) {
    return null;
  }
  if (
    value.description !== undefined &&
    (typeof value.description !== "string" ||
      value.description.length > DESIGN_STYLE_CATEGORY_MAX_DESCRIPTION_LENGTH ||
      KAFTAN_PATTERN.test(value.description))
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    displayOrder: value.displayOrder as number,
    enabled: value.enabled,
    ...(typeof value.description === "string" && value.description.trim()
      ? { description: value.description.trim() }
      : {}),
  };
};

export const normalizeStyleCategoryIds = (
  categoryIds: readonly string[] | undefined,
): string[] => {
  if (categoryIds === undefined) return [];
  if (!Array.isArray(categoryIds)) {
    throw new Error("INVALID_STYLE_CATEGORY_IDS");
  }
  const unique: string[] = [];
  for (const raw of categoryIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!isValidDesignStyleCategoryId(id)) {
      throw new Error("INVALID_STYLE_CATEGORY_IDS");
    }
    if (!unique.includes(id)) {
      unique.push(id);
    }
  }
  if (unique.length > DESIGN_STYLE_CATEGORY_MAX_PER_STYLE) {
    throw new Error("INVALID_STYLE_CATEGORY_IDS");
  }
  return unique;
};

/**
 * Resolves the read-only `designCategories` legacy mirror from structured `categoryIds`.
 * - When `categoryIds` has items and registry `categories` are provided, returns sanitized
 *   category names in `categoryIds` order.
 * - When `categoryIds` is explicitly `[]` and registry `categories` are provided, returns `[]`.
 * - When `categoryIds` is `undefined` (or no registry lookup is provided), preserves
 *   sanitized `fallbackDesignCategories`.
 */
export const resolveMirroredDesignCategories = ({
  categoryIds,
  categories,
  fallbackDesignCategories,
}: {
  readonly categoryIds?: readonly string[];
  readonly categories?: readonly DesignStyleCategory[];
  readonly fallbackDesignCategories?: readonly string[];
}): string[] => {
  const sanitizedFallback = [
    ...new Set(
      (fallbackDesignCategories || [])
        .map((entry) => normalizeDesignStyleCategoryName(String(entry)))
        .filter(Boolean),
    ),
  ];

  if (categoryIds === undefined) {
    return sanitizedFallback;
  }

  const normalizedIds = normalizeStyleCategoryIds(categoryIds);
  if (!categories) {
    return sanitizedFallback;
  }
  if (normalizedIds.length === 0) {
    return [];
  }

  const byId = new Map<string, DesignStyleCategory>();
  for (const category of categories) {
    byId.set(category.id, category);
  }

  const mirrored: string[] = [];
  for (const categoryId of normalizedIds) {
    const matched = byId.get(categoryId);
    if (!matched) continue;
    const sanitizedName = normalizeDesignStyleCategoryName(matched.name);
    if (sanitizedName && !mirrored.includes(sanitizedName)) {
      mirrored.push(sanitizedName);
    }
  }
  return mirrored.length > 0 ? mirrored : sanitizedFallback;
};

export const countStylesUsingCategory = (
  categoryId: string,
  styles: readonly Pick<StyleCategory, "categoryIds">[],
): number =>
  styles.filter((style) => style.categoryIds?.includes(categoryId)).length;

export const getCategoryUsageCountById = (
  styles: readonly Pick<StyleCategory, "categoryIds">[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const style of styles) {
    for (const categoryId of style.categoryIds || []) {
      counts[categoryId] = (counts[categoryId] || 0) + 1;
    }
  }
  return counts;
};

export interface DesignStyleCategoryMigrationUpdate {
  readonly styleId: string;
  readonly styleName: string;
  readonly previousCategoryIds: readonly string[];
  readonly nextCategoryIds: readonly string[];
  readonly previousDesignCategories: readonly string[];
  readonly nextDesignCategories: readonly string[];
}

export interface DesignStyleCategoryUnmatchedEntry {
  readonly rawString: string;
  readonly normalizedString: string;
  readonly styleIds: readonly string[];
}

export interface DesignStyleCategoryMigrationSkipped {
  readonly styleId: string;
  readonly styleName: string;
  readonly reason: "EXCEEDS_MAX_CATEGORIES" | "PARTIAL_UNMATCHED";
  readonly matchedCategoryIds: readonly string[];
  readonly unmatchedStrings: readonly string[];
}

export interface DesignStyleCategoryMigrationPlan {
  readonly totalStyles: number;
  readonly totalCategories: number;
  readonly updates: readonly DesignStyleCategoryMigrationUpdate[];
  readonly unmatchedStrings: readonly DesignStyleCategoryUnmatchedEntry[];
  readonly skippedStyles: readonly DesignStyleCategoryMigrationSkipped[];
  readonly alreadyAlignedCount: number;
}

const arraysEqual = (
  left: readonly string[],
  right: readonly string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

/**
 * Pure dry-run planner mapping legacy `designCategories` strings onto the
 * structured `design_style_categories` registry without auto-creating unreviewed categories.
 */
export const planDesignStyleCategoryMigration = ({
  styles,
  categories,
}: {
  readonly styles: readonly Pick<
    StyleCategory,
    "id" | "name" | "categoryIds" | "designCategories"
  >[];
  readonly categories: readonly DesignStyleCategory[];
}): DesignStyleCategoryMigrationPlan => {
  const categoryByKey = new Map<string, DesignStyleCategory>();
  const categoryById = new Map<string, DesignStyleCategory>();
  for (const category of sortDesignStyleCategories(categories)) {
    categoryById.set(category.id, category);
    const key = normalizeDesignStyleCategoryLookupKey(category.name);
    if (key && !categoryByKey.has(key)) {
      categoryByKey.set(key, category);
    }
  }

  const unmatchedMap = new Map<
    string,
    { rawString: string; normalizedString: string; styleIds: Set<string> }
  >();
  const updates: DesignStyleCategoryMigrationUpdate[] = [];
  const skippedStyles: DesignStyleCategoryMigrationSkipped[] = [];
  let alreadyAlignedCount = 0;

  for (const style of styles) {
    const existingIds = [...new Set(style.categoryIds || [])].filter((id) =>
      categoryById.has(id),
    );
    const rawTags = (style.designCategories || [])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);

    if (existingIds.length > 0 && rawTags.length === 0) {
      const mirrored = resolveMirroredDesignCategories({
        categoryIds: existingIds,
        categories,
      });
      updates.push({
        styleId: style.id,
        styleName: style.name,
        previousCategoryIds: style.categoryIds || [],
        nextCategoryIds: existingIds,
        previousDesignCategories: style.designCategories || [],
        nextDesignCategories: mirrored,
      });
      continue;
    }

    const matchedIds: string[] = [...existingIds];
    const unmatchedForStyle: string[] = [];

    for (const rawTag of rawTags) {
      const normalized = normalizeDesignStyleCategoryName(rawTag);
      const lookupKey = normalizeDesignStyleCategoryLookupKey(rawTag);
      const matched = lookupKey ? categoryByKey.get(lookupKey) : undefined;
      if (matched) {
        if (!matchedIds.includes(matched.id)) {
          matchedIds.push(matched.id);
        }
      } else {
        unmatchedForStyle.push(rawTag);
        const mapKey = lookupKey || rawTag.toLowerCase();
        const current = unmatchedMap.get(mapKey);
        if (current) {
          current.styleIds.add(style.id);
        } else {
          unmatchedMap.set(mapKey, {
            rawString: rawTag,
            normalizedString: normalized,
            styleIds: new Set([style.id]),
          });
        }
      }
    }

    if (unmatchedForStyle.length > 0) {
      skippedStyles.push({
        styleId: style.id,
        styleName: style.name,
        reason: "PARTIAL_UNMATCHED",
        matchedCategoryIds: matchedIds,
        unmatchedStrings: unmatchedForStyle,
      });
      continue;
    }

    if (matchedIds.length > DESIGN_STYLE_CATEGORY_MAX_PER_STYLE) {
      skippedStyles.push({
        styleId: style.id,
        styleName: style.name,
        reason: "EXCEEDS_MAX_CATEGORIES",
        matchedCategoryIds: matchedIds,
        unmatchedStrings: [],
      });
      continue;
    }

    if (matchedIds.length === 0) {
      alreadyAlignedCount += 1;
      continue;
    }

    const mirrored = resolveMirroredDesignCategories({
      categoryIds: matchedIds,
      categories,
    });
    const prevIds = style.categoryIds || [];
    const prevTags = style.designCategories || [];
    if (arraysEqual(prevIds, matchedIds) && arraysEqual(prevTags, mirrored)) {
      alreadyAlignedCount += 1;
      continue;
    }

    updates.push({
      styleId: style.id,
      styleName: style.name,
      previousCategoryIds: prevIds,
      nextCategoryIds: matchedIds,
      previousDesignCategories: prevTags,
      nextDesignCategories: mirrored,
    });
  }

  return {
    totalStyles: styles.length,
    totalCategories: categories.length,
    updates,
    unmatchedStrings: Array.from(unmatchedMap.values())
      .map((entry) => ({
        rawString: entry.rawString,
        normalizedString: entry.normalizedString,
        styleIds: Array.from(entry.styleIds).sort(),
      }))
      .sort((a, b) => a.normalizedString.localeCompare(b.normalizedString)),
    skippedStyles,
    alreadyAlignedCount,
  };
};
