# Living project state

Updated: 2026-10-07. Read this file first in every new chat, then `FAST_EXECUTOR_GUIDE.md`.
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
SHA. Feature #445 production merge was `5abb05c` (park complete Design Studio
orders in the unpaid V2 cart beside Pay now; live `buildId`
`5abb05caf85e1630b75a1ff2e07d03519c438145`).

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

The signed-in Chrome restore check after #289 passed. Live checks after #368 and #372 passed on 2026-10-05 against production `7602a97`: signed-in Step 3 upload restores after reload, including in a fresh incognito session; the guest upload transfers to the account after sign-in; signed-out catalogue and fabric images load. Live after #385 on production `728c523`: unauthenticated `POST /api/future-order-v2/payment-intent` returns **401** `AUTH_REQUIRED`. Live after #390 on production `96f255c`: forged `stripe-signature` on `record-payment` returned **400** `STRIPE_WEBHOOK_SECRET_REQUIRED` before the secret was set. Ops accepted 2026-10-06: Vercel Preview/Production now have test `STRIPE_WEBHOOK_SECRET`; forged signature returns **400** `INVALID_STRIPE_SIGNATURE` (verified against live `08f307b…`). Optional: one real signed test `payment_intent.succeeded` to the production endpoint remains unproven. Live after #392 on production `1a94ad9`: visual check passed; live chunk contains `Add Design Style`. Handoff observed customer-domain `buildId` `5255780` (#408). Live after #413 on production `e8bb6ab`: `/` and `/api/health` return the five new security headers (including CSP-Report-Only). Live after #421 on production `b9ce11f` (`/api/health` `buildId` `b9ce11f2ea43f1b704eb064dc8725c443220d495`), 2026-10-06 ~09:35 WAT: all 24 production JS files contain 0 of the four admin addresses (including the dot-stripped Gmail form) and 0 occurrences of `ALLOWED_ADMIN_EMAILS` / `isAllowedAdminEmail` / `isAdminEmail` / `adminAllowlist` (before the fix, 8 hits). A signed-in non-admin customer sees no “Admin Portal & DB” nav entry. The public footer shows no email row (phone numbers, location, and hours only). Owner verification 2026-10-06 ~09:45 WAT on production `b9ce11f`: the owner's authorized admin Google account sees “Admin Portal & DB” after bootstrap and the Admin Portal (“Bespoke Tailoring Database Hub”) loads with no Access Denied; a non-admin Google account sees no “Admin Portal & DB” entry and gets no admin access. Both passed. Live after #439 on production `9b4edac` (`/api/health` `buildId` `9b4edacbc2d470cdb62ff7b364393af7c0bf7d50`): live chunk `assets/LoginView-KfFKeRoy.js` contains `6-digit`. Live chunk after #361 contains
`These clothes are for you` / `Laid-flat widths are doubled for production`. Live after #427 on production `be13568` (`/api/health` `buildId` `be13568ad1d26a319256f7ede9633502ce952b9e`): guest Shirt + Trouser, Continue from Fabric onto Design Style, both Your Garments cards have no gold ring (`data-design-assignment-feedback` absent). No unique customer-copy needle. Jump-ahead flash while Continue is locked was not re-proven on production after the merge (preview visual approved). Live after #433 on production `24b417a` (`/api/health` `buildId` `24b417a8ddf7c40f5e4d12d6c37d83e1a55dfaf4`): guest Shirt + Trouser on Design Style; assigning Casual Native to Shirt only left Continue unfocused and still disabled (`1 of 2 garments assigned`); assigning Royal Senator to Trouser as the last garment focused docked Continue (`data-testid="future-design-style-continue-action"` `data-docked="true"`, `document.activeElement` on that button, enabled, still on Step 3). No unique customer-copy needle. After the unfinished apply, focus stayed on the catalogue Select trigger rather than the assigned card. Preview QA for #445 (Xavier 2026-10-07) PASS on the feature preview. Live after #445 on production `5abb05c` (`/api/health` `buildId` `5abb05caf85e1630b75a1ff2e07d03519c438145`): live JS chunk contains `Pay this order`.

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
  `fix/pin-length-6`, or
  `feat/future-order-v2-add-to-cart`.
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

- Optional: send one real signed Stripe test `payment_intent.succeeded` to
  `https://odogwu-heritage.vercel.app/api/future-order-v2/record-payment` to prove the
  happy-path record (forged-sig verification already live).
- Optional later: switch `Content-Security-Policy-Report-Only` (#413) to enforcing
  `Content-Security-Policy` after reviewing browser console reports (likely
  `lh3.googleusercontent.com` profile photos and any unexpected Stripe/worker hosts).
- Remaining security review item (`/api/health` exposing the build ID) is not
  authorized yet. Admin email allowlist (#421) and 4-digit PIN (#439) are done.
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
