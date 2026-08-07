/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NamedMeasurementProfile {
  id: string;
  name: string;
  createdAt: string;
  measurements: Measurements;
}

export interface BiometricConsent {
  status: "accepted" | "declined";
  timestamp: string;
  gdprVersion: string;
  userAgent?: string;
}

export interface Customer {
  ownerUid?: string;
  canonicalEmail?: string;
  name: string;
  email: string;
  phone: string;
  location?: string; // e.g. "Veldhoven Campus Lockers" or similar
  role?: string;
  passcode?: string;
  orderStatus?: string;
  method?: "email" | "gmail" | "phone";
  measurementProfile?: Measurements;
  measurementProfiles?: NamedMeasurementProfile[]; // structured sub-collection under profile
  biometricConsent?: BiometricConsent;
}

export type CustomDetailDemographic = "male" | "female" | "unisex";

export type CustomDetailGarmentGroup =
  | "shirt"
  | "dress"
  | "neck"
  | "standard_shorts"
  | "bum_shorts"
  | "trousers"
  | "skirt"
  | "personalized";

export type CustomDetailSelectionGroup =
  | "shirt_construction"
  | "shirt_pockets"
  | "dress_construction"
  | "dress_pockets"
  | "neck_design"
  | "standard_shorts_fastening"
  | "standard_shorts_pockets"
  | "bum_shorts_fastening"
  | "bum_shorts_pockets"
  | "trouser_fastening"
  | "trouser_pockets"
  | "skirt_length"
  | "skirt_pockets"
  | "shirt_additional"
  | "dress_additional"
  | "neck_additional"
  | "trouser_additional"
  | "standard_shorts_additional"
  | "bum_shorts_additional"
  | "skirt_additional"
  | "personalized_additional";

export interface CustomDetailOption {
  id: string;
  label: string;
  description: string;
  garmentGroup: CustomDetailGarmentGroup;
  selectionGroup: CustomDetailSelectionGroup;
  priceCents: number;
  eligibleDemographics: CustomDetailDemographic[];
  displayOrder: number;
  required: boolean;
  active: boolean;
  allowMultiple: boolean;
  informational?: boolean;
  requiresEvaluation?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomDetailConfig {
  representedGenders: Array<"male" | "female">;
  featuresMaleAndFemale: boolean;
  supportedGarmentGroups: CustomDetailGarmentGroup[];
  requiredSelectionGroups: CustomDetailSelectionGroup[];
  enabled: boolean;
}

export interface CustomDetailGarmentContext {
  type?: string;
  code?: string;
  composition?: string;
  lowerGarmentType?: "trousers" | "skirt";
}

export interface ConstructionDetail {
  code: string;
  type: string;
  price: number;
  discountPrice?: number;
}

export interface StyleCategory {
  id: string;
  name: string;
  description: string;
  gender: "male" | "female" | "unisex" | "couple" | "family";
  outfitType?: string;
  garmentComposition?: string;
  fabricCategory?: string;
  designCategories?: string[]; // E.g., "Male Designs", "Family-Look Designs", etc.
  options: string[]; // specific sub-styles
  image?: string;
  detectedColors?: {
    main: string;
    secondary: string;
  };
  constructionDetails?: ConstructionDetail[];
  customDetailConfig?: CustomDetailConfig;

  // New metadata fields
  targetDemographic?: "male" | "female" | "unisex";
  featuresMaleAndFemale?: boolean;
  garmentCompositionList?: string[];
  supportedGarmentDetails?: any;

  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;
  monogramCuffEligible?: boolean;
  embroideryProminence?: "standard" | "heavy";
  includedDesignFeatures?: {
    hasMonogram?: boolean;
    hasEmbroidery?: boolean;
    hasMonogramTrimming?: boolean;
  };
  
