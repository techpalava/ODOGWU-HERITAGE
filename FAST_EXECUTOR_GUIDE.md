# FAST EXECUTOR GUIDE: v6 Cursor Edition

ODOGWU HERITAGE — FAST EXECUTOR GUIDE v6
CURSOR EDITION — UPDATED REUSABLE STANDARD

==================================================
0. QUICK START FOR A NEW CHAT
==================================================

1. Read LIVING_PROJECT_STATE.md: product, journey, what is live, locks,
   known baseline failures, and the active worktree.
2. Confirm where you are, using the worktree as the working directory:
   git rev-parse --show-toplevel
   git branch --show-current
   git status --short
   git fetch github
   The Cursor workspace folder may be a different checkout from the worktree.
3. Find the task. It is usually an attached plan in C:\Users\techp\.cursor\plans\
   with todos already created. Do not edit the plan file or recreate the todos.
   Mark each todo in progress as you start it, and finish all of them.
4. Pick the nearest tests from package.json before editing (section 3A).
5. Know the gates: merge only after checks pass, verify the live build, and
   deploy Firestore rules last (sections 19 to 22).

Ten things that most often go wrong:
1. Wrong checkout: confirm the worktree path before the first edit.
2. Remote is github, never origin.
3. Firebase tests fail under plain tsx: use the wrapper (section 3A).
4. CRLF noise: stage named paths only; never git add . or -A.
5. Literal "\n" source assertions fail locally on CRLF; that is not a regression.
6. Merging while a check is pending: wait until gh pr checks exits 0.
7. Rules deployed before the live app sends the new fields.
8. A new file under api/ breaks the 12-function Vercel cap.
9. Editing locked areas (payment intents, fabric pricing, ODG-xxx, Step 3)
   without the task naming them.
10. Calling a release live without /api/health and a live chunk check.
11. Merging on a stale PR head: after push, confirm
    `gh pr view N --json headRefOid` equals the pushed SHA before treating
    green checks as mergeable (GitHub can briefly still show the old head).
12. Treating Vercel SSO / Deployment Protection on a preview as a hosting
    failure: that is NOT VERIFIED access, not a broken deploy (section 16).

ROLE
Cursor is the controlled implementation executor for the currently authorized
phase. This is a mature project, not a greenfield application.

WORKFLOW
Verify target → identify authority → smallest correct change → focused tests
→ relevant live QA → required approvals → authorized checkpoint/publication
→ authorized release verification → relock.

This guide is not an active task or permission to edit, commit, push, or deploy.
Keep task-specific branches, SHAs, ports, and business changes in a separate
current task block. A historical handoff does not automatically resume its task.

==================================================
1. SOURCE OF TRUTH AND AUTHORIZATION
==================================================

Read the current Living Master Project State before substantial new work. It is
LIVING_PROJECT_STATE.md at the repository root, committed on main and production.
Use the newest explicit client instruction to change only the authority it
actually addresses. Use current source, tests, and runtime evidence to establish
implementation behavior; code behavior alone does not settle business intent.

Separate VERIFIED facts, REPORTED claims, historical context, and UNKNOWNS.
If the Master is missing, report what was searched and use a clearly marked
provisional handoff. Do not invent a Master or claim it was saved.

A newer layout instruction supersedes the older layout, not unrelated rules.
A pasted APPROVED reviewer report is not automatically visual approval, commit
authorization, merge authorization, or deployment authorization.

Act within the authorized phase without repeatedly asking permission for routine
steps. Stop at the next unauthorized gate or a genuine authority conflict.

==================================================
2. DECLARE THE SESSION CONTEXT
==================================================

Every task handoff must specify:

ROLE: Executor / Reviewer / QA / Release operator
MODEL: Recommended model and actual configured model, if different
REASONING: Low / Medium / High / Extra High as supported
CHAT: Fresh / Continue, with a short task title
FAST EXECUTOR GUIDE: v6 Cursor Edition
REPOSITORY: techpalava/ODOGWU-HERITAGE
WORKTREE: Exact absolute path
BRANCH: Exact branch
BASELINE HEAD: Full verified SHA
WORKING TREE: Clean / Known WIP / Mixed task and unrelated changes
REMOTE: github, after verifying its URL
TASK: Exact customer outcome and acceptance criteria
AUTHORIZED PHASE: Explicit allowed operations
COMMIT / PUSH / MERGE / DEPLOY: Separate permissions, normally NO

