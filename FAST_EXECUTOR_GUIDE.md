# FAST EXECUTOR GUIDE v8 — Multi-Agent Edition (lazy-load)

**Repository:** `techpalava/ODOGWU-HERITAGE` | **Agents:** Antigravity (AG), Cursor/Grokbot, parallel chats
**Read only when needed:** releases, AI Try-On prompt changes, or risk-tier validation/reporting. All daily hard rules (remote, worktrees, wording, locks, tooling, CRLF, secrets) live in `AGENTS.md` and are not repeated here. Current status/baseline exceptions: `LIVING_PROJECT_STATE.md`. Deep subsystem rules: `docs/DOMAIN_INVARIANTS.md` — read only the section you touch.

---

## 1. Risk Tiers & Validation Matrix

Classify by actual effect, not file count:
- **LOW** (copy, isolated CSS, docs): nearest focused tests + `npm run verify:fast` (or `tsc` + `vite build --configLoader runner`) + `git diff --check`. No independent review required.
- **MEDIUM** (component interaction, responsive layout, isolated visibility): focused + nearest regression tests + typecheck/build + visual/responsive check (desktop, ~768px, 390px) when applicable.
- **HIGH** (pricing, persisted state, hydration, Measurement completion, Fabric allocation, occurrence identity, auth/payments, rules/migrations, cross-step state, concurrency): full relevant suites, old-data fixture tests (genuinely omitting new fields), fail-closed checks, independent read-only review (separate from visual approval), and live verification.

**Honest test reporting rules:**
- Never remove assertions, skip failures, or change expected results merely to get green output.
- Never call a suite with an accepted baseline failure a `PASS` — report it as `FAIL` with the baseline exception noted (reproduced at baseline or equivalent evidence).
- Report Vercel Deployment Protection / SSO-blocked previews as `NOT VERIFIED` (an evidence gap, not a broken build).
- Unit tests are not browser proof; report `NOT RUN` or `PARTIAL` for missing live cases.

---

## 2. PR, Release Train & Live Verification

- **Preferred: one command.** Batch approved feature PRs on `main`, then run ONE train:
  ```powershell
  pwsh -NoProfile -File scripts/releaseTrain.ps1 -DryRun            # read-only preview, zero GitHub mutations
  pwsh -NoProfile -File scripts/releaseTrain.ps1 -PrNumber N        # merge feature PR N, then main -> production -> main
  pwsh -NoProfile -File scripts/releaseTrain.ps1                    # promote what is already on main
  ```
  The script uses `github` only, `--merge --match-head-commit <headRefOid>` on every merge, waits for `gh pr checks`, never deletes branches, verifies parity/ancestry, and polls `/api/health` for the live `buildId`.
- **Idempotency check FIRST (manual path, before creating or merging any PR):**
  ```powershell
  gh pr view N --repo techpalava/ODOGWU-HERITAGE --json state,isDraft,headRefOid,mergeCommit
  gh pr list --repo techpalava/ODOGWU-HERITAGE --state all --limit 10
  ```
  Never duplicate a release or merge an already-merged PR.
- **Fresh head guard:** after `git push`, confirm `gh pr view N --repo techpalava/ODOGWU-HERITAGE --json headRefOid` equals the pushed SHA before trusting green checks; pass `--match-head-commit <sha>` on every `gh pr merge`.
- **Check waiting (no manual sleep loops):** `gh pr checks N --repo techpalava/ODOGWU-HERITAGE --watch`; merge only after it exits 0 (a watcher that drops its connection is not a pass).
- **Standard 3-PR Release Train (`--merge` only; no squash/rebase; never delete `main` or `production`; no admin override):**
  1. **Feature → `main`:** Ready + merge (`gh pr merge N --repo techpalava/ODOGWU-HERITAGE --merge --delete-branch=false --match-head-commit <sha>`).
  2. **`main` → `production`:** Fetch `github`, verify `git diff --stat github/production...github/main`, open/check/merge `--merge`.
  3. **`production` → `main` (history sync):** Reuse open sync PR if present (title: `"Sync production release history back to main"`), check/merge `--merge`.
  4. **Parity & ancestry:** Confirm `github/main^{tree}` === `github/production^{tree}` and `git merge-base --is-ancestor github/production github/main` exits `0`. PowerShell: quote `^{tree}` and use two separate calls (`git rev-parse "github/main^{tree}"; git rev-parse "github/production^{tree}"`).
