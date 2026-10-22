import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatSavedStudioOrderDate,
  getSavedStudioOrderStageTitle,
  SAVED_STUDIO_ORDER_DASHBOARD_HASH,
  type SavedStudioOrderItemV1,
} from "../utils/savedStudioOrderModel";

export const SavedOrdersSection = ({
  items,
  busyId = null,
  onContinue,
  onRename,
  onDelete,
}: {
  items: readonly SavedStudioOrderItemV1[];
  busyId?: string | null;
  onContinue: (item: SavedStudioOrderItemV1) => void;
  onRename: (item: SavedStudioOrderItemV1, name: string) => void;
  onDelete: (item: SavedStudioOrderItemV1) => void;
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SavedStudioOrderItemV1 | null>(
    null,
  );

  return (
    <section
      id={SAVED_STUDIO_ORDER_DASHBOARD_HASH}
      data-testid="saved-orders-section"
      className="space-y-4 rounded-3xl border border-heritage-gold/15 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
        <Bookmark className="text-heritage-gold" size={18} />
        <h3 className="font-serif text-base font-bold uppercase tracking-wider text-heritage-green">
          Saved Orders
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-heritage-ink/70">
          Saved orders will appear here after you tap Save Order in Design Studio.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.savedOrderId}
            data-testid="saved-order-card"
            data-saved-order-id={item.savedOrderId}
            className="relative flex flex-col justify-between space-y-3 rounded-2xl border border-heritage-gold/20 bg-heritage-cream/10 p-4 text-left font-sans"
          >
            <div className="space-y-2">
              {renamingId === item.savedOrderId ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onRename(item, renameValue);
                    setRenamingId(null);
                  }}
                >
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green">
                    Rename
                    <input
                      value={renameValue}
                      maxLength={60}
                      data-testid="saved-order-rename-input"
                      onChange={(event) => setRenameValue(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-heritage-gold/30 px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="min-h-11 flex-1 rounded-lg bg-heritage-green px-3 text-[10px] font-bold uppercase text-white"
                    >
                      Save name
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="min-h-11 rounded-lg border border-heritage-green/20 px-3 text-[10px] font-bold uppercase text-heritage-green"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <h5 className="font-serif text-sm font-bold text-heritage-green">
                    {item.name}
                  </h5>
                  <p className="text-[10px] font-medium leading-relaxed text-heritage-ink/70">
                    {item.garmentSummary || "Saved order"}
                  </p>
                  <p className="text-[10px] font-medium text-heritage-ink/70">
                    Saved at {getSavedStudioOrderStageTitle(item.savedStage)}
                  </p>
                  <p className="text-[10px] font-medium text-heritage-ink/70">
                    Last saved {formatSavedStudioOrderDate(item.updatedAt)}
                  </p>
                </>
              )}
            </div>
            {renamingId === item.savedOrderId ? null : (
              <div className="flex gap-2 border-t border-gray-100 pt-2">
                <button
                  type="button"
                  disabled={busyId === item.savedOrderId}
                  data-testid="saved-order-continue"
                  onClick={() => onContinue(item)}
                  className="min-h-11 flex-1 rounded-lg bg-heritage-green px-2 text-[9px] font-bold uppercase text-white"
                >
                  Continue
                </button>
                <button
                  type="button"
                  data-testid="saved-order-rename"
                  onClick={() => {
                    setRenamingId(item.savedOrderId);
                    setRenameValue(item.name);
                  }}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-heritage-green/20 text-heritage-green"
                  aria-label="Rename"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  data-testid="saved-order-delete"
                  onClick={() => setPendingDelete(item)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-red-200 text-red-600"
                  aria-label="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {pendingDelete ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4"
          data-testid="saved-order-delete-confirm"
        >
          <p className="text-sm font-medium text-red-800">
            Delete “{pendingDelete.name}”? It will leave your dashboard and cart.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="saved-order-delete-confirm-yes"
              onClick={() => {
                onDelete(pendingDelete);
                setPendingDelete(null);
              }}
              className="min-h-11 rounded-lg bg-red-600 px-4 text-xs font-bold uppercase text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="min-h-11 rounded-lg border border-heritage-green/20 px-4 text-xs font-bold uppercase text-heritage-green"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};
