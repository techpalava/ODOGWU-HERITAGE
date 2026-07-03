# Hero Registration Status Diagnostic Report

## 1. Current Active Batch
- **Name:** Gladiators (Batch 5)
- **Status:** `PRODUCTION_STARTED`
- **Auto Schedule:** `AUTO` (implies `isAutoScheduled: true`)

## 2. Hero Data Source
- The Hero component (`HomeView.tsx`) receives its data via the `activeCommunityBatch` prop.
- This prop is passed down from `App.tsx`, which derives it by calling `getActiveBatch(batches)`.
- `getActiveBatch` calls `processDynamicBatches(batches)` to evaluate the state of all batches and find the one where `isActive === true`.

## 3. Business Rule Function Used
The decision path uses a two-step process:
1. **`processDynamicBatches()`** in `src/utils/batchUtils.ts` (determines which batch is assigned `isActive = true`).
2. **`BatchBusinessRules.canAcceptOrders()`** in `src/engine/BatchBusinessRules.ts` (if a batch is active, this determines whether to show the countdown or the "Locked & Sent to Lagos Ateliers" state).

## 4 & 5. Every Condition Evaluated & Actual Values
In `processDynamicBatches()`:
- `batch.isAutoScheduled`: `true` (Auto Schedule is AUTO)
- `batch.status`: `"PRODUCTION_STARTED"`
- `productionStates.includes(batch.status)`: `true` (Since it is in `productionStates`, its `newStatus` remains `"PRODUCTION_STARTED"` and is not overwritten by `canAcceptOrders`).
- **Condition for `isNowActive`:** 
  `newStatus === "OPEN" || newStatus === "RECRUITING" || newStatus === "ALMOST_FULL" || newStatus === "FULL"`
- **Actual Value:** `"PRODUCTION_STARTED" === "OPEN"` (False), etc.

Because `"PRODUCTION_STARTED"` is not included in the whitelist of eligible active statuses, `isNowActive` evaluates to **FALSE**.

## 6. Which condition caused "Registration Closed"
Because `isNowActive` is false for the Gladiators batch, `getActiveBatch(batches)` returns `undefined`. 
Consequently, `activeCommunityBatch` becomes `null` in `App.tsx`. 
The Hero component (`HomeView.tsx`) has a root-level ternary check:
`{activeCommunityBatch ? ( ... ) : ( <Community Batch Registration Closed> )}`
Since the batch is `null`, it falls back to the generic "Registration Closed" empty state.

## 7. Whether the Hero is behaving correctly
**Yes.** The Hero component is behaving correctly according to the data it receives. It receives `null`, so it safely displays the closed placeholder. It has rich UI for locked batches (e.g., "Locked & Sent to Lagos Ateliers"), but it never gets the chance to display it because the batch is filtered out before it reaches the component.

## 8. Where the issue lies
- **Synchronization / Business Rule Engine (`processDynamicBatches`)**: The core issue is in `src/utils/batchUtils.ts`. The auto-scheduling logic restricts `isActive` assignment only to open/recruiting phases. It explicitly discards production phases from being the "active" batch, which prevents the Hero from showing production progress.

## 9. Recommended Fix (Investigation Only)
To allow the Hero to display the "Locked & Sent to Lagos Ateliers" production UI:
1. **Update `processDynamicBatches`**: Add production states (like `"PRODUCTION_STARTED"`, `"PRODUCTION_READY"`) to the `isNowActive` whitelist condition so the batch remains the active community batch on the homepage while in production.
2. **Update `BatchBusinessRules.canAcceptOrders`**: Ensure that `isStatusClosed` evaluates to `true` when a batch is in a production state (e.g., add `"PRODUCTION_STARTED"`, `"PRODUCTION_READY"` to the closed array). This guarantees the Hero will render the locked production progress UI rather than accidentally showing an open countdown.
