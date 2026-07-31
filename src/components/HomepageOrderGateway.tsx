import {
  ArrowRight,
  Camera,
  Settings,
  Sparkles,
  Shirt,
} from "lucide-react";
import type { HomepageOrderGatewayState } from "../utils/homepageOrderGateway";

interface HomepageOrderGatewayProps {
  state: HomepageOrderGatewayState;
  isLoading?: boolean;
  onJoinBatch: () => void;
  onCreatePrivateBatch: () => void;
  onBrowseGallery: () => void;
  onManageSourcingBatches?: () => void;
  onCustomOrder?: () => void;
}

export default function HomepageOrderGateway({
  state,
  isLoading = false,
  onJoinBatch,
  onCreatePrivateBatch,
  onBrowseGallery,
  onManageSourcingBatches,
  onCustomOrder,
}: HomepageOrderGatewayProps) {
  const { joinBatch, minimumGarments } = state;

  const handleCustomOrderClick = () => {
    if (joinBatch) {
      onJoinBatch();
    } else if (onCustomOrder) {
      onCustomOrder();
    } else {
      onJoinBatch();
    }
  };

  return (
    <section
      aria-labelledby="homepage-order-gateway-title"
      className="relative z-20 space-y-4"
    >
      <h2 id="homepage-order-gateway-title" className="sr-only">
        Start Your Order
      </h2>

      {onManageSourcingBatches && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={onManageSourcingBatches}
            className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-white border border-heritage-gold/20 px-3 text-[10px] font-bold uppercase text-heritage-green/75 transition-colors hover:bg-heritage-cream hover:text-heritage-green shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold cursor-pointer"
          >
            <Settings size={13} aria-hidden="true" />
            <span>Manage Sourcing Batches</span>
          </button>
        </div>
      )}

      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading current order options"
          className="bg-white rounded-3xl border border-heritage-gold/15 p-2.5 shadow-md flex flex-col md:flex-row gap-3 items-center w-full animate-pulse"
        >
          <div className="h-12 bg-heritage-cream/40 rounded-xl flex-1 w-full" />
          <div className="h-12 bg-heritage-cream/40 rounded-xl flex-1 w-full" />
          <div className="h-12 bg-heritage-cream/40 rounded-xl flex-1 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main buttons bar matching image.png */}
          <div className="bg-white rounded-3xl border border-heritage-gold/20 p-2.5 shadow-md flex flex-col md:flex-row gap-3 items-center w-full">
            {/* CREATE GROUP Button */}
            <button
              id="btn-create-private-batch"
              type="button"
              onClick={onCreatePrivateBatch}
              className="flex-1 w-full h-12 bg-heritage-green hover:bg-heritage-forest text-white text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-between px-5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-heritage-gold shrink-0" aria-hidden="true" />
                <span>CREATE GROUP</span>
              </div>
              <ArrowRight size={15} className="text-white shrink-0" aria-hidden="true" />
            </button>

            {/* CUSTOM ORDER Button */}
            <button
              id="btn-custom-order-quick"
              type="button"
              onClick={handleCustomOrderClick}
              className="flex-1 w-full h-12 bg-heritage-cream/35 hover:bg-heritage-cream/60 text-heritage-green text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 px-5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <Shirt size={16} className="text-heritage-gold shrink-0" aria-hidden="true" />
              <span>CUSTOM ORDER</span>
            </button>

            {/* STYLE GALLERY Button */}
            <button
              id="btn-quick-gallery"
              type="button"
              onClick={onBrowseGallery}
              className="flex-1 w-full h-12 bg-white hover:bg-heritage-cream/10 border border-heritage-gold/25 text-heritage-green text-xs font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 px-5 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              <Camera size={16} className="text-heritage-green/70 shrink-0" aria-hidden="true" />
              <span>STYLE GALLERY</span>
            </button>
          </div>

          {/* Descriptive text grid around each button */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1 px-3">
            {/* Create Group Info */}
            <div className="text-center md:text-left space-y-1">
              <h3 className="font-serif font-bold text-heritage-green text-sm">
                Create a Group
              </h3>
              <p className="text-xs text-heritage-ink/70 leading-relaxed">
                Create a private group for friends, family, or colleagues. Enjoy shared shipping with a minimum of {minimumGarments} garments total.
              </p>
            </div>

            {/* Custom Order Info */}
            <div className="text-center md:text-left space-y-1">
              <h3 className="font-serif font-bold text-heritage-green text-sm">
                Custom Order
              </h3>
              <p className="text-xs text-heritage-ink/70 leading-relaxed">
                {joinBatch ? (
                  <>
                    Join {joinBatch.name} community batch to design your tailored outfit with no group coordinating required.
                  </>
                ) : (
                  "Design custom bespoke outfits. Select styles, choose fabrics, and estimate sizes with our simple built-in size guide."
                )}
              </p>
            </div>

            {/* Style Gallery Info */}
            <div className="text-center md:text-left space-y-1">
              <h3 className="font-serif font-bold text-heritage-green text-sm">
                Browse Styles
              </h3>
              <p className="text-xs text-heritage-ink/70 leading-relaxed">
                Explore our community showcase featuring completed traditional Nigerian outfits custom-designed by and made for our members.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