Do not invent model availability or silently change the worktree or baseline.
Use a fresh chat for a new subsystem or confused/long session; continue the
existing chat for a direct correction to the same task.

==================================================
3. PREFLIGHT — READ BEFORE WRITE
==================================================

In PowerShell, inspect:

Get-Location
git rev-parse --show-toplevel
git worktree list
git branch --show-current
git rev-parse HEAD
git status --short
git diff --name-status
git diff --cached --name-status
git diff --stat
git diff --cached --stat
git ls-files --others --exclude-standard
git diff --check
git diff --cached --check
git remote -v

When remote state matters, verify the remote first, then:

git fetch github
git rev-parse github/main

Inspect command failures; do not treat missing output as successful proof.
Quote PowerShell revision expressions such as "HEAD^{tree}".

For a pinned task, an unexpected HEAD/base requires investigation before edits.
For an explicitly current-main task, establish and record the actual approved
baseline. Do not silently move inherited WIP onto another base.

==================================================
3A. ENVIRONMENT FACTS
==================================================

Shell is PowerShell on Windows:
- Use single-quoted rg patterns: rg -n 'foo\(bar\)' src
- rg does not expand bare globs on Windows: use rg -n 'x' -g 'test_*' .
- Quote revision expressions: git rev-parse 'HEAD^{tree}'
- Commit with two -m flags (title, then body). No interactive git (-i).
- Put multi-line PR bodies in a file and pass it:
  gh pr create ... --body-file "$env:TEMP\pr-body.md"
- Long output is fine; do not pipe through head/tail only to shorten it.

Tools:
- The Cursor Grep/Glob tools search the Cursor workspace, which may not be the
  task worktree. Use rg in the shell with the worktree as working directory.

Tests and type-check:
- npm run lint is tsc --noEmit. Compare errors with the known baseline in
  LIVING_PROJECT_STATE.md.
- Tests that import Firebase need the Vite production Firebase mode:
  node scripts/tsxWithViteProductionFirebase.mjs test_name.ts
  Prefer the matching npm run test:* script when one exists.
- Other tests run with npx tsx test_name.ts(x).

Line endings:
- core.autocrlf is true and the working copy is CRLF while the index is LF.
  Many files show as modified with CRLF-only differences.
- Before staging, compare:
  git diff --numstat -- <paths>
  git diff --numstat --ignore-cr-at-eol -- <paths>
  A file with changes only in the first output is CRLF noise: do not stage it.
- Source assertions that search for a literal "\n" fail locally on CRLF and pass
  on CI's LF checkout. Prefer whitespace-agnostic regexes in new assertions.

Platform limits:
- Vercel functions: every file under api/ (except _-prefixed helpers) is a
  function. The project is at the 12-function cap. Do not add one.
- Firebase project gen-lang-client-0614710868. Stripe test keys only.

==================================================
4. WORKTREE AND UNRELATED-WORK SAFETY
==================================================

For new tasks, use the authorized feature branch/worktree. Do not implement on
main or production. Inspect an existing destination before creating anything.

For inherited WIP, inspect staged, unstaged, and untracked content. Determine
what is finished, unfinished, unrelated, and already validated. Preserve it.
Do not demand a clean checkout or recreate the implementation from scratch.

Never automatically reset, restore, clean, stash, rebase, force-push, delete a
branch/worktree, or switch away from dirty work.

Protect every unrelated change. Known persistent protected paths include:
- firestore.rules
- src/store/useAppStore.ts
- src/utils/step1CatalogueCoverage.ts

Inspect semantic diffs before touching protected paths. A task requiring a path
does not authorize discarding unrelated changes within it. Add any other paths
identified in the current Master or preflight to the protection list.

When a task changes firestore.rules:
- Check it compiles before release (publishes nothing):
  npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive --dry-run
- Deploy only after the live app sends the new fields (section 22):
  npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive
- Rules that require a field the live app does not send yet will reject saves.

Do not expose secrets, tokens, environment values, or real customer data in
prompts, screenshots, reports, fixtures, or commits.

==================================================
5. SCOPE, LOCKS, AND THE SMALLEST PLAN
==================================================

Every task must declare:
TEMPORARILY UNLOCKED: exact presentation/authority boundaries allowed to change.
STILL LOCKED: adjacent features and integration contracts that must not change.

Trace only what the task needs:
source of truth → identity/scope → mutation → persistence/restore → projection
→ completion/navigation → summary/pricing → nearest protected journey.

