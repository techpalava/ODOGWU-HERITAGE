import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { getFabricGarmentLabel } from "./src/engine/FabricCapacityEngine";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { DesignStyleCategoryService } from "./src/services/designStyleCategoryService";
import { useAppStore } from "./src/store/useAppStore";
import type {
  Customer,
  DesignStyleCategory,
  StyleCategory,
} from "./src/types";
import { resolveStyleApplicability } from "./src/utils/designStudioFutureDesignStyle";
import {
  ADAPTABLE_DESIGN_STYLE_GARMENT_TYPES,
  DEFAULT_ADMIN_STYLE_OUTFIT_TYPE,
  deriveFeaturesMaleAndFemale,
  getDefaultOutfitTypeForGender,
  resolveGroupedOutfitTypeOptions,
} from "./src/utils/designStyleAdminDefaults";
import type { AuthoritativeDesignStyleRecordV1 } from "./src/utils/designStyleAuthority";
import {
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
  projectPublishedDesignStyleRecord,
} from "./src/utils/designStyleAuthority";
import {
  publishDesignStyleWithDependencies,
  type DesignStylePublicationDependencies,
  type PublishDesignStyleInput,
} from "./src/utils/designStylePublication";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children
        .map((child) => textContent(child as ReactTestInstance | string))
        .join("");

let committedRecord: AuthoritativeDesignStyleRecordV1 | null = null;
const publicationInputs: PublishDesignStyleInput[] = [];
const subscribers = new Set<
  (snapshot: {
    styles: ReturnType<typeof projectDesignStyleRecordForAdmin>[];
    diagnostics: never[];
  }) => void
>();

const emitAdminSnapshot = () => {
  const snapshot = {
    styles: committedRecord
      ? [projectDesignStyleRecordForAdmin(committedRecord)]
      : [],
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
    throw new Error("No replacement upload expected in defaults test.");
  },
  commitAuthoritativeRecord: async ({ record, expectedPublicRevision }) => {
    assert.equal(expectedPublicRevision, committedRecord?.publicRevision ?? 0);
    committedRecord = record;
    emitAdminSnapshot();
  },
  canDeleteSupersededImage: async () => false,
  deleteImage: async () => undefined,
};

const originalSubscribe = DesignStyleAuthorityService.subscribeToAdminRecords;
const originalPublish = DesignStyleAuthorityService.publish;
const originalCategorySubscribe = DesignStyleCategoryService.subscribe;
const originalStoreState = useAppStore.getState();
let renderer: ReturnType<typeof create> | undefined;

const sampleCategories: DesignStyleCategory[] = [
  {
    id: "standard-length-shirt",
    name: "Standard Length Shirt",
    displayOrder: 0,
    enabled: true,
  },
  {
    id: "short-sleeve",
    name: "Short Sleeve",
    displayOrder: 1,
    enabled: true,
  },
  {
    id: "ceremonial",
    name: "Ceremonial",
    displayOrder: 2,
    enabled: true,
  },
];

const findStyleForm = () => {
  const form = renderer!.root
    .findAllByType("form")
    .find(
      (candidate) =>
        candidate.findAllByProps({ "aria-label": "Collection Audience" })
          .length > 0,
    );
  assert.ok(form, "Design Style editor form must be mounted.");
  return form;
};

const submitStyleForm = async () => {
  const form = findStyleForm();
  await act(async () => {
    await form.props.onSubmit({ preventDefault: () => undefined });
  });
};

const openFirstStyleInList = async () => {
  const editButton = renderer!.root
    .findAllByType("button")
    .find((btn) => textContent(btn).trim() === "Edit Garment Option");
  assert.ok(editButton, "Edit Garment Option button must exist.");
  await act(async () => {
    editButton.props.onClick();
  });
};

