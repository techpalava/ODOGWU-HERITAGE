# Agent Instructions — ODOGWU HERITAGE

**Lazy-load model:** this file holds every daily rule. Do NOT read `FAST_EXECUTOR_GUIDE.md`, `LIVING_PROJECT_STATE.md`, or `docs/DOMAIN_INVARIANTS.md` in full by default.
- `docs/DOMAIN_INVARIANTS.md`: read ONLY the section for the subsystem you touch — `§2` Step 5 AG popup chain, `§3–4` Measurement People / Re-entry, `§5` Pricing/Construction, `§6` Measurements/Persistence, `§7` Modals/Summary/Capacity/Payments, `§8` Protected Paths & Firestore Rules.
- `FAST_EXECUTOR_GUIDE.md`: read only for releases, AI Try-On prompt changes, or risk-tier validation/reporting.
- `LIVING_PROJECT_STATE.md`: short current snapshot (locks, baseline test exceptions, open items) — open only the section you need. Launch items: `docs/PRE_LAUNCH_CHECKLIST.md`. Never read `docs/archive/` unless investigating a specific historical regression.

## 1. Hard Rules (Non-Negotiable)
- **Git remote:** `github` ONLY (`git fetch github`, `git push github ...`). Never use `origin`. Repo: `techpalava/ODOGWU-HERITAGE`.
- **Never edit on `main` or `production`.** Never run `git checkout`, `git reset`, `git restore`, `git clean`, or `git stash` in a shared/dirty checkout; never rebase, squash, amend published commits, force-push, delete a branch/worktree, switch away from dirty work, or push `production` onto `main`. Preserve unrelated inherited WIP.
- **Worktree isolation:** never branch off local `main`. Create a sibling worktree off fresh `github/main` — `pwsh -NoProfile -File scripts/newWorktree.ps1 -Slug <task-slug> -Branch <type>/<task-slug>`, or manually:
  `git fetch github main && git worktree add ../ODOGWU-HERITAGE-<task-slug> -b <type>/<task-slug> github/main`
  Confirm `git rev-parse HEAD` equals `git rev-parse github/main` before editing.
- **Domain wording invariant:** customer- and admin-visible text says `"Long Shirt"` and `"Nikka"` only — NEVER `"Kaftan"` or `"Knicker"` (internal keys such as `kaftan` stay unchanged).
- **Test string invariants:** never alter pinned test constants (e.g. `AI_TRY_ON_CONSENT_NOTICE` in `src/components/AiTryOnPhotoPanel.tsx`) unless explicitly instructed and updating all dependent suites. Never remove assertions, skip failures, or change expected results to get green output.
- **Scope & locks:** correct only the named defect. Never edit locked areas (payments/Stripe test mode, `/api/create-payment-intent`, `/api/charge-balance`, fabric pricing, `ODG-xxx` assignment, Step 3) unless the task names them. Full list: `LIVING_PROJECT_STATE.md` → "Do not change".
- **Vercel 12-function cap:** every non-`_`-prefixed file under `api/` is a serverless function and the project is at the cap — do not add route files.
- **AI Try-on prompts:** any wording edit in `src/server/aiTryOnPrompt.ts` needs the version bump + pin/snapshot updates in `FAST_EXECUTOR_GUIDE.md` §3.
- **Firebase, Stripe & secrets:** Firebase project `gen-lang-client-0614710868`; Stripe **test keys only**. Never commit `.env`/`.env.local`, print secrets/tokens/env values, submit real payments, or write real customer data. Deploy `firestore.rules` ONLY after the live app serves the matching release (`--dry-run` compile check first; `docs/DOMAIN_INVARIANTS.md` §8).
- **No unauthorized gates:** no commit, push, merge, or deploy without authorization. Visual approval stays `PENDING` until Xavier explicitly gives or waives it.

## 2. Windows PowerShell Tooling
- `rg` is NOT installed — use `git grep -n -e "pat1" -e "pat2" -- src/` (multiple `-e`, not `\|`; `git show github/main:<path>` for remote copies).
- No Vitest/Jest — run `npx tsx test_*.ts(x)` or `npm run test:*`; never `npx vitest` (it hangs downloading). Firebase-importing tests: `node scripts/tsxWithViteProductionFirebase.mjs <test>`.
- 1-command preflight: `git rev-parse --show-toplevel; git branch --show-current; git rev-parse HEAD; git status --short; git remote -v`.
- Multi-line PR bodies go in a file (`--body-file`); commit with two `-m` flags. No interactive git (`-i`), no Bash `\` continuations, no sleep loops.

## 3. Verification, CRLF & Release Gate
- Client/UI change: `npm run verify:fast` (`tsc --noEmit` + quiet Vite build; compact logs). Server/`api/` change: `npm run check:api-esm && npx tsc --noEmit && npm run build`. Compare against baseline exceptions in `LIVING_PROJECT_STATE.md`; run relevant focused `test_*` / `npm run test:*` suites.
- CRLF: `core.autocrlf` is true. Compare `git diff --numstat` vs `git diff --numstat --ignore-cr-at-eol`, run `git diff --check`, stage named paths only (never `git add .`/`-A`). Avoid literal `\n` in source regex assertions.
- Open PRs as **Draft PRs** against `main` (`gh pr create --draft --base main --head <branch>`). Batch approved feature PRs on `main` into ONE `main -> production` train: `pwsh -NoProfile -File scripts/releaseTrain.ps1 [-PrNumber N] [-DryRun]` (`--merge` only; details `FAST_EXECUTOR_GUIDE.md` §2).
- Do NOT append per-PR paragraphs to `LIVING_PROJECT_STATE.md` or run a docs-only 3-PR train for routine PRs; edit its snapshot only when active truth changes.

## 4. Universal Fabric Import Workflow
When an administrator asks to "upload this fabric", "identify this fabric", "add this fabric", or "create catalogue item" and provides an image:
1. Do NOT ask the user to manually fill out the UI, and do NOT write directly to the `fabrics` collection unless explicitly requested.
2. Resolve the local image path (in AI Studio, typically `src/assets/images/<filename>`; in local VS Code, use the user-provided local file path) and run:
   `npx -y tsx src/scripts/aiImportFabric.ts "<path-to-image>"`
3. Inform the user that the draft has been written to `fabric_drafts` and is ready for review in `DatabaseView.tsx` ("Save Fabric Settings").
