# ODOGWU HERITAGE — Domain Invariants

> **Read only the section matching the subsystem you are editing.**

Deep subsystem rules extracted from `FAST_EXECUTOR_GUIDE.md` v6. Read only the section(s) relevant to the subsystem you are modifying.

---

## 1. General UX & Scope Boundaries

- **Ask before inventing ambiguous UX:** When product UX is ambiguous (labels, which modal opens next, whether a change path re-opens a later step, stay-on-stage vs navigate), ask the requester before implementing. Do not invent a flow from adjacent code alone.
- **No accidental scope expansion:** Do not redesign, rename stable IDs, duplicate registries, or fix unrelated debt. If a supposedly visual change needs persistence, pricing, or integration changes, report the expansion before editing locked areas.
- **Wording hard rule:** Customer- and admin-visible text must NEVER say `"Kaftan"` — always `"Long Shirt"` (internal key `kaftan` stays unchanged).

---

## 2. Step 5 Additional Garment Popup Chain

Confirmed product rule for Personalized Additions:
- **Happy path:** `Add AG` → `Fabric` popup → `Design Style` popup → `Custom Detail Copy` popup → remain on Step 5.
- **Session identity:** Keyed by `garmentKey + occurrenceGeneration` (never `"last selected"`).
- **Per-card actions:** Use the same machinery — missing state shows `"Add …"`; set state shows `"Change …"`.
- **Change Fabric:** Ends after fabric save (keep design + custom details). Do not reopen Design Style or Copy.
- **Add Fabric (missing):** Continues `Design Style` → `Copy` on Step 5.
- **Add/Change Design Style:** Design-only (fabric already required); after assign, `Copy` may open when the deferred prompt resolves.
- **Cancel:** Clears/advances the session without `Copy` and stays on Step 5.

---

## 3. Step 7 Measurement People UX

As shipped in `#361`:
- **Solo first screen:** `"These clothes are for you"` plus `Add people` only (no Assign strip).
- **Multi-person transition:** After `Add people` and `+ Add another person`, `Assign garments` appears; `Only for me` returns to solo.
- **Fit placement:** Male/Female fit stays on the measurement card for a sole wearer and on each person card when multiple people exist.

---

## 4. Contextual Re-entry Guidance

As shipped in `#367`:
- **Focus blocking item:** When the customer advances or stage-corrects while a dependent step is incomplete, land on that step and focus the blocking item — first unassigned Fabric garment card, or first incomplete Design Style occurrence — with a gold flash.
- **Do not dump at stage top:** The Design Style leftover fabric-capacity prompt is not the focus target.
- **Session-only delta copy:** Fabric upstream-delta copy is consume-once and session-only.

---

## 5. Canonical Authority, Ownership, Pricing & Construction

### Canonical Authority & Occurrence Ownership
- **Single rule engine:** Reuse canonical IDs, definitions, eligibility, prices, calculations, and mutation paths. A second visual section must not create a second business-rule engine.
- **Exact physical occurrences:** Preserve exact physical occurrences, including base and repeated/additional items. Never target by array position, display label, first match, or garment family when an exact key exists.
- **Scope separation:** Distinguish occurrence-owned, order-owned, person/shared, and method-specific state. Preserve intentionally shared authority; do not convert every field or addition into occurrence scope just because some other fields are scoped.
- **Isolation & sharing tests:** Test both isolation and legitimate sharing. Removing one occurrence must not wipe another's values or leave orphan selections, prices, or completion.

### Pricing & Construction
- **Classify every price:** Identify whether a price is a construction `TOTAL`, an option `SURCHARGE`, a Fabric charge, shipping, or internal sewing/COGS. Never guess an ambiguous price.
- **Replacement replaces former price:** Use the existing canonical pricing path. Selecting a replacement construction replaces its former price; it must not add the full construction price again. Test select, switch, deselect, reselect, repeated occurrences, removal, and reload.
- **Canonical derivation:** Preserve valid explicit construction choices over defaults according to the approved resolver. Derive prices from canonical authority rather than trusting persisted client cents. Do not change existing prices/defaults incidentally.
- **Invalid ID reconciliation:** Missing/inactive/invalid IDs use only a documented, approved reconciliation policy. A narrow invalid-option fallback does not authorize erasing a malformed order or a valid saved construction.
- **COGS integrity:** Missing sewing/COGS data is not an approved zero cost. Trace its consumers and classify actual impact before calling it non-blocking; never invent values.
- **Reporting accuracy:** Do not report `"pricing unchanged"` when selected-price authority changed merely because the numeric table stayed the same.

---

## 6. Measurement Requirements, Method Isolation & Persistence Fail-Closed

