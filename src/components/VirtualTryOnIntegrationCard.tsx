import React, { useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Info,
} from "lucide-react";
import { StyleCategory, Fabric } from "../types";
import { useAppStore } from "../store/useAppStore";

import virtualTryOnConcept from "../assets/images/regenerated_image_1782898035247.png";

interface VirtualTryOnIntegrationCardProps {
  /**
   * Reserved for future try-on API provider (e.g. 'FASHN', 'Kling AI', 'VTON')
   */
  apiProvider?: string;
  /**
   * Reserved for tracking API request status
   */
  apiStatus?: "idle" | "loading" | "success" | "error";
  /**
   * Reserved to flag when API credentials and systems are ready for production
   */
  integrationReady?: boolean;
  /**
   * Reserved for holding the rendered preview image output
   */
  previewImage?: string | null;
  /**
   * The currently selected design style (StyleCategory)
   */
  Style?: StyleCategory;
  /**
   * The currently selected fabric swatch
   */
  selectedFabric?: Fabric;
  /**
   * The currently active selected design custom details
   */
  selectedCustomDetails?: {
    collar: string;
    embroidery: string;
    sleeve: string;
    pocket: string;
    hasLining: boolean;
    addonBead: boolean;
    addonName: boolean;
  };
  /**
   * Alias props for compatibility with parent parameters
   */
  selectedStyle?: StyleCategory;
  selectedDesign?: unknown;
  onNotificationTrigger?: (message: string, type: "success" | "info") => void;
}

/**
 * FUTURE DEVELOPER INTEGRATION NOTES:
 * ----------------------------------
 * This component is reserved for future integration with the FASHN AI API (or another virtual try-on provider).
 *
 * Future workflow:
 * 1. The customer configures their outfit:
 *    - Design Style (e.g. Style)
 *    - Fabric (e.g. selectedFabric)
 *    - Custom Details (e.g. )
 * 2. The application sends the selected configuration to the external AI Virtual Try-On API.
 * 3. The API processes the parameters and generates a realistic image of the configured outfit on a model.
 * 4. The generated image (previewImage) is returned and displayed inside this card.
 *
 * API Endpoint Payload Draft:
 * {
 *   "model_pose": "neutral_standing_male",
 *   "garment_category": "men_traditional_suit",
 *   "design_style_id": Style?.id,
 *   "fabric_texture_url": selectedFabric?.textureUrl || selectedFabric?.image,
 *   "custom_accents": {
 *     "collar": ?.collar,
 *     "embroidery": ?.embroidery,
 *     "sleeve": ?.sleeve
 *   }
 * }
 */
