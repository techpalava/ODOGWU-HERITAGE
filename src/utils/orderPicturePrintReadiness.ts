/**
 * Order details dialog: every picture tile loads right away, and Print / Save
 * PDF waits until the tiles have loaded (or failed), so the PDF never prints
 * a placeholder for an image that was still on its way.
 */

export const ORDER_PICTURE_IMAGE_SELECTOR = "[data-order-picture-tiles] img";
export const ORDER_PICTURE_PRINT_TIMEOUT_MS = 8000;

const makeEager = (root: ParentNode) => {
  root.querySelectorAll<HTMLImageElement>(ORDER_PICTURE_IMAGE_SELECTOR).forEach((image) => {
    if (image.loading !== "eager") image.loading = "eager";
  });
};

/** Switches the tiles' lazy images to eager now and as tiles appear. Returns the cleanup. */
export const eagerLoadOrderPictureImages = (root: HTMLElement | null): (() => void) => {
  if (!root) return () => {};
  makeEager(root);
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(() => makeEager(root));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
};

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

const imageSettled = (image: HTMLImageElement) =>
  image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });

/**
 * Waits for uploaded-design reads in flight, lets React render the result,
 * then waits for every tile image. Never waits longer than the timeout.
 */
export const waitForOrderPicturesBeforePrint = async (
  root: HTMLElement | null,
  settleUploads: () => Promise<void>,
  timeoutMs = ORDER_PICTURE_PRINT_TIMEOUT_MS,
): Promise<void> => {
  if (!root) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const ready = (async () => {
    await settleUploads().catch(() => undefined);
    await nextFrame();
    await nextFrame();
    makeEager(root);
    await Promise.all(
      [...root.querySelectorAll<HTMLImageElement>(ORDER_PICTURE_IMAGE_SELECTOR)].map(imageSettled),
    );
  })();
  try {
    await Promise.race([ready, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