State a concise implementation plan and expected file boundaries. Implement
incrementally with focused validation between independent parts.

Do not redesign, rename stable IDs, duplicate registries, or fix unrelated debt.
A helper extraction is acceptable when it avoids duplication within scope.
An approved plan does not need another architecture pass merely to start work.

If a supposedly visual change needs persistence, pricing, or integration changes,
report the necessary expansion before editing those locked areas.

==================================================
6. RISK AND REVIEW LEVEL
==================================================

LOW: copy, isolated CSS, non-authoritative ordering.
MEDIUM: grouped presentation, responsive interaction, isolated visibility.
HIGH: pricing, persisted state, hydration, Measurement completion, Fabric,
occurrence identity, authentication/payment, migrations, cross-step state,
concurrency, or irreversible customer/order actions.

Classify by actual effect, not the number of changed files.
Use independent review when risk warrants it, especially high-risk authority
work. Routine copy/CSS/isolated visual changes do not require a second reviewer.
A task-specific mandatory review gate still applies.

Discovering a higher risk is not permission for a rewrite. Re-scope only the
necessary boundary and add proportionate tests/review.

==================================================
7. CANONICAL AUTHORITY AND OWNERSHIP
==================================================

Reuse canonical IDs, definitions, eligibility, prices, calculations, and mutation
paths. A second visual section must not create a second business-rule engine.

Preserve exact physical occurrences, including base and repeated/additional
items. Do not target by array position, display label, first match, or garment
family when an exact key exists.

Distinguish occurrence-owned, order-owned, person/shared, and method-specific
state. Preserve intentionally shared authority; do not convert every field or
addition into occurrence scope just because some other fields are scoped.

Test both isolation and legitimate sharing. Removing one occurrence must not
wipe another's values or leave orphan selections, prices, or completion.

==================================================
8. PRICING AND CONSTRUCTION
==================================================

Identify whether a price is a construction TOTAL, an option SURCHARGE, a Fabric
charge, shipping, or internal sewing/COGS. Do not guess an ambiguous price.

Use the existing canonical pricing path. Selecting a replacement construction
replaces its former price; it must not add the full construction price again.
Test select, switch, deselect, reselect, repeated occurrences, removal, and reload.

Preserve valid explicit construction choices over defaults according to the
approved resolver. Derive prices from canonical authority rather than trusting
persisted client cents. Do not change existing prices/defaults incidentally.

Missing/inactive/invalid IDs use only a documented, approved reconciliation
policy. A narrow invalid-option fallback does not authorize erasing a malformed
order or a valid saved construction.

Missing sewing/COGS data is not an approved zero cost. Trace its consumers and
classify the actual impact before calling it non-blocking; never invent values.

==================================================
9. MEASUREMENT REQUIREMENTS AND INPUT SOURCES
==================================================

Separate what is required from how a value is supplied:
manual entry, approved derivation, one-of alternative, or conditional input.

Reuse current garment/profile/construction definitions. An approximate count
such as "about 26" is not a fixed universal field count.

Preserve the released Low/Mid/High/Critical contracts unless explicitly changed.
Do not restore a historical High-Risk Height-only override. Read the current
profile-specific manual requirements and Critical coverage rules.

Do not invent factors, copy another profile's factor, interpolate, introduce
component arithmetic, or silently omit a factorless required measurement.
Height-only support must check every relevant exact occurrence.

Keep existing conditional classifications. Do not make an unresolved field
optional or mandatory merely to force completion. Required one-of groups are
one unit per occurrence; either valid member satisfies the existing rule.

Validate units and positive finite values through existing authority. A method
that is manual-only must not acquire calculated values through a fallback.

==================================================
10. NEW METHODS, SECTIONS, AND VALUE ISOLATION
==================================================

Distinguish visual placement, selected method identity, reusable field policy,
and stored input values. A separate method may reuse an existing planner without
being serialized as that existing method.

Keep exactly one active method when choices are alternatives. Inactive values
must not satisfy active requirements. Switching away and back preserves each
method's own values without silent copying or overwriting.

Respect the requested hierarchy. A new section below a risk grid is not another
card inside that grid. Keep selectors discoverable before long input forms.
Use the shared field renderer, not duplicate independent forms/validation.

Preserve measurement meaning: body height is not garment length; circumference
is not flat width. Do not add width doubling, ease, shrinkage, or sample-to-body
conversions without approved authority. Report incompatible meanings/scopes
before persisting measurements under misleading existing keys.

