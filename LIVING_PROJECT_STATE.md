# Living project state

Updated: 2026-10-08. Read this file first in every new chat, then `FAST_EXECUTOR_GUIDE.md`.
This file is committed on `main` and `production`. Update it after each release.

## What the product is

ODOGWU Heritage sells made-to-measure heritage garments. Customers design an order online,
the Lagos atelier sews it, and the order is picked up in Eindhoven or delivered.

- Stack: Vite + React + TypeScript, Firebase Auth / Firestore / Storage, Vercel serverless functions in `api/`.
- Firebase project: `gen-lang-client-0614710868` (currently also used by the production build).
- Live site: https://odogwu-heritage.vercel.app. `/api/health` returns the deployed `buildId` (the production merge SHA).
- Payments: Stripe **test mode only**.
- Admin: `src/components/DatabaseView.tsx` (catalogue, fabrics, orders, workshop progress).

## Customer journey

The Design Studio (`src/components/DesignStudioView.tsx`) has 10 stages, defined in
`DESIGN_STUDIO_TEN_STAGE_FOUNDATION` in `src/utils/designSourceJourney.ts`:

1. Garment Type 2. Fabric 3. Design Style 4. Custom Details 5. Personalized Additions
6. AI Try-on 7. Measurement 8. Summary 9. Delivery & Pickup 10. Order Review & Payment

- Drafts: a guest draft in local storage (`GuestOrderSessionService`), and for signed-in
  customers a cloud draft synced by `repository.synchronize` in the hydration effect.
  After refresh, Studio paints the local draft first (stable `pending_authenticated`
  identity during customer bootstrap), then reconciles cloud without an empty Step 1 wipe.
- Step 3 assignments are per garment occurrence. Uploaded photos live in the draft's
  `uploadedDesignSourceRegistry`, each owned by a Firebase uid.
- Guest uploads move to the account at sign-in (`guestUploadedDesignOwnershipContinuity`).
  Uploads that cannot be moved are removed by `removeForeignUploadedDesignSources`, and
  Step 3 asks the customer to upload them again.
- Paid orders are V2 orders (`api/orders/persist-future-order-v2.ts`, `api/future-order-v2/*`).
  Workshop progress is in the `future_order_v2_workshop` collection, including `stageHistory`.
  The customer sees it under My orders on the dashboard.

## Status

All work below is released. Prefer `/api/health` `buildId` as the live production
SHA. Feature #455 production merge was `0e51285` (health fail-closed without SHA;
live `buildId` `0e51285603ed690e4e1c207863083e8252f86a99`).

