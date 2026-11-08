import assert from "node:assert/strict";
import { createElement, Suspense, type ComponentType } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { lazyView } from "./src/utils/lazyView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noWait = () => Promise.resolve();

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

const sectionTree = (View: ComponentType) =>
  createElement(
    ErrorBoundary,
    null,
    createElement(
      Suspense,
      { fallback: createElement("p", null, "loading") },
      createElement(View),
    ),
  );

const textOf = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

const run = async () => {
  const originalError = console.error;
  console.error = () => undefined;
  try {
  // A section script fails twice (the built-in single retry), then Try Again
  // loads it once the failure is gone. Nothing keeps retrying on its own.
  let aboutLoads = 0;
  const about = lazyView(async () => {
    aboutLoads += 1;
    if (aboutLoads <= 2) throw new Error("offline");
    return {
      default: function AboutReady() {
        return createElement("h1", null, "About the NTCC Project");
      },
    };
  }, noWait);

  let aboutRenderer!: ReactTestRenderer;
  await act(async () => {
    aboutRenderer = create(sectionTree(about.Component));
    await flush();
  });
  assert.equal(aboutLoads, 2, "a failed section tries its script once more, then stops");
  assert.match(textOf(aboutRenderer), /Try Again/);
  assert.doesNotMatch(textOf(aboutRenderer), /About the NTCC Project/);

  await act(async () => {
    await flush();
  });
  assert.equal(aboutLoads, 2, "the error card does not retry the script by itself");

  await act(async () => {
    aboutRenderer.root.findByType("button").props.onClick();
    await flush();
  });
  assert.equal(aboutLoads, 3, "Try Again asks for the script once");
  assert.match(textOf(aboutRenderer), /About the NTCC Project/);
  assert.doesNotMatch(textOf(aboutRenderer), /Try Again/);

  await act(async () => {
    await flush();
  });
  assert.equal(aboutLoads, 3, "a recovered section does not load again");
  await act(async () => aboutRenderer.unmount());

  // Still offline: one Try Again is two script attempts, then the card stays.
  let galleryLoads = 0;
  const gallery = lazyView(async () => {
    galleryLoads += 1;
    throw new Error("still offline");
  }, noWait);
  let galleryRenderer!: ReactTestRenderer;
  await act(async () => {
    galleryRenderer = create(sectionTree(gallery.Component));
    await flush();
  });
  assert.equal(galleryLoads, 2);
  await act(async () => {
    galleryRenderer.root.findByType("button").props.onClick();
    await flush();
  });
  assert.equal(galleryLoads, 4, "Try Again makes one fresh attempt, including its single built-in retry");
  assert.match(textOf(galleryRenderer), /Try Again/);
  await act(async () => {
    await flush();
  });
  assert.equal(galleryLoads, 4, "a second failure does not start another attempt");
  await act(async () => galleryRenderer.unmount());

  // A section that already loaded is left alone when another section retries.
  let termsLoads = 0;
  const terms = lazyView(async () => {
    termsLoads += 1;
    return {
      default: function TermsReady() {
        return createElement("h1", null, "Terms & Conditions");
      },
    };
  }, noWait);
  let termsRenderer!: ReactTestRenderer;
  await act(async () => {
    termsRenderer = create(sectionTree(terms.Component));
    await flush();
  });
  assert.match(textOf(termsRenderer), /Terms & Conditions/);
  assert.equal(termsLoads, 1);

  let reviewsLoads = 0;
  const reviews = lazyView(async () => {
    reviewsLoads += 1;
    if (reviewsLoads <= 2) throw new Error("offline");
    return {
      default: function ReviewsReady() {
        return createElement("h1", null, "Stories from our community");
      },
    };
  }, noWait);
  let reviewsRenderer!: ReactTestRenderer;
  await act(async () => {
    reviewsRenderer = create(sectionTree(reviews.Component));
    await flush();
  });
  await act(async () => {
    reviewsRenderer.root.findByType("button").props.onClick();
    await flush();
  });
  assert.match(textOf(reviewsRenderer), /Stories from our community/);
  assert.equal(reviewsLoads, 3);

  await act(async () => termsRenderer.unmount());
  await act(async () => {
    termsRenderer = create(sectionTree(terms.Component));
    await flush();
  });
  assert.equal(termsLoads, 1, "retrying one section does not reload a section that already loaded");
  assert.match(textOf(termsRenderer), /Terms & Conditions/);
  await act(async () => {
    termsRenderer.unmount();
    reviewsRenderer.unmount();
  });

  console.log("PASS: lazy section Try Again recovers one failed chunk and does not loop");
  } finally {
    console.error = originalError;
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
