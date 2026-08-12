import {
  CustomDetailDemographic,
  CustomDetailGarmentGroup,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentType,
} from "../types";
import { FABRIC_GARMENT_CAPACITY_UNITS } from "./StyleFabricCapacityConfig";

export type Demographic = CustomDetailDemographic;
export type GarmentGroup = CustomDetailGarmentGroup;
export type SelectionGroup = CustomDetailSelectionGroup;

export type StandardCustomDetailSelectionGroup = Exclude<
  CustomDetailSelectionGroup,
  | "shirt_additional"
  | "dress_additional"
  | "neck_additional"
  | "trouser_additional"
  | "standard_shorts_additional"
  | "bum_shorts_additional"
  | "skirt_additional"
  | "personalized_additional"
>;

export const CUSTOM_DETAIL_SELECTION_GROUPS: StandardCustomDetailSelectionGroup[] = [
  "additional_physical_garment",
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "skirt_length",
  "skirt_pockets",
];

export const CUSTOM_DETAIL_SELECTION_GROUP_ORDER: Readonly<
  Record<StandardCustomDetailSelectionGroup, number>
> = {
  additional_physical_garment: 5,
  shirt_construction: 10,
  shirt_pockets: 20,
  dress_construction: 30,
  dress_pockets: 40,
  neck_design: 50,
  standard_shorts_fastening: 60,
  standard_shorts_pockets: 70,
  bum_shorts_fastening: 80,
  bum_shorts_pockets: 90,
  trouser_fastening: 100,
  trouser_pockets: 110,
  skirt_length: 120,
  skirt_pockets: 130,
};

export const CUSTOM_DETAIL_OPTION_ORDER: Readonly<Record<string, number>> = {
  additional_garment_shirt: 10,
  additional_garment_trouser: 20,
  additional_garment_skirt: 30,
  additional_garment_standard_shorts: 40,
  additional_garment_bum_shorts: 50,
  additional_garment_dress: 60,
  additional_garment_kaftan: 70,
  additional_garment_full_length_gown: 80,
  shirt_std_short: 10,
  shirt_std_midlong: 20,
  shirt_long_short: 30,
  shirt_long_midlong: 40,
  shirt_pocket_1: 10,
  shirt_pocket_2: 20,
  shirt_pocket_0: 30,
  dress_std_sleeveless: 10,
  dress_std_short: 20,
  dress_std_midlong: 30,
  dress_long_sleeveless: 40,
  dress_long_short: 50,
  dress_long_midlong: 60,
  dress_pocket_1: 10,
  dress_pocket_multi: 20,
  dress_pocket_0: 30,
  neck_no_round: 10,
  neck_no_v: 20,
  neck_no_u: 30,
  neck_vert_round: 40,
  neck_vert_v: 50,
  neck_vert_u: 60,
  neck_flat_round: 70,
  neck_flat_v: 80,
  neck_flat_u: 90,
  shorts_std_rope: 10,
  shorts_std_elastic: 20,
  shorts_std_belt: 30,
  shorts_std_pocket_regular: 10,
  shorts_std_pocket_back: 20,
  shorts_std_pocket_none: 30,
  bum_rope: 10,
  bum_elastic: 20,
  bum_belt: 30,
  bum_pocket_regular: 10,
  bum_pocket_back: 20,
  bum_pocket_none: 30,
  trouser_rope: 10,
  trouser_elastic: 20,
  trouser_belt: 30,
  trouser_pocket_regular: 10,
  trouser_pocket_back: 20,
  trouser_pocket_none: 30,
  skirt_std: 10,
  skirt_long: 20,
  skirt_pocket_1: 10,
  skirt_pocket_2: 20,
  skirt_pocket_none: 30,
};

export const CUSTOM_DETAIL_SELECTION_GROUP_PRESENTATION: Readonly<
  Record<
    StandardCustomDetailSelectionGroup,
    { title: string; description?: string }
  >
