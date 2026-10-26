import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GuestDesignDraft } from "../types";
import { useAppStore } from "../store/useAppStore";
import {
  getSavedStudioOrderRepository,
  type SavedStudioOrderWriteResult,
} from "../services/savedStudioOrderService";
import {
  SAVED_STUDIO_ORDER_DASHBOARD_HASH,
  SAVED_STUDIO_ORDER_RETRY_MESSAGE,
  clearPendingSaveStudioOrder,
  evaluateSavedStudioOrderChangeWarnings,
  evaluateSavedStudioOrderPriceChange,
  hasConflictingActiveStudioDraft,
  hasPendingSaveStudioOrder,
  isUploadedSourceReferencedBySavedOrders,
  markPendingSaveStudioOrder,
  type SavedStudioOrderChangeWarning,
  type SavedStudioOrderItemV1,
} from "../utils/savedStudioOrderModel";
import { SavedOrderCapDialog } from "./SavedOrderCapDialog";
import { SavedOrderReplaceDialog } from "./SavedOrderReplaceDialog";
import { describeUnfinishedOrder } from "../utils/individualOrderStart";
import { GuestOrderSessionService } from "../services/guestOrderSessionService";

export type SavedStudioOrderHydrateMode = "replace" | "overwrite";

export type SavedStudioOrderPriceCheck = {
  savedOrderId: string;
  savedTotal: number | null;
};

export type SavedStudioOrderController = {
  items: SavedStudioOrderItemV1[];
  /** False until the first snapshot for the signed-in customer arrives. */
  loaded: boolean;
  busy: boolean;
  /** Set on Continue; the Studio resolves it once live pricing is ready. */
  pendingPriceCheck: SavedStudioOrderPriceCheck | null;
  resolvePriceCheck: (liveTotal: number | null) => void;
  changeWarnings: SavedStudioOrderChangeWarning[];
  setChangeWarnings: (warnings: SavedStudioOrderChangeWarning[]) => void;
  saveDraft: (input: {
    draft: GuestDesignDraft;
    savedStage: SavedStudioOrderItemV1["savedStage"];
    savedStep?: number;
    resumeLocus?: SavedStudioOrderItemV1["resumeLocus"];
    savedOrderId?: string;
  }) => Promise<SavedStudioOrderWriteResult>;
  rename: (item: SavedStudioOrderItemV1, name: string) => Promise<void>;
  remove: (item: SavedStudioOrderItemV1) => Promise<void>;
  requestContinue: (item: SavedStudioOrderItemV1) => void;
  beginGuestSaveSignIn: () => void;
  consumePendingSave: () => boolean;
  isUploadedSourceRetained: (sourceRef: string) => boolean;
  removeById: (savedOrderId: string) => Promise<void>;
};

const SavedStudioOrderContext = createContext<SavedStudioOrderController | null>(
  null,
);

export const useSavedStudioOrders = (): SavedStudioOrderController | null =>
  useContext(SavedStudioOrderContext);