  defaultGarmentDetails?: DesignSelections;
  fabricCapacityComposition?: FabricCapacityGarmentSpec[];
}

export type FabricUnitCount = 1 | 2;

export type FabricGarmentType =
 | "shirt"
 | "trouser"
 | "skirt"
 | "standard_shorts"
 | "bum_shorts"
 | "dress"
 | "kaftan"
 | "full_length_gown"
 | "agbada"
 | "other";

export interface FabricCapacityGarmentSpec {
 key: string;
 garmentType: FabricGarmentType;
 fabricUnits: FabricUnitCount;
 lowerGarmentType?: "trousers" | "skirt";
}

export interface FabricGarmentInputAssignment {
 id?: string;
 code: string;
 lowerGarmentType?: "trousers" | "skirt";
 garmentSpec?: FabricCapacityGarmentSpec;
}

export interface FabricGarmentAssignment {
 garmentKey: string;
 code: string;
 garmentType: FabricGarmentType;
 fabricUnits: FabricUnitCount;
 lowerGarmentType?: "trousers" | "skirt";
 garmentSpec?: FabricCapacityGarmentSpec;
}

export interface FabricAllocation {
 allocationId: string;
 fabricCode: string;
 garmentAssignments: FabricGarmentAssignment[];
}

export interface FabricAllocationState {
 fabricAllocations: FabricAllocation[];
 activeAllocationId: string | null;
 pendingFabricGarment: FabricGarmentAssignment | null;
 awaitingFabricForPendingGarment: boolean;
}

export type FabricCapacityResolution =
 | { status: "resolved"; garments: FabricGarmentAssignment[]; totalUnits: number }
 | {
     status: "unclassified";
     reason: string;
     garmentCode?: string;
     allocationId?: string;
   }
 | {
     status: "capacity_exceeded";
     allocationId: string;
     usedUnitsBeforeAttempt: number;
     attemptedUnits: number;
     maxUnits: number;
     attemptedGarment: FabricGarmentAssignment;
   };

export interface Fabric {
  id?: string;
  code: string;
  name: string;
  description: string;
  color: string;
  colorHex: string;
  priceMultiplier: number; // e.g. 1.0, 1.2
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "HIDDEN";

  // Database suggested fields
  category?:
    | "HiTarget Ankara"
    | "Hollandis Ankara"
    | "Kampala"
    | "Aso-Oke"
    | "Adire"
    | "Isiagu (Akwa-Oche)"
    | "Lace"
    | string; // keep string for compatibility, though we'll strictly type the literals
  image?: string;
  width?: string;
  price?: number;
  stock?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Design {
  designCode: string;
  styleCategory: string;
  garmentType: string;
  image: string;
  description: string;
}

export interface DesignSelections {
  // Old fields for backward compat
  collar?: string;
  embroidery?: string;
  sleeve?: string;
  pocket?: string;
  additionalCap?: boolean;
  hemFinish?: string;
  hasLining?: boolean;
  optionalAccessories?: string[];

  // Premium features
  hasMonogram?: boolean;
  hasEmbroidery?: boolean;
  hasMonogramTrimming?: boolean;
  decorativeFeatures?: DecorativeFeature[];
  monogramPlacement?: MonogramPlacement;