> = {
  additional_physical_garment: {
    title: "Optional Extra Garment",
    description: "Add an extra garment to your design if required.",
  },
  shirt_construction: { title: "Shirt Length and Sleeve Length" },
  shirt_pockets: { title: "Shirt Pockets" },
  dress_construction: {
    title: "Dress Length and Sleeve Length",
  },
  dress_pockets: { title: "Dress Pockets" },
  neck_design: { title: "Neck Design" },
  standard_shorts_fastening: {
    title: "Fastening",
    description: "Just above the knee",
  },
  standard_shorts_pockets: {
    title: "Pockets",
    description: "Just above the knee",
  },
  bum_shorts_fastening: {
    title: "Fastening",
    description: "Just below the crotch at lap level",
  },
  bum_shorts_pockets: {
    title: "Pockets",
    description: "Just below the crotch at lap level",
  },
  trouser_fastening: {
    title: "Fastening",
    description: "Up to the ankle",
  },
  trouser_pockets: {
    title: "Pockets",
    description: "Up to the ankle",
  },
  skirt_length: {
    title: "Length",
  },
  skirt_pockets: {
    title: "Pockets",
  },
};

export type NeckDesignSubcategory =
  | "No Collar"
  | "Vertical Collar"
  | "Flat Collar";

export const NECK_DESIGN_SUBCATEGORY_ORDER: readonly NeckDesignSubcategory[] = [
  "No Collar",
  "Vertical Collar",
  "Flat Collar",
];

export const NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID: Readonly<
  Record<string, NeckDesignSubcategory>
> = {
  neck_no_round: "No Collar",
  neck_no_v: "No Collar",
  neck_no_u: "No Collar",
  neck_vert_round: "Vertical Collar",
  neck_vert_v: "Vertical Collar",
  neck_vert_u: "Vertical Collar",
  neck_flat_round: "Flat Collar",
  neck_flat_v: "Flat Collar",
  neck_flat_u: "Flat Collar",
};

export type CustomDetailParentSectionId =
  | "additional_garment"
  | "shirt"
  | "dress"
  | "neck"
  | "standard_shorts"
  | "bum_shorts"
  | "trousers"
  | "skirts";

export const CUSTOM_DETAIL_PARENT_SECTION_ORDER: readonly CustomDetailParentSectionId[] = [
  "additional_garment",
  "shirt",
  "dress",
  "neck",
  "standard_shorts",
  "bum_shorts",
  "trousers",
  "skirts"
];

export const CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION: Readonly<
  Record<CustomDetailParentSectionId, { title: string }>
> = {
  additional_garment: { title: "OPTIONAL EXTRA GARMENT" },
  shirt: { title: "SHIRT" },
  dress: { title: "DRESS (LADIES)" },
  neck: { title: "NECK DESIGN" },
  standard_shorts: { title: "STANDARD LEG SHORTS (NIKKA)" },
  bum_shorts: { title: "BUM (LEG) SHORTS" },
  trousers: { title: "LEG PANTS (TROUSER)" },
  skirts: { title: "SKIRTS (LADIES)" },
};

export const CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION: Readonly<
  Record<StandardCustomDetailSelectionGroup, CustomDetailParentSectionId>
> = {
  additional_physical_garment: "additional_garment",
  shirt_construction: "shirt",
  shirt_pockets: "shirt",
  dress_construction: "dress",
  dress_pockets: "dress",
  neck_design: "neck",
  standard_shorts_fastening: "standard_shorts",
  standard_shorts_pockets: "standard_shorts",
  bum_shorts_fastening: "bum_shorts",
  bum_shorts_pockets: "bum_shorts",
  trouser_fastening: "trousers",
  trouser_pockets: "trousers",
  skirt_length: "skirts",
  skirt_pockets: "skirts",
};



export const ADDITIONAL_CLOTHES_COST_SECTION_ORDER = [
  "shirt_additional",
  "dress_additional",
  "neck_additional",
  "trouser_additional",
  "standard_shorts_additional",
  "bum_shorts_additional",
  "skirt_additional",
  "personalized_additional",
] as const;

export type AdditionalClothesCostSection =
  (typeof ADDITIONAL_CLOTHES_COST_SECTION_ORDER)[number];

export const ALL_CUSTOM_DETAIL_SELECTION_GROUPS: readonly CustomDetailSelectionGroup[] = [
  ...CUSTOM_DETAIL_SELECTION_GROUPS,
  ...ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
];

