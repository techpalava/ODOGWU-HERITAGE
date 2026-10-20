import {
  ArrowRight,
  CalendarClock,
  Camera,
  Settings,
  Shirt,
  ShoppingBag,
  UserPlus,
  Users,
} from "lucide-react";
import type { Batch } from "../types";
import { HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID } from "../utils/footerBatchLink";
import {
  getHomepageJoinBatchDeadlinePill,
  getHomepageJoinBatchDescription,
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
  unfinishedOrderLabel?: string | null;
  onResumeUnfinishedOrder?: () => void;
  onJoinBatch: (batch: Batch) => void;
  onCreatePrivateBatch: () => void;
  onBrowseGallery: () => void;
  onManageSourcingBatches?: () => void;
}

const orderGridClassName =
  "grid grid-cols-1 gap-4 p-4 sm:gap-5 sm:p-6 md:grid-cols-2";
const orderCardBaseClassName =
  "flex min-w-0 flex-col rounded-2xl p-5 sm:p-6";
const orderCardClassName = `${orderCardBaseClassName} border border-heritage-gold/30 bg-white shadow-sm`;
const orderCardFeaturedClassName = `${orderCardBaseClassName} border-2 border-heritage-gold bg-white shadow-md`;
const orderCardMutedClassName = `${orderCardBaseClassName} border border-dashed border-heritage-gold/50 bg-white/60`;
const cardTopRowClassName = "flex items-start justify-between gap-3";
const orderCardTitleClassName =
  "mt-5 font-serif text-[1.35rem] font-bold leading-tight text-heritage-green break-words xl:min-h-[2.5em]";
const orderCardBodyClassName =
  "mt-2 text-[15px] leading-relaxed text-heritage-ink/80";
const chipListClassName = "mt-4 flex flex-wrap gap-2";
const chipClassName =
  "rounded-xl border border-heritage-green/15 bg-heritage-cream px-3 py-1 text-[13px] font-semibold leading-snug text-heritage-green";
const chipWarnClassName =
  "rounded-xl border border-heritage-bronze/30 bg-[#f6ede2] px-3 py-1 text-[13px] font-semibold leading-snug text-heritage-bronze";
const iconWellClassName =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-heritage-green text-heritage-gold shadow-inner ring-4 ring-heritage-gold/20";
const iconWellMutedClassName =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-heritage-cream text-heritage-green ring-1 ring-heritage-gold/40";
const ctaSpacerClassName = "min-h-6 flex-1";
const ctaBaseClassName =
  "inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-[15px] font-bold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";
const primaryCtaClassName = `${ctaBaseClassName} bg-heritage-green text-white hover:bg-heritage-forest`;
const featuredCtaClassName = `${ctaBaseClassName} bg-heritage-gold text-heritage-green shadow-sm hover:bg-[#d4b96c]`;
const galleryRowClassName = "px-4 pb-5 sm:px-6 sm:pb-6";

const splitMeta = (meta: string): string[] =>
  meta
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

