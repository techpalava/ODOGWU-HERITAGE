import { expect, type Locator, type Page } from "@playwright/test";

/** Every order this suite creates carries this tag in the recipient name and note. */
export const E2E_TAG = "E2E TEST";
export const E2E_RECIPIENT_NAME = `${E2E_TAG} Checkout Bot`;
export const E2E_NOTE = `${E2E_TAG}: automated checkout test in Stripe test mode. Do not fulfil.`;
export const STRIPE_TEST_CARD = "4242424242424242";

export type E2EDelivery = "pickup" | "brazil";

export const e2eEnv = () => ({
  baseURL: (process.env.E2E_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  email: (process.env.E2E_EMAIL ?? "").trim(),
  pin: (process.env.E2E_PIN ?? process.env.E2E_PASSWORD ?? "").trim(),
  bypassSecret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim(),
  expectWallet: process.env.E2E_EXPECT_WALLET === "1",
});

export const hasE2ECredentials = () => {
  const env = e2eEnv();
  return Boolean(env.email && env.pin);
};

export const requireBaseURL = (): string => {
  const { baseURL } = e2eEnv();
  if (!baseURL) {
    throw new Error(
      "E2E_BASE_URL is not set. Point it at the deployment to test, e.g. https://odogwu-heritage.vercel.app",
    );
  }
  return baseURL;
};

/**
 * Opens the site. When VERCEL_AUTOMATION_BYPASS_SECRET is set, the first load
 * passes it as Vercel's protection-bypass query parameters so Vercel sets a
 * bypass cookie for the rest of the session (needed for protected previews).
 * The secret only goes to the deployment, never to Stripe or Firebase.
 */
export const openSite = async (page: Page, path = "/") => {
  const baseURL = requireBaseURL();
  const { bypassSecret } = e2eEnv();
  const url = new URL(path, `${baseURL}/`);
  if (bypassSecret) {
    url.searchParams.set("x-vercel-protection-bypass", bypassSecret);
    url.searchParams.set("x-vercel-set-bypass-cookie", "true");
  }
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /^home$/i }).first()).toBeVisible();
};

const headerButton = (page: Page, name: RegExp) =>
  page.locator("header, nav").getByRole("button", { name }).first();

/** Signs in with the dedicated E2E customer (email + 4/6-digit PIN). */
export const signIn = async (page: Page) => {
  const { email, pin } = e2eEnv();
  if (!email || !pin) throw new Error("E2E_EMAIL and E2E_PIN are required to sign in.");
  const logout = page.locator('button[title="Logout"]').first();
  if (await logout.isVisible().catch(() => false)) return;
  await page.locator('button[title="Login"]').first().click();
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(pin);
  await page.locator('button[type="submit"]').filter({ hasText: /sign in/i }).first().click();
  await expect(logout).toBeVisible({ timeout: 30_000 });
};

const forward = (page: Page) => page.locator('[data-studio-nav="forward"]:visible').first();

/** Clicks the step Continue once it is enabled. */
export const clickContinue = async (page: Page) => {
  const button = forward(page);
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute("aria-disabled", "true");
  // The unlocked Continue button pulses (gold beam), so it never counts as
  // "stable". It is visible and enabled at this point, so click without that wait.
  await button.click({ force: true });
};

const stepTitle = (page: Page, id: string): Locator => page.locator(`#${id}`);

/** Home → Start Individual Order, replacing any unfinished draft. */
export const startIndividualOrder = async (page: Page) => {
  await headerButton(page, /^home$/i).click();
  await page.getByRole("button", { name: /start individual order/i }).first().click();
  const startFresh = page.locator("[data-individual-order-start-fresh]");
  const garmentStep = stepTitle(page, "future-garment-type-step-title");
  await expect(startFresh.or(garmentStep).first()).toBeVisible();
  if (await startFresh.isVisible()) await startFresh.click();
  await expect(garmentStep).toBeVisible();
};

/** Picks the first Design Style that can be applied to the Standard Shirt. */
const chooseDesignStyle = async (page: Page) => {
  const useButtons = page.locator('button[aria-label^="Use This Design"]');
  await expect(useButtons.first()).toBeVisible();
  const count = await useButtons.count();
  for (let index = 0; index < count; index += 1) {
    await useButtons.nth(index).scrollIntoViewIfNeeded();
    await useButtons.nth(index).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const boxes = dialog.locator('input[type="checkbox"]');
    for (let box = 0; box < (await boxes.count()); box += 1) {
      await boxes.nth(box).check();
    }
    const apply = dialog.locator('[data-testid="apply-design-mapping"]');
    if (await apply.isEnabled()) {
      await apply.click();
      await expect(dialog).toBeHidden();
      return;
    }
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
  }
  throw new Error("No Design Style could be applied to the Standard Shirt.");
};

const fillDelivery = async (page: Page, delivery: E2EDelivery, email: string) => {
  await expect(page.locator('input[name="future-fulfilment-method"]').first()).toBeVisible();
  if (delivery === "pickup") {
    await page.locator('input[value="eindhoven_pickup"]').check();
  } else {
    await page.locator('input[value="destination_delivery"]').check();
  }
  await page.locator("#future-shipping-full-name").fill(E2E_RECIPIENT_NAME);
  await page.locator("#future-shipping-phone").fill("+31 6 12345678");
  await page.locator("#future-shipping-email").fill(email);
  if (delivery === "brazil") {
    await page.locator("#future-shipping-country").selectOption("BR");
    await page.locator("#future-shipping-address").fill("Avenida Paulista 1000");
    await page.locator("#future-shipping-city").fill("Sao Paulo");
    await page.locator("#future-shipping-region").fill("SP");
    await page.locator("#future-shipping-postal").fill("01310-100");
  }
  await page.locator('[data-studio-step-main] textarea').first().fill(E2E_NOTE);
  await page.locator("#future-shipping-email").press("Tab");
};