### Measurement Requirements & Input Sources
- **Separate requirement from source:** Distinguish what is required from how a value is supplied: manual entry, approved derivation, one-of alternative, or conditional input.
- **Dynamic definitions:** Reuse current garment/profile/construction definitions. An approximate count (e.g., `"about 26"`) is not a fixed universal field count.
- **Risk contracts:** Preserve released Low/Mid/High/Critical contracts unless explicitly changed. Do not restore a historical High-Risk Height-only override. Read current profile-specific manual requirements and Critical coverage rules.
- **No invented math:** Do not invent factors, copy another profile's factor, interpolate, introduce component arithmetic, or silently omit a factorless required measurement. Height-only support must check every relevant exact occurrence.
- **Conditionals & one-of groups:** Keep existing conditional classifications; do not make an unresolved field optional or mandatory merely to force completion. Required one-of groups are one unit per occurrence; either valid member satisfies the existing rule.
- **Validation:** Validate units and positive finite values through existing authority. A manual-only method must not acquire calculated values through a fallback.

### New Methods, Sections & Value Isolation
- **Separate placement, identity, policy, values:** Distinguish visual placement, selected method identity, reusable field policy, and stored input values. A separate method may reuse an existing planner without being serialized as that existing method.
- **Active method isolation:** Keep exactly one active method when choices are alternatives. Inactive values must not satisfy active requirements. Switching away and back preserves each method's own values without silent copying or overwriting.
- **UI hierarchy:** Respect requested hierarchy (e.g., a new section below a risk grid is not another card inside that grid). Keep selectors discoverable before long input forms. Use the shared field renderer, not duplicate independent forms/validation.
- **Measurement semantics:** Preserve measurement meaning — body height is not garment length; circumference is not flat width. Do not add width doubling, ease, shrinkage, or sample-to-body conversions without approved authority. Report incompatible meanings/scopes before persisting measurements under misleading existing keys.

### Persistence — Absent Is Not Malformed & Fail-Closed Recovery
- **Three-way state distinction:** Distinguish absent state, valid empty state, and malformed present state. Never convert malformed non-empty authoritative state into valid empty state that can autosave destructively.
- **Fail closed:** Unsafe data cannot be accepted or overwrite recoverable customer state. An uncaught crash alone is not proof of safe error handling. Use the existing controlled invalid-state/recovery boundary and audit write effects.
- **Additive compatibility:** For additive enum/key changes, inspect old readers/writers, missing new bags, unknown IDs, malformed present bags, and pre-normalization helpers. Retaining `schemaVersion` is acceptable only when compatibility is demonstrated; do not add migrations or bump versions automatically.
- **Pre-normalizer audit:** Inspect guest load, legacy migration, removal, and cleanup code that runs BEFORE the normalizer. A safe normalizer cannot protect a helper that crashes first.
- **Restore & recompute:** Restore entered authority, then recompute derived state as existing design requires. Preserve unrelated route bags and occurrence generations. Confirm idempotent reconciliation and no destructive autosave after rejection.
- **Reporting accuracy:** Do not report `"persistence unchanged"` solely because `schemaVersion` is unchanged — an added route/bag or changed reconciliation is a persistence compatibility change.

---

## 7. Navigation, Modals, Summary, Fabric Capacity & Payment Boundaries

### Navigation, Modals & Summary
- **Canonical completion:** Completion must derive from canonical state plus journey prerequisites, not a zero UI count, selected card, or local component boolean.
- **Count consistency:** Keep form/sidebar counts consistent without weakening occurrence diagnostics. Test missing → fill → clear → refill, back/forward, and reload.
- **Modal lifecycle:** Trace modal open, explicit selection, dismiss, accept, mutation, recompute, navigation, and remount. Do not add duplicate accept paths or timeout-based fixes for stale reopen loops.
- **Summary projection:** Summary is a projection of existing authority. Move a pricing block; do not copy it or recalculate its amounts. Inspect every caller before changing a shared summary component: permission for one step is not permission for all.
- **Stage ownership:** Preserve stage ownership and immutable submitted-order/payment boundaries. Do not renumber the journey while implementing an unrelated method or layout.

### Fabric Capacity & Payment/Shipping Boundaries
- **Stock vs allocation capacity:** Fabric stock and physical allocation capacity are different. Preserve allocation IDs, allocator authority, and valid unused capacity. Never force customers to fill spare capacity or choose the first eligible Fabric automatically.
- **Server authority for payment/shipping:** Payment and shipping use established server/trusted authority. Do not trust a browser-authored amount, paid flag, ownership, or pricing context as authority. Do not duplicate pricing in Summary or Payment Review.
- **No unauthorized production side effects:** Normal implementation/QA does not authorize real payments, order submission, stock reservation, customer emails, migrations, or privileged production writes.

---

## 8. Protected Paths & Firestore Rules Compile Check

Known persistent protected paths (inspect semantic diffs before touching; preserve unrelated changes):
- `firestore.rules`
- `src/store/useAppStore.ts`
- `src/utils/step1CatalogueCoverage.ts`

When a task changes `firestore.rules`:
1. **Compile check before release** (publishes nothing):
   ```powershell
   npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive --dry-run
   ```
2. **Deploy-last ordering rule:** Deploy `firestore.rules` ONLY AFTER the live app serves the matching release:
   ```powershell
   npx firebase deploy --only firestore:rules --project gen-lang-client-0614710868 --non-interactive
   ```
   Rules that require a field the live app does not send yet will reject customer saves.
