import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  DesignStudioResumeLocusV1,
  DesignStudioStageId,
  GuestDesignDraft,
} from "../types";
import { db } from "./firebase";
import { normalizeAuthenticatedFutureDraft } from "./authenticatedFutureDraftService";
import {
  SAVED_STUDIO_ORDER_COLLECTION,
  SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER,
  SAVED_STUDIO_ORDER_RETRY_MESSAGE,
  SAVED_STUDIO_ORDER_CAP_MESSAGE,
  createSavedStudioOrderPriceSnapshot,
  generateSavedStudioOrderName,
  getSavedStudioOrderGate,
  normalizeSavedStudioOrderIndex,
  normalizeSavedStudioOrderItem,
  normalizeSavedStudioOrderName,
  resolveSavedStudioOrderStep,
  stampLinkedSavedOrderId,
  buildSavedStudioOrderGarmentSummary,
  isDesignStudioStageId,
  type SavedStudioOrderIndexV1,
  type SavedStudioOrderItemV1,
} from "../utils/savedStudioOrderModel";

export type SavedStudioOrderWriteResult =
  | { status: "saved"; item: SavedStudioOrderItemV1 }
  | { status: "updated"; item: SavedStudioOrderItemV1 }
  | { status: "cap_reached"; item: null; message: string }
  | { status: "invalid"; item: null; reason: string }
  | { status: "error"; item: null; message: string };

export type SavedStudioOrderDeleteResult =
  | { status: "deleted"; savedOrderId: string }
  | { status: "absent"; savedOrderId: string }
  | { status: "error"; message: string };

export type SavedStudioOrderRenameResult =
  | { status: "renamed"; item: SavedStudioOrderItemV1 }
  | { status: "invalid"; reason: string }
  | { status: "absent" }
  | { status: "error"; message: string };

export type SavedStudioOrderSnapshot = {
  index: SavedStudioOrderIndexV1;
  items: SavedStudioOrderItemV1[];
};

export type SavedStudioOrderSaveInput = {
  ownerUid: string;
  draft: GuestDesignDraft;
  savedStage: DesignStudioStageId;
  savedStep?: number;
  resumeLocus?: DesignStudioResumeLocusV1 | null;
  now?: Date;
  savedOrderId?: string;
  name?: string;
};

type StoredBundle = {
  index: Record<string, unknown> | null;
  items: Map<string, Record<string, unknown>>;
};

export type SavedStudioOrderMutation =
  | {
      type: "upsert";
      item: SavedStudioOrderItemV1;
      /** Rename/update only: fail with SavedStudioOrderAbsentError if the item is gone. */
      requireExisting?: boolean;
    }
  | { type: "delete"; savedOrderId: string };

export type SavedStudioOrderMutationOutcome = {
  itemIds: string[];
  /** Revision actually written (upsert only), taken from the stored item. */
  revision: number | null;
  /** True when the upsert created a new item. */
  created: boolean;
};

/** Raised inside the write transaction when a new item would exceed the cap. */
export class SavedStudioOrderCapError extends Error {
  constructor() {
    super("saved_studio_order_cap_reached");
    this.name = "SavedStudioOrderCapError";
  }
}

/** Raised inside the write transaction when an update targets a deleted item. */
export class SavedStudioOrderAbsentError extends Error {
  constructor() {
    super("saved_studio_order_absent");
    this.name = "SavedStudioOrderAbsentError";
  }
}

const readStoredIndexIds = (
  raw: Record<string, unknown> | null | undefined,
  ownerUid: string,
): string[] => {
  if (!raw) return [];
  const parsed = normalizeSavedStudioOrderIndex(raw, ownerUid);
  if (parsed.index) return parsed.index.itemIds;
  // Never silently wipe an index we cannot parse; refuse the write instead.
  throw new Error(parsed.reason || "invalid_saved_order_index");
};

const readStoredRevision = (
  raw: Record<string, unknown> | null | undefined,
): number | null =>
  raw && Number.isSafeInteger(raw.revision) && (raw.revision as number) >= 1
    ? (raw.revision as number)
    : null;

/**
 * Pure planning step shared by every adapter. It always works from the
 * index and item that were read inside the same transaction, so concurrent
 * saves, renames and deletes cannot drop each other's ids or exceed the cap.
 */
