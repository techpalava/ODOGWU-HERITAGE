import React from "react";
import { useAppStore } from "../store/useAppStore";
import type { Batch } from "../types";
import {
  HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID,
  resolveFooterBatchLink,
} from "../utils/footerBatchLink";

import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Facebook,
  Instagram,
  MessageCircle,
  Music2,
  Linkedin,
  Youtube,
  ChevronRight,
} from "lucide-react";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";

interface FooterProps {
  /** Same batch the Home open-batch card joins (null when none is open). */
  joinBatch?: Batch | null;
  /** Same handler the Home Join button uses. */
  onJoinCommunityBatch?: (batch: Batch) => void;
}

const scrollToHomeOrderGateway = (attempt = 0) => {
  const target = document.getElementById(HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  // Home may still be mounting after the tab switch.
  if (attempt < 20) {
    window.setTimeout(() => scrollToHomeOrderGateway(attempt + 1), 50);
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

export default function Footer({ joinBatch = null, onJoinCommunityBatch }: FooterProps = {}) {
  const {
    activeTab,
    setActiveTab,
    requestDesignStudioFromNav,
    businessSettings,
    hasLoadedBatches,
  } = useAppStore();
  const primaryEmail =
    businessSettings?.applicationSettings?.primaryEmail?.trim() || "";
  const secondaryEmail =
    businessSettings?.applicationSettings?.secondaryEmail?.trim() || "";

  const handleNavigation = (e: React.MouseEvent, tab: string) => {
    e.preventDefault();
    if (tab === "design") {
      requestDesignStudioFromNav();
    } else {
      setActiveTab(tab as any);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const batchLink = resolveFooterBatchLink({ hasLoadedBatches, joinBatch });
  const handleBatchLink = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = batchLink.target;
    if (target.kind === "join-batch" && onJoinCommunityBatch) {
      // The footer sits at the bottom; start the Studio (or the draft
      // choice dialog) from the top, as the other footer links do.
      window.scrollTo({ top: 0, behavior: "smooth" });
      onJoinCommunityBatch(target.batch);
      return;
    }
    const alreadyHome = activeTab === "home";
    setActiveTab("home");
    // App resets scroll ~150ms after a tab change; scroll after that.
    window.setTimeout(() => scrollToHomeOrderGateway(), alreadyHome ? 0 : 250);
  };

  const quickLinks: Array<{
    label: string;
    tab: string;
    onClick?: (e: React.MouseEvent) => void;
    id?: string;
  }> = [
    { label: "Home", tab: "home" },
    { label: "Design Studio", tab: "design" },
    { label: "Gallery", tab: "gallery" },
    { label: "How It Works", tab: "home" }, // Assuming it scrolls or goes to home
    { label: batchLink.label, tab: "home", onClick: handleBatchLink, id: "footer-join-current-batch" },
    { label: "Contact", tab: "home" }, // Depending on implementation
  ];

  return (
    <footer className="border-t border-heritage-gold/20 bg-heritage-green text-heritage-beige/80 pt-16 pb-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 font-sans">
        {/* Main Footer Content - 4 Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8 mb-16">
          {/* Column 1 - Brand */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <img
                loading="lazy"
                src={odogwuLogo}
                alt={
                  businessSettings?.applicationSettings?.communityName ||
                  "The Odogwu Heritage"
                }
                className="w-14 h-14 rounded-full border border-heritage-gold/30 object-cover bg-heritage-forest shadow-sm shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col">
                <span className="text-base font-extrabold tracking-widest text-heritage-gold uppercase font-display break-words">
                  {businessSettings?.applicationSettings?.communityName ||
                    "The Odogwu Heritage"}
                </span>
              </div>
            </div>
            <p className="text-base xl:text-lg font-bold text-heritage-beige/90 leading-snug font-serif italic break-words">
              {businessSettings?.applicationSettings?.tagline ||
                "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)"}
            </p>
            <p className="text-xs text-heritage-beige/60 leading-relaxed">
              {businessSettings?.applicationSettings?.description ||
                "Connecting cultures through authentic Nigerian traditional clothing, handcrafted in Nigeria and delivered to our multicultural community in the Netherlands."}
            </p>
          </div>

          {/* Column 2 - Quick Links */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Quick Links
            </h3>
            <ul className="space-y-2.5 flex flex-col items-center sm:items-start">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <button
                    type="button"
                    id={link.id}
                    data-footer-target={
                      link.id ? batchLink.target.kind : undefined
                    }
                    onClick={(e) =>
                      link.onClick ? link.onClick(e) : handleNavigation(e, link.tab)
                    }
                    className={`text-xs flex items-center gap-1.5 transition-colors duration-200 hover:text-heritage-gold ${
                      activeTab === link.tab
                        ? "text-heritage-gold font-bold"
                        : "text-heritage-beige/70"
                    }`}
                  >
                    <ChevronRight size={12} className="opacity-50" />
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3 - Contact Information */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Contact Information
            </h3>
            <ul className="space-y-3.5 text-xs text-heritage-beige/70 flex flex-col items-center sm:items-start">
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <Phone
                  size={14}
                  className="text-heritage-gold mt-0.5 shrink-0"
                />
                <a
                  href={`tel:${businessSettings?.applicationSettings?.primaryPhone?.replace(/\s/g, "") || "+31644533190"}`}
                  className="hover:text-heritage-gold transition"
                >
                  {businessSettings?.applicationSettings?.primaryPhone ||
                    "+31 644 533 190"}
                </a>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <MessageCircle
                  size={14}
                  className="text-heritage-gold mt-0.5 shrink-0"
                />
                <a
                  href={`https://wa.me/${businessSettings?.applicationSettings?.whatsappNumber?.replace(/\D/g, "") || "31657903098"}`}
                  className="hover:text-heritage-gold transition"
                >
                  {businessSettings?.applicationSettings?.whatsappNumber ||
                    "+31 657 903 098"}{" "}
                  (WhatsApp)
                </a>
              </li>
              {(primaryEmail || secondaryEmail) && (
                <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                  <Mail
                    size={14}
                    className="text-heritage-gold mt-0.5 shrink-0"
                  />
                  <div className="flex flex-col space-y-1 items-center sm:items-start">
                    {primaryEmail && (
                      <a
                        href={`mailto:${primaryEmail}`}
                        className="hover:text-heritage-gold transition"
                      >
                        {primaryEmail}
                      </a>
                    )}
                    {secondaryEmail && (
                      <a
                        href={`mailto:${secondaryEmail}`}
                        className="hover:text-heritage-gold transition"
                      >
                        {secondaryEmail}
                      </a>
                    )}
                  </div>
                </li>
              )}
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <MapPin
                  size={14}
                  className="text-heritage-gold mt-0.5 shrink-0"
                />
                <span className="leading-relaxed text-center sm:text-left">
                  {businessSettings?.productionSettings
                    ?.defaultPickupLocation ||
                    businessSettings.productionSettings.defaultPickupLocation}
                </span>
              </li>
              <li className="flex flex-col sm:flex-row items-center sm:items-start gap-1.5 sm:gap-3">
                <Clock
                  size={14}
                  className="text-heritage-gold mt-0.5 shrink-0"
                />
                <span className="leading-relaxed text-center sm:text-left">
                  {businessSettings?.applicationSettings?.businessHours ||
                    "Mon - Fri: 9:00 AM - 6:00 PM"}
                </span>
              </li>
            </ul>
          </div>

          {/* Column 4 - Connect */}
          <div className="flex flex-col space-y-4 items-center sm:items-start text-center sm:text-left">
            <h3 className="text-xs uppercase font-bold tracking-widest text-heritage-gold border-b border-heritage-gold/20 pb-2 inline-block w-fit">
              Connect With Us
            </h3>
            <p className="text-xs text-heritage-beige/60 mb-2 leading-relaxed">
              Join our growing community and stay updated on the latest batches
              and designs.
            </p>
            <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks
                    ?.whatsapp || "#"
                }
                aria-label="WhatsApp"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <MessageCircle size={18} />
              </a>
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks
                    ?.facebook || "#"
                }
                aria-label="Facebook"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <Facebook size={18} />
              </a>
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks
                    ?.instagram || "#"
                }
                aria-label="Instagram"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <Instagram size={18} />
              </a>
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks?.tiktok ||
                  "#"
                }
                aria-label="TikTok"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <Music2 size={18} />
              </a>
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks
                    ?.linkedin || "#"
                }
                aria-label="LinkedIn"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <Linkedin size={18} />
              </a>
              <a
                href={
                  businessSettings?.applicationSettings?.socialLinks?.youtube ||
                  "#"
                }
                aria-label="YouTube"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-heritage-forest border border-heritage-gold/20 hover:border-heritage-gold hover:bg-heritage-gold/10 hover:-translate-y-1 transition-all duration-300 text-heritage-beige/80 hover:text-heritage-gold"
              >
                <Youtube size={18} />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Bottom Bar */}
        <div className="pt-8 border-t border-heritage-gold/20 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] sm:text-xs text-heritage-beige/50">
          <div className="order-3 md:order-1 text-center md:text-left text-xs sm:text-sm font-extrabold tracking-wide break-words">
            © {new Date().getFullYear()}{" "}
            {businessSettings?.applicationSettings?.communityName ||
              "The Odogwu Heritage"}
          </div>
          <div className="order-1 md:order-2 text-center text-heritage-gold/80 font-serif italic tracking-wide">
            Authentically Crafted in Nigeria • Delivered Across the Netherlands
          </div>
          <div className="order-2 md:order-3 flex gap-4 justify-center md:justify-end w-full md:w-auto text-center md:text-right">
            <a
              href="/privacy"
              onClick={(e) => handleNavigation(e, "privacy")}
              className="hover:text-heritage-gold transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              onClick={(e) => handleNavigation(e, "terms")}
              className="hover:text-heritage-gold transition-colors"
            >
              Terms & Conditions
            </a>
            <a href="#" className="hover:text-heritage-gold transition-colors">
              Cookie Policy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
