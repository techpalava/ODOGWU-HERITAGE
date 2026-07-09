# Architectural Data Lineage Audit: "40 / 40 Garments"

## 1. Exact Source of "40 / 40"
The values displayed in the Homepage Hero originate directly from a specific Firestore `Batch` document (with the ID `batch-5` / "Gladiators", which was seeded from the `mockData.ts` file).

- **Numerator (40):** Sourced from the scalar field `currentGarments: 40` on `batch-5`.
- **Denominator (40):** Sourced from the scalar field `targetGarments: 40` on `batch-5`.

Neither of these values are currently computed from actual user interactions or the `orders` collection; they are static integers stored directly on the Batch document itself.

---

## 2. Complete Dependency Chain
The data flows from Firestore to the Hero Component through the following pipeline:

1. **Firestore Database (`batches` collection)**: The physical document `batch-5` stores the fields `currentGarments` and `targetGarments`.
2. **`src/services/storageService.ts` (`subscribeToCollection`)**: Fetches all batches dynamically from Firestore via `onSnapshot` without any explicit sorting (`orderBy`).
3. **`src/store/useAppStore.ts`**: Receives the raw batches and passes them through `processDynamicBatches` before committing them to the global Zustand state.
4. **`src/utils/batchUtils.ts` (`processDynamicBatches`)**: Iterates over the unsorted array of batches. It ignores `batch-1` through `batch-4` because their status is `COMPLETED`. `batch-5` has `status: "PRODUCTION_STARTED"`, which is considered a live state, so the function dynamically mutates the object to inject `isActive: true`.
5. **`src/utils/batchUtils.ts` (`getCurrentCommunityBatch`)**: Simply executes a `.find(b => b.isActive)` on the processed array and returns `batch-5`.
6. **`src/App.tsx`**: Calls `getCurrentCommunityBatch` to retrieve the `openBatch`. It maps the data into an `OrderContext` object named `activeCommunityBatch`. 
   - `openBatch.currentGarments` -> `activeCommunityBatch.currentMembers`
   - `openBatch.targetGarments` -> `activeCommunityBatch.expectedParticipants`
7. **`src/components/HomeView.tsx` (Hero Component)**: Receives `activeCommunityBatch` as a prop and renders:
   `{activeCommunityBatch.currentMembers} / {activeCommunityBatch.expectedParticipants} Garments`

---

## 3. Duplicate Calculations Found
The calculation `(currentGarments / targetGarments) * 100` to determine the progress percentage is duplicated across the architecture instead of utilizing a single engine:

1. **`src/engine/BatchBusinessRules.ts`**: Centralized logic calculating `completionPercentage`.
2. **`src/engine/BusinessIntelligenceEngine.ts`**: Isolated logic returning `Math.min(100, Math.round((batch.currentGarments / target) * 100))`.
3. **`src/components/DashboardView.tsx`**: Inline UI math `width: ${Math.min(100, (userBatch.currentGarments / userBatch.targetGarments) * 100)}%`.
4. **`src/components/CustomOrderView.tsx`**: Inline UI text `{batch.currentGarments} / {batch.targetGarments}`.
5. **`src/components/DatabaseView.tsx`**: Inline UI styling `width: ${Math.min(100, (b.currentGarments / b.targetGarments) * 100)}%` for admin progress bars.

(Fields like `dressesMade`, `newParticipants`, and `previousParticipants` were also scanned but are strictly isolated to `BatchManagementPanel.tsx` and unused globally).

---

## 4. Relationship with Display Order
The `displayOrder` field (defined in `types.ts` and `mockData.ts`) has **absolutely zero relationship** with the Hero statistics, garment totals, or active batch selection. 

Chronological bounds (`startDate` and `endDate`) are also largely ignored when determining the active batch. Because `subscribeToCollection` fetches batches without an `orderBy` clause, Firestore defaults to returning documents in Document ID ascending order. The engine blindly selects the *first* document in the array that matches a live status, making the active batch selection entirely dependent on random/alphabetical Document IDs rather than chronological timelines or `displayOrder`.

---

## 5. Hardcoded and Fallback Values Found
While the 40/40 Hero statistic uses real Firestore data, the "Global Community Impact" section lower down in `HomeView.tsx` uses a hardcoded fallback. 

It attempts to calculate the total global garments by reducing `b.currentGarments` across all batches:
```tsx
batches?.reduce((acc, b) => acc + (b.currentGarments || 0), 0) || (orders && orders.length > 0 ? orders.length : 30)
```
If the reduction fails or is empty, it falls back to the length of the `orders` array, and if the `orders` array is empty, it hardcodes `30`.

---

## 6. Single Source of Truth Assessment & Recommended Architecture

**Assessment:**
The current Single Source of Truth for garment progress is the explicit scalar field `currentGarments` on the `Batch` document. This is an architectural flaw because it relies on manual administrative updates rather than dynamic aggregation, risking misalignment between the displayed "Garments" and the actual number of paid `orders` in the system.

**Recommended Architecture:**
- **Numerator (`currentGarments`)**: Should not be manually edited. The application should derive this value dynamically by counting the number of non-cancelled documents in the `orders` collection where `batchId === activeBatch.id`. This ensures the UI is a direct reflection of real revenue and customer participation. This can be done via a Firestore Aggregation query or maintained automatically by a Cloud Function trigger.
- **Denominator (`targetGarments`)**: Should remain a manual scalar field on the `Batch` document, as this genuinely represents a physical constraint (e.g., factory capacity bounds).
- **Active Batch Selection**: The engine (`batchUtils.ts`) must be refactored to sort all live batches by `startDate` / `endDate` boundaries to deterministically identify the active batch, completely decoupling the platform from Firestore Document ID sorting behavior.
