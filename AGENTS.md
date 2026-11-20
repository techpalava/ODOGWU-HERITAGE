# Agent Instructions — ODOGWU HERITAGE

Read `FAST_EXECUTOR_GUIDE.md`, `LIVING_PROJECT_STATE.md`, and `docs/DOMAIN_INVARIANTS.md` before non-trivial changes. Remaining launch items: `docs/PRE_LAUNCH_CHECKLIST.md`.

## 1. Hard Engineering & Environment Rules (Non-Negotiable)
- **Git remote:** Use `github` ONLY (`git fetch github`, `git push github ...`). Never use `origin`.
- **Parallel-safe worktree isolation:** Never run `git checkout`, `git reset`, or `git stash` in a shared/dirty checkout. Always create a dedicated sibling worktree off `github/main`:
  `git fetch github main && git worktree add ../ODOGWU-HERITAGE-<task-slug> -b <type>/<task-slug> github/main`
  Confirm `git rev-parse HEAD` equals `git rev-parse github/main` before editing.
- **Windows PowerShell tooling:**
  - `rg` is NOT installed — use `git grep -n -e "pat1" -e "pat2" -- src/`.
  - `vitest` is NOT installed — run standalone test scripts with `npx tsx test_*.ts(x)` or `npm run test:*`.
- **Domain wording invariant:** Customer- and admin-visible text must NEVER say `"Kaftan"` — always use `"Long Shirt"`.
- **Test string invariants:** Never alter pinned test constants (such as `AI_TRY_ON_CONSENT_NOTICE` in `src/components/AiTryOnPhotoPanel.tsx`) unless explicitly instructed and updating all dependent suites.

## 2. Verification, CRLF & Release Gate
- Chain typecheck and build in a single command (no sleep loops):
  `npx tsc --noEmit && npx vite build --configLoader runner`
- Run all relevant `npx tsx test_*.ts(x)` / `npm run test:*` suites for touched modules.
- Check line-ending hygiene before committing: compare `git diff --numstat` vs `git diff --numstat --ignore-cr-at-eol`, run `git diff --check`, and stage named paths only (`git add <file1> <file2>`).
- Open PRs as **Draft PRs** against `main` (`gh pr create --draft --base main --head <branch>`). Production releases follow the 3-PR `--merge` train (`feature -> main`, `main -> production`, `production -> main` back-merge).

## 3. Universal Fabric Import Workflow
When an administrator asks to "upload this fabric", "identify this fabric", "add this fabric", or "create catalogue item" and provides an image:
1. Do NOT ask the user to manually fill out the UI, and do NOT write directly to the `fabrics` collection unless explicitly requested.
2. Resolve the local image path (in AI Studio, typically `src/assets/images/<filename>`; in local VS Code, use the user-provided local file path) and run:
   `npx -y tsx src/scripts/aiImportFabric.ts "<path-to-image>"`
3. Inform the user that the draft has been written to `fabric_drafts` and is ready for review in `DatabaseView.tsx` ("Save Fabric Settings").
