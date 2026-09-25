import {
  ArrowRight,
  Camera,
  Settings,
  Shirt,
  ShoppingBag,
  UserPlus,
  Users,
} from "lucide-react";
import type { Batch } from "../types";
import {
  getHomepageJoinBatchLabel,
  type HomepageOrderGatewayState,
} from "../utils/homepageOrderGateway";

export const getJoinCurrentBatchButtonLabel = (
  batchName: string | null | undefined,
  isLoading = false,
): string => getHomepageJoinBatchLabel(batchName, isLoading);

interface HomepageOrderGatewayProps {
  state: HomepageOrderGatewayState;
  isLoading?: boolean;
  onStartIndividualOrder: () => void;
  onJoinBatch: (batch: Batch) => void;
  onCreatePrivateBatch: () => void;
  onBrowseGallery: () => void;
  onManageSourcingBatches?: () => void;
}

const orderGridClassName =
  "grid grid-cols-1 auto-rows-[auto_auto_auto_auto_auto] gap-x-4 gap-y-4 p-4 sm:gap-x-5 sm:gap-y-5 sm:p-6 md:grid-cols-2";
const orderCardClassName =
  "row-span-5 grid min-h-[17.5rem] min-w-0 grid-rows-subgrid gap-y-3 rounded-2xl border border-heritage-gold/30 bg-white p-5 shadow-sm sm:p-6";
const orderCardTitleClassName =
  "self-start font-display text-lg font-bold leading-snug text-heritage-green wrap-anywhere sm:text-xl";
const orderCardBodyClassName =
  "self-start text-sm leading-relaxed text-heritage-ink";
const orderCardMetaClassName =
  "self-start text-[10px] font-bold uppercase tracking-wide text-heritage-green/70 wrap-anywhere";
const iconWellClassName =
  "flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-heritage-gold/40 bg-heritage-green text-heritage-gold";
const iconWellMutedClassName =
  "flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full border border-heritage-gold/30 bg-heritage-cream text-heritage-green";
const primaryCtaClassName =
  "inline-flex min-h-11 w-full min-w-0 flex-wrap items-center justify-center self-end gap-2 whitespace-normal wrap-anywhere rounded-lg bg-heritage-green px-4 py-2.5 text-center text-[11px] font-bold uppercase leading-snug text-white transition-colors hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";
const galleryRowClassName =
  "flex min-h-[88px] items-center rounded-2xl border border-heritage-gold/30 bg-white/80 p-4 sm:p-5 md:col-span-2 xl:col-span-full";

