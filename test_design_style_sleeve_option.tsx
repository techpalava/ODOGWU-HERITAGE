import nodeAssert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { FutureAdditionalGarmentDesignStyleDialog } from "./src/components/FutureAdditionalGarmentDesignStyleDialog";
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
  projectPublishedDesignStyleRecord,
  type AuthoritativeDesignStyleRecordV1,
  type DesignStyleLifecycle,
} from "./src/utils/designStyleAuthority";
import {
  publishDesignStyleWithDependencies,
  type DesignStylePublicationDependencies,
} from "./src/utils/designStylePublication";
import {
  DESIGN_STYLE_SLEEVE_OPTION_VALUES,
  DESIGN_STYLE_SLEEVE_OPTIONS,
  getDesignStyleSleeveOptionLabel,
  isDesignStyleSleeveOption,
  normalizeDesignStyleSleeveOption,
  type DesignStyleSleeveOption,
} from "./src/utils/designStyleSleeveOption";
import type { DesignStyleStepCatalogueEntry } from "./src/utils/designStyleStepRuntime";
import {
  createDesignStyleStepRenderProps,
  createDesignStyleStepTestModel,
} from "./testing/designStyleStepFixtures";

// Counting wrapper around node:assert so the run reports how many genuine
// assertions executed.
let assertionCount = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, {
  apply(target, thisArg, args) {
    assertionCount += 1;
    return Reflect.apply(target as never, thisArg, args);
  },
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => {
      assertionCount += 1;
      return (value as (...inner: unknown[]) => unknown).apply(target, args);
    };
  },
}) as typeof nodeAssert;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BANNED_COPY = /\b(kaftan|knicker)/i;
const VALID_LABELS: Record<DesignStyleSleeveOption, string> = {
  sleeveless: "Sleeveless",
  short_sleeve: "Short Sleeve",
  mid_sleeve: "Mid Sleeve",
  long_sleeve: "Long Sleeve",
};

const textContent = (node: ReactTestInstance | string | null | undefined): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const sleeveBadges = (root: ReactTestInstance) =>
  root.findAll(
    (node) =>
      typeof node.type === "string" &&
      node.props?.["data-testid"] === "design-style-sleeve-badge",
  );

// ---------------------------------------------------------------------------
// 1. Helpers & labels
// ---------------------------------------------------------------------------
{
  assert.deepEqual(
    [...DESIGN_STYLE_SLEEVE_OPTION_VALUES],
    ["sleeveless", "short_sleeve", "mid_sleeve", "long_sleeve"],
  );
  assert.equal(
    (DESIGN_STYLE_SLEEVE_OPTION_VALUES as readonly string[]).includes(""),
    false,
    'DESIGN_STYLE_SLEEVE_OPTION_VALUES must not contain ""',
  );
  assert.deepEqual([...DESIGN_STYLE_SLEEVE_OPTIONS], [...DESIGN_STYLE_SLEEVE_OPTION_VALUES]);

  for (const [value, label] of Object.entries(VALID_LABELS) as [
    DesignStyleSleeveOption,
    string,
  ][]) {
    assert.equal(isDesignStyleSleeveOption(value), true, value);
    assert.equal(normalizeDesignStyleSleeveOption(value), value);
    assert.equal(normalizeDesignStyleSleeveOption(`  ${value}  `), value);
    assert.equal(getDesignStyleSleeveOptionLabel(value), label);
    assert.doesNotMatch(label, BANNED_COPY);
  }

  for (const invalid of [
    undefined,
    null,
    "",
    "   ",
    "Short Sleeve",
    "SHORT_SLEEVE",
    "three_quarter",
    "kaftan",
    "knicker",
    0,
    true,
    {},
  ] as unknown[]) {
    assert.equal(isDesignStyleSleeveOption(invalid), false, String(invalid));
    assert.equal(normalizeDesignStyleSleeveOption(invalid), undefined, String(invalid));
    assert.equal(getDesignStyleSleeveOptionLabel(invalid), null, String(invalid));
  }

  for (const file of [
    "src/utils/designStyleSleeveOption.ts",
    "src/components/DesignStyleSleeveBadge.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), BANNED_COPY, file);
  }
}

// ---------------------------------------------------------------------------
// 2. Authority persistence & zero-drift
// ---------------------------------------------------------------------------
const baseStyle = (overrides: Partial<StyleCategory> = {}): StyleCategory => ({
  id: "sleeve-authority-style",
  name: "Sleeve Authority Style",
  description: "A published style used to verify sleeve option persistence.",
  gender: "unisex",
  options: ["Standard"],
  image: "https://example.test/sleeve-style.webp",
  outfitType: "Senator Set",
  garmentComposition: "2-Piece Set",
  fabricCategory: "Any",
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt", "neck", "trousers"],
    requiredSelectionGroups: ["shirt_construction", "trouser_fastening"],
    enabled: true,
  },
  includedDesignFeatures: {
    hasMonogram: false,
    hasEmbroidery: true,
    hasMonogramTrimming: false,
  },
  monogramCuffEligible: true,
  embroideryProminence: "heavy",
  defaultGarmentDetails: {},
  styleApplicability: { mode: "exact_only" },
  ...overrides,
});

