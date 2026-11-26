import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { createElement } from "react";
import {
  paginateDesignStyleEntries,
  getPaginationPageItems,
} from "./src/utils/designStylePagination";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type { GarmentTypeStepSelection, StyleCategory } from "./src/types";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

// ============================================================================
// Unit Tests for paginateDesignStyleEntries
// ============================================================================

console.log("Running unit tests for paginateDesignStyleEntries...");

// 1. Zero items
{
  const result = paginateDesignStyleEntries([], 1);
  assert.equal(result.items.length, 0);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.totalItems, 0);
  assert.equal(result.startIndex, 0);
  assert.equal(result.endIndex, 0);
  console.log("  ✓ Zero items");
}

// 2. Less than page size (5 items)
{
  const entries = [1, 2, 3, 4, 5];
  const result = paginateDesignStyleEntries(entries, 1);
  assert.deepEqual(result.items, [1, 2, 3, 4, 5]);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.totalItems, 5);
  assert.equal(result.startIndex, 1);
  assert.equal(result.endIndex, 5);
  console.log("  ✓ Less than page size");
}

// 3. Exactly page size (12 items)
{
  const entries = Array.from({ length: 12 }, (_, i) => i + 1);
  const result = paginateDesignStyleEntries(entries, 1);
  assert.equal(result.items.length, 12);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.totalItems, 12);
  assert.equal(result.startIndex, 1);
  assert.equal(result.endIndex, 12);
  console.log("  ✓ Exactly page size");
}

// 4. Multiple pages (26 items = 3 pages)
{
  const entries = Array.from({ length: 26 }, (_, i) => i + 1);

  // Page 1
  const page1 = paginateDesignStyleEntries(entries, 1);
  assert.equal(page1.items.length, 12);
  assert.deepEqual(page1.items, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(page1.page, 1);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.totalItems, 26);
  assert.equal(page1.startIndex, 1);
  assert.equal(page1.endIndex, 12);

  // Page 2
  const page2 = paginateDesignStyleEntries(entries, 2);
  assert.equal(page2.items.length, 12);
  assert.deepEqual(page2.items, Array.from({ length: 12 }, (_, i) => i + 13));
  assert.equal(page2.page, 2);
  assert.equal(page2.startIndex, 13);
  assert.equal(page2.endIndex, 24);

  // Page 3 (partial)
  const page3 = paginateDesignStyleEntries(entries, 3);
  assert.equal(page3.items.length, 2);
  assert.deepEqual(page3.items, [25, 26]);
  assert.equal(page3.page, 3);
  assert.equal(page3.startIndex, 25);
  assert.equal(page3.endIndex, 26);

  console.log("  ✓ Multiple pages (26 items)");
}

// 5. Clamping: requested page > totalPages
{
  const entries = Array.from({ length: 5 }, (_, i) => i + 1);
  const result = paginateDesignStyleEntries(entries, 5);
  assert.equal(result.page, 1);
  assert.equal(result.items.length, 5);
  console.log("  ✓ Clamping: page > totalPages");
}

// 6. Clamping: requested page < 1
{
  const entries = Array.from({ length: 5 }, (_, i) => i + 1);
  const result = paginateDesignStyleEntries(entries, -3);
  assert.equal(result.page, 1);
  assert.equal(result.items.length, 5);
  console.log("  ✓ Clamping: page < 1");
}

// 7. Zero items with out-of-range page
{
  const result = paginateDesignStyleEntries([], 5);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.startIndex, 0);
  assert.equal(result.endIndex, 0);
  console.log("  ✓ Zero items with out-of-range page");
}

// 8. Custom page size
{
  const entries = Array.from({ length: 25 }, (_, i) => i + 1);
  const result = paginateDesignStyleEntries(entries, 2, 10);
  assert.equal(result.items.length, 10);
  assert.equal(result.page, 2);
  assert.equal(result.totalPages, 3);
  assert.equal(result.startIndex, 11);
  assert.equal(result.endIndex, 20);
  console.log("  ✓ Custom page size");
}

console.log("All paginateDesignStyleEntries unit tests passed!\n");

// ============================================================================
// Unit Tests for getPaginationPageItems
// ============================================================================

console.log("Running unit tests for getPaginationPageItems...");

// 1. Single page
{
  const result = getPaginationPageItems(1, 1);
  assert.deepEqual(result, []);
  console.log("  ✓ Single page returns empty");
}

// 2. Two pages
{
  const result = getPaginationPageItems(1, 2);
  assert.deepEqual(result, [1, 2]);
  const result2 = getPaginationPageItems(2, 2);
  assert.deepEqual(result2, [1, 2]);
  console.log("  ✓ Two pages");
}

// 3. Five pages, current in middle
{
  const result = getPaginationPageItems(3, 5);
  assert.deepEqual(result, [1, 2, 3, 4, 5]);
  console.log("  ✓ Five pages, current in middle");
}

