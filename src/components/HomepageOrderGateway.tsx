import {
  ArrowRight,
  Camera,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import type { HomepageOrderGatewayState } from "../utils/homepageOrderGateway";

interface HomepageOrderGatewayProps {
  state: HomepageOrderGatewayState;
  isLoading?: boolean;
  onJoinBatch: () => void;
  onCreatePrivateBatch: () => void;
  onBrowseGallery: () => void;
  onManageSourcingBatches?: () => void;
}

export default function HomepageOrderGateway({
  state,
  isLoading = false,
  onJoinBatch,
  onCreatePrivateBatch,
  onBrowseGallery,
  onManageSourcingBatches,
}: HomepageOrderGatewayProps) {
  const { joinBatch, minimumGarments } = state;

  return (
    <section
      aria-labelledby="homepage-order-gateway-title"
      className="relative z-20 overflow-hidden rounded-lg border border-heritage-gold/25 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-heritage-gold/15 px-5 py-3 sm:px-6">
        <h2
          id="homepage-order-gateway-title"
          className="font-display text-xl font-bold text-heritage-green sm:text-2xl"
        >
          Start Your Order
        </h2>
        {onManageSourcingBatches && (
          <button
            type="button"
            onClick={onManageSourcingBatches}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-[10px] font-bold uppercase text-heritage-green/70 transition-colors hover:bg-heritage-cream hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
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
          className="grid gap-px bg-heritage-gold/15 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]"
        >
          {[0, 1].map((item) => (
            <div
              key={item}
              className="min-h-[168px] animate-pulse bg-white p-5 sm:p-6"
            >
              <div className="h-10 w-10 rounded-lg bg-heritage-cream" />
              <div className="mt-4 h-4 w-2/3 rounded bg-heritage-cream" />
              <div className="mt-3 h-3 w-full rounded bg-heritage-cream/70" />
              <div className="mt-2 h-3 w-4/5 rounded bg-heritage-cream/70" />
            </div>
          ))}
          <div className="min-h-[112px] animate-pulse bg-heritage-cream/45 p-5 sm:p-6 lg:min-h-full">
            <div className="h-11 w-full rounded-lg bg-white/80" />
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-px bg-heritage-gold/15 ${
            joinBatch
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]"
              : "lg:grid-cols-[minmax(0,1fr)_220px]"
          }`}
        >
          {joinBatch && (
            <article className="flex min-h-[168px] flex-col bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-heritage-green text-heritage-gold">
                  <Users size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-heritage-gold">
                    Order Type B
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-heritage-green">
                    Join {joinBatch.name}
                  </h3>
                </div>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-heritage-ink/70">
                Join the currently open community batch before its ordering
                deadline.
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase text-heritage-green/70">
                Group minimum: {minimumGarments} garments total | Shared
                shipping
              </p>

              <button
                id="btn-quick-join-cohort"
                type="button"
                onClick={onJoinBatch}
                className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-heritage-green px-4 py-2.5 text-[11px] font-bold uppercase text-white transition-colors hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                Join {joinBatch.name}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </article>
          )}

          <article className="flex min-h-[168px] flex-col bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-heritage-cream text-heritage-green">
                <UserPlus size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-heritage-gold">
                  Order Type C
                </p>
                <h3 className="mt-1 font-display text-xl font-bold text-heritage-green">
                  Create a Private Batch
                </h3>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-heritage-ink/70">
              Create a private group for friends, family, colleagues, or
              community members to order together.
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase text-heritage-green/70">
              Group minimum: {minimumGarments} garments total | Shared shipping
            </p>

            <button
              id="btn-create-private-batch"
              type="button"
              onClick={onCreatePrivateBatch}
              className="mt-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-heritage-green bg-white px-4 py-2.5 text-[11px] font-bold uppercase text-heritage-green transition-colors hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              Create Private Batch
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </article>

          <div className="flex min-h-[112px] items-center bg-heritage-cream/45 p-5 sm:p-6 lg:min-h-full">
            <button
              id="btn-quick-gallery"
              type="button"
              onClick={onBrowseGallery}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-heritage-gold/35 bg-white px-4 py-2.5 text-[11px] font-bold uppercase text-heritage-green transition-colors hover:border-heritage-gold hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
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
