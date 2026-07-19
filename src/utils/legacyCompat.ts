export function legacyCompatMap<T>(collectionName: string, data: T): T {
  if (!data) return data;
  const item = { ...data } as any;

  // Generic mapper from known legacy values to codes
  const mapValue = (val: string) => {
    if (!val) return val;
    const mapping: Record<string, string> = {
      "Draft": "DRAFT",
      "Yet To Start": "YET_TO_START",
      "Open": "OPEN",
      "Recruiting": "RECRUITING",
      "Almost Full": "ALMOST_FULL",
      "Full": "FULL",
      "Closed": "CLOSED",
      "Coming Soon": "COMING_SOON",
      "Production Ready": "PRODUCTION_READY",
      "Production Started": "PRODUCTION_STARTED",
      "Quality Control": "QUALITY_CONTROL",
      "Packed": "PACKED",
      "Shipped": "SHIPPED",
      "Arrived Netherlands": "ARRIVED_NETHERLANDS",
      "Ready For Pickup": "READY_FOR_PICKUP",
      "Collected": "COLLECTED",
      "Completed": "COMPLETED",
      
      "Public": "PUBLIC",
      "Private": "PRIVATE",
      
      "Printed Fabrics": "HiTarget Ankara",
      "PRINTED_FABRICS": "HiTarget Ankara",
      "Handcrafted Fabrics": "Adire",
      "HANDCRAFTED_FABRICS": "Adire",
      "Traditional Fabrics": "Kampala",
      "TRADITIONAL_FABRICS": "Kampala",
      "Luxury Fabrics": "Lace",
      "LUXURY_FABRICS": "Lace",
      "Hi-Target Ankara": "HiTarget Ankara",
      "Hi-Target": "HiTarget Ankara",
      
      "In Stock": "IN_STOCK",
      "Low Stock": "LOW_STOCK",
      "Out of Stock": "OUT_OF_STOCK",
      "Hidden": "HIDDEN",

      "male": "MALE",
      "female": "FEMALE",
      "unisex": "UNISEX",
      "couple": "COUPLE",
      "family": "FAMILY",
      "fabric": "FABRIC",

      "Senator Set": "SENATOR_SET",
      "Agbada": "AGBADA",
      "Kaftan": "KAFTAN",
      "Danshiki": "DANSHIKI",
      "Iro and Buba": "IRO_AND_BUBA",
      "Gown": "GOWN",
      "Boubou": "BOUBOU",
      "Matching Couple": "MATCHING_COUPLE",
      
      "Shirt Only": "SHIRT_ONLY",
      "Shirt + Trouser": "SHIRT_TROUSER",
      "Complete Set (3-Piece)": "COMPLETE_SET",
      "Gown Only": "GOWN_ONLY",
      
      "Netherlands": "NETHERLANDS",
      "Belgium": "BELGIUM",
      "Germany": "GERMANY",
      "Nigeria": "NIGERIA",
      
      "July 2026": "JULY_2026",
      "August 2026": "AUGUST_2026",
      "September 2026": "SEPTEMBER_2026",
      "October 2026": "OCTOBER_2026",
      "December 2026": "DECEMBER_2026",
    };
    return mapping[val] || val;
  };

  if (collectionName === "batches") {
    if (item.status) item.status = mapValue(item.status);
    if (item.visibility) item.visibility = mapValue(item.visibility);
  } else if (collectionName === "fabrics") {
    if (item.category) item.category = mapValue(item.category);
    if (item.stockStatus) item.stockStatus = mapValue(item.stockStatus);
  } else if (collectionName === "custom_groups") {
    if (item.status) item.status = mapValue(item.status);
    if (item.visibility) item.visibility = mapValue(item.visibility);
  } else if (collectionName === "orders" || collectionName === "historical_orders") {
    if (item.status) item.status = mapValue(item.status);
    if (item.batchType) item.batchType = mapValue(item.batchType);
    if (item.style && item.style.gender) item.style.gender = mapValue(item.style.gender);
    if (item.garment && item.garment.type) item.garment.type = mapValue(item.garment.type);
    if (item.fabric && item.fabric.category) item.fabric.category = mapValue(item.fabric.category);
  } else if (collectionName === "styles") {
    if (item.gender) item.gender = mapValue(item.gender);
    if (item.outfitType) item.outfitType = mapValue(item.outfitType);
    if (item.garmentComposition) item.garmentComposition = mapValue(item.garmentComposition);
  } else if (collectionName === "showpieces") {
    if (item.category) item.category = mapValue(item.category);
  } else if (collectionName === "community_photos") {
    if (item.category) item.category = mapValue(item.category);
  }

  return item as T;
}