- [#281](https://github.com/techpalava/ODOGWU-HERITAGE/pull/281) Dispatch progress on paid V2 orders
- [#283](https://github.com/techpalava/ODOGWU-HERITAGE/pull/283) Uploaded photo on the Summary Design Style card
- [#286](https://github.com/techpalava/ODOGWU-HERITAGE/pull/286) Step 3 stays usable after a failed signed-in restore, and shows the reason
- [#289](https://github.com/techpalava/ODOGWU-HERITAGE/pull/289) Guest Step 3 uploads move to the account, or are removed so the rest restores
- [#292](https://github.com/techpalava/ODOGWU-HERITAGE/pull/292) Workshop stage history on paid V2 orders (Firestore rules deployed)
- [#298](https://github.com/techpalava/ODOGWU-HERITAGE/pull/298) Long shirt defaults to Short Sleeve (EUR 70) in Step 1; a saved Mid-Long Sleeve choice still restores
- [#301](https://github.com/techpalava/ODOGWU-HERITAGE/pull/301) Long Dress defaults to its first option, Sleeveless / Over Shoulder (EUR 75), in Step 1; a saved choice still restores
- [#303](https://github.com/techpalava/ODOGWU-HERITAGE/pull/303) Stripe iDEAL for Future Order V2 (PayPal UI deferred)
- [#306](https://github.com/techpalava/ODOGWU-HERITAGE/pull/306) Embroidery and monogram scoped per garment
- [#309](https://github.com/techpalava/ODOGWU-HERITAGE/pull/309) Clearer Order Summary money hierarchy
- [#312](https://github.com/techpalava/ODOGWU-HERITAGE/pull/312) Dress multi-pocket labelled With 2 Pocket(s)
- [#315](https://github.com/techpalava/ODOGWU-HERITAGE/pull/315) Measurement step unlock and multi-garment person flow
- [#318](https://github.com/techpalava/ODOGWU-HERITAGE/pull/318) Measurement risk gaps for sleeves, factors, and pending calc UI
- [#321](https://github.com/techpalava/ODOGWU-HERITAGE/pull/321) Critical Risk works for mid/long sleeves; Dress IF-APPLICABLE fields stay excluded from Critical
- [#324](https://github.com/techpalava/ODOGWU-HERITAGE/pull/324) Design Style catalogue cards show “Image unavailable” when a style image URL fails to load
- [#330](https://github.com/techpalava/ODOGWU-HERITAGE/pull/330) Clear all on Required Measurements wipes only the active method for the current wearer
- [#336](https://github.com/techpalava/ODOGWU-HERITAGE/pull/336) Clear all persists across refresh (empty route bags, autosave flush, newer local sync)
- [#342](https://github.com/techpalava/ODOGWU-HERITAGE/pull/342) Signed-in drafts restore the last Studio step and in-page wearer/garment/scroll locus; ten-stage cloud writes (`personalized_additions`) are allowed
- [#351](https://github.com/techpalava/ODOGWU-HERITAGE/pull/351) Faster draft restore after refresh (local-first paint, stable pending-authenticated identity, earlier catalogue listeners, restoring shell)
- [#355](https://github.com/techpalava/ODOGWU-HERITAGE/pull/355) Custom Details Go to Bottom FAB; mutually exclusive with Go to Top at 40% scroll progress
- [#361](https://github.com/techpalava/ODOGWU-HERITAGE/pull/361) Step 7 Measurement solo-first people UX: These clothes are for you + Add people; default wearer You; persistent in-card Male/Female fit; Assign garments only after a second person; Sample Cloth copy simplified and form bag synced after assign / Only-for-me
- [#368](https://github.com/techpalava/ODOGWU-HERITAGE/pull/368) Storage rules wired in `firebase.json` and deployed 2026-10-05: `customer-design-drafts/` is no longer publicly listable or downloadable (unauthenticated list/get now 403); public `fabrics/`, `styles/`, `designs/`, `gallery/`, `communityPhotos/` reads still 200
- [#372](https://github.com/techpalava/ODOGWU-HERITAGE/pull/372) Admin SDK `storageBucket` set in `src/server/firebaseAdmin.ts`: guest uploaded-design ownership claims (were 400 `CLAIM_INVALID_REFERENCE` from a catch-all) and the order/draft transfer endpoints work again; unexpected claim errors now return 500. No rules or Firebase deploy changes
- [#367](https://github.com/techpalava/ODOGWU-HERITAGE/pull/367) Contextual Re-entry Guidance for Fabric and Design Style: a consume-once banner names garments that still need Fabric when returning to a previously visited Fabric step after an upstream change; incomplete Fabric or Design Style re-entry scrolls to the blocking garment card with a gold highlight; ordinary revisits and refresh stay silent
- [#385](https://github.com/techpalava/ODOGWU-HERITAGE/pull/385) Future Order V2 Stripe `payment-intent` requires a non-anonymous Firebase Bearer token and charges the persisted order total owned by the caller (client `masterOrder` pricing ignored)
- [#390](https://github.com/techpalava/ODOGWU-HERITAGE/pull/390) Future Order V2 Stripe `record-payment` webhooks verify `constructEvent(rawBody, stripe-signature, STRIPE_WEBHOOK_SECRET)`; forged signature / missing secret fail closed; `body.id` is never trusted
- [#392](https://github.com/techpalava/ODOGWU-HERITAGE/pull/392) Step 5 Additional Garment popup flow: Add AG stays on Personalized Additions through Fabric then Design Style then Custom Detail Copy; per-card Add/Change Fabric and Design Style; Change Fabric ends after fabric save. Fast Executor Guide documents the UX rule (ask when ambiguous). No Firestore/Storage rules deploy
- [#413](https://github.com/techpalava/ODOGWU-HERITAGE/pull/413) Global security headers via new `vercel.json`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/microphone/geolocation disabled; `payment` omitted for Stripe wallets), and `Content-Security-Policy-Report-Only` for Stripe / Firebase / Google Fonts / Storage / Unsplash. No CORS change, no COOP/COEP. CSP enforce deferred until report-only violations are reviewed
- [#421](https://github.com/techpalava/ODOGWU-HERITAGE/pull/421) Security Medium #1 done: admin email allowlist moved to server-only `src/server/adminAllowlist.ts` (head `1dc6415`, merged to main `1c3af72`, released via #422 production `b9ce11f`, synced via #423 main `45d5a13`). `customerAuth.ts` still sets the Firebase `admin` custom claim from it. `firestore.rules` and `storage.rules` unchanged (`request.auth.token.admin == true`). Client role comes only from the `/api/auth/bootstrap` role (`Super Administrator` / `Administrator`); a missing role or failed bootstrap means Customer. `AdminAuthGuard` waits for bootstrap before rendering. `test_firestore_security.ts` scans client sources for the allowlist identifiers and addresses. Public footer no longer hardcodes two allowlisted addresses as mailto fallbacks; it shows only business settings `primaryEmail` / `secondaryEmail`
- [#427](https://github.com/techpalava/ODOGWU-HERITAGE/pull/427) Design Style Your Garments gold ring is a jump-ahead flash only: ordinary `stage_top` visits (Continue from Fabric, Back, allowed step click) stay quiet; blocked skip-ahead / `validation_target` still scrolls to the first incomplete occurrence and gold-flashes it. The dismiss timer is kept on a ref so clearing the handled request no longer leaves the ring stuck. Head `afe566f`, merged to main `772a368`, released via #428 production `be13568`, synced via #429 main `7089deb`. No Firestore/Storage rules deploy
- [#433](https://github.com/techpalava/ODOGWU-HERITAGE/pull/433) Completing the last Design Style assignment focuses docked Continue to Custom Details (does not auto-advance); gold flash on that completing assignment remains. An unfinished assignment still does not steal focus to Continue. Head `4e40fba`, merged to main `70bb04a`, released via #434 production `24b417a`, synced via #435 main `951485a`. No Firestore/Storage rules deploy
- [#439](https://github.com/techpalava/ODOGWU-HERITAGE/pull/439) Security Medium #2: new customer accounts require a 6-digit security PIN (`validateRegisterPin`); login accepts 4 or 6 (`validateLoginPin`) so existing hashes still work. Pickup/workshop PIN and SMS OTP length unchanged. Head `955669d`, merged to main `5efad57`, released via #440 production `9b4edac`, synced via #441 main `6aac483`
- [#445](https://github.com/techpalava/ODOGWU-HERITAGE/pull/445) Park a complete reviewable Design Studio order in an unpaid Future Order V2 bag (Add to cart beside Pay now on step 10). Cart pays the same Stripe V2 path one order at a time; a successful pay drops that bag line; start-another clears the Studio draft and leaves the bag. Head `0eb4450`, merged to main `b3090f9`, released via #446 production `5abb05c`, synced via #447 main `0e5dfbe`. No Firestore/Storage rules deploy
- [#451](https://github.com/techpalava/ODOGWU-HERITAGE/pull/451) Stage 8 Summary stays editable: per-garment Edit/Remove, per-choice fabric and design-style change/remove, Summary return lease after focused edits, dependent fabric/style confirm, and draft-only Cancel Order on Summary and Payment Review. Head `240485d`, merged to main `36b8fa1`, released via #452 production `3c015ef`, synced via #453 main `703ac9e`. No Firestore/Storage rules deploy
- [#455](https://github.com/techpalava/ODOGWU-HERITAGE/pull/455) Security Medium #3: on Vercel (`VERCEL` set or `VERCEL_ENV` production/preview) with a blank `VERCEL_GIT_COMMIT_SHA`, `/api/health` returns **503** `BUILD_ID_UNAVAILABLE` instead of `buildId` `"dev"`. With SHA present, public **200** `{ status: "ok", buildId }` unchanged for release verification. Local/non-Vercel may still report `"dev"`. Head `15d5f68`, merged to main `ab4f8b7`, released via #459 production `0e51285`, synced via #460 main `f876b49`. Security Medium queue from the review is complete (#368, #385, #390, #413, #421, #439, #455)
- [#458](https://github.com/techpalava/ODOGWU-HERITAGE/pull/458) Live Order Summary sidebar: garment Remove + draft Cancel Order; hide chrome until ≥1 garment (reserved empty slot); soft-enter fade on first commit; merge Design Style + Construction Options into one **Style & Options** section with dual Edit Style / Edit Options. Head `928a2e4`, merged to main `9752634`, released via #468 production `6925111`, synced via #469 main `4494f8e`. No Firestore/Storage rules deploy
- [#473](https://github.com/techpalava/ODOGWU-HERITAGE/pull/473) Design Studio step navigator current step is a solid heritage-gold chip with forest text (stronger ring + shadow) so you-are-here is obvious against completed/available/locked. Head `346913e`, merged to main `efd9c60`, released via #474 production `bd24c3c`, synced via #475 main `5c7e14e`. No Firestore/Storage rules deploy
- [#479](https://github.com/techpalava/ODOGWU-HERITAGE/pull/479) Custom Details Skirt Lining and Net are customer-visible again: `skirt_additional` on the additional-clothes allowlist for Skirt and Long Skirt (€10 each; options already catalogued). Head `8d28b24`, merged to main `3d1aa1f`, released via #480 production `34fe1c9`, synced via #481 main `a193f14`. No Firestore/Storage rules deploy
- [#485](https://github.com/techpalava/ODOGWU-HERITAGE/pull/485) Step 9 Eindhoven pickup shows Admin Default Pickup Location as a read-only **Pickup location** and snapshots it into `futureShippingState.pickupLocation` (drafts refresh from Admin; paid orders keep the snapshot; delivery clears it; fallback `Veldhoven Campus Lockers`). Head `cb4f335`, merged to main `bc087c3`, released via #486 production `2c7f77d`, synced via #487 main `4aaf7f7`. No Firestore/Storage rules deploy
- [#491](https://github.com/techpalava/ODOGWU-HERITAGE/pull/491) Step 9 shipping free-text fields (Comment / Pickup note and contact/address) keep spaces while typing: live `normalizeText` no longer trims; diagnostics / quote fingerprints / persist still trim. Head `378c47a`, merged to main `70a5f31`, released via #492 production `8cb0fd9`; Vercel Production did not auto-deploy that merge, so #493 empty-commit retrigger set live `$prod` `90ff298`; synced via #494 main `31c2103`. No Firestore/Storage rules deploy
- [#498](https://github.com/techpalava/ODOGWU-HERITAGE/pull/498) Summary Continue to Delivery stays unlocked when status is `pricing_pending` (Personalized Additional Requirement with text): `isFutureShippingStageUnlocked` allows `ready` or `pricing_pending`; incomplete/invalid/measurement-pending stay locked; Payment review unlock unchanged. Head `63c9082`, merged to main `50c98d5`, released via #499 production `5a4c641`, synced via #500 main `f6bb9be`. No Firestore/Storage rules deploy
- [#504](https://github.com/techpalava/ODOGWU-HERITAGE/pull/504) Step 9 pickup: **Recipient Contact** heading; phone label **Phone No. (Whatsapp Preferred)**; default pickup location **Eindhoven** with atelier address and WhatsApp link `+31 644 533 190`; Comment / Pickup note remains last. Head `13f91e8`, merged to main `b16e260`, released via #505 production `21c69e9`, synced via #506 main `9dc9f5b`. No Firestore/Storage rules deploy
- [#510](https://github.com/techpalava/ODOGWU-HERITAGE/pull/510) Customer Reviews v1: slim homepage trust band (one rotating quote) above Start Your Order; Reviews nav + page; guest submit with 1–5 stars; Admin Customer Reviews (hide/publish/feature max 3, display order, Add starter reviews); seed display fallback when published list is empty; `customer_reviews` Firestore rules (public read published; strict guest create unfeatured; admin update/delete). Head `cc92956`, merged to main `cea104e`, released via #511 production `893a479`, synced via #512 main `267e584`. Firestore rules deployed 2026-10-08 after live. No Storage rules deploy
- [#516](https://github.com/techpalava/ODOGWU-HERITAGE/pull/516) After a recorded Future Order V2 payment, retire the Design Studio draft (local V1 + authenticated cloud clear with conflict retry + unpark cart flag) via `retireStudioFutureDesignDraft`, same as Start another / Cancel; block autosave from rewriting the paid draft until the next Studio session. Covers Studio Pay now/retry, Studio and Dashboard Stripe/iDEAL return, and cart Pay this order. Add to cart still keeps the draft. Head `1e46a62`, merged to main `09f1cda`, released via #517 production `35a5f3c`, synced via #518 main `cf28f86`. No Firestore/Storage rules deploy
- [#522](https://github.com/techpalava/ODOGWU-HERITAGE/pull/522) Step 9 pickup: legacy Admin/draft venue `Veldhoven Campus Lockers` normalizes to **Eindhoven** in `resolveFuturePickupLocation` (Step 9 card, Delivery Summary, and other reconciled consumers); atelier phone is always underlined with visible `(WhatsApp)` cue and WhatsApp aria-label. Head `2ff07fb`, merged to main `38af2ac`, released via #523 production `bbfb8c1`, synced via #524 main `379557f`. No Firestore/Storage rules deploy
- [#528](https://github.com/techpalava/ODOGWU-HERITAGE/pull/528) Step 9 destination delivery always requires City and State/Province/Region (including other destination); City helper that the city must match the selected country (NL Eindhoven spelling note); Delivery Summary address read-back (city / region / country / postal) with courier check tip; Cost Breakdown pending copy “Available after delivery is resolved” uses smaller type than the euro Total. Head `e20c48f`, merged to main `9d18a54`, released via #529 production `936c79b`, synced via #530 main `1beb0a0`. No Firestore/Storage rules deploy
- [#534](https://github.com/techpalava/ODOGWU-HERITAGE/pull/534) Step 7 Measurement: display-only info sections after Sample Cloth. **Onsite Physical measurements** (`alternate_contact`) with “Reach out to the contact to arrange a measurement”, the “Information only. These do not complete your measurements.” note, and the atelier WhatsApp link from the shared `FUTURE_PICKUP_ATELIER_*` constants (`+31 644 533 190 (WhatsApp)`); **AI Measurements (coming soon)** in its own `ai_measurements` section below, greyed and `aria-disabled`. Not measurement methods: no radios, routes, `MeasurementMethodId`, unlock, payment or Firestore changes. Head `6e96a08`, merged to main `b20f303`, released via #535 production `ed5c4fb`, synced via #536 main `c9d140d`. No Firestore/Storage rules deploy
- [#541](https://github.com/techpalava/ODOGWU-HERITAGE/pull/541) Step 7 Measurement people UX: **Sole vs Split** ownership modes (adding a 2nd person clears the auto-assignment; shared body measurements stay); density and compact person cards; in-pill Assigned-to / unfit notes; a Fit change releases garments the new fit cannot wear, with an honest Sole notice (“These garments are for this person.” plus “Not available for …’s selected fit”) and a **Fit conflict** Continue gate; Saved success state and visible Remove person; names keep spaces while typing (trimmed on Save/blur and persistence). Audit must-fixes included: B1 (ticking a garment on another card never copies the selected person's measurements), H1/M1 (fit-conflict release + honest Sole copy/status), H2 (name spaces), M2 (a stale Add-Garment → Step 5 return lease is cleared when leaving Step 5; Back honours it only on that stage). Preview QA 13/13. Head `62efc3f`, merged to main `3e8085d`, released via #542 production `8b6a66b`, synced via #543 main `ecd5001`. Soft follow-ups deferred (not shipped): A) last-card Remove clearing name/fit; B) a visible Fit conflict heading. Supersedes #540. No Firestore/Storage rules deploy

The signed-in Chrome restore check after #289 passed. Live checks after #368 and #372 passed on 2026-10-05 against production `7602a97`: signed-in Step 3 upload restores after reload, including in a fresh incognito session; the guest upload transfers to the account after sign-in; signed-out catalogue and fabric images load. Live after #385 on production `728c523`: unauthenticated `POST /api/future-order-v2/payment-intent` returns **401** `AUTH_REQUIRED`. Live after #390 on production `96f255c`: forged `stripe-signature` on `record-payment` returned **400** `STRIPE_WEBHOOK_SECRET_REQUIRED` before the secret was set. Ops accepted 2026-10-06: Vercel Preview/Production now have test `STRIPE_WEBHOOK_SECRET`; forged signature returns **400** `INVALID_STRIPE_SIGNATURE` (verified against live `08f307b…`). Happy-path ops 2026-10-07: Stripe Sandbox destination **ODOGWU Future Order V2 payments (test)** (`payment_intent.succeeded` → `https://odogwu-heritage.vercel.app/api/future-order-v2/record-payment`) delivered **HTTP 200 OK** after `STRIPE_WEBHOOK_SECRET` was matched to that destination’s signing secret (earlier same-day deliveries were **400** `INVALID_STRIPE_SIGNATURE` while mismatched). Live after #392 on production `1a94ad9`: visual check passed; live chunk contains `Add Design Style`. Handoff observed customer-domain `buildId` `5255780` (#408). Live after #413 on production `e8bb6ab`: `/` and `/api/health` return the five new security headers (including CSP-Report-Only). Live after #421 on production `b9ce11f` (`/api/health` `buildId` `b9ce11f2ea43f1b704eb064dc8725c443220d495`), 2026-10-06 ~09:35 WAT: all 24 production JS files contain 0 of the four admin addresses (including the dot-stripped Gmail form) and 0 occurrences of `ALLOWED_ADMIN_EMAILS` / `isAllowedAdminEmail` / `isAdminEmail` / `adminAllowlist` (before the fix, 8 hits). A signed-in non-admin customer sees no “Admin Portal & DB” nav entry. The public footer shows no email row (phone numbers, location, and hours only). Owner verification 2026-10-06 ~09:45 WAT on production `b9ce11f`: the owner's authorized admin Google account sees “Admin Portal & DB” after bootstrap and the Admin Portal (“Bespoke Tailoring Database Hub”) loads with no Access Denied; a non-admin Google account sees no “Admin Portal & DB” entry and gets no admin access. Both passed. Live after #439 on production `9b4edac` (`/api/health` `buildId` `9b4edacbc2d470cdb62ff7b364393af7c0bf7d50`): live chunk `assets/LoginView-KfFKeRoy.js` contains `6-digit`. Live chunk after #361 contains
`These clothes are for you` / `Laid-flat widths are doubled for production`. Live after #427 on production `be13568` (`/api/health` `buildId` `be13568ad1d26a319256f7ede9633502ce952b9e`): guest Shirt + Trouser, Continue from Fabric onto Design Style, both Your Garments cards have no gold ring (`data-design-assignment-feedback` absent). No unique customer-copy needle. Jump-ahead flash while Continue is locked was not re-proven on production after the merge (preview visual approved). Live after #433 on production `24b417a` (`/api/health` `buildId` `24b417a8ddf7c40f5e4d12d6c37d83e1a55dfaf4`): guest Shirt + Trouser on Design Style; assigning Casual Native to Shirt only left Continue unfocused and still disabled (`1 of 2 garments assigned`); assigning Royal Senator to Trouser as the last garment focused docked Continue (`data-testid="future-design-style-continue-action"` `data-docked="true"`, `document.activeElement` on that button, enabled, still on Step 3). No unique customer-copy needle. After the unfinished apply, focus stayed on the catalogue Select trigger rather than the assigned card. Preview QA for #445 (Xavier 2026-10-07) PASS on the feature preview. Live after #445 on production `5abb05c` (`/api/health` `buildId` `5abb05caf85e1630b75a1ff2e07d03519c438145`): live JS chunk contains `Pay this order`. Live after #451 on production `3c015ef` (`/api/health` `buildId` `3c015ef79989e113d22b808f990cb6fbb806af96`): live chunk `assets/DesignStudioView-D18VpfI3.js` contains `Cancel Order`. Live after #455 on production `0e51285` (`/api/health` `buildId` `0e51285603ed690e4e1c207863083e8252f86a99`): **200** `{ status: "ok", buildId }` matching the production merge SHA; not `"dev"`. Live after #458 on production `6925111` (`/api/health` `buildId` `69251119dbfcdaec596cb42787f65e9d06c92d41`): live chunk `assets/DesignStudioView-DmOhMhXn.js` contains `Style & Options`. Live after #473 on production `bd24c3c` (`/api/health` `buildId` `bd24c3c7d035e2d05ef8ceedd1bd88aaad9548d4`): live chunk `assets/DesignStudioView-tmfNiyII.js` contains `ring-heritage-gold/80`. Live after #479 on production `34fe1c9` (`/api/health` `buildId` `34fe1c9b352100a1cce8ec4289298b536048b51b`): live chunk `assets/DesignStudioView-CSBmfBCH.js` contains `skirt-additional-clothes-costs`. Live after #485 on production `2c7f77d` (`/api/health` `buildId` `2c7f77d214829a9a1aefc36c2a43564969d36dc8`): live chunk `assets/DesignStudioView-D6hM6i0n.js` contains `future-shipping-pickup-location`. Live after #491 on production `90ff298` (`/api/health` `buildId` `90ff29897bef6d4051650a0f700cc5e4e8440a8d`, includes #492 fix + #493 deploy retrigger): live chunk `assets/DesignStudioView-BkzcAjDD.js` contains `Comment / Pickup note`. Live after #498 on production `5a4c641` (`/api/health` `buildId` `5a4c64168a5f69a158f3a56d6b8b3508200e3b08`): live chunk `assets/DesignStudioView-DcbvJdYU.js` contains `Exact totals update after personalised evaluation`. Live after #504 on production `21c69e9` (`/api/health` `buildId` `21c69e902958ea7efc9ebee63b84159eb3c9d2eb`): live chunk `assets/DesignStudioView-C43b4fW4.js` contains `Phone No. (Whatsapp Preferred)`. Live after #510 on production `893a479` (`/api/health` `buildId` `893a4799b7bbfe67a383a9353bee06f252d1f2f6`): live chunk `assets/HomeView-D2e6Zf1P.js` contains `What our community says` / `Write a review` / `home-customer-reviews`; Firestore `customer_reviews` rules deployed 2026-10-08. Live after #516 on production `35a5f3c` (`/api/health` `buildId` `35a5f3c6367116783ab8284f5230a3c6a417c0b4`): live chunk `assets/DesignStudioView-oIxFc-AM.js` contains `clearFutureDesignDraft` (post-pay draft retirement wired; export names minified). Live after #522 on production `bbfb8c1` (`/api/health` `buildId` `bbfb8c17d3a91beecbce0d6a5d4bca13f3013b68`): live chunk `assets/DesignStudioView-ZakIP6IW.js` contains `(WhatsApp)`. Live after #528 on production `936c79b` (`/api/health` `buildId` `936c79be1f38a717183ff321dd981662f9d40dd7`): live chunk `assets/DesignStudioView-BqS5xIm2.js` contains `Check this matches the courier address before continuing.`. Live after #534 on production `ed5c4fb` (`/api/health` `buildId` `ed5c4fb40d54657b2486f74396db460470dcf14a`): live chunk `assets/DesignStudioView-CnFOnyGf.js` contains `Onsite Physical measurements`. Live after #541 on production `8b6a66b` (`/api/health` `buildId` `8b6a66be5da0c2211dd7c04a00121b9b05868a1e`): live chunk `assets/DesignStudioView-9XNMOrSi.js` contains `All garments are for this person.` and `These garments are for this person.`.

## Git and worktrees

- Repository `techpalava/ODOGWU-HERITAGE`. Remote name is `github`, never `origin`.
- Check current main and production SHAs with `git fetch github`. Trees match after each release;
  SHAs differ because of sync merges.
- Active worktree: `C:\Users\techp\Documents\Codex\ODOGWU-HERITAGE-next-task`,
  aligned to `github/main` and ready for a fresh feature branch when the next
  task is authorized. Do not reuse released branches such as `fix/draft-resume-locus`,
  `fix/faster-draft-restore`, `feat/custom-details-go-to-bottom`,
  `feat/step7-people-ux-solo-first`,   `fix/payment-intent-auth-amount`,
  `fix/stripe-webhook-construct-event`,
  `feat/additional-garment-flow-step5-session`,
  `fix/security-headers-vercel`,
  `fix/admin-allowlist-server-only`,
  `fix/design-style-incomplete-flash-only`,
  `fix/design-style-complete-continue-focus`,
  `fix/pin-length-6`,
  `feat/future-order-v2-add-to-cart`,
  `feat/summary-edit-remove-cancel`,
  `fix/health-buildid-fail-closed`,
  `feat/live-order-summary-remove-cancel`,
  `fix/step-navigator-current-contrast`,
  `fix/skirt-additional-lining-net`,
  `feat/step9-pickup-location-display`,
  `fix/shipping-comment-spaces`,
  `fix/summary-pricing-pending-shipping-unlock`,
  `feat/step9-recipient-contact-eindhoven`,
  `feat/customer-reviews-home-slider`,
  `fix/clear-studio-draft-after-v2-pay`,
  `fix/step9-eindhoven-pickup-label`,
  `fix/step9-address-region-check`,
  `feat/step7-onsite-ai-info`,
  `feat/step7-people-in-card-assign`, or
  `feat/step7-for-me-add-a-person`.
- Critical Risk “height alone” copy fix is parked in local stash
  `park critical-risk-height-copy before clear-all` (not released). Restore onto a fresh
  branch from `github/main` when authorized; do not mix it into unrelated work.
- `ODOGWU-HERITAGE-long-dress-sleeveless` (#301) and `ODOGWU-HERITAGE-long-shirt-short-sleeve`
  (#298) are merged; keep them. `ODOGWU-HERITAGE-step3-additional-garment-designs` is merged;
  keep it, do not reuse it.
- The Cursor workspace folder (`...\2026-07-08\...\ODOGWU-HERITAGE-task1-task2`) is a different,
  older checkout. Run shell commands with the worktree above as the working directory, and
  confirm the path before editing. It holds an unpushed local commit `d691a8c` from an early
  attempt at #298; it is superseded and must not be pushed.
- The local `ODOGWU-HERITAGE-main-release` worktree may hold the `main` branch at a stale
  SHA, and `ODOGWU-HERITAGE-step3-exact-garment-labels` may hold `production` stale. Do not
  release from them; releases go through GitHub PRs. For local edits, branch from
  `github/main` in the next-task worktree.
- Many other `ODOGWU-HERITAGE-*` worktrees hold older feature branches. Do not delete them.
- The active worktree shows many CRLF-only modified files. They are not real changes. Never stage them.

## Release flow

1. Commit on the feature branch, push to `github`, open a PR to `main`.
2. Open a PR from `main` to `production`.
3. Open (or reuse) the PR from `production` to `main` titled exactly
   `Sync production release history back to main`.

- Merge each PR with `gh pr merge N --repo techpalava/ODOGWU-HERITAGE --merge --delete-branch=false`,
  only after `gh pr checks N` exits 0. A watcher that drops its connection is not a pass.
- After production merges, confirm `/api/health` shows the production merge SHA and that a live
  JS chunk contains a string from the change (docs-only releases may skip the chunk check).
- If `firestore.rules` changed, deploy it only after the live app sends the new fields:
  `npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive`.
- If `storage.rules` changed, deploy it with
  `npx firebase deploy --only storage --project gen-lang-client-0614710868 --non-interactive`.
  `storage.rules` ends in a deny-all catch-all: add a rule for any new public Storage prefix before using it.

Exact commands are in `FAST_EXECUTOR_GUIDE.md`, sections 19 to 22.

## Still open

- Optional later: switch `Content-Security-Policy-Report-Only` (#413) to enforcing
  `Content-Security-Policy` after reviewing browser console reports (likely
  `lh3.googleusercontent.com` profile photos and any unexpected Stripe/worker hosts).
- Security Medium queue from the review is done (#368 Storage, #385 payment-intent,
  #390 webhook + signed happy-path ops 2026-10-07, #413 headers, #421 allowlist,
  #439 PIN, #455 health buildId). After any Stripe webhook secret rotation, keep
  Vercel `STRIPE_WEBHOOK_SECRET` matched to the active destination signing secret.
- Follow-up for the owner: set contact emails in the admin business settings if a
  footer email should be shown. The 2026-10-06 ~09:35 WAT live check showed no
  email row (only phone numbers, location, and hours) because production
  `primaryEmail` / `secondaryEmail` are empty.
- Admin live check of stage history: save a new stage on a paid order and confirm the customer
  card lists the earlier stage and the new one.
- Tailoring live QA is blocked without a real admin session. Do not create or bypass admin access.
- Bow-Tie Bum Short (`casual-bum-short-1`) still needs an Admin Database View re-upload of its
  design photo; live Storage URL 404s. The #324 catalogue `onError` fallback is live so the card
  no longer looks blank.
- Measurement Critical mid-sleeve accuracy still needs a real mid factor from the client workbook
  (proxy-factor item on hold). Mid/long Critical completion already uses the long-sleeve path.
- Critical Risk Required / Calculated copy still incorrectly shares the Mid/High “height alone
  is not enough” fallthrough; fix is stashed, not released.
- No other work is authorized. Wait for the user's next task.

## Do not change

- `/api/create-payment-intent`, `/api/charge-balance`, fabric pricing, and ODG-xxx assignment.
- The stored Measurement `calculationStatus` is a non-authoritative cache. Completion is recomputed at runtime.
- The Vercel function count stays at 12. Current functions:
  `api/health.ts`, `api/auth/bootstrap.ts`, `api/auth/pin-login.ts`, `api/auth/pin-register.ts`,
  `api/design-studio/transfer-uploaded-design-draft.ts`, `api/future-order-v2/payment-intent.ts`,
  `api/future-order-v2/record-payment.ts`, `api/future-order-v2/stripe-config.ts`,
  `api/orders/create-uploaded-design-ownership-claim.ts`, `api/orders/lookup-future-order-v2-history.ts`,
  `api/orders/persist-future-order-v2.ts`, `api/orders/transfer-uploaded-design.ts`.
- Never force-push, rebase, squash or amend published commits. Never push production onto main.
- Never commit `.env` or `.env.local`. Never print Stripe secrets or the webhook signing secret.
- Do not submit real payments or write real customer data.

## Known baseline exceptions

- `npx tsc --noEmit` currently reports these known errors on main (observed 2026-10-04):
  `DesignStudioView.tsx` (`returnStage` / capacityReuse),
  `DormantFutureMeasurementStep.tsx` (unused `calculatedRequirements` / `optionalRequirements`),
  `CustomerFutureOrderV2Details.tsx` (`paymentIntentId` on V2 payment record),
  `src/services/futureOrderV2PaymentRecordClient.ts` (`paymentIntentId`),
  `test_future_order_v2_stripe_return.ts` (`providerTransactionId`),
  `test_monogram_pricing.ts` (107, missing Lining/Net decorative keys).
- Known failing tests: `test_task5g_accessibility`, `test_mid_process_garment_removal_ui`,
  `test_private_batch_foundation`, `test_homepage_draft_replacement_hydration`,
  `test_order_context_presentation`, `test_step1_step3_catalogue_loading_ui`,
  `test_garment_construction_pricing` (garment list without Long Skirt, line 30),
  `test_garment_construction_custom_details` ("Shirt construction" label, line 76),
  `test_custom_detail_physical_component_identity`, `test_design_studio_inline_fabric_catalogue`,
  `test_dormant_future_fabric_stage`, `test_dormant_garment_type_stage_integration`,
  `test_fabric_ui_upload_extra_effective`, `test_future_fabric_bulk_assignment`,
  `test_hide_agbada_upload_garment_sync`, `test_inline_fabric_picker_narrow_repair`,
  `test_spare_fabric_capacity_persistence`, `test_step1_step3_catalogue_matrix`,
  `test_step3_catalogue_discovery`, `test_uploaded_design_integration`,
  `test_uploaded_design_pricing`, `test_uploaded_design_step1`
  (all confirmed failing on main `5e50dcc`, before #298).
- Tests that import Firebase fail under plain `tsx` with `FirebaseClientConfigurationError`.
  Run them through `node scripts/tsxWithViteProductionFirebase.mjs` (or their `npm run test:*` script).
- Source assertions that search for a literal `\n` fail on this CRLF checkout (for example
  `test_design_style_upload_auth_transition`). They pass on CI's LF checkout.

## How work arrives

- The user usually attaches a plan from `C:\Users\techp\.cursor\plans\` with todos already created.
  Do not edit the plan file. Do not recreate the todos. Mark each one in progress, finish them all,
  and release when the plan includes a release step.
- When a decision is genuinely the user's, ask with the question tool before planning.
- Report in plain language: outcome first, then what changed, checks, release links, and the
  one thing the user should verify.

## Working rules

`FAST_EXECUTOR_GUIDE.md` holds the full rules. The ones broken most often:

- Correct only the named defect. Keep locked areas locked unless the task names them.
- Stage named paths only, never `git add .` or `git add -A`.
- One live task at a time. If two instructions conflict, the latest one wins.
- After a release, update this file before starting new work.
