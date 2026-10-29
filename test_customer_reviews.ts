import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { CustomerReviewCard } from "./src/components/CustomerReviewCard";
import type { CustomerReview } from "./src/types";
import {
  CUSTOMER_REVIEW_CREATE_KEYS,
  CUSTOMER_REVIEW_FEATURED_CAP,
  SEED_CUSTOMER_REVIEWS,
  buildCustomerReviewCreatePayload,
  canFeatureReview,
  clampRating,
  filterPublishedReviews,
  formatReviewNationalities,
  formatReviewOrigin,
  isValidRating,
  normalizeCustomerReview,
  normalizeReviewNationalities,
  resolvePublishedReviewsForDisplay,
  selectSliderReviews,
  validateCustomerReviewInput,
} from "./src/utils/customerReviews";
import {
  NATIONALITY_OPTIONS,
  isNationalityCode,
  nationalityLabel,
} from "./src/utils/nationalityOptions";
import { SITE_FEEDBACK_NATIONALITY_OPTIONS } from "./src/utils/siteFeedback";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function review(
  id: string,
  overrides: Partial<CustomerReview> = {},
): CustomerReview {
  return {
    id,
    authorName: `Author ${id}`,
    body: "A lovely heritage outfit, beautifully made.",
    rating: 5,
    status: "published",
    featured: false,
    displayOrder: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdByUid: null,
    ...overrides,
  };
}

// Rating clamp
assert.equal(clampRating(0), 1);
assert.equal(clampRating(-3), 1);
assert.equal(clampRating(9), 5);
assert.equal(clampRating(3.4), 3);
assert.equal(clampRating(4.6), 5);
assert.equal(clampRating("4"), 4);
assert.equal(clampRating(Number.NaN), 1);
assert.equal(clampRating(undefined), 1);
assert.equal(isValidRating(3), true);
assert.equal(isValidRating(0), false);
assert.equal(isValidRating(6), false);
assert.equal(isValidRating(3.5), false);
assert.equal(isValidRating("3"), false);
assert.equal(normalizeCustomerReview("x", { rating: 12 }).rating, 5);
assert.equal(normalizeCustomerReview("x", { rating: -1 }).rating, 1);
assert.equal(normalizeCustomerReview("x", { status: "weird" }).status, "hidden");
assert.equal(
  normalizeCustomerReview("x", { createdAt: { toMillis: () => 0 } }).createdAt,
  "",
);
assert.equal(
  normalizeCustomerReview("x", { createdAt: { seconds: 1_790_000_000 } })
    .createdAt,
  new Date(1_790_000_000_000).toISOString(),
);

// Published filter
const mixed = [
  review("a"),
  review("b", { status: "hidden" }),
  review("c"),
];
assert.deepEqual(
  filterPublishedReviews(mixed).map((r) => r.id),
  ["a", "c"],
);

// Featured cap
const threeFeatured = [
  review("f1", { featured: true }),
  review("f2", { featured: true }),
  review("f3", { featured: true, status: "hidden" }),
  review("n1"),
];
assert.equal(CUSTOMER_REVIEW_FEATURED_CAP, 3);
assert.equal(canFeatureReview(threeFeatured, "n1"), false);
assert.equal(canFeatureReview(threeFeatured, "f1"), true, "already featured");
assert.equal(canFeatureReview(threeFeatured.slice(0, 2), "n1"), true);

// Slider selection
const pool = [
  review("old", { createdAt: "2026-01-01T00:00:00.000Z" }),
  review("new", { createdAt: "2026-09-01T00:00:00.000Z" }),
  review("mid", { createdAt: "2026-05-01T00:00:00.000Z" }),
  review("hidden-new", {
    status: "hidden",
    createdAt: "2026-10-05T00:00:00.000Z",
  }),
];
assert.deepEqual(
  selectSliderReviews(pool).map((r) => r.id),
  ["new", "mid", "old"],
  "no featured: newest published first",
);
assert.deepEqual(
  selectSliderReviews([
    ...pool,
    review("feat-2", { featured: true, displayOrder: 2 }),
    review("feat-1", { featured: true, displayOrder: 1 }),
    review("feat-hidden", { featured: true, status: "hidden", displayOrder: 0 }),
  ]).map((r) => r.id),
  ["feat-1", "feat-2", "new"],
  "featured by displayOrder, then newest fills",
);
assert.deepEqual(
  selectSliderReviews([
    review("f4", { featured: true, displayOrder: 4 }),
    review("f3", { featured: true, displayOrder: 3 }),
    review("f2", { featured: true, displayOrder: 2 }),
    review("f1", { featured: true, displayOrder: 1 }),
  ]).map((r) => r.id),
  ["f1", "f2", "f3"],
);
assert.deepEqual(selectSliderReviews([]), []);

