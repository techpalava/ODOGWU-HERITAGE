import {
  filterDesignSelectionsForCustomDetails,
  getCustomDetailSelectionOptionIds,
  getCustomDetailSnapshots,
  getCustomDetailsBreakdown,
  getMissingCustomDetailGroup,
  hasSelectedCustomDetailOption,
  isAdditionalClothesCostSection,
  isClothingPriceSelectionGroup,
  isLiningEligibleForStyle,
  normalizeCustomDetailCatalog,
  groupCustomDetailGroupsByParentSection,
  getSelectableCustomDetailGroups,
  getSupportedCustomDetailGroups,
  getRequiredCustomDetailGroups,
  canClearCustomDetailSelectionGroup,
  clearCustomDetailSelectionGroup,
  getSelectedGarmentCode,
  isAmbiguousLowerGarment,
} from "../utils/catalogHelpers";
import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Scissors,
  Check,
  Shield,
  AlertTriangle,
  Award,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,

  RotateCcw,
  BookOpen,
  Info,
  X,
  ZoomIn,
  
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  StyleCategory,
  Fabric,
  Measurements,
  DesignSelections,
  CartItem,
  OrderContext,
  Customer,
  NamedMeasurementProfile,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  DecorativeFeature,
  DeliveryAddress,
  DeliveryMethod,
  DeliverySelection,
  GuestDesignDraft,
  MonogramPlacement,
} from "../types";

import { OFFICIAL_PRICE_LIST } from "../data/pricingData";
import { ApiService } from "../services/api";
import { useAppStore } from "../store/useAppStore";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import { CapacityService } from "../services/CapacityService";
import { OrderRoutingEngine, OrderRoutingDecision } from "../engine/OrderRoutingEngine";
import { CustomerJourneyEngine } from "../engine/CustomerJourneyEngine";
import { RoutingPresentationEngine } from "../engine/RoutingPresentationEngine";
import OrderRoutingPanel from "./OrderRoutingPanel";
import { getCurrentCommunityBatch } from "../utils/batchUtils";
import { SelectField } from "./ui/FormControls";
import VirtualTryOnIntegrationCard from "./VirtualTryOnIntegrationCard";
import { DESIGN_CATEGORIES_LIST } from "./DesignCategories";
import {
  BATCH_MINIMUM_GARMENTS,
  calculateBatchShipping,
  calculateFinalMileShipping,
  calculateIndividualShipping,
  FINAL_MILE_COUNTRY_OPTIONS,
  getGarmentPieceCount,
} from "../utils/shippingPricing";
import {
  clampDepositPercentage,
  getDepositRatio,
  PRICING_CURRENCY_SYMBOL,
  roundMoney,
} from "../utils/money";
import {
  DECORATIVE_FEATURE_DESCRIPTIONS,
  DEFAULT_MONOGRAM_PLACEMENT,
  filterDesignSelectionsForDecorativeFeatures,
  getApplicableDecorativeFeatures,
  getAvailableMonogramPlacements,
  getDecorativeFeaturePrice,
  getIncludedDecorativeFeatures,
  getMonogramPlacementLabel,
  hasHeavyEmbroideryMetadata,
  hasEmbroidery,
  hasMonogram,
  hasMonogramTrimming,
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
} from "../utils/decorativePricing";
import {
  ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION,
  CUSTOM_DETAIL_SELECTION_GROUP_PRESENTATION,
  DRESS_LINING_OPTION_ID,
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
} from "../config/GarmentDetailsConfig";
import {
  calculateDesignPricing,
  isBatchPricingRoute,
} from "../utils/designPricing";
import { GuestOrderSessionService } from "../services/guestOrderSessionService";
import type {
  PricedSelection,
  TraditionalAccessory,
} from "../utils/decorativePricing";
import { resolvePersonalizedBatchShippingContext } from "../utils/personalizedBatchContext";
import {
  getFabricPricingError,
  getNormalizedFabricName,
  resolveFabricPrice,
} from "../utils/fabricPricing";

// Cache for loaded image URLs to prevent skeleton flicker across renders
const loadedImageCache = new Set<string>();

