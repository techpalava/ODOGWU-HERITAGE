# UX IMPROVEMENT 09 REPORT

## Objective
The goal was to display the next upcoming community batch inside the Design Studio Routing Panel when the current community batch is closed or unavailable, providing an explicit alternative for users wanting to join a community order.

## Resolution Steps
1. Validated that `OrderRoutingEngine` already computes `nextCommunityBatches` dynamically via `getNextUpcomingBatches()` from the Timeline Manager logic.
2. In `DesignStudioView.tsx`, within the Routing Presentation Card below the assurance messaging, checked if `routingDecision.nextCommunityBatches` has elements and `routingDecision.allowCommunitySubmission` is `false`.
3. Added a new rendering block that gracefully displays the next batch:
   - **Batch Name:** Fetched directly from the first element in the next community batches array.
   - **Registration Opens:** Uses `startDate` (or `registrationOpens` alias).
   - **Expected Delivery:** Uses `estimatedDelivery`.
   - **Current Capacity:** Displays `currentGarments / targetGarments` if a target is configured.
4. Hooked a new action `handleRoutingActionSelect("NEXT_BATCH")` to a new "Join Next Batch" CTA. The action falls back to configuring the `batchType` as `community` for continuity.

## Validation Results
- ✓ Users are gracefully informed of the upcoming community timelines, rather than hitting a dead end.
- ✓ No data is hardcoded; all attributes rely on the deterministic ordering of the Timeline Manager.
- ✓ The section naturally collapses if no future batches exist in the backend arrays.