  // New detailed garment fields
  customDetails?: Partial<
    Record<CustomDetailSelectionGroup, string | string[]>
  >;
  customDetailSnapshots?: CustomDetailSelectionSnapshot[];
  topLength?: string;
  topPocket?: string;
  dressLength?: string;
  dressPocket?: string;
  sleeveLength?: string;
  trouserFastening?: string;
  trouserPocket?: string;
  shortFastening?: string;
  shortPocket?: string;
  skirtLength?: string;
  skirtPocket?: string;
  embroideryDesign?: string;
  accessories?: string[];
  lowerGarmentType?: "trousers" | "skirt";
}

export type DecorativeFeature =
  | "Name Monogram"
  | "Embroidery"
  | "Monogram Trimming";

export type MonogramPlacement =
  | "left_chest"
  | "right_chest"
  | "cuff"
  | "neckline"
  | "upper_back"
  | "hem";

export interface CustomDetailSelectionSnapshot {
  optionId: string;
  label: string;
  description: string;
  garmentGroup: CustomDetailGarmentGroup;
  selectionGroup: CustomDetailSelectionGroup;
  priceCents: number;
  informational?: boolean;
  requiresEvaluation?: boolean;
}

export interface IndividualShippingSnapshot {
  routeId: "LAGOS_EINDHOVEN";
  pricingVersion: string;
  origin: "Lagos";
  destination: "Eindhoven";
  garmentPieceCount: number;
  estimatedWeightKg: number;
  weightBand: "0 - 2 kg" | ">2 - 5 kg" | ">5 - 10 kg" | ">10 - 20 kg" | ">20 kg";
  priceEur: number;
  priceNgn: number;
  exchangeRateNgnPerEur: number;
}

export interface BatchShippingSnapshot {
  routeId: "LAGOS_EINDHOVEN_BATCH";
  pricingVersion: string;
  rateModel?: "FLAT_PER_GARMENT";
  origin: "Lagos";
  destination: "Eindhoven";
  batchId: string;
  batchName: string;
  plannedGarmentCapacity: number;
  capacityBand:
    | "1 - 4 garments"
    | "5 - 10 garments"
    | "11 - 20 garments"
    | "21 - 40 garments"
    | "41+ garments"
    | "10+ garments";
  minimumBatchGarments?: number;
  allowsSplitShipments?: boolean;
  garmentPieceCount: number;
  exactRateEurPerGarment: number;
  rateNgnPerGarment: number;
  priceEur: number;
  priceNgn: number;
  exchangeRateNgnPerEur: number;
}

export type DeliveryMethod = "PICKUP" | "DELIVERY";

export type FinalMileDestinationZone =
  | "EINDHOVEN"
  | "NETHERLANDS_OTHER"
  | "EUROPE"
  | "NORTH_AMERICA"
  | "SOUTH_AMERICA"
  | "AFRICA"
  | "ASIA";

export type FinalMileWeightBand =
  | "0 - 2 kg"
  | ">2 - 5 kg"
  | ">5 - 10 kg"
  | ">10 - 20 kg"
  | ">20 kg";

export type ShippingQuoteStatus =
  | "READY"
  | "DESTINATION_REQUIRED"
  | "MANUAL_QUOTE_REQUIRED";

export type FinalMileWeightSource =
  | "ACTUAL_WEIGHT"
  | "GARMENT_COUNT_ESTIMATE";

export interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  countryCode: string;
}

export interface DeliverySelection {
  method: DeliveryMethod;
  pickupLocation?: string;
  pickupWindow?: string;
  address?: DeliveryAddress;
  // Trusted fulfillment data can override the garment-count estimate.
  actualParcelWeightKg?: number;
}

export interface FinalMileShippingSnapshot {
  routeId: "EINDHOVEN_DESTINATION";
  pricingVersion: string;
  shipmentGroupId: string;
  arrivalGroupKey: string;
  status: ShippingQuoteStatus;
  method: DeliveryMethod | null;
  zone: FinalMileDestinationZone | null;
  zoneLabel: string;
  address?: DeliveryAddress;
  pickupLocation?: string;
  pickupWindow?: string;
  garmentPieceCount: number;
  weightSource: FinalMileWeightSource | null;
  actualParcelWeightKg?: number;
  weightBand: FinalMileWeightBand | null;
  priceEur: number | null;
  manualQuoteReason?: string;
}

export interface ShippingBreakdownSnapshot {
  lagosToEindhovenShipping: number;
  eindhovenToDestinationShipping: number | null;
  totalShipping: number | null;
  status: ShippingQuoteStatus;
}

export type CartShippingReviewStatus =
  | "CURRENT"
  | "CONFIRMATION_REQUIRED"
  | "REVIEW_REQUIRED";

export interface CartShippingSnapshot {
  pricingVersion: string;
  repricedAt: string;
  sourceFingerprint: string;
  status: CartShippingReviewStatus;
  garmentPieceCount: number | null;
  lagosToEindhovenShipping: number | null;
  eindhovenToDestinationShipping: number | null;
  totalShipping: number | null;
  previousShippingTotal?: number;
  updatedShippingTotal?: number;
  confirmedAt?: string;
  reviewReason?: string;
}

export type CartPricingReviewStatus =
  | "CURRENT"
  | "CONFIRMATION_REQUIRED";

export interface CartPricingReview {
  pricingVersion: string;
  repricedAt: string;
  sourceFingerprint: string;
  status: CartPricingReviewStatus;
  previousGarmentSubtotal: number;
  updatedGarmentSubtotal: number;
  confirmedAt?: string;
}

export interface GarmentSelection {
  type: string; // e.g., "Shirt Only", "Shirt + Trouser", "Complete Set", "Gown Only"
  totalPrice: number;
  clothingPrice?: number;
  includesFabricAndSewing?: boolean;
  includedFabricPrice?: number;
  includedSewingCost?: number;
  fabricSewingCost?: number;
  constructionSewingCost?: number;
  fabricPrice?: number;
  constructionUpgradesPrice?: number;
  customDetailsPrice?: number;
  monogramPrice?: number;
  traditionalAccessoriesPrice?: number;
  individualShipping?: IndividualShippingSnapshot;
  batchShipping?: BatchShippingSnapshot;
  // Read-only compatibility for carts created before the shipping-rate engine.
  courierSurcharge?: number;
  checkoutTotal?: number;
}

export interface Measurements {
  // Input parameters for AI Estimation
  height: number; // cm
  weight: number; // kg
  age: number;
  bodyBuild: "Slim" | "Average" | "Muscular" | "Broad";
  fitPreference: "Slim/Executive" | "Standard" | "Relaxed";

