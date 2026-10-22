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

export type SavedStudioOrderController = {
  items: SavedStudioOrderItemV1[];
  busy: boolean;
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
  const batches = useAppStore((state) => state.batches);
  const ownerUid = currentUser?.ownerUid ?? null;
  const [items, setItems] = useState<SavedStudioOrderItemV1[]>([]);
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
    if (!ownerUid) {
      setItems([]);
      return;
    }
    return getSavedStudioOrderRepository().subscribe(ownerUid, (snapshot) => {
      setItems(snapshot.items);
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
      }
    },
    [ownerUid, setNotification],
  );

  const remove = useCallback(
    async (item: SavedStudioOrderItemV1) => {
      if (!ownerUid) return;
      await getSavedStudioOrderRepository().remove({
        ownerUid,
        savedOrderId: item.savedOrderId,
      });
    },
    [ownerUid],
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
      const warnings = evaluateSavedStudioOrderChangeWarnings({
        item,
        liveFabrics: fabrics,
        liveBatches: batches,
        recomputedTotal:
          typeof item.draft.pricingBreakdown?.total === "number"
            ? item.draft.pricingBreakdown.total
            : null,
      });
      setChangeWarnings(warnings);
      await onHydrateSavedOrder({ item, mode });
      setActiveTab("design");
    },
    [batches, fabrics, onHydrateSavedOrder, setActiveTab],
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

  const isUploadedSourceRetained = useCallback(
    (sourceRef: string) =>
      isUploadedSourceReferencedBySavedOrders(sourceRef, items),
    [items],
  );

  const value = useMemo<SavedStudioOrderController>(
    () => ({
      items,
      busy,
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
