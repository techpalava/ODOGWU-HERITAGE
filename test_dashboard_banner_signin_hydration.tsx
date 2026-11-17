import assert from "node:assert/strict";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { CustomerJourneyEngine } from "./src/engine/CustomerJourneyEngine";
import { StorageService } from "./src/services/storageService";
import { useAppStore } from "./src/store/useAppStore";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import type { FutureOrderV2PaymentRecord } from "./src/utils/futureOrderV2PaymentRecord";
import type { FutureOrderV2PersonalizedPriceRecord } from "./src/utils/futureOrderV2PersonalizedPrice";
import type { FutureOrderV2WorkshopProgress } from "./src/utils/futureOrderV2WorkshopProgress";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import DashboardView from "./src/components/DashboardView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

if (typeof window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: { location: { search: "", hash: "" } },
    writable: true,
    configurable: true,
  });
}

const makePersistedOrder = (orderId: string, persistedAt: string, ownerUid: string) => {
  const result = createPersistedFutureOrderV2({
    masterOrder: createFutureOrderV2Fixture(orderId),
    owner: { uid: ownerUid, isAnonymous: false },
    customerOwnerUid: ownerUid,
    persistedAt,
  });
  if (result.status !== "valid") throw new Error("Expected valid persisted V2 order.");
  return result.value;
};

const ownerUid = "banner-signin-owner";
const orders = [
  makePersistedOrder("future-order-1", "2026-09-27T12:00:00.000Z", ownerUid),
  makePersistedOrder("future-order-2", "2026-09-28T12:00:00.000Z", ownerUid),
  makePersistedOrder("future-order-3", "2026-09-29T12:00:00.000Z", ownerUid),
  makePersistedOrder("future-order-4", "2026-09-30T12:00:00.000Z", ownerUid),
];

const paidMap = new Map<string, FutureOrderV2PaymentRecord>(
  ["future-order-1", "future-order-2", "future-order-3"].map((orderId) => [
    orderId,
    {
      schemaVersion: 1,
      orderId,
      ownerUid,
      paymentIntentId: `pi_${orderId}`,
      amountCents: 14000,
      currency: "eur",
      status: "succeeded",
      testMode: true,
      recordedAt: "2026-09-30T13:00:00.000Z",
    },
  ]),
);

let emitPayments:
  | ((records: ReadonlyMap<string, FutureOrderV2PaymentRecord>) => void)
  | null = null;
let emitWorkshop:
  | ((records: ReadonlyMap<string, FutureOrderV2WorkshopProgress>) => void)
  | null = null;
let emitPrices:
  | ((records: ReadonlyMap<string, FutureOrderV2PersonalizedPriceRecord>) => void)
  | null = null;

const originalPaymentsSub = StorageService.subscribeToCustomerFutureOrderV2Payments;
const originalWorkshopSub = StorageService.subscribeToCustomerFutureOrderV2Workshop;
const originalPricesSub =
  StorageService.subscribeToCustomerFutureOrderV2PersonalizedPrices;
const originalGetJourney = CustomerJourneyEngine.getCurrentJourney;

