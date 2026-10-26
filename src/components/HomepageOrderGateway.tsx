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
  getHomepageJoinBatchDeadlineLabel,
  getHomepageJoinBatchDeadlinePill,
  getHomepageJoinBatchDescription,
  getHomepageJoinBatchLabel,
  type HomepageOrderGatewayState,
} from "../utils/homepageOrderGateway";
import {
  getHomepageProvisionalJoinBatchView,
  type HomepageJoinBatchCacheEntry,
} from "../utils/homepageJoinBatchCache";

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
  /**
   * Last Join card outcome from localStorage, used only while isLoading. A
   * cached batch renders the Join card at once with its button disabled until
   * the live snapshot confirms it; "none" leaves the Join slot out.
   */
  provisionalJoin?: HomepageJoinBatchCacheEntry | null;
}

export type HomepageJoinSlot =
  | { kind: "hidden" }
  | { kind: "placeholder" }
  | {
      kind: "live" | "cached";
      name: string | undefined;
      text: string;
      closed: boolean;
      deadlinePill: string | null;
      /** Full pill text: "Closes …", "Open until …" or "Open · ongoing". */
      deadlineLabel: string | null;
      /** Button text, or null for a closed card with no next open batch. */
      label: string | null;
      /** Batch the button joins (live card only). */
      joinTarget: Batch | null;
    };

export interface HomepageClosedJoinBatch {
  /** Current batch whose end date closed it (getHomepageClosedCurrentBatch). */
  closedBatch?: Batch | null;
  /** Next truly joinable batch (getNextOpenCommunityBatch), or null. */
  nextOpenBatch?: Batch | null;
}

export const getJoinNextOpenBatchButtonLabel = (batchName: string): string =>
  `Join next open batch: ${batchName}`;

/**
 * Only the Join card depends on batch data. While the first batches snapshot
 * loads it shows the cached batch (click blocked) or a placeholder; every
 * other card renders and works immediately.
 */
