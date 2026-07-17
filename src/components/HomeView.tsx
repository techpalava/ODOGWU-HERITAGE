/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { Sparkles, ArrowRight, ShieldCheck, Award, Shirt, Camera } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OrderContext, CommunityPhoto, Showpiece, Fabric } from "../types";
import { useAppStore } from "../store/useAppStore";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import { CapacityService } from "../services/CapacityService";
import { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";
import ankaraLadyImage from "../assets/images/couture_gown_photo_1782308183701.jpg";
import ankaraManImage from "../assets/images/grand_agbada_photo_1782308152763.jpg";
import ankaraKidsImage from "../assets/images/regenerated_image_1784258480371.png";
import ankaraFamilyImage from "../assets/images/regenerated_image_1784259611604.png";

interface HomeViewProps {
  onNavigateToTab: (tabId: string) => void;
  activeCommunityBatch?: OrderContext | null;
  communityPhotos?: CommunityPhoto[];
  showpieces?: Showpiece[];
  fabrics?: Fabric[];
  onSelectStyle?: (styleId: string, fabricCode: string) => void;
  onSelectFabric?: (fabricCode: string) => void;
}

export default function HomeView({
  onNavigateToTab,
  activeCommunityBatch,
  communityPhotos,
  showpieces = [],
  fabrics = [],
  onSelectStyle,
  onSelectFabric,
}: HomeViewProps) {
  const { 
    businessSettings, 
    currentUser,
    customers,
    orders,
    batches,
    styles, 
    cartItems, 
    historicalOrders 
  } = useAppStore();

  const journey = CustomerJourneyEngine.getCurrentJourney({
    currentUser: currentUser as any,
    drafts: cartItems,
    activeOrders: orders,
    historicalOrders,
    allBatches: batches,
  });

  
  const canJoinActiveBatch = activeCommunityBatch ? BatchBusinessRules.canAcceptOrders(activeCommunityBatch as any).canAcceptOrders : false;
  const heroPrimaryAction = canJoinActiveBatch ? `Join ${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}`.trim() : "Create Custom Order";
  const firstHeroPrimaryAction = canJoinActiveBatch ? `Join ${(activeCommunityBatch as any)?.name || (activeCommunityBatch as any)?.batchName || ''}`.trim() : "Create Group";
  const heroDestination = canJoinActiveBatch ? "design" : "custom-order";

  const [currentSlide, setCurrentSlide] = useState(0);

  const heroSlides = [
    {
      id: "slide-1",
      src: ankaraLadyImage,
      alt: "Lady wearing elegant Ankara traditional attire",
    },
    {
      id: "slide-2",
      src: ankaraManImage,
      alt: "Man wearing elegant Ankara traditional attire",
    },
    {
      id: "slide-3",
      src: ankaraKidsImage,
      alt: "Girl and boy wearing Ankara traditional attire",
    },
    {
      id: "slide-4",
      src: ankaraFamilyImage,
      alt: "Family wearing coordinated Ankara traditional attire",
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  const [, setNow] = useState(new Date());
  const [fabricFilter, setFabricFilter] = useState("All Fabrics");

  const activeFabrics = [...fabrics]
    .filter(
      (f) => fabricFilter === "All Fabrics" || f.category === fabricFilter,
    )
    .slice(0, 12);


  const [styleFilter, setStyleFilter] = useState("All Styles");
  
  // Extract categories dynamically
  const styleCategories = [
    "All Styles",
    ...Array.from(new Set(styles.map(s => {
      if (s.gender === "male") return "Men";
      if (s.gender === "female") return "Women";
      if (s.gender === "couple") return "Couples";
      if (s.gender === "family") return "Families";
      if (s.gender === "unisex") return "Unisex";
      return s.outfitType || s.gender;
    }).filter(Boolean)))
  ];

  const activeStyles = [...styles]
    .filter(s => {
      if (styleFilter === "All Styles") return true;
      const mappedGender = 
        s.gender === "male" ? "Men" : 
        s.gender === "female" ? "Women" : 
        s.gender === "couple" ? "Couples" : 
        s.gender === "family" ? "Families" : 
        s.gender === "unisex" ? "Unisex" : s.gender;
      
      return mappedGender === styleFilter || s.outfitType === styleFilter;
    })
    .slice(0, 12);

  const fabricCategories = [
    "All Fabrics",
    ...Array.from(new Set(fabrics.map((f) => f.category).filter(Boolean))),
  ];

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

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000); // update every minute

    return () => clearInterval(timer);
  }, []);

  const featuredShowpieces = [...showpieces].filter((s) => s.image).slice(0, 8);

  

  return (
    <div id="home-view-container" className="space-y-16">
            {/* Quick Action Bar */}
      <section className="bg-white rounded-2xl p-4 shadow-sm border border-heritage-gold/20 mb-2 sm:mb-4 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            id="btn-quick-join-cohort"
            onClick={() => {
              onNavigateToTab(heroDestination as any);
              if (heroDestination === "custom-order") {
                setTimeout(() => {
                  const el = document.getElementById("option-create-group");
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }, 200);
              }
            }}
            className="w-full bg-heritage-green text-white hover:bg-heritage-forest transition duration-300 min-h-[52px] px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-transparent"
          >
            <Sparkles size={16} className="text-heritage-gold shrink-0" />
            <span className="truncate">{firstHeroPrimaryAction}</span>
            <ArrowRight size={14} className="opacity-70 shrink-0" />
          </button>
          
          <button
            id="btn-quick-custom-order"
            onClick={() => onNavigateToTab("custom-order")}
            className="w-full bg-heritage-cream text-heritage-green hover:bg-[#EBE5DA] transition duration-300 min-h-[52px] px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-heritage-gold/30"
          >
            <Shirt size={16} className="text-heritage-gold shrink-0" />
            <span className="truncate">Custom Order</span>
          </button>

          <button
            id="btn-quick-gallery"
            onClick={() => onNavigateToTab("gallery")}
            className="w-full bg-white text-heritage-green hover:bg-gray-50 transition duration-300 min-h-[52px] px-4 py-3 rounded-xl text-[11px] font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-gray-200"
          >
            <Camera size={16} className="text-heritage-ink/60 shrink-0" />
            <span className="truncate">Style Gallery</span>
          </button>
        </div>
      </section>

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
              Welcome to {businessSettings.applicationSettings.communityName}.
              We empower people to express their identity and tell their unique
              stories through the timeless beauty of Nigerian traditional
              fabrics. By connecting skilled artisans in Nigeria with
              communities across the Netherlands and beyond, we celebrate
              Nigeria's rich, colourful, and diverse cultural heritage through
              authentic, custom-made garments crafted with exceptional care and
              craftsmanship.
            </p>

            {/* Mobile Hero Description (Summarized) */}
            <p className="block sm:hidden text-xs text-heritage-beige/95 max-w-md leading-relaxed font-sans">
              Welcome to {businessSettings.applicationSettings.communityName}.
              We connect skilled artisans in Nigeria with Netherlands
              communities, delivering exquisite, custom-made garments that
              celebrate Nigeria's rich and diverse cultural heritage.
            </p>

            <div className="pt-4 sm:pt-6">
              <button
                onClick={() => {
                  onNavigateToTab(heroDestination as any);
                  if (heroDestination === "custom-order") {
                    setTimeout(() => {
                      const el = document.getElementById("option-create-group");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }, 200);
                  }
                }}
                className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 py-3.5 px-8 rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {firstHeroPrimaryAction} <ArrowRight size={18} />
              </button>
            </div>
          </div>
          
          {/* Hero Image Carousel */}
          <div className="lg:col-span-5 font-sans relative flex justify-center lg:justify-end mt-8 lg:mt-0">
            <div className="rounded-2xl overflow-hidden border border-heritage-gold/30 shadow-2xl relative aspect-[3/4] w-full max-w-[320px] lg:max-w-sm bg-heritage-forest/50">
              {heroSlides.map((slide, index) => (
                <img
                  key={slide.id}
                  src={slide.src}
                  alt={slide.alt}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${index === currentSlide ? "opacity-100" : "opacity-0"}`}
                  referrerPolicy="no-referrer"
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-heritage-forest/60 to-transparent pointer-events-none"></div>
              
              {/* Slide Indicators */}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-10">
                {heroSlides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${currentSlide === index ? "bg-heritage-gold w-5" : "bg-white/40 w-1.5 hover:bg-white/70"}`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose NTCC? */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-6 rounded-2xl space-y-3 text-center sm:text-left transition-all hover:bg-heritage-cream/40 hover:border-heritage-gold/30">
          <div className="text-3xl mb-4">🇳🇬</div>
          <h3 className="font-serif font-bold text-heritage-green text-lg tracking-tight">
            Authentic Nigerian Craftsmanship
          </h3>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Every outfit is handcrafted by experienced Nigerian tailors.
          </p>
        </div>

        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-6 rounded-2xl space-y-3 text-center sm:text-left transition-all hover:bg-heritage-cream/40 hover:border-heritage-gold/30">
          <div className="text-3xl mb-4">📏</div>
          <h3 className="font-serif font-bold text-heritage-green text-lg tracking-tight">
            Made to Your Measurements
          </h3>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Each garment is custom-tailored specifically for you.
          </p>
        </div>

        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-6 rounded-2xl space-y-3 text-center sm:text-left transition-all hover:bg-heritage-cream/40 hover:border-heritage-gold/30">
          <div className="text-3xl mb-4">✈️</div>
          <h3 className="font-serif font-bold text-heritage-green text-lg tracking-tight">
            Delivered to the Netherlands
          </h3>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Secure shipping directly from Nigeria.
          </p>
        </div>

        <div className="bg-heritage-cream/20 border border-heritage-gold/15 p-6 rounded-2xl space-y-3 text-center sm:text-left transition-all hover:bg-heritage-cream/40 hover:border-heritage-gold/30">
          <div className="text-3xl mb-4">👥</div>
          <h3 className="font-serif font-bold text-heritage-green text-lg tracking-tight">
            Join a Growing Community
          </h3>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Wear your culture with hundreds of community members.
          </p>
        </div>
      </section>

      {/* Featured Outfits Window Display */}
      {featuredShowpieces.length > 0 && (
        <section className="space-y-8 pb-4">
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
              Featured Outfits
            </h2>
            <p className="text-sm text-heritage-ink/75 leading-relaxed">
              Explore a selection of beautifully crafted traditional Nigerian
              outfits made for members of the Nigerian Traditional Clothing
              Community (NTCC).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredShowpieces.map((showpiece) => (
              <div
                key={showpiece.id}
                className="group bg-white rounded-2xl overflow-hidden border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full"
              >
                <div className="relative aspect-[3/4] bg-heritage-cream/30 overflow-hidden">
                  {showpiece.image ? (
                    <img
                      src={showpiece.image}
                      alt={showpiece.title}
                      loading="lazy"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-heritage-gold/30">
                      <Sparkles size={32} />
                    </div>
                  )}

                  {/* Subtle overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>

                <div className="p-5 flex flex-col flex-grow bg-white relative z-10 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h3 className="font-serif font-bold text-heritage-green text-lg leading-tight line-clamp-1 group-hover:text-heritage-gold transition-colors">
                        {showpiece.title}
                      </h3>
                      <p className="text-xs text-heritage-ink/60 font-medium capitalize mt-1 flex gap-2 items-center">
                        <span>{showpiece.category}</span>
                        <span className="w-1 h-1 rounded-full bg-heritage-gold/50"></span>
                        <span className="truncate">{showpiece.styleName}</span>
                      </p>
                    </div>
                    {/* Badge */}
                    {showpiece.tag && (
                      <span className="px-2 py-1 bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
                        {showpiece.tag}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <div
                      className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                      style={{
                        backgroundColor: showpiece.colorHex || "#D4AF37",
                      }}
                    ></div>
                    <span className="text-xs font-medium text-heritage-ink/75 truncate">
                      {showpiece.fabricName}
                    </span>
                  </div>

                  <div className="mt-auto pt-4">
                    <button
                      onClick={() => {
                        if (onSelectStyle) {
                          onSelectStyle(
                            showpiece.styleId,
                            showpiece.fabricCode,
                          );
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-sm flex justify-center items-center gap-2"
                    >
                      Customize This Look <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How It Works (Tailoring Journey) */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            How It Works
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            From your design ideas to a beautifully tailored outfit delivered to
            the Netherlands.
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line for Desktop */}
          <div className="hidden lg:block absolute top-[50px] left-[10%] right-[10%] h-[2px] bg-heritage-gold/20"></div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 relative z-10">
            {[
              {
                icon: "🎨",
                title: "Choose Your Style",
                description:
                  "Browse our collection of traditional Nigerian clothing and select the design that best matches your preferences.",
              },
              {
                icon: "🧵",
                title: "Select Your Fabric",
                description:
                  "Choose from our carefully curated collection of authentic premium fabrics to create your unique outfit.",
              },
              {
                icon: "📏",
                title: "Submit Your Measurements",
                description:
                  "Provide your measurements or use your saved profile to ensure a comfortable and accurate fit.",
              },
              {
                icon: "✂️",
                title: "Tailored in Nigeria",
                description:
                  "Experienced Nigerian artisans carefully handcraft your outfit using traditional tailoring techniques and premium craftsmanship.",
              },
              {
                icon: "📦",
                title: "Shipped to the Netherlands",
                description:
                  "After quality inspection, your finished outfit is securely packaged and shipped to the Netherlands with your batch delivery.",
              },
              {
                icon: "✨",
                title: "Enjoy Your Outfit",
                description:
                  "Receive your custom-made Nigerian attire and celebrate culture through exceptional craftsmanship and timeless style.",
              },
            ].map((step, index) => (
              <div
                key={index}
                className="flex flex-col items-center text-center space-y-4 group"
              >
                <div className="w-24 h-24 sm:w-20 sm:h-20 bg-white border-2 border-heritage-gold/20 rounded-full flex items-center justify-center text-4xl shadow-md group-hover:scale-110 group-hover:border-heritage-gold/50 transition-all duration-300 relative bg-heritage-cream/10 z-10">
                  {step.icon}
                </div>
                <div className="space-y-2">
                  <h3 className="font-serif font-bold text-heritage-green text-sm lg:text-base leading-tight">
                    {step.title}
                  </h3>
                  <p className="text-xs text-heritage-ink/75 leading-relaxed hidden sm:block">
                    {step.description}
                  </p>
                  <p className="text-sm text-heritage-ink/75 leading-relaxed block sm:hidden">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Optional Trust Badges */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 pt-8 border-t border-heritage-gold/15">
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Authentic Nigerian Craftsmanship</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Secure Batch Delivery</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-heritage-green font-medium">
            <ShieldCheck size={16} className="text-heritage-gold" />
            <span>Custom Made for Every Customer</span>
          </div>
        </div>

        <div className="text-center pt-6">
          <button
            onClick={() => onNavigateToTab(heroDestination as any)}
            className="inline-flex bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"
          >
            {heroPrimaryAction} <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Fabric Showcase */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Discover Premium Fabrics
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Browse authentic Nigerian fabrics carefully selected for exceptional
            quality, colour, and craftsmanship.
          </p>
        </div>

        {fabricCategories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto px-4">
            {fabricCategories.map((category, idx) => (
              <button
                key={idx}
                onClick={() => setFabricFilter(category as string)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  fabricFilter === category
                    ? "bg-heritage-gold text-heritage-forest shadow-md"
                    : "bg-heritage-cream/30 text-heritage-green border border-heritage-gold/20 hover:bg-heritage-gold/20"
                }`}
              >
                {String(category).replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}
        {activeFabrics.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-heritage-gold/30 rounded-2xl mx-4 sm:mx-8 bg-heritage-cream/10">
            <p className="text-sm text-heritage-ink/60 font-medium">
              Our fabric collection is being updated. Please visit the Design
              Studio soon.
            </p>
          </div>
        ) : (
          <div className="relative max-w-full overflow-hidden px-4 sm:px-8">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-4 hide-scrollbar cursor-grab active:cursor-grabbing">
              {activeFabrics.map((fabric) => (
                <div
                  key={fabric.id || fabric.code}
                  className="snap-start shrink-0 w-[75vw] sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] group bg-white rounded-2xl overflow-hidden border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full"
                >
                  <div
                    className="relative aspect-square bg-heritage-cream/30 overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (onSelectFabric) onSelectFabric(fabric.code);
                    }}
                  >
                    {fabric.image ? (
                      <img
                        src={fabric.image}
                        alt={fabric.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                      />
                    ) : (
                      <div
                        className="absolute inset-0 group-hover:scale-105 transition-transform duration-700 ease-in-out"
                        style={{
                          background: `linear-gradient(135deg, ${fabric.colorHex || "#D4AF37"}cc, ${fabric.colorHex || "#D4AF37"}ff)`,
                        }}
                      />
                    )}

                    {/* Subtle overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                    {/* Badges */}
                    <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                      {fabric.category && (
                        <span className="px-2 py-1 bg-heritage-green/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          {fabric.category.replace(/_/g, " ")}
                        </span>
                      )}
                      {fabric.stockStatus === "LOW_STOCK" && (
                        <span className="px-2 py-1 bg-red-600/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          Limited Edition
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-grow bg-white relative z-10 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3
                          className="font-serif font-bold text-heritage-green text-lg leading-tight line-clamp-1 group-hover:text-heritage-gold transition-colors cursor-pointer"
                          onClick={() => {
                            if (onSelectFabric) onSelectFabric(fabric.code);
                          }}
                        >
                          {fabric.name}
                        </h3>
                        <p className="text-xs text-heritage-ink/60 font-medium capitalize mt-1 flex gap-2 items-center">
                          <span className="truncate">{fabric.code}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <div
                        className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                        style={{
                          backgroundColor: fabric.colorHex || "#D4AF37",
                        }}
                      ></div>
                      <span className="text-xs font-medium text-heritage-ink/75 truncate capitalize">
                        {fabric.color}
                      </span>
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => {
                          if (onSelectFabric) {
                            onSelectFabric(fabric.code);
                          }
                        }}
                        className="w-full py-2.5 px-4 bg-heritage-cream/50 text-heritage-green border border-heritage-gold/30 hover:bg-heritage-gold hover:text-heritage-forest hover:border-heritage-gold rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-sm flex justify-center items-center gap-2"
                      >
                        Design with this <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>


      {/* Design Styles Showcase */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Explore Design Styles
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Discover beautifully tailored traditional Nigerian clothing styles, each custom-made to your measurements using the fabric of your choice.
          </p>
        </div>

        {styleCategories.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto px-4">
            {styleCategories.map((category, idx) => (
              <button
                key={idx}
                onClick={() => setStyleFilter(category as string)}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
                  styleFilter === category
                    ? "bg-heritage-gold text-heritage-forest shadow-md"
                    : "bg-heritage-cream/30 text-heritage-green border border-heritage-gold/20 hover:bg-heritage-gold/20"
                }`}
              >
                {String(category).replace(/_/g, " ")}
              </button>
            ))}
          </div>
        )}

        {activeStyles.length === 0 ? (
          <div className="text-center py-12 px-4 border border-dashed border-heritage-gold/30 rounded-2xl mx-4 sm:mx-8 bg-heritage-cream/10">
            <p className="text-sm text-heritage-ink/60 font-medium">
              Our style collection is being updated. Please visit the Design
              Studio soon.
            </p>
          </div>
        ) : (
          <div className="relative max-w-full overflow-hidden px-4 sm:px-8">
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-4 hide-scrollbar cursor-grab active:cursor-grabbing">
              {activeStyles.map((style) => (
                <div
                  key={style.id}
                  className="snap-start shrink-0 w-[75vw] sm:w-[calc(50%-12px)] lg:w-[calc(25%-18px)] group bg-white rounded-2xl overflow-hidden border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full"
                >
                  <div
                    className="relative aspect-square bg-heritage-cream/30 overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (onSelectStyle) onSelectStyle(style.id, "");
                    }}
                  >
                    {style.image ? (
                      <img
                        src={style.image}
                        alt={style.name}
                        loading="lazy"
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-in-out"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-heritage-cream/50 group-hover:scale-105 transition-transform duration-700 ease-in-out flex items-center justify-center">
                        <span className="text-heritage-gold/40 font-serif text-sm">No Image</span>
                      </div>
                    )}
                    
                    {/* Subtle overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    {/* Badges */}
                    <div className="absolute top-3 right-3 flex flex-col gap-2 items-end">
                      {style.gender && (
                        <span className="px-2 py-1 bg-heritage-green/90 text-white backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          {style.gender === "male" ? "Men" : style.gender === "female" ? "Women" : style.gender}
                        </span>
                      )}
                      {style.outfitType && (
                        <span className="px-2 py-1 bg-heritage-gold/90 text-heritage-forest backdrop-blur-md rounded text-[9px] font-bold uppercase tracking-wider shadow-sm border border-white/20">
                          {style.outfitType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 flex flex-col flex-grow bg-white relative z-10 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3
                          className="font-serif font-bold text-heritage-green text-lg leading-tight line-clamp-1 group-hover:text-heritage-gold transition-colors cursor-pointer"
                          onClick={() => {
                            if (onSelectStyle) onSelectStyle(style.id, "");
                          }}
                        >
                          {style.name}
                        </h3>
                        {style.description && (
                          <p className="text-xs text-heritage-ink/60 font-medium mt-1 line-clamp-2 leading-relaxed">
                            {style.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto pt-4">
                      <button
                        onClick={() => {
                          if (onSelectStyle) {
                            onSelectStyle(style.id, "");
                          }
                        }}
                        className="w-full py-2.5 px-4 bg-heritage-cream/50 text-heritage-green border border-heritage-gold/30 hover:bg-heritage-gold hover:text-heritage-forest hover:border-heritage-gold rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-sm flex justify-center items-center gap-2"
                      >
                        Design this style <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Made For Everyone */}
      <section className="space-y-8 py-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Made For Everyone
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Authentic Nigerian traditional clothing, thoughtfully tailored for
            individuals, couples, families, and children in our multicultural
            community.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 px-4 sm:px-8">
          {[
            {
              icon: "👔",
              title: "Men",
              description:
                "Traditional attire including Senator wear, Agbada, Isiagu, Kaftans, Shirts, and more.",
            },
            {
              icon: "👗",
              title: "Women",
              description:
                "Elegant gowns, skirts, blouses, wrappers, dresses, and beautifully tailored traditional outfits.",
            },
            {
              icon: "👨‍👩‍👧‍👦",
              title: "Families & Couples",
              description:
                "Coordinate matching outfits for weddings, celebrations, cultural events, and family portraits.",
            },
            {
              icon: "🧒",
              title: "Children",
              description:
                "Traditional clothing specially tailored for children while preserving comfort, style, and authenticity.",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 border border-heritage-gold/15 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col h-full group"
            >
              <div className="w-14 h-14 bg-heritage-cream/30 border border-heritage-gold/20 rounded-xl flex items-center justify-center text-2xl mb-5 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                {item.icon}
              </div>
              <h3 className="font-serif font-bold text-heritage-green text-xl mb-3 group-hover:text-heritage-gold transition-colors">
                {item.title}
              </h3>
              <p className="text-sm text-heritage-ink/70 leading-relaxed font-sans">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center pt-6">
          <button
            onClick={() => onNavigateToTab(heroDestination as any)}
            className="inline-flex bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white px-8 py-3.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-md items-center gap-2 cursor-pointer"
          >
            {heroPrimaryAction} <ArrowRight size={14} />
          </button>
        </div>
      </section>

      {/* Community Photo Gallery Showcase */}
      <section id="community-gallery" className="space-y-8">
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-heritage-green tracking-tight">
            Our Community Gallery
          </h2>
          <p className="text-sm text-heritage-ink/75 leading-relaxed">
            Discover members of the NIGERIAN TRADITIONAL CLOTHING COMMUNITY
            (NTCC) proudly wearing their custom-made traditional outfits,
            handcrafted in Nigeria and delivered to the Netherlands.
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
                    className="w-full h-full object-contain"
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

      {/* Community Impact Social Proof Section */}
      <section className="bg-heritage-green text-white rounded-3xl p-8 sm:p-12 text-center max-w-5xl mx-auto shadow-2xl border border-heritage-gold/20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80')] opacity-5 mix-blend-overlay"></div>
        <div className="relative z-10 space-y-10">
          <div className="space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-heritage-gold tracking-tight">
              Join Hundreds Celebrating Nigerian Culture
            </h2>
            <p className="text-base sm:text-lg text-white/80 font-sans leading-relaxed max-w-2xl mx-auto">
              Become part of a growing multicultural community in the
              Netherlands discovering the beauty of authentic Nigerian
              traditional clothing.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-heritage-gold/50 transition-colors shadow-sm flex flex-col justify-center items-center group">
              <span className="text-4xl sm:text-5xl font-serif font-bold text-heritage-gold mb-2 block group-hover:scale-110 transition-transform duration-300">
                <CountUpNumber
                  value={
                    batches?.reduce(
                      (acc, b) => acc + (b.currentCustomers || 0),
                      0,
                    ) ||
                    (customers && customers.length > 0 ? customers.length : 24)
                  }
                />
              </span>
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold font-sans">
                Participants
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-heritage-gold/50 transition-colors shadow-sm flex flex-col justify-center items-center group">
              <span className="text-4xl sm:text-5xl font-serif font-bold text-heritage-gold mb-2 block group-hover:scale-110 transition-transform duration-300">
                <CountUpNumber
                  value={
                    batches?.reduce(
                      (acc, b) => acc + CapacityService.getReservedCapacity(b),
                      0,
                    ) || (orders && orders.length > 0 ? orders.length : 30)
                  }
                />
              </span>
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold font-sans">
                Traditional Outfits
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-heritage-gold/50 transition-colors shadow-sm flex flex-col justify-center items-center group">
              <span className="text-4xl sm:text-5xl font-serif font-bold text-heritage-gold mb-2 block group-hover:scale-110 transition-transform duration-300">
                <CountUpNumber value={6} />
              </span>
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold font-sans">
                Nationalities
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10 hover:border-heritage-gold/50 transition-colors shadow-sm flex flex-col justify-center items-center group">
              <div className="h-12 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                <Sparkles className="text-heritage-gold" size={32} />
              </div>
              <span className="text-xs uppercase tracking-widest text-white/70 font-semibold font-sans">
                Growing Every Batch
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <button
                onClick={() => onNavigateToTab(heroDestination as any)}
                className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green transition duration-300 px-10 py-4 rounded-xl text-sm font-bold uppercase tracking-wider shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                {heroPrimaryAction} <ArrowRight size={16} />
              </button>

            <button
              onClick={() => {
                const el = document.getElementById("community-gallery");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else onNavigateToTab("gallery");
              }}
              className="w-full sm:w-auto text-white hover:text-heritage-gold transition duration-300 px-6 py-4 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center justify-center cursor-pointer"
            >
              View Community Gallery
            </button>
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
          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "The fit is perfect. Ordering custom clothes from Lagos and
              getting them delivered directly to{" "}
              {businessSettings.productionSettings.defaultPickupLocation} is
              super easy and convenient. I love wearing my Senator shirt on
              Mondays."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold shrink-0">
                AO
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Amadi O.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Senior Engineer, Eindhoven
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "My Royal Senator suit fits exactly as estimated. The process was
              very simple, and my colleagues love the design!"
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold shrink-0">
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

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "I've received compliments every time I wear my traditional outfit. The craftsmanship is outstanding, the fit is perfect, and the delivery process was surprisingly smooth."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-green text-white font-serif flex items-center justify-center text-xs font-bold shrink-0">
                MV
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Martijn V.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  ASML Mechanical Engineer
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-heritage-gold/15 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between h-full">
            <p className="italic text-xs text-heritage-ink/80 leading-relaxed font-serif text-[13px]">
              "I loved being able to choose my own fabric and style. The entire experience felt personal, and the finished outfit exceeded my expectations."
            </p>
            <div className="flex items-center gap-3 pt-3 border-t border-gray-150">
              <div className="h-8 w-8 rounded-full bg-heritage-gold text-heritage-green font-serif flex items-center justify-center text-xs font-bold shrink-0">
                SK
              </div>
              <div>
                <strong className="text-xs text-heritage-green block">
                  Sarah K.
                </strong>
                <span className="text-[10px] text-heritage-ink/50 block">
                  Project Coordinator, Eindhoven
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final Call to Action Section */}
      <section className="relative overflow-hidden rounded-3xl bg-heritage-green p-8 sm:p-12 lg:p-16 text-white shadow-2xl border border-heritage-gold/20 text-center mx-auto mb-8">
        <div className="absolute -left-24 -top-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border border-heritage-gold/10 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl text-heritage-gold/5 pointer-events-none font-serif select-none">
          ⚜
        </div>
        
        <div className="relative z-10 space-y-8 max-w-3xl mx-auto">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold tracking-tight text-white leading-tight">
              Ready to Design Your Custom Outfit?
            </h2>
            <div className="space-y-3 text-sm text-heritage-beige max-w-2xl mx-auto leading-relaxed">
              <p>
                Experience authentic Nigerian traditional clothing, handcrafted by skilled artisans in Nigeria and custom-made to your preferences.
              </p>
              <p>
                Every outfit is created with exceptional craftsmanship and carefully delivered to our community in the Netherlands.
              </p>
              <p>
                Whether you're celebrating your heritage, attending a cultural event, or simply appreciating beautiful craftsmanship, your custom outfit begins here.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-heritage-beige/90 py-4 font-medium">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Handcrafted in Nigeria</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Custom Made for Every Customer</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Secure Delivery to the Netherlands</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-heritage-gold" />
              <span>Authentic Traditional Craftsmanship</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={() => onNavigateToTab(heroDestination as any)}
              className="w-full sm:w-auto bg-heritage-gold text-heritage-forest hover:bg-white hover:text-heritage-green px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 shadow-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {heroPrimaryAction} <ArrowRight size={14} />
            </button>
            <button
              onClick={() => onNavigateToTab(journey.destination === "gallery" ? "design" : "gallery")}
              className="w-full sm:w-auto border border-heritage-gold/50 text-heritage-gold hover:bg-heritage-gold/10 transition duration-300 px-8 py-4 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer"
            >
              {journey.secondaryAction}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CountUpNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let hasAnimated = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          hasAnimated = true;

          let startTime: number;
          const duration = 2000;

          const animateCount = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);

            const easeOut = 1 - Math.pow(1 - progress, 4);
            setDisplayValue(Math.floor(easeOut * value));

            if (progress < 1) {
              requestAnimationFrame(animateCount);
            }
          };

          requestAnimationFrame(animateCount);
        }
      },
      { threshold: 0.1 },
    );

    if (elementRef.current) {
      observer.observe(elementRef.current);
    }

    return () => observer.disconnect();
  }, [value]);

  return <span ref={elementRef}>{displayValue}</span>;
}