==================================================
11. PERSISTENCE — ABSENT IS NOT MALFORMED
==================================================

Distinguish absent state, valid empty state, and malformed present state.
Never convert malformed non-empty authoritative state into valid empty state
that can autosave destructively.

Fail closed means unsafe data cannot be accepted or overwrite recoverable
customer state. An uncaught crash alone is not proof of safe error handling.
Use the existing controlled invalid-state/recovery boundary; audit write effects.

For additive enum/key changes, inspect old readers/writers, missing new bags,
unknown IDs, malformed present bags, and pre-normalization helpers. Retaining
a schema version is acceptable only when compatibility is demonstrated.
Do not add migrations or bump versions automatically.

Inspect guest load, legacy migration, removal, and cleanup code that runs BEFORE
the normalizer. A safe normalizer cannot protect a helper that crashes first.

Restore entered authority, then recompute derived state as the existing design
requires. Preserve unrelated route bags and occurrence generations. Confirm
idempotent reconciliation and no destructive autosave after rejection.

==================================================
12. NAVIGATION, MODALS, AND SUMMARY
==================================================

Completion must derive from canonical state plus journey prerequisites, not a
zero UI count, selected card, or local component boolean.

Keep form/sidebar counts consistent without weakening occurrence diagnostics.
Test missing → fill → clear → refill, back/forward, and reload.

Trace modal open, explicit selection, dismiss, accept, mutation, recompute,
navigation, and remount. Do not add duplicate accept paths or timeout-based
fixes for stale reopen loops.

Summary is a projection of existing authority. Move a pricing block; do not
copy it or recalculate its amounts. Inspect every caller before changing a
shared summary component: permission for one step is not permission for all.

Preserve stage ownership and immutable submitted-order/payment boundaries.
Do not renumber the journey while implementing an unrelated method or layout.

==================================================
13. FABRIC AND PAYMENT BOUNDARIES
==================================================

Fabric stock and physical allocation capacity are different. Preserve allocation
IDs, allocator authority, and valid unused capacity. Never force customers to
fill spare capacity or choose the first eligible Fabric automatically.

Payment and shipping use established server/trusted authority. Do not trust a
browser-authored amount, paid flag, ownership, or pricing context as authority.
Do not duplicate pricing in Summary or Payment Review.

Normal implementation/QA does not authorize real payments, order submission,
stock reservation, customer emails, migrations, or privileged production writes.

==================================================
14. BASELINE AND PROPORTIONATE VALIDATION
==================================================

Identify the nearest protected customer journey. Establish its baseline before
editing when practical and rerun the same path afterward.

For clean tasks: record the exact baseline and focused pre-change result.
For WIP: distinguish committed baseline from inherited dirty validation.
Do not reset WIP to prove an old test result.

Minimum ordinary checks:
- affected focused tests;
- nearest relevant regression;
- lint/typecheck;
- git diff --check.

Add pricing/summary, hydration, navigation, security/emulator, build, or Critical
Journey Regression Firewall checks when affected or required by the task.
Do not run every historical suite after every small edit. A multi-file new
Measurement method warrants broader focused restore/navigation coverage.

Use package.json and established runners. Do not invent script names.
After material changes, rerun affected checks against the CURRENT WIP.

==================================================
15. TEST QUALITY AND BASELINE FAILURES
==================================================

Prove customer transitions, negative cases, exact ownership, and output values;
not only labels or arrays that mirror the implementation.

Old-data fixtures must genuinely omit newly added fields. Do not create them
through current constructors that automatically supply those fields.

Do not remove assertions, skip failures, or change expected results merely to
obtain green output. Small directly related fixture/harness corrections within
scope may be made with evidence and reported explicitly.

A baseline-failure claim requires reproduction at the baseline or equivalent
specific evidence of the same mechanism. An untouched test can still regress.

Report a suite that fails as FAIL, even when targeted new assertions passed.
A proven unrelated baseline failure may be an accepted exception; it is not a
suite PASS. Missing mandatory coverage remains a gate, not an assumed success.

==================================================
16. LIVE QA AND ENVIRONMENT
==================================================

For material client-visible work, use a preview serving the exact intended
worktree. Record URL/origin, branch, HEAD, and relevant WIP.

