import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomerFutureOrderV2Details } from "./src/components/CustomerFutureOrderV2Details";
import { CustomerFutureOrderV2List } from "./src/components/CustomerFutureOrderV2List";
import {
  OrderGarmentPictureStrip,
  OrderGarmentPictureTiles,
} from "./src/components/orderPictures/OrderGarmentPictures";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPersistedFutureOrderV2 } from "./src/utils/futureOrderV2PersistenceContract";
import { getFuturePaymentReviewGarmentPictures } from "./src/utils/futurePaymentReviewPictures";
import {
  createFabricCatalogueLookup,
  getOrderGarmentPictures,
} from "./src/utils/orderGarmentPictures";
import type { Fabric } from "./src/types";

const fabric = (over: Partial<Fabric>): Fabric => ({
  code: "F-1", name: "Indigo Ankara", description: "", color: "Blue", colorHex: "#123456",
  priceMultiplier: 1, stockStatus: "IN_STOCK", ...over,
});
const fabrics: Fabric[] = [
  fabric({ id: "fab-photo", code: "PHOTO-1", name: "Photo Ankara", image: "https://img.example.test/photo.jpg" }),
  fabric({ id: "fab-colour", code: "COLOUR-1", name: "Colour Lace", colorHex: "#7a1f3d" }),
  fabric({ id: "fab-code-only", code: "CODE-ONLY", name: "Code Match", image: "https://img.example.test/code.jpg" }),
];

/** Fixture order with one fabric per garment: photo, colour only, and gone. */
const masterWithFabrics = (orderId: string) => {
  const master = structuredClone(createFutureOrderV2Fixture(orderId)) as any;
  const candidate = master.cartItem.candidate;
  const picks = [
    { fabricId: "fab-photo", fabricCode: "PHOTO-1", fabricName: "Photo Ankara" },
    { fabricId: "fab-colour", fabricCode: "COLOUR-1", fabricName: "Colour Lace" },
    { fabricId: null, fabricCode: "RETIRED-9", fabricName: "Retired Kente" },
  ];
  candidate.fabricAllocations = candidate.garments.map((garment: any, index: number) => ({
    allocationId: `alloc-${index}`,
    ...picks[index]!,
    availability: "available",
    capacityUnits: 1,
    materialPriceCents: null,
    pricingTreatment: "included_in_garment_construction",
    garmentAssignments: [{ garmentKey: garment.garmentKey, code: picks[index]!.fabricCode, garmentType: "shirt", fabricUnits: 1 }],
  }));
  return master;
};

// 1. Helper: Stage 10 behaviour (no lookup) is unchanged; the lookup only fills gaps.
{
  const candidate = masterWithFabrics("pictures-helper").cartItem.candidate;
  const plain = getFuturePaymentReviewGarmentPictures(candidate, null);
  assert.equal(plain.length, 3);
  assert.ok(plain.every((p) => p.fabrics.every((f) => f.imageUrl === null && f.colorHex === null)),
    "without a summary or lookup, fabric pictures stay empty (Stage 10 default)");
  assert.equal(plain[0]!.design.imageUrl, "https://example.test/base:shirt.jpg");
  assert.equal(plain[1]!.design.sourceKind, "uploaded");
  assert.equal(plain[1]!.design.imageUrl, null, "the opaque upload reference is never used as a URL");

  const pictures = getOrderGarmentPictures(candidate, fabrics);
  assert.equal(pictures[0]!.fabrics[0]!.imageUrl, "https://img.example.test/photo.jpg");
  assert.equal(pictures[1]!.fabrics[0]!.imageUrl, null);
  assert.equal(pictures[1]!.fabrics[0]!.colorHex, "#7a1f3d");
  assert.equal(pictures[2]!.fabrics[0]!.imageUrl, null);
  assert.equal(pictures[2]!.fabrics[0]!.colorHex, null, "a fabric no longer in the list has no picture");
  assert.ok(pictures.every((p) => p.referenceImageUrl), "garment reference photos come from the built-in set");

  const lookup = createFabricCatalogueLookup(fabrics);
  assert.equal(lookup({ fabricId: "fab-photo", fabricCode: "WRONG" })?.image, "https://img.example.test/photo.jpg", "id wins");
  assert.equal(lookup({ fabricId: "missing-id", fabricCode: "CODE-ONLY" })?.image, "https://img.example.test/code.jpg", "code is the fallback");
  assert.equal(lookup({ fabricId: null, fabricCode: "NOPE" }), null);

  let consulted = 0;
  const summary = {
    fabricSummary: candidate.fabricAllocations.map((a: any) => ({
      allocationId: a.allocationId, fabricCode: a.fabricCode, fabricName: a.fabricName,
      image: "https://summary.example.test/f.jpg", colorHex: null, garments: [],
    })),
    designStyleOccurrences: [], garmentSummary: [],
  } as any;
  const withSummary = getFuturePaymentReviewGarmentPictures(candidate, summary, {
    fabricLookup: () => { consulted += 1; return { image: "https://lookup.example.test/x.jpg" }; },
  });
  assert.equal(consulted, 0, "the lookup is not consulted when the Studio summary has the fabric");
  assert.equal(withSummary[0]!.fabrics[0]!.imageUrl, "https://summary.example.test/f.jpg");
}

