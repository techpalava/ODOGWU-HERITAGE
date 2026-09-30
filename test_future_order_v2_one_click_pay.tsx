import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { auth } from "./src/services/firebase";
import type { PersistFutureOrderV2ClientResult } from "./src/services/futureOrderV2Persistence";
import type { FutureOrderV2PaymentRecordResult } from "./src/services/futureOrderV2PaymentRecordClient";
import { useAppStore } from "./src/store/useAppStore";
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
  return { studio, calls, recordedOrderIds, payButtons, pay };
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
await act(async () => oneClick.studio.unmount());

const declined = await mountStudio("declined-fixture", [
  { status: "failed", message: "Your card was declined." },
  { status: "authorized", providerTransactionReference: "pi_retry_456" },
]);
await declined.pay();
assert.deepEqual(declined.calls, { persist: 1, authorize: 1, record: 0 });
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
await act(async () => declined.studio.unmount());

console.log("One-click V2 pay tests passed.");
process.exit(0);