  // Specific tailored dimensions
  neck: number; // inches or cm
  shoulder: number; // inches or cm
  chest: number; // inches or cm
  waist: number; // inches or cm
  hip: number; // inches or cm
  sleeve: number; // inches or cm
  trouserLength: number; // inches or cm

  isAiEstimated: boolean;

  // Selected unit of measurement
  unit?: "inch" | "cm";

  // Shirt/Dress Advanced Measurements (G, L, B)
  head?: number;
  ankleCircumference?: number;
  shirtLengthStandard?: number;
  shirtLengthLong?: number;
  bicep?: number;
  elbow?: number;
  armHole?: number;
  underBorst?: number; // Ladies only
  hipCircumference?: number; // Ladies only
  squareNeckLength?: number; // Ladies only
  squareNeckWidth?: number; // Ladies only
  shoulderToUnderBorst?: number; // Ladies only

  // Pants/Shorts Advanced Measurements (G, L, B)
  trouserWaist?: number;
  trouserHip?: number;
  trouserThigh?: number;
  trouserKnee?: number;
  trouserAnkleHorizontal?: number;
  trouserAnkleDiagonal?: number;
  trouserWaistToHip?: number;
  trouserCrotchDepth?: number;
  trouserWaistToKnee?: number;
  trouserWaistToAnkle?: number;
  trouserWaistToFloor?: number;

