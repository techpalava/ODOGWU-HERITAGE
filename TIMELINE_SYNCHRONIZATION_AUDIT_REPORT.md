# Timeline Synchronization Audit Report

## Components Audited
- `src/components/HomeView.tsx`
- `src/components/DesignStudioView.tsx`
- `src/components/DashboardView.tsx`
- `src/components/CustomOrderView.tsx`
- `src/App.tsx`
- `src/utils/batchUtils.ts`

## Components Refactored
- `src/components/HomeView.tsx`: Completely rebuilt the countdown mechanism to derive directly from the central `activeCommunityBatch` instead of managing internal `useState` integers. Replaced static state arrays with standard Date-based computations that auto-update.
- `src/App.tsx`: Enriched the `activeCommunityBatch` reference via the Timeline Manager logic (by extending the `OrderContext` interface with `allowOrders` and `batchStatus`) so that children components receive complete validation constraints.
- `src/components/DesignStudioView.tsx`: Integrated the derived centralized batch state (`allowOrders`, `batchStatus`) alongside existing target garments checks, ensuring users cannot bypass the `OPEN` rules if a batch becomes closed/locked on the Timeline.

## Duplicate Logic Removed
- Eliminated the local hardcoded `days` (17), `hours` (8), and `minutes` (14) `useState` mechanism from `HomeView.tsx`.
- Removed reliance on component-specific "Is closed" boolean evaluations that did not verify `allowOrders` or Timeline `status` directly against the global batch state.

## Previous Inconsistencies Resolved
- Previously, a batch could display "40 / 40 Garments" and "100% Complete" but still report "Open for Orders" due to disparate checks. The checks across all views now unanimously check the capacity and `batchStatus`.
- The countdown on the active batch card was statically ticking down from 17 days, irrespective of the genuine batch end date in the Timeline Manager. The countdown is now accurately calculated as `batch.endDate - new Date()`.
- "Registration Closed" now globally takes precedence over "Open for Orders" instantly when the underlying Timeline batch reaches full capacity or passes its end date.

## Countdown Calculation Method
The countdown now exclusively uses the `endDate` strictly defined by the Timeline Manager:
1. `now = new Date()` (updated every minute via a central interval in the view)
2. `endDate = new Date(activeCommunityBatch.closingDate)`
3. The remaining time difference is calculated in milliseconds `endDate.getTime() - now.getTime()`.
4. Values are dynamically grouped and floored into exact `Days`, `Hours`, and `Minutes`.
This explicitly prevents any caching, hardcoding, or duplicate states.

## Order Availability Decision Logic
The unified rule for order availability ("OPEN FOR ORDERS") guarantees it only displays when ALL following constraints evaluate true:
- Timeline Date is within the Active Window (`now >= startDate && now <= endDate`).
- Timeline Toggle `allowOrders` is explicitly `true` (or unset fallback `!== false`).
- Timeline capacity `currentGarments < targetGarments`.
- `batchStatus` resolves strictly to `"OPEN"`.
If any constraint evaluates false (e.g. `currentGarments >= targetGarments`), the system actively computes `isClosed = true`, rendering `"Registration Closed"` and enforcing workflow locks.

## Confirmation
This audit confirms that the **Timeline Management module is now the single and exclusive source of truth** for all batch-related data. 
No separate versions of batch timelines, availability statuses, countdown variables, or hardcoded states exist in the customer-facing views. All calculations inherit directly from the centralized `batches` timeline stream.
