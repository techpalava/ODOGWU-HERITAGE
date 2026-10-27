import { COMMUNITY_BATCH_CLOSED_MESSAGE } from "../utils/communityBatchOrderClosure";

export interface CommunityBatchClosedNoticeProps {
  /** Formatted date the batch stopped taking orders, when a date closed it. */
  closedOn: string | null;
  /** Next joinable community batch, offered only as an explicit choice. */
  nextBatch: { readonly id: string; readonly name: string } | null;
  onJoinNextBatch?: () => void;
  onStartIndividualOrder?: () => void;
}

/**
 * Shown above the Design Studio steps when the order's community batch is
 * closed. The customer is never moved automatically: they choose to join the
 * next open batch or start an individual order.
 */
export function CommunityBatchClosedNotice({
  closedOn,
  nextBatch,
  onJoinNextBatch,
  onStartIndividualOrder,
}: CommunityBatchClosedNoticeProps) {
  const canJoinNext = Boolean(nextBatch && onJoinNextBatch);
  return (
    <div
      role="status"
      data-testid="community-batch-closed"
      className="mb-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <p className="font-semibold">{COMMUNITY_BATCH_CLOSED_MESSAGE}</p>
      <p className="mt-1 leading-relaxed">
        {closedOn
          ? `It stopped taking new orders on ${closedOn}, so this order can't continue in this batch.`
          : "It no longer accepts new orders, so this order can't continue in this batch."}
      </p>
      {canJoinNext || onStartIndividualOrder ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canJoinNext && nextBatch ? (
            <button
              type="button"
              data-testid="community-batch-closed-join-next"
              onClick={onJoinNextBatch}
              className="rounded-full bg-heritage-green px-4 py-2 text-xs font-bold text-heritage-cream transition hover:bg-heritage-green/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Join next open batch: {nextBatch.name}
            </button>
          ) : null}
          {onStartIndividualOrder ? (
            <button
              type="button"
              data-testid="community-batch-closed-start-individual"
              onClick={onStartIndividualOrder}
              className="rounded-full border border-heritage-green/40 bg-white px-4 py-2 text-xs font-bold text-heritage-green transition hover:bg-heritage-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Start an individual order instead
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
