# Living project state

Updated: 2026-09-25. Read this file first. It exists only in this production checkout and is untracked.

## Status

Multiple Wearers is released. The customer flow is live on production. No further feature work is authorized.

## Git

- Feature: `8e936173d6ecedb723bb0961e5a4e15afa12d15f` on `feat/multiple-wearers-measurement-assignment`. Keep this branch.
- Main: `74fad474ec047d3533b8dd07a7a56c27c19415c2`
- Production: `a058a92b5ac6da8c885b4b5ab4ec30e8574d4324`
- Shared tree: `9512ad7e70120046d883837db191a3e8c18b12d7`
- `8e93617` is an ancestor of main and production. Main and production trees match. Commit SHAs differ.

## Live site

- Canonical URL: https://odogwu-heritage.vercel.app
- Deployment: `dpl_3QXWYHACyi1QsVoA2QCgdWTyBQmn`
- Vercel status: Ready, target production
- Deployment URL: https://odogwu-heritage-a3sa22qb1-techpalavabox-4019s-projects.vercel.app

## Live smoke

Passed on the canonical production site:

- People panel, fit controls, disabled placeholder, rejected-then-successful assignment
- Aggregate completion stays incomplete while one wearer is incomplete, and complete for both selections once both are complete
- Summary shows Chief / Standard Shirt / male and Ada / Standard Shirt 2 / female, with no raw garment keys
- Payment Review shows ownership and friendly method labels, with no schema error
- Reload restores wearers, assignments, methods, completion, and wearer ids
- 390px shows no critical overflow on People, Measurement, Summary, and Payment Review

Payment was not submitted.

Wearer ids from that smoke:

- Chief, male: `wearer-208f049a-a341-40a1-bd79-9a3127ad002f` assigned to Standard Shirt
- Ada, female: `wearer-4c8d947b-07d5-4756-88a1-85e062bed6fe` assigned to Standard Shirt 2

## Still open

Tailoring live QA: BLOCKED — NOT SAFELY ACCESSIBLE. Do not create or bypass admin access.

## Do not change

- Stored `calculationStatus` is a non-authoritative cache. The live UI recomputes Complete from entered values. Do not change persistence to stamp complete.
- Design Style catalogue headings may still say Shirt / Shirt 2. Step 3 stays locked.
- Do not delete the feature branch, rebase, squash, force-push, or start another production deploy.

## Not next

- A new feature
- A Step 3 heading change
- A dedicated production Firebase project (pre-launch, separate from this release)

## Where this file is

`C:\Users\techp\Documents\Codex\ODOGWU-HERITAGE-step3-exact-garment-labels\LIVING_PROJECT_STATE.md`

Open this checkout to read it. It is not on the feature worktree or the main worktree, and it is not committed.

## How the former reviewer worked

The Cursor agent was the executor. ChatGPT was the independent reviewer and did not implement. The user pasted each reviewer task into Cursor.

Each task named the model, the candidate SHA, the worktree, a hard do-not list, numbered work, and a numbered report. The executor answered those points and stopped.

Work moved in separate approvals: investigate or fix while uncommitted, then commit only after "APPROVED TO COMMIT", then push the feature branch only, then preview, then browser QA as report-only, then a controlled merge. A browser-QA turn did not fix defects. Commit messages were specified, and the previous SHA was not amended.

Before editing, the executor reported branch, HEAD, and `git status --short`. It stopped if `github/main` or `github/production` had moved, if a merge conflicted, or if a task gate failed.

## Improvements for the next reviewer

Use the same gates, with these tighter rules:

- Send one live task per message. Do not attach an older plan after a new task. Do not resend "implement the plan" for work that already finished. If two instructions conflict, the latest live task wins.
- Name the checkout in the first lines: feature `C:\Users\techp\Documents\Codex\ODOGWU-HERITAGE-multiple-wearers`, production `C:\Users\techp\Documents\Codex\ODOGWU-HERITAGE-step3-exact-garment-labels`, or main `C:\Users\techp\Documents\Codex\ODOGWU-HERITAGE-main-release`. The executor must confirm that path before editing.
- Keep Step 3 / Design Style locked unless the task names a Step 3 change. Shirt / Shirt 2 catalogue headings are a known low note, not a release defect.
- Do not reopen stored `calculationStatus`. It stays incomplete in the draft on purpose. Completion is recomputed at runtime.
- Remote is `github`, never `origin`. Main merges use `git merge --no-ff`. Production merges use `git merge --no-ff main` with message `Merge branch 'main' into production`. Trees stay identical. Commit SHAs differ.
- Do not rebase, amend, squash, cherry-pick, force-push, or delete `feat/multiple-wearers-measurement-assignment`.
- Do not submit payment. Do not invent an admin session. Tailoring stays blocked without one.
- Firebase-importing tests run through `node scripts/tsxWithViteProductionFirebase.mjs`. `npm run lint` is `tsc --noEmit`. In PowerShell, quote `SHA^{tree}`.
- Correct only the named defect. Preserve the accepted wearer architecture.
- After a release, read this file before assigning new work. Do not start a feature, deploy, or source change unless the user explicitly authorizes it.
