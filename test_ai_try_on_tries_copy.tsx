import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiTryOnPhotoPanel } from "./src/components/AiTryOnPhotoPanel";
import { AI_TRY_ON_TRIES_PER_ORDER, AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW } from "./src/utils/aiTryOnGatewayContract";
const base = { wearerId: "order", label: "You", inputFingerprint: "tryon-v1-0123456789abcdef", mode: "garment" as const, garmentImageUrl: "https://example.test/shirt.jpg", fabricSwatchImageUrl: null, fitHints: [], orderDetails: null };
for (const garments of [[], ["shirt", "trouser"].map((type) => ({ garmentKey: `base:${type}`, label: type, garmentImageUrl: `https://example.test/${type}.jpg`, fabricSwatchImageUrl: null, fabricColorHex: null, orderDetails: null }))]) {
  const html = renderToStaticMarkup(createElement(AiTryOnPhotoPanel, { targets: [{ ...base, previewableGarments: garments }], triesPerOrder: 5, initialTriesRemaining: 4, onPreviewCreated() {}, onUnavailable() {} }));
  assert.match(html, /5 tries per order, shared across all garments and wearers—not 5 per garment/);
  assert.match(html, /4 tries left/);
  if (garments.length > 1) assert.match(html, /this order’s 5 tries, shared across all garments and wearers/);
}
assert.equal(AI_TRY_ON_TRIES_PER_ORDER, 5);
assert.equal(AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW, 15);
console.log("PASS: per-order/shared-garment wording; existing limits unchanged");
