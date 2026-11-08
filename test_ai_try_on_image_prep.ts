/**
 * Prompt v6 / model v4 picture preparation with real sharp: central swatch
 * crop (printed corner codes dropped) and nearest Gemini aspect ratio.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  AI_TRY_ON_GEMINI_ASPECT_RATIOS,
  AI_TRY_ON_SWATCH_CROP_FRACTION,
  cropAiTryOnFabricSwatch,
  nearestAiTryOnAspectRatio,
  readAiTryOnPhotoAspectRatio,
} from "./src/server/aiTryOnImagePrep";

// Nearest supported ratio.
assert.equal(AI_TRY_ON_SWATCH_CROP_FRACTION, 0.6);
assert.equal(AI_TRY_ON_GEMINI_ASPECT_RATIOS.length, 10);
assert.equal(nearestAiTryOnAspectRatio(800, 1200), "2:3", "test customer photo");
assert.equal(nearestAiTryOnAspectRatio(1000, 1000), "1:1");
assert.equal(nearestAiTryOnAspectRatio(3024, 4032), "3:4", "phone portrait");
assert.equal(nearestAiTryOnAspectRatio(1080, 1920), "9:16");
assert.equal(nearestAiTryOnAspectRatio(1920, 1080), "16:9");
assert.equal(nearestAiTryOnAspectRatio(1000, 3000), "9:16", "very tall goes to the tallest ratio");
assert.equal(nearestAiTryOnAspectRatio(864, 1184), "3:4");
assert.equal(nearestAiTryOnAspectRatio(0, 100), null);

// Swatch crop: a blue square with a red mark in each corner band loses every mark.
{
  const w = 1000;
  const h = 800;
  const mark = (left: number, top: number) => ({
    input: { create: { width: 60, height: 40, channels: 3 as const, background: "#ff0000" } },
    left,
    top,
  });
  const source = await sharp({ create: { width: w, height: h, channels: 3, background: "#1f3a93" } })
    .composite([mark(10, 10), mark(w - 70, 10), mark(10, h - 50), mark(w - 70, h - 50), mark(w - 200, h - 120)])
    .png()
    .toBuffer();
  const out = await cropAiTryOnFabricSwatch({ mimeType: "image/png", data: source.toString("base64") });
  assert.equal(out.mimeType, "image/jpeg");
  const raw = await sharp(Buffer.from(out.data, "base64")).raw().toBuffer({ resolveWithObject: true });
  assert.equal(raw.info.width, 600);
  assert.equal(raw.info.height, 480);
  let red = 0;
  for (let i = 0; i < raw.data.length; i += 3) if (raw.data[i] > 180 && raw.data[i + 2] < 100) red += 1;
  assert.equal(red, 0, "no corner mark survives the crop");
  const [r, g, b] = [raw.data[0], raw.data[1], raw.data[2]];
  assert.ok(Math.abs(r - 0x1f) < 12 && Math.abs(g - 0x3a) < 12 && Math.abs(b - 0x93) < 12, "fabric colour kept");
}

// EXIF orientation: a landscape-stored photo marked "rotate 90" is portrait.
{
  const stored = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#888" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.equal(await readAiTryOnPhotoAspectRatio({ mimeType: "image/jpeg", data: stored.toString("base64") }), "2:3");
  const plain = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#888" } }).jpeg().toBuffer();
  assert.equal(await readAiTryOnPhotoAspectRatio({ mimeType: "image/jpeg", data: plain.toString("base64") }), "3:2");
  await assert.rejects(readAiTryOnPhotoAspectRatio({ mimeType: "image/jpeg", data: Buffer.from("nope").toString("base64") }));
  await assert.rejects(cropAiTryOnFabricSwatch({ mimeType: "image/png", data: Buffer.from("nope").toString("base64") }));
}

// Wiring: both flows crop the swatch before the model cache key is built.
{
  const http = readFileSync("src/server/aiTryOnHttp.ts", "utf8");
  const crop = http.indexOf("cropAiTryOnFabricSwatch)(images[fabricImageIndex])");
  assert.ok(crop > 0);
  assert.match(http, /const fabricImageIndex = parsed\.uploadedDesign \? 1 : 2;/, "uploaded design has two images; ordinary try-on still has three");
  assert.ok(crop < http.indexOf("modelCacheKey = createAiTryOnModelResultKey("), "cache key hashes the cropped swatch");
  assert.match(http, /aspectRatio: defaultModel \? "3:4" : photoAspectRatio,/, "model mode keeps 3:4");
}

console.log("PASS: AI Try-on picture prep (central swatch crop, photo aspect ratio)");