const findDesignAudienceCheckbox = (gender: "male" | "female") => {
  const form = findStyleForm();
  const audienceContainer = form.findAllByType("div").find((div) => {
    const labels = div.findAllByType("label");
    return (
      labels.length > 0 &&
      textContent(labels[0]).trim() === "Design audience"
    );
  });
  assert.ok(audienceContainer, "Design audience section must be mounted.");
  const targetLabel = audienceContainer
    .findAllByType("label")
    .find((label) => textContent(label).trim() === gender);
  assert.ok(targetLabel, `Design audience checkbox label for ${gender} must exist.`);
  return targetLabel.findByType("input");
};

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

  DesignStyleAuthorityService.publish = (async (input) => {
    publicationInputs.push(input);
    return publishDesignStyleWithDependencies(input, persistence);
  }) as typeof DesignStyleAuthorityService.publish;

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
  const editorScrollCalls: unknown[] = [];
  const editorFocusCalls: unknown[] = [];
  await act(async () => {
    renderer = create(
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
            ? {
                scrollIntoView: (options?: unknown) => {
                  editorScrollCalls.push(options);
                },
                focus: (options?: unknown) => {
                  editorFocusCalls.push(options);
                },
              }
            : null,
      },
    );
  });

  const addButton = renderer!.root
    .findAllByType("button")
    .find((btn) => textContent(btn).includes("Add Design Style"));
  assert.ok(addButton, "Add Design Style button must exist.");

  await act(async () => {
    addButton.props.onClick();
  });

  const audienceSelect = renderer!.root.findByProps({
    "aria-label": "Collection Audience",
  });
  const outfitSelect = renderer!.root.findByProps({
    "aria-label": "Outfit Type",
  });
  const compositionInput = renderer!.root.findByProps({
    "aria-label": "Garment Composition",
  });
  const applicabilitySelect = renderer!.root.findByProps({
    "aria-label": "Style Applicability Mode",
  });
  const cuffCheckbox = renderer!.root.findByProps({
    "aria-label": "Monogram on sleeve cuff eligible",
  });
  const embroiderySelect = renderer!.root.findByProps({
    "aria-label": "Embroidery Prominence",
  });
  const wearerCheckbox = renderer!.root.findByProps({
    "aria-label": "Style photo shows a wearer",
  });

  assert.equal(audienceSelect.props.value, "male");
  assert.equal(outfitSelect.props.value, "Senator Set");
  assert.equal(compositionInput.props.readOnly, true);
  assert.equal(compositionInput.props.value, "Standard Shirt + Long Shirt");
  assert.doesNotMatch(
    compositionInput.props.value,
    /kaftan/i,
    "Must never expose Kaftan in derived Garment Composition",
  );
  assert.equal(
    renderer!.root.findAllByProps({ "aria-label": "Style Fabric Category" }).length,
    0,
    "Style Fabric Category control must be hidden from Admin form",
  );
  assert.equal(
    renderer!.root.findAllByProps({ "aria-label": "Style Feature Options" }).length,
    0,
    "Style Feature Options control must be hidden from Admin form",
  );
  assert.equal(applicabilitySelect.props.value, "exact_only");
  assert.equal(cuffCheckbox.props.checked, false);
  assert.equal(embroiderySelect.props.value, "standard");
  assert.equal(wearerCheckbox.props.checked, false);

  const visibleOptionTexts = [
    ...outfitSelect.findAllByType("option"),
  ].map((opt) => textContent(opt));
  for (const label of visibleOptionTexts) {
    assert.doesNotMatch(label, /kaftan/i, `Must never expose Kaftan in Admin UI: ${label}`);
  }

  const nameInput = renderer!.root.findByProps({
    placeholder: "e.g. Royal Senator",
  });
  const standardLengthChip = renderer!.root.findByProps({
    "aria-label": "Category Standard Length Shirt",
  });
  const shortSleeveChip = renderer!.root.findByProps({
    "aria-label": "Category Short Sleeve",
  });

  await act(async () => {
    nameInput.props.onChange({ target: { value: "Emerald Collar Test Shirt" } });
  });
  await act(async () => {
    standardLengthChip.props.onClick();
  });
  await act(async () => {
    shortSleeveChip.props.onClick();
  });

  await submitStyleForm();

  assert.equal(publicationInputs.length, 1);
  assert.ok(committedRecord, "New draft record must be committed.");
  const parsed = parseAuthoritativeDesignStyleRecord(
    committedRecord.id,
    committedRecord,
  );
  assert.equal(parsed.status, "valid");
  assert.equal(committedRecord.lifecycle, "draft");
  assert.equal(committedRecord.presentation.gender, "male");
  assert.equal(committedRecord.presentation.outfitType, "Senator Set");
  assert.equal(committedRecord.presentation.garmentComposition, "Shirt Only");
  assert.equal(committedRecord.presentation.fabricCategory, "HiTarget Ankara");
  assert.equal(committedRecord.presentation.monogramCuffEligible, false);
  assert.equal(committedRecord.presentation.embroideryProminence, "standard");
  assert.equal("showsWearer" in committedRecord.presentation, false);
  assert.deepEqual(committedRecord.presentation.categoryIds, [
    "standard-length-shirt",
    "short-sleeve",
  ]);
  assert.deepEqual(committedRecord.presentation.designCategories, [
    "Standard Length Shirt",
    "Short Sleeve",
  ]);
  assert.deepEqual(committedRecord.presentation.options, []);
  assert.deepEqual(committedRecord.eligibility, {
    garmentTypes: ["kaftan", "shirt"],
    demographics: ["male"],
    adaptability: {
      mode: "exact_only",
      garmentTypes: [],
      demographics: [],
    },
  });
  assert.deepEqual(committedRecord.referenceComposition, {
    status: "known",
    garmentTypes: ["shirt"],
  });
  assert.deepEqual(committedRecord.presentation.customDetailConfiguration, {
    supportedGarmentGroups: ["neck", "shirt"],
    requiredSelectionGroups: ["neck_design", "shirt_construction", "shirt_pockets"],
    enabled: true,
  });
  assert.deepEqual(committedRecord.presentation.includedDesignFeatures, {
    hasMonogram: false,
    hasEmbroidery: false,
    hasMonogramTrimming: false,
    hasLining: false,
    hasNet: false,
  });

  // 2. Zero-drift unchanged save test with non-default hidden fields preserved
  const seededStyle: StyleCategory = {
    id: "ODGH-099",
    name: "Legacy Preserved Style",
    description: "Existing style with legacy metadata preserved on unchanged save.",
    gender: "unisex",
    outfitType: "Senator Set",
    garmentComposition: "Legacy 2-Piece",
    fabricCategory: "Wax Print",
    options: ["Mandarin Collar", "Hidden Placket"],
    designCategories: ["Ceremonial"],
    detectedColors: { main: "#112233", secondary: "#445566" },
    constructionDetails: [],
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
      hasEmbroidery: false,
      hasMonogramTrimming: false,
      hasLining: false,
      hasNet: false,
    },
    monogramCuffEligible: false,
    embroideryProminence: "standard",
    defaultGarmentDetails: {},
    styleApplicability: { mode: "exact_only" },
  };
  const seededRecord = prepareAuthoritativeDesignStyleRecord({
    style: seededStyle,
    lifecycle: "published",
    displayOrder: 4,
    referenceComposition: { status: "known", garmentTypes: ["shirt", "trouser"] },
    currentRecord: null,
  });
  committedRecord = seededRecord;
  await act(async () => {
    emitAdminSnapshot();
  });

  await openFirstStyleInList();
  assert.equal(
    renderer!.root.findByProps({ "aria-label": "Garment Composition" }).props.value,
    "Standard Shirt + Trouser",
  );
  assert.equal(
    renderer!.root.findAllByProps({ "aria-label": "Style Fabric Category" }).length,
    0,
  );
  assert.equal(
    renderer!.root.findAllByProps({ "aria-label": "Style Feature Options" }).length,
    0,
  );
  await submitStyleForm();

  assert.equal(committedRecord.publicRevision, seededRecord.publicRevision + 1);
  assert.deepEqual(committedRecord.presentation, seededRecord.presentation);
  assert.deepEqual(committedRecord.eligibility, seededRecord.eligibility);
  assert.equal(
    committedRecord.eligibilityRevision,
    seededRecord.eligibilityRevision,
  );
  assert.equal(
    committedRecord.eligibilityFingerprint,
    seededRecord.eligibilityFingerprint,
  );
  assert.deepEqual(
    committedRecord.referenceComposition,
    seededRecord.referenceComposition,
  );

  // 3. Derived featuresMaleAndFemale test (helper + Design audience checkbox toggles)
  assert.equal(deriveFeaturesMaleAndFemale(undefined), false);
  assert.equal(deriveFeaturesMaleAndFemale(["male"]), false);
  assert.equal(deriveFeaturesMaleAndFemale(["female"]), false);
  assert.equal(deriveFeaturesMaleAndFemale(["male", "female"]), true);

  await openFirstStyleInList();
  await act(async () => {
    findDesignAudienceCheckbox("female").props.onChange({
      target: { checked: false },
    });
  });
  await submitStyleForm();
  assert.deepEqual(committedRecord.eligibility.demographics, ["male"]);
  assert.equal(
    projectDesignStyleRecordForAdmin(committedRecord).customDetailConfig
      ?.featuresMaleAndFemale,
    false,
  );

  await openFirstStyleInList();
  await act(async () => {
    findDesignAudienceCheckbox("female").props.onChange({
      target: { checked: true },
    });
  });
  await submitStyleForm();
  assert.deepEqual(committedRecord.eligibility.demographics, ["female", "male"]);
  assert.equal(
    projectDesignStyleRecordForAdmin(committedRecord).customDetailConfig
      ?.featuresMaleAndFemale,
    true,
  );

  // 4. styleApplicability Admin UI toggle test (exact_only <-> adaptable + optional demographics)
  await openFirstStyleInList();
  const modeSelect = renderer!.root.findByProps({
    "aria-label": "Style Applicability Mode",
  });
  assert.equal(modeSelect.props.value, "exact_only");

  await act(async () => {
    modeSelect.props.onChange({ target: { value: "adaptable" } });
  });

  const adaptableLabels = ADAPTABLE_DESIGN_STYLE_GARMENT_TYPES.map((g) =>
    getFabricGarmentLabel(g),
  );
  for (const label of adaptableLabels) {
    assert.doesNotMatch(label, /kaftan/i);
    assert.ok(
      renderer!.root.findByProps({ "aria-label": `Adaptable garment ${label}` }),
      `Adaptable checkbox must exist for ${label}`,
    );
  }
  assert.equal(
    renderer!.root.findAllByProps({ "aria-label": "Adaptable garment Long Skirt" })
      .length,
    0,
    "long_skirt is not in firestore.rules adaptability allow-list and must not render",
  );

  const dressCheckbox = renderer!.root.findByProps({
    "aria-label": "Adaptable garment Standard Dress",
  });
  await act(async () => {
    dressCheckbox.props.onChange({ target: { checked: true } });
  });

  const eligibilityRevBeforeAdaptable = committedRecord.eligibilityRevision;
  await submitStyleForm();

  assert.equal(committedRecord.eligibility.adaptability.mode, "adaptable");
  assert.equal(
    committedRecord.eligibility.adaptability.garmentTypes.includes("dress"),
    true,
  );
  assert.deepEqual(committedRecord.eligibility.adaptability.demographics, []);
  assert.equal(
    committedRecord.eligibilityRevision,
    eligibilityRevBeforeAdaptable + 1,
  );
  const adaptableProjection = projectPublishedDesignStyleRecord(committedRecord);
  assert.ok(adaptableProjection);
  const resolvedAdaptable = resolveStyleApplicability(adaptableProjection);
  assert.equal(resolvedAdaptable.mode, "adaptable");
  if (resolvedAdaptable.mode === "adaptable") {
    assert.equal(resolvedAdaptable.garmentTypes.includes("dress"), true);
    assert.equal(resolvedAdaptable.demographics, null);
  }

  await openFirstStyleInList();
  const adaptableFemaleCheckbox = renderer!.root.findByProps({
    "aria-label": "Adaptable audience female",
  });
  await act(async () => {
    adaptableFemaleCheckbox.props.onChange({ target: { checked: true } });
  });
  await submitStyleForm();
  assert.deepEqual(committedRecord.eligibility.adaptability.demographics, [
    "female",
  ]);
  const adaptableFemaleProjection =
    projectPublishedDesignStyleRecord(committedRecord);
  assert.ok(adaptableFemaleProjection);
  const resolvedAdaptableFemale = resolveStyleApplicability(
    adaptableFemaleProjection,
  );
  assert.equal(resolvedAdaptableFemale.mode, "adaptable");
  if (resolvedAdaptableFemale.mode === "adaptable") {
    assert.deepEqual(resolvedAdaptableFemale.demographics, ["female"]);
  }

  const scrollCountBeforeOpen = editorScrollCalls.length;
  const focusCountBeforeOpen = editorFocusCalls.length;
  await openFirstStyleInList();
  assert.equal(editorScrollCalls.length, scrollCountBeforeOpen + 1);
  assert.equal(editorFocusCalls.length, focusCountBeforeOpen + 1);
  assert.deepEqual(editorScrollCalls.at(-1), {
    behavior: "auto",
    block: "start",
  });
  assert.deepEqual(editorFocusCalls.at(-1), { preventScroll: true });
  const editorNode = renderer!.root.findByProps({
    "data-testid": "admin-record-editor",
  });
  assert.equal(editorNode.props.tabIndex, -1);
  assert.equal(
    String(editorNode.props.className).includes("scroll-mt-28"),
    true,
  );

  await act(async () => {
    renderer!.root
      .findByProps({ "aria-label": "Style Applicability Mode" })
      .props.onChange({ target: { value: "exact_only" } });
  });
  assert.equal(editorScrollCalls.length, scrollCountBeforeOpen + 1);
  assert.equal(editorFocusCalls.length, focusCountBeforeOpen + 1);

  await submitStyleForm();
  assert.deepEqual(committedRecord.eligibility.adaptability, {
    mode: "exact_only",
    garmentTypes: [],
    demographics: [],
  });
  assert.equal(editorScrollCalls.length, scrollCountBeforeOpen + 1);
  assert.equal(editorFocusCalls.length, focusCountBeforeOpen + 1);

  await openFirstStyleInList();
  assert.equal(editorScrollCalls.length, scrollCountBeforeOpen + 2);
  assert.equal(editorFocusCalls.length, focusCountBeforeOpen + 2);

  await openFirstStyleInList();
  assert.equal(editorScrollCalls.length, scrollCountBeforeOpen + 3);
  assert.equal(editorFocusCalls.length, focusCountBeforeOpen + 3);
  assert.deepEqual(editorScrollCalls.at(-1), {
    behavior: "auto",
    block: "start",
  });
  assert.deepEqual(editorFocusCalls.at(-1), { preventScroll: true });
} finally {
  await act(async () => renderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  DesignStyleAuthorityService.publish = originalPublish;
  DesignStyleCategoryService.subscribe = originalCategorySubscribe;
  useAppStore.setState(originalStoreState);
}

// ---------------------------------------------------------------------------
// Pure unit coverage: grouped outfit type options + gender defaults
// ---------------------------------------------------------------------------
type OutfitTypeEntries = NonNullable<(typeof DEFAULT_BUSINESS_SETTINGS)["outfitTypes"]>;
const defaultOutfitTypes: OutfitTypeEntries =
  DEFAULT_BUSINESS_SETTINGS.outfitTypes || [];
const outfitEntry = (
  id: string,
  name: string,
  gender: string | undefined,
  displayOrder?: number,
  enabled?: boolean,
): OutfitTypeEntries[number] =>
  ({ id, name, gender, displayOrder, enabled }) as unknown as OutfitTypeEntries[number];
const groupLabels = (groups: ReturnType<typeof resolveGroupedOutfitTypeOptions>) =>
  groups.map((group) => group.label);
const allOptionLabels = (
  groups: ReturnType<typeof resolveGroupedOutfitTypeOptions>,
) => groups.flatMap((group) => [...group.options]);
const BANNED_OUTFIT_LABEL = /\b(kaftan|knicker)/i;

{
  // enabled !== false filtering: only explicitly disabled entries are dropped.
  const groups = resolveGroupedOutfitTypeOptions({
    businessSettings: {
      outfitTypes: [
        outfitEntry("a", "Alpha Set", "male", 1, true),
        outfitEntry("b", "Bravo Set", "male", 2, undefined),
        outfitEntry("c", "Charlie Set", "male", 3, false),
      ],
    },
    fallbackOutfitTypes: defaultOutfitTypes,
  });
  assert.deepEqual(groups, [
    { label: "Menswear", options: ["Alpha Set", "Bravo Set"] },
  ]);
}

{
  // displayOrder first, then alphabetical (missing displayOrder sorts last).
  const groups = resolveGroupedOutfitTypeOptions({
    businessSettings: {
      outfitTypes: [
        outfitEntry("z", "Zulu Set", "male", 1),
        outfitEntry("y", "Yankee Set", "male", 2),
        outfitEntry("b", "Bravo Set", "male", 2),
        outfitEntry("n", "No Order Set", "male", undefined),
        outfitEntry("a", "Alpha Set", "male", undefined),
      ],
    },
    fallbackOutfitTypes: defaultOutfitTypes,
  });
  assert.deepEqual(groups[0].options, [
    "Zulu Set",
    "Bravo Set",
    "Yankee Set",
    "Alpha Set",
    "No Order Set",
  ]);
}

{
  // customerCatalogueLabel normalization of names and the saved current value.
  const groups = resolveGroupedOutfitTypeOptions({
    businessSettings: {
      outfitTypes: [
        outfitEntry("k", "Kaftan", "male", 1),
        outfitEntry("s", "  Senator Set  ", "male", 2),
      ],
    },
    fallbackOutfitTypes: defaultOutfitTypes,
    currentValue: "  Knicker  ",
  });
  const labels = allOptionLabels(groups);
  assert.equal(
    labels.some((label) => BANNED_OUTFIT_LABEL.test(label)),
    false,
    `Normalized labels must not contain Kaftan/Knicker: ${labels.join(", ")}`,
  );
  assert.ok(labels.includes("Senator Set"));
  assert.equal(labels.every((label) => label === label.trim()), true);
}

{
  // Cross-bucket, case-insensitive deduplication: no label may appear twice.
  const groups = resolveGroupedOutfitTypeOptions({
    businessSettings: {
      outfitTypes: [
        outfitEntry("m1", "Senator Set", "male", 1),
        outfitEntry("m2", "senator set", "male", 2),
        outfitEntry("u1", "SENATOR SET", "unisex", 3),
        outfitEntry("f1", "Senator Set", "female", 4),
        outfitEntry("f2", "Boubou", "female", 5),
        outfitEntry("c1", "boubou", "couple", 6),
        outfitEntry("fa1", "Family Collection", "family", 7),
        outfitEntry("o1", "family collection", "mystery", 8),
        outfitEntry("o2", "Custom Robe", undefined, 9),
      ],
    },
    fallbackOutfitTypes: defaultOutfitTypes,
    currentValue: "BOUBOU",
  });
  const lowerLabels = allOptionLabels(groups).map((label) => label.toLowerCase());
  assert.equal(new Set(lowerLabels).size, lowerLabels.length);
  assert.deepEqual(groups, [
    { label: "Menswear", options: ["Senator Set"] },
    { label: "Womenswear", options: ["Boubou"] },
    { label: "Couple & Family", options: ["Family Collection"] },
    { label: "Other / Saved", options: ["Custom Robe"] },
  ]);
}

{
  // Gender-first bucket ordering (selectedGender is trimmed + lowercased).
  const outfitTypes = [
    outfitEntry("m", "Senator Set", "male", 1),
    outfitEntry("f", "Long Dress", "female", 2),
    outfitEntry("c", "Couple Collection", "couple", 3),
    outfitEntry("fa", "Family Collection", "family", 4),
    outfitEntry("o", "Mystery Outfit", "other-gender", 5),
  ];
  const orderFor = (selectedGender?: string) =>
    groupLabels(
      resolveGroupedOutfitTypeOptions({
        businessSettings: { outfitTypes },
        fallbackOutfitTypes: defaultOutfitTypes,
        selectedGender,
      }),
    );
  const base = ["Menswear", "Womenswear", "Couple & Family", "Other / Saved"];
  assert.deepEqual(orderFor("male"), base);
  assert.deepEqual(orderFor(undefined), base);
  assert.deepEqual(orderFor("unisex"), base);
  assert.deepEqual(orderFor("female"), [
    "Womenswear",
    "Menswear",
    "Couple & Family",
    "Other / Saved",
  ]);
  assert.deepEqual(orderFor("  Female "), orderFor("female"));
  const coupleFirst = ["Couple & Family", "Menswear", "Womenswear", "Other / Saved"];
  assert.deepEqual(orderFor("couple"), coupleFirst);
  assert.deepEqual(orderFor("family"), coupleFirst);
  assert.deepEqual(orderFor("FAMILY"), coupleFirst);
  assert.deepEqual(orderFor("alien"), base);
}

{
  // "Other / Saved" preserves legacy/disabled saved values (e.g. Agbada) and
  // enabled entries whose gender is unknown/missing.
  const defaultsGroups = resolveGroupedOutfitTypeOptions({
    businessSettings: { outfitTypes: [] },
    fallbackOutfitTypes: defaultOutfitTypes,
    selectedGender: "male",
    currentValue: "Agbada",
  });
  const agbadaDefault = defaultOutfitTypes.find((entry) => entry.name === "Agbada");
  assert.equal(agbadaDefault?.enabled, false, "Agbada is disabled by default.");
  const otherBucket = defaultsGroups.find((group) => group.label === "Other / Saved");
  assert.deepEqual(otherBucket?.options, ["Agbada"]);
  assert.equal(
    allOptionLabels(defaultsGroups).filter((label) => label === "Agbada").length,
    1,
  );

  const legacyGroups = resolveGroupedOutfitTypeOptions({
    businessSettings: {
      outfitTypes: [
        outfitEntry("m", "Senator Set", "male", 1),
        outfitEntry("ag", "Agbada", "male", 2, false),
        outfitEntry("u1", "Legacy Wrapper", undefined, 3),
        outfitEntry("u2", "Ceremonial Robe", "ceremonial", 4),
      ],
    },
    fallbackOutfitTypes: defaultOutfitTypes,
    currentValue: "Agbada",
  });
  assert.deepEqual(legacyGroups, [
    { label: "Menswear", options: ["Senator Set"] },
    {
      label: "Other / Saved",
      options: ["Legacy Wrapper", "Ceremonial Robe", "Agbada"],
    },
  ]);

  // A saved value already offered in an earlier bucket is not repeated.
  const alreadyOffered = resolveGroupedOutfitTypeOptions({
    businessSettings: { outfitTypes: [] },
    fallbackOutfitTypes: defaultOutfitTypes,
    currentValue: "senator set",
  });
  assert.equal(
    alreadyOffered.some((group) => group.label === "Other / Saved"),
    false,
  );
}

{
  // getDefaultOutfitTypeForGender canonical defaults against the real defaults.
  const settings = { outfitTypes: [] };
  assert.equal(DEFAULT_ADMIN_STYLE_OUTFIT_TYPE, "Senator Set");
  assert.equal(
    getDefaultOutfitTypeForGender("female", settings, defaultOutfitTypes),
    "Long Dress",
  );
  assert.equal(
    getDefaultOutfitTypeForGender("couple", settings, defaultOutfitTypes),
    "Couple Collection",
  );
  assert.equal(
    getDefaultOutfitTypeForGender("family", settings, defaultOutfitTypes),
    "Family Collection",
  );
  assert.equal(
    getDefaultOutfitTypeForGender("male", settings, defaultOutfitTypes),
    "Senator Set",
  );
  assert.equal(
    getDefaultOutfitTypeForGender("unisex", settings, defaultOutfitTypes),
    "Senator Set",
  );
  assert.equal(
    getDefaultOutfitTypeForGender(undefined, settings, defaultOutfitTypes),
    "Senator Set",
  );
  assert.equal(
    getDefaultOutfitTypeForGender(" Female ", settings, defaultOutfitTypes),
    "Long Dress",
  );

  // Canonical default is matched case-insensitively.
  assert.equal(
    getDefaultOutfitTypeForGender(
      "female",
      {
        outfitTypes: [
          outfitEntry("mg", "Maxi Gown", "female", 1),
          outfitEntry("ld", "long dress", "female", 2),
        ],
      },
      defaultOutfitTypes,
    ),
    "Long Dress",
  );
  // Falls back to the first enabled entry in the gender group.
  assert.equal(
    getDefaultOutfitTypeForGender(
      "female",
      {
        outfitTypes: [
          outfitEntry("ld", "Long Dress", "female", 1, false),
          outfitEntry("mg", "Maxi Gown", "female", 3),
          outfitEntry("b", "Boubou", "female", 2),
        ],
      },
      defaultOutfitTypes,
    ),
    "Boubou",
  );
  // Finally falls back to the canonical default string.
  assert.equal(
    getDefaultOutfitTypeForGender(
      "couple",
      { outfitTypes: [outfitEntry("m", "Trouser", "male", 1)] },
      defaultOutfitTypes,
    ),
    "Couple Collection",
  );
  assert.equal(
    getDefaultOutfitTypeForGender(
      "male",
      { outfitTypes: [outfitEntry("f", "Boubou", "female", 1)] },
      defaultOutfitTypes,
    ),
    "Senator Set",
  );
}

{
  // Zero Kaftan/Knicker labels in the defaults and the resolved output.
  const defaultNames = defaultOutfitTypes.map((entry) => entry.name);
  assert.ok(defaultNames.length > 0);
  assert.deepEqual(
    defaultNames.filter((name) => BANNED_OUTFIT_LABEL.test(name)),
    [],
  );
  for (const selectedGender of ["male", "female", "couple", "family", "unisex"]) {
    const labels = allOptionLabels(
      resolveGroupedOutfitTypeOptions({
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
        fallbackOutfitTypes: defaultOutfitTypes,
        selectedGender,
        currentValue: "Agbada",
      }),
    );
    assert.deepEqual(
      labels.filter((label) => BANNED_OUTFIT_LABEL.test(label)),
      [],
    );
    const lower = labels.map((label) => label.toLowerCase());
    assert.equal(new Set(lower).size, lower.length);
  }
}

console.log(
  "PASS: resolveGroupedOutfitTypeOptions grouping/dedupe/ordering/Other-Saved and getDefaultOutfitTypeForGender defaults",
);

console.log(
  "PASS: Add Design Style Admin UI defaults, zero-drift unchanged save, derived featuresMaleAndFemale, and styleApplicability controls",
);
