/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StyleCategory,
  Fabric,
  HistoricalOrder,
  Design,
  CommunityPhoto,
  Batch,
  BusinessSettings,
} from "../types";

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  collaborationLogos: {
    left: null,
    right: null,
  },
  batchSettings: {
    minGarmentsPerBatch: 15,
    maxGarmentsPerBatch: 300,
    minParticipantsRequired: 10,
    defaultCommunityBatchSize: 40,
    automaticBatchStatusRules: true,
  },
  shippingSettings: {
    communityBatchShippingRate: 0,
    individualOrderShippingRate: 35,
    personalizedBatchShippingRate: 15,
    internationalDeliverySurcharge: 25,
    expressDeliverySurcharge: 50,
  },
  pricingSettings: {
    depositPercentage: 50,
    balancePercentage: 50,
    currency: "EUR",
    vatTaxPercentage: 21,
    discountRulesEnabled: false,
    standardAccessoryCharge: 10,
    baseSewingPrices: {
      "Senator Set_2-Piece Set": 160,
      "Senator Shirt_Shirt Only": 120,
      "Native Shirt_Shirt Only": 110,
      "Kaftan_Kaftan Only": 145,
      "Kaftan Set_2-Piece Set": 165,
      "Agbada_3-Piece Set": 275,
      "Isiagu Set_2-Piece Set": 180,
      "Dashiki_Shirt Only": 115,
      "Buba & Sokoto_2-Piece Set": 150,
      "Shirt & Trouser_2-Piece Set": 155,
      "Shirt & Shorts_2-Piece Set": 135,
      "Traditional Suit_2-Piece Set": 195,
      "Maxi Gown_Dress Only": 180,
      "Midi Gown_Dress Only": 160,
      "Shift Dress_Dress Only": 140,
      "Boubou_Dress Only": 180,
      "Kaftan Dress_Dress Only": 165,
      "Kimono Set_2-Piece Set": 175,
      "Blouse_Blouse Only": 95,
      "Top & Skirt_2-Piece Set": 150,
      "Wrapper Set_Wrapper Only": 110,
      "Skirt Set_2-Piece Set": 145,
      "Palazzo Trouser_Trouser Only": 95,
      "Jumpsuit_Dress Only": 150,
      "Couple Collection_Couple Set": 290,
      "Parent & Child Collection_Parent & Child Set": 240,
      "Family Collection_Family Set": 380,
    },
  },
  productionSettings: {
    productionStartThresholdPercentage: 90,
    estimatedProductionDurationDays: 45,
    defaultDeliveryWindowDays: 60,
    defaultPickupLocation: "Veldhoven Campus Lockers",
  },
  applicationSettings: {
    communityName: "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)",
    tagline: "NIGERIAN TRADITIONAL CLOTHING COMMUNITY (NTCC)",
    defaultActiveBatchId: "batch-6",
    defaultCountry: "Netherlands",
    notificationMessagesEnabled: true,
    systemAnnouncements: "",
    virtualTryOnConceptImage: "",
  },
  discountSettings: {
    individualOrders: {
      suggestedMinRange: 5,
      suggestedMaxRange: 10,
      minimumDiscount: 0,
      maximumDiscount: 15,
      internalNotes: "Planning only. Standard bespoke sizing applies.",
    },
    communityOrders: {
      suggestedMinRange: 10,
      suggestedMaxRange: 20,
      minimumDiscount: 5,
      maximumDiscount: 25,
      internalNotes: "Planning only. Volume-based batch rules remain standard.",
    },
    vipOrders: {
      status: "planning_only",
      internalNotes:
        "VIP benefits will integrate directly with high-net-worth individual client groups.",
    },
    futureDiscounts: [
      {
        id: "disc-1",
        name: "Early Bird Senator Launch",
        type: "percentage",
        value: 10,
        appliesTo: "community",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        stackable: false,
        active: false,
        internalNotes:
          "To launch alongside next cohort. For WooCommerce coupon sync readiness.",
      },
      {
        id: "disc-2",
        name: "Lagos Heritage VIP",
        type: "fixed_amount",
        value: 50,
        appliesTo: "vip",
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        stackable: true,
        active: false,
        internalNotes:
          "For exclusive high-tier loyal customers. Standard discount rule sync.",
      },
    ],
  },
  garmentCompositions: [
    "Shirt Only",
    "Trouser Only",
    "Shorts Only",
    "Blouse Only",
    "Top Only",
    "Skirt Only",
    "Wrapper Only",
    "Dress Only",
    "Kaftan Only",
    "Agbada Only",
    "2-Piece Set",
    "3-Piece Set",
    "4-Piece Set",
    "Couple Set",
    "Parent & Child Set",
    "Family Set",
  ],
  outfitTypes: [
    {
      id: "senator-set",
      name: "Senator Set",
      gender: "male",
      enabled: true,
      displayOrder: 1,
    },
    {
      id: "senator-shirt",
      name: "Senator Shirt",
      gender: "male",
      enabled: true,
      displayOrder: 2,
    },
    {
      id: "native-shirt",
      name: "Native Shirt",
      gender: "male",
      enabled: true,
      displayOrder: 3,
    },
    {
      id: "kaftan",
      name: "Kaftan",
      gender: "male",
      enabled: true,
      displayOrder: 4,
    },
    {
      id: "kaftan-set",
      name: "Kaftan Set",
      gender: "male",
      enabled: true,
      displayOrder: 5,
    },
    {
      id: "agbada",
      name: "Agbada",
      gender: "male",
      enabled: true,
      displayOrder: 6,
    },
    {
      id: "isiagu-set",
      name: "Isiagu Set",
      gender: "male",
      enabled: true,
      displayOrder: 7,
    },
    {
      id: "dashiki",
      name: "Dashiki",
      gender: "male",
      enabled: true,
      displayOrder: 8,
    },
    {
      id: "buba-sokoto",
      name: "Buba & Sokoto",
      gender: "male",
      enabled: true,
      displayOrder: 9,
    },
    {
      id: "shirt-trouser",
      name: "Shirt & Trouser",
      gender: "male",
      enabled: true,
      displayOrder: 10,
    },
    {
      id: "shirt-shorts",
      name: "Shirt & Shorts",
      gender: "male",
      enabled: true,
      displayOrder: 11,
    },
    {
      id: "traditional-suit",
      name: "Traditional Suit",
      gender: "male",
      enabled: true,
      displayOrder: 12,
    },
    {
      id: "maxi-gown",
      name: "Maxi Gown",
      gender: "female",
      enabled: true,
      displayOrder: 13,
    },
    {
      id: "midi-gown",
      name: "Midi Gown",
      gender: "female",
      enabled: true,
      displayOrder: 14,
    },
    {
      id: "shift-dress",
      name: "Shift Dress",
      gender: "female",
      enabled: true,
      displayOrder: 15,
    },
    {
      id: "boubou",
      name: "Boubou",
      gender: "female",
      enabled: true,
      displayOrder: 16,
    },
    {
      id: "kaftan-dress",
      name: "Kaftan Dress",
      gender: "female",
      enabled: true,
      displayOrder: 17,
    },
    {
      id: "kimono-set",
      name: "Kimono Set",
      gender: "female",
      enabled: true,
      displayOrder: 18,
    },
    {
      id: "blouse",
      name: "Blouse",
      gender: "female",
      enabled: true,
      displayOrder: 19,
    },
    {
      id: "top-skirt",
      name: "Top & Skirt",
      gender: "female",
      enabled: true,
      displayOrder: 20,
    },
    {
      id: "wrapper-set",
      name: "Wrapper Set",
      gender: "female",
      enabled: true,
      displayOrder: 21,
    },
    {
      id: "skirt-set",
      name: "Skirt Set",
      gender: "female",
      enabled: true,
      displayOrder: 22,
    },
    {
      id: "palazzo-trouser",
      name: "Palazzo Trouser",
      gender: "female",
      enabled: true,
      displayOrder: 23,
    },
    {
      id: "jumpsuit",
      name: "Jumpsuit",
      gender: "female",
      enabled: true,
      displayOrder: 24,
    },
    {
      id: "couple-collection",
      name: "Couple Collection",
      gender: "family",
      enabled: true,
      displayOrder: 25,
    },
    {
      id: "parent-child-collection",
      name: "Parent & Child Collection",
      gender: "family",
      enabled: true,
      displayOrder: 26,
    },
    {
      id: "family-collection",
      name: "Family Collection",
      gender: "family",
      enabled: true,
      displayOrder: 27,
    },
  ],
};