// Seeds
assert.equal(SEED_CUSTOMER_REVIEWS.length, 3);
for (const seed of SEED_CUSTOMER_REVIEWS) {
  assert.equal(seed.status, "published");
  assert.equal(seed.featured, true);
  assert.equal(seed.rating, 5);
}

// Display fallback: seeds only when loaded and empty; never extra fakes.
assert.deepEqual(resolvePublishedReviewsForDisplay([], true), SEED_CUSTOMER_REVIEWS);
assert.deepEqual(resolvePublishedReviewsForDisplay([], false), []);
assert.deepEqual(
  resolvePublishedReviewsForDisplay([review("hidden-only", { status: "hidden" })], true),
  SEED_CUSTOMER_REVIEWS,
);
const realOnly = resolvePublishedReviewsForDisplay([review("real")], true);
assert.deepEqual(realOnly.map((r) => r.id), ["real"]);
assert.equal(realOnly.some((r) => r.id.startsWith("seed-review-")), false);
assert.deepEqual(
  selectSliderReviews(resolvePublishedReviewsForDisplay([], true)).map((r) => r.rating),
  [5, 5, 5],
);

// Form validation and create payload
assert.equal(
  validateCustomerReviewInput({ authorName: " ", body: "x".repeat(20), rating: 5 })
    .ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "short", rating: 5 }).ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "x".repeat(1001), rating: 5 })
    .ok,
  false,
);
assert.equal(
  validateCustomerReviewInput({ authorName: "Ada", body: "x".repeat(20), rating: 0 })
    .ok,
  false,
);
const valid = validateCustomerReviewInput({
  authorName: "  Ada O. ",
  location: "   ",
  body: "  Beautiful agbada, perfect fit.  ",
  rating: 4,
});
assert.ok(valid.ok);
if (valid.ok) {
  assert.deepEqual(valid.value, {
    authorName: "Ada O.",
    body: "Beautiful agbada, perfect fit.",
    rating: 4,
  });
  const payload = buildCustomerReviewCreatePayload(valid.value, null, "ts");
  assert.equal(payload.status, "published");
  assert.equal(payload.featured, false);
  assert.equal(payload.displayOrder, 0);
  assert.equal("location" in payload, false);
  for (const key of Object.keys(payload)) {
    assert.ok(
      (CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes(key),
      `unexpected create key ${key}`,
    );
  }
}

// The client create allowlist must match the rules allowlist exactly.
const rules = readFileSync("firestore.rules", "utf8");
const hasOnly = rules.match(
  /function hasValidCustomerReviewCreate\(data\) \{[\s\S]*?data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/,
);
assert.ok(hasOnly, "customer review create rule must use hasOnly");
const ruleKeys = hasOnly[1]
  .split(",")
  .map((key) => key.trim().replace(/"/g, ""))
  .filter(Boolean)
  .sort();
assert.deepEqual(ruleKeys, [...CUSTOMER_REVIEW_CREATE_KEYS].sort());

// --- Nationality: options, validation, normalising, payload, rules ---------
assert.ok(NATIONALITY_OPTIONS.length > 100, "full Step 8 country list");
assert.deepEqual(
  NATIONALITY_OPTIONS.map((o) => o.code),
  SITE_FEEDBACK_NATIONALITY_OPTIONS.map((o) => o.code),
  "same countries as the site feedback form",
);
assert.deepEqual(
  NATIONALITY_OPTIONS.map((o) => o.label),
  SITE_FEEDBACK_NATIONALITY_OPTIONS.map((o) => o.label),
);
for (const option of NATIONALITY_OPTIONS) {
  assert.match(option.code, /^[A-Z]{2}$/);
  assert.notEqual(option.code, "XX");
  assert.notEqual(option.code, "ZZ");
  assert.notEqual(option.code, "OT");
}
const sortedLabels = [...NATIONALITY_OPTIONS.map((o) => o.label)].sort((a, b) =>
  a.localeCompare(b, "en"),
);
assert.deepEqual(NATIONALITY_OPTIONS.map((o) => o.label), sortedLabels);
assert.equal(isNationalityCode("NG"), true);
assert.equal(isNationalityCode("ng"), false);
assert.equal(isNationalityCode("XX"), false);
assert.equal(nationalityLabel("NG"), "Nigeria");
assert.equal(nationalityLabel("GB"), "United Kingdom");
assert.equal(nationalityLabel(""), "");
assert.equal(nationalityLabel(undefined), "");

const base = { authorName: "Ada", body: "Beautiful agbada, perfect fit.", rating: 5 };
const dual = validateCustomerReviewInput({
  ...base,
  location: " Lagos ",
  nationality: " ng ",
  secondNationality: "gb",
});
assert.ok(dual.ok);
assert.deepEqual(dual.ok && dual.value, {
  authorName: "Ada",
  location: "Lagos",
  nationality: "NG",
  secondNationality: "GB",
  body: "Beautiful agbada, perfect fit.",
  rating: 5,
});
const single = validateCustomerReviewInput({ ...base, nationality: "NG", secondNationality: "" });
assert.ok(single.ok);
assert.deepEqual(single.ok && single.value, { ...base, nationality: "NG" });
const preferNot = validateCustomerReviewInput({ ...base, nationality: "", secondNationality: "" });
assert.ok(preferNot.ok);
assert.deepEqual(preferNot.ok && preferNot.value, base, "Prefer not to say stores nothing");
const secondOnly = validateCustomerReviewInput({ ...base, secondNationality: "GB" });
assert.equal(secondOnly.ok, false);
assert.match((secondOnly as { error: string }).error, /first nationality/);
const same = validateCustomerReviewInput({ ...base, nationality: "NG", secondNationality: "ng" });
assert.equal(same.ok, false);
assert.match((same as { error: string }).error, /different/);
assert.equal(validateCustomerReviewInput({ ...base, nationality: "XX" }).ok, false);
assert.equal(validateCustomerReviewInput({ ...base, nationality: "Nigeria" }).ok, false);
assert.equal(
  validateCustomerReviewInput({ ...base, nationality: "NG", secondNationality: "QQ" }).ok,
  false,
);

assert.ok(dual.ok);
if (dual.ok) {
  const dualPayload = buildCustomerReviewCreatePayload(dual.value, "uid-1", "ts");
  assert.equal(dualPayload.nationality, "NG");
  assert.equal(dualPayload.secondNationality, "GB");
  for (const key of Object.keys(dualPayload)) {
    assert.ok((CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes(key), key);
  }
  const orphan = buildCustomerReviewCreatePayload(
    { ...dual.value, nationality: undefined },
    null,
    "ts",
  );
  assert.equal("nationality" in orphan, false);
  assert.equal("secondNationality" in orphan, false, "never a second without a first");
}
assert.ok(single.ok);
if (single.ok) {
  const singlePayload = buildCustomerReviewCreatePayload(single.value, null, "ts");
  assert.equal(singlePayload.nationality, "NG");
  assert.equal("secondNationality" in singlePayload, false);
}

// Existing reviews (no nationality fields) normalise exactly as before.
const legacy = normalizeCustomerReview("legacy", {
  authorName: "Old",
  location: "Eindhoven",
  body: "Lovely.",
  rating: 5,
  status: "published",
});
assert.equal("nationality" in legacy, false);
assert.equal("secondNationality" in legacy, false);
assert.deepEqual(
  normalizeCustomerReview("n", { nationality: "ng", secondNationality: "gb" }),
  { ...normalizeCustomerReview("n", {}), nationality: "NG", secondNationality: "GB" },
);
assert.deepEqual(normalizeReviewNationalities({ nationality: "Nigeria" }), {});
assert.deepEqual(normalizeReviewNationalities({ nationality: 12 }), {});
assert.deepEqual(normalizeReviewNationalities({ secondNationality: "GB" }), {});
assert.deepEqual(
  normalizeReviewNationalities({ nationality: "NG", secondNationality: "NG" }),
  { nationality: "NG" },
);
assert.deepEqual(
  normalizeReviewNationalities({ nationality: "NG", secondNationality: null }),
  { nationality: "NG" },
);

// Display text
assert.equal(
  formatReviewOrigin({ location: "Lagos", nationality: "NG", secondNationality: "GB" }),
  "Lagos · Nigeria / United Kingdom",
);
assert.equal(formatReviewOrigin({ location: "Lagos", nationality: "NG" }), "Lagos · Nigeria");
assert.equal(formatReviewOrigin({ nationality: "NG", secondNationality: "GB" }), "Nigeria / United Kingdom");
assert.equal(formatReviewOrigin({ location: "Eindhoven" }), "Eindhoven");
assert.equal(formatReviewOrigin({}), "");
assert.equal(formatReviewNationalities({ secondNationality: "GB" }), "");

// Rules: both keys whitelisted and validated.
const reviewCreateRule = rules.match(
  /function hasValidCustomerReviewCreate\(data\) \{[\s\S]*?\n    \}/,
)?.[0];
assert.ok(reviewCreateRule);
assert.match(
  reviewCreateRule,
  /!\("nationality" in data\)\s*\|\| \(data\.nationality is string && data\.nationality\.matches\("\^\[A-Z\]\{2\}\$"\)\)/,
);
assert.match(
  reviewCreateRule,
  /!\("secondNationality" in data\)\s*\|\| \("nationality" in data\s*&& data\.secondNationality is string\s*&& data\.secondNationality\.matches\("\^\[A-Z\]\{2\}\$"\)\s*&& data\.secondNationality != data\.nationality\)/,
);
assert.doesNotMatch(
  reviewCreateRule.match(/hasAll\(\[[^\]]*\]\)/)?.[0] ?? "",
  /nationality/,
  "nationality stays optional",
);

// --- Public card ------------------------------------------------------------
function renderCard(overrides: Partial<CustomerReview>) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(CustomerReviewCard, { review: review("card", overrides) }));
  });
  const origin = renderer.root.findAll(
    (node) => node.props["data-customer-review-origin"] === "true",
  );
  return origin.length ? textOf(origin[0]) : null;
}
function textOf(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map((child) => textOf(child as ReactTestInstance | string)).join("");
}
assert.equal(
  renderCard({ location: "Lagos", nationality: "NG", secondNationality: "GB" }),
  "Lagos · Nigeria / United Kingdom",
);
assert.equal(renderCard({ nationality: "NG" }), "Nigeria");
assert.equal(renderCard({ location: "Eindhoven" }), "Eindhoven", "legacy card unchanged");
assert.equal(renderCard({}), null);
{
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(CustomerReviewCard, {
        review: review("flags", { nationality: "NG", secondNationality: "GB" }),
      }),
    );
  });
  assert.equal(renderer.root.findAllByType("img").length, 0, "text only, no flags");
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /[\u{1F1E6}-\u{1F1FF}]/u);
}