export default function HomepageOrderGateway({
  state,
  isLoading = false,
  onStartIndividualOrder,
  onJoinBatch,
  onCreatePrivateBatch,
  onBrowseGallery,
  onManageSourcingBatches,
}: HomepageOrderGatewayProps) {
  const { joinBatch, minimumGarments } = state;
  const currentBatchName = joinBatch?.name?.trim();
  const joinCurrentBatchButtonLabel = getJoinCurrentBatchButtonLabel(
    joinBatch?.name,
    isLoading,
  );
  const existingBatchTitle = currentBatchName
    ? `Join an Existing Batch or Group (${currentBatchName})`
    : "Join an Existing Batch or Group";

  return (
    <section
      aria-labelledby="homepage-order-gateway-title"
      className="relative z-20 rounded-3xl border border-heritage-gold/30 bg-heritage-cream shadow-lg"
    >
      <div className="flex items-center justify-between gap-4 rounded-t-3xl border-b border-heritage-gold/25 bg-heritage-green px-5 py-4 sm:px-6">
        <h2
          id="homepage-order-gateway-title"
          className="min-w-0 font-display text-xl font-bold tracking-wide text-heritage-gold wrap-anywhere sm:text-2xl"
        >
          Start Your Order
        </h2>
        {onManageSourcingBatches && (
          <button
            type="button"
            onClick={onManageSourcingBatches}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[10px] font-bold uppercase text-heritage-gold/80 transition-colors hover:bg-heritage-gold/15 hover:text-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            <Settings size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Manage Sourcing Batches</span>
            <span className="sm:hidden">Manage</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading current order options"
          className={`${orderGridClassName} xl:grid-cols-4`}
        >
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className={`${orderCardClassName} animate-pulse`}
            >
              <div className="h-11 w-11 self-start rounded-full bg-heritage-cream" />
              <div className="h-4 w-2/3 self-start rounded bg-heritage-cream" />
              <div className="h-3 w-full self-start rounded bg-heritage-cream/70" />
              <div className="h-3 w-4/5 self-start rounded bg-heritage-cream/70" />
              <div className="h-11 w-full self-end rounded-lg bg-heritage-cream/80" />
            </div>
          ))}
          <div className={`${galleryRowClassName} animate-pulse`}>
            <div className="h-11 w-full rounded-lg bg-white/80" />
          </div>
        </div>
      ) : (
        <div
          className={`${orderGridClassName} ${
            joinBatch ? "xl:grid-cols-4" : "xl:grid-cols-3"
          }`}
        >
          {joinBatch && (
            <article className={orderCardClassName}>
              <span className={iconWellClassName}>
                <Users size={19} aria-hidden="true" />
              </span>
              <h3 className={orderCardTitleClassName}>{existingBatchTitle}</h3>

              <p className={orderCardBodyClassName}>
                Join the currently open community batch before its ordering
                deadline.
              </p>
              <p className={orderCardMetaClassName}>
                Group minimum: {minimumGarments} garments total | Shared
                shipping
              </p>

              <button
                id="btn-quick-join-cohort"
                type="button"
                onClick={
                  isLoading || !joinBatch
                    ? undefined
                    : () => onJoinBatch(joinBatch)
                }
                disabled={isLoading}
                className={primaryCtaClassName}
              >
                {joinCurrentBatchButtonLabel}
                <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
              </button>
            </article>
          )}

          <article className={orderCardClassName}>
            <span className={iconWellMutedClassName}>
              <UserPlus size={19} aria-hidden="true" />
            </span>
            <h3 className={orderCardTitleClassName}>Create a Private Batch</h3>

            <p className={orderCardBodyClassName}>
              Create a private group for friends, family, colleagues, or
              community members to order together.
            </p>
            <p className={orderCardMetaClassName}>
              Group minimum: {minimumGarments} garments total | Shared shipping
            </p>

            <button
              id="btn-create-private-batch"
              type="button"
              onClick={isLoading ? undefined : onCreatePrivateBatch}
              disabled={isLoading}
              className={primaryCtaClassName}
            >
              Create Private Batch
              <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
            </button>
          </article>

          <article className={orderCardClassName}>
            <span className={iconWellClassName}>
              <Shirt size={19} aria-hidden="true" />
            </span>
            <h3 className={orderCardTitleClassName}>Individual Custom Order</h3>

            <p className={orderCardBodyClassName}>
              Order custom-made attire without joining a batch or waiting for a
              group deadline.
            </p>
            <p className={orderCardMetaClassName}>
              Independent order | Higher direct shipping cost
            </p>

            <button
              id="btn-start-individual-order"
              type="button"
              onClick={onStartIndividualOrder}
              className={primaryCtaClassName}
            >
              Start Individual Order
              <ArrowRight size={15} aria-hidden="true" className="shrink-0" />
            </button>
          </article>

          <article className={orderCardClassName}>
            <span className={iconWellMutedClassName}>
              <ShoppingBag size={19} aria-hidden="true" />
            </span>
            <h3 className={orderCardTitleClassName}>Ready to Wear</h3>

            <p className={orderCardBodyClassName}>
              Choose a finished outfit in your size, pay, and have it shipped
              without entering the custom design flow.
            </p>
            <p className={orderCardMetaClassName}>
              Shipping from Lagos to Location applies.
            </p>

            <button
              id="btn-ready-to-wear"
              type="button"
              disabled
              aria-disabled="true"
              className="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center self-end gap-2 rounded-lg border border-heritage-green/20 bg-heritage-cream px-4 py-2.5 text-[11px] font-bold uppercase leading-snug text-heritage-green/60"
            >
              Ready to Wear - Coming Soon
            </button>
          </article>

          <div className={galleryRowClassName}>
            <button
              id="btn-quick-gallery"
              type="button"
              onClick={onBrowseGallery}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-heritage-gold/40 bg-heritage-cream px-4 py-2.5 text-[11px] font-bold uppercase text-heritage-green transition-colors hover:border-heritage-gold hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <Camera size={16} aria-hidden="true" />
              Browse Style Gallery
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
