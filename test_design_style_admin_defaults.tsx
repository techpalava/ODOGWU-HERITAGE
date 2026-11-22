import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { getFabricGarmentLabel } from "./src/engine/FabricCapacityEngine";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { useAppStore } from "./src/store/useAppStore";
import type { Customer, StyleCategory } from "./src/types";
import { resolveStyleApplicability } from "./src/utils/designStudioFutureDesignStyle";
import {
  ADAPTABLE_DESIGN_STYLE_GARMENT_TYPES,
  deriveFeaturesMaleAndFemale,
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
const originalStoreState = useAppStore.getState();
let renderer: ReturnType<typeof create> | undefined;

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
  const categoriesInput = renderer!.root.findByProps({
    "aria-label": "Design Categories",
  });

  await act(async () => {
    nameInput.props.onChange({ target: { value: "Emerald Collar Test Shirt" } });
  });
  await act(async () => {
    categoriesInput.props.onChange({
      target: { value: "Standard Length Shirt, Short Sleeve" },
    });
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

  await openFirstStyleInList();
  await act(async () => {
    renderer!.root
      .findByProps({ "aria-label": "Style Applicability Mode" })
      .props.onChange({ target: { value: "exact_only" } });
  });
  await submitStyleForm();
  assert.deepEqual(committedRecord.eligibility.adaptability, {
    mode: "exact_only",
    garmentTypes: [],
    demographics: [],
  });
} finally {
  await act(async () => renderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  DesignStyleAuthorityService.publish = originalPublish;
  useAppStore.setState(originalStoreState);
}

console.log(
  "PASS: Add Design Style Admin UI defaults, zero-drift unchanged save, derived featuresMaleAndFemale, and styleApplicability controls",
);