export const CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE: Readonly<
  Record<CustomDetailSelectionGroup, string>
> = {
  additional_physical_garment: "Optional Extra Garment",
  shirt_construction: "Shirt Length and Sleeve Length",
  shirt_pockets: "Shirt Pockets",
  dress_construction: "Dress Length and Sleeve Length",
  dress_pockets: "Dress Pockets",
  neck_design: "Neck Design",
  standard_shorts_fastening: "Standard Shorts Fastening",
  standard_shorts_pockets: "Standard Shorts Pockets",
  bum_shorts_fastening: "Bum Shorts Fastening",
  bum_shorts_pockets: "Bum Shorts Pockets",
  trouser_fastening: "Trouser Fastening",
  trouser_pockets: "Trouser Pockets",
  skirt_length: "Skirt Length",
  skirt_pockets: "Skirt Pockets",
  shirt_additional: "Shirts - Additional",
  dress_additional: "Dress - Additional",
  neck_additional: "Neck Design - Additional",
  trouser_additional: "Trouser - Additional",
  standard_shorts_additional: "Standard Shorts - Additional",
  bum_shorts_additional: "Bum Shorts - Additional",
  skirt_additional: "Skirts - Additional",
  personalized_additional: "Personalized Additional",
};

export const ADDITIONAL_CLOTHES_COST_SECTION_RANK: Readonly<
  Record<AdditionalClothesCostSection, number>
> = Object.fromEntries(
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER.map((section, index) => [
    section,
    (index + 1) * 10,
  ]),
) as Record<AdditionalClothesCostSection, number>;

export const ADDITIONAL_CLOTHES_COST_SECTION_PRESENTATION: Readonly<
  Record<
    AdditionalClothesCostSection,
    { title: string; description?: string }
  >
> = {
  shirt_additional: { title: "Shirts - Additional" },
  dress_additional: { title: "Dress (Ladies) - Additional" },
  neck_additional: { title: "Neck Design - Additional" },
  trouser_additional: { title: "Leg Pants (Trouser) - Additional" },
  standard_shorts_additional: {
    title: "Standard Leg Shorts (Nikka) - Additional",
  },
  bum_shorts_additional: { title: "Bum (Leg) Shorts - Additional" },
  skirt_additional: { title: "Skirts (Ladies) - Additional" },
  personalized_additional: {
    title: "Miscellaneous - Personalized Additional",
  },
};

export const ADDITIONAL_CLOTHES_COST_OPTION_ORDER: Readonly<
  Record<string, number>
> = {
  shirt_additional_no_cost: 10,
  L5: 10,
  dress_additional_net: 20,
  dress_additional_head_wrap: 30,
  dress_additional_shoulder_waist_wrap: 40,
  neck_additional_no_cost: 10,
  trouser_additional_no_cost: 10,
  standard_shorts_additional_combat_pockets: 10,
  bum_shorts_additional_no_cost: 10,
  skirt_additional_lining: 10,
  skirt_additional_net: 20,
  personalized_additional_evaluation: 10,
};

const ADDITIONAL_PHYSICAL_GARMENT_OPTION_ORDER: Readonly<
  Record<string, number>
> = {
  additional_garment_shirt: 10,
  additional_garment_trouser: 20,
  additional_garment_skirt: 30,
  additional_garment_standard_shorts: 40,
  additional_garment_bum_shorts: 50,
  additional_garment_dress: 60,
  additional_garment_kaftan: 70,
  additional_garment_full_length_gown: 80,
};