console.log("PASS: customer reviews helpers");

// --- Form and admin column (they import Firebase via the app store) --------
if (import.meta.env?.MODE !== "production") {
  console.log(
    "SKIP: form and admin column tests need Vite env; run npm run test:customer-reviews-ui",
  );
} else {
  await runReviewUiTests();
}

async function runReviewUiTests() {
  // The form listens for Escape on window and the app store reads the guest
  // session from localStorage; Node has neither.
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  };
  if (typeof globalThis.localStorage === "undefined") {
    Object.assign(globalThis, { localStorage: storage, sessionStorage: storage });
  }
  if (typeof globalThis.window === "undefined") {
    Object.assign(globalThis, {
      window: {
        addEventListener() {},
        removeEventListener() {},
        confirm: () => false,
        location: { pathname: "/", search: "", hash: "", href: "http://localhost/" },
        history: { replaceState() {}, pushState() {} },
        scrollY: 0,
        scrollTo() {},
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
        localStorage: storage,
        sessionStorage: storage,
      },
    });
  }
  const { default: CustomerReviewForm } = await import(
    "./src/components/CustomerReviewForm"
  );
  const { default: AdminReviewsPanel } = await import(
    "./src/components/AdminReviewsPanel"
  );
  const { StorageService } = await import("./src/services/storageService");
  const { useAppStore } = await import("./src/store/useAppStore");

  const calls: unknown[] = [];
  const original = StorageService.createCustomerReview;
  StorageService.createCustomerReview = async (value) => {
    calls.push(value);
    return "review-id";
  };

  const byData = (root: ReactTestInstance, key: string) =>
    root.findAll((node) => typeof node.type === "string" && node.props[key] === "true");

  async function renderForm() {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(CustomerReviewForm, { open: true, onClose: () => {} }), {
        createNodeMock: () => ({ focus() {} }),
      });
    });
    const root = renderer.root;
    const fill = async (id: string, value: string) => {
      const node = root.find((n) => n.props.id === id && typeof n.type === "string");
      await act(async () => node.props.onChange({ target: { value } }));
    };
    const fillBasics = async () => {
      await fill("review-author-name", "Ada Obi");
      await fill("review-body", "Beautiful agbada, perfect fit for the wedding.");
      const star = root.find((n) => n.props["aria-label"] === "5 stars");
      await act(async () => star.props.onClick());
    };
    const submit = async () => {
      const form = root.findByType("form");
      await act(async () => form.props.onSubmit({ preventDefault() {} }));
    };
    return { renderer, root, fill, fillBasics, submit };
  }

  // Default: "Prefer not to say", no second select, no add link.
  {
    const { root, fillBasics, submit } = await renderForm();
    const label = root.find((n) => n.type === "label" && n.props.htmlFor === "review-nationality");
    assert.equal(textOf(label).replace(/\s+/g, " ").trim(), "Nationality (optional)");
    const [select] = byData(root, "data-customer-review-nationality");
    assert.equal(select.props.value, "");
    const options = select.findAllByType("option");
    assert.equal(textOf(options[0]), "Prefer not to say");
    assert.equal(options.length, NATIONALITY_OPTIONS.length + 1);
    assert.equal(byData(root, "data-customer-review-second-nationality").length, 0);
    assert.equal(byData(root, "data-customer-review-add-second-nationality").length, 0);
    await fillBasics();
    await submit();
    assert.equal(calls.length, 1);
    assert.equal("nationality" in (calls[0] as object), false);
    assert.equal("secondNationality" in (calls[0] as object), false);
  }

  // Dual nationality: add link reveals second select; submit carries both.
  {
    const { root, fill, fillBasics, submit } = await renderForm();
    await fillBasics();
    await fill("review-nationality", "NG");
    const [addLink] = byData(root, "data-customer-review-add-second-nationality");
    assert.equal(textOf(addLink), "+ Add second nationality");
    await act(async () => addLink.props.onClick());
    const [second] = byData(root, "data-customer-review-second-nationality");
    assert.ok(second);
    assert.equal(
      second.findAllByType("option").some((o) => o.props.value === "NG"),
      false,
      "first nationality not offered again",
    );
    await fill("review-second-nationality", "GB");
    await submit();
    assert.equal(calls.length, 2);
    assert.equal((calls[1] as { nationality: string }).nationality, "NG");
    assert.equal((calls[1] as { secondNationality: string }).secondNationality, "GB");
  }

  // Remove hides and clears the second nationality.
  {
    const { root, fill, fillBasics, submit } = await renderForm();
    await fillBasics();
    await fill("review-nationality", "NG");
    await act(async () =>
      byData(root, "data-customer-review-add-second-nationality")[0].props.onClick(),
    );
    await fill("review-second-nationality", "GB");
    const [remove] = byData(root, "data-customer-review-remove-second-nationality");
    await act(async () => remove.props.onClick());
    assert.equal(byData(root, "data-customer-review-second-nationality").length, 0);
    await submit();
    assert.equal(calls.length, 3);
    assert.equal((calls[2] as { nationality: string }).nationality, "NG");
    assert.equal("secondNationality" in (calls[2] as object), false);
  }

  // Clearing the first while a second is chosen is blocked, not silently dropped.
  {
    const { root, fill, fillBasics, submit } = await renderForm();
    await fillBasics();
    await fill("review-nationality", "NG");
    await act(async () =>
      byData(root, "data-customer-review-add-second-nationality")[0].props.onClick(),
    );
    await fill("review-second-nationality", "GB");
    await fill("review-nationality", "");
    await submit();
    assert.equal(calls.length, 3, "not submitted");
    const alert = root.find((n) => n.props.role === "alert");
    assert.match(textOf(alert), /first nationality/);
  }

  StorageService.createCustomerReview = original;

  // Admin table: Nationality column.
  {
    useAppStore.setState({
      adminCustomerReviews: [
        review("dual", {
          authorName: "Dual",
          nationality: "NG",
          secondNationality: "GB",
          createdAt: "2026-10-03T00:00:00.000Z",
        }),
        review("single", {
          authorName: "Single",
          nationality: "NL",
          createdAt: "2026-10-02T00:00:00.000Z",
        }),
        review("legacy", { authorName: "Legacy", createdAt: "2026-10-01T00:00:00.000Z" }),
      ],
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(AdminReviewsPanel));
    });
    const headers = renderer.root.findAllByType("th").map((th) => textOf(th));
    assert.deepEqual(headers, [
      "Name",
      "Nationality",
      "Rating",
      "Status",
      "Featured",
      "Order",
      "Created",
      "Actions",
    ]);
    const cells = renderer.root.findAll(
      (n) => n.type === "td" && n.props["data-admin-review-nationality"] !== undefined,
    );
    assert.deepEqual(
      cells.map((cell) => [cell.props["data-admin-review-nationality"], textOf(cell)]),
      [
        ["NG/GB", "Nigeria / United Kingdom"],
        ["NL", "Netherlands"],
        ["", "—"],
      ],
    );
    for (const row of renderer.root.findAllByType("tr").slice(1)) {
      assert.equal(row.findAllByType("td").length, headers.length);
    }
  }

  console.log("PASS: customer review form and admin nationality column");
}