// 4. Ten pages, current at start
{
  const result = getPaginationPageItems(1, 10);
  assert.deepEqual(result, [1, 2, 3, "ellipsis", 10]);
  console.log("  ✓ Ten pages, current at start");
}

// 5. Ten pages, current in middle
{
  const result = getPaginationPageItems(5, 10);
  assert.deepEqual(result, [1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  console.log("  ✓ Ten pages, current in middle");
}

// 6. Ten pages, current at end
{
  const result = getPaginationPageItems(10, 10);
  assert.deepEqual(result, [1, "ellipsis", 9, 10]);
  console.log("  ✓ Ten pages, current at end");
}

// 7. Twelve pages, current near end
{
  const result = getPaginationPageItems(11, 12);
  assert.deepEqual(result, [1, "ellipsis", 10, 11, 12]);
  console.log("  ✓ Twelve pages, current near end");
}

// 8. Seven pages (boundary: no ellipsis needed)
{
  const result = getPaginationPageItems(4, 7);
  assert.deepEqual(result, [1, 2, 3, 4, 5, 6, 7]);
  console.log("  ✓ Seven pages (no ellipsis)");
}

// 9. Eight pages (ellipsis appears)
{
  const result = getPaginationPageItems(4, 8);
  // For 8 pages, page 4 is in the "middle" range (>3), so ellipsis after page 1
  assert.deepEqual(result, [1, "ellipsis", 3, 4, 5, "ellipsis", 8]);
  console.log("  ✓ Eight pages (ellipsis appears)");
}

console.log("All getPaginationPageItems unit tests passed!\n");

// ============================================================================
// UI Tests for DormantFutureDesignStyleStep Pagination
// ============================================================================

console.log("Running UI tests for Step 3 catalogue pagination...");

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const createTestStyle = (id: string, name: string, gender: StyleCategory["gender"] = "male"): StyleCategory => ({
  id,
  name,
  description: `Description for ${name}`,
  gender,
  targetDemographic: gender === "couple" || gender === "family" ? "unisex" : gender,
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
});

const renderStep = async (model: ReturnType<typeof createDesignStyleStepTestModel>) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        ...createDesignStyleStepRenderProps(model),
      }),
    );
  });
  return renderer;
};

const getCardNames = (root: ReactTestInstance): string[] =>
  root
    .findAll((n) => n.props?.["data-style-card"] === "true")
    .map((n) => String(n.props["data-style-name"]));

const getRangeText = (root: ReactTestInstance): string | null => {
  const rangeEl = root.findAll((n) => n.props?.["data-testid"] === "step3-catalogue-range");
  return rangeEl[0] ? textContent(rangeEl[0]) : null;
};

const getPaginationNav = (root: ReactTestInstance): ReactTestInstance | null => {
  const nav = root.findAll((n) => n.props?.["data-testid"] === "step3-catalogue-pagination");
  return nav[0] || null;
};

const getPrevButton = (root: ReactTestInstance): ReactTestInstance | null => {
  const btn = root.findAll((n) => n.props?.["data-testid"] === "step3-pagination-prev");
  return btn[0] || null;
};

const getNextButton = (root: ReactTestInstance): ReactTestInstance | null => {
  const btn = root.findAll((n) => n.props?.["data-testid"] === "step3-pagination-next");
  return btn[0] || null;
};