const createRecord = (
  style: StyleCategory,
  currentRecord: AuthoritativeDesignStyleRecordV1 | null = null,
  lifecycle: DesignStyleLifecycle = "published",
) =>
  prepareAuthoritativeDesignStyleRecord({
    style,
    lifecycle,
    displayOrder: 2,
    referenceComposition: { status: "known", garmentTypes: ["shirt", "trouser"] },
    currentRecord,
  });

{
  const unset = createRecord(baseStyle());
  assert.equal("sleeveOption" in unset.presentation, false);
  assert.equal(parseAuthoritativeDesignStyleRecord(unset.id, unset).status, "valid");
  assert.equal(projectDesignStyleRecordForAdmin(unset).sleeveOption, undefined);
  assert.equal("sleeveOption" in projectDesignStyleRecordForAdmin(unset), false);
  const unsetPublished = projectPublishedDesignStyleRecord(unset);
  assert.ok(unsetPublished);
  assert.equal(unsetPublished.sleeveOption, undefined);

  let previous = unset;
  for (const value of DESIGN_STYLE_SLEEVE_OPTION_VALUES) {
    const next = createRecord(baseStyle({ sleeveOption: value }), previous);
    assert.equal(next.presentation.sleeveOption, value);
    assert.equal(parseAuthoritativeDesignStyleRecord(next.id, next).status, "valid");
    const reparsed = parseAuthoritativeDesignStyleRecord(next.id, next);
    assert.equal(reparsed.status, "valid");
    if (reparsed.status === "valid") {
      assert.equal(reparsed.record.presentation.sleeveOption, value);
    }
    assert.equal(projectDesignStyleRecordForAdmin(next).sleeveOption, value);
    const published = projectPublishedDesignStyleRecord(next);
    assert.ok(published);
    assert.equal(published.sleeveOption, value);
    assert.equal(next.publicRevision, previous.publicRevision + 1);
    assert.equal(next.eligibilityRevision, previous.eligibilityRevision);
    assert.equal(next.eligibilityFingerprint, previous.eligibilityFingerprint);
    assert.deepEqual(next.eligibility, previous.eligibility);
    assert.deepEqual(next.referenceComposition, previous.referenceComposition);
    previous = next;
  }

  for (const cleared of [undefined, ""] as const) {
    const withSleeve = createRecord(baseStyle({ sleeveOption: "long_sleeve" }), previous);
    const clearedRecord = createRecord(
      baseStyle({ sleeveOption: cleared as DesignStyleSleeveOption | undefined }),
      withSleeve,
    );
    assert.equal("sleeveOption" in clearedRecord.presentation, false, `clear via ${JSON.stringify(cleared)}`);
    assert.equal(projectDesignStyleRecordForAdmin(clearedRecord).sleeveOption, undefined);
    assert.equal(clearedRecord.publicRevision, withSleeve.publicRevision + 1);
    assert.equal(clearedRecord.eligibilityRevision, withSleeve.eligibilityRevision);
    assert.equal(clearedRecord.eligibilityFingerprint, withSleeve.eligibilityFingerprint);
    previous = clearedRecord;
  }

  const valid = createRecord(baseStyle({ sleeveOption: "short_sleeve" }));
  for (const invalid of ["three_quarter", "Short Sleeve", "", 7, null, true]) {
    assert.equal(
      parseAuthoritativeDesignStyleRecord(valid.id, {
        ...valid,
        presentation: { ...valid.presentation, sleeveOption: invalid },
      }).status,
      "invalid",
      `persisted sleeveOption ${JSON.stringify(invalid)} must fail closed`,
    );
  }
  for (const invalid of ["three_quarter", "Short Sleeve", "SLEEVELESS", 7]) {
    assert.throws(
      () =>
        createRecord(
          baseStyle({ sleeveOption: invalid as unknown as DesignStyleSleeveOption }),
        ),
      /INVALID_STYLE_SLEEVE_OPTION/,
    );
  }

  // Legacy authoritative record written before sleeveOption existed.
  const legacy = createRecord(baseStyle());
  const legacyPresentation = { ...legacy.presentation } as Record<string, unknown>;
  delete legacyPresentation.sleeveOption;
  const legacyParsed = parseAuthoritativeDesignStyleRecord(legacy.id, {
    ...legacy,
    presentation: legacyPresentation,
  });
  assert.equal(legacyParsed.status, "valid");
  if (legacyParsed.status === "valid") {
    assert.equal(legacyParsed.record.presentation.sleeveOption, undefined);
  }
}