export default function VirtualTryOnIntegrationCard({
  apiProvider = "FASHN AI API",
  apiStatus = "idle",
  integrationReady = false,
  previewImage = null,
  Style,
  selectedFabric,
  selectedStyle,
  onNotificationTrigger,
}: VirtualTryOnIntegrationCardProps) {
  // Gracefully merge aliases
  const activeStyle = Style || selectedStyle;
  const activeFabric = selectedFabric;

  const { businessSettings } = useAppStore();
  const activeImage =
    businessSettings.applicationSettings.virtualTryOnConceptImage ||
    virtualTryOnConcept;

  const [email, setEmail] = useState("");
  const [interestRegistered, setInterestRegistered] = useState(false);
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const triggerLocalNotification = (msg: string) => {
    if (onNotificationTrigger) {
      onNotificationTrigger(msg, "success");
    } else {
      setShowNotification(msg);
      setTimeout(() => setShowNotification(null), 4000);
    }
  };

  const handleNotifyMe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      alert("Please enter a valid email address.");
      return;
    }
    setInterestRegistered(true);
    triggerLocalNotification(`Bespoke Early Access logged for ${email}!`);
  };

  return (
    <div id="virtual-try-on-premium-section" className="space-y-6">
      {/* Step Header */}
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center sm:items-center justify-center sm:justify-start gap-2">
          <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider">
            Step 4 of 9
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-0.5 bg-heritage-gold/10 text-heritage-gold text-[9px] font-black uppercase rounded-full tracking-widest border border-heritage-gold/25 shadow-xs">
            <Sparkles
              size={10}
              className="fill-current animate-pulse text-heritage-gold"
            />{" "}
            Coming Soon
          </span>
        </div>

        <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green flex items-center justify-center sm:justify-start gap-2">
          AI Virtual Try-On
        </h2>
        <p className="text-xs text-heritage-ink/75 leading-relaxed">
          Preview your selected garment on a realistic human model using
          AI-powered virtual try-on technology. The system will automatically
          combine the selected <strong>Design Style</strong>,{" "}
          <strong>Fabric</strong>, and <strong>Custom Details</strong> to
          generate a realistic preview of the finished outfit. This feature will
          be powered by a third-party AI API in a future release.
        </p>
      </div>

      {/* Luxury Promo Showcase Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-heritage-forest via-heritage-green to-heritage-forest border border-heritage-gold/30 rounded-3xl p-6 sm:p-8 text-white shadow-xl space-y-8">
        {/* Prominent Concept Illustration Showcase Section */}
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-heritage-gold/15 text-heritage-gold text-[10px] font-bold uppercase tracking-wider rounded-full border border-heritage-gold/30 shadow-xs">
            ✨ Interactive Concept Design
          </span>
          <h3 className="text-xl font-serif font-bold text-white tracking-tight uppercase">
            Virtual Try-On Showcase
          </h3>

          {/* Showcase Image Frame */}
          <div className="relative flex items-center justify-center overflow-hidden rounded-3xl border-4 border-heritage-gold/45 shadow-2xl group w-full sm:w-auto max-w-full bg-[#050806]">
            <img
              loading="lazy"
              src={activeImage}
              alt="AI Virtual Try-On Concept"
              className="w-full sm:w-auto h-auto max-h-[80vh] object-contain transition-transform duration-700 group-hover:scale-105"
              referrerPolicy="no-referrer"
            />
            {/* Elegant vignette overlays and mock tags to match the concept theme */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none" />

            {/* Custom mock overlay controls simulating a real active try-on screen */}
            <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
              <span className="bg-black/50 backdrop-blur-xs text-white text-[10px] font-bold px-3 py-1 rounded-lg border border-white/15">
                ← Back
              </span>
            </div>

            {/* Dynamic Outfit badge info */}
            <div className="absolute bottom-4 left-4 right-4 flex flex-col sm:flex-row items-start sm:items-center justify-between text-left bg-black/70 backdrop-blur-md p-4 rounded-2xl border border-white/15 gap-3">
              <div className="min-w-0 flex-1 w-full pr-2">
                <span className="text-[10px] uppercase tracking-wider text-heritage-gold font-bold block mb-0.5">
                  Bespoke Outfit Selection
                </span>
                <strong className="text-sm text-white block truncate">
                  {activeStyle?.name || "Classic Senator"}
                </strong>
                <span className="text-[11px] text-white/80 block truncate font-mono mt-1">
                  Fabric: {activeFabric?.name || "Premium Cotton Swatch"}
                </span>
              </div>
              <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                <span className="px-4 py-2 bg-heritage-gold text-heritage-forest rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center justify-center">
                  AI Fit
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Explanatory Text Section */}
        <div className="border-t border-heritage-gold/20 pt-6 space-y-6">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h4 className="text-base font-serif font-bold text-heritage-gold uppercase tracking-wider">
              Visualize Your Bespoke Attire
            </h4>
            <p className="text-xs text-heritage-beige/85 leading-relaxed font-sans">
              Designed as a premium extension, this interactive experience
              allows customers to preview the perfect combination of traditional
              silhouette and selected fabric before finalizing bespoke tailoring
              and payment.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto text-xs font-sans">
            <div className="p-4 rounded-2xl bg-heritage-green/45 border border-heritage-gold/15 space-y-2 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-2 text-heritage-gold font-serif font-semibold">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-heritage-gold/25 text-heritage-gold text-[10px] font-mono">
                  1
                </span>
                <span>Select Silhouette</span>
              </div>
              <p className="text-[11px] text-heritage-beige/80 leading-relaxed sm:pl-7">
                Choose from timeless traditional styles including the Royal
                Senator, Grand Agbada, and executive kaftans.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-heritage-green/45 border border-heritage-gold/15 space-y-2 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-2 text-heritage-gold font-serif font-semibold">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-heritage-gold/25 text-heritage-gold text-[10px] font-mono">
                  2
                </span>
                <span>Drape Heritage Fabric</span>
              </div>
              <p className="text-[11px] text-heritage-beige/80 leading-relaxed sm:pl-7">
                Instantly map your selected premium cotton, brocade, or satin
                silk patterns onto the 3D drape coordinates.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-heritage-green/45 border border-heritage-gold/15 space-y-2 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-2 text-heritage-gold font-serif font-semibold">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-heritage-gold/25 text-heritage-gold text-[10px] font-mono">
                  3
                </span>
                <span>Verify Before Payment</span>
              </div>
              <p className="text-[11px] text-heritage-beige/80 leading-relaxed sm:pl-7">
                View the combined pattern scaling and placement to ensure
                complete styling confidence before final payment.
              </p>
            </div>
          </div>

          {/* Pricing & Interest Capture Section */}
          <div className="bg-heritage-forest/90 border border-heritage-gold/30 rounded-2xl p-5 max-w-xl mx-auto text-center space-y-4 shadow-md">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono tracking-widest text-heritage-gold block">
                ⭐ Future Premium Plugin Subscription
              </span>
              <div className="flex items-center justify-center gap-2 text-white">
                <span className="text-xl font-bold text-heritage-gold">
                  $15
                </span>
                <span className="text-xs text-heritage-beige">/ month</span>
                <span className="text-heritage-gold/40 mx-2">|</span>
                <span className="text-xl font-bold text-heritage-gold">
                  $120
                </span>
                <span className="text-xs text-heritage-beige">/ year</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {interestRegistered ? (
                <div className="flex items-center gap-2 px-5 py-2.5 bg-heritage-gold/15 border border-heritage-gold/30 text-heritage-gold rounded-xl text-xs font-bold font-mono mx-auto">
                  <CheckCircle2 size={14} />
                  <span>EARLY ACCESS REGISTERED</span>
                </div>
              ) : (
                <form
                  onSubmit={handleNotifyMe}
                  className="flex flex-col sm:flex-row items-stretch gap-2 w-full max-w-md mx-auto"
                >
                  <input
                    type="email"
                    required
                    placeholder="Enter email to pre-register..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 px-4 py-2 bg-heritage-green border border-heritage-gold/30 rounded-xl text-xs text-white placeholder-heritage-beige/50 focus:outline-none focus:ring-1 focus:ring-heritage-gold text-center sm:text-left animate-none"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2 bg-heritage-gold hover:bg-white text-heritage-forest text-xs font-bold uppercase tracking-wider rounded-xl shadow-md transition cursor-pointer select-none whitespace-nowrap"
                  >
                    Pre-Register
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Future Integration Parameters View (Hidden or Styled elegantly as notes for future developers) */}
      <div className="p-5 bg-white border border-heritage-gold/15 rounded-2xl space-y-3 font-sans">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-heritage-gold shrink-0" />
          <h4 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
            Future Developer Parameters (Reserved Specs)
          </h4>
        </div>
        <p className="text-[11px] text-heritage-ink/70 leading-relaxed">
          The following parameters are compiled into{" "}
          <code>VirtualTryOnIntegrationCardProps</code> in{" "}
          <code>src/components/VirtualTryOnIntegrationCard.tsx</code> to support
          clean connection with the <strong>FASHN API</strong> or similar
          garment-fitment providers when integration starts.
        </p>

        {/* Props Visual Inspector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-[10px] text-heritage-ink/65 bg-heritage-cream/20 p-3 rounded-xl border border-heritage-gold/10">
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">apiProvider:</span>
            <span className="text-heritage-green block mt-0.5">
              "{apiProvider}"
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">apiStatus:</span>
            <span className="text-heritage-green block mt-0.5">
              "{apiStatus}"
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">
              integrationReady:
            </span>
            <span className="text-heritage-green block mt-0.5">
              {String(integrationReady)}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">previewImage:</span>
            <span className="text-heritage-green block mt-0.5">
              {previewImage ? `"${previewImage}"` : "null"}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">
              Style:
            </span>
            <span className="text-heritage-green block mt-0.5">
              {activeStyle ? `"${activeStyle.name}"` : "undefined"}
            </span>
          </div>
          <div className="p-2 bg-white rounded border border-gray-100">
            <span className="text-heritage-gold font-bold">
              selectedFabric:
            </span>
            <span className="text-heritage-green block mt-0.5">
              {activeFabric
                ? `"${activeFabric.name}" (${activeFabric.code})`
                : "undefined"}
            </span>
          </div>
        </div>

        {/* Success toast overlay */}
        {showNotification && (
          <div className="fixed bottom-4 right-4 z-50 bg-heritage-green border border-heritage-gold text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl flex items-center gap-2 animate-fade-in">
            <Sparkles size={12} className="text-heritage-gold fill-current" />
            <span>{showNotification}</span>
          </div>
        )}
      </div>
    </div>
  );
}
