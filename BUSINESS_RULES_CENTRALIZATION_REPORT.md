# Business Rules Centralization Report

## 1. Components Refactored
- **`src/engine/BatchBusinessRules.ts` (New)**: Created as the centralized utility handling all logic surrounding Batch workflows.
- **`src/components/HomeView.tsx`**: Replaced inline timestamp diff logic and status checks.
- **`src/components/DesignStudioView.tsx`**: Replaced duplicative validations (e.g. `currentMembers >= expectedParticipants` and manual end date bounds).
- **`src/components/CustomOrderView.tsx`**: Refactored logic restricting group joins.
- **`src/components/GalleryView.tsx`**: Transitioned manual status styling into a rule-derived `statusCode`.
- **`src/components/DashboardView.tsx`**: Migrated inline string comparators (e.g. `group.status === "OPEN"`) into native engine utilities (`canEditBatch`, `canJoinBatch`, `canCloseBatch`, `canDeleteBatch`, `canLeaveBatch`).
- **`src/utils/batchUtils.ts`**: Re-architected `processDynamicBatches` mapping loop to derive dynamic pipeline statuses safely via `BatchBusinessRules` while locking downstream production states.

## 2. Duplicate Logic Removed
- **Conditionals**: Removed disparate `currentGarments < targetGarments` checks and redundant interpretations of the `allowOrders` flag from UI components.
- **Timestamps**: Eradicated separate instances of `new Date(closingDate) < new Date()` parsing logic from Home, Design Studio, and Timeline engines.
- **Inline Rules**: Dashboard and UI logic containing `batch.status === 'x' || batch.status === 'y'` conditional sets have been eliminated in favor of unified policies.

## 3. New Business Rule Service Architecture
The new architecture relies on the static `BatchBusinessRules` class. All UI and pipeline managers forward raw batch data (either `Batch` or `OrderContext` structures) to methods like `canAcceptOrders(batch)`.

The service guarantees:
1. Normalization of data formats.
2. Synchronized processing of time constraints.
3. Accurate evaluation of structural capacity.
4. Consistent integration with the administration's boolean locks (`allowOrders`, `batchStatus`).
5. A structured result (`BatchEligibility`), standardizing the UI with safe metrics (`daysRemaining`, `displayLabel`) instead of simple booleans.

## 4. Decision Flow Diagram

```text
[ Incoming Request (User clicks "Join" or views Batch) ]
       │
       ▼
[ Component: DesignStudioView / HomeView / CustomOrderView ]
       │
       ▼
[ Call: BatchBusinessRules.canAcceptOrders(activeBatch) ]
       │
       ├──► 1. Normalizes batch dates and capacity
       ├──► 2. Assesses manual toggle (`allowOrders`)
       ├──► 3. Checks Timeline boundary (`now < startDate` or `now > endDate`)
       ├──► 4. Validates garments limit (`currentGarments >= targetGarments`)
       │
       ▼
[ Returns: BatchEligibility Object ]
       │  (e.g., { canAcceptOrders: false, statusCode: "BATCH_FULL", displayLabel: "Registration Closed" })
       │
       ▼
[ Component uses structured object to safely render locked states or accurate countdowns ]
```

## 5. Future Extension Points
The single `BatchBusinessRules.ts` class natively supports new centralized methods. Future methods added during this audit phase include:
- `canEditBatch(batch)`
- `canJoinBatch(batch)`
- `canDeleteBatch(batch)`
- `canCloseBatch(batch)`
- `canLeaveBatch(batch)`

As workflow requirements increase (e.g. `canCompleteProduction()`, `canGenerateProductionReport()`), developers only need to append logic in this single file. 

## 6. Performance Impact
- **DOM Stability**: Reduces expensive re-rendering computations across components that previously calculated individual time states.
- **Lower Surface Area**: UI tests no longer need to assert complex mock dates and arrays for every screen since the core logic exists exclusively in the engine module.

## 7. Maintainability Improvements
Modifications to how "Open" or "Closed" is defined in the business logic will be O(1). If an administrator later requests a new constraint (e.g., a "VIP Only" flag), adding it inside `BatchBusinessRules.canAcceptOrders` will immediately and seamlessly protect all frontend entry points. 

## 8. Confirmation
**Order eligibility is now determined from a single authoritative business rule.** No localized variations of "is full" or "is closed" exist within the standard UI paths. The platform architecture has successfully decoupled presentation behavior from underlying business rule determinations.