// ---------------------------------------------------------------------------
// 3. firestore.rules lockstep
// ---------------------------------------------------------------------------
{
  const rules = readFileSync("firestore.rules", "utf8").replace(/\r\n/g, "\n");
  const start = rules.indexOf("function hasValidDesignStylePresentation(data)");
  assert.ok(start >= 0, "hasValidDesignStylePresentation must exist");
  const end = rules.indexOf("\n    function ", start + 1);
  const body = rules.slice(start, end > start ? end : undefined);
  const hasOnlyMatch = body.match(/data\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
  const hasAllMatch = body.match(/data\.keys\(\)\.hasAll\(\[([\s\S]*?)\]\)/);
  assert.ok(hasOnlyMatch, "presentation hasOnly list must exist");
  assert.ok(hasAllMatch, "presentation hasAll list must exist");
  const listKeys = (raw: string) => [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const hasOnlyKeys = listKeys(hasOnlyMatch[1]);
  const hasAllKeys = listKeys(hasAllMatch[1]);
  assert.equal(hasOnlyKeys.includes("sleeveOption"), true);
  assert.equal(hasOnlyKeys.includes("showsWearer"), true);
  assert.equal(hasOnlyKeys.includes("categoryIds"), true);
  assert.equal(hasAllKeys.includes("sleeveOption"), false, "sleeveOption must stay optional");
  const sleeveRule = body.match(
    /!data\.keys\(\)\.hasAny\(\["sleeveOption"\]\)\s*\|\|\s*data\.sleeveOption in \[([^\]]*)\]/,
  );
  assert.ok(sleeveRule, "sleeveOption value rule must exist");
  assert.deepEqual(listKeys(sleeveRule[1]), [...DESIGN_STYLE_SLEEVE_OPTION_VALUES]);
}

// ---------------------------------------------------------------------------
// 4. Step 3 runtime UI (DormantFutureDesignStyleStep)
// ---------------------------------------------------------------------------
const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
): GarmentTypeStepSelection => ({
  garmentTypes: [...garmentTypes],
  demographic: "male",
  audienceSelection: { schemaVersion: 1, demographics: ["male"] },
  constructionByGarment: {},
});

const stepStyle = (id: string, name: string, sleeveOption?: DesignStyleSleeveOption): StyleCategory => ({
  id,
  name,
  description: `${name} description.`,
  gender: "male",
  targetDemographic: "male",
  options: [],
  image: `https://example.test/${id}.webp`,
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  ...(sleeveOption ? { sleeveOption } : {}),
});