// 2. Tiles: lazy images with alt text, fallbacks, uploaded placeholder, fixed frames.
{
  const pictures = getOrderGarmentPictures(masterWithFabrics("pictures-tiles").cartItem.candidate, fabrics);
  const tiles = pictures.map((p) => renderToStaticMarkup(<OrderGarmentPictureTiles picture={p} tileClassName="w-16" />));
  assert.match(tiles[0]!, /alt="Shirt Historical Style design for Shirt"/);
  assert.match(tiles[0]!, /alt="Photo Ankara fabric swatch"/);
  assert.match(tiles[0]!, /alt="Shirt reference photo \(garment type only\)"/);
  for (const markup of tiles) {
    for (const img of markup.match(/<img [^>]+>/g) ?? []) {
      assert.match(img, /loading="lazy"/, "every picture is lazy");
      assert.match(img, /alt="[^"]+"/, "every picture has alt text");
    }
    assert.equal((markup.match(/data-order-picture-tile=/g) ?? []).length, 3, "design, fabric and garment tiles");
    assert.match(markup, /aspect-\[4\/5\]/, "fixed frame, no layout shift");
    assert.match(markup, /print-color-adjust:exact/, "colour swatches keep their colour in print");
  }
  assert.match(tiles[1]!, /data-order-picture-uploaded-placeholder="additional:shirt:1"/);
  assert.match(tiles[1]!, />Your uploaded design</);
  assert.match(tiles[1]!, /aria-label="Your uploaded design for Shirt 2"/);
  assert.match(tiles[1]!, /aria-label="Colour Lace fabric colour"/, "no photo: fabric colour");
  assert.match(tiles[1]!, /background-color:#7a1f3d/);
  assert.match(tiles[2]!, /aria-label="Retired Kente fabric preview unavailable"/);
  assert.match(tiles[2]!, />Retired Kente</, "no photo or colour: neutral placeholder with the name");

  const noImage = structuredClone(pictures[0]!) as any;
  noImage.design = { sourceKind: "catalogue", name: "Grand Agbada", imageUrl: null };
  const missing = renderToStaticMarkup(<OrderGarmentPictureTiles picture={noImage} tileClassName="w-16" />);
  assert.match(missing, /data-order-picture-design-missing/);
  assert.match(missing, />Grand Agbada</, "missing design image: placeholder with the design name");

  const strip = renderToStaticMarkup(<OrderGarmentPictureStrip pictures={pictures} />);
  assert.match(strip, /data-cart-order-pictures/);
  assert.match(strip, /overflow-x-auto/, "scrolls sideways on narrow screens");
  assert.match(strip, /w-11 sm:w-14/, "smaller tiles on mobile");
  assert.equal((strip.match(/data-cart-order-picture=/g) ?? []).length, 3);
  assert.equal(renderToStaticMarkup(<OrderGarmentPictureStrip pictures={[]} />), "");
}

// 3. Dashboard list and details dialog keep all text and add the pictures.
{
  const result = createPersistedFutureOrderV2({
    masterOrder: masterWithFabrics("future-order-pictures"),
    owner: { uid: "owner", isAnonymous: false },
    customerOwnerUid: "owner",
    persistedAt: "2026-10-26T10:00:00.000Z",
  } as any);
  assert.equal(result.status, "valid");
  const persisted = (result as any).value;

  const list = renderToStaticMarkup(
    <CustomerFutureOrderV2List orders={[persisted]} paymentsByOrderId={new Map()} fabrics={fabrics} />,
  );
  assert.equal((list.match(/data-customer-v2-order-thumbnail=/g) ?? []).length, 3, "one thumbnail per garment line");
  assert.match(list, /Shirt Historical Style/);
  assert.match(list, /Uploaded design/, "the existing text stays");
  assert.match(list, /data-customer-v2-order-details="future-order-pictures"/);
  const withoutFabrics = renderToStaticMarkup(
    <CustomerFutureOrderV2List orders={[persisted]} paymentsByOrderId={new Map()} />,
  );
  assert.equal((withoutFabrics.match(/data-customer-v2-order-thumbnail=/g) ?? []).length, 3, "fabrics prop is optional");

  const dialog = renderToStaticMarkup(
    <CustomerFutureOrderV2Details order={persisted} payment={undefined} onClose={() => {}} fabrics={fabrics} />,
  );
  assert.equal((dialog.match(/data-customer-v2-order-garment-pictures=/g) ?? []).length, 3);
  assert.match(dialog, /Style: Shirt Historical Style/);
  assert.match(dialog, /Fabric: Photo Ankara/);
  assert.match(dialog, /alt="Photo Ankara fabric swatch"/);
  assert.match(dialog, />Your uploaded design</);
  // Print: no picture container (or ancestor inside the garment entry) is hidden in print.
  const garmentBlocks = dialog.split("data-customer-v2-order-garment=").slice(1);
  for (const block of garmentBlocks) {
    const pictures = block.slice(0, block.indexOf("font-serif font-bold text-heritage-green"));
    assert.equal(/print:hidden/.test(pictures), false, "pictures print with Save PDF");
    assert.match(pictures, /print:overflow-visible/, "no scroll clipping in print");
  }
  assert.match(dialog, /break-inside-avoid/, "a garment entry does not split across pages");
}

// 4. Cart line: pictures plus the Stage 10 style payment box; selectors kept.
{
  const panel = readFileSync("src/components/FutureOrderV2CartPayPanel.tsx", "utf8");
  assert.match(panel, /<OrderGarmentPictureStrip pictures=\{garmentPictures\} \/>/);
  const box = panel.slice(panel.indexOf("data-cart-payment-box"));
  assert.match(panel, /data-cart-payment-box\s+className="[^"]*bg-heritage-green[^"]*text-white/);
  assert.ok(box.indexOf("<FutureOrderV2StripeCard") > 0, "the Stripe card sits inside the dark box");
  assert.ok(box.indexOf('data-testid="future-order-v2-cart-pay"') > 0, "Pay this order sits inside the dark box");
  for (const selector of [
    'data-testid="future-order-v2-cart-line"', "data-cart-item-id", 'data-testid="future-order-v2-cart-pay"',
    'data-testid="future-order-v2-included-inbound"', 'data-testid="future-order-v2-lagos-note"',
    'data-testid="cart-community-batch-closed"', 'data-testid="cart-community-batch-checking"',
    'returnSurface="dashboard"', "onExpressCheckoutConfirm={handlePay}", "shippingState={item.candidate.shipping.state}",
  ]) assert.ok(panel.includes(selector), `kept: ${selector}`);
  assert.equal(/text-heritage-gold">\s*\{totalCents/.test(panel), false, "the total is not gold on white");
  const drawer = readFileSync("src/components/CartDrawer.tsx", "utf8");
  assert.equal(/text-heritage-ink\/(40|45|50|60)\b/.test(drawer), false, "no low-contrast grey text in the cart drawer");
  assert.equal(/border-gray-200 px-/.test(drawer), false, "form field borders meet 3:1");
  const stripe = readFileSync("src/components/FutureOrderV2StripeCard.tsx", "utf8");
  assert.match(stripe, /border-heritage-gold bg-heritage-gold\/15 text-white/, "Stripe card file untouched (#999)");
}

console.log("PASS: cart and dashboard order pictures");
