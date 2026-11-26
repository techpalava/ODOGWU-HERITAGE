/**
 * Pagination utilities for Step 3 Design Style catalogue.
 * Pure, framework-agnostic helpers for client-side pagination.
 */

export const STEP3_CATALOGUE_PAGE_SIZE = 12;

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalItems: number;
  readonly startIndex: number; // 1-based, for "Showing 1–12 of 38"
  readonly endIndex: number;   // 1-based, clamped to totalItems
}

/**
 * Paginates a readonly array of entries.
 * @param entries - The full list of entries to paginate
 * @param requestedPage - 1-based page number requested
 * @param pageSize - Items per page (default: STEP3_CATALOGUE_PAGE_SIZE)
 * @returns PaginatedResult with clamped page and 1-based indices for UI
 */
export function paginateDesignStyleEntries<T>(
  entries: readonly T[],
  requestedPage: number,
  pageSize: number = STEP3_CATALOGUE_PAGE_SIZE,
): PaginatedResult<T> {
  const safePageSize =
    Number.isFinite(pageSize) && pageSize >= 1
      ? Math.trunc(pageSize)
      : STEP3_CATALOGUE_PAGE_SIZE;
  const safeRequestedPage = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1;
  const totalItems = entries.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / safePageSize);

  // Clamp requested page to valid range
  const page = Math.max(1, Math.min(safeRequestedPage, totalPages));

  const startIndex = totalItems === 0 ? 0 : (page - 1) * safePageSize + 1;
  const endIndex = Math.min(page * safePageSize, totalItems);

  const start = startIndex === 0 ? 0 : startIndex - 1; // Convert to 0-based for slice
  const end = endIndex;

  const items = entries.slice(start, end);

  return {
    items,
    page,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  };
}

/**
 * Generates a compact array of page numbers and ellipsis markers for pagination UI.
 * Always includes: page 1, pages around currentPage (±1), and the last page.
 * Inserts "ellipsis" strings where page numbers are skipped.
 *
 * @param currentPage - 1-based current page
 * @param totalPages - Total number of pages
 * @returns Array of page numbers (number) and "ellipsis" strings
 *
 * Examples:
 *   totalPages=5, currentPage=3  -> [1, 2, 3, 4, 5]
 *   totalPages=10, currentPage=1 -> [1, 2, 3, "ellipsis", 10]
 *   totalPages=10, currentPage=3 -> [1, 2, 3, 4, "ellipsis", 10]
 *   totalPages=12, currentPage=6 -> [1, "ellipsis", 5, 6, 7, "ellipsis", 12]
 *   totalPages=12, currentPage=11 -> [1, "ellipsis", 10, 11, 12]
 */
export function getPaginationPageItems(
  currentPage: number,
  totalPages: number,
): ReadonlyArray<number | "ellipsis"> {
  if (totalPages <= 1) return [];

  // If total pages is small (<= 7), show all pages
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const safePage = Number.isFinite(currentPage)
    ? Math.max(1, Math.min(Math.trunc(currentPage), totalPages))
    : 1;
  const pages: Array<number | "ellipsis"> = [];
  const delta = 1; // How many neighbors on each side of currentPage

  // Always show page 1
  pages.push(1);

  // Calculate neighbor range around current page
  const startNeighbor = Math.max(2, safePage - delta);
  const endNeighbor = Math.min(totalPages - 1, safePage + delta);

  if (safePage <= 3) {
    // Near start: show pages 2..3 (and 4 when on page 3 so +1 neighbor is visible)
    const end = Math.min(Math.max(3, endNeighbor), totalPages - 1);
    for (let p = 2; p <= end; p++) {
      if (!pages.includes(p)) pages.push(p);
    }
    if (end < totalPages - 1) {
      pages.push("ellipsis");
    }
  } else if (safePage >= totalPages - 2) {
    // Near end: add ellipsis if there's a gap from page 1
    if (startNeighbor > 2) {
      pages.push("ellipsis");
    }
    // Show current page and its neighbors within the last few pages
    // For page totalPages-1 (e.g., 9 of 10): show 8, 9, 10
    // For page totalPages (e.g., 10 of 10): show 9, 10
    // For page totalPages-2 (e.g., 10 of 12): show 9, 10, 11, 12
    const start = Math.max(2, safePage - 1);
    for (let p = start; p <= totalPages - 1; p++) {
      if (!pages.includes(p)) pages.push(p);
    }
  } else {
    // In middle: ellipsis after page 1
    pages.push("ellipsis");
    // Neighbor pages around current
    for (let p = startNeighbor; p <= endNeighbor; p++) {
      if (!pages.includes(p)) pages.push(p);
    }
    pages.push("ellipsis");
  }

  // Always show last page (if not already shown)
  if (totalPages > 1 && !pages.includes(totalPages)) {
    pages.push(totalPages);
  }

  return pages;
}