export const SavedStudioOrderProvider = ({
  children,
  onHydrateSavedOrder,
  inspectActiveDraft,
}: {
  children: ReactNode;
  onHydrateSavedOrder: (input: {
    item: SavedStudioOrderItemV1;
    mode: SavedStudioOrderHydrateMode;
  }) => Promise<void>;
  inspectActiveDraft: () => Promise<GuestDesignDraft | null>;
}) => {
  const currentUser = useAppStore((state) => state.currentUser);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setPendingRedirect = useAppStore((state) => state.setPendingRedirect);
  const setCheckoutIntent = useAppStore((state) => state.setCheckoutIntent);
  const setNotification = useAppStore((state) => state.setNotification);
  const fabrics = useAppStore((state) => state.fabrics);
  const fabricsLoadState = useAppStore((state) => state.fabricsLoadState);
  const batches = useAppStore((state) => state.batches);
  const ownerUid = currentUser?.ownerUid ?? null;
  const [items, setItems] = useState<SavedStudioOrderItemV1[]>([]);
  const [loadedOwnerUid, setLoadedOwnerUid] = useState<string | null>(null);
  const [pendingPriceCheck, setPendingPriceCheck] =
    useState<SavedStudioOrderPriceCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [replaceItem, setReplaceItem] = useState<SavedStudioOrderItemV1 | null>(
    null,
  );
  const [replaceLabel, setReplaceLabel] = useState("");
  const [changeWarnings, setChangeWarnings] = useState<
    SavedStudioOrderChangeWarning[]
  >([]);

  useEffect(() => {
    setLoadedOwnerUid(null);
    if (!ownerUid) {
      setItems([]);
      return;
    }
    return getSavedStudioOrderRepository().subscribe(ownerUid, (snapshot) => {
      setItems(snapshot.items);
      setLoadedOwnerUid(ownerUid);
    });
  }, [ownerUid]);

  useEffect(() => {
    if (ownerUid) return;
    if (activeTab === "login" || activeTab === "design") return;
    if (hasPendingSaveStudioOrder()) clearPendingSaveStudioOrder();
  }, [activeTab, ownerUid]);

  const saveDraft = useCallback<SavedStudioOrderController["saveDraft"]>(
    async (input) => {
      if (!ownerUid) {
        return {
          status: "invalid",
          item: null,
          reason: "not_signed_in",
        };
      }
      setBusy(true);
      try {
        const result = await getSavedStudioOrderRepository().save({
          ownerUid,
          ...input,
        });
        if (result.status === "cap_reached") setCapOpen(true);
        if (result.status === "error") {
          setNotification({
            message: result.message,
            type: "info",
          });
        }
        return result;
      } finally {
        setBusy(false);
      }
    },
    [ownerUid, setNotification],
  );

  const rename = useCallback(
    async (item: SavedStudioOrderItemV1, name: string) => {
      if (!ownerUid) return;
      const result = await getSavedStudioOrderRepository().rename({
        ownerUid,
        savedOrderId: item.savedOrderId,
        name,
      });
      if (result.status === "invalid") {
        setNotification({
          message: "Use a name between 1 and 60 characters.",
          type: "info",
        });
      } else if (result.status === "absent") {
        setNotification({
          message: "This saved order was already deleted.",
          type: "info",
        });
      } else if (result.status === "error") {
        setNotification({
          message: "We couldn't rename this saved order. Check your connection and try again.",
          type: "info",
        });
      }
    },
    [ownerUid, setNotification],
  );

  const remove = useCallback(
    async (item: SavedStudioOrderItemV1) => {
      if (!ownerUid) return;
      const result = await getSavedStudioOrderRepository().remove({
        ownerUid,
        savedOrderId: item.savedOrderId,
      });
      if (result.status === "error") {
        setNotification({
          message: "We couldn't delete this saved order. Check your connection and try again.",
          type: "info",
        });
      }
    },
    [ownerUid, setNotification],
  );

  const removeById = useCallback(
    async (savedOrderId: string) => {
      if (!ownerUid) return;
      await getSavedStudioOrderRepository().remove({ ownerUid, savedOrderId });
    },
    [ownerUid],
  );

  const hydrate = useCallback(
    async (item: SavedStudioOrderItemV1, mode: SavedStudioOrderHydrateMode) => {
      // Price is NOT compared here: the saved draft's own total always equals
      // the snapshot. The Studio recomputes from the live catalogue after
      // Continue and calls resolvePriceCheck.
      const warnings = evaluateSavedStudioOrderChangeWarnings({
        item,
        liveFabrics: fabrics,
        liveBatches: batches,
        fabricCatalogueLoaded: fabricsLoadState === "ready" && fabrics.length > 0,
      });
      setChangeWarnings(warnings);
      setPendingPriceCheck({
        savedOrderId: item.savedOrderId,
        savedTotal: item.priceSnapshot.total,
      });
      try {
        await onHydrateSavedOrder({ item, mode });
      } catch {
        setPendingPriceCheck(null);
        setChangeWarnings([]);
        setNotification({
          message: "We couldn't open this saved order. Check your connection and try again.",
          type: "info",
        });
        return;
      }
      setActiveTab("design");
    },
    [
      batches,
      fabrics,
      fabricsLoadState,
      onHydrateSavedOrder,
      setActiveTab,
      setNotification,
    ],
  );

  const resolvePriceCheck = useCallback(
    (liveTotal: number | null) => {
      setPendingPriceCheck((check) => {
        if (!check) return check;
        const warning = evaluateSavedStudioOrderPriceChange({
          savedTotal: check.savedTotal,
          liveTotal,
        });
        if (warning) {
          setChangeWarnings((current) =>
            current.some((entry) => entry.code === "price_changed")
              ? current
              : [...current, warning],
          );
        }
        return null;
      });
    },
    [],
  );

  const requestContinue = useCallback(
    async (item: SavedStudioOrderItemV1) => {
      const active = await inspectActiveDraft();
      if (
        hasConflictingActiveStudioDraft({
          activeDraft: active,
          continuingSavedOrderId: item.savedOrderId,
        })
      ) {
        setReplaceLabel(active ? describeUnfinishedOrder(active) : "your current order");
        setReplaceItem(item);
        return;
      }
      await hydrate(item, "overwrite");
    },
    [hydrate, inspectActiveDraft],
  );

  const beginGuestSaveSignIn = useCallback(() => {
    markPendingSaveStudioOrder();
    setCheckoutIntent(false);
    setPendingRedirect("design");
    setActiveTab("login");
    setNotification({
      message: "Sign in to save this order to your dashboard and cart.",
      type: "info",
    });
  }, [setActiveTab, setCheckoutIntent, setNotification, setPendingRedirect]);

  const consumePendingSave = useCallback(() => {
    if (!hasPendingSaveStudioOrder()) return false;
    clearPendingSaveStudioOrder();
    return true;
  }, []);

  const loaded = Boolean(ownerUid) && loadedOwnerUid === ownerUid;

  // Fail safe: while a signed-in customer's saved orders are still loading,
  // treat every upload as retained so nothing is hard-deleted on a guess.
  const isUploadedSourceRetained = useCallback(
    (sourceRef: string) => {
      if (!ownerUid) return false;
      if (!loaded) return true;
      return isUploadedSourceReferencedBySavedOrders(sourceRef, items);
    },
    [items, loaded, ownerUid],
  );

  const value = useMemo<SavedStudioOrderController>(
    () => ({
      items,
      loaded,
      busy,
      pendingPriceCheck,
      resolvePriceCheck,
      changeWarnings,
      setChangeWarnings,
      saveDraft,
      rename,
      remove,
      requestContinue,
      beginGuestSaveSignIn,
      consumePendingSave,
      isUploadedSourceRetained,
      removeById,
    }),
    [
      beginGuestSaveSignIn,
      busy,
      loaded,
      pendingPriceCheck,
      resolvePriceCheck,
      changeWarnings,
      consumePendingSave,
      isUploadedSourceRetained,
      items,
      remove,
      removeById,
      rename,
      requestContinue,
      saveDraft,
    ],
  );

  return (
    <SavedStudioOrderContext.Provider value={value}>
      {children}
      <SavedOrderCapDialog
        open={capOpen}
        onClose={() => setCapOpen(false)}
        onOpenDashboard={() => {
          setCapOpen(false);
          setActiveTab("dashboard");
          if (typeof window !== "undefined") {
            window.location.hash = SAVED_STUDIO_ORDER_DASHBOARD_HASH;
          }
        }}
      />
      <SavedOrderReplaceDialog
        open={Boolean(replaceItem)}
        busy={busy}
        unfinishedOrderLabel={replaceLabel}
        onCancel={() => setReplaceItem(null)}
        onReplace={() => {
          const item = replaceItem;
          setReplaceItem(null);
          if (item) void hydrate(item, "replace");
        }}
        onSaveCurrentFirst={() => {
          const item = replaceItem;
          setReplaceItem(null);
          if (!item) return;
          void (async () => {
            const active = await inspectActiveDraft();
            if (!active) {
              await hydrate(item, "overwrite");
              return;
            }
            const saved = await saveDraft({
              draft: active,
              savedStage: active.currentStageId ?? "garment_type",
              savedStep: active.currentStep,
              resumeLocus: active.resumeLocus ?? null,
            });
            if (saved.status === "cap_reached") return;
            if (saved.status !== "saved" && saved.status !== "updated") {
              setNotification({
                message: SAVED_STUDIO_ORDER_RETRY_MESSAGE,
                type: "info",
              });
              return;
            }
            await hydrate(item, "overwrite");
          })();
        }}
      />
    </SavedStudioOrderContext.Provider>
  );
};

export const inspectGuestOrLoadedActiveDraft = async (): Promise<GuestDesignDraft | null> =>
  GuestOrderSessionService.getFutureDesignDraft();
