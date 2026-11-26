import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import AccessoriesView, {
  buildAccessoryWhatsappInquiryUrl,
} from "./src/components/AccessoriesView";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import {
  SHOW_STUDIO_TRADITIONAL_ACCESSORIES,
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
  calculateGarmentDetailsPrice,
  getTraditionalAccessoryPrice,
  resolveShowStudioTraditionalAccessories,
} from "./src/utils/decorativePricing";
import { TRADITIONAL_ACCESSORY_IMAGES } from "./src/utils/traditionalAccessoryImages";
import { FUTURE_PICKUP_ATELIER_WHATSAPP_URL } from "./src/utils/designStudioFutureShipping";
import {
  clearHiddenStudioTraditionalAccessories,
  projectActiveCustomerDesignSelections,
} from "./src/utils/customerAvailableDesignSelections";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";
import { createCatalogDesignSource } from "./src/utils/designSourceState";
import { DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION } from "./src/utils/designSourceJourney";
import { createDesignStudioDraftRepository } from "./src/utils/designStudioDraftPersistence";
import type { GuestDesignDraft } from "./src/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

// 1. Reversible feature flag defaults to false and honors explicit overrides.
assert.equal(SHOW_STUDIO_TRADITIONAL_ACCESSORIES, false);
assert.equal(resolveShowStudioTraditionalAccessories(), false);
assert.equal(resolveShowStudioTraditionalAccessories(false), false);
assert.equal(resolveShowStudioTraditionalAccessories(true), true);

// 2. Standalone AccessoriesView renders all 3 Traditional Accessories,
//    Matching Leather Shoes (Coming soon), separate-shipping explanation,
//    WhatsApp inquiry links, and Design Studio navigation CTA.
let studioStartClicks = 0;
let accessoriesTree!: ReturnType<typeof create>;
act(() => {
  accessoriesTree = create(
    createElement(AccessoriesView, {
      onStartTailoredOrder: () => {
        studioStartClicks += 1;
      },
    }),
  );
});

const rootText = textContent(accessoriesTree.root);
assert.ok(
  rootText.includes(
    "Heritage Accessories — Ordered separately from tailored clothes to ensure proper packaging and accurate shipping.",
  ),
  "AccessoriesView must explain separate ordering and shipping",
);
assert.equal(
  /kaftan/i.test(rootText),
  false,
  "AccessoriesView must never contain 'Kaftan' copy",
);

const seenImageSrcs = new Set<string>();
for (const accessory of TRADITIONAL_ACCESSORY_OPTIONS) {
  const card = accessoriesTree.root.findByProps({
    "data-accessory-card": accessory,
  });
  const cardText = textContent(card);
  assert.ok(cardText.includes(accessory), `${accessory} card title renders`);
  assert.ok(
    cardText.includes(TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]),
    `${accessory} description renders`,
  );

  const img = card.findByType("img");
  const expectedSrc = TRADITIONAL_ACCESSORY_IMAGES[accessory].src;
  assert.equal(img.props.src, expectedSrc);
  assert.equal(img.props.alt, accessory);
  assert.ok(expectedSrc.startsWith("/images/accessories/"));
  assert.ok(expectedSrc.endsWith(".webp"));
  seenImageSrcs.add(expectedSrc);

  const diskPath = `public${expectedSrc}`;
  assert.equal(existsSync(diskPath), true, `${diskPath} exists on disk`);
  const bytes = readFileSync(diskPath);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");

  const whatsappLink = card.findByProps({
    "data-accessory-whatsapp-link": accessory,
  });
  assert.equal(whatsappLink.type, "a");
  assert.equal(
    whatsappLink.props.href,
    buildAccessoryWhatsappInquiryUrl(accessory),
  );
  assert.ok(
    String(whatsappLink.props.href).startsWith(
      FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
    ),
  );
  assert.equal(whatsappLink.props.target, "_blank");
  assert.equal(whatsappLink.props.rel, "noopener noreferrer");
  assert.match(String(whatsappLink.props.className), /\bmin-h-11\b/);
}
assert.equal(seenImageSrcs.size, TRADITIONAL_ACCESSORY_OPTIONS.length);