const LazyFabricImage = ({ fabric }: { fabric: Fabric }) => {
  const [loaded, setLoaded] = useState(loadedImageCache.has(fabric.image || ""));
  
  if (!fabric.image) return null;

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-xl flex items-center justify-center">
          <ImageIcon className="text-gray-300" size={32} />
        </div>
      )}
      <img
        src={fabric.image}
        alt={fabric.name}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => {
          setLoaded(true);
          loadedImageCache.add(fabric.image!);
        }}
        className={`absolute inset-0 w-full h-full object-contain p-2 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
};

const FabricSkeleton = () => (
  <div className="p-4 rounded-2xl border-2 border-gray-150 bg-white flex flex-col justify-between space-y-4 animate-pulse">
    <div className="space-y-2">
      <div className="h-48 w-full rounded-xl bg-gray-100 border border-gray-150 flex items-center justify-center">
        <ImageIcon className="text-gray-200" size={48} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center mt-2">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
        <div className="h-3 bg-gray-200 rounded w-full mt-2"></div>
        <div className="h-3 bg-gray-200 rounded w-5/6"></div>
        <div className="h-3 bg-gray-200 rounded w-4/6"></div>
      </div>
    </div>
    <div className="border-t border-gray-100 pt-2 flex justify-between items-center mt-4">
      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
      <div className="flex items-center gap-1.5">
         <div className="h-6 bg-gray-200 rounded w-12"></div>
         <div className="h-6 bg-gray-200 rounded w-16"></div>
      </div>
    </div>
  </div>
);

interface DesignStudioViewProps {
  onAddToCart: (item: Omit<CartItem, "id">) => void;
  openCartDrawer: () => void;
  currentUser?: { email?: string; phone?: string; name: string } | null;
  orderContext?: OrderContext | null;
  styles?: StyleCategory[];
  fabrics?: Fabric[];
  customers?: Customer[];
  setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
  initialStyleId?: string | null;
  initialFabricCode?: string | null;
  clearInitialPreset?: () => void;
}

const GUIDE_STEPS = [
  {
    id: "neck",
    title: "Neck Measurement",
    icon: "👕",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 110 C 20 85, 35 75, 40 70 L 43 55 C 41 53, 38 48, 38 42 C 38 32, 43 25, 50 25 C 57 25, 62 32, 62 42 C 62 48, 59 53, 57 55 L 60 70 C 65 75, 80 85, 80 110"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M43 55 L 50 62 L 57 55"
          stroke="#1B4D3E"
          strokeWidth="1"
          strokeDasharray="2 2"
          strokeLinecap="round"
        />
        <path
          d="M38 52 C 43 58, 57 58, 62 52"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M38 52 C 43 46, 57 46, 62 52"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <circle cx="38" cy="52" r="3" fill={color} />
        <circle cx="62" cy="52" r="3" fill={color} />
      </svg>
    ),
    description:
      "Measure around the base of your neck where a standard collar shirt would rest.",
    instructions: [
      "Keep your head upright and look straight ahead. Do not tilt your head down.",
      "Place the tape measure around the lower part of the neck, just above your collarbone.",
      "Keep the tape comfortable but snug. Insert exactly one finger (the index finger) between the tape and your skin.",
      "Lagos Tailor Rule: Traditional high-collar Kaftans and Senators require this extra finger-width for ease of breathing and formal elegance.",
    ],
    tips: "Never pull the tape too tight. A tight neck measurement will make the collar of your Senator or Agbada uncomfortable to wear.",
  },
  {
    id: "shoulder",
    title: "Shoulder Width",
    icon: "📏",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 110 C 20 85, 32 75, 38 72 L 43 55 C 41 53, 38 48, 38 42 C 38 32, 43 25, 50 25 C 57 25, 62 32, 62 42 C 62 48, 59 53, 57 55 L 62 72 C 68 75, 80 85, 80 110"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M32 75 L 68 75"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M32 75 C 44 79, 56 79, 68 75"
          stroke={color}
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <path
          d="M36 71 L 32 75 L 36 79"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M64 71 L 68 75 L 64 79"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="32" cy="75" r="3" fill={color} />
        <circle cx="68" cy="75" r="3" fill={color} />
      </svg>
    ),
    description:
      "Measure across your upper back from the tip of one shoulder bone to the other.",
    instructions: [
      "Stand straight with your shoulders relaxed, not arched forward or pushed back.",
      "Find the prominent bone at the outer tip of your shoulder (where the shoulder joint connects to the arm).",
      "Run the tape straight across your upper back, over the base of your neck (the prominent vertebrae bone), to the bone on the opposite shoulder.",
      "Keep the tape flat and follow the natural curve of your upper shoulders.",
    ],
    tips: "Having a partner measure you is highly recommended for this step, as reaching behind your back can alter your posture and throw off the width.",
  },
  {
    id: "chest",
    title: "Chest / Bust Circumference",
    icon: "🥋",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 110 C 20 85, 32 75, 38 72 L 43 55 C 41 53, 38 48, 38 42 C 38 32, 43 25, 50 25 C 57 25, 62 32, 62 42 C 62 48, 59 53, 57 55 L 62 72 C 68 75, 80 85, 80 110"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M25 88 C 35 95, 65 95, 75 88"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M25 88 C 35 81, 65 81, 75 88"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <circle cx="25" cy="88" r="3" fill={color} />
        <circle cx="75" cy="88" r="3" fill={color} />
      </svg>
    ),
    description:
      "Measure around the fullest part of your chest or bust, keeping the tape level under your arms.",
    instructions: [
      "Stand naturally and breathe out comfortably. Do not puff out your chest or suck in your stomach.",
      "Raise your arms and wrap the tape around your back at shoulder-blade level.",
      "Bring the tape to the front, crossing over the fullest part of your chest or bust.",
      "Ensure the tape is completely horizontal and flat across your back.",
    ],
    tips: "Ensure the tape is snug but comfortable, allowing for regular respiratory expansion. For a Standard Fit, we recommend adding 1-2 inches of ease.",
  },
  {
    id: "sleeve",
    title: "Sleeve Length",
    icon: "🧣",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M50 25 C 43 25, 38 32, 38 42 L 43 55 L 32 75 M 50 25 C 57 25, 62 32, 62 42 L 57 55 L 68 72 L 72 88 L 74 98"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M68 72 L 72 88 L 74 98"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <circle cx="68" cy="72" r="3" fill={color} />
        <circle cx="74" cy="98" r="3" fill={color} />
      </svg>
    ),
    description:
      "Measure from the shoulder joint down the arm to the wrist bone.",
    instructions: [
      "Stand straight with your arm slightly bent at the elbow (as if resting your hand in your pocket).",
      "Place the tape measure at the outer edge of the shoulder (the same point where your shoulder width ended).",
      "Run the tape down the outer side of your arm, following the curve of the elbow, down to your wrist bone.",
      "For long-sleeved senator styles, measure to the base of the thumb where you want the cuff to naturally terminate.",
    ],
    tips: "For short-sleeved designs, measure from the shoulder down to your mid-bicep level (usually 8 to 10 inches), indicating where you want the sleeve hem to end.",
  },
  {
    id: "waist",
    title: "Waist & Hips",
    icon: "🎗️",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M20 120 C 22 95, 35 90, 38 85 L 43 55 C 41 53, 38 48, 38 42 C 38 32, 43 25, 50 25 C 57 25, 62 32, 62 42 C 62 48, 59 53, 57 55 L 62 85 C 65 90, 78 95, 80 120"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M35 88 C 42 93, 58 93, 65 88"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M35 88 C 42 83, 58 83, 65 88"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <circle cx="35" cy="88" r="3" fill={color} />
        <circle cx="65" cy="88" r="3" fill={color} />
      </svg>
    ),
    description:
      "Measure around your natural waistline (near the belly button) and your hips.",
    instructions: [
      "Natural Waist: Wrap the tape measure around your waist just above your hip bones, near the navel.",
      "Trouser Waist: Measure exactly where you prefer to wear the waistband of your trousers.",
      "Hips: Wrap the tape around the fullest part of your hips and buttocks, keeping the tape level all around.",
      "Do not suck in your stomach; breathe naturally for a comfortable drape.",
    ],
    tips: "Senator and Kaftan trousers do not typically use belts, so a precise trouser waist measurement is crucial to ensure they sit comfortably without sliding.",
  },
  {
    id: "length",
    title: "Trouser / Silhouette Length",
    icon: "👖",
    illustration: (color: string) => (
      <svg
        className="w-full h-full max-h-48 sm:max-h-56 mx-auto"
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M35 40 L 35 110 M 65 40 L 65 110"
          stroke="#1B4D3E"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M31 40 L 31 110"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M28 44 L 31 40 L 34 44"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M28 106 L 31 110 L 34 106"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="31" cy="40" r="3" fill={color} />
        <circle cx="31" cy="110" r="3" fill={color} />
      </svg>
    ),
    description: "Measure from the waistline down to the ankle bone or floor.",
    instructions: [
      "Stand straight with your feet shoulder-width apart. Avoid looking down, as bending forward shortens the length.",
      "Waist-to-Ankle (Standard Senator pant): Place tape at your trouser waist, run it straight down the side of your leg to your ankle bone.",
      "Waist-to-Floor (Full length Agbada or Gown): Measure all the way to the floor, wearing the shoes you plan to wear.",
      "Shirt/Kaftan Length: Measure from the base of the back neck down to the thigh (Standard Kaftan) or below the knee (Long Kaftan).",
    ],
    tips: "Ensure you are barefoot or wearing flat-soled socks while taking this measurement, and let the tailor know if you plan to wear high heels or heavy-soled sandals.",
  },
];

export const getGarmentCompositionFromCode = (
  code: string,
  defaultComp?: string,
): string => {
  if (!code || code === "EXACT") return defaultComp || "2-Piece Set";
  if (code === "G1" || code === "G2") return "Shirt Only";
  if (code === "G3") return "Shorts Only";
  if (code === "G4") return "Trouser Only";
  if (code.startsWith("G5") || code.startsWith("G6")) return "2-Piece Set";
  if (code === "L1" || code === "L2" || code === "L3" || code === "L4")
    return "Dress Only";
  if (code === "L6" || code === "L7") return "Trouser Only";
  if (code.startsWith("L8") || code.startsWith("L9")) return "2-Piece Set";
  if (code.startsWith("L10")) return "3-Piece Set";
  return defaultComp || "2-Piece Set";
};

export const getGarmentDetailsBreakdown = (
  details: DesignSelections,
  catalog: CustomDetailOption[] = [],
): {
  label: string;
  value: string;
  price: number;
  originalId?: string;
  selectionGroup: CustomDetailSelectionGroup;
  garmentGroup: any;
  informational: boolean;
  requiresEvaluation: boolean;
}[] => getCustomDetailsBreakdown(details, catalog) as any;


const GarmentDetailSelector = ({
  selectedStyle,
  selectedGarment,
  designSelections,
  setDesignSelections,
  hasLining,
  setHasLining,
  currencySymbol,
  invalidGroups = [],
  setInvalidGroups,
}: any) => {
  const customDetailCatalog = useAppStore((state: any) => state.customDetailCatalog);
  const customDetails = designSelections.customDetails || {};
  const effectiveCatalog = normalizeCustomDetailCatalog(customDetailCatalog);
  const garmentCode = getSelectedGarmentCode(selectedGarment || {});
  const isAmbiguous = isAmbiguousLowerGarment(garmentCode);
  const selectableGroups = getSelectableCustomDetailGroups(effectiveCatalog);
  const standardGroups = selectableGroups.filter(
    (group) => !isAdditionalClothesCostSection(group.id),
  );
  const parentSections = groupCustomDetailGroupsByParentSection(standardGroups);
  const supportedGroups = getSupportedCustomDetailGroups(selectedStyle, selectedGarment);

  const isParentSectionIncluded = (sectionId: string): boolean => {
    if (sectionId === "skirts") {
      return supportedGroups.includes("skirt");
    }
    return supportedGroups.includes(sectionId as any);
  };

  const getOptionalHeaderHelperText = (sectionId: string): string => {
    switch (sectionId) {
      case "shirt": return "Shirt";
      case "dress": return "Dress";
      case "standard_shorts": return "Shorts";
      case "bum_shorts": return "Bum Shorts";
      case "trousers": return "Trouser";
      case "skirts": return "Skirt";
      default: return "garment";
    }
  };

  const additionalGroups = selectableGroups.filter((group) =>
    isAdditionalClothesCostSection(group.id),
  );
  const applicableDecorativeFeatures = getApplicableDecorativeFeatures(
    selectedStyle,
    selectedGarment,
  );
  const includedDecorativeFeatures = getIncludedDecorativeFeatures(
    selectedStyle,
  ).filter((feature) => applicableDecorativeFeatures.includes(feature));
  const selectedDecorativeFeatures =
    designSelections.decorativeFeatures || [];
  const selectedAccessories = designSelections.accessories || [];
  const nameMonogramSelected =
    includedDecorativeFeatures.includes("Name Monogram") ||
    selectedDecorativeFeatures.includes("Name Monogram");
  const monogramPlacementOptions = getAvailableMonogramPlacements(
    designSelections,
    selectedStyle,
    selectedGarment,
  );

  const handleSelect = (
    groupId: CustomDetailSelectionGroup,
    option: CustomDetailOption,
    checked: boolean,
  ) => {
    if (option.informational) return;
    if (option.id === DRESS_LINING_OPTION_ID) {
      setHasLining(checked);
    }
    if (setInvalidGroups && invalidGroups.includes(groupId)) {
      setInvalidGroups((prev: string[]) => prev.filter((id) => id !== groupId));
    }

    setDesignSelections((previous: DesignSelections) => {
      const nextCustomDetails = {
        ...(previous.customDetails || {}),
      };

      if (!option.allowMultiple) {
        nextCustomDetails[groupId] = option.id;
      } else {
        const selectedIds = new Set(
          getCustomDetailSelectionOptionIds(nextCustomDetails[groupId]),
        );
        if (checked) selectedIds.add(option.id);
        else selectedIds.delete(option.id);

        const groupOptions =
          selectableGroups.find((group) => group.id === groupId)?.options || [];
        const orderedIds = groupOptions
          .map((candidate) => candidate.id)
          .filter((optionId) => selectedIds.has(optionId));
        if (orderedIds.length > 0) nextCustomDetails[groupId] = orderedIds;
        else delete nextCustomDetails[groupId];
      }

      return filterDesignSelectionsForDecorativeFeatures({
        ...previous,
        customDetails: nextCustomDetails,
        ...(option.id === DRESS_LINING_OPTION_ID ? { hasLining: checked } : {}),
      }, selectedStyle, selectedGarment);
    });
  };

  const handleClearGroup = (groupId: CustomDetailSelectionGroup) => {
    const groupOptions = selectableGroups.find((g) => g.id === groupId)?.options || [];
    const containsLining = groupOptions.some((opt) => opt.id === DRESS_LINING_OPTION_ID);

    if (containsLining) {
      setHasLining(false);
    }

    setDesignSelections((previous: DesignSelections) => {
      const nextSelections = clearCustomDetailSelectionGroup(
        previous,
        groupId,
        selectedStyle,
        customDetailCatalog,
        selectedGarment,
      );
      return filterDesignSelectionsForDecorativeFeatures(nextSelections, selectedStyle, selectedGarment);
    });
  };

  const handleDecorativeFeatureToggle = (
    feature: DecorativeFeature,
    checked: boolean,
  ) => {
    if (includedDecorativeFeatures.includes(feature)) return;

    setDesignSelections((prev: DesignSelections) => {
      const nextFeatures = new Set(prev.decorativeFeatures || []);
      if (checked) nextFeatures.add(feature);
      else nextFeatures.delete(feature);

      return filterDesignSelectionsForDecorativeFeatures({
        ...prev,
        decorativeFeatures: sortDecorativeFeatures([...nextFeatures]),
        hasMonogram:
          feature === "Name Monogram" ? checked : prev.hasMonogram,
        monogramPlacement:
          feature === "Name Monogram" && checked
            ? prev.monogramPlacement || DEFAULT_MONOGRAM_PLACEMENT
            : prev.monogramPlacement,
      }, selectedStyle, selectedGarment);
    });
  };

  const handleMonogramPlacementChange = (placement: MonogramPlacement) => {
    setDesignSelections((previous: DesignSelections) =>
      filterDesignSelectionsForDecorativeFeatures(
        { ...previous, monogramPlacement: placement },
        selectedStyle,
        selectedGarment,
      ),
    );
  };

  const handleAccessoryToggle = (
    accessory: TraditionalAccessory,
    checked: boolean,
  ) => {
    setDesignSelections((prev: DesignSelections) => {
      const nextAccessories = new Set(prev.accessories || []);
      if (checked) nextAccessories.add(accessory);
      else nextAccessories.delete(accessory);

      return {
        ...prev,
        accessories: sortTraditionalAccessories([...nextAccessories]),
      };
    });
  };

  const demo = selectedStyle?.targetDemographic || selectedStyle?.gender || "unisex";
  const explicitBoth =
    selectedStyle?.customDetailConfig?.featuresMaleAndFemale ||
    selectedStyle?.featuresMaleAndFemale ||
    demo === "family" ||
    demo === "couple";

  const renderGroup = (
    groupId: CustomDetailSelectionGroup,
    options: CustomDetailOption[],
    suppressHeading: boolean = false,
  ) => {
    const presentation = isAdditionalClothesCostSection(groupId)
      ? ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION[groupId]
      : CUSTOM_DETAIL_SELECTION_GROUP_PRESENTATION[groupId];

    const enrichedGarment = selectedGarment
      ? { ...selectedGarment, lowerGarmentType: designSelections.lowerGarmentType }
      : { lowerGarmentType: designSelections.lowerGarmentType };

    const requiredGroups = getRequiredCustomDetailGroups(
      selectedStyle,
      normalizeCustomDetailCatalog(customDetailCatalog),
      enrichedGarment,
    );
    const isRequired = requiredGroups.includes(groupId);

    const allowsMultiple = options.some((opt) => opt.allowMultiple);
    const showClearButton = allowsMultiple && canClearCustomDetailSelectionGroup(
      designSelections,
      groupId,
      selectedStyle,
      customDetailCatalog,
      enrichedGarment,
    );

    const clearButtonLabel = allowsMultiple ? "Clear all" : "Clear selection";
    const ariaLabel = allowsMultiple
      ? `Clear all ${presentation.title} selections`
      : `Clear ${presentation.title} selection`;

    const clearButton = showClearButton && (
      <button
        type="button"
        onClick={() => handleClearGroup(groupId)}
        aria-label={ariaLabel}
        className="text-[10px] font-medium text-gray-400 hover:text-heritage-gold focus:outline-none focus:underline transition-colors cursor-pointer select-none"
      >
        {clearButtonLabel}
      </button>
    );

    const hasSelectedOption = getCustomDetailSelectionOptionIds(customDetails[groupId]).length > 0;
    const isNoneSelected = !hasSelectedOption;
    const noneOptionElement = !isRequired && !allowsMultiple && (
      <label
        key={`${groupId}-none`}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
          isNoneSelected
            ? "border-heritage-gold/40 bg-heritage-cream/10"
            : "border-gray-150 bg-white hover:border-heritage-gold/30 hover:bg-heritage-cream/5"
        }`}
      >
        <input
          type="radio"
          name={groupId}
          checked={isNoneSelected}
          onChange={() => handleClearGroup(groupId)}
          className="mt-1 h-4 w-4 border-gray-300 text-heritage-green focus:ring-heritage-green"
        />
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <span className="block text-xs font-bold text-heritage-green">
              None
            </span>
          </div>
          <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
            No selection for this category
          </span>
        </div>
      </label>
    );

    const isInvalid = invalidGroups.includes(groupId);

    return (
      <div
        id={`custom-detail-group-${groupId}`}
        tabIndex={-1}
        className={`space-y-2 mb-4 col-span-1 focus:outline-none p-3.5 rounded-2xl transition-all duration-300 ${
          isInvalid
            ? "border-2 border-red-300 bg-red-50/20 shadow-sm shadow-red-100"
            : "border-2 border-transparent"
        }`}
        key={groupId}
      >
        {!suppressHeading ? (
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                {presentation.title}
              </label>
              <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                isRequired
                  ? "bg-red-50 text-red-600 border border-red-150"
                  : "bg-gray-50 text-gray-500 border border-gray-200"
              }`}>
                {isRequired ? "Required" : "Optional"}
              </span>
            </div>
            {clearButton}
          </div>
        ) : (
          showClearButton && (
            <div className="flex justify-end mb-1">
              {clearButton}
            </div>
          )
        )}
        {!suppressHeading && presentation.description && (
          <p className="text-[10px] leading-tight text-heritage-ink/60">
            {presentation.description}
          </p>
        )}
        <div className="space-y-2">
          {noneOptionElement}
          {options.map((opt) => {
            const isSelected =
              getCustomDetailSelectionOptionIds(customDetails[groupId]).includes(
                opt.id,
              ) ||
              (opt.id === DRESS_LINING_OPTION_ID && hasLining);
            const priceLabel = opt.requiresEvaluation
              ? "Requires evaluation"
              : opt.priceCents > 0
                ? `+${currencySymbol}${(opt.priceCents / 100).toFixed(2)}`
                : opt.informational
                  ? "No additional charge"
                  : "Included";

            if (opt.informational) {
              return (
                <div
                  key={opt.id}
                  className="flex items-start gap-3 rounded-xl border border-gray-150 bg-heritage-cream/20 p-3"
                >
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-heritage-gold"
                    size={16}
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="block text-xs font-bold text-heritage-green">
                        {opt.label}
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-heritage-green/70">
                        {priceLabel}
                      </span>
                    </div>
                    <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                      {opt.description}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <label
                key={opt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                  isSelected
                    ? "border-heritage-green bg-heritage-green/10"
                    : "border-gray-150 bg-white hover:border-heritage-green/30 hover:bg-heritage-green/[0.03]"
                }`}
              >
                <input
                  type={opt.allowMultiple ? "checkbox" : "radio"}
                  name={groupId}
                  checked={isSelected}
                  onChange={(event) =>
                    handleSelect(groupId, opt, event.target.checked)
                  }
                  className="mt-1 h-4 w-4 border-gray-300 text-heritage-green focus:ring-heritage-green"
                />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="block text-xs font-bold text-heritage-green">
                    {opt.label}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-heritage-gold">
                    {priceLabel}
                  </span>
                </div>
                <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                  {opt.description}
                </span>
              </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const lowerGarmentType = designSelections.lowerGarmentType;

  return (
    <>
      {explicitBoth && standardGroups.length > 0 && (
        <div className="col-span-1 md:col-span-2 rounded-xl border border-heritage-gold/20 bg-heritage-cream/20 px-4 py-3 text-[11px] text-heritage-ink/70">
          This design includes male and female garments. Complete every
          applicable garment section below.
        </div>
      )}
      {isAmbiguous && (
        <div
          id="custom-detail-group-lowerGarmentType"
          tabIndex={-1}
          className={`col-span-1 md:col-span-2 space-y-2 mb-6 border-b pb-6 focus:outline-none p-3.5 rounded-2xl transition-all duration-300 ${
            invalidGroups.includes("lowerGarmentType")
              ? "border-2 border-red-300 bg-red-50/20 shadow-sm shadow-red-100"
              : "border-2 border-transparent"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <label className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                Garment Type
              </label>
              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider bg-red-50 text-red-600 border border-red-150">
                Required
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                lowerGarmentType === "trousers"
                  ? "border-heritage-green bg-heritage-green/10"
                  : "border-gray-150 bg-white hover:border-heritage-green/30 hover:bg-heritage-green/[0.03]"
              }`}
            >
              <input
                type="radio"
                name="lowerGarmentType"
                checked={lowerGarmentType === "trousers"}
                onChange={() => {
                  if (setInvalidGroups) {
                    setInvalidGroups((prev: string[]) => prev.filter((id) => id !== "lowerGarmentType"));
                  }
                  setDesignSelections((prev: DesignSelections) => ({
                    ...prev,
                    lowerGarmentType: "trousers",
                  }));
                }}
                className="mt-1 h-4 w-4 border-gray-300 text-heritage-green focus:ring-heritage-green"
              />
              <div className="flex-1">
                <span className="block text-xs font-bold text-heritage-green">
                  Leg Pant / Trouser
                </span>
                <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                  Design custom trousers with fastening and pocket options.
                </span>
              </div>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                lowerGarmentType === "skirt"
                  ? "border-heritage-green bg-heritage-green/10"
                  : "border-gray-150 bg-white hover:border-heritage-green/30 hover:bg-heritage-green/[0.03]"
              }`}
            >
              <input
                type="radio"
                name="lowerGarmentType"
                checked={lowerGarmentType === "skirt"}
                onChange={() => {
                  if (setInvalidGroups) {
                    setInvalidGroups((prev: string[]) => prev.filter((id) => id !== "lowerGarmentType"));
                  }
                  setDesignSelections((prev: DesignSelections) => ({
                    ...prev,
                    lowerGarmentType: "skirt",
                  }));
                }}
                className="mt-1 h-4 w-4 border-gray-300 text-heritage-green focus:ring-heritage-green"
              />
              <div className="flex-1">
                <span className="block text-xs font-bold text-heritage-green">
                  Skirt
                </span>
                <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                  Design custom skirt length and pocket options.
                </span>
              </div>
            </label>
          </div>
        </div>
      )}
      {parentSections.map((section) => {
        const isIncluded = isParentSectionIncluded(section.id);
        const helperGarmentName = getOptionalHeaderHelperText(section.id);

        return (
          <fieldset key={section.id} className="col-span-1 md:col-span-2 space-y-4 border-t border-gray-100 pt-4 mt-2 first:border-t-0 first:pt-0 first:mt-0">
            <legend className="block w-full border-b border-heritage-gold/30 pb-1.5 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-heritage-green uppercase tracking-widest text-xs">
                    {section.title}
                  </span>
                  {isIncluded ? (
                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-heritage-green/10 text-heritage-green border border-heritage-green/20 uppercase tracking-wider">
                      Included
                    </span>
                  ) : (
                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 uppercase tracking-wider">
                      Optional customization
                    </span>
                  )}
                </div>
                {isIncluded ? (
                  <span className="text-[9px] font-medium text-heritage-green/70">
                    Included in your outfit
                  </span>
                ) : (
                  <span className="text-[9px] font-medium text-heritage-ink/50">
                    Not part of your selected outfit. Selecting details here does not add a {helperGarmentName} to your order.
                  </span>
                )}
              </div>
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {section.groups.map((group) =>
                renderGroup(group.id, group.options, group.id === "neck_design"),
              )}
            </div>
          </fieldset>
        );
      })}

      {standardGroups.length === 0 && (
        <div className="col-span-1 md:col-span-2 rounded-xl border border-heritage-gold/25 bg-heritage-cream/20 px-4 py-4">
          <p className="text-xs font-bold text-heritage-green">
            No construction choices are required for this design.
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-heritage-ink/65">
            You can still add decorative details or traditional accessories
            below.
          </p>
        </div>
      )}

      {additionalGroups.length > 0 && (
        <fieldset className="col-span-1 space-y-3 md:col-span-2">
          <legend className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
            Additional Clothes Costs
          </legend>
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            {additionalGroups.map((group) =>
              renderGroup(group.id, group.options),
            )}
          </div>
        </fieldset>
      )}

      <fieldset className="col-span-1 space-y-2 md:col-span-2">
        <legend className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
          Monogram and Embroidery Design
        </legend>
        <p className="text-[10px] text-heritage-ink/60">Optional</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {applicableDecorativeFeatures.map((feature) => {
            const includedByStyle =
              includedDecorativeFeatures.includes(feature);
            const checked =
              includedByStyle ||
              selectedDecorativeFeatures.includes(feature);
            const featurePrice = getDecorativeFeaturePrice(
              selectedStyle,
              feature,
            );

            return (
              <label
                key={feature}
                className={`flex min-h-[76px] items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                  checked
                    ? "border-heritage-green bg-heritage-green/10"
                    : "border-gray-150 bg-white hover:border-heritage-green/30 hover:bg-heritage-green/[0.03]"
                } ${includedByStyle ? "cursor-default" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={includedByStyle}
                  onChange={(event) =>
                    handleDecorativeFeatureToggle(
                      feature,
                      event.target.checked,
                    )
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-heritage-green">
                      {feature}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-heritage-gold">
                      +{currencySymbol}{featurePrice.toFixed(2)}
                    </span>
                  </span>
                  <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                    {DECORATIVE_FEATURE_DESCRIPTIONS[feature]}
                  </span>
                  {includedByStyle && (
                    <span className="mt-1 block text-[10px] font-semibold leading-tight text-heritage-green/70">
                      Required by the selected design and added automatically.
                    </span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {nameMonogramSelected && (
          <div className="rounded-xl border border-heritage-gold/25 bg-heritage-cream/20 p-3">
            <label
              htmlFor="monogram-placement"
              className="block text-[10px] font-bold uppercase tracking-wider text-heritage-green"
            >
              Monogram Placement
            </label>
            <select
              id="monogram-placement"
              value={
                designSelections.monogramPlacement ||
                DEFAULT_MONOGRAM_PLACEMENT
              }
              onChange={(event) =>
                handleMonogramPlacementChange(
                  event.target.value as MonogramPlacement,
                )
              }
              className="mt-2 min-h-[44px] w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-heritage-green focus:border-heritage-gold focus:outline-none focus:ring-2 focus:ring-heritage-gold/20"
            >
              {monogramPlacementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[10px] leading-relaxed text-heritage-ink/60">
              Left Chest is the recommended default placement. Placement does
              not add another charge.
            </p>
            {hasHeavyEmbroideryMetadata(selectedStyle) && (
              <p className="mt-2 rounded-lg border border-heritage-gold/20 bg-white/70 px-3 py-2 text-[10px] font-semibold leading-relaxed text-heritage-green/80">
                Cuff or Hem placement may provide better visibility for your
                monogram on this embroidered design.
              </p>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="col-span-1 space-y-2 md:col-span-2">
        <legend className="block font-bold text-heritage-green uppercase tracking-wider text-[10px]">
          Select Accessories (Optional)
        </legend>
        <p className="text-[10px] text-heritage-ink/60">Optional</p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {TRADITIONAL_ACCESSORY_OPTIONS.map((accessory) => {
            const checked = selectedAccessories.includes(accessory);

            return (
              <label
                key={accessory}
                className={`flex min-h-[62px] cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                  checked
                    ? "border-heritage-green bg-heritage-green/10"
                    : "border-gray-150 bg-white hover:border-heritage-green/30 hover:bg-heritage-green/[0.03]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    handleAccessoryToggle(accessory, event.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-heritage-green focus:ring-heritage-green"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-heritage-green">
                      {accessory}
                    </span>
                    <span className="shrink-0 text-xs font-bold text-heritage-gold">
                      +{currencySymbol}12.00
                    </span>
                  </span>
                  <span className="mt-1 block text-[10px] leading-tight text-heritage-ink/60">
                    {TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

    </>
  );
};

const GarmentDetailSummaryItems = ({
  designSelections,
  isLi = false,
  currencySymbol,
  catalog = [],
  decorativeFeatures = [],
  accessories = [],
  excludeClothingPriceSelections = false,
  style = null,
  garment = null,
  mode = "all",
}: {
  designSelections: DesignSelections;
  isLi?: boolean;
  currencySymbol: string;
  catalog?: CustomDetailOption[];
  decorativeFeatures?: PricedSelection[];
  accessories?: PricedSelection[];
  excludeClothingPriceSelections?: boolean;
  style?: StyleCategory | null;
  garment?: any;
  mode?: "priced" | "non-priced" | "all";
}) => {
  const supportedGarmentGroups = style
    ? getSupportedCustomDetailGroups(style, garment)
    : [];
  const rawItems = getGarmentDetailsBreakdown(designSelections, catalog)
    .filter(
      (item) =>
        !excludeClothingPriceSelections ||
        !isClothingPriceSelectionGroup(item.selectionGroup) ||
        !supportedGarmentGroups.includes(item.garmentGroup),
    );
  const items = rawItems
    .filter((item) => {
      if (mode === "priced") {
        return item.price > 0;
      }
      if (mode === "non-priced") {
        return item.price === 0;
      }
      return true;
    })
    .map(item => {
      const display = item.requiresEvaluation
        ? "Requires evaluation"
        : item.price === 0
          ? item.informational
            ? "No additional charge"
            : "Included"
          : `+${currencySymbol}${item.price.toFixed(2)}`;
      if (mode === "non-priced") {
        return {
          ...item,
          label: CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[item.selectionGroup] || item.label,
          value: item.label + (item.requiresEvaluation ? " - Requires evaluation" : ""),
          display,
        };
      }
      return { ...item, display };
    });
  const pricedItems = [
    ...decorativeFeatures
      .filter((feature) => {
        if (mode === "priced") {
          return feature.price > 0;
        }
        if (mode === "non-priced") {
          return feature.price === 0;
        }
        return true;
      })
      .map((feature) => ({
        label: feature.includedByStyle
          ? "Design Feature"
          : "Decorative Detail",
        value: feature.label,
        display: `+${currencySymbol}${feature.price.toFixed(2)}`,
        price: feature.price,
      })),
    ...((mode === "non-priced" || mode === "all")
      ? (() => {
          const hasMonogramSelected = decorativeFeatures.some(
            (f) => f.label === "Name Monogram"
          );
          const placement = hasMonogramSelected
            ? getMonogramPlacementLabel(designSelections.monogramPlacement)
            : null;
          return placement
            ? [
                {
                  label: "Monogram Placement",
                  value: placement,
                  display: "No additional charge",
                  price: 0,
                },
              ]
            : [];
        })()
      : []),
    ...accessories
      .filter((accessory) => {
        if (mode === "priced") {
          return accessory.price > 0;
        }
        if (mode === "non-priced") {
          return accessory.price === 0;
        }
        return true;
      })
      .map((accessory) => ({
        label: "Traditional Accessory",
        value: accessory.label,
        display: `+${currencySymbol}${accessory.price.toFixed(2)}`,
        price: accessory.price,
      })),
  ];
  const allItems = [...items, ...pricedItems];
  const showDisplay = mode !== "non-priced";

  return (
    <>
      {allItems.map((item: any, i: number) =>
        isLi ? (
          <li key={`${item.label}-${item.value}-${i}`}>
            {item.label}{item.value ? ': ' : ' '}<strong>{item.value}</strong>{showDisplay && <span className="text-heritage-gold ml-1"> ({item.display})</span>}
          </li>
        ) : (
          <p key={`${item.label}-${item.value}-${i}`}>
            {item.label}{item.value ? ': ' : ' '}<strong className="text-heritage-green">{item.value}</strong>{showDisplay && <span className="text-heritage-gold ml-1"> ({item.display})</span>}
          </p>
        )
      )}
    </>
  );
};

export default function DesignStudioView({
  onAddToCart,
  openCartDrawer,
  currentUser,
  orderContext,
  styles = [],
  fabrics = [],
  customers = [],
  setCustomers,
  initialStyleId,
  initialFabricCode,
  clearInitialPreset,
}: DesignStudioViewProps) {
  // Current step state (1 to 9)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [invalidGroups, setInvalidGroups] = useState<string[]>([]);
  const [guestDraftHydrated, setGuestDraftHydrated] =
    useState<boolean>(false);
  const businessSettings = useAppStore((state) => state.businessSettings);
  const isLoadingData = useAppStore((state) => state.isLoadingData);
  const storeBatches = useAppStore((state) => state.batches);
  const storeUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const setNotification = useAppStore((state) => state.setNotification);
  const customDetailCatalog = useAppStore((state: any) => state.customDetailCatalog);
  const cartItems = useAppStore((state) => state.cartItems);
  const historicalOrders = useAppStore((state) => state.historicalOrders);
  const activeOrders = useAppStore((state) => state.orders);

  const journey = CustomerJourneyEngine.getCurrentJourney({
    currentUser: storeUser as any,
    drafts: cartItems,
    activeOrders,
    historicalOrders,
    allBatches: storeBatches,
    stepperContext: { currentStep, totalSteps: 9 }
  });


  // GDPR Biometric Consent State
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [consentActionSource, setConsentActionSource] = useState<
    "virtual_try_on" | "ai_sizing" | null
  >(null);
  const [localBiometricConsent, setLocalBiometricConsent] = useState<
    "accepted" | "declined" | null
  >(() => {
    return (sessionStorage.getItem("odogwu_biometric_consent") as any) || null;
  });

  const [routingDecision, setRoutingDecision] = useState<OrderRoutingDecision | null>(null);
  const [showRoutingPanel, setShowRoutingPanel] = useState<boolean>(false);
  const routingPresentation = routingDecision ? RoutingPresentationEngine.buildPresentation(routingDecision) : null;

  const computedActiveBatch = getCurrentCommunityBatch(storeBatches || []);
  const defaultCtx: OrderContext = computedActiveBatch
    ? {
        orderType: "Community",
        batchId: computedActiveBatch.id,
        batchName: computedActiveBatch.name,
        closingDate: computedActiveBatch.endDate,
        deliveryWindow: computedActiveBatch.estimatedDelivery || "",
        pickupLocation:
          computedActiveBatch.pickupLocation || businessSettings.productionSettings.defaultPickupLocation,
        currentMembers: CapacityService.getReservedCapacity(computedActiveBatch),
        expectedParticipants: CapacityService.getTargetCapacity(computedActiveBatch),
        allowOrders: computedActiveBatch.allowOrders,
        batchStatus: computedActiveBatch.status,
      }
    : {
        orderType: "Community",
        batchName: "No Active Batch",
        closingDate: "TBD",
        deliveryWindow: "TBD",
        pickupLocation: businessSettings.productionSettings.defaultPickupLocation,
        currentMembers: 0,
        expectedParticipants: 0,
        allowOrders: false,
        batchStatus: "CLOSED",
      };

  const ctx = orderContext || defaultCtx;

  // Automatically adapt batchType based on the custom orderContext passed down
  useEffect(() => {
    if (orderContext) {
      if (orderContext.orderType === "Individual") {
        setBatchType("alone");
      } else if (orderContext.orderType === "Group Organizer") {
        setBatchType("personalized");
        setCustomGroupCode(
          orderContext.batchId || orderContext.batchName || "",
        );
      } else if (orderContext.orderType === "Group Member") {
        setBatchType("personalized");
        setCustomGroupCode(
          orderContext.batchId || orderContext.batchName || "",
        );
      } else {
        const eligibility = BatchBusinessRules.canAcceptOrders(orderContext);
        if (!eligibility.canAcceptOrders) {
          setNotification({
            message:
              "This batch is no longer accepting orders. Your order has been switched to individual pricing.",
            type: "info",
          });
          window.setTimeout(() => setNotification(null), 4000);
          // NOTE: The batch closed, so the user is rerouted to individual pricing.
          // Keep the notification above synchronized with this pricing change.
          setBatchType("alone");
        } else {
          setBatchType("community");
        }
      }
    }
    

  }, [orderContext, setNotification, storeBatches]);

  // STEP 1: Style Selection, Filtering & Pagination States
  const [selectedStyle, setSelectedStyle] = useState<StyleCategory | null>(null);
  const [styleSearchInput, setStyleSearchInput] = useState<string>("");
  const [styleSearch, setStyleSearch] = useState<string>("");
  const [designCategoryFilter, setDesignCategoryFilter] = useState<string>("All Designs");
  const [stylePage, setStylePage] = useState<number>(1);

  // Sync selectedStyle if styles prop changes and current selectedStyle is not in styles
  useEffect(() => {
    if (selectedStyle && styles.length > 0 && !styles.some((s) => s.id === selectedStyle.id)) {
      setSelectedStyle(null);
    }
  }, [styles, selectedStyle]);

  // Debounce Style Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setStyleSearch(styleSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [styleSearchInput]);

  // Reset page to 1 when filters change to avoid empty pages
  useEffect(() => {
    setStylePage(1);
  }, [styleSearch, designCategoryFilter]);

  // Compute filtered styles
  const filteredStyles = styles.filter((style) => {
    // 1. Search Query
    const matchesSearch =
      style.name.toLowerCase().includes(styleSearch.toLowerCase()) ||
      style.description.toLowerCase().includes(styleSearch.toLowerCase());

    // 2. Design Category Filtering
    let matchesCategory = true;
    const txt = (style.name + " " + style.description + " " + (style.options || []).join(" ")).toLowerCase();
    
    if (designCategoryFilter === "Male Designs (Adults & Kids)") {
      matchesCategory = style.gender === "male" || style.gender === "unisex" || style.gender === "family" || style.gender === "couple";
    } else if (designCategoryFilter === "Female Designs (Adults & Kids)") {
      matchesCategory = style.gender === "female" || style.gender === "unisex" || style.gender === "family" || style.gender === "couple";
    } else if (designCategoryFilter === "Family-Look Designs") {
      matchesCategory = style.gender === "family" || style.gender === "couple" || style.gender === "unisex" || txt.includes("family") || txt.includes("couple") || txt.includes("matching");
    } else if (designCategoryFilter === "Embroidered & Monogram Trim Designs") {
      matchesCategory = txt.includes("embroid") || txt.includes("monogram") || txt.includes("trim") || txt.includes("stitch") || txt.includes("accent") || txt.includes("thread") || txt.includes("lace");
    } else if (designCategoryFilter === "Designs with Lining / Inner Nets (Ladies)") {
      const isFemale = style.gender === "female" || style.gender === "unisex";
      matchesCategory = isFemale && (txt.includes("lining") || txt.includes("net") || txt.includes("gown") || txt.includes("dress") || txt.includes("boubou") || txt.includes("couture") || txt.includes("bodice") || (style.outfitType?.toLowerCase().includes("gown") || style.outfitType?.toLowerCase().includes("dress") || style.outfitType?.toLowerCase().includes("boubou")));
    }

    return matchesSearch && matchesCategory;
  });

  const stylesPerPage = 6;
  const totalPages = Math.ceil(filteredStyles.length / stylesPerPage) || 1;
  const paginatedStyles = filteredStyles.slice(
    (stylePage - 1) * stylesPerPage,
    stylePage * stylesPerPage,
  );

  const handleResetFilters = () => {
    setStyleSearchInput("");
    setStyleSearch("");
    setDesignCategoryFilter("All Designs");
    setStylePage(1);
  };

  // STEP 2: Fabric Selection, Filtering & Pagination States
  const [selectedFabric, setSelectedFabric] = useState<Fabric | null>(null);

  const [fabricSearchInput, setFabricSearchInput] = useState<string>("");
  const [fabricSearch, setFabricSearch] = useState<string>("");
  const [fabricCategoryFilter, setFabricCategoryFilter] =
    useState<string>("all");
  const [fabricPage, setFabricPage] = useState<number>(1);

  // Sync selectedFabric if fabrics prop changes and current selectedFabric is not in fabrics
  useEffect(() => {
    if (
      selectedFabric &&
      fabrics.length > 0 &&
      !fabrics.some((f) => f?.code === selectedFabric?.code)
    ) {
      setSelectedFabric(null);
    }
  }, [fabrics, selectedFabric]);

  // Debounce Fabric Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFabricSearch(fabricSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [fabricSearchInput]);

  // Reset page to 1 when fabric filters change
  useEffect(() => {
    setFabricPage(1);
  }, [fabricSearch, fabricCategoryFilter]);

  // Load preset style & fabric from Gallery selection
  useEffect(() => {
    if (initialStyleId) {
      const match = styles.find((s) => s.id === initialStyleId);
      if (match) {
        setSelectedStyle(match);
      }
    }
    if (initialFabricCode) {
      const match = fabrics.find((f) => f?.code === initialFabricCode);
      if (match) {
        setSelectedFabric(match);
      }
    }
    if (initialStyleId || initialFabricCode) {
      // Clear preset after loading so it doesn't continuously override user changes
      clearInitialPreset?.();
    }
  }, [initialStyleId, initialFabricCode, styles, fabrics, clearInitialPreset]);

  // Compute filtered fabrics
  const filteredFabrics = fabrics.filter((fabric) => {
    // 1. Search Query
    const matchesSearch =
      (fabric.name || "").toLowerCase().includes(fabricSearch.toLowerCase()) ||
      (fabric?.code || "").toLowerCase().includes(fabricSearch.toLowerCase()) ||
      (fabric.description || "").toLowerCase().includes(fabricSearch.toLowerCase()) ||
      (fabric.color || "").toLowerCase().includes(fabricSearch.toLowerCase());

    // 2. Fabric Category
    let matchesCategory = true;
    if (fabricCategoryFilter !== "all") {
      matchesCategory = fabric.category === fabricCategoryFilter;
    }

    return matchesSearch && matchesCategory;
  });

  const fabricsPerPage = 20;
  const totalFabricPages =
    Math.ceil(filteredFabrics.length / fabricsPerPage) || 1;
  const paginatedFabrics = filteredFabrics.slice(
    (fabricPage - 1) * fabricsPerPage,
    fabricPage * fabricsPerPage,
  );

  const handleResetFabricFilters = () => {
    setFabricSearchInput("");
    setFabricSearch("");
    setFabricCategoryFilter("all");
    setFabricPage(1);
  };

  // STEP 3: Design Details
  const [designSelections, setDesignSelections] = useState<DesignSelections>({
    accessories: []
  });

  // Price List States
  const [hasLining, setHasLining] = useState(false);
  const selectedPriceCode: string = "AUTO";

  // STEP 4: Garment Type selection
  const garmentTypesForStyle = (style: StyleCategory | null) => {
    if (!style) return [];
    const exactMatch = {
      type: "Use Exact Design Style",
      fee: 0,
      discountFee: 0,
      code: "EXACT",
    };

    let details = [];
    if (style.gender === "female") {
      details = OFFICIAL_PRICE_LIST.filter(
        (p) => p.category === "ladies" && p?.code !== "L5",
      ).map((p) => ({
        type: p.description,
        fee: 0,
        discountFee: 0,
        code: p?.code,
      }));
    } else {
      // male, unisex, couple, family
      details = OFFICIAL_PRICE_LIST.filter((p) => p.category === "guys").map(
        (p) => ({
          type: p.description,
          fee: 0,
          discountFee: 0,
          code: p?.code,
        }),
      );
    }

    return [exactMatch, ...details];
  };

  const [selectedGarment, setSelectedGarment] = useState<{
    type: string;
    fee: number;
    discountFee?: number;
    code?: string;
  } | null>(null);

  const garmentCode = getSelectedGarmentCode(selectedGarment || {});
  const isAmbiguous = isAmbiguousLowerGarment(garmentCode);
  const liningEligible = isLiningEligibleForStyle(
    selectedStyle,
    selectedGarment?.code,
  );
  const hasCatalogDressLining = hasSelectedCustomDetailOption(
    designSelections,
    DRESS_LINING_OPTION_ID,
  );

  useEffect(() => {
    if (!liningEligible) {
      if (hasLining) setHasLining(false);
    } else {
      if (hasCatalogDressLining && !hasLining) {
        setHasLining(true);
      } else if (!hasCatalogDressLining && hasLining) {
        setDesignSelections((prev: DesignSelections) => {
          const nextDetails = { ...(prev.customDetails || {}) };
          nextDetails.dress_additional = DRESS_LINING_OPTION_ID;
          return {
            ...prev,
            customDetails: nextDetails,
            hasLining: true,
          };
        });
      }
    }
  }, [hasCatalogDressLining, hasLining, liningEligible, setDesignSelections]);

  useEffect(() => {
    if (selectedStyle) {
      const defaultGarment = garmentTypesForStyle(selectedStyle)[0];
      if (defaultGarment) {
        setSelectedGarment(defaultGarment);
        setDesignSelections((previous) => {
          const defaults =
            defaultGarment.code === "EXACT"
              ? selectedStyle.defaultGarmentDetails
              : undefined;
          const mergedSelections = defaults
            ? {
                ...defaults,
                ...previous,
                customDetails: {
                  ...(defaults.customDetails || {}),
                  ...(previous.customDetails || {}),
                },
              }
            : previous;

          return filterDesignSelectionsForDecorativeFeatures(
            filterDesignSelectionsForCustomDetails(
              selectedStyle,
              mergedSelections,
              customDetailCatalog,
              defaultGarment,
            ),
            selectedStyle,
            defaultGarment,
          );
        });
      }
    } else {
      setSelectedGarment(null);
    }
  }, [selectedStyle]);

  useEffect(() => {
    if (!selectedStyle) return;

    setDesignSelections((previous) =>
      filterDesignSelectionsForDecorativeFeatures(
        filterDesignSelectionsForCustomDetails(
          selectedStyle,
          previous,
          customDetailCatalog,
          selectedGarment,
        ),
        selectedStyle,
        selectedGarment,
      ),
    );
  }, [
    selectedStyle,
    selectedGarment?.code,
    selectedGarment?.type,
    customDetailCatalog,
  ]);

  // STEP 5 & 6: Sizing Inputs and Estimation state
  const [sizingMode, setSizingMode] = useState<"ai" | "manual">("ai");
  const [height, setHeight] = useState<number | "">(178);
  const [weight, setWeight] = useState<number | "">(75);
  const [age, setAge] = useState<number | "">(32);
  const [bodyBuild, setBodyBuild] = useState<
    "Slim" | "Average" | "Muscular" | "Broad"
  >("Average");
  const [fitPreference, setFitPreference] = useState<
    "Slim/Executive" | "Standard" | "Relaxed"
  >("Standard");
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [estimationSource, setEstimationSource] = useState<
    "gemini" | "heuristic" | null
  >(null);
  const [newProfileName, setNewProfileName] = useState<string>("");
  const [saveProfileSuccess, setSaveProfileSuccess] = useState<string>("");
  const [showMeasurementGuideModal, setShowMeasurementGuideModal] =
    useState<boolean>(false);
  const [activeGuideStep, setActiveGuideStep] = useState<string>("neck");

  // Fabric high-fidelity zoom states
  const [showFabricZoomModal, setShowFabricZoomModal] =
    useState<boolean>(false);
  const [zoomedFabric, setZoomedFabric] = useState<Fabric | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showFabricZoomModal) {
        setShowFabricZoomModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showFabricZoomModal]);

  const [measurements, setMeasurements] = useState<Measurements>({
    height: 178,
    weight: 75,
    age: 32,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 15.5,
    shoulder: 18.0,
    chest: 41.0,
    waist: 35.0,
    hip: 38.0,
    sleeve: 24.5,
    trouserLength: 40.0,
    isAiEstimated: false,
    unit: "inch",

    // Shirts/Dress Advanced defaults
    head: 22.0,
    ankleCircumference: 9.5,
    shirtLengthStandard: 30.5,
    shirtLengthLong: 41.0,
    bicep: 14.5,
    elbow: 12.5,
    armHole: 18.5,

    // Pants/Shorts Advanced defaults
    trouserWaist: 34.0,
    trouserHip: 38.5,
    trouserThigh: 24.0,
    trouserKnee: 17.5,
    trouserAnkleHorizontal: 16.0,
    trouserAnkleDiagonal: 18.5,
    trouserWaistToHip: 9.5,
    trouserCrotchDepth: 12.0,
    trouserWaistToKnee: 24.0,
    trouserWaistToAnkle: 40.0,
    trouserWaistToFloor: 42.5,

    // Heights Segments defaults
    heightHeadToShoulder: 12.0,
    heightShoulderToWaist: 19.0,
    heightHeadToWaist: 31.0,
    heightWaistToFloor: 39.0,
  });

  const handleUnitToggle = (newUnit: "inch" | "cm") => {
    const currentUnit = measurements.unit || "inch";
    if (currentUnit === newUnit) return;

    setMeasurements((prev) => {
      const keysToConvert: (keyof Measurements)[] = [
        "neck",
        "shoulder",
        "chest",
        "waist",
        "hip",
        "sleeve",
        "trouserLength",
        "head",
        "ankleCircumference",
        "shirtLengthStandard",
        "shirtLengthLong",
        "bicep",
        "elbow",
        "armHole",
        "underBorst",
        "hipCircumference",
        "squareNeckLength",
        "squareNeckWidth",
        "shoulderToUnderBorst",
        "trouserWaist",
        "trouserHip",
        "trouserThigh",
        "trouserKnee",
        "trouserAnkleHorizontal",
        "trouserAnkleDiagonal",
        "trouserWaistToHip",
        "trouserCrotchDepth",
        "trouserWaistToKnee",
        "trouserWaistToAnkle",
        "trouserWaistToFloor",
        "heightHeadToShoulder",
        "heightShoulderToWaist",
        "heightHeadToWaist",
        "heightWaistToFloor",
      ];

      const converted: Partial<Measurements> = { ...prev, unit: newUnit };

      keysToConvert.forEach((key) => {
        const val = prev[key];
        if (typeof val === "number") {
          if (newUnit === "cm") {
            // inches to cm: multiply by 2.54 and round to 1 decimal place
            converted[key as keyof Measurements] = (Math.round(
              val * 2.54 * 10,
            ) / 10) as never;
          } else {
            // cm to inches: divide by 2.54 and round to nearest 0.5
            converted[key as keyof Measurements] = (Math.round(
              (val / 2.54) * 2,
            ) / 2) as never;
          }
        }
      });

      return converted as Measurements;
    });
  };

  // STEP 7: Logistics Destination details
  const [customerName, setCustomerName] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod | null>(null);
  const [pickupTime, setPickupTime] = useState<string>(
    "Monday Afternoon (13:00 - 17:00)",
  );
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    countryCode: "",
  });

  const deliverySelection: DeliverySelection | undefined =
    deliveryMethod === "PICKUP"
      ? {
          method: "PICKUP",
          pickupLocation:
            businessSettings.productionSettings.defaultPickupLocation,
          pickupWindow: pickupTime,
        }
      : deliveryMethod === "DELIVERY"
        ? {
            method: "DELIVERY",
            address: deliveryAddress,
          }
        : undefined;

  // Batch / Group Options (Site-wide adaptive ordering options)
  const [batchType, setBatchType] = useState<
    "community" | "alone" | "personalized" | "actual"
  >("community");
  const [initialRouteSet, setInitialRouteSet] = useState(false);
  const [selectedBatchName, _setSelectedBatchName] =
    useState<string>("August Batch");
  const [customGroupCode, setCustomGroupCode] = useState<string>("");

  useEffect(() => {
    const dynamicCtx = { ...ctx };
    if (batchType === "alone") dynamicCtx.orderType = "Individual";
    else if (batchType === "personalized") dynamicCtx.orderType = "Group Organizer";
    else dynamicCtx.orderType = "Community";
    
    const decision = OrderRoutingEngine.evaluateOrder(dynamicCtx, storeBatches || []);
    
    if (!initialRouteSet && storeBatches) {
      if (decision.mode === "COMMUNITY_CLOSED" && batchType === "community") {
        setBatchType("alone");
      }
      setInitialRouteSet(true);
    }

    setRoutingDecision(decision);
  }, [batchType, storeBatches, initialRouteSet]);

  // Auto-populate customer info if logged in
  useEffect(() => {
    if (currentUser) {
      setCustomerName(currentUser.name);
      setCustomerEmail(currentUser.email || currentUser.phone || "");
    }
  }, [currentUser]);

  // STEP 8: Special tailoring instructions
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [leftoverFabricChoice, setLeftoverFabricChoice] = useState<string>(
    "Return leftover fabric pieces with garment",
  );

  // Validation feedback
  const [validationError, setValidationError] = useState<string>("");

  useEffect(() => {
    if (selectedFabric && currentStep === 1) {
      if (validationError === "Please select fabric.") {
        setValidationError("");
      } else if (
        validationError ===
          "The selected fabric is Out of Stock. Please select an In Stock or Low Stock option to continue." &&
        selectedFabric.stockStatus !== "OUT_OF_STOCK"
      ) {
        setValidationError("");
      }
    }
    if (selectedStyle && currentStep === 2 && validationError === "Please select design style.") {
      setValidationError("");
    }
  }, [selectedFabric, selectedStyle, validationError, currentStep]);

  // Cart addition success modal
  const [showAddedModal, setShowAddedModal] = useState<boolean>(false);
  const [showNextBatchConfirm, setShowNextBatchConfirm] = useState<boolean>(false);
  const [nextBatchToJoin, setNextBatchToJoin] = useState<any>(null);
  const [draftCommunityBatchName, setDraftCommunityBatchName] = useState<string>("");

  // Active accordion section for Step 5 advanced sizing passport
  const [activeAccordion, setActiveAccordion] = useState<string>("core");

  // Sizing Estimation execution trigger
  const runSizingEstimation = async () => {
    setIsEstimating(true);
    setValidationError("");
    try {
      const { measurements, source } = await ApiService.estimateMeasurements({
        height: height === "" ? null : height,
        weight: weight === "" ? null : weight,
        age: age === "" ? null : age,
        bodyBuild,
        fitPreference,
        gender: selectedStyle?.gender || "unisex",
      });
      setMeasurements(measurements);
      setEstimationSource(source);
    } catch (e) {
      console.error("Estimation failed entirely", e);
      setValidationError(
        "Failed to estimate measurements. Please try again or enter manually.",
      );
    } finally {
      setIsEstimating(false);
    }
  };

  // Helper to sync garment types when style changes
  const handleStyleChange = (style: StyleCategory) => {
    setSelectedStyle(style);
    const availableTypes = garmentTypesForStyle(style);
    const defaultGarment = availableTypes[0] || {
      type: "Standard Garment",
      fee: 0,
    };
    setSelectedGarment(defaultGarment);
    setDesignSelections((previous) =>
      filterDesignSelectionsForDecorativeFeatures(
        filterDesignSelectionsForCustomDetails(
          style,
          previous,
          customDetailCatalog,
          defaultGarment,
        ),
        style,
        defaultGarment,
      ),
    );
  };

  // Official Pricing List Helpers
  const getAutoDetectedPriceCode = () => {
    return selectedGarment?.code || "G1";
  };

  // Centralized pricing helper. Design-style prices are intentionally excluded.
  const getPricingBreakdown = () => {
    let clothingPrice = 0;
    let includesFabricAndSewing = isBatchPricingRoute(batchType);
    let includedFabricPrice = 0;
    let includedSewingCost = 0;
    let fabricPrice = 0;
    let fabricSewingCost = 0;
    let constructionSewingCost = 0;
    let constructionUpgradesPrice = 0;
    let customDetailsPrice = 0;
    let monogramPrice = 0;
    let traditionalAccessoriesPrice = 0;
    let decorativeFeatures: PricedSelection[] = [];
    let traditionalAccessories: PricedSelection[] = [];
    let batchShippingPendingReason: string | null = null;
    let individualShipping: ReturnType<
      typeof calculateIndividualShipping
    > | null = null;
    let batchShipping: ReturnType<
      typeof calculateBatchShipping
    > | null = null;
    let finalMileShipping: ReturnType<
      typeof calculateFinalMileShipping
    > | null = null;
    const resolvedFabricPrice = resolveFabricPrice(selectedFabric);
    const fabricPricingError = getFabricPricingError(selectedFabric);
    const authoritativePricing = selectedFabric
      ? calculateDesignPricing({
          route: batchType,
          design: {
            ...designSelections,
            hasLining: liningEligible ? hasLining : false,
          },
          fabric: selectedFabric,
          style: selectedStyle,
          garment: selectedGarment,
          catalog: customDetailCatalog,
          businessSettings,
        })
      : null;

    if (authoritativePricing) {
      clothingPrice = authoritativePricing.clothingPrice;
      includesFabricAndSewing =
        authoritativePricing.includesFabricAndSewing;
      includedFabricPrice = authoritativePricing.includedFabricPrice;
      includedSewingCost = authoritativePricing.includedSewingCost;
      fabricPrice = authoritativePricing.fabricPrice;
      fabricSewingCost = authoritativePricing.fabricSewingCost;
      constructionSewingCost =
        authoritativePricing.constructionSewingCost;
      constructionUpgradesPrice =
        authoritativePricing.constructionUpgradesPrice;
      customDetailsPrice = authoritativePricing.customDetailsPrice;
      monogramPrice = authoritativePricing.monogramPrice;
      traditionalAccessoriesPrice =
        authoritativePricing.traditionalAccessoriesPrice;
      decorativeFeatures = authoritativePricing.decorativeFeatures;
      traditionalAccessories = authoritativePricing.traditionalAccessories;
    }

    if (
      selectedFabric &&
      resolvedFabricPrice !== null &&
      selectedStyle &&
      selectedGarment
    ) {
      const garmentComposition = getGarmentCompositionFromCode(
        selectedGarment.code || "",
        selectedStyle.garmentComposition,
      );
      const garmentPieceCount = getGarmentPieceCount(garmentComposition);

      if (batchType === "alone") {
        individualShipping = calculateIndividualShipping(garmentPieceCount);
      } else {
        const isPersonalizedBatch = batchType === "personalized";
        if (isPersonalizedBatch) {
          const personalizedContext =
            resolvePersonalizedBatchShippingContext(ctx, customGroupCode);
          batchShippingPendingReason = personalizedContext.error;

          if (personalizedContext.context) {
            batchShipping = calculateBatchShipping({
              ...personalizedContext.context,
              garmentPieceCount,
            });
          }
        } else {
          batchShipping = calculateBatchShipping({
            batchId: ctx.batchId || ctx.batchName || selectedBatchName,
            batchName: ctx.batchName || selectedBatchName,
            plannedGarmentCapacity: Math.max(
              BATCH_MINIMUM_GARMENTS,
              ctx.expectedParticipants || BATCH_MINIMUM_GARMENTS,
            ),
            garmentPieceCount,
          });
        }
      }

      const arrivalGroupKey =
        batchType === "alone"
          ? "individual"
          : `batch:${(
              batchShipping?.batchId ||
              ctx.batchId ||
              ctx.batchName ||
              selectedBatchName
            )
              .trim()
              .toLocaleLowerCase("en")}`;
      finalMileShipping = calculateFinalMileShipping({
        deliverySelection,
        garmentPieceCount,
        shipmentGroupId: "FM-DESIGN-STUDIO-PREVIEW",
        arrivalGroupKey,
      });
    }

    const lagosToEindhovenShipping =
      individualShipping?.priceEur ?? batchShipping?.priceEur ?? 0;
    const eindhovenToDestinationShipping =
      finalMileShipping?.status === "READY"
        ? finalMileShipping.priceEur
        : null;
    const shippingCost = roundMoney(
      lagosToEindhovenShipping +
        (eindhovenToDestinationShipping ?? 0),
    );
    const subtotal = roundMoney(
      clothingPrice +
      fabricPrice +
      fabricSewingCost +
      constructionSewingCost +
      customDetailsPrice +
      shippingCost,
    );

    return {
      clothingPrice,
      includesFabricAndSewing,
      includedFabricPrice,
      includedSewingCost,
      fabricPrice,
      fabricSewingCost,
      constructionSewingCost,
      constructionUpgradesPrice,
      customDetailsPrice,
      monogramPrice,
      traditionalAccessoriesPrice,
      decorativeFeatures,
      traditionalAccessories,
      batchShippingPendingReason,
      fabricPricingError,
      individualShipping,
      batchShipping,
      finalMileShipping,
      lagosToEindhovenShipping,
      eindhovenToDestinationShipping,
      shippingCost,
      subtotal
    };
  };

  const pricing = getPricingBreakdown();
  const selectedFabricPrice = resolveFabricPrice(selectedFabric);
  const subtotal = pricing.subtotal;
  const personalizedGroupLabel =
    pricing.batchShipping?.batchName ||
    customGroupCode ||
    "Setup Required";
  const depositPercentage = clampDepositPercentage(
    businessSettings.pricingSettings.depositPercentage,
  );
  const depositRatio = getDepositRatio(depositPercentage);
  const garmentSubtotal = roundMoney(subtotal - pricing.shippingCost);
  const garmentDeposit = roundMoney(garmentSubtotal * depositRatio);
  const depositRequired = roundMoney(
    garmentDeposit + pricing.shippingCost,
  );
  const remainingDue = roundMoney(garmentSubtotal - garmentDeposit);
  const isInboundShippingReady =
    batchType === "alone"
      ? Boolean(pricing.individualShipping)
      : Boolean(pricing.batchShipping);
  const isFinalMileReady =
    pricing.finalMileShipping?.status === "READY";
  const isShippingReady = isInboundShippingReady && isFinalMileReady;
  const currencySymbol = PRICING_CURRENCY_SYMBOL;

  useEffect(() => {
    if (currentUser || guestDraftHydrated || isLoadingData) return;
    if (styles.length === 0 || fabrics.length === 0) return;

    const draft = GuestOrderSessionService.getGuestDesignDraft();
    if (!draft) {
      setGuestDraftHydrated(true);
      return;
    }

    const draftStyle =
      styles.find((style) => style.id === draft.selectedStyleId) || null;
    const draftFabric =
      fabrics.find(
        (fabric) => fabric.code === draft.selectedFabricCode,
      ) || null;
    setCurrentStep(Math.min(9, Math.max(1, draft.currentStep)));
    setSelectedStyle(draftStyle);
    setSelectedFabric(draftFabric);
    setSizingMode(draft.sizingMode);
    setMeasurements(draft.measurements);
    setDeliveryMethod(draft.deliveryMethod);
    setDeliveryAddress(draft.deliveryAddress);
    setPickupTime(draft.pickupTime);
    setCustomerName(draft.customerName);
    setCustomerEmail(draft.customerEmail);
    setCustomerPhone(draft.customerPhone);
    if (!orderContext) {
      setBatchType(draft.batchType);
      setCustomGroupCode(draft.customGroupCode);
    }
    setSpecialInstructions(draft.specialInstructions);
    setLeftoverFabricChoice(draft.leftoverFabricChoice);
    setHasLining(draft.hasLining);

    const restoreSelections = window.setTimeout(() => {
      setSelectedGarment(draft.selectedGarment);
      setDesignSelections(
        filterDesignSelectionsForDecorativeFeatures(
          filterDesignSelectionsForCustomDetails(
            draftStyle,
            draft.designSelections,
            customDetailCatalog,
            draft.selectedGarment,
          ),
          draftStyle,
          draft.selectedGarment,
        ),
      );
      setGuestDraftHydrated(true);
    }, 0);
    return () => window.clearTimeout(restoreSelections);
  }, [
    currentUser,
    guestDraftHydrated,
    isLoadingData,
    styles,
    fabrics,
    orderContext,
  ]);

  useEffect(() => {
    if (currentUser || !guestDraftHydrated) return;

    const persistTimer = window.setTimeout(() => {
      const guestDraft: GuestDesignDraft = {
        currentStep,
        selectedFabricCode: selectedFabric?.code || null,
        selectedStyleId: selectedStyle?.id || null,
        selectedGarment,
        designSelections,
        measurements,
        sizingMode,
        deliveryMethod,
        deliveryAddress,
        pickupTime,
        customerName,
        customerEmail,
        customerPhone,
        batchType,
        batchId:
          pricing.batchShipping?.batchId || ctx.batchId,
        batchName:
          pricing.batchShipping?.batchName || ctx.batchName,
        customGroupCode,
        garmentPieceCount:
          pricing.individualShipping?.garmentPieceCount ??
          pricing.batchShipping?.garmentPieceCount ??
          null,
        specialInstructions,
        leftoverFabricChoice,
        hasLining,
        pricingBreakdown: {
          clothingPrice: pricing.clothingPrice,
          includesFabricAndSewing:
            pricing.includesFabricAndSewing,
          fabricPrice: pricing.fabricPrice,
          fabricSewingCost: pricing.fabricSewingCost,
          constructionSewingCost: pricing.constructionSewingCost,
          constructionUpgradesPrice:
            pricing.constructionUpgradesPrice,
          customDetailsPrice: pricing.customDetailsPrice,
          lagosToEindhovenShipping:
            pricing.lagosToEindhovenShipping,
          eindhovenToDestinationShipping:
            pricing.eindhovenToDestinationShipping,
          total: pricing.subtotal,
        },
        shippingSnapshot: {
          individual: pricing.individualShipping || undefined,
          batch: pricing.batchShipping || undefined,
          finalMile: pricing.finalMileShipping || undefined,
        },
        updatedAt: new Date().toISOString(),
      };
      GuestOrderSessionService.saveGuestDesignDraft(guestDraft);
    }, 250);

    return () => window.clearTimeout(persistTimer);
  }, [
    currentUser,
    guestDraftHydrated,
    currentStep,
    selectedFabric,
    selectedStyle,
    selectedGarment,
    designSelections,
    measurements,
    sizingMode,
    deliveryMethod,
    deliveryAddress,
    pickupTime,
    customerName,
    customerEmail,
    customerPhone,
    batchType,
    customGroupCode,
    specialInstructions,
    leftoverFabricChoice,
    hasLining,
    pricing.clothingPrice,
    pricing.includesFabricAndSewing,
    pricing.fabricPrice,
    pricing.fabricSewingCost,
    pricing.constructionSewingCost,
    pricing.constructionUpgradesPrice,
    pricing.customDetailsPrice,
    pricing.lagosToEindhovenShipping,
    pricing.eindhovenToDestinationShipping,
    pricing.subtotal,
    pricing.individualShipping,
    pricing.batchShipping,
    pricing.finalMileShipping,
    ctx.batchId,
    ctx.batchName,
  ]);

  const focusAndScrollToValidationTarget = (targetId: string) => {
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        const input = targetEl.querySelector("input:not([disabled])") as HTMLElement;
        if (input) {
          input.focus();
        } else {
          targetEl.focus();
        }
      }, 300);
    } else {
      document.getElementById("design-studio-stepper")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Handle step advances
  const handleNextStep = () => {
    setValidationError("");
    setInvalidGroups([]);

    // Step validation checks
    if (currentStep === 1) {
      if (!selectedFabric) {
        setValidationError("Please select fabric.");
        setTimeout(() => {
          document.getElementById("design-studio-stepper")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }
      if (selectedFabric.stockStatus === "OUT_OF_STOCK") {
        setValidationError(
          "The selected fabric is Out of Stock. Please select an In Stock or Low Stock option to continue.",
        );
        setTimeout(() => {
          document.getElementById("design-studio-stepper")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }
    }
    if (currentStep === 2 && !selectedStyle) {
      setValidationError("Please select design style.");
      setTimeout(() => {
        document.getElementById("design-studio-stepper")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      return;
    }
    if (currentStep === 3) {
      const enrichedGarment = selectedGarment
        ? { ...selectedGarment, lowerGarmentType: designSelections.lowerGarmentType }
        : { lowerGarmentType: designSelections.lowerGarmentType };

      const missingGroup = getMissingCustomDetailGroup(
        selectedStyle,
        designSelections,
        customDetailCatalog,
        enrichedGarment,
      );

      if (missingGroup) {
        const presentation = CUSTOM_DETAIL_SELECTION_GROUP_PRESENTATION[missingGroup] ||
                             (ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION as any)[missingGroup];
        const missingLabel = presentation?.title || missingGroup.replace(/_/g, " ");
        setValidationError(`Please select a ${missingLabel.toLowerCase()} option.`);
        setInvalidGroups([missingGroup]);
        setTimeout(() => {
          focusAndScrollToValidationTarget(`custom-detail-group-${missingGroup}`);
        }, 50);
        return;
      }

      if (isAmbiguous && !designSelections.lowerGarmentType) {
        setValidationError("Please select a Garment Type.");
        setInvalidGroups(["lowerGarmentType"]);
        setTimeout(() => {
          focusAndScrollToValidationTarget("custom-detail-group-lowerGarmentType");
        }, 50);
        return;
      }
    }
    if (currentStep === 5) {
      // was 4
      if (sizingMode === "ai") {
        const hasConsented =
          storeUser?.biometricConsent?.status === "accepted" ||
          localBiometricConsent === "accepted";
        if (!hasConsented) {
          setConsentActionSource("ai_sizing");
          setShowConsentModal(true);
          return;
        }

        // Run estimation before going to the next review step
        runSizingEstimation();
        setCurrentStep(6); // was 5
        return;
      }
    }
    if (currentStep === 6) {
      // was 5
      // Validate measurement boundaries
      if (
        measurements.neck <= 0 ||
        measurements.shoulder <= 0 ||
        measurements.chest <= 0 ||
        measurements.waist <= 0 ||
        measurements.hip <= 0
      ) {
        setValidationError("Tailored measurements must be greater than zero.");
        return;
      }
    }
    if (currentStep === 7) {
      // was 6
      if (!customerName.trim() || !customerPhone.trim()) {
        setValidationError(
          "Please populate your name and mobile phone number.",
        );
        return;
      }
      if (customerEmail.trim() && !customerEmail.includes("@")) {
        setValidationError("Please provide a valid email address.");
        return;
      }
      if (!deliveryMethod) {
        setValidationError(
          "Please choose Eindhoven pickup or delivery to your address.",
        );
        return;
      }
      if (
        deliveryMethod === "DELIVERY" &&
        pricing.finalMileShipping?.status === "DESTINATION_REQUIRED"
      ) {
        setValidationError(
          "Please complete the address, city, postal code, and country for final delivery.",
        );
        return;
      }
    }

    if (currentStep < 9) {
      // was 8
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    setValidationError("");
    if (currentStep > 1) {
      if (currentStep === 5) {
        if (
          localBiometricConsent === "declined" ||
          storeUser?.biometricConsent?.status === "declined"
        ) {
          // Skip Step 4 backwards
          setCurrentStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      }
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleAcceptConsent = () => {
    const timestamp = new Date().toISOString();
    const consent = {
      status: "accepted" as const,
      timestamp,
      gdprVersion: "v1.0 Netherlands",
      userAgent: navigator.userAgent,
    };

    setLocalBiometricConsent("accepted");
    sessionStorage.setItem("odogwu_biometric_consent", "accepted");

    if (storeUser) {
      setCurrentUser({ ...storeUser, biometricConsent: consent });
    }

    setShowConsentModal(false);

    if (consentActionSource === "virtual_try_on") {
      setCurrentStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (consentActionSource === "ai_sizing") {
      // If triggered from step 5 Continue button
      runSizingEstimation();
      setCurrentStep(6);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    setConsentActionSource(null);
  };

  const handleSelectAiSizingMode = () => {
    const hasConsented =
      storeUser?.biometricConsent?.status === "accepted" ||
      localBiometricConsent === "accepted";
    if (!hasConsented) {
      setConsentActionSource("ai_sizing");
      setShowConsentModal(true);
      return;
    }
    setSizingMode("ai");
  };

  const handleDeclineConsent = () => {
    const consent = {
      status: "declined" as const,
      timestamp: new Date().toISOString(),
      gdprVersion: "v1.0 Netherlands",
      userAgent: navigator.userAgent,
    };

    setLocalBiometricConsent("declined");
    sessionStorage.setItem("odogwu_biometric_consent", "declined");

    if (storeUser) {
      setCurrentUser({ ...storeUser, biometricConsent: consent });
    }

    setShowConsentModal(false);

    if (consentActionSource === "virtual_try_on") {
      // Skip Step 4 (Virtual Try-on) since they declined, go straight to Step 5
      setCurrentStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setSizingMode("manual");
    }

    setNotification({
      message: "AI features disabled. Switched to manual measurement.",
      type: "info",
    });
    setConsentActionSource(null);
  };

  // Dispatch custom garment choice to tailoring Cart
  const handleAddToCartAction = () => {
    if (batchType === "personalized") {
      const personalizedContext =
        resolvePersonalizedBatchShippingContext(ctx, customGroupCode);
      if (!personalizedContext.context) {
        setValidationError(
          personalizedContext.error ||
            "Complete the personalized group setup before placing this order.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const fabricPricingError = getFabricPricingError(selectedFabric);
      if (fabricPricingError) {
        setValidationError(fabricPricingError);
        setTimeout(() => {
          document
            .getElementById("design-studio-stepper")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
        return;
      }
    }

    // Phase 4.2 Integration: Evaluate routing when customer submits order
    const decision = OrderRoutingEngine.evaluateOrder(ctx, storeBatches || []);
    
    if (!decision.allowCommunitySubmission && batchType === "community") {
      setRoutingDecision(decision);
      setShowRoutingPanel(true);
      return;
    }

    proceedToCart();
  };

  const proceedToCart = () => {
    const finalBatchName =
      batchType === "community"
        ? (draftCommunityBatchName || ctx.batchName)
        : batchType === "alone"
          ? "Individual Order (No Batch)"
          : batchType === "personalized"
            ? `Personalized Group: ${pricing.batchShipping?.batchName || customGroupCode}`
            : selectedBatchName;
    const deliveryLocation =
      deliverySelection?.method === "PICKUP"
        ? `${deliverySelection.pickupLocation} (Pickup: ${deliverySelection.pickupWindow})`
        : deliverySelection?.address
          ? [
              deliverySelection.address.addressLine1,
              deliverySelection.address.addressLine2,
              deliverySelection.address.postalCode,
              deliverySelection.address.city,
              deliverySelection.address.countryCode,
            ]
              .filter(Boolean)
              .join(", ")
          : "";
    const storedItemTotal = roundMoney(
      subtotal -
        (pricing.finalMileShipping?.status === "READY"
          ? pricing.finalMileShipping.priceEur ?? 0
          : 0),
    );
    const applicableDesignSelections =
      filterDesignSelectionsForDecorativeFeatures(
        filterDesignSelectionsForCustomDetails(
          selectedStyle,
          designSelections,
          customDetailCatalog,
          selectedGarment,
        ),
        selectedStyle,
        selectedGarment,
      );

    const cartItemData = {
      customer: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        location: deliveryLocation,
      },
      style: selectedStyle,
      fabric: selectedFabric,
      design: {
        ...applicableDesignSelections,
        decorativeFeatures: pricing.decorativeFeatures.map(
          (feature) => feature.label as DecorativeFeature,
        ),
        customDetailSnapshots: getCustomDetailSnapshots(
          applicableDesignSelections,
          customDetailCatalog,
        ),
        hasLining: liningEligible ? hasLining : false,
        priceCode:
          selectedPriceCode === "AUTO"
            ? getAutoDetectedPriceCode()
            : selectedPriceCode,
      },
      garment: {
        type: `${selectedGarment?.type || "Pending"} [Code: ${selectedPriceCode === "AUTO" ? getAutoDetectedPriceCode() : selectedPriceCode}]`,
        totalPrice: storedItemTotal,
        clothingPrice: pricing.clothingPrice,
        includesFabricAndSewing: pricing.includesFabricAndSewing,
        includedFabricPrice: pricing.includedFabricPrice,
        includedSewingCost: pricing.includedSewingCost,
        fabricSewingCost: pricing.fabricSewingCost,
        constructionSewingCost: pricing.constructionSewingCost,
        fabricPrice: pricing.fabricPrice,
        constructionUpgradesPrice: pricing.constructionUpgradesPrice,
        customDetailsPrice: pricing.customDetailsPrice,
        monogramPrice: pricing.monogramPrice,
        traditionalAccessoriesPrice: pricing.traditionalAccessoriesPrice,
        individualShipping: pricing.individualShipping || undefined,
        batchShipping: pricing.batchShipping || undefined,
        checkoutTotal: storedItemTotal,
      },
      measurements: measurements,
      specialInstructions: specialInstructions,
      notesAboutLeftoverFabric: leftoverFabricChoice,
      batchType: batchType,
      batchId: pricing.batchShipping?.batchId,
      batchName: finalBatchName,
      garmentPieceCount:
        pricing.individualShipping?.garmentPieceCount ??
        pricing.batchShipping?.garmentPieceCount ??
        getGarmentPieceCount(selectedStyle.garmentComposition),
      deliverySelection,
      customGroupCode:
        batchType === "personalized"
          ? pricing.batchShipping?.batchId
          : customGroupCode,
    };

    onAddToCart(cartItemData);
    setShowAddedModal(true);
  };

  const handleRoutingActionSelect = (actionType: string) => {
    if (!OrderRoutingEngine.canChangeRouting(orderContext)) {
      alert("This order has already been confirmed and can no longer be changed.");
      setShowRoutingPanel(false);
      return;
    }
    if (actionType === "INDIVIDUAL_ORDER") {
      setBatchType("alone");
      setShowRoutingPanel(false);
    } else if (actionType === "PERSONALIZED_BATCH") {
      setBatchType("personalized");
      setShowRoutingPanel(false);
    } else if (actionType === "COMMUNITY_ORDER") {
      setBatchType("community");
      setDraftCommunityBatchName("");
      setShowRoutingPanel(false);
    } else if (actionType === "NEXT_BATCH") {
      const nextBatch = routingPresentation?.nextCommunityBatches?.[0];
      if (nextBatch) {
        setNextBatchToJoin(nextBatch);
        setShowNextBatchConfirm(true);
      }
    }
    // Let the user click submit again now that the batch type is updated, or submit directly
    // The prompt says: "When selected: Reuse the existing Design Studio. Preserve every design selection. Only change: batchType -> INDIVIDUAL"
    // So we just change state and close the panel.
  };

  const handleConfirmNextBatch = () => {
    if (nextBatchToJoin) {
      setBatchType("community");
      setDraftCommunityBatchName(nextBatchToJoin.name);
    }
    setShowNextBatchConfirm(false);
    setShowRoutingPanel(false);
  };

  const resetDesignStudio = () => {
    setSelectedStyle(styles[0] || ({ id: "", name: "", description: "", gender: "unisex", tags: [], garments: [], images: [] } as unknown as StyleCategory));
    setSelectedFabric(null);
    setDesignSelections({ accessories: [] });
    setSpecialInstructions("");
    setLeftoverFabricChoice(
      "Return leftover fabric pieces with garment (for standard custom caps/masks)",
    );
    setValidationError("");
    setCurrentStep(1);
    setShowAddedModal(false);
  };

  // Visual helper for stepper header
  const stepTitles = [
    "Fabric Selection",
    "Style Choice",
    "Custom Accents",
    "Virtual Try-On",
    "Sizing Input",
    "Calibrated Dimensions",
    "Delivery Coordinates",
    "Special Directives",
    "Premium Review",
  ];

  return (
    <div id="design-studio-stepper" className="space-y-8 font-sans">
      
      {/* Information Banner for Routing (Phase 4.2) */}
      {routingDecision && !routingDecision.allowCommunitySubmission && (
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          routingDecision.mode !== 'COMMUNITY_OPEN' ? 'bg-heritage-gold/10 border-heritage-gold/20 text-heritage-gold' :
          'bg-heritage-ink/5 border-heritage-ink/10 text-heritage-ink'
        }`}>
          <div className="mt-0.5"><AlertTriangle size={16} /></div>
          <div>
            <h4 className="font-bold text-sm mb-1">{routingPresentation.title}</h4>
            <p className="text-xs opacity-90 leading-relaxed">{routingPresentation.description}</p>
          </div>
        </div>
      )}

      {/* 9-step progress visualizer */}
      {/* MOBILE STEPPER (Hidden on md and up) */}
      <div className="md:hidden bg-white border border-heritage-gold/15 p-4 rounded-3xl shadow-sm space-y-3 select-none">
        <div className="flex flex-col sm:flex-row sm:justify-between items-center gap-1.5 sm:gap-0 text-center sm:text-left">
          <span className="font-bold text-heritage-green text-xs sm:text-xs">
            Step {currentStep} of 9:{" "}
            <span className="text-heritage-gold font-serif text-xs sm:text-sm font-semibold block sm:inline mt-0.5 sm:mt-0">
              {stepTitles[currentStep - 1]}
            </span>
          </span>
          <span className="font-mono text-heritage-ink/40 font-bold text-[10px] sm:text-xs">
            {Math.round((currentStep / 9) * 100)}% Complete
          </span>
        </div>

        {/* Dynamic bar */}
        <div className="h-1.5 w-full bg-heritage-cream rounded-full overflow-hidden">
          <div
            className="h-full bg-heritage-gold transition-all duration-300"
            style={{ width: `${(currentStep / 9) * 100}%` }}
          ></div>
        </div>

        {/* Minimal horizontal list showing step dots (fully clickable for passed steps) */}
        <div className="flex justify-between items-start text-[9px] sm:text-[10px] text-heritage-ink/50 uppercase tracking-widest font-semibold pt-1.5 px-0.5 sm:px-1">
          {stepTitles.map((title, idx) => {
            const isPassed = idx + 1 < currentStep;
            const isCurrent = idx + 1 === currentStep;
            const shortLabels = ["Fabric", "Style", "Accents", "Try-On", "Sizing", "Dims", "Delivery", "Notes", "Review"];
            const shortLabel = shortLabels[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (isPassed) {
                    const targetStep = idx + 1;
                    if (
                      targetStep === 4 &&
                      (localBiometricConsent === "declined" ||
                        storeUser?.biometricConsent?.status === "declined")
                    ) {
                      // Prevent accessing step 4 if declined
                      return;
                    }
                    setCurrentStep(targetStep);
                    setValidationError("");
                  }
                }}
                disabled={
                  !isPassed ||
                  (idx + 1 === 4 &&
                    (localBiometricConsent === "declined" ||
                      storeUser?.biometricConsent?.status === "declined"))
                }
                className={`group relative flex flex-col items-center justify-start transition-all duration-200 p-0.5 sm:p-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-heritage-gold/30 ${
                  isCurrent
                    ? "text-heritage-gold font-bold scale-110 cursor-default"
                    : isPassed &&
                        !(
                          idx + 1 === 4 &&
                          (localBiometricConsent === "declined" ||
                            storeUser?.biometricConsent?.status === "declined")
                        )
                      ? "text-heritage-green cursor-pointer hover:scale-110 hover:text-heritage-forest hover:bg-heritage-cream/30"
                      : "text-heritage-ink/30 cursor-not-allowed"
                }`}
              >
                <span className="font-mono text-[11px] sm:text-xs leading-none">
                  {idx + 1}
                </span>
                <span className="mt-1 text-[7px] sm:text-[8px] uppercase tracking-wider hidden sm:block whitespace-nowrap">
                  {shortLabel}
                </span>
                <span className="mt-1 text-[6px] uppercase tracking-wide block sm:hidden whitespace-nowrap overflow-hidden text-ellipsis max-w-[32px]">
                  {shortLabel}
                </span>

                {/* Custom Tooltip */}
                <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-heritage-green text-white text-[10px] font-sans font-medium tracking-normal normal-case rounded-lg shadow-xl opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 pointer-events-none whitespace-nowrap z-50">
                  <div className="font-serif font-bold text-[11px]">
                    {title}
                  </div>
                  {isPassed && (
                    <div className="text-[9px] text-heritage-gold font-semibold mt-0.5 font-sans tracking-wide">
                      Click to jump back
                    </div>
                  )}
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-heritage-green"></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DESKTOP/TABLET STEPPER (Hidden on mobile) */}
      <div className="hidden md:block bg-white border border-heritage-gold/15 py-3 px-5 rounded-2xl shadow-sm select-none">
        <div className="flex justify-between items-end mb-2">
          <div className="text-heritage-green font-bold text-sm">
            Step {currentStep} of 9:{" "}
            <span className="text-heritage-gold font-serif ml-1">
              {stepTitles[currentStep - 1]}
            </span>
          </div>
          <div className="font-mono text-heritage-ink/50 text-[11px] font-bold">
            {Math.round((currentStep / 9) * 100)}% Complete
          </div>
        </div>

        {/* Dynamic bar */}
        <div className="h-[3px] w-full bg-heritage-cream rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-heritage-gold transition-all duration-300"
            style={{ width: `${(currentStep / 9) * 100}%` }}
          ></div>
        </div>

        {/* Labels row */}
        <div className="flex justify-between items-start text-[10px] uppercase tracking-wider font-semibold">
          {stepTitles.map((_title, idx) => {
            const isPassed = idx + 1 < currentStep;
            const isCurrent = idx + 1 === currentStep;
            const shortLabels = ["Fabric", "Style", "Accents", "Try-On", "Sizing", "Dims", "Delivery", "Notes", "Review"];
            const shortLabel = shortLabels[idx];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (isPassed) {
                    const targetStep = idx + 1;
                    if (
                      targetStep === 4 &&
                      (localBiometricConsent === "declined" ||
                        storeUser?.biometricConsent?.status === "declined")
                    ) {
                      return;
                    }
                    setCurrentStep(targetStep);
                    setValidationError("");
                  }
                }}
                disabled={
                  !isPassed ||
                  (idx + 1 === 4 &&
                    (localBiometricConsent === "declined" ||
                      storeUser?.biometricConsent?.status === "declined"))
                }
                className={`flex flex-col items-center sm:items-start gap-0.5 transition-colors duration-200 focus:outline-none w-14 ${
                  isCurrent
                    ? "text-heritage-gold"
                    : isPassed &&
                        !(
                          idx + 1 === 4 &&
                          (localBiometricConsent === "declined" ||
                            storeUser?.biometricConsent?.status === "declined")
                        )
                      ? "text-heritage-green/70 cursor-pointer hover:text-heritage-gold"
                      : "text-heritage-ink/25 cursor-not-allowed"
                }`}
              >
                <span className={`font-mono text-[11px] leading-none ${isCurrent ? "font-bold" : "font-medium"}`}>
                  {idx + 1}
                </span>
                <span className={`leading-tight text-center sm:text-left text-[9px] ${isCurrent ? "font-bold" : "font-medium"}`}>
                  {shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Validation feedback banners */}
      {validationError && (
        <div role="alert" aria-live="assertive" className="p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl flex items-center gap-3 text-xs">
          <AlertTriangle className="text-amber-700 shrink-0" size={16} />
          <p className="font-medium">{validationError}</p>
        </div>
      )}

      {/* RENDER DYNAMIC STEPS CONTAINER */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 bg-white border border-heritage-gold/15 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          {/* STEP 2: Style Template Selection */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 2 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Choose Design Style
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Choose a style below. We offer 50 unique handcrafted
                  templates.
                </p>
              </div>

              {/* Filtering & Search Bar */}
              <div className="bg-heritage-cream/30 border border-heritage-gold/10 p-4 rounded-2xl space-y-3 font-sans">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative flex-grow">
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-heritage-ink/40"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Search styles (e.g. Imperial, Sovereign, Senator)..."
                      value={styleSearchInput}
                      onChange={(e) => setStyleSearchInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 focus:border-heritage-gold rounded-xl text-xs outline-none transition"
                    />
                  </div>
                  {/* Active filters status & reset */}
                  {(styleSearch ||
                    designCategoryFilter !== "All Designs") && (
                    <button
                      onClick={handleResetFilters}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-heritage-gold hover:text-heritage-green transition bg-white border border-heritage-gold/20 rounded-xl"
                    >
                      <RotateCcw size={13} />
                      Reset Filters
                    </button>
                  )}
                </div>

                <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
                  {DESIGN_CATEGORIES_LIST.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setDesignCategoryFilter(cat.id)}
                      className={`whitespace-nowrap px-4 py-2 text-xs font-semibold rounded-full border transition ${
                        designCategoryFilter === cat.id
                          ? "bg-heritage-gold text-white border-heritage-gold shadow-sm"
                          : "bg-white text-heritage-ink/70 border-heritage-gold/20 hover:border-heritage-gold hover:text-heritage-gold"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                {designCategoryFilter !== "All Designs" && (
                  <div className="text-xs text-heritage-ink/80 bg-heritage-cream/50 p-2 px-3 rounded-lg border border-heritage-gold/10">
                    {DESIGN_CATEGORIES_LIST.find((c) => c.id === designCategoryFilter)?.desc}
                  </div>
                )}

                {/* Counter status bar */}
                <div className="flex justify-between items-center text-[10px] text-heritage-ink/50 pt-1">
                  <span>
                    Showing{" "}
                    <strong>
                      {Math.min(filteredStyles.length, stylesPerPage)}
                    </strong>{" "}
                    of <strong>{filteredStyles.length}</strong> matching
                    templates (out of 50 total)
                  </span>
                  {stylePage > 1 && (
                    <span>
                      Page <strong>{stylePage}</strong> of{" "}
                      <strong>{totalPages}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Styles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 font-sans">
                {paginatedStyles.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-3 sm:col-span-2">
                    <SlidersHorizontal
                      className="mx-auto text-heritage-ink/30"
                      size={32}
                    />
                    <h3 className="font-serif text-sm font-bold text-heritage-green">
                      No Style Matches Found
                    </h3>
                    <p className="text-xs text-heritage-ink/60 max-w-md mx-auto">
                      We couldn't find any designs matching your current search
                      or filter parameters. Try clearing some filters to explore
                      our full range of 50 styles.
                    </p>
                    <button
                      onClick={handleResetFilters}
                      className="px-4 py-1.5 bg-heritage-green text-white rounded-xl text-xs font-semibold hover:bg-heritage-forest transition shadow-sm"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  paginatedStyles.map((style) => (
                    <div
                      key={style.id}
                      onClick={() => handleStyleChange(style)}
                      className={`flex flex-col overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                        selectedStyle?.id === style.id
                          ? "border-heritage-gold shadow-md bg-heritage-cream/20"
                          : "border-gray-150 bg-white shadow-sm hover:border-heritage-gold/40 hover:shadow-md"
                      }`}
                    >
                      {/* Large Image at Top */}
                      {style.image && (
                        <div className="relative w-full aspect-[4/5] sm:aspect-[3/4] bg-heritage-cream/30 border-b border-gray-100 overflow-hidden shrink-0 flex items-center justify-center p-2">
                          <img
                            loading="lazy"
                            src={style.image}
                            alt={style.name}
                            className="w-full h-full object-contain transition-transform duration-500 hover:scale-[1.03]"
                            referrerPolicy="no-referrer"
                          />
                          {/* Selection indicator */}
                          {selectedStyle?.id === style.id && (
                            <div className="absolute top-3 right-3 bg-heritage-gold text-white p-1.5 rounded-full shadow-lg z-10">
                              <Check size={14} strokeWidth={3} />
                            </div>
                          )}
                          {/* Detected Colors */}
                          {style.detectedColors && (
                            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full border border-gray-150 shadow-sm z-10">
                              <div
                                className="w-3 h-3 rounded-full border border-gray-200 shadow-sm"
                                style={{ backgroundColor: style.detectedColors.main }}
                                title="Main Color"
                              ></div>
                              <div
                                className="w-3 h-3 rounded-full border border-gray-200 shadow-sm"
                                style={{ backgroundColor: style.detectedColors.secondary }}
                                title="Secondary Color"
                              ></div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Card Content Below */}
                      <div className="p-4 sm:p-5 flex flex-col flex-grow bg-white">
                        <div className="mb-3">
                          <h3 className="font-serif text-sm sm:text-base font-bold text-heritage-green leading-tight">
                            {style.name}
                          </h3>
                        </div>
                        
                        {/* Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-green/10 text-heritage-green border border-heritage-green/20">
                            {style.gender}
                          </span>
                          <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/10 text-heritage-gold border border-heritage-gold/20">
                            {style.outfitType || "Senator Set"}
                          </span>
                          <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-green text-heritage-gold border border-heritage-gold/20">
                            {style.garmentComposition || "2-Piece Set"}
                          </span>
                          {style.fabricCategory && style.fabricCategory !== "Any" && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded border border-heritage-gold/30 text-heritage-gold bg-heritage-gold/5">
                              {style.fabricCategory}
                            </span>
                          )}
                          {hasMonogram(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Monogram
                            </span>
                          )}
                          {hasEmbroidery(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Embroidery
                            </span>
                          )}
                          {hasMonogramTrimming(style) && (
                            <span className="px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-wider rounded bg-heritage-gold/20 text-heritage-green border border-heritage-gold/30 flex items-center gap-1">
                              Contains Monogram Trim
                            </span>
                          )}
                        </div>
                        
                        {/* Description */}
                        <p className="text-[10px] sm:text-[11px] text-heritage-ink/75 leading-relaxed line-clamp-2 mt-auto">
                          {style.description}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-4 font-sans">
                  <button
                    onClick={() =>
                      setStylePage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={stylePage === 1}
                    className="flex items-center justify-center gap-1 text-xs font-semibold px-3 min-h-[44px] rounded-xl border border-gray-200 hover:bg-gray-50 text-heritage-ink disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5">
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setStylePage(pageNum)}
                          className={`w-11 h-11 sm:w-8 sm:h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                            stylePage === pageNum
                              ? "bg-heritage-green text-white shadow-sm"
                              : "border border-gray-200 hover:bg-gray-50 text-heritage-ink"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <span className="sm:hidden text-xs text-heritage-ink/60">
                    Page {stylePage} of {totalPages}
                  </span>

                  <button
                    onClick={() =>
                      setStylePage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={stylePage === totalPages}
                    className="flex items-center justify-center gap-1 text-xs font-semibold px-3 min-h-[44px] rounded-xl border border-gray-200 hover:bg-gray-50 text-heritage-ink disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: Fabric Swatches Selection */}
          {currentStep === 1 && (
            <div className="space-y-6 font-sans">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 1 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Select Fabric
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed font-sans">
                  Select your high-quality fabric below. We offer 50 premium
                  options with detailed weaves.
                </p>
              </div>

              {/* Filtering & Search Bar */}
              <div className="bg-heritage-cream/30 border border-heritage-gold/10 p-4 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative flex-grow">
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-heritage-ink/40"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Search fabrics (e.g. Royal Emerald, Aso-Oke, ODG-001)..."
                      value={fabricSearchInput}
                      onChange={(e) => setFabricSearchInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 focus:border-heritage-gold rounded-xl text-xs outline-none transition"
                    />
                  </div>
                  {/* Active filters status & reset */}
                  {(fabricSearch ||
                    fabricCategoryFilter !== "all") && (
                    <button
                      onClick={handleResetFabricFilters}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-heritage-gold hover:text-heritage-green transition bg-white border border-heritage-gold/20 rounded-xl"
                    >
                      <RotateCcw size={13} />
                      Reset Filters
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* Category Filter */}
                  <SelectField
                    label="Fabric Category"
                    value={fabricCategoryFilter}
                    onChange={(e) => setFabricCategoryFilter(e.target.value)}
                    options={[
                      { value: "all", label: "All Categories" },
                      { value: "HiTarget Ankara", label: "HiTarget Ankara" },
                      { value: "Hollandis Ankara", label: "Hollandis Ankara" },
                      { value: "Kampala", label: "Kampala" },
                      { value: "Aso-Oke", label: "Aso-Oke" },
                      { value: "Adire", label: "Adire" },
                      { value: "Isiagu (Akwa-Oche)", label: "Isiagu (Akwa-Oche)" },
                      { value: "Lace", label: "Lace" },
                    ]}
                  />
                </div>

                {/* Counter status bar */}
                <div className="flex justify-between items-center text-[10px] text-heritage-ink/50 pt-1">
                  <span>
                    Showing{" "}
                    <strong>
                      {Math.min(filteredFabrics.length, fabricsPerPage)}
                    </strong>{" "}
                    of <strong>{filteredFabrics.length}</strong> matching
                    swatches (out of 50 total)
                  </span>
                  {fabricPage > 1 && (
                    <span>
                      Page <strong>{fabricPage}</strong> of{" "}
                      <strong>{totalFabricPages}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Fabrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {isLoadingData && fabrics.length === 0 ? (
                  Array.from({ length: 8 }).map((_, idx) => <FabricSkeleton key={idx} />)
                ) : paginatedFabrics.length === 0 ? (
                  <div className="col-span-1 sm:col-span-2 lg:col-span-4 p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl space-y-3">
                    <SlidersHorizontal
                      className="mx-auto text-heritage-ink/30"
                      size={32}
                    />
                    <h3 className="font-serif text-sm font-bold text-heritage-green">
                      No Fabric Swatches Found
                    </h3>
                    <p className="text-xs text-heritage-ink/60 max-w-md mx-auto font-sans">
                      We couldn't find any premium fabric rolls matching your
                      search query or color/material filters. Try resetting the
                      filters to explore our full selection of 50 materials.
                    </p>
                    <button
                      onClick={handleResetFabricFilters}
                      className="px-4 py-1.5 bg-heritage-green text-white rounded-xl text-xs font-semibold hover:bg-heritage-forest transition shadow-sm"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  paginatedFabrics.map((fabric) => (
                    <div
                      key={fabric?.code}
                      onClick={() => {
                        setZoomedFabric(fabric);
                        setShowFabricZoomModal(true);
                      }}
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-4 transition-all duration-300 cursor-zoom-in hover:-translate-y-1 ${
                        selectedFabric?.code === fabric?.code
                          ? "border-heritage-gold shadow-[0_0_15px_rgba(197,168,92,0.15)] bg-[#FFFCF6]"
                          : "border-[#E5E0D8] bg-[#FAFAF8] hover:shadow-lg hover:border-heritage-gold/50"
                      }`}
                    >
                      <div className="space-y-3">
                        {/* Interactive Color Box / Full Fabric Image */}
                        <div 
                          className="h-44 w-full rounded-lg relative overflow-hidden flex items-start justify-between p-2 select-none group border border-[#E5E0D8] bg-white shadow-sm"
                        >
                          {fabric.image ? (
                            <div className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-110">
                               <LazyFabricImage fabric={fabric} />
                            </div>
                          ) : (
                            <div
                              className="absolute inset-0 w-full h-full transition-transform duration-500 group-hover:scale-110"
                              style={{
                                background: `linear-gradient(135deg, ${fabric.colorHex}cc, ${fabric.colorHex}ff)`,
                              }}
                            />
                          )}
                          
                          <div className="absolute inset-0 bg-[radial-gradient(#C5A85C_1px,transparent_1px)] [background-size:12px_12px] opacity-[0.03]"></div>
                          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                          
                          <div className="relative z-10 flex flex-col items-start gap-1 pointer-events-none">
                              <span className="text-[10px] bg-white/95 backdrop-blur-sm border border-[#E5E0D8] font-bold px-2 py-0.5 rounded shadow-sm text-heritage-green font-mono">
                                {fabric?.code}
                              </span>
                              <span
                                className={`text-[9px] bg-white/95 backdrop-blur-sm border border-[#E5E0D8] font-bold px-1.5 py-0.5 rounded font-sans uppercase shadow-sm ${
                                  fabric.stockStatus === "OUT_OF_STOCK"
                                    ? "text-red-600"
                                    : fabric.stockStatus === "LOW_STOCK"
                                      ? "text-orange-600"
                                      : "text-heritage-gold"
                                }`}
                              >
                                {fabric.stockStatus.replace('_', ' ')}
                              </span>
                          </div>

                          {/* Hover Zoom Prompt */}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-20">
                             <div className="bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-lg text-[10px] font-bold text-heritage-green flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                               <ZoomIn size={12} />
                               <span>Click to Zoom</span>
                             </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 px-0.5">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-serif text-[13px] font-bold text-heritage-green leading-snug line-clamp-2">
                              {fabric.name}
                            </h4>
                            <span className="shrink-0 text-[9px] font-sans bg-[#F2EDE4] text-heritage-green font-semibold px-2 py-0.5 rounded border border-[#E5E0D8]">
                              {fabric.color}
                            </span>
                          </div>
                          <p className="text-[10px] text-heritage-ink/70 leading-relaxed h-8 line-clamp-2">
                            {fabric.description}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-[#E5E0D8] pt-3 flex justify-between items-center text-[10px] font-sans px-0.5">
                        <span className="text-heritage-ink/60 font-medium">Width: {fabric.width || "45 inches"}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomedFabric(fabric);
                              setShowFabricZoomModal(true);
                            }}
                            className="p-1.5 rounded bg-white text-heritage-green hover:bg-[#F2EDE4] transition-colors border border-[#E5E0D8] cursor-pointer shadow-sm"
                            title="Zoom Swatch Texture"
                          >
                            <ZoomIn size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFabric(fabric);
                            }}
                            className={`px-3 py-1.5 rounded text-[10px] font-bold transition-all duration-200 cursor-pointer select-none flex items-center gap-1 border shadow-sm ${
                              selectedFabric?.code === fabric?.code
                                ? "bg-heritage-gold text-white border-heritage-gold"
                                : "bg-white text-heritage-green border-[#E5E0D8] hover:border-heritage-gold hover:text-heritage-gold"
                            }`}
                          >
                            {selectedFabric?.code === fabric?.code && <Check size={12} />}
                            {selectedFabric?.code === fabric?.code ? "Selected" : "Select"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls */}
              {totalFabricPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-4 font-sans">
                  <button
                    onClick={() =>
                      setFabricPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={fabricPage === 1}
                    className="flex items-center justify-center gap-1 text-xs font-semibold px-3 min-h-[44px] rounded-xl border border-gray-200 hover:bg-gray-50 text-heritage-ink disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5">
                    {Array.from({ length: totalFabricPages }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setFabricPage(pageNum)}
                          className={`w-11 h-11 sm:w-8 sm:h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                            fabricPage === pageNum
                              ? "bg-heritage-green text-white shadow-sm"
                              : "border border-gray-200 hover:bg-gray-50 text-heritage-ink"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <span className="sm:hidden text-xs text-heritage-ink/60">
                    Page {fabricPage} of {totalFabricPages}
                  </span>

                  <button
                    onClick={() =>
                      setFabricPage((prev) =>
                        Math.min(prev + 1, totalFabricPages),
                      )
                    }
                    disabled={fabricPage === totalFabricPages}
                    className="flex items-center justify-center gap-1 text-xs font-semibold px-3 min-h-[44px] rounded-xl border border-gray-200 hover:bg-gray-50 text-heritage-ink disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Customize Accents */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 3 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Customize Garment Details
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Select lengths, pockets, embroideries, and accessories for your outfit.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <GarmentDetailSelector
                  selectedStyle={selectedStyle}
                  selectedGarment={selectedGarment}
                  designSelections={designSelections}
                  setDesignSelections={setDesignSelections}
                  hasLining={hasLining}
                  setHasLining={setHasLining}
                  currencySymbol={currencySymbol}
                  invalidGroups={invalidGroups}
                  setInvalidGroups={setInvalidGroups}
                />
              </div>
            </div>
          )}
          {currentStep === 4 && (
            <VirtualTryOnIntegrationCard
              selectedStyle={selectedStyle}
              selectedFabric={selectedFabric}
              selectedDesign={{
                ...designSelections,
                hasLining: liningEligible ? hasLining : false,
              }}
            />
          )}

          {/* STEP 5: Sizing Entry Mode Option (was STEP 4) */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-heritage-gold/10 pb-4 text-center sm:text-left">
                <div className="space-y-1 w-full">
                  <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                    Step 5 of 9
                  </span>
                  <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                    Choose Sizing Method
                  </h2>
                  <p className="text-xs text-heritage-ink/75 leading-relaxed">
                    We can estimate your sizes using your height and weight, or
                    you can enter your exact measurements.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMeasurementGuideModal(true)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-heritage-green bg-heritage-gold/15 hover:bg-heritage-gold/25 rounded-xl border border-heritage-gold/35 transition shadow-sm cursor-pointer select-none tracking-wider uppercase shrink-0"
                >
                  <Scissors
                    size={13}
                    className="text-heritage-gold animate-pulse"
                  />
                  <span>View Measurement Guide</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans text-xs">
                <div
                  onClick={handleSelectAiSizingMode}
                  className={`p-6 rounded-2xl border-2 cursor-pointer transition space-y-3 ${
                    sizingMode === "ai"
                      ? "border-heritage-gold bg-heritage-cream/40"
                      : "border-gray-150 bg-white hover:border-heritage-gold/40"
                  }`}
                >
                  <div className="h-10 w-10 rounded-xl bg-heritage-green/5 flex items-center justify-center">
                    <Sparkles className="text-heritage-gold" size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-heritage-green text-xs">
                      AI Fit Estimator
                    </h3>
                    <p className="text-[10px] text-heritage-ink/75 leading-relaxed mt-1">
                      Specify height, weight, build, age, and fit style
                      preference. Our algorithms derive recommended dimensions
                      instantly.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setSizingMode("manual")}
                  className={`p-6 rounded-2xl border-2 cursor-pointer transition space-y-3 ${
                    sizingMode === "manual"
                      ? "border-heritage-gold bg-heritage-cream/40"
                      : "border-gray-150 bg-white hover:border-heritage-gold/40"
                  }`}
                >
                  <div className="h-10 w-10 rounded-xl bg-heritage-green/5 flex items-center justify-center">
                    <Scissors className="text-heritage-gold" size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-heritage-green text-xs">
                      Manual Dimension Logging
                    </h3>
                    <p className="text-[10px] text-heritage-ink/75 leading-relaxed mt-1">
                      Directly provide individual neck, sleeve, shoulder, chest,
                      and waist measurements. Best for previous bespoke
                      profiles.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic Sub-form inside Step 5 depending on choice */}
              {sizingMode === "ai" ? (
                <div className="bg-heritage-cream/30 border border-heritage-gold/20 rounded-2xl p-5 space-y-5 text-xs font-sans">
                  <div>
                    <h4 className="font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                      AI Sizing Indicator Parameters
                    </h4>
                    <p className="text-[10px] text-heritage-ink/65 mt-0.5">
                      Enter your dimensions below. Our hybrid neural-heuristic
                      engine will formulate a master pattern matching expert
                      tailors in Lagos.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <label className="font-semibold text-heritage-ink/60">
                          Height (cm)
                        </label>
                        <span className="text-[8px] px-1.5 py-0.5 bg-red-50 text-red-700 font-extrabold uppercase tracking-wider rounded border border-red-200/55">
                          Crucial
                        </span>
                      </div>
                      <input
                        type="number"
                        value={height}
                        placeholder="e.g. 178"
                        onChange={(e) => {
                          const val = e.target.value;
                          setHeight(val === "" ? "" : parseInt(val));
                        }}
                        className="w-full px-3 py-1.5 bg-white border rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:ring-1 focus:ring-heritage-gold/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <label className="font-semibold text-heritage-ink/60">
                          Weight (kg)
                        </label>
                        <span className="text-[8px] px-1.5 py-0.5 bg-red-50 text-red-700 font-extrabold uppercase tracking-wider rounded border border-red-200/55">
                          Crucial
                        </span>
                      </div>
                      <input
                        type="number"
                        value={weight}
                        placeholder="e.g. 75"
                        onChange={(e) => {
                          const val = e.target.value;
                          setWeight(val === "" ? "" : parseInt(val));
                        }}
                        className="w-full px-3 py-1.5 bg-white border rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:ring-1 focus:ring-heritage-gold/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-heritage-ink/60 block">
                        Age{" "}
                        <span className="text-[9px] font-normal text-gray-400 italic">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="number"
                        value={age}
                        placeholder="e.g. 32"
                        onChange={(e) => {
                          const val = e.target.value;
                          setAge(val === "" ? "" : parseInt(val));
                        }}
                        className="w-full px-3 py-1.5 bg-white border rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:ring-1 focus:ring-heritage-gold/50"
                      />
                    </div>
                    <SelectField
                      label="Build"
                      value={bodyBuild}
                      onChange={(e) =>
                        setBodyBuild(
                          e.target.value as
                            "Slim" | "Average" | "Muscular" | "Broad",
                        )
                      }
                      options={[
                        { value: "Slim", label: "Slim" },
                        { value: "Average", label: "Average" },
                        { value: "Muscular", label: "Muscular" },
                        { value: "Broad", label: "Broad" },
                      ]}
                      className="!space-y-1 font-semibold"
                    />
                    <SelectField
                      label="Fit Preference"
                      value={fitPreference}
                      onChange={(e) =>
                        setFitPreference(
                          e.target.value as
                            "Slim/Executive" | "Standard" | "Relaxed",
                        )
                      }
                      options={[
                        { value: "Slim/Executive", label: "Executive Slim" },
                        { value: "Standard", label: "Standard Fit" },
                        { value: "Relaxed", label: "Relaxed Flow" },
                      ]}
                      className="!space-y-1 font-semibold"
                    />
                  </div>

                  {/* Comprehensive calculation explanation block */}
                  <div className="p-4 bg-white border border-heritage-gold/20 rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                      <span className="text-sm">📐</span>
                      <strong className="text-heritage-green text-xs font-serif uppercase tracking-wider">
                        How the AI Fit Estimator Works
                      </strong>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-heritage-ink/80 leading-relaxed">
                      <div className="space-y-1.5">
                        <h5 className="font-bold text-heritage-green flex items-center gap-1">
                          <span className="text-heritage-gold font-mono text-[9px] bg-heritage-gold/10 px-1.5 py-0.5 rounded">
                            STEP 1
                          </span>
                          Heuristic Baseline Scaling
                        </h5>
                        <p>
                          Our system converts your <strong>Height</strong> into
                          vertical pattern segments (trouser length, shirt
                          drape, sleeve) and uses <strong>Weight</strong> paired
                          with <strong>Body Build</strong> to estimate primary
                          body girths (neck, chest, waist, hips) based on
                          West-African bespoke tailoring tables.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <h5 className="font-bold text-heritage-green flex items-center gap-1">
                          <span className="text-heritage-gold font-mono text-[9px] bg-heritage-gold/10 px-1.5 py-0.5 rounded">
                            STEP 2
                          </span>
                          Bespoke Intelligence Refinement
                        </h5>
                        <p>
                          The baseline is securely submitted to a specialized
                          server-side <strong>Gemini 3.5 Sizing Model</strong>.
                          The AI acts as a master Lagosian draper to refine
                          physical ease, adjust lines for your{" "}
                          <strong>Fit Preference</strong>, and outputs
                          professional, cohesive pattern coordinates.
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-heritage-ink/65">
                      <p>
                        💡{" "}
                        <strong className="text-heritage-green">
                          Optimal Accuracy Guideline:
                        </strong>{" "}
                        Providing exact <strong>Height (cm)</strong> and{" "}
                        <strong>Weight (kg)</strong> yields a verified{" "}
                        <strong>98%+ fit accuracy</strong>. Leaving them blank
                        triggers general body group averages.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-heritage-cream/30 border border-heritage-gold/20 rounded-2xl p-5 space-y-4 text-xs font-sans">
                  <h4 className="font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                    Direct Sizing Specification
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Neck (in)", key: "neck" },
                      { label: "Shoulder (in)", key: "shoulder" },
                      { label: "Chest (in)", key: "chest" },
                      { label: "Waist (in)", key: "waist" },
                      { label: "Hip (in)", key: "hip" },
                      { label: "Sleeve (in)", key: "sleeve" },
                      { label: "Trouser Length (in)", key: "trouserLength" },
                    ].map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label className="font-semibold text-heritage-ink/60">
                          {field.label}
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={
                            measurements[
                              field.key as keyof Measurements
                            ] as number
                          }
                          onChange={(e) =>
                            setMeasurements((prev) => ({
                              ...prev,
                              [field.key]: parseFloat(e.target.value) || 0,
                            }))
                          }
                          className="w-full px-3 py-1.5 bg-white border rounded-lg text-xs font-bold text-heritage-green focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: AI Calibrated Dimensions View (Allows manual fine-tuning too!) (was STEP 5) */}
          {currentStep === 6 &&
            (() => {
              const unitLabel =
                (measurements.unit || "inch") === "inch" ? "in" : "cm";
              const isFemaleStyle = selectedStyle?.gender === "female";

              const coreFields = [
                {
                  label: "Neck",
                  key: "neck",
                  desc: "Up to collar bone (Round)",
                  multiplier: 0.25,
                  genderSpec: "Both",
                },
                {
                  label: "Shoulder",
                  key: "shoulder",
                  desc: "Shoulder width bone-to-bone",
                  multiplier: 0.27,
                  genderSpec: "Both",
                },
                {
                  label: "Chest",
                  key: "chest",
                  desc: "Borst Circumference",
                  multiplier: 0.67,
                  genderSpec: "Both",
                },
                {
                  label: "Waist",
                  key: "waist",
                  desc: "Tommy / Midsection Round",
                  multiplier: 0.64,
                  genderSpec: "Both",
                },
                {
                  label: "Hip",
                  key: "hip",
                  desc: "Trouser Hip / Butt Roundest point",
                  multiplier: 0.64,
                  genderSpec: "Both",
                },
                {
                  label: "Sleeve Length",
                  key: "sleeve",
                  desc: "Arm length shoulder-to-wrist",
                  multiplier: 0.36,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Length",
                  key: "trouserLength",
                  desc: "Waist-to-ankle or floor",
                  multiplier: 0.53,
                  genderSpec: "Both",
                },
              ];

              const shirtDressFields = [
                {
                  label: "Head",
                  key: "head",
                  desc: "Head Round (Round)",
                  multiplier: 0.33,
                  genderSpec: "Both",
                },
                {
                  label: "Sleeve Ankle",
                  key: "ankleCircumference",
                  desc: "Ankle Circumference for Long Sleeve",
                  multiplier: 0.13,
                  genderSpec: "Both",
                },
                {
                  label: "Shirt Length (Standard)",
                  key: "shirtLengthStandard",
                  desc: "Standard - Around Thigh Region",
                  multiplier: 0.43,
                  genderSpec: "Both",
                },
                {
                  label: "Shirt Length (Long)",
                  key: "shirtLengthLong",
                  desc: "Long - Up to Knee or Ankle",
                  multiplier: 0.55,
                  genderSpec: "Both",
                },
                {
                  label: "Bicep",
                  key: "bicep",
                  desc: "Round between elbow & shoulder",
                  multiplier: 0.19,
                  genderSpec: "Both",
                },
                {
                  label: "Elbow",
                  key: "elbow",
                  desc: "Elbow Round",
                  multiplier: 0.17,
                  genderSpec: "Both",
                },
                {
                  label: "Arm Hole",
                  key: "armHole",
                  desc: "Under around arm pit (Round)",
                  multiplier: 0.31,
                  genderSpec: "Both",
                },
                // Female-only fields
                {
                  label: "Under Borst",
                  key: "underBorst",
                  desc: "Under Borst Circumference",
                  femaleOnly: true,
                  genderSpec: "Ladies",
                },
                {
                  label: "Hip Circumference",
                  key: "hipCircumference",
                  desc: "Hip Circumference",
                  femaleOnly: true,
                  genderSpec: "Ladies",
                },
                {
                  label: "Square Neck Length",
                  key: "squareNeckLength",
                  desc: "Square shaped neck length",
                  femaleOnly: true,
                  genderSpec: "Ladies",
                },
                {
                  label: "Square Neck Width",
                  key: "squareNeckWidth",
                  desc: "Square shaped neck width",
                  femaleOnly: true,
                  genderSpec: "Ladies",
                },
                {
                  label: "Shoulder to Under Borst",
                  key: "shoulderToUnderBorst",
                  desc: "Shoulder to Under-Borst length",
                  femaleOnly: true,
                  genderSpec: "Ladies",
                },
              ].filter((f) => !f.femaleOnly || isFemaleStyle);

              const trouserFields = [
                {
                  label: "Trouser Waist",
                  key: "trouserWaist",
                  desc: "High starting waist (Ladies)",
                  multiplier: 0.59,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Hip",
                  key: "trouserHip",
                  desc: "Fullest part of hip (Round)",
                  multiplier: 0.64,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Thigh",
                  key: "trouserThigh",
                  desc: "Highest point of lap (Round)",
                  multiplier: 0.4,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Knee",
                  key: "trouserKnee",
                  desc: "Trouser Knee (Round)",
                  multiplier: 0.28,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Ankle-Horizontal",
                  key: "trouserAnkleHorizontal",
                  desc: "Ankle horizontal opening (Round)",
                  multiplier: 0.24,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Ankle-Diagonal",
                  key: "trouserAnkleDiagonal",
                  desc: "Diagonal from under-back of foot",
                  multiplier: undefined,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Waist-to-Hip",
                  key: "trouserWaistToHip",
                  desc: "Waist-to-hip length",
                  multiplier: 0.08,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Waist-to-Crotch Depth",
                  key: "trouserCrotchDepth",
                  desc: "Where trouser paths-away (Crotch)",
                  multiplier: 0.13,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Waist-to-Knee",
                  key: "trouserWaistToKnee",
                  desc: "Waist-to-knee length",
                  multiplier: 0.28,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Waist-to-Ankle",
                  key: "trouserWaistToAnkle",
                  desc: "Waist-to-ankle length",
                  multiplier: 0.53,
                  genderSpec: "Both",
                },
                {
                  label: "Trouser Waist-to-Floor",
                  key: "trouserWaistToFloor",
                  desc: "Waist-to-floor length (under-foot)",
                  multiplier: 0.55,
                  genderSpec: "Both",
                },
              ];

              const heightSegmentFields = [
                {
                  label: "Height 1: Head to Shoulder",
                  key: "heightHeadToShoulder",
                  desc: "Head to LowerNeck",
                  multiplier: 0.15,
                  genderSpec: "Both",
                },
                {
                  label: "Height 2: Shoulder to Waist",
                  key: "heightShoulderToWaist",
                  desc: "Shoulder to Waist length",
                  multiplier: 0.29,
                  genderSpec: "Both",
                },
                {
                  label: "Height 3: Head to Waist",
                  key: "heightHeadToWaist",
                  desc: "Head to Waist length",
                  multiplier: 0.44,
                  genderSpec: "Both",
                },
                {
                  label: "Height 4: Waist to Floor",
                  key: "heightWaistToFloor",
                  desc: "Waist to Floor (Under-foot)",
                  multiplier: 0.56,
                  genderSpec: "Both",
                },
              ];

              const gType = selectedGarment?.type.toLowerCase();
              const recommendUpper =
                gType.includes("shirt") ||
                gType.includes("set") ||
                gType.includes("gown") ||
                gType.includes("dress") ||
                fTypeRecommendUpper(selectedStyle?.id || "");
              const recommendLower =
                gType.includes("trouser") || gType.includes("set");

              function fTypeRecommendUpper(id: string) {
                return (
                  id.includes("senator") ||
                  id.includes("agbada") ||
                  id.includes("boubou") ||
                  id.includes("gown")
                );
              }

              const activeCustomer =
                currentUser && customers
                  ? customers.find(
                      (c) =>
                        c.email.toLowerCase() ===
                        currentUser.email?.toLowerCase(),
                    )
                  : null;
              const savedProfiles = activeCustomer?.measurementProfiles || [];

              if (isEstimating) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 px-6 bg-heritage-cream/10 border border-heritage-gold/20 rounded-3xl space-y-6 text-center">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-heritage-gold/20 border-t-heritage-gold animate-spin"></div>
                      <Sparkles
                        className="absolute inset-0 m-auto text-heritage-gold animate-pulse"
                        size={24}
                      />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-lg font-serif font-bold text-heritage-green">
                        Consulting Lagos Ateliers...
                      </h3>
                      <p className="text-xs text-heritage-ink/70 leading-relaxed font-sans">
                        Our Gemini Sizing Engine is parsing your body build
                        parameters to estimate collar drapes, cuff ratios, and
                        trouser layouts based on traditional Nigerian tailor
                        formulas.
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-heritage-gold/10 pb-4 text-center sm:text-left">
                    <div className="space-y-1 w-full">
                      <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                        Step 6 of 9
                      </span>
                      <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                        Confirm Your Sizes
                      </h2>
                      <p className="text-xs text-heritage-ink/75 leading-relaxed">
                        Check and adjust your measurements. These sizes will be
                        sent directly to our tailors in Lagos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMeasurementGuideModal(true)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-heritage-green bg-heritage-gold/15 hover:bg-heritage-gold/25 rounded-xl border border-heritage-gold/35 transition shadow-sm cursor-pointer select-none tracking-wider uppercase shrink-0"
                    >
                      <Scissors
                        size={13}
                        className="text-heritage-gold animate-pulse"
                      />
                      <span>View Measurement Guide</span>
                    </button>
                  </div>

                  {/* Sizing Passport Custom Storage & Reusability */}
                  {currentUser && activeCustomer && (
                    <div className="bg-heritage-cream/20 border border-heritage-gold/30 p-4 rounded-2xl space-y-3 font-sans shadow-sm">
                      <div className="flex items-center gap-2">
                        <Award
                          size={16}
                          className="text-heritage-gold shrink-0"
                        />
                        <h3 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
                          Bespoke Sizing Passports
                        </h3>
                      </div>
                      <p className="text-[10px] text-heritage-ink/75 leading-relaxed">
                        Store multiple custom fitting profiles (such as ladies'
                        underBorst, custom head styles, or relaxed/slim
                        variations) directly in your customer account.
                      </p>

                      {savedProfiles.length > 0 && (
                        <div className="space-y-1">
                          <SelectField
                            label="One-Click Retrieve Saved Sizing:"
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val) {
                                const found = savedProfiles.find(
                                  (p) => p.id === val,
                                );
                                if (found) {
                                  setMeasurements(found.measurements);
                                  setSaveProfileSuccess(
                                    `Applied sizing passport "${found.name}"!`,
                                  );
                                  setTimeout(
                                    () => setSaveProfileSuccess(""),
                                    3000,
                                  );
                                }
                              }
                            }}
                            defaultValue=""
                            options={[
                              {
                                value: "",
                                label: "-- Apply saved passport --",
                              },
                              ...savedProfiles.map((p) => ({
                                value: p.id,
                                label: `${p.name} (Saved: ${new Date(p.createdAt).toLocaleDateString()})`,
                              })),
                            ]}
                          />
                        </div>
                      )}

                      <div className="space-y-1.5 pt-1 border-t border-heritage-gold/10">
                        <label className="text-[9px] uppercase font-mono font-bold text-heritage-gold tracking-wider block">
                          Save Current Sizing to Passport:
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. My Premium Agbada Fit, Wife's Buba Fit"
                            value={newProfileName}
                            onChange={(e) => setNewProfileName(e.target.value)}
                            className="flex-1 text-xs p-2 rounded-xl border border-heritage-gold/20 bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newProfileName.trim()) return;
                              const updated = [
                                ...(activeCustomer.measurementProfiles || []),
                              ];
                              const newProf: NamedMeasurementProfile = {
                                id: `PROF-${Date.now()}`,
                                name: newProfileName.trim(),
                                createdAt: new Date().toISOString(),
                                measurements: { ...measurements },
                              };
                              updated.push(newProf);

                              if (setCustomers) {
                                setCustomers((prev) =>
                                  prev.map((c) => {
                                    if (
                                      c.email.toLowerCase() ===
                                      activeCustomer.email.toLowerCase()
                                    ) {
                                      return {
                                        ...c,
                                        measurementProfiles: updated,
                                        measurementProfile: { ...measurements },
                                      };
                                    }
                                    return c;
                                  }),
                                );
                              }

                              setNewProfileName("");
                              setSaveProfileSuccess(
                                `Saved sizing passport "${newProf.name}" successfully!`,
                              );
                              setTimeout(() => setSaveProfileSuccess(""), 4000);
                            }}
                            className="bg-heritage-green text-white text-[10px] font-bold px-3 py-2 rounded-xl hover:bg-heritage-green/90 transition shadow-sm shrink-0"
                          >
                            Save New
                          </button>
                        </div>
                      </div>

                      {saveProfileSuccess && (
                        <p className="text-[10px] text-emerald-700 font-medium bg-emerald-50/50 px-2.5 py-1.5 rounded-lg border border-emerald-100/50 flex items-center gap-1">
                          <Check size={12} /> {saveProfileSuccess}
                        </p>
                      )}
                    </div>
                  )}

                  {sizingMode === "ai" && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex flex-col gap-1.5 text-xs font-sans">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className="text-emerald-700 shrink-0 animate-bounce"
                          size={16}
                        />
                        <strong className="text-emerald-950">
                          {estimationSource === "gemini"
                            ? "Calibrated with Gemini Pro AI"
                            : "Traditional Heuristics Applied"}
                        </strong>
                      </div>
                      <p className="text-[11px] leading-relaxed opacity-90">
                        {estimationSource === "gemini"
                          ? `Gemini AI has calibrated your standard dimensions based on your ${bodyBuild} build and ${fitPreference} fit. Every value has been tailored to Lagosian drape standards.`
                          : `Standard tailors' dimensions generated based on your ${bodyBuild} build and ${fitPreference} fit.`}
                      </p>
                    </div>
                  )}

                  {/* Unit of Measurement Toggle */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-heritage-cream/30 border border-heritage-gold/20 p-4 rounded-2xl font-sans">
                    <div>
                      <h3 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
                        Measurement Unit Standard
                      </h3>
                      <p className="text-[10px] text-heritage-ink/65 mt-0.5">
                        Toggle to convert values between Inches and Centimeters
                        instantly.
                      </p>
                    </div>
                    <div className="flex gap-1 p-1 bg-white border rounded-xl text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => handleUnitToggle("inch")}
                        className={`px-3 py-1 rounded-lg transition ${
                          (measurements.unit || "inch") === "inch"
                            ? "bg-heritage-green text-white shadow-sm"
                            : "text-heritage-green hover:bg-heritage-cream/10"
                        }`}
                      >
                        Inches (in)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUnitToggle("cm")}
                        className={`px-3 py-1 rounded-lg transition ${
                          (measurements.unit || "inch") === "cm"
                            ? "bg-heritage-green text-white shadow-sm"
                            : "text-heritage-green hover:bg-heritage-cream/10"
                        }`}
                      >
                        Centimeters (cm)
                      </button>
                    </div>
                  </div>

                  {/* Accordion List */}
                  <div className="space-y-4 font-sans text-xs">
                    {/* Category 1: Core Silhouette */}
                    <div className="border border-gray-150 rounded-2xl bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAccordion(
                            activeAccordion === "core" ? "" : "core",
                          )
                        }
                        className="w-full px-5 py-4 flex items-center justify-between font-bold text-heritage-green text-left bg-heritage-cream/10 border-b border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👕</span>
                          <div>
                            <span className="text-sm font-serif">
                              1. Primary Silhouette Dimensions
                            </span>
                            <span className="block text-[9px] font-normal text-heritage-ink/60 mt-0.5">
                              Essential baseline tailoring metrics
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-heritage-green/10 text-heritage-green rounded text-[9px] uppercase tracking-wider font-bold">
                            Required
                          </span>
                          <span className="text-lg">
                            {activeAccordion === "core" ? "−" : "+"}
                          </span>
                        </div>
                      </button>
                      {activeAccordion === "core" && (
                        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white">
                          {coreFields.map((field) => {
                            const val =
                              measurements[field.key as keyof Measurements];
                            return (
                              <div
                                key={field.key}
                                className="space-y-1 p-3 bg-heritage-cream/10 border border-heritage-gold/10 rounded-xl flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <label className="block font-semibold text-heritage-ink/80 text-[11px] leading-tight">
                                      {field.label} ({unitLabel})
                                    </label>
                                    {field.multiplier && (
                                      <span className="shrink-0 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/30 px-1 py-0.5 rounded text-[8px] font-mono font-bold">
                                        {field.multiplier}x
                                      </span>
                                    )}
                                  </div>
                                  <span className="block text-[9px] text-heritage-ink/50 leading-tight pb-1.5">
                                    {field.desc}
                                  </span>
                                </div>
                                <div className="relative mt-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={(val as number) || ""}
                                    onChange={(e) =>
                                      setMeasurements((prev) => ({
                                        ...prev,
                                        [field.key]:
                                          parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold/50"
                                  />
                                  {field.genderSpec && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-heritage-ink/40 font-semibold uppercase">
                                      {field.genderSpec}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Category 2: Advanced Shirts/Dress Specs */}
                    <div className="border border-gray-150 rounded-2xl bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAccordion(
                            activeAccordion === "shirt" ? "" : "shirt",
                          )
                        }
                        className="w-full px-5 py-4 flex items-center justify-between font-bold text-heritage-green text-left bg-heritage-cream/10 border-b border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🪡</span>
                          <div>
                            <span className="text-sm font-serif">
                              2. Advanced Upper Body Specs (Shirt / Dress)
                            </span>
                            <span className="block text-[9px] font-normal text-heritage-ink/60 mt-0.5">
                              Bespoke curves & lengths for perfect drapes
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {recommendUpper && (
                            <span className="px-2 py-0.5 bg-heritage-gold/15 text-heritage-forest rounded text-[9px] uppercase tracking-wider font-bold">
                              Recommended
                            </span>
                          )}
                          <span className="text-lg">
                            {activeAccordion === "shirt" ? "−" : "+"}
                          </span>
                        </div>
                      </button>
                      {activeAccordion === "shirt" && (
                        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white">
                          {shirtDressFields.map((field) => {
                            const val =
                              measurements[field.key as keyof Measurements];
                            return (
                              <div
                                key={field.key}
                                className="space-y-1 p-3 bg-heritage-cream/10 border border-heritage-gold/10 rounded-xl flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <label className="block font-semibold text-heritage-ink/80 text-[11px] leading-tight">
                                      {field.label} ({unitLabel})
                                    </label>
                                    {field.multiplier && (
                                      <span className="shrink-0 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/30 px-1 py-0.5 rounded text-[8px] font-mono font-bold">
                                        {field.multiplier}x
                                      </span>
                                    )}
                                  </div>
                                  <span className="block text-[9px] text-heritage-ink/50 leading-tight pb-1.5">
                                    {field.desc}
                                  </span>
                                </div>
                                <div className="relative mt-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={(val as number) || ""}
                                    placeholder="Auto-calculated"
                                    onChange={(e) =>
                                      setMeasurements((prev) => ({
                                        ...prev,
                                        [field.key]:
                                          parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold/50"
                                  />
                                  {field.genderSpec && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-heritage-ink/40 font-semibold uppercase">
                                      {field.genderSpec}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Category 3: Advanced Trouser Specs */}
                    <div className="border border-gray-150 rounded-2xl bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAccordion(
                            activeAccordion === "trouser" ? "" : "trouser",
                          )
                        }
                        className="w-full px-5 py-4 flex items-center justify-between font-bold text-heritage-green text-left bg-heritage-cream/10 border-b border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👖</span>
                          <div>
                            <span className="text-sm font-serif">
                              3. Advanced Lower Body Specs (Trousers / Pants)
                            </span>
                            <span className="block text-[9px] font-normal text-heritage-ink/60 mt-0.5">
                              Crotch depths, knee circles & tapering parameters
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {recommendLower && (
                            <span className="px-2 py-0.5 bg-heritage-gold/15 text-heritage-forest rounded text-[9px] uppercase tracking-wider font-bold">
                              Recommended
                            </span>
                          )}
                          <span className="text-lg">
                            {activeAccordion === "trouser" ? "−" : "+"}
                          </span>
                        </div>
                      </button>
                      {activeAccordion === "trouser" && (
                        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white">
                          {trouserFields.map((field) => {
                            const val =
                              measurements[field.key as keyof Measurements];
                            return (
                              <div
                                key={field.key}
                                className="space-y-1 p-3 bg-heritage-cream/10 border border-heritage-gold/10 rounded-xl flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <label className="block font-semibold text-heritage-ink/80 text-[11px] leading-tight">
                                      {field.label} ({unitLabel})
                                    </label>
                                    {field.multiplier && (
                                      <span className="shrink-0 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/30 px-1 py-0.5 rounded text-[8px] font-mono font-bold">
                                        {field.multiplier}x
                                      </span>
                                    )}
                                  </div>
                                  <span className="block text-[9px] text-heritage-ink/50 leading-tight pb-1.5">
                                    {field.desc}
                                  </span>
                                </div>
                                <div className="relative mt-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={(val as number) || ""}
                                    placeholder="Auto-calculated"
                                    onChange={(e) =>
                                      setMeasurements((prev) => ({
                                        ...prev,
                                        [field.key]:
                                          parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold/50"
                                  />
                                  {field.genderSpec && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-heritage-ink/40 font-semibold uppercase">
                                      {field.genderSpec}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Category 4: Height Segment Estimations */}
                    <div className="border border-gray-150 rounded-2xl bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveAccordion(
                            activeAccordion === "heights" ? "" : "heights",
                          )
                        }
                        className="w-full px-5 py-4 flex items-center justify-between font-bold text-heritage-green text-left bg-heritage-cream/10 border-b border-gray-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📏</span>
                          <div>
                            <span className="text-sm font-serif">
                              4. Segment Height Benchmarks (Optional)
                            </span>
                            <span className="block text-[9px] font-normal text-heritage-ink/60 mt-0.5">
                              Vertical frame indicators for proportion balancing
                            </span>
                          </div>
                        </div>
                        <span className="text-lg">
                          {activeAccordion === "heights" ? "−" : "+"}
                        </span>
                      </button>
                      {activeAccordion === "heights" && (
                        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white">
                          {heightSegmentFields.map((field) => {
                            const val =
                              measurements[field.key as keyof Measurements];
                            return (
                              <div
                                key={field.key}
                                className="space-y-1 p-3 bg-heritage-cream/10 border border-heritage-gold/10 rounded-xl flex flex-col justify-between"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <label className="block font-semibold text-heritage-ink/80 text-[11px] leading-tight">
                                      {field.label} ({unitLabel})
                                    </label>
                                    {field.multiplier && (
                                      <span className="shrink-0 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/30 px-1 py-0.5 rounded text-[8px] font-mono font-bold">
                                        {field.multiplier}x
                                      </span>
                                    )}
                                  </div>
                                  <span className="block text-[9px] text-heritage-ink/50 leading-tight pb-1.5">
                                    {field.desc}
                                  </span>
                                </div>
                                <div className="relative mt-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    value={(val as number) || ""}
                                    placeholder="Auto-calculated"
                                    onChange={(e) =>
                                      setMeasurements((prev) => ({
                                        ...prev,
                                        [field.key]:
                                          parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-heritage-green focus:outline-none focus:border-heritage-gold/50"
                                  />
                                  {field.genderSpec && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-heritage-ink/40 font-semibold uppercase">
                                      {field.genderSpec}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-heritage-cream/25 border border-heritage-gold/20 rounded-2xl flex items-start gap-3 text-xs leading-relaxed">
                    <span className="text-heritage-gold text-sm">💡</span>
                    <div>
                      <strong className="text-heritage-green">
                        Lagos Master Tailor Professional Tip:
                      </strong>{" "}
                      If you don't know some of these advanced values, don't
                      worry! We pre-populate them using Nigerian traditional
                      style formulas optimized for your {bodyBuild} frame.
                      Adjust any numbers you know, and we'll handle the rest!
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* STEP 7: Logistics Coordinates (was STEP 6) */}
          {currentStep === 7 && (
            <div className="space-y-6 font-sans">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 7 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Final Delivery Details
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Choose pickup or delivery after your order reaches the
                  Netherlands.
                </p>
              </div>

                            {/* Order Context Information - Read Only (Controls Bypassed) */}
              <div className="bg-heritage-cream/30 p-4 border border-heritage-gold/20 rounded-2xl space-y-2 text-left">
                <span className="text-[10px] uppercase font-bold text-heritage-gold tracking-wider block">
                  Delivery &amp; Batch Route (Locked)
                </span>
                
                {routingDecision && (
                  <>
                    <div className={`border rounded-xl p-3.5 mb-3 text-xs space-y-1 ${routingDecision.mode === 'COMMUNITY_OPEN' ? 'bg-heritage-green/10 border-heritage-green/20 text-heritage-green' : 'bg-heritage-gold/10 border-heritage-gold/20 text-heritage-ink'}`}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle size={14} />
                        <span>{routingPresentation.title.toUpperCase()}</span>
                      </div>
                      <p className="leading-relaxed text-[11px] font-medium">
                        {routingPresentation.submissionMessage}
                      </p>
                    </div>
                    
                    <p className="text-xs text-heritage-ink/80 leading-relaxed font-medium">
                      Your order route is governed by our centralized capacity and routing engine.
                    </p>
                    
                    <div className="text-[11px] bg-white p-3 rounded-xl border border-gray-150 font-sans space-y-1.5 text-heritage-ink">
                      <div>
                        <strong>Selected Path:</strong>{" "}
                        {routingDecision.mode === "COMMUNITY_OPEN"
                          ? `Active Community Cohort (${routingPresentation.currentBatchSummary?.name || 'Veldhoven Campus Batch'})`
                          : batchType === "alone"
                            ? "Individual Priority Order"
                            : batchType === "personalized"
                              ? "Personalized Custom Batch"
                              : "Pending Routing Decision"}
                      </div>
                      <div>
                        <strong>Delivery Schedule:</strong>{" "}
                        {batchType === "alone"
                          ? "2-3 Weeks (Express Air Priority)"
                          : "Coordinated Collective Delivery"}
                      </div>
                      <div>
                        <strong>Destination:</strong>{" "}
                        {!deliveryMethod
                          ? "Select below"
                          : deliveryMethod === "PICKUP"
                            ? businessSettings.productionSettings.defaultPickupLocation
                            : pricing.finalMileShipping?.zoneLabel ||
                              "Complete delivery address"}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
                  Choose Final Delivery
                </h4>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Final delivery method">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("PICKUP")}
                    aria-pressed={deliveryMethod === "PICKUP"}
                    className={`min-h-[52px] border px-3 py-2 text-xs font-bold transition ${
                      deliveryMethod === "PICKUP"
                        ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                        : "border-gray-200 bg-white text-heritage-ink hover:border-heritage-gold"
                    }`}
                  >
                    Pickup · {currencySymbol}0.00
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("DELIVERY")}
                    aria-pressed={deliveryMethod === "DELIVERY"}
                    className={`min-h-[52px] border px-3 py-2 text-xs font-bold transition ${
                      deliveryMethod === "DELIVERY"
                        ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                        : "border-gray-200 bg-white text-heritage-ink hover:border-heritage-gold"
                    }`}
                  >
                    Deliver to Address
                  </button>
                </div>

                {deliveryMethod === "PICKUP" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-heritage-gold/20 bg-heritage-cream/30 p-4 text-xs">
                    <div>
                      <span className="block text-[9px] font-bold uppercase text-heritage-ink/50">
                        Pickup Location
                      </span>
                      <strong className="text-heritage-green">
                        {businessSettings.productionSettings.defaultPickupLocation}
                      </strong>
                    </div>
                    <SelectField
                      label="Preferred Pickup Window"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      options={[
                        {
                          value: "Monday Morning (08:00 - 12:00)",
                          label: "Monday Morning (08:00 - 12:00)",
                        },
                        {
                          value: "Monday Afternoon (13:00 - 17:00)",
                          label: "Monday Afternoon (13:00 - 17:00)",
                        },
                        {
                          value: "Wednesday Morning (08:00 - 12:00)",
                          label: "Wednesday Morning (08:00 - 12:00)",
                        },
                        {
                          value: "Wednesday Afternoon (13:00 - 17:00)",
                          label: "Wednesday Afternoon (13:00 - 17:00)",
                        },
                      ]}
                      className="!space-y-1"
                    />
                  </div>
                )}

                {deliveryMethod === "DELIVERY" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-4 text-xs">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block font-bold text-heritage-green">
                        Address Line 1
                      </label>
                      <input
                        type="text"
                        placeholder="Street name and building number"
                        value={deliveryAddress.addressLine1}
                        onChange={(e) =>
                          setDeliveryAddress((previous) => ({
                            ...previous,
                            addressLine1: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block font-bold text-heritage-green">
                        Address Line 2 (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Apartment, suite, floor or unit"
                        value={deliveryAddress.addressLine2 || ""}
                        onChange={(e) =>
                          setDeliveryAddress((previous) => ({
                            ...previous,
                            addressLine2: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-bold text-heritage-green">
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="Eindhoven"
                        value={deliveryAddress.city}
                        onChange={(e) =>
                          setDeliveryAddress((previous) => ({
                            ...previous,
                            city: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block font-bold text-heritage-green">
                        Postal Code
                      </label>
                      <input
                        type="text"
                        placeholder="5611"
                        value={deliveryAddress.postalCode}
                        onChange={(e) =>
                          setDeliveryAddress((previous) => ({
                            ...previous,
                            postalCode: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl font-mono focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="block font-bold text-heritage-green">
                        Country or Region
                      </label>
                      <select
                        value={deliveryAddress.countryCode}
                        onChange={(e) =>
                          setDeliveryAddress((previous) => ({
                            ...previous,
                            countryCode: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                      >
                        <option value="">Select country or region</option>
                        {FINAL_MILE_COUNTRY_OPTIONS.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.label}
                            {country.requiresManualQuote
                              ? " · Quote required"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div
                  className={`border px-4 py-3 text-xs ${
                    pricing.finalMileShipping?.status === "READY"
                      ? "border-heritage-green/20 bg-heritage-green/5 text-heritage-green"
                      : pricing.finalMileShipping?.status ===
                          "MANUAL_QUOTE_REQUIRED"
                        ? "border-amber-300 bg-amber-50 text-amber-900"
                        : "border-gray-200 bg-gray-50 text-heritage-ink/60"
                  }`}
                >
                  {pricing.finalMileShipping?.status === "READY" ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold">
                        {pricing.finalMileShipping.method === "PICKUP"
                          ? `${pricing.finalMileShipping.pickupLocation} pickup`
                          : `Eindhoven → ${pricing.finalMileShipping.zoneLabel} (${pricing.finalMileShipping.weightBand})`}
                      </span>
                      <strong className="font-mono">
                        {currencySymbol}
                        {(pricing.finalMileShipping.priceEur ?? 0).toFixed(2)}
                      </strong>
                    </div>
                  ) : pricing.finalMileShipping?.status ===
                    "MANUAL_QUOTE_REQUIRED" ? (
                    <div>
                      <strong className="block">Shipping quote required</strong>
                      <span>
                        {pricing.finalMileShipping.manualQuoteReason}
                      </span>
                    </div>
                  ) : (
                    <span className="font-semibold">
                      Final delivery:{" "}
                      {deliveryMethod === "DELIVERY"
                        ? "Complete the address above"
                        : "Select pickup or delivery"}
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t pt-4 space-y-4">
                <h4 className="text-xs font-bold text-heritage-green uppercase tracking-wider">
                  Contact Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <label className="block font-bold text-heritage-green">
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="Xavier E."
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-heritage-gold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-heritage-green">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="name@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-heritage-gold font-mono"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block font-bold text-heritage-green">
                      Mobile Phone (for delivery updates)
                    </label>
                    <input
                      type="text"
                      placeholder="+31 6 1234 5678"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full min-h-[44px] px-3 bg-white border border-gray-200 rounded-xl font-bold focus:outline-none focus:ring-1 focus:ring-heritage-gold font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: Special Directives & Leftover choice (was STEP 7) */}
          {currentStep === 8 && (
            <div className="space-y-6 font-sans">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 8 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Special Instructions
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Add any special requests for your order below.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-2">
                  <label className="block font-bold text-heritage-green">
                    Embroidery or Seam Detailing Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Please use soft subtle gold thread for Senator collar highlights..."
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    className="w-full p-4 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-heritage-gold text-xs"
                  ></textarea>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-heritage-green">
                    Leftover Fabric Return Preference
                  </label>
                  <div className="space-y-2">
                    {[
                      "Return leftover fabric pieces with garment (for standard custom caps/masks)",
                      "Donate leftover fabric segments to local community sewing training centers in Lagos",
                    ].map((choice) => (
                      <label
                        key={choice}
                        onClick={() => setLeftoverFabricChoice(choice)}
                        className={`p-3 border rounded-xl flex items-center gap-3 cursor-pointer transition ${
                          leftoverFabricChoice === choice
                            ? "border-heritage-gold bg-heritage-cream/40 font-bold text-heritage-green"
                            : "border-gray-200 bg-white hover:bg-heritage-cream/10"
                        }`}
                      >
                        <input
                          type="radio"
                          name="leftover"
                          checked={leftoverFabricChoice === choice}
                          onChange={() => {}}
                          className="text-heritage-green focus:ring-heritage-gold rounded-full h-4 w-4"
                        />
                        <span>{choice}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 9: Premium Review & Place Order (was STEP 8) */}
          {currentStep === 9 && (
            <div className="space-y-6 font-sans">
              <div className="space-y-1 text-center sm:text-left">
                <span className="text-[10px] uppercase font-mono text-heritage-gold tracking-wider block">
                  Step 9 of 9
                </span>
                <h2 className="text-lg sm:text-2xl font-serif font-bold text-heritage-green">
                  Review Your Order
                </h2>
                <p className="text-xs text-heritage-ink/75 leading-relaxed">
                  Check your selected options and total price before placing
                  your order.
                </p>
              </div>

              {/* Order bill overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs leading-relaxed border-t border-b py-6 border-heritage-beige/35">
                <div className="space-y-3">
                  <h4 className="font-serif font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                    Bespoke Styling Details
                  </h4>
                  <ul className="space-y-1 bg-heritage-cream/40 p-4 rounded-xl border">
                    <li>
                      Style template: <strong>{selectedStyle?.name || "Pending"}</strong>
                    </li>
                    <li>
                      Selected Fabric:{" "}
                      <strong>
                        {selectedFabric?.name || "Pending"} ({selectedFabric?.code})
                      </strong>
                    </li>
                    {pricing.includesFabricAndSewing && (
                      <>
                        <li>
                          Selected Clothing Price:{" "}
                          <strong>
                            {currencySymbol}{pricing.clothingPrice.toFixed(2)}
                          </strong>
                        </li>
                        <li className="font-semibold text-heritage-green/70">
                          Includes fabric and sewing costs
                        </li>
                      </>
                    )}
                    {pricing.fabricSewingCost > 0 && (
                      <li>
                        Fabric Sewing Cost: <strong>+{currencySymbol}{pricing.fabricSewingCost.toFixed(2)}</strong>
                      </li>
                    )}
                    <li>
                      Garment Cut: <strong>{selectedGarment?.type || "Pending"}</strong>
                    </li>
                    {isAmbiguous && (
                      <li>
                        Lower Garment Type:{" "}
                        <strong className="uppercase">
                          {designSelections.lowerGarmentType === "trousers"
                            ? "Trouser"
                            : designSelections.lowerGarmentType === "skirt"
                            ? "Skirt"
                            : "Pending"}
                        </strong>
                      </li>
                    )}
                    <GarmentDetailSummaryItems
                      designSelections={designSelections}
                      isLi={true}
                      currencySymbol={currencySymbol}
                      catalog={customDetailCatalog}
                      decorativeFeatures={pricing.decorativeFeatures}
                      accessories={pricing.traditionalAccessories}
                      excludeClothingPriceSelections={
                        pricing.includesFabricAndSewing
                      }
                      style={selectedStyle}
                      garment={selectedGarment}
                    />
                    {pricing.constructionSewingCost > 0 && (
                      <li>
                        Construction Sewing Cost: <strong>+{currencySymbol}{pricing.constructionSewingCost.toFixed(2)}</strong>
                      </li>
                    )}
                    {liningEligible && hasLining && !hasCatalogDressLining && (
                      <li>
                        Included Extra: <strong>Inner Lining/Net (L5)</strong> <span className="text-heritage-gold ml-1">(+{currencySymbol}10.00)</span>
                      </li>
                    )}
                  </ul>
                </div>

                <div className="space-y-3">
                  <h4 className="font-serif font-bold text-heritage-green uppercase tracking-wider text-[10px]">
                    Recipient & Sizing Passport
                  </h4>
                  <ul className="space-y-1 bg-heritage-cream/40 p-4 rounded-xl border">
                    <li>
                      Full Name: <strong>{customerName}</strong>
                    </li>
                    <li>
                      Corporate Mail:{" "}
                      <strong>{customerEmail || "Not provided"}</strong>
                    </li>
                    <li>
                      Mobile Number: <strong>{customerPhone}</strong>
                    </li>
                    {routingDecision?.currentBatch && routingDecision.mode !== "COMMUNITY_OPEN" && (
                      <li className="text-heritage-ink/70">
                        Production Group:{" "}
                        <strong className="text-heritage-gold">
                          {routingDecision.currentBatch.name} (Closed)
                        </strong>
                      </li>
                    )}
                    <li>
                      Your Order Route:{" "}
                      <strong className="text-heritage-gold">
                        {batchType === "community"
                          ? (ctx.batchName || "Community Batch")
                          : batchType === "alone"
                            ? "Individual Order (Home Courier)"
                            : batchType === "personalized"
                              ? `Personalized Group (${personalizedGroupLabel})`
                              : selectedBatchName}
                      </strong>
                    </li>
                    <li>
                      Anatomical Fit:{" "}
                      <strong>
                        {bodyBuild} ({fitPreference})
                      </strong>
                    </li>
                    <li>
                      Measurement Unit:{" "}
                      <strong>
                        {(measurements.unit || "inch") === "cm"
                          ? "Centimeters (cm)"
                          : "Inches (in)"}
                      </strong>
                    </li>
                    <li>
                      Calibrated Neck/Shoulder:{" "}
                      <strong>
                        {measurements.neck}
                        {(measurements.unit || "inch") === "cm"
                          ? "cm"
                          : '"'} / {measurements.shoulder}
                        {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                      </strong>
                    </li>
                    <li>
                      Calibrated Chest/Waist:{" "}
                      <strong>
                        {measurements.chest}
                        {(measurements.unit || "inch") === "cm"
                          ? "cm"
                          : '"'} / {measurements.waist}
                        {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                      </strong>
                    </li>
                    <li>
                      Calibrated Hip/Sleeve:{" "}
                      <strong>
                        {measurements.hip}
                        {(measurements.unit || "inch") === "cm"
                          ? "cm"
                          : '"'} / {measurements.sleeve}
                        {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                      </strong>
                    </li>
                    <li>
                      Calibrated Trouser Length:{" "}
                      <strong>
                        {measurements.trouserLength}
                        {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                      </strong>
                    </li>
                    {measurements.head ? (
                      <li>
                        Calibrated Head Cap Size:{" "}
                        <strong>
                          {measurements.head}
                          {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                        </strong>
                      </li>
                    ) : null}
                    {selectedStyle?.gender === "female" &&
                    measurements.underBorst ? (
                      <li>
                        Calibrated Under-Bust Size:{" "}
                        <strong>
                          {measurements.underBorst}
                          {(measurements.unit || "inch") === "cm" ? "cm" : '"'}
                        </strong>
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-start gap-3 text-xs">
                <Shield
                  className="text-emerald-700 shrink-0 mt-0.5"
                  size={16}
                />
                <p>
                  By completing the checkout simulation, you authorize logging
                  this order into the{" "}
                  <strong>
                    {batchType === "community"
                      ? ctx.batchName
                      : batchType === "alone"
                        ? "Individual Sourcing & Direct Delivery Queue"
                        : batchType === "personalized"
                          ? `Personalized Group (${personalizedGroupLabel})`
                          : selectedBatchName}
                  </strong>{" "}
                  registry. Sourcing starts immediately.
                </p>
              </div>
            </div>
          )}

          {/* Stepper Footer Controls */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-100 select-none">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="flex items-center gap-1.5 hover:text-heritage-gold transition text-xs font-bold uppercase py-2 text-heritage-green min-h-[44px] px-2 sm:px-4"
              >
                <ArrowLeft size={14} /> {journey.stepperPreviousLabel}
              </button>
            ) : (
              <div></div>
            )}

            {currentStep < 9 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="bg-heritage-green text-white hover:bg-heritage-gold hover:text-heritage-forest transition min-h-[44px] px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                {journey.stepperNextLabel} <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                id="btn-submit-bespoke-order"
                onClick={handleAddToCartAction}
                className="bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition min-h-[44px] px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                {journey.stepperSubmitLabel} <Check size={14} />
              </button>
            )}
          </div>
        </div>
        {/* RIGHT COLUMN: Real-time billing estimation block */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-3xl border border-heritage-gold/25 bg-white p-6 shadow-sm space-y-6">
            <div className="border-b pb-3 border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif">
                Live Price Summary
              </h3>
              <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                Code:{" "}
                {selectedPriceCode === "AUTO"
                  ? getAutoDetectedPriceCode()
                  : selectedPriceCode}
              </span>
            </div>

            <div className="space-y-2 text-xs font-sans">
              {selectedFabric && (
                <>
                  <div className="flex justify-between items-center text-heritage-ink/70">
                    <span>Fabric Type: {getNormalizedFabricName(selectedFabric.category || selectedFabric.name || "")}</span>
                  </div>
                  {pricing.includesFabricAndSewing ? (
                    <div className="rounded-lg border border-heritage-gold/20 bg-heritage-cream/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-heritage-ink/80">
                        <span className="font-semibold">Selected Clothing Price:</span>
                        <span className="font-mono font-bold text-heritage-green">
                          {currencySymbol}{pricing.clothingPrice.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-heritage-green/70">
                        Includes fabric and sewing costs
                      </p>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-heritage-ink/70">
                      <span>Fabric Price:</span>
                      <span className="font-semibold text-heritage-green">
                        {selectedFabricPrice !== null
                          ? `${currencySymbol}${selectedFabricPrice.toFixed(2)}`
                          : "Pricing unavailable"}
                      </span>
                    </div>
                  )}
                  {pricing.fabricPricingError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">
                      {pricing.fabricPricingError}
                    </div>
                  )}
                  {pricing.fabricSewingCost > 0 && (
                    <div className="flex justify-between items-center text-heritage-ink/70">
                      <span>Fabric Sewing Cost:</span>
                      <span className="font-semibold text-heritage-green">
                        +{currencySymbol}
                        {pricing.fabricSewingCost.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {selectedFabric && (() => {
                const supportedGarmentGroups = selectedStyle
                  ? getSupportedCustomDetailGroups(selectedStyle, selectedGarment)
                  : [];
                return getGarmentDetailsBreakdown(designSelections, customDetailCatalog)
                  .filter(
                    (item) =>
                      (!pricing.includesFabricAndSewing ||
                       !isClothingPriceSelectionGroup(item.selectionGroup) ||
                       !supportedGarmentGroups.includes(item.garmentGroup)) &&
                      item.price > 0,
                  );
              })().map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-heritage-ink/70">
                  <span>{item.label}{item.value ? ': ' + item.value : ''}</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}{item.price.toFixed(2)}
                  </span>
                </div>
              ))}
              {selectedFabric && pricing.decorativeFeatures
                .filter((feature) => feature.price > 0)
                .map((feature) => (
                  <div key={`decorative-${feature.label}`} className="flex justify-between items-center text-heritage-ink/70">
                    <span>
                      {feature.includedByStyle ? "Design Feature" : "Decorative Detail"}:{" "}
                      {feature.label}
                    </span>
                    <span className="font-semibold text-heritage-green">
                      +{currencySymbol}{feature.price.toFixed(2)}
                    </span>
                  </div>
                ))
              }
              {selectedFabric && pricing.traditionalAccessories
                .filter((accessory) => accessory.price > 0)
                .map((accessory) => (
                  <div
                    key={`traditional-accessory-${accessory.label}`}
                    className="flex justify-between items-center text-heritage-ink/70"
                  >
                    <span>Traditional Accessory: {accessory.label}</span>
                    <span className="font-semibold text-heritage-green">
                      +{currencySymbol}{accessory.price.toFixed(2)}
                    </span>
                  </div>
                ))
              }
              {pricing.constructionSewingCost > 0 && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Construction Sewing Cost:</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}{pricing.constructionSewingCost.toFixed(2)}
                  </span>
                </div>
              )}
              {selectedFabric &&
                liningEligible &&
                hasLining &&
                !hasCatalogDressLining && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Inner Lining/Net (L5):</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}10.00
                  </span>
                </div>
              )}

              {selectedFabric && designSelections.additionalCap && (
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>Custom Matching Fila (Accessory):</span>
                  <span className="font-semibold text-heritage-green">
                    +{currencySymbol}
                    {(
                      businessSettings.pricingSettings
                        ?.standardAccessoryCharge ?? 10
                    ).toFixed(2)}
                  </span>
                </div>
              )}

              {pricing.individualShipping && (
                <div className="flex flex-col text-amber-700 font-semibold text-[10px]">
                  <div className="flex justify-between items-center">
                    <span>Lagos &rarr; Eindhoven shipping:</span>
                    <span className="font-mono">
                      +{currencySymbol}
                      {pricing.individualShipping.priceEur.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[9px] text-amber-600/80 mt-0.5">
                    {pricing.individualShipping.garmentPieceCount} garment piece
                    {pricing.individualShipping.garmentPieceCount === 1 ? "" : "s"} ·{" "}
                    {pricing.individualShipping.estimatedWeightKg.toFixed(2)} kg estimated ·{" "}
                    {pricing.individualShipping.weightBand}
                  </span>
                </div>
              )}

              {pricing.batchShipping && (
                <div className="flex flex-col text-amber-700 font-semibold text-[10px]">
                  <div className="flex justify-between items-center">
                    <span>Lagos &rarr; Eindhoven shipping:</span>
                    <span className="font-mono">
                      +{currencySymbol}
                      {pricing.batchShipping.priceEur.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[9px] text-amber-600/80 mt-0.5">
                    {pricing.batchShipping.garmentPieceCount} garment piece
                    {pricing.batchShipping.garmentPieceCount === 1 ? "" : "s"} ·{" "}
                    {currencySymbol}
                    {pricing.batchShipping.exactRateEurPerGarment.toFixed(2)} each ·{" "}
                    {pricing.batchShipping.minimumBatchGarments ??
                      BATCH_MINIMUM_GARMENTS}
                    -garment batch minimum
                    {pricing.batchShipping.allowsSplitShipments
                      ? " · split shipments available for large batches"
                      : ""}
                  </span>
                </div>
              )}

              {batchType === "personalized" &&
                !pricing.batchShipping &&
                pricing.batchShippingPendingReason && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                    <span className="block font-bold">
                      Personalized batch shipping is pending
                    </span>
                    <span>{pricing.batchShippingPendingReason}</span>
                  </div>
                )}

              {batchType !== "alone" &&
                batchType !== "personalized" &&
                !pricing.batchShipping &&
                (!selectedStyle || !selectedGarment) && (
                  <div className="flex justify-between items-center text-heritage-ink/60 text-[10px]">
                    <span>Lagos &rarr; Eindhoven shipping:</span>
                    <span className="font-semibold">Pending garment selection</span>
                  </div>
                )}

              <div className="flex flex-col text-[10px]">
                <div className="flex justify-between items-center text-heritage-ink/70">
                  <span>
                    {pricing.finalMileShipping?.method === "PICKUP"
                      ? `${pricing.finalMileShipping.pickupLocation || "Configured location"} pickup:`
                      : pricing.finalMileShipping?.status === "READY"
                        ? `Eindhoven → ${pricing.finalMileShipping.zoneLabel} (${pricing.finalMileShipping.weightBand}):`
                        : "Final delivery:"}
                  </span>
                  {pricing.finalMileShipping?.status === "READY" ? (
                    <span className="font-mono font-semibold text-heritage-green">
                      +{currencySymbol}
                      {(pricing.finalMileShipping.priceEur ?? 0).toFixed(2)}
                    </span>
                  ) : pricing.finalMileShipping?.status ===
                    "MANUAL_QUOTE_REQUIRED" ? (
                    <span className="font-semibold text-amber-700">
                      Shipping quote required
                    </span>
                  ) : (
                    <span className="font-semibold text-heritage-ink/50">
                      Select in Step 7
                    </span>
                  )}
                </div>
                {pricing.finalMileShipping?.status ===
                  "MANUAL_QUOTE_REQUIRED" && (
                  <span className="mt-0.5 text-[9px] text-amber-700">
                    {pricing.finalMileShipping.manualQuoteReason}
                  </span>
                )}
              </div>

              {isShippingReady && (
                <div className="flex justify-between border-t border-dashed pt-2 text-[10px] font-bold text-heritage-ink/75">
                  <span>Total shipping:</span>
                  <span className="font-mono">
                    {currencySymbol}
                    {pricing.shippingCost.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="flex justify-between border-t pt-2.5 font-bold text-sm text-heritage-green font-serif">
                <span>
                  {isShippingReady
                    ? "Total Subtotal:"
                    : "Estimated Total So Far:"}
                </span>
                <span className="font-mono text-emerald-800">
                  {currencySymbol}
                  {subtotal.toFixed(2)}
                </span>
              </div>
              {!isShippingReady && (
                <p className="text-[9px] leading-relaxed text-heritage-ink/50">
                  Final total and payment amount will be available after
                  final delivery is selected and priced.
                </p>
              )}
            </div>

            {/* Split payments */}
            <div className="grid grid-cols-2 gap-3 text-center pt-1.5">
              <div className="bg-heritage-cream/60 border border-heritage-gold/20 p-3 rounded-xl">
                <span className="block text-[8px] uppercase tracking-wider text-heritage-ink/50 font-bold">
                  Due Now ({depositPercentage}%
                  Garment Deposit{pricing.shippingCost > 0 ? " + Shipping" : ""})
                </span>
                <span className="text-sm font-bold text-heritage-green font-mono">
                  {isShippingReady
                    ? `${currencySymbol}${depositRequired.toFixed(2)}`
                    : "Pending final delivery"}
                </span>
              </div>
              <div className="bg-heritage-cream/60 border border-heritage-gold/20 p-3 rounded-xl">
                <span className="block text-[8px] uppercase tracking-wider text-heritage-ink/50 font-bold">
                  Due on Hand-off
                </span>
                <span className="text-sm font-bold text-heritage-green font-mono">
                  {currencySymbol}
                  {remainingDue.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Selected summary badges */}
            <div className="p-4 bg-heritage-cream/30 border rounded-2xl text-[11px] space-y-2 text-heritage-ink/70">
              <span className="block font-bold text-heritage-green uppercase tracking-wider text-[8px]">
                Active Selection Summary
              </span>
              <p>
                Style:{" "}
                <strong className="text-heritage-green font-serif">
                  {selectedStyle?.name || "Pending"}
                </strong>
              </p>
              <p>
                Fabric:{" "}
                <strong className="text-heritage-green">
                  {selectedFabric?.name || "Pending"}
                </strong>
              </p>
              <p>
                Garment Cut:{" "}
                <strong className="text-heritage-green">
                  {selectedGarment?.type || "Pending"}
                </strong>
              </p>
              {isAmbiguous && (
                <p>
                  Lower Garment Type:{" "}
                  <strong className="text-heritage-green font-bold uppercase">
                    {designSelections.lowerGarmentType === "trousers"
                      ? "Trouser"
                      : designSelections.lowerGarmentType === "skirt"
                      ? "Skirt"
                      : "Pending"}
                  </strong>
                </p>
              )}
              <GarmentDetailSummaryItems
                designSelections={designSelections}
                isLi={false}
                currencySymbol={currencySymbol}
                catalog={customDetailCatalog}
                decorativeFeatures={pricing.decorativeFeatures}
                accessories={pricing.traditionalAccessories}
                excludeClothingPriceSelections={
                  pricing.includesFabricAndSewing
                }
                style={selectedStyle}
                garment={selectedGarment}
                mode="non-priced"
              />

              <p>
                Your Order Route:{" "}
                <strong className="text-heritage-gold font-bold">
                  {batchType === "community"
                    ? (ctx.batchName || "Community Batch")
                    : batchType === "alone"
                      ? "Individual Order"
                      : batchType === "personalized"
                        ? `Personalized Group (${personalizedGroupLabel})`
                        : "Custom Order"}
                </strong>
              </p>
              <p>
                Final Delivery:{" "}
                <strong className="text-heritage-green">
                  {!pricing.finalMileShipping
                    ? "Select in Step 7"
                    : pricing.finalMileShipping.status ===
                        "MANUAL_QUOTE_REQUIRED"
                      ? "Shipping quote required"
                      : pricing.finalMileShipping.method === "PICKUP"
                        ? `${pricing.finalMileShipping.pickupLocation} pickup`
                        : pricing.finalMileShipping.status === "READY"
                          ? pricing.finalMileShipping.zoneLabel
                          : "Select in Step 7"}
                </strong>
              </p>
            </div>
          </div>

          {/* Secure escrow info */}
          <div className="p-4 bg-heritage-green rounded-2xl border text-white text-[10px] space-y-2 leading-relaxed font-sans">
            <span className="font-bold text-heritage-gold uppercase tracking-wider text-[8px] block">
              Bespoke Escrow Policy
            </span>
            <p>
              Your garment deposit is processed into a secure community fund.
              Shipping is paid in full with the deposit. Lagos materials and
              workshop sourcing commence immediately, and the remaining
              garment balance is due at delivery.
            </p>
          </div>
        </div>
      </main>

      {/* BESPOKE ATTIRE ADDED SUCCESS MODAL */}
      {showAddedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto font-sans">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity" />

          {/* Modal Container */}
          <div className="relative bg-heritage-cream border-2 border-heritage-gold rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl animate-fade-in text-center flex flex-col items-center">
            {/* Celebration Sparkle Icon */}
            <div className="h-14 w-14 rounded-full bg-heritage-green/10 border border-heritage-gold/30 flex items-center justify-center text-heritage-gold mb-4 animate-pulse">
              <Sparkles size={26} className="text-heritage-gold" />
            </div>

            {/* Modal Heading */}
            <h3 className="text-base font-bold text-heritage-green uppercase tracking-wider font-serif mb-2">
              Bespoke Attire Drafted!
            </h3>

            <p className="text-[11px] text-heritage-ink/70 leading-relaxed mb-6">
              Your bespoke Senator design configuration has been securely
              compiled and added to your tailoring cart.
            </p>

            {/* Config summary card */}
            <div className="w-full bg-white border border-gray-150 rounded-2xl p-4 text-left text-[11px] space-y-2 mb-6">
              <div className="flex justify-between font-serif font-bold text-heritage-green pb-1.5 border-b border-gray-100">
                <span>{selectedStyle?.name || "Pending"}</span>
                <span className="font-mono text-heritage-gold">
                  {currencySymbol}
                  {subtotal.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-heritage-ink/75 pt-1.5">
                <span className="text-heritage-ink/50 font-medium">
                  Garment Type:
                </span>
                <span className="font-semibold text-right">
                  {selectedGarment?.type || "Pending"}
                </span>

                <span className="text-heritage-ink/50 font-medium">
                  Fabric Type:
                </span>
                <span
                  className="font-semibold text-right truncate"
                  title={selectedFabric?.name || "Pending"}
                >
                  {selectedFabric?.name || "Pending"}
                </span>

                <span className="text-heritage-ink/50 font-medium">
                  Tailored For:
                </span>
                <span className="font-semibold text-right truncate">
                  {customerName}
                </span>

                <span className="text-heritage-ink/50 font-medium">
                  Sizing Source:
                </span>
                <span className="font-semibold text-right text-heritage-green">
                  {sizingMode === "ai"
                    ? "AI Dimensions Passport"
                    : "Manual Calibrations"}
                </span>
              </div>
            </div>

            {/* Button Actions */}
            <div className="w-full flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={resetDesignStudio}
                className="flex-1 min-h-[40px] px-4 py-2 border-2 border-heritage-green text-heritage-green hover:bg-heritage-green hover:text-white transition rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer"
              >
                🔄 Design Another
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAddedModal(false);
                  openCartDrawer();
                }}
                className="flex-1 min-h-[40px] px-4 py-2 bg-heritage-gold text-heritage-forest hover:bg-heritage-green hover:text-white transition rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                🛒 Open Cart & Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Biometric Consent Modal */}
      <AnimatePresence>
        {showConsentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => {}} // Force user to click explicit buttons
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-white border-2 border-heritage-gold/30 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col z-10"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center gap-3 border-b border-heritage-gold/15 pb-4">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-full shrink-0 shadow-sm border border-blue-100">
                    <Shield size={24} className="fill-blue-500/20" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif font-bold text-heritage-green">
                      Netherlands Biometric Consent
                    </h3>
                    <p className="text-[10px] text-gray-500 font-mono tracking-wider uppercase mt-1">
                      GDPR Compliance v1.0
                    </p>
                  </div>
                </div>

                <div className="text-sm text-heritage-ink/80 leading-relaxed space-y-4 font-sans bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <p>
                    To provide accurate tailoring and AI-assisted fitting, The
                    Odogwu Heritage temporarily processes body measurements and
                    uploaded images.
                  </p>
                  <p>
                    Your information is securely handled in accordance with GDPR
                    privacy requirements and is used solely to generate your
                    measurements and garment preview.
                  </p>
                  <p className="font-semibold text-heritage-green">
                    Images are never shared with third parties and may be
                    deleted at your request.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDeclineConsent}
                    className="flex-1 px-4 py-3 bg-white text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 text-center select-none cursor-pointer"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptConsent}
                    className="flex-1 px-4 py-3 bg-heritage-green text-white hover:bg-heritage-forest border border-transparent rounded-xl text-xs font-bold uppercase tracking-wider transition duration-200 shadow-md text-center select-none cursor-pointer"
                  >
                    Accept & Continue
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Visual Step-by-Step Measurement Guide Modal */}
      <AnimatePresence>
        {showMeasurementGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMeasurementGuideModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-white border-2 border-heritage-gold/30 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col md:flex-row h-[90vh] md:h-[640px] z-10"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowMeasurementGuideModal(false)}
                className="absolute top-4 right-4 text-heritage-green hover:text-heritage-gold transition p-1.5 rounded-full bg-heritage-cream/40 hover:bg-heritage-cream/80 z-20"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>

              {/* Sidebar Navigation */}
              <div className="w-full md:w-1/3 bg-heritage-cream/15 border-r border-heritage-gold/15 p-5 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-heritage-gold font-serif font-bold text-xs uppercase tracking-wider">
                      <BookOpen size={14} />
                      <span>Atelier Guide</span>
                    </div>
                    <h3 className="text-base font-serif font-bold text-heritage-green">
                      Measurement Steps
                    </h3>
                    <p className="text-[10px] text-heritage-ink/60 leading-relaxed">
                      Follow these standard rules of traditional Nigerian
                      bespoke design.
                    </p>
                  </div>

                  <nav className="space-y-1.5">
                    {GUIDE_STEPS.map((step) => {
                      const isActive = activeGuideStep === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setActiveGuideStep(step.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-xs font-semibold transition ${
                            isActive
                              ? "bg-heritage-green text-white shadow-md"
                              : "text-heritage-green/85 hover:bg-heritage-gold/10"
                          }`}
                        >
                          <span className="text-base">{step.icon}</span>
                          <span className="flex-1 truncate">{step.title}</span>
                          {isActive && (
                            <span className="text-[9px] font-mono text-heritage-gold">
                              ●
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div className="pt-4 border-t border-heritage-gold/10 hidden md:block text-[9px] text-heritage-ink/50 leading-relaxed font-sans">
                  <strong>Master Tailor Advice:</strong> Stand relaxed and ask a
                  friend to help map these measurements for the absolute best
                  agbada or Senator fit.
                </div>
              </div>

              {/* Content Area */}
              {(() => {
                const currentStepData =
                  GUIDE_STEPS.find((s) => s.id === activeGuideStep) ||
                  GUIDE_STEPS[0];
                return (
                  <div className="flex-1 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto bg-gradient-to-br from-white to-heritage-cream/5">
                    <div className="space-y-6">
                      {/* Step Header */}
                      <div className="border-b border-heritage-gold/15 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg bg-heritage-gold/15 p-1.5 rounded-lg">
                            {currentStepData.icon}
                          </span>
                          <div>
                            <h4 className="text-lg font-serif font-bold text-heritage-green leading-snug">
                              {currentStepData.title}
                            </h4>
                            <p className="text-[11px] text-heritage-ink/75 font-sans">
                              {currentStepData.description}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Illustration & Instructions Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                        {/* Custom Illustration SVG */}
                        <div className="sm:col-span-5 bg-heritage-cream/20 rounded-2xl p-4 border border-heritage-gold/10 flex items-center justify-center min-h-[160px] relative overflow-hidden group shadow-inner">
                          <div className="absolute top-2 left-2 text-[8px] font-mono font-bold text-heritage-gold bg-white border border-heritage-gold/25 px-1.5 py-0.5 rounded shadow-sm">
                            DIAGRAM VIEW
                          </div>
                          {currentStepData.illustration("#D4AF37")}
                        </div>

                        {/* Text Instructions */}
                        <div className="sm:col-span-7 space-y-3">
                          <h5 className="text-[10px] uppercase font-mono font-bold text-heritage-gold tracking-widest flex items-center gap-1">
                            <Info size={11} />
                            <span>Step-by-Step Directions</span>
                          </h5>
                          <ul className="space-y-2 text-[11px] text-heritage-ink/80 leading-relaxed list-disc pl-5">
                            {currentStepData.instructions.map((inst, index) => (
                              <li key={index} className="text-left">
                                {inst}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Tailor Tip Banner */}
                      <div className="bg-amber-50/70 border border-amber-200/60 p-4 rounded-xl text-[10px] text-amber-900 leading-relaxed flex items-start gap-2 shadow-sm">
                        <span className="text-amber-500 text-sm">💡</span>
                        <div>
                          <strong>Tailor's Pro Tip:</strong>{" "}
                          {currentStepData.tips}
                        </div>
                      </div>
                    </div>

                    {/* Step Navigation Footer inside Modal */}
                    <div className="pt-6 border-t border-heritage-gold/15 mt-6 flex justify-between items-center text-xs font-bold gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const idx = GUIDE_STEPS.findIndex(
                            (s) => s.id === activeGuideStep,
                          );
                          if (idx > 0) {
                            setActiveGuideStep(GUIDE_STEPS[idx - 1].id);
                          }
                        }}
                        disabled={
                          GUIDE_STEPS.findIndex(
                            (s) => s.id === activeGuideStep,
                          ) === 0
                        }
                        className="px-4 py-2 bg-heritage-cream text-heritage-green rounded-xl hover:bg-heritage-gold/10 transition flex items-center gap-1.5 border border-heritage-gold/20 disabled:opacity-40 disabled:cursor-not-allowed select-none"
                      >
                        <ChevronLeft size={14} />
                        <span>Prev</span>
                      </button>

                      <div className="flex gap-1">
                        {GUIDE_STEPS.map((step) => (
                          <span
                            key={step.id}
                            className={`w-1.5 h-1.5 rounded-full transition ${
                              activeGuideStep === step.id
                                ? "bg-heritage-gold scale-125"
                                : "bg-heritage-gold/25"
                            }`}
                          />
                        ))}
                      </div>

                      {GUIDE_STEPS.findIndex((s) => s.id === activeGuideStep) <
                      GUIDE_STEPS.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const idx = GUIDE_STEPS.findIndex(
                              (s) => s.id === activeGuideStep,
                            );
                            if (idx < GUIDE_STEPS.length - 1) {
                              setActiveGuideStep(GUIDE_STEPS[idx + 1].id);
                            }
                          }}
                          className="px-4 py-2 bg-heritage-green text-white rounded-xl hover:bg-heritage-green/90 transition flex items-center gap-1.5 shadow-sm select-none"
                        >
                          <span>Next</span>
                          <ChevronRight size={14} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowMeasurementGuideModal(false)}
                          className="px-4 py-2 bg-heritage-gold text-heritage-forest rounded-xl hover:bg-heritage-green hover:text-white transition flex items-center gap-1.5 shadow-sm select-none"
                        >
                          <Check size={14} />
                          <span>Close Guide</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simple Fabric Zoom Modal */}
      <AnimatePresence>
        {showFabricZoomModal && zoomedFabric && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFabricZoomModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm cursor-zoom-out"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative max-w-5xl w-full h-[85vh] flex flex-col items-center justify-center z-10 pointer-events-none"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setShowFabricZoomModal(false)}
                className="absolute top-0 right-0 md:-top-12 md:right-0 text-white hover:text-heritage-gold transition p-2 z-20 cursor-pointer flex items-center gap-2 pointer-events-auto bg-black/50 md:bg-transparent rounded-bl-lg md:rounded-none"
                aria-label="Close zoom modal"
              >
                <span className="text-sm font-bold tracking-widest uppercase hidden md:inline">Close</span>
                <X size={24} />
              </button>

              <div className="w-full h-full relative flex items-center justify-center p-4 pointer-events-none">
                 {/* Main Fabric Swatch Image */}
                 <img
                   loading="lazy"
                   src={
                     zoomedFabric.image ||
                     "https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=400"
                   }
                   alt={zoomedFabric.name}
                   referrerPolicy="no-referrer"
                   className="max-w-full max-h-full object-contain shadow-2xl rounded-sm pointer-events-auto"
                 />
              </div>
              <div className="mt-4 flex flex-col items-center gap-3 bg-black/60 px-8 py-4 rounded-3xl backdrop-blur-md border border-white/10 pointer-events-auto">
                 <div className="text-center">
                   <h3 className="text-xl font-serif font-bold text-white mb-1">
                     {zoomedFabric.name} <span className="text-heritage-gold ml-2 text-sm font-sans">{zoomedFabric?.code}</span>
                   </h3>
                   <div className="flex items-center justify-center gap-2 text-[11px] font-sans text-gray-300 font-medium">
                     <span className="bg-white/10 px-2 py-0.5 rounded">{zoomedFabric.category || "Premium Fabric"}</span>
                     <span>&bull;</span>
                     <span className="bg-white/10 px-2 py-0.5 rounded">{zoomedFabric.color}</span>
                     <span>&bull;</span>
                     <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                        zoomedFabric.stockStatus === "OUT_OF_STOCK"
                          ? "bg-red-900/50 text-red-300"
                          : zoomedFabric.stockStatus === "LOW_STOCK"
                            ? "bg-orange-900/50 text-orange-300"
                            : "bg-heritage-green/50 text-heritage-gold"
                      }`}>
                        {zoomedFabric.stockStatus.replace('_', ' ')}
                     </span>
                   </div>
                 </div>
                 
                 <button
                    type="button"
                    onClick={() => {
                      setSelectedFabric(zoomedFabric);
                      setShowFabricZoomModal(false);
                    }}
                    className="mt-2 px-8 py-2.5 bg-heritage-gold hover:bg-yellow-600 text-white font-bold rounded-full transition-colors shadow-lg shadow-heritage-gold/20 flex items-center gap-2 text-sm"
                 >
                    Select Fabric
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Next Batch Confirmation Modal */}
      <AnimatePresence>
        {showNextBatchConfirm && nextBatchToJoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 sm:p-8"
            >
              <h2 className="text-xl font-serif font-bold text-heritage-green mb-2">
                Move this design to the next available community batch?
              </h2>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-6 space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Current Batch</span>
                  <div className="font-bold text-gray-400">{ctx.batchName} (Closed)</div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-heritage-gold tracking-wider">Next Batch</span>
                  <div className="font-bold text-heritage-ink">{nextBatchToJoin.name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Registration Opens: {nextBatchToJoin.registrationOpens || nextBatchToJoin.startDate || "TBD"}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNextBatchConfirm(false)}
                  className="flex-1 py-3 px-4 bg-white border border-gray-200 text-heritage-ink rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmNextBatch}
                  className="flex-1 py-3 px-4 bg-heritage-green text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-heritage-gold hover:text-heritage-forest transition"
                >
                  Move Design
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order Routing Panel */}

      <AnimatePresence>
        {showRoutingPanel && routingDecision && (
          <OrderRoutingPanel
            decision={routingDecision}
            onSelectAction={handleRoutingActionSelect}
            onCancel={() => setShowRoutingPanel(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
