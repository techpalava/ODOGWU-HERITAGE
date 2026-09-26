import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DatabaseView from "./src/components/DatabaseView";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { DesignStyleAuthorityService } from "./src/services/designStyleAuthorityService";
import { useAppStore } from "./src/store/useAppStore";
import type { ConstructionDetail, Customer, StyleCategory } from "./src/types";
import {
  parseAuthoritativeDesignStyleRecord,
  prepareAuthoritativeDesignStyleRecord,
  projectDesignStyleRecordForAdmin,
} from "./src/utils/designStyleAuthority";
import {
  publishDesignStyleWithDependencies,
  type DesignStylePublicationDependencies,
  type PublishDesignStyleInput,
} from "./src/utils/designStylePublication";
import {
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
} from "./src/utils/decorativePricing";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const style = (
  constructionDetails: ConstructionDetail[],
): StyleCategory => ({
  id: "ODG-042",
  name: "Historical Override Style",
  description: "A historical Design Style with active price overrides.",
  gender: "unisex",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")],
  customDetailConfig: {
    representedGenders: ["male", "female"],
    featuresMaleAndFemale: true,
    supportedGarmentGroups: ["shirt"],
    requiredSelectionGroups: ["shirt_construction"],
    enabled: true,
  },
  styleApplicability: { mode: "exact_only" },
  constructionDetails,
});

const referenceComposition = { status: "known", garmentTypes: ["shirt"] } as const;
const historicalDetails: ConstructionDetail[] = [
  { type: "embroideryDesign", code: "Name Monogram", price: 14.5 },
  { type: "accessories", code: "Traditional Hat", price: 18 },
  { type: "retired_metadata", code: "Preserved only", price: 99 },
];
const historicalRecord = prepareAuthoritativeDesignStyleRecord({
  style: style(historicalDetails),
  lifecycle: "published",
  displayOrder: 2,
  referenceComposition,
  currentRecord: null,
});

