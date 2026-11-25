# Living project state

Updated: 2026-11-25. Current snapshot only (< 120 lines / 8 KB); edit in place, never append per-PR paragraphs.
History up to 2026-11-25 is verbatim in `docs/archive/RELEASE_HISTORY_2026.md` (archive only).

## Product & journey

- Made-to-measure heritage garments sewn in Lagos; Eindhoven pickup or delivery. Vite + React + TS, Firebase
  (`gen-lang-client-0614710868`), Vercel functions in `api/`.
- Live: https://odogwu-heritage.vercel.app. Stripe **test mode only**. Admin: `src/components/DatabaseView.tsx`.
- Design Studio (`DesignStudioView.tsx`, `DESIGN_STUDIO_TEN_STAGE_FOUNDATION` in `src/utils/designSourceJourney.ts`):
  1 Garment Type, 2 Fabric, 3 Design Style, 4 Custom Details, 5 Personalized Additions,
  6 Measurement, 7 AI Try-on, 8 Summary, 9 Delivery & Pickup, 10 Order Review & Payment.
- Drafts: guest local (`GuestOrderSessionService`), signed-in cloud (`repository.synchronize`); Step 3 uploads are uid-owned
  (`uploadedDesignSourceRegistry`). Paid orders are V2 (`api/future-order-v2/*`, workshop `future_order_v2_workshop`).

## Live state (look it up; do not record SHAs here)

- `git fetch github main production; git log -n 3 --oneline github/production`.
- `(Invoke-RestMethod https://odogwu-heritage.vercel.app/api/health).buildId` = live production merge SHA.

## Git, worktrees & release

- Remote `github` only. New task: `pwsh -NoProfile -File scripts/newWorktree.ps1 -Slug <s> -Branch <type>/<s>`.
- Do not use `ODOGWU-HERITAGE-next-task` (dirty Summary WIP) or reuse released branches (list in archive).
- Local stash `park critical-risk-height-copy before clear-all` = unreleased Critical Risk copy fix; restore onto a fresh branch only when authorized.
- `task1-task2` checkout holds superseded unpushed `d691a8c`: never push. `main-release` / `step3-exact-garment-labels` may hold stale `main`/`production`: never release from them.
- Keep merged worktrees (#298, #301, step3-additional-garment-designs, others); never delete. Never stage CRLF-only changes.
- Release: batch PRs on `main`, then `pwsh -NoProfile -File scripts/releaseTrain.ps1 [-PrNumber N] [-DryRun]`; sync PR title exactly `Sync production release history back to main`; rules deploys per `FAST_EXECUTOR_GUIDE.md` §2.

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
- tsc count: **0** errors on main since #835 (2026-10-18), and 0 on main plus #832. The error list above is historical. Before #835 it was 26 (33 on main `d769dcf` and after #801).
- #801 fixed `test_task5g_accessibility`, `test_mid_process_garment_removal_ui`, `test_order_context_presentation`, `test_spare_fabric_capacity_persistence`, `test_wearer_cross_card_dom`, `test_design_studio_view_inline_fabric_integration`, `test_measurement_completion_next_step_unlock.tsx` and `test_mid_process_garment_removal_integration`.
- Confirmed failing on main `d769dcf` (2026-10-17) among the wearer, measurement, Design Studio, removal and payment tests (61 run, 52 pass): `test_design_studio_future_ai_try_on_stage`, `test_design_studio_future_design_style_navigation`, `test_design_studio_future_design_style_stage`, `test_design_studio_future_fabric_stage`, `test_design_studio_inline_fabric_catalogue`, `test_design_studio_live_order_summary_ui`, `test_design_studio_navigation`, `test_design_studio_ten_stage_split`, `test_future_order_v2_payment_record`. Not yet diagnosed.
- Older known failing tests (not re-verified since):
  `test_private_batch_foundation`, `test_homepage_draft_replacement_hydration`,
  `test_step1_step3_catalogue_loading_ui`,
  `test_garment_construction_pricing` (garment list without Long Skirt, line 30),
  `test_garment_construction_custom_details` ("Shirt construction" label, line 76),
  `test_custom_detail_physical_component_identity`, `test_design_studio_inline_fabric_catalogue`,
  `test_dormant_future_fabric_stage`, `test_dormant_garment_type_stage_integration`,
  `test_fabric_ui_upload_extra_effective`, `test_future_fabric_bulk_assignment`,
  `test_hide_agbada_upload_garment_sync`, `test_inline_fabric_picker_narrow_repair`,
  `test_step1_step3_catalogue_matrix`, `test_uploaded_design_integration`,
  `test_uploaded_design_pricing`, `test_uploaded_design_step1`
  (all confirmed failing on main `5e50dcc`, before #298; `test_fabric_photo_reliability.tsx` and `test_step3_catalogue_discovery.tsx` were fixed in #1474 and removed from open baseline test regressions).
- `test_header_responsive.tsx` fails on main (checked 2026-10-19, before and after #866) at its last assertion: guest desktop nav now also lists Reviews. Not fixed; needs Xavier's authorization.
- Tests that import Firebase fail under plain `tsx` with `FirebaseClientConfigurationError`.
  Run them through `node scripts/tsxWithViteProductionFirebase.mjs` (or their `npm run test:*` script).
- Source assertions that search for a literal `\n` fail on this CRLF checkout (for example
  `test_design_style_upload_auth_transition`). They pass on CI's LF checkout.

## Still open

- Launch items: `docs/PRE_LAUNCH_CHECKLIST.md`. #1010 draft E2E checkout test (waiting for a test account); #1184 open.
- Not run: #1315 signed-in Apple/Google Pay visual test; #1117 signed-in My orders check; #841 owner checks; admin stage-history live check. Tailoring live QA blocked without real admin session (never bypass).
- Ops for Xavier: Stripe Payment method domains + Google/Apple Pay in test and live (#999); Pix + Adaptive Pricing (#941, open BRL risk); footer contact emails. Klarna is USD-only (#833).
- Optional: CSP Report-Only (#413) → enforcing. On hold: Critical mid-sleeve real mid factor; Critical Risk copy (stashed); Step 7 UX C (needs Xavier).
- Stale fabric tests (#832, need Xavier): `test_custom_details_inline_fabric_picker`, `test_design_studio_future_fabric_stage`, `test_dormant_future_fabric_stage`, `test_dormant_garment_type_stage_integration`, `test_future_fabric_bulk_assignment`, `test_inline_fabric_picker_narrow_repair`, `test_remaining_fabric_capacity_later_stage_ux`.
- No other work is authorized. Wait for the user's next task.

## How work arrives

- Plans in `C:\Users\techp\.cursor\plans\`: don't edit them or recreate todos; finish all, release if the plan says so.
- Ask only for genuine user decisions. Report outcome first, then changes, checks, links, one thing to verify.
