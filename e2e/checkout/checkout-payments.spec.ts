import { expect, test } from "@playwright/test";
import {
  clickPayExpectingOutcome,
  e2eEnv,
  expectOrderPaidOnDashboard,
  fillStripeTestCard,
  hasE2ECredentials,
  openSite,
  payButton,
  requireBaseURL,
  signIn,
  walkToPaymentReview,
} from "./helpers";

/**
 * End-to-end checkout in Stripe TEST mode against E2E_BASE_URL.
 *
 * Guest tests need no credentials: they walk the real Design Studio to Step 10
 * and prove the method pills, the wallet mount, and that Pay always shows an
 * outcome. Signed-in tests need the dedicated E2E customer (E2E_EMAIL and
 * E2E_PIN) and create real, tagged test orders. See e2e/README.md.
 */

const GUEST_EMAIL = "e2e-guest@example.test";
const methodPill = (method: string) => `[data-future-order-v2-method-${method}]`;

test.beforeAll(() => {
  requireBaseURL();
});

test.describe("guest (no sign-in)", () => {
  test("pickup order shows Card and iDEAL, no Klarna, and Pay is never silent", async ({ page }) => {
    await openSite(page);
    await walkToPaymentReview(page, { delivery: "pickup", email: GUEST_EMAIL });

    await expect(page.locator(methodPill("card"))).toBeVisible();
    await expect(page.locator(methodPill("ideal"))).toBeVisible();
    await expect(page.locator(methodPill("klarna"))).toHaveCount(0);
    await expect(page.locator(methodPill("pix"))).toHaveCount(0);

    // iDEAL was the method where Pay once did nothing (#631).
    await page.locator(methodPill("ideal")).click();
    await expect(page.locator(methodPill("ideal"))).toHaveAttribute("aria-checked", "true");
    await clickPayExpectingOutcome(page);
    await expect(page.locator("[data-future-payment-sign-in]")).toBeVisible();
  });

  test("Express Checkout mounts and reports wallet availability", async ({ page }) => {
    await openSite(page);
    await walkToPaymentReview(page, { delivery: "pickup", email: GUEST_EMAIL });

    const shell = page.locator("[data-future-order-v2-express-checkout]");
    await expect(shell).toHaveCount(1);
    // Stripe mounted its Express Checkout iframe inside the shell.
    await expect(shell.locator("iframe").first()).toBeAttached({ timeout: 30_000 });
    // The shell state is Stripe's availability answer: "available" or "hidden".
    await expect(shell).toHaveAttribute("data-future-order-v2-express-checkout", /^(available|hidden)$/);
    const state = await shell.getAttribute("data-future-order-v2-express-checkout");
    test.info().annotations.push({ type: "wallet", description: `Express Checkout reported: ${state}` });
    if (e2eEnv().expectWallet) {
      // Only meaningful where a wallet can show (e.g. googlePay "always" in Chrome).
      await expect(shell).toHaveAttribute("data-future-order-v2-express-checkout", "available");
      await expect(shell).toBeVisible();
    }
    // A hidden wallet shell must never block the method pills or Pay.
    await page.locator(methodPill("card")).click();
    await expect(payButton(page)).toBeVisible();
  });

  test("Brazil delivery shows the Pix pill and Pay is never silent", async ({ page }) => {
    await openSite(page);
    await walkToPaymentReview(page, { delivery: "brazil", email: GUEST_EMAIL });

    await expect(page.locator(methodPill("pix"))).toBeVisible();
    await page.locator(methodPill("pix")).click();
    await expect(page.locator("[data-future-order-v2-pix-help]")).toBeVisible();
    await clickPayExpectingOutcome(page);
    await expect(page.locator("[data-future-payment-sign-in]")).toBeVisible();
  });
});

test.describe("signed-in E2E customer", () => {
  test.skip(!hasE2ECredentials(), "Set E2E_EMAIL and E2E_PIN for the dedicated E2E test customer.");

  test.beforeEach(async ({ page }) => {
    await openSite(page);
    await signIn(page);
  });

  test("Card 4242 pays and the order shows Paid (test)", async ({ page }) => {
    await walkToPaymentReview(page, { delivery: "pickup", email: e2eEnv().email });
    await page.locator(methodPill("card")).click();
    await fillStripeTestCard(page);
    await clickPayExpectingOutcome(page, 90_000);

    const confirmed = page.locator("[data-future-order-v2-confirmed]");
    await expect(confirmed).toBeVisible({ timeout: 90_000 });
    const orderId = (await page.locator("[data-future-order-v2-confirmed-order-id]").innerText()).trim();
    expect(orderId).toMatch(/^future-order-/);
    test.info().annotations.push({ type: "order", description: `card ${orderId}` });
    await expectOrderPaidOnDashboard(page, orderId);
  });

  test("iDEAL redirects to the Stripe test bank, authorizes, returns, and shows Paid (test)", async ({ page }) => {
    const siteHost = new URL(requireBaseURL()).host;
    await walkToPaymentReview(page, { delivery: "pickup", email: e2eEnv().email });
    await page.locator(methodPill("ideal")).click();
    const outcome = await clickPayExpectingOutcome(page, 90_000);
    expect(outcome).toBe("left-site");

    // Stripe's iDEAL test page.
    await page.getByRole("button", { name: /authorize test payment/i }).click({ timeout: 60_000 });
    await page.waitForURL(
      (url) => url.host === siteHost && url.searchParams.get("future_order_v2_stripe_return") === "1",
      { timeout: 90_000 },
    );
    const orderId = new URL(page.url()).searchParams.get("future_order_v2_order_id") ?? "";
    expect(orderId).toMatch(/^future-order-/);
    test.info().annotations.push({ type: "order", description: `ideal ${orderId}` });
    // The return handler records the payment and opens the dashboard.
    await expect(page.getByText(/paid \(test\)/i).first()).toBeVisible({ timeout: 90_000 });
    await expectOrderPaidOnDashboard(page, orderId);
  });

  test("Pix for a Brazil delivery reaches Stripe-hosted Checkout", async ({ page }) => {
    await walkToPaymentReview(page, { delivery: "brazil", email: e2eEnv().email });
    await page.locator(methodPill("pix")).click();
    const outcome = await clickPayExpectingOutcome(page, 90_000);
    expect(outcome).toBe("left-site");
    // Pix itself needs Stripe account activation; only assert the hand-off.
    await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 60_000 });
  });
});
