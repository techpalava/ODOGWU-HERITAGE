import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import type { AuthenticatedFutureDraftRepository } from "./src/services/authenticatedFutureDraftService";
import { auth } from "./src/services/firebase";
import type { PersistFutureOrderV2ClientResult } from "./src/services/futureOrderV2Persistence";
import type { FutureOrderV2PaymentRecordResult } from "./src/services/futureOrderV2PaymentRecordClient";
import { GuestOrderSessionService } from "./src/services/guestOrderSessionService";
import { retireStudioFutureDesignDraft } from "./src/services/retirePaidStudioDraft";
import { useAppStore } from "./src/store/useAppStore";
import type { DesignStudioStageId, GuestDesignDraft } from "./src/types";
import { FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE } from "./src/utils/designStudioDraftPersistence";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import {
  createFutureOrderV2PaymentReviewHandoff,
  type FutureOrderV2PaymentReviewHandoff,
} from "./src/utils/designStudioFuturePaymentReview";
import type { FutureOrderCandidateV2BuildResult } from "./src/utils/futureOrderCandidate";
import type { FutureOrderV2PaymentAuthorizationResult } from "./src/utils/futureOrderV2Payment";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const OWNER_UID = "one-click-owner";
const mutableAuth = auth as unknown as {
  currentUser: unknown;
  notifyAuthListeners(): void;
};
mutableAuth.currentUser = {
  uid: OWNER_UID,
  email: "one-click-owner@example.test",
  isAnonymous: false,
};
mutableAuth.notifyAuthListeners();

useAppStore.setState({
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  isLoadingData: false,
  stylesLoadState: "ready",
  customDetailCatalog: [],
  customGroups: [],
  customGroupAccessById: {},
  batches: [],
});

type Actions = {
  seedPaymentReview: (handoff: FutureOrderV2PaymentReviewHandoff) => void;
  pay: () => Promise<void>;
};

const text = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : text(child)))
    .join("");

const mountStudio = async (
  orderId: string,
  authorizeResults: FutureOrderV2PaymentAuthorizationResult[],
) => {
  const masterOrder = createFutureOrderV2Fixture(orderId);
  const candidate = masterOrder.cartItem.candidate;
  const persisted = createPersistedFutureOrderV2({
    masterOrder,
    owner: { uid: OWNER_UID, isAnonymous: false },
    customerOwnerUid: OWNER_UID,
    persistedAt: "2026-09-30T00:00:00.000Z",
  });
  if (persisted.status !== "valid") throw new Error("Expected a valid persistence fixture.");
  const calls = { persist: 0, authorize: 0, record: 0 };
  const recordedOrderIds: string[] = [];
  const clearedRevisions: Array<number | null> = [];
  const futureDraftRepository = {
    async clear(expectedRevision: number | null) {
      clearedRevisions.push(expectedRevision);
      return {
        status: "saved" as const,
        record: {
          schemaVersion: 1 as const,
          lifecycleStatus: "cleared" as const,
          revision: (expectedRevision ?? 0) + 1,
          createdAt: "2026-09-30T00:00:00.000Z",
          updatedAt: "2026-09-30T10:00:00.000Z",
        },
      };
    },
  } as AuthenticatedFutureDraftRepository;
  let actions: Actions | undefined;
  let studio!: ReturnType<typeof create>;
  await act(async () => {
    studio = create(
      createElement(DesignStudioView, {
        onAddToCart: () => undefined,
        openCartDrawer: () => undefined,
        currentUser: {
          name: "One Click",
          email: "one-click-owner@example.test",
          ownerUid: OWNER_UID,
        },
        styles: [],
        fabrics: [],
        futureDraftRepository,
        futureOrderV2TestHooks: {
          buildCurrentCandidate: () =>
            ({ status: "valid", candidate, blockers: [] }) satisfies FutureOrderCandidateV2BuildResult,
          persist: async (): Promise<PersistFutureOrderV2ClientResult> => {
            calls.persist += 1;
            return { status: "created", value: persisted.value };
          },
          authorizePayment: async () => {
            const result = authorizeResults[calls.authorize];
            calls.authorize += 1;
            return result;
          },
          recordPayment: async ({ orderId: recordedOrderId, paymentIntentId }): Promise<FutureOrderV2PaymentRecordResult> => {
            calls.record += 1;
            recordedOrderIds.push(recordedOrderId);
            return {
              status: "recorded",
              record: {
                schemaVersion: 1,
                orderId: recordedOrderId,
                ownerUid: OWNER_UID,
                paymentIntentId,
                amountCents: 14000,
                currency: "eur",
                status: "succeeded",
                testMode: true,
                recordedAt: "2026-09-30T10:00:00.000Z",
              },
            };
          },
          onActions: (next) => {
            actions = next;
          },
        },
      }),
    );
    await Promise.resolve();
  });
  assert.ok(actions, "Mounted Studio exposes the one-click pay handler.");
  await act(async () => {
    actions!.seedPaymentReview(createFutureOrderV2PaymentReviewHandoff(candidate));
    await Promise.resolve();
  });
  const payButtons = () =>
    studio.root.findAll(
      (node) => node.type === "button" && node.props["data-future-order-v2-pay"] === true,
    );
  const pay = async () => {
    await act(async () => {
      await actions!.pay();
      await Promise.resolve();
    });
  };
  return { studio, calls, recordedOrderIds, clearedRevisions, payButtons, pay };
};