Vercel preview URLs often sit behind Deployment Protection / team SSO. Cursor
browser automation cannot complete that login. Prefer production post-merge
proof (section 22), or a preview Xavier has already authenticated in the Cursor
browser. If SSO blocks access, report NOT VERIFIED — that is an evidence gap,
not proof the preview failed to build.

Do not assume localhost serves the newest branch. Do not terminate another
project's server, change server configuration, or start duplicates needlessly.
A port collision is an environment issue; record the verified replacement.

Reach a stable journey through legitimate prerequisites. Do not force internal
completion flags and call that end-to-end QA.

Use isolated local/staging test data. Do not clear real customer drafts or
assume a fresh browser prevents backend writes. Check the target environment
before interactions that can save orders or affect inventory.

Test relevant desktop, approximately 768px, and 390px layouts. Check keyboard
selection, visible labels, controls, empty state, grouping, and overflow.
Test select/switch/clear/reload, representative mixed orders, and repeated
occurrences where the changed contract depends on them.

Step 7 Measurement people UX (as shipped in #361): first screen is solo —
"These clothes are for you" plus Add people only (no Assign strip). After Add
people and + Add another person, Assign garments appears; Only for me returns
to solo. Male/Female fit stays on the measurement card for a sole wearer and on
each person card when multiple people exist.

Report NOT RUN or PARTIAL for missing cases. Unit tests are not browser proof.
A supported construction path not exercised live remains a stated limitation.

==================================================
17. APPROVALS AND INDEPENDENT REVIEW
==================================================

User visual approval and technical review are separate. Keep visual approval
PENDING until Xavier explicitly gives it or explicitly waives that gate.
Do not fill an approval field with APPROVED in advance.

For high-risk work, use an independent read-only reviewer who tries concrete
counterexamples. Prefer a fresh reviewer chat; continue it for a focused delta.
Self-review is not independent review.

Approval attaches to exact WIP/SHA and scope. Record the file set and untracked
files for WIP review. A later correction requires proportionate delta/full
review. A repeated old WIP report is not published PR verification.

High-risk publication should verify the exact pushed checkpoint against the
reviewed evidence. Do not repeat a broad audit unnecessarily when exact identity
and a focused publication check can establish that nothing changed.

==================================================
18. CHECKPOINT AND STAGING
==================================================

Commit only when explicitly authorized and applicable acceptance, validation,
visual, and independent-review gates are satisfied.

Before staging:
git status --short
git diff --name-status
git diff --cached --name-status
git diff --stat
git ls-files --others --exclude-standard
git diff --check

Stage exact task-owned paths/hunks only. Do not use git add . or git add -A.
A file shared with unrelated WIP needs hunk-level scope review.

Then:
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check

Commit only the approved content with the agreed title. Do not include cleanup,
secrets, debug output, test artifacts, or an unreviewed last-minute fix.

Return the full SHA and committed files. Task changes should be checkpointed;
pre-existing unrelated changes may remain and must be reported, not erased to
make the tree appear clean.

==================================================
19. PUBLICATION AND MERGE GATES
==================================================

Publish only when authorized. Verify local and remote feature SHAs match.
Every PR handoff includes a title, body, explicit repository/base/head, exact
checkpoint SHA, expected delta, validation, and known exceptions.

Use PowerShell-compatible commands, not Bash backslash continuations.
Inspect installed CLI support before relying on a flag. Do not leave unresolved
placeholders in commands presented as ready to execute.

Check for an existing matching PR before creating another.
Immediately before merge, recheck exact head/base, file/content scope, conflicts,
and actual required checks. An aggregate merge-state label alone is not a full
explanation of individual check results.

After `git push`, GitHub can briefly still report the previous `headRefOid`.
Confirm `gh pr view N --repo techpalava/ODOGWU-HERITAGE --json headRefOid`
equals the SHA you just pushed before starting the check-gated merge loop.
Green checks on a stale head are not a pass.

Pending/failed required checks or an unexpected head: do not bypass the gate.
Use an exact-head merge guard where supported. No admin override, force push,
or unrequested squash/rebase. Never delete main or production as a PR head.

Check-gated merge (PowerShell). gh pr checks exits 0 only when every check
passed, and 8 while any is pending. A watcher that drops its network connection
proves nothing, so poll and merge only on exit 0:

$n = 123
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 30
  $out = gh pr checks $n --repo techpalava/ODOGWU-HERITAGE 2>&1
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  if ($LASTEXITCODE -eq 1 -and ($out -match 'fail')) { break }
}
$out
if ($ok) { gh pr merge $n --repo techpalava/ODOGWU-HERITAGE --merge --delete-branch=false }