- **Live verification (required after production merge on code releases; docs-only releases skip chunk check):**
  1. Poll `https://odogwu-heritage.vercel.app/api/health` until `buildId === <production merge SHA>` (not feature merge or back-merge SHA).
  2. Confirm a customer-visible string from the change appears in a live JS chunk:
     ```powershell
     $needle = '<string>'; $base = 'https://odogwu-heritage.vercel.app'
     $html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
     $entry = [regex]::Match($html, '/assets/index-[^"]+\.js').Value
     $js = (Invoke-WebRequest "$base$entry" -UseBasicParsing).Content
     $chunks = [regex]::Matches($js, 'assets/[A-Za-z0-9_.-]+\.js') | ForEach-Object Value | Sort-Object -Unique
     $found = @($chunks | Where-Object { (Invoke-WebRequest "$base/$_" -UseBasicParsing).Content.Contains($needle) })
     if ($js.Contains($needle)) { $found += $entry }; "found in: $($found -join ', ')"
     ```
  3. Rules deploys (only after the live app serves the release): `npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive`; `storage.rules` via `--only storage` (it ends in a deny-all catch-all — add a rule for any new public Storage prefix first).
- **`LIVING_PROJECT_STATE.md` cadence (snapshot, not a log):**
  - Do NOT append per-PR release paragraphs and do NOT spin up a 3-PR docs train for routine PRs. Live SHAs come from `git log -n 3 --oneline github/production` and `/api/health`.
  - Edit the snapshot in place only when active truth changes (new lock, baseline exception, open item, worktree warning), and ride along with the next real feature PR / release train.
  - Keep it under 120 lines / 8 KB. History lives in `docs/archive/RELEASE_HISTORY_2026.md` (archive only).
- **Worktrees:** merged worktrees may be pruned by Xavier; agents never delete worktrees or branches.

---

## 3. Domain Gotchas Index (Pointers Only)

Read the matching section of `docs/DOMAIN_INVARIANTS.md` (and `docs/PRE_LAUNCH_CHECKLIST.md` for launch items) before editing:
- **Step 5 AG Popup Chain** → `DOMAIN_INVARIANTS.md §2`: `Add AG → Fabric → Design Style → Copy → stay on Step 5`; keyed by `garmentKey + occurrenceGeneration`; Change Fabric stops after save.
- **Step 7 Measurement People UX & Re-entry** → `DOMAIN_INVARIANTS.md §3–4`: solo first screen (`Add people` only), `Assign garments` after adding people; re-entry focuses blocking item with gold flash; session-only Fabric delta copy.
- **Canonical Authority, Pricing & Construction** → `DOMAIN_INVARIANTS.md §5`: exact physical occurrences, `TOTAL` vs `SURCHARGE` vs Fabric vs shipping vs COGS, replacement replaces former price, never invent COGS.
- **Measurements, Method Isolation & Persistence** → `DOMAIN_INVARIANTS.md §6`: profile-specific rules, active method isolation, body height ≠ garment length, absent vs valid empty vs malformed non-empty, fail-closed pre-normalizer audit.
- **Navigation, Modals, Summary, Fabric Capacity & Payments** → `DOMAIN_INVARIANTS.md §7`: canonical completion, move pricing block (don't copy), stock ≠ allocation capacity, server authority for payment/shipping, no unauthorized production writes/emails.
- **Protected Paths & Firestore Rules** → `DOMAIN_INVARIANTS.md §8`: `firestore.rules`, `src/store/useAppStore.ts`, `src/utils/step1CatalogueCoverage.ts`; `--dry-run` compile check first, deploy rules last.
- **AI Try-on prompt versioning:** any wording edit in `src/server/aiTryOnPrompt.ts` requires bumping the matching version constant in `src/utils/aiTryOnGatewayContract.ts` (`AI_TRY_ON_PROMPT_VERSION`, `AI_TRY_ON_MODEL_PROMPT_VERSION`, `AI_TRY_ON_OUTFIT_PROMPT_VERSION`) and updating pins/snapshots in `test_ai_try_on_prompt.ts`, `test_ai_try_on_default_models.tsx`, and `test_ai_try_on_outfit.snap.json`.

---

## 4. Compact Report Templates

**Standard Report (routine PRs):**
- **Outcome:** 1 sentence (what is now true, or what blocked it).
- **PRs & SHAs:** PR link(s) + commit/merge SHA(s).
- **Files changed:** exact paths.
- **Checks/Build:** exact commands and raw PASS/FAIL results (with any accepted baseline exceptions).
- **Next action / Caveat:** single next gate or limitation.

**High-Risk Audit Checklist (only when Risk = HIGH or explicitly requested):**
Include Standard Report fields plus:
- `AUTHORITY IMPACT:` actual behavior, keys, prices, schemas, scopes changed (never claim persistence/pricing unchanged solely because `schemaVersion` or price table is unchanged).
- `NEAREST PROTECTED JOURNEY:` before/after.
- `LIVE QA:` URL, cases, widths (desktop, ~768px, 390px), `PASS`/`PARTIAL`/`NOT RUN`.
- `INDEPENDENT REVIEW & VISUAL APPROVAL:` separate statuses (`PENDING`/`APPROVED`/`EXPLICITLY WAIVED`).
- `DEPLOYMENT EVIDENCE:` separate levels (merged to `main`, merged to `production`, history sync, live `/api/health` + chunk check, smoke test).
- `LOCK STATUS` & `MASTER UPDATE:` (`SAVED` / `PREPARED ONLY` / `NOT AVAILABLE`).