{
  const withSleeve = stepStyle("sleeve-step-short", "Short Sleeve Heritage", "short_sleeve");
  const withoutSleeve = stepStyle("sleeve-step-none", "Plain Heritage");
  const model = createDesignStyleStepTestModel({
    styles: [withSleeve, withoutSleeve],
    garmentTypeSelection: selection(["shirt"]),
  });
  // The strict projection pipeline must carry sleeveOption into the catalogue.
  const projected = model.catalogueEntries.find((entry) => entry.style.id === withSleeve.id);
  assert.ok(projected);
  assert.equal(projected.style.sleeveOption, "short_sleeve");
  const catalogueEntries = model.catalogueEntries.map((entry) =>
    entry.style.id === withSleeve.id
      ? { ...entry, selectedOccurrenceLabels: ["Standard Shirt"] }
      : entry,
  );
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <DormantFutureDesignStyleStep
        {...createDesignStyleStepRenderProps(model)}
        catalogueEntries={catalogueEntries}
        galleryStyleId={withSleeve.id}
      />,
    );
  });

  const sleeveCard = renderer.root.findByProps({ "data-style-name": withSleeve.name });
  const plainCard = renderer.root.findByProps({ "data-style-name": withoutSleeve.name });
  const cardBadges = sleeveBadges(sleeveCard);
  assert.equal(cardBadges.length, 1);
  assert.equal(textContent(cardBadges[0]), "Short Sleeve");
  assert.match(String(cardBadges[0].props.className), /\babsolute bottom-2\.5 left-2\.5\b/);
  assert.match(String(cardBadges[0].props.className), /\binline-flex items-center\b/);
  const photo = sleeveCard.find(
    (node) =>
      node.type === "div" && String(node.props.className || "").includes("aspect-[4/3]"),
  );
  assert.equal(sleeveBadges(photo).length, 1, "badge must sit on the card photo");
  const photoText = textContent(photo);
  assert.match(photoText, /From gallery/);
  assert.match(photoText, /IN USE/);
  assert.match(photoText, /Short Sleeve/);
  assert.equal(sleeveBadges(plainCard).length, 0);
  assert.doesNotMatch(textContent(plainCard), /Sleeveless|Short Sleeve|Mid Sleeve|Long Sleeve/);

  const readMore = sleeveCard.findByProps({ "aria-label": `Read more about ${withSleeve.name}` });
  await act(async () =>
    readMore.props.onClick({
      stopPropagation: () => undefined,
      currentTarget: { focus: () => undefined },
    }),
  );
  const details = renderer.root.findByProps({ "data-testid": "design-style-details-dialog" });
  const detailBadges = sleeveBadges(details);
  assert.equal(detailBadges.length, 1);
  assert.equal(textContent(detailBadges[0]), "Short Sleeve");
  assert.match(String(detailBadges[0].props.className), /\babsolute bottom-3 left-3\b/);
  const detailPhotoWrapper = details.find(
    (node) =>
      node.type === "div" &&
      node.props.className === "relative" &&
      sleeveBadges(node).length === 1,
  );
  assert.ok(detailPhotoWrapper, "details badge must be inside the relative photo wrapper");
  assert.doesNotMatch(textContent(renderer.root), BANNED_COPY);
  await act(async () => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 5. Step 5 popup runtime UI (FutureAdditionalGarmentDesignStyleDialog)
// ---------------------------------------------------------------------------
const dialogEntry = (
  id: string,
  name: string,
  sleeveOption?: DesignStyleSleeveOption,
): DesignStyleStepCatalogueEntry => {
  const request = {
    runtimeGeneration: 1,
    expectedLedgerRevision: 1,
    target: { garmentKey: "additional:shirt:1", occurrenceToken: "additional:shirt:1@3" },
    styleId: id,
    sourceKey: `catalog:${id}`,
    eligibilityFingerprint: `fp-${id}`,
  };
  return {
    style: {
      id,
      name,
      description: `${name} description`,
      image: `https://example.test/${id}.webp`,
      ...(sleeveOption ? { sleeveOption } : {}),
    },
    presentation: {
      tier: "exact_match",
      selectable: true,
      requiresAdaptationConfirmation: false,
      originalCompositionLabel: "Standard Shirt",
      selectedGarmentLabels: ["Standard Shirt"],
      customerReason: "Designed for Standard Shirt.",
    },
    selected: false,
    request,
    requestsByOccurrenceToken: { "additional:shirt:1@3": request },
    selectedOccurrenceLabels: [],
    referenceGarmentTypes: ["shirt"],
    adaptationCopy: null,
  } as unknown as DesignStyleStepCatalogueEntry;
};

{
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <FutureAdditionalGarmentDesignStyleDialog
        garmentType="shirt"
        garmentKey="additional:shirt:1"
        catalogueEntries={[
          dialogEntry("popup-mid", "Mid Sleeve Heritage", "mid_sleeve"),
          dialogEntry("popup-none", "Plain Popup Heritage"),
        ]}
        onSelectStyle={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await Promise.resolve();
  });
  const cards = renderer.root.findAllByProps({
    "data-testid": "additional-garment-design-style-card",
  });
  const midCard = cards.find((card) => card.props["data-style-id"] === "popup-mid");
  const plainCard = cards.find((card) => card.props["data-style-id"] === "popup-none");
  assert.ok(midCard);
  assert.ok(plainCard);
  const midBadges = sleeveBadges(midCard);
  assert.equal(midBadges.length, 1);
  assert.equal(textContent(midBadges[0]), "Mid Sleeve");
  assert.match(String(midBadges[0].props.className), /\babsolute bottom-2\.5 left-2\.5\b/);
  assert.equal(sleeveBadges(plainCard).length, 0);
  assert.doesNotMatch(textContent(renderer.root), BANNED_COPY);
  await act(async () => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 6. Admin UI (DatabaseView)
// ---------------------------------------------------------------------------
let committedRecord: AuthoritativeDesignStyleRecordV1 | null = null;
const subscribers = new Set<
  (snapshot: {
    styles: ReturnType<typeof projectDesignStyleRecordForAdmin>[];
    diagnostics: never[];
  }) => void
>();
const emitAdminSnapshot = () => {
  const snapshot = {
    styles: committedRecord ? [projectDesignStyleRecordForAdmin(committedRecord)] : [],
    diagnostics: [] as never[],
  };
  subscribers.forEach((subscriber) => subscriber(snapshot));
};
const persistence: DesignStylePublicationDependencies = {
  readCurrent: async () =>
    committedRecord
      ? {
          record: committedRecord,
          legacyMigrationAllowed: false,
          currentImage: committedRecord.presentation.image,
        }
      : null,
  uploadReplacementImage: async () => {
    throw new Error("No replacement upload expected in sleeve option test.");
  },
  commitAuthoritativeRecord: async ({ record, expectedPublicRevision }) => {
    nodeAssert.equal(expectedPublicRevision, committedRecord?.publicRevision ?? 0);
    committedRecord = record;
    emitAdminSnapshot();
  },
  canDeleteSupersededImage: async () => false,
  deleteImage: async () => undefined,
};
const sampleCategories: DesignStyleCategory[] = [
  { id: "standard-length-shirt", name: "Standard Length Shirt", displayOrder: 0, enabled: true },
];

const originalSubscribe = DesignStyleAuthorityService.subscribeToAdminRecords;
const originalPublish = DesignStyleAuthorityService.publish;
const originalCategorySubscribe = DesignStyleCategoryService.subscribe;
const originalStoreState = useAppStore.getState();
let adminRenderer: ReturnType<typeof create> | undefined;

const findStyleForm = () => {
  const form = adminRenderer!.root
    .findAllByType("form")
    .find((candidate) => candidate.findAllByProps({ "aria-label": "Collection Audience" }).length > 0);
  nodeAssert.ok(form, "Design Style editor form must be mounted.");
  return form;
};
const submitStyleForm = async () => {
  const form = findStyleForm();
  await act(async () => {
    await form.props.onSubmit({ preventDefault: () => undefined });
  });
};
const openFirstStyleInList = async () => {
  const editButton = adminRenderer!.root
    .findAllByType("button")
    .find((btn) => textContent(btn).trim() === "Edit Garment Option");
  nodeAssert.ok(editButton, "Edit Garment Option button must exist.");
  await act(async () => {
    editButton.props.onClick();
  });
};
const sleeveSelect = () =>
  adminRenderer!.root.find(
    (node) => node.type === "select" && node.props["data-testid"] === "admin-style-sleeve-option",
  );

try {
  DesignStyleAuthorityService.subscribeToAdminRecords = ((onSnapshot) => {
    subscribers.add(onSnapshot as never);
    emitAdminSnapshot();
    return () => subscribers.delete(onSnapshot as never);
  }) as typeof DesignStyleAuthorityService.subscribeToAdminRecords;
  DesignStyleCategoryService.subscribe = ((onCategories) => {
    onCategories(sampleCategories);
    return () => undefined;
  }) as typeof DesignStyleCategoryService.subscribe;
  DesignStyleAuthorityService.publish = (async (input) =>
    publishDesignStyleWithDependencies(input, persistence)) as typeof DesignStyleAuthorityService.publish;
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
      {
        createNodeMock: (element) =>
          element.props?.["data-testid"] === "admin-record-editor"
            ? { scrollIntoView: () => undefined, focus: () => undefined }
            : null,
      },
    );
  });

  const addButton = adminRenderer!.root
    .findAllByType("button")
    .find((btn) => textContent(btn).includes("Add Design Style"));
  assert.ok(addButton, "Add Design Style button must exist.");
  await act(async () => {
    addButton.props.onClick();
  });

  const select = sleeveSelect();
  assert.equal(select.props["aria-label"], "Sleeve Option");
  assert.equal(select.props.value, "");
  assert.equal(
    select.props.className,
    "w-full px-3 py-2 border border-heritage-gold/20 bg-white rounded-lg text-xs",
  );
  const optionNodes = select.findAllByType("option");
  assert.deepEqual(
    optionNodes.map((option) => option.props.value),
    ["", ...DESIGN_STYLE_SLEEVE_OPTION_VALUES],
  );
  assert.deepEqual(
    optionNodes.map((option) => textContent(option)),
    ["Not specified (No badge)", "Sleeveless", "Short Sleeve", "Mid Sleeve", "Long Sleeve"],
  );
  for (const option of optionNodes) {
    assert.doesNotMatch(textContent(option), BANNED_COPY);
  }

  // Placement: below "Garments in this design", above "Design audience".
  const formText = textContent(findStyleForm());
  const garmentsIndex = formText.indexOf("Garments in this design");
  const sleeveIndex = formText.indexOf("Sleeve Option");
  const audienceIndex = formText.indexOf("Design audience");
  assert.ok(garmentsIndex >= 0 && sleeveIndex > garmentsIndex, "Sleeve Option below Garments in this design");
  assert.ok(audienceIndex > sleeveIndex, "Sleeve Option above Design audience");

  await act(async () => {
    adminRenderer!.root
      .findByProps({ placeholder: "e.g. Royal Senator" })
      .props.onChange({ target: { value: "Sleeve Option Test Shirt" } });
  });
  await act(async () => {
    adminRenderer!.root.findByProps({ "aria-label": "Category Standard Length Shirt" }).props.onClick();
  });
  await submitStyleForm();
  assert.ok(committedRecord, "New draft record must be committed.");
  assert.equal(parseAuthoritativeDesignStyleRecord(committedRecord.id, committedRecord).status, "valid");
  assert.equal("sleeveOption" in committedRecord.presentation, false);

  await openFirstStyleInList();
  assert.equal(sleeveSelect().props.value, "");
  const eligibilityBefore = committedRecord.eligibilityRevision;
  const fingerprintBefore = committedRecord.eligibilityFingerprint;
  const publicBefore = committedRecord.publicRevision;
  await act(async () => {
    sleeveSelect().props.onChange({ target: { value: "long_sleeve" } });
  });
  assert.equal(sleeveSelect().props.value, "long_sleeve");
  await submitStyleForm();
  assert.equal(committedRecord.presentation.sleeveOption, "long_sleeve");
  assert.equal(committedRecord.eligibilityRevision, eligibilityBefore);
  assert.equal(committedRecord.eligibilityFingerprint, fingerprintBefore);
  assert.equal(committedRecord.publicRevision, publicBefore + 1);
  assert.equal(projectDesignStyleRecordForAdmin(committedRecord).sleeveOption, "long_sleeve");

  await openFirstStyleInList();
  assert.equal(sleeveSelect().props.value, "long_sleeve");
  await act(async () => {
    sleeveSelect().props.onChange({ target: { value: "" } });
  });
  assert.equal(sleeveSelect().props.value, "");
  await submitStyleForm();
  assert.equal("sleeveOption" in committedRecord.presentation, false);
  assert.equal(committedRecord.eligibilityRevision, eligibilityBefore);
  assert.equal(committedRecord.eligibilityFingerprint, fingerprintBefore);
  assert.equal(projectDesignStyleRecordForAdmin(committedRecord).sleeveOption, undefined);

  await openFirstStyleInList();
  assert.equal(sleeveSelect().props.value, "");
} finally {
  await act(async () => adminRenderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  DesignStyleAuthorityService.publish = originalPublish;
  DesignStyleCategoryService.subscribe = originalCategorySubscribe;
  useAppStore.setState(originalStoreState);
}

console.log(
  `PASS: Design Style sleeve option helpers, authority persistence/zero-drift, firestore.rules lockstep, Step 3 + Step 5 badges, and Admin editor (${assertionCount} assertions)`,
);