  // Heights for Estimations (Optional)
  heightHeadToShoulder?: number;
  heightShoulderToWaist?: number;
  heightHeadToWaist?: number;
  heightWaistToFloor?: number;
}

export interface Showpiece {
  id: string;
  title: string;
  category: "male" | "female" | "fabric";
  styleId: string;
  fabricCode: string;
  styleName: string;
  fabricName: string;
  colorHex: string;
  description: string;
  image?: string;
  tag: string;
}

export interface PaymentDetails {
  subtotal: number;
  deposit: number; // 50%
  remaining: number; // 50%
  method: string;
  date: string;
  isPaid: boolean;
  paymentMethod?: "iDEAL" | "Stripe";
  idealBank?: string;
  transactionId?: string;
  secondPaymentStatus?: "unpaid" | "pending" | "paid";
  secondPaymentMethod?: "iDEAL" | "Stripe";
  secondPaymentDate?: string;
  secondTransactionId?: string;
  lockerPasscode?: string;
}

export interface ShipmentTracking {
  trackingId: string;
  status: string;
  currentStage: number; // 1 to 6 (1: Deposit Paid, 2: Measurements Approved, 3: Sewing, 4: Quality Control, 5: Shipment, 6: Delivered)
  estimatedDeliveryDate: string;
}

export interface MasterOrder {
  ownerUid?: string;
  customer: Customer;
  style: StyleCategory;
  fabric: Fabric;
  design: DesignSelections;
  garment: GarmentSelection;
  measurements: Measurements;
  payment: PaymentDetails;
  shipment: ShipmentTracking;
  specialInstructions: string;
  notesAboutLeftoverFabric: string; // "Return leftover fabric" or "Donate to community"
  batchType?: "community" | "alone" | "personalized" | "actual";
  batchName?: string;
  customGroupCode?: string;
  checkoutId?: string;
  deliverySelection?: DeliverySelection;
  finalMileShipping?: FinalMileShippingSnapshot;
  shippingBreakdown?: ShippingBreakdownSnapshot;
}

export interface HistoricalOrder {
  id: string;
  date: string;
  styleName: string;
  garmentType: string;
  fabricName: string;
  fabricCode: string;
  amount: number;
  status: "Delivered" | "In Progress" | "Cancelled";
  trackingId: string;
}

export interface CartItem {
  id: string;
  customer: Customer;
  style: StyleCategory;
  fabric: Fabric;
  design: DesignSelections;
  garment: GarmentSelection;
  measurements: Measurements;
  specialInstructions: string;
  notesAboutLeftoverFabric: string;
  batchType?: "community" | "alone" | "personalized" | "actual";
  batchId?: string;
  batchName?: string;
  customGroupCode?: string;
  garmentPieceCount?: number;
  deliverySelection?: DeliverySelection;
  shippingSnapshot?: CartShippingSnapshot;
  pricingReview?: CartPricingReview;
  guestCartId?: string;
  configurationHash?: string;
  claimedByEmail?: string;
}

export interface GuestDesignDraft {
  currentStep: number;
  selectedFabricCode: string | null;
  selectedStyleId: string | null;
  selectedGarment: {
    type: string;
    fee: number;
    discountFee?: number;
    code?: string;
  } | null;
  designSelections: DesignSelections;
  measurements: Measurements;
  sizingMode: "ai" | "manual";
  deliveryMethod: DeliveryMethod | null;
  deliveryAddress: DeliveryAddress;
  pickupTime: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  batchType: "community" | "alone" | "personalized" | "actual";
  batchId?: string;
  batchName?: string;
  customGroupCode: string;
  garmentPieceCount: number | null;
  specialInstructions: string;
  leftoverFabricChoice: string;
  hasLining: boolean;
  pricingBreakdown: {
    clothingPrice?: number;
    includesFabricAndSewing?: boolean;
    fabricPrice: number;
    fabricSewingCost: number;
    constructionSewingCost: number;
    constructionUpgradesPrice?: number;
    customDetailsPrice: number;
    lagosToEindhovenShipping: number;
    eindhovenToDestinationShipping: number | null;
    total: number;
  };
  shippingSnapshot: {
    individual?: IndividualShippingSnapshot;
    batch?: BatchShippingSnapshot;
    finalMile?: FinalMileShippingSnapshot;
  };
  updatedAt: string;
}

export interface GuestOrderSession {
  schemaVersion: string;
  guestCartId: string;
  status: "ACTIVE" | "CLAIMED";
  createdAt: string;
  updatedAt: string;
  checkoutIntent: boolean;
  designDraft?: GuestDesignDraft;
  cartItems: CartItem[];
  claimedAt?: string;
  claimedByEmail?: string;
}

export interface OrderContext {
  orderType: "Individual" | "Group Organizer" | "Group Member" | "Community";
  batchId?: string;
  batchName?: string;
  organizer?: string;
  deliveryWindow?: string;
  closingDate?: string;
  pickupLocation?: string;
  currentMembers?: number;
  expectedParticipants?: number;
  allowOrders?: boolean;
  batchStatus?: string;
  isPaid?: boolean;
}

export interface Batch {
  id: string; // Batch ID
  batchNumber: number;
  name: string; // Batch Name
  startDate: string; // Registration Opens / Start Date
  endDate: string; // Registration Closes / End Date
  duration: string; // Duration string
  targetGarments: number;
  currentGarments: number;
  currentOrders: number;
  currentCustomers: number;
  status:
    | "DRAFT"
    | "YET_TO_START"
    | "OPEN"
    | "RECRUITING"
    | "ALMOST_FULL"
    | "FULL"
    | "CLOSED"
    | "COMING_SOON"
    | "PRODUCTION_READY"
    | "PRODUCTION_STARTED"
    | "QUALITY_CONTROL"
    | "PACKED"
    | "SHIPPED"
    | "ARRIVED_NETHERLANDS"
    | "READY_FOR_PICKUP"
    | "COLLECTED"
    | "COMPLETED";
  isActive?: boolean;
  allowOrders?: boolean;
  displayOrder?: number;
  description?: string;
  isAutoScheduled?: boolean;
  registrationOpens?: string;
  registrationCloses?: string;
  productionStart?: string;
  estimatedDelivery?: string;
  pickupLocation?: string;
  visibility: "PRIVATE" | "PUBLIC";
  createdBy?: string;
  createdDate?: string;
  updatedDate?: string;
  fabricForecast?: {
    requiredYards: number;
    requiredRolls: number;
    inventoryStatus: string;
  };
  shippingForecast?: {
    totalPackages: number;
    estimatedWeightKg: number;
    estimatedVolumeCbm: number;
    shippingTier: string;
    expectedTransportCost: number;
  };
  timeline?: any;
  administratorNotes?: string;
  galleryUrls?: string[];
  testimonials?: string[];
  newParticipants?: number;
  previousParticipants?: number;
  dressesMade?: number;
}

export interface OutfitType {
  id: string;
  name: string;
  gender: "male" | "female" | "unisex" | "family";
  enabled: boolean;
  displayOrder: number;
}

export interface BusinessSettings {
  collaborationLogos: {
    left: string | null;
    right: string | null;
  };
  batchSettings: {
    minGarmentsPerBatch: number;
    maxGarmentsPerBatch: number;
    minParticipantsRequired: number;
    defaultCommunityBatchSize: number;
    automaticBatchStatusRules: boolean;
  };
  shippingSettings: {
    // Legacy mirrors retained for persisted settings. Active batch pricing is
    // controlled by the centralized flat-rate shipping policy.
    communityBatchShippingRate: number;
    individualOrderShippingRate: number;
    personalizedBatchShippingRate: number;
    internationalDeliverySurcharge: number;
    expressDeliverySurcharge: number;
  };
  pricingSettings: {
    depositPercentage: number;
    balancePercentage: number;
    currency: string;
    vatTaxPercentage: number; // future
    discountRulesEnabled: boolean; // future
    standardAccessoryCharge: number;
  };
  productionSettings: {
    productionStartThresholdPercentage: number;
    estimatedProductionDurationDays: number;
    defaultDeliveryWindowDays: number;
    defaultPickupLocation: string;
  };
  applicationSettings: {
    communityName: string;
    defaultActiveBatchId: string;
    defaultCountry: string;
    notificationMessagesEnabled: boolean;
    systemAnnouncements: string;
    virtualTryOnConceptImage?: string;
    hasInitializedData?: boolean;
    tagline?: string;
    description?: string;
    primaryPhone?: string;
    whatsappNumber?: string;
    primaryEmail?: string;
    secondaryEmail?: string;
    businessHours?: string;
    socialLinks?: {
      facebook?: string;
      instagram?: string;
      whatsapp?: string;
      tiktok?: string;
      linkedin?: string;
      youtube?: string;
    };
  };
  discountSettings?: DiscountSettings;
  garmentCompositions?: string[];
  outfitTypes?: OutfitType[];
}

export interface DiscountPlanningRule {
  suggestedMinRange: number;
  suggestedMaxRange: number;
  minimumDiscount: number;
  maximumDiscount: number;
  internalNotes: string;
}

export interface FutureDiscount {
  id: string;
  name: string;
  type: "percentage" | "fixed_amount";
  value: number;
  appliesTo: "all" | "individual" | "community" | "vip";
  startDate: string;
  endDate: string;
  stackable: boolean;
  active: boolean;
  internalNotes: string;
}

export interface DiscountSettings {
  individualOrders: DiscountPlanningRule;
  communityOrders: DiscountPlanningRule;
  vipOrders: {
    status: "planning_only" | string;
    internalNotes: string;
  };
  futureDiscounts: FutureDiscount[];
}

export interface CustomGroup {
  ownerUid?: string;
  batchId: string;
  batchName: string;
  occasion: string;
  description: string;
  country: string;
  city: string;
  preferredDeliveryMonth: string;
  expectedParticipants: number;
  maxParticipants: number;
  visibility: "PRIVATE" | "PUBLIC";
  notes?: string;
  organizer: string;
  organizerId?: string;
  currentMembers: number;
  closingDate: string;
  deliveryWindow: string;
  status:
    | "DRAFT"
    | "OPEN"
    | "ALMOST_FULL"
    | "FULL"
    | "CLOSED"
    | "LOCKED"
    | "COMPLETED";
  pickupLocation?: string;
  createdDate?: string;
  inviteCode?: string;
}

export interface CommunityPhoto {
  id: string;
  url: string;
  caption: string;
  cohortName: string;
  deliveryYear: number;
  featured: boolean;
  displayOrder: number;
  status: "active" | "inactive";
}

// Foundation Platform Types
export interface MediaItem {
  id: string;
  url: string;
  filename: string;
  title: string;
  altText: string;
  caption: string;
  description: string;
  folder: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  uploadedBy: string;
  uploadedAt: string;
  updatedAt: string;
  assignments: string[]; // e.g. ['hero-banner', 'fabric-collection']
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "inactive" | "error" | "update_available";
  author: string;
  settings: Record<string, any>;
  hooks: string[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean; // cannot be deleted
}

export interface ReferenceOption {
  id: string;
  code: string;
  label: string;
  value?: string; // Kept for backwards compatibility if needed
  enabled: boolean;
  displayOrder: number;
  metadata?: Record<string, any>;
}

export interface ReferenceDataGroup {
  id: string; // e.g., 'batch_status', 'garment_categories'
  name: string; // e.g., 'Batch Status'
  description?: string;
  options: ReferenceOption[];
}

export interface SystemEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: any;
  source: string;
  status: "pending" | "processed" | "failed";
}