export const planSavedStudioOrderMutation = ({
  currentIds,
  storedRevision,
  mutation,
}: {
  currentIds: readonly string[];
  storedRevision: number | null;
  mutation: SavedStudioOrderMutation;
}): SavedStudioOrderMutationOutcome => {
  if (mutation.type === "delete") {
    return {
      itemIds: currentIds.filter((id) => id !== mutation.savedOrderId),
      revision: null,
      created: false,
    };
  }
  const id = mutation.item.savedOrderId;
  const listed = currentIds.includes(id);
  const exists = listed && storedRevision !== null;
  if (!exists && mutation.requireExisting) throw new SavedStudioOrderAbsentError();
  if (!exists) {
    const others = currentIds.filter((entry) => entry !== id);
    if (others.length >= SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER) {
      throw new SavedStudioOrderCapError();
    }
    return { itemIds: [id, ...others], revision: 1, created: true };
  }
  return {
    itemIds: [...currentIds],
    revision: (storedRevision as number) + 1,
    created: false,
  };
};

export interface SavedStudioOrderPersistenceAdapter {
  loadBundle(ownerUid: string): Promise<StoredBundle>;
  mutate(
    ownerUid: string,
    mutation: SavedStudioOrderMutation,
  ): Promise<SavedStudioOrderMutationOutcome>;
  subscribe?(
    ownerUid: string,
    onChange: (bundle: StoredBundle) => void,
  ): () => void;
  createItemId(ownerUid: string): string;
}

const emptyIndex = (ownerUid: string, nowIso: string): SavedStudioOrderIndexV1 => ({
  schemaVersion: 1,
  ownerUid,
  itemIds: [],
  updatedAt: nowIso,
});

const toIndexRecord = (
  ownerUid: string,
  itemIds: string[],
  useServerTimestamp: boolean,
  fallbackIso: string,
): Record<string, unknown> => ({
  schemaVersion: 1,
  ownerUid,
  itemIds: [...itemIds],
  updatedAt: useServerTimestamp ? serverTimestamp() : fallbackIso,
});

const toItemRecord = (
  item: SavedStudioOrderItemV1,
  useServerTimestamp: boolean,
): Record<string, unknown> => ({
  schemaVersion: 1,
  savedOrderId: item.savedOrderId,
  ownerUid: item.ownerUid,
  name: item.name,
  garmentSummary: item.garmentSummary,
  savedStage: item.savedStage,
  savedStep: item.savedStep,
  resumeLocus: item.resumeLocus,
  draft: item.draft,
  priceSnapshot: item.priceSnapshot,
  createdAt:
    useServerTimestamp && item.revision === 1 ? serverTimestamp() : item.createdAt,
  updatedAt: useServerTimestamp ? serverTimestamp() : item.updatedAt,
  revision: item.revision,
});

const parseBundle = (
  bundle: StoredBundle,
  ownerUid: string,
): SavedStudioOrderSnapshot => {
  const parsedIndex = bundle.index
    ? normalizeSavedStudioOrderIndex(bundle.index, ownerUid)
    : { index: emptyIndex(ownerUid, new Date().toISOString()), reason: null };
  const index = parsedIndex.index ?? emptyIndex(ownerUid, new Date().toISOString());
  const items: SavedStudioOrderItemV1[] = [];
  for (const savedOrderId of index.itemIds) {
    const raw = bundle.items.get(savedOrderId);
    if (!raw) continue;
    const parsed = normalizeSavedStudioOrderItem(
      raw,
      normalizeAuthenticatedFutureDraft,
      ownerUid,
    );
    if (parsed.item) items.push(parsed.item);
  }
  return { index, items };
};

const cloneBundle = (bundle: StoredBundle): StoredBundle => ({
  index: bundle.index ? { ...bundle.index } : null,
  items: new Map(
    [...bundle.items.entries()].map(([id, value]) => [id, { ...value }]),
  ),
});

