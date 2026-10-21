/**
 * Design Style photo reliability (Step 3 cards showed "Image unavailable"):
 * - published catalogue photos (`styles/`, `designs/`) load as resized
 *   `/_vercel/image` URLs from the site's own domain, original as fallback;
 * - customer uploads, blob: and data: previews keep their original URL;
 * - after every retry fails: "Image unavailable" + "Tap to reload photo";
 * - failure reports use the new design-style surfaces, which the server accepts;
 * - every Design Style image site uses the shared DesignStyleImage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { DesignStyleImage } from "./src/components/DesignStyleImage";
import { setDefaultImageRetryDelaysForTests } from "./src/hooks/useImageLoadRetry";
import {
  buildVercelImageUrl,
  DESIGN_STYLE_CARD_IMAGE_PRESET,
  DESIGN_STYLE_DIALOG_IMAGE_PRESET,
  DESIGN_STYLE_THUMB_IMAGE_PRESET,
  isCatalogueDesignImageUrl,
  setImageOptimizationEnabledForTests,
  VERCEL_IMAGE_SIZES,
} from "./src/utils/optimizedImageUrl";
import {
  CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN,
  CLIENT_IMAGE_ERROR_SURFACES,
  toClientImageErrorCode,
} from "./src/utils/clientImageErrorSchema";
import { validateClientImageErrorBody } from "./src/server/clientImageErrorLog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const BUCKET = "gen-lang-client-0614710868.firebasestorage.app";
const STYLE_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/styles%2Fred-navy-ankara-motif-shirt-1%2Fd3e9cc89.webp?alt=media&token=abc`;
const SEEDED_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/designs%2Froyal-senator-1%2Froyal-senator-1_1782820661084.webp?alt=media&token=def`;
const UPLOAD_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/customer-order-designs%2Fuid%2Forder%2Fref%2Fa.webp?alt=media&token=ghi`;

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

// 1. Which URLs are optimised, presets match vercel.json.
{
  assert.equal(isCatalogueDesignImageUrl(STYLE_URL), true);
  assert.equal(isCatalogueDesignImageUrl(SEEDED_URL), true);
  assert.equal(isCatalogueDesignImageUrl(UPLOAD_URL), false);
  assert.equal(isCatalogueDesignImageUrl(`https://${BUCKET}/styles/a.webp`), true);
  assert.equal(isCatalogueDesignImageUrl("blob:https://odogwu-heritage.vercel.app/x"), false);
  assert.equal(isCatalogueDesignImageUrl("data:image/png;base64,AAAA"), false);
  assert.equal(
    isCatalogueDesignImageUrl("https://firebasestorage.googleapis.com/v0/b/other-bucket/o/styles%2Fa.webp?alt=media"),
    false,
  );
  for (const preset of [
    DESIGN_STYLE_CARD_IMAGE_PRESET,
    DESIGN_STYLE_DIALOG_IMAGE_PRESET,
    DESIGN_STYLE_THUMB_IMAGE_PRESET,
  ]) {
    for (const width of preset.widths) {
      assert.ok((VERCEL_IMAGE_SIZES as readonly number[]).includes(width));
    }
    assert.ok(preset.widths.includes(preset.fallbackWidth));
  }
  const vercelJson = JSON.parse(readFileSync(new URL("./vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(vercelJson.images.sizes, [...VERCEL_IMAGE_SIZES]);
}

// 2. Report codes and surfaces accepted by the server validator.
{
  for (const surface of ["design-style-card", "design-style-dialog", "design-style-preview", "summary-design-style"]) {
    assert.ok((CLIENT_IMAGE_ERROR_SURFACES as readonly string[]).includes(surface));
    const result = validateClientImageErrorBody({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
      fabricCode: "classic-v-neck-maxi-dress-1",
      imageHost: "firebasestorage.googleapis.com",
      attempts: 6,
      finalFailure: true,
      surface,
      source: "original",
      online: true,
      },
    } as never);
    assert.equal("report" in result, true, `server accepts surface ${surface}`);
  }
  assert.equal(toClientImageErrorCode("royal-senator-1"), "royal-senator-1");
  assert.equal(toClientImageErrorCode("Royal Senator (v2)"), "Royal-Senator-v2-");
  assert.equal(toClientImageErrorCode("  "), "");
  assert.equal(toClientImageErrorCode(null), "");
  const long = toClientImageErrorCode("x".repeat(80));
  assert.equal(long.length, 40);
  assert.ok(CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN.test(long));
}

const renderImage = (imageUrl: string | null) => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(DesignStyleImage, {
        imageUrl,
        alt: "Royal Senator design",
        preset: DESIGN_STYLE_CARD_IMAGE_PRESET,
        surface: "design-style-card",
        reportCode: null,
        imgClassName: "img",
        fallbackClassName: "fallback",
        imgDataAttributes: { "data-style-card-image": "true" },
        fallbackDataAttributes: { "data-style-card-image-fallback": "true" },
      }),
    );
  });
  return renderer;
};

// 3. Rendered: resized src first, original next, then fallback + reload.
await (async () => {
  setImageOptimizationEnabledForTests(true);
  setDefaultImageRetryDelaysForTests([5]);
  try {
    const renderer = renderImage(STYLE_URL);
    let img = renderer.root.findByType("img");
    assert.equal(img.props.src, buildVercelImageUrl(STYLE_URL, DESIGN_STYLE_CARD_IMAGE_PRESET.fallbackWidth));
    assert.match(img.props.srcSet, /\/_vercel\/image\?url=.*&w=512&q=60 512w/);
    assert.equal(img.props["data-style-card-image"], "true");
    assert.equal(img.props["data-design-image-source"], "optimized");

    act(() => img.props.onError());
    img = renderer.root.findByType("img");
    assert.equal(img.props.src, STYLE_URL, "falls back to the original URL");
    assert.equal(img.props.srcSet, undefined);

    act(() => img.props.onError());
    await act(async () => { await sleep(20); });
    img = renderer.root.findByType("img");
    assert.equal(img.props["data-design-image-source"], "optimized", "retry starts from the resized URL");
    act(() => img.props.onError());
    img = renderer.root.findByType("img");
    act(() => img.props.onError());

    const fallback = renderer.root.find((node) => node.props["data-style-card-image-fallback"] === "true");
    assert.match(textContent(fallback), /Image unavailable/);
    const reload = renderer.root.find((node) => node.type === "button" && node.props["data-fabric-photo-reload"] === "true");
    assert.match(reload.props["aria-label"], /Tap to reload photo of Royal Senator design/);
    act(() => reload.props.onClick({ stopPropagation() {} }));
    assert.equal(renderer.root.findByType("img").props["data-design-image-source"], "optimized");
    act(() => renderer.unmount());

    // Customer upload: original URL only.
    const upload = renderImage(UPLOAD_URL);
    assert.equal(upload.root.findByType("img").props.src, UPLOAD_URL);
    assert.equal(upload.root.findByType("img").props["data-design-image-source"], "original");
    act(() => upload.unmount());

    // No URL: fallback, no reload button.
    const empty = renderImage(null);
    assert.match(textContent(empty.root.find((node) => node.props["data-style-card-image-fallback"] === "true")), /Image unavailable/);
    assert.equal(empty.root.findAll((node) => node.type === "button").length, 0);
    act(() => empty.unmount());
  } finally {
    setImageOptimizationEnabledForTests(null);
    setDefaultImageRetryDelaysForTests(null);
  }
})();

// 4. Every Design Style image site uses DesignStyleImage (no bare <img src={...style.image}>).
{
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const step = read("./src/components/DormantFutureDesignStyleStep.tsx");
  const dialog = read("./src/components/FutureAdditionalGarmentDesignStyleDialog.tsx");
  const summary = read("./src/components/DormantFutureSummaryStep.tsx");
  assert.equal(/<img\b/.test(step), false, "Step 3 has no bare <img>");
  assert.equal(/<img\b/.test(dialog), false, "additional-garment dialog has no bare <img>");
  assert.match(step, /surface="design-style-card"/);
  assert.match(step, /surface="design-style-dialog"/);
  assert.match(step, /surface="design-style-preview"/);
  assert.match(dialog, /surface="design-style-card"/);
  assert.match(summary, /surface="summary-design-style"/);
}

console.log("PASS: design style photo reliability (resized photos, retries, reload, failure surfaces)");
