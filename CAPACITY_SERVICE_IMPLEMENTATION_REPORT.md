# Capacity Service Implementation Report

## Objective
Create a stable abstraction layer (`CapacityService`) to isolate the rest of the application from capacity calculation details, preparing the platform for the future Event-Sourced Capacity Ledger without disrupting existing functionality.

## Public API

The `CapacityService` provides the following stable, read-only API methods which can accept either a full `Batch` object, an `OrderContext`, or a raw `batchId` string:

- `getCapacitySummary(dataOrId)`: Returns a fully computed `BatchProgressSummary`.
- `getReservedCapacity(dataOrId)`: Returns the current number of reserved garments.
- `getRemainingCapacity(dataOrId)`: Returns the current number of available garments.
- `getTargetCapacity(dataOrId)`: Returns the total capacity target for the batch.
- `getCapacityStatus(dataOrId)`: Returns the capacity status enum (`OPEN`, `FULL`, `OVERCAPACITY`).
- `getCapacityBreakdown(dataOrId)`: Returns a structured breakdown object for ratio calculations.
- `isBatchFull(dataOrId)`: Boolean helper for checking if capacity limit is reached.
- `isCapacityAvailable(dataOrId)`: Boolean helper for checking if orders can be accepted based on availability.

## Components and Engines Updated

The following application layers were refactored to consume `CapacityService` and abandon direct property access (like `b.currentGarments` or `b.targetGarments`):

### Engines
- **BusinessIntelligenceEngine**: Updated to retrieve accurate reserved garments and remaining garments for global analytics and metrics.
- **BatchBusinessRules**: Updated the core `canAcceptOrders` rule evaluator to dynamically determine remaining capacity from the abstraction layer.

### UI Components
- **HomeView**: Replaced local capacity summations.
- **DashboardView**: Migrated timeline and progress bar UI states.
- **CustomOrderView**: Updated capacity presentation metrics.
- **DesignStudioView**: Updated capacity metrics in the active batch panel.
- **DatabaseView**: Safely converted display elements to use dynamic retrieval while preserving the native editable behavior for admin input forms.
- **App (Layout)**: Migrated global state variables dependent on active batch status.

## Dependency Diagram (After Refactor)

```text
┌───────────────┐
│  useAppStore  │ (State Management)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ CapacityService│ (Single Gateway)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  Business     │ (e.g. BatchBusinessRules,
│  Engines      │  BusinessIntelligenceEngine)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│     React     │ (e.g. DashboardView,
│  Components   │  CustomOrderView, HomeView)
└───────────────┘
```

## Before vs After Architecture

### Before
UI components and engines accessed raw data objects (`batch.currentGarments` and `batch.targetGarments`) directly, coupling the entire frontend tightly to the database schema. Various engines independently calculated progress ratios and remaining space, causing fragmented logic.

### After
UI components and engines are strictly decoupled from capacity fields. They request all values exclusively through `CapacityService`. Duplicate capacity logic was removed from presentation layers. The architecture is now "Ledger-Ready".

## Future Capacity Ledger Integration Strategy

Because all external systems now consume `CapacityService`, integrating the upcoming Capacity Ledger will require zero changes to UI components or business rules.

When Phase 5 or future expansions occur, the underlying `BatchProgressEngine` will simply be updated to aggregate events from the `CapacityLedger` sub-collection rather than reading `currentGarments` integers. The `CapacityService` interface will remain identical, resulting in an entirely backwards-compatible transition for the end-user.

## Validation Results

- **Single Gateway**: Verified `CapacityService` handles all capacity lookups.
- **Behavior Continuity**: Verified no UI structure, user flows, or database schemas were changed.
- **Linter Status**: Fully passing `tsc --noEmit`. No circular dependencies introduced.
- **Architectural Compliance**: Complies strictly with the directives in `ARCHITECTURE_STANDARDS.md` and `CAPACITY_ALLOCATION_STRATEGY.md`.