export const createMemorySavedStudioOrderAdapter = (): SavedStudioOrderPersistenceAdapter => {
  const store = new Map<string, StoredBundle>();
  const listeners = new Map<string, Set<(bundle: StoredBundle) => void>>();
  let nextId = 1;
  const notify = (ownerUid: string) => {
    const bundle = store.get(ownerUid) ?? { index: null, items: new Map() };
    listeners.get(ownerUid)?.forEach((listener) => listener(cloneBundle(bundle)));
  };
  return {
    createItemId: () => `savedord${String(nextId++).padStart(12, "0")}`,
    loadBundle: async (ownerUid) =>
      cloneBundle(store.get(ownerUid) ?? { index: null, items: new Map() }),
    mutate: async (ownerUid, mutation) => {
      const current = cloneBundle(
        store.get(ownerUid) ?? { index: null, items: new Map() },
      );
      const nowIso = new Date().toISOString();
      const targetId =
        mutation.type === "upsert" ? mutation.item.savedOrderId : mutation.savedOrderId;
      const stored = current.items.get(targetId);
      const outcome = planSavedStudioOrderMutation({
        currentIds: readStoredIndexIds(current.index, ownerUid),
        storedRevision: readStoredRevision(stored),
        mutation,
      });
      if (mutation.type === "upsert") {
        const record = toItemRecord(
          { ...mutation.item, revision: outcome.revision ?? 1 },
          false,
        );
        if (!outcome.created && stored?.createdAt) record.createdAt = stored.createdAt;
        current.items.set(mutation.item.savedOrderId, record);
      } else {
        current.items.delete(mutation.savedOrderId);
      }
      current.index = toIndexRecord(ownerUid, outcome.itemIds, false, nowIso);
      store.set(ownerUid, current);
      notify(ownerUid);
      return outcome;
    },
    subscribe: (ownerUid, onChange) => {
      const set = listeners.get(ownerUid) ?? new Set();
      set.add(onChange);
      listeners.set(ownerUid, set);
      onChange(
        cloneBundle(store.get(ownerUid) ?? { index: null, items: new Map() }),
      );
      return () => {
        set.delete(onChange);
      };
    },
  };
};

export const createFirebaseSavedStudioOrderAdapter = (
  firestore: Firestore = db,
): SavedStudioOrderPersistenceAdapter => ({
  createItemId: (ownerUid) =>
    doc(collection(firestore, SAVED_STUDIO_ORDER_COLLECTION, ownerUid, "items"))
      .id,
  loadBundle: async (ownerUid) => {
    const indexRef = doc(firestore, SAVED_STUDIO_ORDER_COLLECTION, ownerUid);
    const indexSnap = await getDoc(indexRef);
    const index = indexSnap.exists()
      ? (indexSnap.data() as Record<string, unknown>)
      : null;
    const itemIds = Array.isArray(index?.itemIds)
      ? (index.itemIds as unknown[]).filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    const items = new Map<string, Record<string, unknown>>();
    for (const savedOrderId of itemIds) {
      const itemSnap = await getDoc(
        doc(
          firestore,
          SAVED_STUDIO_ORDER_COLLECTION,
          ownerUid,
          "items",
          savedOrderId,
        ),
      );
      if (itemSnap.exists()) {
        items.set(savedOrderId, itemSnap.data() as Record<string, unknown>);
      }
    }
    return { index, items };
  },
  mutate: async (ownerUid, mutation) => {
    const indexRef = doc(firestore, SAVED_STUDIO_ORDER_COLLECTION, ownerUid);
    const targetId =
      mutation.type === "upsert" ? mutation.item.savedOrderId : mutation.savedOrderId;
    const itemRef = doc(
      firestore,
      SAVED_STUDIO_ORDER_COLLECTION,
      ownerUid,
      "items",
      targetId,
    );
    return runTransaction(firestore, async (transaction) => {
      // Every decision below uses only what this transaction read, so a
      // retry after contention recomputes itemIds, the cap and the revision.
      const indexSnap = await transaction.get(indexRef);
      const itemSnap = await transaction.get(itemRef);
      const outcome = planSavedStudioOrderMutation({
        currentIds: readStoredIndexIds(
          indexSnap.exists()
            ? (indexSnap.data() as Record<string, unknown>)
            : null,
          ownerUid,
        ),
        storedRevision: readStoredRevision(
          itemSnap.exists() ? (itemSnap.data() as Record<string, unknown>) : null,
        ),
        mutation,
      });
      const nowIso = new Date().toISOString();
      transaction.set(
        indexRef,
        toIndexRecord(ownerUid, outcome.itemIds, true, nowIso),
      );
      if (mutation.type === "upsert") {
        const record = toItemRecord(
          { ...mutation.item, revision: outcome.revision ?? 1 },
          true,
        );
        if (outcome.created) {
          transaction.set(itemRef, record);
        } else {
          // Replace each top-level field wholesale (no deep merge of the
          // nested draft map) while keeping the stored createdAt.
          delete record.createdAt;
          transaction.set(itemRef, record, {
            mergeFields: Object.keys(record),
          });
        }
      } else if (itemSnap.exists()) {
        transaction.delete(itemRef);
      }
      return outcome;
    });
  },
  subscribe: (ownerUid, onChange) => {
    const indexRef = doc(firestore, SAVED_STUDIO_ORDER_COLLECTION, ownerUid);
    let cancelled = false;
    let itemUnsubs: Unsubscribe[] = [];
    const indexUnsub = onSnapshot(indexRef, (snapshot) => {
      if (cancelled) return;
      const index = snapshot.exists()
        ? (snapshot.data() as Record<string, unknown>)
        : null;
      const itemIds = Array.isArray(index?.itemIds)
        ? (index.itemIds as unknown[]).filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      itemUnsubs.forEach((unsub) => unsub());
      itemUnsubs = [];
      if (itemIds.length === 0) {
        onChange({ index, items: new Map() });
        return;
      }
      const items = new Map<string, Record<string, unknown>>();
      let pending = itemIds.length;
      const maybeEmit = () => {
        if (cancelled || pending > 0) return;
        onChange({ index, items: new Map(items) });
      };
      for (const savedOrderId of itemIds) {
        const itemRef = doc(
          firestore,
          SAVED_STUDIO_ORDER_COLLECTION,
          ownerUid,
          "items",
          savedOrderId,
        );
        itemUnsubs.push(
          onSnapshot(itemRef, (itemSnap) => {
            if (cancelled) return;
            if (itemSnap.exists()) {
              items.set(savedOrderId, itemSnap.data() as Record<string, unknown>);
            } else {
              items.delete(savedOrderId);
            }
            if (pending > 0) pending -= 1;
            maybeEmit();
          }),
        );
      }
    });
    return () => {
      cancelled = true;
      indexUnsub();
      itemUnsubs.forEach((unsub) => unsub());
    };
  },
});

