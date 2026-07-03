# Architecture Refactor Report

## Previous Coupling
Previously, the system treated "Current Community Batch" and "Open for Orders" as the same concept. 
The function `getActiveBatch` in `src/utils/batchUtils.ts` (and its internal `processDynamicBatches`) restricted a batch from being the active batch unless its status was one of a few open recruitment phases (e.g., `OPEN`, `ALMOST_FULL`, `RECRUITING`, `FULL`).
Once a batch advanced into production states (like `PRODUCTION_STARTED`), it was stripped of its `isActive` flag. This resulted in the application passing `null` to the Hero component, forcing the Hero to drop its context and render a generic "Community Batch Registration Closed" placeholder, rather than displaying its native production lock UI.

## New Separation of Responsibilities
1. **Current Community Batch (`getCurrentCommunityBatch`)**: Determines which batch is currently taking place chronologically, regardless of whether it is recruiting or actively being manufactured.
2. **Order Eligibility (`BatchBusinessRules.canAcceptOrders`)**: A separate rule-engine check that determines whether that active batch can safely accept new customer orders based on capacity, status overrides, and deadlines.

## Current Community Batch Decision Flow
- **`processDynamicBatches`**: Now evaluates whether an auto-scheduled batch is in *any* active lifecycle state, including post-registration production states (`PRODUCTION_READY`, `PRODUCTION_STARTED`, `IN_PRODUCTION`, `QUALITY_CONTROL`, `PACKED`, `SHIPPED`, `ARRIVED_NETHERLANDS`, `READY_FOR_PICKUP`).
- **`getCurrentCommunityBatch`** (formerly `getActiveBatch`): Retrieves the batch that matches this criteria.
- **Result**: The community batch remains assigned as the "Current Community Batch" throughout its entire manufacturing and shipping journey, right up until the Timeline Manager activates the next upcoming batch.

## Order Eligibility Decision Flow
- **`BatchBusinessRules.canAcceptOrders`**: Retains strict order gating.
- We updated `isStatusClosed` inside this engine to recognize production states as strictly closed for new orders. 
- **Result**: The Hero component receives the active batch and queries `BatchBusinessRules`. Upon seeing that order eligibility is closed due to production, the Hero retains the batch context (Name, delivery window, total members) but adapts its CTA UI to correctly render the **"Locked & Sent to Lagos Ateliers"** state.

## Components Updated
- `src/utils/batchUtils.ts`: Refactored `processDynamicBatches` logic and renamed `getActiveBatch` to `getCurrentCommunityBatch`.
- `src/engine/BatchBusinessRules.ts`: Updated `isStatusClosed` evaluation array to securely lock production statuses.
- `src/App.tsx`, `src/components/DatabaseView.tsx`, `src/components/DesignStudioView.tsx`: Updated imports and implementation calls to use `getCurrentCommunityBatch`.

## Confirmation
The Timeline Manager (and its chronological state) remains the single source of truth for the platform. This refactor strictly decouples UI presentation rules from the underlying business workflow. No duplicate timeline logic was introduced.