const createAdditionalPhysicalGarmentOption = (
  garmentType: Exclude<FabricGarmentType, "agbada" | "other">,
  label: string,
  description: string,
): CustomDetailOption => ({
  id: `additional_garment_${garmentType}`,
  label,
  description,
  garmentGroup: "personalized",
  selectionGroup: "additional_physical_garment",
  priceCents: 0,
  eligibleDemographics: ["unisex"],
  displayOrder:
    ADDITIONAL_PHYSICAL_GARMENT_OPTION_ORDER[
      `additional_garment_${garmentType}`
    ],
  required: false,
  active: true,
  allowMultiple: false,
  fabricCapacityGarmentSpec: {
    key: `custom-detail:additional_physical_garment:${garmentType}`,
    garmentType,
    fabricUnits: FABRIC_GARMENT_CAPACITY_UNITS[garmentType],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const DRESS_LINING_OPTION_ID = "L5";

export const SEED_CUSTOM_DETAIL_CATALOG: CustomDetailOption[] = [

  // OPTIONAL PHYSICAL GARMENT
  createAdditionalPhysicalGarmentOption(
    "shirt",
    "Shirt",
    "Add one separately tailored shirt to this design.",
  ),
  createAdditionalPhysicalGarmentOption(
    "trouser",
    "Trouser",
    "Add one separately tailored trouser to this design.",
  ),
  createAdditionalPhysicalGarmentOption(
    "skirt",
    "Skirt",
    "Add one separately tailored skirt to this design.",
  ),
  createAdditionalPhysicalGarmentOption(
    "standard_shorts",
    "Nikka / Standard Shorts",
    "Add one pair of standard-length shorts.",
  ),
  createAdditionalPhysicalGarmentOption(
    "bum_shorts",
    "Bum Shorts",
    "Add one pair of bum shorts.",
  ),
  createAdditionalPhysicalGarmentOption(
    "dress",
    "Dress",
    "Add one separately tailored dress.",
  ),
  createAdditionalPhysicalGarmentOption(
    "kaftan",
    "Kaftan",
    "Add one kaftan using two fabric units.",
  ),
  createAdditionalPhysicalGarmentOption(
    "full_length_gown",
    "Full-length Gown",
    "Add one full-length gown using two fabric units.",
  ),

  // SHIRT LENGTH AND SLEEVE LENGTH
{
    id: "shirt_std_short",
    label: "Standard Length Shirt, Short Sleeve",
    description: "Shirt length is up to crotch level; one-piece shirt.",
    priceCents: 6500,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shirt_std_midlong",
    label: "Standard Length Shirt, Mid-Long Sleeve",
    description: "Shirt length is up to crotch level; one-piece shirt.",
    priceCents: 7000,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shirt_long_short",
    label: "Long Length Shirt, Short Sleeve",
    description: "Shirt length extends from knee level toward the ankle; one-piece shirt.",
    priceCents: 7000,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shirt_long_midlong",
    label: "Long Length Shirt, Mid-Long Sleeve",
    description: "Shirt length extends from knee level toward the ankle; one-piece shirt.",
    priceCents: 7500,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // SHIRT POCKETS
{
    id: "shirt_pocket_1",
    label: "With 1 Chest Pocket",
    description: "One pocket on the left or right side of the chest.",
    priceCents: 0,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shirt_pocket_2",
    label: "With 2 Chest Pockets",
    description: "One pocket on each side of the chest.",
    priceCents: 0,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shirt_pocket_0",
    label: "No Pockets",
    description: "No chest pockets.",
    priceCents: 0,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // DRESS LENGTH AND SLEEVE LENGTH — LADIES
{
    id: "dress_std_sleeveless",
    label: "Standard Length, Sleeveless / Over Shoulder",
    description: "Dress length extends from the waist to crotch level; one-piece dress.",
    priceCents: 7000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_std_short",
    label: "Standard Length, Short Sleeve",
    description: "Dress length extends from the waist to crotch level; one-piece dress.",
    priceCents: 7000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_std_midlong",
    label: "Standard Length, Mid (3-Quarter) / Long Sleeve",
    description: "Dress length extends from the waist to crotch level; one-piece dress.",
    priceCents: 7500,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_long_sleeveless",
    label: "Long Length, Sleeveless / Over Shoulder",
    description: "Dress length extends from knee level toward the ankle; one-piece dress.",
    priceCents: 7500,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_long_short",
    label: "Long Length, Short Sleeve",
    description: "Dress length extends from knee level toward the ankle; one-piece dress.",
    priceCents: 7500,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_long_midlong",
    label: "Long Length, Mid (3-Quarter) / Long Sleeve",
    description: "Dress length extends from knee level toward the ankle; one-piece dress.",
    priceCents: 8000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_construction",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // DRESS POCKETS
{
    id: "dress_pocket_1",
    label: "With 1 Side Pocket",
    description: "One pocket on the left or right side seam.",
    priceCents: 0,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_pocket_multi",
    label: "With Pocket(s)",
    description: "Specify the number and preferred position of the pockets.",
    priceCents: 0,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "dress_pocket_0",
    label: "No Pockets",
    description: "No dress pockets.",
    priceCents: 0,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // NECK DESIGN
{
    id: "neck_no_round",
    label: "No Collar, Round Neck",
    description: "Collarless design with a round neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_no_v",
    label: "No Collar, V-Shaped Neck",
    description: "Collarless design with a V-shaped neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_no_u",
    label: "No Collar, U or Square-Shaped Neck",
    description: "Collarless design with a U or square neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_vert_round",
    label: "Vertical Collar, Round Neck",
    description: "Vertical collar (mandarin style) with a round neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_vert_v",
    label: "Vertical Collar, V-Shaped Neck",
    description: "Vertical collar with a V-shaped neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_vert_u",
    label: "Vertical Collar, U or Square-Shaped Neck",
    description: "Vertical collar with a U or square neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_flat_round",
    label: "Flat Collar, Round Neck",
    description: "Flat lay collar with a round neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_flat_v",
    label: "Flat Collar, V-Shaped Neck",
    description: "Flat lay collar with a V-shaped neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "neck_flat_u",
    label: "Flat Collar, U or Square-Shaped Neck",
    description: "Flat lay collar with a U or square neckline.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_design",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // STANDARD LEG SHORTS — NIKKA
{
    id: "shorts_std_rope",
    label: "With Rope",
    description: "Shorts ending just above the knee with a drawstring rope.",
    priceCents: 7000,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shorts_std_elastic",
    label: "With Elastic Band",
    description: "Shorts ending just above the knee with an elastic waistband.",
    priceCents: 7500,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shorts_std_belt",
    label: "With Belt Holder",
    description: "Shorts ending just above the knee with belt loops.",
    priceCents: 7500,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shorts_std_pocket_regular",
    label: "Regular Side Waist Pockets",
    description: "Standard side pockets on the waist.",
    priceCents: 0,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shorts_std_pocket_back",
    label: "Back Pocket",
    description: "Pocket on the back of the shorts.",
    priceCents: 0,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "shorts_std_pocket_none",
    label: "No Pockets",
    description: "No pockets on the shorts.",
    priceCents: 0,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // BUM / LEG SHORTS
{
    id: "bum_rope",
    label: "With Rope",
    description: "Shorts ending just below the crotch at lap level with a drawstring rope.",
    priceCents: 7000,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "bum_elastic",
    label: "With Elastic Band",
    description: "Shorts ending just below the crotch at lap level with an elastic waistband.",
    priceCents: 7500,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "bum_belt",
    label: "With Belt Holder",
    description: "Shorts ending just below the crotch at lap level with belt loops.",
    priceCents: 7500,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "bum_pocket_regular",
    label: "Regular Side Waist Pockets",
    description: "Standard side pockets on the waist.",
    priceCents: 0,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "bum_pocket_back",
    label: "Back Pocket",
    description: "Pocket on the back of the shorts.",
    priceCents: 0,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "bum_pocket_none",
    label: "No Pockets",
    description: "No pockets on the shorts.",
    priceCents: 0,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // LEG PANTS — TROUSERS
{
    id: "trouser_rope",
    label: "With Rope",
    description: "Full-length trousers extending to the ankle with a drawstring rope.",
    priceCents: 7500,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "trouser_elastic",
    label: "With Elastic Band",
    description: "Full-length trousers extending to the ankle with an elastic waistband.",
    priceCents: 8000,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "trouser_belt",
    label: "With Belt Holder",
    description: "Full-length trousers extending to the ankle with belt loops.",
    priceCents: 8000,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_fastening",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "trouser_pocket_regular",
    label: "Regular Side Waist Pockets",
    description: "Standard side pockets on the waist.",
    priceCents: 0,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "trouser_pocket_back",
    label: "Back Pocket",
    description: "Pocket on the back of the trousers.",
    priceCents: 0,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "trouser_pocket_none",
    label: "No Pockets",
    description: "No pockets on the trousers.",
    priceCents: 0,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // SKIRTS — LADIES
{
    id: "skirt_std",
    label: "Standard Length, Above Knee",
    description: "Skirt ending just above the knee.",
    priceCents: 7500,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_length",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "skirt_long",
    label: "Long Length",
    description: "Skirt extending from knee level toward the ankle.",
    priceCents: 8000,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_length",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "skirt_pocket_1",
    label: "With 1 Side Pocket",
    description: "One pocket on the left or right side seam.",
    priceCents: 0,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "skirt_pocket_2",
    label: "With 2 Side Pockets",
    description: "One pocket on each side seam.",
    priceCents: 0,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
{
    id: "skirt_pocket_none",
    label: "No Pockets",
    description: "No skirt pockets.",
    priceCents: 0,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_pockets",
    displayOrder: 0,
    required: true,
    active: true,
    allowMultiple: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  // ADDITIONAL CLOTHES COSTS
  {
    id: "shirt_additional_no_cost",
    label: "No Additional Cost Listed",
    description: "When additional costs are required, they will be listed.",
    priceCents: 0,
    garmentGroup: "shirt",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "shirt_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: false,
    informational: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: DRESS_LINING_OPTION_ID,
    label: "Lining in Dress - to keep dress firm (in shape)",
    description:
      "Lining is to prevent sheerness, provide a smooth barrier against the skin, and help the outer garment drape elegantly without clinging.",
    priceCents: 1000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dress_additional_net",
    label: "Net - to keep dress firm (in shape)",
    description:
      "Netting (or tulle) is used to create dramatic volume, lift, and structure, transforming flat dresses into bouncy, fairytale silhouettes.",
    priceCents: 1000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dress_additional_head_wrap",
    label: "Head Wrap / Gear / Scarf",
    description: "Head-tie (traditional look).",
    priceCents: 1000,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "dress_additional_shoulder_waist_wrap",
    label: "Shoulder or Waist Wrap / Scarf",
    description:
      "Over the shoulder, around both shoulders, or around the waist.",
    priceCents: 1500,
    garmentGroup: "dress",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "dress_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "neck_additional_no_cost",
    label: "No Additional Cost Listed",
    description: "When additional costs are required, they will be listed.",
    priceCents: 0,
    garmentGroup: "neck",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "neck_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: false,
    informational: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trouser_additional_no_cost",
    label: "No Additional Cost Listed",
    description: "When additional costs are required, they will be listed.",
    priceCents: 0,
    garmentGroup: "trousers",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "trouser_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: false,
    informational: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "standard_shorts_additional_combat_pockets",
    label: "Combat (Extra side hip-pockets)",
    description: "Additional combat-style pockets at the sides of the hips.",
    priceCents: 500,
    garmentGroup: "standard_shorts",
    eligibleDemographics: ["male", "unisex"],
    selectionGroup: "standard_shorts_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "bum_shorts_additional_no_cost",
    label: "No Additional Cost Listed",
    description: "When additional costs are required, they will be listed.",
    priceCents: 0,
    garmentGroup: "bum_shorts",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "bum_shorts_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: false,
    informational: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "skirt_additional_lining",
    label: "Lining in Skirt - to keep skirt firm (in shape)",
    description:
      "Lining is to prevent sheerness, provide a smooth barrier against the skin, and help the outer garment drape elegantly without clinging.",
    priceCents: 1000,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "skirt_additional_net",
    label: "Net - to keep skirt firm (in shape)",
    description:
      "Netting (or tulle) is used to create dramatic volume, lift, and structure, transforming flat dresses into bouncy, fairytale silhouettes.",
    priceCents: 1000,
    garmentGroup: "skirt",
    eligibleDemographics: ["female", "unisex"],
    selectionGroup: "skirt_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "personalized_additional_evaluation",
    label: "Personalized Additional Requirement",
    description:
      "Additional cost will depend on evaluation of personalized needs.",
    priceCents: 0,
    garmentGroup: "personalized",
    eligibleDemographics: ["male", "female", "unisex"],
    selectionGroup: "personalized_additional",
    displayOrder: 0,
    required: false,
    active: true,
    allowMultiple: true,
    requiresEvaluation: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

];
