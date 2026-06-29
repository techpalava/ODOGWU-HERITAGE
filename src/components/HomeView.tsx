/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Award,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OrderContext, CommunityPhoto } from "../types";
import odogwuLogo from "../assets/images/odogwu_logo_1782556303014.jpg";

interface HomeViewProps {
  onStartDesigning: () => void;
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  communityPhotos?: CommunityPhoto[];
}

export default function HomeView({
  onStartDesigning,
  onNavigateToTab,
  activeCommunityBatch,
  communityPhotos,
}: HomeViewProps) {
  const [days, setDays] = useState(17);
  const [hours, setHours] = useState(8);
  const [minutes, setMinutes] = useState(14);

  // Community Photos Slider State
  const [selectedPhotos, setSelectedPhotos] = useState<CommunityPhoto[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  useEffect(() => {
    const activePhotos = (communityPhotos || []).filter(
      (p) => p.status === "active",
    );
    if (activePhotos.length === 0) {
      setSelectedPhotos([]);
      return;
    }
    const shuffled = [...activePhotos].sort(() => 0.5 - Math.random());
    setSelectedPhotos(shuffled.slice(0, 5));
    setActivePhotoIndex(0);
  }, [communityPhotos]);

  useEffect(() => {
    if (selectedPhotos.length <= 1) return;
    const interval = setInterval(() => {
      setActivePhotoIndex((prev) => (prev + 1) % selectedPhotos.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedPhotos]);

  // Simple countdown simulation
  useEffect(() => {
    const timer = setInterval(() => {
      setMinutes((prev) => {
        if (prev > 0) return prev - 1;
        setHours((h) => {
          if (h > 0) return h - 1;
          setDays((d) => (d > 0 ? d - 1 : 0));
          return 23;
        });
        return 59;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div id="home-view-container" className="space-y-16">
      {/* Editorial Luxury Hero Header */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 sm:p-12 lg:p-16 text-white shadow-2xl border border-heritage-gold/20">
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute top-10 right-10 text-4xl text-heritage-gold/25 pointer-events-none font-serif">
          ⚜
        </div>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-6">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display tracking-tight leading-tight">
              Traditional Nigerian Clothing,
              <br />
              <span className="text-heritage-gold italic">Custom Made</span> for
              You.
            </h1>
            {/* Desktop Hero Description */}
            <p className="hidden sm:block text-sm text-heritage-beige max-w-xl leading-relaxed font-sans">
              Welcome to the Traditional Clothing Community at ASML. We empower
              people to express their identity and tell their unique stories
              through the timeless beauty of Nigerian traditional fabrics. By
              connecting skilled artisans in Nigeria with communities across the
              Netherlands and beyond, we celebrate Nigeria's rich, colourful,
              and diverse cultural heritage through authentic, custom-made
              garments crafted with exceptional care and craftsmanship.
            </p>

            {/* Mobile Hero Description (Summarized) */}
            <p className="block sm:hidden text-xs text-heritage-beige/95 max-w-md leading-relaxed font-sans">
              Welcome to the ASML Traditional Clothing Community. We connect
              skilled artisans in Nigeria with Netherlands communities,
              delivering exquisite, custom-made garments that celebrate
              Nigeria's rich and diverse cultural heritage.
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              {activeCommunityBatch ? (
                <button
                  id="btn-hero-join-cohort"
                  onClick={onStartDesigning}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Join {activeCommunityBatch.batchName} <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  id="btn-hero-create-batch"
                  onClick={() => onNavigateToTab("custom-order")}
                  className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
                >
                  Create Your Own Batch <ArrowRight size={14} />
                </button>
              )}
              <button
                id="btn-hero-custom-order"
                onClick={() => onNavigateToTab("custom-order")}
                className="bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                Custom Order <ArrowRight size={14} />
              </button>
              <button
                id="btn-hero-how-it-works"
                onClick={() => onNavigateToTab("about")}
                className="border border-heritage-beige/55 text-white hover:bg-white/10 transition duration-300 min-h-[44px] px-8 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider cursor-pointer w-full sm:w-auto"
              >
                Our Process
              </button>
            </div>
          </div>{" "}
          {/* Group Status Card */}
          <div className="lg:col-span-5 font-sans">
            <div className="rounded-2xl border border-heritage-gold/30 bg-heritage-forest p-6 space-y-5 shadow-xl">
              {activeCommunityBatch ? (
                <>
                  <div className="flex justify-between items-center text-left">
                    <div>
                      <span className="text-[10px] text-heritage-gold font-bold tracking-widest uppercase block">
                        ACTIVE GROUP
                      </span>
                      <h3 className="text-lg font-serif font-bold text-white mt-0.5">
                        {activeCommunityBatch.batchName}
                      </h3>
                    </div>
                    {(() => {
                      const isClosed = (() => {
                        if (!activeCommunityBatch?.closingDate) return false;
                        try {
                          return (
                            new Date(activeCommunityBatch.closingDate) <
                            new Date()
                          );
                        } catch (e) {
                          return false;
                        }
                      })();
                      if (isClosed) {
                        return (
                          <span className="bg-red-600/20 text-red-300 border border-red-600/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                            Registration Locked
                          </span>
                        );
                      }
                      return (
                        <motion.span
                          animate={{
                            opacity: [0.8, 1, 0.8],
                            boxShadow: [
                              "0 0 0px rgba(212,175,55,0)",
                              "0 0 8px rgba(212,175,55,0.4)",
                              "0 0 0px rgba(212,175,55,0)",
                            ],
                          }}
                          transition={{
                            repeat: Infinity,
                            duration: 2.5,
                            ease: "easeInOut",
                          }}
                          className="bg-heritage-gold/20 text-heritage-gold border border-heritage-gold/40 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider inline-block"
                        >
                          Open for Orders
                        </motion.span>
                      );
                    })()}
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-2 text-left">
                    <div className="flex justify-between text-[10px] text-heritage-beige font-mono mb-1">
                      <span>
                        {activeCommunityBatch.currentMembers} /{" "}
                        {activeCommunityBatch.expectedParticipants} Garments
                      </span>
                      <span>
                        {Math.round(
                          (activeCommunityBatch.currentMembers /
                            activeCommunityBatch.expectedParticipants) *
                            100,
                        )}
                        % Complete
                      </span>
                    </div>
                    <div className="h-2 w-full bg-heritage-green rounded-full overflow-hidden">
                      <div
                        className="h-full bg-heritage-gold transition-all duration-500"
                        style={{
                          width: `${(activeCommunityBatch.currentMembers / activeCommunityBatch.expectedParticipants) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Countdown or Production Lock State */}
                  {(() => {
                    const isClosed = (() => {
                      if (!activeCommunityBatch?.closingDate) return false;
                      try {
                        return (
                          new Date(activeCommunityBatch.closingDate) <
                          new Date()
                        );
                      } catch (e) {
                        return false;
                      }
                    })();
                    if (isClosed) {
                      return (
                        <div className="pt-3 border-t border-white/15 space-y-2 text-left">
                          <span className="text-[10px] text-heritage-gold uppercase tracking-wider font-bold block">
                            Sourcing Phase:
                          </span>
                          <div className="bg-white/5 border border-white/10 p-4 rounded-xl text-center space-y-1">
                            <strong className="text-xs text-heritage-gold font-serif block uppercase tracking-wide">
                              Locked &amp; Sent to Lagos Ateliers
                            </strong>
                            <span className="text-[10px] text-white/70 block leading-normal">
                              Deadline passed on{" "}
                              {activeCommunityBatch.closingDate}. Custom fabric
                              is locked, patterns are being custom-drawn.
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="pt-3 border-t border-white/15 space-y-2 text-left">
                        <span className="text-[10px] text-heritage-gold uppercase tracking-wider font-bold block">
                          Registration Closes In:
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center text-white font-serif">
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {days}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Days
                            </span>
                          </div>
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {hours.toString().padStart(2, "0")}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Hours
                            </span>
                          </div>
                          <div className="bg-white/5 border border-white/10 p-2 rounded-xl">
                            <strong className="text-lg text-heritage-gold block">
                              {minutes.toString().padStart(2, "0")}
                            </strong>
                            <span className="text-[8px] uppercase tracking-wider text-white/50 font-sans">
                              Mins
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Dates Info */}
                  <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-white/10">
                    <div className="text-left">
                      <span className="text-white/50 block text-[9px]">
                        Sourcing Closes:
                      </span>
                      <span className="font-bold text-white">
                        {activeCommunityBatch.closingDate.replace(", 2026", "")}
                      </span>
                    </div>
                    <div className="text-right sm:text-left">
                      <span className="text-white/50 block text-[9px]">
                        Veldhoven Handoff:
                      </span>
                      <span className="font-bold text-white font-serif text-heritage-gold">
                        {activeCommunityBatch.deliveryWindow.replace(
                          ", 2026",
                          "",
                        )}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-5">
                  <div className="w-12 h-12 bg-heritage-gold/10 border border-heritage-gold/30 rounded-full flex items-center justify-center mx-auto text-heritage-gold">
                    <span className="text-lg">⚜</span>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-base font-serif font-bold text-white">
                      Community Batch Registration Closed
                    </h3>
                  </div>
                  <button
                    onClick={() => onNavigateToTab("custom-order")}
                    className="w-full bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Create Your Own Batch <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => {
                      onNavigateToTab("custom-order");
                      setTimeout(() => {
                        const el = document.getElementById("option-join-group");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      }, 100);
                    }}
                    className="w-full border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 py-3 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    Join A Personalized Group <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Community Photo Gallery Showcase */}
      <section className="space-y-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Our Community Gallery
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Discover members of The Odogwu Heritage community proudly wearing
            their custom-made traditional outfits, handcrafted in Nigeria and
            delivered to the Netherlands.
          </p>
        </div>

        {selectedPhotos.length > 0 ? (
          <div className="relative max-w-md mx-auto">
            {/* Main Active Slide Frame */}
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl border-2 border-heritage-gold/20 shadow-2xl bg-heritage-green/95">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedPhotos[activePhotoIndex].id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 w-full h-full"
                >
                  {/* Ken Burns zooming effect on image */}
                  <motion.img
                    src={selectedPhotos[activePhotoIndex].url}
                    alt={
                      selectedPhotos[activePhotoIndex].caption ||
                      "Community wear"
                    }
                    initial={{ scale: 1 }}
                    animate={{ scale: 1.06 }}
                    transition={{ duration: 5, ease: "easeOut" }}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />

                  {/* Rich Gradient Vignette Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-heritage-green/95 via-heritage-green/40 to-transparent" />

                  {/* Elegant Top Cohort Badge */}
                  <div className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-2">
                    <span className="bg-heritage-gold/90 text-heritage-forest text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-lg border border-white/20">
                      {selectedPhotos[activePhotoIndex].cohortName ||
                        "Odogwu Heritage"}
                    </span>
                    <span className="bg-black/45 backdrop-blur-xs text-white text-[10px] font-semibold px-2.5 py-1 rounded-full border border-white/10">
                      Delivered {selectedPhotos[activePhotoIndex].deliveryYear}
                    </span>
                  </div>

                  {/* Caption Overlay */}
                  <div className="absolute bottom-0 inset-x-0 p-5 sm:p-8 space-y-2 text-left">
                    <p className="text-white text-xs sm:text-sm font-semibold max-w-2xl leading-relaxed drop-shadow-sm font-sans">
                      "
                      {selectedPhotos[activePhotoIndex].caption ||
                        "Bespoke tailoring, designed with reverence."}
                      "
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Prev / Next Manual Navigation Handles */}
              {selectedPhotos.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setActivePhotoIndex(
                        (prev) =>
                          (prev - 1 + selectedPhotos.length) %
                          selectedPhotos.length,
                      )
                    }
                    className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-xs text-heritage-gold hover:bg-heritage-gold hover:text-heritage-green transition-all shadow-md hover:scale-105 border border-white/15 cursor-pointer z-20"
                    aria-label="Previous slide"
                  >
                    ←
                  </button>
                  <button
                    onClick={() =>
                      setActivePhotoIndex(
                        (prev) => (prev + 1) % selectedPhotos.length,
                      )
                    }
                    className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-xs text-heritage-gold hover:bg-heritage-gold hover:text-heritage-green transition-all shadow-md hover:scale-105 border border-white/15 cursor-pointer z-20"
                    aria-label="Next slide"
                  >
                    →
                  </button>
                </>
              )}
            </div>

            {/* Custom Dot Progress Indicator & Carousel Controllers */}
            {selectedPhotos.length > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4">
                {selectedPhotos.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePhotoIndex(idx)}
                    className={`h-2 transition-all duration-300 rounded-full cursor-pointer ${
                      idx === activePhotoIndex
                        ? "w-6 bg-heritage-gold"
                        : "w-2 bg-heritage-gold/30 hover:bg-heritage-gold/60"
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Premium Empty/Fallback State Placeholder */
          <div className="max-w-4xl mx-auto p-12 rounded-3xl border-2 border-dashed border-heritage-gold/25 bg-white text-center space-y-4 shadow-sm">
            <div className="h-16 w-16 mx-auto bg-heritage-gold/10 border border-heritage-gold/30 rounded-full flex items-center justify-center text-heritage-gold">
              <Sparkles size={28} />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-serif font-bold text-heritage-green">
                Begin Building the Showcase
              </h3>
              <p className="text-xs text-heritage-ink/70 leading-relaxed font-sans">
                Our dynamic gallery is currently awaiting the upload of
                completed bespoke garments. Administrators can head to the{" "}
                <strong>Admin Portal &amp; DB</strong> tab to upload and feature
                client photos!
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Multicultural Fun Stats Banner */}
      <section className="bg-heritage-green text-white rounded-3xl p-8 sm:p-10 text-center max-w-4xl mx-auto shadow-md border border-heritage-gold/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80')] opacity-5 mix-blend-overlay"></div>
        <div className="relative z-10 space-y-3">
          <h3 className="text-2xl sm:text-3xl font-serif font-bold text-heritage-gold tracking-wide">
            Be Part of the Multicultural Fun
          </h3>
          <p className="text-base sm:text-lg text-white/90 font-medium">
            24 People, 30 Dresses Made
          </p>
          <div className="inline-block mt-4 pt-4 border-t border-heritage-gold/30">
            <span className="text-xs uppercase tracking-[0.2em] font-semibold text-white/70 font-sans">
              December 2025
            </span>
          </div>
        </div>
      </section>

      {/* Cohort Concept Showcase & Mission */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 sm:p-8 bg-white border border-heritage-gold/15 rounded-3xl space-y-4 shadow-sm">
          <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center">
            <Award size={22} className="text-heritage-gold" />
          </div>
          <h3 className="text-lg font-serif font-bold text-heritage-green">
            Traditional Tailoring
          </h3>
          <p className="text-xs text-heritage-ink/75 leading-relaxed">
            Every item is handmade in Lagos, Nigeria, by experienced traditional
            tailors. We use high-quality fabric, premium embroidery, and classic
            cuts.
          </p>
        </div>

        <div className="p-6 sm:p-8 bg-white border border-heritage-gold/15 rounded-3xl space-y-4 shadow-sm">
          <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center">
            <Sparkles size={22} className="text-heritage-gold" />
          </div>
          <h3 className="text-lg font-serif font-bold text-heritage-green">
            Easy Size Guide
          </h3>
          <p className="text-xs text-heritage-ink/75 leading-relaxed">
            Don't know your size? Just enter your height, weight, and build. Our
            tool will automatically estimate your chest, sleeve, neck, and
            shoulder sizes.
          </p>
        </div>

        <div className="p-6 sm:p-8 bg-white border border-heritage-gold/15 rounded-3xl space-y-4 shadow-sm">
          <div className="h-12 w-12 bg-heritage-green/5 text-heritage-green rounded-2xl flex items-center justify-center">
            <ShieldCheck size={22} className="text-heritage-gold" />
          </div>
          <h3 className="text-lg font-serif font-bold text-heritage-green">
            Campus Delivery
          </h3>
          <p className="text-xs text-heritage-ink/75 leading-relaxed">
            We handle all customs and international shipping. Your clothes are
            grouped together and delivered safely to your campus lockers in
            Veldhoven.
          </p>
        </div>
      </section>

      {/* Community Testimonials */}
      <section className="space-y-8">
        <div className="text-center space-y-2">
          <span className="text-xs font-bold text-heritage-gold tracking-widest uppercase block">
            Reviews
          </span>
          <h3 className="text-2xl sm:text-3xl font-serif text-heritage-green font-semibold">
            What our colleagues say
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "The fit is perfect. Ordering custom clothes from Lagos and
              getting them delivered directly to the ASML campus in Veldhoven is
              super easy and convenient. I love wearing my Senator shirt on
              Mondays."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold">
                AO
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Amadi O.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  ASML Senior Engineer, Eindhoven
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "My Royal Senator suit fits exactly as estimated. The process was
              very simple, and my colleagues love the design!"
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold">
                FE
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Fredrick E.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Veldhoven HQ Staff
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
