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
  name: string;
  email: string;
  phone: string;
  location?: string; // e.g. "ASML Building 4 Veldhoven" or similar
  role?: string;
  passcode?: string;
  orderStatus?: string;
  method?: "email" | "gmail" | "phone";
  measurementProfile?: Measurements;
  measurementProfiles?: NamedMeasurementProfile[]; // structured sub-collection under profile
  biometricConsent?: BiometricConsent;
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
  basePrice: number;
  gender: "male" | "female" | "unisex" | "couple" | "family";
  outfitType?: string;
  garmentComposition?: string;
  fabricCategory?: string;
  options: string[]; // specific sub-styles
  image?: string;
  detectedColors?: {
    main: string;
    secondary: string;
  };
  constructionDetails?: ConstructionDetail[];
}

export interface Fabric {
  code: string;
  name: string;
  description: string;
  color: string;
  colorHex: string;
  priceMultiplier: number; // e.g. 1.0, 1.2
  stockStatus: "In Stock" | "Low Stock" | "Out of Stock";

  // Database suggested fields
  category?:
    | "Printed Fabrics"
    | "Handcrafted Fabrics"
    | "Traditional Fabrics"
    | "Luxury Fabrics";
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
  collar: string;
  embroidery: string;
  sleeve: string;
  pocket: string;
  additionalCap: boolean; // cap toggle for Men's Senator/Agbada
  hemFinish: string;
}

export interface GarmentSelection {
  type: string; // e.g., "Shirt Only", "Shirt + Trouser", "Complete Set", "Gown Only"
  tailoringFee: number;
  totalPrice: number;
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
  batchName?: string;
  customGroupCode?: string;
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
    | "Draft"
    | "Yet To Start"
    | "Open"
    | "Recruiting"
    | "Almost Full"
    | "Full"
    | "Production Ready"
    | "Production Started"
    | "Quality Control"
    | "Packed"
    | "Shipped"
    | "Arrived Netherlands"
    | "Ready For Pickup"
    | "Collected"
    | "Completed";
  registrationOpens?: string;
  registrationCloses?: string;
  productionStart?: string;
  estimatedDelivery?: string;
  pickupLocation?: string;
  visibility: "Private" | "Public";
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
    baseSewingPrices: { [key: string]: number };
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
  batchId: string;
  batchName: string;
  occasion: string;
  description: string;
  country: string;
  city: string;
  preferredDeliveryMonth: string;
  expectedParticipants: number;
  maxParticipants: number;
  visibility: "Private" | "Public";
  notes?: string;
  organizer: string;
  organizerId?: string;
  currentMembers: number;
  closingDate: string;
  deliveryWindow: string;
  status:
    | "Draft"
    | "Open"
    | "Almost Full"
    | "Full"
    | "Closed"
    | "Locked"
    | "Completed";
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

export interface SystemEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: any;
  source: string;
  status: "pending" | "processed" | "failed";
}
