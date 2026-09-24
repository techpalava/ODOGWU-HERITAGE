# FAST EXECUTOR GUIDE: v5 Cursor Edition

ODOGWU HERITAGE — FAST EXECUTOR GUIDE v5
CURSOR EDITION — UPDATED REUSABLE STANDARD

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

Read the current Living Master Project State before substantial new work.
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
FAST EXECUTOR GUIDE: v5 Cursor Edition
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

Pending/failed required checks or an unexpected head: do not bypass the gate.
Use an exact-head merge guard where supported. No admin override, force push,
or unrequested squash/rebase. Never delete main or production as a PR head.

After merge, record the actual merge commit and verify the intended tree/delta.
A feature-tree equality check is valid only when the verified base/merge context
makes that equality expected; do not erase legitimate newer main content.

==================================================
20. RELEASE FLOW AND AUTHORIZATION
==================================================

Normal flow:
feature → PR to main → approved main merge → main-to-production PR
→ authorized production merge → verify → history sync when necessary.

Each write phase requires explicit permission. Creating a release PR does not
automatically authorize merging it or promoting a hosting deployment.

Release operations are mechanical: no implementation, refactor, new dependency,
fixture cleanup, or opportunistic fix. Compare the exact reviewed release delta
and recheck remote state. Stop on unexpected content or concurrent changes.

==================================================
21. HISTORY SYNC — USE ANCESTRY
==================================================

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

==================================================
23. RELOCK, MASTER STATE, AND FOLLOW-UPS
==================================================

Return completed, approved, committed implementation areas to LOCKED. They need
not remain editable merely because publication or domain verification is pending.
Unlock only for an explicit new request or proven directly related defect.

After major milestones, prepare an accurate Master checkpoint. Save it only to
the actual authorized Master location and verify the write.
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

Return a concise, evidence-based report using relevant fields only:

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