// Test 1: 26 styles - pagination renders correctly
console.log("  Test 1: 26 styles - Page 1 renders 12 cards");
{
  const styles = Array.from({ length: 26 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  const renderer = await renderStep(model);
  const root = renderer.root;

  const cards = getCardNames(root);
  assert.equal(cards.length, 12, `Expected 12 cards on page 1, got ${cards.length}`);
  assert.deepEqual(cards, Array.from({ length: 12 }, (_, i) => `Style ${i + 1}`));

  const rangeText = getRangeText(root);
  assert.equal(rangeText, "Showing 1–12 of 26 designs");

  const paginationNav = getPaginationNav(root);
  assert.ok(paginationNav, "Pagination nav should exist for 26 styles");

  const prevBtn = getPrevButton(root);
  assert.ok(prevBtn);
  assert.equal(prevBtn.props.disabled, true);

  const nextBtn = getNextButton(root);
  assert.ok(nextBtn);
  assert.equal(nextBtn.props.disabled, false);

  await act(async () => renderer.unmount());
  console.log("    ✓ Page 1 renders 12 cards, range text correct, nav present");
}

// Test 2: Click Next - renders cards 13-24
console.log("  Test 2: Click Next - renders cards 13-24");
{
  const styles = Array.from({ length: 26 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  const renderer = await renderStep(model);
  const root = renderer.root;

  const nextBtn = getNextButton(root);
  assert.ok(nextBtn);
  await act(async () => nextBtn.props.onClick());

  const cards = getCardNames(root);
  assert.equal(cards.length, 12, `Expected 12 cards on page 2, got ${cards.length}`);
  assert.deepEqual(cards, Array.from({ length: 12 }, (_, i) => `Style ${i + 13}`));

  const rangeText = getRangeText(root);
  assert.equal(rangeText, "Showing 13–24 of 26 designs");

  const prevBtn = getPrevButton(root);
  assert.equal(prevBtn.props.disabled, false);

  const nextBtn2 = getNextButton(root);
  assert.equal(nextBtn2.props.disabled, false);

  await act(async () => renderer.unmount());
  console.log("    ✓ Page 2 renders cards 13-24, range text correct");
}

// Test 3: Page 3 renders remaining 2 cards
console.log("  Test 3: Page 3 renders remaining 2 cards");
{
  const styles = Array.from({ length: 26 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  const renderer = await renderStep(model);
  let root = renderer.root;

  const nextBtn1 = getNextButton(root);
  await act(async () => nextBtn1.props.onClick());

  root = renderer.root;
  const nextBtn2 = getNextButton(root);
  await act(async () => nextBtn2.props.onClick());

  root = renderer.root;
  const cards = getCardNames(root);
  assert.equal(cards.length, 2, `Expected 2 cards on page 3, got ${cards.length}`);
  assert.deepEqual(cards, ["Style 25", "Style 26"]);

  const rangeText = getRangeText(root);
  assert.equal(rangeText, "Showing 25–26 of 26 designs");

  const nextBtn3 = getNextButton(root);
  assert.equal(nextBtn3.props.disabled, true);

  const prevBtn = getPrevButton(root);
  assert.equal(prevBtn.props.disabled, false);

  await act(async () => renderer.unmount());
  console.log("    ✓ Page 3 renders 2 cards, Next disabled");
}

// Test 4: Prev/Next disabled states work correctly
console.log("  Test 4: Prev/Next disabled states");
{
  const styles = Array.from({ length: 26 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  const renderer = await renderStep(model);
  let root = renderer.root;

  let prevBtn = getPrevButton(root);
  let nextBtn = getNextButton(root);
  assert.equal(prevBtn.props.disabled, true, "Prev disabled on page 1");
  assert.equal(nextBtn.props.disabled, false, "Next enabled on page 1");

  await act(async () => nextBtn.props.onClick());
  root = renderer.root;
  prevBtn = getPrevButton(root);
  nextBtn = getNextButton(root);
  assert.equal(prevBtn.props.disabled, false, "Prev enabled on page 2");
  assert.equal(nextBtn.props.disabled, false, "Next enabled on page 2");

  await act(async () => nextBtn.props.onClick());
  root = renderer.root;
  prevBtn = getPrevButton(root);
  nextBtn = getNextButton(root);
  assert.equal(prevBtn.props.disabled, false, "Prev enabled on page 3");
  assert.equal(nextBtn.props.disabled, true, "Next disabled on page 3");

  await act(async () => renderer.unmount());
  console.log("    ✓ Prev/Next disabled states correct");
}

// Test 5: Switching category filter resets to Page 1
console.log("  Test 5: Category filter change resets to Page 1");
{
  // Create styles in two categories
  const styles = [
    ...Array.from({ length: 15 }, (_, i) =>
      createTestStyle(`cat1-${i + 1}`, `Cat1 Style ${i + 1}`),
    ),
    ...Array.from({ length: 15 }, (_, i) =>
      createTestStyle(`cat2-${i + 1}`, `Cat2 Style ${i + 1}`),
    ),
  ];
  // Add category IDs
  const stylesWithCategories = styles.map((s, i) => ({
    ...s,
    categoryIds: i < 15 ? ["cat1"] : ["cat2"],
  })) as StyleCategory[];

  const model = createDesignStyleStepTestModel({
    styles: stylesWithCategories,
    garmentTypeSelection: selection(["shirt"]),
  });

  const categories = [
    { id: "cat1", name: "Category 1", displayOrder: 0, enabled: true },
    { id: "cat2", name: "Category 2", displayOrder: 1, enabled: true },
  ];

  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        ...createDesignStyleStepRenderProps(model),
        designStyleCategories: categories,
      }),
    );
  });
  let root = renderer.root;

  // Go to page 2 (should have 12 items per page, 30 total = 3 pages)
  const nextBtn = getNextButton(root);
  await act(async () => nextBtn.props.onClick());
  root = renderer.root;
  let cards = getCardNames(root);
  assert.equal(cards.length, 12);

  // Now filter by Category 2
  const cat2Chip = root.findByProps({ "data-testid": "step3-category-chip-cat2" });
  await act(async () => cat2Chip.props.onClick());

  root = renderer.root;
  // Should be back on page 1, showing Category 2 styles (15 items = 2 pages)
  cards = getCardNames(root);
  assert.equal(cards.length, 12);
  assert.ok(cards.every((c) => c.startsWith("Cat2")));

  // Range should show page 1 of Category 2
  const rangeText = getRangeText(root);
  assert.equal(rangeText, "Showing 1–12 of 15 designs");

  await act(async () => renderer.unmount());
  console.log("    ✓ Category filter resets to Page 1");
}

// Test 6: <= 12 styles hides pagination bar
console.log("  Test 6: <= 12 styles hides pagination bar");
{
  const styles12 = Array.from({ length: 12 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model12 = createDesignStyleStepTestModel({
    styles: styles12,
    garmentTypeSelection: selection(["shirt"]),
  });

  let renderer = await renderStep(model12);
  let root = renderer.root;

  const paginationNav12 = getPaginationNav(root);
  assert.equal(paginationNav12, null, "Pagination should not render for exactly 12 styles");

  const rangeText12 = getRangeText(root);
  assert.equal(rangeText12, null, "Range text should not render for exactly 12 styles");

  await act(async () => renderer.unmount());

  const styles5 = Array.from({ length: 5 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model5 = createDesignStyleStepTestModel({
    styles: styles5,
    garmentTypeSelection: selection(["shirt"]),
  });

  renderer = await renderStep(model5);
  root = renderer.root;

  const paginationNav5 = getPaginationNav(root);
  assert.equal(paginationNav5, null, "Pagination should not render for 5 styles");

  const rangeText5 = getRangeText(root);
  assert.equal(rangeText5, null, "Range text should not render for 5 styles");

  await act(async () => renderer.unmount());
  console.log("    ✓ Pagination hidden for <= 12 styles");
}

// Test 7: Audience filter change resets to Page 1
console.log("  Test 7: Audience filter change resets to Page 1");
{
  const styles = [
    ...Array.from({ length: 15 }, (_, i) =>
      createTestStyle(`male-${i + 1}`, `Male Style ${i + 1}`, "male"),
    ),
    ...Array.from({ length: 15 }, (_, i) =>
      createTestStyle(`female-${i + 1}`, `Female Style ${i + 1}`, "female"),
    ),
  ];
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  let renderer = await renderStep(model);
  let root = renderer.root;

  const nextBtn = getNextButton(root);
  await act(async () => nextBtn.props.onClick());
  root = renderer.root;
  let cards = getCardNames(root);
  assert.equal(cards.length, 12);

  const femaleChip = root.findByProps({ "data-testid": "step3-audience-chip-female" });
  await act(async () => femaleChip.props.onClick());

  root = renderer.root;
  cards = getCardNames(root);
  assert.equal(cards.length, 12);
  assert.ok(cards.every((c) => c.startsWith("Female")));

  const rangeText = getRangeText(root);
  assert.equal(rangeText, "Showing 1–12 of 15 designs");

  await act(async () => renderer.unmount());
  console.log("    ✓ Audience filter resets to Page 1");
}

// Test 8: Page number buttons work (desktop)
console.log("  Test 8: Page number buttons work");
{
  const styles = Array.from({ length: 26 }, (_, i) =>
    createTestStyle(`style-${i + 1}`, `Style ${i + 1}`),
  );
  const model = createDesignStyleStepTestModel({
    styles,
    garmentTypeSelection: selection(["shirt"]),
  });

  const renderer = await renderStep(model);
  let root = renderer.root;

  const nextBtn1 = getNextButton(root);
  await act(async () => nextBtn1.props.onClick());
  root = renderer.root;
  const nextBtn2 = getNextButton(root);
  await act(async () => nextBtn2.props.onClick());
  root = renderer.root;

  const cards = getCardNames(root);
  assert.equal(cards.length, 2);
  assert.deepEqual(cards, ["Style 25", "Style 26"]);

  const page1Btn = root.findAll(
    (n) => n.type === "button" && textContent(n).trim() === "1",
  )[0];
  assert.ok(page1Btn);
  await act(async () => page1Btn.props.onClick());
  root = renderer.root;

  const cards2 = getCardNames(root);
  assert.equal(cards2.length, 12);
  assert.deepEqual(cards2, Array.from({ length: 12 }, (_, i) => `Style ${i + 1}`));

  await act(async () => renderer.unmount());
  console.log("    ✓ Page number navigation works");
}

console.log("\nAll UI tests passed!");

// ============================================================================
// Summary
// ============================================================================

console.log("\n✅ All tests passed:");
console.log("  - paginateDesignStyleEntries: 8 unit tests");
console.log("  - getPaginationPageItems: 9 unit tests");
console.log("  - UI integration: 8 tests (26 styles pagination, filter reset, edge cases)");
console.log("\nRun complete: test_step3_catalogue_pagination.tsx");