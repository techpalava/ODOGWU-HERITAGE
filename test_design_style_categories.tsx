import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { DesignStyleCategoryService } from "./src/services/designStyleCategoryService";
import { useAppStore } from "./src/store/useAppStore";
import type {
  Customer,
  DesignStyleCategory,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import {
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
  type AuthoritativeDesignStyleRecordV1,
} from "./src/utils/designStyleAuthority";
import {
  countStylesUsingCategory,
  normalizeDesignStyleCategoryName,
  parseDesignStyleCategoryRecord,
  planDesignStyleCategoryMigration,
  slugifyDesignStyleCategoryId,
  sortDesignStyleCategories,
  validateDesignStyleCategoryName,
} from "./src/utils/designStyleCategories";
import {
  publishDesignStyleWithDependencies,
  type DesignStylePublicationDependencies,
} from "./src/utils/designStylePublication";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

const require = createRequire(import.meta.url);
const reactDomRuntime = require("react-dom") as {
  createPortal: (children: unknown, container: unknown) => unknown;
};
reactDomRuntime.createPortal = (children) => children;
const { DormantFutureDesignStyleStep } = await import(
  "./src/components/DormantFutureDesignStyleStep"
);

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

// ---------------------------------------------------------------------------
// 1. Shared "Long Shirt" Category Validator & Parser
// ---------------------------------------------------------------------------
assert.equal(
  normalizeDesignStyleCategoryName("  Kaftan   Classics "),
  "Long Shirt Classics",
);
assert.equal(
  normalizeDesignStyleCategoryName("Royal Kaftans"),
  "Royal Long Shirts",
);
assert.equal(
  slugifyDesignStyleCategoryId("Kaftan & Senator"),
  "long-shirt-and-senator",
);
const validWithNormalization = validateDesignStyleCategoryName("Kaftan Royal");
assert.equal(validWithNormalization.valid, true);
if (validWithNormalization.valid) {
  assert.equal(validWithNormalization.normalizedName, "Long Shirt Royal");
  assert.equal(validWithNormalization.replacedKaftan, true);
}
assert.equal(validateDesignStyleCategoryName("   ").valid, false);
assert.equal(validateDesignStyleCategoryName("x".repeat(81)).valid, false);

// Strict Firestore parser rejects legacy wording stored raw
assert.equal(
  parseDesignStyleCategoryRecord("kaftan-classic", {
    id: "kaftan-classic",
    name: "Kaftan Classic",
    displayOrder: 0,
    enabled: true,
  }),
  null,
);
assert.deepEqual(
  parseDesignStyleCategoryRecord("long-shirt-classic", {
    id: "long-shirt-classic",
    name: "Long Shirt Classic",
    displayOrder: 0,
    enabled: true,
    description: "Tailored Long Shirt silhouettes",
  }),
  {
    id: "long-shirt-classic",
    name: "Long Shirt Classic",
    displayOrder: 0,
    enabled: true,
    description: "Tailored Long Shirt silhouettes",
  },
);

// ---------------------------------------------------------------------------
// 2. Design Style Authority: categoryIds allow-list, max-3, mirror, revisions
// ---------------------------------------------------------------------------
const registry: DesignStyleCategory[] = [
  { id: "senator", name: "Senator", displayOrder: 0, enabled: true },
  {
    id: "long-shirt-classics",
    name: "Long Shirt Classics",
    displayOrder: 1,
    enabled: true,
  },
  { id: "ceremonial", name: "Ceremonial", displayOrder: 2, enabled: true },
  {
    id: "retired-season",
    name: "Retired Season",
    displayOrder: 3,
    enabled: false,
  },
];

const baseStyle = (overrides: Partial<StyleCategory> = {}): StyleCategory => ({
  id: "ODGH-200",
  name: "Imperial Heritage Shirt",
  description: "Published test style for categories.",
  gender: "male",
  outfitType: "Senator Set",
  garmentComposition: "Shirt Only",
  fabricCategory: "Any",
  options: [],
  designCategories: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  customDetailConfig: {
    representedGenders: ["male"],
    featuresMaleAndFemale: false,
    supportedGarmentGroups: ["shirt", "neck"],
    requiredSelectionGroups: ["shirt_construction"],
    enabled: true,
  },
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const r1 = prepareAuthoritativeDesignStyleRecord({
  style: baseStyle({
    categoryIds: ["senator", "long-shirt-classics"],
  }),
  lifecycle: "published",
  displayOrder: 0,
  referenceComposition: { status: "known", garmentTypes: ["shirt"] },
  currentRecord: null,
  categories: registry,
});
assert.equal(parseAuthoritativeDesignStyleRecord(r1.id, r1).status, "valid");
assert.deepEqual(r1.presentation.categoryIds, [
  "senator",
  "long-shirt-classics",
]);
assert.deepEqual(r1.presentation.designCategories, [
  "Senator",
  "Long Shirt Classics",
]);

const projected1 = projectDesignStyleRecordForAdmin(r1);
assert.deepEqual(projected1.categoryIds, ["senator", "long-shirt-classics"]);
assert.deepEqual(projected1.designCategories, [
  "Senator",
  "Long Shirt Classics",
]);

// Updating categories bumps ONLY publicRevision, never eligibilityRevision
const r2 = prepareAuthoritativeDesignStyleRecord({
  style: {
    ...projected1,
    categoryIds: ["ceremonial"],
  },
  lifecycle: "published",
  displayOrder: 0,
  referenceComposition: { status: "known", garmentTypes: ["shirt"] },
  currentRecord: r1,
  categories: registry,
});
assert.equal(r2.publicRevision, r1.publicRevision + 1);
assert.equal(r2.eligibilityRevision, r1.eligibilityRevision);
assert.equal(r2.eligibilityFingerprint, r1.eligibilityFingerprint);
assert.deepEqual(r2.presentation.categoryIds, ["ceremonial"]);
assert.deepEqual(r2.presentation.designCategories, ["Ceremonial"]);

// Clearing categories clears both categoryIds and mirrored designCategories
const r3 = prepareAuthoritativeDesignStyleRecord({
  style: {
    ...projectDesignStyleRecordForAdmin(r2),
    categoryIds: [],
  },
  lifecycle: "published",
  displayOrder: 0,
  referenceComposition: { status: "known", garmentTypes: ["shirt"] },
  currentRecord: r2,
  categories: registry,
});
assert.equal("categoryIds" in r3.presentation, false);
assert.deepEqual(r3.presentation.designCategories, []);
assert.equal(r3.eligibilityRevision, r2.eligibilityRevision);

// Max 3 categoryIds enforced + invalid slugs rejected
assert.throws(
  () =>
    prepareAuthoritativeDesignStyleRecord({
      style: baseStyle({
        categoryIds: [
          "senator",
          "long-shirt-classics",
          "ceremonial",
          "retired-season",
        ],
      }),
      lifecycle: "published",
      displayOrder: 0,
      referenceComposition: { status: "known", garmentTypes: ["shirt"] },
      currentRecord: null,
      categories: registry,
    }),
  /INVALID_STYLE_CATEGORY_IDS/,
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(r1.id, {
    ...r1,
    presentation: {
      ...r1.presentation,
      categoryIds: ["senator", "long-shirt-classics", "ceremonial", "extra"],
    },
  }).status,
  "invalid",
);
assert.equal(
  parseAuthoritativeDesignStyleRecord(r1.id, {
    ...r1,
    presentation: {
      ...r1.presentation,
      categoryIds: ["Invalid Slug!"],
    },
  }).status,
  "invalid",
);

// Legacy record without categoryIds remains valid
const legacyNoCategoryIds = prepareAuthoritativeDesignStyleRecord({
  style: baseStyle({ designCategories: ["Legacy Tag"] }),
  lifecycle: "published",
  displayOrder: 0,
  referenceComposition: { status: "known", garmentTypes: ["shirt"] },
  currentRecord: null,
});
assert.equal("categoryIds" in legacyNoCategoryIds.presentation, false);
assert.deepEqual(legacyNoCategoryIds.presentation.designCategories, [
  "Legacy Tag",
]);
assert.equal(
  parseAuthoritativeDesignStyleRecord(
    legacyNoCategoryIds.id,
    legacyNoCategoryIds,
  ).status,
  "valid",
);

// ---------------------------------------------------------------------------
// 3. Dry-Run Migration Planner
// ---------------------------------------------------------------------------
const migrationPlan = planDesignStyleCategoryMigration({
  categories: registry,
  styles: [
    {
      id: "ODGH-1",
      name: "Clean Legacy",
      designCategories: ["Kaftan Classics", "Senator"],
    },
    {
      id: "ODGH-2",
      name: "Unmatched Partial",
      designCategories: ["Senator", "Bespoke Unlisted"],
    },
    {
      id: "ODGH-3",
      name: "Too Many",
      designCategories: [
        "Senator",
        "Long Shirt Classics",
        "Ceremonial",
        "Retired Season",
      ],
    },
    {
      id: "ODGH-4",
      name: "Already Migrated",
      categoryIds: ["senator"],
      designCategories: ["Senator"],
    },
  ],
});
assert.equal(migrationPlan.updates.length, 1);
assert.deepEqual(migrationPlan.updates[0], {
  styleId: "ODGH-1",
  styleName: "Clean Legacy",
  previousCategoryIds: [],
  nextCategoryIds: ["long-shirt-classics", "senator"],
  previousDesignCategories: ["Kaftan Classics", "Senator"],
  nextDesignCategories: ["Long Shirt Classics", "Senator"],
});
assert.equal(migrationPlan.alreadyAlignedCount, 1);
assert.equal(migrationPlan.skippedStyles.length, 2);
assert.deepEqual(migrationPlan.unmatchedStrings, [
  {
    rawString: "Bespoke Unlisted",
    normalizedString: "Bespoke Unlisted",
    styleIds: ["ODGH-2"],
  },
]);

// ---------------------------------------------------------------------------
// 4. Admin CRUD, Archive Guard, Multi-Select Picker & List Filter
// ---------------------------------------------------------------------------
let adminCategoriesStore: DesignStyleCategory[] = [
  { id: "senator", name: "Senator", displayOrder: 0, enabled: true },
  { id: "ceremonial", name: "Ceremonial", displayOrder: 1, enabled: true },
  {
    id: "archived-legacy",
    name: "Archived Legacy",
    displayOrder: 2,
    enabled: false,
  },
  { id: "unused-tag", name: "Unused Tag", displayOrder: 3, enabled: true },
];
let adminRecordsStore: AuthoritativeDesignStyleRecordV1[] = [
  prepareAuthoritativeDesignStyleRecord({
    style: baseStyle({
      id: "ODGH-301",
      name: "Senator Archived Tag Style",
      categoryIds: ["senator", "archived-legacy"],
    }),
    lifecycle: "published",
    displayOrder: 0,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    currentRecord: null,
    categories: adminCategoriesStore,
  }),
  prepareAuthoritativeDesignStyleRecord({
    style: baseStyle({
      id: "ODGH-302",
      name: "Uncategorized Clean Style",
      categoryIds: [],
    }),
    lifecycle: "published",
    displayOrder: 1,
    referenceComposition: { status: "known", garmentTypes: ["shirt"] },
    currentRecord: null,
    categories: adminCategoriesStore,
  }),
];

const styleSubscribers = new Set<(snapshot: any) => void>();
const categorySubscribers = new Set<
  (categories: readonly DesignStyleCategory[]) => void
>();

const emitStyles = () => {
  const snapshot = {
    styles: adminRecordsStore.map(projectDesignStyleRecordForAdmin),
    diagnostics: [],
  };
  styleSubscribers.forEach((cb) => cb(snapshot));
};
const emitCategories = () => {
  const sorted = sortDesignStyleCategories(adminCategoriesStore);
  categorySubscribers.forEach((cb) => cb(sorted));
};

const origStyleSub = DesignStyleAuthorityService.subscribeToAdminRecords;
const origStylePub = DesignStyleAuthorityService.publish;
const origCatSub = DesignStyleCategoryService.subscribe;
const origCatSave = DesignStyleCategoryService.saveCategory;
const origCatReorder = DesignStyleCategoryService.reorderCategories;
const origCatEnable = DesignStyleCategoryService.setCategoryEnabled;
const origCatDelete = DesignStyleCategoryService.deleteUnusedCategory;
const origStoreState = useAppStore.getState();
let adminRenderer: ReturnType<typeof create> | undefined;

try {
  DesignStyleAuthorityService.subscribeToAdminRecords = ((onSnap) => {
    styleSubscribers.add(onSnap);
    emitStyles();
    return () => styleSubscribers.delete(onSnap);
  }) as typeof DesignStyleAuthorityService.subscribeToAdminRecords;

  DesignStyleAuthorityService.publish = (async (input) => {
    const deps: DesignStylePublicationDependencies = {
      readCurrent: async (id) => {
        const rec = adminRecordsStore.find((r) => r.id === id) || null;
        return rec
          ? {
              record: rec,
              legacyMigrationAllowed: false,
              currentImage: rec.presentation.image,
            }
          : null;
      },
      uploadReplacementImage: async () => "",
      commitAuthoritativeRecord: async ({ record }) => {
        adminRecordsStore = [
          ...adminRecordsStore.filter((r) => r.id !== record.id),
          record,
        ];
        emitStyles();
      },
      canDeleteSupersededImage: async () => false,
      deleteImage: async () => undefined,
    };
    return publishDesignStyleWithDependencies(input, deps);
  }) as typeof DesignStyleAuthorityService.publish;

  DesignStyleCategoryService.subscribe = ((onCats) => {
    categorySubscribers.add(onCats);
    emitCategories();
    return () => categorySubscribers.delete(onCats);
  }) as typeof DesignStyleCategoryService.subscribe;

  DesignStyleCategoryService.saveCategory = (async (cat) => {
    const validation = validateDesignStyleCategoryName(cat.name);
    if (!validation.valid) throw new Error(validation.reason);
    const saved: DesignStyleCategory = {
      id: cat.id,
      name: validation.normalizedName,
      displayOrder: cat.displayOrder,
      enabled: cat.enabled,
      ...(cat.description?.trim() ? { description: cat.description.trim() } : {}),
    };
    adminCategoriesStore = [
      ...adminCategoriesStore.filter((c) => c.id !== saved.id),
      saved,
    ];
    emitCategories();
    return saved;
  }) as typeof DesignStyleCategoryService.saveCategory;

  DesignStyleCategoryService.reorderCategories = (async (ordered) => {
    adminCategoriesStore = ordered.map((c, idx) => ({
      ...c,
      displayOrder: idx,
    }));
    emitCategories();
  }) as typeof DesignStyleCategoryService.reorderCategories;

  DesignStyleCategoryService.setCategoryEnabled = (async (cat, enabled) => {
    return DesignStyleCategoryService.saveCategory({ ...cat, enabled });
  }) as typeof DesignStyleCategoryService.setCategoryEnabled;

  DesignStyleCategoryService.deleteUnusedCategory = (async (id, styles) => {
    if (countStylesUsingCategory(id, styles) > 0) {
      throw new Error("CATEGORY_IN_USE");
    }
    adminCategoriesStore = adminCategoriesStore.filter((c) => c.id !== id);
    emitCategories();
  }) as typeof DesignStyleCategoryService.deleteUnusedCategory;

  useAppStore.setState({
    currentUser: {
      name: "Admin Tester",
      email: "techpalavabox@gmail.com",
      phone: "+234000000000",
      role: "Administrator",
    } satisfies Customer,
    referenceData: [],
    customDetailCatalog: [],
  });

  const noop = () => undefined;
  await act(async () => {
    adminRenderer = create(
      createElement(DatabaseView, {
        customers: [],
        setCustomers: noop,
        styles: [],
        setStyles: noop,
        fabrics: [],
        setFabrics: noop,
        customGroups: [],
        setCustomGroups: noop,
        orders: [],
        setOrders: noop,
        batches: [],
        setBatches: noop,
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
        setBusinessSettings: noop,
        initialTab: "styles",
      }),
    );
  });

  // Style list category filter check
  const listCategoryFilter = adminRenderer!.root.findByProps({
    "aria-label": "Filter styles by category",
  });
  await act(async () => {
    listCategoryFilter.props.onChange({ target: { value: "senator" } });
  });
  assert.equal(
    adminRenderer!.root
      .findAllByType("h4")
      .some((h) => textContent(h).includes("Senator Archived Tag Style")),
    true,
  );
  assert.equal(
    adminRenderer!.root
      .findAllByType("h4")
      .some((h) => textContent(h).includes("Uncategorized Clean Style")),
    false,
  );
  await act(async () => {
    listCategoryFilter.props.onChange({ target: { value: "uncategorized" } });
  });
  assert.equal(
    adminRenderer!.root
      .findAllByType("h4")
      .some((h) => textContent(h).includes("Uncategorized Clean Style")),
    true,
  );
  await act(async () => {
    listCategoryFilter.props.onChange({ target: { value: "all" } });
  });

  // Switch to Categories Manager sub-tab
  const categoriesTab = adminRenderer!.root
    .findAllByType("div")
    .find((node) => textContent(node).trim() === "Categories");
  assert.ok(categoriesTab, "Categories sub-tab must exist.");
  await act(async () => {
    categoriesTab.props.onClick();
  });

  // Archive Guard: referenced category ('senator') cannot have Delete button
  const senatorRow = adminRenderer!.root.findByProps({
    "data-testid": "admin-category-row-senator",
  });
  assert.ok(textContent(senatorRow).includes("Used by 1 style"));
  assert.ok(textContent(senatorRow).includes("In use — archive instead"));
  assert.equal(
    adminRenderer!.root.findAllByProps({ "aria-label": "Delete Senator" })
      .length,
    0,
  );
  await assert.rejects(
    DesignStyleCategoryService.deleteUnusedCategory(
      "senator",
      adminRecordsStore.map(projectDesignStyleRecordForAdmin),
    ),
    /CATEGORY_IN_USE/,
  );

  // Unused category CAN be deleted
  const deleteUnusedBtn = adminRenderer!.root.findByProps({
    "aria-label": "Delete Unused Tag",
  });
  await act(async () => {
    await deleteUnusedBtn.props.onClick();
  });
  assert.equal(
    adminCategoriesStore.some((c) => c.id === "unused-tag"),
    false,
  );

  // Add new category with legacy wording -> normalized to "Long Shirt..."
  const newCatInput = adminRenderer!.root.findByProps({
    "aria-label": "New category name",
  });
  const addCatForm = adminRenderer!.root
    .findAllByType("form")
    .find(
      (f) =>
        f.findAllByProps({ "aria-label": "New category name" }).length > 0,
    )!;
  await act(async () => {
    newCatInput.props.onChange({ target: { value: "Kaftan Classics" } });
  });
  await act(async () => {
    await addCatForm.props.onSubmit({ preventDefault: () => undefined });
  });
  const createdLongShirtCat = adminCategoriesStore.find(
    (c) => c.id === "long-shirt-classics",
  );
  assert.ok(createdLongShirtCat);
  assert.equal(createdLongShirtCat.name, "Long Shirt Classics");

  // Rename category
  await act(async () => {
    adminRenderer!.root
      .findByProps({ "aria-label": "Rename Ceremonial" })
      .props.onClick();
  });
  await act(async () => {
    adminRenderer!.root
      .findByProps({ "aria-label": "Edit category name" })
      .props.onChange({ target: { value: "Royal Ceremonial" } });
  });
  const saveCatBtn = adminRenderer!.root
    .findAllByType("button")
    .find((b) => textContent(b).trim() === "Save Category")!;
  await act(async () => {
    await saveCatBtn.props.onClick();
  });
  assert.equal(
    adminCategoriesStore.find((c) => c.id === "ceremonial")?.name,
    "Royal Ceremonial",
  );

  // Reorder category
  const initialCeremonialOrder =
    adminCategoriesStore.find((c) => c.id === "ceremonial")!.displayOrder;
  await act(async () => {
    await adminRenderer!.root
      .findByProps({ "aria-label": "Move Royal Ceremonial up" })
      .props.onClick();
  });
  assert.ok(
    adminCategoriesStore.find((c) => c.id === "ceremonial")!.displayOrder <
      initialCeremonialOrder,
  );

  // Add a 4th active category so max-3 picker limit can be verified
  await DesignStyleCategoryService.saveCategory({
    id: "agbada-grand",
    name: "Agbada Grand",
    displayOrder: 10,
    enabled: true,
  });
  await act(async () => emitCategories());

  // Switch back to Style Configuration and test chip picker (archived visible, max-3 enforced)
  const stylesSubTab = adminRenderer!.root
    .findAllByType("div")
    .find((node) => textContent(node).trim() === "Style Configuration")!;
  await act(async () => {
    stylesSubTab.props.onClick();
  });

  const editBtns = adminRenderer!.root
    .findAllByType("button")
    .filter((b) => textContent(b).trim() === "Edit Garment Option");
  await act(async () => {
    editBtns[0]!.props.onClick();
  });

  // Archived assigned category remains visible & removable
  const archivedChip = adminRenderer!.root.findByProps({
    "aria-label": "Category Archived Legacy (Archived)",
  });
  assert.equal(archivedChip.props["aria-pressed"], true);

  // Add 3rd category -> max 3 reached -> 4th unselected chip disabled
  await act(async () => {
    adminRenderer!.root
      .findByProps({ "aria-label": "Category Royal Ceremonial" })
      .props.onClick();
  });
  assert.equal(
    adminRenderer!.root.findByProps({
      "aria-label": "Category Long Shirt Classics",
    }).props.disabled,
    true,
  );

  // Remove archived chip -> unselected chip re-enabled -> select Long Shirt Classics
  await act(async () => {
    archivedChip.props.onClick();
  });
  const longShirtChip = adminRenderer!.root.findByProps({
    "aria-label": "Category Long Shirt Classics",
  });
  assert.equal(longShirtChip.props.disabled, false);
  await act(async () => {
    longShirtChip.props.onClick();
  });

  const styleForm = adminRenderer!.root
    .findAllByType("form")
    .find(
      (f) =>
        f.findAllByProps({ "aria-label": "Collection Audience" }).length > 0,
    )!;
  const beforeEligRev = adminRecordsStore.find((r) => r.id === "ODGH-301")!
    .eligibilityRevision;
  await act(async () => {
    await styleForm.props.onSubmit({ preventDefault: () => undefined });
  });
  const updated301 = adminRecordsStore.find((r) => r.id === "ODGH-301")!;
  assert.deepEqual(updated301.presentation.categoryIds, [
    "senator",
    "ceremonial",
    "long-shirt-classics",
  ]);
  assert.deepEqual(updated301.presentation.designCategories, [
    "Senator",
    "Royal Ceremonial",
    "Long Shirt Classics",
  ]);
  assert.equal(updated301.eligibilityRevision, beforeEligRev);
} finally {
  await act(async () => adminRenderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = origStyleSub;
  DesignStyleAuthorityService.publish = origStylePub;
  DesignStyleCategoryService.subscribe = origCatSub;
  DesignStyleCategoryService.saveCategory = origCatSave;
  DesignStyleCategoryService.reorderCategories = origCatReorder;
  DesignStyleCategoryService.setCategoryEnabled = origCatEnable;
  DesignStyleCategoryService.deleteUnusedCategory = origCatDelete;
  useAppStore.setState(origStoreState);
}

// ---------------------------------------------------------------------------
// 5. Customer UX: Design Style Step Category Filter Chips + Audience Filter
// ---------------------------------------------------------------------------
const customerSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "unisex",
  audienceSelection: { schemaVersion: 1, demographics: ["male", "female"] },
  constructionByGarment: {},
};

const stepStyles: StyleCategory[] = [
  baseStyle({
    id: "step-style-1",
    name: "Men Senator Classic",
    gender: "male",
    categoryIds: ["senator"],
  }),
  baseStyle({
    id: "step-style-2",
    name: "Women Ceremonial Gown",
    gender: "female",
    categoryIds: ["ceremonial"],
  }),
  baseStyle({
    id: "step-style-3",
    name: "Men Ceremonial Royal",
    gender: "male",
    categoryIds: ["ceremonial", "senator"],
  }),
];

const stepCategories: DesignStyleCategory[] = [
  { id: "ceremonial", name: "Ceremonial", displayOrder: 0, enabled: true },
  { id: "senator", name: "Senator", displayOrder: 1, enabled: true },
  {
    id: "empty-cat",
    name: "Empty Category",
    displayOrder: 2,
    enabled: true,
  },
  {
    id: "disabled-cat",
    name: "Disabled Category",
    displayOrder: 3,
    enabled: false,
  },
];

const stepModel = createDesignStyleStepTestModel({
  styles: stepStyles,
  garmentTypeSelection: customerSelection,
});

let customerRenderer!: ReturnType<typeof create>;
await act(async () => {
  customerRenderer = create(
    createElement(DormantFutureDesignStyleStep, {
      ...createDesignStyleStepRenderProps(stepModel),
      designStyleCategories: stepCategories,
    }),
  );
});

const cardNames = () =>
  customerRenderer.root
    .findAll((n) => n.props?.["data-style-card"] === "true")
    .map((n) => String(n.props["data-style-name"]));

// Enabled + non-empty categories ordered by displayOrder, with All first
const catBar = customerRenderer.root.findByProps({
  "data-testid": "step3-category-filter",
});
const catChipLabels = catBar
  .findAllByType("button")
  .map((btn) => textContent(btn).trim());
assert.deepEqual(catChipLabels, ["All", "Ceremonial", "Senator"]);

// Disabled and empty categories must not render
assert.equal(
  customerRenderer.root.findAllByProps({
    "data-testid": "step3-category-chip-empty-cat",
  }).length,
  0,
);
assert.equal(
  customerRenderer.root.findAllByProps({
    "data-testid": "step3-category-chip-disabled-cat",
  }).length,
  0,
);

// Initial order matches catalogue display order
assert.deepEqual(cardNames(), [
  "Men Senator Classic",
  "Women Ceremonial Gown",
  "Men Ceremonial Royal",
]);

// Filter by Ceremonial -> preserves display order
await act(async () => {
  customerRenderer.root
    .findByProps({ "data-testid": "step3-category-chip-ceremonial" })
    .props.onClick();
});
assert.deepEqual(cardNames(), [
  "Women Ceremonial Gown",
  "Men Ceremonial Royal",
]);

// Filter independently by Audience (Men) while Ceremonial is active
await act(async () => {
  customerRenderer.root
    .findByProps({ "data-testid": "step3-audience-chip-male" })
    .props.onClick();
});
assert.deepEqual(cardNames(), ["Men Ceremonial Royal"]);

// Combine Senator + Women -> empty state -> click Show all designs resets both
await act(async () => {
  customerRenderer.root
    .findByProps({ "data-testid": "step3-category-chip-senator" })
    .props.onClick();
});
await act(async () => {
  customerRenderer.root
    .findByProps({ "data-testid": "step3-audience-chip-female" })
    .props.onClick();
});
assert.equal(cardNames().length, 0);
const emptyBox = customerRenderer.root.findByProps({
  "data-testid": "step3-filter-empty",
});
await act(async () => {
  emptyBox.findByType("button").props.onClick();
});
assert.deepEqual(cardNames(), [
  "Men Senator Classic",
  "Women Ceremonial Gown",
  "Men Ceremonial Royal",
]);

await act(async () => customerRenderer.unmount());

console.log(
  "PASS: structured Design Style categories validator, authority lockstep, migration planner, Admin CRUD, and customer chips",
);
