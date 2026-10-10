# Security audit — 2026-10-07

Role: website security audit and deep checks only. No remediations, rules deploys, secret changes, dependency bumps, or application edits are in this change.

| Item | Value |
| --- | --- |
| Repository | `techpalava/ODOGWU-HERITAGE` |
| Audited tree | `github/main` `a1ed8de9bd7f287a0f910046d2fb35494aa79246` |
| Live target | `https://odogwu-heritage.vercel.app` |
| Live `/api/health` | `200` `{ status: "ok", buildId: "bdf7cb5d162c886dc77c52d47ead0010de3d97d5" }` |
| Tree vs live SHA | `git diff bdf7cb5d162c886dc77c52d47ead0010de3d97d5 a1ed8de9bd7f287a0f910046d2fb35494aa79246` is empty (same tree) |
| Stack | Vite/React/TS, Firebase Auth/Firestore/Storage, 12 Vercel `api/*` functions, Stripe test mode only |
| Method | Static review of `github/main`, safe live curls, existing unit tests after `npm ci` |

## Severity counts

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 4 |
| Info | 6 |

No regressions of the previously closed Mediums. Those controls still hold. See the last section.

## Executive summary

- PIN registration creates a Firebase user with `emailVerified: true` and returns a custom token without proving the mailbox. That can pre-bind a customer email before the real person signs in with Google.
- Stripe `payment-intent` still ignores the request-body price and charges the persisted order total for the signed-in owner. That persisted total is the client’s own ledger. The server checks that the numbers add up. It does not recompute catalogue prices.
- PayPal create-order, when sandbox credentials exist, is unauthenticated and prices the PayPal order from the request body. Live today returns `503` `PAYPAL_SANDBOX_REQUIRED`, so this path is latent.
- Unauthenticated PIN lookup can read the entire `customers` collection when the indexed query misses. There is no IP throttle.
- Firestore still denies client writes of `role` and `passcodeHash`. Public custom groups and legacy non-V2 orders are looser than the V2 paths.
- Security headers from `vercel.json` are on `/` and the API routes checked. CSP is still Report-Only. API routes do not reflect `Origin`. The HTML document sends `Access-Control-Allow-Origin: *`.
- Forged `record-payment` still returns `400` `INVALID_STRIPE_SIGNATURE`. Unauthenticated payment, persist, history, and design-transfer routes return `401`.
- Admin allowlist identifiers are absent from the live JS bundles. Storage list of `customer-design-drafts/` is `403`. `fabrics/` list is `200`.
- `npm audit --omit=dev`: 1 critical, 12 high, 15 moderate. No upgrades in this change.
- Function count remains 12. `api/future-order-v2/paypal.ts` is the twelfth function. `GET /api/future-order-v2/payment-intent` still serves Stripe publishable config. Legacy `/api/create-payment-intent` and `/api/charge-balance` are `404`.

## Findings

### H1 — PIN registration verifies the email and issues a session without mailbox proof

- Severity: High
- Evidence: `src/server/customerAuth.ts` `ensureFirebaseUser` creates the user with `emailVerified: true` (around line 133). `registerWithPin` (around lines 345–382) accepts any syntactically valid email that is not on the server allowlist, writes the customer document, and returns `createCustomToken`. If `getUserByEmail` already finds a Firebase user and no `customers` document exists yet, registration continues on that existing uid. `loginWithPin` later calls `migrateOwnedOrders`, which stamps `ownerUid` onto legacy `orders` whose `customer.email` matches and which have no owner yet (around lines 137–168).
- Live: `POST /api/auth/pin-register` with `{}` returns `400` “Enter a valid name, email address and 6-digit PIN.” The route is deployed. This audit did not create an account.
- Impact: Anyone can pre-create a verified-email Firebase user for an address that has no customer document, then sign in with the PIN. With Firebase’s default one-account-per-email setting, a later Google sign-in for that same verified address joins that user. Allowlisted administrator emails are rejected with `ADMIN_GOOGLE_REQUIRED` before this path. The Firebase console toggle was not inspected from this environment.
- Recommended fix: Leave `emailVerified` false until a mailbox proof succeeds. If `getUserByEmail` finds a user, return a conflict instead of issuing a custom token. Keep the allowlist Google-only block.

