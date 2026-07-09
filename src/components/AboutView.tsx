/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Heart,
  Globe,
  Award,
  ArrowUpRight,
  X,
  BookOpen,
  Search,
  Tag,
  Info,
  Image,
  Handshake,
  Scissors,
} from "lucide-react";
import fredrickEzehAvatar from "../assets/images/fredrick_ezeh_avatar_1782313590772.jpg";
import regeneratedImage from "../assets/images/regenerated_image_1782818963407.png";
import { OFFICIAL_PRICE_LIST } from "../data/pricingData";
import { useAppStore } from "../store/useAppStore";
import { compressImage } from "../utils/imageUtils";
import { ImageService } from "../services/imageService";
import { AuthorizationEngine } from "../engine/AuthorizationEngine";

export default function AboutView() {
  const { businessSettings, setBusinessSettings, currentUser } = useAppStore();
  
  const isAdmin = AuthorizationEngine.canManageSettings(currentUser);
  
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [activePriceTab, setActivePriceTab] = useState<
    "guys" | "ladies" | "others"
  >("guys");
  const [priceSearchQuery, setPriceSearchQuery] = useState("");

  const leftLogo = businessSettings.collaborationLogos?.left || null;
  const rightLogo = businessSettings.collaborationLogos?.right || null;

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    position: "left" | "right",
  ) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const logoData = event.target?.result as string;
        const compressedData = await compressImage(logoData);

        const downloadURL = await ImageService.uploadImageIfBase64(
          compressedData,
          "logos",
          position
        );

        setBusinessSettings((prev) => ({
          ...prev,
          collaborationLogos: {
            ...prev.collaborationLogos,
            [position]: downloadURL,
          },
        }));
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 font-sans py-4">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/25 rounded-full text-[10px] font-bold uppercase tracking-widest">
          <Award size={12} className="animate-pulse" /> Our Collective Story
        </span>
        <h1 className="text-3xl sm:text-5xl font-serif font-semibold text-heritage-green leading-none tracking-tight">
          About the NTCC Project
        </h1>
        <p className="text-sm text-heritage-ink/75 max-w-2xl mx-auto leading-relaxed">
          Connecting cultures through authentic Nigerian traditional clothing, handcrafted in Nigeria and delivered to our multicultural community in the Netherlands.
        </p>
      </motion.div>

      {/* Collaboration Banner Artwork */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-3xl border border-heritage-gold/20 overflow-hidden shadow-xl bg-gradient-to-br from-gray-50 to-white p-6 md:p-12 mb-12"
      >
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16">
          
          {/* Left Logo Card (Partner) */}
          <div className="relative w-48 h-48 md:w-56 md:h-56 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center group overflow-hidden transition-all hover:shadow-md">
            {isAdmin && (
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={(e) => handleLogoUpload(e, "left")}
                title="Upload Partner Logo"
              />
            )}
            
            {leftLogo ? (
              <>
                <img
                  src={leftLogo}
                  alt="Partner Logo"
                  className="w-full h-full object-contain p-4"
                />
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBusinessSettings((prev) => ({
                        ...prev,
                        collaborationLogos: { ...prev.collaborationLogos, left: null },
                      }));
                    }}
                    className="absolute top-2 right-2 z-20 bg-white/90 hover:bg-red-50 hover:text-red-500 text-gray-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition shadow-sm"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-heritage-ink/30 group-hover:text-heritage-gold transition px-4 text-center">
                <Image className="w-10 h-10 mb-3 opacity-80" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isAdmin ? "Upload Partner Logo" : "Partner Logo"}
                </span>
              </div>
            )}
          </div>

          {/* Center Collaboration Handshake */}
          <div className="flex flex-col items-center justify-center text-heritage-gold/60">
            <div className="w-20 h-20 bg-heritage-gold/5 rounded-full flex items-center justify-center mb-2">
               <Handshake className="w-10 h-10 text-heritage-gold" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-heritage-ink/40">Collaboration</span>
          </div>

          {/* Right Logo Card (Vaprec) */}
          <div className="relative w-48 h-48 md:w-56 md:h-56 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center group overflow-hidden transition-all hover:shadow-md">
            {isAdmin && (
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={(e) => handleLogoUpload(e, "right")}
                title="Upload Vaprec Logo"
              />
            )}
            
            {rightLogo ? (
              <>
                <img
                  src={rightLogo}
                  alt="Vaprec Logo"
                  className="w-full h-full object-contain p-4"
                />
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBusinessSettings((prev) => ({
                        ...prev,
                        collaborationLogos: { ...prev.collaborationLogos, right: null },
                      }));
                    }}
                    className="absolute top-2 right-2 z-20 bg-white/90 hover:bg-red-50 hover:text-red-500 text-gray-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition shadow-sm"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            ) : (
              <img
                src={regeneratedImage}
                alt="Vaprec Default Logo"
                className="w-full h-full object-contain p-4 opacity-90"
              />
            )}
          </div>

        </div>
      </motion.div>

      {/* Core Mission & Vision Cards (Bento Style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Core Vision */}
        <motion.div
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white border border-heritage-gold/15 rounded-3xl p-8 space-y-4 shadow-md text-left flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="h-10 w-10 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20 rounded-2xl flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <h3 className="text-xl font-serif font-semibold text-heritage-green">
              The Vision
            </h3>
            <p className="text-xs text-heritage-ink/80 leading-relaxed font-medium">
              To further extend the smiles and love into the already rich Dutch
              culture with the vibrant Nigerian taste.
            </p>
            <p className="text-xs text-heritage-ink/75 leading-relaxed font-medium">
              Our long-term goal is also to extend this outreach by
              collaborating with other cultures to do the same, building a
              borderless community of traditional expression.
            </p>
          </div>
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-heritage-gold uppercase tracking-wider font-bold">
            <span>Expanding Horizons</span>
            <Globe size={14} />
          </div>
        </motion.div>

        {/* Mission / Purpose */}
        <motion.div
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white border border-heritage-gold/15 rounded-3xl p-8 space-y-4 shadow-md text-left flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="h-10 w-10 bg-heritage-green/10 text-heritage-green border border-heritage-green/25 rounded-2xl flex items-center justify-center">
              <Heart size={20} />
            </div>
            <h3 className="text-xl font-serif font-semibold text-heritage-green">
              Mission &amp; Purpose
            </h3>
            <p className="text-xs text-heritage-ink/80 leading-relaxed font-medium font-sans">
              To create earning opportunities for the average tailors in Nigeria
              and other (future culture) who are part of this great venture and
              enriching the Dutch culture and enabling people to express
              themselves through these bold prints (clothing).
            </p>
          </div>
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-heritage-green uppercase tracking-wider font-bold">
            <span>Supporting Artisans</span>
            <ArrowUpRight size={14} />
          </div>
        </motion.div>
      </div>
      {/* Core Values Section */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="rounded-3xl border border-heritage-gold/20 bg-white p-6 sm:p-10 shadow-sm space-y-10 text-left"
      >
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="text-2xl sm:text-3xl font-serif text-heritage-green font-bold">
            Core Values
          </h2>
          <p className="text-xs sm:text-sm text-heritage-ink/80 leading-relaxed font-sans">
            The principles that unite our multicultural community and guide everything we do.
          </p>
          <div className="w-16 h-[2px] bg-heritage-gold mx-auto"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Featured Content */}
          <div className="lg:col-span-5 bg-heritage-cream/40 border border-heritage-gold/15 rounded-3xl p-8 space-y-6 h-full">
            <h3 className="text-xl font-serif font-bold text-heritage-green leading-snug">
              Celebrating Culture Through Unity
            </h3>
            <div className="space-y-4 text-xs sm:text-sm text-heritage-ink/80 leading-relaxed font-sans">
              <p>
                The Nigerian Traditional Clothing Community (NTCC) brings people from different backgrounds together through the beauty of authentic Nigerian traditional clothing.
              </p>
              <p>
                Our mission goes beyond fashion. We celebrate cultural diversity, preserve traditional craftsmanship, and create meaningful connections by making handcrafted Nigerian garments accessible to our multicultural community in the Netherlands.
              </p>
              <p>
                Through every outfit, we encourage appreciation, understanding, and respect for one another's cultures while supporting skilled artisans in Nigeria and preserving generations of tailoring excellence.
              </p>
            </div>
          </div>

          {/* Value Cards */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Cultural Diversity */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                <Globe size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Cultural Diversity</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Celebrating the richness and uniqueness of every culture.
              </p>
            </div>
            
            {/* Inclusion */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-gold/10 text-heritage-gold rounded-xl flex items-center justify-center border border-heritage-gold/20">
                <Handshake size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Inclusion</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Creating a welcoming community where everyone feels valued and respected.
              </p>
            </div>

            {/* Authentic Craftsmanship */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-ink/5 text-heritage-ink rounded-xl flex items-center justify-center border border-heritage-ink/10">
                <Scissors size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Authentic Craftsmanship</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Supporting skilled Nigerian artisans while preserving traditional tailoring techniques.
              </p>
            </div>

            {/* Mutual Respect */}
            <div className="bg-white border border-heritage-gold/15 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
              <div className="h-10 w-10 bg-heritage-green/10 text-heritage-green rounded-xl flex items-center justify-center border border-heritage-green/20">
                <Heart size={20} />
              </div>
              <h4 className="font-serif font-bold text-heritage-green text-base">Mutual Respect</h4>
              <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                Building stronger communities through cultural appreciation, understanding, and shared experiences.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Bringing Cultures Together & Origin Chronicles section */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="rounded-3xl border border-heritage-gold/20 bg-white p-6 sm:p-10 shadow-sm space-y-8 text-left"
      >
        <div className="max-w-3xl space-y-4">
          <span className="text-[10px] tracking-widest text-heritage-gold font-bold uppercase font-sans">
            OUR STORY
          </span>
          <h2 className="text-2xl sm:text-3xl font-serif text-heritage-green font-bold">
            Bringing Cultures Together
          </h2>
          <div className="w-16 h-[2px] bg-heritage-gold"></div>
          <p className="text-xs sm:text-sm text-heritage-ink/80 leading-relaxed font-sans">
            Started in April 2025 by Fredrick Ezeh to share traditional Nigerian
            fashion, {businessSettings.applicationSettings.communityName}
            helps us learn about and celebrate culture on campus. We started
            with a small group of pioneers and have grown into a warm community
            for all colleagues.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center bg-heritage-cream/40 p-6 rounded-2xl border border-heritage-gold/10">
          <div className="md:col-span-4 flex flex-col items-center text-center space-y-3">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-heritage-gold/30 shadow-sm shrink-0">
              <img
                loading="lazy"
                src={fredrickEzehAvatar}
                alt="Fredrick Ezeh"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-heritage-green font-serif">
                Fredrick Ezeh
              </h4>
              <p className="text-[9px] text-heritage-gold font-bold uppercase tracking-wider">
                Founder & Coordinator
              </p>
            </div>
          </div>

          <div className="md:col-span-8 space-y-4">
            <p className="text-sm font-serif italic text-heritage-green leading-relaxed text-center md:text-left">
              "Let's keep each other close and be supportive, that is all we
              need to live longer than our struggles."
            </p>
            <div className="flex justify-center md:justify-start">
              <button
                onClick={() => setIsStoryOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-sm cursor-pointer"
              >
                <BookOpen size={12} />
                Read Our Full Origin Story &rarr;
              </button>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Interactive Official Pricing Guide Section */}
      <motion.section
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.38 }}
        className="rounded-3xl border border-heritage-gold/20 bg-white p-6 sm:p-10 shadow-sm space-y-6 text-left"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[10px] tracking-widest text-heritage-gold font-bold uppercase font-sans">
              MEMBERSHIP ADVANTAGE
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif text-heritage-green font-bold">
              Official Price Catalog
            </h2>
            <div className="w-16 h-[2px] bg-heritage-gold"></div>
            <p className="text-xs text-heritage-ink/75 max-w-xl">
              As a member of the NTCC, you benefit from pre-negotiated bespoke
              group tailoring rates. Look up your style configuration codes to
              view your savings.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-heritage-ink/40"
              size={14}
            />
            <input
              type="text"
              placeholder="Search codes or styles..."
              value={priceSearchQuery}
              onChange={(e) => setPriceSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-heritage-gold/15 bg-heritage-cream/10 text-xs focus:ring-1 focus:ring-heritage-gold focus:border-heritage-gold outline-none text-heritage-ink transition font-sans"
            />
            {priceSearchQuery && (
              <button
                onClick={() => setPriceSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-heritage-ink/40 hover:text-heritage-green text-xs"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Pricing Tabs */}
        <div className="flex border-b border-gray-100 font-sans text-xs">
          {(["guys", "ladies", "others"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActivePriceTab(tab);
                setPriceSearchQuery("");
              }}
              className={`px-4 sm:px-6 py-2.5 font-bold uppercase tracking-wider border-b-2 transition cursor-pointer -mb-[2px] ${
                activePriceTab === tab
                  ? "border-heritage-gold text-heritage-green bg-heritage-cream/10"
                  : "border-transparent text-heritage-ink/50 hover:text-heritage-green"
              }`}
            >
              {tab === "guys"
                ? "Gentlemen"
                : tab === "ladies"
                  ? "Ladies"
                  : "Accessories & Others"}
            </button>
          ))}
        </div>

        {/* Value Proposition Callout Banner */}
        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3 text-xs leading-relaxed">
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
            <Tag size={14} className="text-emerald-700" />
          </div>
          <div className="flex-grow">
            <p className="font-bold text-emerald-800">
              Exclusive NTCC Cohort Price Protection
            </p>
            <p className="text-[11px] text-emerald-700/90">
              Active group cohort members pay only the **Discounted Price
              Range**. Future public rates will transition to the standard
              **Actual (Future) Price Range**.
            </p>
          </div>
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mt-1 sm:mt-0">
            Save up to 65%
          </span>
        </div>

        {/* Pricing List Table / Grid */}
        <div className="overflow-x-auto rounded-2xl border border-heritage-gold/10 shadow-sm font-sans">
          {(() => {
            const filteredPricing = OFFICIAL_PRICE_LIST.filter((item) => {
              const matchesTab = item.category === activePriceTab;
              const matchesSearch =
                item.description
                  .toLowerCase()
                  .includes(priceSearchQuery.toLowerCase()) ||
                item.code
                  .toLowerCase()
                  .includes(priceSearchQuery.toLowerCase());
              return matchesTab && matchesSearch;
            });

            if (filteredPricing.length === 0) {
              return (
                <div className="p-8 text-center text-heritage-ink/50 text-xs">
                  No pricing records matched your search query. Try another
                  keyword.
                </div>
              );
            }

            return (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs min-w-[600px]">
                  <thead>
                    <tr className="bg-heritage-cream/30 text-[10px] uppercase font-bold tracking-wider text-heritage-green border-b border-heritage-gold/10">
                      <th className="py-3.5 px-4 w-16">Code</th>
                      <th className="py-3.5 px-4">Description</th>
                      <th className="py-3.5 px-4 w-28">Quantity</th>
                      <th className="py-3.5 px-4 w-32 text-right">
                        Discounted Price (Member)
                      </th>
                      <th className="py-3.5 px-4 w-32 text-right text-heritage-ink/50">
                        Actual Price (Future)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPricing.map((item) => (
                      <tr
                        key={item.code}
                        className="hover:bg-heritage-cream/5 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-heritage-gold bg-heritage-gold/5 border border-heritage-gold/20 px-1.5 py-0.5 rounded">
                            {item.code}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-heritage-ink">
                          {item.description}
                        </td>
                        <td className="py-3 px-4 text-heritage-ink/75 font-medium italic">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-mono text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                            €
                            {item.discountedMin === item.discountedMax
                              ? item.discountedMin.toFixed(2)
                              : `${item.discountedMin.toFixed(2)} - €${item.discountedMax.toFixed(2)}`}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-heritage-ink/40 font-mono line-through">
                          €
                          {item.actualMin === item.actualMax
                            ? item.actualMin.toFixed(2)
                            : `${item.actualMin.toFixed(2)} - €${item.actualMax.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* Pricing Guidelines Tip */}
        <div className="p-4 bg-heritage-cream/20 border border-heritage-gold/15 rounded-2xl flex items-start gap-3 text-xs leading-relaxed text-heritage-ink/80">
          <Info size={14} className="text-heritage-gold shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-heritage-green block">
              Pro Tips &amp; Special Policies:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-heritage-ink/70">
              <li>
                For Ladies' dresses (L1–L4), adding an inner net or lining
                corresponds to code <strong>L5</strong>, adding{" "}
                <strong>+€10.00</strong> to the order.
              </li>
              <li>
                Order Alone options carry an individual priority home
                shipping/courier surcharge of <strong>+€35.00</strong> (SEPA
                transfer directly).
              </li>
              <li>
                Add-ons matching code <strong>Others-1</strong> can be added to
                any customized order in Step 3 for only <strong>+€10.00</strong>{" "}
                during active group phases.
              </li>
            </ul>
          </div>
        </div>
      </motion.section>

      {/* Core Value Statement banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-heritage-green text-white rounded-3xl p-8 border border-heritage-gold/20 shadow-xl text-left relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#C5A85C_1px,transparent_1px)] [background-size:12px_12px]" />
        <div className="relative z-10 space-y-3">
          <span className="text-[10px] uppercase tracking-widest text-heritage-gold font-bold">
            Core Value
          </span>
          <h3 className="text-2xl font-serif font-medium text-white">
            Cultivating Inclusion &amp; Respect
          </h3>
          <p className="text-xs text-heritage-beige/90 leading-relaxed max-w-3xl font-medium">
            Promoting more diversity and cultural inclusion in the Netherlands
            and beyond, where we can all appreciate and respect each other's
            culture in our own unique way.
          </p>
        </div>
      </motion.div>

      {/* Origin Story Modal Popup */}
      <AnimatePresence>
        {isStoryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStoryOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-white text-heritage-ink rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-heritage-gold/20 flex flex-col z-10"
            >
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-serif font-bold text-heritage-green">
                    Our Origin Story
                  </span>
                  <span className="bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                    Community Spotlight
                  </span>
                </div>
                <button
                  onClick={() => setIsStoryOpen(false)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-heritage-ink/50 hover:bg-gray-100 hover:text-heritage-green transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6 text-left">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  {/* Portrait Sidebar */}
                  <div className="md:col-span-4 flex flex-col items-center text-center space-y-3 bg-heritage-cream/40 p-4 rounded-2xl border border-heritage-gold/10">
                    <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-heritage-gold/30 shadow-sm shrink-0">
                      <img
                        loading="lazy"
                        src={fredrickEzehAvatar}
                        alt="Fredrick Ezeh"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-heritage-green font-serif">
                        Fredrick Ezeh
                      </h4>
                      <p className="text-[9px] text-heritage-gold font-bold uppercase tracking-wider">
                        Founder & Coordinator
                      </p>
                      <p className="text-[9px] text-heritage-ink/65">
                        Veldhoven
                      </p>
                    </div>

                    <div className="w-full h-[1px] bg-heritage-gold/15 my-1"></div>

                    <p className="text-[10px] italic text-heritage-green/90 leading-relaxed font-serif">
                      "Let's keep each other close and be supportive, that is
                      all we need to live longer than our struggles."
                    </p>
                  </div>

                  {/* Main Story Text */}
                  <div className="md:col-span-8 space-y-4 text-xs leading-relaxed text-heritage-ink/80 font-sans">
                    <h3 className="text-base font-serif font-bold text-heritage-green">
                      Building a Culturally Inclusive Community
                    </h3>

                    <p>
                      In April 2025, I started a simple initiative within my
                      project team to promote cultural inclusion. What began as
                      a personal gesture of cultural pride has now grown far
                      beyond our department. This movement is called the{" "}
                      <strong>
                        Nigerian Traditional Clothing Community (NTCC)
                      </strong>
                      , and our goal is to spread it across our community, the
                      Netherlands, and eventually the world.
                    </p>

                    <p>
                      The idea first started over a year ago. My colleagues
                      often told me how much they liked seeing me wear
                      traditional Nigerian clothing to work on Mondays and
                      Wednesdays. They asked if they could get these outfits
                      too. So, during my trip home to Nigeria in April 2025, I
                      ordered the first batch for them. The response was better
                      than I ever imagined!
                    </p>

                    <p>
                      When others saw our first group of members—known as{" "}
                      <strong>The Pioneers</strong>—wearing their traditional
                      clothing, they wanted to join too. This led to our second
                      successful group, <strong>The Avengers</strong>.
                    </p>

                    <p>
                      Interest continued to grow. Our third group,{" "}
                      <strong>The Transformers</strong>, became even more
                      successful. I decided to surprise our CEO, Christophe
                      Fouquet, by gifting him a custom-tailored traditional
                      shirt. He happily joined the community, which was a
                      wonderful moment for promoting diversity, inclusion, and
                      cultural pride in our community.
                    </p>

                    <p>
                      After welcoming Christophe to NTCC, my dream is to share
                      this beautiful traditional clothing with more community
                      executives and other leaders. We want to build a global
                      movement that brings love, smiles, and cultural
                      appreciation to everyone who wants to be a part of it.
                    </p>
                  </div>
                </div>

                {/* Distinguished Highlight Callout */}
                <div className="bg-heritage-green text-white rounded-2xl p-5 border border-heritage-gold/20 space-y-3 shadow-inner">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">👑</span>
                    <div>
                      <span className="block text-[8px] uppercase tracking-widest text-heritage-gold font-bold">
                        Distinguished Inclusion Highlight
                      </span>
                      <h4 className="text-xs font-bold font-serif text-white">
                        CEO Christophe Fouquet Gifting
                      </h4>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-heritage-beige/95">
                    Gifting a traditional custom-tailored shirt to CEO
                    Christophe Fouquet represented a symbolic bridge between
                    cultural heritage and corporate leadership. This successful
                    inclusion showcases how corporate platforms can actively
                    embrace, celebrate, and elevate cultural diversity on a
                    global scale.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end shrink-0">
                <button
                  onClick={() => setIsStoryOpen(false)}
                  className="px-4 py-2 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition duration-300 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Close Story
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