/**
 * Walks Design Studio Steps 1–9 with the cheapest simple order (one Standard
 * Shirt, first available fabric, height-only measurements) and stops on
 * Step 10 with the Pay button visible.
 */
export const walkToPaymentReview = async (
  page: Page,
  { delivery, email }: { delivery: E2EDelivery; email: string },
) => {
  await startIndividualOrder(page);

  // Step 1: Garment Type
  // The garment catalogue re-renders while it loads, so the card button can be
  // replaced between Playwright's actionability checks. Click it in the page
  // and retry until it reports pressed.
  const shirt = '[data-testid="step1-garment-select-shirt"]';
  await expect(page.locator(shirt)).toBeVisible();
  await expect
    .poll(
      async () =>
        page.evaluate((selector) => {
          const button = document.querySelector<HTMLButtonElement>(selector);
          if (!button) return "missing";
          if (button.getAttribute("aria-pressed") !== "true") button.click();
          return button.getAttribute("aria-pressed");
        }, shirt),
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBe("true");
  await page.locator("#future-garment-type-step-demographic-male").check();
  await clickContinue(page);

  // Step 2: Fabric
  const fabric = page.locator('[data-fabric-action="select"]:enabled').first();
  await expect(fabric).toBeVisible();
  await fabric.click();
  const decline = page.locator('[data-testid="remaining-fabric-capacity-offer-decline"]');
  const designStep = stepTitle(page, "future-design-style-title");
  await expect(decline.or(forward(page)).first()).toBeVisible();
  if (await decline.isVisible()) {
    await decline.click();
  } else {
    await clickContinue(page);
  }

  // Step 3: Design Style
  await expect(designStep).toBeVisible();
  await chooseDesignStyle(page);
  await clickContinue(page);

  // Step 4: Custom Details (defaults) and Step 5: Personalized Additions (none)
  await expect(stepTitle(page, "future-custom_details-title")).toBeVisible();
  await clickContinue(page);
  await expect(page.locator("h2", { hasText: /personalized additions/i }).first()).toBeVisible();
  await clickContinue(page);

  // Step 6: AI Try-on (skip)
  await expect(stepTitle(page, "future-ai-try-on-title")).toBeVisible();
  await page.getByRole("button", { name: /continue without ai try-on/i }).click();

  // Step 7: Measurement (height only)
  await expect(stepTitle(page, "future-measurement-title")).toBeVisible();
  await page.locator('input[value="critical_risk"]').check();
  const heights = page.locator('input[aria-label^="Total Height"]');
  await expect(heights.first()).toBeVisible();
  for (let index = 0; index < (await heights.count()); index += 1) {
    await heights.nth(index).fill("178");
  }
  await heights.first().press("Tab");
  await clickContinue(page);

  // Step 8: Summary
  await expect(stepTitle(page, "future-summary-title")).toBeVisible();
  await clickContinue(page);

  // Step 9: Delivery & Pickup
  await fillDelivery(page, delivery, email);
  await clickContinue(page);

  // Step 10: Order Review & Payment
  await expect(page.locator("[data-future-order-v2-pay]")).toBeVisible();
};

export const payButton = (page: Page) => page.locator("[data-future-order-v2-pay]");

/**
 * Pay must never be a silent no-op. After clicking it, one of these must
 * happen: navigation away from the site (bank, Stripe), Order confirmed, a
 * visible payment alert, a redirect notice, or the sign-in prompt.
 */
export const clickPayExpectingOutcome = async (page: Page, timeout = 60_000) => {
  const siteHost = new URL(requireBaseURL()).host;
  await expect(payButton(page)).toBeEnabled();
  await payButton(page).click();
  const visibleOutcome = page
    .locator("[data-future-order-v2-confirmed]")
    .or(page.locator("[data-future-order-v2-redirecting]"))
    .or(page.locator("[data-future-payment-sign-in]"))
    .or(page.locator('[data-studio-step-main] [role="alert"]'))
    .first();
  const outcome = await Promise.race([
    page
      .waitForURL((url) => url.host !== siteHost, { timeout })
      .then(() => "left-site" as const),
    visibleOutcome.waitFor({ state: "visible", timeout }).then(() => "visible" as const),
  ]).catch(() => "none" as const);
  expect(outcome, "Pay did nothing: no redirect, confirmation, alert, or sign-in prompt").not.toBe("none");
  return outcome;
};

export const fillStripeTestCard = async (page: Page) => {
  await expect(page.locator("[data-future-order-v2-card-loading]")).toHaveCount(0, { timeout: 30_000 });
  const card = page.frameLocator("[data-future-order-v2-card] iframe").first();
  await card.locator('input[name="cardnumber"]').fill(STRIPE_TEST_CARD);
  await card.locator('input[name="exp-date"]').fill("12 / 34");
  await card.locator('input[name="cvc"]').fill("123");
};

/** Opens the order on the dashboard and expects the Paid (test) badge. */
export const expectOrderPaidOnDashboard = async (page: Page, orderId: string) => {
  await openSite(page, `/?future_order_v2_order_id=${encodeURIComponent(orderId)}`);
  await expect(page.getByText(/paid \(test\)/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(orderId).first()).toBeVisible();
};
