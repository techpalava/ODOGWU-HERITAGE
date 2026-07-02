import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountBase64) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env.local");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  Buffer.from(serviceAccountBase64, "base64").toString("utf8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const referenceData = [
  {
    id: "batch_status",
    name: "Batch Status",
    description: "Allowed statuses for production batches",
    options: [
      { id: "batch_status_draft", code: "DRAFT", label: "Draft", value: "Draft", enabled: true, displayOrder: 1 },
      { id: "batch_status_yet_to_start", code: "YET_TO_START", label: "Yet To Start", value: "Yet To Start", enabled: true, displayOrder: 2 },
      { id: "batch_status_open", code: "OPEN", label: "Open", value: "Open", enabled: true, displayOrder: 3 },
      { id: "batch_status_recruiting", code: "RECRUITING", label: "Recruiting", value: "Recruiting", enabled: true, displayOrder: 4 },
      { id: "batch_status_almost_full", code: "ALMOST_FULL", label: "Almost Full", value: "Almost Full", enabled: true, displayOrder: 5 },
      { id: "batch_status_full", code: "FULL", label: "Full", value: "Full", enabled: true, displayOrder: 6 },
      { id: "batch_status_closed", code: "CLOSED", label: "Closed", value: "Closed", enabled: true, displayOrder: 7 },
      { id: "batch_status_coming_soon", code: "COMING_SOON", label: "Coming Soon", value: "Coming Soon", enabled: true, displayOrder: 8 },
      { id: "batch_status_production_ready", code: "PRODUCTION_READY", label: "Production Ready", value: "Production Ready", enabled: true, displayOrder: 9 },
      { id: "batch_status_production_started", code: "PRODUCTION_STARTED", label: "Production Started", value: "Production Started", enabled: true, displayOrder: 10 },
      { id: "batch_status_quality_control", code: "QUALITY_CONTROL", label: "Quality Control", value: "Quality Control", enabled: true, displayOrder: 11 },
      { id: "batch_status_packed", code: "PACKED", label: "Packed", value: "Packed", enabled: true, displayOrder: 12 },
      { id: "batch_status_shipped", code: "SHIPPED", label: "Shipped", value: "Shipped", enabled: true, displayOrder: 13 },
      { id: "batch_status_arrived_netherlands", code: "ARRIVED_NETHERLANDS", label: "Arrived Netherlands", value: "Arrived Netherlands", enabled: true, displayOrder: 14 },
      { id: "batch_status_ready_for_pickup", code: "READY_FOR_PICKUP", label: "Ready For Pickup", value: "Ready For Pickup", enabled: true, displayOrder: 15 },
      { id: "batch_status_collected", code: "COLLECTED", label: "Collected", value: "Collected", enabled: true, displayOrder: 16 },
      { id: "batch_status_completed", code: "COMPLETED", label: "Completed", value: "Completed", enabled: true, displayOrder: 17 }
    ]
  },
  {
    id: "fabric_categories",
    name: "Fabric Categories",
    description: "Categories for fabrics in the catalog",
    options: [
      { id: "fabric_cat_printed", code: "PRINTED_FABRICS", label: "Printed Fabrics (Standard Ankara)", value: "Printed Fabrics", enabled: true, displayOrder: 1 },
      { id: "fabric_cat_handcrafted", code: "HANDCRAFTED_FABRICS", label: "Handcrafted Fabrics (Adire, Tie-Dye)", value: "Handcrafted Fabrics", enabled: true, displayOrder: 2 },
      { id: "fabric_cat_traditional", code: "TRADITIONAL_FABRICS", label: "Traditional Fabrics (Aso-Oke, Isiagu)", value: "Traditional Fabrics", enabled: true, displayOrder: 3 },
      { id: "fabric_cat_luxury", code: "LUXURY_FABRICS", label: "Luxury Fabrics (Lace, Silk, Velvet)", value: "Luxury Fabrics", enabled: true, displayOrder: 4 }
    ]
  },
  {
    id: "fabric_stock_status",
    name: "Fabric Stock Status",
    description: "Stock availability options for fabrics",
    options: [
      { id: "stock_in_stock", code: "IN_STOCK", label: "In Stock", value: "In Stock", enabled: true, displayOrder: 1 },
      { id: "stock_low_stock", code: "LOW_STOCK", label: "Low Stock", value: "Low Stock", enabled: true, displayOrder: 2 },
      { id: "stock_out_of_stock", code: "OUT_OF_STOCK", label: "Out of Stock", value: "Out of Stock", enabled: true, displayOrder: 3 },
      { id: "stock_hidden", code: "HIDDEN", label: "Hidden (Do not display)", value: "Hidden", enabled: true, displayOrder: 4 }
    ]
  },
  {
    id: "visibility",
    name: "Visibility",
    description: "Visibility settings for batches and groups",
    options: [
      { id: "visibility_public", code: "PUBLIC", label: "Public (Discoverable)", value: "Public", enabled: true, displayOrder: 1 },
      { id: "visibility_private", code: "PRIVATE", label: "Private (Invite-Only)", value: "Private", enabled: true, displayOrder: 2 }
    ]
  },
  {
    id: "genders",
    name: "Genders",
    description: "Available genders for styles and profiles",
    options: [
      { id: "gender_male", code: "MALE", label: "Male", value: "male", enabled: true, displayOrder: 1 },
      { id: "gender_female", code: "FEMALE", label: "Female", value: "female", enabled: true, displayOrder: 2 },
      { id: "gender_unisex", code: "UNISEX", label: "Unisex", value: "unisex", enabled: true, displayOrder: 3 },
      { id: "gender_couple", code: "COUPLE", label: "Couple", value: "couple", enabled: true, displayOrder: 4 },
      { id: "gender_family", code: "FAMILY", label: "Family", value: "family", enabled: true, displayOrder: 5 }
    ]
  },
  {
    id: "gallery_categories",
    name: "Gallery Categories",
    description: "Categories for community gallery photos",
    options: [
      { id: "gallery_cat_male", code: "MALE", label: "Menswear", value: "male", enabled: true, displayOrder: 1 },
      { id: "gallery_cat_female", code: "FEMALE", label: "Womenswear", value: "female", enabled: true, displayOrder: 2 },
      { id: "gallery_cat_fabric", code: "FABRIC", label: "Fabric Details", value: "fabric", enabled: true, displayOrder: 3 }
    ]
  },
  {
    id: "outfit_types",
    name: "Outfit Types",
    description: "Supported outfit types",
    options: [
      { id: "outfit_type_senator", code: "SENATOR_SET", label: "Senator Set", value: "Senator Set", enabled: true, displayOrder: 1, metadata: { gender: "MALE" } },
      { id: "outfit_type_agbada", code: "AGBADA", label: "Agbada", value: "Agbada", enabled: true, displayOrder: 2, metadata: { gender: "MALE" } },
      { id: "outfit_type_kaftan", code: "KAFTAN", label: "Kaftan", value: "Kaftan", enabled: true, displayOrder: 3, metadata: { gender: "MALE" } },
      { id: "outfit_type_danshiki", code: "DANSHIKI", label: "Danshiki", value: "Danshiki", enabled: true, displayOrder: 4, metadata: { gender: "MALE" } },
      { id: "outfit_type_iro_buba", code: "IRO_AND_BUBA", label: "Iro and Buba", value: "Iro and Buba", enabled: true, displayOrder: 5, metadata: { gender: "FEMALE" } },
      { id: "outfit_type_gown", code: "GOWN", label: "Gown", value: "Gown", enabled: true, displayOrder: 6, metadata: { gender: "FEMALE" } },
      { id: "outfit_type_boubou", code: "BOUBOU", label: "Boubou", value: "Boubou", enabled: true, displayOrder: 7, metadata: { gender: "FEMALE" } },
      { id: "outfit_type_matching_couple", code: "MATCHING_COUPLE", label: "Matching Couple", value: "Matching Couple", enabled: true, displayOrder: 8, metadata: { gender: "COUPLE" } }
    ]
  },
  {
    id: "garment_compositions",
    name: "Garment Compositions",
    description: "Supported combinations of garments",
    options: [
      { id: "comp_shirt_only", code: "SHIRT_ONLY", label: "Shirt Only", value: "Shirt Only", enabled: true, displayOrder: 1 },
      { id: "comp_shirt_trouser", code: "SHIRT_TROUSER", label: "Shirt + Trouser", value: "Shirt + Trouser", enabled: true, displayOrder: 2 },
      { id: "comp_complete_set", code: "COMPLETE_SET", label: "Complete Set (3-Piece)", value: "Complete Set (3-Piece)", enabled: true, displayOrder: 3 },
      { id: "comp_gown_only", code: "GOWN_ONLY", label: "Gown Only", value: "Gown Only", enabled: true, displayOrder: 4 }
    ]
  },
  {
    id: "countries",
    name: "Countries",
    description: "Supported shipping countries",
    options: [
      { id: "country_netherlands", code: "NETHERLANDS", label: "Netherlands", value: "Netherlands", enabled: true, displayOrder: 1 },
      { id: "country_belgium", code: "BELGIUM", label: "Belgium", value: "Belgium", enabled: true, displayOrder: 2 },
      { id: "country_germany", code: "GERMANY", label: "Germany", value: "Germany", enabled: true, displayOrder: 3 },
      { id: "country_nigeria", code: "NIGERIA", label: "Nigeria", value: "Nigeria", enabled: true, displayOrder: 4 }
    ]
  },
  {
    id: "delivery_months",
    name: "Delivery Months",
    description: "Future delivery month targets",
    options: [
      { id: "del_jul_2026", code: "JULY_2026", label: "July 2026", value: "July 2026", enabled: true, displayOrder: 1 },
      { id: "del_aug_2026", code: "AUGUST_2026", label: "August 2026", value: "August 2026", enabled: true, displayOrder: 2 },
      { id: "del_sep_2026", code: "SEPTEMBER_2026", label: "September 2026", value: "September 2026", enabled: true, displayOrder: 3 },
      { id: "del_oct_2026", code: "OCTOBER_2026", label: "October 2026", value: "October 2026", enabled: true, displayOrder: 4 },
      { id: "del_dec_2026", code: "DECEMBER_2026", label: "December 2026", value: "December 2026", enabled: true, displayOrder: 5 }
    ]
  }
];

async function seed() {
  console.log("Seeding reference data...");
  const batch = db.batch();
  for (const group of referenceData) {
    const ref = db.collection("reference_data").doc(group.id);
    batch.set(ref, group, { merge: true });
    console.log(`Added group: ${group.id}`);
  }
  await batch.commit();
  console.log("Reference data seeded successfully.");
}

seed().catch(console.error);
