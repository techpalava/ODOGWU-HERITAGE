# FAST EXECUTOR GUIDE v7 — Multi-Agent Edition

**Repository:** `techpalava/ODOGWU-HERITAGE` | **Agents:** Antigravity (AG), Cursor/Grokbot, parallel chats
**Source of truth:** Read `LIVING_PROJECT_STATE.md` (status, live SHA, locks, baseline exceptions) and `docs/PRE_LAUNCH_CHECKLIST.md` before substantial work. Deep subsystem rules live in `docs/DOMAIN_INVARIANTS.md` — read only the section you touch.

---

## 1. Non-Negotiable Hard Rules (Top 12)

1. **Remote is `github` — never `origin`.**
2. **Never edit on `main` or `production`.** Never reset, restore, clean, stash, rebase, force-push, delete a branch/worktree, or switch away from dirty work. Never expose secrets, tokens, env values, or real customer data.
3. **Parallel-agent isolation:** If the checkout is dirty or shared by another chat, create a sibling worktree off `github/main`:
   `git worktree add ../ODOGWU-HERITAGE-<slug> -b <branch> github/main`
   Prune/remove merged worktrees periodically. For inherited WIP, inspect staged/unstaged/untracked changes and preserve unrelated work.
4. **Wording hard rule:** Customer- and admin-visible text must NEVER say `"Kaftan"` — always `"Long Shirt"` (internal key `kaftan` stays unchanged).
5. **No Vitest / Jest:** Tests are standalone Node/tsx scripts (`npx tsx test_*.ts(x)` or `npm run test:*`). Never run `npx vitest` (it tries to download vitest and hangs).
6. **Firebase-importing tests:** Run via `node scripts/tsxWithViteProductionFirebase.mjs <test>` (or the matching `npm run test:*` script in `package.json`).
7. **CRLF hygiene:** `core.autocrlf` is true (working copy CRLF, index LF). Stage named paths only (`git add <files>`, never `git add .` or `-A`). Compare `git diff --numstat -- <paths>` vs `git diff --numstat --ignore-cr-at-eol -- <paths>` to exclude CRLF-only noise. Avoid literal `\n` in new source regex assertions (use whitespace-agnostic regexes).
8. **Vercel 12-function cap:** Every non-`_`-prefixed file under `api/` is a serverless function; the project is at the 12-function cap — do not add new route files.
9. **AI Try-on prompt versioning:** Any wording edit in `src/server/aiTryOnPrompt.ts` requires bumping the matching version constant in `src/utils/aiTryOnGatewayContract.ts` (`AI_TRY_ON_PROMPT_VERSION`, `AI_TRY_ON_MODEL_PROMPT_VERSION`, `AI_TRY_ON_OUTFIT_PROMPT_VERSION`) and updating pins/snapshots in `test_ai_try_on_prompt.ts`, `test_ai_try_on_default_models.tsx`, and `test_ai_try_on_outfit.snap.json`.
10. **Locked areas & Firestore rules order:** Never edit locked boundaries (payments/Stripe test mode, fabric pricing, `ODG-xxx`, Step 3) unless explicitly in scope. Deploy `firestore.rules` ONLY AFTER the live app serves the matching release (compile-check first with `--dry-run`; see `docs/DOMAIN_INVARIANTS.md`).
11. **Firebase & Stripe:** Firebase project `gen-lang-client-0614710868`; Stripe **test keys only**.
12. **No unauthorized gates:** Do not commit, push, merge, or deploy without authorization. Visual approval stays `PENDING` until Xavier explicitly gives or waives it.

---

## 2. Windows PowerShell & Tooling Cheat Sheet

- **1-command preflight:**
  ```powershell
  git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git status --short; git remote -v
  ```
- **Searching:** Use `git grep` (NOT `rg`, which is not installed on PATH in this Windows PowerShell environment). Use multiple `-e` flags instead of `\|` or escaped quotes:
  ```powershell
  git grep -n -e "pat1" -e "pat2" -- src/
  git grep -n -e "pat" github/main -- src/
  git show github/main:<path>
  ```
- **PowerShell revision quoting:** Quote `^{tree}` and run two separate calls (Windows `git.exe` rejects two `^{tree}` args in one command):
  ```powershell
  git rev-parse "github/main^{tree}"; git rev-parse "github/production^{tree}"
  ```
- **Canonical verification commands (single chained call):**
  - Client / UI change: `npx tsc --noEmit && npx vite build --configLoader runner`
  - Server / `api/` change: `npm run check:api-esm && npx tsc --noEmit && npm run build`
  - Compare `tsc` errors against the known baseline in `LIVING_PROJECT_STATE.md` (`npm run lint` runs `tsc --noEmit`).