export const createSavedStudioOrderRepository = (
  adapter: SavedStudioOrderPersistenceAdapter,
) => {
  const save = async (
    input: SavedStudioOrderSaveInput,
  ): Promise<SavedStudioOrderWriteResult> => {
    try {
      const gate = getSavedStudioOrderGate(input.draft);
      if (gate.ok === false) {
        return { status: "invalid", item: null, reason: gate.reason };
      }
      const normalizedDraft = normalizeAuthenticatedFutureDraft(input.draft);
      if (!normalizedDraft.draft) {
        return {
          status: "invalid",
          item: null,
          reason: normalizedDraft.reason || "invalid_saved_order_draft",
        };
      }
      if (!isDesignStudioStageId(input.savedStage)) {
        return { status: "invalid", item: null, reason: "invalid_saved_stage" };
      }
      const now = input.now ?? new Date();
      const nowIso = now.toISOString();
      const bundle = await adapter.loadBundle(input.ownerUid);
      const snapshot = parseBundle(bundle, input.ownerUid);
      const linkedId =
        input.savedOrderId || normalizedDraft.draft.linkedSavedOrderId;
      const existing = linkedId
        ? snapshot.items.find((item) => item.savedOrderId === linkedId)
        : undefined;

      if (!existing && snapshot.items.length >= SAVED_STUDIO_ORDER_MAX_PER_CUSTOMER) {
        return {
          status: "cap_reached",
          item: null,
          message: SAVED_STUDIO_ORDER_CAP_MESSAGE,
        };
      }

      const savedOrderId =
        existing?.savedOrderId ?? adapter.createItemId(input.ownerUid);
      const requestedName = input.name
        ? normalizeSavedStudioOrderName(input.name)
        : null;
      const name = existing
        ? existing.name
        : requestedName && "name" in requestedName
          ? requestedName.name
          : generateSavedStudioOrderName(normalizedDraft.draft, now);
      const stampedDraft = stampLinkedSavedOrderId(
        normalizedDraft.draft,
        savedOrderId,
      );
      const item: SavedStudioOrderItemV1 = {
        schemaVersion: 1,
        savedOrderId,
        ownerUid: input.ownerUid,
        name,
        garmentSummary: buildSavedStudioOrderGarmentSummary(stampedDraft),
        savedStage: input.savedStage,
        savedStep: resolveSavedStudioOrderStep(
          input.savedStage,
          input.savedStep,
        ),
        resumeLocus: input.resumeLocus ?? stampedDraft.resumeLocus ?? null,
        draft: stampedDraft,
        priceSnapshot: createSavedStudioOrderPriceSnapshot(stampedDraft, nowIso),
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        revision: existing ? existing.revision + 1 : 1,
      };
      const outcome = await adapter.mutate(input.ownerUid, {
        type: "upsert",
        item,
      });
      const written: SavedStudioOrderItemV1 = {
        ...item,
        revision: outcome.revision ?? item.revision,
      };
      return outcome.created
        ? { status: "saved", item: written }
        : { status: "updated", item: written };
    } catch (error) {
      if (error instanceof SavedStudioOrderCapError) {
        return {
          status: "cap_reached",
          item: null,
          message: SAVED_STUDIO_ORDER_CAP_MESSAGE,
        };
      }
      return {
        status: "error",
        item: null,
        message: SAVED_STUDIO_ORDER_RETRY_MESSAGE,
      };
    }
  };

  const rename = async ({
    ownerUid,
    savedOrderId,
    name,
  }: {
    ownerUid: string;
    savedOrderId: string;
    name: string;
  }): Promise<SavedStudioOrderRenameResult> => {
    try {
      const normalized = normalizeSavedStudioOrderName(name);
      if ("error" in normalized) {
        return { status: "invalid", reason: normalized.error };
      }
      const bundle = await adapter.loadBundle(ownerUid);
      const snapshot = parseBundle(bundle, ownerUid);
      const existing = snapshot.items.find(
        (item) => item.savedOrderId === savedOrderId,
      );
      if (!existing) return { status: "absent" };
      const nowIso = new Date().toISOString();
      const item: SavedStudioOrderItemV1 = {
        ...existing,
        name: normalized.name,
        updatedAt: nowIso,
        revision: existing.revision + 1,
      };
      const outcome = await adapter.mutate(ownerUid, {
        type: "upsert",
        item,
        requireExisting: true,
      });
      return {
        status: "renamed",
        item: { ...item, revision: outcome.revision ?? item.revision },
      };
    } catch (error) {
      if (error instanceof SavedStudioOrderAbsentError) return { status: "absent" };
      return { status: "error", message: SAVED_STUDIO_ORDER_RETRY_MESSAGE };
    }
  };

  const remove = async ({
    ownerUid,
    savedOrderId,
  }: {
    ownerUid: string;
    savedOrderId: string;
  }): Promise<SavedStudioOrderDeleteResult> => {
    try {
      const bundle = await adapter.loadBundle(ownerUid);
      const snapshot = parseBundle(bundle, ownerUid);
      if (!snapshot.index.itemIds.includes(savedOrderId)) {
        return { status: "absent", savedOrderId };
      }
      await adapter.mutate(ownerUid, { type: "delete", savedOrderId });
      return { status: "deleted", savedOrderId };
    } catch {
      return { status: "error", message: SAVED_STUDIO_ORDER_RETRY_MESSAGE };
    }
  };

  const list = async (ownerUid: string): Promise<SavedStudioOrderSnapshot> => {
    const bundle = await adapter.loadBundle(ownerUid);
    return parseBundle(bundle, ownerUid);
  };

  const subscribe = (
    ownerUid: string,
    onChange: (snapshot: SavedStudioOrderSnapshot) => void,
  ): (() => void) => {
    if (!adapter.subscribe) {
      void list(ownerUid).then(onChange);
      return () => undefined;
    }
    return adapter.subscribe(ownerUid, (bundle) => {
      onChange(parseBundle(bundle, ownerUid));
    });
  };

  return { save, rename, remove, list, subscribe };
};

export const createFirebaseSavedStudioOrderRepository = () =>
  createSavedStudioOrderRepository(createFirebaseSavedStudioOrderAdapter());

let defaultRepository: ReturnType<typeof createSavedStudioOrderRepository> | null =
  null;

export const getSavedStudioOrderRepository = () => {
  if (!defaultRepository) {
    defaultRepository = createFirebaseSavedStudioOrderRepository();
  }
  return defaultRepository;
};

export const setSavedStudioOrderRepositoryForTests = (
  repository: ReturnType<typeof createSavedStudioOrderRepository> | null,
): void => {
  defaultRepository = repository;
};
