import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { lazyView, retryImportOnce } from "./src/utils/lazyView";
import {
  useImageLoadRetry,
  withImageRetryMarker,
  type ImageLoadRetryState,
} from "./src/hooks/useImageLoadRetry";
import { ViewLoadingFallback } from "./src/components/ViewLoadingFallback";
import { REVIEWS_LOADING_TIMEOUT_MS } from "./src/utils/customerReviews";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const noWait = () => Promise.resolve();

const run = async () => {
  // Lazy tab chunks: a failed import is retried once.
  let calls = 0;
  const flaky = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error("chunk failed")) : Promise.resolve("ok");
  };
  assert.equal(await retryImportOnce(flaky, noWait), "ok");
  assert.equal(calls, 2);

  let hardCalls = 0;
  await assert.rejects(
    retryImportOnce(() => {
      hardCalls += 1;
      return Promise.reject(new Error(`fail ${hardCalls}`));
    }, noWait),
    /fail 1/,
  );
  assert.equal(hardCalls, 2, "only one retry");

  // Prefetch shares the render import and does not reject.
  let loads = 0;
  const view = lazyView(async () => {
    loads += 1;
    return { default: () => null };
  });
  await Promise.all([view.prefetch(), view.prefetch()]);
  assert.equal(loads, 1, "prefetch dedupes the chunk import");

  // Image retry marker.
  const storageUrl =
    "https://firebasestorage.googleapis.com/v0/b/x/o/fabrics%2Fa.jpeg?alt=media&token=t";
  assert.equal(withImageRetryMarker(storageUrl, 0), storageUrl);
  assert.equal(withImageRetryMarker(storageUrl, 1), `${storageUrl}&imgRetry=1`);
  assert.equal(withImageRetryMarker("https://a.test/i.webp", 1), "https://a.test/i.webp?imgRetry=1");
  assert.equal(withImageRetryMarker("/images/local.webp", 1), "/images/local.webp");
  assert.equal(withImageRetryMarker("data:image/png;base64,AA", 1), "data:image/png;base64,AA");

  // useImageLoadRetry: retries with growing gaps (5, 10, 20, 40 ms here),
  // each with a fresh query marker, then fails.
  let latest: ImageLoadRetryState | null = null;
  const Probe = ({ url }: { url: string | null }) => {
    latest = useImageLoadRetry(url, 5);
    return null;
  };
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe, { url: storageUrl }));
  });
  assert.equal(latest!.src, storageUrl);
  assert.equal(latest!.failed, false);
  for (let retry = 1; retry <= 4; retry += 1) {
    await act(async () => {
      latest!.onError();
      await sleep(5 * 2 ** (retry - 1) + 25);
    });
    assert.equal(latest!.src, `${storageUrl}&imgRetry=${retry}`);
    assert.equal(latest!.failed, false);
  }
  await act(async () => {
    latest!.onError();
  });
  assert.equal(latest!.failed, true);
  await act(async () => {
    renderer!.update(createElement(Probe, { url: "https://a.test/new.webp" }));
  });
  assert.equal(latest!.failed, false, "a new URL resets the retry state");
  assert.equal(latest!.src, "https://a.test/new.webp");
  await act(async () => {
    renderer!.update(createElement(Probe, { url: null }));
  });
  assert.equal(latest!.failed, true, "no URL shows the fallback");
  await act(async () => renderer!.unmount());

  // Suspense fallback offers a reload when a view chunk stalls.
  let fallback: ReactTestRenderer;
  await act(async () => {
    fallback = create(createElement(ViewLoadingFallback, { slowAfterMs: 10 }));
  });
  assert.doesNotMatch(JSON.stringify(fallback!.toJSON()), /Reload page/);
  await act(async () => {
    await sleep(30);
  });
  assert.match(JSON.stringify(fallback!.toJSON()), /Reload page/);
  assert.match(JSON.stringify(fallback!.toJSON()), /taking longer than usual/);
  await act(async () => fallback!.unmount());

  // Reviews never wait on the listener forever; App prefetches tab chunks.
  assert.ok(REVIEWS_LOADING_TIMEOUT_MS > 0 && REVIEWS_LOADING_TIMEOUT_MS <= 10000);
  const reviewsSource = readFileSync("src/components/ReviewsView.tsx", "utf8");
  assert.match(reviewsSource, /REVIEWS_LOADING_TIMEOUT_MS/);
  const appSource = readFileSync("src/App.tsx", "utf8");
  assert.match(appSource, /prefetchWhenIdle\(IDLE_PREFETCH_VIEWS\)/);
  assert.match(appSource, /<Suspense fallback={<ViewLoadingFallback \/>}>/);
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const assetsRule = vercel.headers.find((rule: { source: string }) => rule.source === "/assets/(.*)");
  assert.equal(
    assetsRule?.headers.find((header: { key: string }) => header.key === "Cache-Control")?.value,
    "public, max-age=31536000, immutable",
  );

  console.log("PASS: smoke-test fixes (lazy view retry/prefetch, image retry, reviews timeout)");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