// Matching Leather Shoes coming-soon card
const shoesCard = accessoriesTree.root.findByProps({
  "data-accessory-card": "Matching Leather Shoes",
});
assert.equal(shoesCard.props["data-accessory-status"], "coming-soon");
assert.ok(textContent(shoesCard).includes("Matching Leather Shoes"));
assert.match(textContent(shoesCard), /Coming soon/i);
assert.equal(
  shoesCard.findAllByType("a").length,
  0,
  "Coming soon card does not render an active order link",
);

// Page-level WhatsApp CTA and Design Studio navigation buttons
const pageWhatsappCta = accessoriesTree.root.findByProps({
  "data-accessories-whatsapp-cta": "page",
});
assert.ok(
  String(pageWhatsappCta.props.href).startsWith(
    FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
  ),
);
assert.equal(pageWhatsappCta.props.target, "_blank");
assert.equal(pageWhatsappCta.props.rel, "noopener noreferrer");
assert.match(String(pageWhatsappCta.props.className), /\bmin-h-11\b/);

const studioCta = accessoriesTree.root.findByProps({
  "data-accessories-studio-cta": "true",
});
const backToStudioCta = accessoriesTree.root.findByProps({
  "data-accessories-back-to-studio": "true",
});
act(() => {
  studioCta.props.onClick();
  backToStudioCta.props.onClick();
});
assert.equal(studioStartClicks, 2);

// Image error fallback stays graceful
const hatCard = accessoriesTree.root.findByProps({
  "data-accessory-card": "Traditional Hat",
});
act(() => {
  hatCard.findByType("img").props.onError();
});
assert.ok(
  accessoriesTree.root.findByProps({
    "data-accessory-showcase-fallback": "Traditional Hat",
  }),
);

act(() => {
  accessoriesTree.unmount();
});

// 3. Unsubmitted draft projection & normalization clear legacy accessories to []
//    so hidden accessories can never be priced in Summary, Cart, or Checkout.
const staleSelections = {
  accessories: ["Traditional Hat", "Traditional Stick"],
  decorativeFeatures: ["Name Monogram" as const],
};
const cleared = clearHiddenStudioTraditionalAccessories(staleSelections);
assert.deepEqual(cleared.accessories, []);
assert.deepEqual(cleared.decorativeFeatures, ["Name Monogram"]);

const restoredWhenFlagEnabled = clearHiddenStudioTraditionalAccessories(
  staleSelections,
  true,
);
assert.deepEqual(restoredWhenFlagEnabled.accessories, [
  "Traditional Hat",
  "Traditional Stick",
]);

const projectedDefault = projectActiveCustomerDesignSelections({
  designSelections: staleSelections,
  showAdditionalClothesCosts: true,
});
assert.deepEqual(
  projectedDefault.accessories,
  [],
  "Active customer projection clears legacy accessories even when showAdditionalClothesCosts is true",
);
assert.equal(
  calculateGarmentDetailsPrice(projectedDefault).accessories.length,
  0,
  "Cleared active draft produces zero accessory charges",
);

// Historical / already-submitted order pricing remains 100% intact.
const historicalPricing = calculateGarmentDetailsPrice(staleSelections);
assert.deepEqual(
  historicalPricing.accessories.map((item) => item.label),
  ["Traditional Hat", "Traditional Stick"],
);
assert.equal(
  historicalPricing.accessories.reduce((sum, item) => sum + item.price, 0),
  getTraditionalAccessoryPrice(null, "Traditional Hat") +
    getTraditionalAccessoryPrice(null, "Traditional Stick"),
);

// 4. Guest localStorage draft and authenticated cloud draft hydration into
//    Design Studio clear stale accessories to [] via the shared studio
//    hydration helper + active customer projection (while keeping raw draft
//    storage compatibility intact for reversible restore).
const { normalizeGuestDesignDraft } = await import(
  "./src/services/guestOrderSessionService"
);
const { normalizeAuthenticatedFutureDraft } = await import(
  "./src/services/authenticatedFutureDraftService"
);

