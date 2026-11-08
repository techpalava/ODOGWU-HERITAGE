/**
 * Customer-facing names for outfit-type and garment-composition codes.
 * Pairs match the reference catalogue in src/scripts/seedReferenceData.ts
 * (groups outfit_types and garment_compositions). Stored codes stay unchanged.
 * Fabric categories are intentionally absent.
 */

export const OUTFIT_TYPE_CATALOGUE_LABELS: Readonly<Record<string, string>> = {
  SENATOR_SET: "Senator Set",
  AGBADA: "Agbada",
  KAFTAN: "Long Shirt",
  DANSHIKI: "Danshiki",
  IRO_AND_BUBA: "Iro and Buba",
  GOWN: "Gown",
  BOUBOU: "Boubou",
  MATCHING_COUPLE: "Matching Couple",
};

export const GARMENT_COMPOSITION_CATALOGUE_LABELS: Readonly<
  Record<string, string>
> = {
  SHIRT_ONLY: "Shirt Only",
  SHIRT_TROUSER: "Shirt + Trouser",
  COMPLETE_SET: "Complete Set (3-Piece)",
  GOWN_ONLY: "Gown Only",
};

const CATALOGUE_CODE_LABELS: Readonly<Record<string, string>> = {
  ...OUTFIT_TYPE_CATALOGUE_LABELS,
  ...GARMENT_COMPOSITION_CATALOGUE_LABELS,
};

/** Catalogue label when value is a known code. Any other text is unchanged. */
export const customerCatalogueLabel = (value: string): string => {
  const trimmed = value.trim();
  return CATALOGUE_CODE_LABELS[trimmed] ?? trimmed;
};
