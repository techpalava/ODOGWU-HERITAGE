import type { Firestore } from "firebase-admin/firestore";
import type {
  Batch,
  BusinessSettings,
  CustomDetailOption,
  Fabric,
  StyleCategory,
} from "../types.js";
import type {
  DepositCheckoutQuote,
  DepositPaymentConfirmationRecord,
  DepositPrepareLookupRecord,
} from "../utils/depositOrderFingerprint.js";
import {
  CHECKOUT_CONFIRMATIONS_COLLECTION,
  confirmDepositCheckoutBatch,
  FABRICS_COLLECTION,
  INVENTORY_TRANSACTIONS_COLLECTION,
  ORDERS_COLLECTION,
  type CheckoutConfirmationRecord,
  type ConfirmDepositBatchSuccess,
  type FabricInventoryLedger,
  type InventoryFabricSnapshot,
  type InventoryTransactionReaderWriter,
  type RunInventoryTransaction,
} from "./fabricInventoryConsumption.js";
import type {
  DepositPaymentProof,
  StripeRetriever,
} from "./depositPaymentVerification.js";
import {
  DEPOSIT_CHECKOUT_QUOTES_COLLECTION,
  DEPOSIT_PAYMENT_CONFIRMATIONS_COLLECTION,
  DEPOSIT_PREPARE_LOOKUPS_COLLECTION,
  type DepositCatalogSnapshot,
} from "./prepareDepositCheckout.js";
import {
  INVENTORY_RESERVATIONS_COLLECTION,
  type InventoryReservationRecord,
  type ReservationTransactionStore,
} from "./fabricInventoryReservation.js";

const sanitizeForFirestore = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const sanitized = sanitizeForFirestore(entry);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }
  return value;
};

const readFabricSnapshot = (
  fabricCode: string,
  data: Record<string, unknown> | undefined,
): InventoryFabricSnapshot | null => {
  if (!data) return null;
  return {
    code: typeof data.code === "string" ? data.code : fabricCode,
    stock: data.stock,
    reservedStock: data.reservedStock,
    stockStatus: data.stockStatus as InventoryFabricSnapshot["stockStatus"],
  };
};

const toReservationFabricSnapshot = (
  snapshot: InventoryFabricSnapshot | null,
): import("./fabricInventoryReservation.js").ReservationFabricSnapshot | null => {
  if (!snapshot) return null;
  return {
    code: snapshot.code,
    stock: snapshot.stock,
    reservedStock: snapshot.reservedStock ?? 0,
    stockStatus: snapshot.stockStatus,
  };
};