export function resolveHomepageJoinSlot(
  joinBatch: Batch | null,
  isLoading: boolean,
  provisionalJoin: HomepageJoinBatchCacheEntry | null | undefined,
  now: Date = new Date(),
  { closedBatch = null, nextOpenBatch = null }: HomepageClosedJoinBatch = {},
): HomepageJoinSlot {
  if (!isLoading) {
    // A closed current batch keeps its card; it never moves the customer.
    const cardBatch = closedBatch ?? joinBatch;
    if (!cardBatch) return { kind: "hidden" };
    const description = getHomepageJoinBatchDescription(cardBatch, now);
    const nextBatch =
      description.closed && nextOpenBatch && nextOpenBatch.id !== cardBatch.id
        ? nextOpenBatch
        : null;
    const joinTarget = description.closed ? nextBatch : cardBatch;
    return {
      kind: "live",
      name: cardBatch.name?.trim() || undefined,
      text: description.text,
      closed: description.closed,
      deadlinePill: getHomepageJoinBatchDeadlinePill(cardBatch, now),
      deadlineLabel: getHomepageJoinBatchDeadlineLabel(cardBatch, now),
      label: description.closed
        ? nextBatch
          ? getJoinNextOpenBatchButtonLabel(nextBatch.name)
          : null
        : getJoinCurrentBatchButtonLabel(cardBatch.name, false),
      joinTarget,
    };
  }
  if (provisionalJoin?.kind === "none") return { kind: "hidden" };
  const view =
    provisionalJoin?.kind === "batch"
      ? getHomepageProvisionalJoinBatchView(provisionalJoin.batch, now)
      : null;
  if (!view) return { kind: "placeholder" };
  return {
    kind: "cached",
    name: view.name,
    text: view.text,
    closed: false,
    deadlinePill: view.deadlinePill,
    deadlineLabel: view.deadlineLabel,
    label: getJoinCurrentBatchButtonLabel(view.name, false),
    joinTarget: null,
  };
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
  provisionalJoin = null,
}: HomepageOrderGatewayProps) {
  const { joinBatch, minimumGarments, closedBatch = null, nextOpenBatch = null } = state;
  const joinSlot = resolveHomepageJoinSlot(
    joinBatch,
    isLoading,
    provisionalJoin,
    new Date(),
    { closedBatch, nextOpenBatch },
  );
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

      <div
        className={`${orderGridClassName} ${
          joinSlot.kind === "hidden" ? "xl:grid-cols-3" : "xl:grid-cols-4"
        }`}
      >
        {joinSlot.kind === "placeholder" && (
          <article
            data-join-batch-placeholder
            aria-busy="true"
            aria-label="Loading the current community batch"
            className={orderCardFeaturedClassName}
          >
            <div className={cardTopRowClassName}>
              <span className={iconWellClassName}>
                <Users size={28} aria-hidden="true" />
              </span>
              <span className="h-6 w-24 animate-pulse rounded-full bg-heritage-gold/30" />
            </div>
            <h3 className={orderCardTitleClassName}>
              Join an Existing Batch or Group
            </h3>
            {/* Text lines follow how the live description wraps at each width
                (4 lines at 320 and xl, 3 at 375-1023, 2 at lg) to avoid a jump. */}
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-heritage-cream" />
            <div className="mt-[13px] h-3 w-full animate-pulse rounded bg-heritage-cream" />
            <div className="mt-[13px] h-3 w-11/12 animate-pulse rounded bg-heritage-cream lg:hidden xl:block" />
            <div className="mt-[13px] hidden h-3 w-3/5 animate-pulse rounded bg-heritage-cream max-[359px]:block xl:block" />
            <div className="mt-5 h-8 w-40 animate-pulse rounded-full bg-heritage-green/15" />
            <ul className="mt-3 flex flex-wrap gap-2">
              {groupMetaChips.map((chip) => (
                <li key={chip} className={chipClassName}>
                  {chip}
                </li>
              ))}
            </ul>
            <div className={ctaSpacerClassName} />
            <div className="h-12 w-full animate-pulse rounded-xl bg-heritage-gold/30" />
          </article>
        )}

        {(joinSlot.kind === "live" || joinSlot.kind === "cached") && (
          <article
            data-join-batch-source={joinSlot.kind}
            className={
              joinSlot.closed ? orderCardClassName : orderCardFeaturedClassName
            }
          >
            <div className={cardTopRowClassName}>
              <span className={iconWellClassName}>
                <Users size={28} aria-hidden="true" />
              </span>
              {joinSlot.name && (
                <span
                  data-join-batch-badge
                  className="min-w-0 break-words rounded-full bg-heritage-gold px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-heritage-green"
                >
                  {joinSlot.name}
                </span>
              )}
            </div>
            <h3 className={orderCardTitleClassName}>
              Join an Existing Batch or Group
            </h3>

            <p
              className={orderCardBodyClassName}
              data-join-batch-state={joinSlot.closed ? "closed" : "open"}
            >
              {joinSlot.text}
            </p>
            {joinSlot.deadlineLabel && (
              <p
                data-join-batch-deadline
                className="mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-heritage-green px-3.5 py-1.5 text-[13px] font-semibold text-heritage-cream"
              >
                <CalendarClock
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 text-heritage-gold"
                />
                {joinSlot.deadlineLabel}
              </p>
            )}
            <ul
              className={
                joinSlot.deadlineLabel ? "mt-3 flex flex-wrap gap-2" : chipListClassName
              }
            >
              {groupMetaChips.map((chip) => (
                <li key={chip} className={chipClassName}>
                  {chip}
                </li>
              ))}
            </ul>

            <div className={ctaSpacerClassName} />
            {joinSlot.label && (
              <button
                id="btn-quick-join-cohort"
                type="button"
                data-join-next-open-batch={joinSlot.closed ? "true" : undefined}
                onClick={(() => {
                  const target = joinSlot.joinTarget;
                  return joinSlot.kind === "live" && !isLoading && target
                    ? () => onJoinBatch(target)
                    : undefined;
                })()}
                disabled={joinSlot.kind !== "live" || isLoading}
                aria-busy={joinSlot.kind === "cached" ? true : undefined}
                className={`${
                  joinSlot.closed ? primaryCtaClassName : featuredCtaClassName
                } disabled:cursor-wait disabled:opacity-80`}
              >
                {joinSlot.label}
                <ArrowRight size={16} aria-hidden="true" className="shrink-0" />
              </button>
            )}
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
            onClick={onCreatePrivateBatch}
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
    </section>
  );
}
