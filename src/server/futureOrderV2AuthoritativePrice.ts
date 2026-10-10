import type { CustomDetailSelectionGroup, FabricGarmentType } from "../types.js";
import { getCanonicalShortsPriceCents } from "../config/AdditionalGarmentPolicy.js";
import {
  createStyleBaseGarmentSpec,
  getDefaultGarmentDetailsForSpec,
} from "../config/StyleFabricCapacityConfig.js";
import {
  attachCustomDetailCatalogDocumentId,
  inspectCustomDetailCatalog,
  isClothingPriceSelectionGroup,
  type ProvenanceAwareCustomDetailCatalogEntry,
} from "../utils/catalogHelpers.js";
import { isCanonicalPhysicalGarmentType } from "../utils/garmentConstructionPricing.js";

/**
 * Payable V2 totals have to match the server catalogue.
 * Garment construction options and exact custom-detail lines carry client
 * amounts today; this check replaces those amounts with the catalogue price
 * before an order is stored or charged. Step 8 delivery fees are already
 * reconciled when the order snapshot is parsed.
 */
export class FutureOrderV2PriceAuthorityError extends Error {
  readonly code: "PRICE_NOT_AUTHORITATIVE" | "PRICE_CATALOGUE_UNAVAILABLE";

  constructor(code: FutureOrderV2PriceAuthorityError["code"]) {
    super(code);
    this.name = "FutureOrderV2PriceAuthorityError";
    this.code = code;
  }
}

export interface AuthoritativePriceCandidate {
  readonly garments: readonly {
    readonly garmentType: string;
    readonly construction: readonly {
      readonly selectionGroup: string;
      readonly optionId: string;
      readonly priceCents: number;
    }[];
    readonly constructionTotalCents: number | null;
  }[];
  readonly customDetails: readonly {
    readonly selectionGroup: string;
    readonly optionId: string;
    readonly priceStatus: string;
    readonly priceCents: number | null;
  }[];
  readonly pricing: {
    readonly status: string;
    readonly garmentConstructionSubtotalCents: number | null;
    readonly customDetailsCents: number | null;
    readonly postEindhovenAdjustmentCents: number | null;
    readonly exactTotalCents: number | null;
  };
}

interface CatalogueReader {
  collection(name: string): {
    get(): Promise<{
      docs: ReadonlyArray<{ id: string; data(): unknown }>;
    }>;
  };
}

const isExactCents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const rejectPrice = (): never => {
  throw new FutureOrderV2PriceAuthorityError("PRICE_NOT_AUTHORITATIVE");
};

const cataloguePriceCents = (
  entry: ProvenanceAwareCustomDetailCatalogEntry | undefined,
  selectionGroup: string,
): number => {
  if (
    !entry ||
    entry.lifecycleStatus !== "active" ||
    entry.priceStatus !== "exact" ||
    !entry.option ||
    !entry.option.active ||
    entry.option.informational === true ||
    entry.option.requiresEvaluation === true ||
    entry.option.selectionGroup !== selectionGroup ||
    !isExactCents(entry.priceCents)
  ) {
    rejectPrice();
  }
  const canonical = getCanonicalShortsPriceCents(entry.optionId);
  if (canonical !== null && canonical !== entry.priceCents) rejectPrice();
  return entry.priceCents;
};

const requiredConstructionGroups = (garmentType: string): string[] => {
  if (!isCanonicalPhysicalGarmentType(garmentType as FabricGarmentType)) {
    rejectPrice();
  }
  const details = getDefaultGarmentDetailsForSpec(
    createStyleBaseGarmentSpec(garmentType as FabricGarmentType),
  );
  if (!details) rejectPrice();
  return Object.keys(details).filter((group) =>
    isClothingPriceSelectionGroup(group as CustomDetailSelectionGroup),
  );
};

/**
 * Returns the persisted exact total only when every charged construction and
 * custom-detail line matches the catalogue. A mismatch throws
 * PRICE_NOT_AUTHORITATIVE instead of substituting a different charge.
 */
export const requireAuthoritativeExactTotalCents = (
  candidate: AuthoritativePriceCandidate,
  catalogueRecords: unknown,
): number => {
  const inspection = inspectCustomDetailCatalog(catalogueRecords);
  const pricing = candidate.pricing;
  if (pricing.status !== "exact") rejectPrice();

  let constructionSubtotal = 0;
  for (const garment of candidate.garments) {
    const requiredGroups = requiredConstructionGroups(garment.garmentType);
    if (
      requiredGroups.length === 0 ||
      garment.construction.length !== requiredGroups.length
    ) {
      rejectPrice();
    }
    const seenGroups = new Set<string>();
    let garmentTotal = 0;
    for (const component of garment.construction) {
      if (
        seenGroups.has(component.selectionGroup) ||
        !requiredGroups.includes(component.selectionGroup) ||
        !isClothingPriceSelectionGroup(
          component.selectionGroup as CustomDetailSelectionGroup,
        )
      ) {
        rejectPrice();
      }
      seenGroups.add(component.selectionGroup);
      const priceCents = cataloguePriceCents(
        inspection.byOptionId.get(component.optionId),
        component.selectionGroup,
      );
      if (priceCents <= 0 || component.priceCents !== priceCents) rejectPrice();
      garmentTotal += priceCents;
    }
    if (
      seenGroups.size !== requiredGroups.length ||
      garment.constructionTotalCents !== garmentTotal
    ) {
      rejectPrice();
    }
    constructionSubtotal += garmentTotal;
  }

  let customDetailsTotal = 0;
  for (const detail of candidate.customDetails) {
    if (detail.priceStatus !== "exact") rejectPrice();
    const priceCents = cataloguePriceCents(
      inspection.byOptionId.get(detail.optionId),
      detail.selectionGroup,
    );
    if (detail.priceCents !== priceCents) rejectPrice();
    customDetailsTotal += priceCents;
  }

  const postEindhoven = pricing.postEindhovenAdjustmentCents;
  if (
    pricing.garmentConstructionSubtotalCents !== constructionSubtotal ||
    pricing.customDetailsCents !== customDetailsTotal ||
    !isExactCents(postEindhoven)
  ) {
    rejectPrice();
  }
  const exactTotal = constructionSubtotal + customDetailsTotal + postEindhoven;
  if (pricing.exactTotalCents !== exactTotal || exactTotal < 50) rejectPrice();
  return exactTotal;
};

export const loadCustomDetailCatalogueRecords = async (
  db: CatalogueReader,
): Promise<unknown[]> => {
  const snapshot = await db.collection("custom_detail_catalog").get();
  return snapshot.docs.map((document) =>
    attachCustomDetailCatalogDocumentId(document.id, document.data()),
  );
};

export const resolveAuthoritativeExactTotalCents = async (
  candidate: AuthoritativePriceCandidate,
  db: CatalogueReader,
): Promise<number> => {
  try {
    const records = await loadCustomDetailCatalogueRecords(db);
    return requireAuthoritativeExactTotalCents(candidate, records);
  } catch (error) {
    if (error instanceof FutureOrderV2PriceAuthorityError) throw error;
    throw new FutureOrderV2PriceAuthorityError("PRICE_CATALOGUE_UNAVAILABLE");
  }
};