const normalizedCatalog = normalizeCustomDetailCatalog(
  SEED_CUSTOM_DETAIL_CATALOG,
);
const garmentTypeSelection = reconcileGarmentTypeStepSelection({
  selectedGarmentTypes: ["shirt"],
  selectedDemographic: "male",
  normalizedCustomDetailCatalog: normalizedCatalog,
}).selection;
const designSource = createCatalogDesignSource("style-accessories-test");
const legacyDraftWithAccessories: GuestDesignDraft = {
  journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
  currentStageId: "personalized_additions",
  currentStep: 5,
  garmentTypeSelection,
  selectedFabricCode: "FAB-ACC-TEST",
  selectedStyleId: "style-accessories-test",
  designSource,
  confirmedStyleId: "style-accessories-test",
  confirmedDesignSourceKey: designSource.sourceKey,
  priceActivatedFabricCode: "FAB-ACC-TEST",
  selectedGarment: null,
  designSelections: {
    accessories: ["Traditional Hat", "Traditional Bead"],
    decorativeFeatures: ["Embroidery"],
  },
  measurements: {
    height: 178,
    weight: 76,
    age: 34,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 15,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 42,
    isAiEstimated: false,
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "Test Customer",
  customerEmail: "test@example.com",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "Return leftover fabric pieces with garment",
  hasLining: false,
  pricingBreakdown: {
    customDetailsPrice: 0,
    eindhovenToDestinationShipping: null,
  },
  shippingSnapshot: {},
  updatedAt: "2026-11-22T12:00:00.000Z",
};

const normalizedGuestDraft = normalizeGuestDesignDraft(
  legacyDraftWithAccessories,
);
const hydratedGuestSelections = clearHiddenStudioTraditionalAccessories(
  normalizedGuestDraft.designSelections,
);
assert.deepEqual(
  hydratedGuestSelections.accessories,
  [],
  "Design Studio hydration clears stale guest draft accessories",
);
assert.deepEqual(
  hydratedGuestSelections.decorativeFeatures,
  ["Embroidery"],
  "Design Studio hydration preserves embroidery selections",
);

const normalizedCloudResult = normalizeAuthenticatedFutureDraft(
  legacyDraftWithAccessories,
);
assert.ok(
  normalizedCloudResult.draft,
  `Cloud draft normalizer succeeds: ${normalizedCloudResult.reason}`,
);
const hydratedCloudSelections = clearHiddenStudioTraditionalAccessories(
  normalizedCloudResult.draft.designSelections,
);
assert.deepEqual(
  hydratedCloudSelections.accessories,
  [],
  "Design Studio hydration clears stale authenticated cloud draft accessories",
);
assert.deepEqual(
  hydratedCloudSelections.decorativeFeatures,
  ["Embroidery"],
  "Design Studio hydration preserves cloud embroidery selections",
);

// Draft repository hydration from guest localStorage + Design Studio hydration clears accessories
class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}
const storage = new MemoryStorage();
const repo = createDesignStudioDraftRepository({
  storage,
  legacy: { load: () => legacyDraftWithAccessories },
  normalizeDraft: normalizeGuestDesignDraft,
  legacySourceVersion: "accessories-separation-test",
  now: () => "2026-11-22T12:00:00.000Z",
});
const hydrated = repo.loadFutureDraftWithMigration();
assert.equal(hydrated.status, "loaded");
const reconciledStudioSelections = projectActiveCustomerDesignSelections({
  designSelections: clearHiddenStudioTraditionalAccessories(
    hydrated.draft.designSelections,
  ),
});
assert.deepEqual(
  reconciledStudioSelections.accessories,
  [],
  "Hydrated guest localStorage draft reconciled for Design Studio has empty accessories",
);
assert.equal(
  calculateGarmentDetailsPrice(reconciledStudioSelections).accessories.length,
  0,
  "Hydrated draft produces zero accessory charges in pricing",
);

// Verify DesignStudioView wires clearHiddenStudioTraditionalAccessories on draft hydration
const designStudioViewSource = readFileSync(
  "src/components/DesignStudioView.tsx",
  "utf8",
);
assert.ok(
  designStudioViewSource.includes("clearHiddenStudioTraditionalAccessories("),
  "DesignStudioView clears hidden studio accessories during draft hydration",
);
assert.ok(
  designStudioViewSource.includes(
    "showTraditionalAccessories: showStudioTraditionalAccessories",
  ),
  "DesignStudioView projects active selections with showTraditionalAccessories flag",
);

// 5. Source wording guardrail check: zero customer-visible "Kaftan" in new view
const accessoriesViewSource = readFileSync(
  "src/components/AccessoriesView.tsx",
  "utf8",
);
assert.equal(
  /kaftan/i.test(accessoriesViewSource),
  false,
  "AccessoriesView source must never contain 'Kaftan'",
);

console.log(
  "PASS: accessories separation (feature flag, standalone AccessoriesView, draft clearing, historical pricing intact)",
);
