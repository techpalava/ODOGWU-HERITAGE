/**
 * Fabric photo reliability (colour cards instead of photos):
 * - card-sized `/_vercel/image` URLs with srcset, original URL kept as fallback;
 * - retry schedule 1 s, 2 s, 4 s, 8 s (capped), retry on `online`;
 * - "Tap to reload photo" on the colour block, never blocking selection;
 * - AssignedFabricPreview uses the same hook;
 * - failure reports (sendBeacon / fetch keepalive) and the logging endpoint.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import healthHandler from "./api/health.js";
import { FutureFabricCatalogueCard } from "./src/components/FutureFabricCatalogueCard";
import { AssignedFabricPreview } from "./src/components/AssignedFabricPreview";
import {
  buildImageRetryDelays,
  IMAGE_RETRY_DELAYS_MS,
  IMAGE_RETRY_MAX_DELAY_MS,
  setDefaultImageRetryDelaysForTests,
  useImageLoadRetry,
  type ImageLoadRetryState,
} from "./src/hooks/useImageLoadRetry";
import {
  buildOptimizedImageSources,
  buildVercelImageUrl,
  FABRIC_CARD_IMAGE_PRESET,
  FABRIC_PREVIEW_IMAGE_PRESET,
  FABRIC_THUMB_IMAGE_PRESET,
  isImageOptimizationEnabled,
  isOptimizableImageUrl,
  setImageOptimizationEnabledForTests,
  VERCEL_IMAGE_QUALITY,
  VERCEL_IMAGE_SIZES,
} from "./src/utils/optimizedImageUrl";
import {
  buildClientImageErrorReport,
  reportClientImageError,
  resetClientImageErrorReportsForTests,
  type ClientImageErrorEvent,
} from "./src/utils/clientImageErrorReport";
import {
  CLIENT_IMAGE_ERROR_ENDPOINT,
  CLIENT_IMAGE_ERROR_MAX_BODY_BYTES,
} from "./src/utils/clientImageErrorSchema";
import {
  createClientImageErrorHandler,
  createClientImageErrorRateLimiter,
  isClientImageErrorRequest,
  validateClientImageErrorBody,
} from "./src/server/clientImageErrorLog";
import type { Fabric } from "./src/types";
import type { HttpRequest, HttpResponse } from "./src/server/httpTypes";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const STORAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0614710868.firebasestorage.app/o/fabrics%2F61f52fe0-de0d-4130-a0d8-4ca59af734f4.jpeg?alt=media&token=4ad78a1d-16cd-418a-985a-e7cdddfd4446";

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children.map((child) => textContent(child as ReactTestInstance | string)).join("")
      : "";

// ---------------------------------------------------------------------------
// 1. Image URL building and vercel.json contract
// ---------------------------------------------------------------------------
{
  assert.equal(isOptimizableImageUrl(STORAGE_URL), true);
  assert.equal(
    isOptimizableImageUrl(
      "https://gen-lang-client-0614710868.firebasestorage.app/fabrics/a.jpeg",
    ),
    true,
  );
  assert.equal(
    isOptimizableImageUrl(
      "https://firebasestorage.googleapis.com/v0/b/someone-else.appspot.com/o/a.jpeg?alt=media",
    ),
    false,
    "only this project's bucket",
  );
  assert.equal(isOptimizableImageUrl("http://firebasestorage.googleapis.com/v0/b/gen-lang-client-0614710868.firebasestorage.app/o/a"), false);
  assert.equal(isOptimizableImageUrl("https://example.test/fabric.jpg"), false);
  assert.equal(isOptimizableImageUrl("/images/local.webp"), false);
  assert.equal(isOptimizableImageUrl("data:image/png;base64,AA"), false);
  assert.equal(isOptimizableImageUrl(""), false);
  assert.equal(isOptimizableImageUrl(null), false);

  const built = buildVercelImageUrl(` ${STORAGE_URL} `, 384);
  assert.equal(
    built,
    `/_vercel/image?url=${encodeURIComponent(STORAGE_URL)}&w=384&q=${VERCEL_IMAGE_QUALITY}`,
  );
  const parsed = new URL(built, "https://odogwu-heritage.vercel.app");
  assert.equal(parsed.searchParams.get("url"), STORAGE_URL, "the token survives encoding");
  assert.equal(parsed.searchParams.get("w"), "384");

  const card = buildOptimizedImageSources(STORAGE_URL, FABRIC_CARD_IMAGE_PRESET, { enabled: true });
  assert.ok(card);
  assert.equal(card!.src, buildVercelImageUrl(STORAGE_URL, 384));
  assert.equal(
    card!.srcSet,
    [256, 384, 512].map((w) => `${buildVercelImageUrl(STORAGE_URL, w as 256)} ${w}w`).join(", "),
  );
  assert.equal(card!.sizes, FABRIC_CARD_IMAGE_PRESET.sizes);
  assert.equal(buildOptimizedImageSources(STORAGE_URL, FABRIC_CARD_IMAGE_PRESET, { enabled: false }), null);
  assert.equal(
    buildOptimizedImageSources("https://example.test/a.jpg", FABRIC_CARD_IMAGE_PRESET, { enabled: true }),
    null,
    "non-Storage hosts keep the original URL",
  );
  // Off by default outside a production Vite build (tsx has no import.meta.env).
  assert.equal(isImageOptimizationEnabled(), false);

  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    images: {
      sizes: number[];
      qualities: number[];
      formats: string[];
      remotePatterns: Array<{ protocol: string; hostname: string; pathname: string }>;
    };
    rewrites: Array<{ source: string; destination: string }>;
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  assert.deepEqual(vercel.images.sizes, [...VERCEL_IMAGE_SIZES]);
  assert.ok(vercel.images.qualities.includes(VERCEL_IMAGE_QUALITY));
  assert.deepEqual(vercel.images.formats, ["image/webp"]);
  for (const preset of [FABRIC_CARD_IMAGE_PRESET, FABRIC_PREVIEW_IMAGE_PRESET, FABRIC_THUMB_IMAGE_PRESET]) {
    for (const width of [...preset.widths, preset.fallbackWidth]) {
      assert.ok(vercel.images.sizes.includes(width), `width ${width} must be in vercel.json sizes`);
    }
    assert.ok(Math.max(...preset.widths) <= 512, "card-sized: never more than 512 px");
  }
  const matchesRemotePattern = (url: string) => {
    const target = new URL(url);
    return vercel.images.remotePatterns.some(
      (pattern) =>
        `${pattern.protocol}:` === target.protocol &&
        new RegExp(pattern.hostname).test(target.hostname) &&
        new RegExp(pattern.pathname).test(target.pathname),
    );
  };
  assert.equal(matchesRemotePattern(STORAGE_URL), true);
  assert.equal(
    matchesRemotePattern("https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/a.jpeg"),
    false,
  );
  assert.equal(matchesRemotePattern("https://evil.example/v0/b/gen-lang-client-0614710868.firebasestorage.app/o/a"), false);
  // Every fabric URL the client would optimise is allowed by vercel.json.
  const sampleUrls = [
    STORAGE_URL,
    "https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0614710868.firebasestorage.app/o/fabrics%2Fodg-816%2Fmain_1782817529221.webp?alt=media&token=x",
    "https://gen-lang-client-0614710868.firebasestorage.app/fabrics/a.webp",
  ];
  for (const url of sampleUrls) {
    assert.equal(isOptimizableImageUrl(url), matchesRemotePattern(url), url);
  }

  // Logging endpoint is rewritten onto an existing function (12-function cap),
  // and stays same-origin so CSP connect-src 'self' covers it.
  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === CLIENT_IMAGE_ERROR_ENDPOINT &&
        rewrite.destination === "/api/health?route=client-image-error",
    ),
  );
  const csp = vercel.headers
    .flatMap((rule) => rule.headers)
    .find((header) => /Content-Security-Policy/.test(header.key))!.value;
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /img-src 'self'/);
  const countFunctions = (directory: string): number =>
    readdirSync(directory, { withFileTypes: true }).reduce(
      (total, entry) =>
        total +
        (entry.isDirectory()
          ? countFunctions(resolve(directory, entry.name))
          : entry.name.endsWith(".ts")
            ? 1
            : 0),
      0,
    );
  assert.equal(countFunctions("./api"), 12, "no new Vercel function");
}

// ---------------------------------------------------------------------------
// 2. Retry schedule
// ---------------------------------------------------------------------------
{
  assert.deepEqual([...IMAGE_RETRY_DELAYS_MS], [1000, 2000, 4000, 8000]);
  assert.equal(IMAGE_RETRY_MAX_DELAY_MS, 8000);
  assert.deepEqual(buildImageRetryDelays(1000, 6, 8000), [1000, 2000, 4000, 8000, 8000, 8000], "capped");
  assert.deepEqual(buildImageRetryDelays(5), [5, 10, 20, 40]);
}

// Window stand-in so the hook can listen for `online`.
const fakeWindow = new EventTarget();
(globalThis as { window?: unknown }).window = fakeWindow;
const goOnline = () => fakeWindow.dispatchEvent(new Event("online"));

// ---------------------------------------------------------------------------
// 3. Hook: optimised → original before any retry; growing gaps; final failure
// ---------------------------------------------------------------------------
{
  const optimized = buildOptimizedImageSources(STORAGE_URL, FABRIC_CARD_IMAGE_PRESET, { enabled: true })!;
  let latest: ImageLoadRetryState | null = null;
  const Probe = () => {
    latest = useImageLoadRetry(STORAGE_URL, { optimized, retryDelaysMs: [10, 20, 40, 80] });
    return null;
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  assert.equal(latest!.source, "optimized");
  assert.equal(latest!.src, optimized.src);
  assert.equal(latest!.srcSet, optimized.srcSet);
  assert.equal(latest!.sizes, optimized.sizes);
  const firstKey = latest!.imageKey;

  // Resized URL fails → the original right away (no wait, no colour).
  await act(async () => latest!.onError());
  assert.equal(latest!.source, "original");
  assert.equal(latest!.src, STORAGE_URL);
  assert.equal(latest!.srcSet, undefined, "the original has no srcset");
  assert.equal(latest!.failed, false);
  assert.notEqual(latest!.imageKey, firstKey, "new <img> for the new URL");
  // A duplicate error for the same attempt is ignored.
  await act(async () => latest!.onError());
  await act(async () => latest!.onError());
  assert.equal(latest!.attempts, 2);
  assert.equal(latest!.retryPending, true);
  assert.equal(latest!.failed, false);

  // Gap 1 (10 ms) not elapsed yet at 3 ms.
  await act(async () => sleep(3));
  assert.equal(latest!.source, "original");
  await act(async () => sleep(25));
  assert.equal(latest!.source, "optimized", "each retry starts again from the resized URL");
  assert.equal(latest!.src, optimized.src);
  assert.equal(latest!.retryPending, false);

  // Rounds 2-4, then the final failure.
  const gaps = [20, 40, 80];
  for (const gap of gaps) {
    await act(async () => latest!.onError()); // optimised
    assert.equal(latest!.source, "original");
    await act(async () => latest!.onError()); // original
    assert.equal(latest!.failed, false);
    await act(async () => sleep(gap + 25));
    assert.equal(latest!.source, "optimized");
  }
  await act(async () => latest!.onError());
  assert.equal(latest!.src, `${STORAGE_URL}&imgRetry=4`, "original retries carry a fresh marker");
  await act(async () => latest!.onError());
  assert.equal(latest!.failed, true, "colour only after the original failed on the last retry");
  assert.equal(latest!.attempts, 10);

  // 4. Browser comes back online → fresh budget, immediately.
  await act(async () => {
    goOnline();
  });
  assert.equal(latest!.failed, false);
  assert.equal(latest!.source, "optimized");
  await act(async () => latest!.onError());
  await act(async () => latest!.onError());
  assert.equal(latest!.failed, false, "a fresh retry budget after online");
  assert.equal(latest!.retryPending, true);
  // `online` while waiting for a retry skips the wait.
  await act(async () => {
    goOnline();
  });
  assert.equal(latest!.retryPending, false);
  assert.equal(latest!.source, "optimized");

  // 5. Manual reload resets too.
  for (let i = 0; i < 12 && !latest!.failed; i += 1) {
    await act(async () => latest!.onError());
    if (latest!.retryPending) await act(async () => sleep(110));
  }
  assert.equal(latest!.failed, true);
  await act(async () => latest!.retry());
  assert.equal(latest!.failed, false);
  assert.equal(latest!.source, "optimized");

  // `online` does nothing while the photo is fine.
  const keyBefore = latest!.imageKey;
  await act(async () => {
    goOnline();
  });
  assert.equal(latest!.imageKey, keyBefore);
  await act(async () => renderer.unmount());
}

// Without an optimised URL the original is retried directly.
{
  let latest: ImageLoadRetryState | null = null;
  const Probe = () => {
    latest = useImageLoadRetry("https://example.test/a.jpg", { retryDelaysMs: [5] });
    return null;
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  assert.equal(latest!.source, "original");
  await act(async () => latest!.onError());
  await act(async () => sleep(25));
  assert.equal(latest!.src, "https://example.test/a.jpg?imgRetry=1");
  await act(async () => latest!.onError());
  assert.equal(latest!.failed, true);
  await act(async () => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 6. Fabric card: resized photo, original fallback, Tap to reload photo
// ---------------------------------------------------------------------------
setDefaultImageRetryDelaysForTests([5, 10, 20, 40]);
setImageOptimizationEnabledForTests(true);
{
  const fabric: Fabric = {
    code: "ODG-012",
    name: "Prestige Burgundy Grid",
    description: "Test",
    color: "Burgundy",
    colorHex: "#050000",
    category: "Test",
    price: 42,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: STORAGE_URL,
  };
  let selected = 0;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric,
        presentation: { status: "SELECT", action: "select", cancelGarmentKey: null },
        onAction: () => {
          selected += 1;
        },
      }),
    );
  });
  const img = () => renderer.root.findByProps({ "data-fabric-card-image": "true" });
  assert.match(String(img().props.src), /^\/_vercel\/image\?url=/);
  assert.match(String(img().props.srcSet), / 256w, .* 384w, .* 512w$/);
  assert.equal(img().props.sizes, FABRIC_CARD_IMAGE_PRESET.sizes);
  assert.equal(img().props["data-fabric-image-source"], "optimized");

  await act(async () => img().props.onError());
  assert.equal(img().props.src, STORAGE_URL, "original before any colour");
  assert.equal(img().props.srcSet, undefined);
  assert.equal(renderer.root.findAllByProps({ "data-fabric-card-swatch": "true" }).length, 0);

  // Fail every retry.
  await act(async () => img().props.onError());
  for (const gap of [5, 10, 20, 40]) {
    await act(async () => sleep(gap + 25));
    await act(async () => img().props.onError());
    await act(async () => img().props.onError());
  }
  assert.equal(renderer.root.findAllByProps({ "data-fabric-card-image": "true" }).length, 0);
  const swatch = renderer.root.findByProps({ "data-fabric-card-swatch": "true" });
  assert.equal(swatch.props.style.backgroundColor, "#050000");
  const reload = renderer.root.findByProps({ "data-fabric-photo-reload": "true" });
  assert.equal(reload.type, "button");
  assert.equal(reload.props.type, "button");
  assert.equal(reload.props["aria-label"], "Tap to reload photo of Prestige Burgundy Grid");
  assert.equal(textContent(reload), "Tap to reload photo");

  // Selecting still works while the photo is down.
  const select = renderer.root.findByProps({ "data-fabric-action": "select" });
  assert.equal(Boolean(select.props.disabled), false);
  await act(async () => select.props.onClick());
  assert.equal(selected, 1);

  // Reload does not select, and goes back to the resized photo.
  let propagationStopped = false;
  await act(async () =>
    reload.props.onClick({
      stopPropagation: () => {
        propagationStopped = true;
      },
    }),
  );
  assert.equal(propagationStopped, true);
  assert.equal(selected, 1);
  assert.match(String(img().props.src), /^\/_vercel\/image\?url=/);
  assert.equal(renderer.root.findAllByProps({ "data-fabric-photo-reload": "true" }).length, 0);
  await act(async () => renderer.unmount());

  // No colour: "No preview" frame still offers the reload button.
  await act(async () => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric: { ...fabric, colorHex: "nope" },
        presentation: { status: "SELECT", action: "select", cancelGarmentKey: null },
        onAction: () => undefined,
      }),
    );
  });
  await act(async () => img().props.onError());
  await act(async () => img().props.onError());
  for (const gap of [5, 10, 20, 40]) {
    await act(async () => sleep(gap + 25));
    await act(async () => img().props.onError());
    await act(async () => img().props.onError());
  }
  assert.equal(renderer.root.findAllByProps({ "data-fabric-card-fallback": "true" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ "data-fabric-photo-reload": "true" }).length, 1);
  await act(async () => renderer.unmount());

  // A fabric with no photo at all shows no reload button.
  await act(async () => {
    renderer = create(
      createElement(FutureFabricCatalogueCard, {
        fabric: { ...fabric, image: "" },
        presentation: { status: "SELECT", action: "select", cancelGarmentKey: null },
        onAction: () => undefined,
      }),
    );
  });
  assert.equal(renderer.root.findAllByProps({ "data-fabric-card-swatch": "true" }).length, 1);
  assert.equal(renderer.root.findAllByProps({ "data-fabric-photo-reload": "true" }).length, 0);
  await act(async () => renderer.unmount());
}

// ---------------------------------------------------------------------------
// 7. AssignedFabricPreview: same hook (resized → original → retries → reload)
// ---------------------------------------------------------------------------
{
  const fabric: Fabric = {
    code: "ODG-007",
    name: "Classic Ivory Shield",
    description: "Test",
    color: "Ivory",
    colorHex: "#724137",
    category: "Test",
    price: 42,
    priceMultiplier: 1,
    stockStatus: "IN_STOCK",
    image: STORAGE_URL,
  };
  for (const size of ["preview", "thumb"] as const) {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(AssignedFabricPreview, {
          fabric,
          garmentKey: "base:shirt",
          garmentLabel: "Standard Shirt",
          fabricCode: fabric.code,
          size,
        }),
      );
    });
    const frame = () => renderer.root.findByProps({ "data-assigned-fabric-preview": "true" });
    const img = () => frame().findByType("img");
    const expected = buildOptimizedImageSources(
      STORAGE_URL,
      size === "thumb" ? FABRIC_THUMB_IMAGE_PRESET : FABRIC_PREVIEW_IMAGE_PRESET,
    )!;
    assert.equal(img().props.src, expected.src);
    assert.equal(img().props.srcSet, expected.srcSet);
    await act(async () => img().props.onError());
    assert.equal(img().props.src, STORAGE_URL, `${size}: original after the resized photo fails`);
    await act(async () => img().props.onError());
    assert.equal(frame().findAllByType("img").length, 1, `${size}: still waiting, not colour`);
    await act(async () => sleep(30));
    assert.equal(img().props.src, expected.src, `${size}: retry`);
    for (const gap of [10, 20, 40]) {
      await act(async () => img().props.onError());
      await act(async () => img().props.onError());
      await act(async () => sleep(gap + 25));
    }
    await act(async () => img().props.onError());
    await act(async () => img().props.onError());
    assert.equal(frame().findAllByType("img").length, 0, `${size}: colour after the last retry`);
    assert.equal(frame().props.style.backgroundColor, "#724137");
    assert.equal(frame().props.role, "group");
    const reload = frame().findByProps({ "data-fabric-photo-reload": "true" });
    assert.equal(reload.props["aria-label"], "Tap to reload photo of Classic Ivory Shield");
    if (size === "thumb") {
      assert.equal(textContent(reload), "", "thumb: icon-only button");
      assert.equal(reload.props.title, "Tap to reload photo");
    } else {
      assert.equal(textContent(reload), "Tap to reload photo");
    }
    // Back online → photo again.
    await act(async () => {
      goOnline();
    });
    assert.equal(frame().findAllByType("img").length, 1, `${size}: online retries`);
    await act(async () => renderer.unmount());
  }
}
setImageOptimizationEnabledForTests(null);
setDefaultImageRetryDelaysForTests(null);

// ---------------------------------------------------------------------------
// 8. Client reporter: sendBeacon, fetch keepalive fallback, dedupe, sampling
// ---------------------------------------------------------------------------
{
  const event = (overrides: Partial<ClientImageErrorEvent> = {}): ClientImageErrorEvent => ({
    kind: "final",
    fabricCode: "ODG-012",
    imageUrl: STORAGE_URL,
    attempts: 10,
    surface: "fabric-card",
    source: "original",
    ...overrides,
  });
  const nav = {
    userAgent: "Mozilla/5.0 Test",
    onLine: true,
    connection: { effectiveType: "3g" },
  };
  const report = buildClientImageErrorReport(event(), nav)!;
  assert.deepEqual(report, {
    fabricCode: "ODG-012",
    imageHost: "firebasestorage.googleapis.com",
    attempts: 10,
    finalFailure: true,
    surface: "fabric-card",
    source: "original",
    online: true,
    effectiveType: "3g",
    userAgent: "Mozilla/5.0 Test",
  });
  assert.equal(buildClientImageErrorReport(event({ fabricCode: "<script>" }), nav), null);
  assert.equal(
    buildClientImageErrorReport(event(), { ...nav, connection: { effectiveType: "5g" } })!.effectiveType,
    null,
  );

  resetClientImageErrorReportsForTests();
  const beacons: Array<{ url: string; body: string }> = [];
  const beaconNav = {
    ...nav,
    sendBeacon: (url: string, body?: BodyInit | null) => {
      beacons.push({ url, body: String(body) });
      return true;
    },
  };
  const memoryStorage = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStorage.set(key, value),
  };
  const deps = { navigator: beaconNav, fetch: null, random: () => 0.5, sessionStorage: storage, hasPage: true };
  assert.equal(reportClientImageError(event(), deps), true);
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0]!.url, "/api/client-image-error");
  assert.equal(JSON.parse(beacons[0]!.body).fabricCode, "ODG-012");
  assert.equal(reportClientImageError(event(), deps), false, "once per image per session");
  resetClientImageErrorReportsForTests();
  assert.equal(reportClientImageError(event(), deps), false, "sessionStorage remembers it too");
  assert.equal(reportClientImageError(event({ fabricCode: "ODG-013" }), deps), true);
  // First failures are sampled (10 %).
  assert.equal(reportClientImageError(event({ kind: "first", fabricCode: "ODG-014" }), deps), false);
  assert.equal(
    reportClientImageError(event({ kind: "first", fabricCode: "ODG-015" }), { ...deps, random: () => 0.01 }),
    true,
  );
  assert.equal(JSON.parse(beacons.at(-1)!.body).finalFailure, false);
  // No page (SSR/tests) → nothing sent.
  assert.equal(reportClientImageError(event({ fabricCode: "ODG-016" }), { ...deps, hasPage: false }), false);

  // fetch keepalive fallback when sendBeacon is missing or refuses.
  const fetches: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    fetches.push({ url, init });
    return new Response(null, { status: 202 });
  }) as unknown as typeof fetch;
  assert.equal(
    reportClientImageError(event({ fabricCode: "ODG-017" }), {
      ...deps,
      navigator: { ...nav, sendBeacon: () => false },
      fetch: fakeFetch,
    }),
    true,
  );
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0]!.url, "/api/client-image-error");
  assert.equal(fetches[0]!.init.method, "POST");
  assert.equal(fetches[0]!.init.keepalive, true);
  assert.equal(JSON.parse(String(fetches[0]!.init.body)).fabricCode, "ODG-017");
  resetClientImageErrorReportsForTests();
}

// ---------------------------------------------------------------------------
// 9. Logging endpoint: validation, size limit, rate limit, method, routing
// ---------------------------------------------------------------------------
{
  const createResponse = () => {
    const state = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown };
    const response: HttpResponse = {
      status(code) {
        state.status = code;
        return response;
      },
      setHeader(name, value) {
        state.headers[name.toLowerCase()] = value;
        return response;
      },
      json(body) {
        state.body = body;
        return body;
      },
    };
    return { response, state };
  };
  const validBody = {
    fabricCode: "ODG-012",
    imageHost: "firebasestorage.googleapis.com",
    attempts: 10,
    finalFailure: true,
    surface: "fabric-card",
    source: "original",
    online: true,
    effectiveType: "3g",
    userAgent: "Mozilla/5.0 Test",
  };
  const req = (body: unknown, extra: Partial<HttpRequest> & { query?: unknown; url?: string } = {}) =>
    ({
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1", "user-agent": "UA header" },
      body,
      query: { route: "client-image-error" },
      ...extra,
    }) as HttpRequest & { query?: unknown };

  const lines: string[] = [];
  const handler = createClientImageErrorHandler({
    allow: createClientImageErrorRateLimiter({ perClientLimit: 3, now: () => 0 }),
    log: (line) => lines.push(line),
    now: () => new Date("2026-10-20T17:00:00.000Z"),
  });

  const ok = createResponse();
  await handler(req(validBody), ok.response);
  assert.equal(ok.state.status, 202);
  assert.deepEqual(ok.state.body, { ok: true });
  assert.equal(ok.state.headers["cache-control"], "no-store");
  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]!);
  assert.equal(logged.event, "client_image_error");
  assert.equal(logged.fabricCode, "ODG-012");
  assert.equal(logged.finalFailure, true);
  assert.equal(logged.at, "2026-10-20T17:00:00.000Z");
  assert.equal(logged.userAgent, "Mozilla/5.0 Test");

  // sendBeacon text/plain body arrives as a string (or bytes).
  const asText = createResponse();
  const { userAgent: _omit, ...withoutUa } = validBody;
  await handler(req(JSON.stringify(withoutUa)), asText.response);
  assert.equal(asText.state.status, 202);
  assert.equal(JSON.parse(lines[1]!).userAgent, "UA header", "falls back to the request header");
  const asBytes = createResponse();
  await handler(req(new TextEncoder().encode(JSON.stringify(validBody))), asBytes.response);
  assert.equal(asBytes.state.status, 202);

  // Rate limit: 3 per client per window.
  const limited = createResponse();
  await handler(req(validBody), limited.response);
  assert.equal(limited.state.status, 429);
  assert.equal((limited.state.body as { code: string }).code, "RATE_LIMITED");
  const otherClient = createResponse();
  await handler(
    req(validBody, { headers: { "x-forwarded-for": "198.51.100.1" } }),
    otherClient.response,
  );
  assert.equal(otherClient.state.status, 202, "limits are per client");

  const bad = (body: unknown, headers: Record<string, string> = {}) =>
    validateClientImageErrorBody({ method: "POST", headers, body });
  const expectStatus = (result: ReturnType<typeof bad>, status: number, label: string) => {
    assert.equal("report" in result ? 200 : result.status, status, label);
  };
  expectStatus(bad(validBody), 200, "valid");
  expectStatus(bad({ ...validBody, effectiveType: undefined }), 200, "effectiveType optional");
  expectStatus(bad({ ...validBody, effectiveType: null }), 200, "effectiveType null");
  expectStatus(bad("not json"), 400, "not JSON");
  expectStatus(bad([validBody]), 400, "array");
  expectStatus(bad(null), 400, "empty");
  expectStatus(bad({ ...validBody, extra: 1 }), 400, "unknown field");
  expectStatus(bad({ ...validBody, fabricCode: "" }), 400, "empty code");
  expectStatus(bad({ ...validBody, fabricCode: "<img src=x>" }), 400, "code chars");
  expectStatus(bad({ ...validBody, fabricCode: "A".repeat(41) }), 400, "code length");
  expectStatus(bad({ ...validBody, imageHost: "https://x.test/a" }), 400, "host must be a host");
  expectStatus(bad({ ...validBody, attempts: 0 }), 400, "attempts min");
  expectStatus(bad({ ...validBody, attempts: 1.5 }), 400, "attempts integer");
  expectStatus(bad({ ...validBody, attempts: 101 }), 400, "attempts max");
  expectStatus(bad({ ...validBody, attempts: "3" }), 400, "attempts type");
  expectStatus(bad({ ...validBody, finalFailure: "yes" }), 400, "finalFailure type");
  expectStatus(bad({ ...validBody, online: 1 }), 400, "online type");
  expectStatus(bad({ ...validBody, surface: "admin" }), 400, "surface enum");
  expectStatus(bad({ ...validBody, source: "cdn" }), 400, "source enum");
  expectStatus(bad({ ...validBody, effectiveType: "5g" }), 400, "effectiveType enum");
  expectStatus(bad({ ...validBody, userAgent: "u".repeat(301) }), 400, "userAgent length");
  expectStatus(
    bad(JSON.stringify({ ...validBody, userAgent: "u".repeat(CLIENT_IMAGE_ERROR_MAX_BODY_BYTES) })),
    413,
    "body size (string)",
  );
  expectStatus(
    bad(validBody, { "content-length": String(CLIENT_IMAGE_ERROR_MAX_BODY_BYTES + 1) }),
    413,
    "declared size",
  );

  // Through the real Vercel function (api/health.ts) with the rewrite marker.
  const viaHealthBad = createResponse();
  await healthHandler(req({ fabricCode: "x" }), viaHealthBad.response);
  assert.equal(viaHealthBad.state.status, 400);
  const viaHealthGet = createResponse();
  await healthHandler(req(undefined, { method: "GET" }), viaHealthGet.response);
  assert.equal(viaHealthGet.state.status, 405);
  assert.equal(viaHealthGet.state.headers.allow, "POST");
  // Plain /api/health is unchanged.
  const plainHealth = createResponse();
  await healthHandler({ method: "GET", headers: {} }, plainHealth.response);
  assert.equal((plainHealth.state.body as { status?: string }).status, "ok");

  assert.equal(isClientImageErrorRequest({ headers: {}, url: "/api/client-image-error" }), true);
  assert.equal(isClientImageErrorRequest({ headers: {}, url: "/api/health?route=client-image-error" }), true);
  assert.equal(isClientImageErrorRequest({ headers: {}, url: "/api/health" }), false);
  assert.equal(isClientImageErrorRequest({ headers: {}, query: { route: ["client-image-error"] } } as HttpRequest), true);

  // Global cap per instance.
  const globalLimiter = createClientImageErrorRateLimiter({ perClientLimit: 100, globalLimit: 2, now: () => 0 });
  assert.equal(globalLimiter("a"), true);
  assert.equal(globalLimiter("b"), true);
  assert.equal(globalLimiter("c"), false);
  let clock = 0;
  const windowLimiter = createClientImageErrorRateLimiter({ perClientLimit: 1, windowMs: 1000, now: () => clock });
  assert.equal(windowLimiter("a"), true);
  assert.equal(windowLimiter("a"), false);
  clock = 1000;
  assert.equal(windowLimiter("a"), true, "a new window resets the count");
}

delete (globalThis as { window?: unknown }).window;
console.log("PASS: fabric photo reliability (resized photos, retries, reload, failure logging)");