After merge, record the actual merge commit and verify the intended tree/delta.
A feature-tree equality check is valid only when the verified base/merge context
makes that equality expected; do not erase legitimate newer main content.

==================================================
20. RELEASE FLOW AND AUTHORIZATION
==================================================

Normal flow, all through GitHub PRs with merge commits (no local merges into
main or production; the local main/production worktrees may be stale):

1. Feature PR:
   git push github <feature-branch>
   gh pr create --repo techpalava/ODOGWU-HERITAGE --base main --head <feature-branch> --title "<title>" --body-file "$env:TEMP\pr-body.md"
2. Release PR:
   gh pr create --repo techpalava/ODOGWU-HERITAGE --base production --head main --title "Release <what> to production" --body "Releases PR #N: <summary>."
3. Sync PR (reuse an open one; the title is exact):
   gh pr list --repo techpalava/ODOGWU-HERITAGE --state open --base main --head production
   gh pr create --repo techpalava/ODOGWU-HERITAGE --base main --head production --title "Sync production release history back to main" --body "Brings the production release merge for PR #N back into main."

Merge each PR with the check-gated loop in section 19, in that order.
Record each merge commit with:
gh pr view N --repo techpalava/ODOGWU-HERITAGE --json state,mergeCommit

Each write phase requires explicit permission. Creating a release PR does not
automatically authorize merging it or promoting a hosting deployment. An approved
plan whose todos include the release authorizes the steps it lists, each still
gated on passing checks.

Release operations are mechanical: no implementation, refactor, new dependency,
fixture cleanup, or opportunistic fix. Compare the exact reviewed release delta
and recheck remote state. Stop on unexpected content or concurrent changes.

After the feature→production→sync cycle finishes, update the Living Master
(and Fast Executor when the session taught a reusable rule) on a dedicated
branch named `docs/living-project-state-post-N`, then run the same three-PR
cycle. Do not fold Master edits into the feature PR, and do not commit docs
from a dirty feature worktree that still holds unrelated WIP.

==================================================
21. HISTORY SYNC — USE ANCESTRY
==================================================

The sync PR in section 20 is the normal mechanism. Use this check to confirm
the cycle is complete, or to decide whether a sync PR is still needed.

After fetch, compare the branch trees and run:

git diff --exit-code github/main github/production
$contentExit = $LASTEXITCODE

git merge-base --is-ancestor github/production github/main
$ancestryExit = $LASTEXITCODE

contentExit 0 and ancestryExit 0:
Production is already included in main; no further sync needed.

contentExit 0 and ancestryExit 1:
History sync may be needed; create/reuse a production-to-main PR only when
that operation is authorized and the expected heads/scope are verified.

Other results:
Inspect differences/errors; do not repair automatically or call them PASS.

After sync, differing SHAs are normal if main has the sync merge commit.
Tree equality plus production ancestry ends the cycle. No repeated sync PR.

==================================================
22. DEPLOYMENT EVIDENCE IS SEPARATE
==================================================

Report these separately:
1. implementation/test/review complete;
2. merged to main;
3. merged to production branch;
4. history synchronized;
5. deployment build successful for the reviewed release;
6. customer-domain assignment verified;
7. live smoke test verified/not run.

A successful preview, a branch name, an environment label, or a unique deployment
URL alone does not establish that the customer domain serves the release.
Verify actual source commit/tree, environment, and current domain assignment.

If login/access prevents proof, say NOT VERIFIED. That is an evidence gap, not
proof of a hosting failure. Do not redeploy, promote, roll back, install privileged
tooling, or change branch/domain settings without separate authorization.

Do not claim LIVE while customer-domain evidence is missing. Report behavior
verification separately even when deployment assignment is confirmed.

Live verification for this project (after the production merge):

$prod is the production merge SHA (the merge commit of the main→production
release PR). It is not the feature-branch merge into main, and not the
production→main sync merge. `/api/health` `buildId` must equal that production
merge SHA.

$prod = '<production merge SHA>'
for ($i = 0; $i -lt 20; $i++) {
  $h = Invoke-RestMethod 'https://odogwu-heritage.vercel.app/api/health'
  if ($h.buildId -eq $prod) { break }
  Start-Sleep -Seconds 15
}
$h | ConvertTo-Json -Compress

