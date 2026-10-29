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
import {
  createUploadedDesignPreviewLoader,
  getUploadedDesignPreviewPaths,
  type UploadedDesignPreviewGateway,
} from "./src/services/uploadedDesignPreviewLoader";
import {
  UploadedDesignPreviewContext,
  watchUploadedDesignPreviewTile,
} from "./src/components/orderPictures/useUploadedDesignPreview";

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

// 5. Real uploaded design images: private getBlob read, blob: URL, fallbacks, cache, lazy vs eager.
const notFound = () => Object.assign(new Error("missing"), { code: "storage/object-not-found" });
const mockStorage = (files: Record<string, Blob>, extra: Partial<UploadedDesignPreviewGateway> = {}) => {
  const reads: string[] = [];
  const revoked: string[] = [];
  let urls = 0;
  const gateway: UploadedDesignPreviewGateway = {
    readBlob: async (path) => {
      reads.push(path);
      const file = files[path];
      if (!file) throw notFound();
      return file;
    },
    createObjectUrl: () => `blob:mock/${++urls}`,
    revokeObjectUrl: (url) => { revoked.push(url); },
    ...extra,
  };
  return { gateway, reads, revoked };
};
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const dir = "customer-design-drafts/owner/up-1/original";
const request = { viewerUid: "owner", ownerUid: "owner", designReferenceId: "up-1" };
await (async () => {
  // Success, and the extension fallback order .jpg -> .png -> .webp.
  {
    const { gateway, reads } = mockStorage({ [`${dir}.png`]: png });
    const loader = createUploadedDesignPreviewLoader(gateway);
    const state = await loader.load(request);
    assert.deepEqual(state, { status: "loaded", url: "blob:mock/1" });
    assert.deepEqual(reads, [`${dir}.jpg`, `${dir}.png`], "jpg first, then png; stops at the first file found");
    assert.deepEqual(loader.peek(request), state);
  }
  {
    assert.deepEqual(getUploadedDesignPreviewPaths("owner", "up-1", null),
      [`${dir}.jpg`, `${dir}.png`, `${dir}.webp`], "order without a registry: jpg, png, webp");
    const registered = { designReferenceId: "up-1", ownerUid: "owner", storagePath: `${dir}.webp`, mimeType: "image/webp" as const, createdAt: "2026-10-27T00:00:00.000Z" };
    assert.deepEqual(getUploadedDesignPreviewPaths("owner", "up-1", registered),
      [`${dir}.webp`, `${dir}.jpg`, `${dir}.png`], "the draft registry's storagePath goes first");
    const moved = { ...registered, ownerUid: "guest-anon", storagePath: "customer-design-drafts/guest-anon/up-1/original.webp" };
    assert.equal(getUploadedDesignPreviewPaths("owner", "up-1", moved)[0], `${dir}.webp`,
      "moved from the guest uid: the registry's type with the new owner's path");
    const { gateway, reads } = mockStorage({ [`${dir}.webp`]: png }, { lookupRegisteredReference: async () => registered });
    assert.equal((await createUploadedDesignPreviewLoader(gateway).load(request)).status, "loaded");
    assert.deepEqual(reads, [`${dir}.webp`], "one read when the registry knows the file");
  }
  // Missing file: every extension tried once, failure cached, no second read.
  {
    const { gateway, reads } = mockStorage({});
    const loader = createUploadedDesignPreviewLoader(gateway);
    assert.deepEqual(await loader.load(request), { status: "failed" });
    assert.equal(reads.length, 3);
    assert.deepEqual(await loader.load(request), { status: "failed" });
    assert.equal(reads.length, 3, "a failure is cached too");
    // Retry once after sign-in / uid change.
    loader.resetForViewer("account");
    await loader.load({ ...request, viewerUid: "account", ownerUid: "account" });
    assert.equal(reads.length, 6, "a new uid gets one fresh read");
    assert.equal(reads[3], "customer-design-drafts/account/up-1/original.jpg");
  }
  // Permission errors stop at once; unsafe ids are never read.
  {
    const { gateway, reads } = mockStorage({}, { readBlob: async (path) => { reads.push(path); throw Object.assign(new Error("no"), { code: "storage/unauthorized" }); } });
    const loader = createUploadedDesignPreviewLoader(gateway);
    assert.deepEqual(await loader.load(request), { status: "failed" });
    assert.equal(reads.length, 1, "no point trying other extensions without permission");
    assert.deepEqual(await loader.load({ ...request, designReferenceId: "../other" }), { status: "failed" });
    assert.equal(reads.length, 1, "an id with a slash is never turned into a path");
  }
  // Cache dedupe for a shared upload, and revoke on uid change.
  {
    const { gateway, reads, revoked } = mockStorage({ [`${dir}.jpg`]: png });
    const loader = createUploadedDesignPreviewLoader(gateway);
    const [a, b] = await Promise.all([loader.load(request), loader.load(request)]);
    assert.equal(reads.length, 1, "two garments sharing one upload read it once");
    assert.equal(a, b);
    await loader.settle();
    loader.resetForViewer(null);
    assert.deepEqual(revoked, ["blob:mock/1"], "sign-out revokes the blob: URL");
    assert.deepEqual(loader.peek(request), { status: "idle" });
  }
  // Lazy (near the viewport) vs eager.
  {
    let observed: Element | null = null;
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    let options: { rootMargin?: string } | undefined;
    let disconnected = 0;
    class FakeObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void, opts?: { rootMargin?: string }) { fire = cb; options = opts; }
      observe(element: Element) { observed = element; }
      disconnect() { disconnected += 1; }
    }
    const element = {} as Element;
    let visible = 0;
    watchUploadedDesignPreviewTile({ element, eager: false, onVisible: () => { visible += 1; }, IntersectionObserverCtor: FakeObserver as any });
    assert.equal(visible, 0, "lazy: nothing is read before the tile is near the viewport");
    assert.equal(observed, element);
    assert.equal(options?.rootMargin, "200px");
    fire!([{ isIntersecting: false }]);
    assert.equal(visible, 0);
    fire!([{ isIntersecting: true }]);
    fire!([{ isIntersecting: true }]);
    assert.equal(visible, 1, "lazy: read once when it comes near");
    assert.equal(disconnected, 1);
    let eagerVisible = 0;
    watchUploadedDesignPreviewTile({ element, eager: true, onVisible: () => { eagerVisible += 1; }, IntersectionObserverCtor: FakeObserver as any });
    assert.equal(eagerVisible, 1, "eager (details dialog): read right away");
    const panel = readFileSync("src/components/FutureOrderV2CartPayPanel.tsx", "utf8");
    assert.equal(/OrderGarmentPictureStrip[^>]*eager/.test(panel), false, "cart lines stay lazy");
    const list = readFileSync("src/components/CustomerFutureOrderV2List.tsx", "utf8");
    assert.equal(/OrderDesignThumbnail[^>]*eager/.test(list), false, "My orders stays lazy");
    const details = readFileSync("src/components/CustomerFutureOrderV2Details.tsx", "utf8");
    assert.match(details, /<OrderGarmentPictureTiles[\s\S]{0,200}?\beager\b/, "the details dialog is eager");
    assert.match(details, /waitForOrderPicturesBeforePrint\(/, "Print waits for the pictures");
    assert.equal(/onClick=\{\(\) => window\.print\(\)\}/.test(details), false);
  }
  // Rendering: placeholder until loaded (same text and marker), then the real image.
  {
    const files = { [`${dir}.jpg`]: png };
    const { gateway } = mockStorage(files);
    const loader = createUploadedDesignPreviewLoader(gateway);
    const viewer = { subscribe: () => () => {}, getSnapshot: () => "owner", getServerSnapshot: () => "owner" };
    const master = masterWithFabrics("pictures-uploaded");
    const candidate = master.cartItem.candidate;
    const uploadedRef = candidate.occurrenceStyleSnapshots[1].uploaded.uploadedSourceRef;
    const pictures = getOrderGarmentPictures(candidate, fabrics, { ownerUid: "owner" });
    assert.deepEqual(pictures[1]!.uploadedDesign, { designReferenceId: uploadedRef, ownerUid: "owner" });
    assert.equal(pictures[0]!.uploadedDesign, undefined, "catalogue designs carry no upload");
    assert.equal(getOrderGarmentPictures(candidate, fabrics)[1]!.uploadedDesign!.ownerUid, null, "cart lines: the signed-in uid owns it");
    const render = () => renderToStaticMarkup(
      <UploadedDesignPreviewContext.Provider value={{ loader, viewer }}>
        <OrderGarmentPictureTiles picture={pictures[1]!} tileClassName="w-16" />
      </UploadedDesignPreviewContext.Provider>,
    );
    const before = render();
    assert.match(before, /data-order-picture-uploaded-placeholder="additional:shirt:1"/, "loading: today's placeholder");
    assert.match(before, />Your uploaded design</);
    assert.equal(/data-order-picture-uploaded-image/.test(before), false);
    const sharedPath = `customer-design-drafts/owner/${uploadedRef}/original.jpg`;
    files[sharedPath] = png;
    await loader.load({ viewerUid: "owner", ownerUid: "owner", designReferenceId: uploadedRef });
    const after = render();
    assert.match(after, /data-order-picture-uploaded-image="additional:shirt:1"/);
    assert.match(after, /<img src="blob:mock\/1" alt="Uploaded design preview for Shirt 2"/);
    assert.equal(/data-order-picture-uploaded-placeholder/.test(after), false);
    assert.equal(/getDownloadURL/.test(readFileSync("src/services/uploadedDesignPreviewRuntime.ts", "utf8")), false, "never a download URL");
    // Without a signed-in uid nothing is read and the placeholder stays.
    const signedOut = renderToStaticMarkup(<OrderGarmentPictureTiles picture={pictures[1]!} tileClassName="w-16" />);
    assert.match(signedOut, /data-order-picture-uploaded-placeholder/);
  }
})();

console.log("PASS: cart and dashboard order pictures");