export const MOCK_BATCHES: Batch[] = [
  {
    id: "batch-1",
    batchNumber: 1,
    name: "Pioneers",
    startDate: "2025-03-10",
    endDate: "2025-04-25",
    duration: "Mar 10 – Apr 25, 2025",
    targetGarments: 13,
    currentGarments: 13,
    currentCustomers: 8,
    currentOrders: 9,
    status: "COMPLETED",
    visibility: "PUBLIC",
    estimatedDelivery: "May 2025",
    pickupLocation: "Veldhoven Campus Lockers",
    timeline: { delivered: "2025-05-15" },
  },
  {
    id: "batch-2",
    batchNumber: 2,
    name: "Avengers",
    startDate: "2025-09-09",
    endDate: "2025-11-24",
    duration: "Sep 09 – Nov 24, 2025",
    targetGarments: 20,
    currentGarments: 20,
    currentCustomers: 12,
    currentOrders: 15,
    status: "COMPLETED",
    visibility: "PUBLIC",
    estimatedDelivery: "Dec 2025",
    pickupLocation: "Veldhoven Campus Lockers",
    timeline: { delivered: "2025-12-10" },
  },
  {
    id: "batch-3",
    batchNumber: 3,
    name: "Transformers",
    startDate: "2025-12-05",
    endDate: "2026-02-17",
    duration: "Dec 05, 2025 – Feb 17, 2026",
    targetGarments: 28,
    currentGarments: 28,
    currentCustomers: 18,
    currentOrders: 20,
    status: "COMPLETED",
    visibility: "PUBLIC",
    estimatedDelivery: "Mar 2026",
    pickupLocation: "Veldhoven Campus Lockers",
    timeline: { delivered: "2026-03-05" },
  },
  {
    id: "batch-4",
    batchNumber: 4,
    name: "Executives",
    startDate: "2026-03-16",
    endDate: "2026-05-10",
    duration: "Mar 16 – May 10, 2026",
    targetGarments: 32,
    currentGarments: 32,
    currentCustomers: 22,
    currentOrders: 25,
    status: "COMPLETED",
    visibility: "PUBLIC",
    estimatedDelivery: "Jun 2026",
    pickupLocation: "Veldhoven Campus Lockers",
    timeline: { delivered: "2026-06-12" },
  },
  {
    id: "batch-5",
    batchNumber: 5,
    name: "Gladiators",
    startDate: "2026-05-18",
    endDate: "2026-07-06",
    duration: "May 18 – Jul 06, 2026",
    targetGarments: 40,
    currentGarments: 40,
    currentCustomers: 25,
    currentOrders: 28,
    status: "PRODUCTION_STARTED",
    visibility: "PUBLIC",
    estimatedDelivery: "Aug 2026",
    pickupLocation: "Veldhoven Campus Lockers",
    fabricForecast: {
      requiredYards: 240,
      requiredRolls: 40,
      inventoryStatus: "Sufficient",
    },
    shippingForecast: {
      totalPackages: 28,
      estimatedWeightKg: 85,
      estimatedVolumeCbm: 2.1,
      shippingTier: "Freight",
      expectedTransportCost: 450,
    },
  },
  {
    id: "batch-6",
    batchNumber: 6,
    name: "Avatars",
    startDate: "2026-07-06",
    endDate: "2026-09-30",
    duration: "Jul 06 – Sep 31, 2026",
    targetGarments: 72,
    currentGarments: 26,
    currentCustomers: 12,
    currentOrders: 18,
    status: "RECRUITING",
    visibility: "PUBLIC",
    estimatedDelivery: "Nov 2026",
    pickupLocation: "Veldhoven Campus Lockers",
    fabricForecast: {
      requiredYards: 430,
      requiredRolls: 72,
      inventoryStatus: "Procuring",
    },
    shippingForecast: {
      totalPackages: 45,
      estimatedWeightKg: 140,
      estimatedVolumeCbm: 3.5,
      shippingTier: "Freight",
      expectedTransportCost: 750,
    },
  },
  {
    id: "batch-7",
    batchNumber: 7,
    name: "Power Rangers",
    startDate: "2026-09-07",
    endDate: "2026-10-12",
    duration: "Sep 07 – Oct 12, 2026",
    targetGarments: 104,
    currentGarments: 0,
    currentCustomers: 0,
    currentOrders: 0,
    status: "YET_TO_START",
    visibility: "PUBLIC",
    estimatedDelivery: "Nov 2026",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  {
    id: "batch-8",
    batchNumber: 8,
    name: "Musketeers",
    startDate: "2026-10-12",
    endDate: "2026-11-16",
    duration: "Oct 12 – Nov 16, 2026",
    targetGarments: 136,
    currentGarments: 0,
    currentCustomers: 0,
    currentOrders: 0,
    status: "YET_TO_START",
    visibility: "PUBLIC",
    estimatedDelivery: "Dec 2026",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  {
    id: "batch-9",
    batchNumber: 9,
    name: "Governors",
    startDate: "2026-11-16",
    endDate: "2026-12-21",
    duration: "Nov 16 – Dec 21, 2026",
    targetGarments: 168,
    currentGarments: 0,
    currentCustomers: 0,
    currentOrders: 0,
    status: "YET_TO_START",
    visibility: "PUBLIC",
    estimatedDelivery: "Jan 2027",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  {
    id: "batch-10",
    batchNumber: 10,
    name: "Jesus Lovers",
    startDate: "2026-12-21",
    endDate: "2027-01-25",
    duration: "Dec 21, 2026 – Jan 25, 2027",
    targetGarments: 232,
    currentGarments: 0,
    currentCustomers: 0,
    currentOrders: 0,
    status: "YET_TO_START",
    visibility: "PUBLIC",
    estimatedDelivery: "Feb 2027",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  {
    id: "batch-11",
    batchNumber: 11,
    name: "Beetles",
    startDate: "2027-01-25",
    endDate: "2027-03-01",
    duration: "Jan 25 – Mar 01, 2027",
    targetGarments: 296,
    currentGarments: 0,
    currentCustomers: 0,
    currentOrders: 0,
    status: "YET_TO_START",
    visibility: "PUBLIC",
    estimatedDelivery: "Apr 2027",
    pickupLocation: "Veldhoven Campus Lockers",
  },
];

import royalSenatorImg from "../assets/images/royal_senator_photo_1782308123393.jpg";
import executiveKaftanImg from "../assets/images/executive_kaftan_photo_1782308137246.jpg";
import grandAgbadaImg from "../assets/images/grand_agbada_photo_1782308152763.jpg";
import classicBoubouImg from "../assets/images/classic_boubou_photo_1782308168549.jpg";
import coutureGownImg from "../assets/images/couture_gown_photo_1782308183701.jpg";

const BASE_DESIGNS: StyleCategory[] = [
  {
    id: "royal-senator",
    name: "Royal Senator",
    description:
      "A sharp, architectural classic featuring structured fits, crisp mandarin collar design, and custom embroidery options. A staple of modern prestige.",
    basePrice: 170.0,
    gender: "male",
    options: ["Mandarin Collar", "Hidden Button Placket", "Sleek Side Vent"],
    image: royalSenatorImg,
    outfitType: "Senator Set",
    garmentComposition: "2-Piece Set",
  },
  {
    id: "executive-kaftan",
    name: "Executive Kaftan",
    description:
      "An elegant long-hem traditional tunic perfect for formal occasions or casual executive prestige. Offers maximum comfort and supreme flow.",
    basePrice: 150.0,
    gender: "male",
    options: ["Flared Hemline", "Turn-up Cuffs", "Traditional Side Openings"],
    image: executiveKaftanImg,
    outfitType: "Kaftan Set",
    garmentComposition: "Kaftan Only",
  },
  {
    id: "grand-agbada",
    name: "Grand Agbada",
    description:
      "The ultimate majestic three-piece suite including an expansive outer robe, inner tunic, trousers, and optional customized traditional cap.",
    basePrice: 280.0,
    gender: "male",
    options: [
      "Majestic Wide Robe",
      "Elaborate Embroidery Bed",
      "Matching Fila Cap",
    ],
    image: grandAgbadaImg,
    outfitType: "Agbada",
    garmentComposition: "3-Piece Set",
  },
  {
    id: "classic-boubou",
    name: "Classic Boubou",
    description:
      "An effortlessly elegant, flowing gown radiating queenly grace. Softly contoured lines, loose-cut comfortable silhouette, and delicate neckline detailing.",
    basePrice: 185.0,
    gender: "female",
    options: [
      "Flowing Caftan Sleeves",
      "Gilded Neck Accents",
      "Comfort Soft Drape",
    ],
    image: classicBoubouImg,
    outfitType: "Boubou",
    garmentComposition: "Dress Only",
  },
  {
    id: "couture-gown",
    name: "Couture Gown",
    description:
      "Tailor-fitted luxury gown with custom flare or mermaid silhouette, custom shoulder styling, and intricate structural seams for majestic celebration wear.",
    basePrice: 245.0,
    gender: "female",
    options: [
      "Mermaid Flare Seams",
      "Fitted Bodice",
      "Luxury Border Detailing",
    ],
    image: coutureGownImg,
    outfitType: "Maxi Gown",
    garmentComposition: "Dress Only",
  },
];

const prefixes = [
  "Sovereign",
  "Imperial",
  "Prestige",
  "Monarch",
  "Elite",
  "Heritage",
  "Savannah",
  "Gala",
  "Odogwu",
  "Vanguard",
  "Dignitary",
  "Ambassador",
  "Chancellor",
  "Patrician",
  "Edo Noble",
  "Calabar",
  "Kano",
  "Lagos Boulevard",
  "Biafran Gold",
  "Modernist",
  "Ascot",
  "Emperor",
  "Sultan",
  "Baron",
  "Gentry",
];

const designTypes = [
  {
    type: "Senator",
    gender: "male",
    image: royalSenatorImg,
    basePrice: 160,
    options: [
      "Mandarin Collar",
      "Hidden Button Placket",
      "Sleek Side Vent",
      "Embroidered Pocket",
    ],
    outfitType: "Senator Set",
    garmentComposition: "2-Piece Set",
  },
  {
    type: "Kaftan",
    gender: "male",
    image: executiveKaftanImg,
    basePrice: 145,
    options: [
      "Flared Hemline",
      "Turn-up Cuffs",
      "Traditional Side Openings",
      "Contrast Cuff Trim",
    ],
    outfitType: "Kaftan Set",
    garmentComposition: "Kaftan Only",
  },
  {
    type: "Agbada",
    gender: "male",
    image: grandAgbadaImg,
    basePrice: 275,
    options: [
      "Majestic Wide Robe",
      "Elaborate Embroidery Bed",
      "Matching Fila Cap",
      "Royal Agbada Accent",
    ],
    outfitType: "Agbada",
    garmentComposition: "3-Piece Set",
  },
  {
    type: "Boubou",
    gender: "female",
    image: classicBoubouImg,
    basePrice: 180,
    options: [
      "Flowing Caftan Sleeves",
      "Gilded Neck Accents",
      "Comfort Soft Drape",
      "Intricate Lace Hem",
    ],
    outfitType: "Boubou",
    garmentComposition: "Dress Only",
  },
  {
    type: "Couture Gown",
    gender: "female",
    image: coutureGownImg,
    basePrice: 235,
    options: [
      "Mermaid Flare Seams",
      "Fitted Bodice",
      "Luxury Border Detailing",
      "Off-shoulder Drape",
    ],
    outfitType: "Maxi Gown",
    garmentComposition: "Dress Only",
  },
];

const generatedStyles: StyleCategory[] = [...BASE_DESIGNS];

let idCounter = 1;
for (let i = 0; i < 45; i++) {
  const prefix = prefixes[i % prefixes.length];
  const designType = designTypes[i % designTypes.length];

  const priceVariance = (i * 3) % 45;
  const basePrice = Math.round(designType.basePrice + priceVariance);
  const name = `${prefix} ${designType.type}`;
  const description = `A bespoke and premium variant of our traditional ${designType.type.toLowerCase()} template, showcasing premium ${priceVariance % 2 === 0 ? "gilded embroidery lines" : "double-stitched structural hems"}, optimized collar cuts, and standard executive proportions.`;

  generatedStyles.push({
    id: `${designType.type.toLowerCase().replace(" ", "-")}-var-${idCounter++}`,
    name,
    description,
    basePrice,
    gender: designType.gender as "male" | "female",
    options: [...designType.options],
    image: designType.image,
    outfitType: designType.outfitType,
    garmentComposition: designType.garmentComposition,
  });
}

export const STYLE_CATEGORIES = generatedStyles;

// Real Curated Design Collection (matching user request)
export const DESIGN_COLLECTION: Design[] = [
  {
    designCode: "DSG-SEN-001",
    styleCategory: "Senator",
    garmentType: "Shirt + Trouser Set",
    image: royalSenatorImg,
    description:
      "Crisp upright collar with a high-accuracy concealed pocket line. Streamlined and business-ready.",
  },
  {
    designCode: "DSG-KAF-002",
    styleCategory: "Kaftan",
    garmentType: "Tunic + Pants",
    image: executiveKaftanImg,
    description:
      "Long-hem cultural Kaftan featuring subtle side slits and hand-turned sleeve cuffs for everyday comfort.",
  },
  {
    designCode: "DSG-AGB-003",
    styleCategory: "Agbada",
    garmentType: "Complete 3-Piece Set",
    image: grandAgbadaImg,
    description:
      "Grand traditional robe with custom wide shoulder drapery and detailed high-density chest embroidery.",
  },
  {
    designCode: "DSG-BOU-004",
    styleCategory: "Boubou",
    garmentType: "Flowing Gown",
    image: classicBoubouImg,
    description:
      "Breezy caftan silhouette providing queenly grace and effortless luxury. Ideal for campus celebrations.",
  },
  {
    designCode: "DSG-GWN-005",
    styleCategory: "Couture Gown",
    garmentType: "Tailor-Fitted Gown",
    image: coutureGownImg,
    description:
      "Masterfully stitched floor-length gown featuring structured waist lines, mermaid flares, and customizable necklines.",
  },
];

// Enriching fabrics with suggested database parameters & categories
const BASE_FABRICS: Fabric[] = [
  {
    code: "ODG-001",
    name: "Hollandis Ankara - Lagos Crest",
    description:
      "High-thread-count premium Nigerian polished cotton. Machine printed.",
    colorHex: "#0D3E26",
    priceMultiplier: 1.05,
    stockStatus: "IN_STOCK",
    category: "PRINTED_FABRICS",
    image:
      "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=400",
    color: "Emerald Green",
    width: "45 inches",
    price: 45.0,
    stock: 120,
  },
  {
    code: "ODG-002",
    name: "Hi-Target Ankara - Royal Geo",
    description:
      "Lightweight brocade cotton imported for cultural gala events. Machine printed.",
    colorHex: "#0D5C75",
    priceMultiplier: 0.95,
    stockStatus: "LOW_STOCK",
    category: "PRINTED_FABRICS",
    image:
      "https://images.unsplash.com/photo-1584184922226-f725f05a9603?auto=format&fit=crop&q=80&w=400",
    color: "Teal Blue",
    width: "45 inches",
    price: 49.5,
    stock: 14,
  },
  {
    code: "ODG-003",
    name: "Isiagu (Ankara) - Sovereign",
    description:
      "Stately and rich machine printed woven damask, blending warm ochre gold and beige threads.",
    colorHex: "#C5A85C",
    priceMultiplier: 1.25,
    stockStatus: "IN_STOCK",
    category: "PRINTED_FABRICS",
    image:
      "https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80&w=400",
    color: "Ochre Gold",
    width: "50 inches",
    price: 56.25,
    stock: 85,
  },
  {
    code: "ODG-004",
    name: "Kampala (Standard Grade)",
    description:
      "Authentic tie-dye/resist-dyed cotton from local artisanal weavers in southwestern Nigeria.",
    colorHex: "#121212",
    priceMultiplier: 1.1,
    stockStatus: "IN_STOCK",
    category: "HANDCRAFTED_FABRICS",
    image:
      "https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?auto=format&fit=crop&q=80&w=400",
    color: "Deep Charcoal Black",
    width: "58 inches",
    price: 65.0,
    stock: 40,
  },
  {
    code: "ODG-005",
    name: "Kampala (High Grade)",
    description:
      "Authentic high grade hand-dyed adire cotton from local artisanal weavers in southwestern Nigeria.",
    colorHex: "#22325F",
    priceMultiplier: 1.2,
    stockStatus: "IN_STOCK",
    category: "HANDCRAFTED_FABRICS",
    image:
      "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=400",
    color: "Indigo Blue",
    width: "45 inches",
    price: 51.75,
    stock: 60,
  },
];

const fabricAdjectives = [
  "Prestige",
  "Sovereign",
  "Kano",
  "Calabar",
  "Imperial",
  "Vanguard",
  "Safari",
  "Lagos Boulevard",
  "Sahara",
  "Ancestral",
  "Dynasty",
  "Ounje",
  "Meridian",
  "Alhaji",
  "Eze",
  "Gentry",
  "Eclipse",
  "Edo Noble",
  "Dignitary",
  "Sultan",
];

const colors = [
  { name: "Sapphire Blue", hex: "#0F2C59" },
  { name: "Ruby Crimson", hex: "#8B0000" },
  { name: "Forest Moss", hex: "#2E5A44" },
  { name: "Desert Sand", hex: "#D2B48C" },
  { name: "Burgundy Wine", hex: "#581845" },
  { name: "Ivory Cream", hex: "#F5F5DC" },
  { name: "Charcoal Slate", hex: "#36454F" },
  { name: "Sunset Ochre", hex: "#D35400" },
  { name: "Midnight Purple", hex: "#4A235A" },
  { name: "Platinum Grey", hex: "#E5E7EB" },
  { name: "Bronze Dust", hex: "#A97C50" },
  { name: "Olive Shade", hex: "#556B2F" },
];

const materials = [
  {
    type: "Hollandis Ankara",
    mult: 1.05,
    cat: "PRINTED_FABRICS" as const,
    mfr: "Machine printed",
  },
  {
    type: "Hi-Target Ankara",
    mult: 0.95,
    cat: "PRINTED_FABRICS" as const,
    mfr: "Machine printed",
  },
  {
    type: "Isiagu (Ankara)",
    mult: 1.25,
    cat: "PRINTED_FABRICS" as const,
    mfr: "Machine printed",
  },
  {
    type: "Kampala (Standard Grade)",
    mult: 1.1,
    cat: "HANDCRAFTED_FABRICS" as const,
    mfr: "Hand Crafted",
  },
  {
    type: "Kampala (High Grade)",
    mult: 1.2,
    cat: "HANDCRAFTED_FABRICS" as const,
    mfr: "Hand Crafted",
  },
  {
    type: "Isiagu (Akwa-Oche)",
    mult: 1.35,
    cat: "TRADITIONAL_FABRICS" as const,
    mfr: "Premium Quality",
  },
  {
    type: "Lace",
    mult: 1.5,
    cat: "LUXURY_FABRICS" as const,
    mfr: "Premium Quality",
  },
  {
    type: "Asioke (By Tailor)",
    mult: 1.3,
    cat: "TRADITIONAL_FABRICS" as const,
    mfr: "Tailored",
  },
  {
    type: "Adire",
    mult: 1.15,
    cat: "HANDCRAFTED_FABRICS" as const,
    mfr: "Hand Crafted",
  },
  {
    type: "Aso Oke",
    mult: 1.4,
    cat: "TRADITIONAL_FABRICS" as const,
    mfr: "Premium Quality",
  },
  {
    type: "Kente",
    mult: 1.45,
    cat: "TRADITIONAL_FABRICS" as const,
    mfr: "Traditionally hand-woven",
  },
];

const generatedFabrics: Fabric[] = [...BASE_FABRICS];

for (let i = 0; i < 45; i++) {
  const adj = fabricAdjectives[i % fabricAdjectives.length];
  const color = colors[i % colors.length];
  const mat = materials[i % materials.length];

  const codeNum = i + 6;
  const code = `ODG-${String(codeNum).padStart(3, "0")}`;
  const name = `${adj} ${color.name} ${mat.type}`;
  const description = `A masterfully crafted ${color.name.toLowerCase()} ${mat.type.toLowerCase()} showcasing unique traditional textures. Perfect for custom tailoring with exceptional cultural drape.`;
  const priceMultiplier = parseFloat((mat.mult + (i % 5) * 0.02).toFixed(2));

  const stockIndex = i % 10;
  const stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" =
    stockIndex === 9
      ? "OUT_OF_STOCK"
      : stockIndex >= 7
        ? "LOW_STOCK"
        : "IN_STOCK";

  const stock =
    stockStatus === "OUT_OF_STOCK"
      ? 0
      : stockStatus === "LOW_STOCK"
        ? Math.floor(Math.random() * 5) + 1
        : Math.floor(Math.random() * 80) + 12;

  // Premium fabric representation links
  const unsplashImages = [
    "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=400",
    "https://images.unsplash.com/photo-1584184922226-f725f05a9603?auto=format&fit=crop&q=80&w=400",
    "https://images.unsplash.com/photo-1606744824163-985d376605aa?auto=format&fit=crop&q=80&w=400",
    "https://images.unsplash.com/photo-1518156677180-95a2893f3e9f?auto=format&fit=crop&q=80&w=400",
    "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=400",
  ];

  generatedFabrics.push({
    code,
    name,
    description,
    colorHex: color.hex,
    priceMultiplier,
    stockStatus,
    category: mat.cat,
    image: unsplashImages[i % unsplashImages.length],
    color: color.name,
    width: 45 + (i % 3) * 5 + " inches",
    price: Math.round(40 * priceMultiplier),
    stock,
  });
}

export const FABRICS = generatedFabrics;

export const DESIGN_OPTIONS = {
  collars: [
    {
      name: "Mandarin High Collar",
      description: "Standard 1.5-inch executive upright band",
    },
    {
      name: "Traditional Round Neck",
      description: "Clean seamless crew neck profile",
    },
    {
      name: "V-Neck Premium Front Slit",
      description: "Casual open collar with a brief drop",
    },
    {
      name: "High-Prestige Senator Collar",
      description: "Thick overlapping band with button highlights",
    },
  ],
  embroideries: [
    {
      name: "None (Pure Minimalist)",
      description: "Clean polished lines without stitching thread decoration",
    },
    {
      name: "Classic Chest Geometric Pattern",
      description: "Symmetrical vertical line detailing on the left chest",
    },
    {
      name: "Royal Full Bodice Ornate Stitching",
      description: "Intricate embroidery spread across the central torso",
    },
    {
      name: "Gilded Neckline Border Accent",
      description: "Warm bronze/gold thread highlights mapping the collar",
    },
  ],
  sleeves: [
    {
      name: "Short Sleeve (Executive)",
      description: "Perfect summer cut, hemmed 2 inches above the elbow",
    },
    {
      name: "Long Sleeve with Rounded Cuffs",
      description: "Formal design requiring cufflinks or button closures",
    },
    {
      name: "Three-Quarter Casual Fold",
      description: "Modern versatile style folding at the forearm",
    },
  ],
  pockets: [
    {
      name: "Hidden Side Slit Seam Pockets",
      description: "Practically invisible pockets on trousers/seams",
    },
    {
      name: "Single Slanted Left Chest Pocket",
      description: "Classic functional card/pen pocket",
    },
    {
      name: "Double Front Patch Utility Pockets",
      description: "Symmetrical bottom tunic utility pockets",
    },
    {
      name: "None (Clean Lines)",
      description: "No pockets for absolute uninterrupted fabric flow",
    },
  ],
  hemFinishes: [
    {
      name: "Traditional Split Side-Vents",
      description: "Allows easy stride and pockets access",
    },
    {
      name: "Executive Straight Edge Seams",
      description: "Clean uniform finish",
    },
    {
      name: "Curved Tailor Silhouette",
      description: "Slightly rounded front and back tabs",
    },
  ],
};

export const MOCK_HISTORICAL_ORDERS: HistoricalOrder[] = [
  {
    id: "ODH-2025-0943",
    date: "2025-12-14",
    styleName: "Grand Agbada Suite",
    garmentType: "Complete 3-Piece Set",
    fabricName: "Royal Emerald Cotton",
    fabricCode: "ODG-001",
    amount: 520.0,
    status: "Delivered",
    trackingId: "ODG-TRK-1024",
  },
  {
    id: "ODH-2025-0891",
    date: "2025-10-08",
    styleName: "Executive Kaftan",
    garmentType: "Shirt + Trouser Set",
    fabricName: "Classic Teal Monogram",
    fabricCode: "ODG-002",
    amount: 165.0,
    status: "Delivered",
    trackingId: "ODG-TRK-0985",
  },
];

export const MOCK_COMMUNITY_PHOTOS: CommunityPhoto[] = [
  // Sample from Group 1
  {
    id: "photo-g1-1",
    url: "https://images.unsplash.com/photo-1530268729831-4b0b9e170218?auto=format&fit=crop&q=80&w=600",
    caption:
      "Bespoke Emerald Royal Senator with intricate shoulder seam adjustments.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 1,
    status: "active",
  },
  {
    id: "photo-g1-2",
    url: "https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&q=80&w=600",
    caption: "Executive Kaftan in polished midnight blue cotton.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 2,
    status: "active",
  },
  {
    id: "photo-g1-3",
    url: "https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&q=80&w=600",
    caption: "Traditional two-piece suit with golden embroidery.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 3,
    status: "active",
  },
  {
    id: "photo-g1-4",
    url: "https://images.unsplash.com/photo-1588661131109-77c9cb6b6db3?auto=format&fit=crop&q=80&w=600",
    caption: "Handcrafted velvet tunic for special occasions.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 4,
    status: "active",
  },
  {
    id: "photo-g1-5",
    url: "https://images.unsplash.com/photo-1596455607563-ad6193f76b17?auto=format&fit=crop&q=80&w=600",
    caption: "Modern take on a classic Agbada silhouette.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 5,
    status: "active",
  },
  {
    id: "photo-g1-6",
    url: "https://images.unsplash.com/photo-1582845620857-e14b0b1bd79f?auto=format&fit=crop&q=80&w=600",
    caption: "Fitted senator suit perfect for business and events.",
    cohortName: "Group 1 - Pioneers",
    deliveryYear: 2025,
    featured: true,
    displayOrder: 6,
    status: "active",
  },

  // Sample from Group 2
  {
    id: "photo-g2-1",
    url: "https://images.unsplash.com/photo-1621184455862-c163dfb30e0f?auto=format&fit=crop&q=80&w=600",
    caption: "Stunning Classic Boubou in gold-embroidered satin silk drape.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 1,
    status: "active",
  },
  {
    id: "photo-g2-2",
    url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=600",
    caption: "Custom Tailor-Fitted Couture Gown with pleated shoulder flares.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 2,
    status: "active",
  },
  {
    id: "photo-g2-3",
    url: "https://images.unsplash.com/photo-1618331835717-801e976710b2?auto=format&fit=crop&q=80&w=600",
    caption: "Vibrant printed silk maxi dress for summer galas.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 3,
    status: "active",
  },
  {
    id: "photo-g2-4",
    url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=600",
    caption: "Elegant evening wear with lace overlay and beadwork.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 4,
    status: "active",
  },
  {
    id: "photo-g2-5",
    url: "https://images.unsplash.com/photo-1582536968038-04f7626998fc?auto=format&fit=crop&q=80&w=600",
    caption: "Asymmetrical hemline gown in rich sapphire blue.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 5,
    status: "active",
  },
  {
    id: "photo-g2-6",
    url: "https://images.unsplash.com/photo-1590086782792-42dd2350140d?auto=format&fit=crop&q=80&w=600",
    caption: "Regal structured bodice with a sweeping train.",
    cohortName: "Group 2 - Transformers",
    deliveryYear: 2026,
    featured: true,
    displayOrder: 6,
    status: "active",
  },
];