export default function HomepageOrderGateway({
  state,
  isLoading = false,
  onStartIndividualOrder,
  unfinishedOrderLabel = null,
  onResumeUnfinishedOrder,
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
  const joinBatchDescription = getHomepageJoinBatchDescription(joinBatch);
  const joinDeadlinePill = getHomepageJoinBatchDeadlinePill(joinBatch);
  const groupMetaChips = splitMeta(
    `Group minimum: ${minimumGarments} garments total | Shared shipping`,
  );

  return (
    <section
      id={HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID}
      aria-labelledby="homepage-order-gateway-title"
      className="relative z-20 rounded-3xl border border-heritage-gold/30 bg-heritage-cream shadow-lg"
    >
      <div className="flex items-end justify-between gap-4 rounded-t-3xl border-b border-heritage-gold/25 bg-heritage-green px-5 py-5 sm:px-8 sm:py-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-heritage-gold/70">
            Choose how you order
          </p>
          <h2
            id="homepage-order-gateway-title"
            className="mt-1 min-w-0 font-display text-2xl font-bold tracking-wide text-heritage-gold break-words sm:text-3xl"
          >
            Start Your Order
          </h2>
        </div>
        {onManageSourcingBatches && (
          <button
            type="button"
            onClick={onManageSourcingBatches}
            className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-heritage-gold/30 px-3 text-[13px] font-semibold text-heritage-gold/90 transition-colors hover:bg-heritage-gold/15 hover:text-heritage-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            <Settings size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Manage Sourcing Batches</span>
            <span className="sm:hidden">Manage</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <>
          <div
            aria-busy="true"
            aria-label="Loading current order options"
            className={`${orderGridClassName} xl:grid-cols-4`}
          >
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className={`${orderCardClassName} min-h-[20rem] animate-pulse`}
              >
                <div className="h-14 w-14 rounded-2xl bg-heritage-cream" />
                <div className="mt-5 h-5 w-2/3 rounded bg-heritage-cream" />
                <div className="mt-3 h-3 w-full rounded bg-heritage-cream/70" />
                <div className="mt-2 h-3 w-4/5 rounded bg-heritage-cream/70" />
                <div className="mt-4 h-6 w-1/2 rounded-xl bg-heritage-cream/70" />
                <div className={ctaSpacerClassName} />
                <div className="h-12 w-full rounded-xl bg-heritage-cream/80" />
              </div>
            ))}
          </div>
          <div className={`${galleryRowClassName} animate-pulse`}>
            <div className="h-12 w-full rounded-xl bg-white/80" />
          </div>
        </>
      ) : (
        <>
          <div
            className={`${orderGridClassName} ${
              joinBatch ? "xl:grid-cols-4" : "xl:grid-cols-3"
            }`}
          >
            {joinBatch && (
              <article
                className={
                  joinBatchDescription.closed
                    ? orderCardClassName
                    : orderCardFeaturedClassName
                }
              >
                <div className={cardTopRowClassName}>
                  <span className={iconWellClassName}>
                    <Users size={28} aria-hidden="true" />
                  </span>
                  {currentBatchName && (
                    <span
                      data-join-batch-badge
                      className="min-w-0 break-words rounded-full bg-heritage-gold px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-heritage-green"
                    >
                      {currentBatchName}
                    </span>
                  )}
                </div>
                <h3 className={orderCardTitleClassName}>
                  Join an Existing Batch or Group
                </h3>

                <p
                  className={orderCardBodyClassName}
                  data-join-batch-state={
                    joinBatchDescription.closed ? "closed" : "open"
                  }
                >
                  {joinBatchDescription.text}
                </p>
                {joinDeadlinePill && (
                  <p
                    data-join-batch-deadline
                    className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-heritage-green px-3.5 py-1.5 text-[13px] font-semibold text-heritage-cream"
                  >
                    <CalendarClock
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-heritage-gold"
                    />
                    Closes {joinDeadlinePill}
                  </p>
                )}
                <ul
                  className={joinDeadlinePill ? "mt-3 flex flex-wrap gap-2" : chipListClassName}
                >
                  {groupMetaChips.map((chip) => (
                    <li key={chip} className={chipClassName}>
                      {chip}
                    </li>
                  ))}
                </ul>

                <div className={ctaSpacerClassName} />
                <button
                  id="btn-quick-join-cohort"
                  type="button"
                  onClick={
                    isLoading || !joinBatch
                      ? undefined
                      : () => onJoinBatch(joinBatch)
                  }
                  disabled={isLoading}
                  className={
                    joinBatchDescription.closed
                      ? primaryCtaClassName
                      : featuredCtaClassName
                  }
                >
                  {joinCurrentBatchButtonLabel}
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </button>
              </article>
            )}

            <article className={orderCardClassName}>
              <span className={iconWellMutedClassName}>
                <UserPlus size={28} aria-hidden="true" />
              </span>
              <h3 className={orderCardTitleClassName}>Create a Private Batch</h3>

              <p className={orderCardBodyClassName}>
                Create a private group for friends, family, colleagues, or
                community members to order together.
              </p>
              <ul className={chipListClassName}>
                {groupMetaChips.map((chip) => (
                  <li key={chip} className={chipClassName}>
                    {chip}
                  </li>
                ))}
              </ul>

              <div className={ctaSpacerClassName} />
              <button
                id="btn-create-private-batch"
                type="button"
                onClick={isLoading ? undefined : onCreatePrivateBatch}
                disabled={isLoading}
                className={primaryCtaClassName}
              >
                Create Private Batch
                <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
              </button>
            </article>

            <article className={orderCardClassName}>
              <span className={iconWellMutedClassName}>
                <Shirt size={28} aria-hidden="true" />
              </span>
              <h3 className={orderCardTitleClassName}>Individual Custom Order</h3>

              <p className={orderCardBodyClassName}>
                Order custom-made attire without joining a batch or waiting for a
                group deadline.
              </p>
              <ul className={chipListClassName}>
                <li className={chipClassName}>Independent order</li>
                <li className={chipWarnClassName}>Higher direct shipping cost</li>
              </ul>

              <div className={ctaSpacerClassName} />
              <div className="flex flex-col gap-2">
                <button
                  id="btn-start-individual-order"
                  type="button"
                  onClick={onStartIndividualOrder}
                  className={primaryCtaClassName}
                >
                  Start Individual Order
                  <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
                </button>
                {unfinishedOrderLabel && onResumeUnfinishedOrder && (
                  <button
                    id="btn-resume-unfinished-order"
                    type="button"
                    onClick={onResumeUnfinishedOrder}
                    className={`${ctaBaseClassName} border-2 border-heritage-green bg-white text-heritage-green hover:bg-heritage-green/5`}
                  >
                    Resume unfinished order
                  </button>
                )}
              </div>
            </article>

            <article className={orderCardMutedClassName}>
              <div className={cardTopRowClassName}>
                <span className={`${iconWellMutedClassName} text-heritage-green/60`}>
                  <ShoppingBag size={28} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-heritage-green/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-heritage-green/60">
                  Coming soon
                </span>
              </div>
              <h3 className={`${orderCardTitleClassName} text-heritage-green/80`}>
                Ready to Wear
              </h3>

              <p className={`${orderCardBodyClassName} text-heritage-ink/70`}>
                Choose a finished outfit in your size, pay, and have it shipped
                without entering the custom design flow.
              </p>
              <ul className={chipListClassName}>
                <li className={`${chipClassName} text-heritage-green/70`}>
                  Shipping from Lagos to Location applies.
                </li>
              </ul>

              <div className={ctaSpacerClassName} />
              <button
                id="btn-ready-to-wear"
                type="button"
                disabled
                aria-disabled="true"
                aria-label="Ready to Wear - Coming Soon"
                className={`${ctaBaseClassName} cursor-not-allowed border border-heritage-green/20 bg-heritage-cream text-heritage-green/50`}
              >
                Coming Soon
              </button>
            </article>
          </div>

          <div className={galleryRowClassName}>
            <button
              id="btn-quick-gallery"
              type="button"
              onClick={onBrowseGallery}
              className={`${ctaBaseClassName} border border-heritage-gold/50 bg-white text-heritage-green hover:border-heritage-gold`}
            >
              <Camera size={16} aria-hidden="true" />
              Browse Style Gallery
            </button>
          </div>
        </>
      )}
    </section>
  );
}