### H2 — The charged total is the client-authored persisted ledger

- Severity: High
- Evidence: `persistFutureOrderV2ForVerifiedIdentity` stores `request.masterOrder` after the caller’s uid matches (`src/server/futureOrderV2Persistence.ts` around lines 164–176). `normalizeFutureOrderCandidate` accepts `exact` pricing when the client’s component amounts add up to `exactTotalCents` (`src/utils/futureOrderCandidate.ts` around lines 1828–1857). It does not look up catalogue prices. `handleFutureOrderV2StripePayment` then charges `order.value.masterOrder.cartItem.candidate.pricing.exactTotalCents` for that owner (`src/server/futureOrderV2StripePayment.ts` around lines 309–337). The same persisted total is what PayPal capture must match (`src/server/futureOrderV2PayPalPayment.ts` around lines 402–414).
- What still holds from #385: the payment-intent body is not the charge amount. `test_future_order_v2_stripe_payment.ts` sends `exactTotalCents: 50` and `amountCents: 1` in the body and expects the persisted `30000` cents. Live `POST /api/future-order-v2/payment-intent` without a bearer token returns `401` `AUTH_REQUIRED`. Secret keys that do not start with `sk_test_` are rejected.
- Impact: A signed-in customer can persist their own order with a self-consistent cheap ledger (minimum charge 50 euro cents) and pay that amount in Stripe test mode. This is underpayment of their own order, not another customer’s order (`OWNER_MISMATCH` is enforced). It becomes a live-money issue if the `sk_test_` gate is later removed. This audit did not create orders or PaymentIntents.
- Recommended fix: Recompute the payable total on the server from catalogue and shipping rules at persist time, and charge only that recomputed total. Keep ignoring body `amountCents` / body `masterOrder` on `payment-intent`.

### M1 — PayPal create-order is unauthenticated and body-priced; capture runs before the ledger check

- Severity: Medium
- Evidence: `handleFutureOrderV2PayPalCreateOrder` (`src/server/futureOrderV2PayPalPayment.ts` around lines 291–359) does not read a bearer token. It prices the PayPal order from `parseFutureOrderMasterOrderV2(body.masterOrder)`. `test_future_order_v2_paypal_payment.ts` calls that handler with `headers: {}` and expects `200`. `handleFutureOrderV2PayPalCapture` does require a non-anonymous bearer token and checks owner, currency, and persisted cents, but it calls `capturePayPalOrder` before `saveVerifiedFutureOrderV2PayPalPayment` (around lines 525–547). `PAYPAL_ENV` other than `sandbox` fails closed. Live mode is refused in `getPayPalAccessToken`.
- Live: `GET` and `POST /api/future-order-v2/paypal` return `503` `PAYPAL_SANDBOX_REQUIRED` with `Cache-Control: no-store`. The route is deployed and inert until sandbox credentials are set.
- Impact: Once sandbox credentials are present, an anonymous caller can open PayPal orders for a client-chosen amount on the merchant sandbox account. A capture of a non-matching amount can take the PayPal payment and then refuse to record the order. A matching cheap persisted order (H2) records as paid.
- Recommended fix: Require the same bearer, owner, and persisted-total checks on create that Stripe `payment-intent` uses. Capture only after that amount is the one PayPal will settle. Keep the sandbox-only gate.

### M2 — PIN endpoints can scan every customer, with no IP throttle