assert.equal(
  parseAuthoritativeDesignStyleRecord(historicalRecord.id, historicalRecord).status,
  "valid",
  "Historical construction details must remain readable.",
);
let committedRecord = historicalRecord;
const publicationInputs: PublishDesignStyleInput[] = [];
const subscribers = new Set<(snapshot: {
  styles: ReturnType<typeof projectDesignStyleRecordForAdmin>[];
  diagnostics: [];
}) => void>();
const emitAdminSnapshot = () => {
  const snapshot = {
    styles: [projectDesignStyleRecordForAdmin(committedRecord)],
    diagnostics: [] as [],
  };
  subscribers.forEach((subscriber) => subscriber(snapshot));
};
const persistence: DesignStylePublicationDependencies = {
  readCurrent: async () => ({
    record: committedRecord,
    legacyMigrationAllowed: false,
    currentImage: committedRecord.presentation.image,
  }),
  uploadReplacementImage: async () => {
    throw new Error("This regression does not replace the historical image.");
  },
  commitAuthoritativeRecord: async ({ record, expectedPublicRevision }) => {
    assert.equal(expectedPublicRevision, committedRecord.publicRevision);
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

const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string"
    ? node
    : node.children
        .map((child) => textContent(child as ReactTestInstance | string))
        .join("");

const findButton = (label: string) => {
  const buttons = renderer?.root.findAllByType("button") || [];
  const button = buttons.find((candidate) => textContent(candidate).trim() === label);
  assert.ok(
    button,
    `Expected button: ${label}; available: ${buttons.map(textContent).join(" | ")}`,
  );
  return button;
};

const openHistoricalStyle = async () => {
  await act(async () => {
    findButton("Edit Garment Option").props.onClick();
  });
};

const submitStyleForm = async () => {
  const form = renderer?.root.findAllByType("form").find((candidate) =>
    candidate.findAllByProps({
      "aria-label": "Custom price for Name Monogram",
    }).length > 0,
  );
  assert.ok(form, "The real Admin Design Style form must be open.");
  await act(async () => {
    await form.props.onSubmit({ preventDefault: () => undefined });
  });
};

try {
  DesignStyleAuthorityService.subscribeToAdminRecords = ((onSnapshot) => {
    subscribers.add(onSnapshot);
    emitAdminSnapshot();
    return () => subscribers.delete(onSnapshot);
  }) as typeof DesignStyleAuthorityService.subscribeToAdminRecords;
  DesignStyleAuthorityService.publish = (async (input) => {
    publicationInputs.push(input);
    return publishDesignStyleWithDependencies(input, persistence);
  }) as typeof DesignStyleAuthorityService.publish;

  useAppStore.setState({
    currentUser: {
      name: "Regression Administrator",
      email: "techpalavabox@gmail.com",
      phone: "+234000000000",
    } satisfies Customer,
    referenceData: [],
    customDetailCatalog: [],
  });

  const noStateUpdate = () => undefined;
  await act(async () => {
    renderer = create(
      createElement(DatabaseView, {
        customers: [],
        setCustomers: noStateUpdate,
        styles: [],
        setStyles: noStateUpdate,
        fabrics: [],
        setFabrics: noStateUpdate,
        customGroups: [],
        setCustomGroups: noStateUpdate,
        orders: [],
        setOrders: noStateUpdate,
        batches: [],
        setBatches: noStateUpdate,
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
        setBusinessSettings: noStateUpdate,
        initialTab: "styles",
      }),
    );
  });

  await openHistoricalStyle();
  const includedDecorativeFeatureLabels = renderer.root
    .findAllByType("label")
    .map((candidate) => textContent(candidate).trim());
  assert.ok(
    includedDecorativeFeatureLabels.some((label) =>
      label.includes("Name Monogram"),
    ),
    "The existing Included Decorative Features Name Monogram control remains mounted.",
  );
  assert.ok(
    includedDecorativeFeatureLabels.some((label) => label.includes("Embroidery")),
    "The existing Included Decorative Features Embroidery control remains mounted.",
  );
  for (const featureName of ["Lining", "Net"]) {
    const featureLabel = renderer.root
      .findAllByType("label")
      .find((candidate) => textContent(candidate).trim() === featureName);
    assert.ok(featureLabel, `${featureName} is on the Included Decorative Features form.`);
    assert.equal(featureLabel.findByType("input").props.checked, false);
  }
  const firstMonogramInput = renderer.root.findByProps({
    "aria-label": "Custom price for Name Monogram",
  });
  assert.equal(firstMonogramInput.props.value, 14.5);
  assert.equal(
    renderer.root.findByProps({
      "aria-label": "Custom price for Traditional Hat",
    }).props.value,
    18,
  );

  await act(async () => {
    firstMonogramInput.props.onChange({ target: { value: "19.75" } });
  });
  await submitStyleForm();

  assert.equal(publicationInputs.length, 1, "The Admin form must invoke publication once.");
  assert.equal(publicationInputs[0]?.style.id, "ODG-042");
  assert.equal(publicationInputs[0]?.lifecycle, "published");
  assert.equal(committedRecord.id, "ODG-042");
  assert.equal(committedRecord.lifecycle, "published");
  assert.deepEqual(
    committedRecord.presentation.constructionDetails.find(
      (detail) =>
        detail.type === "embroideryDesign" && detail.code === "Name Monogram",
    ),
    { type: "embroideryDesign", code: "Name Monogram", price: 19.75 },
  );
  assert.deepEqual(
    committedRecord.presentation.constructionDetails.find(
      (detail) => detail.type === "accessories" && detail.code === "Traditional Hat",
    ),
    historicalDetails[1],
  );
  assert.deepEqual(
    committedRecord.presentation.constructionDetails.find(
      (detail) => detail.type === "retired_metadata",
    ),
    historicalDetails[2],
  );

  await act(async () => renderer?.unmount());
  renderer = undefined;
  await act(async () => {
    renderer = create(
      createElement(DatabaseView, {
        customers: [],
        setCustomers: noStateUpdate,
        styles: [],
        setStyles: noStateUpdate,
        fabrics: [],
        setFabrics: noStateUpdate,
        customGroups: [],
        setCustomGroups: noStateUpdate,
        orders: [],
        setOrders: noStateUpdate,
        batches: [],
        setBatches: noStateUpdate,
        businessSettings: DEFAULT_BUSINESS_SETTINGS,
        setBusinessSettings: noStateUpdate,
        initialTab: "styles",
      }),
    );
  });
  await openHistoricalStyle();

  const reopened = projectDesignStyleRecordForAdmin(committedRecord);
  assert.equal(reopened.id, "ODG-042");
  assert.equal(reopened.designStyleAuthority.lifecycle, "published");
  assert.equal(
    renderer.root.findByProps({
      "aria-label": "Custom price for Name Monogram",
    }).props.value,
    19.75,
    "The reopened Admin form must show the saved Name Monogram price.",
  );
  assert.equal(
    renderer.root.findByProps({
      "aria-label": "Custom price for Traditional Hat",
    }).props.value,
    18,
    "The reopened Admin form must show the preserved Traditional Hat price.",
  );
  assert.deepEqual(reopened.constructionDetails?.find(
    (detail) => detail.type === "retired_metadata",
  ), historicalDetails[2]);
  assert.equal(getDecorativeFeaturePrice(reopened, "Name Monogram"), 19.75);
  assert.equal(getTraditionalAccessoryPrice(reopened, "Traditional Hat"), 18);
} finally {
  await act(async () => renderer?.unmount());
  DesignStyleAuthorityService.subscribeToAdminRecords = originalSubscribe;
  DesignStyleAuthorityService.publish = originalPublish;
  useAppStore.setState(originalStoreState);
}

console.log(
  "PASS: real Admin override edit, publication, reload, reopen, and pricing regression",
);