try {
  StorageService.subscribeToCustomerFutureOrderV2Payments = (callback) => {
    emitPayments = callback;
    return () => {
      emitPayments = null;
    };
  };
  StorageService.subscribeToCustomerFutureOrderV2Workshop = (callback) => {
    emitWorkshop = callback;
    return () => {
      emitWorkshop = null;
    };
  };
  StorageService.subscribeToCustomerFutureOrderV2PersonalizedPrices = (callback) => {
    emitPrices = callback;
    return () => {
      emitPrices = null;
    };
  };
  // Even if legacy journey reports requiresAttention=true, unsettled V2 banner must not flicker it.
  CustomerJourneyEngine.getCurrentJourney = () => ({
    state: "PAYMENT_PENDING",
    progress: 50,
    currentOrder: null,
    primaryAction: "Continue",
    secondaryAction: "View",
    destination: "design",
    notification: "Legacy attention notice",
    workspace: "OVERVIEW",
    canContinue: true,
    blockers: [],
    recommendedNextStep: "",
    stepperPreviousLabel: "",
    stepperNextLabel: "",
    stepperSubmitLabel: "",
    requiresAttention: true,
  });

  useAppStore.setState({
    currentUser: {
      name: "Ada",
      email: "ada@example.com",
      ownerUid,
      role: "Customer",
    } as never,
    hasLoadedOrders: true,
    fabrics: [],
  });

  let renderer!: ReactTestRenderer;
  const renderDashboard = (
    activeOrders: unknown[],
    user = { name: "Ada", email: "ada@example.com" },
  ) => (
    <DashboardView
      masterOrder={null}
      historicalOrders={[]}
      activeOrders={activeOrders as never}
      drafts={[]}
      onDeleteDraft={() => undefined}
      onReorder={() => undefined}
      onNavigateToTab={() => undefined}
      onUpdateProfile={() => undefined}
      onUpdateMeasurements={() => undefined}
      onLogout={() => undefined}
      customGroups={[]}
      onUpdateCustomGroup={() => undefined}
      onDeleteCustomGroup={() => undefined}
      onSelectOrderContext={() => undefined}
      joinedBatchIds={[]}
      onLeaveCustomGroup={() => undefined}
      currentUser={user}
      batches={[]}
    />
  );

  await act(async () => {
    renderer = create(renderDashboard(orders));
  });

  const bannerNodes = () =>
    renderer.root.findAllByProps({ "data-customer-dashboard-banner": true });

  // Orders arrived before payments/workshop snapshots: banner MUST NOT show "4 are waiting for payment".
  assert.equal(bannerNodes().length, 0);
  assert.equal(
    JSON.stringify(renderer.toJSON()).includes("4 are waiting for payment"),
    false,
  );
  assert.equal(
    JSON.stringify(renderer.toJSON()).includes("Legacy attention notice"),
    false,
  );

  // Only workshop settles -> still gated until payments settle.
  await act(async () => {
    emitWorkshop?.(new Map());
    emitPrices?.(new Map());
  });
  assert.equal(bannerNodes().length, 0);

  // Payments settle -> renders the exact unpaid count (1, not 4).
  await act(async () => {
    emitPayments?.(paidMap);
  });
  assert.equal(bannerNodes().length, 1);
  assert.equal(
    bannerNodes()[0]!.children.join(""),
    "You have 4 orders. 1 is waiting for payment.",
  );

  // Switching signed-in customer resets settled state so old user's payments never bleed into new user.
  const secondOwnerUid = "banner-signin-owner-2";
  await act(async () => {
    useAppStore.setState({
      currentUser: {
        name: "Bola",
        email: "bola@example.com",
        ownerUid: secondOwnerUid,
        role: "Customer",
      } as never,
      hasLoadedOrders: false,
    });
    renderer.update(
      renderDashboard(
        [makePersistedOrder("future-order-1", "2026-09-27T12:00:00.000Z", secondOwnerUid)],
        { name: "Bola", email: "bola@example.com" },
      ),
    );
  });
  assert.equal(bannerNodes().length, 0);
  await act(async () => {
    useAppStore.setState({ hasLoadedOrders: true });
    emitWorkshop?.(new Map());
    emitPayments?.(new Map());
    emitPrices?.(new Map());
  });
  assert.equal(bannerNodes().length, 1);
  assert.match(bannerNodes()[0]!.children.join(""), /is waiting for payment\.$/);

  await act(async () => renderer.unmount());
  console.log("PASS: dashboard banner waits for settled orders, payments, and workshop snapshots");
} finally {
  StorageService.subscribeToCustomerFutureOrderV2Payments = originalPaymentsSub;
  StorageService.subscribeToCustomerFutureOrderV2Workshop = originalWorkshopSub;
  StorageService.subscribeToCustomerFutureOrderV2PersonalizedPrices = originalPricesSub;
  CustomerJourneyEngine.getCurrentJourney = originalGetJourney;
}