- Severity: Medium
- Evidence: `findCustomerDocument` (`src/server/customerAuth.ts` around lines 99–121) calls `customers.get()` when the email or phone query misses. `handlePinLogin` and `handlePinRegister` are unauthenticated (`src/server/authHttp.ts`). Lockout is five failures and 15 minutes on the customer document (`MAX_PIN_FAILURES`, `PIN_LOCK_MS`, around lines 20–21 and 284–307). The counter update is a read-modify-write, not a transaction. There is no IP or global limit. Unknown identifiers and wrong PINs share `INVALID_CREDENTIALS` until the account locks; `PIN_LOCKED` then confirms the account exists.
- Live: one empty `POST /api/auth/pin-login` returned `400` (missing fields). No repeated guesses were sent.
- Impact: A caller can force full `customers` reads and can lock a known account for 15 minutes after five misses. Online guessing of one PIN is bounded. A 4-digit login PIN is still accepted for existing hashes (see #439, which still holds).
- Recommended fix: Remove the collection-wide fallback or cap it. Add a transactional counter and a separate IP limit that does not depend on knowing the account. Keep the generic error for unknown accounts.

### M3 — Public custom groups can be created loosely, and any signed-in user can rewrite `currentMembers`

- Severity: Medium
- Evidence: `firestore.rules` `match /customGroups/{groupId}` (around lines 659–704). Public create requires a signed-in user, `visibility == "PUBLIC"`, and matching `ownerUid` / `batchId`. It does not use `hasPrivateBatchShape`. Public update allows the owner to change the document while it stays public, and allows any signed-in user to change only `currentMembers`, with no range check. Private-batch member documents and `privateBatchInvites` stay client-deny. Comments in the rules say `currentMembers` is not a private-batch authorization field.
- Impact: A signed-in user can publish an arbitrary public group document and can move the displayed member count. Private-batch membership itself is not client-writable.
- Recommended fix: Apply an explicit public-group field allowlist and a bounds check on `currentMembers`. Limit that field to a server transaction, as private membership already is.

### M4 — Signed-in clients can create legacy non-V2 orders with an unvalidated body

- Severity: Medium
- Evidence: `firestore.rules` `match /orders/{orderId}` (around lines 756–781). Create is allowed when the document is not Future Order V2 and `ownerUid` plus `customer.ownerUid` are the caller. There is no price or schema allowlist on that legacy path. V2 creates are rejected here; V2 persistence is the Admin SDK route. Owner updates of non-V2 orders allow an empty field diff only. `future_order_v2_payments` is server-write only.
- Impact: A customer can insert legacy order documents the staff UI may treat as work. They cannot rewrite a persisted V2 order or a payment record through the client SDK.
- Recommended fix: Deny client creates on `orders`, or constrain legacy creates to a closed field set that cannot set payment state.

### L1 — CSP is Report-Only, with hosts that will matter before enforce

- Severity: Low
- Evidence: `vercel.json` sets `Content-Security-Policy-Report-Only` on `/(.*)`. `script-src` is `'self'` plus Stripe and `https://apis.google.com`. It does not allow `'unsafe-inline'` or `'unsafe-eval'`. `style-src` allows `'unsafe-inline'`. `frame-ancestors 'none'` is inside the report-only policy. There is no `report-uri` / `report-to`. Live responses on `/`, `/api/health`, `/api/auth/bootstrap`, `/api/future-order-v2/payment-intent`, and `/api/future-order-v2/paypal` include the report-only header and do not include an enforcing `Content-Security-Policy`.
- Gaps to review before enforce: `lh3.googleusercontent.com` (profile photos, already noted in project state), PayPal script/frame/connect hosts if M1 is enabled, and any Stripe worker host that report-only logs show. `X-Frame-Options: DENY` is already enforcing, so clickjacking does not depend on CSP enforce.
- Impact: A successful HTML injection would not be blocked by CSP today. No `dangerouslySetInnerHTML`, `innerHTML`, or `eval(` sink was found under `src/`.
- Recommended fix: Keep Report-Only until a browser pass records violations. Then switch the same header name to enforcing `Content-Security-Policy` and add the missing image and payment hosts. Do not flip it in a drive-by change.

### L2 — The HTML document sends `Access-Control-Allow-Origin: *`

- Severity: Low
- Evidence: Live `GET /` returns `access-control-allow-origin: *` and `cache-control: public, max-age=0, must-revalidate`. `vercel.json` does not set CORS. Live `GET` and `POST` on `/api/health`, `/api/auth/bootstrap`, and `/api/future-order-v2/payment-intent` with `Origin: https://evil.example` omit `Access-Control-Allow-Origin`. `OPTIONS` on payment-intent is `405` and also omits it. No handler under `src/server` sets `Access-Control-Allow-Origin`.
- Impact: The public HTML can be read cross-origin. API responses are not credentialed cross-origin via a reflected origin. This is not a new API CORS widening.
- Recommended fix: Leave API CORS unset. If the `*` on `/` is not required for a specific embed, drop it at the platform or static-header layer.

### L3 — Login still accepts a leftover plaintext PIN with a non-constant compare

- Severity: Low
- Evidence: `loginWithPin` (`src/server/customerAuth.ts` around lines 289–291) succeeds when `verifyPin` matches the scrypt hash or when `account.passcode === pin`. `verifyPin` uses `timingSafeEqual`. The plaintext branch does not. `migrateLegacyPins` runs when an allowlisted admin bootstraps, not on every customer login. A successful PIN login deletes `passcode` and stores `passcodeHash`.
- Impact: Any customer document that still has a plaintext `passcode` can be checked with `===`. New registrations store scrypt only. Register requires 6 digits; login still allows 4 or 6 (`validateLoginPin` / `validateRegisterPin`).
- Recommended fix: Finish a one-time hash migration, then delete the plaintext compare.

### L4 — A customer can change their own `orderStatus` and measurement fields

- Severity: Low
- Evidence: `firestore.rules` `match /customers/{customerId}` (around lines 734–753). The owner may update only `name`, `phone`, `location`, `orderStatus`, `method`, `measurementProfile`, `measurementProfiles`, and `biometricConsent`. `role`, `passcode`, `passcodeHash`, `ownerUid`, and email fields are not in that list. Client create/delete of customers is admin-only. `isAdmin()` is `request.auth.token.admin == true` after a non-anonymous sign-in (lines 5–11).
- Impact: A customer can spoof the status string stored on their profile. They cannot grant themselves `admin` or write the PIN hash. Staff authorization in rules follows the custom claim, which `setServerRole` sets from the server allowlist during bootstrap.
- Recommended fix: Drop `orderStatus` and `method` from the client allowlist if staff treat them as workflow state.

## Info

### I1 — Supply-chain advisories (no upgrade performed)

`npm audit --omit=dev` on the lockfile: 1 critical, 12 high, 15 moderate (28 total). Full audit including devDependencies: 1 critical, 24 high, 20 moderate (45 total).

Critical: `proxy-addr` `2.0.7` (IPv4-mapped IPv6 trust-subnet spoof), reached from direct `express@4.22.2` and from `@google/genai` → `@modelcontextprotocol/sdk` → `express@5`. This audit did not find request-IP authorization in the Vercel handlers.

High production names include `@grpc/grpc-js` (via `firebase`), `@modelcontextprotocol/sdk` (OAuth credential routing), `fast-uri`, `fast-xml-parser`, `@fastify/busboy`, `postcss`, `browserslist`, `nanoid`, `source-map-js`. The audit’s suggested `firebase` fix target is an older major. Do not run `npm audit fix --force` as a batch.

### I2 — Committed config and client exposure

- Tracked env-like path: `.env.example` only (placeholders). No tracked `.env`, service-account JSON, `sk_`, or `whsec_` value.
- `firebase-applet-config.json` is the committed staging web config (project `gen-lang-client-0614710868`). The web API key is browser-public by design. Rules and App Check, not secrecy of that key, are the boundary.
- `vite.config.ts` `define` injects only `__APP_BUILD_ID__` from `VERCEL_GIT_COMMIT_SHA` or `dev`.
- Live JS (`/assets/index-DX7DJVEw.js` plus 21 chunk files, about 3.0 MB): 0 hits for `sk_live_`, `sk_test_`, `whsec_`, `BEGIN PRIVATE`, `ALLOWED_ADMIN_EMAILS`, `isAllowedAdminEmail`, `isAdminEmail`, `adminAllowlist`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_SECRET`. Gmail-looking strings are form placeholders, not the allowlist. Canonical compare against `src/server/adminAllowlist.ts` was 0 overlaps. Addresses are not repeated here.
- `GET /api/future-order-v2/payment-intent` returns a `pk_test_` publishable key and `testMode: true`. The body contained no `sk_` or `whsec_`.

### I3 — Staff preview and admin UI trust

`staffPreviewEntitlements/{ownerUid}` allows `get` for that uid and denies list/create/update/delete (`firestore.rules` around lines 843–846). Claims are written by the Admin SDK in `src/server/staffPreviewEntitlement.ts`. The client gate reads the ID-token claim plus that document. A browser cannot forge `token.admin` or `staffPreview`. `AdminAuthGuard` renders from `currentUser.role` after bootstrap (`src/components/AdminAuthGuard.tsx` around lines 76–79). `AuthorizationEngine.resolveRole` keeps only `Super Administrator` and `Administrator`; every other role becomes Customer, and email is not an admin signal. A tampered bootstrap JSON can change the UI. Firestore and Storage still require `token.admin == true`.

### I4 — Guest design transfer

Claim creation requires `draftReference.ownerUid === authenticatedUid` and checks storage content type and size (`src/server/uploadedDesignOwnershipClaim.ts` around lines 215–231). Redemption is single-use, 15 minutes, bound to the claim token hash, the draft path, and the redeeming uid. Draft transfer always redeems a claim. Order transfer allows the same uid, or a redeemed claim when the draft owner differs. No ownership bypass was found. Possession of the claim token is the transfer capability for that window.

### I5 — Upload content type

`storage.rules` allows customer draft writes only for `image/jpeg`, `image/png`, or `image/webp`, at most 5 MB, under `customer-design-drafts/{uid}/...`. The type is the declared content type. Public prefixes (`fabrics/`, `styles/`, `designs/`, `gallery/`, and the other listed storefront prefixes) are world-readable and admin-writable. The file ends in a deny-all match.

Live unauthenticated Storage list (`firebasestorage.googleapis.com`, bucket `gen-lang-client-0614710868.firebasestorage.app`):

| Prefix | Status |
| --- | --- |
| `customer-design-drafts/` | 403 Permission denied |
| `orders/` | 403 Permission denied |
| `fabrics/` | 200 (list allowed) |

### I6 — Clickjacking, redirects, XSS, error bodies

- Enforcing: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera, microphone, and geolocation disabled, `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (platform).
- `pendingRedirect` in `src/App.tsx` selects a tab name. It is not a navigation URL.
- Footer `tel:` and `https://wa.me/` links strip spaces or non-digits. No open redirect was found.
- Auth and payment handlers return mapped `error` / `code` strings. `uploadedDesignOwnershipClaimHttp.ts` logs a stack on unexpected failures and returns a generic 500 body.
- `handleHealth` sets `Cache-Control: no-store`. On Vercel with a blank `VERCEL_GIT_COMMIT_SHA` it returns `503` `BUILD_ID_UNAVAILABLE`. Live health is `200` with a 40-character SHA, not `dev`.

## API inventory

All 12 files under `api/`. Auth is the route’s own check. None of these handlers set CORS.

| Route | Methods | Auth | IDOR / amount / notes |
| --- | --- | --- | --- |
| `/api/health` | any (handler ignores method) | Public | Build SHA only. `no-store`. Fail-closed without SHA on Vercel. |
| `/api/auth/bootstrap` | POST | Bearer ID token | Sets `admin` claim from the server allowlist. Returns customer role. Live unauthenticated `401`. |
| `/api/auth/pin-login` | POST | Public | Per-account lockout. See H1 residual and M2. `no-store`. |
| `/api/auth/pin-register` | POST | Public | 6-digit PIN. See H1. `no-store`. |
| `/api/future-order-v2/payment-intent` | GET config, POST charge | POST: non-anonymous Bearer | POST amount is the persisted order for `token.uid`. Body price ignored. Live POST `401`. GET returns `pk_test_` only. `no-store`. |
| `/api/future-order-v2/record-payment` | POST | `stripe-signature` and no Bearer, or Bearer | Webhook: `constructEvent` on the raw body, `sk_test_` required, missing secret fails closed, `livemode` and non-succeeded events return `200` ignored, metadata taken from the retrieved PaymentIntent, amount must match the persisted total, create is idempotent. Bearer path reloads the PaymentIntent and checks owner. Live forged signature: `400` `INVALID_STRIPE_SIGNATURE`. Live POST without either credential: `401`. `no-store`. |
| `/api/future-order-v2/paypal` | GET config, POST create or capture | Capture: non-anonymous Bearer. Create: none | See M1. Live `503` while sandbox is unset. `no-store`. |
| `/api/orders/persist-future-order-v2` | POST | Non-anonymous Bearer | Owner must match. Stores the client master order. See H2. Group orders check private membership or public organizer uid. Live unauthenticated `401`. `no-store`. |
| `/api/orders/lookup-future-order-v2-history` | POST | Non-anonymous Bearer | Query is `orders` where `ownerUid == token.uid`. Response is `referenced` / `not_referenced` / `unknown` only. Live unauthenticated `401`. `no-store`. |
| `/api/orders/create-uploaded-design-ownership-claim` | POST | Bearer | Owner must match the draft uid. Live unauthenticated `401`. `no-store`. |
| `/api/orders/transfer-uploaded-design` | POST | Bearer | Same uid, or a redeemed claim. Live unauthenticated `401`. `no-store`. |
| `/api/design-studio/transfer-uploaded-design-draft` | POST | Bearer | Claim required. Live unauthenticated `401`. `no-store`. |

`POST /api/create-payment-intent` and `POST /api/charge-balance` return `404`. They are not part of the 12 functions.

## Firestore and Storage (summary)

- Admin is `request.auth.token.admin == true` plus non-anonymous sign-in in Firestore. Storage uses the same claim with any authenticated user, including anonymous, for `isAdmin()` / `isOwner()`.
- Customer drafts and V2 payments/workshop reads are owner or admin. Workshop writes are admin-only. Payment records are not client-writable.
- Public read (intentional catalogue / storefront): `fabrics`, `batches`, `showpieces`, `communityPhotos`, `businessSettings`, `settings`, `reference_data`, `custom_detail_catalog`, `media`, and published `styles` list/get. `settings` and `businessSettings` include shipping rates, deposit percentages, and discount `internalNotes` if those fields are stored. They are world-readable.
- Deny-all: Firestore `match /{document=**}` and Storage `match /{allPaths=**}`.
- Client-writable privilege fields: `role` and `passcodeHash` are not client-writable. `orderStatus` is (L4).

## Tests run

Local `npm ci --ignore-scripts`, then `tsx`:

| Test | Result |
| --- | --- |
| `test_firestore_security.ts` | PASS |
| `test_api_routes.ts` | PASS |
| `test_future_order_v2_payment_webhook.ts` | PASS |
| `test_future_order_v2_stripe_payment.ts` | PASS |
| `test_future_order_v2_paypal_payment.ts` | PASS |
| `test_app_version_check.ts` | PASS |

The PayPal test currently expects unauthenticated create-order to succeed. That matches M1. It is not evidence that create-order is authenticated.

## Prior Mediums

| Control | Status |
| --- | --- |
| #368 Storage: `customer-design-drafts` not public | Holds. Rules deny public read. Live list `403`. `fabrics/` list `200`. |
| #385 payment-intent auth and server amount | Holds at this route. Live unauthenticated `401` `AUTH_REQUIRED`. Body price is ignored. H2 is a separate gap at persist time, not a regression of this check. |
| #390 webhook `constructEvent`, fail-closed | Holds. Live forged signature `400` `INVALID_STRIPE_SIGNATURE`. `livemode` ignored. Idempotent create. |
| #413 security headers and CSP Report-Only | Holds. The five headers are present. CSP is Report-Only, not enforce. L2 is an additional static CORS header, not an API reflection. |
| #421 admin allowlist server-only | Holds. Live bundles: 0 allowlist identifiers and 0 allowlist address overlaps. |
| #439 register PIN 6, login 4 or 6 | Holds. `validateRegisterPin` / `validateLoginPin`. `test_firestore_security.ts` passed. |
| #455 `/api/health` fail-closed without SHA | Holds in source. Live returns `200` with the deployed SHA, not `dev`. |

REGRESSIONs: none.

## Out of scope for this change

No payment logic edits, fabric pricing edits, ODG assignment, function-count changes, Stripe live mode, admin user creation, rules deploy, secret rotation, or `LIVING_PROJECT_STATE.md` edit.
