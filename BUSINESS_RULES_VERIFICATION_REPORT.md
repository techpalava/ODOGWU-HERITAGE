# Business Rules Verification Report

## Previous Behavior
The active batch card historically displayed its status relying primarily on raw stored string fields or purely time-based constraints, which led to contradictory states. For instance, a batch could display "40 / 40 Garments" (100% Complete) but simultaneously advertise itself as "OPEN FOR ORDERS" because the system lacked cross-referencing logic to dynamically check capacity against the configured `targetGarments`. In addition, users were able to proceed to the Design Studio to create new orders even when the batch was full.

## Updated Decision Logic
The business logic in `src/utils/batchUtils.ts` and UI views (`HomeView.tsx`, `DesignStudioView.tsx`, `DashboardView.tsx`) has been refactored to treat order availability as a derived property.
A batch is considered open for orders only when ALL the following strict conditions are met:
1. The batch is in an active date range (`now >= startDate && now <= endDate`).
2. `allowOrders` is not explicitly set to `false`.
3. Capacity is available (`currentGarments < targetGarments`).

If `currentGarments >= targetGarments`, the batch's dynamically assigned status code is upgraded to `"FULL"`.

## Order Availability Rules
When the capacity is reached:
- The UI card automatically overrides the display status and halts acceptances by marking registration as "Registration Closed" instead of "Open for Orders".
- The 'Join Batch' workflow dynamically locks itself to prevent users from bypassing the UI and placing an order in a full batch.
- Inside the Design Studio context, if the capacity limit evaluates to true, the user is transitioned out of the community route and forced into an `alone` (individual) order status, bypassing the full batch entirely.

## Timeline Interaction
The Active Batch mechanism (`getActiveBatch`) correctly retains the timeline as the single source of truth. Even when a batch is evaluated as `"FULL"`, it maintains its `isActive` flag in the master timeline stream. This ensures the batch remains securely loaded in memory as the "current period" until the explicit `endDate` expires. Upon expiration, the batch will shift to `"CLOSED"`, allowing the Timeline Manager to correctly and automatically cascade to the next eligible batch per scheduling rules without any manual overrides or human intervention.

## Edge Cases Handled
- **Off-by-One and Overbooking:** Capacity calculations are checked prior to finalizing the active timeline batch rules (`>= targetGarments`), immediately locking it and safely rejecting subsequent simultaneous submissions.
- **Null Safety on Migration:** Safely falls back to `0` for contexts missing `currentMembers` or `expectedParticipants`.
- **Manual Overrides:** The logic handles situations where an admin explicitly blocks order flow via `allowOrders: false` midway through an open enrollment, collapsing the status identically as if capacity was naturally reached.
- **Cross-Component Synchronization:** Because the lock is globally derived from the fundamental batch property and propagated to `OrderContext`, neither the Database Viewer, Dashboard Timeline, nor the Design Studio can display disparate states.

## Confirmation
It is confirmed that contradictory states, such as displaying "100% Complete" alongside "OPEN FOR ORDERS", can no longer occur in the customer-facing views or timeline management interface. The system now strictly complies with architectural standards requiring capacity-aware state determination.
