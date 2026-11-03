# Checkout end-to-end test (manual)

A Playwright suite that walks a real Design Studio order (one Standard Shirt,
first available fabric, height-only measurements) on a live deployment and
checks every Stage 10 payment method in **Stripe test mode**.

It is **not** part of CI, the Vercel build, or any default `npm` test. Run it
on purpose with `npm run test:e2e:checkout`, or from GitHub Actions →
**E2E checkout (manual)** → *Run workflow*.

## What it checks

| Test | Sign-in | Asserts |
| --- | --- | --- |
| guest › pickup | no | Card and iDEAL pills show, Klarna and Pix do not; iDEAL + Pay shows an outcome (the sign-in prompt), never nothing |
| guest › Express Checkout | no | The wallet shell mounts Stripe's Express Checkout iframe and reports `available` or `hidden`; with `E2E_EXPECT_WALLET=1` it must be `available` |
| guest › Brazil delivery | no | The Pix pill and its help text show; Pix + Pay shows an outcome |
| signed-in › Card | yes | Card 4242 4242 4242 4242 pays, **Order confirmed** shows, and the dashboard shows **Paid (test)** for that order |
| signed-in › iDEAL | yes | Pay leaves the site for Stripe's iDEAL test page, *Authorize Test Payment*, returns, and the dashboard shows **Paid (test)** |
| signed-in › Pix | yes | Pix + Pay for a Brazil delivery reaches `https://checkout.stripe.com/` (Pix itself needs Stripe account activation, so nothing is paid) |

Every Pay click goes through `clickPayExpectingOutcome`, which fails if Pay
produces no redirect, confirmation, alert, redirect notice, or sign-in prompt
within 60–90 s. That covers the old “Pay does nothing” bug from #631.

Google Pay and Apple Pay can't be completed headless, so only the wallet setup is checked.
Klarna is out of scope: the Stripe test account cannot accept Klarna in EUR.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `E2E_BASE_URL` | **yes** | Deployment to test, e.g. `https://odogwu-heritage.vercel.app`. There is no default; the suite fails fast if it is missing. |
| `E2E_EMAIL` | signed-in tests | Email of a **dedicated E2E customer account** (never a personal account). |
| `E2E_PIN` | signed-in tests | That account's 4- or 6-digit login PIN. `E2E_PASSWORD` is accepted as an alias. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | protected previews | Vercel *Protection Bypass for Automation* secret. The first page load sends it as `x-vercel-protection-bypass` with `x-vercel-set-bypass-cookie=true`, so Vercel sets a bypass cookie for the session. It is only sent to the deployment, not to Stripe or Firebase. |
| `E2E_EXPECT_WALLET` | no | `1` makes the wallet test require `available` (use with a build where Google Pay is `"always"`, in Chrome). |
| `E2E_CHROME_PATH` / `E2E_BROWSER_CHANNEL` | no | Use an installed Chrome (`/usr/bin/google-chrome`) or channel (`chrome`) instead of Playwright's Chromium. |
| `E2E_VIDEO` | no | `1` records video on failure (needs `npx playwright install ffmpeg`). |

Without `E2E_EMAIL` / `E2E_PIN`, the three signed-in tests are **skipped** and
the guest tests still run.

Never commit credentials. Locally, export them in your shell. In GitHub, add
repository secrets `E2E_EMAIL`, `E2E_PIN`, and (for previews)
`VERCEL_AUTOMATION_BYPASS_SECRET` under Settings → Secrets and variables → Actions.

## Run locally

```bash
npm ci
npx playwright install chromium        # or set E2E_CHROME_PATH=/usr/bin/google-chrome
export E2E_BASE_URL=https://odogwu-heritage.vercel.app
export E2E_EMAIL=...                   # dedicated E2E customer
export E2E_PIN=...
npm run test:e2e:checkout              # all tests
npm run test:e2e:checkout -- --grep guest   # only the no-sign-in tests
```

Reports go to `playwright-report/e2e-checkout/`, and traces and screenshots of failures go to
`test-results/e2e-checkout/`. Both are git-ignored.

## Test data

Guest tests create no orders; Pay stops at the sign-in prompt.

The signed-in tests create **real orders in the deployment's Firestore** (the
live site uses the committed staging Firebase project). Every order is tagged:

- Recipient name `E2E TEST Checkout Bot`
- Pickup/delivery note `E2E TEST: automated checkout test in Stripe test mode. Do not fulfil.`
- Paid in Stripe **test mode** only (the site rejects non-`pk_test_` keys).

One run creates up to three orders: Card (paid), iDEAL (paid), and Pix (unpaid; its
Checkout Session expires after an hour). Staff can filter them by the
`E2E TEST` tag. Each run starts a fresh Individual Order and replaces the E2E
account's unfinished draft.

## Set up the E2E customer

1. Create a customer account on the site (Login → Create Account) with an
   address you control, e.g. `e2e+checkout@<your domain>`, and a 6-digit PIN.
2. Use it only for this suite. Store its email and PIN as the secrets above.