const oneClick = await mountStudio("one-click-fixture", [
  { status: "authorized", providerTransactionReference: "pi_one_click_123" },
]);
assert.equal(oneClick.payButtons().length, 1, "the unsaved order offers exactly one Pay button");
assert.match(text(oneClick.payButtons()[0]), /^Pay €\d+\.\d{2}$/);
await oneClick.pay();
assert.deepEqual(
  oneClick.calls,
  { persist: 1, authorize: 1, record: 1 },
  "one click saves the order, charges the card and records the payment",
);
const confirmed = text(oneClick.studio.root);
assert.ok(confirmed.includes("Order confirmed"));
assert.match(oneClick.recordedOrderIds[0], /^future-order-/);
assert.equal(
  text(oneClick.studio.root.findByProps({ "data-future-order-v2-confirmed-order-id": true })),
  oneClick.recordedOrderIds[0],
  "the confirmation shows the order the payment was recorded against",
);
assert.ok(confirmed.includes("pi_one_click_123"));
assert.equal(oneClick.payButtons().length, 0, "a confirmed order cannot be paid again");
assert.deepEqual(
  oneClick.clearedRevisions,
  [null],
  "a recorded Pay now handoff clears the authenticated Studio draft",
);
await act(async () => oneClick.studio.unmount());

const declined = await mountStudio("declined-fixture", [
  { status: "failed", message: "Your card was declined." },
  { status: "authorized", providerTransactionReference: "pi_retry_456" },
]);
await declined.pay();
assert.deepEqual(declined.calls, { persist: 1, authorize: 1, record: 0 });
assert.deepEqual(
  declined.clearedRevisions,
  [],
  "a declined card leaves the Studio draft in place",
);
assert.ok(text(declined.studio.root).includes("Your card was declined."));
assert.equal(declined.payButtons().length, 1, "a declined card leaves the Pay button available");
assert.match(text(declined.payButtons()[0]), /^Pay €\d+\.\d{2}$/);
await declined.pay();
assert.deepEqual(
  declined.calls,
  { persist: 1, authorize: 2, record: 1 },
  "retrying the payment reuses the saved order instead of saving it again",
);
assert.ok(text(declined.studio.root).includes("Order confirmed"));
assert.deepEqual(
  declined.clearedRevisions,
  [null],
  "retrying until the payment is recorded retires the Studio draft once",
);
await act(async () => declined.studio.unmount());

const studioSource = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const parkStart = studioSource.indexOf("const handleParkFutureOrderV2InCart");
const parkEnd = studioSource.indexOf("const handleStartAnotherOrderAfterCartPark");
const parkBody = studioSource.slice(parkStart, parkEnd);
assert.equal(parkStart > 0 && parkEnd > parkStart, true);
assert.equal(
  parkBody.includes("retireStudioFutureDesignDraft") ||
    parkBody.includes("retireCurrentStudioDraft") ||
    parkBody.includes("clearFutureDesignDraft"),
  false,
  "Add to cart keeps the parked Studio draft",
);
assert.match(
  studioSource.slice(
    studioSource.indexOf("if (result.status === \"recorded\")"),
    studioSource.indexOf("const retireCurrentStudioDraft"),
  ),
  /retireCurrentStudioDraft\(\)/,
);
assert.match(studioSource, /handleStartAnotherOrderAfterCartPark = \(\) => \{\s*retireCurrentStudioDraft\(\)/);
assert.match(studioSource, /invalidateFutureGarmentRemovalRetention\(\);\s*retireCurrentStudioDraft\(\)/);
assert.match(
  readFileSync("src/components/FutureOrderV2CartPayPanel.tsx", "utf8"),
  /recorded\.status !== "recorded"[\s\S]*retireStudioFutureDesignDraft\(\)/,
);
assert.match(
  readFileSync("src/components/DashboardView.tsx", "utf8"),
  /result\.status === "recorded"[\s\S]*retireStudioFutureDesignDraft\(\)/,
);

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  clear(): void {
    this.values.clear();
  }
}

const browserStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: browserStorage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: browserStorage,
    location: { search: "", href: "https://example.test/" },
    scrollY: 0,
    history: { replaceState() {} },
  },
});

const parkedDraft = {
  journeySchemaVersion: 1,
  currentStageId: "personalized_additions" satisfies DesignStudioStageId,
  currentStep: 5,
  garmentTypeSelection: {
    garmentTypes: ["shirt"],
    demographic: "male",
    constructionByGarment: {
      shirt: {
        status: "resolved",
        garmentType: "shirt",
        components: [],
        totalPriceCents: 6500,
        totalPrice: 65,
      },
    },
  },
  aiTryOnWorkflow: {
    schemaVersion: 1,
    status: "skipped",
    inputFingerprint: null,
  },
  futureMeasurementState: {
    schemaVersion: 1,
    route: "low_risk",
    unit: "inch",
    entered: { shared: {}, byGarmentKey: {} },
    derived: { shared: {}, byGarmentKey: {} },
    blueprintVersion: "measurement-blueprint-v1",
    formulaVersion: null,
    inputFingerprint: "measurement-input-v1",
    calculationStatus: "complete",
    diagnostics: [],
    invalidInputKeys: [],
  },
  selectedFabricCode: "FABRIC-A",
  selectedStyleId: "STYLE-A",
  selectedGarment: null,
  designSelections: { accessories: [] },
  measurements: {
    height: 180,
    weight: 80,
    age: 40,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 16,
    shoulder: 18,
    chest: 40,
    waist: 34,
    hip: 40,
    sleeve: 25,
    trouserLength: 42,
    isAiEstimated: false,
    unit: "inch",
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
  customerName: "Future Customer",
  customerEmail: "future@example.com",
  customerPhone: "+31000000000",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: 1,
  specialInstructions: "",
  leftoverFabricChoice: "return",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 4,
    fabricSewingCost: 4.06,
    constructionSewingCost: 65,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 131.25,
    eindhovenToDestinationShipping: null,
    total: 200.31,
  },
  shippingSnapshot: {},
  fabricAllocations: [
    {
      allocationId: "allocation-1",
      fabricCode: "FABRIC-A",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "SHIRT",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
  ],
  updatedAt: "2026-08-15T10:00:00.000Z",
} as GuestDesignDraft;

const savedDraft = GuestOrderSessionService.saveFutureDesignDraft(parkedDraft);
assert.equal(savedDraft?.status, "saved", "the step 5 draft can be stored locally");
assert.equal(
  GuestOrderSessionService.getFutureDesignDraft()?.currentStageId,
  "personalized_additions",
);
useAppStore.setState({
  studioParkedInFutureOrderV2Cart: true,
  futureOrderV2CartItems: [
    {
      schemaVersion: 2,
      cartItemId: "future-cart-paid",
      candidate: createFutureOrderV2Fixture("draft-retire").cartItem.candidate,
    },
  ],
});
const cloudClears: Array<number | null> = [];
await retireStudioFutureDesignDraft({
  expectedRevision: null,
  repository: {
    async clear(expectedRevision: number | null) {
      cloudClears.push(expectedRevision);
      if (expectedRevision === null) {
        return {
          status: "conflict" as const,
          record: null,
          currentRecord: {
            schemaVersion: 1 as const,
            lifecycleStatus: "active" as const,
            revision: 4,
            createdAt: "2026-09-30T00:00:00.000Z",
            updatedAt: "2026-09-30T00:00:00.000Z",
            draft: parkedDraft,
          },
        };
      }
      return {
        status: "saved" as const,
        record: {
          schemaVersion: 1 as const,
          lifecycleStatus: "cleared" as const,
          revision: expectedRevision + 1,
          createdAt: "2026-09-30T00:00:00.000Z",
          updatedAt: "2026-09-30T10:00:00.000Z",
        },
      };
    },
  },
});
assert.deepEqual(
  cloudClears,
  [null, 4],
  "cloud clear uses null, then the existing revision when that conflicts",
);
assert.equal(GuestOrderSessionService.getFutureDesignDraft(), null);
assert.equal(GuestOrderSessionService.inspectFutureDesignDraft().status, "empty");
assert.equal(browserStorage.getItem(FUTURE_DESIGN_STUDIO_DRAFT_V1_NAMESPACE), null);
assert.equal(useAppStore.getState().studioParkedInFutureOrderV2Cart, false);

console.log("One-click V2 pay tests passed.");
process.exit(0);
