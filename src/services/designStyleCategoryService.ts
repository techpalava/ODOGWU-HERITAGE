import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { DesignStyleCategory, StyleCategory } from "../types";
import {
  countStylesUsingCategory,
  isValidDesignStyleCategoryId,
  normalizeDesignStyleCategoryDescription,
  parseDesignStyleCategoryRecord,
  sortDesignStyleCategories,
  validateDesignStyleCategoryName,
} from "../utils/designStyleCategories";
import { db } from "./firebase";

export const DESIGN_STYLE_CATEGORIES_COLLECTION = "design_style_categories";

const toValidatedCategoryRecord = (
  category: DesignStyleCategory,
): DesignStyleCategory => {
  if (!isValidDesignStyleCategoryId(category.id)) {
    throw new Error("INVALID_CATEGORY_ID");
  }
  const validation = validateDesignStyleCategoryName(category.name);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  if (!Number.isSafeInteger(category.displayOrder) || category.displayOrder < 0) {
    throw new Error("INVALID_CATEGORY_DISPLAY_ORDER");
  }
  const description = normalizeDesignStyleCategoryDescription(
    category.description,
  );
  return {
    id: category.id,
    name: validation.normalizedName,
    displayOrder: category.displayOrder,
    enabled: Boolean(category.enabled),
    ...(description ? { description } : {}),
  };
};

export const DesignStyleCategoryService = {
  subscribe(
    callback: (categories: readonly DesignStyleCategory[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    return onSnapshot(
      collection(db, DESIGN_STYLE_CATEGORIES_COLLECTION),
      (snapshot) => {
        const categories: DesignStyleCategory[] = [];
        snapshot.docs.forEach((document) => {
          const parsed = parseDesignStyleCategoryRecord(
            document.id,
            document.data(),
          );
          if (parsed) categories.push(parsed);
        });
        callback(sortDesignStyleCategories(categories));
      },
      (error) => onError(error),
    );
  },

  async saveCategory(
    category: DesignStyleCategory,
  ): Promise<DesignStyleCategory> {
    const record = toValidatedCategoryRecord(category);
    await setDoc(doc(db, DESIGN_STYLE_CATEGORIES_COLLECTION, record.id), record);
    return record;
  },

  async reorderCategories(
    ordered: readonly DesignStyleCategory[],
  ): Promise<void> {
    const batch = writeBatch(db);
    ordered.forEach((category, index) => {
      const record = toValidatedCategoryRecord({
        ...category,
        displayOrder: index,
      });
      batch.set(doc(db, DESIGN_STYLE_CATEGORIES_COLLECTION, record.id), record);
    });
    await batch.commit();
  },

  async setCategoryEnabled(
    category: DesignStyleCategory,
    enabled: boolean,
  ): Promise<DesignStyleCategory> {
    return this.saveCategory({
      ...category,
      enabled,
    });
  },

  async deleteUnusedCategory(
    categoryId: string,
    styles: readonly Pick<StyleCategory, "categoryIds">[],
  ): Promise<void> {
    if (!isValidDesignStyleCategoryId(categoryId)) {
      throw new Error("INVALID_CATEGORY_ID");
    }
    if (countStylesUsingCategory(categoryId, styles) > 0) {
      throw new Error(
        "CATEGORY_IN_USE: Disable or archive categories referenced by existing Design Styles instead of deleting them.",
      );
    }
    await deleteDoc(doc(db, DESIGN_STYLE_CATEGORIES_COLLECTION, categoryId));
  },
};