- **PRs & commits:** Put multi-line PR bodies in a file (`gh pr create ... --body-file "$env:TEMP\pr-body.md"`). Commit with two `-m` flags (title, then body). No interactive git (`-i`); no Bash `\` continuations.

---

## 3. Risk Tiers & Validation Matrix

Classify by actual effect, not file count:
- **LOW** (copy, isolated CSS, docs): nearest focused tests + `tsc` + `vite build --configLoader runner` + `git diff --check`. No independent review required.
- **MEDIUM** (component interaction, responsive layout, isolated visibility): focused + nearest regression tests + typecheck/build + visual/responsive check (desktop, ~768px, 390px) when applicable.
- **HIGH** (pricing, persisted state, hydration, Measurement completion, Fabric allocation, occurrence identity, auth/payments, rules/migrations, cross-step state, concurrency): full relevant suites, old-data fixture tests (genuinely omitting new fields), fail-closed checks, independent read-only review (separate from visual approval), and live verification.

**Honest test reporting rules:**
- Never remove assertions, skip failures, or change expected results merely to get green output.
- Never call a suite with an accepted baseline failure a `PASS` — report it as `FAIL` with the baseline exception noted (reproduced at baseline or equivalent evidence).
- Report Vercel Deployment Protection / SSO-blocked previews as `NOT VERIFIED` (an evidence gap, not a broken build).
- Unit tests are not browser proof; report `NOT RUN` or `PARTIAL` for missing live cases.

---

## 4. PR, Release Train & Live Verification

- **Idempotency check FIRST (before creating or merging any PR):**
  ```powershell
  gh pr view N --repo techpalava/ODOGWU-HERITAGE --json state,isDraft,headRefOid,mergeCommit
  gh pr list --repo techpalava/ODOGWU-HERITAGE --state all --limit 10
  ```
  Never duplicate a release or merge an already-merged PR.
- **Fresh head guard:** After `git push`, confirm `gh pr view N --repo techpalava/ODOGWU-HERITAGE --json headRefOid` equals the pushed SHA before trusting green checks.
- **Check waiting (no manual sleep loops):** Use `gh pr checks N --repo techpalava/ODOGWU-HERITAGE --watch` (never `Start-Sleep` polling loops or timer turns).
- **Standard 3-PR Release Train (`--merge` only; no squash/rebase; never delete `main` or `production`; no admin override):**
  1. **Feature → `main`:** Ready + merge (`gh pr merge N --repo techpalava/ODOGWU-HERITAGE --merge --delete-branch=false`).
  2. **`main` → `production`:** Fetch `github`, verify `git diff --stat github/production...github/main`, open/check/merge `--merge`.
  3. **`production` → `main` (history sync):** Reuse open sync PR if present (title: `"Sync production release history back to main"`), check/merge `--merge`.
  4. **Parity & ancestry:** Confirm `github/main^{tree}` === `github/production^{tree}` and `git merge-base --is-ancestor github/production github/main` exits `0`.
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
- **Tiered `LIVING_PROJECT_STATE.md` cadence:**
  - Routine UI/copy/prompt releases: batch `LIVING_PROJECT_STATE.md` updates at milestone / end of day (do NOT spin up a 3-PR docs train per tiny fix).
  - High-risk / schema / rules / milestone releases: open a dedicated `docs/living-project-state-post-N` PR and run the 3-PR cycle. Keep `LIVING_PROJECT_STATE.md` concise by archiving old release paragraphs when it grows large.

---

## 5. Domain Gotchas Index (Pointers Only)

Read the matching section of `docs/DOMAIN_INVARIANTS.md` (and `docs/PRE_LAUNCH_CHECKLIST.md` for launch items) before editing:
- **Step 5 AG Popup Chain** → `DOMAIN_INVARIANTS.md §2`: `Add AG → Fabric → Design Style → Copy → stay on Step 5`; keyed by `garmentKey + occurrenceGeneration`; Change Fabric stops after save.
- **Step 7 Measurement People UX & Re-entry** → `DOMAIN_INVARIANTS.md §3–4`: solo first screen (`Add people` only), `Assign garments` after adding people; re-entry focuses blocking item with gold flash; session-only Fabric delta copy.
- **Canonical Authority, Pricing & Construction** → `DOMAIN_INVARIANTS.md §5`: exact physical occurrences, `TOTAL` vs `SURCHARGE` vs Fabric vs shipping vs COGS, replacement replaces former price, never invent COGS.
- **Measurements, Method Isolation & Persistence** → `DOMAIN_INVARIANTS.md §6`: profile-specific rules, active method isolation, body height ≠ garment length, absent vs valid empty vs malformed non-empty, fail-closed pre-normalizer audit.
- **Navigation, Modals, Summary, Fabric Capacity & Payments** → `DOMAIN_INVARIANTS.md §7`: canonical completion, move pricing block (don't copy), stock ≠ allocation capacity, server authority for payment/shipping, no unauthorized production writes/emails.
- **Protected Paths & Firestore Rules** → `DOMAIN_INVARIANTS.md §8`: `firestore.rules`, `src/store/useAppStore.ts`, `src/utils/step1CatalogueCoverage.ts`; `--dry-run` compile check first, deploy rules last.
- **AI Try-on** → Section 1 rule 9 above: prompt edits require version bump in `src/utils/aiTryOnGatewayContract.ts` and snapshot/pin updates.

---

## 6. Compact Report Templates

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