export const createAdminInventoryTransactionRunner = (
  db: Firestore,
): RunInventoryTransaction => {
  return async (work) =>
    db.runTransaction(async (transaction) => {
      const pendingWrites: Array<() => void> = [];

      const store: InventoryTransactionReaderWriter = {
        async getLedger(orderId) {
          const snap = await transaction.get(
            db.collection(INVENTORY_TRANSACTIONS_COLLECTION).doc(orderId),
          );
          if (!snap.exists) return null;
          return snap.data() as FabricInventoryLedger;
        },
        async getCheckoutConfirmation(checkoutId) {
          const snap = await transaction.get(
            db.collection(CHECKOUT_CONFIRMATIONS_COLLECTION).doc(checkoutId),
          );
          if (!snap.exists) return null;
          return snap.data() as CheckoutConfirmationRecord;
        },
        async getDepositQuote(checkoutId) {
          const snap = await transaction.get(
            db.collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION).doc(checkoutId),
          );
          if (!snap.exists) return null;
          return snap.data() as DepositCheckoutQuote;
        },
        async getPaymentConfirmation(paymentIntentId) {
          const snap = await transaction.get(
            db
              .collection(DEPOSIT_PAYMENT_CONFIRMATIONS_COLLECTION)
              .doc(paymentIntentId),
          );
          if (!snap.exists) return null;
          return snap.data() as DepositPaymentConfirmationRecord;
        },
        async getFabric(fabricCode) {
          const snap = await transaction.get(
            db.collection(FABRICS_COLLECTION).doc(fabricCode),
          );
          if (!snap.exists) return null;
          return readFabricSnapshot(
            fabricCode,
            snap.data() as Record<string, unknown>,
          );
        },
        async getOrder(orderId) {
          const snap = await transaction.get(
            db.collection(ORDERS_COLLECTION).doc(orderId),
          );
          if (!snap.exists) return null;
          return snap.data() as import("../types.js").MasterOrder;
        },
        async getReservation(checkoutId) {
          const snap = await transaction.get(
            db.collection(INVENTORY_RESERVATIONS_COLLECTION).doc(checkoutId),
          );
          if (!snap.exists) return null;
          return snap.data() as InventoryReservationRecord;
        },
        setLedger(orderId, ledger) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(INVENTORY_TRANSACTIONS_COLLECTION).doc(orderId),
              sanitizeForFirestore(ledger) as Record<string, unknown>,
            );
          });
        },
        setCheckoutConfirmation(checkoutId, record) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(CHECKOUT_CONFIRMATIONS_COLLECTION).doc(checkoutId),
              sanitizeForFirestore(record) as Record<string, unknown>,
            );
          });
        },
        setDepositQuote(checkoutId, quote) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION).doc(checkoutId),
              sanitizeForFirestore(quote) as Record<string, unknown>,
            );
          });
        },
        setPaymentConfirmation(paymentIntentId, record) {
          pendingWrites.push(() => {
            transaction.set(
              db
                .collection(DEPOSIT_PAYMENT_CONFIRMATIONS_COLLECTION)
                .doc(paymentIntentId),
              sanitizeForFirestore(record) as Record<string, unknown>,
            );
          });
        },
        setReservation(checkoutId, reservation) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(INVENTORY_RESERVATIONS_COLLECTION).doc(checkoutId),
              sanitizeForFirestore(reservation) as Record<string, unknown>,
            );
          });
        },
        updateFabric(fabricCode, patch) {
          pendingWrites.push(() => {
            const update: Record<string, unknown> = {
              stockStatus: patch.stockStatus,
              updatedAt: new Date().toISOString(),
            };
            if (typeof patch.stock === "number") {
              update.stock = patch.stock;
            }
            if (typeof patch.reservedStock === "number") {
              update.reservedStock = patch.reservedStock;
            }
            transaction.update(
              db.collection(FABRICS_COLLECTION).doc(fabricCode),
              update,
            );
          });
        },
        setOrder(orderId, order) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(ORDERS_COLLECTION).doc(orderId),
              sanitizeForFirestore(order) as Record<string, unknown>,
            );
          });
        },
      };

      const result = await work(store);
      for (const write of pendingWrites) {
        write();
      }
      return result;
    });
};

export type AdminReservationPrepareStore = ReservationTransactionStore & {
  savePrepareLookup: (record: DepositPrepareLookupRecord) => void;
  saveQuote: (quote: DepositCheckoutQuote) => void;
  loadReservation: (
    checkoutId: string,
  ) => Promise<InventoryReservationRecord | null>;
  getQuote: (checkoutId: string) => Promise<DepositCheckoutQuote | null>;
  setQuote: (checkoutId: string, quote: DepositCheckoutQuote) => void;
};

/** Reservation-only transaction runner (prepare / release / expiry). */
export const createAdminReservationTransactionRunner = (
  db: Firestore,
): (<T>(
  work: (store: AdminReservationPrepareStore) => Promise<T>,
) => Promise<T>) => {
  return async (work) =>
    db.runTransaction(async (transaction) => {
      const pendingWrites: Array<() => void> = [];
      const getReservation = async (
        checkoutId: string,
      ): Promise<InventoryReservationRecord | null> => {
        const snap = await transaction.get(
          db.collection(INVENTORY_RESERVATIONS_COLLECTION).doc(checkoutId),
        );
        if (!snap.exists) return null;
        return snap.data() as InventoryReservationRecord;
      };
      const store: AdminReservationPrepareStore = {
        async getFabric(fabricCode) {
          const snap = await transaction.get(
            db.collection(FABRICS_COLLECTION).doc(fabricCode),
          );
          if (!snap.exists) return null;
          return toReservationFabricSnapshot(
            readFabricSnapshot(
              fabricCode,
              snap.data() as Record<string, unknown>,
            ),
          );
        },
        getReservation,
        loadReservation: getReservation,
        setReservation(checkoutId, reservation) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(INVENTORY_RESERVATIONS_COLLECTION).doc(checkoutId),
              sanitizeForFirestore(reservation) as Record<string, unknown>,
            );
          });
        },
        updateFabric(fabricCode, patch) {
          pendingWrites.push(() => {
            const update: Record<string, unknown> = {
              stockStatus: patch.stockStatus,
              updatedAt: new Date().toISOString(),
              reservedStock: patch.reservedStock,
            };
            if (typeof patch.stock === "number") {
              update.stock = patch.stock;
            }
            transaction.update(
              db.collection(FABRICS_COLLECTION).doc(fabricCode),
              update,
            );
          });
        },
        savePrepareLookup(record) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(DEPOSIT_PREPARE_LOOKUPS_COLLECTION).doc(record.prepareKey),
              sanitizeForFirestore(record) as Record<string, unknown>,
            );
          });
        },
        saveQuote(quote) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION).doc(quote.checkoutId),
              sanitizeForFirestore(quote) as Record<string, unknown>,
            );
          });
        },
        async getQuote(checkoutId) {
          const snap = await transaction.get(
            db.collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION).doc(checkoutId),
          );
          if (!snap.exists) return null;
          return snap.data() as DepositCheckoutQuote;
        },
        setQuote(checkoutId, quote) {
          pendingWrites.push(() => {
            transaction.set(
              db.collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION).doc(checkoutId),
              sanitizeForFirestore({ ...quote, checkoutId }) as Record<string, unknown>,
            );
          });
        },
      };
      const result = await work(store);
      for (const write of pendingWrites) {
        write();
      }
      return result;
    });
};

