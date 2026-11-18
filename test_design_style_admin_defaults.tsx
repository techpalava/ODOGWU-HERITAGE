import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { useAppStore } from "./src/store/useAppStore";
import type { Customer } from "./src/types";
import type { AuthoritativeDesignStyleRecordV1 } from "./src/utils/designStyleAuthority";
import { parseAuthoritativeDesignStyleRecord } from "./src/utils/designStyleAuthority";
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
  (snapshot: { styles: never[]; diagnostics: never[] }) => void
>();

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
    assert.equal(expectedPublicRevision, 0);
    committedRecord = record;
  },
  canDeleteSupersededImage: async () => false,
  deleteImage: async () => undefined,
};

const originalSubscribe = DesignStyleAuthorityService.subscribeToAdminRecords;
const originalPublish = DesignStyleAuthorityService.publish;
const originalStoreState = useAppStore.getState();
let renderer: ReturnType<typeof create> | undefined;

try {
  DesignStyleAuthorityService.subscribeToAdminRecords = ((onSnapshot) => {
    subscribers.add(onSnapshot as never);
    onSnapshot({ styles: [], diagnostics: [] });
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
  const compositionSelect = renderer!.root.findByProps({
    "aria-label": "Garment Composition",
  });
  const fabricSelect = renderer!.root.findByProps({
    "aria-label": "Style Fabric Category",
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
  assert.equal(compositionSelect.props.value, "Shirt Only");
  assert.equal(fabricSelect.props.value, "HiTarget Ankara");
  assert.equal(cuffCheckbox.props.checked, false);
  assert.equal(embroiderySelect.props.value, "standard");
  assert.equal(wearerCheckbox.props.checked, false);

  const visibleOptionTexts = [
    ...outfitSelect.findAllByType("option"),
    ...compositionSelect.findAllByType("option"),
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
  const optionsInput = renderer!.root.findByProps({
    "aria-label": "Style Feature Options",
  });

  await act(async () => {
    nameInput.props.onChange({ target: { value: "Emerald Collar Test Shirt" } });
  });
  await act(async () => {
    categoriesInput.props.onChange({
      target: { value: "Standard Length Shirt, Short Sleeve" },
    });
  });
  await act(async () => {
    optionsInput.props.onChange({
      target: { value: "Mandarin Collar, Short Sleeve" },
    });
  });

  const form = renderer!.root
    .findAllByType("form")
    .find((candidate) =>
      candidate.findAllByProps({ "aria-label": "Collection Audience" }).length > 0,
    );
  assert.ok(form, "Style creation form must be mounted.");

  await act(async () => {
    await form.props.onSubmit({ preventDefault: () => undefined });
  });

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
  assert.deepEqual(committedRecord.presentation.options, [
    "Mandarin Collar",
    "Short Sleeve",
  ]);
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
} finally {
  await act(async () => renderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  DesignStyleAuthorityService.publish = originalPublish;
  useAppStore.setState(originalStoreState);
}

console.log(
  "PASS: Add Design Style Admin UI initializes and submits uniform standardized defaults",
);