Then confirm a live chunk contains a string from the change (customer-visible
copy from the feature, not an internal identifier):

$needle = '<string from the change>'
$base = 'https://odogwu-heritage.vercel.app'
$html = (Invoke-WebRequest "$base/" -UseBasicParsing).Content
$entry = [regex]::Match($html, '/assets/index-[^"]+\.js').Value
$js = (Invoke-WebRequest "$base$entry" -UseBasicParsing).Content
$chunks = [regex]::Matches($js, 'assets/[A-Za-z0-9_.-]+\.js') | ForEach-Object Value | Sort-Object -Unique
$found = @($chunks | Where-Object { (Invoke-WebRequest "$base/$_" -UseBasicParsing).Content.Contains($needle) })
if ($js.Contains($needle)) { $found += $entry }
"found in: $($found -join ', ')"

Only after both pass, deploy firestore.rules if the release changed them
(section 4). Docs-only releases need no live chunk check.

==================================================
23. RELOCK, MASTER STATE, AND FOLLOW-UPS
==================================================

Return completed, approved, committed implementation areas to LOCKED. They need
not remain editable merely because publication or domain verification is pending.
Unlock only for an explicit new request or proven directly related defect.

After major milestones, prepare an accurate Master checkpoint. Save it only to
the actual authorized Master location (LIVING_PROJECT_STATE.md, released like
code) and verify the write. Prefer branch `docs/living-project-state-post-N`
after the feature release cycle (section 20), not a commit on the feature
branch. Update Status live build SHA, the new PR bullet, the live-chunk needle,
and the do-not-reuse branch list. Include Fast Executor changes in that same
docs PR when the session taught a reusable rule.
MASTER UPDATE: SAVED / PREPARED ONLY / NOT AVAILABLE.

Keep feature completion, integration locks, release status, and deployment
verification distinct. Do not silently create competing Masters.

Carry deferred tasks forward without starting them. Do not claim a related old
defect is resolved just because a new helper might affect it; require evidence.
No promise of background monitoring or future reminders without an actual
supported mechanism.

==================================================
24. STOP CONDITIONS AND FINAL REPORT
==================================================

STOP for a real authority ambiguity, unexpected target/WIP, unsafe persisted
state handling, unauthorized migration/production write, missing mandatory gate,
or a required change to a locked pricing/security/identity/integration boundary.

Do not stop repeatedly for routine TypeScript errors, safe in-scope helper work,
or minor test-harness repairs already authorized by the task.

Report to the user in plain language first:
- the outcome in the first sentence (what is now true, or what blocked it);
- what changed, in a few bullets of complete sentences;
- checks run, with any failure named and explained (a known baseline exception
  is still reported, not called a pass);
- release links (PRs as markdown links), live build SHA, rules deploy;
- the one thing the user should verify next.

Use the fields below as a checklist when the task is high risk or the user asks
for the structured report; include only the fields that apply:

STATUS: IMPLEMENTED / PARTIAL / BLOCKED / CHECKPOINTED / other actual phase
TASK AND INTERPRETATION
BASELINE / ACTUAL HEAD / BRANCH / WORKTREE
IMPLEMENTATION AND AUTHORITY SOURCES
FILES CHANGED: production / tests / configuration
AUTHORITY IMPACT: actual behavior, keys, prices, schemas, scopes changed
TESTS: exact commands, PASS/FAIL, accepted baseline exceptions
NEAREST PROTECTED JOURNEY: before/after
LIVE QA: URL, cases, widths, PASS/PARTIAL/NOT RUN
VISUAL APPROVAL: PENDING/APPROVED/EXPLICITLY WAIVED
INDEPENDENT REVIEW: REQUIRED/PENDING/APPROVED/NOT REQUIRED
REAL REMAINING RISKS: defect / authority gap / QA limit / baseline / follow-up
GIT: staged, committed, pushed, merged, unrelated WIP preserved
RELEASE/DEPLOYMENT: separate evidence levels, if relevant
LOCK STATUS
MASTER UPDATE: SAVED/PREPARED ONLY
NEXT AUTHORIZED GATE

Do not report “persistence unchanged” solely because schemaVersion is unchanged:
an added route/bag or changed reconciliation is a persistence compatibility change.
Do not report “pricing unchanged” when selected-price authority changed merely
because the numeric table stayed the same.

Do not commit, push, merge, or deploy unless that phase is explicitly authorized.

END — REUSABLE CORE GUIDE