export const loadDepositCatalogSnapshot = async (
  db: Firestore,
): Promise<DepositCatalogSnapshot> => {
  const [
    fabricsSnap,
    stylesSnap,
    batchesSnap,
    customDetailsSnap,
    businessSettingsSnap,
  ] = await Promise.all([
    db.collection("fabrics").get(),
    db.collection("styles").get(),
    db.collection("batches").get(),
    db.collection("custom_detail_catalog").get(),
    db.collection("businessSettings").doc("main").get(),
  ]);

  const fabrics = fabricsSnap.docs.map((doc) => {
    const data = doc.data() as Fabric;
    return { ...data, code: data.code || doc.id };
  });
  const styles = stylesSnap.docs.map((doc) => {
    const data = doc.data() as StyleCategory;
    return { ...data, id: data.id || doc.id };
  });
  const batches = batchesSnap.docs.map((doc) => {
    const data = doc.data() as Batch;
    return { ...data, id: data.id || doc.id };
  });
  const customDetailCatalog = customDetailsSnap.docs.map((doc) => {
    const data = doc.data() as CustomDetailOption;
    return { ...data, id: data.id || doc.id };
  });
  const businessSettings = (
    businessSettingsSnap.exists
      ? businessSettingsSnap.data()
      : { pricingSettings: { depositPercentage: 50 } }
  ) as BusinessSettings;

  return {
    fabrics,
    styles,
    batches,
    customDetailCatalog,
    businessSettings,
  };
};

export const saveDepositCheckoutQuote = async (
  db: Firestore,
  quote: DepositCheckoutQuote,
): Promise<void> => {
  await db
    .collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION)
    .doc(quote.checkoutId)
    .set(sanitizeForFirestore(quote) as Record<string, unknown>);
};

export const loadDepositCheckoutQuote = async (
  db: Firestore,
  checkoutId: string,
): Promise<DepositCheckoutQuote | null> => {
  const snap = await db
    .collection(DEPOSIT_CHECKOUT_QUOTES_COLLECTION)
    .doc(checkoutId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as DepositCheckoutQuote;
};

export const saveDepositPrepareLookup = async (
  db: Firestore,
  record: DepositPrepareLookupRecord,
): Promise<void> => {
  await db
    .collection(DEPOSIT_PREPARE_LOOKUPS_COLLECTION)
    .doc(record.prepareKey)
    .set(sanitizeForFirestore(record) as Record<string, unknown>);
};

export const loadDepositPrepareLookup = async (
  db: Firestore,
  prepareKey: string,
): Promise<DepositPrepareLookupRecord | null> => {
  const snap = await db
    .collection(DEPOSIT_PREPARE_LOOKUPS_COLLECTION)
    .doc(prepareKey)
    .get();
  if (!snap.exists) return null;
  return snap.data() as DepositPrepareLookupRecord;
};

export const loadInventoryReservation = async (
  db: Firestore,
  checkoutId: string,
): Promise<InventoryReservationRecord | null> => {
  const snap = await db
    .collection(INVENTORY_RESERVATIONS_COLLECTION)
    .doc(checkoutId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as InventoryReservationRecord;
};

export const confirmDepositCheckoutBatchWithAdminDb = async (input: {
  db: Firestore;
  quote: DepositCheckoutQuote;
  paymentProof: DepositPaymentProof;
  authenticatedUid: string;
  stripe?: StripeRetriever | null;
  now?: () => Date;
}): Promise<ConfirmDepositBatchSuccess> =>
  confirmDepositCheckoutBatch({
    quote: input.quote,
    paymentProof: input.paymentProof,
    authenticatedUid: input.authenticatedUid,
    runInTransaction: createAdminInventoryTransactionRunner(input.db),
    stripe: input.stripe,
    now: input.now,
  });
